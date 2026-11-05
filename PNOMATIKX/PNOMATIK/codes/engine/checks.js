/* Çizim kontrolü: pnömatik kod, P&ID kod bağlantısı, hat ve antet hatalarını listeler. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./symbols.js'), require('./model.js'), require('./pidlink.js'));
  } else {
    root.PidChecks = factory(root.PidSymbols, root.PidModel, root.PidLink);
  }
})(typeof self !== 'undefined' ? self : this, function (Sym, Model, Link) {
  'use strict';

  /**
   * @param drawing çizim
   * @param catalog Map: kod -> { name, ambiguous: [..] }
   * @param machineCodes makine kaydındaki kodlar (varsa)
   * @param project proje bilgileri
   * @returns [{level:'error'|'warn'|'info', code, msg, sheetId, itemId}]
   */
  /**
   * @param drawing çizim
   * @param catalog Map: P&ID kodu -> { name, ambiguous: [..] } (bağlı P&ID kod listesi)
   * @param machineCodes kullanılmıyor (P&ID ile uyum için)
   * @param project proje bilgileri
   * @returns [{level:'error'|'warn'|'info', code, msg, sheetId, itemId}]
   */
  function run(drawing, catalog, machineCodes, project) {
    const out = [];
    const add = (level, code, msg, sheetId, itemId) => out.push({ level, code, msg, sheetId: sheetId || null, itemId: itemId || null });

    /* Pnömatik kodlar: aynı kod iki kez kullanılamaz (bobin ve sensör kodları dahil) */
    const tags = Model.usedTags(drawing);
    for (const [tag, uses] of tags) {
      if (uses.length > 1) {
        const where = new Set(uses.map((u) => u.itemId));
        for (const u of uses) add('error', 'tag-duplicate', `${tag} kodu ${uses.length} kez kullanılmış`, u.sheetId, u.itemId);
        if (where.size === 1) continue;
      }
      if (!Link.parseIso(tag)) add('info', 'tag-format', `${tag}: ISO 1219-2 biçiminde değil (örnek: 1A1, 1V1, 1Y1, 1B1)`, uses[0].sheetId, uses[0].itemId);
    }

    /* P&ID kodları: farklı devrelerde kullanılamaz; kod listesinde olmalı */
    const pids = Model.usedPids(drawing);
    const circuitOfUse = (u) => {
      const sheet = drawing.sheets.find((s) => s.id === u.sheetId);
      const it = sheet && sheet.items.find((x) => x.id === u.itemId);
      if (!it) return null;
      const part = u.part === 'coil' ? (it.coils || [])[u.index] : u.part === 'sensor' ? (it.sensors || [])[u.index] : it;
      const p = Link.parseIso(part && part.tag) || Link.parseIso(it.tag);
      return p ? p.circuit : null;
    };
    for (const [pid, uses] of pids) {
      const circuits = new Set(uses.map(circuitOfUse).filter((c) => c !== null));
      if (circuits.size > 1) {
        for (const u of uses) add('error', 'pid-cross', `P&ID kodu ${pid} farklı devrelerde kullanılmış (${[...circuits].join(', ')})`, u.sheetId, u.itemId);
      }
      const entry = catalog && catalog.get(pid);
      if (entry && entry.ambiguous && entry.ambiguous.length > 1) {
        add('warn', 'pid-ambiguous', `${pid} P&ID kod listesinde farklı anlamlarla geçiyor: ${entry.ambiguous.join(' / ')}`, uses[0].sheetId, uses[0].itemId);
      }
      if (entry && /\bxxx+\b/i.test(entry.name || '')) {
        add('warn', 'pid-placeholder', `${pid} açıklaması henüz tanımsız: "${entry.name}"`, uses[0].sheetId, uses[0].itemId);
      }
    }

    for (const sheet of drawing.sheets) {
      for (const it of sheet.items) {
        if (Model.isLine(it)) {
          if (!it.from.node || !it.to.node) {
            const meta = Sym.LINE_KINDS[it.kind];
            add('warn', 'line-free', `${meta ? meta.name.tr : 'Hat'} ucu boşta`, sheet.id, it.id);
          }
          continue;
        }
        if (!Model.isSymbol(it)) continue;
        const def = Sym.get(it.symbol);
        if (!def) {
          add('error', 'symbol-unknown', `Bilinmeyen sembol: ${it.symbol}`, sheet.id, it.id);
          continue;
        }
        if (def.hidden) continue;
        const needsTag = def.tag !== 'none' && !def.container;
        if (needsTag && !String(it.tag || '').trim()) {
          add('info', 'tag-empty', `${def.name.tr}: kod girilmemiş`, sheet.id, it.id);
        }
        (it.coils || []).forEach((c, i) => {
          if (!String(c.tag || '').trim()) add('info', 'coil-tag-empty', `${it.tag || def.name.tr}: ${i === 0 ? '14' : '12'} bobininin kodu girilmemiş`, sheet.id, it.id);
        });
        (it.sensors || []).forEach((s) => {
          if (!String(s.tag || '').trim()) add('info', 'sensor-tag-empty', `${it.tag || def.name.tr}: sensör kodu girilmemiş`, sheet.id, it.id);
        });
        if (def.inline && def.ports.length >= 2) {
          const lines = Model.attachedLines(sheet, it.id);
          if (lines.length === 0) add('warn', 'node-unconnected', `${it.tag || def.name.tr} hiçbir hatta bağlı değil`, sheet.id, it.id);
        }
      }
    }

    if (project) {
      if (!project.seriNo) add('warn', 'meta-missing', 'Antette proje numarası boş');
      if (!project.musteri) add('warn', 'meta-missing', 'Antette müşteri boş');
      if (!project.model) add('warn', 'meta-missing', 'Antette model boş');
      if (!project.kontrol) add('info', 'meta-missing', 'Antette "Kontrol" boş');
      if (!project.onay) add('info', 'meta-missing', 'Antette "Onay" boş');
    }

    const rank = { error: 0, warn: 1, info: 2 };
    return out.sort((a, b) => rank[a.level] - rank[b.level]);
  }

  return { run };
});
