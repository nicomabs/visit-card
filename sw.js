/* sw.js — functional / ES2025 style */
const VERSION = 'v2.0.0';
const CACHE_NAME = `visit-card-${VERSION}`;
const DEBUG = true;

/* ---------- util ---------- */
const log = (...args) => DEBUG && console.log('[SW]', ...args);
const warn = (...args) => DEBUG && console.warn('[SW]', ...args);
const error = (...args) => console.error('[SW]', ...args);

const jsonSafe = async res => {
  if (!res) throw new Error('No response');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const normalizeBase = scope => {
  try {
    return new URL(scope).pathname;
  } catch {
    return '/';
  }
};

/* ---------- vCard builder (pure) ---------- */
const escapeV = s => String(s ?? '').replace(/[,;]/g, '\\$&');
const buildVCard = c => {
  const N = `${escapeV(c.lastName)};${escapeV(c.firstName)};;;`;
  const FN = escapeV([c.firstName, c.lastName].filter(Boolean).join(' '));
  const adrParts = [c.street, c.city, c.postalCode, c.country].some(Boolean);
  const ADR = adrParts
    ? `ADR;TYPE=WORK:;;${escapeV(c.street)};${escapeV(c.city)};;${escapeV(c.postalCode)};${escapeV(c.country)}`
    : '';
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${N}`,
    `FN:${FN}`,
    c.org ? `ORG:${escapeV(c.org)}` : '',
    c.title ? `TITLE:${escapeV(c.title)}` : '',
    c.tel ? `TEL;TYPE=CELL:${escapeV(c.tel)}` : '',
    c.email ? `EMAIL;TYPE=INTERNET:${escapeV(c.email)}` : '',
    ADR,
    c.url ? `URL:${escapeV(c.url)}` : '',
    'END:VCARD'
  ].filter(Boolean);
  return lines.join('\r\n'); // CRLF for Contacts compatibility
};

/* ---------- static assets to cache (computed at runtime) ---------- */
const makeAssetsList = base => ([
  base,
  `${base}index.html`,
  `${base}style.css`,
  `${base}env.js`,
  `${base}data/contacts.json`,
  `${base}manifest.webmanifest`,
  `${base}icons/icon-192.png`,
  `${base}icons/icon-512.png`
].map(u => new Request(u, { cache: 'no-store' })));

/* ---------- lifecycle: install ---------- */
self.addEventListener('install', (evt) => {
  log('install', VERSION);
  const base = normalizeBase(self.registration.scope);
  evt.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const toCache = makeAssetsList(base);
      log('caching resources:', toCache.map(r => r.url));
      await cache.addAll(toCache);
      log('cache completed');
      await self.skipWaiting();
      log('skipWaiting done');
    } catch (err) {
      error('install error', err);
    }
  })());
});

/* ---------- lifecycle: activate ---------- */
self.addEventListener('activate', (evt) => {
  log('activate', VERSION);
  evt.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      const purge = keys.filter(k => k !== CACHE_NAME);
      await Promise.all(purge.map(k => {
        log('deleting cache', k);
        return caches.delete(k);
      }));
      await self.clients.claim();
      log('clients.claim done');
    } catch (err) {
      error('activate error', err);
    }
  })());
});

/* ---------- helper: read contacts (cache-first) ---------- */
const getContacts = async (base) => {
  const req = new Request(`${base}data/contacts.json`, { cache: 'no-store' });
  const cached = await caches.match(req);
  if (cached) {
    log('contacts.json -> from cache');
    return jsonSafe(cached);
  }
  log('contacts.json -> fetch network');
  const net = await fetch(req);
  return jsonSafe(net);
};

/* ---------- fetch handler ---------- */
self.addEventListener('fetch', (evt) => {
  const reqUrl = new URL(evt.request.url);
  const base = normalizeBase(self.registration.scope);

  // route: /.../vcf/{id}.vcf
  const vcfPrefix = `${base}vcf/`;
  if (reqUrl.pathname.startsWith(vcfPrefix) && reqUrl.pathname.endsWith('.vcf')) {
    const id = reqUrl.pathname.slice(vcfPrefix.length).replace(/\.vcf$/, '');
    log('vcf request for id=', id);
    evt.respondWith((async () => {
      try {
        const data = await getContacts(base);
        const list = Array.isArray(data) ? data : (data.contacts || []);
        const contact = list.find(x => String(x.id) === id);
        if (!contact) {
          warn('vcf: contact not found', id);
          return new Response('Contact not found', { status: 404 });
        }
        const vcard = buildVCard(contact);
        log(`vcf generated (${id}) length=${vcard.length}`);
        return new Response(vcard, {
          status: 200,
          headers: {
            'Content-Type': 'text/vcard; charset=utf-8',
            'Content-Disposition': `attachment; filename="${(contact.firstName||'')}_${(contact.lastName||'')}.vcf"`
          }
        });
      } catch (err) {
        error('vcf generation error', err);
        return new Response('Error generating VCF', { status: 500 });
      }
    })());
    return;
  }

  // default: cache-first then network
  evt.respondWith((async () => {
    try {
      const cached = await caches.match(evt.request);
      if (cached) {
        // log less verbosely for frequent resources
        const dest = evt.request.destination || 'unknown';
        log('cache-hit', dest, evt.request.url);
        return cached;
      }
      log('network fetch', evt.request.url);
      const fetched = await fetch(evt.request);
      return fetched;
    } catch (err) {
      error('fetch handler error', evt.request.url, err);
      return Response.error();
    }
  })());
});
