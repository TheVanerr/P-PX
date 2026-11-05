/* P&PX açılışı: veritabanı bağlantısı ve iki programa ortak gezinme. host.js'ten önce yüklenir.
   Kurulum yapılmışsa window.__PPX tanımlanır, host.js klasör izni istemeden buradaki kökü kullanır.
   Yapılmamışsa programlar eskisi gibi klasörle açılır. Sayfalar dosyadan çift tıkla açılır; sunucu gerekmez. */

(function () {
  'use strict';

  // Tek dosyalık önizleme kendi belleğiyle çalışır
  if (window.__PNX_SEED) return;

  const SETTINGS_KEY = 'ppx_ayarlar';
  const FOREGROUND_SYNC_MS = 5 * 60 * 1000;
  const FOCUS_SYNC_GAP_MS = 60 * 1000;
  const FIRST_SYNC_WAIT_MS = 3000;
  const ortak = new URL('.', document.currentScript.src);
  const launcherUrl = new URL('../index.html', ortak).href;
  const pidUrl = new URL('../P-IDX/P%26ID/codes/cizim.html', ortak).href;
  const pnxUrl = new URL('../PNOMATIKX/PNOMATIK/codes/cizim.html', ortak).href;

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
    db = PpxDb.createDb({ local, remote, lock: await lockFn() });
    db.onStatus((s) => {
      renderChip(s);
      if (s.state === 'ok' && s.changed && s.changed.length) warnChanged(s.changed);
    });
    renderChip(db.status());
    await db.refreshPending();
    if (remote) {
      // Yerel veri varsa açılış ağa takılmaz; yoksa ilk alma bitmeden gösterilecek bir şey yok
      const first = db.sync();
      if (PpxFs.hasProgramData(await db.list())) await Promise.race([first, new Promise((r) => setTimeout(r, FIRST_SYNC_WAIT_MS))]);
      else await first;
      watchPage();
    }
    initialSyncDone = true;

    // Veri henüz aktarılmamışsa programlar boş açılmasın, ana ekrana dönülür
    if (!window.PPX_LAUNCHER && !PpxFs.hasProgramData(await db.list())) {
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
    // CAD kod listesini dosya adresinden okur; içerik aynı veritabanından verilir
    if (location.pathname.includes('/CAD/')) {
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (url, init) => {
        if (!String(url).endsWith('ML/kayitlar/kodlar.json')) return originalFetch(url, init);
        await window.__PPX.ready();
        const record = await db.read('ML/kayitlar/kodlar.json');
        return new Response(record ? record.bytes : null, { status: record ? 200 : 404 });
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

  const api = {
    ready() {
      if (!readyPromise) readyPromise = connect();
      return readyPromise;
    },
    db: () => db,
    settings,
    connectGitHub,
    useLocal: () => saveSettings({ mode: 'yerel' }),
    /** Anahtar silinir, veriler bu cihazda kalır */
    disconnect: () => saveSettings({ mode: 'yerel' })
  };
  window.PpxBoot = api;

  const active = !!settings().mode;
  if (active) {
    window.__PPX = api;
    applyActivePatches();
  }

  afterDom(() => {
    addStyle(active ? CSS + ACTIVE_CSS : CSS);
    addNav();
  });
})();
