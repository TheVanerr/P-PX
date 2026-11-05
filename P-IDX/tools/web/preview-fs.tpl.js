/* P&IDX web sürümü: tarayıcı klasör erişimi yerine yayınlanan depo dosyalarını kullanır.
   Kaydedilen her dosya sayfanın veritabanına (claude db) yazılır ve açılışta depodaki
   dosyaların üstüne bindirilir; böylece her cihazda aynı veri görünür.
   Veritabanı yoksa (oturum kapalı, izin yok) kayıtlar yalnız o sekmede kalır. */
(() => {
  const M = __MANIFEST__;
  const BASE = new URL('./', document.currentScript.src); // preview-fs.js paketin kökünde durur
  const COLLECTION = 'files';
  const CHUNK = 60000; // karakter; Türkçe harflerle bile belge 256 KiB altında kalır
  const mem = new Map();
  const partsOf = new Map(); // yol -> veritabanındaki parça sayısı
  const chains = new Map();
  const dErr = (n) => { const e = new Error(n); e.name = n; return e; };
  const join = (a, b) => (a ? `${a}/${b}` : b);
  const isDir = (p) => p === '' || M.dirs.includes(p);
  const isFile = (p) => mem.has(p) || M.files.includes(p);
  const urlOf = (p) => new URL(p.replace(/^P&ID\//, 'PID/').split('/').map(encodeURIComponent).join('/'), BASE);
  const toBytes = async (d) => {
    if (typeof d === 'string') return new TextEncoder().encode(d);
    if (d instanceof Blob) return new Uint8Array(await d.arrayBuffer());
    if (d instanceof ArrayBuffer) return new Uint8Array(d);
    if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    if (d && d.type === 'write') return toBytes(d.data);
    return new TextEncoder().encode(String(d));
  };

  /* ─── Durum yazısı ─── */
  let chip = null;
  function status(text, sticky) {
    const show = () => {
      if (!chip) {
        chip = document.createElement('div');
        chip.style.cssText = 'position:fixed;left:12px;bottom:40px;z-index:99999;padding:6px 10px;border-radius:6px;' +
          'font:12px "Segoe UI",system-ui,sans-serif;background:#23272f;color:#e8eaef;border:1px solid #2f343e;' +
          'box-shadow:0 4px 14px rgba(0,0,0,.35);pointer-events:none;max-width:420px';
        document.body.appendChild(chip);
      }
      chip.textContent = text;
      chip.hidden = false;
      clearTimeout(chip.timer);
      if (!sticky) chip.timer = setTimeout(() => { chip.hidden = true; }, 7000);
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show, { once: true });
  }

  /* ─── Veritabanı ─── */
  const b64 = {
    enc(bytes) {
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    dec(text) {
      const s = atob(text);
      const out = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
      return out;
    }
  };
  /** Belge adı: yolun base64url hâli; çok uzunsa özet */
  function docId(path) {
    const raw = b64.enc(new TextEncoder().encode(path)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (raw.length <= 190) return raw;
    let h = 0x811c9dc5;
    for (const ch of path) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return `h_${h.toString(16)}_${path.length}`;
  }

  async function connectDb() {
    for (let i = 0; i < 20 && !(window.claude && window.claude.use); i += 1) await new Promise((r) => setTimeout(r, 100));
    if (!(window.claude && window.claude.use)) return null;
    try {
      return await window.claude.use('db');
    } catch {
      return null;
    }
  }

  let db = null;
  const ready = (async () => {
    status('Veriler yükleniyor…', true);
    db = await connectDb();
    if (!db) {
      status('Kalıcı kayıt yok: kaydettikleriniz yalnızca bu sekmede kalır.', false);
      return;
    }
    try {
      const snap = await db.collection(COLLECTION).limit(1000).get();
      for (const doc of snap.docs) {
        const row = doc.data();
        if (!row || typeof row.path !== 'string') continue;
        const p = row.path;
        if (row.kind === 'dir') {
          if (!M.dirs.includes(p)) M.dirs.push(p);
          continue;
        }
        if (row.kind === 'deleted') {
          mem.delete(p);
          M.files = M.files.filter((f) => f !== p);
          continue;
        }
        let text = row.text || '';
        if (row.parts) {
          const parts = await db.collection(`${COLLECTION}/${doc.id}/parts`).limit(1000).get();
          text = parts.docs.map((d) => d.data()).filter(Boolean).sort((a, b) => a.i - b.i).map((d) => d.text).join('');
          partsOf.set(p, row.parts);
        }
        mem.set(p, row.enc === 'b64' ? b64.dec(text) : new TextEncoder().encode(text));
        if (!M.files.includes(p)) M.files.push(p);
        // Klasörleri de tanıt
        const segs = p.split('/');
        for (let i = 1; i < segs.length; i += 1) {
          const d = segs.slice(0, i).join('/');
          if (!M.dirs.includes(d)) M.dirs.push(d);
        }
      }
      status(snap.size ? `Kalıcı kayıt açık: ${snap.size} kayıt yüklendi.` : 'Kalıcı kayıt açık: kaydettikleriniz her cihazda görünür.', false);
    } catch (e) {
      status(`Kayıtlar okunamadı (${e && e.code ? e.code : 'hata'}). Depodaki hâl gösteriliyor.`, false);
    }
  })();

  async function writeDoc(path, bytes) {
    let enc = 'text';
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      enc = 'b64';
      text = b64.enc(bytes);
    }
    const id = docId(path);
    const ref = db.collection(COLLECTION).doc(id);
    const before = partsOf.get(path) || 0;
    if (text.length <= CHUNK) {
      await ref.set({ path, kind: 'file', enc, text, parts: 0, at: Date.now() });
      for (let i = 0; i < before; i += 1) await db.collection(`${COLLECTION}/${id}/parts`).doc(`p${i}`).delete();
      partsOf.set(path, 0);
      return;
    }
    const count = Math.ceil(text.length / CHUNK);
    for (let i = 0; i < count; i += 1) {
      await db.collection(`${COLLECTION}/${id}/parts`).doc(`p${i}`).set({ i, text: text.slice(i * CHUNK, (i + 1) * CHUNK) });
    }
    await ref.set({ path, kind: 'file', enc, parts: count, at: Date.now() });
    for (let i = count; i < before; i += 1) await db.collection(`${COLLECTION}/${id}/parts`).doc(`p${i}`).delete();
    partsOf.set(path, count);
  }

  /** Aynı dosyaya yazmalar sırayla gider */
  function persist(path, job) {
    if (!db) return;
    const prev = chains.get(path) || Promise.resolve();
    const next = prev.then(job).catch((e) => {
      const code = e && e.code;
      status(code === 'quota_exceeded'
        ? 'Web kaydı dolu: yeni dosya kaydedilemedi. Eski projeleri silin.'
        : `Web kaydı yapılamadı (${code || 'hata'}): ${path.split('/').pop()}`, true);
    });
    chains.set(path, next);
  }
  const persistFile = (path, bytes) => persist(path, () => writeDoc(path, bytes));
  const persistMark = (path, kind) => persist(path, () => db.collection(COLLECTION).doc(docId(path)).set({ path, kind, at: Date.now() }));

  /* ─── Klasör arayüzü ─── */
  class FileH {
    constructor(p) { this.p = p; this.kind = 'file'; this.name = p.split('/').pop(); }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
    async getFile() {
      let buf = mem.get(this.p);
      if (!buf) {
        const res = await fetch(urlOf(this.p));
        if (!res.ok) throw dErr('NotFoundError');
        buf = new Uint8Array(await res.arrayBuffer());
      }
      return new File([buf], this.name, { lastModified: Date.now() });
    }
    async createWritable() {
      const p = this.p; const chunks = [];
      return {
        write: async (d) => { chunks.push(await toBytes(d)); },
        close: async () => {
          const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
          let i = 0; for (const c of chunks) { out.set(c, i); i += c.length; }
          mem.set(p, out); if (!M.files.includes(p)) M.files.push(p);
          persistFile(p, out);
        },
        abort: async () => {}
      };
    }
  }
  class DirH {
    constructor(p) { this.p = p; this.kind = 'directory'; this.name = p ? p.split('/').pop() : 'P&IDX (web)'; }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
    async isSameEntry(o) { return o && o.p === this.p; }
    async getDirectoryHandle(n, o) {
      const p = join(this.p, n);
      if (!isDir(p)) {
        if (isFile(p)) throw dErr('TypeMismatchError');
        if (!o || !o.create) throw dErr('NotFoundError');
        M.dirs.push(p);
        persistMark(p, 'dir');
      }
      return new DirH(p);
    }
    async getFileHandle(n, o) {
      const p = join(this.p, n);
      if (isDir(p)) throw dErr('TypeMismatchError');
      if (!isFile(p)) { if (!o || !o.create) throw dErr('NotFoundError'); mem.set(p, new Uint8Array()); M.files.push(p); }
      return new FileH(p);
    }
    async removeEntry(n) {
      const p = join(this.p, n);
      if (!isFile(p) && !isDir(p)) throw dErr('NotFoundError');
      const gone = M.files.filter((f) => f === p || f.startsWith(`${p}/`));
      mem.delete(p);
      M.files = M.files.filter((f) => f !== p && !f.startsWith(`${p}/`));
      M.dirs = M.dirs.filter((d) => d !== p && !d.startsWith(`${p}/`));
      for (const f of gone) persistMark(f, 'deleted');
    }
    async* entries() {
      const pre = this.p ? `${this.p}/` : '';
      const direct = (x) => x.startsWith(pre) && x !== this.p && !x.slice(pre.length).includes('/');
      for (const d of M.dirs.filter(direct)) yield [d.slice(pre.length), new DirH(d)];
      for (const f of M.files.filter(direct)) yield [f.slice(pre.length), new FileH(f)];
    }
    async* values() { for await (const [, h] of this.entries()) yield h; }
    async* keys() { for await (const [k] of this.entries()) yield k; }
    [Symbol.asyncIterator]() { return this.entries(); }
  }
  const root = new DirH('');
  window.showDirectoryPicker = async () => { await ready; return root; };
  window.showSaveFilePicker = undefined; // kayıt penceresi yerine indirme denenir
  // Klasör seçme ekranını kendiliğinden geç
  new MutationObserver((_, obs) => {
    const btn = document.querySelector('[data-gate="pick"]');
    if (btn) { obs.disconnect(); btn.click(); }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
