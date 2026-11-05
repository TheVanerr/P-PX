/* Etiket listesi: ML/MAKİNE ETİKETLEME.xlsx ile aynı düzende Excel dosyası.
   Şablonun ilk sayfasından stil, sütun genişliği ve sayfa ayarı alınır; içerik çizimdeki kodlardır.
   Zip okuma/yazma tarayıcının (ve Node'un) DecompressionStream'i ile yapılır, dış kütüphane yoktur. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PidXlsx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROWS_PER_COLUMN = 20;
  const GROUPS = [['B', 'C'], ['E', 'F'], ['H', 'I'], ['K', 'L']];
  const SPACERS = ['D', 'G', 'J'];
  const FIRST_ROW = 5;
  const LAST_ROW = FIRST_ROW + ROWS_PER_COLUMN - 1;
  const PER_SHEET = GROUPS.length * ROWS_PER_COLUMN;
  /* Şablondaki sıra: pompalar, fanlar, rezistanslar, ısı, seviye, vanalar, sensörler, güvenlik */
  const SERIES_ORDER = ['PE', 'FE', 'VE', 'GE', 'R', 'BR', 'TD', 'TC', 'LS', 'PS', 'V', 'SWB', 'PPS', 'PRS', 'SW', 'SS',
    'PHS', 'CS', 'B', 'L', 'INV', 'ENC', 'T', 'F', 'FC'];
  const HEAD = { tr: ['Kullanılan Bileşen', 'KOD'], en: ['Component', 'CODE'], de: ['Komponente', 'CODE'] };

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const xml = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ─── Zip ─────────────────────────────────────────────── */

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Zip içeriği: ad -> bayt */
  async function readZip(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('Excel dosyası okunamadı (zip sonu yok)');
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const files = new Map();
    for (let i = 0; i < count; i += 1) {
      if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Excel dosyası bozuk');
      const method = view.getUint16(p + 10, true);
      const size = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const local = view.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      files.set(name, method === 8 ? await inflate(data) : data.slice());
      p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  /** Sıkıştırmasız zip (Excel kabul eder) */
  function writeZip(entries) {
    const parts = [];
    const central = [];
    let offset = 0;
    for (const [name, content] of entries) {
      const nameBytes = enc.encode(name);
      const data = typeof content === 'string' ? enc.encode(content) : content;
      const crc = crc32(data);
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 ad
      local.setUint32(14, crc, true);
      local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true);
      local.setUint16(26, nameBytes.length, true);
      parts.push(new Uint8Array(local.buffer), nameBytes, data);
      const head = new DataView(new ArrayBuffer(46));
      head.setUint32(0, 0x02014b50, true);
      head.setUint16(4, 20, true);
      head.setUint16(6, 20, true);
      head.setUint16(8, 0x0800, true);
      head.setUint32(16, crc, true);
      head.setUint32(20, data.length, true);
      head.setUint32(24, data.length, true);
      head.setUint16(28, nameBytes.length, true);
      head.setUint32(42, offset, true);
      central.push(new Uint8Array(head.buffer), nameBytes);
      offset += 30 + nameBytes.length + data.length;
    }
    const centralSize = central.reduce((n, b) => n + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
    let at = 0;
    for (const b of all) {
      out.set(b, at);
      at += b.length;
    }
    return out;
  }

  /* ─── Şablon ──────────────────────────────────────────── */

  /** Şablonun son (en yeni) sayfasından stil numaraları ve sayfa ayarları */
  function templateLook(files) {
    const sheetNames = [...files.keys()].filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10));
    const sheet = files.get(sheetNames[sheetNames.length - 1]);
    const text = sheet ? dec.decode(sheet) : '';
    const styleOf = (ref) => {
      const m = text.match(new RegExp(`<c r="${ref}"[^>]*?\\ss="(\\d+)"`));
      return m ? m[1] : null;
    };
    const pick = (re) => (text.match(re) || [''])[0];
    // Satır yükseklikleri (şablonda 24.95)
    const rows = {};
    for (const m of text.matchAll(/<row r="(\d+)"([^>]*?)\/?>/g)) {
      const ht = m[2].match(/\sht="([\d.]+)"/);
      if (ht) rows[m[1]] = ` ht="${ht[1]}" customHeight="1"`;
    }
    // Her hücrenin şablondaki stili: kenarlık, dolgu ve yazı aynen korunur
    const cells = {};
    for (const m of text.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)\/?>/g)) {
      const st = m[2].match(/\ss="(\d+)"/);
      if (st) cells[m[1]] = st[1];
    }
    const merges = [...text.matchAll(/<mergeCell ref="([A-Z]+\d+:[A-Z]+\d+)"/g)].map((m) => m[1]);
    return {
      rows,
      cells,
      merges,
      styles: files.get('xl/styles.xml') || null,
      theme: files.get('xl/theme/theme1.xml') || null,
      cols: pick(/<cols>[\s\S]*?<\/cols>/),
      margins: pick(/<pageMargins[^>]*\/>/),
      setup: pick(/<pageSetup[^>]*\/>/),
      s: {
        title: styleOf('B2'),
        sub: styleOf('B3'),
        headName: styleOf('B4'),
        headCode: styleOf('C4'),
        name: styleOf('B5'),
        code: styleOf('C5'),
        spacer: styleOf('D4'),
        nameLast: styleOf(`B${LAST_ROW}`),
        codeLast: styleOf(`C${LAST_ROW}`)
      }
    };
  }

  const FALLBACK_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders>' +
    '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
    '<cellXfs count="4"><xf/><xf fontId="1" borderId="1" applyFont="1" applyBorder="1"/><xf borderId="1" applyBorder="1"/>' +
    '<xf fontId="2" applyFont="1"><alignment horizontal="center"/></xf></cellXfs></styleSheet>';
  const FALLBACK_LOOK = {
    rows: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [String(i + 1), ' ht="24.95" customHeight="1"'])),
    styles: null,
    theme: null,
    cols: '<cols><col min="1" max="1" width="5.7" customWidth="1"/><col min="2" max="2" width="40.7" customWidth="1"/><col min="3" max="3" width="20.7" customWidth="1"/><col min="4" max="4" width="5.7" customWidth="1"/><col min="5" max="5" width="40.7" customWidth="1"/><col min="6" max="6" width="20.7" customWidth="1"/><col min="7" max="7" width="5.7" customWidth="1"/><col min="8" max="8" width="40.7" customWidth="1"/><col min="9" max="9" width="20.7" customWidth="1"/><col min="10" max="10" width="5.7" customWidth="1"/><col min="11" max="11" width="40.7" customWidth="1"/><col min="12" max="12" width="20.7" customWidth="1"/></cols>',
    margins: '',
    setup: '',
    s: { title: '3', sub: null, headName: '1', headCode: '1', name: '2', code: '2', spacer: null, nameLast: '2', codeLast: '2' }
  };

  /* ─── İçerik ──────────────────────────────────────────── */

  function sortKey(code) {
    const series = (code.match(/^[A-Z]+/) || [''])[0];
    const rank = SERIES_ORDER.indexOf(series);
    return [rank < 0 ? SERIES_ORDER.length : rank, series, parseInt(code.replace(/\D/g, ''), 10) || 0];
  }

  /** Kodları şablon sırasına dizer: [{code, name}] */
  function orderRows(rows) {
    return rows.slice().sort((a, b) => {
      const [ra, sa, na] = sortKey(a.code);
      const [rb, sb, nb] = sortKey(b.code);
      return ra - rb || sa.localeCompare(sb) || na - nb;
    });
  }

  function cellXml(ref, value, style) {
    const s = style != null ? ` s="${style}"` : '';
    if (value === undefined || value === null || value === '') return `<c r="${ref}"${s}/>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }

  function sheetXml(title, rows, look, lang) {
    const s = look.s;
    const cell = (ref, value, style) => cellXml(ref, value, (look.cells && look.cells[ref]) || style);
    const head = HEAD[lang] || HEAD.tr;
    const out = [];
    const ra = (r) => (look.rows && look.rows[String(r)]) || '';
    out.push(`<row r="1"${ra(1)}/>`);
    out.push(`<row r="2"${ra(2)}>${cell('B2', title, s.title)}${'CDEFGHIJKL'.split('').map((c) => cell(`${c}2`, '', s.title)).join('')}</row>`);
    out.push(`<row r="3"${ra(3)}/>`);
    out.push(`<row r="4"${ra(4)}>${GROUPS.map(([n, c], i) => cell(`${n}4`, head[0], s.headName) + cell(`${c}4`, head[1], s.headCode) +
      (SPACERS[i] ? cell(`${SPACERS[i]}4`, '', s.spacer) : '')).join('')}</row>`);
    for (let r = FIRST_ROW; r <= LAST_ROW; r += 1) {
      const last = r === LAST_ROW;
      let cells = '';
      GROUPS.forEach(([n, c], g) => {
        const item = rows[g * ROWS_PER_COLUMN + (r - FIRST_ROW)];
        cells += cell(`${n}${r}`, item ? item.name : '', last ? s.nameLast || s.name : s.name);
        cells += cell(`${c}${r}`, item ? item.code : '', last ? s.codeLast || s.code : s.code);
        if (SPACERS[g]) cells += cell(`${SPACERS[g]}${r}`, '', s.spacer);
      });
      out.push(`<row r="${r}"${ra(r)}>${cells}</row>`);
    }
    const merges = [...new Set(['B2:L2', ...(look.merges || []), ...SPACERS.map((c) => `${c}4:${c}${LAST_ROW}`)])];
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>${look.cols}` +
      `<sheetData>${out.join('')}</sheetData>` +
      `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` +
      `${look.margins}${look.setup.replace(/\s?r:id="[^"]*"/, '')}</worksheet>`;
  }

  /** Excel sayfa adı: en çok 31 karakter, yasak işaretler yok */
  function sheetName(text, index) {
    const clean = String(text || 'Etiket').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, index ? 26 : 31);
    return index ? `${clean} (${index + 1})` : clean;
  }

  /**
   * @param rows [{code, name}] çizimdeki kodlar
   * @param options.title B2 başlığı, options.sheet sayfa adı, options.template şablon xlsx baytları, options.lang
   * @returns Uint8Array xlsx
   */
  async function labelWorkbook(rows, options) {
    const opts = options || {};
    let look = FALLBACK_LOOK;
    if (opts.template) {
      try {
        look = templateLook(await readZip(opts.template));
        if (!look.styles) look = FALLBACK_LOOK;
      } catch {
        look = FALLBACK_LOOK;
      }
    }
    const ordered = orderRows(rows);
    const chunks = [];
    for (let i = 0; i < Math.max(1, ordered.length); i += PER_SHEET) chunks.push(ordered.slice(i, i + PER_SHEET));
    const sheets = chunks.map((chunk, i) => ({ name: sheetName(opts.sheet, i), xml: sheetXml(opts.title || '', chunk, look, opts.lang) }));

    const entries = [];
    entries.push(['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      (look.theme ? '<Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' : '') +
      '</Types>']);
    entries.push(['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>']);
    entries.push(['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      `<sheets>${sheets.map((sh, i) => `<sheet name="${xml(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`]);
    const rels = sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`);
    rels.push(`<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
    if (look.theme) rels.push(`<Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`);
    entries.push(['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`]);
    entries.push(['xl/styles.xml', look.styles || FALLBACK_STYLES]);
    if (look.theme) entries.push(['xl/theme/theme1.xml', look.theme]);
    sheets.forEach((sh, i) => entries.push([`xl/worksheets/sheet${i + 1}.xml`, sh.xml]));
    return writeZip(entries);
  }

  return { readZip, writeZip, crc32, orderRows, labelWorkbook, ROWS_PER_COLUMN, PER_SHEET };
});
