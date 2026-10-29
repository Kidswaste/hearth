// Power-wise, main side (round 39, powerwise; the pure parts are in powerwise.js). Required by main.js at its very
// top (one line), then register(ipcMain, { bgmain, getWin }) once the window exists.
//   · the one system blocker (Electron's powerSaveBlocker): 'prevent-app-suspension' while something long runs,
//     'prevent-display-sleep' only for Present and recordings; holds counted per reason, released when they end, when
//     the page that asked goes (reload, crash, closed), after a time limit, or when you say "let it sleep"
//   · holds made here, where the work runs: an AI turn past 45 s (turn(chatId) from engine:send), a big download
//     (download(item) from appshell / app windows), Hearth's own update (during('update', fn) in updatermain)
//   · the computer's state: battery (bgmain), Mac Low Power Mode (pmset) / Windows battery saver
//     (GetSystemPowerStatus), checked on power events and at most every 10 minutes when the window gains focus,
//     never on a timer; asleep / awake and when it woke (wokeAt): the window's timers and sync wait a moment after
//   · every(id, ms, fn, o): main-process background timers on the same schedule as the window's (powerwise.js)
//   · tests only (dev/smoke.js sets HEARTH_TEST_SAVE_DIR): a stub blocker that records start / stop, simulated battery
//     / saver / sleep / wake / hidden window, and a counter of every timer the main process runs (wakeups / minute)
// IPC: power:state · power:hold (reason, { label, display, ttl }) → token · power:release (token) · power:allow ·
// power:test · events power:state → the window.
const Core = require('./powerwise');

const TEST = Boolean(process.env.HEARTH_TEST_SAVE_DIR);
// (round 65, mainhang65; tests only) the main process' event-loop delay, long blocks, sync fs and IPC per channel
const lagProbe = TEST && process.env.HEARTH_LOOPLAG ? require('./mainlag-probe') : null;

// ---------- tests: count the main process's wakeups (installed before the rest of main.js loads) ----------
const probe = TEST ? (() => {
  const P = { on: true, since: Date.now(), n: 0, by: new Map(), watchFiles: new Map() };
  const site = (skip) => {
    const o = {}; const lim = Error.stackTraceLimit; Error.stackTraceLimit = 6;
    Error.captureStackTrace(o, skip); Error.stackTraceLimit = lim;
    const lines = String(o.stack || '').split('\n').slice(1).map((l) => l.trim());
    const own = lines.find((l) => /[\\/](?!node_modules)[^\\/]+\.js:\d+/.test(l) && !/powerwise(main)?\.js/.test(l)) || lines[0] || '?';
    return own.replace(/^at\s+/, '').replace(/\(?(?:file:\/\/)?[^()]*[\\/]([^\\/]+\.js:\d+):\d+\)?/, '$1').slice(0, 90);
  };
  const count = (key) => { P.n += 1; P.by.set(key, (P.by.get(key) || 0) + 1); };
  // (round 72, longrun72) the timers alive right now, by the line that made them (a timeout until it fires or is
  // cleared, an interval until it is cleared): a count that keeps rising over hours is a timer pile-up
  P.live = new Map();
  for (const name of ['setTimeout', 'setInterval']) {
    const orig = global[name];
    const once = name === 'setTimeout';
    const wrapped = function (fn, ms, ...rest) {
      if (typeof fn !== 'function') return orig.call(this, fn, ms, ...rest);
      const key = `${once ? 'timeout' : 'interval'} ${site(wrapped)}`;
      let t = null;
      t = orig.call(this, function (...a) { count(key); if (once) P.live.delete(t); return fn.apply(this, a); }, ms, ...rest);
      if (t && typeof t === 'object') P.live.set(t, key);
      return t;
    };
    Object.defineProperty(wrapped, 'name', { value: name });
    if (orig.__promisify__) wrapped.__promisify__ = orig.__promisify__;
    global[name] = wrapped;
  }
  for (const name of ['clearTimeout', 'clearInterval']) {
    const orig = global[name];
    global[name] = function (t) { if (t && typeof t === 'object') P.live.delete(t); return orig.call(this, t); };
  }
  P.liveBy = () => { const by = {}; for (const [t, k] of P.live) { if (t._destroyed) { P.live.delete(t); continue; } by[k] = (by[k] || 0) + 1; } return by; };
  // fs.watchFile polls the disk on its own timer (no JS callback per poll): counted as stats per minute
  const fs = require('fs');
  const wf = fs.watchFile;
  fs.watchFile = function (file, opts, ...rest) { const ms = typeof opts === 'object' && opts?.interval ? opts.interval : 5007; P.watchFiles.set(String(file), ms); return wf.call(this, file, opts, ...rest); };
  const uf = fs.unwatchFile;
  fs.unwatchFile = function (file, ...rest) { P.watchFiles.delete(String(file)); return uf.call(this, file, ...rest); };
  P.take = () => {
    const ms = Math.max(1, Date.now() - P.since);
    const perMin = (x) => Math.round((x * 60000 / ms) * 10) / 10;
    const polls = [...P.watchFiles.values()].reduce((a, v) => a + 60000 / v, 0);
    const out = { seconds: Math.round(ms / 100) / 10, timers: P.n, perMin: perMin(P.n), statPollsPerMin: Math.round(polls * 10) / 10, watchFiles: [...P.watchFiles].map(([f, v]) => `${f.split(/[\\/]/).pop()} ${v} ms`),
      top: [...P.by].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${perMin(v)}/min ${k}`) };
    P.since = Date.now(); P.n = 0; P.by.clear();
    return out;
  };
  return P;
})() : null;

// ---------- the blocker ----------
let stub = null; // tests: { starts: [], stops: [], live: Set }
const psb = () => stub || require('electron').powerSaveBlocker;
let tellSoon = null;
const blocker = Core.createBlocker({
  start: (type) => psb().start(type),
  stop: (id) => { const b = psb(); if (b.isStarted ? b.isStarted(id) : true) b.stop(id); },
  onChange: () => tell(),
});
const owners = new Set(); // webContents ids whose holds go when their page goes

// ---------- the computer's state ----------
const st = { battery: false, saver: false, lowPower: false, hidden: false, asleep: false, wokeAt: 0 };
const sched = Core.createScheduler({ state: () => st, onWake: (at) => { if (at > st.wokeAt) { st.wokeAt = at; tell(); } } });
const listeners = new Set();
let getWin = () => null;
let bg = null;
function snapshot() { return { ...st, mode: Core.mode(st), policy: Core.policy(st), awake: blocker.view() }; }
function tell() {
  if (tellSoon) return;
  // one message per change burst (a render queue of 20 jobs starting is one message)
  tellSoon = setImmediate(() => {
    tellSoon = null;
    const s = snapshot();
    const w = getWin();
    try { if (w && !w.isDestroyed()) w.webContents.send('power:state', s); } catch { /* closing */ }
    for (const fn of listeners) { try { fn(s); } catch (err) { console.warn('powerwise', err.message); } }
  });
}
function setSys(patch) {
  let changed = false; const wasAsleep = st.asleep;
  for (const [k, v] of Object.entries(patch)) if (st[k] !== v) { st[k] = v; changed = true; }
  if (!changed) return;
  if (wasAsleep && !st.asleep) st.wokeAt = Date.now();
  // the saver slows sync and the other bgmain listeners like the battery does
  if (('saver' in patch || 'lowPower' in patch) && bg?._set) bg._set({ saver: Boolean(st.saver || st.lowPower) });
  sched.setState();
  tell();
}

// Mac Low Power Mode / Windows battery saver: asked on events only (start, plug / unplug, wake, a speed limit change,
// the window gaining focus at most every 10 minutes); a child process off the main thread, never a poll
let saverAt = 0; let saverBusy = false;
function checkSaver(force = false) {
  if (saverBusy || (!force && Date.now() - saverAt < 10 * 60000)) return;
  if (process.platform !== 'darwin' && process.platform !== 'win32') return;
  if (process.platform === 'win32' && !st.battery && !st.saver) { saverAt = Date.now(); return; } // (Windows: the saver only matters on battery)
  saverBusy = true; saverAt = Date.now();
  const { execFile } = require('child_process');
  const done = (key, v) => { saverBusy = false; if (v != null) setSys({ [key]: v }); };
  try {
    if (process.platform === 'darwin') execFile('pmset', ['-g'], { timeout: 4000 }, (err, out) => done('lowPower', err ? null : Core.parseMacLowPower(out)));
    else if (process.platform === 'win32') execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', Core.WIN_SAVER_PS], { timeout: 8000, windowsHide: true }, (err, out) => done('saver', err ? null : Core.parseWinSaver(out)));
    else saverBusy = false; // (round 40) other systems: no saver to read
  } catch { saverBusy = false; }
}

// ---------- holds made here ----------
function hold(reason, o = {}) { const t = blocker.hold(reason, o); let done = false; return () => { if (done) return false; done = true; return blocker.release(t); }; }
async function during(reason, fn, o) { const release = hold(reason, o); try { return await fn(); } finally { release(); } }
// an AI turn: held once it has run AGENT_AFTER_MS (short answers never touch the blocker), released when it ends
const turns = new Map(); // chatId → { timer, release }
function turn(chatId) {
  const key = String(chatId || `t${Date.now()}`);
  turns.get(key)?.end();
  const T = { timer: null, release: null, ended: false };
  T.end = () => { if (T.ended) return; T.ended = true; clearTimeout(T.timer); T.release?.(); if (turns.get(key) === T) turns.delete(key); };
  T.timer = setTimeout(() => { if (!T.ended) T.release = hold('agent'); }, Number(process.env.HEARTH_AGENT_AWAKE_MS) || Core.AGENT_AFTER_MS);
  T.timer.unref?.();
  turns.set(key, T);
  return T;
}
// a download (Electron DownloadItem): big ones at once, unknown sizes once they've run a while; released on 'done'
function download(item) {
  try {
    let release = null; let timer = null;
    const big = () => (item.getTotalBytes?.() || 0) >= Core.BIG_DOWNLOAD;
    const take = () => { if (!release && item.getState?.() === 'progressing') release = hold('download', { label: `downloading ${String(item.getFilename?.() || '').slice(0, 40)}`.trim() }); };
    if (big()) take(); else { timer = setTimeout(take, Core.DOWNLOAD_AFTER_MS); timer.unref?.(); }
    item.once('done', () => { clearTimeout(timer); release?.(); });
  } catch { /* not a download item */ }
}

// (round 52, presentready) while the Lab presents: the main process' background timers wait (backups, config watching);
// sync asks quietNow() before a pass (main.js setHold); off again: they come back one at a time
let quietOn = false;
function quiet(on) { on = Boolean(on); if (on === quietOn) return false; quietOn = on; sched.hush(on, []); return true; }

// ---------- IPC ----------
function register(ipcMain, o = {}) {
  getWin = o.getWin || getWin;
  bg = o.bgmain || null;
  bg?.subscribe?.((s) => setSys({ battery: Boolean(s.battery), hidden: Boolean(s.hidden), asleep: Boolean(s.asleep) }));
  const watchOwner = (wc) => {
    if (!wc || owners.has(wc.id)) return;
    owners.add(wc.id);
    const id = wc.id;
    const drop = () => blocker.releaseOwner(id);
    wc.once('destroyed', () => { owners.delete(id); drop(); });
    wc.on('render-process-gone', drop);
    wc.on('did-start-navigation', (e, _url, inPage, isMain) => { if ((e?.isMainFrame ?? isMain) && !(e?.isSameDocument ?? inPage)) drop(); });
  };
  ipcMain.handle('power:state', () => snapshot());
  ipcMain.handle('power:hold', (e, reason, opts = {}) => { watchOwner(e.sender); return blocker.hold(String(reason || 'render'), { label: opts?.label, display: opts?.display, ttl: opts?.ttl, owner: e.sender.id }); });
  ipcMain.handle('power:release', (_e, token) => blocker.release(Number(token)));
  ipcMain.handle('power:allow', () => blocker.allow());
  ipcMain.handle('power:quiet', (_e, on) => quiet(on)); // (round 52, presentready) the Lab presents: background work waits
  ipcMain.handle('power:test', (_e, t = {}) => (t.lag && lagProbe ? lagProbe.take(t.lag) : testHook(t)));
  try {
    const { powerMonitor } = require('electron');
    const again = () => checkSaver(true);
    powerMonitor.on('on-battery', again);
    powerMonitor.on('on-ac', again);
    powerMonitor.on('resume', again);
    for (const ev of ['speed-limit-change', 'thermal-state-change']) { try { powerMonitor.on(ev, again); } catch { /* not on this system */ } }
  } catch { /* no power events */ }
  const w = getWin();
  w?.on?.('focus', () => checkSaver(false));
  const first = setTimeout(() => checkSaver(true), 8000); first.unref?.();
  // quitting: nothing stays held (the system frees it anyway when the process ends)
  try { require('electron').app.on('will-quit', () => blocker.releaseAll()); } catch { /* tests */ }
}

// ---------- tests only ----------
function testHook(t) {
  if (!TEST) throw new Error('Tests only');
  const out = {};
  if (t.stub === true && !stub) {
    const S = stub = { starts: [], stops: [], live: new Set(), n: 0 };
    S.start = (type) => { const id = S.n++; S.starts.push({ id, type, at: Date.now() }); S.live.add(id); return id; };
    S.stop = (id) => { S.stops.push({ id, at: Date.now() }); S.live.delete(id); };
    S.isStarted = (id) => S.live.has(id);
  }
  if (t.stub === false) stub = null;
  // (through bgmain when it's there, so sync, now playing and app windows hear the same switch)
  const sys = (patch) => (bg?._set ? bg._set(patch) : setSys(patch));
  if (t.battery != null) sys({ battery: Boolean(t.battery) });
  if (t.saver != null) setSys({ saver: Boolean(t.saver) });
  if (t.sleep === 'suspend') sys({ asleep: true });
  if (t.sleep === 'resume') sys({ asleep: false });
  // (round 72, longrun72) the computer's own power events as every listener hears them (suspend / resume / lock-screen /
  // unlock-screen), not only bgmain's state; and a long-run sample of the main process (longrunSample below)
  if (t.power) { try { require('electron').powerMonitor.emit(String(t.power)); out.power = String(t.power); } catch (err) { out.power = `error: ${err.message}`; } }
  if (t.longrun) out.longrun = longrunSample(t.longrun);
  const w = getWin();
  if (t.window === 'hide' && w) w.hide();
  if (t.window === 'show' && w) { w.show(); w.focus(); }
  // (gpuload84) a window's own event as the system sends it ('minimize' / 'restore' / 'blur' / 'focus'; Xvfb has no
  // window manager to minimize), to the window whose page URL starts with t.winEvent.url (or Hearth's), and every
  // window's page URL and whether its page may rest when hidden (backgroundThrottling)
  if (t.winEvent || t.windows) {
    const { BrowserWindow } = require('electron');
    const all = BrowserWindow.getAllWindows().filter((x) => !x.isDestroyed());
    if (t.winEvent) { const x = t.winEvent.url ? all.find((b) => b.webContents.getURL().startsWith(t.winEvent.url)) : w; if (x) { x.emit(String(t.winEvent.event)); out.emitted = true; } }
    out.windows = all.map((b) => ({ url: b.webContents.getURL().slice(0, 120), throttling: b.webContents.getBackgroundThrottling?.() ?? null }));
  }
  if (t.agentMs != null) process.env.HEARTH_AGENT_AWAKE_MS = String(t.agentMs);
  if (t.turn) out.turn = Boolean(turn(t.turn));
  if (t.endTurn) { turns.get(String(t.endTurn))?.end(); out.ended = true; }
  if (t.download) {
    const { EventEmitter } = require('events');
    const item = Object.assign(new EventEmitter(), { getTotalBytes: () => t.download.total || 0, getState: () => 'progressing', getFilename: () => 'test.bin' });
    download(item); out.download = true;
    setTimeout(() => item.emit('done', {}, 'completed'), t.download.ms || 1000).unref?.();
  }
  if (t.update) { during('update', () => new Promise((r) => setTimeout(r, t.update))); out.update = true; }
  if (t.hold) { const release = hold(t.hold, { ttl: t.ttl }); if (t.releaseAfter) setTimeout(release, t.releaseAfter); out.held = true; }
  if (t.expire) out.expired = blocker.expire().length;
  if (t.probe === 'take' && probe) out.probe = probe.take();
  if (t.probe === 'start' && probe) { probe.take(); out.probe = 'started'; }
  if (t.timers) out.timers = sched.list();
  if (t.metrics) { try { out.metrics = metrics(); } catch (err) { out.metrics = { error: String(err?.stack || err).slice(0, 600), procs: [], pages: [] }; } } // (round 44, idlecpu) CPU time and wakeups per process, for dev/checks/idlecpu.js
  out.state = snapshot();
  out.stub = stub ? { starts: stub.starts.slice(), stops: stub.stops.slice(), live: [...stub.live] } : null;
  out.bg = bg?.state?.() || null;
  return out;
}

// (round 72, longrun72; tests only) what can pile up in the main process over hours, after a full GC: JS heap, live
// handles by kind (timers, watchers, sockets, child processes with what they run), live timers by the line that made
// them, IPC listeners (ipcMain channels with more than one listener; invoke handlers), listeners on app / powerMonitor /
// the hub window, the app's processes by type, web contents and windows
let gcFn = null;
function longrunSample(o = {}) {
  const { app, ipcMain, webContents, BrowserWindow, powerMonitor } = require('electron');
  if (o.gc !== false) { try { if (!gcFn) { require('v8').setFlagsFromString('--expose_gc'); gcFn = require('vm').runInNewContext('gc'); } gcFn(); gcFn(); } catch { /* no gc: the heap reads higher */ } }
  const mu = process.memoryUsage();
  const handles = {}; const children = {};
  for (const h of process._getActiveHandles?.() || []) {
    const k = h?.constructor?.name || typeof h; handles[k] = (handles[k] || 0) + 1;
    if (k === 'ChildProcess') { const c = String(h.spawnfile || '?').split(/[\\/]/).pop() + (h.spawnargs?.[1] ? ` ${String(h.spawnargs[1]).split(/[\\/]/).pop()}` : ''); children[c] = (children[c] || 0) + 1; }
  }
  const res = {}; for (const k of process.getActiveResourcesInfo?.() || []) res[k] = (res[k] || 0) + 1;
  const multi = {}; let ipcN = 0;
  for (const n of ipcMain.eventNames()) { const c = ipcMain.listenerCount(n); ipcN += c; if (c > 1) multi[String(n)] = c; }
  const count = (em) => { const by = {}; let n = 0; try { for (const e of em.eventNames()) { const c = em.listenerCount(e); n += c; if (c > 2) by[String(e)] = c; } } catch { /* gone */ } return { n, by }; };
  const w = getWin();
  const listeners = { app: count(app), powerMonitor: count(powerMonitor), ...(w && !w.isDestroyed() ? { win: count(w), wc: count(w.webContents) } : {}) };
  const procs = {}; for (const m of app.getAppMetrics()) { const p = procs[m.type] ||= { n: 0, mb: 0 }; p.n += 1; p.mb += Math.round((m.memory?.workingSetSize || 0) / 1024); }
  let snapshot; if (o.snapshot) { try { snapshot = require('v8').writeHeapSnapshot(String(o.snapshot)); } catch (err) { snapshot = `error: ${err.message}`; } } // (by-constructor diffs)
  return { snapshot, heap: mu.heapUsed, rss: mu.rss, external: mu.external, arrayBuffers: mu.arrayBuffers, handles, children, res, timers: probe?.liveBy?.() || null,
    ipc: { total: ipcN, multi, invoke: ipcMain._invokeHandlers?.size ?? null }, listeners, procs, contents: webContents.getAllWebContents().length, windows: BrowserWindow.getAllWindows().length };
}

// (round 44, idlecpu; tests only) every process' CPU time (seconds since it started), Chromium's idle wakeups / s since the
// last call, and on Linux each process' context switches over all its threads (/proc: wakeups, counted by the kernel);
// which page / frame runs in which process; the store threads' busy time (event loop utilization)
function metrics() {
  const { app, webContents } = require('electron');
  const fs = require('fs');
  const switches = (pid) => {
    if (process.platform !== 'linux') return null;
    let n = 0;
    try { for (const tid of fs.readdirSync(`/proc/${pid}/task`)) { try { const s = fs.readFileSync(`/proc/${pid}/task/${tid}/status`, 'utf8'); n += Number(/voluntary_ctxt_switches:\s+(\d+)/.exec(s)?.[1] || 0) + Number(/nonvoluntary_ctxt_switches:\s+(\d+)/.exec(s)?.[1] || 0); } catch { /* thread gone */ } } } catch { return null; }
    return n;
  };
  const procs = app.getAppMetrics().map((m) => ({ pid: m.pid, type: m.type, name: m.name || m.serviceName || '', cpuS: m.cpu?.cumulativeCPUUsage ?? null, pct: m.cpu?.percentCPUUsage ?? null, wake: m.cpu?.idleWakeupsPerSecond ?? null, ctx: switches(m.pid), mem: m.memory?.workingSetSize ?? null })); // (round 75, labload75: mem = working set KB, the GPU process' for dev/checks/labload75.js)
  const pages = [];
  for (const wc of webContents.getAllWebContents()) {
    try {
      pages.push({ id: wc.id, type: wc.getType(), url: wc.getURL().slice(0, 160), pid: wc.getOSProcessId() });
      for (const f of wc.mainFrame?.framesInSubtree || []) if (f !== wc.mainFrame) pages.push({ id: wc.id, type: 'frame', url: String(f.url || '').slice(0, 160), pid: f.osProcessId, name: f.name || '' });
    } catch { /* closing */ }
  }
  let threads = null; try { threads = require('./store')._threads?.() || null; } catch { /* none */ }
  return { at: Date.now(), mainCpu: process.cpuUsage(), procs, pages, threads };
}

module.exports = { register, hold, during, turn, download, quiet, quietNow: () => quietOn, every: (id, ms, fn, o) => sched.every(id, ms, fn, o), stop: (id) => sched.stop(id), state: snapshot, policy: () => Core.policy(st),
  onState: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, wokeAt: () => st.wokeAt, WAKE: Core.WAKE, _test: { blocker, sched, testHook, probe } };
