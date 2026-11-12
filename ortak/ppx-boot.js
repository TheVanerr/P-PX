/* P&PX açılışı: veritabanı bağlantısı ve iki programa ortak gezinme. host.js'ten önce yüklenir.
   Kurulum yapılmışsa window.__PPX tanımlanır, host.js klasör izni istemeden buradaki kökü kullanır.
   Yapılmamışsa programlar eskisi gibi klasörle açılır. Sayfalar dosyadan çift tıkla açılır; sunucu gerekmez.
   Web uygulaması (PWA) olarak açılınca program sitenin app/ klasöründen, cihazdaki kopyadan gelir (pwa/ klasörü).
   Orada yerel mod yoktur: erişim anahtarı yoksa ya da geçersizse giriş ekranına dönülür. */

(function () {
  'use strict';

  // Tek dosyalık önizleme kendi belleğiyle çalışır
  if (window.__PNX_SEED) return;

  const SETTINGS_KEY = 'ppx_ayarlar';
  const LOGOUT_FLAG = 'ppx_cikis';
  const LOCK_GUARD_KEY = 'ppx_kilit';
  const RECHECK_FLAG = 'ppx_denetle';
  const LOCK_GUARD_MS = 60 * 1000;
  const FOREGROUND_SYNC_MS = 5 * 60 * 1000;
  const FOCUS_SYNC_GAP_MS = 60 * 1000;
  const FIRST_SYNC_WAIT_MS = 3000;
  const LAST_SYNC_KEY = 'ppx_son_esitleme';
  const RECENT_SYNC_MS = 2 * 60 * 1000;
  // PWA: anahtar ve programın yeni sürümü her açılışta ve pencereye dönünce arka planda denetlenir; sayfalar arası
  // geçişte GitHub'a üst üste gidilmesin diye en çok bu sıklıkla (giriş ekranıyla ortak kayıt)
  const PROGRAM_CHECK_KEY = 'ppx_kabuk_denetim';
  const PROGRAM_CHECK_MS = 30 * 1000;
  const ortak = new URL('.', document.currentScript.src);
  const launcherUrl = new URL('../index.html', ortak).href;
  const pidUrl = new URL('../P-IDX/P%26ID/codes/cizim.html', ortak).href;
  const pnxUrl = new URL('../PNOMATIKX/PNOMATIK/codes/cizim.html', ortak).href;
  // PWA: sayfayı hizmet çalışanı sunar ve program app/ altındadır; giriş ekranı bir üst klasördür
  const appRoot = new URL('../', ortak);
  const pwa = !!(navigator.serviceWorker && navigator.serviceWorker.controller) && /\/app\/$/.test(appRoot.pathname);
  const shellUrl = pwa ? new URL('../', appRoot).href : null;

  let db = null;
  let readyPromise = null;
  let initialSyncDone = false;

  function settings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveSettings(value) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
  }

  const hasKey = () => {
    const s = settings();
    return s.mode === 'github' && !!s.token && !!s.repo;
  };

  /** Giriş ekranı anahtarı yeniden dener, geçersizse programı cihazdan siler. Döngüye girmesin diye dakikada bir. */
  function toShell() {
    const last = Number(sessionStorage.getItem(LOCK_GUARD_KEY) || 0);
    if (Date.now() - last < LOCK_GUARD_MS) return;
    sessionStorage.setItem(LOCK_GUARD_KEY, String(Date.now()));
    // Giriş ekranı programı beklemeden açmasın, önce anahtarı denetlesin
    sessionStorage.setItem(RECHECK_FLAG, '1');
    location.replace(shellUrl);
  }

  const CSS = `
    #ppxChip { position: fixed; left: 12px; bottom: 12px; z-index: 900; padding: 5px 10px; border-radius: 6px;
      font: 12px 'Segoe UI', system-ui, sans-serif; background: #23272f; color: #c6cbd5; border: 1px solid #2f343e;
      box-shadow: 0 4px 14px rgba(0,0,0,.35); max-width: 460px; text-decoration: none; }
    #ppxChip.warn { color: #ffd479; border-color: #6b5620; }
    #ppxChip.err { color: #ff8585; border-color: #6b2b2b; }
    body:has(#app:not(.hidden)) #ppxChip { bottom: 44px; }
    body:has(#app:not(.hidden)) #ppxChip:not(.warn):not(.err), body:has(#app:not(.hidden)) #ppxChip.yerel { display: none; }
    @media print { #ppxChip { display: none !important; } }
  `;
  // Bağlıyken klasör düğmeleri anlamsız kalır
  const ACTIVE_CSS = '#btnFolder, #btnPidLink, #pidBanner { display: none !important; }';

  function addStyle(text) {
    const style = document.createElement('style');
    style.textContent = text;
    document.head.appendChild(style);
  }

  function afterDom(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  /* ─── Durum yazısı ──────────────────────────────────────── */

  function chipText(s) {
    if (s.mode === 'local') return { text: 'Yerel mod: veriler yalnız bu tarayıcıda', cls: 'warn yerel' };
    if (s.state === 'error') return { text: `Depoya gönderilemedi, bu cihazda kayıtlı. ${s.error}`, cls: 'err' };
    if (s.state === 'offline') return { text: `Çevrimdışı: ${s.pending} dosya bu cihazda bekliyor`, cls: 'warn' };
    if (s.state === 'syncing') return { text: 'Eşitleniyor…', cls: '' };
    if (s.pending) return { text: `Bu cihazda kayıtlı, ${s.pending} dosya depoya gönderilecek`, cls: '' };
    const time = s.lastSync ? new Date(s.lastSync).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '';
    return { text: `Depoda kayıtlı${time ? ` · ${time}` : ''}`, cls: '' };
  }

  function renderChip(status) {
    afterDom(() => {
      let chip = document.getElementById('ppxChip');
      if (!chip) {
        chip = document.createElement('a');
        chip.id = 'ppxChip';
        chip.href = launcherUrl;
        chip.title = 'Veritabanı ve yedek';
        document.body.appendChild(chip);
      }
      const { text, cls } = chipText(status);
      chip.textContent = text;
      chip.className = cls;
    });
  }

  /** Eşitlemede başka cihazdan gelen çizim: açık çizim eski kalmış olabilir */
  function warnChanged(paths) {
    const drawings = paths.filter((p) => /cizim\.json/.test(p));
    if (!drawings.length || !initialSyncDone || window.PPX_LAUNCHER) return;
    afterDom(() => {
      let bar = document.getElementById('ppxChanged');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'ppxChanged';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:950;padding:8px 14px;background:#6b5620;color:#fff;font:13px "Segoe UI",system-ui,sans-serif;text-align:center';
        document.body.appendChild(bar);
      }
      const conflict = drawings.some((p) => p.includes('.catisma-'));
      bar.textContent = conflict
        ? 'Çizim iki cihazda değiştirildi. Eski sürüm .catisma dosyası olarak saklandı. Sayfayı yenileyin.'
        : 'Çizim başka bir cihazda değiştirildi. Üzerine yazmamak için sayfayı yenileyin.';
    });
  }

  /* ─── Bağlantı ──────────────────────────────────────────── */

  async function lockFn() {
    // Sekmeler aynı anda göndermesin; tarayıcı bu dosya için kilit vermezse kilitsiz devam edilir
    try {
      await navigator.locks.query();
      return (fn) => navigator.locks.request('ppx-sync', fn);
    } catch {
      return (fn) => fn();
    }
  }

  function watchPage() {
    let lastFocusSync = Date.now();
    const syncIfDue = () => {
      if (Date.now() - lastFocusSync < FOCUS_SYNC_GAP_MS) return;
      lastFocusSync = Date.now();
      db.sync();
    };
    document.addEventListener('visibilitychange', () => {
      // Sayfa kapanırken gönderim yarım kalsa da kayıt cihazda bekler, sonraki açılışta gider
      if (document.visibilityState === 'hidden') db.flush();
      else syncIfDue();
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') syncIfDue();
    }, FOREGROUND_SYNC_MS);
    window.addEventListener('online', () => db.sync());
  }

  async function connect() {
    const { mode, repo, token } = settings();
    const remote = mode === 'github' ? PpxGitHub.createRemote({ repo, token }) : null;
    const local = PpxDb.indexedDbLocal('ppx-veri');
    // Sekmeler aynı veritabanını kullanır; biri yazınca öbürlerinin yol listesi yenilenir
    db = PpxDb.createDb({ local, remote, lock: await lockFn(), channel: 'ppx-veri' });
    db.onStatus((s) => {
      renderChip(s);
      if (s.state === 'ok' && s.changed && s.changed.length) warnChanged(s.changed);
      if (s.state === 'ok' && s.lastSync) localStorage.setItem(LAST_SYNC_KEY, String(s.lastSync));
      // PWA: anahtar geçersizleşti (süresi doldu, silindi). Kaydedilmemiş çizim varsa program çıkışı sorar.
      if (pwa && s.state === 'error' && s.code === 401) toShell();
    });
    renderChip(db.status());
    await db.refreshPending();
    if (remote) {
      // Yerel veri yoksa ilk alma bitmeden gösterilecek bir şey yok. Varsa açılış ağa takılmaz: ana ekran ve az önce
      // eşitlenmiş sayfa hiç beklemez (eşitleme arkada sürer), öbürleri en çok birkaç saniye bekler.
      const first = db.sync();
      const recent = Date.now() - Number(localStorage.getItem(LAST_SYNC_KEY) || 0) < RECENT_SYNC_MS;
      if (!PpxFs.hasProgramData(await db.listPaths())) await first;
      else if (!recent && !window.PPX_LAUNCHER) await Promise.race([first, new Promise((r) => setTimeout(r, FIRST_SYNC_WAIT_MS))]);
      watchPage();
    }
    initialSyncDone = true;

    // Veri henüz aktarılmamışsa programlar boş açılmasın, ana ekrana dönülür
    if (!window.PPX_LAUNCHER && !PpxFs.hasProgramData(await db.listPaths())) {
      location.replace(launcherUrl);
      return new Promise(() => {});
    }
    return PpxFs.createRoot(db, { name: 'P&PX Veritabanı' });
  }

  /* ─── Kurulum (ana ekrandan) ────────────────────────────── */

  /** Depoyu dener; açık depoya müşteri verisi yazılmasın diye yalnız özel depo kabul edilir */
  async function connectGitHub(repo, token) {
    const remote = PpxGitHub.createRemote({ repo, token });
    const info = await remote.info();
    if (!info.private) throw new Error('Bu depo herkese açık. Müşteri verileri için özel (Private) depo gerekir.');
    saveSettings({ mode: 'github', repo: remote.id, token });
  }

  /* ─── Etkin moddaki düzeltmeler ─────────────────────────── */

  function applyActivePatches() {
    // Tarayıcının kayıt penceresi yalnız gerçek klasörü başlangıç yeri kabul eder
    if (typeof window.showSaveFilePicker === 'function') {
      const original = window.showSaveFilePicker.bind(window);
      window.showSaveFilePicker = (options) => {
        const clean = Object.assign({}, options);
        delete clean.startIn;
        return original(clean);
      };
    }
  }

  /* ─── İki program arasında gezinme ──────────────────────── */

  function addNav() {
    const nav = document.querySelector('.home-nav');
    if (!nav) return;
    const inPnomatik = location.pathname.includes('/PNOMATIK/');
    const links = [
      { href: launcherUrl, text: 'Ana Ekran' },
      inPnomatik ? { href: pidUrl, text: 'P&ID Programı' } : { href: pnxUrl, text: 'Pnömatik Programı' }
    ];
    for (const { href, text } of links) {
      const a = document.createElement('a');
      a.className = 'home-link';
      a.href = href;
      a.textContent = text;
      nav.appendChild(a);
    }
  }

  /* ─── Web uygulaması (PWA) ──────────────────────────────── */

  /** Uygulama olarak yüklenebilsin: program sayfaları da sitenin bildirimini gösterir */
  function addAppLinks() {
    for (const old of document.querySelectorAll('link[rel~="icon"]')) old.remove();
    const add = (tag, attrs) => {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      document.head.appendChild(el);
    };
    add('link', { rel: 'manifest', href: `${shellUrl}manifest.webmanifest` });
    add('link', { rel: 'icon', href: `${shellUrl}simge.svg`, type: 'image/svg+xml' });
    add('meta', { name: 'theme-color', content: '#14161b' });
  }

  function showUpdated() {
    if (document.getElementById('ppxUpdated')) return;
    const bar = document.createElement('div');
    bar.id = 'ppxUpdated';
    bar.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:950;display:flex;gap:10px;align-items:center;padding:8px 10px 8px 14px;'
      + 'background:#23272f;color:#e8eaef;border:1px solid #2f343e;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.35);font:13px "Segoe UI",system-ui,sans-serif';
    bar.textContent = 'Programın yeni sürümü hazır.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Yenile';
    button.style.cssText = 'font:inherit;font-weight:600;color:#fff;background:#d40000;border:0;border-radius:4px;padding:4px 12px;cursor:pointer';
    button.addEventListener('click', () => location.reload());
    bar.appendChild(button);
    document.body.appendChild(bar);
  }

  /** PWA: giriş ekranı beklemeden uygulamayı açar; anahtar ve yeni sürüm burada, sayfa açıldıktan sonra arka planda denetlenir.
      Anahtar geçersizse program cihazdan silinir ve giriş ekranına dönülür. Yeni sürüm iner, sayfa kendiliğinden yenilenmez. */
  function checkProgram() {
    if (Date.now() - Number(localStorage.getItem(PROGRAM_CHECK_KEY) || 0) < PROGRAM_CHECK_MS) return;
    localStorage.setItem(PROGRAM_CHECK_KEY, String(Date.now()));
    const script = document.createElement('script');
    script.src = `${shellUrl}ppx-kabuk.js`;
    script.onload = async () => {
      try {
        const shell = window.PpxKabuk.createShell({ scope: shellUrl, caches: window.caches, storage: localStorage, indexedDB: window.indexedDB });
        const res = await shell.start();
        if (res.state === 'login') location.replace(shellUrl);
        // Ana ekranda kaybolacak bir şey yok, hemen yenilenir; programda çizim yarıda kalmasın diye sorulur
        else if (res.updated && window.PPX_LAUNCHER) location.reload();
        else if (res.updated) showUpdated();
      } catch { /* sonraki açılışta yeniden denenir */ }
    };
    document.head.appendChild(script);
  }

  /** Çıkış: önce depoyla eşitlenir. Gönderilemeyen kayıt varsa force olmadan çıkılmaz, çünkü giriş ekranı bu cihazdaki veriyi siler. */
  async function logout(options) {
    if (!pwa) return { ok: false, error: 'Çıkış yalnız web uygulamasında' };
    await api.ready();
    if (!(options && options.force)) {
      const s = await db.sync();
      if (s.pending) return { ok: false, pending: s.pending, error: s.error };
    }
    sessionStorage.setItem(LOGOUT_FLAG, '1');
    location.replace(shellUrl);
    return { ok: true };
  }

  // Sitede tek kapı giriş ekranıdır (pwa/). GitHub Pages yanlışlıkla deponun tamamını yayınlarsa program sayfası
  // doğrudan açılmaz; anahtarsız açılan web uygulaması sayfası da hiçbir şey göstermeden giriş ekranına döner.
  const exposed = !pwa && /^https?:$/.test(location.protocol) && /\.github\.io$/i.test(location.hostname);
  const locked = exposed || (pwa && !hasKey());
  if (locked) {
    document.documentElement.style.visibility = 'hidden';
    location.replace(exposed ? new URL('../pwa/', ortak).href : shellUrl);
  }

  const api = {
    ready() {
      if (locked) return new Promise(() => {});
      if (!readyPromise) readyPromise = connect();
      return readyPromise;
    },
    db: () => db,
    settings,
    connectGitHub,
    pwa,
    locked,
    shellUrl,
    logout,
    useLocal: () => saveSettings({ mode: 'yerel' }),
    /** Anahtar silinir, veriler bu cihazda kalır */
    disconnect: () => saveSettings({ mode: 'yerel' })
  };
  window.PpxBoot = api;

  const active = locked || !!settings().mode;
  if (active) {
    window.__PPX = api;
    applyActivePatches();
  }

  afterDom(() => {
    if (locked) return;
    addStyle(active ? CSS + ACTIVE_CSS : CSS);
    addNav();
    if (pwa) {
      addAppLinks();
      // Açılışın işini engellemesin diye sayfa yüklendikten biraz sonra
      setTimeout(checkProgram, 1500);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkProgram();
      });
    }
  });
})();
