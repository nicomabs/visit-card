// sw.js — GitHub Pages /visit-card/
const BASE = '/visit-card/';
const VERSION = 'v1.0.0';
const STATIC_CACHE = `static-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;

const STATIC_ASSETS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}style.css`,
  `${BASE}manifest.webmanifest`,
  `${BASE}data/contacts.json`,
  `${BASE}icons/icon-192.png`,
  `${BASE}icons/icon-512.png`,
  `${BASE}icons/maskable-512.png`
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => ![STATIC_CACHE, RUNTIME_CACHE].includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Helper: SWR pour JSON
async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then(res => {
    cache.put(req, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Même origine uniquement
  if (url.origin !== location.origin) return;

  // Stale-while-revalidate pour le JSON de contacts
  if (url.pathname === `${BASE}data/contacts.json`) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Cache-first pour l'App Shell et fichiers sous /visit-card/
  if (url.pathname.startsWith(BASE)) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req))
    );
  }
});
