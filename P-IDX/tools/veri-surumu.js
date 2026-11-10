/* Program verisi sürümü: kod listesi ya da güvenlik kataloğu değişince P&ID/data/surum.json'daki sürümü bir artırır.
   Veritabanı kullanan kurulumlar ana ekrandaki "Program verilerini güncelle" ile bu sürüme geçer; sürüm, eski
   programın yeni veriyi ezmesini önler. Satır sonu farkı değişiklik sayılmaz.
   Kullanım (P&PX klasöründe): npm run veri-surumu */

'use strict';

const fs = require('fs');
const path = require('path');
const PpxFs = require('../../ortak/ppx-fs.js');

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** root: P-IDX klasörü. Dosyalar değişmediyse sürüm dosyasına dokunmaz. */
async function bump(root, date) {
  const file = path.join(root, PpxFs.DATA_VERSION_FILE);
  let current = {};
  if (fs.existsSync(file)) current = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dosyalar = {};
  for (const { path: rel } of PpxFs.PROGRAM_DATA) dosyalar[rel] = await PpxFs.dataHash(fs.readFileSync(path.join(root, rel)));
  const old = current.dosyalar || {};
  const changed = Object.keys(dosyalar).filter((rel) => old[rel] !== dosyalar[rel]);
  const from = Number(current.surum) || 0;
  if (from && !changed.length) return { from, to: from, changed };
  const next = { surum: from + 1, tarih: date || localToday(), dosyalar };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return { from, to: next.surum, changed };
}

if (require.main === module) {
  bump(path.join(__dirname, '..'))
    .then(({ from, to, changed }) => {
      console.log(from === to
        ? `Kod listesi ve güvenlik kataloğu değişmedi, sürüm ${to}.`
        : `Program verisi sürümü ${from} → ${to}. Değişen: ${changed.join(', ')}`);
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}

module.exports = { bump };
