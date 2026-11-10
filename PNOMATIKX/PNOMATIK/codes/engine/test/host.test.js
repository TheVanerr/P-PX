const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const Host = require('../../host.js');

/* Tarayıcıdaki FileSystemDirectoryHandle arayüzünün gerçek diske bağlı karşılığı */
function domError(name) {
  const err = new Error(name);
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

  async getDirectoryHandle(name, options) {
    const abs = path.join(this.abs, name);
    if (!fs.existsSync(abs)) {
      if (!options || !options.create) throw domError('NotFoundError');
      fs.mkdirSync(abs);
    } else if (!fs.statSync(abs).isDirectory()) {
      throw domError('TypeMismatchError');
    }
    return new DirHandle(abs);
  }

  async getFileHandle(name, options) {
    const abs = path.join(this.abs, name);
    if (!fs.existsSync(abs)) {
      if (!options || !options.create) throw domError('NotFoundError');
      fs.writeFileSync(abs, '');
    } else if (fs.statSync(abs).isDirectory()) {
      throw domError('TypeMismatchError');
    }
    return new FileHandle(abs);
  }

  async removeEntry(name) {
    fs.rmSync(path.join(this.abs, name), { recursive: true, force: true });
  }

  async *entries() {
    for (const d of fs.readdirSync(this.abs, { withFileTypes: true })) {
      const abs = path.join(this.abs, d.name);
      yield [d.name, d.isDirectory() ? new DirHandle(abs) : new FileHandle(abs)];
    }
  }
}

function tempDir(t, name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(root, rel, text) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

/** Küçük bir P&IDX klasörü: kod listesi, bir P&ID projesi ve bir makine kaydı */
function makePidx(t) {
  const root = tempDir(t, 'pidx');
  write(root, 'P&ID/data/kod.csv', '﻿KOD;BİLEŞEN ADI;AÇIKLAMA\nV31;1. Proses Tankı Tahliye Vanası Aç Valfi;Drenaj\nV32;1. Proses Tankı Tahliye Vanası Kapat Valfi;Drenaj\nV47;Ana Valf;Ana\nPS06;Giriş Hava Basıncı Basınç Sensörü;Hava\nPS06;Giriş Su Basınç Sensörü;Su\n');
  write(root, 'P&ID/data/kod-en.csv', 'KOD;NAME;DESCRIPTION\nV31;Tank 1 drain valve open;Drain\n');
  write(root, 'ML/kayitlar/kodlar.json', JSON.stringify({ kodlar: [{ kod: 'PPS13', aciklama: '1. Proses Tankı Lift Pistonu Açık Sensörü' }] }));
  write(root, 'ML/kayitlar/0626051.json', JSON.stringify({ id: 'm1', seriNo: '0626051', firma: 'DÜNYA', model: 'ULT M200 3B', kodlar: ['V47', 'PS06'] }));
  const id = '0626051-DÜNYA-ULT M200 3B';
  write(root, `P&ID/projects/${id}/proje.json`, JSON.stringify({ seriNo: '0626051', musteri: 'DÜNYA', model: 'ULT M200 3B' }));
  write(root, `P&ID/projects/${id}/pid/cizim.json`, JSON.stringify({
    schema: 1,
    sheets: [{ id: 's', title: 'P&ID', size: 'A3', items: [
      { id: 'a', type: 'symbol', symbol: 'n.valve52', x: 0, y: 0, tag: 'V31', note: 'V32' },
      { id: 'b', type: 'symbol', symbol: 'p.centrifugal', x: 0, y: 0, tag: 'PE02', note: 'Pompa' },
      { id: 'c', type: 'line', kind: 'process', from: { node: 'a' }, to: { node: 'b' } }
    ] }]
  }));
  return { root, id };
}

function makeApp(t) {
  const root = tempDir(t, 'pnomatikx');
  write(root, 'PNOMATIK/data/ayarlar.json', '{}');
  write(root, 'PNOMATIK/data/pid-kod.csv', 'KOD;BİLEŞEN ADI;AÇIKLAMA\nV61;1. Tank Sepet Kaldırma Valfi;Sepet\n');
  write(root, 'PNOMATIK/assets/logos/dolfin.png', 'PNG');
  return root;
}

test('P&ID çiziminden kodlar: sembol kodu ve nottaki ikinci kod', () => {
  const codes = Host.drawingCodes({ sheets: [{ items: [
    { type: 'symbol', tag: 'v31', note: 'V32' },
    { type: 'symbol', tag: '', note: 'DRENAJ HATTI' },
    { type: 'line', tag: 'L1' }
  ] }] });
  assert.deepEqual(codes.sort(), ['V31', 'V32']);
});

test('P&IDX okuyucu: projeler, makine kaydı kodları ve çok dilli katalog', async (t) => {
  const { root, id } = makePidx(t);
  const reader = Host.createPidReader(new DirHandle(root));
  const list = await reader.listProjects();
  assert.equal(list.projects.length, 1);
  const p = await reader.readProject(id);
  assert.ok(p.ok);
  assert.deepEqual(p.drawingCodes.sort(), ['PE02', 'V31', 'V32']);
  assert.equal(p.machine.seriNo, '0626051');
  assert.deepEqual(p.codes.sort(), ['PE02', 'PS06', 'V31', 'V32', 'V47']);
  const cat = await reader.catalog();
  assert.ok(cat.ok);
  const byId = new Map(cat.entries.map((e) => [e.id, e]));
  assert.equal(byId.get('V31').en, 'Tank 1 drain valve open');
  assert.equal(byId.get('V32').en, '1. Proses Tankı Tahliye Vanası Kapat Valfi', 'eksik dil Türkçeye düşer');
  assert.equal(byId.get('PPS13').source, 'ml');
  assert.equal(byId.get('PS06').ambiguous.length, 2, 'aynı kodun iki anlamı işaretlenir');
  const machines = await reader.machines();
  assert.equal(machines.machines[0].kodlar.length, 2);
  await assert.rejects(() => reader.readProject('../x'), /Geçersiz/);
});

test('pnömatik proje: oluşturma, P&ID bağlantısı, kaydetme ve listeleme', async (t) => {
  const root = makeApp(t);
  const store = Host.createStore(new DirHandle(root));
  const created = await store.engine.createProject({ seriNo: '0626051', musteri: 'DÜNYA', model: 'ULT M200 3B', pidProje: '0626051-DÜNYA-ULT M200 3B' });
  assert.ok(created.ok);
  assert.equal(created.id, '0626051-DÜNYA-ULT M200 3B');
  assert.ok(fs.existsSync(path.join(root, 'PNOMATIK/projects', created.id, 'pnomatik/cikti')));
  const again = await store.engine.createProject({ seriNo: '0626051', musteri: 'DÜNYA', model: 'ULT M200 3B' });
  assert.equal(again.ok, false);
  const read = await store.engine.readProject(created.id);
  assert.equal(read.meta.pidProje, '0626051-DÜNYA-ULT M200 3B');
  assert.equal(read.meta.pidEtiket, true);
  assert.equal(read.meta.rev, '00', 'yeni proje ilk yayındır');
  assert.match(read.meta.tarih, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(read.drawing, null);
  const drawing = { schema: 1, sheets: [{ id: 's', title: 'Pnömatik', size: 'A3', items: [
    { id: 'v', type: 'symbol', symbol: 'v.52bi', x: 0, y: 0, tag: '1V1', coils: [{ tag: '1Y1', pid: 'V31' }, { tag: '1Y2', pid: 'V32' }] },
    { id: 'a', type: 'symbol', symbol: 'a.cylDouble', x: 0, y: 0, tag: '1A1', sensors: [{ tag: '1B1', pid: 'PPS13', pos: 0 }] }
  ] }] };
  assert.ok((await store.engine.saveProject({ id: created.id, drawing, meta: read.meta })).ok);
  const list = await store.engine.listProjects();
  assert.equal(list.projects.length, 1);
  assert.equal(list.projects[0].links, 3, 'bobin ve sensördeki P&ID kodları sayılır');
});

test('kod eşleştirme listesi ve P&ID kod listesi kopyası', async (t) => {
  const root = makeApp(t);
  const store = Host.createStore(new DirHandle(root));
  assert.equal((await store.engine.readMapping()).text, '');
  await store.engine.saveMapping('KOD;DEVRE;ROL;AKTUATOR;VALF\nV31;Tahliye;Y1;vana;\n');
  assert.ok((await store.engine.readMapping()).text.includes('V31;Tahliye;Y1'));
  const snap = await store.engine.snapshotCatalog();
  assert.equal(snap.source, 'snapshot');
  assert.equal(snap.entries[0].id, 'V61');
  const logo = await store.engine.asset('../assets/logos/dolfin.png');
  assert.ok(logo.ok && logo.uri.startsWith('data:image/png;base64,'));
  assert.equal((await store.engine.asset('../data/ayarlar.json')).ok, false, 'assets dışı okunmaz');
  await assert.rejects(() => store.engine.asset('../../../../etc/passwd'), /Geçersiz yol/);
});

test('gerçek P&IDX ile uyum: depodaki makine kayıtları ve kod listesi okunur', async () => {
  const pidx = path.resolve(__dirname, '../../../../../p-idx');
  if (!fs.existsSync(path.join(pidx, 'P&ID/data/kod.csv'))) return;
  const reader = Host.createPidReader(new DirHandle(pidx));
  const cat = await reader.catalog();
  assert.ok(cat.entries.length > 300);
  const machines = (await reader.machines()).machines;
  assert.ok(machines.some((m) => m.firma === 'BODYCOAT'));
});

test('proje adı: pnömatik proje yeni ada taşınır, çizim ve P&ID bağlantısı korunur', async (t) => {
  const root = tempDir(t, 'pnomatikx-ad');
  write(root, 'PNOMATIK/data/ayarlar.json', '{}');
  const store = Host.createStore(new DirHandle(root));
  const created = await store.engine.createProject({ seriNo: '0326067', musteri: 'MİTAŞ', model: 'KBN 2B 1650', pidProje: '0326067-MİTAŞ-KBN 2B 1650' });
  assert.ok(created.ok, created.error);
  write(root, `PNOMATIK/projects/${created.id}/pnomatik/cizim.json`, '{"schema":1,"sheets":[]}\n');
  const res = await store.engine.renameProject({ id: created.id, seriNo: '0326067', musteri: 'MİTAŞ', model: 'KBN 2B 1500' });
  assert.ok(res.ok, res.error);
  assert.equal(res.id, '0326067-MİTAŞ-KBN 2B 1500');
  assert.ok(!fs.existsSync(path.join(root, 'PNOMATIK', 'projects', created.id)));
  const meta = JSON.parse(fs.readFileSync(path.join(root, 'PNOMATIK', 'projects', res.id, 'proje.json'), 'utf8'));
  assert.equal(meta.model, 'KBN 2B 1500');
  assert.equal(meta.pidProje, '0326067-MİTAŞ-KBN 2B 1650', 'P&ID bağlantısı korunur');
  assert.equal(fs.readFileSync(path.join(root, 'PNOMATIK', 'projects', res.id, 'pnomatik', 'cizim.json'), 'utf8'), '{"schema":1,"sheets":[]}\n');
});
