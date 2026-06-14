/*
 * Daily leaderboard + stand stats, backed by localStorage.
 * Keys are date-scoped, so the board resets itself at midnight local time.
 * Shared by the game (index.html) and the second screen (leaderboard.html).
 */
(function (root) {
  function todayKey() {
    var d = new Date();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + mm + '-' + dd;
  }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  var Store = {
    todayKey: todayKey,

    boardKey: function () { return 'simorsend:board:' + todayKey(); },
    statsKey: function () { return 'simorsend:stats:' + todayKey(); },

    getBoard: function () {
      return read(this.boardKey(), []);
    },

    /*
     * Insert a finished game and return its 1-based rank for today.
     * entry: { name, score, remainingMs, sendCount, contact, ts }
     */
    addEntry: function (entry, compare) {
      var board = this.getBoard();
      board.push(entry);
      board.sort(compare);
      write(this.boardKey(), board);
      for (var i = 0; i < board.length; i++) {
        if (board[i].ts === entry.ts && board[i].name === entry.name) return i + 1;
      }
      return board.length;
    },

    getStats: function () {
      return read(this.statsKey(), { plays: 0, sends: 0, sendHits: 0, dodges: 0, dodgedUsd: 0 });
    },

    bumpStats: function (patch) {
      var s = this.getStats();
      Object.keys(patch).forEach(function (k) { s[k] = (s[k] || 0) + patch[k]; });
      write(this.statsKey(), s);
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = Store;
  else root.Store = Store;
})(typeof self !== 'undefined' ? self : this);
