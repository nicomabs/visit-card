// sw.js
const VERSION = 'v1.2.0';

function buildVCard(c) {
  const esc = (s='') => String(s).replace(/[,;]/g, '\\$&');
  const N  = `${esc(c.lastName||'')};${esc(c.firstName||'')};;;`;
  const FN = `${esc([c.firstName, c.lastName].filter(Boolean).join(' '))}`;
  const ADR = (c.street||c.city||c.postalCode||c.country)
    ? `ADR;TYPE=WORK:;;${esc(c.street||'')};${esc(c.city||'')};;${esc(c.postalCode||'')};${esc(c.country||'')}`
    : '';
  const L = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${N}`,
    `FN:${FN}`,
    c.org   ? `ORG:${esc(c.org)}`   : '',
    c.title ? `TITLE:${esc(c.title)}` : '',
    c.tel   ? `TEL;TYPE=CELL:${esc(c.tel)}` : '',
    c.email ? `EMAIL;TYPE=INTERNET:${esc(c.email)}` : '',
    ADR,
    c.url   ? `URL:${esc(c.url)}`   : '',
    'END:VCARD'
  ].filter(Boolean);
  // iOS/Contacts aiment CRLF
  return L.join('\r\n');
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const base = new URL(self.registration.scope).pathname; // '/visit-card/' en dev, '/' en prod
    const cache = await caches.open('visit-card-' + VERSION);
    await cache.addAll([
      base,
      base + 'index.html',
      base + 'style.css',
      base + 'env.js',
      base + 'data/contacts.json',
      base + 'manifest.webmanifest',
      base + 'icons/icon-192.png',
      base + 'icons/icon-512.png'
    ].map(u => new Request(u, { cache: 'no-store' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== 'visit-card-' + VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const base = new URL(self.registration.scope).pathname; // scope dynamique
  // Route virtuelle: /.../vcf/{id}.vcf
  if (url.pathname.startsWith(base + 'vcf/') && url.pathname.endsWith('.vcf')) {
    e.respondWith((async () => {
      try {
        const id = url.pathname.slice((base + 'vcf/').length).replace(/\.vcf$/,'');
        // charge contacts.json depuis le cache ou le réseau
        const contactsReq = new Request(base + 'data/contacts.json', { cache: 'no-store' });
        let res = await caches.match(contactsReq);
        if (!res) res = await fetch(contactsReq);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.contacts || []);
        const c = list.find(x => String(x.id) === id);
        if (!c) return new Response('Contact not found', { status: 404 });

        const vcf = buildVCard(c);
        return new Response(vcf, {
          status: 200,
          headers: {
            'Content-Type': 'text/vcard; charset=utf-8',
            // iOS ignore parfois Content-Disposition, mais ça aide Android/desktop
            'Content-Disposition': `attachment; filename="${(c.firstName||'')}_${(c.lastName||'')}.vcf"`
          }
        });
      } catch (err) {
        return new Response('Error generating VCF', { status: 500 });
      }
    })());
    return;
  }

  // cache-first simple pour le reste
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      return await fetch(e.request);
    } catch {
      return cached || Response.error();
    }
  })());
});
