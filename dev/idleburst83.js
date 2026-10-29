#!/usr/bin/env node
// (round 83, idleburst83) What Hearth does in the 30 s after its first picture, launch after launch, on the heavy
// profile (dev/bigprofile.js). perfguard82 found the main process at ≈ 17 % of a CPU through a 10 s "idle" in about
// half of the launches; this finds what runs then and proves it gone.
// Each launch (same app copy and Chromium profile, like the owner's next start) reports, from the first picture
// (the window on screen with its first frame: max(windowShown, ready-to-show), main-process clock):
//   · % of one CPU per process in 0–10 s, 10–20 s, 20–30 s (main = Electron's browser process, all its threads; the
//     window; utility; GPU), from the browser's own process list every 500 ms
//   · the main thread held ≥ 40 ms (dev/idleburst83-tick.js: when, how long) and the window's long tasks (≥ 50 ms)
//   · with --prof: sampling CPU profiles of the main thread (dev/boot-probe.js) and the window (CDP Profiler), the top
//     functions / files per 10 s window, and each main-thread busy stretch ≥ 20 ms named by its top function
// The first launch is a warm-up (caches, the sync first pass with --sync, the Lab marked as used lately so its warm
// preview page is made after each start, as for the owner; --no-lab: not); it isn't counted.
//   node dev/idleburst83.js [--app <dir>] [--data /tmp/hearth-bigprofile72] [--runs 10] [--prof] [--sync]
//        [--keep <dir>] [--json out.json] [--lock] [--span 30000] [--lazy] [--ab <base app dir>]
// --ab: that app (an exported copy of the base commit) and this one in turn, the same fixture and minutes.
// Summary per side: % of a CPU per 10 s window, the 2–12 s window (after the start), the worst main hold / window long task.
// --sync: sync switched on (a scratch cloud folder) in the warm-up launch, so every counted start has it on, as the
//   owner's does. --lock: each launch under flock /tmp/hearth-run.lock (other agents get turns in between).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const S = require('./cpuprof-sum');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const APP = path.resolve(opt('--app', path.join(__dirname, '..')));
const DATA = opt('--data', '/tmp/hearth-bigprofile72');
const RUNS = Number(opt('--runs', 10));
const PROF = args.includes('--prof');
const SYNC = args.includes('--sync');
const LOCK = args.includes('--lock');
const SPAN = Number(opt('--span', 30000));
const ELECTRON = process.env.ELECTRON || '/opt/hearth-electron/electron';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

function copyApp(app = APP, keep = opt('--keep')) {
  const dir = keep ? path.resolve(keep) : fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-ib83-'));
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const skip = new Set(['.git', 'data', 'electron', 'electron-mac', 'node_modules', 'dev']);
  for (const n of fs.readdirSync(app)) if (!skip.has(n)) fs.cpSync(path.join(app, n), path.join(dir, n), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pkg.name = 'hearth-ib83-test';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  const cfgPath = path.join(dir, 'config.json');
  for (const n of fs.readdirSync(DATA)) {
    if (n === 'config.json') fs.copyFileSync(path.join(DATA, n), cfgPath);
    else fs.cpSync(path.join(DATA, n), path.join(dir, 'data', n), { recursive: true });
  }
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.settings = { ...(cfg.settings || {}), hotkey: '', enginePaths: { claude: path.join(__dirname, 'fake-claude.js'), codex: path.join(__dirname, 'fake-codex.js') } };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  return dir;
}

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
  return { ws, send, evaluate };
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

async function launch(dir, userData, port, { warm = false, profDir = null } = {}) {
  const tag = Date.now();
  const probeOut = path.join(userData, `probe-${tag}.json`); const tickOut = path.join(userData, `tick-${tag}.json`);
  const mainProf = profDir ? path.join(profDir, 'main.cpuprofile') : null;
  const env = { ...process.env, NODE_OPTIONS: `--require ${path.join(__dirname, 'boot-probe.js')} --require ${path.join(__dirname, 'idleburst83-tick.js')}`, HEARTH_BOOT_PROBE: probeOut, HEARTH_IB_TICK: tickOut, HEARTH_IB_TICK_MS: String(SPAN + 20000), ...(mainProf ? { HEARTH_BOOT_CPUPROF: mainProf, HEARTH_BOOT_CPUPROF_MS: String(SPAN + 15000) } : {}) };
  const cmd = ['xvfb-run', '-a', '-s', '-screen 0 1600x1000x24', ELECTRON, dir, '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const child = spawn(cmd[0], cmd.slice(1), { stdio: 'ignore', detached: true, env });
  const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } try { execFileSync('pkill', ['-9', '-f', '--', `--user-data-dir=${userData}`]); /* (never the app path: it can be in this script's own command line) */ } catch { /* gone */ } };
  try {
    let browserUrl;
    for (let i = 0; i < 600 && !browserUrl; i++) { try { browserUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await wait(10); } }
    if (!browserUrl) throw new Error('no browser');
    const b = await cdp(browserUrl);
    let wsUrl;
    for (let i = 0; i < 600 && !wsUrl; i++) {
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && /index\.html/.test(t.url))?.webSocketDebuggerUrl; } catch { /* not up */ }
      if (!wsUrl) await wait(25);
    }
    if (!wsUrl) throw new Error('no window');
    const c = await cdp(wsUrl);
    await c.evaluate(`(() => { window.__ib = { longs: [] };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) __ib.longs.push([e.startTime, Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
      return 1; })()`).catch(() => null);
    let winProfAt = null;
    if (profDir) {
      await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 1000 });
      await c.send('Profiler.start'); winProfAt = Date.now();
    }
    // the first picture, on the main process's clock (the probe writes its marks as they happen)
    let probe = null; let fp = null;
    for (let i = 0; i < 1200; i++) {
      probe = readJson(probeOut);
      const M = probe?.marks || {};
      if (M.windowShown != null && M.readyToShow != null) { fp = Math.max(M.windowShown, M.readyToShow); break; }
      await wait(25);
    }
    if (fp == null) throw new Error('no first picture');
    const nowMain = () => Date.now() - probe.wall0;
    if (warm) {
      for (let i = 0; i < 600 && !(await c.evaluate("performance.getEntriesByName('hearth:ready').length > 0").catch(() => false)); i++) await wait(50);
      // the owner uses the Lab every day: its warm preview page is made after each start (tools/three-boot.js)
      if (!args.includes('--no-lab')) await c.evaluate("store.set('labboot.used', Date.now()); true").catch(() => null);
      if (SYNC) {
        const cloud = `${userData}-cloud`; fs.mkdirSync(cloud, { recursive: true });
        const st = await c.evaluate(`(async () => { await window.hub.sync.on({ root: ${JSON.stringify(cloud)} });
          for (let i = 0; i < 480; i++) { const x = await window.hub.sync.status(); if (['synced', 'conflict', 'pending'].includes(x?.state)) return x.state; await new Promise((r) => setTimeout(r, 500)); }
          return 'timeout'; })()`).catch((e) => `error ${e.message}`);
        console.log(`  warm-up: sync on → ${st}`);
      }
      await wait(8000);
    } else {
      // every process under the launch, from /proc every 500 ms (nothing asked of the app: its own CPU stays its own):
      // CPU ms per process (by Chromium type / utility sub-type) and, for the main process, per thread (by name)
      const series = [];
      const tick = () => { try { return procTree(child.pid); } catch { return null; } };
      while (nowMain() < fp + SPAN + 600) { const s = tick(); if (s) series.push([nowMain(), s]); await wait(500); }
      // the window's renderer: the first renderer started (the Lab's pages and others come later; the app's own
      // process list needs its test mode, which this leaves off)
      const winPid = Math.min(...series.flatMap(([, x]) => Object.entries(x.procs).filter(([, p]) => p.kind === 'renderer').map(([pid]) => Number(pid))));
      const group = (s) => { // { key: ms } for one sample
        const by = { main: 0, window: 0, renderers: 0, gpu: 0, utility: 0 };
        for (const [pid, p] of Object.entries(s.procs)) {
          const k = p.kind === 'main' ? 'main' : Number(pid) === winPid ? 'window' : p.kind === 'renderer' ? 'renderers' : p.kind === 'gpu-process' ? 'gpu' : 'utility';
          by[k] += p.ms;
          if (k === 'utility') by[`u:${p.sub || p.kind}`] = (by[`u:${p.sub || p.kind}`] || 0) + p.ms;
        }
        for (const [name, ms] of Object.entries(s.threads)) by[`t:${name}`] = ms;
        return by;
      };
      // cumulative per key from per-sample increases (a process or thread that ends doesn't take its time back)
      const gs = []; let prev = null; const acc = {};
      for (const [t, s] of series) {
        const g = group(s);
        if (prev) for (const k of Object.keys(g)) acc[k] = (acc[k] || 0) + Math.max(0, g[k] - (prev[k] ?? g[k]));
        else for (const k of Object.keys(g)) acc[k] = 0;
        prev = g; gs.push([t, { ...acc }]);
      }
      const at = (t) => { // CPU ms by key at main-clock time t (linear between samples)
        let i = gs.findIndex(([x]) => x >= t); if (i < 0) i = gs.length - 1; if (i === 0) i = 1;
        const [t0, a] = gs[i - 1]; const [t1, z] = gs[i]; const f = Math.max(0, Math.min(1, (t - t0) / ((t1 - t0) || 1)));
        return Object.fromEntries(Object.keys(z).map((k) => [k, (a[k] || 0) + (z[k] - (a[k] || 0)) * f]));
      };
      const pct = (s, e) => { const a = at(s); const z = at(e); const o = {}; for (const k of Object.keys(z)) { const v = r1(((z[k] - (a[k] || 0)) / (e - s)) * 100); if (!k.includes(':') || v >= 0.3) o[k] = v; } return o; };
      const windows = Array.from({ length: Math.ceil(SPAN / 10000) }, (_, i) => i * 10000).map((x) => pct(fp + x, fp + Math.min(SPAN, x + 10000)));
      // per second, main process + window (to see when a burst starts / ends)
      const perSec = []; for (let x = 0; x < SPAN; x += 1000) { const q = pct(fp + x, fp + x + 1000); perSec.push([q.main, q.window]); }
      const page = await c.evaluate('({ timeOrigin: performance.timeOrigin, ready: performance.getEntriesByName("hearth:ready")[0]?.startTime ?? null, longs: __ib.longs, lazy: window.Lazy ? Lazy.state().filter((g) => g.at).map((g) => [g.name, Math.round(g.at), Math.round(g.ms || 0)]) : [], misses: window.Lazy?.misses ? Lazy.misses().map((m) => `${m.group}@${m.at} ${m.name} ← ${m.where}`) : [] })').catch(() => null);
      const toMain = (ms) => page.timeOrigin + ms - probe.wall0;
      let winProf = null;
      if (profDir) { const r = await c.send('Profiler.stop'); winProf = r.result?.profile; if (winProf) fs.writeFileSync(path.join(profDir, 'window.cpuprofile'), JSON.stringify(winProf)); }
      b.send('Browser.close');
      for (let i = 0; i < 80; i++) { try { process.kill(child.pid, 0); } catch { break; } await wait(100); }
      c.ws.close(); b.ws.close();
      await wait(300);
      const tk = readJson(tickOut) || {}; const held = (tk.held || []).filter(([t]) => t >= fp && t < fp + SPAN).map(([t, ms]) => [Math.round(t - fp), ms]);
      const longs = (page?.longs || []).map(([s, d]) => [Math.round(toMain(s) - fp), d]).filter(([t]) => t >= 0 && t < SPAN);
      // the store / files threads' ops (ms on the thread) per 10 s window from the first picture
      const opWin = []; for (let x = 0; x < SPAN; x += 10000) { const o = {}; for (const [k, [n, ms]] of Object.entries(tk.opSecs || {})) { const [sec, op] = k.split(' '); const t = Number(sec) * 1000 - fp; if (t >= x && t < x + 10000) { o[op] = o[op] || [0, 0]; o[op][0] += n; o[op][1] += ms; } } opWin.push(Object.entries(o).filter(([, v]) => v[1] >= 20).map(([op, [n, ms]]) => `${op} ×${n} ${Math.round(ms)}ms`).join(', ')); }
      const out = { watchedN: tk.watchedN, misses: page?.misses || [], opWin, spawned: (tk.spawned || []).map(([t, ...x]) => [Math.round(t - fp), ...x]), watched: (tk.watched || []).map(([t, ...x]) => [Math.round(t - fp), ...x]), perSec, lazy: (page?.lazy || []).map(([n, a, ms]) => [n, Math.round(toMain(a) - fp), ms]), fp: Math.round(fp), ready: page?.ready != null ? Math.round(toMain(page.ready) - fp) : null, windows, mainHeld: held, windowLongs: longs };
      if (profDir) out.prof = profile(mainProf, winProf, winProfAt - probe.wall0, fp, held);
      return out;
    }
    b.send('Browser.close');
    for (let i = 0; i < 80; i++) { try { process.kill(child.pid, 0); } catch { break; } await wait(100); }
    c.ws.close(); b.ws.close();
    return null;
  } finally { kill(); }
}

// the launch's processes: every descendant of the xvfb-run child except X itself, with their CPU ms (utime + stime)
const HZ = 100; // (USER_HZ on Linux)
function statOf(file) {
  const s = fs.readFileSync(file, 'utf8'); const r = s.lastIndexOf(')');
  const comm = s.slice(s.indexOf('(') + 1, r); const f = s.slice(r + 2).split(' ');
  return { comm, ppid: Number(f[1]), ms: ((Number(f[11]) + Number(f[12])) * 1000) / HZ };
}
function procTree(root) {
  const all = new Map();
  for (const n of fs.readdirSync('/proc')) { if (!/^\d+$/.test(n)) continue; try { all.set(Number(n), statOf(`/proc/${n}/stat`)); } catch { /* gone */ } }
  const kids = new Map(); for (const [pid, p] of all) { if (!kids.has(p.ppid)) kids.set(p.ppid, []); kids.get(p.ppid).push(pid); }
  const procs = {}; const threads = {}; const stack = [root];
  while (stack.length) {
    const pid = stack.pop(); for (const k of kids.get(pid) || []) stack.push(k);
    const p = all.get(pid); if (!p || pid === root || /^(Xvfb|xvfb-run|sh|bash|xauth)$/.test(p.comm)) continue;
    let cmd = ''; try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' '); } catch { continue; }
    const type = /--type=(\S+)/.exec(cmd)?.[1]; const sub = /--utility-sub-type=(\S+)/.exec(cmd)?.[1];
    const kind = type || (/electron/.test(p.comm) || /electron/.test(cmd.split(' ')[0]) ? 'main' : `other ${p.comm}`);
    procs[pid] = { kind, sub, ms: p.ms };
    if (kind === 'main') {
      for (const t of fs.readdirSync(`/proc/${pid}/task`)) { try { const s = statOf(`/proc/${pid}/task/${t}/stat`); const name = s.comm.replace(/\d+$/, '#'); threads[name] = (threads[name] || 0) + s.ms; } catch { /* gone */ } }
    }
  }
  return { procs, threads };
}

function profile(mainFile, winProf, winAt, fp, held = []) {
  const res = {};
  const mp = readJson(mainFile);
  if (mp) {
    const p = S.fromCpuprofile(mp, (us) => mp.perf0 + (us - mp.startTime) / 1000);
    // each time the main thread was held ≥ 40 ms (the tick): what ran in it
    res.heldWhat = held.map(([t, ms]) => { const x = S.top(p, fp + t - 5, fp + t + ms + 5, 4); return `+${t}ms held ${ms}ms: ${x.fns.join(' | ')}`; });
    res.main = [0, 10000, 20000].map((x) => { const t = S.top(p, fp + x, fp + x + 10000, 14); return { from: x / 1000, busyMs: t.busyMs, fns: t.fns, files: t.files }; });
    res.mainSecs = []; for (let x = 0; x < SPAN; x += 1000) { const t = S.top(p, fp + x, fp + x + 1000, 5); if (t.busyMs >= 15) res.mainSecs.push(`+${x / 1000}s ${t.busyMs}ms: ${t.fns.join(' · ')}`); }
    res.mainStretches = S.busy(p, 3).filter((s) => s.at >= fp && s.at < fp + SPAN && s.ms >= 20)
      .map((s) => { const t = S.top(p, s.at, s.at + s.ms + 1, 3); return `+${Math.round(s.at - fp)}ms ${s.ms}ms ${t.fns.join(' | ')}`; });
  }
  if (winProf) {
    const p = S.fromCpuprofile(winProf, (us) => winAt + (us - winProf.startTime) / 1000);
    res.window = [0, 10000, 20000].map((x) => { const t = S.top(p, fp + x, fp + x + 10000, 10); return { from: x / 1000, busyMs: t.busyMs, fns: t.fns, files: t.files }; });
    res.windowSecs = []; for (let x = 0; x < SPAN; x += 1000) { const t = S.top(p, fp + x, fp + x + 1000, 4); if (t.busyMs >= 30) res.windowSecs.push(`+${x / 1000}s ${t.busyMs}ms: ${t.fns.join(' · ')} [${t.files.slice(0, 4).join(' · ')}]`); }
  }
  return res;
}

async function locked(fn) {
  if (!LOCK) return fn();
  const fd = fs.openSync('/tmp/hearth-run.lock', 'a');
  // flock through a helper shell (Node has no flock): hold the lock while the child waits on stdin
  const holder = spawn('flock', ['/tmp/hearth-run.lock', 'sh', '-c', 'echo locked; read x'], { stdio: ['pipe', 'pipe', 'ignore'] });
  await new Promise((r) => holder.stdout.once('data', r));
  try { return await fn(); } finally { holder.stdin.end('\n'); fs.closeSync(fd); }
}

function report(r, i, tag) {
  const w = r.windows;
  console.log(`${tag}run ${i}: main % ${w.map((x) => x.main).join(' / ')} · window % ${w.map((x) => x.window).join(' / ')} · utility ${w.map((x) => x.utility).join(' / ')} · main held ≥40ms ${r.mainHeld.length} (worst ${Math.max(0, ...r.mainHeld.map((x) => x[1]))}) · window long ${r.windowLongs.length} (worst ${Math.max(0, ...r.windowLongs.map((x) => x[1]))}) · ready +${r.ready} · load ${r.load.toFixed(2)}`);
  for (const [k, w0] of r.windows.entries()) console.log(`   ${k * 10}–${k * 10 + 10}s: main ${w0.main} · window ${w0.window}${r.opWin[k] ? ` · threads: ${r.opWin[k]}` : ''} · ${Object.entries(w0).filter(([key, v]) => key.includes(':') && v >= 0.5).sort((x, y) => y[1] - x[1]).map(([key, v]) => `${key} ${v}`).join(' · ')}`);
  console.log(`   per s (main,window): ${r.perSec.map(([a, b]) => `${Math.round(a)},${Math.round(b)}`).join(' ')}`);
  if (r.prof) {
    for (const m of r.prof.main || []) console.log(`   main ${m.from}–${m.from + 10}s busy ${m.busyMs} ms: ${m.fns.slice(0, 8).join(' · ')}\n      files: ${m.files.slice(0, 8).join(' · ')}`);
    for (const x of (r.prof.mainStretches || []).slice(0, 25)) console.log(`   ▸ ${x}`);
    for (const x of r.prof.mainSecs || []) console.log(`   • main ${x}`);
    for (const x of r.prof.heldWhat || []) console.log(`   ✋ main ${x}`);
    for (const x of r.prof.windowSecs || []) console.log(`   ◦ window ${x}`);
    for (const m of r.prof.window || []) console.log(`   window ${m.from}–${m.from + 10}s busy ${m.busyMs} ms: ${m.fns.slice(0, 6).join(' · ')}`);
  }
  if (args.includes('--lazy')) {
    console.log(`   lazy groups (at ms after fp, ms): ${r.lazy.map(([n, a, ms]) => `${n}@${a}+${ms}`).join(' ')}`);
    console.log(`   lazy misses (a global touched before its group loaded):\n      ${r.misses.join('\n      ')}`);
    console.log(`   spawned: ${r.spawned.map((x) => x.join(' ')).join(' | ')}`);
    console.log(`   watched: ${r.watchedN ?? r.watched.length} (${r.watched.slice(0, 12).map((x) => x.join(' ')).join(' | ')})`);
  }
  if (r.mainHeld.length) console.log(`   main held: ${r.mainHeld.map(([t, ms]) => `+${t}:${ms}`).join(' ')}`);
  if (r.windowLongs.length) console.log(`   window long: ${r.windowLongs.map(([t, ms]) => `+${t}:${ms}`).join(' ')}`);
}

function summarize(runs) {
  const col = (k, w) => runs.map((r) => r.windows[w]?.[k]);
  const WIX = Array.from({ length: Math.ceil(SPAN / 10000) }, (_, i) => i);
  // after the start: the 10 s from 2 s past the first picture (the first screen and what you open most are in by then)
  const after = (r, j) => r1(r.perSec.slice(2, 12).reduce((a, x) => a + x[j], 0) / Math.max(1, r.perSec.slice(2, 12).length));
  const worst = (xs, a, b) => Math.max(0, ...xs.filter(([t]) => t >= a && t < b).map((x) => x[1]));
  return {
    runs: runs.length, WIX,
    mainPct: WIX.map((w) => r1(median(col('main', w)))), windowPct: WIX.map((w) => r1(median(col('window', w)))),
    utilityPct: WIX.map((w) => r1(median(col('utility', w)))),
    main0to10: col('main', 0), window0to10: col('window', 0),
    mainAfter: runs.map((r) => after(r, 0)), windowAfter: runs.map((r) => after(r, 1)),
    mainHeldWorst0to10: runs.map((r) => worst(r.mainHeld, 0, 10000)), windowLongWorst0to10: runs.map((r) => worst(r.windowLongs, 0, 10000)),
    mainHeldWorstAfter: runs.map((r) => worst(r.mainHeld, 2000, SPAN)), windowLongWorstAfter: runs.map((r) => worst(r.windowLongs, 2000, SPAN)),
  };
}
function printSummary(sm, tag = '') {
  console.log(`\n${tag}median % of one CPU (each 10 s from the first picture, ${sm.WIX.map((w) => `${w * 10}–${w * 10 + 10}`).join(' / ')} s), ${sm.runs} launches:`);
  console.log(`  main ${sm.mainPct.join(' / ')} · window ${sm.windowPct.join(' / ')} · utility ${sm.utilityPct.join(' / ')}`);
  console.log(`  0–10 s     main ${sm.main0to10.join(' ')} (median ${r1(median(sm.main0to10))}) · window ${sm.window0to10.join(' ')} (median ${r1(median(sm.window0to10))})`);
  console.log(`  2–12 s     main ${sm.mainAfter.join(' ')} (median ${r1(median(sm.mainAfter))}) · window ${sm.windowAfter.join(' ')} (median ${r1(median(sm.windowAfter))})`);
  console.log(`  worst main hold (ms) 0–10 s: ${sm.mainHeldWorst0to10.join(' ')} · from 2 s: ${sm.mainHeldWorstAfter.join(' ')}`);
  console.log(`  worst window long task (ms) 0–10 s: ${sm.windowLongWorst0to10.join(' ')} · from 2 s: ${sm.windowLongWorstAfter.join(' ')}`);
}

(async () => {
  if (!fs.existsSync(path.join(DATA, 'chats'))) {
    console.log(`making the fixture ${DATA} (dev/bigprofile.js --projects 40)…`);
    execFileSync('node', [path.join(__dirname, 'bigprofile.js'), DATA, '--projects', '40'], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  // --ab <base app dir>: that app and this one launched in turn (new, base · base, new · …), same fixture, same minutes
  const AB = opt('--ab') ? path.resolve(opt('--ab')) : null;
  const keep = opt('--keep');
  const sides = [{ name: 'new', app: APP }, ...(AB ? [{ name: 'base', app: AB }] : [])].map((x, k) => ({
    ...x, dir: copyApp(x.app, keep ? (AB ? `${keep}-${x.name}` : keep) : null),
    userData: fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-ib83-ud-')), port: 9600 + k * 7 + Math.floor(Math.random() * 280), runs: [] }));
  console.log(`${sides.map((x) => `${x.name}: ${x.app}`).join(' · ')} · runs ${RUNS}${PROF ? ' · profiled' : ''}${SYNC ? ' · sync on' : ''} · load ${os.loadavg().map((x) => x.toFixed(2)).join(' ')}`);
  for (const sd of sides) await locked(() => launch(sd.dir, sd.userData, sd.port, { warm: true }));
  for (let i = 0; i < RUNS; i++) {
    const order = sides.length > 1 && i % 2 ? [...sides].reverse() : sides;
    for (const sd of order) {
      const profDir = PROF ? fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-ib83-prof-')) : null;
      let r = null;
      try { r = await locked(() => launch(sd.dir, sd.userData, sd.port, { profDir })); } catch (err) { console.log(`${sd.name} run ${i}: failed ${err.message}`); continue; }
      r.load = os.loadavg()[0];
      sd.runs.push(r);
      report(r, i, sides.length > 1 ? `[${sd.name}] ` : '');
    }
  }
  const out = {};
  for (const sd of sides) { out[sd.name] = { summary: summarize(sd.runs), runs: sd.runs }; printSummary(out[sd.name].summary, sides.length > 1 ? `[${sd.name}] ` : ''); }
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(sides.length > 1 ? out : out.new, null, 1));
  for (const sd of sides) {
    if (!keep) fs.rmSync(sd.dir, { recursive: true, force: true });
    fs.rmSync(sd.userData, { recursive: true, force: true }); fs.rmSync(`${sd.userData}-cloud`, { recursive: true, force: true });
  }
})().catch((err) => { console.error(err); process.exit(2); });
