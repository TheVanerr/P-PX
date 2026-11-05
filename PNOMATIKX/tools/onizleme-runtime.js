/* PNOMATIKX önizleme: klasör erişimi yerine tarayıcı belleğinde iki klasör (PNOMATIKX ve P&IDX).
   tools/onizleme.js bu dosyayı, programı ve tohum dosyalarını tek HTML'e gömer; dosya klasör izni istemeden açılır.
   PNOMATIKX'e yazılanlar (projeler, kod eşleştirme listesi, ayarlar) tarayıcı hafızasında saklanır; P&IDX yalnız okunur. */

(function () {
  'use strict';

  const SEED = window.__PNX_SEED;
  if (!SEED) return;
  const LS_KEY = 'pnomatikx_onizleme_v1';
  const KEEP = (path) => path.startsWith('PNOMATIK/projects/') || path === 'PNOMATIK/data/eslestirme.csv' || path === 'PNOMATIK/data/ayarlar.json';

  const err = (name) => {
    const e = new Error(name);
    e.name = name;
    return e;
  };

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  const parentOf = (p) => p.split('/').slice(0, -1).join('/');

  /** Yol → içerik haritası üzerinde FileSystemDirectoryHandle benzeri klasör */
  function makeFs(name, seed) {
    const files = new Map();
    const dirs = new Set(['']);
    const addDir = (p) => {
      const segs = p.split('/').filter(Boolean);
      for (let i = 1; i <= segs.length; i += 1) dirs.add(segs.slice(0, i).join('/'));
    };
    for (const [p, id] of Object.entries(seed.files || {})) {
      files.set(p, { bytes: b64ToBytes(SEED.blobs[id]), mtime: SEED.time });
      addDir(parentOf(p));
    }
    for (const d of seed.dirs || []) addDir(d);
    return { name, files, dirs, addDir, onWrite: null };
  }

  function fileHandle(fs, path) {
    return {
      kind: 'file',
      name: path.split('/').pop(),
      async getFile() {
        const f = fs.files.get(path);
        if (!f) throw err('NotFoundError');
        const bytes = f.bytes;
        return {
          name: path.split('/').pop(),
          size: bytes.length,
          lastModified: f.mtime,
          type: '',
          arrayBuffer: async () => bytes.slice().buffer,
          text: async () => new TextDecoder().decode(bytes)
        };
      },
      async createWritable() {
        let chunks = [];
        return {
          async write(data) {
            if (typeof data === 'string') chunks.push(new TextEncoder().encode(data));
            else if (data instanceof Blob) chunks.push(new Uint8Array(await data.arrayBuffer()));
            else chunks.push(new Uint8Array(data.buffer || data));
          },
          async close() {
            const size = chunks.reduce((n, c) => n + c.length, 0);
            const bytes = new Uint8Array(size);
            let at = 0;
            for (const c of chunks) {
              bytes.set(c, at);
              at += c.length;
            }
            fs.files.set(path, { bytes, mtime: Date.now() });
            fs.addDir(parentOf(path));
            if (fs.onWrite) fs.onWrite(path);
          },
          async abort() {
            chunks = [];
          }
        };
      }
    };
  }

  function dirHandle(fs, path, label) {
    const join = (name) => (path ? `${path}/${name}` : name);
    return {
      kind: 'directory',
      name: label || path.split('/').pop() || fs.name,
      async getDirectoryHandle(name, options) {
        const p = join(name);
        if (fs.files.has(p)) throw err('TypeMismatchError');
        if (!fs.dirs.has(p)) {
          if (!options || !options.create) throw err('NotFoundError');
          fs.addDir(p);
          if (fs.onWrite) fs.onWrite(p);
        }
        return dirHandle(fs, p);
      },
      async getFileHandle(name, options) {
        const p = join(name);
        if (fs.dirs.has(p)) throw err('TypeMismatchError');
        if (!fs.files.has(p)) {
          if (!options || !options.create) throw err('NotFoundError');
          fs.files.set(p, { bytes: new Uint8Array(0), mtime: Date.now() });
        }
        return fileHandle(fs, p);
      },
      async removeEntry(name) {
        const p = join(name);
        fs.files.delete(p);
        for (const key of [...fs.files.keys()]) if (key.startsWith(`${p}/`)) fs.files.delete(key);
        for (const key of [...fs.dirs]) if (key === p || key.startsWith(`${p}/`)) fs.dirs.delete(key);
        if (fs.onWrite) fs.onWrite(p);
      },
      async *entries() {
        const prefix = path ? `${path}/` : '';
        const seen = new Set();
        for (const d of fs.dirs) {
          if (!d || !d.startsWith(prefix)) continue;
          const rest = d.slice(prefix.length);
          if (!rest || rest.includes('/') || seen.has(rest)) continue;
          seen.add(rest);
          yield [rest, dirHandle(fs, d)];
        }
        for (const f of fs.files.keys()) {
          if (!f.startsWith(prefix)) continue;
          const rest = f.slice(prefix.length);
          if (!rest || rest.includes('/') || seen.has(rest)) continue;
          seen.add(rest);
          yield [rest, fileHandle(fs, f)];
        }
      },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; }
    };
  }

  /* ─── Tarayıcı hafızası ───────────────────────────────── */

  let storable = false;
  function restore(fs) {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      storable = true;
    } catch {
      storable = false;
    }
    if (!saved || saved.v !== 1) return false;
    for (const d of saved.dirs || []) fs.addDir(d);
    for (const [p, b64] of Object.entries(saved.files || {})) {
      fs.files.set(p, { bytes: b64ToBytes(b64), mtime: saved.time || Date.now() });
      fs.addDir(parentOf(p));
    }
    return true;
  }

  let saveTimer = null;
  function persist(fs) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const files = {};
      for (const [p, f] of fs.files) if (KEEP(p)) files[p] = bytesToB64(f.bytes);
      const dirs = [...fs.dirs].filter((d) => d.startsWith('PNOMATIK/projects/'));
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, time: Date.now(), files, dirs }));
      } catch {
        storable = false;
      }
    }, 300);
  }

  const appFs = makeFs('PNOMATIKX', SEED.app);
  const restored = restore(appFs);
  appFs.onWrite = () => persist(appFs);
  const appRoot = dirHandle(appFs, '', 'PNOMATIKX önizleme');
  const pidFs = SEED.pidx ? makeFs('P&IDX', SEED.pidx) : null;
  const pidRoot = pidFs ? dirHandle(pidFs, '', 'P&IDX (örnek veri)') : null;

  // Klasör seçme penceresi yerine hazır klasörler
  window.showDirectoryPicker = async (options) => {
    if (options && options.id === 'pidx-root') {
      if (!pidRoot) throw err('AbortError');
      return pidRoot;
    }
    return appRoot;
  };

  function reset() {
    try {
      localStorage.removeItem(LS_KEY);
      localStorage.removeItem('pnomatikx_dock');
    } catch { /* hafıza kapalıysa yeniden yükleme yeter */ }
    location.reload();
  }

  window.__PNX_PREVIEW = { root: appRoot, pid: pidRoot, reset, restored, noPrint: !!SEED.artifact, get storable() { return storable; } };

  /* ─── Gömülü logolar ──────────────────────────────────── */

  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', gif: 'image/gif', webp: 'image/webp' };
  /** Gömülü logo; dosya gömülmemişse boş döner */
  function dataUri(rel) {
    const name = String(rel || '').split('/').pop();
    const path = `PNOMATIK/assets/logos/${name}`;
    const f = appFs.files.get(path);
    if (!f) return '';
    const ext = name.split('.').pop().toLowerCase();
    return `data:${MIME[ext] || 'application/octet-stream'};base64,${bytesToB64(f.bytes)}`;
  }

  /* Logosu gömülmeyen marka (yayın sayfasında başka firmaların logoları yoktur):
     antette marka adı yazı olarak, kapakta adıyla kesik çizgili bir yer tutucu görünür. */
  const BRAND_LABEL = { KSYSTEM: 'K.SYSTEM' };
  function placeholderLogo(label) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200">' +
      '<rect x="2" y="2" width="316" height="196" rx="6" fill="none" stroke="#9aa3ad" stroke-width="2" stroke-dasharray="8 6"/>' +
      `<text x="160" y="98" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#6b7480">${label}</text>` +
      '<text x="160" y="136" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="#9aa3ad">logo önizlemede yok</text></svg>';
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  function embedBrandLogos() {
    /* global COVER_BRANDS, HEADER_BRANDS */
    if (typeof COVER_BRANDS !== 'undefined') {
      for (const [key, b] of Object.entries(COVER_BRANDS)) {
        if (b.logo) b.logo = dataUri(b.logo) || placeholderLogo(BRAND_LABEL[key] || key);
      }
    }
    if (typeof HEADER_BRANDS !== 'undefined') {
      for (const [key, b] of Object.entries(HEADER_BRANDS)) {
        if (!b.logo) continue;
        const uri = dataUri(b.logo);
        if (uri) b.logo = uri;
        else Object.assign(b, { type: 'text', name: BRAND_LABEL[key] || key, sub: b.sub || '' });
      }
    }
  }

  /* ─── Bilgi şeridi ────────────────────────────────────── */

  function banner() {
    const nav = document.querySelector('.home-nav');
    if (!nav || document.getElementById('pnxPreviewBar')) return;
    const bar = document.createElement('div');
    bar.id = 'pnxPreviewBar';
    bar.className = 'pnx-preview-bar';
    const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const example = SEED.example ? `Örnek proje <b>${esc(SEED.example)}</b> makine kaydından otomatik çizildi. ` : '';
    const memory = storable
      ? 'Çalışmanız bu tarayıcıda saklanır.'
      : 'Bu görünümde tarayıcı hafızası kapalı: sayfa yenilenince çalışmanız silinir.';
    const output = SEED.artifact
      ? 'Bu önizleme PDF, SVG ve CSV indiremez; bunlar için programı bilgisayarınızda index.html ile açın.'
      : 'PDF ve indirme düğmeleri dosya Chrome veya Edge ile açılınca çalışır.';
    const source = SEED.artifact ? 'P&amp;ID kodları (V, PPS, SWB, SW, PS) ve makine kayıtları' : 'P&amp;ID kod listesi ve makine kayıtları';
    bar.innerHTML = `
      <span class="pnx-tag">ÖNİZLEME</span>
      <span class="pnx-text">${source} P&amp;IDX'ten alındı (salt okunur, ${esc(SEED.builtAt)}). ${example}${memory}
      ${output}</span>
      <button type="button" class="btn btn-sm" id="pnxReset">Önizlemeyi sıfırla</button>`;
    nav.insertAdjacentElement('afterend', bar);
    const button = bar.querySelector('#pnxReset');
    let armed = null;
    button.addEventListener('click', () => {
      if (armed) {
        reset();
        return;
      }
      button.textContent = 'Tüm deneme projeleri silinsin mi? Evet';
      button.classList.add('btn-primary');
      armed = setTimeout(() => {
        armed = null;
        button.textContent = 'Önizlemeyi sıfırla';
        button.classList.remove('btn-primary');
      }, 4000);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.lang = 'tr';
    for (const img of document.querySelectorAll('img[data-pnx-src]')) {
      const uri = dataUri(img.dataset.pnxSrc);
      if (uri) img.src = uri;
    }
    // Kapak ve antet logoları dosya yolu yerine gömülü veri olur
    embedBrandLogos();
    banner();
  });
})();
