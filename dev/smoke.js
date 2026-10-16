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
//   node dev/smoke.js --fake-meshy --script dev/checks/apps-meshy.js   # app windows against dev/fake-meshy.js (no network)
//   node dev/smoke.js --fake-assets --script dev/checks/assets.js    # the asset library against dev/fake-assets.js
//   node dev/smoke.js --pw-chrome --script dev/checks/chrome.js     # Hearth's Chrome: Playwright's Chromium as "Chrome", test pages
//   node dev/smoke.js --screen 3840x2160 --dpr 2 --script dev/checks/bigscreen.js   # (round 38) a 4K screen at 200 %
//   node dev/smoke.js --coverage /tmp/cov.json --script dev/checks/trim-drive.js   # JS function + CSS rule coverage of the
//       page from the first byte (CDP Profiler precise coverage, CSS rule usage), written as JSON (dev/coverage-report.js reads it)
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
// (Chromium warns when the page capture's frame reader is cancelled with frames still queued: a GC note, not an app error)
const IGNORE = [/A VideoFrame was garbage collected without being closed/, /GPU|gpu_|viz|dri3|libva|vaInitialize|Vulkan|EGL|GLES|ANGLE/i, /net::ERR_/, /Autofill\./, /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_PROXY|ERR_TUNNEL/, /Electron Security Warning/, /favicon/i, /DevTools/, /dbus|org\.freedesktop/i, /Render frame was disposed before WebFrameMain could be accessed/, /seqsolid (boom|throws)/, /hearth-errorcalm-\d+/]; // (round 45) errors dev/checks/errorcalm.js provokes on purpose in its throwaway folder · (round 29) a message to a page that just crashed (dev/checks/safetynet.js crashes it on purpose)

// https://cdn.jsdelivr.net/npm/three@V/<path> -> /opt/cdn-cache/three@V/package/<path> (fetched once from the npm registry).
const CDN_CACHE = process.env.CDN_CACHE || '/opt/cdn-cache';
const CDN_PATTERNS = [{ urlPattern: 'https://cdn.jsdelivr.net/*', requestStage: 'Request' }, { urlPattern: 'https://img.hearth.test/*', requestStage: 'Request' }];
// (round 35, streamrender) https://img.hearth.test/<w>x<h>/<name>.png: a plain PNG of that size, answered after
// SMOKE_IMG_MS (default 400) like a slow network: pictures in streamed replies (dev/fake-huge.js) load late, as real ones do
function testPng(url) {
  const m = url.match(/^https:\/\/img\.hearth\.test\/(\d+)x(\d+)\/(\d*)/);
  if (!m) return null;
  const zlib = require('zlib');
  const [w, h, n] = [Math.min(4000, +m[1]), Math.min(4000, +m[2]), +m[3] || 0];
  const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) row.writeUIntBE(0x203040 + ((n * 2654435761) & 0x7f7f7f), 1 + x * 3, 3);
  const crcT = Array.from({ length: 256 }, (_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}
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
  // (round 48, bugbash3) dev/fake-codex.js speaks Codex's exec JSONL only; since Astra moved to the app-server
  // transport (codex-server.js, Codex's round 47 work) every Astra reply in a --fake-engines check failed to start.
  // The fake engines' scenarios run through the exec transport (still the agent's codexTransport: 'exec'); the
  // app-server path has its own fixture (dev/fake-codex-server.js: astra-connect / astra-workspace smokes, codex-server-test).
  if (args.includes('--fake-engines') && !env.HEARTH_CODEX_TRANSPORT) env.HEARTH_CODEX_TRANSPORT = 'exec';
  // --fake-meshy: a local fake of Meshy's API, Poly Haven's API and test web pages (dev/fake-meshy.js) for the apps
  // checks; the app finds it through HEARTH_MESHY_BASE (checks read it back with hub.apps.status().testBase)
  if (args.includes('--fake-meshy')) {
    const fake = await require('./fake-meshy').start();
    Object.assign(env, { HEARTH_MESHY_BASE: fake.base, HEARTH_POLYHAVEN_BASE: `${fake.base}/ph`, HEARTH_APPS_PARK_MS: '4000' });
  }
  // --fake-assets: (round 24) fake Poly Haven + ambientCG APIs for the asset library (dev/fake-assets.js), and a folder of
  // real asset files at /tmp/hearth-asset-fixtures (made here when missing)
  if (args.includes('--fake-assets')) {
    const FA = require('./fake-assets');
    const fake = await FA.start();
    if (!fs.existsSync('/tmp/hearth-asset-fixtures/kick_hit.wav')) FA.fixtures('/tmp/hearth-asset-fixtures');
    Object.assign(env, { HEARTH_POLYHAVEN_BASE: `${fake.base}/ph`, HEARTH_AMBIENTCG_BASE: `${fake.base}/acg` });
  }
  // --fake-obs: (round 25) a fake OBS Studio (obs-websocket v5 with a password: dev/fake-obs.js) for dev/checks/interop.js;
  // the check reads its address, password and state through hub.interop.test (main side, tests only)
  if (args.includes('--fake-obs')) {
    const f = await require('./fake-obs').start({ password: 'hearth-test-pw' });
    env.HEARTH_FAKE_OBS = JSON.stringify({ url: f.url, state: f.state, password: f.password });
  }
  // --pw-chrome: (round 30) Playwright's Chromium stands in for the owner's Google Chrome (dev/checks/chrome.js), with local
  // test pages (dev/fake-cdp.js pages: an app page, a sign-in popup, Google's refusal page on 127.0.0.1, a chat page)
  if (args.includes('--pw-chrome')) {
    const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const dirN = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
    const pages = await require('./fake-cdp').pages();
    Object.assign(env, { HEARTH_CHROME_PATH: path.join(root, dirN || 'chromium', 'chrome-linux', 'chrome'), HEARTH_CHROME_FLAGS: '--no-sandbox --disable-gpu --password-store=basic', HEARTH_CHROME_REJECT_HOSTS: '127.0.0.1', HEARTH_CHROME_TEST_BASE: pages.base });
  }
  // (round 38, bigscreen) --screen WxH: the virtual screen's size in pixels (default 1600x1000; 3840x2160 for a 4K monitor),
  // --dpr N: the screen's scale (Electron's --force-device-scale-factor: 2 = a Retina / 200 % screen, its size in points halves)
  const screenSize = /^\d{3,5}x\d{3,5}$/.test(opt('--screen', '')) ? opt('--screen') : '1600x1000';
  const dprFlag = Number(opt('--dpr', 0)) > 0 ? [`--force-device-scale-factor=${Number(opt('--dpr'))}`] : [];
  const winTest = process.platform === 'win32';
  const launchArgs = [dir, '--no-sandbox', ...dprFlag, `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, ...(process.env.SMOKE_GPU_FLAGS || '--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist').split(' ').filter(Boolean)];
  const child = spawn(winTest ? ELECTRON : 'xvfb-run', winTest ? launchArgs : ['-a', '-s', `-screen 0 ${screenSize}x24`, ELECTRON, ...launchArgs], { stdio: ['ignore', 'pipe', 'pipe'], detached: !winTest, windowsHide: true, env });
  // Kill Xvfb + Electron (their own process group) however the harness ends, so no stray instances pile up.
  let killed = false;
  const killAll = () => {
    if (killed || !child.pid) return; killed = true;
    if (winTest) { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* test process already gone */ } }
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } try { execFileSync('pkill', ['-9', '-f', dir]); } catch { /* gone */ } }
  };
  process.on('exit', killAll);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { killAll(); process.exit(1); });
  child.stdout.on('data', (d) => log.push(String(d)));
  child.stderr.on('data', (d) => log.push(String(d)));
  const problems = [];
  const warnings = [];
  let code = 0;
  // (round 35, bugbash2) a hang outside a check's own time limit (a CDP call the page never answers: the startup, a
  // reload, the last screenshot) kept the harness alive until run-checks' 30-minute limit (declutter-count: 26 min, no
  // log): past every part's time + 5 minutes it says so and quits (Xvfb and Electron go with it, see killAll)
  const parts = (scriptFile ? fs.readFileSync(scriptFile, 'utf8').split(/\n\/\/@@ reload\b/).length : 0) + evals.length;
  const deadline = Number(opt('--check-timeout', 90000)) * Math.max(1, parts) + 300000;
  setTimeout(() => { console.log(`\n1 problem(s):\nharness: still running after ${Math.round(deadline / 1000)} s (a call the page never answered)`); process.exit(1); }, deadline).unref();
  try {
    const ws = new WebSocket(await cdpConnect());
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    let id = 0; const pending = new Map(); const attached = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
      // CDN requests (three.js from jsdelivr) are answered from a local copy of the npm package, since this
      // container's network may not reach the CDN. Sandboxed iframes run in their own target: attach to them too.
      if (msg.method === 'Fetch.requestPaused') { if (process.env.SMOKE_DEBUG) console.log('cdn', msg.params.request.url, !!cdnFile(msg.params.request.url)); serveCdn(msg.params, msg.sessionId); return; }
      if (process.env.SMOKE_DEBUG && msg.method === 'Target.attachedToTarget') console.log('attached', msg.params.targetInfo.type, msg.params.targetInfo.url.slice(0, 80));
      if (msg.method === 'Target.attachedToTarget') {
        const sid = msg.params.sessionId;
        attached.push({ sid, id: msg.params.targetInfo.targetId }); // (a check's { cdp, target: 'three-sandbox' } goes to it)
        send('Fetch.enable', { patterns: CDN_PATTERNS }, sid);
        send('Runtime.enable', {}, sid);
        send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sid);
        send('Runtime.runIfWaitingForDebugger', {}, sid);
        return;
      }
      if (msg.method === 'CSS.styleSheetAdded' && !msg.sessionId) { sheets.set(msg.params.header.styleSheetId, msg.params.header); return; }
      if (msg.method === 'Runtime.bindingCalled' && msg.params.name === '__smoke') { smokeCall(msg.params.payload); return; }
      if (msg.method === 'Tracing.dataCollected') { traceEvents.push(...msg.params.value); return; }
      if (msg.method === 'Tracing.tracingComplete') { traceDone?.(); return; }
      if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') { snapChunks?.push(msg.params.chunk); return; } // (round 39, labmemory: { snapshot })
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const txt = `exception: ${d.exception?.description || d.text} @ ${d.url || ''}:${d.lineNumber}`;
        if (!/seqsolid (boom|throws)|scenedoctorGlow/.test(txt)) problems.push(txt); // (seqsolid, scenedoctor: a test scene throws on purpose)
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'log' && process.env.SMOKE_DEBUG) {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (text.startsWith('[J]')) console.log(text);
      }
      // (round 48, bugbash3) SMOKE_WARN=1: the page's console.warn lines are listed after the verdict (never a failure)
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'warning' && process.env.SMOKE_WARN) warnings.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
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
      const png = testPng(p.request.url);
      if (png) { setTimeout(() => send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'image/png' }, { name: 'Cache-Control', value: 'max-age=3600' }], body: png.toString('base64') }, sid), Number(process.env.SMOKE_IMG_MS || 400)); return; }
      const file = cdnFile(p.request.url);
      if (!file) { send('Fetch.continueRequest', { requestId: p.requestId }, sid); return; }
      const type = /\.m?js$/.test(file) ? 'text/javascript' : /\.json$/.test(file) ? 'application/json' : /\.wasm$/.test(file) ? 'application/wasm' : 'application/octet-stream';
      send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: fs.readFileSync(file).toString('base64') }, sid);
    };
    // The `smoke()` bridge for check scripts: real input events (Input.*), screenshots and other CDP calls.
    let traceEvents = []; let traceDone = null; let snapChunks = null;
    const sheets = new Map(); // styleSheetId → header (--coverage)
    const coverage = opt('--coverage');
    const smokeCall = async (payload) => {
      let req; try { req = JSON.parse(payload); } catch { return; }
      let result;
      // { trace: 'start' } / { trace: 'stop' }: a timeline trace; stop returns what was painted (count, area per layer)
      // (round 39, labmemory) { snapshot: file, target? }: a heap snapshot of the window (or an iframe target) saved to file
      if (req.snapshot) {
        const infos = req.target ? (await send('Target.getTargets', {})).result?.targetInfos || [] : [];
        const ids = new Set(infos.filter((x) => new RegExp(req.target).test(x.url)).map((x) => x.targetId));
        const t = req.target ? attached.filter((a) => ids.has(a.id)).pop() : null;
        snapChunks = [];
        await send('HeapProfiler.enable', {}, t?.sid); await send('HeapProfiler.takeHeapSnapshot', { reportProgress: false }, t?.sid);
        fs.writeFileSync(req.snapshot, snapChunks.join('')); result = { saved: req.snapshot, bytes: snapChunks.reduce((a, c) => a + c.length, 0) }; snapChunks = null;
      } else if (req.trace === 'start') {
        // (detail: also the top-level tasks and frame events, for dev/trace-stats.js: long tasks, forced layouts, input → paint)
        traceEvents = []; result = (await send('Tracing.start', { categories: `devtools.timeline,disabled-by-default-devtools.timeline${req.detail ? ',toplevel,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline.stack,blink.user_timing' : ''}${req.cats ? `,${req.cats}` : ''}`, transferMode: 'ReportEvents' })).result || {};
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
        if (req.detail) result.detail = require('./trace-stats.js').stats(traceEvents, req.detail);
        if (req.dump) fs.writeFileSync(req.dump, JSON.stringify(traceEvents));
      } else if (req.shot) {
        const img = await send('Page.captureScreenshot', { format: 'png' });
        if (img.result?.data) { fs.mkdirSync(path.dirname(req.shot), { recursive: true }); fs.writeFileSync(req.shot, Buffer.from(img.result.data, 'base64')); }
        result = { saved: req.shot };
      } else if (req.pageEval) {
        // (round 30) an expression in another window's page (an app window's chrome): the newest page whose URL matches
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        const t = list.filter((x) => x.type === 'page' && new RegExp(req.pageEval).test(x.url)).pop();
        if (!t) result = { error: `no page ${req.pageEval}` };
        else {
          const w = new WebSocket(t.webSocketDebuggerUrl);
          await new Promise((r, j) => { w.onopen = r; w.onerror = j; });
          result = await new Promise((r) => { w.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) r({ value: d.result?.result?.value, error: d.result?.exceptionDetails?.text }); }; w.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: req.expr, returnByValue: true, awaitPromise: true, userGesture: true } })); });
          w.close();
        }
      } else if (req.target) {
        // (round 21) a CDP call into an iframe target (the Lab preview runs in its own): the newest one whose URL matches
        const infos = (await send('Target.getTargets', {})).result?.targetInfos || [];
        const ids = new Set(infos.filter((x) => new RegExp(req.target).test(x.url)).map((x) => x.targetId));
        const t = attached.filter((a) => ids.has(a.id)).pop();
        result = t ? (await send(req.cdp, req.params || {}, t.sid)).result || {} : { error: `no target ${req.target}` };
      } else result = (await send(req.cdp, req.params || {})).result || {};
      send('Runtime.evaluate', { expression: `window.__smokeReply && window.__smokeReply(${req.id}, ${JSON.stringify(JSON.stringify(result))})` });
    };
    await send('Runtime.addBinding', { name: '__smoke' });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const w = new Map(); let n = 0; window.__smokeReply = (id, r) => { w.get(id)?.(JSON.parse(r)); w.delete(id); }; window.SMOKE_SAVES = ${JSON.stringify(saveDir)}; window.SMOKE_DEV = ${JSON.stringify(__dirname)}; window.smoke = (req) => new Promise((res) => { const id = ++n; w.set(id, res); window.__smoke(JSON.stringify({ ...req, id })); }); })();` });
    // --mac: the page believes it runs on a Mac (navigator.platform), so ⌘ / ⌥ labels and the ⌘-as-Ctrl key mapping
    // (ui.js) can be checked here; the main process stays Linux
    if (args.includes('--mac')) await send('Page.addScriptToEvaluateOnNewDocument', { source: "Object.defineProperty(Navigator.prototype, 'platform', { get: () => 'MacIntel' });" });
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
    await send('Fetch.enable', { patterns: CDN_PATTERNS });
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    if (coverage) {
      await send('Profiler.enable'); await send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
      await send('DOM.enable'); await send('CSS.enable'); await send('CSS.startRuleUsageTracking');
    }
    await send('Page.reload', { ignoreCache: true });
    if (coverage) { await new Promise((r) => setTimeout(r, 300)); await send('CSS.enable'); await send('CSS.startRuleUsageTracking'); }
    await new Promise((r) => setTimeout(r, waitMs));
    const CHECK_MS = Number(opt('--check-timeout', 90000));
    // (round 35, bugbash2) an --eval of several statements ("window.A='x'; window.B='y'", qa-ui's header) runs as they are;
    // wrapped in return (…) it was a SyntaxError and the check never ran
    const run = async (expr) => {
      const r = await Promise.race([send('Runtime.evaluate', { expression: `(async () => { ${/\breturn\b/.test(expr) || /;\s*\S/.test(expr.trim()) ? expr : `return (${expr})`} })()`, awaitPromise: true, returnByValue: true }),
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
      // LF → labframes-lib (which itself uses J, so the helpers already added count as users too)
      const AUTO = [[/\bLF\.\w|=\s*LF;/, /\bconst LF =/, 'checks/labframes-lib.js'], [/\bJ\.\w|=\s*J;/, /\bconst J =/, 'checks/journey-lib.js'], [/\bM\.\w+\(|=\s*M;/, /\bconst M =/, 'checks/smooth-lib.js'], [/\bdecodeFrameCode\b/, /function decodeFrameCode/, 'editor-frames.js'], [/\bSQL\.\w|=\s*SQL;/, /\bconst SQL =/, 'checks/sequence-lib.js'], [/\bBS\.run\(/, /\bconst BS =/, 'checks/bigscreen-lib.js']];
      for (const [uses, defines, lib] of AUTO) {
        const f = path.join(__dirname, lib);
        const users = [body, ...libFiles.map((x) => fs.readFileSync(x, 'utf8'))].join('\n');
        if (uses.test(users) && !defines.test(body) && !libFiles.includes(f)) libFiles.push(f);
      }
      // a helper that uses another one goes after it (labframes-lib needs J from journey-lib)
      const order = ['journey-lib.js', 'smooth-lib.js', 'editor-frames.js', 'labframes-lib.js', 'sequence-lib.js'];
      libFiles.sort((a, b) => (order.indexOf(path.basename(a)) + 1 || 99) - (order.indexOf(path.basename(b)) + 1 || 99));
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
      // (round 44, capturefix2) the groups that load by themselves after the first screen (every tier but 'use') are in
      // before a check runs: on a loaded machine `Capture` was still a stand-in (undefined) after --wait, and
      // capture-record failed at its first line. Up to 30 s; --no-lazy-wait keeps the old timing (boot checks).
      if (scriptFile && ci >= evals.length && !args.includes('--no-lazy-wait')) {
        // (and the page is up: chatcalm once ran into a window still loading, "H is not defined")
        for (let i = 0; i < 60; i++) { const ready = await run('document.readyState === "complete" && (typeof H !== "undefined" || !/index\\.html/.test(location.href)) && (!window.Lazy || localStorage.getItem("lazy.hold") === "1" || Lazy.state().every((g) => g.tier === "use" || (g.state !== "stub" && g.state !== "loading")))'); if (ready.value === true) break; await new Promise((r) => setTimeout(r, 500)); }
      }
      const r = await run(c);
      console.log(`\n▶ ${c.length > 160 ? `${c.slice(0, 160)}…` : c}\n${r.error ? `✖ ${r.error}` : typeof r.value === 'string' ? r.value : JSON.stringify(r.value, null, 2)}`);
      if (r.error) problems.push(`check failed: ${r.error}`);
    }
    await new Promise((r) => setTimeout(r, 500));
    if (coverage) {
      const js = (await send('Profiler.takePreciseCoverage')).result?.result || [];
      const rules = (await send('CSS.stopRuleUsageTracking')).result?.ruleUsage || [];
      const css = [];
      for (const [sid, h] of sheets) {
        if (!h.sourceURL || !/^file:/.test(h.sourceURL)) continue;
        const text = (await send('CSS.getStyleSheetText', { styleSheetId: sid })).result?.text || '';
        css.push({ url: h.sourceURL, text, rules: rules.filter((r) => r.styleSheetId === sid).map((r) => [r.startOffset, r.endOffset, r.used ? 1 : 0]) });
      }
      fs.writeFileSync(coverage, JSON.stringify({ js: js.filter((s) => /^file:/.test(s.url)), css }));
      console.log(`\ncoverage: ${coverage} (${js.length} scripts, ${css.length} stylesheets)`);
    }
    const img = await send('Page.captureScreenshot', { format: 'png' });
    if (img.result?.data) { fs.writeFileSync(shot, Buffer.from(img.result.data, 'base64')); console.log(`\nscreenshot: ${shot}`); }
    ws.close();
  } catch (err) {
    problems.push(`harness: ${err.message}`);
  } finally {
    killAll();
    const mainErrors = log.join('').split('\n').filter((l) => /Error|Uncaught|TypeError|ReferenceError|SyntaxError/.test(l) && !IGNORE.some((re) => re.test(l)));
    for (const l of mainErrors.slice(0, 30)) problems.push(`main: ${l.trim()}`);
    if (!keep) { for (const d of [dir, userData]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* a helper process still writing; tmp is cleaned later */ } } }
    else console.log(`kept: ${dir}`);
  }
  if (problems.length) { console.log(`\n${problems.length} problem(s):\n${[...new Set(problems)].join('\n')}`); code = 1; } else console.log('\nOK: no page errors.');
  if (warnings.length) console.log(`\nwarnings (${warnings.length}, not failures):\n${[...new Set(warnings)].slice(0, 40).join('\n')}`);
  process.exit(code);
})();
