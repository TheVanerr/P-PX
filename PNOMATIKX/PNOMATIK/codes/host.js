/* PNOMATIKX tarayıcı katmanı: proje klasörüne erişim, P&IDX bağlantısı, kod eşleştirme listesi, dışa aktarım.
   Program tamamen tarayıcıda çalışır. Dosyalar, kullanıcının bir kez izin verdiği PNOMATIKX ana klasöründen
   File System Access API ile okunur ve yazılır (Chrome / Edge). P&IDX klasörü isteğe bağlıdır ve yalnız okunur:
   P&ID projeleri, çizimdeki kodlar, kod listesi ve makine kayıtları buradan gelir. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PidxHost = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const APP_ROOT = 'PNOMATIK';
  const CODES_DIR = `${APP_ROOT}/codes`;
  const ASSETS_ROOT = `${APP_ROOT}/assets`;
  const PROJECTS_ROOT = `${APP_ROOT}/projects`;
  const DATA_DIR = `${APP_ROOT}/data`;
  const MAPPING_FILE = `${DATA_DIR}/eslestirme.csv`;
  const SETTINGS_FILE = `${DATA_DIR}/ayarlar.json`;
  // P&IDX bağlı değilken kullanılan P&ID kod listesi kopyası
  const SNAPSHOT = {
    tr: `${DATA_DIR}/pid-kod.csv`,
    en: `${DATA_DIR}/pid-kod-en.csv`,
    de: `${DATA_DIR}/pid-kod-de.csv`,
    ml: `${DATA_DIR}/pid-kodlar.json`
  };

  // P&IDX klasöründe okunanlar
  const PID = {
    root: 'P&ID',
    projects: 'P&ID/projects',
    data: 'P&ID/data',
    kod: { tr: 'P&ID/data/kod.csv', en: 'P&ID/data/kod-en.csv', de: 'P&ID/data/kod-de.csv' },
    drawing: 'pid/cizim.json',
    meta: 'proje.json',
    machines: 'ML/kayitlar',
    codes: 'ML/kayitlar/kodlar.json'
  };

  const INPUT_FOLDERS = [
    { id: 'elektrik', label: 'Elektrik Projesi' },
    { id: 'plc', label: 'PLC Çıktısı' },
    { id: 'katalog', label: 'Valf ve Ürün Katalogları' }
  ];
  const OUTPUT_FOLDER = { id: 'pnomatik/cikti', label: 'Pnömatik Çıktıları' };
  const DRAWING_FILE = 'pnomatik/cizim.json';
  const META_FILE = 'proje.json';
  const EXPORT_SUFFIX = 'PNÖMATİK DİYAGRAM';

  /* ─── Metin ve ad yardımcıları ────────────────────────── */

  function sanitizeFileName(name) {
    return String(name || '')
      .trim()
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Windows sondaki nokta ve boşluğu kabul etmez; klasör ve proje adlarında temizlenir */
  function sanitizeName(name) {
    return String(name || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '');
  }

  function normalizeName(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function lower(text) {
    return String(text || '').trim().toLocaleLowerCase('tr');
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }


  /** a/../b biçimindeki yolları çözer; kök dışına çıkan yolu reddeder */
  function pathSegments(path) {
    const out = [];
    for (const seg of String(path || '').split(/[\\/]+/)) {
      if (!seg || seg === '.') continue;
      if (seg === '..') {
        if (!out.length) throw new Error('Geçersiz yol');
        out.pop();
      } else {
        out.push(seg);
      }
    }
    return out;
  }

  function decodeText(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
    } catch {
      return new TextDecoder('windows-1254').decode(bytes);
    }
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function imageDataUri(path, bytes) {
    const ext = path.split('.').pop().toLowerCase();
    const mime = ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext;
    return `data:image/${mime};base64,${bytesToBase64(bytes)}`;
  }

  function friendlyError(e) {
    switch (e && e.name) {
      // Chrome kilitli dosyada ikisinden birini verir; okuma tarafında da NotReadableError gelir
      case 'NoModificationAllowedError':
      case 'InvalidStateError':
      case 'NotReadableError':
        return 'Dosya başka bir programda açık, kapatıp tekrar deneyin';
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Klasör izni yok. Sayfayı yenileyip izin verin';
      case 'NotFoundError':
        return 'Dosya veya klasör bulunamadı';
      case 'QuotaExceededError':
        return 'Diskte yeterli yer yok';
      case 'TypeError':
        return /name/i.test(e.message) ? 'Bu ad dosya adı olarak kullanılamıyor' : e.message;
      default:
        return (e && e.message) || 'Bilinmeyen hata';
    }
  }

  /* ─── CSV ─────────────────────────────────────────────── */

  function detectCsvDelimiter(line) {
    const commaCount = (line.match(/,/g) || []).length;
    const semicolonCount = (line.match(/;/g) || []).length;
    return semicolonCount > commaCount ? ';' : ',';
  }

  function parseCsvLine(line, delimiter) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === delimiter && !inQuotes) {
        cells.push(current);
        current = '';
        continue;
      }
      current += ch;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
  }

  function parseCsvContent(text) {
    const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) return { headers: [], rows: [] };
    const delimiter = detectCsvDelimiter(lines[0]);
    const headers = parseCsvLine(lines[0], delimiter);
    const rows = lines.slice(1).map((line) => {
      const cells = parseCsvLine(line, delimiter);
      while (cells.length < headers.length) cells.push('');
      return cells.slice(0, headers.length);
    });
    return { headers, rows };
  }


  function deriveCategoryFromKod(kod) {
    const match = String(kod || '').match(/^([A-Za-z]+)/);
    return match ? match[1].toUpperCase() : '';
  }

  function parseKodLangCsv(text) {
    const { headers, rows } = parseCsvContent(text);
    if (!headers.length) return [];
    const isThreeColumn = headers.length >= 3;
    const result = [];
    for (const row of rows) {
      const kod = String(row[0] || '').trim();
      if (!kod) continue;
      result.push({
        kod,
        name: String(row[1] || '').trim() || kod,
        description: isThreeColumn ? String(row[2] || '').trim() : ''
      });
    }
    return result;
  }


  /** P&ID kataloğu + yalnız ML'de olan kodlar; aynı kodun farklı anlamları işaretlenir */
  function mergeCatalog(kodEntries, kodRows, mlCodes) {
    const names = new Map();
    const note = (kod, name) => {
      const key = String(kod || '').trim().toUpperCase();
      const clean = normalizeName(name);
      if (!key || !clean) return;
      if (!names.has(key)) names.set(key, []);
      const list = names.get(key);
      if (!list.some((n) => n.toLocaleLowerCase('tr') === clean.toLocaleLowerCase('tr'))) list.push(clean);
    };

    const entries = new Map();
    for (const e of kodEntries) {
      entries.set(e.id.toUpperCase(), {
        id: e.id.toUpperCase(),
        category: e.category,
        name: normalizeName(e.tr.componentName),
        en: normalizeName(e.en.componentName),
        de: normalizeName(e.de.componentName),
        description: e.tr.description,
        desc: { tr: e.tr.description, en: e.en.description, de: e.de.description },
        source: 'pid'
      });
    }
    for (const row of kodRows) note(row[0], row[1]);

    for (const code of mlCodes) {
      const id = String(code.kod || '').trim().toUpperCase();
      if (!id) continue;
      note(id, code.aciklama);
      if (!entries.has(id)) {
        const match = id.match(/^[A-Z]+/);
        entries.set(id, {
          id,
          category: match ? match[0] : '',
          name: normalizeName(code.aciklama),
          en: normalizeName(code.aciklama),
          de: normalizeName(code.aciklama),
          description: '',
          source: 'ml'
        });
      }
    }
    return [...entries.values()].map((e) => Object.assign(e, { ambiguous: names.get(e.id) || [] }));
  }


  /** Önce projedeki bağlantı, sonra seri no; aynı seri no birden çok kayıtta varsa müşteri ve modele bakılır */
  function findMachine(machines, meta) {
    if (!meta) return null;
    if (meta.makineId) {
      const linked = machines.find((m) => m.id === meta.makineId);
      if (linked) return linked;
    }
    const seri = lower(meta.seriNo);
    if (!seri) return null;
    const same = machines.filter((m) => lower(m.seriNo) === seri);
    if (same.length <= 1) return same[0] || null;
    return same.find((m) => lower(m.firma) === lower(meta.musteri) && lower(m.model) === lower(meta.model)) ||
      same.find((m) => lower(m.firma) === lower(meta.musteri)) ||
      null;
  }


  /** Bir P&ID çiziminde geçen kodlar: sembol kodları ve nota yazılmış ikinci kod (ör. V67 / not V68) */
  function drawingCodes(drawing) {
    const out = new Set();
    for (const sheet of (drawing && drawing.sheets) || []) {
      for (const it of sheet.items || []) {
        if (it.type !== 'symbol') continue;
        const tag = String(it.tag || '').trim().toUpperCase();
        if (tag) out.add(tag);
        for (const word of String(it.note || '').toUpperCase().split(/[^A-Z0-9]+/)) {
          if (/^[A-Z]{1,4}\d{2,3}$/.test(word)) out.add(word);
        }
      }
    }
    return [...out];
  }

  /* ─── Ortak dosya işlemleri ───────────────────────────── */

  function fileOps(rootDir) {
    const missing = (e) => e && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');

    async function dirAt(path, create) {
      let dir = rootDir;
      for (const seg of pathSegments(path)) {
        dir = await dir.getDirectoryHandle(seg, { create: !!create });
      }
      return dir;
    }

    async function tryDir(path) {
      try {
        return await dirAt(path);
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    }

    async function fileHandleAt(path, create) {
      const segs = pathSegments(path);
      const name = segs.pop();
      if (!name) throw new Error('Geçersiz yol');
      const dir = await dirAt(segs.join('/'), create);
      return dir.getFileHandle(name, { create: !!create });
    }

    async function tryFile(path) {
      try {
        return await (await fileHandleAt(path)).getFile();
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    }

    async function readText(path) {
      const file = await (await fileHandleAt(path)).getFile();
      return decodeText(new Uint8Array(await file.arrayBuffer()));
    }

    async function tryReadText(path) {
      const file = await tryFile(path);
      return file ? decodeText(await file.arrayBuffer()) : null;
    }

    async function entriesOf(dir) {
      const out = [];
      for await (const [name, handle] of dir.entries()) out.push({ name, kind: handle.kind, handle });
      return out;
    }

    return { dirAt, tryDir, fileHandleAt, tryFile, readText, tryReadText, entriesOf };
  }

  /** kod.csv (tr/en/de) satırlarını çok dilli katalog girdisine çevirir */
  function kodEntries(trText, enText, deText) {
    const trRows = parseKodLangCsv(trText || '');
    const enMap = new Map(parseKodLangCsv(enText || '').map((row) => [row.kod, row]));
    const deMap = new Map(parseKodLangCsv(deText || '').map((row) => [row.kod, row]));
    const entries = [];
    const seen = new Set();
    for (const tr of trRows) {
      if (seen.has(tr.kod)) continue;
      seen.add(tr.kod);
      const en = enMap.get(tr.kod);
      const de = deMap.get(tr.kod);
      entries.push({
        id: tr.kod,
        category: deriveCategoryFromKod(tr.kod),
        tr: { componentId: tr.kod, componentName: tr.name, description: tr.description },
        en: { componentId: tr.kod, componentName: (en && en.name) || tr.name, description: (en && en.description) || tr.description },
        de: {
          componentId: tr.kod,
          componentName: (de && de.name) || (en && en.name) || tr.name,
          description: (de && de.description) || (en && en.description) || tr.description
        }
      });
    }
    return entries;
  }

  function mlCodes(text) {
    if (!text) return [];
    try {
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : data.kodlar || [];
      return list.filter((k) => k && k.kod).map((k) => ({ kod: String(k.kod).trim(), aciklama: String(k.aciklama || '').trim() }));
    } catch {
      return [];
    }
  }

  function buildCatalogFrom(texts) {
    const entries = kodEntries(texts.tr, texts.en, texts.de);
    const rows = parseCsvContent(texts.tr || '').rows;
    return mergeCatalog(entries, rows, mlCodes(texts.ml));
  }

  /* ─── P&IDX: yalnız okunur ────────────────────────────── */

  /** pidDir: P&IDX ana klasörünün FileSystemDirectoryHandle'ı */
  function createPidReader(pidDir) {
    const io = fileOps(pidDir);

    function projectPath(id) {
      const name = String(id || '');
      if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('Geçersiz proje adı');
      return `${PID.projects}/${name}`;
    }

    async function readMachines() {
      const machines = [];
      const dir = await io.tryDir(PID.machines);
      if (!dir) return machines;
      for (const entry of await io.entriesOf(dir)) {
        if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json') || entry.name === 'kodlar.json') continue;
        try {
          const data = JSON.parse(decodeText(await (await entry.handle.getFile()).arrayBuffer()));
          if (!data || !data.seriNo) continue;
          machines.push(Object.assign({}, data, { id: data.id || entry.name, kodlar: Array.isArray(data.kodlar) ? data.kodlar : [], _file: entry.name }));
        } catch { /* bozuk kayıt P&IDX'te bildirilir */ }
      }
      return machines.sort((a, b) => String(a.seriNo).localeCompare(String(b.seriNo), 'tr', { numeric: true }));
    }

    async function readProjectMeta(id) {
      const text = await io.tryReadText(`${projectPath(id)}/${PID.meta}`);
      const [seriNo, musteri, ...rest] = String(id).split('-');
      const base = { seriNo: seriNo || '', musteri: musteri || '', model: rest.join('-') };
      if (text === null) return base;
      try {
        return Object.assign(base, JSON.parse(text));
      } catch {
        return base;
      }
    }

    async function readProject(id) {
      const base = projectPath(id);
      if (!(await io.tryDir(base))) return { ok: false, error: 'P&ID projesi bulunamadı' };
      const meta = await readProjectMeta(id);
      const text = await io.tryReadText(`${base}/${PID.drawing}`);
      let drawing = null;
      try {
        drawing = text === null ? null : JSON.parse(text);
      } catch { /* bozuk çizim: kodlar makine kaydından gelir */ }
      const machines = await readMachines();
      const machine = findMachine(machines, meta);
      const drawn = drawingCodes(drawing);
      const machineCodes = machine ? machine.kodlar.map((k) => String(k).trim().toUpperCase()) : [];
      return {
        ok: true,
        id,
        meta,
        drawingCodes: drawn,
        machine: machine ? { id: machine.id, seriNo: machine.seriNo, firma: machine.firma, model: machine.model } : null,
        machineCodes,
        codes: [...new Set(drawn.concat(machineCodes))]
      };
    }

    async function listProjects() {
      const dir = await io.tryDir(PID.projects);
      if (!dir) return { ok: true, projects: [] };
      const folders = (await io.entriesOf(dir)).filter((e) => e.kind === 'directory' && !e.name.startsWith('.'));
      const projects = [];
      for (const { name } of folders) {
        const res = await readProject(name);
        if (res.ok) projects.push(res);
      }
      return { ok: true, projects: projects.sort((a, b) => String(a.id).localeCompare(String(b.id), 'tr', { numeric: true })) };
    }

    async function catalog() {
      const tr = await io.tryReadText(PID.kod.tr);
      if (tr === null) return { ok: false, error: 'P&IDX klasöründe P&ID/data/kod.csv bulunamadı' };
      return {
        ok: true,
        source: 'pidx',
        entries: buildCatalogFrom({ tr, en: await io.tryReadText(PID.kod.en), de: await io.tryReadText(PID.kod.de), ml: await io.tryReadText(PID.codes) })
      };
    }

    return {
      name: pidDir.name,
      listProjects,
      readProject,
      machines: async () => ({ ok: true, machines: await readMachines() }),
      catalog
    };
  }

  /* ─── PNOMATIKX klasörü ───────────────────────────────── */

  /** rootDir: PNOMATIKX ana klasörünün FileSystemDirectoryHandle'ı */
  function createStore(rootDir) {
    const io = fileOps(rootDir);
    const { dirAt, tryDir, fileHandleAt, tryFile, tryReadText, entriesOf } = io;

    async function ensureWritable() {
      if (!rootDir.queryPermission) return;
      if ((await rootDir.queryPermission({ mode: 'readwrite' })) === 'granted') return;
      if ((await rootDir.requestPermission({ mode: 'readwrite' })) !== 'granted') {
        const err = new Error('Klasöre yazma izni verilmedi');
        err.name = 'NotAllowedError';
        throw err;
      }
    }

    /** createWritable geçici dosyaya yazar ve kapanınca taşır; yarım kalan yazma dosyayı bozmaz */
    async function writeFile(path, content) {
      await ensureWritable();
      const handle = await fileHandleAt(path, true);
      const writable = await handle.createWritable();
      try {
        await writable.write(content);
        await writable.close();
      } catch (e) {
        try { await writable.abort(); } catch { /* zaten kapanmış olabilir */ }
        throw e;
      }
    }

    /* ── Projeler ── */

    function projectPath(id) {
      const name = String(id || '');
      if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) throw new Error('Geçersiz proje adı');
      return `${PROJECTS_ROOT}/${name}`;
    }

    function defaultMeta(id) {
      const [seriNo, musteri, ...rest] = String(id).split('-');
      return {
        seriNo: seriNo || '',
        musteri: musteri || '',
        model: rest.join('-'),
        firma: 'DOLFIN',
        dil: 'tr',
        rev: '01',
        tarih: new Date().toISOString().slice(0, 10),
        hazirlayan: 'Fatih GÜRAL',
        kontrol: '',
        onay: '',
        revizyonlar: [],
        pidProje: '',
        pidEtiket: true
      };
    }

    async function readMeta(id) {
      const base = defaultMeta(id);
      const text = await tryReadText(`${projectPath(id)}/${META_FILE}`);
      if (text === null) return base;
      try {
        return Object.assign(base, JSON.parse(text));
      } catch {
        return base;
      }
    }

    async function listFiles(id, sub) {
      const dir = await tryDir(`${projectPath(id)}/${sub}`);
      if (!dir) return [];
      const files = [];
      for (const entry of await entriesOf(dir)) {
        if (entry.kind !== 'file' || entry.name.startsWith('.') || entry.name.endsWith('.crswap')) continue;
        const file = await entry.handle.getFile();
        files.push({ name: entry.name, rel: `${sub}/${entry.name}`, size: file.size, mtime: file.lastModified });
      }
      return files.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }

    async function fileGroups(id) {
      return Promise.all([...INPUT_FOLDERS, OUTPUT_FOLDER].map(async (g) => ({
        id: g.id,
        label: g.label,
        files: await listFiles(id, g.id)
      })));
    }

    async function listProjects() {
      const projectsDir = await dirAt(PROJECTS_ROOT, true);
      const folders = (await entriesOf(projectsDir)).filter((e) => e.kind === 'directory' && !e.name.startsWith('.'));
      const projects = await Promise.all(folders.map(async ({ name }) => {
        const base = projectPath(name);
        const metaFile = await tryFile(`${base}/${META_FILE}`);
        let updatedAt = metaFile ? metaFile.lastModified : 0;
        let sheets = 0;
        let items = 0;
        let links = 0;
        const drawingFile = await tryFile(`${base}/${DRAWING_FILE}`);
        if (drawingFile) {
          updatedAt = drawingFile.lastModified;
          try {
            const drawing = JSON.parse(decodeText(await drawingFile.arrayBuffer()));
            sheets = drawing.sheets.length;
            items = drawing.sheets.reduce((sum, sheet) => sum + sheet.items.length, 0);
            const pids = new Set();
            for (const sheet of drawing.sheets) {
              for (const it of sheet.items) {
                if (it.pid) pids.add(String(it.pid).toUpperCase());
                for (const c of it.coils || []) if (c.pid) pids.add(String(c.pid).toUpperCase());
                for (const s of it.sensors || []) if (s.pid) pids.add(String(s.pid).toUpperCase());
              }
            }
            links = pids.size;
          } catch { /* bozuk dosya açılırken ayrıca bildirilir */ }
        }
        const meta = await readMeta(name);
        const inputs = await Promise.all(INPUT_FOLDERS.map(async (g) => ({
          id: g.id,
          label: g.label,
          count: (await listFiles(name, g.id)).length
        })));
        return { id: name, meta, sheets, items, links, updatedAt, inputs };
      }));
      return { ok: true, projects: projects.sort((a, b) => b.updatedAt - a.updatedAt) };
    }

    async function createProject(input) {
      const seriNo = sanitizeName(input && input.seriNo);
      const musteri = sanitizeName(input && input.musteri);
      const model = sanitizeName(input && input.model);
      if (!seriNo || !musteri || !model) return { ok: false, error: 'Seri no, müşteri ve model gerekli' };
      const id = `${seriNo}-${musteri}-${model}`;
      const base = projectPath(id);
      if (await tryDir(base)) return { ok: false, error: 'Bu proje zaten var' };
      await ensureWritable();
      for (const g of [...INPUT_FOLDERS, OUTPUT_FOLDER]) {
        await dirAt(`${base}/${g.id}`, true);
        try {
          await writeFile(`${base}/${g.id}/.gitkeep`, '');
        } catch { /* .gitkeep yalnız boş klasörü git'te tutar, çalışmayı etkilemez */ }
      }
      const meta = Object.assign(defaultMeta(id), { seriNo, musteri, model });
      for (const key of ['pidProje', 'firma', 'dil', 'hazirlayan']) {
        if (input[key]) meta[key] = String(input[key]);
      }
      await writeFile(`${base}/${META_FILE}`, `${JSON.stringify(meta, null, 2)}\n`);
      return { ok: true, id };
    }

    async function readProject(id) {
      const base = projectPath(id);
      if (!(await tryDir(base))) return { ok: false, error: 'Proje bulunamadı' };
      const meta = await readMeta(id);
      const drawingText = await tryReadText(`${base}/${DRAWING_FILE}`);
      return {
        ok: true,
        id,
        meta,
        drawing: drawingText === null ? null : JSON.parse(drawingText),
        files: await fileGroups(id)
      };
    }

    async function saveProject(payload) {
      const base = projectPath(payload && payload.id);
      if (!(await tryDir(base))) return { ok: false, error: 'Proje bulunamadı' };
      await writeFile(`${base}/${DRAWING_FILE}`, `${JSON.stringify(payload.drawing, null, 1)}\n`);
      if (payload.meta) await writeFile(`${base}/${META_FILE}`, `${JSON.stringify(payload.meta, null, 2)}\n`);
      return { ok: true, savedAt: Date.now() };
    }

    /** Tüm projelerde geçerli seçimler (örneğin kapak tasarımı) */
    async function readSettings() {
      const text = await tryReadText(SETTINGS_FILE);
      if (text === null) return { ok: true, settings: {} };
      try {
        const settings = JSON.parse(text);
        return { ok: true, settings: settings && typeof settings === 'object' ? settings : {} };
      } catch {
        return { ok: true, settings: {} };
      }
    }

    async function saveSettings(patch) {
      const { settings } = await readSettings();
      const merged = Object.assign({}, settings, patch);
      await writeFile(SETTINGS_FILE, `${JSON.stringify(merged, null, 2)}\n`);
      return { ok: true, settings: merged };
    }

    /** P&IDX bağlı değilken kullanılan P&ID kod listesi kopyası */
    async function snapshotCatalog() {
      const tr = await tryReadText(SNAPSHOT.tr);
      if (tr === null) return { ok: true, source: 'none', entries: [] };
      return {
        ok: true,
        source: 'snapshot',
        entries: buildCatalogFrom({ tr, en: await tryReadText(SNAPSHOT.en), de: await tryReadText(SNAPSHOT.de), ml: await tryReadText(SNAPSHOT.ml) })
      };
    }

    async function readMapping() {
      const text = await tryReadText(MAPPING_FILE);
      return { ok: true, text: text || '', path: MAPPING_FILE };
    }

    async function saveMapping(text) {
      await writeFile(MAPPING_FILE, text);
      return { ok: true };
    }

    async function asset(rel) {
      const segs = pathSegments(`${CODES_DIR}/${rel}`);
      const path = segs.join('/');
      if (!path.startsWith(`${ASSETS_ROOT}/`)) return { ok: false };
      const file = await tryFile(path);
      if (!file) return { ok: false };
      return { ok: true, uri: imageDataUri(path, new Uint8Array(await file.arrayBuffer())) };
    }

    /** Görsel olmayan program dosyası (yazı tipi): ham içerik */
    async function assetBytes(rel) {
      const path = pathSegments(`${CODES_DIR}/${rel}`).join('/');
      if (!path.startsWith(`${ASSETS_ROOT}/`)) return { ok: false };
      const file = await tryFile(path);
      if (!file) return { ok: false };
      return { ok: true, bytes: new Uint8Array(await file.arrayBuffer()) };
    }

    return {
      name: rootDir.name,
      dirAt,
      fileHandleAt,
      tryReadText,
      projectPath,
      engine: {
        listProjects,
        createProject,
        readProject,
        saveProject,
        listFiles: async (id) => ({ ok: true, files: await fileGroups(id) }),
        snapshotCatalog,
        readMapping,
        saveMapping,
        asset,
        assetBytes,
        readSettings,
        saveSettings
      }
    };
  }

  /* ─── Node testleri için dışa açılanlar ───────────────── */

  const shared = {
    EXPORT_SUFFIX,
    PID,
    createStore,
    createPidReader,
    decodeText,
    drawingCodes,
    findMachine,
    friendlyError,
    mergeCatalog,
    parseCsvContent,
    pathSegments,
    sanitizeName
  };

  if (typeof window === 'undefined') return shared;

  /* ─── Tarayıcı: klasör bağlantıları ───────────────────── */

  const DB_NAME = 'pnomatikx-host';
  const DB_STORE = 'handles';
  const DB_KEY = 'root';
  const DB_PID = 'pidx';
  const GATE_ID = 'pnxGate';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      if (value === undefined) tx.objectStore(DB_STORE).delete(key);
      else tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function hasPath(handle, segs) {
    try {
      let dir = handle;
      for (const seg of segs) dir = await dir.getDirectoryHandle(seg);
      return true;
    } catch {
      return false;
    }
  }
  const isAppRoot = (handle) => hasPath(handle, [APP_ROOT, 'data']);
  const isPidRoot = (handle) => hasPath(handle, ['P&ID', 'data']);

  const GATE_CSS = `
    #${GATE_ID} { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
      background: #14161b; color: #e8eaef; font: 14px/1.45 'Segoe UI', system-ui, sans-serif; }
    #${GATE_ID} .gate-box { width: 500px; max-width: calc(100vw - 32px); background: #1b1e25; border-top: 3px solid #ff0000;
      border-radius: 8px; padding: 26px 28px; box-shadow: 0 20px 50px rgba(0,0,0,.6); }
    #${GATE_ID} h1 { margin: 0 0 10px; font-size: 18px; font-weight: 600; }
    #${GATE_ID} p { margin: 0 0 12px; color: #c6cbd5; }
    #${GATE_ID} .gate-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
    #${GATE_ID} button { font: inherit; color: #e8eaef; background: #2b3039; border: 1px solid #2f343e; border-radius: 6px;
      padding: 9px 16px; cursor: pointer; }
    #${GATE_ID} button:hover { background: #363c47; }
    #${GATE_ID} button.primary { background: #d40000; border-color: #d40000; color: #fff; font-weight: 600; }
    #${GATE_ID} button.primary:hover { background: #ff0000; border-color: #ff0000; }
    #${GATE_ID} .gate-error { color: #ff8585; margin: 14px 0 0; }
    #${GATE_ID} code { background: #23272f; padding: 1px 6px; border-radius: 4px; }
    @media print { #${GATE_ID} { display: none !important; } }
  `;

  function gateElement(html) {
    let gate = document.getElementById(GATE_ID);
    if (!gate) {
      const style = document.createElement('style');
      style.textContent = GATE_CSS;
      document.head.appendChild(style);
      gate = document.createElement('div');
      gate.id = GATE_ID;
      document.body.appendChild(gate);
    }
    gate.innerHTML = `<div class="gate-box">${html}</div>`;
    return gate;
  }

  function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showUnsupportedGate() {
    gateElement(`
      <h1>Chrome veya Edge gerekli</h1>
      <p>Program, proje dosyalarını doğrudan bilgisayarındaki klasöre kaydeder. Bu tarayıcı klasör erişimini desteklemiyor.</p>
      <p>Bu sayfayı Google Chrome veya Microsoft Edge ile açın.</p>`);
  }

  /** Kullanıcı tıklamadan izin istenemez; bu yüzden izin her zaman bir düğmeyle alınır */
  function waitForFolder(saved) {
    return new Promise((resolve) => {
      const nameHtml = saved ? escapeHtml(saved.name) : '';
      const gate = gateElement(`
        <h1>${saved ? 'Klasör izni gerekiyor' : 'PNOMATIKX klasörünü bağla'}</h1>
        <p>Pnömatik projeleri ve kod eşleştirme listesi bilgisayarındaki klasörde durur. Tarayıcının bu klasörde okuyup yazmasına izin vermen gerekiyor.</p>
        ${saved
          ? `<p>Bağlı klasör: <code>${nameHtml}</code></p>`
          : '<p>Açılan pencerede <code>index.html</code> dosyasının bulunduğu ana klasörü (<code>PNOMATIKX</code>) seç.</p>'}
        <div class="gate-actions">
          ${saved ? `<button type="button" class="primary" data-gate="resume">${nameHtml} ile devam et</button>` : ''}
          <button type="button" class="${saved ? '' : 'primary'}" data-gate="pick">${saved ? 'Başka klasör seç' : 'Klasörü seç'}</button>
        </div>
        <p class="gate-error" hidden></p>`);
      const errorEl = gate.querySelector('.gate-error');
      const fail = (message) => {
        errorEl.textContent = message;
        errorEl.hidden = false;
      };
      const accept = (handle) => {
        gate.remove();
        resolve(handle);
      };

      gate.addEventListener('click', async (e) => {
        const action = e.target.dataset && e.target.dataset.gate;
        if (!action) return;
        try {
          if (action === 'resume') {
            if ((await saved.requestPermission({ mode: 'readwrite' })) !== 'granted') {
              fail('İzin verilmedi. Program bu klasör olmadan çalışamaz.');
              return;
            }
            if (!(await isAppRoot(saved))) {
              fail(`"${saved.name}" klasöründe ${APP_ROOT}/data bulunamadı. Klasör taşınmış olabilir, yeniden seçin.`);
              return;
            }
            accept(saved);
          } else {
            const handle = await window.showDirectoryPicker({ id: 'pnomatikx-root', mode: 'readwrite' });
            if (!(await isAppRoot(handle))) {
              fail(`"${handle.name}" klasöründe ${APP_ROOT}/data bulunamadı. index.html dosyasının bulunduğu ana klasörü seçin.`);
              return;
            }
            accept(handle);
          }
        } catch (err) {
          if (err.name !== 'AbortError') fail(friendlyError(err));
        }
      });
    });
  }

  let store = null;
  let readyPromise = null;
  let pidHandle = null;
  let pidReader = null;

  /** Önizleme dosyası (tools/onizleme.js) klasör yerine tarayıcı belleğinde hazır klasörler verir */
  const preview = () => window.__PNX_PREVIEW || null;

  async function connect() {
    // Ortak veritabanı (P&PX): iki program aynı kökü görür, P&ID verisi bağlantı istemeden okunur
    if (window.__PPX) {
      const shared = await window.__PPX.ready();
      store = createStore(shared);
      pidHandle = shared;
      pidReader = createPidReader(shared);
      return store;
    }
    if (preview()) {
      store = createStore(preview().root);
      pidHandle = preview().pid || null;
      pidReader = pidHandle ? createPidReader(pidHandle) : null;
      return store;
    }
    if (typeof window.showDirectoryPicker !== 'function') {
      showUnsupportedGate();
      return new Promise(() => {});
    }
    let saved = null;
    try {
      saved = (await dbGet(DB_KEY)) || null;
    } catch { /* saklanan bağlantı yoksa yeniden sorulur */ }
    let handle = null;
    if (saved) {
      try {
        if ((await saved.queryPermission({ mode: 'readwrite' })) === 'granted' && (await isAppRoot(saved))) handle = saved;
      } catch { /* klasör silinmiş olabilir */ }
    }
    if (!handle) handle = await waitForFolder(saved);
    try {
      await dbSet(DB_KEY, handle);
    } catch { /* saklanamazsa bir sonraki açılışta yeniden sorulur */ }
    store = createStore(handle);
    try {
      pidHandle = (await dbGet(DB_PID)) || null;
    } catch { /* P&IDX bağlantısı isteğe bağlıdır */ }
    if (pidHandle) {
      try {
        if ((await pidHandle.queryPermission({ mode: 'read' })) === 'granted') pidReader = createPidReader(pidHandle);
      } catch {
        pidReader = null;
      }
    }
    return store;
  }

  function ready() {
    if (!readyPromise) readyPromise = connect();
    return readyPromise;
  }

  async function changeFolder() {
    if (window.__PPX) return { ok: false, error: 'Veriler ortak veritabanında; klasör değiştirilemez' };
    if (preview()) return { ok: false, error: 'Önizlemede klasör değiştirilemez. Kendi klasörünüzle çalışmak için index.html dosyasını açın.' };
    try {
      const handle = await window.showDirectoryPicker({ id: 'pnomatikx-root', mode: 'readwrite' });
      if (!(await isAppRoot(handle))) {
        return { ok: false, error: `"${handle.name}" klasöründe ${APP_ROOT}/data bulunamadı` };
      }
      await dbSet(DB_KEY, handle);
      return { ok: true };
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, canceled: true };
      return { ok: false, error: friendlyError(e) };
    }
  }

  /* ─── P&IDX bağlantısı ────────────────────────────────── */

  /** linked: klasör seçilmiş; granted: bu oturumda okuma izni var */
  function pidStatus() {
    return { linked: !!pidHandle, granted: !!pidReader, name: pidHandle ? pidHandle.name : '' };
  }

  /** Düğmeyle çağrılır: P&IDX ana klasörünü seçtirir */
  async function linkPid() {
    try {
      const handle = await window.showDirectoryPicker({ id: 'pidx-root', mode: 'read' });
      if (!(await isPidRoot(handle))) {
        return { ok: false, error: `"${handle.name}" klasöründe P&ID/data bulunamadı. P&IDX ana klasörünü seçin.` };
      }
      pidHandle = handle;
      pidReader = createPidReader(handle);
      try {
        await dbSet(DB_PID, handle);
      } catch { /* saklanamazsa bir sonraki açılışta yeniden sorulur */ }
      return { ok: true, status: pidStatus() };
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, canceled: true };
      return { ok: false, error: friendlyError(e) };
    }
  }

  /** Düğmeyle çağrılır: kayıtlı P&IDX klasörü için bu oturumda okuma izni ister */
  async function grantPid() {
    if (!pidHandle) return linkPid();
    try {
      if ((await pidHandle.requestPermission({ mode: 'read' })) !== 'granted') return { ok: false, error: 'P&IDX klasörüne izin verilmedi' };
      if (!(await isPidRoot(pidHandle))) return { ok: false, error: `"${pidHandle.name}" klasöründe P&ID/data bulunamadı, yeniden seçin` };
      pidReader = createPidReader(pidHandle);
      return { ok: true, status: pidStatus() };
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  async function unlinkPid() {
    pidHandle = null;
    pidReader = null;
    try {
      await dbSet(DB_PID, undefined);
    } catch { /* hafıza kapalıysa bağlantı oturumla biter */ }
    return { ok: true, status: pidStatus() };
  }

  function pidCall(pick) {
    return async (...args) => {
      try {
        await ready();
        if (!pidReader) return { ok: false, error: 'P&IDX klasörü bağlı değil', unlinked: true };
        return await pick(pidReader)(...args);
      } catch (e) {
        return { ok: false, error: friendlyError(e) };
      }
    };
  }

  /** P&ID kod listesi: bağlı P&IDX'ten canlı, yoksa PNOMATIK/data kopyasından */
  async function catalog() {
    try {
      const s = await ready();
      if (pidReader) {
        const live = await pidReader.catalog();
        if (live.ok) return live;
      }
      return await s.engine.snapshotCatalog();
    } catch (e) {
      return { ok: false, error: friendlyError(e) };
    }
  }

  /* ─── Tarayıcı: dışa aktarım ──────────────────────────── */

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }

  /** Kayıt penceresi; tıklamanın üzerinden çok geçtiyse tarayıcı izin vermez, o zaman indirilir */
  async function saveAs({ name, data, mime, ext, description, startIn }) {
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const options = { suggestedName: name, types: [{ description, accept: { [mime]: [`.${ext}`] } }] };
        if (startIn) options.startIn = startIn;
        const handle = await window.showSaveFilePicker(options);
        const writable = await handle.createWritable();
        await writable.write(data);
        await writable.close();
        return { ok: true, filePath: handle.name };
      } catch (e) {
        if (e.name === 'AbortError') return { ok: false, canceled: true };
        if (e.name !== 'SecurityError' && e.name !== 'NotAllowedError') throw e;
      }
    }
    downloadBlob(new Blob([data], { type: mime }), name);
    return { ok: true, filePath: name, downloaded: true };
  }

  /** Görseller hazır olana kadar bekler; sekme arka plandaysa çözme hiç bitmeyebilir, bu yüzden süre sınırı var */
  function imagesDecoded(root) {
    const images = root === document ? Array.from(document.images) : Array.from(root.querySelectorAll('img'));
    const decoded = Promise.all(images.map((img) => (img.decode ? img.decode().catch(() => {}) : null)));
    return Promise.race([decoded, new Promise((resolve) => setTimeout(resolve, 3000))]);
  }

  /** Düzenin oturması için iki kare bekler; arka plan sekmesinde kare gelmezse süre dolunca devam eder */
  function nextPaint() {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, 500);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      }));
    });
  }

  /** Yazdırma penceresi; Chrome bu başlığı önerilen PDF dosya adı olarak kullanır */
  async function printDocument(title) {
    await imagesDecoded(document);
    const previous = document.title;
    document.title = title;
    try {
      window.print();
    } finally {
      document.title = previous;
    }
  }

  const VIEWABLE = {
    pdf: 'application/pdf',
    txt: 'text/plain;charset=utf-8',
    csv: 'text/plain;charset=utf-8',
    json: 'text/plain;charset=utf-8',
    log: 'text/plain;charset=utf-8'
  };
  const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

  /** Tarayıcı dış program başlatamaz: görüntülenebilenler yeni sekmede açılır, diğerleri indirilir */
  async function openFile(payload) {
    const s = await ready();
    const path = `${s.projectPath(payload && payload.id)}/${pathSegments(payload && payload.rel).join('/')}`;
    const file = await (await s.fileHandleAt(path)).getFile();
    const ext = file.name.split('.').pop().toLowerCase();

    if (IMAGE_EXT.has(ext)) {
      const type = ext === 'svg' ? 'image/svg+xml' : file.type;
      const url = URL.createObjectURL(new Blob([file], { type }));
      const win = window.open('', '_blank');
      if (!win) return { ok: false, error: 'Tarayıcı yeni sekmeyi engelledi' };
      win.document.title = file.name;
      win.document.body.style.cssText = 'margin:0;background:#fff';
      const img = win.document.createElement('img');
      img.src = url;
      img.alt = file.name;
      img.style.cssText = 'display:block;max-width:100%;height:auto;margin:auto';
      win.document.body.appendChild(img);
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return { ok: true };
    }
    if (VIEWABLE[ext]) {
      const url = URL.createObjectURL(new Blob([file], { type: VIEWABLE[ext] }));
      const win = window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return win ? { ok: true } : { ok: false, error: 'Tarayıcı yeni sekmeyi engelledi' };
    }
    downloadBlob(file, file.name);
    return { ok: true, downloaded: true };
  }

  /* ─── Dışa açılan arayüz ──────────────────────────────── */

  /** Çağrılar bağlantıyı bekler; hatalar { ok:false, error } olarak döner */
  function bound(pick) {
    return async (...args) => {
      try {
        const s = await ready();
        return await pick(s)(...args);
      } catch (e) {
        return { ok: false, error: friendlyError(e) };
      }
    };
  }

  const engine = {
    listProjects: bound((s) => s.engine.listProjects),
    createProject: bound((s) => s.engine.createProject),
    readProject: bound((s) => s.engine.readProject),
    saveProject: bound((s) => s.engine.saveProject),
    listFiles: bound((s) => s.engine.listFiles),
    catalog,
    readMapping: bound((s) => s.engine.readMapping),
    saveMapping: bound((s) => s.engine.saveMapping),
    asset: bound((s) => s.engine.asset),
    assetBytes: bound((s) => s.engine.assetBytes),
    readSettings: bound((s) => s.engine.readSettings),
    saveSettings: bound((s) => s.engine.saveSettings),
    openFile: bound(() => openFile),
    /** Hazır PDF doğrudan indirilir; içeriği olmayan çağrı (tek dosyalık önizleme) yazdırma penceresine gider */
    exportPdf: bound(() => async (payload) => {
      if (payload && payload.bytes) {
        const name = `${sanitizeName(payload.fileName) || 'pnomatik'} ${payload.suffix || EXPORT_SUFFIX}.pdf`;
        downloadBlob(new Blob([payload.bytes], { type: 'application/pdf' }), name);
        return { ok: true, filePath: name, downloaded: true };
      }
      await printDocument(`${sanitizeName(payload && payload.fileName) || 'pnomatik'} ${(payload && payload.suffix) || EXPORT_SUFFIX}`);
      return { ok: true };
    }),
    exportSvg: bound((s) => async (payload) => {
      const startIn = payload && payload.id ? await s.dirAt(`${s.projectPath(payload.id)}/${OUTPUT_FOLDER.id}`, true) : undefined;
      return saveAs({
        name: `${sanitizeName(payload && payload.fileName) || 'pnomatik'}.svg`,
        data: payload.svg,
        mime: 'image/svg+xml',
        ext: 'svg',
        description: 'SVG',
        startIn
      });
    }),
    exportCsv: async (payload) => {
      try {
        return await saveAs({ name: payload.name, data: payload.text, mime: 'text/csv', ext: 'csv', description: 'CSV' });
      } catch (e) {
        return { ok: false, error: friendlyError(e) };
      }
    }
  };

  const pid = {
    status: pidStatus,
    link: linkPid,
    grant: grantPid,
    unlink: unlinkPid,
    listProjects: pidCall((r) => r.listProjects),
    readProject: pidCall((r) => r.readProject),
    machines: pidCall((r) => r.machines)
  };

  return Object.assign(shared, {
    ready,
    get preview() { return !!preview(); },
    // Yayınlanan önizleme yazdıramaz ve dosya indiremez
    get noPrint() { return !!(preview() && preview().noPrint); },
    rootName: () => (store ? store.name : ''),
    changeFolder,
    downloadBlob,
    imagesDecoded,
    nextPaint,
    engine,
    pid
  });
});
