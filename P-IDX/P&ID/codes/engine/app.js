/* Çizim motoru: uygulama akışı (proje açma, kaydetme, dışa aktarma). */

const PidApp = (() => {
  const $ = (id) => document.getElementById(id);
  const api = () => window.PidxHost.engine;
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const state = {
    editor: null,
    catalog: [],
    catalogMap: new Map(),
    catalogLookup: new Map(),
    safetyMap: new Map(),
    coverDesign: PidCovers.DEFAULT_DESIGN,
    pdfOptions: { cover: true, sheets: true, components: true, logic: true, safety: true },
    machine: null,
    machineCodes: null,
    projects: [],
    homeTab: 'projects',
    projectId: null,
    isSample: false,
    dirty: false,
    saving: null,
    saveTimer: null,
    logos: {}
  };

  let toastTimer = null;
  function toast(msg, type) {
    const el = $('toast');
    el.textContent = msg;
    el.className = `toast ${type || ''}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), type === 'error' ? 6000 : 3200);
  }

  /* ─── Proje ekranı ────────────────────────────────────── */

  async function showHome(options) {
    await flushSave();
    $('app').classList.add('hidden');
    $('home').classList.remove('hidden');
    state.projectId = null;
    state.isSample = false;
    state.machine = null;
    state.machineCodes = null;
    selectHomeTab((options && options.tab) || state.homeTab);
    await renderProjects();
    PidMachines.updateFormActions();
    if (options && options.machineId) PidMachines.openMachine(options.machineId);
  }

  function selectHomeTab(tab) {
    state.homeTab = tab;
    document.querySelectorAll('.home-tab').forEach((b) => b.classList.toggle('active', b.dataset.homeTab === tab));
    $('homeProjects').classList.toggle('hidden', tab !== 'projects');
    $('homeMachines').classList.toggle('hidden', tab !== 'machines');
    $('homeCodes').classList.toggle('hidden', tab !== 'codes');
    $('btnSample').classList.toggle('hidden', tab !== 'projects');
    $('btnNewProject').classList.toggle('hidden', tab !== 'projects');
  }

  async function renderProjects() {
    const res = await api().listProjects();
    const list = $('projectList');
    if (!res.ok) {
      state.projects = [];
      list.innerHTML = `<div class="home-empty">${esc(res.error)}</div>`;
      return;
    }
    state.projects = res.projects;
    if (!res.projects.length) {
      list.innerHTML = '<div class="home-empty">Henüz proje yok. "Yeni Proje" ile başlayın.</div>';
      return;
    }
    list.innerHTML = res.projects.map((p) => {
      const date = new Date(p.updatedAt).toLocaleDateString('tr-TR');
      const chips = p.inputs.map((i) => `<span class="pc-chip${i.count ? ' has' : ''}">${esc(i.label)}${i.count ? ` · ${i.count}` : ''}</span>`).join('');
      const machineChip = p.machine ? `<span class="pc-chip machine">Makine kaydı · ${p.machine.codes} kod</span>` : '';
      const summary = p.sheets ? `${p.sheets} sayfa · ${p.items} öğe` : 'Çizim henüz başlamadı';
      return `<button type="button" class="project-card" data-id="${esc(p.id)}">
        <div class="pc-no">${esc(p.meta.seriNo)}</div>
        <div class="pc-model">${esc(p.meta.model)}</div>
        <div class="pc-customer">${esc(p.meta.musteri)}</div>
        <div class="pc-chips">${machineChip}${chips}</div>
        <div class="pc-meta">${summary} · ${date}</div>
      </button>`;
    }).join('');
    list.querySelectorAll('.project-card').forEach((card) => {
      card.addEventListener('click', () => openProject(card.dataset.id));
    });
  }

  function newProjectModal(fromMachine) {
    const root = $('modalRoot');
    const machines = PidMachines.machines.slice().sort((a, b) => String(a.seriNo).localeCompare(String(b.seriNo), 'tr'));
    root.innerHTML = `
      <div class="modal-overlay">
        <form class="modal" id="newProjectForm">
          <h2>Yeni Proje</h2>
          <div class="field">
            <label for="npMachine">Makine kaydı</label>
            <select id="npMachine" class="field-input">
              <option value="">Kayıt seçilmedi</option>
              ${machines.map((m) => `<option value="${esc(m.id)}">${esc(m.seriNo)} · ${esc(m.firma)} · ${esc(m.model)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="npCopy">Çizim</label>
            <select id="npCopy" class="field-input">
              <option value="">Boş çizimle başla</option>
              ${(state.projects || []).map((p) => `<option value="${esc(p.id)}">Kopyası: ${esc(p.id)}</option>`).join('')}
            </select>
            <div class="field-help">Benzer bir makine için seçilen projenin çizimi kopyalanır; o proje değişmez. Revizyon işaretleri kopyalanmaz.</div>
          </div>
          <div class="field"><label for="npSeri">Seri no</label><input id="npSeri" class="field-input" placeholder="0626051" required></div>
          <div class="field"><label for="npMusteri">Müşteri</label><input id="npMusteri" class="field-input" placeholder="DÜNYA" required></div>
          <div class="field"><label for="npModel">Model</label><input id="npModel" class="field-input" placeholder="ULT M200 3B" required></div>
          <div class="modal-actions">
            <button type="button" class="btn" id="npCancel">İptal</button>
            <button type="submit" class="btn btn-primary">Oluştur</button>
          </div>
        </form>
      </div>`;
    const fill = (machine) => {
      $('npSeri').value = machine ? machine.seriNo : '';
      $('npMusteri').value = machine ? machine.firma : '';
      $('npModel').value = machine ? machine.model : '';
    };
    $('npMachine').addEventListener('change', (e) => fill(machines.find((m) => m.id === e.target.value)));
    if (fromMachine) {
      $('npMachine').value = fromMachine.id;
      fill(fromMachine);
    }
    $('npSeri').focus();
    $('npCancel').addEventListener('click', () => { root.innerHTML = ''; });
    $('newProjectForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await api().createProject({
        seriNo: $('npSeri').value,
        musteri: $('npMusteri').value,
        model: $('npModel').value,
        makineId: $('npMachine').value
      });
      if (!res.ok) {
        toast(res.error, 'error');
        return;
      }
      const copyFrom = $('npCopy').value;
      root.innerHTML = '';
      if (copyFrom) {
        const copied = await copyDrawing(copyFrom, res.id);
        if (!copied.ok) toast(`Proje oluşturuldu ama çizim kopyalanamadı: ${copied.error}`, 'error');
        else toast(`${copyFrom} çiziminin kopyasıyla başlandı (${copied.count} öğe). Asıl proje değişmedi.`);
      }
      openProject(res.id);
    });
  }

  /** Başka projenin çizimini yeni projeye kopyalar; kaynak yalnız okunur. Revizyon geçmişi yeni projeye geçmez. */
  async function copyDrawing(fromId, toId) {
    const src = await api().readProject(fromId);
    if (!src.ok) return { ok: false, error: src.error };
    if (!src.drawing) return { ok: false, error: 'Kaynak projede çizim yok' };
    // Açık projeye almakla aynı kural: çizim tahtası gelir, antet ve revizyon geçmişi gelmez
    const drawing = PidModel.createDrawing('P&ID Şeması');
    PidModel.importSheets(drawing, src.drawing, 'replace');
    const saved = await api().saveProject({ id: toId, drawing });
    if (!saved.ok) return { ok: false, error: saved.error };
    const count = drawing.sheets.reduce((n, s) => n + s.items.length, 0);
    return { ok: true, count };
  }

  function projectForMachine(machine) {
    return state.projects.find((p) => p.machine && p.machine.id === machine.id) || null;
  }

  function projectFromMachine(machine) {
    const project = projectForMachine(machine);
    if (project) openProject(project.id);
    else newProjectModal(machine);
  }

  async function changeFolder() {
    const res = await PidxHost.changeFolder();
    if (res.ok) {
      await flushSave();
      window.location.reload();
    } else if (!res.canceled) {
      toast(res.error, 'error');
    }
  }

  /* ─── Açma ────────────────────────────────────────────── */

  async function loadLogos(meta) {
    const brand = (typeof HEADER_BRANDS !== 'undefined' && HEADER_BRANDS[meta.firma]) || HEADER_BRANDS.DOLFIN;
    const cover = COVER_BRANDS[meta.firma] || COVER_BRANDS.DOLFIN;
    const load = async (rel) => {
      if (!rel) return null;
      if (!state.logos[rel]) {
        const res = await api().asset(rel);
        state.logos[rel] = res.ok ? res.uri : null;
      }
      return state.logos[rel];
    };
    return {
      brands: HEADER_BRANDS,
      titleLogo: await load(cover.logo),
      brandLogo: brand.type === 'logo' ? await load(brand.logo) : null
    };
  }

  function enterEditor() {
    $('home').classList.add('hidden');
    $('app').classList.remove('hidden');
  }

  async function openProject(id) {
    const res = await api().readProject(id);
    if (!res.ok) {
      toast(res.error, 'error');
      return;
    }
    state.projectId = id;
    state.isSample = false;
    state.dirty = false;
    state.machine = res.machine;
    state.machineCodes = res.machineCodes;
    if (res.machine) PidMachines.upsert(res.machine);
    const drawing = res.drawing || PidModel.createDrawing('P&ID Şeması');
    const upgraded = PidModel.upgradeGenericSymbols(drawing, state.catalogMap);
    enterEditor();
    state.editor.load(res.meta, drawing, await loadLogos(res.meta));
    PidReport.invalidate();
    $('projName').textContent = id;
    setSaveState(res.drawing ? 'Kaydedildi' : 'Yeni çizim');
    if (upgraded) {
      scheduleSave();
      toast(`${upgraded} kodlu bileşen kendi serisinin sembolüne geçirildi`);
    }
    // Makine kaydı varsa kod paneli o makinenin kodlarıyla açılır
    $('codeFilter').value = res.machineCodes && res.machineCodes.length ? 'machine' : 'all';
    renderSheets();
    PidPanels.renderChecks();
    PidPanels.renderCodes();
    PidPanels.renderFiles();
    PidPanels.markPlacing();
    state.pdfOptions.langs = null; // PDF dili yeni projenin diliyle başlar
    PidReport.render();
  }

  async function openSample() {
    const sample = PidSample.build();
    PidModel.upgradeGenericSymbols(sample.drawing, state.catalogMap);
    state.projectId = null;
    state.isSample = true;
    state.dirty = false;
    state.machine = null;
    state.machineCodes = null;
    $('codeFilter').value = 'all';
    enterEditor();
    state.editor.load(sample.meta, sample.drawing, await loadLogos(sample.meta));
    PidReport.invalidate();
    $('projName').textContent = 'ÖRNEK ÇİZİM';
    setSaveState('Örnek: kaydedilmez');
    renderSheets();
    PidPanels.renderChecks();
    PidPanels.renderCodes();
    PidPanels.renderFiles();
    PidPanels.markPlacing();
    state.pdfOptions.langs = null; // PDF dili yeni projenin diliyle başlar
    PidReport.render();
  }

  /* ─── Kaydetme ────────────────────────────────────────── */

  const SAVE_RETRY_MS = 15000;

  function setSaveState(text, cls) {
    const el = $('saveState');
    el.textContent = text;
    el.className = `save-state ${cls || ''}`;
  }

  function scheduleSave() {
    if (state.isSample || !state.projectId) return;
    state.dirty = true;
    setSaveState('Kaydediliyor…', 'dirty');
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, 700);
  }

  async function saveNow() {
    clearTimeout(state.saveTimer);
    if (state.saving) return state.saving;
    if (state.isSample || !state.projectId || !state.dirty) return undefined;
    state.dirty = false;
    state.saving = runSave().finally(() => { state.saving = null; });
    return state.saving;
  }

  async function runSave() {
    const res = await api().saveProject({
      id: state.projectId,
      drawing: Object.assign({ schema: PidModel.SCHEMA }, state.editor.drawing),
      meta: state.editor.project
    });
    if (res.ok) {
      state.saveFailed = false;
      setSaveState(`Kaydedildi ${new Date(res.savedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`);
      if (state.dirty) scheduleSave();
    } else {
      state.dirty = true;
      setSaveState('Kaydedilemedi, yeniden denenecek', 'err');
      // Dosya başka programda açık olabilir: kendiliğinden yeniden denenir, uyarı bir kez çıkar
      if (!state.saveFailed) toast(`Kaydedilemedi: ${res.error}`, 'error');
      state.saveFailed = true;
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(saveNow, SAVE_RETRY_MS);
    }
  }

  /** Süren yazmayı bekler, sonra kalan değişiklikleri de yazar */
  async function flushSave() {
    if (state.saving) await state.saving;
    if (state.dirty) await saveNow();
  }

  /** Kaydet düğmesi ve Ctrl+S: değişiklik olmasa da diske yazar */
  async function saveProject() {
    if (state.isSample) {
      toast('Örnek çizim kaydedilmez', 'error');
      return;
    }
    if (!state.projectId) return;
    if (state.saving) await state.saving;
    state.dirty = true;
    await saveNow();
    if (!state.dirty) toast(`Proje kaydedildi: P&ID/projects/${state.projectId}`);
  }

  /* ─── Sayfa sekmeleri ─────────────────────────────────── */

  let tabsHeld = false;

  /**
   * Ad alanından çıkarken gelen "change" tıklamanın ortasında çalışır. Sekmeler o anda değişirse ya da ad kısalıp
   * düğme imlecin altından kayarsa tıklama kaybolur; bu yüzden basılıyken güncellenmez, bırakınca güncellenir.
   */
  function renderSheets() {
    if (tabsHeld) return;
    const editor = state.editor;
    const wrap = $('sheetTabs');
    const sheets = editor.drawing.sheets;
    const closable = sheets.length > 1;
    const label = (s, i) => `${i + 1}. ${esc(s.title)}${closable ? `<span class="x" data-del="${i}" title="Sayfayı sil">×</span>` : ''}`;
    const tabs = wrap.querySelectorAll('.sheet-tab');
    if (tabs.length !== sheets.length) {
      wrap.innerHTML = `${sheets.map((s, i) => `<button type="button" class="sheet-tab" data-index="${i}" title="Çift tık: adını değiştir">${label(s, i)}</button>`).join('')}<button type="button" class="sheet-add" id="sheetAdd" title="Yeni sayfa ekle">+ Sayfa</button>`;
    } else {
      sheets.forEach((s, i) => { tabs[i].innerHTML = label(s, i); });
    }
    wrap.querySelectorAll('.sheet-tab').forEach((tab, i) => tab.classList.toggle('active', i === editor.sheetIndex));
    // Çok sayfada açık sekme görünür alanda kalır
    const active = wrap.querySelector('.sheet-tab.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function bindSheetTabs() {
    const wrap = $('sheetTabs');
    const release = () => {
      if (!tabsHeld) return;
      // Tıklama bu olaydan hemen sonra gelir; sekmeler o işlendikten sonra güncellenir
      setTimeout(() => {
        tabsHeld = false;
        renderSheets();
      });
    };
    wrap.addEventListener('pointerdown', () => { tabsHeld = true; });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('#sheetAdd')) {
        addSheet();
        return;
      }
      if (e.target.dataset.del !== undefined) {
        deleteSheet(parseInt(e.target.dataset.del, 10));
        return;
      }
      const tab = e.target.closest('.sheet-tab');
      if (!tab) return;
      const index = parseInt(tab.dataset.index, 10);
      if (index !== state.editor.sheetIndex) state.editor.setSheet(index);
    });
    // Çift tık: sayfa adını sağ panelde düzenle
    wrap.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.sheet-tab') || e.target.dataset.del !== undefined) return;
      state.editor.setSelection([]);
      PidPanels.selectTab('right', 'props');
      const field = $('sTitle');
      if (field) {
        field.focus();
        field.select();
      }
    });
  }

  /** Yeni sayfa aynı boyutta açılır; antet numarası (2 / 2) kendiliğinden yazılır */
  function addSheet() {
    const editor = state.editor;
    const sheet = PidModel.createSheet(`P&ID Şeması ${editor.drawing.sheets.length + 1}`, editor.sheet.size);
    editor.drawing.sheets.push(sheet);
    editor.setSheet(editor.drawing.sheets.length - 1);
    editor.commit();
    toast(`Sayfa ${editor.drawing.sheets.length} eklendi`);
  }

  function duplicateSheet() {
    const editor = state.editor;
    PidModel.duplicateSheet(editor.drawing, editor.sheetIndex);
    editor.setSheet(editor.sheetIndex + 1);
    editor.commit();
    toast('Sayfa çoğaltıldı. Kopyadaki kodlar asıl sayfadakilerle aynı; Kontrol sekmesi tekrar eden kodları gösterir.');
  }

  /** Sayfalar arasında gezinir; içerik ve sıra değişmez */
  function goToSheet(delta) {
    state.editor.setSheet(state.editor.sheetIndex + delta);
  }

  /** Sayfanın sırasını değiştirir (gezinmekle karışmasın diye düğmeleri ayrıdır) */
  function moveSheet(dir) {
    const editor = state.editor;
    if (editor.moveSheet(dir)) toast(`"${editor.sheet.title}" artık ${editor.sheetIndex + 1}. sırada`);
  }

  /** Uygulama içi onay penceresi (web sürümünde tarayıcı onay penceresi açılmaz) */
  function confirmModal(title, message, okLabel) {
    return new Promise((resolve) => {
      const root = $('modalRoot');
      root.innerHTML = `
        <div class="modal-overlay">
          <form class="modal" id="confirmForm">
            <h2>${esc(title)}</h2>
            <p class="field-help">${esc(message)}</p>
            <div class="modal-actions">
              <button type="button" class="btn" id="confirmCancel">Vazgeç</button>
              <button type="submit" class="btn btn-primary">${esc(okLabel)}</button>
            </div>
          </form>
        </div>`;
      const done = (ok) => { root.innerHTML = ''; resolve(ok); };
      $('confirmCancel').addEventListener('click', () => done(false));
      $('confirmForm').addEventListener('submit', (e) => { e.preventDefault(); done(true); });
      root.querySelector('button[type=submit]').focus();
    });
  }

  /**
   * Açık projeye başka projenin çizim tahtasını alır: semboller, hatlar, yazılar, lejant, gruplar.
   * Antet ve proje bilgileri bu projede kalır; kaynak proje yalnız okunur. Geri Al ile geri alınır.
   */
  function importDrawingModal() {
    const editor = state.editor;
    const others = (state.projects || []).filter((p) => p.id !== state.projectId);
    if (!others.length) {
      toast('Kopyalanacak başka proje yok', 'error');
      return;
    }
    const empty = editor.drawing.sheets.every((s) => !s.items.some((it) => !PidModel.isSymbol(it) || it.symbol !== 'l.junction'));
    const root = $('modalRoot');
    root.innerHTML = `
      <div class="modal-overlay">
        <form class="modal" id="importForm">
          <h2>Başka projeden çizim al</h2>
          <div class="field">
            <label for="imSource">Kaynak proje</label>
            <select id="imSource" class="field-input">
              ${others.map((p) => `<option value="${esc(p.id)}">${esc(p.id)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label><input type="radio" name="imMode" value="replace"${empty ? ' checked' : ''}> Bu projenin çizimini değiştir</label>
            <label><input type="radio" name="imMode" value="append"${empty ? '' : ' checked'}> Yeni sayfa olarak ekle (mevcut çizim kalır)</label>
          </div>
          <p class="field-help">Çizim tahtasındaki her şey kopyalanır: semboller, kodlar, hatlar, yazılar, lejant ve gruplar. Antet ve proje bilgileri (proje no, müşteri, model, revizyonlar, çizim adı) bu projede kalır. Kaynak proje değişmez. Geri Al ile geri alınır.</p>
          <div class="modal-actions">
            <button type="button" class="btn" id="imCancel">Vazgeç</button>
            <button type="submit" class="btn btn-primary">Kopyala</button>
          </div>
        </form>
      </div>`;
    $('imCancel').addEventListener('click', () => { root.innerHTML = ''; });
    $('importForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = $('imSource').value;
      const mode = root.querySelector('input[name=imMode]:checked').value;
      const src = await api().readProject(id);
      if (!src.ok || !src.drawing || !src.drawing.sheets || !src.drawing.sheets.length) {
        toast(src.ok ? 'Kaynak projede çizim yok' : src.error, 'error');
        return;
      }
      root.innerHTML = '';
      const first = PidModel.importSheets(editor.drawing, src.drawing, mode);
      editor.setSheet(first);
      editor.commit();
      renderSheets();
      const count = src.drawing.sheets.reduce((n, s) => n + s.items.filter((it) => !PidModel.isSymbol(it) || it.symbol !== 'l.junction').length, 0);
      const pages = src.drawing.sheets.length;
      toast(mode === 'replace'
        ? `${id} çizimi alındı (${count} öğe, ${pages} sayfa). Antet bilgileri bu projenin; Geri Al ile eski hâline döner.`
        : `${id} çizimi ${pages} yeni sayfa olarak eklendi (${count} öğe). Tekrar eden kodlar Kontrol sekmesinde görünür.`);
    });
  }


  /**
   * Proje adını antetteki proje no, müşteri ve modele göre günceller: "0326067-MİTAŞ-KBN 2B 1650" → "...-KBN 2B 1500".
   * Proje klasörü (çizim, girdi dosyaları, çıktılar) yeni ada taşınır; açık çizim yeni adla sürer.
   */
  async function renameProject() {
    const editor = state.editor;
    if (!state.projectId || !editor || !editor.project) return;
    const meta = editor.project;
    const parts = [meta.seriNo, meta.musteri, meta.model].map((v) => String(v || '').trim());
    if (parts.some((v) => !v)) {
      toast('Proje no, müşteri ve model dolu olmalı', 'error');
      return;
    }
    const next = parts.join('-');
    if (next === state.projectId) {
      toast('Proje adı bu bilgilerle zaten aynı. Önce proje no, müşteri ya da modeli değiştirin.');
      return;
    }
    const ok = await confirmModal('Proje adını güncelle', `"${state.projectId}" → "${next}". Çizim, girdi dosyaları ve çıktılar yeni ada taşınır. Bu projeye bağlı pnömatik projeler de yeni adı gösterir.`, 'Güncelle');
    if (!ok) return;
    await flushSave();
    const oldId = state.projectId;
    const res = await api().renameProject({ id: oldId, seriNo: parts[0], musteri: parts[1], model: parts[2] });
    if (!res.ok) {
      toast(`Proje adı güncellenemedi: ${res.error}`, 'error');
      return;
    }
    state.projectId = res.id;
    $('projName').textContent = res.id;
    PidPanels.renderInspector();
    PidPanels.renderFiles();
    toast(`Proje adı güncellendi: ${res.id}${res.relinked ? ` · bağlı ${res.relinked} pnömatik proje de yeni adı gösteriyor` : ''}`);
  }

  async function deleteSheet(index) {
    const editor = state.editor;
    if (editor.drawing.sheets.length < 2) return;
    const sheet = editor.drawing.sheets[index];
    const count = sheet.items.filter((it) => !PidModel.isSymbol(it) || it.symbol !== 'l.junction').length;
    if (count && !(await confirmModal('Sayfayı sil', `"${sheet.title}" sayfası ve üzerindeki ${count} öğe silinsin mi? Geri Al ile geri getirebilirsiniz.`, 'Sil'))) return;
    editor.removeSheet(index);
  }

  /** Seçimi başka sayfaya taşır ve o sayfaya geçer */
  function moveSelectionToSheet(index) {
    const editor = state.editor;
    const target = editor.drawing.sheets[index];
    if (!target || index === editor.sheetIndex) return;
    const ids = PidModel.expandGroups(editor.sheet, [...editor.selection]);
    const moved = PidModel.moveToSheet(editor.sheet, target, ids);
    if (!moved.length) return;
    editor.commit();
    editor.setSheet(index);
    editor.setSelection(PidModel.expandGroups(target, moved.filter((id) => !PidModel.isLine(PidModel.findItem(target, id)))));
    renderSheets();
    toast(`${moved.length} öğe ${index + 1}. sayfaya taşındı. Diğer sayfaya giden hatlar boşta kaldıysa Sayfa Bağlantısı ile bağlayın.`);
  }

  /* ─── Dışa aktarma ────────────────────────────────────── */

  function exportBaseName() {
    if (state.projectId) return state.projectId;
    const m = state.editor.project;
    return [m.seriNo, m.musteri, m.model].filter(Boolean).join('-');
  }

  function hiddenLayers() {
    return Object.assign({}, state.editor.hidden);
  }


  const DOC_LANGS = [['tr', 'TR', 'Türkçe'], ['en', 'EN', 'English'], ['de', 'DE', 'Deutsch']];

  /** Belgenin (çizim, kapak, açıklama) dili; program arayüzü Türkçe kalır */
  function setDocumentLanguage(lang) {
    const editor = state.editor;
    if (!PidSheet.TEXT[lang] || editor.project.dil === lang) return;
    editor.project.dil = lang;
    editor.ctx.lang = lang;
    onMetaChange();
    PidPanels.renderInspector();
  }

  /** Bağlı makine kaydının kodlarından taslak: tanklar, hücre ve dizilmiş bileşenler */
  function createDraft() {
    const editor = state.editor;
    const codes = state.machineCodes || [];
    if (!codes.length) {
      toast('Makine kaydında kod yok', 'error');
      return;
    }
    const res = PidPresets.buildDraft(editor.drawing, codes, { catalog: state.catalogMap, lang: editor.project.dil || 'tr' });
    editor.setSheet(res.sheetIndex);
    editor.commit();
    renderSheets();
    editor.fit();
    PidPanels.renderCodes();
    PidPanels.markPlacing();
    const parts = [];
    if (res.tanks) parts.push(`${res.tanks} tank`);
    if (res.cell) parts.push('yıkama hücresi');
    if (res.parked.length) parts.push(`${res.parked.length} bileşen sayfanın altına dizildi`);
    const skipped = res.notInMachine.length ? ` Makine kaydında olmadığı için konmadı: ${res.notInMachine.join(', ')}.` : '';
    toast(`Taslak (${res.size}): ${parts.join(', ') || 'eklenecek bir şey yok'}.${skipped}`);
  }

  /** Çizimdeki kodlardan etiket listesi: ML/MAKİNE ETİKETLEME.xlsx ile aynı düzen, belge dilinde */
  async function exportLabels() {
    await flushSave();
    const editor = state.editor;
    const meta = editor.project;
    const lang = meta.dil || 'tr';
    const rows = [...PidModel.usedTags(editor.drawing).keys()].map((code) => {
      const entry = state.catalogMap.get(code);
      const name = entry ? (lang === 'tr' ? entry.name : entry[lang] || entry.name) : code;
      return { code, name };
    });
    if (!rows.length) {
      toast('Çizimde kodlu bileşen yok', 'error');
      return;
    }
    const template = await api().labelTemplate();
    const upper = (v) => String(v || '').toLocaleUpperCase(lang === 'tr' ? 'tr' : lang);
    const title = [meta.model, upper(meta.musteri), meta.seriNo].filter(Boolean).join(' - ');
    const bytes = await PidXlsx.labelWorkbook(rows, {
      template: template.ok ? template.bytes : null,
      title,
      sheet: [meta.seriNo, meta.model].filter(Boolean).join('-') || 'Etiket',
      lang
    });
    const res = await api().exportXlsx({ id: state.projectId, fileName: `${exportBaseName()} ETİKET`, bytes });
    if (res.ok) toast(`Etiket listesi kaydedildi: ${rows.length} kod${template.ok ? '' : ' (şablon bulunamadı, sade biçim)'}`);
    else if (!res.canceled) toast(`Etiket listesi kaydedilemedi: ${res.error}`, 'error');
  }

  /** Bir dildeki tam belgeyi (kapak, açıklama, çizim) yazdırma alanına ekler */
  function appendDocument(root, options) {
    const editor = state.editor;
    const meta = editor.project;
    // Sıra: kapak, açıklama sayfaları, çizim sayfaları. Kapak numarasız, gerisi tek sırada numaralanır.
    const reportCount = PidReport.pageCount(options);
    const sheetCount = options.sheets ? editor.drawing.sheets.length : 0;
    const total = reportCount + sheetCount;
    if (options.cover) {
      root.appendChild(PidCovers.build(state.coverDesign, meta, editor.drawing, { pages: total || documentPageCount() }));
    }
    for (const page of PidReport.buildPages(options, 1, total)) root.appendChild(page);
    if (options.sheets) {
      editor.drawing.sheets.forEach((sheet, i) => {
        const ctx = Object.assign({}, editor.ctx, {
          interactive: false,
          hiddenLayers: hiddenLayers(),
          pageNumber: reportCount + i + 1,
          pageTotal: total
        });
        const wrap = document.createElement('div');
        wrap.className = `print-sheet print-${String(sheet.size).toLowerCase()}`;
        wrap.innerHTML = PidSheet.sheetSvg(meta, editor.drawing, i, ctx);
        root.appendChild(wrap);
      });
    }
  }

  /** Belge dilini geçici olarak değiştirir; tablolar o dilde yeniden üretilir */
  function useLanguage(lang) {
    state.editor.project.dil = lang;
    state.editor.ctx.lang = lang;
    PidReport.invalidate();
  }

  /**
   * @param options hangi bölümler basılacak; langs birden çok dilse her dil tam belge olarak
   *   TR, EN, DE sırasıyla arka arkaya eklenir; suffix PDF dosya adının sonu
   */
  async function runPdf(options) {
    if (state.pdfBusy) return;
    state.pdfBusy = true;
    toast('PDF hazırlanıyor…');
    const editor = state.editor;
    const root = $('printRoot');
    try {
      await flushSave();
      await PidPdfDom.loadFonts((file) => api().assetBytes(`../assets/fonts/${file}`));
      PidPdfDom.begin();
      const original = editor.project.dil || 'tr';
      const wanted = new Set(options.langs && options.langs.length ? options.langs : [original]);
      const langs = DOC_LANGS.map(([id]) => id).filter((id) => wanted.has(id));
      root.innerHTML = '';
      try {
        for (const lang of langs) {
          useLanguage(lang);
          appendDocument(root, options);
        }
      } finally {
        useLanguage(original);
      }
      await PidxHost.imagesDecoded(root);
      await PidxHost.nextPaint();
      const langTag = langs.length > 1 || langs[0] !== original ? ` ${langs.map((l) => l.toUpperCase()).join('-')}` : '';
      const suffix = options.suffix ? `${options.suffix}${langTag}` : (langTag ? `P&ID DIAGRAM${langTag}` : undefined);
      const pdf = await PidPdfDom.render(root, {
        title: `${exportBaseName()} ${suffix || 'P&ID DIAGRAM'}`,
        onProgress: (done, total) => toast(`PDF hazırlanıyor: ${done} / ${total} sayfa`)
      });
      const res = await api().exportPdf({ id: state.projectId, fileName: exportBaseName(), suffix, bytes: pdf.bytes });
      if (!res.ok) {
        toast(`PDF oluşturulamadı: ${res.error}`, 'error');
      } else if (pdf.missing.length || pdf.failedImages) {
        const notes = [];
        if (pdf.missing.length) notes.push(`yazı tipinde olmayan karakterler: ${pdf.missing.join(' ')}`);
        if (pdf.failedImages) notes.push(`${pdf.failedImages} görsel eklenemedi`);
        toast(`PDF indirildi, eksikler var (${notes.join('; ')})`, 'error');
      } else {
        toast(`PDF indirildi: ${res.filePath} (${pdf.pages} sayfa)`);
      }
    } catch (e) {
      toast(`PDF oluşturulamadı: ${e.message}`, 'error');
    } finally {
      root.innerHTML = '';
      PidPdfDom.end();
      state.pdfBusy = false;
    }
  }

  /** Seçili bölümlere göre belgenin numaralı sayfa sayısı (kapak hariç) */
  function documentPageCount() {
    const opts = state.pdfOptions;
    return PidReport.pageCount(opts) + (opts.sheets ? state.editor.drawing.sheets.length : 0);
  }

  function openPdfDialog() {
    const root = $('modalRoot');
    const opts = state.pdfOptions;
    if (!Array.isArray(opts.langs) || !opts.langs.length) opts.langs = [state.editor.project.dil || 'tr'];
    const data = PidReport.current();
    const row = (key, label, note) => `<label class="switch-row${opts[key] ? ' is-on' : ''}"><span>${label}${note ? ` <small class="pdf-note">${note}</small>` : ''}</span><input type="checkbox" data-pdf="${key}"${opts[key] ? ' checked' : ''}></label>`;
    const count = (n, empty) => (n ? String(n) : empty);
    root.innerHTML = `
      <div class="modal-overlay">
        <form class="modal" id="pdfForm">
          <h2>PDF İndir</h2>
          ${row('cover', 'Kapak')}
          ${row('components', 'Açıklama: Bileşen listesi', count(data.components.length, 'boş'))}
          ${row('logic', 'Açıklama: Bağlantı mantığı', count(data.logic.length, 'boş'))}
          ${row('safety', 'Açıklama: Güvenlik fonksiyonları', count(data.safety.length, 'boş'))}
          ${row('sheets', 'P&ID çizim sayfaları', String(state.editor.drawing.sheets.length))}
          <div class="pdf-langs">
            <span>Belge dili</span>
            ${DOC_LANGS.map(([id, code, name]) => `<label class="pdf-lang${opts.langs.includes(id) ? ' is-on' : ''}" title="${name}"><input type="checkbox" data-lang="${id}"${opts.langs.includes(id) ? ' checked' : ''}>${code}</label>`).join('')}
          </div>
          <div class="field-help">Birden çok dil seçerseniz her dil kapağıyla birlikte tam belge olarak arka arkaya tek PDF'te birleşir (TR, EN, DE sırasıyla). Dosya doğrudan İndirilenler klasörüne iner.</div>
          <div class="modal-actions">
            <button type="button" class="btn" id="pdfCancel">İptal</button>
            <button type="submit" class="btn btn-primary">PDF İndir</button>
          </div>
        </form>
      </div>`;
    root.querySelectorAll('[data-pdf]').forEach((box) => {
      box.addEventListener('change', () => {
        opts[box.dataset.pdf] = box.checked;
        box.closest('.switch-row').classList.toggle('is-on', box.checked);
      });
    });
    root.querySelectorAll('[data-lang]').forEach((box) => {
      box.addEventListener('change', () => {
        const set = new Set(opts.langs);
        if (box.checked) set.add(box.dataset.lang);
        else set.delete(box.dataset.lang);
        opts.langs = DOC_LANGS.map(([id]) => id).filter((id) => set.has(id));
        box.closest('.pdf-lang').classList.toggle('is-on', box.checked);
      });
    });
    $('pdfCancel').addEventListener('click', () => { root.innerHTML = ''; });
    $('pdfForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!['cover', 'sheets', 'components', 'logic', 'safety'].some((k) => opts[k])) {
        toast('En az bir bölüm seçin', 'error');
        return;
      }
      if (!opts.langs.length) {
        toast('En az bir dil seçin', 'error');
        return;
      }
      root.innerHTML = '';
      runPdf(Object.assign({}, opts));
    });
  }

  function exportCoverPdf() {
    runPdf({ cover: true, suffix: 'KAPAK' });
  }

  function exportReportPdf() {
    const opts = state.pdfOptions;
    if (!PidReport.pageCount(opts)) {
      toast('Açıklama sayfasında gösterilecek içerik yok', 'error');
      return;
    }
    runPdf({ components: opts.components, logic: opts.logic, safety: opts.safety, suffix: 'ACIKLAMA' });
  }

  async function setCoverDesign(id) {
    const previous = state.coverDesign;
    state.coverDesign = id;
    const res = await api().saveSettings({ kapakTasarimi: id });
    if (!res.ok) {
      state.coverDesign = previous;
      toast(`Kapak seçimi kaydedilemedi: ${res.error}`, 'error');
    }
    return res;
  }

  async function exportSvg() {
    await flushSave();
    const editor = state.editor;
    const meta = editor.project;
    const ctx = Object.assign({}, editor.ctx, { interactive: false, hiddenLayers: hiddenLayers() });
    const svg = PidSheet.sheetSvg(meta, editor.drawing, editor.sheetIndex, ctx);
    const res = await api().exportSvg({
      id: state.projectId,
      fileName: `${exportBaseName()} - Sayfa ${editor.sheetIndex + 1}`,
      svg: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`
    });
    if (res.ok) {
      toast(res.downloaded ? `SVG indirildi: ${res.filePath}` : `SVG kaydedildi: ${res.filePath}`);
      PidPanels.renderFiles();
    } else if (!res.canceled) {
      toast(`SVG kaydedilemedi: ${res.error}`, 'error');
    }
  }

  /* ─── Makine kaydı ve kod listesi ─────────────────────── */

  function setMachine(machine) {
    state.machine = machine;
    state.machineCodes = machine ? machine.kodlar : null;
  }

  function refreshMachineViews() {
    PidPanels.renderCodes();
    PidPanels.renderChecks();
  }

  async function saveMachineCodes(codes, message) {
    const res = await PidxHost.ml.saveMachine(Object.assign({}, state.machine, { kodlar: codes }));
    if (!res.ok) {
      toast(res.error, 'error');
      return;
    }
    setMachine(res.machine);
    PidMachines.upsert(res.machine);
    refreshMachineViews();
    if (message) toast(message);
  }

  function toggleMachineCode(code) {
    if (!state.machine) return;
    const has = state.machine.kodlar.some((k) => k.toUpperCase() === code);
    saveMachineCodes(has ? state.machine.kodlar.filter((k) => k.toUpperCase() !== code) : state.machine.kodlar.concat(code));
  }

  function usedCodesOutsideMachine() {
    const known = new Set((state.machine ? state.machine.kodlar : []).map((k) => k.toUpperCase()));
    return [...PidModel.usedTags(state.editor.drawing).keys()].filter((tag) => !known.has(tag));
  }

  function addUsedToMachine() {
    if (!state.machine) return;
    const extra = usedCodesOutsideMachine();
    if (extra.length) saveMachineCodes(state.machine.kodlar.concat(extra), `${extra.length} kod makine kaydına eklendi`);
  }

  async function createMachineFromProject() {
    const meta = state.editor.project;
    if (!meta.seriNo || !meta.musteri || !meta.model) {
      toast('Önce Özellikler panelinden proje no, müşteri ve modeli doldurun', 'error');
      return;
    }
    const res = await PidxHost.ml.saveMachine({
      seriNo: meta.seriNo,
      firma: meta.musteri,
      model: meta.model,
      kodlar: usedCodesOutsideMachine()
    });
    if (!res.ok) {
      toast(res.error, 'error');
      return;
    }
    meta.makineId = res.machine.id;
    setMachine(res.machine);
    PidMachines.upsert(res.machine);
    scheduleSave();
    refreshMachineViews();
    toast(`Makine kaydı oluşturuldu: ${res.machine.kodlar.length} kod`);
  }

  function editMachine() {
    if (state.machine) showHome({ tab: 'machines', machineId: state.machine.id });
  }

  function inEditor() {
    return !$('app').classList.contains('hidden');
  }

  /** Makineler sekmesindeki değişiklik proje kartlarına ve "Projeyi Aç" düğmesine yansır */
  async function onMachinesChanged() {
    await renderProjects();
    PidMachines.updateFormActions();
  }

  async function reloadCatalog() {
    const res = await api().catalog();
    if (!res.ok) {
      toast(`Kod listesi okunamadı: ${res.error}`, 'error');
      return;
    }
    state.catalog = res.entries;
    state.catalogMap = new Map(res.entries.map((e) => [e.id, e]));
    state.catalogLookup = state.catalogMap;
    PidPanels.setCatalog();
    if (inEditor()) {
      PidReport.invalidate();
      refreshMachineViews();
      PidReport.render();
    }
  }

  /* ─── Bağlantılar ─────────────────────────────────────── */

  function onMetaChange() {
    const editor = state.editor;
    loadLogos(editor.project).then((logos) => {
      Object.assign(editor.ctx, logos);
      editor.refreshFrame();
    });
    scheduleSave();
    // Seri no değişirse başka bir makine kaydına denk gelebilir
    if (state.projectId) setMachine(PidxHost.findMachine(PidMachines.machines, editor.project));
    PidReport.invalidate();
    refreshMachineViews();
    PidReport.schedule();
  }

  /* Kontrol ve kod listesi tüm çizimi tarar. Değişiklik anında değil, kullanıcı durunca güncellenir;
     art arda gelen değişiklikler (kod girme, sürükleme) tek güncellemede toplanır. */
  let panelTimer = null;
  function schedulePanels() {
    clearTimeout(panelTimer);
    panelTimer = setTimeout(() => {
      if (!inEditor()) return;
      PidPanels.markPlacing();
      PidPanels.renderChecks();
      PidPanels.renderCodes();
    }, 180);
  }

  function editorHost() {
    return {
      projectKey() {
        return state.projectId || (state.isSample ? 'ornek' : '');
      },
      onCopy(items) {
        const n = items.filter((it) => !(PidModel.isSymbol(it) && it.symbol === 'l.junction')).length;
        toast(`${n} öğe kopyalandı. Başka sayfada, sekmede ya da projede Ctrl+V ile aynı konuma yapıştırılır.`);
      },
      onPaste(copies, info) {
        const ids = new Set(copies.map((c) => c.id));
        const pasted = new Set(copies.filter((c) => PidModel.isSymbol(c) && c.tag).map((c) => String(c.tag).trim().toUpperCase()));
        const repeated = [...PidModel.usedTags(state.editor.drawing)]
          .filter(([tag, uses]) => pasted.has(tag) && uses.some((u) => !ids.has(u.itemId)))
          .map(([tag]) => tag);
        const where = info.sameSheet ? '' : ' aynı konuma';
        const note = repeated.length
          ? ` ${repeated.length} kod bu çizimde zaten var (${repeated.slice(0, 6).join(', ')}${repeated.length > 6 ? '…' : ''}); Kontrol sekmesinde görünür.`
          : '';
        toast(`${copies.length} öğe${where} yapıştırıldı, seçili; taşımak için sürükleyin.${note}`);
      },
      onChange() {
        scheduleSave();
        PidReport.invalidate();
        schedulePanels();
        PidReport.schedule();
      },
      onHistory() {
        $('btnUndo').disabled = state.editor.undoStack.length < 2;
        $('btnRedo').disabled = !state.editor.redoStack.length;
      },
      onSelection() {
        PidPanels.renderInspector();
      },
      onPreset(node, preset) {
        const def = PidSymbols.get(node.symbol);
        const skipped = preset.skippedTags.length
          ? ` ${preset.skippedTags.join(', ')} çizimde zaten var, bu kodlar boş bırakıldı.`
          : '';
        const what = {
          washCell: 'sprey manifoldu, sepet ve redüktörü, kapak switchi ve el koruma sensörü',
          pistonSet: 'açık ve kapalı konum sensörleri'
        }[def.preset] || 'seviye sensörleri, 3 rezistans, dolum vanası, küresel vana ve pompa';
        toast(`${def.name.tr}: ${what} bağlantılarıyla eklendi. Gerekmeyeni silebilirsiniz.${skipped}`);
      },
      onPresetBlocked(symbol) {
        const def = PidSymbols.get(symbol);
        toast(`${def.name.tr} çizimde zaten var. Başka bir tank için Proses Tankı ekleyip adını yazın.`, 'error');
      },
      onSheets() {
        renderSheets();
        PidReport.schedule();
      },
      onZoom(k) {
        // 96 dpi'da gerçek boyut: 1 mm = 3,78 px
        $('zoomValue').textContent = `${Math.round((k / 3.7795) * 100)}%`;
      },
      onTool(tool) {
        document.querySelectorAll('.tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === tool));
        updateHint();
      },
      onPlacing() {
        PidPanels.markPlacing();
        updateHint();
      },
      onPointer(pos) {
        const sheet = state.editor.sheet;
        const g = PidSheet.geometry(sheet);
        const inside = pos.x >= g.inner.x0 && pos.x <= g.inner.x1 && pos.y >= g.inner.y0 && pos.y <= g.inner.y1;
        let zone = '';
        if (inside) {
          const f = g.frame;
          const cols = Math.max(4, Math.round((f.x1 - f.x0) / 50));
          const rows = Math.max(3, Math.round((f.y1 - f.y0) / 50));
          const c = Math.floor(((pos.x - g.inner.x0) / (g.inner.x1 - g.inner.x0)) * cols) + 1;
          const r = Math.floor(((pos.y - g.inner.y0) / (g.inner.y1 - g.inner.y0)) * rows);
          zone = ` · ${String.fromCharCode(65 + r)}${c}`;
        }
        $('statusPos').textContent = `${pos.x.toFixed(1)} , ${pos.y.toFixed(1)} mm${zone}`;
      },
      onFocusField(item) {
        PidPanels.focusField(item);
      }
    };
  }

  function updateHint() {
    const editor = state.editor;
    const hint = $('hint');
    let text = '';
    if (editor.placing) {
      const def = PidSymbols.get(editor.placing.symbol);
      const name = editor.placing.tag ? `${editor.placing.tag} — ${def.name.tr}` : def.name.tr;
      text = `${name}: yerleştirmek için tıklayın · R döndür · X aynala · Esc iptal`;
    } else if (editor.tool === 'line') {
      text = 'Hat: porttan başlayıp başka bir porta, ekipman kenarına veya hatta sürükleyin · Esc çık';
    } else if (editor.tool === 'text') {
      text = 'Metin: yazıyı koymak istediğiniz yere tıklayın';
    }
    hint.textContent = text;
    hint.classList.toggle('hidden', !text);
  }

  function bindUi() {
    const editor = state.editor;
    bindSheetTabs();
    $('btnHome').addEventListener('click', () => showHome());
    $('btnNewProject').addEventListener('click', () => newProjectModal());
    $('btnSample').addEventListener('click', openSample);
    $('btnFolder').addEventListener('click', changeFolder);
    document.querySelectorAll('.home-tab').forEach((b) => {
      b.addEventListener('click', () => selectHomeTab(b.dataset.homeTab));
    });
    $('btnUndo').addEventListener('click', () => editor.undo());
    $('btnRedo').addEventListener('click', () => editor.redo());
    $('btnRotate').addEventListener('click', () => editor.rotateSelection());
    $('btnFlip').addEventListener('click', () => editor.flipSelection());
    $('btnDelete').addEventListener('click', () => editor.deleteSelection());
    $('btnZoomIn').addEventListener('click', () => editor.zoomAt(1.2));
    $('btnZoomOut').addEventListener('click', () => editor.zoomAt(1 / 1.2));
    $('zoomValue').addEventListener('click', () => editor.fit());
    $('btnSave').addEventListener('click', saveProject);
    $('btnExportPdf').addEventListener('click', openPdfDialog);
    $('btnExportSvg').addEventListener('click', exportSvg);
    $('btnLabels').addEventListener('click', exportLabels);
    $('btnCover').addEventListener('click', () => PidCovers.open());
    $('btnReport').addEventListener('click', () => PidReport.open());
    $('snapToggle').addEventListener('change', (e) => { editor.snap = e.target.checked; });
    $('gridToggle').addEventListener('change', (e) => editor.setGrid(e.target.checked));

    document.querySelectorAll('.tool').forEach((b) => {
      b.addEventListener('click', () => editor.setTool(b.dataset.tool));
    });

    const kindSelect = $('lineKind');
    kindSelect.innerHTML = Object.entries(PidSymbols.LINE_KINDS)
      .map(([k, m]) => `<option value="${k}">${esc(m.name.tr)}</option>`).join('');
    kindSelect.addEventListener('change', () => {
      editor.setLineKind(kindSelect.value);
      if (editor.tool !== 'line') editor.setTool('line');
    });

    const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    document.addEventListener('keydown', (e) => {
      if ($('app').classList.contains('hidden')) return;
      // Alt çizimde yakalamayı kapatır; tarayıcı menüsüne odaklanmasın
      if (e.key === 'Alt') e.preventDefault();
      if ($('modalRoot').firstChild) {
        if (e.key === 'Escape') {
          const cancel = $('confirmCancel');
          if (cancel) cancel.click();
          else $('modalRoot').innerHTML = '';
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveProject();
        return;
      }
      // Kapak ve açıklama pencereleri açıkken çizim kısayolları çalışmaz
      if (PidCovers.isOpen()) {
        if (e.key === 'Escape') PidCovers.close();
        return;
      }
      if (PidReport.isOpen()) {
        if (e.key === 'Escape') PidReport.close();
        return;
      }
      // Tarayıcının kendi yazdırması çizim yerine boş sayfa basar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        openPdfDialog();
        return;
      }
      if (typing(e.target)) {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      editor.handleKey(e);
    });
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Alt') e.preventDefault();
      editor.handleKeyUp(e);
    });
    // Tarayıcı kapanırken süren yazmayı beklemez: kaydedilmemiş çizim varsa çıkış sorulur
    window.addEventListener('beforeunload', (e) => {
      if (!state.dirty && !state.saving) return;
      saveNow();
      e.preventDefault();
      e.returnValue = '';
    });
    // Sekmeden çıkarken ve yazdırma penceresinden dönünce dosyalar güncel kalsın
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow();
    });
    window.addEventListener('focus', () => {
      if (inEditor() && state.projectId && !$('tab-files').classList.contains('hidden')) PidPanels.renderFiles();
    });
    // Pencereye bırakılan dosya tarayıcıda açılıp çizimi kapatmasın
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  async function boot() {
    await PidxHost.ready();
    $('btnFolder').textContent = `Klasör: ${PidxHost.rootName()}`;
    state.editor = new PidEditor($('canvas'), editorHost());
    PidPanels.init(publicApi);
    PidMachines.init(publicApi);
    PidReport.init(publicApi);
    PidCovers.init(publicApi);
    bindUi();
    await PidMachines.load();
    const [settings, safety] = await Promise.all([api().readSettings(), PidxHost.readSafetyCatalog()]);
    if (settings.ok && PidCovers.isDesign(settings.settings.kapakTasarimi)) state.coverDesign = settings.settings.kapakTasarimi;
    if (safety.ok) state.safetyMap = new Map(safety.entries.map((e) => [e.id.toUpperCase(), e]));
    await reloadCatalog();
    state.editor.setTool('select');
    await showHome();
  }

  const publicApi = {
    get editor() { return state.editor; },
    get catalog() { return state.catalog; },
    get catalogMap() { return state.catalogMap; },
    get catalogLookup() { return state.catalogLookup; },
    get safetyMap() { return state.safetyMap; },
    get coverDesign() { return state.coverDesign; },
    get machine() { return state.machine; },
    get machineCodes() { return state.machineCodes; },
    get projectId() { return state.projectId; },
    toast,
    renderSheets,
    onMetaChange,
    openProject,
    openSample,
    showHome,
    saveProject,
    openPdfDialog,
    exportCoverPdf,
    exportReportPdf,
    documentPageCount,
    setDocumentLanguage,
    DOC_LANGS,
    addSheet,
    duplicateSheet,
    importDrawingModal,
    renameProject,
    goToSheet,
    moveSheet,
    deleteSheet,
    moveSelectionToSheet,
    logoUri: (rel) => state.logos[rel] || null,
    createDraft,
    setCoverDesign,
    exportSvg,
    projectForMachine,
    projectFromMachine,
    onMachinesChanged,
    reloadCatalog,
    toggleMachineCode,
    addUsedToMachine,
    usedCodesOutsideMachine,
    createMachineFromProject,
    editMachine,
    state
  };

  document.addEventListener('DOMContentLoaded', boot);
  return publicApi;
})();
