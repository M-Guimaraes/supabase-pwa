const CACHE = 'caixa-v33';
const SHELL = [
  './',
  'index.html',
  'design-tokens.css',
  'styles.css',
  'vendor/supabase-js-2.117.2.js',
  'importer.js',
  'recurring.js',
  'budget.js',
  'exporter.js',
  'quick.js',
  'password.js',
  'classifier.js',
  'period.js',
  'trend.js',
  'household.js',
  'movements.js',
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
    // cache: 'reload' ignora o cache HTTP do navegador: sem isso, uma versão nova pode ser
    // instalada com arquivos da anterior (o GitHub Pages manda guardar por 10 minutos).
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
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

  // Arquivos do app: rede primeiro (pega novidades), cache se estiver offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      // 'no-cache' confere com o servidor a cada vez (resposta 304 quando nada mudou), para
      // index.html e app.js nunca virem de versões diferentes depois de uma publicação.
      fetch(req.url, { cache: 'no-cache' })
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
