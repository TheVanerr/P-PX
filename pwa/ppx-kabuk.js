/* P&PX kabuğu. Herkese açık sitede yalnız giriş ekranı ve bu dosya durur; program kodu sitede yoktur.
   Program, özel veri deposunun "program" dalındadır (npm run yayinla). Erişim anahtarı girilince oradan indirilir,
   bu cihazın tarayıcısında saklanır (Cache Storage) ve hizmet çalışanı (sw.js) onu app/ altından sunar.
   Anahtar yoksa, geçersizse ya da depoya erişimi kalmadıysa program cihazdan silinir: site boş bir giriş ekranıdır.
   Sayfa da hizmet çalışanı da bu dosyayı kullanır; Node testleri aynı kodu çalıştırır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PpxKabuk = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const API = 'https://api.github.com';
  const PROGRAM_BRANCH = 'program';
  const SETTINGS_KEY = 'ppx_ayarlar';
  const STATE_CACHE = 'ppx-kabuk-durum';
  const STATE_KEY = '__durum';
  const PROGRAM_CACHE = 'ppx-program-';
  const APP_DIR = 'app/';
  const PARALLEL = 6;
  // Çıkışta silinir: programların bu sitede tarayıcıya yazdığı her şey
  const LOCAL_KEYS = ['pidx_pano', 'pidx_dock', 'pnomatikx_dock', 'pidx_ml_legacy_done', 'ml_kodListesi', 'ml_makineler'];
  const LOCAL_DATABASES = ['ppx-veri', 'pidx-host', 'pnomatikx-host'];

  const MIME = {
    html: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    csv: 'text/csv',
    txt: 'text/plain; charset=utf-8',
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };

  const mimeOf = (path) => MIME[path.split('.').pop().toLowerCase()] || 'application/octet-stream';

  function failure(message, extra) {
    return Object.assign(new Error(message), extra);
  }

  function base64ToBytes(text) {
    const binary = atob(String(text).replace(/\s/g, ''));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }

  /** Git'in dosya kimliği: indirilen dosya bozuk mu diye bakılır */
  async function gitBlobSha(bytes) {
    const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const all = new Uint8Array(header.length + bytes.length);
    all.set(header);
    all.set(bytes, header.length);
    const digest = await crypto.subtle.digest('SHA-1', all);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /* ─── Adresler ──────────────────────────────────────────── */

  /** Programdaki yol → saklama adresi. Her parça tek biçimde kodlanır: P&ID her zaman P%26ID olur. */
  function programUrl(scope, path) {
    return `${scope}${APP_DIR}${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** İstek adresi → programdaki yol; app/ dışındaysa null. Klasör adresi index.html sayılır. */
  function programPath(scope, url) {
    const target = new URL(url);
    const base = new URL(scope);
    if (target.origin !== base.origin) return null;
    const prefix = `${base.pathname}${APP_DIR}`;
    if (!target.pathname.startsWith(prefix)) return null;
    let rest;
    try {
      rest = target.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
    } catch {
      return null;
    }
    if (rest.some((seg) => seg === '..' || seg === '.')) return null;
    if (rest[rest.length - 1] === '') rest[rest.length - 1] = 'index.html';
    return rest.join('/');
  }

  /* ─── Cihazdaki program ─────────────────────────────────── */

  async function readState(caches, scope) {
    const cache = await caches.open(STATE_CACHE);
    const res = await cache.match(`${scope}${STATE_KEY}`);
    if (!res) return null;
    try {
      const state = await res.json();
      return state && state.cache && state.files ? state : null;
    } catch {
      return null;
    }
  }

  async function writeState(caches, scope, state) {
    const cache = await caches.open(STATE_CACHE);
    await cache.put(`${scope}${STATE_KEY}`, new Response(JSON.stringify(state), { headers: { 'Content-Type': MIME.json } }));
  }

  /** Program ve durum kaydı silinir; bundan sonra app/ altında hiçbir şey sunulmaz */
  async function removeProgram(caches, scope) {
    const state = await caches.open(STATE_CACHE);
    await state.delete(`${scope}${STATE_KEY}`);
    for (const name of await caches.keys()) {
      if (name.startsWith(PROGRAM_CACHE)) await caches.delete(name);
    }
  }

  /** Hizmet çalışanı: app/ isteği cihazdaki programdan karşılanır. Program yoksa sayfa açılışı giriş ekranına döner. */
  async function serveProgram(caches, scope, request) {
    const path = programPath(scope, request.url);
    const state = path === null ? null : await readState(caches, scope);
    if (!state) {
      if (request.mode === 'navigate') return Response.redirect(scope, 302);
      return new Response('', { status: 404, statusText: 'Not Found' });
    }
    const hit = await (await caches.open(state.cache)).match(programUrl(scope, path));
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const page = `<!DOCTYPE html><meta charset="utf-8"><title>P&amp;PX</title><p>Sayfa bulunamadı. <a href="${scope}">Ana ekran</a></p>`;
      return new Response(page, { status: 404, headers: { 'Content-Type': MIME.html } });
    }
    return new Response('', { status: 404, statusText: 'Not Found' });
  }

  /* ─── GitHub ────────────────────────────────────────────── */

  /** Hata türleri: locked = anahtar geçersiz ya da erişim yok (program silinir), offline = geçici, notFound = dal yok */
  async function explain(res) {
    let detail = '';
    try {
      detail = (await res.json()).message || '';
    } catch { /* gövde JSON değilse durum kodu yeter */ }
    const limited = Number(res.headers.get('retry-after')) > 0 || res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(detail);
    if (res.status === 401) return failure('Erişim anahtarı geçersiz ya da süresi dolmuş.', { locked: true, status: 401 });
    if ((res.status === 403 || res.status === 429) && limited) return failure('GitHub hız sınırına ulaşıldı, biraz sonra yeniden deneyin.', { offline: true, status: res.status });
    if (res.status === 403) return failure('Erişim anahtarının bu depoyu okuma izni yok (Contents izni gerekli).', { locked: true, status: 403 });
    if (res.status === 404) return failure('Depo bulunamadı ya da erişim anahtarının bu depoya erişimi yok.', { notFound: true, status: 404 });
    if (res.status >= 500) return failure('GitHub şu an yanıt vermiyor.', { offline: true, status: res.status });
    return failure(`GitHub hatası ${res.status}: ${detail}`, { status: res.status });
  }

  function github(repo, token, fetchFn, api) {
    const [owner, name] = repo.split('/');
    const base = `${api}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
    async function get(path) {
      let res;
      try {
        res = await fetchFn(`${base}${path}`, {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` }
        });
      } catch {
        throw failure('İnternet bağlantısı yok.', { offline: true });
      }
      if (!res.ok) throw await explain(res);
      return res.json();
    }
    return {
      info: () => get(''),
      ref: () => get(`/git/ref/heads/${PROGRAM_BRANCH}`),
      commit: (sha) => get(`/git/commits/${sha}`),
      tree: (sha) => get(`/git/trees/${sha}?recursive=1`),
      blob: async (sha) => base64ToBytes((await get(`/git/blobs/${sha}`)).content)
    };
  }

  /** "https://github.com/kullanici/depo.git" de kabul edilir */
  function normalizeRepo(text) {
    const clean = String(text || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
    return /^[\w.-]+\/[\w.-]+$/.test(clean) ? clean : null;
  }

  /* ─── Kabuk ─────────────────────────────────────────────── */

  /** options: scope (sitenin kök adresi), caches, storage (localStorage), fetchFn, indexedDB, api */
  function createShell(options) {
    const { scope, caches, storage } = options;
    const fetchFn = options.fetchFn || ((...args) => fetch(...args));
    const api = options.api || API;

    function settings() {
      try {
        return JSON.parse(storage.getItem(SETTINGS_KEY)) || {};
      } catch {
        return {};
      }
    }

    const saveSettings = (value) => storage.setItem(SETTINGS_KEY, JSON.stringify(value));

    /** Anahtar silinir, depo adı bir dahaki giriş için kalır */
    function dropToken() {
      const { repo } = settings();
      saveSettings(repo ? { repo } : {});
    }

    /** Yalnız değişen dosyalar indirilir; bitmeden eski program yerinde kalır, yarım indirme kullanılmaz */
    async function install(gh, sha, installed, onProgress) {
      const commit = await gh.commit(sha);
      const tree = await gh.tree(commit.tree.sha);
      if (tree.truncated) throw new Error('Program bir seferde okunamayacak kadar büyük');
      const files = tree.tree.filter((e) => e.type === 'blob');
      if (!files.some((f) => f.path === 'index.html')) throw new Error('Program dalında index.html yok; programı yeniden yayınlayın.');

      const name = `${PROGRAM_CACHE}${sha}`;
      await caches.delete(name);
      const cache = await caches.open(name);
      const old = installed ? await caches.open(installed.cache) : null;
      const blobs = new Map();
      const blob = (id) => {
        if (!blobs.has(id)) {
          blobs.set(id, gh.blob(id).then(async (bytes) => {
            if ((await gitBlobSha(bytes)) !== id) throw failure('İndirilen dosya bozuk, yeniden deneyin.', { offline: true });
            return bytes;
          }));
        }
        return blobs.get(id);
      };

      const progress = { done: 0, total: files.length, downloaded: 0 };
      let next = 0;
      let failed = false;
      const worker = async () => {
        while (next < files.length && !failed) {
          const file = files[next];
          next += 1;
          const key = programUrl(scope, file.path);
          let response = old && installed.files[file.path] === file.sha ? await old.match(key) : null;
          if (!response) {
            response = new Response(await blob(file.sha), { headers: { 'Content-Type': mimeOf(file.path) } });
            progress.downloaded += 1;
          }
          await cache.put(key, response);
          progress.done += 1;
          if (onProgress) onProgress(Object.assign({}, progress));
        }
      };
      try {
        await Promise.all(Array.from({ length: Math.min(PARALLEL, files.length) }, worker));
      } catch (e) {
        failed = true;
        await caches.delete(name);
        throw e;
      }

      const state = {
        cache: name,
        sha,
        at: commit.committer && commit.committer.date,
        message: String(commit.message || '').split('\n')[0],
        files: Object.fromEntries(files.map((f) => [f.path, f.sha])),
        downloaded: progress.downloaded
      };
      await writeState(caches, scope, state);
      for (const key of await caches.keys()) {
        if (key.startsWith(PROGRAM_CACHE) && key !== name) await caches.delete(key);
      }
      return state;
    }

    /** Erişim kalmadı: program cihazdan silinir, anahtar unutulur */
    async function lock(message) {
      await removeProgram(caches, scope);
      dropToken();
      return { state: 'login', error: message };
    }

    /** Her açılışta: anahtar geçerliyse program güncellenir. Tek istekle anlaşılır, değişiklik yoksa hiçbir şey inmez.
        @returns state: ready (program açılabilir) | login (giriş gerekli) | error (açılamaz) */
    async function start(onProgress) {
      const s = settings();
      if (s.mode !== 'github' || !s.token || !s.repo) {
        await removeProgram(caches, scope);
        return { state: 'login' };
      }
      const gh = github(s.repo, s.token, fetchFn, api);
      const installed = await readState(caches, scope);
      const fallback = (message) => (installed
        ? { state: 'ready', program: installed, warning: message }
        : { state: 'error', error: message });

      let sha;
      try {
        sha = (await gh.ref()).object.sha;
      } catch (e) {
        if (e.locked) return lock(e.message);
        if (!e.notFound) return fallback(e.offline ? `${e.message} Bu cihazdaki program açılıyor.` : e.message);
        // Dal yok mu, depoya erişim mi kalmadı? Depo bilgisi ayırt eder
        try {
          await gh.info();
        } catch (e2) {
          if (e2.locked || e2.notFound) return lock(e2.message);
          return fallback(e2.message);
        }
        return fallback('Bu depoda yayınlanmış program yok. Programın bulunduğu bilgisayarda "npm run yayinla" çalıştırılmalı.');
      }

      if (installed && installed.sha === sha) return { state: 'ready', program: installed };
      try {
        const program = await install(gh, sha, installed, onProgress);
        return { state: 'ready', program, updated: !!installed };
      } catch (e) {
        if (e.locked) return lock(e.message);
        return fallback(`Programın yeni sürümü indirilemedi: ${e.message}`);
      }
    }

    /** Depo özel olmalı (müşteri verisi), anahtar geçerli olmalı. Geçerse ayarlar programla ortak yere yazılır. */
    async function login(repoText, token, onProgress) {
      const repo = normalizeRepo(repoText);
      if (!repo) return { state: 'login', error: 'Depo adı kullanici/depo biçiminde olmalı.' };
      if (!String(token || '').trim()) return { state: 'login', error: 'Erişim anahtarı gerekli.' };
      const key = String(token).trim();
      let info;
      try {
        info = await github(repo, key, fetchFn, api).info();
      } catch (e) {
        return { state: 'login', error: e.message };
      }
      if (!info.private) return { state: 'login', error: 'Bu depo herkese açık. Müşteri verileri için özel (Private) depo gerekir.' };
      if (info.default_branch === PROGRAM_BRANCH) return { state: 'login', error: `Deponun ana dalı "${PROGRAM_BRANCH}" olamaz; bu dal programa ayrılmıştır.` };
      const previous = settings();
      // Aynı depo başka yazımla girilirse veritabanı onu yeni depo sanmasın
      const sameRepo = previous.repo && previous.repo.toLowerCase() === String(info.full_name || repo).toLowerCase();
      saveSettings({ mode: 'github', repo: sameRepo ? previous.repo : info.full_name || repo, token: key });
      return start(onProgress);
    }

    function deleteDatabase(name, onBlocked) {
      const idb = options.indexedDB;
      if (!idb) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const req = idb.deleteDatabase(name);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => { if (onBlocked) onBlocked(name); };
      });
    }

    /** Çıkış: program, anahtar ve bu cihazdaki veri kopyası silinir. Depodaki veri yerinde kalır. */
    async function logout(onBlocked) {
      await removeProgram(caches, scope);
      dropToken();
      for (const key of LOCAL_KEYS) storage.removeItem(key);
      for (const name of LOCAL_DATABASES) await deleteDatabase(name, onBlocked);
    }

    return {
      settings,
      start,
      login,
      logout,
      installed: () => readState(caches, scope),
      appUrl: `${scope}${APP_DIR}index.html`
    };
  }

  return {
    createShell,
    serveProgram,
    programPath,
    programUrl,
    removeProgram,
    readState,
    normalizeRepo,
    gitBlobSha,
    mimeOf,
    PROGRAM_BRANCH,
    SETTINGS_KEY,
    APP_DIR
  };
});
