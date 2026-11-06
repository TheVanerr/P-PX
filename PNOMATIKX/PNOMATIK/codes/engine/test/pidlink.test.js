const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Link = require('../pidlink.js');

/* P&ID kod listesi kopyası (PNOMATIK/data/pid-kod.csv): ilk geçen ad geçerlidir */
const NAMES = (() => {
  const text = fs.readFileSync(path.join(__dirname, '../../../data/pid-kod.csv'), 'utf8').replace(/^﻿/, '');
  const map = new Map();
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [kod, name] = line.split(';');
    if (kod && !map.has(kod.trim())) map.set(kod.trim(), (name || '').trim());
  }
  return map;
})();
const entries = (codes) => codes.map((kod) => ({ kod, name: NAMES.get(kod) || '' }));
const groupOf = (result, kod) => result.circuits.find((g) => g.codes.includes(kod));

test('pnömatikle ilgili seriler: V, PPS, SWB, SW (flow hariç), PS (yalnız hava)', () => {
  assert.ok(Link.isRelevant('V31', NAMES.get('V31')));
  assert.ok(Link.isRelevant('PPS13', NAMES.get('PPS13')));
  assert.ok(Link.isRelevant('SWB01', NAMES.get('SWB01')));
  assert.ok(!Link.isRelevant('SWB46', NAMES.get('SWB46')), 'su solenoid vanası pnömatik değil');
  assert.ok(!Link.isRelevant('SW13', NAMES.get('SW13')), 'flow switch pnömatik değil');
  assert.ok(Link.isRelevant('PS06', 'Giriş Hava Basıncı Basınç Sensörü'));
  assert.ok(!Link.isRelevant('PS01', NAMES.get('PS01')), 'pompa basıncı pnömatik değil');
  assert.ok(!Link.isRelevant('PE02', NAMES.get('PE02')));
  assert.ok(!Link.isRelevant('SW17', NAMES.get('SW17')), 'xxx yer tutucu');
  assert.ok(Link.isRelevant('PPS29', NAMES.get('PPS29')), '4. tank yönlendirme pistonu sensörü');
});

test('aç / kapat valfleri tek valfin iki bobini olur (V31 = Y1, V32 = Y2)', () => {
  const r = Link.group(entries(['V31', 'V32', 'V61', 'V62', 'V67', 'V68']), new Map());
  const drain = groupOf(r, 'V31');
  assert.deepEqual(drain.coils.map((c) => c.kod), ['V31', 'V32']);
  assert.equal(drain.valve, '52b');
  assert.match(drain.name, /Tahliye Vanası \(Aç \/ Kapat\)$/);
  const basket = groupOf(r, 'V61');
  assert.deepEqual(basket.coils.map((c) => c.kod), ['V61', 'V62']);
  assert.equal(basket.actuator, 'silindir');
  assert.deepEqual(groupOf(r, 'V67').coils.map((c) => c.kod), ['V67', 'V68']);
});

test('aktüatörlü vanalar eşlenmez; switch box aynı adlı vanaya bağlanır', () => {
  const r = Link.group(entries(['V05', 'V06', 'SWB05', 'SWB06', 'V01', 'SWB01', 'V41', 'SWB36']), new Map());
  const inflate = groupOf(r, 'V05');
  assert.deepEqual(inflate.coils.filter(Boolean).map((c) => c.kod), ['V05']);
  assert.deepEqual(inflate.sensors.map((s) => s.kod), ['SWB05']);
  assert.deepEqual(groupOf(r, 'V06').sensors.map((s) => s.kod), ['SWB06']);
  const pump = groupOf(r, 'V01');
  assert.equal(pump.actuator, 'vana');
  assert.equal(pump.valve, '52m');
  assert.equal(pump.sensors[0].role, 'SB');
  assert.equal(groupOf(r, 'V41').actuator, 'vana', 'switch box varsa aktüatörlü vana');
});

test('piston sensörleri: lift pistonu sepet valfine bağlanır, ara sensör 5/3 valf seçtirir', () => {
  const r = Link.group(entries(['V61', 'V62', 'PPS13', 'PPS14', 'PPS15', 'V48', 'V49', 'PPS01', 'PPS02', 'PPS03', 'PPS04']), new Map());
  const lift = groupOf(r, 'V61');
  assert.deepEqual(lift.sensors.map((s) => [s.kod, s.role]), [['PPS15', 'B1'], ['PPS14', 'B3'], ['PPS13', 'B2']]);
  assert.equal(lift.valve, '53c');
  const lid = groupOf(r, 'V48');
  assert.deepEqual(lid.sensors.map((s) => s.kod).sort(), ['PPS01', 'PPS02']);
  // Valfi olmayan piston sensörleri kendi devresini kurar (bobin P&ID kodu boş kalır)
  const diverter = groupOf(r, 'PPS03');
  assert.deepEqual(diverter.coils, [null, null]);
  assert.deepEqual(diverter.sensors.map((s) => s.kod).sort(), ['PPS03', 'PPS04']);
});

test('tank numarası farklıysa sensör başka devreye bağlanmaz', () => {
  assert.equal(Link.matchScore(Link.keyOf('Kapak'), Link.keyOf('1. Tank Kapağı Açık Sensörü', true)), 0);
  assert.ok(Link.matchScore(Link.keyOf('Kapak'), Link.keyOf('Ana Hücre Kapak Pistonu Açık Sensörü', true)) > 0);
  const r = Link.group(entries(['V48', 'V49', 'PPS31', 'SW09']), new Map());
  assert.ok(!groupOf(r, 'V48').codes.includes('PPS31'));
  assert.ok(r.excluded.some((e) => e.kod === 'SW09'), 'eşi olmayan switch hariç kalır');
});

test('besleme: ana valf ve hava basınç sensörü devre 0 olur', () => {
  const r = Link.plan(entries(['V47', 'V31', 'V32']).concat([{ kod: 'PS06', name: 'Giriş Hava Basıncı Basınç Sensörü' }]), new Map(), {});
  assert.equal(r.supply.manual.tag, '0V1');
  assert.equal(r.supply.frl.tag, '0Z1');
  assert.equal(r.supply.main.tag, '0V2');
  assert.deepEqual(r.supply.main.coil, { tag: '0Y1', pid: 'V47', name: 'Ana Valf' });
  assert.equal(r.supply.pressure.tag, '0B1');
  assert.equal(r.supply.pressure.pid, 'PS06');
  const c = r.circuits[0];
  assert.equal(c.nr, 1);
  assert.equal(c.actuatorTag, '1A1');
  assert.equal(c.valveTag, '1V1');
  assert.deepEqual(c.coils.map((k) => `${k.tag}=${k.pid}`), ['1Y1=V31', '1Y2=V32']);
});

test('ISO kodları: devre, harf ve numara sırası', () => {
  assert.deepEqual(Link.parseIso('12V3'), { circuit: 12, letter: 'V', number: 3 });
  assert.equal(Link.parseIso('V31'), null);
  const sorted = ['2V1', '1V1', '1B2', '1A1', '0Z1', '1Y1', '10A1', 'V31'].sort(Link.compareIso);
  assert.deepEqual(sorted, ['0Z1', '1A1', '1V1', '1Y1', '1B2', '2V1', '10A1', 'V31']);
});

test('Kod Eşleştirme listesi otomatik tahminin önüne geçer ve CSV ile gidip gelir', () => {
  const mapping = Link.parseMappingCsv('﻿KOD;DEVRE;ROL;AKTUATOR;VALF\nV43;Kapak Pistonu 1;Y1;silindir-tek;32nc\nV45;Kapak Pistonu 1;Y2;;\nPPS31;Kapak Pistonu 1;B2;;\nV47;Besleme;HARIC;;\n');
  assert.equal(mapping.size, 4);
  const r = Link.group(entries(['V43', 'V45', 'PPS31', 'V47']), mapping);
  const g = groupOf(r, 'V43');
  assert.equal(g.name, 'Kapak Pistonu 1');
  assert.deepEqual(g.coils.map((c) => c.kod), ['V43', 'V45']);
  assert.equal(g.actuator, 'silindir-tek');
  assert.equal(g.valve, '32nc');
  assert.deepEqual(g.sensors.map((s) => [s.kod, s.role]), [['PPS31', 'B2']]);
  assert.equal(r.supply.main, null, 'hariç tutulan ana valf beslemeye girmez');
  const again = Link.parseMappingCsv(Link.toMappingCsv(mapping));
  assert.deepEqual([...again.values()], [...mapping.values()].sort((a, b) => a.kod.localeCompare(b.kod, 'tr', { numeric: true })));
});

test('gerçek makine kaydı: BODYCOAT kodları beklenen devrelere ayrılır', () => {
  const codes = ['PE01', 'TC01', 'V33', 'PE02', 'TC02', 'V34', 'PE04', 'TC03', 'V35', 'V36', 'V39', 'V40', 'V47', 'V48', 'V49',
    'PPS03', 'PPS04', 'PPS05', 'PPS06', 'SWB20', 'SWB21', 'SWB22', 'PPS07', 'PPS08', 'PPS09', 'PPS10', 'V20', 'V21', 'V22', 'V31', 'V32',
    'PPS25', 'PPS26', 'PPS27'];
  const plan = Link.plan(entries(codes), new Map(), {});
  assert.equal(plan.supply.main.coil.pid, 'V47');
  assert.equal(plan.circuits.length, 14);
  const byFirst = plan.circuits.map((c) => c.coils.map((k) => k.pid).join('/'));
  assert.deepEqual(byFirst.slice(0, 8), ['V20', 'V21', 'V22', 'V31/V32', 'V33/V34', 'V35/V36', 'V39/V40', 'V48/V49']);
  assert.deepEqual(plan.circuits[0].sensors.map((s) => s.pid), ['SWB20']);
});
