/* Çizim veri modeli: DOM'a bağlı değildir, Node testlerinde de çalışır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./symbols.js'), require('./router.js'));
  } else {
    root.PidModel = factory(root.PidSymbols, root.PidRouter);
  }
})(typeof self !== 'undefined' ? self : this, function (Sym, Router) {
  'use strict';

  const SCHEMA = 1;
  const SHEET_SIZES = {
    A4: [297, 210],
    A3: [420, 297],
    A2: [594, 420],
    A1: [841, 594]
  };
  const TITLE_W = 170;
  const TITLE_H = 36;
  const ROTATE_DIR = { R: 'D', D: 'L', L: 'U', U: 'R' };
  const FLIP_DIR = { L: 'R', R: 'L', U: 'U', D: 'D' };
  const SIDE_DIR = { T: 'U', B: 'D', L: 'L', R: 'R' };

  let counter = 0;
  function uid(prefix) {
    counter += 1;
    return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  }

  /** Çizilebilir alan ve antet ölçüleri (mm) */
  function geometry(sheet) {
    const [W, H] = SHEET_SIZES[sheet.size] || SHEET_SIZES.A3;
    const mx = 12;
    const zone = 4;
    const frame = { x0: mx, y0: 19, x1: W - mx, y1: H - 16 };
    return {
      W,
      H,
      mx,
      headerRule: 15.5,
      footerRule: H - 13,
      frame,
      inner: { x0: frame.x0 + zone, y0: frame.y0 + zone, x1: frame.x1 - zone, y1: frame.y1 - zone },
      title: { x: frame.x1 - zone - TITLE_W, y: frame.y1 - zone - TITLE_H, w: TITLE_W, h: TITLE_H }
    };
  }

  function createSheet(title, size) {
    return { id: uid('s'), title: title || 'P&ID Şeması', size: size || 'A3', items: [] };
  }

  function createDrawing(title) {
    return { schema: SCHEMA, sheets: [createSheet(title)] };
  }

  const findItem = (sheet, id) => sheet.items.find((it) => it.id === id) || null;
  const isSymbol = (it) => it && it.type === 'symbol';
  const isLine = (it) => it && it.type === 'line';

  /** Yerel sembol noktası -> sayfa koordinatı (çevirme, döndürme, öteleme) */
  function toWorld(item, x, y) {
    // Ölçek yalnız boyutlanmayan sembollerde kullanılır; tank ve hücrede genişlik/yükseklik değişir
    const k = item.scale && item.scale !== 1 ? item.scale : 1;
    let px = (item.flip ? -x : x) * k;
    let py = y * k;
    const rot = ((item.rot || 0) % 360 + 360) % 360;
    for (let i = 0; i < rot / 90; i += 1) {
      const t = px;
      px = -py;
      py = t;
    }
    return { x: item.x + px, y: item.y + py };
  }

  function worldDir(item, dir) {
    if (!dir) return null;
    let d = item.flip ? FLIP_DIR[dir] : dir;
    const rot = ((item.rot || 0) % 360 + 360) % 360;
    for (let i = 0; i < rot / 90; i += 1) d = ROTATE_DIR[d];
    return d;
  }

  /** Sayfadaki kutu [x0,y0,x1,y1] */
  function boxOf(item) {
    if (isSymbol(item)) {
      const def = Sym.get(item.symbol);
      if (!def) return [item.x - 5, item.y - 5, item.x + 5, item.y + 5];
      const b = Sym.boxOf(def, item);
      const corners = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map((c) => toWorld(item, c[0], c[1]));
      const xs = corners.map((c) => c.x);
      const ys = corners.map((c) => c.y);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    if (item.type === 'text') {
      const lines = String(item.text || '').split('\n');
      const size = item.size || 3.5;
      const width = Math.max(...lines.map((l) => l.length), 1) * size * 0.52;
      const height = lines.length * size * 1.25;
      const left = item.align === 'center' ? item.x - width / 2 : item.align === 'right' ? item.x - width : item.x;
      return [left, item.y - size, left + width, item.y - size + height];
    }
    if (item.type === 'legend') {
      return [item.x, item.y, item.x + (item.w || 60), item.y + (item.h || 20)];
    }
    if (isLine(item) && item.path && item.path.length) {
      const xs = item.path.map((p) => p[0]);
      const ys = item.path.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    return [item.x || 0, item.y || 0, item.x || 0, item.y || 0];
  }

  function portsOf(item) {
    const def = Sym.get(item.symbol);
    if (!def) return [];
    return def.ports.map((p) => {
      const w = toWorld(item, p.x, p.y);
      return { id: p.id, x: w.x, y: w.y, dir: worldDir(item, p.dir) };
    });
  }

  function perimeterPoint(item, side, t) {
    const b = boxOf(item);
    const u = Math.max(0, Math.min(1, t));
    if (side === 'T') return { x: b[0] + (b[2] - b[0]) * u, y: b[1], dir: 'U' };
    if (side === 'B') return { x: b[0] + (b[2] - b[0]) * u, y: b[3], dir: 'D' };
    if (side === 'L') return { x: b[0], y: b[1] + (b[3] - b[1]) * u, dir: 'L' };
    return { x: b[2], y: b[1] + (b[3] - b[1]) * u, dir: 'R' };
  }

  /** Bir noktaya en yakın kenar bağlantısı (tank, hücre gibi boyutlanan ekipman) */
  function nearestPerimeter(item, x, y) {
    const b = boxOf(item);
    const w = b[2] - b[0] || 1;
    const h = b[3] - b[1] || 1;
    const clampX = Math.max(b[0], Math.min(b[2], x));
    const clampY = Math.max(b[1], Math.min(b[3], y));
    const options = [
      { side: 'T', dist: Math.abs(y - b[1]), t: (clampX - b[0]) / w },
      { side: 'B', dist: Math.abs(y - b[3]), t: (clampX - b[0]) / w },
      { side: 'L', dist: Math.abs(x - b[0]), t: (clampY - b[1]) / h },
      { side: 'R', dist: Math.abs(x - b[2]), t: (clampY - b[1]) / h }
    ];
    options.sort((p, q) => p.dist - q.dist);
    return { node: item.id, side: options[0].side, t: Math.round(options[0].t * 1000) / 1000, dist: options[0].dist };
  }

  /** Hat ucunu sayfa koordinatına çevirir */
  function anchorPoint(sheet, anchor) {
    if (anchor.node) {
      const node = findItem(sheet, anchor.node);
      if (node) {
        if (anchor.side) return perimeterPoint(node, anchor.side, anchor.t);
        const port = portsOf(node).find((p) => p.id === anchor.port);
        if (port) return { x: port.x, y: port.y, dir: port.dir };
      }
    }
    return { x: anchor.x || 0, y: anchor.y || 0, dir: null };
  }

  function obstaclesFor(sheet, line, a, b) {
    const g = geometry(sheet);
    const boxes = [[g.title.x, g.title.y, g.title.x + g.title.w, g.title.y + g.title.h]];
    for (const it of sheet.items) {
      if (it.type === 'legend') boxes.push(boxOf(it));
      if (!isSymbol(it)) continue;
      const def = Sym.get(it.symbol);
      if (!def || def.hidden || def.noObstacle) continue;
      const box = boxOf(it);
      if (def.container) {
        const inside = (p) => p.x >= box[0] && p.x <= box[2] && p.y >= box[1] && p.y <= box[3];
        // Ucu içeride ya da kenarında olan hat kapsayıcıdan geçebilir.
        if (inside(a) || inside(b)) continue;
      }
      boxes.push(box);
    }
    return boxes;
  }

  function occupiedSegments(sheet, exceptId) {
    const segs = [];
    for (const it of sheet.items) {
      if (!isLine(it) || it.id === exceptId || !it.path) continue;
      for (let i = 0; i < it.path.length - 1; i += 1) {
        segs.push([it.path[i][0], it.path[i][1], it.path[i + 1][0], it.path[i + 1][1]]);
      }
    }
    return segs;
  }

  /** Hattın yolunu güncel uçlara göre yeniden hesaplar */
  function refreshLine(sheet, line) {
    const a = anchorPoint(sheet, line.from);
    const b = anchorPoint(sheet, line.to);
    if (line.manual && line.path) {
      const adjusted = Router.adjustManual(line.path, a, b);
      if (adjusted) {
        line.path = adjusted;
        return line.path;
      }
      line.manual = false;
    }
    const area = geometry(sheet).inner;
    line.path = Router.route(a, b, {
      obstacles: obstaclesFor(sheet, line, a, b),
      occupied: occupiedSegments(sheet, line.id),
      bounds: [area.x0 + 2.5, area.y0 + 2.5, area.x1 - 2.5, area.y1 - 2.5]
    });
    return line.path;
  }

  function refreshAll(sheet) {
    for (const it of sheet.items) if (isLine(it)) refreshLine(sheet, it);
  }

  function attachedLines(sheet, nodeId) {
    return sheet.items.filter((it) => isLine(it) && (it.from.node === nodeId || it.to.node === nodeId));
  }

  function refreshAttached(sheet, nodeIds) {
    const set = new Set(nodeIds);
    const changed = [];
    for (const it of sheet.items) {
      if (isLine(it) && (set.has(it.from.node) || set.has(it.to.node))) {
        refreshLine(sheet, it);
        changed.push(it.id);
      }
    }
    return changed;
  }

  function updateJunctionDots(sheet) {
    for (const it of sheet.items) {
      if (isSymbol(it) && it.symbol === 'l.junction') {
        it.showDot = attachedLines(sheet, it.id).length >= 3;
      }
    }
  }

  function addSymbol(sheet, symbolId, x, y, props) {
    const def = Sym.get(symbolId);
    if (!def) throw new Error('Bilinmeyen sembol: ' + symbolId);
    const item = Object.assign({
      id: uid('n'),
      type: 'symbol',
      symbol: symbolId,
      x,
      y,
      rot: 0,
      flip: false,
      tag: '',
      optional: false
    }, props || {});
    if (def.resizable) {
      item.w = item.w || def.defaultSize[0];
      item.h = item.h || def.defaultSize[1];
    }
    if (def.defaultNote && item.note === undefined) item.note = def.defaultNote;
    if (def.defaultFunc && item.func === undefined) item.func = def.defaultFunc;
    sheet.items.push(item);
    return item;
  }

  function addLine(sheet, from, to, props) {
    const kind = (props && props.kind) || 'process';
    const meta = Sym.LINE_KINDS[kind] || Sym.LINE_KINDS.process;
    const line = Object.assign({
      id: uid('l'),
      type: 'line',
      kind,
      from,
      to,
      optional: false,
      label: '',
      arrow: meta.arrow,
      manual: false,
      path: null
    }, props || {});
    sheet.items.push(line);
    syncLineGroup(sheet, line);
    refreshLine(sheet, line);
    updateJunctionDots(sheet);
    return line;
  }

  function addText(sheet, x, y, text, props) {
    const item = Object.assign({
      id: uid('t'),
      type: 'text',
      x,
      y,
      text: text || 'Metin',
      size: 3.5,
      bold: false,
      align: 'left',
      optional: false
    }, props || {});
    sheet.items.push(item);
    return item;
  }

  function addLegend(sheet, x, y) {
    const item = { id: uid('g'), type: 'legend', x, y, w: 60, h: 20 };
    sheet.items.push(item);
    return item;
  }

  /** Nokta -> hat üzerinde en yakın parça */
  function nearestOnLine(line, x, y) {
    const path = line.path || [];
    let best = null;
    for (let i = 0; i < path.length - 1; i += 1) {
      const [x0, y0] = path[i];
      const [x1, y1] = path[i + 1];
      const horizontal = Math.abs(y0 - y1) < 1e-6;
      const px = horizontal ? Math.max(Math.min(x0, x1), Math.min(Math.max(x0, x1), x)) : x0;
      const py = horizontal ? y0 : Math.max(Math.min(y0, y1), Math.min(Math.max(y0, y1), y));
      const dist = Math.hypot(px - x, py - y);
      if (!best || dist < best.dist) {
        const dir = horizontal ? (x1 >= x0 ? 'R' : 'L') : (y1 >= y0 ? 'D' : 'U');
        best = { index: i, x: px, y: py, dist, horizontal, dir, length: Math.hypot(x1 - x0, y1 - y0) };
      }
    }
    return best;
  }

  /** Noktaya en yakın hat */
  function hitLine(sheet, x, y, tolerance, except) {
    let best = null;
    for (const it of sheet.items) {
      if (!isLine(it) || (except && except.has(it.id))) continue;
      const near = nearestOnLine(it, x, y);
      if (near && near.dist <= tolerance && (!best || near.dist < best.near.dist)) best = { line: it, near };
    }
    return best;
  }

  function splitPath(path, index, point) {
    const before = path.slice(0, index + 1).concat([[point.x, point.y]]);
    const after = [[point.x, point.y]].concat(path.slice(index + 1));
    return [Router.simplify(before), Router.simplify(after)];
  }

  /** Hattı bir noktadan ikiye böler; bağlantı noktası oluşturur */
  function splitLine(sheet, lineId, x, y) {
    const line = findItem(sheet, lineId);
    const near = nearestOnLine(line, x, y);
    // Gruptaki hattın üstünde açılan nokta da gruba girer, yoksa grup taşınınca geride kalır
    const junction = addSymbol(sheet, 'l.junction', near.x, near.y, line.group ? { group: line.group } : undefined);
    const [firstPath, secondPath] = splitPath(line.path, near.index, near);
    const originalTo = line.to;
    line.to = { node: junction.id, port: 'C' };
    line.path = firstPath;
    const second = Object.assign({}, line, {
      id: uid('l'),
      from: { node: junction.id, port: 'C' },
      to: originalTo,
      path: secondPath,
      label: ''
    });
    sheet.items.push(second);
    updateJunctionDots(sheet);
    return junction;
  }

  /** İki portlu sembolü hattın üzerine oturtur, hattı iki parçaya ayırır */
  function insertInline(sheet, lineId, symbolId, x, y, props) {
    const def = Sym.get(symbolId);
    const line = findItem(sheet, lineId);
    const near = nearestOnLine(line, x, y);
    const rotByDir = { R: 0, D: 90, L: 180, U: 270 };
    const node = addSymbol(sheet, symbolId, near.x, near.y, Object.assign({}, props, { rot: rotByDir[near.dir] }, line.group ? { group: line.group } : null));
    const ports = def.ports;
    const inPort = ports[0].id;
    const outPort = ports[1].id;
    const [firstPath, secondPath] = splitPath(line.path, near.index, near);
    const originalTo = line.to;
    const manual = line.manual;
    const portIn = portsOf(node).find((p) => p.id === inPort);
    const portOut = portsOf(node).find((p) => p.id === outPort);

    line.to = { node: node.id, port: inPort };
    line.manual = manual;
    line.path = firstPath;
    line.path[line.path.length - 1] = [portIn.x, portIn.y];

    secondPath[0] = [portOut.x, portOut.y];
    const second = Object.assign({}, line, {
      id: uid('l'),
      from: { node: node.id, port: outPort },
      to: originalTo,
      manual,
      path: secondPath,
      label: ''
    });
    sheet.items.push(second);
    updateJunctionDots(sheet);
    return node;
  }

  function freeAnchor(sheet, anchor) {
    const p = anchorPoint(sheet, anchor);
    return { x: p.x, y: p.y };
  }

  /** İki hat aynı düğümde buluşuyorsa ve aynı tipteyse tek hat yapar */
  function mergeThrough(sheet, nodeId, lines) {
    const [first, second] = lines;
    if (first.kind !== second.kind) return false;
    const farFirst = first.from.node === nodeId ? first.to : first.from;
    const farSecond = second.from.node === nodeId ? second.to : second.from;
    first.from = farFirst;
    first.to = farSecond;
    first.manual = false;
    first.label = first.label || second.label;
    sheet.items = sheet.items.filter((it) => it.id !== second.id);
    syncLineGroup(sheet, first);
    refreshLine(sheet, first);
    return true;
  }

  function removeItems(sheet, ids) {
    const removing = new Set(ids);

    // Hazır grubun sinyal hatları sembolüyle birlikte gider: rezistans silinince ona giden kilitleme hattı kalmaz
    for (const id of ids) {
      for (const l of attachedLines(sheet, id)) {
        if (l.auto && (l.kind === 'signal' || l.kind === 'data')) removing.add(l.id);
      }
    }

    // Hat üzerindeki vana silinirse hat onarılır
    for (const id of ids) {
      const node = findItem(sheet, id);
      if (!node || !isSymbol(node)) continue;
      const def = Sym.get(node.symbol);
      const lines = attachedLines(sheet, id).filter((l) => !removing.has(l.id));
      if (def && def.inline && lines.length === 2) mergeThrough(sheet, id, lines);
    }

    // Silinen düğüme bağlı kalan uçlar serbest kalır
    for (const it of sheet.items) {
      if (!isLine(it) || removing.has(it.id)) continue;
      if (it.from.node && removing.has(it.from.node)) it.from = freeAnchor(sheet, it.from);
      if (it.to.node && removing.has(it.to.node)) it.to = freeAnchor(sheet, it.to);
    }

    sheet.items = sheet.items.filter((it) => !removing.has(it.id));
    cleanupJunctions(sheet);
    pruneOrphanSignals(sheet);
    pruneGroups(sheet.items);
    updateJunctionDots(sheet);
  }

  const isSignalKind = (l) => l.kind === 'signal' || l.kind === 'data';

  /** Hazır grubun sinyal ağında sensör kalmadıysa (örneğin alt seviye silindiyse) ağın kalanı da silinir */
  function pruneOrphanSignals(sheet) {
    const auto = sheet.items.filter((it) => isLine(it) && it.auto && isSignalKind(it));
    if (!auto.length) return;
    const nodeOf = (id) => {
      const node = id ? findItem(sheet, id) : null;
      return node && isSymbol(node) ? node : null;
    };
    const isControl = (node) => {
      const def = node && Sym.get(node.symbol);
      return !!def && (def.isInstrument || def.cat === 'inst' || def.cat === 'safety');
    };
    const seen = new Set();
    const drop = new Set();
    for (const start of auto) {
      if (seen.has(start.id)) continue;
      seen.add(start.id);
      const group = [];
      const stack = [start];
      let control = false;
      while (stack.length) {
        const l = stack.pop();
        group.push(l);
        for (const end of [l.from, l.to]) {
          const node = nodeOf(end.node);
          if (!node) continue;
          if (node.symbol !== 'l.junction') {
            if (isControl(node)) control = true;
            continue;
          }
          for (const other of attachedLines(sheet, node.id)) {
            if (seen.has(other.id) || !isSignalKind(other)) continue;
            if (!other.auto) control = true; // kullanıcının çizdiği hatta dokunulmaz
            seen.add(other.id);
            stack.push(other);
          }
        }
      }
      if (!control) group.forEach((l) => drop.add(l.id));
    }
    if (!drop.size) return;
    sheet.items = sheet.items.filter((it) => !drop.has(it.id));
    cleanupJunctions(sheet);
  }

  function cleanupJunctions(sheet) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const it of sheet.items.slice()) {
        if (!isSymbol(it) || it.symbol !== 'l.junction') continue;
        const lines = attachedLines(sheet, it.id);
        if (lines.length >= 3) continue;
        if (lines.length === 2 && !mergeThrough(sheet, it.id, lines)) continue;
        if (lines.length === 1) {
          const l = lines[0];
          const p = { x: it.x, y: it.y };
          if (l.from.node === it.id) l.from = p;
          else l.to = p;
        }
        sheet.items = sheet.items.filter((x) => x.id !== it.id);
        changed = true;
        break;
      }
    }
  }

  /** Seçimi kopyalar: seçim içi bağlantılar korunur, dışa bağlı uçlar serbest kalır */
  function cloneItems(sheet, ids, dx, dy) {
    const source = sheet.items.filter((it) => ids.includes(it.id));
    return cloneList(sheet, source, dx, dy);
  }

  /**
   * Panoya alınacak kopya: seçim ve onunla bütün olanlar, sayfadan bağımsız.
   * Seçim dışındaki sembole giden hat ucu o anki noktasına sabitlenir; böylece kopya
   * başka sayfaya veya başka projeye kaynak sayfa olmadan yapıştırılabilir.
   */
  function copyPayload(sheet, ids) {
    const set = closeSelection(sheet, ids);
    const items = JSON.parse(JSON.stringify(sheet.items.filter((it) => set.has(it.id))));
    for (const it of items) {
      if (!isLine(it)) continue;
      for (const end of ['from', 'to']) {
        const anchor = it[end];
        if (anchor.node && !set.has(anchor.node)) {
          const p = anchorPoint(sheet, anchor);
          it[end] = { x: p.x, y: p.y };
        }
      }
    }
    return items;
  }

  function cloneList(sourceSheet, source, dx, dy) {
    const idMap = new Map();
    const copies = source.map((it) => {
      const copy = JSON.parse(JSON.stringify(it));
      copy.id = uid(it.type === 'line' ? 'l' : it.type === 'text' ? 't' : it.type === 'legend' ? 'g' : 'n');
      idMap.set(it.id, copy.id);
      return copy;
    });
    // Kopyalar kendi gruplarını oluşturur, asıl grupla karışmaz
    const groupMap = new Map();
    for (const c of copies) {
      if (!c.group) continue;
      if (!groupMap.has(c.group)) groupMap.set(c.group, uid('grp'));
      c.group = groupMap.get(c.group);
    }
    pruneGroups(copies);
    for (const c of copies) {
      if (isLine(c)) {
        for (const end of ['from', 'to']) {
          const anchor = c[end];
          if (anchor.node) {
            if (idMap.has(anchor.node)) {
              anchor.node = idMap.get(anchor.node);
            } else {
              const p = sourceSheet ? anchorPoint(sourceSheet, anchor) : { x: anchor.x || 0, y: anchor.y || 0 };
              c[end] = { x: p.x + dx, y: p.y + dy };
            }
          } else {
            anchor.x += dx;
            anchor.y += dy;
          }
        }
        if (c.path) c.path = c.path.map((p) => [p[0] + dx, p[1] + dy]);
      } else {
        c.x += dx;
        c.y += dy;
      }
    }
    return copies;
  }

  /* ─── Gruplama ────────────────────────────────────────── */

  const isJunction = (it) => isSymbol(it) && it.symbol === 'l.junction';

  /** Bağlantı noktası görünmez, elle seçilemez: en az iki kolu seçime varan nokta seçimle birlikte gider */
  function absorbJunctions(sheet, set) {
    const waiting = sheet.items.filter((it) => isJunction(it) && !set.has(it.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const j of waiting) {
        if (set.has(j.id)) continue;
        const arms = attachedLines(sheet, j.id).filter((l) => {
          if (set.has(l.id)) return true;
          const far = l.from.node === j.id ? l.to : l.from;
          return !!far.node && set.has(far.node);
        });
        if (arms.length >= 2) {
          set.add(j.id);
          changed = true;
        }
      }
    }
  }

  /** Seçim ve onunla bir bütün olanlar: ortadaki bağlantı noktaları, iki ucu seçimde olan hatlar */
  function closeSelection(sheet, ids) {
    const set = new Set(ids);
    absorbJunctions(sheet, set);
    for (const l of sheet.items) {
      if (isLine(l) && l.from.node && l.to.node && set.has(l.from.node) && set.has(l.to.node)) set.add(l.id);
    }
    return set;
  }

  /** Gruba girecekler: seçimin bütünü ve bir ucu grupta, öbür ucu boşta olan hatlar */
  function groupClosure(sheet, ids) {
    const set = closeSelection(sheet, ids);
    for (const l of sheet.items) {
      if (!isLine(l) || set.has(l.id)) continue;
      const a = l.from.node;
      const b = l.to.node;
      if ((a && !b && set.has(a)) || (b && !a && set.has(b))) set.add(l.id);
    }
    return set;
  }

  /** Tek öğesi kalan grup, grup olmaktan çıkar */
  function pruneGroups(items) {
    const count = new Map();
    for (const it of items) if (it.group) count.set(it.group, (count.get(it.group) || 0) + 1);
    for (const it of items) if (it.group && count.get(it.group) < 2) delete it.group;
  }

  /**
   * Seçilen her şeyi tek grup yapar: sembol, yazı, lejant, hat.
   * Seçilmemiş olsa da iç hatlar, ucu boşta olan hatlar ve aradaki bağlantı noktaları gruba girer.
   * Öbür ucu grubun dışındaki bir sembole giden hat seçilmediyse dışarıda kalır: taşırken uzar, kısalır.
   */
  function groupItems(sheet, ids) {
    const chosen = new Set(ids);
    const visible = sheet.items.filter((it) => chosen.has(it.id) && !isJunction(it));
    if (visible.length < 2) return null;
    const members = groupClosure(sheet, ids);
    const gid = uid('grp');
    for (const it of sheet.items) if (members.has(it.id)) it.group = gid;
    pruneGroups(sheet.items);
    return gid;
  }

  /** Çizilen veya ucu değişen hat: uçları aynı gruptaysa, ya da grupta bir uçla boştaysa o gruptadır */
  function syncLineGroup(sheet, line) {
    const a = line.from.node ? findItem(sheet, line.from.node) : null;
    const b = line.to.node ? findItem(sheet, line.to.node) : null;
    if (!a && !b) return;
    const group = a && b ? (a.group === b.group ? a.group : null) : (a || b).group;
    if (group) line.group = group;
    else delete line.group;
  }

  /**
   * Eski çizimlerde gruba yalnız semboller ve yazılar girerdi: hatları ve bağlantı noktaları gruba katılır.
   * Çizimin görünüşü değişmez, revizyon bulutu çıkmaz. Dönen değer gruba katılan öğe sayısı.
   */
  function normalizeGroups(drawing) {
    let count = 0;
    for (const sheet of drawing.sheets) {
      const groups = new Map();
      for (const it of sheet.items) {
        if (!it.group) continue;
        if (!groups.has(it.group)) groups.set(it.group, []);
        groups.get(it.group).push(it.id);
      }
      for (const [gid, ids] of groups) {
        const members = groupClosure(sheet, ids);
        for (const it of sheet.items) {
          if (it.group || !members.has(it.id)) continue;
          it.group = gid;
          count += 1;
        }
      }
    }
    return count;
  }

  function ungroupItems(sheet, ids) {
    const groups = new Set(sheet.items.filter((it) => ids.includes(it.id) && it.group).map((it) => it.group));
    for (const it of sheet.items) if (it.group && groups.has(it.group)) delete it.group;
    return groups.size;
  }

  /** Öğenin grubundaki bütün öğeler (grupsuzsa yalnız kendisi) */
  function groupMembers(sheet, id) {
    const item = findItem(sheet, id);
    if (!item || !item.group) return [id];
    return sheet.items.filter((it) => it.group === item.group).map((it) => it.id);
  }

  /** Seçimi gruplarıyla tamamlar */
  function expandGroups(sheet, ids) {
    const out = new Set(ids);
    for (const id of ids) for (const m of groupMembers(sheet, id)) out.add(m);
    return [...out];
  }

  /* ─── Taşıma ──────────────────────────────────────────── */

  /**
   * Taşıma planı. Seçim katı bir parça gibi gider, şekli bozulmaz:
   * - nodes: semboller, yazılar, lejant; kapsayıcının içindekiler ve seçimin ortasındaki bağlantı noktaları dahil
   * - rigid: bütün uçları taşınan hatlar; yol aynen ötelenir, yeniden hesaplanmaz
   * - stretch: bir ucu yerinde kalan hatlar; yeniden yönlenir
   * options.contents === false ise kapsayıcının içindekiler gelmez (Alt).
   */
  function movePlan(sheet, ids, options) {
    const selected = new Set(ids);
    const set = new Set(ids);
    const boxes = [];
    if (!options || options.contents !== false) {
      const ownGroups = new Set(sheet.items.filter((it) => selected.has(it.id) && it.group).map((it) => it.group));
      for (const c of sheet.items) {
        if (!selected.has(c.id) || !isSymbol(c) || !(Sym.get(c.symbol) || {}).container) continue;
        const b = boxOf(c);
        boxes.push(b);
        for (const other of sheet.items) {
          if (other.id === c.id || isLine(other) || other.type === 'legend') continue;
          if (!(other.x > b[0] && other.x < b[2] && other.y > b[1] && other.y < b[3])) continue;
          set.add(other.id);
          // İçeride kalan parça başka bir grubun üyesiyse o grup bölünmez
          if (other.group && !ownGroups.has(other.group)) for (const m of groupMembers(sheet, other.id)) set.add(m);
        }
      }
    }
    absorbJunctions(sheet, set);

    const inBoxes = (a) => boxes.some((b) => a.x > b[0] && a.x < b[2] && a.y > b[1] && a.y < b[3]);
    const plan = { ids: new Set(), nodes: [], rigid: [], stretch: [] };
    for (const it of sheet.items) {
      if (!isLine(it)) {
        if (set.has(it.id)) {
          plan.ids.add(it.id);
          plan.nodes.push({ item: it, x: it.x, y: it.y });
        }
        continue;
      }
      const moves = (a) => (a.node ? set.has(a.node) : set.has(it.id) || inBoxes(a));
      const fromMoves = moves(it.from);
      const toMoves = moves(it.to);
      if (!fromMoves && !toMoves) continue;
      (fromMoves && toMoves ? plan.rigid : plan.stretch).push({
        line: it,
        from: Object.assign({}, it.from),
        to: Object.assign({}, it.to),
        fromMoves,
        toMoves,
        manual: it.manual,
        path: it.path ? it.path.map((p) => p.slice()) : null
      });
    }
    return plan;
  }

  /** Planı başlangıç konumuna göre uygular; değişen hatların kimliklerini döner */
  function applyMove(sheet, plan, dx, dy) {
    for (const n of plan.nodes) {
      n.item.x = n.x + dx;
      n.item.y = n.y + dy;
    }
    const shifted = (a) => ({ x: a.x + dx, y: a.y + dy });
    const dirty = [];
    for (const r of plan.rigid) {
      if (!r.from.node) r.line.from = shifted(r.from);
      if (!r.to.node) r.line.to = shifted(r.to);
      if (r.path) r.line.path = r.path.map((p) => [p[0] + dx, p[1] + dy]);
      else refreshLine(sheet, r.line);
      dirty.push(r.line.id);
    }
    for (const s of plan.stretch) {
      if (!s.from.node && s.fromMoves) s.line.from = shifted(s.from);
      if (!s.to.node && s.toMoves) s.line.to = shifted(s.to);
      // Elle verilmiş rota her adımda aslından hesaplanır, sürüklerken yıpranmaz
      if (s.manual && s.path) {
        s.line.path = s.path;
        s.line.manual = true;
      }
      refreshLine(sheet, s.line);
      dirty.push(s.line.id);
    }
    return dirty;
  }

  /* ─── Ölçekleme ───────────────────────────────────────── */

  const SCALE_MIN = 0.3;
  const SCALE_MAX = 4;
  const roundTo = (v, step) => Math.round(v / step) * step;

  /** Öğenin asıl boyutuna göre şimdiki ölçeği (1 = %100) */
  function itemScale(item) {
    if (isSymbol(item)) {
      const def = Sym.get(item.symbol);
      return (def && def.resizable ? item.sizeScale : item.scale) || 1;
    }
    return item.sizeScale || 1;
  }

  /** Seçimin ortak boyutu (%); öğeler farklı boyuttaysa null */
  function selectionPercent(items) {
    const values = items.filter((it) => {
      if (isLine(it) || it.type === 'legend') return false;
      return !(isSymbol(it) && (Sym.get(it.symbol) || {}).hidden);
    }).map((it) => Math.round(itemScale(it) * 100));
    if (!values.length || values.some((v) => v !== values[0])) return null;
    return values[0];
  }

  /**
   * Seçimi büyütür/küçültür. Semboller ölçek, tank/hücre genişlik-yükseklik, yazılar punto alır.
   * spacing: aralıklar da ölçeklenir (seçimin ortasına göre), yoksa yerler sabit kalır.
   * absolute: her öğe asıl boyutunun bu oranına ayarlanır (0,7 = %70).
   */
  function scaleItems(sheet, ids, factor, options) {
    const opts = options || {};
    // Aralıklar da ölçeklenecekse seçimin içindeki bağlantı noktaları ve hatlar aynı oranda gelir
    const set = opts.spacing ? closeSelection(sheet, ids) : new Set(ids);
    const items = sheet.items.filter((it) => set.has(it.id) && !isLine(it) && it.type !== 'legend');
    if (!items.length) return [];
    let cx = 0;
    let cy = 0;
    let spread = factor;
    if (opts.spacing) {
      const boxes = items.map(boxOf);
      cx = (Math.min(...boxes.map((b) => b[0])) + Math.max(...boxes.map((b) => b[2]))) / 2;
      cy = (Math.min(...boxes.map((b) => b[1])) + Math.max(...boxes.map((b) => b[3]))) / 2;
      // Doğrudan değer girilince aralıklar da seçimin şimdiki boyutuna göre aynı oranda değişir
      const sized = items.filter((it) => !isJunction(it));
      if (opts.absolute && sized.length) spread = factor / (sized.reduce((sum, it) => sum + itemScale(it), 0) / sized.length);
    }
    const place = (it) => {
      it.x = cx + (it.x - cx) * spread;
      it.y = cy + (it.y - cy) * spread;
    };
    for (const it of items) {
      // Bağlantı noktasının boyutu olmaz, yalnız yeri değişir
      if (isJunction(it)) {
        if (opts.spacing) place(it);
        continue;
      }
      const before = isSymbol(it) ? (it.scale || 1) : 1;
      let f = factor;
      if (isSymbol(it)) {
        const def = Sym.get(it.symbol);
        if (def && def.resizable) {
          if (opts.absolute) f = factor / (it.sizeScale || 1);
          it.w = Math.max(10, roundTo(it.w * f, 0.5));
          it.h = Math.max(10, roundTo(it.h * f, 0.5));
          it.sizeScale = Math.round((it.sizeScale || 1) * f * 1000) / 1000;
        } else {
          const next = opts.absolute ? factor : before * factor;
          it.scale = Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, next)) * 100) / 100;
          if (it.scale === 1) delete it.scale;
          f = (it.scale || 1) / before;
        }
      } else if (it.type === 'text') {
        if (opts.absolute) f = factor / (it.sizeScale || 1);
        it.size = Math.max(1.5, Math.min(20, Math.round((it.size || 3.5) * f * 10) / 10));
        it.sizeScale = Math.round((it.sizeScale || 1) * f * 1000) / 1000;
      }
      if (opts.spacing) place(it);
    }
    // Aralıklarla ölçeklenen seçimde bütünüyle içeride kalan hatlar şeklini korur
    const kept = new Set();
    if (opts.spacing) {
      for (const l of sheet.items) if (l.type === 'legend' && set.has(l.id)) place(l);
      const at = (x, y) => [cx + (x - cx) * spread, cy + (y - cy) * spread];
      for (const l of sheet.items) {
        if (!isLine(l) || !l.path || !set.has(l.id)) continue;
        if ((l.from.node && !set.has(l.from.node)) || (l.to.node && !set.has(l.to.node))) continue;
        for (const end of ['from', 'to']) {
          if (l[end].node) continue;
          const [x, y] = at(l[end].x, l[end].y);
          l[end] = { x, y };
        }
        const path = Router.adjustManual(l.path.map((p) => at(p[0], p[1])), anchorPoint(sheet, l.from), anchorPoint(sheet, l.to));
        if (path) {
          l.path = path;
        } else {
          l.manual = false;
          refreshLine(sheet, l);
        }
        kept.add(l.id);
      }
    }
    // Uçları ölçeklenen öbür hatlar yeniden yönlenir; elle düzenlenmiş yollar bırakılır
    for (const l of sheet.items) {
      if (!isLine(l) || kept.has(l.id)) continue;
      if ((l.from.node && set.has(l.from.node)) || (l.to.node && set.has(l.to.node))) {
        l.manual = false;
        refreshLine(sheet, l);
      }
    }
    return items.map((it) => it.id);
  }

  /* ─── Sayfalar ────────────────────────────────────────── */

  /**
   * Seçimi başka sayfaya taşır; yerleri ve hat yolları aynen kalır, hedef sayfadaki hatlara dokunulmaz.
   * Dışarıda kalan uçlara bağlı hatlar iki sayfada da boşa çıkar.
   */
  function moveToSheet(fromSheet, toSheet, ids) {
    if (fromSheet === toSheet) return [];
    const set = closeSelection(fromSheet, ids);
    for (const l of fromSheet.items) {
      if (isLine(l) && set.has(l.id) && [l.from, l.to].some((a) => a.node && !set.has(a.node))) set.delete(l.id);
    }
    for (const l of fromSheet.items) {
      if (!isLine(l) || set.has(l.id)) continue;
      if (l.from.node && set.has(l.from.node)) l.from = freeAnchor(fromSheet, l.from);
      if (l.to.node && set.has(l.to.node)) l.to = freeAnchor(fromSheet, l.to);
    }
    const moving = fromSheet.items.filter((it) => set.has(it.id));
    fromSheet.items = fromSheet.items.filter((it) => !set.has(it.id));
    toSheet.items.push(...moving);
    cleanupJunctions(fromSheet);
    pruneGroups(fromSheet.items);
    updateJunctionDots(fromSheet);
    updateJunctionDots(toSheet);
    return moving.map((it) => it.id);
  }

  /** Sayfanın kopyası hemen arkasına eklenir */
  /**
   * Başka projenin çizim tahtasını bu çizime alır. Kaynak yalnız okunur; öğeler yeni kimlik alır.
   * Antet ve proje bilgileri (seri no, müşteri, revizyon) bu projede kalır, kaynağın revizyon geçmişi gelmez.
   * mode 'append': kaynak sayfalar sona yeni sayfa olarak eklenir.
   * mode 'replace': çizim kaynağınkiyle değişir; var olan sayfalar kimliğini ve çizim adını korur.
   * Dönen değer: alınan ilk sayfanın sırası.
   */
  function importSheets(drawing, source, mode) {
    const copies = source.sheets.map((src) => {
      const sheet = createSheet(src.title, src.size);
      sheet.items = cloneList(src, src.items, 0, 0);
      return sheet;
    });
    if (mode !== 'replace') {
      const first = drawing.sheets.length;
      drawing.sheets.push(...copies);
      return first;
    }
    const kept = drawing.sheets;
    drawing.sheets = copies.map((copy, i) => (kept[i]
      ? Object.assign(copy, { id: kept[i].id, title: kept[i].title })
      : copy));
    return 0;
  }

  function duplicateSheet(drawing, index) {
    const src = drawing.sheets[index];
    const copy = createSheet(`${src.title} (kopya)`, src.size);
    copy.items = cloneList(src, src.items, 0, 0);
    drawing.sheets.splice(index + 1, 0, copy);
    return copy;
  }

  /**
   * Sayfayı siler; son sayfa silinmez. Açık kalacak sayfanın sırasını döner:
   * başka bir sayfa silindiyse kullanıcı bulunduğu sayfada kalır.
   */
  function removeSheet(drawing, index, current) {
    if (drawing.sheets.length < 2 || !drawing.sheets[index]) return current;
    const open = drawing.sheets[current];
    drawing.sheets.splice(index, 1);
    const kept = drawing.sheets.indexOf(open);
    return kept >= 0 ? kept : Math.min(index, drawing.sheets.length - 1);
  }

  /** Sayfayı sola (-1) ya da sağa (+1) kaydırır; yeni sırasını döner */
  function moveSheet(drawing, index, dir) {
    const to = index + dir;
    if (to < 0 || to >= drawing.sheets.length) return index;
    const [sheet] = drawing.sheets.splice(index, 1);
    drawing.sheets.splice(to, 0, sheet);
    return to;
  }

  /**
   * Eski çizimlerde genel daireyle duran kodlu enstrümanları serisinin sembolüne geçirir.
   * Yalnız port adları aynı olan enstrümanlar geçer (hatlar kopmaz); vanaya dönecekler kullanıcıya önerilir.
   * Revizyon kaydı olan çizime dokunulmaz: yayımlanmış belge kendiliğinden değişmez ve bulut çıkmaz.
   * @param lookup Map kod -> {name}; dönen değer değişen öğe sayısı
   */
  function upgradeGenericSymbols(drawing, lookup) {
    if (drawing.revSnapshots && drawing.revSnapshots.length) return 0;
    let count = 0;
    for (const sheet of drawing.sheets) {
      const changed = [];
      for (const it of sheet.items) {
        if (!isSymbol(it) || it.symbol !== 'i.field' || !it.tag) continue;
        const tag = String(it.tag).trim().toUpperCase();
        const entry = lookup && lookup.get(tag);
        const next = Sym.suggest(tag, entry ? entry.name : '');
        const def = Sym.get(next.symbol);
        if (!def || !def.isInstrument || next.symbol === 'i.field') continue;
        const ports = new Set(def.ports.map((p) => p.id));
        const connected = attachedLines(sheet, it.id).every((l) => ['from', 'to'].every((end) =>
          l[end].node !== it.id || ports.has(l[end].port)));
        if (!connected) continue;
        it.symbol = next.symbol;
        if (!it.func && next.func) it.func = next.func;
        changed.push(it.id);
      }
      if (changed.length) refreshAttached(sheet, changed);
      count += changed.length;
    }
    return count;
  }

  /** Çizimde kullanılan kodlar: kod -> [{sheetId,itemId}] */
  function usedTags(drawing) {
    const map = new Map();
    for (const sheet of drawing.sheets) {
      for (const it of sheet.items) {
        if (!isSymbol(it) || !it.tag) continue;
        const tag = String(it.tag).trim().toUpperCase();
        if (!tag) continue;
        if (!map.has(tag)) map.set(tag, []);
        map.get(tag).push({ sheetId: sheet.id, itemId: it.id });
      }
    }
    return map;
  }

  return {
    SCHEMA,
    SHEET_SIZES,
    SIDE_DIR,
    geometry,
    uid,
    createDrawing,
    createSheet,
    findItem,
    isSymbol,
    isLine,
    toWorld,
    worldDir,
    boxOf,
    portsOf,
    perimeterPoint,
    nearestPerimeter,
    anchorPoint,
    refreshLine,
    refreshAll,
    refreshAttached,
    attachedLines,
    updateJunctionDots,
    addSymbol,
    addLine,
    addText,
    addLegend,
    nearestOnLine,
    hitLine,
    splitLine,
    insertInline,
    removeItems,
    cloneItems,
    cloneList,
    copyPayload,
    groupItems,
    ungroupItems,
    groupMembers,
    expandGroups,
    closeSelection,
    syncLineGroup,
    normalizeGroups,
    movePlan,
    applyMove,
    scaleItems,
    selectionPercent,
    moveToSheet,
    duplicateSheet,
    importSheets,
    removeSheet,
    moveSheet,
    upgradeGenericSymbols,
    usedTags
  };
});
