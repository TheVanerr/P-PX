const test = require('node:test');
const assert = require('node:assert/strict');

const Sym = require('../symbols.js');
const Model = require('../model.js');
const Logic = require('../logic.js');
const Sample = require('../samples/ornek.js');

const CATALOG = new Map([
  ['LS01', { name: '1. Proses Tankı Alt Seviye Sensörü', en: 'Tank 1 Low Level Sensor', de: 'Tank 1 Füllstandssensor unten', description: 'Seviyeyi izler.', desc: { tr: 'Seviyeyi izler.', en: 'Monitors the level.', de: 'Überwacht den Füllstand.' } }],
  ['LS03', { name: '1. Proses Tankı Üst Seviye Sensörü', en: 'Tank 1 High Level Sensor', de: 'Tank 1 Füllstandssensor oben', description: '' }],
  ['PE02', { name: 'Yıkama Pompa Motoru', en: 'Wash Pump Motor', de: 'Waschpumpenmotor', description: 'Sıvıyı basar.', desc: { tr: 'Sıvıyı basar.', en: 'Pumps liquid.', de: 'Fördert Flüssigkeit.' } }],
  ['R01', { name: '1. Proses Tankı 1. Rezistans', en: 'Tank 1 Heater 1', de: 'Tank 1 Heizung 1', description: 'Isıtır.', desc: { tr: 'Isıtır.', en: 'Heats.', de: 'Heizt.' } }],
  ['TC01', { name: '1. Proses Tankı Isı Ölçer', en: 'Tank 1 Temperature', de: 'Tank 1 Temperatur', description: '' }],
  ['SW18', { name: 'Hücre Kapağı Kontrol Switchi', en: 'Cell Lid Switch', de: 'Zellendeckelschalter', description: '' }],
  ['GE01', { name: 'Sepet Redüktörü Motoru', en: 'Basket Gear Motor', de: 'Korbgetriebemotor', description: '' }],
  ['PS07', { name: 'Giriş Hava Basınç Sensörü', en: 'Air Pressure Sensor', de: 'Luftdrucksensor', description: '' }],
  ['SWB46', { name: 'Su Giriş Solenoid Vanası', en: 'Water Inlet Valve', de: 'Wassereinlassventil', description: '' }],
  ['SS01', { name: 'El Koruma Sensörü', en: 'Hand Sensor', de: 'Handsensor', description: '' }]
]);

const SAFETY = new Map([
  ['LS01', {
    tr: { lockedEquipment: 'Proses Pompaları (PE), Isıtıcılar (R01-R05)', logic: 'Susuz çalışmayı engeller.' },
    en: { lockedEquipment: 'Process Pumps (PE), Heaters (R01-R05)', logic: 'Prevents dry running.' },
    de: { lockedEquipment: 'Prozesspumpen (PE), Heizungen (R01-R05)', logic: 'Verhindert Trockenlauf.' }
  }],
  ['TC01', {
    tr: { lockedEquipment: 'Isıtıcılar', logic: 'Isıtma durur.' },
    en: { lockedEquipment: 'Heaters', logic: 'Heating stops.' },
    de: { lockedEquipment: 'Heizungen', logic: 'Heizung stoppt.' }
  }]
]);

/** Kullanıcının örneği: tank + alt seviye sensörü, pompa ve ısıtıcı sensöre bağlı */
function tankScene(connect) {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const tank = Model.addSymbol(s, 'e.tank', 100, 150, { w: 80, h: 60, note: '1. PROSES TANKI' });
  const ls = Model.addSymbol(s, 'i.field', 60, 90, { tag: 'LS01', func: 'LSL' });
  const pump = Model.addSymbol(s, 'p.centrifugal', 150, 90, { tag: 'PE02' });
  const heater = Model.addSymbol(s, 'h.resistance', 100, 165, { tag: 'R01' });
  const sig = { kind: 'signal' };
  Model.addLine(s, { node: ls.id, port: 'D' }, { node: tank.id, side: 'T', t: 0.1 }, sig);
  if (connect !== false) {
    Model.addLine(s, { node: ls.id, port: 'R' }, { node: pump.id, port: 'M' }, sig);
    Model.addLine(s, { node: ls.id, port: 'L' }, { node: heater.id, port: 'L' }, sig);
  }
  return { drawing, s, tank, ls, pump, heater };
}

const run = (drawing, lang) => Logic.analyze(drawing, { catalog: CATALOG, safety: SAFETY, lang: lang || 'tr' });

test('sınıflandırma: ISA harfi, kod serisi ve sembolden tanınır', () => {
  const kindOf = (symbol, props, entry) => Logic.classify(props, Sym.get(symbol), entry);
  assert.deepEqual(
    [kindOf('i.field', { tag: 'LS01', func: 'LSL' }).kind, kindOf('i.field', { tag: 'LS01', func: 'LSL' }).sub],
    ['level', 'low']
  );
  assert.equal(kindOf('i.field', { tag: 'LS03', func: 'LSH' }).sub, 'high');
  assert.equal(kindOf('i.field', { tag: 'LS02' }, { name: 'Orta Seviye Sensörü' }).sub, 'mid');
  assert.equal(kindOf('i.field', { tag: 'TC01', func: 'TE' }).kind, 'temp');
  assert.equal(kindOf('i.field', { tag: 'PS07', func: 'PT' }, { name: 'Giriş Hava Basınç Sensörü' }).sub, 'air');
  assert.equal(kindOf('i.field', { tag: 'SW18', func: 'ZS' }, { name: 'Hücre Kapağı Kontrol Switchi' }).kind, 'door');
  assert.equal(kindOf('i.field', { tag: 'PRS01', func: 'ZS' }, { name: 'Sepet Pozisyon 1 Sensörü' }).kind, 'position');
  assert.equal(kindOf('s.hand', { tag: 'SS01' }).kind, 'hand');
  assert.equal(kindOf('s.estop', { tag: 'B05' }).kind, 'estop');
  assert.equal(kindOf('p.centrifugal', { tag: 'PE02' }).kind, 'pump');
  assert.equal(kindOf('h.resistance', { tag: 'R01' }).kind, 'heater');
  assert.equal(kindOf('v.solenoid', { tag: 'SWB46' }).kind, 'valve');
  assert.equal(kindOf('v.ball', {}).role, 'passive');
  assert.equal(kindOf('e.tank', {}).kind, 'tank');
  assert.equal(kindOf('e.cabin', {}).kind, 'cell');
  assert.equal(kindOf('e.drum', {}).kind, 'basket');
  assert.equal(kindOf('i.interlock', {}).role, 'logic');
});

test('kullanıcı örneği: seviye sensörüne bağlı pompa ve ısıtıcı su yokken çalışmaz', () => {
  const { drawing } = tankScene();
  const res = run(drawing);
  const rule = res.logic.find((r) => r.group === 'interlock');
  assert.ok(rule, 'interlock satırı yok');
  assert.match(rule.text, /^1\. PROSES TANKI içinde su yokken/);
  assert.match(rule.text, /PE02 \(Yıkama Pompa Motoru\)/);
  assert.match(rule.text, /R01 \(1\. Proses Tankı 1\. Rezistans\) çalışmaz\./);
  assert.match(rule.text, /Pompanın kuru çalışması ve rezistansın susuz yanması önlenir\./);
  assert.ok(rule.route.startsWith('LS01 → '), rule.route);

  assert.equal(res.safety.length, 1);
  const safety = res.safety[0];
  assert.equal(safety.fn, 'Kuru çalışma koruması');
  assert.equal(safety.no, 'GF-01');
  assert.equal(safety.connected, true);
  assert.equal(safety.trigger, 'LS01 (1. Proses Tankı Alt Seviye Sensörü)');
  assert.equal(safety.affected.length, 2);
  assert.deepEqual(res.hints.filter((h) => h.level === 'warn'), [], 'bağlı senaryoda uyarı olmamalı');

  const monitor = res.logic.find((r) => r.group === 'monitor');
  assert.match(monitor.text, /1\. PROSES TANKI içindeki seviyeyi izler/);
});

test('metinler proje diline uyar', () => {
  const { drawing } = tankScene();
  const en = run(drawing, 'en').logic.find((r) => r.group === 'interlock').text;
  assert.match(en, /^When there is no liquid in 1\. PROCESS TANK, /);
  assert.match(en, /PE02 \(Wash Pump Motor\)/);
  assert.match(en, /will not run\. This prevents the pump running dry and the heater burning out/);
  const de = run(drawing, 'de').logic.find((r) => r.group === 'interlock').text;
  assert.match(de, /^Wenn in 1\. PROZESSTANK keine Flüssigkeit vorhanden ist, laufen /);
  assert.match(de, /nicht\. Das verhindert den Trockenlauf/);
  assert.equal(run(drawing, 'de').safety[0].fn, 'Trockenlaufschutz');
});

test('üç dilde tüm metin anahtarları aynı', () => {
  const keys = (o) => Object.keys(o).sort();
  for (const group of ['titles', 'intros', 'columns', 'types', 'conditions', 'effects', 'reasons', 'functions', 'monitor', 'purposes', 'dryRun']) {
    assert.deepEqual(keys(Logic.TEXT.en[group]), keys(Logic.TEXT.tr[group]), `en.${group}`);
    assert.deepEqual(keys(Logic.TEXT.de[group]), keys(Logic.TEXT.tr[group]), `de.${group}`);
  }
});

test('interlock üzerinden bağlantı: aynı interlocka giren diğer sensöre geçmez', () => {
  const { drawing, s, ls, pump } = tankScene(false);
  const door = Model.addSymbol(s, 'i.field', 200, 60, { tag: 'SW18', func: 'ZS' });
  const il = Model.addSymbol(s, 'i.interlock', 120, 60);
  const sig = { kind: 'signal' };
  Model.addLine(s, { node: ls.id, port: 'U' }, { node: il.id, port: 'L' }, sig);
  Model.addLine(s, { node: door.id, port: 'L' }, { node: il.id, port: 'R' }, sig);
  Model.addLine(s, { node: il.id, port: 'D' }, { node: pump.id, port: 'M' }, sig);
  const res = run(drawing);
  const dry = res.logic.find((r) => r.fn === 'dryRun');
  const guard = res.logic.find((r) => r.fn === 'doorGuard');
  assert.ok(dry.route.includes('I') && dry.route.endsWith('PE02'), dry.route);
  assert.match(guard.text, /Kapak açıkken PE02 \(Yıkama Pompa Motoru\) çalışmaz/);
  assert.deepEqual(res.safety.map((r) => r.fn), ['Kapak / erişim güvenliği', 'Kuru çalışma koruması']);
  assert.equal(res.safety[0].no, 'GF-01');
  assert.equal(res.safety[1].no, 'GF-02');
});

test('dal: bağlantı noktasından çıkan kollar da hedeflere ulaşır', () => {
  const { drawing, s, ls, pump, heater } = tankScene(false);
  const line = Model.addLine(s, { node: ls.id, port: 'R' }, { node: pump.id, port: 'M' }, { kind: 'signal' });
  const mid = line.path[Math.floor(line.path.length / 2)];
  const junction = Model.splitLine(s, line.id, mid[0], mid[1]);
  Model.addLine(s, { node: junction.id, port: 'C' }, { node: heater.id, port: 'R' }, { kind: 'signal' });
  const rule = run(drawing).logic.find((r) => r.fn === 'dryRun');
  assert.match(rule.text, /PE02 .* ve R01 .* çalışmaz/);
});

test('yanlış hat tipi: sensör proses hattıyla bağlansa da sinyal sayılır ve uyarı verilir', () => {
  const { drawing, s, ls, pump } = tankScene(false);
  Model.addLine(s, { node: ls.id, port: 'R' }, { node: pump.id, port: 'M' }, { kind: 'process' });
  const res = run(drawing);
  assert.ok(res.logic.some((r) => r.fn === 'dryRun' && /PE02/.test(r.text)));
  assert.ok(res.hints.some((h) => h.code === 'line-kind'));
  assert.ok(!res.logic.some((r) => r.group === 'flow' && r.route.includes('LS01')), 'akış olarak yazılmamalı');
});

test('dolum vanası: alt seviyede açılır, üst seviyede kapanır, taşma koruması tanınır', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const tank = Model.addSymbol(s, 'e.tank', 200, 180, { w: 80, h: 50, note: 'T1' });
  const inlet = Model.addSymbol(s, 'l.inlet', 60, 100, { note: 'ŞEBEKE SUYU' });
  const valve = Model.addSymbol(s, 'v.solenoid', 120, 100, { tag: 'SWB46' });
  Model.addLine(s, { node: inlet.id, port: 'R' }, { node: valve.id, port: 'L' }, { kind: 'utility' });
  Model.addLine(s, { node: valve.id, port: 'R' }, { node: tank.id, side: 'T', t: 0.5 }, { kind: 'utility' });
  const low = Model.addSymbol(s, 'i.field', 80, 60, { tag: 'LS01', func: 'LSL' });
  const high = Model.addSymbol(s, 'i.field', 160, 60, { tag: 'LS03', func: 'LSH' });
  Model.addLine(s, { node: low.id, port: 'D' }, { node: valve.id, port: 'A' }, { kind: 'signal' });
  Model.addLine(s, { node: high.id, port: 'D' }, { node: valve.id, port: 'A' }, { kind: 'signal' });
  const res = run(drawing);
  assert.ok(res.logic.some((r) => /açılır\. Tanka su alınır\./.test(r.text)), 'dolum');
  const over = res.logic.find((r) => r.fn === 'overflow');
  assert.match(over.text, /kapanır\. Tankın taşması önlenir\./);
  assert.deepEqual(res.safety.map((r) => r.fn), ['Taşma koruması']);
  const flow = res.logic.find((r) => r.group === 'flow');
  assert.equal(flow.route, 'ŞEBEKE SUYU → SWB46 → T1');
  assert.match(flow.text, /SWB46 .* açıkken su ŞEBEKE SUYU → T1 yönünde akar/);
});

test('güvenlik sensörleri tanınır; konum sensörü pistona bağlıysa güvenlik değil geri bildirimdir', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const gear = Model.addSymbol(s, 'd.gearmotor', 150, 60, { tag: 'GE01' });
  const cyl = Model.addSymbol(s, 'n.cylinder', 150, 120);
  const estop = Model.addSymbol(s, 's.estop', 60, 60, { tag: 'B05' });
  const hand = Model.addSymbol(s, 's.hand', 60, 120, { tag: 'SS01' });
  const pos = Model.addSymbol(s, 'i.field', 220, 120, { tag: 'PPS31', func: 'ZSO' });
  const sig = { kind: 'signal' };
  Model.addLine(s, { node: estop.id, port: 'R' }, { node: gear.id, port: 'L' }, sig);
  Model.addLine(s, { node: hand.id, port: 'R' }, { node: cyl.id, port: 'R' }, sig);
  Model.addLine(s, { node: pos.id, port: 'L' }, { node: cyl.id, port: 'S1' }, sig);
  const res = run(drawing);
  assert.deepEqual(res.safety.map((r) => r.fn), ['Acil durdurma', 'El koruma (ezilme önleme)']);
  assert.ok(res.logic.some((r) => r.group === 'feedback' && /PPS31 .*konumunu bildirir/.test(r.text)));
  assert.match(res.safety[0].logic, /Acil stop basıldığında GE01 .* durur\. Makine güvenli duruma geçer\./);
});

test('bağlantısız güvenlik sensörü: tabloda katalog metniyle görünür, uyarı verir', () => {
  const { drawing } = tankScene(false);
  const res = run(drawing);
  const row = res.safety.find((r) => r.fn === 'Kuru çalışma koruması');
  assert.equal(row.connected, false);
  assert.equal(row.logic, 'Susuz çalışmayı engeller.');
  assert.deepEqual(row.affected, ['Proses Pompaları (PE), Isıtıcılar (R01-R05)']);
  assert.ok(res.hints.some((h) => h.code === 'safety-unconnected'));
});

test('eksik koruma: tanktaki rezistans alt seviyeye bağlı değilse uyarır', () => {
  const { drawing, s, ls, pump } = tankScene(false);
  Model.addLine(s, { node: ls.id, port: 'R' }, { node: pump.id, port: 'M' }, { kind: 'signal' });
  const res = run(drawing);
  const gap = res.hints.find((h) => h.code === 'safety-gap');
  assert.match(gap.msg, /R01: 1\. PROSES TANKI içinde/);
});

test('kullanıcının çizimi: 1. tank sensörü 2. tank rezistansına bağlıysa uyarır; tanksız rezistans da korunmalı', () => {
  const catalog = new Map(CATALOG);
  catalog.set('R07', { name: '2. Proses Tankı 2. Rezistans', en: 'x', de: 'x', description: '' });
  catalog.set('R06', { name: '2. Proses Tankı 1. Rezistans', en: 'x', de: 'x', description: '' });
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const ls = Model.addSymbol(s, 'i.field', 145, 105, { tag: 'LS01', func: 'LSL' });
  const r1 = Model.addSymbol(s, 'h.resistance', 95, 105, { tag: 'R01' });
  const r7 = Model.addSymbol(s, 'h.resistance', 98, 130, { tag: 'R07' });
  Model.addSymbol(s, 'h.resistance', 95, 155, { tag: 'R06' });
  Model.addLine(s, { node: ls.id, port: 'L' }, { node: r1.id, port: 'R' }, { kind: 'process' });
  Model.addLine(s, { node: ls.id, port: 'R' }, { node: r7.id, port: 'R' }, { kind: 'process' });
  const res = Logic.analyze(drawing, { catalog, safety: SAFETY, lang: 'tr' });
  const rule = res.logic.find((r) => r.fn === 'dryRun');
  assert.match(rule.text, /^Tankta su yokken R01 .* ve R07 .* çalışmaz\. Rezistansın susuz yanması önlenir\.$/);
  assert.ok(res.hints.some((h) => h.code === 'tank-mismatch' && /LS01 1\. proses tankının sensörü, ama R07 2\. proses tankına ait/.test(h.msg)));
  assert.ok(!res.hints.some((h) => h.code === 'tank-mismatch' && /R01/.test(h.msg)));
  assert.ok(res.hints.some((h) => h.code === 'safety-gap' && /^R06: alt seviye korumasına bağlı değil/.test(h.msg)));
  assert.equal(res.hints.filter((h) => h.code === 'line-kind').length, 2);
});

test('emniyet vanası sensörsüz güvenlik fonksiyonudur', () => {
  const drawing = Model.createDrawing('Test');
  Model.addSymbol(drawing.sheets[0], 'v.safety', 100, 100, { tag: 'V99' });
  const res = run(drawing);
  assert.equal(res.safety[0].fn, 'Aşırı basınç koruması (mekanik)');
});

test('bileşen listesi: koda göre sıralı, açıklama dile göre, kodsuzlar gruplanır', () => {
  const { drawing, s } = tankScene();
  Model.addSymbol(s, 'v.ball', 10, 10);
  Model.addSymbol(s, 'v.ball', 20, 10);
  const res = run(drawing);
  const tags = res.components.filter((c) => c.tag).map((c) => c.tag);
  assert.deepEqual(tags, ['LS01', 'PE02', 'R01']);
  const ls = res.components.find((c) => c.tag === 'LS01');
  assert.equal(ls.purpose, 'Seviyeyi izler.');
  assert.ok(ls.links.includes('PE02') && ls.links.includes('R01') && ls.links.includes('1. PROSES TANKI'));
  assert.equal(run(drawing, 'en').components.find((c) => c.tag === 'LS01').purpose, 'Monitors the level.');
  const ball = res.components.find((c) => c.symbol === 'v.ball');
  assert.equal(ball.qty, 2);
  assert.equal(ball.tag, '');
  assert.match(ball.purpose, /elle/);
  assert.ok(!res.components.some((c) => c.symbol === 'l.junction'));
});

test('katalogda olmayan bileşenin görevi sembolden gelir', () => {
  const drawing = Model.createDrawing('Test');
  Model.addSymbol(drawing.sheets[0], 'p.centrifugal', 100, 100, { tag: 'PE77' });
  const row = run(drawing).components[0];
  assert.equal(row.name, 'Santrifüj Pompa');
  assert.match(row.purpose, /basar/);
});

test('tüm semboller sınıflanır ve bir görev metni bulur', () => {
  for (const def of Sym.all()) {
    const info = Logic.classify({ tag: '', func: '' }, def, null);
    assert.ok(info.role, def.id);
    for (const lang of ['tr', 'en', 'de']) {
      assert.ok(Logic.TEXT[lang].purposes[info.purpose], `${def.id} → ${info.purpose} (${lang})`);
    }
  }
});

test('örnek çizim: akış, izleme ve güvenlik satırları çıkar, hata vermez', () => {
  const { drawing } = Sample.build();
  for (const lang of ['tr', 'en', 'de']) {
    const res = run(drawing, lang);
    assert.ok(res.components.length > 20);
    assert.ok(res.logic.some((r) => r.group === 'flow'));
    assert.ok(res.logic.some((r) => r.group === 'monitor'));
    assert.ok(res.logic.some((r) => r.group === 'mech'));
    for (const r of res.logic) assert.ok(r.text && !r.text.includes('undefined'), r.text);
    for (const r of res.safety) assert.ok(r.logic && !r.logic.includes('undefined'), r.logic);
  }
  const tr = run(drawing);
  assert.ok(tr.logic.some((r) => r.fn === 'dryRun' && /PE02/.test(r.text)), 'LS01 → I/L → PE02');
  assert.ok(tr.logic.some((r) => r.group === 'mech' && /GE01/.test(r.text)));
  assert.ok(tr.logic.some((r) => r.group === 'flow' && r.route.includes('EGZOZ')));
  assert.ok(tr.hints.some((h) => /R01/.test(h.msg)), 'R01 alt seviyeye bağlı değil');
});

test('akış cümlesi: pompa ve vana yoksa da büyük harfle başlar, hat başlatan pompa akışı sağlar', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const tank = Model.addSymbol(s, 'e.tank', 100, 150, { w: 80, h: 40, note: 'T1' });
  const out = Model.addSymbol(s, 'l.outlet', 250, 150, { note: 'DRENAJ' });
  Model.addLine(s, { node: tank.id, side: 'R', t: 0.5 }, { node: out.id, port: 'L' }, { kind: 'utility' });
  const a = Model.addSymbol(s, 'p.centrifugal', 100, 60, { tag: 'PE02' });
  const b = Model.addSymbol(s, 'p.centrifugal', 200, 60, { tag: 'PE04' });
  Model.addLine(s, { node: a.id, port: 'R' }, { node: b.id, port: 'L' }, { kind: 'process' });
  const rows = run(drawing).logic.filter((r) => r.group === 'flow');
  assert.ok(rows.some((r) => r.text === 'Su T1 → DRENAJ yönünde akar.'), rows.map((r) => r.text).join(' | '));
  assert.ok(rows.some((r) => /^PE02 \(Yıkama Pompa Motoru\) çalışınca proses sıvısı PE02 → PE04/.test(r.text)), rows.map((r) => r.text).join(' | '));
  assert.ok(!rows.some((r) => /PE04 \(.*çalışınca/.test(r.text)), 'hattın sonundaki pompa sürücü sayılmaz');
});

test('boş çizim ve döngülü hat hata vermez', () => {
  assert.deepEqual(run(Model.createDrawing('Boş')).logic, []);
  const drawing = Model.createDrawing('Döngü');
  const s = drawing.sheets[0];
  const a = Model.addSymbol(s, 'p.centrifugal', 100, 100, { tag: 'PE01' });
  const b = Model.addSymbol(s, 'v.ball', 200, 100, { tag: 'V01' });
  Model.addLine(s, { node: a.id, port: 'R' }, { node: b.id, port: 'L' }, { kind: 'process' });
  Model.addLine(s, { node: b.id, port: 'R' }, { node: a.id, port: 'L' }, { kind: 'process' });
  assert.doesNotThrow(() => run(drawing));
});

/* ─── Hazır su tankı grubu ─────────────────────────────── */

const Presets = require('../presets.js');

function presetScene(symbol, props) {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const tank = Model.addSymbol(s, symbol || 'e.tankPreWash', 120, 150, props);
  const result = Presets.apply(s, tank, { lang: 'tr', drawing });
  return { drawing, s, tank, result };
}

const symbolsOf = (s) => s.items.filter((it) => Model.isSymbol(it) && it.symbol !== 'l.junction');
const byTag = (s, tag) => s.items.find((it) => it.tag === tag);

test('su tankları tank kategorisinin en üstünde ve kataloğun tank numarasını taşır', () => {
  const vessels = Sym.list().filter((d) => d.cat === 'vessel').map((d) => d.id);
  assert.deepEqual(vessels.slice(0, 4), ['e.tankPreWash', 'e.tankWash', 'e.tankPreRinse', 'e.tankRinse']);
  assert.deepEqual(Presets.codesFor(2), { pump: 'PE02', fill: 'V21', low: 'LS04', high: 'LS06', heaters: ['R06', 'R07', 'R08'] });
  assert.equal(Presets.has('e.tankRinse'), true);
  assert.equal(Presets.has('e.tank'), false);
});

test('ön yıkama tankı bırakılınca sensörler duvarda, rezistanslar tabanda, pompa grubu tankın altında gelir', () => {
  const { s, tank, result } = presetScene();
  assert.equal(tank.note, 'ÖN YIKAMA TANKI');
  const tags = symbolsOf(s).map((it) => it.tag).filter(Boolean).sort();
  assert.deepEqual(tags, ['LS01', 'LS03', 'PE01', 'R01', 'R02', 'R03', 'V20']);
  assert.ok(symbolsOf(s).some((it) => it.symbol === 'v.ball'));
  assert.ok(!symbolsOf(s).some((it) => it.symbol === 'l.outlet'), 'hücreye çıkışı olmamalı');
  assert.deepEqual(result.skippedTags, []);
  const box = Model.boxOf(tank);
  // Seviye sensörleri sol duvarın dışında, üst seviye alt seviyenin üstünde
  for (const tag of ['LS01', 'LS03']) assert.ok(Model.boxOf(byTag(s, tag))[2] < box[0], tag);
  assert.ok(byTag(s, 'LS03').y < byTag(s, 'LS01').y);
  // Rezistanslar tabanda yan yana
  const heaters = ['R01', 'R02', 'R03'].map((tag) => byTag(s, tag));
  assert.ok(heaters.every((h) => h.y === heaters[0].y && h.y > tank.y && h.x > box[0] && h.x < box[2]));
  assert.ok(heaters[0].x < heaters[1].x && heaters[1].x < heaters[2].x);
  // Vana ve pompa tankın altında, aynı hizada; pompanın basma ucu boşta
  const pump = byTag(s, 'PE01');
  const valve = symbolsOf(s).find((it) => it.symbol === 'v.ball');
  assert.ok(Model.boxOf(pump)[1] > box[3] && valve.y === pump.y && valve.x < pump.x);
  assert.ok(!s.items.some((it) => Model.isLine(it) && it.from.node === pump.id && it.from.port === 'R'));
  for (const line of s.items.filter(Model.isLine)) assert.ok(line.path && line.path.length >= 2, line.id);
});

test('hazır grubun açıklaması: alt seviye pompayı ve rezistansları kilitler, sensörler tankı izler', () => {
  const { drawing } = presetScene();
  const data = run(drawing);
  const interlock = data.logic.find((r) => r.group === 'interlock' && r.route.startsWith('LS01'));
  assert.ok(interlock, 'alt seviye kilitlemesi yok');
  assert.match(interlock.text, /ÖN YIKAMA TANKI içinde su yokken/);
  for (const tag of ['PE01', 'R01', 'R02', 'R03']) assert.ok(interlock.route.includes(tag), tag);
  assert.ok(data.logic.some((r) => r.group === 'monitor' && r.route === 'LS03 → ÖN YIKAMA TANKI'));
  assert.ok(data.logic.some((r) => r.group === 'monitor' && r.route === 'LS01 → ÖN YIKAMA TANKI'));
  const flow = data.logic.find((r) => r.group === 'flow' && r.route.includes('PE01'));
  assert.ok(flow && /^ÖN YIKAMA TANKI → .*PE01$/.test(flow.route), flow && flow.route);
  // Dolum: şebeke suyu vanadan tanka girer, üst seviyede vana kapanır
  assert.ok(data.logic.some((r) => r.group === 'flow' && r.route === 'ŞEBEKE SUYU → V20 → ÖN YIKAMA TANKI'));
  const overflow = data.logic.find((r) => r.route === 'LS03 → V20');
  assert.ok(overflow, 'üst seviye dolum vanasını kapatmıyor');
  assert.match(overflow.text, /seviye üst sınıra ulaştığında V20 .*kapan/);
  assert.ok(data.safety.some((r) => r.fnKey === 'overflow' && r.connected));
  assert.ok(data.safety.some((r) => r.fnKey === 'dryRun' && r.connected));
  assert.ok(!data.hints.some((h) => h.code === 'tank-mismatch'));
  // Aynı sinyal hattına bağlı rezistanslar birbirinin bağlantısı sayılmaz
  const links = (tag) => data.components.find((c) => c.tag === tag).links;
  assert.deepEqual(links('R02'), ['LS01']);
  assert.deepEqual(links('PE01'), ['Küresel Vana', 'LS01']);
});

test('hazır gruptan parça silinince hatları da gider, boşta hat kalmaz ve açıklama güncellenir', () => {
  const dangling = (s) => s.items.some((it) => Model.isLine(it) && it.kind === 'signal' && (!it.from.node || !it.to.node));
  const interlockOf = (drawing) => run(drawing).logic.find((r) => r.group === 'interlock' && r.route.startsWith('LS01'));
  for (const tag of ['R01', 'R02', 'R03']) {
    const { drawing, s } = presetScene();
    Model.removeItems(s, [byTag(s, tag).id]);
    assert.ok(!dangling(s), `${tag} silinince boşta hat kaldı`);
    const route = interlockOf(drawing).route;
    assert.ok(!route.includes(tag), route);
    for (const other of ['R01', 'R02', 'R03', 'PE01'].filter((x) => x !== tag)) assert.ok(route.includes(other), `${tag}: ${route}`);
  }
  // İki rezistans silinince kalan tek rezistans yine kilitli
  {
    const { drawing, s } = presetScene();
    Model.removeItems(s, [byTag(s, 'R02').id]);
    Model.removeItems(s, [byTag(s, 'R03').id]);
    assert.ok(!dangling(s));
    assert.match(interlockOf(drawing).route, /R01/);
  }
  // Alt seviye silinince rezistansları birbirine bağlayan hat kalmaz
  {
    const { s } = presetScene();
    Model.removeItems(s, [byTag(s, 'LS01').id]);
    const heaterIds = new Set(['R01', 'R02', 'R03'].map((tag) => byTag(s, tag).id));
    assert.ok(!s.items.some((it) => Model.isLine(it) && (heaterIds.has(it.from.node) || heaterIds.has(it.to.node))));
    assert.ok(!s.items.some((it) => it.symbol === 'l.junction'));
    assert.ok(!dangling(s));
  }
  // Pompa silinince sinyal hattı gider
  {
    const { s } = presetScene();
    Model.removeItems(s, [byTag(s, 'PE01').id]);
    assert.ok(!dangling(s));
  }
});

test('her su tankı çizimde bir kez bulunur; kod başka yerde kullanılmışsa boş kalır', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  assert.equal(Presets.placedIn(drawing, 'e.tankWash'), false);
  Model.addSymbol(s, 'i.field', 300, 60, { tag: 'LS04', func: 'LSL' });
  const tank = Model.addSymbol(s, 'e.tankWash', 150, 120);
  const res = Presets.apply(s, tank, { lang: 'en', drawing });
  assert.equal(tank.note, 'WASH TANK');
  assert.deepEqual(res.skippedTags, ['LS04']);
  assert.ok(byTag(s, 'V21'));
  assert.ok(byTag(s, 'PE02') && byTag(s, 'R06'));
  assert.equal(Presets.placedIn(drawing, 'e.tankWash'), true);
  assert.deepEqual([...Presets.usedPresets(drawing)], ['e.tankWash']);
});

/* ─── Kod listesindeki bileşen türleri ve belge dili ───── */

test('kod listesindeki her seri gerçek bir sembole ve anlamlı bir role oturur', () => {
  const codes = require('../../../../ML/kayitlar/kodlar.json').kodlar;
  for (const { kod, aciklama } of codes) {
    const s = Sym.suggest(kod, aciklama);
    const def = Sym.get(s.symbol);
    assert.ok(def, `${kod}: ${s.symbol}`);
    const info = Logic.classify({ tag: kod, func: s.func || def.defaultFunc || '' }, def, { name: aciklama });
    assert.notEqual(info.kind, 'generic', `${kod} ${aciklama}`);
  }
});

test('koda bağlanmadan konan tür kutuları da doğru tanınır', () => {
  const kindOf = (id) => {
    const def = Sym.get(id);
    const info = Logic.classify({ func: def.defaultFunc || '' }, def, null);
    return [info.role, info.kind, info.sub].filter(Boolean).join('/');
  };
  assert.equal(kindOf('i.lsl'), 'sensor/level/low');
  assert.equal(kindOf('i.lsh'), 'sensor/level/high');
  assert.equal(kindOf('i.vacuum'), 'sensor/pressure/vacuum');
  assert.equal(kindOf('i.airPressure'), 'sensor/pressure/air');
  assert.equal(kindOf('i.waterPressure'), 'sensor/pressure/water');
  assert.equal(kindOf('i.lid'), 'sensor/door');
  assert.equal(kindOf('i.zsc'), 'sensor/position');
  assert.equal(kindOf('i.ph'), 'sensor/analytic');
  assert.equal(kindOf('i.flow'), 'sensor/flow');
  assert.equal(kindOf('i.button'), 'sensor/button');
  assert.equal(kindOf('i.lamp'), 'display/lamp');
  assert.equal(kindOf('e.thermal'), 'sensor/overload');
  assert.equal(kindOf('e.fuse'), 'sensor/electric');
  assert.equal(kindOf('h.transducer'), 'actuator/ultrasonic');
  assert.equal(Sym.get('i.ph').defaultNote, 'pH');
});

test('alt seviye sensörü ultrasonik transdüseri de kilitler', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const tank = Model.addSymbol(s, 'e.tank', 100, 150, { w: 80, h: 60, note: '1. PROSES TANKI' });
  const ls = Model.addSymbol(s, 'i.lsl', 60, 90);
  const td = Model.addSymbol(s, 'h.transducer', 100, 172);
  Model.addLine(s, { node: ls.id, port: 'D' }, { node: tank.id, side: 'T', t: 0.1 }, { kind: 'signal' });
  Model.addLine(s, { node: ls.id, port: 'R' }, { node: td.id, port: 'L' }, { kind: 'signal' });
  const row = run(drawing).logic.find((r) => r.group === 'interlock');
  assert.match(row.text, /Ultrasonik Transdüser/);
  assert.match(row.text, /çalışmaz/);
});

test('varsayılan adlar belge dilinde yazılır, kullanıcının adı değişmez', () => {
  assert.equal(Sym.localNote('1. PROSES TANKI', 'en'), '1. PROCESS TANK');
  assert.equal(Sym.localNote('ÖN YIKAMA TANKI', 'de'), 'VORWASCHTANK');
  assert.equal(Sym.localNote('WASH TANK', 'tr'), 'YIKAMA TANKI');
  assert.equal(Sym.localNote('DRENAJ', 'en'), 'DRAIN');
  assert.equal(Sym.localNote('P&ID Şeması', 'en'), 'P&ID Diagram');
  assert.equal(Sym.localNote('SAYFA 2', 'de'), 'BLATT 2');
  assert.equal(Sym.localNote('Müşteri Özel Tankı', 'en'), 'Müşteri Özel Tankı');
  const { drawing } = presetScene();
  const flow = run(drawing, 'en').logic.find((r) => r.group === 'flow' && r.route.includes('PE01'));
  assert.match(flow.route, /^PRE-WASH TANK → Ball Valve → PE01$/);
});

/* ─── Hazır hücre grubu ────────────────────────────────── */

test('yıkama hücresi bırakılınca sprey, sepet, redüktör, kapak switchi ve el koruma gelir', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const cell = Model.addSymbol(s, 'e.cabin', 200, 110);
  const res = Presets.apply(s, cell, { lang: 'tr', drawing });
  assert.deepEqual(res.skippedTags, []);
  const ids = symbolsOf(s).map((it) => it.symbol).sort();
  assert.deepEqual(ids, ['d.gearmotor', 'e.basket', 'e.cabin', 'e.spray', 'i.lid', 's.hand']);
  assert.ok(byTag(s, 'GE01') && byTag(s, 'SW18') && byTag(s, 'SS01'));
  assert.equal(Presets.isSingle('e.cabin'), false);
  assert.equal(Presets.isSingle('e.tankWash'), true);
  const data = run(drawing);
  assert.ok(data.logic.some((r) => r.group === 'monitor' && r.route === 'SW18 → YIKAMA HÜCRESİ'));
  assert.ok(data.logic.some((r) => r.group === 'mech' && r.route.includes('GE01')));
});

test('hücre kapak switchi tank pompalarını kilitler; tank önce ya da sonra konabilir', () => {
  for (const order of ['tankFirst', 'cellFirst']) {
    const drawing = Model.createDrawing('Test');
    const s = drawing.sheets[0];
    const place = (symbol, x, y) => {
      const node = Model.addSymbol(s, symbol, x, y);
      Presets.apply(s, node, { lang: 'tr', drawing });
      return node;
    };
    if (order === 'tankFirst') {
      place('e.tankPreWash', 110, 190);
      place('e.cabin', 290, 90);
    } else {
      place('e.cabin', 290, 90);
      place('e.tankPreWash', 110, 190);
    }
    place('e.tankWash', 290, 210);
    const data = run(drawing);
    const guard = data.logic.find((r) => r.fn === 'doorGuard' && r.route.startsWith('SW18'));
    assert.ok(guard, `${order}: kapak kilitlemesi yok`);
    assert.ok(guard.route.includes('PE01') && guard.route.includes('PE02'), guard.route);
    assert.match(guard.text, /kapağı açıkken|açıkken/);
    // El koruma sensörü kapak switchi üzerinden pompaları durdurur
    assert.ok(data.logic.some((r) => r.route.startsWith('SS01') && r.route.includes('PE01')), order);
  }
});

test('kapak switchi silinince ona bağlı hatlar da gider', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const tank = Model.addSymbol(s, 'e.tankPreWash', 110, 190);
  Presets.apply(s, tank, { drawing });
  const cell = Model.addSymbol(s, 'e.cabin', 290, 90);
  Presets.apply(s, cell, { drawing });
  Model.removeItems(s, [byTag(s, 'SW18').id]);
  assert.ok(!s.items.some((it) => Model.isLine(it) && it.kind === 'signal' && (!it.from.node || !it.to.node)));
});

/* ─── Makine kaydından taslak ──────────────────────────── */

test('taslak: makine kaydındaki her kod çizime girer, kayıtta olmayan grup parçası çıkarılır', () => {
  for (const file of ['0326053', '0426052', '0326056', '1726050']) {
    const machine = require(`../../../../ML/kayitlar/${file}.json`);
    const drawing = Model.createDrawing('Test');
    const res = Presets.buildDraft(drawing, machine.kodlar, { lang: 'tr' });
    const tags = [...Model.usedTags(drawing).keys()];
    assert.deepEqual(machine.kodlar.filter((c) => !tags.includes(c)), [], `${file}: eksik kod`);
    assert.deepEqual(tags.filter((t) => !machine.kodlar.includes(t)), [], `${file}: fazla kod`);
    const sheet = drawing.sheets[res.sheetIndex];
    assert.ok(!sheet.items.some((it) => Model.isLine(it) && (!it.from.node || !it.to.node)), `${file}: boşta hat`);
    assert.equal(res.cell, true);
    // Sembollerin hepsi çizim alanında, antet bloğunun üstünde
    const g = Model.geometry(sheet);
    for (const it of sheet.items.filter(Model.isSymbol)) {
      const b = Model.boxOf(it);
      assert.ok(b[0] >= g.inner.x0 && b[2] <= g.inner.x1 && b[1] >= g.inner.y0 && b[3] <= g.title.y, `${file}: ${it.symbol} ${it.tag} alan dışında`);
    }
  }
});

test('taslak: 0326053 kaydında 2. ve 3. tank kurulur, kilitlemeler yazılır, PE04 dizilir', () => {
  const machine = require('../../../../ML/kayitlar/0326053.json');
  const drawing = Model.createDrawing('Test');
  const res = Presets.buildDraft(drawing, machine.kodlar, { lang: 'tr' });
  assert.equal(res.tanks, 2);
  assert.ok(Presets.placedIn(drawing, 'e.tankWash') && Presets.placedIn(drawing, 'e.tankPreRinse'));
  assert.ok(res.parked.includes('PE04'));
  assert.ok(res.notInMachine.includes('PE03'));
  const interlocks = run(drawing).logic.filter((r) => r.group === 'interlock').map((r) => r.route);
  assert.ok(interlocks.some((r) => r.startsWith('LS04') && r.includes('PE02') && r.includes('R06')));
  assert.ok(interlocks.some((r) => r.startsWith('SW18') && r.includes('PE02')));
});

test('taslak: dolu çizimde yeni sayfaya kurulur, çizimde olan kod ve tank tekrar konmaz', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const tank = Model.addSymbol(s, 'e.tankWash', 120, 150);
  Presets.apply(s, tank, { drawing });
  Model.addSymbol(s, 'f.fan', 300, 60, { tag: 'FE01' });
  const res = Presets.buildDraft(drawing, ['LS04', 'R06', 'PE02', 'FE01', 'FE02'], { lang: 'tr' });
  assert.equal(res.sheetIndex, 1);
  assert.equal(res.tanks, 0);
  assert.deepEqual(res.parked, ['FE02']);
  const tags = [...Model.usedTags(drawing).entries()];
  assert.ok(tags.every(([, uses]) => uses.length === 1), 'kod iki kez kullanıldı');
});

test('dolum solenoid valfi: alt seviyede açılır, üst seviyede kapanır, bağlantı yönünden bağımsız', () => {
  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const tank = Model.addSymbol(s, 'e.tank', 150, 150, { w: 80, h: 60, note: '1. PROSES TANKI' });
  // Hat bilerek tanktan vanaya çizildi; vana yine de dolum sayılmalı
  const fill = Model.addSymbol(s, 'v.solenoidFill', 150, 90, { tag: 'SWB46' });
  Model.addLine(s, { node: tank.id, side: 'T', t: 0.5 }, { node: fill.id, port: 'L' }, { kind: 'utility' });
  const low = Model.addSymbol(s, 'i.lsl', 60, 140);
  const high = Model.addSymbol(s, 'i.lsh', 60, 110);
  const sig = { kind: 'signal' };
  Model.addLine(s, { node: low.id, port: 'R' }, { node: tank.id, side: 'L', t: 0.6 }, sig);
  Model.addLine(s, { node: high.id, port: 'R' }, { node: tank.id, side: 'L', t: 0.2 }, sig);
  Model.addLine(s, { node: low.id, port: 'U' }, { node: fill.id, port: 'A' }, sig);
  Model.addLine(s, { node: high.id, port: 'U' }, { node: fill.id, port: 'A' }, sig);
  const rows = run(drawing).logic;
  const open = rows.find((r) => r.route.endsWith('SWB46') && /açıl/.test(r.text));
  const close = rows.find((r) => r.route.endsWith('SWB46') && /kapan/.test(r.text));
  assert.ok(open, 'alt seviyede açılma yok');
  assert.ok(close, 'üst seviyede kapanma yok');
  assert.ok(Sym.list().some((d) => d.id === 'v.solenoidFill' && d.cat === 'valve'));
});

test('pistonlar eyleyici, piston sensörleri konum sensörüdür; pistona bağlı sensör geri bildirim verir', () => {
  const kindOf = (id) => {
    const def = Sym.get(id);
    const c = Logic.classify({ tag: '', func: def.defaultFunc || '' }, def, null);
    return `${c.role}/${c.kind}`;
  };
  for (const id of ['n.cylinder', 'n.cylinderSet', 'n.cylinderSpring', 'n.cylinderRod', 'n.cylinderLift']) {
    assert.equal(kindOf(id), 'actuator/cylinder', id);
  }
  for (const id of ['i.pistonSensor', 'i.zso', 'i.zsm', 'i.zsc']) {
    assert.equal(kindOf(id), 'sensor/position', id);
  }

  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const cyl = Model.addSymbol(s, 'n.cylinderLift', 150, 120, { tag: 'CYL1' });
  const mid = Model.addSymbol(s, 'i.zsm', 150, 90, { tag: 'PPS14', func: 'ZSM' });
  Model.addLine(s, { node: mid.id, port: 'D' }, { node: cyl.id, port: 'S2' }, { kind: 'signal' });
  const res = run(drawing);
  assert.ok(res.logic.some((r) => r.group === 'feedback' && /PPS14 .*konumunu bildirir/.test(r.text)));
  assert.equal(res.safety.length, 0);
});

test('giriş su ve hava sensörü: PS06 su basıncı, PS07 hava basıncı olarak yorumlanır', () => {
  const entry = (name) => ({ name, description: '' });
  const water = Logic.classify({ tag: 'PS06', func: 'PT' }, Sym.get('i.waterPressure'), entry('Giriş Su Basınç Sensörü ( 4-20 mA)'));
  const air = Logic.classify({ tag: 'PS07', func: 'PT' }, Sym.get('i.airPressure'), entry('Giriş Hava Basınç Sensörü ( 4-20 mA)'));
  assert.deepEqual([water.kind, water.sub], ['pressure', 'water']);
  assert.deepEqual([air.kind, air.sub], ['pressure', 'air']);
  // Kod boşken de sembolün adı yeterli
  assert.equal(Logic.classify({ tag: '', func: 'PT' }, Sym.get('i.waterPressure'), null).sub, 'water');
  assert.equal(Logic.classify({ tag: '', func: 'PT' }, Sym.get('i.airPressure'), null).sub, 'air');
});

test('temel şekiller ve ISA piston sensörleri: şekil bileşen sayılmaz, ISA dairesi konum sensörüdür', () => {
  const shapes = Sym.list().filter((d) => d.cat === 'shape').map((d) => d.id);
  for (const id of ['g.rect', 'g.square', 'g.triangle', 'g.circle', 'g.ellipse', 'g.diamond']) {
    assert.ok(shapes.includes(id), `${id} şekil kategorisinde olmalı`);
    assert.ok(Sym.get(id).resizable && Sym.get(id).decor, id);
  }
  const drawing = Model.createDrawing('Test');
  const sheet = drawing.sheets[0];
  Model.addSymbol(sheet, 'g.rect', 100, 100, { note: 'NOT' });
  Model.addSymbol(sheet, 'g.circle', 150, 100);
  for (const [id, func] of [['i.zsIsa', 'ZS'], ['i.zsoIsa', 'ZSO'], ['i.zsmIsa', 'ZSM'], ['i.zscIsa', 'ZSC']]) {
    const def = Sym.get(id);
    assert.equal(def.cat, 'piston');
    assert.equal(def.defaultFunc, func);
    assert.deepEqual(Sym.resolveBody(def, {}), Sym.resolveBody(Sym.get('i.field'), {}), `${id} ISA dairesi olmalı`);
    assert.ok(Sym.seriesOf(id).includes('PPS'));
  }
  const zso = Model.addSymbol(sheet, 'i.zsoIsa', 200, 100, { tag: 'PPS01' });
  assert.equal(zso.func, 'ZSO');
  assert.equal(Logic.classify(zso, Sym.get('i.zsoIsa'), null).kind, 'position');
  const res = run(drawing);
  assert.deepEqual(res.components.map((c) => c.symbol), ['i.zsoIsa']);
});

test('pistonlu tahliye vanası: hatta oturur, eyleyici vanadır, konum sensörü geri bildirim verir', () => {
  const def = Sym.get('v.pistonValve');
  assert.equal(def.cat, 'valve');
  assert.ok(def.inline);
  assert.ok(['L', 'R', 'A', 'S1', 'S2'].every((p) => def.ports.some((x) => x.id === p)));
  assert.ok(Sym.seriesOf('v.pistonValve').includes('V'));
  assert.equal(Logic.classify({ tag: '', func: '' }, def, null).kind, 'valve');

  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const valve = Model.addSymbol(s, 'v.pistonValve', 150, 120, { tag: 'V09' });
  const zso = Model.addSymbol(s, 'i.zsoIsa', 130, 100, { tag: 'PPS11' });
  Model.addLine(s, { node: zso.id, port: 'D' }, { node: valve.id, port: 'S1' }, { kind: 'signal' });
  const res = run(drawing);
  assert.ok(res.components.some((c) => c.symbol === 'v.pistonValve'));
  assert.ok(res.logic.some((r) => /PPS11/.test(r.text)), JSON.stringify(res.logic.map((r) => r.text)));
});

test('dozatron: hatta oturur, motorsuz pasif dozaj ünitesidir, akış cümlesinde kimyasal katar', () => {
  const def = Sym.get('p.dosatron');
  assert.equal(def.cat, 'pump');
  assert.ok(def.inline && !def.ports.some((p) => p.id === 'M'), 'motor bağlantısı olmamalı');
  assert.ok(def.ports.some((p) => p.id === 'D'), 'kimyasal emiş ucu olmalı');
  assert.equal(Sym.suggest('PE20', 'Dozatron').symbol, 'p.dosatron');
  assert.equal(Sym.suggest('XY01', 'Hat Dozatronu').symbol, 'p.dosatron');
  assert.equal(Logic.classify({ tag: '', func: '' }, def, null).role, 'passive');

  const drawing = Model.createDrawing('Test');
  const s = drawing.sheets[0];
  const inlet = Model.addSymbol(s, 'l.inlet', 60, 100);
  const doser = Model.addSymbol(s, 'p.dosatron', 120, 100);
  const tank = Model.addSymbol(s, 'e.tank', 220, 100);
  Model.addLine(s, { node: inlet.id, port: 'R' }, { node: doser.id, port: 'L' }, { kind: 'utility' });
  Model.addLine(s, { node: doser.id, port: 'R' }, { node: tank.id, side: 'L', t: 0.5 }, { kind: 'utility' });
  for (const lang of ['tr', 'en', 'de']) {
    const res = run(drawing, lang);
    assert.ok(res.components.some((c) => c.symbol === 'p.dosatron' && c.purpose), lang);
  }
  const res = run(drawing);
  assert.ok(res.logic.some((r) => r.group === 'flow' && /kimyasal katar/.test(r.text)), JSON.stringify(res.logic.map((r) => r.text)));
});
