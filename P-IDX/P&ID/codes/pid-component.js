/* P&ID Component — katalog data/kod.csv, seçim renderer.js'te */

let PID_COMPONENT_ORDER = [];
const PID_COMPONENT_ROWS = {};
const PID_COMPONENT_CATEGORIES = new Set();

const PID_COMPONENT_META = {
  tr: {
    sectionTitle: '3. P&ID Bileşen Tanımları (Component Legend)',
    intro: 'Bu bölüm, P&ID diyagramında kullanılan ana proses ekipmanlarının etiket kodlarını, işlevsel adlarını ve kısa teknik açıklamalarını listeler.',
    columns: {
      componentId: 'Bileşen ID',
      componentName: 'Bileşen Adı',
      description: 'Açıklama'
    },
    modalTitle: 'P&ID Component',
    modalDesc: 'Dokümana dahil edilecek P&ID bileşen satırlarını seçin. Katalog: data/kod.csv, kod-en.csv, kod-de.csv',
    modalConfirm: 'Uygula',
    modalCancel: 'İptal',
    modalSaved: 'P&ID Component güncellendi',
    searchPlaceholder: 'Kod veya açıklama ara…',
    categoryAll: 'Tüm kategoriler',
    selectVisible: 'Görünenleri seç',
    clearAll: 'Temizle',
    selectedCount: (selected, total) => `${selected} / ${total} seçili`,
    catalogEmpty: 'Katalog yüklenemedi',
    catalogReloaded: 'Katalog güncellendi',
    continuedSuffix: ' (devam)'
  },
  en: {
    sectionTitle: '3. P&ID Component Definitions (Component Legend)',
    intro: 'This section lists the tag codes, functional names and brief technical descriptions of the main process equipment used on the P&ID diagram.',
    columns: {
      componentId: 'Component ID',
      componentName: 'Component Name',
      description: 'Description'
    },
    modalTitle: 'P&ID Component',
    modalDesc: 'Select the P&ID component rows to include in the document. Catalog: data/kod.csv, kod-en.csv, kod-de.csv',
    modalConfirm: 'Apply',
    modalCancel: 'Cancel',
    modalSaved: 'P&ID Component updated',
    searchPlaceholder: 'Search code or description…',
    categoryAll: 'All categories',
    selectVisible: 'Select visible',
    clearAll: 'Clear',
    selectedCount: (selected, total) => `${selected} / ${total} selected`,
    catalogEmpty: 'Could not load catalog',
    catalogReloaded: 'Catalog updated',
    continuedSuffix: ' (continued)'
  },
  de: {
    sectionTitle: '3. P&ID-Komponentendefinitionen (Component Legend)',
    intro: 'Dieser Abschnitt listet die Kennzeichnungscodes, funktionalen Bezeichnungen und kurzen technischen Beschreibungen der Hauptprozessausrüstung im P&ID-Diagramm auf.',
    columns: {
      componentId: 'Komponenten-ID',
      componentName: 'Komponentenname',
      description: 'Beschreibung'
    },
    modalTitle: 'P&ID Component',
    modalDesc: 'Wählen Sie die P&ID-Komponentenzeilen für das Dokument. Katalog: data/kod.csv, kod-en.csv, kod-de.csv',
    modalConfirm: 'Anwenden',
    modalCancel: 'Abbrechen',
    modalSaved: 'P&ID Component aktualisiert',
    searchPlaceholder: 'Code oder Beschreibung suchen…',
    categoryAll: 'Alle Kategorien',
    selectVisible: 'Sichtbare auswählen',
    clearAll: 'Leeren',
    selectedCount: (selected, total) => `${selected} / ${total} ausgewählt`,
    catalogEmpty: 'Katalog konnte nicht geladen werden',
    catalogReloaded: 'Katalog aktualisiert',
    continuedSuffix: ' (Fortsetzung)'
  }
};

const PID_COMPONENT_COLS = [
  { key: 'componentId', className: 'col-id', width: '13.75%' },
  { key: 'componentName', className: 'col-trigger', width: '13.75%' },
  { key: 'description', className: 'col-logic', width: '72.5%' }
];

function setPidComponentCatalog(entries) {
  PID_COMPONENT_ORDER = [];
  PID_COMPONENT_CATEGORIES.clear();
  for (const key of Object.keys(PID_COMPONENT_ROWS)) {
    delete PID_COMPONENT_ROWS[key];
  }

  for (const entry of entries || []) {
    if (!entry?.id) continue;
    PID_COMPONENT_ORDER.push(entry.id);
    PID_COMPONENT_ROWS[entry.id] = {
      category: entry.category || '',
      tr: entry.tr,
      en: entry.en,
      de: entry.de
    };
    if (entry.category) PID_COMPONENT_CATEGORIES.add(entry.category);
  }
}

function getPidComponentCategories() {
  return [...PID_COMPONENT_CATEGORIES].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

function getPidComponentMeta(lang) {
  return PID_COMPONENT_META[lang] || PID_COMPONENT_META.en;
}

function getPidComponentCategory(id) {
  return PID_COMPONENT_ROWS[id]?.category || '';
}

function getPidComponentModalLabel(id, lang) {
  const row = PID_COMPONENT_ROWS[id];
  if (!row) return id;
  const loc = row[lang] || row.en || row.tr;
  return loc?.componentName || id;
}

function getPidComponentSearchText(id, lang) {
  const row = PID_COMPONENT_ROWS[id];
  if (!row) return id;
  const loc = row[lang] || row.en || row.tr;
  const category = getPidComponentCategory(id);
  return `${id} ${loc?.componentName || ''} ${loc?.description || ''} ${category}`.trim();
}

function buildPidComponentTable(selectedIds, lang) {
  const meta = getPidComponentMeta(lang);
  const table = document.createElement('table');
  table.className = 'doc-table pid-component-table';

  const colgroup = document.createElement('colgroup');
  for (const col of PID_COMPONENT_COLS) {
    const colEl = document.createElement('col');
    colEl.className = col.className;
    colEl.style.width = col.width;
    colgroup.appendChild(colEl);
  }
  table.appendChild(colgroup);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of PID_COMPONENT_COLS) {
    const th = document.createElement('th');
    th.className = col.className;
    th.textContent = meta.columns[col.key];
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const id of PID_COMPONENT_ORDER) {
    if (!selectedIds.includes(id)) continue;
    const rowData = PID_COMPONENT_ROWS[id]?.[lang] || PID_COMPONENT_ROWS[id]?.en || PID_COMPONENT_ROWS[id]?.tr;
    if (!rowData) continue;

    const tr = document.createElement('tr');
    for (const col of PID_COMPONENT_COLS) {
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

function buildPidComponentSection(selectedIds, lang) {
  if (!selectedIds || !selectedIds.length) return [];

  const meta = getPidComponentMeta(lang);
  const section = document.createElement('div');
  section.className = 'doc-block-stack pid-component-section';
  section.dataset.continuedSuffix = meta.continuedSuffix;

  const heading = document.createElement('h2');
  heading.className = 'doc-h2';
  heading.textContent = meta.sectionTitle;
  section.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'doc-p';
  intro.textContent = meta.intro;
  section.appendChild(intro);

  section.appendChild(buildPidComponentTable(selectedIds, lang));
  return [section];
}
