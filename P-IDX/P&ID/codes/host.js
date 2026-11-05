/* P&IDX tarayıcı katmanı: proje klasörüne erişim, katalog, makine kayıtları, dışa aktarım.
   Program tamamen tarayıcıda çalışır. Dosyalar, kullanıcının bir kez izin verdiği P&IDX
   ana klasöründen File System Access API ile okunur ve yazılır (Chrome / Edge). */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PidxHost = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PID_ROOT = 'P&ID';
  const CODES_DIR = `${PID_ROOT}/codes`;
  const ASSETS_ROOT = `${PID_ROOT}/assets`;
  const DRAWINGS_ROOT = `${PID_ROOT}/drawings`;
  const PROJECTS_ROOT = `${PID_ROOT}/projects`;
  const DATA_DIR = `${PID_ROOT}/data`;
  const KAYITLAR_DIR = 'ML/kayitlar';
  const KODLAR_FILE = `${KAYITLAR_DIR}/kodlar.json`;
  const KOD_LISTESI_CSV = 'ML/KODListesi.csv';
  const ETIKET_SABLONU = 'ML/MAKİNE ETİKETLEME.xlsx';

  const KOD_CSV = { tr: `${DATA_DIR}/kod.csv`, en: `${DATA_DIR}/kod-en.csv`, de: `${DATA_DIR}/kod-de.csv` };
  const SAFETY_CSV = { tr: `${DATA_DIR}/guvenlik.csv`, en: `${DATA_DIR}/safety.csv`, de: `${DATA_DIR}/safety-de.csv` };

  const INPUT_FOLDERS = [
    { id: 'elektrik', label: 'Elektrik Projesi' },
    { id: 'layout', label: 'Layout' },
    { id: 'plc', label: 'PLC Çıktısı' },
    { id: 'step', label: 'STEP' }
  ];
  const OUTPUT_FOLDER = { id: 'pid/cikti', label: 'P&ID Çıktıları' };
  const DRAWING_FILE = 'pid/cizim.json';
  const META_FILE = 'proje.json';
  const SETTINGS_FILE = `${DATA_DIR}/ayarlar.json`;
  const EXPORT_SUFFIX = 'P&ID DIAGRAM';

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

  function safeMachineFileName(seriNo) {
    const base = String(seriNo).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${base.toLowerCase() === 'kodlar' ? `${base}_makine` : base}.json`;
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

  /** ML kod listesi CSV'si: KOD;AÇIKLAMA, açıklamada ';' geçebilir */
  function parseCodeCsv(text) {
    const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
    const result = [];
    lines.forEach((line, i) => {
      const parts = line.split(';');
      if (parts.length < 2) return;
      const kod = parts[0].trim();
      if (!kod || (i === 0 && /^kod$/i.test(kod))) return;
      result.push({ kod: kod.toUpperCase(), aciklama: parts.slice(1).join(';').trim() });
    });
    return result;
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

  function parseSafetyLangCsv(text) {
    const { headers, rows } = parseCsvContent(text);
    if (!headers.length) return [];
    const isFourColumn = headers.length >= 4;
    const result = [];
    for (const row of rows) {
      const kod = String(row[0] || '').trim();
      if (!kod) continue;
      result.push({
        kod,
        trigger: String(row[1] || '').trim() || kod,
        locked: isFourColumn ? String(row[2] || '').trim() : '',
        logic: isFourColumn ? String(row[3] || '').trim() : String(row[2] || '').trim()
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
        untranslated: e.untranslated || [],
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
          untranslated: ['en', 'de'],
          source: 'ml'
        });
      }
    }
    return [...entries.values()].map((e) => Object.assign(e, { ambiguous: names.get(e.id) || [] }));
  }

  /* ─── Makine kaydı eşleştirme ─────────────────────────── */

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

  function sameMachineContent(a, b) {
    return lower(a.seriNo) === lower(b.seriNo) && lower(a.firma) === lower(b.firma) && lower(a.model) === lower(b.model) &&
      JSON.stringify([...(a.kodlar || [])].sort()) === JSON.stringify([...(b.kodlar || [])].sort());
  }

  /** Eski ML uygulamasının tarayıcı hafızasında kalıp klasöre yazılmamış kayıtlar */
  function legacyDiff(legacy, current) {
    const key = (k) => `${k.kod}\u0000${k.aciklama}`;
    const have = new Set(current.codes.map(key));
    const codes = [];
    for (const k of legacy.kodlar || []) {
      if (!k || !k.kod || have.has(key(k))) continue;
      have.add(key(k));
      codes.push({ kod: String(k.kod), aciklama: String(k.aciklama || '') });
    }
    const machines = (legacy.makineler || []).filter((m) => {
      if (!m || !m.seriNo) return false;
      const same = current.machines.find((x) => x.id === m.id);
      if (same) return String(m.updatedAt || '') > String(same.updatedAt || '') && !sameMachineContent(m, same);
      return !current.machines.some((x) => sameMachineContent(x, m) ||
        (lower(x.seriNo) === lower(m.seriNo) && lower(x.firma) === lower(m.firma) && lower(x.model) === lower(m.model)));
    });
    return { codes, machines };
  }

  /* ─── Klasör üzerindeki işlemler ──────────────────────── */

  /** rootDir: P&IDX ana klasörünün FileSystemDirectoryHandle'ı */
  function createStore(rootDir) {
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

    async function exists(path) {
      if (await tryFile(path)) return true;
      return !!(await tryDir(path));
    }

    async function readBytes(path) {
      const file = await (await fileHandleAt(path)).getFile();
      return new Uint8Array(await file.arrayBuffer());
    }

    async function readText(path) {
      return decodeText(await readBytes(path));
    }

    async function tryReadText(path) {
      const file = await tryFile(path);
      return file ? decodeText(await file.arrayBuffer()) : null;
    }

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

    async function removeFile(path) {
      await ensureWritable();
      const segs = pathSegments(path);
      const name = segs.pop();
      const dir = await dirAt(segs.join('/'));
      await dir.removeEntry(name);
    }

    async function entriesOf(dir) {
      const out = [];
      for await (const [name, handle] of dir.entries()) out.push({ name, kind: handle.kind, handle });
      return out;
    }

    /* ── Katalog ── */

    async function loadKodCatalog() {
      const trText = await tryReadText(KOD_CSV.tr);
      if (trText === null) return { ok: false, error: `kod.csv bulunamadı: ${KOD_CSV.tr}` };
      const trRows = parseKodLangCsv(trText);
      if (!trRows.length) return { ok: false, error: 'kod.csv dosyasında geçerli satır bulunamadı' };
      const enMap = new Map(parseKodLangCsv((await tryReadText(KOD_CSV.en)) || '').map((row) => [row.kod, row]));
      const deMap = new Map(parseKodLangCsv((await tryReadText(KOD_CSV.de)) || '').map((row) => [row.kod, row]));
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
          en: { componentId: tr.kod, componentName: en?.name || tr.name, description: en?.description || tr.description },
          de: {
            componentId: tr.kod,
            componentName: de?.name || en?.name || tr.name,
            description: de?.description || en?.description || tr.description
          },
          // kod-en.csv / kod-de.csv içinde adı olmayan diller: belgede Türkçe çıkar
          untranslated: [[en, 'en'], [de, 'de']].filter(([row]) => !row || !String(row.name || '').trim()).map(([, lang]) => lang)
        });
      }
      return { ok: true, entries, path: KOD_CSV.tr };
    }

    async function loadSafetyCatalog() {
      const trText = await tryReadText(SAFETY_CSV.tr);
      if (trText === null) return { ok: false, error: `guvenlik.csv bulunamadı: ${SAFETY_CSV.tr}` };
      const trRows = parseSafetyLangCsv(trText);
      if (!trRows.length) return { ok: false, error: 'guvenlik.csv dosyasında geçerli satır bulunamadı' };
      const enMap = new Map(parseSafetyLangCsv((await tryReadText(SAFETY_CSV.en)) || '').map((row) => [row.kod, row]));
      const deMap = new Map(parseSafetyLangCsv((await tryReadText(SAFETY_CSV.de)) || '').map((row) => [row.kod, row]));
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
          tr: { interlockId: tr.kod, triggerSensor: tr.trigger, lockedEquipment: tr.locked, logic: tr.logic },
          en: {
            interlockId: tr.kod,
            triggerSensor: en?.trigger || tr.trigger,
            lockedEquipment: en?.locked || tr.locked,
            logic: en?.logic || tr.logic
          },
          de: {
            interlockId: tr.kod,
            triggerSensor: de?.trigger || en?.trigger || tr.trigger,
            lockedEquipment: de?.locked || en?.locked || tr.locked,
            logic: de?.logic || en?.logic || tr.logic
          }
        });
      }
      return { ok: true, entries, path: SAFETY_CSV.tr };
    }

    /* ── Makine kayıtları ve kod listesi (ML) ── */

    /** Kod listesinin asıl kaynağı kodlar.json; yoksa KODListesi.csv'den başlanır */
    async function readCodes() {
      const json = await tryReadText(KODLAR_FILE);
      if (json !== null) {
        const data = JSON.parse(json);
        const list = Array.isArray(data) ? data : data.kodlar || [];
        return {
          codes: list.filter((k) => k && k.kod).map((k) => ({ kod: String(k.kod).trim(), aciklama: String(k.aciklama || '').trim() })),
          source: 'kodlar.json'
        };
      }
      const csv = await tryReadText(KOD_LISTESI_CSV);
      return csv === null ? { codes: [], source: null } : { codes: parseCodeCsv(csv), source: 'KODListesi.csv' };
    }

    async function readMachines() {
      const machines = [];
      const skipped = [];
      const dir = await tryDir(KAYITLAR_DIR);
      if (!dir) return { machines, skipped };
      for (const entry of await entriesOf(dir)) {
        if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.json') || entry.name === 'kodlar.json') continue;
        try {
          const data = JSON.parse(decodeText(await (await entry.handle.getFile()).arrayBuffer()));
          if (!data || !data.seriNo) {
            skipped.push(entry.name);
            continue;
          }
          machines.push(Object.assign({}, data, {
            id: data.id || entry.name,
            kodlar: Array.isArray(data.kodlar) ? data.kodlar : [],
            _file: entry.name
          }));
        } catch {
          skipped.push(entry.name);
        }
      }
      return { machines, skipped };
    }

    function machineJson(record) {
      const clean = Object.assign({}, record);
      delete clean._file;
      return JSON.stringify(clean, null, 2);
    }

    async function saveMachine(input, options) {
      const opts = options || {};
      const record = Object.assign({}, input);
      delete record._file;
      record.seriNo = String(record.seriNo || '').trim();
      record.firma = String(record.firma || '').trim();
      record.model = String(record.model || '').trim();
      if (!record.seriNo || !record.firma || !record.model) {
        return { ok: false, error: 'Seri no, firma ve model gerekli' };
      }
      record.kodlar = [...new Set((record.kodlar || []).map((k) => String(k).trim()).filter(Boolean))];
      record.id = record.id || uid();
      const now = new Date().toISOString();
      record.createdAt = record.createdAt || now;
      if (!opts.keepTimestamp || !record.updatedAt) record.updatedAt = now;

      const { machines } = await readMachines();
      const others = machines.filter((m) => m.id !== record.id);
      const previous = machines.find((m) => m.id === record.id) || null;
      const seriChanged = !previous || lower(previous.seriNo) !== lower(record.seriNo);
      if (seriChanged && !opts.allowDuplicateSerial && others.some((m) => lower(m.seriNo) === lower(record.seriNo))) {
        return { ok: false, error: 'Bu seri numarası zaten kayıtlı' };
      }

      // Var olan kayıt kendi dosyasında kalır: elle adlandırılmış dosyalar (XXX_RTS_2B.json) korunur
      let file = previous && !seriChanged ? previous._file : safeMachineFileName(record.seriNo);
      const taken = (name) => others.some((m) => m._file.toLowerCase() === name.toLowerCase());
      if (taken(file)) {
        if (!opts.allowDuplicateSerial) return { ok: false, error: `${file} başka bir makine kaydında kullanılıyor` };
        file = `${file.replace(/\.json$/i, '')}_${String(record.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
      }

      await writeFile(`${KAYITLAR_DIR}/${file}`, machineJson(record));
      if (previous && previous._file !== file) await removeFile(`${KAYITLAR_DIR}/${previous._file}`);
      return { ok: true, machine: Object.assign(record, { _file: file }) };
    }

    async function deleteMachine(id) {
      const { machines } = await readMachines();
      const machine = machines.find((m) => m.id === id);
      if (!machine) return { ok: false, error: 'Makine kaydı bulunamadı' };
      await removeFile(`${KAYITLAR_DIR}/${machine._file}`);
      return { ok: true };
    }

    async function saveCodes(codes) {
      await writeFile(KODLAR_FILE, JSON.stringify({ kodlar: codes }, null, 2));
      return { ok: true };
    }

    /** Aynı kod başka satırda yoksa makine kayıtlarından da çıkarılır */
    async function removeCode(pair) {
      const { codes } = await readCodes();
      const next = codes.filter((k) => !(k.kod === pair.kod && k.aciklama === pair.aciklama));
      await saveCodes(next);
      const changed = [];
      if (!next.some((k) => k.kod === pair.kod)) {
        const { machines } = await readMachines();
        for (const machine of machines) {
          if (!machine.kodlar.includes(pair.kod)) continue;
          const res = await saveMachine(Object.assign({}, machine, { kodlar: machine.kodlar.filter((k) => k !== pair.kod) }));
          if (!res.ok) throw new Error(res.error);
          changed.push(res.machine);
        }
      }
      return { ok: true, codes: next, machines: changed };
    }

    async function importLegacy(diff) {
      const { codes } = await readCodes();
      if (diff.codes.length) await saveCodes(codes.concat(diff.codes));
      const failed = [];
      for (const machine of diff.machines) {
        const res = await saveMachine(machine, { keepTimestamp: true, allowDuplicateSerial: true });
        if (!res.ok) failed.push(`${machine.seriNo}: ${res.error}`);
      }
      return { ok: !failed.length, error: failed.join(' · ') };
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
        revizyonlar: []
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
      const { machines } = await readMachines();
      const folders = (await entriesOf(projectsDir)).filter((e) => e.kind === 'directory' && !e.name.startsWith('.'));
      const projects = await Promise.all(folders.map(async ({ name }) => {
        const base = projectPath(name);
        const metaFile = await tryFile(`${base}/${META_FILE}`);
        let updatedAt = metaFile ? metaFile.lastModified : 0;
        let sheets = 0;
        let items = 0;
        const drawingFile = await tryFile(`${base}/${DRAWING_FILE}`);
        if (drawingFile) {
          updatedAt = drawingFile.lastModified;
          try {
            const drawing = JSON.parse(decodeText(await drawingFile.arrayBuffer()));
            sheets = drawing.sheets.length;
            items = drawing.sheets.reduce((sum, sheet) => sum + sheet.items.length, 0);
          } catch { /* bozuk dosya açılırken ayrıca bildirilir */ }
        }
        const meta = await readMeta(name);
        const machine = findMachine(machines, meta);
        const inputs = await Promise.all(INPUT_FOLDERS.map(async (g) => ({
          id: g.id,
          label: g.label,
          count: (await listFiles(name, g.id)).length
        })));
        return {
          id: name,
          meta,
          sheets,
          items,
          updatedAt,
          inputs,
          machine: machine ? { id: machine.id, seriNo: machine.seriNo, codes: machine.kodlar.length } : null
        };
      }));
      return { ok: true, projects: projects.sort((a, b) => b.updatedAt - a.updatedAt) };
    }

    async function createProject(input) {
      const seriNo = sanitizeName(input?.seriNo);
      const musteri = sanitizeName(input?.musteri);
      const model = sanitizeName(input?.model);
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
      if (input.makineId) meta.makineId = input.makineId;
      await writeFile(`${base}/${META_FILE}`, `${JSON.stringify(meta, null, 2)}\n`);
      return { ok: true, id };
    }

    async function readProject(id) {
      const base = projectPath(id);
      if (!(await tryDir(base))) return { ok: false, error: 'Proje bulunamadı' };
      const meta = await readMeta(id);
      const drawingText = await tryReadText(`${base}/${DRAWING_FILE}`);
      const { machines } = await readMachines();
      const machine = findMachine(machines, meta);
      return {
        ok: true,
        id,
        meta,
        drawing: drawingText === null ? null : JSON.parse(drawingText),
        files: await fileGroups(id),
        machine,
        machineCodes: machine ? machine.kodlar : null
      };
    }

    async function saveProject(payload) {
      const base = projectPath(payload?.id);
      if (!(await tryDir(base))) return { ok: false, error: 'Proje bulunamadı' };
      await writeFile(`${base}/${DRAWING_FILE}`, `${JSON.stringify(payload.drawing, null, 1)}\n`);
      if (payload.meta) await writeFile(`${base}/${META_FILE}`, `${JSON.stringify(payload.meta, null, 2)}\n`);
      return { ok: true, savedAt: Date.now() };
    }

    /** Tüm projelerde geçerli seçimler (örneğin kapak tasarımı); git ile bilgisayarlar arasında taşınır */
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

    async function buildCatalog() {
      const kod = await loadKodCatalog();
      const kodRows = kod.ok ? parseCsvContent(await readText(KOD_CSV.tr)).rows : [];
      const { codes } = await readCodes();
      return mergeCatalog(kod.ok ? kod.entries : [], kodRows, codes);
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

    /* ── Doküman editörü: drawings klasörü ve görseller ── */

    async function listDrawings(relativePath) {
      const rel = pathSegments(relativePath).join('/');
      const dir = await tryDir(`${DRAWINGS_ROOT}/${rel}`);
      if (!dir) return { ok: false, error: 'Directory not found' };
      const entries = await entriesOf(dir);
      const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
      return {
        ok: true,
        path: rel,
        folders: entries.filter((e) => e.kind === 'directory').map((e) => e.name).sort(byName),
        files: entries.filter((e) => e.kind === 'file' && e.name.toLowerCase().endsWith('.svg')).map((e) => e.name).sort(byName)
      };
    }

    async function drawingsExists(relativePath) {
      try {
        return { ok: true, exists: await exists(`${DRAWINGS_ROOT}/${pathSegments(relativePath).join('/')}`) };
      } catch {
        return { ok: true, exists: false };
      }
    }

    async function readDrawingSvg(relativePath) {
      const rel = pathSegments(relativePath).join('/');
      if (!rel.toLowerCase().endsWith('.svg')) return { ok: false, error: 'Only SVG files are allowed' };
      const text = await tryReadText(`${DRAWINGS_ROOT}/${rel}`);
      if (text === null) return { ok: false, error: 'File not found' };
      return { ok: true, path: rel, name: rel.split('/').pop().replace(/\.svg$/i, ''), content: text };
    }

    /** Dışa aktarılan HTML tek başına açılabilsin diye görseller dosyanın içine gömülür */
    async function inlineImages(html) {
      const tags = [...String(html).matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)];
      const replacements = new Map();
      for (const [, src] of tags) {
        if (replacements.has(src) || /^data:/i.test(src)) continue;
        try {
          const rel = decodeURIComponent(src);
          const candidates = [`${CODES_DIR}/${rel}`, `${PID_ROOT}/${rel.replace(/^\.\.\//, '')}`];
          for (const candidate of candidates) {
            const path = pathSegments(candidate).join('/');
            const file = await tryFile(path);
            if (file) {
              replacements.set(src, imageDataUri(path, new Uint8Array(await file.arrayBuffer())));
              break;
            }
          }
        } catch { /* görsel gömülemezse bağlantısı kalır */ }
      }
      return String(html).replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, (tag, src) => (
        replacements.has(src) ? tag.replace(src, replacements.get(src)) : tag
      ));
    }

    return {
      name: rootDir.name,
      dirAt,
      fileHandleAt,
      tryReadText,
      projectPath,
      inlineImages,
      readKodCatalog: loadKodCatalog,
      readSafetyCatalog: loadSafetyCatalog,
      listDrawings,
      drawingsExists,
      readDrawingSvg,
      engine: {
        listProjects,
        createProject,
        readProject,
        saveProject,
        listFiles: async (id) => ({ ok: true, files: await fileGroups(id) }),
        catalog: async () => ({ ok: true, entries: await buildCatalog() }),
        asset,
        assetBytes,
        readSettings,
        saveSettings,
        // Etiket Excel'inin stil şablonu; yoksa sade biçim kullanılır
        labelTemplate: async () => {
          const file = await tryFile(ETIKET_SABLONU);
          return file ? { ok: true, bytes: new Uint8Array(await file.arrayBuffer()) } : { ok: false, error: `${ETIKET_SABLONU} bulunamadı` };
        }
      },
      ml: {
        load: async () => {
          const { machines, skipped } = await readMachines();
          const { codes, source } = await readCodes();
          return { ok: true, machines, skipped, codes, source };
        },
        saveMachine,
        deleteMachine,
        saveCodes,
        removeCode,
        importLegacy
      }
    };
  }

  /* ─── Node testleri için dışa açılanlar ───────────────── */

  const shared = {
    EXPORT_SUFFIX,
    createStore,
    decodeText,
    findMachine,
    friendlyError,
    legacyDiff,
    mergeCatalog,
    parseCodeCsv,
    parseCsvContent,
    pathSegments,
    safeMachineFileName,
    sanitizeName
  };

  if (typeof window === 'undefined') return shared;

  /* ─── Tarayıcı: klasör bağlantısı ─────────────────────── */

  const DB_NAME = 'pidx-host';
  const DB_STORE = 'handles';
  const DB_KEY = 'root';
  const GATE_ID = 'pidxGate';

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
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function isProjectRoot(handle) {
    try {
      const pid = await handle.getDirectoryHandle(PID_ROOT);
      await pid.getDirectoryHandle('data');
      return true;
    } catch {
      return false;
    }
  }

  const GATE_CSS = `
    #${GATE_ID} { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center;
      background: #14161b; color: #e8eaef; font: 14px/1.45 'Segoe UI', system-ui, sans-serif; }
    #${GATE_ID} .gate-box { width: 480px; max-width: calc(100vw - 32px); background: #1b1e25; border-top: 3px solid #ff0000;
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
        <h1>${saved ? 'Klasör izni gerekiyor' : 'P&amp;IDX klasörünü bağla'}</h1>
        <p>Projeler, makine kayıtları ve kod listesi bilgisayarındaki klasörde durur. Tarayıcının bu klasörde okuyup yazmasına izin vermen gerekiyor.</p>
        ${saved
          ? `<p>Bağlı klasör: <code>${nameHtml}</code></p>`
          : '<p>Açılan pencerede <code>index.html</code> dosyasının bulunduğu ana klasörü (<code>P&amp;IDX</code>) seç.</p>'}
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
            if (!(await isProjectRoot(saved))) {
              fail(`"${saved.name}" klasöründe P&ID/data bulunamadı. Klasör taşınmış olabilir, yeniden seçin.`);
              return;
            }
            accept(saved);
          } else {
            const handle = await window.showDirectoryPicker({ id: 'pidx-root', mode: 'readwrite' });
            if (!(await isProjectRoot(handle))) {
              fail(`"${handle.name}" klasöründe P&ID/data bulunamadı. index.html dosyasının bulunduğu ana klasörü seçin.`);
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

  async function connect() {
    // Ortak veritabanı (P&PX): klasör izni istenmez
    if (window.__PPX) {
      store = createStore(await window.__PPX.ready());
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
        if ((await saved.queryPermission({ mode: 'readwrite' })) === 'granted' && (await isProjectRoot(saved))) handle = saved;
      } catch { /* klasör silinmiş olabilir */ }
    }
    if (!handle) handle = await waitForFolder(saved);
    try {
      await dbSet(DB_KEY, handle);
    } catch { /* saklanamazsa bir sonraki açılışta yeniden sorulur */ }
    store = createStore(handle);
    return store;
  }

  function ready() {
    if (!readyPromise) readyPromise = connect();
    return readyPromise;
  }

  async function changeFolder() {
    if (window.__PPX) return { ok: false, error: 'Veriler ortak veritabanında; klasör değiştirilemez' };
    try {
      const handle = await window.showDirectoryPicker({ id: 'pidx-root', mode: 'readwrite' });
      if (!(await isProjectRoot(handle))) {
        return { ok: false, error: `"${handle.name}" klasöründe P&ID/data bulunamadı` };
      }
      await dbSet(DB_KEY, handle);
      return { ok: true };
    } catch (e) {
      if (e.name === 'AbortError') return { ok: false, canceled: true };
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

  /** Yazdırma penceresi; Chrome bu başlığı önerilen PDF dosya adı olarak kullanır.
      window.print() pencere kapanana kadar sayfayı bekletir. */
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

  async function exportHtml(payload) {
    const s = await ready();
    const model = payload?.model || 'pid';
    const baseName = sanitizeFileName(payload?.fileName) || `${model} ${EXPORT_SUFFIX}`;
    const title = payload?.title || `${model} P&ID Doküman`;
    const lang = payload?.lang || 'tr';
    try {
      const css = (await s.tryReadText(`${CODES_DIR}/html-export.css`)) || '';
      const body = await s.inlineImages(payload?.bodyHtml || '');
      const html = `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}" class="html-export">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>${css}</style>
</head>
<body class="html-export">
${body}
</body>
</html>`;
      const res = await saveAs({ name: `${baseName}.html`, data: html, mime: 'text/html', ext: 'html', description: 'HTML' });
      return res.ok ? { success: true, filePath: res.filePath } : { success: false };
    } catch (e) {
      return { success: false, error: friendlyError(e) };
    }
  }

  async function printPdf(payload) {
    await ready();
    await printDocument(sanitizeFileName(payload?.fileName) || `pid-dokuman ${EXPORT_SUFFIX}`);
    return { success: true };
  }

  const VIEWABLE = {
    pdf: 'application/pdf',
    txt: 'text/plain;charset=utf-8',
    csv: 'text/plain;charset=utf-8',
    json: 'text/plain;charset=utf-8',
    log: 'text/plain;charset=utf-8'
  };
  const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);

  /** Tarayıcı dış program başlatamaz: görüntülenebilenler yeni sekmede açılır, diğerleri indirilir.
      SVG <img> içinde gösterilir; dosyadaki betikler programın klasör iznine erişemesin. */
  async function openFile(payload) {
    const s = await ready();
    const path = `${s.projectPath(payload?.id)}/${pathSegments(payload?.rel).join('/')}`;
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
    open: async () => {
      window.open('cizim.html', 'pidx-cizim');
      return { ok: true };
    },
    listProjects: bound((s) => s.engine.listProjects),
    createProject: bound((s) => s.engine.createProject),
    readProject: bound((s) => s.engine.readProject),
    saveProject: bound((s) => s.engine.saveProject),
    listFiles: bound((s) => s.engine.listFiles),
    catalog: bound((s) => s.engine.catalog),
    asset: bound((s) => s.engine.asset),
    assetBytes: bound((s) => s.engine.assetBytes),
    readSettings: bound((s) => s.engine.readSettings),
    saveSettings: bound((s) => s.engine.saveSettings),
    openFile: bound(() => openFile),
    /** Hazır PDF doğrudan indirilir: yazdırma ya da kayıt penceresi açılmaz */
    exportPdf: bound(() => async (payload) => {
      const name = `${sanitizeName(payload?.fileName) || 'pid'} ${payload?.suffix || EXPORT_SUFFIX}.pdf`;
      downloadBlob(new Blob([payload.bytes], { type: 'application/pdf' }), name);
      return { ok: true, filePath: name, downloaded: true };
    }),
    labelTemplate: bound((s) => s.engine.labelTemplate),
    exportXlsx: bound((s) => async (payload) => {
      const startIn = payload?.id ? await s.dirAt(`${s.projectPath(payload.id)}/${OUTPUT_FOLDER.id}`, true) : undefined;
      return saveAs({
        name: `${sanitizeName(payload?.fileName) || 'etiket'}.xlsx`,
        data: payload.bytes,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ext: 'xlsx',
        description: 'Excel',
        startIn
      });
    }),
    exportSvg: bound((s) => async (payload) => {
      const startIn = payload?.id ? await s.dirAt(`${s.projectPath(payload.id)}/${OUTPUT_FOLDER.id}`, true) : undefined;
      return saveAs({
        name: `${sanitizeName(payload?.fileName) || 'pid'}.svg`,
        data: payload.svg,
        mime: 'image/svg+xml',
        ext: 'svg',
        description: 'SVG',
        startIn
      });
    })
  };

  const ml = {
    load: bound((s) => s.ml.load),
    saveMachine: bound((s) => s.ml.saveMachine),
    deleteMachine: bound((s) => s.ml.deleteMachine),
    saveCodes: bound((s) => s.ml.saveCodes),
    removeCode: bound((s) => s.ml.removeCode),
    importLegacy: bound((s) => s.ml.importLegacy)
  };

  return Object.assign(shared, {
    ready,
    rootName: () => (store ? store.name : ''),
    changeFolder,
    downloadBlob,
    imagesDecoded,
    nextPaint,
    printPdf,
    exportHtml,
    readKodCatalog: bound((s) => s.readKodCatalog),
    readSafetyCatalog: bound((s) => s.readSafetyCatalog),
    listDrawings: bound((s) => s.listDrawings),
    drawingsExists: bound((s) => s.drawingsExists),
    readDrawingSvg: bound((s) => s.readDrawingSvg),
    engine,
    ml
  });
});
