// Sync, main side: turns the engine (sync-engine.js) on and off, finds the cloud drives, watches both folders
// (debounced; a calm check every minute too, so a drive that comes back is noticed), and talks to the renderer
// (sync.js: the status dot, Settings → Sync, /sync). Settings live in data/sync/settings.json (this computer only:
// the drive's folder isn't the same on the Mac and the PC). Required from main.js with one line.
//   IPC: sync:status · sync:detect · sync:on { root? } · sync:off · sync:now { mass?, fresh? } · sync:pause (bool)
//        sync:big (bool) · sync:conflicts · sync:resolve (id, keep) · sync:trash · sync:restore (id) · sync:open
//        sync:download · sync:ack (rels?) · sync:preview (id)        events → 'sync:status', 'sync:pulled'
//        (round 73, syncmedia73) sync:kinds (id, on) · sync:freeable · sync:free (rels)
//        (round 74, synchard74) sync:fix (rel, how): the sync panel's fix buttons for a file that can't sync
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const S = require('./sync-merge');
const { createEngine, hearthIn } = require('./sync-engine');
const K = require('./sync-kinds'); // (round 73, syncmedia73) What syncs
const Evict = require('./cloud-evict'); // (round 73, syncmedia73) Free up space
const SAmain = require('./storeackmain'); // (round 77, storeack77) stores the main process holds in memory
// (round 89, packs89) Settings › Sync › "Send very long chats in pieces": off by default. Off at start: no pack lane at all
// (the engine runs exactly as before). Turned off while running: the lane stays but does nothing (its machine record
// says so at once, so the other computer stops too). HEARTH_PACKS89=force (tests only) turns it on.
const packsOn = () => Boolean(settings.packs) || process.env.HEARTH_PACKS89 === 'force';
let packLane = null;

let engine = null; let opts = null; let getWin = () => null;
let watchers = []; let timer = null; let tick = null; let lastStatus = null;
let settings = {};
const DEBOUNCE_LOCAL = 2500; const DEBOUNCE_CLOUD = 4000; const EVERY = 60 * 1000;
// (round 77, synclatency77) what the watchers hear decides how soon the pass runs: a store (a chat, a project's notes,
// a scene, settings) saved here or arriving in the cloud folder, or the other computer's journal saying what it wrote,
// goes in a moment; other files (pictures, videos, the workspace) a little later; a file saved again and again (a reply
// streaming into its chat: "hot") keeps the calm debounce above. Nothing here runs a timer while nothing changes.
const SOON_LOCAL = 400; const SOON_CLOUD = 300; const OTHER_LOCAL = 1200; const OTHER_CLOUD = 1000;
const HOT_N = 3; const HOT_MS = 3000; // saved this many times within this long = hot
const WARM_MS = 6000; // a file that had its quick pass this long ago: the calm debounce for now (a store saved every 2 s, like the usage counts, isn't sent every 2 s)
const FIRST = (rel) => /^chats\/[^/]+\.json$/i.test(rel) || rel === 'kv/projects.json'; // chats and project notes: always the quick pass (never "warm")
const FOLLOW = 1000; const FOLLOW_MAX = 6; // a file still arriving / being written: a pass again after 1, 2, 4… 32 s, then the calm check
const JSON_SETTLE = 500; // (round 77) a store just written in the cloud folder: read after this (was 2 s like any file)
// (round 79, syncscope79) a pass looks only at the paths the watchers heard (sync-engine.js opts.scope), trusting what
// the last pass saw for the rest; it looks at everything (a "whole look") when it is the first, after a wake, when sync
// itself was changed (a fix, a restore, a conflict's choice, an option, Sync now), when a watcher failed / overflowed /
// was re-armed or isn't watching, when it heard a nameless event or more than SCOPE_CAP paths, and as a safety net
// every FULL_EVERY (the engine's own rule too) or every IDLE_FULL while Hearth is idle on mains power. The engine adds
// its own reasons (a folder unread, a pass cut short, a lost event found by its checks…).
const FULL_EVERY = 6 * 3600000; const IDLE_FULL = 30 * 60000; const SCOPE_CAP = 2000;
const SCOPED_WHY = new Set(['soon', 'watch', 'follow', 'lane', 'tick']); // passes the watchers / the calm check ask for

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
  require('./crashsafe-core').writeAtomicSync(fs, settingsFile(), JSON.stringify(settings, null, 2)); // (round 50, crashsafe) flushed, then renamed
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
  packLane = packsOn() ? require('./syncpack').createPackLane({ on: packsOn, runOff: opts.store?.runOff ? (op, a) => opts.store.runOff(op, a) : undefined, log: (...a) => { if (process.env.HEARTH_SYNC_LOG) console.log('sync:', ...a); } }) : null; // (round 89, packs89)
  engine = createEngine({
    ...(packLane ? { packs: packLane } : {}), // (round 89, packs89)
    devices: require('./devices90-core').hook(fs.promises, path.join(settings.root, 'Hearth'), (...a) => { if (process.env.HEARTH_SYNC_LOG) console.log('sync:', ...a); }), // (round 90, devices90) a forgotten computer that comes back: its record again at once
    dataDir: opts.dataDir, configPath: opts.configPath, themePath: opts.themePath, cloudRoot: settings.root,
    big: settings.big !== false,
    // (round 73, syncmedia73) kinds turned off on this computer are left alone; big files move on their own lane (a pass
    // after each); Free up space asks the cloud drive itself (cloud-evict.js)
    skip: K.skipper(settings.kinds),
    allowDownload: K.needed, // (round 87, labsync87) a big Lab reference / template file online-only in the cloud drive is still brought down
    onLane: () => schedule(300, 'lane'),
    evict: (file) => Evict.evict(file, { provider: settings.provider, root: settings.root }),
    // (round 74, synchard74) OneDrive refuses Windows-illegal names on a Mac too; the version in the machine record
    winNames: settings.provider === 'onedrive', appVersion: (() => { try { return require('electron').app.getVersion(); } catch { return undefined; } })(),
    // (round 73) app checks only (smoke runs set HEARTH_TEST_SAVE_DIR): data/sync/test-slow.json = ms per 4 MB piece, so
    // a check can watch a big file's progress; never read in a normal run
    chunkWait: process.env.HEARTH_TEST_SAVE_DIR ? async () => { try { const ms = Number(fs.readFileSync(path.join(opts.dataDir, 'sync', 'test-slow.json'), 'utf8')); if (ms > 0) await new Promise((r) => setTimeout(r, Math.min(ms, 2000))); } catch { /* not slowed */ } } : undefined,
    // (round 20, offmain) big JSON stores are parsed and hashed on the store's files thread
    hashJson: opts.store?.runOff ? (file, a) => opts.store.runOff('syncHash', { file, ...a }) : undefined,
    // (round 72, sync72) a big store arriving / changed on both computers: its JSON work on the same thread
    pullJson: opts.store?.runOff ? (a) => opts.store.runOff('syncPull', a) : undefined,
    mergeJson: opts.store?.runOff ? (a) => opts.store.runOff('syncMerge', a) : undefined,
    textJson: opts.store?.runOff ? (a) => opts.store.runOff('syncText', a) : undefined, // (round 82, bigchat82) a giant chat's cloud form for a push, made on the files thread
    jsonSettleMs: JSON_SETTLE, // (round 77, synclatency77)
    hold: holdHot, // (round 77) a chat a reply is streaming into goes up when it calms down (≥ every 20 s / 60 s while busy)
    log: (...a) => { if (process.env.HEARTH_SYNC_LOG) console.log('sync:', ...a); },
    onStatus: (st) => { lastStatus = st; send('sync:status', publicStatus()); },
    // (round 77, storeack77) the stores the main process holds (quick ideas, the sound bank, show sync) first hear it
    onPulled: (list) => { SAmain.arrived(list).catch(() => {}); send('sync:pulled', list); },
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
  // (round 75, syncstate75) + which files the guard would change (one that just arrived from the other computer): the
  // others' usage merges run on the store thread
  SAmain.setAck((rels, since) => engine?.ackPulled(rels, since)); // (round 77, storeack77)
  opts.store?.setBeforeWrite?.((file, value) => (engine ? engine.guardWrite(file, value) : value), (file) => { const rel = engine?.relOfLocal(file); return Boolean(rel && engine.hasPulled(rel)); });
  watch();
  quiet = 0;
  armTick();
  schedule(300, 'start');
}
// (round 16) the calm check paces itself: every minute while things change, up to every 5 minutes after quiet passes
// (the watchers still bring changes within seconds), ×3 on battery, ×2 while Hearth is minimized, and none while the
// computer sleeps (one pass when it wakes up). Passes that start while a reply streams wait for a quieter moment.
let quiet = 0; let pace = { hidden: false, battery: false, asleep: false }; let wokeAt = 0; let sleptAt = 0;
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
  if (!was.asleep && pace.asleep) sleptAt = Date.now(); // (round 74, synchard74)
  if (was.asleep && !pace.asleep) {
    // (round 74, synchard74) the time asleep doesn't count toward what sync waits for (a half download, a delete still
    // arriving): the engine moves those clocks on, and a pass that was running starts again from a fresh look
    if (sleptAt) { try { engine?.woke(Date.now() - sleptAt); } catch { /* fine */ } sleptAt = 0; }
    quiet = 0; wokeAt = Date.now(); schedule(require('./powerwise').WAKE.sync, 'wake');
  }
  if (was.asleep !== pace.asleep || was.battery !== pace.battery || was.hidden !== pace.hidden) armTick();
}
let busy = () => 0;
let hold = () => false;
function stop() {
  clearTimeout(timer); clearTimeout(tick); timer = null; tick = null; dueAt = 0; dueWhy = ''; forced = false; dirty.clear(); dirtyAll = false; scopeAcc.local.clear(); scopeAcc.cloud.clear(); scopeAcc.all = true; fwSeen = -1; recent.clear(); lastSoon.clear(); heldSince.clear(); followN = 0; cloudWatched = false; // (round 77)
  for (const w of watchers) { try { w.close(); } catch { /* closed */ } }
  watchers = [];
  if (engine) engine.stop();
  engine = null;
  opts?.store?.setBeforeWrite?.(null);
}
// changes on either side: one pass a moment after things go quiet (and at most every 20 s while they don't)
let firstAt = 0;
// while a reply streams (its chat file is saved again and again) or on battery: at most every minute
const capMs = () => (busy() > 0 || pace.battery ? 60000 : 20000);
// (round 77, synclatency77) the pass due (when, why); what the watchers heard since the last one (an echo of sync's own
// writes is no news); passes asked for by something else than a watcher (the calm check, a fix, the big lane) always run
let dueAt = 0; let dueWhy = ''; let forced = false;
const dirty = new Map(); let dirtyAll = false; // `${side}:${rel}` → { side, rel, abs }
// (round 79, syncscope79) every path heard since the last pass began (the scope of the next one); all: a whole look
const scopeAcc = { local: new Set(), cloud: new Set(), all: true };
function scopeNote(side, rel) { if (rel === null) { scopeAcc.all = true; return; } if (scopeAcc[side].size >= SCOPE_CAP) scopeAcc.all = true; else scopeAcc[side].add(rel); }
let fwSeen = -1; // the watcher service's errors + re-arms at the last pass (more: a watch failed or was opened again)
function watchTrusted() {
  if (!engine || !cloudWatched) return false;
  // Linux: Node's recursive watch loses most saves that replace a file by a rename (round 77): whole looks there, as
  // before (HEARTH_SYNC_SCOPE=1: tests that watch each folder plainly, as the Mac / PC hear)
  if (process.platform === 'linux' && !process.env.HEARTH_SYNC_SCOPE) return false;
  const ok = (side) => watchers.some((w) => w.side === side && (typeof w.healthy !== 'function' || w.healthy())); // (the data folder and the cloud folder, both)
  if (!ok('local') || !ok('cloud')) return false;
  try { const st = require('./filewatchmain').state(); const g = (st.errors || 0) + (st.rearms || 0); const same = fwSeen === g; fwSeen = g; return same; } catch { return true; }
}
// → { scope } for a scoped pass, or null (look at everything); the paths heard so far go to this pass either way
function takeScope(why) {
  const acc = { local: [...scopeAcc.local], cloud: [...scopeAcc.cloud], all: scopeAcc.all };
  scopeAcc.local.clear(); scopeAcc.cloud.clear(); scopeAcc.all = false;
  const trusted = watchTrusted(); // (always asked: it keeps the watcher service's count current)
  if (acc.all || !trusted || !SCOPED_WHY.has(why || '')) return null;
  const last = engine?.scope?.()?.lastFull || 0;
  if (Date.now() - last >= FULL_EVERY) return null;
  if (quiet >= 3 && !pace.battery && busy() === 0 && Date.now() - last >= IDLE_FULL) return null; // idle on mains power: the safety look now
  return { local: acc.local, cloud: acc.cloud };
}
const scopeBack = () => { scopeAcc.all = true; }; // a pass that failed: the next one looks at everything
const recent = new Map(); // `${side}:${rel}` → the times it was saved lately (hot or not)
const lastSoon = new Map(); // `local:${rel}` → when a quick pass last went for a real change of it (not sync's own write)
function schedule(ms, why) {
  if (!engine || settings.paused) return;
  const t = Date.now();
  if (!firstAt) firstAt = t;
  // while a reply streams (its chat file is saved again and again) or on battery: wait for a longer quiet moment
  const slow = busy() > 0 || pace.battery;
  if (slow && why === 'watch') ms *= 2;
  if (pace.battery && why === 'soon') ms *= 2; // (round 77) a store saved: still soon on battery, a little calmer
  let wait = Math.max(0, Math.min(ms, capMs() - (t - firstAt)));
  // (round 39, powerwise) just woken: changes the cloud client brings in meanwhile wait for the same moment
  const settle = wokeAt ? wokeAt + require('./powerwise').WAKE.sync - t : 0;
  if (settle > 0) wait = Math.max(wait, settle);
  if (why !== 'watch' && why !== 'soon') forced = true;
  // (round 77, synclatency77) a pass already due sooner stays: a streaming chat's saves no longer push back the pass a
  // chat message / a note / an arrival asked for (only a calm 'watch' pass is pushed back by the next 'watch' event)
  if (timer && dueAt <= t + wait && !(why === 'watch' && dueWhy === 'watch')) return;
  clearTimeout(timer);
  dueAt = t + wait; dueWhy = why;
  // (round 20, jankwatch) a pass due while the owner types / drags / scrolls waits for the gesture to end (≤ 30 s)
  let tries = 0;
  timer = setTimeout(function go() {
    const h = hold(); if (h === 'quiet' || (tries < 20 && h)) { tries += 1; dueAt = Date.now() + (h === 'quiet' ? 5000 : 1500); timer = setTimeout(go, h === 'quiet' ? 5000 : 1500); return; } // ('quiet': the Lab presents, round 52: no limit, it waits the show out)
    timer = null; dueAt = 0;
    // (round 77) only sync's own writes were heard: nothing to do; only those and a file still hot (a reply streaming):
    // its calm pass, as before (never past the cap: then the pass runs)
    const v = forced ? 'run' : verdict();
    if (v === 'hot' && Date.now() - firstAt < capMs()) { for (const [k, d] of dirty) if (!(d.side === 'local' && d.rel && isHot('local', d.rel))) dirty.delete(k); schedule(DEBOUNCE_LOCAL, 'watch'); return; }
    firstAt = 0; forced = false; dirty.clear(); dirtyAll = false;
    if (v !== 'echo') run({ why });
  }, wait);
}
// (round 77, synclatency77) a watcher heard a file: how soon a pass should look (side: 'local' | 'cloud')
function heard(side, rel, abs) {
  const t = Date.now(); const k = `${side}:${rel || abs}`;
  let l = recent.get(k); if (!l) { if (recent.size >= 400) for (const [x, v] of recent) if (t - v[v.length - 1] > HOT_MS) recent.delete(x); recent.set(k, l = []); }
  if (!l.length || t - l[l.length - 1] > 150) l.push(t); // one save is several events (temp file, rename): counted once
  while (l.length && t - l[0] > HOT_MS) l.shift();
  if (dirty.size < 500) dirty.set(k, { side, rel, abs }); else dirtyAll = true;
  const warm = side === 'local' && !FIRST(rel || '') && t - (lastSoon.get(k) || -1e15) < WARM_MS; // (a save here; what arrives is paced by the other computer)
  if (l.length >= HOT_N || warm) { schedule(side === 'cloud' ? DEBOUNCE_CLOUD : DEBOUNCE_LOCAL, 'watch'); return; } // hot / warm: calm, as before
  const store = !rel || S.isJsonRel(rel); // (a journal line, a store, or something not a file of the mirror: soon)
  schedule(side === 'cloud' ? (store ? SOON_CLOUD : OTHER_CLOUD) : (store ? SOON_LOCAL : OTHER_LOCAL), 'soon');
}
// (round 77, synclatency77) saved HOT_N times within HOT_MS (a reply streaming into its chat, a note typed with autosave)
const isHot = (side, rel) => { const l = recent.get(`${side}:${rel}`); const t = Date.now(); return Boolean(l && l.filter((x) => t - x <= HOT_MS).length >= HOT_N); };
// the engine asks, for a file changed only here: wait? Yes while it is hot, but never longer than the calm cap (20 s, 60 s
// while replies run / on battery): a long reply still reaches the other computer now and then, as before
const heldSince = new Map();
function holdHot(rel) {
  if (!isHot('local', rel)) { heldSince.delete(rel); return false; }
  const t = Date.now(); const since = heldSince.get(rel);
  if (!since) { if (heldSince.size > 100) heldSince.clear(); heldSince.set(rel, t); return true; }
  if (t - since < capMs() * 0.8) return true; // (a little under the cap: the cap's pass lets it through)
  heldSince.delete(rel); return false;
}
// every file heard since the last pass is, as it is now, the version sync already has (its own write, or one it read)
// → 'run' | 'echo' (nothing new) | 'hot' (nothing new but a file still being saved again and again)
// (a local file that is news is remembered: saved again within WARM_MS, it waits the calm debounce)
function verdict() {
  if (dirtyAll || !dirty.size || !engine?.knows) return 'run';
  let hot = false; let news = false; const t = Date.now();
  for (const [k, d] of dirty) {
    if (!d.rel) { news = true; continue; }
    if (d.side === 'local' && isHot('local', d.rel)) { hot = true; continue; }
    let st; try { st = fs.statSync(d.abs); } catch { news = true; continue; } // gone: news (a delete)
    if (!st.isFile() || !engine.knows(d.side, d.rel, st.size, st.mtimeMs)) {
      news = true;
      if (d.side === 'local') { if (lastSoon.size >= 400) for (const [x, v] of lastSoon) if (t - v >= WARM_MS) lastSoon.delete(x); lastSoon.set(k, t); }
    }
  }
  return news ? 'run' : hot ? 'hot' : 'echo';
}
let followN = 0; let cloudWatched = false; const runs = {}; // runs: passes by why (tests)
// (round 77, synclatency77) ms until the first file "arriving" in the cloud folder has stood its settle time (≥ 0; Infinity
// when none can tell: a clock ahead, a journal still late — the follow-up's own pace then)
function settledIn(waiting) {
  let soonest = Infinity;
  for (const w of waiting.slice(0, 20)) {
    if (w.why !== 'arriving' || !engine) continue;
    try { const st = fs.statSync(path.join(engine.FILES, ...String(w.rel).split('/'))); const at = Math.floor(st.mtimeMs) + (S.isJsonRel(w.rel) ? JSON_SETTLE : 2000) - Date.now(); if (at > 0 && at < soonest) soonest = at; } catch { /* gone, a stub */ }
  }
  return soonest;
}
async function run(o = {}) {
  if (!engine) return publicStatus();
  if (settings.paused && !o.force) return publicStatus();
  runs[o.why || 'now'] = (runs[o.why || 'now'] || 0) + 1;
  try {
    await opts.store?.idle?.(); // (round 20) saves still on the store thread land before the pass reads the folder
    if (!engine) return publicStatus();
    const scope = o.force || o.mass || o.fresh ? (takeScope(''), null) : takeScope(o.why); // (round 79, syncscope79)
    let r;
    try { r = await engine.pass(scope ? { ...o, scope } : o); } catch (err) { scopeBack(); throw err; }
    const moved = r?.last ? r.last.pulled + r.last.pushed + r.last.merged + r.last.deletedHere + r.last.deletedThere + r.last.renamed : 1;
    const was = quiet; quiet = moved || r?.pending ? 0 : quiet + 1;
    if ((was > 2) !== (quiet > 2) || (quiet && quiet % 3 === 0)) armTick(); // the calm check slows down (or speeds up again)
    // (round 77, synclatency77) a file still arriving from the cloud client or still being written here: looked at again
    // soon (1, 2, 4… 32 s), not at the next calm check a minute later; nothing is armed once nothing is on its way
    // (or right when a file that just landed in the cloud folder is old enough to be read: its time + the settle)
    if ((r?.waiting || []).some((w) => w.why === 'arriving' || w.why === 'writing' || w.why === 'copy-check')) { if (followN < FOLLOW_MAX) schedule(Math.min(FOLLOW * 2 ** followN++, settledIn(r.waiting) + 60), 'follow'); } else followN = 0;
  } catch (err) { lastStatus = { ...(lastStatus || {}), state: 'error', error: err.message }; send('sync:status', publicStatus()); }
  // the drive came back: watch it again; (round 77) and Hearth's folder in the drive, made by the first pass after sync
  // was turned on (it wasn't watched until the next start: arrivals waited for the calm check, up to a minute)
  if (!watchers.length || (engine && !cloudWatched && fs.existsSync(engine.cloudDir))) watch();
  return publicStatus();
}
function watch() {
  for (const w of watchers) { try { w.close(); } catch { /* closed */ } }
  watchers = []; cloudWatched = false;
  scopeAcc.all = true; // (round 79) unwatched for a moment: the next pass looks at everything
  // (round 77, synclatency77) side: 'local' | 'cloud' — each event goes to heard() (how soon), not a fixed debounce
  const add = (dir, side, skip) => {
    const hear = (name) => {
      let n = String(name || '');
      // (round 79, syncscope79) a nameless event (the system lost track: a full buffer on Windows, FSEvents' "look at
      // the whole folder") → a whole look; an iCloud placeholder appearing / going is about the file it stands for
      if (!n || (side === 'cloud' && n === 'files')) { scopeAcc.all = true; schedule(side === 'cloud' ? SOON_CLOUD : SOON_LOCAL, 'soon'); return; }
      if (side === 'cloud') n = n.replace(/(^|[\\/])\.([^\\/]+)\.icloud$/, '$1$2');
      if (skip(n) || S.ignoredName(path.basename(n))) return;
      const abs = path.join(dir, n); const slash = n.split(path.sep).join('/').normalize('NFC');
      if (side === 'local') scopeNote('local', slash); else if (/^files\//.test(slash)) scopeNote('cloud', slash.slice(6)); // (round 79) what the next pass looks at
      heard(side, side === 'cloud' ? (/^files\//.test(slash) ? slash.slice(6) : null) : slash || null, abs);
    };
    // (round 42, filewatch) through the one watcher service, shared with what the window follows in the data folder
    // (the Lab's references, My templates): one system watch, re-armed after a wake / when the folder comes back
    try {
      const fw = require('./filewatchmain');
      const t = fw.tree(dir, hear); t.side = side; watchers.push(t); // (round 79) side: which folder it hears
      return true;
    } catch { /* the service didn't load: its own watch as before */ }
    try {
      const w = fs.watch(dir, { recursive: true }, (_ev, name) => hear(name));
      w.on('error', () => { try { w.close(); } catch { /* closed */ } watchers = watchers.filter((x) => x !== w); scopeAcc.all = true; });
      w.side = side; watchers.push(w);
      return true;
    } catch { /* no recursive watch here, or the folder is gone: the minute check covers it */ }
    return false;
  };
  // (round 19) the workspace is watched too (what chats make syncs), but not its dependency folders and caches
  const own = (n) => /^(sync|mcp-runs|ae)([\\/]|$)/.test(n) || /(^|[\\/])(node_modules|__pycache__|venv|\.venv|\.git|\.cache|\.next)([\\/]|$)/.test(n) || /^(window|game-bridge|engine-installs|connectors|claude-flags)\.json$/.test(n) || /\.log$/.test(n);
  add(opts.dataDir, 'local', n => own(n) || S.watchIgnored(n));
  // (round 77, synclatency77) the other computers' journals are heard too (a line there = a file on its way or landed:
  // the pass that was waiting for it goes now); this computer's own journal and the machine records are not
  const mine = engine ? `${engine.machine().id}.jsonl` : '';
  const journal = (n) => { const m = /^\.sync[\\/]journal[\\/]([^\\/]+\.jsonl)$/.exec(n); return m ? (m[1] === mine ? 'own' : 'peer') : null; };
  if (engine && fs.existsSync(engine.cloudDir)) cloudWatched = add(engine.cloudDir, 'cloud', n => { const j = journal(n); return j ? j === 'own' : S.watchIgnored(n, true); });
  for (const [f, rel] of [[opts.configPath, 'app/config.json'], [opts.themePath, 'app/theme.css']]) {
    try { const w = fs.watch(f, () => { if (dirty.size < 500) dirty.set(`local:${rel}`, { side: 'local', rel, abs: f }); else dirtyAll = true; schedule(OTHER_LOCAL, 'soon'); }); watchers.push(w); } catch { /* missing */ } // (round 77) was 2.5 s; its echo (a settings file sync wrote) is no news
  }
}

function publicStatus() {
  const st = lastStatus || (engine ? engine.status() : null);
  return {
    on: Boolean(settings.on), paused: Boolean(settings.paused), big: settings.big !== false,
    root: settings.root || '', label: settings.label || '', provider: settings.provider || '',
    machine: engine?.machine()?.name || os.hostname(),
    kinds: K.list(settings.kinds, st?.kindSizes || {}), // (round 73, syncmedia73) What syncs: each kind, on / off here, sizes
    transfers: st?.transfers || [], moving: st?.moving || 0, // (round 73) big files on their way, with progress
    scope: st?.scope || null, // (round 79, syncscope79) the last pass: scoped or whole (why), how much it looked at
    aside: st?.aside || [], // (round 78, guardloss78) the losing sides of conflicts settled by themselves, kept aside (the sync panel)
    packs: { on: packsOn(), ...(st?.packs ? { gate: st.packs.gate, published: st.packs.published, took: st.packs.took, bytesUp: st.packs.bytesUp } : {}) }, // (round 89, packs89) Send very long chats in pieces
    ...(st ? { state: settings.paused ? 'paused' : st.state, at: st.at, lastOk: st.lastOk, pending: st.pending || 0, conflicts: st.conflicts || 0, cloudOnly: st.cloudOnly || [], skippedBig: st.skippedBig || [], unreadable: st.unreadable || [], waiting: st.waiting || [], blocked: st.blocked || [], peersOld: st.peersOld || [], need: st.need || 0, lastError: st.lastError || null, held: st.held || null, error: st.error || '', last: st.last || null, peers: st.peers || [], ms: st.ms || 0 } : { state: settings.on ? 'starting' : 'off' }),
  };
}

// (round 90, devices90) Free up's move to this computer's Trash (Recycle Bin); a drive without one: it stays, said why.
// App checks (HEARTH_TEST_SAVE_DIR): a folder in the run's own scratch space stands for the Trash.
async function dvTrash(p) {
  if (process.env.HEARTH_TEST_SAVE_DIR) {
    const to = path.join(process.env.HEARTH_TEST_SAVE_DIR, 'devices90-trash', `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}-${path.basename(p)}`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(p, to);
    return to;
  }
  const check = process.platform === 'win32' ? require('./winpolish').trashCheck(p, { platform: 'win32' })
    : process.platform === 'darwin' ? require('./macpolish').trashCheck(p, { platform: 'darwin' }) : { ok: true };
  if (!check.ok) throw new Error(check.error || check.why || 'no Trash on that drive: left where it is');
  await require('electron').shell.trashItem(check.path || p);
  return 'trash';
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
  // (round 89, packs89) Send very long chats in pieces: undefined → the state; true / false → set. On: the engine starts
  // again with the pack lane; off: the lane stays shut until the next start (its record no longer says "packs")
  h('sync:packs', (on) => {
    if (on !== undefined) {
      settings = { ...settings, packs: Boolean(on) }; saveSettings();
      if (on && engine && !packLane) start(); else schedule(300, 'packs');
    }
    return publicStatus().packs;
  });
  // (round 90, devices90) Settings › This computer & sync › Your computers: the computers Hearth knows, "Forget this
  // computer…" (its record moved to .sync/forgotten, never deleted; never this one; only one not seen for a week), and
  // the space very long chats' pieces take, with Free up (the pack trash's pieces older than 7 days → this computer's
  // Trash; never a piece a manifest names; nothing at all if a manifest can't be read). devices90-core.js does the work.
  const DV = require('./devices90-core');
  const dvWhere = () => (engine ? { cloudDir: engine.cloudDir, stateDir: engine.stateDir, myId: engine.machine().id } : null);
  h('sync:devices', async () => { const w = dvWhere(); if (!w) return { off: true, computers: [], forgotten: [] }; return DV.list(fs.promises, { ...w, now: Date.now() }); });
  h('sync:forget', async (file) => {
    const w = dvWhere(); if (!w) return { ok: false, why: 'off' };
    const r = await DV.forget(fs.promises, { ...w, file: String(file || ''), now: Date.now(), by: engine.machine().name }).catch((err) => ({ ok: false, why: 'unreadable', error: err.message }));
    if (r.ok) schedule(300, 'forget'); // (the packs gate is looked at again in the next pass)
    return r;
  });
  h('sync:packSpace', async () => { const w = dvWhere(); if (!w) return null; return DV.space(fs.promises, { ...w, now: Date.now() }); });
  h('sync:packFree', async () => {
    const w = dvWhere(); if (!w) return { ok: false, held: 'off' };
    return DV.freeUp(fs.promises, { ...w, now: Date.now(), trashItem: dvTrash });
  });
  h('sync:autoResolve', (on) => { if (on !== undefined) { settings = { ...settings, autoResolve: Boolean(on) }; saveSettings(); } return settings.autoResolve !== false; });
  h('sync:preview', async (id) => (engine ? engine.preview(String(id)) : null)); // (round 19) both sides of a conflict
  // (round 78, guardloss78) a conflict's losing side kept aside: the notes (no id), or one note's compare / both / theirs / dismiss
  h('sync:aside', async (id, how) => { if (!engine) return id ? { ok: false, error: 'Sync is off' } : []; const r = await engine.aside(id ? String(id) : null, ['compare', 'both', 'theirs', 'dismiss'].includes(how) ? how : 'compare'); if (r?.ok && (how === 'both' || how === 'theirs')) schedule(500, 'aside'); return r; });
  h('sync:trash', async () => (engine ? engine.trash() : []));
  h('sync:restore', async (id, ro) => { if (!engine) return { ok: false, error: 'Sync is off' }; const r = await engine.restore(String(id), { replace: Boolean(ro?.replace) }); schedule(500, 'restore'); return r; });
  h('sync:open', () => { if (!engine) return false; require('electron').shell.openPath(fs.existsSync(engine.cloudDir) ? engine.cloudDir : settings.root); return true; });
  // the big files that are still only in the cloud: downloaded now (you asked)
  h('sync:download', async () => { if (!engine) return publicStatus(); engine.set({ allowDownload: K.needed.with(new Set(publicStatus().cloudOnly)) }); await run({ force: true }); engine?.set({ allowDownload: K.needed }); /* (round 87, labsync87) */ return publicStatus(); });
  // (round 73, syncmedia73) What syncs: a kind on / off on this computer. Off never deletes anything: the files stay
  // where they are here and in the cloud; sync just leaves them alone until it is on again.
  h('sync:kinds', (id, on) => {
    if (!K.KINDS.some((k) => k.id === id)) return publicStatus();
    settings = { ...settings, kinds: { ...(settings.kinds || {}), [id]: Boolean(on) } };
    saveSettings(); engine?.set({ skip: K.skipper(settings.kinds) }); schedule(on ? 0 : 500, 'kinds');
    const p = publicStatus(); send('sync:status', p); return p;
  });
  // Free up space: the list first (big synced files whose cloud copy also takes room here), then the click
  h('sync:freeable', async () => {
    const sup = Evict.support({ provider: settings.provider, root: settings.root });
    if (!engine) return { items: [], bytes: 0, can: false, why: 'Sync is off.' };
    return { ...(await engine.freeable()), can: sup.ok, why: sup.ok ? '' : sup.why, how: sup.how || '' };
  });
  h('sync:free', async (rels) => {
    if (!engine) return { ok: false, error: 'Sync is off' };
    const sup = Evict.support({ provider: settings.provider, root: settings.root });
    if (!sup.ok) return { ok: false, unsupported: true, error: sup.why, done: [], failed: [], bytes: 0 };
    const r = await engine.free(Array.isArray(rels) ? rels.map(String).slice(0, 2000) : []);
    schedule(1500, 'free');
    return { ok: true, ...r };
  });
  h('sync:ack', (rels, o) => { engine?.ackPulled(Array.isArray(rels) ? rels : null, Number(o?.since) || 0); opts.store?.outsideAck?.(Array.isArray(rels) ? rels : null, Number(o?.since) || 0); return true; }); // (round 77, storeack77) o.since: when the window began reading · (round 78, guardloss78) + 🛟 Recover's writes (store.js)
  // (round 74, synchard74) a blocked file's fix: Rename for Windows / Allow changes / Remove from the cloud; then a pass
  h('sync:fix', async (rel, how) => {
    if (!engine) return { ok: false, error: 'Sync is off' };
    if (!['rename', 'writable', 'unsecret'].includes(how)) return { ok: false, error: 'Nothing to fix there' };
    const r = await engine.fix(String(rel || ''), how).catch((err) => ({ ok: false, error: err.message }));
    if (r?.ok) schedule(300, 'fix');
    return r;
  });
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
module.exports = { register, ready, guardConfig, quit, status: publicStatus, pathCtx, incoming, peers: () => (engine ? engine.peers() : Promise.resolve([])), pace: setPace, setBusy: (fn) => { busy = typeof fn === 'function' ? fn : () => 0; }, setHold: (fn) => { hold = typeof fn === 'function' ? fn : () => false; }, _pace: () => ({ quiet, every: tickEvery(), ...pace }), _due: () => ({ due: timer ? dueAt - Date.now() : null, why: timer ? dueWhy : '', follow: followN, cloudWatched, runs: { ...runs } }) }; // (round 77, synclatency77) _due: tests (a pass armed? none while idle)
module.exports.engine = () => engine; // (round 75, versions75) the engine's places (cloud folder, conflicts, Deleted files) for 🕘 Earlier versions (versionsmain.js)
