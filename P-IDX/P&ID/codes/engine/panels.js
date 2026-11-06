/* Yan paneller: sembol paleti, kod listesi, proje dosyaları, özellikler, kontrol. */

const PidPanels = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const LANGS = [['tr', 'Türkçe'], ['en', 'English'], ['de', 'Deutsch']];
  const BRANDS = [['DOLFIN', 'DOLFIN'], ['ENVA', 'ENVA'], ['VICO', 'VICO'], ['KSYSTEM', 'K.SYSTEM']];
  const SHEET_SIZES = ['A3', 'A2', 'A1', 'A4'];
  const LAYERS = [['process', 'Proses'], ['inst', 'Enstrüman'], ['pneu', 'Pnömatik'], ['option', 'Opsiyon'], ['rev', 'Revizyon']];
  const ARROWS = [['mid', 'Hat ortasında'], ['end', 'Hat sonunda'], ['none', 'Yok']];

  let app = null;

  /* ─── Sembol paleti ───────────────────────────────────── */

  const thumbCache = new Map();
  function thumb(id, size) {
    const key = `${id}:${size}`;
    if (!thumbCache.has(key)) thumbCache.set(key, PidSymbols.thumbnail(id, size));
    return thumbCache.get(key);
  }

  /** Aramada kod serisi de geçerli: "LS", "PPS", hatta "LS01" o serinin sembollerini getirir */
  function matchesSeries(def, query) {
    const series = query.replace(/\d+$/, '');
    return !!series && PidSymbols.seriesOf(def.id).some((s) => PidSymbols.normalize(s) === series);
  }

  function renderSymbols() {
    const query = PidSymbols.normalize($('symbolSearch').value.trim());
    const list = $('symbolList');
    const html = [];
    for (const cat of PidSymbols.CATEGORIES) {
      const items = PidSymbols.list().filter((d) => d.cat === cat.id &&
        (!query || matchesSeries(d, query) || PidSymbols.normalize(`${d.name.tr} ${d.name.en} ${d.name.de} ${cat.name}`).includes(query)));
      if (!items.length) continue;
      html.push(`<div class="sym-cat">${esc(cat.name)}</div><div class="sym-grid">`);
      for (const d of items) {
        const series = PidSymbols.seriesOf(d.id).join(' · ');
        html.push(`<button type="button" class="sym-tile" draggable="true" data-symbol="${d.id}" title="${esc(d.name.tr)}">${series ? `<em class="sym-series">${esc(series)}</em>` : ''}${thumb(d.id, 34)}<span>${esc(d.name.tr)}</span></button>`);
      }
      html.push('</div>');
    }
    list.innerHTML = html.join('') || '<div class="file-empty">Sembol bulunamadı</div>';
    markPlacing();
  }

  function markPlacing() {
    const placing = app && app.editor ? app.editor.placing : null;
    // Çizimde zaten olan su tankı soluk görünür, ikinci kez konmaz
    const placed = app && app.editor && typeof PidPresets !== 'undefined' ? PidPresets.usedPresets(app.editor.drawing) : new Set();
    document.querySelectorAll('.sym-tile').forEach((el) => {
      el.classList.toggle('active', !!placing && placing.keep && placing.symbol === el.dataset.symbol);
      const used = placed.has(el.dataset.symbol);
      el.classList.toggle('used', used);
      el.title = used ? `${PidSymbols.get(el.dataset.symbol).name.tr}: çizimde var` : PidSymbols.get(el.dataset.symbol).name.tr;
    });
    document.querySelectorAll('.code-row').forEach((el) => {
      el.classList.toggle('active', !!placing && placing.tag === el.dataset.code);
    });
  }

  function bindSymbols() {
    $('symbolSearch').addEventListener('input', renderSymbols);
    const list = $('symbolList');
    list.addEventListener('click', (e) => {
      const tile = e.target.closest('.sym-tile');
      if (!tile) return;
      const current = app.editor.placing;
      if (current && current.keep && current.symbol === tile.dataset.symbol) {
        app.editor.cancelPlacing();
        return;
      }
      app.editor.startPlacing({ symbol: tile.dataset.symbol, keep: true });
    });
    list.addEventListener('dragstart', (e) => {
      const tile = e.target.closest('.sym-tile');
      if (!tile) return;
      e.dataTransfer.setData('text/plain', tile.dataset.symbol);
      e.dataTransfer.effectAllowed = 'copy';
      app.editor.startPlacing({ symbol: tile.dataset.symbol, keep: false });
    });
    list.addEventListener('dragend', () => app.editor.cancelPlacing());
  }

  /* ─── Kod listesi ─────────────────────────────────────── */

  function renderSeriesOptions() {
    const select = $('codeSeries');
    const series = [...new Set(app.catalog.map((c) => c.category))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr'));
    select.innerHTML = '<option value="">Tüm seriler</option>' +
      series.map((s) => `<option value="${esc(s)}">${esc(s)} (${app.catalog.filter((c) => c.category === s).length})</option>`).join('');
  }

  function renderMachineBar() {
    const bar = $('machineBar');
    bar.classList.toggle('hidden', !app.projectId);
    if (!app.projectId) return;
    const machine = app.machine;
    if (!machine) {
      bar.innerHTML = `
        <div class="mb-text"><strong>Makine kaydı yok</strong><span>Çizimdeki kodlarla kayıt açabilirsiniz</span></div>
        <div class="mb-actions"><button type="button" class="btn btn-sm" id="mbCreate">Kayıt oluştur</button></div>`;
      onField('mbCreate', 'click', () => app.createMachineFromProject());
      return;
    }
    const codes = new Set(machine.kodlar.map((k) => String(k).toUpperCase()));
    const used = PidModel.usedTags(app.editor.drawing);
    const drawn = [...codes].filter((c) => used.has(c)).length;
    const extra = app.usedCodesOutsideMachine().length;
    bar.innerHTML = `
      <div class="mb-text"><strong>${esc(machine.seriNo)} · ${esc(machine.firma)}</strong><span>${codes.size} kod · ${drawn} tanesi çizimde</span></div>
      <div class="mb-actions">
        ${drawn < codes.size ? `<button type="button" class="btn btn-sm btn-primary" id="mbDraft" title="Makine kaydındaki tankları ve hücreyi hazır gruplarıyla kurar, kalan kodları sayfanın altına dizer">Taslak çiz</button>` : ''}
        ${extra ? `<button type="button" class="btn btn-sm" id="mbAdd" title="Çizimde olup makine kaydında olmayan kodları ekler">Çizimdekileri ekle (${extra})</button>` : ''}
        <button type="button" class="btn btn-sm" id="mbEdit">Kaydı düzenle</button>
      </div>`;
    onField('mbAdd', 'click', () => app.addUsedToMachine());
    onField('mbDraft', 'click', () => app.createDraft());
    onField('mbEdit', 'click', () => app.editMachine());
  }

  /** Arama metni kod başına bir kez hazırlanır; her tuşta tüm liste yeniden sadeleştirilmez */
  const searchKeys = new WeakMap();
  function searchKey(entry) {
    let key = searchKeys.get(entry);
    if (key === undefined) {
      key = PidSymbols.normalize(`${entry.id} ${entry.name}`);
      searchKeys.set(entry, key);
    }
    return key;
  }

  const codeSymbols = new WeakMap();
  function symbolOfCode(entry) {
    let symbol = codeSymbols.get(entry);
    if (symbol === undefined) {
      symbol = PidSymbols.suggest(entry.id, entry.name).symbol;
      codeSymbols.set(entry, symbol);
    }
    return symbol;
  }

  /* Kod satırlarındaki küçük semboller tek bir tanımdan gelir: 400 satırda çizim 400 kez kopyalanmaz */
  function ensureSymbolSprite() {
    if ($('symbolSprite')) return;
    const defs = PidSymbols.all().map((d) => PidSymbols.thumbnail(d.id, 24)
      .replace(/^<svg /, `<symbol id="pidsym-${d.id}" `)
      .replace(/ width="24" height="24"/, '')
      .replace(/<\/svg>$/, '</symbol>')).join('');
    const holder = document.createElement('div');
    holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" id="symbolSprite" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${defs}</svg>`;
    document.body.appendChild(holder.firstChild);
  }

  const debounce = (fn, ms) => {
    let timer = null;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  };

  /** Kodlar sekmesi kapalıyken liste üretilmez; sekme açılınca selectTab güncel hâlini çizer */
  const codesVisible = () => !$('tab-codes').classList.contains('hidden');

  function renderCodes() {
    if (!codesVisible()) return;
    renderMachineBar();
    renderCodeRows();
  }

  function renderCodeRows() {
    ensureSymbolSprite();
    const list = $('codeList');
    const query = PidSymbols.normalize($('codeSearch').value.trim());
    const series = $('codeSeries').value;
    const filter = $('codeFilter').value;
    const used = PidModel.usedTags(app.editor.drawing);
    const machine = new Set((app.machineCodes || []).map((c) => String(c).toUpperCase()));
    const rows = app.catalog.filter((c) => {
      if (series && c.category !== series) return false;
      if (filter === 'used' && !used.has(c.id)) return false;
      if (filter === 'unused' && used.has(c.id)) return false;
      if (filter === 'machine' && !machine.has(c.id)) return false;
      if (!query) return true;
      return searchKey(c).includes(query);
    });
    if (query) {
      // Koduyla başlayanlar önce: "PS0" aramasında PPS kodları öne geçmesin
      const starts = (c) => (PidSymbols.normalize(c.id).startsWith(query) ? 0 : 1);
      rows.sort((a, b) => starts(a) - starts(b));
    }
    if (!rows.length) {
      const none = app.machine ? 'Makine kaydında kod yok' : 'Bu proje için makine kaydı yok';
      list.innerHTML = `<div class="file-empty">${filter === 'machine' && !machine.size ? none : 'Kod bulunamadı'}</div>`;
      return;
    }
    list.innerHTML = rows.map((c) => {
      const isUsed = used.has(c.id);
      const flag = c.ambiguous && c.ambiguous.length > 1
        ? `<span class="code-flag" title="Listede farklı anlamlarla geçiyor: ${esc(c.ambiguous.join(' / '))}">⚠</span>`
        : isUsed ? '<span class="code-used" title="Çizimde kullanılıyor">✓</span>' : '';
      const inMachine = machine.has(c.id);
      const star = app.machine
        ? `<span class="code-star${inMachine ? ' on' : ''}" data-star="${esc(c.id)}" title="${inMachine ? 'Makine kaydından çıkar' : 'Makine kaydına ekle'}">${inMachine ? '★' : '☆'}</span>`
        : '';
      const symbol = symbolOfCode(c);
      return `<button type="button" class="code-row${isUsed ? ' is-used' : ''}" draggable="true" data-code="${esc(c.id)}"><svg class="code-sym"><title>${esc(PidSymbols.get(symbol).name.tr)}</title><use href="#pidsym-${symbol}"/></svg><span class="code-tag">${esc(c.id)}</span><span class="code-name">${esc(c.name)}</span><span class="code-marks">${flag}${star}</span></button>`;
    }).join('');
    markPlacing();
  }

  function placingSpecForCode(code, keep) {
    const entry = app.catalogMap.get(code);
    const s = PidSymbols.suggest(code, entry ? entry.name : '');
    return { symbol: s.symbol, tag: code, func: s.func, keep };
  }

  /* ─── Kod alanı önerileri ─────────────────────────────── */

  const MAX_SUGGESTIONS = 12;

  /** Önce koduyla başlayanlar, sonra adında geçenler; ilk birkaç sonuçta durur */
  function codeSuggestions(text) {
    const query = PidSymbols.normalize(text.trim());
    if (!query) return [];
    const upper = text.trim().toUpperCase();
    const first = [];
    const rest = [];
    for (const c of app.catalog) {
      if (c.id.startsWith(upper)) {
        first.push(c);
        if (first.length === MAX_SUGGESTIONS) break;
      } else if (rest.length < MAX_SUGGESTIONS && searchKey(c).includes(query)) {
        rest.push(c);
      }
    }
    return first.concat(rest).slice(0, MAX_SUGGESTIONS);
  }

  /**
   * Tarayıcının açılır listesi (datalist) her tuşta yüzlerce seçeneği yeniden dizer ve kod girerken takılır.
   * Bu liste yalnız birkaç sonuç gösterir. Seçim alanın "change" olayıyla aynı yoldan işlenir.
   */
  function bindCodeSuggest(input, box) {
    let active = -1;
    let frame = 0;
    const rows = () => box.querySelectorAll('.cs-row');
    const close = () => {
      cancelAnimationFrame(frame);
      active = -1;
      box.classList.add('hidden');
      box.innerHTML = '';
    };
    const mark = () => rows().forEach((row, i) => row.classList.toggle('active', i === active));
    const pick = (code) => {
      close();
      input.value = code;
      input.dispatchEvent(new Event('change'));
    };
    const update = () => {
      const found = codeSuggestions(input.value);
      active = -1;
      box.innerHTML = found.map((c) => `<div class="cs-row" data-code="${esc(c.id)}"><strong>${esc(c.id)}</strong><span>${esc(c.name)}</span></div>`).join('');
      box.classList.toggle('hidden', !found.length);
    };
    // Hızlı yazarken ekran karesi başına bir kez aranır
    input.addEventListener('input', () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    });
    input.addEventListener('blur', close);
    input.addEventListener('keydown', (e) => {
      const open = !box.classList.contains('hidden');
      if (!open) return;
      const count = rows().length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = e.key === 'ArrowDown' ? (active + 1) % count : (active - 1 + count) % count;
        mark();
        rows()[active].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        if (active >= 0) {
          e.preventDefault();
          pick(rows()[active].dataset.code);
        } else {
          close();
        }
      } else if (e.key === 'Escape') {
        // Yalnız liste kapanır; alan odakta kalır
        e.stopPropagation();
        close();
      }
    });
    // Odak alanda kalsın: blur listeyi tıklamadan önce kapatmasın
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const row = e.target.closest('.cs-row');
      if (row) pick(row.dataset.code);
    });
  }

  function bindCodes() {
    $('codeSearch').addEventListener('input', debounce(renderCodeRows, 70));
    $('codeSeries').addEventListener('change', renderCodeRows);
    $('codeFilter').addEventListener('change', renderCodeRows);
    const list = $('codeList');
    list.addEventListener('click', (e) => {
      const star = e.target.closest('[data-star]');
      if (star) {
        app.toggleMachineCode(star.dataset.star);
        return;
      }
      const row = e.target.closest('.code-row');
      if (!row) return;
      const code = row.dataset.code;
      const uses = PidModel.usedTags(app.editor.drawing).get(code);
      if (uses) {
        app.editor.focusItem(uses[0].sheetId, uses[0].itemId);
        return;
      }
      app.editor.startPlacing(placingSpecForCode(code, false));
    });
    list.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.code-row');
      if (!row) return;
      e.dataTransfer.setData('text/plain', row.dataset.code);
      e.dataTransfer.effectAllowed = 'copy';
      app.editor.startPlacing(placingSpecForCode(row.dataset.code, false));
    });
    list.addEventListener('dragend', () => app.editor.cancelPlacing());
  }

  /* ─── Proje dosyaları ─────────────────────────────────── */

  function formatSize(bytes) {
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  }

  /** Pencereye dönünce de çalışır: liste değişmediyse dokunulmaz ki o anki tıklama kaybolmasın */
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

  function symbolOptions() {
    return PidSymbols.CATEGORIES.map((cat) => {
      const items = PidSymbols.list().filter((d) => d.cat === cat.id);
      return `<optgroup label="${esc(cat.name)}">${items.map((d) => `<option value="${d.id}">${esc(d.name.tr)}</option>`).join('')}</optgroup>`;
    }).join('');
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

  function inspectSymbol(item) {
    const def = PidSymbols.get(item.symbol);
    const entry = app.catalogMap.get(String(item.tag || '').toUpperCase());
    const suggestion = item.tag ? PidSymbols.suggest(item.tag, entry ? entry.name : '') : null;
    let help = '';
    if (item.tag && entry) {
      const amb = entry.ambiguous && entry.ambiguous.length > 1;
      help = `<div class="field-help${amb ? ' warn' : ''}">${amb ? `⚠ Listede farklı anlamlarla geçiyor: ${esc(entry.ambiguous.join(' / '))}` : esc(entry.name)}</div>`;
    } else if (item.tag) {
      help = '<div class="field-help warn">Bu kod listede yok</div>';
    }
    // ISA dairesi (ZSO, ZSC) ile önerilen silindir gövdeli sensör aynı şeydir; geçiş önerilmez
    const canSwap = suggestion && suggestion.symbol !== item.symbol && suggestion.symbol !== def.altOf && item.tag && entry;

    $('inspector').innerHTML = `
      <div class="insp-head">
        <div class="insp-thumb">${thumb(item.symbol, 34)}</div>
        <div><div class="insp-title">${esc(def.name.tr)}</div><div class="insp-sub">${esc((PidSymbols.CATEGORIES.find((c) => c.id === def.cat) || {}).name || '')}</div></div>
      </div>
      <div class="field code-field">
        <label for="fTag">Kod</label>
        <input id="fTag" class="field-input" value="${esc(item.tag || '')}" autocomplete="off" placeholder="Örn: V61">
        <div id="fTagSuggest" class="code-suggest hidden"></div>
        ${help}
        ${canSwap ? `<button type="button" class="btn btn-sm" id="fSwap">Önerilen sembole geç: ${esc(PidSymbols.get(suggestion.symbol).name.tr)}</button>` : ''}
      </div>
      ${def.isInstrument ? inp('fFunc', 'ISA harfi', item.func || '', 'placeholder="LSL, ZSO, PT, TE…"') : ''}
      ${inp('fNote', def.container ? 'Ad' : def.tag === 'none' || def.cat === 'pipe' ? 'Etiket' : 'Not', item.note || '')}
      <div class="field"><label for="fSymbol">Sembol</label><select id="fSymbol" class="field-input">${symbolOptions()}</select></div>
      ${def.resizable ? `<div class="field-row">${inp('fW', 'Genişlik (mm)', item.w, 'type="number" step="2.5" min="10"')}${inp('fH', 'Yükseklik (mm)', item.h, 'type="number" step="2.5" min="10"')}</div>` : ''}
      ${percentField('fScale', 'Boyut (%)', PidModel.selectionPercent([item]), 'Örn: 70')}
      ${!def.resizable ? `<div class="insp-actions"><button type="button" class="btn btn-sm" id="fRotate">Döndür 90°</button><button type="button" class="btn btn-sm" id="fFlip">Aynala</button></div>` : ''}
      ${groupRow(item)}
      ${moveSheetField()}
      ${toggle('fOptional', 'Opsiyon (kırmızı)', item.optional)}
      ${item.tagOffset ? '<button type="button" class="btn btn-sm" id="fTagReset">Etiket konumunu sıfırla</button>' : ''}
    `;

    $('fSymbol').value = item.symbol;
    bindCodeSuggest($('fTag'), $('fTagSuggest'));

    /** Sembol değişirken hat uçları ve ölçüler uyarlanır */
    const swapTo = (symbolId) => {
      const next = PidSymbols.get(symbolId);
      const props = { symbol: symbolId };
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
      return props;
    };

    onField('fTag', 'change', (el) => {
      const tag = el.value.trim().toUpperCase();
      const props = { tag };
      const found = app.catalogMap.get(tag);
      const s = PidSymbols.suggest(tag, found ? found.name : '');
      if (def.isInstrument && found && s.func) props.func = s.func;
      // Genel dairedeki kod, kodu girilince kendi sembolüne geçer; özellikle seçilmiş sembole dokunulmaz
      if (tag && item.symbol === 'i.field' && s.symbol !== 'i.field') {
        Object.assign(props, swapTo(s.symbol));
        if (s.func) props.func = s.func;
      }
      app.editor.updateItem(item, props);
      inspectSymbol(item);
    });
    onField('fFunc', 'change', (el) => app.editor.updateItem(item, { func: el.value.trim().toUpperCase() }));
    onField('fNote', 'change', (el) => app.editor.updateItem(item, { note: el.value }));
    onField('fSymbol', 'change', (el) => {
      app.editor.updateItem(item, swapTo(el.value));
      inspectSymbol(item);
    });
    onField('fSwap', 'click', () => {
      const props = swapTo(suggestion.symbol);
      if (suggestion.func !== undefined) props.func = suggestion.func;
      app.editor.updateItem(item, props);
      inspectSymbol(item);
    });
    onField('fW', 'change', (el) => { app.editor.updateItem(item, { w: Math.max(10, parseFloat(el.value) || item.w) }); });
    onField('fH', 'change', (el) => { app.editor.updateItem(item, { h: Math.max(10, parseFloat(el.value) || item.h) }); });
    onField('fScale', 'change', (el) => {
      const pct = readPercent(el.value);
      if (pct !== null) app.editor.scaleSelection(pct / 100, { absolute: true });
      else inspectSymbol(item);
    });
    bindGroupRow(item);
    bindMoveSheet();
    onField('fRotate', 'click', () => app.editor.rotateSelection());
    onField('fFlip', 'click', () => app.editor.flipSelection());
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
    return node.tag || (def ? def.name.tr : 'Sembol');
  }

  function inspectLine(line) {
    const kinds = Object.entries(PidSymbols.LINE_KINDS).map(([k, m]) => [k, m.name.tr]);
    const sheet = app.editor.sheet;
    $('inspector').innerHTML = `
      <div class="insp-head"><div><div class="insp-title">Hat</div><div class="insp-sub">${esc(endName(sheet, line.from))} → ${esc(endName(sheet, line.to))}</div></div></div>
      ${sel('fKind', 'Hat tipi', kinds, line.kind)}
      ${inp('fLabel', 'Hat numarası', line.label || '', 'placeholder="Örn: L-01"')}
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
        ${sel('fSize', 'Yazı boyutu', [['2.5', '2,5 mm'], ['3.5', '3,5 mm'], ['5', '5 mm'], ['7', '7 mm']], String(item.size))}
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

  function inspectLegend(item) {
    $('inspector').innerHTML = `
      <div class="insp-head"><div class="insp-title">Lejant</div></div>
      <div class="field-help">Bu sayfadaki hat tipleri ve semboller otomatik listelenir. Sürükleyerek taşıyabilirsiniz.</div>
      ${groupRow(item)}
    `;
    bindGroupRow(item);
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
    const revRows = (meta.revizyonlar || []).map((r, i) => `<div class="rev-row"><strong>${esc(r.rev)}</strong><span>${esc(r.aciklama)}</span><button type="button" class="rev-del" data-rev="${i}" title="Sil">×</button></div>`).join('');
    const isFirst = app.editor.sheetIndex === 0;
    const isLast = app.editor.sheetIndex === app.editor.drawing.sheets.length - 1;

    $('inspector').innerHTML = `
      <div class="insp-head"><div class="insp-title">Sayfa ${app.editor.sheetIndex + 1} / ${app.editor.drawing.sheets.length}</div></div>
      ${app.editor.drawing.sheets.length > 1 ? `<div class="insp-actions">
        <button type="button" class="btn btn-sm" id="sPrev" title="Önceki sayfayı aç (PageUp)"${isFirst ? ' disabled' : ''}>◀ Önceki sayfa</button>
        <button type="button" class="btn btn-sm" id="sNext" title="Sonraki sayfayı aç (PageDown)"${isLast ? ' disabled' : ''}>Sonraki sayfa ▶</button>
      </div>` : ''}
      ${inp('sTitle', 'Çizim adı', sheet.title)}
      ${sel('sSize', 'Sayfa boyutu (yatay)', SHEET_SIZES.map((s) => [s, s]), sheet.size)}
      <div class="insp-actions sheet-actions">
        <button type="button" class="btn btn-sm" id="sAdd">+ Yeni sayfa</button>
        <button type="button" class="btn btn-sm" id="sDup">Çoğalt</button>
        <button type="button" class="btn btn-sm" id="sDel"${app.editor.drawing.sheets.length < 2 ? ' disabled' : ''}>Sil</button>
      </div>
      <button type="button" class="btn btn-sm" id="sImport" title="Başka projenin çizim tahtasındaki her şeyi bu projeye kopyalar; antet ve proje bilgileri kalır">Başka projeden çizim al…</button>
      ${app.editor.drawing.sheets.length > 1 ? `<div class="field-label">Sayfa sırası</div>
      <div class="insp-actions">
        <button type="button" class="btn btn-sm" id="sLeft" title="Bu sayfayı bir sıra öne alır"${isFirst ? ' disabled' : ''}>Öne al</button>
        <button type="button" class="btn btn-sm" id="sRight" title="Bu sayfayı bir sıra arkaya alır"${isLast ? ' disabled' : ''}>Arkaya al</button>
      </div>` : ''}
      <div class="field-help">Antetteki sayfa numarası (1 / 2, 2 / 2) kendiliğinden yazılır.</div>
      ${hasLegend ? '' : '<button type="button" class="btn btn-sm" id="sLegend">Lejant ekle</button>'}

      <div class="insp-section">Antet ve kapak bilgileri</div>
      ${inp('mSeri', 'Proje no', meta.seriNo)}
      ${inp('mMusteri', 'Müşteri', meta.musteri)}
      ${inp('mModel', 'Model', meta.model)}
      <div class="field-row">
        ${sel('mFirma', 'Marka', BRANDS, meta.firma)}
        ${sel('mDil', 'Dil', LANGS, meta.dil || 'tr')}
      </div>
      <div class="field-row">
        ${inp('mRev', 'Rev.', meta.rev)}
        ${inp('mTarih', 'Tarih', meta.tarih, 'type="date"')}
      </div>
      ${inp('mHaz', 'Hazırlayan', meta.hazirlayan)}
      <div class="field-row">
        ${inp('mKontrol', 'Kontrol', meta.kontrol)}
        ${inp('mOnay', 'Onay', meta.onay)}
      </div>

      <div class="insp-section">Revizyon geçmişi</div>
      ${revRows || '<div class="field-help">Kayıt yok</div>'}
      <div class="field-row">
        ${inp('rRev', 'Rev.', '', 'placeholder="02"')}
        ${inp('rDesc', 'Açıklama', '', 'placeholder="Değişiklik"')}
      </div>
      <button type="button" class="btn btn-sm" id="rAdd">Revizyon ekle</button>

      <div class="insp-section">Kısayollar</div>
      <div class="field-help">V seç · L hat · T metin · R döndür · X aynala · F sığdır · [ küçült · ] büyüt (Shift: aralıklarla) · Ctrl+G grupla · Ctrl+Shift+G grubu çöz · Sağ tuş veya Boşluk + sürükle gezin · PageUp / PageDown sayfa değiştir · Alt yakalamayı kapatır · Sağ tık iptal</div>
    `;

    onField('sPrev', 'click', () => app.goToSheet(-1));
    onField('sNext', 'click', () => app.goToSheet(1));
    onField('sAdd', 'click', () => app.addSheet());
    onField('sDup', 'click', () => app.duplicateSheet());
    onField('sImport', 'click', () => app.importDrawingModal());
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

    const metaField = (id, key) => onField(id, 'change', (el) => {
      meta[key] = el.value.trim();
      app.onMetaChange();
    });
    metaField('mSeri', 'seriNo');
    metaField('mMusteri', 'musteri');
    metaField('mModel', 'model');
    metaField('mFirma', 'firma');
    metaField('mDil', 'dil');
    metaField('mRev', 'rev');
    metaField('mTarih', 'tarih');
    metaField('mHaz', 'hazirlayan');
    metaField('mKontrol', 'kontrol');
    metaField('mOnay', 'onay');

    onField('rAdd', 'click', () => {
      const rev = $('rRev').value.trim();
      const aciklama = $('rDesc').value.trim();
      if (!rev || !aciklama) {
        app.toast('Rev. ve açıklama gerekli', 'error');
        return;
      }
      meta.revizyonlar = meta.revizyonlar || [];
      meta.revizyonlar.push({ rev, aciklama, tarih: meta.tarih, hazirlayan: meta.hazirlayan });
      meta.rev = rev;
      // Çizimin bu anki hâli saklanır; önceki revizyondan bu yana değişenler bulutla işaretlenir
      PidRevisions.record(app.editor.drawing, rev);
      app.editor.commit();
      app.onMetaChange();
      inspectSheet();
      const marked = PidRevisions.active(app.editor.drawing);
      app.toast(marked
        ? `Rev. ${rev} eklendi. Rev. ${marked.base.rev}'den bu yana değişenler bulutla işaretlendi (alt çubuktaki "Revizyon" ile gizlenir).`
        : `Rev. ${rev} eklendi. Bundan sonraki revizyonda bu hâlden farklar bulutla işaretlenecek.`);
    });
    document.querySelectorAll('[data-rev]').forEach((b) => b.addEventListener('click', () => {
      const [removed] = meta.revizyonlar.splice(parseInt(b.dataset.rev, 10), 1);
      if (removed) PidRevisions.forget(app.editor.drawing, removed.rev);
      app.editor.commit();
      app.onMetaChange();
      inspectSheet();
    }));
  }

  function renderInspector() {
    const items = app.editor.selectedItems();
    if (!items.length) inspectSheet();
    else if (items.length > 1) inspectMultiple(items);
    else if (PidModel.isSymbol(items[0])) inspectSymbol(items[0]);
    else if (PidModel.isLine(items[0])) inspectLine(items[0]);
    else if (items[0].type === 'text') inspectText(items[0]);
    else inspectLegend(items[0]);
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
    const issues = PidChecks.run(app.editor.drawing, app.catalogLookup, app.machineCodes, app.editor.project)
      .concat(logic ? logic.hints : [])
      .sort((a, b) => rank[a.level] - rank[b.level]);
    const serious = issues.filter((i) => i.level !== 'info').length;
    const badge = $('checkBadge');
    badge.textContent = serious;
    badge.classList.toggle('hidden', serious === 0);
    // Sekme kapalıyken yalnız sayaç güncellenir; liste sekme açılınca çizilir
    if ($('tab-checks').classList.contains('hidden')) return;
    const list = $('checkList');
    if (!issues.length) {
      list.innerHTML = '<div class="check-ok">✓ Sorun bulunamadı</div>';
      return;
    }
    list.innerHTML = issues.map((i, n) =>
      `<button type="button" class="check-row${i.itemId ? '' : ' static'}" data-index="${n}"><span class="check-dot ${i.level}"></span><span>${esc(i.msg)}</span></button>`).join('');
    list.querySelectorAll('.check-row').forEach((row) => {
      const issue = issues[parseInt(row.dataset.index, 10)];
      if (issue.itemId) row.addEventListener('click', () => app.editor.focusItem(issue.sheetId, issue.itemId));
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
