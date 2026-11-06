/* Saha etiket listesi: çizimdeki kodlu bileşenler, kod ve açıklama yan yana.
   Sahada telefonla etiketlerken bakmak için WhatsApp'a yapıştırılacak metin ve telefona gönderilecek resim üretir.
   Sıra ve adlar Etiket Excel ile aynıdır (belge dili, şablon sırası). Liste kısmı DOM'a bağlı değildir. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./model.js'), require('./symbols.js'), require('./xlsx.js'));
  } else {
    root.PidFieldList = factory(root.PidModel, root.PidSymbols, root.PidXlsx);
  }
})(typeof self !== 'undefined' ? self : this, function (Model, Sym, Xlsx) {
  'use strict';

  const TEXT = {
    tr: { head: ['KOD', 'AÇIKLAMA'], count: (n) => `Etiket listesi · ${n} kod` },
    en: { head: ['CODE', 'DESCRIPTION'], count: (n) => `Label list · ${n} codes` },
    de: { head: ['CODE', 'BESCHREIBUNG'], count: (n) => `Etikettenliste · ${n} Codes` }
  };
  const textOf = (lang) => TEXT[lang] || TEXT.tr;
  const seriesOf = (code) => (String(code).match(/^[A-Z]+/) || [''])[0];

  /**
   * Çizimdeki kodlar: [{code, name, sheetId, itemId}], Etiket Excel sırasında.
   * Ad kod listesinden (belge dilinde) gelir; listede olmayan kodda sembolün adı yazılır.
   */
  function rows(drawing, catalogMap, lang) {
    const language = lang || 'tr';
    const out = [];
    for (const [code, uses] of Model.usedTags(drawing)) {
      const entry = catalogMap && catalogMap.get(code);
      let name = entry ? (language === 'tr' ? entry.name : entry[language] || entry.name) : '';
      if (!name) {
        const sheet = drawing.sheets.find((s) => s.id === uses[0].sheetId);
        const item = sheet && sheet.items.find((it) => it.id === uses[0].itemId);
        const def = item && Sym.get(item.symbol);
        name = def ? def.name[language] || def.name.tr : '';
      }
      // Listede "1.  Proses Tankı" gibi çift boşluklar var; telefonda kayık görünmesin
      out.push({ code, name: String(name).replace(/\s+/g, ' ').trim(), sheetId: uses[0].sheetId, itemId: uses[0].itemId });
    }
    return Xlsx.orderRows(out);
  }

  /** Antetteki gibi: "ULT M200 3B - DÜNYA - 0626051" */
  function title(meta) {
    const m = meta || {};
    const lang = m.dil || 'tr';
    const upper = (v) => String(v || '').toLocaleUpperCase(lang === 'tr' ? 'tr' : lang);
    return [m.model, upper(m.musteri), m.seriNo].filter(Boolean).join(' - ');
  }

  /** WhatsApp metni: kalın kod, yanında açıklama; seriler arasında boş satır */
  function whatsappText(list, heading, lang) {
    const clean = (v) => String(v || '').replace(/[*_~`]/g, '').trim();
    const lines = [];
    if (heading) lines.push(`*${clean(heading)}*`);
    lines.push(textOf(lang).count(list.length), '');
    let last = null;
    for (const row of list) {
      const series = seriesOf(row.code);
      if (last !== null && series !== last) lines.push('');
      last = series;
      lines.push(`*${clean(row.code)}*  ${clean(row.name)}`);
    }
    return lines.join('\n').trim();
  }

  /* ─── Resim (yalnız tarayıcı) ─────────────────────────── */

  const IMG = {
    width: 1080,
    pad: 40,
    font: "'Segoe UI', Arial, sans-serif",
    size: 30,
    lineGap: 8,
    rowPad: 14,
    red: '#c8102e',
    zebra: '#f3f4f6',
    rule: '#d5d8de',
    text: '#111111',
    muted: '#5b6270'
  };

  function wrap(ctx, text, width) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  /** Telefon ekranına göre (1080 px genişlik) kod ve açıklama tablosu; canvas döner */
  function drawImage(list, heading, lang) {
    const t = textOf(lang);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const { width, pad, size, lineGap, rowPad } = IMG;
    const lineH = size + lineGap;
    const bold = (s) => `700 ${s}px ${IMG.font}`;
    const normal = (s) => `400 ${s}px ${IMG.font}`;

    ctx.font = bold(size);
    const codeW = Math.max(ctx.measureText(t.head[0]).width, ...list.map((r) => ctx.measureText(r.code).width)) + 36;
    const nameX = pad + codeW;
    const nameW = width - pad - nameX;
    ctx.font = normal(size);
    const laid = list.map((row) => ({ row, lines: wrap(ctx, row.name, nameW - 16) }));

    ctx.font = bold(40);
    const titleLines = heading ? wrap(ctx, heading, width - pad * 2) : [];
    const headTop = pad + titleLines.length * 50 + 44 + 18;
    const headH = 56;
    let total = headTop + headH;
    for (const r of laid) total += r.lines.length * lineH - lineGap + rowPad * 2;
    total += pad;

    canvas.width = width;
    canvas.height = Math.ceil(total);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, canvas.height);
    ctx.textBaseline = 'top';

    let y = pad;
    ctx.fillStyle = IMG.text;
    ctx.font = bold(40);
    for (const line of titleLines) {
      ctx.fillText(line, pad, y);
      y += 50;
    }
    ctx.fillStyle = IMG.muted;
    ctx.font = normal(28);
    ctx.fillText(t.count(list.length), pad, y + 4);

    y = headTop;
    ctx.fillStyle = IMG.red;
    ctx.fillRect(pad, y, width - pad * 2, headH);
    ctx.fillStyle = '#ffffff';
    ctx.font = bold(26);
    ctx.fillText(t.head[0], pad + 16, y + 15);
    ctx.fillText(t.head[1], nameX + 16, y + 15);
    y += headH;

    let last = null;
    laid.forEach(({ row, lines }, i) => {
      const h = lines.length * lineH - lineGap + rowPad * 2;
      if (i % 2) {
        ctx.fillStyle = IMG.zebra;
        ctx.fillRect(pad, y, width - pad * 2, h);
      }
      const series = seriesOf(row.code);
      ctx.fillStyle = last !== null && series !== last ? IMG.text : IMG.rule;
      ctx.fillRect(pad, y, width - pad * 2, last !== null && series !== last ? 2 : 1);
      last = series;
      ctx.fillStyle = IMG.text;
      ctx.font = bold(size);
      ctx.fillText(row.code, pad + 16, y + rowPad);
      ctx.font = normal(size);
      lines.forEach((line, k) => ctx.fillText(line, nameX + 16, y + rowPad + k * lineH));
      y += h;
    });
    ctx.fillStyle = IMG.rule;
    ctx.fillRect(pad, y, width - pad * 2, 1);
    return canvas;
  }

  function imageBlob(list, heading, lang) {
    const canvas = drawImage(list, heading, lang);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Resim oluşturulamadı'))), 'image/png'));
  }

  return { rows, title, whatsappText, drawImage, imageBlob, TEXT };
});
