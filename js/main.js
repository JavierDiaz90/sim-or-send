/* SIM OR SEND — kiosk game flow. State machine over the screens in index.html. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function fmtUsd(v) {
    var sign = v < 0 ? '-' : '';
    return sign + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
  }
  function fmtUsdSigned(v) { return (v >= 0 ? '+' : '-') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US'); }
  function fmtEth(usd, price) { return (usd / price).toFixed(2) + ' ETH'; }
  function fmtPct(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }

  /* ---------- tiny synth (no assets) ---------- */

  var Sound = (function () {
    var ctx = null;
    function ensure() {
      if (!CONFIG.sound) return null;
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function tone(freq, dur, type, vol, when) {
      var c = ensure();
      if (!c) return;
      var t = c.currentTime + (when || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur);
    }
    return {
      unlock: ensure,
      tick: function () { tone(1100, 0.05, 'square', 0.05); },
      send: function () { tone(220, 0.25, 'sawtooth', 0.1); tone(440, 0.18, 'sawtooth', 0.08, 0.06); },
      win: function () { tone(660, 0.12, 'sine', 0.12); tone(880, 0.16, 'sine', 0.12, 0.1); tone(1320, 0.3, 'sine', 0.1, 0.2); },
      fail: function () { tone(160, 0.5, 'sawtooth', 0.16); tone(110, 0.7, 'sawtooth', 0.14, 0.12); },
      alarm: function () { tone(740, 0.14, 'square', 0.1); tone(740, 0.14, 'square', 0.1, 0.22); tone(740, 0.14, 'square', 0.1, 0.44); },
      scan: function () { tone(520, 0.08, 'sine', 0.06); },
    };
  })();

  /* ---------- per-round flavour ---------- */

  var ROUNDS = [
    {
      title: 'MAINNET SWAP',
      route: ['Ethereum', 'Uniswap V3', 'Curve tricrypto', 'ETH'],
      rateShift: 0,
    },
    {
      title: 'CROSS-CHAIN ROUTE',
      route: ['Ethereum', 'Stargate bridge', 'Arbitrum', 'Camelot', 'ETH'],
      rateShift: 0.0008,
    },
    {
      title: 'VOLATILE MARKET',
      route: ['Aggregated', '4 venues', 'split fill', 'ETH'],
      rateShift: -0.0011,
    },
  ];

  var EVENT_COPY = {
    overquote: {
      icon: 'ERR_PRICE',
      title: 'OVERQUOTE',
      send: function (sev) { return 'Execution returned <b>' + sev.toFixed(1) + '% less</b> than quoted. What you saw was not what you got.'; },
      caught: function (sev, dodged) { return 'OVERQUOTE DETECTED — quoted output ' + sev.toFixed(1) + '% above true execution. Route rejected and re-quoted. You just dodged a <b>' + fmtUsd(dodged) + '</b> shortfall.'; },
    },
    decay: {
      icon: 'ERR_STALE',
      title: 'QUOTE DECAY',
      send: function (sev) { return 'Stale route — the quote decayed before execution. Filled <b>' + sev.toFixed(1) + '% under</b> quote.'; },
      caught: function (sev, dodged) { return 'STALE ROUTE DETECTED — quote no longer matches live state. Route replayed and re-priced. You just dodged a <b>' + fmtUsd(dodged) + '</b> shortfall.'; },
    },
    malicious: {
      icon: 'ERR_CALLDATA',
      title: 'MALICIOUS PAYLOAD',
      send: function (sev) { return 'A hidden approval in the calldata <b>drained ' + sev.toFixed(0) + '%</b> of your funds.'; },
      caught: function (sev, dodged) { return 'HIDDEN APPROVAL DETECTED — route rejected and re-routed. You just dodged a <b>' + fmtUsd(dodged) + '</b> drain.'; },
    },
    policy: {
      icon: 'ERR_POLICY',
      title: 'POLICY BREACH',
      send: function (sev) { return 'Route touched a <b>sanctioned venue</b>. Funds frozen — ' + sev.toFixed(0) + '% unrecoverable.'; },
      caught: function (sev, dodged) { return 'SANCTIONED VENUE IN ROUTE — blocked before any signature. You just dodged a <b>' + fmtUsd(dodged) + '</b> freeze.'; },
    },
  };
  var FAIL_FOOT = 'Enso Quote Simulator would have caught this before it reached your signer.';

  var SCAN_ITEMS = [
    'Previewing expected output & balance changes',
    'Replaying route against live state',
    'Inspecting calldata — approvals, recipients, fees',
    'Applying policy context — venues & sanctions',
  ];

  /* ---------- host demo hook ----------
   * Booth staff can rig the next round from the browser console to demo a
   * specific failure mode: SIMORSEND.forceNext('malicious')
   * Events: clean | overquote | decay | malicious | policy | opt
   */
  var forcedEvent = null;

  function takeForcedRoll() {
    if (!forcedEvent) return null;
    var ev = forcedEvent;
    forcedEvent = null;
    var mid = function (range) { return (range[0] + range[1]) / 2; };
    var roll = { event: ev, severityPct: 0, routeOptPct: 0 };
    if (ev === 'opt') { roll.event = 'clean'; roll.routeOptPct = mid(CONFIG.routeOpt.range); }
    else if (ev === 'overquote') roll.severityPct = mid(CONFIG.severity.overquote);
    else if (ev === 'decay') roll.severityPct = mid(CONFIG.severity.decay);
    else if (ev === 'malicious') roll.severityPct = CONFIG.severity.maliciousDrainPct;
    else if (ev === 'policy') roll.severityPct = CONFIG.severity.policyFreezePct;
    return roll;
  }

  window.SIMORSEND = {
    forceNext: function (ev) { forcedEvent = ev; return 'next round rigged: ' + ev; },
  };

  /* ---------- state ---------- */

  var game = null;
  var timers = [];
  var idleTimer = null;
  var busy = false; // guards double taps during overlays

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function every(fn, ms) { var t = setInterval(fn, ms); timers.push(t); return t; }
  function clearTimers() {
    timers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    timers = [];
  }

  function show(screenId) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.remove('active'); });
    $(screenId).classList.add('active');
  }

  function overlay(html, cls) {
    var ov = $('overlay');
    ov.className = 'overlay' + (cls ? ' ' + cls : '');
    ov.innerHTML = html;
  }
  function hideOverlay() {
    var ov = $('overlay');
    ov.className = 'overlay hidden';
    ov.innerHTML = '';
  }

  function armIdleReset() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { toAttract(); }, CONFIG.idleResetSeconds * 1000);
  }
  function disarmIdleReset() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  /* ---------- attract / name / brief ---------- */

  function toAttract() {
    clearTimers();
    hideOverlay();
    disarmIdleReset();
    game = null;
    busy = false;
    show('screen-attract');
  }

  function toName() {
    $('input-name').value = '';
    $('input-name').classList.remove('invalid');
    $('input-name').removeAttribute('aria-invalid');
    $('name-error').textContent = '';
    $('input-contact').value = '';
    $('input-contact').style.display = CONFIG.leadCapture === 'off' ? 'none' : '';
    show('screen-name');
    armIdleReset();
  }

  function startGame() {
    var name = $('input-name').value.trim().toUpperCase().slice(0, 14);
    var contact = $('input-contact').value.trim();
    if (!name) {
      $('input-name').classList.add('invalid');
      $('input-name').setAttribute('aria-invalid', 'true');
      $('name-error').textContent = 'ERROR: display name is required before execution.';
      $('input-name').focus();
      return;
    }
    if (CONFIG.leadCapture === 'required' && !contact) {
      $('input-contact').focus();
      $('input-contact').placeholder = 'REQUIRED to enter the leaderboard';
      return;
    }
    $('input-name').classList.remove('invalid');
    $('input-name').removeAttribute('aria-invalid');
    $('name-error').textContent = '';
    disarmIdleReset();
    game = {
      name: name,
      contact: contact,
      value: CONFIG.startingUsd,
      round: 0,
      history: [],
      remainingMs: 0,
      sendCount: 0,
      stats: { sends: 0, sendHits: 0, dodges: 0, dodgedUsd: 0 },
      ts: Date.now(),
    };
    brief();
  }

  function brief() {
    show('screen-brief');
    var n = CONFIG.briefSeconds;
    $('brief-count').textContent = n;
    var iv = every(function () {
      n--;
      if (n <= 0) { clearInterval(iv); startRound(0); return; }
      $('brief-count').textContent = n;
      Sound.tick();
    }, 1000);
  }

  /* ---------- rounds ---------- */

  var roundState = null;

  function quoteEthOut() {
    // Display-only: current portfolio at the displayed rate, minus visual decay.
    var rate = roundState.displayPrice;
    return (game.value / rate) * (1 - roundState.decayPenalty / 100);
  }

  function renderQuote() {
    var rate = roundState.displayPrice;
    var out = quoteEthOut();
    $('q-from').textContent = Math.round(game.value).toLocaleString('en-US') + ' USDT';
    $('q-out').textContent = out.toFixed(2) + ' ETH';
    $('q-rate').textContent = '1 ETH = $' + rate.toFixed(2);
    $('q-expected').textContent = out.toFixed(4) + ' ETH (' + fmtUsd(out * rate) + ')';
    $('q-gas').textContent = '$' + CONFIG.gasUsdByRound[game.round].toFixed(2);
    var exp = $('q-expected');
    exp.className = 'v' + (roundState.decayPenalty > 0 ? ' shift' : '');
  }

  function startRound(r) {
    clearTimers();
    hideOverlay();
    busy = false;
    game.round = r;
    var spec = ROUNDS[r];
    var decayCfg = CONFIG.quoteDecay[r] || { expirySeconds: 0, refreshPenaltyPct: 0 };

    roundState = {
      deadline: Date.now() + CONFIG.roundSeconds * 1000,
      roll: takeForcedRoll() || Engine.rollRound(Math.random, CONFIG),
      decayPenalty: 0,
      decayDeadline: decayCfg.expirySeconds ? Date.now() + decayCfg.expirySeconds * 1000 : 0,
      displayPrice: CONFIG.ethDisplayPrice * (1 + spec.rateShift),
      lastTickSecond: null,
    };

    $('hud-round').textContent = 'ROUND ' + (r + 1) + ' / ' + CONFIG.rounds;
    $('hud-value').textContent = fmtUsd(game.value);
    $('round-title').textContent = 'ROUND ' + (r + 1) + ' — ' + spec.title;

    var chips = spec.route.map(function (hop) { return '<span class="chip">' + hop + '</span>'; })
      .join('<span class="chip-arrow">→</span>');
    $('route-chips').innerHTML = chips;

    $('decay-wrap').classList.toggle('hidden', !decayCfg.expirySeconds);
    $('ticker').style.display = r === 2 ? '' : 'none';

    renderQuote();
    show('screen-round');

    // master round timer + decay + volatile ticker, one 100ms loop
    every(function () {
      var leftMs = roundState.deadline - Date.now();
      if (leftMs <= 0) { choose('send', true); return; }
      var frac = leftMs / (CONFIG.roundSeconds * 1000);
      $('round-timer-bar').style.width = (frac * 100) + '%';
      $('round-timer-bar').className = frac < 0.33 ? 'low' : '';
      $('hud-clock').textContent = (leftMs / 1000).toFixed(1);

      var sec = Math.ceil(leftMs / 1000);
      if (sec <= 5 && sec !== roundState.lastTickSecond) {
        roundState.lastTickSecond = sec;
        Sound.tick();
      }

      if (roundState.decayDeadline) {
        var dLeft = roundState.decayDeadline - Date.now();
        if (dLeft <= 0) {
          roundState.decayPenalty += decayCfg.refreshPenaltyPct;
          roundState.decayDeadline = Date.now() + decayCfg.expirySeconds * 1000;
          dLeft = decayCfg.expirySeconds * 1000;
          renderQuote();
        }
        $('decay-s').textContent = (dLeft / 1000).toFixed(1);
        $('decay-bar').style.width = ((dLeft / (decayCfg.expirySeconds * 1000)) * 100) + '%';
      }

      if (r === 2) {
        // volatile market: price jitters on screen
        var jitter = 1 + (Math.random() - 0.5) * 0.006;
        roundState.displayPrice = CONFIG.ethDisplayPrice * (1 + spec.rateShift) * jitter;
        var dir = jitter >= 1 ? 'up' : 'down';
        var arrow = jitter >= 1 ? '^' : 'v';
        $('ticker').innerHTML = 'ETH/USD <span class="' + dir + '">' + arrow + ' $' + roundState.displayPrice.toFixed(2) + '</span> &middot; vol elevated';
        renderQuote();
      }
    }, 100);
  }

  /* ---------- the choice ---------- */

  function choose(action, isTimeout) {
    if (busy || !roundState) return;
    busy = true;
    var leftMs = Math.max(0, roundState.deadline - Date.now());
    game.remainingMs += isTimeout ? 0 : leftMs;
    clearTimers();
    var roll = roundState.roll;

    if (action === 'send') {
      game.sendCount++;
      game.stats.sends++;
      Sound.send();
      var res = Engine.resolveSend(game.value, roll, CONFIG);
      if (res.event !== 'clean') game.stats.sendHits++;
      overlay(
        '<div class="ov-icon">TX_BROADCAST</div>' +
        '<div class="ov-title">BROADCASTING...</div>' +
        '<div class="ov-body">' + (isTimeout ? 'Time! Trade auto-sent — no simulation.' : 'No simulation. Straight to the mempool.') + '</div>'
      );
      later(function () { revealSend(res); }, 900);
    } else {
      Sound.scan();
      var res2 = Engine.resolveSimulate(game.value, roll, CONFIG);
      if (res2.caught) {
        game.stats.dodges++;
        game.stats.dodgedUsd += Math.round(res2.dodgedUsd);
      }
      runScan(function () { revealSimulate(res2, roll); });
    }
  }

  function advance() {
    hideOverlay();
    if (game.round + 1 < CONFIG.rounds) startRound(game.round + 1);
    else finish();
  }

  /* Overlay with auto-advance; a tap skips ahead. */
  function outcomeOverlay(html, cls, ms, next) {
    overlay(html + '<div class="ov-tap">tap to continue</div>', cls);
    var done = false;
    var go = function () {
      if (done) return;
      done = true;
      $('overlay').onclick = null;
      next();
    };
    $('overlay').onclick = go;
    later(go, ms);
  }

  function revealSend(res) {
    var deltaUsd = res.value - game.value;
    if (res.event === 'clean') {
      game.value = res.value;
      game.history.push({ choice: 'SENT', good: true, pct: res.pct });
      Sound.win();
      outcomeOverlay(
        '<div class="ov-icon">OK_FILL</div>' +
        '<div class="ov-title good">CLEAN FILL — FIRST IN THE BLOCK</div>' +
        '<div class="ov-body">Speed bonus +' + CONFIG.speedBonusPct + '%. This time, the dice were kind.</div>' +
        '<div class="ov-delta good">' + fmtUsdSigned(deltaUsd) + '</div>',
        'flash-green', 2600, advance
      );
    } else {
      var copy = EVENT_COPY[res.event];
      game.value = res.value;
      game.history.push({ choice: 'SENT', good: false, pct: res.pct, event: res.event });
      Sound.fail();
      outcomeOverlay(
        '<div class="ov-icon">' + copy.icon + '</div>' +
        '<div class="ov-title bad">ALERT: ' + copy.title + '</div>' +
        '<div class="ov-body">' + copy.send(-res.pct) + '</div>' +
        '<div class="ov-delta bad">' + fmtUsdSigned(deltaUsd) + '</div>' +
        '<div class="ov-foot">' + FAIL_FOOT + '</div>',
        'flash-red', 5000, advance
      );
    }
  }

  function runScan(next) {
    var items = SCAN_ITEMS.map(function (txt, i) {
      return '<div class="scan-item" id="scan-' + i + '"><span class="tick">[ ]</span><span>' + txt + '</span></div>';
    }).join('');
    overlay(
      '<div class="scan-box"><div class="scan-title">ENSO QUOTE SIMULATOR — REPLAYING ROUTE</div>' + items + '</div>'
    );
    var step = CONFIG.simulateScanMs / SCAN_ITEMS.length;
    SCAN_ITEMS.forEach(function (_, i) {
      later(function () {
        var el = $('scan-' + i);
        if (el) {
          el.classList.add('on');
          el.querySelector('.tick').textContent = '[x]';
          Sound.scan();
        }
      }, step * (i + 1) - step * 0.4);
    });
    later(next, CONFIG.simulateScanMs);
  }

  function revealSimulate(res, roll) {
    var applyAndContinue = function () {
      var before = game.value;
      game.value = res.value;
      var optLine = res.pct > 0
        ? '<div class="ov-body">Better route found: <b>+' + res.pct.toFixed(2) + '%</b> output.</div>' +
          '<div class="ov-delta good">' + fmtUsdSigned(game.value - before) + '</div>'
        : '<div class="ov-body">Fair quote executed. What you saw is what you got.</div>' +
          '<div class="ov-delta">' + fmtUsd(game.value) + '</div>';
      game.history.push({ choice: 'SIM', good: true, pct: res.pct, dodged: res.caught });
      if (res.pct > 0) Sound.win();
      outcomeOverlay(
        '<div class="ov-icon">SIM_OK</div>' +
        '<div class="ov-title good">' + (res.caught ? 'RE-ROUTED — FUNDS SAFE' : 'ROUTE VERIFIED') + '</div>' +
        optLine,
        'flash-green', 2400, advance
      );
    };

    if (res.caught) {
      var copy = EVENT_COPY[res.caught];
      var parts = copy.caught(roll.severityPct, res.dodgedUsd).split(' — ');
      Sound.alarm();
      outcomeOverlay(
        '<div class="ov-icon">' + copy.icon + '</div>' +
        '<div class="ov-title bad">ALERT: ' + parts[0] + '</div>' +
        '<div class="ov-body">' + parts.slice(1).join(' — ') + '</div>',
        'flash-red', 3600, applyAndContinue
      );
    } else {
      applyAndContinue();
    }
  }

  /* ---------- result ---------- */

  async function finish() {
    clearTimers();
    hideOverlay();
    var score = Math.round(game.value);
    var rank = null;
    var saveError = false;
    overlay('<div class="ov-icon">DB_WRITE</div><div class="ov-title">SAVING RUN...</div><div class="ov-body">Committing today\'s score to the local leaderboard.</div>');
    try {
      var saved = await Store.addEntry({
        name: game.name,
        score: score,
        remainingMs: game.remainingMs,
        sendCount: game.sendCount,
        contact: game.contact || null,
        ts: game.ts,
      }, game.stats);
      rank = saved.rank;
    } catch (error) {
      console.error(error);
      saveError = true;
    }
    hideOverlay();

    show('screen-result');

    var up = score >= CONFIG.startingUsd;
    var rv = $('result-value');
    rv.className = 'result-value ' + (up ? 'up' : 'down');
    // count-up animation (self-clearing — must not kill other timers)
    var t0 = Date.now(), dur = 1200, from = CONFIG.startingUsd;
    var countUp = setInterval(function () {
      var f = Math.min(1, (Date.now() - t0) / dur);
      var eased = 1 - Math.pow(1 - f, 3);
      rv.textContent = fmtUsd(from + (score - from) * eased);
      if (f >= 1) clearInterval(countUp);
    }, 30);
    timers.push(countUp);

    $('result-eth').textContent = fmtEth(score, CONFIG.ethDisplayPrice) + ' · ' + (up ? fmtUsdSigned(score - CONFIG.startingUsd) + ' on the day' : fmtUsdSigned(score - CONFIG.startingUsd));
    $('result-rank').innerHTML = saveError
      ? '<span class="bad">SCORE NOT SAVED — check the local server</span>'
      : '<span class="pos">#' + rank + '</span> on today’s leaderboard' + (rank === 1 ? ' — top score' : '');
    $('result-swag').textContent = score >= CONFIG.swagThresholdUsd
      ? 'You finished ≥ $1M — claim your “I simulate before I sign” swag at the desk.'
      : '';

    $('result-history').innerHTML = game.history.map(function (h, i) {
      var cls = h.good ? 'good' : 'bad';
      var what;
      if (h.choice === 'SENT') what = h.good ? 'clean +' + h.pct.toFixed(1) + '%' : EVENT_COPY[h.event].title.toLowerCase() + ' ' + h.pct.toFixed(1) + '%';
      else what = (h.dodged ? 'dodged ' + EVENT_COPY[h.dodged].title.toLowerCase() : 'verified') + (h.pct > 0 ? ' +' + h.pct.toFixed(1) + '%' : '');
      return '<div class="hchip ' + cls + '"><span class="lbl">R' + (i + 1) + ' · ' + h.choice + '</span>' + what + '</div>';
    }).join('');

    try {
      $('result-qr').innerHTML = QR.svg(CONFIG.docsUrl, 140);
    } catch (e) {
      $('result-qr').outerHTML = '<div class="qr-cap">' + CONFIG.docsUrl + '</div>';
    }

    if (score >= CONFIG.startingUsd) Sound.win(); else Sound.fail();
    armIdleReset();
  }

  /* ---------- wiring ---------- */

  $('btn-start').addEventListener('click', function () { Sound.unlock(); toName(); });
  $('btn-begin').addEventListener('click', startGame);
  $('input-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') startGame(); });
  $('input-name').addEventListener('input', function () {
    if (this.value.trim()) {
      this.classList.remove('invalid');
      this.removeAttribute('aria-invalid');
      $('name-error').textContent = '';
    }
  });
  $('btn-send').addEventListener('click', function () { choose('send', false); });
  $('btn-sim').addEventListener('click', function () { choose('sim', false); });
  $('btn-again').addEventListener('click', function () { disarmIdleReset(); toName(); });

  // any touch on name/result screens postpones the idle reset
  document.addEventListener('pointerdown', function () { if (idleTimer) armIdleReset(); });

  toAttract();
})();
