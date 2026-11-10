/* Çizim mantığı: bileşenleri ve bağlantıları tanır, sözel açıklama ve güvenlik fonksiyonu üretir.
   DOM'a bağlı değildir; ekran, PDF ve Node testleri aynı kodu kullanır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./symbols.js'), require('./model.js'));
  } else {
    root.PidLogic = factory(root.PidSymbols, root.PidModel);
  }
})(typeof self !== 'undefined' ? self : this, function (Sym, Model) {
  'use strict';

  const TEXT = {
    tr: {
      and: 've',
      titles: { components: 'Bileşen Listesi', logic: 'Bağlantı Mantığı', safety: 'Güvenlik Fonksiyonları', docType: 'Açıklama Sayfası' },
      intros: {
        components: 'Çizimde kullanılan bileşenler, kodları ve görevleri aşağıda listelenmiştir.',
        logic: 'Çizimdeki bağlantıların ve kilitlemelerin sözel açıklaması aşağıdadır.',
        safety: 'Makine ve operatör güvenliğini sağlayan fonksiyonlar aşağıda ayrıca belirtilmiştir.'
      },
      continued: ' (devam)',
      columns: {
        code: 'Kod', symbol: 'Sembol', name: 'Bileşen', purpose: 'Ne İşe Yarar', links: 'Bağlantıları', sheet: 'Sayfa',
        qty: 'Adet', route: 'Bağlantı', type: 'Tür', text: 'Açıklama', no: 'No', fn: 'Güvenlik Fonksiyonu',
        trigger: 'Tetikleyen', affected: 'Etkilenen Ekipman', logic: 'Güvenlik Mantığı'
      },
      types: { interlock: 'Interlock', control: 'Kontrol', monitor: 'İzleme', feedback: 'Geri Bildirim', mech: 'Mekanik', signal: 'Sinyal' },
      optional: 'Opsiyon',
      noCode: '—',
      conditions: {
        levelLow: (loc) => (loc ? `${loc} içinde su yokken` : 'Tankta su yokken'),
        levelHigh: (loc) => (loc ? `${loc} içinde seviye üst sınıra ulaştığında` : 'Tankta seviye üst sınıra ulaştığında'),
        levelMid: (loc) => (loc ? `${loc} içinde seviye orta sınırın altındayken` : 'Tankta seviye orta sınırın altındayken'),
        tempHigh: (loc) => (loc ? `${loc} sıcaklığı ayar değerine ulaştığında` : 'Sıcaklık ayar değerine ulaştığında'),
        airLow: () => 'Hava basıncı yetersizken',
        waterLow: () => 'Su basıncı yetersizken',
        vacuum: () => 'Vakum ayar değerinde değilken',
        pressure: () => 'Basınç ayar aralığı dışındayken',
        flow: () => 'Akış yokken',
        doorOpen: (loc) => (loc ? `${loc} kapağı açıkken` : 'Kapak açıkken'),
        position: () => 'Konum doğrulanmadan',
        hand: () => 'El veya cisim algılandığında',
        curtain: () => 'Işın bariyeri kesildiğinde',
        lock: () => 'Proses çevrimi sürerken',
        rfid: () => 'Kapak RFID doğrulaması bozulduğunda',
        estop: () => 'Acil stop basıldığında',
        overload: () => 'Motor koruması (termik) attığında',
        electric: () => 'Sigorta attığında'
      },
      effects: {
        block: (cond, list) => `${cond} ${list} çalışmaz.`,
        stop: (cond, list) => `${cond} ${list} durur.`,
        open: (cond, list) => `${cond} ${list} açılır.`,
        close: (cond, list) => `${cond} ${list} kapanır.`,
        control: (s, list) => `${s} sinyali ${list} kontrolünde kullanılır.`,
        feedback: (s, list) => `${s}, ${list} konumunu bildirir.`
      },
      dryRun: {
        pump: 'pompanın kuru çalışması',
        heater: 'rezistansın susuz yanması',
        ultrasonic: 'ultrasonik jeneratörün susuz çalışması',
        build: (list) => `${list.charAt(0).toLocaleUpperCase('tr')}${list.slice(1)} önlenir.`
      },
      reasons: {
        fill: 'Tanka su alınır.',
        overflow: 'Tankın taşması önlenir.',
        overTemp: 'Aşırı ısınma önlenir.',
        airPressure: 'Yetersiz hava basıncıyla hatalı hareket önlenir.',
        pressure: 'Hat ve pompa hatalı basınçtan korunur.',
        flow: 'Akışsız çalışma ve ısınma önlenir.',
        doorGuard: 'Operatörün makine çalışırken tehlikeli bölgeye erişmesi önlenir.',
        hand: 'Ezilme riski önlenir.',
        curtain: 'Kapanma bölgesinde ezilme riski önlenir.',
        lock: 'Çevrim sırasında kapağın açılması önlenir.',
        rfid: 'Kapak doğrulanmadan çalışma önlenir.',
        estop: 'Makine güvenli duruma geçer.',
        overload: 'Motor aşırı akımdan korunur.',
        electric: 'Devre aşırı akım ve kaçak akımdan korunur.',
        safetyValve: 'Hat basıncı ayar değerini aştığında emniyet vanası açılır; aşırı basınç önlenir.'
      },
      functions: {
        estop: 'Acil durdurma',
        doorGuard: 'Kapak / erişim güvenliği',
        hand: 'El koruma (ezilme önleme)',
        curtain: 'Işın bariyeri koruması',
        lock: 'Çevrim kilidi',
        rfid: 'RFID kapak doğrulama',
        dryRun: 'Kuru çalışma koruması',
        overflow: 'Taşma koruması',
        overTemp: 'Aşırı sıcaklık koruması',
        airPressure: 'Hava basıncı koruması',
        pressure: 'Basınç koruması',
        flow: 'Akış koruması',
        overload: 'Motor aşırı akım koruması',
        electric: 'Elektriksel koruma',
        safetyValve: 'Aşırı basınç koruması (mekanik)'
      },
      unconnected: (fn) => `${fn}: sensör çizimde var, henüz bir ekipmana bağlanmadı.`,
      monitor: {
        level: (s, loc) => `${s}, ${loc} içindeki seviyeyi izler.`,
        temp: (s, loc) => `${s}, ${loc} sıcaklığını ölçer.`,
        pressure: (s, loc) => `${s}, ${loc} üzerinde basıncı ölçer.`,
        flow: (s, loc) => `${s}, ${loc} üzerinde akışı izler.`,
        analytic: (s, loc) => `${s}, ${loc} içindeki sıvı kalitesini ölçer.`,
        door: (s, loc) => `${s}, ${loc} kapağının durumunu bildirir.`,
        position: (s, loc) => `${s}, ${loc} konumunu bildirir.`,
        hand: (s, loc) => `${s}, ${loc} bölgesinde el veya cisim algılar.`,
        curtain: (s, loc) => `${s}, ${loc} bölgesinde ışın kesilmesini algılar.`,
        lock: (s, loc) => `${s}, proses çevrimi sırasında ${loc} kapağını kilitli tutar.`,
        rfid: (s, loc) => `${s}, ${loc} kapağının kapalı olduğunu RFID ile doğrular.`,
        generic: (s, loc) => `${s}, ${loc} ile bağlantılıdır.`,
        display: (s, loc) => `${s} değeri ${loc} üzerinde gösterilir.`
      },
      flow: {
        medium: { process: 'proses sıvısı', utility: 'su', duct: 'hava', air: 'basınçlı hava' },
        sentence: (drivers, opens, medium, src, dst) => {
          const parts = [];
          if (drivers) parts.push(`${drivers} çalışınca`);
          if (opens) parts.push(`${opens} açıkken`);
          const text = `${medium} ${src} → ${dst} yönünde akar.`;
          return parts.length ? `${parts.join(' ve ')} ${text}` : `${text.charAt(0).toLocaleUpperCase('tr')}${text.slice(1)}`;
        },
        filter: (list) => `${list} üzerinden geçer.`,
        check: (list) => `${list} geri akışı önler.`,
        manual: (list) => `${list} ile elle kesilebilir.`,
        heat: (list) => `${list} akışı ısıtır.`,
        dose: (list) => `${list} suya ayarlı oranda kimyasal katar.`
      },
      mech: (a, b) => `${a}, ${b} tahrikini sağlar.`,
      mechGeneric: (a, b) => `${a} ile ${b} mekanik olarak bağlıdır.`,
      signalGeneric: (a, b) => `${a} ile ${b} arasında sinyal bağlantısı vardır.`,
      free: 'boşta',
      purposes: {
        pump: 'Sıvıyı hat boyunca basar ve sirkülasyonu sağlar.',
        fan: 'Hava akışını sağlar.',
        drive: 'Bağlı olduğu mekanizmayı tahrik eder.',
        conveyor: 'Parçaları hat boyunca taşır.',
        skimmer: 'Sıvı yüzeyindeki yağı ayırır.',
        heater: 'Sıvıyı veya havayı ayarlanan sıcaklığa ısıtır.',
        ultrasonic: 'Ultrasonik temizleme için titreşim üretir.',
        valve: 'Kontrol ünitesinin (PLC/Röle) komutuyla hattaki akışı açar veya kapatır.',
        cylinder: 'Basınçlı havayla doğrusal hareket üretir.',
        tank: 'Proses sıvısını depolar.',
        cell: 'Yıkama, durulama veya kurutma işleminin yapıldığı kapalı alandır.',
        basket: 'Yıkanan parçaları taşır.',
        boundary: 'Birlikte teslim edilen ekipman grubunu gösterir.',
        level: 'Tanktaki sıvı seviyesini izler.',
        temp: 'Sıcaklığı ölçer ve kontrol döngüsüne sinyal verir.',
        pressure: 'Hat basıncını izler.',
        flow: 'Hattaki akışı izler.',
        door: 'Kapağın durumunu bildirir.',
        position: 'Konum geri bildirimi verir.',
        hand: 'Tehlikeli bölgede el veya cisim algılar.',
        curtain: 'Kapanma bölgesinde ışın kesilmesini algılar.',
        lock: 'Proses çevrimi sırasında kapağı kilitli tutar.',
        rfid: 'Kapağın kapalı olduğunu RFID ile doğrular.',
        estop: 'Makineyi acil durumda güvenli şekilde durdurur.',
        overload: 'Motoru aşırı akıma karşı korur.',
        electric: 'Devreyi aşırı akım ve kaçak akıma karşı korur.',
        analytic: 'Sıvı kalitesini ölçer.',
        encoder: 'Dönüş ve pozisyon bilgisini ölçer.',
        button: 'Operatör komutu verir.',
        generic: 'Saha sinyali verir.',
        interlock: 'Giriş sinyallerine göre ekipmanı kilitler.',
        plc: 'PLC yazılımındaki kontrol fonksiyonunu gösterir.',
        display: 'Değerleri ve durumları gösterir.',
        lamp: 'Durum uyarısı verir.',
        manualValve: 'Hattaki akışı elle açar, kapatır veya ayarlar.',
        check: 'Geri akışı önler.',
        safetyValve: 'Aşırı basınçta açılarak hattı korur.',
        regulator: 'Hat basıncını ayarlanan değerde tutar.',
        filter: 'Sıvıdaki partikülleri tutar.',
        strainer: 'Hattaki iri parçaları tutar.',
        dosatron: 'Su akışıyla çalışır, elektrik gerektirmez; kimyasalı suya ayarlı oranda katar.',
        nozzle: 'Sıvıyı parçaların üzerine püskürtür.',
        spray: 'Sıvıyı nozullara dağıtır ve parçaların üzerine püskürtür.',
        hx: 'Akışkanlar arasında ısı transferi sağlar.',
        frl: 'Basınçlı havayı filtreler ve basıncını ayarlar.',
        silencer: 'Hava tahliye gürültüsünü azaltır.',
        fitting: 'Hat bağlantısını sağlar.',
        terminalIn: 'Hattın sisteme giriş noktasını gösterir.',
        terminalOut: 'Hattın sistemden çıkış noktasını gösterir.',
        offpage: 'Hattın başka sayfada devam ettiğini gösterir.'
      }
    },
    en: {
      and: 'and',
      titles: { components: 'Component List', logic: 'Connection Logic', safety: 'Safety Functions', docType: 'Description Sheet' },
      intros: {
        components: 'The components used in the drawing, with their codes and duties, are listed below.',
        logic: 'The connections and interlocks in the drawing are explained in plain language below.',
        safety: 'The functions that protect the machine and the operator are listed separately below.'
      },
      continued: ' (continued)',
      columns: {
        code: 'Code', symbol: 'Symbol', name: 'Component', purpose: 'Purpose', links: 'Connections', sheet: 'Sheet',
        qty: 'Qty', route: 'Connection', type: 'Type', text: 'Description', no: 'No.', fn: 'Safety Function',
        trigger: 'Trigger', affected: 'Affected Equipment', logic: 'Safety Logic'
      },
      types: { interlock: 'Interlock', control: 'Control', monitor: 'Monitoring', feedback: 'Feedback', mech: 'Mechanical', signal: 'Signal' },
      optional: 'Optional',
      noCode: '—',
      conditions: {
        levelLow: (loc) => (loc ? `When there is no liquid in ${loc}` : 'When there is no liquid in the tank'),
        levelHigh: (loc) => (loc ? `When the level in ${loc} reaches the upper limit` : 'When the tank level reaches the upper limit'),
        levelMid: (loc) => (loc ? `While the level in ${loc} is below the middle limit` : 'While the tank level is below the middle limit'),
        tempHigh: (loc) => (loc ? `When the temperature of ${loc} reaches the set value` : 'When the temperature reaches the set value'),
        airLow: () => 'While the air pressure is too low',
        waterLow: () => 'While the water pressure is too low',
        vacuum: () => 'While the vacuum is not at the set value',
        pressure: () => 'While the pressure is outside the set range',
        flow: () => 'While there is no flow',
        doorOpen: (loc) => (loc ? `While the door of ${loc} is open` : 'While the door is open'),
        position: () => 'Until the position is confirmed',
        hand: () => 'When a hand or object is detected',
        curtain: () => 'When the light curtain is interrupted',
        lock: () => 'While the process cycle is running',
        rfid: () => 'When the RFID door verification is lost',
        estop: () => 'When the emergency stop is pressed',
        overload: () => 'When the motor protection trips',
        electric: () => 'When the fuse trips'
      },
      effects: {
        block: (cond, list) => `${cond}, ${list} will not run.`,
        stop: (cond, list) => `${cond}, ${list} will stop.`,
        open: (cond, list) => `${cond}, ${list} will open.`,
        close: (cond, list) => `${cond}, ${list} will close.`,
        control: (s, list) => `The signal from ${s} is used to control ${list}.`,
        feedback: (s, list) => `${s} reports the position of ${list}.`
      },
      dryRun: {
        pump: 'the pump running dry',
        heater: 'the heater burning out without liquid',
        ultrasonic: 'the ultrasonic generator running without liquid',
        build: (list) => `This prevents ${list}.`
      },
      reasons: {
        fill: 'The tank is filled with water.',
        overflow: 'This prevents the tank from overflowing.',
        overTemp: 'This prevents overheating.',
        airPressure: 'This prevents incorrect movements caused by low air pressure.',
        pressure: 'This protects the line and the pump from incorrect pressure.',
        flow: 'This prevents operation and overheating without flow.',
        doorGuard: 'This prevents access to the hazardous area while the machine is running.',
        hand: 'This prevents crushing injuries.',
        curtain: 'This prevents crushing injuries in the closing area.',
        lock: 'This prevents the door from being opened during the cycle.',
        rfid: 'This prevents operation without door verification.',
        estop: 'The machine goes into a safe state.',
        overload: 'This protects the motor from overcurrent.',
        electric: 'This protects the circuit from overcurrent and leakage current.',
        safetyValve: 'The safety valve opens when the line pressure exceeds the set value, preventing overpressure.'
      },
      functions: {
        estop: 'Emergency stop',
        doorGuard: 'Door / access guarding',
        hand: 'Hand protection (anti-crush)',
        curtain: 'Light curtain protection',
        lock: 'Process cycle lock',
        rfid: 'RFID door verification',
        dryRun: 'Dry-run protection',
        overflow: 'Overflow protection',
        overTemp: 'Over-temperature protection',
        airPressure: 'Air pressure protection',
        pressure: 'Pressure protection',
        flow: 'Flow protection',
        overload: 'Motor overload protection',
        electric: 'Electrical protection',
        safetyValve: 'Overpressure protection (mechanical)'
      },
      unconnected: (fn) => `${fn}: the sensor is in the drawing but not connected to any equipment yet.`,
      monitor: {
        level: (s, loc) => `${s} monitors the level in ${loc}.`,
        temp: (s, loc) => `${s} measures the temperature of ${loc}.`,
        pressure: (s, loc) => `${s} measures the pressure at ${loc}.`,
        flow: (s, loc) => `${s} monitors the flow at ${loc}.`,
        analytic: (s, loc) => `${s} measures the liquid quality in ${loc}.`,
        door: (s, loc) => `${s} reports the door status of ${loc}.`,
        position: (s, loc) => `${s} reports the position of ${loc}.`,
        hand: (s, loc) => `${s} detects a hand or object in the area of ${loc}.`,
        curtain: (s, loc) => `${s} detects interruptions of the light curtain at ${loc}.`,
        lock: (s, loc) => `${s} keeps the door of ${loc} locked during the process cycle.`,
        rfid: (s, loc) => `${s} verifies by RFID that the door of ${loc} is closed.`,
        generic: (s, loc) => `${s} is connected to ${loc}.`,
        display: (s, loc) => `The value of ${s} is shown on ${loc}.`
      },
      flow: {
        medium: { process: 'process liquid', utility: 'water', duct: 'air', air: 'compressed air' },
        sentence: (drivers, opens, medium, src, dst) => {
          const parts = [];
          if (drivers) parts.push(`${drivers} runs`);
          if (opens) parts.push(`${opens} is open`);
          const text = `${medium} flows from ${src} to ${dst}.`;
          return parts.length ? `When ${parts.join(' and ')}, ${text}` : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
        },
        filter: (list) => `It passes through ${list}.`,
        check: (list) => `${list} prevents backflow.`,
        manual: (list) => `It can be shut off manually with ${list}.`,
        heat: (list) => `${list} heats the flow.`,
        dose: (list) => `${list} adds chemical to the water at the set ratio.`
      },
      mech: (a, b) => `${a} drives ${b}.`,
      mechGeneric: (a, b) => `${a} and ${b} are mechanically linked.`,
      signalGeneric: (a, b) => `There is a signal connection between ${a} and ${b}.`,
      free: 'open end',
      purposes: {
        pump: 'Pumps the liquid along the line and provides circulation.',
        fan: 'Provides air flow.',
        drive: 'Drives the connected mechanism.',
        conveyor: 'Transports parts along the line.',
        skimmer: 'Removes oil from the liquid surface.',
        heater: 'Heats the liquid or air to the set temperature.',
        ultrasonic: 'Generates vibration for ultrasonic cleaning.',
        valve: 'Opens or closes the flow on command from the control unit (PLC/relay).',
        cylinder: 'Produces linear movement with compressed air.',
        tank: 'Stores the process liquid.',
        cell: 'Enclosed area where washing, rinsing or drying takes place.',
        basket: 'Carries the parts being washed.',
        boundary: 'Marks a group of equipment delivered together.',
        level: 'Monitors the liquid level in the tank.',
        temp: 'Measures the temperature and sends a signal to the control loop.',
        pressure: 'Monitors the line pressure.',
        flow: 'Monitors the flow in the line.',
        door: 'Reports the door status.',
        position: 'Provides position feedback.',
        hand: 'Detects a hand or object in the hazardous area.',
        curtain: 'Detects interruptions of the light curtain in the closing area.',
        lock: 'Keeps the door locked during the process cycle.',
        rfid: 'Verifies by RFID that the door is closed.',
        estop: 'Stops the machine safely in an emergency.',
        overload: 'Protects the motor against overcurrent.',
        electric: 'Protects the circuit against overcurrent and leakage current.',
        analytic: 'Measures the liquid quality.',
        encoder: 'Measures rotation and position.',
        button: 'Gives an operator command.',
        generic: 'Provides a field signal.',
        interlock: 'Locks equipment according to its input signals.',
        plc: 'Shows a control function in the PLC software.',
        display: 'Shows values and states.',
        lamp: 'Gives a status warning.',
        manualValve: 'Opens, closes or adjusts the flow by hand.',
        check: 'Prevents backflow.',
        safetyValve: 'Opens at overpressure to protect the line.',
        regulator: 'Keeps the line pressure at the set value.',
        filter: 'Retains particles in the liquid.',
        strainer: 'Retains coarse particles in the line.',
        dosatron: 'Driven by the water flow, needs no power; adds chemical to the water at the set ratio.',
        nozzle: 'Sprays the liquid onto the parts.',
        spray: 'Distributes the liquid to the nozzles and sprays it onto the parts.',
        hx: 'Transfers heat between fluids.',
        frl: 'Filters the compressed air and regulates its pressure.',
        silencer: 'Reduces exhaust air noise.',
        fitting: 'Provides the line connection.',
        terminalIn: 'Marks where the line enters the system.',
        terminalOut: 'Marks where the line leaves the system.',
        offpage: 'Shows that the line continues on another sheet.'
      }
    },
    de: {
      and: 'und',
      titles: { components: 'Komponentenliste', logic: 'Verbindungslogik', safety: 'Sicherheitsfunktionen', docType: 'Erläuterungsblatt' },
      intros: {
        components: 'Die in der Zeichnung verwendeten Komponenten mit Code und Aufgabe sind unten aufgeführt.',
        logic: 'Die Verbindungen und Verriegelungen der Zeichnung werden unten in Worten erläutert.',
        safety: 'Die Funktionen zum Schutz von Maschine und Bediener sind unten gesondert aufgeführt.'
      },
      continued: ' (Fortsetzung)',
      columns: {
        code: 'Code', symbol: 'Symbol', name: 'Komponente', purpose: 'Aufgabe', links: 'Verbindungen', sheet: 'Blatt',
        qty: 'Anz.', route: 'Verbindung', type: 'Art', text: 'Beschreibung', no: 'Nr.', fn: 'Sicherheitsfunktion',
        trigger: 'Auslöser', affected: 'Betroffene Ausrüstung', logic: 'Sicherheitslogik'
      },
      types: { interlock: 'Verriegelung', control: 'Steuerung', monitor: 'Überwachung', feedback: 'Rückmeldung', mech: 'Mechanisch', signal: 'Signal' },
      optional: 'Option',
      noCode: '—',
      conditions: {
        levelLow: (loc) => (loc ? `Wenn in ${loc} keine Flüssigkeit vorhanden ist` : 'Wenn im Tank keine Flüssigkeit vorhanden ist'),
        levelHigh: (loc) => (loc ? `Wenn der Füllstand in ${loc} die Obergrenze erreicht` : 'Wenn der Tankfüllstand die Obergrenze erreicht'),
        levelMid: (loc) => (loc ? `Solange der Füllstand in ${loc} unter der mittleren Grenze liegt` : 'Solange der Tankfüllstand unter der mittleren Grenze liegt'),
        tempHigh: (loc) => (loc ? `Wenn die Temperatur von ${loc} den Sollwert erreicht` : 'Wenn die Temperatur den Sollwert erreicht'),
        airLow: () => 'Solange der Luftdruck zu niedrig ist',
        waterLow: () => 'Solange der Wasserdruck zu niedrig ist',
        vacuum: () => 'Solange das Vakuum nicht den Sollwert hat',
        pressure: () => 'Solange der Druck außerhalb des Sollbereichs liegt',
        flow: () => 'Solange kein Durchfluss vorhanden ist',
        doorOpen: (loc) => (loc ? `Solange der Deckel von ${loc} offen ist` : 'Solange der Deckel offen ist'),
        position: () => 'Solange die Position nicht bestätigt ist',
        hand: () => 'Wenn eine Hand oder ein Gegenstand erkannt wird',
        curtain: () => 'Wenn der Lichtvorhang unterbrochen wird',
        lock: () => 'Während des Prozesszyklus',
        rfid: () => 'Wenn die RFID-Deckelprüfung ausfällt',
        estop: () => 'Wenn der Not-Halt betätigt wird',
        overload: () => 'Wenn der Motorschutz auslöst',
        electric: () => 'Wenn die Sicherung auslöst'
      },
      effects: {
        block: (cond, list, plural) => `${cond}, ${plural ? 'laufen' : 'läuft'} ${list} nicht.`,
        stop: (cond, list, plural) => `${cond}, ${plural ? 'stoppen' : 'stoppt'} ${list}.`,
        open: (cond, list, plural) => `${cond}, ${plural ? 'öffnen' : 'öffnet'} ${list}.`,
        close: (cond, list, plural) => `${cond}, ${plural ? 'schließen' : 'schließt'} ${list}.`,
        control: (s, list) => `Das Signal von ${s} dient zur Steuerung von ${list}.`,
        feedback: (s, list) => `${s} meldet die Position von ${list}.`
      },
      dryRun: {
        pump: 'den Trockenlauf der Pumpe',
        heater: 'das Durchbrennen des Heizwiderstands ohne Flüssigkeit',
        ultrasonic: 'den Betrieb des Ultraschallgenerators ohne Flüssigkeit',
        build: (list) => `Das verhindert ${list}.`
      },
      reasons: {
        fill: 'Der Tank wird mit Wasser gefüllt.',
        overflow: 'Das verhindert ein Überlaufen des Tanks.',
        overTemp: 'Das verhindert eine Überhitzung.',
        airPressure: 'Das verhindert Fehlbewegungen durch zu niedrigen Luftdruck.',
        pressure: 'Das schützt Leitung und Pumpe vor falschem Druck.',
        flow: 'Das verhindert Betrieb und Überhitzung ohne Durchfluss.',
        doorGuard: 'Das verhindert den Zugang zum Gefahrenbereich bei laufender Maschine.',
        hand: 'Das verhindert Quetschverletzungen.',
        curtain: 'Das verhindert Quetschverletzungen im Schließbereich.',
        lock: 'Das verhindert das Öffnen des Deckels während des Zyklus.',
        rfid: 'Das verhindert den Betrieb ohne Deckelprüfung.',
        estop: 'Die Maschine geht in einen sicheren Zustand.',
        overload: 'Das schützt den Motor vor Überstrom.',
        electric: 'Das schützt den Stromkreis vor Überstrom und Fehlerstrom.',
        safetyValve: 'Das Sicherheitsventil öffnet, wenn der Leitungsdruck den Sollwert überschreitet, und verhindert Überdruck.'
      },
      functions: {
        estop: 'Not-Halt',
        doorGuard: 'Deckel- / Zugangsüberwachung',
        hand: 'Handschutz (Quetschschutz)',
        curtain: 'Lichtvorhangschutz',
        lock: 'Prozessverriegelung',
        rfid: 'RFID-Deckelprüfung',
        dryRun: 'Trockenlaufschutz',
        overflow: 'Überlaufschutz',
        overTemp: 'Übertemperaturschutz',
        airPressure: 'Luftdrucküberwachung',
        pressure: 'Drucküberwachung',
        flow: 'Durchflussüberwachung',
        overload: 'Motorüberlastschutz',
        electric: 'Elektrischer Schutz',
        safetyValve: 'Überdruckschutz (mechanisch)'
      },
      unconnected: (fn) => `${fn}: Der Sensor ist in der Zeichnung vorhanden, aber noch mit keiner Ausrüstung verbunden.`,
      monitor: {
        level: (s, loc) => `${s} überwacht den Füllstand in ${loc}.`,
        temp: (s, loc) => `${s} misst die Temperatur von ${loc}.`,
        pressure: (s, loc) => `${s} misst den Druck an ${loc}.`,
        flow: (s, loc) => `${s} überwacht den Durchfluss an ${loc}.`,
        analytic: (s, loc) => `${s} misst die Flüssigkeitsqualität in ${loc}.`,
        door: (s, loc) => `${s} meldet den Deckelzustand von ${loc}.`,
        position: (s, loc) => `${s} meldet die Position von ${loc}.`,
        hand: (s, loc) => `${s} erkennt eine Hand oder einen Gegenstand im Bereich von ${loc}.`,
        curtain: (s, loc) => `${s} erkennt Unterbrechungen des Lichtvorhangs an ${loc}.`,
        lock: (s, loc) => `${s} hält den Deckel von ${loc} während des Prozesszyklus verriegelt.`,
        rfid: (s, loc) => `${s} prüft per RFID, ob der Deckel von ${loc} geschlossen ist.`,
        generic: (s, loc) => `${s} ist mit ${loc} verbunden.`,
        display: (s, loc) => `Der Wert von ${s} wird auf ${loc} angezeigt.`
      },
      flow: {
        medium: { process: 'Prozessflüssigkeit', utility: 'Wasser', duct: 'Luft', air: 'Druckluft' },
        sentence: (drivers, opens, medium, src, dst, plural) => {
          const parts = [];
          if (drivers) parts.push(`${drivers} ${plural ? 'laufen' : 'läuft'}`);
          if (opens) parts.push(`${opens} geöffnet ist`);
          return parts.length
            ? `Wenn ${parts.join(' und ')}, fließt ${medium} von ${src} zu ${dst}.`
            : `${medium} fließt von ${src} zu ${dst}.`;
        },
        filter: (list) => `Der Durchfluss führt über ${list}.`,
        check: (list) => `${list} verhindert Rückfluss.`,
        manual: (list) => `Er kann mit ${list} von Hand abgesperrt werden.`,
        heat: (list) => `${list} erwärmt den Durchfluss.`,
        dose: (list) => `${list} dosiert dem Wasser Chemikalie im eingestellten Verhältnis zu.`
      },
      mech: (a, b) => `${a} treibt ${b} an.`,
      mechGeneric: (a, b) => `${a} und ${b} sind mechanisch verbunden.`,
      signalGeneric: (a, b) => `Zwischen ${a} und ${b} besteht eine Signalverbindung.`,
      free: 'offenes Ende',
      purposes: {
        pump: 'Fördert die Flüssigkeit durch die Leitung und sorgt für die Umwälzung.',
        fan: 'Erzeugt den Luftstrom.',
        drive: 'Treibt den angeschlossenen Mechanismus an.',
        conveyor: 'Transportiert Teile entlang der Linie.',
        skimmer: 'Trennt Öl von der Flüssigkeitsoberfläche.',
        heater: 'Erwärmt Flüssigkeit oder Luft auf die Solltemperatur.',
        ultrasonic: 'Erzeugt Schwingungen für die Ultraschallreinigung.',
        valve: 'Öffnet oder schließt den Durchfluss auf Befehl der Steuereinheit (SPS/Relais).',
        cylinder: 'Erzeugt mit Druckluft eine lineare Bewegung.',
        tank: 'Speichert die Prozessflüssigkeit.',
        cell: 'Geschlossener Bereich zum Waschen, Spülen oder Trocknen.',
        basket: 'Trägt die zu waschenden Teile.',
        boundary: 'Kennzeichnet eine gemeinsam gelieferte Ausrüstungsgruppe.',
        level: 'Überwacht den Füllstand im Tank.',
        temp: 'Misst die Temperatur und sendet ein Signal an den Regelkreis.',
        pressure: 'Überwacht den Leitungsdruck.',
        flow: 'Überwacht den Durchfluss in der Leitung.',
        door: 'Meldet den Deckelzustand.',
        position: 'Liefert eine Positionsrückmeldung.',
        hand: 'Erkennt eine Hand oder einen Gegenstand im Gefahrenbereich.',
        curtain: 'Erkennt Unterbrechungen des Lichtvorhangs im Schließbereich.',
        lock: 'Hält den Deckel während des Prozesszyklus verriegelt.',
        rfid: 'Prüft per RFID, ob der Deckel geschlossen ist.',
        estop: 'Stoppt die Maschine im Notfall sicher.',
        overload: 'Schützt den Motor vor Überstrom.',
        electric: 'Schützt den Stromkreis vor Überstrom und Fehlerstrom.',
        analytic: 'Misst die Flüssigkeitsqualität.',
        encoder: 'Misst Drehung und Position.',
        button: 'Gibt einen Bedienbefehl.',
        generic: 'Liefert ein Feldsignal.',
        interlock: 'Verriegelt Ausrüstung abhängig von den Eingangssignalen.',
        plc: 'Zeigt eine Steuerfunktion in der SPS-Software.',
        display: 'Zeigt Werte und Zustände an.',
        lamp: 'Gibt eine Zustandswarnung.',
        manualValve: 'Öffnet, schließt oder regelt den Durchfluss von Hand.',
        check: 'Verhindert Rückfluss.',
        safetyValve: 'Öffnet bei Überdruck und schützt die Leitung.',
        regulator: 'Hält den Leitungsdruck auf dem Sollwert.',
        filter: 'Hält Partikel in der Flüssigkeit zurück.',
        strainer: 'Hält grobe Partikel in der Leitung zurück.',
        dosatron: 'Vom Wasserdurchfluss angetrieben, ohne Strom; dosiert Chemikalie im eingestellten Verhältnis zu.',
        nozzle: 'Sprüht die Flüssigkeit auf die Teile.',
        spray: 'Verteilt die Flüssigkeit auf die Düsen und sprüht sie auf die Teile.',
        hx: 'Überträgt Wärme zwischen Medien.',
        frl: 'Filtert die Druckluft und regelt ihren Druck.',
        silencer: 'Verringert das Abluftgeräusch.',
        fitting: 'Stellt die Leitungsverbindung her.',
        terminalIn: 'Kennzeichnet den Eintritt der Leitung in das System.',
        terminalOut: 'Kennzeichnet den Austritt der Leitung aus dem System.',
        offpage: 'Zeigt, dass die Leitung auf einem anderen Blatt weitergeht.'
      }
    }
  };

  const FUNCTION_ORDER = ['estop', 'doorGuard', 'hand', 'curtain', 'lock', 'rfid', 'dryRun', 'overflow', 'overTemp',
    'airPressure', 'pressure', 'flow', 'overload', 'electric', 'safetyValve'];

  const PASSIVE_KINDS = {
    'v.gate': 'manualValve', 'v.ball': 'manualValve', 'v.butterfly': 'manualValve', 'v.globe': 'manualValve', 'v.threeway': 'manualValve',
    'v.check': 'check', 'v.safety': 'safetyValve', 'v.regulator': 'regulator',
    'e.filter': 'filter', 'e.strainer': 'strainer', 'p.dosatron': 'dosatron', 'e.nozzle': 'nozzle', 'e.spray': 'spray', 'e.hx': 'hx',
    'n.frl': 'frl', 'n.silencer': 'silencer',
    'l.reducer': 'fitting', 'l.flange': 'fitting', 'l.drain': 'terminalOut', 'l.vent': 'terminalOut',
    'l.inlet': 'terminalIn', 'l.outlet': 'terminalOut', 'l.offpage': 'offpage'
  };
  const ACTUATED_VALVES = new Set(['v.solenoid', 'v.solenoidFill', 'v.pneumatic', 'v.ballPneumatic', 'v.butterflyPneumatic', 'v.motor', 'v.pistonValve', 'n.valve52', 'n.valve32']);
  const ACTUATOR_BY_SYMBOL = {
    'p.centrifugal': 'pump', 'p.dosing': 'pump', 'p.vacuum': 'pump', 'f.fan': 'fan', 'f.blower': 'fan',
    'd.motor': 'drive', 'd.gearmotor': 'drive', 'd.vibration': 'drive', 'd.vfd': 'drive',
    'h.resistance': 'heater', 'h.burner': 'heater', 'h.ultrasonic': 'ultrasonic', 'h.transducer': 'ultrasonic',
    'n.cylinder': 'cylinder', 'n.cylinderSet': 'cylinder', 'n.cylinderSpring': 'cylinder', 'n.cylinderRod': 'cylinder', 'n.cylinderLift': 'cylinder',
    'e.conveyor': 'drive', 'e.skimmer': 'drive'
  };
  const ACTUATOR_BY_SERIES = { PE: 'pump', FE: 'fan', GE: 'drive', VE: 'drive', INV: 'drive', R: 'heater', BR: 'heater', TD: 'ultrasonic', V: 'valve' };

  const seriesOf = (tag) => (String(tag || '').toUpperCase().match(/^[A-Z]+/) || [''])[0];
  const numberOf = (tag) => parseInt(String(tag || '').replace(/\D/g, ''), 10) || 0;
  /** Katalog adındaki tank numarası: "2. Proses Tankı 1. Rezistans" → "2" */
  const tankNumber = (node) => {
    const match = Sym.normalize(node.entry ? node.entry.name : '').match(/(\d+)\.\s*proses tank/);
    return match ? match[1] : null;
  };

  /** ISA harfi, kod serisi ve katalog adından sensörün neyi algıladığını çıkarır */
  function sensorKind(series, func, n) {
    if (series === 'LS' || /^L[STIAE]/.test(func)) {
      if (/^L[SA]LL?$/.test(func) || n.includes('alt seviye')) return { kind: 'level', sub: 'low' };
      if (/^L[SA]HH?$/.test(func) || n.includes('ust seviye')) return { kind: 'level', sub: 'high' };
      if (func === 'LSM' || n.includes('orta seviye')) return { kind: 'level', sub: 'mid' };
      return { kind: 'level', sub: 'low' };
    }
    if (series === 'TC' || /^T[ETISCA]/.test(func)) return { kind: 'temp' };
    if (series === 'PS' || /^P(D?[TSIA]|IC)/.test(func)) {
      if (n.includes('hava')) return { kind: 'pressure', sub: 'air' };
      if (n.includes('vakum')) return { kind: 'pressure', sub: 'vacuum' };
      if (/\bsu\b/.test(n)) return { kind: 'pressure', sub: 'water' };
      return { kind: 'pressure' };
    }
    if (/^F[STIA]/.test(func) || n.includes('flow') || n.includes('akis')) return { kind: 'flow' };
    if (['SW', 'PPS', 'PRS', 'SWB'].includes(series) || /^Z[STIC]/.test(func)) {
      // "Kapağı" sadeleşince "kapagi" olur; "kapalı" (kapali) ise kapak değildir
      return { kind: /kapa[kg]|kapi|door|\blid\b/.test(n) ? 'door' : 'position' };
    }
    if (series === 'CS' || series === 'PHS' || /^A[TEI]/.test(func)) return { kind: 'analytic' };
    if (series === 'T') return { kind: 'overload' };
    if (series === 'F' || series === 'FC') return { kind: 'electric' };
    if (series === 'B' || func === 'HS') return { kind: 'button' };
    return null;
  }

  function classify(item, def, entry) {
    const id = def.id;
    const series = seriesOf(item.tag);
    const num = numberOf(item.tag);
    const func = String(item.func || '').toUpperCase();
    // Türü belli enstrüman kutusunun adı da ipucudur: "Vakum Sensörü", "Kapak Switchi"
    const typeName = def.isInstrument && def.defaultFunc && id !== 'i.interlock' ? def.name.tr : '';
    const n = Sym.normalize(`${entry ? entry.name : ''} ${item.note || ''} ${typeName}`);

    if (def.logic) return Object.assign({ purpose: def.logic.kind }, def.logic);
    if (id === 'l.junction') return { role: 'junction', purpose: 'fitting' };
    if (id === 'i.interlock') return { role: 'logic', kind: 'interlock', purpose: 'interlock' };
    if (id === 'i.plc') return { role: 'logic', kind: 'plc', purpose: 'plc' };
    if (id === 's.hand' || (series === 'SS' && num === 1)) return { role: 'sensor', kind: 'hand', purpose: 'hand' };
    if (id === 's.curtain' || (series === 'SS' && num === 3)) return { role: 'sensor', kind: 'curtain', purpose: 'curtain' };
    if (id === 's.lock' || (series === 'SS' && (num === 2 || num === 4))) return { role: 'sensor', kind: 'lock', purpose: 'lock' };
    if (id === 's.rfid' || series === 'SS') return { role: 'sensor', kind: 'rfid', purpose: 'rfid' };
    if (id === 's.estop' || n.includes('acil stop')) return { role: 'sensor', kind: 'estop', purpose: 'estop' };
    if (def.container) {
      const type = def.vesselType || 'boundary';
      return { role: 'container', kind: type, purpose: type };
    }
    if (id === 'd.encoder' || series === 'ENC') return { role: 'sensor', kind: 'encoder', purpose: 'encoder' };

    if (def.isInstrument || !ACTUATOR_BY_SYMBOL[id]) {
      const sensor = def.isInstrument || !def.ports.length ? sensorKind(series, func, n) : null;
      if (sensor) return { role: 'sensor', kind: sensor.kind, sub: sensor.sub, medium: sensor.sub, purpose: sensor.kind };
    }
    if (ACTUATOR_BY_SYMBOL[id]) {
      const kind = ACTUATOR_BY_SYMBOL[id];
      const purpose = id === 'e.conveyor' ? 'conveyor' : id === 'e.skimmer' ? 'skimmer' : kind;
      return { role: 'actuator', kind, purpose };
    }
    if (ACTUATED_VALVES.has(id)) return { role: 'actuator', kind: 'valve', purpose: 'valve' };
    if (PASSIVE_KINDS[id]) return { role: 'passive', kind: PASSIVE_KINDS[id], purpose: PASSIVE_KINDS[id] };
    if (id === 'i.hmi') return { role: 'display', kind: 'hmi', purpose: 'display' };
    if (series === 'L' || func === 'XL') return { role: 'display', kind: 'lamp', purpose: 'lamp' };
    if (id === 'i.panel' && !series) return { role: 'display', kind: 'panel', purpose: 'display' };
    if (ACTUATOR_BY_SERIES[series]) return { role: 'actuator', kind: ACTUATOR_BY_SERIES[series], purpose: ACTUATOR_BY_SERIES[series] };
    return { role: 'sensor', kind: 'generic', purpose: 'generic' };
  }

  /** Sensör + ekipman → etki ve güvenlik fonksiyonu */
  function ruleFor(sensor, target, purposeOfValve) {
    const k = target.kind;
    const wet = k === 'pump' || k === 'heater' || k === 'ultrasonic';
    const moving = k === 'cylinder' || k === 'valve';
    const rule = (effect, cond, fn, extra) => Object.assign({ effect, cond, fn: fn || null }, extra);
    switch (sensor.kind) {
      case 'level':
        if (sensor.sub === 'high') {
          if (k === 'valve' || k === 'pump') return rule(k === 'valve' ? 'close' : 'stop', 'levelHigh', 'overflow');
          return rule('stop', 'levelHigh');
        }
        if (sensor.sub === 'mid') return wet ? rule('block', 'levelMid', 'dryRun') : rule('control');
        if (k === 'valve') {
          const purpose = purposeOfValve(target);
          if (purpose === 'fill') return rule('open', 'levelLow', null, { reason: 'fill' });
          if (purpose === 'drain') return rule('close', 'levelLow');
        }
        return rule('block', 'levelLow', wet ? 'dryRun' : null);
      case 'temp':
        if (k === 'heater' || k === 'pump' || k === 'ultrasonic') return rule('stop', 'tempHigh', 'overTemp');
        return rule('control');
      case 'pressure':
        if (sensor.sub === 'air') return rule('block', 'airLow', 'airPressure');
        if (sensor.sub === 'water') return rule('block', 'waterLow', 'pressure');
        if (sensor.sub === 'vacuum') return rule('block', 'vacuum');
        return rule('stop', 'pressure', 'pressure');
      case 'flow':
        return wet ? rule('block', 'flow', 'flow') : rule('control');
      case 'door':
        return moving ? rule('feedback') : rule('block', 'doorOpen', 'doorGuard');
      case 'position':
        return moving || k === 'drive' ? rule('feedback') : rule('block', 'position');
      case 'hand': return rule('stop', 'hand', 'hand');
      case 'curtain': return rule('stop', 'curtain', 'curtain');
      case 'lock': return rule('block', 'lock', 'lock');
      case 'rfid': return rule('stop', 'rfid', 'rfid');
      case 'estop': return rule('stop', 'estop', 'estop');
      case 'overload': return rule('stop', 'overload', 'overload');
      case 'electric': return rule('stop', 'electric', 'electric');
      case 'encoder': return rule('feedback');
      default: return rule('control');
    }
  }

  /** Bağlantısı olmasa da sensörün temsil ettiği güvenlik fonksiyonu */
  function functionOfSensor(node) {
    switch (node.kind) {
      case 'level': return node.sub === 'high' ? 'overflow' : 'dryRun';
      case 'temp': return 'overTemp';
      case 'pressure': return node.sub === 'air' ? 'airPressure' : 'pressure';
      case 'flow': return 'flow';
      case 'door': return 'doorGuard';
      case 'position': return 'doorGuard';
      case 'hand': case 'curtain': case 'lock': case 'rfid': case 'estop': case 'overload': case 'electric': return node.kind;
      default: return null;
    }
  }

  function conditionOfSensor(node) {
    switch (node.kind) {
      case 'level': return node.sub === 'high' ? 'levelHigh' : node.sub === 'mid' ? 'levelMid' : 'levelLow';
      case 'temp': return 'tempHigh';
      case 'pressure': return node.sub === 'air' ? 'airLow' : node.sub === 'water' ? 'waterLow' : node.sub === 'vacuum' ? 'vacuum' : 'pressure';
      case 'flow': return 'flow';
      case 'door': return 'doorOpen';
      case 'position': return 'position';
      case 'hand': case 'curtain': case 'lock': case 'rfid': case 'estop': case 'overload': case 'electric': return node.kind;
      default: return null;
    }
  }

  /* Bu sensörler bağlantısız olsa da her zaman güvenlik tablosunda görünür.
     Diğerleri (sıcaklık, konum, basınç) yalnız güvenlik kataloğunda varsa görünür. */
  const ALWAYS_SAFETY = new Set(['hand', 'curtain', 'lock', 'rfid', 'estop', 'door', 'flow']);
  /** Bağlı değilse Kontrol panelinde uyarı veren sensörler */
  const SHOULD_CONNECT = new Set(['hand', 'curtain', 'rfid', 'estop', 'door', 'flow']);

  function listJoin(items, t) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} ${t.and} ${items[items.length - 1]}`;
  }

  function analyze(drawing, options) {
    const opts = options || {};
    const lang = TEXT[opts.lang] ? opts.lang : 'tr';
    const t = TEXT[lang];
    const catalog = opts.catalog || new Map();
    const safetyCatalog = opts.safety || new Map();

    const nodes = new Map();
    const lines = [];

    drawing.sheets.forEach((sheet, sheetIndex) => {
      for (const item of sheet.items) {
        if (Model.isLine(item)) {
          lines.push({ line: item, sheet, sheetIndex, signal: false, wrongKind: false });
          continue;
        }
        if (!Model.isSymbol(item)) continue;
        const def = Sym.get(item.symbol);
        // Temel şekiller (dikdörtgen, daire...) yalnız çizimdir: bileşen ve bağlantı sayılmaz
        if (!def || def.decor) continue;
        const tag = String(item.tag || '').trim().toUpperCase();
        const entry = tag ? catalog.get(tag) || null : null;
        const info = classify(item, def, entry);
        const defName = def.name[lang] || def.name.tr;
        const usesNote = info.role === 'container' || info.kind === 'terminalIn' || info.kind === 'terminalOut' || info.kind === 'offpage';
        const name = entry
          ? (lang === 'tr' ? entry.name : entry[lang] || entry.name)
          : (usesNote && Sym.localNote(item.note, lang)) || defName;
        nodes.set(item.id, Object.assign({
          id: item.id,
          item,
          def,
          sheet,
          sheetIndex,
          tag,
          entry,
          name,
          short: tag || name,
          label: tag ? `${tag} (${name})` : name,
          optional: !!item.optional,
          inside: null,
          adj: []
        }, info));
      }
    });

    /* Bir sembolün içinde durduğu tank veya hücre: en küçük kutu kazanır */
    const containers = [...nodes.values()].filter((n) => n.role === 'container' && (n.kind === 'tank' || n.kind === 'cell'));
    for (const node of nodes.values()) {
      if (node.role === 'container' || node.role === 'junction') continue;
      let best = null;
      let bestArea = Infinity;
      for (const c of containers) {
        if (c.sheet !== node.sheet) continue;
        const b = Model.boxOf(c.item);
        if (node.item.x < b[0] || node.item.x > b[2] || node.item.y < b[1] || node.item.y > b[3]) continue;
        const area = (b[2] - b[0]) * (b[3] - b[1]);
        if (area < bestArea) {
          best = c;
          bestArea = area;
        }
      }
      node.inside = best;
    }

    /* Bağlantı grafiği */
    const isControlRole = (n) => n && (n.role === 'sensor' || n.role === 'logic');
    for (const entry of lines) {
      const a = nodes.get(entry.line.from.node);
      const b = nodes.get(entry.line.to.node);
      entry.a = a || null;
      entry.b = b || null;
      const kind = entry.line.kind;
      if (kind === 'signal' || kind === 'data') entry.signal = true;
      else if (kind !== 'mech' && (isControlRole(a) || isControlRole(b))) {
        // Sensöre bağlanan hat varsayılan proses tipinde çizilmiş olabilir
        entry.signal = true;
        entry.wrongKind = true;
      }
      if (a) a.adj.push({ entry, other: b });
      if (b) b.adj.push({ entry, other: a });
    }
    // Yanlış tipte çizilen hat bağlantı noktasından geçiyorsa aynı tipteki kolları da sinyal sayılır
    let spread = true;
    while (spread) {
      spread = false;
      for (const entry of lines) {
        if (!entry.wrongKind) continue;
        for (const end of [entry.a, entry.b]) {
          if (!end || end.role !== 'junction') continue;
          for (const edge of end.adj) {
            if (!edge.entry.signal && edge.entry.line.kind === entry.line.kind) {
              edge.entry.signal = true;
              edge.entry.wrongKind = true;
              spread = true;
            }
          }
        }
      }
    }

    /* Akış zincirleri */
    const flowLines = lines.filter((e) => !e.signal && e.line.kind !== 'mech');
    const outgoing = new Map();
    const incoming = new Map();
    for (const e of flowLines) {
      if (e.a) outgoing.set(e.a.id, (outgoing.get(e.a.id) || []).concat(e));
      if (e.b) incoming.set(e.b.id, (incoming.get(e.b.id) || 0) + 1);
    }
    const chains = [];
    const covered = new Set();
    const seenRoutes = new Set();
    const MAX_CHAINS = 300;

    function emitChain(path, kind, entries, sheetIndex) {
      const visible = path.filter((n) => n.role !== 'junction');
      if (visible.length < 2) return;
      const key = visible.map((n) => n.id).join('>');
      if (seenRoutes.has(key) || chains.length >= MAX_CHAINS) return;
      seenRoutes.add(key);
      chains.push({ nodes: visible, kind, sheetIndex, entries, optional: entries.some((e) => e.line.optional) });
    }

    function walk(node, path, kind, entries, sheetIndex) {
      const outs = outgoing.get(node.id) || [];
      if (path.length > 1 && (node.role === 'container' || !outs.length)) {
        emitChain(path, kind, entries, sheetIndex);
        return;
      }
      if (path.length > 40) return;
      for (const e of outs) {
        covered.add(e);
        if (!e.b) continue;
        if (path.includes(e.b)) {
          emitChain(path, kind, entries, sheetIndex);
          continue;
        }
        walk(e.b, path.concat(e.b), kind, entries.concat(e), sheetIndex);
      }
    }

    const starts = [...nodes.values()].filter((n) => outgoing.has(n.id) && (n.role === 'container' || !incoming.get(n.id)));
    for (const start of starts) {
      for (const e of outgoing.get(start.id)) {
        covered.add(e);
        if (e.b) walk(e.b, [start, e.b], e.line.kind, [e], start.sheetIndex);
      }
    }
    for (const e of flowLines) {
      if (covered.has(e) || !e.a || !e.b) continue;
      covered.add(e);
      walk(e.b, [e.a, e.b], e.line.kind, [e], e.a.sheetIndex);
    }

    /* Vananın dolum mu drenaj mı olduğu: önce çizimdeki yol, sonra katalog adı */
    function purposeOfValve(valve) {
      if (valve.def.valvePurpose) return valve.def.valvePurpose;
      for (const chain of chains) {
        if (!chain.nodes.includes(valve)) continue;
        const first = chain.nodes[0];
        const last = chain.nodes[chain.nodes.length - 1];
        if (first.kind === 'terminalIn' && last.role === 'container') return 'fill';
        if (first.role === 'container' && last.kind === 'terminalOut') return 'drain';
      }
      const n = Sym.normalize(`${valve.entry ? valve.entry.name : ''} ${valve.item.note || ''}`);
      if (n.includes('drenaj') || n.includes('tahliye')) return 'drain';
      if (n.includes('dolum') || n.includes('besleme') || n.includes('su giris')) return 'fill';
      return null;
    }

    /* Sensörün izlediği yer ve etkilediği ekipman */
    const usedSignal = new Set();

    function trace(sensor) {
      const targets = new Map();
      const locations = [];
      const taps = [];
      const displays = [];
      const visited = new Set([sensor.id]);
      const stack = [{ node: sensor, via: [], afterLogic: false, direct: true }];
      while (stack.length) {
        const cur = stack.pop();
        for (const edge of cur.node.adj) {
          if (!edge.entry.signal) continue;
          usedSignal.add(edge.entry);
          const other = edge.other;
          if (!other || visited.has(other.id)) continue;
          if (other.role === 'sensor' && cur.afterLogic) continue; // aynı interlocka giren diğer sensör
          visited.add(other.id);
          switch (other.role) {
            case 'junction': {
              const process = other.adj.filter((x) => !x.entry.signal && x.entry.line.kind !== 'mech');
              if (process.length && cur.direct) taps.push(process[0].entry);
              stack.push({ node: other, via: cur.via, afterLogic: cur.afterLogic, direct: cur.direct });
              break;
            }
            case 'logic':
              stack.push({ node: other, via: cur.via.concat(other), afterLogic: true, direct: false });
              break;
            case 'sensor':
              stack.push({ node: other, via: cur.via, afterLogic: false, direct: false });
              break;
            case 'actuator':
              targets.set(other.id, { node: other, via: cur.via });
              break;
            case 'container':
            case 'passive':
              if (cur.direct) locations.push(other);
              break;
            case 'display':
              displays.push(other);
              break;
            default:
              break;
          }
        }
      }
      return { targets: [...targets.values()], locations, taps, displays };
    }

    const logicRows = [];
    const safetyRows = [];
    const hints = [];
    const protectedBy = new Map();

    const lineLabel = (entry) => {
      const kindName = (Sym.LINE_KINDS[entry.line.kind] || Sym.LINE_KINDS.process).name;
      const name = kindName[lang] || kindName.tr;
      return entry.line.label ? `${name} ${entry.line.label}` : name;
    };

    const sensors = [...nodes.values()].filter((n) => n.role === 'sensor');
    sensors.sort((a, b) => a.short.localeCompare(b.short, 'tr', { numeric: true }));

    for (const sensor of sensors) {
      const traced = trace(sensor);
      const place = traced.locations.find((n) => n.role === 'container') || sensor.inside || null;
      const tankPlace = place ? place.short : null;
      const groups = new Map();

      for (const { node: target, via } of traced.targets) {
        const r = ruleFor(sensor, target, purposeOfValve);
        const key = `${r.effect}|${r.cond || ''}|${r.fn || ''}|${r.reason || ''}`;
        if (!groups.has(key)) groups.set(key, Object.assign({}, r, { targets: [], via: [] }));
        const group = groups.get(key);
        group.targets.push(target);
        for (const v of via) if (!group.via.includes(v)) group.via.push(v);
        if (r.fn) {
          if (!protectedBy.has(target.id)) protectedBy.set(target.id, new Set());
          protectedBy.get(target.id).add(r.fn);
        }
      }

      // 1. tankın sensörü 2. tankın ekipmanını kilitliyorsa büyük ihtimalle yanlış bağlantıdır
      const sensorTank = tankNumber(sensor);
      if (sensorTank) {
        for (const { node: target } of traced.targets) {
          const targetTank = tankNumber(target);
          if (targetTank && targetTank !== sensorTank) {
            hints.push({
              level: 'warn',
              code: 'tank-mismatch',
              msg: `${sensor.short} ${sensorTank}. proses tankının sensörü, ama ${target.short} ${targetTank}. proses tankına ait`,
              sheetId: sensor.sheet.id,
              itemId: target.id
            });
          }
        }
      }

      const fnSentences = new Map();
      for (const group of groups.values()) {
        const labels = group.targets.map((n) => n.label);
        const list = listJoin(labels, t);
        const plural = labels.length > 1;
        const route = [sensor.short, ...group.via.map((v) => v.short), group.targets.map((n) => n.short).join(', ')].join(' → ');
        const optional = sensor.optional || group.targets.some((n) => n.optional);
        let text;
        let type;
        if (group.effect === 'control') {
          text = t.effects.control(sensor.label, list);
          type = 'control';
        } else if (group.effect === 'feedback') {
          text = t.effects.feedback(sensor.label, list);
          type = 'feedback';
        } else {
          const cond = t.conditions[group.cond](tankPlace);
          text = t.effects[group.effect](cond, list, plural);
          type = group.fn || group.cond === 'levelLow' || group.effect === 'block' ? 'interlock' : 'control';
          if (group.effect === 'open' || group.effect === 'close') type = group.fn ? 'interlock' : 'control';
          if (group.fn === 'dryRun') {
            const phrases = ['pump', 'heater', 'ultrasonic']
              .filter((k) => group.targets.some((n) => n.kind === k))
              .map((k) => t.dryRun[k]);
            if (phrases.length) text += ` ${t.dryRun.build(listJoin(phrases, t))}`;
          } else if (group.fn) {
            text += ` ${t.reasons[group.fn]}`;
          } else if (group.reason) {
            text += ` ${t.reasons[group.reason]}`;
          }
        }
        logicRows.push({
          group: type,
          type: t.types[type],
          route,
          text,
          fn: group.fn,
          optional,
          sheetId: sensor.sheet.id,
          itemId: sensor.id
        });
        if (group.fn) {
          if (!fnSentences.has(group.fn)) fnSentences.set(group.fn, { texts: [], targets: [], optional: false });
          const bucket = fnSentences.get(group.fn);
          bucket.texts.push(text);
          bucket.targets.push(...group.targets);
          bucket.optional = bucket.optional || optional;
        }
      }

      /* Sensörün neyi izlediği */
      const monitorKind = sensor.kind === 'overload' || sensor.kind === 'electric' || sensor.kind === 'button' || sensor.kind === 'estop' ||
        sensor.kind === 'encoder' ? 'generic' : (t.monitor[sensor.kind] ? sensor.kind : 'generic');
      for (const where of traced.locations) {
        logicRows.push({
          group: 'monitor',
          type: t.types.monitor,
          route: `${sensor.short} → ${where.short}`,
          text: t.monitor[monitorKind](sensor.label, where.role === 'container' ? where.short : where.label),
          optional: sensor.optional,
          sheetId: sensor.sheet.id,
          itemId: sensor.id
        });
      }
      // Tankın içine konmuş, hiçbir yere bağlanmamış sensör (örneğin üst seviye) yine de tankı izler
      if (!traced.locations.length && !traced.targets.length && !traced.taps.length && sensor.inside) {
        logicRows.push({
          group: 'monitor',
          type: t.types.monitor,
          route: `${sensor.short} → ${sensor.inside.short}`,
          text: t.monitor[monitorKind](sensor.label, sensor.inside.short),
          optional: sensor.optional,
          sheetId: sensor.sheet.id,
          itemId: sensor.id
        });
      }
      for (const tap of traced.taps) {
        logicRows.push({
          group: 'monitor',
          type: t.types.monitor,
          route: `${sensor.short} → ${lineLabel(tap)}`,
          text: t.monitor[monitorKind](sensor.label, lineLabel(tap)),
          optional: sensor.optional,
          sheetId: sensor.sheet.id,
          itemId: sensor.id
        });
      }
      for (const display of traced.displays) {
        logicRows.push({
          group: 'monitor',
          type: t.types.monitor,
          route: `${sensor.short} → ${display.short}`,
          text: t.monitor.display(sensor.label, display.label),
          optional: sensor.optional,
          sheetId: sensor.sheet.id,
          itemId: sensor.id
        });
      }

      /* Güvenlik tablosu */
      const catalogRow = sensor.tag ? safetyCatalog.get(sensor.tag) : null;
      const catalogText = catalogRow ? catalogRow[lang] || catalogRow.en || catalogRow.tr : null;

      if (fnSentences.size) {
        for (const [fn, bucket] of fnSentences) {
          const unique = [...new Set(bucket.targets)];
          safetyRows.push({
            fnKey: fn,
            fn: t.functions[fn],
            trigger: sensor.label,
            affected: unique.map((n) => n.label),
            logic: bucket.texts.join(' '),
            connected: true,
            optional: bucket.optional,
            sheetId: sensor.sheet.id,
            itemId: sensor.id
          });
        }
      } else if (!traced.targets.length) {
        const lowLevel = sensor.kind === 'level' && sensor.sub === 'low';
        const include = ALWAYS_SAFETY.has(sensor.kind) || lowLevel ||
          (catalogText && functionOfSensor(sensor));
        const fn = functionOfSensor(sensor);
        if (include && fn) {
          const cond = conditionOfSensor(sensor);
          safetyRows.push({
            fnKey: fn,
            fn: t.functions[fn],
            trigger: sensor.label,
            affected: catalogText && catalogText.lockedEquipment ? [catalogText.lockedEquipment] : [],
            logic: catalogText && catalogText.logic ? catalogText.logic : t.unconnected(t.functions[fn]),
            condition: cond ? t.conditions[cond](tankPlace) : '',
            connected: false,
            optional: sensor.optional,
            sheetId: sensor.sheet.id,
            itemId: sensor.id
          });
          if (SHOULD_CONNECT.has(sensor.kind) || lowLevel) {
            hints.push({
              level: 'warn',
              code: 'safety-unconnected',
              msg: `${sensor.short}: ${TEXT.tr.functions[fn].toLocaleLowerCase('tr')} için bir ekipmana bağlı değil`,
              sheetId: sensor.sheet.id,
              itemId: sensor.id
            });
          }
        }
      }
    }

    /* Emniyet vanası: sensörsüz mekanik güvenlik */
    for (const node of nodes.values()) {
      if (node.kind !== 'safetyValve') continue;
      safetyRows.push({
        fnKey: 'safetyValve',
        fn: t.functions.safetyValve,
        trigger: node.label,
        affected: [],
        logic: t.reasons.safetyValve,
        connected: true,
        optional: node.optional,
        sheetId: node.sheet.id,
        itemId: node.id
      });
    }

    /* Akış satırları */
    for (const chain of chains) {
      const src = chain.nodes[0];
      const dst = chain.nodes[chain.nodes.length - 1];
      const through = chain.nodes.slice(1, -1);
      const pick = (fn) => through.filter(fn).map((n) => n.label);
      // Hattı başlatan pompa veya fan da akışı sağlar; hattın sonundaki değil
      const drivers = chain.nodes.slice(0, -1).filter((n) => n.kind === 'pump' || n.kind === 'fan');
      const opens = pick((n) => n.kind === 'valve');
      const filters = pick((n) => n.kind === 'filter' || n.kind === 'strainer' || n.kind === 'frl');
      const checks = pick((n) => n.kind === 'check');
      const manual = pick((n) => n.kind === 'manualValve');
      const heats = pick((n) => n.kind === 'heater' || n.kind === 'hx');
      const doses = pick((n) => n.kind === 'dosatron');
      const medium = t.flow.medium[chain.kind] || t.flow.medium.process;
      const driverList = listJoin(drivers.map((n) => n.label), t);
      let text = t.flow.sentence(driverList, listJoin(opens, t), medium, src.short, dst.short, drivers.length > 1);
      if (filters.length) text += ` ${t.flow.filter(listJoin(filters, t))}`;
      if (checks.length) text += ` ${t.flow.check(listJoin(checks, t))}`;
      if (manual.length) text += ` ${t.flow.manual(listJoin(manual, t))}`;
      if (heats.length) text += ` ${t.flow.heat(listJoin(heats, t))}`;
      if (doses.length) text += ` ${t.flow.dose(listJoin(doses, t))}`;
      const kindName = (Sym.LINE_KINDS[chain.kind] || Sym.LINE_KINDS.process).name;
      logicRows.push({
        group: 'flow',
        type: kindName[lang] || kindName.tr,
        route: chain.nodes.map((n) => n.short).join(' → '),
        text,
        optional: chain.optional || chain.nodes.some((n) => n.optional),
        sheetId: src.sheet.id,
        itemId: src.id
      });
    }

    /* Mekanik ve kalan sinyal bağlantıları */
    const endOf = (node) => (node ? node.short : t.free);
    const endLabel = (node) => (node ? (node.role === 'container' ? node.short : node.label) : t.free);
    for (const entry of lines) {
      if (entry.line.kind === 'mech') {
        const [a, b] = entry.a && entry.a.kind === 'drive' ? [entry.a, entry.b] : [entry.b, entry.a];
        const text = a && a.kind === 'drive' && b ? t.mech(a.label, b.role === 'container' ? b.short : b.label) : t.mechGeneric(endLabel(entry.a), endLabel(entry.b));
        logicRows.push({
          group: 'mech',
          type: t.types.mech,
          route: `${endOf(a)} → ${endOf(b)}`,
          text,
          optional: !!entry.line.optional,
          sheetId: entry.sheet.id,
          itemId: entry.line.id
        });
      } else if (entry.signal && !usedSignal.has(entry)) {
        const a = entry.a;
        const b = entry.b;
        if ((a && a.role === 'junction') || (b && b.role === 'junction')) continue;
        logicRows.push({
          group: 'signal',
          type: t.types.signal,
          route: `${endOf(a)} → ${endOf(b)}`,
          text: t.signalGeneric(endLabel(a), endLabel(b)),
          optional: !!entry.line.optional,
          sheetId: entry.sheet.id,
          itemId: entry.line.id
        });
      }
    }

    const groupOrder = { interlock: 0, control: 1, feedback: 2, monitor: 3, flow: 4, mech: 5, signal: 6 };
    logicRows.sort((a, b) => groupOrder[a.group] - groupOrder[b.group]);

    /* Güvenlik tablosu sırası ve numarası */
    const rank = (key) => {
      const i = FUNCTION_ORDER.indexOf(key);
      return i < 0 ? FUNCTION_ORDER.length : i;
    };
    safetyRows.sort((a, b) => rank(a.fnKey) - rank(b.fnKey) || a.trigger.localeCompare(b.trigger, 'tr', { numeric: true }));
    safetyRows.forEach((row, i) => { row.no = `GF-${String(i + 1).padStart(2, '0')}`; });

    /* Eksik koruma uyarıları: yalnız ekranda, PDF'e girmez */
    const isDryProtected = (node) => {
      const set = protectedBy.get(node.id);
      return !!set && (set.has('dryRun') || set.has('flow'));
    };
    for (const node of nodes.values()) {
      if ((node.kind === 'heater' || node.kind === 'ultrasonic') && !isDryProtected(node)) {
        // Tank çizilmemiş olsa da katalog adı "1. Proses Tankı ..." ise tank ekipmanıdır
        const inTank = node.inside && node.inside.kind === 'tank';
        if (inTank || tankNumber(node)) {
          hints.push({
            level: 'warn',
            code: 'safety-gap',
            msg: `${node.short}: ${inTank ? `${node.inside.short} içinde ama ` : ''}alt seviye korumasına bağlı değil (susuz çalışabilir)`,
            sheetId: node.sheet.id,
            itemId: node.id
          });
        }
      }
      if (node.kind === 'interlock') {
        const hasInput = node.adj.some((e) => e.entry.signal && e.other && (e.other.role === 'sensor' || e.other.role === 'junction'));
        const hasOutput = node.adj.some((e) => e.entry.signal && e.other && (e.other.role === 'actuator' || e.other.role === 'junction'));
        if (!hasInput || !hasOutput) {
          hints.push({
            level: 'warn',
            code: 'interlock-open',
            msg: `Interlock: ${hasInput ? 'kilitlediği ekipmana' : 'tetikleyen sensöre'} bağlı değil`,
            sheetId: node.sheet.id,
            itemId: node.id
          });
        }
      }
    }
    const pumpSeen = new Set();
    for (const chain of chains) {
      if (chain.nodes[0].role !== 'container' || chain.nodes[0].kind !== 'tank') continue;
      for (const node of chain.nodes) {
        if (node.kind !== 'pump' || pumpSeen.has(node.id) || isDryProtected(node)) continue;
        pumpSeen.add(node.id);
        hints.push({
          level: 'warn',
          code: 'safety-gap',
          msg: `${node.short}: ${chain.nodes[0].short} içinden çekiyor ama alt seviye korumasına bağlı değil (kuru çalışabilir)`,
          sheetId: node.sheet.id,
          itemId: node.id
        });
      }
    }
    for (const entry of lines) {
      if (!entry.wrongKind) continue;
      const end = (entry.a && entry.a.role !== 'junction') ? entry.a : entry.b;
      hints.push({
        level: 'info',
        code: 'line-kind',
        msg: `${end ? end.short : 'Hat'}: sensör bağlantısı "${(Sym.LINE_KINDS[entry.line.kind] || {}).name ? Sym.LINE_KINDS[entry.line.kind].name.tr : entry.line.kind}" tipinde çizilmiş, sinyal olarak yorumlandı`,
        sheetId: entry.sheet.id,
        itemId: entry.line.id
      });
    }

    /* Bileşen listesi */
    function neighbours(node) {
      const out = [];
      const seen = new Set([node.id]);
      const stack = [node];
      while (stack.length) {
        const cur = stack.pop();
        for (const edge of cur.adj) {
          const other = edge.other;
          if (!other || seen.has(other.id)) continue;
          // Ortak sinyal hattıyla aynı sensöre bağlı ekipmanlar birbirinin bağlantısı sayılmaz
          if (cur !== node && edge.entry.signal && other.role !== 'junction' &&
              !isControlRole(node) && !isControlRole(other)) continue;
          seen.add(other.id);
          if (other.role === 'junction') stack.push(other);
          else out.push(other.short);
        }
      }
      return out;
    }

    const componentMap = new Map();
    for (const node of nodes.values()) {
      if (node.role === 'junction') continue;
      const key = node.tag ? `#${node.tag}` : `${node.item.symbol}|${node.name}|${node.optional}`;
      const langDesc = node.entry && node.entry.desc ? node.entry.desc[lang] : '';
      const purpose = langDesc || (lang === 'tr' && node.entry ? node.entry.description : '') || t.purposes[node.purpose] || '';
      if (!componentMap.has(key)) {
        componentMap.set(key, {
          tag: node.tag,
          name: node.name,
          symbol: node.item.symbol,
          purpose,
          qty: 0,
          links: [],
          sheets: [],
          optional: node.optional,
          sheetId: node.sheet.id,
          itemId: node.id
        });
      }
      const row = componentMap.get(key);
      row.qty += 1;
      for (const link of neighbours(node)) if (!row.links.includes(link)) row.links.push(link);
      if (!row.sheets.includes(node.sheetIndex + 1)) row.sheets.push(node.sheetIndex + 1);
    }
    const components = [...componentMap.values()].sort((a, b) => {
      if (!!a.tag !== !!b.tag) return a.tag ? -1 : 1;
      return (a.tag || a.name).localeCompare(b.tag || b.name, 'tr', { numeric: true });
    });

    return { lang, text: t, components, logic: logicRows, safety: safetyRows, hints };
  }

  return { TEXT, analyze, classify, listJoin };
});
