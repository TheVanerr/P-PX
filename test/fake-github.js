/* GitHub Git Data API'sinin kullandığımız kısmının sahtesi. Kimlikler gerçek Git algoritmasıyla hesaplanır.
   GitHub'ın belirleyici davranışları korunur: boş depoda 409, ileri olmayan dal güncellemesinde 422,
   ağaçta olmayan yolu silmede 422, erişim anahtarı yoksa 401, olmayan dal 404.
   publish() bir dala doğrudan commit atar (program deposunda main'e push gibi). */

const crypto = require('node:crypto');

const sha1 = (data) => crypto.createHash('sha1').update(data).digest('hex');
const blobSha = (buf) => sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));

function createFakeGitHub(options) {
  const opts = Object.assign({ owner: 'ben', name: 'veri', token: 'anahtar', isPrivate: true, branch: 'main' }, options);
  const blobs = new Map();
  const trees = new Map();
  const commits = new Map();
  let head = null;
  // Varsayılan dal dışındaki dallar: ad → commit
  const branches = new Map();
  const clock = opts.clock || { now: 1800000000000 };
  const stats = { get: 0, post: 0, patch: 0, put: 0, blobGets: 0, commits: 0, uncachedViolations: 0 };
  const hooks = { fail: null, beforeRefUpdate: null, staleRef: null };

  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const json = (status, data, headers) => ({ status, json: data, headers: headers || {} });
  const empty = () => json(409, { message: 'Git Repository is empty.' });

  function addBlob(buf) {
    const sha = blobSha(buf);
    blobs.set(sha, buf);
    return sha;
  }

  function addTree(map) {
    const sha = sha1(JSON.stringify([...map.entries()].sort()));
    trees.set(sha, map);
    return sha;
  }

  function addCommit(treeSha, parents, message) {
    clock.now += 1000;
    const sha = sha1(JSON.stringify({ treeSha, parents, message, at: clock.now }));
    commits.set(sha, { treeSha, parents, message, date: iso(clock.now) });
    return sha;
  }

  function handle(method, target, body, headers) {
    const prefix = `/repos/${opts.owner}/${opts.name}`;
    if (!target.startsWith(prefix)) return json(404, { message: 'Not Found' });
    const auth = headers && (headers.Authorization || headers.authorization);
    if (auth !== `Bearer ${opts.token}`) return json(401, { message: 'Bad credentials' });
    const [path, query] = target.slice(prefix.length).split('?');
    stats[method.toLowerCase()] += 1;
    if (hooks.fail) {
      const failed = hooks.fail(method, path);
      if (failed) return failed;
    }
    let m;

    if (method === 'GET' && path === '') {
      return json(200, { full_name: `${opts.owner}/${opts.name}`, private: opts.isPrivate, default_branch: opts.branch });
    }

    if (method === 'GET' && path === `/git/ref/heads/${opts.branch}`) {
      if (hooks.staleRef) {
        const stale = hooks.staleRef;
        hooks.staleRef = null;
        return json(200, { object: { sha: stale } });
      }
      return head ? json(200, { object: { sha: head } }) : empty();
    }
    if (method === 'GET' && (m = path.match(/^\/git\/ref\/heads\/(.+)$/))) {
      if (!head) return empty();
      const sha = branches.get(m[1]);
      return sha ? json(200, { object: { sha } }) : json(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = path.match(/^\/git\/commits\/(\w+)$/))) {
      const c = commits.get(m[1]);
      return c ? json(200, { sha: m[1], message: c.message, tree: { sha: c.treeSha }, committer: { date: c.date } }) : json(404, { message: 'Not Found' });
    }
    if (method === 'GET' && (m = path.match(/^\/git\/trees\/(\w+)$/))) {
      if (query !== 'recursive=1') return json(400, { message: 'recursive bekleniyordu' });
      const t = trees.get(m[1]);
      if (!t) return json(404, { message: 'Not Found' });
      return json(200, { sha: m[1], truncated: false, tree: [...t.entries()].map(([p, sha]) => ({ path: p, mode: '100644', type: 'blob', sha, size: blobs.get(sha).length })) });
    }
    if (method === 'GET' && (m = path.match(/^\/git\/blobs\/(\w+)$/))) {
      stats.blobGets += 1;
      const b = blobs.get(m[1]);
      if (!b) return json(404, { message: 'Not Found' });
      // GitHub base64 çıktısını 60 karakterde satırlara böler
      return json(200, { sha: m[1], encoding: 'base64', content: b.toString('base64').replace(/(.{60})/g, '$1\n') });
    }

    if (method === 'PUT' && path === '/contents/README.md') {
      if (head) return json(422, { message: 'sha wasn\'t supplied' });
      const map = new Map([['README.md', addBlob(Buffer.from(body.content, 'base64'))]]);
      head = addCommit(addTree(map), [], body.message);
      stats.commits += 1;
      return json(201, { commit: { sha: head } });
    }

    if (!head && method === 'POST') return empty();

    if (method === 'POST' && path === '/git/blobs') {
      if (body.encoding !== 'base64') return json(400, { message: 'encoding' });
      return json(201, { sha: addBlob(Buffer.from(body.content, 'base64')) });
    }
    if (method === 'POST' && path === '/git/trees') {
      const base = trees.get(body.base_tree);
      if (!base) return json(422, { message: 'base_tree yok' });
      const map = new Map(base);
      for (const e of body.tree) {
        if (e.sha === null) {
          if (!map.has(e.path)) return json(422, { message: 'GitRPC::BadObjectState' });
          map.delete(e.path);
        } else if (typeof e.content === 'string') {
          map.set(e.path, addBlob(Buffer.from(e.content, 'utf8')));
        } else {
          if (!blobs.has(e.sha)) return json(422, { message: 'blob yok' });
          map.set(e.path, e.sha);
        }
      }
      return json(201, { sha: addTree(map) });
    }
    if (method === 'POST' && path === '/git/commits') {
      if (!trees.has(body.tree)) return json(422, { message: 'tree yok' });
      const sha = addCommit(body.tree, body.parents, body.message);
      return json(201, { sha, committer: { date: commits.get(sha).date } });
    }
    if (method === 'PATCH' && path === `/git/refs/heads/${opts.branch}`) {
      if (hooks.beforeRefUpdate) {
        const run = hooks.beforeRefUpdate;
        hooks.beforeRefUpdate = null;
        return run().then(() => update(body));
      }
      return update(body);
    }
    return json(404, { message: `Tanımsız istek: ${method} ${path}` });
  }

  function update(body) {
    const c = commits.get(body.sha);
    if (!c) return json(422, { message: 'commit yok' });
    if (!body.force && !c.parents.includes(head)) return json(422, { message: 'Update is not a fast forward' });
    head = body.sha;
    stats.commits += 1;
    return json(200, { object: { sha: head } });
  }

  /** Dosyaları bir dala tek commit olarak yazar (git push gibi): yol → Buffer */
  function publish(branch, files, message) {
    const map = new Map([...files].map(([p, buf]) => [p, addBlob(Buffer.from(buf))]));
    const isDefault = branch === opts.branch;
    const parent = isDefault ? head : branches.get(branch);
    const sha = addCommit(addTree(map), parent ? [parent] : [], message || 'Push');
    if (isDefault) head = sha;
    else branches.set(branch, sha);
    return sha;
  }

  async function fetchFn(url, init) {
    const target = url.replace('https://api.github.com', '');
    if (init.method === 'GET' && init.cache !== 'no-store') stats.uncachedViolations += 1;
    if (hooks.network) throw new TypeError('Failed to fetch');
    const res = await handle(init.method, target, init.body ? JSON.parse(init.body) : null, init.headers);
    return new Response(JSON.stringify(res.json), { status: res.status, headers: res.headers });
  }

  return {
    fetchFn,
    handle,
    stats,
    hooks,
    clock,
    id: `${opts.owner}/${opts.name}`,
    token: opts.token,
    headSha: () => head,
    publish,
    branchSha: (name) => branches.get(name) || null,
    files: () => (head ? new Map([...trees.get(commits.get(head).treeSha)].map(([p, sha]) => [p, blobs.get(sha)])) : new Map()),
    commitCount: () => stats.commits
  };
}

module.exports = { createFakeGitHub, blobSha };
