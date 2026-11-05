/* Sürükle-bırak yerleştirme: P&ID Kodları ve Semboller sekmesinden gelen bileşene ISO 1219-2 kodu verir.
   - P&ID kodu boş alana bırakılınca sembol pnömatik koduyla gelir (V31 → 5V1 · 5Y1 [V31], PPS13 → 5B1 [PPS13]).
     Kodun devresi Kod Eşleştirme kurallarıyla (PidLink.group) bulunur: devreden bir kod şemadaysa onun devre
     numarası, değilse yeni devre numarası kullanılır.
   - Kod bir sembolün üstüne bırakılırsa o sembole bağlanır: valfin boş bobini, aktüatörün sensörü, besleme sensörü.
   - Kodun şemada bekleyen boş yeri varsa (eşi V31 çizili 5V1'in boş 12 bobini, devrenin aktüatörü) kod oraya yazılır.
   - Manyetik piston sensörü silindirin üstüne bırakılınca silindirin sensörü olur; konumu bırakılan yerden alınır.
   DOM'a bağlı değildir; ekran ve Node testleri aynı kodu kullanır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./symbols.js'), require('./model.js'), require('./pidlink.js'));
  } else {
    root.PidPlace = factory(root.PidSymbols, root.PidModel, root.PidLink);
  }
})(typeof self !== 'undefined' ? self : this, function (Sym, Model, Link) {
  'use strict';

  const upper = (v) => String(v || '').trim().toUpperCase();
  /** Sensör numarası: geri / kapalı 1, ileri / açık 2, ara 3 */
  const ROLE_NO = { B1: 1, B2: 2, B3: 3, SB: 1 };
  const POS_NO = (pos) => (pos >= 0.75 ? 2 : pos >= 0.25 ? 3 : 1);
  const POSITIONS = [0, 1, 0.5];
  const POS_WORD = { 0: 'geri', 0.5: 'ara', 1: 'ileri' };
  const COIL_SIDE = ['14', '12'];

  /* ─── Kodlar ──────────────────────────────────────────── */

  const usedSet = (drawing) => new Set(Model.usedTags(drawing).keys());

  /** Kullanılmayan ilk kod: önce istenen numara, yoksa 1'den başlayarak ilk boş numara (3V1, 3V2…) */
  function nextFree(circuit, letter, used, want) {
    if (want) {
      const tag = `${circuit}${letter}${want}`;
      if (!used.has(tag)) return tag;
    }
    for (let i = 1; i < 100; i += 1) {
      const tag = `${circuit}${letter}${i}`;
      if (!used.has(tag)) return tag;
    }
    return `${circuit}${letter}${want || 1}`;
  }

  /** Sembolün devre numarası: kendi kodundan, yoksa bobin ve sensör kodlarından */
  function circuitOfItem(item) {
    for (const part of Model.partsOf(item)) {
      const p = Link.parseIso(part.tag);
      if (p) return p.circuit;
    }
    return Number.isInteger(item.devre) ? item.devre : null;
  }

  function eachSymbol(drawing, fn) {
    for (const sheet of drawing.sheets) {
      for (const item of sheet.items) {
        if (!Model.isSymbol(item)) continue;
        const def = Sym.get(item.symbol);
        if (def && fn(item, def, sheet) === false) return;
      }
    }
  }

  /** Kodun şemadaki yerleri: [{kod, sheet, item, part, index, circuit}] */
  function usesOf(drawing, pids, kod) {
    const out = [];
    for (const u of pids.get(kod) || []) {
      const sheet = drawing.sheets.find((s) => s.id === u.sheetId);
      const item = sheet ? Model.findItem(sheet, u.itemId) : null;
      if (!item) continue;
      const part = u.part === 'coil' ? (item.coils || [])[u.index] : u.part === 'sensor' ? (item.sensors || [])[u.index] : item;
      const p = Link.parseIso(part && part.tag);
      out.push({ kod, sheet, item, part: u.part, index: u.index, circuit: p ? p.circuit : circuitOfItem(item) });
    }
    return out;
  }

  /* ─── Kodun yorumu ────────────────────────────────────── */

  /**
   * @param env {drawing, mapping: Map, catalog: [{id,name}], catalogMap: Map, projectCodes: [...]}
   * @returns {kod, name, kind: 'coil'|'sensor'|'main'|'pressure'|'free', group, slot, sensor, explicit, uses, mates, circuit}
   */
  function contextOf(code, env) {
    const kod = upper(code);
    const catalogMap = env.catalogMap || new Map();
    const nameOf = (k) => ((catalogMap.get(k) || {}).name || '');
    const drawing = env.drawing;
    const pids = Model.usedPids(drawing);
    const ctx = {
      kod, name: nameOf(kod), kind: 'free', group: null, slot: -1, sensor: null, explicit: false,
      uses: usesOf(drawing, pids, kod), mates: [], circuit: null
    };
    if (!Link.isRelevant(kod, ctx.name)) return ctx;

    // Projedeki kod projedeki eşleriyle, projede olmayan kod katalogdaki eşleriyle gruplanır (tıklamayla aynı kural)
    const pool = new Set([kod]);
    const project = env.projectCodes || [];
    if (project.includes(kod)) for (const k of project) pool.add(upper(k));
    else for (const c of env.catalog || []) if (Link.isRelevant(c.id, c.name)) pool.add(upper(c.id));
    const grouping = Link.group([...pool].map((k) => ({ kod: k, name: nameOf(k) })), env.mapping || new Map());
    if (grouping.supply.main && grouping.supply.main.kod === kod) return Object.assign(ctx, { kind: 'main', circuit: 0 });
    if (grouping.supply.pressure && grouping.supply.pressure.kod === kod) return Object.assign(ctx, { kind: 'pressure', circuit: 0 });
    const group = grouping.circuits.find((g) => g.codes.includes(kod));
    if (!group) return ctx;

    ctx.group = group;
    ctx.slot = group.coils.findIndex((c) => c && c.kod === kod);
    ctx.sensor = group.sensors.find((s) => s.kod === kod) || null;
    ctx.kind = ctx.slot >= 0 ? 'coil' : 'sensor';
    if (ctx.sensor) {
      const saved = env.mapping && env.mapping.get(kod);
      ctx.explicit = ctx.sensor.role === 'SB' || !!(saved && saved.rol) || !!Link.classify(kod, ctx.name).explicit;
    }
    for (const k of group.codes) if (k !== kod) ctx.mates.push(...usesOf(drawing, pids, k));
    // Devre numarası: devreden şemada çizili ilk kodunki (kodun kendisi dahil); yoksa yeni devre
    const known = ctx.uses.concat(ctx.mates).find((u) => u.circuit != null && u.circuit > 0);
    ctx.circuit = known ? known.circuit : Link.maxCircuit(drawing) + 1;
    return ctx;
  }

  /** Kod aynı görevle zaten şemada mı (bobin kodu bir bobinde, sensör kodu bir sensörde) */
  function existing(ctx) {
    const role = (u) => {
      const def = Sym.get(u.item.symbol) || {};
      if (ctx.kind === 'coil' || ctx.kind === 'main') return u.part === 'coil';
      if (ctx.kind === 'sensor') return u.part === 'sensor' || (u.part === 'item' && def.role === 'sensor');
      if (ctx.kind === 'pressure') return u.part === 'item' && def.role === 'sensor';
      return true;
    };
    return ctx.uses.find(role) || null;
  }

  /* ─── Değişiklikler (sembole bağlama) ─────────────────── */

  const itemName = (item) => upper(item.tag) || ((Sym.get(item.symbol) || {}).name || {}).tr || item.symbol;

  /** Valfin bobinine kod yazar; valf ve bobin kodsuzsa devre numarasına göre kod verir */
  function coilUpdate(sheet, item, slot, ctx, used) {
    const coils = (item.coils || []).map((c) => Object.assign({}, c));
    const own = circuitOfItem(item);
    const n = own == null ? ctx.circuit : own;
    const props = { coils };
    if (!upper(item.tag)) {
      props.tag = nextFree(n, 'V', used, 1);
      used.add(props.tag);
    }
    if (!upper(coils[slot].tag)) {
      coils[slot].tag = nextFree(n, 'Y', used, slot + 1);
      used.add(coils[slot].tag);
    }
    coils[slot].pid = ctx.kod;
    if (ctx.group && ctx.group.name && !String(item.desc || '').trim()) props.desc = ctx.group.name;
    const valve = props.tag || upper(item.tag);
    return {
      sheet, item, props,
      label: `${valve} · ${coils[slot].tag} (bobin ${COIL_SIDE[slot] || slot + 1})`,
      message: `${ctx.kod} → ${valve} valfinin ${COIL_SIDE[slot] || slot + 1} bobini ${coils[slot].tag}`
    };
  }

  /** Silindir üzerinde bırakılan yer: geri (0), ara (0.5), ileri (1) */
  function posAt(def, item, at) {
    const s = def.sensors;
    if (!s || s.layout !== 'top' || !at) return 0;
    const local = Model.toLocal(item, at.x, at.y);
    const t = (local.x - s.x0) / (s.x1 - s.x0);
    return [0, 0.5, 1].reduce((best, v) => (Math.abs(v - t) < Math.abs(best - t) ? v : best), 0);
  }

  /** Dolu konuma ikinci sensör konmaz: en yakın boş konum (hepsi doluysa istenen) */
  function freePos(sensors, pos) {
    const taken = new Set(sensors.map((s) => +s.pos || 0));
    if (!taken.has(pos)) return pos;
    const free = POSITIONS.filter((p) => !taken.has(p)).sort((a, b) => Math.abs(a - pos) - Math.abs(b - pos));
    return free.length ? free[0] : pos;
  }

  /**
   * Aktüatöre sensör ekler.
   * @param entry {pid, type, role, explicit, pos} sensörün bilgisi
   * @param at bırakılan yer (sayfa koordinatı) ya da null
   */
  function sensorUpdate(sheet, item, entry, circuit, used, at) {
    const def = Sym.get(item.symbol);
    const sensors = (item.sensors || []).map((s) => Object.assign({}, s));
    const own = circuitOfItem(item);
    const n = own == null ? circuit : own;
    const props = { sensors };
    if (own == null && n != null && !upper(item.tag)) {
      props.tag = nextFree(n, 'A', used, 1);
      used.add(props.tag);
    }
    // Konum adından (açık / kapalı / ara) ya da bırakılan yerden; doluysa en yakın boş konum (üst üste çizilmez)
    const want = entry.explicit || !at ? (entry.pos == null ? 0 : entry.pos) : posAt(def, item, at);
    const pos = def.sensors && def.sensors.layout === 'top' ? freePos(sensors, want) : want;
    const moved = pos !== want && entry.explicit;
    const number = entry.explicit ? (ROLE_NO[entry.role] || 1) : POS_NO(pos);
    const tag = n == null ? '' : nextFree(n, 'B', used, number);
    if (tag) used.add(tag);
    const sensor = { tag, pid: entry.pid || '', pos };
    if (entry.type) sensor.type = entry.type;
    sensors.push(sensor);
    const owner = props.tag || itemName(item);
    const label = `${owner} · ${tag || 'sensör'}`;
    const note = moved ? ` (${POS_WORD[want]} konumu dolu: ${POS_WORD[pos]} konuma kondu)` : '';
    return {
      sheet, item, props, label,
      message: (entry.pid ? `${entry.pid} → ${owner} sensörü ${tag || ''}` : `${owner}: manyetik sensör ${tag || ''} eklendi`).replace(/\s+$/, '') + note
    };
  }

  /** Bağımsız sensör sembolüne kod yazar */
  function standaloneUpdate(sheet, item, ctx, used) {
    const props = { pid: ctx.kod };
    if (!upper(item.tag)) {
      const n = ctx.kind === 'pressure' ? 0 : (circuitOfItem(item) == null ? ctx.circuit : circuitOfItem(item));
      props.tag = nextFree(n, 'B', used, ctx.sensor ? ROLE_NO[ctx.sensor.role] || 1 : 1);
      used.add(props.tag);
    }
    const tag = props.tag || upper(item.tag);
    return { sheet, item, props, label: tag, message: `${ctx.kod} → ${tag}` };
  }

  function sensorEntry(ctx) {
    return { pid: ctx.kod, role: ctx.sensor ? ctx.sensor.role : 'B1', explicit: ctx.explicit, pos: ctx.sensor ? ctx.sensor.pos : 0 };
  }

  /* ─── Hedefler ────────────────────────────────────────── */

  const freeCoil = (item) => (item.coils || []).some((c) => !upper(c.pid));

  /** Kodun üstüne bırakılabileceği sembol */
  function accepts(ctx, item) {
    const def = Sym.get(item.symbol);
    if (!def) return false;
    switch (ctx.kind) {
      case 'coil':
      case 'main':
        return def.role === 'directional' && freeCoil(item);
      case 'sensor':
        if (def.sensors) return !(item.sensors || []).some((s) => upper(s.pid) === ctx.kod);
        return def.role === 'sensor' && def.sense === 'position' && !upper(item.pid);
      case 'pressure':
        return def.role === 'sensor' && /^pressure/.test(def.sense || '') && !upper(item.pid);
      default:
        return false;
    }
  }

  function attachTo(ctx, env, sheet, item, at) {
    if (!accepts(ctx, item)) return null;
    const def = Sym.get(item.symbol);
    const used = usedSet(env.drawing);
    if (ctx.kind === 'coil' || ctx.kind === 'main') {
      const coils = item.coils || [];
      const want = ctx.kind === 'coil' ? ctx.slot : 0;
      const slot = coils[want] && !upper(coils[want].pid) ? want : coils.findIndex((c) => !upper(c.pid));
      return coilUpdate(sheet, item, slot, ctx, used);
    }
    if (ctx.kind === 'sensor' && def.sensors) return sensorUpdate(sheet, item, sensorEntry(ctx), ctx.circuit, used, at);
    return standaloneUpdate(sheet, item, ctx, used);
  }

  /** Kodun şemada bekleyen boş yeri */
  function pendingSlot(ctx, env) {
    const drawing = env.drawing;
    const used = usedSet(drawing);
    if (ctx.kind === 'coil') {
      // Eşi çizili valfin bu koda ait boş bobini (V31 çizili 5V1, 12 bobini boş → V32)
      for (const m of ctx.mates) {
        if (m.part !== 'coil') continue;
        const c = (m.item.coils || [])[ctx.slot];
        if (c && !upper(c.pid)) return coilUpdate(m.sheet, m.item, ctx.slot, ctx, used);
      }
      return null;
    }
    if (ctx.kind === 'sensor') {
      // Devrenin aktüatörü: devreden bir kod aktüatörde ya da aynı devre numaralı aktüatör
      let target = ctx.mates.find((m) => (Sym.get(m.item.symbol) || {}).sensors) || null;
      if (!target) {
        const circuits = new Set(ctx.mates.map((m) => m.circuit).filter((c) => c != null && c > 0));
        eachSymbol(drawing, (item, def, sheet) => {
          if (def.sensors && circuits.has(circuitOfItem(item))) {
            target = { sheet, item };
            return false;
          }
          return true;
        });
      }
      return target ? sensorUpdate(target.sheet, target.item, sensorEntry(ctx), ctx.circuit, used, null) : null;
    }
    if (ctx.kind === 'main' || ctx.kind === 'pressure') {
      // Beslemede (devre 0) kodu bekleyen sembol: ana valfin boş bobini, P&ID kodu boş basınç sensörü
      let found = null;
      eachSymbol(drawing, (item, def, sheet) => {
        if (circuitOfItem(item) !== 0) return true;
        if (ctx.kind === 'main' && def.role === 'directional' && (item.coils || [])[0] && !upper(item.coils[0].pid)) {
          found = coilUpdate(sheet, item, 0, ctx, used);
          return false;
        }
        if (ctx.kind === 'pressure' && def.role === 'sensor' && /^pressure/.test(def.sense || '') && !upper(item.pid)) {
          found = standaloneUpdate(sheet, item, ctx, used);
          return false;
        }
        return true;
      });
      return found;
    }
    return null;
  }

  /* ─── Yeni sembol ─────────────────────────────────────── */

  /** Boş alana bırakılınca yerleşecek sembol ve kodları */
  function freshSymbol(ctx, env) {
    const used = usedSet(env.drawing);
    const n = ctx.circuit;
    if (ctx.kind === 'coil') {
      const symbol = Link.VALVE_SYMBOL[ctx.group.valve] || 'v.52mono';
      const count = (Sym.get(symbol) || {}).coils || 1;
      const slot = Math.min(ctx.slot, count - 1);
      const tag = nextFree(n, 'V', used, 1);
      used.add(tag);
      const coils = [];
      for (let k = 0; k < count; k += 1) {
        const coilTag = nextFree(n, 'Y', used, k + 1);
        used.add(coilTag);
        coils.push({ tag: coilTag, pid: k === slot ? ctx.kod : '' });
      }
      return { symbol, tag, props: { coils, desc: ctx.group.name || '' }, label: `${tag} · ${coils[slot].tag}` };
    }
    if (ctx.kind === 'sensor') {
      const symbol = ctx.sensor.role === 'SB' ? 'k.position' : 'k.cylSensor';
      const tag = nextFree(n, 'B', used, ROLE_NO[ctx.sensor.role] || 1);
      return { symbol, tag, props: { pid: ctx.kod }, label: tag };
    }
    if (ctx.kind === 'main') {
      const tag = nextFree(0, 'V', used, 1);
      const coil = nextFree(0, 'Y', used, 1);
      return { symbol: 'v.32nc', tag, props: { coils: [{ tag: coil, pid: ctx.kod }] }, label: `${tag} · ${coil}` };
    }
    if (ctx.kind === 'pressure') {
      const symbol = /salter|bilgisi/.test(Link.fold(ctx.name)) ? 'k.pressureSwitch' : 'k.pressureSensor';
      const tag = nextFree(0, 'B', used, 1);
      return { symbol, tag, props: { pid: ctx.kod }, label: tag };
    }
    // Pnömatik olmayan ya da Kod Eşleştirme'de hariç tutulan kod: yalnız P&ID koduyla
    const s = Sym.suggest(ctx.kod, ctx.name);
    const def = Sym.get(s.symbol);
    const props = def.coils
      ? { coils: Array.from({ length: def.coils }, (_, i) => ({ tag: '', pid: i === 0 ? ctx.kod : '' })) }
      : { pid: ctx.kod };
    return { symbol: s.symbol, tag: '', props, label: '' };
  }

  /* ─── Dışa açılan arayüz ──────────────────────────────── */

  /**
   * P&ID kodunun sürükleme planı.
   * @returns {kod, kind, circuit, symbol, tag, props, label, pending, exists, accepts(item), attach(sheet, item, at)}
   *   pending: kodun şemada bekleyen boş yeri (bırakılan yer neresi olursa olsun oraya yazılır) ya da null
   *   exists: kod aynı görevle şemadaysa onun yeri ya da null
   */
  function forCode(code, env) {
    const ctx = contextOf(code, env);
    const fresh = freshSymbol(ctx, env);
    const found = existing(ctx);
    return {
      kod: ctx.kod,
      name: ctx.name,
      kind: ctx.kind,
      circuit: ctx.circuit,
      symbol: fresh.symbol,
      tag: fresh.tag,
      props: fresh.props,
      label: fresh.label,
      pending: found ? null : pendingSlot(ctx, env),
      exists: found ? { sheet: found.sheet, item: found.item, part: found.part, index: found.index } : null,
      accepts: (item) => accepts(ctx, item),
      attach: (sheet, item, at) => attachTo(ctx, env, sheet, item, at)
    };
  }

  /**
   * Paletten sürüklenen sembolün bağlanma planı: manyetik piston sensörü silindirin üstüne bırakılınca sensörü olur.
   * @returns {accepts(item), attach(sheet, item, at)} ya da null
   */
  function forSymbol(symbolId, env) {
    const def = Sym.get(symbolId);
    if (!def || def.attach !== 'actuator') return null;
    const target = (item) => {
      const d = Sym.get(item.symbol);
      return !!(d && d.sensors && d.sensors.layout === 'top');
    };
    return {
      accepts: target,
      attach: (sheet, item, at) => {
        if (!target(item)) return null;
        const circuit = circuitOfItem(item);
        return sensorUpdate(sheet, item, { pid: '', type: def.magnetic || '', explicit: false, pos: 0 }, circuit, usedSet(env.drawing), at);
      }
    };
  }

  /** Aktüatöre "Sensör ekle" ile eklenecek sensörün konumu ve kodu */
  function nextSensor(item, drawing) {
    const sensors = item.sensors || [];
    const pos = freePos(sensors, 0);
    const n = circuitOfItem(item);
    return { tag: n == null ? '' : nextFree(n, 'B', usedSet(drawing), POS_NO(pos)), pid: '', pos };
  }

  return { forCode, forSymbol, nextSensor, nextFree, circuitOfItem, contextOf };
});
