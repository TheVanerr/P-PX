/* Örnek çizim: motorun görünümünü incelemek içindir, gerçek bir makineyi temsil etmez. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../model.js'));
  } else {
    root.PidSample = factory(root.PidModel);
  }
})(typeof self !== 'undefined' ? self : this, function (Model) {
  'use strict';

  function build() {
    const meta = {
      seriNo: 'ÖRNEK',
      musteri: 'ÖRNEK MÜŞTERİ',
      model: 'ÖRNEK MAKİNE',
      firma: 'DOLFIN',
      dil: 'tr',
      rev: '01',
      tarih: new Date().toISOString().slice(0, 10),
      hazirlayan: 'Fatih GÜRAL',
      kontrol: 'Furkan BIÇAK',
      onay: 'Furkan BIÇAK',
      revizyonlar: []
    };

    const drawing = Model.createDrawing('Genel Proses Akışı (Örnek)');
    const s = drawing.sheets[0];
    const sym = (id, x, y, props) => Model.addSymbol(s, id, x, y, props);
    const pipe = (from, to, props) => Model.addLine(s, from, to, props);
    const port = (node, p) => ({ node: node.id, port: p });
    const edge = (node, side, t) => ({ node: node.id, side, t });
    const onTop = (tank, x) => edge(tank, 'T', (x - (tank.x - tank.w / 2)) / tank.w);
    const onBottom = (tank, x) => edge(tank, 'B', (x - (tank.x - tank.w / 2)) / tank.w);
    const onRight = (box, y) => edge(box, 'R', (y - (box.y - box.h / 2)) / box.h);
    const onLeft = (box, y) => edge(box, 'L', (y - (box.y - box.h / 2)) / box.h);

    /* Yıkama hücresi */
    const cabin = sym('e.cabin', 157.5, 70, { w: 125, h: 85, note: 'YIKAMA HÜCRESİ' });
    const basket = sym('e.basket', 157.5, 80, { w: 50, h: 50 });
    const spray = sym('e.spray', 157.5, 42.5);
    const gear = sym('d.gearmotor', 153.5, 122.5, { tag: 'GE01' });
    const lid = sym('i.field', 60, 70, { tag: 'SW18', func: 'ZS' });
    const hand = sym('s.hand', 37.5, 45, { tag: 'SS01', optional: true });

    /* Proses tankları */
    const tank1 = sym('e.tank', 87.5, 225, { w: 80, h: 60, note: '1. PROSES TANKI' });
    const tank2 = sym('e.tank', 192.5, 225, { w: 80, h: 60, note: '2. PROSES TANKI' });
    sym('h.resistance', 67.5, 237.5, { tag: 'R01' });
    sym('h.ultrasonic', 107.5, 237.5, { tag: 'TD01', optional: true });
    sym('h.resistance', 172.5, 237.5, { tag: 'R06' });
    sym('h.ultrasonic', 212.5, 237.5, { tag: 'TD02', optional: true });

    const ls1 = sym('i.field', 55, 177.5, { tag: 'LS01', func: 'LSL' });
    const tc1 = sym('i.field', 120, 177.5, { tag: 'TC01', func: 'TE' });
    const ls2 = sym('i.field', 165, 177.5, { tag: 'LS04', func: 'LSL' });
    const tc2 = sym('i.field', 220, 177.5, { tag: 'TC02', func: 'TE' });
    const interlock = sym('i.interlock', 55, 152.5);

    /* Pompalar */
    const strainer = sym('e.filter', 87.5, 178);
    const pump1 = sym('p.centrifugal', 87.5, 152.5, { rot: 270, tag: 'PE02' });
    const pump2 = sym('p.centrifugal', 192.5, 152.5, { rot: 270, tag: 'PE04', optional: true });
    const pressure = sym('i.field', 60, 100, { tag: 'PS01', func: 'PT' });

    /* Besleme */
    const water = sym('l.inlet', 33.5, 130, { note: 'ŞEBEKE SUYU' });
    const fill = sym('v.solenoid', 62.5, 130, { tag: 'SWB46' });

    /* Egzoz ve kurutma */
    const exhaust = sym('f.fan', 250, 50, { tag: 'FE01' });
    const stack = sym('l.outlet', 300, 50, { note: 'EGZOZ' });
    const dryFan = sym('f.fan', 250, 90, { tag: 'FE02', optional: true });
    const dryHeat = sym('h.resistance', 290, 90, { tag: 'R21', optional: true });

    /* Tank kapağı: pnömatik */
    const air = sym('l.inlet', 305, 130, { note: 'BASINÇLI HAVA' });
    const frl = sym('n.frl', 358, 130);
    const pilot = sym('n.valve52', 354.5, 100, { tag: 'V67', note: 'V68' });
    const cylinder = sym('n.cylinder', 355, 65);
    Model.addText(s, 372.5, 66, 'Tank Kapağı', { size: 2.5 });
    const zso = sym('i.field', 346, 37.5, { tag: 'PPS31', func: 'ZSO' });
    const zsc = sym('i.field', 360, 37.5, { tag: 'PPS32', func: 'ZSC' });

    /* Drenaj */
    const drain = sym('l.outlet', 215, 267.5, { note: 'DRENAJ' });

    /* Proses hatları */
    pipe(onTop(tank1, 87.5), port(strainer, 'D'), { kind: 'process' });
    pipe(port(strainer, 'U'), port(pump1, 'L'), { kind: 'process' });
    const main = pipe(port(pump1, 'R'), port(spray, 'L'), { kind: 'process', label: 'L-02' });
    pipe(onTop(tank2, 192.5), port(pump2, 'L'), { kind: 'process', optional: true });
    pipe(port(pump2, 'R'), port(spray, 'R'), { kind: 'process', optional: true, label: 'L-03' });

    const back = pipe(onBottom(cabin, 110), onTop(tank1, 110), { kind: 'utility', label: 'L-04' });
    Model.insertInline(s, back.id, 'v.ballPneumatic', 110, 132.5, { tag: 'V09' });

    const header = pipe(onBottom(tank1, 87.5), port(drain, 'L'), { kind: 'utility', label: 'L-05' });
    Model.insertInline(s, header.id, 'v.ball', 135, 267.5, { tag: 'V27' });
    const tail = s.items.find((it) => Model.isLine(it) && it.to.node === drain.id);
    const branch = Model.splitLine(s, tail.id, 192.5, 267.5);
    pipe(onBottom(tank2, 192.5), port(branch, 'C'), { kind: 'utility' });

    pipe(port(water, 'R'), port(fill, 'L'), { kind: 'utility' });
    pipe(port(fill, 'R'), onTop(tank1, 72.5), { kind: 'utility' });

    pipe(onRight(cabin, 50), port(exhaust, 'L'), { kind: 'duct' });
    pipe(port(exhaust, 'R'), port(stack, 'L'), { kind: 'duct' });
    pipe(port(dryHeat, 'L'), port(dryFan, 'R'), { kind: 'duct', optional: true });
    pipe(port(dryFan, 'L'), onRight(cabin, 90), { kind: 'duct', optional: true });

    /* Pnömatik */
    pipe(port(air, 'R'), port(frl, 'L'), { kind: 'air' });
    pipe(port(frl, 'R'), port(pilot, 'P'), { kind: 'air' });
    pipe(port(pilot, 'A'), port(cylinder, 'A'), { kind: 'air' });
    pipe(port(pilot, 'B'), port(cylinder, 'B'), { kind: 'air' });

    /* Sinyaller */
    pipe(port(ls1, 'D'), onTop(tank1, 55), { kind: 'signal' });
    pipe(port(tc1, 'D'), onTop(tank1, 120), { kind: 'signal' });
    pipe(port(ls2, 'D'), onTop(tank2, 165), { kind: 'signal' });
    pipe(port(tc2, 'D'), onTop(tank2, 220), { kind: 'signal' });
    pipe(port(ls1, 'U'), port(interlock, 'D'), { kind: 'signal' });
    pipe(port(interlock, 'R'), port(pump1, 'M'), { kind: 'signal' });
    const tap = Model.splitLine(s, main.id, 87.5, 100);
    pipe(port(pressure, 'R'), port(tap, 'C'), { kind: 'signal' });
    pipe(port(lid, 'R'), onLeft(cabin, 70), { kind: 'signal' });
    pipe(port(hand, 'R'), port(lid, 'U'), { kind: 'signal', optional: true });
    pipe(port(gear, 'U'), onBottom(basket, 157.5), { kind: 'mech' });
    pipe(port(zso, 'D'), port(cylinder, 'S1'), { kind: 'signal' });
    pipe(port(zsc, 'D'), port(cylinder, 'S2'), { kind: 'signal' });

    const valve = s.items.find((it) => it.tag === 'V09');
    const feedback = sym('i.field', 137.5, 132.5, { tag: 'SWB09', func: 'ZS' });
    pipe(port(feedback, 'L'), port(valve, 'A'), { kind: 'signal' });

    Model.addLegend(s, 292, 147.5);
    Model.updateJunctionDots(s);
    return { meta, drawing };
  }

  return { build };
});
