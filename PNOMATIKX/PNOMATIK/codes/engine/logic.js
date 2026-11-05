/* Pnömatik devre mantığı: hava hatlarından devre grafiğini kurar; bileşen listesi, bağlantı mantığı,
   güvenlik fonksiyonları (ISO 4414) ve P&ID – pnömatik kod eşleştirmesini üretir.
   DOM'a bağlı değildir; ekran, PDF ve Node testleri aynı kodu kullanır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./symbols.js'), require('./model.js'), require('./pidlink.js'));
  } else {
    root.PidLogic = factory(root.PidSymbols, root.PidModel, root.PidLink);
  }
})(typeof self !== 'undefined' ? self : this, function (Sym, Model, Link) {
  'use strict';

  const TEXT = {
    tr: {
      and: 've',
      titles: {
        components: 'Bileşen Listesi', logic: 'Bağlantı Mantığı', safety: 'Güvenlik Fonksiyonları',
        mapping: 'P&ID – Pnömatik Kod Eşleştirme', document: 'Bileşen Listesi ve Bağlantı Mantığı',
        mappingDoc: 'P&ID – Pnömatik Kod Eşleştirme', docType: 'Açıklama Sayfası 1', docType2: 'Açıklama Sayfası 2'
      },
      mappingIntro: 'Pnömatik şemada ISO 1219-2 kodları kullanılır. Aşağıdaki tablo her pnömatik kodun P&ID şemasındaki karşılığını verir; şemada [ ] içinde yazan kodlar P&ID kodlarıdır.',
      continued: ' (devam)',
      columns: {
        code: 'Kod', pid: 'P&ID', symbol: 'Sembol', name: 'Bileşen', purpose: 'Ne İşe Yarar', links: 'Bağlantıları', sheet: 'Sayfa',
        route: 'Bağlantı', type: 'Tür', text: 'Açıklama', no: 'No', fn: 'Güvenlik Fonksiyonu', trigger: 'Tetikleyen',
        affected: 'Etkilenen Ekipman', logic: 'Güvenlik Mantığı', circuit: 'Devre', pneuCode: 'Pnömatik Kod',
        pidCode: 'P&ID Kodu', component: 'Pnömatik Bileşen', pidName: 'P&ID Açıklaması'
      },
      types: { control: 'Kumanda', feedback: 'Geri Bildirim', supply: 'Besleme', speed: 'Hız Ayarı', monitor: 'İzleme', signal: 'Sinyal', mech: 'Mekanik' },
      parts: { coil: 'bobini', sensor: 'sensörü', magSensor: 'manyetik sensörü', valve: 'Yön valfi', actuator: 'Aktüatör' },
      supplyCircuit: 'Besleme',
      optional: 'Opsiyon',
      noCode: '—',
      free: 'boşta',
      coilName: (i) => (i === 0 ? 'Bobin 14' : 'Bobin 12'),
      motion: {
        extend: 'ileri çıkar', retract: 'geri çekilir', open: 'açılır', close: 'kapanır', turnA: '1. yöne döner', turnB: '2. yöne döner',
        grip: 'kapanır (parçayı tutar)', release: 'açılır (parçayı bırakır)', inflate: 'şişer', deflate: 'söner', hold: 'vakumla tutar'
      },
      position: { linear: ['geri', 'ara', 'ileri'], valve: ['kapalı', 'ara', 'açık'], other: ['başlangıç', 'ara', 'son'] },
      s: {
        energize: (coil, valve, act, motion) => `${coil} enerjilenince ${valve} konum değiştirir; ${act} ${motion}.`,
        rest: (valve, act, motion) => `Bobin enerjisi kesilince ${valve} yay ile normal konuma döner; ${act} ${motion}.`,
        hold: (valve) => `${valve} çift bobinlidir; enerji kesilse de son konumunu korur.`,
        centerClosed: (valve, act) => `İki bobin de enerjisizken ${valve} orta konumda portları kapatır; ${act} bulunduğu konumda durur.`,
        centerExhaust: (valve, act) => `İki bobin de enerjisizken ${valve} orta konumda iki hattı tahliye eder; ${act} serbest kalır.`,
        manual: (valve, act) => `${valve} elle kumanda edilir; ${act} buna göre hareket eder.`,
        speed: (list, act) => `${list} ile ${act} hızı ayarlanır (egzoz kısma).`,
        loadHold: (list, act) => `${list}, ${act} yükünü hava kesilse de tutar.`,
        quick: (list, act) => `${list} ile ${act} egzozu hızlanır.`,
        feedback: (s, act, pos) => `${s}, ${act} ${pos} konumunu bildirir.`,
        feedbackBox: (s, act) => `${s}, ${act} açık / kapalı konumunu bildirir.`,
        feedbackFree: (s) => `${s} konum sinyali verir; çizimde bir aktüatöre bağlı değil.`,
        chain: (chain) => `Basınçlı hava ${chain} yolundan ana hatta ulaşır.`,
        distribution: (src, list) => `${src} çıkışındaki ana hat ${list} valflerini besler.`,
        mainValve: (coil, valve) => `${coil} enerjilenince ${valve} açılır ve sisteme hava verilir; enerji kesilince sistem havası ${valve} üzerinden tahliye edilir.`,
        manualShutoff: (valve) => `${valve} ile basınçlı hava elle kesilir.`,
        pressure: (s, where) => `${s}, ${where} hava basıncını izler.`,
        pressureWhere: 'besleme hattındaki',
        noValve: (act) => `${act} bir yön valfine bağlı değil.`,
        signal: (a, b) => `${a} ile ${b} arasında sinyal bağlantısı vardır.`,
        mech: (a, b) => `${a} ile ${b} mekanik olarak bağlıdır.`
      },
      functions: {
        dump: 'Enerji kesilmesinde hava tahliyesi', isolation: 'Manuel hava kesme', lowPressure: 'Düşük hava basıncı izleme',
        failSafe: 'Enerji kesilmesinde güvenli konum', hold: 'Enerji kesilmesinde konum koruma', midStop: 'Ara konumda durdurma',
        speed: 'Hız sınırlama', loadHold: 'Yük tutma', overpressure: 'Aşırı basınç koruması'
      },
      safety: {
        powerLoss: 'Enerji kesilmesi / acil stop',
        dump: (coil, valve) => `Acil stop veya kontrol enerjisi kesildiğinde ${coil} enerjisizlenir; ${valve} kapanır ve sistemdeki hava 3 numaralı porttan tahliye edilir. Aktüatörlere basınçlı hava gitmez.`,
        isolationDump: (valve) => `Bakım ve onarımda ${valve} ile hava elle kesilir ve hat tahliye edilir; valf kilitlenebilir.`,
        isolation: (valve) => `Bakım ve onarımda ${valve} ile hava elle kesilir. Hattaki hava ana valf üzerinden tahliye edilmelidir.`,
        lowPressure: (s) => `${s} besleme basıncını izler; basınç ayar değerinin altına düştüğünde PLC yeni hareket başlatmaz ve makineyi güvenli duruma alır.`,
        failSafe: (parts) => `Bobin enerjisi kesildiğinde valfler yay ile normal konuma döner: ${parts}.`,
        hold: (valves, acts) => `Enerji kesildiğinde ${valves} son konumunu korur; ${acts} kendiliğinden hareket etmez.`,
        midStop: (valve, act) => `${valve} enerjisiz kalınca orta konumda portları kapatır; ${act} bulunduğu konumda durur ve kendiliğinden hareket etmez.`,
        speed: (list, acts) => `${list} ile ${acts} hızları sınırlanır; ani hareket ve ezilme riski azaltılır.`,
        loadHold: (list, act) => `${list}, hava kesilse de ${act} yükünü tutar; yükün düşmesi önlenir.`,
        overpressure: (list) => `${list} çalışma basıncını sınırlar; aşırı basınç önlenir.`
      },
      purposes: {
        'a.cylDouble': 'Basınçlı havayla iki yönde doğrusal hareket üretir.',
        'a.cylSingle': 'Basınçlı havayla ileri çıkar, yay ile geri döner.',
        'a.rotary': 'Basınçlı havayla sınırlı açıda iki yönde döner.',
        'a.valveActuator': 'Proses vanasını basınçlı havayla açar ve kapatır.',
        'a.valveActuatorSpring': 'Proses vanasını basınçlı havayla açar, yay ile kapatır.',
        'a.gripper': 'Parçayı basınçlı havayla tutar ve bırakır.',
        'a.seal': 'Basınçlı havayla şişerek sızdırmazlık sağlar.',
        'a.vacuumCup': 'Parçayı vakumla tutar.',
        'v.52mono': 'Aktüatörün iki hattına havayı yönlendirir; enerji kesilince yay ile döner.',
        'v.52bi': 'Aktüatörün iki hattına havayı yönlendirir; son konumunu korur.',
        'v.53closed': 'Aktüatörü iki yönde sürer; orta konumda tüm portları kapatır.',
        'v.53exhaust': 'Aktüatörü iki yönde sürer; orta konumda hatları tahliye eder.',
        'v.32nc': 'Hattı açar veya tahliye eder (normalde kapalı).',
        'v.32no': 'Hattı tahliye eder veya açık tutar (normalde açık).',
        'v.22nc': 'Hattı açar veya kapatır.',
        'v.32manual': 'Basınçlı havayı elle keser ve hattı tahliye eder; kilitlenebilir.',
        'f.flowCheck': 'Bir yönde akışı kısar, diğer yönde serbest geçirir (hız ayarı).',
        'f.throttle': 'Akışı iki yönde kısar.',
        'f.check': 'Akışı tek yönde geçirir.',
        'f.pilotCheck': 'Aktüatörü yük altında tutar; pilot sinyaliyle açılır.',
        'f.quickExhaust': 'Aktüatör egzozunu doğrudan atmosfere vererek hareketi hızlandırır.',
        'f.regulator': 'Çıkış basıncını ayarlanan değerde tutar.',
        'f.relief': 'Basınç ayar değerini aşınca havayı tahliye eder.',
        's.source': 'Sisteme basınçlı hava sağlar.',
        's.compressor': 'Basınçlı hava üretir.',
        's.receiver': 'Basınçlı havayı depolar, basınç dalgalanmasını azaltır.',
        's.frl': 'Havayı filtreler, basıncını ayarlar ve yağlar.',
        's.fr': 'Havayı filtreler ve basıncını ayarlar.',
        's.filter': 'Havadaki partikülü ve suyu ayırır.',
        's.lubricator': 'Havaya yağ katar.',
        's.ballValve': 'Hattı elle açar veya keser.',
        'k.pressureSensor': 'Hava basıncını ölçer, PLC\'ye analog sinyal verir.',
        'k.pressureSwitch': 'Hava basıncı ayar değerinin altına düşünce sinyal verir.',
        'k.gauge': 'Hava basıncını gösterir.',
        'k.position': 'Konum sinyali verir.',
        'k.cylSensor': 'Pistondaki mıknatısı algılayarak silindirin konum sinyalini verir.',
        'k.cylSensorPnp': 'Pistondaki mıknatısı algılar, PLC\'ye PNP konum sinyali verir.',
        'l.silencer': 'Egzoz gürültüsünü azaltır.',
        'l.exhaust': 'Havayı atmosfere verir.',
        'l.plug': 'Kullanılmayan portu kapatır.',
        'l.inlet': 'Hattın sisteme giriş noktasını gösterir.',
        'l.outlet': 'Hattın sistemden çıkış noktasını gösterir.',
        'l.offpage': 'Hattın başka sayfada devam ettiğini gösterir.',
        'e.boundary': 'Birlikte monte edilen grubu gösterir.',
        sensorTop: (pos) => `Aktüatörün ${pos} konumunu algılar.`,
        sensorBox: 'Vananın açık / kapalı konumunu bildirir.',
        drives: (list) => `${list} kumanda eder.`,
        coils: (list) => `Bobinler: ${list}.`
      },
      sensorName: { top: 'Manyetik Piston Sensörü', pnp: 'Manyetik Piston Sensörü (PNP)', box: 'Switch Box' }
    },
    en: {
      and: 'and',
      titles: {
        components: 'Component List', logic: 'Connection Logic', safety: 'Safety Functions',
        mapping: 'P&ID – Pneumatic Code Cross-Reference', document: 'Component List and Connection Logic',
        mappingDoc: 'P&ID – Pneumatic Code Cross-Reference', docType: 'Description Sheet 1', docType2: 'Description Sheet 2'
      },
      mappingIntro: 'The pneumatic diagram uses ISO 1219-2 codes. The table below gives the P&ID equivalent of every pneumatic code; codes written in [ ] on the diagram are P&ID codes.',
      continued: ' (continued)',
      columns: {
        code: 'Code', pid: 'P&ID', symbol: 'Symbol', name: 'Component', purpose: 'Purpose', links: 'Connections', sheet: 'Sheet',
        route: 'Connection', type: 'Type', text: 'Description', no: 'No.', fn: 'Safety Function', trigger: 'Trigger',
        affected: 'Affected Equipment', logic: 'Safety Logic', circuit: 'Circuit', pneuCode: 'Pneumatic Code',
        pidCode: 'P&ID Code', component: 'Pneumatic Component', pidName: 'P&ID Description'
      },
      types: { control: 'Control', feedback: 'Feedback', supply: 'Supply', speed: 'Speed', monitor: 'Monitoring', signal: 'Signal', mech: 'Mechanical' },
      parts: { coil: 'solenoid', sensor: 'sensor', magSensor: 'magnetic sensor', valve: 'Directional valve', actuator: 'Actuator' },
      supplyCircuit: 'Supply',
      optional: 'Optional',
      noCode: '—',
      free: 'open end',
      coilName: (i) => (i === 0 ? 'Solenoid 14' : 'Solenoid 12'),
      motion: {
        extend: 'extends', retract: 'retracts', open: 'opens', close: 'closes', turnA: 'turns in direction 1', turnB: 'turns in direction 2',
        grip: 'closes (grips the part)', release: 'opens (releases the part)', inflate: 'inflates', deflate: 'deflates', hold: 'holds by vacuum'
      },
      motionPl: {
        extend: 'extend', retract: 'retract', open: 'open', close: 'close', turnA: 'turn in direction 1', turnB: 'turn in direction 2',
        grip: 'close (grip the part)', release: 'open (release the part)', inflate: 'inflate', deflate: 'deflate', hold: 'hold by vacuum'
      },
      position: { linear: ['retracted', 'intermediate', 'extended'], valve: ['closed', 'intermediate', 'open'], other: ['start', 'intermediate', 'end'] },
      s: {
        energize: (coil, valve, act, motion) => `When ${coil} is energised, ${valve} switches and ${act} ${motion}.`,
        rest: (valve, act, motion) => `When the solenoid is de-energised, the spring returns ${valve} to its normal position and ${act} ${motion}.`,
        hold: (valve) => `${valve} has two solenoids and keeps its last position when power is lost.`,
        centerClosed: (valve, act) => `With both solenoids de-energised, ${valve} closes all ports in the centre position and ${act} stops where it is.`,
        centerExhaust: (valve, act) => `With both solenoids de-energised, ${valve} exhausts both lines in the centre position and ${act} is free.`,
        manual: (valve, act) => `${valve} is operated by hand and moves ${act}.`,
        speed: (list, act) => `${list} adjust the speed of ${act} (meter-out).`,
        loadHold: (list, act) => `${list} holds the load of ${act} even without air.`,
        quick: (list, act) => `${list} speeds up the exhaust of ${act}.`,
        feedback: (s, act, pos) => `${s} reports the ${pos} position of ${act}.`,
        feedbackBox: (s, act) => `${s} reports the open / closed position of ${act}.`,
        feedbackFree: (s) => `${s} gives a position signal; it is not attached to an actuator in the drawing.`,
        chain: (chain) => `Compressed air reaches the main line through ${chain}.`,
        distribution: (src, list) => `The main line after ${src} supplies the valves ${list}.`,
        mainValve: (coil, valve) => `When ${coil} is energised, ${valve} opens and air is supplied to the system; when power is lost, the system air is exhausted through ${valve}.`,
        manualShutoff: (valve) => `Compressed air can be shut off by hand with ${valve}.`,
        pressure: (s, where) => `${s} monitors the air pressure ${where}.`,
        pressureWhere: 'in the supply line',
        noValve: (act) => `${act} is not connected to a directional valve.`,
        signal: (a, b) => `There is a signal connection between ${a} and ${b}.`,
        mech: (a, b) => `${a} and ${b} are mechanically linked.`
      },
      functions: {
        dump: 'Air dump on power loss', isolation: 'Manual air isolation', lowPressure: 'Low air pressure monitoring',
        failSafe: 'Safe position on power loss', hold: 'Position holding on power loss', midStop: 'Stop in intermediate position',
        speed: 'Speed limitation', loadHold: 'Load holding', overpressure: 'Overpressure protection'
      },
      safety: {
        powerLoss: 'Power loss / emergency stop',
        dump: (coil, valve) => `When the emergency stop is pressed or control power is lost, ${coil} is de-energised; ${valve} closes and the system air is exhausted through port 3. No compressed air reaches the actuators.`,
        isolationDump: (valve) => `For maintenance and repair, the air is shut off by hand with ${valve} and the line is exhausted; the valve can be locked.`,
        isolation: (valve) => `For maintenance and repair, the air is shut off by hand with ${valve}. The line must be exhausted through the main valve.`,
        lowPressure: (s) => `${s} monitors the supply pressure; when it falls below the set value, the PLC does not start new movements and brings the machine into a safe state.`,
        failSafe: (parts) => `When the solenoids are de-energised, the springs return the valves to their normal position: ${parts}.`,
        hold: (valves, acts) => `When power is lost, ${valves} keep their last position; ${acts} do not move by themselves.`,
        midStop: (valve, act) => `When de-energised, ${valve} closes all ports in the centre position; ${act} stops where it is and does not move by itself.`,
        speed: (list, acts) => `${list} limit the speed of ${acts}; sudden movements and crushing hazards are reduced.`,
        loadHold: (list, act) => `${list} holds the load of ${act} even without air; the load cannot drop.`,
        overpressure: (list) => `${list} limits the working pressure and prevents overpressure.`
      },
      purposes: {
        'a.cylDouble': 'Produces linear movement in both directions with compressed air.',
        'a.cylSingle': 'Extends with compressed air and returns by spring.',
        'a.rotary': 'Turns through a limited angle in both directions with compressed air.',
        'a.valveActuator': 'Opens and closes the process valve with compressed air.',
        'a.valveActuatorSpring': 'Opens the process valve with compressed air and closes it by spring.',
        'a.gripper': 'Grips and releases the part with compressed air.',
        'a.seal': 'Inflates with compressed air to seal.',
        'a.vacuumCup': 'Holds the part by vacuum.',
        'v.52mono': 'Directs air to the two lines of the actuator; returns by spring when de-energised.',
        'v.52bi': 'Directs air to the two lines of the actuator; keeps its last position.',
        'v.53closed': 'Drives the actuator in both directions; closes all ports in the centre position.',
        'v.53exhaust': 'Drives the actuator in both directions; exhausts the lines in the centre position.',
        'v.32nc': 'Opens or exhausts the line (normally closed).',
        'v.32no': 'Exhausts the line or keeps it open (normally open).',
        'v.22nc': 'Opens or closes the line.',
        'v.32manual': 'Shuts off compressed air by hand and exhausts the line; lockable.',
        'f.flowCheck': 'Throttles the flow in one direction and lets it pass freely in the other (speed control).',
        'f.throttle': 'Throttles the flow in both directions.',
        'f.check': 'Lets the flow pass in one direction only.',
        'f.pilotCheck': 'Holds the actuator under load; opens by pilot signal.',
        'f.quickExhaust': 'Exhausts the actuator directly to atmosphere and speeds up the movement.',
        'f.regulator': 'Keeps the outlet pressure at the set value.',
        'f.relief': 'Exhausts air when the pressure exceeds the set value.',
        's.source': 'Supplies compressed air to the system.',
        's.compressor': 'Produces compressed air.',
        's.receiver': 'Stores compressed air and reduces pressure fluctuations.',
        's.frl': 'Filters, regulates and lubricates the air.',
        's.fr': 'Filters the air and regulates its pressure.',
        's.filter': 'Separates particles and water from the air.',
        's.lubricator': 'Adds oil to the air.',
        's.ballValve': 'Opens or shuts off the line by hand.',
        'k.pressureSensor': 'Measures the air pressure and sends an analogue signal to the PLC.',
        'k.pressureSwitch': 'Gives a signal when the air pressure falls below the set value.',
        'k.gauge': 'Shows the air pressure.',
        'k.position': 'Gives a position signal.',
        'k.cylSensor': 'Detects the piston magnet and gives the cylinder position signal.',
        'k.cylSensorPnp': 'Detects the piston magnet and gives a PNP position signal to the PLC.',
        'l.silencer': 'Reduces exhaust noise.',
        'l.exhaust': 'Exhausts air to atmosphere.',
        'l.plug': 'Closes an unused port.',
        'l.inlet': 'Marks where the line enters the system.',
        'l.outlet': 'Marks where the line leaves the system.',
        'l.offpage': 'Shows that the line continues on another sheet.',
        'e.boundary': 'Marks a group mounted together.',
        sensorTop: (pos) => `Detects the ${pos} position of the actuator.`,
        sensorBox: 'Reports the open / closed position of the valve.',
        drives: (list) => `Controls ${list}.`,
        coils: (list) => `Solenoids: ${list}.`
      },
      sensorName: { top: 'Magnetic Cylinder Sensor', pnp: 'Magnetic Cylinder Sensor (PNP)', box: 'Switch Box' }
    },
    de: {
      and: 'und',
      titles: {
        components: 'Komponentenliste', logic: 'Verbindungslogik', safety: 'Sicherheitsfunktionen',
        mapping: 'P&ID – Pneumatik Code-Zuordnung', document: 'Komponentenliste und Verbindungslogik',
        mappingDoc: 'P&ID – Pneumatik Code-Zuordnung', docType: 'Erläuterungsblatt 1', docType2: 'Erläuterungsblatt 2'
      },
      mappingIntro: 'Im Pneumatikschaltplan werden Kennzeichnungen nach ISO 1219-2 verwendet. Die Tabelle nennt zu jeder Pneumatik-Kennzeichnung den Code im P&ID; im Schaltplan stehen P&ID-Codes in [ ].',
      continued: ' (Fortsetzung)',
      columns: {
        code: 'Code', pid: 'P&ID', symbol: 'Symbol', name: 'Komponente', purpose: 'Aufgabe', links: 'Verbindungen', sheet: 'Blatt',
        route: 'Verbindung', type: 'Art', text: 'Beschreibung', no: 'Nr.', fn: 'Sicherheitsfunktion', trigger: 'Auslöser',
        affected: 'Betroffene Ausrüstung', logic: 'Sicherheitslogik', circuit: 'Kreis', pneuCode: 'Pneumatik-Code',
        pidCode: 'P&ID-Code', component: 'Pneumatik-Komponente', pidName: 'P&ID-Beschreibung'
      },
      types: { control: 'Steuerung', feedback: 'Rückmeldung', supply: 'Versorgung', speed: 'Geschwindigkeit', monitor: 'Überwachung', signal: 'Signal', mech: 'Mechanisch' },
      parts: { coil: 'Magnetspule', sensor: 'Sensor', magSensor: 'Magnetsensor', valve: 'Wegeventil', actuator: 'Antrieb' },
      supplyCircuit: 'Versorgung',
      optional: 'Option',
      noCode: '—',
      free: 'offen',
      coilName: (i) => (i === 0 ? 'Spule 14' : 'Spule 12'),
      motion: {
        extend: 'fährt aus', retract: 'fährt ein', open: 'öffnet', close: 'schließt', turnA: 'dreht in Richtung 1', turnB: 'dreht in Richtung 2',
        grip: 'schließt (greift das Teil)', release: 'öffnet (gibt das Teil frei)', inflate: 'bläst sich auf', deflate: 'entleert sich', hold: 'hält mit Vakuum'
      },
      motionPl: {
        extend: 'fahren aus', retract: 'fahren ein', open: 'öffnen', close: 'schließen', turnA: 'drehen in Richtung 1', turnB: 'drehen in Richtung 2',
        grip: 'schließen (greifen das Teil)', release: 'öffnen (geben das Teil frei)', inflate: 'blasen sich auf', deflate: 'entleeren sich', hold: 'halten mit Vakuum'
      },
      position: { linear: ['eingefahrene', 'mittlere', 'ausgefahrene'], valve: ['geschlossene', 'mittlere', 'offene'], other: ['Anfangs-', 'Zwischen-', 'End-'] },
      s: {
        energize: (coil, valve, act, motion) => `Wird ${coil} bestromt, schaltet ${valve} und ${act} ${motion}.`,
        rest: (valve, act, motion) => `Wird die Spule stromlos, stellt die Feder ${valve} in die Grundstellung zurück und ${act} ${motion}.`,
        hold: (valve) => `${valve} hat zwei Spulen und behält bei Stromausfall seine letzte Stellung.`,
        centerClosed: (valve, act) => `Sind beide Spulen stromlos, sperrt ${valve} in Mittelstellung alle Anschlüsse; ${act} bleibt stehen.`,
        centerExhaust: (valve, act) => `Sind beide Spulen stromlos, entlüftet ${valve} in Mittelstellung beide Leitungen; ${act} ist frei.`,
        manual: (valve, act) => `${valve} wird von Hand betätigt und bewegt ${act}.`,
        speed: (list, act) => `Mit ${list} wird die Geschwindigkeit von ${act} eingestellt (Abluftdrosselung).`,
        loadHold: (list, act) => `${list} hält die Last von ${act} auch ohne Luft.`,
        quick: (list, act) => `${list} beschleunigt die Entlüftung von ${act}.`,
        feedback: (s, act, pos) => `${s} meldet die ${pos} Stellung von ${act}.`,
        feedbackBox: (s, act) => `${s} meldet die Stellung offen / geschlossen von ${act}.`,
        feedbackFree: (s) => `${s} liefert ein Positionssignal; er ist keinem Antrieb zugeordnet.`,
        chain: (chain) => `Die Druckluft gelangt über ${chain} in die Hauptleitung.`,
        distribution: (src, list) => `Die Hauptleitung nach ${src} versorgt die Ventile ${list}.`,
        mainValve: (coil, valve) => `Wird ${coil} bestromt, öffnet ${valve} und die Anlage wird belüftet; bei Stromausfall wird die Anlage über ${valve} entlüftet.`,
        manualShutoff: (valve) => `Mit ${valve} wird die Druckluft von Hand abgesperrt.`,
        pressure: (s, where) => `${s} überwacht den Luftdruck ${where}.`,
        pressureWhere: 'in der Versorgungsleitung',
        noValve: (act) => `${act} ist an kein Wegeventil angeschlossen.`,
        signal: (a, b) => `Zwischen ${a} und ${b} besteht eine Signalverbindung.`,
        mech: (a, b) => `${a} und ${b} sind mechanisch verbunden.`
      },
      functions: {
        dump: 'Entlüftung bei Stromausfall', isolation: 'Manuelles Absperren', lowPressure: 'Überwachung des Luftdrucks',
        failSafe: 'Sichere Stellung bei Stromausfall', hold: 'Stellung halten bei Stromausfall', midStop: 'Stopp in Zwischenstellung',
        speed: 'Geschwindigkeitsbegrenzung', loadHold: 'Last halten', overpressure: 'Überdruckschutz'
      },
      safety: {
        powerLoss: 'Stromausfall / Not-Halt',
        dump: (coil, valve) => `Bei Not-Halt oder Ausfall der Steuerspannung wird ${coil} stromlos; ${valve} schließt und die Anlage wird über Anschluss 3 entlüftet. Die Antriebe erhalten keine Druckluft.`,
        isolationDump: (valve) => `Für Wartung und Reparatur wird die Luft mit ${valve} von Hand abgesperrt und die Leitung entlüftet; das Ventil ist abschließbar.`,
        isolation: (valve) => `Für Wartung und Reparatur wird die Luft mit ${valve} von Hand abgesperrt. Die Leitung muss über das Hauptventil entlüftet werden.`,
        lowPressure: (s) => `${s} überwacht den Versorgungsdruck; fällt er unter den Sollwert, startet die SPS keine neuen Bewegungen und bringt die Maschine in einen sicheren Zustand.`,
        failSafe: (parts) => `Werden die Spulen stromlos, stellen die Federn die Ventile in die Grundstellung zurück: ${parts}.`,
        hold: (valves, acts) => `Bei Stromausfall behalten ${valves} ihre letzte Stellung; ${acts} bewegen sich nicht von selbst.`,
        midStop: (valve, act) => `Stromlos sperrt ${valve} in Mittelstellung alle Anschlüsse; ${act} bleibt stehen und bewegt sich nicht von selbst.`,
        speed: (list, acts) => `Mit ${list} wird die Geschwindigkeit von ${acts} begrenzt; plötzliche Bewegungen und Quetschgefahr werden verringert.`,
        loadHold: (list, act) => `${list} hält die Last von ${act} auch ohne Luft; die Last kann nicht absinken.`,
        overpressure: (list) => `${list} begrenzt den Arbeitsdruck und verhindert Überdruck.`
      },
      purposes: {
        'a.cylDouble': 'Erzeugt mit Druckluft eine lineare Bewegung in beide Richtungen.',
        'a.cylSingle': 'Fährt mit Druckluft aus und mit Federkraft ein.',
        'a.rotary': 'Dreht mit Druckluft in einem begrenzten Winkel in beide Richtungen.',
        'a.valveActuator': 'Öffnet und schließt die Prozessarmatur mit Druckluft.',
        'a.valveActuatorSpring': 'Öffnet die Prozessarmatur mit Druckluft und schließt sie mit Federkraft.',
        'a.gripper': 'Greift und löst das Teil mit Druckluft.',
        'a.seal': 'Dichtet durch Aufblasen mit Druckluft ab.',
        'a.vacuumCup': 'Hält das Teil mit Vakuum.',
        'v.52mono': 'Leitet die Luft zu den beiden Leitungen des Antriebs; stromlos mit Federrückstellung.',
        'v.52bi': 'Leitet die Luft zu den beiden Leitungen des Antriebs; behält die letzte Stellung.',
        'v.53closed': 'Bewegt den Antrieb in beide Richtungen; sperrt in Mittelstellung alle Anschlüsse.',
        'v.53exhaust': 'Bewegt den Antrieb in beide Richtungen; entlüftet in Mittelstellung die Leitungen.',
        'v.32nc': 'Öffnet oder entlüftet die Leitung (normal geschlossen).',
        'v.32no': 'Entlüftet die Leitung oder hält sie offen (normal offen).',
        'v.22nc': 'Öffnet oder sperrt die Leitung.',
        'v.32manual': 'Sperrt die Druckluft von Hand ab und entlüftet die Leitung; abschließbar.',
        'f.flowCheck': 'Drosselt den Durchfluss in einer Richtung, in der Gegenrichtung freier Durchfluss (Geschwindigkeit).',
        'f.throttle': 'Drosselt den Durchfluss in beide Richtungen.',
        'f.check': 'Lässt den Durchfluss nur in eine Richtung zu.',
        'f.pilotCheck': 'Hält den Antrieb unter Last; öffnet mit Steuersignal.',
        'f.quickExhaust': 'Entlüftet den Antrieb direkt ins Freie und beschleunigt die Bewegung.',
        'f.regulator': 'Hält den Ausgangsdruck auf dem Sollwert.',
        'f.relief': 'Entlüftet bei Überschreiten des Solldrucks.',
        's.source': 'Versorgt die Anlage mit Druckluft.',
        's.compressor': 'Erzeugt Druckluft.',
        's.receiver': 'Speichert Druckluft und dämpft Druckschwankungen.',
        's.frl': 'Filtert, regelt und ölt die Druckluft.',
        's.fr': 'Filtert die Luft und regelt den Druck.',
        's.filter': 'Scheidet Partikel und Wasser aus der Luft ab.',
        's.lubricator': 'Gibt Öl in die Luft.',
        's.ballValve': 'Öffnet oder sperrt die Leitung von Hand.',
        'k.pressureSensor': 'Misst den Luftdruck und liefert ein Analogsignal an die SPS.',
        'k.pressureSwitch': 'Gibt ein Signal, wenn der Luftdruck unter den Sollwert fällt.',
        'k.gauge': 'Zeigt den Luftdruck an.',
        'k.position': 'Liefert ein Positionssignal.',
        'k.cylSensor': 'Erfasst den Kolbenmagneten und liefert das Positionssignal des Zylinders.',
        'k.cylSensorPnp': 'Erfasst den Kolbenmagneten und liefert ein PNP-Positionssignal an die SPS.',
        'l.silencer': 'Verringert das Abluftgeräusch.',
        'l.exhaust': 'Entlüftet ins Freie.',
        'l.plug': 'Verschließt einen ungenutzten Anschluss.',
        'l.inlet': 'Kennzeichnet den Eintritt der Leitung in das System.',
        'l.outlet': 'Kennzeichnet den Austritt der Leitung aus dem System.',
        'l.offpage': 'Zeigt, dass die Leitung auf einem anderen Blatt weitergeht.',
        'e.boundary': 'Kennzeichnet eine gemeinsam montierte Baugruppe.',
        sensorTop: (pos) => `Erfasst die ${pos} Stellung des Antriebs.`,
        sensorBox: 'Meldet die Stellung offen / geschlossen der Armatur.',
        drives: (list) => `Steuert ${list}.`,
        coils: (list) => `Spulen: ${list}.`
      },
      sensorName: { top: 'Zylinderschalter, magnetisch', pnp: 'Zylinderschalter, magnetisch (PNP)', box: 'Endlagenschalterbox' }
    }
  };

  const FUNCTION_ORDER = ['dump', 'isolation', 'lowPressure', 'failSafe', 'hold', 'midStop', 'loadHold', 'speed', 'overpressure'];

  function listJoin(items, t) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} ${t.and} ${items[items.length - 1]}`;
  }

  /* ─── Devre grafiği ───────────────────────────────────── */

  class Union {
    constructor() { this.parent = new Map(); }
    find(k) {
      if (!this.parent.has(k)) this.parent.set(k, k);
      let r = k;
      while (this.parent.get(r) !== r) r = this.parent.get(r);
      let c = k;
      while (this.parent.get(c) !== r) {
        const next = this.parent.get(c);
        this.parent.set(c, r);
        c = next;
      }
      return r;
    }
    join(a, b) {
      const ra = this.find(a);
      const rb = this.find(b);
      if (ra !== rb) this.parent.set(ra, rb);
    }
  }

  const term = (id, port) => `${id}#${port}`;
  const pageNumber = (note) => {
    const m = String(note || '').match(/(\d+)\s*$/);
    return m ? parseInt(m[1], 10) : null;
  };

  /** Hat ve doğrudan temas eden portlardan hava ağlarını kurar */
  function buildGraph(drawing, nodes) {
    const u = new Union();
    const signalLines = [];
    const mechLines = [];
    drawing.sheets.forEach((sheet) => {
      for (const it of sheet.items) {
        if (!Model.isLine(it)) continue;
        const meta = Sym.LINE_KINDS[it.kind] || Sym.LINE_KINDS.work;
        const end = (anchor, side) => (anchor.node && anchor.port ? term(anchor.node, anchor.port) : `free:${it.id}:${side}`);
        const a = end(it.from, 'a');
        const b = end(it.to, 'b');
        if (meta.air) u.join(a, b);
        else if (it.kind === 'mech') mechLines.push({ line: it, sheet, a: nodes.get(it.from.node) || null, b: nodes.get(it.to.node) || null });
        else signalLines.push({ line: it, sheet, a: nodes.get(it.from.node) || null, b: nodes.get(it.to.node) || null });
      }
      // Doğrudan temas: susturucu veya tapa valf portuna yapıştırılmış olabilir
      const ports = [];
      for (const it of sheet.items) {
        const node = nodes.get(it.id);
        if (!node || node.role === 'junction') continue;
        for (const p of Model.portsOf(it)) ports.push({ id: it.id, port: p.id, x: p.x, y: p.y });
      }
      for (let i = 0; i < ports.length; i += 1) {
        for (let j = i + 1; j < ports.length; j += 1) {
          const p = ports[i];
          const q = ports[j];
          if (p.id !== q.id && Math.abs(p.x - q.x) < 0.35 && Math.abs(p.y - q.y) < 0.35) u.join(term(p.id, p.port), term(q.id, q.port));
        }
      }
    });
    // Sayfa bağlantıları: "ŞEMA 2" notlu bağlantı, 2. sayfadaki "ŞEMA 1" notlu bağlantıyla birleşir.
    // Karşılığı yoksa (sonradan eklenen sayfa "ŞEMA 1"e bağlanır) hedef sayfadaki bağlantılara bağlanır.
    const pages = [...nodes.values()].filter((n) => n.def.id === 'l.offpage');
    for (const n of pages) {
      u.join(term(n.id, 'L'), term(n.id, 'R'));
      const target = pageNumber(n.item.note);
      if (!target) continue;
      const onTarget = pages.filter((m) => m !== n && m.sheetIndex === target - 1);
      const exact = onTarget.filter((m) => pageNumber(m.item.note) === n.sheetIndex + 1);
      for (const m of exact.length ? exact : onTarget) u.join(term(n.id, 'L'), term(m.id, 'L'));
    }
    const members = new Map();
    for (const node of nodes.values()) {
      for (const p of node.def.ports) {
        const root = u.find(term(node.id, p.id));
        if (!members.has(root)) members.set(root, []);
        members.get(root).push({ node, port: p.id });
      }
    }
    const netOf = (node, port) => u.find(term(node.id, port));
    const others = (node, port) => (members.get(netOf(node, port)) || []).filter((m) => !(m.node === node && m.port === port));
    return { netOf, others, signalLines, mechLines };
  }

  /** Geçiş elemanının (akış kontrol, şartlandırıcı…) diğer ana portu */
  function throughPort(node, port) {
    const main = node.def.ports.filter((p) => p.id !== 'X').map((p) => p.id);
    if (main.length !== 2 || !main.includes(port)) return null;
    return main[0] === port ? main[1] : main[0];
  }
  const isThrough = (node) => node.role === 'flow' || node.role === 'treatment' || node.def.id === 'l.offpage';

  /* ─── Analiz ──────────────────────────────────────────── */

  function analyze(drawing, options) {
    const opts = options || {};
    const lang = TEXT[opts.lang] ? opts.lang : 'tr';
    const t = TEXT[lang];
    const catalog = opts.catalog || new Map();
    const showPid = opts.showPid !== false;

    const pidName = (code) => {
      const e = code ? catalog.get(String(code).toUpperCase()) : null;
      if (!e) return '';
      return lang === 'tr' ? e.name : (e[lang] || e.name);
    };
    const withPid = (label, pid) => (pid && showPid ? `${label} [${pid}]` : label);

    /* Düğümler */
    const nodes = new Map();
    drawing.sheets.forEach((sheet, sheetIndex) => {
      for (const item of sheet.items) {
        if (!Model.isSymbol(item)) continue;
        const def = Sym.get(item.symbol);
        if (!def) continue;
        const tag = String(item.tag || '').trim().toUpperCase();
        const pid = String(item.pid || '').trim().toUpperCase();
        const defName = def.name[lang] || def.name.tr;
        const desc = String(item.desc || '').trim();
        const usesNote = def.role === 'terminal';
        const name = desc || pidName(pid) || (usesNote && item.note) || defName;
        nodes.set(item.id, {
          id: item.id,
          item,
          def,
          sheet,
          sheetIndex,
          tag,
          pid,
          desc,
          role: def.role || 'other',
          defName,
          name,
          short: tag || (usesNote && item.note) || defName,
          label: tag ? (desc ? `${tag} (${desc})` : tag) : name,
          optional: !!item.optional
        });
      }
    });

    const graph = buildGraph(drawing, nodes);
    const coilLabel = (valve, i) => {
      const c = (valve.item.coils || [])[i] || {};
      const base = c.tag || `${valve.short} ${t.coilName(i)}`;
      return withPid(base, c.pid);
    };
    const sensorLabel = (s) => withPid(s.tag || '?', s.pid);
    const actLabel = (n) => n.label;

    /** Aktüatör portundan yön valfine: arada akış kontrol, çek valf… olabilir */
    function valveFor(node, port) {
      const seen = new Set([node.id]);
      const queue = [{ node, port, via: [] }];
      while (queue.length) {
        const cur = queue.shift();
        for (const m of graph.others(cur.node, cur.port)) {
          if (m.node.role === 'directional' && (m.port === '2' || m.port === '4')) return { valve: m.node, vport: m.port, via: cur.via };
          if (isThrough(m.node) && !seen.has(m.node.id)) {
            const other = throughPort(m.node, m.port);
            if (!other) continue;
            seen.add(m.node.id);
            queue.push({ node: m.node, port: other, via: cur.via.concat(m.node) });
          }
        }
      }
      return null;
    }

    /** Valfin besleme portundan kaynağa giden yol (valf hariç, kaynak dahil) */
    function upstream(valve) {
      const path = [];
      const seen = new Set([valve.id]);
      let cur = { node: valve, port: '1' };
      for (let guard = 0; guard < 60 && cur; guard += 1) {
        let next = null;
        for (const m of graph.others(cur.node, cur.port)) {
          if (seen.has(m.node.id)) continue;
          if (m.node.role === 'source') {
            path.push(m.node);
            return path;
          }
          if (m.node.role === 'directional' && m.port === '2') {
            next = { node: m.node, port: '1' };
            break;
          }
          if (isThrough(m.node)) {
            const other = throughPort(m.node, m.port);
            if (other) {
              next = { node: m.node, port: other };
              break;
            }
          }
        }
        if (!next) break;
        seen.add(next.node.id);
        if (next.node.def.id !== 'l.offpage') path.push(next.node);
        cur = next;
      }
      return path;
    }

    const logicRows = [];
    const safetyRows = [];
    const hints = [];
    const mapping = [];

    const actuators = [...nodes.values()].filter((n) => n.role === 'actuator').sort((a, b) => Link.compareIso(a.short, b.short));
    const valves = [...nodes.values()].filter((n) => n.role === 'directional').sort((a, b) => Link.compareIso(a.short, b.short));
    const drivenBy = new Map();
    const consumers = new Set();

    /* Aktüatör ↔ valf */
    for (const act of actuators) {
      const kind = act.def.act || {};
      const links = [];
      for (const p of act.def.ports) {
        const found = valveFor(act, p.id);
        if (found) links.push(Object.assign({ aport: p.id }, found));
      }
      if (!links.length) {
        hints.push({ level: 'warn', code: 'actuator-novalve', msg: t.s.noValve(act.short), sheetId: act.sheet.id, itemId: act.id });
        continue;
      }
      const byValve = new Map();
      for (const l of links) {
        if (!byValve.has(l.valve.id)) byValve.set(l.valve.id, []);
        byValve.get(l.valve.id).push(l);
      }
      for (const [, group] of byValve) {
        const valve = group[0].valve;
        consumers.add(valve.id);
        if (!drivenBy.has(valve.id)) drivenBy.set(valve.id, []);
        drivenBy.get(valve.id).push(act);
        const v = valve.def.valve || {};
        const motionIn = (state) => {
          const map = v[state];
          if (!map) return null;
          for (const l of group) if (map[l.vport] === 'P' && kind[l.aport]) return kind[l.aport];
          if (kind.spring && group.some((l) => map[l.vport] === 'E')) return kind.spring;
          return null;
        };
        const optional = act.optional || valve.optional;
        const coilCount = (valve.def.coils || 0);
        const row = (text, route, group2) => logicRows.push({
          group: group2 || 'control', type: t.types[group2 || 'control'], route, text, optional,
          sheetId: act.sheet.id, itemId: act.id, circuit: circuitOf(act.short)
        });
        if (coilCount) {
          ['a', 'b'].slice(0, coilCount).forEach((state, i) => {
            const motion = motionIn(state);
            if (!motion) return;
            const coil = (valve.item.coils || [])[i] || {};
            row(t.s.energize(coilLabel(valve, i), valve.short, actLabel(act), t.motion[motion]),
              `${coil.tag || t.coilName(i)} → ${valve.short} → ${act.short}`);
          });
        } else {
          const motion = motionIn('a');
          if (motion) row(t.s.manual(valve.short, actLabel(act)), `${valve.short} → ${act.short}`);
        }
        if (v.rest === 'spring') {
          const motion = motionIn('n');
          if (motion) row(t.s.rest(valve.short, act.short, t.motion[motion]), `${valve.short} → ${act.short}`);
        } else if (v.rest === 'hold') {
          row(t.s.hold(valve.short), valve.short);
        } else if (v.rest === 'center') {
          const closed = Object.values(v.n || {}).every((s) => s === 'X');
          row(closed ? t.s.centerClosed(valve.short, act.short) : t.s.centerExhaust(valve.short, act.short), `${valve.short} → ${act.short}`);
        }
        const via = [...new Set(group.flatMap((l) => l.via))];
        const speeds = via.filter((n) => n.def.flow && (n.def.flow.kind === 'flowCheck' || n.def.flow.kind === 'throttle'));
        const holds = via.filter((n) => n.def.flow && n.def.flow.kind === 'pilotCheck');
        const quick = via.filter((n) => n.def.flow && n.def.flow.kind === 'quickExhaust');
        if (speeds.length) row(t.s.speed(listJoin(speeds.map((n) => n.short), t), act.short), `${speeds.map((n) => n.short).join(', ')} → ${act.short}`, 'speed');
        if (holds.length) row(t.s.loadHold(listJoin(holds.map((n) => n.short), t), act.short), `${holds.map((n) => n.short).join(', ')} → ${act.short}`, 'speed');
        if (quick.length) row(t.s.quick(listJoin(quick.map((n) => n.short), t), act.short), `${quick.map((n) => n.short).join(', ')} → ${act.short}`, 'speed');
        act.links = (act.links || []).concat(group);
        act.speeds = (act.speeds || []).concat(speeds);
        act.holds = (act.holds || []).concat(holds);
        act.valve = valve;
      }
    }

    /* Sensörler (aktüatöre bağlı) */
    const positionWord = (act, pos) => {
      const kind = (act.def.act || {}).kind;
      const words = kind === 'linear' ? t.position.linear : kind === 'valve' ? t.position.valve : t.position.other;
      return pos >= 0.75 ? words[2] : pos <= 0.25 ? words[0] : words[1];
    };
    for (const node of nodes.values()) {
      const list = node.item.sensors || [];
      if (!node.def.sensors || !list.length) continue;
      list.forEach((s) => {
        const side = node.def.sensors.layout === 'side';
        const text = side ? t.s.feedbackBox(sensorLabel(s), node.short) : t.s.feedback(sensorLabel(s), node.short, positionWord(node, +s.pos || 0));
        logicRows.push({
          group: 'feedback', type: t.types.feedback, route: `${s.tag || '?'} → ${node.short}`, text, optional: node.optional,
          sheetId: node.sheet.id, itemId: node.id, circuit: circuitOf(s.tag || node.short)
        });
      });
    }
    for (const node of nodes.values()) {
      if (node.def.sense !== 'position') continue;
      logicRows.push({
        group: 'feedback', type: t.types.feedback, route: node.short, text: t.s.feedbackFree(withPid(node.short, node.pid)),
        optional: node.optional, sheetId: node.sheet.id, itemId: node.id, circuit: circuitOf(node.short)
      });
    }

    /* Besleme: ortak yol, ana valf, dağıtım */
    const consumerValves = valves.filter((v) => consumers.has(v.id));
    // Ortak besleme yolu yalnız kaynağa ulaşan valflerden çıkarılır; bağlantısı kopuk bir valf zinciri bozmaz
    const paths = consumerValves.map((v) => upstream(v).reverse()).filter((p) => p.length && p[0].role === 'source');
    let chain = [];
    if (paths.length) {
      chain = paths[0].slice();
      for (const p of paths.slice(1)) {
        let k = 0;
        while (k < chain.length && k < p.length && chain[k] === p[k]) k += 1;
        chain = chain.slice(0, k);
      }
    }
    const supplyNodes = chain.filter((n) => n.role !== 'junction');
    const mainValves = supplyNodes.filter((n) => n.role === 'directional');
    if (supplyNodes.length) {
      const names = supplyNodes.filter((n) => n.role !== 'source').map((n) => n.short);
      if (names.length) {
        logicRows.push({
          group: 'supply', type: t.types.supply, route: supplyNodes.map((n) => n.short).join(' → '),
          text: t.s.chain(names.join(' → ')), optional: false, sheetId: supplyNodes[0].sheet.id, itemId: supplyNodes[0].id, circuit: 0
        });
      }
      const last = supplyNodes[supplyNodes.length - 1];
      logicRows.push({
        group: 'supply', type: t.types.supply, route: `${last.short} → ${consumerValves.map((v) => v.short).join(', ')}`,
        text: t.s.distribution(last.short, listJoin(consumerValves.map((v) => v.short), t)), optional: false,
        sheetId: last.sheet.id, itemId: last.id, circuit: 0
      });
    }
    for (const mv of mainValves) {
      if (mv.def.coils) {
        logicRows.push({
          group: 'control', type: t.types.control, route: `${((mv.item.coils || [])[0] || {}).tag || t.coilName(0)} → ${mv.short}`,
          text: t.s.mainValve(coilLabel(mv, 0), mv.short), optional: mv.optional, sheetId: mv.sheet.id, itemId: mv.id, circuit: 0
        });
      }
    }
    for (const n of supplyNodes) {
      if (n.def.id === 's.ballValve' || n.def.id === 'v.32manual') {
        logicRows.push({
          group: 'supply', type: t.types.supply, route: n.short, text: t.s.manualShutoff(n.short), optional: n.optional,
          sheetId: n.sheet.id, itemId: n.id, circuit: 0
        });
      }
    }
    const pressureSensors = [...nodes.values()].filter((n) => n.def.sense === 'pressure' || n.def.sense === 'pressureSwitch');
    for (const s of pressureSensors) {
      logicRows.push({
        group: 'monitor', type: t.types.monitor, route: s.short, text: t.s.pressure(withPid(s.short, s.pid), t.s.pressureWhere),
        optional: s.optional, sheetId: s.sheet.id, itemId: s.id, circuit: circuitOf(s.short)
      });
    }

    /* Sinyal ve mekanik hatlar */
    const endName = (n) => (n ? n.short : t.free);
    for (const e of graph.signalLines) {
      if ((e.a && e.a.role === 'junction') || (e.b && e.b.role === 'junction')) continue;
      logicRows.push({
        group: 'signal', type: t.types.signal, route: `${endName(e.a)} → ${endName(e.b)}`, text: t.s.signal(endName(e.a), endName(e.b)),
        optional: !!e.line.optional, sheetId: e.sheet.id, itemId: e.line.id, circuit: 99
      });
    }
    for (const e of graph.mechLines) {
      logicRows.push({
        group: 'mech', type: t.types.mech, route: `${endName(e.a)} → ${endName(e.b)}`, text: t.s.mech(endName(e.a), endName(e.b)),
        optional: !!e.line.optional, sheetId: e.sheet.id, itemId: e.line.id, circuit: 99
      });
    }

    const groupOrder = { supply: 0, control: 1, speed: 2, feedback: 3, monitor: 4, signal: 5, mech: 6 };
    logicRows.forEach((r, i) => { r.order = i; });
    logicRows.sort((a, b) => {
      const ca = a.circuit == null ? 98 : a.circuit;
      const cb = b.circuit == null ? 98 : b.circuit;
      if (ca !== cb) return ca - cb;
      return groupOrder[a.group] - groupOrder[b.group] || a.order - b.order;
    });

    /* Güvenlik fonksiyonları */
    const allActs = actuators.filter((a) => a.valve);
    const downstreamOf = (mv) => allActs.filter((a) => upstream(a.valve).includes(mv));
    for (const mv of mainValves) {
      const v = mv.def.valve || {};
      if (!(mv.def.coils && v.rest === 'spring' && mv.def.ports.some((p) => p.id === '3'))) continue;
      safetyRows.push({
        fnKey: 'dump', fn: t.functions.dump, trigger: `${t.safety.powerLoss} (${coilLabel(mv, 0)})`,
        affected: downstreamOf(mv).map((a) => a.short), logic: t.safety.dump(coilLabel(mv, 0), mv.short),
        connected: true, optional: mv.optional, sheetId: mv.sheet.id, itemId: mv.id
      });
    }
    for (const n of supplyNodes) {
      if (n.def.id !== 's.ballValve' && n.def.id !== 'v.32manual') continue;
      safetyRows.push({
        fnKey: 'isolation', fn: t.functions.isolation, trigger: n.short, affected: allActs.map((a) => a.short),
        logic: n.def.id === 'v.32manual' ? t.safety.isolationDump(n.short) : t.safety.isolation(n.short),
        connected: true, optional: n.optional, sheetId: n.sheet.id, itemId: n.id
      });
    }
    for (const s of pressureSensors) {
      safetyRows.push({
        fnKey: 'lowPressure', fn: t.functions.lowPressure, trigger: withPid(s.short, s.pid), affected: allActs.map((a) => a.short),
        logic: t.safety.lowPressure(withPid(s.short, s.pid)), connected: true, optional: s.optional, sheetId: s.sheet.id, itemId: s.id
      });
    }
    const springActs = allActs.filter((a) => a.valve && (a.valve.def.valve || {}).rest === 'spring');
    if (springActs.length) {
      const parts = [];
      const byMotion = new Map();
      for (const a of springActs) {
        const v = a.valve.def.valve;
        const kind = a.def.act || {};
        let motion = null;
        for (const l of a.links) if ((v.n || {})[l.vport] === 'P' && kind[l.aport]) motion = kind[l.aport];
        if (!motion && kind.spring) motion = kind.spring;
        if (!motion) continue;
        if (!byMotion.has(motion)) byMotion.set(motion, []);
        byMotion.get(motion).push(a.short);
      }
      for (const [motion, acts] of byMotion) {
        const verb = acts.length > 1 && t.motionPl ? t.motionPl[motion] : t.motion[motion];
        parts.push(`${listJoin(acts, t)} ${verb}`);
      }
      if (parts.length) {
        safetyRows.push({
          fnKey: 'failSafe', fn: t.functions.failSafe, trigger: t.safety.powerLoss, affected: springActs.map((a) => a.short),
          logic: t.safety.failSafe(parts.join('; ')), connected: true, optional: false,
          sheetId: springActs[0].sheet.id, itemId: springActs[0].id
        });
      }
    }
    const holdActs = allActs.filter((a) => (a.valve.def.valve || {}).rest === 'hold');
    if (holdActs.length) {
      const vs = [...new Set(holdActs.map((a) => a.valve.short))];
      safetyRows.push({
        fnKey: 'hold', fn: t.functions.hold, trigger: t.safety.powerLoss, affected: holdActs.map((a) => a.short),
        logic: t.safety.hold(listJoin(vs, t), listJoin(holdActs.map((a) => a.short), t)), connected: true, optional: false,
        sheetId: holdActs[0].sheet.id, itemId: holdActs[0].id
      });
    }
    for (const a of allActs) {
      const v = a.valve.def.valve || {};
      if (v.rest === 'center' && Object.values(v.n || {}).every((s) => s === 'X')) {
        safetyRows.push({
          fnKey: 'midStop', fn: t.functions.midStop, trigger: t.safety.powerLoss, affected: [a.short],
          logic: t.safety.midStop(a.valve.short, a.short), connected: true, optional: a.optional, sheetId: a.sheet.id, itemId: a.id
        });
      }
      if (a.holds && a.holds.length) {
        safetyRows.push({
          fnKey: 'loadHold', fn: t.functions.loadHold, trigger: listJoin(a.holds.map((n) => n.short), t), affected: [a.short],
          logic: t.safety.loadHold(listJoin(a.holds.map((n) => n.short), t), a.short), connected: true, optional: a.optional,
          sheetId: a.sheet.id, itemId: a.id
        });
      }
    }
    const speedActs = allActs.filter((a) => a.speeds && a.speeds.length);
    if (speedActs.length) {
      const fcs = [...new Set(speedActs.flatMap((a) => a.speeds.map((n) => n.short)))];
      safetyRows.push({
        fnKey: 'speed', fn: t.functions.speed, trigger: listJoin(fcs, t), affected: speedActs.map((a) => a.short),
        logic: t.safety.speed(listJoin(fcs, t), listJoin(speedActs.map((a) => a.short), t)), connected: true, optional: false,
        sheetId: speedActs[0].sheet.id, itemId: speedActs[0].id
      });
    }
    const limiters = [...nodes.values()].filter((n) => n.def.id === 'f.relief' || n.def.id === 'f.regulator' ||
      ((n.def.id === 's.frl' || n.def.id === 's.fr') && supplyNodes.includes(n)));
    if (limiters.length) {
      safetyRows.push({
        fnKey: 'overpressure', fn: t.functions.overpressure, trigger: listJoin(limiters.map((n) => n.short), t), affected: [],
        logic: t.safety.overpressure(listJoin(limiters.map((n) => n.short), t)), connected: true, optional: false,
        sheetId: limiters[0].sheet.id, itemId: limiters[0].id
      });
    }
    const rank = (key) => {
      const i = FUNCTION_ORDER.indexOf(key);
      return i < 0 ? FUNCTION_ORDER.length : i;
    };
    safetyRows.sort((a, b) => rank(a.fnKey) - rank(b.fnKey) || String(a.trigger).localeCompare(String(b.trigger), 'tr', { numeric: true }));
    safetyRows.forEach((row, i) => { row.no = `GF-${String(i + 1).padStart(2, '0')}`; });

    /* Kontroller (yalnız ekranda) */
    for (const valve of valves) {
      const used = (port) => graph.others(valve, port).length > 0;
      if (valve.def.ports.some((p) => p.id === '1') && !used('1')) {
        hints.push({ level: 'warn', code: 'valve-nosupply', msg: `${valve.short}: besleme portu (1) bağlı değil`, sheetId: valve.sheet.id, itemId: valve.id });
      }
      const feedsOthers = mainValves.includes(valve);
      for (const p of valve.def.ports.filter((q) => q.id === '2' || q.id === '4')) {
        if (!used(p.id) && !feedsOthers) {
          hints.push({ level: 'warn', code: 'valve-port-open', msg: `${valve.short}: çalışma portu (${p.id}) bağlı değil`, sheetId: valve.sheet.id, itemId: valve.id });
        }
      }
      for (const p of valve.def.ports.filter((q) => q.id === '3' || q.id === '5')) {
        if (!used(p.id)) {
          hints.push({ level: 'info', code: 'exhaust-open', msg: `${valve.short}: egzoz portu (${p.id}) açık, susturucu ekleyin`, sheetId: valve.sheet.id, itemId: valve.id });
        }
      }
      (valve.item.coils || []).forEach((c, i) => {
        if (!c.pid) {
          hints.push({ level: 'warn', code: 'coil-nopid', msg: `${c.tag || `${valve.short} ${t.coilName(i)}`}: bobin P&ID koduna bağlı değil`, sheetId: valve.sheet.id, itemId: valve.id });
        }
      });
    }
    if (valves.length && !mainValves.some((mv) => mv.def.coils && (mv.def.valve || {}).rest === 'spring')) {
      hints.push({ level: 'info', code: 'no-dump', msg: 'Tahliyeli ana valf yok: ISO 4414, enerji kesilince sistem havasının tahliyesini ister', sheetId: null, itemId: null });
    }
    if (catalog.size) {
      for (const node of nodes.values()) {
        for (const part of Model.partsOf(node.item)) {
          const code = String(part.pid || '').trim().toUpperCase();
          if (code && !catalog.has(code)) {
            hints.push({ level: 'warn', code: 'pid-unknown', msg: `${part.tag || node.short}: P&ID kodu ${code} kod listesinde yok`, sheetId: node.sheet.id, itemId: node.id });
          }
        }
      }
    }
    if (opts.pidCodes && opts.pidCodes.length) {
      const linked = Model.usedPids(drawing);
      for (const code of opts.pidCodes) {
        const key = String(code).toUpperCase();
        if (!linked.has(key)) {
          hints.push({ level: 'warn', code: 'pid-missing', msg: `${key} P&ID'de var, pnömatik şemada eşleşmesi yok`, sheetId: null, itemId: null, pid: key });
        }
      }
    }

    /* Bileşen listesi */
    function neighbours(node) {
      const out = [];
      for (const p of node.def.ports) {
        for (const m of graph.others(node, p.id)) {
          if (m.node.role === 'junction' || m.node.role === 'exhaust' || m.node.role === 'plug' || m.node.def.id === 'l.offpage') continue;
          // Aynı ana hattan beslenen valfler yalnız ana valfin (port 2) bağlantısıdır; kardeşler ve sensörler için sayılmaz
          if (m.node.role === 'directional' && m.port === '1' && !(node.role === 'directional' && p.id === '2')) continue;
          if (!out.includes(m.node.short)) out.push(m.node.short);
        }
      }
      return out;
    }
    const components = [];
    for (const node of nodes.values()) {
      if (node.role === 'junction' || node.role === 'exhaust' || node.role === 'plug' || node.def.id === 'l.offpage') continue;
      const coils = (node.item.coils || []);
      const pids = [node.pid].concat(coils.map((c) => String(c.pid || '').toUpperCase())).filter(Boolean);
      let purpose = t.purposes[node.def.id] || '';
      const drives = drivenBy.get(node.id);
      if (drives && drives.length) purpose = `${t.purposes.drives(listJoin(drives.map(actLabel), t))} ${purpose}`;
      if (coils.some((c) => c.tag || c.pid)) purpose += ` ${t.purposes.coils(coils.map((c, i) => coilLabel(node, i)).join(', '))}`;
      if (node.role === 'actuator' && node.desc) purpose = `${node.desc}. ${purpose}`;
      components.push({
        tag: node.tag,
        pid: [...new Set(pids)].join(' / '),
        name: node.role === 'actuator' || node.role === 'directional' ? node.defName : node.name,
        symbol: node.item.symbol,
        purpose: purpose.trim(),
        qty: 1,
        links: neighbours(node),
        sheets: [node.sheetIndex + 1],
        optional: node.optional,
        sheetId: node.sheet.id,
        itemId: node.id
      });
      (node.item.sensors || []).forEach((s) => {
        const side = node.def.sensors && node.def.sensors.layout === 'side';
        components.push({
          tag: String(s.tag || '').toUpperCase(),
          pid: String(s.pid || '').toUpperCase(),
          name: side ? t.sensorName.box : s.type === 'pnp' ? t.sensorName.pnp : t.sensorName.top,
          symbol: side ? 'k.position' : s.type === 'pnp' ? 'k.cylSensorPnp' : 'k.cylSensor',
          purpose: side ? t.purposes.sensorBox : t.purposes.sensorTop(positionWord(node, +s.pos || 0)),
          qty: 1,
          links: [node.short],
          sheets: [node.sheetIndex + 1],
          optional: node.optional,
          sheetId: node.sheet.id,
          itemId: node.id
        });
      });
    }
    // Kodsuz aynı bileşenler (susturucu hariç) tek satırda toplanır
    const merged = [];
    const byKey = new Map();
    for (const row of components) {
      if (row.tag) {
        merged.push(row);
        continue;
      }
      const key = `${row.symbol}|${row.name}|${row.optional}`;
      const prev = byKey.get(key);
      if (prev) {
        prev.qty += 1;
        for (const s of row.sheets) if (!prev.sheets.includes(s)) prev.sheets.push(s);
      } else {
        byKey.set(key, row);
        merged.push(row);
      }
    }
    merged.sort((a, b) => {
      if (!!a.tag !== !!b.tag) return a.tag ? -1 : 1;
      return Link.compareIso(a.tag || a.name, b.tag || b.name);
    });

    /* Kod eşleştirme: P&ID kodu olan her pnömatik kod */
    for (const node of nodes.values()) {
      const circuit = circuitOf(node.tag);
      const sheetNo = node.sheetIndex + 1;
      const coils = node.item.coils || [];
      const coilPids = coils.map((c) => String(c.pid || '').toUpperCase()).filter(Boolean);
      if (node.role === 'directional' && (node.tag || coilPids.length)) {
        if (coilPids.length || node.pid) {
          const pids = [...new Set([node.pid].concat(coilPids).filter(Boolean))];
          mapping.push({
            circuit, code: node.tag || '—', pid: pids.join(' / '), kind: 'valve', strong: true,
            component: `${node.defName}${node.desc ? ` · ${node.desc}` : ''}`,
            pidName: pids.length === 1 ? pidName(pids[0]) : '',
            sheet: sheetNo, optional: node.optional, sheetId: node.sheet.id, itemId: node.id
          });
        }
        coils.forEach((c, i) => {
          const pid = String(c.pid || '').toUpperCase();
          if (!pid) return;
          mapping.push({
            circuit, code: c.tag || `${node.short} ${t.coilName(i)}`, pid, kind: 'coil', parent: node.tag,
            component: `${node.short} ${t.parts.coil} (${i === 0 ? '14' : '12'})`, pidName: pidName(pid),
            sheet: sheetNo, optional: node.optional, sheetId: node.sheet.id, itemId: node.id
          });
        });
        continue;
      }
      if (node.pid) {
        mapping.push({
          circuit, code: node.tag || '—', pid: node.pid, kind: node.role === 'actuator' ? 'actuator' : 'item',
          component: `${node.defName}${node.desc ? ` · ${node.desc}` : ''}`, pidName: pidName(node.pid),
          sheet: sheetNo, optional: node.optional, sheetId: node.sheet.id, itemId: node.id
        });
      }
      (node.item.sensors || []).forEach((s) => {
        const pid = String(s.pid || '').toUpperCase();
        if (!pid) return;
        const side = node.def.sensors && node.def.sensors.layout === 'side';
        mapping.push({
          circuit: circuitOf(s.tag) == null ? circuit : circuitOf(s.tag), code: s.tag || '—', pid, kind: 'sensor', parent: node.tag,
          component: `${node.short} ${side ? t.sensorName.box : t.parts.magSensor}`, pidName: pidName(pid),
          sheet: sheetNo, optional: node.optional, sheetId: node.sheet.id, itemId: node.id
        });
      });
    }
    const kindOrder = { actuator: 0, valve: 1, coil: 2, sensor: 3, item: 4 };
    mapping.sort((a, b) => {
      const ca = a.circuit == null ? 999 : a.circuit;
      const cb = b.circuit == null ? 999 : b.circuit;
      if (ca !== cb) return ca - cb;
      const pa = a.kind === 'coil' && a.parent ? a.parent : a.code;
      const pb = b.kind === 'coil' && b.parent ? b.parent : b.code;
      return Link.compareIso(pa, pb) || kindOrder[a.kind] - kindOrder[b.kind] || Link.compareIso(a.code, b.code);
    });
    const differs = mapping.filter((r) => String(r.code).toUpperCase() !== String(r.pid).toUpperCase()).length;

    return { lang, text: t, components: merged, logic: logicRows, safety: safetyRows, mapping, mappingDiffers: differs, hints };
  }

  function circuitOf(code) {
    const p = Link.parseIso(code);
    return p ? p.circuit : null;
  }

  return { TEXT, analyze, listJoin };
});
