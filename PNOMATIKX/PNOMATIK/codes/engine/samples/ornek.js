/* Örnek çizim: motorun ve otomatik oluşturmanın görünümünü incelemek içindir, gerçek bir makineyi temsil etmez.
   Kodlar ve adları P&ID kod listesindendir (P&IDX P&ID/data/kod.csv). */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('../pidlink.js'), require('../generator.js'));
  } else {
    root.PidSample = factory(root.PidLink, root.PidGen);
  }
})(typeof self !== 'undefined' ? self : this, function (Link, Gen) {
  'use strict';

  const CODES = [
    ['V47', 'Ana Valf'],
    ['PS06', 'Giriş Hava Basıncı Basınç Sensörü'],
    ['V01', '1. Proses Pompa Emiş Aktüatör Vanası valfi'],
    ['SWB01', '1. Proses Pompa Emiş Aktüatör Vanası Switch Box'],
    ['V31', '1. Proses Tankı Tahliye Vanası Aç Valfi'],
    ['V32', '1. Proses Tankı Tahliye Vanası Kapat Valfi'],
    ['V48', "Kapak Aç Valf'i"],
    ['V49', "Kapak Kapat Valf'i"],
    ['PPS01', 'Ana Hücre Kapak Pistonu Açık Sensörü'],
    ['PPS02', 'Ana Hücre Kapak Pistonu Kapalı Sensörü'],
    ['V61', '1. Tank Sepet Kaldırma Valfi'],
    ['V62', '1. Tank Sepet İndirme Valfi'],
    ['PPS13', '1. Proses Tankı Lift Pistonu Açık Sensörü'],
    ['PPS14', '1. Proses Tankı Lift Pistonu Ara Sensörü'],
    ['PPS15', '1. Proses Tankı Lift Pistonu Kapalı Sensörü']
  ];

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
      revizyonlar: [],
      pidProje: '',
      pidEtiket: true
    };
    const plan = Link.plan(CODES.map(([kod, name]) => ({ kod, name })), new Map(), {});
    const drawing = Gen.build(plan, { lang: 'tr' });
    return { meta, drawing, pidCodes: CODES.map((c) => c[0]), catalog: CODES.map(([id, name]) => ({ id, name })) };
  }

  return { build, CODES };
});
