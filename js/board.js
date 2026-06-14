/* SIM OR SEND — second-screen leaderboard + attract loop. Polls localStorage. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var fmtUsd = function (v) { return '$' + Math.round(v).toLocaleString('en-US'); };

  var TAGLINES = [
    'Would you bet $1M on an unsimulated quote?',
    'SEND IT pays +2% — when the dice are kind. They usually aren’t.',
    '7 of 8 blind senders crash. The odds tell the truth.',
    'Finish ≥ $1M and claim “I simulate before I sign” swag.',
    'Top score today wins the prize. Sub-60-second rounds — step up.',
  ];
  var tagIdx = 0;

  function rotateTagline() {
    var el = $('board-attract');
    el.style.opacity = 0;
    setTimeout(function () {
      tagIdx = (tagIdx + 1) % TAGLINES.length;
      el.textContent = TAGLINES[tagIdx];
      el.style.opacity = 1;
    }, 400);
  }

  function render() {
    $('board-date').textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    }) + ' · resets daily';

    var board = Store.getBoard().slice().sort(Engine.compareEntries).slice(0, CONFIG.leaderboardSize);
    var table = $('board-table');
    if (!board.length) {
      table.innerHTML = '<div class="board-empty">No runs yet today — be the first on the board.</div>';
    } else {
      table.innerHTML = board.map(function (e, i) {
        var up = e.score >= CONFIG.startingUsd;
        var tag = e.sendCount === 0 ? 'simulated every trade' : 'sent blind x' + e.sendCount;
        return '<div class="board-row' + (i === 0 ? ' top1' : '') + '">' +
          '<span class="rk">' + (i + 1) + '</span>' +
          '<span class="nm">' + escapeHtml(e.name) + ' <span class="tag">' + tag + '</span></span>' +
          '<span class="tag">' + ((e.remainingMs || 0) / 1000).toFixed(1) + 's left</span>' +
          '<span class="sc ' + (up ? 'up' : 'down') + '">' + fmtUsd(e.score) + '</span>' +
          '</div>';
      }).join('');
    }

    var s = Store.getStats();
    $('stat-plays').textContent = s.plays;
    $('stat-rekt').textContent = s.sends ? Math.round((s.sendHits / s.sends) * 100) + '%' : '—';
    $('stat-dodged').textContent = fmtUsd(s.dodgedUsd || 0);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  $('board-attract').textContent = TAGLINES[0];
  render();
  window.addEventListener('storage', render); // instant update from the game window
  setInterval(render, 2000);                  // safety net + midnight rollover
  setInterval(rotateTagline, 6000);
})();
