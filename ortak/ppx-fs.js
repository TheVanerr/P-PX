/* Veritabanı üzerinde klasör görünümü: iki programın host.js'i File System Access API ile konuşur,
   bu dosya aynı arayüzü veritabanına bağlar. Böylece çizim motorlarında kayıt kodu değişmez. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PpxFs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Yalnız bu yollar veritabanına aktarılır. Kod listesi tek kaynaktır: PNOMATIK/data/pid-* kopyaları alınmaz.
     Yazı tipi ve logolar da aktarılır: dosyadan açılan sayfa diskteki dosyayı programla okuyamaz. */
  const IMPORT_RULES = [
    /^P&ID\/data\//,
    /^P&ID\/projects\//,
    /^P&ID\/symbols\//,
    /^P&ID\/assets\//,
    /^ML\//,
    /^PNOMATIK\/data\/(?!pid-)/,
    /^PNOMATIK\/projects\//,
    /^PNOMATIK\/assets\//
  ];
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

  /** Depoda yalnız README varsa veri aktarılmamış sayılır */
  const hasProgramData = (records) => records.some((r) => /^(P&ID|PNOMATIK|ML)\//.test(r.path));

  const domError = (name) => {
    const e = new Error(name);
    e.name = name;
    return e;
  };

  async function toBytes(data) {
    if (typeof data === 'string') return new TextEncoder().encode(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (data && typeof data.arrayBuffer === 'function') return new Uint8Array(await data.arrayBuffer());
    if (data && data.type === 'write') return toBytes(data.data);
    return new TextEncoder().encode(String(data));
  }

  /** db: PpxDb */
  function createRoot(db, options) {
    const join = (a, b) => (a ? `${a}/${b}` : b);

    async function hasFile(path) {
      const record = await db.read(path);
      return !!record && record.kind === 'file';
    }

    async function hasDir(path) {
      if (!path) return true;
      const record = await db.read(path);
      if (record && record.kind === 'dir') return true;
      const prefix = `${path}/`;
      return (await db.list()).some((r) => r.path.startsWith(prefix));
    }

    function fileHandle(path) {
      return {
        kind: 'file',
        name: path.split('/').pop(),
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
        async getFile() {
          const record = await db.read(path);
          if (!record || record.kind !== 'file') throw domError('NotFoundError');
          return new File([record.bytes], path.split('/').pop(), { lastModified: record.at });
        },
        async createWritable() {
          const chunks = [];
          return {
            write: async (data) => { chunks.push(await toBytes(data)); },
            close: async () => {
              const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
              let at = 0;
              for (const chunk of chunks) {
                out.set(chunk, at);
                at += chunk.length;
              }
              await db.write(path, out);
            },
            abort: async () => { chunks.length = 0; }
          };
        }
      };
    }

    /* Programlar boş klasörü .gitkeep yazarak korur. Burada klasör kaydı olur, depoya .gitkeep olarak gider. */
    function keepHandle() {
      return {
        kind: 'file',
        name: '.gitkeep',
        createWritable: async () => ({ write: async () => {}, close: async () => {}, abort: async () => {} })
      };
    }

    function dirHandle(path, label) {
      const self = {
        kind: 'directory',
        name: label || path.split('/').pop(),
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
        async getDirectoryHandle(name, opts) {
          const p = join(path, name);
          if (await hasFile(p)) throw domError('TypeMismatchError');
          if (!(await hasDir(p))) {
            if (!opts || !opts.create) throw domError('NotFoundError');
            await db.mkdir(p);
          }
          return dirHandle(p);
        },
        async getFileHandle(name, opts) {
          const p = join(path, name);
          if (name === '.gitkeep' && opts && opts.create) {
            await db.mkdir(path);
            return keepHandle();
          }
          if (await hasDir(p)) throw domError('TypeMismatchError');
          if (!(await hasFile(p))) {
            if (!opts || !opts.create) throw domError('NotFoundError');
            await db.write(p, new Uint8Array(0));
          }
          return fileHandle(p);
        },
        async removeEntry(name) {
          const p = join(path, name);
          if (!(await db.remove(p))) throw domError('NotFoundError');
        },
        async *entries() {
          const prefix = path ? `${path}/` : '';
          const seen = new Set();
          for (const record of await db.list()) {
            if (!record.path.startsWith(prefix) || record.path === path) continue;
            const rest = record.path.slice(prefix.length);
            const name = rest.split('/')[0];
            if (!name || seen.has(name)) continue;
            seen.add(name);
            const full = join(path, name);
            yield [name, rest.includes('/') || record.kind === 'dir' ? dirHandle(full) : fileHandle(full)];
          }
        }
      };
      self[Symbol.asyncIterator] = self.entries;
      return self;
    }

    return dirHandle('', (options && options.name) || 'P&PX Veritabanı');
  }

  /* ─── Klasörlerden veritabanına aktarma ─────────────────── */

  async function childDir(dir, name) {
    try {
      return await dir.getDirectoryHandle(name);
    } catch {
      return null;
    }
  }

  async function hasPath(dir, segs) {
    let current = dir;
    for (const seg of segs) {
      current = await childDir(current, seg);
      if (!current) return false;
    }
    return true;
  }

  /** Seçilen klasörde programları bulur: P&PX üst klasörü, P&IDX ya da PNOMATIKX olabilir */
  async function findSources(dir) {
    const sources = [];
    const check = async (handle) => {
      if ((await hasPath(handle, ['P&ID', 'data'])) || (await hasPath(handle, ['PNOMATIK', 'data']))) sources.push(handle);
    };
    await check(dir);
    if (sources.length) return sources;
    for await (const [, handle] of dir.entries()) {
      if (handle.kind === 'directory') await check(handle);
    }
    return sources;
  }

  async function* walk(dir, prefix) {
    for await (const [name, handle] of dir.entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'directory') {
        if (name === '.git' || name === 'node_modules') continue;
        yield* walk(handle, path);
      } else {
        yield { path, handle };
      }
    }
  }

  /** Var olan veritabanı kaydı üzerine yazılmaz; atlananlar nedeniyle birlikte döner */
  async function importFolder(db, dir, onProgress) {
    const sources = await findSources(dir);
    if (!sources.length) return { ok: false, error: `"${dir.name}" içinde P&ID/data ya da PNOMATIK/data bulunamadı` };
    const result = { ok: true, written: 0, kept: 0, skipped: [], sources: sources.map((s) => s.name) };
    for (const source of sources) {
      for await (const { path, handle } of walk(source, '')) {
        if (!IMPORT_RULES.some((rule) => rule.test(path))) continue;
        const name = path.split('/').pop();
        if (name.endsWith('.crswap')) continue;
        if (name === '.gitkeep') {
          await db.mkdir(path.split('/').slice(0, -1).join('/'));
          continue;
        }
        const file = await handle.getFile();
        if (/\/step\//.test(path) || file.size > MAX_IMPORT_BYTES) {
          result.skipped.push(`${path} (${Math.ceil(file.size / 1024)} KB)`);
          continue;
        }
        if (await db.read(path)) {
          result.kept += 1;
          continue;
        }
        await db.write(path, new Uint8Array(await file.arrayBuffer()));
        result.written += 1;
        if (onProgress) onProgress(result);
      }
    }
    return result;
  }

  /* ─── Program verisi: kod listesi ve güvenlik kataloğu ──── */

  /* Programla gelen, programların yalnız okuduğu dosyalar. Aktarma var olan dosyayı korur; program güncellenince
     bunlar "Program verilerini güncelle" ile seçilen klasördeki sürüme getirilir. Programda değiştirilen dosyalar
     (projeler, makine kayıtları, ML kod listesi, kod eşleştirme, ayarlar, elle düzenlenen açıklamalar) burada yoktur, güncellemede değişmez. */
  const PROGRAM_DATA = [
    { path: 'P&ID/data/kod.csv', label: 'Kod listesi TR' },
    { path: 'P&ID/data/kod-en.csv', label: 'Kod listesi EN' },
    { path: 'P&ID/data/kod-de.csv', label: 'Kod listesi DE' },
    { path: 'P&ID/data/guvenlik.csv', label: 'Güvenlik kataloğu TR' },
    { path: 'P&ID/data/safety.csv', label: 'Güvenlik kataloğu EN' },
    { path: 'P&ID/data/safety-de.csv', label: 'Güvenlik kataloğu DE' }
  ];
  /* Katalog her değiştiğinde sürüm bir artar (npm run veri-surumu, test denetler). Dosya katalogla birlikte yazılır:
     veritabanındaki sürüm seçilen klasördekinden yeniyse eski program yeni veriyi ezemez. */
  const DATA_VERSION_FILE = 'P&ID/data/surum.json';
  const MAX_LISTED_CODES = 6;

  /** BOM ve satır sonu farkı içerik farkı sayılmaz: aynı dosya Windows'ta CRLF, başka yerde LF olabilir */
  function comparable(bytes) {
    const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
    const out = new Uint8Array(bytes.length - start);
    let n = 0;
    for (let i = start; i < bytes.length; i += 1) {
      if (bytes[i] !== 0x0d) {
        out[n] = bytes[i];
        n += 1;
      }
    }
    return out.subarray(0, n);
  }

  function sameContent(a, b) {
    const x = comparable(a);
    const y = comparable(b);
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return false;
    return true;
  }

  /** Sürüm dosyasındaki dosya kimliği: satır sonu ne olursa olsun aynı içerik aynı değeri verir */
  async function dataHash(bytes) {
    const digest = await crypto.subtle.digest('SHA-1', comparable(bytes));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Programlar gibi okunur: UTF-8 değilse Türkçe Windows kodlaması */
  function decodeText(bytes) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder('windows-1254').decode(bytes);
    }
  }

  /** Satırlar ilk sütundaki koda göre; ilk satır başlıktır. Programlar da aynı kodun yalnız ilk satırını okur. */
  function csvRows(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const header = lines.length ? lines[0] : '';
    const delimiter = (header.match(/;/g) || []).length > (header.match(/,/g) || []).length ? ';' : ',';
    const rows = new Map();
    for (const line of lines.slice(1)) {
      const key = line.split(delimiter)[0].replace(/"/g, '').trim();
      if (key && !rows.has(key)) rows.set(key, line);
    }
    return { header, rows };
  }

  function rowDiff(before, after) {
    const a = csvRows(before);
    const b = csvRows(after);
    const added = [];
    const removed = [];
    let changed = 0;
    for (const [key, line] of b.rows) {
      if (!a.rows.has(key)) added.push(key);
      else if (a.rows.get(key) !== line) changed += 1;
    }
    for (const key of a.rows.keys()) if (!b.rows.has(key)) removed.push(key);
    return { changed, added, removed, header: !!a.header && a.header !== b.header };
  }

  async function fileIn(dir, path) {
    const segs = path.split('/');
    const name = segs.pop();
    let current = dir;
    for (const seg of segs) {
      current = await childDir(current, seg);
      if (!current) return null;
    }
    try {
      return new Uint8Array(await (await (await current.getFileHandle(name)).getFile()).arrayBuffer());
    } catch {
      return null;
    }
  }

  function readVersion(bytes) {
    try {
      const data = JSON.parse(decodeText(bytes));
      const surum = Number(data && data.surum);
      return Number.isInteger(surum) && surum > 0 ? { surum, tarih: String(data.tarih || '') } : null;
    } catch {
      return null;
    }
  }

  /** Web uygulaması: programın kendi katalog dosyaları klasör gibi okunur, klasör seçilmez.
      baseUrl programdaki P-IDX klasörünün adresidir; yalnız kod listesi, güvenlik kataloğu ve sürüm dosyası görünür. */
  function programFolder(baseUrl, name, fetchFn) {
    const get = fetchFn || ((url) => fetch(url, { cache: 'no-store' }));
    const files = new Set(PROGRAM_DATA.map((f) => f.path).concat(DATA_VERSION_FILE));
    const dirs = new Set();
    for (const file of files) {
      const segs = file.split('/');
      for (let i = 1; i < segs.length; i += 1) dirs.add(segs.slice(0, i).join('/'));
    }
    const join = (a, b) => (a ? `${a}/${b}` : b);
    const url = (p) => new URL(p.split('/').map(encodeURIComponent).join('/'), baseUrl).href;
    function fileHandle(path) {
      return {
        kind: 'file',
        name: path.split('/').pop(),
        async getFile() {
          const res = await get(url(path));
          if (!res.ok) throw domError('NotFoundError');
          return new File([await res.arrayBuffer()], path.split('/').pop());
        }
      };
    }
    function dirHandle(path) {
      const self = {
        kind: 'directory',
        name: path ? path.split('/').pop() : name,
        async getDirectoryHandle(child) {
          const p = join(path, child);
          if (!dirs.has(p)) throw domError('NotFoundError');
          return dirHandle(p);
        },
        async getFileHandle(child) {
          const p = join(path, child);
          if (!files.has(p)) throw domError('NotFoundError');
          return fileHandle(p);
        },
        async *entries() {
          const prefix = path ? `${path}/` : '';
          const seen = new Set();
          for (const p of [...dirs, ...files]) {
            if (!p.startsWith(prefix)) continue;
            const child = p.slice(prefix.length).split('/')[0];
            if (seen.has(child)) continue;
            seen.add(child);
            const full = join(path, child);
            yield [child, dirs.has(full) ? dirHandle(full) : fileHandle(full)];
          }
        }
      };
      self[Symbol.asyncIterator] = self.entries;
      return self;
    }
    return dirHandle('');
  }

  /** Seçilen program klasöründeki kod listesi ve güvenlik kataloğunu veritabanındakiyle karşılaştırır, hiçbir şey yazmaz.
      Sürüm bilgisi olmayan eski program klasörü ve veritabanındakinden eski sürüm reddedilir.
      seen: plan anında veritabanındaki dosyanın kimliği; uygulamada değişmiş mi diye bakılır. */
  async function planProgramData(db, dir) {
    const sources = [];
    for (const handle of await findSources(dir)) {
      if (await hasPath(handle, ['P&ID', 'data'])) sources.push(handle);
    }
    if (!sources.length) return { ok: false, error: `"${dir.name}" içinde P&ID/data bulunamadı. P&PX klasörünü seçin.` };
    if (sources.length > 1) return { ok: false, error: `"${dir.name}" içinde birden çok P&ID klasörü var (${sources.map((s) => s.name).join(', ')}). Güncel P-IDX klasörünü seçin.` };
    const source = sources[0];
    const versionBytes = await fileIn(source, DATA_VERSION_FILE);
    const to = versionBytes ? readVersion(versionBytes) : null;
    if (!to) {
      return { ok: false, error: `"${source.name}" klasöründe ${DATA_VERSION_FILE} yok ya da okunamıyor; bu eski bir program sürümü olabilir. Güncel P&PX klasörünü seçin.` };
    }
    const stored = await db.read(DATA_VERSION_FILE);
    const storedFile = stored && stored.kind === 'file' ? stored : null;
    const from = storedFile ? readVersion(storedFile.bytes) : null;
    if (from && from.surum > to.surum) {
      return {
        ok: false,
        newer: true,
        from,
        to,
        error: `Veritabanındaki kod listesi ve güvenlik kataloğu daha yeni: sürüm ${from.surum}, seçilen klasörde sürüm ${to.surum}. Hiçbir şey değişmedi. Önce bu bilgisayardaki programı güncelleyin.`
      };
    }
    const files = [];
    for (const { path, label } of PROGRAM_DATA) {
      const bytes = await fileIn(source, path);
      // Programda olmayan dosya veritabanında olduğu gibi kalır
      if (!bytes) continue;
      const record = await db.read(path);
      const current = record && record.kind === 'file' ? record : null;
      if (current && sameContent(current.bytes, bytes)) continue;
      const diff = rowDiff(current ? decodeText(current.bytes) : '', decodeText(bytes));
      files.push(Object.assign({ path, label, bytes, isNew: !current, seen: record ? record.hash : null }, diff));
    }
    const version = storedFile && sameContent(storedFile.bytes, versionBytes)
      ? null
      : { path: DATA_VERSION_FILE, bytes: versionBytes, seen: stored ? stored.hash : null };
    return { ok: true, source: source.name, from, to, files, version };
  }

  /** Plandakileri yazar, sürüm dosyasını en son. Plandan sonra veritabanında biri değiştiyse hiçbirini yazmaz. */
  async function applyProgramData(db, plan) {
    const items = plan.files.concat(plan.version ? [plan.version] : []);
    for (const item of items) {
      const record = await db.read(item.path);
      if ((record ? record.hash : null) !== item.seen) {
        return { ok: false, error: 'Veritabanı bu sırada değişti, hiçbir şey yazılmadı. Yeniden deneyin.' };
      }
    }
    for (const item of items) await db.write(item.path, item.bytes);
    return { ok: true, written: plan.files.length };
  }

  function formatDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || '');
  }

  function codeList(keys) {
    const shown = keys.slice(0, MAX_LISTED_CODES).join(', ');
    return keys.length > MAX_LISTED_CODES ? `${shown} ve ${keys.length - MAX_LISTED_CODES} kod daha` : shown;
  }

  /** Onaydan önce gösterilecek satırlar */
  function programDataSummary(plan) {
    const when = plan.to.tarih ? `, ${formatDate(plan.to.tarih)}` : '';
    const lines = [`Programdaki kod listesi ve güvenlik kataloğu (sürüm ${plan.to.surum}${when}) veritabanındakinden farklı:`];
    for (const f of plan.files) {
      const parts = [];
      if (f.isNew) {
        parts.push('veritabanında yok, eklenecek');
      } else {
        if (f.changed) parts.push(`${f.changed} kodun metni değişecek`);
        if (f.added.length) parts.push(`${f.added.length} kod eklenecek`);
        if (f.removed.length) parts.push(`${f.removed.length} kod silinecek (${codeList(f.removed)})`);
        if (f.header) parts.push('başlık satırı değişecek');
        if (!parts.length) parts.push('yalnız biçim değişecek');
      }
      lines.push(`• ${f.label} (${f.path.split('/').pop()}): ${parts.join(', ')}`);
    }
    lines.push('Projeler, makine kayıtları, ML kod listesi, kod eşleştirme, ayarlar ve elle düzenlenen açıklamalar değişmez.');
    return lines;
  }

  return {
    createRoot,
    importFolder,
    findSources,
    hasProgramData,
    planProgramData,
    applyProgramData,
    programFolder,
    programDataSummary,
    dataHash,
    IMPORT_RULES,
    MAX_IMPORT_BYTES,
    PROGRAM_DATA,
    DATA_VERSION_FILE
  };
});
