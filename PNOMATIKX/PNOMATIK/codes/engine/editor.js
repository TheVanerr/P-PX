/* Çizim alanı: görünüm, seçim, taşıma, hat çizimi, geri alma (P&IDX çizim motoruyla aynı). */

class PidEditor {
  constructor(svg, host) {
    this.svg = svg;
    this.host = host;
    this.project = null;
    this.drawing = null;
    this.sheetIndex = 0;
    this.ctx = { interactive: true, lang: 'tr', brands: {}, titleLogo: null, brandLogo: null };
    this.view = { k: 2, tx: 40, ty: 40 };
    this.tool = 'select';
    this.lineKind = 'work';
    this.snap = true;
    this.showGrid = true;
    this.hidden = {};
    this.selection = new Set();
    this.placing = null;
    this.draft = null;
    this.drag = null;
    this.hover = null;
    this.guides = [];
    this.undoStack = [];
    this.redoStack = [];
    this.clipboard = null;
    this.spaceDown = false;
    this.rightUpAt = -Infinity;
    this.els = new Map();
    this.lastPos = { x: 0, y: 0 };
    this.buildDom();
    this.bindEvents();
  }

  /* ─── Kurulum ─────────────────────────────────────────── */

  buildDom() {
    this.svg.innerHTML =
      '<defs><pattern id="pidGrid" width="5" height="5" patternUnits="userSpaceOnUse">' +
      '<path d="M5 0H0V5" fill="none" stroke="#e3e6ec" stroke-width="0.1"/></pattern></defs>' +
      '<g class="v-root"><g class="v-paper"></g><g class="v-grid"></g><g class="v-frame"></g>' +
      '<g class="v-containers"></g><g class="v-lines"></g><g class="v-items"></g><g class="v-over"></g></g>';
    this.gRoot = this.svg.querySelector('.v-root');
    this.gPaper = this.svg.querySelector('.v-paper');
    this.gGrid = this.svg.querySelector('.v-grid');
    this.gFrame = this.svg.querySelector('.v-frame');
    this.gContainers = this.svg.querySelector('.v-containers');
    this.gLines = this.svg.querySelector('.v-lines');
    this.gItems = this.svg.querySelector('.v-items');
    this.gOver = this.svg.querySelector('.v-over');
  }

  get sheet() {
    return this.drawing ? this.drawing.sheets[this.sheetIndex] : null;
  }

  load(project, drawing, ctx) {
    this.project = project;
    this.drawing = drawing;
    this.sheetIndex = 0;
    // Yolu kayıtlı olmayan hatlar açılışta hesaplanır
    for (const sheet of drawing.sheets) {
      for (const it of sheet.items) {
        if (PidModel.isLine(it) && !it.path) PidModel.refreshLine(sheet, it);
      }
    }
    Object.assign(this.ctx, ctx, { lang: project.dil || 'tr', showPid: project.pidEtiket !== false });
    this.selection.clear();
    this.undoStack = [JSON.stringify(drawing.sheets)];
    this.redoStack = [];
    this.placing = null;
    this.draft = null;
    this.renderAll();
    this.fit();
    this.host.onHistory();
    this.host.onSelection();
  }

  /** Yarım kalan hat, sürükleme ve vurgu başka sayfaya taşınmaz: uçları o sayfadaki öğelere bağlıdır */
  resetTransient() {
    this.draft = null;
    this.drag = null;
    this.hover = null;
    this.guides = [];
    this.updateCursor();
  }

  setSheet(index) {
    if (index < 0 || index >= this.drawing.sheets.length) return;
    this.sheetIndex = index;
    this.selection.clear();
    this.resetTransient();
    this.renderAll();
    this.fit();
    this.host.onSelection();
    this.host.onSheets();
  }

  /* ─── Görünüm ─────────────────────────────────────────── */

  applyView() {
    const { k, tx, ty } = this.view;
    this.gRoot.setAttribute('transform', `translate(${tx} ${ty}) scale(${k})`);
    this.host.onZoom(k);
    this.renderOverlay();
    this.gGrid.style.display = this.showGrid && k >= 1.1 ? '' : 'none';
  }

  fit() {
    const rect = this.svg.getBoundingClientRect();
    if (!rect.width || !this.sheet) return;
    const [W, H] = PidSheet.sizeOf(this.sheet);
    const pad = 22;
    const k = Math.min((rect.width - pad * 2) / W, (rect.height - pad * 2) / H);
    this.view = { k, tx: (rect.width - W * k) / 2, ty: (rect.height - H * k) / 2 };
    this.applyView();
  }

  zoomAt(factor, cx, cy) {
    const rect = this.svg.getBoundingClientRect();
    const px = cx === undefined ? rect.width / 2 : cx;
    const py = cy === undefined ? rect.height / 2 : cy;
    const k = Math.max(0.3, Math.min(30, this.view.k * factor));
    const f = k / this.view.k;
    this.view = { k, tx: px - (px - this.view.tx) * f, ty: py - (py - this.view.ty) * f };
    this.applyView();
  }

  toMm(e) {
    const rect = this.svg.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.view.tx) / this.view.k,
      y: (e.clientY - rect.top - this.view.ty) / this.view.k
    };
  }

  snapValue(v, force) {
    if (!this.snap || force === false) return Math.round(v * 100) / 100;
    return Math.round(v / 2.5) * 2.5;
  }

  /* ─── Çizim ───────────────────────────────────────────── */

  renderAll() {
    if (!this.sheet) return;
    this.renderPaper();
    this.gContainers.innerHTML = '';
    this.gLines.innerHTML = '';
    this.gItems.innerHTML = '';
    this.els.clear();
    PidModel.updateJunctionDots(this.sheet);
    for (const it of this.sheet.items) if (!PidModel.isLine(it)) this.renderItem(it);
    this.renderLines();
    this.renderOverlay();
    this.applyLayerClasses();
  }

  renderPaper() {
    const [W, H] = PidSheet.sizeOf(this.sheet);
    const g = PidSheet.geometry(this.sheet);
    this.gPaper.innerHTML =
      `<rect x="1.2" y="1.6" width="${W}" height="${H}" fill="#000" opacity="0.28"/>` +
      `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`;
    this.gGrid.innerHTML = `<rect x="${g.inner.x0}" y="${g.inner.y0}" width="${g.inner.x1 - g.inner.x0}" height="${g.inner.y1 - g.inner.y0}" fill="url(#pidGrid)"/>`;
    this.gFrame.innerHTML = PidSheet.renderFrame(this.project, this.sheet, this.sheetIndex, this.drawing.sheets.length, this.ctx);
  }

  groupFor(item) {
    let el = this.els.get(item.id);
    if (!el) {
      el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      el.setAttribute('data-id', item.id);
      this.els.set(item.id, el);
      let parent = this.gItems;
      if (PidModel.isLine(item)) parent = this.gLines;
      else if (PidModel.isSymbol(item) && (PidSymbols.get(item.symbol) || {}).container) parent = this.gContainers;
      parent.appendChild(el);
    }
    el.setAttribute('color', PidSheet.colorOf(item));
    el.setAttribute('class', `layer-${PidSheet.layerOf(item)}`);
    return el;
  }

  renderItem(item) {
    const el = this.groupFor(item);
    if (PidModel.isSymbol(item)) el.innerHTML = PidSheet.renderSymbol(item, this.ctx);
    else if (item.type === 'text') el.innerHTML = PidSheet.renderText(item, this.ctx);
    else if (item.type === 'legend') el.innerHTML = PidSheet.renderLegend(item, this.sheet, this.ctx);
  }

  renderLines(ids) {
    const hops = PidSheet.computeHops(this.sheet);
    const list = ids
      ? ids.map((id) => PidModel.findItem(this.sheet, id)).filter(Boolean)
      : this.sheet.items.filter(PidModel.isLine);
    for (const line of list) {
      this.groupFor(line).innerHTML = PidSheet.renderLine(line, hops, this.ctx);
    }
  }

  removeStaleEls() {
    const alive = new Set(this.sheet.items.map((it) => it.id));
    for (const [id, el] of this.els) {
      if (!alive.has(id)) {
        el.remove();
        this.els.delete(id);
      }
    }
  }

  refreshLegend() {
    for (const it of this.sheet.items) if (it.type === 'legend') this.renderItem(it);
  }

  applyLayerClasses() {
    for (const layer of ['pneu', 'elec', 'option']) {
      this.svg.classList.toggle(`hide-${layer}`, !!this.hidden[layer]);
    }
  }

  setLayerHidden(layer, hidden) {
    this.hidden[layer] = hidden;
    this.applyLayerClasses();
  }

  setGrid(on) {
    this.showGrid = on;
    this.applyView();
  }

  /** Antet alanları değişince */
  refreshFrame() {
    this.ctx.lang = this.project.dil || 'tr';
    this.renderAll();
  }

  /* ─── Üst katman: seçim, portlar, kılavuzlar ──────────── */

  renderOverlay() {
    if (!this.sheet) return;
    const px = 1 / this.view.k;
    const parts = [];
    const blue = '#2563eb';

    for (const g of this.guides) {
      parts.push(`<path d="${g}" stroke="#ec4899" stroke-width="${px}" fill="none" stroke-dasharray="${4 * px} ${3 * px}"/>`);
    }

    const single = this.selection.size === 1 ? PidModel.findItem(this.sheet, [...this.selection][0]) : null;

    for (const id of this.selection) {
      const it = PidModel.findItem(this.sheet, id);
      if (!it) continue;
      if (PidModel.isLine(it)) {
        const d = it.path.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');
        parts.push(`<path d="${d}" fill="none" stroke="${blue}" stroke-width="${Math.max(1.1, 3 * px)}" opacity="0.35" pointer-events="none"/>`);
      } else {
        const b = PidModel.boxOf(it);
        const pad = 1;
        parts.push(`<rect x="${b[0] - pad}" y="${b[1] - pad}" width="${b[2] - b[0] + pad * 2}" height="${b[3] - b[1] + pad * 2}" fill="none" stroke="${blue}" stroke-width="${1.2 * px}" stroke-dasharray="${4 * px} ${3 * px}" pointer-events="none"/>`);
      }
    }

    if (single && PidModel.isLine(single)) {
      parts.push(...this.lineHandles(single, px));
    }
    if (single && PidModel.isSymbol(single) && (PidSymbols.get(single.symbol) || {}).resizable) {
      parts.push(...this.resizeHandles(single, px));
    }

    parts.push(...this.portMarks(px));

    if (this.draft && this.draft.preview) {
      const d = this.draft.preview.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');
      parts.push(`<path d="${d}" fill="none" stroke="${blue}" stroke-width="${Math.max(0.5, 2 * px)}" pointer-events="none"/>`);
    }

    if (this.drag && this.drag.type === 'box' && this.drag.rect) {
      const r = this.drag.rect;
      parts.push(`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="rgba(37,99,235,0.1)" stroke="${blue}" stroke-width="${px}" pointer-events="none"/>`);
    }

    if (this.placing && this.placing.ghost) {
      parts.push(this.placing.ghost);
    }

    this.gOver.innerHTML = parts.join('');
  }

  lineHandles(line, px) {
    const out = [];
    const s = 5 * px;
    const handle = (x, y, name, shape) => (shape === 'round'
      ? `<circle data-handle="${name}" cx="${x}" cy="${y}" r="${s}" fill="#fff" stroke="#2563eb" stroke-width="${1.5 * px}" style="cursor:move"/>`
      : `<rect data-handle="${name}" x="${x - s * 0.8}" y="${y - s * 0.8}" width="${s * 1.6}" height="${s * 1.6}" fill="#2563eb" stroke="#fff" stroke-width="${px}" style="cursor:${shape}"/>`);
    const path = line.path;
    for (let i = 0; i < path.length - 1; i += 1) {
      const horizontal = Math.abs(path[i][1] - path[i + 1][1]) < 1e-6;
      const len = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      if (len < 6) continue;
      out.push(handle((path[i][0] + path[i + 1][0]) / 2, (path[i][1] + path[i + 1][1]) / 2, `seg:${i}`, horizontal ? 'ns-resize' : 'ew-resize'));
    }
    out.push(handle(path[0][0], path[0][1], 'end:from', 'round'));
    out.push(handle(path[path.length - 1][0], path[path.length - 1][1], 'end:to', 'round'));
    return out;
  }

  resizeHandles(item, px) {
    const b = PidModel.boxOf(item);
    const s = 5 * px;
    const cx = (b[0] + b[2]) / 2;
    const cy = (b[1] + b[3]) / 2;
    const points = {
      nw: [b[0], b[1]], n: [cx, b[1]], ne: [b[2], b[1]], e: [b[2], cy],
      se: [b[2], b[3]], s: [cx, b[3]], sw: [b[0], b[3]], w: [b[0], cy]
    };
    const cursors = { nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw', n: 'ns', s: 'ns', e: 'ew', w: 'ew' };
    return Object.entries(points).map(([name, [x, y]]) =>
      `<rect data-handle="resize:${name}" x="${x - s}" y="${y - s}" width="${s * 2}" height="${s * 2}" fill="#fff" stroke="#2563eb" stroke-width="${1.5 * px}" style="cursor:${cursors[name]}-resize"/>`);
  }

  portMarks(px) {
    const out = [];
    const r = 3.5 * px;
    const showFor = new Set();
    if (this.hover && this.hover.node) showFor.add(this.hover.node);
    if (this.tool === 'line' || this.draft || (this.drag && this.drag.type === 'lineEnd')) {
      for (const it of this.sheet.items) {
        if (PidModel.isSymbol(it) && !(PidSymbols.get(it.symbol) || {}).hidden) showFor.add(it.id);
      }
    }
    for (const id of showFor) {
      const it = PidModel.findItem(this.sheet, id);
      if (!it || !PidModel.isSymbol(it)) continue;
      for (const p of PidModel.portsOf(it)) {
        out.push(`<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#fff" stroke="#2563eb" stroke-width="${1.2 * px}" pointer-events="none"/>`);
      }
    }
    if (this.hover && this.hover.point) {
      out.push(`<circle cx="${this.hover.point.x}" cy="${this.hover.point.y}" r="${r * 1.7}" fill="#2563eb" stroke="#fff" stroke-width="${1.2 * px}" pointer-events="none"/>`);
    }
    if (this.hover && this.hover.lineId) {
      const line = PidModel.findItem(this.sheet, this.hover.lineId);
      if (line) {
        const d = line.path.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');
        out.push(`<path d="${d}" fill="none" stroke="#2563eb" stroke-width="${Math.max(0.9, 2.5 * px)}" opacity="0.4" pointer-events="none"/>`);
      }
    }
    return out;
  }

  /* ─── Geçmiş ──────────────────────────────────────────── */

  commit() {
    PidModel.updateJunctionDots(this.sheet);
    this.undoStack.push(JSON.stringify(this.drawing.sheets));
    if (this.undoStack.length > 150) this.undoStack.shift();
    this.redoStack = [];
    this.refreshLegend();
    this.host.onChange();
    this.host.onHistory();
  }

  /**
   * Geçmişten dönerken açık sayfa sırasına göre değil kimliğine göre korunur.
   * Değişiklik başka sayfadaysa o sayfaya geçilir; yoksa geri alma hiçbir şey yapmamış gibi görünür.
   */
  restore(snapshot) {
    const open = this.sheet;
    const before = new Map(this.drawing.sheets.map((s) => [s.id, s]));
    const next = JSON.parse(snapshot);
    // Lejant ölçüleri çizerken hesaplanır, değişiklik sayılmaz
    const content = (s) => JSON.stringify(Object.assign({}, s, { items: s.items.filter((it) => it.type !== 'legend') }));
    const changed = (s) => !before.has(s.id) || content(s) !== content(before.get(s.id));
    let index = open ? next.findIndex((s) => s.id === open.id) : -1;
    if (index < 0 || !changed(next[index])) {
      const other = next.findIndex(changed);
      if (other >= 0) index = other;
    }
    if (index < 0) index = Math.min(this.sheetIndex, next.length - 1);
    const moved = !open || next[index].id !== open.id;
    const resized = !moved && next[index].size !== open.size;
    this.drawing.sheets = next;
    this.sheetIndex = index;
    this.selection.clear();
    this.resetTransient();
    this.renderAll();
    if (moved || resized) this.fit();
    this.host.onChange();
    this.host.onHistory();
    this.host.onSelection();
    this.host.onSheets();
  }

  undo() {
    if (this.undoStack.length < 2) return;
    this.redoStack.push(this.undoStack.pop());
    this.restore(this.undoStack[this.undoStack.length - 1]);
  }

  redo() {
    if (!this.redoStack.length) return;
    const snap = this.redoStack.pop();
    this.undoStack.push(snap);
    this.restore(snap);
  }

  /* ─── Seçim yardımcıları ──────────────────────────────── */

  selectedItems() {
    return [...this.selection].map((id) => PidModel.findItem(this.sheet, id)).filter(Boolean);
  }

  setSelection(ids) {
    this.selection = new Set(ids);
    this.renderOverlay();
    this.host.onSelection();
  }

  focusItem(sheetId, itemId) {
    const index = this.drawing.sheets.findIndex((s) => s.id === sheetId);
    if (index >= 0 && index !== this.sheetIndex) this.setSheet(index);
    if (!itemId) return;
    const it = PidModel.findItem(this.sheet, itemId);
    if (!it) return;
    this.setSelection([itemId]);
    const b = PidModel.boxOf(it);
    const rect = this.svg.getBoundingClientRect();
    const k = Math.max(this.view.k, 3);
    this.view = {
      k,
      tx: rect.width / 2 - ((b[0] + b[2]) / 2) * k,
      ty: rect.height / 2 - ((b[1] + b[3]) / 2) * k
    };
    this.applyView();
  }

  setTool(tool) {
    this.tool = tool;
    this.cancelPlacing();
    this.draft = null;
    this.updateCursor();
    this.renderOverlay();
    this.host.onTool(tool);
  }

  setLineKind(kind) {
    this.lineKind = kind;
  }

  updateCursor() {
    const c = this.svg.classList;
    c.remove('cur-grab', 'cur-grabbing', 'cur-cross', 'cur-text', 'cur-move');
    if (this.drag && this.drag.type === 'pan' && (this.drag.button !== 2 || this.drag.moved)) c.add('cur-grabbing');
    else if (this.spaceDown) c.add('cur-grab');
    else if (this.placing || this.tool === 'line' || this.draft) c.add('cur-cross');
    else if (this.tool === 'text') c.add('cur-text');
  }

  /* ─── Sembol yerleştirme ──────────────────────────────── */

  startPlacing(spec) {
    if (this.tool !== 'select') this.setTool('select');
    this.placing = Object.assign({ rot: 0, flip: false, keep: false, ghost: '' }, spec);
    this.updateCursor();
    this.host.onPlacing(this.placing);
    this.updateGhost(this.lastPos);
  }

  cancelPlacing() {
    if (!this.placing) return;
    this.placing = null;
    this.hover = null;
    this.updateCursor();
    this.renderOverlay();
    this.host.onPlacing(null);
  }

  placementAt(pos) {
    const def = PidSymbols.get(this.placing.symbol);
    const result = { x: this.snapValue(pos.x), y: this.snapValue(pos.y), rot: this.placing.rot, line: null };
    if (def.inline && def.ports.length >= 2) {
      const hit = PidModel.hitLine(this.sheet, pos.x, pos.y, Math.max(2.5, 8 / this.view.k));
      if (hit && hit.near.length > 8) {
        const rotBy = { R: 0, D: 90, L: 180, U: 270 };
        const along = hit.near.horizontal ? { x: this.snapValue(pos.x), y: hit.near.y } : { x: hit.near.x, y: this.snapValue(pos.y) };
        result.x = along.x;
        result.y = along.y;
        result.rot = rotBy[hit.near.dir];
        result.line = hit.line;
      }
    }
    return result;
  }

  /** Bırakılan kodu veya sensörü alabilecek en üstteki sembol (spec.accepts) */
  dropTargetAt(pos) {
    const spec = this.placing;
    if (!spec || typeof spec.accepts !== 'function' || !this.sheet) return null;
    const items = this.sheet.items;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      const it = items[i];
      if (!PidModel.isSymbol(it)) continue;
      const def = PidSymbols.get(it.symbol);
      if (!def || def.hidden || def.container) continue;
      const b = PidModel.boxOf(it);
      if (pos.x < b[0] - 1 || pos.x > b[2] + 1 || pos.y < b[1] - 1 || pos.y > b[3] + 1) continue;
      if (spec.accepts(it, def)) return it;
    }
    return null;
  }

  /** Bırakılınca bağlanacak sembolün çerçevesi */
  dropMark(item) {
    const b = PidModel.boxOf(item);
    const px = 1 / this.view.k;
    const pad = 1.2;
    return `<rect x="${b[0] - pad}" y="${b[1] - pad}" width="${b[2] - b[0] + pad * 2}" height="${b[3] - b[1] + pad * 2}" rx="1" fill="rgba(37,99,235,0.1)" stroke="#2563eb" stroke-width="${1.6 * px}" pointer-events="none"/>`;
  }

  /** İmlecin yanında kısa açıklama; ekranda sabit boyutta kalır */
  noteMark(pos, text) {
    if (!text) return '';
    const px = 1 / this.view.k;
    const x = pos.x + 14 * px;
    const y = pos.y + 10 * px;
    const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<g pointer-events="none"><rect x="${x}" y="${y}" width="${(String(text).length * 6.4 + 14) * px}" height="${19 * px}" rx="${4 * px}" fill="#1d4ed8"/>` +
      `<text x="${x + 7 * px}" y="${y + 13 * px}" font-size="${11.5 * px}" fill="#fff" stroke="none" font-family="Segoe UI, Arial, sans-serif">${safe}</text></g>`;
  }

  updateGhost(pos) {
    if (!this.placing) return;
    const spec = this.placing;
    // Uygun sembolün üstünde: sembol yerine hedef çerçevesi ve ne olacağı gösterilir
    const target = this.dropTargetAt(pos);
    if (target) {
      this.hover = null;
      spec.ghost = this.dropMark(target) + this.noteMark(pos, spec.hint ? spec.hint(target, pos) : '');
      this.renderOverlay();
      return;
    }
    // Kodun şemada bekleyen yeri var: nereye bırakılırsa bırakılsın oraya yazılır
    if (spec.forced) {
      const item = spec.forced.sheetId === this.sheet.id ? PidModel.findItem(this.sheet, spec.forced.itemId) : null;
      this.hover = null;
      spec.ghost = (item ? this.dropMark(item) : '') + this.noteMark(pos, spec.forced.label);
      this.renderOverlay();
      return;
    }
    const place = this.placementAt(pos);
    const temp = Object.assign({
      id: '__ghost',
      type: 'symbol',
      symbol: this.placing.symbol,
      x: place.x,
      y: place.y,
      rot: place.rot,
      flip: this.placing.flip,
      tag: this.placing.tag || '',
      note: this.placing.note || (PidSymbols.get(this.placing.symbol).defaultNote || ''),
      optional: false
    }, this.placing.props || {});
    const def = PidSymbols.get(this.placing.symbol);
    if (def.resizable) {
      temp.w = def.defaultSize[0];
      temp.h = def.defaultSize[1];
    }
    this.hover = place.line ? { lineId: place.line.id } : null;
    this.placing.ghost = `<g opacity="0.65" pointer-events="none" color="#2563eb">${PidSheet.renderSymbol(temp, { lang: this.ctx.lang, showPid: this.ctx.showPid })}</g>`;
    this.renderOverlay();
  }

  placeAt(pos) {
    const spec = this.placing;
    // Sembolün üstüne bırakılan kod / sensör o sembole bağlanır; kodun bekleyen yeri varsa oraya yazılır
    const target = this.dropTargetAt(pos);
    let attached = false;
    if (target && typeof spec.attach === 'function') attached = !!spec.attach(target, pos, this.sheet);
    else if (spec.forced && typeof spec.attachForced === 'function') attached = !!spec.attachForced();
    if (attached) {
      if (!spec.keep) this.cancelPlacing();
      else if (this.placing) this.updateGhost(pos);
      return;
    }
    const place = this.placementAt(pos);
    const props = Object.assign({ tag: spec.tag || '' }, JSON.parse(JSON.stringify(spec.props || {})));
    if (spec.note !== undefined) props.note = spec.note;
    props.flip = spec.flip;
    let node;
    if (place.line) {
      node = PidModel.insertInline(this.sheet, place.line.id, spec.symbol, place.x, place.y, props);
      PidModel.refreshAttached(this.sheet, [node.id]);
    } else {
      node = PidModel.addSymbol(this.sheet, spec.symbol, place.x, place.y, Object.assign(props, { rot: place.rot }));
    }
    this.renderItem(node);
    this.renderLines();
    this.selection = new Set([node.id]);
    this.commit();
    this.host.onSelection();
    if (typeof spec.onPlaced === 'function') spec.onPlaced(node);
    if (!spec.keep) {
      this.cancelPlacing();
    } else {
      this.updateGhost(pos);
    }
  }

  /* ─── Hat ucu çözümü ──────────────────────────────────── */

  /** İmlecin altındaki bağlantı: port, ekipman kenarı, hat veya boş nokta */
  resolveAnchor(pos, opts) {
    const options = opts || {};
    const portRadius = Math.max(2.5, 9 / this.view.k);
    let bestPort = null;
    for (const it of this.sheet.items) {
      if (!PidModel.isSymbol(it) || it.id === options.excludeNode) continue;
      for (const p of PidModel.portsOf(it)) {
        const dist = Math.hypot(p.x - pos.x, p.y - pos.y);
        if (dist <= portRadius && (!bestPort || dist < bestPort.dist)) {
          bestPort = { dist, anchor: { node: it.id, port: p.id }, point: { x: p.x, y: p.y }, node: it.id };
        }
      }
    }
    if (bestPort) return bestPort;

    const edgeTol = Math.max(2, 7 / this.view.k);
    for (const it of this.sheet.items) {
      if (!PidModel.isSymbol(it) || it.id === options.excludeNode) continue;
      const def = PidSymbols.get(it.symbol);
      if (!def || !def.resizable || def.noObstacle) continue;
      const b = PidModel.boxOf(it);
      if (pos.x < b[0] - edgeTol || pos.x > b[2] + edgeTol || pos.y < b[1] - edgeTol || pos.y > b[3] + edgeTol) continue;
      const near = PidModel.nearestPerimeter(it, pos.x, pos.y);
      if (near.dist > edgeTol) continue;
      const snapped = this.snapPerimeter(it, near);
      const pt = PidModel.perimeterPoint(it, snapped.side, snapped.t);
      return { anchor: { node: it.id, side: snapped.side, t: snapped.t }, point: { x: pt.x, y: pt.y }, node: it.id };
    }

    if (!options.noLine) {
      const hit = PidModel.hitLine(this.sheet, pos.x, pos.y, Math.max(1.5, 6 / this.view.k), options.excludeLines);
      if (hit) {
        const pt = hit.near.horizontal
          ? { x: this.snapValue(pos.x), y: hit.near.y }
          : { x: hit.near.x, y: this.snapValue(pos.y) };
        return { split: hit.line.id, point: pt, lineId: hit.line.id };
      }
    }

    const free = { x: this.snapValue(pos.x), y: this.snapValue(pos.y) };
    return { anchor: free, point: free };
  }

  snapPerimeter(item, near) {
    if (!this.snap) return near;
    const b = PidModel.boxOf(item);
    const horizontal = near.side === 'T' || near.side === 'B';
    const len = horizontal ? b[2] - b[0] : b[3] - b[1];
    const origin = horizontal ? b[0] : b[1];
    const value = Math.round((origin + len * near.t) / 2.5) * 2.5;
    return { side: near.side, t: Math.round(((value - origin) / len) * 1000) / 1000 };
  }

  materialize(resolved) {
    if (!resolved.split) return resolved.anchor;
    const junction = PidModel.splitLine(this.sheet, resolved.split, resolved.point.x, resolved.point.y);
    this.renderItem(junction);
    return { node: junction.id, port: 'C' };
  }

  /* ─── Olaylar ─────────────────────────────────────────── */

  bindEvents() {
    const svg = this.svg;
    svg.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    svg.addEventListener('pointermove', (e) => this.onPointerMove(e));
    svg.addEventListener('pointerup', (e) => this.onPointerUp(e));
    svg.addEventListener('pointerleave', () => {
      if (!this.drag && this.hover) {
        this.hover = null;
        this.renderOverlay();
      }
    });
    svg.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    svg.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // Sağ tuşla tıklama ve kaydırmayı tuşun kendisi işler: menü olayı macOS/Linux'ta tuş basılıyken,
      // Windows'ta tuş bırakılınca gelir. Klavyeden açılan menü (Menü tuşu, Shift+F10) iptal olarak kalır.
      if ((this.drag && this.drag.button === 2) || e.timeStamp - this.rightUpAt < 500) return;
      this.rightClick();
    });
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (e.shiftKey) {
        this.view.tx -= e.deltaY;
        this.applyView();
        return;
      }
      this.zoomAt(e.deltaY < 0 ? 1.13 : 1 / 1.13, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    svg.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.placing) {
        this.lastPos = this.toMm(e);
        this.updateGhost(this.lastPos);
      }
    });
    svg.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.placing) {
        this.lastPos = this.toMm(e);
        this.placeAt(this.lastPos);
      }
    });

    new ResizeObserver(() => { if (this.sheet) this.applyView(); }).observe(svg);
  }

  onDoubleClick(e) {
    const el = e.target.closest('[data-id]');
    if (!el) return;
    const it = PidModel.findItem(this.sheet, el.getAttribute('data-id'));
    if (it) this.host.onFocusField(it);
  }

  onPointerDown(e) {
    if (!this.sheet) return;
    const pos = this.toMm(e);
    this.lastPos = pos;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();

    if (e.button === 2) {
      // Sağ tuş: sürüklenirse çizimi kaydırır, kıpırdamadan bırakılırsa yerleştirmeyi / hattı iptal eder
      this.drag = { type: 'pan', button: 2, moved: false, sx: e.clientX, sy: e.clientY, tx: this.view.tx, ty: this.view.ty };
      this.svg.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.drag = { type: 'pan', button: e.button, moved: true, sx: e.clientX, sy: e.clientY, tx: this.view.tx, ty: this.view.ty };
      this.svg.setPointerCapture(e.pointerId);
      this.updateCursor();
      return;
    }
    if (e.button !== 0) return;

    if (this.placing) {
      this.placeAt(pos);
      return;
    }

    if (this.draft) {
      this.finishLine(pos);
      return;
    }

    if (this.tool === 'text') {
      const item = PidModel.addText(this.sheet, this.snapValue(pos.x), this.snapValue(pos.y), 'Metin');
      this.renderItem(item);
      this.setSelection([item.id]);
      this.commit();
      this.setTool('select');
      // Tıklamanın varsayılan davranışı odağı geri almasın diye sonraki adımda odaklanılır
      setTimeout(() => this.host.onFocusField(item), 0);
      return;
    }

    const handle = e.target.closest('[data-handle]');
    if (handle) {
      this.beginHandle(handle.getAttribute('data-handle'), pos, e);
      return;
    }

    if (this.tool === 'line') {
      const resolved = this.resolveAnchor(pos);
      this.beginLine(resolved, pos, e);
      return;
    }

    // Seçme aracında boş porttan sürükleme yeni hat başlatır
    const portHit = this.freePortAt(pos);
    if (portHit) {
      this.beginLine(portHit, pos, e);
      return;
    }

    const labelEl = e.target.closest('[data-label]');
    const el = e.target.closest('[data-id]');
    if (el) {
      const id = el.getAttribute('data-id');
      const item = PidModel.findItem(this.sheet, id);
      if (!item) return;
      if (labelEl && this.selection.has(id) && !e.shiftKey) {
        this.drag = { type: 'label', item, start: pos, orig: (item.tagOffset || [0, 0]).slice(), moved: false };
        this.svg.setPointerCapture(e.pointerId);
        return;
      }
      if (e.shiftKey) {
        const next = new Set(this.selection);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        this.setSelection([...next]);
        return;
      }
      if (!this.selection.has(id)) this.setSelection([id]);
      if (PidModel.isLine(item) && this.selection.size === 1) {
        const near = PidModel.nearestOnLine(item, pos.x, pos.y);
        if (near) this.beginSegment(item, near.index, pos, e);
        return;
      }
      this.beginMove(pos, item, e);
      return;
    }

    if (!e.shiftKey && this.selection.size) this.setSelection([]);
    this.drag = { type: 'box', start: pos, rect: null, additive: e.shiftKey ? new Set(this.selection) : null };
    this.svg.setPointerCapture(e.pointerId);
  }

  freePortAt(pos) {
    const radius = Math.max(1.8, 7 / this.view.k);
    let best = null;
    for (const it of this.sheet.items) {
      if (!PidModel.isSymbol(it)) continue;
      const def = PidSymbols.get(it.symbol);
      if (!def || def.hidden) continue;
      for (const p of PidModel.portsOf(it)) {
        const dist = Math.hypot(p.x - pos.x, p.y - pos.y);
        if (dist > radius || (best && dist >= best.dist)) continue;
        const taken = this.sheet.items.some((l) => PidModel.isLine(l) &&
          ((l.from.node === it.id && l.from.port === p.id) || (l.to.node === it.id && l.to.port === p.id)));
        if (!taken) best = { dist, anchor: { node: it.id, port: p.id }, point: { x: p.x, y: p.y }, node: it.id };
      }
    }
    return best;
  }

  onPointerMove(e) {
    if (!this.sheet) return;
    const pos = this.toMm(e);
    this.lastPos = pos;
    this.host.onPointer(pos);

    if (this.drag) {
      this.dragMove(pos, e);
      return;
    }
    if (this.placing) {
      this.updateGhost(pos);
      return;
    }
    if (this.draft) {
      this.updateDraft(pos);
      return;
    }
    this.updateHover(pos, e);
  }

  updateHover(pos, e) {
    let next = null;
    if (this.tool === 'line') {
      const r = this.resolveAnchor(pos);
      next = { point: r.point, node: r.node, lineId: r.lineId };
    } else if (this.tool === 'select' && !this.spaceDown) {
      const port = this.freePortAt(pos);
      if (port) {
        next = { point: port.point, node: port.node };
      } else {
        const el = e.target.closest && e.target.closest('[data-id]');
        if (el) {
          const it = PidModel.findItem(this.sheet, el.getAttribute('data-id'));
          if (it && PidModel.isSymbol(it)) next = { node: it.id };
        }
      }
    }
    const same = JSON.stringify(next) === JSON.stringify(this.hover);
    if (same) return;
    this.hover = next;
    this.renderOverlay();
  }

  onPointerUp(e) {
    if (e.button === 2) this.rightUpAt = e.timeStamp;
    if (!this.sheet) return;
    const pos = this.toMm(e);
    const drag = this.drag;
    this.drag = null;
    try {
      if (this.svg.hasPointerCapture(e.pointerId)) this.svg.releasePointerCapture(e.pointerId);
    } catch { /* yakalama zaten bırakılmış olabilir */ }
    this.guides = [];
    this.updateCursor();
    if (!drag) return;
    this.dragEnd(drag, pos, e);
    this.renderOverlay();
  }

  dragMove(pos, e) {
    const d = this.drag;
    switch (d.type) {
      case 'pan': {
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (!d.moved) {
          // Sağ tıklama ile kaydırma ayrılır: birkaç piksellik titreme tıklama sayılır
          if (Math.hypot(dx, dy) < 4) break;
          d.moved = true;
          this.updateCursor();
        }
        this.view.tx = d.tx + dx;
        this.view.ty = d.ty + dy;
        this.applyView();
        // Yerleştirilen sembol ve çizilen hat kaydırma sırasında imleçte kalır
        this.lastPos = this.toMm(e);
        if (this.placing) this.updateGhost(this.lastPos);
        else if (this.draft) this.updateDraft(this.lastPos);
        break;
      }
      case 'box':
        d.rect = {
          x: Math.min(d.start.x, pos.x),
          y: Math.min(d.start.y, pos.y),
          w: Math.abs(pos.x - d.start.x),
          h: Math.abs(pos.y - d.start.y)
        };
        this.renderOverlay();
        break;
      case 'move':
        this.dragMoveItems(pos, e);
        break;
      case 'label': {
        const dx = pos.x - d.start.x;
        const dy = pos.y - d.start.y;
        if (Math.hypot(dx, dy) * this.view.k < 2 && !d.moved) break;
        d.moved = true;
        d.item.tagOffset = [Math.round((d.orig[0] + dx) * 2) / 2, Math.round((d.orig[1] + dy) * 2) / 2];
        this.renderItem(d.item);
        break;
      }
      case 'resize':
        this.dragResize(pos);
        break;
      case 'segment':
        this.dragSegment(pos);
        break;
      case 'lineEnd':
        this.dragLineEnd(pos);
        break;
      case 'lineStart':
        if (Math.hypot(pos.x - d.start.x, pos.y - d.start.y) * this.view.k > 4) d.moved = true;
        this.updateDraft(pos);
        break;
      default:
        break;
    }
  }

  dragEnd(drag, pos, e) {
    switch (drag.type) {
      case 'pan':
        if (drag.button === 2 && !drag.moved) this.rightClick();
        break;
      case 'box':
        if (drag.rect) this.finishBox(drag);
        break;
      case 'move':
        if (drag.moved) {
          this.renderLines();
          this.commit();
          this.host.onSelection();
        }
        break;
      case 'label':
        if (drag.moved) this.commit();
        break;
      case 'resize':
        this.renderLines();
        this.commit();
        this.host.onSelection();
        break;
      case 'segment':
        if (drag.moved) {
          drag.line.path = PidRouter.simplify(drag.poly);
          drag.line.manual = true;
          this.renderLines();
          this.commit();
        }
        break;
      case 'lineEnd':
        this.finishLineEnd(drag, pos);
        break;
      case 'lineStart':
        if (drag.moved) this.finishLine(pos);
        break;
      default:
        break;
    }
  }

  /** Sağ tık: yerleştirmeyi veya yarım kalan hattı iptal eder */
  rightClick() {
    if (this.placing) {
      this.cancelPlacing();
    } else if (this.draft) {
      this.draft = null;
      this.hover = null;
      this.updateCursor();
      this.renderOverlay();
    }
  }

  /* ─── Taşıma ──────────────────────────────────────────── */

  beginMove(pos, primary, e) {
    const nodes = new Map();
    const remember = (it) => { if (!nodes.has(it.id)) nodes.set(it.id, { x: it.x, y: it.y }); };
    for (const it of this.selectedItems()) {
      if (PidModel.isLine(it)) continue;
      remember(it);
      if (PidModel.isSymbol(it) && (PidSymbols.get(it.symbol) || {}).container && !e.altKey) {
        // Kapsayıcı taşınınca içindekiler de gelir
        const b = PidModel.boxOf(it);
        for (const other of this.sheet.items) {
          if (other.id === it.id || PidModel.isLine(other) || other.type === 'legend') continue;
          if (other.x > b[0] && other.x < b[2] && other.y > b[1] && other.y < b[3]) remember(other);
        }
      }
    }
    const freeLines = this.selectedItems().filter(PidModel.isLine).map((l) => ({
      line: l,
      from: Object.assign({}, l.from),
      to: Object.assign({}, l.to),
      path: l.path.map((p) => p.slice())
    }));
    // Tüm uçları birlikte taşınan elle düzenlenmiş hatlar kaydırılır
    const carried = this.sheet.items.filter((l) => PidModel.isLine(l) && l.manual &&
      nodes.has(l.from.node) && nodes.has(l.to.node)).map((l) => ({ line: l, path: l.path.map((p) => p.slice()) }));
    this.drag = {
      type: 'move',
      start: pos,
      primary: PidModel.isLine(primary) ? null : primary,
      origPrimary: PidModel.isLine(primary) ? null : { x: primary.x, y: primary.y },
      nodes,
      freeLines,
      carried,
      moved: false
    };
    this.svg.setPointerCapture(e.pointerId);
  }

  dragMoveItems(pos, e) {
    const d = this.drag;
    let dx = pos.x - d.start.x;
    let dy = pos.y - d.start.y;
    if (!d.moved && Math.hypot(dx, dy) * this.view.k < 3) return;
    d.moved = true;

    const useSnap = !e.altKey;
    this.guides = [];
    if (d.primary) {
      let nx = d.origPrimary.x + dx;
      let ny = d.origPrimary.y + dy;
      if (useSnap) {
        nx = this.snapValue(nx);
        ny = this.snapValue(ny);
        const aligned = this.smartGuides(d, nx, ny);
        nx = aligned.x;
        ny = aligned.y;
      }
      dx = nx - d.origPrimary.x;
      dy = ny - d.origPrimary.y;
    } else if (useSnap) {
      dx = this.snapValue(dx);
      dy = this.snapValue(dy);
    }

    const moved = [];
    for (const [id, orig] of d.nodes) {
      const it = PidModel.findItem(this.sheet, id);
      it.x = orig.x + dx;
      it.y = orig.y + dy;
      moved.push(id);
      this.renderItem(it);
    }

    const movedSet = new Set(moved);
    const carriedIds = new Set();
    for (const c of d.carried) {
      c.line.path = c.path.map((p) => [p[0] + dx, p[1] + dy]);
      carriedIds.add(c.line.id);
    }
    for (const f of d.freeLines) {
      if (!f.from.node) f.line.from = { x: f.from.x + dx, y: f.from.y + dy };
      if (!f.to.node) f.line.to = { x: f.to.x + dx, y: f.to.y + dy };
      if (!f.from.node && !f.to.node) {
        f.line.path = f.path.map((p) => [p[0] + dx, p[1] + dy]);
        carriedIds.add(f.line.id);
      }
    }

    const dirty = [];
    for (const it of this.sheet.items) {
      if (!PidModel.isLine(it)) continue;
      if (carriedIds.has(it.id)) {
        dirty.push(it.id);
        continue;
      }
      const touches = movedSet.has(it.from.node) || movedSet.has(it.to.node) || d.freeLines.some((f) => f.line.id === it.id);
      if (touches) {
        PidModel.refreshLine(this.sheet, it);
        dirty.push(it.id);
      }
    }
    this.renderLines(dirty);
    this.renderOverlay();
  }

  /** Taşınan sembolü diğer sembollerin merkez çizgilerine hizalar */
  smartGuides(d, nx, ny) {
    const tol = 1.3;
    const def = PidSymbols.get(d.primary.symbol);
    let x = nx;
    let y = ny;
    let gx = null;
    let gy = null;
    if (!def) return { x, y };
    for (const it of this.sheet.items) {
      if (!PidModel.isSymbol(it) || d.nodes.has(it.id)) continue;
      const other = PidSymbols.get(it.symbol);
      if (!other || other.hidden || other.container) continue;
      if (gx === null && Math.abs(it.x - nx) <= tol) {
        x = it.x;
        gx = it;
      }
      if (gy === null && Math.abs(it.y - ny) <= tol) {
        y = it.y;
        gy = it;
      }
    }
    if (gx) this.guides.push(`M${gx.x} ${Math.min(gx.y, y) - 12}V${Math.max(gx.y, y) + 12}`);
    if (gy) this.guides.push(`M${Math.min(gy.x, x) - 12} ${gy.y}H${Math.max(gy.x, x) + 12}`);
    return { x, y };
  }

  finishBox(drag) {
    const r = drag.rect;
    const x1 = r.x + r.w;
    const y1 = r.y + r.h;
    const inside = (b) => b[0] >= r.x && b[1] >= r.y && b[2] <= x1 && b[3] <= y1;
    const touching = (b) => b[2] >= r.x && b[0] <= x1 && b[3] >= r.y && b[1] <= y1;
    const next = drag.additive ? new Set(drag.additive) : new Set();
    for (const it of this.sheet.items) {
      const def = PidModel.isSymbol(it) ? PidSymbols.get(it.symbol) : null;
      if (def && def.hidden) continue;
      const box = PidModel.boxOf(it);
      const fullOnly = PidModel.isLine(it) || (def && def.container) || it.type === 'legend';
      if (fullOnly ? inside(box) : touching(box)) next.add(it.id);
    }
    drag.rect = null;
    this.setSelection([...next]);
  }

  /* ─── Tutamaçlar ──────────────────────────────────────── */

  beginHandle(name, pos, e) {
    const [kind, arg] = name.split(':');
    const item = this.selectedItems()[0];
    if (kind === 'resize') {
      this.drag = { type: 'resize', dir: arg, item, box: PidModel.boxOf(item) };
    } else if (kind === 'seg') {
      this.beginSegment(item, parseInt(arg, 10), pos, e);
      return;
    } else if (kind === 'end') {
      this.drag = { type: 'lineEnd', end: arg, line: item, orig: item[arg], origPath: item.path.map((p) => p.slice()), origManual: item.manual, resolved: null };
    }
    this.svg.setPointerCapture(e.pointerId);
  }

  dragResize(pos) {
    const d = this.drag;
    const it = d.item;
    const def = PidSymbols.get(it.symbol);
    let [x0, y0, x1, y1] = d.box;
    const px = this.snapValue(pos.x);
    const py = this.snapValue(pos.y);
    const min = 10;
    if (d.dir.includes('w')) x0 = Math.min(px, x1 - min);
    if (d.dir.includes('e')) x1 = Math.max(px, x0 + min);
    if (d.dir.includes('n')) y0 = Math.min(py, y1 - min);
    if (d.dir.includes('s')) y1 = Math.max(py, y0 + min);
    if (def.keepAspect) {
      const size = Math.max(x1 - x0, y1 - y0);
      if (d.dir.includes('w')) x0 = x1 - size;
      else x1 = x0 + size;
      if (d.dir.includes('n')) y0 = y1 - size;
      else y1 = y0 + size;
    }
    it.w = x1 - x0;
    it.h = y1 - y0;
    it.x = (x0 + x1) / 2;
    it.y = (y0 + y1) / 2;
    this.renderItem(it);
    this.renderLines(PidModel.refreshAttached(this.sheet, [it.id]));
    this.renderOverlay();
  }

  beginSegment(line, index, pos, e) {
    const poly = line.path.map((p) => p.slice());
    let i = index;
    const last = poly.length - 1;
    const horizontal = Math.abs(poly[i][1] - poly[i + 1][1]) < 1e-6;
    const stubFrom = (from, to) => {
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
      const k = Math.min(5, len / 3) / len;
      return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
    };
    const atEnd = i + 1 === last;
    const tail = atEnd ? stubFrom(poly[last], poly[last - 1]) : null;
    if (i === 0) {
      const s = stubFrom(poly[0], poly[1]);
      poly.splice(1, 0, s.slice(), s.slice());
      i = 2;
    }
    if (atEnd) {
      const end = poly.length - 1;
      poly.splice(end, 0, tail.slice(), tail.slice());
    }
    this.drag = { type: 'segment', line, poly, index: i, horizontal, start: pos, moved: false };
    this.svg.setPointerCapture(e.pointerId);
  }

  dragSegment(pos) {
    const d = this.drag;
    if (!d.moved && Math.hypot(pos.x - d.start.x, pos.y - d.start.y) * this.view.k < 3) return;
    d.moved = true;
    const value = d.horizontal ? this.snapValue(pos.y) : this.snapValue(pos.x);
    const axis = d.horizontal ? 1 : 0;
    d.poly[d.index][axis] = value;
    d.poly[d.index + 1][axis] = value;
    d.line.path = d.poly.map((p) => p.slice());
    this.renderLines([d.line.id]);
    this.renderOverlay();
  }

  dragLineEnd(pos) {
    const d = this.drag;
    const other = d.end === 'from' ? d.line.to : d.line.from;
    const resolved = this.resolveAnchor(pos, { excludeNode: other.node, excludeLines: new Set([d.line.id]) });
    d.resolved = resolved;
    this.hover = { point: resolved.point, node: resolved.node, lineId: resolved.lineId };
    d.line[d.end] = { x: resolved.point.x, y: resolved.point.y };
    if (!resolved.split && resolved.anchor.node) d.line[d.end] = resolved.anchor;
    d.line.manual = false;
    PidModel.refreshLine(this.sheet, d.line);
    this.renderLines([d.line.id]);
    this.renderOverlay();
  }

  finishLineEnd(drag, pos) {
    this.hover = null;
    const resolved = drag.resolved;
    if (!resolved) return;
    drag.line[drag.end] = this.materialize(resolved);
    PidModel.refreshLine(this.sheet, drag.line);
    this.removeStaleEls();
    this.renderLines();
    this.commit();
  }

  /* ─── Hat çizimi ──────────────────────────────────────── */

  beginLine(resolved, pos, e) {
    this.draft = { start: resolved, kind: this.lineKind, preview: null };
    this.drag = { type: 'lineStart', start: pos, moved: false };
    this.svg.setPointerCapture(e.pointerId);
    this.updateCursor();
    this.updateDraft(pos);
  }

  updateDraft(pos) {
    const d = this.draft;
    if (!d) return;
    const startNode = d.start.anchor && d.start.anchor.node;
    const resolved = this.resolveAnchor(pos, { excludeNode: startNode });
    d.end = resolved;
    this.hover = { point: resolved.point, node: resolved.node, lineId: resolved.lineId };

    const a = d.start.split
      ? { x: d.start.point.x, y: d.start.point.y, dir: null }
      : PidModel.anchorPoint(this.sheet, d.start.anchor);
    const b = resolved.split || !resolved.anchor.node
      ? { x: resolved.point.x, y: resolved.point.y, dir: null }
      : PidModel.anchorPoint(this.sheet, resolved.anchor);
    d.preview = PidRouter.route(a, b, {});
    this.renderOverlay();
  }

  finishLine(pos) {
    const d = this.draft;
    if (!d) return;
    this.updateDraft(pos);
    const a = d.start.point;
    const b = d.end.point;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1) {
      this.draft = null;
      this.hover = null;
      this.updateCursor();
      this.renderOverlay();
      return;
    }
    const sameLineSplit = d.start.split && d.end.split && d.start.split === d.end.split;
    const from = this.materialize(d.start);
    const to = sameLineSplit
      ? { x: b.x, y: b.y }
      : this.materialize(d.end);
    const line = PidModel.addLine(this.sheet, from, to, { kind: this.kindForLine(d.kind, from, to) });
    this.draft = null;
    this.hover = null;
    this.selection = new Set([line.id]);
    this.renderAll();
    this.updateCursor();
    this.commit();
    this.host.onSelection();
  }

  /** Konum sensörünün elektrik ucuna bağlanan hat sinyal, montaj ucuna bağlanan mekaniktir */
  kindForLine(kind, from, to) {
    if (kind === 'signal' || kind === 'mech') return kind;
    const portKind = (anchor) => {
      const node = anchor.node ? PidModel.findItem(this.sheet, anchor.node) : null;
      if (!PidModel.isSymbol(node) || (PidSymbols.get(node.symbol) || {}).sense !== 'position') return null;
      return anchor.port === 'E' ? 'signal' : anchor.port === 'M' ? 'mech' : null;
    };
    return portKind(from) || portKind(to) || kind;
  }

  /* ─── Komutlar ────────────────────────────────────────── */

  updateItem(item, props, opts) {
    if (props.symbol && props.symbol !== item.symbol) {
      // Kapsayıcı katmanı değişebilir: grup yeniden oluşturulur
      const el = this.els.get(item.id);
      if (el) el.remove();
      this.els.delete(item.id);
    }
    Object.assign(item, props);
    if (PidModel.isLine(item)) {
      if (props.kind && !props.arrow) item.arrow = (PidSymbols.LINE_KINDS[props.kind] || {}).arrow || 'none';
      this.renderLines();
    } else {
      this.renderItem(item);
      if (PidModel.isSymbol(item)) this.renderLines(PidModel.refreshAttached(this.sheet, [item.id]));
    }
    this.renderOverlay();
    if (!opts || opts.commit !== false) this.commit();
  }

  rotateSelection() {
    if (this.placing) {
      this.placing.rot = (this.placing.rot + 90) % 360;
      this.updateGhost(this.lastPos);
      return;
    }
    const nodes = this.selectedItems().filter((it) => PidModel.isSymbol(it) && !(PidSymbols.get(it.symbol) || {}).resizable);
    if (!nodes.length) return;
    for (const it of nodes) {
      it.rot = ((it.rot || 0) + 90) % 360;
      this.renderItem(it);
    }
    PidModel.refreshAttached(this.sheet, nodes.map((n) => n.id));
    this.renderLines();
    this.renderOverlay();
    this.commit();
  }

  flipSelection() {
    if (this.placing) {
      this.placing.flip = !this.placing.flip;
      this.updateGhost(this.lastPos);
      return;
    }
    const nodes = this.selectedItems().filter((it) => PidModel.isSymbol(it) && !(PidSymbols.get(it.symbol) || {}).resizable);
    if (!nodes.length) return;
    for (const it of nodes) {
      it.flip = !it.flip;
      this.renderItem(it);
    }
    PidModel.refreshAttached(this.sheet, nodes.map((n) => n.id));
    this.renderLines();
    this.renderOverlay();
    this.commit();
  }

  deleteSelection() {
    if (!this.selection.size) return;
    PidModel.removeItems(this.sheet, [...this.selection]);
    this.selection.clear();
    this.renderAll();
    this.commit();
    this.host.onSelection();
  }

  selectAll() {
    const ids = this.sheet.items
      .filter((it) => !(PidModel.isSymbol(it) && (PidSymbols.get(it.symbol) || {}).hidden))
      .map((it) => it.id);
    this.setSelection(ids);
  }

  nudge(dx, dy) {
    const nodes = this.selectedItems().filter((it) => !PidModel.isLine(it));
    if (!nodes.length) return;
    for (const it of nodes) {
      it.x += dx;
      it.y += dy;
      this.renderItem(it);
    }
    PidModel.refreshAttached(this.sheet, nodes.map((n) => n.id));
    this.renderLines();
    this.renderOverlay();
    this.commit();
    this.host.onSelection();
  }

  copy() {
    if (!this.selection.size) return false;
    const ids = new Set(this.selection);
    // İki ucu da seçimde olan hatlar kopyaya otomatik girer
    for (const it of this.sheet.items) {
      if (PidModel.isLine(it) && ids.has(it.from.node) && ids.has(it.to.node)) ids.add(it.id);
    }
    const items = this.sheet.items.filter((it) => ids.has(it.id));
    this.clipboard = { items: JSON.parse(JSON.stringify(items)), sheet: JSON.parse(JSON.stringify(this.sheet)) };
    return true;
  }

  paste() {
    if (!this.clipboard) return;
    const copies = PidModel.cloneList(this.clipboard.sheet, this.clipboard.items, 10, 10);
    this.sheet.items.push(...copies);
    this.selection = new Set(copies.map((c) => c.id));
    this.renderAll();
    this.commit();
    this.host.onSelection();
  }

  duplicate() {
    if (this.copy()) this.paste();
  }

  align(mode) {
    const nodes = this.selectedItems().filter((it) => !PidModel.isLine(it));
    if (nodes.length < 2) return;
    const boxes = nodes.map(PidModel.boxOf);
    const left = Math.min(...boxes.map((b) => b[0]));
    const right = Math.max(...boxes.map((b) => b[2]));
    const top = Math.min(...boxes.map((b) => b[1]));
    const bottom = Math.max(...boxes.map((b) => b[3]));
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    if (mode === 'distH' || mode === 'distV') {
      const axis = mode === 'distH' ? 'x' : 'y';
      const sorted = nodes.slice().sort((a, b) => a[axis] - b[axis]);
      const first = sorted[0][axis];
      const step = (sorted[sorted.length - 1][axis] - first) / (sorted.length - 1);
      sorted.forEach((it, i) => { it[axis] = this.snapValue(first + step * i); });
    } else {
      nodes.forEach((it, i) => {
        const b = boxes[i];
        if (mode === 'left') it.x += left - b[0];
        if (mode === 'right') it.x += right - b[2];
        if (mode === 'centerX') it.x += centerX - (b[0] + b[2]) / 2;
        if (mode === 'top') it.y += top - b[1];
        if (mode === 'bottom') it.y += bottom - b[3];
        if (mode === 'centerY') it.y += centerY - (b[1] + b[3]) / 2;
      });
    }
    nodes.forEach((it) => this.renderItem(it));
    PidModel.refreshAttached(this.sheet, nodes.map((n) => n.id));
    this.renderLines();
    this.renderOverlay();
    this.commit();
  }

  resetRoute(line) {
    line.manual = false;
    PidModel.refreshLine(this.sheet, line);
    this.renderLines();
    this.renderOverlay();
    this.commit();
  }

  /* ─── Klavye ──────────────────────────────────────────── */

  handleKey(e) {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (e.code === 'Space') {
      if (!this.spaceDown) {
        this.spaceDown = true;
        this.updateCursor();
      }
      e.preventDefault();
      return;
    }

    if (mod) {
      if (key === 'z' && !e.shiftKey) { this.undo(); e.preventDefault(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { this.redo(); e.preventDefault(); }
      else if (key === 'c') { this.copy(); e.preventDefault(); }
      else if (key === 'v') { this.paste(); e.preventDefault(); }
      else if (key === 'd') { this.duplicate(); e.preventDefault(); }
      else if (key === 'a') { this.selectAll(); e.preventDefault(); }
      else if (key === '0') { this.fit(); e.preventDefault(); }
      else if (key === '=' || key === '+') { this.zoomAt(1.2); e.preventDefault(); }
      else if (key === '-') { this.zoomAt(1 / 1.2); e.preventDefault(); }
      return;
    }

    const step = e.shiftKey ? 10 : 2.5;
    switch (e.key) {
      case 'Escape':
        if (this.placing) this.cancelPlacing();
        else if (this.draft) {
          this.draft = null;
          this.hover = null;
          this.updateCursor();
          this.renderOverlay();
        } else if (this.tool !== 'select') this.setTool('select');
        else this.setSelection([]);
        break;
      case 'Delete':
      case 'Backspace':
        this.deleteSelection();
        break;
      case 'ArrowLeft': this.nudge(-step, 0); e.preventDefault(); break;
      case 'ArrowRight': this.nudge(step, 0); e.preventDefault(); break;
      case 'ArrowUp': this.nudge(0, -step); e.preventDefault(); break;
      case 'ArrowDown': this.nudge(0, step); e.preventDefault(); break;
      default:
        if (key === 'v') this.setTool('select');
        else if (key === 'l') this.setTool('line');
        else if (key === 't') this.setTool('text');
        else if (key === 'r') this.rotateSelection();
        else if (key === 'x') this.flipSelection();
        else if (key === 'f') this.fit();
        break;
    }
  }

  handleKeyUp(e) {
    if (e.code === 'Space') {
      this.spaceDown = false;
      this.updateCursor();
    }
  }
}
