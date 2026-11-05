/* Ortogonal hat yönlendirici: seyrek ızgara üzerinde A*.
   Engel kutularının etrafından dolaşır, az dirsek ve mevcut hatlarla çakışmama tercih eder. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PidRouter = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STUB = 5;
  const MARGIN = 2.5;
  const BEND_COST = 12;
  const OVERLAP_COST = 25;
  const REGION_PAD = 45;
  const DIRS = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] };
  const OPPOSITE = { L: 'R', R: 'L', U: 'D', D: 'U' };

  const round = (v) => Math.round(v * 1000) / 1000;
  const snap = (v) => Math.round(v / 2.5) * 2.5;

  function simplify(points) {
    const out = [];
    for (const p of points) {
      const last = out[out.length - 1];
      if (last && Math.abs(last[0] - p[0]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6) continue;
      if (out.length >= 2) {
        const prev = out[out.length - 2];
        const sameX = Math.abs(prev[0] - last[0]) < 1e-6 && Math.abs(last[0] - p[0]) < 1e-6;
        const sameY = Math.abs(prev[1] - last[1]) < 1e-6 && Math.abs(last[1] - p[1]) < 1e-6;
        if (sameX || sameY) {
          out[out.length - 1] = p;
          continue;
        }
      }
      out.push(p);
    }
    return out;
  }

  function segmentBlocked(x0, y0, x1, y1, boxes) {
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1);
    const maxY = Math.max(y0, y1);
    for (const b of boxes) {
      if (maxX > b[0] && minX < b[2] && maxY > b[1] && minY < b[3]) return true;
    }
    return false;
  }

  class MinHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    push(item) {
      const a = this.items;
      a.push(item);
      let i = a.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (a[parent].f <= a[i].f) break;
        [a[parent], a[i]] = [a[i], a[parent]];
        i = parent;
      }
    }
    pop() {
      const a = this.items;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < a.length && a[l].f < a[m].f) m = l;
          if (r < a.length && a[r].f < a[m].f) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top;
    }
  }

  /** Doğrudan L veya Z rota; yol bulunamazsa son çare */
  function fallback(a, b) {
    const horizontalFirst = a.dir === 'L' || a.dir === 'R' || (!a.dir && Math.abs(b.x - a.x) >= Math.abs(b.y - a.y));
    if (Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6) return [[a.x, a.y], [b.x, b.y]];
    if (horizontalFirst) {
      const mx = snap((a.x + b.x) / 2);
      return simplify([[a.x, a.y], [mx, a.y], [mx, b.y], [b.x, b.y]]);
    }
    const my = snap((a.y + b.y) / 2);
    return simplify([[a.x, a.y], [a.x, my], [b.x, my], [b.x, b.y]]);
  }

  /**
   * @param a {x,y,dir} başlangıç (dir: dışa doğru L/R/U/D veya null)
   * @param b {x,y,dir} bitiş
   * @param opts.obstacles [[x0,y0,x1,y1],...] kaçınılacak kutular
   * @param opts.occupied  [[x0,y0,x1,y1],...] mevcut hat parçaları
   */
  function route(a, b, opts) {
    const options = opts || {};

    // Karşılıklı bakan ve aynı hizadaki portlar: arada engel yoksa düz hat
    if (a.dir && b.dir && a.dir === OPPOSITE[b.dir]) {
      const [ux, uy] = DIRS[a.dir];
      const along = (b.x - a.x) * ux + (b.y - a.y) * uy;
      const side = Math.abs((b.x - a.x) * uy) + Math.abs((b.y - a.y) * ux);
      if (along > 0 && side < 1e-6 && !segmentBlocked(a.x, a.y, b.x, b.y, options.obstacles || [])) {
        return [[a.x, a.y], [b.x, b.y]];
      }
    }

    // Yakın portlarda çıkış payı kısalır, yoksa hat geri dönüp kıvrılır
    const stub = Math.min(STUB, Math.max(1.5, (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) / 3));

    // Kenara yakın portun çıkışı çizim alanını aşmasın
    const clampStub = (p, x, y) => {
      if (!options.bounds) return [x, y];
      const [bx0, by0, bx1, by1] = options.bounds;
      return [
        Math.min(Math.max(x, Math.min(bx0, p.x)), Math.max(bx1, p.x)),
        Math.min(Math.max(y, Math.min(by0, p.y)), Math.max(by1, p.y))
      ];
    };
    const start = a.dir
      ? clampStub(a, a.x + DIRS[a.dir][0] * stub, a.y + DIRS[a.dir][1] * stub)
      : [a.x, a.y];
    const goal = b.dir
      ? clampStub(b, b.x + DIRS[b.dir][0] * stub, b.y + DIRS[b.dir][1] * stub)
      : [b.x, b.y];

    let minX = Math.min(a.x, b.x, start[0], goal[0]) - REGION_PAD;
    let maxX = Math.max(a.x, b.x, start[0], goal[0]) + REGION_PAD;
    let minY = Math.min(a.y, b.y, start[1], goal[1]) - REGION_PAD;
    let maxY = Math.max(a.y, b.y, start[1], goal[1]) + REGION_PAD;
    if (options.bounds) {
      // Hat çizim alanından çıkmasın; uçlar zaten dışarıdaysa onlara kadar izin verilir.
      const [bx0, by0, bx1, by1] = options.bounds;
      minX = Math.max(minX, Math.min(bx0, a.x, b.x, start[0], goal[0]));
      maxX = Math.min(maxX, Math.max(bx1, a.x, b.x, start[0], goal[0]));
      minY = Math.max(minY, Math.min(by0, a.y, b.y, start[1], goal[1]));
      maxY = Math.min(maxY, Math.max(by1, a.y, b.y, start[1], goal[1]));
    }

    const boxes = [];
    for (const o of options.obstacles || []) {
      if (o[2] < minX || o[0] > maxX || o[3] < minY || o[1] > maxY) continue;
      boxes.push(o);
    }
    // Hat, engel kenarındaki pay çizgisinde yürüyebilsin diye engel biraz daha dar sayılır.
    const contains = (box, p) => p[0] > box[0] && p[0] < box[2] && p[1] > box[1] && p[1] < box[3];
    const blocked = boxes
      .map((o) => [o[0] - MARGIN + 0.01, o[1] - MARGIN + 0.01, o[2] + MARGIN - 0.01, o[3] + MARGIN - 0.01])
      // Başlangıç veya bitişi saran engel yolu tamamen kapatmasın.
      .filter((box) => !contains(box, start) && !contains(box, goal));

    const xSet = new Set([start[0], goal[0], a.x, b.x, snap((start[0] + goal[0]) / 2), round(minX), round(maxX)]);
    const ySet = new Set([start[1], goal[1], a.y, b.y, snap((start[1] + goal[1]) / 2), round(minY), round(maxY)]);
    for (const o of boxes) {
      xSet.add(round(o[0] - MARGIN));
      xSet.add(round(o[2] + MARGIN));
      ySet.add(round(o[1] - MARGIN));
      ySet.add(round(o[3] + MARGIN));
    }
    const xs = [...xSet].filter((v) => v >= minX && v <= maxX).sort((p, q) => p - q);
    const ys = [...ySet].filter((v) => v >= minY && v <= maxY).sort((p, q) => p - q);
    const xIndex = new Map(xs.map((v, i) => [v, i]));
    const yIndex = new Map(ys.map((v, i) => [v, i]));

    const occH = new Map();
    const occV = new Map();
    for (const s of options.occupied || []) {
      if (Math.abs(s[1] - s[3]) < 1e-6) {
        const key = round(s[1]);
        if (!occH.has(key)) occH.set(key, []);
        occH.get(key).push([Math.min(s[0], s[2]), Math.max(s[0], s[2])]);
      } else if (Math.abs(s[0] - s[2]) < 1e-6) {
        const key = round(s[0]);
        if (!occV.has(key)) occV.set(key, []);
        occV.get(key).push([Math.min(s[1], s[3]), Math.max(s[1], s[3])]);
      }
    }
    const overlapCost = (fixed, lo, hi, map) => {
      const runs = map.get(round(fixed));
      if (!runs) return 0;
      for (const r of runs) {
        if (hi > r[0] + 0.01 && lo < r[1] - 0.01) return OVERLAP_COST;
      }
      return 0;
    };

    const sx = xIndex.get(start[0]);
    const sy = yIndex.get(start[1]);
    const gx = xIndex.get(goal[0]);
    const gy = yIndex.get(goal[1]);
    if (sx === undefined || sy === undefined || gx === undefined || gy === undefined) return fallback(a, b);

    const DIR_LIST = ['L', 'R', 'U', 'D'];
    const key = (ix, iy, d) => ix + iy * xs.length + (DIR_LIST.indexOf(d) + 1) * xs.length * ys.length;
    const heuristic = (ix, iy) => Math.abs(xs[ix] - goal[0]) + Math.abs(ys[iy] - goal[1]);
    const arrival = b.dir ? OPPOSITE[b.dir] : null;

    const open = new MinHeap();
    const best = new Map();
    const startDir = a.dir || null;
    const startKey = startDir ? key(sx, sy, startDir) : key(sx, sy, 'L') - (1) * xs.length * ys.length;
    best.set(startKey, 0);
    open.push({ f: heuristic(sx, sy), g: 0, ix: sx, iy: sy, d: startDir, parent: null, k: startKey });

    let found = null;
    let guard = 0;
    while (open.size && guard < 60000) {
      guard += 1;
      const cur = open.pop();
      if (cur.g > (best.get(cur.k) ?? Infinity)) continue;
      if (cur.ix === gx && cur.iy === gy) {
        const extra = arrival && cur.d && cur.d !== arrival ? BEND_COST : 0;
        if (!found || cur.g + extra < found.total) found = { node: cur, total: cur.g + extra };
        if (open.size === 0 || open.items[0].f >= found.total) break;
        continue;
      }
      for (const d of DIR_LIST) {
        if (cur.d && d === OPPOSITE[cur.d]) continue;
        const nx = cur.ix + DIRS[d][0];
        const ny = cur.iy + DIRS[d][1];
        if (nx < 0 || ny < 0 || nx >= xs.length || ny >= ys.length) continue;
        const x0 = xs[cur.ix];
        const y0 = ys[cur.iy];
        const x1 = xs[nx];
        const y1 = ys[ny];
        if (segmentBlocked(x0, y0, x1, y1, blocked)) continue;
        const length = Math.abs(x1 - x0) + Math.abs(y1 - y0);
        const bend = cur.d && cur.d !== d ? BEND_COST : 0;
        const overlap = d === 'L' || d === 'R'
          ? overlapCost(y0, Math.min(x0, x1), Math.max(x0, x1), occH)
          : overlapCost(x0, Math.min(y0, y1), Math.max(y0, y1), occV);
        const g = cur.g + length + bend + overlap;
        const k = key(nx, ny, d);
        if (g < (best.get(k) ?? Infinity)) {
          best.set(k, g);
          open.push({ f: g + heuristic(nx, ny), g, ix: nx, iy: ny, d, parent: cur, k });
        }
      }
    }

    if (!found) return fallback(a, b);

    const middle = [];
    for (let n = found.node; n; n = n.parent) middle.push([xs[n.ix], ys[n.iy]]);
    middle.reverse();
    return simplify([[a.x, a.y], ...middle, [b.x, b.y]]);
  }

  /** Elle düzenlenmiş rotada uçlar taşındığında dikliği korur */
  function adjustManual(oldPath, a, b) {
    if (!oldPath || oldPath.length < 2) return null;
    const pts = oldPath.map((p) => [p[0], p[1]]);
    const last = pts.length - 1;
    if (pts.length === 2) {
      if (Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6) return [[a.x, a.y], [b.x, b.y]];
      return null;
    }
    const firstHorizontal = Math.abs(pts[0][1] - pts[1][1]) < 1e-6;
    if (firstHorizontal) pts[1][1] = a.y;
    else pts[1][0] = a.x;
    const lastHorizontal = Math.abs(pts[last][1] - pts[last - 1][1]) < 1e-6;
    if (lastHorizontal) pts[last - 1][1] = b.y;
    else pts[last - 1][0] = b.x;
    pts[0] = [a.x, a.y];
    pts[last] = [b.x, b.y];
    return simplify(pts);
  }

  return { route, adjustManual, simplify, fallback, STUB, MARGIN };
});
