// Service worker: network-first for the app shell with a cache fallback offline; API calls are never cached here.
// Bump CACHE when the SHELL list changes.
// The shell list must name every file under src/ (no globbing in a service worker).

const CACHE = 'iq-shell-v2';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './src/app.js',
  './src/api.js',
  './src/format.js',
  './src/ui.js',
  './src/tracking.js',
  './src/screens/setup.js',
  './src/screens/home.js',
  './src/screens/inbox.js',
  './src/screens/transactions.js',
  './src/screens/insights.js',
  './src/screens/settings.js',
];

const shellUrls = SHELL.map((path) => new URL(path, self.location.href).href);
const shellPaths = new Set(shellUrls.map((url) => new URL(url).pathname));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(shellUrls))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name.startsWith('iq-shell-') && name !== CACHE).map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.has('action')) return;
  if (!shellPaths.has(url.pathname)) return;

  // Network first so a new deploy shows up on the next open; the cache answers offline.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch (err) {
        const hit = await cache.match(request);
        if (hit) return hit;
        throw err;
      }
    }),
  );
});
