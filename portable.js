// Moving Hearth between computers (Windows ↔ Mac): a "pack" zip with the app, your data and settings, and a
// one-time fix of saved file locations when the data folder now lives somewhere else.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DATA_DIR } = require('./store');
const fsapi = require('./fsapi');

const APP_DIR = __dirname;
const ORIGIN = path.join(DATA_DIR, 'hearth-origin.json');

// Saved paths that point inside the old data folder (attachments, references, notes' screenshots…) are
// rewritten to the new one. Paths elsewhere (music on a Windows Desktop…) can't be guessed and are left.
function fixMovedPaths() {
  let origin = null;
  try { origin = JSON.parse(fs.readFileSync(ORIGIN, 'utf8')); } catch { /* first start */ }
  const here = { dataDir: DATA_DIR, appDir: APP_DIR, platform: process.platform, at: Date.now() };
  if (!origin?.dataDir || norm(origin.dataDir) === norm(DATA_DIR)) { writeOrigin(here); return { moved: false }; }
  const from = [origin.dataDir, origin.dataDir.replace(/\\/g, '/'), origin.dataDir.replace(/\//g, '\\')];
  const sep = path.sep;
  let files = 0; let changed = 0;
  const fix = (v) => {
    if (typeof v === 'string') {
      for (const f of from) {
        if (v.length > f.length && v.slice(0, f.length).toLowerCase() === f.toLowerCase() && /[\\/]/.test(v[f.length])) {
          changed += 1;
          return DATA_DIR + v.slice(f.length).replace(/[\\/]/g, sep);
        }
        // file:/// URLs to the old folder
        const u = `file:///${f.replace(/\\/g, '/')}`;
        if (v.startsWith(u)) { changed += 1; return `file:///${DATA_DIR.replace(/\\/g, '/').replace(/^\//, '')}${v.slice(u.length)}`; }
      }
      return v;
    }
    if (Array.isArray(v)) return v.map(fix);
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = fix(v[k]); return v; }
    return v;
  };
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!['workspace', 'attachments', 'refs', 'trash-files'].includes(e.name)) walk(full); continue; }
      if (!e.name.endsWith('.json') || e.name === 'hearth-origin.json') continue;
      try {
        const before = changed;
        const data = fix(JSON.parse(fs.readFileSync(full, 'utf8')));
        if (changed !== before) { fs.writeFileSync(full, JSON.stringify(data, null, e.name.startsWith('three-') ? 0 : 2)); files += 1; }
      } catch { /* not JSON we can read */ }
    }
  };
  walk(DATA_DIR);
  writeOrigin(here);
  return { moved: true, from: origin.platform, files, changed };
}
const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
function writeOrigin(o) { try { fs.writeFileSync(ORIGIN, JSON.stringify(o, null, 2)); } catch { /* not critical */ } }

// Everything needed to run Hearth on another computer: the app's code, data/, config.json, theme.css and the
// Mac setup script. Left out: the Windows Electron runtime, engine sessions (they can't move), logs.
function packForMac(out) {
  const skipTop = new Set(['electron', 'electron-mac', 'node_modules', 'dev']);
  const entries = fs.readdirSync(APP_DIR)
    .filter((n) => !skipTop.has(n) && !/\.zip$/i.test(n))
    .map((n) => ({ path: path.join(APP_DIR, n), name: path.join('Hearth', n) }));
  writeOrigin({ dataDir: DATA_DIR, appDir: APP_DIR, platform: process.platform, at: Date.now() });
  return fsapi.zip(entries, out, { skipDirs: ['workspace', 'ae', 'sync'] }); // sync's state is this computer's own
}

module.exports = { fixMovedPaths, packForMac, defaultPackName: () => path.join(os.homedir(), 'Desktop', `Hearth for Mac ${new Date().toISOString().slice(0, 10)}.zip`) };
