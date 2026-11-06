/* Alt panel ve açıklama sayfaları.
   Açıklama Sayfası 1: bileşen listesi, bağlantı mantığı, güvenlik fonksiyonları.
   Açıklama Sayfası 2: P&ID – pnömatik kod eşleştirme. Her zaman yeni sayfada başlar; pnömatik kodu P&ID kodundan
   farklı en az bir bileşen varsa PDF'ten çıkarılamaz. */

const PidReport = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const PREFS_KEY = 'pnomatikx_dock';
  const MIN_HEIGHT = 120;
  const DOCK_TABS = ['components', 'logic', 'safety', 'mapping'];
  const CHIP_CLASS = { control: 'blue', feedback: 'gray', supply: 'green', speed: 'amber', monitor: 'gray', signal: 'gray', mech: 'gray' };

  let app = null;
  let cached = null;
  let stale = true;
  let timer = null;
  let tab = 'components';
  let open = true;
  let height = 250;

  const thumbs = new Map();
  function thumb(id) {
    if (!thumbs.has(id)) thumbs.set(id, PidSymbols.thumbnail(id, 26));
    return thumbs.get(id);
  }

  function cell(tag, content, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    return el;
  }

  function readPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
      if (DOCK_TABS.includes(saved.tab)) tab = saved.tab;
      if (typeof saved.open === 'boolean') open = saved.open;
      if (Number.isFinite(saved.height)) height = saved.height;
    } catch { /* tercih yoksa varsayılanlar kullanılır */ }
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ tab, open, height }));
    } catch { /* tarayıcı hafızası kapalıysa tercih saklanmaz */ }
  }

  /* ─── Analiz ──────────────────────────────────────────── */

  function current() {
    const editor = app && app.editor;
    if (!editor || !editor.drawing) return null;
    if (stale || !cached) {
      const meta = editor.project || {};
      cached = PidLogic.analyze(editor.drawing, {
        catalog: app.catalogMap,
        lang: meta.dil || 'tr',
        showPid: meta.pidEtiket !== false,
        pidCodes: app.pidProjectCodes
      });
      stale = false;
    }
    return cached;
  }

  function invalidate() {
    stale = true;
  }

  /** Pnömatik kodu P&ID kodundan farklı satır varsa eşleştirme sayfası zorunludur */
  function mappingRequired(data) {
    const d = data || current();
    return !!d && d.mappingDiffers > 0;
  }

  /* ─── Alt panel ───────────────────────────────────────── */

  const rowAttrs = (row) => `class="dk-row" data-sheet="${esc(row.sheetId)}" data-item="${esc(row.itemId)}"`;
  const optionChip = (row, t) => (row.optional ? ` <span class="dk-chip red-soft">${esc(t.optional)}</span>` : '');

  function componentsHtml(data) {
    const t = data.text;
    if (!data.components.length) {
      return '<div class="dk-empty">Çizimde henüz bileşen yok. Soldaki listeden sembol ekleyin veya "Otomatik Oluştur" ile P&ID kodlarından çizin.</div>';
    }
    const c = t.columns;
    const rows = data.components.map((row) => `
      <tr ${rowAttrs(row)}>
        <td class="dk-code">${esc(row.tag || t.noCode)}</td>
        <td class="dk-pid">${esc(row.pid || t.noCode)}</td>
        <td class="dk-sym">${thumb(row.symbol)}</td>
        <td class="dk-name">${esc(row.name)}${row.qty > 1 ? ` <span class="dk-chip gray">× ${row.qty}</span>` : ''}${optionChip(row, t)}</td>
        <td>${esc(row.purpose)}</td>
        <td class="dk-links">${esc(row.links.join(', '))}</td>
        <td class="dk-sheet">${esc(row.sheets.join(', '))}</td>
      </tr>`).join('');
    return `<table class="dk-table"><thead><tr><th>${esc(c.code)}</th><th>${esc(c.pid)}</th><th>${esc(c.symbol)}</th><th>${esc(c.name)}</th><th>${esc(c.purpose)}</th><th>${esc(c.links)}</th><th>${esc(c.sheet)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function logicHtml(data) {
    const t = data.text;
    if (!data.logic.length) {
      return '<div class="dk-empty">Henüz bağlantı yok. Valf ile aktüatör arasına çalışma hattı çizin; burada sözel olarak açıklanır.</div>';
    }
    const c = t.columns;
    const rows = data.logic.map((row) => `
      <tr ${rowAttrs(row)}>
        <td class="dk-route">${esc(row.route)}</td>
        <td class="dk-type"><span class="dk-chip ${CHIP_CLASS[row.group] || 'gray'}">${esc(row.type)}</span></td>
        <td>${esc(row.text)}${optionChip(row, t)}</td>
      </tr>`).join('');
    return `<table class="dk-table"><thead><tr><th>${esc(c.route)}</th><th>${esc(c.type)}</th><th>${esc(c.text)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function hintsHtml(data, codes) {
    const hints = data.hints.filter((h) => h.level === 'warn' && (!codes || codes.includes(h.code)));
    if (!hints.length) return '';
    const rows = hints.map((h) => `<button type="button" class="dk-hint" data-sheet="${esc(h.sheetId || '')}" data-item="${esc(h.itemId || '')}"${h.pid ? ` data-pid="${esc(h.pid)}"` : ''}>${esc(h.msg)}</button>`).join('');
    return `<div class="dk-hints"><div class="dk-hints-title">Kontrol edilmesi gerekenler (${hints.length})</div>${rows}</div>`;
  }

  function safetyHtml(data) {
    const t = data.text;
    const warn = hintsHtml(data, ['actuator-novalve', 'valve-nosupply', 'valve-port-open']);
    if (!data.safety.length) {
      return `${warn}<div class="dk-empty">Henüz güvenlik fonksiyonu tanınmadı. Besleme hattına tahliyeli ana valf (3/2, yay dönüşlü) ve basınç sensörü ekleyin.</div>`;
    }
    const c = t.columns;
    const rows = data.safety.map((row) => `
      <tr ${rowAttrs(row)}>
        <td class="dk-code">${esc(row.no)}</td>
        <td class="dk-name">${esc(row.fn)}${optionChip(row, t)}</td>
        <td>${esc(row.trigger)}</td>
        <td>${esc(row.affected.join(', ') || t.noCode)}</td>
        <td>${esc(row.logic)}</td>
      </tr>`).join('');
    return `${warn}<table class="dk-table"><thead><tr><th>${esc(c.no)}</th><th>${esc(c.fn)}</th><th>${esc(c.trigger)}</th><th>${esc(c.affected)}</th><th>${esc(c.logic)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function mappingHtml(data) {
    const t = data.text;
    const warn = hintsHtml(data, ['pid-missing', 'coil-nopid', 'pid-unknown']);
    if (!data.mapping.length) {
      return `${warn}<div class="dk-empty">Henüz P&ID koduna bağlı bileşen yok. Kodlar sekmesinden bir P&ID kodu (ör. V31) seçin veya valfin bobinine P&ID kodu yazın.</div>`;
    }
    const c = t.columns;
    const rows = data.mapping.map((row) => `
      <tr ${rowAttrs(row)}${row.kind === 'coil' || row.kind === 'sensor' ? ' data-sub="1"' : ''}>
        <td class="dk-sheet">${esc(row.circuit == null ? t.noCode : row.circuit === 0 ? `0 · ${t.supplyCircuit}` : row.circuit)}</td>
        <td class="dk-code${row.kind === 'coil' || row.kind === 'sensor' ? ' dk-sub' : ''}">${esc(row.code)}</td>
        <td class="dk-pid">${esc(row.pid)}</td>
        <td>${esc(row.component)}${optionChip(row, t)}</td>
        <td>${esc(row.pidName || t.noCode)}</td>
        <td class="dk-sheet">${esc(row.sheet)}</td>
      </tr>`).join('');
    const note = mappingRequired(data)
      ? `<div class="dk-note">${data.mappingDiffers} pnömatik kod P&ID kodundan farklı: bu tablo PDF'te <strong>Açıklama Sayfası 2</strong> olarak her zaman yer alır.</div>`
      : '';
    return `${warn}${note}<table class="dk-table"><thead><tr><th>${esc(c.circuit)}</th><th>${esc(c.pneuCode)}</th><th>${esc(c.pidCode)}</th><th>${esc(c.component)}</th><th>${esc(c.pidName)}</th><th>${esc(c.sheet)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function render() {
    clearTimeout(timer);
    const data = current();
    if (!data) return;
    $('dockCountComponents').textContent = data.components.length || '';
    $('dockCountLogic').textContent = data.logic.length || '';
    $('dockCountSafety').textContent = data.safety.length || '';
    $('dockCountMapping').textContent = data.mapping.length || '';
    if (!open) return;
    const body = $('dockBody');
    const top = body.scrollTop;
    body.innerHTML = tab === 'components' ? componentsHtml(data)
      : tab === 'logic' ? logicHtml(data)
        : tab === 'safety' ? safetyHtml(data)
          : mappingHtml(data);
    body.scrollTop = top;
  }

  /** Her düzenlemede çalışır; art arda değişikliklerde tek çizim yapılır */
  function schedule() {
    stale = true;
    clearTimeout(timer);
    timer = setTimeout(render, 120);
  }

  function applyLayout() {
    const dock = $('dock');
    dock.classList.toggle('collapsed', !open);
    $('dockBody').style.height = `${height}px`;
    $('dockToggle').textContent = open ? '▾' : '▴';
    $('dockToggle').title = open ? 'Paneli kapat' : 'Paneli aç';
    document.querySelectorAll('.dock-tab').forEach((b) => b.classList.toggle('active', b.dataset.dock === tab));
  }

  function select(next) {
    tab = next;
    open = true;
    savePrefs();
    applyLayout();
    $('dockBody').scrollTop = 0;
    render();
  }

  function bind() {
    document.querySelectorAll('.dock-tab').forEach((b) => b.addEventListener('click', () => select(b.dataset.dock)));
    $('dockToggle').addEventListener('click', () => {
      open = !open;
      savePrefs();
      applyLayout();
      render();
    });
    $('dockBody').addEventListener('click', (e) => {
      const hint = e.target.closest('[data-pid]');
      if (hint && hint.dataset.pid && !hint.dataset.item) {
        app.linkPidCode(hint.dataset.pid);
        return;
      }
      const row = e.target.closest('[data-item]');
      if (row && row.dataset.item) app.editor.focusItem(row.dataset.sheet, row.dataset.item);
    });

    const handle = $('dockResize');
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const startY = e.clientY;
      const startH = height;
      const move = (ev) => {
        const max = Math.max(MIN_HEIGHT, window.innerHeight * 0.65);
        height = Math.round(Math.max(MIN_HEIGHT, Math.min(max, startH + startY - ev.clientY)));
        $('dockBody').style.height = `${height}px`;
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        savePrefs();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  /* ─── Açıklama sayfaları (A3 yatay, şema sayfasıyla aynı antet) ─ */

  const MM = 96 / 25.4;
  const PAGE_W = 420 * MM;
  const PAGE_H = 297 * MM;
  const COL_W = 185;
  const COL_X = [21, 214];
  const COL_Y = 28;
  const SECTION_GAP = 6;
  const FIT_MARGIN = 1;

  const docSheet = (title) => ({ id: 'aciklama', title, size: 'A3', items: [] });

  /** Sütunların kullanılabilir yüksekliği (mm): sağ sütun başlık bloğunun üstünde biter */
  function columnHeights(sheet) {
    const g = PidSheet.geometry(sheet);
    const bottom = g.inner.y1 - 5;
    const revisions = Math.min(4, ((app.editor.project && app.editor.project.revizyonlar) || []).length);
    const reserved = revisions ? (revisions + 1) * 4.5 : 0;
    return [bottom - COL_Y, g.title.y - reserved - 5 - COL_Y];
  }

  function optionMark(row, t) {
    return row.optional ? ` <span class="rp-opt">(${esc(t.optional)})</span>` : '';
  }

  /** Açıklama 1 bölümleri: sütun genişlikleri mm, hücreler hazır HTML */
  function sections1(data, wanted) {
    const t = data.text;
    const c = t.columns;
    const out = [];
    if (wanted.components && data.components.length) {
      out.push({
        title: t.titles.components,
        columns: [[c.code, 14], [c.pid, 17], [c.symbol, 12], [c.name, 38], [c.purpose, 78], [c.links, 26]],
        rows: data.components.map((row) => [
          `<td class="rp-code">${esc(row.tag || t.noCode)}</td>`,
          `<td class="rp-pid">${esc(row.pid || t.noCode)}</td>`,
          `<td class="rp-sym">${thumb(row.symbol)}</td>`,
          `<td class="rp-strong">${esc(row.name)}${row.qty > 1 ? ` × ${row.qty}` : ''}${optionMark(row, t)}</td>`,
          `<td>${esc(row.purpose)}</td>`,
          `<td class="rp-muted">${esc(row.links.join(', '))}</td>`
        ])
      });
    }
    if (wanted.logic && data.logic.length) {
      out.push({
        title: t.titles.logic,
        columns: [[c.route, 46], [c.type, 22], [c.text, 117]],
        rows: data.logic.map((row) => [
          `<td class="rp-strong">${esc(row.route)}</td>`,
          `<td><span class="rp-pill ${row.group}">${esc(row.type)}</span></td>`,
          `<td>${esc(row.text)}${optionMark(row, t)}</td>`
        ])
      });
    }
    if (wanted.safety && data.safety.length) {
      out.push({
        title: t.titles.safety,
        columns: [[c.no, 14], [c.fn, 33], [c.trigger, 32], [c.affected, 36], [c.logic, 70]],
        rows: data.safety.map((row) => [
          `<td class="rp-gf">${esc(row.no)}</td>`,
          `<td class="rp-strong">${esc(row.fn)}${optionMark(row, t)}</td>`,
          `<td>${esc(row.trigger)}</td>`,
          `<td>${esc(row.affected.join(', ') || t.noCode)}</td>`,
          `<td>${esc(row.logic)}</td>`
        ])
      });
    }
    return out;
  }

  /** Açıklama 2: kod eşleştirme */
  function sections2(data) {
    const t = data.text;
    const c = t.columns;
    if (!data.mapping.length) return [];
    return [{
      title: t.titles.mapping,
      intro: t.mappingIntro,
      columns: [[c.circuit, 13], [c.pneuCode, 21], [c.pidCode, 22], [c.component, 66], [c.pidName, 63]],
      rows: data.mapping.map((row) => {
        const sub = row.kind === 'coil' || row.kind === 'sensor';
        return [
          `<td class="rp-muted">${esc(row.circuit == null ? t.noCode : row.circuit)}</td>`,
          `<td class="rp-code${sub ? ' rp-sub' : ''}">${esc(row.code)}</td>`,
          `<td class="rp-pid rp-strong">${esc(row.pid)}</td>`,
          `<td${row.strong ? ' class="rp-strong"' : ''}>${esc(row.component)}${optionMark(row, t)}</td>`,
          `<td>${esc(row.pidName || t.noCode)}</td>`
        ];
      })
    }];
  }

  function headEl(section, number, continued, data) {
    const head = cell('div', undefined, 'rp-head');
    head.appendChild(cell('span', String(number), 'rp-num'));
    const titleEl = cell('span', section.title.toLocaleUpperCase(data.lang === 'tr' ? 'tr' : data.lang), 'rp-title');
    if (continued) titleEl.appendChild(cell('span', data.text.continued, 'rp-cont'));
    head.appendChild(titleEl);
    if (section.intro && !continued) {
      const wrap = cell('div', undefined, 'rp-headwrap');
      wrap.appendChild(head);
      wrap.appendChild(cell('p', section.intro, 'rp-intro'));
      return wrap;
    }
    return head;
  }

  function tableEl(section, from, to) {
    const table = cell('table', undefined, 'rp-table');
    const colgroup = document.createElement('colgroup');
    const headRow = document.createElement('tr');
    for (const [label, width] of section.columns) {
      const col = document.createElement('col');
      col.style.width = `${width}mm`;
      colgroup.appendChild(col);
      headRow.appendChild(cell('th', label));
    }
    table.appendChild(colgroup);
    const thead = document.createElement('thead');
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    for (let i = from; i < to; i += 1) {
      const tr = document.createElement('tr');
      tr.innerHTML = section.rows[i].join('');
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    return table;
  }

  /** Başlık ve satır yüksekliklerini gerçek stille ölçer (mm) */
  function measure(list, data) {
    const host = cell('div', undefined, 'rp-sheet rp-measure');
    document.body.appendChild(host);
    try {
      list.forEach((section, i) => {
        const head = headEl(section, i + 1, false, data);
        const contHead = headEl(section, i + 1, true, data);
        const table = tableEl(section, 0, section.rows.length);
        host.replaceChildren(head, contHead, table);
        section.headH = head.getBoundingClientRect().height / MM;
        section.contH = contHead.getBoundingClientRect().height / MM;
        section.tableHeadH = table.tHead.getBoundingClientRect().height / MM;
        section.rowH = [...table.tBodies[0].rows].map((tr) => tr.getBoundingClientRect().height / MM);
      });
    } finally {
      host.remove();
    }
  }

  /** Bölümleri sütunlara dağıtır: yeni bölüm sol sütun kullanıldıysa sağda başlar, yer kalmazsa yeni sayfaya geçer */
  function flow(list, heights) {
    const pages = [];
    let page = null;
    let col = 0;
    let used = 0;
    const startPage = () => {
      page = { columns: heights.map(() => []) };
      pages.push(page);
      col = 0;
      used = 0;
    };
    const nextColumn = () => {
      col += 1;
      used = 0;
      if (col >= heights.length) startPage();
    };
    startPage();
    list.forEach((section, index) => {
      if (col === 0 && used > 0) nextColumn();
      let i = 0;
      let continued = false;
      while (i < section.rows.length) {
        const gap = used > 0 ? SECTION_GAP : 0;
        const head = (continued ? section.contH : section.headH) + section.tableHeadH;
        const room = heights[col] - used - gap - head - FIT_MARGIN;
        if (room < section.rowH[i] && used > 0) {
          nextColumn();
          continue;
        }
        const from = i;
        let taken = 0;
        while (i < section.rows.length && (i === from || taken + section.rowH[i] <= room)) {
          taken += section.rowH[i];
          i += 1;
        }
        page.columns[col].push({ section, number: index + 1, from, to: i, continued });
        used += gap + head + taken;
        continued = true;
        if (i < section.rows.length) nextColumn();
      }
    });
    return pages;
  }

  /** wanted: {components, logic, safety, mapping} → [{doc, title, docType, pages}] */
  function plan(wanted) {
    const data = current();
    if (!data) return null;
    const t = data.text;
    const docs = [];
    const first = sections1(data, wanted);
    if (first.length) {
      measure(first, data);
      docs.push({ doc: 1, title: t.titles.document, docType: t.titles.docType, pages: flow(first, columnHeights(docSheet(t.titles.document))) });
    }
    const second = (wanted.mapping || mappingRequired(data)) ? sections2(data) : [];
    if (second.length) {
      measure(second, data);
      docs.push({ doc: 2, title: t.titles.mappingDoc, docType: t.titles.docType2, pages: flow(second, columnHeights(docSheet(t.titles.mappingDoc))) });
    }
    return { data, docs };
  }

  function pageCount(wanted) {
    const planned = plan(wanted);
    return planned ? planned.docs.reduce((sum, d) => sum + d.pages.length, 0) : 0;
  }

  /** @param start ilk sayfa numarası @param total belgedeki toplam numaralı sayfa */
  function buildPages(wanted, start, total) {
    const planned = plan(wanted);
    if (!planned || !planned.docs.length) return [];
    const { data } = planned;
    const meta = app.editor.project;
    const brand = HEADER_BRANDS[meta.firma] || HEADER_BRANDS.DOLFIN;
    const out = [];
    let number = start;
    for (const doc of planned.docs) {
      const sheet = docSheet(doc.title);
      for (const page of doc.pages) {
        const el = cell('div', undefined, 'print-sheet print-a3 rp-sheet');
        el.dataset.doc = String(doc.doc);
        el.style.setProperty('--rp-accent', brand.color || '#ff0000');
        el.innerHTML = PidSheet.sheetSvg(meta, { sheets: [sheet] }, 0, Object.assign({}, app.editor.ctx, {
          interactive: false,
          pageNumber: number,
          pageTotal: total,
          docTypeValue: doc.docType
        }));
        const badge = cell('div', doc.docType.toLocaleUpperCase(data.lang === 'tr' ? 'tr' : data.lang), 'rp-docbadge');
        el.appendChild(badge);
        page.columns.forEach((fragments, c) => {
          if (!fragments.length) return;
          const column = cell('div', undefined, 'rp-col');
          column.style.left = `${COL_X[c]}mm`;
          column.style.top = `${COL_Y}mm`;
          column.style.width = `${COL_W}mm`;
          for (const part of fragments) {
            const block = cell('div', undefined, 'rp-section');
            block.appendChild(headEl(part.section, part.number, part.continued, data));
            block.appendChild(tableEl(part.section, part.from, part.to));
            column.appendChild(block);
          }
          el.appendChild(column);
        });
        out.push(el);
        number += 1;
      }
    }
    return out;
  }

  /* ─── Açıklama penceresi ──────────────────────────────── */

  const studio = () => $('reportStudio');
  const isStudioOpen = () => !studio().classList.contains('hidden');
  const TOGGLES = [['components', 'Bileşen Listesi'], ['logic', 'Bağlantı Mantığı'], ['safety', 'Güvenlik Fonksiyonları'], ['mapping', 'Açıklama 2: Kod Eşleştirme']];

  function fitPages() {
    if (!isStudioOpen()) return;
    const box = $('rsPages');
    if (!box) return;
    const k = Math.min(1, (box.clientWidth - 40) / PAGE_W);
    box.querySelectorAll('.cs-sheet').forEach((sheet) => {
      sheet.style.width = `${PAGE_W * k}px`;
      sheet.style.height = `${PAGE_H * k}px`;
      sheet.style.setProperty('--cs-k', k);
    });
  }

  function renderStudioPages() {
    const box = $('rsPages');
    const opts = app.state.pdfOptions;
    const data = current();
    const required = mappingRequired(data);
    const mapBox = studio().querySelector('[data-rs="mapping"]');
    if (mapBox) {
      mapBox.checked = opts.mapping || required;
      mapBox.disabled = required;
      mapBox.closest('label').title = required ? 'Pnömatik kodlar P&ID kodlarından farklı: eşleştirme sayfası zorunlu' : '';
    }
    const count = pageCount(opts);
    const sheetCount = opts.sheets ? app.editor.drawing.sheets.length : 0;
    const pages = buildPages(opts, 1, count + sheetCount);
    box.replaceChildren();
    $('rsInfo').textContent = count ? `A3 yatay · ${count} sayfa${required ? ' · Açıklama 2 zorunlu' : ''}` : 'A3 yatay';
    if (!pages.length) {
      box.appendChild(cell('div', 'Gösterilecek içerik yok. Çizime bileşen ekleyin veya yukarıdan bir tablo seçin.', 'rs-empty'));
      return;
    }
    for (const page of pages) {
      const holder = cell('div', undefined, 'cs-sheet');
      holder.appendChild(page);
      box.appendChild(holder);
    }
    fitPages();
  }

  function openStudio() {
    const opts = app.state.pdfOptions;
    studio().innerHTML = `
      <header class="cs-bar">
        <div class="cs-title"><h2>Açıklama Sayfaları</h2><span id="rsInfo"></span></div>
        <div class="cs-actions">
          ${PidCovers.langSeg(app.editor.project.dil || 'tr')}
          <div class="rs-toggles">${TOGGLES.map(([key, label]) => `<label class="rs-toggle"><input type="checkbox" data-rs="${key}"${opts[key] ? ' checked' : ''}> ${label}</label>`).join('')}</div>
          <button type="button" class="btn btn-sm" id="rsPdf">Açıklamayı PDF İndir</button>
          <button type="button" class="btn btn-sm btn-primary" id="rsPdfAll">Tüm Projeyi PDF İndir</button>
          <button type="button" class="icon-btn" id="rsClose" title="Kapat (Esc)">×</button>
        </div>
      </header>
      <div class="rs-pages" id="rsPages"></div>`;
    studio().classList.remove('hidden');
    stale = true;
    renderStudioPages();
  }

  function closeStudio() {
    studio().classList.add('hidden');
    studio().innerHTML = '';
  }

  function bindStudio() {
    const root = studio();
    root.addEventListener('change', (e) => {
      const key = e.target.dataset && e.target.dataset.rs;
      if (!key) return;
      app.state.pdfOptions[key] = e.target.checked;
      renderStudioPages();
    });
    root.addEventListener('click', (e) => {
      const langBtn = e.target.closest('[data-doc-lang]');
      if (langBtn) {
        app.setDocumentLanguage(langBtn.dataset.docLang);
        root.querySelectorAll('[data-doc-lang]').forEach((b) => {
          const on = b === langBtn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', String(on));
        });
        stale = true;
        renderStudioPages();
        return;
      }
      const id = e.target.id;
      if (id === 'rsClose') closeStudio();
      else if (id === 'rsPdf') app.exportReportPdf();
      else if (id === 'rsPdfAll') app.openPdfDialog();
    });
    window.addEventListener('resize', fitPages);
  }

  function init(appRef) {
    app = appRef;
    readPrefs();
    bind();
    bindStudio();
    applyLayout();
  }

  return {
    init,
    current,
    invalidate,
    schedule,
    render,
    select,
    pageCount,
    buildPages,
    mappingRequired,
    open: openStudio,
    close: closeStudio,
    isOpen: isStudioOpen
  };
})();
