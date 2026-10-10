// Sync, main side: turns the engine (sync-engine.js) on and off, finds the cloud drives, watches both folders
// (debounced; a calm check every minute too, so a drive that comes back is noticed), and talks to the renderer
// (sync.js: the status dot, Settings → Sync, /sync). Settings live in data/sync/settings.json (this computer only:
// the drive's folder isn't the same on the Mac and the PC). Required from main.js with one line.
//   IPC: sync:status · sync:detect · sync:on { root? } · sync:off · sync:now { mass?, fresh? } · sync:pause (bool)
//        sync:big (bool) · sync:conflicts · sync:resolve (id, keep) · sync:trash · sync:restore (id) · sync:open
//        sync:download · sync:ack (rels?)        events → 'sync:status', 'sync:pulled'
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const S = require('./sync-merge');
const { createEngine, hearthIn } = require('./sync-engine');

let engine = null; let opts = null; let getWin = () => null;
let watchers = []; let timer = null; let tick = null; let lastStatus = null;
let settings = {};
const DEBOUNCE_LOCAL = 2500; const DEBOUNCE_CLOUD = 4000; const EVERY = 60 * 1000;

const settingsFile = () => path.join(opts.dataDir, 'sync', 'settings.json');
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; } }
function saveSettings() {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  const tmp = `${settingsFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2));
  fs.renameSync(tmp, settingsFile());
}
const send = (ch, data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); };

// ---------- the drives on this computer ----------
function detect() {
  const list = S.detectClouds({
    platform: process.platform, home: os.homedir(), env: process.env,
    exists: (p) => fs.existsSync(p), readdir: (p) => fs.readdirSync(p), readJson: (p) => JSON.parse(fs.readFileSync(p, 'utf8')),
  });
  for (const d of list) { try { d.hearth = hearthIn(d.root); } catch { d.hearth = null; } }
  return list;
}
// Hearth's live data must not be inside a cloud drive (clients lock and half-download files): say so.
function dataInsideCloud(list) {
  const d = path.resolve(opts.dataDir).toLowerCase();
  return list.find((c) => d.startsWith(path.resolve(c.root).toLowerCase() + path.sep)) || null;
}

// ---------- the engine ----------
const downloadAsked = new Map();
function start() {
  stop();
  if (!settings.on || !settings.root) return;
  engine = createEngine({
    dataDir: opts.dataDir, configPath: opts.configPath, themePath: opts.themePath, cloudRoot: settings.root,
    big: settings.big !== false,
    log: (...a) => { if (process.env.HEARTH_SYNC_LOG) console.log('sync:', ...a); },
    onStatus: (st) => { lastStatus = st; send('sync:status', publicStatus()); },
    onPulled: (list) => send('sync:pulled', list),
    // iCloud ".icloud" stubs can't be read: ask iCloud for them (Mac), at most once in ten minutes per file
    requestDownload: (file) => {
      if (process.platform !== 'darwin') return;
      const real = path.join(path.dirname(file), path.basename(file).replace(/^\.(.+)\.icloud$/, '$1'));
      if (Date.now() - (downloadAsked.get(real) || 0) < 600000) return;
      downloadAsked.set(real, Date.now());
      execFile('brctl', ['download', real], () => {});
    },
  });
  opts.store?.setBeforeWrite?.((file, value) => (engine ? engine.guardWrite(file, value) : value));
  watch();
  tick = setInterval(() => schedule(0, 'tick'), EVERY);
  schedule(300, 'start');
}
function stop() {
  clearTimeout(timer); clearInterval(tick); timer = null; tick = null;
  for (const w of watchers) { try { w.close(); } catch { /* closed */ } }
  watchers = [];
  if (engine) engine.stop();
  engine = null;
  opts?.store?.setBeforeWrite?.(null);
}
// changes on either side: one pass a moment after things go quiet (and at most every 20 s while they don't)
let firstAt = 0;
function schedule(ms, why) {
  if (!engine || settings.paused) return;
  if (!firstAt) firstAt = Date.now();
  const wait = Math.max(0, Math.min(ms, 20000 - (Date.now() - firstAt)));
  clearTimeout(timer);
  timer = setTimeout(() => { firstAt = 0; run({ why }); }, wait);
}
async function run(o = {}) {
  if (!engine) return publicStatus();
  if (settings.paused && !o.force) return publicStatus();
  try { await engine.pass(o); } catch (err) { lastStatus = { ...(lastStatus || {}), state: 'error', error: err.message }; send('sync:status', publicStatus()); }
  if (!watchers.length) watch(); // the drive came back: watch it again
  return publicStatus();
}
function watch() {
  for (const w of watchers) { try { w.close(); } catch { /* closed */ } }
  watchers = [];
  const add = (dir, ms, skip) => {
    try {
      const w = fs.watch(dir, { recursive: true }, (_ev, name) => {
        const n = String(name || '');
        if (skip(n) || S.ignoredName(path.basename(n))) return;
        schedule(ms, 'watch');
      });
      w.on('error', () => { try { w.close(); } catch { /* closed */ } watchers = watchers.filter((x) => x !== w); });
      watchers.push(w);
    } catch { /* no recursive watch here, or the folder is gone: the minute check covers it */ }
  };
  const own = (n) => /^(sync|workspace|mcp-runs|ae)([\\/]|$)/.test(n) || /^(window|game-bridge|engine-installs|connectors|claude-flags)\.json$/.test(n) || /\.log$/.test(n);
  add(opts.dataDir, DEBOUNCE_LOCAL, own);
  if (engine && fs.existsSync(engine.cloudDir)) add(engine.cloudDir, DEBOUNCE_CLOUD, () => false);
  for (const f of [opts.configPath, opts.themePath]) {
    try { const w = fs.watch(f, () => schedule(DEBOUNCE_LOCAL, 'config')); watchers.push(w); } catch { /* missing */ }
  }
}

function publicStatus() {
  const st = lastStatus || (engine ? engine.status() : null);
  return {
    on: Boolean(settings.on), paused: Boolean(settings.paused), big: settings.big !== false,
    root: settings.root || '', label: settings.label || '', provider: settings.provider || '',
    machine: engine?.machine()?.name || os.hostname(),
    ...(st ? { state: settings.paused ? 'paused' : st.state, at: st.at, lastOk: st.lastOk, pending: st.pending || 0, conflicts: st.conflicts || 0, cloudOnly: st.cloudOnly || [], skippedBig: st.skippedBig || [], unreadable: st.unreadable || [], held: st.held || null, error: st.error || '', last: st.last || null, peers: st.peers || [], ms: st.ms || 0 } : { state: settings.on ? 'starting' : 'off' }),
  };
}

// ---------- IPC ----------
function register(ipcMain, win, o) {
  getWin = win;
  opts = o; // { dataDir, configPath, themePath, store }
  settings = readSettings();
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => fn(...a));
  h('sync:status', () => publicStatus());
  h('sync:detect', () => {
    const list = detect();
    const proposed = S.proposeCloud(list);
    return { list, proposed, inside: dataInsideCloud(list), dataDir: opts.dataDir };
  });
  // on: the proposed drive (or the one given). A drive that already has a Hearth is joined ("Use this Hearth"):
  // the first pass merges both sides, nothing is overwritten.
  h('sync:on', (a = {}) => {
    const list = detect();
    let pickd = a.root ? list.find((d) => path.resolve(d.root) === path.resolve(a.root)) || { id: 'folder', label: path.basename(a.root), root: a.root } : S.proposeCloud(list);
    if (!pickd) return { ok: false, error: 'No cloud drive folder found (iCloud Drive, Google Drive, Dropbox or OneDrive). Install its desktop app, or choose a folder.' };
    if (!fs.existsSync(pickd.root)) return { ok: false, error: `${pickd.root} isn't there` };
    const inside = path.resolve(opts.dataDir).toLowerCase().startsWith(path.resolve(pickd.root).toLowerCase() + path.sep);
    if (inside) return { ok: false, error: 'Hearth\'s data folder is inside that cloud drive: sync needs a local data folder (move Hearth out of the drive first).' };
    const joined = hearthIn(pickd.root);
    settings = { ...settings, on: true, paused: false, root: pickd.root, label: pickd.label, provider: pickd.id, since: Date.now() };
    saveSettings();
    start();
    return { ok: true, root: pickd.root, label: pickd.label, joined: Boolean(joined), machines: joined?.machines || [] };
  });
  h('sync:off', () => { settings = { ...settings, on: false }; saveSettings(); stop(); lastStatus = null; send('sync:status', publicStatus()); return publicStatus(); });
  h('sync:now', (a = {}) => run({ force: true, mass: a.mass, fresh: a.fresh }));
  h('sync:pause', (on) => { settings = { ...settings, paused: Boolean(on) }; saveSettings(); if (!on) schedule(0, 'resume'); send('sync:status', publicStatus()); return publicStatus(); });
  h('sync:big', (on) => { settings = { ...settings, big: Boolean(on) }; saveSettings(); engine?.set({ big: Boolean(on) }); schedule(0, 'big'); return publicStatus(); });
  h('sync:conflicts', async () => (engine ? engine.conflicts() : []));
  h('sync:resolve', async (id, keep) => { if (!engine) return { ok: false, error: 'Sync is off' }; const r = await engine.resolve(String(id), keep === 'theirs' ? 'theirs' : 'mine'); schedule(500, 'resolve'); return r; });
  h('sync:trash', async () => (engine ? engine.trash() : []));
  h('sync:restore', async (id) => { if (!engine) return { ok: false, error: 'Sync is off' }; const r = await engine.restore(String(id)); schedule(500, 'restore'); return r; });
  h('sync:open', () => { if (!engine) return false; require('electron').shell.openPath(fs.existsSync(engine.cloudDir) ? engine.cloudDir : settings.root); return true; });
  // the big files that are still only in the cloud: downloaded now (you asked)
  h('sync:download', async () => { if (!engine) return publicStatus(); engine.set({ allowDownload: new Set(publicStatus().cloudOnly) }); await run({ force: true }); engine?.set({ allowDownload: null }); return publicStatus(); });
  h('sync:ack', (rels) => { engine?.ackPulled(Array.isArray(rels) ? rels : null); return true; });
  start();
}
// before the window opens: the first pass gets a moment, so a fresh start shows what the other computer did
function ready(ms = 1500) {
  if (!engine || settings.paused) return Promise.resolve();
  clearTimeout(timer);
  return Promise.race([run({ why: 'startup' }), new Promise((r) => setTimeout(r, ms))]);
}
// config:save from the renderer: merged with a config that arrived meanwhile (see the engine's guardWrite)
function guardConfig(config) { try { return engine ? engine.guardWrite(opts.configPath, config) : config; } catch { return config; } }
function quit() { stop(); }

module.exports = { register, ready, guardConfig, quit, status: publicStatus };
