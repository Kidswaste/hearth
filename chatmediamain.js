// Pictures and videos a chat made (chat-media.js): files written during a reply in the chats' working folders
// (Hearth's workspace, a chat's own folder, Codex's generated images) and names a reply gives without a full path
// ("out/poster.png", "sandbox:/mnt/data/clip.mp4"), found on disk so the reply can show them instead of a link.
const fs = require('fs');
const os = require('os');
const path = require('path');

const MEDIA = /\.(png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|m4v|mkv)$/i;
const SKIP = new Set(['node_modules', '.git', '.cache', '__pycache__', '.venv']);
const MAX_SEEN = 4000; // entries looked at per folder (a huge folder is not walked to the end)

function walk(dir, depth, fn) {
  let seen = 0;
  const go = (d, level) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (++seen > MAX_SEEN) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (level < depth && !SKIP.has(e.name) && !e.name.startsWith('.')) go(full, level + 1); continue; }
      if (MEDIA.test(e.name)) fn(full, e.name);
    }
  };
  go(dir, 0);
}
const statOf = (p) => { try { const s = fs.statSync(p); return s.isFile() ? s : null; } catch { return null; } };

function codexImages() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(home, 'generated_images');
}

// { since, dirs, names } → { recent: [{ path, mtime, size }], resolved: { name: path } }
function find({ since = 0, dirs = [], names = [] } = {}, defaults = []) {
  const roots = [...new Set([...defaults, ...dirs, codexImages()].filter((d) => d && path.isAbsolute(d) && fs.existsSync(d)))];
  const recent = [];
  const byBase = new Map();
  for (const root of roots) {
    walk(root, 4, (full, name) => {
      const st = statOf(full);
      if (!st) return;
      if (since && st.mtimeMs >= since - 1500) recent.push({ path: full, mtime: st.mtimeMs, size: st.size });
      const k = name.toLowerCase();
      const had = byBase.get(k);
      if (!had || had.mtime < st.mtimeMs) byBase.set(k, { path: full, mtime: st.mtimeMs });
    });
  }
  const resolved = {};
  for (const raw of names.slice(0, 12)) {
    const rel = String(raw).replace(/^sandbox:/i, '').replace(/^file:\/\//i, '').replace(/^\.\//, '');
    let hit = null;
    if (path.isAbsolute(rel) && statOf(rel)) hit = rel;
    for (const root of roots) { if (hit) break; const p = path.join(root, rel); if (statOf(p)) hit = p; }
    if (!hit) hit = byBase.get(path.basename(rel).toLowerCase())?.path || null; // "sandbox:/mnt/data/x.png": the newest x.png
    if (hit) resolved[raw] = hit;
  }
  recent.sort((a, b) => b.mtime - a.mtime);
  return { recent: recent.slice(0, 12), resolved, roots };
}

function register(ipcMain, { workspace }) {
  ipcMain.handle('chatmedia:find', (_e, opts) => find(opts || {}, [workspace]));
}

module.exports = { register, find };
