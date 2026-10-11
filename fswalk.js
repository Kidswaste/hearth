// Folder listing and full-text search for fsapi.js (round 20, offmain: moved here, plain Node, so the store thread
// (storework.js) runs a recursive listing / a search of a big folder off the main process's thread; fsapi.js falls
// back to running them in place).
const fs = require('fs');
const path = require('path');

const assertAbs = (p) => {
  if (typeof p !== 'string' || !path.isAbsolute(p)) throw new Error(`Not an absolute path: ${p}`);
  return path.normalize(p);
};

function list(dir, { recursive = false, depth = 4, match, skipDirs = ['node_modules', '.git'] } = {}) {
  const out = [];
  const re = match ? new RegExp(match, 'i') : null;
  const walk = (d, level) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!re) out.push({ name: e.name, path: full, isDir: true });
        if (recursive && level < depth && !skipDirs.includes(e.name)) walk(full, level + 1);
        continue;
      }
      if (re && !re.test(e.name)) continue;
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      out.push({ name: e.name, path: full, size: st.size, mtime: st.mtimeMs, isDir: false });
    }
  };
  walk(assertAbs(dir), 0);
  return out;
}

// Full-text search across text files. Returns up to `limit` hits with a snippet each.
function search(dir, query, { match = '\\.(md|txt|json|csv|js|html|jsx)$', limit = 200, maxFileBytes = 2 * 1024 * 1024 } = {}) {
  const q = query.toLowerCase();
  const hits = [];
  for (const f of list(dir, { recursive: true, match })) {
    if (f.size > maxFileBytes) continue;
    let text;
    try { text = fs.readFileSync(f.path, 'utf8'); } catch { continue; }
    const lower = text.toLowerCase();
    let idx = lower.indexOf(q);
    let count = 0;
    const snippets = [];
    while (idx >= 0 && count < 50) {
      count += 1;
      if (snippets.length < 3) {
        const line = text.slice(0, idx).split('\n').length;
        snippets.push({ line, text: text.slice(Math.max(0, idx - 60), idx + q.length + 80).replace(/\s+/g, ' ') });
      }
      idx = lower.indexOf(q, idx + q.length);
    }
    if (count) hits.push({ ...f, count, snippets });
    if (hits.length >= limit) break;
  }
  return hits.sort((a, b) => b.count - a.count);
}

module.exports = { list, search, assertAbs };
