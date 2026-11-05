/* CAD — P&ID otomatik çizim uygulaması */

(function () {
  'use strict';

  var STORAGE_KODLAR = 'cad_kodlar';
  var STORAGE_HISTORY = 'cad_history';

  var kodlar = [];
  var machineTypes = [];
  var seciliMakineTypeId = null;
  var seciliKodlar = new Set();
  var activeSeriFilter = '';

  var $ = function (sel) { return document.querySelector(sel); };

  function toast(msg, type) {
    type = type || 'success';
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast ' + type;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.add('hidden'); }, 3500);
  }

  function esc(str) {
    var d = document.createElement('div');
    d.textContent = str != null ? str : '';
    return d.innerHTML;
  }

  function downloadFile(content, filename, mime) {
    var blob = new Blob([content], { type: mime || 'application/xml' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function safeFileName(name) {
    return String(name || 'PID')
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, ' ')
      .trim() || 'PID';
  }

  function loadStorage() {
    try {
      kodlar = JSON.parse(localStorage.getItem(STORAGE_KODLAR)) || [];
    } catch (e) {
      kodlar = [];
    }
  }

  function saveKodlarStorage() {
    localStorage.setItem(STORAGE_KODLAR, JSON.stringify(kodlar));
  }

  function extractSeri(kod) {
    return CadSymbols.extractSeri(kod);
  }

  function parseCsv(text) {
    var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    var sep = lines[0].indexOf(';') >= 0 ? ';' : ',';
    var start = /^kod/i.test(lines[0].split(sep)[0]) ? 1 : 0;
    var out = [];
    for (var i = start; i < lines.length; i++) {
      var parts = lines[i].split(sep);
      var kod = (parts[0] || '').trim();
      if (!kod) continue;
      out.push({
        kod: kod,
        ad: (parts[1] || '').trim(),
        aciklama: (parts[2] || parts[1] || '').trim()
      });
    }
    return out;
  }

  function parseKodJson(data) {
    if (Array.isArray(data)) {
      return data.map(function (k) {
        return { kod: k.kod, ad: k.ad || k.bilesenAdi || '', aciklama: k.aciklama || k.description || '' };
      });
    }
    if (data && Array.isArray(data.kodlar)) {
      return parseKodJson(data.kodlar);
    }
    return [];
  }

  function setKodlar(list) {
    kodlar = list.filter(function (k) { return k.kod; });
    saveKodlarStorage();
    updateSetupBanner();
    renderKodList();
    updateUretButton();
  }

  function updateSetupBanner() {
    $('#setupBanner').classList.toggle('hidden', kodlar.length > 0);
  }

  function getMakineType() {
    return machineTypes.find(function (t) { return t.id === seciliMakineTypeId; }) || null;
  }

  function renderMachineTypes() {
    var el = $('#machineTypeList');
    el.innerHTML = machineTypes.map(function (t) {
      return (
        '<button type="button" class="machine-type-btn ' + (seciliMakineTypeId === t.id ? 'active' : '') + '" data-id="' + esc(t.id) + '">' +
        '<span class="mt-name">' + esc(t.name) + '</span>' +
        '<span class="mt-label">' + esc(t.label) + '</span>' +
        '</button>'
      );
    }).join('');

    el.querySelectorAll('.machine-type-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        seciliMakineTypeId = btn.dataset.id;
        renderMachineTypes();
        onMachineTypeChange();
      });
    });
  }

  function onMachineTypeChange() {
    var mt = getMakineType();
    $('#machineTypeDesc').textContent = mt ? mt.description : '';
    var tplRow = $('#useTemplate').closest('.checkbox-row');
    if (mt && mt.template) {
      tplRow.classList.remove('hidden');
    } else {
      tplRow.classList.add('hidden');
      $('#useTemplate').checked = false;
    }
    if (mt && !$('#projectName').value.trim()) {
      $('#projectName').value = mt.label + ' P&ID';
    }
    updatePreviewMeta();
    updateUretButton();
  }

  function getFilteredKodlar() {
    var q = ($('#kodArama').value || '').trim().toLowerCase();
    return kodlar.filter(function (k) {
      var seriOk = !activeSeriFilter || extractSeri(k.kod) === activeSeriFilter;
      var text = [k.kod, k.ad, k.aciklama].join(' ').toLowerCase();
      return seriOk && (!q || text.indexOf(q) >= 0);
    });
  }

  function renderSeriChips() {
    var counts = {};
    kodlar.forEach(function (k) {
      var s = extractSeri(k.kod);
      counts[s] = (counts[s] || 0) + 1;
    });
    var seriler = Object.keys(counts).sort();
    var el = $('#seriChips');
    el.innerHTML = seriler.map(function (s) {
      return '<button type="button" class="seri-chip ' + (activeSeriFilter === s ? 'active' : '') + '" data-seri="' + esc(s) + '">' +
        esc(s) + ' <span>' + counts[s] + '</span></button>';
    }).join('');
    el.querySelectorAll('.seri-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        activeSeriFilter = activeSeriFilter === chip.dataset.seri ? '' : chip.dataset.seri;
        renderSeriChips();
        renderKodList();
      });
    });
  }

  function renderKodList() {
    var list = getFilteredKodlar();
    $('#seciliSayisi').textContent = seciliKodlar.size + ' seçili';
    $('#kodList').innerHTML = list.map(function (k) {
      var checked = seciliKodlar.has(k.kod) ? ' checked' : '';
      var opt = CadSymbols.isOptional(k.kod);
      return (
        '<label class="kod-row' + (opt ? ' optional' : '') + '">' +
        '<input type="checkbox" data-kod="' + esc(k.kod) + '"' + checked + '>' +
        '<span class="kod-tag">' + esc(k.kod) + '</span>' +
        '<span class="kod-desc">' + esc(k.ad || k.aciklama) + '</span>' +
        '</label>'
      );
    }).join('') || '<p class="hint">Katalog boş veya filtre sonucu yok.</p>';

    $('#kodList').querySelectorAll('input[type=checkbox]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (cb.checked) seciliKodlar.add(cb.dataset.kod);
        else seciliKodlar.delete(cb.dataset.kod);
        $('#seciliSayisi').textContent = seciliKodlar.size + ' seçili';
        updatePreviewMeta();
        updateUretButton();
      });
    });

    renderSeriChips();
  }

  function updateUretButton() {
    $('#btnUret').disabled = !(seciliMakineTypeId && seciliKodlar.size > 0);
  }

  function updatePreviewMeta() {
    var mt = getMakineType();
    var parts = [];
    if (mt) parts.push(mt.label);
    parts.push(seciliKodlar.size + ' component');
    $('#previewMeta').textContent = parts.join(' · ');
  }

  function showPreviewSummary(kodList) {
    $('#previewEmpty').classList.add('hidden');
    $('#previewContent').classList.remove('hidden');
    var grouped = CadDrawioBuilder.groupBySeri(kodList);
    var lines = Object.keys(grouped).sort().map(function (seri) {
      return seri + ': ' + grouped[seri].join(', ');
    });
    $('#previewSummary').textContent = kodList.length + ' tag — ' + Object.keys(grouped).length + ' seri';
    $('#previewTags').textContent = lines.join('\n');
  }

  function addHistory(entry) {
    var history = [];
    try {
      history = JSON.parse(localStorage.getItem(STORAGE_HISTORY)) || [];
    } catch (e) { history = []; }
    history.unshift(entry);
    history = history.slice(0, 8);
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
    renderHistory();
  }

  function renderHistory() {
    var history = [];
    try {
      history = JSON.parse(localStorage.getItem(STORAGE_HISTORY)) || [];
    } catch (e) { history = []; }
    var el = $('#historyList');
    $('#historyEmpty').classList.toggle('hidden', history.length > 0);
    el.innerHTML = history.map(function (h) {
      return '<li><strong>' + esc(h.file) + '</strong><span>' + esc(h.date) + ' · ' + h.count + ' tag</span></li>';
    }).join('');
  }

  function applyDefaults() {
    var mt = getMakineType();
    if (!mt || !mt.defaultKodlar) return;
    mt.defaultKodlar.forEach(function (k) {
      if (kodlar.some(function (x) { return x.kod === k; })) seciliKodlar.add(k);
    });
    renderKodList();
    updatePreviewMeta();
    updateUretButton();
    toast('Varsayılan componentler seçildi');
  }

  function fetchTemplate(name) {
    return fetch('templates/' + encodeURIComponent(name)).then(function (r) {
      if (!r.ok) throw new Error('Şablon bulunamadı');
      return r.text();
    });
  }

  function produceDrawio() {
    var mt = getMakineType();
    if (!mt) {
      toast('Makine tipi seçin', 'error');
      return;
    }
    var kodList = Array.from(seciliKodlar).sort();
    if (!kodList.length) {
      toast('En az bir component seçin', 'error');
      return;
    }

    var projectName = ($('#projectName').value || mt.label + ' P&ID').trim();
    var seriNo = ($('#seriNo').value || '').trim();
    var useTemplate = $('#useTemplate').checked && mt.template;

    function finish(xml) {
      var fileName = safeFileName(projectName) + '.drawio';
      downloadFile(xml, fileName, 'application/xml');
      showPreviewSummary(kodList);
      addHistory({
        file: fileName,
        date: new Date().toLocaleString('tr-TR'),
        count: kodList.length
      });
      toast('P&ID üretildi: ' + fileName);
    }

    if (useTemplate) {
      fetchTemplate(mt.template)
        .then(function (xml) {
          finish(CadDrawioBuilder.filterTemplateDrawio(xml, kodList));
        })
        .catch(function () {
          toast('Şablon yüklenemedi — otomatik layout kullanılıyor', 'error');
          finish(CadDrawioBuilder.generateDrawio({
            machineType: mt,
            kodlar: kodList,
            projectName: projectName,
            seriNo: seriNo
          }));
        });
    } else {
      finish(CadDrawioBuilder.generateDrawio({
        machineType: mt,
        kodlar: kodList,
        projectName: projectName,
        seriNo: seriNo
      }));
    }
  }

  function importMlJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (data.seriNo) $('#seriNo').value = data.seriNo;
        if (data.model) {
          var modelLower = String(data.model).toLowerCase();
          var match = machineTypes.find(function (t) {
            return modelLower.indexOf(t.id.replace(/-/g, ' ')) >= 0 ||
              modelLower.indexOf(t.name.toLowerCase()) >= 0;
          });
          if (match) {
            seciliMakineTypeId = match.id;
            renderMachineTypes();
            onMachineTypeChange();
          }
          if (!$('#projectName').value.trim()) {
            $('#projectName').value = data.model + ' P&ID';
          }
        }
        if (Array.isArray(data.kodlar)) {
          seciliKodlar.clear();
          data.kodlar.forEach(function (k) { seciliKodlar.add(k); });
          renderKodList();
          updatePreviewMeta();
          updateUretButton();
          showPreviewSummary(Array.from(seciliKodlar));
        }
        toast('ML makine kaydı içe aktarıldı');
      } catch (e) {
        toast('Geçersiz JSON', 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  function loadKodFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = reader.result;
      var list;
      if (/\.json$/i.test(file.name)) {
        try {
          list = parseKodJson(JSON.parse(text));
        } catch (e) {
          toast('JSON okunamadı', 'error');
          return;
        }
      } else {
        list = parseCsv(text);
      }
      if (!list.length) {
        toast('Katalog boş', 'error');
        return;
      }
      setKodlar(list);
      toast(list.length + ' kod yüklendi');
    };
    reader.readAsText(file, 'UTF-8');
  }

  function tryAutoLoadKodlar() {
    fetch('../ML/kayitlar/kodlar.json')
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) {
        if (!kodlar.length) setKodlar(parseKodJson(data));
      })
      .catch(function () { /* file:// veya yok — kullanıcı manuel yükler */ });
  }

  function bindEvents() {
    $('#btnKodYukle').addEventListener('click', function () { $('#kodInput').click(); });
    $('#btnSetupKod').addEventListener('click', function () { $('#kodInput').click(); });
    $('#kodInput').addEventListener('change', function () {
      if ($('#kodInput').files[0]) loadKodFile($('#kodInput').files[0]);
      $('#kodInput').value = '';
    });

    $('#btnMlImport').addEventListener('click', function () { $('#mlJsonInput').click(); });
    $('#mlJsonInput').addEventListener('change', function () {
      if ($('#mlJsonInput').files[0]) importMlJson($('#mlJsonInput').files[0]);
      $('#mlJsonInput').value = '';
    });

    $('#kodArama').addEventListener('input', renderKodList);
    $('#btnVarsayilan').addEventListener('click', applyDefaults);
    $('#btnGorunenSec').addEventListener('click', function () {
      getFilteredKodlar().forEach(function (k) { seciliKodlar.add(k.kod); });
      renderKodList();
      updatePreviewMeta();
      updateUretButton();
    });
    $('#btnTemizle').addEventListener('click', function () {
      seciliKodlar.clear();
      renderKodList();
      updatePreviewMeta();
      updateUretButton();
    });
    $('#btnUret').addEventListener('click', produceDrawio);
  }

  function init() {
    loadStorage();
    updateSetupBanner();
    renderHistory();

    if (window.CAD_MACHINE_TYPES && window.CAD_MACHINE_TYPES.types) {
      machineTypes = window.CAD_MACHINE_TYPES.types;
      seciliMakineTypeId = machineTypes[0] && machineTypes[0].id;
      renderMachineTypes();
      onMachineTypeChange();
    } else {
      fetch('data/machine-types.json')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          machineTypes = data.types || [];
          seciliMakineTypeId = machineTypes[0] && machineTypes[0].id;
          renderMachineTypes();
          onMachineTypeChange();
        })
        .catch(function () {
          toast('Makine tipleri yüklenemedi', 'error');
        });
    }

    if (kodlar.length) renderKodList();
    else tryAutoLoadKodlar();

    bindEvents();
    updateUretButton();
  }

  init();
})();
