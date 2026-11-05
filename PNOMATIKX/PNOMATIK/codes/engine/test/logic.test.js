const test = require('node:test');
const assert = require('node:assert/strict');

const Model = require('../model.js');
const Logic = require('../logic.js');
const Link = require('../pidlink.js');
const Gen = require('../generator.js');
const Sample = require('../samples/ornek.js');

const catalog = new Map(Sample.CODES.map(([id, name]) => [id, { id, name, en: name, de: name }]));
const sampleDrawing = () => Sample.build().drawing;

test('bağlantı mantığı: bobin → valf → aktüatör cümleleri P&ID koduyla yazılır', () => {
  const r = Logic.analyze(sampleDrawing(), { catalog, lang: 'tr' });
  const texts = r.logic.map((x) => x.text);
  assert.ok(texts.includes('2Y1 [V31] enerjilenince 2V1 konum değiştirir; 2A1 (1. Proses Tankı Tahliye Vanası (Aç / Kapat)) açılır.'));
  assert.ok(texts.includes('2Y2 [V32] enerjilenince 2V1 konum değiştirir; 2A1 (1. Proses Tankı Tahliye Vanası (Aç / Kapat)) kapanır.'));
  assert.ok(texts.includes('2V1 çift bobinlidir; enerji kesilse de son konumunu korur.'));
  assert.ok(texts.includes('Bobin enerjisi kesilince 1V1 yay ile normal konuma döner; 1A1 kapanır.'));
  assert.ok(texts.some((t) => t.startsWith('İki bobin de enerjisizken 4V1 orta konumda portları kapatır')));
  assert.ok(texts.includes('1B1 [SWB01], 1A1 açık / kapalı konumunu bildirir.'));
  assert.ok(texts.includes('4B3 [PPS14], 4A1 ara konumunu bildirir.'));
  assert.ok(texts.includes('Basınçlı hava 0V1 → 0Z1 → 0V2 yolundan ana hatta ulaşır.'));
  assert.ok(texts.some((t) => t.startsWith('0Y1 [V47] enerjilenince 0V2 açılır')));
  assert.ok(texts.includes('0B1 [PS06], besleme hattındaki hava basıncını izler.'));
  assert.ok(texts.some((t) => t.includes('3V2 ve 3V3 ile 3A1 hızı ayarlanır')));
});

test('güvenlik fonksiyonları: ISO 4414 tahliye, basınç izleme, güvenli konum, ara konum, hız', () => {
  const r = Logic.analyze(sampleDrawing(), { catalog, lang: 'tr' });
  const keys = r.safety.map((s) => s.fnKey);
  assert.deepEqual(keys, ['dump', 'isolation', 'lowPressure', 'failSafe', 'hold', 'midStop', 'speed', 'overpressure']);
  const dump = r.safety[0];
  assert.equal(dump.no, 'GF-01');
  assert.deepEqual(dump.affected, ['1A1', '2A1', '3A1', '4A1']);
  assert.ok(dump.logic.includes('0Y1 [V47] enerjisizlenir; 0V2 kapanır'));
  const failSafe = r.safety.find((s) => s.fnKey === 'failSafe');
  assert.ok(failSafe.logic.includes('1A1 kapanır'));
});

test('kod eşleştirme: her pnömatik kodun P&ID karşılığı listelenir, farklı olanlar sayılır', () => {
  const r = Logic.analyze(sampleDrawing(), { catalog, lang: 'tr' });
  const pairs = r.mapping.map((m) => `${m.code}=${m.pid}`);
  for (const pair of ['0V2=V47', '0Y1=V47', '0B1=PS06', '1A1=V01', '1Y1=V01', '1B1=SWB01', '2V1=V31 / V32', '2Y1=V31', '2Y2=V32', '4B3=PPS14']) {
    assert.ok(pairs.includes(pair), `${pair} eşleştirmede yok`);
  }
  assert.equal(r.mapping.find((m) => m.code === '2Y1').pidName, '1. Proses Tankı Tahliye Vanası Aç Valfi');
  assert.equal(r.mappingDiffers, r.mapping.length, 'ISO kodları P&ID kodlarından farklı');
  assert.ok(r.mapping.findIndex((m) => m.code === '0V2') < r.mapping.findIndex((m) => m.code === '1A1'), 'devre sırası');
});

test('aynı kod kullanılırsa eşleştirme sayılmaz (pnömatikte P&ID kodu kullanmak)', () => {
  const d = Model.createDrawing();
  Model.addSymbol(d.sheets[0], 'k.pressureSensor', 50, 50, { tag: 'PS06', pid: 'PS06' });
  const r = Logic.analyze(d, { lang: 'tr' });
  assert.equal(r.mapping.length, 1);
  assert.equal(r.mappingDiffers, 0);
});

test('kontrol ipuçları: bağlanmamış bobin, P&ID projesinde olup şemada olmayan kod', () => {
  const plan = Link.plan([{ kod: 'PPS03', name: '1. Proses Tankı 1. Yönlendirme Pistonu Açık Sensörü' }], new Map(), {});
  const d = Gen.build(plan, { lang: 'tr' });
  const r = Logic.analyze(d, { lang: 'tr', pidCodes: ['PPS03', 'V99'] });
  const codes = r.hints.map((h) => h.code);
  assert.ok(codes.includes('coil-nopid'));
  assert.ok(r.hints.some((h) => h.code === 'pid-missing' && h.pid === 'V99'));
  assert.ok(!r.hints.some((h) => h.code === 'pid-missing' && h.pid === 'PPS03'));
  assert.ok(codes.includes('no-dump'), 'ana valfsiz beslemede ISO 4414 uyarısı');
});

test('sonradan eklenen sayfa "ŞEMA 1" bağlantısıyla ana hatta bağlanır', () => {
  const d = Sample.build().drawing;
  const extra = Link.assign({ supply: {}, circuits: Link.group([{ kod: 'V20', name: '1. Proses Tankı Oto. Dolum Aktüatör Vanası valfi' }], new Map()).circuits, excluded: [] },
    { start: Link.maxCircuit(d) + 1, manualValve: false, mainValve: false, pressureSensor: false });
  Gen.appendCircuits(d, extra.circuits, { lang: 'tr' });
  const r = Logic.analyze(d, { lang: 'tr' });
  assert.ok(!r.hints.some((h) => h.code === 'no-dump'));
  assert.ok(r.safety[0].affected.includes('5A1'), 'yeni devre de tahliye fonksiyonuna girer');
});

test('dil: İngilizce ve Almanca metinler', () => {
  const en = Logic.analyze(sampleDrawing(), { catalog, lang: 'en' });
  assert.ok(en.logic.some((x) => x.text.startsWith('When 2Y1 [V31] is energised, 2V1 switches and 2A1')));
  assert.equal(en.safety[0].fn, 'Air dump on power loss');
  assert.equal(en.text.titles.mapping, 'P&ID – Pneumatic Code Cross-Reference');
  const de = Logic.analyze(sampleDrawing(), { catalog, lang: 'de' });
  assert.ok(de.logic.some((x) => x.text.startsWith('Wird 2Y1 [V31] bestromt, schaltet 2V1')));
  assert.equal(de.text.titles.docType2, 'Erläuterungsblatt 2');
});
