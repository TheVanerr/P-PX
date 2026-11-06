/* P&ID ↔ Pnömatik kod bağlantısı.
   P&ID'deki valf (V), piston sensörü (PPS), switch box (SWB), switch (SW) ve hava basıncı (PS) kodlarını okur,
   aynı aktüatöre ait olanları bir devrede toplar ve ISO 1219-2 kodlarını (0Z1, 1A1, 1V1, 1Y1, 1B1…) verir.
   Kod Eşleştirme listesindeki (PNOMATIK/data/eslestirme.csv) satırlar otomatik tahminin önüne geçer.
   DOM'a bağlı değildir; ekran ve Node testleri aynı kodu kullanır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./symbols.js'));
  else root.PidLink = factory(root.PidSymbols);
})(typeof self !== 'undefined' ? self : this, function (Sym) {
  'use strict';

  /* ─── Seçenek listeleri ───────────────────────────────── */

  const ROLES = [
    ['Y1', 'Bobin 14 (1. hareket: aç / kaldır / ileri)'],
    ['Y2', 'Bobin 12 (2. hareket: kapat / indir / geri)'],
    ['B1', 'Sensör: geri / kapalı konum'],
    ['B2', 'Sensör: ileri / açık konum'],
    ['B3', 'Sensör: ara konum'],
    ['SB', 'Switch box (açık / kapalı)'],
    ['ANA', 'Ana valf bobini (besleme, 0V)'],
    ['BASINC', 'Besleme hava basıncı (0B1)'],
    ['HARIC', 'Pnömatik değil (hariç)']
  ];
  const ROLE_IDS = ROLES.map((r) => r[0]);

  const ACTUATORS = [
    ['silindir', 'Çift etkili silindir', 'a.cylDouble'],
    ['silindir-tek', 'Tek etkili silindir (yaylı)', 'a.cylSingle'],
    ['vana', 'Aktüatörlü vana (çift etkili)', 'a.valveActuator'],
    ['vana-yay', 'Aktüatörlü vana (yay dönüşlü)', 'a.valveActuatorSpring'],
    ['doner', 'Döner aktüatör', 'a.rotary'],
    ['tutucu', 'Pnömatik tutucu', 'a.gripper'],
    ['conta', 'Şişirilebilir conta', 'a.seal']
  ];
  const VALVES = [
    ['52m', '5/2 tek bobin (yay dönüşlü)', 'v.52mono'],
    ['52b', '5/2 çift bobin (bistabil)', 'v.52bi'],
    ['53c', '5/3 orta konum kapalı', 'v.53closed'],
    ['53e', '5/3 orta konum tahliyeli', 'v.53exhaust'],
    ['32nc', '3/2 tek bobin (NK)', 'v.32nc'],
    ['32no', '3/2 tek bobin (NA)', 'v.32no']
  ];
  const ACT_SYMBOL = Object.fromEntries(ACTUATORS.map((a) => [a[0], a[2]]));
  const VALVE_SYMBOL = Object.fromEntries(VALVES.map((v) => [v[0], v[2]]));
  const SINGLE_PORT = new Set(['silindir-tek', 'vana-yay', 'conta']);

  /* ─── Metin ───────────────────────────────────────────── */

  const fold = (text) => Sym.normalize(String(text || '').replace(/[’'`´]/g, ''));
  const seriesOf = (kod) => (String(kod || '').toUpperCase().match(/^[A-Z]+/) || [''])[0];
  const numberOf = (kod) => parseInt(String(kod || '').replace(/\D/g, ''), 10) || 0;
  const byCode = (a, b) => String(a).localeCompare(String(b), 'tr', { numeric: true });

  const FIRST = new Set(['ac', 'acma', 'kaldirma', 'kaldir', 'sisirme', 'sisir']);
  const SECOND = new Set(['kapat', 'kapatma', 'indirme', 'indir', 'sondurme', 'sondur']);
  const POSITION = { acik: 1, kapali: 0, ara: 0.5 };
  const SYNONYM = {
    process: 'proses', tanki: 'tank', tankin: 'tank', kapagi: 'kapak', kapaginin: 'kapak',
    bosaltma: 'tahliye', lift: 'sepet', egzos: 'egzoz', kontol: 'kontrol', hucreden: 'hucre', nozzle: 'nozul'
  };
  const DROP = new Set(['proses', 'valfi', 'valf', 'valfı', 'vanasi', 'vana', 'aktuator', 'aktuatoru', 'sensoru', 'sensor',
    'switch', 'box', 'switchbox', 'switchi', 'pistonu', 'piston', 'konumda', 'konum', 'oto', 'otomatik']);
  // Görünen addan atılan sözcükler (büyük/küçük harf korunur)
  const DISPLAY_DROP = new Set(['valfi', 'valf', 'switch', 'box', 'switchbox', 'switchi', 'sensoru', 'sensor',
    'acik', 'kapali', 'ara', 'konumda']);

  function words(name) {
    return String(name || '').replace(/[()]/g, ' ').split(/\s+/).filter(Boolean);
  }

  function tokenOf(word) {
    const t = fold(word).replace(/[^a-z0-9]/g, '');
    return SYNONYM[t] || t;
  }

  const isAction = (t) => FIRST.has(t) || SECOND.has(t);

  /** Grup anahtarı: konum ve genel sözcükler atılmış sözcük dizisi.
      keepActions false ise aç/kapat gibi hareket sözcükleri de atılır (çift bobinli valf eşleşmesi için). */
  function keyOf(name, keepActions) {
    return diverter(words(name).map(tokenOf)).filter((t) => t && !DROP.has(t) && (keepActions || !isAction(t)) && !(t in POSITION));
  }

  /**
   * Tankın (1.) yönlendirme pistonu, P&ID'deki "Tahliye Vanası Aç / Kapat" valflerinin sürdüğü pistondur:
   * "1. Proses Tankı 1. Yönlendirme Pistonu" ile "1. Proses Tankı Tahliye Vanası" aynı devre olur.
   * Aynı tankın 2. yönlendirme pistonu ayrı pistondur ("yonlendirme2"), tahliye valfiyle eşleşmez.
   */
  function diverter(tokens) {
    const out = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      if (t !== 'yonlendirme') {
        out.push(t);
        continue;
      }
      const index = out.length && /^\d+$/.test(out[out.length - 1]) && out.length >= 2 ? out[out.length - 1] : null;
      // Önündeki sayı tank numarası değil piston sırasıysa (tank numarasından sonra gelir) kaldırılır
      if (index !== null) out.pop();
      out.push(index === null || index === '1' ? 'tahliye' : `yonlendirme${index}`);
    }
    return out;
  }

  function displayOf(name, keepActions) {
    const kept = words(name).filter((w) => {
      const t = tokenOf(w);
      return !DISPLAY_DROP.has(t) && (keepActions || !isAction(t));
    });
    return kept.join(' ').replace(/\s+/g, ' ').trim();
  }

  function actionWord(name, set) {
    return words(name).find((w) => set.has(tokenOf(w))) || '';
  }

  /** En fazla bir harf farkı (yazım hatası: "Kontol" / "Kontrol") */
  function near(a, b) {
    if (a === b) return true;
    if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        i += 1;
        j += 1;
        continue;
      }
      edits += 1;
      if (edits > 1) return false;
      if (a.length > b.length) i += 1;
      else if (b.length > a.length) j += 1;
      else {
        i += 1;
        j += 1;
      }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }

  /** short, long içinde sırası bozulmadan geçiyor mu */
  function subsequence(short, long) {
    let j = 0;
    for (const t of long) {
      if (j < short.length && near(short[j], t)) j += 1;
    }
    return j === short.length;
  }

  /** Grup ve sensör anahtarı ne kadar uyuşuyor: 0 = uyuşmuyor */
  function matchScore(groupKey, sensorKey) {
    if (!groupKey.length || !sensorKey.length) return 0;
    if (groupKey.length === sensorKey.length && subsequence(groupKey, sensorKey)) return 100;
    const [short, long] = groupKey.length < sensorKey.length ? [groupKey, sensorKey] : [sensorKey, groupKey];
    if (!subsequence(short, long)) return 0;
    // Fazla sözcükler tank numarası veya "tank" ise başka ekipmandır: "Kapak" ≠ "1. Tank Kapak"
    const extra = long.filter((t) => !short.some((s) => near(s, t)));
    if (extra.some((t) => /^\d+$/.test(t) || t === 'tank')) return 0;
    return (short === groupKey ? 50 : 40) + short.length;
  }

  /* ─── Tek kodun yorumu ────────────────────────────────── */

  /** Pnömatikle ilgili P&ID serileri */
  function isRelevant(kod, name) {
    const s = seriesOf(kod);
    const n = fold(name);
    if (/^x{3,}/.test(n.trim())) return false;
    if (s === 'V') return true;
    if (s === 'PPS') return true;
    if (s === 'SWB') return !n.includes('solenoid');
    if (s === 'SW') return !n.includes('flow');
    if (s === 'PS') return /\bhava\b/.test(n);
    return false;
  }

  function actuatorFromName(n) {
    // Otomatik dolum vanası enerji kesilince yayla kapanır: 3/2 valf + yay dönüşlü aktüatör
    if (/\bdolum\b/.test(n) && /\baktuator\b|\bvanasi\b|\bvana\b/.test(n)) return 'vana-yay';
    if (/\b(piston|pistonu|silindir|sepet|lift|kapak|kapagi|kaldirma|indirme)\b/.test(n) && !/\baktuator\b/.test(n)) return 'silindir';
    if (/\baktuator\b|\bvanasi\b|\bvana\b/.test(n)) return 'vana';
    return 'silindir';
  }

  /** Otomatik yorum: rol, hareket, konum ve grup anahtarı */
  function classify(kod, name) {
    const code = String(kod || '').trim().toUpperCase();
    const series = seriesOf(code);
    const n = fold(name);
    const base = { kod: code, name: String(name || ''), series, key: keyOf(name, true), display: displayOf(name, true) };
    if (!isRelevant(code, name)) return Object.assign(base, { role: 'HARIC' });
    if (series === 'V') {
      if (/\bana valf/.test(n)) return Object.assign(base, { role: 'ANA' });
      const toks = words(name).map(tokenOf);
      const first = toks.some((t) => FIRST.has(t));
      const second = toks.some((t) => SECOND.has(t));
      // Aktüatörlü vanalar ("Conta Şişirme / Söndürme Aktüatör Vanası") ayrı vanalardır, çift olmaz
      const pairable = !/\baktuator\b/.test(n) && (first !== second);
      if (pairable) {
        base.key = keyOf(name, false);
        base.display = displayOf(name, false);
      }
      return Object.assign(base, {
        role: pairable && second ? 'Y2' : 'Y1',
        pairable,
        action: pairable ? (first ? 'first' : 'second') : null,
        actionWord: actionWord(name, first ? FIRST : SECOND),
        actuator: actuatorFromName(n)
      });
    }
    if (series === 'PS') return Object.assign(base, { role: 'BASINC' });
    if (series === 'SWB') return Object.assign(base, { role: 'SB', actuator: 'vana' });
    const pos = words(name).map(tokenOf).find((t) => t in POSITION);
    const role = pos === undefined ? 'B1' : pos === 'acik' ? 'B2' : pos === 'ara' ? 'B3' : 'B1';
    // explicit: adda konum sözcüğü (açık / kapalı / ara) var; yoksa B1 yalnız tahmindir
    return Object.assign(base, { role, explicit: pos !== undefined, attachOnly: series === 'SW', actuator: 'silindir' });
  }

  /* ─── Kod Eşleştirme listesi (CSV) ────────────────────── */

  const CSV_HEAD = 'KOD;DEVRE;ROL;AKTUATOR;VALF';

  function parseMappingCsv(text) {
    const rows = new Map();
    const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      const cells = line.split(';').map((c) => c.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
      const kod = String(cells[0] || '').toUpperCase();
      if (!kod || kod === 'KOD') continue;
      const rol = String(cells[2] || '').toUpperCase();
      rows.set(kod, {
        kod,
        devre: cells[1] || '',
        rol: ROLE_IDS.includes(rol) ? rol : '',
        aktuator: ACT_SYMBOL[cells[3]] ? cells[3] : '',
        valf: VALVE_SYMBOL[cells[4]] ? cells[4] : ''
      });
    }
    return rows;
  }

  function toMappingCsv(rows) {
    const cell = (v) => (/[;"\n]/.test(String(v || '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v || ''));
    const list = [...rows.values()].sort((a, b) => byCode(a.kod, b.kod));
    return `﻿${CSV_HEAD}\n${list.map((r) => [r.kod, r.devre, r.rol, r.aktuator, r.valf].map(cell).join(';')).join('\n')}\n`;
  }

  /* ─── Gruplama ────────────────────────────────────────── */

  /**
   * @param entries [{kod, name}] projedeki P&ID kodları
   * @param mapping Map kod -> {devre, rol, aktuator, valf} (Kod Eşleştirme listesi)
   * @returns {supply:{main,pressure}, circuits:[...], excluded:[...]}
   */
  function group(entries, mapping) {
    const rows = mapping || new Map();
    const seen = new Set();
    const list = [];
    for (const e of entries) {
      const kod = String(e.kod || '').trim().toUpperCase();
      if (!kod || seen.has(kod)) continue;
      seen.add(kod);
      list.push({ kod, name: e.name || '' });
    }
    list.sort((a, b) => byCode(a.kod, b.kod));

    const supply = { main: null, pressure: null };
    const excluded = [];
    const groups = [];
    const named = new Map();
    const sensorsLeft = [];

    const newGroup = (props) => {
      const g = Object.assign({ name: '', key: [], coils: [null, null], sensors: [], actuator: '', valve: '', saved: false, codes: [] }, props);
      groups.push(g);
      return g;
    };
    const addCode = (g, info) => {
      if (!g.codes.includes(info.kod)) g.codes.push(info.kod);
    };
    const addSensor = (g, info, role) => {
      const pos = role === 'B2' ? 1 : role === 'B3' ? 0.5 : role === 'SB' ? 0 : 0;
      g.sensors.push({ kod: info.kod, name: info.name, role, pos });
      addCode(g, info);
    };

    // 1. Kod Eşleştirme listesinde kayıtlı olanlar
    const pending = [];
    for (const e of list) {
      const auto = classify(e.kod, e.name);
      const saved = rows.get(e.kod);
      if (!saved || !saved.rol) {
        pending.push(auto);
        continue;
      }
      const info = Object.assign({}, auto, { saved: true });
      if (saved.rol === 'HARIC') {
        excluded.push({ kod: e.kod, name: e.name, reason: 'Kod Eşleştirme listesinde hariç' });
        continue;
      }
      if (saved.rol === 'ANA') {
        if (!supply.main) supply.main = { kod: e.kod, name: e.name };
        continue;
      }
      if (saved.rol === 'BASINC') {
        if (!supply.pressure) supply.pressure = { kod: e.kod, name: e.name };
        continue;
      }
      const title = saved.devre || auto.display || e.kod;
      const gkey = fold(title);
      let g = named.get(gkey);
      if (!g) {
        g = newGroup({ name: title, key: keyOf(title), saved: true });
        named.set(gkey, g);
      }
      if (saved.aktuator && !g.actuator) g.actuator = saved.aktuator;
      if (saved.valf && !g.valve) g.valve = saved.valf;
      if (saved.rol === 'Y1' || saved.rol === 'Y2') {
        const slot = saved.rol === 'Y1' ? 0 : 1;
        if (!g.coils[slot]) g.coils[slot] = { kod: e.kod, name: e.name };
        else excluded.push({ kod: e.kod, name: e.name, reason: `${title}: ${saved.rol} bobini dolu` });
        addCode(g, info);
      } else {
        addSensor(g, info, saved.rol);
      }
    }

    // 2. Otomatik: valf bobinleri, aç/kapat çiftleri
    const coils = pending.filter((c) => c.series === 'V' && c.role !== 'HARIC');
    for (const c of coils) {
      if (c.role === 'ANA') {
        if (!supply.main) supply.main = { kod: c.kod, name: c.name };
        else excluded.push({ kod: c.kod, name: c.name, reason: 'İkinci ana valf' });
      }
    }
    const buckets = new Map();
    for (const c of coils) {
      if (c.role === 'ANA') continue;
      const bucket = c.pairable ? c.key.join(' ') : `#${c.kod}`;
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push(c);
    }
    for (const items of buckets.values()) {
      const firsts = items.filter((c) => c.action === 'first');
      const seconds = items.filter((c) => c.action === 'second');
      const singles = items.filter((c) => !c.action);
      while (firsts.length && seconds.length) {
        const a = firsts.shift();
        const b = seconds.shift();
        const base = a.display || b.display;
        const words2 = [a.actionWord, b.actionWord].filter(Boolean);
        newGroup({
          name: words2.length === 2 ? `${base} (${words2[0]} / ${words2[1]})` : base,
          key: a.key,
          coils: [{ kod: a.kod, name: a.name }, { kod: b.kod, name: b.name }],
          actuator: a.actuator,
          codes: [a.kod, b.kod]
        });
      }
      for (const c of singles.concat(firsts, seconds)) {
        newGroup({ name: c.display || c.kod, key: c.key, coils: [{ kod: c.kod, name: c.name }, null], actuator: c.actuator, codes: [c.kod] });
      }
    }

    // 3. Sensörler en uygun devreye; uygun devre yoksa kendi devresini kurar (switch hariç)
    for (const c of pending) {
      if (c.series === 'V') continue;
      if (c.role === 'HARIC') continue;
      if (c.role === 'BASINC') {
        if (!supply.pressure) supply.pressure = { kod: c.kod, name: c.name };
        else excluded.push({ kod: c.kod, name: c.name, reason: 'Besleme basınç sensörü zaten var' });
        continue;
      }
      sensorsLeft.push(c);
    }
    const sensorGroups = new Map();
    for (const c of sensorsLeft) {
      let best = null;
      let bestScore = 0;
      for (const g of groups) {
        const score = matchScore(g.key, c.key);
        if (!score) continue;
        // Aynı puanda iki bobinli (aç/kapat) devre ve ilk kod öne geçer
        const bonus = (g.coils[1] ? 0.5 : 0) + (g.saved ? 0.25 : 0);
        if (score + bonus > bestScore) {
          best = g;
          bestScore = score + bonus;
        }
      }
      if (best) {
        if (c.series === 'SWB' && !best.actuator) best.actuator = 'vana';
        addSensor(best, c, c.role);
        continue;
      }
      if (c.attachOnly) {
        excluded.push({ kod: c.kod, name: c.name, reason: 'Eşleşen pnömatik devre yok' });
        continue;
      }
      const k = c.key.join(' ') || c.kod;
      let g = sensorGroups.get(k);
      if (!g) {
        g = newGroup({ name: c.display || c.kod, key: c.key, actuator: c.series === 'SWB' ? 'vana' : 'silindir', sensorOnly: true });
        sensorGroups.set(k, g);
      }
      addSensor(g, c, c.role);
    }

    // 4. Tipler ve sıra
    for (const g of groups) {
      // Switch box aktüatörlü vanada olur: konum sensörü (PPS) yoksa devre vana olarak çizilir
      if (!g.saved && g.sensors.some((x) => x.role === 'SB') && !g.sensors.some((x) => x.role !== 'SB') && g.actuator !== 'vana-yay') g.actuator = 'vana';
      // Piston sensörü (PPS) olan çift bobinli devre pistondur: "Tahliye Vanası Aç / Kapat" + "Yönlendirme Pistonu"
      // sensörleri 5/2 bistabil valf ve çift etkili silindir olur, devre pistonun adını alır
      const pistonSensors = g.sensors.filter((x) => seriesOf(x.kod) === 'PPS');
      if (!g.saved && g.coils[0] && g.coils[1] && pistonSensors.length && g.actuator === 'vana') {
        g.actuator = 'silindir';
        g.name = displayOf(pistonSensors[0].name, true) || g.name;
      }
      if (!g.actuator) g.actuator = 'silindir';
      // Yönlendirme pistonu her zaman 5/2 bistabil valfle sürülür; V kodları henüz yoksa iki bobin boş gelir
      if (!g.saved && !g.valve && g.actuator === 'silindir' && /\byonlendirme\b/.test(fold(g.name))) g.valve = '52b';
      if (!g.valve) g.valve = defaultValve(g);
      g.sensors.sort((a, b) => a.pos - b.pos || byCode(a.kod, b.kod));
    }
    const firstV = (g) => {
      const nums = g.coils.filter(Boolean).map((c) => numberOf(c.kod));
      return nums.length ? Math.min(...nums) : Infinity;
    };
    groups.sort((a, b) => {
      const va = firstV(a);
      const vb = firstV(b);
      if (va !== vb) return va - vb;
      return byCode(a.codes[0] || '', b.codes[0] || '');
    });
    return { supply, circuits: groups.filter((g) => g.codes.length), excluded };
  }

  function defaultValve(g) {
    const two = !!(g.coils[0] && g.coils[1]);
    if (SINGLE_PORT.has(g.actuator)) return '32nc';
    if (two) return g.sensors.some((s) => s.role === 'B3') ? '53c' : '52b';
    return '52m';
  }

  /* ─── ISO 1219-2 kodları ──────────────────────────────── */

  /**
   * Gruplara devre numarası ve bileşen kodları verir.
   * @param result group() çıktısı
   * @param options {start:1, manualValve:true, mainValve:true, flowControls:true}
   */
  function assign(result, options) {
    const o = Object.assign({ start: 1, manualValve: true, mainValve: true, flowControls: true, pressureSensor: true }, options);
    const supply = { circuit: 0, items: [] };
    let v = 1;
    if (o.manualValve) supply.manual = { tag: `0V${v++}` };
    supply.frl = { tag: '0Z1' };
    if (o.mainValve && (result.supply.main || o.forceMainValve)) {
      supply.main = {
        tag: `0V${v++}`,
        coil: { tag: '0Y1', pid: result.supply.main ? result.supply.main.kod : '', name: result.supply.main ? result.supply.main.name : '' }
      };
    }
    if (o.pressureSensor && result.supply.pressure) {
      const ps = result.supply.pressure;
      const n = fold(ps.name);
      supply.pressure = { tag: '0B1', pid: ps.kod, name: ps.name, symbol: /salter|bilgisi/.test(n) ? 'k.pressureSwitch' : 'k.pressureSensor' };
    }

    const circuits = result.circuits.map((g, i) => {
      const nr = o.start + i;
      const act = g.actuator;
      const valve = g.valve || defaultValve(g);
      const coilCount = (Sym.get(VALVE_SYMBOL[valve]) || {}).coils || 1;
      const coils = [];
      for (let k = 0; k < coilCount; k += 1) {
        const src = g.coils[k] || (k === 0 && !g.coils[0] && g.coils[1] ? null : null);
        coils.push({ tag: `${nr}Y${k + 1}`, pid: src ? src.kod : '', name: src ? src.name : '' });
      }
      // Tek bobinli valfe iki bobinli grup düşerse ikinci kod boşta kalmasın: uyarı listesine gider
      const dropped = g.coils.slice(coilCount).filter(Boolean);
      let b = 1;
      const used = new Set();
      const sensors = g.sensors.map((s) => {
        let number = s.role === 'B2' ? 2 : s.role === 'B3' ? 3 : 1;
        if (s.role === 'SB') number = 1;
        while (used.has(number)) number = Math.max(b, number) + 1;
        used.add(number);
        b = Math.max(b, number);
        return { tag: `${nr}B${number}`, pid: s.kod, name: s.name, pos: s.pos, role: s.role };
      });
      const actPid = (act === 'vana' || act === 'vana-yay') && g.coils[0] && !g.coils[1] ? g.coils[0].kod : '';
      const linear = act === 'silindir' || act === 'silindir-tek';
      const flows = [];
      if (o.flowControls && linear) {
        flows.push({ tag: `${nr}V2`, port: 'A' });
        if (!SINGLE_PORT.has(act)) flows.push({ tag: `${nr}V3`, port: 'B' });
      }
      return {
        nr,
        name: g.name,
        actuator: act,
        actuatorSymbol: ACT_SYMBOL[act] || 'a.cylDouble',
        actuatorTag: `${nr}A1`,
        actuatorPid: actPid,
        valve,
        valveSymbol: VALVE_SYMBOL[valve] || 'v.52mono',
        valveTag: `${nr}V1`,
        coils,
        sensors,
        flows,
        codes: g.codes.slice(),
        dropped
      };
    });
    return { supply, circuits, excluded: result.excluded };
  }

  /** P&ID kodlarından devre planı (gruplama + kod verme) */
  function plan(entries, mapping, options) {
    return assign(group(entries, mapping), options);
  }

  /* ─── Yardımcılar ─────────────────────────────────────── */

  /** ISO kodunu parçalar: "12V3" -> {circuit:12, letter:'V', number:3} */
  function parseIso(code) {
    const m = String(code || '').trim().toUpperCase().match(/^(\d+)([A-Z]+)(\d+)$/);
    return m ? { circuit: parseInt(m[1], 10), letter: m[2], number: parseInt(m[3], 10) } : null;
  }

  const LETTER_ORDER = ['A', 'V', 'Y', 'B', 'S', 'Z', 'P', 'M'];

  /** Kod sıralaması: devre, harf (A, V, Y, B…), numara; ISO biçiminde olmayanlar sona */
  function compareIso(a, b) {
    const pa = parseIso(a);
    const pb = parseIso(b);
    if (pa && pb) {
      if (pa.circuit !== pb.circuit) return pa.circuit - pb.circuit;
      const la = LETTER_ORDER.indexOf(pa.letter);
      const lb = LETTER_ORDER.indexOf(pb.letter);
      if (la !== lb) return (la < 0 ? 99 : la) - (lb < 0 ? 99 : lb);
      return pa.number - pb.number;
    }
    if (pa) return -1;
    if (pb) return 1;
    return byCode(a, b);
  }

  /** Çizimdeki en büyük devre numarası */
  function maxCircuit(drawing) {
    let max = 0;
    for (const sheet of drawing.sheets) {
      for (const it of sheet.items) {
        const codes = [it.tag].concat((it.coils || []).map((c) => c.tag), (it.sensors || []).map((s) => s.tag));
        for (const code of codes) {
          const p = parseIso(code);
          if (p && p.circuit > max) max = p.circuit;
        }
      }
    }
    return max;
  }

  return {
    ROLES,
    ROLE_IDS,
    ACTUATORS,
    VALVES,
    ACT_SYMBOL,
    VALVE_SYMBOL,
    CSV_HEAD,
    fold,
    seriesOf,
    keyOf,
    displayOf,
    matchScore,
    isRelevant,
    classify,
    parseMappingCsv,
    toMappingCsv,
    group,
    assign,
    plan,
    defaultValve,
    parseIso,
    compareIso,
    maxCircuit
  };
});
