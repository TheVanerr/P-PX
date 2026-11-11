const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Host = require('../../host.js');

/* Tarayıcıdaki FileSystemDirectoryHandle arayüzünün gerçek diske bağlı karşılığı */
function domError(name, message) {
  const err = new Error(message || name);
  err.name = name;
  return err;
}

class FileHandle {
  constructor(abs) {
    this.abs = abs;
    this.kind = 'file';
    this.name = path.basename(abs);
  }

  async getFile() {
    const buf = fs.readFileSync(this.abs);
    const stat = fs.statSync(this.abs);
    return {
      name: this.name,
      size: stat.size,
      lastModified: stat.mtimeMs,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    };
  }

  async createWritable() {
    const temp = `${this.abs}.crswap`;
    return {
      write: async (data) => fs.writeFileSync(temp, data),
      close: async () => fs.renameSync(temp, this.abs),
      abort: async () => fs.rmSync(temp, { force: true })
    };
  }
}

class DirHandle {
  constructor(abs) {
    this.abs = abs;
    this.kind = 'directory';
    this.name = path.basename(abs);
  }

  check(name) {
    if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new TypeError('Name is not allowed.');
    return path.join(this.abs, name);
  }

  async getDirectoryHandle(name, options) {
    const abs = this.check(name);
    if (!fs.existsSync(abs)) {
      if (!options || !options.create) throw domError('NotFoundError');
      fs.mkdirSync(abs);
    } else if (!fs.statSync(abs).isDirectory()) {
      throw domError('TypeMismatchError');
    }
    return new DirHandle(abs);
  }

  async getFileHandle(name, options) {
    const abs = this.check(name);
    if (!fs.existsSync(abs)) {
      if (!options || !options.create) throw domError('NotFoundError');
      fs.writeFileSync(abs, '');
    } else if (fs.statSync(abs).isDirectory()) {
      throw domError('TypeMismatchError');
    }
    return new FileHandle(abs);
  }

  // Tarayıcıdaki gibi: dolu klasör yalnız { recursive: true } ile silinir
  async removeEntry(name, options) {
    const abs = this.check(name);
    if (!fs.existsSync(abs)) throw domError('NotFoundError');
    fs.rmSync(abs, { recursive: !!(options && options.recursive) });
  }

  async* entries() {
    for (const entry of fs.readdirSync(this.abs, { withFileTypes: true })) {
      const abs = path.join(this.abs, entry.name);
      yield [entry.name, entry.isDirectory() ? new DirHandle(abs) : new FileHandle(abs)];
    }
  }
}

function write(root, rel, content) {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8');
}

function has(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split('/')));
}

function machine(overrides) {
  return Object.assign({
    id: 'm1',
    seriNo: '0326053',
    firma: 'AKDENİZ',
    model: 'KBN 2B',
    kodlar: ['PE02', 'PS05'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  }, overrides);
}

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pidx-host-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, 'P&ID/data/kod.csv', '﻿KOD;BİLEŞEN ADI;AÇIKLAMA\nPE01;Ön Yıkama Pompa Motoru;Açıklama TR\nPS05;Su Bilgisi;Su\n');
  write(root, 'P&ID/data/kod-en.csv', 'KOD;COMPONENT NAME;DESCRIPTION\nPE01;Pre-Wash Pump Motor;Description EN\n');
  write(root, 'P&ID/data/kod-de.csv', 'KOD;KOMPONENTENNAME;BESCHREIBUNG\nPE01;Vorwaschpumpe;Beschreibung DE\n');
  write(root, 'P&ID/data/guvenlik.csv', 'KOD;TETİK SENSÖRÜ;KİLİTLENEN EKİPMAN;GÜVENLİK MANTIĞI\nLS01;Alt Seviye;Pompalar;"Susuz; çalışmayı engeller"\n');
  write(root, 'P&ID/assets/logos/dolfin.png', Buffer.from([1, 2, 3]));
  write(root, 'P&ID/assets/logos/enva.svg', '<svg/>');
  write(root, 'ML/KODListesi.csv', '﻿KOD;AÇIKLAMA\nPE01;Ön Yıkama Pompa Motoru\nPE99;Yalnız CSV\n');
  write(root, 'ML/kayitlar/kodlar.json', JSON.stringify({ kodlar: [
    { kod: 'PE01', aciklama: 'Ön Yıkama Pompa Motoru' },
    { kod: 'PS05', aciklama: 'Su Bilgisi' },
    { kod: 'PS05', aciklama: 'Vakum Sensörü' },
    { kod: 'ZZ01', aciklama: 'Yalnız ML' }
  ] }));
  write(root, 'ML/kayitlar/0326053.json', JSON.stringify(machine()));
  write(root, 'ML/kayitlar/XXX_RTS_2B.json', JSON.stringify(machine({ id: 'x1', seriNo: 'XXX', firma: 'SKT', model: 'RTS 2B', kodlar: ['PE01'] })));
  write(root, 'ML/kayitlar/XXX_KBN_2B.json', JSON.stringify(machine({ id: 'x2', seriNo: 'XXX', firma: 'AMERİKA', model: 'KBN 2B', kodlar: ['PS05'] })));
  return { root, store: Host.createStore(new DirHandle(root)) };
}

test('metin: UTF-8 ve BOM okunur, bozuk UTF-8 Windows-1254 sayılır', () => {
  assert.equal(Host.decodeText(new TextEncoder().encode('﻿ŞİĞ')), 'ŞİĞ');
  assert.equal(Host.decodeText(new Uint8Array([0xDE, 0xDD, 0xD0])), 'ŞİĞ');
});

test('yol: .. çözülür, kökten çıkan yol reddedilir', () => {
  assert.deepEqual(Host.pathSegments('P&ID/codes/../assets\\a.png'), ['P&ID', 'assets', 'a.png']);
  assert.throws(() => Host.pathSegments('../../dışarı'));
});

test('ad: Windows sondaki nokta ve boşluğu kabul etmez', () => {
  assert.equal(Host.sanitizeName(' A/B:C  D. '), 'A B C D');
  assert.equal(Host.safeMachineFileName('A/B 1'), 'A_B_1.json');
  assert.equal(Host.safeMachineFileName('kodlar'), 'kodlar_makine.json');
});

test('CSV: tırnak ve ayırıcı doğru çözülür', () => {
  const { rows } = Host.parseCsvContent('A;B\n"x;y";"z ""q"""\n');
  assert.deepEqual(rows, [['x;y', 'z "q"']]);
  assert.deepEqual(Host.parseCodeCsv('KOD;AÇIKLAMA\npe01;a;b\n'), [{ kod: 'PE01', aciklama: 'a;b' }]);
});

test('katalog: diller birleşir, eksik dil Türkçeye düşer', async (t) => {
  const { store } = setup(t);
  const res = await store.readKodCatalog();
  assert.equal(res.ok, true);
  const pe01 = res.entries.find((e) => e.id === 'PE01');
  assert.equal(pe01.en.componentName, 'Pre-Wash Pump Motor');
  assert.equal(pe01.de.componentName, 'Vorwaschpumpe');
  assert.equal(res.entries.find((e) => e.id === 'PS05').en.componentName, 'Su Bilgisi');
  const safety = await store.readSafetyCatalog();
  assert.equal(safety.entries[0].tr.logic, 'Susuz; çalışmayı engeller');
});

test('çizim kataloğu: ML kodları eklenir, farklı anlamlar işaretlenir', async (t) => {
  const { store } = setup(t);
  const { entries } = await store.engine.catalog();
  const byId = new Map(entries.map((e) => [e.id, e]));
  assert.equal(byId.get('ZZ01').source, 'ml');
  assert.equal(byId.get('PE01').source, 'pid');
  assert.deepEqual(byId.get('PS05').ambiguous, ['Su Bilgisi', 'Vakum Sensörü']);
  assert.equal(byId.has('PE99'), false, 'kodlar.json varken CSV okunmaz');
  // Çevirisi olmayan diller işaretlenir: PS05 yalnız Türkçe, ML kodunun hiç çevirisi yok
  assert.deepEqual(byId.get('PE01').untranslated, []);
  assert.deepEqual(byId.get('PS05').untranslated, ['en', 'de']);
  assert.deepEqual(byId.get('ZZ01').untranslated, ['en', 'de']);
});

test('kod listesi: kodlar.json yoksa CSV başlangıç kaynağıdır', async (t) => {
  const { root, store } = setup(t);
  fs.rmSync(path.join(root, 'ML', 'kayitlar', 'kodlar.json'));
  const res = await store.ml.load();
  assert.equal(res.source, 'KODListesi.csv');
  assert.deepEqual(res.codes.map((k) => k.kod), ['PE01', 'PE99']);
});

test('makine: aynı seri nolu kayıtlar ayrı kalır ve kendi dosyasına yazılır', async (t) => {
  const { root, store } = setup(t);
  const { machines } = await store.ml.load();
  assert.equal(machines.length, 3);
  const rts = machines.find((m) => m.id === 'x1');
  assert.equal(rts._file, 'XXX_RTS_2B.json');

  const res = await store.ml.saveMachine(Object.assign({}, rts, { kodlar: ['PE01', 'ZZ01'] }));
  assert.equal(res.ok, true);
  assert.equal(res.machine._file, 'XXX_RTS_2B.json');
  assert.equal(has(root, 'ML/kayitlar/XXX.json'), false);
  const saved = JSON.parse(read(root, 'ML/kayitlar/XXX_RTS_2B.json'));
  assert.deepEqual(saved.kodlar, ['PE01', 'ZZ01']);
  assert.equal('_file' in saved, false);
  assert.equal(JSON.parse(read(root, 'ML/kayitlar/XXX_KBN_2B.json')).kodlar[0], 'PS05');
});

test('makine: yeni kayıt, yinelenen seri no ve seri no değişimi', async (t) => {
  const { root, store } = setup(t);
  const dup = await store.ml.saveMachine({ seriNo: '0326053', firma: 'B', model: 'C', kodlar: [] });
  assert.equal(dup.ok, false);

  const created = await store.ml.saveMachine({ seriNo: '0626 051', firma: 'DÜNYA', model: 'ULT', kodlar: ['A', 'A', ' B '] });
  assert.equal(created.ok, true);
  assert.equal(created.machine._file, '0626_051.json');
  assert.deepEqual(created.machine.kodlar, ['A', 'B']);
  assert.ok(created.machine.id);

  const renamed = await store.ml.saveMachine(Object.assign({}, created.machine, { seriNo: '0626052' }));
  assert.equal(renamed.machine._file, '0626052.json');
  assert.equal(has(root, 'ML/kayitlar/0626_051.json'), false, 'eski dosya kalmaz');
  assert.equal(JSON.parse(read(root, 'ML/kayitlar/0626052.json')).id, created.machine.id);

  const missing = await store.ml.saveMachine({ seriNo: '', firma: 'x', model: 'y' });
  assert.equal(missing.ok, false);

  await store.ml.deleteMachine(created.machine.id);
  assert.equal(has(root, 'ML/kayitlar/0626052.json'), false);
});

test('makine: bozuk dosya atlanır ve bildirilir, kodlar.json makine sayılmaz', async (t) => {
  const { root, store } = setup(t);
  write(root, 'ML/kayitlar/bozuk.json', '{');
  const { machines, skipped } = await store.ml.load();
  assert.equal(machines.length, 3);
  assert.deepEqual(skipped, ['bozuk.json']);
});

test('kod silme: başka anlamı kalan kod makinede durur, son satır silinince çıkar', async (t) => {
  const { root, store } = setup(t);
  const first = await store.ml.removeCode({ kod: 'PS05', aciklama: 'Vakum Sensörü' });
  assert.equal(first.machines.length, 0);
  assert.deepEqual(JSON.parse(read(root, 'ML/kayitlar/0326053.json')).kodlar, ['PE02', 'PS05']);

  const second = await store.ml.removeCode({ kod: 'PS05', aciklama: 'Su Bilgisi' });
  assert.equal(second.codes.some((k) => k.kod === 'PS05'), false);
  assert.deepEqual(second.machines.map((m) => m.id).sort(), ['m1', 'x2']);
  assert.deepEqual(JSON.parse(read(root, 'ML/kayitlar/0326053.json')).kodlar, ['PE02']);
});

test('proje-makine eşleşmesi: bağlantı, seri no, aynı seri noda müşteri ve model', () => {
  const list = [
    machine({ id: 'a', seriNo: '111', firma: 'F', model: 'M' }),
    machine({ id: 'x1', seriNo: 'XXX', firma: 'SKT', model: 'RTS' }),
    machine({ id: 'x2', seriNo: 'XXX', firma: 'AMERİKA', model: 'KBN' })
  ];
  assert.equal(Host.findMachine(list, { makineId: 'x2', seriNo: '111' }).id, 'x2');
  assert.equal(Host.findMachine(list, { makineId: 'silinmiş', seriNo: '111' }).id, 'a');
  assert.equal(Host.findMachine(list, { seriNo: 'xxx', musteri: 'amerika', model: 'kbn' }).id, 'x2');
  assert.equal(Host.findMachine(list, { seriNo: 'XXX', musteri: 'yok', model: 'yok' }), null);
  assert.equal(Host.findMachine(list, { seriNo: '' }), null);
});

test('proje: oluşturma, listeleme, kaydetme ve makine bağlantısı', async (t) => {
  const { root, store } = setup(t);
  const missing = await store.engine.createProject({ seriNo: '', musteri: 'a', model: 'b' });
  assert.equal(missing.ok, false);

  const res = await store.engine.createProject({ seriNo: '0326053', musteri: 'AKDENİZ', model: 'KBN. ', makineId: 'm1' });
  assert.equal(res.ok, true);
  assert.equal(res.id, '0326053-AKDENİZ-KBN');
  const dir = `P&ID/projects/${res.id}`;
  for (const sub of ['elektrik', 'layout', 'plc', 'step', 'pid/cikti']) assert.ok(has(root, `${dir}/${sub}/.gitkeep`));
  assert.equal((await store.engine.createProject({ seriNo: '0326053', musteri: 'AKDENİZ', model: 'KBN' })).ok, false);

  const opened = await store.engine.readProject(res.id);
  assert.equal(opened.drawing, null);
  assert.equal(opened.machine.id, 'm1');
  assert.deepEqual(opened.machineCodes, ['PE02', 'PS05']);
  assert.equal(opened.meta.makineId, 'm1');
  assert.equal(opened.meta.rev, '00', 'yeni proje ilk yayındır');
  assert.match(opened.meta.tarih, /^\d{4}-\d{2}-\d{2}$/);

  const drawing = { schema: 1, sheets: [{ items: [{}, {}] }] };
  const saved = await store.engine.saveProject({ id: res.id, drawing, meta: Object.assign(opened.meta, { rev: '02' }) });
  assert.equal(saved.ok, true);
  assert.deepEqual(JSON.parse(read(root, `${dir}/pid/cizim.json`)), drawing);
  assert.equal(JSON.parse(read(root, `${dir}/proje.json`)).rev, '02');

  write(root, `${dir}/layout/plan.dwg`, 'x');
  write(root, `${dir}/layout/plan.dwg.crswap`, 'yarım');
  const { projects } = await store.engine.listProjects();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].sheets, 1);
  assert.equal(projects[0].items, 2);
  assert.deepEqual(projects[0].machine, { id: 'm1', seriNo: '0326053', codes: 2 });
  assert.equal(projects[0].inputs.find((i) => i.id === 'layout').count, 1);
  const { files } = await store.engine.listFiles(res.id);
  assert.deepEqual(files.find((g) => g.id === 'layout').files.map((f) => f.rel), ['layout/plan.dwg']);
});

test('proje: klasör dışına çıkan ad reddedilir, bulunmayan proje hata verir', async (t) => {
  const { store } = setup(t);
  assert.throws(() => store.projectPath('../dışarı'));
  assert.throws(() => store.projectPath('..'));
  assert.equal((await store.engine.readProject('yok')).ok, false);
  assert.equal((await store.engine.saveProject({ id: 'yok', drawing: {} })).ok, false);
});

test('görsel: yalnız assets klasöründen okunur', async (t) => {
  const { store } = setup(t);
  const png = await store.engine.asset('../assets/logos/dolfin.png');
  assert.equal(png.uri, `data:image/png;base64,${Buffer.from([1, 2, 3]).toString('base64')}`);
  const svg = await store.engine.asset('../assets/logos/enva.svg');
  assert.ok(svg.uri.startsWith('data:image/svg+xml;base64,'));
  assert.equal((await store.engine.asset('../data/kod.csv')).ok, false);
  assert.equal((await store.engine.asset('../assets/logos/yok.png')).ok, false);
});

test('eski ML hafızası: yalnız klasörde olmayan kayıtlar aktarılır', async (t) => {
  const { root, store } = setup(t);
  const current = await store.ml.load();
  const diff = Host.legacyDiff({
    kodlar: [
      { kod: 'PE01', aciklama: 'Ön Yıkama Pompa Motoru' },
      { kod: 'YENI1', aciklama: 'Yeni' },
      { kod: 'YENI1', aciklama: 'Yeni' }
    ],
    makineler: [
      machine(),
      machine({ updatedAt: '2025-01-01T00:00:00.000Z', kodlar: ['ESKİ'] }),
      machine({ id: 'm1', updatedAt: '2026-06-01T00:00:00.000Z', kodlar: ['PE02', 'YENI1'] }),
      machine({ id: 'kopya', firma: 'AKDENİZ', kodlar: ['FARKLI'] }),
      machine({ id: 'n1', seriNo: '555', firma: 'YENİ', model: 'M' })
    ]
  }, current);
  assert.deepEqual(diff.codes, [{ kod: 'YENI1', aciklama: 'Yeni' }]);
  assert.deepEqual(diff.machines.map((m) => m.id), ['m1', 'n1']);

  const res = await store.ml.importLegacy(diff);
  assert.equal(res.ok, true);
  const after = await store.ml.load();
  assert.equal(after.codes.length, current.codes.length + 1);
  const m1 = JSON.parse(read(root, 'ML/kayitlar/0326053.json'));
  assert.deepEqual(m1.kodlar, ['PE02', 'YENI1']);
  assert.equal(m1.updatedAt, '2026-06-01T00:00:00.000Z', 'eski tarih korunur');
  assert.ok(has(root, 'ML/kayitlar/555.json'));
});

test('ayarlar: dosya yokken boş döner, kayıt diğer ayarları korur, bozuk dosya programı durdurmaz', async (t) => {
  const { root, store } = setup(t);
  assert.deepEqual((await store.engine.readSettings()).settings, {});
  await store.engine.saveSettings({ kapakTasarimi: 'koyu' });
  await store.engine.saveSettings({ baska: 1 });
  assert.deepEqual(JSON.parse(read(root, 'P&ID/data/ayarlar.json')), { kapakTasarimi: 'koyu', baska: 1 });
  write(root, 'P&ID/data/ayarlar.json', '{bozuk');
  assert.deepEqual(await store.engine.readSettings(), { ok: true, settings: {} });
});

test('açıklamalar: düzenleme metinlere uygulanır, programla gelen metin ayrı kalır', async (t) => {
  const { root, store } = setup(t);
  const saved = await store.engine.saveDescriptions({
    bilesen: { pe01: { tr: ' Elle TR ', en: '' }, ZZ01: { tr: 'Yalnız ML metni' } },
    guvenlik: { LS01: { tr: { logic: 'Elle mantık' } } },
    kalip: { tr: { 'conditions.lock': 'Kapak kilitlenmeden' } }
  });
  assert.equal(saved.ok, true);
  assert.deepEqual(JSON.parse(read(root, 'P&ID/data/aciklamalar.json')).bilesen.PE01, { tr: 'Elle TR' });

  const { entries } = await store.engine.catalog();
  const byId = new Map(entries.map((e) => [e.id, e]));
  assert.equal(byId.get('PE01').description, 'Elle TR');
  assert.equal(byId.get('PE01').desc.en, 'Description EN');
  assert.equal(byId.get('ZZ01').desc.tr, 'Yalnız ML metni');

  const safety = await store.readSafetyCatalog();
  assert.equal(safety.entries[0].tr.logic, 'Elle mantık');
  assert.equal(safety.entries[0].tr.logicEdited, true);
  assert.equal(safety.entries[0].en.logicEdited, false);

  const editor = await store.engine.descriptionCatalog();
  assert.equal(editor.components.find((c) => c.kod === 'PE01').defaults.tr, 'Açıklama TR');
  assert.equal(editor.safety[0].defaults.tr.logic, 'Susuz; çalışmayı engeller');
  assert.equal(editor.edits.kalip.tr['conditions.lock'], 'Kapak kilitlenmeden');
});

test('açıklamalar: bozuk dosya programı durdurmaz ve üzerine yazılmaz', async (t) => {
  const { root, store } = setup(t);
  write(root, 'P&ID/data/aciklamalar.json', '{bozuk');
  const { entries } = await store.engine.catalog();
  assert.equal(entries.find((e) => e.id === 'PE01').description, 'Açıklama TR');
  assert.ok((await store.engine.descriptionCatalog()).readError);
  assert.equal((await store.engine.saveDescriptions({ bilesen: { PE01: { tr: 'x' } } })).ok, false);
  assert.equal(read(root, 'P&ID/data/aciklamalar.json'), '{bozuk');
});

test('katalog: çok dilli açıklamalar çizim kataloğuna gelir', async (t) => {
  const { store } = setup(t);
  const { entries } = await store.engine.catalog();
  const pe01 = entries.find((e) => e.id === 'PE01');
  assert.deepEqual(pe01.desc, { tr: 'Açıklama TR', en: 'Description EN', de: 'Beschreibung DE' });
  assert.equal(pe01.description, 'Açıklama TR');
  assert.equal(entries.find((e) => e.id === 'ZZ01').desc, undefined);
});

test('hata mesajı: açık dosya ve izin hataları anlaşılır', () => {
  for (const name of ['NoModificationAllowedError', 'InvalidStateError', 'NotReadableError']) {
    assert.match(Host.friendlyError(domError(name)), /başka bir programda açık/);
  }
  assert.match(Host.friendlyError(domError('NotAllowedError')), /izni/);
  assert.equal(Host.friendlyError(new Error('x')), 'x');
});

test('proje adı: klasör yeni ada taşınır, dosyalar ve bilgiler korunur, bağlı pnömatik proje güncellenir', async (t) => {
  const { root, store } = setup(t);
  const created = await store.engine.createProject({ seriNo: '0326067', musteri: 'MİTAŞ', model: 'KBN 2B 1650' });
  const oldId = created.id;
  write(root, `P&ID/projects/${oldId}/pid/cizim.json`, '{"schema":1,"sheets":[]}\n');
  write(root, `P&ID/projects/${oldId}/elektrik/sema.pdf`, Buffer.from([7, 8, 9]));
  // Aynı veritabanında duran, bu P&ID projesine bağlı pnömatik proje
  write(root, 'PNOMATIK/projects/0326067-MİTAŞ-KBN 2B 1650/proje.json', JSON.stringify({ seriNo: '0326067', pidProje: oldId }));
  write(root, 'PNOMATIK/projects/BASKA/proje.json', JSON.stringify({ seriNo: '1', pidProje: 'baska' }));

  const res = await store.engine.renameProject({ id: oldId, seriNo: '0326067', musteri: 'MİTAŞ', model: 'KBN 2B 1500' });
  assert.ok(res.ok, res.error);
  assert.equal(res.id, '0326067-MİTAŞ-KBN 2B 1500');
  assert.ok(!has(root, `P&ID/projects/${oldId}`), 'eski klasör kalmaz');
  assert.equal(read(root, `P&ID/projects/${res.id}/pid/cizim.json`), '{"schema":1,"sheets":[]}\n');
  assert.deepEqual([...fs.readFileSync(path.join(root, 'P&ID', 'projects', res.id, 'elektrik', 'sema.pdf'))], [7, 8, 9]);
  assert.ok(has(root, `P&ID/projects/${res.id}/layout`), 'boş girdi klasörleri de taşınır');
  const meta = JSON.parse(read(root, `P&ID/projects/${res.id}/proje.json`));
  assert.equal(meta.model, 'KBN 2B 1500');
  assert.equal(meta.hazirlayan, 'Fatih GÜRAL', 'diğer bilgiler korunur');
  assert.equal(res.relinked, 1);
  assert.equal(JSON.parse(read(root, 'PNOMATIK/projects/0326067-MİTAŞ-KBN 2B 1650/proje.json')).pidProje, res.id);
  assert.equal(JSON.parse(read(root, 'PNOMATIK/projects/BASKA/proje.json')).pidProje, 'baska');
  assert.equal((await store.engine.listProjects()).projects.map((p) => p.id).join(), res.id);

  // Var olan ada taşınmaz; yalnız harf büyüklüğü değişen ad iki adımda taşınır
  await store.engine.createProject({ seriNo: '1', musteri: 'A', model: 'B' });
  const clash = await store.engine.renameProject({ id: res.id, seriNo: '1', musteri: 'A', model: 'B' });
  assert.ok(!clash.ok && /zaten var/.test(clash.error));
  const caseOnly = await store.engine.renameProject({ id: res.id, seriNo: '0326067', musteri: 'MİTAŞ', model: 'kbn 2B 1500' });
  assert.ok(caseOnly.ok, caseOnly.error);
  assert.ok(fs.readdirSync(path.join(root, 'P&ID', 'projects')).includes('0326067-MİTAŞ-kbn 2B 1500'));
  assert.ok(!fs.readdirSync(path.join(root, 'P&ID', 'projects')).some((n) => n.startsWith('.ad-')), 'geçici klasör kalmaz');
  assert.ok(!(await store.engine.renameProject({ id: 'yok', seriNo: '1', musteri: 'A', model: 'C' })).ok);
});

test('kontrol eden ve onaylayan: yeni projede Furkan BIÇAK, boş eski projede de yazılır, elle girilen ad korunur', async (t) => {
  const { root, store } = setup(t);
  const created = await store.engine.createProject({ seriNo: '1', musteri: 'A', model: 'B' });
  const meta = (await store.engine.readProject(created.id)).meta;
  assert.equal(meta.kontrol, 'Furkan BIÇAK');
  assert.equal(meta.onay, 'Furkan BIÇAK');
  write(root, 'P&ID/projects/2-A-B/proje.json', JSON.stringify({ seriNo: '2', kontrol: '', onay: 'Başka Kişi' }));
  const old = (await store.engine.readProject('2-A-B')).meta;
  assert.equal(old.kontrol, 'Furkan BIÇAK');
  assert.equal(old.onay, 'Başka Kişi');
});
