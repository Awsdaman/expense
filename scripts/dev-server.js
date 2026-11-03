import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRequest } from '../src/core/api.js';
import { createMemoryStore } from '../src/dev/memory-store.js';
import { buildSeed } from '../src/dev/seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
const PORT = Number(process.env.PORT) || 5173;
const DEV_TOKEN = 'dev-token';
const MAX_BODY_BYTES = 1024 * 1024;
const EMPTY = process.argv.includes('--empty');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function riyadhNow() {
  return new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 19) + '+03:00';
}

const seed = buildSeed(riyadhNow());
const store = createMemoryStore(EMPTY ? { Categories: seed.Categories, Settings: seed.Settings } : seed);
const env = { token: DEV_TOKEN, nowIso: riyadhNow, random: Math.random };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJson(res, body) {
  res.writeHead(200, { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function sendNotFound(res) {
  res.writeHead(404, { ...CORS, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('Not found');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(tooLarge ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Returns the params object, or null when the body is not a JSON object.
function parseBody(text) {
  if (text === null) return null;
  if (text.trim() === '') return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed;
}

async function handleApi(req, res, url) {
  let params;
  if (req.method === 'POST') {
    params = parseBody(await readBody(req));
  } else {
    params = Object.fromEntries(url.searchParams);
  }
  if (params === null) return sendJson(res, { ok: false, error: 'bad_request' });
  try {
    return sendJson(res, handleRequest(params, store, env));
  } catch (err) {
    console.error('[dev-server] /api failed:', err && err.stack ? err.stack : err);
    return sendJson(res, { ok: false, error: 'server_error' });
  }
}

async function handleStatic(res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return sendNotFound(res);
  }
  if (rel === '/') rel = '/index.html';
  if (rel.includes('\0')) return sendNotFound(res);

  const file = path.resolve(DASHBOARD_DIR, '.' + rel);
  if (!file.startsWith(DASHBOARD_DIR + path.sep)) return sendNotFound(res);

  let info;
  try {
    info = await stat(file);
  } catch {
    return sendNotFound(res);
  }
  if (!info.isFile()) return sendNotFound(res);

  res.writeHead(200, {
    ...CORS,
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      return res.end();
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api') return await handleApi(req, res, url);
    return await handleStatic(res, url.pathname);
  } catch (err) {
    console.error('[dev-server] request failed:', err && err.stack ? err.stack : err);
    if (!res.headersSent) sendNotFound(res);
    else res.end();
  }
});

server.listen(PORT, 'localhost', () => {
  console.log(`Iqtifaa dev server: http://localhost:${PORT}  (API: http://localhost:${PORT}/api, token: ${DEV_TOKEN})`);
  if (EMPTY) console.log('Started with --empty: Categories and Settings only.');
});
