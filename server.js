#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(DATA_DIR, 'leaderboard.json');
const PORT = Number(process.env.PORT || 8741);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY_BYTES = 16 * 1024;

function todayKey() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function emptyStats() {
  return { plays: 0, sends: 0, sendHits: 0, dodges: 0, dodgedUsd: 0 };
}

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { days: {} };
    console.error('Database read failed:', error.message);
    return { days: {} };
  }
}

function writeDb(db) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const temp = `${DB_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, DB_FILE);
}

function getDay(db) {
  const key = todayKey();
  if (!db.days[key]) db.days[key] = { board: [], stats: emptyStats() };
  return { key, value: db.days[key] };
}

function allTimeState(db) {
  return Object.keys(db.days || {}).reduce((state, key) => {
    const day = db.days[key] || {};
    state.board = state.board.concat(day.board || []);
    const stats = day.stats || {};
    Object.keys(state.stats).forEach(statKey => {
      state.stats[statKey] += stats[statKey] || 0;
    });
    return state;
  }, { board: [], stats: emptyStats() });
}

function compareEntries(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  return (b.remainingMs || 0) - (a.remainingMs || 0);
}

function publicState(day, key) {
  return {
    date: key,
    board: day.board.slice().sort(compareEntries).map(({ contact, ...entry }) => entry),
    stats: day.stats,
  };
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) reject(new Error('Request body too large'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (error) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
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
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    name,
    score: cleanNumber(raw.score, 0, 1000000000),
    remainingMs: cleanNumber(raw.remainingMs, 0, 3600000),
    sendCount: cleanNumber(raw.sendCount, 0, 100),
    contact: raw.contact ? String(raw.contact).trim().slice(0, 60) : null,
    ts: cleanNumber(raw.ts, 0, Date.now() + 60000),
  };
}

function cleanStats(raw) {
  return {
    plays: 1,
    sends: cleanNumber(raw.sends, 0, 100),
    sendHits: cleanNumber(raw.sendHits, 0, 100),
    dodges: cleanNumber(raw.dodges, 0, 100),
    dodgedUsd: cleanNumber(raw.dodgedUsd, 0, 1000000000),
  };
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/leaderboard') {
    const db = readDb();
    return json(res, 200, publicState(allTimeState(db), 'all-time'));
  }

  if (req.method === 'POST' && pathname === '/api/entries') {
    try {
      const payload = await readJson(req);
      const entry = cleanEntry(payload.entry || {});
      const stats = cleanStats(payload.stats || {});
      const db = readDb();
      const day = getDay(db);
      day.value.board.push(entry);
      day.value.board.sort(compareEntries);
      Object.keys(stats).forEach(key => { day.value.stats[key] += stats[key]; });
      writeDb(db);
      const leaderboard = allTimeState(db);
      leaderboard.board.sort(compareEntries);
      const rank = leaderboard.board.findIndex(item => item.id === entry.id) + 1;
      return json(res, 201, { rank, state: publicState(leaderboard, 'all-time') });
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
  }

  return json(res, 404, { error: 'Not found' });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(ROOT, `.${decodeURIComponent(requested)}`);
  if (!file.startsWith(`${ROOT}${path.sep}`) || file.startsWith(`${DATA_DIR}${path.sep}`)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(error.code === 'ENOENT' ? 404 : 500); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url.pathname);
  return serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`SIM OR SEND running at http://${HOST}:${PORT}`);
  console.log(`Leaderboard: http://${HOST}:${PORT}/leaderboard.html`);
  console.log(`Database: ${DB_FILE}`);
});
