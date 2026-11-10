/* Çizim kontrolü: kod, bağlantı ve antet hatalarını listeler. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./symbols.js'), require('./model.js'), require('./revlog.js'));
  } else {
    root.PidChecks = factory(root.PidSymbols, root.PidModel, root.PidRevLog);
  }
})(typeof self !== 'undefined' ? self : this, function (Sym, Model, RevLog) {
  'use strict';

  /**
   * @param drawing çizim
   * @param catalog Map: kod -> { name, ambiguous: [..] }
   * @param machineCodes makine kaydındaki kodlar (varsa)
   * @param project proje bilgileri
   * @returns [{level:'error'|'warn'|'info', code, msg, sheetId, itemId}]
   */
  function run(drawing, catalog, machineCodes, project) {
    const out = [];
    const add = (level, code, msg, sheetId, itemId) => out.push({ level, code, msg, sheetId: sheetId || null, itemId: itemId || null });
    const tags = Model.usedTags(drawing);

    for (const [tag, uses] of tags) {
      if (uses.length > 1) {
        for (const u of uses) add('error', 'tag-duplicate', `${tag} kodu ${uses.length} kez kullanılmış`, u.sheetId, u.itemId);
      }
      const entry = catalog && catalog.get(tag);
      if (catalog && !entry) {
        add('warn', 'tag-unknown', `${tag} kod listesinde yok`, uses[0].sheetId, uses[0].itemId);
      } else if (entry) {
        if (entry.ambiguous && entry.ambiguous.length > 1) {
          add('error', 'tag-ambiguous', `${tag} kod listesinde farklı anlamlarla geçiyor: ${entry.ambiguous.join(' / ')}`, uses[0].sheetId, uses[0].itemId);
        }
        if (/\bxxx+\b/i.test(entry.name || '')) {
          add('warn', 'tag-placeholder', `${tag} açıklaması henüz tanımsız: "${entry.name}"`, uses[0].sheetId, uses[0].itemId);
        }
      }
    }

    // Çevirisi olmayan kodlar EN/DE belgede Türkçe çıkar; belge dili oysa uyarı, değilse bilgi
    for (const lang of ['en', 'de']) {
      const missing = [...tags].filter(([tag]) => {
        const entry = catalog && catalog.get(tag);
        return entry && Array.isArray(entry.untranslated) && entry.untranslated.includes(lang);
      });
      if (!missing.length) continue;
      const code = lang.toUpperCase();
      const level = project && project.dil === lang ? 'warn' : 'info';
      const list = missing.map(([tag]) => tag).join(', ');
      add(level, 'translation-missing',
        `${code} çevirisi yok, ${code} belgede Türkçe çıkar: ${list} (P&ID/data/kod-${lang}.csv dosyasına ekleyin)`,
        missing[0][1][0].sheetId, missing[0][1][0].itemId);
    }

    if (machineCodes && machineCodes.length) {
      for (const code of machineCodes) {
        if (!tags.has(String(code).toUpperCase())) {
          add('warn', 'machine-missing', `${code} makine kaydında var, çizimde yok`);
        }
      }
      const known = new Set(machineCodes.map((c) => String(c).toUpperCase()));
      for (const [tag, uses] of tags) {
        if (!known.has(tag)) add('info', 'machine-extra', `${tag} çizimde var, makine kaydında yok`, uses[0].sheetId, uses[0].itemId);
      }
    }

    for (const sheet of drawing.sheets) {
      for (const it of sheet.items) {
        if (Model.isLine(it)) {
          if (!it.from.node || !it.to.node) {
            add('warn', 'line-free', `${(Sym.LINE_KINDS[it.kind] || {}).name ? Sym.LINE_KINDS[it.kind].name.tr : 'Hat'} ucu boşta`, sheet.id, it.id);
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
        const needsTag = def.tag !== 'none' && !def.container && it.symbol !== 'i.interlock';
        if (needsTag && !String(it.tag || '').trim()) {
          add('info', 'tag-empty', `${def.name.tr}: kod girilmemiş`, sheet.id, it.id);
        }
        if (def.inline && def.ports.length >= 2) {
          const lines = Model.attachedLines(sheet, it.id);
          if (lines.length === 0) {
            add('warn', 'node-unconnected', `${it.tag || def.name.tr} hiçbir hatta bağlı değil`, sheet.id, it.id);
          }
        }
      }
    }

    if (project) {
      if (!project.seriNo) add('warn', 'meta-missing', 'Antette proje numarası boş');
      if (!project.musteri) add('warn', 'meta-missing', 'Antette müşteri boş');
      if (!project.model) add('warn', 'meta-missing', 'Antette model boş');
      if (!project.kontrol) add('info', 'meta-missing', 'Antette "Kontrol" boş');
      if (!project.onay) add('info', 'meta-missing', 'Antette "Onay" boş');
      for (const p of RevLog.problems(project)) add(p.level, 'revision', p.msg);
    }

    const rank = { error: 0, warn: 1, info: 2 };
    return out.sort((a, b) => rank[a.level] - rank[b.level]);
  }

  return { run };
});
