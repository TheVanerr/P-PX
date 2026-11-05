const test = require('node:test');
const assert = require('node:assert/strict');

const Sym = require('../symbols.js');
const Model = require('../model.js');
const Link = require('../pidlink.js');
const Gen = require('../generator.js');
const Place = require('../place.js');
const Logic = require('../logic.js');
const Sheet = require('../sheet.js');
const Sample = require('../samples/ornek.js');

const CATALOG = Sample.CODES.map(([id, name]) => ({ id, name }));
const CATALOG_MAP = new Map(CATALOG.map((c) => [c.id, c]));

function env(drawing, projectCodes) {
  return { drawing, mapping: new Map(), catalog: CATALOG, catalogMap: CATALOG_MAP, projectCodes: projectCodes || CATALOG.map((c) => c.id) };
}

function emptyDrawing() {
  return { schema: Model.SCHEMA, sheets: [Model.createSheet('Pnömatik Devre Şeması', 'A3')] };
}

/** Planı boş alana bırakılmış gibi uygular */
function drop(drawing, plan, x, y) {
  return Model.addSymbol(drawing.sheets[0], plan.symbol, x, y, Object.assign({ tag: plan.tag }, JSON.parse(JSON.stringify(plan.props))));
}

function apply(update) {
  Object.assign(update.item, update.props);
  return update.item;
}

test('boş alana bırakılan valf kodu pnömatik koduyla gelir: V31 → 1V1 · 1Y1 [V31]', () => {
  const d = emptyDrawing();
  const plan = Place.forCode('V31', env(d));
  assert.equal(plan.kind, 'coil');
  assert.equal(plan.symbol, 'v.52bi', 'aç / kapat çifti çift bobinli valf');
  assert.equal(plan.tag, '1V1');
  assert.deepEqual(plan.props.coils, [{ tag: '1Y1', pid: 'V31' }, { tag: '1Y2', pid: '' }]);
  assert.match(plan.props.desc, /Tahliye Vanası/);
  assert.equal(plan.pending, null);
  assert.equal(plan.exists, null);

  // Eşi (V32) sürüklenince aynı valfin boş 12 bobinine yazılır
  const valve = drop(d, plan, 100, 120);
  const pair = Place.forCode('V32', env(d));
  assert.ok(pair.pending, 'bekleyen bobin yeri bulunmalı');
  assert.equal(pair.pending.item, valve);
  assert.deepEqual(pair.pending.props.coils[1], { tag: '1Y2', pid: 'V32' });
  assert.match(pair.pending.label, /1V1 · 1Y2 \(bobin 12\)/);
  apply(pair.pending);

  // Aynı kod yeniden sürüklenirse şemadaki yeri gösterilir, ikinci valf konmaz
  const again = Place.forCode('V31', env(d));
  assert.ok(again.exists);
  assert.equal(again.exists.item, valve);
  assert.equal(again.pending, null);
});

test('yeni devre numarası şemadaki en büyük devreden sonra gelir; eşi çiziliyse onun devresi kullanılır', () => {
  const plan = Link.plan(Sample.CODES.slice(0, 6).map(([kod, name]) => ({ kod, name })), new Map(), {});
  const d = Gen.build(plan, { lang: 'tr' });
  const max = Link.maxCircuit(d);
  const fresh = Place.forCode('V48', env(d));
  assert.equal(fresh.circuit, max + 1);
  assert.equal(fresh.tag, `${max + 1}V1`);

  // Üretilen şemadaki kodlar yeniden sürüklenirse ikinci kez konmaz, yeri gösterilir
  assert.ok(Place.forCode('V32', env(d)).exists, 'bobin kodu');
  assert.ok(Place.forCode('SWB01', env(d)).exists, 'switch box kodu');

  // Devrenin bir kodu çiziliyse diğer kodu aynı devre numarasını alır (V48 devre max+1'e çizilince V49 da)
  drop(d, fresh, 300, 120);
  const pair = Place.forCode('V49', env(d));
  assert.equal(pair.circuit, max + 1);
  assert.deepEqual(pair.pending.props.coils[1], { tag: `${max + 1}Y2`, pid: 'V49' });
  // Aynı devrede ikinci valf gerekirse kodlar çakışmaz: kapak sensörü yeni devrede değil, kapak devresinde
  const sensor = Place.forCode('PPS01', env(d));
  assert.equal(sensor.tag, `${max + 1}B2`);
});

test('piston sensörü kodu devrenin silindirine bağlanır; konum adından gelir (açık 2, ara 3, kapalı 1)', () => {
  const codes = ['V61', 'V62', 'PPS13', 'PPS15'];
  const d = Gen.build(Link.plan(codes.map((k) => ({ kod: k, name: CATALOG_MAP.get(k).name })), new Map(), { manualValve: false, mainValve: false }), { lang: 'tr' });
  const cyl = d.sheets[0].items.find((x) => x.symbol === 'a.cylDouble');
  assert.deepEqual(cyl.sensors.map((s) => [s.tag, s.pid, s.pos]), [['1B1', 'PPS15', 0], ['1B2', 'PPS13', 1]]);

  const plan = Place.forCode('PPS14', env(d, codes.concat('PPS14')));
  assert.equal(plan.kind, 'sensor');
  assert.equal(plan.symbol, 'k.cylSensor', 'boş alana bırakılırsa manyetik piston sensörü');
  assert.ok(plan.pending, 'devrenin silindiri bekleyen yer');
  assert.equal(plan.pending.item, cyl);
  const added = plan.pending.props.sensors[2];
  assert.deepEqual(added, { tag: '1B3', pid: 'PPS14', pos: 0.5 });
  assert.equal(plan.pending.message, 'PPS14 → 1A1 sensörü 1B3');
});

test('kod sembolün üstüne bırakılınca ona bağlanır: kodsuz valf ve silindir kod alır', () => {
  const d = emptyDrawing();
  const sheet = d.sheets[0];
  const valve = Model.addSymbol(sheet, 'v.52bi', 100, 120, {});
  const cyl = Model.addSymbol(sheet, 'a.cylDouble', 100, 60, {});
  const plan = Place.forCode('V48', env(d));
  assert.ok(plan.accepts(valve));
  assert.ok(!plan.accepts(cyl), 'bobin kodu silindire bağlanmaz');
  const u = plan.attach(sheet, valve, { x: 100, y: 120 });
  assert.equal(u.props.tag, '1V1');
  assert.deepEqual(u.props.coils[0], { tag: '1Y1', pid: 'V48' });
  apply(u);

  // Kapak sensörleri: kodsuz silindire bırakılan "Açık" sensörü silindire 1A1 kodu verir ve ileri uca oturur
  const open = Place.forCode('PPS01', env(d));
  assert.ok(open.accepts(cyl));
  const s = open.attach(sheet, cyl, { x: cyl.x - 10, y: cyl.y });
  assert.equal(s.props.tag, '1A1');
  assert.deepEqual(s.props.sensors, [{ tag: '1B2', pid: 'PPS01', pos: 1 }], 'adı "Açık": bırakılan yerden bağımsız ileri uç');
  apply(s);
  assert.ok(!open.accepts(cyl) || Place.forCode('PPS01', env(d)).exists, 'aynı sensör ikinci kez eklenmez');
});

test('paletten manyetik sensör silindirin üstüne bırakılır: konum bırakılan yerden, kod devreden', () => {
  const d = emptyDrawing();
  const sheet = d.sheets[0];
  const cyl = Model.addSymbol(sheet, 'a.cylDouble', 100, 60, { tag: '4A1' });
  const rotary = Model.addSymbol(sheet, 'a.rotary', 160, 60, { tag: '5A1' });
  const plan = Place.forSymbol('k.cylSensorPnp', env(d));
  assert.ok(plan.accepts(cyl));
  assert.ok(!plan.accepts(rotary), 'manyetik piston sensörü yalnız silindire');
  assert.equal(Place.forSymbol('v.52mono', env(d)), null);

  const front = cyl.x + 8; // ileri uç (sembol koordinatında x1 = 8)
  const u1 = plan.attach(sheet, cyl, { x: front, y: cyl.y - 5 });
  assert.deepEqual(u1.props.sensors, [{ tag: '4B2', pid: '', pos: 1, type: 'pnp' }]);
  apply(u1);
  // Dolu konuma bırakılan ikinci sensör en yakın boş konuma geçer
  const u2 = plan.attach(sheet, cyl, { x: front, y: cyl.y - 5 });
  assert.deepEqual(u2.props.sensors[1], { tag: '4B3', pid: '', pos: 0.5, type: 'pnp' });

  // Döndürülmüş ve aynalanmış silindirde de geri uç doğru bulunur
  const turned = Model.addSymbol(sheet, 'a.cylDouble', 60, 150, { tag: '6A1', rot: 90, flip: true });
  const back = Model.toWorld(turned, -11, -4.5);
  const u3 = Place.forSymbol('k.cylSensor', env(d)).attach(sheet, turned, back);
  assert.deepEqual(u3.props.sensors, [{ tag: '6B1', pid: '', pos: 0 }]);
});

test('dolu konuma sensör üst üste konmaz: en yakın boş konuma geçer ve mesajda yazar', () => {
  const d = emptyDrawing();
  const sheet = d.sheets[0];
  const cyl = Model.addSymbol(sheet, 'a.cylDouble', 100, 60, { tag: '7A1', sensors: [{ tag: '7B1', pid: 'SW18', pos: 0 }] });
  const closed = Place.forCode('PPS02', env(d)); // "Kapalı": geri konum
  const u = closed.attach(sheet, cyl, { x: cyl.x, y: cyl.y });
  const added = u.props.sensors[1];
  assert.equal(added.pid, 'PPS02');
  assert.equal(added.tag, '7B2', '7B1 dolu');
  assert.equal(added.pos, 0.5, 'geri konum dolu: en yakın boş konum');
  assert.match(u.message, /geri konumu dolu: ara konuma kondu/);
});

test('ana valf ve besleme basınç sensörü devre 0 kodu alır; bekleyen beslemeye yazılır', () => {
  const d = emptyDrawing();
  const main = Place.forCode('V47', env(d));
  assert.equal(main.kind, 'main');
  assert.equal(main.symbol, 'v.32nc');
  assert.equal(main.tag, '0V1');
  assert.deepEqual(main.props.coils, [{ tag: '0Y1', pid: 'V47' }]);
  const ps = Place.forCode('PS06', env(d));
  assert.equal(ps.kind, 'pressure');
  assert.equal(ps.symbol, 'k.pressureSensor');
  assert.equal(ps.tag, '0B1');

  // Üretilen beslemede kodsuz ana valf varsa V47 oraya yazılır
  const plan = Link.plan([{ kod: 'V31', name: CATALOG_MAP.get('V31').name }], new Map(), { forceMainValve: true });
  const built = Gen.build(plan, { lang: 'tr' });
  const pending = Place.forCode('V47', env(built, ['V31', 'V47'])).pending;
  assert.ok(pending);
  assert.equal(pending.item.tag, '0V2');
  assert.deepEqual(pending.props.coils[0], { tag: '0Y1', pid: 'V47' });
});

test('pnömatik olmayan kod yalnız P&ID koduyla yerleşir', () => {
  const d = emptyDrawing();
  const plan = Place.forCode('TT01', env(d));
  assert.equal(plan.kind, 'free');
  assert.equal(plan.tag, '');
  assert.equal(plan.props.pid, 'TT01');
  assert.equal(plan.label, '');
});

test('sürüklenen kodlar Açıklama 2 eşleştirme tablosuna ve Açıklama 1 bileşen listesine girer', () => {
  const d = emptyDrawing();
  const sheet = d.sheets[0];
  const v = Place.forCode('V48', env(d));
  drop(d, v, 100, 120);
  apply(Place.forCode('V49', env(d)).pending);
  const s = Place.forCode('PPS02', env(d));
  drop(d, s, 140, 60);
  const cyl = Model.addSymbol(sheet, 'a.cylDouble', 100, 60, {});
  apply(Place.forCode('PPS01', env(d)).attach(sheet, cyl, null));

  const r = Logic.analyze(d, { lang: 'tr', catalog: CATALOG_MAP });
  const rows = r.mapping.map((m) => `${m.code}=${m.pid}`);
  assert.ok(rows.includes('1V1=V48 / V49'), rows.join(', '));
  assert.ok(rows.includes('1Y1=V48'));
  assert.ok(rows.includes('1Y2=V49'));
  assert.ok(rows.includes('1B1=PPS02'), 'bağımsız manyetik sensör');
  assert.ok(rows.includes('1B2=PPS01'), 'silindire bağlanan sensör');
  assert.ok(r.mapping.every((m) => m.code !== '—'), 'kodsuz satır kalmaz');
  assert.ok(r.mappingDiffers >= 5);
  const sensorRow = r.components.find((c) => c.tag === '1B2');
  assert.equal(sensorRow.name, 'Manyetik Piston Sensörü');
  assert.equal(sensorRow.symbol, 'k.cylSensor');
  const free = r.components.find((c) => c.tag === '1B1');
  assert.equal(free.symbol, 'k.cylSensor');
});

test('manyetik sensör çizimi: silindirde gövdeye oturur, pistonda mıknatıs, PNP okunu taşır; lejantta yer alır', () => {
  const d = emptyDrawing();
  const sheet = d.sheets[0];
  const cyl = Model.addSymbol(sheet, 'a.cylDouble', 100, 60, { tag: '1A1', sensors: [{ tag: '1B1', pid: 'PPS02', pos: 0 }, { tag: '1B2', pid: '', pos: 1, type: 'pnp' }] });
  const svg = Sheet.renderSymbol(cyl, { lang: 'tr' });
  const def = Sym.get('a.cylDouble');
  assert.ok(Sym.pistonMagnet(def, cyl).length > 0);
  assert.ok(svg.includes(Sym.pistonMagnet(def, cyl)));
  assert.ok(Sym.sensorMark(def, cyl.sensors[1], 1).length > Sym.sensorMark(def, cyl.sensors[0], 0).length, 'PNP sensörde çıkış oku');
  assert.equal(Sym.pistonMagnet(def, { sensors: [] }), '', 'sensörsüz silindirde mıknatıs çizilmez');
  const ids = Sheet.legendRows(sheet, 'tr').filter((r) => r.type === 'symbol').map((r) => r.id);
  assert.ok(ids.includes('k.cylSensor') && ids.includes('k.cylSensorPnp'), ids.join(', '));
});
