const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PpxKabuk = require('../pwa/ppx-kabuk.js');
const PpxDb = require('../ortak/ppx-db.js');
const PpxFs = require('../ortak/ppx-fs.js');
const PpxGitHub = require('../ortak/ppx-github.js');
const yayin = require('../tools/yayin.js');
const { published } = require('../tools/yayinla.js');
const { createFakeGitHub } = require('./fake-github.js');

const ROOT = path.join(__dirname, '..');
const SCOPE = 'https://ornek.github.io/ppx/';
const text = (s) => new TextEncoder().encode(s);

/* ─── Tarayıcı parçalarının sahteleri ───────────────────── */

/** Cache Storage: silinen önbellek açık nesneden kullanılmaya devam eder ama listede görünmez (tarayıcıdaki gibi) */
function fakeCaches() {
  const stores = new Map();
  const keyOf = (req) => (typeof req === 'string' ? req : req.url);
  const box = (map) => ({
    match: async (req) => {
      const hit = map.get(keyOf(req));
      return hit ? new Response(hit.bytes, { status: hit.status, headers: hit.headers }) : undefined;
    },
    put: async (req, res) => {
      map.set(keyOf(req), { bytes: new Uint8Array(await res.arrayBuffer()), status: res.status, headers: [...res.headers] });
    },
    delete: async (req) => map.delete(keyOf(req)),
    keys: async () => [...map.keys()]
  });
  return {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      return box(stores.get(name));
    },
    delete: async (name) => stores.delete(name),
    keys: async () => [...stores.keys()],
    stores
  };
}

function fakeStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map
  };
}

function fakeIndexedDb() {
  const deleted = [];
  return {
    deleted,
    deleteDatabase(name) {
      const req = {};
      setTimeout(() => {
        deleted.push(name);
        req.onsuccess();
      }, 0);
      return req;
    }
  };
}

/** Yayınlanan program: son commit'teki gerçek dosyalar, yayın aracının seçtiği gibi */
function programFiles() {
  const files = new Map();
  for (const entry of yayin.headEntries()) {
    if (entry.type === 'blob' && published(entry.path)) files.set(entry.path, fs.readFileSync(path.join(ROOT, entry.path)));
  }
  return files;
}

let cachedProgram = null;
const program = () => (cachedProgram = cachedProgram || programFiles());

function setup(options) {
  const hub = createFakeGitHub(Object.assign({ owner: 'ben', name: 'ppx-veri' }, options && options.hub));
  hub.handle('PUT', '/repos/ben/ppx-veri/contents/README.md', { content: Buffer.from('# veri').toString('base64'), message: 'ilk' }, { Authorization: `Bearer ${hub.token}` });
  if (!(options && options.noProgram)) hub.publish('program', program());
  const caches = fakeCaches();
  const storage = fakeStorage(options && options.storage);
  const indexedDB = fakeIndexedDb();
  const shell = PpxKabuk.createShell({ scope: SCOPE, caches, storage, fetchFn: hub.fetchFn, indexedDB });
  return { hub, caches, storage, indexedDB, shell };
}

const settingsOf = (storage) => JSON.parse(storage.getItem('ppx_ayarlar') || '{}');

async function serve(caches, url, mode) {
  return PpxKabuk.serveProgram(caches, SCOPE, { url, mode: mode || 'no-cors' });
}

/* ─── Kapı ──────────────────────────────────────────────── */

test('kabuk: cihazda program yokken app/ altında hiçbir şey sunulmaz, sayfa açılışı giriş ekranına döner', async () => {
  const caches = fakeCaches();
  const page = await serve(caches, `${SCOPE}app/index.html`, 'navigate');
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), SCOPE);
  const script = await serve(caches, `${SCOPE}app/ortak/ppx-db.js`);
  assert.equal(script.status, 404);
  assert.equal(await script.text(), '');
});

test('kabuk: geçersiz anahtar, erişimsiz ve herkese açık depo kabul edilmez; hiçbir şey saklanmaz', async () => {
  const { hub, caches, storage, shell } = setup();
  let res = await shell.login('ben/ppx-veri', 'yanlis');
  assert.equal(res.state, 'login');
  assert.match(res.error, /geçersiz/);
  res = await shell.login('baskasi/depo', hub.token);
  assert.match(res.error, /bulunamadı/);
  res = await shell.login('depo-adi-yok', hub.token);
  assert.match(res.error, /kullanici\/depo/);
  assert.deepEqual(await caches.keys(), []);
  assert.deepEqual(settingsOf(storage), {});

  const open = setup({ hub: { isPrivate: false } });
  res = await open.shell.login('ben/ppx-veri', open.hub.token);
  assert.match(res.error, /herkese açık/);
  assert.deepEqual(settingsOf(open.storage), {});
  assert.equal(open.hub.stats.blobGets, 0);
});

test('kabuk: girişte program indirilir; sayfalar, betikler ve logolar doğru türle app/ altından sunulur', async () => {
  const { hub, caches, storage, shell } = setup();
  const progress = [];
  const res = await shell.login('https://github.com/ben/ppx-veri.git', ` ${hub.token} `, (p) => progress.push(p));
  assert.equal(res.state, 'ready', res.error);
  // Anahtar programla ortak yere yazılır; depo adı GitHub'daki yazımıyla
  assert.deepEqual(settingsOf(storage), { mode: 'github', repo: 'ben/ppx-veri', token: hub.token });
  const files = program();
  assert.equal(progress.at(-1).done, files.size);
  // Aynı içerik (iki programdaki yazı tipleri) bir kez iner
  assert.equal(hub.stats.blobGets, new Set([...files.values()].map((b) => require('./fake-github.js').blobSha(b))).size);

  const pages = ['index.html', 'P-IDX/P&ID/codes/cizim.html', 'PNOMATIKX/PNOMATIK/codes/cizim.html'];
  for (const page of pages) {
    const pageUrl = PpxKabuk.programUrl(SCOPE, page);
    const res2 = await serve(caches, pageUrl, 'navigate');
    assert.equal(res2.status, 200, page);
    assert.match(res2.headers.get('content-type'), /^text\/html/);
    const html = await res2.text();
    assert.equal(html, files.get(page).toString('utf8'));
    // Sayfanın yüklediği her dosya tarayıcının çözdüğü adresten sunulur
    for (const [, src] of html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|png|svg))"/g)) {
      const asset = await serve(caches, new URL(src, pageUrl).href);
      assert.equal(asset.status, 200, `${page}: ${src}`);
      const type = asset.headers.get('content-type');
      if (src.endsWith('.js')) assert.match(type, /^text\/javascript/, src);
      if (src.endsWith('.css')) assert.match(type, /^text\/css/, src);
    }
  }
  // Klasör adresi index.html'dir; P&ID hem P%26ID hem P&ID yazımıyla bulunur
  assert.equal((await serve(caches, `${SCOPE}app/`, 'navigate')).status, 200);
  const logo = await serve(caches, `${SCOPE}app/P-IDX/P&ID/assets/logos/dolfin.png`);
  assert.equal(logo.status, 200);
  assert.equal(logo.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await logo.arrayBuffer()), files.get('P-IDX/P&ID/assets/logos/dolfin.png'));
  // Olmayan dosya ve üst klasöre çıkma sunulmaz
  assert.equal((await serve(caches, `${SCOPE}app/yok.js`)).status, 404);
  assert.equal(PpxKabuk.programPath(SCOPE, `${SCOPE}app/%2e%2e/sw.js`), null);
  assert.equal(PpxKabuk.programPath(SCOPE, `${SCOPE}index.html`), null);
  assert.equal(PpxKabuk.programPath(SCOPE, 'https://baska.site/ppx/app/index.html'), null);
});

test('kabuk: program değişmediyse açılış tek istektir; yeni yayında yalnız değişen dosya iner, eski sürüm silinir', async () => {
  const { hub, caches, shell } = setup();
  await shell.login('ben/ppx-veri', hub.token);
  const first = await shell.installed();

  const before = Object.assign({}, hub.stats);
  let res = await shell.start();
  assert.equal(res.state, 'ready');
  assert.equal(res.updated, undefined);
  assert.equal(hub.stats.get - before.get, 1);

  const files = new Map(program());
  files.set('ortak/ppx-boot.js', Buffer.concat([files.get('ortak/ppx-boot.js'), Buffer.from('\n// yeni\n')]));
  files.set('ortak/yeni.js', Buffer.from('// eklendi'));
  files.delete('P-IDX/P&ID/symbols/README.txt');
  hub.publish('program', files);
  const blobs = hub.stats.blobGets;
  res = await shell.start();
  assert.equal(res.state, 'ready');
  assert.equal(res.updated, true);
  assert.equal(hub.stats.blobGets - blobs, 2);
  assert.equal(res.program.downloaded, 2);
  assert.notEqual(res.program.cache, first.cache);
  assert.deepEqual((await caches.keys()).filter((k) => k.startsWith('ppx-program-')), [res.program.cache]);
  assert.match(await (await serve(caches, `${SCOPE}app/ortak/ppx-boot.js`)).text(), /\/\/ yeni/);
  assert.equal((await serve(caches, `${SCOPE}app/ortak/yeni.js`)).status, 200);
  assert.equal((await serve(caches, `${SCOPE}app/P-IDX/P%26ID/symbols/README.txt`)).status, 404);
  assert.equal((await serve(caches, `${SCOPE}app/P-IDX/P%26ID/codes/host.js`)).status, 200);
});

test('kabuk: anahtar geçersizleşince ya da depoya erişim kalkınca program cihazdan silinir, anahtar unutulur, depo adı kalır', async () => {
  for (const revoke of [
    (hub) => { hub.hooks.fail = () => ({ status: 401, json: { message: 'Bad credentials' }, headers: {} }); },
    (hub) => { hub.hooks.fail = () => ({ status: 404, json: { message: 'Not Found' }, headers: {} }); },
    (hub) => { hub.hooks.fail = () => ({ status: 403, json: { message: 'Resource not accessible by personal access token' }, headers: {} }); }
  ]) {
    const { hub, caches, storage, shell } = setup();
    await shell.login('ben/ppx-veri', hub.token);
    revoke(hub);
    const res = await shell.start();
    assert.equal(res.state, 'login');
    assert.ok(res.error);
    assert.deepEqual((await caches.keys()).filter((k) => k.startsWith('ppx-program-')), []);
    assert.equal(await shell.installed(), null);
    assert.deepEqual(settingsOf(storage), { repo: 'ben/ppx-veri' });
    assert.equal((await serve(caches, `${SCOPE}app/index.html`, 'navigate')).status, 302);
    // Anahtar olmadan açılış ağa gitmeden giriş ister
    const gets = hub.stats.get;
    assert.equal((await shell.start()).state, 'login');
    assert.equal(hub.stats.get, gets);
  }
});

test('kabuk: GitHub hız sınırı ve sunucu hatası programı silmez', async () => {
  const { hub, caches, shell } = setup();
  await shell.login('ben/ppx-veri', hub.token);
  hub.hooks.fail = () => ({ status: 403, json: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-remaining': '0' } });
  assert.equal((await shell.start()).state, 'ready');
  hub.hooks.fail = () => ({ status: 502, json: { message: 'Bad gateway' }, headers: {} });
  const res = await shell.start();
  assert.equal(res.state, 'ready');
  assert.match(res.warning, /yanıt vermiyor/);
  assert.equal((await serve(caches, `${SCOPE}app/index.html`, 'navigate')).status, 200);
});

test('kabuk: internet yokken cihazdaki program açılır; ilk açılışta internet gerekir', async () => {
  const { hub, shell } = setup();
  await shell.login('ben/ppx-veri', hub.token);
  hub.hooks.network = true;
  let res = await shell.start();
  assert.equal(res.state, 'ready');
  assert.match(res.warning, /İnternet/);

  const fresh = setup({ storage: { ppx_ayarlar: JSON.stringify({ mode: 'github', repo: 'ben/ppx-veri', token: 'anahtar' }) } });
  fresh.hub.hooks.network = true;
  res = await fresh.shell.start();
  assert.equal(res.state, 'error');
  assert.match(res.error, /İnternet/);
});

test('kabuk: bozuk ya da yarım indirme kullanılmaz, eski program yerinde kalır', async () => {
  const { hub, caches, shell } = setup();
  await shell.login('ben/ppx-veri', hub.token);
  const files = new Map(program());
  files.set('index.html', Buffer.from('<!DOCTYPE html><p>YENI-SURUM</p>'));
  hub.publish('program', files);
  // GitHub başka içerik döndürürse kimlik tutmaz
  hub.hooks.fail = (method, p) => (p.startsWith('/git/blobs/')
    ? { status: 200, json: { content: Buffer.from('bozuk').toString('base64'), encoding: 'base64' }, headers: {} }
    : null);
  const res = await shell.start();
  assert.equal(res.state, 'ready');
  assert.match(res.warning, /indirilemedi/);
  assert.doesNotMatch(await (await serve(caches, `${SCOPE}app/index.html`, 'navigate')).text(), /YENI-SURUM/);
  assert.equal((await caches.keys()).filter((k) => k.startsWith('ppx-program-')).length, 1);
  // Sonraki açılışta düzgün iner
  hub.hooks.fail = null;
  assert.equal((await shell.start()).updated, true);
  assert.match(await (await serve(caches, `${SCOPE}app/index.html`, 'navigate')).text(), /YENI-SURUM/);
});

test('kabuk: depoda yayınlanmış program yoksa anlaşılır hata; ana dalı program olan depo kabul edilmez', async () => {
  const { hub, storage, shell } = setup({ noProgram: true });
  const res = await shell.login('ben/ppx-veri', hub.token);
  assert.equal(res.state, 'error');
  assert.match(res.error, /npm run yayinla/);
  // Anahtar geçerli, saklanır; program yayınlanınca açılır
  assert.equal(settingsOf(storage).token, hub.token);
  hub.publish('program', program());
  assert.equal((await shell.start()).state, 'ready');

  const wrong = setup({ hub: { branch: 'program' } });
  assert.match((await wrong.shell.login('ben/ppx-veri', wrong.hub.token)).error, /ana dalı/);
});

test('kabuk: çıkış programı, anahtarı, programların tarayıcıya yazdıklarını ve veri kopyasını siler', async () => {
  const { hub, caches, storage, indexedDB, shell } = setup({ storage: { pidx_pano: '[]', pidx_dock: '{}', baska_site: 'kalir' } });
  await shell.login('ben/ppx-veri', hub.token);
  await shell.logout();
  assert.deepEqual(settingsOf(storage), { repo: 'ben/ppx-veri' });
  assert.equal(storage.getItem('pidx_pano'), null);
  assert.equal(storage.getItem('pidx_dock'), null);
  assert.equal(storage.getItem('baska_site'), 'kalir');
  assert.deepEqual(indexedDB.deleted, ['ppx-veri', 'pidx-host', 'pnomatikx-host']);
  assert.equal(await shell.installed(), null);
  assert.equal((await serve(caches, `${SCOPE}app/index.html`, 'navigate')).status, 302);
});

/* ─── Yayın ─────────────────────────────────────────────── */

test('yayın: müşteri verisi, testler, araçlar, belgeler ve kabuk yayınlanmaz; her sayfanın yüklediği dosya yayındadır', () => {
  const files = program();
  for (const p of files.keys()) {
    assert.doesNotMatch(p, /^(pwa|tools|test|_yedek)\/|\/test\/|\/tools\/|\/projects\/|^P-IDX\/ML\/|\.md$|package\.json$/, p);
  }
  for (const p of ['index.html', 'ortak/ppx-boot.js', 'P-IDX/P&ID/data/kod.csv', 'P-IDX/P&ID/data/surum.json', 'PNOMATIKX/PNOMATIK/assets/logos/dolfin.png']) {
    assert.ok(files.has(p), p);
  }
  for (const page of ['index.html', 'P-IDX/index.html', 'PNOMATIKX/index.html', 'P-IDX/P&ID/codes/cizim.html', 'PNOMATIKX/PNOMATIK/codes/cizim.html']) {
    const html = files.get(page).toString('utf8');
    for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css|png|svg|html))"/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(page), decodeURIComponent(ref)));
      assert.ok(files.has(target), `${page}: ${ref}`);
    }
  }
  // Başlıktaki logolar betikten adresle yüklenir
  for (const dir of ['P-IDX/P&ID', 'PNOMATIKX/PNOMATIK']) {
    for (const [, ref] of files.get(`${dir}/codes/header.js`).toString('utf8').matchAll(/'\.\.\/(assets\/logos\/[^']+)'/g)) {
      assert.ok(files.has(`${dir}/${ref}`), `${dir}: ${ref}`);
    }
  }
});

test('kabuk dosyaları: hizmet çalışanının sakladığı her dosya var; sitede program kodu ve dış betik yok', () => {
  const dir = path.join(ROOT, 'pwa');
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const list = JSON.parse(sw.match(/const SHELL_FILES = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  for (const file of list) assert.ok(fs.existsSync(path.join(dir, file || 'index.html')), file);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(dir, icon.src)), icon.src);
    assert.ok(list.includes(icon.src), `${icon.src} çevrimdışı da gerekli`);
  }
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
  assert.ok(fs.existsSync(path.join(dir, '404.html')));
  assert.ok(fs.existsSync(path.join(dir, '.nojekyll')));
  for (const file of fs.readdirSync(dir)) {
    if (!/\.(html|js|webmanifest)$/.test(file)) continue;
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.doesNotMatch(content, /<script[^>]+src="https?:/i, file);
    assert.doesNotMatch(content, /ppx-db\.js|ppx-fs\.js|cizim\.html|TheVanerr/i, `${file}: program ya da depo bilgisi sitede olmamalı`);
  }
});

/* ─── Programın web uygulaması davranışı ────────────────── */

test('web uygulaması: program verilerini güncelle klasör seçmeden indirilen programın kataloğunu kullanır', async () => {
  const fetchFn = async (url) => {
    const rel = decodeURIComponent(new URL(url).pathname.replace(/^\/ppx\/app\/P-IDX\//, ''));
    const file = path.join(ROOT, 'P-IDX', rel);
    return fs.existsSync(file) ? new Response(fs.readFileSync(file)) : new Response('', { status: 404 });
  };
  const dir = PpxFs.programFolder(`${SCOPE}app/P-IDX/`, 'P&PX programı', fetchFn);
  const db = PpxDb.createDb({ local: PpxDb.memoryLocal() });
  await db.write('P&ID/data/kod.csv', text('KOD;AD\nV31;Eski\n'));
  await db.write('P&ID/projects/A/proje.json', text('{"ad":"A"}'));
  const plan = await PpxFs.planProgramData(db, dir);
  assert.equal(plan.ok, true, plan.error);
  assert.ok(plan.files.some((f) => f.path === 'P&ID/data/kod.csv' && !f.isNew));
  assert.ok(plan.files.some((f) => f.path === 'P&ID/data/guvenlik.csv' && f.isNew));
  const res = await PpxFs.applyProgramData(db, plan);
  assert.equal(res.ok, true);
  assert.deepEqual(Buffer.from((await db.read('P&ID/data/kod.csv')).bytes), fs.readFileSync(path.join(ROOT, 'P-IDX/P&ID/data/kod.csv')));
  assert.ok(await db.read('P&ID/projects/A/proje.json'));
  // Programda olmayan dosya görünmez
  await assert.rejects(dir.getDirectoryHandle('ML'), { name: 'NotFoundError' });
});

test('web uygulaması: eşitleme durumu geçersiz anahtarı (401) bildirir', async () => {
  const hub = createFakeGitHub();
  const db = PpxDb.createDb({ local: PpxDb.memoryLocal(), remote: PpxGitHub.createRemote({ repo: hub.id, token: 'yanlis', fetchFn: hub.fetchFn }), flushMs: 3600000 });
  await db.write('a.txt', text('a'));
  const s = await db.sync();
  assert.equal(s.state, 'error');
  assert.equal(s.code, 401);
  const ok = PpxDb.createDb({ local: PpxDb.memoryLocal(), remote: PpxGitHub.createRemote({ repo: hub.id, token: hub.token, fetchFn: hub.fetchFn }), flushMs: 3600000 });
  assert.equal((await ok.sync()).code, 0);
});

test('web uygulaması: anahtarsız sayfa giriş ekranına döner, yerel mod ve klasör seçimi yoktur, çıkış önce eşitler', () => {
  const boot = fs.readFileSync(path.join(ROOT, 'ortak/ppx-boot.js'), 'utf8');
  // Yalnız hizmet çalışanının app/ altından sunduğu sayfa web uygulamasıdır; dosyadan açılış eskisi gibi çalışır
  assert.match(boot, /const pwa = !!\(navigator\.serviceWorker && navigator\.serviceWorker\.controller\) && \/\\\/app\\\/\$\/\.test\(appRoot\.pathname\);/);
  assert.match(boot, /const locked = pwa && !hasKey\(\);\s*if \(locked\) \{[\s\S]*?location\.replace\(shellUrl\);/);
  assert.match(boot, /if \(locked\) return new Promise\(\(\) => \{\}\);/);
  assert.match(boot, /if \(pwa && s\.state === 'error' && s\.code === 401\) toShell\(\);/);
  const logout = boot.slice(boot.indexOf('async function logout'), boot.indexOf('const locked'));
  assert.ok(logout.indexOf('db.sync()') < logout.indexOf('LOGOUT_FLAG'), 'çıkıştan önce eşitlenmeli');
  assert.match(logout, /if \(s\.pending\) return/);

  const launcher = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(launcher, /if \(PpxBoot\.locked\) return;/);
  assert.match(launcher, /PpxFs\.programFolder\(new URL\('P-IDX\/', location\.href\)\.href/);
  assert.match(launcher, /const dir = await programSource\(\);/);
  assert.match(launcher, /confirm\(`\$\{res\.pending\} dosya depoya gönderilemedi/);

  // Çıkış işareti oturuma özeldir: başka siteden bağlantıyla veri silinemez
  const shell = fs.readFileSync(path.join(ROOT, 'pwa/index.html'), 'utf8');
  assert.match(shell, /sessionStorage\.getItem\(LOGOUT_FLAG\)/);
  assert.doesNotMatch(shell, /searchParams\.(get|has)\('cikis'\)|location\.search/);
  assert.match(boot, /const LOGOUT_FLAG = 'ppx_cikis';/);
  assert.match(shell, /const LOGOUT_FLAG = 'ppx_cikis';/);
});
