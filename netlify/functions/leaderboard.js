'use strict';

const {
  json,
  readLeaderboardRows,
  statsFromRows,
  toPublicEntry,
} = require('./lib/supabase');

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const rows = await readLeaderboardRows();
    return json(200, {
      date: 'all-time',
      board: rows.map(toPublicEntry),
      stats: statsFromRows(rows),
    });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
