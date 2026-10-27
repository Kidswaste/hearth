#!/usr/bin/env node
// Cold starts of Hearth, end to end: the app is launched from nothing again and again (same profile, like a real
// second launch, so caches are warm the way they'd be on the owner's Mac), and each launch reports, in ms since the
// Electron process started:
//   appReady       Electron's 'ready' (main.js has run its top level)
//   windowCreated  the BrowserWindow exists
//   windowShown    the window is on screen (before round 19 that was at once, empty, painted with the background color)
//   firstPaint     the page's first frame (the splash from round 19 on)
//   readyToShow    Electron's 'ready-to-show'
//   ready          the first screen is up (start.js's 'hearth:ready' mark)
//   features       every 'soon' feature group has loaded (lazy.js)
// plus the main process's own time from 'ready' to the window on screen / ready-to-show, what each module main.js
// requires costs, and the splash's milestones when the build has one (splash:* marks).
// Main-process times come from dev/boot-probe.js (NODE_OPTIONS=--require), so old builds measure the same way.
//
//   node dev/coldstart-report.js                      # 5 cold starts of this checkout (after one warm-up launch)
//   node dev/coldstart-report.js --app /tmp/old-copy --runs 7 --json /tmp/cold.json
//   node dev/coldstart-report.js --trace /tmp/cold-trace.json   # a trace of every process during the last launch
//   node dev/coldstart-report.js --runs 1 --shot /tmp/splash.png [--hold]   # a picture of the splash (--hold: kept up
//       past its "taking longer than usual" hint)   · --groups: when each feature group loaded
// (round 73, startfast73) --data <dir>: start from a copy of that data folder (dev/bigprofile.js's heavy profile;
//   <dir>/config.json, if any, becomes the app config) · --keys: from the first screen on, a key is typed into the chat
//   box every 200 ms for 8 s (Event Timing: the slowest key's wait + handlers, and to its paint) · --profile <dir>: on
//   the last launch, CPU profiles of both processes (main: dev/boot-probe.js; window: the trace's v8 sampler) written
//   there, with the top functions per phase (start → first paint → ready → settled). Every launch also reports
//   'settled' (the window's last long task, after 3 quiet seconds, ≤ 45 s) and the window's long tasks.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const APP = path.resolve(opt('--app', path.join(__dirname, '..')));
const RUNS = Number(opt('--runs', 5));
const ELECTRON = process.env.ELECTRON || '/opt/hearth-electron/electron';
const PROBE = path.join(__dirname, 'boot-probe.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const r1 = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-cold-'));
  const skip = new Set(['.git', 'data', 'electron', 'electron-mac', 'node_modules', 'dev']);
  for (const n of fs.readdirSync(APP)) if (!skip.has(n)) fs.cpSync(path.join(APP, n), path.join(dir, n), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pkg.name = 'hearth-cold-test';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  const cfgPath = path.join(dir, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.settings = { ...(cfg.settings || {}), hotkey: '', enginePaths: { claude: path.join(__dirname, 'fake-claude.js'), codex: path.join(__dirname, 'fake-codex.js') } };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  const dataSrc = opt('--data');
  if (dataSrc) {
    for (const n of fs.readdirSync(dataSrc)) {
      if (n === 'config.json') fs.copyFileSync(path.join(dataSrc, n), cfgPath);
      else fs.cpSync(path.join(dataSrc, n), path.join(dir, 'data', n), { recursive: true });
    }
  }
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

async function launch(dir, userData, port, { traceOut, shot, hold, profDir } = {}) {
  const probeOut = path.join(userData, `probe-${Date.now()}.json`);
  const mainProf = profDir ? path.join(profDir, 'main.cpuprofile') : null;
  if (profDir && !traceOut) traceOut = path.join(profDir, 'trace.json');
  const child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', ELECTRON, dir, '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    { stdio: 'ignore', detached: true, env: { ...process.env, NODE_OPTIONS: `--require ${PROBE}`, HEARTH_BOOT_PROBE: probeOut, ...(mainProf ? { HEARTH_BOOT_CPUPROF: mainProf, HEARTH_BOOT_CPUPROF_MS: '30000' } : {}) } });
  const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } try { execFileSync('pkill', ['-9', '-f', dir]); } catch { /* gone */ } };
  try {
    // the browser endpoint first (with --trace: a trace of every process from as early as it answers)
    let browserUrl;
    for (let i = 0; i < 400 && !browserUrl; i++) {
      try { browserUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; } catch { await wait(10); }
    }
    if (!browserUrl) throw new Error('no browser');
    const b = await cdp(browserUrl);
    let traceBuf = null; let traceDone = null;
    if (traceOut) {
      traceBuf = [];
      const prev = b.ws.onmessage;
      b.ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.method === 'Tracing.dataCollected') traceBuf.push(...msg.params.value); else if (msg.method === 'Tracing.tracingComplete') traceDone?.(); else prev(m); };
      await b.send('Tracing.start', { categories: `devtools.timeline,disabled-by-default-devtools.timeline,v8.execute,v8,blink.user_timing,loading,toplevel,benchmark,cc,viz,gpu,__metadata${profDir ? ',disabled-by-default-v8.cpu_profiler' : ''}`, transferMode: 'ReportEvents' });
    }
    let wsUrl;
    for (let i = 0; i < 400 && !wsUrl; i++) {
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && /index\.html/.test(t.url))?.webSocketDebuggerUrl; } catch { /* not up */ }
      if (!wsUrl) await wait(25);
    }
    if (!wsUrl) throw new Error('no window');
    const c = await cdp(wsUrl);
    // the window's long tasks from its start (buffered) and the keys' Event Timing
    await c.evaluate(`(() => { window.__cs = { longs: [], keys: [] };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) __cs.longs.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'keydown') __cs.keys.push([Math.round(e.startTime), Math.round(e.processingEnd - e.startTime), Math.round(e.duration)]); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch {}
      return 1; })()`).catch(() => null);
    // --shot: a picture of the splash (with --hold: held up past the "taking longer" hint, set by the warm-up launch)
    if (hold === 'set') await c.evaluate("localStorage.setItem('splash.hold', '1')");
    if (shot) {
      if (hold) await wait(4200);
      else for (let i = 0; i < 200 && !(await c.evaluate("Boolean(document.querySelector('#splash svg'))").catch(() => false)); i++) await wait(5);
      const s = await c.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(shot, Buffer.from(s.result?.data || '', 'base64'));
      if (hold) await c.evaluate("localStorage.removeItem('splash.hold'); Splash.finish(); true");
    }
    // wait for the first screen, then for the 'soon' feature groups
    for (let i = 0; i < 300; i++) {
      const s = await c.evaluate(`(() => { const r = performance.getEntriesByName('hearth:ready').length > 0;
        const g = window.Lazy ? Lazy.state().filter((x) => x.tier === 'soon') : [];
        return r && g.length > 0 && g.every((x) => x.state === 'loaded' || x.state === 'failed'); })()`).catch(() => false);
      if (s) break;
      await wait(50);
    }
    // --keys: typing from the first screen on (one key every 200 ms for 8 s into the chat box)
    if (args.includes('--keys')) {
      for (let i = 0; i < 300 && !(await c.evaluate("performance.getEntriesByName('hearth:ready').length > 0").catch(() => false)); i++) await wait(20);
      const t0 = Date.now(); let typed = 0;
      while (Date.now() - t0 < 8000) {
        const ok = await c.evaluate(`(() => { const t = [...document.querySelectorAll('.composer textarea')].find((x) => x.offsetParent); if (!t) return false; if (document.activeElement !== t) t.focus(); return true; })()`).catch(() => false);
        if (ok) {
          await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', text: 'a', windowsVirtualKeyCode: 65 });
          await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
          typed += 1;
        }
        await wait(200);
      }
      await c.evaluate("[...document.querySelectorAll('.composer textarea')].forEach((x) => { x.value = ''; x.dispatchEvent(new Event('input', { bubbles: true })); }); 1").catch(() => null);
      await c.evaluate(`window.__cs.typed = ${typed}; 1`).catch(() => null);
    }
    // settled: no new long task in the window for 3 s (≤ 45 s from here)
    for (let i = 0, last = -1, still = 0; i < 150 && still < 10; i++) {
      const n = await c.evaluate('window.__cs ? __cs.longs.length : 0').catch(() => 0);
      if (n === last) still += 1; else { still = 0; last = n; }
      await wait(300);
    }
    await wait(300);
    const page = await c.evaluate(`(() => {
      const m = (n) => { const e = performance.getEntriesByName(n)[0]; return e ? e.startTime : null; };
      const paint = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, e.startTime]));
      const soon = window.Lazy ? Lazy.state().filter((x) => x.tier === 'soon' && x.at) : [];
      const marks = Object.fromEntries(performance.getEntriesByType('mark').filter((e) => /^(splash|hearth):/.test(e.name)).map((e) => [e.name, e.startTime]));
      return { timeOrigin: performance.timeOrigin, fp: paint['first-paint'] ?? null, fcp: paint['first-contentful-paint'] ?? null, ready: m('hearth:ready'),
        features: soon.length ? Math.max(...soon.map((x) => x.at)) : null, marks, cs: window.__cs || null, splashGone: !document.getElementById('splash'), vis: document.visibilityState, anims: document.getAnimations().map((a) => (a.animationName || a.transitionProperty || '?') + '@' + (a.effect?.target?.id || a.effect?.target?.className || '')).join(','), groups: soon.map((x) => x.name + ' ' + x.at + '+' + x.ms).join(' ') };
    })()`);
    // a clean quit, so the profile's caches (V8 code cache included) are written like after a real session
    if (traceOut) {
      const done = new Promise((r) => { traceDone = r; });
      await b.send('Tracing.end');
      await Promise.race([done, wait(15000)]);
      fs.writeFileSync(traceOut, JSON.stringify({ traceEvents: traceBuf }));
    }
    b.send('Browser.close');
    for (let i = 0; i < 60; i++) { try { process.kill(child.pid, 0); } catch { break; } await wait(100); }
    c.ws.close(); b.ws.close();
    const probe = JSON.parse(fs.readFileSync(probeOut, 'utf8'));
    const toMain = (ms) => (ms == null ? NaN : page.timeOrigin + ms - probe.wall0); // page time → ms since the process started
    const M = probe.marks;
    const firstPaint = toMain(page.fp ?? page.fcp);
    const cs = page.cs || { longs: [], keys: [] };
    const readyAt = page.ready ?? 0;
    const lastLong = cs.longs.reduce((m, [s, d]) => Math.max(m, s + d), 0);
    const keysAfter = cs.keys.filter(([s]) => s >= readyAt);
    const profiles = profDir ? summarize(profDir, mainProf, traceOut, traceBuf, page, toMain) : null;
    return {
      settled: toMain(lastLong || page.ready),
      longBeforeReady: cs.longs.filter(([s]) => s < readyAt).map(([, d]) => d),
      longAfterReady: cs.longs.filter(([s]) => s >= readyAt).map(([, d]) => d),
      keys: args.includes('--keys') ? { typed: cs.typed, slow: keysAfter.length, worstHandled: Math.max(0, ...keysAfter.map((k) => k[1])), worstToPaint: Math.max(0, ...keysAfter.map((k) => k[2])) } : null,
      profiles,
      appReady: M.appReady, windowCreated: M.windowCreated, windowShown: M.windowShown, readyToShow: M.readyToShow,
      firstPaint, ready: toMain(page.ready), features: toMain(page.features),
      // what you see first: the window on screen with its first frame drawn in it ('ready-to-show' is that frame; the
      // page's own first-paint entry is unreliable for a window that starts hidden)
      firstPicture: Math.max(M.windowShown ?? NaN, M.readyToShow ?? NaN),
      mainReadyToShown: M.windowShown - M.appReady, mainReadyToRTS: M.readyToShow - M.appReady, mainReadyToWindow: M.windowCreated - M.appReady,
      mainjsToReady: M.appReady - (M.mainjs ?? M.probe),
      splash: Object.fromEntries(Object.entries(page.marks).filter(([k]) => k.startsWith('splash:')).map(([k, v]) => [k, r1(toMain(v))])),
      requires: probe.requires, ipc: probe.ipc || {}, groups: `${page.vis} anims ${page.anims} ${page.groups}`,
    };
  } finally { kill(); }
}

// --profile: both processes' CPU time by phase (process start → first paint → ready → settled), top functions / files
function summarize(profDir, mainProf, traceOut, traceBuf, page, toMain) {
  const S = require('./cpuprof-sum.js');
  const lines = [];
  const fp = toMain(page.fp ?? page.fcp); const rd = toMain(page.ready);
  const cs = page.cs || { longs: [] };
  const settled = toMain(cs.longs.reduce((m, [s, d]) => Math.max(m, s + d), 0) || page.ready);
  const phases = [['start → first paint', 0, fp], ['first paint → ready', fp, rd], ['ready → settled', rd, settled], ['settled → +5 s', settled, settled + 5000]];
  const show = (who, prof) => {
    for (const [name, a, b] of phases) {
      const t = S.top(prof, a, b, 10);
      lines.push(`  ${who} · ${name} (${r1(a)}–${r1(b)} ms): ${t.busyMs} ms busy`, `    files: ${t.files.join(' · ')}`, `    fns: ${t.fns.join(' · ')}`);
    }
    const long = S.busy(prof, 2).filter((x) => x.ms >= 50);
    lines.push(`  ${who} · busy stretches ≥ 50 ms: ${long.map((x) => `${x.ms}@${x.at}`).join(' ')}`);
  };
  try {
    for (let i = 0; i < 40 && !fs.existsSync(mainProf); i++) require('child_process').execFileSync('sleep', ['0.25']);
    const mp = JSON.parse(fs.readFileSync(mainProf, 'utf8'));
    show('main', S.fromCpuprofile(mp, (us) => mp.perf0 + (us - mp.startTime) / 1000));
  } catch (err) { lines.push(`  main profile: ${err.message}`); }
  try {
    const ev = traceBuf || JSON.parse(fs.readFileSync(traceOut, 'utf8')).traceEvents;
    const mk = ev.find((e) => e.name === 'hearth:ready' && /user_timing/.test(e.cat || ''));
    if (!mk) throw new Error('no hearth:ready mark in the trace');
    const toMs = (tsUs) => toMain((tsUs - mk.ts) / 1000 + page.ready);
    const mainTid = ev.find((e) => e.ph === 'M' && e.name === 'thread_name' && e.pid === mk.pid && e.args?.name === 'CrRendererMain')?.tid;
    show('window', S.fromTrace(ev, mk.pid, toMs, mainTid)); // (its main thread: the Markdown worker's samples are its own)
  } catch (err) { lines.push(`  window profile: ${err.message}`); }
  const text = lines.join('\n');
  try { fs.writeFileSync(path.join(profDir, 'summary.txt'), text); } catch { /* ignore */ }
  return text;
}

(async () => {
  const dir = copyApp();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-cold-profile-'));
  const runs = [];
  try {
    for (let i = 0; i <= RUNS; i++) {
      const port = 9400 + Math.floor(Math.random() * 500);
      try {
        const hold = args.includes('--hold') && (i === 0 ? 'set' : i === RUNS);
        const profDir = i === RUNS && opt('--profile') ? path.resolve(opt('--profile')) : null;
        if (profDir) fs.mkdirSync(profDir, { recursive: true });
        const r = await launch(dir, userData, port, { traceOut: i === RUNS && opt('--trace'), shot: i === RUNS && opt('--shot'), hold, profDir });
        if (i === 0) { console.log('warm-up launch done (profile created, not counted)'); continue; }
        runs.push(r);
        if (args.includes('--groups')) console.log(`  groups: ${r.groups}`);
        console.log(`run ${i}: shown ${r1(r.windowShown)} · first paint ${r1(r.firstPaint)} · ready ${r1(r.ready)} · features ${r1(r.features)} · settled ${r1(r.settled)} · main ready→shown ${r1(r.mainReadyToShown)} · ready→ready-to-show ${r1(r.mainReadyToRTS)}`);
        console.log(`  window long tasks before ready ${JSON.stringify(r.longBeforeReady)} · after ${JSON.stringify(r.longAfterReady.slice(0, 20))}${r.keys ? ` · keys ${JSON.stringify(r.keys)}` : ''}`);
        if (r.profiles) console.log(r.profiles);
      } catch (err) { console.log(`run ${i}: ${err.message}`); }
      await wait(500);
    }
  } finally {
    for (const d of [dir, userData]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* in use */ } }
  }
  const keys = ['appReady', 'windowCreated', 'windowShown', 'firstPaint', 'firstPicture', 'readyToShow', 'ready', 'features', 'settled', 'mainjsToReady', 'mainReadyToWindow', 'mainReadyToShown', 'mainReadyToRTS'];
  const med = Object.fromEntries(keys.map((k) => [k, r1(median(runs.map((r) => r[k])))]));
  const req = {};
  for (const r of runs) for (const [m, ms] of r.requires || []) (req[m] ||= []).push(ms);
  const requires = Object.entries(req).map(([m, xs]) => [m, r1(median(xs))]).sort((a, b) => b[1] - a[1]);
  const splash = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.splash || {})) (splash[k] ||= []).push(v);
  console.log(`\nCold start (median of ${runs.length}, ms since the process started):`, JSON.stringify(med));
  console.log('main.js requires (ms):', requires.map(([m, ms]) => `${m} ${ms}`).join(' · '), `(total ${r1(requires.reduce((a, [, ms]) => a + ms, 0))})`);
  const ipcRows = Object.entries(runs.at(-1)?.ipc || {}).sort((a, b) => b[1][2] - a[1][2]); // [calls, ms to answer, ms of work]
  if (ipcRows.length) console.log(`IPC in the first 5 s (last run: ${ipcRows.reduce((a, [, s]) => a + s[0], 0)} calls, ${r1(ipcRows.reduce((a, [, s]) => a + s[2], 0))} ms of main-process work):`, ipcRows.slice(0, 14).map(([ch, s]) => `${ch} ×${s[0]} ${r1(s[2])} ms`).join(' · '));
  if (Object.keys(splash).length) console.log('Splash milestones (ms):', JSON.stringify(Object.fromEntries(Object.entries(splash).map(([k, xs]) => [k, r1(median(xs))]))));
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ app: APP, when: new Date().toISOString(), median: med, requires, runs }, null, 1));
  process.exit(runs.length ? 0 : 1);
})();
