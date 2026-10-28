// Main-process hang probe (round 65, mainhang65; TESTS ONLY: loaded by powerwisemain.js when dev/smoke.js runs the app
// with HEARTH_LOOPLAG set, never in the owner's app). When the main process is busy, every IPC call of the window waits:
// the whole app "hangs". This measures it and says what did it:
//   · the event loop's delay (perf_hooks monitorEventLoopDelay, 10 ms resolution): p50 / p99 / max since the last take
//   · long blocks: a sampling CPU profile of the main thread (inspector, 1 ms), cut into busy stretches; each stretch
//     ≥ 30 ms is listed with where it started and its heaviest functions (self time)
//   · every fs.*Sync call (count, time, by call site) and, with HEARTH_SLOWFS_US, each one made that much slower: a
//     Windows disk with Defender scanning (one stat ≈ 0.1–0.3 ms, a small read ≈ 0.3–1 ms, against µs on Linux' tmpfs)
//   · IPC: handled / received messages per channel (and their synchronous time), messages sent to pages per channel
//   HEARTH_LOOPLAG=1 (histogram + fs + ipc) · =prof (also the CPU profile)
// (round 78, winperf78) also counted: every process started (child_process, by program and call site, with the time
// the start itself held the thread), every async fs call (fs.promises and the callback API, by call site) and fs.watch.
// The Windows simulation knob HEARTH_WINSIM=1 makes this Linux box cost like the owner's PC with Defender (each part
// can be set alone; numbers from Windows 11 + Defender on a desktop, the low end of what was reported):
//   HEARTH_SLOWFS_US (150)     each fs.*Sync call that much slower (on the main thread: it stalls everything)
//   HEARTH_SPAWN_MS (40)       each process start holds the main thread that long (CreateProcess + the scan of the
//                              program run synchronously in libuv's uv_spawn on Windows)
//   HEARTH_SPAWN_LAT_MS (120)  each child answers that much later (its own start: DLL loads, the console host)
//   HEARTH_PS_LAT_MS (500)     PowerShell answers that much later again (the .NET runtime + its modules)
//   HEARTH_SLOWFS_ASYNC_MS (1) each async open / read / write / stat answers that much later (off the main thread)
const { monitorEventLoopDelay, performance } = require('perf_hooks');

const MODE = String(process.env.HEARTH_LOOPLAG || '');
const SIM = process.env.HEARTH_WINSIM === '1';
const knob = (name, simValue) => Number(process.env[name] ?? (SIM ? simValue : 0)) || 0;
const SLOW_US = knob('HEARTH_SLOWFS_US', 150);
const SPAWN_MS = knob('HEARTH_SPAWN_MS', 40);
const SPAWN_LAT_MS = knob('HEARTH_SPAWN_LAT_MS', 120);
const PS_LAT_MS = knob('HEARTH_PS_LAT_MS', 500);
const ASYNC_MS = knob('HEARTH_SLOWFS_ASYNC_MS', 1);
const P = { since: performance.now(), fs: new Map(), ipc: new Map(), sends: new Map(), profile: null, spawns: new Map(), fsAsync: new Map(), watch: new Map(), spawnLog: [], simMs: 0 };
const h = monitorEventLoopDelay({ resolution: 10 });
h.enable();

const site = (skip, n = 2) => {
  const o = {}; const lim = Error.stackTraceLimit; Error.stackTraceLimit = 8 + n * 2;
  Error.captureStackTrace(o, skip); Error.stackTraceLimit = lim;
  const lines = String(o.stack || '').split('\n').slice(1).map((l) => l.trim()).filter((l) => !/mainlag-probe\.js|node:|\(<anonymous>\)$/.test(l));
  const f = (l) => (l || '?').replace(/^at\s+/, '').replace(/\(?(?:file:\/\/)?[^()]*[\\/]([^\\/]+\.js:\d+):\d+\)?/, '$1').slice(0, 80);
  return lines.slice(0, n).map(f).join(' < ');
};
const add = (map, key, ms) => { const e = map.get(key) || { n: 0, ms: 0 }; e.n += 1; e.ms += ms; map.set(key, e); };
// (round 78) the simulated Windows costs spent, so a stall can be told apart from the app's own work
const spin = (until) => { const a = performance.now(); while (performance.now() < until) { /* the slow disk */ } P.simMs += Math.max(0, performance.now() - a); };

// ---------- fs.*Sync ----------
const fs = require('fs');
for (const name of Object.keys(fs)) {
  if (!/Sync$/.test(name) || typeof fs[name] !== 'function') continue;
  const orig = fs[name];
  const wrapped = function (...a) {
    const t0 = performance.now();
    try { return orig.apply(this, a); } finally {
      if (SLOW_US) spin(t0 + SLOW_US / 1000);
      add(P.fs, `${name} ${site(wrapped)}`, performance.now() - t0);
    }
  };
  Object.defineProperty(wrapped, 'name', { value: name });
  fs[name] = wrapped;
}

// ---------- (round 78, winperf78) async fs: fs.promises and the callback API, counted by call site ----------
// (calls Node makes inside one of these, e.g. readFile's own open, are not exports: each counts once)
const ASYNC_FS = ['access', 'appendFile', 'chmod', 'copyFile', 'cp', 'lstat', 'mkdir', 'mkdtemp', 'open', 'opendir', 'readdir', 'readFile', 'readlink', 'realpath', 'rename', 'rm', 'rmdir', 'stat', 'statfs', 'symlink', 'truncate', 'unlink', 'utimes', 'writeFile', 'exists'];
const SLOW_ASYNC = /^(open|readFile|writeFile|appendFile|stat|lstat|copyFile|readdir|rename)$/;
const later = (ms) => new Promise((r) => setTimeout(r, ms));
for (const name of ASYNC_FS) {
  const pr = fs.promises[name];
  if (typeof pr === 'function') {
    const wrapped = async function (...a) {
      add(P.fsAsync, `${name} ${site(wrapped)}`, 0);
      const v = await pr.apply(this, a);
      if (ASYNC_MS && SLOW_ASYNC.test(name)) await later(ASYNC_MS);
      return v;
    };
    Object.defineProperty(wrapped, 'name', { value: name });
    fs.promises[name] = wrapped;
  }
  const cb = fs[name];
  if (typeof cb === 'function') {
    const wrapped = function (...a) {
      add(P.fsAsync, `${name} ${site(wrapped)}`, 0);
      const done = a[a.length - 1];
      if (ASYNC_MS && SLOW_ASYNC.test(name) && typeof done === 'function') a[a.length - 1] = function (...r) { setTimeout(() => done.apply(this, r), ASYNC_MS); };
      return cb.apply(this, a);
    };
    Object.defineProperty(wrapped, 'name', { value: name });
    for (const k of Object.getOwnPropertySymbols(cb)) wrapped[k] = cb[k]; // (util.promisify.custom of fs.exists / realpath.native)
    if (cb.native) wrapped.native = cb.native;
    fs[name] = wrapped;
  }
}
for (const name of ['watch', 'watchFile']) {
  const orig = fs[name];
  const wrapped = function (file, o, ...rest) {
    const rec = Boolean(o && typeof o === 'object' && o.recursive);
    add(P.watch, `${name}${rec ? ' recursive' : ''} ${site(wrapped)}`, 0);
    return orig.call(this, file, o, ...rest);
  };
  fs[name] = wrapped;
}

// ---------- (round 78, winperf78) processes started: child_process, by program and call site ----------
// spawn / execFile / exec / fork (+ the Sync ones). exec calls the exported execFile: counted once (inside).
// With the Windows knobs, a start holds the thread HEARTH_SPAWN_MS and the child's exit / close (so execFile's
// callback and promisified forms) comes HEARTH_SPAWN_LAT_MS later (+ HEARTH_PS_LAT_MS for PowerShell).
const cp = require('child_process');
const util = require('util');
let inside = 0;
const progOf = (f) => String(f || '?').split(/[\\/]/).pop().replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
const isPs = (prog) => /^(powershell|pwsh)$/.test(prog);
for (const name of ['spawn', 'execFile', 'exec', 'fork', 'spawnSync', 'execFileSync', 'execSync']) {
  const orig = cp[name];
  if (typeof orig !== 'function') continue;
  const sync = /Sync$/.test(name);
  const wrapped = function (...a) {
    if (inside) return orig.apply(this, a);
    const file = name === 'exec' || name === 'execSync' ? String(a[0] || '').trim().split(/\s+/)[0] : name === 'fork' ? 'node' : a[0];
    const prog = progOf(file);
    const t0 = performance.now();
    inside += 1;
    let child;
    try {
      if (SPAWN_MS) spin(t0 + SPAWN_MS);
      if (sync && (SPAWN_LAT_MS || (PS_LAT_MS && isPs(prog)))) spin(performance.now() + SPAWN_LAT_MS + (isPs(prog) ? PS_LAT_MS : 0));
      child = orig.apply(this, a);
    } finally {
      inside -= 1;
      const ms = performance.now() - t0;
      add(P.spawns, `${prog} ${site(wrapped, 4)}`, ms);
      P.spawnLog.push({ prog, how: name, at: Math.round(performance.now()), args: (Array.isArray(a[1]) ? a[1] : []).slice(0, 3).map((x) => String(x).slice(0, 40)) });
      if (P.spawnLog.length > 200) P.spawnLog.shift();
    }
    const lat = SPAWN_LAT_MS + (isPs(prog) ? PS_LAT_MS : 0);
    if (!sync && lat && child && typeof child.emit === 'function') {
      const emit = child.emit;
      child.emit = function (ev, ...r) { if (ev === 'exit' || ev === 'close') { setTimeout(() => emit.call(this, ev, ...r), lat); return true; } return emit.call(this, ev, ...r); };
    }
    return child;
  };
  Object.defineProperty(wrapped, 'name', { value: name });
  // execFile / exec promisified: through the wrapper (counted), resolving { stdout, stderr } as Node's own does
  if (name === 'execFile' || name === 'exec') {
    wrapped[util.promisify.custom] = (...a) => {
      let child;
      const p = new Promise((res, rej) => { child = wrapped(...a, (err, stdout, stderr) => (err ? rej(Object.assign(err, { stdout, stderr })) : res({ stdout, stderr }))); });
      p.child = child;
      return p;
    };
  }
  cp[name] = wrapped;
}

// ---------- IPC ----------
try {
  const { ipcMain, app } = require('electron');
  const wrap = (kind, ch, fn) => function (...a) {
    const t0 = performance.now();
    let r;
    try { r = fn.apply(this, a); } finally { add(P.ipc, `${kind} ${ch}`, performance.now() - t0); }
    return r;
  };
  const hd = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (ch, fn) => hd(ch, wrap('handle', ch, fn));
  const on = ipcMain.on.bind(ipcMain);
  ipcMain.on = (ch, fn) => on(ch, wrap('on', ch, fn));
  app.on('web-contents-created', (_e, wc) => {
    const send = wc.send;
    wc.send = function (ch, ...a) { add(P.sends, `${wc.getType()} ${ch}`, 0); return send.call(this, ch, ...a); };
  });
} catch { /* no Electron */ }

// ---------- the CPU profile ----------
let session = null;
const post = (m, p) => new Promise((res, rej) => session.post(m, p || {}, (err, r) => (err ? rej(err) : res(r))));
async function startProfile() {
  if (MODE !== 'prof') return;
  try {
    const inspector = require('inspector');
    session = session || new inspector.Session();
    try { session.connect(); } catch { /* connected */ }
    await post('Profiler.enable');
    await post('Profiler.setSamplingInterval', { interval: 1000 });
    await post('Profiler.start');
    P.profAt = Date.now(); // (round 70, bigprofile70) the profile's start as a wall-clock time: blocks → when they ended
  } catch (err) { P.profileError = err.message; }
}
startProfile();
// busy stretches: consecutive samples not in (idle) / (program) / (garbage collector counted as busy), split at gaps
function blocks(profile, min = 30) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const label = (n) => { const cf = n.callFrame; const file = String(cf.url || '').split(/[\\/]/).pop(); return `${cf.functionName || '(anon)'} ${file ? `${file}:${cf.lineNumber + 1}` : ''}`.trim(); };
  const stackOf = (id) => { const out = []; let x = id; while (x != null) { const n = nodes.get(x); if (!n) break; const l = label(n); if (!/^\(root\)/.test(l)) out.push(l); x = parent.get(x); } return out; };
  const idle = (id) => /^\((idle|program)\)$/.test(nodes.get(id)?.callFrame.functionName || '');
  const out = []; let cur = null; let t = profile.startTime;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i];
    const id = profile.samples[i];
    if (idle(id)) { if (cur) { out.push(cur); cur = null; } continue; }
    if (!cur) cur = { start: t, end: t, self: new Map(), first: null };
    const dt = profile.timeDeltas[i + 1] ?? 1000;
    cur.end = t + dt;
    const own = label(nodes.get(id));
    cur.self.set(own, (cur.self.get(own) || 0) + dt);
    if (!cur.first) { const s = stackOf(id).filter((l) => /\.js:/.test(l)); cur.first = s.slice(-3).reverse().join(' > '); }
    // the app's own frames: the deepest .js frame of each sample, for "where"
    const app = stackOf(id).find((l) => /\.js:\d+/.test(l) && !/node:|electron\/js2c/.test(l)) || own;
    cur.app = cur.app || new Map(); cur.app.set(app, (cur.app.get(app) || 0) + dt);
  }
  if (cur) out.push(cur);
  const t0 = profile.startTime;
  // (round 70, bigprofile70) the app's lines over the whole stretch measured, busy or not long (where the time went)
  const appAll = new Map(); for (const b of out) for (const [k, v] of b.app || []) appAll.set(k, (appAll.get(k) || 0) + v);
  blocks.appTop = [...appAll].sort((a, c) => c[1] - a[1]).slice(0, 15).map(([k, v]) => `${Math.round(v / 1000)}ms ${k}`);
  return out.map((b) => ({ atMs: Math.round((b.start - t0) / 1000), ms: Math.round((b.end - b.start) / 1000), first: b.first,
    top: [...b.self].sort((a, c) => c[1] - a[1]).slice(0, 4).map(([k, v]) => `${Math.round(v / 1000)}ms ${k}`),
    app: [...(b.app || [])].sort((a, c) => c[1] - a[1]).slice(0, 4).map(([k, v]) => `${Math.round(v / 1000)}ms ${k}`) }))
    .filter((b) => b.ms >= min).sort((a, b) => b.ms - a.ms);
}

const ms = (ns) => Math.round(ns / 1e4) / 100;
async function take({ reset = true, label = '' } = {}) {
  const secs = (performance.now() - P.since) / 1000;
  const top = (map, n = 14) => [...map].sort((a, b) => b[1].ms - a[1].ms || b[1].n - a[1].n).slice(0, n).map(([k, v]) => ({ k, n: v.n, ms: Math.round(v.ms * 10) / 10 }));
  const out = { label, seconds: Math.round(secs * 10) / 10, slowFsUs: SLOW_US, procStart: Math.round(Date.now() - process.uptime() * 1000), profAt: P.profAt || 0,
    delay: { p50: ms(h.percentile(50)), p90: ms(h.percentile(90)), p99: ms(h.percentile(99)), max: ms(h.max), mean: ms(h.mean), count: h.count },
    // (round 78) node: calls with no app line behind them (module loading, Node's own recursive fs.watch on Linux)
    fsSync: { n: [...P.fs.values()].reduce((a, v) => a + v.n, 0), ms: Math.round([...P.fs.values()].reduce((a, v) => a + v.ms, 0)), node: [...P.fs].filter(([k]) => !k.includes(' ') || /^\S+ $/.test(k)).reduce((a, [, v]) => a + v.n, 0), top: top(P.fs) },
    ipc: { n: [...P.ipc.values()].reduce((a, v) => a + v.n, 0), top: top(P.ipc, 12), busiest: [...P.ipc].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) => `${Math.round(v.n / secs * 10) / 10}/s ${k}`) },
    sends: [...P.sends].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) => `${Math.round(v.n / secs * 10) / 10}/s ${k}`),
    // (round 78, winperf78) processes started (blockMs: the thread held by the starts themselves), async fs, watches
    sim: { winsim: SIM, spawnMs: SPAWN_MS, spawnLatMs: SPAWN_LAT_MS, psLatMs: PS_LAT_MS, asyncMs: ASYNC_MS, spentMs: Math.round(P.simMs) },
    spawns: { n: [...P.spawns.values()].reduce((a, v) => a + v.n, 0), blockMs: Math.round([...P.spawns.values()].reduce((a, v) => a + v.ms, 0)),
      ps: [...P.spawns].filter(([k]) => isPs(k.split(' ')[0])).reduce((a, [, v]) => a + v.n, 0), top: top(P.spawns, 12),
      byProg: Object.entries([...P.spawns].reduce((o, [k, v]) => { const g = k.split(' ')[0]; o[g] = (o[g] || 0) + v.n; return o; }, {})).sort((a, b) => b[1] - a[1]) },
    fsAsync: { n: [...P.fsAsync.values()].reduce((a, v) => a + v.n, 0), top: [...P.fsAsync].sort((a, b) => b[1].n - a[1].n).slice(0, 14).map(([k, v]) => ({ k, n: v.n })) },
    watch: { n: [...P.watch.values()].reduce((a, v) => a + v.n, 0), top: [...P.watch].map(([k, v]) => ({ k, n: v.n })) } };
  if (session && MODE === 'prof') {
    try { const { profile } = await post('Profiler.stop'); out.blocks = blocks(profile).slice(0, 12); out.appTop = blocks.appTop; } catch (err) { out.profileError = err.message; }
    if (reset) await startProfile();
  }
  if (reset) { h.reset(); P.fs.clear(); P.ipc.clear(); P.sends.clear(); P.spawns.clear(); P.fsAsync.clear(); P.watch.clear(); P.simMs = 0; P.since = performance.now(); }
  return out;
}

module.exports = { take, histogram: h };
