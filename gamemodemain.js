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
const GI = require('./gameinputmain'); // (round 53, gameinput) focus on open, Esc / F / Enter, keys held for the game, no selection
const PL = require('./playlatencymain'); // (round 56, playlatency) /game latency: input → the game's frame, Hearth's part of it

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
// (round 54, gamestream) loads during play without hitches: tools/gamestream-page.js in every page the window serves,
// right after GameReady's script (pictures decoded off the main thread, new objects held until their shaders are ready,
// the log the F chip / doctor name a slow frame's load from). req.stream.off (a check's "before"): the log only.
const STREAM = '/__gamestream-page.js';
// (round 54, gameaudio) the game's sound: warmed up while loading, its sounds decoded before the first frame, paused
// with the game (gameaudiomain.js makes the page's tag; tools/gameaudio-page.js runs in it)
const audio = () => { try { const A = require('./gameaudiomain'); A.init({ dataDir: ctx?.dataDir }); return A; } catch { return null; } };
// (round 55, playbudget) Hearth's own work in the game window held to 2 % of a frame: tools/playbudget-page.js first in
// every page (measures each helper, switches off the one slowing the game), remembered per game (playbudgetmain.js)
const budget = () => { try { const B = require('./playbudgetmain'); B.init({ dataDir: ctx?.dataDir }); return B; } catch { return null; } };
// (round 62, playnotes62) playtest notes: one key (F8) drops a note (the frame's picture, the time, what the game saves,
// the frame rate then) into data/game-cache/<game>/notes; read here with the window's other keys (playnotesmain.js)
const pnotes = () => { try { const N = require('./playnotesmain'); N.init({ dataDir: ctx?.dataDir }); return N; } catch { return null; } };
// (round 63, hitchmap63) the hitch map: only when the owner turned it on (hitchmap.on), tools/hitchmap-page.js right after the
// budget's script (per frame: the frame's time and where the player / camera were, in a typed ring), a picture on a spike,
// the map built when the session ends (hitchmapmain.js). Off: nothing of it in the window
const hitch = () => { try { const M = require('./hitchmapmain'); M.init({ dataDir: ctx?.dataDir }); return M; } catch { return null; } };
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
    const A = G?.token === u.hostname && !G.audioOff ? audio() : null;
    const B = G?.token === u.hostname ? budget() : null;
    if (B?.isPage(u.pathname)) return new Response(await fs.promises.readFile(B.pageFile()), { headers: { 'content-type': 'text/javascript', 'cache-control': 'no-cache' } });
    const HM = G?.token === u.hostname && G.hitch ? hitch() : null; // (round 63, hitchmap63: only while recording)
    if (HM?.isPage(u.pathname)) return new Response(await fs.promises.readFile(HM.pageFile()), { headers: { 'content-type': 'text/javascript', 'cache-control': 'no-cache' } });
    if (A?.isPage(u.pathname)) return new Response(await fs.promises.readFile(A.pageFile()), { headers: { 'content-type': 'text/javascript', 'cache-control': 'no-cache' } });
    if (u.pathname === STREAM) return new Response(await fs.promises.readFile(path.join(__dirname, 'tools', 'gamestream-page.js')), { headers: { 'content-type': 'text/javascript', 'cache-control': 'no-cache' } });
    if (R?.armed?.() && R.isPage(u.pathname)) return new Response(await fs.promises.readFile(R.pageFile()), { headers: { 'content-type': 'text/javascript', 'cache-control': 'no-cache' } });
    let file = C.safePath(root, u.pathname, path.sep);
    if (!file) return new Response('outside the game', { status: 403 });
    try {
      let st = await fs.promises.stat(file);
      if (st.isDirectory()) { file = path.join(file, 'index.html'); st = await fs.promises.stat(file); }
      const swap = R?.swapFor?.(file) || null; // (an optimized copy in Hearth's cache, same address)
      if (swap) st = await fs.promises.stat(swap);
      const rel = path.relative(root, file).split(path.sep).join('/');
      R?.noteServed?.(rel, Boolean(swap));
      if (G?.source?.kind === 'html') A?.served(root, rel); // (round 54, gameaudio) a sound: decoded up front next time
      let body = req.method === 'HEAD' ? null : await fs.promises.readFile(swap || file);
      const tag = body && /\.html?$/i.test(file) ? `${B ? B.pageTag(G.budget) : ''}${HM ? HM.pageTag(G.hz) : ''}${A ? A.pageTag(root, { kind: G.source?.kind }) : ''}${R?.pageTag?.({ root, file, source: G?.token === u.hostname ? G.source : null, hz: G?.hz, look: G?.fidelity?.look, off: G?.budget?.off }) || ''}${G?.token === u.hostname && G.stream?.skip ? '' : `<script src="${STREAM}?off=${G?.token === u.hostname && G.stream?.off ? 1 : 0}"></script>`}` : ''; // (the budget's first: it times the others from their start; gameaudio's next: the game's AudioContext is Hearth's before any of its code runs; (round 55) loads during play left out when the budget switched it off for this game)
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
  // (round 54, gamelook) the game's look: a second preload of this session puts gameLookPage() in the game's world
  // before its scripts (sharp textures, true colours, shadows matched to the screen; never what the game set itself)
  try { const f = path.join(__dirname, 'gamelook-preload.js'); if (ses.registerPreloadScript) ses.registerPreloadScript({ type: 'frame', id: 'hearth-gamelook', filePath: f }); else ses.setPreloads?.([...(ses.getPreloads?.() || []), f]); } catch (err) { console.warn('gamelook:', err.message); }
  // (round 72, labfps72) Quality: auto: a third preload puts gameQualityPage() there too (the game's resolution follows its frame rate)
  try { const f = path.join(__dirname, 'gamequality-preload.js'); if (ses.registerPreloadScript) ses.registerPreloadScript({ type: 'frame', id: 'hearth-gamequality', filePath: f }); else ses.setPreloads?.([...(ses.getPreloads?.() || []), f]); } catch (err) { console.warn('gamequality:', err.message); }
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
  var read = function (f) { return fetch(f).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }); };
  // (round 56, readyspeed) the pictures and the song are read from the start, while the player gets itself ready (they
  // were asked for only once it said 'ready'): page times, ms
  st.load = { asked: performance.now() };
  var early = {}; var bytes = function (f) { if (!early[f]) early[f] = read(f); return early[f]; };
  S.refs.forEach(function (r) { bytes(r.file).catch(function () {}); if (r.ktx2) bytes(r.ktx2).catch(function () {}); });
  if (S.song) bytes(S.song.file).catch(function () {});
  function go() {
    send({ type: 'ready-lock', on: true }); // 100 %: no adaptive steps, no doze, no fps cap
    send({ type: 'pace', on: false }); send({ type: 'adapt', on: false }); send({ type: 'fps-cap', value: 0, auto: false, focused: true });
    send({ type: 'game-plan', merge: S.plan.merge, why: S.plan.why, fast: Boolean(S.plan.fast) }); // (round 56, playlatency: fast = the one canvas swapped to the screen, not copied, each frame)
    // (round 53, gametex) a picture with a compressed copy brings it along (ktx2): the player uses it when the graphics card takes it
    Promise.all(S.refs.map(function (r) { return Promise.all([bytes(r.file), r.ktx2 ? bytes(r.ktx2).catch(function () { return null; }) : null]).then(function (b) { var it = { key: r.key, kind: r.kind, mime: r.mime, buffer: b[0] }; if (b[1]) it.ktx2 = b[1]; return it; }).catch(function () { return null; }); })).then(function (items) {
      st.load.fetched = performance.now();
      send({ type: 'tweak-init', values: S.values || {}, keys: {}, mods: {} });
      send({ type: 'refs', items: items.filter(Boolean), palette: S.palette || [] });
      var song = S.song ? bytes(S.song.file).catch(function () { return null; }) : Promise.resolve(null);
      return song.then(function (b) {
        if (b) send({ type: 'media-load', buffer: b, mime: S.song.mime, video: false, name: S.song.name, startAt: 0, playing: true, loop: true, volume: 1, analysis: S.analysis || null, region: null, rate: 1, trim: null });
        early = {}; // (the page keeps no second copy of its files)
        send({ type: 'run-layers', layers: S.layers }); st.load.run = performance.now();
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
  // games want the mouse: a click captures it (raw movement where the system has it: game-preload.js asks for it, with
  // the plain kind as the fallback); Esc gives it back
  addEventListener('mousedown', function () {
    if (document.pointerLockElement) return;
    try { var p = document.body.requestPointerLock(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* not now */ }
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
  const key = crypto.createHash('sha1').update(JSON.stringify({ layers, refs: (spec.refs || []).map((r) => [r.key, r.path, stamp(r.path), ready()?.swapFor?.(r.path) || '', ready()?.texFor?.(r.path)?.out || '']), song: spec.song?.path ? [spec.song.path, stamp(spec.song.path)] : null, palette: spec.palette, values: spec.values, plan: spec.plan, version, sandbox: stamp(sandbox), me: stamp(__filename) })).digest('hex').slice(0, 16);
  const metaFile = path.join(dir, 'hearth-play.json');
  try { const m = JSON.parse(fs.readFileSync(metaFile, 'utf8')); if (m.key === key && fs.existsSync(path.join(dir, 'play.html'))) return { dir, version, cached: true, notes: m.notes || [] }; } catch { /* a new build */ }
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 }); // (Windows: a virus scanner / the last window can hold a file a moment)
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  const notes = [];
  // (round 52, gameready) a 🧊 model layer's runtime (lab3d) imports its loaders / decoders on demand (GLTFLoader,
  // meshopt, KTX2, Draco…): they're vendored with the page too, or the model never loads in the game window
  const libCodes = layers.some((L) => /\blab3d\.model\s*\(/.test(L.code)) ? [fs.readFileSync(path.join(__dirname, 'tools', 'sandbox-lab3d.js'), 'utf8')] : [];
  // (round 53, gametex) compressed (KTX2) copies in use: three's KTX2Loader and its Basis transcoder go with the page
  const ktx = (spec.refs || []).some((r) => r.path && (ready()?.texFor?.(r.path) || ready()?.swapFor?.(r.path)));
  if (ktx) libCodes.push("import 'three/addons/loaders/KTX2Loader.js';");
  const v = await deploy.vendorThree(version, [...layers.map((L) => L.code), ...libCodes], path.join(dir, 'three'), {});
  if (v.missing.length) notes.push(`Not found for three.js ${version}: ${v.missing.join(', ')}`);
  if (ktx) { try { await ready().vendorKtx(path.join(dir, 'three'), version); } catch (err) { notes.push(`Compressed textures: ${err.message} (the originals are used)`); } }
  const refs = [];
  const songFile = spec.song?.path ? `assets/song${path.extname(spec.song.path).toLowerCase() || '.mp3'}` : null;
  const taken = new Set(songFile ? [songFile] : []); // (round 54, fixes54) "Logo" and "logo" are one file on a Mac / Windows disk (and a picture called "song" isn't the song): the second gets its own name
  for (const r of spec.refs || []) {
    if (!r.path || !fs.existsSync(r.path)) { notes.push(`Picture / file "${r.key}" is missing`); continue; }
    const stem = `assets/${String(r.key || path.basename(r.path)).replace(/[^\w.-]+/g, '_')}`;
    let file = `${stem}${path.extname(r.path)}`;
    for (let i = 2; taken.has(file.toLowerCase()); i += 1) file = `${stem}-${i}${path.extname(r.path)}`;
    taken.add(file.toLowerCase());
    fs.copyFileSync(ready()?.swapFor?.(r.path) || r.path, path.join(dir, file)); // (round 52, gameready: its optimized copy when there's one)
    // (round 53, gametex) a picture's compressed copy next to it (the original stays: the fallback)
    const tx = r.kind === 'image' && fs.existsSync(path.join(dir, 'three', 'examples', 'jsm', 'libs', 'basis', 'basis_transcoder.wasm')) ? ready()?.texFor?.(r.path) : null;
    let ktx2 = null; if (tx) { ktx2 = `${file}.ktx2`; fs.copyFileSync(tx.out, path.join(dir, ktx2)); }
    refs.push({ key: r.key, kind: r.kind, mime: C.mimeOf(r.path), file, ...(ktx2 ? { ktx2 } : {}) });
  }
  let song = null;
  if (spec.song?.path && fs.existsSync(spec.song.path)) {
    const file = songFile;
    fs.copyFileSync(spec.song.path, path.join(dir, file));
    song = { file, mime: C.mimeOf(spec.song.path), name: path.basename(spec.song.path) };
  }
  // (round 56, readyspeed) three.js fetched and compiled while the page starts (the layers import it only once the
  // pictures are in): the same addresses the player imports, so it's one module
  const pre = ['three.module.js', 'three.core.js'].filter((f) => fs.existsSync(path.join(dir, 'three', 'build', f))).map((f) => `<link rel="modulepreload" href="three/build/${f}">`).join('');
  const page = deploy.labPage().replace(/<head[^>]*>/i, (m) => `${m}${pre}`).replace('</body>', () => `${hostScript({ layers, refs, song, palette: spec.palette || [], values: spec.values || {}, analysis: spec.analysis || null, plan: spec.plan || { merge: [], why: {} } })}</body>`);
  fs.writeFileSync(path.join(dir, 'play.html'), page);
  fs.writeFileSync(metaFile, JSON.stringify({ key, name: spec.name || id, at: Date.now(), version, notes }, null, 2));
  return { dir, version, cached: false, notes };
}

// ---------- the window ----------
function info() {
  if (!G) return { playing: false };
  return { playing: true, timing: G.timing || null, budget: G.budget ? { off: G.budget.off, last: G.budget.last } : null, source: G.source, title: G.source.title, route: G.route, how: G.how, display: G.display ? { id: G.display.id, label: G.display.label, w: G.display.w, h: G.display.h, scale: G.display.scale, hz: G.display.hz } : null, hz: G.hz, fidelity: G.fidelity, pid: G.pid || null, priority: G.priority || null, separate: Boolean(G.pid && G.pid !== ctx.getWin()?.webContents.getOSProcessId?.()), started: G.started, notes: G.notes || [], input: G.input || null, latency: PL.brief(PL.last(G.win)), fullscreen: G.win && !G.win.isDestroyed() ? (G.win.isFullScreen() || G.win.isSimpleFullScreen?.() || false) : false, url: G.url };
}
function leave(why = 'left') {
  if (!G) return false;
  const g = G;
  if (g.win && !g.win.isDestroyed()) {
    g.why = why; g.win.close();
    // (round 53, gameinput) a stuck game (or one whose beforeunload says no) never closes: gone anyway after 1.5 s
    setTimeout(() => { if (!g.win.isDestroyed()) g.win.destroy(); }, 1500);
  }
  return true;
}
function ended(g) {
  if (G !== g) return;
  G = null;
  roots.delete(g.token);
  loop()?.ended?.();
  pnotes()?.ended?.();
  if (g.hitch) hitch()?.ended?.();
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
  const T0 = Date.now(); // (round 56, readyspeed) asked → built → window made → page loaded (epoch ms: the hub and the page line up on it)
  if (G) leave('another game');
  for (let i = 0; i < 72 && G; i += 1) await new Promise((r) => setTimeout(r, 25)); // (round 54: past leave()'s 1.5 s, so a stuck game has ended first)
  const { BrowserWindow } = require('electron');
  const list = displays();
  const d = C.pickDisplay(list, req.display ?? null);
  // (round 55, playbudget) the helpers that were slowing this game before stay off (the look, loads during play, the sound part…)
  const was = budget()?.forGame(source) || { off: [] }; const offs = new Set(was.off);
  const fid = C.fidelity(d, offs.has('look') ? 'off' : req.look); // (round 54, gamelook) look: 'best' (the default) | 'balanced'
  const token = crypto.randomBytes(12).toString('hex');
  const NM = pnotes(); const noteKey = NM ? (NM.arm(req.notes || {}) || '') : ''; // (round 62, playnotes62) the note key's label for the hint
  const HMo = hitch(); const hitchOn = HMo ? HMo.arm(req.hitch || {}) : false; // (round 63, hitchmap63) recording the hitch map: only when asked
  let built = null;
  let root; let entry; let route = 'html'; let how = 'HTML build'; let notes = [];
  if (source.kind === 'lab') {
    if (!req.scene) throw new Error('No scene data to play.');
    const b = await buildScene(req.scene);
    built = { at: Date.now(), cached: b.cached };
    root = b.dir; notes = b.notes; route = 'page';
    const plan = req.scene.plan || { merge: [] };
    const n = (req.scene.layers || []).length;
    how = plan.merge.length > 1 ? `one canvas (${plan.merge.length} of ${n} layers)` : plan.merge.length ? `one canvas` : `${n} canvases`;
    how += b.cached ? ' · page (ready)' : ' · page';
    entry = `play.html?mode=sketch&v=${encodeURIComponent(b.version)}&n=1&game=1&cap=0${req.input?.lowLatency ? '&lowlat=1' : ''}`;
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
    webPreferences: { session: s, preload: path.join(__dirname, 'game-preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false, webSecurity: true, autoplayPolicy: 'no-user-gesture-required', disableHtmlFullscreenWindowResize: true /* (round 53) a game's own requestFullscreen never resizes or re-animates the window */, additionalArguments: [`--hearth-game=${encodeURIComponent(JSON.stringify({ title: source.title, how, hz: fid.hz, kind: source.kind, lowLatency: Boolean(req.input?.lowLatency), look: fid.look, quality: req.quality === 'full' ? 'full' : 'auto', ...(noteKey ? { notesKey: noteKey } : {}), ...(hitchOn ? { hitch: true } : {}), ...(was.shadow && fid.look === 'best' ? { shadow: was.shadow } : {}) }))}`] }, // (round 56, shadowready) shadow: the size chosen while getting ready last time
  });
  if (!mac) win.setMenu(null);
  const g = G = { win, source, root, token, display: d, hz: fid.hz, fidelity: fid, route, how, started: Date.now(), notes, url: `${SCHEME}://${token}/${entry}`, audioOff: Boolean(req.audio?.off) || offs.has('audio'), stream: { off: Boolean(req.stream?.off), skip: offs.has('stream') }, hitch: hitchOn };
  g.budget = { hz: fid.hz, title: source.title, off: [...offs], was, last: null };
  g.timing = { asked: T0, built: built?.at || null, cached: built?.cached ?? null, window: Date.now(), loaded: null };
  g.release = ctx.powerwise.hold('present', { label: `${source.title} is playing` });
  try { ctx.powerwise.quiet(true); } catch { /* fine */ }
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (e, url) => { if (!url.startsWith(`${SCHEME}://${token}/`)) e.preventDefault(); });
  // (round 53, gameinput) the window's input: focus on open, the keys held for the game, no selection / drag ghosts
  g.input = GI.attach(win, { lowLatency: Boolean(req.input?.lowLatency), macFullscreen: req.macFullscreen, leave: (why) => { if (G === g) leave(why); } }).state;
  // the keys: Esc → the "Back to Hearth" card (Esc again / Enter leave; F the stats chip: gameinputmain.key); ⌘Q / ⌘W,
  // Ctrl+W leave; no other ⌘ shortcut reaches Hearth's menu
  // (round 56, playlatency) every key of the game passes here (the main process) before its page gets it: kept to a few
  // compares (measured by /game latency: PL.timed times it only while measuring)
  wc.on('before-input-event', PL.timed((e, input) => {
    if (input.type !== 'keyDown') return;
    if (NM && NM.key(e, input)) return; // (round 62, playnotes62) F8: a playtest note; its words box takes the keys while open
    if (GI.key(e, input)) return;
    const L = loop();
    const k = L?.letter ? L.letter(input) : String(input.key || '').toLowerCase(); // (round 54: by the key's letter on any layout)
    if (L?.key?.(input)) { e.preventDefault(); return; } // (round 53, playloop) Ctrl/⌘+P: back to editing, the game kept (after gameinput's keys)
    if ((mac && input.meta && (k === 'q' || k === 'w')) || (!mac && input.control && k === 'w') || (!mac && input.alt && k === 'f4')) { e.preventDefault(); leave('key'); return; }
    if (mac && input.meta) e.preventDefault();
  }));
  // (round 63, hitchmap63) recording the hitch map: the close waits once for the page's ring (≤ 1.2 s), then goes on
  win.on('close', (e) => { const p = G === g ? hitch()?.closing?.(g) : null; if (p) { e.preventDefault(); p.finally(() => { if (!win.isDestroyed()) win.close(); }); } });
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
  g.timing.loaded = Date.now();
  return info();
}

function register(ipcMain, c) {
  ctx = c;
  // the hub window asks to play / leave / test; the game window's own preload only asks its info and "Back to Hearth"
  const hub = (fn) => (e, ...a) => { const w = ctx.getWin(); if (!w || w.isDestroyed() || e.sender !== w.webContents) throw new Error('not from Hearth'); return fn(e, ...a); };
  const mine = (e) => Boolean(G?.win && !G.win.isDestroyed() && e.sender === G.win.webContents);
  // (round 60, trimdrive60) an expected "can't" (three.js not downloaded yet and offline) comes back as a plain answer the
  // hub shows, not a thrown handler error (Electron logs those in the main process as errors)
  ipcMain.handle('game:play', hub(async (e, req) => { try { return await play(e, req); } catch (err) { if (err?.calm) return { playing: false, error: err.message, offline: Boolean(err.offline) }; throw err; } }));
  ipcMain.handle('game:leave', hub(() => leave('asked')));
  ipcMain.handle('game:state', hub(() => info()));
  ipcMain.handle('game:displays', hub(() => displays().map(({ bounds, ...d }) => d)));
  ipcMain.handle('game:info', (e) => (mine(e) ? info() : null));
  ipcMain.on('game:back', (e) => { if (mine(e)) leave('back'); });
  // (round 55, playbudget) the page switched a helper off (game-preload.js relays window.__hearthBudget.pub()): kept
  // for this game; the hub asks what's kept (get) or forgets it (reset: the doctor's "Turn them back on", /game helpers on)
  ipcMain.on('game:budget', (e, json) => {
    if (!mine(e)) return;
    let p = null; try { p = JSON.parse(String(json || '').slice(0, 50000)); } catch { return; }
    G.budget.last = p; budget()?.note(G.source, p);
  });
  ipcMain.handle('game:budget-get', hub((_e, req = {}) => {
    const B = budget(); const source = req.source ? C.source(req.source) : G?.source || null;
    if (!B || !source) return { known: false, off: [] };
    if (req.op === 'reset') return { reset: B.reset(source), off: [] };
    if (req.op === 'shadow-reset') return { reset: Boolean(B.forgetShadow?.(source)), ...B.forGame(source) }; // (round 56, shadowready) /game look shadows reset
    return { known: true, ...B.forGame(source), now: G && C.sameSource(G.source, source) ? G.budget.last : null };
  }));
  // (round 53, playloop: playloopmain.js) rest / wake / side by side / the blip; the error line's Fix from the game window
  loop()?.register?.({ ctx: () => ctx, game: () => G, leave });
  // (round 56, playlatency) /game latency, the doctor's "Input" figure (playlatencymain.js); the window's answer
  ipcMain.handle('game:latency', hub((_e, req) => PL.ask(G, req || {})));
  ipcMain.on('game:lat-result', (e, json) => PL.result(e, json));
  ipcMain.handle('game:loop', hub((_e, req) => loop()?.op?.(req) || { playing: false }));
  ipcMain.on('game:fix', (e, d) => loop()?.fix?.(e, d));
  // (round 62, playnotes62) playtest notes: the hub lists / shows / words / jumps / clears (playnotesmain.js); the game
  // window's words box sends its words, asks for the voice input, says it closed
  pnotes()?.register?.({ ctx: () => ctx, game: () => G });
  ipcMain.handle('game:notes', hub((_e, req) => pnotes()?.op?.(req || {}) || { ok: false, why: 'notes are not in this Hearth' }));
  ipcMain.on('game:note-text', (e, d) => pnotes()?.onText?.(e, d));
  ipcMain.on('game:note-voice', (e, d) => pnotes()?.onVoice?.(e, d));
  ipcMain.on('game:note-box-off', (e) => pnotes()?.onBoxOff?.(e));
  // (round 63, hitchmap63) the hitch map: the hub turns it on / off mid-play, builds / lists / opens maps (hitchmapmain.js);
  // the game window's page saw a spike (its picture now)
  hitch()?.register?.({ ctx: () => ctx, game: () => G });
  ipcMain.handle('game:hitch', hub(async (_e, req) => { const r = await (hitch()?.op?.(req || {}) || { ok: false, why: 'the hitch map is not in this Hearth' }); if (G && (req?.op === 'on' || req?.op === 'off')) G.hitch = req.op === 'on' && r?.ok !== false; return r; }));
  ipcMain.on('game:hitch-spike', (e) => hitch()?.onSpike?.(e));
  // (round 64, clickfirst64) the F chip's words, clicked: ✎ Note is F8 (taken here, like the key); the hitch map's
  // Record / Stop goes to the hub, which keeps the setting and turns it on / off now (hitchmap.js set)
  ipcMain.on('game:chip', (e, what) => {
    if (!mine(e)) return;
    if (what === 'note') { Promise.resolve(pnotes()?.take?.({ by: 'chip' })).catch(() => {}); return; }
    const w = ctx.getWin(); if (what === 'hitch' && w && !w.isDestroyed()) w.webContents.send('game:chip-ev', { what: 'hitch' });
    if ((what === 'quality-auto' || what === 'quality-full') && w && !w.isDestroyed()) w.webContents.send('game:chip-ev', { what: 'quality', value: what.slice(8) }); // (round 72, labfps72: the hub keeps the choice)
    // (round 76, gpuplay76) 📈 the chip's Test performance, and the test card's buttons (Copy report, a fix): the hub does them
    if (what === 'perftest' && w && !w.isDestroyed()) w.webContents.send('game:chip-ev', { what: 'perftest' });
    if (/^perf:[a-z0-9-]{1,24}$/.test(String(what)) && w && !w.isDestroyed()) w.webContents.send('game:chip-ev', { what: 'perf', value: what.slice(5) });
  });
  // (round 76, gpuplay76) the performance test's card over the game (game-preload.js draws it): waiting / measuring / the report
  ipcMain.handle('game:perf-card', hub((_e, d) => { if (!G?.win || G.win.isDestroyed()) return false; G.win.webContents.send('game:perf', d && typeof d === 'object' ? d : {}); return true; }));
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
