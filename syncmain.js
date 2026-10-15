// Sync, main side: turns the engine (sync-engine.js) on and off, finds the cloud drives, watches both folders
// (debounced; a calm check every minute too, so a drive that comes back is noticed), and talks to the renderer
// (sync.js: the status dot, Settings → Sync, /sync). Settings live in data/sync/settings.json (this computer only:
// the drive's folder isn't the same on the Mac and the PC). Required from main.js with one line.
//   IPC: sync:status · sync:detect · sync:on { root? } · sync:off · sync:now { mass?, fresh? } · sync:pause (bool)
//        sync:big (bool) · sync:conflicts · sync:resolve (id, keep) · sync:trash · sync:restore (id) · sync:open
//        sync:download · sync:ack (rels?) · sync:preview (id)        events → 'sync:status', 'sync:pulled'
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
// (round 43, datasafe) a settings file held for a moment is read again; one that still can't be read is never saved over
// (sync would have been switched off and its drive forgotten): changes wait in memory until it reads (settingsHeld)
let settingsHeld = false;
function readSettings() {
  const r = require('./datasafe-core').load(fs, settingsFile(), {}, { prev: false });
  settingsHeld = r.state === 'unreadable' && !r.canSave;
  return r.value && typeof r.value === 'object' ? r.value : {};
}
function saveSettings() {
  if (settingsHeld) { const again = readSettings(); if (settingsHeld) return; settings = { ...again, ...settings }; }
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
    // (round 20, offmain) big JSON stores are parsed and hashed on the store's files thread
    hashJson: opts.store?.runOff ? (file, a) => opts.store.runOff('syncHash', { file, ...a }) : undefined,
    log: (...a) => { if (process.env.HEARTH_SYNC_LOG) console.log('sync:', ...a); },
    onStatus: (st) => { lastStatus = st; send('sync:status', publicStatus()); },
    onPulled: (list) => send('sync:pulled', list),
    autoResolve: () => settings.autoResolve !== false, // (round 26) conflicts settle by themselves unless turned off
    onAutoResolved: (r) => send('sync:auto-resolved', r),
    // iCloud ".icloud" stubs can't be read: ask iCloud for them (Mac), at most once in ten minutes per file
    requestDownload: (file) => {
      if (process.platform !== 'darwin') return;
      const real = path.join(path.dirname(file), path.basename(file).replace(/^\.(.+)\.icloud$/, '$1'));
      if (Date.now() - (downloadAsked.get(real) || 0) < 600000) return;
      downloadAsked.set(real, Date.now());
      if (downloadAsked.size > 500) for (const [k, t] of downloadAsked) if (Date.now() - t >= 600000) downloadAsked.delete(k); // (round 20, soak) old asks go
      execFile('brctl', ['download', real], () => {});
    },
  });
  opts.store?.setBeforeWrite?.((file, value) => (engine ? engine.guardWrite(file, value) : value));
  watch();
  quiet = 0;
  armTick();
  schedule(300, 'start');
}
// (round 16) the calm check paces itself: every minute while things change, up to every 5 minutes after quiet passes
// (the watchers still bring changes within seconds), ×3 on battery, ×2 while Hearth is minimized, and none while the
// computer sleeps (one pass when it wakes up). Passes that start while a reply streams wait for a quieter moment.
let quiet = 0; let pace = { hidden: false, battery: false, asleep: false }; let wokeAt = 0;
function tickEvery() { return Math.min(5, 1 + Math.floor(quiet / 3)) * EVERY * (pace.battery ? 3 : 1) * (pace.hidden ? 2 : 1); }
function armTick() {
  clearTimeout(tick); tick = null;
  if (!engine || pace.asleep) return;
  tick = setTimeout(() => { tick = null; schedule(0, 'tick'); armTick(); }, tickEvery());
}
function setPace(st = {}) {
  const was = pace;
  // (round 39, powerwise) battery saver / Low Power Mode counts as battery; after a wake the pass waits for the
  // network and the cloud drive's own client (15 s, was 3 s)
  pace = { hidden: Boolean(st.hidden), battery: Boolean(st.battery || st.saver), asleep: Boolean(st.asleep) };
  if (was.asleep && !pace.asleep) { quiet = 0; wokeAt = Date.now(); schedule(require('./powerwise').WAKE.sync, 'wake'); }
  if (was.asleep !== pace.asleep || was.battery !== pace.battery || was.hidden !== pace.hidden) armTick();
}
let busy = () => 0;
let hold = () => false;
function stop() {
  clearTimeout(timer); clearTimeout(tick); timer = null; tick = null;
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
  // while a reply streams (its chat file is saved again and again) or on battery: wait for a longer quiet moment
  const slow = busy() > 0 || pace.battery;
  if (slow && why === 'watch') ms *= 2;
  let wait = Math.max(0, Math.min(ms, (slow ? 60000 : 20000) - (Date.now() - firstAt)));
  // (round 39, powerwise) just woken: changes the cloud client brings in meanwhile wait for the same moment
  const settle = wokeAt ? wokeAt + require('./powerwise').WAKE.sync - Date.now() : 0;
  if (settle > 0) wait = Math.max(wait, settle);
  clearTimeout(timer);
  // (round 20, jankwatch) a pass due while the owner types / drags / scrolls waits for the gesture to end (≤ 30 s)
  let tries = 0;
  timer = setTimeout(function go() { if (tries < 20 && hold()) { tries += 1; timer = setTimeout(go, 1500); return; } firstAt = 0; run({ why }); }, wait);
}
async function run(o = {}) {
  if (!engine) return publicStatus();
  if (settings.paused && !o.force) return publicStatus();
  try {
    await opts.store?.idle?.(); // (round 20) saves still on the store thread land before the pass reads the folder
    if (!engine) return publicStatus();
    const r = await engine.pass(o);
    const moved = r?.last ? r.last.pulled + r.last.pushed + r.last.merged + r.last.deletedHere + r.last.deletedThere + r.last.renamed : 1;
    const was = quiet; quiet = moved || r?.pending ? 0 : quiet + 1;
    if ((was > 2) !== (quiet > 2) || (quiet && quiet % 3 === 0)) armTick(); // the calm check slows down (or speeds up again)
  } catch (err) { lastStatus = { ...(lastStatus || {}), state: 'error', error: err.message }; send('sync:status', publicStatus()); }
  if (!watchers.length) watch(); // the drive came back: watch it again
  return publicStatus();
}
function watch() {
  for (const w of watchers) { try { w.close(); } catch { /* closed */ } }
  watchers = [];
  const add = (dir, ms, skip) => {
    // (round 42, filewatch) through the one watcher service, shared with what the window follows in the data folder
    // (the Lab's references, My templates): one system watch, re-armed after a wake / when the folder comes back
    try {
      const fw = require('./filewatchmain');
      watchers.push(fw.tree(dir, (name) => { const n = String(name || ''); if (skip(n) || S.ignoredName(path.basename(n))) return; schedule(ms, 'watch'); }));
      return;
    } catch { /* the service didn't load: its own watch as before */ }
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
  // (round 19) the workspace is watched too (what chats make syncs), but not its dependency folders and caches
  const own = (n) => /^(sync|mcp-runs|ae)([\\/]|$)/.test(n) || /(^|[\\/])(node_modules|__pycache__|venv|\.venv|\.git|\.cache|\.next)([\\/]|$)/.test(n) || /^(window|game-bridge|engine-installs|connectors|claude-flags)\.json$/.test(n) || /\.log$/.test(n);
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
  h('sync:resolve', async (id, keep) => { if (!engine) return { ok: false, error: 'Sync is off' }; const r = await engine.resolve(String(id), ['theirs', 'both', 'merge'].includes(keep) ? keep : 'mine'); schedule(500, 'resolve'); return r; });
  h('sync:resolveAll', async (mode) => { if (!engine) return { ok: false, error: 'Sync is off' }; const r = await engine.resolveAll(['auto', 'newest', 'mine', 'theirs'].includes(mode) ? mode : 'auto'); schedule(500, 'resolve-all'); return { ok: true, ...r }; });
  h('sync:autoResolve', (on) => { if (on !== undefined) { settings = { ...settings, autoResolve: Boolean(on) }; saveSettings(); } return settings.autoResolve !== false; });
  h('sync:preview', async (id) => (engine ? engine.preview(String(id)) : null)); // (round 19) both sides of a conflict
  h('sync:trash', async () => (engine ? engine.trash() : []));
  h('sync:restore', async (id, ro) => { if (!engine) return { ok: false, error: 'Sync is off' }; const r = await engine.restore(String(id), { replace: Boolean(ro?.replace) }); schedule(500, 'restore'); return r; });
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

// (round 19, reach) paths from the other computer: its folders (machine records), and whether a file is on its way
function pathCtx() { try { return engine ? engine.ctx() : null; } catch { return null; } }
function incoming(rel) { try { return engine ? engine.incoming(rel) : null; } catch { return null; } }
module.exports = { register, ready, guardConfig, quit, status: publicStatus, pathCtx, incoming, peers: () => (engine ? engine.peers() : Promise.resolve([])), pace: setPace, setBusy: (fn) => { busy = typeof fn === 'function' ? fn : () => 0; }, setHold: (fn) => { hold = typeof fn === 'function' ? fn : () => false; }, _pace: () => ({ quiet, every: tickEvery(), ...pace }) };
