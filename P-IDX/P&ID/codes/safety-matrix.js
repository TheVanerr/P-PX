/* Safety Matrix — katalog data/guvenlik.csv, seçim renderer.js'te */

let SAFETY_MATRIX_ORDER = [];
const SAFETY_MATRIX_ROWS = {};
const SAFETY_MATRIX_CATEGORIES = new Set();

const SAFETY_MATRIX_META = {
  tr: {
    sectionTitle: '2. Güvenlik ve Interlock Mantığı (Otomasyon Matrisi)',
    intro: 'Makine ve operatör güvenliği, tehlikeli hareketleri donanım ve yazılım olarak durduran Interlock algoritmaları ile sağlanır. Bunlar P&ID üzerinde Elmas (♦) sembolü ile gösterilir.',
    columns: {
      interlockId: 'Interlock ID',
      triggerSensor: 'Tetik Sensörü',
      lockedEquipment: 'Kilitlenen Ekipman',
      logic: 'Güvenlik Senaryosu ve Otomasyon Mantığı'
    },
    modalTitle: 'Safety Matrix',
    modalDesc: 'Dokümana dahil edilecek interlock satırlarını seçin. Katalog: data/guvenlik.csv, safety.csv, safety-de.csv',
    modalConfirm: 'Uygula',
    modalCancel: 'İptal',
    modalSaved: 'Safety Matrix güncellendi',
    searchPlaceholder: 'Kod, sensör veya mantık ara…',
    categoryAll: 'Tüm kategoriler',
    selectVisible: 'Görünenleri seç',
    clearAll: 'Temizle',
    selectedCount: (selected, total) => `${selected} / ${total} seçili`,
    catalogEmpty: 'Güvenlik kataloğu yüklenemedi',
    continuedSuffix: ' (devam)'
  },
  en: {
    sectionTitle: '2. Safety and Interlock Logic (Automation Matrix)',
    intro: 'The safety of the machine and the operator is ensured by Interlock algorithms that hardware-wise and software-wise halt dangerous movements. These are indicated by the Diamond (♦) symbol on the P&ID.',
    columns: {
      interlockId: 'Interlock ID',
      triggerSensor: 'Trigger Sensor',
      lockedEquipment: 'Locked Equipment',
      logic: 'Safety Scenario and Automation Logic'
    },
    modalTitle: 'Safety Matrix',
    modalDesc: 'Select interlock rows to include in the document. Catalog: data/guvenlik.csv, safety.csv, safety-de.csv',
    modalConfirm: 'Apply',
    modalCancel: 'Cancel',
    modalSaved: 'Safety Matrix updated',
    searchPlaceholder: 'Search code, sensor or logic…',
    categoryAll: 'All categories',
    selectVisible: 'Select visible',
    clearAll: 'Clear',
    selectedCount: (selected, total) => `${selected} / ${total} selected`,
    catalogEmpty: 'Could not load safety catalog',
    continuedSuffix: ' (continued)'
  },
  de: {
    sectionTitle: '2. Sicherheits- und Verriegelungslogik (Automatisierungsmatrix)',
    intro: 'Die Sicherheit der Maschine und des Bedieners wird durch Interlock-Algorithmen gewährleistet, die gefährliche Bewegungen hardware- und softwareseitig stoppen. Diese sind auf dem P&ID durch das Diamant-Symbol (♦) gekennzeichnet.',
    columns: {
      interlockId: 'Interlock ID',
      triggerSensor: 'Auslösesensor',
      lockedEquipment: 'Gesperrte Anlage',
      logic: 'Sicherheitsszenario und Automatisierungslogik'
    },
    modalTitle: 'Safety Matrix',
    modalDesc: 'Interlock-Zeilen für das Dokument auswählen. Katalog: data/guvenlik.csv, safety.csv, safety-de.csv',
    modalConfirm: 'Anwenden',
    modalCancel: 'Abbrechen',
    modalSaved: 'Safety Matrix aktualisiert',
    searchPlaceholder: 'Code, Sensor oder Logik suchen…',
    categoryAll: 'Alle Kategorien',
    selectVisible: 'Sichtbare auswählen',
    clearAll: 'Leeren',
    selectedCount: (selected, total) => `${selected} / ${total} ausgewählt`,
    catalogEmpty: 'Sicherheitskatalog konnte nicht geladen werden',
    continuedSuffix: ' (Fortsetzung)'
  }
};

const SAFETY_MATRIX_COLS = [
  { key: 'interlockId', className: 'col-id', width: '13.75%' },
  { key: 'triggerSensor', className: 'col-trigger', width: '13.75%' },
  { key: 'lockedEquipment', className: 'col-locked', width: '13.75%' },
  { key: 'logic', className: 'col-logic', width: '58.75%' }
];

function setSafetyMatrixCatalog(entries) {
  SAFETY_MATRIX_ORDER = [];
  SAFETY_MATRIX_CATEGORIES.clear();
  for (const key of Object.keys(SAFETY_MATRIX_ROWS)) {
    delete SAFETY_MATRIX_ROWS[key];
  }

  for (const entry of entries || []) {
    if (!entry?.id) continue;
    SAFETY_MATRIX_ORDER.push(entry.id);
    SAFETY_MATRIX_ROWS[entry.id] = {
      category: entry.category || '',
      tr: entry.tr,
      en: entry.en,
      de: entry.de
    };
    if (entry.category) SAFETY_MATRIX_CATEGORIES.add(entry.category);
  }
}

function getSafetyMatrixCategories() {
  return [...SAFETY_MATRIX_CATEGORIES].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function getSafetyMatrixMeta(lang) {
  return SAFETY_MATRIX_META[lang] || SAFETY_MATRIX_META.en;
}

function getSafetyMatrixCategory(id) {
  return SAFETY_MATRIX_ROWS[id]?.category || '';
}

function getSafetyMatrixModalLabel(id, lang) {
  const row = SAFETY_MATRIX_ROWS[id];
  if (!row) return id;
  const loc = row[lang] || row.en || row.tr;
  return loc?.triggerSensor || id;
}

function getSafetyMatrixSearchText(id, lang) {
  const row = SAFETY_MATRIX_ROWS[id];
  if (!row) return id;
  const loc = row[lang] || row.en || row.tr;
  const category = getSafetyMatrixCategory(id);
  return `${id} ${loc?.triggerSensor || ''} ${loc?.lockedEquipment || ''} ${loc?.logic || ''} ${category}`.trim();
}

function buildSafetyMatrixTable(selectedIds, lang) {
  const meta = getSafetyMatrixMeta(lang);
  const table = document.createElement('table');
  table.className = 'doc-table safety-matrix-table';

  const colgroup = document.createElement('colgroup');
  for (const col of SAFETY_MATRIX_COLS) {
    const colEl = document.createElement('col');
    colEl.className = col.className;
    colEl.style.width = col.width;
    colgroup.appendChild(colEl);
  }
  table.appendChild(colgroup);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of SAFETY_MATRIX_COLS) {
    const th = document.createElement('th');
    th.className = col.className;
    th.textContent = meta.columns[col.key];
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const id of SAFETY_MATRIX_ORDER) {
    if (!selectedIds.includes(id)) continue;
    const rowData = SAFETY_MATRIX_ROWS[id]?.[lang] || SAFETY_MATRIX_ROWS[id]?.en || SAFETY_MATRIX_ROWS[id]?.tr;
    if (!rowData) continue;

    const tr = document.createElement('tr');
    for (const col of SAFETY_MATRIX_COLS) {
      const td = document.createElement('td');
      td.className = col.className;
      td.textContent = rowData[col.key];
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function buildSafetyMatrixSection(selectedIds, lang) {
  if (!selectedIds || !selectedIds.length) return [];

  const meta = getSafetyMatrixMeta(lang);
  const section = document.createElement('div');
  section.className = 'doc-block-stack safety-matrix-section';
  section.dataset.continuedSuffix = meta.continuedSuffix;

  const heading = document.createElement('h2');
  heading.className = 'doc-h2';
  heading.textContent = meta.sectionTitle;
  section.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'doc-p';
  intro.textContent = meta.intro;
  section.appendChild(intro);

  section.appendChild(buildSafetyMatrixTable(selectedIds, lang));
  return [section];
}
