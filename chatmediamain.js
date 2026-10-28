// Pictures and videos a chat made (chat-media.js): files written during a reply in the chats' working folders
// (Hearth's workspace, a chat's own folder, Codex's generated images) and names a reply gives without a full path
// ("out/poster.png", "sandbox:/mnt/data/clip.mp4"), found on disk so the reply can show them instead of a link.
const fs = require('fs');
const os = require('os');
const path = require('path');

const MEDIA = /\.(png|jpe?g|webp|gif|bmp|avif|mp4|webm|mov|m4v|mkv)$/i;
const SKIP = new Set(['node_modules', '.git', '.cache', '__pycache__', '.venv']);
const MAX_SEEN = 4000; // entries looked at per folder (a huge folder is not walked to the end)

// (round 78, winperf78) asynchronous: asked after every reply, this walked the chats' folders with readdirSync /
// statSync on the main process (≈ 200 calls a reply on the test profile, each a scanned open on Windows + Defender:
// the whole app waited). Same order, same limits, off the main thread.
async function walk(dir, depth, fn) {
  let seen = 0;
  const go = async (d, level) => {
    let entries;
    try { entries = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (++seen > MAX_SEEN) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (level < depth && !SKIP.has(e.name) && !e.name.startsWith('.')) await go(full, level + 1); continue; }
      if (MEDIA.test(e.name)) await fn(full, e.name);
    }
  };
  await go(dir, 0);
}
const statOf = async (p) => { try { const s = await fs.promises.stat(p); return s.isFile() ? s : null; } catch { return null; } };
const exists = async (p) => { try { await fs.promises.access(p); return true; } catch { return false; } };

function codexImages() {
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  return path.join(home, 'generated_images');
}

// { since, dirs, names } → { recent: [{ path, mtime, size }], resolved: { name: path } }
async function find({ since = 0, dirs = [], names = [] } = {}, defaults = []) {
  const all = [...new Set([...defaults, ...dirs, codexImages()].filter((d) => d && path.isAbsolute(d)))];
  const roots = []; for (const d of all) if (await exists(d)) roots.push(d);
  const recent = [];
  const byBase = new Map();
  for (const root of roots) {
    await walk(root, 4, async (full, name) => {
      const st = await statOf(full);
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
    if (path.isAbsolute(rel) && await statOf(rel)) hit = rel;
    if (!hit && /^(?:[A-Za-z]:[\\/]|\/)/.test(rel)) { const l = require('./reachmain').localize(rel); if (l && await statOf(l.path)) hit = l.path; } // (round 19) a path from the other computer
    for (const root of roots) { if (hit) break; const p = path.join(root, rel); if (await statOf(p)) hit = p; }
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
