/**
 * kod.csv / kod-en.csv / kod-de.csv üretici
 * node build-kod-catalog.js
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SOURCE_PATH = path.join(DATA_DIR, 'kod.csv');

function readKodCsvText(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('\uFFFD')) return utf8;
  return new TextDecoder('windows-1254').decode(buf);
}

function detectCsvDelimiter(line) {
  const c = (line.match(/,/g) || []).length;
  const s = (line.match(/;/g) || []).length;
  return s > c ? ';' : ',';
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i += 1; } else q = !q;
      continue;
    }
    if (ch === delimiter && !q) { cells.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells.map(c => c.trim());
}

function escapeCsvCell(value, delimiter = ';') {
  const str = String(value ?? '');
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCsv(filePath, header, rows) {
  const lines = [header, ...rows.map(r => r.map(c => escapeCsvCell(c)).join(';'))];
  fs.writeFileSync(filePath, '\uFEFF' + lines.join('\r\n'), 'utf8');
}

function prefixOf(kod) {
  return (String(kod).match(/^([A-Za-z]+)/) || [])[1]?.toUpperCase() || '';
}

function applyRules(text, rules) {
  let out = text;
  for (const [pattern, replacement] of rules) out = out.replace(pattern, replacement);
  return out.replace(/\s+/g, ' ').trim();
}

const EN_NAME_RULES = [
  [/Tank Otomatik Dolum Solenoid Vanası/g, 'Tank Automatic Filling Solenoid Valve'],
  [/Tank Kapağı Açık Sensörü/g, 'Tank Lid Open Sensor'],
  [/Tank Kapağı Kapalı Sensörü/g, 'Tank Lid Closed Sensor'],
  [/Tank Sepet Kaldırma Valfi/g, 'Tank Basket Raise Valve'],
  [/Tank Sepet İndirme Valfi/g, 'Tank Basket Lower Valve'],
  [/Tank Kapağı Açma Valfi/g, 'Tank Lid Open Valve'],
  [/Tank Kapağı Kapatma Valfi/g, 'Tank Lid Close Valve'],
  [/Ön Yıkama Pompa Motoru/g, 'Pre-Wash Pump Motor'],
  [/Yıkama Pompa Motoru/g, 'Wash Pump Motor'],
  [/Ön Durulama Pompa Motoru/g, 'Pre-Rinse Pump Motor'],
  [/Durulama Pompa Motoru/g, 'Rinse Pump Motor'],
  [/Otomatik Drenaj Pompası Motoru/g, 'Automatic Drain Pump Motor'],
  [/Vakum Pompası Motoru/g, 'Vacuum Pump Motor'],
  [/Hücre Boşaltma Pompası Motoru/g, 'Cell Discharge Pump Motor'],
  [/Arıtma Gidiş Pompası Motoru/g, 'Purification Outlet Pump Motor'],
  [/Arıtma Dönüş Pompası Motoru/g, 'Purification Return Pump Motor'],
  [/Dozaj Pompası/g, 'Dosing Pump'],
  [/Hassas Filre Pompası Motoru/g, 'Precision Filter Pump Motor'],
  [/Yağ Ayırıcı Pompası Motoru/g, 'Oil Separator Pump Motor'],
  [/Pompası Motoru/g, 'Pump Motor'],
  [/Pompa Motoru/g, 'Pump Motor'],
  [/Egzost Fanı Motoru/g, 'Exhaust Fan Motor'],
  [/Kurutma Fanı Motoru/g, 'Drying Fan Motor'],
  [/Fan Motoru/g, 'Fan Motor'],
  [/Blower Motoru/g, 'Blower Motor'],
  [/Vibrasyon/g, 'Vibration'],
  [/Redüktörü Motoru/g, 'Gear Motor'],
  [/Redüktör Motoru/g, 'Gear Motor'],
  [/Sepet Redüktörü Motoru/g, 'Basket Gear Motor'],
  [/Tambur Redüktörü Motoru/g, 'Drum Gear Motor'],
  [/Otomatik Yükleme Motoru/g, 'Automatic Loading Motor'],
  [/Kapı Redüktörü Motoru/g, 'Door Gear Motor'],
  [/Konveyör/g, 'Conveyor'],
  [/Yağ Sıyırıcı/g, 'Oil Scraper'],
  [/Rezistansı Grubu/g, 'Heater Group'],
  [/Rezistansı/g, 'Heater'],
  [/Rezistans/g, 'Heater'],
  [/Ultrasonik Jeneratör Seti/g, 'Ultrasonic Generator Set'],
  [/Tepe Lambası/g, 'Stack Light'],
  [/Uyar[ıi] Lambası/g, 'Warning Light'],
  [/Hücre İçi Aydınlatma Lambası/g, 'Cell Interior Light'],
  [/Pano Lambası/g, 'Panel Light'],
  [/Lambası/g, 'Lamp'],
  [/Alt Seviye Sensörü/g, 'Low Level Sensor'],
  [/Orta Seviye Sensörü/g, 'Mid Level Sensor'],
  [/Üst Seviye Sensörü/g, 'High Level Sensor'],
  [/Seviye Sensörü/g, 'Level Sensor'],
  [/El Koruma Sensörü/g, 'Hand Protection Sensor'],
  [/Interlock Kilit/g, 'Interlock Lock'],
  [/İnterlock Kilit Sensörü/g, 'Interlock Lock Sensor'],
  [/Işın Bariyeri Safety Sensörü/g, 'Light Barrier Safety Sensor'],
  [/KAPAK RFID SENSÖRÜ/g, 'LID RFID SENSOR'],
  [/Sepet Pozisyon/g, 'Basket Position'],
  [/Prox Sensörü/g, 'Proximity Sensor'],
  [/Switch Box/g, 'Switch Box'],
  [/Switchbox/g, 'Switchbox'],
  [/Switchi/g, 'Switch'],
  [/Sensörü/g, 'Sensor'],
  [/Sensör/g, 'Sensor'],
  [/Isı Ölçer/g, 'Temperature Transmitter'],
  [/Basınç Şalteri/g, 'Pressure Switch'],
  [/pH Sensörü/g, 'pH Sensor'],
  [/İletkenlik Sensörü/g, 'Conductivity Sensor'],
  [/valfi/g, 'valve'],
  [/Valfi/g, 'Valve'],
  [/Valf'i/g, 'Valve'],
  [/Valf/g, 'Valve'],
  [/Motoru/g, 'Motor'],
  [/Motor/g, 'Motor'],
  [/Hücre/g, 'Cell'],
  [/Proses Tankı/g, 'Process Tank'],
  [/Proses Tank/g, 'Process Tank'],
  [/Pompası/g, 'Pump'],
  [/Pompa/g, 'Pump'],
  [/Vanası/g, 'Valve'],
  [/Vana/g, 'Valve'],
  [/Aktüatör/g, 'Actuator'],
  [/Aktuator/g, 'Actuator'],
  [/Aktuatör/g, 'Actuator'],
  [/Emiş/g, 'Suction'],
  [/Drenaj/g, 'Drain'],
  [/Kurutma/g, 'Drying'],
  [/Yıkama/g, 'Wash'],
  [/Durulama/g, 'Rinse'],
  [/Besleme/g, 'Feed'],
  [/Tahliye/g, 'Discharge'],
  [/Kapak/g, 'Lid'],
  [/Sepet/g, 'Basket']
];

const DE_NAME_RULES = [
  [/Tank Otomatik Dolum Solenoid Vanası/g, 'Tank Magnetventil für automatische Befüllung'],
  [/Tank Kapağı Açık Sensörü/g, 'Tank Deckel-offen-Sensor'],
  [/Tank Kapağı Kapalı Sensörü/g, 'Tank Deckel-geschlossen-Sensor'],
  [/Tank Sepet Kaldırma Valfi/g, 'Tank Korb-Hebeventil'],
  [/Tank Sepet İndirme Valfi/g, 'Tank Korb-Senkventil'],
  [/Tank Kapağı Açma Valfi/g, 'Tank Deckel-Öffnungsventil'],
  [/Tank Kapağı Kapatma Valfi/g, 'Tank Deckel-Schließventil'],
  [/Ön Yıkama Pompa Motoru/g, 'Vorwäsche-Pumpenmotor'],
  [/Yıkama Pompa Motoru/g, 'Waschpumpenmotor'],
  [/Ön Durulama Pompa Motoru/g, 'Vorspül-Pumpenmotor'],
  [/Durulama Pompa Motoru/g, 'Spülpumpenmotor'],
  [/Otomatik Drenaj Pompası Motoru/g, 'Automatischer Ablasspumpenmotor'],
  [/Vakum Pompası Motoru/g, 'Vakuumpumpenmotor'],
  [/Hücre Boşaltma Pompası Motoru/g, 'Zellenentleerungspumpenmotor'],
  [/Arıtma Gidiş Pompası Motoru/g, 'Reinigung-Auslasspumpenmotor'],
  [/Arıtma Dönüş Pompası Motoru/g, 'Reinigung-Rücklaufpumpenmotor'],
  [/Dozaj Pompası/g, 'Dosierpumpe'],
  [/Hassas Filre Pompası Motoru/g, 'Feinfilterpumpenmotor'],
  [/Yağ Ayırıcı Pompası Motoru/g, 'Ölabscheiderpumpenmotor'],
  [/Pompası Motoru/g, 'Pumpenmotor'],
  [/Pompa Motoru/g, 'Pumpenmotor'],
  [/Egzost Fanı Motoru/g, 'Abluftventilatormotor'],
  [/Kurutma Fanı Motoru/g, 'Trocknungsventilatormotor'],
  [/Fan Motoru/g, 'Ventilatormotor'],
  [/Blower Motoru/g, 'Gebläsemotor'],
  [/Vibrasyon/g, 'Vibrations'],
  [/Redüktörü Motoru/g, 'Getriebemotor'],
  [/Redüktör Motoru/g, 'Getriebemotor'],
  [/Rezistansı Grubu/g, 'Heizgruppe'],
  [/Rezistansı/g, 'Heizwiderstand'],
  [/Rezistans/g, 'Heizwiderstand'],
  [/Ultrasonik Jeneratör Seti/g, 'Ultraschall-Generatorsatz'],
  [/Tepe Lambası/g, 'Signalleuchte'],
  [/Uyar[ıi] Lambası/g, 'Warnleuchte'],
  [/Seviye Sensörü/g, 'Füllstandsensor'],
  [/Sensörü/g, 'Sensor'],
  [/Switch Box/g, 'Schaltbox'],
  [/Switchi/g, 'Schalter'],
  [/Isı Ölçer/g, 'Temperaturfühler'],
  [/Basınç Şalteri/g, 'Druckschalter'],
  [/pH Sensörü/g, 'pH-Sensor'],
  [/İletkenlik Sensörü/g, 'Leitfähigkeitssensor'],
  [/Valfi/g, 'Ventil'],
  [/Valf/g, 'Ventil'],
  [/Motoru/g, 'Motor'],
  [/Hücre/g, 'Zelle'],
  [/Proses Tankı/g, 'Prozesstank'],
  [/Proses Tank/g, 'Prozesstank'],
  [/Pompası/g, 'Pumpe'],
  [/Pompa/g, 'Pumpe'],
  [/Vanası/g, 'Ventil'],
  [/Aktüatör/g, 'Stellantrieb'],
  [/Emiş/g, 'Saugung'],
  [/Drenaj/g, 'Ablauf'],
  [/Kurutma/g, 'Trocknung'],
  [/Kapak/g, 'Deckel'],
  [/Sepet/g, 'Korb']
];

const EN_DESC_RULES = [
  [/proses tankından/g, 'from the process tank'],
  [/proses tankı/g, 'process tank'],
  [/proses hattında/g, 'in the process line'],
  [/proses hattı/g, 'process line'],
  [/proses suyunun/g, 'process water'],
  [/proses sıvısının/g, 'process fluid'],
  [/yıkama haznesi/g, 'wash chamber'],
  [/hücre/g, 'cell'],
  [/sepet/g, 'basket'],
  [/sprey manifold/g, 'spray manifold'],
  [/emiş hattı/g, 'suction line'],
  [/basma hattı/g, 'discharge line'],
  [/drenaj hattı/g, 'drain line'],
  [/kurutma hattı/g, 'drying line'],
  [/egzoz hattı/g, 'exhaust line'],
  [/motor koruma/g, 'motor protection'],
  [/kontrol devresi/g, 'control circuit'],
  [/VFD çıkış/g, 'VFD output'],
  [/[Kk]ontrol ünitesi(?:ne|nin|nde)? \(PLC\/Röle\)/g, 'control unit (PLC/relay)'],
  [/vanası/g, 'valve'],
  [/vanalar/g, 'valves'],
  [/pompa/g, 'pump'],
  [/sensör/g, 'sensor'],
  [/sensörü/g, 'sensor'],
  [/bağlıdır/g, 'connected'],
  [/sağlar/g, 'provides'],
  [/izler/g, 'monitors'],
  [/kontrol eder/g, 'controls'],
  [/koruma/g, 'protection'],
  [/sirkülasyon/g, 'circulation'],
  [/transfer/g, 'transfer'],
  [/sıcaklık/g, 'temperature'],
  [/basınç/g, 'pressure'],
  [/seviye/g, 'level'],
  [/pozisyon/g, 'position'],
  [/açık konum/g, 'open position'],
  [/kapalı konum/g, 'closed position'],
  [/interlock/g, 'interlock'],
  [/güvenlik/g, 'safety'],
  [/sinyal/g, 'signal'],
  [/akış/g, 'flow'],
  [/hava/g, 'air'],
  [/su/g, 'water'],
  [/ısıtma/g, 'heating'],
  [/soğutma/g, 'cooling']
];

const DE_DESC_RULES = [
  [/proses tankından/g, 'vom Prozesstank'],
  [/proses tankı/g, 'Prozesstank'],
  [/proses hattında/g, 'in der Prozessleitung'],
  [/proses hattı/g, 'Prozessleitung'],
  [/yıkama haznesi/g, 'Waschkammer'],
  [/hücre/g, 'Zelle'],
  [/sepet/g, 'Korb'],
  [/emiş hattı/g, 'Saugleitung'],
  [/basma hattı/g, 'Druckleitung'],
  [/drenaj hattı/g, 'Ablaufleitung'],
  [/kurutma hattı/g, 'Trocknungsleitung'],
  [/egzoz hattı/g, 'Abluftleitung'],
  [/motor koruma/g, 'Motorschutz'],
  [/kontrol devresi/g, 'Steuerkreis'],
  [/VFD çıkış/g, 'Frequenzumrichter-Ausgang'],
  [/[Kk]ontrol ünitesi(?:ne|nin|nde)? \(PLC\/Röle\)/g, 'Steuereinheit (SPS/Relais)'],
  [/vanası/g, 'Ventil'],
  [/vanalar/g, 'Ventile'],
  [/pompa/g, 'Pumpe'],
  [/sensör/g, 'Sensor'],
  [/sensörü/g, 'Sensor'],
  [/bağlıdır/g, 'angeschlossen'],
  [/sağlar/g, 'gewährleistet'],
  [/izler/g, 'überwacht'],
  [/kontrol eder/g, 'steuert'],
  [/koruma/g, 'Schutz'],
  [/sirkülasyon/g, 'Zirkulation'],
  [/sıcaklık/g, 'Temperatur'],
  [/basınç/g, 'Druck'],
  [/seviye/g, 'Füllstand'],
  [/pozisyon/g, 'Position'],
  [/açık konum/g, 'Offenstellung'],
  [/kapalı konum/g, 'Geschlossenstellung'],
  [/interlock/g, 'Verriegelung'],
  [/güvenlik/g, 'Sicherheit'],
  [/sinyal/g, 'Signal'],
  [/akış/g, 'Durchfluss'],
  [/hava/g, 'Luft'],
  [/su/g, 'Wasser']
];

function translateName(tr, rules) {
  return applyRules(tr, rules);
}

function translateDesc(tr, rules) {
  let en = tr;
  en = en.replace(/([A-Z]{2,}\d*)/g, '$1');
  return applyRules(en, rules);
}

// Ön ek şablonu bu kodların işlevini yanlış anlatır: SWB46-47 switch box değil solenoid vana,
// V61-72 proses hattı vanası değil piston komut valfi.
const OVERRIDE_DESCRIPTIONS = {
  fill: {
    tr: 'Tanka otomatik dolum akışını açıp kapatır. Besleme hattı, seviye sensörü ve kontrol ünitesine (PLC/Röle) bağlıdır.',
    en: 'Opens and closes the automatic filling flow to the tank. Connected to the supply line, level sensor and control unit (PLC/relay).',
    de: 'Öffnet und schließt die automatische Befüllung des Tanks. Angeschlossen an Versorgungsleitung, Füllstandsensor und Steuereinheit (SPS/Relais).'
  },
  basket: {
    tr: 'Tank sepetinin kaldırma/indirme hareketi için pnömatik komutu uygular. Sepet pistonu, konum sensörleri ve kontrol ünitesine (PLC/Röle) bağlıdır.',
    en: 'Applies the pneumatic command for raising/lowering the tank basket. Connected to the basket cylinder, position sensors and control unit (PLC/relay).',
    de: 'Gibt den pneumatischen Befehl zum Heben/Senken des Tankkorbs. Angeschlossen an Korbzylinder, Positionssensoren und Steuereinheit (SPS/Relais).'
  },
  lid: {
    tr: 'Tank kapağının açma/kapatma hareketi için pnömatik komutu uygular. Kapak pistonu, konum sensörleri ve kontrol ünitesine (PLC/Röle) bağlıdır.',
    en: 'Applies the pneumatic command for opening/closing the tank lid. Connected to the lid cylinder, position sensors and control unit (PLC/relay).',
    de: 'Gibt den pneumatischen Befehl zum Öffnen/Schließen des Tankdeckels. Angeschlossen an Deckelzylinder, Positionssensoren und Steuereinheit (SPS/Relais).'
  }
};

function overrideDescription(kod, lang) {
  const p = prefixOf(kod);
  const num = parseInt(String(kod).replace(/\D/g, ''), 10);
  let key = null;
  if (p === 'SWB' && (num === 46 || num === 47)) key = 'fill';
  else if (p === 'V' && num >= 61 && num <= 66) key = 'basket';
  else if (p === 'V' && num >= 67 && num <= 72) key = 'lid';
  return key ? OVERRIDE_DESCRIPTIONS[key][lang] : null;
}

function buildDescriptionTr(kod, name) {
  const p = prefixOf(kod);
  const n = name.toLowerCase();

  if (p === 'PE') {
    if (n.includes('ön yıkama')) return 'Ön yıkama proses tankından emiş hattı üzerinden yıkama suyunun sepet ve sprey manifoldlarına sirkülasyonunu sağlar. Emiş vanası, pompa koruma rölesi ve VFD çıkış devresine bağlıdır.';
    if (n.includes('yıkama pompa')) return 'Ana yıkama devresinde proses suyunun basınçlı transferini sağlar. Proses tankı, emiş vanası, basma manifoldu ve motor kontrol devresine bağlıdır.';
    if (n.includes('durulama') && n.includes('ön')) return 'Ön durulama aşamasında proses suyunun sirkülasyonunu sağlar. Durulama tankı emiş hattı, vanalar ve motor koruma devresine bağlıdır.';
    if (n.includes('durulama')) return 'Durulama devresinde proses suyunun sepet ve sprey hatlarına transferini sağlar. Basma/emiş vanaları ve motor kontrol devresine bağlıdır.';
    if (n.includes('drenaj')) return 'Otomatik drenaj fazında proses sıvısının tank veya hücreden tahliyesini sağlar. Drenaj vanası, seviye sensörü ve motor koruma devresine bağlıdır.';
    if (n.includes('vakum')) return 'Hücre içi vakum oluşturmak için proses sıvısını emer. Vakum tankı, emiş vanası, basınç sensörü ve motor kontrol devresine bağlıdır.';
    if (n.includes('boşaltma') || n.includes('bosaltma')) return 'Hücre boşaltma fazında sıvının tahliye hattına transferini sağlar. Boşaltma vanası, hücre drenaj hattı ve motor koruma devresine bağlıdır.';
    if (n.includes('arıtma') && n.includes('gidiş')) return 'Arıtma devresinde proses suyunun filtre/arıtma ünitesine beslemesini sağlar. Arıtma gidiş hattı, vanalar ve motor kontrol devresine bağlıdır.';
    if (n.includes('arıtma') && n.includes('dönüş')) return 'Arıtma sonrası proses suyunun ana devreye geri dönüşünü sağlar. Dönüş hattı, vanalar ve motor kontrol devresine bağlıdır.';
    if (n.includes('dozaj')) return 'Kimyasal dozaj devresinde belirlenen debide sıvı enjeksiyonu sağlar. Dozaj tankı, seviye sensörü, dozaj vanası ve motor kontrol devresine bağlıdır.';
    if (n.includes('filtre') || n.includes('filre')) return 'Hassas filtrasyon hattında proses suyunun filtre girişine transferini sağlar. Filtre, emiş/basma vanaları ve motor koruma devresine bağlıdır.';
    if (n.includes('yağ ayırıcı')) return 'Yağ ayırıcı devresinde yağlı fazın ayrıştırılması için sıvı sirkülasyonunu sağlar. Ayırıcı tank, vanalar ve motor kontrol devresine bağlıdır.';
    return 'Proses hattında sıvı transferi ve sirkülasyon sağlar. İlgili emiş/basma hatları, vanalar, sensörler ve motor kontrol devresine bağlıdır.';
  }

  if (p === 'FE') {
    if (n.includes('egzost') || n.includes('egzos')) return 'Proses ve kurutma sonrası nemli havanın egzoz hattından dışarı atılmasını sağlar. Egzoz kanalı, damper vanası ve motor koruma devresine bağlıdır.';
    if (n.includes('kurutma')) return 'Kurutma devresinde hücre içi hava sirkülasyonunu ve nem tahliyesini sağlar. Kurutma hattı, ısıtma devresi ve motor kontrol devresine bağlıdır.';
    if (n.includes('blower')) return 'Hücre veya proses hattında basınçlı hava üflemesi sağlar. Hava dağıtım hattı, kontrol vanası ve motor koruma devresine bağlıdır.';
    return 'Hava akışını düzenler ve ilgili proses hattına transfer sağlar. Hava kanalı, vanalar ve motor kontrol devresine bağlıdır.';
  }

  if (p === 'VE') return 'Sepet veya tambur üzerinde titreşim uygulayarak parça ayrıştırma ve proses verimini destekler. Vibrasyon ünitesi, mekanik bağlantı ve motor koruma devresine bağlıdır.';

  if (p === 'GE') {
    if (n.includes('sepet')) return 'Yıkama sepetinin proses pozisyonları arasında döndürülmesini sağlar. Sepet tahrik mekanizması, pozisyon sensörleri ve motor/VFD devresine bağlıdır.';
    if (n.includes('tambur')) return 'Tambur tip proses ekipmanının dönme hareketini sağlar. Tambur tahrik, mekanik bağlantı ve motor koruma devresine bağlıdır.';
    if (n.includes('yükleme') || n.includes('yukleme')) return 'Otomatik parça yükleme konveyörünün hareketini sağlar. Konveyör hattı, giriş/çıkış sensörleri ve motor kontrol devresine bağlıdır.';
    if (n.includes('kapı') || n.includes('kapi')) return 'Hücre veya erişim kapısının açılıp kapanma hareketini sağlar. Kapı mekanizması, interlock sensörleri ve motor devresine bağlıdır.';
    if (n.includes('konveyör') || n.includes('konveyor')) return 'Parça taşıma konveyörünün sürekli veya adım hareketini sağlar. Konveyör hattı, prox sensörleri ve motor kontrol devresine bağlıdır.';
    if (n.includes('sıyırıcı') || n.includes('siyirici')) return 'Yağ veya proses sıvısı yüzeyindeki tabakayı sıyırarak toplama devresine aktarımı destekler. Sıyırıcı mekanizma ve motor kontrol devresine bağlıdır.';
    return 'Mekanik tahrik devresinde dönme/lineer hareket sağlar. İlgili mekanik grup, limit switch ve motor kontrol devresine bağlıdır.';
  }

  if (p === 'R') {
    if (n.includes('kurutma')) return 'Kurutma havasının ısıtılması için rezistans grubunu çalıştırır. Kurutma fanı, sıcaklık sensörü, SSR/kontaktör ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('proses tank')) return 'Proses tankı sıvısının hedef sıcaklığa ısıtılmasını sağlar. Tank ısı sensörü, termostat/SSR ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    return 'Proses devresinde ısıtma sağlar. Sıcaklık sensörü, ısı kontrol rölesi ve kontrol ünitesine (PLC/Röle) bağlıdır.';
  }

  if (p === 'TD') return 'Proses tankında ultrasonik temizleme için jeneratör/transdüser setini besler. Ultrasonik jeneratör, tank ve kontrol ünitesine (PLC/Röle) bağlıdır.';

  if (p === 'L') {
    if (n.includes('tepe') || n.includes('uyar')) return 'Makine durumu, alarm veya proses fazı bilgisini operatöre görsel olarak iletir. Kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('hücre')) return 'Hücre içi bakım ve operasyon için aydınlatma sağlar. Pano beslemesi ve kontrol devresine bağlıdır.';
    if (n.includes('pano')) return 'Elektrik panosu içi bakım aydınlatması sağlar. Pano kapı switch ve besleme devresine bağlıdır.';
    return 'Görsel bilgilendirme veya aydınlatma sağlar. İlgili besleme ve kontrol devresine bağlıdır.';
  }

  if (p === 'LS') {
    if (n.includes('drenaj')) return 'Drenaj hattı veya tavasında sıvı seviyesini izler; taşma veya boş kalma durumunda kontrol ünitesine (PLC/Röle) sinyal verir. Drenaj hattı ve alarm/interlock devresine bağlıdır.';
    if (n.includes('vakum')) return 'Vakum pompası tankında minimum/maksimum sıvı seviyesini izler. Vakum pompası, emiş hattı ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('dozaj')) return 'Dozaj tankı sıvı seviyesini izler; minimum seviyede dozaj pompası koruma sinyali üretir. Dozaj tankı ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('sızıntı') || n.includes('sizinti')) return 'Sızıntı tavasında anormal sıvı birikimini algılar ve alarm/interlock sinyali üretir. Kontrol ünitesinin (PLC/Röle) güvenlik devresine bağlıdır.';
    if (n.includes('hücre')) return 'Hücre içi proses sıvısı seviyesini izler. Sepet, drenaj ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    return 'Proses tankı veya hattında sıvı seviyesini izler. Dolum/drenaj vanaları, pompa interlock ve kontrol ünitesine (PLC/Röle) bağlıdır.';
  }

  if (p === 'SS') {
    if (n.includes('el koruma')) return 'Operatör elinin tehlikeli bölgeye girmesini algılar ve proses/hareket interlock sinyali üretir. Kontrol ünitesinin (PLC/Röle) güvenlik devresine bağlıdır.';
    if (n.includes('interlock') || n.includes('kilit')) return 'Kapak veya erişim noktası kilit/kapalı konumunu doğrular; güvenli olmayan durumda prosesi kilitleyen sinyal üretir. Kontrol ünitesinin (PLC/Röle) interlock devresine bağlıdır.';
    if (n.includes('ışın') || n.includes('isın') || n.includes('bariyer')) return 'Işın bariyeri kirişinin kesilmesini algılar ve acil durdurma/interlock sinyali üretir. Kontrol ünitesinin (PLC/Röle) güvenlik devresine bağlıdır.';
    if (n.includes('rfid')) return 'Kapak RFID etiketini okuyarak yetkili kapak/konum doğrulaması yapar. Kapak interlock ve kontrol ünitesinin (PLC/Röle) güvenlik devresine bağlıdır.';
    return 'Güvenlik veya erişim durumunu izler; interlock sinyali üretir. Kontrol ünitesinin (PLC/Röle) güvenlik devresine bağlıdır.';
  }

  if (p === 'PRS') {
    if (n.includes('sepet pozisyon')) return 'Sepetin proses pozisyonunda olup olmadığını algılar. Sepet tahrik, proses interlock ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('giriş')) return 'Konveyör girişinde parça varlığını algılar. Konveyör hattı, yükleme interlock ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('çıkış') || n.includes('cikis')) return 'Konveyör çıkışında parça varlığını algılar. Konveyör hattı, boşaltma interlock ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    return 'Ekipman veya parça pozisyonunu algılar. İlgili mekanik grup ve kontrol ünitesine (PLC/Röle) bağlıdır.';
  }

  if (p === 'SWB') return 'Saha aktüatör vanasının açık/kapalı konum geri bildirimini toplar ve kontrol ünitesine (PLC/Röle) iletir. İlgili aktüatör vanası, solenoid ve proses hattına bağlıdır.';

  if (p === 'SW') {
    if (n.includes('kapak açık') || n.includes('kapak acik')) return 'Kapak veya kapağın tam açık konumda olduğunu doğrular. Kapak pistonu/aktüatör ve kontrol ünitesinin (PLC/Röle) interlock devresine bağlıdır.';
    if (n.includes('kapak kapalı') || n.includes('kapak kapali')) return 'Kapak veya kapağın tam kapalı konumda olduğunu doğrular. Kapak interlock ve kontrol ünitesinin (PLC/Röle) güvenlik devresine bağlıdır.';
    if (n.includes('flow')) return 'Hat akışının mevcut olup olmadığını algılar. Proses pompası, hat vanaları ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('pozisyon')) return 'Mekanik ekipmanın hedef pozisyonda olduğunu doğrular. İlgili tahrik ünitesi ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    return 'Mekanik konum veya durum geri bildirimi sağlar. İlgili ekipman ve kontrol ünitesine (PLC/Röle) bağlıdır.';
  }

  if (p === 'PPS') {
    if (n.includes('lift')) return 'Proses tankı lift pistonunun açık, ara veya kapalı konumunu algılar. Lift piston vanası, tank mekanizması ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('yönlendirme') || n.includes('yonlendirme')) return 'Yönlendirme pistonunun açık/kapalı konumunu algılar. Piston vanası, proses akış yönlendirme hattı ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('tahliye')) return 'Hücre tahliye pistonunun konumunu algılar. Tahliye vanası, hücre drenaj hattı ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('kapak')) return 'Ana hücre kapak pistonunun açık/kapalı konumunu algılar. Kapak piston vanası, interlock ve kontrol ünitesinin (PLC/Röle) güvenlik devresine bağlıdır.';
    return 'Pnömatik piston konum geri bildirimi sağlar. Piston vanası, solenoid valf ve kontrol ünitesine (PLC/Röle) bağlıdır.';
  }

  if (p === 'TC') {
    if (n.includes('kurutma')) return 'Kurutma hattı hava sıcaklığını ölçer ve kontrol ünitesine (PLC/Röle) 4–20 mA sinyali iletir. Kurutma rezistansı, fan ve ısı kontrol devresine bağlıdır.';
    if (n.includes('hücre')) return 'Hücre içi proses ortam sıcaklığını ölçer. Kontrol ünitesinin (PLC/Röle) ısı kontrol devresine bağlıdır.';
    if (n.includes('proses tank')) return 'Proses tankı sıcaklığını ölçer ve ısı kontrol döngüsüne analog sinyal sağlar. Rezistans/ısıtma devresi ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    return 'Proses ortam sıcaklığını ölçer. Kontrol ünitesinin (PLC/Röle) ısı kontrol devresine bağlıdır.';
  }

  if (p === 'PS') {
    if (n.includes('vakum')) return 'Hücre içi vakum basıncını ölçer ve kontrol ünitesine (PLC/Röle) 4–20 mA sinyali iletir. Vakum pompası, emiş hattı ve proses kontrol devresine bağlıdır.';
    if (n.includes('su basın')) return 'Besleme su hattı basıncını izler. Su besleme vanası, basınç şalteri ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('hava basın')) return 'Pnömatik hava hattı basıncını izler. Hava regülatörü, basınç şalteri ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('proses pomp')) return 'Proses pompası çıkış basıncını ölçer; düşük basınçta pompa koruma sinyali üretir. Pompa, emiş hattı ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('şalter') || n.includes('salter')) return 'Hat basıncının eşik üstü/altı durumunu anahtarlayarak dijital sinyal üretir. Basınç hattı ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    return 'Proses hattı basıncını ölçer veya izler. İlgili hat, pompa/vana ve kontrol ünitesine (PLC/Röle) bağlıdır.';
  }

  if (p === 'PHS') return 'Proses sıvısının pH değerini ölçer ve dozaj/proses kontrolü için kontrol ünitesine (PLC/Röle) analog sinyal iletir. Dozaj pompası, karıştırma ve proses tankına bağlıdır.';

  if (p === 'CS') return 'Proses sıvısının iletkenlik değerini ölçer; konsantrasyon ve dozaj kontrolü için kontrol ünitesine (PLC/Röle) analog sinyal iletir. Proses tankı, dozaj ve yıkama hattına bağlıdır.';

  if (p === 'V') {
    if (n.includes('emiş')) return 'Emiş hattında akış yönlendirme ve izolasyon sağlar. Pompa emiş hattı, aktüatör, limit switch ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('drenaj') || n.includes('tahliye')) return 'Tank veya hücre drenaj/tahliye hattında sıvı akışını kontrol eder. Drenaj hattı, seviye sensörü ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('dolum')) return 'Proses tankına otomatik dolum akışını kontrol eder. Besleme hattı, seviye sensörü ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('kaskat')) return 'Tanklar arası kaskad dolum/aktarım akışını yönlendirir. Kaynak ve hedef tank, seviye sensörleri ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('geri dönüş') || n.includes('geri donus')) return 'Proses geri dönüş hattında akış yönlendirme sağlar. Proses pompası, filtre ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('kurutma')) return 'Kurutma hattı hava/akış yönlendirmesini kontrol eder. Kurutma fanı, ısıtıcı ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('by-pass') || n.includes('bypass')) return 'By-pass hattında akış yönlendirme ve filtre/devre izolasyonu sağlar. Ana proses hattı ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('nozzle') || n.includes('nozul')) return 'Ana yıkama nozul hattında sprey akışını açar/kapatır. Basma pompası, manifold ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('conta')) return 'Kapak/conta şişirme veya söndürme hattında pnömatik akışı kontrol eder. Kapak pistonu, basınç regülatörü ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('aç') || n.includes('ac ')) return 'İlgili tahliye veya piston vanasının açılma komutunu uygular. Pnömatik aktüatör, limit switch ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('kapat')) return 'İlgili tahliye veya piston vanasının kapanma komutunu uygular. Pnömatik aktüatör, limit switch ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    if (n.includes('ana valf')) return 'Ana proses akış yönlendirme vanasıdır; hat seçimi ve izolasyon sağlar. Ana proses hattı ve kontrol ünitesine (PLC/Röle) bağlıdır.';
    return 'Proses hattında akış yönlendirme, izolasyon veya kontrol sağlar. İlgili hat, aktüatör/solenoid ve kontrol ünitesine (PLC/Röle) bağlıdır.';
  }

  return `${name} proses devresinde tanımlı işlevi yerine getirir. İlgili hat, sensör/aktüatör ve kontrol ünitesine (PLC/Röle) bağlıdır.`;
}

function buildDescriptionEn(kod, nameEn, descTr) {
  const p = prefixOf(kod);
  const templates = {
    PE: `Provides liquid circulation or transfer in the process line for ${nameEn}. Connected to suction/discharge lines, related valves, sensors and motor control circuit.`,
    FE: `Regulates air flow for ${nameEn}. Connected to ducting, process line dampers/valves and motor protection circuit.`,
    VE: `Applies vibration for part separation and process efficiency (${nameEn}). Connected to vibration unit, mechanical assembly and motor control circuit.`,
    GE: `Provides mechanical drive motion for ${nameEn}. Connected to driven assembly, position/limit feedback and motor control circuit.`,
    R: `Provides heating for ${nameEn}. Connected to temperature sensor, SSR/contactor and control unit (PLC/relay).`,
    TD: `Powers ultrasonic cleaning generator set for ${nameEn}. Connected to transducer, process tank and control unit (PLC/relay).`,
    L: `Provides visual indication or lighting for ${nameEn}. Connected to supply and control unit (PLC/relay).`,
    LS: `Monitors liquid level for ${nameEn}. Connected to tank/line, fill/drain valves, pump interlock and control unit (PLC/relay).`,
    SS: `Monitors safety/access status for ${nameEn}. Connected to interlock circuit and safety circuit of the control unit (PLC/relay).`,
    PRS: `Detects equipment/part position for ${nameEn}. Connected to mechanical unit and control unit (PLC/relay).`,
    SWB: `Collects open/closed position feedback from field actuator for ${nameEn}. Connected to actuator valve, solenoid and control unit (PLC/relay).`,
    SW: `Provides mechanical position feedback for ${nameEn}. Connected to driven equipment and control unit (PLC/relay).`,
    PPS: `Provides pneumatic cylinder position feedback for ${nameEn}. Connected to cylinder valve, solenoid and control unit (PLC/relay).`,
    TC: `Measures process temperature for ${nameEn}. Connected to control unit (PLC/relay) and heat control circuit.`,
    PS: `Measures or monitors process pressure for ${nameEn}. Connected to line, pump/valve and control unit (PLC/relay).`,
    PHS: `Measures process pH for ${nameEn}. Connected to dosing/process tank and control unit (PLC/relay).`,
    CS: `Measures process conductivity for ${nameEn}. Connected to process tank, dosing line and control unit (PLC/relay).`,
    V: `Controls flow routing or isolation for ${nameEn}. Connected to process line, actuator/solenoid and control unit (PLC/relay).`
  };
  if (templates[p]) return templates[p];
  return translateDesc(descTr, EN_DESC_RULES) || `${nameEn} performs its defined function in the process circuit. Connected to related line, sensor/actuator and control unit (PLC/relay).`;
}

function buildDescriptionDe(kod, nameDe, descTr) {
  const p = prefixOf(kod);
  const templates = {
    PE: `Gewährleistet Flüssigkeitszirkulation oder -transfer in der Prozessleitung für ${nameDe}. Angeschlossen an Saug-/Druckleitungen, Ventile, Sensoren und Motorsteuerkreis.`,
    FE: `Regelt den Luftstrom für ${nameDe}. Angeschlossen an Kanal, Prozessleitung, Klappen/Ventile und Motorschutz.`,
    VE: `Erzeugt Vibration für Teiletrennung und Prozesseffizienz (${nameDe}). Angeschlossen an Vibrationsaggregat, Mechanik und Motorsteuerkreis.`,
    GE: `Erzeugt mechanische Antriebsbewegung für ${nameDe}. Angeschlossen an angetriebenes Aggregat, Positionsrückmeldung und Motorsteuerkreis.`,
    R: `Erzeugt Heizung für ${nameDe}. Angeschlossen an Temperatursensor, SSR/Schütz und Steuereinheit (SPS/Relais).`,
    TD: `Versorgt den Ultraschall-Reinigungsgenerator für ${nameDe}. Angeschlossen an Wandler, Prozesstank und Steuereinheit (SPS/Relais).`,
    L: `Dient der Signalisierung oder Beleuchtung für ${nameDe}. Angeschlossen an Versorgung und Steuerkreis.`,
    LS: `Überwacht den Flüssigkeitsstand für ${nameDe}. Angeschlossen an Tank/Leitung, Füll-/Ablaufventile, Pumpenverriegelung und Steuereinheit (SPS/Relais).`,
    SS: `Überwacht Sicherheits-/Zugangsstatus für ${nameDe}. Angeschlossen an Verriegelungskreis und Sicherheitskreis der Steuereinheit (SPS/Relais).`,
    PRS: `Erkennt Anlagen-/Teileposition für ${nameDe}. Angeschlossen an Mechanik und Steuereinheit (SPS/Relais).`,
    SWB: `Erfasst Offen/Geschlossen-Rückmeldung des Feldstellantriebs für ${nameDe}. Angeschlossen an Stellventil, Magnetventil und Steuereinheit (SPS/Relais).`,
    SW: `Liefert mechanische Positionsrückmeldung für ${nameDe}. Angeschlossen an Aggregat und Steuereinheit (SPS/Relais).`,
    PPS: `Liefert Pneumatikzylinder-Positionsrückmeldung für ${nameDe}. Angeschlossen an Zylinderventil, Magnetventil und Steuereinheit (SPS/Relais).`,
    TC: `Misst Prozesstemperatur für ${nameDe}. Angeschlossen an Steuereinheit (SPS/Relais) und Wärmeregelkreis.`,
    PS: `Misst oder überwacht Prozessdruck für ${nameDe}. Angeschlossen an Leitung, Pumpe/Ventil und Steuereinheit (SPS/Relais).`,
    PHS: `Misst Prozess-pH für ${nameDe}. Angeschlossen an Dosierung/Prozesstank und Steuereinheit (SPS/Relais).`,
    CS: `Misst Prozessleitfähigkeit für ${nameDe}. Angeschlossen an Prozesstank, Dosierleitung und Steuereinheit (SPS/Relais).`,
    V: `Steuert Strömungsführung oder Absperrung für ${nameDe}. Angeschlossen an Prozessleitung, Stellantrieb/Magnetventil und Steuereinheit (SPS/Relais).`
  };
  if (templates[p]) return templates[p];
  return translateDesc(descTr, DE_DESC_RULES) || `${nameDe} erfüllt seine definierte Funktion im Prozesskreis. Angeschlossen an Leitung, Sensor/Stellantrieb und Steuereinheit (SPS/Relais).`;
}

// --- read source ---
const raw = readKodCsvText(SOURCE_PATH);
const delimiter = detectCsvDelimiter(raw.split(/\r?\n/)[0]);
const lines = raw.split(/\r?\n/).filter(l => l.trim());

const rows = [];
for (let i = 1; i < lines.length; i += 1) {
  const cells = parseCsvLine(lines[i], delimiter);
  const kod = cells[0]?.trim();
  if (!kod) continue;
  const nameTr = cells[1]?.trim() || kod;
  rows.push({ kod, nameTr });
}

const trRows = [];
const enRows = [];
const deRows = [];

for (const { kod, nameTr } of rows) {
  const nameEn = translateName(nameTr, EN_NAME_RULES);
  const nameDe = translateName(nameTr, DE_NAME_RULES);
  const descTr = overrideDescription(kod, 'tr') || buildDescriptionTr(kod, nameTr);
  const descEn = overrideDescription(kod, 'en') || buildDescriptionEn(kod, nameEn, descTr);
  const descDe = overrideDescription(kod, 'de') || buildDescriptionDe(kod, nameDe, descTr);

  trRows.push([kod, nameTr, descTr]);
  enRows.push([kod, nameEn, descEn]);
  deRows.push([kod, nameDe, descDe]);
}

writeCsv(path.join(DATA_DIR, 'kod.csv'), 'KOD;BİLEŞEN ADI;AÇIKLAMA', trRows);
writeCsv(path.join(DATA_DIR, 'kod-en.csv'), 'KOD;COMPONENT NAME;DESCRIPTION', enRows);
writeCsv(path.join(DATA_DIR, 'kod-de.csv'), 'KOD;KOMPONENTENNAME;BESCHREIBUNG', deRows);

console.log(`Generated ${trRows.length} rows -> kod.csv, kod-en.csv, kod-de.csv`);
