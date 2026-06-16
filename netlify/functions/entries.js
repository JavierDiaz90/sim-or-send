'use strict';

const {
  TABLE,
  cleanEntry,
  cleanStats,
  json,
  readLeaderboardRows,
  statsFromRows,
  supabaseFetch,
  supabaseHeaders,
  toPublicEntry,
} = require('./lib/supabase');

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const entry = cleanEntry(payload.entry || {});
    const stats = cleanStats(payload.stats || {});
    const insertPayload = Object.assign({}, entry, stats);

    const inserted = await supabaseFetch(TABLE, { select: '*' }, {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
      body: JSON.stringify(insertPayload),
    });

    const rows = await readLeaderboardRows();
    const insertedId = inserted && inserted[0] && inserted[0].id;
    const rank = rows.findIndex(row => row.id === insertedId) + 1;

    return json(201, {
      rank,
      state: {
        date: 'all-time',
        board: rows.map(toPublicEntry),
        stats: statsFromRows(rows),
      },
    });
  } catch (error) {
    const status = /required|invalid|JSON/i.test(error.message) ? 400 : 500;
    return json(status, { error: error.message });
  }
};
