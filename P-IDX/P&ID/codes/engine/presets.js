/* Hazır gruplar: su tankı bırakıldığında çevresindeki ekipman otomatik eklenir.
   Tankın duvarında alt/üst seviye sensörü, tabanında 3 rezistans, altında (yerde) küresel vana ve pompa,
   üstünde şebeke suyu dolum vanası.
   Gerekmeyen parça silinebilir; bağlantı mantığı ve açıklamalar çizimden yeniden üretilir.
   Her su tankı çizimde bir kez bulunur. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./symbols.js'), require('./model.js'));
  } else {
    root.PidPresets = factory(root.PidSymbols, root.PidModel);
  }
})(typeof self !== 'undefined' ? self : this, function (Sym, Model) {
  'use strict';

  const HEATERS = 3;

  const pad = (n) => String(n).padStart(2, '0');

  /** Kod kataloğundaki "n. Proses Tankı" kodları */
  function codesFor(tankNo) {
    const n = tankNo;
    return {
      pump: `PE${pad(n)}`,
      fill: `V${19 + n}`,
      low: `LS${pad(3 * n - 2)}`,
      high: `LS${pad(3 * n)}`,
      heaters: Array.from({ length: HEATERS }, (_, i) => `R${pad(5 * n - 4 + i)}`)
    };
  }

  function has(symbolId) {
    const def = Sym.get(symbolId);
    return !!(def && def.preset);
  }

  /** Çizimde yalnız bir tane bulunabilen hazır sembol (su tankları) */
  function isSingle(symbolId) {
    const def = Sym.get(symbolId);
    return !!(def && def.preset && def.single);
  }

  /** Çizimin herhangi bir sayfasında bu sembol var mı (su tankları birer tane konur) */
  function placedIn(drawing, symbolId) {
    if (!drawing) return false;
    return drawing.sheets.some((sheet) => sheet.items.some((it) => Model.isSymbol(it) && it.symbol === symbolId));
  }

  /** Çizimde zaten bulunan, tekrar konamayacak hazır semboller */
  function usedPresets(drawing) {
    const used = new Set();
    if (!drawing) return used;
    for (const sheet of drawing.sheets) {
      for (const it of sheet.items) if (Model.isSymbol(it) && isSingle(it.symbol)) used.add(it.symbol);
    }
    return used;
  }

  /**
   * Su tankının grubunu ekler. Kodlar çizimde zaten kullanılıyorsa boş bırakılır.
   * Ölçüler varsayılan 110 × 70 tanka göredir; tank ne kadar büyükse grup o kadar yayılır.
   * @returns {{ items: object[], skippedTags: string[] }}
   */
  function applyWaterTank(sheet, tank, options) {
    const opts = options || {};
    const def = Sym.get(tank.symbol);
    const lang = def.notes && def.notes[opts.lang] ? opts.lang : 'tr';
    if (def.notes && (tank.note === undefined || tank.note === def.defaultNote)) tank.note = def.notes[lang];

    const used = opts.drawing ? Model.usedTags(opts.drawing) : new Map();
    const skippedTags = [];
    const free = (code) => {
      if (used.has(code)) {
        skippedTags.push(code);
        return '';
      }
      return code;
    };
    const codes = codesFor(def.tankNo);

    const hw = tank.w / 2;
    const hh = tank.h / 2;
    const created = [];
    const sym = (id, dx, dy, props) => {
      const node = Model.addSymbol(sheet, id, tank.x + dx, tank.y + dy, props);
      created.push(node);
      return node;
    };
    const line = (from, to, props) => {
      const l = Model.addLine(sheet, from, to, Object.assign({ auto: true }, props));
      created.push(l);
      return l;
    };
    const port = (node, id) => ({ node: node.id, port: id });
    const leftWall = (dy) => ({ node: tank.id, side: 'L', t: (dy + hh) / tank.h });

    /* Seviye sensörleri sol duvarda: üst seviye yukarıda, alt seviye ortada */
    const wallX = -hw - 15;
    const highY = -hh + 14;
    const lowY = 0;
    const high = sym('i.lsh', wallX, highY, { tag: free(codes.high) });
    const low = sym('i.lsl', wallX, lowY, { tag: free(codes.low) });

    /* Rezistanslar tank tabanında yan yana */
    const heaterY = hh - 11;
    const spread = Math.min(30, (tank.w - 30) / 2);
    const heaters = codes.heaters.map((code, i) => sym('h.resistance', (i - 1) * spread, heaterY, { tag: free(code) }));

    /* Pompa grubu yerde, tankın altında: emiş tabandan iner, küresel vana, pompa */
    const floorY = hh + 16;
    const suctionX = -hw + 17;
    const valve = sym('v.ball', -10, floorY, { presetRole: 'suctionValve' });
    const pump = sym('p.centrifugal', 20, floorY, { tag: free(codes.pump), presetRole: 'pump' });
    line({ node: tank.id, side: 'B', t: (suctionX + hw) / tank.w }, port(valve, 'L'), { kind: 'process' });
    line(port(valve, 'R'), port(pump, 'L'), { kind: 'process' });

    /* Dolum: şebeke suyu tankın üstünden aktüatörlü vanayla girer, üst seviyede vana kapanır */
    const fillY = -hh - 14;
    const inlet = sym('l.inlet', hw - 62, fillY, { note: 'ŞEBEKE SUYU', presetRole: 'fillInlet' });
    const fill = sym('v.pneumatic', hw - 30, fillY, { tag: free(codes.fill), presetRole: 'fillValve' });
    line(port(inlet, 'R'), port(fill, 'L'), { kind: 'utility' });
    line(port(fill, 'R'), { node: tank.id, side: 'T', t: (hw - 12 + hw) / tank.w }, { kind: 'utility' });

    /* Sinyaller: sensörler duvara, alt seviye ayrıca pompaya ve rezistanslara */
    line(port(high, 'R'), leftWall(highY), { kind: 'signal' });
    line(port(low, 'R'), leftWall(lowY), { kind: 'signal' });
    line(port(low, 'L'), port(pump, 'M'), { kind: 'signal' });
    line(port(high, 'U'), port(fill, 'A'), { kind: 'signal' });
    // Rezistanslara tek hat iner, üstlerinden dallanır; son rezistans hattın ucudur
    const bus = line(port(low, 'D'), port(heaters[HEATERS - 1], 'U'), { kind: 'signal' });
    const busY = heaterY - 3.5 - 6.5;
    let rest = bus;
    for (let i = 0; i < HEATERS - 1; i += 1) {
      const heater = heaters[i];
      const junction = Model.splitLine(sheet, rest.id, heater.x, tank.y + busY);
      junction.auto = true;
      created.push(junction);
      rest = sheet.items.find((it) => Model.isLine(it) && it.from.node === junction.id);
      line(port(junction, 'C'), port(heater, 'U'), { kind: 'signal' });
    }

    // Çizimde hücre kapak switchi varsa kapak açıkken bu pompa da çalışmaz
    for (const lid of byRole(sheet, 'lid')) created.push(...interlock(sheet, lid, [pump]));

    groupTogether(sheet, tank, created);
    Model.updateJunctionDots(sheet);
    return { items: created, skippedTags };
  }

  /**
   * Grubun hepsi hatlarıyla birlikte taşınır ve ölçeklenir; tek parça için ikinci kez tıklanır.
   * Başka bir gruba giden kilitleme hatları dışarıda kalır.
   */
  function groupTogether(sheet, main, items) {
    Model.groupItems(sheet, [main.id, ...items.filter((it) => !Model.isLine(it)).map((it) => it.id)]);
  }

  const byRole = (sheet, role) => sheet.items.filter((it) => Model.isSymbol(it) && it.presetRole === role);

  /** Kapak switchinden pompalara kilitleme hattı (zaten bağlıysa eklenmez) */
  function interlock(sheet, lid, pumps) {
    const lines = [];
    for (const pump of pumps) {
      const linked = sheet.items.some((it) => Model.isLine(it) &&
        ((it.from.node === lid.id && it.to.node === pump.id) || (it.from.node === pump.id && it.to.node === lid.id)));
      if (linked) continue;
      lines.push(Model.addLine(sheet, { node: lid.id, port: 'U' }, { node: pump.id, port: 'M' }, { kind: 'signal', auto: true }));
    }
    return lines;
  }

  /**
   * Yıkama hücresi grubu: üstte sprey manifoldu, ortada sepet, altta sepet redüktörü,
   * sol duvarda kapak switchi ve el koruma sensörü. Kapak switchi çizimdeki tank pompalarını kilitler.
   */
  function applyWashCell(sheet, cell, options) {
    const opts = options || {};
    const used = opts.drawing ? Model.usedTags(opts.drawing) : new Map();
    const skippedTags = [];
    const free = (code) => {
      if (used.has(code)) {
        skippedTags.push(code);
        return '';
      }
      return code;
    };
    const hw = cell.w / 2;
    const hh = cell.h / 2;
    const created = [];
    const sym = (id, dx, dy, props) => {
      const node = Model.addSymbol(sheet, id, cell.x + dx, cell.y + dy, props);
      created.push(node);
      return node;
    };
    const line = (from, to, props) => {
      const l = Model.addLine(sheet, from, to, Object.assign({ auto: true }, props));
      created.push(l);
      return l;
    };
    const port = (node, id) => ({ node: node.id, port: id });

    sym('e.spray', 0, -hh + 12, {});
    const basketSize = Math.max(20, Math.min(50, cell.w - 40, cell.h - 40));
    const basketY = hh - 10 - basketSize / 2;
    const basket = sym('e.basket', 0, basketY, { w: basketSize, h: basketSize });
    const gear = sym('d.gearmotor', -4, hh + 14, { tag: free('GE01') });
    line(port(gear, 'U'), { node: basket.id, side: 'B', t: 0.5 }, { kind: 'mech' });

    const lidY = -hh + 15;
    const lid = sym('i.lid', -hw - 15, lidY, { tag: free('SW18'), presetRole: 'lid' });
    const hand = sym('s.hand', -hw - 17, lidY + 24, { tag: free('SS01') });
    line(port(lid, 'R'), { node: cell.id, side: 'L', t: (lidY + hh) / cell.h }, { kind: 'signal' });
    line(port(hand, 'R'), port(lid, 'D'), { kind: 'signal' });
    const lidLines = interlock(sheet, lid, byRole(sheet, 'pump'));
    groupTogether(sheet, cell, created);
    created.push(...lidLines);

    Model.updateJunctionDots(sheet);
    return { items: created, skippedTags };
  }

  /** Sensörlü piston: üstte açık ve kapalı konum sensörü, sinyal hatlarıyla pistona bağlı; birlikte taşınır */
  function applyPistonSet(sheet, cylinder) {
    const sensorY = cylinder.y - 19;
    const open = Model.addSymbol(sheet, 'i.zso', cylinder.x - 14, sensorY);
    const closed = Model.addSymbol(sheet, 'i.zsc', cylinder.x + 10, sensorY);
    const link = (sensor, port) => Model.addLine(sheet, { node: sensor.id, port: 'D' }, { node: cylinder.id, port }, { kind: 'signal', auto: true });
    const created = [open, closed, link(open, 'S1'), link(closed, 'S2')];
    groupTogether(sheet, cylinder, created);
    Model.updateJunctionDots(sheet);
    return { items: created, skippedTags: [] };
  }

  /** Sembolün hazır grubu varsa ekler; yoksa null döner */
  function apply(sheet, node, options) {
    const def = Sym.get(node.symbol);
    if (!def || !def.preset) return null;
    if (def.preset === 'waterTank') return applyWaterTank(sheet, node, options);
    if (def.preset === 'washCell') return applyWashCell(sheet, node, options);
    if (def.preset === 'pistonSet') return applyPistonSet(sheet, node);
    return null;
  }

  /* ─── Makine kaydından taslak çizim ───────────────────── */

  const WATER_TANK_IDS = ['e.tankPreWash', 'e.tankWash', 'e.tankPreRinse', 'e.tankRinse'];
  /* Grubun tank/hücre merkezine göre kapladığı alan (mm), varsayılan ölçülerle */
  const FOOTPRINT = {
    tank: { left: 80, right: 58, top: 68, bottom: 62 },
    cell: { left: 86, right: 58, top: 48, bottom: 66 }
  };
  const GAP = 16;
  const PARK = { w: 30, h: 26 };

  /** Makinede bu tank var mı: seviye sensörü ya da rezistans kodu kayıtta geçiyorsa */
  function tankInMachine(n, codes) {
    const own = [];
    for (let k = 3 * n - 2; k <= 3 * n; k += 1) own.push(`LS${pad(k)}`);
    for (let k = 5 * n - 4; k <= 5 * n; k += 1) own.push(`R${pad(k)}`);
    return own.some((c) => codes.has(c));
  }

  /** Grupları satırlara dizer; sığmazsa null */
  function layout(groups, parked, size) {
    const sheet = Model.createSheet('', size);
    const g = Model.geometry(sheet);
    const x0 = g.inner.x0 + 4;
    const x1 = g.inner.x1 - 4;
    const bottom = g.title.y - 4;
    const rows = [];
    let row = null;
    for (const group of groups) {
      const fp = FOOTPRINT[group.kind];
      const width = fp.left + fp.right;
      if (width > x1 - x0) return null;
      if (!row || row.x + width > x1) {
        row = { x: x0, items: [] };
        rows.push(row);
      }
      row.items.push({ group, cx: row.x + fp.left });
      row.x += width + GAP;
    }
    let y = g.inner.y0 + 4;
    const placed = [];
    for (const r of rows) {
      const top = Math.max(...r.items.map((it) => FOOTPRINT[it.group.kind].top));
      const down = Math.max(...r.items.map((it) => FOOTPRINT[it.group.kind].bottom));
      for (const it of r.items) placed.push({ group: it.group, x: it.cx, y: y + top });
      y += top + down + GAP;
    }
    const cols = Math.max(1, Math.floor((x1 - x0) / PARK.w));
    const parkRows = Math.ceil(parked.length / cols);
    const parkAt = parked.map((code, i) => ({
      code,
      x: x0 + PARK.w / 2 + (i % cols) * PARK.w,
      y: y + 8 + Math.floor(i / cols) * PARK.h
    }));
    const end = parked.length ? y + 8 + (parkRows - 1) * PARK.h + 14 : y - GAP;
    if (end > bottom) return null;
    return { placed, parkAt, parkTop: y };
  }

  /**
   * Makine kaydındaki kodlardan taslak: su tankları ve yıkama hücresi hazır gruplarıyla,
   * geri kalan kodlar sayfanın altına dizilir. Grupta olup makinede olmayan parçalar çıkarılır.
   * Çizimin ilk sayfası boşsa oraya, değilse yeni bir sayfaya kurulur.
   * @param options.catalog Map kod -> {name}, options.lang, options.title
   */
  function buildDraft(drawing, machineCodes, options) {
    const opts = options || {};
    const codes = new Set((machineCodes || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean));
    const usedBefore = Model.usedTags(drawing);

    const groups = [];
    const hasCell = drawing.sheets.some((sh) => sh.items.some((it) => Model.isSymbol(it) && (Sym.get(it.symbol) || {}).vesselType === 'cell'));
    if (!hasCell) groups.push({ kind: 'cell', symbol: 'e.cabin' });
    WATER_TANK_IDS.forEach((id, i) => {
      if (tankInMachine(i + 1, codes) && !placedIn(drawing, id)) groups.push({ kind: 'tank', symbol: id });
    });

    // Gruplardan gelecek kodlar dizilecek bileşenlerden düşülür
    const groupCodes = new Set();
    for (const group of groups) {
      if (group.kind === 'cell') ['GE01', 'SW18', 'SS01'].forEach((c) => groupCodes.add(c));
      else {
        const c = codesFor(Sym.get(group.symbol).tankNo);
        [c.pump, c.fill, c.low, c.high, ...c.heaters].forEach((x) => groupCodes.add(x));
      }
    }
    const order = (code) => {
      const series = (code.match(/^[A-Z]+/) || [''])[0];
      return [series, parseInt(code.replace(/\D/g, ''), 10) || 0];
    };
    const parked = [...codes]
      .filter((c) => !usedBefore.has(c) && !groupCodes.has(c))
      .sort((a, b) => {
        const [sa, na] = order(a);
        const [sb, nb] = order(b);
        return sa === sb ? na - nb : sa.localeCompare(sb);
      });

    let plan = null;
    let size = null;
    for (const candidate of ['A3', 'A2', 'A1']) {
      plan = layout(groups, parked, candidate);
      if (plan) {
        size = candidate;
        break;
      }
    }
    if (!plan) {
      size = 'A1';
      plan = layout(groups, [], 'A1') || { placed: [], parkAt: [], parkTop: 0 };
    }

    const first = drawing.sheets[0];
    let sheet;
    if (first && !first.items.length) {
      sheet = first;
      sheet.size = size;
    } else {
      sheet = Model.createSheet(opts.title || 'Taslak (makine kaydı)', size);
      drawing.sheets.push(sheet);
    }

    const removed = new Set();
    const counts = { tanks: 0, cell: false };
    for (const { group, x, y } of plan.placed) {
      const node = Model.addSymbol(sheet, group.symbol, x, y);
      const res = apply(sheet, node, { lang: opts.lang, drawing });
      if (group.kind === 'tank') counts.tanks += 1;
      else counts.cell = true;
      // Makine kaydında olmayan kodlu parçalar çıkarılır; pompası gidenin vanası, dolum vanası gidenin girişi de gider
      const items = res.items;
      const drop = new Set(items.filter((it) => Model.isSymbol(it) && it.tag && !codes.has(String(it.tag).toUpperCase())).map((it) => it.id));
      const roleGone = (role) => items.some((it) => it.presetRole === role && drop.has(it.id));
      for (const it of items) {
        if (!Model.isSymbol(it)) continue;
        if (it.presetRole === 'suctionValve' && roleGone('pump')) drop.add(it.id);
        if (it.presetRole === 'fillInlet' && roleGone('fillValve')) drop.add(it.id);
      }
      if (!drop.size) continue;
      for (const it of items) if (drop.has(it.id) && it.tag) removed.add(String(it.tag).toUpperCase());
      for (const l of items) {
        if (Model.isLine(l) && ((l.from.node && drop.has(l.from.node)) || (l.to.node && drop.has(l.to.node)))) drop.add(l.id);
      }
      Model.removeItems(sheet, [...drop]);
    }

    const catalog = opts.catalog || new Map();
    for (const { code, x, y } of plan.parkAt) {
      const entry = catalog.get(code);
      const s = Sym.suggest(code, entry ? entry.name : '');
      const props = { tag: code };
      if (s.func) props.func = s.func;
      Model.addSymbol(sheet, s.symbol, x, y, props);
    }
    if (plan.parkAt.length) {
      Model.addText(sheet, plan.parkAt[0].x - PARK.w / 2 + 1, plan.parkTop + 1,
        'Yerleştirilecek bileşenler (makine kaydı)', { size: 2.8, bold: true });
    }
    Model.updateJunctionDots(sheet);
    return {
      sheetIndex: drawing.sheets.indexOf(sheet),
      size,
      tanks: counts.tanks,
      cell: counts.cell,
      parked: plan.parkAt.map((p) => p.code),
      notInMachine: [...removed].sort()
    };
  }

  return { has, isSingle, apply, codesFor, placedIn, usedPresets, buildDraft };
});
