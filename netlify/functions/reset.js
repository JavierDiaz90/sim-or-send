'use strict';

const {
  TABLE,
  json,
  supabaseFetch,
  supabaseHeaders,
  todayKey,
} = require('./lib/supabase');

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const token = process.env.ADMIN_RESET_TOKEN;
  const provided = event.headers['x-admin-token'] || event.headers['X-Admin-Token'];
  if (!token) return json(500, { error: 'ADMIN_RESET_TOKEN is not configured' });
  if (provided !== token) return json(401, { error: 'Unauthorized' });

  try {
    const date = todayKey();
    const deleted = await supabaseFetch(TABLE, {
      event_date: `eq.${date}`,
      select: 'id',
    }, {
      method: 'DELETE',
      headers: supabaseHeaders({ Prefer: 'return=representation' }),
    });

    return json(200, { ok: true, date, deleted: deleted.length });
  } catch (error) {
    return json(500, { error: error.message });
  }
};
