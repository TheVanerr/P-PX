/* Process Overview — statik tanımlar, proje bazlı seçim renderer.js'te */

const PROCESS_OVERVIEW_ORDER = ['PO-1', 'PO-2', 'PO-3'];

const PROCESS_OVERVIEW_META = {
  tr: {
    sectionTitle: '1. Proses Özeti (Process Overview)',
    intro: 'Bu bölüm, P&ID diyagramlarında gösterilen ana proses hatlarının ve yardımcı sistemlerin işlevsel özetini sunar. Her satır, ilgili P&ID sayfası ve ekipman grubu ile eşleştirilmiştir.',
    columns: {
      processId: 'Proses ID',
      system: 'Sistem / Bölge',
      equipment: 'Ana Ekipman',
      description: 'Proses Açıklaması'
    },
    modalTitle: 'Process Overview',
    modalDesc: 'Dokümana dahil edilecek proses özet satırlarını seçin.',
    modalConfirm: 'Uygula',
    modalCancel: 'İptal',
    modalSaved: 'Process Overview güncellendi'
  },
  en: {
    sectionTitle: '1. Process Overview (System Summary)',
    intro: 'This section provides a functional summary of the main process lines and auxiliary systems shown on the P&ID diagrams. Each row is mapped to the corresponding P&ID sheet and equipment group.',
    columns: {
      processId: 'Process ID',
      system: 'System / Area',
      equipment: 'Key Equipment',
      description: 'Process Description'
    },
    modalTitle: 'Process Overview',
    modalDesc: 'Select the process overview rows to include in the document.',
    modalConfirm: 'Apply',
    modalCancel: 'Cancel',
    modalSaved: 'Process Overview updated'
  },
  de: {
    sectionTitle: '1. Prozessübersicht (Systemzusammenfassung)',
    intro: 'Dieser Abschnitt bietet eine funktionelle Zusammenfassung der Hauptprozesslinien und Hilfssysteme, die in den P&ID-Diagrammen dargestellt sind. Jede Zeile ist dem entsprechenden P&ID-Blatt und der Anlagengruppe zugeordnet.',
    columns: {
      processId: 'Prozess-ID',
      system: 'System / Bereich',
      equipment: 'Hauptanlage',
      description: 'Prozessbeschreibung'
    },
    modalTitle: 'Process Overview',
    modalDesc: 'Wählen Sie die Prozessübersicht-Zeilen für das Dokument.',
    modalConfirm: 'Anwenden',
    modalCancel: 'Abbrechen',
    modalSaved: 'Process Overview aktualisiert'
  }
};

const PROCESS_OVERVIEW_ROWS = {
  'PO-1': {
    tr: {
      processId: 'PO-1',
      system: 'Ana Proses Hattı',
      equipment: 'P&ID-001 — Genel Akış',
      description: 'Besleme, yıkama haznesi, sirkülasyon pompaları ve ana proses vanalarını kapsayan birincil akış hattının genel özeti.'
    },
    en: {
      processId: 'PO-1',
      system: 'Main Process Line',
      equipment: 'P&ID-001 — General Flow',
      description: 'General summary of the primary flow line covering feed, wash chamber, circulation pumps and main process valves.'
    },
    de: {
      processId: 'PO-1',
      system: 'Hauptprozessleitung',
      equipment: 'P&ID-001 — Allgemeiner Fluss',
      description: 'Allgemeine Übersicht der Hauptflussleitung einschließlich Zufuhr, Waschkammer, Umwälzpumpen und Hauptprozessventile.'
    }
  },
  'PO-2': {
    tr: {
      processId: 'PO-2',
      system: 'Soğutma Devresi',
      equipment: 'P&ID-002 — Chiller / Pompa Grubu',
      description: 'Proses sıvısının sıcaklık kontrolü için chiller, pompa grubu, eşanjör bağlantıları ve ilgili enstrümantasyon.'
    },
    en: {
      processId: 'PO-2',
      system: 'Cooling Circuit',
      equipment: 'P&ID-002 — Chiller / Pump Group',
      description: 'Chiller, pump group, heat exchanger connections and related instrumentation for process fluid temperature control.'
    },
    de: {
      processId: 'PO-2',
      system: 'Kühlkreis',
      equipment: 'P&ID-002 — Kühler / Pumpengruppe',
      description: 'Kühler, Pumpengruppe, Wärmetauscheranschlüsse und zugehörige Instrumentierung zur Temperaturregelung des Prozessmediums.'
    }
  },
  'PO-3': {
    tr: {
      processId: 'PO-3',
      system: 'Kontrol & Enstrümantasyon',
      equipment: 'P&ID-003 — Kontrol Paneli I/O',
      description: 'PLC, kontrol paneli bağlantıları, saha enstrümantasyonu ve I/O listesi referansına dayalı sinyal akışı özeti.'
    },
    en: {
      processId: 'PO-3',
      system: 'Control & Instrumentation',
      equipment: 'P&ID-003 — Control Panel I/O',
      description: 'Signal flow summary based on PLC, control panel connections, field instrumentation and I/O list reference.'
    },
    de: {
      processId: 'PO-3',
      system: 'Steuerung & Instrumentierung',
      equipment: 'P&ID-003 — Schaltschrank I/O',
      description: 'Signalflussübersicht basierend auf SPS, Schaltschrankverbindungen, Feldinstrumentierung und I/O-Listenreferenz.'
    }
  }
};

const PROCESS_OVERVIEW_COLS = [
  { key: 'processId', className: 'col-id', width: '13.75%' },
  { key: 'system', className: 'col-trigger', width: '13.75%' },
  { key: 'equipment', className: 'col-locked', width: '13.75%' },
  { key: 'description', className: 'col-logic', width: '58.75%' }
];

function getProcessOverviewMeta(lang) {
  return PROCESS_OVERVIEW_META[lang] || PROCESS_OVERVIEW_META.en;
}

function getProcessOverviewModalLabel(id, lang) {
  const row = PROCESS_OVERVIEW_ROWS[id];
  if (!row) return id;
  const loc = row[lang] || row.en;
  return loc.system;
}

function buildProcessOverviewTable(selectedIds, lang) {
  const meta = getProcessOverviewMeta(lang);
  const table = document.createElement('table');
  table.className = 'doc-table process-overview-table';

  const colgroup = document.createElement('colgroup');
  for (const col of PROCESS_OVERVIEW_COLS) {
    const colEl = document.createElement('col');
    colEl.className = col.className;
    colEl.style.width = col.width;
    colgroup.appendChild(colEl);
  }
  table.appendChild(colgroup);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const col of PROCESS_OVERVIEW_COLS) {
    const th = document.createElement('th');
    th.className = col.className;
    th.textContent = meta.columns[col.key];
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const id of PROCESS_OVERVIEW_ORDER) {
    if (!selectedIds.includes(id)) continue;
    const rowData = PROCESS_OVERVIEW_ROWS[id]?.[lang] || PROCESS_OVERVIEW_ROWS[id]?.en;
    if (!rowData) continue;

    const tr = document.createElement('tr');
    for (const col of PROCESS_OVERVIEW_COLS) {
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

function buildProcessOverviewSection(selectedIds, lang) {
  if (!selectedIds || !selectedIds.length) return [];

  const meta = getProcessOverviewMeta(lang);
  const section = document.createElement('div');
  section.className = 'doc-block-stack process-overview-section';

  const heading = document.createElement('h2');
  heading.className = 'doc-h2';
  heading.textContent = meta.sectionTitle;
  section.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'doc-p';
  intro.textContent = meta.intro;
  section.appendChild(intro);

  section.appendChild(buildProcessOverviewTable(selectedIds, lang));
  return [section];
}
