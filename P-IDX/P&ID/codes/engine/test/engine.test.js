const test = require('node:test');
const assert = require('node:assert/strict');

const Sym = require('../symbols.js');
const Router = require('../router.js');
const Model = require('../model.js');
const Sheet = require('../sheet.js');
const Checks = require('../checks.js');
const orthogonal = (path) => path.every((p, i) => {
  if (i === 0) return true;
  const q = path[i - 1];
  return Math.abs(p[0] - q[0]) < 1e-6 || Math.abs(p[1] - q[1]) < 1e-6;
});

function crossesBox(path, box) {
  for (let i = 0; i < path.length - 1; i += 1) {
    const [x0, y0] = path[i];
    const [x1, y1] = path[i + 1];
    if (Math.max(x0, x1) > box[0] + 0.01 && Math.min(x0, x1) < box[2] - 0.01 &&
        Math.max(y0, y1) > box[1] + 0.01 && Math.min(y0, y1) < box[3] - 0.01) return true;
  }
  return false;
}

function tagsBalanced(svg) {
  const stack = [];
  const re = /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z:-]+="[^"]*")*)\s*(\/?)>/g;
  let m;
  let consumed = 0;
  while ((m = re.exec(svg))) {
    consumed += 1;
    if (m[4]) continue;
    if (m[1]) {
      if (stack.pop() !== m[2]) return false;
    } else {
      stack.push(m[2]);
    }
  }
  return stack.length === 0 && consumed > 0;
}

const project = {
  seriNo: '0626051', musteri: 'DÜNYA', model: 'ULT M200 3B', firma: 'DOLFIN', dil: 'tr',
  rev: '01', tarih: '2026-11-02', hazirlayan: 'Fatih GÜRAL', kontrol: '', onay: '', revizyonlar: []
};

test('sembol tanımları geçerli: port, kutu ve SVG', () => {
  for (const def of Sym.all()) {
    assert.ok(def.name.tr && def.name.en && def.name.de, def.id + ' ad eksik');
    const item = { w: 40, h: 30, func: 'LS', tag: 'LS01', note: 'x' };
    const body = Sym.resolveBody(def, item);
    assert.ok(tagsBalanced(`<g>${body}</g>`), def.id + ' SVG bozuk');
    assert.ok(Sym.thumbnail(def.id, 40).startsWith('<svg'), def.id);
    if (def.inline) assert.ok(def.ports.length >= 2, def.id + ' inline ama iki portu yok');
    if (!def.resizable) {
      for (const p of def.ports) {
        assert.ok(p.x >= def.box[0] - 1e-6 && p.x <= def.box[2] + 1e-6, `${def.id}.${p.id} kutu dışında`);
        assert.ok(p.y >= def.box[1] - 1e-6 && p.y <= def.box[3] + 1e-6, `${def.id}.${p.id} kutu dışında`);
      }
    }
  }
});

test('Türkçe normalize: İ, ı, ş, ğ aramayı bozmaz', () => {
  const n = Sym.normalize;
  assert.ok(n('Sepet Redüktörü İnvertörü').includes(n('invertör')));
  assert.ok(n('İnterlock Kilit').includes(n('interlock')));
  assert.ok(n('Hücre İçi Isı Ölçer').includes(n('ici')));
  assert.ok(n('Hücre İçi Isı Ölçer').includes(n('ISI')));
  assert.ok(n('TANK KAPAĞI').includes(n('kapağı')));
});

test('kod önerileri katalog serilerini doğru sembole eşler', () => {
  assert.equal(Sym.suggest('PE02', 'Yıkama Pompa Motoru').symbol, 'p.centrifugal');
  assert.equal(Sym.suggest('PE10', '1. Dozaj Pompası').symbol, 'p.dosing');
  assert.equal(Sym.suggest('FE04', '1. Blower Motoru').symbol, 'f.blower');
  assert.equal(Sym.suggest('LS01', '1. Proses Tankı Alt Seviye Sensörü').func, 'LSL');
  assert.equal(Sym.suggest('LS03', '1. Proses Tankı Üst Seviye Sensörü').func, 'LSH');
  assert.equal(Sym.suggest('TC01', '1. Proses Tankı Isı Ölçer').func, 'TE');
  assert.equal(Sym.suggest('PS01', '1. Proses Pompası Basınç Sensörü').func, 'PT');
  assert.equal(Sym.suggest('PS08', '1. Basınç Şalteri').func, 'PS');
  assert.equal(Sym.suggest('PPS31', '1. Tank Kapağı Açık Sensörü').func, 'ZSO');
  assert.equal(Sym.suggest('PPS32', '1. Tank Kapağı Kapalı Sensörü').func, 'ZSC');
  assert.equal(Sym.suggest('SW13', '1. Flow Switchi').func, 'FS');
  assert.equal(Sym.suggest('SWB46', '1. Tank Otomatik Dolum Solenoid Vanası').symbol, 'v.solenoidFill');
  assert.equal(Sym.suggest('SWB01', '1. Proses Pompa Emiş Aktüatör Vanası Switch Box').func, 'ZS');
  assert.equal(Sym.suggest('V01', '1. Proses Pompa Emiş Aktüatör Vanası valfi').symbol, 'v.pneumatic');
  assert.equal(Sym.suggest('V61', '1. Tank Sepet Kaldırma Valfi').symbol, 'n.valve52');
  assert.equal(Sym.suggest('SS01', 'El Koruma Sensörü').symbol, 's.hand');
  assert.equal(Sym.suggest('SS03', 'Işın Bariyeri').symbol, 's.curtain');
  assert.equal(Sym.suggest('R01', '1. Proses Tankı 1. Rezistans').symbol, 'h.resistance');
  assert.equal(Sym.suggest('TD01', 'Ultrasonik').symbol, 'h.ultrasonic');
  assert.equal(Sym.suggest('B05', 'Acil Stop Butonu').symbol, 's.estop');
});

test('yönlendirici: dik hat üretir, engelden kaçar', () => {
  const a = { x: 0, y: 0, dir: 'R' };
  const b = { x: 100, y: 0, dir: 'L' };
  const straight = Router.route(a, b, {});
  assert.deepEqual(straight, [[0, 0], [100, 0]]);

  const box = [40, -20, 60, 20];
  const around = Router.route(a, b, { obstacles: [box] });
  assert.ok(orthogonal(around), 'dik değil');
  assert.ok(!crossesBox(around, box), 'engelden geçti');
  assert.deepEqual(around[0], [0, 0]);
  assert.deepEqual(around[around.length - 1], [100, 0]);
});

test('yönlendirici: portun baktığı yönden çıkar', () => {
  const up = Router.route({ x: 0, y: 0, dir: 'U' }, { x: 50, y: 50, dir: 'L' }, {});
  assert.ok(orthogonal(up));
  assert.equal(up[1][0], 0, 'ilk parça düşey olmalı');
  assert.ok(up[1][1] < 0, 'yukarı çıkmalı');
  const last = up[up.length - 2];
  assert.equal(last[1], 50, 'son parça yatay olmalı');
  assert.ok(last[0] < 50, 'soldan girmeli');
});

test('yönlendirici: mevcut hatla üst üste binmemeyi tercih eder', () => {
  const a = { x: 0, y: 0, dir: 'R' };
  const b = { x: 100, y: 40, dir: 'L' };
  const free = Router.route(a, b, {});
  const midX = free.find((p) => p[0] > 0 && p[0] < 100)[0];
  const blocked = Router.route(a, b, { occupied: [[midX, -50, midX, 90]] });
  assert.ok(orthogonal(blocked));
  const newMid = blocked.filter((p, i) => i > 0 && i < blocked.length - 1).map((p) => p[0]);
  assert.ok(!newMid.every((x) => x === midX), 'mevcut hatla çakıştı');
});

test('yönlendirici: karşılıklı yakın portlar arasında kıvrım olmaz', () => {
  assert.deepEqual(Router.route({ x: 119, y: 150, dir: 'R' }, { x: 128.5, y: 150, dir: 'L' }, {}), [[119, 150], [128.5, 150]]);
  // Yakın ama hizasız portlar: geri dönüş yapmadan dik gider
  const near = Router.route({ x: 0, y: 0, dir: 'R' }, { x: 6, y: 4, dir: 'L' }, {});
  assert.ok(orthogonal(near));
  for (let i = 0; i < near.length - 1; i += 1) {
    if (near[i][1] === near[i + 1][1]) assert.ok(near[i + 1][0] >= near[i][0], 'geri döndü: ' + JSON.stringify(near));
  }
  // Arada engel varsa düz gitmez
  const blocked = Router.route({ x: 0, y: 0, dir: 'R' }, { x: 40, y: 0, dir: 'L' }, { obstacles: [[15, -5, 25, 5]] });
  assert.ok(!crossesBox(blocked, [15, -5, 25, 5]));
});

test('dönme ve çevirme port yönlerini doğru hesaplar', () => {
  const sheet = Model.createSheet();
  const v = Model.addSymbol(sheet, 'v.gate', 100, 100);
  assert.deepEqual(Model.portsOf(v).find((p) => p.id === 'R'), { id: 'R', x: 105, y: 100, dir: 'R' });
  v.rot = 90;
  assert.deepEqual(Model.portsOf(v).find((p) => p.id === 'R'), { id: 'R', x: 100, y: 105, dir: 'D' });
  v.rot = 180;
  assert.deepEqual(Model.portsOf(v).find((p) => p.id === 'R'), { id: 'R', x: 95, y: 100, dir: 'L' });
  v.rot = 270;
  assert.deepEqual(Model.portsOf(v).find((p) => p.id === 'R'), { id: 'R', x: 100, y: 95, dir: 'U' });
  v.rot = 0;
  v.flip = true;
  assert.deepEqual(Model.portsOf(v).find((p) => p.id === 'R'), { id: 'R', x: 95, y: 100, dir: 'L' });
});

test('hat bağlı olduğu sembol taşınınca güncellenir', () => {
  const sheet = Model.createSheet();
  const a = Model.addSymbol(sheet, 'p.centrifugal', 50, 100);
  const b = Model.addSymbol(sheet, 'v.gate', 150, 100);
  const line = Model.addLine(sheet, { node: a.id, port: 'R' }, { node: b.id, port: 'L' });
  assert.deepEqual(line.path, [[56, 100], [145, 100]]);
  b.y = 140;
  Model.refreshAttached(sheet, [b.id]);
  assert.deepEqual(line.path[0], [56, 100]);
  assert.deepEqual(line.path[line.path.length - 1], [145, 140]);
  assert.ok(orthogonal(line.path));
});

test('hat üzerine vana bırakılınca hat ikiye bölünür, silinince birleşir', () => {
  const sheet = Model.createSheet();
  const a = Model.addSymbol(sheet, 'p.centrifugal', 50, 100);
  const b = Model.addSymbol(sheet, 'e.filter', 200, 100);
  const line = Model.addLine(sheet, { node: a.id, port: 'R' }, { node: b.id, port: 'L' }, { kind: 'process' });
  const valve = Model.insertInline(sheet, line.id, 'v.ball', 120, 101, { tag: 'V10' });
  assert.equal(valve.y, 100, 'hat üzerine oturmalı');
  assert.equal(valve.rot, 0);
  const lines = sheet.items.filter(Model.isLine);
  assert.equal(lines.length, 2);
  assert.ok(lines.some((l) => l.to.node === valve.id));
  assert.ok(lines.some((l) => l.from.node === valve.id));

  Model.removeItems(sheet, [valve.id]);
  const after = sheet.items.filter(Model.isLine);
  assert.equal(after.length, 1, 'tek hat kalmalı');
  assert.equal(after[0].from.node, a.id);
  assert.equal(after[0].to.node, b.id);
});

test('dikey hat üzerine bırakılan vana döner', () => {
  const sheet = Model.createSheet();
  const a = Model.addSymbol(sheet, 'p.centrifugal', 100, 50, { rot: 90 });
  const b = Model.addSymbol(sheet, 'e.filter', 100, 200);
  const line = Model.addLine(sheet, { node: a.id, port: 'R' }, { node: b.id, port: 'U' });
  const valve = Model.insertInline(sheet, line.id, 'v.gate', 100, 120);
  assert.equal(valve.rot, 90);
  assert.equal(valve.x, 100);
});

test('hat bölünüp dal eklenince bağlantı noktası nokta gösterir, dal silinince temizlenir', () => {
  const sheet = Model.createSheet();
  const a = Model.addSymbol(sheet, 'p.centrifugal', 50, 100);
  const b = Model.addSymbol(sheet, 'e.filter', 200, 100);
  const c = Model.addSymbol(sheet, 'e.filter', 120, 180);
  const line = Model.addLine(sheet, { node: a.id, port: 'R' }, { node: b.id, port: 'L' });
  const j = Model.splitLine(sheet, line.id, 120, 100);
  const branch = Model.addLine(sheet, { node: j.id, port: 'C' }, { node: c.id, port: 'U' });
  assert.equal(j.showDot, true);
  Model.removeItems(sheet, [branch.id]);
  assert.equal(sheet.items.filter((i) => i.symbol === 'l.junction').length, 0, 'bağlantı noktası kalmamalı');
  assert.equal(sheet.items.filter(Model.isLine).length, 1, 'hatlar birleşmeli');
});

test('sembol silinince bağlı hat ucu serbest kalır', () => {
  const sheet = Model.createSheet();
  const a = Model.addSymbol(sheet, 'i.field', 50, 100);
  const b = Model.addSymbol(sheet, 'h.resistance', 150, 100);
  const line = Model.addLine(sheet, { node: a.id, port: 'R' }, { node: b.id, port: 'L' }, { kind: 'signal' });
  Model.removeItems(sheet, [b.id]);
  assert.equal(line.to.node, undefined);
  assert.equal(line.to.x, 139);
});

test('kopyalama: seçim içi bağlantılar korunur, dışarısı serbest kalır', () => {
  const sheet = Model.createSheet();
  const a = Model.addSymbol(sheet, 'v.gate', 50, 100);
  const b = Model.addSymbol(sheet, 'v.gate', 100, 100);
  const c = Model.addSymbol(sheet, 'v.gate', 150, 100);
  const l1 = Model.addLine(sheet, { node: a.id, port: 'R' }, { node: b.id, port: 'L' });
  Model.addLine(sheet, { node: b.id, port: 'R' }, { node: c.id, port: 'L' });
  const copies = Model.cloneItems(sheet, [a.id, b.id, l1.id], 0, 50);
  const cl = copies.find(Model.isLine);
  const ca = copies.find((x) => x.x === 50);
  assert.equal(copies.length, 3);
  assert.equal(cl.from.node, ca.id);
  assert.notEqual(cl.id, l1.id);
});

test('tank kenarına bağlantı boyut değişince orantılı kalır', () => {
  const sheet = Model.createSheet();
  const tank = Model.addSymbol(sheet, 'e.tank', 200, 100, { w: 100, h: 50 });
  const anchor = Model.nearestPerimeter(tank, 225, 130);
  assert.equal(anchor.side, 'B');
  assert.equal(anchor.t, 0.75);
  const p1 = Model.perimeterPoint(tank, anchor.side, anchor.t);
  assert.deepEqual([p1.x, p1.y, p1.dir], [225, 125, 'D']);
  tank.w = 200;
  const p2 = Model.perimeterPoint(tank, anchor.side, anchor.t);
  assert.equal(p2.x, 250);
});

test('kapsayıcıya giren hat engellenmez, dışından geçen hat dolaşır', () => {
  const sheet = Model.createSheet();
  const tank = Model.addSymbol(sheet, 'e.tank', 200, 100, { w: 100, h: 60 });
  const left = Model.addSymbol(sheet, 'v.gate', 100, 100);
  const right = Model.addSymbol(sheet, 'v.gate', 300, 100);
  const pass = Model.addLine(sheet, { node: left.id, port: 'R' }, { node: right.id, port: 'L' });
  assert.ok(!crossesBox(pass.path, Model.boxOf(tank)), 'tankın içinden geçmemeli');
  const heater = Model.addSymbol(sheet, 'h.resistance', 200, 110);
  const gate = Model.addSymbol(sheet, 'v.gate', 100, 60);
  const inner = Model.addLine(sheet, { node: gate.id, port: 'R' }, { node: heater.id, port: 'L' });
  assert.ok(orthogonal(inner.path));
  assert.ok(crossesBox(inner.path, Model.boxOf(tank)), 'tanktaki rezistansa giden hat tanka girebilmeli');
});

test('hat sayfa dışına çıkmaz, başlık bloğu ve lejanttan kaçar', () => {
  const sheet = Model.createSheet();
  const g = Model.geometry(sheet);
  const top = g.inner.y0 + 8;
  const a = Model.addSymbol(sheet, 'i.field', 60, top, {});
  const wall = Model.addSymbol(sheet, 'e.tank', 120, top + 40, { w: 40, h: 90 });
  const b = Model.addSymbol(sheet, 'i.field', 180, top, {});
  const up = Model.addLine(sheet, { node: a.id, port: 'U' }, { node: b.id, port: 'U' }, { kind: 'signal' });
  for (const p of up.path) {
    assert.ok(p[1] >= g.inner.y0, 'çerçevenin üstüne çıktı: ' + JSON.stringify(up.path));
    assert.ok(p[0] >= g.inner.x0 && p[0] <= g.inner.x1);
  }
  assert.ok(!crossesBox(up.path, Model.boxOf(wall)));

  const title = [g.title.x, g.title.y, g.title.x + g.title.w, g.title.y + g.title.h];
  const left = Model.addSymbol(sheet, 'v.gate', g.title.x - 30, g.title.y + 18);
  const right = Model.addSymbol(sheet, 'v.gate', g.inner.x1 - 8, g.title.y - 15);
  const around = Model.addLine(sheet, { node: left.id, port: 'R' }, { node: right.id, port: 'R' });
  assert.ok(!crossesBox(around.path, title), 'başlık bloğunun altından geçti');

  const legend = Model.addLegend(sheet, 200, 100);
  legend.w = 80;
  legend.h = 60;
  const m = Model.addSymbol(sheet, 'v.gate', 180, 130);
  const n = Model.addSymbol(sheet, 'v.gate', 300, 130);
  const pass = Model.addLine(sheet, { node: m.id, port: 'R' }, { node: n.id, port: 'L' });
  assert.ok(!crossesBox(pass.path, Model.boxOf(legend)), 'lejantın altından geçti');
});

test('aktüatörlü vana hat üzerine oturur, sinyal portu boşta kalır', () => {
  const sheet = Model.createSheet();
  const a = Model.addSymbol(sheet, 'p.centrifugal', 50, 100);
  const b = Model.addSymbol(sheet, 'e.filter', 200, 100);
  const line = Model.addLine(sheet, { node: a.id, port: 'R' }, { node: b.id, port: 'L' });
  const valve = Model.insertInline(sheet, line.id, 'v.pneumatic', 120, 100);
  const lines = Model.attachedLines(sheet, valve.id);
  assert.deepEqual(lines.map((l) => (l.to.node === valve.id ? l.to.port : l.from.port)).sort(), ['L', 'R']);
  assert.equal(Model.portsOf(valve).find((p) => p.id === 'A').dir, 'U');
});

test('örnek çizim: hat çerçeve dışına çıkmaz, başlık bloğuna girmez', () => {
  const { drawing } = require('../samples/ornek.js').build();
  const sheet = drawing.sheets[0];
  const g = Model.geometry(sheet);
  const title = [g.title.x, g.title.y, g.title.x + g.title.w, g.title.y + g.title.h];
  for (const it of sheet.items) {
    if (Model.isLine(it)) {
      assert.ok(orthogonal(it.path), 'dik değil');
      for (const p of it.path) {
        assert.ok(p[0] >= g.inner.x0 && p[0] <= g.inner.x1 && p[1] >= g.inner.y0 && p[1] <= g.inner.y1, 'çerçeve dışı: ' + JSON.stringify(it.path));
      }
      assert.ok(!crossesBox(it.path, title), 'başlık bloğu: ' + JSON.stringify(it.path));
    } else if (Model.isSymbol(it)) {
      const b = Model.boxOf(it);
      assert.ok(b[0] >= g.inner.x0 && b[2] <= g.inner.x1 && b[1] >= g.inner.y0 && b[3] <= g.inner.y1, it.symbol + ' çerçeve dışı');
      assert.ok(b[2] <= title[0] || b[0] >= title[2] || b[3] <= title[1] || b[1] >= title[3], it.symbol + ' başlık bloğunda');
    }
  }
});

test('kontroller: yinelenen, bilinmeyen, belirsiz kod ve boşta hat', () => {
  const drawing = Model.createDrawing();
  const sheet = drawing.sheets[0];
  Model.addSymbol(sheet, 'v.gate', 50, 50, { tag: 'V01' });
  Model.addSymbol(sheet, 'v.gate', 80, 50, { tag: 'V01' });
  Model.addSymbol(sheet, 'i.field', 110, 50, { tag: 'PS05' });
  Model.addSymbol(sheet, 'i.field', 140, 50, { tag: 'ZZ99' });
  Model.addLine(sheet, { x: 10, y: 10 }, { x: 40, y: 10 });
  const catalog = new Map([
    ['V01', { name: 'Vana' }],
    ['PS05', { name: 'Su Bilgisi', ambiguous: ['Su Bilgisi', 'Hücre İçi Vakum'] }]
  ]);
  const issues = Checks.run(drawing, catalog, ['V01', 'PE02'], project);
  const codes = issues.map((i) => i.code);
  assert.ok(codes.includes('tag-duplicate'));
  assert.ok(codes.includes('tag-unknown'));
  assert.ok(codes.includes('tag-ambiguous'));
  assert.ok(codes.includes('line-free'));
  assert.ok(codes.includes('machine-missing'));
  assert.equal(issues[0].level, 'error', 'hatalar önce gelmeli');
});

test('sayfa SVG üretimi: tüm boyutlarda antet ve başlık bloğu geçerli', () => {
  for (const size of Object.keys(Sheet.SIZES)) {
    const drawing = Model.createDrawing('Genel Akış');
    const sheet = drawing.sheets[0];
    sheet.size = size;
    const tank = Model.addSymbol(sheet, 'e.tank', 150, 120, { tag: 'TN01', note: 'A & B' });
    const pump = Model.addSymbol(sheet, 'p.centrifugal', 250, 150, { tag: 'PE02', optional: true });
    Model.addLine(sheet, { node: tank.id, side: 'R', t: 0.8 }, { node: pump.id, port: 'L' }, { label: 'L-01' });
    Model.addText(sheet, 40, 40, 'Not <1>\nİkinci satır');
    Model.addLegend(sheet, 40, 60);
    const svg = Sheet.sheetSvg(project, drawing, 0, { brands: {} });
    assert.ok(tagsBalanced(svg), size + ' SVG dengesiz');
    assert.ok(svg.includes('DOLFIN'));
    assert.ok(svg.includes('ULT M200 3B'));
    assert.ok(svg.includes('0626051'));
    assert.ok(svg.includes('A &amp; B'), 'kaçış eksik');
    assert.ok(svg.includes('Not &lt;1&gt;'), 'kaçış eksik');
    assert.ok(svg.includes('#ff0000'), 'opsiyon rengi yok');
  }
});

test('kesişen hatlarda yatay hat kavisle atlar', () => {
  const sheet = Model.createSheet();
  Model.addLine(sheet, { x: 0, y: 50 }, { x: 100, y: 50 });
  Model.addLine(sheet, { x: 50, y: 0 }, { x: 50, y: 100 });
  const hops = Sheet.computeHops(sheet);
  assert.equal(hops.size, 1);
  assert.deepEqual([...hops.values()][0], [50]);
});

test('kontrol: çevirisi olmayan kodlar dile göre uyarı verir', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  Model.addSymbol(s, 'p.centrifugal', 50, 50, { tag: 'PE01' });
  Model.addSymbol(s, 'p.centrifugal', 80, 50, { tag: 'PE99' });
  const catalog = new Map([
    ['PE01', { name: 'Pompa', untranslated: [] }],
    ['PE99', { name: 'Yalnız ML pompası', untranslated: ['en', 'de'] }]
  ]);
  const rows = (dil) => Checks.run(drawing, catalog, null, { dil }).filter((r) => r.code === 'translation-missing');
  assert.deepEqual(rows('tr').map((r) => r.level), ['info', 'info']);
  const en = rows('en');
  assert.deepEqual(en.map((r) => r.level), ['warn', 'info']);
  assert.match(en[0].msg, /^EN çevirisi yok.*PE99 \(P&ID\/data\/kod-en\.csv/);
  assert.ok(!en[0].msg.includes('PE01'));
});

/* ─── Revizyon işaretleri ─────────────────────────────── */

const Rev = require('../revisions.js');

test('revizyon: önceki revizyondan bu yana değişen, eklenen ve silinenler işaretlenir', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const pump = Model.addSymbol(s, 'p.centrifugal', 100, 100, { tag: 'PE01' });
  const valve = Model.addSymbol(s, 'v.ball', 150, 100);
  const far = Model.addSymbol(s, 'h.resistance', 300, 200, { tag: 'R01' });
  Model.addLine(s, { node: pump.id, port: 'R' }, { node: valve.id, port: 'L' }, { kind: 'process' });

  Rev.record(drawing, '01');
  assert.equal(Rev.active(drawing), null, 'tek kayıtla işaret olmaz');
  assert.equal(Sheet.renderSheetBody({ dil: 'tr' }, drawing, 0, {}).includes('layer-rev'), false);

  // Değişiklik yokken ikinci revizyon: işaret yok
  Rev.record(drawing, '02');
  assert.equal(Rev.changes(drawing, s).count, 0);

  pump.tag = 'PE02';
  Model.addSymbol(s, 'i.lsl', 40, 40);
  Model.removeItems(s, [far.id]);
  Rev.record(drawing, '03');
  // 03 kaydı alındıktan sonra 02 ile karşılaştırılır
  const res = Rev.changes(drawing, s);
  assert.equal(res.rev, '03');
  assert.equal(res.count, 3);
  // Pompa ve vanadaki değişiklik tek bulut, yeni sensör ve silinen rezistans ayrı bulutlar
  assert.equal(res.clouds.length, 3);
  assert.ok(res.clouds.some((c) => c[0] <= 300 - 11 && c[2] >= 300 + 11), 'silinenin eski yeri işaretli değil');
  const svg = Sheet.renderSheetBody({ dil: 'tr' }, drawing, 0, {});
  assert.ok(svg.includes('layer-rev') && svg.includes('>03</text>'));
  assert.ok(tagsBalanced(`<svg>${svg}</svg>`));
  // Katman gizliyse PDF'e girmez
  assert.equal(Sheet.renderSheetBody({ dil: 'tr' }, drawing, 0, { hiddenLayers: { rev: true } }).includes('layer-rev'), false);

  // Revizyon kaydı silinince işaretler bir önceki çifte döner
  Rev.forget(drawing, '03');
  assert.equal(Rev.active(drawing).rev, '02');
  assert.deepEqual(drawing.revSnapshots.map((r) => r.rev), ['01', '02']);
});

test('revizyon: başka sembol oynayınca yeniden yönlenen hat değişmiş sayılmaz', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const a = Model.addSymbol(s, 'p.centrifugal', 60, 100);
  const b = Model.addSymbol(s, 'v.ball', 200, 100);
  Model.addLine(s, { node: a.id, port: 'R' }, { node: b.id, port: 'L' }, { kind: 'process' });
  Rev.record(drawing, '01');
  Rev.record(drawing, '02');
  // Hattın üstüne konan engel yolu değiştirir ama hat aynı hattır
  Model.addSymbol(s, 'e.filter', 130, 100);
  Model.refreshAll(s);
  const res = Rev.changes(drawing, s);
  assert.equal(res.count, 1);
  assert.equal(res.marks.length, 0);
});

/* ─── Etiket Excel'i ──────────────────────────────────── */

const Xlsx = require('../xlsx.js');
const fsx = require('node:fs');
const pathx = require('node:path');

test('xlsx: zip yazılıp geri okunur', async () => {
  const zip = Xlsx.writeZip([['a.txt', 'merhaba ğüşİ'], ['b/c.xml', '<x/>']]);
  const back = await Xlsx.readZip(zip);
  assert.equal(new TextDecoder().decode(back.get('a.txt')), 'merhaba ğüşİ');
  assert.equal(Xlsx.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('xlsx: etiket listesi şablonun stilleriyle, şablon sırasında yazılır', async () => {
  const template = fsx.readFileSync(pathx.join(__dirname, '../../../../ML/MAKİNE ETİKETLEME.xlsx'));
  const rows = [
    { code: 'V48', name: 'Kapak Aç Valfi' },
    { code: 'PE02', name: 'Yıkama Pompa Motoru' },
    { code: 'R06', name: '2. Proses Tankı 1. Rezistans' },
    { code: 'FE01', name: 'Egzoz Fanı <Motoru>' }
  ];
  const out = await Xlsx.labelWorkbook(rows, { template, title: 'KBN 2B - AKDENİZ - 0326053', sheet: '0326053-KBN 2B', lang: 'tr' });
  const files = await Xlsx.readZip(out);
  const sheet = new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml'));
  const value = (ref) => {
    const m = sheet.match(new RegExp(`<c r="${ref}"[^>]*><is><t[^>]*>([^<]*)</t>`));
    return m ? m[1] : null;
  };
  assert.equal(value('B2'), 'KBN 2B - AKDENİZ - 0326053');
  assert.deepEqual(['C5', 'C6', 'C7', 'C8'].map(value), ['PE02', 'FE01', 'R06', 'V48']);
  assert.equal(value('B6'), 'Egzoz Fanı &lt;Motoru&gt;');
  assert.ok(files.get('xl/styles.xml').length > 1000, 'şablon stilleri kopyalanmadı');
  assert.match(sheet, /<mergeCell ref="B3:L3"\/>/);
  assert.match(sheet, /<row r="5" ht="24.95" customHeight="1">/);
  assert.match(new TextDecoder().decode(files.get('xl/workbook.xml')), /<sheet name="0326053-KBN 2B"/);
});

test('xlsx: şablon yoksa sade biçim, 80 koddan fazlası ikinci sayfaya geçer', async () => {
  const rows = Array.from({ length: 85 }, (_, i) => ({ code: `LS${String(i + 1).padStart(2, '0')}`, name: `Sensör ${i + 1}` }));
  const out = await Xlsx.labelWorkbook(rows, { title: 'T', sheet: 'Makine', lang: 'en' });
  const files = await Xlsx.readZip(out);
  assert.ok(files.has('xl/worksheets/sheet2.xml'));
  const wb = new TextDecoder().decode(files.get('xl/workbook.xml'));
  assert.match(wb, /name="Makine".*name="Makine \(2\)"/);
  assert.match(new TextDecoder().decode(files.get('xl/worksheets/sheet1.xml')), /<t xml:space="preserve">Component<\/t>/);
});

/* ─── Ölçek, grup, sayfa ──────────────────────────────── */

test('ölçek: sembol kutusu, portları ve hatları ölçekle değişir', () => {
  const s = Model.createSheet('T');
  const pump = Model.addSymbol(s, 'p.centrifugal', 100, 100);
  const valve = Model.addSymbol(s, 'v.ball', 160, 100);
  const line = Model.addLine(s, { node: pump.id, port: 'R' }, { node: valve.id, port: 'L' }, { kind: 'process' });
  const w0 = Model.boxOf(pump)[2] - Model.boxOf(pump)[0];
  Model.scaleItems(s, [pump.id], 0.5);
  assert.equal(pump.scale, 0.5);
  assert.ok(Math.abs((Model.boxOf(pump)[2] - Model.boxOf(pump)[0]) - w0 / 2) < 1e-6);
  const r = Model.portsOf(pump).find((p) => p.id === 'R');
  assert.equal(r.x, 103);
  assert.deepEqual(line.path[0], [103, 100]);
  // Mutlak değer ve sınırlar
  Model.scaleItems(s, [pump.id], 10, { absolute: true });
  assert.equal(pump.scale, 4);
  Model.scaleItems(s, [pump.id], 1, { absolute: true });
  assert.equal(pump.scale, undefined);
  // Çizimde ölçek dönüşümü ve yazı boyutu
  const inst = Model.addSymbol(s, 'i.lsl', 50, 50, { scale: 2 });
  const svg = Sheet.renderSymbol(inst, { lang: 'tr' });
  assert.match(svg, /rotate\(0\) scale\(2\)/);
  assert.match(svg, /font-size="6\.2"/);
});

test('ölçek: aralıklarla birlikte grup ortasına göre küçülür, tank genişlik-yükseklik alır', () => {
  const s = Model.createSheet('T');
  const tank = Model.addSymbol(s, 'e.tank', 100, 100, { w: 80, h: 60 });
  const heater = Model.addSymbol(s, 'h.resistance', 120, 100);
  const label = Model.addText(s, 60, 60, 'Not', { size: 4 });
  Model.scaleItems(s, [tank.id, heater.id, label.id], 0.5, { spacing: true });
  assert.deepEqual([tank.w, tank.h], [40, 30]);
  assert.equal(heater.scale, 0.5);
  assert.equal(label.size, 2);
  // Rezistans tanka göre aynı oranda yaklaşır
  assert.ok(Math.abs((heater.x - tank.x) - 10) < 1e-6);
  // Yalnız boyut: yerler değişmez
  const x = heater.x;
  Model.scaleItems(s, [heater.id], 2);
  assert.equal(heater.x, x);
  assert.equal(heater.scale, undefined);
});

test('grup: gruplanır, çözülür; kopyası yeni grup alır', () => {
  const s = Model.createSheet('T');
  const a = Model.addSymbol(s, 'p.centrifugal', 50, 50);
  const b = Model.addSymbol(s, 'v.ball', 80, 50);
  const c = Model.addSymbol(s, 'v.ball', 120, 50);
  const gid = Model.groupItems(s, [a.id, b.id]);
  assert.ok(gid && a.group === gid && b.group === gid && !c.group);
  assert.deepEqual(Model.groupMembers(s, a.id).sort(), [a.id, b.id].sort());
  assert.deepEqual(Model.expandGroups(s, [b.id, c.id]).sort(), [a.id, b.id, c.id].sort());
  assert.equal(Model.groupItems(s, [c.id]), null, 'tek öğe gruplanmaz');
  const copies = Model.cloneList(s, [a, b], 10, 10);
  assert.ok(copies[0].group && copies[0].group === copies[1].group && copies[0].group !== gid);
  Model.ungroupItems(s, [a.id]);
  assert.ok(!a.group && !b.group);
});

test('sayfa: seçim başka sayfaya taşınır, dışarı giden hat boşa çıkar; çoğaltma ve sıralama', () => {
  const drawing = Model.createDrawing('Bir');
  const s1 = drawing.sheets[0];
  const pump = Model.addSymbol(s1, 'p.centrifugal', 100, 100);
  const valve = Model.addSymbol(s1, 'v.ball', 160, 100);
  const tank = Model.addSymbol(s1, 'e.tank', 250, 100);
  Model.addLine(s1, { node: pump.id, port: 'R' }, { node: valve.id, port: 'L' }, { kind: 'process' });
  const cross = Model.addLine(s1, { node: valve.id, port: 'R' }, { node: tank.id, side: 'L', t: 0.5 }, { kind: 'process' });
  const s2 = Model.createSheet('İki');
  drawing.sheets.push(s2);
  const moved = Model.moveToSheet(s1, s2, [pump.id, valve.id]);
  assert.equal(moved.length, 3, 'iki sembol ve aralarındaki hat');
  assert.ok(s2.items.some((it) => it.id === pump.id) && !s1.items.some((it) => it.id === pump.id));
  assert.ok(!cross.from.node && cross.to.node === tank.id, 'sayfa dışına giden hat ucu boşa çıkmalı');
  const copy = Model.duplicateSheet(drawing, 1);
  assert.equal(drawing.sheets[2], copy);
  assert.equal(copy.items.length, s2.items.length);
  assert.ok(copy.items.every((it) => !s2.items.some((o) => o.id === it.id)));
  assert.equal(Model.moveSheet(drawing, 2, -1), 1);
  assert.equal(drawing.sheets[1], copy);
  assert.equal(Model.moveSheet(drawing, 0, -1), 0);
  // Antet: sayfa numarası ve toplam
  const frame = Sheet.renderFrame({ dil: 'tr' }, copy, 1, drawing.sheets.length, { lang: 'tr' });
  assert.match(frame, /2 \/ 3/);
  assert.equal(Sym.localNote('P&ID Şeması 2', 'de'), 'P&ID-Schema 2');
});

test('hazır grup: tank grubu tek grup olarak gelir', () => {
  const Presets = require('../presets.js');
  const drawing = Model.createDrawing('T');
  const s = drawing.sheets[0];
  const tank = Model.addSymbol(s, 'e.tankWash', 150, 120);
  Presets.apply(s, tank, { drawing });
  const members = Model.groupMembers(s, tank.id);
  assert.deepEqual(members.sort(), s.items.map((it) => it.id).sort(), 'semboller, hatlar ve dal noktaları grupta');
  assert.ok(s.items.some(Model.isLine) && s.items.some((it) => it.symbol === 'l.junction'));
});

test('hazır grup: başka gruba giden kilitleme hattı gruba girmez, grup bölünmez', () => {
  const Presets = require('../presets.js');
  const drawing = Model.createDrawing('T');
  const s = drawing.sheets[0];
  const cell = Model.addSymbol(s, 'e.cabin', 100, 100);
  Presets.apply(s, cell, { drawing });
  const tank = Model.addSymbol(s, 'e.tankWash', 280, 120);
  Presets.apply(s, tank, { drawing });
  assert.notEqual(cell.group, tank.group);
  const lid = s.items.find((it) => it.presetRole === 'lid');
  const pump = s.items.find((it) => it.presetRole === 'pump');
  const lock = s.items.find((it) => Model.isLine(it) && it.from.node === lid.id && it.to.node === pump.id);
  assert.ok(lock && !lock.group, 'iki grubu bağlayan hat dışarıda kalır');
  // Tank grubu taşınınca kilitleme hattı kapak switchine bağlı kalır, hücre grubu yerinde durur
  const cellBefore = s.items.filter((it) => it.group === cell.group).map((it) => JSON.stringify(it)).sort();
  const plan = Model.movePlan(s, Model.groupMembers(s, tank.id));
  Model.applyMove(s, plan, 20, 15);
  assert.deepEqual(s.items.filter((it) => it.group === cell.group).map((it) => JSON.stringify(it)).sort(), cellBefore);
  assert.ok(plan.stretch.some((r) => r.line === lock));
  assert.ok(ended(s, lock));
});

/* ─── Grup: her şey içinde, taşıyınca şekli bozulmaz ──── */

/** Yolun iki ucu sembollerdeki bağlantı yerinde mi */
function ended(sheet, line) {
  const a = Model.anchorPoint(sheet, line.from);
  const z = Model.anchorPoint(sheet, line.to);
  const p = line.path;
  return Math.hypot(p[0][0] - a.x, p[0][1] - a.y) < 0.01 && Math.hypot(p[p.length - 1][0] - z.x, p[p.length - 1][1] - z.y) < 0.01;
}

/** Pompa - dal noktası - vana - tank, dalda sensör, boşta hat, ucu boşta hat ve yazı; dışarıda pompa */
function groupScene() {
  const s = Model.createSheet('G');
  const pump = Model.addSymbol(s, 'p.centrifugal', 100, 100);
  const valve = Model.addSymbol(s, 'v.ball', 160, 100);
  const tank = Model.addSymbol(s, 'e.tank', 260, 100, { w: 80, h: 60 });
  const toValve = Model.addLine(s, { node: pump.id, port: 'R' }, { node: valve.id, port: 'L' }, { kind: 'process' });
  const toTank = Model.addLine(s, { node: valve.id, port: 'R' }, { node: tank.id, side: 'L', t: 0.5 }, { kind: 'process' });
  const junction = Model.splitLine(s, toValve.id, 130, 100);
  const sensor = Model.addSymbol(s, 'i.lsh', 130, 70);
  const branch = Model.addLine(s, { node: junction.id, port: 'C' }, { node: sensor.id, port: 'D' }, { kind: 'signal' });
  const free = Model.addLine(s, { x: 110, y: 130 }, { x: 150, y: 150 }, { kind: 'process' });
  const temp = Model.addSymbol(s, 'i.temp', 80, 140);
  const stub = Model.addLine(s, { node: temp.id, port: 'R' }, { x: 95, y: 140 }, { kind: 'signal' });
  const note = Model.addText(s, 110, 160, 'NOT');
  const outside = Model.addSymbol(s, 'p.centrifugal', 120, 250);
  const external = Model.addLine(s, { node: outside.id, port: 'R' }, { node: tank.id, side: 'B', t: 0.5 }, { kind: 'process' });
  return { s, pump, valve, tank, toValve, toTank, junction, sensor, branch, free, temp, stub, note, outside, external };
}

/** Çizgiler dahil her şeyin aynı miktarda kaydığını doğrular */
function assertShifted(before, items, dx, dy) {
  const now = new Map(items.map((it) => [it.id, it]));
  for (const o of before) {
    const it = now.get(o.id);
    assert.ok(it, 'öğe kayıp');
    if (Model.isLine(o)) {
      assert.deepEqual(it.path, o.path.map((p) => [p[0] + dx, p[1] + dy]), `hat yolu aynen kaymalı: ${o.id}`);
      for (const end of ['from', 'to']) {
        if (o[end].node) assert.deepEqual(it[end], o[end]);
        else assert.deepEqual(it[end], { x: o[end].x + dx, y: o[end].y + dy });
      }
    } else {
      assert.deepEqual([it.x, it.y], [o.x + dx, o.y + dy], `öğe aynen kaymalı: ${o.id}`);
    }
  }
}

const snapshotOf = (items) => JSON.parse(JSON.stringify(items));

test('grup: hatlar, dal noktası, boşta hat ve yazı gruba girer; dışarıya giden hat girmez', () => {
  const g = groupScene();
  // Kutu seçimi gibi: görünmez bağlantı noktası seçimde yok, hatlar seçili
  const ids = g.s.items.filter((it) => ![g.junction, g.outside, g.external, g.stub].includes(it)).map((it) => it.id);
  const gid = Model.groupItems(g.s, ids);
  assert.ok(gid);
  for (const it of [g.pump, g.valve, g.tank, g.toValve, g.toTank, g.junction, g.sensor, g.branch, g.free, g.temp, g.stub, g.note]) {
    assert.equal(it.group, gid, `${it.id} grupta olmalı`);
  }
  assert.ok(!g.outside.group && !g.external.group);
  // Hatta tıklamak da grubu seçer
  assert.ok(Model.groupMembers(g.s, g.toTank.id).includes(g.pump.id));
  // Çözünce hiçbiri grupta kalmaz
  Model.ungroupItems(g.s, [g.toTank.id]);
  assert.ok(g.s.items.every((it) => !it.group));
});

test('grup: seçilmemiş iç hat ve dal noktası da gruba girer; tek sembol gruplanmaz', () => {
  const s = Model.createSheet('G');
  const a = Model.addSymbol(s, 'p.centrifugal', 50, 50);
  const b = Model.addSymbol(s, 'v.ball', 100, 50);
  const c = Model.addSymbol(s, 'v.ball', 75, 90);
  const ab = Model.addLine(s, { node: a.id, port: 'R' }, { node: b.id, port: 'L' }, { kind: 'process' });
  const j = Model.splitLine(s, ab.id, 75, 50);
  const jc = Model.addLine(s, { node: j.id, port: 'C' }, { node: c.id, port: 'L' }, { kind: 'process' });
  const gid = Model.groupItems(s, [a.id, b.id, c.id]);
  assert.ok(s.items.every((it) => it.group === gid), 'iç hatlar ve dal noktası gruba girmeli');
  assert.equal(jc.group, gid);
  Model.ungroupItems(s, [a.id]);
  assert.equal(Model.groupItems(s, [a.id, j.id]), null, 'görünmez nokta öğe sayılmaz');
});

test('grup taşıma: hedefte engel olsa da hatların şekli aynen kalır, dışarıya giden hat bağlı kalır', () => {
  const g = groupScene();
  // Hedefte iç hattın üstüne gelecek bir engel: yeniden yönlense kıvrılırdı
  Model.addSymbol(g.s, 'v.ball', 190, 200);
  Model.addSymbol(g.s, 'v.ball', 130, 200);
  const ids = [g.pump, g.valve, g.tank, g.sensor, g.temp, g.note, g.toTank, g.free, g.stub].map((it) => it.id);
  Model.groupItems(g.s, ids);
  const members = Model.groupMembers(g.s, g.pump.id);
  const before = snapshotOf(g.s.items.filter((it) => members.includes(it.id)));
  const outsideBefore = snapshotOf(g.outside);
  const plan = Model.movePlan(g.s, members);
  // Sürükleme adım adım gider, son konum belirleyicidir
  Model.applyMove(g.s, plan, 3, 40);
  Model.applyMove(g.s, plan, 0, 100);
  assertShifted(before, g.s.items, 0, 100);
  assert.deepEqual(snapshotOf(g.outside), outsideBefore);
  assert.ok(ended(g.s, g.external), 'dışarıya giden hat tanka bağlı kalmalı');
  for (const l of g.s.items.filter(Model.isLine)) assert.ok(ended(g.s, l), `uçları kopmamalı: ${l.id}`);
  // Geri dönünce birebir eski yerindedir
  Model.applyMove(g.s, plan, 0, 0);
  assert.deepEqual(snapshotOf(g.s.items.filter((it) => members.includes(it.id))), before);
});

test('seçim taşıma: grup olmasa da görünmez dal noktası geride kalmaz', () => {
  const g = groupScene();
  // Hepsini seç gibi: bağlantı noktası seçimde değil
  const ids = g.s.items.filter((it) => it !== g.junction).map((it) => it.id);
  const before = snapshotOf(g.s.items);
  const plan = Model.movePlan(g.s, ids);
  Model.applyMove(g.s, plan, 25, 10);
  assertShifted(before, g.s.items, 25, 10);
});

test('seçim taşıma: tek kolu seçimde olan dal noktası ana hatta kalır', () => {
  const g = groupScene();
  const x = g.junction.x;
  Model.applyMove(g.s, Model.movePlan(g.s, [g.sensor.id]), 0, -20);
  assert.equal(g.junction.x, x);
  assert.equal(g.junction.y, 100);
  assert.ok(ended(g.s, g.branch));
});

test('taşıma: elle verilen rota dışarıya bağlıyken sürüklerken yıpranmaz', () => {
  const s = Model.createSheet('G');
  const a = Model.addSymbol(s, 'p.centrifugal', 50, 50);
  const b = Model.addSymbol(s, 'v.ball', 150, 90);
  const l = Model.addLine(s, { node: a.id, port: 'R' }, { node: b.id, port: 'L' }, { kind: 'process' });
  const fixed = [[53, 50], [90, 50], [90, 120], [120, 120], [120, 90], [b.x - 3, 90]];
  fixed[fixed.length - 1] = [Model.anchorPoint(s, l.to).x, 90];
  fixed[0] = [Model.anchorPoint(s, l.from).x, 50];
  l.path = fixed.map((p) => p.slice());
  l.manual = true;
  const plan = Model.movePlan(s, [a.id]);
  // Ara adımda ilk parça alttaki parçayla aynı hizaya gelir, dirsekler birleşir; sürükleme sürünce rota eski dirseklerine döner
  Model.applyMove(s, plan, 0, 70);
  assert.ok(l.path.length < fixed.length, 'ara adımda dirsekler birleşmeli');
  Model.applyMove(s, plan, 0, -5);
  assert.equal(l.manual, true);
  assert.equal(l.path.length, fixed.length);
  assert.deepEqual(l.path[2], [90, 120]);
  assert.ok(ended(s, l));
});

test('kapsayıcı taşıma: içindeki boşta hat gelir, başka grup bölünmez, Alt ile içindekiler kalır', () => {
  const s = Model.createSheet('G');
  const tank = Model.addSymbol(s, 'e.tank', 200, 150, { w: 120, h: 90 });
  const inner = Model.addLine(s, { x: 170, y: 140 }, { x: 190, y: 160 }, { kind: 'process' });
  const a = Model.addSymbol(s, 'h.resistance', 220, 150);
  const b = Model.addSymbol(s, 'p.centrifugal', 320, 150);
  Model.groupItems(s, [a.id, b.id]);
  const before = snapshotOf([tank, inner, a, b]);
  Model.applyMove(s, Model.movePlan(s, [tank.id]), 30, 0);
  assertShifted(before, s.items, 30, 0);
  const again = snapshotOf([tank, inner, a, b]);
  Model.applyMove(s, Model.movePlan(s, [tank.id], { contents: false }), 10, 0);
  assert.equal(tank.x, again[0].x + 10);
  assert.equal(a.x, again[2].x);
  assert.deepEqual(inner.path, again[1].path);
});

test('grup: sonradan çizilen hat ve hatta konan parça gruba katılır, dışarıya bağlanınca çıkar', () => {
  const s = Model.createSheet('G');
  const a = Model.addSymbol(s, 'p.centrifugal', 50, 50);
  const b = Model.addSymbol(s, 'v.ball', 120, 50);
  const out = Model.addSymbol(s, 'v.ball', 120, 120);
  const ab = Model.addLine(s, { node: a.id, port: 'R' }, { node: b.id, port: 'L' }, { kind: 'process' });
  const gid = Model.groupItems(s, [a.id, b.id]);
  assert.equal(ab.group, gid);
  // İki üye arasına çizilen hat ve üyeden boşluğa çizilen hat
  const inner = Model.addLine(s, { node: a.id, port: 'M' }, { node: b.id, port: 'R' }, { kind: 'signal' });
  const dangling = Model.addLine(s, { node: b.id, port: 'R' }, { x: 170, y: 60 }, { kind: 'signal' });
  assert.equal(inner.group, gid);
  assert.equal(dangling.group, gid);
  // Boştaki ucu dışarıdaki bir sembole bağlanınca grup dışına çıkar
  dangling.to = { node: out.id, port: 'L' };
  Model.syncLineGroup(s, dangling);
  assert.ok(!dangling.group);
  // Dışarıdan gelen hat gruba girmez
  assert.ok(!Model.addLine(s, { node: out.id, port: 'R' }, { node: a.id, port: 'L' }, { kind: 'process' }).group);
  // Gruptaki hatta açılan dal noktası ve konan vana da gruba girer
  const j = Model.splitLine(s, ab.id, 85, 50);
  assert.equal(j.group, gid);
  assert.ok(s.items.filter((it) => Model.isLine(it) && it.to.node === b.id && it.from.node === j.id).every((l) => l.group === gid));
  const piece = s.items.find((it) => Model.isLine(it) && it.from.node === a.id && it.to.node === j.id);
  const v = Model.insertInline(s, piece.id, 'v.ball', 70, 50);
  assert.equal(v.group, gid);
  const before = snapshotOf(s.items.filter((it) => it.group === gid));
  Model.applyMove(s, Model.movePlan(s, Model.groupMembers(s, a.id)), 10, 5);
  assertShifted(before, s.items, 10, 5);
});

test('grup silme: hatlarıyla gider, boşta kalıntı olmaz; tek parça kalan grup çözülür', () => {
  const g = groupScene();
  Model.groupItems(g.s, [g.pump.id, g.valve.id, g.sensor.id, g.note.id]);
  const members = Model.groupMembers(g.s, g.pump.id);
  assert.ok(members.includes(g.junction.id));
  Model.removeItems(g.s, members);
  assert.ok(!g.s.items.some((it) => members.includes(it.id)));
  assert.equal(g.s.items.filter((it) => it.symbol === 'l.junction').length, 0);
  const s = Model.createSheet('G');
  const a = Model.addSymbol(s, 'v.ball', 50, 50);
  const b = Model.addSymbol(s, 'v.ball', 100, 50);
  Model.groupItems(s, [a.id, b.id]);
  Model.removeItems(s, [a.id]);
  assert.ok(!b.group);
});

test('grup kopyası: hatlarıyla yeni grup olur, parçadan alınan kopya tek başına grup olmaz', () => {
  const g = groupScene();
  Model.groupItems(g.s, [g.pump.id, g.valve.id, g.sensor.id, g.free.id]);
  const members = g.s.items.filter((it) => it.group === g.pump.group);
  const copies = Model.cloneList(g.s, members, 10, 10);
  assert.equal(copies.length, members.length);
  assert.ok(copies.every((c) => c.group && c.group === copies[0].group && c.group !== g.pump.group));
  g.s.items.push(...copies);
  const ids = new Set(copies.map((c) => c.id));
  for (const c of copies) {
    if (!Model.isLine(c)) continue;
    assert.ok([c.from, c.to].every((a) => !a.node || ids.has(a.node)), 'kopya hat kopya sembole bağlı olmalı');
    assert.ok(ended(g.s, c));
  }
  const [single] = Model.cloneList(g.s, [g.pump], 5, 5);
  assert.ok(!single.group);
});

test('grup ölçekleme: hatlar şeklini korur, boşta hat da küçülür, uçlar yerinde', () => {
  const g = groupScene();
  Model.groupItems(g.s, [g.pump.id, g.valve.id, g.tank.id, g.sensor.id, g.free.id, g.note.id]);
  const members = Model.groupMembers(g.s, g.pump.id);
  // Yönlendiricinin kendiliğinden çizmeyeceği elle verilmiş bir rota
  const start = Model.anchorPoint(g.s, g.toTank.from);
  const end = Model.anchorPoint(g.s, g.toTank.to);
  g.toTank.path = [[start.x, 100], [190, 100], [190, 130], [205, 130], [205, 100], [end.x, 100]];
  g.toTank.manual = true;
  const freeBefore = snapshotOf(g.free);
  const width = Math.abs(freeBefore.path[freeBefore.path.length - 1][0] - freeBefore.path[0][0]);
  Model.scaleItems(g.s, members, 0.5, { spacing: true });
  assert.equal(g.toTank.path.length, 6, 'elle verilen rotanın dirsekleri kalmalı');
  assert.equal(g.toTank.manual, true);
  assert.ok(Math.abs(Math.abs(g.toTank.path[2][1] - g.toTank.path[1][1]) - 15) < 1e-6, 'dirsek yüksekliği de yarıya inmeli');
  assert.ok(Math.abs(Math.abs(g.free.path[g.free.path.length - 1][0] - g.free.path[0][0]) - width / 2) < 1e-6, 'boşta hat da yarıya inmeli');
  assert.equal(g.pump.scale, 0.5);
  assert.ok(!g.junction.scale, 'bağlantı noktasının boyutu olmaz');
  for (const l of g.s.items.filter((it) => Model.isLine(it) && it.group)) assert.ok(ended(g.s, l), `uç sembolde olmalı: ${l.id}`);
  assert.ok(ended(g.s, g.external), 'dışarıya giden hat bağlı kalmalı');
});

test('grup başka sayfaya: hatlarıyla ve aynı yolda gider, hedef sayfadaki hatlara dokunulmaz', () => {
  const g = groupScene();
  Model.groupItems(g.s, [g.pump.id, g.valve.id, g.sensor.id, g.free.id, g.toTank.id]);
  const members = Model.groupMembers(g.s, g.pump.id);
  const before = snapshotOf(g.s.items.filter((it) => members.includes(it.id) && it.id !== g.toTank.id));
  const target = Model.createSheet('H');
  const x = Model.addSymbol(target, 'v.ball', 50, 50);
  const y = Model.addSymbol(target, 'v.ball', 150, 90);
  const own = Model.addLine(target, { node: x.id, port: 'R' }, { node: y.id, port: 'L' }, { kind: 'process' });
  own.path = [[own.path[0][0], 50], [100, 50], [100, 90], [own.path[own.path.length - 1][0], 90]];
  const ownPath = snapshotOf(own.path);
  Model.moveToSheet(g.s, target, members);
  assertShifted(before, target.items, 0, 0);
  assert.deepEqual(own.path, ownPath, 'hedef sayfanın hattı değişmemeli');
  // Dışarıya giden hat sayfada kalır, taşınan ucu boşa çıkar
  assert.ok(g.s.items.includes(g.toTank) && !g.toTank.from.node && g.toTank.to.node === g.tank.id);
  assert.ok(!g.toTank.group, 'sayfada tek kalan üye gruptan çıkar');
});

test('eski çizim: grupların hatları ve dal noktaları açılışta gruba katılır, tekrar çağırınca değişmez', () => {
  const Presets = require('../presets.js');
  const drawing = Model.createDrawing('T');
  const s = drawing.sheets[0];
  const tank = Model.addSymbol(s, 'e.tankWash', 150, 120);
  Presets.apply(s, tank, { drawing });
  // Eski kayıt: hatlar ve bağlantı noktalarında grup yok
  const gid = tank.group;
  for (const it of s.items) if (Model.isLine(it) || it.symbol === 'l.junction') delete it.group;
  const lines = s.items.filter(Model.isLine).length;
  const dots = s.items.filter((it) => it.symbol === 'l.junction').length;
  const paths = snapshotOf(s.items.filter(Model.isLine).map((l) => l.path));
  const Revisions = require('../revisions.js');
  Revisions.record(drawing, '0');
  assert.equal(Model.normalizeGroups(drawing), lines + dots);
  assert.ok(s.items.every((it) => it.group === gid));
  assert.deepEqual(s.items.filter(Model.isLine).map((l) => l.path), paths, 'hatlar yeniden yönlenmez');
  Revisions.record(drawing, '1');
  assert.equal(Revisions.changes(drawing, s).count, 0, 'revizyon bulutu çıkmaz');
  assert.equal(Model.normalizeGroups(drawing), 0);
  // Grupsuz çizime dokunulmaz
  const plain = Model.createDrawing('P');
  const a = Model.addSymbol(plain.sheets[0], 'v.ball', 50, 50);
  const b = Model.addSymbol(plain.sheets[0], 'v.ball', 100, 50);
  const l = Model.addLine(plain.sheets[0], { node: a.id, port: 'R' }, { node: b.id, port: 'L' }, { kind: 'process' });
  assert.equal(Model.normalizeGroups(plain), 0);
  assert.ok(!l.group);
});

test('sistem kodları: su girişi PS06, hava girişi PS07; katalogda ve kayıtlarda çift anlam kalmaz', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const repo = path.resolve(__dirname, '../../../..');
  const rows = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8').split(/\r?\n/);
  for (const rel of ['P&ID/data/kod.csv', 'P&ID/data/kod-en.csv', 'P&ID/data/kod-de.csv', 'ML/KODListesi.csv']) {
    for (const code of ['PS05', 'PS06', 'PS07']) {
      assert.equal(rows(rel).filter((l) => l.startsWith(`${code};`)).length, 1, `${rel} içinde ${code} tek satır olmalı`);
    }
  }
  const name = (rel, code) => rows(rel).find((l) => l.startsWith(`${code};`)).split(';')[1];
  assert.match(name('P&ID/data/kod.csv', 'PS05'), /Vakum/);
  assert.match(name('P&ID/data/kod.csv', 'PS06'), /Su Basınç/);
  assert.match(name('P&ID/data/kod.csv', 'PS07'), /Hava Basınç/);
  assert.match(name('P&ID/data/kod-en.csv', 'PS06'), /Water/);
  assert.match(name('P&ID/data/kod-en.csv', 'PS07'), /Air/);
  assert.match(name('P&ID/data/kod-de.csv', 'PS06'), /Wasser/);
  assert.match(name('P&ID/data/kod-de.csv', 'PS07'), /Luft/);

  const kodlar = JSON.parse(fs.readFileSync(path.join(repo, 'ML/kayitlar/kodlar.json'), 'utf8')).kodlar;
  const meanings = (code) => kodlar.filter((k) => k.kod === code).map((k) => k.aciklama);
  assert.equal(meanings('PS06').length, 1);
  assert.equal(meanings('PS07').length, 1);
  assert.match(meanings('PS06')[0], /Su Basınç/);
  assert.match(meanings('PS07')[0], /Hava Basınç/);

  // Sembol önerisi ve varsayılan kod
  assert.equal(Sym.suggest('PS06', meanings('PS06')[0]).symbol, 'i.waterPressure');
  assert.equal(Sym.suggest('PS07', meanings('PS07')[0]).symbol, 'i.airPressure');
  assert.equal(Sym.suggest('PS05', 'Hücre İçi Vakum Sensörü').symbol, 'i.vacuum');
  assert.equal(Sym.suggest('PS08', '1. Basınç Şalteri').func, 'PS');
  assert.equal(Sym.get('i.waterPressure').defaultTag, 'PS06');
  assert.equal(Sym.get('i.airPressure').defaultTag, 'PS07');
});

test('piston sembolleri: kendi kategorisinde durur, sensörler kodlardan önerilir', () => {
  const pistons = Sym.list().filter((d) => d.cat === 'piston').map((d) => d.id);
  for (const id of ['n.cylinder', 'n.cylinderSet', 'n.cylinderSpring', 'n.cylinderRod', 'n.cylinderLift', 'i.pistonSensor', 'i.zso', 'i.zsm', 'i.zsc']) {
    assert.ok(pistons.includes(id), `${id} piston kategorisinde olmalı`);
  }
  for (const id of pistons) {
    const def = Sym.get(id);
    const svg = Sheet.renderSymbol({ id: 'x', type: 'symbol', symbol: id, x: 50, y: 50, tag: 'PPS01', func: def.defaultFunc || '' }, { lang: 'tr' });
    assert.ok(tagsBalanced(svg), `${id} çizimi bozuk`);
    assert.ok(def.ports.length >= 2, `${id} bağlanabilir olmalı`);
    assert.equal(def.layer, def.isInstrument ? 'inst' : 'pneu', `${id} katmanı`);
  }
  assert.equal(Sym.suggest('PPS01', 'Ana Hücre Kapak Pistonu Açık Sensörü').symbol, 'i.zso');
  assert.equal(Sym.suggest('PPS02', 'Ana Hücre Kapak Pistonu Kapalı Sensörü').symbol, 'i.zsc');
  const mid = Sym.suggest('PPS14', '1. Proses Tankı Lift Pistonu Ara Sensörü');
  assert.deepEqual([mid.symbol, mid.func], ['i.zsm', 'ZSM']);
  assert.equal(Sym.suggest('PPS99', 'Piston Sensörü').symbol, 'i.pistonSensor');
});

test('sensörlü piston: iki sensör sinyal hatlarıyla gelir, grup birlikte taşınır, sensör silinince hattı gider', () => {
  const Presets = require('../presets.js');
  const drawing = Model.createDrawing('T');
  const s = drawing.sheets[0];
  const cyl = Model.addSymbol(s, 'n.cylinderSet', 150, 120);
  const res = Presets.apply(s, cyl, { drawing });
  const open = s.items.find((it) => it.symbol === 'i.zso');
  const closed = s.items.find((it) => it.symbol === 'i.zsc');
  assert.ok(open && closed && res.items.length === 4);
  const lines = s.items.filter(Model.isLine);
  assert.deepEqual(lines.map((l) => [l.kind, l.to.node, l.to.port]), [['signal', cyl.id, 'S1'], ['signal', cyl.id, 'S2']]);
  assert.deepEqual(Model.groupMembers(s, cyl.id).sort(), [cyl.id, open.id, closed.id, ...lines.map((l) => l.id)].sort());
  assert.ok(open.func === 'ZSO' && closed.func === 'ZSC');
  Model.removeItems(s, [open.id]);
  assert.equal(s.items.filter(Model.isLine).length, 1);
});

test('sayfa silme: başka sayfa silinince bulunulan sayfa değişmez; açık sayfa silinince komşusu açılır', () => {
  const drawing = Model.createDrawing('A');
  const [a] = drawing.sheets;
  const b = Model.createSheet('B');
  const c = Model.createSheet('C');
  drawing.sheets.push(b, c);
  // B açıkken A silinir: B'de kalınır (eskiden C açılıyordu)
  let open = Model.removeSheet(drawing, 0, 1);
  assert.equal(drawing.sheets[open], b);
  drawing.sheets.unshift(a);
  // C açıkken C silinir: yeni son sayfa açılır
  open = Model.removeSheet(drawing, 2, 2);
  assert.equal(drawing.sheets[open], b);
  // Ortadaki açıkken silinir: aynı sıradaki sayfa açılır
  drawing.sheets.push(c);
  open = Model.removeSheet(drawing, 1, 1);
  assert.equal(drawing.sheets[open], c);
  // Son kalan sayfa silinmez
  open = Model.removeSheet(drawing, 0, 0);
  open = Model.removeSheet(drawing, 0, 0);
  assert.equal(drawing.sheets.length, 1);
  assert.equal(open, 0);
});

test('doğrudan boyut: %70 sembol, tank ve yazıyı asıl boyutun %70 oranında bırakır, tekrar girilince birikmez', () => {
  const s = Model.createSheet('T');
  const tank = Model.addSymbol(s, 'e.tank', 100, 100, { w: 80, h: 60 });
  const pump = Model.addSymbol(s, 'p.centrifugal', 200, 100);
  const label = Model.addText(s, 60, 60, 'Not', { size: 4 });
  const ids = [tank.id, pump.id, label.id];
  const items = [tank, pump, label];
  assert.equal(Model.selectionPercent(items), 100);
  for (let i = 0; i < 2; i += 1) {
    Model.scaleItems(s, ids, 0.7, { absolute: true });
    assert.deepEqual([tank.w, tank.h], [56, 42]);
    assert.equal(pump.scale, 0.7);
    assert.equal(label.size, 2.8);
    assert.equal(Model.selectionPercent(items), 70);
  }
  // Yerler sabit kaldı
  assert.deepEqual([pump.x, pump.y], [200, 100]);
  // Asıl boyuta dönüş ve göreli küçültme sonrası doğru okuma
  Model.scaleItems(s, ids, 1, { absolute: true });
  assert.deepEqual([tank.w, tank.h, pump.scale, label.size], [80, 60, undefined, 4]);
  Model.scaleItems(s, ids, 0.9);
  assert.equal(Model.selectionPercent(items), 90);
  // Farklı boyutlar ortak değer vermez
  Model.scaleItems(s, [pump.id], 0.6, { absolute: true });
  assert.equal(Model.selectionPercent(items), null);
  assert.equal(Model.selectionPercent([pump]), 60);
});

/** Kod listesi, Türkçe katalog ve makine kayıtlarındaki bütün kodlar */
function everyCode() {
  const fs = require('node:fs');
  const path = require('node:path');
  const repo = path.resolve(__dirname, '../../../..');
  const codes = new Map();
  const add = (kod, ad) => {
    const id = String(kod).trim().toUpperCase();
    if (id && (!codes.has(id) || !codes.get(id))) codes.set(id, String(ad || '').trim());
  };
  const csv = fs.readFileSync(path.join(repo, 'P&ID/data/kod.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1);
  for (const row of csv) {
    const cells = row.split(';');
    if (cells[0]) add(cells[0], cells[1]);
  }
  const dir = path.join(repo, 'ML/kayitlar');
  for (const k of JSON.parse(fs.readFileSync(path.join(dir, 'kodlar.json'), 'utf8')).kodlar) add(k.kod, k.aciklama);
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json') || name === 'kodlar.json') continue;
    for (const kod of JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')).kodlar) add(kod, '');
  }
  return codes;
}
const seriesOfCode = (kod) => (kod.match(/^[A-Z]+/) || [''])[0];

test('her kodun sembolü var: listedeki ve kayıtlardaki hiçbir kod genel daireye düşmez', () => {
  const codes = everyCode();
  assert.ok(codes.size > 400);
  for (const [kod, ad] of codes) {
    const s = Sym.suggest(kod, ad);
    const def = Sym.get(s.symbol);
    assert.ok(def, `${kod}: ${s.symbol} sembolü yok`);
    assert.ok(!def.hidden, `${kod}: ${s.symbol} paletten seçilemez`);
    assert.notEqual(s.symbol, 'i.field', `${kod} ${ad} genel daireye düştü`);
    assert.ok(Sym.seriesOf(s.symbol).includes(seriesOfCode(kod)), `${kod}: ${s.symbol} ${seriesOfCode(kod)} serisinin tablosunda değil`);
    const svg = Sheet.renderSymbol({ id: 'x', type: 'symbol', symbol: s.symbol, x: 50, y: 50, w: 40, h: 30, tag: kod, func: s.func || '' }, { lang: 'tr' });
    assert.ok(svg.includes(kod), `${kod} çizimde okunmuyor`);
    assert.ok(tagsBalanced(svg), `${kod} çizimi bozuk`);
  }
});

test('her seri palette: tablo eksiksiz, her serinin kendi şekli var', () => {
  const series = new Set([...everyCode().keys()].map(seriesOfCode));
  for (const s of series) {
    assert.ok(Sym.SERIES[s], `${s} serisi tabloda yok`);
  }
  for (const [s, ids] of Object.entries(Sym.SERIES)) {
    for (const id of ids) {
      assert.ok(Sym.get(id) && !Sym.get(id).hidden, `${s}: ${id} palette yok`);
    }
  }
  // Genel daireyle aynı çizime sahip seri kalmaz; ana sembolleri birbirinden ayrılır
  const generic = Sym.resolveBody(Sym.get('i.field'), {});
  const mains = Object.values(Sym.SERIES).map((ids) => ids[0]);
  const bodies = new Map();
  for (const id of mains) {
    const body = Sym.resolveBody(Sym.get(id), { w: 20, h: 20 });
    assert.notEqual(body, generic, `${id} genel daireyle aynı`);
    assert.ok(!bodies.has(body), `${id} ile ${bodies.get(body)} aynı çizim`);
    bodies.set(body, id);
  }
  // Portlar gövdenin kutusundan taşmaz, hepsine hat bağlanabilir
  for (const def of Sym.list()) {
    if (def.resizable) continue;
    for (const p of def.ports) {
      assert.ok(p.x >= def.box[0] - 1e-6 && p.x <= def.box[2] + 1e-6 && p.y >= def.box[1] - 1e-6 && p.y <= def.box[3] + 1e-6, `${def.id}.${p.id} kutunun dışında`);
    }
  }
});

test('tanınmayan yeni seri de sembolsüz kalmaz: addan bulunur, bulunamazsa genel daire', () => {
  assert.equal(Sym.suggest('XY01', 'Yeni Pompa Motoru').symbol, 'p.centrifugal');
  assert.equal(Sym.suggest('XY02', 'Hat Sonu Vanası').symbol, 'v.gate');
  assert.equal(Sym.suggest('XY03', 'Kaldırma Pistonu').symbol, 'n.cylinder');
  assert.equal(Sym.suggest('XY04', 'Kaldırma Pistonu Sensörü').symbol, 'i.pistonSensor');
  assert.equal(Sym.suggest('XY05', 'Yağ Tankı Seviye Sensörü').symbol, 'i.level');
  assert.equal(Sym.suggest('XY06', 'Tanımsız').symbol, 'i.field');
  // Listede olmayan ama serisi bilinen kod adsız da doğru sembole gider
  assert.equal(Sym.suggest('LS99', '').symbol, 'i.level');
  assert.equal(Sym.suggest('TC99', '').symbol, 'i.temp');
  assert.equal(Sym.suggest('PRS99', '').symbol, 'i.prox');
  assert.equal(Sym.suggest('SWB99', '').symbol, 'i.switchBox');
});

test('kodu yazılmayan sembole verilen kod çizimde görünür', () => {
  const s = Model.createSheet('T');
  const basket = Model.addSymbol(s, 'e.basket', 100, 100, { tag: 'GE01' });
  const plain = Model.addSymbol(s, 'l.drain', 150, 100);
  assert.match(Sheet.renderSymbol(basket, { lang: 'tr' }), />GE01</);
  assert.ok(!/data-label/.test(Sheet.renderSymbol(plain, { lang: 'tr' })), 'kodsuz semboller eskisi gibi boş kalır');
});

test('eski çizim: genel dairedeki kodlu enstrüman serisinin sembolüne geçer, hattı kopmaz', () => {
  const catalog = new Map([
    ['LS01', { name: '1. Proses Tankı Alt Seviye Sensörü' }],
    ['TC01', { name: '1. Proses Tankı Isı Ölçer' }],
    ['SWB46', { name: '1. Tank Otomatik Dolum Solenoid Vanası' }]
  ]);
  const drawing = Model.createDrawing('T');
  const s = drawing.sheets[0];
  const ls = Model.addSymbol(s, 'i.field', 100, 100, { tag: 'LS01', func: 'LSL' });
  const tc = Model.addSymbol(s, 'i.field', 200, 100, { tag: 'TC01' });
  const valve = Model.addSymbol(s, 'i.field', 250, 100, { tag: 'SWB46' });
  const blank = Model.addSymbol(s, 'i.field', 300, 100, {});
  const pump = Model.addSymbol(s, 'p.centrifugal', 200, 180);
  const line = Model.addLine(s, { node: tc.id, port: 'D' }, { node: pump.id, port: 'M' }, { kind: 'signal' });
  assert.equal(Model.upgradeGenericSymbols(drawing, catalog), 2);
  assert.equal(ls.symbol, 'i.lsl');
  assert.equal(ls.func, 'LSL');
  assert.equal(tc.symbol, 'i.temp');
  assert.equal(tc.func, 'TE', 'boş ISA harfi tamamlanır');
  assert.equal(valve.symbol, 'i.field', 'vanaya dönecek sembol kullanıcıya bırakılır');
  assert.equal(blank.symbol, 'i.field', 'kodsuz daireye dokunulmaz');
  // Hat ucu yeni portun yerine gider
  const d = Model.portsOf(tc).find((p) => p.id === 'D');
  assert.deepEqual(line.path[0], [d.x, d.y]);
  assert.equal(Model.upgradeGenericSymbols(drawing, catalog), 0, 'ikinci kez bir şey değişmez');
});

test('eski çizim: revizyon kaydı olan belge kendiliğinden değişmez', () => {
  const drawing = Model.createDrawing('T');
  const ls = Model.addSymbol(drawing.sheets[0], 'i.field', 100, 100, { tag: 'LS01' });
  drawing.revSnapshots = [{ rev: '01', sheets: {} }];
  assert.equal(Model.upgradeGenericSymbols(drawing, new Map()), 0);
  assert.equal(ls.symbol, 'i.field');
});

test('hazır tank seviye sensörlerini kendi sembolüyle getirir', () => {
  const Presets = require('../presets.js');
  const drawing = Model.createDrawing('T');
  const s = drawing.sheets[0];
  const tank = Model.addSymbol(s, 'e.tankWash', 150, 120);
  Presets.apply(s, tank, { drawing });
  assert.deepEqual(s.items.filter((it) => /^LS/.test(it.tag || '')).map((it) => it.symbol).sort(), ['i.lsh', 'i.lsl']);
  assert.equal(s.items.find((it) => it.symbol === 'i.lsh').func, 'LSH');
  assert.equal(s.items.find((it) => it.symbol === 'i.lsl').func, 'LSL');
});

test('doğrudan boyut: aralıklar seçeneği şimdiki boyuta göre oranlar', () => {
  const s = Model.createSheet('T');
  const a = Model.addSymbol(s, 'p.centrifugal', 100, 100);
  const b = Model.addSymbol(s, 'p.centrifugal', 200, 100);
  Model.scaleItems(s, [a.id, b.id], 0.5, { absolute: true, spacing: true });
  assert.ok(Math.abs((b.x - a.x) - 50) < 1e-6);
  // Asıl boyuta dönünce aralık da eski hâline gelir
  Model.scaleItems(s, [a.id, b.id], 1, { absolute: true, spacing: true });
  assert.ok(Math.abs((b.x - a.x) - 100) < 1e-6);
  // Aynı değer tekrar girilirse yerler değişmez
  const x = a.x;
  Model.scaleItems(s, [a.id, b.id], 1, { absolute: true, spacing: true });
  assert.ok(Math.abs(a.x - x) < 1e-6);
});

test('etiket listesi: kodlu bileşenler Etiket Excel sırasında, metin WhatsApp biçiminde', () => {
  const Field = require('../fieldlist.js');
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  Model.addSymbol(s, 'i.zsoIsa', 40, 40, { tag: 'PPS29' });
  Model.addSymbol(s, 'p.centrifugal', 80, 40, { tag: 'pe02' });
  Model.addSymbol(s, 'p.centrifugal', 120, 40, { tag: 'PE02' });
  Model.addSymbol(s, 'h.resistance', 160, 40, { tag: 'R01' });
  Model.addSymbol(s, 'g.rect', 200, 40);
  Model.addSymbol(s, 'p.dosatron', 240, 40, { tag: 'XX01' });
  const catalog = new Map([
    ['PE02', { name: 'Yıkama Pompa Motoru', en: 'Wash Pump Motor' }],
    ['R01', { name: '1. Proses Tankı 1. Rezistans' }],
    ['PPS29', { name: '4. Proses Tankı Yönlendirme Pistonu Açık Sensörü' }]
  ]);
  const rows = Field.rows(drawing, catalog, 'tr');
  assert.deepEqual(rows.map((r) => r.code), ['PE02', 'R01', 'PPS29', 'XX01']);
  assert.equal(rows[0].name, 'Yıkama Pompa Motoru');
  assert.equal(rows[3].name, 'Dozatron (Oransal Dozaj)', 'listede olmayan kod sembol adıyla yazılır');
  assert.ok(rows.every((r) => r.sheetId && r.itemId));
  assert.equal(Field.rows(drawing, catalog, 'en')[0].name, 'Wash Pump Motor');
  assert.equal(Field.rows(drawing, catalog, 'en')[1].name, '1. Proses Tankı 1. Rezistans', 'çevirisi yoksa Türkçe');

  const title = Field.title({ model: 'ULT M200 3B', musteri: 'dünya', seriNo: '0626051', dil: 'tr' });
  assert.equal(title, 'ULT M200 3B - DÜNYA - 0626051');
  const text = Field.whatsappText(rows, title, 'tr');
  const lines = text.split('\n');
  assert.equal(lines[0], '*ULT M200 3B - DÜNYA - 0626051*');
  assert.equal(lines[1], 'Etiket listesi · 4 kod');
  assert.ok(lines.includes('*PE02*  Yıkama Pompa Motoru'));
  // Seriler arasında boş satır
  assert.equal(lines[lines.indexOf('*R01*  1. Proses Tankı 1. Rezistans') - 1], '');
  assert.equal(Field.whatsappText([{ code: 'A*1', name: '_x_' }], '', 'en').split('\n')[2], '*A1*  x');
});

test('etiket listesi sekmesi: alt panelde ve betik sırası doğru', () => {
  const html = fsx.readFileSync(pathx.join(__dirname, '../../cizim.html'), 'utf8');
  assert.ok(html.includes('data-dock="labels"') && html.includes('id="dockCountLabels"'));
  const at = (src) => html.indexOf(`<script src="${src}"></script>`);
  assert.ok(at('engine/xlsx.js') > 0 && at('engine/xlsx.js') < at('engine/fieldlist.js') && at('engine/fieldlist.js') < at('engine/report.js'));
});

test('projeler arası kopya: kaynak değişmez, başka çizime aynı konumda, dış uçlar boşta', () => {
  const source = Model.createDrawing('A');
  const s = source.sheets[0];
  const tank = Model.addSymbol(s, 'e.tank', 100, 100, { note: 'TANK' });
  const pump = Model.addSymbol(s, 'p.centrifugal', 200, 150, { tag: 'PE02' });
  const valve = Model.addSymbol(s, 'v.ball', 260, 150);
  const inner = Model.addLine(s, { node: pump.id, port: 'R' }, { node: valve.id, port: 'L' }, { kind: 'process' });
  const outer = Model.addLine(s, { node: tank.id, side: 'B', t: 0.5 }, { node: pump.id, port: 'L' }, { kind: 'process' });
  const before = JSON.stringify(source);

  const payload = Model.copyPayload(s, [pump.id, valve.id, outer.id]);
  assert.equal(JSON.stringify(source), before, 'kaynak çizim değişmemeli');
  // JSON'a yazılıp okunabilir (tarayıcı hafızasında saklanır), kaynak sayfaya bağlı değildir
  const stored = JSON.parse(JSON.stringify(payload));
  const outerCopy = stored.find((it) => it.id === outer.id);
  assert.ok(!outerCopy.from.node && Number.isFinite(outerCopy.from.x), 'seçim dışındaki tanka giden uç noktaya sabitlenir');
  assert.ok(stored.some((it) => it.id === inner.id), 'iki ucu seçimde olan hat kopyaya girer');

  const target = Model.createDrawing('B');
  const t = target.sheets[0];
  const copies = Model.cloneList(null, stored, 0, 0);
  t.items.push(...copies);
  const pumpCopy = copies.find((c) => c.tag === 'PE02');
  assert.deepEqual([pumpCopy.x, pumpCopy.y], [200, 150], 'başka çizimde aynı konum');
  assert.ok(copies.every((c) => !s.items.some((it) => it.id === c.id)), 'yeni kimlikler');
  const lineCopy = copies.find((c) => c.type === 'line' && c.from.node);
  assert.ok(copies.some((c) => c.id === lineCopy.from.node) && copies.some((c) => c.id === lineCopy.to.node), 'iç hat kopyalara bağlanır');
});

test('pano: kopyala / yapıştır editörde projeler arası, Ctrl+D panoya dokunmaz', () => {
  const src = fsx.readFileSync(pathx.join(__dirname, '../editor.js'), 'utf8');
  assert.match(src, /PidEditor\.CLIPBOARD_KEY = 'pidx_pano'/);
  assert.ok(src.includes('this.pasteItems(PidModel.copyPayload(this.sheet, [...this.selection]), 10);'), 'Ctrl+D kayık kopya, panoya yazmaz');
  const app = fsx.readFileSync(pathx.join(__dirname, '../app.js'), 'utf8');
  assert.ok(app.includes("PidModel.importSheets(drawing, src.drawing, 'replace')"), 'yeni proje de aynı kuralla kopyalanır');
  assert.ok(app.includes('PidModel.importSheets(editor.drawing, src.drawing, mode)'), 'açık projeye çizim alınır');
});

test('başka projeden çizim al: tahta gelir, antet ve kaynak değişmez, revizyon geçmişi gelmez', () => {
  const source = Model.createDrawing('KAYNAK ÇİZİM');
  const a = source.sheets[0];
  a.size = 'A2';
  const pump = Model.addSymbol(a, 'p.centrifugal', 200, 150, { tag: 'PE02' });
  const valve = Model.addSymbol(a, 'v.ball', 260, 150);
  Model.addLine(a, { node: pump.id, port: 'R' }, { node: valve.id, port: 'L' }, { kind: 'process' });
  Model.addSymbol(a, 'g.rect', 100, 100, { note: 'NOT' });
  const second = Model.createSheet('KAYNAK 2', 'A3');
  Model.addSymbol(second, 'e.tank', 120, 120);
  source.sheets.push(second);
  source.revSnapshots = [{ rev: '01', sheets: {} }];
  const before = JSON.stringify(source);

  // Değiştir: var olan sayfa kimliğini ve çizim adını korur
  const target = Model.createDrawing('BU PROJE');
  target.revSnapshots = [{ rev: '05', sheets: {} }];
  const keepId = target.sheets[0].id;
  Model.addSymbol(target.sheets[0], 'f.fan', 50, 50);
  assert.equal(Model.importSheets(target, source, 'replace'), 0);
  assert.equal(JSON.stringify(source), before, 'kaynak değişmez');
  assert.equal(target.sheets.length, 2);
  assert.equal(target.sheets[0].id, keepId);
  assert.equal(target.sheets[0].title, 'BU PROJE', 'antetteki çizim adı bu projenin');
  assert.equal(target.sheets[0].size, 'A2', 'sayfa boyutu çizimle gelir');
  assert.equal(target.sheets[1].title, 'KAYNAK 2');
  assert.ok(!target.sheets[0].items.some((it) => it.symbol === 'f.fan'));
  assert.equal(target.sheets[0].items.length, 4);
  assert.deepEqual(target.revSnapshots, [{ rev: '05', sheets: {} }], 'bu projenin revizyon geçmişi kalır, kaynağınki gelmez');
  const ids = new Set(a.items.map((it) => it.id));
  assert.ok(target.sheets[0].items.every((it) => !ids.has(it.id)), 'yeni kimlikler');
  const line = target.sheets[0].items.find((it) => it.type === 'line');
  const mine = new Set(target.sheets[0].items.map((it) => it.id));
  assert.ok(mine.has(line.from.node) && mine.has(line.to.node), 'hatlar kopyalara bağlı');

  // Ekle: mevcut çizim kalır, kaynak sayfalar sona eklenir
  const t2 = Model.createDrawing('BU PROJE');
  Model.addSymbol(t2.sheets[0], 'f.fan', 50, 50);
  assert.equal(Model.importSheets(t2, source, 'append'), 1);
  assert.equal(t2.sheets.length, 3);
  assert.ok(t2.sheets[0].items.some((it) => it.symbol === 'f.fan'));
  assert.equal(new Set(t2.sheets.map((s) => s.id)).size, 3);
});
