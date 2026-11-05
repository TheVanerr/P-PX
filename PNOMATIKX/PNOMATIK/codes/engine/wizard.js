/* Otomatik Oluştur: P&ID kodlarından pnömatik devre önerisi, gözden geçirme ve çizim.
   Öneri PidLink.group ile gelir (Kod Eşleştirme listesi + kod adından tahmin); kullanıcı devre adını, aktüatör ve
   valf tipini, her kodun rolünü ve devresini değiştirebilir. Çizim PidGen ile kurulur. */

const PidWizard = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let app = null;
  let state = null;

  const nameOf = (kod) => ((app.catalogMap.get(kod) || {}).name || '');
  const POS = { B1: 0, B2: 1, B3: 0.5, SB: 0 };

  /** Öneriyi düzenlenebilir duruma çevirir */
  function fromResult(result, codes, source) {
    const groups = result.circuits.map((g) => ({
      include: true,
      name: g.name,
      actuator: g.actuator,
      valve: g.valve,
      valveAuto: !g.saved || !g.valve,
      coils: [g.coils[0] ? Object.assign({}, g.coils[0]) : null, g.coils[1] ? Object.assign({}, g.coils[1]) : null],
      sensors: g.sensors.map((s) => Object.assign({}, s))
    }));
    return {
      source,
      codes,
      groups,
      supply: {
        manual: true,
        frl: 's.frl',
        main: result.supply.main ? result.supply.main.kod : '',
        mainOn: true,
        pressure: result.supply.pressure ? result.supply.pressure.kod : '',
        pressureOn: true
      },
      excluded: result.excluded.map((e) => Object.assign({}, e)),
      options: { flowControls: true, silencers: true, legend: true, names: true, save: false, mode: 'replace' }
    };
  }

  function codesOf(g) {
    return g.coils.filter(Boolean).map((c) => c.kod).concat(g.sensors.map((s) => s.kod));
  }

  function roleOf(g, kod) {
    if (g.coils[0] && g.coils[0].kod === kod) return 'Y1';
    if (g.coils[1] && g.coils[1].kod === kod) return 'Y2';
    const s = g.sensors.find((x) => x.kod === kod);
    return s ? s.role : '';
  }

  /** Kodu bulunduğu yerden çıkarır: {kod, name, role} */
  function takeCode(kod) {
    for (const g of state.groups) {
      for (let i = 0; i < 2; i += 1) {
        if (g.coils[i] && g.coils[i].kod === kod) {
          const c = g.coils[i];
          g.coils[i] = null;
          return { kod, name: c.name, role: i === 0 ? 'Y1' : 'Y2' };
        }
      }
      const idx = g.sensors.findIndex((s) => s.kod === kod);
      if (idx >= 0) {
        const [s] = g.sensors.splice(idx, 1);
        return { kod, name: s.name, role: s.role };
      }
    }
    if (state.supply.main === kod) {
      state.supply.main = '';
      return { kod, name: nameOf(kod), role: 'ANA' };
    }
    if (state.supply.pressure === kod) {
      state.supply.pressure = '';
      return { kod, name: nameOf(kod), role: 'BASINC' };
    }
    const ex = state.excluded.findIndex((e) => e.kod === kod);
    if (ex >= 0) {
      state.excluded.splice(ex, 1);
      return { kod, name: nameOf(kod), role: 'HARIC' };
    }
    return { kod, name: nameOf(kod), role: '' };
  }

  /** Kodu gruba verilen rolle koyar; bobin yeri doluysa eski kod diğer bobine ya da sensöre kayar */
  function putCode(g, info, role) {
    if (role === 'Y1' || role === 'Y2') {
      const slot = role === 'Y1' ? 0 : 1;
      const prev = g.coils[slot];
      g.coils[slot] = { kod: info.kod, name: info.name };
      if (prev) {
        const other = slot === 0 ? 1 : 0;
        if (!g.coils[other]) g.coils[other] = prev;
        else state.excluded.push({ kod: prev.kod, name: prev.name, reason: `${g.name}: bobin yeri yok` });
      }
    } else {
      g.sensors.push({ kod: info.kod, name: info.name, role, pos: POS[role] == null ? 0 : POS[role] });
      g.sensors.sort((a, b) => a.pos - b.pos);
    }
    if (g.valveAuto) g.valve = PidLink.defaultValve(g);
  }

  function applyChoice(gIndex, kod, value) {
    const [kind, arg] = value.split(':');
    const info = takeCode(kod);
    if (kind === 'role') {
      if (arg === 'ANA') {
        if (state.supply.main) state.excluded.push({ kod: state.supply.main, name: nameOf(state.supply.main), reason: 'Ana valf değişti' });
        state.supply.main = kod;
        state.supply.mainOn = true;
      } else if (arg === 'BASINC') {
        if (state.supply.pressure) state.excluded.push({ kod: state.supply.pressure, name: nameOf(state.supply.pressure), reason: 'Basınç sensörü değişti' });
        state.supply.pressure = kod;
        state.supply.pressureOn = true;
      } else if (arg === 'HARIC') {
        state.excluded.push({ kod, name: info.name, reason: 'Elle hariç tutuldu', manual: true });
      } else if (state.groups[gIndex]) {
        putCode(state.groups[gIndex], info, arg);
      } else {
        // Hariç listesinden gelen kod kendi devresini kurar
        const c = PidLink.classify(kod, info.name);
        const g = { include: true, name: c.display || kod, actuator: c.actuator || 'silindir', valve: '', valveAuto: true, coils: [null, null], sensors: [] };
        state.groups.push(g);
        putCode(g, info, arg);
      }
    } else if (kind === 'move') {
      const role = info.role && info.role !== 'ANA' && info.role !== 'BASINC' && info.role !== 'HARIC' ? info.role : 'Y1';
      let target;
      if (arg === 'new') {
        const c = PidLink.classify(kod, info.name);
        target = { include: true, name: c.display || kod, actuator: c.actuator || 'silindir', valve: '', valveAuto: true, coils: [null, null], sensors: [] };
        state.groups.push(target);
      } else {
        target = state.groups[parseInt(arg, 10)];
      }
      putCode(target, info, role);
    }
    for (const g of state.groups) if (g.valveAuto) g.valve = PidLink.defaultValve(g);
    state.groups = state.groups.filter((g) => codesOf(g).length);
    render();
  }

  function choiceSelect(gIndex, kod, current) {
    const roles = PidLink.ROLES.map(([v, t]) => `<option value="role:${v}"${v === current ? ' selected' : ''}>${esc(v)} · ${esc(t)}</option>`).join('');
    const moves = state.groups.map((g, i) => (i === gIndex ? '' : `<option value="move:${i}">→ ${i + 1}. ${esc(g.name.slice(0, 40))}</option>`)).join('');
    return `<select data-code="${esc(kod)}" data-group="${gIndex}" title="Rolü değiştir veya başka devreye taşı"><optgroup label="Rol">${roles}</optgroup><optgroup label="Devreye taşı">${moves}<option value="move:new">→ Yeni devre</option></optgroup></select>`;
  }

  function supplyCodeSelect(id, value, series) {
    const options = state.codes.filter((k) => PidLink.seriesOf(k) === series)
      .map((k) => `<option value="${esc(k)}"${k === value ? ' selected' : ''}>${esc(k)} · ${esc(nameOf(k))}</option>`).join('');
    return `<select id="${id}" class="field-input"><option value="">P&amp;ID kodu yok</option>${options}</select>`;
  }

  function summary() {
    const by = new Map();
    for (const k of state.codes) {
      const s = PidLink.seriesOf(k);
      by.set(s, (by.get(s) || 0) + 1);
    }
    return [...by.entries()].map(([s, n]) => `${s}: ${n}`).join(' · ');
  }

  function render() {
    const root = $('modalRoot');
    const s = state.supply;
    const o = state.options;
    const hasDrawing = app.editor.drawing.sheets.some((sh) => sh.items.length);
    const actOptions = (v) => PidLink.ACTUATORS.map(([id, t]) => `<option value="${id}"${id === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const valveOptions = (v) => PidLink.VALVES.map(([id, t]) => `<option value="${id}"${id === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const rows = state.groups.map((g, i) => {
      const chips = codesOf(g).map((kod) => `<span class="gen-chip" title="${esc(nameOf(kod))}"><b>${esc(kod)}</b>${choiceSelect(i, kod, roleOf(g, kod))}</span>`).join('');
      return `<tr class="gen-group${g.include ? '' : ' gen-off'}">
        <td class="gen-nr"><label><input type="checkbox" data-include="${i}"${g.include ? ' checked' : ''}> ${i + 1}</label></td>
        <td><input class="field-input gen-name" data-name="${i}" value="${esc(g.name)}"></td>
        <td><select class="field-input" data-act="${i}">${actOptions(g.actuator)}</select></td>
        <td><select class="field-input" data-valve="${i}">${valveOptions(g.valve)}</select></td>
        <td><div class="gen-codes">${chips || '<span class="gen-desc">kod yok</span>'}</div></td>
      </tr>`;
    }).join('');
    const excluded = state.excluded.length
      ? `<div class="gen-excluded">Çizime girmeyen kodlar: ${state.excluded.map((e) => `<span class="gen-chip" title="${esc(e.reason || '')}"><b>${esc(e.kod)}</b>${choiceSelect(-1, e.kod, 'HARIC')}</span>`).join(' ')}</div>`
      : '';
    root.innerHTML = `
      <div class="modal-overlay">
        <form class="modal gen-modal" id="genForm">
          <h2>Otomatik Oluştur: P&amp;ID kodlarından pnömatik şema</h2>
          <div class="gen-summary">Kaynak: <strong>${esc(state.source)}</strong> · ${state.codes.length} pnömatik P&amp;ID kodu (${esc(summary())}) · ${state.groups.filter((g) => g.include).length} devre</div>
          <div class="gen-supply">
            <strong>Besleme (devre 0):</strong>
            <label><input type="checkbox" id="genManual"${s.manual ? ' checked' : ''}> Manuel kesme vanası</label>
            <label>Şartlandırıcı <select id="genFrl" class="field-input"><option value="s.frl"${s.frl === 's.frl' ? ' selected' : ''}>Filtre-Regülatör-Yağlayıcı</option><option value="s.fr"${s.frl === 's.fr' ? ' selected' : ''}>Filtre-Regülatör</option></select></label>
            <label><input type="checkbox" id="genMainOn"${s.mainOn ? ' checked' : ''}> Tahliyeli ana valf (3/2)</label> ${supplyCodeSelect('genMain', s.main, 'V')}
            <label><input type="checkbox" id="genPressOn"${s.pressureOn ? ' checked' : ''}> Basınç sensörü</label> ${supplyCodeSelect('genPress', s.pressure, 'PS')}
          </div>
          <div class="gen-table-wrap">
            <table class="gen-table">
              <thead><tr><th>Devre</th><th>Devre adı (şemada başlık)</th><th>Aktüatör</th><th>Yön valfi</th><th>P&amp;ID kodları ve rolleri (Y1 = bobin 14, Y2 = bobin 12, B = sensör)</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="5" class="gen-desc">Pnömatik devre bulunamadı</td></tr>'}</tbody>
            </table>
          </div>
          ${excluded}
          <div class="gen-options">
            <label><input type="checkbox" id="genFlow"${o.flowControls ? ' checked' : ''}> Silindirlere akış kontrol (egzoz kısma)</label>
            <label><input type="checkbox" id="genSil"${o.silencers ? ' checked' : ''}> Susturucular</label>
            <label><input type="checkbox" id="genNames"${o.names ? ' checked' : ''}> Devre adları</label>
            <label><input type="checkbox" id="genLegend"${o.legend ? ' checked' : ''}> Lejant</label>
            <label><input type="checkbox" id="genSave"${o.save ? ' checked' : ''}> Rolleri Kod Eşleştirme listesine kaydet (tüm projeler)</label>
          </div>
          ${hasDrawing ? `<div class="gen-options">
            <label><input type="radio" name="genMode" value="replace"${o.mode === 'replace' ? ' checked' : ''}> Mevcut şema sayfalarını yeniden çiz</label>
            <label><input type="radio" name="genMode" value="append"${o.mode === 'append' ? ' checked' : ''}> Yalnız şemada olmayan kodların devrelerini yeni sayfalara ekle</label>
          </div>` : ''}
          <div class="field-help">Kodlar ISO 1219-2'ye göre verilir: 0Z1 şartlandırıcı, nA1 aktüatör, nV1 yön valfi, nY1/nY2 bobin, nB1… sensör. P&amp;ID kodları şemada [ ] içinde yazar ve Açıklama Sayfası 2'de eşleştirilir.</div>
          <div class="modal-actions">
            <button type="button" class="btn" id="genCancel">İptal</button>
            <button type="submit" class="btn btn-primary">Şemayı Oluştur</button>
          </div>
        </form>
      </div>`;
    bind();
  }

  function readInputs() {
    const s = state.supply;
    s.manual = $('genManual').checked;
    s.frl = $('genFrl').value;
    s.mainOn = $('genMainOn').checked;
    s.main = $('genMain').value;
    s.pressureOn = $('genPressOn').checked;
    s.pressure = $('genPress').value;
    const o = state.options;
    o.flowControls = $('genFlow').checked;
    o.silencers = $('genSil').checked;
    o.names = $('genNames').checked;
    o.legend = $('genLegend').checked;
    o.save = $('genSave').checked;
    const mode = document.querySelector('input[name="genMode"]:checked');
    o.mode = mode ? mode.value : 'replace';
  }

  function bind() {
    const form = $('genForm');
    form.addEventListener('change', (e) => {
      const el = e.target;
      if (el.dataset.code) {
        readInputs();
        applyChoice(parseInt(el.dataset.group, 10), el.dataset.code, el.value);
        return;
      }
      if (el.dataset.include) {
        state.groups[+el.dataset.include].include = el.checked;
        el.closest('tr').classList.toggle('gen-off', !el.checked);
        return;
      }
      if (el.dataset.act) {
        const g = state.groups[+el.dataset.act];
        g.actuator = el.value;
        if (g.valveAuto) g.valve = PidLink.defaultValve(g);
        readInputs();
        render();
        return;
      }
      if (el.dataset.valve) {
        const g = state.groups[+el.dataset.valve];
        g.valve = el.value;
        g.valveAuto = false;
        return;
      }
      readInputs();
    });
    form.addEventListener('input', (e) => {
      if (e.target.dataset.name) state.groups[+e.target.dataset.name].name = e.target.value;
    });
    $('genCancel').addEventListener('click', close);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      readInputs();
      build();
    });
  }

  function close() {
    $('modalRoot').innerHTML = '';
    state = null;
  }

  /** Durumu PidLink.assign girdisine çevirir */
  function toResult(groups) {
    const s = state.supply;
    return {
      supply: {
        main: s.mainOn && s.main ? { kod: s.main, name: nameOf(s.main) } : null,
        pressure: s.pressureOn && s.pressure ? { kod: s.pressure, name: nameOf(s.pressure) } : null
      },
      circuits: groups.map((g) => ({
        name: g.name,
        actuator: g.actuator,
        valve: g.valve,
        coils: g.coils,
        sensors: g.sensors,
        codes: codesOf(g)
      })),
      excluded: state.excluded
    };
  }

  function saveRoles() {
    const next = new Map(app.mapping);
    for (const g of state.groups) {
      if (!g.include) continue;
      g.coils.forEach((c, i) => {
        if (c) next.set(c.kod, { kod: c.kod, devre: g.name, rol: i === 0 ? 'Y1' : 'Y2', aktuator: g.actuator, valf: g.valveAuto ? '' : g.valve });
      });
      for (const sn of g.sensors) next.set(sn.kod, { kod: sn.kod, devre: g.name, rol: sn.role, aktuator: g.actuator, valf: g.valveAuto ? '' : g.valve });
    }
    if (state.supply.main) next.set(state.supply.main, { kod: state.supply.main, devre: 'Besleme', rol: 'ANA', aktuator: '', valf: '' });
    if (state.supply.pressure) next.set(state.supply.pressure, { kod: state.supply.pressure, devre: 'Besleme', rol: 'BASINC', aktuator: '', valf: '' });
    for (const e of state.excluded) if (e.manual) next.set(e.kod, { kod: e.kod, devre: '', rol: 'HARIC', aktuator: '', valf: '' });
    return app.saveMapping(next);
  }

  async function build() {
    const groups = state.groups.filter((g) => g.include && codesOf(g).length);
    const o = state.options;
    const lang = (app.editor.project && app.editor.project.dil) || 'tr';
    const genOpts = { lang, names: o.names, silencers: o.silencers, legend: o.legend };
    let message;
    if (o.mode === 'append' && app.editor.drawing.sheets.some((sh) => sh.items.length)) {
      const linked = PidModel.usedPids(app.editor.drawing);
      const missing = groups.filter((g) => codesOf(g).some((k) => !linked.has(k)));
      if (!missing.length) {
        app.toast('Tüm devreler şemada zaten var', 'error');
        return;
      }
      const plan = PidLink.assign(Object.assign(toResult(missing), { supply: { main: null, pressure: null } }), {
        start: PidLink.maxCircuit(app.editor.drawing) + 1,
        manualValve: false,
        mainValve: false,
        pressureSensor: false,
        flowControls: o.flowControls
      });
      const added = PidGen.appendCircuits(app.editor.drawing, plan.circuits, genOpts);
      app.afterGenerate(app.editor.drawing.sheets.length - added);
      message = `${plan.circuits.length} devre ${added} yeni sayfaya eklendi`;
    } else {
      const plan = PidLink.assign(toResult(groups), {
        manualValve: state.supply.manual,
        mainValve: state.supply.mainOn,
        forceMainValve: state.supply.mainOn,
        pressureSensor: state.supply.pressureOn,
        flowControls: o.flowControls
      });
      plan.supply.frlSymbol = state.supply.frl;
      const drawing = PidGen.build(plan, genOpts);
      app.replaceDrawing(drawing);
      message = `${plan.circuits.length} devre, ${drawing.sheets.length} sayfa çizildi`;
    }
    if (o.save) await saveRoles();
    close();
    app.toast(message);
  }

  /**
   * @param codes P&ID kodları (pnömatikle ilgili olanlar süzülür)
   * @param source kaynak açıklaması
   */
  function open(codes, source) {
    const relevant = [...new Set(codes.map((k) => String(k).trim().toUpperCase()))]
      .filter((k) => PidLink.isRelevant(k, nameOf(k)))
      .sort((a, b) => a.localeCompare(b, 'tr', { numeric: true }));
    const entries = relevant.map((kod) => ({ kod, name: nameOf(kod) }));
    const result = PidLink.group(entries, app.mapping);
    state = fromResult(result, relevant, source);
    render();
  }

  function init(appRef) {
    app = appRef;
  }

  return { init, open, close, isOpen: () => !!state };
})();
