/* SIM OR SEND — live leaderboard backed by the local Node server. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var fmtUsd = function (v) { return '$' + Math.round(v).toLocaleString('en-US'); };
  var rendering = false;

  var TAGLINES = [
    'Would you bet $1M on an unsimulated quote?',
    'SEND IT pays +2% — when the dice are kind. They usually aren’t.',
    '9 of 10 blind sends hit a failure. The odds tell the truth.',
    'Finish ≥ $1M and claim “I simulate before I sign” swag.',
    'Top all-time score wins the prize. Sub-60-second rounds — step up.',
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

  async function render() {
    if (rendering) return;
    rendering = true;
    try {
      var state = await Store.getState();
      $('board-date').textContent = 'All-time leaderboard · live database';

      var board = state.board.slice().sort(Engine.compareEntries).slice(0, CONFIG.leaderboardSize);
      var table = $('board-table');
      if (!board.length) {
        table.innerHTML = '<div class="board-empty">No runs yet — be the first on the board.</div>';
      } else {
        table.innerHTML = board.map(function (e, i) {
          var rank = i + 1;
          var up = e.score >= CONFIG.startingUsd;
          var tag = e.sendCount === 0 ? 'simulated every trade' : 'sent blind x' + e.sendCount;
          return '<div class="board-row' + (rank <= 3 ? ' top' + rank : '') + '">' +
            '<span class="rk">#' + rank + '</span>' +
            '<span class="nm">' + escapeHtml(e.name) + ' <span class="tag">' + tag + '</span></span>' +
            '<span class="tag">' + ((e.remainingMs || 0) / 1000).toFixed(1) + 's left</span>' +
            '<span class="sc ' + (up ? 'up' : 'down') + '">' + fmtUsd(e.score) + '</span>' +
            '</div>';
        }).join('');
      }

      var s = state.stats;
      $('stat-plays').textContent = s.plays;
      $('stat-rekt').textContent = s.sends ? Math.round((s.sendHits / s.sends) * 100) + '%' : '—';
      $('stat-dodged').textContent = fmtUsd(s.dodgedUsd || 0);
    } finally {
      rendering = false;
    }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  $('board-attract').textContent = TAGLINES[0];
  render();
  setInterval(render, 2000);
  setInterval(rotateTagline, 6000);
})();
