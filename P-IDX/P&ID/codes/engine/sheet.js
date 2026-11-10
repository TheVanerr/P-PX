/* Sayfa çizici: antet, başlık bloğu, hatlar ve semboller için SVG üretir.
   Ekran, PDF ve SVG çıktısı aynı kodu kullanır; böylece antet her yerde birebir aynıdır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./symbols.js'), require('./model.js'), require('./revlog.js'));
  } else {
    root.PidSheet = factory(root.PidSymbols, root.PidModel, root.PidRevLog);
  }
})(typeof self !== 'undefined' ? self : this, function (Sym, Model, RevLog) {
  'use strict';

  const SIZES = Model.SHEET_SIZES;

  const FONT = "Calibri, 'Segoe UI', Arial, sans-serif";
  const HEADER_FONT = "'Segoe UI', Calibri, Arial, sans-serif";
  const OPTION_COLOR = '#ff0000';
  const INK = '#000000';
  const GRAY = '#6b7280';

  const TEXT = {
    tr: {
      drawing: 'Çizim Adı', project: 'Proje No', customer: 'Müşteri', model: 'Model',
      prepared: 'Hazırlayan', checked: 'Kontrol', approved: 'Onay', date: 'Tarih',
      docType: 'Belge Türü', docTypeValue: 'P&ID Şeması', standard: 'Standart', scale: 'Ölçek',
      scaleValue: 'Ölçeksiz', rev: 'Rev.', sheet: 'Sayfa', revDesc: 'Açıklama',
      legend: 'LEJANT', optionNote: 'Kırmızı: Opsiyon / Müşteriye Özel', standardNote: 'Siyah: Standart Ekipman'
    },
    en: {
      drawing: 'Drawing Title', project: 'Project No', customer: 'Customer', model: 'Model',
      prepared: 'Prepared', checked: 'Checked', approved: 'Approved', date: 'Date',
      docType: 'Document Type', docTypeValue: 'P&ID Diagram', standard: 'Standard', scale: 'Scale',
      scaleValue: 'Not to scale', rev: 'Rev.', sheet: 'Sheet', revDesc: 'Description',
      legend: 'LEGEND', optionNote: 'Red: Optional / Customer-Specific', standardNote: 'Black: Standard Equipment'
    },
    de: {
      drawing: 'Zeichnungstitel', project: 'Projekt-Nr.', customer: 'Kunde', model: 'Modell',
      prepared: 'Erstellt', checked: 'Geprüft', approved: 'Freigabe', date: 'Datum',
      docType: 'Dokumentart', docTypeValue: 'P&ID-Schema', standard: 'Norm', scale: 'Maßstab',
      scaleValue: 'Ohne Maßstab', rev: 'Rev.', sheet: 'Blatt', revDesc: 'Beschreibung',
      legend: 'LEGENDE', optionNote: 'Rot: Option / Kundenspezifisch', standardNote: 'Schwarz: Standardausrüstung'
    }
  };

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const n = (v) => +Number(v).toFixed(3);

  function textEl(x, y, value, opts) {
    const o = opts || {};
    const size = o.size || 3;
    const baseline = o.middle ? y + size * 0.35 : y;
    return `<text x="${n(x)}" y="${n(baseline)}" font-size="${n(size)}" font-family="${o.font || FONT}"` +
      ` fill="${o.fill || 'currentColor'}" stroke="none"` +
      `${o.anchor ? ` text-anchor="${o.anchor}"` : ''}` +
      `${o.bold ? ' font-weight="700"' : ''}` +
      `${o.spacing ? ` letter-spacing="${o.spacing}"` : ''}>${esc(value)}</text>`;
  }

  function sizeOf(sheet) {
    return SIZES[sheet.size] || SIZES.A3;
  }

  const geometry = Model.geometry;

  function brandOf(ctx, project) {
    const brands = ctx.brands || {};
    return brands[project.firma] || brands.DOLFIN || {
      type: 'text',
      name: 'DOLFIN',
      sub: 'Makine Sanayi',
      footer: 'CNK ELEKTRONİK MAKİNE SAN A.Ş.',
      color: '#ff0000'
    };
  }

  /** Antet: P&ID Doküman'daki letterhead ile aynı düzen (marka, model, kırmızı çizgiler, alt bilgi) */
  function renderLetterhead(project, sheet, index, ctx) {
    const g = geometry(sheet);
    const brand = brandOf(ctx, project);
    const color = brand.color || '#ff0000';
    const parts = [];
    const baseline = g.headerRule - 3.4;

    if (brand.type === 'logo' && ctx.brandLogo) {
      parts.push(`<image href="${ctx.brandLogo}" x="${g.mx}" y="${baseline - 5}" height="6.5" width="40" preserveAspectRatio="xMinYMid meet"/>`);
    } else {
      const name = brand.name || project.firma || '';
      parts.push(textEl(g.mx, baseline, name, { size: 6, bold: true, fill: color, font: HEADER_FONT, spacing: 0.15 }));
      const sub = String(brand.sub || '').toLocaleUpperCase('tr');
      parts.push(textEl(g.mx + name.length * 4.15 + 2.5, baseline, sub, { size: 2.7, fill: '#777777', font: HEADER_FONT, spacing: 0.32 }));
    }
    parts.push(textEl(g.W - g.mx, baseline, String(project.model || '').toLocaleUpperCase('tr'), {
      size: 3.4, bold: true, fill: color, anchor: 'end', font: HEADER_FONT, spacing: 0.13
    }));
    parts.push(`<path d="M${g.mx} ${g.headerRule}H${g.W - g.mx}" stroke="${color}" stroke-width="0.53"/>`);
    parts.push(`<path d="M${g.mx} ${g.footerRule}H${g.W - g.mx}" stroke="${color}" stroke-width="0.53"/>`);
    parts.push(textEl(g.mx, g.footerRule + 5, brand.footer || '', { size: 3.2, fill: color }));
    parts.push(textEl(g.W - g.mx, g.footerRule + 5, String(ctx.pageNumber || index + 1), { size: 3.6, fill: color, anchor: 'end' }));
    return parts.join('');
  }

  /** Bölge kılavuzları (ISO 5457): çizimde yer tarif etmek için */
  function renderZones(sheet) {
    const g = geometry(sheet);
    const f = g.frame;
    const cols = Math.max(4, Math.round((f.x1 - f.x0) / 50));
    const rows = Math.max(3, Math.round((f.y1 - f.y0) / 50));
    const parts = [`<rect x="${f.x0}" y="${f.y0}" width="${f.x1 - f.x0}" height="${f.y1 - f.y0}" fill="none" stroke="${INK}" stroke-width="0.35"/>`];
    parts.push(`<rect x="${g.inner.x0}" y="${g.inner.y0}" width="${g.inner.x1 - g.inner.x0}" height="${g.inner.y1 - g.inner.y0}" fill="none" stroke="${INK}" stroke-width="0.5"/>`);

    const cw = (g.inner.x1 - g.inner.x0) / cols;
    const rh = (g.inner.y1 - g.inner.y0) / rows;
    const ticks = [];
    for (let i = 0; i <= cols; i += 1) {
      const x = n(g.inner.x0 + cw * i);
      ticks.push(`M${x} ${f.y0}V${g.inner.y0}M${x} ${g.inner.y1}V${f.y1}`);
      if (i < cols) {
        const cx = x + cw / 2;
        parts.push(textEl(cx, f.y0 + 2, i + 1, { size: 2.2, fill: GRAY, anchor: 'middle', middle: true }));
        parts.push(textEl(cx, f.y1 - 2, i + 1, { size: 2.2, fill: GRAY, anchor: 'middle', middle: true }));
      }
    }
    for (let j = 0; j <= rows; j += 1) {
      const y = n(g.inner.y0 + rh * j);
      ticks.push(`M${f.x0} ${y}H${g.inner.x0}M${g.inner.x1} ${y}H${f.x1}`);
      if (j < rows) {
        const letter = String.fromCharCode(65 + j);
        const cy = y + rh / 2;
        parts.push(textEl(f.x0 + 2, cy, letter, { size: 2.2, fill: GRAY, anchor: 'middle', middle: true }));
        parts.push(textEl(f.x1 - 2, cy, letter, { size: 2.2, fill: GRAY, anchor: 'middle', middle: true }));
      }
    }
    parts.push(`<path d="${ticks.join('')}" fill="none" stroke="${INK}" stroke-width="0.2"/>`);
    return parts.join('');
  }

  function cell(x, y, w, h, label, value, opts) {
    const o = opts || {};
    return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="#fff" stroke="${INK}" stroke-width="0.2"/>` +
      textEl(x + 1.2, y + 2.4, label, { size: 1.9, fill: GRAY }) +
      textEl(x + 1.2, y + h - 1.5, value, { size: o.size || 2.9, bold: o.bold, fill: INK });
  }

  /** Başlık bloğu (ISO 7200 alanları) */
  function renderTitleBlock(project, sheet, index, total, ctx) {
    const g = geometry(sheet);
    const t = TEXT[project.dil] || TEXT.tr;
    const { x, y, w, h } = g.title;
    const brand = brandOf(ctx, project);
    const color = brand.color || '#ff0000';
    const logoW = 38;
    const X = x + logoW;
    const W = w - logoW;
    const parts = [];

    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="0.5"/>`);
    parts.push(`<rect x="${x}" y="${y}" width="${logoW}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="0.2"/>`);
    if (ctx.titleLogo) {
      parts.push(`<image href="${ctx.titleLogo}" x="${x + 3}" y="${y + 6}" width="${logoW - 6}" height="${h - 12}" preserveAspectRatio="xMidYMid meet"/>`);
    } else {
      parts.push(textEl(x + logoW / 2, y + h / 2, brand.name || project.firma || '', { size: 7, bold: true, fill: color, anchor: 'middle', middle: true }));
    }

    parts.push(cell(X, y, W, 12, t.drawing, Sym.localNote(sheet.title, project.dil), { size: 4.6, bold: true }));

    const third = W / 3;
    parts.push(cell(X, y + 12, third, 8, t.project, project.seriNo, { bold: true }));
    parts.push(cell(X + third, y + 12, third, 8, t.customer, project.musteri));
    parts.push(cell(X + third * 2, y + 12, third, 8, t.model, project.model));

    const fourth = W / 4;
    parts.push(cell(X, y + 20, fourth, 8, t.prepared, project.hazirlayan, { size: 2.6 }));
    parts.push(cell(X + fourth, y + 20, fourth, 8, t.checked, project.kontrol, { size: 2.6 }));
    parts.push(cell(X + fourth * 2, y + 20, fourth, 8, t.approved, project.onay, { size: 2.6 }));
    parts.push(cell(X + fourth * 3, y + 20, fourth, 8, t.date, formatDate(project.tarih), { size: 2.6 }));

    const c = [W * 0.2, W * 0.34, W * 0.18, W * 0.12, W * 0.16];
    let cx = X;
    const values = [
      [t.docType, ctx.docTypeValue || t.docTypeValue],
      [t.standard, 'ISO 10628 · ISA-5.1'],
      [t.scale, t.scaleValue],
      [t.rev, RevLog.revText(project)],
      // PDF'te numara tüm belgeye göre verilir; ekranda ve tek sayfalık SVG'de çizim sayfasına göre
      [t.sheet, `${ctx.pageNumber || index + 1} / ${ctx.pageTotal || total}`]
    ];
    values.forEach(([label, value], i) => {
      parts.push(cell(cx, y + 28, c[i], 8, label, value, { size: 2.5 }));
      cx += c[i];
    });

    parts.push(`<path d="M${x} ${y}H${x + w}" stroke="${color}" stroke-width="0.7"/>`);

    // Revizyon tablosu Rev.'den çıkar: 00 ilk yayın, son satır kapaktaki tarih (en yeni dört satır)
    const revisions = RevLog.shown(project);
    if (revisions.length) {
      const rh = 4.5;
      const top = y - rh * (revisions.length + 1);
      const cols = [14, 22, w - 14 - 22 - 30, 30];
      const heads = [t.rev, t.date, t.revDesc, t.prepared];
      const rowsAll = [heads].concat(revisions.map((r) => [r.rev, formatDate(r.tarih), RevLog.description(r, project.dil), r.hazirlayan]));
      rowsAll.forEach((row, ri) => {
        let rx = x;
        row.forEach((val, ci) => {
          parts.push(`<rect x="${n(rx)}" y="${n(top + rh * ri)}" width="${n(cols[ci])}" height="${rh}" fill="#fff" stroke="${INK}" stroke-width="0.2"/>`);
          parts.push(textEl(rx + 1, top + rh * ri + rh / 2, val, { size: ri === 0 ? 1.9 : 2.3, fill: ri === 0 ? GRAY : INK, middle: true }));
          rx += cols[ci];
        });
      });
    }
    return parts.join('');
  }

  function formatDate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || '');
  }

  function renderFrame(project, sheet, index, total, ctx) {
    return renderLetterhead(project, sheet, index, ctx) + renderZones(sheet) + renderTitleBlock(project, sheet, index, total, ctx);
  }

  /* ─── Semboller ───────────────────────────────────────── */

  function tagPlacement(item, def) {
    const box = Model.boxOf(item);
    const dx = (item.tagOffset && item.tagOffset[0]) || 0;
    const dy = (item.tagOffset && item.tagOffset[1]) || 0;
    if (def.tag === 'inside') {
      return { x: (box[0] + box[2]) / 2 + dx, y: box[1] + 5 + dy, anchor: 'middle' };
    }
    const vertical = ((item.rot || 0) % 180 + 180) % 180 === 90;
    if (vertical && def.inline) {
      // Etiket, aktüatörün olmadığı tarafa yazılır
      const y = item.y + 1 + dy;
      if (box[2] - item.x > item.x - box[0] + 0.5) return { x: box[0] - 1.8 + dx, y, anchor: 'end' };
      return { x: box[2] + 1.8 + dx, y, anchor: 'start' };
    }
    // Altından hat çıkan sembolde (dozatron emişi) kod ve not gövdenin üstüne yazılır
    if (def.tagAbove && !vertical && !item.rot) {
      return { x: (box[0] + box[2]) / 2 + dx, y: box[1] - 1.6 - (item.note ? 3 : 0) + dy, anchor: 'middle' };
    }
    return { x: (box[0] + box[2]) / 2 + dx, y: box[3] + 3.4 + dy, anchor: 'middle' };
  }

  function renderSymbol(source, ctx) {
    const def = Sym.get(source.symbol);
    if (!def) return '';
    // Varsayılan adlar (PROSES TANKI, DRENAJ...) belge dilinde yazılır
    const note = source.note ? Sym.localNote(source.note, ctx.lang) : source.note;
    const item = note === source.note ? source : Object.assign({}, source, { note });
    const k = item.scale && item.scale !== 1 && !def.resizable ? item.scale : 1;
    const transform = `translate(${n(item.x)} ${n(item.y)}) rotate(${item.rot || 0})${k !== 1 ? ` scale(${k})` : ''}${item.flip ? ' scale(-1 1)' : ''}`;
    let out = `<g transform="${transform}" fill="none" stroke="currentColor" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round">${Sym.resolveBody(def, item)}</g>`;

    for (const t of Sym.resolveTexts(def, item, ctx.lang)) {
      if (!t.t) continue;
      const w = Model.toWorld(item, t.x, t.y);
      out += textEl(w.x, w.y, t.t, { size: t.s * k, bold: t.b, anchor: 'middle', middle: true });
    }

    // Kodu yazılmayan semboller (sepet, drenaj gibi) de kod verilince kodunu gösterir
    if (def.tag !== 'inside-symbol' && item.tag) {
      const pos = tagPlacement(item, def);
      const size = def.tag === 'inside' ? 3.6 : 3;
      out += `<g data-label="tag">${textEl(pos.x, pos.y, item.tag, { size, bold: true, anchor: pos.anchor })}</g>`;
      if (item.note && def.tag === 'inside') {
        out += textEl(pos.x, pos.y + 3.6, item.note, { size: 2.8, anchor: pos.anchor });
      }
    } else if (def.tag === 'inside' && item.note) {
      const pos = tagPlacement(item, def);
      out += textEl(pos.x, pos.y, item.note, { size: 3, bold: true, anchor: pos.anchor });
    }
    if (item.note && def.tag === 'below') {
      const pos = tagPlacement(item, def);
      out += textEl(pos.x, pos.y + (item.tag ? 3 : 0), item.note, { size: 2.3, anchor: pos.anchor });
    }
    if (item.note && def.isInstrument) {
      const box = Model.boxOf(item);
      out += textEl((box[0] + box[2]) / 2, box[3] + 3, item.note, { size: 2.3, anchor: 'middle' });
    }

    if (ctx.interactive) {
      const box = Model.boxOf(item);
      const pad = 0.6;
      const contained = def.container;
      out += `<rect class="hit${contained ? ' hit-container' : ''}" x="${n(box[0] - pad)}" y="${n(box[1] - pad)}" width="${n(box[2] - box[0] + pad * 2)}" height="${n(box[3] - box[1] + pad * 2)}" fill="transparent" stroke="none"/>`;
    }
    return out;
  }

  function renderText(item, ctx) {
    const size = item.size || 3.5;
    const anchor = item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : 'start';
    const lines = String(item.text || '').split('\n');
    let out = '';
    lines.forEach((line, i) => {
      out += textEl(item.x, item.y + i * size * 1.25, line, { size, bold: item.bold, anchor });
    });
    if (ctx.interactive) {
      const b = Model.boxOf(item);
      out += `<rect class="hit" x="${n(b[0])}" y="${n(b[1])}" width="${n(b[2] - b[0])}" height="${n(b[3] - b[1])}" fill="transparent" stroke="none"/>`;
    }
    return out;
  }

  /* ─── Lejant ──────────────────────────────────────────── */

  function legendRows(sheet, lang) {
    const kinds = [];
    const symbols = [];
    for (const it of sheet.items) {
      if (Model.isLine(it) && !kinds.includes(it.kind)) kinds.push(it.kind);
      if (Model.isSymbol(it)) {
        const def = Sym.get(it.symbol);
        if (def && !def.hidden && !symbols.includes(it.symbol)) symbols.push(it.symbol);
      }
    }
    const rows = [];
    for (const k of Object.keys(Sym.LINE_KINDS)) {
      if (kinds.includes(k)) rows.push({ type: 'line', kind: k, label: Sym.LINE_KINDS[k].name[lang] || Sym.LINE_KINDS[k].name.tr });
    }
    for (const def of Sym.all()) {
      if (symbols.includes(def.id)) rows.push({ type: 'symbol', id: def.id, label: def.name[lang] || def.name.tr });
    }
    return rows;
  }

  function legendSample(row, cx, cy) {
    if (row.type === 'line') {
      const meta = Sym.LINE_KINDS[row.kind];
      let out = `<path d="M${n(cx - 6)} ${n(cy)}H${n(cx + 6)}" stroke="currentColor" fill="none" stroke-width="${meta.width}"${meta.dash ? ` stroke-dasharray="${meta.dash}"` : ''}/>`;
      if (meta.ticks) out += `<path d="M${n(cx - 1.5)} ${n(cy + 1.2)}L${n(cx - 0.3)} ${n(cy - 1.2)}M${n(cx + 0.3)} ${n(cy + 1.2)}L${n(cx + 1.5)} ${n(cy - 1.2)}" stroke="currentColor" stroke-width="0.25"/>`;
      if (meta.beads) out += `<circle cx="${n(cx)}" cy="${n(cy)}" r="0.7" fill="#fff" stroke="currentColor" stroke-width="0.2"/>`;
      return out;
    }
    const def = Sym.get(row.id);
    const sample = { w: 16, h: def.keepAspect ? 16 : 10, func: def.isInstrument ? (def.defaultFunc || '') : '', tag: '', note: '' };
    const b = Sym.boxOf(def, sample);
    const k = Math.min(11 / (b[2] - b[0]), 3.9 / (b[3] - b[1]), 0.7);
    const ox = cx - ((b[0] + b[2]) / 2) * k;
    const oy = cy - ((b[1] + b[3]) / 2) * k;
    return `<g transform="translate(${n(ox)} ${n(oy)}) scale(${n(k)})" fill="none" stroke="currentColor" stroke-width="0.4" stroke-linecap="round" stroke-linejoin="round">${Sym.resolveBody(def, sample)}</g>`;
  }

  function renderLegend(item, sheet, ctx) {
    const lang = ctx.lang || 'tr';
    const t = TEXT[lang] || TEXT.tr;
    const rows = legendRows(sheet, lang);
    const rowH = 4.7;
    const colW = 54;
    const maxRows = 17;
    const headH = 6;
    const footH = 8.4;
    const columns = Math.max(1, Math.ceil(rows.length / maxRows));
    const perCol = rows.length ? Math.ceil(rows.length / columns) : 0;
    const w = colW * columns;
    const h = headH + perCol * rowH + footH + 1;
    item.w = w;
    item.h = h;
    // Lejant sayfa dışına taşmasın
    const area = geometry(sheet).inner;
    item.x = Math.max(area.x0 + 1, Math.min(item.x, area.x1 - w - 1));
    item.y = Math.max(area.y0 + 1, Math.min(item.y, area.y1 - h - 1));

    const parts = [`<rect x="${n(item.x)}" y="${n(item.y)}" width="${w}" height="${n(h)}" fill="#fff" stroke="${INK}" stroke-width="0.35"/>`];
    parts.push(textEl(item.x + 2, item.y + 4.4, t.legend, { size: 3, bold: true, fill: INK }));
    parts.push(`<path d="M${n(item.x)} ${n(item.y + headH)}H${n(item.x + w)}" stroke="${INK}" stroke-width="0.2"/>`);

    rows.forEach((row, i) => {
      const col = Math.floor(i / perCol);
      const r = i % perCol;
      const rx = item.x + col * colW;
      const cy = item.y + headH + r * rowH + rowH / 2;
      parts.push(`<g color="${INK}">${legendSample(row, rx + 9, cy)}</g>`);
      parts.push(textEl(rx + 16, cy, row.label, { size: 2.3, fill: INK, middle: true }));
    });

    const fy = item.y + h - footH;
    parts.push(`<path d="M${n(item.x)} ${n(fy)}H${n(item.x + w)}" stroke="${INK}" stroke-width="0.2"/>`);
    parts.push(textEl(item.x + 2, fy + 3.4, t.standardNote, { size: 2.3, fill: INK }));
    parts.push(textEl(item.x + 2, fy + 7, t.optionNote, { size: 2.3, fill: OPTION_COLOR }));

    if (ctx.interactive) {
      parts.push(`<rect class="hit" x="${n(item.x)}" y="${n(item.y)}" width="${w}" height="${n(h)}" fill="transparent" stroke="none"/>`);
    }
    return parts.join('');
  }

  /* ─── Hatlar ──────────────────────────────────────────── */

  const HOP_R = 1;

  /** Yatay parçalar, düşey hatları kesişimde kavisle atlar */
  function computeHops(sheet) {
    const lines = sheet.items.filter((it) => Model.isLine(it) && it.path);
    const verticals = [];
    for (const l of lines) {
      for (let i = 0; i < l.path.length - 1; i += 1) {
        const [x0, y0] = l.path[i];
        const [x1, y1] = l.path[i + 1];
        if (Math.abs(x0 - x1) < 1e-6) verticals.push({ line: l.id, x: x0, lo: Math.min(y0, y1), hi: Math.max(y0, y1) });
      }
    }
    const hops = new Map();
    for (const l of lines) {
      for (let i = 0; i < l.path.length - 1; i += 1) {
        const [x0, y0] = l.path[i];
        const [x1, y1] = l.path[i + 1];
        if (Math.abs(y0 - y1) > 1e-6) continue;
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        for (const v of verticals) {
          if (v.line === l.id) continue;
          if (v.x > lo + HOP_R * 1.5 && v.x < hi - HOP_R * 1.5 && y0 > v.lo + 0.1 && y0 < v.hi - 0.1) {
            const key = `${l.id}:${i}`;
            if (!hops.has(key)) hops.set(key, []);
            hops.get(key).push(v.x);
          }
        }
      }
    }
    return hops;
  }

  function linePathData(line, hops) {
    const path = line.path;
    let d = `M${n(path[0][0])} ${n(path[0][1])}`;
    for (let i = 0; i < path.length - 1; i += 1) {
      const [x0, y0] = path[i];
      const [x1, y1] = path[i + 1];
      const crossings = hops && hops.get(`${line.id}:${i}`);
      if (crossings && crossings.length) {
        const dir = x1 >= x0 ? 1 : -1;
        const ordered = crossings.slice().sort((a, b) => (a - b) * dir);
        for (const cx of ordered) {
          d += `L${n(cx - HOP_R * dir)} ${n(y0)}A${HOP_R} ${HOP_R} 0 0 ${dir > 0 ? 1 : 0} ${n(cx + HOP_R * dir)} ${n(y0)}`;
        }
      }
      d += `L${n(x1)} ${n(y1)}`;
    }
    return d;
  }

  function samplesAlong(path, spacing) {
    const out = [];
    let remain = spacing / 2;
    for (let i = 0; i < path.length - 1; i += 1) {
      const [x0, y0] = path[i];
      const [x1, y1] = path[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      let at = remain;
      while (at < len) {
        const u = at / len;
        out.push({ x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u, horizontal: Math.abs(y0 - y1) < 1e-6 });
        at += spacing;
      }
      remain = at - len;
    }
    return out;
  }

  function arrowHead(x, y, dx, dy, size) {
    const s = size || 2.4;
    const hw = s * 0.42;
    return `<path d="M${n(x)} ${n(y)}L${n(x - dx * s - dy * hw)} ${n(y - dy * s + dx * hw)}L${n(x - dx * s + dy * hw)} ${n(y - dy * s - dx * hw)}Z" fill="currentColor" stroke="none"/>`;
  }

  function longestSegment(path) {
    let best = 0;
    let len = -1;
    for (let i = 0; i < path.length - 1; i += 1) {
      const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      if (l > len) {
        len = l;
        best = i;
      }
    }
    return { index: best, length: len };
  }

  function renderLine(line, hops, ctx) {
    if (!line.path || line.path.length < 2) return '';
    const meta = Sym.LINE_KINDS[line.kind] || Sym.LINE_KINDS.process;
    const d = linePathData(line, hops);
    let out = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${meta.width}" stroke-linejoin="miter"${meta.dash ? ` stroke-dasharray="${meta.dash}"` : ''}/>`;

    if (meta.ticks) {
      for (const s of samplesAlong(line.path, 22)) {
        out += s.horizontal
          ? `<path d="M${n(s.x - 1.1)} ${n(s.y + 1.2)}L${n(s.x - 0.1)} ${n(s.y - 1.2)}M${n(s.x + 0.1)} ${n(s.y + 1.2)}L${n(s.x + 1.1)} ${n(s.y - 1.2)}" stroke="currentColor" stroke-width="0.25" fill="none"/>`
          : `<path d="M${n(s.x - 1.2)} ${n(s.y + 1.1)}L${n(s.x + 1.2)} ${n(s.y + 0.1)}M${n(s.x - 1.2)} ${n(s.y - 0.1)}L${n(s.x + 1.2)} ${n(s.y - 1.1)}" stroke="currentColor" stroke-width="0.25" fill="none"/>`;
      }
    }
    if (meta.beads) {
      for (const s of samplesAlong(line.path, 12)) {
        out += `<circle cx="${n(s.x)}" cy="${n(s.y)}" r="0.65" fill="#fff" stroke="currentColor" stroke-width="0.2"/>`;
      }
    }

    const longest = longestSegment(line.path);
    const a = line.path[longest.index];
    const b = line.path[longest.index + 1];
    const ux = longest.length ? (b[0] - a[0]) / longest.length : 1;
    const uy = longest.length ? (b[1] - a[1]) / longest.length : 0;

    if (line.arrow === 'mid' && longest.length > 8) {
      const arrowSize = meta.width >= 0.6 ? 3 : 2.4;
      out += arrowHead((a[0] + b[0]) / 2 + ux * 1.5, (a[1] + b[1]) / 2 + uy * 1.5, ux, uy, arrowSize);
    } else if (line.arrow === 'end') {
      const last = line.path[line.path.length - 1];
      const prev = line.path[line.path.length - 2];
      const len = Math.hypot(last[0] - prev[0], last[1] - prev[1]) || 1;
      out += arrowHead(last[0], last[1], (last[0] - prev[0]) / len, (last[1] - prev[1]) / len, 2.6);
    }

    if (line.label) {
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const horizontal = Math.abs(a[1] - b[1]) < 1e-6;
      out += horizontal
        ? textEl(mx, my - 1.4, line.label, { size: 2.5, anchor: 'middle' })
        : textEl(mx + 1.4, my, line.label, { size: 2.5, middle: true });
    }

    if (ctx.interactive) {
      out += `<path class="hit-line" d="${d}" fill="none" stroke="transparent" stroke-width="3"/>`;
    }
    return out;
  }

  const colorOf = (item) => (item.optional ? OPTION_COLOR : INK);

  function layerOf(item) {
    if (item.optional) return 'option';
    if (Model.isLine(item)) return (Sym.LINE_KINDS[item.kind] || {}).layer || 'process';
    if (Model.isSymbol(item)) return (Sym.get(item.symbol) || {}).layer || 'process';
    return 'process';
  }

  /** Kullanıcı dışında kalan sayfa tamamı: dışa aktarım için bağımsız SVG */
  function renderSheetBody(project, drawing, index, ctx) {
    const sheet = drawing.sheets[index];
    const hidden = ctx.hiddenLayers || {};
    const hops = computeHops(sheet);
    const lines = [];
    const symbols = [];
    for (const it of sheet.items) {
      const layer = layerOf(it);
      if (hidden[layer]) continue;
      if (Model.isLine(it)) {
        lines.push(`<g color="${colorOf(it)}">${renderLine(it, hops, ctx)}</g>`);
      } else if (Model.isSymbol(it)) {
        symbols.push(`<g color="${colorOf(it)}">${renderSymbol(it, ctx)}</g>`);
      } else if (it.type === 'text') {
        symbols.push(`<g color="${colorOf(it)}">${renderText(it, ctx)}</g>`);
      } else if (it.type === 'legend') {
        symbols.push(renderLegend(it, sheet, ctx));
      }
    }
    const Rev = typeof PidRevisions !== 'undefined' ? PidRevisions : (typeof require === 'function' ? require('./revisions.js') : null);
    const marks = Rev && !hidden.rev ? Rev.renderMarks(drawing, sheet) : '';
    return renderFrame(project, sheet, index, drawing.sheets.length, ctx) + lines.join('') + symbols.join('') + marks;
  }

  function sheetSvg(project, drawing, index, opts) {
    const sheet = drawing.sheets[index];
    const [W, H] = sizeOf(sheet);
    const ctx = Object.assign({ lang: project.dil || 'tr', interactive: false }, opts);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="${FONT}" style="font-variant-ligatures:none">` +
      `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>` +
      renderSheetBody(project, drawing, index, ctx) +
      '</svg>';
  }

  return {
    SIZES,
    TEXT,
    OPTION_COLOR,
    INK,
    esc,
    geometry,
    sizeOf,
    formatDate,
    colorOf,
    layerOf,
    computeHops,
    renderFrame,
    renderSymbol,
    renderText,
    renderLegend,
    renderLine,
    renderSheetBody,
    sheetSvg
  };
});
