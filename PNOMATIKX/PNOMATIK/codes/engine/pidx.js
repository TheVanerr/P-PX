/* Ana ekran: P&ID Projeleri (P&IDX'ten, yalnız okunur) ve Kod Eşleştirme listesi (PNOMATIK/data/eslestirme.csv). */

const PidPidx = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const SERIES = ['V', 'PPS', 'SWB', 'SW', 'PS'];

  let app = null;
  let projects = [];
  let machines = [];
  let loadError = '';
  let editing = null;

  const host = () => window.PidxHost;
  const fold = (t) => PidSymbols.normalize(t);

  /* ─── P&ID bağlantısı ─────────────────────────────────── */

  function linkButtonText() {
    const s = host().pid.status();
    if (!s.linked) return 'P&IDX bağla';
    if (!s.granted) return `P&IDX: ${s.name} · izin ver`;
    return `P&IDX: ${s.name}`;
  }

  function renderLinkState() {
    const s = host().pid.status();
    $('btnPidLink').textContent = linkButtonText();
    const banner = $('pidBanner');
    if (s.linked && s.granted) {
      banner.className = 'pid-link-bar ok hidden';
      return;
    }
    banner.className = `pid-link-bar ${s.linked ? 'warn' : ''}`;
    banner.innerHTML = s.linked
      ? `<strong>P&amp;IDX klasörü: ${esc(s.name)}</strong><span>Tarayıcı her açılışta okuma izni ister. P&amp;ID projeleri ve kod listesi için izin verin.</span><div class="tb-spacer"></div><button type="button" class="btn btn-sm btn-primary" data-pid-action="grant">İzin ver</button>`
      : '<strong>P&amp;IDX bağlı değil</strong><span>P&amp;ID projelerinden otomatik çizim ve canlı kod listesi için P&amp;IDX ana klasörünü bağlayın (yalnız okunur). Bağlanmadan da çizebilirsiniz; kod listesi PNOMATIK/data kopyasından okunur.</span><div class="tb-spacer"></div><button type="button" class="btn btn-sm btn-primary" data-pid-action="link">P&amp;IDX klasörünü bağla</button>';
  }

  async function link() {
    const res = await host().pid.link();
    if (!res.ok) {
      if (!res.canceled) app.toast(res.error, 'error');
      return false;
    }
    await afterLink();
    app.toast(`P&IDX bağlandı: ${res.status.name}`);
    return true;
  }

  async function grant() {
    const res = await host().pid.grant();
    if (!res.ok) {
      if (!res.canceled) app.toast(res.error, 'error');
      return false;
    }
    await afterLink();
    return true;
  }

  async function afterLink() {
    renderLinkState();
    await load();
    await app.reloadCatalog();
    await app.onPidLinked();
  }

  /** Bağlantı düğmesi: bağlı değilse seçtirir, izin yoksa ister, bağlıysa değiştirme/çıkarma sorar */
  async function linkMenu() {
    const s = host().pid.status();
    if (!s.linked) return link();
    if (!s.granted) return grant();
    const root = $('modalRoot');
    root.innerHTML = `
      <div class="modal-overlay">
        <div class="modal">
          <h2>P&amp;IDX bağlantısı</h2>
          <p class="field-help">Bağlı klasör: <strong>${esc(s.name)}</strong>. P&amp;ID projeleri, çizimdeki kodlar, P&amp;ID kod listesi ve makine kayıtları buradan okunur; bu klasöre yazılmaz.</p>
          <div class="modal-actions">
            <button type="button" class="btn" data-m="unlink">Bağlantıyı kaldır</button>
            <button type="button" class="btn" data-m="change">Başka klasör seç</button>
            <button type="button" class="btn btn-primary" data-m="close">Kapat</button>
          </div>
        </div>
      </div>`;
    root.querySelector('.modal').addEventListener('click', async (e) => {
      const m = e.target.dataset && e.target.dataset.m;
      if (!m) return;
      root.innerHTML = '';
      if (m === 'change') await link();
      if (m === 'unlink') {
        await host().pid.unlink();
        projects = [];
        machines = [];
        await afterLink();
      }
    });
    return true;
  }

  /* ─── P&ID projeleri ──────────────────────────────────── */

  async function load() {
    loadError = '';
    projects = [];
    machines = [];
    const s = host().pid.status();
    if (!s.granted) {
      updateCounts();
      renderPidPage();
      return;
    }
    const [p, m] = await Promise.all([host().pid.listProjects(), host().pid.machines()]);
    if (p.ok) projects = p.projects;
    else loadError = p.error;
    if (m.ok) machines = m.machines;
    updateCounts();
    renderPidPage();
  }

  /** Pnömatikle ilgili P&ID kodları (V, PPS, SWB, SW, PS hava) */
  function pneumaticCodes(codes) {
    return codes.filter((code) => {
      const entry = app.catalogMap.get(code);
      return PidLink.isRelevant(code, entry ? entry.name : '');
    });
  }

  function counts(codes) {
    const out = new Map();
    for (const code of pneumaticCodes(codes)) {
      const s = PidLink.seriesOf(code);
      out.set(s, (out.get(s) || 0) + 1);
    }
    return SERIES.filter((s) => out.has(s)).map((s) => `<span class="pc-chip has">${s} · ${out.get(s)}</span>`).join('');
  }

  /** P&ID projesine veya makine kaydına bağlı pnömatik proje: önce bağlantı, sonra makine kimliği;
      seri no yalnız tek bir makinede geçiyorsa kullanılır ("XXX" gibi ortak seri noları karışmasın) */
  function pneumaticProjectFor(pidId, machine) {
    const list = app.state.projects;
    if (pidId) {
      const linked = list.find((p) => p.meta.pidProje === pidId);
      if (linked) return linked;
    }
    if (!machine) return null;
    const byId = list.find((p) => p.meta.makineId === machine.id);
    if (byId) return byId;
    const shared = machines.filter((m) => String(m.seriNo) === String(machine.seriNo)).length > 1;
    if (shared) return null;
    return list.find((p) => !p.meta.pidProje && !p.meta.makineId && String(p.meta.seriNo) === String(machine.seriNo)) || null;
  }

  function renderPidPage() {
    const page = $('pidPage');
    const s = host().pid.status();
    if (!s.granted) {
      page.innerHTML = `
        <div class="pid-empty">
          <h2>${s.linked ? 'P&amp;IDX klasörüne izin gerekiyor' : 'P&amp;IDX klasörü bağlı değil'}</h2>
          <p>Pnömatik şema, P&amp;ID'deki valf (V), piston sensörü (PPS), switch box (SWB) ve hava basıncı (PS) kodlarından otomatik çizilir.
          Bunun için P&amp;IDX ana klasörünü (içinde <code>P&amp;ID/data</code> olan) bağlayın. Program bu klasöre yazmaz.</p>
          <button type="button" class="btn btn-primary" data-pid-action="${s.linked ? 'grant' : 'link'}">${s.linked ? 'İzin ver' : 'P&amp;IDX klasörünü bağla'}</button>
        </div>`;
      return;
    }
    if (loadError) {
      page.innerHTML = `<div class="pid-empty"><h2>P&amp;IDX okunamadı</h2><p>${esc(loadError)}</p></div>`;
      return;
    }
    const projectCards = projects.map((p) => {
      const existing = pneumaticProjectFor(p.id, p.machine ? machines.find((m) => m.id === p.machine.id) : null);
      const pneu = pneumaticCodes(p.codes);
      return `<div class="pid-card">
        <h3>${esc(p.meta.seriNo)} · ${esc(p.meta.model)}</h3>
        <div class="pid-sub">${esc(p.meta.musteri)} · ${esc(p.id)}</div>
        <div class="pid-counts">${counts(p.codes) || '<span class="pc-chip">Pnömatik kod yok</span>'}</div>
        <div class="pid-sub">${p.drawingCodes.length} kod çizimde${p.machine ? ` · makine kaydı ${esc(p.machine.seriNo)} (${p.machineCodes.length} kod)` : ''}</div>
        <div class="pid-actions">
          ${existing
            ? `<button type="button" class="btn btn-sm btn-primary" data-open="${esc(existing.id)}">Pnömatik projeyi aç</button>`
            : `<button type="button" class="btn btn-sm btn-primary" data-create-pid="${esc(p.id)}"${pneu.length ? '' : ' title="Pnömatik kod yok; boş proje açılır"'}>Pnömatik proje oluştur</button>`}
        </div>
      </div>`;
    }).join('');
    const machineCards = machines.map((m) => {
      const pid = projects.find((p) => p.machine && p.machine.id === m.id);
      const existing = pneumaticProjectFor(pid ? pid.id : null, m);
      const codes = m.kodlar.map((k) => String(k).toUpperCase());
      return `<div class="pid-card">
        <h3>${esc(m.seriNo)} · ${esc(m.model)}</h3>
        <div class="pid-sub">${esc(m.firma)}${pid ? ` · P&amp;ID projesi: ${esc(pid.id)}` : ''}</div>
        <div class="pid-counts">${counts(codes) || '<span class="pc-chip">Pnömatik kod yok</span>'}</div>
        <div class="pid-actions">
          ${existing
            ? `<button type="button" class="btn btn-sm" data-open="${esc(existing.id)}">Pnömatik projeyi aç</button>`
            : `<button type="button" class="btn btn-sm" data-create-machine="${esc(m.id)}">Pnömatik proje oluştur</button>`}
        </div>
      </div>`;
    }).join('');
    page.innerHTML = `
      <div class="pid-section-title">P&amp;ID projeleri (${projects.length})</div>
      ${projects.length ? `<div class="pid-grid">${projectCards}</div>` : '<div class="file-empty">P&amp;IDX klasöründe proje yok</div>'}
      <div class="pid-section-title">Makine kayıtları (${machines.length})</div>
      <p class="ml-note">Makine kayıtları P&amp;IDX'teki Makineler sekmesinde düzenlenir. P&amp;ID çizimi olmayan makineden de pnömatik proje oluşturabilirsiniz.</p>
      ${machines.length ? `<div class="pid-grid">${machineCards}</div>` : '<div class="file-empty">Makine kaydı yok</div>'}`;
  }

  function updateCounts() {
    $('pidCount').textContent = projects.length || '';
  }

  /* ─── Kod Eşleştirme listesi ──────────────────────────── */

  const ROLE_TEXT = Object.fromEntries(PidLink.ROLES);
  const ACT_TEXT = Object.fromEntries(PidLink.ACTUATORS.map((a) => [a[0], a[1]]));
  const VALVE_TEXT = Object.fromEntries(PidLink.VALVES.map((v) => [v[0], v[1]]));

  /** Katalogdaki pnömatik kodlar + kayıtlı satırlar; her satırın etkin yorumu */
  function mappingRows() {
    const rows = new Map();
    for (const c of app.catalog) {
      if (!SERIES.includes(c.category) || !PidLink.isRelevant(c.id, c.name)) continue;
      rows.set(c.id, { kod: c.id, name: c.name });
    }
    for (const [kod] of app.mapping) if (!rows.has(kod)) rows.set(kod, { kod, name: (app.catalogMap.get(kod) || {}).name || '' });
    // Otomatik yorum, tüm katalog birlikte gruplanarak bulunur (aç/kapat çiftleri, sensör eşleşmesi)
    const auto = PidLink.group([...rows.values()].map((r) => ({ kod: r.kod, name: r.name })), new Map());
    const autoInfo = new Map();
    for (const g of auto.circuits) {
      g.coils.forEach((c, i) => { if (c) autoInfo.set(c.kod, { devre: g.name, rol: i === 0 ? 'Y1' : 'Y2', aktuator: g.actuator, valf: g.valve }); });
      for (const s of g.sensors) autoInfo.set(s.kod, { devre: g.name, rol: s.role, aktuator: g.actuator, valf: g.valve });
    }
    if (auto.supply.main) autoInfo.set(auto.supply.main.kod, { devre: 'Besleme', rol: 'ANA' });
    if (auto.supply.pressure) autoInfo.set(auto.supply.pressure.kod, { devre: 'Besleme', rol: 'BASINC' });
    for (const e of auto.excluded) autoInfo.set(e.kod, { devre: '', rol: 'HARIC', reason: e.reason });
    return [...rows.values()].map((r) => {
      const saved = app.mapping.get(r.kod);
      const info = saved && saved.rol ? Object.assign({}, saved, { source: 'saved' }) : Object.assign({ devre: '', rol: '' }, autoInfo.get(r.kod), { source: 'auto' });
      return Object.assign({}, r, info);
    }).sort((a, b) => a.kod.localeCompare(b.kod, 'tr', { numeric: true }));
  }

  function renderMapChips() {
    const box = $('mapChips');
    const current = String($('mapListSeri').value || '').trim().toUpperCase();
    box.innerHTML = SERIES.map((s) => `<button type="button" class="ml-chip${current === s ? ' active' : ''}" data-seri="${s}">${s}</button>`).join('');
  }

  function renderMapping() {
    const seri = String($('mapListSeri').value || '').trim().toUpperCase();
    const words = fold($('mapListText').value.trim()).split(/\s+/).filter(Boolean);
    const all = mappingRows();
    const rows = all.filter((r) => {
      if (seri && !r.kod.startsWith(seri)) return false;
      const text = fold(`${r.name} ${r.devre}`);
      return words.every((w) => text.includes(w));
    });
    renderMapChips();
    $('codeCount').textContent = all.length || '';
    $('mapResult').textContent = `${rows.length} / ${all.length} kod · ${all.filter((r) => r.source === 'saved').length} kayıtlı`;
    const devreler = [...new Set(all.map((r) => r.devre).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
    $('mapDevreList').innerHTML = devreler.map((d) => `<option value="${esc(d)}"></option>`).join('');
    $('mapBody').innerHTML = rows.map((r) => {
      const type = r.rol === 'HARIC' ? (r.reason || '') : r.rol === 'ANA' || r.rol === 'BASINC' ? 'Besleme' : [ACT_TEXT[r.aktuator], VALVE_TEXT[r.valf]].filter(Boolean).join(' · ');
      const badge = r.source === 'saved' ? '<span class="map-badge saved">Kayıtlı</span>' : r.rol === 'HARIC' ? '<span class="map-badge off">Hariç</span>' : '<span class="map-badge auto">Otomatik</span>';
      return `<tr data-kod="${esc(r.kod)}">
        <td class="ml-td-kod">${esc(r.kod)}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.devre)}</td>
        <td title="${esc(ROLE_TEXT[r.rol] || '')}">${esc(r.rol)}</td>
        <td class="ml-td-muted">${esc(type)}</td>
        <td>${badge}</td>
        <td class="ml-td-actions"><button type="button" class="btn btn-sm" data-edit="${esc(r.kod)}">Düzenle</button>${r.source === 'saved' ? ` <button type="button" class="btn btn-sm" data-reset="${esc(r.kod)}" title="Kaydı sil, otomatik yoruma dön">Otomatik</button>` : ''}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="ml-note">Kod bulunamadı</td></tr>';
  }

  function fillSelects() {
    $('mapRol').innerHTML = PidLink.ROLES.map(([v, t]) => `<option value="${v}">${esc(v)} · ${esc(t)}</option>`).join('');
    $('mapAkt').innerHTML = '<option value="">Otomatik</option>' + PidLink.ACTUATORS.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('');
    $('mapValf').innerHTML = '<option value="">Otomatik</option>' + PidLink.VALVES.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('');
  }

  function editRow(kod) {
    const row = mappingRows().find((r) => r.kod === kod) || { kod, devre: '', rol: 'Y1', aktuator: '', valf: '' };
    editing = kod;
    $('mapKod').value = row.kod;
    $('mapKod').readOnly = true;
    $('mapDevre').value = row.devre || '';
    $('mapRol').value = row.rol || 'Y1';
    $('mapAkt').value = row.source === 'saved' ? row.aktuator || '' : row.aktuator || '';
    $('mapValf').value = row.source === 'saved' ? row.valf || '' : '';
    $('mapCancel').hidden = false;
    $('mapSubmit').textContent = 'Kaydet';
    $('mapDevre').focus();
  }

  function resetForm() {
    editing = null;
    $('mapForm').reset();
    $('mapKod').readOnly = false;
    $('mapCancel').hidden = true;
  }

  async function persist(next, message) {
    const res = await host().engine.saveMapping(PidLink.toMappingCsv(next));
    if (!res.ok) {
      app.toast(`Kaydedilemedi: ${res.error}`, 'error');
      return false;
    }
    app.setMapping(next);
    renderMapping();
    if (message) app.toast(message);
    return true;
  }

  async function submit(e) {
    e.preventDefault();
    const kod = String($('mapKod').value || '').trim().toUpperCase();
    if (!kod) return;
    const next = new Map(app.mapping);
    next.set(kod, {
      kod,
      devre: $('mapDevre').value.trim(),
      rol: $('mapRol').value,
      aktuator: $('mapAkt').value,
      valf: $('mapValf').value
    });
    if (await persist(next, `${kod} eşleştirmesi kaydedildi`)) resetForm();
  }

  async function importCsv(file) {
    const text = await file.text();
    const rows = PidLink.parseMappingCsv(text);
    if (!rows.size) {
      app.toast('CSV dosyasında geçerli satır yok (KOD;DEVRE;ROL;AKTUATOR;VALF)', 'error');
      return;
    }
    const next = new Map(app.mapping);
    for (const [k, v] of rows) next.set(k, v);
    await persist(next, `${rows.size} satır içe aktarıldı`);
  }

  async function exportCsv() {
    if (host().noPrint) {
      app.toast('Bu önizleme dosya indiremez. CSV için programı bilgisayarınızda açın.', 'error');
      return;
    }
    // Kayıtlı ve otomatik satırların hepsi dışa aktarılır; Excel'de düzenleyip geri yüklenebilir
    const all = new Map(mappingRows().map((r) => [r.kod, { kod: r.kod, devre: r.devre || '', rol: r.rol || '', aktuator: r.aktuator || '', valf: r.source === 'saved' ? r.valf || '' : '' }]));
    const res = await host().engine.exportCsv({ name: 'eslestirme.csv', text: PidLink.toMappingCsv(all) });
    if (res.ok) app.toast(res.downloaded ? `İndirildi: ${res.filePath}` : `Kaydedildi: ${res.filePath}`);
    else if (!res.canceled) app.toast(res.error, 'error');
  }

  function bind() {
    document.addEventListener('click', (e) => {
      const action = e.target.closest && e.target.closest('[data-pid-action]');
      if (action) {
        if (action.dataset.pidAction === 'link') link();
        else grant();
      }
    });
    $('btnPidLink').addEventListener('click', linkMenu);
    $('pidPage').addEventListener('click', (e) => {
      const open = e.target.closest('[data-open]');
      if (open) {
        app.openProject(open.dataset.open);
        return;
      }
      const fromPid = e.target.closest('[data-create-pid]');
      if (fromPid) {
        const p = projects.find((x) => x.id === fromPid.dataset.createPid);
        if (p) app.newProjectModal({ pidProje: p.id, seriNo: p.meta.seriNo, musteri: p.meta.musteri, model: p.meta.model, firma: p.meta.firma, dil: p.meta.dil });
        return;
      }
      const fromMachine = e.target.closest('[data-create-machine]');
      if (fromMachine) {
        const m = machines.find((x) => x.id === fromMachine.dataset.createMachine);
        const pid = m && projects.find((p) => p.machine && p.machine.id === m.id);
        if (m) app.newProjectModal({ pidProje: pid ? pid.id : '', seriNo: m.seriNo, musteri: m.firma, model: m.model, makineId: m.id });
      }
    });
    fillSelects();
    $('mapForm').addEventListener('submit', submit);
    $('mapCancel').addEventListener('click', resetForm);
    $('mapListSeri').addEventListener('input', renderMapping);
    $('mapListText').addEventListener('input', renderMapping);
    $('mapClear').addEventListener('click', () => {
      $('mapListSeri').value = '';
      $('mapListText').value = '';
      renderMapping();
    });
    $('mapChips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-seri]');
      if (!chip) return;
      $('mapListSeri').value = $('mapListSeri').value.toUpperCase() === chip.dataset.seri ? '' : chip.dataset.seri;
      renderMapping();
    });
    $('mapBody').addEventListener('click', async (e) => {
      const edit = e.target.closest('[data-edit]');
      if (edit) {
        editRow(edit.dataset.edit);
        return;
      }
      const reset = e.target.closest('[data-reset]');
      if (reset) {
        const next = new Map(app.mapping);
        next.delete(reset.dataset.reset);
        await persist(next, `${reset.dataset.reset} otomatik yoruma döndü`);
      }
    });
    $('mapCsvImport').addEventListener('click', () => $('mapCsvInput').click());
    $('mapCsvInput').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) await importCsv(file);
    });
    $('mapCsvExport').addEventListener('click', exportCsv);
  }

  function init(appRef) {
    app = appRef;
    bind();
    renderLinkState();
  }

  return {
    init,
    load,
    link,
    grant,
    renderLinkState,
    renderPidPage,
    renderMapping,
    get projects() { return projects; },
    get machines() { return machines; },
    pneumaticCodes
  };
})();
