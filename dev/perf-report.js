#!/usr/bin/env node
// Startup / idle / interaction performance of Hearth, measured headless in a throwaway copy (like dev/smoke.js).
// Each run reloads the page under a CDP trace and reports: first paint, ready (start.js's 'hearth:ready' mark),
// interactive (ready, or the end of the last long task before ready + 3 s), script parse + eval per file, CSS parse,
// style recalc / layout during startup, long tasks; then memory after a GC, an idle window (timers, rAF, style
// recalcs: there should be none), and dev/checks/perf.js (palette, "/" menu, tools, Lab frame time, streaming).
//
//   node dev/perf-report.js                        # 3 startup runs (median) + idle + interactions
//   node dev/perf-report.js --runs 5 --json /tmp/perf.json
//   node dev/perf-report.js --budget               # exit 1 if startup is > 30 % slower than dev/perf-budget.json
//   node dev/perf-report.js --save-budget          # write the current medians as the new budget baseline
//   node dev/perf-report.js --theme forgeheart     # measure with a look preset (the idle check counts its animations)
//   node dev/perf-report.js --startup-only         # skip the interaction check (--no-stream: and the streamed reply)
//   node dev/perf-report.js --trace /tmp/t.json    # keep the last startup trace (load it in DevTools → Performance)
//   node dev/perf-report.js --startup-profile /tmp/s.cpuprofile   # JS profile of the last startup run
//   node dev/perf-report.js --cpu-profile /tmp/p.cpuprofile --quick   # JS profile of the interaction check (--quick: no Lab / stream)
// SwiftShader + a shared CPU: compare numbers from the same machine only; the budget allows 30 % noise.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(name);
const RUNS = Number(opt('--runs', 3));
const ELECTRON = process.env.ELECTRON || '/opt/hearth-electron/electron';
const PORT = 9400 + Math.floor(Math.random() * 500);
const BUDGET_FILE = path.join(__dirname, 'perf-budget.json');
const SLACK = 1.3;
const CDN_CACHE = process.env.CDN_CACHE || '/opt/cdn-cache';
const CDN_PATTERNS = [{ urlPattern: 'https://cdn.jsdelivr.net/*', requestStage: 'Request' }];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
const r1 = (n) => Math.round(n * 10) / 10;

function cdnFile(url) {
  const m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/([^@/]+)@([^/]+)\/([^?#]*)/);
  if (!m) return null;
  const root = path.join(CDN_CACHE, `${m[1]}@${m[2]}`, 'package');
  const file = path.join(root, m[3]);
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}
function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-perf-'));
  const skip = new Set(['.git', 'data', 'electron', 'electron-mac', 'node_modules', 'dev']);
  for (const n of fs.readdirSync(ROOT)) if (!skip.has(n)) fs.cpSync(path.join(ROOT, n), path.join(dir, n), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pkg.name = 'hearth-perf-test';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  const cfgPath = path.join(dir, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.settings = { ...(cfg.settings || {}), enginePaths: { claude: path.join(__dirname, 'fake-claude.js'), codex: path.join(__dirname, 'fake-codex.js') } };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  return dir;
}

// ---------- trace analysis ----------
const TRACE_CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8.execute', 'blink.user_timing', 'loading', 'toplevel', '__metadata'].join(',');
const TASK = 'RunTask'; // the top-level task event (ThreadControllerImpl::RunTask nests inside it: don't count both)
function mainThread(events) {
  const ev = events.find((e) => e.name === 'EvaluateScript' && /\/ui\.js$/.test(e.args?.data?.url || ''));
  return ev ? { pid: ev.pid, tid: ev.tid } : null;
}
function analyzeStartup(events) {
  const mt = mainThread(events);
  if (!mt) return null;
  const on = events.filter((e) => e.pid === mt.pid && e.tid === mt.tid);
  const navs = events.filter((e) => e.name === 'navigationStart' && e.pid === mt.pid && /index\.html/.test(e.args?.data?.documentLoaderURL || ''));
  const t0 = (navs.at(-1) || on.find((e) => e.name === 'navigationStart') || on[0]).ts;
  const rel = (ts) => (ts - t0) / 1000;
  const ready = events.find((e) => e.name === 'hearth:ready' && e.pid === mt.pid);
  const readyMs = ready ? rel(ready.ts) : NaN;
  const scripts = {};
  for (const e of on) {
    if (e.ph !== 'X' || !e.dur) continue;
    const url = e.args?.data?.url;
    if (!url || !url.startsWith('file:')) continue;
    if (e.name === 'EvaluateScript') { const k = url.replace(/^.*?hearth-perf-[^/]+\//, ''); (scripts[k] ||= { evalMs: 0, compileMs: 0 }).evalMs += e.dur / 1000; }
  }
  for (const e of on) if (e.name === 'v8.compile' && e.dur && e.args?.data?.url) { const k = e.args.data.url.replace(/^.*?hearth-perf-[^/]+\//, ''); if (scripts[k]) scripts[k].compileMs += e.dur / 1000; }
  const css = {};
  for (const e of on) if (e.name === 'ParseAuthorStyleSheet' && e.dur) { const k = (e.args?.data?.styleSheetUrl || 'inline').replace(/^.*?hearth-perf-[^/]+\//, ''); css[k] = (css[k] || 0) + e.dur / 1000; }
  const until = Number.isFinite(readyMs) ? readyMs + 3000 : Infinity;
  const inWin = (e) => rel(e.ts) >= 0 && rel(e.ts) <= until;
  const tasks = on.filter((e) => e.name === TASK && e.ph === 'X' && inWin(e));
  const long = tasks.filter((e) => e.dur / 1000 > 50).map((e) => ({ at: r1(rel(e.ts)), ms: r1(e.dur / 1000) }));
  const sum = (name) => r1(on.filter((e) => e.name === name && e.ph === 'X' && inWin(e)).reduce((a, e) => a + e.dur / 1000, 0));
  const lastLongEnd = long.length ? Math.max(...long.map((l) => l.at + l.ms)) : 0;
  const fcp = events.find((e) => e.name === 'firstContentfulPaint' && e.pid === mt.pid && e.ts >= t0);
  return {
    fcpMs: fcp ? r1(rel(fcp.ts)) : NaN,
    readyMs: r1(readyMs),
    interactiveMs: r1(Math.max(readyMs, Math.min(lastLongEnd, until))),
    scriptEvalMs: r1(Object.values(scripts).reduce((a, s) => a + s.evalMs, 0)),
    scriptCompileMs: r1(Object.values(scripts).reduce((a, s) => a + s.compileMs, 0)),
    cssParseMs: r1(Object.values(css).reduce((a, x) => a + x, 0)),
    styleRecalcMs: sum('UpdateLayoutTree'), layoutMs: sum('Layout'), paintMs: sum('Paint'),
    mainThreadBusyMs: r1(tasks.reduce((a, e) => a + e.dur / 1000, 0)),
    longTasks: long, longTaskMs: r1(long.reduce((a, l) => a + l.ms, 0)),
    scripts: Object.fromEntries(Object.entries(scripts).map(([k, s]) => [k, { evalMs: r1(s.evalMs), compileMs: r1(s.compileMs) }]).sort((a, b) => b[1].evalMs - a[1].evalMs)),
    css: Object.fromEntries(Object.entries(css).map(([k, v]) => [k, r1(v)]).sort((a, b) => b[1] - a[1])),
  };
}
function analyzeIdle(events, ms) {
  const mt = mainThread(events) || (() => { const e = events.find((x) => x.name === 'thread_name' && x.args?.name === 'CrRendererMain'); return e && { pid: e.pid, tid: e.tid }; })();
  // the page's main thread: the renderer thread with the most timeline events if ui.js wasn't evaluated in this window
  let pid = mt?.pid, tid = mt?.tid;
  if (!mt) return null;
  const on = events.filter((e) => e.pid === pid && e.tid === tid);
  const count = (name) => on.filter((e) => e.name === name).length;
  const busy = on.filter((e) => e.name === TASK && e.ph === 'X').reduce((a, e) => a + e.dur / 1000, 0);
  const timers = {};
  for (const e of on) if (e.name === 'TimerFire') { const f = e.args?.data?.frame ? '' : ''; const k = `${e.args?.data?.timerId ?? '?'}${f}`; timers[k] = (timers[k] || 0) + 1; }
  const fn = {};
  for (const e of on) if (e.name === 'FunctionCall' && e.args?.data) { const d = e.args.data; const k = `${(d.url || '').replace(/^.*?hearth-perf-[^/]+\//, '')}:${d.lineNumber}${d.functionName ? ` ${d.functionName}` : ''}`; fn[k] = (fn[k] || 0) + 1; }
  return {
    seconds: ms / 1000, busyMsPerSec: r1(busy / (ms / 1000)),
    timerFires: count('TimerFire'), animationFrames: count('FireAnimationFrame'), styleRecalcs: count('UpdateLayoutTree'), layouts: count('Layout'), paints: count('Paint'),
    callbacks: Object.entries(fn).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${n}× ${k}`),
  };
}

(async () => {
  const dir = copyApp();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-perf-profile-'));
  const child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', ELECTRON, dir, '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], { stdio: 'ignore', detached: true });
  const killAll = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } try { execFileSync('pkill', ['-9', '-f', dir]); } catch { /* gone */ } };
  process.on('exit', killAll);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { killAll(); process.exit(1); });
  let code = 0;
  const report = { when: new Date().toISOString(), runs: [], cpus: os.cpus().length };
  try {
    let wsUrl;
    for (let i = 0; i < 60 && !wsUrl; i++) {
      try { const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = list.find((t) => t.type === 'page' && /index\.html/.test(t.url))?.webSocketDebuggerUrl; } catch { /* not up */ }
      if (!wsUrl) await wait(500);
    }
    if (!wsUrl) throw new Error('no window');
    const ws = new WebSocket(wsUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map(); let traceBuf = []; let traceDone = null;
    const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
      if (msg.method === 'Tracing.dataCollected') { traceBuf.push(...msg.params.value); return; }
      if (msg.method === 'Tracing.tracingComplete') { traceDone?.(); return; }
      if (msg.method === 'Fetch.requestPaused') {
        const p = msg.params; const file = cdnFile(p.request.url);
        if (!file) { send('Fetch.continueRequest', { requestId: p.requestId }, msg.sessionId); return; }
        const type = /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream';
        send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: fs.readFileSync(file).toString('base64') }, msg.sessionId);
        return;
      }
      if (msg.method === 'Target.attachedToTarget') {
        const sid = msg.params.sessionId;
        send('Fetch.enable', { patterns: CDN_PATTERNS }, sid);
        send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sid);
        send('Runtime.runIfWaitingForDebugger', {}, sid);
      }
    };
    const evaluate = async (expr, timeout = 240000) => {
      const r = await Promise.race([send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }), wait(timeout).then(() => ({ result: { exceptionDetails: { text: 'timeout' } } }))]);
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
      return r.result?.result?.value;
    };
    const trace = async (fn) => {
      traceBuf = [];
      await send('Tracing.start', { categories: TRACE_CATS, transferMode: 'ReportEvents' });
      await fn();
      const done = new Promise((r) => { traceDone = r; });
      await send('Tracing.end');
      await done;
      return traceBuf;
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Fetch.enable', { patterns: CDN_PATTERNS });
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await wait(3000); // the first load (profile creation, data folder) is not a fair start: measure reloads
    if (opt('--theme')) { // a look preset (forgeheart, classic, swirl…): saved in the copy's config, so every reload uses it
      await evaluate(`(async () => { await Commands.exec('/theme ${opt('--theme').replace(/[^\w-]/g, '')}'); return true; })()`).catch((e) => console.log('theme:', e.message));
      await wait(2500);
      report.theme = opt('--theme');
    }
    const isReady = () => evaluate("Boolean(performance.getEntriesByName('hearth:ready').length)", 2000).catch(() => false);
    for (let run = 0; run < RUNS; run++) {
      const prof = opt('--startup-profile') && run === RUNS - 1;
      if (prof) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 100 }); await send('Profiler.start'); }
      const events = await trace(async () => {
        await send('Page.reload', { ignoreCache: true });
        await wait(300);
        for (let i = 0; i < 150 && !(await isReady()); i++) await wait(100);
        await wait(3200);
      });
      if (prof) fs.writeFileSync(opt('--startup-profile'), JSON.stringify((await send('Profiler.stop')).result.profile));
      if (opt('--trace')) fs.writeFileSync(opt('--trace'), JSON.stringify({ traceEvents: events })); // open in DevTools → Performance
      const a = analyzeStartup(events);
      if (!a) { console.log(`run ${run + 1}: no main thread found in the trace`); continue; }
      report.runs.push(a);
      console.log(`run ${run + 1}: FCP ${a.fcpMs} ms · ready ${a.readyMs} ms · interactive ${a.interactiveMs} ms · script ${a.scriptEvalMs} ms · long tasks ${a.longTasks.length} (${a.longTaskMs} ms)`);
    }
    const keys = ['fcpMs', 'readyMs', 'interactiveMs', 'scriptEvalMs', 'scriptCompileMs', 'cssParseMs', 'styleRecalcMs', 'layoutMs', 'paintMs', 'mainThreadBusyMs', 'longTaskMs'];
    report.startup = Object.fromEntries(keys.map((k) => [k, r1(median(report.runs.map((r) => r[k])))]));
    report.startup.longTasks = median(report.runs.map((r) => r.longTasks.length));
    // per-file medians
    const files = {};
    for (const r of report.runs) for (const [f, s] of Object.entries(r.scripts)) (files[f] ||= []).push(s.evalMs);
    report.scripts = Object.fromEntries(Object.entries(files).map(([f, xs]) => [f, r1(median(xs))]).sort((a, b) => b[1] - a[1]));
    const cssFiles = {};
    for (const r of report.runs) for (const [f, v] of Object.entries(r.css)) (cssFiles[f] ||= []).push(v);
    report.css = Object.fromEntries(Object.entries(cssFiles).map(([f, xs]) => [f, r1(median(xs))]).sort((a, b) => b[1] - a[1]));
    // memory after a GC
    await send('Performance.enable');
    await send('HeapProfiler.collectGarbage');
    const met = Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]));
    report.memory = { jsHeapMB: r1(met.JSHeapUsedSize / 1048576), nodes: met.Nodes, listeners: met.JSEventListeners, documents: met.Documents };
    // idle: 5 s with nothing happening
    await wait(1500);
    report.idle = analyzeIdle(await trace(() => wait(5000)), 5000);
    if (report.idle) report.idle.runningAnimations = await evaluate("document.getAnimations().filter((a) => a.playState === 'running').map((a) => `${a.animationName || a.constructor.name} on ${a.effect?.target?.className || a.effect?.target?.tagName || '?'}${a.effect?.pseudoElement || ''}`.slice(0, 90))").catch(() => []);
    console.log(`idle: ${report.idle?.busyMsPerSec} ms busy/s · ${report.idle?.timerFires} timer fires · ${report.idle?.animationFrames} rAF · ${report.idle?.styleRecalcs} style recalcs · ${report.idle?.paints} paints`);
    // a long streamed reply (fake engine): main-thread cost of painting it
    if (!flag('--no-stream')) {
      const streamJs = `(async () => { const a = H.claudeAgent(); activate(a.id); Native.newChat(a.id); await Native.send(a.id, 'long table code please');
        const t = Date.now(); while (Native.isBusy(H.activeChat[a.id]) && Date.now() - t < 60000) await new Promise((r) => setTimeout(r, 50)); return true; })()`;
      const ev = await trace(() => evaluate(streamJs, 90000));
      report.stream = analyzeIdle(ev, 1);
      const mt = mainThread(ev) || (() => { const e = ev.find((x) => x.name === 'thread_name' && x.args?.name === 'CrRendererMain'); return e && { pid: e.pid, tid: e.tid }; })();
      if (mt) {
        const on = ev.filter((e) => e.pid === mt.pid && e.tid === mt.tid && e.ph === 'X');
        const sum = (n) => r1(on.filter((e) => e.name === n).reduce((a, e) => a + e.dur / 1000, 0));
        report.stream = { busyMs: sum(TASK), timersMs: sum('TimerFire'), styleRecalcMs: sum('UpdateLayoutTree'), layoutMs: sum('Layout'), paintMs: sum('Paint'), parseHtmlMs: sum('ParseHTML') };
      }
      console.log('stream:', JSON.stringify(report.stream));
      await evaluate("(() => { Native.newChat(H.claudeAgent().id); return true; })()").catch(() => {});
      await wait(500);
    }
    if (!flag('--startup-only')) {
      const src = fs.readFileSync(path.join(__dirname, 'checks', 'perf.js'), 'utf8');
      if (opt('--cpu-profile')) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); }
      const quick = flag('--quick') ? 'window.__perfQuick = true;' : '';
      try { report.interactive = JSON.parse(await evaluate(`(async () => { ${quick} ${src} })()`)); } catch (err) { report.interactive = { error: err.message }; }
      if (opt('--cpu-profile')) fs.writeFileSync(opt('--cpu-profile'), JSON.stringify((await send('Profiler.stop')).result.profile)); // DevTools → Performance → Load profile
      await wait(1500);
      report.idleAfterTools = analyzeIdle(await trace(() => wait(4000)), 4000);
    }
    ws.close();
  } catch (err) {
    console.log(`harness: ${err.stack || err.message}`); code = 1;
  } finally {
    killAll();
    for (const d of [dir, userData]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* still in use */ } }
  }
  // ---------- print ----------
  const s = report.startup || {};
  console.log('\nStartup (median of', report.runs.length, 'reloads):', JSON.stringify(s));
  console.log('Top scripts (eval incl. compile, ms):', Object.entries(report.scripts || {}).slice(0, 15).map(([f, v]) => `${f} ${v}`).join(' · '));
  console.log('CSS parse (ms):', Object.entries(report.css || {}).slice(0, 8).map(([f, v]) => `${f} ${v}`).join(' · '));
  console.log('Memory:', JSON.stringify(report.memory));
  console.log('Idle:', JSON.stringify(report.idle));
  if (report.interactive) console.log('Interactive:', JSON.stringify(report.interactive, null, 1));
  if (report.idleAfterTools) console.log('Idle after visiting the tools:', JSON.stringify(report.idleAfterTools));
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(report, null, 1));
  // ---------- budget ----------
  const BUDGET_KEYS = ['readyMs', 'interactiveMs', 'scriptEvalMs', 'mainThreadBusyMs'];
  if (flag('--save-budget') && report.startup) {
    fs.writeFileSync(BUDGET_FILE, `${JSON.stringify({ note: `Startup medians measured by dev/perf-report.js on ${report.when.slice(0, 10)} (${report.cpus} CPUs, SwiftShader). --budget fails when one is > ${Math.round((SLACK - 1) * 100)} % worse.`, ...Object.fromEntries(BUDGET_KEYS.map((k) => [k, report.startup[k]])) }, null, 1)}\n`);
    console.log(`saved ${BUDGET_FILE}`);
  }
  if (flag('--budget')) {
    const b = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
    const over = BUDGET_KEYS.filter((k) => !(report.startup?.[k] <= b[k] * SLACK));
    for (const k of BUDGET_KEYS) console.log(`budget ${k}: ${report.startup?.[k]} ms vs ${b[k]} ms (limit ${r1(b[k] * SLACK)}) ${over.includes(k) ? '✖ OVER' : '✓'}`);
    if (over.length) code = 1;
  }
  process.exit(code);
})();
