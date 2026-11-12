const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PpxKabuk = require('../pwa/ppx-kabuk.js');
const PpxDb = require('../ortak/ppx-db.js');
const PpxFs = require('../ortak/ppx-fs.js');
const PpxGitHub = require('../ortak/ppx-github.js');
const { createFakeGitHub, blobSha } = require('./fake-github.js');

const ROOT = path.join(__dirname, '..');
const SCOPE = 'https://ben.github.io/P-PX/';
const PROGRAM = { repo: 'ben/P-PX', branch: 'main' };
const text = (s) => new TextEncoder().encode(s);
const str = (b) => new TextDecoder().decode(b);

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

/* ─── Depolar: özel veri deposu ve herkese açık program deposu (bu depo) ── */

/** Program deposunun main dalı: bu depodaki bütün izlenen dosyalar, müşteri verisi ve testler dahil */
let cachedRepo = null;
function repoFiles() {
  if (!cachedRepo) {
    cachedRepo = new Map();
    const list = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString('utf8').split('\0').filter(Boolean);
    for (const p of list) {
      const file = path.join(ROOT, p);
      if (fs.existsSync(file)) cachedRepo.set(p, fs.readFileSync(file));
    }
  }
  return cachedRepo;
}
const programFiles = () => new Map([...repoFiles()].filter(([p]) => PpxKabuk.isProgramFile(p)));

function setup(options) {
  const opts = options || {};
  const data = createFakeGitHub(Object.assign({ owner: 'ben', name: 'ppx-veri' }, opts.data));
  data.handle('PUT', '/repos/ben/ppx-veri/contents/README.md', { content: Buffer.from('# veri').toString('base64'), message: 'ilk' }, { Authorization: `Bearer ${data.token}` });
  const code = createFakeGitHub({ owner: 'ben', name: 'P-PX', isPrivate: false });
  code.publish('main', repoFiles());
  const fetchFn = (url, init) => (url.includes('/repos/ben/P-PX') ? code : data).fetchFn(url, init);
  const caches = fakeCaches();
  const storage = fakeStorage(opts.storage);
  const indexedDB = fakeIndexedDb();
  const shell = PpxKabuk.createShell({ scope: SCOPE, program: opts.program || PROGRAM, caches, storage, fetchFn, indexedDB });
  const both = (fn) => { fn(data); fn(code); };
  return { data, code, both, caches, storage, indexedDB, shell };
}

const settingsOf = (storage) => JSON.parse(storage.getItem('ppx_ayarlar') || '{}');
const programCaches = async (caches) => (await caches.keys()).filter((k) => k.startsWith('ppx-program-'));
const serve = (caches, url, mode) => PpxKabuk.serveProgram(caches, SCOPE, { url, mode: mode || 'no-cors' });
const fail = (status, message, headers) => () => ({ status, json: { message }, headers: headers || {} });

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

test('kabuk: geçersiz anahtar, erişimsiz ve herkese açık depo kabul edilmez; hiçbir şey saklanmaz, program inmez', async () => {
  const { data, code, caches, storage, shell } = setup();
  let res = await shell.login('ben/ppx-veri', 'yanlis');
  assert.equal(res.state, 'login');
  assert.match(res.error, /geçersiz/);
  res = await shell.login('baskasi/depo', data.token);
  assert.match(res.error, /bulunamadı/);
  res = await shell.login('depo-adi-yok', data.token);
  assert.match(res.error, /kullanici\/depo/);
  // Herkese açık program deposu veri deposu yerine girilirse
  res = await shell.login('ben/P-PX', data.token);
  assert.match(res.error, /herkese açık/);
  assert.deepEqual(await caches.keys(), []);
  assert.deepEqual(settingsOf(storage), {});
  assert.equal(code.stats.blobGets, 0);

  const open = setup({ data: { isPrivate: false } });
  res = await open.shell.login('ben/ppx-veri', open.data.token);
  assert.match(res.error, /herkese açık/);
  assert.deepEqual(settingsOf(open.storage), {});
});

test('kabuk: girişte program P-PX main\'den iner; sayfalar, betikler ve logolar doğru türle app/ altından sunulur', async () => {
  const { data, code, caches, storage, shell } = setup();
  const progress = [];
  const res = await shell.login('https://github.com/ben/ppx-veri.git', ` ${data.token} `, (p) => progress.push(p));
  assert.equal(res.state, 'ready', res.error);
  // Anahtar programla ortak yere yazılır; depo adı GitHub'daki yazımıyla
  assert.deepEqual(settingsOf(storage), { mode: 'github', repo: 'ben/ppx-veri', token: data.token });
  const files = programFiles();
  assert.equal(progress.at(-1).done, files.size);
  // Aynı içerik (iki programdaki yazı tipleri) bir kez iner
  assert.equal(code.stats.blobGets, new Set([...files.values()].map(blobSha)).size);
  assert.equal(data.stats.blobGets, 0);

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
  assert.equal(PpxKabuk.programPath(SCOPE, 'https://baska.site/P-PX/app/index.html'), null);
});

test('kabuk: program deposundaki müşteri verisi, testler, araçlar, belgeler ve kabuk inmez', async () => {
  const { data, caches, shell } = setup();
  await shell.login('ben/ppx-veri', data.token);
  const all = [...repoFiles().keys()];
  const skipped = all.filter((p) => !PpxKabuk.isProgramFile(p));
  for (const p of ['P-IDX/ML/kayitlar/kodlar.json', 'P-IDX/ML/KODListesi.csv', 'test/ppx.test.js', 'pwa/index.html', 'README.md', 'package.json', 'P-IDX/tools/veri-surumu.js', 'P-IDX/P&ID/codes/engine/test/engine.test.js']) {
    assert.ok(skipped.includes(p), p);
  }
  assert.ok(skipped.some((p) => p.startsWith('P-IDX/P&ID/projects/')), 'örnek müşteri projesi');
  for (const p of skipped) assert.equal((await serve(caches, PpxKabuk.programUrl(SCOPE, p))).status, 404, p);
  const state = await shell.installed();
  assert.deepEqual(Object.keys(state.files).sort(), [...programFiles().keys()].sort());
});

test('kabuk: program değişmediyse açılış iki küçük istektir; main\'e push edilince yalnız değişen dosya iner', async () => {
  const { data, code, caches, shell } = setup();
  await shell.login('ben/ppx-veri', data.token);
  const first = await shell.installed();

  const before = { data: data.stats.get, code: code.stats.get };
  let res = await shell.start();
  assert.equal(res.state, 'ready');
  assert.equal(res.updated, undefined);
  assert.equal(data.stats.get - before.data, 1, 'veri deposuna erişim denetimi');
  assert.equal(code.stats.get - before.code, 1, 'programın son commit\'i');

  const files = new Map(repoFiles());
  files.set('ortak/ppx-boot.js', Buffer.concat([files.get('ortak/ppx-boot.js'), Buffer.from('\n// yeni\n')]));
  files.set('ortak/yeni.js', Buffer.from('// eklendi'));
  files.set('test/yeni.test.js', Buffer.from('// inmez'));
  files.delete('P-IDX/P&ID/symbols/README.txt');
  code.publish('main', files);
  const blobs = code.stats.blobGets;
  res = await shell.start();
  assert.equal(res.state, 'ready');
  assert.equal(res.updated, true);
  assert.equal(code.stats.blobGets - blobs, 2);
  assert.equal(res.program.downloaded, 2);
  assert.notEqual(res.program.cache, first.cache);
  assert.deepEqual(await programCaches(caches), [res.program.cache]);
  assert.match(await (await serve(caches, `${SCOPE}app/ortak/ppx-boot.js`)).text(), /\/\/ yeni/);
  assert.equal((await serve(caches, `${SCOPE}app/ortak/yeni.js`)).status, 200);
  assert.equal((await serve(caches, `${SCOPE}app/P-IDX/P%26ID/symbols/README.txt`)).status, 404);
  assert.equal((await serve(caches, `${SCOPE}app/P-IDX/P%26ID/codes/host.js`)).status, 200);
});

test('kabuk: anahtar geçersizleşince ya da veri deposuna erişim kalkınca program cihazdan silinir, anahtar unutulur, depo adı kalır', async () => {
  const cases = [
    ['anahtar silindi', (s) => s.both((h) => { h.hooks.fail = fail(401, 'Bad credentials'); })],
    ['veri deposu anahtardan çıkarıldı', (s) => { s.data.hooks.fail = fail(404, 'Not Found'); }],
    ['izin kaldırıldı', (s) => { s.data.hooks.fail = fail(403, 'Resource not accessible by personal access token'); }]
  ];
  for (const [label, revoke] of cases) {
    const s = setup();
    await s.shell.login('ben/ppx-veri', s.data.token);
    revoke(s);
    const res = await s.shell.start();
    assert.equal(res.state, 'login', label);
    assert.ok(res.error, label);
    assert.deepEqual(await programCaches(s.caches), [], label);
    assert.equal(await s.shell.installed(), null, label);
    assert.deepEqual(settingsOf(s.storage), { repo: 'ben/ppx-veri' }, label);
    assert.equal((await serve(s.caches, `${SCOPE}app/index.html`, 'navigate')).status, 302, label);
    // Anahtar olmadan açılış ağa gitmeden giriş ister
    const gets = s.data.stats.get + s.code.stats.get;
    assert.equal((await s.shell.start()).state, 'login', label);
    assert.equal(s.data.stats.get + s.code.stats.get, gets, label);
  }
});

test('kabuk: program deposuna erişilemezse (özel yapıldı) cihazdaki program açılır, anahtar korunur', async () => {
  const { data, code, storage, shell } = setup();
  await shell.login('ben/ppx-veri', data.token);
  code.hooks.fail = fail(404, 'Not Found');
  const res = await shell.start();
  assert.equal(res.state, 'ready');
  assert.match(res.warning, /Program deposuna \(ben\/P-PX\) erişilemiyor/);
  assert.equal(settingsOf(storage).token, data.token);

  const fresh = setup({ storage: { ppx_ayarlar: JSON.stringify({ mode: 'github', repo: 'ben/ppx-veri', token: 'anahtar' }) } });
  fresh.code.hooks.fail = fail(404, 'Not Found');
  const first = await fresh.shell.start();
  assert.equal(first.state, 'error');
  assert.match(first.error, /erişim anahtarına bu depo da eklenmeli/);
});

test('kabuk: GitHub hız sınırı ve sunucu hatası programı silmez', async () => {
  const { data, caches, shell } = setup();
  await shell.login('ben/ppx-veri', data.token);
  data.hooks.fail = fail(403, 'API rate limit exceeded', { 'x-ratelimit-remaining': '0' });
  assert.equal((await shell.start()).state, 'ready');
  data.hooks.fail = fail(502, 'Bad gateway');
  const res = await shell.start();
  assert.equal(res.state, 'ready');
  assert.match(res.warning, /yanıt vermiyor/);
  assert.equal((await serve(caches, `${SCOPE}app/index.html`, 'navigate')).status, 200);
});

test('kabuk: internet yokken cihazdaki program açılır; ilk açılışta internet gerekir', async () => {
  const s = setup();
  await s.shell.login('ben/ppx-veri', s.data.token);
  s.both((h) => { h.hooks.network = true; });
  let res = await s.shell.start();
  assert.equal(res.state, 'ready');
  assert.match(res.warning, /İnternet/);

  const fresh = setup({ storage: { ppx_ayarlar: JSON.stringify({ mode: 'github', repo: 'ben/ppx-veri', token: 'anahtar' }) } });
  fresh.both((h) => { h.hooks.network = true; });
  res = await fresh.shell.start();
  assert.equal(res.state, 'error');
  assert.match(res.error, /İnternet/);
});

test('kabuk: bozuk ya da yarım indirme kullanılmaz, eski program yerinde kalır', async () => {
  const { data, code, caches, shell } = setup();
  await shell.login('ben/ppx-veri', data.token);
  const files = new Map(repoFiles());
  files.set('index.html', Buffer.from('<!DOCTYPE html><p>YENI-SURUM</p>'));
  code.publish('main', files);
  // GitHub başka içerik döndürürse kimlik tutmaz
  code.hooks.fail = (method, p) => (p.startsWith('/git/blobs/')
    ? { status: 200, json: { content: Buffer.from('bozuk').toString('base64'), encoding: 'base64' }, headers: {} }
    : null);
  const res = await shell.start();
  assert.equal(res.state, 'ready');
  assert.match(res.warning, /indirilemedi/);
  assert.doesNotMatch(await (await serve(caches, `${SCOPE}app/index.html`, 'navigate')).text(), /YENI-SURUM/);
  assert.equal((await programCaches(caches)).length, 1);
  // Sonraki açılışta düzgün iner
  code.hooks.fail = null;
  assert.equal((await shell.start()).updated, true);
  assert.match(await (await serve(caches, `${SCOPE}app/index.html`, 'navigate')).text(), /YENI-SURUM/);
});

test('kabuk: çıkış programı, anahtarı, programların tarayıcıya yazdıklarını ve veri kopyasını siler', async () => {
  const { data, caches, storage, indexedDB, shell } = setup({ storage: { pidx_pano: '[]', pidx_dock: '{}', baska_site: 'kalir' } });
  await shell.login('ben/ppx-veri', data.token);
  await shell.logout();
  assert.deepEqual(settingsOf(storage), { repo: 'ben/ppx-veri' });
  assert.equal(storage.getItem('pidx_pano'), null);
  assert.equal(storage.getItem('pidx_dock'), null);
  assert.equal(storage.getItem('baska_site'), 'kalir');
  assert.deepEqual(indexedDB.deleted, ['ppx-veri', 'pidx-host', 'pnomatikx-host']);
  assert.equal(await shell.installed(), null);
  assert.equal((await serve(caches, `${SCOPE}app/index.html`, 'navigate')).status, 302);
});

test('kabuk: programın deposu GitHub Pages adresinden anlaşılır, sayfada yazılıysa o kullanılır', () => {
  assert.deepEqual(PpxKabuk.programSource('https://thevanerr.github.io/P-PX/', ''), { repo: 'thevanerr/P-PX', branch: 'main' });
  assert.deepEqual(PpxKabuk.programSource('https://ben.github.io/', ''), { repo: 'ben/ben.github.io', branch: 'main' });
  assert.deepEqual(PpxKabuk.programSource('http://localhost:8080/ppx/', 'ben/P-PX@deneme'), { repo: 'ben/P-PX', branch: 'deneme' });
  assert.equal(PpxKabuk.programSource('http://localhost:8080/ppx/', ''), null);
});

/* ─── Site ──────────────────────────────────────────────── */

test('site: hizmet çalışanının sakladığı her dosya var; sitede program kodu, depo adı ve dış betik yok', () => {
  const dir = path.join(ROOT, 'pwa');
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const list = JSON.parse(sw.match(/const SHELL_FILES = (\[[^\]]*\])/)[1].replace(/'/g, '"'));
  for (const file of list) assert.ok(fs.existsSync(path.join(dir, file || 'index.html')), file);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.webmanifest'), 'utf8'));
  // Kimlik aynı sitedeki başka uygulamalarla karışmasın: adresin kendisi değil, programa özel ad
  assert.equal(manifest.id, 'ppx-pid-pnomatik');
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

test('site: GitHub Pages yalnız pwa/ klasörünü yayınlar, main\'e push edilince', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /uses: actions\/upload-pages-artifact@v\d+\s+with:\s+path: pwa\s/);
  assert.match(workflow, /uses: actions\/deploy-pages@v\d+/);
  assert.match(workflow, /pages: write/);
  assert.doesNotMatch(workflow, /path: \.\s*$/m, 'deponun tamamı yayınlanmamalı');
});

/* ─── Programın web uygulaması davranışı ────────────────── */

test('web uygulaması: program verilerini güncelle klasör seçmeden indirilen programın kataloğunu kullanır', async () => {
  const fetchFn = async (url) => {
    const rel = decodeURIComponent(new URL(url).pathname.replace(/^\/P-PX\/app\/P-IDX\//, ''));
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
  assert.match(boot, /const locked = exposed \|\| \(pwa && !hasKey\(\)\);\s*if \(locked\) \{[\s\S]*?location\.replace\(exposed \? new URL\('\.\.\/pwa\/', ortak\)\.href : shellUrl\);/);
  assert.match(boot, /if \(locked\) return new Promise\(\(\) => \{\}\);/);
  assert.match(boot, /if \(pwa && s\.state === 'error' && s\.code === 401\) toShell\(\);/);
  // Pages yanlışlıkla deponun tamamını yayınlarsa program doğrudan açılmaz, giriş ekranına gidilir
  assert.match(boot, /const exposed = !pwa && \/\^https\?:\$\/\.test\(location\.protocol\) && \/\\\.github\\\.io\$\/i\.test\(location\.hostname\);/);
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

/* ─── Hız: yol listesi bellekte, ilk eşitleme paralel, tek sekme günceller ── */

/** Tarayıcı veritabanından tam okumaları sayar */
function countingLocal() {
  const local = PpxDb.memoryLocal();
  const counts = { all: 0 };
  const all = local.all;
  local.all = async () => {
    counts.all += 1;
    return all();
  };
  return { local, counts };
}

test('hız: klasör görünümü veritabanını her soruda baştan okumaz, bu sekmedeki yazma hemen görünür', async () => {
  const { local, counts } = countingLocal();
  const db = PpxDb.createDb({ local });
  await db.write('P&ID/projects/A/proje.json', text('{}'));
  await db.write('P&ID/assets/fonts/buyuk.ttf', new Uint8Array(500000));
  const root = PpxFs.createRoot(db);
  const before = counts.all;
  for (let i = 0; i < 20; i += 1) {
    const projects = await (await root.getDirectoryHandle('P&ID')).getDirectoryHandle('projects');
    for await (const entry of projects.entries()) assert.ok(entry);
  }
  assert.ok(counts.all - before <= 1, `${counts.all - before} tam okuma`);
  // Yazma ve silme listeyi hemen değiştirir
  await db.write('P&ID/projects/B/proje.json', text('{}'));
  const names = async () => {
    const out = [];
    for await (const [name] of (await (await root.getDirectoryHandle('P&ID')).getDirectoryHandle('projects')).entries()) out.push(name);
    return out.sort();
  };
  assert.deepEqual(await names(), ['A', 'B']);
  await (await (await root.getDirectoryHandle('P&ID')).getDirectoryHandle('projects')).removeEntry('A');
  assert.deepEqual(await names(), ['B']);
  await assert.rejects((await root.getDirectoryHandle('P&ID')).getDirectoryHandle('projects').then((d) => d.getDirectoryHandle('A')), { name: 'NotFoundError' });
});

test('hız: başka sekme aynı veritabanına yazınca bu sekmenin yol listesi yenilenir', async () => {
  const shared = PpxDb.memoryLocal();
  const channel = `ppx-deneme-${Date.now()}`;
  const tabA = PpxDb.createDb({ local: shared, channel });
  const tabB = PpxDb.createDb({ local: shared, channel });
  await tabA.write('P&ID/projects/A/proje.json', text('{}'));
  assert.deepEqual((await tabB.listPaths()).map((r) => r.path), ['P&ID/projects/A/proje.json']);
  await tabA.write('P&ID/projects/B/proje.json', text('{}'));
  // Bildirim kısa bir gecikmeyle gider
  for (let i = 0; i < 50 && (await tabB.listPaths()).length < 2; i += 1) await new Promise((r) => setTimeout(r, 20));
  assert.equal((await tabB.listPaths()).length, 2);
});

test('hız: yeni cihazda ilk eşitleme dosyaları birlikte indirir, içerik aynen gelir', async () => {
  const hub = createFakeGitHub();
  const writer = PpxDb.createDb({ local: PpxDb.memoryLocal(), remote: PpxGitHub.createRemote({ repo: hub.id, token: hub.token, fetchFn: hub.fetchFn }), flushMs: 3600000 });
  for (let i = 0; i < 30; i += 1) await writer.write(`P&ID/projects/P${i}/proje.json`, text(`{"no":${i}}`));
  await writer.write('P&ID/assets/fonts/a.ttf', new Uint8Array(200000).fill(7));
  await writer.sync();
  let active = 0;
  let peak = 0;
  const slowFetch = async (url, init) => {
    const isBlob = url.includes('/git/blobs/');
    if (isBlob) active += 1;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    try {
      return await hub.fetchFn(url, init);
    } finally {
      if (isBlob) active -= 1;
    }
  };
  const fresh = PpxDb.createDb({ local: PpxDb.memoryLocal(), remote: PpxGitHub.createRemote({ repo: hub.id, token: hub.token, fetchFn: slowFetch }), flushMs: 3600000 });
  assert.equal((await fresh.sync()).state, 'ok');
  assert.ok(peak > 1, `aynı anda en çok ${peak} dosya indi`);
  assert.equal((await fresh.read('P&ID/projects/P7/proje.json')) && str((await fresh.read('P&ID/projects/P7/proje.json')).bytes), '{"no":7}');
  assert.equal((await fresh.read('P&ID/assets/fonts/a.ttf')).bytes.length, 200000);
});

test('kabuk: iki sekme aynı anda açılınca yeni sürümü yalnız biri indirir; uygulama programın deposunu cihazdaki kayıttan bilir', async () => {
  const s = setup();
  await s.shell.login('ben/ppx-veri', s.data.token);
  const files = new Map(repoFiles());
  files.set('ortak/yeni.js', Buffer.from('// iki sekme'));
  s.code.publish('main', files);
  let chain = Promise.resolve();
  const lock = (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };
  // Uygulamadaki denetim programın deposunu vermez, cihazdaki programınkini kullanır
  const tab = () => PpxKabuk.createShell({ scope: SCOPE, caches: s.caches, storage: s.storage, fetchFn: (u, i) => (u.includes('/repos/ben/P-PX') ? s.code : s.data).fetchFn(u, i), lock });
  const blobs = s.code.stats.blobGets;
  const [a, b] = await Promise.all([tab().start(), tab().start()]);
  assert.equal(s.code.stats.blobGets - blobs, 1);
  assert.deepEqual([a.updated, b.updated].sort(), [true, undefined].sort());
  assert.equal((await serve(s.caches, `${SCOPE}app/ortak/yeni.js`)).status, 200);
  assert.deepEqual((await s.shell.installed()).source, PROGRAM);
  // Başarılı denetim zamanı yazılır; uygulama bir sonrakini 5 dakika sonra yapar
  assert.ok(Number(s.storage.getItem(PpxKabuk.CHECK_KEY)) > 0);
});

test('web uygulaması: açılış ağı beklemez; geçersiz anahtarda giriş ekranı önce denetler, yeni sürüm arkada iner', () => {
  const boot = fs.readFileSync(path.join(ROOT, 'ortak/ppx-boot.js'), 'utf8');
  const shell = fs.readFileSync(path.join(ROOT, 'pwa/index.html'), 'utf8');
  const kabuk = fs.readFileSync(path.join(ROOT, 'pwa/ppx-kabuk.js'), 'utf8');
  // Giriş ekranı: program ve anahtar varsa hemen açar, uygulama geri gönderdiyse önce denetler
  assert.match(shell, /if \(!recheck && shell\.hasKey\(\) && \(await shell\.installed\(\)\)\) \{\s*location\.replace\(shell\.appUrl\);/);
  const recheckKey = (src) => src.match(/const RECHECK_FLAG = '([^']+)'/)[1];
  assert.equal(recheckKey(boot), recheckKey(shell));
  assert.match(boot.slice(boot.indexOf('function toShell'), boot.indexOf('function toShell') + 500), /sessionStorage\.setItem\(RECHECK_FLAG, '1'\);\s*location\.replace\(shellUrl\);/);
  // Uygulama: arka plan denetimi giriş ekranıyla aynı zaman kaydını kullanır, yeni sürümde sayfayı kendiliğinden yenilemez
  assert.equal(boot.match(/const PROGRAM_CHECK_KEY = '([^']+)'/)[1], kabuk.match(/const CHECK_KEY = '([^']+)'/)[1]);
  assert.match(boot, /if \(res\.state === 'login'\) location\.replace\(shellUrl\);[\s\S]{0,200}else if \(res\.updated && window\.PPX_LAUNCHER\) location\.reload\(\);\s*else if \(res\.updated\) showUpdated\(\);/);
  // Push'tan sonra açılışta hemen denetlenir; yalnız sayfalar arası geçişte GitHub'a üst üste gidilmez
  assert.match(boot, /const PROGRAM_CHECK_MS = 30 \* 1000;/);
  assert.match(boot, /visibilityState === 'visible'\) checkProgram\(\)/);
  // Ana ekran ve az önce eşitlenen sayfa eşitlemeyi beklemez
  assert.match(boot, /else if \(!recent && !window\.PPX_LAUNCHER\) await Promise\.race/);
  assert.match(boot, /channel: 'ppx-veri'/);
});
