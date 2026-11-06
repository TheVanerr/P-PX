const test = require('node:test');
const assert = require('node:assert/strict');

const Model = require('../model.js');
const Logic = require('../logic.js');
const Link = require('../pidlink.js');
const Gen = require('../generator.js');
const Sample = require('../samples/ornek.js');
const Checks = require('../checks.js');

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

/* Örnek şema + sonradan eklenen 2. sayfa: 5A1 havayı yalnız "ŞEMA n" sayfa bağlantısı üzerinden alır */
function twoPages() {
  const d = Sample.build().drawing;
  const extra = Link.assign({ supply: {}, circuits: Link.group([{ kod: 'V20', name: '1. Proses Tankı Oto. Dolum Aktüatör Vanası valfi' }], new Map()).circuits, excluded: [] },
    { start: Link.maxCircuit(d) + 1, manualValve: false, mainValve: false, pressureSensor: false });
  Gen.appendCircuits(d, extra.circuits, { lang: 'tr' });
  return d;
}
const offpages = (sheet) => sheet.items.filter((x) => x.symbol === 'l.offpage').map((x) => x.note);
const onMainLine = (d) => Logic.analyze(d, { lang: 'tr' }).safety[0].affected.includes('5A1');

test('sayfa sırası değişince sayfa bağlantıları aynı sayfayı gösterir, hava hattı kopmaz', () => {
  const d = twoPages();
  const [first, second] = d.sheets;
  assert.deepEqual([offpages(first), offpages(second)], [['ŞEMA 2'], ['ŞEMA 1']]);
  assert.ok(onMainLine(d));

  assert.equal(Model.moveSheet(d, 1, -1), 0);
  assert.equal(d.sheets[0], second);
  assert.deepEqual([offpages(first), offpages(second)], [['ŞEMA 1'], ['ŞEMA 2']], 'numaralar yeni sıraya uyar');
  assert.ok(onMainLine(d), 'sıralama sonrası 5A1 ana hatta bağlı kalmalı');
});

test('sayfa çoğaltılınca arkadaki sayfaların numarası kayar, bağlantılar bozulmaz', () => {
  const d = twoPages();
  const [first, second] = d.sheets;
  const copy = Model.duplicateSheet(d, 0);
  assert.deepEqual(d.sheets, [first, copy, second]);
  assert.deepEqual(offpages(first), ['ŞEMA 3'], 'asıl sayfa kaymış 2. sayfayı gösterir');
  assert.deepEqual(offpages(copy), ['ŞEMA 3'], 'kopya da aynı sayfayı gösterir');
  assert.deepEqual(offpages(second), ['ŞEMA 1']);
  assert.ok(onMainLine(d));
});

test('hedef sayfası silinen bağlantı başka sayfaya bağlanmaz, Kontrol uyarır', () => {
  const d = twoPages();
  const second = d.sheets[1];
  // Üçüncü sayfa, 1. sayfa silinince onun numarasını devralacak: yanlışlıkla ona bağlanmamalı
  const third = Model.createSheet('Üç');
  d.sheets.push(third);
  Model.addSymbol(third, 'l.offpage', 30, 30, { note: 'ŞEMA 2' });
  assert.equal(d.sheets[Model.removeSheet(d, 0, 1)], second, 'açık sayfada kalınır');
  assert.deepEqual(offpages(second), ['ŞEMA ?']);
  assert.deepEqual(offpages(third), ['ŞEMA 1'], 'var olan sayfaya giden bağlantı yeni numarayı alır');
  assert.ok(Checks.run(d, new Map(), [], null).some((x) => x.code === 'offpage-target' && x.sheetId === second.id));
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

/* ─── Hazır setler: PNO(SMC), PNO(AIR) ───────────────────── */

test('hazır setler: tek grup, yeni kimlik, kopuk hat yok, semboller tanımlı', () => {
  const Sets = require('../sets.js');
  const Model = require('../model.js');
  const Sym = require('../symbols.js');
  assert.deepEqual(Sets.list().map((s) => s.name), ['PNO(SMC)', 'PNO(AIR)']);
  for (const { id } of Sets.list()) {
    const set = Sets.get(id);
    for (const it of set.items) if (it.type === 'symbol') assert.ok(Sym.get(it.symbol), `${id}: ${it.symbol}`);
    const drawing = Model.createDrawing('T');
    const sheet = drawing.sheets[0];
    const first = Sets.insert(sheet, id);
    const second = Sets.insert(sheet, id, 0, 0);
    assert.equal(first.length, set.items.length);
    const ids = new Set(sheet.items.map((it) => it.id));
    assert.equal(ids.size, sheet.items.length, 'iki kez konsa da kimlikler tekil');
    for (const l of sheet.items.filter((it) => it.type === 'line')) {
      for (const end of ['from', 'to']) if (l[end].node) assert.ok(ids.has(l[end].node), `${id}: kopuk hat ${l.id}`);
    }
    assert.equal(new Set(first.map((c) => c.group)).size, 1, 'set tek grup');
    assert.notEqual(first[0].group, second[0].group, 'ikinci kopya ayrı grup');
    assert.ok(set.items.every((it) => !set.items.some((o) => o !== it && o.id === it.id)));
  }
  const air = Sets.get('air').items;
  assert.ok(air.some((it) => it.symbol === 'v.32nc' && it.tag === '0V2' && it.coils[0].pid === 'V47'));
  assert.equal(air.filter((it) => it.symbol === 'a.cylDouble').length, 2);
  const smc = Sets.get('smc').items;
  for (const s of ['v.32manual', 's.fr', 'v.softStart', 'k.pressureSwitch', 'v.32nc', 'v.53exhaust']) assert.ok(smc.some((it) => it.symbol === s), s);
  assert.equal(smc.filter((it) => it.symbol === 'a.cylLock').length, 2);
  assert.equal(smc.filter((it) => it.symbol === 'f.throttle').length, 4);
});

test('PNO(SMC) mantığı: 1V1 silindirleri sürer, 1V2 kilidi açar, 0V2 yumuşak başlatma valfidir', () => {
  const Sets = require('../sets.js');
  const Model = require('../model.js');
  const drawing = Model.createDrawing('T');
  Sets.insert(drawing.sheets[0], 'smc');
  const r = Logic.analyze(drawing, { catalog: new Map(), lang: 'tr' });
  const texts = r.logic.map((x) => x.text);
  assert.ok(texts.some((t) => /1V2/.test(t) && /1A1/.test(t) && /kilidi açılır/.test(t)), texts.join('\n'));
  assert.ok(texts.some((t) => /1V1/.test(t) && /1A1/.test(t) && /ileri çıkar|geri çekilir/.test(t)), texts.join('\n'));
  const en = Logic.analyze(drawing, { catalog: new Map(), lang: 'en' }).logic.map((x) => x.text);
  assert.ok(en.some((t) => /is unlocked/.test(t)));
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../cizim.html'), 'utf8');
  const at = (f) => html.indexOf(`<script src="engine/${f}"></script>`);
  assert.ok(at('model.js') < at('sets.js') && at('sets.js') > 0 && at('sets.js') < at('panels.js'));
});
