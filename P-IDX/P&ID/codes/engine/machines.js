/* Makine kayıtları ve kod listesi (eski ML uygulaması): proje ekranındaki Makineler ve Kod Listesi sekmeleri. */

const PidMachines = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const LEGACY_DONE_KEY = 'pidx_ml_legacy_done';

  let app = null;
  let kodlar = [];
  let makineler = [];
  let loadError = null;
  let activeId = null;
  let selected = new Set();
  let editingCode = null;

  const normalizeKod = (kod) => String(kod || '').trim().toUpperCase();
  const fold = (text) => PidSymbols.normalize(text);
  const sortedCodes = () => kodlar.slice().sort((a, b) => a.kod.localeCompare(b.kod, 'tr'));
  const activeMachine = () => makineler.find((m) => m.id === activeId) || null;

  function extractSeri(kod) {
    const match = String(kod).match(/^([A-Za-z]+)\d/);
    return match ? match[1].toUpperCase() : String(kod).toUpperCase();
  }

  function seriesList() {
    const counts = new Map();
    for (const item of kodlar) {
      const seri = extractSeri(item.kod);
      counts.set(seri, (counts.get(seri) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }

  function matches(code, filter) {
    const seri = normalizeKod(filter.seri);
    if (seri && !normalizeKod(code.kod).startsWith(seri)) return false;
    const words = fold(filter.aciklama.trim()).split(/\s+/).filter(Boolean);
    const text = fold(code.aciklama);
    return words.every((w) => text.includes(w));
  }

  function markKod(kod, seriQuery) {
    const q = normalizeKod(seriQuery);
    if (!q || !normalizeKod(kod).startsWith(q)) return esc(kod);
    return `<mark>${esc(kod.slice(0, q.length))}</mark>${esc(kod.slice(q.length))}`;
  }

  function markWords(text, query) {
    const words = query.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!words.length) return esc(text);
    return String(text).split(new RegExp(`(${words.join('|')})`, 'gi'))
      .map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part)))
      .join('');
  }

  function renderChips(containerId, inputId, onChange) {
    const current = normalizeKod($(inputId).value);
    const active = current && extractSeri(current) === current ? current : '';
    const box = $(containerId);
    box.innerHTML = seriesList().map(([seri, count]) =>
      `<button type="button" class="ml-chip${active === seri ? ' active' : ''}" data-seri="${esc(seri)}" title="${count} kod">${esc(seri)} <span>${count}</span></button>`).join('');
    box.querySelectorAll('.ml-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $(inputId).value = normalizeKod($(inputId).value) === chip.dataset.seri ? '' : chip.dataset.seri;
        onChange();
      });
    });
  }

  function updateCounts() {
    $('machineCount').textContent = makineler.length || '';
    $('codeCount').textContent = kodlar.length || '';
  }

  /* ─── Makineler ───────────────────────────────────────── */

  function renderMachineList() {
    const list = $('mlMachineList');
    const query = fold($('mlMachineSearch').value.trim());
    const rows = makineler
      .filter((m) => !query || fold(`${m.seriNo} ${m.firma} ${m.model}`).includes(query))
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    if (!rows.length) {
      list.innerHTML = `<li class="ml-list-empty">${makineler.length ? 'Aramaya uyan kayıt yok' : 'Henüz makine kaydı yok'}</li>`;
      return;
    }
    list.innerHTML = rows.map((m) => `
      <li><button type="button" class="ml-list-item${m.id === activeId ? ' active' : ''}" data-id="${esc(m.id)}">
        <span class="ml-item-title">${esc(m.seriNo)}</span>
        <span class="ml-item-meta">${esc(m.firma)} · ${esc(m.model)}</span>
        <span class="ml-item-count">${m.kodlar.length} kod</span>
      </button></li>`).join('');
  }

  function machineFilter() {
    return { seri: $('mlFilterSeri').value, aciklama: $('mlFilterText').value };
  }

  function filteredCodes() {
    const filter = machineFilter();
    return sortedCodes().filter((k) => matches(k, filter));
  }

  function updateCheckCounts(filter, shown) {
    $('mlFilterResult').textContent = filter.seri || filter.aciklama
      ? `${selected.size} seçili · ${shown} kod gösteriliyor`
      : `${selected.size} seçili · tüm kodlar (${kodlar.length})`;
    $('mlSelectedCount').textContent = `${selected.size} seçili`;
  }

  function renderCodeChecks(keepScroll) {
    const wrap = $('mlCodeChecks');
    const filter = machineFilter();
    const all = sortedCodes();
    const filtered = all.filter((k) => matches(k, filter));
    const chosen = all.filter((k) => selected.has(k.kod));
    const others = filtered.filter((k) => !selected.has(k.kod));

    renderChips('mlSeriesChips', 'mlFilterSeri', () => renderCodeChecks(true));
    updateCheckCounts(filter, filtered.length);

    if (!kodlar.length) {
      wrap.innerHTML = '<p class="ml-note">Kod listesi boş. Kod Listesi sekmesinden kod ekleyin veya CSV yükleyin.</p>';
      return;
    }
    if (!chosen.length && !others.length) {
      wrap.innerHTML = '<p class="ml-note">Filtreye uygun kod bulunamadı</p>';
      return;
    }
    const row = (k, on) => `<label class="ml-check${on ? ' on' : ''}"><input type="checkbox" value="${esc(k.kod)}"${on ? ' checked' : ''}><span class="ml-check-kod">${markKod(k.kod, filter.seri)}</span><span class="ml-check-text">${markWords(k.aciklama, filter.aciklama)}</span></label>`;
    let html = '';
    if (chosen.length) {
      // İşaretlenen satır yerinde kalır, sayı üstteki "seçili" yazısındadır
      html += `<div class="ml-group">Seçili kodlar</div>${chosen.map((k) => row(k, true)).join('')}`;
    }
    if (others.length) {
      html += `<div class="ml-group">${chosen.length ? 'Diğer kodlar' : 'Tüm kodlar'}</div>${others.map((k) => row(k, false)).join('')}`;
    }
    const top = wrap.scrollTop;
    wrap.innerHTML = html;
    wrap.scrollTop = keepScroll ? top : 0;
  }

  function showForm(show) {
    $('mlMachineForm').classList.toggle('hidden', !show);
    $('mlEmpty').classList.toggle('hidden', show);
  }

  function resetFilters() {
    $('mlFilterSeri').value = '';
    $('mlFilterText').value = '';
  }

  function updateFormActions() {
    const machine = activeMachine();
    $('mlFormTitle').textContent = machine ? 'Makine Düzenle' : 'Yeni Makine';
    $('mlDelete').hidden = !machine;
    $('mlDownload').hidden = !machine;
    $('mlProject').hidden = !machine;
    if (machine) $('mlProject').textContent = app.projectForMachine(machine) ? 'Projeyi Aç' : 'Proje Oluştur';
  }

  function openMachine(id) {
    const machine = makineler.find((m) => m.id === id);
    if (!machine) return;
    activeId = id;
    $('mlSeri').value = machine.seriNo;
    $('mlFirma').value = machine.firma;
    $('mlModel').value = machine.model;
    resetFilters();
    selected = new Set(machine.kodlar);
    renderCodeChecks();
    showForm(true);
    updateFormActions();
    renderMachineList();
  }

  function newMachine() {
    activeId = null;
    $('mlMachineForm').reset();
    resetFilters();
    selected = new Set();
    renderCodeChecks();
    showForm(true);
    updateFormActions();
    renderMachineList();
    $('mlSeri').focus();
  }

  function closeForm() {
    activeId = null;
    showForm(false);
    renderMachineList();
  }

  function upsert(machine) {
    const index = makineler.findIndex((m) => m.id === machine.id);
    if (index >= 0) makineler[index] = machine;
    else makineler.push(machine);
    updateCounts();
    renderMachineList();
    if (activeId === machine.id && !$('mlMachineForm').classList.contains('hidden')) {
      selected = new Set(machine.kodlar);
      renderCodeChecks(true);
    }
  }

  async function submitMachine(e) {
    e.preventDefault();
    if (loadError) {
      app.toast(`Kayıtlar okunamadığı için kaydedilmedi: ${loadError}`, 'error');
      return;
    }
    const previous = activeMachine();
    const res = await PidxHost.ml.saveMachine(Object.assign({}, previous || {}, {
      seriNo: $('mlSeri').value,
      firma: $('mlFirma').value,
      model: $('mlModel').value,
      kodlar: [...selected]
    }));
    if (!res.ok) {
      app.toast(res.error, 'error');
      return;
    }
    activeId = res.machine.id;
    upsert(res.machine);
    updateFormActions();
    app.onMachinesChanged();
    app.toast(`${previous ? 'Makine güncellendi' : 'Makine kaydedildi'}: ${res.machine.kodlar.length} kod · ML/kayitlar/${res.machine._file}`);
  }

  async function deleteMachine() {
    const machine = activeMachine();
    if (!machine) return;
    if (!window.confirm(`"${machine.seriNo} · ${machine.firma}" kaydı ve ML/kayitlar/${machine._file} dosyası silinsin mi?`)) return;
    const res = await PidxHost.ml.deleteMachine(machine.id);
    if (!res.ok) {
      app.toast(res.error, 'error');
      return;
    }
    makineler = makineler.filter((m) => m.id !== machine.id);
    closeForm();
    updateCounts();
    app.onMachinesChanged();
    app.toast('Makine silindi');
  }

  function downloadMachine() {
    const machine = activeMachine();
    if (!machine) return;
    const clean = Object.assign({}, machine);
    delete clean._file;
    PidxHost.downloadBlob(new Blob([JSON.stringify(clean, null, 2)], { type: 'application/json' }), machine._file);
  }

  /* ─── Kod listesi ─────────────────────────────────────── */

  function renderCodeTable() {
    const filter = { seri: $('mlListSeri').value, aciklama: $('mlListText').value };
    const rows = sortedCodes().filter((k) => matches(k, filter));
    renderChips('mlListChips', 'mlListSeri', renderCodeTable);
    $('mlListResult').textContent = filter.seri || filter.aciklama
      ? `${rows.length} kod gösteriliyor (toplam ${kodlar.length})`
      : `${kodlar.length} kod`;
    const body = $('mlCodeBody');
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="3" class="ml-table-empty">${kodlar.length ? 'Filtreye uygun kod bulunamadı' : 'Kod listesi boş. Kod ekleyin veya CSV yükleyin.'}</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((k) => `<tr data-kod="${esc(k.kod)}" data-aciklama="${esc(k.aciklama)}">
      <td class="ml-td-kod">${markKod(k.kod, filter.seri)}</td>
      <td>${markWords(k.aciklama, filter.aciklama)}</td>
      <td class="ml-td-actions"><button type="button" class="btn btn-sm" data-act="edit">Düzenle</button> <button type="button" class="btn btn-sm" data-act="delete">Sil</button></td>
    </tr>`).join('');
  }

  function resetCodeForm() {
    editingCode = null;
    $('mlCodeForm').reset();
    $('mlCodeInput').disabled = false;
    $('mlCodeSubmit').textContent = 'Ekle';
    $('mlCodeCancel').hidden = true;
  }

  async function persistCodes(message) {
    const res = await PidxHost.ml.saveCodes(kodlar);
    if (!res.ok) {
      app.toast(`Kod listesi kaydedilemedi: ${res.error}`, 'error');
      await load();
      return false;
    }
    afterCodesChanged();
    if (message) app.toast(message);
    return true;
  }

  function afterCodesChanged() {
    updateCounts();
    renderCodeTable();
    if (!$('mlMachineForm').classList.contains('hidden')) renderCodeChecks(true);
    app.reloadCatalog();
  }

  async function submitCode(e) {
    e.preventDefault();
    if (loadError) {
      app.toast(`Kayıtlar okunamadığı için kaydedilmedi: ${loadError}`, 'error');
      return;
    }
    const kod = normalizeKod($('mlCodeInput').value);
    const aciklama = $('mlCodeText').value.trim();
    if (!kod || !aciklama) {
      app.toast('Kod ve açıklama gerekli', 'error');
      return;
    }
    if (editingCode) {
      const item = kodlar.find((k) => k.kod === editingCode.kod && k.aciklama === editingCode.aciklama);
      if (item) item.aciklama = aciklama;
    } else {
      if (kodlar.some((k) => k.kod === kod)) {
        app.toast('Bu kod zaten var', 'error');
        return;
      }
      kodlar.push({ kod, aciklama });
    }
    const message = editingCode ? 'Kod güncellendi' : 'Kod eklendi';
    if (await persistCodes(message)) resetCodeForm();
  }

  async function removeCode(pair) {
    const others = kodlar.some((k) => k.kod === pair.kod && k.aciklama !== pair.aciklama);
    const users = others ? [] : makineler.filter((m) => m.kodlar.includes(pair.kod));
    const note = users.length ? `\n\n${users.length} makine kaydından da çıkarılacak.` : '';
    if (!window.confirm(`"${pair.kod} - ${pair.aciklama}" kodu silinsin mi?${note}`)) return;
    const res = await PidxHost.ml.removeCode(pair);
    if (!res.ok) {
      app.toast(res.error, 'error');
      return;
    }
    kodlar = res.codes;
    res.machines.forEach(upsert);
    if (editingCode && editingCode.kod === pair.kod && editingCode.aciklama === pair.aciklama) resetCodeForm();
    afterCodesChanged();
    if (res.machines.length) app.onMachinesChanged();
    app.toast('Kod silindi');
  }

  async function importCsv(file) {
    const rows = PidxHost.parseCodeCsv(PidxHost.decodeText(await file.arrayBuffer()));
    if (!rows.length) {
      app.toast('CSV okunamadı', 'error');
      return;
    }
    let added = 0;
    for (const row of rows) {
      if (kodlar.some((k) => k.kod === row.kod && k.aciklama === row.aciklama)) continue;
      kodlar.push(row);
      added += 1;
    }
    await persistCodes(`CSV: ${added} yeni kod, ${rows.length - added} zaten vardı · toplam ${kodlar.length}`);
  }

  function exportCsv() {
    const rows = sortedCodes().map((k) => `${k.kod};${k.aciklama}`);
    const text = `﻿${['KOD;AÇIKLAMA'].concat(rows).join('\n')}`;
    PidxHost.downloadBlob(new Blob([text], { type: 'text/csv;charset=utf-8' }), 'KODListesi.csv');
  }

  /* ─── Eski ML hafızasındaki kayıtlar ──────────────────── */

  function readLegacy() {
    try {
      if (localStorage.getItem(LEGACY_DONE_KEY)) return null;
      return {
        kodlar: JSON.parse(localStorage.getItem('ml_kodListesi')) || [],
        makineler: JSON.parse(localStorage.getItem('ml_makineler')) || []
      };
    } catch {
      return null;
    }
  }

  function closeLegacy() {
    try {
      localStorage.setItem(LEGACY_DONE_KEY, new Date().toISOString());
    } catch { /* hafıza kapalıysa uyarı bir sonraki açılışta yeniden gelir */ }
    $('legacyBanner').classList.add('hidden');
    $('modalRoot').innerHTML = '';
  }

  function reviewLegacy(diff) {
    const machineRows = diff.machines.map((m) => `<li><strong>${esc(m.seriNo)}</strong> ${esc(m.firma)} · ${esc(m.model)} (${(m.kodlar || []).length} kod)</li>`).join('');
    const codeRows = diff.codes.map((k) => `<li><strong>${esc(k.kod)}</strong> ${esc(k.aciklama)}</li>`).join('');
    $('modalRoot').innerHTML = `
      <div class="modal-overlay">
        <div class="modal ml-legacy-modal">
          <h2>Tarayıcıda kalan ML kayıtları</h2>
          <p class="field-help">Bunlar eski ML uygulamasında kaydedilmiş ama klasöre yazılmamış. Aktarırsan klasöre eklenir, var olan kod silinmez. Yok sayarsan bu tarayıcıdaki kopya olduğu gibi kalır.</p>
          ${machineRows ? `<div class="field-label">Makineler (${diff.machines.length})</div><ul class="ml-legacy-list">${machineRows}</ul>` : ''}
          ${codeRows ? `<div class="field-label">Kodlar (${diff.codes.length})</div><ul class="ml-legacy-list">${codeRows}</ul>` : ''}
          <div class="modal-actions">
            <button type="button" class="btn" id="legacySkip">Yok say</button>
            <button type="button" class="btn btn-primary" id="legacyApply">Klasöre aktar</button>
          </div>
        </div>
      </div>`;
    $('legacySkip').addEventListener('click', closeLegacy);
    $('legacyApply').addEventListener('click', async () => {
      const res = await PidxHost.ml.importLegacy(diff);
      if (!res.ok) {
        app.toast(`Aktarım tamamlanamadı: ${res.error}`, 'error');
        await load();
        return;
      }
      closeLegacy();
      await load();
      app.onMachinesChanged();
      app.reloadCatalog();
      app.toast(`${diff.machines.length} makine ve ${diff.codes.length} kod klasöre aktarıldı`);
    });
  }

  function checkLegacy() {
    const legacy = readLegacy();
    const banner = $('legacyBanner');
    banner.classList.add('hidden');
    if (!legacy || loadError) return;
    const diff = PidxHost.legacyDiff(legacy, { codes: kodlar, machines: makineler });
    if (!diff.codes.length && !diff.machines.length) return;
    banner.innerHTML = `<span>Eski ML uygulamasından tarayıcıda kalan kayıtlar var: ${diff.machines.length} makine, ${diff.codes.length} kod.</span> <button type="button" class="btn btn-sm" id="legacyOpen">İncele</button>`;
    banner.classList.remove('hidden');
    $('legacyOpen').addEventListener('click', () => reviewLegacy(diff));
  }

  /* ─── Yükleme ve bağlantılar ──────────────────────────── */

  async function load() {
    const res = await PidxHost.ml.load();
    if (res.ok) {
      loadError = null;
      kodlar = res.codes;
      makineler = res.machines;
      if (res.skipped.length) app.toast(`Okunamayan makine kaydı: ${res.skipped.join(', ')}`, 'error');
    } else {
      loadError = res.error;
      kodlar = [];
      makineler = [];
      app.toast(`Makine kayıtları okunamadı: ${res.error}`, 'error');
    }
    updateCounts();
    renderMachineList();
    renderCodeTable();
    if (activeId && !activeMachine()) closeForm();
    checkLegacy();
  }

  /** İşaretlemede 400 satırlık liste yeniden kurulmaz: yalnız o kodun satırı ve sayılar güncellenir */
  function bindCodeChecks() {
    const wrap = $('mlCodeChecks');
    wrap.addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      const { checked, value } = e.target;
      if (checked) selected.add(value);
      else selected.delete(value);
      // Aynı kod listede iki anlamla geçebilir; iki satır da aynı duruma gelir
      wrap.querySelectorAll('input[type=checkbox]').forEach((box) => {
        if (box.value !== value) return;
        box.checked = checked;
        box.closest('.ml-check').classList.toggle('on', checked);
      });
      const filter = machineFilter();
      updateCheckCounts(filter, kodlar.filter((k) => matches(k, filter)).length);
    });
  }

  const debounce = (fn, ms) => {
    let timer = null;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(fn, ms);
    };
  };

  function init(appRef) {
    app = appRef;
    $('mlNew').addEventListener('click', newMachine);
    $('mlMachineSearch').addEventListener('input', renderMachineList);
    $('mlMachineList').addEventListener('click', (e) => {
      const item = e.target.closest('.ml-list-item');
      if (item) openMachine(item.dataset.id);
    });
    $('mlMachineForm').addEventListener('submit', submitMachine);
    $('mlCancel').addEventListener('click', closeForm);
    $('mlDelete').addEventListener('click', deleteMachine);
    $('mlDownload').addEventListener('click', downloadMachine);
    $('mlProject').addEventListener('click', () => {
      const machine = activeMachine();
      if (machine) app.projectFromMachine(machine);
    });
    const refilter = debounce(() => renderCodeChecks(true), 70);
    $('mlFilterSeri').addEventListener('input', refilter);
    $('mlFilterText').addEventListener('input', refilter);
    $('mlFilterClear').addEventListener('click', () => {
      resetFilters();
      renderCodeChecks(true);
    });
    $('mlSelectVisible').addEventListener('click', () => {
      filteredCodes().forEach((k) => selected.add(k.kod));
      renderCodeChecks(true);
    });
    $('mlSelectNone').addEventListener('click', () => {
      selected.clear();
      renderCodeChecks(true);
    });
    bindCodeChecks();

    $('mlCodeForm').addEventListener('submit', submitCode);
    $('mlCodeCancel').addEventListener('click', resetCodeForm);
    const refilterTable = debounce(renderCodeTable, 70);
    $('mlListSeri').addEventListener('input', refilterTable);
    $('mlListText').addEventListener('input', refilterTable);
    $('mlListClear').addEventListener('click', () => {
      $('mlListSeri').value = '';
      $('mlListText').value = '';
      renderCodeTable();
    });
    $('mlCodeBody').addEventListener('click', (e) => {
      const button = e.target.closest('[data-act]');
      if (!button) return;
      const row = button.closest('tr');
      const pair = { kod: row.dataset.kod, aciklama: row.dataset.aciklama };
      if (button.dataset.act === 'delete') {
        removeCode(pair);
        return;
      }
      editingCode = pair;
      $('mlCodeInput').value = pair.kod;
      $('mlCodeInput').disabled = true;
      $('mlCodeText').value = pair.aciklama;
      $('mlCodeSubmit').textContent = 'Güncelle';
      $('mlCodeCancel').hidden = false;
      $('mlCodeText').focus();
    });
    $('mlCsvImport').addEventListener('click', () => $('mlCsvInput').click());
    $('mlCsvInput').addEventListener('change', (e) => {
      if (e.target.files[0]) importCsv(e.target.files[0]);
      e.target.value = '';
    });
    $('mlCsvExport').addEventListener('click', exportCsv);
  }

  return {
    init,
    load,
    upsert,
    openMachine,
    updateFormActions: () => {
      if (!$('mlMachineForm').classList.contains('hidden')) updateFormActions();
    },
    get machines() { return makineler; }
  };
})();
