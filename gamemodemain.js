// ▶ Play (round 52, gamemode), main side. A game gets a window of its own: full screen on the screen picked (the big
// one by default), no Hearth around it, its own renderer process (chats and the Lab never share its main thread), no
// background throttling, its process at a higher priority, the screen kept awake, Hearth's background work quiet.
// Shapes and messages: tools/game-api.md. The pure part: gamemode-core.js.
//   Sources: a Lab scene (built here as a standalone page: the Lab's own player with three.js next to it, the scene's
//   layers, pictures and song, like ⇪ Publish; the layers that can merge share ONE canvas / WebGL context) or an
//   HTML / folder game build, loaded as it is from its folder. Both through hearth-game://<token>/…, a protocol of a
//   private session (persist:hearth-game since gameready: compiled shaders persist; what a game stores is wiped when it ends): read-only (GET only, nothing outside the folder), no access to Hearth's pages (another
//   origin), no Node, only pointer lock / full screen / gamepads allowed, and nothing sent out (only GETs leave it).
//   Leaving: Esc shows "Back to Hearth" (Esc again leaves), ⌘Q / ⌘W (Mac) and Alt+F4 / Ctrl+W leave at once; ⌘
//   shortcuts never reach Hearth's menu while playing.
// The owner's game files are never written: a Lab scene is built into data/game/<scene>, an HTML build is only read.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const C = require('./gamemode-core');

const SCHEME = 'hearth-game';
// (round 52, gameready) a persistent partition so Chromium keeps the game's compiled shaders on disk (a second launch
// skips its compiles); everything a game itself stores (cookies, local storage, IndexedDB, service workers, cache
// storage…) is still wiped when it ends (forget()), so nothing a game stores outlives its session
const PARTITION = 'persist:hearth-game';
const WIPE = ['cookies', 'filesystem', 'indexdb', 'localstorage', 'websql', 'serviceworkers', 'cachestorage'];
function forget() { try { ses?.clearStorageData({ storages: WIPE }).catch(() => {}); } catch { /* fine */ } }
// (round 52, gameready) GameReady's part of this window, when it's in: optimized copies served for their originals'
// addresses and its preparing script first in the game's pages (gamereadymain.js; nothing when it isn't armed)
const ready = () => { try { return require('./gamereadymain'); } catch { return null; } };
// (round 53, playloop) Ctrl/⌘+P back to editing with the game kept, side by side, the "Updated" blip, Fix with the director
const loop = () => { try { return require('./playloopmain'); } catch { return null; } };
let ctx = null; // { getWin, powerwise, dataDir }
let G = null; // the game playing: { win, source, root, token, display, hz, route, how, started, release, priority, pid }
const roots = new Map(); // token → folder
let ses = null;

// (the scheme itself is made a standard, secure one in main.js before 'ready': a privileged scheme must be known first)

function gameSession() {
  if (ses) return ses;
  const { session } = require('electron');
  ses = session.fromPartition(PARTITION, { cache: true });
  ses.protocol.handle(SCHEME, async (req) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('read only', { status: 405 });
    let u; try { u = new URL(req.url); } catch { return new Response('bad address', { status: 400 }); }
    const root = roots.get(u.hostname);
    if (!root) return new Response('this game has ended', { status: 404 });
    const R = ready();
    if (R?.armed?.() && R.isPage(u.pathname)) return new Response(await fs.promises.readFile(R.pageFile()), { headers: { 'content-type': 'text/javascript', 'cache-control': 'no-cache' } });
    let file = C.safePath(root, u.pathname, path.sep);
    if (!file) return new Response('outside the game', { status: 403 });
    try {
      let st = await fs.promises.stat(file);
      if (st.isDirectory()) { file = path.join(file, 'index.html'); st = await fs.promises.stat(file); }
      const swap = R?.swapFor?.(file) || null; // (an optimized copy in Hearth's cache, same address)
      if (swap) st = await fs.promises.stat(swap);
      R?.noteServed?.(path.relative(root, file).split(path.sep).join('/'), Boolean(swap));
      let body = req.method === 'HEAD' ? null : await fs.promises.readFile(swap || file);
      const tag = body && /\.html?$/i.test(file) ? R?.pageTag?.() : '';
      if (tag) { let h = body.toString('utf8'); h = /<head[^>]*>/i.test(h) ? h.replace(/<head[^>]*>/i, (m) => `${m}${tag}`) : `${tag}${h}`; body = Buffer.from(h); st = { size: body.length }; }
      return new Response(body, { status: 200, headers: { 'content-type': C.mimeOf(file), 'content-length': String(st.size), 'cache-control': 'no-cache', 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless' } });
    } catch { return new Response('not found', { status: 404 }); }
  });
  // only what a game needs; never the camera, the microphone, notifications, the clipboard…
  const OK = new Set(['pointerLock', 'fullscreen', 'keyboardLock']);
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(OK.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => OK.has(perm));
  // nothing leaves this computer from a game: only downloads (GET) of its own libraries / files
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: /^https?:/i.test(d.url) && !['GET', 'HEAD', 'OPTIONS'].includes(d.method) }));
  ses.on('will-download', (e) => e.preventDefault());
  return ses;
}

// ---------- screens ----------
function displays() {
  const { screen } = require('electron');
  const hub = ctx.getWin(); const mine = hub && !hub.isDestroyed() ? screen.getDisplayMatching(hub.getBounds()).id : null;
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, label: d.label || `Screen ${i + 1}`, w: Math.round(d.size.width * d.scaleFactor), h: Math.round(d.size.height * d.scaleFactor), scale: d.scaleFactor, hz: Math.round(d.displayFrequency || 0) || 60, primary: d.id === screen.getPrimaryDisplay().id, hub: d.id === mine, bounds: d.bounds }));
}

// ---------- a Lab scene as a standalone page ----------
// spec (gamemode.js): { id, name, version, layers, refs: [{ key, kind, path }], palette, song: { path } | null,
// analysis, values, plan: { merge, why } }
function hostScript(S) {
  // runs the scene by itself: the Lab's player is this very page (no frame, no hub); its messages to "parent" come back
  // here (a top page is its own parent)
  return `<script>
// ▶ Play (Hearth, round 52): this page runs the Lab scene by itself, at max fidelity, the merged layers on one canvas
(function () {
  var S = ${JSON.stringify(S).replace(/</g, '\\u003c')};
  var st = window.__hearthGame = { ready: false, drawn: false, errors: [], started: Date.now(), plan: S.plan };
  var send = function (m) { m.target = 'three-sandbox'; window.postMessage(m, '*'); };
  var bytes = function (f) { return fetch(f).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }); };
  function go() {
    send({ type: 'ready-lock', on: true }); // 100 %: no adaptive steps, no doze, no fps cap
    send({ type: 'pace', on: false }); send({ type: 'adapt', on: false }); send({ type: 'fps-cap', value: 0, auto: false, focused: true });
    send({ type: 'game-plan', merge: S.plan.merge, why: S.plan.why });
    Promise.all(S.refs.map(function (r) { return bytes(r.file).then(function (b) { return { key: r.key, kind: r.kind, mime: r.mime, buffer: b }; }).catch(function () { return null; }); })).then(function (items) {
      send({ type: 'tweak-init', values: S.values || {}, keys: {}, mods: {} });
      send({ type: 'refs', items: items.filter(Boolean), palette: S.palette || [] });
      var song = S.song ? bytes(S.song.file).catch(function () { return null; }) : Promise.resolve(null);
      return song.then(function (b) {
        if (b) send({ type: 'media-load', buffer: b, mime: S.song.mime, video: false, name: S.song.name, startAt: 0, playing: true, loop: true, volume: 1, analysis: S.analysis || null, region: null, rate: 1, trim: null });
        send({ type: 'run-layers', layers: S.layers });
      });
    });
  }
  addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.source !== 'three-sandbox') return;
    if (d.type === 'ready' && !st.ready) { st.ready = true; go(); }
    if (d.type === 'stack-drawn') st.drawn = true;
    if (d.type === 'error') st.errors.push(String(d.message || 'error') + (d.line ? ' (line ' + d.line + ')' : ''));
  });
  // games want the mouse: a click captures it (raw movement where the system has it); Esc gives it back
  addEventListener('mousedown', function () {
    if (document.pointerLockElement) return;
    try { var p = document.body.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(function () { try { document.body.requestPointerLock(); } catch (e) {} }); } catch (e) { try { document.body.requestPointerLock(); } catch (e2) {} }
  }, true);
})();
</script>
`;
}
async function buildScene(spec) {
  const deploy = require('./deploymain');
  const id = String(spec.id || 'scene').replace(/[^\w-]+/g, '_').slice(0, 60);
  const dir = path.join(ctx.dataDir, 'game', id);
  const layers = (spec.layers || []).filter((L) => L && typeof L.code === 'string' && L.code.trim());
  if (!layers.length) throw new Error('This scene has no code to play.');
  const version = String(spec.version || '0.186.1');
  const sandbox = path.join(__dirname, 'tools', 'three-sandbox.html');
  const stamp = (p) => { try { const s = fs.statSync(p); return `${s.size}:${s.mtimeMs}`; } catch { return '-'; } };
  const key = crypto.createHash('sha1').update(JSON.stringify({ layers, refs: (spec.refs || []).map((r) => [r.key, r.path, stamp(r.path), ready()?.swapFor?.(r.path) || '']), song: spec.song?.path ? [spec.song.path, stamp(spec.song.path)] : null, palette: spec.palette, values: spec.values, plan: spec.plan, version, sandbox: stamp(sandbox), me: stamp(__filename) })).digest('hex').slice(0, 16);
  const metaFile = path.join(dir, 'hearth-play.json');
  try { const m = JSON.parse(fs.readFileSync(metaFile, 'utf8')); if (m.key === key && fs.existsSync(path.join(dir, 'play.html'))) return { dir, version, cached: true, notes: m.notes || [] }; } catch { /* a new build */ }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const notes = [];
  // (round 52, gameready) a 🧊 model layer's runtime (lab3d) imports its loaders / decoders on demand (GLTFLoader,
  // meshopt, KTX2, Draco…): they're vendored with the page too, or the model never loads in the game window
  const libCodes = layers.some((L) => /\blab3d\.model\s*\(/.test(L.code)) ? [fs.readFileSync(path.join(__dirname, 'tools', 'sandbox-lab3d.js'), 'utf8')] : [];
  const v = await deploy.vendorThree(version, [...layers.map((L) => L.code), ...libCodes], path.join(dir, 'three'), {});
  if (v.missing.length) notes.push(`Not found for three.js ${version}: ${v.missing.join(', ')}`);
  const refs = [];
  for (const r of spec.refs || []) {
    if (!r.path || !fs.existsSync(r.path)) { notes.push(`Picture / file "${r.key}" is missing`); continue; }
    const file = `assets/${String(r.key || path.basename(r.path)).replace(/[^\w.-]+/g, '_')}${path.extname(r.path)}`;
    fs.copyFileSync(ready()?.swapFor?.(r.path) || r.path, path.join(dir, file)); // (round 52, gameready: its optimized copy when there's one)
    refs.push({ key: r.key, kind: r.kind, mime: C.mimeOf(r.path), file });
  }
  let song = null;
  if (spec.song?.path && fs.existsSync(spec.song.path)) {
    const file = `assets/song${path.extname(spec.song.path).toLowerCase() || '.mp3'}`;
    fs.copyFileSync(spec.song.path, path.join(dir, file));
    song = { file, mime: C.mimeOf(spec.song.path), name: path.basename(spec.song.path) };
  }
  const page = deploy.labPage().replace('</body>', () => `${hostScript({ layers, refs, song, palette: spec.palette || [], values: spec.values || {}, analysis: spec.analysis || null, plan: spec.plan || { merge: [], why: {} } })}</body>`);
  fs.writeFileSync(path.join(dir, 'play.html'), page);
  fs.writeFileSync(metaFile, JSON.stringify({ key, name: spec.name || id, at: Date.now(), version, notes }, null, 2));
  return { dir, version, cached: false, notes };
}

// ---------- the window ----------
function info() {
  if (!G) return { playing: false };
  return { playing: true, source: G.source, title: G.source.title, route: G.route, how: G.how, display: G.display ? { id: G.display.id, label: G.display.label, w: G.display.w, h: G.display.h, scale: G.display.scale, hz: G.display.hz } : null, hz: G.hz, fidelity: G.fidelity, pid: G.pid || null, priority: G.priority || null, separate: Boolean(G.pid && G.pid !== ctx.getWin()?.webContents.getOSProcessId?.()), started: G.started, notes: G.notes || [], fullscreen: G.win && !G.win.isDestroyed() ? (G.win.isFullScreen() || G.win.isSimpleFullScreen?.() || false) : false, url: G.url };
}
function leave(why = 'left') {
  if (!G) return false;
  const g = G;
  if (g.win && !g.win.isDestroyed()) { g.why = why; g.win.close(); }
  return true;
}
function ended(g) {
  if (G !== g) return;
  G = null;
  roots.delete(g.token);
  loop()?.ended?.();
  forget();
  try { g.release?.(); } catch { /* fine */ }
  try { ctx.powerwise.quiet(false); } catch { /* fine */ }
  const hub = ctx.getWin();
  if (hub && !hub.isDestroyed()) {
    hub.webContents.send('game:left', { source: g.source, secs: Math.round((Date.now() - g.started) / 1000), why: g.why || 'closed' });
    if (hub.isMinimized()) hub.restore();
    hub.show(); hub.focus();
  }
}
async function play(_e, req = {}) {
  const source = C.source(req.source);
  if (!source) throw new Error('Nothing to play: pick a Lab scene or an HTML game.');
  if (G) leave('another game');
  for (let i = 0; i < 40 && G; i += 1) await new Promise((r) => setTimeout(r, 25));
  const { BrowserWindow } = require('electron');
  const list = displays();
  const d = C.pickDisplay(list, req.display ?? null);
  const fid = C.fidelity(d);
  const token = crypto.randomBytes(12).toString('hex');
  let root; let entry; let route = 'html'; let how = 'HTML build'; let notes = [];
  if (source.kind === 'lab') {
    if (!req.scene) throw new Error('No scene data to play.');
    const b = await buildScene(req.scene);
    root = b.dir; notes = b.notes; route = 'page';
    const plan = req.scene.plan || { merge: [] };
    const n = (req.scene.layers || []).length;
    how = plan.merge.length > 1 ? `one canvas (${plan.merge.length} of ${n} layers)` : plan.merge.length ? `one canvas` : `${n} canvases`;
    how += b.cached ? ' · page (ready)' : ' · page';
    entry = `play.html?mode=sketch&v=${encodeURIComponent(b.version)}&n=1&game=1&cap=0`;
  } else {
    let p = path.resolve(source.path);
    let st; try { st = fs.statSync(p); } catch { throw new Error(`Not found: ${source.path}`); }
    if (st.isDirectory()) { if (!fs.existsSync(path.join(p, 'index.html'))) throw new Error('No index.html in this folder.'); root = p; entry = 'index.html'; } else { root = path.dirname(p); entry = encodeURIComponent(path.basename(p)); }
  }
  roots.set(token, root);
  const s = gameSession();
  const mac = process.platform === 'darwin';
  const bounds = d?.bounds || { x: 0, y: 0, width: 1280, height: 720 };
  const win = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, show: false, frame: false, backgroundColor: '#000000',
    title: source.title, autoHideMenuBar: true, fullscreenable: true, fullscreen: !mac, thickFrame: false, roundedCorners: false,
    webPreferences: { session: s, preload: path.join(__dirname, 'game-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false, webSecurity: true, autoplayPolicy: 'no-user-gesture-required', additionalArguments: [`--hearth-game=${encodeURIComponent(JSON.stringify({ title: source.title, how, hz: fid.hz, kind: source.kind }))}`] },
  });
  if (!mac) win.setMenu(null);
  const g = G = { win, source, root, token, display: d, hz: fid.hz, fidelity: fid, route, how, started: Date.now(), notes, url: `${SCHEME}://${token}/${entry}` };
  g.release = ctx.powerwise.hold('present', { label: `${source.title} is playing` });
  try { ctx.powerwise.quiet(true); } catch { /* fine */ }
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => { if (!url.startsWith(`${SCHEME}://${token}/`)) e.preventDefault(); });
  // the keys: Esc → the "Back to Hearth" card; ⌘Q / ⌘W, Ctrl+W leave; no other ⌘ shortcut reaches Hearth's menu
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    const k = String(input.key || '').toLowerCase();
    if (k === 'escape' && !input.meta && !input.control && !input.alt) { wc.send('game:menu'); return; }
    if (loop()?.key?.(input)) { e.preventDefault(); return; } // (round 53, playloop) Ctrl/⌘+P: back to editing, the game kept
    if ((mac && input.meta && (k === 'q' || k === 'w')) || (!mac && input.control && k === 'w') || (!mac && input.alt && k === 'f4')) { e.preventDefault(); leave('key'); return; }
    if (mac && input.meta) e.preventDefault();
  });
  win.on('closed', () => ended(g));
  wc.on('render-process-gone', () => { if (!win.isDestroyed()) win.close(); });
  wc.once('did-finish-load', () => {
    // its own renderer process, at a higher priority (Windows: above normal; a Mac / Linux user process can't raise it)
    try { g.pid = wc.getOSProcessId(); os.setPriority(g.pid, os.constants.priority.PRIORITY_ABOVE_NORMAL); g.priority = 'above normal'; } catch { g.priority = 'normal (the system keeps it)'; }
  });
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    win.show();
    if (mac) { if (req.macFullscreen === 'simple') win.setSimpleFullScreen(true); else win.setFullScreen(true); } // the Mac: its own full-screen space (instant with "simple")
    win.focus();
  });
  const hub = ctx.getWin();
  hub?.once?.('closed', () => leave('hearth closed'));
  try { require('./gameperfmain').attach(win, info()); } catch (err) { if (err.code !== 'MODULE_NOT_FOUND') console.warn('gameperf:', err.message); }
  await win.loadURL(g.url);
  return info();
}

function register(ipcMain, c) {
  ctx = c;
  // the hub window asks to play / leave / test; the game window's own preload only asks its info and "Back to Hearth"
  const hub = (fn) => (e, ...a) => { const w = ctx.getWin(); if (!w || w.isDestroyed() || e.sender !== w.webContents) throw new Error('not from Hearth'); return fn(e, ...a); };
  const mine = (e) => Boolean(G?.win && !G.win.isDestroyed() && e.sender === G.win.webContents);
  ipcMain.handle('game:play', hub(play));
  ipcMain.handle('game:leave', hub(() => leave('asked')));
  ipcMain.handle('game:state', hub(() => info()));
  ipcMain.handle('game:displays', hub(() => displays().map(({ bounds, ...d }) => d)));
  ipcMain.handle('game:info', (e) => (mine(e) ? info() : null));
  ipcMain.on('game:back', (e) => { if (mine(e)) leave('back'); });
  // (round 53, playloop: playloopmain.js) rest / wake / side by side / the blip; the error line's Fix from the game window
  loop()?.register?.({ ctx: () => ctx, game: () => G, leave });
  ipcMain.handle('game:loop', hub((_e, req) => loop()?.op?.(req) || { playing: false }));
  ipcMain.on('game:fix', (e, d) => loop()?.fix?.(e, d));
  // checks: run a line in the game window's page, press a key / click there (real input, through Chromium)
  ipcMain.handle('game:eval', hub(async (_e, code) => { if (!G?.win || G.win.isDestroyed()) return { error: 'not playing' }; try { return { value: await G.win.webContents.executeJavaScript(String(code), true) }; } catch (err) { return { error: err.message }; } }));
  ipcMain.handle('game:key', hub((_e, { key = 'Escape', mods = [] } = {}) => {
    if (!G?.win || G.win.isDestroyed()) return false;
    for (const type of ['keyDown', 'char', 'keyUp']) { if (type === 'char' && key.length !== 1) continue; G.win.webContents.sendInputEvent({ type, keyCode: key, modifiers: mods }); }
    return true;
  }));
  ipcMain.handle('game:click', hub((_e, { x = 100, y = 100 } = {}) => {
    if (!G?.win || G.win.isDestroyed()) return false;
    for (const type of ['mouseDown', 'mouseUp']) G.win.webContents.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 });
    return true;
  }));
}
module.exports = { register, SCHEME, info, leave, _test: { buildScene, hostScript, setCtx: (c) => { ctx = c; } } };
