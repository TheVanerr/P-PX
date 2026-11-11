/* Web uygulamasının gerçek tarayıcıda denenmesi: Edge ya da Chrome görünmez açılır, kabuk (pwa/) bu bilgisayardan
   GitHub Pages gibi sunulur, GitHub API'si sahte depoyla karşılanır (tarayıcının geliştirici bağlantısıyla).
   Hiçbir şey internete gitmez. npm test'e dahil değildir: npm run test:tarayici
   Denenenler: anahtarsız site boş, giriş, iki program, tam yenileme, çevrimdışı açılış, yeni sürüm, anahtar iptali, çıkış. */

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PpxDb = require('../ortak/ppx-db.js');
const PpxFs = require('../ortak/ppx-fs.js');
const PpxGitHub = require('../ortak/ppx-github.js');
const yayin = require('../tools/yayin.js');
const { published } = require('../tools/yayinla.js');
const { createFakeGitHub } = require('./fake-github.js');

const ROOT = path.join(__dirname, '..');
const PWA = path.join(ROOT, 'pwa');
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
];
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', webmanifest: 'application/manifest+json', png: 'image/png', svg: 'image/svg+xml' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(ok, label, detail) {
  console.log(`${ok ? '✔' : '✖'} ${label}${!ok && detail ? `\n    ${detail}` : ''}`);
  if (!ok) failures += 1;
}

/* ─── Sahte GitHub: veri ana dalda, program "program" dalında ── */

function programFiles(marker) {
  const files = new Map();
  for (const e of yayin.headEntries()) {
    if (e.type === 'blob' && published(e.path)) files.set(e.path, fs.readFileSync(path.join(ROOT, e.path)));
  }
  if (marker) files.set('index.html', Buffer.from(files.get('index.html').toString('utf8').replace('<h1>P&amp;PX</h1>', `<h1>P&amp;PX <span id="surum">${marker}</span></h1>`)));
  return files;
}

/** Programların klasörden aktardığı veriler: iki programın data, assets, projects ve ML klasörleri */
async function seedData(hub) {
  const db = PpxDb.createDb({ local: PpxDb.memoryLocal(), remote: PpxGitHub.createRemote({ repo: hub.id, token: hub.token, fetchFn: hub.fetchFn }), flushMs: 3600000 });
  const walk = (dir, rel) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory()
    ? walk(path.join(dir, d.name), rel ? `${rel}/${d.name}` : d.name)
    : [{ file: path.join(dir, d.name), rel: rel ? `${rel}/${d.name}` : d.name }]));
  for (const source of ['P-IDX', 'PNOMATIKX']) {
    for (const { file, rel } of walk(path.join(ROOT, source), '')) {
      if (!PpxFs.IMPORT_RULES.some((r) => r.test(rel)) || rel.endsWith('.gitkeep') || fs.statSync(file).size > PpxFs.MAX_IMPORT_BYTES) continue;
      await db.write(rel, new Uint8Array(fs.readFileSync(file)));
    }
  }
  for (let i = 0; i < 5 && (await db.sync()).pending; i += 1);
}

/* ─── GitHub Pages gibi sunucu: /ppx/ altında pwa/, olmayan adreste 404.html ── */

function startSite() {
  let online = true;
  const stats = { appMisses: 0 };
  const server = http.createServer((req, res) => {
    if (!online) {
      req.socket.destroy();
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/ppx') {
      res.writeHead(301, { Location: '/ppx/' });
      res.end();
      return;
    }
    let rel = url.pathname.startsWith('/ppx/') ? decodeURIComponent(url.pathname.slice(5)) : null;
    if (rel === '') rel = 'index.html';
    const file = rel && !rel.includes('..') ? path.join(PWA, rel) : null;
    const headers = { 'Cache-Control': 'max-age=600' };
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, Object.assign(headers, { 'Content-Type': TYPES[file.split('.').pop()] || 'application/octet-stream' }));
      res.end(fs.readFileSync(file));
      return;
    }
    if (url.pathname.startsWith('/ppx/app/')) stats.appMisses += 1;
    res.writeHead(404, Object.assign(headers, { 'Content-Type': TYPES.html }));
    res.end(fs.readFileSync(path.join(PWA, '404.html')));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    server,
    port: server.address().port,
    stats,
    setOnline: (value) => { online = value; }
  })));
}

/* ─── Tarayıcı ve geliştirici bağlantısı ─────────────────── */

async function launchBrowser() {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('Edge ya da Chrome bulunamadı');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ppx-tarayici-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(exe, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', 'about:blank'
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    try {
      const info = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      return { proc, profile, ws: info.webSocketDebuggerUrl };
    } catch {
      await sleep(100);
    }
  }
  throw new Error('Tarayıcı açılmadı');
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}`));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };
  const opened = new Promise((r) => { ws.onopen = r; });
  return {
    opened,
    send: (method, params, sessionId) => new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params: params || {}, sessionId }));
    }),
    on: (fn) => listeners.push(fn),
    close: () => ws.close()
  };
}

async function main() {
  const hub = createFakeGitHub({ owner: 'ben', name: 'ppx-veri', token: 'gizli-anahtar' });
  await seedData(hub);
  hub.publish('program', programFiles());
  const site = await startSite();
  const base = `http://localhost:${site.port}/ppx/`;
  const browser = await launchBrowser();
  const client = cdp(browser.ws);
  await client.opened;

  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => client.send(method, params, sessionId);

  const errors = [];
  let apiDown = false;
  const cors = [
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type, Accept' },
    { name: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, PUT, DELETE' },
    { name: 'Content-Type', value: 'application/json; charset=utf-8' }
  ];
  client.on(async (msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error' && !/404|Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION/.test(msg.params.entry.text)) errors.push(msg.params.entry.text);
    if (msg.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true });
    if (msg.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = msg.params;
    if (apiDown) {
      send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' });
      return;
    }
    if (request.method === 'OPTIONS') {
      send('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: cors });
      return;
    }
    const target = request.url.replace('https://api.github.com', '');
    const res = await hub.handle(request.method, target, request.postData ? JSON.parse(request.postData) : null, request.headers);
    const headers = cors.concat(Object.entries(res.headers || {}).map(([name, value]) => ({ name, value: String(value) })));
    send('Fetch.fulfillRequest', { requestId, responseCode: res.status, responseHeaders: headers, body: Buffer.from(JSON.stringify(res.json)).toString('base64') });
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://api.github.com/*', requestStage: 'Request' }] });

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const safeEval = (expression) => evaluate(expression).catch(() => undefined);
  async function waitFor(expression, label, timeout) {
    const end = Date.now() + (timeout || 20000);
    let last;
    while (Date.now() < end) {
      last = await safeEval(expression);
      if (last) return last;
      await sleep(150);
    }
    throw new Error(`Beklenen olmadı: ${label} (adres: ${await safeEval('location.href')})`);
  }
  const go = (url) => send('Page.navigate', { url });
  const visible = (id) => `(() => { const el = document.getElementById('${id}'); return !!el && !el.hidden && el.offsetParent !== null; })()`;

  try {
    /* 1. Anahtarsız: yalnız giriş ekranı, app/ altında hiçbir şey */
    await go(base);
    await waitFor(visible('login'), 'giriş ekranı');
    check(true, 'anahtarsız açılışta giriş ekranı görünür');
    const leaked = await evaluate(`fetch('app/index.html').then(async (r) => ({ status: r.status, url: r.url, text: await r.text() }))`);
    check(!/PpxBoot|ppx-boot/.test(leaked.text), 'anahtarsız app/index.html program içermez', JSON.stringify(leaked).slice(0, 200));
    const script = await evaluate(`fetch('app/ortak/ppx-db.js').then((r) => r.status)`);
    check(script === 404, 'anahtarsız program dosyası 404 döner', script);
    await go(`${base}app/P-IDX/P%26ID/codes/cizim.html`);
    await waitFor(`location.href === '${base}' && ${visible('login')}`, 'program sayfasından giriş ekranına dönüş');
    check(true, 'anahtarsız program sayfası giriş ekranına döner');

    /* 2. Yanlış anahtar */
    await evaluate(`document.getElementById('repo').value = 'ben/ppx-veri'; document.getElementById('token').value = 'yanlis'; document.getElementById('login').requestSubmit(); true`);
    await waitFor(`/geçersiz/.test(document.getElementById('loginMsg').textContent)`, 'yanlış anahtar uyarısı');
    check(true, 'yanlış anahtar reddedilir');

    /* 3. Giriş: program iner, ana ekran açılır, veri depodan gelir */
    await evaluate(`document.getElementById('token').value = 'gizli-anahtar'; document.getElementById('login').requestSubmit(); true`);
    await waitFor(`location.pathname.endsWith('/ppx/app/index.html')`, 'ana ekrana geçiş', 30000);
    await waitFor(`/GitHub deposu: ben\\/ppx-veri/.test(document.getElementById('dbInfo').textContent)`, 'veritabanı bilgisi', 30000);
    const info = await evaluate(`({ pwa: PpxBoot.pwa, db: document.getElementById('dbInfo').textContent, pid: document.getElementById('pidInfo').textContent,
      local: document.getElementById('localOnly').hidden, out: document.getElementById('disconnect').textContent,
      manifest: !!document.querySelector('link[rel=manifest]') })`);
    check(info.pwa === true, 'ana ekran web uygulaması kipinde');
    check(/[1-9]\d* proje/.test(info.pid), 'P&ID projeleri depodan geldi', info.pid);
    check(info.local === true && info.out === 'Çıkış yap', 'yerel mod gizli, "Çıkış yap" var', JSON.stringify(info));
    check(info.manifest, 'ana ekran uygulama bildirimini taşır (yüklenebilir)');

    /* 4. İki program açılır */
    await evaluate(`document.querySelector('a.app[href*="P-IDX"]').click(); true`);
    await waitFor(`location.pathname.includes('/app/P-IDX/') && document.querySelectorAll('#projectList > *').length > 0`, 'P&ID proje listesi', 30000);
    check(true, 'P&ID programı açılır, projeler listelenir');
    const logo = await evaluate(`(() => { const img = document.querySelector('.home-logo'); return img && img.complete && img.naturalWidth > 0; })()`);
    check(logo, 'P&ID logosu cihazdaki programdan yüklenir');
    await go(`${base}app/PNOMATIKX/PNOMATIK/codes/cizim.html`);
    await waitFor(`!!document.getElementById('home') && !!window.PpxBoot && PpxBoot.pwa && !!document.querySelector('.home-link')`, 'Pnömatik ana ekranı', 30000);
    check(true, 'Pnömatik programı açılır');

    /* 5. Tam yenileme hizmet çalışanını atlar: sayfa yine açılmalı */
    await go(`${base}app/P-IDX/P%26ID/codes/cizim.html`);
    await waitFor(`document.querySelectorAll('#projectList > *').length > 0`, 'P&ID yeniden', 30000);
    const misses = site.stats.appMisses;
    await send('Page.reload', { ignoreCache: true });
    await sleep(500);
    await waitFor(`location.pathname.includes('/app/P-IDX/') && document.querySelectorAll('#projectList > *').length > 0`, 'tam yenilemeden sonra P&ID', 30000);
    check(site.stats.appMisses > misses, 'tam yenileme (Ctrl+Shift+R) sitedeki 404 sayfasına düşer, program yine açılır', `404: ${site.stats.appMisses - misses}`);

    /* 6. Çevrimdışı: site ve GitHub kapalı, program cihazdan açılır */
    site.setOnline(false);
    apiDown = true;
    await go(base);
    await waitFor(`location.pathname.endsWith('/ppx/app/index.html') && !!document.getElementById('work') && !document.getElementById('work').hidden`, 'çevrimdışı ana ekran', 30000);
    check(true, 'internet yokken uygulama cihazdan açılır');
    await go(`${base}app/P-IDX/P%26ID/codes/cizim.html`);
    await waitFor(`document.querySelectorAll('#projectList > *').length > 0`, 'çevrimdışı P&ID', 30000);
    check(true, 'internet yokken P&ID projeleri açılır');
    site.setOnline(true);
    apiDown = false;

    /* 7. Yeni sürüm yayınlanınca bir sonraki açılışta gelir, yalnız değişen dosya iner */
    hub.publish('program', programFiles('surum-2'));
    const blobs = hub.stats.blobGets;
    await go(base);
    await waitFor(`location.pathname.endsWith('/ppx/app/index.html') && document.getElementById('surum') && document.getElementById('surum').textContent === 'surum-2'`, 'yeni sürüm', 30000);
    check(hub.stats.blobGets - blobs === 1, 'yeni sürüm açılır, yalnız değişen dosya iner', `${hub.stats.blobGets - blobs} dosya indi`);

    /* 8a. Program verilerini güncelle: klasör seçilmez, indirilen programın kataloğu kullanılır */
    await waitFor(`/GitHub deposu/.test(document.getElementById('dbInfo').textContent)`, 'ana ekran bağlandı', 30000);
    await evaluate(`document.getElementById('updateData').click(); true`);
    await waitFor(`/güncel|farklı|bulunamadı/.test(document.getElementById('result').textContent)`, 'program verileri karşılaştırması', 30000);
    const dataResult = await evaluate(`document.getElementById('result').textContent`);
    check(/güncel \(sürüm \d+\)/.test(dataResult), 'program verilerini güncelle klasör seçmeden çalışır', dataResult);

    /* 8b. Uygulama açıkken anahtar iptal edilirse eşitleme giriş ekranına götürür */
    hub.hooks.fail = () => ({ status: 401, json: { message: 'Bad credentials' }, headers: {} });
    await evaluate(`document.getElementById('syncNow').click(); true`);
    await waitFor(`location.href === '${base}' && ${visible('login')}`, 'açık uygulamada iptal', 30000);
    check(true, 'açık uygulamada anahtar geçersizleşince giriş ekranına dönülür');
    await evaluate(`document.getElementById('token').value = 'gizli-anahtar'; true`);
    hub.hooks.fail = null;
    await evaluate(`document.getElementById('login').requestSubmit(); true`);
    await waitFor(`location.pathname.endsWith('/ppx/app/index.html') && /GitHub deposu/.test(document.getElementById('dbInfo').textContent)`, 'iptal sonrası yeniden giriş', 30000);

    /* 8. Anahtar iptal edilince program cihazdan silinir */
    hub.hooks.fail = () => ({ status: 401, json: { message: 'Bad credentials' }, headers: {} });
    await go(base);
    await waitFor(`${visible('login')} && /geçersiz/.test(document.getElementById('loginMsg').textContent)`, 'iptalden sonra giriş ekranı', 30000);
    const afterRevoke = await evaluate(`(async () => ({ caches: (await caches.keys()).filter((k) => k.startsWith('ppx-program-')).length,
      app: await fetch('app/ortak/ppx-db.js').then((r) => r.status), settings: localStorage.getItem('ppx_ayarlar') }))()`);
    check(afterRevoke.caches === 0 && afterRevoke.app === 404, 'iptal edilen anahtarla program cihazdan silinir', JSON.stringify(afterRevoke));
    check(!/gizli-anahtar/.test(afterRevoke.settings || ''), 'iptal edilen anahtar unutulur, depo adı kalır', afterRevoke.settings);
    hub.hooks.fail = null;

    /* 9. Yeniden giriş ve çıkış: program, anahtar ve veri kopyası silinir */
    await evaluate(`document.getElementById('token').value = 'gizli-anahtar'; document.getElementById('login').requestSubmit(); true`);
    await waitFor(`location.pathname.endsWith('/ppx/app/index.html') && /GitHub deposu/.test(document.getElementById('dbInfo').textContent)`, 'yeniden giriş', 30000);
    await evaluate(`document.getElementById('disconnect').click(); true`);
    await waitFor(`location.href === '${base}' && /Çıkış yapıldı/.test(document.getElementById('loginMsg').textContent)`, 'çıkış', 30000);
    const afterLogout = await evaluate(`(async () => ({ caches: (await caches.keys()).filter((k) => k.startsWith('ppx-program-')).length,
      dbs: (await indexedDB.databases()).map((d) => d.name), settings: localStorage.getItem('ppx_ayarlar') }))()`);
    check(afterLogout.caches === 0 && !afterLogout.dbs.includes('ppx-veri') && !/gizli-anahtar/.test(afterLogout.settings || ''), 'çıkışta program, anahtar ve veri kopyası silinir', JSON.stringify(afterLogout));
    await go(`${base}app/index.html`);
    await waitFor(`location.href === '${base}' && ${visible('login')}`, 'çıkıştan sonra giriş ekranı');
    check(true, 'çıkıştan sonra program adresi giriş ekranına döner');

    check(errors.length === 0, 'sayfalarda betik hatası yok', errors.slice(0, 5).join('\n    '));
  } catch (e) {
    check(false, e.message);
    if (errors.length) console.log(`  Betik hataları:\n    ${errors.slice(0, 5).join('\n    ')}`);
  } finally {
    client.close();
    browser.proc.kill();
    site.server.close();
    await sleep(500);
    try { fs.rmSync(browser.profile, { recursive: true, force: true }); } catch { /* tarayıcı dosyaları bırakana kadar kalabilir */ }
  }
  console.log(failures ? `\n${failures} denetim başarısız` : '\nTüm denetimler geçti');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
