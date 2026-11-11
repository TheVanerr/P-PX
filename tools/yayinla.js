#!/usr/bin/env node
/* Programı web uygulamasına yayınlar: son commit'teki program dosyaları özel veri deposunun "program" dalına gider.
   Uygulamayı açan herkes bir sonraki açılışta bu sürümü alır (yalnız değişen dosyalar iner).
   Müşteri verisi (projeler, makine kayıtları), testler, araçlar, belgeler ve kabuk (pwa/) gitmez.
   Kullanım: npm run yayinla [-- --depo kullanici/depo] [-- --deneme] */

const yayin = require('./yayin.js');

const DEFAULT_REPO = 'TheVanerr/ppx-veri';
const BRANCH = 'program';

const EXCLUDE = [
  /^pwa\//,
  /^_yedek\//,
  /^\.github\//,
  /(^|\/)test\//,
  /(^|\/)tools\//,
  /(^|\/)node_modules\//,
  /^P-IDX\/P&ID\/projects\//,
  /^P-IDX\/ML\//,
  /^PNOMATIKX\/PNOMATIK\/projects\//,
  /\.md$/i,
  /(^|\/)package(-lock)?\.json$/,
  /(^|\/)\.[^/]*ignore$/,
  /(^|\/)\.gitattributes$/
];

const published = (path) => !EXCLUDE.some((rule) => rule.test(path));

function main() {
  const { flags, values } = yayin.args(process.argv.slice(2));
  const repo = values.depo || DEFAULT_REPO;
  const url = yayin.repoUrl(repo);
  const dirty = yayin.dirtyFiles();
  if (dirty.length && !flags.has('yine-de')) {
    console.error(`Commit edilmemiş değişiklik var; yayınlanan sürüm son commit olur:\n${dirty.join('\n')}\nÖnce commit edin (ya da --yine-de).`);
    process.exit(1);
  }
  const entries = yayin.headEntries().filter((e) => e.type === 'blob' && published(e.path));
  if (!entries.some((e) => e.path === 'index.html')) throw new Error('index.html yayın listesinde yok');

  const defaultBranch = yayin.remoteDefaultBranch(url);
  if (!defaultBranch) throw new Error(`${repo} boş. Önce programı bir kez açıp bu depoya bağlanın; ilk veri commit'i ana dalı oluşturur.`);
  if (defaultBranch === BRANCH) throw new Error(`${repo} deposunun ana dalı "${BRANCH}"; veri ana dalda durmalı.`);

  const tree = yayin.buildTree(entries);
  const head = yayin.git(['log', '-1', '--format=%h %s']);
  const size = entries.reduce((n, e) => n + e.size, 0);
  const res = yayin.publishTree({ url, branch: BRANCH, tree, message: `Program: ${head}`, dryRun: flags.has('deneme') });
  if (!res.changed) {
    console.log(`Program zaten yayında (${repo}, ${BRANCH} dalı).`);
    return;
  }
  const what = `${entries.length} dosya, ${yayin.mb(size)}`;
  if (res.dryRun) {
    console.log(`Deneme: ${what} yayınlanacaktı (${repo}, ${BRANCH} dalı).`);
    return;
  }
  console.log(`Yayınlandı: ${what} → ${repo}, ${BRANCH} dalı (${res.sha.slice(0, 7)}).\nUygulamayı açanlar bir sonraki açılışta yeni sürümü alır.`);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { published, EXCLUDE, BRANCH, DEFAULT_REPO };
