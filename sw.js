const CACHE = 'caixa-v11';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'importer.js',
  'recurring.js',
  'budget.js',
  'exporter.js',
  'quick.js',
  'password.js',
  'trend.js',
  'offline.js',
  'app.js',
  'manifest.webmanifest',
  'fonts/plex-serif-400.woff',
  'fonts/plex-serif-700.woff',
  'fonts/instrument-sans-400.woff',
  'fonts/instrument-sans-700.woff',
  'icons/logo.svg',
  'icons/mark.svg',
  'icons/guilloche.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Dados e login do Supabase: sempre pela rede, nunca em cache.
  if (url.hostname.endsWith('.supabase.co')) return;

  // Biblioteca do CDN: usa a cópia guardada e atualiza em segundo plano.
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => { cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Arquivos do app: rede primeiro (pega novidades), cache se estiver offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
        )
    );
  }
});
