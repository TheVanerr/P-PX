/* Çizim veri modeli: DOM'a bağlı değildir, Node testlerinde de çalışır.
   Pnömatik sembollerde bobinler (item.coils) ve konum sensörleri (item.sensors) alt bileşen olarak tutulur. */

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
    return { id: uid('s'), title: title || 'Pnömatik Devre Şeması', size: size || 'A3', items: [] };
  }

  function createDrawing(title) {
    return { schema: SCHEMA, sheets: [createSheet(title)] };
  }

  const findItem = (sheet, id) => sheet.items.find((it) => it.id === id) || null;
  const isSymbol = (it) => it && it.type === 'symbol';
  const isLine = (it) => it && it.type === 'line';

  /** Yerel sembol noktası -> sayfa koordinatı (çevirme, döndürme, öteleme) */
  function toWorld(item, x, y) {
    let px = item.flip ? -x : x;
    let py = y;
    const rot = ((item.rot || 0) % 360 + 360) % 360;
    for (let i = 0; i < rot / 90; i += 1) {
      const t = px;
      px = -py;
      py = t;
    }
    return { x: item.x + px, y: item.y + py };
  }

  /** toWorld'ün tersi: sayfa koordinatını sembolün kendi koordinatına çevirir */
  function toLocal(item, x, y) {
    let px = x - item.x;
    let py = y - item.y;
    const rot = ((item.rot || 0) % 360 + 360) % 360;
    for (let i = 0; i < rot / 90; i += 1) {
      const t = px;
      px = py;
      py = -t;
    }
    return { x: item.flip ? -px : px, y: py };
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
    syncParts(item, def);
    sheet.items.push(item);
    return item;
  }

  /** Bobin sayısı sembole uyar; sensör listesi yalnız sensör taşıyabilen aktüatörde kalır */
  function syncParts(item, def) {
    const count = def.coils || 0;
    if (count) {
      const coils = Array.isArray(item.coils) ? item.coils.slice(0, count) : [];
      while (coils.length < count) coils.push({ tag: '', pid: '' });
      item.coils = coils.map((c) => ({ tag: String(c.tag || ''), pid: String(c.pid || '') }));
    } else if (item.coils) {
      delete item.coils;
    }
    if (def.sensors) {
      item.sensors = Array.isArray(item.sensors) ? item.sensors : [];
    } else if (item.sensors) {
      delete item.sensors;
    }
    return item;
  }

  function addLine(sheet, from, to, props) {
    const kind = (props && props.kind) || 'work';
    const meta = Sym.LINE_KINDS[kind] || Sym.LINE_KINDS.work;
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
    const junction = addSymbol(sheet, 'l.junction', near.x, near.y);
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
    const node = addSymbol(sheet, symbolId, near.x, near.y, Object.assign({}, props, { rot: rotByDir[near.dir] }));
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
    refreshLine(sheet, first);
    return true;
  }

  function removeItems(sheet, ids) {
    const removing = new Set(ids);

    // Hat üzerindeki vana silinirse hat onarılır
    for (const id of ids) {
      const node = findItem(sheet, id);
      if (!isSymbol(node)) continue;
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
    updateJunctionDots(sheet);
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

  function cloneList(sourceSheet, source, dx, dy) {
    const idMap = new Map();
    const copies = source.map((it) => {
      const copy = JSON.parse(JSON.stringify(it));
      copy.id = uid(it.type === 'line' ? 'l' : it.type === 'text' ? 't' : it.type === 'legend' ? 'g' : 'n');
      idMap.set(it.id, copy.id);
      return copy;
    });
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

  /** Sembolün kendisi, bobinleri ve sensörleri: [{part, index, tag, pid}] */
  function partsOf(it) {
    const out = [{ part: 'item', index: -1, tag: it.tag || '', pid: it.pid || '' }];
    (it.coils || []).forEach((c, i) => out.push({ part: 'coil', index: i, tag: c.tag || '', pid: c.pid || '' }));
    (it.sensors || []).forEach((s, i) => out.push({ part: 'sensor', index: i, tag: s.tag || '', pid: s.pid || '' }));
    return out;
  }

  function collect(drawing, key) {
    const map = new Map();
    for (const sheet of drawing.sheets) {
      for (const it of sheet.items) {
        if (!isSymbol(it)) continue;
        for (const part of partsOf(it)) {
          const code = String(part[key] || '').trim().toUpperCase();
          if (!code) continue;
          if (!map.has(code)) map.set(code, []);
          map.get(code).push({ sheetId: sheet.id, itemId: it.id, part: part.part, index: part.index });
        }
      }
    }
    return map;
  }

  /** Çizimde kullanılan pnömatik kodlar (bobin ve sensör kodları dahil): kod -> [{sheetId,itemId,part,index}] */
  function usedTags(drawing) {
    return collect(drawing, 'tag');
  }

  /** Çizime bağlanmış P&ID kodları: kod -> [{sheetId,itemId,part,index}] */
  function usedPids(drawing) {
    return collect(drawing, 'pid');
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
    toLocal,
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
    syncParts,
    partsOf,
    usedTags,
    usedPids
  };
});
