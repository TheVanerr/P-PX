/* P&ID doküman renderer — antet/kapak entegrasyonu */

let currentFirma = 'DOLFIN';
let currentModel = '';
let currentRev = '01';
let currentDate = '';
let currentLang = 'tr';
let viewMode = 'pdf';
let exportModalType = 'pdf';
let selectedInterlocks = [];
const safetyMatrixSelectionByModel = new Map();
let safetyMatrixCatalogLoaded = false;
let safetyMatrixFilterQuery = '';
let safetyMatrixFilterCategory = '';
let selectedProcessItems = [];
let selectedPidComponents = [];
const pidComponentSelectionByModel = new Map();
let pidComponentCatalogLoaded = false;
let pidComponentFilterQuery = '';
let pidComponentFilterCategory = '';
let selectedDrawings = [];

const drawingSvgCache = new Map();
let drawingsBrowsePath = '';
let drawingsPendingSelection = [];
const drawingPreviewCache = new Map();

const EXPORT_LANGS = [
  { code: 'tr', label: 'Türkçe', flag: 'flags/tr.svg' },
  { code: 'en', label: 'English', flag: 'flags/en.svg' },
  { code: 'de', label: 'Deutsch', flag: 'flags/de.svg' }
];

const EXPORT_FILE_SUFFIX = 'P&ID DIAGRAM';

const PID_I18N = {
  tr: {
    langChanged: (lang) => `Dil değiştirildi: ${lang.toUpperCase()}`,
    pdfHint: 'Yazdırma penceresinde hedef olarak "PDF olarak kaydet" seçin',
    htmlBuilding: 'HTML oluşturuluyor…',
    htmlSaved: 'HTML kaydedildi',
    htmlCancelled: 'HTML kaydı iptal edildi',
    htmlFailed: 'HTML kaydedilemedi',
    htmlNotFound: 'HTML içeriği bulunamadı',
    exportTitle: (model) => `${model.toUpperCase()} SERİSİ P&ID DOKÜMANI`,
    exportModalTitlePdf: 'PDF Dilleri',
    exportModalTitleHtml: 'HTML Dilleri',
    exportModalDesc: 'Dahil edilecek dilleri seçin. Seçilen sırayla birleştirilir.',
    exportModalConfirmPdf: 'PDF Oluştur',
    exportModalConfirmHtml: 'HTML Oluştur',
    exportModalCancel: 'İptal',
    exportModalNoLang: 'En az bir dil seçin',
    exportFileNameLabel: 'Dosya adı',
    exportFileNamePlaceholder: '0226078-VICO-LYM 1350'
  },
  en: {
    langChanged: (lang) => `Language changed: ${lang.toUpperCase()}`,
    pdfHint: 'In the print dialog, choose "Save as PDF" as the destination',
    htmlBuilding: 'Building HTML…',
    htmlSaved: 'HTML saved',
    htmlCancelled: 'HTML export cancelled',
    htmlFailed: 'Could not save HTML',
    htmlNotFound: 'HTML content not found',
    exportTitle: (model) => `${model.toUpperCase()} SERIES P&ID DOCUMENT`,
    exportModalTitlePdf: 'PDF Languages',
    exportModalTitleHtml: 'HTML Languages',
    exportModalDesc: 'Select languages to include. They will be merged in order.',
    exportModalConfirmPdf: 'Create PDF',
    exportModalConfirmHtml: 'Create HTML',
    exportModalCancel: 'Cancel',
    exportModalNoLang: 'Select at least one language',
    exportFileNameLabel: 'File name',
    exportFileNamePlaceholder: '0226078-VICO-LYM 1350'
  },
  de: {
    langChanged: (lang) => `Sprache geändert: ${lang.toUpperCase()}`,
    pdfHint: 'Wählen Sie im Druckdialog "Als PDF speichern" als Ziel',
    htmlBuilding: 'HTML wird erstellt…',
    htmlSaved: 'HTML gespeichert',
    htmlCancelled: 'HTML-Export abgebrochen',
    htmlFailed: 'HTML konnte nicht gespeichert werden',
    htmlNotFound: 'HTML-Inhalt nicht gefunden',
    exportTitle: (model) => `${model.toUpperCase()} SERIE P&ID-DOKUMENT`,
    exportModalTitlePdf: 'PDF-Sprachen',
    exportModalTitleHtml: 'HTML-Sprachen',
    exportModalDesc: 'Sprachen auswählen. Sie werden der Reihe nach zusammengefügt.',
    exportModalConfirmPdf: 'PDF erstellen',
    exportModalConfirmHtml: 'HTML erstellen',
    exportModalCancel: 'Abbrechen',
    exportModalNoLang: 'Mindestens eine Sprache wählen',
    exportFileNameLabel: 'Dateiname',
    exportFileNamePlaceholder: '0226078-VICO-LYM 1350'
  }
};

function t() {
  return PID_I18N[currentLang] || PID_I18N.tr;
}

function sanitizeFileBase(name) {
  return String(name || '')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildExportFileName(userInput) {
  const base = sanitizeFileBase(userInput) || sanitizeFileBase(currentModel) || 'pid-dokuman';
  return `${base} ${EXPORT_FILE_SUFFIX}`;
}

function defaultExportFileNameInput() {
  return sanitizeFileBase(currentModel) || '';
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function bindControls() {
  const firmaSelect = document.getElementById('firmaSelect');
  const modelSelect = document.getElementById('modelSelect');
  const revInput = document.getElementById('revInput');
  const dateInput = document.getElementById('dateInput');
  const pdfBtn = document.getElementById('pdfBtn');
  const htmlBtn = document.getElementById('htmlBtn');

  dateInput.value = todayIso();
  currentDate = dateInput.value;

  firmaSelect.addEventListener('change', () => {
    currentFirma = firmaSelect.value;
    void renderDocument();
  });

  modelSelect.addEventListener('change', () => {
    currentModel = modelSelect.value;
    loadSafetyMatrixSelection();
    loadProcessOverviewSelection();
    loadPidComponentSelection();
    loadPidDrawingsSelection();
    void renderDocument();
  });

  revInput.addEventListener('change', () => {
    currentRev = revInput.value.trim() || '01';
    void renderDocument();
  });

  dateInput.addEventListener('change', () => {
    currentDate = dateInput.value;
    void renderDocument();
  });

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => setViewMode(btn.dataset.view));
  });

  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });

  pdfBtn.addEventListener('click', () => openExportModal('pdf'));
  htmlBtn.addEventListener('click', () => openExportModal('html'));
  document.getElementById('safetyMatrixBtn')?.addEventListener('click', openSafetyMatrixModal);
  document.getElementById('processOverviewBtn')?.addEventListener('click', openProcessOverviewModal);
  document.getElementById('pidComponentBtn')?.addEventListener('click', openPidComponentModal);
  document.getElementById('pidDrawingsBtn')?.addEventListener('click', openPidDrawingsModal);
  document.getElementById('engineBtn')?.addEventListener('click', () => window.PidxHost.engine.open());

  loadSafetyMatrixSelection();
  loadProcessOverviewSelection();
  loadPidComponentSelection();
  loadPidDrawingsSelection();
  initExportModal();
  initSafetyMatrixModal();
  initProcessOverviewModal();
  initPidComponentModal();
  initPidDrawingsModal();
}

function safetyMatrixStorageKey() {
  return currentModel || '__default__';
}

async function loadSafetyMatrixCatalog() {
  const result = await window.PidxHost.readSafetyCatalog();
  if (!result?.ok) {
    showToast(result?.error || getSafetyMatrixMeta(currentLang).catalogEmpty, 'error');
    return false;
  }

  setSafetyMatrixCatalog(result.entries);
  safetyMatrixCatalogLoaded = true;
  return true;
}

function loadSafetyMatrixSelection() {
  selectedInterlocks = safetyMatrixSelectionByModel.get(safetyMatrixStorageKey()) || [];
  if (!Array.isArray(selectedInterlocks)) selectedInterlocks = [];
  selectedInterlocks = selectedInterlocks.filter(id => SAFETY_MATRIX_ORDER.includes(id));
}

function saveSafetyMatrixSelection() {
  safetyMatrixSelectionByModel.set(safetyMatrixStorageKey(), [...selectedInterlocks]);
}

function buildSafetyMatrixCategoryFilterOptions() {
  const select = document.getElementById('safetyMatrixCategoryFilter');
  if (!select) return;

  const meta = getSafetyMatrixMeta(currentLang);
  const current = safetyMatrixFilterCategory;
  select.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = meta.categoryAll;
  select.appendChild(allOption);

  for (const category of getSafetyMatrixCategories()) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  }

  select.value = [...select.options].some(opt => opt.value === current) ? current : '';
  safetyMatrixFilterCategory = select.value;
}

function renderSafetyMatrixListItems() {
  const list = document.getElementById('safetyMatrixList');
  if (!list) return;

  list.innerHTML = '';
  if (!SAFETY_MATRIX_ORDER.length) {
    const empty = document.createElement('div');
    empty.className = 'component-picker-empty';
    empty.textContent = getSafetyMatrixMeta(currentLang).catalogEmpty;
    list.appendChild(empty);
    updateSafetyMatrixSelectionCount();
    return;
  }

  const query = safetyMatrixFilterQuery.trim().toLowerCase();

  for (const id of SAFETY_MATRIX_ORDER) {
    const labelText = getSafetyMatrixModalLabel(id, currentLang);
    const category = getSafetyMatrixCategory(id);
    const searchText = getSafetyMatrixSearchText(id, currentLang).toLowerCase();
    const matchesQuery = !query || searchText.includes(query);
    const matchesCategory = !safetyMatrixFilterCategory || category === safetyMatrixFilterCategory;

    const label = document.createElement('label');
    label.className = 'component-picker-item';
    label.dataset.matrixId = id;
    label.dataset.category = category;
    if (!matchesQuery || !matchesCategory) label.classList.add('is-hidden');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'safetyMatrixItem';
    input.value = id;
    input.checked = selectedInterlocks.includes(id);
    input.addEventListener('change', updateSafetyMatrixSelectionCount);

    const idBadge = document.createElement('span');
    idBadge.className = 'matrix-id-badge';
    idBadge.textContent = id;

    const text = document.createElement('span');
    text.className = 'matrix-item-label';
    text.dataset.matrixId = id;
    text.textContent = labelText;

    label.appendChild(input);
    label.appendChild(idBadge);
    label.appendChild(text);

    if (category) {
      const cat = document.createElement('span');
      cat.className = 'component-item-category';
      cat.textContent = category;
      label.appendChild(cat);
    }

    list.appendChild(label);
  }

  updateSafetyMatrixSelectionCount();
}

function updateSafetyMatrixSelectionCount() {
  const countEl = document.getElementById('safetyMatrixCount');
  if (!countEl) return;

  const meta = getSafetyMatrixMeta(currentLang);
  const checked = document.querySelectorAll('input[name="safetyMatrixItem"]:checked').length;
  const total = SAFETY_MATRIX_ORDER.length;
  countEl.textContent = meta.selectedCount(checked, total);
}

function applySafetyMatrixListFilters() {
  const query = safetyMatrixFilterQuery.trim().toLowerCase();
  document.querySelectorAll('#safetyMatrixList .component-picker-item').forEach(item => {
    const id = item.dataset.matrixId || '';
    const category = item.dataset.category || '';
    const searchText = getSafetyMatrixSearchText(id, currentLang).toLowerCase();
    const matchesQuery = !query || searchText.includes(query);
    const matchesCategory = !safetyMatrixFilterCategory || category === safetyMatrixFilterCategory;
    item.classList.toggle('is-hidden', !(matchesQuery && matchesCategory));
  });
  updateSafetyMatrixSelectionCount();
}

function initSafetyMatrixModal() {
  buildSafetyMatrixCategoryFilterOptions();
  renderSafetyMatrixListItems();

  const search = document.getElementById('safetyMatrixSearch');
  const categoryFilter = document.getElementById('safetyMatrixCategoryFilter');

  search?.addEventListener('input', () => {
    safetyMatrixFilterQuery = search.value;
    applySafetyMatrixListFilters();
  });

  categoryFilter?.addEventListener('change', () => {
    safetyMatrixFilterCategory = categoryFilter.value;
    applySafetyMatrixListFilters();
  });

  document.getElementById('safetyMatrixSelectVisible')?.addEventListener('click', () => {
    document.querySelectorAll('#safetyMatrixList .component-picker-item:not(.is-hidden) input[name="safetyMatrixItem"]')
      .forEach(input => { input.checked = true; });
    updateSafetyMatrixSelectionCount();
  });

  document.getElementById('safetyMatrixClearAll')?.addEventListener('click', () => {
    document.querySelectorAll('input[name="safetyMatrixItem"]').forEach(input => { input.checked = false; });
    updateSafetyMatrixSelectionCount();
  });

  document.getElementById('safetyMatrixCancel')?.addEventListener('click', closeSafetyMatrixModal);
  document.getElementById('safetyMatrixConfirm')?.addEventListener('click', confirmSafetyMatrix);
  document.getElementById('safetyMatrixModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'safetyMatrixModal') closeSafetyMatrixModal();
  });
}

function updateSafetyMatrixModalText() {
  const meta = getSafetyMatrixMeta(currentLang);
  const title = document.getElementById('safetyMatrixModalTitle');
  const desc = document.getElementById('safetyMatrixModalDesc');
  const confirm = document.getElementById('safetyMatrixConfirm');
  const cancel = document.getElementById('safetyMatrixCancel');
  const search = document.getElementById('safetyMatrixSearch');
  const selectVisible = document.getElementById('safetyMatrixSelectVisible');
  const clearAll = document.getElementById('safetyMatrixClearAll');

  if (title) title.textContent = meta.modalTitle;
  if (desc) desc.textContent = meta.modalDesc;
  if (confirm) confirm.textContent = meta.modalConfirm;
  if (cancel) cancel.textContent = meta.modalCancel;
  if (search) search.placeholder = meta.searchPlaceholder;
  if (selectVisible) selectVisible.textContent = meta.selectVisible;
  if (clearAll) clearAll.textContent = meta.clearAll;

  buildSafetyMatrixCategoryFilterOptions();
  document.querySelectorAll('.matrix-item-label').forEach(el => {
    const id = el.dataset.matrixId;
    if (id) el.textContent = getSafetyMatrixModalLabel(id, currentLang);
  });
  updateSafetyMatrixSelectionCount();
}

async function openSafetyMatrixModal() {
  const modal = document.getElementById('safetyMatrixModal');
  if (!modal) return;

  const result = await window.PidxHost.readSafetyCatalog();
  if (result?.ok) {
    const prevOrder = SAFETY_MATRIX_ORDER.join('|');
    setSafetyMatrixCatalog(result.entries);
    if (SAFETY_MATRIX_ORDER.join('|') !== prevOrder) {
      loadSafetyMatrixSelection();
      renderSafetyMatrixListItems();
    }
  }

  updateSafetyMatrixModalText();
  modal.querySelectorAll('input[name="safetyMatrixItem"]').forEach(input => {
    input.checked = selectedInterlocks.includes(input.value);
  });
  updateSafetyMatrixSelectionCount();

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('safetyMatrixSearch')?.focus();
}

function closeSafetyMatrixModal() {
  const modal = document.getElementById('safetyMatrixModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function confirmSafetyMatrix() {
  const checked = [...document.querySelectorAll('input[name="safetyMatrixItem"]:checked')]
    .map(el => el.value);
  selectedInterlocks = SAFETY_MATRIX_ORDER.filter(id => checked.includes(id));
  saveSafetyMatrixSelection();
  closeSafetyMatrixModal();
  void renderDocument();
  showToast(getSafetyMatrixMeta(currentLang).modalSaved, 'success');
}

function processOverviewStorageKey() {
  return `pid-process-overview:${currentModel}`;
}

function loadProcessOverviewSelection() {
  try {
    const raw = localStorage.getItem(processOverviewStorageKey());
    selectedProcessItems = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(selectedProcessItems)) selectedProcessItems = [];
    selectedProcessItems = selectedProcessItems.filter(id => PROCESS_OVERVIEW_ORDER.includes(id));
  } catch {
    selectedProcessItems = [];
  }
}

function saveProcessOverviewSelection() {
  localStorage.setItem(processOverviewStorageKey(), JSON.stringify(selectedProcessItems));
}

function initProcessOverviewModal() {
  const list = document.getElementById('processOverviewList');
  if (!list) return;

  list.innerHTML = '';
  for (const id of PROCESS_OVERVIEW_ORDER) {
    const label = document.createElement('label');
    label.className = 'modal-lang-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'processOverviewItem';
    input.value = id;

    const idBadge = document.createElement('span');
    idBadge.className = 'matrix-id-badge';
    idBadge.textContent = id;

    const text = document.createElement('span');
    text.className = 'process-item-label';
    text.dataset.processId = id;
    text.textContent = getProcessOverviewModalLabel(id, currentLang);

    label.appendChild(input);
    label.appendChild(idBadge);
    label.appendChild(text);
    list.appendChild(label);
  }

  document.getElementById('processOverviewCancel')?.addEventListener('click', closeProcessOverviewModal);
  document.getElementById('processOverviewConfirm')?.addEventListener('click', confirmProcessOverview);
  document.getElementById('processOverviewModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'processOverviewModal') closeProcessOverviewModal();
  });
}

function updateProcessOverviewModalText() {
  const meta = getProcessOverviewMeta(currentLang);
  const title = document.getElementById('processOverviewModalTitle');
  const desc = document.getElementById('processOverviewModalDesc');
  const confirm = document.getElementById('processOverviewConfirm');
  const cancel = document.getElementById('processOverviewCancel');

  if (title) title.textContent = meta.modalTitle;
  if (desc) desc.textContent = meta.modalDesc;
  if (confirm) confirm.textContent = meta.modalConfirm;
  if (cancel) cancel.textContent = meta.modalCancel;

  document.querySelectorAll('.process-item-label').forEach(el => {
    const id = el.dataset.processId;
    if (id) el.textContent = getProcessOverviewModalLabel(id, currentLang);
  });
}

function openProcessOverviewModal() {
  const modal = document.getElementById('processOverviewModal');
  if (!modal) return;

  updateProcessOverviewModalText();
  modal.querySelectorAll('input[name="processOverviewItem"]').forEach(input => {
    input.checked = selectedProcessItems.includes(input.value);
  });

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeProcessOverviewModal() {
  const modal = document.getElementById('processOverviewModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function confirmProcessOverview() {
  const checked = [...document.querySelectorAll('input[name="processOverviewItem"]:checked')]
    .map(el => el.value);
  selectedProcessItems = PROCESS_OVERVIEW_ORDER.filter(id => checked.includes(id));
  saveProcessOverviewSelection();
  closeProcessOverviewModal();
  void renderDocument();
  showToast(getProcessOverviewMeta(currentLang).modalSaved, 'success');
}

function pidComponentStorageKey() {
  return currentModel || '__default__';
}

async function loadPidComponentCatalog() {
  const result = await window.PidxHost.readKodCatalog();
  if (!result?.ok) {
    showToast(result?.error || getPidComponentMeta(currentLang).catalogEmpty, 'error');
    return false;
  }

  setPidComponentCatalog(result.entries);
  pidComponentCatalogLoaded = true;
  return true;
}

function loadPidComponentSelection() {
  selectedPidComponents = pidComponentSelectionByModel.get(pidComponentStorageKey()) || [];
  if (!Array.isArray(selectedPidComponents)) selectedPidComponents = [];
  selectedPidComponents = selectedPidComponents.filter(id => PID_COMPONENT_ORDER.includes(id));
}

function savePidComponentSelection() {
  pidComponentSelectionByModel.set(pidComponentStorageKey(), [...selectedPidComponents]);
}

function buildPidComponentCategoryFilterOptions() {
  const select = document.getElementById('pidComponentCategoryFilter');
  if (!select) return;

  const meta = getPidComponentMeta(currentLang);
  const current = pidComponentFilterCategory;
  select.innerHTML = '';

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = meta.categoryAll;
  select.appendChild(allOption);

  for (const category of getPidComponentCategories()) {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    select.appendChild(option);
  }

  select.value = [...select.options].some(opt => opt.value === current) ? current : '';
  pidComponentFilterCategory = select.value;
}

function renderPidComponentListItems() {
  const list = document.getElementById('pidComponentList');
  if (!list) return;

  list.innerHTML = '';
  if (!PID_COMPONENT_ORDER.length) {
    const empty = document.createElement('div');
    empty.className = 'component-picker-empty';
    empty.textContent = getPidComponentMeta(currentLang).catalogEmpty;
    list.appendChild(empty);
    updatePidComponentSelectionCount();
    return;
  }

  const query = pidComponentFilterQuery.trim().toLowerCase();

  for (const id of PID_COMPONENT_ORDER) {
    const labelText = getPidComponentModalLabel(id, currentLang);
    const category = getPidComponentCategory(id);
    const searchText = getPidComponentSearchText(id, currentLang).toLowerCase();
    const matchesQuery = !query || searchText.includes(query);
    const matchesCategory = !pidComponentFilterCategory || category === pidComponentFilterCategory;

    const label = document.createElement('label');
    label.className = 'component-picker-item';
    label.dataset.componentId = id;
    label.dataset.category = category;
    if (!matchesQuery || !matchesCategory) label.classList.add('is-hidden');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'pidComponentItem';
    input.value = id;
    input.checked = selectedPidComponents.includes(id);
    input.addEventListener('change', updatePidComponentSelectionCount);

    const idBadge = document.createElement('span');
    idBadge.className = 'matrix-id-badge';
    idBadge.textContent = id;

    const text = document.createElement('span');
    text.className = 'component-item-label';
    text.dataset.componentId = id;
    text.textContent = labelText;

    label.appendChild(input);
    label.appendChild(idBadge);
    label.appendChild(text);

    if (category) {
      const cat = document.createElement('span');
      cat.className = 'component-item-category';
      cat.textContent = category;
      label.appendChild(cat);
    }

    list.appendChild(label);
  }

  updatePidComponentSelectionCount();
}

function updatePidComponentSelectionCount() {
  const countEl = document.getElementById('pidComponentCount');
  if (!countEl) return;

  const meta = getPidComponentMeta(currentLang);
  const checked = document.querySelectorAll('input[name="pidComponentItem"]:checked').length;
  const total = PID_COMPONENT_ORDER.length;
  countEl.textContent = meta.selectedCount(checked, total);
}

function applyPidComponentListFilters() {
  const query = pidComponentFilterQuery.trim().toLowerCase();
  document.querySelectorAll('#pidComponentList .component-picker-item').forEach(item => {
    const id = item.dataset.componentId || '';
    const category = item.dataset.category || '';
    const searchText = getPidComponentSearchText(id, currentLang).toLowerCase();
    const matchesQuery = !query || searchText.includes(query);
    const matchesCategory = !pidComponentFilterCategory || category === pidComponentFilterCategory;
    item.classList.toggle('is-hidden', !(matchesQuery && matchesCategory));
  });
  updatePidComponentSelectionCount();
}

function initPidComponentModal() {
  buildPidComponentCategoryFilterOptions();
  renderPidComponentListItems();

  const search = document.getElementById('pidComponentSearch');
  const categoryFilter = document.getElementById('pidComponentCategoryFilter');

  search?.addEventListener('input', () => {
    pidComponentFilterQuery = search.value;
    applyPidComponentListFilters();
  });

  categoryFilter?.addEventListener('change', () => {
    pidComponentFilterCategory = categoryFilter.value;
    applyPidComponentListFilters();
  });

  document.getElementById('pidComponentSelectVisible')?.addEventListener('click', () => {
    document.querySelectorAll('#pidComponentList .component-picker-item:not(.is-hidden) input[name="pidComponentItem"]')
      .forEach(input => { input.checked = true; });
    updatePidComponentSelectionCount();
  });

  document.getElementById('pidComponentClearAll')?.addEventListener('click', () => {
    document.querySelectorAll('input[name="pidComponentItem"]').forEach(input => { input.checked = false; });
    updatePidComponentSelectionCount();
  });

  document.getElementById('pidComponentCancel')?.addEventListener('click', closePidComponentModal);
  document.getElementById('pidComponentConfirm')?.addEventListener('click', confirmPidComponent);
  document.getElementById('pidComponentModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'pidComponentModal') closePidComponentModal();
  });
}

function updatePidComponentModalText() {
  const meta = getPidComponentMeta(currentLang);
  const title = document.getElementById('pidComponentModalTitle');
  const desc = document.getElementById('pidComponentModalDesc');
  const confirm = document.getElementById('pidComponentConfirm');
  const cancel = document.getElementById('pidComponentCancel');
  const search = document.getElementById('pidComponentSearch');
  const selectVisible = document.getElementById('pidComponentSelectVisible');
  const clearAll = document.getElementById('pidComponentClearAll');

  if (title) title.textContent = meta.modalTitle;
  if (desc) desc.textContent = meta.modalDesc;
  if (confirm) confirm.textContent = meta.modalConfirm;
  if (cancel) cancel.textContent = meta.modalCancel;
  if (search) search.placeholder = meta.searchPlaceholder;
  if (selectVisible) selectVisible.textContent = meta.selectVisible;
  if (clearAll) clearAll.textContent = meta.clearAll;

  buildPidComponentCategoryFilterOptions();
  document.querySelectorAll('.component-item-label').forEach(el => {
    const id = el.dataset.componentId;
    if (id) el.textContent = getPidComponentModalLabel(id, currentLang);
  });
  updatePidComponentSelectionCount();
}

async function openPidComponentModal() {
  const modal = document.getElementById('pidComponentModal');
  if (!modal) return;

  const result = await window.PidxHost.readKodCatalog();
  if (result?.ok) {
    const prevOrder = PID_COMPONENT_ORDER.join('|');
    setPidComponentCatalog(result.entries);
    if (PID_COMPONENT_ORDER.join('|') !== prevOrder) {
      loadPidComponentSelection();
      renderPidComponentListItems();
    }
  }

  updatePidComponentModalText();
  modal.querySelectorAll('input[name="pidComponentItem"]').forEach(input => {
    input.checked = selectedPidComponents.includes(input.value);
  });
  updatePidComponentSelectionCount();

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('pidComponentSearch')?.focus();
}

function closePidComponentModal() {
  const modal = document.getElementById('pidComponentModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function confirmPidComponent() {
  const checked = [...document.querySelectorAll('input[name="pidComponentItem"]:checked')]
    .map(el => el.value);
  selectedPidComponents = PID_COMPONENT_ORDER.filter(id => checked.includes(id));
  savePidComponentSelection();
  closePidComponentModal();
  void renderDocument();
  showToast(getPidComponentMeta(currentLang).modalSaved, 'success');
}

function pidDrawingsStorageKey() {
  return `pid-drawings:${currentModel}`;
}

function loadPidDrawingsSelection() {
  try {
    const raw = localStorage.getItem(pidDrawingsStorageKey());
    selectedDrawings = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(selectedDrawings)) selectedDrawings = [];
    selectedDrawings = selectedDrawings.filter(item => item && item.path);
  } catch {
    selectedDrawings = [];
  }
}

function savePidDrawingsSelection() {
  localStorage.setItem(pidDrawingsStorageKey(), JSON.stringify(selectedDrawings));
}

async function preloadDrawingSvgs() {
  if (!selectedDrawings.length) return;

  for (const item of selectedDrawings) {
    if (drawingSvgCache.has(item.path)) continue;
    const result = await window.PidxHost.readDrawingSvg(item.path);
    if (result.ok) drawingSvgCache.set(item.path, result.content);
  }

  for (const key of [...drawingSvgCache.keys()]) {
    if (!selectedDrawings.some(item => item.path === key)) {
      drawingSvgCache.delete(key);
    }
  }
}

function initPidDrawingsModal() {
  document.getElementById('pidDrawingsCancel')?.addEventListener('click', closePidDrawingsModal);
  document.getElementById('pidDrawingsConfirm')?.addEventListener('click', confirmPidDrawings);
  document.getElementById('pidDrawingsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'pidDrawingsModal') closePidDrawingsModal();
  });
}

function updatePidDrawingsModalText() {
  const meta = getPidDrawingsMeta(currentLang);
  const title = document.getElementById('pidDrawingsModalTitle');
  const desc = document.getElementById('pidDrawingsModalDesc');
  const confirm = document.getElementById('pidDrawingsConfirm');
  const cancel = document.getElementById('pidDrawingsCancel');
  const familiesTitle = document.getElementById('drawingsFamiliesTitle');
  const foldersTitle = document.getElementById('drawingsFoldersTitle');
  const filesTitle = document.getElementById('drawingsFilesTitle');
  const selectedTitle = document.getElementById('drawingsSelectedTitle');

  if (title) title.textContent = meta.modalTitle;
  if (desc) desc.textContent = meta.modalDesc;
  if (confirm) confirm.textContent = meta.modalConfirm;
  if (cancel) cancel.textContent = meta.modalCancel;
  if (familiesTitle) familiesTitle.textContent = meta.familiesTitle;
  if (foldersTitle) foldersTitle.textContent = meta.foldersTitle;
  if (filesTitle) filesTitle.textContent = meta.filesTitle;
  if (selectedTitle) selectedTitle.textContent = meta.selectedTitle;
}

async function resolveInitialDrawingsPath() {
  const modelPath = modelToDrawingsSubpath(currentModel);
  if (modelPath) {
    const modelRes = await window.PidxHost.drawingsExists(modelPath);
    if (modelRes.ok && modelRes.exists) return modelPath;

    const family = modelPath.split('/')[0];
    const familyRes = await window.PidxHost.drawingsExists(family);
    if (familyRes.ok && familyRes.exists) return family;
  }

  return '';
}

function joinDrawingsPath(base, segment) {
  const cleanBase = String(base || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const cleanSegment = String(segment || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!cleanBase) return cleanSegment;
  if (!cleanSegment) return cleanBase;
  return `${cleanBase}/${cleanSegment}`;
}

function isDrawingSelected(path) {
  return drawingsPendingSelection.some(item => item.path === path);
}

function toggleDrawingSelection(path, name) {
  const index = drawingsPendingSelection.findIndex(item => item.path === path);
  if (index >= 0) {
    drawingsPendingSelection.splice(index, 1);
  } else {
    drawingsPendingSelection.push({ path, name });
  }
  renderDrawingsSelected();
  document.querySelectorAll('.drawings-file-card').forEach(card => {
    card.classList.toggle('selected', isDrawingSelected(card.dataset.path));
  });
}

function renderDrawingsBreadcrumb() {
  const nav = document.getElementById('drawingsBreadcrumb');
  if (!nav) return;

  const meta = getPidDrawingsMeta(currentLang);
  nav.innerHTML = '';

  const rootBtn = document.createElement('button');
  rootBtn.type = 'button';
  rootBtn.className = 'drawings-crumb';
  rootBtn.textContent = meta.rootLabel;
  rootBtn.addEventListener('click', () => void navigateDrawingsPath(''));
  nav.appendChild(rootBtn);

  const parts = drawingsBrowsePath.split('/').filter(Boolean);
  let cumulative = '';

  for (const part of parts) {
    const sep = document.createElement('span');
    sep.className = 'drawings-crumb-sep';
    sep.textContent = '/';
    nav.appendChild(sep);

    cumulative = joinDrawingsPath(cumulative, part);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'drawings-crumb';
    btn.textContent = part;
    const target = cumulative;
    btn.addEventListener('click', () => void navigateDrawingsPath(target));
    nav.appendChild(btn);
  }
}

function renderDrawingsSelected() {
  const wrap = document.getElementById('drawingsSelected');
  if (!wrap) return;

  wrap.innerHTML = '';
  for (const item of drawingsPendingSelection) {
    const chip = document.createElement('span');
    chip.className = 'drawings-chip';

    const label = document.createElement('span');
    label.textContent = item.name;
    chip.appendChild(label);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'drawings-chip-remove';
    remove.textContent = '×';
    remove.title = item.path;
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDrawingSelection(item.path, item.name);
    });
    chip.appendChild(remove);

    wrap.appendChild(chip);
  }
}

async function renderDrawingsFamilies() {
  const list = document.getElementById('drawingsFamilies');
  if (!list) return;

  const result = await window.PidxHost.listDrawings('');
  list.innerHTML = '';

  if (!result.ok) return;

  for (const folder of result.folders) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'drawings-family-btn';
    btn.innerHTML = `<span class="drawings-family-icon">📁</span><span>${folder}</span>`;
    btn.classList.toggle('active', drawingsBrowsePath === folder || drawingsBrowsePath.startsWith(`${folder}/`));
    btn.addEventListener('click', () => void navigateDrawingsPath(folder));
    list.appendChild(btn);
  }
}

async function loadDrawingPreview(relativePath) {
  if (drawingPreviewCache.has(relativePath)) {
    return drawingPreviewCache.get(relativePath);
  }
  const result = await window.PidxHost.readDrawingSvg(relativePath);
  if (!result.ok) return null;

  drawingPreviewCache.set(relativePath, result.content);
  return result.content;
}

async function renderDrawingsFoldersAndFiles() {
  const foldersEl = document.getElementById('drawingsFolders');
  const filesEl = document.getElementById('drawingsFiles');
  const meta = getPidDrawingsMeta(currentLang);

  if (!foldersEl || !filesEl) return;

  foldersEl.innerHTML = '';
  filesEl.innerHTML = '';

  const result = await window.PidxHost.listDrawings(drawingsBrowsePath);
  if (!result.ok) {
    foldersEl.innerHTML = `<div class="drawings-empty">${meta.modalEmpty}</div>`;
    filesEl.innerHTML = `<div class="drawings-empty">${meta.modalEmpty}</div>`;
    return;
  }

  if (!result.folders.length) {
    foldersEl.innerHTML = `<div class="drawings-empty">—</div>`;
  } else {
    for (const folder of result.folders) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'drawings-folder-btn';
      btn.innerHTML = `<span class="drawings-folder-icon">📁</span><span>${folder}</span>`;
      btn.addEventListener('click', () => {
        void navigateDrawingsPath(joinDrawingsPath(drawingsBrowsePath, folder));
      });
      foldersEl.appendChild(btn);
    }
  }

  if (!result.files.length) {
    filesEl.innerHTML = `<div class="drawings-empty">${meta.noFiles}</div>`;
    return;
  }

  for (const file of result.files) {
    const fullPath = joinDrawingsPath(drawingsBrowsePath, file);
    const name = file.replace(/\.svg$/i, '');

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'drawings-file-card';
    card.dataset.path = fullPath;
    card.classList.toggle('selected', isDrawingSelected(fullPath));

    const check = document.createElement('span');
    check.className = 'drawings-file-check';
    check.textContent = '✓';
    card.appendChild(check);

    const preview = document.createElement('div');
    preview.className = 'drawings-file-preview';
    preview.innerHTML = '<span style="font-size:11px;color:#8892a4">…</span>';
    card.appendChild(preview);

    const fileName = document.createElement('div');
    fileName.className = 'drawings-file-name';
    fileName.textContent = name;
    card.appendChild(fileName);

    card.addEventListener('click', () => toggleDrawingSelection(fullPath, name));
    filesEl.appendChild(card);

    void loadDrawingPreview(fullPath).then((svg) => {
      if (!svg || !preview.isConnected) return;
      preview.innerHTML = normalizeDrawingSvg(svg);
    });
  }
}

async function navigateDrawingsPath(path) {
  drawingsBrowsePath = String(path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  renderDrawingsBreadcrumb();
  await renderDrawingsFamilies();
  await renderDrawingsFoldersAndFiles();
}

async function openPidDrawingsModal() {
  const modal = document.getElementById('pidDrawingsModal');
  if (!modal) return;

  updatePidDrawingsModalText();
  drawingsPendingSelection = selectedDrawings.map(item => ({ ...item }));

  const initialPath = await resolveInitialDrawingsPath();
  await navigateDrawingsPath(initialPath);
  renderDrawingsSelected();

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closePidDrawingsModal() {
  const modal = document.getElementById('pidDrawingsModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

async function confirmPidDrawings() {
  selectedDrawings = drawingsPendingSelection.map(item => ({ ...item }));
  savePidDrawingsSelection();
  drawingSvgCache.clear();
  closePidDrawingsModal();
  await renderDocument();
  showToast(getPidDrawingsMeta(currentLang).modalSaved, 'success');
}

function initExportModal() {
  const list = document.getElementById('exportLangList');
  if (!list) return;

  list.innerHTML = '';
  for (const lang of EXPORT_LANGS) {
    const label = document.createElement('label');
    label.className = 'modal-lang-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'exportLang';
    input.value = lang.code;

    const flag = document.createElement('img');
    flag.src = lang.flag;
    flag.alt = lang.code.toUpperCase();
    flag.className = 'flag-icon';

    const text = document.createElement('span');
    text.textContent = lang.label;

    label.appendChild(input);
    label.appendChild(flag);
    label.appendChild(text);
    list.appendChild(label);
  }

  document.getElementById('exportCancel')?.addEventListener('click', closeExportModal);
  document.getElementById('exportConfirm')?.addEventListener('click', confirmExport);
  document.getElementById('exportModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'exportModal') closeExportModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeExportModal();
      closeSafetyMatrixModal();
      closeProcessOverviewModal();
      closePidComponentModal();
      closePidDrawingsModal();
    }
  });
}

function updateExportModalText() {
  const strings = t();
  const title = document.getElementById('exportModalTitle');
  const desc = document.getElementById('exportModalDesc');
  const confirm = document.getElementById('exportConfirm');
  const cancel = document.getElementById('exportCancel');
  const fileLabel = document.getElementById('exportFileNameLabel');
  const fileInput = document.getElementById('exportFileName');

  if (title) {
    title.textContent = exportModalType === 'html'
      ? strings.exportModalTitleHtml
      : strings.exportModalTitlePdf;
  }
  if (desc) desc.textContent = strings.exportModalDesc;
  if (confirm) {
    confirm.textContent = exportModalType === 'html'
      ? strings.exportModalConfirmHtml
      : strings.exportModalConfirmPdf;
  }
  if (cancel) cancel.textContent = strings.exportModalCancel;
  if (fileLabel) fileLabel.textContent = strings.exportFileNameLabel;
  if (fileInput) fileInput.placeholder = strings.exportFileNamePlaceholder;
}

function openExportModal(type) {
  const modal = document.getElementById('exportModal');
  if (!modal) return;

  exportModalType = type === 'html' ? 'html' : 'pdf';
  updateExportModalText();

  modal.querySelectorAll('input[name="exportLang"]').forEach(input => {
    input.checked = input.value === currentLang;
  });

  const fileInput = document.getElementById('exportFileName');
  if (fileInput) fileInput.value = defaultExportFileNameInput();

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  fileInput?.focus();
  fileInput?.select();
}

function closeExportModal() {
  const modal = document.getElementById('exportModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function getSelectedExportLangs() {
  const checked = [...document.querySelectorAll('input[name="exportLang"]:checked')];
  const order = EXPORT_LANGS.map(l => l.code);
  return checked
    .map(el => el.value)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function getExportFileName() {
  const input = document.getElementById('exportFileName');
  return buildExportFileName(input?.value);
}

async function confirmExport() {
  const langs = getSelectedExportLangs();
  if (!langs.length) {
    showToast(t().exportModalNoLang, 'error');
    return;
  }

  const fileName = getExportFileName();
  const type = exportModalType;
  closeExportModal();

  if (type === 'html') {
    await exportHtml(langs, fileName);
  } else {
    await exportPDF(langs, fileName);
  }
}

function setViewMode(mode) {
  if (mode !== 'html' && mode !== 'pdf') return;
  if (viewMode === mode) return;

  viewMode = mode;
  document.body.classList.toggle('view-html', mode === 'html');
  document.body.classList.toggle('view-pdf', mode === 'pdf');
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === mode);
  });
  void renderDocument();
}

function setLanguage(lang) {
  if (!PID_I18N[lang]) return;
  currentLang = lang;
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });
  updateSafetyMatrixModalText();
  updateProcessOverviewModalText();
  updatePidComponentModalText();
  updatePidDrawingsModalText();
  void renderDocument();
  showToast(t().langChanged(lang), 'success');
}

function buildLangDocumentContent(lang) {
  return [
    ...buildProcessOverviewSection(selectedProcessItems, lang),
    ...buildSafetyMatrixSection(selectedInterlocks, lang),
    ...buildPidComponentSection(selectedPidComponents, lang),
    ...buildColorCodingSection(lang)
  ];
}

function appendPdfLangBlock(container, lang) {
  container.appendChild(buildCoverPage({
    model: currentModel,
    rev: currentRev,
    date: currentDate,
    variant: currentFirma,
    lang
  }));

  const docContent = buildLangDocumentContent(lang);
  if (docContent.length) {
    for (const page of buildLetterheadPages({
      firma: currentFirma,
      modelName: currentModel,
      startPageNumber: 1,
      content: docContent
    })) {
      container.appendChild(page);
    }
  }

  for (const page of buildDrawingPages(selectedDrawings, drawingSvgCache)) {
    container.appendChild(page);
  }
}

function renderPdfDocument(container, langs) {
  container.innerHTML = '';
  container.className = 'pages-container';

  const langList = langs || [currentLang];
  for (const lang of langList) {
    appendPdfLangBlock(container, lang);
  }
}

function appendHtmlLangBlock(doc, lang) {
  const brand = HEADER_BRANDS[currentFirma] || HEADER_BRANDS.DOLFIN;

  const coverSection = document.createElement('div');
  coverSection.className = 'html-cover-section';
  const cover = buildCoverPage({
    model: currentModel,
    rev: currentRev,
    date: currentDate,
    variant: currentFirma,
    lang
  });
  cover.classList.add('html-inline-cover');
  coverSection.appendChild(cover);
  doc.appendChild(coverSection);

  const contentSection = document.createElement('div');
  contentSection.className = 'html-content-section';
  contentSection.style.setProperty('--brand-color', brand.color);
  contentSection.appendChild(buildHeader(currentFirma, currentModel));

  const mainContent = document.createElement('div');
  mainContent.className = 'html-flow-content';

  for (const node of buildLangDocumentContent(lang)) {
    mainContent.appendChild(node);
  }

  contentSection.appendChild(mainContent);
  doc.appendChild(contentSection);

  for (const section of buildHtmlDrawingSections(selectedDrawings, drawingSvgCache)) {
    doc.appendChild(section);
  }
}

function renderHtmlDocument(container, langs) {
  container.innerHTML = '';
  container.className = 'pages-container';

  const doc = document.createElement('div');
  doc.className = 'html-document html-unified';

  const langList = langs || [currentLang];
  for (const lang of langList) {
    appendHtmlLangBlock(doc, lang);
  }

  container.appendChild(doc);
}

async function renderDocument() {
  const container = document.getElementById('pagesContainer');
  if (!container) return;

  await preloadDrawingSvgs();

  if (viewMode === 'html') {
    renderHtmlDocument(container);
  } else {
    renderPdfDocument(container);
  }
}

async function exportPDF(langs, fileName) {
  const strings = t();
  const prevMode = viewMode;
  const exportLangs = langs && langs.length ? langs : [currentLang];
  const exportName = fileName || buildExportFileName(currentModel);

  if (prevMode === 'html') {
    setViewMode('pdf');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  const container = document.getElementById('pagesContainer');
  await preloadDrawingSvgs();
  renderPdfDocument(container, exportLangs);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  showToast(strings.pdfHint, 'success');
  const result = await window.PidxHost.printPdf({ fileName: exportName });

  await renderDocument();
  if (prevMode === 'html') setViewMode('html');

  if (result.error) showToast(result.error, 'error');
}

function buildExportHtmlBody() {
  const doc = document.querySelector('.html-document.html-unified');
  return doc ? doc.outerHTML : null;
}

async function exportHtml(langs, fileName) {
  const strings = t();
  const prevMode = viewMode;
  const exportLangs = langs && langs.length ? langs : [currentLang];
  const exportName = fileName || buildExportFileName(currentModel);

  if (prevMode === 'pdf') {
    setViewMode('html');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  const container = document.getElementById('pagesContainer');
  await preloadDrawingSvgs();
  renderHtmlDocument(container, exportLangs);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const bodyHtml = buildExportHtmlBody();
  if (!bodyHtml) {
    showToast(strings.htmlNotFound, 'error');
    await renderDocument();
    if (prevMode === 'pdf') setViewMode('pdf');
    return;
  }

  showToast(strings.htmlBuilding, 'success');
  const result = await window.PidxHost.exportHtml({
    model: currentModel,
    bodyHtml,
    title: strings.exportTitle(currentModel),
    lang: exportLangs[0],
    fileName: exportName
  });

  await renderDocument();
  if (prevMode === 'pdf') setViewMode('pdf');

  if (result.success) {
    showToast(strings.htmlSaved, 'success');
  } else if (result.error) {
    showToast(`${strings.htmlFailed}: ${result.error}`, 'error');
  } else if (result.success === false) {
    showToast(strings.htmlCancelled, 'error');
  } else {
    showToast(strings.htmlFailed, 'error');
  }
}

function showToast(msg, type) {
  document.querySelectorAll('.toast').forEach(el => el.remove());
  const toast = document.createElement('div');
  toast.className = 'toast ' + (type || 'success');
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadPidComponentCatalog(), loadSafetyMatrixCatalog()]);
  bindControls();
  void renderDocument();
});
