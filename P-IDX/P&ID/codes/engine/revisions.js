/* Revizyon işaretleri: her "Revizyon ekle" çizimin o anki hâlini saklar.
   Bir önceki revizyondan bu yana değişen, eklenen ve silinen öğeler bulutla çevrilir,
   yanına son revizyonun numarası üçgen içinde yazılır. Bulutlar "Revizyon" katmanındadır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./model.js'));
  } else {
    root.PidRevisions = factory(root.PidModel);
  }
})(typeof self !== 'undefined' ? self : this, function (Model) {
  'use strict';

  const KEEP = 4;
  const PAD = 3;
  const MERGE_GAP = 6;
  const SCALLOP = 2.2;

  const r1 = (v) => Math.round(v * 10) / 10;

  /** Görünüşü etkileyen alanlar; hat yolu başka sembol oynayınca da değiştiği için alınmaz */
  function fingerprint(item) {
    if (Model.isLine(item)) {
      const end = (a) => (a.node ? `${a.node}:${a.port || a.side}:${a.t == null ? '' : r1(a.t * 100)}` : `${r1(a.x)},${r1(a.y)}`);
      return ['L', item.kind, end(item.from), end(item.to), item.label || '', !!item.optional].join('|');
    }
    if (Model.isSymbol(item)) {
      return ['S', item.symbol, r1(item.x), r1(item.y), item.rot || 0, !!item.flip, item.tag || '', item.func || '',
        item.note || '', r1(item.w || 0), r1(item.h || 0), !!item.optional, item.scale || 1].join('|');
    }
    if (item.type === 'text') return ['T', item.text, r1(item.x), r1(item.y), item.size || ''].join('|');
    return null;
  }

  const tracked = (item) => fingerprint(item) !== null && !(Model.isSymbol(item) && item.symbol === 'l.junction');

  function snapshot(drawing) {
    const sheets = {};
    for (const sheet of drawing.sheets) {
      const items = {};
      for (const it of sheet.items) {
        if (!tracked(it)) continue;
        items[it.id] = { fp: fingerprint(it), box: Model.boxOf(it).map(r1), line: Model.isLine(it) };
      }
      sheets[sheet.id] = items;
    }
    return sheets;
  }

  /** Revizyon eklenince çağrılır; son dört kayıt saklanır */
  function record(drawing, rev) {
    const list = Array.isArray(drawing.revSnapshots) ? drawing.revSnapshots : [];
    list.push({ rev: String(rev), sheets: snapshot(drawing) });
    drawing.revSnapshots = list.slice(-KEEP);
  }

  /** Revizyon kaydı silinince ona ait anlık görüntü de silinir */
  function forget(drawing, rev) {
    const list = drawing.revSnapshots || [];
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].rev === String(rev)) {
        list.splice(i, 1);
        break;
      }
    }
  }

  /** İşaretlenecek revizyon: son kayıt; karşılaştırma bir öncekiyle */
  function active(drawing) {
    const list = drawing && drawing.revSnapshots;
    if (!list || list.length < 2) return null;
    return { rev: list[list.length - 1].rev, base: list[list.length - 2] };
  }

  const overlaps = (a, b, gap) => a[0] - gap <= b[2] && b[0] - gap <= a[2] && a[1] - gap <= b[3] && b[1] - gap <= a[3];
  const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

  /** Değişen bölgeler: semboller ve yazılar bulut, hatlar yalnız işaret */
  function changes(drawing, sheet) {
    const act = active(drawing);
    if (!act) return { rev: null, clouds: [], marks: [], count: 0 };
    const base = act.base.sheets[sheet.id] || {};
    const boxes = [];
    const marks = [];
    const seen = new Set();
    let count = 0;
    for (const it of sheet.items) {
      if (!tracked(it)) continue;
      seen.add(it.id);
      const before = base[it.id];
      if (before && before.fp === fingerprint(it)) continue;
      count += 1;
      if (Model.isLine(it)) {
        if (it.path && it.path.length > 1) {
          const mid = it.path[Math.floor((it.path.length - 1) / 2)];
          const next = it.path[Math.floor((it.path.length - 1) / 2) + 1];
          marks.push([(mid[0] + next[0]) / 2, (mid[1] + next[1]) / 2]);
        }
        continue;
      }
      boxes.push(Model.boxOf(it));
      // Taşınan sembolün eski yeri de işaretlenir
      if (before && !before.line) boxes.push(before.box);
    }
    // Silinenler eski yerinde
    for (const [id, before] of Object.entries(base)) {
      if (seen.has(id)) continue;
      count += 1;
      if (!before.line) boxes.push(before.box);
    }
    // Yakın bulutlar birleşir: bir tank grubu tek bulut olur
    let clouds = boxes.map((b) => [b[0] - PAD, b[1] - PAD, b[2] + PAD, b[3] + PAD]);
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < clouds.length; i += 1) {
        for (let j = i + 1; j < clouds.length; j += 1) {
          if (overlaps(clouds[i], clouds[j], MERGE_GAP)) {
            clouds[i] = union(clouds[i], clouds[j]);
            clouds.splice(j, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
    // Bulut içinde kalan hat işaretleri ayrıca çizilmez
    const free = marks.filter(([x, y]) => !clouds.some((c) => x >= c[0] && x <= c[2] && y >= c[1] && y <= c[3]));
    return { rev: act.rev, clouds, marks: free, count };
  }

  /** Kenarları dışa bakan yaylardan oluşan bulut */
  function cloudPath(box) {
    const [x0, y0, x1, y1] = box;
    const edge = (ax, ay, bx, by) => {
      const len = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.round(len / (SCALLOP * 2)));
      const dx = (bx - ax) / n;
      const dy = (by - ay) / n;
      const r = r1(Math.hypot(dx, dy) / 2 + 0.05);
      let d = '';
      for (let i = 1; i <= n; i += 1) d += `A${r} ${r} 0 0 1 ${r1(ax + dx * i)} ${r1(ay + dy * i)}`;
      return d;
    };
    return `M${r1(x0)} ${r1(y0)}${edge(x0, y0, x1, y0)}${edge(x1, y0, x1, y1)}${edge(x1, y1, x0, y1)}${edge(x0, y1, x0, y0)}Z`;
  }

  function delta(x, y, rev) {
    const esc = String(rev).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `<path d="M${r1(x)} ${r1(y - 4.2)}L${r1(x + 4.2)} ${r1(y + 2.8)}H${r1(x - 4.2)}Z" fill="#fff" stroke="currentColor" stroke-width="0.35"/>` +
      `<text x="${r1(x)}" y="${r1(y + 1.9)}" font-size="2.6" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">${esc}</text>`;
  }

  /** Sayfanın revizyon işaretleri (SVG); revizyon yoksa boş */
  function renderMarks(drawing, sheet) {
    const res = changes(drawing, sheet);
    if (!res.rev || !res.count) return '';
    let out = '';
    for (const c of res.clouds) {
      out += `<path d="${cloudPath(c)}" fill="none" stroke="currentColor" stroke-width="0.35"/>`;
      out += delta(c[2], c[1], res.rev);
    }
    for (const [x, y] of res.marks) out += delta(x, y - 4, res.rev);
    return `<g class="layer-rev" color="#000">${out}</g>`;
  }

  return { fingerprint, snapshot, record, forget, active, changes, renderMarks };
});
