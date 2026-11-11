#!/usr/bin/env node
/* Giriş ekranını (kabuk, pwa/ klasörü) herkese açık site deposuna gönderir; GitHub Pages oradan yayınlar.
   Kabukta program kodu ve veri yoktur; değişmedikçe yeniden gönderilmesi gerekmez.
   Commit'ler GitHub'ın gizli e-posta adresiyle atılır: açık depoda kişisel e-posta görünmez.
   Kullanım: npm run kabuk-yayinla [-- --depo kullanici/depo] [-- --deneme] */

const yayin = require('./yayin.js');

const DEFAULT_REPO = 'TheVanerr/ppx';
const BRANCH = 'main';
const DIR = 'pwa/';

function main() {
  const { flags, values } = yayin.args(process.argv.slice(2));
  const repo = values.depo || DEFAULT_REPO;
  const owner = repo.split('/')[0];
  const dirty = yayin.dirtyFiles(DIR);
  if (dirty.length && !flags.has('yine-de')) {
    console.error(`pwa/ içinde commit edilmemiş değişiklik var:\n${dirty.join('\n')}\nÖnce commit edin (ya da --yine-de).`);
    process.exit(1);
  }
  const entries = yayin.headEntries().filter((e) => e.type === 'blob' && e.path.startsWith(DIR));
  if (!entries.some((e) => e.path === `${DIR}index.html`)) throw new Error('pwa/index.html son commit\'te yok');
  const tree = yayin.buildTree(entries, (p) => p.slice(DIR.length));
  const head = yayin.git(['log', '-1', '--format=%h', '--', DIR]);
  const res = yayin.publishTree({
    url: yayin.repoUrl(repo),
    branch: BRANCH,
    tree,
    message: `P&PX giriş ekranı (${head})`,
    identity: { name: owner, email: `${owner}@users.noreply.github.com` },
    dryRun: flags.has('deneme')
  });
  if (!res.changed) console.log(`Giriş ekranı zaten yayında (${repo}).`);
  else if (res.dryRun) console.log(`Deneme: ${entries.length} dosya ${repo} deposuna gönderilecekti.`);
  else console.log(`Gönderildi: ${entries.length} dosya → ${repo} (${res.sha.slice(0, 7)}). GitHub Pages birkaç dakikada yayınlar.`);
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { DEFAULT_REPO, DIR };
