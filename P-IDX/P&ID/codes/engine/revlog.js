/* Revizyon tablosu: satırlar "Rev." numarasından çıkar.
   Rev. 00 ilk yayındır. Rev. N girilince 00'dan N'ye kadar her revizyonun bir satırı olur.
   Kapakta ve antette yazan tarih ile hazırlayan, geçerli (son) satırın tarihi ve hazırlayanıdır:
   ikisi aynı alandan (project.tarih / project.hazirlayan) okunur, bu yüzden birbirinden ayrışamaz.
   proje.json: rev "01", tarih, hazirlayan, revizyonlar [{ rev, tarih, aciklama, hazirlayan }].
   Eski projeler açılınca değiştirilmez; satırlar revizyon bilgisi ilk düzenlendiğinde yazılır.
   P&IDX ve PNOMATIKX'te aynı dosyadır. */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.PidRevLog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Antette gösterilen satır sayısı: en yeni dört revizyon */
  const SHOWN = 4;
  const FIRST_ISSUE = { tr: 'İlk yayın', en: 'First issue', de: 'Erstausgabe' };
  const FIELDS = ['tarih', 'aciklama', 'hazirlayan'];

  const text = (v) => (v == null ? '' : String(v));

  /** "0", "00", "1", "Rev. 01", "R1" → sayı (0-99); sayı değilse null */
  function parse(value) {
    const m = text(value).trim().match(/^(?:rev\.?|r)?\s*(\d{1,2})$/i);
    return m ? parseInt(m[1], 10) : null;
  }

  const label = (n) => String(n).padStart(2, '0');

  /** Bugün, yerel saatle yyyy-mm-dd (toISOString gece yarısından sonra bir önceki günü verir) */
  function today(now) {
    const d = now || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Geçerli revizyon numarası; boşsa ya da sayı değilse null */
  const current = (project) => parse(project && project.rev);

  /** Kapakta ve antette yazan Rev.: sayıysa iki haneli, değilse girildiği gibi */
  function revText(project) {
    const n = current(project);
    return n === null ? text(project && project.rev) : label(n);
  }

  /** Panelde satır adı */
  const title = (n) => (n === 0 ? 'İlk yayın' : `${n}. revizyon`);

  /** Kayıtlı satırlar numarasına göre; aynı numara birden çok kez varsa sonuncusu geçerlidir */
  function entries(project) {
    const map = new Map();
    const list = project && Array.isArray(project.revizyonlar) ? project.revizyonlar : [];
    for (const e of list) {
      const n = e && typeof e === 'object' ? parse(e.rev) : null;
      if (n !== null) map.set(n, e);
    }
    return map;
  }

  /**
   * Tablo satırları, Rev. 00'dan geçerli revizyona kadar.
   * Geçerli satırın tarihi ve hazırlayanı antettekidir; kaydı olmayan eski satırın tarihi boştur.
   */
  function rows(project) {
    const cur = current(project);
    if (cur === null) return [];
    const map = entries(project);
    const out = [];
    for (let n = 0; n <= cur; n += 1) {
      const e = map.get(n);
      const isCurrent = n === cur;
      out.push({
        n,
        rev: label(n),
        tarih: isCurrent ? text(project.tarih) : text(e && e.tarih),
        aciklama: text(e && e.aciklama).trim(),
        hazirlayan: isCurrent || !e ? text(project.hazirlayan) : text(e.hazirlayan),
        current: isCurrent
      });
    }
    return out;
  }

  /** Antetteki revizyon tablosunun satırları (en yeni dört) */
  const shown = (project) => rows(project).slice(-SHOWN);

  /** Belgede yazılacak açıklama: Rev. 00 boş bırakılmışsa belge dilinde "İlk yayın" */
  function description(row, lang) {
    if (row.aciklama) return row.aciklama;
    return row.n === 0 ? (FIRST_ISSUE[lang] || FIRST_ISSUE.tr) : '';
  }

  /**
   * Satırları 00'dan geçerli revizyona kadar kayda yazar; geçerli satır antetle aynı olur.
   * Sayıya çevrilemeyen eski kayıtlar ve geçerli revizyondan büyük olanlar olduğu gibi kalır.
   */
  function materialize(project) {
    const cur = current(project);
    if (cur === null) return;
    const map = entries(project);
    const list = rows(project).map((r) => Object.assign({}, map.get(r.n), {
      rev: r.rev, tarih: r.tarih, aciklama: r.aciklama, hazirlayan: r.hazirlayan
    }));
    const rest = (Array.isArray(project.revizyonlar) ? project.revizyonlar : []).filter((e) => {
      const n = e && typeof e === 'object' ? parse(e.rev) : null;
      return n === null || n > cur;
    });
    project.revizyonlar = list.concat(rest);
  }

  /** Antetteki Tarih ya da Hazırlayan değişince geçerli satırın kaydını eşitler (kayıt yoksa oluşturmaz) */
  function mirror(project) {
    const e = entries(project).get(current(project));
    if (!e) return;
    e.tarih = text(project.tarih);
    e.hazirlayan = text(project.hazirlayan);
  }

  /** Bir satırın tarihini, açıklamasını ya da hazırlayanını yazar; geçerli satırda antet de değişir */
  function setField(project, n, key, value) {
    const cur = current(project);
    if (cur === null || !FIELDS.includes(key) || !(n >= 0 && n <= cur)) return false;
    materialize(project);
    entries(project).get(n)[key] = text(value);
    if (n === cur && key !== 'aciklama') project[key] = text(value);
    return true;
  }

  /**
   * Rev. değişikliğini hesaplar, uygulamaz.
   * removed: Rev. düşürülünce silinecek satırlar; ask: kullanıcıya sorulmalı (kayıtlı bilgi siliniyor).
   */
  function plan(project, value) {
    const to = parse(value);
    if (to === null) {
      return { ok: false, error: 'Rev. 00 ile 99 arasında bir sayı olmalı: 00 ilk yayın, 01 birinci revizyon, 02 ikinci revizyon…' };
    }
    const from = current(project);
    const removed = from !== null && to < from ? rows(project).filter((r) => r.n > to) : [];
    const map = entries(project);
    return {
      ok: true,
      from,
      to,
      rev: label(to),
      removed: removed.map((r) => r.rev),
      ask: removed.some((r) => r.aciklama || map.has(r.n)),
      changed: to !== from || text(project.rev) !== label(to)
    };
  }

  /**
   * plan() sonucunu uygular.
   * Yükselince: çıkan revizyon tarihiyle kayda geçer, yeni revizyonun tarihi "day" olur (kapak tarihi de).
   * Atlanan ara revizyonların tarihi boş kalır. Düşünce: üstteki satırlar silinir, kapak tarihi
   * dönülen revizyonun tarihi olur. Sayı olmayan Rev. düzeltilince antetteki tarih korunur.
   */
  function apply(project, change, day) {
    const { from, to } = change;
    if (from === null || to === from) {
      project.rev = label(to);
      materialize(project);
      return;
    }
    if (to > from) {
      materialize(project);
      project.rev = label(to);
      project.tarih = day || today();
      materialize(project);
      return;
    }
    const target = entries(project).get(to);
    project.revizyonlar = (Array.isArray(project.revizyonlar) ? project.revizyonlar : []).filter((e) => {
      const n = e && typeof e === 'object' ? parse(e.rev) : null;
      return n === null || n <= to || n > from;
    });
    project.rev = label(to);
    if (target && text(target.tarih)) project.tarih = target.tarih;
    if (target && text(target.hazirlayan)) project.hazirlayan = target.hazirlayan;
    materialize(project);
  }

  /** Kontrol sekmesi: eksik tarih ve açıklama, sırası bozuk tarih, sayı olmayan Rev. */
  function problems(project) {
    if (!project) return [];
    const out = [];
    const raw = text(project.rev).trim();
    if (current(project) === null) {
      out.push({ level: 'warn', msg: raw
        ? `Rev. "${raw}" sayı değil; 00 ilk yayın, 01 birinci revizyon… biçiminde girin`
        : 'Rev. boş; ilk yayın için 00 girin' });
      return out;
    }
    let prev = null;
    for (const r of rows(project)) {
      if (!r.tarih) out.push({ level: 'warn', msg: `Rev. ${r.rev}${r.n === 0 ? ' (ilk yayın)' : ''} tarihi girilmemiş` });
      else if (prev && r.tarih < prev.tarih) out.push({ level: 'warn', msg: `Rev. ${r.rev} tarihi Rev. ${prev.rev} tarihinden önce` });
      if (r.n > 0 && !r.aciklama) out.push({ level: 'warn', msg: `Rev. ${r.rev} açıklaması boş` });
      if (r.tarih) prev = r;
    }
    return out;
  }

  return {
    SHOWN, FIRST_ISSUE, parse, label, today, current, revText, title,
    rows, shown, description, materialize, mirror, setField, plan, apply, problems
  };
});
