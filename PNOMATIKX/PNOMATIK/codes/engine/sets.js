/* Hazır setler: sembol listesinden tek tıkla konan, sık kullanılan devre parçaları.
   Her set çizimdeki gibi sembol, hat, yazı ve kodlardan oluşur; konunca yeni kimlik alır ve gruplanır.
   PNO(AIR): besleme (kaynak, şartlandırıcı, 0V2 ana valf V47) + iki kapak silindiri (5V1 V48/V49, SW18)
   PNO(SMC): SMC besleme (0V1 kilitlenebilir kesme, 0Z1, 0V2 yumuşak başlatma, 0B1) + kilitli iki silindir (1V1 5/3, 1V2 kilit)
   Setler bu dosyada veri olarak durur; değiştirmek için çizimi düzenleyip öğeleri buraya yazın. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./model.js'));
  else root.PnoSets = factory(root.PidModel);
})(typeof self !== 'undefined' ? self : this, function (Model) {
  'use strict';

  const SETS = [
    {
      id: 'smc',
      name: 'PNO(SMC)',
      note: 'SMC besleme (yumuşak başlatma, basınç şalteri) ve kilitli iki silindir',
      items: [
      {"id":"nmw4wlqx82zs1","type":"symbol","symbol":"s.source","x":26,"y":197.5,"rot":90,"flip":false,"tag":"","optional":false,"note":"BASINÇLI HAVA 6 bar"},
      {"id":"nmw4wlqx83plo","type":"symbol","symbol":"v.32manual","x":72,"y":195,"rot":90,"flip":false,"tag":"0V1","optional":false},
      {"id":"nmw4wlqx84hab","type":"symbol","symbol":"s.fr","x":110,"y":197.5,"rot":0,"flip":false,"tag":"0Z1","optional":false},
      {"id":"nmw4wlqx85t1y","type":"symbol","symbol":"v.softStart","x":148,"y":195,"rot":90,"flip":false,"tag":"0V2","optional":false,"coils":[{"tag":"0Y1","pid":""}]},
      {"id":"nmw4wlqx86cc2","type":"symbol","symbol":"l.silencer","x":61,"y":202.5,"rot":90,"flip":false,"tag":"","optional":false},
      {"id":"nmw4wlqx87yvr","type":"symbol","symbol":"l.silencer","x":137,"y":202.5,"rot":90,"flip":false,"tag":"","optional":false},
      {"id":"lmw4wlqx88ynd","type":"line","kind":"supply","from":{"node":"nmw4wlqx82zs1","port":"1"},"to":{"node":"nmw4wlqx83plo","port":"1"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[29.4,197.5],[67,197.5]]},
      {"id":"lmw4wlqx9937d","type":"line","kind":"supply","from":{"node":"nmw4wlqx83plo","port":"2"},"to":{"node":"nmw4wlqx84hab","port":"1"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[77,197.5],[99,197.5]]},
      {"id":"lmw4wlqxaao7o","type":"line","kind":"supply","from":{"node":"nmw4wlqx84hab","port":"2"},"to":{"node":"nmw4wlqx85t1y","port":"1"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[121,197.5],[143,197.5]]},
      {"id":"lmw4wlqxaby3i","type":"line","kind":"work","from":{"node":"nmw4wlqx83plo","port":"3"},"to":{"node":"nmw4wlqx86cc2","port":"P"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[67,202.5],[61,202.5]]},
      {"id":"lmw4wlqxacdcp","type":"line","kind":"work","from":{"node":"nmw4wlqx85t1y","port":"3"},"to":{"node":"nmw4wlqx87yvr","port":"P"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[143,202.5],[137,202.5]]},
      {"id":"nmw4wlqxadiyd","type":"symbol","symbol":"k.pressureSwitch","x":180,"y":183,"rot":0,"flip":false,"tag":"0B1","optional":false},
      {"id":"nmw4wlqxae0i1","type":"symbol","symbol":"l.junction","x":180,"y":197.5,"rot":0,"flip":false,"tag":"","optional":false,"showDot":true},
      {"id":"nmw4wlqxafalv","type":"symbol","symbol":"l.junction","x":222,"y":197.5,"rot":0,"flip":false,"tag":"","optional":false,"showDot":true},
      {"id":"nmw4wlqxag8ov","type":"symbol","symbol":"l.junction","x":305,"y":197.5,"rot":0,"flip":false,"tag":"","optional":false,"showDot":false},
      {"id":"lmw4wlqxahc3w","type":"line","kind":"supply","from":{"node":"nmw4wlqx85t1y","port":"2"},"to":{"node":"nmw4wlqxae0i1","port":"C"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[153,197.5],[180,197.5]]},
      {"id":"lmw4wlqxbizbe","type":"line","kind":"work","from":{"node":"nmw4wlqxae0i1","port":"C"},"to":{"node":"nmw4wlqxadiyd","port":"1"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[180,197.5],[180,186.5]]},
      {"id":"lmw4wlqxbjisi","type":"line","kind":"supply","from":{"node":"nmw4wlqxae0i1","port":"C"},"to":{"node":"nmw4wlqxafalv","port":"C"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[180,197.5],[222,197.5]]},
      {"id":"lmw4wlqxckukg","type":"line","kind":"supply","from":{"node":"nmw4wlqxafalv","port":"C"},"to":{"node":"nmw4wlqxag8ov","port":"C"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[222,197.5],[305,197.5]]},
      {"id":"nmw4wlqxcl6bq","type":"symbol","symbol":"v.32nc","x":220,"y":155,"rot":0,"flip":false,"tag":"1V2","optional":false,"coils":[{"tag":"1Y3","pid":""}]},
      {"id":"nmw4wlqxcm052","type":"symbol","symbol":"v.53exhaust","x":303,"y":155,"rot":0,"flip":false,"tag":"1V1","optional":false,"coils":[{"tag":"1Y1","pid":""},{"tag":"1Y2","pid":""}]},
      {"id":"lmw4wlqxcnh34","type":"line","kind":"work","from":{"node":"nmw4wlqxafalv","port":"C"},"to":{"node":"nmw4wlqxcl6bq","port":"1"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[222,197.5],[222,165],[222.5,165],[222.5,160]]},
      {"id":"lmw4wlqxcoa1p","type":"line","kind":"work","from":{"node":"nmw4wlqxag8ov","port":"C"},"to":{"node":"nmw4wlqxcm052","port":"1"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[305,197.5],[305,165],[303,165],[303,160]]},
      {"id":"nmw4wlqxcp219","type":"symbol","symbol":"l.silencer","x":227.5,"y":163,"rot":0,"flip":false,"tag":"","optional":false},
      {"id":"lmw4wlqxcqz7n","type":"line","kind":"work","from":{"node":"nmw4wlqxcl6bq","port":"3"},"to":{"node":"nmw4wlqxcp219","port":"P"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[227.5,160],[227.5,163]]},
      {"id":"nmw4wlqxcrqpf","type":"symbol","symbol":"l.silencer","x":300.5,"y":163,"rot":0,"flip":false,"tag":"","optional":false},
      {"id":"lmw4wlqxcsxde","type":"line","kind":"work","from":{"node":"nmw4wlqxcm052","port":"5"},"to":{"node":"nmw4wlqxcrqpf","port":"P"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[300.5,160],[300.5,163]]},
      {"id":"nmw4wlqxdtyg4","type":"symbol","symbol":"l.silencer","x":305.5,"y":163,"rot":0,"flip":false,"tag":"","optional":false},
      {"id":"lmw4wlqxduz29","type":"line","kind":"work","from":{"node":"nmw4wlqxcm052","port":"3"},"to":{"node":"nmw4wlqxdtyg4","port":"P"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[305.5,160],[305.5,163]]},
      {"id":"nmw4wlqxdvfou","type":"symbol","symbol":"a.cylLock","x":262,"y":72,"rot":270,"flip":false,"tag":"1A1","optional":false,"sensors":[]},
      {"id":"nmw4wlqxdw7if","type":"symbol","symbol":"a.cylLock","x":352,"y":72,"rot":270,"flip":false,"tag":"1A2","optional":false,"sensors":[]},
      {"id":"nmw4wlqxdxaa1","type":"symbol","symbol":"f.throttle","x":282,"y":85,"rot":0,"flip":false,"tag":"1V3","optional":false},
      {"id":"nmw4wlqxdyi12","type":"symbol","symbol":"f.throttle","x":282,"y":65,"rot":0,"flip":false,"tag":"1V4","optional":false},
      {"id":"nmw4wlqxdz08u","type":"symbol","symbol":"f.throttle","x":372,"y":85,"rot":0,"flip":false,"tag":"1V5","optional":false},
      {"id":"nmw4wlqxd1079h","type":"symbol","symbol":"f.throttle","x":372,"y":65,"rot":0,"flip":false,"tag":"1V6","optional":false},
      {"id":"lmw4wlqxd119au","type":"line","kind":"work","from":{"node":"nmw4wlqxdvfou","port":"A"},"to":{"node":"nmw4wlqxdxaa1","port":"A"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[266.5,84],[273.167,84],[273.167,85],[277,85]]},
      {"id":"lmw4wlqxd12asb","type":"line","kind":"work","from":{"node":"nmw4wlqxdvfou","port":"B"},"to":{"node":"nmw4wlqxdyi12","port":"A"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[266.5,64],[273.167,64],[273.167,65],[277,65]]},
      {"id":"lmw4wlqxe13pk8","type":"line","kind":"work","from":{"node":"nmw4wlqxdw7if","port":"A"},"to":{"node":"nmw4wlqxdz08u","port":"A"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[356.5,84],[363.167,84],[363.167,85],[367,85]]},
      {"id":"lmw4wlqxe14qjg","type":"line","kind":"work","from":{"node":"nmw4wlqxdw7if","port":"B"},"to":{"node":"nmw4wlqxd1079h","port":"A"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[356.5,64],[363.167,64],[363.167,65],[367,65]]},
      {"id":"nmw4wlqxe157gw","type":"symbol","symbol":"l.junction","x":300,"y":118,"rot":0,"flip":false,"tag":"","optional":false,"showDot":true},
      {"id":"nmw4wlqxe16h2j","type":"symbol","symbol":"l.junction","x":305,"y":126,"rot":0,"flip":false,"tag":"","optional":false,"showDot":true},
      {"id":"lmw4wlqxe17u8y","type":"line","kind":"work","from":{"node":"nmw4wlqxcm052","port":"4"},"to":{"node":"nmw4wlqxe157gw","port":"C"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[300.5,150],[300.5,132.5],[300,132.5],[300,118]]},
      {"id":"lmw4wlqxe18t9z","type":"line","kind":"work","from":{"node":"nmw4wlqxe157gw","port":"C"},"to":{"node":"nmw4wlqxdxaa1","port":"B"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[300,118],[300,85],[287,85]]},
      {"id":"lmw4wlqxf19w47","type":"line","kind":"work","from":{"node":"nmw4wlqxe157gw","port":"C"},"to":{"node":"nmw4wlqxdz08u","port":"B"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[300,118],[382,118],[382,85],[377,85]]},
      {"id":"lmw4wlqxg1aktn","type":"line","kind":"work","from":{"node":"nmw4wlqxcm052","port":"2"},"to":{"node":"nmw4wlqxe16h2j","port":"C"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[305.5,150],[305.5,135],[305,135],[305,126]]},
      {"id":"lmw4wlqxg1b4mh","type":"line","kind":"work","from":{"node":"nmw4wlqxe16h2j","port":"C"},"to":{"node":"nmw4wlqxdyi12","port":"B"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[305,126],[305,65],[287,65]]},
      {"id":"lmw4wlqxh1c78q","type":"line","kind":"work","from":{"node":"nmw4wlqxe16h2j","port":"C"},"to":{"node":"nmw4wlqxd1079h","port":"B"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[305,126],[379.5,126],[379.5,65],[377,65]]},
      {"id":"nmw4wlqxi1dtx1","type":"symbol","symbol":"l.junction","x":240,"y":32,"rot":0,"flip":false,"tag":"","optional":false,"showDot":true},
      {"id":"lmw4wlqxi1euug","type":"line","kind":"pilot","from":{"node":"nmw4wlqxcl6bq","port":"2"},"to":{"node":"nmw4wlqxi1dtx1","port":"C"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[222.5,150],[222.5,32],[240,32]]},
      {"id":"lmw4wlqxj1f354","type":"line","kind":"pilot","from":{"node":"nmw4wlqxi1dtx1","port":"C"},"to":{"node":"nmw4wlqxdvfou","port":"X"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[240,32],[240,54.5],[258,54.5]]},
      {"id":"lmw4wlqxj1gks7","type":"line","kind":"pilot","from":{"node":"nmw4wlqxi1dtx1","port":"C"},"to":{"node":"nmw4wlqxdw7if","port":"X"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[240,32],[343,32],[343,54.5],[348,54.5]]}
    ]
    },
    {
      id: 'air',
      name: 'PNO(AIR)',
      note: 'Besleme, ana valf (V47) ve iki kapak silindiri (V48 / V49, SW18)',
      items: [
      {"id":"nmw3hn0f33y6y","type":"symbol","symbol":"s.source","x":40,"y":253,"rot":0,"flip":false,"tag":"","optional":false,"devre":0,"note":"BASINÇLI HAVA 6 bar"},
      {"id":"nmw3hn0f35vre","type":"symbol","symbol":"s.frl","x":40,"y":211,"rot":270,"flip":false,"tag":"0Z1","optional":false,"devre":0},
      {"id":"nmw3hn0f36m1m","type":"symbol","symbol":"v.32nc","x":102.5,"y":212.5,"rot":0,"flip":false,"tag":"0V2","optional":false,"devre":0,"coils":[{"tag":"0Y1","pid":"V47"}]},
      {"id":"nmw3hn0f37ifs","type":"symbol","symbol":"l.silencer","x":110,"y":220.5,"rot":0,"flip":false,"tag":"","optional":false,"devre":0},
      {"id":"tmw3hn0f4uioe","type":"text","x":145,"y":167.5,"text":"KAPAK (AÇ / KAPAT)","size":2.3,"bold":true,"align":"left","optional":false,"devre":5,"col":4,"sizeScale":1},
      {"id":"nmw3hn0f4vkpk","type":"symbol","symbol":"a.cylDouble","x":157,"y":184.5,"rot":0,"flip":false,"tag":"5A1","optional":false,"devre":5,"col":4,"pid":"","desc":"Kapak (Aç / Kapat)","sensors":[{"tag":"5B1","pid":"SW18","pos":0}]},
      {"id":"nmw3hn0f4wcsh","type":"symbol","symbol":"v.52bi","x":152,"y":240.5,"rot":0,"flip":false,"tag":"5V1","optional":false,"devre":5,"col":4,"desc":"Kapak (Aç / Kapat)","coils":[{"tag":"5Y1","pid":"V48"},{"tag":"5Y2","pid":"V49"}]},
      {"id":"nmw3hn0f4xlzf","type":"symbol","symbol":"f.flowCheck","x":147,"y":212.5,"rot":90,"flip":true,"tag":"5V2","optional":false,"devre":5,"col":4,"tagOffset":[-0.5,0.5]},
      {"id":"nmw3hn0f4zszs","type":"symbol","symbol":"l.silencer","x":154.5,"y":248.5,"rot":0,"flip":false,"tag":"","optional":false,"devre":5,"col":4},
      {"id":"nmw3hn0f41024i","type":"symbol","symbol":"l.silencer","x":159.5,"y":248.5,"rot":0,"flip":false,"tag":"","optional":false,"devre":5,"col":4},
      {"id":"lmw3hn0f51nc33","type":"line","kind":"supply","from":{"node":"nmw3hn0f33y6y","port":"1"},"to":{"node":"nmw3hn0f35vre","port":"1"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[40,249.6],[40,226]]},
      {"id":"lmw3hn0f71q4bo","type":"line","kind":"work","from":{"node":"nmw3hn0f36m1m","port":"3"},"to":{"node":"nmw3hn0f37ifs","port":"P"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[110,217.5],[110,220.5]]},
      {"id":"lmw3hn0fa29kc5","type":"line","kind":"work","from":{"node":"nmw3hn0f4wcsh","port":"4"},"to":{"node":"nmw4vafc21cmii","port":"C"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[154.5,235.5],[154.5,225],[147,225],[147,222]]},
      {"id":"lmw3hn0fc2d6ic","type":"line","kind":"work","from":{"node":"nmw3hn0f4wcsh","port":"5"},"to":{"node":"nmw3hn0f4zszs","port":"P"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[154.5,245.5],[154.5,248.5]]},
      {"id":"lmw3hn0fd2e1mj","type":"line","kind":"work","from":{"node":"nmw3hn0f4wcsh","port":"3"},"to":{"node":"nmw3hn0f41024i","port":"P"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[159.5,245.5],[159.5,248.5]]},
      {"id":"lmw4uc4cl2ynl","type":"line","kind":"work","from":{"node":"nmw3hn0f36m1m","port":"1"},"to":{"node":"nmw3hn0f35vre","port":"2"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[105,217.5],[105,227.5],[75,227.5],[75,182.5],[40,182.5],[40,196]]},
      {"id":"lmw4uccen3u9w","type":"line","kind":"work","from":{"node":"nmw3hn0f36m1m","port":"2"},"to":{"node":"nmw3hn0f4wcsh","port":"1"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[105,207.5],[105,202.5],[125,202.5],[125,267.5],[157,267.5],[157,245.5]]},
      {"id":"nmw4up8xmgvtt","type":"symbol","symbol":"a.cylDouble","x":202.5,"y":184.5,"rot":0,"flip":false,"tag":"5A1","optional":false,"devre":5,"col":4,"pid":"","desc":"Kapak (Aç / Kapat)","sensors":[{"tag":"5B1","pid":"SW18","pos":0}]},
      {"id":"tmw4updj3h70u","type":"text","x":190,"y":167.5,"text":"KAPAK (AÇ / KAPAT)","size":2.3,"bold":true,"align":"left","optional":false,"devre":5,"col":4,"sizeScale":1},
      {"id":"nmw4upt82ledo","type":"symbol","symbol":"f.flowCheck","x":192,"y":212.5,"rot":90,"flip":true,"tag":"5V2","optional":false,"devre":5,"col":4},
      {"id":"lmw4uq008mgfc","type":"line","kind":"work","from":{"node":"nmw4upt82ledo","port":"A"},"to":{"node":"nmw4vk30x4kxm","port":"C"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[192,218.5],[192,222.5]]},
      {"id":"lmw4ur599o2qr","type":"line","kind":"work","from":{"node":"nmw3hn0f4wcsh","port":"2"},"to":{"x":165,"y":199.5},"optional":false,"label":"","arrow":"none","manual":true,"path":[[159.5,235.5],[159.5,229.5],[165,229.5],[165,199.5]]},
      {"id":"lmw4ur9hjppje","type":"line","kind":"work","from":{"node":"nmw3hn0f4wcsh","port":"2"},"to":{"node":"nmw4up8xmgvtt","port":"B"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[159.5,235.5],[159.5,229.5],[210.5,229.5],[210.5,189]]},
      {"id":"nmw4v4zve104uu","type":"symbol","symbol":"f.check","x":147,"y":200,"rot":270,"flip":false,"tag":"","optional":false},
      {"id":"lmw4v5ijm11qw1","type":"line","kind":"work","from":{"node":"nmw4v4zve104uu","port":"B"},"to":{"node":"nmw3hn0f4vkpk","port":"A"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[147,195.5],[147,191.833],[145,191.833],[145,189]]},
      {"id":"lmw4v5ll412zpu","type":"line","kind":"work","from":{"node":"nmw3hn0f4xlzf","port":"B"},"to":{"node":"nmw4v4zve104uu","port":"A"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[147,206.5],[147,204.5]]},
      {"id":"nmw4v649g13h3m","type":"symbol","symbol":"f.check","x":192,"y":200,"rot":270,"flip":false,"tag":"","optional":false},
      {"id":"lmw4v66s114nqj","type":"line","kind":"work","from":{"node":"nmw4v649g13h3m","port":"B"},"to":{"node":"nmw4up8xmgvtt","port":"A"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[192,195.5],[192,191.667],[190.5,191.667],[190.5,189]]},
      {"id":"lmw4v69km15qyp","type":"line","kind":"work","from":{"node":"nmw4upt82ledo","port":"B"},"to":{"node":"nmw4v649g13h3m","port":"A"},"optional":false,"label":"","arrow":"none","manual":false,"path":[[192,206.5],[192,204.5]]},
      {"id":"lmw4v799t1axqh","type":"line","kind":"work","from":{"x":165,"y":199.5},"to":{"node":"nmw3hn0f4vkpk","port":"B"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[165,199.5],[165,189]]},
      {"id":"nmw4vafc21cmii","type":"symbol","symbol":"l.junction","x":147,"y":222,"rot":0,"flip":false,"tag":"","optional":false,"showDot":true},
      {"id":"lmw4vafc21drg4","type":"line","kind":"work","from":{"node":"nmw4vafc21cmii","port":"C"},"to":{"node":"nmw3hn0f4xlzf","port":"A"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[147,222],[147,218.5]]},
      {"id":"lmw4vafc21e2vl","type":"line","kind":"pilot","from":{"node":"nmw4vafc21cmii","port":"C"},"to":{"node":"nmw3hn0f4vkpk","port":"B"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[147,222],[159.5,222],[159.5,194.5],[165,194.5],[165,189]]},
      {"id":"nmw4vk30x4kxm","type":"symbol","symbol":"l.junction","x":192,"y":222.5,"rot":0,"flip":false,"tag":"","optional":false,"showDot":true},
      {"id":"lmw4vk30x5j5x","type":"line","kind":"work","from":{"node":"nmw4vk30x4kxm","port":"C"},"to":{"node":"nmw3hn0f4wcsh","port":"4"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[192,222.5],[192,225],[154.5,225],[154.5,235.5]]},
      {"id":"lmw4vk30y6eaq","type":"line","kind":"pilot","from":{"node":"nmw4vk30x4kxm","port":"C"},"to":{"node":"nmw4up8xmgvtt","port":"B"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[192,222.5],[205,222.5],[205,195],[210.5,195],[210.5,189]]},
      {"id":"lmw4vl1ppaz4m","type":"line","kind":"pilot","from":{"x":195,"y":200},"to":{"node":"nmw4up8xmgvtt","port":"B"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[195,200],[210.5,200],[210.5,189]]},
      {"id":"lmw4vobvcblug","type":"line","kind":"pilot","from":{"x":150,"y":200},"to":{"node":"nmw3hn0f4vkpk","port":"B"},"optional":false,"label":"","arrow":"none","manual":true,"path":[[150,200],[165,200],[165,189]]}
    ]
    }
  ];

  const byId = (id) => SETS.find((s) => s.id === id) || null;

  /** Setin sayfadaki kutusu [x0,y0,x1,y1] */
  function boxOf(set) {
    const boxes = set.items.map((it) => Model.boxOf(it));
    return [
      Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))
    ];
  }

  /**
   * Seti sayfaya koyar: öğeler yeni kimlik alır, tek grup olur. dx, dy kaydırma (mm).
   * Dönen değer konan öğeler.
   */
  function insert(sheet, id, dx, dy) {
    const set = byId(id);
    if (!set) return [];
    const copies = Model.cloneList(null, set.items, dx || 0, dy || 0);
    sheet.items.push(...copies);
    Model.groupItems(sheet, copies.map((c) => c.id));
    Model.updateJunctionDots(sheet);
    return copies;
  }

  return {
    list: () => SETS.map((s) => ({ id: s.id, name: s.name, note: s.note, count: s.items.length })),
    get: byId,
    boxOf,
    insert
  };
});
