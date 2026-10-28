// Three.js dependencies are immutable by version. Keep a bounded, atomic local copy,
// shared with exports, so opening a scene does not depend on Chromium's evictable cache.
const fs = require('fs');
const path = require('path');
const C = require('./deploy-core');
const SCHEME = 'hearth-three';
const MAX_FILE = 24 * 1024 * 1024;
const VERSION = /^0\.\d{1,3}\.\d{1,3}$/;
function valid(version, rel) {
  return VERSION.test(version) && /^(build|examples\/jsm|src)\/[\w./-]+\.js$/.test(rel)
    && !rel.split('/').some(p => p === '..' || p === '.' || !p);
}
function create({ dataDir, fetcher = (...args) => fetch(...args), localDir = '' }) {
  const pending = new Map();
  // (round 74, checkhealth74) "download" from a local three.js package of the same version when one is given
  // (HEARTH_THREE_DIR, as deploymain.js / gametexmain.js already use): the checks run without network. Only on a
  // download, so a new computer still reports what it lacks; the copy goes through the same checks and atomic write.
  async function localCopy(version, rel) {
    if (!localDir) return null;
    try {
      if (JSON.parse(await fs.promises.readFile(path.join(localDir, 'package.json'), 'utf8')).version !== version) return null;
      const file = path.join(localDir, ...rel.split('/'));
      if ((await fs.promises.stat(file)).size > MAX_FILE) return null;
      return await fs.promises.readFile(file, 'utf8');
    } catch { return null; }
  }
  const fileOf = (v, r) => path.join(dataDir, 'deploy', `three@${v}`, ...r.split('/'));
  async function read(version, rel, download = true) {
    if (!valid(version, rel)) throw new Error('Unsupported Three.js library path.');
    const dest = fileOf(version, rel);
    try {
      const s = await fs.promises.stat(dest);
      if (s.isFile() && s.size > 0 && s.size <= MAX_FILE) {
        const text = await fs.promises.readFile(dest, 'utf8');
        if (!/^\s*</.test(text)) return text;
      }
    } catch { /* not cached yet */ }
    if (!download) throw new Error(`Not downloaded: ${rel}`);
    const key = `${version}/${rel}`;
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      const copy = await localCopy(version, rel);
      if (copy != null && copy.trim() && !/^\s*</.test(copy)) {
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        const tmp = `${dest}.${process.pid}.offline-part`;
        try { await fs.promises.writeFile(tmp, copy); await fs.promises.rename(tmp, dest); }
        finally { await fs.promises.unlink(tmp).catch(() => {}); }
        return copy;
      }
      const res = await fetcher(`https://cdn.jsdelivr.net/npm/three@${version}/${rel}`, { signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (!res.ok) throw new Error(`Library download failed (${res.status}): ${rel}`);
      if (Number(res.headers.get('content-length')) > MAX_FILE) throw new Error('Library file is too large.');
      const chunks = []; let bytes = 0;
      for await (const chunk of res.body) {
        bytes += chunk.length;
        if (bytes > MAX_FILE) throw new Error('Library file is too large.');
        chunks.push(Buffer.from(chunk));
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim() || /^\s*</.test(text)) throw new Error(`Invalid library response: ${rel}`);
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      const tmp = `${dest}.${process.pid}.offline-part`;
      try { await fs.promises.writeFile(tmp, text); await fs.promises.rename(tmp, dest); }
      finally { await fs.promises.unlink(tmp).catch(() => {}); }
      return text;
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  }
  async function prepare(version, codes, download = false) {
    if (!VERSION.test(version)) throw new Error('Choose a supported Three.js version.');
    const queue = ['build/three.module.js', 'examples/jsm/controls/OrbitControls.js'];
    for (const code of codes) for (const spec of C.importsOf(code)) {
      const rel = C.threePath(spec);
      if (rel) queue.push(rel);
    }
    const seen = new Set(), missing = []; let bytes = 0, files = 0;
    while (queue.length) {
      const rel = queue.shift();
      if (seen.has(rel)) continue;
      if (seen.size >= 200) { missing.push('Dependency limit reached'); break; }
      seen.add(rel);
      try {
        const text = await read(version, rel, download);
        files++;
        bytes += Buffer.byteLength(text);
        for (const spec of C.importsOf(text)) {
          const next = spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec)) : C.threePath(spec);
          if (next) queue.push(next);
        }
      } catch (err) {
        missing.push(`${rel}: ${err.message}`);
        // Don't spend minutes retrying a lost connection for every dependency.
        if (download && /fetch failed|network|timeout|abort|ENOTFOUND/i.test(err.message)) { missing.push('Reconnect and prepare again to finish'); break; }
      }
    }
    return { ready: !missing.length, files, bytes, missing };
  }
  async function response(req) {
    const headers = { 'content-type': 'text/javascript; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=31536000, immutable' };
    try {
      const u = new URL(req.url), m = /^\/(0\.\d+\.\d+)\/(.+)$/.exec(u.pathname);
      if (u.protocol !== `${SCHEME}:` || u.hostname !== 'library' || u.search || !m || !['GET', 'HEAD'].includes(req.method)) return new Response('Invalid library request', { status: 400 });
      const text = await read(m[1], m[2]);
      return new Response(req.method === 'HEAD' ? null : text, { headers });
    } catch (err) { return new Response(`Library unavailable. Prepare this project while online. ${err.message}`, { status: 503, headers: { ...headers, 'cache-control': 'no-store' } }); }
  }
  return { read, prepare, response, fileOf };
}
let instance;
function register({ protocol, ipcMain, dataDir }) {
  instance = create({ dataDir, fetcher: (url, opts) => require('electron').net.fetch(url, opts), localDir: process.env.HEARTH_THREE_DIR || '' });
  protocol.handle(SCHEME, req => instance.response(req));
  ipcMain.handle('net:prepareProject', (_e, args) => require('./offline-project').check({ ...args, dataDir, library: instance }));
}
module.exports = { create, register, valid, SCHEME };
