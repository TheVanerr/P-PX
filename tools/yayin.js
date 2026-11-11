/* Yayınlamanın ortak parçaları: son commit'ten seçilen dosyalarla bir commit kurulur ve başka bir depoya gönderilir.
   Çalışma klasörüne dokunulmaz; geçici bir Git dizini kullanılır. Gönderim bu bilgisayardaki Git oturumuyla yapılır. */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function git(args, options) {
  return execFileSync('git', args, Object.assign({ cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, options)).trim();
}

/** Son commit'teki dosyalar: { mode, type, sha, path } */
function headEntries(treeish) {
  const out = execFileSync('git', ['ls-tree', '-r', '-z', '--long', treeish || 'HEAD'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  return out.split('\0').filter(Boolean).map((line) => {
    const tab = line.indexOf('\t');
    const [mode, type, sha, size] = line.slice(0, tab).split(/\s+/);
    return { mode, type, sha, size: Number(size) || 0, path: line.slice(tab + 1) };
  });
}

/** Seçilen dosyalardan ağaç kurulur; yollar kök göre yeniden yazılabilir (rename) */
function buildTree(entries, rename) {
  const index = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ppx-yayin-')), 'index');
  const env = Object.assign({}, process.env, { GIT_INDEX_FILE: index });
  try {
    const input = entries.map((e) => `${e.mode} ${e.sha}\t${rename ? rename(e.path) : e.path}\0`).join('');
    execFileSync('git', ['update-index', '-z', '--index-info'], { cwd: ROOT, env, input });
    return git(['write-tree'], { env });
  } finally {
    fs.rmSync(path.dirname(index), { recursive: true, force: true });
  }
}

/** Uzak depodaki dal başı; dal yoksa null. Depoya erişilemezse anlaşılır hata. */
function remoteHead(url, branch) {
  let out;
  try {
    out = git(['ls-remote', url, `refs/heads/${branch}`]);
  } catch (e) {
    throw new Error(`${url} deposuna erişilemedi. Depo var mı, bu bilgisayardaki Git oturumunun erişimi var mı?\n${e.message}`);
  }
  return out ? out.split(/\s+/)[0] : null;
}

/** Deponun ana dalı (HEAD); boş depoda null */
function remoteDefaultBranch(url) {
  const out = git(['ls-remote', '--symref', url, 'HEAD']);
  const m = out.match(/^ref: refs\/heads\/(\S+)\s+HEAD/m);
  return m ? m[1] : null;
}

/** Ağaç değişmediyse hiçbir şey gönderilmez. Önceki yayın üstüne commit atılır, geçmiş korunur. */
function publishTree(options) {
  const { url, branch, tree, message, identity, dryRun } = options;
  const previous = remoteHead(url, branch);
  let parent = null;
  if (previous) {
    git(['fetch', '--quiet', '--no-tags', url, `refs/heads/${branch}`]);
    parent = git(['rev-parse', 'FETCH_HEAD']);
    if (git(['rev-parse', `${parent}^{tree}`]) === tree) return { changed: false, sha: parent };
  }
  if (dryRun) return { changed: true, dryRun: true };
  const env = Object.assign({}, process.env, identity ? {
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email
  } : {});
  const sha = git(['commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', message], { env });
  git(['push', '--quiet', url, `${sha}:refs/heads/${branch}`], { stdio: ['ignore', 'pipe', 'inherit'] });
  return { changed: true, sha };
}

/** Commit edilmemiş değişiklik yayınlanmaz; uyarmak için */
function dirtyFiles(prefix) {
  const out = git(['status', '--porcelain', '--untracked-files=no', ...(prefix ? ['--', prefix] : [])]);
  return out ? out.split('\n') : [];
}

function args(argv) {
  const out = { flags: new Set(), values: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [key, value] = a.slice(2).split('=');
    if (value !== undefined) out.values[key] = value;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      out.values[key] = argv[i + 1];
      i += 1;
    } else out.flags.add(key);
  }
  return out;
}

const repoUrl = (repo) => `https://github.com/${repo}.git`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

module.exports = { ROOT, git, headEntries, buildTree, remoteHead, remoteDefaultBranch, publishTree, dirtyFiles, args, repoUrl, mb };
