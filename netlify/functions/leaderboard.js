'use strict';

const {
  json,
  readTodayRows,
  statsFromRows,
  todayKey,
  toPublicEntry,
} = require('./lib/supabase');

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const rows = await readTodayRows();
    return json(200, {
      date: todayKey(),
      board: rows.map(toPublicEntry),
      stats: statsFromRows(rows),
    });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
