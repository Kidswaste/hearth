// The asset library's file work, off the main process's thread (round 24, assets stream): a Node worker_thread that
// assetsmain.js starts on first use. It walks watched folders (asset files only, hidden / dependency folders skipped)
// and hashes what it finds, so a folder of thousands of textures never stalls the window or the main process.
// Hash: SHA-1 of the whole file up to 32 MB; bigger files (videos, huge EXRs) hash their size plus three 1 MB samples
// (start, middle, end): the same file found twice still matches, and a 4 GB render costs 3 MB of reading.
// Files whose size and modified time didn't change since the last scan (`known`) keep their hash without a read.
// Messages in: { id, type: 'scan', roots: [path], known: { path: [size, mtime, hash] }, max } · { id, type: 'hash', paths }
// Out: { id, progress: { done, found, root } } while working · { id, ok, files: [{ p, s, m, h, root }], skipped } at the end.
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AssetsCore = require('./assets-core');

const SKIP_DIRS = new Set(['node_modules', '__pycache__', 'venv', '.venv', '.git', '.svn', '.cache', 'Library', '$RECYCLE.BIN', 'System Volume Information', '.Trash', '.Trashes', 'cache', 'Cache', 'temp', 'Temp']);
const BIG = 32 * 1048576;
const SAMPLE = 1048576;

function hashFile(p, size) {
  const h = crypto.createHash('sha1');
  if (size > BIG) {
    const fd = fs.openSync(p, 'r');
    try {
      const buf = Buffer.alloc(SAMPLE);
      h.update(`size:${size}`);
      for (const at of [0, Math.floor(size / 2 - SAMPLE / 2), size - SAMPLE]) { const n = fs.readSync(fd, buf, 0, SAMPLE, Math.max(0, at)); h.update(buf.subarray(0, n)); }
    } finally { fs.closeSync(fd); }
  } else h.update(fs.readFileSync(p));
  return h.digest('hex').slice(0, 20);
}

function walk(root, known, max, report) {
  const out = []; let skipped = 0; let seen = 0;
  const stack = [[root, 0]];
  while (stack.length) {
    const [dir, depth] = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 10 && !SKIP_DIRS.has(e.name) && !/\.(app|bundle|photoslibrary|fcpbundle)$/i.test(e.name)) stack.push([full, depth + 1]); continue; }
      if (!e.isFile() || !AssetsCore.kindOf(e.name)) continue;
      if (out.length >= max) { skipped += 1; continue; }
      let st; try { st = fs.statSync(full); } catch { continue; }
      if (!st.size) continue;
      const k = known[full];
      let h = k && k[0] === st.size && k[1] === Math.round(st.mtimeMs) ? k[2] : null;
      if (!h) { try { h = hashFile(full, st.size); } catch { continue; } }
      out.push({ p: full, s: st.size, m: Math.round(st.mtimeMs), h, root });
      seen += 1;
      if (seen % 50 === 0) report(seen);
    }
  }
  return { files: out, skipped };
}

// one job, in the worker or (when a worker can't start) in place: progress(msg) is called while it works
function run(job, progress = () => {}) {
  try {
    if (job.type === 'scan') {
      const files = []; let skipped = 0;
      for (const root of job.roots || []) {
        if (!fs.existsSync(root)) continue;
        const r = walk(root, job.known || {}, Math.max(0, (job.max || 20000) - files.length), (n) => progress({ found: files.length + n, root }));
        files.push(...r.files); skipped += r.skipped;
      }
      return { ok: true, files, skipped };
    }
    if (job.type === 'hash') {
      const files = [];
      for (const p of job.paths || []) {
        try { const st = fs.statSync(p); if (st.isFile()) files.push({ p, s: st.size, m: Math.round(st.mtimeMs), h: hashFile(p, st.size) }); else files.push({ p, missing: true }); } catch { files.push({ p, missing: true }); }
      }
      return { ok: true, files };
    }
    return { ok: false, error: `unknown job ${job.type}` };
  } catch (err) { return { ok: false, error: err.message }; }
}
if (parentPort) parentPort.on('message', (job) => { const id = job?.id; parentPort.postMessage({ id, ...run(job || {}, (progress) => parentPort.postMessage({ id, progress })) }); });
module.exports = { run, hashFile, walk };
