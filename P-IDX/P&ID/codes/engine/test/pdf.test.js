/* PDF yazıcı: yol çevirisi, yazı tipi küçültme ve dosya yapısı */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Pdf = require('../pdf.js');

const FONTS = path.resolve(__dirname, '../../../assets/fonts');
const load = (file, name) => {
  const data = fs.readFileSync(path.join(FONTS, file));
  return new Pdf.TrueType(new Uint8Array(data.buffer, data.byteOffset, data.length), name);
};

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const text = (bytes) => Buffer.from(bytes).toString('latin1');

/** Dosyadaki nesneleri xref tablosundan okur: uzaklıklar yanlışsa burada düşer */
function readObjects(bytes) {
  const raw = text(bytes);
  const start = parseInt(/startxref\n(\d+)\n%%EOF\n$/.exec(raw)[1], 10);
  assert.ok(raw.startsWith('xref\n', start) || raw.slice(start, start + 5) === 'xref\n', 'startxref xref tablosunu göstermeli');
  const head = /^xref\n0 (\d+)\n/.exec(raw.slice(start));
  const size = parseInt(head[1], 10);
  let at = start + head[0].length;
  const objects = new Map();
  for (let id = 0; id < size; id += 1) {
    const row = raw.slice(at, at + 20);
    assert.equal(row.length, 20);
    assert.match(row, /^\d{10} \d{5} [nf] \n$/, 'xref satırı 20 bayt olmalı');
    if (row[17] === 'n') {
      const off = parseInt(row.slice(0, 10), 10);
      assert.equal(raw.slice(off, off + `${id} 0 obj\n`.length), `${id} 0 obj\n`, `${id}. nesnenin yeri doğru olmalı`);
      const end = raw.indexOf('endobj', off);
      const body = raw.slice(off + `${id} 0 obj\n`.length, end);
      const streamAt = body.indexOf('stream\n');
      if (streamAt >= 0) {
        const dict = body.slice(0, streamAt);
        const length = parseInt(/\/Length (\d+)/.exec(dict)[1], 10);
        const from = off + `${id} 0 obj\n`.length + streamAt + 'stream\n'.length;
        assert.equal(raw.slice(from + length, from + length + 11), '\nendstream\n', `${id}. akışın uzunluğu doğru olmalı`);
        objects.set(id, { dict, stream: bytes.subarray(from, from + length) });
      } else {
        objects.set(id, { dict: body, stream: null });
      }
    }
    at += 20;
  }
  return objects;
}

const find = (objects, pattern) => [...objects.values()].filter((o) => pattern.test(o.dict));

/* ─── Yol ─────────────────────────────────────────────── */

test('yol: mutlak ve göreli komutlar, H V ve kısa yazım', () => {
  assert.deepEqual(Pdf.parsePath('M10 20H30V40L5 5Z'), [['M', 10, 20], ['L', 30, 20], ['L', 30, 40], ['L', 5, 5], ['Z']]);
  assert.deepEqual(Pdf.parsePath('m1 2 3 4h5v-1l1,1z'), [['M', 1, 2], ['L', 4, 6], ['L', 9, 6], ['L', 9, 5], ['L', 10, 6], ['Z']]);
  // Ayraçsız sayılar, üslü sayı; Z sonrası yeni parça başlangıca göre
  assert.deepEqual(Pdf.parsePath('M.5-.5L1e1,2'), [['M', 0.5, -0.5], ['L', 10, 2]]);
  assert.deepEqual(Pdf.parsePath('M1 1L2 2Zl1 0'), [['M', 1, 1], ['L', 2, 2], ['Z'], ['L', 2, 1]]);
  assert.deepEqual(Pdf.parsePath(''), []);
});

test('yol: S ve T önceki eğrinin kontrol noktasını yansıtır, Q kübiğe çevrilir', () => {
  const s = Pdf.parsePath('M0 0C1 1 2 1 3 0S5 -1 6 0');
  assert.deepEqual(s[2].slice(1), [4, -1, 5, -1, 6, 0]);
  const q = Pdf.parsePath('M0 0Q3 3 6 0');
  assert.ok(near(q[1][1], 2) && near(q[1][2], 2) && near(q[1][3], 4) && near(q[1][4], 2));
  const t = Pdf.parsePath('M0 0Q3 3 6 0T12 0');
  // Yansıyan kontrol noktası (9,-3): kübikte ilk kontrol (8,-2)
  assert.ok(near(t[2][1], 8) && near(t[2][2], -2));
});

test('yol: yay kübiklere çevrilir, uç noktası ve yarıçapı tutar', () => {
  // Yarım daire: merkez (10,0), yarıçap 10
  const arc = Pdf.parsePath('M0 0A10 10 0 0 1 20 0');
  assert.equal(arc[0][0], 'M');
  assert.deepEqual(arc[arc.length - 1].slice(5), [20, 0]);
  assert.ok(arc.length >= 3, 'yarım daire en az iki parça');
  // Her parçanın ortası çember üzerinde olmalı
  let x0 = 0;
  let y0 = 0;
  for (const c of arc.slice(1)) {
    const mx = (x0 + 3 * c[1] + 3 * c[3] + c[5]) / 8;
    const my = (y0 + 3 * c[2] + 3 * c[4] + c[6]) / 8;
    assert.ok(near(Math.hypot(mx - 10, my), 10, 0.01), 'çember üzerinde olmalı');
    assert.ok(my < 1e-6, 'tarama yönü: y aşağı artan düzende üstten geçer');
    [x0, y0] = [c[5], c[6]];
  }
  // Bitişik yazılmış bayraklar
  const packed = Pdf.parsePath('M0 0a5 5 0 015 5');
  assert.deepEqual(packed[packed.length - 1].slice(5), [5, 5]);
  // Sıfır yarıçap düz çizgi olur, aynı nokta atlanır
  assert.deepEqual(Pdf.parsePath('M0 0A0 5 0 0 1 3 4')[1].slice(5), [3, 4]);
  assert.equal(Pdf.parsePath('M3 3A5 5 0 0 1 3 3').length, 1);
});

/* ─── Yazı tipi ───────────────────────────────────────── */

test('yazı tipleri: Türkçe ve Almanca harfler dahil, gömülmeye izinli', () => {
  const fonts = ['Carlito-Regular.ttf', 'Carlito-Bold.ttf', 'selawk.ttf', 'selawksb.ttf', 'selawkb.ttf'].map((f) => load(f, f));
  for (const font of fonts) {
    for (const ch of 'ığüşöçİĞÜŞÖÇäöüßÄÖÜ°·–×') assert.ok(font.glyphIndex(ch.codePointAt(0)) > 0, `${font.name}: ${ch}`);
    assert.ok(font.unitsPerEm > 0 && font.widthEm(font.glyphIndex(0x41)) > 0.3);
    const os2 = font.tables.get('OS/2').offset;
    assert.equal(font.view.getUint16(os2 + 8) & 0x0002, 0, 'yazı tipi gömmeye kapalı olmamalı');
  }
  // Ok ve matematik işaretleri için Carlito yedektir
  for (const ch of '→≤≥Δ±') assert.ok(fonts[0].glyphIndex(ch.codePointAt(0)) > 0, ch);
  assert.equal(fonts[0].glyphIndex(0x1f600), 0, 'olmayan harf 0 döner');
});

test('yazı tipi küçültme: birleşik harfin parçaları kalır, kullanılmayan harf boşalır, dosya geçerli', () => {
  const font = load('Carlito-Regular.ttf', 'Carlito-Regular');
  const composite = ['ş', 'Ş', 'ğ', 'Ğ', 'İ', 'ü'].map((c) => font.glyphIndex(c.codePointAt(0))).find((g) => font.components(g).length);
  assert.ok(composite, 'örnek birleşik harf bulunmalı');
  const parts = font.components(composite);
  const unused = font.glyphIndex('Z'.codePointAt(0));
  const { bytes, glyphs } = font.subset([composite]);
  for (const p of parts) assert.ok(glyphs.has(p), 'parça korunmalı');
  assert.ok(glyphs.has(0), '.notdef korunmalı');
  assert.ok(!glyphs.has(unused));
  assert.ok(bytes.length < 150000, `küçük olmalı: ${bytes.length}`);

  const out = new Pdf.TrueType(bytes, 'kopya');
  assert.equal(out.numGlyphs, font.numGlyphs, 'harf numaraları değişmez');
  assert.equal(out.longLoca, true);
  const [a, b] = out.glyphRange(composite);
  const [c, d] = font.glyphRange(composite);
  assert.deepEqual(bytes.subarray(a, b).slice(0, d - c), font.bytes.subarray(c, d).slice(), 'harf verisi aynen taşınmalı');
  const [u0, u1] = out.glyphRange(unused);
  assert.equal(u1 - u0, 0, 'kullanılmayan harf boş olmalı');
  assert.ok(out.widthEm(unused) > 0, 'genişlik tablosu korunur');

  // Dosya toplamı: sfnt kuralına göre sabit
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  let sum = 0;
  for (let i = 0; i + 4 <= (bytes.length & ~3); i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  assert.equal(sum, 0xb1b0afba);
});

test('yazı tipi küçültme: kısa loca kullanan yazı tipi de uzun biçime geçer', () => {
  const font = load('selawk.ttf', 'Selawik-Regular');
  assert.equal(font.longLoca, false);
  const gid = font.glyphIndex('ş'.codePointAt(0));
  const out = new Pdf.TrueType(font.subset([gid]).bytes, 'kopya');
  assert.equal(out.longLoca, true);
  const [a, b] = out.glyphRange(gid);
  assert.ok(b > a);
});

/* ─── Belge ───────────────────────────────────────────── */

test('belge: sayfa ölçüleri, xref uzaklıkları, akış uzunlukları doğru', async () => {
  const doc = Pdf.create({ title: 'ŞEMA Äß', date: 'D:20260101000000' });
  const a = doc.addPage(420, 297);
  a.rect(10, 20, 30, 40);
  a.paint({ fill: true });
  doc.addPage(841, 594);
  const bytes = await doc.save();
  assert.equal(text(bytes).slice(0, 8), '%PDF-1.7');
  const objects = readObjects(bytes);
  const pages = find(objects, /\/Type \/Page\b(?!s)/);
  assert.equal(pages.length, 2);
  assert.match(pages[0].dict, /MediaBox \[0 0 1190\.5512 841\.8898\]/);
  assert.match(pages[1].dict, /MediaBox \[0 0 2383\.937 1683\.7795\]/);
  assert.match(find(objects, /\/Type \/Pages/)[0].dict, /\/Count 2/);
  // Başlık UTF-16BE: Ş = 015E
  assert.match(text(bytes), /\/Title <FEFF015E/);
  // İlk sayfa içeriği: y aşağı artan milimetre düzeni
  const content = text(await inflate(find(objects, /FlateDecode \/Length \d+ >>/).find((o) => !/Length1/.test(o.dict)).stream));
  assert.match(content, /^2\.8346 0 0 -2\.8346 0 841\.8898 cm/);
  assert.match(content, /10 20 30 40 re\nf/);
});

test('belge: yazı gömülür, harf yerleri korunur, metin geri okunabilir', async () => {
  const font = load('Carlito-Regular.ttf', 'Carlito-Regular');
  const doc = Pdf.create();
  const page = doc.addPage(100, 100);
  const size = 10;
  const pick = (ch, x) => ({ gid: font.glyphIndex(ch.codePointAt(0)), x, ch });
  const s = pick('Ş', 5);
  const naturalEnd = 5 + font.widthEm(s.gid) * size;
  const i = pick('i', naturalEnd + 1); // 1 birim harf aralığı
  const j = pick('ğ', i.x + font.widthEm(i.gid) * size); // doğal aralık
  page.text(font, size, 50, [s, i, j]);
  const bytes = await doc.save();
  const objects = readObjects(bytes);

  const type0 = find(objects, /\/Subtype \/Type0/)[0];
  assert.match(type0.dict, /\/Encoding \/Identity-H/);
  assert.match(type0.dict, /\/BaseFont \/[A-Z]{6}\+Carlito-Regular/);
  const cid = find(objects, /\/Subtype \/CIDFontType2/)[0];
  assert.match(cid.dict, /\/CIDToGIDMap \/Identity/);
  const widths = /\/W \[(.*)\]/.exec(cid.dict)[1];
  assert.ok(widths.includes(`${s.gid} [${Math.round(font.widthEm(s.gid) * 1000)}`), 'genişlik yazılmalı');

  const descriptor = find(objects, /\/FontFile2/)[0];
  assert.ok(descriptor);
  const file = find(objects, /\/Length1 /)[0];
  const ttf = await inflate(file.stream);
  assert.equal(ttf.length, parseInt(/\/Length1 (\d+)/.exec(file.dict)[1], 10));
  assert.ok(ttf.length < 100000, `küçültülmüş olmalı: ${ttf.length}`);
  assert.ok(new Pdf.TrueType(ttf, 'k').glyphRange(s.gid)[1] > new Pdf.TrueType(ttf, 'k').glyphRange(s.gid)[0]);

  const contents = await Promise.all(find(objects, /FlateDecode \/Length \d+ >>/).filter((o) => !/Length1/.test(o.dict)).map((o) => inflate(o.stream)));
  const page0 = contents.map(text).find((c) => c.includes(' Tf '));
  // 1 birimlik aralık 10 punto harfte -100 düzeltme; doğal aralıkta düzeltme yok, tek parça kalır
  assert.match(page0, /BT \/F0 1 Tf 10 0 0 -10 5 50 Tm \[<[0-9a-f]{4}> -100 <[0-9a-f]{8}>\] TJ ET/);

  const cmap = contents.map(text).find((c) => c.includes('beginbfchar'));
  const hex = (g) => g.toString(16).padStart(4, '0');
  assert.ok(cmap.includes(`<${hex(s.gid)}> <015e>`), 'Ş geri okunmalı');
  assert.ok(cmap.includes(`<${hex(j.gid)}> <011f>`), 'ğ geri okunmalı');
});

test('belge: en kalın yazı dıştan çizilerek kalınlaşır, sonraki yazı etkilenmez', async () => {
  const font = load('selawkb.ttf', 'Selawik-Bold');
  const doc = Pdf.create();
  const page = doc.addPage(100, 100);
  const a = { gid: font.glyphIndex(0x41), x: 5, ch: 'A' };
  page.text(font, 10, 50, [a], 0.28);
  page.text(font, 10, 70, [a]);
  const objects = readObjects(await doc.save());
  const contents = await Promise.all(find(objects, /FlateDecode \/Length \d+ >>/).filter((o) => !/Length1/.test(o.dict)).map((o) => inflate(o.stream)));
  const ops = contents.map(text).find((c) => c.includes(' Tf '));
  assert.match(ops, /0\.28 w 2 Tr BT .* ET 0 Tr\nBT /);
});

test('belge: saydam görsel maskeyle, opak görsel maskesiz; saydamlık durumu tekrar kullanılır', async () => {
  const doc = Pdf.create();
  const page = doc.addPage(50, 50);
  const clear = doc.addImage({ width: 2, height: 1, rgb: new Uint8Array([255, 0, 0, 0, 255, 0]), alpha: new Uint8Array([255, 0]) });
  const solid = doc.addImage({ width: 1, height: 1, rgb: new Uint8Array([0, 0, 255]), alpha: null });
  page.image(clear, 1, 2, 10, 5);
  page.image(solid, 20, 2, 5, 5);
  page.alpha(0.5, 1);
  page.alpha(0.5, 1);
  page.alpha(1, 1);
  const objects = readObjects(await doc.save());
  const images = find(objects, /\/Subtype \/Image/);
  assert.equal(images.length, 3, 'iki görsel ve bir maske');
  assert.equal(images.filter((o) => /\/SMask/.test(o.dict)).length, 1);
  assert.equal(images.filter((o) => /DeviceGray/.test(o.dict)).length, 1);
  assert.deepEqual([...await inflate(images.find((o) => /DeviceGray/.test(o.dict)).stream)], [255, 0]);
  assert.match([...objects.values()].map((o) => o.dict).join(), /\/ExtGState << \/G0 << \/ca 0\.5 \/CA 1 >> >>/);
  const content = text(await inflate(find(objects, /FlateDecode \/Length \d+ >>/).find((o) => !/Image/.test(o.dict)).stream));
  // Görsel y aşağı düzende ters çevrilmeden yerleşir
  assert.match(content, /q 10 0 0 -5 1 7 cm \/I0 Do Q/);
  assert.equal((content.match(/\/G0 gs/g) || []).length, 2);
});

test('belge: yazı tipi kullanılmayan boş belge de geçerli; aynı yazı tipi bir kez gömülür', async () => {
  const empty = readObjects(await Pdf.create().save());
  assert.match(find(empty, /\/Type \/Pages/)[0].dict, /\/Count 0/);
  const font = load('selawk.ttf', 'Selawik-Regular');
  const doc = Pdf.create();
  for (let n = 0; n < 3; n += 1) doc.addPage(10, 10).text(font, 2, 5, [{ gid: font.glyphIndex(0x41), x: 1, ch: 'A' }]);
  const objects = readObjects(await doc.save());
  assert.equal(find(objects, /\/Subtype \/Type0/).length, 1);
  assert.equal(find(objects, /\/Type \/Page\b(?!s)/).length, 3);
});

test('program: PDF düğmeleri yazdırma penceresi açmaz, yazı tipi dosyaları ve lisansları yerinde', () => {
  const codes = path.resolve(__dirname, '../..');
  const host = fs.readFileSync(path.join(codes, 'host.js'), 'utf8');
  const exportPdf = /exportPdf: bound\([\s\S]*?\n    \}\),/.exec(host)[0];
  assert.ok(!/print/i.test(exportPdf.replace(/yazdırma/g, '')), 'exportPdf yazdırmaya gitmemeli');
  assert.ok(exportPdf.includes('downloadBlob'), 'doğrudan indirmeli');
  assert.ok(!exportPdf.includes('saveAs'), 'kayıt penceresi açmamalı');
  const app = fs.readFileSync(path.join(codes, 'engine/app.js'), 'utf8');
  assert.ok(!/window\.print|PDF olarak kaydet/.test(app));
  const html = fs.readFileSync(path.join(codes, 'cizim.html'), 'utf8');
  assert.ok(html.indexOf('engine/pdf.js') < html.indexOf('engine/pdf-dom.js') && html.indexOf('engine/pdf-dom.js') < html.indexOf('engine/app.js'));
  for (const file of ['Carlito-Regular.ttf', 'Carlito-Bold.ttf', 'selawk.ttf', 'selawksb.ttf', 'selawkb.ttf', 'OFL-Carlito.txt', 'OFL-Selawik.txt']) {
    assert.ok(fs.existsSync(path.join(FONTS, file)), file);
  }
  assert.match(fs.readFileSync(path.join(FONTS, 'OFL-Carlito.txt'), 'utf8'), /SIL Open Font License/);
  assert.match(fs.readFileSync(path.join(FONTS, 'OFL-Selawik.txt'), 'utf8'), /SIL Open Font License/);
});
