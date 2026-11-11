/* Açıklamalar sekmesi: çizimin otomatik metinlerini elle düzenleme.
   Yalnız değiştirilen metinler P&ID/data/aciklamalar.json dosyasına yazılır; katalog dosyalarına dokunulmaz. */

const PidDescriptions = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const api = () => PidxHost.engine;
  const fold = (text) => PidSymbols.normalize(text);

  const HELP = {
    components: 'Bileşen Listesi ve açıklama sayfasındaki "Ne İşe Yarar" metni. Metin koda bağlıdır, o kodu kullanan tüm projelerde görünür.',
    safety: 'Güvenlik Fonksiyonları tablosu. Burada değiştirilen güvenlik mantığı, sensör ekipmana bağlı olsa da aynen yazılır.',
    patterns: 'Çizimdeki bağlantılardan kurulan cümleler: Bağlantı Mantığı ve Güvenlik Fonksiyonları. Süslü parantezli yerlere çizimden gelen ad yazılır. Örnek: koşul + "{ekipman} çalışmaz."'
  };
  const GROUP_TITLES = {
    conditions: 'Koşul (cümlenin başı)',
    effects: 'Etki (cümlenin sonu)',
    reasons: 'Neden cümlesi',
    functions: 'Güvenlik fonksiyonu adı',
    monitor: 'İzleme cümlesi',
    purposes: 'Görev (kodsuz semboller ve katalogda metni olmayanlar)'
  };
  const KEY_LABELS = {
    levelLow: 'Alt seviye', levelMid: 'Orta seviye', levelHigh: 'Üst seviye', tempHigh: 'Yüksek sıcaklık', airLow: 'Düşük hava basıncı',
    waterLow: 'Düşük su basıncı', vacuum: 'Vakum', pressure: 'Basınç', flow: 'Akış', doorOpen: 'Kapak açık', position: 'Konum',
    hand: 'El koruma', curtain: 'Işın bariyeri', lock: 'Interlock kilit', rfid: 'RFID kapak', estop: 'Acil stop', overload: 'Termik',
    electric: 'Sigorta', block: 'Çalıştırmaz', stop: 'Durdurur', open: 'Açar', close: 'Kapatır', control: 'Kontrol sinyali',
    feedback: 'Konum bildirimi', fill: 'Su alma', overflow: 'Taşma', overTemp: 'Aşırı sıcaklık', airPressure: 'Hava basıncı',
    doorGuard: 'Kapak güvenliği', safetyValve: 'Emniyet vanası', dryRun: 'Kuru çalışma', level: 'Seviye', temp: 'Sıcaklık',
    analytic: 'Sıvı kalitesi', door: 'Kapak', generic: 'Genel sinyal', display: 'Gösterge', pump: 'Pompa', fan: 'Fan', drive: 'Tahrik',
    conveyor: 'Konveyör', skimmer: 'Yağ sıyırıcı', heater: 'Rezistans', ultrasonic: 'Ultrasonik', valve: 'Otomatik vana',
    cylinder: 'Silindir', tank: 'Tank', cell: 'Hücre', basket: 'Sepet', boundary: 'Ekipman grubu', encoder: 'Enkoder', button: 'Buton',
    interlock: 'Interlock bloğu', plc: 'PLC fonksiyonu', lamp: 'Lamba', manualValve: 'Manuel vana', check: 'Çek valf', regulator: 'Regülatör',
    filter: 'Filtre', strainer: 'Pislik tutucu', dosatron: 'Dozatron', nozzle: 'Nozul', spray: 'Sprey manifoldu', hx: 'Eşanjör',
    frl: 'Şartlandırıcı', silencer: 'Susturucu', fitting: 'Bağlantı parçası', terminalIn: 'Hat girişi', terminalOut: 'Hat çıkışı',
    offpage: 'Sayfa bağlantısı'
  };
  const ARG_TITLES = { yer: 'tank veya hücre', sensor: 'sensör', ekipman: 'ekipman listesi', kosul: 'koşul' };

  let app = null;
  let catalog = null;
  let edits = { bilesen: {}, guvenlik: {}, kalip: {} };
  let section = 'components';
  let lang = 'tr';
  let dirty = false;
  let busy = false;
  let readError = '';
  let visibleRows = [];

  /* ─── Satırlar ve düzenlemeler ────────────────────────── */

  function rows() {
    if (!catalog) return [];
    if (section === 'components') {
      return catalog.components.map((c) => ({
        id: c.kod,
        title: c.kod,
        name: c.name,
        fields: [{ field: 'text', label: '', fallback: c.defaults[lang] || '' }]
      }));
    }
    if (section === 'safety') {
      return catalog.safety.map((s) => ({
        id: s.kod,
        title: s.kod,
        name: s.name,
        fields: [
          { field: 'locked', label: 'Kilitlenen ekipman (sensör bir ekipmana bağlı değilken)', fallback: s.defaults[lang].locked },
          { field: 'logic', label: 'Güvenlik mantığı', fallback: s.defaults[lang].logic }
        ]
      }));
    }
    return PidLogic.patternDefaults(lang).map((p) => ({
      id: p.id,
      title: KEY_LABELS[p.key] || p.key,
      name: p.args.map((a) => `{${a}}: ${ARG_TITLES[a]}`).join(' · '),
      nameClass: 'ds-args',
      group: p.group,
      fields: [{ field: 'text', label: '', fallback: p.text }]
    }));
  }

  function getEdit(id, field) {
    if (section === 'components') return (edits.bilesen[id] && edits.bilesen[id][lang]) || '';
    if (section === 'safety') {
      const row = edits.guvenlik[id] && edits.guvenlik[id][lang];
      return (row && row[field]) || '';
    }
    return (edits.kalip[lang] && edits.kalip[lang][id]) || '';
  }

  /** Boş değer anahtarı siler; içi boşalan üst kayıt da kalkar */
  function put(holder, key, value) {
    if (value && (typeof value === 'string' || Object.keys(value).length)) holder[key] = value;
    else delete holder[key];
  }

  function setEdit(id, field, text) {
    if (section === 'components') {
      const row = edits.bilesen[id] || {};
      put(row, lang, text);
      put(edits.bilesen, id, row);
    } else if (section === 'safety') {
      const row = edits.guvenlik[id] || {};
      const fields = row[lang] || {};
      put(fields, field, text);
      put(row, lang, fields);
      put(edits.guvenlik, id, row);
    } else {
      const texts = edits.kalip[lang] || {};
      put(texts, id, text);
      put(edits.kalip, lang, texts);
    }
  }

  const isEdited = (row) => row.fields.some((f) => getEdit(row.id, f.field));

  function matches(row, words, onlyEdited) {
    if (onlyEdited && !isEdited(row)) return false;
    const values = row.fields.map((f) => getEdit(row.id, f.field) || f.fallback);
    const haystack = fold([row.title, row.name, ...values].join(' '));
    return words.every((w) => haystack.includes(w));
  }

  const patternIds = () => new Set(Object.values(edits.kalip).flatMap((texts) => Object.keys(texts)));

  /* ─── Çizim ───────────────────────────────────────────── */

  function updateStatus() {
    const counts = {
      components: Object.keys(edits.bilesen).length,
      safety: Object.keys(edits.guvenlik).length,
      patterns: patternIds().size
    };
    $('dsCountComponents').textContent = counts.components || '';
    $('dsCountSafety').textContent = counts.safety || '';
    $('dsCountPatterns').textContent = counts.patterns || '';
    $('descCount').textContent = counts.components + counts.safety + counts.patterns || '';
    $('dsSave').disabled = !dirty || busy || !!readError;
    $('dsResult').textContent = `${visibleRows.length} satır${dirty ? ' · kaydedilmemiş değişiklik var' : ''}`;
  }

  function rowHtml(row) {
    const fields = row.fields.map((f) => `
      <div>
        ${f.label ? `<span class="ds-field-label">${esc(f.label)}</span>` : ''}
        <textarea class="field-input ds-text" rows="1" spellcheck="false" data-field="${esc(f.field)}">${esc(getEdit(row.id, f.field) || f.fallback)}</textarea>
      </div>`).join('');
    return `<div class="ds-row${isEdited(row) ? ' edited' : ''}" data-id="${esc(row.id)}">
      <div>
        <div class="ds-code">${esc(row.title)}</div>
        <div class="${row.nameClass || 'ds-name'}">${esc(row.name)}</div>
      </div>
      <div class="ds-fields">${fields}</div>
      <div class="ds-side">
        <span class="ds-mark">Düzenlendi</span>
        <button type="button" class="btn btn-sm ds-reset" data-reset title="Bu dildeki metni programla gelen hâline döndürür">Geri döndür</button>
      </div>
    </div>`;
  }

  function render() {
    document.querySelectorAll('.ds-section').forEach((b) => b.classList.toggle('active', b.dataset.dsSection === section));
    $('dsHelp').textContent = `${HELP[section]} Boş bırakılan metin programla gelen hâline döner.`;
    $('dsError').textContent = readError ? `${readError}. Düzeltilene kadar kayıt kapalı.` : '';
    $('dsError').classList.toggle('hidden', !readError);
    const words = fold($('dsSearch').value.trim()).split(/\s+/).filter(Boolean);
    const onlyEdited = $('dsOnlyEdited').checked;
    visibleRows = rows().filter((row) => matches(row, words, onlyEdited));
    let lastGroup = null;
    const html = visibleRows.map((row) => {
      const head = row.group && row.group !== lastGroup ? `<div class="ds-group">${esc(GROUP_TITLES[row.group])}</div>` : '';
      lastGroup = row.group;
      return head + rowHtml(row);
    }).join('');
    $('dsList').innerHTML = html || '<div class="dk-empty">Bu aramaya uyan metin yok.</div>';
    updateStatus();
  }

  /* ─── Yükleme ve kayıt ────────────────────────────────── */

  /** Kaydedilmemiş yazı varken yeniden okunmaz: sekme değiştirince kaybolmasın */
  async function load() {
    if (dirty || busy) return;
    const res = await api().descriptionCatalog();
    if (!res.ok) {
      app.toast(`Açıklamalar okunamadı: ${res.error}`, 'error');
      return;
    }
    catalog = res;
    edits = res.edits;
    readError = res.readError;
    render();
  }

  function unknownPlaceholder() {
    const known = new Map(PidLogic.patternDefaults('tr').map((p) => [p.id, p]));
    for (const texts of Object.values(edits.kalip)) {
      for (const [id, text] of Object.entries(texts)) {
        const pattern = known.get(id);
        if (!pattern) continue;
        for (const match of text.matchAll(/\{(\w+)\}/g)) {
          if (!pattern.args.includes(match[1])) return { name: match[1], pattern };
        }
      }
    }
    return null;
  }

  async function save() {
    if (!dirty || busy || readError) return;
    const bad = unknownPlaceholder();
    if (bad) {
      const allowed = bad.pattern.args.map((a) => `{${a}}`).join(', ') || 'yok';
      app.toast(`${KEY_LABELS[bad.pattern.key] || bad.pattern.key}: {${bad.name}} tanınmıyor. Kullanılabilenler: ${allowed}`, 'error');
      return;
    }
    busy = true;
    updateStatus();
    const res = await api().saveDescriptions(edits);
    busy = false;
    if (!res.ok) {
      updateStatus();
      app.toast(`Açıklamalar kaydedilemedi: ${res.error}`, 'error');
      return;
    }
    edits = res.data;
    dirty = false;
    render();
    await app.reloadDescriptions();
    app.toast('Açıklamalar kaydedildi. Projeler bu metinleri kullanacak.');
  }

  /* ─── Olaylar ─────────────────────────────────────────── */

  function onInput(e) {
    const area = e.target.closest('textarea[data-field]');
    if (!area) return;
    const rowEl = area.closest('[data-id]');
    const row = visibleRows.find((r) => r.id === rowEl.dataset.id);
    const field = row.fields.find((f) => f.field === area.dataset.field);
    const text = area.value.trim();
    setEdit(row.id, field.field, text === field.fallback.trim() ? '' : text);
    dirty = true;
    rowEl.classList.toggle('edited', isEdited(row));
    updateStatus();
  }

  function onClick(e) {
    if (!e.target.closest('[data-reset]')) return;
    const rowEl = e.target.closest('[data-id]');
    const row = visibleRows.find((r) => r.id === rowEl.dataset.id);
    for (const field of row.fields) {
      setEdit(row.id, field.field, '');
      rowEl.querySelector(`textarea[data-field="${field.field}"]`).value = field.fallback;
    }
    dirty = true;
    rowEl.classList.remove('edited');
    updateStatus();
  }

  function init(appRef) {
    app = appRef;
    document.querySelectorAll('.ds-section').forEach((b) => b.addEventListener('click', () => {
      section = b.dataset.dsSection;
      $('dsList').scrollTop = 0;
      render();
    }));
    $('dsLang').addEventListener('change', (e) => {
      lang = e.target.value;
      render();
    });
    $('dsSearch').addEventListener('input', render);
    $('dsOnlyEdited').addEventListener('change', render);
    $('dsSave').addEventListener('click', save);
    $('dsList').addEventListener('input', onInput);
    $('dsList').addEventListener('click', onClick);
  }

  return {
    init,
    load,
    get dirty() { return dirty; }
  };
})();
