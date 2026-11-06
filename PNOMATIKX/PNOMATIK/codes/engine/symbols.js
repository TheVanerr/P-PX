/* Pnömatik sembol kütüphanesi — ISO 1219-1 (semboller), ISO 1219-2 (devre şeması), ISO 5599-3 (port numaraları).
   Tüm ölçüler mm, orijin sembol merkezi. Renk currentColor: siyah = standart, kırmızı = opsiyon.
   Yön valfleri bobin (Y), aktüatörler sensör (B) alt bileşenleri taşır; her birinin kendi kodu ve P&ID kodu vardır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PidSymbols = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const WHITE = 'fill="#fff"';
  const SOLID = 'fill="currentColor" stroke="none"';
  const THIN = 'stroke-width="0.25"';
  const DASH = 'stroke-dasharray="1 0.8" stroke-width="0.25"';
  const PILOT = 'stroke-dasharray="1.6 0.9" stroke-width="0.25"';
  const CHAIN = 'stroke-dasharray="5 1.2 1 1.2" stroke-width="0.25"';

  const r2 = (v) => Math.round(v * 100) / 100;
  const P = (d, extra) => `<path d="${d}"${extra ? ' ' + extra : ''}/>`;
  const C = (x, y, r, extra) => `<circle cx="${x}" cy="${y}" r="${r}"${extra ? ' ' + extra : ''}/>`;
  const R = (x, y, w, h, extra) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"${extra ? ' ' + extra : ''}/>`;

  /** Valf kutusu içindeki akış oku: çizgi + dolu ok ucu */
  function arrow(x1, y1, x2, y2) {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const s = 1.6;
    const w = 0.62;
    const bx = x2 - ux * s;
    const by = y2 - uy * s;
    return P(`M${r2(x1)} ${r2(y1)}L${r2(bx)} ${r2(by)}`) +
      P(`M${r2(x2)} ${r2(y2)}L${r2(bx - uy * w)} ${r2(by + ux * w)}L${r2(bx + uy * w)} ${r2(by - ux * w)}Z`, SOLID);
  }

  /** Kapalı port: kenardan içeri kısa çizgi ve dik kapak (T) */
  function tee(x, y, inward) {
    const y1 = y + inward * 1.8;
    return P(`M${x} ${y}V${y1}M${x - 1} ${y1}H${x + 1}`);
  }

  const square = (x0) => R(x0, -5, 10, 10, WHITE);

  /** Elektromanyetik tahrik (bobin): dikdörtgen + eğik çizgi */
  const solenoid = (x0) => R(x0, -3, 4, 6, WHITE) + P(`M${x0} 3L${x0 + 4} -3`, THIN);
  /** Yay: yatay zikzak */
  const spring = (x0, dir, y) => {
    const yy = y || 0;
    const a = 1.9;
    const pts = [0, 0.7, 1.6, 2.5, 3.4, 4.1].map((dx, i) => {
      const yv = i === 0 || i === 5 ? yy : yy + (i % 2 ? -a : a);
      return `${r2(x0 + dir * dx)} ${r2(yv)}`;
    });
    return P(`M${pts.join('L')}`, THIN);
  };
  /** Bobin + yay (5/3 valflerde iki yanda) */
  const solenoidSpring = (x0, dir) => {
    const box = dir < 0 ? x0 - 4 : x0;
    return R(box, -4.6, 4, 4.2, WHITE) + P(`M${box} -0.4L${box + 4} -4.6`, THIN) + spring(x0, dir, 2.4);
  };
  /** Elle kumanda kolu ve mandal */
  const lever = (x0) => P(`M${x0} 0H${x0 - 3.2}L${x0 - 4.6} -3`) + P(`M${x0 - 2.2} 1.8l0.7 -1 0.7 1`, THIN);

  const LEFT_COIL = { side: 'L', x: -12, y: -3 };
  const RIGHT_COIL = { side: 'R', x: 12, y: -3 };

  /* ─── Kategoriler ─────────────────────────────────────── */

  const CATEGORIES = [
    { id: 'act', name: 'Aktüatörler' },
    { id: 'dir', name: 'Yön Kontrol Valfleri' },
    { id: 'flow', name: 'Akış ve Basınç Kontrol' },
    { id: 'supply', name: 'Hava Hazırlama ve Besleme' },
    { id: 'sensor', name: 'Sensör ve Göstergeler' },
    { id: 'line', name: 'Hat Elemanları' },
    { id: 'misc', name: 'Çerçeve' }
  ];

  const LIST = [];
  const BY_ID = {};

  function def(id, cat, names, opts) {
    const d = Object.assign({
      id,
      cat,
      name: { tr: names[0], en: names[1], de: names[2] },
      layer: cat === 'sensor' ? 'elec' : 'pneu',
      ports: [],
      texts: [],
      tag: 'below',
      inline: false,
      resizable: false,
      hidden: false,
      coils: 0,
      sensors: false
    }, opts);
    LIST.push(d);
    BY_ID[id] = d;
  }

  const portNo = (ports) => ports
    .filter((p) => /^\d+$/.test(p.id))
    .map((p) => {
      const down = p.dir === 'D';
      return { x: r2(p.x + 1.15), y: r2(p.y + (down ? 1.9 : -1.5)), t: p.id, s: 1.6, port: true };
    });

  /* ─── Yön kontrol valfleri (ISO 1219-1, port no ISO 5599-3) ─ */

  const PORTS_52 = [
    { id: '4', x: 2.5, y: -5, dir: 'U' },
    { id: '2', x: 7.5, y: -5, dir: 'U' },
    { id: '5', x: 2.5, y: 5, dir: 'D' },
    { id: '1', x: 5, y: 5, dir: 'D' },
    { id: '3', x: 7.5, y: 5, dir: 'D' }
  ];
  // 14 tarafı (sol kare): 1→4, 2→3, 5 kapalı
  const POS14_52 = (x0) => arrow(x0 + 5, 5, x0 + 2.5, -5) + arrow(x0 + 7.5, -5, x0 + 7.5, 5) + tee(x0 + 2.5, 5, -1);
  // 12 tarafı / normal (sağ kare): 1→2, 4→5, 3 kapalı
  const POS12_52 = (x0) => arrow(x0 + 5, 5, x0 + 7.5, -5) + arrow(x0 + 2.5, -5, x0 + 2.5, 5) + tee(x0 + 7.5, 5, -1);

  const VALVE = { tag: 'left', role: 'directional', portLabels: true };

  def('v.52mono', 'dir', ['5/2 Tek Bobinli Valf (Yay Dönüşlü)', '5/2 Single Solenoid Valve (Spring Return)', '5/2-Wegeventil, Magnet / Feder'], Object.assign({
    body: square(-10) + square(0) + POS14_52(-10) + POS12_52(0) + solenoid(-14) + spring(10, 1),
    box: [-14, -5, 14.1, 5],
    ports: PORTS_52,
    texts: portNo(PORTS_52),
    coils: 1,
    coilAt: [LEFT_COIL],
    valve: { positions: 2, rest: 'spring', a: { 4: 'P', 2: 'E' }, n: { 2: 'P', 4: 'E' } }
  }, VALVE));

  def('v.52bi', 'dir', ['5/2 Çift Bobinli Valf (Bistabil)', '5/2 Double Solenoid Valve (Bistable)', '5/2-Impulsventil, beidseitig Magnet'], Object.assign({
    body: square(-10) + square(0) + POS14_52(-10) + POS12_52(0) + solenoid(-14) + solenoid(10),
    box: [-14, -5, 14, 5],
    ports: PORTS_52,
    texts: portNo(PORTS_52),
    coils: 2,
    coilAt: [LEFT_COIL, RIGHT_COIL],
    valve: { positions: 2, rest: 'hold', a: { 4: 'P', 2: 'E' }, b: { 2: 'P', 4: 'E' } }
  }, VALVE));

  const PORTS_53 = [
    { id: '4', x: -2.5, y: -5, dir: 'U' },
    { id: '2', x: 2.5, y: -5, dir: 'U' },
    { id: '5', x: -2.5, y: 5, dir: 'D' },
    { id: '1', x: 0, y: 5, dir: 'D' },
    { id: '3', x: 2.5, y: 5, dir: 'D' }
  ];
  const SIDES_53 = solenoidSpring(-15, -1) + solenoidSpring(15, 1);
  const COILS_53 = [{ side: 'L', x: -17, y: -4.6 }, { side: 'R', x: 17, y: -4.6 }];

  def('v.53closed', 'dir', ['5/3 Valf, Orta Konum Kapalı', '5/3 Valve, Closed Centre', '5/3-Wegeventil, Mittelstellung gesperrt'], Object.assign({
    body: square(-15) + square(-5) + square(5) + POS14_52(-15) + POS12_52(5) +
      tee(-2.5, -5, 1) + tee(2.5, -5, 1) + tee(-2.5, 5, -1) + tee(0, 5, -1) + tee(2.5, 5, -1) + SIDES_53,
    box: [-19.1, -5, 19.1, 5],
    ports: PORTS_53,
    texts: portNo(PORTS_53),
    coils: 2,
    coilAt: COILS_53,
    valve: { positions: 3, rest: 'center', a: { 4: 'P', 2: 'E' }, b: { 2: 'P', 4: 'E' }, n: { 4: 'X', 2: 'X' } }
  }, VALVE));

  def('v.53exhaust', 'dir', ['5/3 Valf, Orta Konum Tahliyeli', '5/3 Valve, Exhausted Centre', '5/3-Wegeventil, Mittelstellung entlüftet'], Object.assign({
    body: square(-15) + square(-5) + square(5) + POS14_52(-15) + POS12_52(5) +
      arrow(-2.5, -5, -2.5, 5) + arrow(2.5, -5, 2.5, 5) + tee(0, 5, -1) + SIDES_53,
    box: [-19.1, -5, 19.1, 5],
    ports: PORTS_53,
    texts: portNo(PORTS_53),
    coils: 2,
    coilAt: COILS_53,
    valve: { positions: 3, rest: 'center', a: { 4: 'P', 2: 'E' }, b: { 2: 'P', 4: 'E' }, n: { 4: 'E', 2: 'E' } }
  }, VALVE));

  const PORTS_32 = [
    { id: '2', x: 2.5, y: -5, dir: 'U' },
    { id: '1', x: 2.5, y: 5, dir: 'D' },
    { id: '3', x: 7.5, y: 5, dir: 'D' }
  ];

  def('v.32nc', 'dir', ['3/2 Tek Bobinli Valf (Normalde Kapalı)', '3/2 Single Solenoid Valve (Normally Closed)', '3/2-Wegeventil, Magnet, normal geschlossen'], Object.assign({
    body: square(-10) + square(0) + arrow(-7.5, 5, -7.5, -5) + tee(-2.5, 5, -1) +
      arrow(2.5, -5, 7.5, 5) + tee(2.5, 5, -1) + solenoid(-14) + spring(10, 1),
    box: [-14, -5, 14.1, 5],
    ports: PORTS_32,
    texts: portNo(PORTS_32),
    coils: 1,
    coilAt: [LEFT_COIL],
    valve: { positions: 2, rest: 'spring', a: { 2: 'P' }, n: { 2: 'E' } }
  }, VALVE));

  def('v.softStart', 'dir', ['Yumuşak Başlatma Valfi (3/2, Ayarlı Kısmalı)', 'Soft Start-up Valve (3/2, Adjustable)', 'Sanftanlaufventil (3/2, einstellbar)'], Object.assign({
    body: square(-10) + square(0) + arrow(-7.5, 5, -7.5, -5) +
      P('M-9.2 -2Q-7.9 0 -9.2 2M-5.8 -2Q-7.1 0 -5.8 2') + P('M-9.8 3L-5.4 -2.6', THIN) + P('M-4.9 -3.3L-6.1 -2.9L-5.2 -2Z', SOLID) +
      tee(-2.5, 5, -1) + arrow(2.5, -5, 7.5, 5) + tee(2.5, 5, -1) + solenoid(-14) + spring(10, 1),
    box: [-14, -5, 14.1, 5],
    ports: PORTS_32,
    texts: portNo(PORTS_32),
    coils: 1,
    coilAt: [LEFT_COIL],
    valve: { positions: 2, rest: 'spring', a: { 2: 'P' }, n: { 2: 'E' } }
  }, VALVE));

  def('v.32no', 'dir', ['3/2 Tek Bobinli Valf (Normalde Açık)', '3/2 Single Solenoid Valve (Normally Open)', '3/2-Wegeventil, Magnet, normal offen'], Object.assign({
    body: square(-10) + square(0) + arrow(-7.5, -5, -2.5, 5) + tee(-7.5, 5, -1) +
      arrow(2.5, 5, 2.5, -5) + tee(7.5, 5, -1) + solenoid(-14) + spring(10, 1),
    box: [-14, -5, 14.1, 5],
    ports: PORTS_32,
    texts: portNo(PORTS_32),
    coils: 1,
    coilAt: [LEFT_COIL],
    valve: { positions: 2, rest: 'spring', a: { 2: 'E' }, n: { 2: 'P' } }
  }, VALVE));

  const PORTS_22 = [
    { id: '2', x: 5, y: -5, dir: 'U' },
    { id: '1', x: 5, y: 5, dir: 'D' }
  ];
  def('v.22nc', 'dir', ['2/2 Tek Bobinli Valf (Normalde Kapalı)', '2/2 Single Solenoid Valve (Normally Closed)', '2/2-Wegeventil, Magnet, normal geschlossen'], Object.assign({
    body: square(-10) + square(0) + arrow(-5, 5, -5, -5) + tee(5, 5, -1) + tee(5, -5, 1) + solenoid(-14) + spring(10, 1),
    box: [-14, -5, 14.1, 5],
    ports: PORTS_22,
    texts: portNo(PORTS_22),
    coils: 1,
    coilAt: [LEFT_COIL],
    valve: { positions: 2, rest: 'spring', a: { 2: 'P' }, n: { 2: 'X' } }
  }, VALVE));

  def('v.32manual', 'dir', ['3/2 Elle Kumandalı Kesme Valfi (Kilitlenebilir)', '3/2 Manual Shut-off Valve (Lockable)', '3/2-Handabsperrventil (abschließbar)'], Object.assign({
    body: square(-10) + square(0) + arrow(-7.5, 5, -7.5, -5) + tee(-2.5, 5, -1) +
      arrow(2.5, -5, 7.5, 5) + tee(2.5, 5, -1) + lever(-10) + spring(10, 1),
    box: [-14.6, -5, 14.1, 5],
    ports: PORTS_32,
    texts: portNo(PORTS_32),
    coils: 0,
    valve: { positions: 2, rest: 'manual', a: { 2: 'P' }, n: { 2: 'E' } }
  }, VALVE));

  /* ─── Aktüatörler ─────────────────────────────────────── */

  // Silindir sensörleri gövdenin üstünde, kursun iki ucunda gösterilir (pos 0 = geri, 1 = ileri).
  // Sensörlü silindirde pistondaki mıknatıs da çizilir (manyetik piston).
  const CYL_SPAN = { layout: 'top', x0: -11, x1: 8, y: -4.5, magnet: { x: -8, y0: -4.5, y1: 4.5 } };

  def('a.cylDouble', 'act', ['Çift Etkili Silindir', 'Double-Acting Cylinder', 'Doppeltwirkender Zylinder'], {
    body: R(-15, -4.5, 26, 9, WHITE) + P('M-8 -4.5V4.5', 'stroke-width="0.8"') + P('M-8 0H19', 'stroke-width="0.7"'),
    box: [-15, -4.5, 19, 4.5],
    ports: [{ id: 'A', x: -12, y: 4.5, dir: 'D' }, { id: 'B', x: 8, y: 4.5, dir: 'D' }],
    tag: 'left',
    role: 'actuator',
    sensors: CYL_SPAN,
    act: { kind: 'linear', A: 'extend', B: 'retract' }
  });

  def('a.cylLock', 'act', ['Kilitli Silindir (Mil Kilitli, Çift Etkili)', 'Cylinder with Lock (Double-Acting)', 'Zylinder mit Verriegelung (doppeltwirkend)'], {
    body: R(-15, -4.5, 26, 9, WHITE) + P('M-8 -4.5V4.5', 'stroke-width="0.8"') +
      R(12.5, -4, 6, 8, WHITE) + P('M13.4 -1.2H17.6M13.4 1.2H17.6', 'stroke-width="0.6"') +
      P('M14.4 -4L15 -3.3L13.8 -2.6L15 -1.9', THIN) + P('M17.5 -4V-1.6', PILOT) +
      P('M-8 0H23', 'stroke-width="0.7"'),
    box: [-15, -4.5, 23, 4.5],
    ports: [{ id: 'A', x: -12, y: 4.5, dir: 'D' }, { id: 'B', x: 8, y: 4.5, dir: 'D' }, { id: 'X', x: 17.5, y: -4, dir: 'U' }],
    texts: [{ x: 19.4, y: -5.2, t: 'X', s: 1.6, port: true }],
    tag: 'left',
    role: 'actuator',
    sensors: CYL_SPAN,
    // X portuna basınç gelince kilit açılır; basınç kesilince yay mili kilitler
    act: { kind: 'linear', A: 'extend', B: 'retract', X: 'unlock' }
  });

  def('a.cylSingle', 'act', ['Tek Etkili Silindir (Yay Geri Dönüşlü)', 'Single-Acting Cylinder (Spring Return)', 'Einfachwirkender Zylinder (Federrückstellung)'], {
    body: R(-15, -4.5, 26, 9, WHITE) + P('M-8 -4.5V4.5', 'stroke-width="0.8"') + P('M-8 0H19', 'stroke-width="0.7"') +
      P('M-7 3.4L-5 -3.4L-3 3.4L-1 -3.4L1 3.4L3 -3.4L5 3.4L7 -3.4L9 3.4', THIN) + P('M10.2 -4.5V-3.2', THIN),
    box: [-15, -4.5, 19, 4.5],
    ports: [{ id: 'A', x: -12, y: 4.5, dir: 'D' }],
    tag: 'left',
    role: 'actuator',
    sensors: CYL_SPAN,
    act: { kind: 'linear', A: 'extend', spring: 'retract' }
  });

  // Döner aktüatör: sınırlı açılı, çift etkili
  /** Dolu ok ucu: ucu (x,y), yönü (ux,uy) */
  const head = (x, y, ux, uy) => {
    const bx = x - ux * 1.4;
    const by = y - uy * 1.4;
    return P(`M${r2(x)} ${r2(y)}L${r2(bx - uy * 0.6)} ${r2(by + ux * 0.6)}L${r2(bx + uy * 0.6)} ${r2(by - ux * 0.6)}Z`, SOLID);
  };
  const ARC = P('M-3.4 1.6A3.8 3.8 0 0 1 3.4 1.6');
  const ROT_ARC = ARC + head(3.4, 1.6, 0.447, 0.894) + head(-3.4, 1.6, -0.447, 0.894);
  def('a.rotary', 'act', ['Döner Aktüatör (Çift Etkili)', 'Semi-Rotary Actuator (Double-Acting)', 'Schwenkantrieb (doppeltwirkend)'], {
    body: C(0, 0, 5, WHITE) + ROT_ARC + P('M0 -5V-8', 'stroke-width="0.7"'),
    box: [-5, -8, 5, 5],
    ports: [{ id: 'A', x: -2.5, y: 4.33, dir: 'D' }, { id: 'B', x: 2.5, y: 4.33, dir: 'D' }],
    tag: 'left',
    role: 'actuator',
    sensors: { layout: 'side', x: 6.5, y: -3 },
    act: { kind: 'rotary', A: 'turnA', B: 'turnB' }
  });

  // Aktüatörlü proses vanası: çeyrek dönüş aktüatörü + mil + küresel vana
  const PROC_VALVE = P('M-9 -11.5H-6M6 -11.5H9') + P('M-6 -15L6 -8V-15L-6 -8Z', WHITE) + C(0, -11.5, 1.5, WHITE) + P('M0 -3.5V-8', 'stroke-width="0.7"');
  const ACT_BOX = R(-7, -3.5, 14, 7, WHITE);
  def('a.valveActuator', 'act', ['Aktüatörlü Proses Vanası (Çift Etkili)', 'Actuated Process Valve (Double-Acting)', 'Prozessarmatur mit Antrieb (doppeltwirkend)'], {
    body: ACT_BOX + ROT_ARC + PROC_VALVE,
    box: [-9, -15, 9, 3.5],
    ports: [{ id: 'A', x: -2.5, y: 3.5, dir: 'D' }, { id: 'B', x: 2.5, y: 3.5, dir: 'D' }],
    tag: 'left',
    role: 'actuator',
    sensors: { layout: 'side', x: 8.5, y: -3 },
    act: { kind: 'valve', A: 'open', B: 'close' }
  });

  def('a.valveActuatorSpring', 'act', ['Aktüatörlü Proses Vanası (Yay Dönüşlü)', 'Actuated Process Valve (Spring Return)', 'Prozessarmatur mit Antrieb (Federrückstellung)'], {
    body: ACT_BOX + ARC + head(3.4, 1.6, 0.447, 0.894) +
      P('M-6 2.6L-5.2 -2.6L-4.4 2.6L-3.6 -2.6', THIN) + PROC_VALVE,
    box: [-9, -15, 9, 3.5],
    ports: [{ id: 'A', x: 0, y: 3.5, dir: 'D' }],
    tag: 'left',
    role: 'actuator',
    sensors: { layout: 'side', x: 8.5, y: -3 },
    act: { kind: 'valve', A: 'open', spring: 'close' }
  });

  def('a.gripper', 'act', ['Pnömatik Tutucu (Çift Etkili)', 'Pneumatic Gripper (Double-Acting)', 'Pneumatischer Greifer (doppeltwirkend)'], {
    body: R(-6, -3.5, 12, 7, WHITE) + P('M-4 -3.5V-8H-1.4M4 -3.5V-8H1.4') + P('M-2.6 -5.6H-0.6M2.6 -5.6H0.6', THIN) +
      P('M-1 -5.6L-1.9 -6.2V-5Z', SOLID) + P('M1 -5.6L1.9 -6.2V-5Z', SOLID),
    box: [-6, -8, 6, 3.5],
    ports: [{ id: 'A', x: -2.5, y: 3.5, dir: 'D' }, { id: 'B', x: 2.5, y: 3.5, dir: 'D' }],
    tag: 'left',
    role: 'actuator',
    sensors: { layout: 'side', x: 7.5, y: -3 },
    act: { kind: 'gripper', A: 'grip', B: 'release' }
  });

  def('a.seal', 'act', ['Şişirilebilir Conta', 'Inflatable Seal', 'Aufblasbare Dichtung'], {
    body: R(-9, -3, 18, 6, `rx="3" ${WHITE}`) + R(-6.5, -1, 13, 2, `rx="1" ${THIN}`),
    box: [-9, -3, 9, 3],
    ports: [{ id: 'A', x: 0, y: 3, dir: 'D' }],
    tag: 'left',
    role: 'actuator',
    sensors: { layout: 'side', x: 10.5, y: -3 },
    act: { kind: 'seal', A: 'inflate', spring: 'deflate' }
  });

  def('a.vacuumCup', 'act', ['Vakum Vantuzu', 'Vacuum Suction Cup', 'Vakuumsauger'], {
    body: P('M-5 -3.5L-3 0.5H3L5 -3.5', WHITE) + P('M0 0.5V3'),
    box: [-5, -3.5, 5, 3],
    ports: [{ id: 'A', x: 0, y: 3, dir: 'D' }],
    tag: 'left',
    role: 'actuator',
    act: { kind: 'vacuum', A: 'hold' }
  });

  /* ─── Akış ve basınç kontrol ──────────────────────────── */

  const THROTTLE = P('M-2.6 -1.4Q0 0.1 2.6 -1.4M-2.6 1.4Q0 -0.1 2.6 1.4');
  const ADJUST = P('M-2.4 2.9L2 -2.5', THIN) + P('M2.6 -3.2L1.4 -2.7L2.4 -1.9Z', SOLID);
  const CHECK_AT = (x, y) => P(`M${x} ${y - 1.25}L${x - 1.4} ${y}L${x} ${y + 1.25}`) + C(x + 1.05, y, 0.95, WHITE);

  def('f.flowCheck', 'flow', ['Tek Yönlü Akış Kontrol Valfi (Çek Valfli Kısma)', 'One-Way Flow Control Valve', 'Drosselrückschlagventil'], {
    body: P('M-6 0H-2.6M2.6 0H6') + THROTTLE + ADJUST + P('M-4.4 0V-5.6H-1.6M1.1 -5.6H4.4V0') + CHECK_AT(-0.2, -5.6) +
      C(-4.4, 0, 0.45, SOLID) + C(4.4, 0, 0.45, SOLID),
    box: [-6, -6.8, 6, 3.2],
    ports: [{ id: 'A', x: -6, y: 0, dir: 'L' }, { id: 'B', x: 6, y: 0, dir: 'R' }],
    inline: true,
    role: 'flow',
    flow: { kind: 'flowCheck', free: 'AB' }
  });

  def('f.throttle', 'flow', ['Ayarlı Kısma Valfi', 'Adjustable Throttle Valve', 'Drosselventil, einstellbar'], {
    body: P('M-5 0H-2.6M2.6 0H5') + THROTTLE + ADJUST,
    box: [-5, -3.2, 5, 3.2],
    ports: [{ id: 'A', x: -5, y: 0, dir: 'L' }, { id: 'B', x: 5, y: 0, dir: 'R' }],
    inline: true,
    role: 'flow',
    flow: { kind: 'throttle' }
  });

  def('f.check', 'flow', ['Çek Valf', 'Check Valve', 'Rückschlagventil'], {
    body: P('M-4.5 0H-1.6M2 0H4.5') + CHECK_AT(-0.2, 0),
    box: [-4.5, -1.6, 4.5, 1.6],
    ports: [{ id: 'A', x: -4.5, y: 0, dir: 'L' }, { id: 'B', x: 4.5, y: 0, dir: 'R' }],
    inline: true,
    role: 'flow',
    flow: { kind: 'check', free: 'AB' }
  });

  def('f.pilotCheck', 'flow', ['Pilot Kumandalı Çek Valf (Yük Tutma)', 'Pilot-Operated Check Valve', 'Entsperrbares Rückschlagventil'], {
    body: R(-4, -2.6, 8, 5.2, WHITE) + P('M-5.5 0H-1.8M1.8 0H5.5') + CHECK_AT(-0.4, 0) + P('M0.65 2.6V0.95', PILOT) + P('M0.65 2.6V4.5'),
    box: [-5.5, -2.6, 5.5, 4.5],
    ports: [{ id: 'A', x: -5.5, y: 0, dir: 'L' }, { id: 'B', x: 5.5, y: 0, dir: 'R' }, { id: 'X', x: 0.65, y: 4.5, dir: 'D' }],
    inline: true,
    role: 'flow',
    flow: { kind: 'pilotCheck', free: 'AB' }
  });

  def('f.quickExhaust', 'flow', ['Hızlı Egzoz Valfi', 'Quick Exhaust Valve', 'Schnellentlüftungsventil'], {
    body: R(-3.5, -2.6, 7, 5.2, WHITE) + P('M-5 0H-3.5M3.5 0H5') + C(0, 0, 1.1, WHITE) + P('M-2.2 -1.4L-1.1 0L-2.2 1.4M2.2 -1.4L1.1 0L2.2 1.4', THIN) +
      P('M0 2.6V4') + P('M-1.2 4H1.2L0 5.8Z'),
    box: [-5, -2.6, 5, 5.8],
    ports: [{ id: '1', x: -5, y: 0, dir: 'L' }, { id: '2', x: 5, y: 0, dir: 'R' }],
    inline: true,
    role: 'flow',
    flow: { kind: 'quickExhaust' }
  });

  def('f.regulator', 'flow', ['Basınç Regülatörü', 'Pressure Regulator', 'Druckregelventil'], {
    body: R(-4, -4, 8, 8, WHITE) + P('M-6 0H-4M4 0H6') + arrow(-3, 1.2, 3, 1.2) +
      P('M0 -4L-1.4 -4.8L1.4 -6.2L-1.4 -7.6L0 -8.4', THIN) + P('M-2 -5.2L2 -7.4', THIN) +
      P('M5 0V5.6H-1.5V4', PILOT),
    box: [-6, -8.4, 6, 5.6],
    ports: [{ id: '1', x: -6, y: 0, dir: 'L' }, { id: '2', x: 6, y: 0, dir: 'R' }],
    inline: true,
    role: 'flow',
    flow: { kind: 'regulator' }
  });

  def('f.relief', 'flow', ['Emniyet (Basınç Tahliye) Valfi', 'Pressure Relief Valve', 'Druckbegrenzungsventil'], {
    body: R(-4, -4, 8, 8, WHITE) + P('M0 4V6.5') + arrow(1.4, 4, 1.4, -4) + P('M4 0L5 -1.4L6 1.4L7 -1.4L7.6 0', THIN) +
      P('M0 5.5H-5.5V-2H-4', PILOT) + P('M0 -4V-5.2') + P('M-1.2 -5.2H1.2L0 -7Z'),
    box: [-5.5, -7, 7.6, 6.5],
    ports: [{ id: '1', x: 0, y: 6.5, dir: 'D' }],
    tag: 'right',
    role: 'flow',
    flow: { kind: 'relief' }
  });

  /* ─── Hava hazırlama ve besleme ───────────────────────── */

  const FILTER = (x) => P(`M${x} -4L${x + 3} 0L${x} 4L${x - 3} 0Z`, WHITE) + P(`M${x} -4V4`, DASH) + P(`M${x} 4V5.3`, THIN);
  const REG = (x) => R(x - 3, -3, 6, 6, WHITE) + arrow(x - 2.2, 0.8, x + 2.2, 0.8) + P(`M${x} -3V-4M${x - 1.2} -4.2L${x + 1.2} -5.4`, THIN);
  const GAUGE = (x, y) => C(x, y, 1.6, WHITE) + P(`M${x - 0.9} ${y + 0.9}L${x + 0.9} ${y - 0.9}`, THIN);
  const LUBE = (x) => P(`M${x} -4L${x + 3} 0L${x} 4L${x - 3} 0Z`, WHITE) + P(`M${x} -2.6V1.2`, THIN) + C(x, 2, 0.45, SOLID);

  def('s.source', 'supply', ['Basınçlı Hava Kaynağı', 'Compressed Air Supply', 'Druckluftversorgung'], {
    body: C(0, 0, 3.4, WHITE) + P('M0 -2L1.8 1.3H-1.8Z'),
    box: [-3.4, -3.4, 3.4, 3.4],
    ports: [{ id: '1', x: 0, y: -3.4, dir: 'U' }],
    tag: 'none',
    role: 'source',
    texts: (it) => (it.note ? [{ x: 5, y: 0, t: it.note, s: 2.4, b: true, a: 'start' }] : []),
    defaultNote: 'BASINÇLI HAVA 6 bar'
  });

  def('s.compressor', 'supply', ['Kompresör', 'Compressor', 'Kompressor'], {
    body: C(0, 0, 5, WHITE) + P('M0 -3.2L2.8 1.8H-2.8Z') + P('M-5 0H-8', 'stroke-width="0.7"'),
    box: [-8, -5, 5, 5],
    ports: [{ id: '1', x: 0, y: -5, dir: 'U' }],
    role: 'source'
  });

  def('s.receiver', 'supply', ['Hava Tankı', 'Air Receiver', 'Druckluftbehälter'], {
    body: R(-9, -4, 18, 8, `rx="4" ${WHITE}`) + P('M0 4V5.6M-1 5.6H1', THIN),
    box: [-9, -4, 9, 5.6],
    ports: [{ id: '1', x: -9, y: 0, dir: 'L' }, { id: '2', x: 9, y: 0, dir: 'R' }],
    inline: true,
    role: 'treatment',
    treat: 'receiver'
  });

  def('s.frl', 'supply', ['Şartlandırıcı (Filtre-Regülatör)', 'Air Service Unit (Filter-Regulator)', 'Wartungseinheit (Filter-Regler)'], {
    body: R(-15, -6.5, 30, 13, `${CHAIN} fill="#fff"`) + P('M-15 0H-12.5M-6.5 0H-3M3 0H6.5M12.5 0H15') +
      FILTER(-9.5) + REG(0) + GAUGE(5.2, -4.4) + LUBE(9.5),
    box: [-15, -6.5, 15, 6.5],
    ports: [{ id: '1', x: -15, y: 0, dir: 'L' }, { id: '2', x: 15, y: 0, dir: 'R' }],
    inline: true,
    role: 'treatment',
    treat: 'frl'
  });

  def('s.fr', 'supply', ['Filtre-Regülatör', 'Filter Regulator', 'Filterregler'], {
    body: R(-11, -6.5, 22, 13, `${CHAIN} fill="#fff"`) + P('M-11 0H-7.5M-1.5 0H0.5M6.5 0H11') + FILTER(-4.5) + REG(3.5) + GAUGE(8.6, -4.4),
    box: [-11, -6.5, 11, 6.5],
    ports: [{ id: '1', x: -11, y: 0, dir: 'L' }, { id: '2', x: 11, y: 0, dir: 'R' }],
    inline: true,
    role: 'treatment',
    treat: 'fr'
  });

  def('s.filter', 'supply', ['Filtre (Su Tahliyeli)', 'Filter with Drain', 'Filter mit Wasserabscheider'], {
    body: P('M-5 0H-3M3 0H5') + FILTER(0),
    box: [-5, -4, 5, 5.3],
    ports: [{ id: '1', x: -5, y: 0, dir: 'L' }, { id: '2', x: 5, y: 0, dir: 'R' }],
    inline: true,
    role: 'treatment',
    treat: 'filter'
  });

  def('s.lubricator', 'supply', ['Yağlayıcı', 'Lubricator', 'Öler'], {
    body: P('M-5 0H-3M3 0H5') + LUBE(0),
    box: [-5, -4, 5, 4],
    ports: [{ id: '1', x: -5, y: 0, dir: 'L' }, { id: '2', x: 5, y: 0, dir: 'R' }],
    inline: true,
    role: 'treatment',
    treat: 'lubricator'
  });

  def('s.ballValve', 'supply', ['Küresel Vana (Manuel Kesme)', 'Ball Valve (Manual Shut-off)', 'Kugelhahn (Handabsperrung)'], {
    body: P('M-5 -3L5 3V-3L-5 3Z', WHITE) + C(0, 0, 1.5, WHITE) + P('M0 -1.5V-5.2H3.6'),
    box: [-5, -5.2, 5, 3],
    ports: [{ id: '1', x: -5, y: 0, dir: 'L' }, { id: '2', x: 5, y: 0, dir: 'R' }],
    inline: true,
    role: 'flow',
    flow: { kind: 'shutoff' }
  });

  /* ─── Sensörler ve göstergeler ────────────────────────── */

  def('k.pressureSensor', 'sensor', ['Basınç Sensörü (Analog)', 'Pressure Transmitter (Analogue)', 'Drucksensor (analog)'], {
    body: R(-3.5, -3.5, 7, 7, WHITE) + P('M3.5 -2H5.6M4.8 -2.8L5.6 -2L4.8 -1.2', THIN),
    texts: [{ x: 0, y: 0, t: 'P', s: 3.4, b: true }],
    box: [-3.5, -3.5, 5.6, 3.5],
    ports: [{ id: '1', x: 0, y: 3.5, dir: 'D' }],
    tag: 'right',
    role: 'sensor',
    sense: 'pressure'
  });

  def('k.pressureSwitch', 'sensor', ['Basınç Şalteri', 'Pressure Switch', 'Druckschalter'], {
    body: R(-3.5, -3.5, 7, 7, WHITE) + P('M-2 1.4H-0.6L1.6 -1.2M1.6 1.4H2.4', THIN) + P('M0 3.5V2.4', THIN) + P('M-2.6 -1.8L-1.6 -2.6L-0.6 -1.8L0.4 -2.6', THIN),
    box: [-3.5, -3.5, 3.5, 3.5],
    ports: [{ id: '1', x: 0, y: 3.5, dir: 'D' }],
    tag: 'right',
    role: 'sensor',
    sense: 'pressureSwitch'
  });

  def('k.gauge', 'sensor', ['Manometre', 'Pressure Gauge', 'Manometer'], {
    body: C(0, 0, 3, WHITE) + P('M-1.6 1.6L1.6 -1.6', THIN) + P('M1.9 -1.9L0.8 -1.6L1.6 -0.8Z', SOLID),
    box: [-3, -3, 3, 3],
    ports: [{ id: '1', x: 0, y: 3, dir: 'D' }],
    tag: 'right',
    role: 'display',
    sense: 'gauge'
  });

  def('k.position', 'sensor', ['Konum Sensörü (Bağımsız)', 'Position Sensor (Stand-alone)', 'Positionssensor (einzeln)'], {
    body: R(-3, -2.2, 6, 4.4, WHITE) + P('M0 -1.4L1.4 0L0 1.4L-1.4 0Z', THIN),
    box: [-3, -2.2, 3, 2.2],
    ports: [{ id: 'E', x: 0, y: -2.2, dir: 'U' }, { id: 'M', x: 0, y: 2.2, dir: 'D' }],
    tag: 'right',
    role: 'sensor',
    sense: 'position'
  });

  /* Manyetik piston sensörü (silindir sensörü): gövde, temassız algılama (eşkenar dörtgen) ve içinde mıknatıs.
     PNP çıkışlı elektronik sensörde yanda sinyal oku vardır. Aktüatörün üstüne bırakılınca onun sensörü olur. */
  const RHOMB = (x, y, h) => P(`M${r2(x)} ${r2(y - h)}L${r2(x + h)} ${r2(y)}L${r2(x)} ${r2(y + h)}L${r2(x - h)} ${r2(y)}Z`, 'stroke-width="0.22"');
  const MAGNET = (x, y, k) => R(r2(x - 1.1 * k), r2(y - 0.45 * k), r2(2.2 * k), r2(0.9 * k), 'stroke-width="0.16"') +
    R(r2(x - 1.1 * k), r2(y - 0.45 * k), r2(1.1 * k), r2(0.9 * k), SOLID);
  const OUT_ARROW = (x, y, k) => P(`M${r2(x)} ${r2(y)}H${r2(x + 1.5 * k)}`, 'stroke-width="0.22"') +
    P(`M${r2(x + 2.3 * k)} ${r2(y)}L${r2(x + 1.3 * k)} ${r2(y - 0.6 * k)}V${r2(y + 0.6 * k)}Z`, SOLID);
  const MAG_TYPES = ['', 'pnp'];

  /** Manyetik sensör çizimi: merkez (x,y), yarım genişlik w, yarım yükseklik h */
  function magSensor(x, y, w, h, type) {
    const k = h / 3;
    return R(r2(x - w), r2(y - h), r2(w * 2), r2(h * 2), WHITE) + RHOMB(x, y, r2(h * 0.78)) + MAGNET(x, y, k) +
      (type === 'pnp' ? OUT_ARROW(x + w, y, k) : '');
  }

  const MAG_PORTS = [{ id: 'E', x: 0, y: -3, dir: 'U' }, { id: 'M', x: 0, y: 3, dir: 'D' }];
  def('k.cylSensor', 'sensor', ['Manyetik Piston Sensörü', 'Magnetic Cylinder Sensor', 'Zylinderschalter, magnetisch'], {
    body: magSensor(0, 0, 3, 3, ''),
    box: [-3, -3, 3, 3],
    ports: MAG_PORTS,
    tag: 'right',
    role: 'sensor',
    sense: 'position',
    magnetic: '',
    attach: 'actuator'
  });
  def('k.cylSensorPnp', 'sensor', ['Manyetik Piston Sensörü (PNP)', 'Magnetic Cylinder Sensor (PNP)', 'Zylinderschalter, magnetisch (PNP)'], {
    body: magSensor(0, 0, 3, 3, 'pnp'),
    box: [-3, -3, 5.3, 3],
    ports: MAG_PORTS,
    tag: 'right',
    role: 'sensor',
    sense: 'position',
    magnetic: 'pnp',
    attach: 'actuator'
  });

  /* ─── Hat elemanları ──────────────────────────────────── */

  def('l.silencer', 'line', ['Susturucu', 'Silencer', 'Schalldämpfer'], {
    body: P('M0 0V1.2') + R(-1.1, 1.2, 2.2, 3.6, WHITE) + P('M-1.1 2.4H1.1M-1.1 3.6H1.1', THIN),
    box: [-1.1, 0, 1.1, 4.8],
    ports: [{ id: 'P', x: 0, y: 0, dir: 'U' }],
    tag: 'none',
    role: 'exhaust'
  });
  def('l.exhaust', 'line', ['Egzoz Çıkışı (Atmosfere)', 'Exhaust Port (to Atmosphere)', 'Entlüftung (ins Freie)'], {
    body: P('M0 0V1.6') + P('M-1.3 1.6H1.3L0 3.6Z'),
    box: [-1.3, 0, 1.3, 3.6],
    ports: [{ id: 'P', x: 0, y: 0, dir: 'U' }],
    tag: 'none',
    role: 'exhaust'
  });
  def('l.plug', 'line', ['Kör Tapa (Kapalı Port)', 'Blanking Plug', 'Verschlussstopfen'], {
    body: P('M0 0V1.4M-1.2 1.4H1.2', 'stroke-width="0.5"'),
    box: [-1.2, 0, 1.2, 1.4],
    ports: [{ id: 'P', x: 0, y: 0, dir: 'U' }],
    tag: 'none',
    role: 'plug'
  });
  const flagText = (it) => [{ x: -1, y: 0, t: it.note || '', s: 2.5, b: true }];
  def('l.inlet', 'line', ['Hat Girişi', 'Line Inlet', 'Leitungseingang'], {
    body: P('M-17 -4H13L17 0L13 4H-17Z', WHITE),
    texts: flagText,
    box: [-17, -4, 17, 4],
    ports: [{ id: 'R', x: 17, y: 0, dir: 'R' }],
    tag: 'none',
    role: 'terminal',
    terminal: 'in',
    defaultNote: 'BASINÇLI HAVA'
  });
  def('l.outlet', 'line', ['Hat Çıkışı', 'Line Outlet', 'Leitungsausgang'], {
    body: P('M-17 -4H13L17 0L13 4H-17L-13 0Z', WHITE),
    texts: (it) => [{ x: 0, y: 0, t: it.note || '', s: 2.5, b: true }],
    box: [-17, -4, 17, 4],
    ports: [{ id: 'L', x: -13, y: 0, dir: 'L' }],
    tag: 'none',
    role: 'terminal',
    terminal: 'out',
    defaultNote: 'EGZOZ'
  });
  def('l.offpage', 'line', ['Sayfa Bağlantısı', 'Off-Page Connector', 'Blattverbinder'], {
    body: P('M-13 -4H9L13 0L9 4H-13Z', WHITE) + P('M6 -4L10 0L6 4', THIN),
    texts: (it) => [{ x: -2, y: 0, t: it.note || '', s: 2.5, b: true }],
    box: [-13, -4, 13, 4],
    ports: [{ id: 'L', x: -13, y: 0, dir: 'L' }, { id: 'R', x: 13, y: 0, dir: 'R' }],
    tag: 'none',
    role: 'terminal',
    terminal: 'page',
    defaultNote: 'SAYFA 2'
  });
  def('l.junction', 'line', ['Bağlantı Noktası', 'Junction', 'Knotenpunkt'], {
    body: (it) => (it.showDot ? C(0, 0, 0.9, SOLID) : ''),
    box: [-1, -1, 1, 1],
    ports: [{ id: 'C', x: 0, y: 0, dir: null }],
    tag: 'none',
    hidden: true,
    role: 'junction'
  });

  /* ─── Çerçeve ─────────────────────────────────────────── */
  def('e.boundary', 'misc', ['Valf Adası / Montaj Grubu Sınırı', 'Valve Terminal / Assembly Boundary', 'Ventilinsel / Baugruppengrenze'], {
    resizable: true,
    container: true,
    noObstacle: true,
    tag: 'inside',
    defaultSize: [120, 40],
    body: (it) => R(-it.w / 2, -it.h / 2, it.w, it.h, CHAIN),
    role: 'container'
  });

  /* ─── Hat tipleri (ISO 1219-1) ────────────────────────── */
  const LINE_KINDS = {
    work: { name: { tr: 'Çalışma Hattı', en: 'Working Line', de: 'Arbeitsleitung' }, width: 0.45, layer: 'pneu', arrow: 'none', air: true },
    supply: { name: { tr: 'Ana Besleme Hattı', en: 'Main Supply Line', de: 'Hauptversorgungsleitung' }, width: 0.7, layer: 'pneu', arrow: 'none', air: true },
    pilot: { name: { tr: 'Pilot / Kumanda Hattı', en: 'Pilot / Control Line', de: 'Steuerleitung' }, width: 0.3, dash: '3 1.2', layer: 'pneu', arrow: 'none', air: true },
    exhaust: { name: { tr: 'Egzoz / Tahliye Hattı', en: 'Exhaust Line', de: 'Entlüftungsleitung' }, width: 0.3, dash: '1 0.8', layer: 'pneu', arrow: 'none', air: true },
    signal: { name: { tr: 'Elektrik Sinyali', en: 'Electric Signal', de: 'Elektrisches Signal' }, width: 0.25, dash: '0.5 0.9', layer: 'elec', arrow: 'none' },
    mech: { name: { tr: 'Mekanik Bağlantı', en: 'Mechanical Link', de: 'Mechanische Verbindung' }, width: 0.25, dash: '4 1 1 1', layer: 'pneu', arrow: 'none' }
  };

  /* ─── Yardımcılar ─────────────────────────────────────── */
  function normalize(text) {
    return String(text == null ? '' : text)
      .replace(/ı/g, 'i').replace(/I/g, 'i').replace(/İ/g, 'i')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  /** P&ID kodundan tek başına yerleştirilecek sembol (sürükle-bırak) */
  function suggest(kod, ad) {
    const k = String(kod || '').toUpperCase();
    const seri = (k.match(/^[A-Z]+/) || [''])[0];
    const n = normalize(ad);
    switch (seri) {
      case 'V':
        if (n.includes('ana valf')) return { symbol: 'v.32nc', role: 'coil' };
        if (/\b(ac|acma|kapat|kapatma|kaldirma|indirme|sisirme|sondurme)\b/.test(n) && !n.includes('aktuator')) return { symbol: 'v.52bi', role: 'coil' };
        return { symbol: 'v.52mono', role: 'coil' };
      case 'PS':
        if (n.includes('salter') || n.includes('bilgisi')) return { symbol: 'k.pressureSwitch', role: 'item' };
        return { symbol: 'k.pressureSensor', role: 'item' };
      case 'PPS':
      case 'SW':
      case 'PRS':
        return { symbol: 'k.cylSensor', role: 'item' };
      case 'SWB':
        return { symbol: 'k.position', role: 'item' };
      default:
        return { symbol: 'k.position', role: 'item' };
    }
  }

  /** Sensörlü aktüatörde seçim ve engel kutusu sensör etiketlerini de kapsar */
  function sensorBox(d, item) {
    const b = d.box.slice();
    const list = (item && item.sensors) || [];
    if (!d.sensors || !list.length) return b;
    const s = d.sensors;
    if (s.layout === 'top') {
      b[1] = Math.min(b[1], s.y - 10.5);
    } else {
      b[2] = Math.max(b[2], s.x + 15);
      b[3] = Math.max(b[3], s.y + list.length * 6.4 - 1);
    }
    return b;
  }

  /* Varsayılan yazılar (hava girişi, egzoz, sayfa adı...) belge dili değişince çevrilir.
     Kullanıcının kendi yazdığı yazı tabloda yoksa olduğu gibi kalır. */
  const NOTE_I18N = [
    ['BASINÇLI HAVA 6 bar', 'COMPRESSED AIR 6 bar', 'DRUCKLUFT 6 bar'],
    ['BASINÇLI HAVA', 'COMPRESSED AIR', 'DRUCKLUFT'],
    ['EGZOZ', 'EXHAUST', 'ABLUFT'],
    ['Pnömatik Devre Şeması', 'Pneumatic Circuit Diagram', 'Pneumatikschaltplan']
  ];
  const LANG_INDEX = { tr: 0, en: 1, de: 2 };
  const PAGE_WORDS = [['SAYFA', 'SHEET', 'BLATT'], ['ŞEMA', 'DIAGRAM', 'SCHEMA']];
  const fold = (text) => String(text == null ? '' : text)
    .replace(/ı/g, 'i').replace(/I/g, 'i').replace(/İ/g, 'i')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();

  /** "BASINÇLI HAVA 6 bar" → "COMPRESSED AIR 6 bar", "ŞEMA 2" → "DIAGRAM 2"; tanınmayan yazı aynen döner */
  function localNote(text, lang) {
    const index = LANG_INDEX[lang];
    if (!text || index === undefined) return text;
    const key = fold(text);
    for (const row of NOTE_I18N) {
      if (row.some((v) => fold(v) === key)) return row[index];
    }
    // Numaralı sayfa adı ve sayfa bağlantısı: "Pnömatik Devre Şeması 2", "ŞEMA 3"
    const m = String(text).match(/^([\s\S]*?)\s+(\d+)\s*$/);
    if (m) {
      const head = fold(m[1]);
      for (const row of NOTE_I18N) if (row.some((v) => fold(v) === head)) return `${row[index]} ${m[2]}`;
      for (const words of PAGE_WORDS) if (words.some((w) => fold(w) === head)) return `${words[index]} ${m[2]}`;
    }
    return text;
  }

  function boxOf(def_, item) {
    if (def_.resizable) {
      const w = (item && item.w) || def_.defaultSize[0];
      const h = (item && item.h) || def_.defaultSize[1];
      return [-w / 2, -h / 2, w / 2, h / 2];
    }
    return def_.sensors ? sensorBox(def_, item) : def_.box;
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

  /** Bobin konumları: 0 = sol (14), 1 = sağ (12) */
  function coilsOf(d) {
    return d && d.coils ? d.coilAt.slice(0, d.coils) : [];
  }

  /** Sensörün gövde üzerindeki yeri (sembol koordinatı) */
  function sensorPoint(d, sensor, index) {
    const s = d.sensors;
    if (!s) return null;
    if (s.layout === 'top') {
      const pos = Math.max(0, Math.min(1, Number.isFinite(+sensor.pos) ? +sensor.pos : 0));
      return { x: r2(s.x0 + (s.x1 - s.x0) * pos), y: s.y, layout: 'top' };
    }
    return { x: s.x, y: r2(s.y + index * 6.4), layout: 'side' };
  }

  /** Aktüatöre bağlı sensörün çizimi (sembol koordinatı). Silindirde gövdeye oturan manyetik sensör,
      döner aktüatör ve vanada yanda switch box (konum kontağı). */
  function sensorMark(d, sensor, index) {
    const p = sensorPoint(d, sensor, index);
    if (!p) return '';
    if (p.layout === 'top') return magSensor(p.x, r2(p.y - 1.65), 1.8, 1.65, sensor && sensor.type);
    return R(p.x, p.y, 4.4, 4, WHITE) +
      P(`M${r2(p.x + 0.7)} ${r2(p.y + 2.9)}H${r2(p.x + 1.8)}L${r2(p.x + 3.4)} ${r2(p.y + 1.2)}M${r2(p.x + 3.1)} ${r2(p.y + 2.9)}H${r2(p.x + 3.8)}`, 'stroke-width="0.22"');
  }

  /** Sensörlü silindirde pistondaki mıknatıs (manyetik piston) */
  function pistonMagnet(d, item) {
    const m = d && d.sensors && d.sensors.magnet;
    if (!m || !item || !(item.sensors || []).length) return '';
    return R(r2(m.x - 0.9), r2(m.y0 + 0.45), 1.8, 1.8, SOLID) + R(r2(m.x - 0.9), r2(m.y1 - 2.25), 1.8, 1.8, SOLID);
  }

  /** Palet ve lejant için bağımsız küçük önizleme */
  function thumbnail(id, size) {
    const d = BY_ID[id];
    if (!d) return '';
    const sample = {
      w: d.defaultSize ? 24 : undefined,
      h: d.defaultSize ? 16 : undefined,
      tag: '',
      note: ''
    };
    const b = boxOf(d, sample);
    const pad = 1;
    const vb = `${b[0] - pad} ${b[1] - pad} ${b[2] - b[0] + pad * 2} ${b[3] - b[1] + pad * 2}`;
    const texts = resolveTexts(d, sample, 'tr').filter((t) => t.t && !t.port && t.a !== 'start').map((t) =>
      `<text x="${t.x}" y="${t.y + t.s * 0.35}" font-size="${t.s}" text-anchor="middle" fill="currentColor" stroke="none" font-family="Calibri, Arial, sans-serif"${t.b ? ' font-weight="700"' : ''}>${t.t}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="0.45" stroke-linecap="round" stroke-linejoin="round">${resolveBody(d, sample)}${texts}</svg>`;
  }

  return {
    CATEGORIES,
    LINE_KINDS,
    list: () => LIST.filter((d) => !d.hidden),
    all: () => LIST.slice(),
    get: (id) => BY_ID[id] || null,
    suggest,
    normalize,
    boxOf,
    resolveBody,
    resolveTexts,
    localNote,
    coilsOf,
    sensorPoint,
    sensorMark,
    pistonMagnet,
    MAG_TYPES,
    thumbnail
  };
});
