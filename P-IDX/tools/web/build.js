/* Web sürümü paketi (claude.ai artifact): depo dosyaları + klasör erişimi yerine preview-fs.js.
   Kullanım: node tools/web/build.js [çıktı klasörü]   (varsayılan: .web-build)
   Çıktı: <klasör>/pidx-onizleme.html (ana sayfa), <klasör>/preview/ (dosyalar), <klasör>/preview-files.json
   (yayınlarken "files" haritası). Ana sayfa "db" yeteneğiyle yayınlanır; kayıtlar sayfanın veritabanında durur. */
const fs = require('fs'); const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const OUT_ROOT = path.resolve(process.argv[2] || path.join(ROOT, '.web-build'));
const OUT = path.join(OUT_ROOT, 'preview');
const SKIP_DIR = new Set(['.git', 'node_modules', 'test', 'tools', '.web-build']);
const SKIP_FILE = /(\.gitkeep|\.gitignore|\.cursorignore|\.md|\.xlsx)$/;
const urlPath = (rel) => rel.replace(/^P&ID\//, 'PID/');
const M = { dirs: [], files: [] };
function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) { if (SKIP_DIR.has(e.name)) continue; M.dirs.push(r); walk(path.join(dir, e.name), r); }
    else if (!SKIP_FILE.test(e.name) && !r.startsWith('LYM ') && r !== 'index.html' && r !== 'package.json') M.files.push(r);
  }
}
walk(ROOT, '');
fs.rmSync(OUT, { recursive: true, force: true });
const files = {};
for (const rel of M.files) {
  const dest = path.join(OUT, urlPath(rel));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let data = fs.readFileSync(path.join(ROOT, rel));
  if (rel === 'P&ID/codes/cizim.html' || rel === 'P&ID/codes/index.html') {
    data = Buffer.from(String(data).replace('<script src="host.js"></script>', '<script src="../../preview-fs.js"></script>\n  <script src="host.js"></script>'));
  }
  if (/\.(svg|drawio)$/.test(rel)) data = Buffer.from(String(data).replace(/<!DOCTYPE[^>\[]*(\[[\s\S]*?\])?\s*>/i, ''));
  fs.writeFileSync(dest, data);
  const ext = path.extname(rel);
  files[urlPath(rel)] = ext === '.drawio' ? { from: dest, contentType: 'application/xml' } : ext === '.csv' ? { from: dest, contentType: 'text/csv' } : ext === '.xlsx' ? { from: dest, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } : dest;
}
const fake = fs.readFileSync(path.join(__dirname, 'preview-fs.tpl.js'), 'utf8').replace('__MANIFEST__', JSON.stringify(M));
fs.writeFileSync(path.join(OUT, 'preview-fs.js'), fake);
files['preview-fs.js'] = path.join(OUT, 'preview-fs.js');
fs.writeFileSync(path.join(OUT_ROOT, 'preview-files.json'), JSON.stringify(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? path.relative(OUT_ROOT, v) : Object.assign({}, v, { from: path.relative(OUT_ROOT, v.from) })]))));

/* Ana sayfa: çizim motorunun kendisi. Veritabanı erişimi (window.claude) yalnız ana sayfada olduğu için
   cizim.html yönlendirilmez, gövdesi buraya alınır ve göreli adresler PID/codes/ köküne çevrilir. */
const src = fs.readFileSync(path.join(ROOT, 'P&ID/codes/cizim.html'), 'utf8');
const rebase = (url) => {
  if (/^(https?:|data:|#|mailto:|blob:)/.test(url)) return url;
  return path.posix.normalize(path.posix.join('PID/codes', url));
};
const fixAttrs = (html) => html.replace(/\s(src|href)="([^"]*)"/g, (m, attr, url) => ` ${attr}="${rebase(url)}"`);
const links = [...src.matchAll(/<link [^>]*rel="stylesheet"[^>]*>/g)].map((m) => fixAttrs(m[0]));
let body = src.slice(src.indexOf('>', src.indexOf('<body')) + 1, src.lastIndexOf('</body>'));
body = fixAttrs(body).replace('<script src="PID/codes/host.js"></script>', '<script src="preview-fs.js"></script>\n  <script src="PID/codes/host.js"></script>');
if (!body.includes('preview-fs.js')) throw new Error('host.js betiği bulunamadı');
const page = `<title>P&amp;IDX Önizleme</title>\n${links.join('\n')}\n${body.trim()}\n`;
fs.writeFileSync(path.join(OUT_ROOT, 'pidx-onizleme.html'), page);
console.log(Object.keys(files).length, 'files');
