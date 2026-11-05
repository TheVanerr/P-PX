/* P&ID sembol tanımları — Draw.io mxCell üretimi */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CadSymbols = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SERI_META = {
    PE: { label: 'Pompa', zone: 'left', optional: false },
    FE: { label: 'Fan / Blower', zone: 'top', optional: false },
    GE: { label: 'Redüktör / Tahrik', zone: 'bottom', optional: false },
    VE: { label: 'Vibrasyon', zone: 'right', optional: false },
    R: { label: 'Rezistans', zone: 'top-right', optional: false },
    LS: { label: 'Seviye Sensörü', zone: 'bottom-left', optional: false },
    TC: { label: 'Sıcaklık Sensörü', zone: 'right', optional: false },
    SW: { label: 'Limit Switch', zone: 'left-bottom', optional: false },
    SS: { label: 'Güvenlik Sensörü', zone: 'left-bottom', optional: true },
    PRS: { label: 'Basınç Sensörü', zone: 'right', optional: false },
    PS: { label: 'Basınç Switch', zone: 'right', optional: false },
    PPS: { label: 'Pompa Koruma', zone: 'left', optional: false },
    V: { label: 'Vana', zone: 'inner', optional: false },
    DR: { label: 'Kapı', zone: 'right-bottom', optional: true },
    FLT: { label: 'Filtre', zone: 'right', optional: true },
    HC: { label: 'Isıtma Hücresi', zone: 'top-left', optional: false },
    TN: { label: 'Tank', zone: 'bottom-right', optional: false },
    GE06: { label: 'Yağ Sıyırıcı', zone: 'bottom', optional: true }
  };

  function extractSeri(kod) {
    var k = String(kod || '').trim().toUpperCase();
    if (/^PPS/.test(k)) return 'PPS';
    if (/^PRS/.test(k)) return 'PRS';
    if (/^FLT/.test(k)) return 'FLT';
    if (/^PE|^FE|^GE|^VE|^LS|^TC|^SW|^SS|^PS|^DR|^HC|^TN/.test(k)) {
      return k.replace(/[0-9A-Z].*$/, '').replace(/(\d.*)$/, '') || k.slice(0, 2);
    }
    if (/^R\d/.test(k)) return 'R';
    if (/^V\d/.test(k)) return 'V';
    return k.replace(/[0-9].*$/, '') || 'OTHER';
  }

  function isOptional(kod) {
    var seri = extractSeri(kod);
    var meta = SERI_META[seri];
    if (meta) return !!meta.optional;
    return /^SS|^DR|^FLT|^GE06|^SW11/.test(String(kod).toUpperCase());
  }

  function escXml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function tagValue(kod, optional) {
    var color = optional ? ' color: rgb(255, 0, 0);' : '';
    return '&lt;font style=&quot;font-size: 20px;' + color + '&quot;&gt;' + escXml(kod) + '&lt;/font&gt;';
  }

  function makeId(prefix, n) {
    return 'cad-' + prefix + '-' + n;
  }

  function textCell(id, parent, kod, x, y, w, h, optional) {
    w = w || 70;
    h = h || 30;
    var fontColor = optional ? 'fontColor=#FF0000;' : '';
    return (
      '        <mxCell id="' + id + '" parent="' + parent + '" style="text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=center;verticalAlign=middle;rounded=0;' + fontColor + '" value="' + tagValue(kod, optional) + '" vertex="1">\n' +
      '          <mxGeometry height="' + h + '" width="' + w + '" x="' + x + '" y="' + y + '" as="geometry" />\n' +
      '        </mxCell>'
    );
  }

  function edgeCell(id, parent, source, target, dashed, red) {
    var stroke = red ? 'strokeColor=#FF0000;' : '';
    var dash = dashed ? 'dashed=1;' : '';
    return (
      '        <mxCell id="' + id + '" edge="1" parent="' + parent + '" source="' + source + '" target="' + target + '" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;' + dash + stroke + '">\n' +
      '          <mxGeometry relative="1" as="geometry" />\n' +
      '        </mxCell>'
    );
  }

  /** Pompa sembolü (PE) */
  function pumpSymbol(groupId, parent, x, y, kod, n, optional) {
    var gid = groupId;
    var symId = makeId('pe-sym', n);
    var lblId = makeId('pe-lbl', n);
    var circleId = makeId('pe-c', n);
    var triId = makeId('pe-t', n);
    var cells = [];
    cells.push('        <mxCell id="' + gid + '" connectable="0" parent="' + parent + '" style="group" value="" vertex="1">');
    cells.push('          <mxGeometry height="120" width="90" x="' + x + '" y="' + y + '" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push('        <mxCell id="' + symId + '" connectable="0" parent="' + gid + '" style="group" value="" vertex="1">');
    cells.push('          <mxGeometry height="90" width="90" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push('        <mxCell id="' + circleId + '" parent="' + symId + '" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;" value="" vertex="1">');
    cells.push('          <mxGeometry height="90" width="90" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push('        <mxCell id="' + triId + '" parent="' + symId + '" style="triangle;whiteSpace=wrap;html=1;rotation=270;" value="" vertex="1">');
    cells.push('          <mxGeometry height="80.5" width="63" x="13.43" y="-8" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push(textCell(lblId, gid, kod, 15, 90, 60, 30, optional));
    return { cells: cells, anchorId: circleId, labelId: lblId, groupId: gid };
  }

  /** Fan sembolü (FE) */
  function fanSymbol(groupId, parent, x, y, kod, n, optional) {
    var symId = makeId('fe-sym', n);
    var lblId = makeId('fe-lbl', n);
    var stroke = optional ? 'strokeColor=#FF0000;fontColor=#FF0000;' : '';
    var cells = [];
    cells.push('        <mxCell id="' + symId + '" parent="' + parent + '" style="shape=mxgraph.pid.compressors_-_iso.blower,_fan;html=1;pointerEvents=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;dashed=0;' + stroke + '" value="" vertex="1">');
    cells.push('          <mxGeometry height="80" width="80" x="' + x + '" y="' + y + '" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push(textCell(lblId, parent, kod, x + 10, y - 30, 60, 30, optional));
    return { cells: cells, anchorId: symId, labelId: lblId, groupId: symId };
  }

  /** Redüktör / motor (GE) */
  function gearSymbol(groupId, parent, x, y, kod, n, optional) {
    var gid = groupId;
    var bodyId = makeId('ge-body', n);
    var lblId = makeId('ge-lbl', n);
    var cells = [];
    cells.push('        <mxCell id="' + gid + '" connectable="0" parent="' + parent + '" style="group;rotation=-90;" value="" vertex="1">');
    cells.push('          <mxGeometry height="110" width="120" x="' + x + '" y="' + y + '" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push('        <mxCell id="' + bodyId + '" parent="' + gid + '" style="rounded=0;whiteSpace=wrap;html=1;rotation=-90;" value="" vertex="1">');
    cells.push('          <mxGeometry height="60" width="120" x="15" y="25" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push(textCell(lblId, gid, kod, 45, 40, 60, 30, optional));
    return { cells: cells, anchorId: bodyId, labelId: lblId, groupId: gid };
  }

  /** Rezistans (R) */
  function heaterSymbol(groupId, parent, x, y, kod, n, optional) {
    var symId = makeId('r-sym', n);
    var lblId = makeId('r-lbl', n);
    var stroke = optional ? 'strokeColor=#FF0000;' : '';
    var cells = [];
    cells.push('        <mxCell id="' + symId + '" parent="' + parent + '" style="shape=mxgraph.pid.heat_exchangers.heat_exchanger_(coil_tubes);html=1;pointerEvents=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;dashed=0;' + stroke + '" value="" vertex="1">');
    cells.push('          <mxGeometry height="30" width="100" x="' + x + '" y="' + y + '" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push(textCell(lblId, parent, kod, x + 20, y - 30, 60, 30, optional));
    return { cells: cells, anchorId: symId, labelId: lblId, groupId: symId };
  }

  /** Sensör / switch — basit etiket + nokta */
  function sensorSymbol(groupId, parent, x, y, kod, n, optional) {
    var symId = makeId('sns-sym', n);
    var lblId = makeId('sns-lbl', n);
    var stroke = optional ? 'strokeColor=#FF0000;' : '';
    var cells = [];
    cells.push('        <mxCell id="' + symId + '" parent="' + parent + '" style="ellipse;whiteSpace=wrap;html=1;aspect=fixed;' + stroke + '" value="" vertex="1">');
    cells.push('          <mxGeometry height="24" width="24" x="' + x + '" y="' + y + '" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push(textCell(lblId, parent, kod, x - 18, y + 28, 60, 30, optional));
    return { cells: cells, anchorId: symId, labelId: lblId, groupId: symId };
  }

  /** Vana (V) */
  function valveSymbol(groupId, parent, x, y, kod, n, optional) {
    var gid = groupId;
    var bodyId = makeId('v-body', n);
    var lblId = makeId('v-lbl', n);
    var stroke = optional ? 'strokeColor=#FF0000;' : '';
    var cells = [];
    cells.push('        <mxCell id="' + gid + '" connectable="0" parent="' + parent + '" style="group" value="" vertex="1">');
    cells.push('          <mxGeometry height="50" width="40" x="' + x + '" y="' + y + '" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push('        <mxCell id="' + bodyId + '" parent="' + gid + '" style="shape=mxgraph.pid.valves.valve;direction=south;html=1;' + stroke + '" value="" vertex="1">');
    cells.push('          <mxGeometry height="40" width="40" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push(textCell(lblId, gid, kod, -10, 42, 60, 30, optional));
    return { cells: cells, anchorId: bodyId, labelId: lblId, groupId: gid };
  }

  /** Genel kutu sembol */
  function genericSymbol(groupId, parent, x, y, kod, n, optional) {
    var symId = makeId('gen-sym', n);
    var lblId = makeId('gen-lbl', n);
    var stroke = optional ? 'strokeColor=#FF0000;dashed=1;' : '';
    var cells = [];
    cells.push('        <mxCell id="' + symId + '" parent="' + parent + '" style="rounded=1;whiteSpace=wrap;html=1;' + stroke + '" value="" vertex="1">');
    cells.push('          <mxGeometry height="40" width="60" x="' + x + '" y="' + y + '" as="geometry" />');
    cells.push('        </mxCell>');
    cells.push(textCell(lblId, parent, kod, x, y + 44, 60, 30, optional));
    return { cells: cells, anchorId: symId, labelId: lblId, groupId: symId };
  }

  function buildComponent(kod, parent, x, y, n) {
    var seri = extractSeri(kod);
    var optional = isOptional(kod);
    var gid = makeId('cmp', n);

    if (seri === 'PE' || seri === 'PPS') return pumpSymbol(gid, parent, x, y, kod, n, optional);
    if (seri === 'FE') return fanSymbol(gid, parent, x, y, kod, n, optional);
    if (seri === 'GE' || seri === 'VE') return gearSymbol(gid, parent, x, y, kod, n, optional);
    if (seri === 'R') return heaterSymbol(gid, parent, x, y, kod, n, optional);
    if (seri === 'LS' || seri === 'TC' || seri === 'SW' || seri === 'SS' || seri === 'PRS' || seri === 'PS') {
      return sensorSymbol(gid, parent, x, y, kod, n, optional);
    }
    if (seri === 'V') return valveSymbol(gid, parent, x, y, kod, n, optional);
    return genericSymbol(gid, parent, x, y, kod, n, optional);
  }

  return {
    SERI_META: SERI_META,
    extractSeri: extractSeri,
    isOptional: isOptional,
    escXml: escXml,
    tagValue: tagValue,
    buildComponent: buildComponent,
    edgeCell: edgeCell,
    textCell: textCell,
    makeId: makeId
  };
});
