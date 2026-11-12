/* P&ID sembol kütüphanesi — ISO 10628-2 / ISO 1219 / ISA-5.1 esaslı.
   Tüm ölçüler mm, orijin sembol merkezi. Renk currentColor: siyah = standart, kırmızı = opsiyon. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PidSymbols = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WHITE = 'fill="#fff"';
  const SOLID = 'fill="currentColor" stroke="none"';
  const THIN = 'stroke-width="0.2"';
  const DASH = 'stroke-dasharray="1 0.8" stroke-width="0.25"';

  const P = (d, extra) => `<path d="${d}"${extra ? ' ' + extra : ''}/>`;
  const C = (x, y, r, extra) => `<circle cx="${x}" cy="${y}" r="${r}"${extra ? ' ' + extra : ''}/>`;
  const R = (x, y, w, h, extra) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${extra ? ' ' + extra : ''}/>`;

  const BOW = P('M-5 -3L5 3V-3L-5 3Z', WHITE);
  const LR5 = [{ id: 'L', x: -5, y: 0, dir: 'L' }, { id: 'R', x: 5, y: 0, dir: 'R' }];
  const port4 = (r) => [
    { id: 'L', x: -r, y: 0, dir: 'L' },
    { id: 'R', x: r, y: 0, dir: 'R' },
    { id: 'U', x: 0, y: -r, dir: 'U' },
    { id: 'D', x: 0, y: r, dir: 'D' }
  ];
  const lr = (x) => [{ id: 'L', x: -x, y: 0, dir: 'L' }, { id: 'R', x, y: 0, dir: 'R' }];

  const CATEGORIES = [
    { id: 'vessel', name: 'Tank, Hücre ve Sepet' },
    { id: 'valve', name: 'Vanalar' },
    { id: 'piston', name: 'Piston ve Piston Sensörleri' },
    { id: 'pump', name: 'Pompa ve Fanlar' },
    { id: 'drive', name: 'Tahrikler' },
    { id: 'equip', name: 'Ekipman' },
    { id: 'heat', name: 'Isıtma ve Ultrasonik' },
    { id: 'pneu', name: 'Pnömatik (ISO 1219)' },
    { id: 'pipe', name: 'Hat Elemanları' },
    { id: 'inst', name: 'Enstrüman (ISA-5.1)' },
    { id: 'elec', name: 'Elektrik ve Koruma' },
    { id: 'safety', name: 'Güvenlik' },
    { id: 'shape', name: 'Temel Şekiller' }
  ];

  const LIST = [];
  const BY_ID = {};

  function def(id, cat, names, opts) {
    const d = Object.assign({
      id,
      cat,
      name: { tr: names[0], en: names[1], de: names[2] },
      layer: cat === 'inst' || cat === 'safety' || cat === 'elec' ? 'inst' : cat === 'pneu' ? 'pneu' : 'process',
      ports: [],
      texts: [],
      tag: 'below',
      inline: false,
      resizable: false,
      hidden: false
    }, opts);
    LIST.push(d);
    BY_ID[id] = d;
  }

  /* ─── Vanalar ─────────────────────────────────────────── */
  const inlineValve = { ports: LR5, inline: true };
  const BUTTERFLY = P('M-5 0H-3M3 0H5') + P('M-3 -4V4M3 -4V4') + P('M-3 3.4L3 -3.4') + C(0, 0, 0.7, SOLID);

  def('v.gate', 'valve', ['Kesme Vanası', 'Shut-off Valve', 'Absperrventil'],
    Object.assign({ body: BOW, box: [-5, -3, 5, 3] }, inlineValve));
  def('v.ball', 'valve', ['Küresel Vana', 'Ball Valve', 'Kugelhahn'],
    Object.assign({ body: BOW + C(0, 0, 1.7, WHITE), box: [-5, -3, 5, 3] }, inlineValve));
  def('v.butterfly', 'valve', ['Kelebek Vana', 'Butterfly Valve', 'Absperrklappe'],
    Object.assign({ body: BUTTERFLY, box: [-5, -4, 5, 4] }, inlineValve));
  def('v.globe', 'valve', ['Glob Vana', 'Globe Valve', 'Durchgangsventil'],
    Object.assign({ body: BOW + C(0, 0, 1, SOLID), box: [-5, -3, 5, 3] }, inlineValve));
  def('v.check', 'valve', ['Çek Valf', 'Check Valve', 'Rückschlagventil'],
    Object.assign({ body: P('M-5 0H-3.2M3.2 0H5') + P('M-3.2 -3L3.2 0L-3.2 3Z', WHITE) + P('M3.2 -3V3'), box: [-5, -3, 5, 3] }, inlineValve));
  def('v.threeway', 'valve', ['3 Yollu Vana', '3-Way Valve', '3-Wege-Ventil'], {
    body: BOW + P('M0 0L-3 5H3Z', WHITE),
    box: [-5, -3, 5, 5],
    ports: [...LR5, { id: 'D', x: 0, y: 5, dir: 'D' }]
  });
  def('v.safety', 'valve', ['Emniyet Vanası', 'Safety Valve', 'Sicherheitsventil'], {
    body: P('M0 0L-3 5H3Z', WHITE) + P('M0 0L5 -3V3Z', WHITE) + P('M0 0V-2.5L2 -3.5L-2 -5L2 -6.5L-2 -8L0 -9'),
    box: [-3, -9, 5, 5],
    ports: [{ id: 'D', x: 0, y: 5, dir: 'D' }, { id: 'R', x: 5, y: 0, dir: 'R' }]
  });
  def('v.regulator', 'valve', ['Basınç Regülatörü', 'Pressure Regulator', 'Druckregler'],
    Object.assign({
      body: BOW + P('M0 0V-5') + P('M-3.5 -5H3.5A3.5 3.5 0 0 0 -3.5 -5Z', WHITE) + P('M3.5 -6.5H7V0H5', DASH),
      box: [-5, -8.5, 7, 3]
    }, inlineValve));
  def('v.solenoid', 'valve', ['Solenoid Vana', 'Solenoid Valve', 'Magnetventil'],
    Object.assign({}, inlineValve, {
      body: BOW + P('M0 0V-5') + R(-2.5, -9.5, 5, 4.5, WHITE),
      texts: [{ x: 0, y: -7.25, t: 'S', s: 3, b: true }],
      box: [-5, -9.5, 5, 3],
      ports: [...LR5, { id: 'A', x: 0, y: -9.5, dir: 'U' }]
    }));
  // Otomatik dolum: şebeke suyunu tanka veren solenoid valf; mantıkta her zaman dolum vanası sayılır
  def('v.solenoidFill', 'valve', ['Dolum Solenoid Valfi', 'Fill Solenoid Valve', 'Füll-Magnetventil'],
    Object.assign({}, inlineValve, {
      body: BOW + P('M0 0V-5') + R(-2.5, -9.5, 5, 4.5, WHITE),
      texts: [{ x: 0, y: -7.25, t: 'S', s: 3, b: true }],
      box: [-5, -9.5, 5, 3],
      ports: [...LR5, { id: 'A', x: 0, y: -9.5, dir: 'U' }],
      valvePurpose: 'fill'
    }));
  def('v.pneumatic', 'valve', ['Pnömatik Aktüatörlü Vana', 'Pneumatic Actuated Valve', 'Pneumatikventil'],
    Object.assign({}, inlineValve, {
      body: BOW + P('M0 0V-5') + P('M-4 -5H4A4 4 0 0 0 -4 -5Z', WHITE),
      box: [-5, -9, 5, 3],
      ports: [...LR5, { id: 'A', x: 0, y: -9, dir: 'U' }]
    }));
  def('v.ballPneumatic', 'valve', ['Aktüatörlü Küresel Vana', 'Actuated Ball Valve', 'Kugelhahn mit Antrieb'],
    Object.assign({}, inlineValve, {
      body: BOW + C(0, 0, 1.7, WHITE) + P('M0 -1.7V-5') + R(-3.5, -9, 7, 4, WHITE) + P('M-1 -9V-5'),
      box: [-5, -9, 5, 3],
      ports: [...LR5, { id: 'A', x: 0, y: -9, dir: 'U' }]
    }));
  def('v.butterflyPneumatic', 'valve', ['Aktüatörlü Kelebek Vana', 'Actuated Butterfly Valve', 'Klappe mit Antrieb'],
    Object.assign({}, inlineValve, {
      body: BUTTERFLY + P('M0 -0.7V-6') + R(-3.5, -10, 7, 4, WHITE) + P('M-1 -10V-6'),
      box: [-5, -10, 5, 4],
      ports: [...LR5, { id: 'A', x: 0, y: -10, dir: 'U' }]
    }));
  /* Pistonlu tahliye vanası: hattaki vana, üstünde silindir gövdesi, içinde piston, piston kolu vanaya iner.
     A hava girişi, S1/S2 açık-kapalı konum sensörleri (ZSO, ZSC) içindir. Akış yönünden dönüş/drenaj sayılır. */
  def('v.pistonValve', 'valve', ['Pistonlu Tahliye Vanası', 'Cylinder-Operated Drain Valve', 'Ablassventil mit Zylinder'],
    Object.assign({}, inlineValve, {
      body: BOW + R(-4, -12, 8, 7, WHITE) + P('M0 0V-8.5') + P('M-3 -8.5H3', 'stroke-width="0.9"'),
      box: [-5, -12, 5, 3],
      ports: [
        ...LR5,
        { id: 'A', x: 0, y: -12, dir: 'U' },
        { id: 'S1', x: -4, y: -8.5, dir: 'L' },
        { id: 'S2', x: 4, y: -8.5, dir: 'R' }
      ]
    }));
  def('v.motor', 'valve', ['Motorlu Vana', 'Motorized Valve', 'Motorventil'],
    Object.assign({}, inlineValve, {
      body: BOW + P('M0 0V-5') + C(0, -8.5, 3.5, WHITE),
      texts: [{ x: 0, y: -8.5, t: 'M', s: 3, b: true }],
      box: [-5, -12, 5, 3],
      ports: [...LR5, { id: 'A', x: 0, y: -12, dir: 'U' }]
    }));

  /* ─── Pompa ve fanlar ─────────────────────────────────── */
  const PUMP_TRI = 'M-3 -5.2L6 0L-3 5.2';
  def('p.centrifugal', 'pump', ['Santrifüj Pompa', 'Centrifugal Pump', 'Kreiselpumpe'], {
    body: C(0, 0, 6, WHITE) + P(PUMP_TRI),
    box: [-6, -6, 6, 6],
    ports: [...lr(6), { id: 'M', x: 0, y: -6, dir: 'U' }],
    inline: true
  });
  def('p.dosing', 'pump', ['Dozaj Pompası', 'Dosing Pump', 'Dosierpumpe'], {
    body: C(0, 0, 5.5, WHITE) + P('M-2.8 -4.7L5.5 0L-2.8 4.7') + P('M-5.5 5.5L5.5 -5.5M5.5 -5.5L3.4 -5.1M5.5 -5.5L5.1 -3.4', THIN),
    box: [-5.5, -5.5, 5.5, 5.5],
    ports: [...lr(5.5), { id: 'M', x: 0, y: -5.5, dir: 'U' }],
    inline: true
  });
  def('p.vacuum', 'pump', ['Vakum Pompası', 'Vacuum Pump', 'Vakuumpumpe'], {
    body: C(0, 0, 6, WHITE) + P(PUMP_TRI),
    texts: [{ x: -0.6, y: 0, t: 'V', s: 3, b: true }],
    box: [-6, -6, 6, 6],
    ports: [...lr(6), { id: 'M', x: 0, y: -6, dir: 'U' }],
    inline: true
  });
  /* Dozatron: su akışıyla çalışan oransal dozaj ünitesi, elektrik ve motor bağlantısı yoktur.
     Hatta oturan dik gövde, içinde akış üçgeni, çapraz ok ayarlanabilir dozaj oranıdır;
     alttaki sap kimyasal emiş hortumudur (D ucu kimyasal bidonuna bağlanır). */
  def('p.dosatron', 'pump', ['Dozatron (Oransal Dozaj)', 'Dosatron (Proportional Doser)', 'Dosatron (Proportionaldosierer)'], {
    body: R(-4.5, -8, 9, 13, `rx="1.5" ${WHITE}`) + P('M-2.2 -2.6L2.8 0L-2.2 2.6Z') +
      P('M-3.4 3.6L3.4 -6.6M3.4 -6.6L1.5 -6.2M3.4 -6.6L3 -4.7', THIN) + P('M0 5V10'),
    box: [-4.5, -8, 4.5, 10],
    ports: [...lr(4.5), { id: 'D', x: 0, y: 10, dir: 'D' }],
    inline: true,
    tagAbove: true
  });
  def('f.fan', 'pump', ['Fan', 'Fan', 'Ventilator'], {
    body: C(0, 0, 6, WHITE) + P('M-4.24 -4.24L4.24 4.24V-4.24L-4.24 4.24Z'),
    box: [-6, -6, 6, 6],
    ports: [...lr(6), { id: 'M', x: 0, y: -6, dir: 'U' }],
    inline: true
  });
  def('f.blower', 'pump', ['Blower', 'Blower', 'Gebläse'], {
    body: P('M0 -6H8V-2.5H5.45') + C(0, 0, 6, WHITE) + P('M-3 -3.5L3 0L-3 3.5Z'),
    box: [-6, -6, 8, 6],
    ports: [{ id: 'L', x: -6, y: 0, dir: 'L' }, { id: 'R', x: 8, y: -4.25, dir: 'R' }]
  });

  /* ─── Tahrikler ───────────────────────────────────────── */
  def('d.motor', 'drive', ['Motor', 'Motor', 'Motor'], {
    body: C(0, 0, 5, WHITE),
    texts: [{ x: 0, y: 0, t: 'M', s: 4, b: true }],
    box: [-5, -5, 5, 5],
    ports: lr(5)
  });
  def('d.gearmotor', 'drive', ['Redüktörlü Motor', 'Gear Motor', 'Getriebemotor'], {
    body: C(-5, 0, 4.5, WHITE) + R(-0.5, -4.5, 9, 9, WHITE) + C(2.6, -1.6, 1.5) + C(5.4, 1.6, 1.5),
    texts: [{ x: -5, y: 0, t: 'M', s: 3.5, b: true }],
    box: [-9.5, -4.5, 8.5, 4.5],
    ports: [
      { id: 'L', x: -9.5, y: 0, dir: 'L' },
      { id: 'R', x: 8.5, y: 0, dir: 'R' },
      { id: 'U', x: 4, y: -4.5, dir: 'U' }
    ]
  });
  def('d.vibration', 'drive', ['Vibrasyon Motoru', 'Vibration Motor', 'Vibrationsmotor'], {
    body: C(0, 0, 5, WHITE) + P('M-3 2.6L-1.5 1.4L0 2.6L1.5 1.4L3 2.6', THIN),
    texts: [{ x: 0, y: -1, t: 'M', s: 3.2, b: true }],
    box: [-5, -5, 5, 5],
    ports: lr(5)
  });
  def('d.vfd', 'drive', ['İnvertör', 'Inverter (VFD)', 'Frequenzumrichter'], {
    body: R(-7, -4.5, 14, 9, WHITE) + P('M-7 4.5L7 -4.5', THIN),
    texts: [{ x: -3.6, y: -1.8, t: '~', s: 3.4 }, { x: 3.6, y: 1.8, t: '≈', s: 3.4 }],
    box: [-7, -4.5, 7, 4.5],
    ports: lr(7)
  });
  def('d.encoder', 'drive', ['Enkoder', 'Encoder', 'Drehgeber'], {
    body: R(-4, -4, 8, 8, WHITE) + C(0, 0, 2.2) + P('M0 -2.2V2.2M-2.2 0H2.2', THIN),
    box: [-4, -4, 4, 4],
    ports: lr(4)
  });

  /* ─── Tank, hücre ve sepet ────────────────────────────── */
  const EQUIP = 'stroke-width="0.6"';
  const CELL = 'stroke-width="0.7"';
  const halves = (it) => [it.w / 2, it.h / 2];
  const levelMark = (hw, hh, h) => {
    const lv = -hh + Math.min(7, h * 0.18);
    return P(`M${-hw} ${lv}H${hw}`, THIN) + P(`M${hw - 12} ${lv - 2.2}h3l-1.5 2.2z`, THIN);
  };
  const vessel = (type, size, note, extra) => Object.assign({
    resizable: true,
    container: true,
    vesselType: type,
    tag: 'inside',
    defaultSize: size,
    defaultNote: note
  }, extra);
  /** Sepet gibi ekipmanın ortasındaki dile bağlı ad */
  const centerLabel = (label, ratio) => (it, lang) => {
    const r = Math.min(it.w, it.h) / 2;
    return [{ x: 0, y: 0, t: label[lang] || label.tr, s: Math.max(2.2, r * (ratio || 0.13)) }];
  };
  const OPEN_TANK = (hw, hh) => P(`M${-hw} ${-hh}V${hh}H${hw}V${-hh}`, EQUIP);

  /* Düz su tankları (ISO 10628-2 açık atmosferik tank, ▽ sıvı seviyesi).
     Pompa suyu tank tabanından çeker ve hücreye basar. Bırakıldığında presets.js
     seviye sensörlerini, rezistansları, emiş vanasını ve pompayı bağlantılarıyla ekler.
     Her biri çizimde bir kez bulunur; beşinci bir tank Proses Tankı ile eklenip adlandırılır.
     tankNo, kod kataloğundaki "n. Proses Tankı" numarasıdır (PE0n, LS, R kodları buna göre). */
  const WATER_TANKS = [
    ['e.tankPreWash', 1, ['Ön Yıkama Tankı', 'Pre-Wash Tank', 'Vorwaschtank'], ['ÖN YIKAMA TANKI', 'PRE-WASH TANK', 'VORWASCHTANK']],
    ['e.tankWash', 2, ['Yıkama Tankı', 'Wash Tank', 'Waschtank'], ['YIKAMA TANKI', 'WASH TANK', 'WASCHTANK']],
    ['e.tankPreRinse', 3, ['Ön Durulama Tankı', 'Pre-Rinse Tank', 'Vorspültank'], ['ÖN DURULAMA TANKI', 'PRE-RINSE TANK', 'VORSPÜLTANK']],
    ['e.tankRinse', 4, ['Durulama Tankı', 'Rinse Tank', 'Spültank'], ['DURULAMA TANKI', 'RINSE TANK', 'SPÜLTANK']]
  ];
  for (const [id, tankNo, names, notes] of WATER_TANKS) {
    def(id, 'vessel', names, vessel('tank', [110, 70], notes[0], {
      preset: 'waterTank',
      single: true,
      tankNo,
      notes: { tr: notes[0], en: notes[1], de: notes[2] },
      body: (it) => {
        const [hw, hh] = halves(it);
        return OPEN_TANK(hw, hh) + levelMark(hw, hh, it.h);
      }
    }));
  }

  def('e.tank', 'vessel', ['Proses Tankı', 'Process Tank', 'Prozesstank'], vessel('tank', [70, 45], 'PROSES TANKI', {
    body: (it) => {
      const [hw, hh] = halves(it);
      return OPEN_TANK(hw, hh) + levelMark(hw, hh, it.h);
    }
  }));
  def('e.vessel', 'vessel', ['Kapalı Tank', 'Closed Vessel', 'Geschlossener Behälter'], vessel('tank', [50, 40], 'KAPALI TANK', {
    body: (it) => R(-it.w / 2, -it.h / 2, it.w, it.h, `rx="${Math.min(6, it.w / 6)}" ${EQUIP}`)
  }));
  def('e.tankLid', 'vessel', ['Kapaklı Tank', 'Lidded Tank', 'Tank mit Deckel'], vessel('tank', [70, 45], 'KAPAKLI TANK', {
    body: (it) => {
      const [hw, hh] = halves(it);
      return OPEN_TANK(hw, hh) + P(`M${-hw} ${-hh}H${hw}`, 'stroke-width="1.1"') +
        C(-hw + 2.4, -hh + 1.6, 0.8, WHITE) + levelMark(hw, hh, it.h);
    }
  }));
  def('e.tankCone', 'vessel', ['Konik Tank', 'Conical Tank', 'Konischer Tank'], vessel('tank', [60, 55], 'KONİK TANK', {
    body: (it) => {
      const [hw, hh] = halves(it);
      const cone = Math.min(it.h * 0.35, it.w * 0.6);
      return P(`M${-hw} ${-hh}V${hh - cone}L0 ${hh}L${hw} ${hh - cone}V${-hh}`, EQUIP) + levelMark(hw, hh, it.h);
    }
  }));
  def('e.tankUltra', 'vessel', ['Ultrasonik Tank', 'Ultrasonic Tank', 'Ultraschalltank'], vessel('tank', [70, 45], 'ULTRASONİK TANK', {
    body: (it) => {
      const [hw, hh] = halves(it);
      const count = Math.max(2, Math.floor((it.w - 8) / 8));
      const first = -(count * 8) / 2;
      const waves = `M${first} ${hh - 3}${'q2 -3 4 0q2 3 4 0'.repeat(count)}`;
      return OPEN_TANK(hw, hh) + levelMark(hw, hh, it.h) + P(waves, THIN) + P(`M${-hw + 2} ${hh - 1.1}H${hw - 2}`, THIN);
    }
  }));
  def('e.sump', 'vessel', ['Toplama Haznesi', 'Collection Sump', 'Sammelbehälter'], vessel('tank', [60, 30], 'TOPLAMA HAZNESİ', {
    body: (it) => {
      const [hw, hh] = halves(it);
      const slope = Math.min(8, it.h * 0.22);
      return P(`M${-hw} ${-hh}V${hh - slope}L${hw} ${hh}V${-hh}`, EQUIP) + levelMark(hw, hh, it.h);
    }
  }));

  // Bırakıldığında presets.js sprey, sepet, redüktör, kapak switchi ve el koruma sensörünü ekler
  def('e.cabin', 'vessel', ['Yıkama Hücresi', 'Washing Cell', 'Waschzelle'], vessel('cell', [110, 90], 'YIKAMA HÜCRESİ', {
    preset: 'washCell',
    body: (it) => R(-it.w / 2, -it.h / 2, it.w, it.h, `rx="2" ${CELL}`)
  }));
  def('e.dryCell', 'vessel', ['Kurutma Hücresi', 'Drying Cell', 'Trockenzelle'], vessel('cell', [110, 70], 'KURUTMA HÜCRESİ', {
    body: (it) => {
      const [hw, hh] = halves(it);
      const wave = (x) => P(`M${x} ${-hh + 13}c1.6 -1.6 -1.6 -3.2 0 -4.8s-1.6 -3.2 0 -4.8`, THIN);
      const waves = it.w >= 36 && it.h >= 20 ? wave(hw - 14) + wave(hw - 9.5) + wave(hw - 5) : '';
      return R(-hw, -hh, it.w, it.h, `rx="2" ${CELL}`) + waves;
    }
  }));
  def('e.vacCell', 'vessel', ['Vakum Hücresi', 'Vacuum Cell', 'Vakuumzelle'], vessel('cell', [100, 70], 'VAKUM HÜCRESİ', {
    body: (it) => {
      const [hw, hh] = halves(it);
      const rx = Math.min(12, it.h / 4, it.w / 4);
      return R(-hw, -hh, it.w, it.h, `rx="${rx}" ${CELL}`) +
        R(-hw + 1.6, -hh + 1.6, it.w - 3.2, it.h - 3.2, `rx="${Math.max(0, rx - 1.6)}" ${THIN}`);
    }
  }));
  def('e.tunnel', 'vessel', ['Tünel Hücre', 'Tunnel Cell', 'Tunnelzelle'], vessel('cell', [150, 60], 'TÜNEL HÜCRE', {
    body: (it) => {
      const [hw, hh] = halves(it);
      const gap = Math.min(it.h * 0.4, 18) / 2;
      return P(`M${-hw} ${-gap}V${-hh}H${hw}V${-gap}M${-hw} ${gap}V${hh}H${hw}V${gap}`, CELL);
    }
  }));

  def('e.basket', 'vessel', ['Yıkama Sepeti', 'Washing Basket', 'Waschkorb'], {
    resizable: true,
    container: true,
    vesselType: 'basket',
    keepAspect: true,
    tag: 'none',
    defaultSize: [60, 60],
    body: (it) => {
      const r = Math.min(it.w, it.h) / 2;
      const ring = Math.max(1, r * 0.07);
      return C(0, 0, r - ring / 2, `stroke-width="${ring}" ${WHITE}`);
    },
    texts: centerLabel({ tr: 'YIKAMA SEPETİ', en: 'WASHING BASKET', de: 'WASCHKORB' })
  });
  def('e.rectBasket', 'vessel', ['Dikdörtgen Sepet', 'Rectangular Basket', 'Rechteckkorb'], {
    resizable: true,
    container: true,
    vesselType: 'basket',
    tag: 'none',
    defaultSize: [70, 45],
    body: (it) => {
      const [hw, hh] = halves(it);
      return R(-hw, -hh, it.w, it.h, `rx="1" ${CELL}`) + R(-hw + 1.8, -hh + 1.8, it.w - 3.6, it.h - 3.6, DASH);
    },
    texts: centerLabel({ tr: 'SEPET', en: 'BASKET', de: 'KORB' }, 0.2)
  });
  def('e.drum', 'vessel', ['Tambur', 'Drum', 'Trommel'], {
    resizable: true,
    container: true,
    vesselType: 'basket',
    tag: 'none',
    defaultSize: [90, 45],
    body: (it) => {
      const [hw, hh] = halves(it);
      const rx = +(Math.min(it.h, it.w) * 0.16).toFixed(2);
      const count = Math.max(1, Math.floor(it.w / 12));
      let ribs = '';
      for (let i = 1; i < count; i += 1) {
        const x = +(-hw + (it.w * i) / count).toFixed(2);
        ribs += `M${x} ${-hh}V${hh}`;
      }
      return R(-hw, -hh, it.w, it.h, `rx="${rx}" ${CELL}`) + (ribs ? P(ribs, THIN) : '') + P(`M${-hw} 0H${hw}`, DASH);
    },
    texts: (it, lang) => {
      const label = { tr: 'TAMBUR', en: 'DRUM', de: 'TROMMEL' };
      return [{ x: 0, y: -Math.min(it.w, it.h) * 0.2, t: label[lang] || label.tr, s: Math.max(2.2, Math.min(it.w, it.h) * 0.1) }];
    }
  });
  def('e.rotaryTable', 'vessel', ['Döner Tabla', 'Rotary Table', 'Drehtisch'], {
    resizable: true,
    container: true,
    vesselType: 'basket',
    keepAspect: true,
    tag: 'none',
    defaultSize: [50, 50],
    body: (it) => {
      const r = Math.min(it.w, it.h) / 2;
      const a = +(r * 0.62).toFixed(2);
      const head = +(r * 0.1).toFixed(2);
      return C(0, 0, r - 0.4, `stroke-width="0.8" ${WHITE}`) + C(0, 0, head, SOLID) +
        P(`M${a} 0A${a} ${a} 0 0 1 0 ${a}`) + P(`M${head} ${+(a - head).toFixed(2)}L0 ${a}L${head} ${+(a + head).toFixed(2)}`);
    },
    texts: (it, lang) => {
      const label = { tr: 'DÖNER TABLA', en: 'ROTARY TABLE', de: 'DREHTISCH' };
      const r = Math.min(it.w, it.h) / 2;
      return [{ x: 0, y: -r * 0.42, t: label[lang] || label.tr, s: Math.max(2, r * 0.12) }];
    }
  });

  /* ─── Ekipman ─────────────────────────────────────────── */
  def('e.boundary', 'equip', ['Paket Sınırı', 'Package Boundary', 'Paketgrenze'], {
    resizable: true,
    container: true,
    noObstacle: true,
    tag: 'inside',
    defaultSize: [120, 80],
    body: (it) => R(-it.w / 2, -it.h / 2, it.w, it.h, 'stroke-width="0.25" stroke-dasharray="6 1.5 1 1.5"')
  });
  def('e.filter', 'equip', ['Filtre', 'Filter', 'Filter'], {
    body: R(-6, -8, 12, 16, `rx="1" ${WHITE}`) + P('M-6 8L6 -8', DASH),
    box: [-6, -8, 6, 8],
    ports: [...lr(6), { id: 'U', x: 0, y: -8, dir: 'U' }, { id: 'D', x: 0, y: 8, dir: 'D' }],
    inline: true
  });
  def('e.strainer', 'equip', ['Pislik Tutucu', 'Strainer', 'Schmutzfänger'], {
    body: P('M-5 0H5') + P('M-2 0L2 5L3.8 3.4L0 0') + P('M-0.6 0.4L2.6 4.2', DASH),
    box: [-5, -1, 5, 5],
    ports: LR5,
    inline: true
  });
  def('e.hx', 'equip', ['Eşanjör', 'Heat Exchanger', 'Wärmetauscher'], {
    body: C(0, 0, 7, WHITE) + P('M-7 0H-3.5L-1.5 -3.5L1.5 3.5L3.5 0H7'),
    box: [-7, -7, 7, 7],
    ports: port4(7),
    inline: true
  });
  def('e.nozzle', 'equip', ['Nozul', 'Nozzle', 'Düse'], {
    body: P('M0 -3V-1') + P('M-2 -1H2L1 1.2H-1Z', WHITE) + P('M-1 1.8L-3 5M0 1.8V5.5M1 1.8L3 5', DASH),
    box: [-3, -3, 3, 5.5],
    ports: [{ id: 'U', x: 0, y: -3, dir: 'U' }]
  });
  const sprayNozzles = [-16, -8, 0, 8, 16].map((x) =>
    P(`M${x} 0V1.8`) + P(`M${x - 1.2} 1.8H${x + 1.2}L${x + 0.6} 3.4H${x - 0.6}Z`, WHITE) +
    P(`M${x - 0.6} 3.9L${x - 2} 6.4M${x} 3.9V6.8M${x + 0.6} 3.9L${x + 2} 6.4`, DASH)).join('');
  def('e.spray', 'equip', ['Sprey Manifoldu', 'Spray Manifold', 'Sprühverteiler'], {
    body: P('M-20 0H20', 'stroke-width="0.7"') + sprayNozzles,
    box: [-20, -1, 20, 7],
    ports: lr(20),
    inline: true
  });
  /* Kurutma hava bıçağı: blower havası dar hazneden ince bir yarıkla perde hâlinde çıkar, parçadaki suyu sıyırır.
     Hava üstten (U) ya da uçlardan (L, R) beslenir; kesikli eğik çizgiler hava perdesidir. */
  const AIR_CURTAIN = [-9, -6, -3, 0, 3, 6, 9].map((x) => P(`M${x} 2.8L${x - 1.6} 7.5`, DASH)).join('');
  def('e.airKnife', 'equip', ['Kurutma Hava Bıçağı', 'Drying Air Knife', 'Trocknungs-Luftmesser'], {
    body: P('M0 -3V-5') + R(-12, -3, 24, 3.5, `rx="0.8" ${WHITE}`) + P('M-11 0.5L-9.5 2.4H9.5L11 0.5', WHITE) +
      P('M-9.5 2.4H9.5', 'stroke-width="0.7"') + AIR_CURTAIN,
    box: [-12, -5, 12, 7.5],
    ports: [{ id: 'U', x: 0, y: -5, dir: 'U' }, { id: 'L', x: -12, y: -1.25, dir: 'L' }, { id: 'R', x: 12, y: -1.25, dir: 'R' }]
  });
  def('e.skimmer', 'equip', ['Yağ Sıyırıcı', 'Oil Skimmer', 'Ölabscheider'], {
    body: R(-8, -5, 16, 10, `rx="1" ${WHITE}`) + C(3, 0, 3) + P('M3 0L5.1 -2.1', THIN) + P('M-6 -2.5H-1M-6 0H-1M-6 2.5H-1', THIN),
    box: [-8, -5, 8, 5],
    ports: lr(8)
  });
  def('e.conveyor', 'equip', ['Konveyör', 'Conveyor', 'Förderband'], {
    body: R(-20, -4, 40, 8, `rx="4" ${WHITE}`) + C(-16, 0, 2.6) + C(16, 0, 2.6) + P('M-7 0H6M3.6 -1.6L6 0L3.6 1.6'),
    box: [-20, -4, 20, 4],
    ports: lr(20)
  });

  /* ─── Isıtma ve ultrasonik ────────────────────────────── */
  def('h.resistance', 'heat', ['Rezistans', 'Electric Heater', 'Heizwiderstand'], {
    body: R(-11, -3.5, 22, 7, `rx="1" ${WHITE}`) + P('M-9 0L-7.5 -2.2L-4.5 2.2L-1.5 -2.2L1.5 2.2L4.5 -2.2L7.5 2.2L9 0'),
    box: [-11, -3.5, 11, 3.5],
    // U: tank tabanındaki rezistansa sinyal yukarıdan iner
    ports: [...lr(11), { id: 'U', x: 0, y: -3.5, dir: 'U' }]
  });
  def('h.burner', 'heat', ['Brülör', 'Burner', 'Brenner'], {
    body: R(-7, -5, 14, 10, `rx="1" ${WHITE}`) +
      P('M0 3.8C-3 3.8 -3.6 0.8 -1.6 -1C-1.4 0 -0.8 0.4 -0.4 0.2C-0.8 -1.6 0.4 -3.2 1.2 -3.8C1 -2.2 3.4 -0.8 3 1.4C2.8 3 1.6 3.8 0 3.8Z'),
    box: [-7, -5, 7, 5],
    ports: lr(7)
  });
  def('h.ultrasonic', 'heat', ['Ultrasonik Jeneratör', 'Ultrasonic Generator', 'Ultraschallgenerator'], {
    body: R(-9, -5, 18, 10, `rx="1" ${WHITE}`) + P('M-7 0C-5.5 -5 -4 -5 -3.5 0S-1.5 5 0 0S2.5 -5 3.5 0S5.5 5 7 0'),
    box: [-9, -5, 9, 5],
    ports: [...lr(9), { id: 'D', x: 0, y: 5, dir: 'D' }]
  });

  // Tank tabanına bağlanan transdüser plakası; dalgalar sıvıya doğru yayılır, kablo jeneratöre gider
  def('h.transducer', 'heat', ['Ultrasonik Transdüser', 'Ultrasonic Transducer', 'Ultraschallschwinger'], {
    body: R(-10, -1.5, 20, 3, `rx="0.6" ${WHITE}`) + P('M-6 -1.5V1.5M-2 -1.5V1.5M2 -1.5V1.5M6 -1.5V1.5', THIN) +
      P('M-5.5 -3.6Q0 -5.6 5.5 -3.6', THIN) + P('M-3.8 -5.8Q0 -7.4 3.8 -5.8', THIN) + P('M-2 -7.9Q0 -8.9 2 -7.9', THIN),
    box: [-10, -8.9, 10, 1.5],
    ports: [...lr(10), { id: 'D', x: 0, y: 1.5, dir: 'D' }]
  });

  /* ─── Pnömatik (ISO 1219) ─────────────────────────────── */
  const solenoidL = R(-11, -2.5, 4, 5, WHITE) + P('M-11 2.5L-7 -2.5', THIN);
  const arrowUp = (x) => P(`M${x} 3.5V-3.5M${x - 0.8} -2L${x} -3.5L${x + 0.8} -2`, THIN);
  const arrowDown = (x) => P(`M${x} -3.5V3.5M${x - 0.8} 2L${x} 3.5L${x + 0.8} 2`, THIN);

  def('n.valve52', 'pneu', ['5/2 Bobinli Valf', '5/2 Solenoid Valve', '5/2-Magnetventil'], {
    body: R(-7, -3.5, 7, 7, WHITE) + R(0, -3.5, 7, 7, WHITE) +
      arrowUp(-5.5) + arrowDown(-1.5) +
      P('M1.5 3.5L5.5 -3.5M5.5 3.5L1.5 -3.5', THIN) +
      solenoidL + R(7, -2.5, 4, 5, WHITE) + P('M7 2.5L11 -2.5', THIN) +
      P('M0.8 5H2.2L1.5 3.5ZM4.8 5H6.2L5.5 3.5Z', THIN),
    box: [-11, -3.5, 11, 5],
    ports: [
      { id: 'A', x: 1.5, y: -3.5, dir: 'U' },
      { id: 'B', x: 5.5, y: -3.5, dir: 'U' },
      { id: 'P', x: 3.5, y: 3.5, dir: 'D' }
    ]
  });
  def('n.valve32', 'pneu', ['3/2 Bobinli Valf', '3/2 Solenoid Valve', '3/2-Magnetventil'], {
    body: R(-7, -3.5, 7, 7, WHITE) + R(0, -3.5, 7, 7, WHITE) +
      arrowUp(-3.5) + P('M3.5 3.5V0M2.3 0H4.7M3.5 -3.5V-1', THIN) +
      solenoidL + P('M7 0L8 -2L9 2L10 -2L11 2L12 0', THIN),
    box: [-11, -3.5, 12, 3.5],
    ports: [
      { id: 'A', x: 3.5, y: -3.5, dir: 'U' },
      { id: 'P', x: 3.5, y: 3.5, dir: 'D' }
    ]
  });
  /* Pistonlar: S portları konum sensörü içindir, A ve B hava girişleridir */
  const PISTON_WALL = 'stroke-width="0.7"';
  const PISTON_ROD = 'stroke-width="0.6"';
  const doubleActing = {
    layer: 'pneu',
    body: R(-12, -4, 20, 8, WHITE) + P('M-3 -4V4', PISTON_WALL) + P('M-3 0H14', PISTON_ROD),
    box: [-12, -4, 14, 4],
    ports: [
      { id: 'A', x: -9, y: 4, dir: 'D' },
      { id: 'B', x: 5, y: 4, dir: 'D' },
      { id: 'R', x: 14, y: 0, dir: 'R' },
      { id: 'S1', x: -9, y: -4, dir: 'U' },
      { id: 'S2', x: 5, y: -4, dir: 'U' }
    ]
  };
  def('n.cylinder', 'piston', ['Çift Etkili Piston', 'Double-Acting Cylinder', 'Doppeltwirkender Zylinder'], doubleActing);
  // Bırakıldığında presets.js açık ve kapalı konum sensörünü bağlantılarıyla ekler
  def('n.cylinderSet', 'piston', ['Sensörlü Piston', 'Cylinder with Sensors', 'Zylinder mit Sensoren'],
    Object.assign({}, doubleActing, { preset: 'pistonSet' }));
  def('n.cylinderSpring', 'piston', ['Tek Etkili Piston (Yaylı)', 'Single-Acting Cylinder (Spring)', 'Einfachwirkender Zylinder (Feder)'], {
    layer: 'pneu',
    body: R(-12, -4, 20, 8, WHITE) + P('M-3 -4V4', PISTON_WALL) + P('M-3 0H14', PISTON_ROD) +
      P('M-2 -3L-0.5 3L1 -3L2.5 3L4 -3L5.5 3L7 -3', THIN),
    box: [-12, -4, 14, 4],
    ports: [
      { id: 'A', x: -9, y: 4, dir: 'D' },
      { id: 'R', x: 14, y: 0, dir: 'R' },
      { id: 'S1', x: -9, y: -4, dir: 'U' },
      { id: 'S2', x: 5, y: -4, dir: 'U' }
    ]
  });
  def('n.cylinderRod', 'piston', ['Çift Milli Piston', 'Double-Rod Cylinder', 'Zylinder mit durchgehender Stange'], {
    layer: 'pneu',
    body: R(-8, -4, 16, 8, WHITE) + P('M0 -4V4', PISTON_WALL) + P('M-14 0H14', PISTON_ROD),
    box: [-14, -4, 14, 4],
    ports: [
      { id: 'A', x: -5, y: 4, dir: 'D' },
      { id: 'B', x: 5, y: 4, dir: 'D' },
      { id: 'L', x: -14, y: 0, dir: 'L' },
      { id: 'R', x: 14, y: 0, dir: 'R' },
      { id: 'S1', x: -5, y: -4, dir: 'U' },
      { id: 'S2', x: 5, y: -4, dir: 'U' }
    ]
  });
  // Tank lift pistonu: açık, ara ve kapalı konum için üç sensör portu
  def('n.cylinderLift', 'piston', ['Lift Pistonu (3 Konumlu)', 'Lift Cylinder (3 Positions)', 'Hubzylinder (3 Stellungen)'], {
    layer: 'pneu',
    body: R(-14, -4, 28, 8, WHITE) + P('M-6 -4V4', PISTON_WALL) + P('M-6 0H18', PISTON_ROD) + P('M18 -3.2V3.2', 'stroke-width="1"'),
    box: [-14, -4, 18.5, 4],
    ports: [
      { id: 'A', x: -11, y: 4, dir: 'D' },
      { id: 'B', x: 11, y: 4, dir: 'D' },
      { id: 'R', x: 18.5, y: 0, dir: 'R' },
      { id: 'S1', x: -11, y: -4, dir: 'U' },
      { id: 'S2', x: 0, y: -4, dir: 'U' },
      { id: 'S3', x: 11, y: -4, dir: 'U' }
    ]
  });
  def('n.frl', 'pneu', ['Hava Şartlandırıcı', 'Air Preparation Unit', 'Wartungseinheit'], {
    body: R(-12, -5, 24, 10, WHITE) + P('M-4 -5V5M4 -5V5', THIN) +
      P('M-8 -3L-5.5 0L-8 3L-10.5 0Z', THIN) + P('M-8 -3V3', 'stroke-dasharray="0.8 0.6" stroke-width="0.2"') +
      P('M-2.4 2.4L2.4 -2.4M2.4 -2.4L0.8 -2.1M2.4 -2.4L2.1 -0.8', THIN) +
      P('M8 -3L10.5 0L8 3L5.5 0Z', THIN) + P('M8 -1.5V1.5', THIN),
    box: [-12, -5, 12, 5],
    ports: lr(12),
    inline: true
  });
  def('n.silencer', 'pneu', ['Susturucu', 'Silencer', 'Schalldämpfer'], {
    body: P('M0 -3V-1') + R(-1.8, -1, 3.6, 4, WHITE) + P('M-1.8 0.2H1.8M-1.8 1.8H1.8', THIN),
    box: [-1.8, -3, 1.8, 3],
    ports: [{ id: 'U', x: 0, y: -3, dir: 'U' }]
  });

  /* ─── Hat elemanları ──────────────────────────────────── */
  def('l.reducer', 'pipe', ['Redüksiyon', 'Reducer', 'Reduzierung'], {
    body: P('M-3 -3L3 -1.5V1.5L-3 3Z', WHITE),
    box: [-3, -3, 3, 3],
    ports: lr(3),
    inline: true,
    tag: 'none'
  });
  def('l.flange', 'pipe', ['Flanş', 'Flange', 'Flansch'], {
    body: P('M-0.7 -3V3M0.7 -3V3', 'stroke-width="0.5"'),
    box: [-0.7, -3, 0.7, 3],
    ports: lr(0.7),
    inline: true,
    tag: 'none'
  });
  def('l.drain', 'pipe', ['Drenaj Çıkışı', 'Drain Outlet', 'Ablauf'], {
    body: P('M0 -4V-1') + P('M-3 -1H3L1 2.5H-1Z', WHITE) + P('M-3.5 4.5H3.5M-2.2 5.7H2.2M-1 6.9H1', THIN),
    box: [-3.5, -4, 3.5, 7],
    ports: [{ id: 'U', x: 0, y: -4, dir: 'U' }],
    tag: 'none'
  });
  def('l.vent', 'pipe', ['Hava Tahliye', 'Vent', 'Entlüftung'], {
    body: P('M0 4V-2A2 2 0 0 1 4 -2V0'),
    box: [0, -4, 4, 4],
    ports: [{ id: 'D', x: 0, y: 4, dir: 'D' }],
    tag: 'none'
  });
  const flagText = (it) => [{ x: -1, y: 0, t: it.note || '', s: 2.5, b: true }];
  def('l.inlet', 'pipe', ['Hat Girişi', 'Line Inlet', 'Leitungseingang'], {
    body: P('M-17 -4H13L17 0L13 4H-17Z', WHITE),
    texts: flagText,
    box: [-17, -4, 17, 4],
    ports: [{ id: 'R', x: 17, y: 0, dir: 'R' }],
    tag: 'none',
    defaultNote: 'ŞEBEKE SUYU'
  });
  def('l.outlet', 'pipe', ['Hat Çıkışı', 'Line Outlet', 'Leitungsausgang'], {
    body: P('M-17 -4H13L17 0L13 4H-17L-13 0Z', WHITE),
    texts: (it) => [{ x: 0, y: 0, t: it.note || '', s: 2.5, b: true }],
    box: [-17, -4, 17, 4],
    ports: [{ id: 'L', x: -13, y: 0, dir: 'L' }],
    tag: 'none',
    defaultNote: 'DRENAJ'
  });
  def('l.offpage', 'pipe', ['Sayfa Bağlantısı', 'Off-Page Connector', 'Blattverbinder'], {
    body: P('M-13 -4H9L13 0L9 4H-13Z', WHITE) + P('M6 -4L10 0L6 4', THIN),
    texts: (it) => [{ x: -2, y: 0, t: it.note || '', s: 2.5, b: true }],
    box: [-13, -4, 13, 4],
    ports: [{ id: 'L', x: -13, y: 0, dir: 'L' }, { id: 'R', x: 13, y: 0, dir: 'R' }],
    tag: 'none',
    defaultNote: 'SAYFA 2'
  });
  def('l.junction', 'pipe', ['Bağlantı Noktası', 'Junction', 'Knotenpunkt'], {
    body: (it) => (it.showDot ? C(0, 0, 0.9, SOLID) : ''),
    box: [-1, -1, 1, 1],
    ports: [{ id: 'C', x: 0, y: 0, dir: null }],
    tag: 'none',
    hidden: true
  });

  /* ─── Enstrüman (ISA-5.1) ─────────────────────────────── */
  const bubbleText = (it) => {
    const func = it.func || '';
    const tag = it.tag || '';
    if (func && tag) {
      return [
        { x: 0, y: -1.7, t: func, s: 3.1, b: true },
        { x: 0, y: 2.5, t: tag, s: 2.4 }
      ];
    }
    return [{ x: 0, y: 0, t: func || tag, s: 3.1, b: true }];
  };
  const instrument = { texts: bubbleText, box: [-6.5, -6.5, 6.5, 6.5], ports: port4(6.5), tag: 'inside-symbol', isInstrument: true };

  def('i.field', 'inst', ['Saha Enstrümanı', 'Field Instrument', 'Feldinstrument'],
    Object.assign({ body: C(0, 0, 6.5, WHITE) }, instrument));
  def('i.panel', 'inst', ['Pano Enstrümanı', 'Panel Instrument', 'Schaltschrankinstrument'],
    Object.assign({ body: C(0, 0, 6.5, WHITE) + P('M-6.5 0H6.5') }, instrument));
  def('i.hmi', 'inst', ['HMI / Ekran', 'HMI / Shared Display', 'HMI / Anzeige'],
    Object.assign({ body: R(-6.5, -6.5, 13, 13, WHITE) + C(0, 0, 6.5) }, instrument));
  def('i.plc', 'inst', ['PLC Fonksiyonu', 'PLC Function', 'SPS-Funktion'],
    Object.assign({ body: R(-6.5, -6.5, 13, 13, WHITE) + P('M0 -6.5L6.5 0L0 6.5L-6.5 0Z') }, instrument));
  def('i.interlock', 'inst', ['Interlock', 'Interlock', 'Verriegelung'], {
    body: P('M0 -7.5L7.5 0L0 7.5L-7.5 0Z', WHITE),
    texts: (it) => [{ x: 0, y: 0, t: it.func || 'I/L', s: 2.8, b: true }],
    box: [-7.5, -7.5, 7.5, 7.5],
    ports: port4(7.5),
    isInstrument: true,
    defaultFunc: 'I/L'
  });

  /* Kod listesindeki enstrüman türleri: ISA harfi hazır gelir, kod sonradan seçilir */
  const FIELD = C(0, 0, 6.5, WHITE);
  const PANEL = C(0, 0, 6.5, WHITE) + P('M-6.5 0H6.5');
  const typed = (id, names, func, extra) =>
    def(id, 'inst', names, Object.assign({ body: FIELD }, instrument, { defaultFunc: func }, extra));

  /* Her kod serisinin kendi şekli vardır; ISA harfi ve kod gövdenin içinde okunur.
     Daireden çıkan sap, sensörün hatta veya tanka battığı noktadır: alt bağlantı (D) sapın ucundadır. */
  const onStem = (bottom, parts) => ({
    body: FIELD + parts,
    box: [-6.5, -6.5, 6.5, bottom],
    ports: [
      { id: 'L', x: -6.5, y: 0, dir: 'L' },
      { id: 'R', x: 6.5, y: 0, dir: 'R' },
      { id: 'U', x: 0, y: -6.5, dir: 'U' },
      { id: 'D', x: 0, y: bottom, dir: 'D' }
    ]
  });

  // LS: üstte seviye işareti, altta sıvı yüzeyi
  const LEVEL = { body: FIELD + P('M-1.4 -5.6H1.4L0 -4.1Z', THIN) + P('M-3 4.9q0.75 -0.8 1.5 0t1.5 0t1.5 0t1.5 0', THIN) };
  typed('i.level', ['Seviye Sensörü', 'Level Sensor', 'Füllstandssensor'], 'LS', LEVEL);
  typed('i.lsl', ['Alt Seviye Sensörü', 'Low Level Switch', 'Füllstandsschalter unten'], 'LSL', LEVEL);
  typed('i.lsm', ['Orta Seviye Sensörü', 'Mid Level Switch', 'Füllstandsschalter Mitte'], 'LSM', LEVEL);
  typed('i.lsh', ['Üst Seviye Sensörü', 'High Level Switch', 'Füllstandsschalter oben'], 'LSH', LEVEL);

  // TC: termometre haznesi
  typed('i.temp', ['Sıcaklık Sensörü (Isı Ölçer)', 'Temperature Sensor', 'Temperatursensor'], 'TE',
    onStem(12.4, P('M0 6.5V10') + C(0, 11.2, 1.2, SOLID)));

  // PS: basınç diyaframı; su damlası, hava çizgileri ve vakum işareti türü ayırır
  const DIAPHRAGM = P('M0 6.5V8.5') + P('M-3 8.5H3A3 3 0 0 1 -3 8.5Z', WHITE);
  typed('i.pt', ['Basınç Sensörü (4-20 mA)', 'Pressure Transmitter', 'Drucktransmitter'], 'PT', onStem(11.5, DIAPHRAGM));
  // Sistem kodları: su girişi PS06, hava girişi PS07; çizimde boştaysa kod kendiliğinden gelir
  typed('i.waterPressure', ['Giriş Su Basınç Sensörü', 'Inlet Water Pressure Sensor', 'Eingangs-Wasserdrucksensor'], 'PT',
    Object.assign({ defaultTag: 'PS06' }, onStem(11.5, DIAPHRAGM + P('M0 -6Q1.3 -4.6 0 -3.9Q-1.3 -4.6 0 -6Z', THIN))));
  typed('i.airPressure', ['Giriş Hava Basınç Sensörü', 'Inlet Air Pressure Sensor', 'Eingangs-Luftdrucksensor'], 'PT',
    Object.assign({ defaultTag: 'PS07' }, onStem(11.5, DIAPHRAGM + P('M-2.4 -5.3q1.2 -0.7 2.4 0t2.4 0M-2.4 -3.9q1.2 -0.7 2.4 0t2.4 0', THIN))));
  typed('i.vacuum', ['Vakum Sensörü', 'Vacuum Sensor', 'Vakuumsensor'], 'PT',
    onStem(11.5, DIAPHRAGM + P('M-1.8 -5.6L0 -3.9L1.8 -5.6', THIN)));

  // SW: makaralı limit switch gövdesi
  const SWITCH_BODY = R(-7.5, -5.5, 15, 11, `rx="1" ${WHITE}`);
  const SWITCH_LEVER = P('M-4.5 -5.5L-1.6 -8.2') + C(-0.8, -8.9, 1.1, WHITE);
  const onSwitch = (parts, bottom) => ({
    body: SWITCH_BODY + parts,
    box: [-7.5, -10, 7.5, bottom || 5.5],
    ports: [
      { id: 'L', x: -7.5, y: 0, dir: 'L' },
      { id: 'R', x: 7.5, y: 0, dir: 'R' },
      { id: 'U', x: 3.5, y: -5.5, dir: 'U' },
      { id: 'D', x: 0, y: bottom || 5.5, dir: 'D' }
    ]
  });
  typed('i.switch', ['Konum Switchi', 'Position Switch', 'Positionsschalter'], 'ZS', onSwitch(SWITCH_LEVER));
  // Kolun değdiği kalın çizgi kapaktır
  typed('i.lid', ['Kapak Switchi', 'Lid Switch', 'Deckelschalter'], 'ZS', onSwitch(SWITCH_LEVER + P('M-3.5 -10H3', 'stroke-width="0.8"')));
  // Basınç şalteri (PS): switch gövdesinin altında diyafram
  typed('i.ps', ['Basınç Şalteri', 'Pressure Switch', 'Druckschalter'], 'PS', Object.assign(onSwitch(P('M0 5.5V7.5') + P('M-3 7.5H3A3 3 0 0 1 -3 7.5Z', WHITE), 10.5), {
    box: [-7.5, -5.5, 7.5, 10.5]
  }));

  // PHS: sıvıya dalan cam prob; CS: iki elektrotlu prob
  typed('i.ph', ['pH Sensörü', 'pH Sensor', 'pH-Sensor'], 'AT',
    Object.assign({ defaultNote: 'pH' }, onStem(12, P('M0 6.5V8.5') + R(-1.3, 8.5, 2.6, 3.5, `rx="0.6" ${WHITE}`))));
  typed('i.cond', ['İletkenlik Sensörü', 'Conductivity Sensor', 'Leitfähigkeitssensor'], 'AT',
    Object.assign({ defaultNote: 'µS/cm' }, onStem(12, P('M0 6.5V8.5M-1.6 8.5H1.6M-1.6 8.5V12M1.6 8.5V12'))));

  // Akış: gövdenin altında akış oku
  typed('i.flow', ['Akış Switchi', 'Flow Switch', 'Strömungswächter'], 'FS', { body: FIELD + P('M-3.6 4.9H3.2M2 3.8L3.6 4.9L2 6', THIN) });

  /* Piston konum sensörleri (PPS): genel enstrüman dairesinden ayrılsın diye silindir gövdeli */
  const pistonSensor = (id, names, func) => def(id, 'piston', names, Object.assign({}, instrument, {
    layer: 'inst',
    body: R(-8, -5.5, 16, 11, `rx="5.5" ${WHITE}`),
    box: [-8, -5.5, 8, 5.5],
    ports: [
      { id: 'L', x: -8, y: 0, dir: 'L' },
      { id: 'R', x: 8, y: 0, dir: 'R' },
      { id: 'U', x: 0, y: -5.5, dir: 'U' },
      { id: 'D', x: 0, y: 5.5, dir: 'D' }
    ],
    defaultFunc: func
  }));
  pistonSensor('i.pistonSensor', ['Piston Sensörü', 'Cylinder Sensor', 'Zylindersensor'], 'ZS');
  pistonSensor('i.zso', ['Piston Açık Sensörü', 'Cylinder Open Sensor', 'Zylindersensor offen'], 'ZSO');
  pistonSensor('i.zsm', ['Piston Ara Sensörü', 'Cylinder Mid Sensor', 'Zylindersensor Mitte'], 'ZSM');
  pistonSensor('i.zsc', ['Piston Kapalı Sensörü', 'Cylinder Closed Sensor', 'Zylindersensor geschlossen'], 'ZSC');
  /* Aynı sensörlerin ISA-5.1 gösterimi: saha enstrümanı dairesi, içinde ZSO / ZSC harfi ve kodu.
     altOf: kod girilince önerilen silindir gövdeli karşılığı; "Önerilen sembole geç" bunun için çıkmaz. */
  const isaPistonSensor = (id, names, func, altOf) => def(id, 'piston', names,
    Object.assign({ body: FIELD }, instrument, { layer: 'inst', defaultFunc: func, altOf }));
  isaPistonSensor('i.zsIsa', ['Piston Sensörü (ISA, ZS)', 'Cylinder Sensor (ISA, ZS)', 'Zylindersensor (ISA, ZS)'], 'ZS', 'i.pistonSensor');
  isaPistonSensor('i.zsoIsa', ['Piston Açık Sensörü (ISA, ZSO)', 'Cylinder Open Sensor (ISA, ZSO)', 'Zylindersensor offen (ISA, ZSO)'], 'ZSO', 'i.zso');
  isaPistonSensor('i.zsmIsa', ['Piston Ara Sensörü (ISA, ZSM)', 'Cylinder Mid Sensor (ISA, ZSM)', 'Zylindersensor Mitte (ISA, ZSM)'], 'ZSM', 'i.zsm');
  isaPistonSensor('i.zscIsa', ['Piston Kapalı Sensörü (ISA, ZSC)', 'Cylinder Closed Sensor (ISA, ZSC)', 'Zylindersensor geschlossen (ISA, ZSC)'], 'ZSC', 'i.zsc');
  // PRS: mermi gövdeli yaklaşım sensörü, önünde algılama alanı
  typed('i.prox', ['Endüktif Sensör (Prox)', 'Proximity Sensor', 'Näherungsschalter'], 'ZS', {
    body: P('M-8 -5.5H4A5.5 5.5 0 0 1 4 5.5H-8Z', WHITE) + P('M10.6 -2.8Q12 0 10.6 2.8M12.4 -3.8Q14.2 0 12.4 3.8', THIN),
    box: [-8, -5.5, 13.5, 5.5],
    ports: [
      { id: 'L', x: -8, y: 0, dir: 'L' },
      { id: 'R', x: 9.5, y: 0, dir: 'R' },
      { id: 'U', x: 0, y: -5.5, dir: 'U' },
      { id: 'D', x: 0, y: 5.5, dir: 'D' }
    ]
  });
  // SWB: vana üstündeki altıgen konum kutusu
  typed('i.switchBox', ['Vana Switch Box', 'Valve Switch Box', 'Ventilstellungsmelder'], 'ZS', {
    body: P('M-5 -5.5H5L8.5 0L5 5.5H-5L-8.5 0Z', WHITE),
    box: [-8.5, -5.5, 8.5, 5.5],
    ports: [
      { id: 'L', x: -8.5, y: 0, dir: 'L' },
      { id: 'R', x: 8.5, y: 0, dir: 'R' },
      { id: 'U', x: 0, y: -5.5, dir: 'U' },
      { id: 'D', x: 0, y: 5.5, dir: 'D' }
    ]
  });
  // B: basma başlığı olan pano düğmesi
  typed('i.button', ['Buton (Start / Stop / Reset)', 'Push Button', 'Taster'], 'HS', {
    body: PANEL + P('M0 -6.5V-8.2') + P('M-3 -8.2H3', 'stroke-width="0.9"'),
    box: [-6.5, -8.6, 6.5, 6.5],
    ports: [
      { id: 'L', x: -6.5, y: 0, dir: 'L' },
      { id: 'R', x: 6.5, y: 0, dir: 'R' },
      { id: 'U', x: 0, y: -8.6, dir: 'U' },
      { id: 'D', x: 0, y: 6.5, dir: 'D' }
    ]
  });
  // L: ışık saçan lamba
  typed('i.lamp', ['Lamba', 'Lamp', 'Leuchte'], 'XL', {
    body: C(0, 0, 5.5, WHITE) + P('M-3.9 -3.9L-5.6 -5.6M3.9 -3.9L5.6 -5.6M-3.9 3.9L-5.6 5.6M3.9 3.9L5.6 5.6M0 -5.5V-7.4M0 5.5V7.4M-5.5 0H-7.4M5.5 0H7.4', THIN),
    box: [-7.4, -7.4, 7.4, 7.4],
    ports: port4(7.4)
  });

  /* ─── Elektrik ve koruma (IEC 60617) ──────────────────── */
  def('e.thermal', 'elec', ['Termik / Motor Koruma Şalteri', 'Thermal Overload / Motor Breaker', 'Motorschutzschalter'], {
    body: R(-6, -4, 12, 8, WHITE) + P('M-4.2 1.4H-1.6V-1.4H1.6V1.4H4.2'),
    box: [-6, -4, 6, 4],
    ports: lr(6),
    logic: { role: 'sensor', kind: 'overload' }
  });
  def('e.fuse', 'elec', ['Sigorta', 'Fuse', 'Sicherung'], {
    body: P('M-8 0H-5M5 0H8') + R(-5, -2.2, 10, 4.4, WHITE) + P('M-5 0H5', THIN),
    box: [-8, -2.2, 8, 2.2],
    ports: lr(8),
    logic: { role: 'sensor', kind: 'electric' }
  });
  def('e.rcd', 'elec', ['Kaçak Akım Rölesi', 'Residual Current Device', 'FI-Schutzschalter'], {
    body: R(-6, -4, 12, 8, WHITE),
    texts: [{ x: 0, y: 0, t: 'IΔ', s: 3.2, b: true }],
    box: [-6, -4, 6, 4],
    ports: lr(6),
    logic: { role: 'sensor', kind: 'electric' }
  });

  /* ─── Güvenlik (P&ID/symbols/SS01.svg, SS03.svg ile aynı çizim) ── */
  const ssScale = (x, y, cx, cy, k) => `${+((x - cx) * k).toFixed(2)} ${+((y - cy) * k).toFixed(2)}`;
  const s1 = (x, y) => ssScale(x, y, 45, 30, 0.26);
  const s3 = (x, y) => ssScale(x, y, 40, 45, 0.24);
  def('s.hand', 'safety', ['El Koruma Sensörü', 'Hand Protection Sensor', 'Handschutzsensor'], {
    body:
      P(`M${s1(4, 18)}H${(26 - 45) * 0.26}V${(42 - 30) * 0.26}H${(4 - 45) * 0.26}Z`, WHITE) +
      P(`M${s1(26, 30)}L${s1(38, 22)}L${s1(38, 38)}Z`, SOLID) +
      P(`M${s1(38, 30)}L${s1(72, 30)}`, 'stroke-dasharray="1.3 1"') +
      P(`M${s1(72, 12)}H${(82 - 45) * 0.26}V${(48 - 30) * 0.26}H${(72 - 45) * 0.26}Z`, WHITE) +
      P(`M${s1(74, 18)}L${s1(80, 24)}M${s1(74, 26)}L${s1(80, 32)}M${s1(74, 34)}L${s1(80, 40)}M${s1(74, 42)}L${s1(80, 48)}`, THIN),
    box: [-10.7, -4.7, 9.7, 4.7],
    ports: [{ id: 'L', x: -10.7, y: 0, dir: 'L' }, { id: 'R', x: 9.7, y: 0, dir: 'R' }]
  });
  def('s.curtain', 'safety', ['Işın Bariyeri', 'Light Curtain', 'Lichtvorhang'], {
    body:
      R(-8.2, -8.4, 3.4, 16.8, WHITE) + R(4.8, -8.4, 3.4, 16.8, WHITE) +
      [22, 34, 46, 58, 70].map((y) => P(`M${s3(20, y)}L${s3(60, y)}`, 'stroke-dasharray="1 0.7"')).join(''),
    box: [-8.2, -8.4, 8.2, 8.4],
    ports: [{ id: 'L', x: -8.2, y: 0, dir: 'L' }, { id: 'R', x: 8.2, y: 0, dir: 'R' }]
  });
  def('s.lock', 'safety', ['Interlock Kilit', 'Interlock Lock', 'Verriegelungsschloss'], {
    body: R(-5, -1, 10, 8, `rx="1" ${WHITE}`) + P('M-3 -1V-3.5A3 3 0 0 1 3 -3.5V-1') + C(0, 3, 1.1, SOLID),
    box: [-5, -6.5, 5, 7],
    ports: [{ id: 'L', x: -5, y: 3, dir: 'L' }, { id: 'R', x: 5, y: 3, dir: 'R' }]
  });
  def('s.rfid', 'safety', ['RFID Kapak Sensörü', 'RFID Lid Sensor', 'RFID-Deckelsensor'], {
    body: R(-6.5, -4, 13, 8, `rx="1" ${WHITE}`),
    texts: [{ x: 0, y: 0, t: 'RFID', s: 2.8, b: true }],
    box: [-6.5, -4, 6.5, 4],
    ports: lr(6.5)
  });
  def('s.estop', 'safety', ['Acil Stop', 'Emergency Stop', 'Not-Halt'], {
    body: C(0, 0, 6, WHITE) + C(0, 0, 3.6, SOLID),
    box: [-6, -6, 6, 6],
    ports: lr(6)
  });

  /* ─── Temel şekiller ──────────────────────────────────── */
  /* Serbest çizim için boyutlanabilir şekiller. İçleri boştur, altındakini örtmez; kenarından seçilir.
     decor: bileşen listesine, bağlantı mantığına ve kod kontrolüne girmez. Yazı alanı ortaya yazılır. */
  const SHAPE = 'stroke-width="0.5"';
  const shapeText = (cy) => (it) => [{ x: 0, y: cy ? cy(it) : 0, t: it.note || '', s: 3, b: true }];
  const shape = (id, names, size, body, extra) => def(id, 'shape', names, Object.assign({
    resizable: true,
    container: true,
    decor: true,
    tag: 'none',
    defaultSize: size,
    body,
    texts: shapeText()
  }, extra));
  shape('g.rect', ['Dikdörtgen', 'Rectangle', 'Rechteck'], [40, 25],
    (it) => R(-it.w / 2, -it.h / 2, it.w, it.h, SHAPE));
  shape('g.square', ['Kare', 'Square', 'Quadrat'], [30, 30],
    (it) => R(-it.w / 2, -it.h / 2, it.w, it.h, SHAPE), { keepAspect: true });
  // Eğik kenarlı şekillerde hat kutu kenarına değil şekle bağlanmalı; bu yüzden kenara yapışmazlar
  shape('g.triangle', ['Üçgen', 'Triangle', 'Dreieck'], [30, 26],
    (it) => P(`M0 ${-it.h / 2}L${it.w / 2} ${it.h / 2}H${-it.w / 2}Z`, SHAPE),
    { noObstacle: true, texts: shapeText((it) => it.h / 6) });
  shape('g.circle', ['Daire', 'Circle', 'Kreis'], [30, 30],
    (it) => C(0, 0, Math.min(it.w, it.h) / 2, SHAPE), { keepAspect: true, noObstacle: true });
  shape('g.ellipse', ['Elips', 'Ellipse', 'Ellipse'], [40, 25],
    (it) => `<ellipse cx="0" cy="0" rx="${it.w / 2}" ry="${it.h / 2}" ${SHAPE}/>`, { noObstacle: true });
  shape('g.diamond', ['Eşkenar Dörtgen', 'Diamond', 'Raute'], [30, 30],
    (it) => P(`M0 ${-it.h / 2}L${it.w / 2} 0L0 ${it.h / 2}L${-it.w / 2} 0Z`, SHAPE), { noObstacle: true });

  /* ─── Hat tipleri ─────────────────────────────────────── */
  const LINE_KINDS = {
    process: { name: { tr: 'Proses Hattı', en: 'Process Line', de: 'Prozessleitung' }, width: 0.7, layer: 'process', arrow: 'mid' },
    utility: { name: { tr: 'Yardımcı Hat (Su / Drenaj)', en: 'Utility Line (Water / Drain)', de: 'Hilfsleitung (Wasser / Ablauf)' }, width: 0.45, layer: 'process', arrow: 'mid' },
    duct: { name: { tr: 'Hava Kanalı (Egzoz / Kurutma)', en: 'Air Duct (Exhaust / Drying)', de: 'Luftkanal (Abluft / Trocknung)' }, width: 0.7, dash: '6 1.5', layer: 'process', arrow: 'mid' },
    air: { name: { tr: 'Basınçlı Hava', en: 'Compressed Air', de: 'Druckluft' }, width: 0.35, ticks: true, layer: 'pneu', arrow: 'none' },
    signal: { name: { tr: 'Elektrik Sinyali', en: 'Electric Signal', de: 'Elektrisches Signal' }, width: 0.25, dash: '2 1', layer: 'inst', arrow: 'none' },
    data: { name: { tr: 'PLC / Yazılım Bağlantısı', en: 'PLC / Software Link', de: 'SPS- / Softwareverbindung' }, width: 0.25, beads: true, layer: 'inst', arrow: 'none' },
    mech: { name: { tr: 'Mekanik Bağlantı', en: 'Mechanical Link', de: 'Mechanische Verbindung' }, width: 0.25, dash: '4 1 1 1', layer: 'inst', arrow: 'none' }
  };

  /* ─── Yardımcılar ─────────────────────────────────────── */
  function normalize(text) {
    return String(text == null ? '' : text)
      .replace(/ı/g, 'i').replace(/I/g, 'i').replace(/İ/g, 'i')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  /* Varsayılan ekipman adları ve bayrak yazıları: belge dili değişince çevrilir.
     Kullanıcının kendi yazdığı ad tabloda yoksa olduğu gibi kalır. */
  const NOTE_I18N = [
    ['PROSES TANKI', 'PROCESS TANK', 'PROZESSTANK'],
    ['KAPALI TANK', 'CLOSED VESSEL', 'GESCHLOSSENER BEHÄLTER'],
    ['KAPAKLI TANK', 'LIDDED TANK', 'TANK MIT DECKEL'],
    ['KONİK TANK', 'CONICAL TANK', 'KONISCHER TANK'],
    ['ULTRASONİK TANK', 'ULTRASONIC TANK', 'ULTRASCHALLTANK'],
    ['TOPLAMA HAZNESİ', 'COLLECTION SUMP', 'SAMMELBEHÄLTER'],
    ['YIKAMA HÜCRESİ', 'WASHING CELL', 'WASCHZELLE'],
    ['KURUTMA HÜCRESİ', 'DRYING CELL', 'TROCKENZELLE'],
    ['VAKUM HÜCRESİ', 'VACUUM CELL', 'VAKUUMZELLE'],
    ['TÜNEL HÜCRE', 'TUNNEL CELL', 'TUNNELZELLE'],
    ['ŞEBEKE SUYU', 'MAINS WATER', 'NETZWASSER'],
    ['DRENAJ', 'DRAIN', 'ABLAUF'],
    ['EGZOZ', 'EXHAUST', 'ABLUFT'],
    ['BASINÇLI HAVA', 'COMPRESSED AIR', 'DRUCKLUFT'],
    ['HÜCREYE', 'TO CELL', 'ZUR ZELLE'],
    ['P&ID Şeması', 'P&ID Diagram', 'P&ID-Schema'],
    ...WATER_TANKS.map((row) => row[3])
  ];
  const LANG_INDEX = { tr: 0, en: 1, de: 2 };
  const PAGE_WORD = ['SAYFA', 'SHEET', 'BLATT'];

  /** "1. PROSES TANKI" → "1. PROCESS TANK"; tanınmayan yazı aynen döner */
  function localNote(text, lang) {
    const index = LANG_INDEX[lang];
    if (!text || index === undefined) return text;
    const m = String(text).match(/^(\s*\d+\.\s*)?([\s\S]*?)(\s+\d+)?\s*$/);
    const prefix = m[1] || '';
    const suffix = m[3] || '';
    const key = normalize(m[2]);
    for (const row of NOTE_I18N) {
      if (row.some((v) => normalize(v) === key)) return prefix + row[index] + suffix;
    }
    if (suffix) m[2] = `${m[2]}${suffix}`;
    const page = m[2].match(/^(sayfa|sheet|blatt)\s+(\d+)$/i);
    if (page) return `${prefix}${PAGE_WORD[index]} ${page[2]}`;
    return text;
  }

  /* Kod serisi → o serinin çizileceği semboller. Paletteki rozet ve kod aramasının kaynağıdır.
     suggest() bir seriyi burada olmayan sembole düşüremez; bunu test de denetler. */
  const SERIES = {
    PE: ['p.centrifugal', 'p.dosing', 'p.vacuum', 'p.dosatron'],
    FE: ['f.fan', 'f.blower'],
    GE: ['d.gearmotor', 'e.skimmer'],
    VE: ['d.vibration'],
    INV: ['d.vfd'],
    ENC: ['d.encoder'],
    R: ['h.resistance'],
    BR: ['h.burner'],
    TD: ['h.ultrasonic', 'h.transducer'],
    LS: ['i.level', 'i.lsl', 'i.lsm', 'i.lsh'],
    TC: ['i.temp'],
    PS: ['i.pt', 'i.waterPressure', 'i.airPressure', 'i.vacuum', 'i.ps'],
    PHS: ['i.ph'],
    CS: ['i.cond'],
    PRS: ['i.prox'],
    PPS: ['i.pistonSensor', 'i.zso', 'i.zsm', 'i.zsc', 'i.zsIsa', 'i.zsoIsa', 'i.zsmIsa', 'i.zscIsa'],
    SW: ['i.switch', 'i.lid', 'i.flow'],
    SWB: ['i.switchBox', 'v.solenoidFill', 'v.solenoid'],
    V: ['v.pneumatic', 'n.valve52', 'n.valve32', 'v.solenoid', 'v.pistonValve'],
    SS: ['s.hand', 's.lock', 's.curtain', 's.rfid'],
    B: ['i.button', 's.estop'],
    L: ['i.lamp'],
    T: ['e.thermal'],
    F: ['e.fuse'],
    FC: ['e.rcd']
  };

  const SERIES_OF_SYMBOL = {};
  for (const [series, ids] of Object.entries(SERIES)) {
    for (const id of ids) (SERIES_OF_SYMBOL[id] = SERIES_OF_SYMBOL[id] || []).push(series);
  }

  /** Kullanıcının sonradan eklediği, tanınmayan seriler için addan sembol bulur; hiçbir kod sembolsüz kalmaz */
  function suggestByName(n) {
    const inst = (symbol, func) => ({ symbol, func });
    if (n.includes('piston')) return n.includes('sensor') ? inst('i.pistonSensor', 'ZS') : { symbol: 'n.cylinder' };
    if (n.includes('seviye')) return inst('i.level', 'LS');
    if (n.includes('sicaklik') || n.includes('isi olcer')) return inst('i.temp', 'TE');
    if (n.includes('basinc')) return n.includes('salter') ? inst('i.ps', 'PS') : inst('i.pt', 'PT');
    if (n.includes('prox')) return inst('i.prox', 'ZS');
    if (n.includes('switch')) return inst('i.switch', 'ZS');
    if (n.includes('dozatron') || n.includes('dosatron')) return { symbol: 'p.dosatron' };
    if (n.includes('dozaj')) return { symbol: 'p.dosing' };
    if (n.includes('pompa')) return { symbol: 'p.centrifugal' };
    if (n.includes('hava bicag') || n.includes('air knife')) return { symbol: 'e.airKnife' };
    if (n.includes('blower')) return { symbol: 'f.blower' };
    if (/\bfan/.test(n)) return { symbol: 'f.fan' };
    if (n.includes('reduktor')) return { symbol: 'd.gearmotor' };
    if (n.includes('invertor')) return { symbol: 'd.vfd' };
    if (n.includes('encoder') || n.includes('enkoder')) return { symbol: 'd.encoder' };
    if (n.includes('motor')) return { symbol: 'd.motor' };
    if (n.includes('rezistans')) return { symbol: 'h.resistance' };
    if (n.includes('solenoid')) return { symbol: 'v.solenoid' };
    if (n.includes('aktuator')) return { symbol: 'v.pneumatic' };
    if (n.includes('vana') || n.includes('valf')) return { symbol: 'v.gate' };
    if (n.includes('filtre')) return { symbol: 'e.filter' };
    if (n.includes('lamba')) return inst('i.lamp', 'XL');
    if (n.includes('buton') || n.includes('dugme')) return inst('i.button', 'HS');
    if (n.includes('sigorta')) return { symbol: 'e.fuse' };
    if (n.includes('termik')) return { symbol: 'e.thermal' };
    return inst('i.field', '');
  }

  /** Kod ve açıklamadan önerilen sembol + ISA harfi */
  function suggest(kod, ad) {
    const k = String(kod || '').toUpperCase();
    const seri = (k.match(/^[A-Z]+/) || [''])[0];
    const num = parseInt(k.replace(/\D/g, ''), 10) || 0;
    const n = normalize(ad);
    const inst = (func, symbol) => ({ symbol: symbol || 'i.field', func });
    const limit = () => (n.includes('acik') ? 'ZSO' : n.includes('kapali') ? 'ZSC' : 'ZS');

    switch (seri) {
      case 'PE':
        if (n.includes('dozatron') || n.includes('dosatron')) return { symbol: 'p.dosatron' };
        if (n.includes('dozaj')) return { symbol: 'p.dosing' };
        if (n.includes('vakum')) return { symbol: 'p.vacuum' };
        return { symbol: 'p.centrifugal' };
      case 'FE':
        if (n.includes('hava bicag') || n.includes('air knife')) return { symbol: 'e.airKnife' };
        return { symbol: n.includes('blower') ? 'f.blower' : 'f.fan' };
      case 'GE': return { symbol: n.includes('siyirici') ? 'e.skimmer' : 'd.gearmotor' };
      case 'VE': return { symbol: 'd.vibration' };
      case 'INV': return { symbol: 'd.vfd' };
      case 'ENC': return { symbol: 'd.encoder' };
      case 'R': return { symbol: 'h.resistance' };
      case 'BR': return { symbol: 'h.burner' };
      case 'TD': return { symbol: 'h.ultrasonic' };
      case 'LS':
        if (n.includes('alt')) return inst('LSL', 'i.lsl');
        if (n.includes('ust')) return inst('LSH', 'i.lsh');
        if (n.includes('orta')) return inst('LSM', 'i.lsm');
        return inst('LS', 'i.level');
      case 'TC': return inst('TE', 'i.temp');
      case 'PS':
        if (n.includes('salter') || n.includes('bilgisi')) return inst('PS', 'i.ps');
        if (n.includes('hava')) return inst('PT', 'i.airPressure');
        if (n.includes('vakum')) return inst('PT', 'i.vacuum');
        if (/\bsu\b/.test(n)) return inst('PT', 'i.waterPressure');
        return inst('PT', 'i.pt');
      case 'PHS': return { symbol: 'i.ph', func: 'AT' };
      case 'CS': return { symbol: 'i.cond', func: 'AT' };
      case 'PRS': return inst('ZS', 'i.prox');
      case 'PPS': {
        if (/\bara\b/.test(n)) return inst('ZSM', 'i.zsm');
        const func = limit();
        return inst(func, { ZSO: 'i.zso', ZSC: 'i.zsc' }[func] || 'i.pistonSensor');
      }
      case 'SW':
        if (n.includes('flow')) return inst('FS', 'i.flow');
        return inst(limit(), /kapa[kg]/.test(n) ? 'i.lid' : 'i.switch');
      case 'SWB':
        if (n.includes('solenoid') && n.includes('dolum')) return { symbol: 'v.solenoidFill' };
        if (n.includes('solenoid')) return { symbol: 'v.solenoid' };
        return inst('ZS', 'i.switchBox');
      case 'V':
        if (n.includes('solenoid') || n.includes('ana valf')) return { symbol: 'v.solenoid' };
        if (n.includes('aktuator')) return { symbol: 'v.pneumatic' };
        return { symbol: 'n.valve52' };
      case 'SS':
        if (num === 1) return { symbol: 's.hand' };
        if (num === 3) return { symbol: 's.curtain' };
        if (num === 2 || num === 4) return { symbol: 's.lock' };
        return { symbol: 's.rfid' };
      case 'B':
        if (num === 5) return { symbol: 's.estop' };
        return inst('HS', 'i.button');
      case 'L': return inst('XL', 'i.lamp');
      case 'T': return { symbol: 'e.thermal' };
      case 'F': return { symbol: 'e.fuse' };
      case 'FC': return { symbol: 'e.rcd' };
      default: return suggestByName(n);
    }
  }

  function boxOf(def_, item) {
    if (def_.resizable) {
      const w = (item && item.w) || def_.defaultSize[0];
      const h = (item && item.h) || def_.defaultSize[1];
      return [-w / 2, -h / 2, w / 2, h / 2];
    }
    return def_.box;
  }

  function resolveBody(d, item) {
    if (typeof d.body !== 'function') return d.body;
    const w = (item && item.w) || (d.defaultSize && d.defaultSize[0]) || 10;
    const h = (item && item.h) || (d.defaultSize && d.defaultSize[1]) || 10;
    return d.body(Object.assign({}, item, { w, h }));
  }

  function resolveTexts(d, item, lang) {
    if (typeof d.texts !== 'function') return d.texts || [];
    const w = (item && item.w) || (d.defaultSize && d.defaultSize[0]) || 10;
    const h = (item && item.h) || (d.defaultSize && d.defaultSize[1]) || 10;
    return d.texts(Object.assign({}, item, { w, h }), lang || 'tr');
  }

  /** Palet ve lejant için bağımsız küçük önizleme */
  function thumbnail(id, size) {
    const d = BY_ID[id];
    if (!d) return '';
    const sample = {
      w: d.defaultSize ? 24 : undefined,
      h: d.defaultSize ? (d.keepAspect ? 24 : 16) : undefined,
      func: d.isInstrument ? (d.defaultFunc || 'LS') : '',
      tag: '',
      note: ''
    };
    const b = boxOf(d, sample);
    const pad = 1;
    const vb = `${b[0] - pad} ${b[1] - pad} ${b[2] - b[0] + pad * 2} ${b[3] - b[1] + pad * 2}`;
    const texts = resolveTexts(d, sample, 'tr').filter((t) => t.t).map((t) =>
      `<text x="${t.x}" y="${t.y + t.s * 0.35}" font-size="${t.s}" text-anchor="middle" fill="currentColor" stroke="none" font-family="Calibri, Arial, sans-serif"${t.b ? ' font-weight="700"' : ''}>${t.t}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="0.45" stroke-linecap="round" stroke-linejoin="round">${resolveBody(d, sample)}${texts}</svg>`;
  }

  return {
    CATEGORIES,
    LINE_KINDS,
    list: () => LIST.filter((d) => !d.hidden),
    all: () => LIST.slice(),
    get: (id) => BY_ID[id] || null,
    SERIES,
    seriesOf: (id) => SERIES_OF_SYMBOL[id] || [],
    suggest,
    normalize,
    localNote,
    boxOf,
    resolveBody,
    resolveTexts,
    thumbnail
  };
});
