#!/usr/bin/env node
// Headless smoke test for development (Linux + Xvfb, no real data): copies the app to a temp folder with an
// empty data/ and a different profile name, launches it with remote debugging, then reports page errors,
// console errors and the results of optional checks. Never touches a real Hearth install.
//
//   node dev/smoke.js                       # launch, wait, report errors, save a screenshot
//   node dev/smoke.js --eval "JSON.stringify(Object.keys(H))"   # extra expressions (repeatable)
//   node dev/smoke.js --script dev/checks/foo.js                 # file of expressions, one async fn body
//   node dev/smoke.js --shot out.png --wait 6000
//   node dev/smoke.js --fake-engines --script dev/checks/chat-stream.js   # native chats answered by dev/fake-*.js
//   node dev/smoke.js --lib dev/checks/journey-lib.js --script dev/checks/journey-lab.js   # helpers before the script
//   node dev/smoke.js --data dev/old-data --script dev/checks/journey-upgrade.js     # start from a copy of a data/ folder
//
// Check scripts can drive real input and take pictures mid-run through the `__smoke` page binding the harness adds:
//   await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } })
//   await smoke({ shot: '/tmp/step3.png' })            // full-window screenshot now
// (`smoke` is defined in the page by the harness: it resolves with the CDP result.)
//
// Env: ELECTRON (path to the electron binary, default /opt/hearth-electron/electron).
// Exit code 1 when the page threw or logged errors (known harmless ones are filtered below).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const evals = []; args.forEach((a, i) => { if (a === '--eval') evals.push(args[i + 1]); });
const scriptFile = opt('--script');
const shot = opt('--shot', path.join(os.tmpdir(), 'hearth-smoke.png'));
const waitMs = Number(opt('--wait', 5000));
const keep = args.includes('--keep');
const ELECTRON = process.env.ELECTRON || '/opt/hearth-electron/electron';
const PORT = 9400 + Math.floor(Math.random() * 500);

// Errors that come from the test environment, not the app (no GPU, no engines installed, no network).
const IGNORE = [/GPU|gpu_|viz|dri3|libva|vaInitialize|Vulkan|EGL|GLES|ANGLE/i, /net::ERR_/, /Autofill\./, /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_PROXY|ERR_TUNNEL/, /Electron Security Warning/, /favicon/i, /DevTools/, /dbus|org\.freedesktop/i];

// https://cdn.jsdelivr.net/npm/three@V/<path> -> /opt/cdn-cache/three@V/package/<path> (fetched once from the npm registry).
const CDN_CACHE = process.env.CDN_CACHE || '/opt/cdn-cache';
const CDN_PATTERNS = [{ urlPattern: 'https://cdn.jsdelivr.net/*', requestStage: 'Request' }];
function cdnFile(url) {
  const m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/([^@/]+)@([^/]+)\/([^?#]*)/);
  if (!m) return null;
  const [, pkg, ver, rest] = m;
  const root = path.join(CDN_CACHE, `${pkg}@${ver}`, 'package');
  if (!fs.existsSync(root)) {
    try {
      fs.mkdirSync(path.dirname(root), { recursive: true });
      execFileSync('sh', ['-c', `curl -fsSL "https://registry.npmjs.org/${pkg}/-/${pkg}-${ver}.tgz" | tar -xz -C "${path.dirname(root)}"`]);
    } catch { return null; }
  }
  const file = path.join(root, rest);
  return file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-smoke-'));
  const skip = new Set(['.git', 'data', 'electron', 'electron-mac', 'node_modules', 'dev']);
  for (const n of fs.readdirSync(ROOT)) if (!skip.has(n)) fs.cpSync(path.join(ROOT, n), path.join(dir, n), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pkg.name = 'hearth-smoke-test';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  // --data <dir>: the copy starts with that data/ folder (and its config.json, if the folder holds one at ../config.json
  // shape: <dir>/config.json is used as the app config, everything else becomes data/).
  const dataSrc = opt('--data');
  if (dataSrc) {
    for (const n of fs.readdirSync(dataSrc)) {
      if (n === 'config.json') fs.copyFileSync(path.join(dataSrc, n), path.join(dir, 'config.json'));
      else fs.cpSync(path.join(dataSrc, n), path.join(dir, 'data', n), { recursive: true });
    }
  }
  // --fake-engines: Settings → Engines points at the fake CLIs in dev/ (they stream scripted replies).
  if (args.includes('--fake-engines')) {
    const cfgPath = path.join(dir, 'config.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const ext = process.platform === 'win32' ? 'cmd' : 'js';
    cfg.settings = { ...(cfg.settings || {}), enginePaths: { claude: path.join(__dirname, `fake-claude.${ext}`), codex: path.join(__dirname, `fake-codex.${ext}`) } };
    fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  }
  return dir;
}

async function cdpConnect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && /index\.html/.test(t.url));
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('The app window never came up (no index.html page on the debug port).');
}

(async () => {
  const dir = copyApp();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-smoke-profile-'));
  const log = [];
  // Native save dialogs can't be answered here: files are saved straight into --save-dir (default <copy>/test-saves,
  // also exposed to checks as window.SMOKE_SAVES); --open "a.wav:b.png" is what open dialogs pick.
  const saveDir = opt('--save-dir', path.join(dir, 'test-saves'));
  fs.mkdirSync(saveDir, { recursive: true });
  const env = { ...process.env, HEARTH_TEST_SAVE_DIR: saveDir, ...(opt('--open') != null ? { HEARTH_TEST_OPEN: opt('--open') } : {}) };
  const child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', ELECTRON, dir, '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, ...(process.env.SMOKE_GPU_FLAGS || '--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist').split(' ').filter(Boolean)], { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env });
  // Kill Xvfb + Electron (their own process group) however the harness ends, so no stray instances pile up.
  const killAll = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } try { execFileSync('pkill', ['-9', '-f', dir]); } catch { /* gone */ } };
  process.on('exit', killAll);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { killAll(); process.exit(1); });
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  const problems = [];
  let code = 0;
  try {
    const ws = new WebSocket(await cdpConnect());
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map();
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
      // CDN requests (three.js from jsdelivr) are answered from a local copy of the npm package, since this
      // container's network may not reach the CDN. Sandboxed iframes run in their own target: attach to them too.
      if (msg.method === 'Fetch.requestPaused') { if (process.env.SMOKE_DEBUG) console.log('cdn', msg.params.request.url, !!cdnFile(msg.params.request.url)); serveCdn(msg.params, msg.sessionId); return; }
      if (process.env.SMOKE_DEBUG && msg.method === 'Target.attachedToTarget') console.log('attached', msg.params.targetInfo.type, msg.params.targetInfo.url.slice(0, 80));
      if (msg.method === 'Target.attachedToTarget') {
        const sid = msg.params.sessionId;
        send('Fetch.enable', { patterns: CDN_PATTERNS }, sid);
        send('Runtime.enable', {}, sid);
        send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sid);
        send('Runtime.runIfWaitingForDebugger', {}, sid);
        return;
      }
      if (msg.method === 'Runtime.bindingCalled' && msg.params.name === '__smoke') { smokeCall(msg.params.payload); return; }
      if (msg.method === 'Tracing.dataCollected') { traceEvents.push(...msg.params.value); return; }
      if (msg.method === 'Tracing.tracingComplete') { traceDone?.(); return; }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        problems.push(`exception: ${d.exception?.description || d.text} @ ${d.url || ''}:${d.lineNumber}`);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'log' && process.env.SMOKE_DEBUG) {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (text.startsWith('[J]')) console.log(text);
      }
      if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'assert')) {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (!IGNORE.some((re) => re.test(text))) problems.push(`console.error: ${text}`);
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        const e = msg.params.entry;
        if (!IGNORE.some((re) => re.test(e.text + (e.url || '')))) problems.push(`log: ${e.text} ${e.url || ''}`);
      }
    };
    const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) })); });
    const serveCdn = (p, sid) => {
      const file = cdnFile(p.request.url);
      if (!file) { send('Fetch.continueRequest', { requestId: p.requestId }, sid); return; }
      const type = /\.m?js$/.test(file) ? 'text/javascript' : /\.json$/.test(file) ? 'application/json' : /\.wasm$/.test(file) ? 'application/wasm' : 'application/octet-stream';
      send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: fs.readFileSync(file).toString('base64') }, sid);
    };
    // The `smoke()` bridge for check scripts: real input events (Input.*), screenshots and other CDP calls.
    let traceEvents = []; let traceDone = null;
    const smokeCall = async (payload) => {
      let req; try { req = JSON.parse(payload); } catch { return; }
      let result;
      // { trace: 'start' } / { trace: 'stop' }: a timeline trace; stop returns what was painted (count, area per layer)
      if (req.trace === 'start') {
        traceEvents = []; result = (await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' })).result || {};
      } else if (req.trace === 'stop') {
        const done = new Promise((r) => { traceDone = r; });
        await send('Tracing.end'); await done;
        const paints = traceEvents.filter((e) => e.name === 'Paint' && e.args?.data?.clip);
        const c = (n) => Math.max(0, Math.min(4096, n)); // a layer's clip can be 'infinite' (2^25 px): count what can be on screen
        const area = (q) => Math.abs((c(q[2]) - c(q[0])) * (c(q[5]) - c(q[1])));
        const byLayer = {};
        for (const e of paints) { const k = `layer ${e.args.data.layerId ?? '?'} node ${e.args.data.nodeId ?? '?'}`; const b = byLayer[k] ||= { n: 0, px: 0, ms: 0 }; b.n++; b.px += area(e.args.data.clip); b.ms += (e.dur || 0) / 1000; }
        const sum = (name) => traceEvents.filter((e) => e.name === name).reduce((a, e) => a + (e.dur || 0) / 1000, 0);
        result = { paints: paints.length, paintedPx: Math.round(paints.reduce((a, e) => a + area(e.args.data.clip), 0)), paintMs: Math.round(sum('Paint')), rasterMs: Math.round(sum('RasterTask')), layerizeMs: Math.round(sum('Layerize')), styleMs: Math.round(sum('UpdateLayoutTree')), layoutMs: Math.round(sum('Layout')), layouts: traceEvents.filter((e) => e.name === 'Layout').length, layoutObjects: traceEvents.filter((e) => e.name === 'Layout').reduce((a, e) => a + (e.args?.beginData?.dirtyObjects || 0), 0), styles: traceEvents.filter((e) => e.name === 'UpdateLayoutTree').length,
          top: Object.entries(byLayer).sort((a, b) => b[1].px - a[1].px).slice(0, 8).map(([k, v]) => `${k}: ${v.n}× ${Math.round(v.px / 1000)}k px ${Math.round(v.ms)} ms`) };
      } else if (req.shot) {
        const img = await send('Page.captureScreenshot', { format: 'png' });
        if (img.result?.data) { fs.mkdirSync(path.dirname(req.shot), { recursive: true }); fs.writeFileSync(req.shot, Buffer.from(img.result.data, 'base64')); }
        result = { saved: req.shot };
      } else result = (await send(req.cdp, req.params || {})).result || {};
      send('Runtime.evaluate', { expression: `window.__smokeReply && window.__smokeReply(${req.id}, ${JSON.stringify(JSON.stringify(result))})` });
    };
    await send('Runtime.addBinding', { name: '__smoke' });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const w = new Map(); let n = 0; window.__smokeReply = (id, r) => { w.get(id)?.(JSON.parse(r)); w.delete(id); }; window.SMOKE_SAVES = ${JSON.stringify(saveDir)}; window.smoke = (req) => new Promise((res) => { const id = ++n; w.set(id, res); window.__smoke(JSON.stringify({ ...req, id })); }); })();` });
    // --mac: the page believes it runs on a Mac (navigator.platform), so ⌘ / ⌥ labels and the ⌘-as-Ctrl key mapping
    // (ui.js) can be checked here; the main process stays Linux
    if (args.includes('--mac')) await send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });" });
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
    await send('Fetch.enable', { patterns: CDN_PATTERNS });
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await send('Page.reload', { ignoreCache: true });
    await new Promise((r) => setTimeout(r, waitMs));
    const CHECK_MS = Number(opt('--check-timeout', 90000));
    const run = async (expr) => {
      const r = await Promise.race([send('Runtime.evaluate', { expression: `(async () => { ${/\breturn\b/.test(expr) ? expr : `return (${expr})`} })()`, awaitPromise: true, returnByValue: true }),
        new Promise((res) => setTimeout(() => res({ result: { exceptionDetails: { text: `check still running after ${CHECK_MS / 1000}s (the page may have reloaded)` } } }), CHECK_MS))]);
      if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
      return { value: r.result?.result?.value };
    };
    const checks = [...evals];
    // --lib <file> (repeatable): shared helpers put in front of the --script body (e.g. dev/checks/journey-lib.js).
    const libFiles = args.flatMap((a, i) => (a === '--lib' ? [path.resolve(args[i + 1])] : []));
    // A check that uses a shared helper without its --lib gets it anyway (editor.js / cut.js used to fail plainly
    // with "J is not defined"): J → journey-lib, M → smooth-lib, decodeFrameCode → dev/editor-frames.js.
    if (scriptFile) {
      const body = fs.readFileSync(scriptFile, 'utf8');
      const AUTO = [[/\bJ\.\w|=\s*J;/, /\bconst J =/, 'checks/journey-lib.js'], [/\bM\.\w+\(|=\s*M;/, /\bconst M =/, 'checks/smooth-lib.js'], [/\bdecodeFrameCode\b/, /function decodeFrameCode/, 'editor-frames.js']];
      for (const [uses, defines, lib] of AUTO) {
        const f = path.join(__dirname, lib);
        if (uses.test(body) && !defines.test(body) && !libFiles.includes(f)) libFiles.push(f);
      }
    }
    const libs = libFiles.map((f) => fs.readFileSync(f, 'utf8'));
    // A line "//@@ reload" splits a check: the part before it runs, the window reloads (everything is read back from
    // disk, like a restart of the page), then the next part runs with the same helpers (state across: localStorage).
    if (scriptFile) for (const part of fs.readFileSync(scriptFile, 'utf8').split(/\n\/\/@@ reload\b[^\n]*\n/)) checks.push([...libs, part].join('\n'));
    for (const [ci, c] of checks.entries()) {
      if (ci > evals.length && scriptFile) {
        await send('Page.reload', {});
        await new Promise((r) => setTimeout(r, waitMs));
        for (let i = 0; i < 60; i++) { const ready = await run('document.readyState === "complete" && typeof H !== "undefined" && H.agents().length > 0'); if (ready.value === true) break; await new Promise((r) => setTimeout(r, 500)); }
      }
      const r = await run(c);
      console.log(`\n▶ ${c.length > 160 ? `${c.slice(0, 160)}…` : c}\n${r.error ? `✖ ${r.error}` : typeof r.value === 'string' ? r.value : JSON.stringify(r.value, null, 2)}`);
      if (r.error) problems.push(`check failed: ${r.error}`);
    }
    await new Promise((r) => setTimeout(r, 500));
    const img = await send('Page.captureScreenshot', { format: 'png' });
    if (img.result?.data) { fs.writeFileSync(shot, Buffer.from(img.result.data, 'base64')); console.log(`\nscreenshot: ${shot}`); }
    ws.close();
  } catch (err) {
    problems.push(`harness: ${err.message}`);
  } finally {
    try { execFileSync('pkill', ['-f', dir]); } catch { /* already gone */ }
    child.kill('SIGKILL');
    const mainErrors = log.join('').split('\n').filter((l) => /Error|Uncaught|TypeError|ReferenceError|SyntaxError/.test(l) && !IGNORE.some((re) => re.test(l)));
    for (const l of mainErrors.slice(0, 30)) problems.push(`main: ${l.trim()}`);
    if (!keep) { for (const d of [dir, userData]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* a helper process still writing; tmp is cleaned later */ } } }
    else console.log(`kept: ${dir}`);
  }
  if (problems.length) { console.log(`\n${problems.length} problem(s):\n${[...new Set(problems)].join('\n')}`); code = 1; } else console.log('\nOK: no page errors.');
  process.exit(code);
})();
