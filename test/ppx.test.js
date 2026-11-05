const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PpxDb = require('../ortak/ppx-db.js');
const PpxFs = require('../ortak/ppx-fs.js');
const PpxGitHub = require('../ortak/ppx-github.js');
const PidHost = require('../P-IDX/P&ID/codes/host.js');
const PnxHost = require('../PNOMATIKX/PNOMATIK/codes/host.js');
const { createFakeGitHub, blobSha } = require('./fake-github.js');

const ROOT = path.join(__dirname, '..');
const text = (s) => new TextEncoder().encode(s);
const str = (b) => new TextDecoder().decode(b);

/** Aynı sahte depoya bağlı bir cihaz; saat depoyla ortak ilerler */
function device(hub, options) {
  const remote = PpxGitHub.createRemote({ repo: hub.id, token: hub.token, fetchFn: hub.fetchFn });
  return PpxDb.createDb(Object.assign({
    local: PpxDb.memoryLocal(),
    remote,
    now: () => { hub.clock.now += 1000; return hub.clock.now; },
    flushMs: 3600000
  }, options));
}

const localDb = () => PpxDb.createDb({ local: PpxDb.memoryLocal() });
const rootOf = (db) => PpxFs.createRoot(db);

async function seedCatalog(db) {
  await db.write('P&ID/data/kod.csv', text('KOD;AD;ACIKLAMA\nV31;Sepet Aç Valfi;x\nV32;Sepet Kapat Valfi;y\n'));
}

/* ─── Git uyumu ─────────────────────────────────────────── */

test('dosya kimliği Git ile birebir aynı hesaplanır', async () => {
  // Pro Git kitabındaki bilinen örnek ve boş dosya
  assert.equal(await PpxDb.gitBlobSha(text('test content\n')), 'd670460b4b4aece5915caf5c68d12f560a9fe3e4');
  assert.equal(await PpxDb.gitBlobSha(new Uint8Array(0)), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  const sample = Buffer.from('şğüÇ\r\nÿ', 'utf8');
  assert.equal(await PpxDb.gitBlobSha(sample), blobSha(sample));
});

test('GET istekleri önbellekten okumaz: eski dal başı eşitlemeyi yanıltır', async () => {
  const hub = createFakeGitHub();
  const db = device(hub);
  await db.write('a.json', text('1'));
  await db.sync();
  assert.ok(hub.stats.get > 0);
  assert.equal(hub.stats.uncachedViolations, 0);
});

/* ─── Kayıt ─────────────────────────────────────────────── */

test('boş depoda ilk commit atılır, dosyalar depoya aynen yazılır', async () => {
  const hub = createFakeGitHub();
  const db = device(hub);
  const body = text('{"model":"Ç"}\r\n');
  await db.write('P&ID/projects/şık proje/proje.json', body);
  const s = await db.sync();
  assert.equal(s.state, 'ok', s.error);
  assert.equal(s.pending, 0);
  assert.deepEqual([...hub.files().get('P&ID/projects/şık proje/proje.json')], [...body], 'satır sonu ve Türkçe harf korunmalı');
  assert.ok(hub.files().has('README.md'));
});

test('aynı içerik yeniden yazılmaz, boş commit oluşmaz', async () => {
  const hub = createFakeGitHub();
  const db = device(hub);
  assert.equal(await db.write('a.json', text('1')), true);
  assert.equal(await db.write('a.json', text('1')), false);
  await db.sync();
  const commits = hub.commitCount();
  await db.write('a.json', text('1'));
  await db.sync();
  await db.sync();
  assert.equal(hub.commitCount(), commits);
});

test('sık otomatik kayıt tek commit olur; değişiklik yokken yalnız tek okuma yapılır', async () => {
  const hub = createFakeGitHub();
  const db = device(hub);
  await db.sync();
  const commits = hub.commitCount();
  for (let i = 0; i < 200; i += 1) await db.write('P&ID/projects/x/pid/cizim.json', text(`{"n":${i}}`));
  await db.sync();
  assert.equal(hub.commitCount(), commits + 1);
  assert.equal(str(hub.files().get('P&ID/projects/x/pid/cizim.json')), '{"n":199}');
  const reads = hub.stats.get;
  await db.sync();
  assert.equal(hub.stats.get, reads + 1, 'yalnız dal başı sorulmalı');
});

test('küçük metin dosyaları kaç tane olursa olsun tek gönderimde az istekle gider', async () => {
  const hub = createFakeGitHub();
  const db = device(hub);
  await db.sync();
  for (let i = 0; i < 40; i += 1) await db.write(`ML/kayitlar/${i}.json`, text(`{"seriNo":"${i}"}`));
  const before = hub.stats.post + hub.stats.patch;
  await db.sync();
  assert.equal(hub.stats.post + hub.stats.patch - before, 3, 'ağaç, commit, dal başı');
});

test('sürekli çizerken de gönderim gecikmez: her yazma zamanlayıcıyı ertelemez', async () => {
  const hub = createFakeGitHub();
  const db = device(hub, { flushMs: 30 });
  await db.sync();
  const commits = hub.commitCount();
  for (let i = 0; i < 12; i += 1) {
    await db.write('c.json', text(String(i)));
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.ok(hub.commitCount() > commits, 'çizim sürerken en az bir gönderim olmalı');
  await db.sync();
});

/* ─── Hata durumları ────────────────────────────────────── */

test('internet yokken kayıt kaybolmaz, bağlantı gelince gönderilir', async () => {
  const hub = createFakeGitHub();
  const db = device(hub);
  hub.hooks.network = true;
  await db.write('a.json', text('emek'));
  const offline = await db.sync();
  assert.equal(offline.state, 'offline');
  assert.equal(offline.pending, 1);
  assert.equal(str((await db.read('a.json')).bytes), 'emek');
  hub.hooks.network = false;
  const online = await db.sync();
  assert.equal(online.state, 'ok');
  assert.equal(online.pending, 0);
  assert.equal(str(hub.files().get('a.json')), 'emek');
});

test('hız sınırı ve geçersiz anahtar anlaşılır yazılır, kayıt cihazda bekler', async () => {
  const hub = createFakeGitHub();
  const db = device(hub);
  await db.sync();
  await db.write('a.json', text('1'));
  hub.hooks.fail = (method) => (method === 'POST' ? { status: 403, json: { message: 'You have exceeded a secondary rate limit' }, headers: { 'retry-after': '120' } } : null);
  const limited = await db.sync();
  assert.equal(limited.state, 'error');
  assert.match(limited.error, /hız sınırı/);
  assert.equal(limited.pending, 1);
  hub.hooks.fail = null;
  assert.equal((await db.sync()).state, 'ok');

  const wrong = PpxDb.createDb({
    local: PpxDb.memoryLocal(),
    remote: PpxGitHub.createRemote({ repo: hub.id, token: 'yanlis', fetchFn: hub.fetchFn })
  });
  const denied = await wrong.sync();
  assert.equal(denied.state, 'error');
  assert.match(denied.error, /anahtarı geçersiz/);
  hub.hooks.fail = (method) => (method === 'POST' ? { status: 403, json: { message: 'Resource not accessible by personal access token' }, headers: {} } : null);
  await db.write('b.json', text('2'));
  assert.match((await db.sync()).error, /yazma izni yok/);
});

test('depo bilgisi özel olup olmadığını söyler, depo adı doğrulanır', async () => {
  const open = createFakeGitHub({ isPrivate: false });
  const remote = PpxGitHub.createRemote({ repo: open.id, token: open.token, fetchFn: open.fetchFn });
  assert.equal((await remote.info()).private, false);
  assert.throws(() => PpxGitHub.createRemote({ repo: 'sadece-ad', token: 'x' }), /kullanici\/depo/);
});

/* ─── İki cihaz ─────────────────────────────────────────── */

test('bir cihazda yazılan öbür cihazda görünür, silme de taşınır', async () => {
  const hub = createFakeGitHub();
  const a = device(hub);
  const b = device(hub);
  await a.write('ML/kayitlar/1.json', text('{"seriNo":"1"}'));
  await a.write('P&ID/projects/şık proje/proje.json', text('{"model":"Ç"}'));
  await a.sync();
  await b.sync();
  assert.equal(str((await b.read('ML/kayitlar/1.json')).bytes), '{"seriNo":"1"}');
  assert.equal(str((await b.read('P&ID/projects/şık proje/proje.json')).bytes), '{"model":"Ç"}');
  assert.equal(await a.remove('ML/kayitlar/1.json'), 1);
  await a.sync();
  assert.equal(hub.files().has('ML/kayitlar/1.json'), false);
  assert.equal(await a.read('ML/kayitlar/1.json'), null);
  await b.sync();
  assert.equal(await b.read('ML/kayitlar/1.json'), null);
});

test('sonraki eşitleme yalnız değişen dosyayı indirir', async () => {
  const hub = createFakeGitHub();
  const a = device(hub);
  for (let i = 0; i < 20; i += 1) await a.write(`f${i}.json`, text(String(i)));
  await a.sync();
  const b = device(hub);
  await b.sync();
  const before = hub.stats.blobGets;
  await a.write('f0.json', text('yeni'));
  await a.sync();
  await b.sync();
  assert.equal(hub.stats.blobGets - before, 1);
  assert.equal(str((await b.read('f0.json')).bytes), 'yeni');
});

test('iki cihaz aynı dosyayı değiştirince hiçbir sürüm kaybolmaz', async () => {
  const hub = createFakeGitHub();
  const a = device(hub);
  const b = device(hub);
  const p = 'P&ID/projects/x/pid/cizim.json';
  await a.write(p, text('ortak'));
  await a.sync();
  await b.sync();
  await a.write(p, text('a sürümü'));
  await b.write(p, text('b sürümü'));
  await a.sync();
  await b.sync();
  await a.sync();
  const main = str((await a.read(p)).bytes);
  assert.equal(str((await b.read(p)).bytes), main, 'iki cihaz aynı asıl dosyada buluşmalı');
  for (const db of [a, b]) {
    const copies = (await db.list()).filter((r) => r.path.startsWith(`${p}.catisma-`));
    assert.equal(copies.length, 1);
    assert.deepEqual([main, str(copies[0].bytes)].sort(), ['a sürümü', 'b sürümü']);
  }
  assert.equal([...hub.files().keys()].filter((k) => k.includes('.catisma-')).length, 1);
});

test('gönderim sırasında başka cihaz commit atarsa ezilmez, birleşip yeniden gönderilir', async () => {
  const hub = createFakeGitHub();
  const a = device(hub);
  const b = device(hub);
  await a.write('ortak.json', text('0'));
  await a.sync();
  await b.sync();
  await a.write('a.json', text('a'));
  await b.write('b.json', text('b'));
  // a dal başını güncellemeden hemen önce b araya girer
  hub.hooks.beforeRefUpdate = async () => { await b.sync(); };
  const s = await a.sync();
  assert.equal(s.state, 'ok', s.error);
  assert.equal(s.pending, 0);
  assert.equal(str(hub.files().get('a.json')), 'a');
  assert.equal(str(hub.files().get('b.json')), 'b');
  await b.sync();
  assert.equal(str((await b.read('a.json')).bytes), 'a');
});

test('sunucu kısa süreliğine eski commit döndürse de yeni çalışma geri alınmaz', async () => {
  const hub = createFakeGitHub();
  const db = device(hub);
  await db.write('c.json', text('eski'));
  await db.sync();
  const old = hub.headSha();
  await db.write('c.json', text('yeni'));
  await db.sync();
  hub.hooks.staleRef = old;
  const s = await db.sync();
  assert.equal(s.state, 'ok', s.error);
  assert.equal(str((await db.read('c.json')).bytes), 'yeni');
});

test('silme ile düzenleme karşılaşırsa içerik kaybolmaz', async () => {
  const hub = createFakeGitHub();
  const a = device(hub);
  const b = device(hub);
  await a.write('x.json', text('1'));
  await a.write('y.json', text('1'));
  await a.sync();
  await b.sync();
  // x: a siler, b düzenler. y: a düzenler, b siler.
  await a.remove('x.json');
  await a.write('y.json', text('a düzenledi'));
  await a.sync();
  await b.write('x.json', text('b düzenledi'));
  await b.remove('y.json');
  await b.sync();
  await a.sync();
  for (const db of [a, b]) {
    assert.equal(str((await db.read('x.json')).bytes), 'b düzenledi');
    assert.equal(str((await db.read('y.json')).bytes), 'a düzenledi');
  }
  assert.equal(str(hub.files().get('x.json')), 'b düzenledi');
});

test('ikili ve büyük dosya bozulmadan taşınır, aynı içerik bir kez indirilir', async () => {
  const hub = createFakeGitHub();
  const a = device(hub);
  const b = device(hub);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00, 0x80]);
  const big = 'ş'.repeat(800000);
  await a.write('P&ID/assets/logos/vico.png', png);
  await a.write('PNOMATIK/assets/logos/vico.png', png);
  await a.write('buyuk.json', text(big));
  await a.write('bos.txt', new Uint8Array(0));
  const s = await a.sync();
  assert.equal(s.state, 'ok', s.error);
  const before = hub.stats.blobGets;
  await b.sync();
  assert.deepEqual([...(await b.read('PNOMATIK/assets/logos/vico.png')).bytes], [...png]);
  assert.equal(str((await b.read('buyuk.json')).bytes), big);
  assert.equal((await b.read('bos.txt')).bytes.length, 0);
  assert.equal(hub.stats.blobGets - before, 4, 'README, logo, büyük dosya, boş dosya; logo iki yolda ama bir kez');
});

test('çok dosyalı aktarma hız sınırına takılmamak için turlara bölünür', async () => {
  const hub = createFakeGitHub();
  const db = device(hub);
  await db.sync();
  const commits = hub.commitCount();
  for (let i = 0; i < 70; i += 1) await db.write(`resim${i}.png`, new Uint8Array([255, i]));
  const first = await db.sync();
  assert.equal(first.pending, 20);
  assert.equal(hub.commitCount(), commits + 1);
  const second = await db.sync();
  assert.equal(second.pending, 0);
  assert.equal([...hub.files().keys()].filter((k) => k.startsWith('resim')).length, 70);
});

/* ─── Yerel mod ve bağlanma ─────────────────────────────── */

test('yerel çalışma sonradan depoya bağlanınca gönderilir, depodaki veriyle birleşir', async () => {
  const hub = createFakeGitHub();
  const other = device(hub);
  await other.write('depoda.json', text('d'));
  await other.write('ayni.json', text('depo'));
  await other.sync();

  const local = PpxDb.memoryLocal();
  const offline = PpxDb.createDb({ local });
  await offline.write('yerel.json', text('y'));
  await offline.write('ayni.json', text('yerel'));
  assert.equal(offline.status().mode, 'local');

  const connected = device(hub, { local });
  const s = await connected.sync();
  assert.equal(s.state, 'ok', s.error);
  assert.equal(str(hub.files().get('yerel.json')), 'y');
  assert.equal(str((await connected.read('depoda.json')).bytes), 'd');
  const versions = (await connected.list()).filter((r) => r.path.startsWith('ayni.json'));
  assert.deepEqual(versions.map((r) => str(r.bytes)).sort(), ['depo', 'yerel'], 'iki sürüm de durmalı');
});

test('bağlantı kaldırılınca yapılan değişiklik yeniden bağlanınca ezilmez', async () => {
  const hub = createFakeGitHub();
  const local = PpxDb.memoryLocal();
  const first = device(hub, { local });
  await first.write('a.json', text('1'));
  await first.write('sil.json', text('1'));
  await first.sync();
  const offline = PpxDb.createDb({ local });
  await offline.write('a.json', text('çevrimdışı'));
  await offline.remove('sil.json');
  const again = device(hub, { local });
  await again.sync();
  assert.equal(str(hub.files().get('a.json')), 'çevrimdışı');
  assert.equal(hub.files().has('sil.json'), false);
});

/* ─── İki programın gerçek kayıt kodu aynı veritabanında ── */

test('P&ID programı veritabanında proje ve makine kaydı açar, kaydeder, yeniden okur', async () => {
  const db = localDb();
  await seedCatalog(db);
  const store = PidHost.createStore(rootOf(db));
  const machine = await store.ml.saveMachine({ seriNo: '0626051', firma: 'DÜNYA', model: 'ULT', kodlar: ['V31', 'V32'] });
  assert.ok(machine.ok, machine.error);
  const created = await store.engine.createProject({ seriNo: '0626051', musteri: 'DÜNYA', model: 'ULT M200' });
  assert.ok(created.ok, created.error);
  const read = await store.engine.readProject(created.id);
  assert.equal(read.machine.seriNo, '0626051');
  const drawing = { schema: 1, sheets: [{ id: 's1', items: [{ type: 'symbol', tag: 'V31' }] }] };
  assert.ok((await store.engine.saveProject({ id: created.id, drawing, meta: read.meta })).ok);
  const again = await store.engine.readProject(created.id);
  assert.deepEqual(again.drawing, drawing);
  const listed = await store.engine.listProjects();
  assert.equal(listed.projects.length, 1);
  assert.equal(listed.projects[0].items, 1);
  assert.equal((await store.engine.catalog()).entries.length, 2);
  assert.equal((await db.list()).filter((r) => r.path.endsWith('.gitkeep')).length, 0);
  assert.ok((await store.engine.listFiles(created.id)).files.some((g) => g.id === 'elektrik'));
});

test('Pnömatik programı P&ID verisini aynı veritabanından bağlantısız okur, iki program birbirine yazmaz', async () => {
  const db = localDb();
  await seedCatalog(db);
  const root = rootOf(db);
  const pid = PidHost.createStore(root);
  const pnx = PnxHost.createStore(root);
  const reader = PnxHost.createPidReader(root);

  await pid.ml.saveMachine({ seriNo: '777', firma: 'ACME', model: 'M', kodlar: ['V32'] });
  const pidProject = await pid.engine.createProject({ seriNo: '777', musteri: 'ACME', model: 'M' });
  const pidMeta = (await pid.engine.readProject(pidProject.id)).meta;
  await pid.engine.saveProject({ id: pidProject.id, drawing: { sheets: [{ items: [{ type: 'symbol', tag: 'V31' }] }] }, meta: pidMeta });

  const seen = await reader.readProject(pidProject.id);
  assert.deepEqual(seen.codes.sort(), ['V31', 'V32'], 'çizim ve makine kaydındaki kodlar');
  assert.equal((await reader.catalog()).entries.length, 2);

  const pnxProject = await pnx.engine.createProject({ seriNo: '777', musteri: 'ACME', model: 'M', pidProje: pidProject.id });
  assert.ok(pnxProject.ok, pnxProject.error);
  const before = str((await db.read(`P&ID/projects/${pidProject.id}/proje.json`)).bytes);
  const meta = (await pnx.engine.readProject(pnxProject.id)).meta;
  await pnx.engine.saveProject({ id: pnxProject.id, drawing: { sheets: [{ items: [] }] }, meta });
  assert.equal(meta.pidProje, pidProject.id);
  assert.equal(str((await db.read(`P&ID/projects/${pidProject.id}/proje.json`)).bytes), before, 'P&ID projesi değişmemeli');

  assert.equal((await pid.engine.listProjects()).projects.length, 1);
  assert.equal((await pnx.engine.listProjects()).projects.length, 1);
  await pid.engine.saveSettings({ kapak: 'p' });
  await pnx.engine.saveSettings({ kapak: 'n' });
  assert.equal((await pid.engine.readSettings()).settings.kapak, 'p');
  assert.equal((await pnx.engine.readSettings()).settings.kapak, 'n');
  await pnx.engine.saveMapping('KOD;DEVRE;ROL;AKTUATOR;VALF\nV31;Sepet;Y1;;\n');
  assert.match((await pnx.engine.readMapping()).text, /V31;Sepet/);
});

test('makine kaydı silinir; yazı tipi ve logo veritabanından okunur', async () => {
  const db = localDb();
  await seedCatalog(db);
  await db.write('P&ID/assets/fonts/Carlito-Regular.ttf', text('yazı tipi'));
  await db.write('P&ID/assets/logos/dolfin.png', new Uint8Array([1, 2]));
  const store = PidHost.createStore(rootOf(db));
  const saved = await store.ml.saveMachine({ seriNo: '1', firma: 'F', model: 'M', kodlar: [] });
  assert.ok((await store.ml.deleteMachine(saved.machine.id)).ok);
  assert.equal((await store.ml.load()).machines.length, 0);
  assert.equal(str((await store.engine.assetBytes('../assets/fonts/Carlito-Regular.ttf')).bytes), 'yazı tipi');
  assert.ok((await store.engine.asset('../assets/logos/dolfin.png')).ok);
});

test('boş klasör depoda .gitkeep olur, öbür cihazda klasör olarak görünür', async () => {
  const hub = createFakeGitHub();
  const a = device(hub);
  const store = PidHost.createStore(rootOf(a));
  const created = await store.engine.createProject({ seriNo: '1', musteri: 'M', model: 'X' });
  await a.sync();
  assert.ok(hub.files().has(`P&ID/projects/${created.id}/elektrik/.gitkeep`));
  const b = device(hub);
  await b.sync();
  assert.equal((await b.read(`P&ID/projects/${created.id}/elektrik`)).kind, 'dir');
  const seen = await PidHost.createStore(rootOf(b)).engine.listProjects();
  assert.equal(seen.projects[0].id, created.id);
});

/* ─── Aktarma ve yedek ──────────────────────────────────── */

async function fakeSource(files) {
  const db = localDb();
  for (const [p, content] of Object.entries(files)) await db.write(p, typeof content === 'string' ? text(content) : content);
  return rootOf(db);
}

test('klasörden aktarma: veri ve yazı tipi alınır; kod kopyaları, program kodu ve STEP alınmaz', async () => {
  const parent = await fakeSource({
    'P-IDX/P&ID/data/kod.csv': 'KOD;AD\n',
    'P-IDX/P&ID/codes/host.js': 'kod',
    'P-IDX/P&ID/codes/html-export.css': 'stil',
    'P-IDX/P&ID/projects/a/proje.json': '{}',
    'P-IDX/P&ID/projects/a/step/model.step': 'büyük',
    'P-IDX/ML/kayitlar/1.json': '{}',
    'P-IDX/P&ID/assets/fonts/Carlito-Regular.ttf': 'yazı',
    'PNOMATIKX/PNOMATIK/data/eslestirme.csv': 'x',
    'PNOMATIKX/PNOMATIK/data/pid-kod.csv': 'eski kopya',
    'PNOMATIKX/PNOMATIK/projects/b/proje.json': '{}',
    'PNOMATIKX/PNOMATIK/assets/logos/vico.png': 'logo'
  });
  const db = localDb();
  await db.write('ML/kayitlar/1.json', text('{"yeni":true}'));
  const res = await PpxFs.importFolder(db, parent);
  assert.ok(res.ok);
  assert.deepEqual((await db.list()).map((r) => r.path).sort(), [
    'ML/kayitlar/1.json',
    'P&ID/assets/fonts/Carlito-Regular.ttf',
    'P&ID/data/kod.csv',
    'P&ID/projects/a/proje.json',
    'PNOMATIK/assets/logos/vico.png',
    'PNOMATIK/data/eslestirme.csv',
    'PNOMATIK/projects/b/proje.json'
  ]);
  assert.equal(res.kept, 1);
  assert.equal(str((await db.read('ML/kayitlar/1.json')).bytes), '{"yeni":true}', 'veritabanındaki kayıt ezilmemeli');
  assert.match(res.skipped.join(), /model\.step/);
});

test('depoda yalnız README varken veri aktarılmamış sayılır', () => {
  assert.equal(PpxFs.hasProgramData([{ path: 'README.md' }]), false);
  assert.equal(PpxFs.hasProgramData([{ path: 'README.md' }, { path: 'ML/kayitlar/1.json' }]), true);
});

test('ilgisiz klasör aktarılmaz, anlaşılır hata döner', async () => {
  const res = await PpxFs.importFolder(localDb(), await fakeSource({ 'belgeler/a.txt': 'x' }));
  assert.equal(res.ok, false);
});

test('yedek indirilip boş veritabanına aynen yüklenir, var olan dosya korunur', async () => {
  const db = localDb();
  await db.write('a.json', text('çizim'));
  await db.write('logo.png', new Uint8Array([255, 0, 128]));
  const backup = JSON.parse(JSON.stringify(await db.exportBackup()));
  const fresh = localDb();
  await fresh.write('a.json', text('daha yeni'));
  assert.deepEqual(await fresh.importBackup(backup), { written: 1, kept: 1 });
  assert.equal(str((await fresh.read('a.json')).bytes), 'daha yeni');
  assert.deepEqual([...(await fresh.read('logo.png')).bytes], [255, 0, 128]);
  await assert.rejects(() => fresh.importBackup({ format: 'baska' }), /yedeği değil/);
});

/* ─── İki programın ortak davranışı ─────────────────────── */

test('Pnömatik PDF motoru P&ID ile aynı: dosyalar, stil kuralı ve yazı tipleri yerinde', () => {
  const pid = path.join(ROOT, 'P-IDX/P&ID');
  const pnx = path.join(ROOT, 'PNOMATIKX/PNOMATIK');
  // Bu kural olmazsa sayfalar ölçülemez, PDF boş çıkar
  assert.match(fs.readFileSync(path.join(pnx, 'codes/engine/engine.css'), 'utf8'), /\.pdf-exporting #printRoot \{ display: block/);
  const html = fs.readFileSync(path.join(pnx, 'codes/cizim.html'), 'utf8');
  assert.ok(html.indexOf('engine/pdf.js') < html.indexOf('engine/pdf-dom.js') && html.indexOf('engine/pdf-dom.js') < html.indexOf('engine/app.js'));
  assert.deepEqual(fs.readdirSync(path.join(pnx, 'assets/fonts')).sort(), fs.readdirSync(path.join(pid, 'assets/fonts')).sort());
  const read = (root) => fs.readFileSync(path.join(root, 'codes/engine/pdf.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(read(pnx), read(pid), 'pdf.js iki programda aynı kalmalı');
});

test('kapak logosu iki programda da yüklenen veriden gelir: dosyadan açılınca belgeye girer', () => {
  for (const dir of ['P-IDX/P&ID', 'PNOMATIKX/PNOMATIK']) {
    assert.match(fs.readFileSync(path.join(ROOT, dir, 'codes/engine/covers.js'), 'utf8'), /app\.logoUri\(path\)/, dir);
    assert.match(fs.readFileSync(path.join(ROOT, dir, 'codes/engine/app.js'), 'utf8'), /logoUri: \(rel\) => state\.logos\[rel\]/, dir);
  }
});

test('başarısız kayıt iki programda da kendiliğinden yeniden denenir', () => {
  for (const file of ['P-IDX/P&ID/codes/engine/app.js', 'PNOMATIKX/PNOMATIK/codes/engine/app.js']) {
    const app = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(app, /state\.saveTimer = setTimeout\(saveNow, SAVE_RETRY_MS\)/, file);
    assert.match(app, /\$\('confirmCancel'\)/, `${file}: Esc onay penceresini de kapatmalı`);
  }
});

/* ─── Sayfalar ──────────────────────────────────────────── */

test('her sayfa ortak katmanı programdan önce yükler ve yollar diskte vardır', () => {
  const pages = [
    ['index.html', 'ortak/ppx-boot.js'],
    ['P-IDX/P&ID/codes/cizim.html', 'host.js'],
    ['PNOMATIKX/PNOMATIK/codes/cizim.html', 'host.js']
  ];
  for (const [page, first] of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    const sources = [...html.matchAll(/<script src="([^"]*ppx-[^"]*)"/g)].map((m) => m[1]);
    assert.equal(sources.length, 4, page);
    for (const src of sources) assert.ok(fs.existsSync(path.join(ROOT, path.dirname(page), src)), `${page}: ${src}`);
    assert.ok(html.indexOf('ppx-boot.js') <= html.indexOf(`src="${first}"`) || first.includes('ppx-boot'), page);
    assert.ok(/src="[^"]*ppx-boot\.js"/.test(html), page);
  }
  const launcher = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(launcher.indexOf('P-IDX/P%26ID/codes/cizim.html') > 0);
});

test('Firebase ve Google bağımlılığı kalmadı, dış kaynaktan betik yüklenmez', () => {
  const files = ['index.html', 'README.md', 'package.json', ...fs.readdirSync(path.join(ROOT, 'ortak')).map((f) => `ortak/${f}`)];
  for (const file of files) {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(content, /firebase|firestore|gstatic/i, file);
    assert.doesNotMatch(content, /<script[^>]+src="https?:/i, file);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'firebase.json')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'firestore.rules')), false);
});
