'use strict';

const TABLE = process.env.SUPABASE_TABLE || 'leaderboard_entries';
const TIME_ZONE = process.env.LEADERBOARD_TIME_ZONE || 'Europe/Paris';

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(payload),
  };
}

function todayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function supabaseHeaders(extra) {
  const key = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  return Object.assign({
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }, extra || {});
}

function supabaseUrl(path, params) {
  const base = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const url = new URL(`${base}/rest/v1/${path}`);
  Object.keys(params || {}).forEach(key => url.searchParams.set(key, params[key]));
  return url;
}

async function supabaseFetch(path, params, options) {
  const response = await fetch(supabaseUrl(path, params), options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = body && (body.message || body.error) || `Supabase request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

function cleanNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function cleanEntry(raw) {
  const name = String(raw.name || '').trim().toUpperCase().slice(0, 14);
  if (!name) throw new Error('Display name is required');
  return {
    event_date: todayKey(),
    name,
    score: cleanNumber(raw.score, 0, 1000000000),
    remaining_ms: cleanNumber(raw.remainingMs, 0, 3600000),
    send_count: cleanNumber(raw.sendCount, 0, 100),
    contact: raw.contact ? String(raw.contact).trim().slice(0, 60) : null,
    client_ts: cleanNumber(raw.ts, 0, Date.now() + 60000),
  };
}

function cleanStats(raw) {
  return {
    sends: cleanNumber(raw.sends, 0, 100),
    send_hits: cleanNumber(raw.sendHits, 0, 100),
    dodges: cleanNumber(raw.dodges, 0, 100),
    dodged_usd: cleanNumber(raw.dodgedUsd, 0, 1000000000),
  };
}

function toPublicEntry(row) {
  return {
    id: row.id,
    name: row.name,
    score: row.score,
    remainingMs: row.remaining_ms,
    sendCount: row.send_count,
    ts: row.client_ts,
  };
}

function statsFromRows(rows) {
  return rows.reduce((stats, row) => {
    stats.plays += 1;
    stats.sends += row.sends || 0;
    stats.sendHits += row.send_hits || 0;
    stats.dodges += row.dodges || 0;
    stats.dodgedUsd += row.dodged_usd || 0;
    return stats;
  }, { plays: 0, sends: 0, sendHits: 0, dodges: 0, dodgedUsd: 0 });
}

async function readLeaderboardRows() {
  return supabaseFetch(TABLE, {
    select: 'id,name,score,remaining_ms,send_count,client_ts,sends,send_hits,dodges,dodged_usd',
    order: 'score.desc,remaining_ms.desc,created_at.asc',
  }, {
    method: 'GET',
    headers: supabaseHeaders(),
  });
}

module.exports = {
  TABLE,
  cleanEntry,
  cleanStats,
  json,
  readLeaderboardRows,
  statsFromRows,
  supabaseFetch,
  supabaseHeaders,
  todayKey,
  toPublicEntry,
};
