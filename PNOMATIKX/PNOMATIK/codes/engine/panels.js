/* Yan paneller: sembol paleti, P&ID kodları, proje dosyaları, özellikler, kontrol.
   Pnömatik: yön valfinin bobinleri (Y) ve aktüatörün konum sensörleri (B) özellikler panelinde düzenlenir;
   her birinin pnömatik kodu ve bağlı P&ID kodu vardır. */

const PidPanels = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const LANGS = [['tr', 'Türkçe'], ['en', 'English'], ['de', 'Deutsch']];
  const BRANDS = [['DOLFIN', 'DOLFIN'], ['ENVA', 'ENVA'], ['VICO', 'VICO'], ['KSYSTEM', 'K.SYSTEM']];
  const SHEET_SIZES = ['A3', 'A2', 'A1', 'A4'];
  const LAYERS = [['pneu', 'Pnömatik'], ['elec', 'Elektrik'], ['option', 'Opsiyon']];
  const ARROWS = [['none', 'Yok'], ['mid', 'Hat ortasında'], ['end', 'Hat sonunda']];
  const SENSOR_POS = [['0', 'Geri / Kapalı'], ['0.5', 'Ara'], ['1', 'İleri / Açık']];
  const SENSOR_TYPES = [['', 'Manyetik piston sensörü'], ['pnp', 'Manyetik, PNP çıkışlı']];
  const PNEU_SERIES = new Set(['V', 'PPS', 'SWB', 'SW', 'PS']);

  let app = null;

  /* ─── Sembol paleti ───────────────────────────────────── */

  const thumbCache = new Map();
  function thumb(id, size) {
    const key = `${id}:${size}`;
    if (!thumbCache.has(key)) thumbCache.set(key, PidSymbols.thumbnail(id, size));
    return thumbCache.get(key);
  }

  /* Hazır setin önizlemesi: setteki semboller ve hatlar küçük çizimde */
  const setThumbs = new Map();
  function setThumb(id) {
    if (setThumbs.has(id)) return setThumbs.get(id);
    const set = PnoSets.get(id);
    const b = PnoSets.boxOf(set);
    const pad = 3;
    const hops = new Map();
    const body = set.items.map((it) => (it.type === 'line' ? PidSheet.renderLine(it, hops, {})
      : it.type === 'symbol' ? PidSheet.renderSymbol(it, { lang: 'tr', showPid: false, portNumbers: false }) : '')).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b[0] - pad} ${b[1] - pad} ${b[2] - b[0] + pad * 2} ${b[3] - b[1] + pad * 2}" preserveAspectRatio="xMidYMid meet" style="color:#111">${body}</svg>`;
    setThumbs.set(id, svg);
    return svg;
  }

  function renderSymbols() {
    const query = PidSymbols.normalize($('symbolSearch').value.trim());
    const list = $('symbolList');
    const html = [];
    // Hazır setler: tek tıkla besleme ve devreleriyle birlikte konur
    if (typeof PnoSets !== 'undefined') {
      const sets = PnoSets.list().filter((s) => !query || PidSymbols.normalize(`${s.name} ${s.note} hazir set`).includes(query));
      if (sets.length) {
        html.push('<div class="sym-cat">Hazır Setler</div><div class="sym-grid">');
        for (const s of sets) {
          html.push(`<button type="button" class="sym-tile set-tile" data-set="${s.id}" title="${esc(s.note)} · Tıklayınca sayfaya konur, gruplu ve seçili gelir">${setThumb(s.id)}<span>${esc(s.name)}</span></button>`);
        }
        html.push('</div>');
      }
    }
    for (const cat of PidSymbols.CATEGORIES) {
      const items = PidSymbols.list().filter((d) => d.cat === cat.id &&
        (!query || PidSymbols.normalize(`${d.name.tr} ${d.name.en} ${d.name.de} ${cat.name}`).includes(query)));
      if (!items.length) continue;
      html.push(`<div class="sym-cat">${esc(cat.name)}</div><div class="sym-grid">`);
      for (const d of items) {
        html.push(`<button type="button" class="sym-tile" draggable="true" data-symbol="${d.id}" title="${esc(d.name.tr)}">${thumb(d.id, 34)}<span>${esc(d.name.tr)}</span></button>`);
      }
      html.push('</div>');
    }
    list.innerHTML = html.join('') || '<div class="file-empty">Sembol bulunamadı</div>';
    markPlacing();
  }

  function markPlacing() {
    const placing = app && app.editor ? app.editor.placing : null;
    document.querySelectorAll('.sym-tile').forEach((el) => {
      el.classList.toggle('active', !!placing && placing.keep && placing.symbol === el.dataset.symbol);
    });
    document.querySelectorAll('.code-row').forEach((el) => {
      el.classList.toggle('active', !!placing && placing.pidCode === el.dataset.code);
    });
  }

  function bindSymbols() {
    $('symbolSearch').addEventListener('input', renderSymbols);
    const list = $('symbolList');
    list.addEventListener('click', (e) => {
      const setTile = e.target.closest('.set-tile');
      if (setTile) {
        app.insertSet(setTile.dataset.set);
        return;
      }
      const tile = e.target.closest('.sym-tile');
      if (!tile) return;
      const current = app.editor.placing;
      if (current && current.keep && current.symbol === tile.dataset.symbol) {
        app.editor.cancelPlacing();
        return;
      }
      app.editor.startPlacing(app.placingSpecForSymbol(tile.dataset.symbol, true));
    });
    list.addEventListener('dragstart', (e) => {
      const tile = e.target.closest('.sym-tile');
      if (!tile || tile.dataset.set) return;
      e.dataTransfer.setData('text/plain', tile.dataset.symbol);
      e.dataTransfer.effectAllowed = 'copy';
      app.editor.startPlacing(app.placingSpecForSymbol(tile.dataset.symbol, false));
    });
    list.addEventListener('dragend', () => app.editor.cancelPlacing());
  }

  /* ─── P&ID kodları ────────────────────────────────────── */

  function renderSeriesOptions() {
    const select = $('codeSeries');
    const current = select.value;
    const series = [...new Set(app.catalog.map((c) => c.category))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr'));
    select.innerHTML = '<option value="">Tüm seriler</option>' +
      series.map((s) => `<option value="${esc(s)}">${esc(s)} (${app.catalog.filter((c) => c.category === s).length})</option>`).join('');
    if (series.includes(current)) select.value = current;
  }

  /** Projenin bağlı olduğu P&ID projesi ve kod durumu */
  function renderPidBar() {
    const bar = $('machineBar');
    bar.classList.toggle('hidden', !app.projectId);
    if (!app.projectId) return;
    const meta = app.editor.project || {};
    const status = window.PidxHost.pid.status();
    const codes = app.pidProjectCodes || [];
    const linked = PidModel.usedPids(app.editor.drawing);
    const done = codes.filter((c) => linked.has(c)).length;
    if (!meta.pidProje && !app.pidSource) {
      bar.innerHTML = `
        <div class="mb-text"><strong>P&amp;ID projesi bağlı değil</strong><span>${status.granted ? 'P&IDX klasöründen bir proje seçin' : 'Önce ana ekrandan P&IDX klasörünü bağlayın'}</span></div>
        <div class="mb-actions"><button type="button" class="btn btn-sm" id="mbPick">P&amp;ID projesi seç</button></div>`;
      onField('mbPick', 'click', () => app.pickPidProject());
      return;
    }
    const sub = !status.granted
      ? 'P&IDX klasörüne bu oturumda izin verilmedi'
      : `${codes.length} pnömatik P&ID kodu · ${done} tanesi şemada`;
    bar.innerHTML = `
      <div class="mb-text"><strong>${esc(app.pidSource || `P&ID projesi ${meta.pidProje}`)}</strong><span>${esc(sub)}</span></div>
      <div class="mb-actions">
        ${status.granted ? '' : '<button type="button" class="btn btn-sm" id="mbGrant">İzin ver</button>'}
        <button type="button" class="btn btn-sm" id="mbGen">Otomatik Oluştur</button>
        <button type="button" class="btn btn-sm" id="mbPick">Değiştir</button>
      </div>`;
    onField('mbGrant', 'click', () => app.grantPid());
    onField('mbGen', 'click', () => app.openGenerator());
    onField('mbPick', 'click', () => app.pickPidProject());
  }

  function roleBadge(code, name) {
    const info = PidLink.classify(code, name);
    const saved = app.mapping && app.mapping.get(code);
    const role = saved && saved.rol ? saved.rol : info.role;
    if (!role || role === 'HARIC') return '';
    return `<span class="code-role" title="Pnömatik rol">${esc(role)}</span>`;
  }

  function renderCodes() {
    renderPidBar();
    const list = $('codeList');
    const query = PidSymbols.normalize($('codeSearch').value.trim());
    const series = $('codeSeries').value;
    const filter = $('codeFilter').value;
    const used = PidModel.usedPids(app.editor.drawing);
    const project = new Set(app.pidProjectCodes || []);
    const rows = app.catalog.filter((c) => {
      if (series && c.category !== series) return false;
      if (filter === 'pneu' && !(PNEU_SERIES.has(c.category) && PidLink.isRelevant(c.id, c.name))) return false;
      if (filter === 'project' && !project.has(c.id)) return false;
      if (filter === 'used' && !used.has(c.id)) return false;
      if (filter === 'unused' && (used.has(c.id) || !PidLink.isRelevant(c.id, c.name))) return false;
      if (!query) return true;
      return PidSymbols.normalize(`${c.id} ${c.name}`).includes(query);
    });
    if (query) {
      const starts = (c) => (PidSymbols.normalize(c.id).startsWith(query) ? 0 : 1);
      rows.sort((a, b) => starts(a) - starts(b));
    }
    if (!rows.length) {
      const none = filter === 'project' && !project.size
        ? (app.editor.project && app.editor.project.pidProje ? 'P&ID projesinde pnömatik kod yok' : 'Bu proje bir P&ID projesine bağlı değil')
        : 'Kod bulunamadı';
      list.innerHTML = `<div class="file-empty">${esc(none)}</div>`;
      return;
    }
    list.innerHTML = rows.map((c) => {
      const isUsed = used.has(c.id);
      const flag = c.ambiguous && c.ambiguous.length > 1
        ? `<span class="code-flag" title="Listede farklı anlamlarla geçiyor: ${esc(c.ambiguous.join(' / '))}">⚠</span>`
        : isUsed ? '<span class="code-used" title="Pnömatik şemada eşleşmiş">✓</span>' : '';
      const inProject = project.has(c.id) ? '<span class="code-star on" title="P&ID projesinde var">★</span>' : '';
      return `<button type="button" class="code-row${isUsed ? ' is-used' : ''}" draggable="true" data-code="${esc(c.id)}"><span class="code-tag">${esc(c.id)}</span><span class="code-name">${esc(c.name)}</span><span class="code-marks">${roleBadge(c.id, c.name)}${flag}${inProject}</span></button>`;
    }).join('');
    markPlacing();
  }

  function bindCodes() {
    $('codeSearch').addEventListener('input', renderCodes);
    $('codeSeries').addEventListener('change', renderCodes);
    $('codeFilter').addEventListener('change', renderCodes);
    const list = $('codeList');
    list.addEventListener('click', (e) => {
      const row = e.target.closest('.code-row');
      if (!row) return;
      const code = row.dataset.code;
      const uses = PidModel.usedPids(app.editor.drawing).get(code);
      if (uses) {
        app.editor.focusItem(uses[0].sheetId, uses[0].itemId);
        return;
      }
      app.linkPidCode(code);
    });
    list.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.code-row');
      if (!row) return;
      e.dataTransfer.setData('text/plain', row.dataset.code);
      e.dataTransfer.effectAllowed = 'copy';
      app.editor.startPlacing(app.placingSpecForCode(row.dataset.code));
    });
    list.addEventListener('dragend', () => app.editor.cancelPlacing());
  }

  /* ─── Proje dosyaları ─────────────────────────────────── */

  function formatSize(bytes) {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  let filesHtml = '';
  function setFiles(html) {
    if (html === filesHtml) return;
    filesHtml = html;
    $('fileList').innerHTML = html;
  }

  async function renderFiles() {
    if (!app.projectId) {
      setFiles('<div class="file-empty">Örnek çizimde proje klasörü yok</div>');
      return;
    }
    const res = await window.PidxHost.engine.listFiles(app.projectId);
    if (!res.ok) {
      setFiles(`<div class="file-empty">${esc(res.error)}</div>`);
      return;
    }
    setFiles(res.files.map((g) => `
      <div class="file-group">
        <h3>${esc(g.label)} <span class="file-count">${g.files.length}</span></h3>
        ${g.files.length ? g.files.map((f) => `<button type="button" class="file-row" data-rel="${esc(f.rel)}" title="${esc(f.name)}"><span>${esc(f.name)}</span><span class="file-size">${formatSize(f.size)}</span></button>`).join('') : '<div class="file-empty">Henüz dosya yok</div>'}
      </div>`).join(''));
  }

  function bindFiles() {
    $('fileList').addEventListener('click', async (e) => {
      const row = e.target.closest('.file-row');
      if (!row) return;
      const res = await window.PidxHost.engine.openFile({ id: app.projectId, rel: row.dataset.rel });
      if (!res.ok) app.toast(res.error, 'error');
      else if (res.downloaded) app.toast('Tarayıcı bu dosya türünü açamıyor, kopyası indirildi');
    });
  }

  /* ─── Özellikler ──────────────────────────────────────── */

  const inp = (id, label, value, attrs) =>
    `<div class="field"><label for="${id}">${label}</label><input id="${id}" class="field-input" value="${esc(value)}" ${attrs || ''}></div>`;
  const sel = (id, label, options, value) =>
    `<div class="field"><label for="${id}">${label}</label><select id="${id}" class="field-input">${options.map(([v, t]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  const toggle = (id, label, on) =>
    `<label class="switch-row${on ? ' is-on' : ''}"><span>${label}</span><input type="checkbox" id="${id}"${on ? ' checked' : ''}></label>`;

  function onField(id, event, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, () => handler(el));
  }

  const SCALE_RANGE = [30, 400];

  /** "70", "%70" ve "70,5" kabul edilir; aralık dışındaysa uyarır ve null döner */
  function readPercent(text) {
    const pct = parseFloat(String(text).replace('%', '').replace(',', '.').trim());
    if (!Number.isFinite(pct)) return null;
    if (pct < SCALE_RANGE[0] || pct > SCALE_RANGE[1]) {
      app.toast(`Boyut %${SCALE_RANGE[0]} ile %${SCALE_RANGE[1]} arasında olmalı`, 'error');
      return null;
    }
    return pct;
  }

  const percentField = (id, label, value, placeholder) =>
    inp(id, label, value === null ? '' : value, `inputmode="decimal" autocomplete="off" placeholder="${placeholder}"`);

  /** Görünmez bağlantı noktaları öğe sayısına girmez */
  const isVisibleItem = (it) => !(PidModel.isSymbol(it) && (PidSymbols.get(it.symbol) || {}).hidden);

  /** Grubu olan öğe için: grubu seç, grubu çöz */
  function groupRow(item) {
    if (!item.group) return '';
    const sheet = app.editor.sheet;
    const count = PidModel.groupMembers(sheet, item.id).filter((id) => isVisibleItem(PidModel.findItem(sheet, id))).length;
    return `<div class="field-label">Grup (${count} öğe)</div>
      <div class="insp-actions"><button type="button" class="btn btn-sm" id="fGroupSelect">Grubu seç</button><button type="button" class="btn btn-sm" id="fUngroup">Grubu çöz</button></div>`;
  }

  function bindGroupRow(item) {
    onField('fGroupSelect', 'click', () => app.editor.setSelection(PidModel.groupMembers(app.editor.sheet, item.id)));
    onField('fUngroup', 'click', () => {
      app.editor.ungroupSelection();
      app.toast('Grup çözüldü');
    });
  }

  function symbolOptions() {
    return PidSymbols.CATEGORIES.map((cat) => {
      const items = PidSymbols.list().filter((d) => d.cat === cat.id);
      return `<optgroup label="${esc(cat.name)}">${items.map((d) => `<option value="${d.id}">${esc(d.name.tr)}</option>`).join('')}</optgroup>`;
    }).join('');
  }

  /** P&ID kodu alanının altındaki açıklama */
  function pidHelp(code) {
    if (!code) return '';
    const entry = app.catalogMap.get(String(code).toUpperCase());
    if (!entry) return `<div class="field-help warn">${esc(code)} P&amp;ID kod listesinde yok</div>`;
    const amb = entry.ambiguous && entry.ambiguous.length > 1;
    return `<div class="field-help${amb ? ' warn' : ''}">${amb ? `⚠ Listede farklı anlamlarla geçiyor: ${esc(entry.ambiguous.join(' / '))}` : esc(entry.name)}</div>`;
  }

  /** Aynı devredeki ilk boş kod: "3V" → 3V2 */
  function nextCode(prefix) {
    const used = PidModel.usedTags(app.editor.drawing);
    for (let i = 1; i < 99; i += 1) {
      if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
    }
    return `${prefix}1`;
  }

  function circuitOf(item) {
    const own = PidLink.parseIso(item.tag);
    if (own) return own.circuit;
    for (const part of PidModel.partsOf(item)) {
      const p = PidLink.parseIso(part.tag);
      if (p) return p.circuit;
    }
    return null;
  }

  const LETTER = { actuator: 'A', directional: 'V', flow: 'V', treatment: 'Z', source: 'P', sensor: 'B', display: 'B' };

  function suggestTag(item, def) {
    const circuit = circuitOf(item);
    const nr = circuit == null ? PidLink.maxCircuit(app.editor.drawing) + (def.role === 'actuator' ? 1 : 0) : circuit;
    return nextCode(`${nr}${LETTER[def.role] || 'Z'}`);
  }

  /** Başka sayfaya taşıma seçimi (birden çok sayfa varsa) */
  function moveSheetField() {
    const sheets = app.editor.drawing.sheets;
    if (sheets.length < 2) return '';
    const options = [['', 'Seçin…'], ...sheets.map((sh, i) => [String(i), `${i + 1}. ${sh.title}`]).filter(([i]) => Number(i) !== app.editor.sheetIndex)];
    return sel('mMoveSheet', 'Başka sayfaya taşı', options, '');
  }

  function bindMoveSheet() {
    onField('mMoveSheet', 'change', (el) => {
      if (el.value !== '') app.moveSelectionToSheet(parseInt(el.value, 10));
    });
  }

  function inspectSymbol(item) {
    const def = PidSymbols.get(item.symbol);
    const coils = PidSymbols.coilsOf(def);
    const canDesc = def.role === 'actuator' || def.role === 'directional';

    const coilRows = coils.map((place, i) => {
      const c = (item.coils || [])[i] || {};
      return `<div class="coil-row">
          <span class="coil-label">${i === 0 ? 'Bobin 14' : 'Bobin 12'}</span>
          <div class="field"><label for="fCoilTag${i}">Kod</label><input id="fCoilTag${i}" class="field-input" value="${esc(c.tag || '')}" placeholder="${esc(`${circuitOf(item) == null ? 1 : circuitOf(item)}Y${i + 1}`)}" autocomplete="off"></div>
          <div class="field"><label for="fCoilPid${i}">P&amp;ID</label><input id="fCoilPid${i}" class="field-input" list="catalogCodes" value="${esc(c.pid || '')}" placeholder="V31" autocomplete="off"></div>
        </div>${pidHelp(c.pid)}`;
    }).join('');

    const topSensors = !!(def.sensors && def.sensors.layout === 'top');
    const sensorRows = (def.sensors ? (item.sensors || []) : []).map((s, i) => `
        <div class="sensor-row">
          <div class="field"><label for="fSenTag${i}">Kod</label><input id="fSenTag${i}" class="field-input" value="${esc(s.tag || '')}" autocomplete="off"></div>
          <div class="field"><label for="fSenPid${i}">P&amp;ID</label><input id="fSenPid${i}" class="field-input" list="catalogCodes" value="${esc(s.pid || '')}" autocomplete="off"></div>
          ${topSensors ? sel(`fSenPos${i}`, 'Konum', SENSOR_POS, String(s.pos == null ? 0 : s.pos)) : '<div class="insp-mini">Switch box</div>'}
          <button type="button" class="rev-del sensor-del" data-sensor="${i}" title="Sensörü kaldır">×</button>
        </div>${topSensors ? `<div class="sensor-type">${sel(`fSenType${i}`, 'Tip', SENSOR_TYPES, s.type || '')}</div>` : ''}${pidHelp(s.pid)}`).join('');

    $('inspector').innerHTML = `
      <div class="insp-head">
        <div class="insp-thumb">${thumb(item.symbol, 34)}</div>
        <div><div class="insp-title">${esc(def.name.tr)}</div><div class="insp-sub">${esc((PidSymbols.CATEGORIES.find((c) => c.id === def.cat) || {}).name || '')}</div></div>
      </div>
      ${def.tag === 'none' ? '' : `<div class="field">
        <label for="fTag">Pnömatik kod (ISO 1219-2)</label>
        <div class="field-row"><input id="fTag" class="field-input" value="${esc(item.tag || '')}" autocomplete="off" placeholder="Örn: 1V1">
        <button type="button" class="btn btn-sm" id="fTagAuto" title="Devre numarasına göre boş kod verir">Öner</button></div>
      </div>`}
      ${def.tag === 'none' && def.role !== 'source' ? '' : `<div class="field">
        <label for="fPid">P&amp;ID kodu</label>
        <input id="fPid" class="field-input" list="catalogCodes" value="${esc(item.pid || '')}" autocomplete="off" placeholder="${def.role === 'actuator' ? 'Aktüatörlü vanada V01…' : 'PS06…'}">
        ${pidHelp(item.pid)}
      </div>`}
      ${canDesc ? inp('fDesc', 'Görev / devre adı', item.desc || '', 'placeholder="1. Proses Tankı Tahliye Vanası"') : ''}
      ${coils.length ? `<div class="insp-section">Bobinler (Y) ve P&amp;ID valf kodları</div>${coilRows}` : ''}
      ${def.sensors ? `<div class="insp-section">${topSensors ? 'Manyetik piston sensörleri (B)' : 'Konum sensörleri (B)'}</div>${sensorRows || `<div class="field-help">${topSensors ? 'Sensör yok · Semboller sekmesindeki manyetik piston sensörünü silindirin üstüne bırakabilirsiniz' : 'Sensör yok'}</div>`}<button type="button" class="btn btn-sm" id="fSenAdd">Sensör ekle</button>` : ''}
      ${inp('fNote', def.container ? 'Ad' : def.tag === 'none' ? 'Etiket' : 'Not', item.note || '')}
      <div class="field"><label for="fSymbol">Sembol</label><select id="fSymbol" class="field-input">${symbolOptions()}</select></div>
      ${def.resizable ? `<div class="field-row">${inp('fW', 'Genişlik (mm)', item.w, 'type="number" step="2.5" min="10"')}${inp('fH', 'Yükseklik (mm)', item.h, 'type="number" step="2.5" min="10"')}</div>` : ''}
      ${!def.resizable ? '<div class="insp-actions"><button type="button" class="btn btn-sm" id="fRotate">Döndür 90°</button><button type="button" class="btn btn-sm" id="fFlip">Aynala</button></div>' : ''}
      ${def.hidden ? '' : percentField('fScale', 'Boyut (%)', PidModel.selectionPercent([item]), 'Örn: 70')}
      ${groupRow(item)}
      ${moveSheetField()}
      ${toggle('fOptional', 'Opsiyon (kırmızı)', item.optional)}
      ${item.tagOffset ? '<button type="button" class="btn btn-sm" id="fTagReset">Etiket konumunu sıfırla</button>' : ''}
    `;

    $('fSymbol').value = item.symbol;
    bindMoveSheet();
    const upper = (v) => String(v || '').trim().toUpperCase();
    onField('fTag', 'change', (el) => {
      app.editor.updateItem(item, { tag: upper(el.value) });
      inspectSymbol(item);
    });
    onField('fTagAuto', 'click', () => {
      app.editor.updateItem(item, { tag: suggestTag(item, def) });
      inspectSymbol(item);
    });
    onField('fPid', 'change', (el) => {
      app.editor.updateItem(item, { pid: upper(el.value) });
      inspectSymbol(item);
    });
    onField('fDesc', 'change', (el) => app.editor.updateItem(item, { desc: el.value.trim() }));
    coils.forEach((place, i) => {
      const setCoil = (key, value) => {
        const next = (item.coils || []).map((c) => Object.assign({}, c));
        while (next.length < coils.length) next.push({ tag: '', pid: '' });
        next[i][key] = value;
        app.editor.updateItem(item, { coils: next });
        inspectSymbol(item);
      };
      onField(`fCoilTag${i}`, 'change', (el) => setCoil('tag', upper(el.value)));
      onField(`fCoilPid${i}`, 'change', (el) => setCoil('pid', upper(el.value)));
    });
    if (def.sensors) {
      const setSensors = (list) => {
        app.editor.updateItem(item, { sensors: list });
        inspectSymbol(item);
      };
      const copy = () => (item.sensors || []).map((s) => Object.assign({}, s));
      (item.sensors || []).forEach((s, i) => {
        onField(`fSenTag${i}`, 'change', (el) => { const l = copy(); l[i].tag = upper(el.value); setSensors(l); });
        onField(`fSenPid${i}`, 'change', (el) => { const l = copy(); l[i].pid = upper(el.value); setSensors(l); });
        onField(`fSenPos${i}`, 'change', (el) => { const l = copy(); l[i].pos = parseFloat(el.value); setSensors(l); });
        onField(`fSenType${i}`, 'change', (el) => {
          const l = copy();
          if (el.value) l[i].type = el.value;
          else delete l[i].type;
          setSensors(l);
        });
      });
      document.querySelectorAll('[data-sensor]').forEach((b) => b.addEventListener('click', () => {
        const l = copy();
        l.splice(parseInt(b.dataset.sensor, 10), 1);
        setSensors(l);
      }));
      onField('fSenAdd', 'click', () => {
        // Boş konuma (geri, ileri, ara) devre numarasına göre kodla: 3B1 geri, 3B2 ileri, 3B3 ara
        setSensors(copy().concat(PidPlace.nextSensor(item, app.editor.drawing)));
      });
    }
    onField('fNote', 'change', (el) => app.editor.updateItem(item, { note: el.value }));
    onField('fSymbol', 'change', (el) => {
      const next = PidSymbols.get(el.value);
      const props = { symbol: el.value };
      if (next.resizable && !item.w) {
        props.w = next.defaultSize[0];
        props.h = next.defaultSize[1];
      }
      // Port adları değişirse bağlı hatlar boşa düşmesin
      const ids = next.ports.map((p) => p.id);
      for (const line of PidModel.attachedLines(app.editor.sheet, item.id)) {
        for (const end of ['from', 'to']) {
          const anchor = line[end];
          if (anchor.node === item.id && anchor.port && !ids.includes(anchor.port) && ids.length) anchor.port = ids[0];
        }
      }
      const draft = Object.assign({}, item, props);
      PidModel.syncParts(draft, next);
      props.coils = draft.coils;
      props.sensors = draft.sensors;
      app.editor.updateItem(item, props);
      if (!next.coils) delete item.coils;
      if (!next.sensors) delete item.sensors;
      inspectSymbol(item);
    });
    onField('fW', 'change', (el) => { app.editor.updateItem(item, { w: Math.max(10, parseFloat(el.value) || item.w) }); });
    onField('fH', 'change', (el) => { app.editor.updateItem(item, { h: Math.max(10, parseFloat(el.value) || item.h) }); });
    onField('fRotate', 'click', () => app.editor.rotateSelection());
    onField('fFlip', 'click', () => app.editor.flipSelection());
    onField('fScale', 'change', (el) => {
      const pct = readPercent(el.value);
      if (pct !== null) app.editor.scaleSelection(pct / 100, { absolute: true });
      else inspectSymbol(item);
    });
    bindGroupRow(item);
    onField('fOptional', 'change', (el) => {
      app.editor.updateItem(item, { optional: el.checked });
      inspectSymbol(item);
    });
    onField('fTagReset', 'click', () => {
      app.editor.updateItem(item, { tagOffset: null });
      inspectSymbol(item);
    });
  }

  function endName(sheet, anchor) {
    if (!anchor.node) return 'Boşta';
    const node = PidModel.findItem(sheet, anchor.node);
    if (!node) return 'Boşta';
    const def = PidSymbols.get(node.symbol);
    if (def && def.hidden) return 'Bağlantı noktası';
    const port = anchor.port && /^\d+$/.test(anchor.port) ? ` (${anchor.port})` : anchor.port && anchor.port.length === 1 && /[AB]/.test(anchor.port) ? ` (${anchor.port})` : '';
    return `${node.tag || (def ? def.name.tr : 'Sembol')}${port}`;
  }

  function inspectLine(line) {
    const kinds = Object.entries(PidSymbols.LINE_KINDS).map(([k, m]) => [k, m.name.tr]);
    const sheet = app.editor.sheet;
    $('inspector').innerHTML = `
      <div class="insp-head"><div><div class="insp-title">Hat</div><div class="insp-sub">${esc(endName(sheet, line.from))} → ${esc(endName(sheet, line.to))}</div></div></div>
      ${sel('fKind', 'Hat tipi', kinds, line.kind)}
      ${inp('fLabel', 'Hat etiketi', line.label || '', 'placeholder="Örn: Ø8"')}
      ${sel('fArrow', 'Akış oku', ARROWS, line.arrow || 'none')}
      ${toggle('fOptional', 'Opsiyon (kırmızı)', line.optional)}
      ${line.manual ? '<button type="button" class="btn btn-sm" id="fAuto">Otomatik rotaya dön</button>' : '<div class="field-help">Yolu değiştirmek için hattın parçalarını sürükleyin.</div>'}
      ${groupRow(line)}
    `;
    bindGroupRow(line);
    onField('fKind', 'change', (el) => {
      app.editor.updateItem(line, { kind: el.value });
      inspectLine(line);
    });
    onField('fLabel', 'change', (el) => app.editor.updateItem(line, { label: el.value.trim() }));
    onField('fArrow', 'change', (el) => app.editor.updateItem(line, { arrow: el.value }));
    onField('fOptional', 'change', (el) => {
      app.editor.updateItem(line, { optional: el.checked });
      inspectLine(line);
    });
    onField('fAuto', 'click', () => {
      app.editor.resetRoute(line);
      inspectLine(line);
    });
  }

  function inspectText(item) {
    $('inspector').innerHTML = `
      <div class="insp-head"><div class="insp-title">Metin</div></div>
      <div class="field"><label for="fText">İçerik</label><textarea id="fText" class="field-input">${esc(item.text)}</textarea></div>
      <div class="field-row">
        ${sel('fSize', 'Yazı boyutu', [['2.3', '2,3 mm'], ['2.5', '2,5 mm'], ['3.5', '3,5 mm'], ['5', '5 mm'], ['7', '7 mm']], String(item.size))}
        ${sel('fAlign', 'Hizalama', [['left', 'Sol'], ['center', 'Orta'], ['right', 'Sağ']], item.align)}
      </div>
      ${toggle('fBold', 'Kalın', item.bold)}
      ${toggle('fOptional', 'Opsiyon (kırmızı)', item.optional)}
      ${groupRow(item)}
    `;
    bindGroupRow(item);
    onField('fText', 'input', (el) => app.editor.updateItem(item, { text: el.value }, { commit: false }));
    onField('fText', 'change', () => app.editor.commit());
    onField('fSize', 'change', (el) => app.editor.updateItem(item, { size: parseFloat(el.value) }));
    onField('fAlign', 'change', (el) => app.editor.updateItem(item, { align: el.value }));
    onField('fBold', 'change', (el) => {
      app.editor.updateItem(item, { bold: el.checked });
      inspectText(item);
    });
    onField('fOptional', 'change', (el) => {
      app.editor.updateItem(item, { optional: el.checked });
      inspectText(item);
    });
  }

  function inspectLegend() {
    $('inspector').innerHTML = `
      <div class="insp-head"><div class="insp-title">Lejant</div></div>
      <div class="field-help">Bu sayfadaki hat tipleri ve semboller otomatik listelenir. Sürükleyerek taşıyabilirsiniz.</div>
    `;
  }

  let spacingPref = null;

  function inspectMultiple(items) {
    const visible = items.filter(isVisibleItem);
    const allOption = visible.every((it) => it.optional);
    const groups = new Set(visible.map((it) => it.group || null));
    // Tek bir grubun tamamı seçiliyse grup olarak ölçeklenir
    const grouped = groups.size === 1 && !groups.has(null);
    const anyGroup = visible.some((it) => it.group);
    const spacing = spacingPref === null ? grouped : spacingPref;
    const align = [['left', 'Sol'], ['centerX', 'Orta'], ['right', 'Sağ'], ['top', 'Üst'], ['centerY', 'Merkez'], ['bottom', 'Alt']];
    $('inspector').innerHTML = `
      <div class="insp-head"><div class="insp-title">${visible.length} öğe seçili</div></div>
      <div class="field-label">Hizala</div>
      <div class="align-grid">${align.map(([m, t]) => `<button type="button" class="btn btn-sm" data-align="${m}">${t}</button>`).join('')}</div>
      <div class="field-label">Eşit aralıkla dağıt</div>
      <div class="insp-actions"><button type="button" class="btn btn-sm" data-align="distH">Yatay</button><button type="button" class="btn btn-sm" data-align="distV">Dikey</button></div>
      <div class="field-label">Boyut</div>
      <div class="insp-actions"><button type="button" class="btn btn-sm" data-scale="0.9" title="[ tuşu">Küçült −10%</button><button type="button" class="btn btn-sm" data-scale="1.1" title="] tuşu">Büyüt +10%</button></div>
      ${percentField('mScale', 'Doğrudan boyut (%)', PidModel.selectionPercent(items), PidModel.selectionPercent(items) === null ? 'Farklı boyutlar · Örn: 70' : 'Örn: 70')}
      ${toggle('fSpacing', 'Aralıklar da ölçeklensin (Shift)', spacing)}
      <div class="field-label">Grup</div>
      <div class="insp-actions">
        <button type="button" class="btn btn-sm" id="mGroup" title="Ctrl+G"${grouped ? ' disabled' : ''}>Grupla</button>
        <button type="button" class="btn btn-sm" id="mUngroup" title="Ctrl+Shift+G"${anyGroup ? '' : ' disabled'}>Grubu çöz</button>
      </div>
      ${moveSheetField()}
      ${toggle('fOptional', 'Opsiyon (kırmızı)', allOption)}
    `;
    document.querySelectorAll('[data-scale]').forEach((b) => b.addEventListener('click', () => {
      app.editor.scaleSelection(parseFloat(b.dataset.scale), { spacing: $('fSpacing').checked });
    }));
    onField('mScale', 'change', (el) => {
      const pct = readPercent(el.value);
      if (pct !== null) app.editor.scaleSelection(pct / 100, { absolute: true, spacing: $('fSpacing').checked });
      else inspectMultiple(items);
    });
    onField('fSpacing', 'change', (el) => { spacingPref = el.checked; });
    onField('mGroup', 'click', () => {
      if (app.editor.groupSelection()) app.toast(`${app.editor.selectedItems().filter(isVisibleItem).length} öğe hatlarıyla gruplandı. Tıklayınca grup seçilir, tekrar tıklayınca tek parça.`);
    });
    onField('mUngroup', 'click', () => {
      if (app.editor.ungroupSelection()) app.toast('Grup çözüldü');
    });
    bindMoveSheet();
    document.querySelectorAll('[data-align]').forEach((b) => b.addEventListener('click', () => app.editor.align(b.dataset.align)));
    onField('fOptional', 'change', (el) => {
      items.forEach((it) => app.editor.updateItem(it, { optional: el.checked }, { commit: false }));
      app.editor.commit();
      inspectMultiple(items);
    });
  }

  function inspectSheet() {
    const sheet = app.editor.sheet;
    const meta = app.editor.project;
    const hasLegend = sheet.items.some((it) => it.type === 'legend');
    const revCurrent = PidRevLog.current(meta);
    const revText = PidRevLog.revText(meta);
    const count = app.editor.drawing.sheets.length;
    const isFirst = app.editor.sheetIndex === 0;
    const isLast = app.editor.sheetIndex === count - 1;

    $('inspector').innerHTML = `
      <div class="insp-head"><div class="insp-title">Sayfa ${app.editor.sheetIndex + 1} / ${count}</div></div>
      ${count > 1 ? `<div class="insp-actions">
        <button type="button" class="btn btn-sm" id="sPrev" title="Önceki sayfayı aç (PageUp)"${isFirst ? ' disabled' : ''}>◀ Önceki sayfa</button>
        <button type="button" class="btn btn-sm" id="sNext" title="Sonraki sayfayı aç (PageDown)"${isLast ? ' disabled' : ''}>Sonraki sayfa ▶</button>
      </div>` : ''}
      ${inp('sTitle', 'Çizim adı', sheet.title)}
      ${sel('sSize', 'Sayfa boyutu (yatay)', SHEET_SIZES.map((s) => [s, s]), sheet.size)}
      <div class="insp-actions sheet-actions">
        <button type="button" class="btn btn-sm" id="sAdd">+ Yeni sayfa</button>
        <button type="button" class="btn btn-sm" id="sDup">Çoğalt</button>
        <button type="button" class="btn btn-sm" id="sDel"${count < 2 ? ' disabled' : ''}>Sil</button>
      </div>
      ${count > 1 ? `<div class="field-label">Sayfa sırası</div>
      <div class="insp-actions">
        <button type="button" class="btn btn-sm" id="sLeft" title="Bu sayfayı bir sıra öne alır"${isFirst ? ' disabled' : ''}>Öne al</button>
        <button type="button" class="btn btn-sm" id="sRight" title="Bu sayfayı bir sıra arkaya alır"${isLast ? ' disabled' : ''}>Arkaya al</button>
      </div>` : ''}
      <div class="field-help">Antetteki sayfa numarası (1 / 2, 2 / 2) ve sayfa bağlantıları (ŞEMA 2) sıra değişince kendiliğinden güncellenir.</div>
      ${hasLegend ? '' : '<button type="button" class="btn btn-sm" id="sLegend">Lejant ekle</button>'}

      <div class="insp-section">P&amp;ID bağlantısı</div>
      <div class="field-help">${app.pidSource || meta.pidProje ? `Kod kaynağı: <strong>${esc(app.pidSource || `P&ID projesi ${meta.pidProje}`)}</strong> · ${(app.pidProjectCodes || []).length} pnömatik kod` : 'Bu proje bir P&amp;ID projesine bağlı değil.'}</div>
      <div class="insp-actions"><button type="button" class="btn btn-sm" id="sPidPick">${meta.pidProje ? 'P&amp;ID projesini değiştir' : 'P&amp;ID projesi seç'}</button><button type="button" class="btn btn-sm" id="sGen">Otomatik Oluştur</button></div>
      ${toggle('mPidEtiket', 'Şemada P&amp;ID kodlarını [ ] içinde göster', meta.pidEtiket !== false)}

      <div class="insp-section">Antet ve kapak bilgileri</div>
      ${inp('mSeri', 'Proje no', meta.seriNo)}
      ${inp('mMusteri', 'Müşteri', meta.musteri)}
      ${inp('mModel', 'Model', meta.model)}
      ${app.projectId ? `<div class="field-help" id="mProjectName">Proje adı: <strong>${esc(app.projectId)}</strong></div>
      <button type="button" class="btn btn-sm" id="mRename" title="Proje no, müşteri ve model değişince proje klasörünün adını da günceller">Proje adını güncelle</button>` : ''}
      <div class="field-row">
        ${sel('mFirma', 'Marka', BRANDS, meta.firma)}
        ${sel('mDil', 'Dil', LANGS, meta.dil || 'tr')}
      </div>
      <div class="field-row">
        ${inp('mRev', 'Rev.', meta.rev, 'placeholder="00" title="00 ilk yayın, 01 birinci revizyon… Revizyon tablosu bu numaraya göre oluşur."')}
        ${inp('mTarih', revText ? `Tarih (Rev. ${esc(revText)})` : 'Tarih', meta.tarih, 'type="date"')}
      </div>
      ${inp('mHaz', 'Hazırlayan', meta.hazirlayan)}
      <div class="field-row">
        ${inp('mKontrol', 'Kontrol', meta.kontrol)}
        ${inp('mOnay', 'Onay', meta.onay)}
      </div>

      <div class="insp-section">Revizyonlar</div>
      ${revisionRowsHtml(meta)}
      ${revCurrent === null ? '' : `<div class="insp-actions">
        ${revCurrent < 99 ? `<button type="button" class="btn btn-sm" id="rNext" title="Yeni revizyon açar: tarihi bugün olur, kapak ve antet bu revizyonu gösterir">+ Rev. ${PidRevLog.label(revCurrent + 1)}</button>` : ''}
        ${revCurrent > 0 ? `<button type="button" class="btn btn-sm" id="rUndo" title="Son revizyon satırını siler, bir önceki revizyona döner">Rev. ${PidRevLog.label(revCurrent)} sil</button>` : ''}
      </div>`}

      <div class="insp-section">Kısayollar</div>
      <div class="field-help">V seç · L hat · T metin · R döndür · X aynala · F sığdır · [ küçült · ] büyüt (Shift: aralıklarla) · Ctrl+G grupla · Ctrl+Shift+G grubu çöz · Sağ tuş (veya orta tuş, Boşluk) + sürükle kaydır · Tekerlek yakınlaştır, Shift + tekerlek yana kaydır · PageUp / PageDown sayfa değiştir · Alt yakalamayı kapatır · Sağ tık iptal</div>
    `;

    onField('sPrev', 'click', () => app.goToSheet(-1));
    onField('sNext', 'click', () => app.goToSheet(1));
    onField('sAdd', 'click', () => app.addSheet());
    onField('sDup', 'click', () => app.duplicateSheet());
    onField('sLeft', 'click', () => app.moveSheet(-1));
    onField('sRight', 'click', () => app.moveSheet(1));
    onField('sDel', 'click', () => app.deleteSheet(app.editor.sheetIndex));
    onField('sTitle', 'change', (el) => {
      sheet.title = el.value.trim() || sheet.title;
      app.editor.renderPaper();
      app.editor.commit();
      app.renderSheets();
    });
    onField('sSize', 'change', (el) => {
      sheet.size = el.value;
      app.editor.renderAll();
      app.editor.fit();
      app.editor.commit();
    });
    onField('sLegend', 'click', () => {
      const g = PidSheet.geometry(sheet);
      const item = PidModel.addLegend(sheet, g.inner.x0 + 3, g.inner.y0 + 3);
      app.editor.renderItem(item);
      app.editor.commit();
      inspectSheet();
    });
    onField('sPidPick', 'click', () => app.pickPidProject());
    onField('sGen', 'click', () => app.openGenerator());
    onField('mPidEtiket', 'change', (el) => {
      meta.pidEtiket = el.checked;
      app.editor.ctx.showPid = el.checked;
      app.editor.renderAll();
      app.onMetaChange();
      inspectSheet();
    });

    const metaField = (id, key) => onField(id, 'change', (el) => {
      meta[key] = el.value.trim();
      app.onMetaChange();
    });
    metaField('mSeri', 'seriNo');
    metaField('mMusteri', 'musteri');
    metaField('mModel', 'model');
    onField('mRename', 'click', () => app.renameProject());
    metaField('mFirma', 'firma');
    metaField('mDil', 'dil');
    metaField('mKontrol', 'kontrol');
    metaField('mOnay', 'onay');
    bindRevisions(meta);
  }

  /* ─── Revizyonlar ─────────────────────────────────────── */

  /** Rev. 00'dan geçerli revizyona kadar her satır: tarih, hazırlayan, açıklama. Son satır antettekiyle aynıdır. */
  function revisionRowsHtml(meta) {
    if (PidRevLog.current(meta) === null) {
      return '<div class="field-help warn">Rev. numarası girin: 00 ilk yayın, 01 birinci revizyon… Revizyon tablosu bu numaraya göre oluşur.</div>';
    }
    const rows = PidRevLog.rows(meta).map((r) => {
      const name = `Rev. ${r.rev}`;
      return `<div class="rev-item${r.current ? ' current' : ''}">
        <div class="rev-head"><strong>${name}</strong><span>${esc(PidRevLog.title(r.n))}</span>${r.current ? '<em title="Kapakta ve antette yazan revizyon">Geçerli</em>' : ''}</div>
        <div class="field-row">
          <input class="field-input" type="date" data-rev-n="${r.n}" data-rev-key="tarih" value="${esc(r.tarih)}" aria-label="${name} tarihi" title="${name} tarihi${r.current ? ' (kapak ve antetteki tarih)' : ''}">
          <input class="field-input" data-rev-n="${r.n}" data-rev-key="hazirlayan" value="${esc(r.hazirlayan)}" placeholder="Hazırlayan" aria-label="${name} hazırlayan">
        </div>
        <input class="field-input" data-rev-n="${r.n}" data-rev-key="aciklama" value="${esc(r.aciklama)}" placeholder="${r.n === 0 ? 'İlk yayın' : 'Değişiklik açıklaması'}" aria-label="${name} açıklaması">
      </div>`;
    }).join('');
    const hidden = PidRevLog.rows(meta).length > PidRevLog.SHOWN ? ` Antette son ${PidRevLog.SHOWN} revizyon görünür.` : '';
    return `<div class="field-help">Kapak ve antetteki tarih, geçerli revizyonun tarihidir.${hidden}</div>${rows}`;
  }

  function bindRevisions(meta) {
    // Rev. değişince satırlar eklenir ya da (onayla) silinir; panel yeniden çizilir
    const goTo = async (value) => {
      await app.changeRevision(value);
      inspectSheet();
    };
    onField('mRev', 'change', (el) => goTo(el.value));
    onField('rNext', 'click', () => goTo(PidRevLog.current(meta) + 1));
    onField('rUndo', 'click', () => goTo(PidRevLog.current(meta) - 1));

    // Antetteki Tarih ve Hazırlayan, revizyon tablosunun son satırıdır; iki yerde de aynı görünür
    const syncInputs = () => {
      const cur = PidRevLog.current(meta);
      const set = (el, value) => { if (el && el !== document.activeElement) el.value = value; };
      set($('mTarih'), meta.tarih || '');
      set($('mHaz'), meta.hazirlayan || '');
      set(document.querySelector(`[data-rev-n="${cur}"][data-rev-key="tarih"]`), meta.tarih || '');
      set(document.querySelector(`[data-rev-n="${cur}"][data-rev-key="hazirlayan"]`), meta.hazirlayan || '');
    };
    const antetField = (id, key) => onField(id, 'change', (el) => {
      meta[key] = el.value.trim();
      app.onMetaChange();
      syncInputs();
    });
    antetField('mTarih', 'tarih');
    antetField('mHaz', 'hazirlayan');
    document.querySelectorAll('[data-rev-key]').forEach((el) => el.addEventListener('change', () => {
      PidRevLog.setField(meta, parseInt(el.dataset.revN, 10), el.dataset.revKey, el.value.trim());
      app.onMetaChange();
      syncInputs();
    }));
  }

  function renderInspector() {
    const items = app.editor.selectedItems();
    if (!items.length) inspectSheet();
    else if (items.length > 1) inspectMultiple(items);
    else if (PidModel.isSymbol(items[0])) inspectSymbol(items[0]);
    else if (PidModel.isLine(items[0])) inspectLine(items[0]);
    else if (items[0].type === 'text') inspectText(items[0]);
    else inspectLegend();
  }

  function focusField(item) {
    selectTab('right', 'props');
    const id = PidModel.isSymbol(item) ? 'fTag' : item.type === 'text' ? 'fText' : PidModel.isLine(item) ? 'fLabel' : null;
    const el = id && document.getElementById(id);
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
  }

  /* ─── Kontrol ─────────────────────────────────────────── */

  function renderChecks() {
    const logic = PidReport.current();
    const rank = { error: 0, warn: 1, info: 2 };
    const issues = PidChecks.run(app.editor.drawing, app.catalogLookup, null, app.editor.project)
      .concat(logic ? logic.hints : [])
      .sort((a, b) => rank[a.level] - rank[b.level]);
    const serious = issues.filter((i) => i.level !== 'info').length;
    const badge = $('checkBadge');
    badge.textContent = serious;
    badge.classList.toggle('hidden', serious === 0);
    const list = $('checkList');
    if (!issues.length) {
      list.innerHTML = '<div class="check-ok">✓ Sorun bulunamadı</div>';
      return;
    }
    list.innerHTML = issues.map((i, n) =>
      `<button type="button" class="check-row${i.itemId || i.pid ? '' : ' static'}" data-index="${n}"><span class="check-dot ${i.level}"></span><span>${esc(i.msg)}</span></button>`).join('');
    list.querySelectorAll('.check-row').forEach((row) => {
      const issue = issues[parseInt(row.dataset.index, 10)];
      if (issue.itemId) row.addEventListener('click', () => app.editor.focusItem(issue.sheetId, issue.itemId));
      else if (issue.pid) row.addEventListener('click', () => app.linkPidCode(issue.pid));
    });
  }

  /* ─── Sekmeler ────────────────────────────────────────── */

  function selectTab(panel, tab) {
    const nav = document.querySelector(`.panel-tabs[data-panel="${panel}"]`);
    nav.querySelectorAll('.panel-tab').forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('active', active);
      document.getElementById(`tab-${b.dataset.tab}`).classList.toggle('hidden', !active);
    });
    if (tab === 'files') renderFiles();
    if (tab === 'codes') renderCodes();
    if (tab === 'checks') renderChecks();
  }

  function bindTabs() {
    document.querySelectorAll('.panel-tabs').forEach((nav) => {
      nav.addEventListener('click', (e) => {
        const b = e.target.closest('.panel-tab');
        if (b) selectTab(nav.dataset.panel, b.dataset.tab);
      });
    });
  }

  function renderLayers() {
    $('layerToggles').innerHTML = LAYERS.map(([id, label]) =>
      `<label class="toggle-inline"><input type="checkbox" data-layer="${id}" checked> ${label}</label>`).join('');
    $('layerToggles').addEventListener('change', (e) => {
      const layer = e.target.dataset.layer;
      if (layer) app.editor.setLayerHidden(layer, !e.target.checked);
    });
  }

  function init(appRef) {
    app = appRef;
    bindSymbols();
    bindCodes();
    bindFiles();
    bindTabs();
    renderSymbols();
    renderLayers();
  }

  function setCatalog() {
    let dl = document.getElementById('catalogCodes');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'catalogCodes';
      document.body.appendChild(dl);
    }
    dl.innerHTML = app.catalog
      .filter((c) => PNEU_SERIES.has(c.category))
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    renderSeriesOptions();
  }

  return {
    init,
    setCatalog,
    renderCodes,
    renderChecks,
    renderInspector,
    renderFiles,
    markPlacing,
    focusField,
    selectTab
  };
})();
