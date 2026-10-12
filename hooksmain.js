// Hooks, main side (round 26): "when a file appears in a folder you pick". One cheap fs.watch per folder (not
// recursive, no polling), only while a hook asks for it. A new name is told once the file stops growing (a download
// or an export still writing waits), files that were there when watching started never count, nor do hidden files,
// partial downloads or lock files. The window gets { dir, path, size } on 'hooks:file'.
const fs = require('fs');
const path = require('path');

const MAX_DIRS = 8;
const SETTLE_MS = 1200; // the size must stay the same this long
const junk = (name) => /^\.|^~\$|\.(crdownload|part|partial|download|tmp|temp|swp|lock)$|^Thumbs\.db$|^desktop\.ini$/i.test(name);

function makeWatcher(tell, { settle = SETTLE_MS } = {}) {
  const dirs = new Map(); // dir → { w, known: Set(names), timers: Map(name → timeout) }
  function look(dir, d, name, lastSize = -1) {
    clearTimeout(d.timers.get(name));
    d.timers.set(name, setTimeout(() => {
      d.timers.delete(name);
      if (!dirs.has(dir)) return;
      const full = path.join(dir, name);
      fs.stat(full, (err, st) => {
        if (err || !st.isFile()) { if (err) d.known.delete(name); return; } // gone again (a temp file), or a folder
        if (st.size !== lastSize) { look(dir, d, name, st.size); return; } // still growing: look again
        if (d.known.has(name)) return;
        d.known.add(name);
        if (d.known.size > 20000) d.known.clear(); // a folder that big: start over (new names still count)
        tell({ dir, path: full, size: st.size });
      });
    }, settle));
  }
  function arm(dir) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return false; }
    const d = { w: null, known: new Set(names.slice(0, 20000)), timers: new Map() };
    try {
      d.w = fs.watch(dir, { persistent: false }, (_ev, name) => {
        if (!name) return;
        const n = String(name);
        if (junk(n) || n.includes(path.sep) || d.known.has(n)) return;
        look(dir, d, n);
      });
      d.w.on('error', () => { stop(dir); });
    } catch { return false; }
    dirs.set(dir, d);
    return true;
  }
  function stop(dir) {
    const d = dirs.get(dir);
    if (!d) return;
    try { d.w?.close(); } catch { /* closed */ }
    for (const t of d.timers.values()) clearTimeout(t);
    dirs.delete(dir);
  }
  // the folders hooks want now: new ones start, the rest stop
  function set(list) {
    const want = new Set((Array.isArray(list) ? list : []).map((p) => String(p || '')).filter((p) => path.isAbsolute(p)).slice(0, MAX_DIRS));
    for (const dir of [...dirs.keys()]) if (!want.has(dir)) stop(dir);
    const out = {};
    for (const dir of want) out[dir] = dirs.has(dir) || arm(dir);
    return out; // dir → watching (false: missing / unreadable)
  }
  return { set, stopAll: () => { for (const dir of [...dirs.keys()]) stop(dir); }, watching: () => [...dirs.keys()] };
}

function register(ipcMain, getWin) {
  const send = (data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send('hooks:file', data); };
  const watcher = makeWatcher(send);
  ipcMain.handle('hooks:watch', (_e, dirs) => watcher.set(dirs));
  return watcher;
}

module.exports = { register, makeWatcher, junk };
