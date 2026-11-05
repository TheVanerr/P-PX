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

  return { createRoot, importFolder, findSources, hasProgramData, IMPORT_RULES, MAX_IMPORT_BYTES };
});
