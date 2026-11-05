/* Kapak tasarımları (A3 yatay) ve kapak stüdyosu.
   Seçilen tasarım PNOMATIK/data/ayarlar.json dosyasında tutulur ve tüm projelerde kullanılır. */

const PidCovers = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* A3 yatay: 420 × 297 mm, 96 dpi */
  const PAGE_W = 1587.4;
  const PAGE_H = 1122.5;

  const DESIGNS = [
    { id: 'bant', name: 'Kırmızı Bant', hint: 'Solda dikey bant, sağda bilgi listesi' },
    { id: 'ust', name: 'Üst Bant', hint: 'Üstte tam genişlik bant, altta bilgi tablosu' },
    { id: 'kose', name: 'Köşe Blok', hint: 'Köşede kırmızı blok, ortada büyük başlık' }
  ];
  const DEFAULT_DESIGN = DESIGNS[0].id;

  const COVER_TEXT = {
    tr: { docTitle: 'PNÖMATİK DEVRE ŞEMASI', pages: 'Sayfa Sayısı', pid: 'P&ID Projesi', mark: 'PNÖMATİK' },
    en: { docTitle: 'PNEUMATIC CIRCUIT DIAGRAM', pages: 'Pages', pid: 'P&ID Project', mark: 'PNEUMATIC' },
    de: { docTitle: 'PNEUMATIKSCHALTPLAN', pages: 'Seiten', pid: 'P&ID-Projekt', mark: 'PNEUMATIK' }
  };
  const STANDARD = 'ISO 1219-1 · ISO 1219-2';

  const isDesign = (id) => DESIGNS.some((d) => d.id === id);

  function infoFrom(meta, drawing, options) {
    const lang = PidSheet.TEXT[meta.dil] ? meta.dil : 'tr';
    const brand = COVER_BRANDS[meta.firma] || COVER_BRANDS.DOLFIN;
    const header = HEADER_BRANDS[meta.firma] || HEADER_BRANDS.DOLFIN;
    const upper = (text) => String(text || '').toLocaleUpperCase(lang === 'tr' ? 'tr' : lang);
    return {
      t: PidSheet.TEXT[lang],
      c: COVER_TEXT[lang],
      accent: brand.accent,
      logo: brand.logo,
      company: header.footer || '',
      model: upper(meta.model),
      customer: upper(meta.musteri),
      seriNo: meta.seriNo || '',
      musteri: meta.musteri || '',
      modelRaw: meta.model || '',
      title: drawing.sheets[0] ? drawing.sheets[0].title : '',
      rev: meta.rev || '',
      date: PidSheet.formatDate(meta.tarih),
      hazirlayan: meta.hazirlayan || '',
      kontrol: meta.kontrol || '',
      onay: meta.onay || '',
      pidProje: meta.pidProje || '',
      pages: (options && options.pages) || drawing.sheets.length
    };
  }

  /** Uzun model adları kendi alanına sığsın */
  function titleSize(text, sizes) {
    const len = String(text).length;
    if (len <= 10) return sizes[0];
    if (len <= 16) return sizes[1];
    if (len <= 24) return sizes[2];
    if (len <= 34) return sizes[3];
    return sizes[4];
  }

  /* ─── Ortak parçalar ──────────────────────────────────── */

  // Projeyi açarken yüklenen logo (data URI) kullanılır; dosyadan açılan sayfa adresten gelen görseli PDF'e koyamaz
  const logoSrc = (path) => (app && app.logoUri && app.logoUri(path)) || path;
  const logoImg = (info) => `<img class="pcv-logo" src="${esc(logoSrc(info.logo))}" alt="">`;
  const kicker = (info) => `<div class="pcv-kicker">${esc(info.c.docTitle)}</div>`;
  const title = (info, sizes) => `<h1 class="pcv-title" style="font-size:${titleSize(info.model, sizes)}px">${esc(info.model)}</h1>`;

  function signBoxes(info) {
    const box = (label, name) => `<div class="pcv-sign-box"><span>${esc(label)}</span><b>${esc(name)}</b></div>`;
    return `<div class="pcv-sign">${box(info.t.prepared, info.hazirlayan)}${box(info.t.checked, info.kontrol)}${box(info.t.approved, info.onay)}</div>`;
  }

  /** Antetteki bilgiler: tüm tasarımlarda aynı sıra */
  function fields(info) {
    const t = info.t;
    return [
      [t.project, info.seriNo, true],
      [t.customer, info.musteri],
      [t.model, info.modelRaw],
      [t.drawing, info.title],
      [t.docType, t.docTypeValue],
      [t.rev, info.rev],
      [t.date, info.date],
      [info.c.pages, info.pages]
    ].concat(info.pidProje ? [[info.c.pid, info.pidProje]] : []);
  }

  const listRows = (info) => fields(info).map(([label, value, strong]) =>
    `<div class="pcv-row"><dt>${esc(label)}</dt><dd${strong ? ' class="strong"' : ''}>${esc(value)}</dd></div>`).join('');

  const cells = (info) => fields(info).map(([label, value, strong]) =>
    `<div class="pcv-cell"><span>${esc(label)}</span><b${strong ? ' class="strong"' : ''}>${esc(value)}</b></div>`).join('');

  /* ─── 1. Kırmızı Bant ─────────────────────────────────── */

  function renderBant(info) {
    return `
      <aside class="pcv-band">
        <span class="pcv-band-std">${esc(STANDARD)}</span>
        <span class="pcv-band-mark">${esc(info.c.mark)}</span>
      </aside>
      <div class="pcv-main">
        ${logoImg(info)}
        <div class="pcv-body">
          <div class="pcv-head">
            ${kicker(info)}
            ${title(info, [104, 86, 68, 54, 44])}
            <div class="pcv-rule"></div>
            <div class="pcv-customer">${esc(info.customer)}</div>
          </div>
          <dl class="pcv-list">${listRows(info)}</dl>
        </div>
        ${signBoxes(info)}
        <div class="pcv-foot">${esc(info.company)}</div>
      </div>`;
  }

  /* ─── 2. Üst Bant ─────────────────────────────────────── */

  function renderUst(info) {
    return `
      <section class="pcv-u-band">
        <span class="pcv-u-std">${esc(STANDARD)}</span>
        <span class="pcv-u-mark">${esc(info.c.mark)}</span>
        <div class="pcv-u-text">
          ${kicker(info)}
          ${title(info, [118, 98, 78, 62, 50])}
          <div class="pcv-customer">${esc(info.customer)}</div>
        </div>
      </section>
      <section class="pcv-u-lower">
        <div class="pcv-u-left">
          ${logoImg(info)}
          <div class="pcv-foot">${esc(info.company)}</div>
        </div>
        <div class="pcv-u-right">
          <div class="pcv-cells">${cells(info)}</div>
          ${signBoxes(info)}
        </div>
      </section>`;
  }

  /* ─── 3. Köşe Blok ────────────────────────────────────── */

  function renderKose(info) {
    return `
      <div class="pcv-k-top"></div>
      <div class="pcv-k-side"></div>
      <div class="pcv-k-block">
        <span>${esc(STANDARD)}</span>
        <b>${esc(info.c.mark)}</b>
      </div>
      <div class="pcv-k-logo">${logoImg(info)}</div>
      <div class="pcv-k-head">
        ${kicker(info)}
        ${title(info, [112, 92, 72, 58, 46])}
        <div class="pcv-rule"></div>
        <div class="pcv-customer">${esc(info.customer)}</div>
      </div>
      <div class="pcv-k-lower">
        <div class="pcv-cells">${cells(info)}</div>
        ${signBoxes(info)}
      </div>
      <div class="pcv-k-foot pcv-foot">${esc(info.company)}</div>`;
  }

  const RENDER = { bant: renderBant, ust: renderUst, kose: renderKose };

  /** @param options.pages kapakta yazacak toplam sayfa sayısı */
  function build(designId, meta, drawing, options) {
    const id = isDesign(designId) ? designId : DEFAULT_DESIGN;
    const info = infoFrom(meta, drawing, options);
    const page = document.createElement('div');
    page.className = `print-sheet print-a3 pcv pcv-${id}`;
    page.style.setProperty('--pcv-accent', info.accent);
    page.innerHTML = RENDER[id](info);
    return page;
  }

  /* ─── Kapak stüdyosu ──────────────────────────────────── */

  const FIELDS = [
    { key: 'seriNo', label: 'Proje No' },
    { key: 'musteri', label: 'Müşteri' },
    { key: 'model', label: 'Model' },
    { key: 'title', label: 'Çizim Adı' },
    { key: 'hazirlayan', label: 'Hazırlayan' },
    { key: 'kontrol', label: 'Kontrol' },
    { key: 'onay', label: 'Onay' },
    { key: 'tarih', label: 'Tarih', type: 'date' },
    { key: 'rev', label: 'Rev.' },
    { key: 'firma', label: 'Marka', options: [['DOLFIN', 'DOLFIN'], ['ENVA', 'ENVA'], ['VICO', 'VICO'], ['KSYSTEM', 'K.SYSTEM']] },
    { key: 'dil', label: 'Dil', options: [['tr', 'Türkçe'], ['en', 'English'], ['de', 'Deutsch']] }
  ];

  let app = null;
  let refreshTimer = null;
  let pageCount = 1;

  const studio = () => $('coverStudio');
  const isOpen = () => !studio().classList.contains('hidden');

  function fieldValue(field) {
    const editor = app.editor;
    if (field.key === 'title') return editor.drawing.sheets[0] ? editor.drawing.sheets[0].title : '';
    return editor.project[field.key] == null ? '' : editor.project[field.key];
  }

  function fieldHtml(field) {
    const value = fieldValue(field);
    const id = `csf-${field.key}`;
    const control = field.options
      ? `<select id="${id}" class="field-input" data-field="${field.key}">${field.options.map(([v, t]) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`
      : `<input id="${id}" class="field-input" data-field="${field.key}" type="${field.type || 'text'}" value="${esc(value)}" autocomplete="off">`;
    return `<div class="field cs-field"><label for="${id}">${esc(field.label)}</label>${control}</div>`;
  }

  const stateText = (selected) => (selected ? '✓ Seçili kapak' : 'Bu kapağı kullan');

  function renderShell() {
    studio().innerHTML = `
      <header class="cs-bar">
        <div class="cs-title">
          <h2>Kapak</h2>
          <span>A3 yatay. Bilgileri yukarıdan değiştirin, kullanmak istediğiniz tasarımı sağdan seçin.</span>
        </div>
        <div class="cs-actions">
          <button type="button" class="btn btn-sm" id="csSave">Projeyi Kaydet</button>
          <button type="button" class="btn btn-sm" id="csPdfCover">Kapağı PDF İndir</button>
          <button type="button" class="btn btn-sm btn-primary" id="csPdfAll">Tüm Projeyi PDF İndir</button>
          <button type="button" class="icon-btn" id="csClose" title="Kapat (Esc)">×</button>
        </div>
      </header>
      <div class="cs-fields">${FIELDS.map(fieldHtml).join('')}</div>
      <div class="cs-body">
        <div class="cs-stage" id="csStage"><div class="cs-sheet" data-sheet="stage"></div></div>
        <div class="cs-rail">
          ${DESIGNS.map((d) => `
            <div class="cs-card${d.id === app.coverDesign ? ' selected' : ''}" data-design="${d.id}" role="button" tabindex="0">
              <div class="cs-card-head">
                <span class="cs-card-name">${esc(d.name)}</span>
                <span class="cs-card-state">${stateText(d.id === app.coverDesign)}</span>
              </div>
              <div class="cs-sheet-area"><div class="cs-sheet" data-sheet="${d.id}"></div></div>
              <div class="cs-card-hint">${esc(d.hint)}</div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function renderPreviews() {
    const editor = app.editor;
    const options = { pages: pageCount };
    studio().querySelectorAll('.cs-sheet').forEach((host) => {
      const design = host.dataset.sheet === 'stage' ? app.coverDesign : host.dataset.sheet;
      host.replaceChildren(build(design, editor.project, editor.drawing, options));
    });
    fitPreviews();
  }

  function scaleSheet(sheet, k) {
    sheet.style.width = `${PAGE_W * k}px`;
    sheet.style.height = `${PAGE_H * k}px`;
    sheet.style.setProperty('--cs-k', k);
  }

  function fitPreviews() {
    if (!isOpen()) return;
    const stage = $('csStage');
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    scaleSheet(stage.querySelector('.cs-sheet'), Math.max(0.1, Math.min(box.width / PAGE_W, box.height / PAGE_H)));
    studio().querySelectorAll('.cs-sheet-area').forEach((area) => {
      const rect = area.getBoundingClientRect();
      scaleSheet(area.querySelector('.cs-sheet'), Math.max(0.05, Math.min(rect.width / PAGE_W, rect.height / PAGE_H)));
    });
  }

  function updateSelection() {
    studio().querySelectorAll('.cs-card').forEach((card) => {
      const on = card.dataset.design === app.coverDesign;
      card.classList.toggle('selected', on);
      card.querySelector('.cs-card-state').textContent = stateText(on);
    });
    renderPreviews();
  }

  async function choose(id) {
    if (id === app.coverDesign) return;
    const res = await app.setCoverDesign(id);
    updateSelection();
    if (res.ok) {
      const design = DESIGNS.find((d) => d.id === id);
      app.toast(`"${design.name}" seçildi. Tüm projelerin kapağı bundan sonra bu olacak.`);
    }
  }

  function applyField(key, value) {
    const editor = app.editor;
    if (key === 'title') {
      if (editor.drawing.sheets[0]) editor.drawing.sheets[0].title = value;
    } else {
      editor.project[key] = value;
    }
  }

  function commitField(key) {
    const editor = app.editor;
    if (key === 'title') {
      editor.renderPaper();
      editor.commit();
      app.renderSheets();
    } else {
      app.onMetaChange();
    }
    // Dil değişince tablolar da değişir, sayfa sayısı yeniden hesaplanır
    if (key === 'dil') pageCount = app.documentPageCount();
  }

  function bindShell() {
    const root = studio();
    root.addEventListener('input', (e) => {
      const key = e.target.dataset && e.target.dataset.field;
      if (!key) return;
      applyField(key, e.target.value);
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(renderPreviews, 60);
    });
    root.addEventListener('change', (e) => {
      const key = e.target.dataset && e.target.dataset.field;
      if (!key) return;
      applyField(key, e.target.value.trim());
      commitField(key);
      renderPreviews();
    });
    root.addEventListener('click', (e) => {
      const card = e.target.closest('.cs-card');
      if (card) {
        choose(card.dataset.design);
        return;
      }
      const id = e.target.id;
      if (id === 'csClose') close();
      else if (id === 'csSave') app.saveProject();
      else if (id === 'csPdfCover') app.exportCoverPdf();
      else if (id === 'csPdfAll') app.openPdfDialog();
    });
    root.addEventListener('keydown', (e) => {
      const card = e.target.closest && e.target.closest('.cs-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        choose(card.dataset.design);
      }
    });
    window.addEventListener('resize', fitPreviews);
  }

  function open() {
    pageCount = app.documentPageCount();
    renderShell();
    studio().classList.remove('hidden');
    renderPreviews();
    requestAnimationFrame(fitPreviews);
  }

  function close() {
    studio().classList.add('hidden');
    studio().innerHTML = '';
    // Sağ paneldeki alanlar kapakta yapılan değişikliği göstersin
    app.editor.host.onSelection();
  }

  function init(appRef) {
    app = appRef;
    bindShell();
  }

  return { DESIGNS, DEFAULT_DESIGN, PAGE_W, PAGE_H, isDesign, build, init, open, close, isOpen };
})();
