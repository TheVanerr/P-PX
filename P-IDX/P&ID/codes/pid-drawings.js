/* P&ID Drawings — SVG sayfaları (antetsiz) */

const PID_DRAWINGS_META = {
  tr: {
    modalTitle: 'P&ID Drawings',
    modalDesc: 'Drawings klasöründen SVG dosyalarını seçin. Seçilen çizimler dokümanın sonuna antetsiz sayfa olarak eklenir.',
    modalConfirm: 'Uygula',
    modalCancel: 'İptal',
    modalSaved: 'P&ID Drawings güncellendi',
    modalEmpty: 'Drawings klasörü boş veya erişilemiyor',
    familiesTitle: 'Seriler',
    foldersTitle: 'Klasörler',
    filesTitle: 'SVG Dosyaları',
    selectedTitle: 'Seçilen çizimler',
    noFiles: 'Bu klasörde SVG dosyası yok',
    rootLabel: 'drawings'
  },
  en: {
    modalTitle: 'P&ID Drawings',
    modalDesc: 'Select SVG files from the drawings folder. Selected drawings are appended at the end of the document as pages without letterhead.',
    modalConfirm: 'Apply',
    modalCancel: 'Cancel',
    modalSaved: 'P&ID Drawings updated',
    modalEmpty: 'Drawings folder is empty or unavailable',
    familiesTitle: 'Series',
    foldersTitle: 'Folders',
    filesTitle: 'SVG Files',
    selectedTitle: 'Selected drawings',
    noFiles: 'No SVG files in this folder',
    rootLabel: 'drawings'
  },
  de: {
    modalTitle: 'P&ID Drawings',
    modalDesc: 'Wählen Sie SVG-Dateien aus dem Drawings-Ordner. Ausgewählte Zeichnungen werden am Dokumentende ohne Briefkopf eingefügt.',
    modalConfirm: 'Anwenden',
    modalCancel: 'Abbrechen',
    modalSaved: 'P&ID Drawings aktualisiert',
    modalEmpty: 'Drawings-Ordner ist leer oder nicht verfügbar',
    familiesTitle: 'Serien',
    foldersTitle: 'Ordner',
    filesTitle: 'SVG-Dateien',
    selectedTitle: 'Ausgewählte Zeichnungen',
    noFiles: 'Keine SVG-Dateien in diesem Ordner',
    rootLabel: 'drawings'
  }
};

function getPidDrawingsMeta(lang) {
  return PID_DRAWINGS_META[lang] || PID_DRAWINGS_META.en;
}

function modelToDrawingsSubpath(model) {
  if (!model) return '';
  const slug = model.trim().toLowerCase().replace(/\s+/g, '-');
  const family = slug.split('-')[0];
  return `${family}/${slug}`;
}

function normalizeDrawingSvg(svgContent) {
  const wrap = document.createElement('div');
  wrap.innerHTML = String(svgContent || '').trim();
  const svg = wrap.querySelector('svg');
  if (!svg) return wrap.innerHTML;

  svg.classList.add('drawing-svg');
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  if (!svg.getAttribute('preserveAspectRatio')) {
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }
  return svg.outerHTML;
}

function buildDrawingPage(svgContent) {
  const page = document.createElement('div');
  page.className = 'a4-page drawing-page';

  const inner = document.createElement('div');
  inner.className = 'drawing-page-inner';
  inner.innerHTML = normalizeDrawingSvg(svgContent);
  page.appendChild(inner);

  return page;
}

function buildHtmlDrawingSection(svgContent) {
  const section = document.createElement('div');
  section.className = 'html-drawing-section';

  const page = document.createElement('div');
  page.className = 'drawing-page-inner';
  page.innerHTML = normalizeDrawingSvg(svgContent);
  section.appendChild(page);

  return section;
}

function buildDrawingPages(selectedDrawings, svgCache) {
  const pages = [];
  for (const item of selectedDrawings || []) {
    const svg = svgCache.get(item.path);
    if (svg) pages.push(buildDrawingPage(svg));
  }
  return pages;
}

function buildHtmlDrawingSections(selectedDrawings, svgCache) {
  const sections = [];
  for (const item of selectedDrawings || []) {
    const svg = svgCache.get(item.path);
    if (svg) sections.push(buildHtmlDrawingSection(svg));
  }
  return sections;
}
