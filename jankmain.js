// Jank watch, main side (round 20, jankwatch). What the window can't see about its own smoothness:
//   lag     how late the main process's event loop runs (perf_hooks.monitorEventLoopDelay, sampled every 100 ms, only
//           while the hub window is on screen and the computer awake: bgmain tells us); take() hands the numbers since
//           the last take (p50 / p99 / max ms) and starts over
//   events  the GPU process crashing, a window's page crashing, a window not answering (and answering again)
//   busy    the window says when the owner is typing / dragging / scrolling (one message per change); syncmain holds
//           a pass that would start meanwhile (setHold below), so nothing heavy lands mid-gesture
//   lines   sourceCharPosition → line for the report's culprits (files of the app folder only)
//   profile which code made the long frames: Hearth's pages are file:// pages, and Chromium leaves scripts from file
//           URLs out of the Long Animation Frames' attribution, so the window can count long frames but can't name
//           them. When long frames keep coming (jank.js asks, a few times a day at most) or /smooth profile asks, the
//           window's own debugger samples its JS for a few seconds (1 ms sampling, ~1–3 % CPU meanwhile), here in the
//           main process each long stretch is named by the app line it spent the most time under and the handler it
//           started from; then the debugger detaches. Never while DevTools are attached.
//   info    the display's refresh rate and the GPU's name (for the report and "frames dropped")
//   recent  (round 67, slowbutton67) the last minute for 🐢 That was slow, from what already happens (no timer, no
//           profiler): IPC handlers whose synchronous part ran ≥ 100 ms, by channel (watchIpc wraps ipcMain.handle /
//           on from the top of main.js: two clock reads per call); the window's "busy" messages arriving late (each
//           carries its send time: a message ≥ 250 ms late means this process was stuck that long); background jobs
//           starting (a cloud sync pass); GPU / page events; the loop-lag sampler's worst since the last save
// Nothing here is sent anywhere: the window keeps its own log (kv/jank-log.json, a local-only file for sync).
// Required from main.js: watchIpc(ipcMain) first, register(ipcMain, bgmain, getWin) once.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

let hist = null; let histOn = false; let since = Date.now();
let busy = false; let busyAt = 0; let held = 0;
const events = []; // { t, kind: 'gpu' | 'page' | 'hang' | 'unhang', what }
function note(kind, what) {
  const ev = { t: Date.now(), kind, what: String(what || '').slice(0, 160) };
  events.push(ev);
  if (events.length > 50) events.shift();
  keepR(R.ev, ev);
}

// ---------- the last minute (round 67, slowbutton67) ----------
const R = { slow: [], late: [], jobs: [], ev: [] }; // rings of { t (epoch ms), ms?, what }
let takenAt = 0; // stalls after this are handed to the window's daily count at the next take()
function keepR(list, x, max = 30) { list.push(x); if (list.length > max) list.shift(); }
const SLOW_IPC = 100; const LATE = 250;
// every IPC handler registered after this is timed (its synchronous part: an async handler's awaits don't count)
const wrapped = new WeakMap();
function watchIpc(ipcMain) {
  if (!ipcMain || ipcMain.__jankTimed) return;
  ipcMain.__jankTimed = true;
  const { performance } = require('perf_hooks');
  // (round 68, bugbutton68) a handler that throws (or, for ipcMain.handle, rejects) is handed to 🪲 Something broke
  // (bugmain.js, required only then); Electron still answers the window with the error, as before
  const failed = (ch, err) => { try { require('./bugmain').ipcFailed(ch, err); } catch { /* tests without it */ } };
  const timed = (ch, fn, invoke) => {
    if (typeof fn !== 'function') return fn;
    const w = function timedIpc(...a) {
      const t0 = performance.now();
      let r;
      try { r = fn.apply(this, a); } catch (err) { failed(ch, err); throw err; } finally {
        const d = performance.now() - t0;
        if (d >= SLOW_IPC) keepR(R.slow, { t: Date.now() - Math.round(d), ms: Math.round(d), what: String(ch).slice(0, 80) });
      }
      if (invoke && r && typeof r.then === 'function') r.then(null, (err) => failed(ch, err));
      return r;
    };
    wrapped.set(fn, w);
    return w;
  };
  if (typeof ipcMain.handle !== 'function' || typeof ipcMain.on !== 'function') return;
  const handle = ipcMain.handle.bind(ipcMain); const on = ipcMain.on.bind(ipcMain);
  ipcMain.handle = (ch, fn) => handle(ch, timed(ch, fn, true));
  ipcMain.on = (ch, fn) => on(ch, timed(ch, fn));
  ipcMain.addListener = ipcMain.on;
  if (typeof ipcMain.removeListener === 'function') {
    const off = ipcMain.removeListener.bind(ipcMain);
    ipcMain.removeListener = (ch, fn) => off(ch, wrapped.get(fn) || fn);
    ipcMain.off = ipcMain.removeListener;
  }
}
// a background job of this process starting (named in the card when a freeze lands near it)
function mark(what) { keepR(R.jobs, { t: Date.now(), what: String(what || '').slice(0, 80) }); }
// freezes of this process since `from` (IPC handlers that ran long + late "busy" messages)
const stallsSince = (from) => [...R.slow, ...R.late].filter((x) => x.t + x.ms > from && x.ms >= 500).map((x) => ({ t: x.t, ms: x.ms }));
function recent(win = 35e3) {
  const from = Date.now() - Math.max(1000, Math.min(120e3, Number(win) || 35e3));
  const pick = (list) => list.filter((x) => x.t + (x.ms || 0) >= from).map((x) => ({ ...x }));
  const lag = hist && histOn && hist.count ? { max: ms(hist.max), p99: ms(hist.percentile(99)), since } : null;
  return { slow: pick(R.slow), late: pick(R.late), jobs: pick(R.jobs), events: pick(R.ev), lag, stalls: stallsSince(from) };
}
function setHist(on) {
  try {
    if (!hist) hist = require('perf_hooks').monitorEventLoopDelay({ resolution: RES });
    if (on && !histOn) hist.enable(); else if (!on && histOn) hist.disable();
    histOn = on;
  } catch { hist = null; }
}
const RES = 100; // the sampler's period: each value it records is the period plus how late it ran
const ms = (ns) => Math.max(0, Math.round((Number(ns) || 0) / 1e5) / 10 - RES); // ns → ms late, 0.1 precision
function take() {
  const lag = hist && hist.count ? { p50: ms(hist.percentile(50)), p99: ms(hist.percentile(99)), max: ms(hist.max), n: hist.count, from: since } : null;
  try { hist?.reset(); } catch { /* fine */ }
  since = Date.now();
  const ev = events.splice(0, events.length);
  const h = held; held = 0;
  const stalls = stallsSince(takenAt); takenAt = Date.now();
  return { lag, events: ev, held: h, stalls };
}
// is the owner mid-gesture? (the window's word for it; a message lost to a reload can't hold work for more than 5 s)
const ownerBusy = () => busy && Date.now() - busyAt < 5000;

// "file.js" + character positions → line numbers (only files inside the app folder)
const lineCache = new Map(); // file → [offsets of each line start]
function lineOf(rel, pos) {
  const file = path.join(__dirname, String(rel || '').replace(/^\/+/, ''));
  if (!file.startsWith(__dirname + path.sep) || !/\.(js|html|mjs)$/i.test(file) || !(pos >= 0)) return null;
  let starts = lineCache.get(file);
  if (!starts) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
    starts = [0];
    for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
    if (lineCache.size > 40) lineCache.clear();
    lineCache.set(file, starts);
  }
  let lo = 0; let hi = starts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
  return lo + 1;
}

// ---------- profiles: name the code behind long frames ----------
const BASE = `${require('url').pathToFileURL(__dirname).href}/`;
const relUrl = (u) => { const s = String(u || ''); if (s.startsWith(BASE)) return decodeURIComponent(s.slice(BASE.length)); return s.replace(/^[a-z]+:\/\/(\/)?/i, '').split('/').slice(-2).join('/'); };
const NATIVE = new Set(['(program)', '(garbage collector)', '(root)', '(idle)']);
// a V8 CPU profile → its busy stretches ≥ 50 ms, each named by the app line it spent the most time under
function stretches(p) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const near = new Map(); // node → [nearest frame with a script URL, root-most frame with one]
  const frames = (id) => {
    let r = near.get(id);
    if (r) return r;
    let first = null; let last = null;
    for (let cur = id; cur != null; cur = parent.get(cur)) { const n = byId.get(cur); if (n?.callFrame?.url) { if (!first) first = n; last = n; } }
    r = [first, last]; near.set(id, r);
    return r;
  };
  const out = []; let cur = null; let t = p.startTime;
  const close = () => {
    if (cur && (cur.end - cur.start) / 1000 >= 50) {
      const top = [...cur.self.values()].sort((a, b) => b.ms - a.ms)[0];
      const entry = [...cur.entry.values()].sort((a, b) => b.ms - a.ms)[0];
      out.push({ ms: Math.round((cur.end - cur.start) / 1000), js: Math.round(cur.js), prog: Math.round(cur.prog), gc: Math.round(cur.gc), at: Math.round((cur.start - p.startTime) / 1000),
        where: top ? { f: top.f, line: top.line, fn: top.fn, ms: Math.round(top.ms) } : null, entry: entry ? { f: entry.f, line: entry.line, fn: entry.fn } : null });
    }
    cur = null;
  };
  for (let i = 0; i < p.samples.length; i += 1) {
    t += p.timeDeltas[i] || 0;
    const w = (p.timeDeltas[i + 1] ?? 1000) / 1000; // ms this sample stands for
    const n = byId.get(p.samples[i]); const name = n?.callFrame?.functionName || '';
    if (name === '(idle)' || !n) { close(); continue; }
    if (cur && t - cur.end > 4000) close(); // a gap of 4 ms: a new stretch
    if (!cur) cur = { start: t, end: t, self: new Map(), entry: new Map(), js: 0, prog: 0, gc: 0 };
    cur.end = t + w * 1000;
    if (name === '(garbage collector)') { cur.gc += w; continue; }
    if (NATIVE.has(name)) { cur.prog += w; continue; }
    cur.js += w;
    const [first, last] = frames(n.id);
    const add = (map, fr) => { if (!fr) return; const c = fr.callFrame; const k = `${c.url}|${c.lineNumber}|${c.functionName}`; const e = map.get(k) || { f: relUrl(c.url), line: c.lineNumber + 1, fn: c.functionName || '', ms: 0 }; e.ms += w; map.set(k, e); };
    add(cur.self, first); add(cur.entry, last);
  }
  close();
  return out;
}
let profiling = null; let lastProfile = 0;
function profile(getWin, msLong = 8000) {
  if (profiling) return profiling;
  const win = getWin?.(); const wc = win && !win.isDestroyed() ? win.webContents : null;
  if (!wc) return Promise.resolve({ error: 'no window' });
  if (wc.isDevToolsOpened?.()) return Promise.resolve({ error: 'DevTools are open' });
  const dur = Math.max(1000, Math.min(20000, Number(msLong) || 8000));
  profiling = (async () => {
    const dbg = wc.debugger; let mine = false;
    try {
      if (dbg.isAttached()) return { error: 'a debugger is attached' };
      dbg.attach('1.3'); mine = true;
      await dbg.sendCommand('Profiler.enable');
      await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 1000 });
      await dbg.sendCommand('Profiler.start');
      await new Promise((r) => setTimeout(r, dur));
      const { profile: p } = await dbg.sendCommand('Profiler.stop');
      await dbg.sendCommand('Profiler.disable').catch(() => {});
      lastProfile = Date.now();
      return { ms: dur, stretches: stretches(p).slice(0, 40) };
    } catch (err) { return { error: err.message }; } finally { if (mine) { try { dbg.detach(); } catch { /* gone */ } } }
  })().finally(() => { profiling = null; });
  return profiling;
}

let gpuName = null;
async function info() {
  let hz = 60;
  try { hz = Math.round(require('electron').screen.getPrimaryDisplay().displayFrequency) || 60; } catch { /* default */ }
  if (gpuName == null) {
    gpuName = '';
    try {
      const g = await app.getGPUInfo('complete');
      gpuName = String(g?.auxAttributes?.glRenderer || g?.gpuDevice?.find((d) => d.active)?.deviceString || '').replace(/\s+/g, ' ').slice(0, 120);
    } catch { /* unknown */ }
  }
  return { hz, gpu: gpuName, platform: process.platform, arch: process.arch, electron: process.versions.electron, version: app.getVersion(),
    test: Boolean(process.env.HEARTH_TEST_SAVE_DIR) }; // (a test copy: no Light mode suggestion from a software GPU)
}

function register(ipcMain, bgmain, getWin) {
  app.on('child-process-gone', (_e, d) => { if (d?.type === 'GPU') note('gpu', `GPU process ${d.reason}${d.exitCode ? ` (code ${d.exitCode})` : ''}`); });
  app.on('render-process-gone', (_e, wc, d) => note('page', `${wc?.getTitle?.() || 'a window'}: page ${d?.reason || 'gone'}`));
  const watchWin = (w) => {
    w.on('unresponsive', () => note('hang', `${w.getTitle() || 'a window'} stopped answering`));
    w.on('responsive', () => note('unhang', `${w.getTitle() || 'a window'} answers again`));
  };
  // (round 30 fix) registered after the main window is made (round 29, fastboot): watch the windows already open too
  for (const w of BrowserWindow?.getAllWindows?.() || []) watchWin(w);
  app.on('browser-window-created', (_e, w) => watchWin(w));
  // the loop-lag sampler runs only while somebody can be looking
  const pace = (st) => setHist(!st.hidden && !st.asleep && !off);
  let off = false;
  bgmain?.subscribe?.(pace);
  if (!bgmain) setHist(true);
  ipcMain.on('jank:busy', (_e, b, sentAt) => {
    busy = Boolean(b); busyAt = Date.now();
    // (round 67) sent at `sentAt` by the window, taken now: the gap is how long this process was stuck (≤ 1 min: a
    // longer one is the computer sleeping)
    const late = busyAt - Number(sentAt);
    if (late >= LATE && late < 60e3) keepR(R.late, { t: Number(sentAt), ms: late, what: 'the window waited for the main process' });
  });
  ipcMain.handle('jank:recent', (_e, win) => recent(win));
  // test copies only: freeze this process on purpose (dev/checks/slowbutton67.js)
  if (process.env.HEARTH_TEST_SAVE_DIR) ipcMain.handle('jank:test-stall', (_e, msLong) => { const end = Date.now() + Math.max(0, Math.min(5000, Number(msLong) || 0)); while (Date.now() < end) { /* frozen on purpose */ } return true; });
  ipcMain.on('jank:off', (_e, o) => { off = Boolean(o); pace(bgmain?.state?.() || {}); });
  ipcMain.handle('jank:take', () => take());
  ipcMain.handle('jank:info', () => info());
  ipcMain.handle('jank:profile', (_e, msLong) => profile(getWin, msLong));
  ipcMain.handle('jank:lines', (_e, list) => (Array.isArray(list) ? list.slice(0, 40).map(([f, p]) => lineOf(f, p)) : []));
}
// syncmain asks before a pass: hold it while the owner is mid-gesture (counted for the report)
function hold() { const b = ownerBusy(); if (b) held += 1; else mark('a cloud sync pass'); return b; }

module.exports = { register, hold, busy: ownerBusy, watchIpc, mark, _test: { note, take, lineOf, stretches, recent, R, lastProfile: () => lastProfile } };
