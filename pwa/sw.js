/* Hizmet çalışanı. Giriş ekranını internet yokken de açar; app/ altındaki her isteği cihazdaki programdan karşılar.
   Program bu sitede yoktur: giriş ekranı erişim anahtarıyla özel depodan indirir (ppx-kabuk.js).
   Cihazda program yoksa app/ altında hiçbir şey sunulmaz, sayfa açılışı giriş ekranına döner. */

importScripts('ppx-kabuk.js');

const SHELL_CACHE = 'ppx-kabuk-dosyalar';
// '' sitenin kök adresidir (giriş ekranı)
const SHELL_FILES = ['', 'ppx-kabuk.js', 'manifest.webmanifest', 'simge.svg', 'simge-192.png', 'simge-512.png', 'simge-maskeli-512.png', 'apple-touch-icon.png'];
const scope = self.registration.scope;
const scopePath = new URL(scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES.map((file) => new Request(new URL(file || './', scope), { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/** Giriş ekranı önce cihazdan açılır, arkada yenilenir: internet yokken de açılır, sitedeki değişiklik sonraki açılışta görünür */
async function serveShell(event, file) {
  const cache = await caches.open(SHELL_CACHE);
  const key = new URL(file || './', scope).href;
  const cached = await cache.match(key);
  const network = fetch(event.request)
    .then(async (res) => {
      // Yönlendirilmiş yanıt sayfa açılışında kullanılamaz, saklanmaz
      if (res.ok && !res.redirected) await cache.put(key, res.clone());
      return res;
    })
    .catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || new Response('İnternet bağlantısı yok.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // GitHub ve başka adresler olduğu gibi geçer
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scopePath)) return;
  if (PpxKabuk.programPath(scope, url.href) !== null) {
    event.respondWith(PpxKabuk.serveProgram(caches, scope, request));
    return;
  }
  const rel = url.pathname.slice(scopePath.length);
  const file = rel === 'index.html' ? '' : rel;
  if (SHELL_FILES.includes(file)) event.respondWith(serveShell(event, file));
});
