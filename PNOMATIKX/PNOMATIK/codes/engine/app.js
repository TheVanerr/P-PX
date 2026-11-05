/* Pnömatik çizim motoru: uygulama akışı (proje açma, P&ID bağlantısı, otomatik oluşturma, kaydetme, dışa aktarma). */

const PidApp = (() => {
  const $ = (id) => document.getElementById(id);
  const api = () => window.PidxHost.engine;
  const pidApi = () => window.PidxHost.pid;
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const DEFAULT_TITLE = 'Pnömatik Devre Şeması';

  const state = {
    editor: null,
    catalog: [],
    catalogMap: new Map(),
    catalogLookup: new Map(),
    catalogSource: '',
    mapping: new Map(),
    coverDesign: PidCovers.DEFAULT_DESIGN,
    pdfOptions: { cover: true, sheets: true, components: true, logic: true, safety: true, mapping: true },
    pidProjectCodes: [],
    pidSource: '',
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
    toastTimer = setTimeout(() => el.classList.add('hidden'), type === 'error' ? 6000 : 3600);
  }

  /* ─── Proje ekranı ────────────────────────────────────── */

  async function showHome(options) {
    await flushSave();
    PidWizard.close();
    $('app').classList.add('hidden');
    $('home').classList.remove('hidden');
    state.projectId = null;
    state.isSample = false;
    state.pidProjectCodes = [];
    selectHomeTab((options && options.tab) || state.homeTab);
    await renderProjects();
    PidPidx.renderLinkState();
    PidPidx.renderPidPage();
  }

  function selectHomeTab(tab) {
    state.homeTab = tab;
    document.querySelectorAll('.home-tab').forEach((b) => b.classList.toggle('active', b.dataset.homeTab === tab));
    $('homeProjects').classList.toggle('hidden', tab !== 'projects');
    $('homePid').classList.toggle('hidden', tab !== 'pid');
    $('homeCodes').classList.toggle('hidden', tab !== 'codes');
    $('btnSample').classList.toggle('hidden', tab !== 'projects');
    $('btnNewProject').classList.toggle('hidden', tab !== 'projects');
    if (tab === 'codes') PidPidx.renderMapping();
    if (tab === 'pid') PidPidx.renderPidPage();
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
      list.innerHTML = '<div class="home-empty">Henüz pnömatik proje yok. "Yeni Proje" ile başlayın veya P&amp;ID Projeleri sekmesinden bir P&amp;ID projesi seçin.</div>';
      return;
    }
    list.innerHTML = res.projects.map((p) => {
      const date = new Date(p.updatedAt).toLocaleDateString('tr-TR');
      const chips = p.inputs.map((i) => `<span class="pc-chip${i.count ? ' has' : ''}">${esc(i.label)}${i.count ? ` · ${i.count}` : ''}</span>`).join('');
      const pidChip = p.meta.pidProje ? `<span class="pc-chip pid">P&amp;ID · ${esc(p.meta.pidProje)}</span>` : '';
      const summary = p.sheets ? `${p.sheets} sayfa · ${p.items} öğe · ${p.links} P&ID kodu bağlı` : 'Çizim henüz başlamadı';
      return `<button type="button" class="project-card" data-id="${esc(p.id)}">
        <div class="pc-no">${esc(p.meta.seriNo)}</div>
        <div class="pc-model">${esc(p.meta.model)}</div>
        <div class="pc-customer">${esc(p.meta.musteri)}</div>
        <div class="pc-chips">${pidChip}${chips}</div>
        <div class="pc-meta">${esc(summary)} · ${date}</div>
      </button>`;
    }).join('');
    list.querySelectorAll('.project-card').forEach((card) => {
      card.addEventListener('click', () => openProject(card.dataset.id));
    });
  }

  /** @param prefill {pidProje, seriNo, musteri, model, firma, dil} P&ID projesinden gelen bilgiler */
  function newProjectModal(prefill) {
    const root = $('modalRoot');
    const pre = prefill || {};
    const status = pidApi().status();
    const pidProjects = PidPidx.projects;
    root.innerHTML = `
      <div class="modal-overlay">
        <form class="modal" id="newProjectForm">
          <h2>Yeni Pnömatik Proje</h2>
          <div class="field">
            <label for="npPid">P&amp;ID projesi</label>
            <select id="npPid" class="field-input"${status.granted ? '' : ' disabled'}>
              <option value="">${status.granted ? 'Bağlanmadı' : 'P&IDX bağlı değil'}</option>
              ${pidProjects.map((p) => `<option value="${esc(p.id)}"${p.id === pre.pidProje ? ' selected' : ''}>${esc(p.id)}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label for="npSeri">Seri no</label><input id="npSeri" class="field-input" placeholder="0626051" required value="${esc(pre.seriNo || '')}"></div>
          <div class="field"><label for="npMusteri">Müşteri</label><input id="npMusteri" class="field-input" placeholder="DÜNYA" required value="${esc(pre.musteri || '')}"></div>
          <div class="field"><label for="npModel">Model</label><input id="npModel" class="field-input" placeholder="ULT M200 3B" required value="${esc(pre.model || '')}"></div>
          <label class="switch-row is-on"><span>P&amp;ID kodlarından şemayı otomatik çiz</span><input type="checkbox" id="npGen" checked></label>
          <div class="modal-actions">
            <button type="button" class="btn" id="npCancel">İptal</button>
            <button type="submit" class="btn btn-primary">Oluştur</button>
          </div>
        </form>
      </div>`;
    const fill = (p) => {
      if (!p) return;
      $('npSeri').value = p.meta.seriNo || '';
      $('npMusteri').value = p.meta.musteri || '';
      $('npModel').value = p.meta.model || '';
    };
    $('npPid').addEventListener('change', (e) => fill(pidProjects.find((p) => p.id === e.target.value)));
    $('npGen').addEventListener('change', (e) => e.target.closest('.switch-row').classList.toggle('is-on', e.target.checked));
    $('npSeri').focus();
    $('npCancel').addEventListener('click', () => { root.innerHTML = ''; });
    $('newProjectForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const res = await api().createProject({
        seriNo: $('npSeri').value,
        musteri: $('npMusteri').value,
        model: $('npModel').value,
        pidProje: $('npPid').value || pre.pidProje || '',
        firma: pre.firma,
        dil: pre.dil
      });
      if (!res.ok) {
        toast(res.error, 'error');
        return;
      }
      const generate = $('npGen').checked;
      root.innerHTML = '';
      await openProject(res.id, { generate, makineId: pre.makineId });
    });
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
      if (/^data:/i.test(rel)) return rel;
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

  /** Projenin P&ID kodları: bağlı P&ID projesinin çizimi + makine kaydı (P&IDX'ten) */
  async function loadPidCodes(meta) {
    state.pidProjectCodes = [];
    state.pidSource = '';
    if (!pidApi().status().granted) return { ok: false };
    if (meta.pidProje) {
      const res = await pidApi().readProject(meta.pidProje);
      if (!res.ok) {
        toast(`P&ID projesi okunamadı: ${res.error}`, 'error');
        return { ok: false };
      }
      state.pidProjectCodes = PidPidx.pneumaticCodes(res.codes);
      state.pidSource = `P&ID projesi ${meta.pidProje}`;
      return { ok: true, source: state.pidSource, codes: res.codes };
    }
    const machine = PidPidx.machines.find((m) => (meta.makineId && m.id === meta.makineId) || String(m.seriNo) === String(meta.seriNo));
    if (machine) {
      const codes = machine.kodlar.map((k) => String(k).toUpperCase());
      state.pidProjectCodes = PidPidx.pneumaticCodes(codes);
      state.pidSource = `Makine kaydı ${machine.seriNo} · ${machine.firma} · ${machine.model}`;
      return { ok: true, source: state.pidSource, codes };
    }
    return { ok: false };
  }

  async function openProject(id, options) {
    const opts = options || {};
    const res = await api().readProject(id);
    if (!res.ok) {
      toast(res.error, 'error');
      return;
    }
    state.projectId = id;
    state.isSample = false;
    state.dirty = false;
    if (opts.makineId && !res.meta.makineId) res.meta.makineId = opts.makineId;
    const drawing = res.drawing || PidModel.createDrawing(DEFAULT_TITLE);
    enterEditor();
    state.editor.load(res.meta, drawing, await loadLogos(res.meta));
    await loadPidCodes(res.meta);
    PidPanels.renderInspector();
    PidReport.invalidate();
    $('projName').textContent = id;
    setSaveState(res.drawing ? 'Kaydedildi' : 'Yeni çizim');
    $('codeFilter').value = state.pidProjectCodes.length ? 'project' : 'pneu';
    renderSheets();
    PidPanels.renderChecks();
    PidPanels.renderCodes();
    PidPanels.renderFiles();
    PidReport.render();
    if (opts.generate) openGenerator();
  }

  async function openSample() {
    const sample = PidSample.build();
    state.projectId = null;
    state.isSample = true;
    state.dirty = false;
    state.pidProjectCodes = sample.pidCodes || [];
    $('codeFilter').value = 'project';
    enterEditor();
    state.editor.load(sample.meta, sample.drawing, await loadLogos(sample.meta));
    PidReport.invalidate();
    $('projName').textContent = 'ÖRNEK ÇİZİM';
    setSaveState('Örnek: kaydedilmez');
    renderSheets();
    PidPanels.renderChecks();
    PidPanels.renderCodes();
    PidPanels.renderFiles();
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
    if (!state.dirty) toast(`Proje kaydedildi: PNOMATIK/projects/${state.projectId}`);
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
      wrap.innerHTML = `${sheets.map((s, i) => `<button type="button" class="sheet-tab" data-index="${i}">${label(s, i)}</button>`).join('')}<button type="button" class="sheet-add" id="sheetAdd" title="Yeni sayfa ekle">+ Sayfa</button>`;
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
  }

  /** Yeni sayfa aynı boyutta açılır; antet numarası (2 / 2) kendiliğinden yazılır */
  function addSheet() {
    const editor = state.editor;
    const sheet = PidModel.createSheet(`${DEFAULT_TITLE} ${editor.drawing.sheets.length + 1}`, editor.sheet.size);
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

  /** Tarayıcının onay penceresi yerine sayfa içi onay (gömülü görünümlerde confirm() çalışmaz) */
  function confirmModal(message, okLabel) {
    return new Promise((resolve) => {
      const root = $('modalRoot');
      root.innerHTML = `
        <div class="modal-overlay">
          <form class="modal" id="confirmForm">
            <h2>Emin misiniz?</h2>
            <p class="field-help">${esc(message)}</p>
            <div class="modal-actions">
              <button type="button" class="btn" id="confirmCancel">Vazgeç</button>
              <button type="submit" class="btn btn-primary">${esc(okLabel || 'Sil')}</button>
            </div>
          </form>
        </div>`;
      const done = (value) => {
        root.innerHTML = '';
        resolve(value);
      };
      $('confirmCancel').addEventListener('click', () => done(false));
      $('confirmForm').addEventListener('submit', (e) => {
        e.preventDefault();
        done(true);
      });
      $('confirmForm').querySelector('button[type="submit"]').focus();
    });
  }

  async function deleteSheet(index) {
    const editor = state.editor;
    if (editor.drawing.sheets.length < 2) return;
    const sheet = editor.drawing.sheets[index];
    if (sheet.items.length && !(await confirmModal(`"${sheet.title}" sayfası ve içindekiler silinecek. Geri Al ile geri getirebilirsiniz.`, 'Sayfayı sil'))) return;
    editor.removeSheet(index);
  }

  /** Seçimi başka sayfaya taşır ve o sayfaya geçer */
  function moveSelectionToSheet(index) {
    const editor = state.editor;
    const target = editor.drawing.sheets[index];
    if (!target || index === editor.sheetIndex) return;
    const moved = PidModel.moveToSheet(editor.sheet, target, [...editor.selection]);
    if (!moved.length) return;
    editor.commit();
    editor.setSheet(index);
    editor.setSelection(moved.filter((id) => !PidModel.isLine(PidModel.findItem(target, id))));
    toast(`${moved.length} öğe ${index + 1}. sayfaya taşındı. Diğer sayfaya giden hatlar boşta kaldıysa Sayfa Bağlantısı ile bağlayın.`);
  }

  /* ─── Otomatik oluşturma ve P&ID kodu bağlama ─────────── */

  /** Sihirbazın çizimi tüm sayfaların yerine geçer (geri alınabilir) */
  function replaceDrawing(drawing) {
    const editor = state.editor;
    editor.drawing.sheets = drawing.sheets;
    editor.sheetIndex = 0;
    editor.selection.clear();
    editor.renderAll();
    editor.fit();
    editor.commit();
    editor.host.onSelection();
    renderSheets();
  }

  function afterGenerate(sheetIndex) {
    const editor = state.editor;
    editor.commit();
    editor.setSheet(Math.max(0, Math.min(sheetIndex, editor.drawing.sheets.length - 1)));
    renderSheets();
  }

  /** Kod kaynağı yoksa kullanıcıya sorulur: P&ID projesi seç veya kod listesi yapıştır */
  function askCodes() {
    const root = $('modalRoot');
    const status = pidApi().status();
    root.innerHTML = `
      <div class="modal-overlay">
        <form class="modal" id="codeSourceForm">
          <h2>Otomatik Oluştur: kod kaynağı</h2>
          <p class="field-help">Bu proje bir P&amp;ID projesine bağlı değil. ${status.granted ? 'Bir P&amp;ID projesi seçin' : 'P&amp;IDX klasörünü bağlayıp bir P&amp;ID projesi seçin'} ya da P&amp;ID kodlarını aşağıya yapıştırın (boşluk, virgül veya satırla ayrılmış).</p>
          <div class="field"><label for="csCodes">P&amp;ID kodları</label><textarea id="csCodes" class="field-input" rows="5" placeholder="V31 V32 V47 V61 V62 PPS13 PPS14 PPS15 SWB01 V01 PS06"></textarea></div>
          <div class="modal-actions">
            <button type="button" class="btn" id="csCancel">İptal</button>
            <button type="button" class="btn" id="csPick">${status.granted ? 'P&amp;ID projesi seç' : 'P&amp;IDX bağla'}</button>
            <button type="submit" class="btn btn-primary">Devam</button>
          </div>
        </form>
      </div>`;
    $('csCancel').addEventListener('click', () => { root.innerHTML = ''; });
    $('csPick').addEventListener('click', async () => {
      root.innerHTML = '';
      if (!status.granted) {
        const ok = status.linked ? await PidPidx.grant() : await PidPidx.link();
        if (!ok) return;
      }
      pickPidProject({ generate: true });
    });
    $('codeSourceForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const codes = $('csCodes').value.toUpperCase().split(/[^A-Z0-9]+/).filter((w) => /^[A-Z]+\d+$/.test(w));
      if (!codes.length) {
        toast('Kod bulunamadı', 'error');
        return;
      }
      root.innerHTML = '';
      PidWizard.open(codes, 'Yapıştırılan kod listesi');
    });
  }

  async function openGenerator() {
    if (!state.editor || !state.editor.drawing) return;
    const meta = state.editor.project;
    if (state.isSample) {
      PidWizard.open(state.pidProjectCodes, 'Örnek kod listesi');
      return;
    }
    if ((meta.pidProje || meta.makineId) && !pidApi().status().granted) {
      const ok = pidApi().status().linked ? await PidPidx.grant() : await PidPidx.link();
      if (!ok) return;
    }
    const res = await loadPidCodes(meta);
    if (res.ok && state.pidProjectCodes.length) {
      PidWizard.open(state.pidProjectCodes, res.source);
      return;
    }
    if (res.ok) toast(`${res.source}: pnömatik kod bulunamadı (V, PPS, SWB, PS)`, 'error');
    askCodes();
  }

  /** P&ID projesi veya makine kaydı seçimi; proje bilgisine yazılır */
  async function pickPidProject(options) {
    const status = pidApi().status();
    if (!status.granted) {
      const ok = status.linked ? await PidPidx.grant() : await PidPidx.link();
      if (!ok) return;
    }
    const projects = PidPidx.projects;
    const machines = PidPidx.machines;
    const meta = state.editor.project;
    const root = $('modalRoot');
    root.innerHTML = `
      <div class="modal-overlay">
        <form class="modal" id="pidPickForm">
          <h2>P&amp;ID projesi bağla</h2>
          <div class="field"><label for="ppProject">P&amp;ID projesi</label>
            <select id="ppProject" class="field-input">
              <option value="">Seçilmedi</option>
              ${projects.map((p) => `<option value="p:${esc(p.id)}"${p.id === meta.pidProje ? ' selected' : ''}>${esc(p.id)} · ${PidPidx.pneumaticCodes(p.codes).length} pnömatik kod</option>`).join('')}
              ${machines.length ? `<optgroup label="Yalnız makine kaydı">${machines.map((m) => `<option value="m:${esc(m.id)}"${!meta.pidProje && m.id === meta.makineId ? ' selected' : ''}>${esc(m.seriNo)} · ${esc(m.firma)} · ${esc(m.model)}</option>`).join('')}</optgroup>` : ''}
            </select>
          </div>
          <div class="field-help">Bağlanan P&amp;ID projesinin çizimindeki kodlar ve makine kaydındaki kodlar Kodlar sekmesinde ★ ile işaretlenir; Otomatik Oluştur bu kodları kullanır.</div>
          <div class="modal-actions">
            <button type="button" class="btn" id="ppCancel">İptal</button>
            <button type="submit" class="btn btn-primary">${options && options.generate ? 'Bağla ve Oluştur' : 'Bağla'}</button>
          </div>
        </form>
      </div>`;
    $('ppCancel').addEventListener('click', () => { root.innerHTML = ''; });
    $('pidPickForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = $('ppProject').value;
      root.innerHTML = '';
      if (value.startsWith('p:')) {
        meta.pidProje = value.slice(2);
        delete meta.makineId;
      } else if (value.startsWith('m:')) {
        meta.pidProje = '';
        meta.makineId = value.slice(2);
      } else {
        meta.pidProje = '';
        delete meta.makineId;
      }
      await loadPidCodes(meta);
      onMetaChange();
      $('codeFilter').value = state.pidProjectCodes.length ? 'project' : 'pneu';
      PidPanels.renderCodes();
      PidPanels.renderInspector();
      if (options && options.generate) openGenerator();
    });
  }

  /** P&ID kodunu şemaya bağlar: eşi şemadaysa boş bobine/sensöre yazar, değilse devresini ekler */
  function linkPidCode(code) {
    const editor = state.editor;
    const kod = String(code || '').toUpperCase();
    const used = PidModel.usedPids(editor.drawing);
    if (used.has(kod)) {
      const u = used.get(kod)[0];
      editor.focusItem(u.sheetId, u.itemId);
      return;
    }
    const nameOf = (k) => ((state.catalogMap.get(k) || {}).name || '');
    if (!PidLink.isRelevant(kod, nameOf(kod))) {
      toast(`${kod} pnömatik bir kod değil; sürükleyerek tek sembol olarak yerleştirebilirsiniz`, 'error');
      return;
    }
    // Projedeki kod, projedeki eşleriyle; projede olmayan kod katalogdaki eşleriyle (V61 → V62, PPS13…) gruplanır
    const pool = new Set([kod]);
    if (state.pidProjectCodes.includes(kod)) {
      for (const k of state.pidProjectCodes) pool.add(k);
    } else {
      for (const c of state.catalog) if (PidLink.isRelevant(c.id, c.name)) pool.add(c.id);
    }
    const grouping = PidLink.group([...pool].map((k) => ({ kod: k, name: nameOf(k) })), state.mapping);
    if (grouping.supply.main && grouping.supply.main.kod === kod) return linkSupply(kod, 'main');
    if (grouping.supply.pressure && grouping.supply.pressure.kod === kod) return linkSupply(kod, 'pressure');
    const group = grouping.circuits.find((g) => g.codes.includes(kod));
    if (!group) {
      toast(`${kod} için eşleşen devre bulunamadı`, 'error');
      return;
    }
    // Eşi şemadaysa (V31 çizili, V32 değil) aynı valfin boş bobinine ya da aktüatörün sensörüne yazılır
    for (const other of group.codes) {
      if (other === kod || !used.has(other)) continue;
      const u = used.get(other)[0];
      const sheet = editor.drawing.sheets.find((s) => s.id === u.sheetId);
      const item = sheet && PidModel.findItem(sheet, u.itemId);
      if (!item) continue;
      const coilSlot = group.coils.findIndex((c) => c && c.kod === kod);
      const sensor = group.sensors.find((s) => s.kod === kod);
      if (coilSlot >= 0 && item.coils && item.coils[coilSlot] && !item.coils[coilSlot].pid) {
        const coils = item.coils.map((c) => Object.assign({}, c));
        coils[coilSlot].pid = kod;
        if (!coils[coilSlot].tag) {
          const p = PidLink.parseIso(item.tag);
          if (p) coils[coilSlot].tag = `${p.circuit}Y${coilSlot + 1}`;
        }
        focusAndUpdate(sheet, item, { coils }, `${kod} → ${coils[coilSlot].tag || 'bobin'} bağlandı`);
        return;
      }
      if (sensor) {
        const target = item.sensors ? item : findActuatorNear(sheet, item);
        if (target) {
          const p = PidLink.parseIso(target.tag);
          const taken = new Set((target.sensors || []).map((s) => s.tag));
          let n = sensor.role === 'B2' ? 2 : sensor.role === 'B3' ? 3 : 1;
          while (p && taken.has(`${p.circuit}B${n}`)) n += 1;
          const sensors = (target.sensors || []).concat({ tag: p ? `${p.circuit}B${n}` : '', pid: kod, pos: sensor.pos });
          focusAndUpdate(sheet, target, { sensors }, `${kod} → ${p ? `${p.circuit}B${n}` : 'sensör'} bağlandı`);
          return;
        }
      }
    }
    // Devre şemada yok: yeni sütun olarak eklenir; zaten çizili kodlar yeni devreye taşınmaz
    const fresh = Object.assign({}, group, {
      coils: group.coils.map((c) => (c && !used.has(c.kod) ? c : null)),
      sensors: group.sensors.filter((s) => !used.has(s.kod))
    });
    if (!fresh.coils[0] && fresh.coils[1]) fresh.coils = [fresh.coils[1], null];
    fresh.valve = PidLink.defaultValve(fresh);
    const plan = PidLink.assign({ supply: {}, circuits: [fresh], excluded: [] }, {
      start: PidLink.maxCircuit(editor.drawing) + 1,
      manualValve: false,
      mainValve: false,
      pressureSensor: false
    });
    const circuit = plan.circuits[0];
    const res = PidGen.addCircuit(editor.drawing, editor.sheetIndex, circuit, { lang: (editor.project && editor.project.dil) || 'tr' });
    editor.commit();
    if (res.sheetIndex !== editor.sheetIndex) editor.setSheet(res.sheetIndex);
    else editor.renderAll();
    renderSheets();
    editor.focusItem(editor.drawing.sheets[res.sheetIndex].id, res.actuatorId);
    toast(`Devre ${circuit.nr} eklendi: ${circuit.actuatorTag}, ${circuit.valveTag} (${group.codes.join(', ')})`);
  }

  function findActuatorNear(sheet, item) {
    if (!item) return null;
    const devre = item.devre;
    return sheet.items.find((it) => PidModel.isSymbol(it) && it.sensors && (devre != null ? it.devre === devre : false)) || null;
  }

  function focusAndUpdate(sheet, item, props, message) {
    const editor = state.editor;
    const index = editor.drawing.sheets.indexOf(sheet);
    if (index !== editor.sheetIndex) editor.setSheet(index);
    editor.updateItem(item, props);
    editor.focusItem(sheet.id, item.id);
    toast(message);
  }

  /** Ana valf (V47) ve besleme basınç sensörü (PS06) beslemedeki sembole yazılır */
  function linkSupply(kod, kind) {
    const editor = state.editor;
    for (const sheet of editor.drawing.sheets) {
      for (const it of sheet.items) {
        if (!PidModel.isSymbol(it) || it.devre !== 0) continue;
        if (kind === 'main' && it.coils && it.coils[0] && !it.coils[0].pid) {
          const coils = it.coils.map((c) => Object.assign({}, c));
          coils[0].pid = kod;
          coils[0].tag = coils[0].tag || '0Y1';
          focusAndUpdate(sheet, it, { coils }, `${kod} → ${it.tag || 'ana valf'} bağlandı`);
          return;
        }
        const def = PidSymbols.get(it.symbol);
        if (kind === 'pressure' && def && def.role === 'sensor' && !it.pid) {
          focusAndUpdate(sheet, it, { pid: kod }, `${kod} → ${it.tag || 'basınç sensörü'} bağlandı`);
          return;
        }
      }
    }
    const symbol = kind === 'main' ? 'v.32nc' : 'k.pressureSensor';
    const props = kind === 'main' ? { coils: [{ tag: '0Y1', pid: kod }] } : { pid: kod };
    editor.startPlacing({ symbol, tag: kind === 'main' ? '0V2' : '0B1', props, pidCode: kod, keep: false });
    toast('Beslemede bağlanacak sembol yok: sembolü yerleştirmek için tıklayın');
  }

  /* ─── Sürükle-bırak: pnömatik kodla yerleştirme ───────── */

  function placeEnv() {
    return {
      drawing: state.editor.drawing,
      mapping: state.mapping,
      catalog: state.catalog,
      catalogMap: state.catalogMap,
      projectCodes: state.pidProjectCodes || []
    };
  }

  const sheetNote = (sheet) => {
    const editor = state.editor;
    const index = editor.drawing.sheets.indexOf(sheet);
    return index >= 0 && index !== editor.sheetIndex ? ` (sayfa ${index + 1})` : '';
  };

  /** PidPlace değişikliğini uygular; focus true ise sembole gidilir (başka sayfada olabilir) */
  function applyPlacement(update, focus) {
    if (!update) return false;
    const editor = state.editor;
    const index = editor.drawing.sheets.indexOf(update.sheet);
    if (index < 0) return false;
    if (index !== editor.sheetIndex) editor.setSheet(index);
    editor.updateItem(update.item, update.props);
    if (focus) editor.focusItem(update.sheet.id, update.item.id);
    else editor.setSelection([update.item.id]);
    toast(update.message);
    return true;
  }

  /** P&ID Kodları sekmesinden sürükleme: sembol pnömatik koduyla gelir; uygun sembolün üstüne bırakılırsa ona bağlanır */
  function placingSpecForCode(code) {
    const editor = state.editor;
    const plan = PidPlace.forCode(code, placeEnv());
    const spec = { symbol: plan.symbol, tag: plan.tag, props: plan.props, pidCode: plan.kod, keep: false };
    spec.accepts = (item) => plan.accepts(item);
    spec.hint = (item, pos) => {
      const update = plan.attach(editor.sheet, item, pos);
      return update ? `${plan.kod} → ${update.label}` : '';
    };
    spec.attach = (item, pos, sheet) => applyPlacement(plan.attach(sheet, item, pos), false);
    if (plan.pending) {
      const pending = plan.pending;
      spec.forced = { sheetId: pending.sheet.id, itemId: pending.item.id, label: `${plan.kod} → ${pending.label}${sheetNote(pending.sheet)}` };
      spec.attachForced = () => applyPlacement(pending, true);
    } else if (plan.exists) {
      const ex = plan.exists;
      const where = ex.part === 'coil' ? ((ex.item.coils || [])[ex.index] || {}).tag
        : ex.part === 'sensor' ? ((ex.item.sensors || [])[ex.index] || {}).tag : ex.item.tag;
      const label = `${plan.kod} şemada: ${[ex.item.tag, where !== ex.item.tag ? where : ''].filter(Boolean).join(' · ') || 'bağlı'}${sheetNote(ex.sheet)}`;
      spec.forced = { sheetId: ex.sheet.id, itemId: ex.item.id, label };
      spec.attachForced = () => {
        editor.focusItem(ex.sheet.id, ex.item.id);
        toast(label);
        return true;
      };
    }
    spec.onPlaced = () => {
      if (plan.label) toast(`${plan.kod} → ${plan.label}`);
      else toast(`${plan.kod} yerleştirildi; pnömatik kodu Özellikler'den verin`);
    };
    return spec;
  }

  /** Semboller sekmesinden yerleştirme; manyetik piston sensörü silindirin üstüne bırakılınca onun sensörü olur */
  function placingSpecForSymbol(symbol, keep) {
    const editor = state.editor;
    const spec = { symbol, keep: !!keep };
    const plan = PidPlace.forSymbol(symbol, placeEnv());
    if (plan) {
      spec.accepts = (item) => plan.accepts(item);
      spec.hint = (item, pos) => {
        const update = plan.attach(editor.sheet, item, pos);
        return update ? `→ ${update.label}` : '';
      };
      spec.attach = (item, pos, sheet) => applyPlacement(plan.attach(sheet, item, pos), false);
    }
    return spec;
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

  /** Eşleştirme sayfası zorunluysa seçeneklere eklenir */
  function withRequired(options) {
    const out = Object.assign({}, options);
    if (PidReport.mappingRequired()) out.mapping = true;
    return out;
  }

  /** @param options hangi bölümler basılacak; suffix PDF dosya adının sonu */
  async function runPdf(options) {
    if (state.pdfBusy) return;
    state.pdfBusy = true;
    const direct = !PidxHost.preview;
    if (direct) toast('PDF hazırlanıyor…');
    const editor = state.editor;
    const root = $('printRoot');
    try {
      await flushSave();
      if (direct) {
        await PidPdfDom.loadFonts((file) => api().assetBytes(`../assets/fonts/${file}`));
        PidPdfDom.begin();
      }
      root.innerHTML = '';
      appendDocument(root, options);
      await PidxHost.imagesDecoded(root);
      await PidxHost.nextPaint();
      if (!direct) {
        const printed = await api().exportPdf({ id: state.projectId, fileName: exportBaseName(), suffix: options.suffix });
        if (!printed.ok) toast(`PDF oluşturulamadı: ${printed.error}`, 'error');
        return;
      }
      const pdf = await PidPdfDom.render(root, {
        title: `${exportBaseName()} ${options.suffix || 'PNÖMATİK DİYAGRAM'}`,
        onProgress: (done, total) => toast(`PDF hazırlanıyor: ${done} / ${total} sayfa`)
      });
      const res = await api().exportPdf({ id: state.projectId, fileName: exportBaseName(), suffix: options.suffix, bytes: pdf.bytes });
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
      if (direct) PidPdfDom.end();
      state.pdfBusy = false;
    }
  }

  /** Tam belgeyi yazdırma alanına ekler */
  function appendDocument(root, options) {
    const editor = state.editor;
    const meta = editor.project;
    // Sıra: kapak, Açıklama 1, Açıklama 2 (kod eşleştirme), şema sayfaları. Kapak numarasız, gerisi tek sırada numaralanır.
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

  /** Seçili bölümlere göre belgenin numaralı sayfa sayısı (kapak hariç) */
  function documentPageCount() {
    const opts = withRequired(state.pdfOptions);
    return PidReport.pageCount(opts) + (opts.sheets ? state.editor.drawing.sheets.length : 0);
  }

  const NO_PRINT = 'Bu önizleme PDF ve dosya indiremez. PDF için programı bilgisayarınızda index.html ile açın.';

  function openPdfDialog() {
    if (PidxHost.noPrint) {
      toast(NO_PRINT, 'error');
      return;
    }
    const root = $('modalRoot');
    const opts = state.pdfOptions;
    const data = PidReport.current();
    const required = PidReport.mappingRequired(data);
    const row = (key, label, note, locked) => {
      const on = locked || opts[key];
      return `<label class="switch-row${on ? ' is-on' : ''}"${locked ? ' title="Pnömatik kodlar P&ID kodlarından farklı: eşleştirme sayfası zorunlu"' : ''}><span>${label}${note ? ` <small class="pdf-note">${note}</small>` : ''}</span><input type="checkbox" data-pdf="${key}"${on ? ' checked' : ''}${locked ? ' disabled' : ''}></label>`;
    };
    const count = (n, empty) => (n ? String(n) : empty);
    root.innerHTML = `
      <div class="modal-overlay">
        <form class="modal" id="pdfForm">
          <h2>PDF İndir</h2>
          ${row('cover', 'Kapak')}
          ${row('components', 'Açıklama 1: Bileşen listesi', count(data.components.length, 'boş'))}
          ${row('logic', 'Açıklama 1: Bağlantı mantığı', count(data.logic.length, 'boş'))}
          ${row('safety', 'Açıklama 1: Güvenlik fonksiyonları', count(data.safety.length, 'boş'))}
          ${row('mapping', 'Açıklama 2: P&amp;ID – pnömatik kod eşleştirme', required ? `${data.mappingDiffers} farklı kod · zorunlu` : count(data.mapping.length, 'boş'), required)}
          ${row('sheets', 'Pnömatik şema sayfaları', String(state.editor.drawing.sheets.length))}
          ${PidxHost.preview ? '<div class="field-help">Açılan pencerede hedef olarak <strong>PDF olarak kaydet</strong>i seçin.</div><div class="field-help warn">Önizleme: yazdırma penceresi yalnız dosya Chrome veya Edge ile açıldığında açılır; gömülü görünümlerde açılmaz.</div>' : ''}
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
    $('pdfCancel').addEventListener('click', () => { root.innerHTML = ''; });
    $('pdfForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const chosen = withRequired(opts);
      if (!['cover', 'sheets', 'components', 'logic', 'safety', 'mapping'].some((k) => chosen[k])) {
        toast('En az bir bölüm seçin', 'error');
        return;
      }
      root.innerHTML = '';
      runPdf(chosen);
    });
  }

  function exportCoverPdf() {
    if (PidxHost.noPrint) {
      toast(NO_PRINT, 'error');
      return;
    }
    if (PidxHost.preview) toast('Hedef olarak "PDF olarak kaydet" seçin');
    runPdf({ cover: true, suffix: 'KAPAK' });
  }

  function exportReportPdf() {
    if (PidxHost.noPrint) {
      toast(NO_PRINT, 'error');
      return;
    }
    const opts = withRequired(state.pdfOptions);
    const wanted = { components: opts.components, logic: opts.logic, safety: opts.safety, mapping: opts.mapping };
    if (!PidReport.pageCount(wanted)) {
      toast('Açıklama sayfalarında gösterilecek içerik yok', 'error');
      return;
    }
    if (PidxHost.preview) toast('Hedef olarak "PDF olarak kaydet" seçin');
    runPdf(Object.assign(wanted, { suffix: 'ACIKLAMA' }));
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
    if (PidxHost.noPrint) {
      toast(NO_PRINT, 'error');
      return;
    }
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

  /* ─── Katalog ve eşleştirme listesi ───────────────────── */

  function inEditor() {
    return !$('app').classList.contains('hidden');
  }

  async function reloadCatalog() {
    const res = await api().catalog();
    if (!res.ok) {
      toast(`P&ID kod listesi okunamadı: ${res.error}`, 'error');
      return;
    }
    state.catalog = res.entries;
    state.catalogSource = res.source;
    state.catalogMap = new Map(res.entries.map((e) => [e.id, e]));
    state.catalogLookup = state.catalogMap;
    PidPanels.setCatalog();
    PidPidx.renderMapping();
    if (inEditor()) {
      PidReport.invalidate();
      PidPanels.renderCodes();
      PidPanels.renderChecks();
      PidReport.render();
    }
  }

  async function loadMapping() {
    const res = await api().readMapping();
    state.mapping = res.ok ? PidLink.parseMappingCsv(res.text) : new Map();
  }

  function setMapping(map) {
    state.mapping = map;
    if (inEditor()) PidPanels.renderCodes();
  }

  async function saveMapping(map) {
    const res = await api().saveMapping(PidLink.toMappingCsv(map));
    if (!res.ok) {
      toast(`Kod eşleştirme listesi kaydedilemedi: ${res.error}`, 'error');
      return false;
    }
    setMapping(map);
    PidPidx.renderMapping();
    return true;
  }

  /** P&IDX bağlandığında veya izin verildiğinde */
  async function onPidLinked() {
    await renderProjects();
    if (inEditor() && state.editor.project) {
      await loadPidCodes(state.editor.project);
      PidReport.invalidate();
      PidPanels.renderCodes();
      PidPanels.renderChecks();
      PidReport.render();
    }
  }

  async function grantPid() {
    const ok = await PidPidx.grant();
    if (ok) toast('P&IDX klasörüne izin verildi');
  }

  /* ─── Bağlantılar ─────────────────────────────────────── */

  function onMetaChange() {
    const editor = state.editor;
    loadLogos(editor.project).then((logos) => {
      Object.assign(editor.ctx, logos, { showPid: editor.project.pidEtiket !== false });
      editor.refreshFrame();
    });
    scheduleSave();
    PidReport.invalidate();
    PidPanels.renderCodes();
    PidPanels.renderChecks();
    PidReport.schedule();
  }

  function editorHost() {
    return {
      onChange() {
        scheduleSave();
        PidReport.invalidate();
        PidPanels.renderChecks();
        PidPanels.renderCodes();
        PidReport.schedule();
      },
      onHistory() {
        $('btnUndo').disabled = state.editor.undoStack.length < 2;
        $('btnRedo').disabled = !state.editor.redoStack.length;
      },
      onSelection() {
        PidPanels.renderInspector();
      },
      onSheets() {
        renderSheets();
        PidReport.schedule();
      },
      onZoom(k) {
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
      const spec = editor.placing;
      const def = PidSymbols.get(spec.symbol);
      if (spec.pidCode && spec.forced) {
        text = `${spec.forced.label}: bırakınca oraya yazılır · Esc iptal`;
      } else if (spec.pidCode) {
        const code = spec.tag ? `${spec.pidCode} → ${spec.tag}` : spec.pidCode;
        text = `${code} — ${def.name.tr}: boş alana bırakın ya da bağlanacağı sembolün üstüne bırakın · Esc iptal`;
      } else if (spec.accepts) {
        text = `${def.name.tr}: yerleştirmek için tıklayın ya da silindirin üstüne bırakıp sensörü yapın · R döndür · sağ tuşla sürükle kaydır · Esc veya sağ tık iptal`;
      } else {
        text = `${def.name.tr}: yerleştirmek için tıklayın · R döndür · X aynala · sağ tuşla sürükle kaydır · Esc veya sağ tık iptal`;
      }
    } else if (editor.tool === 'line') {
      text = 'Hat: porttan başlayıp başka bir porta veya hatta sürükleyin · hat tipini üstten seçin · sağ tuşla sürükle kaydır · Esc çık';
    } else if (editor.tool === 'text') {
      text = 'Metin: yazıyı koymak istediğiniz yere tıklayın';
    }
    hint.textContent = text;
    hint.classList.toggle('hidden', !text);
  }

  function bindUi() {
    const editor = state.editor;
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
    $('btnGenerate').addEventListener('click', openGenerator);
    $('btnSave').addEventListener('click', saveProject);
    $('btnExportPdf').addEventListener('click', openPdfDialog);
    $('btnExportSvg').addEventListener('click', exportSvg);
    $('btnCover').addEventListener('click', () => PidCovers.open());
    $('btnReport').addEventListener('click', () => PidReport.open());
    bindSheetTabs();
    $('snapToggle').addEventListener('change', (e) => { editor.snap = e.target.checked; });
    $('gridToggle').addEventListener('change', (e) => editor.setGrid(e.target.checked));

    document.querySelectorAll('.tool').forEach((b) => {
      b.addEventListener('click', () => editor.setTool(b.dataset.tool));
    });

    const kindSelect = $('lineKind');
    kindSelect.innerHTML = Object.entries(PidSymbols.LINE_KINDS)
      .map(([k, m]) => `<option value="${k}">${esc(m.name.tr)}</option>`).join('');
    kindSelect.value = 'work';
    kindSelect.addEventListener('change', () => {
      editor.setLineKind(kindSelect.value);
      if (editor.tool !== 'line') editor.setTool('line');
    });

    const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    document.addEventListener('keydown', (e) => {
      if ($('app').classList.contains('hidden')) return;
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
      if (PidCovers.isOpen()) {
        if (e.key === 'Escape') PidCovers.close();
        return;
      }
      if (PidReport.isOpen()) {
        if (e.key === 'Escape') PidReport.close();
        return;
      }
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
    window.addEventListener('beforeunload', (e) => {
      if (!state.dirty && !state.saving) return;
      saveNow();
      e.preventDefault();
      e.returnValue = '';
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow();
    });
    window.addEventListener('focus', () => {
      if (inEditor() && state.projectId && !$('tab-files').classList.contains('hidden')) PidPanels.renderFiles();
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  async function boot() {
    await PidxHost.ready();
    $('btnFolder').textContent = `Klasör: ${PidxHost.rootName()}`;
    state.editor = new PidEditor($('canvas'), editorHost());
    PidPanels.init(publicApi);
    PidPidx.init(publicApi);
    PidWizard.init(publicApi);
    PidReport.init(publicApi);
    PidCovers.init(publicApi);
    bindUi();
    const settings = await api().readSettings();
    if (settings.ok && PidCovers.isDesign(settings.settings.kapakTasarimi)) state.coverDesign = settings.settings.kapakTasarimi;
    await loadMapping();
    await reloadCatalog();
    await PidPidx.load();
    state.editor.setTool('select');
    await showHome();
  }

  const publicApi = {
    get editor() { return state.editor; },
    get catalog() { return state.catalog; },
    get catalogMap() { return state.catalogMap; },
    logoUri: (rel) => state.logos[rel] || null,
    get catalogLookup() { return state.catalogLookup; },
    get mapping() { return state.mapping; },
    get coverDesign() { return state.coverDesign; },
    get projectId() { return state.projectId; },
    get pidProjectCodes() { return state.pidProjectCodes; },
    get pidSource() { return state.pidSource; },
    toast,
    placingSpecForCode,
    placingSpecForSymbol,
    renderSheets,
    addSheet,
    duplicateSheet,
    goToSheet,
    moveSheet,
    deleteSheet,
    moveSelectionToSheet,
    onMetaChange,
    openProject,
    openSample,
    showHome,
    saveProject,
    newProjectModal,
    openPdfDialog,
    exportCoverPdf,
    exportReportPdf,
    documentPageCount,
    setCoverDesign,
    exportSvg,
    reloadCatalog,
    setMapping,
    saveMapping,
    onPidLinked,
    grantPid,
    openGenerator,
    pickPidProject,
    linkPidCode,
    replaceDrawing,
    afterGenerate,
    state
  };

  document.addEventListener('DOMContentLoaded', boot);
  return publicApi;
})();
