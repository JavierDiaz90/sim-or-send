/* Leaderboard API client. The Node server persists state to data/leaderboard.json. */
(function (root) {
  'use strict';

  var fallback = { board: [], stats: { plays: 0, sends: 0, sendHits: 0, dodges: 0, dodgedUsd: 0 } };

  function request(url, options) {
    return fetch(url, options).then(function (response) {
      if (!response.ok) return response.json().catch(function () { return {}; }).then(function (body) {
        throw new Error(body.error || 'Leaderboard request failed');
      });
      return response.json();
    });
  }

  var Store = {
    getState: function () {
      return request('/api/leaderboard').catch(function (error) {
        console.warn(error.message);
        return fallback;
      });
    },

    addEntry: function (entry, stats) {
      return request('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: entry, stats: stats }),
      });
    },
  };

  if (typeof module === 'object' && module.exports) module.exports = Store;
  else root.Store = Store;
})(typeof self !== 'undefined' ? self : this);
