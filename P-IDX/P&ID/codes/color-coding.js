/* P&ID Color Coding — sabit bölüm 4 */

const COLOR_CODING_META = {
  tr: {
    sectionTitle: '4. P&ID Renk Kodlaması (Color Coding)',
    intro: 'Tasarımın modüler yapısını vurgulamak amacıyla diyagramda aşağıdaki renk kodlaması uygulanır:',
    blackLabel: '⚫ Siyah Sembol ve Hatlar (Standart Ekipman):',
    blackText: 'Makinenin temel altyapısını temsil eder. Her üretim modelinde bulunan temel proses hatları, standart vanalar, tanklar ve birincil motor gruplarıdır.',
    redLabel: '🔴 Kırmızı Sembol ve Hatlar (Opsiyonel / Müşteriye Özel Donanım):',
    redText: 'Müşteri taleplerine veya gelişmiş güvenlik gereksinimlerine göre özel olarak entegre edilen bileşenleri gösterir. (örn. PE05 Tahliye Pompası, FE02 Kurutma Fanı vb.)',
    productionNote: 'Üretim Notu: Kırmızı kodlu modüller, her proje siparişine ait Malzeme Listesi (BOM) ile doğrulanmalıdır.'
  },
  en: {
    sectionTitle: '4. P&ID Color Coding',
    intro: 'To highlight the modularity of the design, the following color coding is applied to the diagram:',
    blackLabel: '⚫ Black Symbols and Lines (Standard Equipment):',
    blackText: 'Represents the core infrastructure of the machine. These are the essential process lines, standard valves, tanks, and primary motor groups found in every production model.',
    redLabel: '🔴 Red Symbols and Lines (Optional / Customer-Specific Hardware):',
    redText: 'Indicates components integrated specifically based on customer requests or advanced safety requirements. (e.g., PE05 Drainage Pump, FE02 Drying Fan etc.).',
    productionNote: 'Note for Production: Red-coded modules must be verified against the specific Bill of Materials (BOM) for each project order.'
  },
  de: {
    sectionTitle: '4. P&ID-Farbkodierung (Color Coding)',
    intro: 'Um die Modularität des Designs hervorzuheben, wird auf dem Diagramm folgende Farbkodierung angewendet:',
    blackLabel: '⚫ Schwarze Symbole und Linien (Standardausrüstung):',
    blackText: 'Stellt die Kerninfrastruktur der Maschine dar. Dies sind die wesentlichen Prozessleitungen, Standardventile, Tanks und primären Motorgruppen, die in jedem Produktionsmodell vorhanden sind.',
    redLabel: '🔴 Rote Symbole und Linien (Optional / Kundenspezifische Hardware):',
    redText: 'Kennzeichnet Komponenten, die speziell auf Kundenwunsch oder erweiterte Sicherheitsanforderungen integriert wurden. (z. B. PE05 Ablasspumpe, FE02 Trocknungsventilator usw.).',
    productionNote: 'Hinweis für die Produktion: Rot codierte Module müssen anhand der jeweiligen Stückliste (BOM) für jeden Projektauftrag überprüft werden.'
  }
};

function getColorCodingMeta(lang) {
  return COLOR_CODING_META[lang] || COLOR_CODING_META.en;
}

function appendLabeledParagraph(parent, label, text) {
  const p = document.createElement('p');
  p.className = 'doc-p';

  const strong = document.createElement('strong');
  strong.textContent = label;
  p.appendChild(strong);
  p.appendChild(document.createTextNode(' ' + text));
  parent.appendChild(p);
}

function buildColorCodingSection(lang) {
  const meta = getColorCodingMeta(lang);
  const section = document.createElement('div');
  section.className = 'doc-block-stack color-coding-section';

  const heading = document.createElement('h2');
  heading.className = 'doc-h2';
  heading.textContent = meta.sectionTitle;
  section.appendChild(heading);

  const intro = document.createElement('p');
  intro.className = 'doc-p';
  intro.textContent = meta.intro;
  section.appendChild(intro);

  appendLabeledParagraph(section, meta.blackLabel, meta.blackText);
  appendLabeledParagraph(section, meta.redLabel, meta.redText);

  const note = document.createElement('p');
  note.className = 'doc-p doc-note';
  note.textContent = meta.productionNote;
  section.appendChild(note);

  return [section];
}
