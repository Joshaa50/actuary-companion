// Tabula service worker — network-first everywhere so updates deploy immediately;
// cache is the offline fallback
const CACHE = 'tabula-v10';
// Relative paths so precache works both at localhost root and the GitHub Pages
// subpath (/actuary-companion/) — absolute "/…" paths 404 on the subpath
const SHELL = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/data/modules.js',
  './js/data/syllabus.js',
  './js/data/cards.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // allSettled so one missing asset never aborts the whole precache
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Network-first for same-origin shell assets — cache the fresh copy for offline use
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Network-first for CDN (MathJax, fonts) — fall back to cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
