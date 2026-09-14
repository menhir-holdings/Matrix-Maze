/**
 * Global hiscores. ScoreRow shape is the seam for a later Postgres swap:
 *   { id, playerId?, name, total, levels[8], at, movingSeconds? }
 *
 * Store order:
 *   1. Vercel KV / Upstash REST (`KV_REST_API_URL` + `KV_REST_API_TOKEN`)
 *   2. Vercel Blob (`BLOB_READ_WRITE_TOKEN`) at `matrix-maze-scores.json`
 *   3. In-process memory (preview / cold-start ephemeral — see docs/SCORES.md)
 * Seed rows from scores-seed.json always merge unless that player already posted.
 */

const SEED = require('../scores-seed.json');
const KEY = 'matrix-maze-scores';
const BLOB_PATH = 'matrix-maze-scores.json';
const MAX_NAME = 16;
const MAX_ROWS = 200;
const MAX_TOTAL = 24 * 60 * 60;

const memory = globalThis.__mmScoresMemory || { rows: [], at: 0 };
globalThis.__mmScoresMemory = memory;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sanitizeName(raw) {
  return String(raw || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

function asTime(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_TOTAL) {
    return null;
  }
  return value;
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row) => row && typeof row.total === 'number')
    .slice(0, MAX_ROWS);
}

function mergeSeed(rows) {
  const list = Array.isArray(rows) ? [...rows] : [];
  for (const seed of SEED) {
    const taken = list.some(
      (row) =>
        row.id === seed.id ||
        (row.playerId && seed.playerId && row.playerId === seed.playerId) ||
        sanitizeName(row.name).toLowerCase() === sanitizeName(seed.name).toLowerCase()
    );
    if (!taken) list.push(seed);
  }
  return list;
}

async function kvGet() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(`${url.replace(/\/$/, '')}/get/${encodeURIComponent(KEY)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.result == null) return [];
  try {
    return normalizeRows(typeof data.result === 'string' ? JSON.parse(data.result) : data.result);
  } catch {
    return [];
  }
}

async function kvSet(rows) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  const res = await fetch(`${url.replace(/\/$/, '')}/set/${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(rows),
  });
  return res.ok;
}

async function blobGet() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://blob.vercel-storage.com/${BLOB_PATH}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-version': '7',
    },
  });
  if (res.status === 404) return [];
  if (!res.ok) return null;
  try {
    const data = await res.json();
    return normalizeRows(data.scores || data);
  } catch {
    return [];
  }
}

async function blobSet(rows) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return false;
  const res = await fetch(`https://blob.vercel-storage.com/${BLOB_PATH}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-version': '7',
      'content-type': 'application/json',
      'x-add-random-suffix': '0',
    },
    body: JSON.stringify({ scores: rows }),
  });
  return res.ok;
}

async function loadStore() {
  const kv = await kvGet();
  if (kv) return { rows: kv, store: 'kv' };
  const blob = await blobGet();
  if (blob) return { rows: blob, store: 'blob' };
  return { rows: memory.rows, store: 'memory' };
}

async function saveStore(rows, kind) {
  if (kind === 'kv') {
    const ok = await kvSet(rows);
    if (ok) return 'kv';
  }
  if (kind === 'blob' || process.env.BLOB_READ_WRITE_TOKEN) {
    const ok = await blobSet(rows);
    if (ok) return 'blob';
  }
  if (kind === 'kv') {
    const ok = await kvSet(rows);
    if (ok) return 'kv';
  }
  memory.rows = rows;
  return 'memory';
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      const { rows, store } = await loadStore();
      const sorted = mergeSeed(rows).sort((a, b) => a.total - b.total).slice(0, 50);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json({ scores: sorted, store });
    } catch (err) {
      res.status(500).json({ error: err.message || 'hiscores failed' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const name = sanitizeName(body.name);
    const total = asTime(body.total);
    if (!name) {
      res.status(400).json({ error: 'Name required' });
      return;
    }
    if (total == null) {
      res.status(400).json({ error: 'Valid total time required' });
      return;
    }
    const levels = Array.from({ length: 8 }, (_, i) => asTime(Array.isArray(body.levels) ? body.levels[i] : null));
    const playerId = sanitizeName(body.playerId) || null;
    const movingSeconds = asTime(body.movingSeconds);

    const row = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      playerId,
      name,
      total,
      levels,
      movingSeconds,
      at: Date.now(),
    };

    const { rows, store } = await loadStore();
    const next = [row, ...rows].sort((a, b) => a.total - b.total).slice(0, MAX_ROWS);
    const savedAs = await saveStore(next, store);
    res.status(200).json({
      ok: true,
      score: row,
      scores: mergeSeed(next).sort((a, b) => a.total - b.total).slice(0, 50),
      store: savedAs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'submit failed' });
  }
};
