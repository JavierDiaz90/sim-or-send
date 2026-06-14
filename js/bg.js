/*
 * Ambient background: a slow-drifting node network on canvas, treated like
 * terminal telemetry. Capped at ~30fps and ~90 nodes; rAF pauses automatically
 * when the kiosk tab is hidden.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('bg-net');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var W = 0, H = 0;
  var nodes = [];
  var LINK_DIST = 150;

  function seed() {
    var count = Math.min(90, Math.round((W * H) / 22000));
    nodes = [];
    for (var i = 0; i < count; i++) {
      nodes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 1 + Math.random() * 1.8,
        warm: Math.random() < 0.08,
      });
    }
  }

  function resize() {
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  var last = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (t - last < 33) return; // ~30fps is plenty for ambience
    last = t;

    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < -10) n.x = W + 10; else if (n.x > W + 10) n.x = -10;
      if (n.y < -10) n.y = H + 10; else if (n.y > H + 10) n.y = -10;
    }

    ctx.lineWidth = 1;
    for (var a = 0; a < nodes.length; a++) {
      for (var b = a + 1; b < nodes.length; b++) {
        var dx = nodes[a].x - nodes[b].x;
        var dy = nodes[a].y - nodes[b].y;
        var d2 = dx * dx + dy * dy;
        if (d2 < LINK_DIST * LINK_DIST) {
          var alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.14;
          ctx.strokeStyle = 'rgba(53,255,141,' + alpha.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(nodes[a].x, nodes[a].y);
          ctx.lineTo(nodes[b].x, nodes[b].y);
          ctx.stroke();
        }
      }
    }

    for (var k = 0; k < nodes.length; k++) {
      var p = nodes[k];
      ctx.fillStyle = p.warm ? 'rgba(255,209,102,.48)' : 'rgba(45,226,255,.46)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
