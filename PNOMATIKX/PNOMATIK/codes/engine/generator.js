/* Otomatik pnömatik devre çizimi (ISO 1219-2 yerleşimi).
   Enerji akışı aşağıdan yukarıya: besleme (0Z1, 0V…) → ana hat → yön valfleri → akış kontrol → aktüatörler.
   Her devre bir sütundur; A3 sayfaya en çok 7 devre sığar, fazlası yeni sayfaya geçer ve ana hat sayfa bağlantısıyla sürer.
   DOM'a bağlı değildir; ekran ve Node testleri aynı kodu kullanır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./symbols.js'), require('./model.js'));
  } else {
    root.PidGen = factory(root.PidSymbols, root.PidModel);
  }
})(typeof self !== 'undefined' ? self : this, function (Sym, Model) {
  'use strict';

  const Y = { title: 38, act: 64, fc: 92, valve: 120, hdr: 146 };
  const COL0 = 80;
  const COL_W = 46;
  const PER_SHEET = 7;
  const SX = 42;
  const TITLE = { tr: 'Pnömatik Devre Şeması', en: 'Pneumatic Circuit Diagram', de: 'Pneumatikschaltplan' };
  const PAGE = { tr: 'ŞEMA', en: 'SHEET', de: 'BLATT' };
  const AIR = { tr: 'BASINÇLI HAVA 6 bar', en: 'COMPRESSED AIR 6 bar', de: 'DRUCKLUFT 6 bar' };

  const upper = (text, lang) => String(text || '').toLocaleUpperCase(lang === 'tr' || !lang ? 'tr' : lang);

  /** Uzun devre adını sütun genişliğine böler (en çok 3 satır) */
  function wrap(text, max) {
    const out = [];
    let line = '';
    for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
      if (line && (line + ' ' + word).length > max) {
        out.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) out.push(line);
    if (out.length > 3) {
      const rest = out.slice(2).join(' ');
      return out.slice(0, 2).concat(rest.length > max ? `${rest.slice(0, max - 1)}…` : rest).join('\n');
    }
    return out.join('\n');
  }

  const columnX = (col) => COL0 + col * COL_W;
  const portOf = (item, id) => Model.portsOf(item).find((p) => p.id === id) || null;

  /** Bir devre sütununu yerleştirir; hatlar ayrıca kurulur ki rota tüm sembolleri görsün */
  function placeCircuit(sheet, c, col, opts, links) {
    const cx = columnX(col);
    const mark = (props) => Object.assign({ devre: c.nr, col }, props);

    if (opts.names !== false && c.name) {
      Model.addText(sheet, cx - 17, Y.title, wrap(upper(c.name, opts.lang), 30), { size: 2.3, bold: true, devre: c.nr, col });
    }

    const actDef = Sym.get(c.actuatorSymbol) || Sym.get('a.cylDouble');
    const act = Model.addSymbol(sheet, actDef.id, cx, Y.act, mark({
      tag: c.actuatorTag || '',
      pid: c.actuatorPid || '',
      desc: c.name || '',
      sensors: (c.sensors || []).map((s) => ({ tag: s.tag || '', pid: s.pid || '', pos: s.pos == null ? 0 : s.pos }))
    }));

    const vDef = Sym.get(c.valveSymbol) || Sym.get('v.52mono');
    const has4 = vDef.ports.some((p) => p.id === '4');
    const lead = vDef.ports.find((p) => p.id === (has4 ? '4' : '2'));
    const valve = Model.addSymbol(sheet, vDef.id, cx - 2.5 - lead.x, Y.valve, mark({
      tag: c.valveTag || '',
      desc: c.name || '',
      coils: (c.coils || []).map((k) => ({ tag: k.tag || '', pid: k.pid || '' }))
    }));

    const actPorts = actDef.ports.map((p) => p.id);
    const pairs = [];
    if (has4) {
      pairs.push(['4', 'A']);
      if (actPorts.includes('B')) pairs.push(['2', 'B']);
    } else {
      pairs.push(['2', 'A']);
    }
    for (const [vp, ap] of pairs) {
      if (!actPorts.includes(ap)) continue;
      const flow = (c.flows || []).find((f) => f.port === ap);
      const target = portOf(act, ap);
      if (flow) {
        // Çek valf kolları içe, etiketler dışa bakar: iki haneli devre kodları üst üste binmez
        const fc = Model.addSymbol(sheet, 'f.flowCheck', target.x, Y.fc, mark(ap === 'A'
          ? { tag: flow.tag, rot: 90, flip: true }
          : { tag: flow.tag, rot: 270 }));
        links.push([{ node: valve.id, port: vp }, { node: fc.id, port: 'A' }, 'work']);
        links.push([{ node: fc.id, port: 'B' }, { node: act.id, port: ap }, 'work']);
      } else {
        links.push([{ node: valve.id, port: vp }, { node: act.id, port: ap }, 'work']);
      }
    }
    // Tek portlu aktüatöre 5/2 valf düşerse boşta kalan çalışma portu tapalanır
    if (has4 && !actPorts.includes('B')) {
      const free = portOf(valve, '2');
      const plug = Model.addSymbol(sheet, 'l.plug', free.x, free.y - 3, mark({ rot: 180 }));
      links.push([{ node: valve.id, port: '2' }, { node: plug.id, port: 'P' }, 'work']);
    }
    if (opts.silencers !== false) {
      for (const p of vDef.ports.filter((q) => q.id === '3' || q.id === '5')) {
        const wp = portOf(valve, p.id);
        const sil = Model.addSymbol(sheet, 'l.silencer', wp.x, wp.y + 3, mark({}));
        links.push([{ node: valve.id, port: p.id }, { node: sil.id, port: 'P' }, 'work']);
      }
    }
    return { valve, act, feedX: portOf(valve, '1').x };
  }

  /** Sayfa 1: hava kaynağı, kesme vanası, şartlandırıcı, ana valf ve basınç sensörü (dikey) */
  function placeSupply(sheet, supply, opts, links) {
    const mark = (props) => Object.assign({ devre: 0 }, props);
    const src = Model.addSymbol(sheet, 's.source', SX, 252, mark({ note: AIR[opts.lang] || AIR.tr }));
    let prev = { node: src.id, port: '1' };
    if (supply.manual) {
      const bv = Model.addSymbol(sheet, 's.ballValve', SX, 236, mark({ tag: supply.manual.tag, rot: 270, desc: '' }));
      links.push([prev, { node: bv.id, port: '1' }, 'supply']);
      prev = { node: bv.id, port: '2' };
    }
    const frl = Model.addSymbol(sheet, supply.frlSymbol || 's.frl', SX, 210, mark({ tag: supply.frl ? supply.frl.tag : '0Z1', rot: 270 }));
    links.push([prev, { node: frl.id, port: '1' }, 'supply']);
    prev = { node: frl.id, port: '2' };
    if (supply.main) {
      const mv = Model.addSymbol(sheet, 'v.32nc', SX - 2.5, 180, mark({
        tag: supply.main.tag,
        coils: [{ tag: supply.main.coil.tag, pid: supply.main.coil.pid || '' }]
      }));
      links.push([prev, { node: mv.id, port: '1' }, 'supply']);
      if (opts.silencers !== false) {
        const wp = portOf(mv, '3');
        const sil = Model.addSymbol(sheet, 'l.silencer', wp.x, wp.y + 3, mark({}));
        links.push([{ node: mv.id, port: '3' }, { node: sil.id, port: 'P' }, 'work']);
      }
      prev = { node: mv.id, port: '2' };
    }
    let tap = null;
    if (supply.pressure) {
      const x = SX + 14;
      tap = Model.addSymbol(sheet, 'l.junction', x, Y.hdr, { hdr: true, devre: 0 });
      const sensor = Model.addSymbol(sheet, supply.pressure.symbol || 'k.pressureSensor', x, Y.hdr - 8, mark({
        tag: supply.pressure.tag,
        pid: supply.pressure.pid || ''
      }));
      links.push([{ node: tap.id, port: 'C' }, { node: sensor.id, port: '1' }, 'work']);
    }
    return { feed: prev, tap };
  }

  /** Ana hat: besleme → bağlantı noktaları → (sonraki sayfa) */
  function placeHeader(sheet, feed, xs, next, links, opts) {
    const junctions = xs.map((x) => Model.addSymbol(sheet, 'l.junction', x, Y.hdr, { hdr: true }));
    let prev = feed;
    for (const j of junctions) {
      links.push([prev, { node: j.id, port: 'C' }, 'supply', true]);
      prev = { node: j.id, port: 'C' };
    }
    if (next) {
      const last = xs.length ? xs[xs.length - 1] : COL0;
      const page = Model.addSymbol(sheet, 'l.offpage', Math.min(last + 24, 392), Y.hdr, { note: next, hdr: true });
      links.push([prev, { node: page.id, port: 'L' }, 'supply', true]);
    }
    return junctions;
  }

  function finish(sheet, links) {
    for (const [from, to, kind, hdr] of links) {
      const line = Model.addLine(sheet, from, to, { kind });
      if (hdr) line.hdr = true;
    }
    Model.refreshAll(sheet);
    Model.updateJunctionDots(sheet);
  }

  /**
   * Plandan (PidLink.plan) tam çizim üretir.
   * @param plan {supply, circuits}
   * @param options {lang, perSheet, names, silencers, legend, title}
   */
  function build(plan, options) {
    const opts = Object.assign({ lang: 'tr', perSheet: PER_SHEET, names: true, silencers: true, legend: true }, options);
    const per = Math.max(1, Math.min(PER_SHEET, opts.perSheet || PER_SHEET));
    const circuits = plan.circuits || [];
    const pages = Math.max(1, Math.ceil(circuits.length / per));
    const title = opts.title || TITLE[opts.lang] || TITLE.tr;
    const pageWord = PAGE[opts.lang] || PAGE.tr;
    const offset = opts.pageOffset || 0;
    const drawing = { schema: Model.SCHEMA, sheets: [] };
    for (let p = 0; p < pages; p += 1) {
      const number = offset + p + 1;
      const sheet = Model.createSheet(pages > 1 || offset ? `${title} ${number}` : title, 'A3');
      drawing.sheets.push(sheet);
      const links = [];
      const part = circuits.slice(p * per, (p + 1) * per);
      let feed;
      const xs = [];
      if (p === 0 && !opts.skipSupply) {
        const supply = placeSupply(sheet, plan.supply || {}, opts, links);
        feed = supply.feed;
        if (supply.tap) {
          links.push([feed, { node: supply.tap.id, port: 'C' }, 'supply', true]);
          feed = { node: supply.tap.id, port: 'C' };
        }
      } else {
        // Ana hat önceki şema sayfasından gelir; eklenen ilk sayfa ana hattın son olduğu sayfaya bağlanır
        const from = p === 0 ? (opts.feedFrom || 1) : number - 1;
        const page = Model.addSymbol(sheet, 'l.offpage', 30, Y.hdr, { note: `${pageWord} ${from}`, hdr: true });
        feed = { node: page.id, port: 'R' };
      }
      const valves = part.map((c, i) => placeCircuit(sheet, c, i, opts, links));
      for (const v of valves) xs.push(v.feedX);
      const next = p < pages - 1 ? `${pageWord} ${number + 1}` : null;
      const junctions = placeHeader(sheet, feed, xs, next, links, opts);
      valves.forEach((v, i) => links.push([{ node: v.valve.id, port: '1' }, { node: junctions[i].id, port: 'C' }, 'work']));
      if (opts.legend) Model.addLegend(sheet, COL0, Y.hdr + 16);
      finish(sheet, links);
    }
    return drawing;
  }

  /* ─── Mevcut çizime ekleme ────────────────────────────── */

  /** Ana hattın sürdüğü son sayfa (ana hat bağlantı noktası olan) */
  function feederSheet(drawing) {
    for (let i = drawing.sheets.length - 1; i >= 0; i -= 1) {
      if (drawing.sheets[i].items.some((it) => it.symbol === 'l.junction' && it.hdr)) return i;
    }
    return 0;
  }

  /** Besleyen sayfanın ana hattının sonuna yeni sayfaya giden bağlantı koyar */
  function linkFromSheet(drawing, fromIndex, toNumber, lang) {
    const sheet = drawing.sheets[fromIndex];
    if (!sheet) return;
    const note = `${PAGE[lang] || PAGE.tr} ${toNumber}`;
    if (sheet.items.some((it) => it.symbol === 'l.offpage' && it.note === note)) return;
    const last = sheet.items.filter((it) => it.symbol === 'l.junction' && it.hdr).sort((a, b) => b.x - a.x)[0];
    if (!last) return;
    const taken = sheet.items.some((it) => it.symbol === 'l.offpage' && it.hdr && it.x > last.x);
    const page = Model.addSymbol(sheet, 'l.offpage', Math.min(last.x + 24, 392), Y.hdr + (taken ? 12 : 0), { note, hdr: true });
    const line = Model.addLine(sheet, { node: last.id, port: 'C' }, { node: page.id, port: 'L' }, { kind: 'supply' });
    line.hdr = true;
    Model.refreshAll(sheet);
    Model.updateJunctionDots(sheet);
  }

  function usedColumns(sheet) {
    const cols = sheet.items.filter((it) => Number.isInteger(it.col)).map((it) => it.col);
    return cols.length ? Math.max(...cols) + 1 : 0;
  }

  /** Ana hattı bulur ve x noktasından bağlantı noktası açar; ana hat yoksa sayfa bağlantısıyla kurar */
  function headerJunction(sheet, x, links, lang, from) {
    const lines = sheet.items.filter((it) => Model.isLine(it) && it.hdr && it.path);
    for (const line of lines) {
      for (let i = 0; i < line.path.length - 1; i += 1) {
        const [x0, y0] = line.path[i];
        const [x1, y1] = line.path[i + 1];
        if (Math.abs(y0 - y1) > 1e-6 || Math.abs(y0 - Y.hdr) > 0.6) continue;
        if (x > Math.min(x0, x1) + 1.5 && x < Math.max(x0, x1) - 1.5) {
          const j = Model.splitLine(sheet, line.id, x, y0);
          j.hdr = true;
          return j;
        }
      }
    }
    const junctions = sheet.items.filter((it) => Model.isSymbol(it) && it.symbol === 'l.junction' && it.hdr);
    const left = junctions.filter((j) => j.x < x).sort((a, b) => b.x - a.x)[0];
    const j = Model.addSymbol(sheet, 'l.junction', x, Y.hdr, { hdr: true });
    if (left) {
      links.push([{ node: left.id, port: 'C' }, { node: j.id, port: 'C' }, 'supply', true]);
    } else {
      const page = Model.addSymbol(sheet, 'l.offpage', 30, Y.hdr, { note: `${PAGE[lang] || PAGE.tr} ${from || 1}`, hdr: true });
      links.push([{ node: page.id, port: 'R' }, { node: j.id, port: 'C' }, 'supply', true]);
    }
    return j;
  }

  /**
   * Tek devreyi sayfadaki ilk boş sütuna ekler; sayfa doluysa yeni sayfa açar.
   * @returns {sheetIndex, created}
   */
  function addCircuit(drawing, sheetIndex, circuit, options) {
    const opts = Object.assign({ lang: 'tr', names: true, silencers: true }, options);
    let index = Math.max(0, Math.min(sheetIndex, drawing.sheets.length - 1));
    let sheet = drawing.sheets[index];
    let col = usedColumns(sheet);
    let created = false;
    let feeder = null;
    if (col >= PER_SHEET) {
      feeder = feederSheet(drawing);
      const title = TITLE[opts.lang] || TITLE.tr;
      sheet = Model.createSheet(`${title} ${drawing.sheets.length + 1}`, 'A3');
      drawing.sheets.push(sheet);
      index = drawing.sheets.length - 1;
      col = 0;
      created = true;
    }
    const links = [];
    const placed = placeCircuit(sheet, circuit, col, opts, links);
    const j = headerJunction(sheet, placed.feedX, links, opts.lang, feeder === null ? 1 : feeder + 1);
    links.push([{ node: placed.valve.id, port: '1' }, { node: j.id, port: 'C' }, 'work']);
    finish(sheet, links);
    if (created) linkFromSheet(drawing, feeder, index + 1, opts.lang);
    return { sheetIndex: index, created, valveId: placed.valve.id, actuatorId: placed.act.id };
  }

  /** Eksik devreleri yeni sayfalara ekler (mevcut sayfalara dokunmaz) */
  function appendCircuits(drawing, circuits, options) {
    if (!circuits.length) return 0;
    const opts = Object.assign({ lang: 'tr', perSheet: PER_SHEET, names: true, silencers: true, legend: true }, options);
    const feeder = feederSheet(drawing);
    const start = drawing.sheets.length;
    const extra = build({ supply: null, circuits }, Object.assign({}, opts, { skipSupply: true, pageOffset: start, feedFrom: feeder + 1 }));
    for (const sheet of extra.sheets) drawing.sheets.push(sheet);
    linkFromSheet(drawing, feeder, start + 1, opts.lang);
    return extra.sheets.length;
  }

  return { Y, COL0, COL_W, PER_SHEET, SX, wrap, build, addCircuit, appendCircuits, columnX };
});
