// API client: config in localStorage, GET with an offline copy, POST without a CORS preflight.

const CONFIG_KEY = 'iq:config';
const CACHE_PREFIX = 'iq:cache:';
const CHANGED_KEY = 'iq:changed';

const MESSAGES = {
  offline: "Couldn't reach the server",
  unauthorized: 'The token was rejected',
  rate_limited: 'Too many requests, try again in a minute',
  server_error: 'The server hit an error',
  bad_response: "This URL didn't return Iqtifaa data",
  bad_request: 'The server rejected the request',
  not_found: 'Not found',
  not_configured: 'Connect the dashboard first',
  unknown_action: 'This server does not know the request',
};

// Turns an error from this module into a sentence for the screen.
export function errorMessage(err) {
  return MESSAGES[err?.code] || MESSAGES.server_error;
}

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

export function loadConfig() {
  try {
    const cfg = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
    return cfg && typeof cfg.url === 'string' && typeof cfg.token === 'string' ? cfg : null;
  } catch {
    return null;
  }
}

// Returns false when the browser blocks storage.
export function saveConfig({ url, token }) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, token }));
    return true;
  } catch {
    return false;
  }
}

export function clearConfig() {
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch {
    // storage blocked: nothing to clear
  }
}

function requireConfig() {
  const cfg = loadConfig();
  if (!cfg) throw fail('not_configured');
  return cfg;
}

// Network failure -> 'offline'; a body that is not JSON -> 'bad_response'; {ok:false} -> its error code.
async function send(url, init) {
  let res;
  try {
    res = await fetch(url, init);
  } catch {
    throw fail('offline');
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw fail('bad_response');
  }
  if (!data || typeof data !== 'object') throw fail('bad_response');
  if (data.ok === false) throw fail(data.error || 'server_error');
  return data;
}

function cleanParams(params) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') out[key] = String(value);
  }
  return out;
}

function cacheKey(action, params) {
  const sorted = Object.keys(params).sort().map((key) => [key, params[key]]);
  return `${CACHE_PREFIX}${action}:${new URLSearchParams(sorted).toString()}`;
}

function readCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ at: new Date().toISOString(), data }));
  } catch {
    // quota exceeded or storage blocked: the cache is optional
  }
}

// Every save moves this mark forward. Copies older than it still serve offline, but are not shown first.
function markChanged() {
  try {
    localStorage.setItem(CHANGED_KEY, new Date().toISOString());
  } catch {
    // storage blocked: copies are then never shown first
  }
}

// The saved copy of a GET, or null when there is none or a save happened after it.
export function cachedGet(action, params = {}) {
  const cached = readCache(cacheKey(action, cleanParams(params)));
  let changed = '';
  try {
    changed = localStorage.getItem(CHANGED_KEY) || '';
  } catch {
    return null;
  }
  return cached && cached.at > changed ? cached.data : null;
}

// Apps Script takes about 2 s per call, so a screen paints its saved copies at once and repaints
// when fresh data differs. The repaint is skipped once the person taps or types on the screen,
// or after they left it. Throws only when there was nothing to show.
export async function loadScreen(root, requests, paint) {
  const saved = requests.map(([action, params]) => cachedGet(action, params));
  const shown = saved.every(Boolean) ? saved : null;
  if (shown) paint(shown);
  let touched = false;
  for (const type of ['pointerdown', 'keydown', 'input']) {
    root.addEventListener(type, () => { touched = true; }, { capture: true, once: true });
  }
  let fresh;
  try {
    fresh = await Promise.all(requests.map(([action, params]) => apiGet(action, params)));
  } catch (err) {
    if (shown) return;
    throw err;
  }
  if (!root.isConnected || (shown && (touched || JSON.stringify(fresh) === JSON.stringify(shown)))) return;
  paint(fresh);
}

// GET. Offline with a cached copy -> { ...copy, stale: true, cachedAt }.
export async function apiGet(action, params = {}) {
  const cfg = requireConfig();
  const query = cleanParams(params);
  const url = new URL(cfg.url);
  url.search = new URLSearchParams({ action, token: cfg.token, ...query }).toString();
  const key = cacheKey(action, query);
  try {
    const data = await send(url.href);
    writeCache(key, data);
    return data;
  } catch (err) {
    const cached = err.code === 'offline' ? readCache(key) : null;
    if (!cached) throw err;
    return { ...cached.data, stale: true, cachedAt: cached.at };
  }
}

// POST with a text/plain body, so the browser sends no preflight to Apps Script.
export async function apiPost(action, body = {}) {
  const cfg = requireConfig();
  const data = await send(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, action, token: cfg.token }),
  });
  markChanged();
  return data;
}

// Setup uses this before anything is saved: calls action=config and returns { settings, categories }.
export async function testConnection({ url, token }) {
  const target = new URL(url);
  target.search = new URLSearchParams({ action: 'config', token }).toString();
  return send(target.href);
}
