/*
 * Minimal QR encoder for the result-screen docs link.
 * Byte mode, error correction L, versions 1-5 (up to 106 chars), fixed mask 0.
 * Verified module-for-module against the python `qrcode` reference library
 * (see scripts/verify_qr.py). Returns an SVG string.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QR = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Error correction level L, versions 1-5: [data codewords, ec codewords] — single block.
  var CAPACITY = { 1: [19, 7], 2: [34, 10], 3: [55, 15], 4: [80, 20], 5: [108, 26] };
  var ALIGN_POS = { 1: null, 2: 18, 3: 22, 4: 26, 5: 30 };

  // GF(256), polynomial 0x11D
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function rsGenerator(degree) {
    var poly = [1];
    for (var d = 0; d < degree; d++) {
      var next = new Array(poly.length + 1).fill(0);
      for (var i = 0; i < poly.length; i++) {
        next[i] ^= gfMul(poly[i], EXP[d]);
        next[i + 1] ^= poly[i];
      }
      poly = next;
    }
    return poly; // highest-degree coefficient first is poly[poly.length-1]? built low->high below
  }

  function rsEncode(data, degree) {
    var gen = rsGenerator(degree);
    var rem = new Array(degree).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ rem[0];
      rem.shift();
      rem.push(0);
      if (factor !== 0) {
        for (var j = 0; j < degree; j++) {
          // gen is built with leading coefficient at the end; gen[degree - j] aligns terms
          rem[j] ^= gfMul(gen[degree - 1 - j], factor);
        }
      }
    }
    return rem;
  }

  function toUtf8(str) {
    var out = [];
    var enc = encodeURIComponent(str);
    for (var i = 0; i < enc.length; i++) {
      var c = enc.charAt(i);
      if (c === '%') { out.push(parseInt(enc.substr(i + 1, 2), 16)); i += 2; }
      else out.push(c.charCodeAt(0));
    }
    return out;
  }

  function buildCodewords(bytes, version) {
    var dataLen = CAPACITY[version][0];
    var bits = [];
    function push(val, n) { for (var i = n - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    push(4, 4);             // byte mode
    push(bytes.length, 8);  // char count (8 bits for versions 1-9)
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);
    // terminator + pad to byte boundary
    var maxBits = dataLen * 8;
    push(0, Math.min(4, maxBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    var data = [];
    for (var b = 0; b < bits.length; b += 8) {
      var v = 0;
      for (var k = 0; k < 8; k++) v = (v << 1) | bits[b + k];
      data.push(v);
    }
    var pads = [0xec, 0x11], p = 0;
    while (data.length < dataLen) data.push(pads[p++ % 2]);
    return data.concat(rsEncode(data, CAPACITY[version][1]));
  }

  // BCH(15,5)-protected format info for EC level L (bits 01) + given mask.
  function formatBits(mask) {
    var data = (0x1 << 3) | mask; // L = 01
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }

  function buildMatrix(version, codewords, mask) {
    var N = version * 4 + 17;
    var m = [], fn = []; // module values, function-pattern flags
    for (var r = 0; r < N; r++) { m.push(new Array(N).fill(false)); fn.push(new Array(N).fill(false)); }

    function set(r, c, v) { m[r][c] = v; fn[r][c] = true; }

    function finder(r, c) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= N || cc < 0 || cc >= N) continue;
        var on = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        set(rr, cc, on);
      }
    }
    finder(0, 0); finder(0, N - 7); finder(N - 7, 0);

    var ap = ALIGN_POS[version];
    if (ap) {
      for (var dr = -2; dr <= 2; dr++) for (var dc = -2; dc <= 2; dc++) {
        set(ap + dr, ap + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
      }
    }

    for (var t = 8; t < N - 8; t++) {
      if (!fn[6][t]) set(6, t, t % 2 === 0);
      if (!fn[t][6]) set(t, 6, t % 2 === 0);
    }

    set(N - 8, 8, true); // dark module

    // Reserve + write format info (bit 14 = MSB first).
    var fb = formatBits(mask);
    function fbit(i) { return ((fb >> i) & 1) === 1; }
    // copy 1, around top-left finder
    var c1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];
    // copy 2, split bottom-left / top-right
    var c2 = [[N-1,8],[N-2,8],[N-3,8],[N-4,8],[N-5,8],[N-6,8],[N-7,8],[8,N-8],[8,N-7],[8,N-6],[8,N-5],[8,N-4],[8,N-3],[8,N-2],[8,N-1]];
    for (var i = 0; i < 15; i++) {
      set(c1[i][0], c1[i][1], fbit(14 - i));
      set(c2[i][0], c2[i][1], fbit(14 - i));
    }

    // Zigzag data placement, mask applied as we go.
    var bitIdx = 0, total = codewords.length * 8;
    function nextBit() {
      if (bitIdx >= total) return false;
      var v = ((codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
      bitIdx++;
      return v;
    }
    var upward = true;
    for (var col = N - 1; col > 0; col -= 2) {
      if (col === 6) col = 5;
      for (var step = 0; step < N; step++) {
        var row = upward ? N - 1 - step : step;
        for (var side = 0; side < 2; side++) {
          var cc2 = col - side;
          if (fn[row][cc2]) continue;
          var bit = nextBit();
          if ((row + cc2) % 2 === 0) bit = !bit; // mask 0
          m[row][cc2] = bit;
        }
      }
      upward = !upward;
    }
    return m;
  }

  function encode(text) {
    var bytes = toUtf8(text);
    var version = null;
    for (var v = 1; v <= 5; v++) {
      if (bytes.length <= CAPACITY[v][0] - 2) { version = v; break; }
    }
    if (!version) throw new Error('QR payload too long (max 106 bytes): ' + text);
    return buildMatrix(version, buildCodewords(bytes, version), 0);
  }

  function svg(text, sizePx) {
    var m = encode(text);
    var N = m.length, quiet = 4, dim = N + quiet * 2;
    var rects = [];
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      if (m[r][c]) rects.push('<rect x="' + (c + quiet) + '" y="' + (r + quiet) + '" width="1" height="1"/>');
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + ' ' + dim + '" width="' + sizePx + '" height="' + sizePx + '" shape-rendering="crispEdges">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="#fff"/>' +
      '<g fill="#000">' + rects.join('') + '</g></svg>';
  }

  return { encode: encode, svg: svg };
});
