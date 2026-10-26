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
const { monitorEventLoopDelay, performance } = require('perf_hooks');

const MODE = String(process.env.HEARTH_LOOPLAG || '');
const SLOW_US = Number(process.env.HEARTH_SLOWFS_US || 0);
const P = { since: performance.now(), fs: new Map(), ipc: new Map(), sends: new Map(), profile: null };
const h = monitorEventLoopDelay({ resolution: 10 });
h.enable();

const site = (skip) => {
  const o = {}; const lim = Error.stackTraceLimit; Error.stackTraceLimit = 8;
  Error.captureStackTrace(o, skip); Error.stackTraceLimit = lim;
  const lines = String(o.stack || '').split('\n').slice(1).map((l) => l.trim()).filter((l) => !/mainlag-probe\.js|node:/.test(l));
  const f = (l) => (l || '?').replace(/^at\s+/, '').replace(/\(?(?:file:\/\/)?[^()]*[\\/]([^\\/]+\.js:\d+):\d+\)?/, '$1').slice(0, 80);
  return lines.slice(0, 2).map(f).join(' < ');
};
const add = (map, key, ms) => { const e = map.get(key) || { n: 0, ms: 0 }; e.n += 1; e.ms += ms; map.set(key, e); };
const spin = (until) => { while (performance.now() < until) { /* the slow disk */ } };

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
    fsSync: { n: [...P.fs.values()].reduce((a, v) => a + v.n, 0), ms: Math.round([...P.fs.values()].reduce((a, v) => a + v.ms, 0)), top: top(P.fs) },
    ipc: { n: [...P.ipc.values()].reduce((a, v) => a + v.n, 0), top: top(P.ipc, 12), busiest: [...P.ipc].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) => `${Math.round(v.n / secs * 10) / 10}/s ${k}`) },
    sends: [...P.sends].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, v]) => `${Math.round(v.n / secs * 10) / 10}/s ${k}`) };
  if (session && MODE === 'prof') {
    try { const { profile } = await post('Profiler.stop'); out.blocks = blocks(profile).slice(0, 12); out.appTop = blocks.appTop; } catch (err) { out.profileError = err.message; }
    if (reset) await startProfile();
  }
  if (reset) { h.reset(); P.fs.clear(); P.ipc.clear(); P.sends.clear(); P.since = performance.now(); }
  return out;
}

module.exports = { take, histogram: h };
