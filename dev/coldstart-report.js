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

async function launch(dir, userData, port, { traceOut, shot, hold } = {}) {
  const probeOut = path.join(userData, `probe-${Date.now()}.json`);
  const child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', ELECTRON, dir, '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    { stdio: 'ignore', detached: true, env: { ...process.env, NODE_OPTIONS: `--require ${PROBE}`, HEARTH_BOOT_PROBE: probeOut } });
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
      await b.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,v8.execute,blink.user_timing,loading,toplevel,benchmark,cc,viz,gpu,__metadata', transferMode: 'ReportEvents' });
    }
    let wsUrl;
    for (let i = 0; i < 400 && !wsUrl; i++) {
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page' && /index\.html/.test(t.url))?.webSocketDebuggerUrl; } catch { /* not up */ }
      if (!wsUrl) await wait(25);
    }
    if (!wsUrl) throw new Error('no window');
    const c = await cdp(wsUrl);
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
    await wait(300);
    const page = await c.evaluate(`(() => {
      const m = (n) => { const e = performance.getEntriesByName(n)[0]; return e ? e.startTime : null; };
      const paint = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, e.startTime]));
      const soon = window.Lazy ? Lazy.state().filter((x) => x.tier === 'soon' && x.at) : [];
      const marks = Object.fromEntries(performance.getEntriesByType('mark').filter((e) => /^(splash|hearth):/.test(e.name)).map((e) => [e.name, e.startTime]));
      return { timeOrigin: performance.timeOrigin, fp: paint['first-paint'] ?? null, fcp: paint['first-contentful-paint'] ?? null, ready: m('hearth:ready'),
        features: soon.length ? Math.max(...soon.map((x) => x.at)) : null, marks, splashGone: !document.getElementById('splash'), vis: document.visibilityState, anims: document.getAnimations().map((a) => (a.animationName || a.transitionProperty || '?') + '@' + (a.effect?.target?.id || a.effect?.target?.className || '')).join(','), groups: soon.map((x) => x.name + ' ' + x.at + '+' + x.ms).join(' ') };
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
    return {
      appReady: M.appReady, windowCreated: M.windowCreated, windowShown: M.windowShown, readyToShow: M.readyToShow,
      firstPaint, ready: toMain(page.ready), features: toMain(page.features),
      // what you see first: the window on screen with its first frame drawn in it
      firstPicture: Math.max(M.windowShown ?? NaN, firstPaint),
      mainReadyToShown: M.windowShown - M.appReady, mainReadyToRTS: M.readyToShow - M.appReady, mainReadyToWindow: M.windowCreated - M.appReady,
      mainjsToReady: M.appReady - (M.mainjs ?? M.probe),
      splash: Object.fromEntries(Object.entries(page.marks).filter(([k]) => k.startsWith('splash:')).map(([k, v]) => [k, r1(toMain(v))])),
      requires: probe.requires, groups: `${page.vis} anims ${page.anims} ${page.groups}`,
    };
  } finally { kill(); }
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
        const r = await launch(dir, userData, port, { traceOut: i === RUNS && opt('--trace'), shot: i === RUNS && opt('--shot'), hold });
        if (i === 0) { console.log('warm-up launch done (profile created, not counted)'); continue; }
        runs.push(r);
        if (args.includes('--groups')) console.log(`  groups: ${r.groups}`);
        console.log(`run ${i}: shown ${r1(r.windowShown)} · first paint ${r1(r.firstPaint)} · ready ${r1(r.ready)} · features ${r1(r.features)} · main ready→shown ${r1(r.mainReadyToShown)} · ready→ready-to-show ${r1(r.mainReadyToRTS)}`);
      } catch (err) { console.log(`run ${i}: ${err.message}`); }
      await wait(500);
    }
  } finally {
    for (const d of [dir, userData]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* in use */ } }
  }
  const keys = ['appReady', 'windowCreated', 'windowShown', 'firstPaint', 'firstPicture', 'readyToShow', 'ready', 'features', 'mainjsToReady', 'mainReadyToWindow', 'mainReadyToShown', 'mainReadyToRTS'];
  const med = Object.fromEntries(keys.map((k) => [k, r1(median(runs.map((r) => r[k])))]));
  const req = {};
  for (const r of runs) for (const [m, ms] of r.requires || []) (req[m] ||= []).push(ms);
  const requires = Object.entries(req).map(([m, xs]) => [m, r1(median(xs))]).sort((a, b) => b[1] - a[1]);
  const splash = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.splash || {})) (splash[k] ||= []).push(v);
  console.log(`\nCold start (median of ${runs.length}, ms since the process started):`, JSON.stringify(med));
  console.log('main.js requires (ms):', requires.map(([m, ms]) => `${m} ${ms}`).join(' · '), `(total ${r1(requires.reduce((a, [, ms]) => a + ms, 0))})`);
  if (Object.keys(splash).length) console.log('Splash milestones (ms):', JSON.stringify(Object.fromEntries(Object.entries(splash).map(([k, xs]) => [k, r1(median(xs))]))));
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ app: APP, when: new Date().toISOString(), median: med, requires, runs }, null, 1));
  process.exit(runs.length ? 0 : 1);
})();
