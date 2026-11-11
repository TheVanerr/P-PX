const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
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

/* ─── Program verisi güncelleme ─────────────────────────── */

const OLD_KOD = '﻿KOD;BİLEŞEN ADI;AÇIKLAMA\r\nV31;Sepet Aç Valfi;PLC\'ye bağlıdır\r\nV32;Sepet Kapat Valfi;y\r\nV33;Tahliye Valfi;z\r\n';
const NEW_KOD = '﻿KOD;BİLEŞEN ADI;AÇIKLAMA\r\nV31;Sepet Aç Valfi;Kontrol ünitesine (PLC/Röle) bağlıdır\r\nV32;Sepet Kapat Valfi;y\r\nV40;Dolum Valfi;w\r\n';
// str() BOM'u siler; BOM korunuyor mu diye ham bayt okunur
const raw = (bytes) => Buffer.from(bytes).toString('utf8');
const versionJson = (surum) => JSON.stringify({ surum, tarih: '2026-11-10', dosyalar: {} });

/** Güncellenmiş program klasörü (P&PX). null verilen dosya klasörde olmaz. */
function programFolder(changes, surum) {
  const files = Object.assign({
    'P-IDX/P&ID/data/surum.json': versionJson(surum === undefined ? 1 : surum),
    'P-IDX/P&ID/data/kod.csv': NEW_KOD,
    'P-IDX/P&ID/data/kod-en.csv': 'KOD;COMPONENT NAME;DESCRIPTION\nV31;Basket Open Valve;control unit (PLC/relay)\n',
    'P-IDX/P&ID/data/guvenlik.csv': 'KOD;TETİK;KİLİT;MANTIK\nLS01;Alt Seviye;Pompa;kontrol ünitesi (PLC/Röle) durdurur\n',
    'P-IDX/P&ID/data/ayarlar.json': '{"kapakTasarimi":"bant"}',
    'P-IDX/P&ID/projects/a/proje.json': '{"programdaki":true}',
    'P-IDX/ML/kayitlar/kodlar.json': '{"kodlar":[{"kod":"V31","aciklama":"programdaki"}]}',
    'PNOMATIKX/PNOMATIK/data/eslestirme.csv': 'KOD;DEVRE\nprogramdaki\n'
  }, changes);
  return fakeSource(Object.fromEntries(Object.entries(files).filter(([, v]) => v !== null)));
}

/** Eski katalogla aktarılmış veritabanı ve programda değiştirilmiş kullanıcı verisi */
async function userDb(db) {
  const target = db || localDb();
  await target.write('P&ID/data/kod.csv', text(OLD_KOD));
  await target.write('P&ID/data/guvenlik.csv', text('KOD;TETİK;KİLİT;MANTIK\nLS01;Alt Seviye;Pompa;PLC durdurur\n'));
  await target.write('P&ID/data/ayarlar.json', text('{"kapakTasarimi":"kose"}'));
  await target.write('P&ID/data/aciklamalar.json', text('{"bilesen":{"SS02":{"tr":"kullanıcının"}}}'));
  await target.write('P&ID/projects/a/proje.json', text('{"kullanici":true}'));
  await target.write('ML/kayitlar/kodlar.json', text('{"kodlar":[{"kod":"V31","aciklama":"kullanıcının"}]}'));
  await target.write('PNOMATIK/data/eslestirme.csv', text('KOD;DEVRE\nkullanıcının\n'));
  return target;
}

test('program verileri: yalnız kod listesi ve güvenlik kataloğu güncellenir, kullanıcı verisi korunur', async () => {
  const db = await userDb();
  const others = ['P&ID/data/ayarlar.json', 'P&ID/data/aciklamalar.json', 'P&ID/projects/a/proje.json', 'ML/kayitlar/kodlar.json', 'PNOMATIK/data/eslestirme.csv'];
  const before = new Map();
  for (const p of others) before.set(p, str((await db.read(p)).bytes));
  const folder = await programFolder();

  const plan = await PpxFs.planProgramData(db, folder);
  assert.ok(plan.ok, plan.error);
  assert.equal(plan.source, 'P-IDX');
  assert.equal(plan.from, null);
  assert.deepEqual(plan.to, { surum: 1, tarih: '2026-11-10' });
  assert.deepEqual(plan.files.map((f) => f.path), ['P&ID/data/kod.csv', 'P&ID/data/kod-en.csv', 'P&ID/data/guvenlik.csv']);
  const [kod, en] = plan.files;
  assert.deepEqual([kod.changed, kod.added, kod.removed, kod.header, kod.isNew], [1, ['V40'], ['V33'], false, false]);
  assert.equal(en.isNew, true);
  const summary = PpxFs.programDataSummary(plan).join('\n');
  assert.match(summary, /\(sürüm 1, 10\.11\.2026\)/);
  assert.match(summary, /Kod listesi TR \(kod\.csv\): 1 kodun metni değişecek, 1 kod eklenecek, 1 kod silinecek \(V33\)/);
  assert.match(summary, /Kod listesi EN \(kod-en\.csv\): veritabanında yok, eklenecek/);
  assert.match(summary, /Güvenlik kataloğu TR \(guvenlik\.csv\): 1 kodun metni değişecek/);
  assert.match(summary, /Projeler, makine kayıtları, ML kod listesi, kod eşleştirme, ayarlar ve elle düzenlenen açıklamalar değişmez/);
  assert.match(str((await db.read('P&ID/data/kod.csv')).bytes), /PLC'ye/, 'karşılaştırma bir şey yazmamalı');

  assert.deepEqual(await PpxFs.applyProgramData(db, plan), { ok: true, written: 3 });
  assert.equal(raw((await db.read('P&ID/data/kod.csv')).bytes), NEW_KOD);
  assert.equal(JSON.parse(str((await db.read('P&ID/data/surum.json')).bytes)).surum, 1);
  for (const p of others) assert.equal(str((await db.read(p)).bytes), before.get(p), `${p} değişmemeli`);
  const catalog = await PidHost.createStore(rootOf(db)).engine.catalog();
  const v31 = catalog.entries.find((e) => e.id === 'V31');
  assert.match(v31.description, /ünitesine \(PLC\/Röle\)/);
  assert.match(v31.desc.en, /control unit \(PLC\/relay\)/);

  const again = await PpxFs.planProgramData(db, folder);
  assert.deepEqual([again.ok, again.files.length, again.version], [true, 0, null]);
});

test('program verileri: satır sonu ve BOM farkı değişiklik sayılmaz, eksik sürüm bilgisi yazılır', async () => {
  const db = localDb();
  await db.write('P&ID/data/kod.csv', text(NEW_KOD.replace(/^﻿/, '').replace(/\r\n/g, '\n')));
  const plan = await PpxFs.planProgramData(db, await programFolder({ 'P-IDX/P&ID/data/kod-en.csv': null, 'P-IDX/P&ID/data/guvenlik.csv': null }));
  assert.ok(plan.ok, plan.error);
  assert.deepEqual(plan.files, []);
  assert.ok(plan.version);
  assert.deepEqual(await PpxFs.applyProgramData(db, plan), { ok: true, written: 0 });
  assert.equal(JSON.parse(str((await db.read('P&ID/data/surum.json')).bytes)).surum, 1);
  assert.equal(str((await db.read('P&ID/data/kod.csv')).bytes).includes('\r'), false, 'veritabanındaki kopyaya dokunulmaz');
});

test('program verileri: veritabanındaki sürüm daha yeniyse eski program klasörü hiçbir şey yazmaz', async () => {
  const db = localDb();
  await db.write('P&ID/data/surum.json', text(versionJson(3)));
  await db.write('P&ID/data/kod.csv', text(NEW_KOD));
  const stale = await PpxFs.planProgramData(db, await programFolder({ 'P-IDX/P&ID/data/kod.csv': OLD_KOD }, 2));
  assert.equal(stale.ok, false);
  assert.equal(stale.newer, true);
  assert.match(stale.error, /daha yeni: sürüm 3, seçilen klasörde sürüm 2/);
  assert.equal(raw((await db.read('P&ID/data/kod.csv')).bytes), NEW_KOD);
  // Aynı sürümde içerik farklıysa (veritabanındaki elle değiştirilmiş) programdaki geri yazılabilir
  const same = await PpxFs.planProgramData(db, await programFolder({ 'P-IDX/P&ID/data/kod.csv': OLD_KOD }, 3));
  assert.ok(same.ok, same.error);
  assert.equal(same.files[0].path, 'P&ID/data/kod.csv');
  assert.equal(same.version, null);
});

test('program verileri: sürüm bilgisi olmayan eski klasör ve P&ID içermeyen klasör reddedilir', async () => {
  const db = await userDb();
  const old = await PpxFs.planProgramData(db, await programFolder({ 'P-IDX/P&ID/data/surum.json': null }));
  assert.equal(old.ok, false);
  assert.match(old.error, /surum\.json yok ya da okunamıyor/);
  const broken = await PpxFs.planProgramData(db, await programFolder({ 'P-IDX/P&ID/data/surum.json': '{"surum":"bir"}' }));
  assert.equal(broken.ok, false);
  const pnx = await PpxFs.planProgramData(db, await fakeSource({ 'PNOMATIKX/PNOMATIK/data/eslestirme.csv': 'x' }));
  assert.match(pnx.error, /P&ID\/data bulunamadı/);
  const two = await PpxFs.planProgramData(db, await fakeSource({ 'A/P&ID/data/surum.json': versionJson(1), 'B/P&ID/data/surum.json': versionJson(1) }));
  assert.match(two.error, /birden çok P&ID klasörü/);
  assert.match(str((await db.read('P&ID/data/kod.csv')).bytes), /PLC'ye/);
});

test('program verileri: karşılaştırmadan sonra veritabanı değiştiyse hiçbir dosya yazılmaz', async () => {
  const db = await userDb();
  const plan = await PpxFs.planProgramData(db, await programFolder());
  await db.write('P&ID/data/guvenlik.csv', text('KOD;TETİK;KİLİT;MANTIK\nLS01;başka cihazdan\n'));
  const res = await PpxFs.applyProgramData(db, plan);
  assert.equal(res.ok, false);
  assert.match(res.error, /bu sırada değişti/);
  assert.match(str((await db.read('P&ID/data/kod.csv')).bytes), /PLC'ye/, 'yarım güncelleme olmamalı');
  assert.equal(await db.read('P&ID/data/surum.json'), null);
});

test('program verileri: güncelleme depoya tek commit gider, öbür cihaz eski programla geri alamaz', async () => {
  const hub = createFakeGitHub();
  const a = await userDb(device(hub));
  await a.sync();
  const commits = hub.commitCount();
  const plan = await PpxFs.planProgramData(a, await programFolder({}, 2));
  assert.ok((await PpxFs.applyProgramData(a, plan)).ok);
  await a.sync();
  assert.equal(hub.commitCount(), commits + 1);
  assert.equal(raw(hub.files().get('P&ID/data/kod.csv')), NEW_KOD);
  assert.equal(str(hub.files().get('P&ID/data/ayarlar.json')), '{"kapakTasarimi":"kose"}');

  const b = device(hub);
  await b.sync();
  assert.equal(raw((await b.read('P&ID/data/kod.csv')).bytes), NEW_KOD);
  const stale = await PpxFs.planProgramData(b, await programFolder({ 'P-IDX/P&ID/data/kod.csv': OLD_KOD }, 1));
  assert.equal(stale.newer, true);
});

test('program verisi sürümü katalogla uyuşur: katalog değişince npm run veri-surumu ile artırılmalı', async () => {
  const pidx = path.join(ROOT, 'P-IDX');
  const manifest = JSON.parse(fs.readFileSync(path.join(pidx, PpxFs.DATA_VERSION_FILE), 'utf8'));
  assert.ok(Number.isInteger(manifest.surum) && manifest.surum >= 1);
  assert.match(manifest.tarih, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(manifest.dosyalar), PpxFs.PROGRAM_DATA.map((d) => d.path));
  for (const { path: rel } of PpxFs.PROGRAM_DATA) {
    const hash = await PpxFs.dataHash(fs.readFileSync(path.join(pidx, rel)));
    assert.equal(manifest.dosyalar[rel], hash, `${rel} değişmiş: npm run veri-surumu ile sürümü artırın`);
  }
});

test('veri sürümü aracı yalnız içerik değişince sürümü artırır, satır sonu farkını saymaz', async () => {
  const { bump } = require('../P-IDX/tools/veri-surumu.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ppx-surum-'));
  try {
    fs.mkdirSync(path.join(tmp, 'P&ID', 'data'), { recursive: true });
    for (const { path: rel } of PpxFs.PROGRAM_DATA) fs.writeFileSync(path.join(tmp, rel), 'KOD;AD\r\nV31;Valf\r\n');
    assert.deepEqual(await bump(tmp, '2026-01-01'), { from: 0, to: 1, changed: PpxFs.PROGRAM_DATA.map((d) => d.path) });
    fs.writeFileSync(path.join(tmp, 'P&ID/data/kod.csv'), '﻿KOD;AD\nV31;Valf\n');
    assert.equal((await bump(tmp, '2026-01-02')).to, 1, 'yalnız BOM ve satır sonu değişti');
    fs.writeFileSync(path.join(tmp, 'P&ID/data/kod.csv'), 'KOD;AD\nV31;Yeni Valf\n');
    assert.deepEqual(await bump(tmp, '2026-01-03'), { from: 1, to: 2, changed: ['P&ID/data/kod.csv'] });
    assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, PpxFs.DATA_VERSION_FILE), 'utf8')).tarih, '2026-01-03');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('ana ekranda program verilerini güncelle: önce eşitler, onayda yeniden karşılaştırır, aktarmada önerilir', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /id="updateData"[^>]*>Program verilerini güncelle</);
  assert.match(html, /id="dataOffer" hidden/);
  const apply = html.slice(html.indexOf("$('dataApply')"), html.indexOf("$('dataCancel')"));
  assert.ok(apply.indexOf('syncedFirst') < apply.indexOf('planProgramData') && apply.indexOf('planProgramData') < apply.indexOf('applyProgramData'), apply);
  const importer = html.slice(html.indexOf("$('importFolder')"), html.indexOf("$('backup')"));
  assert.match(importer, /planProgramData[\s\S]*offer\(dir/);
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

test('sayfa ekleme iki programda da alt çubukta ve sağ panelde görünür, tıklama kaybolmaz', () => {
  for (const dir of ['P-IDX/P&ID', 'PNOMATIKX/PNOMATIK']) {
    const app = fs.readFileSync(path.join(ROOT, dir, 'codes/engine/app.js'), 'utf8');
    const panels = fs.readFileSync(path.join(ROOT, dir, 'codes/engine/panels.js'), 'utf8');
    assert.match(app, /id="sheetAdd"[^>]*>\+ Sayfa</, dir);
    // Sekmeler yeniden kurulsa da tıklama çalışsın diye dinleyici üst öğededir
    assert.match(app, /e\.target\.closest\('#sheetAdd'\)/, dir);
    // Basılıyken ad değişirse düğme imlecin altından kayar; sekmeler bırakınca güncellenir
    assert.match(app, /if \(tabsHeld\) return;/, dir);
    assert.match(fs.readFileSync(path.join(ROOT, dir, 'codes/engine/engine.css'), 'utf8'), /\.sheet-add \{ position: sticky;/, dir);
    assert.match(panels, /id="sAdd"/, dir);
    assert.match(panels, /onField\('sAdd', 'click', \(\) => app\.addSheet\(\)\)/, dir);
  }
});

test('sayfa işlemleri iki programda da aynı: çoğaltma, sıralama, silme, seçimi taşıma, PageUp/PageDown', () => {
  for (const dir of ['P-IDX/P&ID', 'PNOMATIKX/PNOMATIK']) {
    const read = (file) => fs.readFileSync(path.join(ROOT, dir, 'codes/engine', file), 'utf8');
    const panels = read('panels.js');
    for (const id of ['sPrev', 'sNext', 'sAdd', 'sDup', 'sDel', 'sLeft', 'sRight', 'mMoveSheet']) assert.ok(panels.includes(`'${id}'`), `${dir}: ${id}`);
    for (const fn of ['duplicateSheet', 'goToSheet', 'moveSheet', 'deleteSheet', 'moveSelectionToSheet']) assert.match(read('app.js'), new RegExp(`\\n    ${fn},`), `${dir}: ${fn}`);
    assert.match(read('app.js'), /editor\.removeSheet\(index\)/, dir);
    assert.match(read('editor.js'), /case 'PageDown'/, dir);
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
