#!/usr/bin/env node
/* Önizleme dosyası: programı, P&IDX verisini ve örnek bir projeyi tek HTML dosyasına gömer.
   Dosya klasör izni istemeden açılır; çalışma tarayıcı hafızasında saklanır.

   Kullanım:
     npm run onizleme -- --pidx "../P&IDX"
     npm run onizleme -- --pidx "../P&IDX" --ornek BODYCOAT --out onizleme.html

   --pidx   P&IDX ana klasörü (içinde P&ID/data olan). Verilmezse yanındaki P&IDX, P-IDX veya p-idx klasörü aranır.
   --ornek  Örnek projenin çizileceği makine kaydı (seri no veya firma). Verilmezse en çok pnömatik kodu olan kayıt.
   --out    Çıkış dosyası (varsayılan: onizleme.html). P&IDX makine kayıtlarını içerdiği için depoya eklenmez.
   --yayin  claude.ai Artifact olarak yayınlanacak sayfa: HTML iskeleti olmadan, yazdırma ve indirme düğmeleri olmadan;
            P&ID kod listesi yalnız pnömatik serilerin (V, PPS, SWB, SW, PS) kod ve adlarına indirilir,
            başka firmaların logoları (ENVA, VICO, K.SYSTEM) konmaz; bu markalar seçilince antette adları, kapakta yer tutucu görünür. */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'PNOMATIK');
const CODES = path.join(APP, 'codes');
const ENGINE = path.join(CODES, 'engine');

const Link = require(path.join(ENGINE, 'pidlink.js'));
const Gen = require(path.join(ENGINE, 'generator.js'));
const Host = require(path.join(CODES, 'host.js'));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith('--')) out[key.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : true;
  }
  return out;
}

/* ─── Node için klasör tutamağı (host.js'in P&IDX okuyucusu için) ─── */

function domError(name) {
  const e = new Error(name);
  e.name = name;
  return e;
}

class FileH {
  constructor(abs) {
    this.abs = abs;
    this.kind = 'file';
    this.name = path.basename(abs);
  }

  async getFile() {
    const buf = fs.readFileSync(this.abs);
    return {
      name: this.name,
      size: buf.length,
      lastModified: fs.statSync(this.abs).mtimeMs,
      arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    };
  }
}

class DirH {
  constructor(abs) {
    this.abs = abs;
    this.kind = 'directory';
    this.name = path.basename(abs);
  }

  async getDirectoryHandle(name) {
    const abs = path.join(this.abs, name);
    if (!fs.existsSync(abs)) throw domError('NotFoundError');
    if (!fs.statSync(abs).isDirectory()) throw domError('TypeMismatchError');
    return new DirH(abs);
  }

  async getFileHandle(name) {
    const abs = path.join(this.abs, name);
    if (!fs.existsSync(abs)) throw domError('NotFoundError');
    if (fs.statSync(abs).isDirectory()) throw domError('TypeMismatchError');
    return new FileH(abs);
  }

  async *entries() {
    for (const d of fs.readdirSync(this.abs, { withFileTypes: true })) {
      const abs = path.join(this.abs, d.name);
      yield [d.name, d.isDirectory() ? new DirH(abs) : new FileH(abs)];
    }
  }
}

/* ─── Tohum dosyaları ─────────────────────────────────── */

const PNEU_SERIES = new Set(['V', 'PPS', 'SWB', 'SW', 'PS']);
let onlyPneumatic = false;
const seriesOf = (kod) => (String(kod || '').toUpperCase().match(/^[A-Z]+/) || [''])[0];
const csvCell = (v) => (/[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** Yayın sayfasında P&ID kod listeleri yalnız pnömatik serilerin kod ve adlarını taşır */
function trimCatalog(rel, buf) {
  if (!onlyPneumatic) return buf;
  const name = rel.split('/').pop();
  if (/^(pid-)?kod(-en|-de)?\.csv$/i.test(name)) {
    const { headers, rows } = Host.parseCsvContent(buf.toString('utf8'));
    const keep = rows.filter((r) => PNEU_SERIES.has(seriesOf(r[0])));
    const lines = [[headers[0] || 'KOD', headers[1] || 'BİLEŞEN ADI'].map(csvCell).join(';')]
      .concat(keep.map((r) => [r[0], r[1] || ''].map(csvCell).join(';')));
    return Buffer.from(`\uFEFF${lines.join('\n')}\n`);
  }
  if (/^(pid-)?kodlar\.json$/i.test(name)) {
    const data = JSON.parse(buf.toString('utf8'));
    const list = (Array.isArray(data) ? data : data.kodlar || []).filter((k) => k && PNEU_SERIES.has(seriesOf(k.kod)));
    return Buffer.from(JSON.stringify({ kodlar: list.map((k) => ({ kod: k.kod, aciklama: k.aciklama || '' })) }, null, 1));
  }
  return buf;
}

const blobs = {};
function blobOf(buf) {
  const id = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
  if (!blobs[id]) blobs[id] = buf.toString('base64');
  return id;
}

/** Yayın sayfasına yalnız Dolfin logosu girer */
const skipInSeed = (rel) => rel === 'PNOMATIK/codes' ||
  (onlyPneumatic && rel.startsWith('PNOMATIK/assets/logos/') && !/\/dolfin\.[a-z]+$/i.test(rel));

function walk(abs, rel, out) {
  if (!fs.existsSync(abs)) return out;
  for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
    if (d.name.startsWith('.') && d.name !== '.gitkeep') continue;
    const a = path.join(abs, d.name);
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (skipInSeed(r)) continue;
    if (d.isDirectory()) {
      out.dirs.push(r);
      walk(a, r, out);
    } else {
      out.files[r] = blobOf(trimCatalog(r, fs.readFileSync(a)));
    }
  }
  return out;
}

function findPidx(given) {
  const candidates = given && given !== true ? [given] : ['../P&IDX', '../P-IDX', '../p-idx', '../../P&IDX', '../../p-idx'].map((p) => path.resolve(ROOT, p));
  for (const c of candidates) {
    const abs = path.resolve(c);
    if (fs.existsSync(path.join(abs, 'P&ID', 'data', 'kod.csv'))) return abs;
  }
  if (given && given !== true) throw new Error(`P&IDX klasörü bulunamadı (P&ID/data/kod.csv yok): ${given}`);
  return null;
}

/** P&IDX'ten yalnız programın okuduğu dosyalar: kod listesi, P&ID projeleri, makine kayıtları */
function pidxSeed(pidx) {
  const seed = { files: {}, dirs: [] };
  const add = (rel) => {
    const abs = path.join(pidx, rel);
    const key = rel.split(path.sep).join('/');
    if (fs.existsSync(abs)) seed.files[key] = blobOf(trimCatalog(key, fs.readFileSync(abs)));
  };
  for (const f of ['kod.csv', 'kod-en.csv', 'kod-de.csv']) add(path.join('P&ID', 'data', f));
  const projects = path.join(pidx, 'P&ID', 'projects');
  if (fs.existsSync(projects)) {
    for (const d of fs.readdirSync(projects, { withFileTypes: true })) {
      if (!d.isDirectory() || d.name.startsWith('.')) continue;
      seed.dirs.push(`P&ID/projects/${d.name}`);
      add(path.join('P&ID', 'projects', d.name, 'proje.json'));
      add(path.join('P&ID', 'projects', d.name, 'pid', 'cizim.json'));
    }
  }
  const ml = path.join(pidx, 'ML', 'kayitlar');
  if (fs.existsSync(ml)) {
    for (const f of fs.readdirSync(ml)) if (f.toLowerCase().endsWith('.json')) add(path.join('ML', 'kayitlar', f));
  }
  return seed;
}

/** Makine kaydından otomatik çizilmiş örnek proje */
async function exampleProject(pidx, wanted, appSeed) {
  const reader = Host.createPidReader(new DirH(pidx));
  const cat = await reader.catalog();
  if (!cat.ok) return null;
  const names = new Map(cat.entries.map((e) => [e.id, e.name]));
  const machines = (await reader.machines()).machines;
  const pneumatic = (m) => m.kodlar.map((k) => String(k).toUpperCase()).filter((k) => Link.isRelevant(k, names.get(k) || ''));
  let machine = null;
  if (wanted && wanted !== true) {
    const w = String(wanted).toLocaleLowerCase('tr');
    machine = machines.find((m) => String(m.seriNo).toLocaleLowerCase('tr') === w || String(m.firma).toLocaleLowerCase('tr').includes(w));
    if (!machine) throw new Error(`--ornek ile eşleşen makine kaydı yok: ${wanted}`);
  } else {
    machine = machines.slice().sort((a, b) => pneumatic(b).length - pneumatic(a).length)[0] || null;
  }
  if (!machine || !pneumatic(machine).length) return null;
  const mappingFile = path.join(APP, 'data', 'eslestirme.csv');
  const mapping = Link.parseMappingCsv(fs.existsSync(mappingFile) ? fs.readFileSync(mappingFile, 'utf8') : '');
  const plan = Link.plan(pneumatic(machine).map((kod) => ({ kod, name: names.get(kod) || '' })), mapping, {});
  const drawing = Gen.build(plan, { lang: 'tr' });
  const id = [machine.seriNo, machine.firma, machine.model].map((v) => Host.sanitizeName(v)).join('-');
  const meta = {
    seriNo: machine.seriNo,
    musteri: machine.firma,
    model: machine.model,
    firma: 'DOLFIN',
    dil: 'tr',
    rev: '01',
    tarih: new Date().toISOString().slice(0, 10),
    hazirlayan: 'Fatih GÜRAL',
    kontrol: 'Furkan BIÇAK',
    onay: 'Furkan BIÇAK',
    revizyonlar: [],
    pidProje: '',
    pidEtiket: true,
    makineId: machine.id
  };
  const base = `PNOMATIK/projects/${id}`;
  appSeed.files[`${base}/proje.json`] = blobOf(Buffer.from(`${JSON.stringify(meta, null, 2)}\n`));
  appSeed.files[`${base}/pnomatik/cizim.json`] = blobOf(Buffer.from(`${JSON.stringify(drawing, null, 1)}\n`));
  for (const dir of ['elektrik', 'plc', 'katalog', 'pnomatik/cikti']) appSeed.dirs.push(`${base}/${dir}`);
  return { id, label: `${machine.firma} · ${machine.model}`, circuits: plan.circuits.length, sheets: drawing.sheets.length };
}

/* ─── HTML ────────────────────────────────────────────── */

const scriptSafe = (code) => code.replace(/<\/script/gi, '<\\/script');
const read = (abs) => fs.readFileSync(abs, 'utf8');

/* Yayın sayfasında indirme ve yazdırma düğmeleri yok; yan boşluk telefonun kenar çubuklarını da açıkta bırakır */
const ARTIFACT_CSS = `
#btnExportPdf, #btnExportSvg, #csPdfCover, #csPdfAll, #rsPdf, #rsPdfAll, #mapCsvExport { display: none !important; }
body { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
`;

function inline(seed, artifact) {
  const page = read(path.join(CODES, 'cizim.html'));
  const headPart = page.slice(page.indexOf('<head>') + 6, page.indexOf('</head>'));
  let body = page.slice(page.indexOf('<body>') + 6, page.lastIndexOf('</body>'));
  const styles = [...headPart.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)]
    .map((m) => `<style>\n${read(path.join(CODES, m[1]))}\n</style>`)
    .concat(`<style>\n${read(path.join(__dirname, 'onizleme.css'))}${artifact ? ARTIFACT_CSS : ''}\n</style>`)
    .join('\n');
  // Logolar çalışma anında gömülü veriden gelir; yer tutucu kırık resim simgesini önler
  body = body.replace(/src="\.\.\/assets\/logos\/([^"]+)"/g, 'data-pnx-src="$1" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="');
  const head = `<script>\nwindow.__PNX_SEED = ${scriptSafe(JSON.stringify(seed))};\n</script>\n` +
    `<script>\n${scriptSafe(read(path.join(__dirname, 'onizleme-runtime.js')))}\n</script>\n`;
  let first = true;
  body = body.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
    if (src.includes('ortak/')) return ''; // Ortak veritabanı katmanı önizlemeye girmez
    const code = `<script>\n${scriptSafe(read(path.join(CODES, src)))}\n</script>`;
    if (!first) return code;
    first = false;
    return head + code;
  });
  const title = '<title>PNOMATIKX Önizleme</title>';
  if (artifact) {
    // claude.ai sayfayı kendi iskeletine sarar: başlık ilk 8 KB içinde olmalı
    return `${title}\n<meta name="claude:viewport-fit-sides" content="cover">\n${styles}\n${body}`;
  }
  return `<!DOCTYPE html>\n<html lang="tr">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  ${title}\n${styles}\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const artifact = !!opts.yayin;
  onlyPneumatic = artifact;
  const pidx = findPidx(opts.pidx);
  // Program dosyaları HTML'e ayrıca gömülür; tohumda yalnız veri, logolar ve projeler kalır
  const appSeed = walk(APP, 'PNOMATIK', { files: {}, dirs: [] });
  const example = pidx ? await exampleProject(pidx, opts.ornek, appSeed) : null;
  const seed = {
    time: Date.now(),
    builtAt: new Date().toLocaleDateString('tr-TR'),
    example: example ? example.label : '',
    app: appSeed,
    pidx: pidx ? pidxSeed(pidx) : null,
    artifact,
    blobs
  };
  const out = path.resolve(ROOT, opts.out && opts.out !== true ? opts.out : 'onizleme.html');
  fs.writeFileSync(out, inline(seed, artifact));
  const size = (fs.statSync(out).size / 1024 / 1024).toFixed(2);
  console.log(`Önizleme: ${out} (${size} MB)`);
  console.log(pidx ? `P&IDX: ${pidx}` : 'P&IDX bulunamadı: dosya yalnız PNOMATIK/data kod listesi kopyasıyla çalışır');
  if (example) console.log(`Örnek proje: ${example.id} · ${example.circuits} devre, ${example.sheets} sayfa`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
