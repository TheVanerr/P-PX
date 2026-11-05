/* Draw.io P&ID üretici */

(function (root, factory) {
  var symbols = (typeof require !== 'undefined')
    ? require('./symbols.js')
    : (root.CadSymbols || {});

  var api = factory(symbols);
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.CadDrawioBuilder = api;
  }
})(typeof self !== 'undefined' ? self : this, function (Sym) {
  'use strict';

  var ZONE_LAYOUT = {
    left: { x: 20, yStart: 720, cols: 1, dx: 0, dy: 130 },
    top: { xStart: 160, y: 20, cols: 4, dx: 150, dy: 0 },
    'top-right': { xStart: 620, y: 20, cols: 2, dx: 120, dy: 90 },
    right: { xStart: 680, yStart: 400, cols: 1, dx: 0, dy: 100 },
    bottom: { xStart: 280, y: 720, cols: 3, dx: 140, dy: 0 },
    'bottom-left': { xStart: 80, yStart: 1100, cols: 3, dx: 100, dy: 70 },
    'bottom-right': { xStart: 560, yStart: 1100, cols: 2, dx: 120, dy: 70 },
    'left-bottom': { xStart: 40, yStart: 950, cols: 2, dx: 100, dy: 80 },
    'top-left': { xStart: 40, y: 40, cols: 1, dx: 0, dy: 0 },
    inner: { xStart: 520, yStart: 200, cols: 2, dx: 60, dy: 60 },
    'right-bottom': { xStart: 620, yStart: 980, cols: 2, dx: 90, dy: 70 }
  };

  function groupBySeri(kodlar) {
    var map = {};
    kodlar.forEach(function (kod) {
      var seri = Sym.extractSeri(kod);
      if (!map[seri]) map[seri] = [];
      map[seri].push(kod);
    });
    return map;
  }

  function zoneForSeri(seri) {
    var meta = Sym.SERI_META[seri];
    return (meta && meta.zone) || 'right';
  }

  function slotPosition(zoneName, index) {
    var z = ZONE_LAYOUT[zoneName] || ZONE_LAYOUT.right;
    var col = index % (z.cols || 1);
    var row = Math.floor(index / (z.cols || 1));
    var x = z.x != null ? z.x : (z.xStart + col * (z.dx || 100));
    var y = z.y != null ? z.y : (z.yStart + row * (z.dy || 100));
    return { x: x, y: y };
  }

  function basketShell(parent) {
    var cells = [];
    var basketGroup = 'cad-basket-group';
    var cellRect = 'cad-cell-rect';

    cells.push('        <mxCell id="' + cellRect + '" parent="' + parent + '" style="rounded=0;whiteSpace=wrap;html=1;" value="" vertex="1">');
    cells.push('          <mxGeometry height="520" width="520" x="180" y="67.5" as="geometry" />');
    cells.push('        </mxCell>');

    cells.push('        <mxCell id="' + basketGroup + '" connectable="0" parent="' + parent + '" style="group" value="" vertex="1">');
    cells.push('          <mxGeometry height="300" width="300" x="290" y="177.5" as="geometry" />');
    cells.push('        </mxCell>');

    cells.push('        <mxCell id="cad-basket-outer" parent="' + basketGroup + '" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;fillColor=#000000;" value="" vertex="1">');
    cells.push('          <mxGeometry height="300" width="300" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push('        <mxCell id="cad-basket-inner" parent="' + basketGroup + '" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;" value="" vertex="1">');
    cells.push('          <mxGeometry height="280" width="280" x="10" y="10" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push('        <mxCell id="cad-basket-label" parent="' + basketGroup + '" style="text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;rounded=0;" value="&lt;font style=&quot;font-size: 17px;&quot;&gt;WASHING BASKET&lt;/font&gt;" vertex="1">');
    cells.push('          <mxGeometry height="30" width="160" x="70" y="135" as="geometry" />');
    cells.push('        </mxCell>');

    return { cells: cells, anchorId: cellRect, basketGroupId: basketGroup };
  }

  function titleBlock(parent, title, subtitle) {
    var cells = [];
    cells.push('        <mxCell id="cad-title" parent="' + parent + '" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=22;fontStyle=1" value="' + Sym.escXml(title) + '" vertex="1">');
    cells.push('          <mxGeometry height="40" width="500" x="40" y="1280" as="geometry" />');
    cells.push('        </mxCell>');
    if (subtitle) {
      cells.push('        <mxCell id="cad-subtitle" parent="' + parent + '" style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;fontSize=14;fontColor=#64748b;" value="' + Sym.escXml(subtitle) + '" vertex="1">');
      cells.push('          <mxGeometry height="30" width="600" x="40" y="1320" as="geometry" />');
      cells.push('        </mxCell>');
    }
    return cells;
  }

  function generateDrawio(options) {
    options = options || {};
    var kodlar = (options.kodlar || []).slice().sort();
    var machineType = options.machineType || {};
    var projectName = options.projectName || machineType.label || 'P&ID';
    var seriNo = options.seriNo || '';
    var subtitle = [machineType.name, seriNo].filter(Boolean).join(' — ');
    var grouped = groupBySeri(kodlar);
    var allCells = [];
    var edges = [];
    var n = 0;
    var parent = '1';
    var basketAnchor;

    var shell = basketShell(parent);
    allCells = allCells.concat(shell.cells);
    basketAnchor = shell.anchorId;

    Object.keys(grouped).forEach(function (seri) {
      var zone = zoneForSeri(seri);
      grouped[seri].forEach(function (kod, idx) {
        n += 1;
        var pos = slotPosition(zone, idx);
        var built = Sym.buildComponent(kod, parent, pos.x, pos.y, n);
        allCells = allCells.concat(built.cells);
        edges.push(Sym.edgeCell(Sym.makeId('edge', n), parent, built.anchorId, basketAnchor, Sym.isOptional(kod), Sym.isOptional(kod)));
      });
    });

    allCells = allCells.concat(titleBlock(parent, projectName, subtitle));

    var body = [
      '      <root>',
      '        <mxCell id="0" />',
      '        <mxCell id="1" parent="0" />',
      allCells.join('\n'),
      edges.join('\n'),
      '      </root>'
    ].join('\n');

    return [
      '<mxfile host="P&IDX CAD" agent="CAD Generator 1.0" version="1.0">',
      '  <diagram name="P&amp;ID" id="cad-diagram-main">',
      '    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1400" math="0" shadow="0">',
      body,
      '    </mxGraphModel>',
      '  </diagram>',
      '</mxfile>'
    ].join('\n');
  }

  /** Şablondan tag filtreleme — mevcut .drawio dosyasını seçili kodlara göre sadeleştirir */
  function filterTemplateDrawio(xml, selectedKodlar) {
    var selected = new Set(selectedKodlar.map(function (k) { return String(k).trim().toUpperCase(); }));
    var tagRe = /(?:^|[\s>])([A-Z]{1,4}\d{1,3}[A-Z]?)(?:[\s<]|$)/g;

    return xml.replace(/value="([^"]*)"/g, function (match, val) {
      var decoded = val
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      var plain = decoded.replace(/<[^>]+>/g, '').trim().toUpperCase();
      if (!plain || plain === 'WASHING BASKET' || plain === 'ZS' || plain === 'LSL') return match;
      if (/^[A-Z]{1,4}\d/.test(plain) && !selected.has(plain)) {
        return 'value=""';
      }
      return match;
    });
  }

  return {
    generateDrawio: generateDrawio,
    filterTemplateDrawio: filterTemplateDrawio,
    groupBySeri: groupBySeri,
    ZONE_LAYOUT: ZONE_LAYOUT
  };
});
