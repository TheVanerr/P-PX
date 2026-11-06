const test = require('node:test');
const assert = require('node:assert/strict');

const Sym = require('../symbols.js');
const Model = require('../model.js');
const Sheet = require('../sheet.js');
const Checks = require('../checks.js');
const Link = require('../pidlink.js');
const Gen = require('../generator.js');
const Sample = require('../samples/ornek.js');

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
  rev: '01', tarih: '2026-11-03', hazirlayan: 'Fatih GÜRAL', kontrol: '', onay: '', revizyonlar: []
};

test('sembol tanımları geçerli: ad, port, kutu ve SVG', () => {
  for (const def of Sym.all()) {
    assert.ok(def.name.tr && def.name.en && def.name.de, `${def.id} ad eksik`);
    const item = { w: 40, h: 30, tag: '1V1', note: 'x', sensors: def.sensors ? [{ tag: '1B1', pid: 'PPS13', pos: 0 }] : undefined };
    assert.ok(tagsBalanced(`<g>${Sym.resolveBody(def, item)}</g>`), `${def.id} SVG bozuk`);
    assert.ok(Sym.thumbnail(def.id, 40).startsWith('<svg'), def.id);
    if (def.inline) assert.ok(def.ports.length >= 2, `${def.id} inline ama iki portu yok`);
    if (!def.resizable) {
      for (const p of def.ports) {
        assert.ok(p.x >= def.box[0] - 1e-6 && p.x <= def.box[2] + 1e-6, `${def.id}.${p.id} kutu dışında`);
        assert.ok(p.y >= def.box[1] - 1e-6 && p.y <= def.box[3] + 1e-6, `${def.id}.${p.id} kutu dışında`);
      }
    }
    if (def.coils) assert.equal(Sym.coilsOf(def).length, def.coils, `${def.id} bobin yeri`);
  }
});

test('yön valfleri ISO 5599 port numaralarını ve konum tablosunu taşır', () => {
  const v52 = Sym.get('v.52mono');
  assert.deepEqual(v52.ports.map((p) => p.id).sort(), ['1', '2', '3', '4', '5']);
  assert.equal(v52.valve.a['4'], 'P');
  assert.equal(v52.valve.n['2'], 'P');
  assert.equal(v52.valve.rest, 'spring');
  assert.equal(Sym.get('v.52bi').coils, 2);
  assert.equal(Sym.get('v.52bi').valve.rest, 'hold');
  assert.ok(Object.values(Sym.get('v.53closed').valve.n).every((s) => s === 'X'));
  assert.deepEqual(Sym.get('v.32nc').ports.map((p) => p.id).sort(), ['1', '2', '3']);
  // Port numaraları sembol metni olarak çizilir
  const texts = Sym.resolveTexts(v52, {}, 'tr').filter((t) => t.port).map((t) => t.t).sort();
  assert.deepEqual(texts, ['1', '2', '3', '4', '5']);
});

test('model: bobin ve sensör alt bileşenleri sembolle senkron kalır', () => {
  const d = Model.createDrawing();
  const s = d.sheets[0];
  const v = Model.addSymbol(s, 'v.52bi', 100, 100);
  assert.equal(v.coils.length, 2);
  const c = Model.addSymbol(s, 'a.cylDouble', 100, 60, { sensors: [{ tag: '1B1', pid: 'PPS13', pos: 0 }] });
  assert.equal(c.sensors.length, 1);
  assert.equal(c.coils, undefined);
  Model.syncParts(Object.assign(v, { symbol: 'v.52mono' }), Sym.get('v.52mono'));
  assert.equal(v.coils.length, 1);
  v.coils[0] = { tag: '1Y1', pid: 'V31' };
  v.tag = '1V1';
  assert.deepEqual([...Model.usedPids(d).keys()].sort(), ['PPS13', 'V31']);
  assert.deepEqual([...Model.usedTags(d).keys()].sort(), ['1B1', '1V1', '1Y1']);
  const line = Model.addLine(s, { node: v.id, port: '4' }, { node: c.id, port: 'A' });
  assert.equal(line.kind, 'work');
  assert.ok(line.path.length >= 2);
});

test('sayfa: bobin, sensör ve [P&ID] etiketleri çizilir; istenirse gizlenir', () => {
  const d = Model.createDrawing();
  const s = d.sheets[0];
  Model.addSymbol(s, 'v.52bi', 150, 120, { tag: '1V1', coils: [{ tag: '1Y1', pid: 'V31' }, { tag: '1Y2', pid: 'V32' }] });
  Model.addSymbol(s, 'a.valveActuator', 150, 60, { tag: '1A1', pid: 'V31', sensors: [{ tag: '1B1', pid: 'SWB01', pos: 0 }] });
  const svg = Sheet.sheetSvg(project, d, 0, {});
  assert.ok(tagsBalanced(svg));
  for (const text of ['1V1', '1Y1', '1Y2', '[V31]', '[V32]', '1B1', '[SWB01]', 'ISO 1219-1 · ISO 1219-2', 'Pnömatik Devre Şeması']) {
    assert.ok(svg.includes(text), `${text} çizimde yok`);
  }
  const hidden = Sheet.sheetSvg(project, d, 0, { showPid: false });
  assert.ok(!hidden.includes('[V31]'));
  assert.ok(hidden.includes('1Y1'));
});

test('üretici: P&ID kodlarından bağlantılı, sayfalara bölünmüş şema kurar', () => {
  const codes = Sample.CODES.map(([kod, name]) => ({ kod, name }));
  const plan = Link.plan(codes, new Map(), {});
  const d = Gen.build(plan, { lang: 'tr' });
  assert.equal(d.sheets.length, 1);
  const s = d.sheets[0];
  const lines = s.items.filter(Model.isLine);
  assert.ok(lines.every((l) => l.from.node && l.to.node), 'boşta hat ucu var');
  for (const it of s.items.filter((x) => Model.isSymbol(x) && Sym.get(x.symbol).role === 'directional')) {
    const port1 = lines.some((l) => (l.from.node === it.id && l.from.port === '1') || (l.to.node === it.id && l.to.port === '1'));
    assert.ok(port1, `${it.tag} besleme portu bağlı değil`);
  }
  // Çift bobinli valf: V31 aç, V32 kapat
  const valve = s.items.find((x) => x.coils && x.coils.some((c) => c.pid === 'V31'));
  assert.equal(valve.symbol, 'v.52bi');
  assert.deepEqual(valve.coils.map((c) => c.pid), ['V31', 'V32']);
  // Ara sensörlü lift pistonu 5/3 orta kapalı valfle sürülür
  const lift = s.items.find((x) => x.coils && x.coils.some((c) => c.pid === 'V61'));
  assert.equal(lift.symbol, 'v.53closed');
  // Çok devre birden fazla sayfaya bölünür ve ana hat sayfa bağlantısıyla sürer
  const many = [];
  for (let i = 1; i <= 16; i += 1) many.push({ kod: `V${String(i).padStart(2, '0')}`, name: `${i}. Proses Pompa Emiş Aktüatör Vanası valfi` });
  const big = Gen.build(Link.plan(many, new Map(), {}), { lang: 'tr' });
  assert.equal(big.sheets.length, 3);
  const pages = big.sheets.map((sheet) => sheet.items.filter((x) => x.symbol === 'l.offpage').map((x) => x.note).sort());
  assert.deepEqual(pages, [['ŞEMA 2'], ['ŞEMA 1', 'ŞEMA 3'], ['ŞEMA 2']]);
});

test('üretici: mevcut şemaya tek devre ve yeni sayfalar eklenir', () => {
  const plan = Link.plan(Sample.CODES.map(([kod, name]) => ({ kod, name })), new Map(), {});
  const d = Gen.build(plan, { lang: 'tr' });
  const extra = Link.assign({ supply: {}, circuits: Link.group([{ kod: 'V20', name: '1. Proses Tankı Oto. Dolum Aktüatör Vanası valfi' }], new Map()).circuits, excluded: [] },
    { start: Link.maxCircuit(d) + 1, manualValve: false, mainValve: false, pressureSensor: false });
  const res = Gen.addCircuit(d, 0, extra.circuits[0], { lang: 'tr' });
  assert.equal(res.sheetIndex, 0);
  const s = d.sheets[0];
  const valve = s.items.find((x) => x.id === res.valveId);
  assert.equal(valve.tag, '5V1');
  assert.ok(s.items.filter(Model.isLine).some((l) => l.from.node === valve.id && l.from.port === '1'));
  const added = Gen.appendCircuits(d, extra.circuits, { lang: 'tr' });
  assert.equal(added, 1);
  assert.equal(d.sheets.length, 2);
  assert.ok(d.sheets[1].items.some((x) => x.symbol === 'l.offpage' && x.note === 'ŞEMA 1'));
  assert.ok(d.sheets[0].items.some((x) => x.symbol === 'l.offpage' && x.note === 'ŞEMA 2'), '1. sayfanın ana hattı 2. sayfaya devam eder');
});

test('sayfalar: seçimi taşır, çoğaltır, sıralar; antet numarası sıraya uyar', () => {
  const drawing = Model.createDrawing('Bir');
  const [s1] = drawing.sheets;
  const valve = Model.addSymbol(s1, 'v.52bi', 80, 100, { tag: '1V1', coils: [{ tag: '1Y1', pid: 'V31' }, { tag: '1Y2', pid: 'V32' }] });
  const cyl = Model.addSymbol(s1, 'a.cylDouble', 160, 60, { tag: '1A1', sensors: [{ tag: '1B1', pid: 'SWB01', pos: 0 }] });
  const sensor = Model.addSymbol(s1, 'k.pressureSensor', 250, 100, { tag: '0B1' });
  const port = (it, i) => ({ node: it.id, port: Model.portsOf(it)[i].id });
  Model.addLine(s1, port(valve, 0), port(cyl, 0));
  const cross = Model.addLine(s1, port(cyl, 1), port(sensor, 0));
  const s2 = Model.createSheet('İki');
  drawing.sheets.push(s2);

  const moved = Model.moveToSheet(s1, s2, [valve.id, cyl.id]);
  assert.equal(moved.length, 3, 'iki sembol ve aralarındaki hat');
  assert.ok(s2.items.includes(valve) && !s1.items.includes(valve));
  assert.ok(!cross.from.node && cross.to.node === sensor.id, 'sayfa dışına giden hat ucu boşa çıkmalı');
  assert.deepEqual(Model.moveToSheet(s2, s2, [valve.id]), []);

  const copy = Model.duplicateSheet(drawing, 1);
  assert.equal(drawing.sheets[2], copy);
  assert.equal(copy.title, 'İki (kopya)');
  assert.equal(copy.items.length, s2.items.length);
  assert.ok(copy.items.every((it) => !s2.items.some((o) => o.id === it.id)), 'kimlikler yeni olmalı');
  const copied = copy.items.find((it) => it.tag === '1V1');
  assert.equal(copied.coils[0].pid, 'V31', 'bobin kodları kopyalanır');
  copied.coils[0].pid = 'X';
  assert.equal(valve.coils[0].pid, 'V31', 'kopya asıl sayfaya bağlı olmamalı');
  const line = copy.items.find(Model.isLine);
  assert.ok(copy.items.some((it) => it.id === line.from.node), 'kopyadaki hat kopyadaki sembole bağlanır');

  assert.equal(Model.moveSheet(drawing, 2, -1), 1);
  assert.equal(drawing.sheets[1], copy);
  assert.equal(Model.moveSheet(drawing, 0, -1), 0);
  assert.match(Sheet.renderFrame(project, copy, 1, drawing.sheets.length, { lang: 'tr' }), /2 \/ 3/);
});

test('sayfa silme: başka sayfa silinince açık sayfa değişmez, son sayfa silinmez', () => {
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
  Model.removeSheet(drawing, 0, 0);
  open = Model.removeSheet(drawing, 0, 0);
  assert.equal(drawing.sheets.length, 1, 'son sayfa silinmez');
  assert.equal(open, 0);
});

test('kontrol: aynı pnömatik kod ve farklı devrelerde aynı P&ID kodu hata verir', () => {
  const d = Model.createDrawing();
  const s = d.sheets[0];
  Model.addSymbol(s, 'v.52bi', 100, 100, { tag: '1V1', coils: [{ tag: '1Y1', pid: 'V31' }, { tag: '1Y2', pid: 'V32' }] });
  Model.addSymbol(s, 'v.52mono', 160, 100, { tag: '2V1', coils: [{ tag: '2Y1', pid: 'V31' }] });
  Model.addSymbol(s, 'a.cylDouble', 100, 50, { tag: '1V1' });
  const issues = Checks.run(d, new Map(), null, project);
  assert.ok(issues.some((i) => i.code === 'tag-duplicate' && i.msg.includes('1V1')));
  assert.ok(issues.some((i) => i.code === 'pid-cross' && i.msg.includes('V31')));
  assert.equal(issues[0].level, 'error');
});

/* ─── Gruplama ve boyut (P&ID ile aynı kurallar) ─────────── */

function circuit() {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const valve = Model.addSymbol(s, 'v.52bi', 100, 150, { tag: '1V1', coils: [{ tag: '1Y1', pid: 'V31' }, { tag: '1Y2', pid: 'V32' }] });
  const cyl = Model.addSymbol(s, 'a.cylDouble', 100, 90, { tag: '1A1', sensors: [{ tag: '1B1', pos: 0 }, { tag: '1B2', pos: 1 }] });
  const a = Model.addLine(s, { node: valve.id, port: '4' }, { node: cyl.id, port: 'A' }, { kind: 'work' });
  const b = Model.addLine(s, { node: valve.id, port: '2' }, { node: cyl.id, port: 'B' }, { kind: 'work' });
  const src = Model.addSymbol(s, 's.source', 40, 190);
  const supply = Model.addLine(s, { node: src.id, port: Sym.get('s.source').ports[0].id }, { node: valve.id, port: '1' }, { kind: 'work' });
  return { drawing, s, valve, cyl, a, b, src, supply };
}

test('pnömatik gruplama: iç hatlar gruba girer, grup katı parça gibi taşınır, dış hat uzar', () => {
  const { s, valve, cyl, a, b, supply } = circuit();
  const gid = Model.groupItems(s, [valve.id, cyl.id]);
  assert.ok(gid);
  assert.equal(a.group, gid);
  assert.equal(b.group, gid);
  assert.ok(!supply.group, 'grubun dışındaki kaynağa giden hat grupta değil');
  assert.deepEqual(Model.expandGroups(s, [cyl.id]).sort(), Model.groupMembers(s, valve.id).sort());

  const before = JSON.stringify(a.path);
  const plan = Model.movePlan(s, Model.groupMembers(s, cyl.id));
  Model.applyMove(s, plan, 20, 10);
  assert.deepEqual([valve.x, valve.y, cyl.x, cyl.y], [120, 160, 120, 100]);
  assert.equal(JSON.stringify(a.path), JSON.stringify(JSON.parse(before).map((p) => [p[0] + 20, p[1] + 10])), 'iç hat şeklini korur');
  const end = supply.path[supply.path.length - 1];
  const port = Model.portsOf(valve).find((p) => p.id === '1');
  assert.deepEqual(end, [port.x, port.y], 'dış hat valfe bağlı kalır');

  // Kopya kendi grubunu alır; bobin ve sensör kodları kopyalanır
  const copies = Model.cloneList(s, s.items.filter((it) => it.group === gid), 0, 60);
  assert.ok(copies.every((c) => c.group && c.group !== gid));
  assert.equal(copies.find((c) => c.symbol === 'v.52bi').coils[1].tag, '1Y2');

  assert.equal(Model.ungroupItems(s, [cyl.id]), 1);
  assert.ok(!s.items.some((it) => it.group));
});

test('pnömatik boyut: sembol, portlar, bobin ve sensör etiketleri birlikte küçülür; geri alınabilir değerler', () => {
  const { s, valve, cyl, a } = circuit();
  const portBefore = Model.portsOf(valve).find((p) => p.id === '4');
  Model.scaleItems(s, [valve.id], 0.5, { absolute: true });
  assert.equal(valve.scale, 0.5);
  assert.equal(Model.selectionPercent([valve]), 50);
  const portAfter = Model.portsOf(valve).find((p) => p.id === '4');
  assert.ok(Math.abs((portAfter.x - valve.x) - (portBefore.x - valve.x) / 2) < 1e-9 && Math.abs((portAfter.y - valve.y) - (portBefore.y - valve.y) / 2) < 1e-9, 'port yarı mesafede');
  const start = a.path[0];
  assert.deepEqual(start, [portAfter.x, portAfter.y], 'hat küçülen portu izler');
  // toLocal ölçeği geri alır (sensör bırakma bunu kullanır)
  const local = Model.toLocal(valve, portAfter.x, portAfter.y);
  const def = Sym.get('v.52bi').ports.find((p) => p.id === '4');
  assert.ok(Math.abs(local.x - def.x) < 1e-9 && Math.abs(local.y - def.y) < 1e-9);

  const svg = Sheet.renderSymbol(valve, { lang: 'tr' });
  assert.ok(tagsBalanced(svg));
  assert.match(svg, /scale\(0\.5\)/);
  assert.match(svg, /font-size="1\.68"[^>]*>1Y1</, 'bobin kodu %70 boyutta (okunur kalır)');

  // Aralıklarla birlikte: grup ortasına göre küçülür, iki sembolün arası da yarıya iner
  Model.scaleItems(s, [valve.id], 1, { absolute: true });
  const gap = cyl.y - valve.y;
  Model.scaleItems(s, [valve.id, cyl.id], 0.5, { spacing: true });
  assert.ok(Math.abs((cyl.y - valve.y) - gap / 2) < 1e-9);
  assert.equal(cyl.scale, 0.5);
  const cylSvg = Sheet.renderSymbol(cyl, { lang: 'tr' });
  assert.ok(tagsBalanced(cylSvg) && cylSvg.includes('>1B2<'));
});

test('pnömatik editör ve panel: gruplama ve boyut kısayolları bağlı', () => {
  const fsx = require('node:fs');
  const pathx = require('node:path');
  const editor = fsx.readFileSync(pathx.join(__dirname, '../editor.js'), 'utf8');
  for (const s of ['groupSelection()', 'ungroupSelection()', 'scaleSelection(', 'PidModel.movePlan(', 'PidModel.expandGroups(', 'PidModel.normalizeGroups(drawing)', 'PidModel.syncLineGroup(']) {
    assert.ok(editor.includes(s), s);
  }
  const panels = fsx.readFileSync(pathx.join(__dirname, '../panels.js'), 'utf8');
  for (const s of ["id=\"mGroup\"", "id=\"mUngroup\"", "'fScale'", "'mScale'", 'data-scale="0.9"', 'groupRow(line)']) assert.ok(panels.includes(s), s);
});

test('proje adı: pnömatikte düğme bağlı; P&ID projesinin adı değişince aynı seri nolu projeye yeniden bağlanır', () => {
  const fsx = require('node:fs');
  const pathx = require('node:path');
  const panels = fsx.readFileSync(pathx.join(__dirname, '../panels.js'), 'utf8');
  assert.ok(panels.includes('id="mRename"') && panels.includes("onField('mRename', 'click', () => app.renameProject())"));
  const app = fsx.readFileSync(pathx.join(__dirname, '../app.js'), 'utf8');
  assert.ok(app.includes('api().renameProject({ id: oldId') && /\r?\n    renameProject,\r?\n/.test(app));
  assert.ok(app.includes('const moved = await findRenamedPid(meta);') && app.includes('meta.pidProje = moved.id;'));
});

test('belge dili: hazır yazılar çevrilir, kullanıcı yazısı kalır; TR / EN / DE düğmeleri ve çok dilli PDF bağlı', () => {
  const fsx = require('node:fs');
  const pathx = require('node:path');
  assert.equal(Sym.localNote('BASINÇLI HAVA 6 bar', 'en'), 'COMPRESSED AIR 6 bar');
  assert.equal(Sym.localNote('BASINÇLI HAVA 6 bar', 'de'), 'DRUCKLUFT 6 bar');
  assert.equal(Sym.localNote('COMPRESSED AIR 6 bar', 'tr'), 'BASINÇLI HAVA 6 bar');
  assert.equal(Sym.localNote('ŞEMA 2', 'en'), 'DIAGRAM 2');
  assert.equal(Sym.localNote('Pnömatik Devre Şeması 2', 'de'), 'Pneumatikschaltplan 2');
  assert.equal(Sym.localNote('KAPAK (AÇ / KAPAT)', 'en'), 'KAPAK (AÇ / KAPAT)');

  const d = Model.createDrawing('Pnömatik Devre Şeması');
  Model.addSymbol(d.sheets[0], 's.source', 40, 200);
  const en = Sheet.sheetSvg(Object.assign({}, project, { dil: 'en' }), d, 0, { lang: 'en' });
  assert.ok(en.includes('COMPRESSED AIR 6 bar') && en.includes('Pneumatic Circuit Diagram'));
  assert.ok(!en.includes('BASINÇLI HAVA'));

  const read = (f) => fsx.readFileSync(pathx.join(__dirname, '..', f), 'utf8');
  const app = read('app.js');
  for (const s of ['function setDocumentLanguage(lang)', 'useLanguage(lang);', 'data-lang=', 'opts.langs', 'state.pdfOptions.langs = null']) assert.ok(app.includes(s), s);
  assert.ok(read('covers.js').includes('data-doc-lang') && read('report.js').includes('PidCovers.langSeg('));
  assert.ok(read('engine.css').includes('.lang-seg button.active'));
});
