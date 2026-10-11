#!/usr/bin/env node
// Long-session soak test (round 20): does Hearth get heavier the longer it stays open? Launches a throwaway copy
// (like dev/smoke.js: empty data/, fake engines, a fake cloud folder for sync, dev/fake-meshy.js pages for the app
// windows) and drives a realistic session with real input (CDP mouse / keyboard / wheel) for N minutes, cycle after
// cycle (dev/soak-page.js): chats sent / switched / scrolled (Claude + Astra), the Lab (scene switches, sequence
// playback, a 3D model layer added and removed, slider shuffles), the board (wheel zoom, middle-button pan, items
// added and removed), app windows opened / hidden / closed, the Commands page (search, hover previews), menus and
// right-click menus, the palette, renders (a tracked job + a small real ffmpeg transcode), sync passes.
// Every --every seconds (default 60) it pauses the driver and samples, after a forced GC:
//   renderer JS heap, Lab preview heap (its own process), app windows' heaps, DOM nodes / documents / JS listeners
//   (Memory.getDOMCounters), detached nodes (DOM.getDetachedDomNodes, or nodes − attached), listeners on window +
//   document (DOMDebugger.getEventListeners), live intervals / observers / object URLs / rAF loops (counted by a
//   preload wrapper in every frame), WebGL contexts + three.js geometries / textures in the Lab, the GPU process'
//   memory, main-process RSS / heap / handles (fs watchers, child processes, timers, sockets) / IPC listeners /
//   windows, and frame time p95 while a chat scrolls.
// Then prints a trend table and flags every metric that grows linearly (least-squares slope per hour after the
// warm-up, R² ≥ 0.6, and a real amount), and exits 1 when something grows (--no-fail to only report).
//
//   node dev/soak.js                      # 20 minutes, a sample a minute
//   node dev/soak.js --minutes 3 --every 30 --json /tmp/soak.json
//   node dev/soak.js --minutes 4 --freshen      # also checks Freshen: a reload that keeps chats / drafts / Lab / scroll
//   --diff: heap snapshots (renderer + main) after the warm-up and at the end, what grew by constructor
//   --retainers [class,…]: the shortest path from a GC root to the biggest detached DOM trees (who keeps them)
//   --no-fail: report only (exit 0 even when something grows)
// Env: ELECTRON (default /opt/hearth-electron/electron). Uses 1–2 CPUs for the whole run.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const MINUTES = Number(opt('--minutes', 20));
const EVERY = Number(opt('--every', 60)) * 1000;
const WARMUP = Number(opt('--warmup', Math.min(3, MINUTES / 4))) * 60000; // trends start after this
const JSON_OUT = opt('--json');
const ELECTRON = process.env.ELECTRON || '/opt/hearth-electron/electron';
const PORT = 9400 + Math.floor(Math.random() * 400);
const MPORT = PORT + 400; // the main process' inspector
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CDN_CACHE = process.env.CDN_CACHE || '/opt/cdn-cache';
const CDN_PATTERNS = [{ urlPattern: 'https://cdn.jsdelivr.net/*', requestStage: 'Request' }];
const IGNORE = [/A VideoFrame was garbage collected/, /GPU|gpu_|viz|dri3|libva|vaInitialize|Vulkan|EGL|GLES|ANGLE/i, /net::ERR_/, /Autofill\./, /Electron Security Warning/, /favicon/i, /DevTools/, /dbus|org\.freedesktop/i];

function cdnFile(url) {
  const m = url.match(/^https:\/\/cdn\.jsdelivr\.net\/npm\/([^@/]+)@([^/]+)\/([^?#]*)/);
  if (!m) return null;
  const root = path.join(CDN_CACHE, `${m[1]}@${m[2]}`, 'package');
  if (!fs.existsSync(root)) {
    try { fs.mkdirSync(path.dirname(root), { recursive: true }); execFileSync('sh', ['-c', `curl -fsSL "https://registry.npmjs.org/${m[1]}/-/${m[1]}-${m[2]}.tgz" | tar -xz -C "${path.dirname(root)}"`]); } catch { return null; }
  }
  const file = path.join(root, m[3]);
  return file.startsWith(root) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}
function copyApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-soak-'));
  const skip = new Set(['.git', 'data', 'electron', 'electron-mac', 'node_modules', 'dev']);
  for (const n of fs.readdirSync(ROOT)) if (!skip.has(n)) fs.cpSync(path.join(ROOT, n), path.join(dir, n), { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  pkg.name = 'hearth-soak-test';
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  const cfgPath = path.join(dir, 'config.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.settings = { ...(cfg.settings || {}), enginePaths: { claude: path.join(__dirname, 'fake-claude.js'), codex: path.join(__dirname, 'fake-codex.js') } };
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  return dir;
}
function fixtures(tmp) {
  const song = '/tmp/hearth-test-song.wav';
  if (!fs.existsSync(song)) execFileSync('node', [path.join(__dirname, 'make-test-song.js'), song], { stdio: 'ignore' });
  const clip = path.join(tmp, 'soak-clip.mp4');
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=15', '-t', '1', '-pix_fmt', 'yuv420p', clip]); } catch { /* no ffmpeg: renders only tracked */ }
  return { song, clip: fs.existsSync(clip) ? clip : null };
}

// ---------- a tiny CDP client ----------
function cdp(url) {
  const ws = new WebSocket(url);
  let id = 0; const pending = new Map(); const handlers = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    for (const h of handlers) h(msg);
  };
  const send = (method, params = {}, sessionId, ms = 60000) => new Promise((r) => {
    const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
    setTimeout(() => { if (pending.has(i)) { pending.delete(i); r({ error: { message: `${method} timed out` } }); } }, ms);
  });
  return { ready: new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }), send, on: (h) => handlers.push(h), close: () => ws.close() };
}
const list = async (port) => (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
async function waitTarget(port, pick, tries = 80) {
  for (let i = 0; i < tries; i++) { try { const t = (await list(port)).find(pick); if (t) return t; } catch { /* not up */ } await wait(500); }
  throw new Error(`no target on port ${port}`);
}

// ---------- the counters every frame gets before its own scripts (live intervals, observers, object URLs, rAF) ----------
const PROBE = `(() => { if (window.__soakProbe) return; const P = window.__soakProbe = { intervals: new Map(), urls: new Map(), obs: new Set(), raf: 0, rafIds: new Set(), made: { intervals: 0, urls: 0, obs: 0 } };
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = function (fn, ms, ...a) { const id = si.call(this, fn, ms, ...a); P.intervals.set(id, String(new Error().stack || '').split('\\n').slice(2, 4).join(' ').replace(/\\s+/g, ' ').slice(0, 160)); P.made.intervals++; return id; };
  window.clearInterval = function (id) { P.intervals.delete(id); return ci.call(this, id); };
  const cu = URL.createObjectURL, ru = URL.revokeObjectURL;
  URL.createObjectURL = function (b) { const u = cu.call(URL, b); P.urls.set(u, [b?.size || 0, String(new Error().stack || '').split('\\n')[2]?.trim().slice(0, 140)]); P.made.urls++; return u; };
  URL.revokeObjectURL = function (u) { P.urls.delete(u); return ru.call(URL, u); };
  for (const name of ['ResizeObserver', 'MutationObserver', 'IntersectionObserver', 'PerformanceObserver']) {
    const C = window[name]; if (!C) continue;
    const proto = C.prototype; const ob = proto.observe, dc = proto.disconnect;
    proto.observe = function (...a) { if (!this.__soakAt) { this.__soakAt = name + ' ' + String(new Error().stack || '').split('\\n')[2]?.trim().slice(0, 120); P.obs.add(new WeakRef(this)); P.made.obs++; } this.__soakOn = true; return ob.apply(this, a); };
    proto.disconnect = function () { this.__soakOn = false; return dc.call(this); };
  }
  // WebGL: live contexts (not lost, not collected), their textures / buffers / framebuffers (made − deleted) and a GPU
  // memory estimate (drawing buffers + texture uploads, width × height × 4)
  const ctxs = new Set(); const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...a) { const c = gc.call(this, type, ...a); if (c && /webgl/.test(type) && !c.__soak) { c.__soak = { tex: new Map(), buf: 0, fb: 0 }; ctxs.add(new WeakRef(c)); } return c; };
  for (const G of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
    const pr = G.prototype; const w = (n, f) => { const o = pr[n]; pr[n] = function (...a) { const r = o.apply(this, a); try { if (this.__soak) f(this.__soak, a, r, this); } catch {} return r; }; };
    w('createTexture', (s, a, r) => s.tex.set(r, 0)); w('deleteTexture', (s, a) => s.tex.delete(a[0]));
    w('createBuffer', (s) => s.buf++); w('deleteBuffer', (s, a) => { if (a[0]) s.buf--; });
    w('createFramebuffer', (s) => s.fb++); w('deleteFramebuffer', (s, a) => { if (a[0]) s.fb--; });
    w('bindTexture', (s, a) => { s.bound = a[1]; });
    const up = (s, a) => { const w2 = typeof a[3] === 'number' && typeof a[4] === 'number' ? a[3] * a[4] : (a[5]?.width || a[5]?.videoWidth || 0) * (a[5]?.height || a[5]?.videoHeight || 0); if (s.bound && s.tex.has(s.bound)) s.tex.set(s.bound, w2 * 4); };
    w('texImage2D', up); w('texStorage2D', (s, a) => { if (s.bound && s.tex.has(s.bound)) s.tex.set(s.bound, a[2] * a[3] * 4 * Math.max(1, a[1] / 2)); });
  }
  P.gl = () => { let n = 0, tex = 0, buf = 0, fb = 0, bytes = 0; for (const r of [...ctxs]) { const c = r.deref(); if (!c || c.isContextLost()) { ctxs.delete(r); continue; } n++; tex += c.__soak.tex.size; buf += c.__soak.buf; fb += c.__soak.fb; bytes += c.drawingBufferWidth * c.drawingBufferHeight * 4 * 3; for (const b of c.__soak.tex.values()) bytes += b; } return { contexts: n, tex, buf, fb, mb: Math.round(bytes / 1e5) / 10 }; };
  // event listeners, by where they were added (added − removed; a collected target drops its own)
  const ae = EventTarget.prototype.addEventListener, rl = EventTarget.prototype.removeEventListener;
  const per = new WeakMap(); P.sites = new Map();
  const dec = (site, n = 1) => { const v = (P.sites.get(site) || 0) - n; if (v > 0) P.sites.set(site, v); else P.sites.delete(site); };
  const fr = new FinalizationRegistry((counts) => { for (const [site, n] of counts) dec(site, n); });
  const siteOf = () => { const l = String(new Error().stack || '').split('\\n').slice(3, 5).map((x) => x.trim().replace(/^at /, '').replace(/\\(?file:\\/\\/\\/[^)]*\\/([^/)]+:\\d+):\\d+\\)?/, '$1')); return l.join(' < ').slice(0, 150); };
  EventTarget.prototype.addEventListener = function (type, fn, o) {
    const r = ae.call(this, type, fn, o);
    try { if (fn && !(o && o.once)) { const k = type + '|' + (typeof o === 'boolean' ? o : Boolean(o?.capture)); let rec = per.get(this); if (!rec) { rec = { fns: new Map(), counts: new Map() }; per.set(this, rec); fr.register(this, rec.counts); }
      const key = k + '|'; let m = rec.fns.get(key); if (!m) rec.fns.set(key, m = new Map());
      if (!m.has(fn)) { const site = type + ' ' + siteOf(); m.set(fn, site); rec.counts.set(site, (rec.counts.get(site) || 0) + 1); P.sites.set(site, (P.sites.get(site) || 0) + 1);
        if (o?.signal) { const t = this; o.signal.addEventListener?.('abort', () => { if (m.get(fn) === site) { m.delete(fn); rec.counts.set(site, rec.counts.get(site) - 1); dec(site); } }, { once: true }); } } } } catch {}
    return r; };
  EventTarget.prototype.removeEventListener = function (type, fn, o) {
    try { const rec = per.get(this); const m = rec?.fns.get(type + '|' + (typeof o === 'boolean' ? o : Boolean(o?.capture)) + '|'); const site = m?.get(fn); if (site) { m.delete(fn); rec.counts.set(site, rec.counts.get(site) - 1); dec(site); } } catch {}
    return rl.call(this, type, fn, o); };
  // requestAnimationFrame callbacks run (a page that keeps drawing while nobody sees it shows here)
  const raf = window.requestAnimationFrame; P.rafCalls = 0;
  window.requestAnimationFrame = function (fn) { return raf.call(window, (t) => { P.rafCalls++; fn(t); }); };
  P.live = () => { const by = {}; let n = 0; for (const r of [...P.obs]) { const o = r.deref(); if (!o) { P.obs.delete(r); continue; } if (!o.__soakOn) continue; n++; by[o.__soakAt] = (by[o.__soakAt] || 0) + 1; }
    const iv = {}; for (const s of P.intervals.values()) iv[s] = (iv[s] || 0) + 1;
    const ub = {}; let bytes = 0; for (const [, [b, s]] of P.urls) { bytes += b; ub[s] = (ub[s] || 0) + 1; }
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => v + '× ' + k);
    const ls = {}; for (const [k, v] of P.sites) if (v >= 3) ls[k] = v;
    const dom = {}; for (const e of document.querySelectorAll('[id], body > *, .surface, .tool-surface, .chat-view')) { const k = e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className?.baseVal ?? e.className).split(' ')[0]; const n = e.getElementsByTagName('*').length; if (n >= 40) dom[k] = Math.max(dom[k] || 0, n); }
    return { raf: P.rafCalls, at: performance.now(), hidden: document.hidden, intervals: P.intervals.size, observers: n, urls: P.urls.size, urlMB: Math.round(bytes / 1e5) / 10, made: { ...P.made }, topIntervals: top(iv), topObservers: top(by), topUrls: top(ub), byObserver: by, byInterval: iv, byListener: ls, byDom: dom }; };
})();`;

// what the main process reports (evaluated in its inspector)
const MAIN_EXPR = `(() => { const r = process.mainModule.require; const { app, ipcMain, BrowserWindow, webContents } = r('electron');
  const handles = {}; for (const h of process._getActiveHandles()) { const k = h?.constructor?.name || typeof h; handles[k] = (handles[k] || 0) + 1; }
  const res = {}; for (const k of process.getActiveResourcesInfo?.() || []) res[k] = (res[k] || 0) + 1;
  let ipc = 0; for (const n of ipcMain.eventNames()) ipc += ipcMain.listenerCount(n);
  const handlersMap = ipcMain._invokeHandlers; const invoke = handlersMap?.size ?? null;
  const metrics = app.getAppMetrics(); const by = {}; for (const m of metrics) by[m.type] = (by[m.type] || 0) + (m.memory?.workingSetSize || 0);
  const mu = process.memoryUsage();
  return JSON.stringify({ rss: mu.rss, heap: mu.heapUsed, external: mu.external, handles, res, ipc, invoke, windows: BrowserWindow.getAllWindows().length, contents: webContents.getAllWebContents().length,
    procKB: by, sites: Object.fromEntries([...(global.__soakWatch || [])].filter(([, n]) => n > 0)), appListeners: app.eventNames().reduce((a, n) => a + app.listenerCount(n), 0) }); })()`;

// a heap snapshot summed by constructor / kind: { name: [count, selfBytes] } (for --diff: what the heap gained)
async function snapSummary(client, sid) {
  const chunks = []; let done = false;
  client.on((m) => { if (!done && m.method === 'HeapProfiler.addHeapSnapshotChunk' && m.sessionId === sid) chunks.push(m.params.chunk); });
  await client.send('HeapProfiler.collectGarbage', {}, sid);
  await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false }, sid, 300000);
  done = true;
  const snap = JSON.parse(chunks.join('')); chunks.length = 0;
  const m = snap.snapshot.meta; const NF = m.node_fields.length; const nT = m.node_types[0]; const N = snap.nodes; const S = snap.strings;
  const fT = m.node_fields.indexOf('type'); const fN = m.node_fields.indexOf('name'); const fS = m.node_fields.indexOf('self_size');
  const out = {};
  for (let i = 0; i < N.length; i += NF) {
    const t = nT[N[i + fT]]; if (t === 'hidden' || t === 'synthetic') continue;
    const k = t === 'object' || t === 'native' ? String(S[N[i + fN]]).slice(0, 60) : `(${t})`;
    const o = out[k] ||= [0, 0]; o[0]++; o[1] += N[i + fS];
  }
  return out;
}
function snapDiff(a, b, top = 10) {
  return Object.keys(b).map((k) => [k, b[k][0] - (a[k]?.[0] || 0), b[k][1] - (a[k]?.[1] || 0)]).filter(([, n, sz]) => n > 0 && sz > 0).sort((x, y) => y[2] - x[2]).slice(0, top)
    .map(([k, n, sz]) => `  +${n} ${k} (+${Math.round(sz / 1024)} KB)`).join('\n');
}

// shortest strong retaining path from a GC root to each object holding a SoakLeak_* marker (heap snapshot JSON)
function retainers(snap) {
  const m = snap.snapshot.meta; const NF = m.node_fields.length; const EF = m.edge_fields.length;
  const nT = m.node_types[0]; const eT = m.edge_types[0]; const S = snap.strings; const N = snap.nodes; const E = snap.edges;
  const fName = m.node_fields.indexOf('name'); const fEc = m.node_fields.indexOf('edge_count'); const fType = m.node_fields.indexOf('type');
  const count = N.length / NF; const first = new Uint32Array(count + 1);
  for (let i = 0, e = 0; i < count; i++) { first[i] = e; e += N[i * NF + fEc] * EF; } first[count] = E.length;
  const rev = Array.from({ length: count }, () => []);
  for (let i = 0; i < count; i++) for (let e = first[i]; e < first[i + 1]; e += EF) { const t = eT[E[e]]; if (t === 'weak' || t === 'shortcut') continue; rev[E[e + 2] / NF].push(i, e); }
  const name = (i) => S[N[i * NF + fName]]; const type = (i) => nT[N[i * NF + fType]];
  const edgeName = (e) => { const t = eT[E[e]]; return t === 'element' || t === 'hidden' ? `[${E[e + 1]}]` : String(S[E[e + 1]]); };
  const out = [];
  for (let i = 0; i < count; i++) {
    if (!/^SoakLeak_/.test(name(i)) || type(i) !== 'object') continue;
    const holder = rev[i].length ? rev[i][0] : null; if (holder == null) continue;
    // BFS backwards from the element to a root
    const prev = new Map([[holder, null]]); const q = [holder]; let root = null;
    while (q.length && root == null) { const x = q.shift(); if (/^\(GC roots\)|^\(Global handles\)|^Window \/|^system \/ NativeContext/.test(name(x)) || type(x) === 'synthetic') { root = x; break; } const r = rev[x]; for (let k = 0; k < r.length; k += 2) { const from = r[k]; if (from === i || prev.has(from)) continue; prev.set(from, [x, r[k + 1]]); q.push(from); } }
    const path = []; let x = root;
    while (x != null && prev.get(x)) { const [to, e] = prev.get(x); path.push(`${type(x) === 'closure' ? 'ƒ ' : ''}${String(name(x)).slice(0, 50)} .${edgeName(e)}`); x = to; }
    out.push(`  ${name(i)}: ${path.join(' → ') || '(no strong path)'} → ${name(holder).slice(0, 40)}`);
  }
  return out.join('\n') || '  (no marked objects found)';
}

(async () => {
  const dir = copyApp();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-soak-profile-'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-soak-fix-'));
  const fx = fixtures(tmp);
  const cloud = path.join(tmp, 'cloud');
  fs.mkdirSync(cloud, { recursive: true }); fs.writeFileSync(path.join(cloud, '.keep'), '');
  const fake = await require('./fake-meshy').start();
  const env = { ...process.env, HEARTH_TEST_SAVE_DIR: path.join(tmp, 'saves'), HEARTH_MESHY_BASE: fake.base, HEARTH_POLYHAVEN_BASE: `${fake.base}/ph`, HEARTH_APPS_PARK_MS: '20000' };
  fs.mkdirSync(env.HEARTH_TEST_SAVE_DIR, { recursive: true });
  const flags = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
  const child = spawn('xvfb-run', ['-a', '-s', '-screen 0 1600x1000x24', ELECTRON, `--inspect=${MPORT}`, dir, '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`, ...flags], { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env });
  const killAll = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } try { execFileSync('pkill', ['-9', '-f', dir]); } catch { /* gone */ } };
  process.on('exit', killAll);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { killAll(); process.exit(1); });
  const log = []; child.stdout.on('data', (d) => log.push(String(d))); child.stderr.on('data', (d) => log.push(String(d)));
  const problems = []; const samples = []; const t0 = Date.now();
  let code = 0;
  try {
    const page = await waitTarget(PORT, (t) => t.type === 'page' && /index\.html/.test(t.url));
    const R = cdp(page.webSocketDebuggerUrl); await R.ready;
    const iframes = new Map(); // sessionId → url (the Lab preview runs in its own process)
    const serveCdn = (p, sid) => {
      const file = cdnFile(p.request.url);
      if (!file) { R.send('Fetch.continueRequest', { requestId: p.requestId }, sid); return; }
      const type = /\.m?js$/.test(file) ? 'text/javascript' : /\.json$/.test(file) ? 'application/json' : /\.wasm$/.test(file) ? 'application/wasm' : 'application/octet-stream';
      R.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Access-Control-Allow-Origin', value: '*' }], body: fs.readFileSync(file).toString('base64') }, sid);
    };
    R.on((msg) => {
      if (msg.method === 'Fetch.requestPaused') return serveCdn(msg.params, msg.sessionId);
      if (msg.method === 'Target.attachedToTarget') {
        const sid = msg.params.sessionId;
        iframes.set(sid, { type: msg.params.targetInfo.type, url: msg.params.targetInfo.url });
        R.send('Fetch.enable', { patterns: CDN_PATTERNS }, sid); R.send('Runtime.enable', {}, sid); R.send('Page.enable', {}, sid);
        R.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE }, sid);
        R.send('Runtime.evaluate', { expression: PROBE }, sid);
        R.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sid);
        R.send('Runtime.runIfWaitingForDebugger', {}, sid);
        return;
      }
      if (msg.method === 'Target.detachedFromTarget') { iframes.delete(msg.params.sessionId); return; }
      if (msg.method === 'Runtime.bindingCalled' && msg.params.name === '__smoke') return smokeCall(msg.params.payload);
      if (msg.method === 'Runtime.exceptionThrown' && !msg.sessionId) { const d = msg.params.exceptionDetails; problems.push(`exception: ${(d.exception?.description || d.text).split('\n')[0]} @ ${d.url || ''}:${d.lineNumber}`); }
      if (msg.method === 'Runtime.consoleAPICalled' && !msg.sessionId && msg.params.type === 'error') {
        const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
        if (!IGNORE.some((re) => re.test(text))) problems.push(`console.error: ${text.slice(0, 200)}`);
      }
    });
    // the smoke() bridge (real input for J.click / J.key / J.type in journey-lib, pictures)
    const smokeCall = async (payload) => {
      let req; try { req = JSON.parse(payload); } catch { return; }
      let result;
      if (req.shot) { const img = await R.send('Page.captureScreenshot', { format: 'png' }); if (img.result?.data) fs.writeFileSync(req.shot, Buffer.from(img.result.data, 'base64')); result = { saved: req.shot }; } else result = (await R.send(req.cdp, req.params || {})).result || {};
      R.send('Runtime.evaluate', { expression: `window.__smokeReply && window.__smokeReply(${req.id}, ${JSON.stringify(JSON.stringify(result))})` });
    };
    await R.send('Runtime.addBinding', { name: '__smoke' });
    await R.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const w = new Map(); let n = 0; window.__smokeReply = (id, r) => { w.get(id)?.(JSON.parse(r)); w.delete(id); }; window.SMOKE_SAVES = ${JSON.stringify(env.HEARTH_TEST_SAVE_DIR)}; window.smoke = (req) => new Promise((res) => { const id = ++n; w.set(id, res); window.__smoke(JSON.stringify({ ...req, id })); }); })();` });
    await R.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
    await R.send('Runtime.enable'); await R.send('Page.enable');
    await R.send('Fetch.enable', { patterns: CDN_PATTERNS });
    await R.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
    await R.send('Page.reload', { ignoreCache: true });
    const run = async (expr, ms = 240000, sid) => {
      const r = await R.send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }, sid, ms);
      if (r.error) return { error: r.error.message };
      if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description?.split('\n')[0] || r.result.exceptionDetails.text };
      return { value: r.result?.result?.value };
    };
    const ready = async () => { for (let i = 0; i < 120; i++) { const r = await run('return document.readyState === "complete" && typeof H !== "undefined" && H.agents().length > 0 && typeof Native !== "undefined"', 5000); if (r.value === true) return true; await wait(500); } return false; };
    if (!(await ready())) throw new Error('the app never got ready');
    await wait(3000);
    const lib = fs.readFileSync(path.join(__dirname, 'checks', 'journey-lib.js'), 'utf8').replace(/^const J = /m, 'window.J = ');
    const drive = fs.readFileSync(path.join(__dirname, 'soak-page.js'), 'utf8');
    const inject = async () => { const r = await run(`if (!window.J) { ${lib} } if (!window.Soak) { ${drive} } return typeof Soak`); if (r.error) throw new Error(`inject: ${r.error}`); };
    // ---------- the main process' inspector ----------
    let M = null;
    try { const mt = await waitTarget(MPORT, (t) => t.type === 'node' || /main|node/i.test(t.title + t.url) || true, 20); M = cdp(mt.webSocketDebuggerUrl); await M.ready; await M.send('Runtime.enable'); } catch (err) { problems.push(`main inspector: ${err.message}`); }
    // fs watchers by where they were made (fs.watch / fs.watchFile wrapped from now on)
    if (M) await M.send('Runtime.evaluate', { expression: `(() => { const fs = process.mainModule.require('fs'); if (fs.__soak) return; const sites = global.__soakWatch = new Map(); fs.__soak = true;
      const where = () => { Error.stackTraceLimit = 40; return String(new Error().stack).split('\\n').slice(2, 40).filter((l) => !/node:|<anonymous>/.test(l)).slice(0, 2).map((l) => l.trim().replace(/^at /, '').replace(/\\(?\\/[^)]*\\/([^/)]+:\\d+):\\d+\\)?/, '$1')).join(' < '); };
      const w = fs.watch; fs.watch = function (...a) { const h = w.apply(this, a); const k = where(); sites.set(k, (sites.get(k) || 0) + 1); h.once('close', () => sites.set(k, sites.get(k) - 1)); return h; };
      const cp = process.mainModule.require('child_process'); for (const n of ['spawn', 'execFile', 'exec', 'fork']) { const f = cp[n]; cp[n] = function (...a) { const c = f.apply(this, a); const k = n + ' ' + where(); sites.set(k, (sites.get(k) || 0) + 1); c.once?.('exit', () => sites.set(k, sites.get(k) - 1)); return c; }; } })()` });
    await inject();
    const setup = await run(`return JSON.stringify(await Soak.setup(${JSON.stringify({ cloud, song: fx.song, clip: fx.clip, glbDir: tmp })}))`, 300000);
    console.log(`setup: ${setup.error || setup.value}`);
    if (setup.error) problems.push(`setup: ${setup.error}`);

    const mainSample = async () => {
      if (!M) return null;
      await M.send('HeapProfiler.collectGarbage');
      const r = await M.send('Runtime.evaluate', { expression: MAIN_EXPR, returnByValue: true });
      try { return JSON.parse(r.result.result.value); } catch { return { error: r.result?.exceptionDetails?.exception?.description?.split('\n')[0] || 'no value' }; }
    };
    // app windows: each its own page target (not the hub, not the Lab's stage)
    const appSample = async () => {
      let n = 0; let heap = 0; let nodes = 0;
      for (const t of (await list(PORT)).filter((x) => x.type === 'page' && !/index\.html|devtools:/.test(x.url))) {
        try {
          const A = cdp(t.webSocketDebuggerUrl); await A.ready;
          await A.send('HeapProfiler.collectGarbage', {}, undefined, 8000);
          const h = await A.send('Runtime.getHeapUsage', {}, undefined, 8000); const d = await A.send('Memory.getDOMCounters', {}, undefined, 8000);
          heap += h.result?.usedSize || 0; nodes += d.result?.nodes || 0; n++; A.close();
        } catch { /* closed meanwhile */ }
      }
      return { windows: n, heap, nodes };
    };
    const listenersOn = async (expr) => {
      const o = await R.send('Runtime.evaluate', { expression: expr });
      const id = o.result?.result?.objectId; if (!id) return 0;
      const l = await R.send('DOMDebugger.getEventListeners', { objectId: id });
      R.send('Runtime.releaseObject', { objectId: id });
      return (l.result?.listeners || []).length;
    };
    const sample = async (minute) => {
      await run('await Soak.pause()', 20000);
      await wait(1500);
      for (let i = 0; i < 2; i++) { await R.send('HeapProfiler.collectGarbage'); await wait(300); }
      const heap = (await R.send('Runtime.getHeapUsage')).result || {};
      const dom = (await R.send('Memory.getDOMCounters')).result || {};
      let detached = null;
      // (the DOM agent keeps every node it hands out alive: enabled only for this call, disabled right after)
      await R.send('DOM.enable'); const dd = await R.send('DOM.getDetachedDomNodes'); await R.send('DOM.disable');
      // detached = every node the renderer holds − the ones in the document; DOM.getDetachedDomNodes names the roots
      let detachedRoots = null;
      if (dd.result?.detachedNodes) { const by = {}; for (const n of dd.result.detachedNodes) { const t = n.treeNode || {}; const a = t.attributes || []; const cls = a[a.indexOf('class') + 1]; const k = `${(t.nodeName || '?').toLowerCase()}${a.includes('class') ? `.${String(cls).split(' ')[0]}` : ''}`; by[k] = (by[k] || 0) + 1 + (n.retainedNodeIds?.length || 0); } detachedRoots = by; }
      const page = (await run('return JSON.stringify(Soak.stats())', 20000)).value;
      const st = page ? JSON.parse(page) : {};
      detached = Math.max(0, (dom.nodes || 0) - (st.attached || 0));
      const winL = await listenersOn('window'); const docL = await listenersOn('document');
      // the Lab preview (its own process): heap after a GC + its counters
      let lab = null;
      for (const [sid, url] of iframes) {
        if (url.type !== 'iframe') continue;
        await R.send('HeapProfiler.collectGarbage', {}, sid, 8000);
        const h = await R.send('Runtime.getHeapUsage', {}, sid, 8000);
        const d = await R.send('Memory.getDOMCounters', {}, sid, 8000);
        const p = await R.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__soakProbe ? window.__soakProbe.live() : null)', returnByValue: true }, sid, 8000);
        const g = await R.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__soakProbe ? window.__soakProbe.gl() : null)', returnByValue: true }, sid, 8000);
        const parse = (x) => { try { return JSON.parse(x.result.result.value); } catch { return null; } };
        if (h.result?.usedSize) lab = { heap: (lab?.heap || 0) + h.result.usedSize, nodes: (lab?.nodes || 0) + (d.result?.nodes || 0), probe: parse(p), gl: parse(g) };
      }
      const apps = await appSample();
      const main = await mainSample();
      const frames = (await run('return JSON.stringify(await Soak.frames())', 30000)).value;
      // the data folder (and the fake cloud): folders and files (a recursive watch on Linux holds one watcher per folder)
      const tree = (root) => { const o = { dirs: 0, files: 0, bytes: 0, top: {} }; const walk = (d, top) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const p = path.join(d, e.name); const t = top || e.name; if (e.isDirectory()) { o.dirs++; o.top[t] = (o.top[t] || 0) + 1; walk(p, t); } else { o.files++; try { o.bytes += fs.statSync(p).size; } catch { /* gone */ } } } }; walk(root, ''); return o; };
      const disk = { data: tree(path.join(dir, 'data')), cloud: tree(cloud) };
      const s = {
        minute, t: Date.now() - t0, heap: heap.usedSize, nodes: dom.nodes, docs: dom.documents, jsListeners: dom.jsEventListeners, detached, winL, docL,
        page: st, detachedRoots, lab, apps, main, disk, frames: frames ? JSON.parse(frames) : null,
      };
      // the Lab preview's frames per second while the chat is on screen (2 s, nothing else running)
      const labRaf = async () => { for (const [sid, u] of iframes) { if (u.type !== 'iframe') continue; const r = await R.send('Runtime.evaluate', { expression: 'window.__soakProbe ? window.__soakProbe.rafCalls : null', returnByValue: true }, sid, 5000); const v = r.result?.result?.value; if (v != null) return v; } return null; };
      const r0 = await labRaf(); await wait(2000); const r1 = await labRaf();
      s.labIdleFps = r0 != null && r1 != null ? Math.round((r1 - r0) / 2) : null;
      await run('Soak.resume()', 5000);
      return s;
    };
    const fmt = (s) => {
      const mb = (b) => (b == null ? '–' : (b / 1048576).toFixed(1));
      return [String(s.minute).padStart(3), mb(s.heap).padStart(6), mb(s.lab?.heap).padStart(5), mb(s.apps?.heap).padStart(5), String(s.nodes).padStart(6), String(s.detached).padStart(6), String(s.jsListeners).padStart(6), `${s.winL}/${s.docL}`.padStart(7),
        String(s.page?.probe?.intervals ?? '–').padStart(4), String(s.page?.probe?.observers ?? '–').padStart(4), String(s.page?.probe?.urls ?? '–').padStart(4),
        mb(s.main?.procKB?.GPU != null ? s.main.procKB.GPU * 1024 : null).padStart(6), mb(s.main?.rss).padStart(6), mb(s.main?.heap).padStart(5),
        `${s.main?.handles?.FSWatcher || 0}/${s.main?.handles?.StatWatcher || 0}/${s.main?.handles?.ChildProcess || 0}/${s.main?.res?.Timeout || 0}`.padStart(11), String(s.main?.ipc ?? '–').padStart(4), String(s.frames?.p95 ?? '–').padStart(5), String(s.labIdleFps ?? '–').padStart(4)].join(' ');
    };
    console.log('\n min  heapMB labMB appMB  nodes detach listen win/doc  ivl  obs  url  gpuMB rssMB mHeap watch/stat/cp/tmr  ipc  p95 labfps');
    // ---------- the session ----------
    let cycle = 0; let nextSample = Date.now(); let freshened = false; let diffA = null;
    const END = t0 + MINUTES * 60000;
    while (Date.now() < END) {
      if (Date.now() >= nextSample) {
        const s = await sample(Math.round((Date.now() - t0) / 6000) / 10);
        if (args.includes('--diff') && !diffA && s.t >= WARMUP) { await run('await Soak.pause()', 20000); diffA = { r: await snapSummary(R), m: M ? await snapSummary(M) : null, t: s.t }; await run('Soak.resume()', 5000); }
        samples.push(s); console.log(fmt(s));
        nextSample += EVERY;
        continue;
      }
      // --freshen: halfway through, Freshen once and check that everything came back
      if (args.includes('--freshen') && !freshened && Date.now() > t0 + (MINUTES * 60000) / 2) {
        freshened = true;
        const before = await run('return JSON.stringify(await Soak.snapshot())', 30000);
        await run('setTimeout(() => Freshen.now({ reason: "soak" }), 50); return true', 5000);
        await wait(4000);
        if (!(await ready())) throw new Error('no app after Freshen');
        await wait(3000); await inject();
        await run(`await Soak.setup(${JSON.stringify({ cloud, song: fx.song, clip: fx.clip, glbDir: tmp, again: true })}); return 1`, 120000);
        const after = await run(`return JSON.stringify(Soak.compare(${before.value || 'null'}, await Soak.snapshot()))`, 30000);
        console.log(`freshen: ${after.error || after.value}`);
        if (after.error || !JSON.parse(after.value || '{}').ok) problems.push(`freshen did not keep everything: ${after.error || after.value}`);
      }
      cycle++;
      const r = await run(`if (!window.Soak) return 'gone'; return JSON.stringify(await Soak.cycle(${cycle}))`, 300000);
      if (r.value === 'gone') { await ready(); await inject(); await run(`await Soak.setup(${JSON.stringify({ cloud, song: fx.song, clip: fx.clip, glbDir: tmp, again: true })}); return 1`, 120000); }
      else if (r.error) problems.push(`cycle ${cycle}: ${r.error}`);
      else if (process.env.SOAK_DEBUG) console.log(`cycle ${cycle}: ${r.value}`);
    }
    samples.push(await sample(Math.round((Date.now() - t0) / 6000) / 10)); console.log(fmt(samples.at(-1)));
    const summary = (await run('return JSON.stringify(Soak.summary())', 10000)).value;
    console.log(`\ncycles: ${cycle} · ${summary}`);

    // ---------- trends ----------
    const METRICS = [
      ['renderer heap', (s) => s.heap, 'MB', 1048576, 4 * 1048576],
      ['Lab heap', (s) => s.lab?.heap, 'MB', 1048576, 3 * 1048576],
      ['app windows heap', (s) => s.apps?.heap, 'MB', 1048576, 3 * 1048576],
      ['DOM nodes', (s) => s.nodes, '', 1, 1500],
      ['detached nodes', (s) => s.detached, '', 1, 500],
      ['JS listeners', (s) => s.jsListeners, '', 1, 200],
      ['window+document listeners', (s) => s.winL + s.docL, '', 1, 15],
      ['documents', (s) => s.docs, '', 1, 4],
      ['live intervals', (s) => s.page?.probe?.intervals, '', 1, 4],
      ['live observers', (s) => s.page?.probe?.observers, '', 1, 20],
      ['object URLs', (s) => s.page?.probe?.urls, '', 1, 20],
      ['Lab intervals', (s) => s.lab?.probe?.intervals, '', 1, 4],
      ['Lab object URLs', (s) => s.lab?.probe?.urls, '', 1, 20],
      ['Lab WebGL contexts', (s) => s.lab?.gl?.contexts, '', 1, 2],
      ['Lab GL textures', (s) => s.lab?.gl?.tex, '', 1, 20],
      ['Lab GL buffers', (s) => s.lab?.gl?.buf, '', 1, 40],
      ['Lab GPU estimate', (s) => s.lab?.gl?.mb, 'MB', 1, 20],
      ['app GPU estimate', (s) => s.page?.gl?.mb, 'MB', 1, 20],
      ['GPU process', (s) => (s.main?.procKB?.GPU || 0) * 1024, 'MB', 1048576, 40 * 1048576],
      ['main RSS', (s) => s.main?.rss, 'MB', 1048576, 30 * 1048576],
      ['main heap', (s) => s.main?.heap, 'MB', 1048576, 4 * 1048576],
      // (Linux: Node's recursive fs.watch holds one watcher per file and folder, so they follow the data's files;
      // the Mac and Windows use one native watcher per tree): what's beyond that is a leak
      ['main fs watchers beyond files', (s) => (s.main?.handles?.FSWatcher || 0) + (s.main?.handles?.StatWatcher || 0) - (process.platform === 'linux' ? (s.disk?.data?.files || 0) + (s.disk?.data?.dirs || 0) + (s.disk?.cloud?.files || 0) + (s.disk?.cloud?.dirs || 0) : 0), '', 1, 3],
      ['main child processes', (s) => s.main?.handles?.ChildProcess || 0, '', 1, 2],
      ['main timers', (s) => s.main?.res?.Timeout || 0, '', 1, 6],
      ['main sockets / pipes', (s) => (s.main?.handles?.Socket || 0) + (s.main?.handles?.Pipe || 0), '', 1, 4],
      ['main IPC listeners', (s) => s.main?.ipc, '', 1, 3],
      ['web contents', (s) => s.main?.contents, '', 1, 2],
      ['data folders', (s) => s.disk?.data?.dirs, '', 1, 10],
      ['data files', (s) => s.disk?.data?.files, '', 1, 40],
      ['cloud files', (s) => s.disk?.cloud?.files, '', 1, 40],
      ['frame p95', (s) => s.frames?.p95, 'ms', 1, 6],
      ['Lab frames/s while hidden', (s) => s.labIdleFps, '', 1, 10],
    ];
    const after = samples.filter((s) => s.t >= WARMUP);
    const pts = after.length >= 3 ? after : samples;
    const trends = [];
    for (const [name, get, unit, div, minGrowth] of METRICS) {
      const xy = pts.map((s) => [s.t / 3600000, get(s)]).filter(([, y]) => Number.isFinite(y));
      if (xy.length < 3) continue;
      const n = xy.length; const mx = xy.reduce((a, p) => a + p[0], 0) / n; const my = xy.reduce((a, p) => a + p[1], 0) / n;
      let sxy = 0; let sxx = 0; let syy = 0; for (const [x, y] of xy) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
      const slope = sxx ? sxy / sxx : 0; const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0;
      const span = xy.at(-1)[0] - xy[0][0];
      const grew = slope * span;
      const flag = r2 >= 0.6 && grew >= minGrowth && slope > 0;
      trends.push({ name, first: xy[0][1] / div, last: xy.at(-1)[1] / div, perHour: slope / div, r2: Math.round(r2 * 100) / 100, flag, unit });
    }
    const f = (x) => (Math.abs(x) >= 100 ? Math.round(x) : Math.round(x * 10) / 10);
    console.log(`\ntrends (after ${Math.round(WARMUP / 6000) / 10} min warm-up, ${pts.length} samples):`);
    for (const t of trends) console.log(`${t.flag ? '✖ GROWS' : '  ok   '} ${t.name.padEnd(26)} ${String(f(t.first)).padStart(7)} → ${String(f(t.last)).padStart(7)} ${t.unit.padEnd(2)}  ${t.perHour >= 0 ? '+' : ''}${f(t.perHour)}${t.unit}/h  R² ${t.r2}`);
    const last = samples.at(-1);
    // where it grows: per site (listeners, observers, intervals, DOM containers, main watchers / processes), first
    // sample after the warm-up → last
    const base = pts[0];
    const growth = (get, min) => { const a = get(base) || {}; const b = get(last) || {}; return Object.keys(b).map((k) => [k, b[k] - (a[k] || 0)]).filter(([, d]) => d >= min).sort((x, y) => y[1] - x[1]).slice(0, 8); };
    const WHERE = [['data folders', (s) => s.disk?.data?.top, 2], ['cloud folders', (s) => s.disk?.cloud?.top, 2], ['DOM', (s) => s.page?.probe?.byDom, 200], ['detached roots', (s) => s.detachedRoots, 20], ['listeners', (s) => s.page?.probe?.byListener, 6], ['observers', (s) => s.page?.probe?.byObserver, 3], ['intervals', (s) => s.page?.probe?.byInterval, 1],
      ['Lab listeners', (s) => s.lab?.probe?.byListener, 6], ['Lab intervals', (s) => s.lab?.probe?.byInterval, 1], ['main watchers / processes', (s) => s.main?.sites, 1]];
    const where = {};
    for (const [name, get, min] of WHERE) { const g = growth(get, min); if (g.length) { where[name] = g; console.log(`\n${name} growing:\n${g.map(([k, d]) => `  +${d}  ${k}`).join('\n')}`); } }
    console.log(`\nlast: main handles ${JSON.stringify(last.main?.handles)} · Lab ${JSON.stringify({ heap: last.lab?.heap, nodes: last.lab?.nodes, gl: last.lab?.gl, ivl: last.lab?.probe?.intervals })} · targets ${JSON.stringify([...iframes.values()].map((u) => u.type))}`);
    if (diffA) {
      await run('await Soak.pause()', 20000);
      const r = await snapSummary(R); const mm = M ? await snapSummary(M) : null;
      console.log(`\nrenderer heap gained (${Math.round((Date.now() - t0 - diffA.t) / 60000)} min, by constructor):\n${snapDiff(diffA.r, r)}`);
      if (mm) console.log(`\nmain heap gained:\n${snapDiff(diffA.m, mm)}`);
    }
    // --retainers: who keeps the detached DOM alive (the biggest detached roots, each marked, then a heap snapshot:
    // the shortest strong path from a GC root to each)
    if (args.includes('--retainers')) {
      await run('await Soak.pause()', 20000);
      for (let i = 0; i < 2; i++) await R.send('HeapProfiler.collectGarbage');
      await R.send('DOM.enable');
      const dd = (await R.send('DOM.getDetachedDomNodes')).result?.detachedNodes || [];
      const groups = new Map();
      for (const n of dd) { const t = n.treeNode || {}; const a = t.attributes || []; const k = `${(t.nodeName || 'x').toLowerCase()}_${a.includes('class') ? String(a[a.indexOf('class') + 1]).split(' ')[0].replace(/[^\w]/g, '_') : ''}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); }
      // the roots of the detached trees (a node whose parent isn't detached too), biggest groups first
      const want = (opt('--retainers', '') || '').startsWith('--') ? [] : String(opt('--retainers', '')).split(',').filter(Boolean);
      const top = [...groups].filter(([k]) => !want.length || want.some((w) => k.includes(w))).sort((a, b) => b[1].length - a[1].length).slice(0, 6);
      for (const [k, ns] of top) for (const n of ns.slice(0, 2)) {
        const o = await R.send('DOM.resolveNode', { backendNodeId: n.treeNode.backendNodeId });
        if (o.result?.object?.objectId) await R.send('Runtime.callFunctionOn', { objectId: o.result.object.objectId, functionDeclaration: `function () { const C = { ['SoakLeak_${k}']: class {} }['SoakLeak_${k}']; this.__soakLeak = new C(); }` });
        if (o.result?.object?.objectId) await R.send('Runtime.releaseObject', { objectId: o.result.object.objectId });
      }
      await R.send('DOM.disable');
      for (let i = 0; i < 2; i++) await R.send('HeapProfiler.collectGarbage');
      const chunks = []; const onChunk = (m) => { if (m.method === 'HeapProfiler.addHeapSnapshotChunk') chunks.push(m.params.chunk); };
      R.on(onChunk);
      await R.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false }, undefined, 300000);
      console.log(`\nretainers (${top.map(([k, ns]) => `${k} ×${ns.length}`).join(', ')}):\n${retainers(JSON.parse(chunks.join('')))}`);
    }
    if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ minutes: MINUTES, cycles: cycle, samples, trends, where }, null, 1));
    const grows = trends.filter((t) => t.flag);
    void where;
    if (grows.length && !args.includes('--no-fail')) problems.push(`grows linearly: ${grows.map((t) => t.name).join(', ')}`);
    R.close(); M?.close();
  } catch (err) {
    problems.push(`harness: ${err.stack || err.message}`);
  } finally {
    killAll(); fake.close?.();
    const mainErrors = log.join('').split('\n').filter((l) => /Uncaught|TypeError|ReferenceError|SyntaxError/.test(l) && !IGNORE.some((re) => re.test(l)));
    for (const l of mainErrors.slice(0, 20)) problems.push(`main: ${l.trim()}`);
    for (const d of [dir, userData, tmp]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch { /* still in use */ } }
  }
  if (problems.length) { console.log(`\n${problems.length} problem(s):\n${[...new Set(problems)].slice(0, 40).join('\n')}`); code = 1; } else console.log('\nOK: nothing grows, no page errors.');
  process.exit(code);
})();
