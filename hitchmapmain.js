// ▶ Play's hitch map (round 63, hitchmap63), main side. gamemodemain.js owns the game window; this adds, ONLY when the
// owner turned the recording on (hub store hitchmap.on: /playtest hitchmap on, ▶ Play's right-click), one script to the
// game's pages (tools/hitchmap-page.js: per frame the frame's time and where the player / camera were, into a typed ring),
// and after the session turns what it kept into the map (hitchmap-core.js):
//   arm(req)        game:play's hitch: { on } → the page's tag goes in (pageTag), first after the budget's
//   spike           the page saw a spike (its event → game-preload.js → game:hitch-spike): one picture of the moment and
//                   one short read of what the game saves, through playnotes62's capture path (playnotesmain.grab: the
//                   compositor's frame, taken once), at most 4 a session (the page decides)
//   collect(why)    the session ends (leave: the window's close waits ≤ 1.2 s for it; Ctrl/⌘+P back to editing; /playtest
//                   hitchmap off): the page's ring read once (dump()), GamePerf's slow frames when its probe was attached,
//                   the map built and saved, the hub told (game:hitch-ev { type: 'built' })
//   on / off        while a game plays: the script put in now (executeJavaScript), or stopped and the map built
// Saved per game next to its playtest notes: data/game-cache/<game>/hitch/<session>.json (+ <session>-<k>.jpg), 20 maps
// a game at most (the oldest go to the Trash), atomic writes. Off: nothing of this exists in the game window.
// Channels (registered in gamemodemain.js, which main.js reads for its lazy load): game:hitch (hub) · game:hitch-spike
// (the game window) · events to the hub game:hitch-ev · to the game window game:hitch-on.
const fs = require('fs');
const path = require('path');
const C = require('./hitchmap-core');

const PAGE = '__hitchmap-page.js';
const MAX_MAPS = 20;
let api = null; // { ctx(), game() } from gamemodemain
let dataDir = null; let appDir = __dirname;
const S = { on: false, session: 0, shots: [], busy: false, closing: false, built: null, last: null };

const G = () => { const g = api?.game?.(); return g?.win && !g.win.isDestroyed() ? g : null; };
const hubWin = () => { const w = api?.ctx?.()?.getWin?.(); return w && !w.isDestroyed() ? w : null; };
const tell = (d) => { try { hubWin()?.webContents.send('game:hitch-ev', d); } catch { /* gone */ } };
const notes = () => { try { return require('./playnotesmain'); } catch { return null; } };
const gameKey = (source) => { try { return require('./playbudgetmain').key(source); } catch { return null; } };
const dirOf = (source) => { const k = gameKey(source); return k && dataDir ? path.join(dataDir, 'game-cache', require('./playnotes-core').folder(k), 'hitch') : null; };
const idOf = (started) => `h${Number(started || 0).toString(36)}`;
const within = (p, ms, v) => Promise.race([p, new Promise((r) => setTimeout(r, ms, v))]);
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); require('./crashsafe-core').writeAtomicSync(fs, file, data); };

// ---------- the window ----------
function arm(o = {}) {
  S.on = Boolean(o && o.on); S.session = 0; S.shots = []; S.busy = false; S.closing = false; S.built = null;
  return S.on;
}
function pageTag(hz) { return S.on ? `<script src="/${PAGE}?hz=${Math.round(Number(hz) || 60)}"></script>` : ''; }
const isPage = (pathname) => pathname === `/${PAGE}`;
const pageFile = () => path.join(appDir, 'tools', 'hitchmap-page.js');

// a spike in the page: its picture and what the game saves, now (playnotes62's capture: once, on the spike only)
async function onSpike(e) {
  const g = G();
  if (!g || e.sender !== g.win.webContents || !S.on || S.busy || S.shots.length >= 4) return;
  S.busy = true;
  try {
    if (!S.session) S.session = g.started;
    const wc = g.win.webContents;
    const N = notes();
    const [grabbed, sp] = await Promise.all([
      N?.grab ? N.grab(wc) : Promise.resolve({ img: null, r: {} }),
      within(wc.executeJavaScript('window.__hearthHitch ? window.__hearthHitch.spike() : ""', true).catch(() => ''), 1500, ''),
    ]);
    let spike = {}; try { spike = sp ? JSON.parse(sp) : {}; } catch { spike = {}; }
    const k = S.shots.length + 1;
    const id = `${idOf(g.started)}-${k}`;
    let file = null; let w = null; let h = null;
    const dir = dirOf(g.source);
    const img = grabbed?.img;
    if (dir && img && !img.isEmpty()) {
      const small = img.getSize().width > 1280 ? img.resize({ width: 1280, quality: 'good' }) : img;
      ({ width: w, height: h } = small.getSize());
      file = `${id}.jpg`;
      write(path.join(dir, file), small.toJPEG(80));
    }
    const r = grabbed?.r || {};
    let state = r.state ?? null; let stateBig = false;
    try { if (state != null && JSON.stringify(state).length > 64 * 1024) { state = null; stateBig = true; } } catch { state = null; }
    S.shots.push({ id, t: Number(spike.t) || 0, dt: Number(spike.dt) || 0, file, w, h, state, ...(stateBig ? { stateBig } : {}), cams: r.cams || null, pos: r.pos || null, at: Date.now() });
  } catch { /* a picture missed: the map still has the numbers */ } finally { S.busy = false; }
}

// ---------- the session ends: the map ----------
const DUMP = `(() => { var h = window.__hearthHitch; if (!h) return ''; var d = JSON.parse(h.dump()); var p = window.__gamePerf;
  try { if (p && p.slows && !(p.state && p.state().off)) d.slows = p.slows(); } catch (e) { /* no probe */ }
  return JSON.stringify(d); })()`;
async function collect(why = 'asked', g0 = null) {
  const g = g0 || G();
  if (!g || !S.on) return { ok: false, why: S.on ? 'not playing' : 'the hitch map is off' };
  let raw = '';
  try { raw = await within(g.win.webContents.executeJavaScript(DUMP, true).catch(() => ''), 1100, ''); } catch { raw = ''; }
  if (!raw) return { ok: false, why: 'the page didn\'t answer' };
  let trace = null; let slows = null;
  try { const d = JSON.parse(raw); slows = d.slows || null; delete d.slows; trace = C.decode(d); } catch { trace = null; }
  if (!trace || trace.n < 2) return { ok: false, why: 'nothing recorded yet' };
  // GamePerf's slow frames (its probe attached: the doctor, the chip, the director's perf) on the recording's clock
  let sl = null;
  if (Array.isArray(slows)) {
    let attribute = null; try { attribute = require('./tools/gameperf-core').attribute; } catch { attribute = null; }
    const budget = 1000 / (Number(trace.hz) || 60);
    sl = slows.filter((f) => f && Number.isFinite(f.at) && Number.isFinite(f.dt)).map((f) => ({ end: f.at + f.dt - (Number(trace.t0) || 0), dt: f.dt, cause: attribute ? attribute(f, budget).cause : (f.gc ? 'gc' : 'busy'), fn: f.longFn || f.fn || null, load: f.load || null }));
  }
  const session = S.session || g.started; S.session = session;
  const map = C.build(trace, { shots: S.shots, slows: sl, session, game: { key: gameKey(g.source), title: g.source.title, kind: g.source.kind, ...(g.source.id ? { id: g.source.id } : {}), ...(g.source.path ? { path: g.source.path } : {}) } });
  map.id = idOf(session); map.why = why; map.started = session;
  const dir = dirOf(g.source);
  let saved = false;
  if (dir) { try { write(path.join(dir, `${map.id}.json`), JSON.stringify(map)); saved = true; prune(dir).catch(() => {}); } catch { saved = false; } }
  S.built = { id: map.id, at: Date.now(), why };
  const brief = { id: map.id, session, secs: map.secs, hitches: map.hitches, spots: map.spots.length, top: map.spots[0] ? C.line(map.spots[0], map) : '', line: C.brief(map), cost: map.cost, stopped: map.stopped };
  S.last = brief;
  tell({ type: 'built', source: g.source, why, saved, ...brief });
  return { ok: true, saved, ...brief };
}
// past 20 maps a game, the oldest (and its pictures) go to the Trash
async function prune(dir) {
  const maps = fs.readdirSync(dir).filter((f) => /^h[0-9a-z]+\.json$/i.test(f)).sort((a, b) => parseInt(a.slice(1), 36) - parseInt(b.slice(1), 36));
  for (const f of maps.slice(0, Math.max(0, maps.length - MAX_MAPS))) {
    const id = f.slice(0, -5);
    for (const x of fs.readdirSync(dir).filter((y) => y === f || (y.startsWith(`${id}-`) && /\.jpe?g$/i.test(y)))) await toBin(path.join(dir, x));
  }
}
async function toBin(p) { const N = notes(); if (N?.toBin) return N.toBin(p); try { fs.rmSync(p, { recursive: true, force: true }); return 'gone'; } catch { return null; } }

// the window's close waits for the map once (≤ 1.2 s: leave() destroys a window that hasn't closed in 1.5 s)
function closing(g) {
  if (!S.on || S.closing || !g?.win || g.win.isDestroyed()) return null;
  S.closing = true;
  return collect('end', g).catch(() => null);
}
function ended() { S.busy = false; S.closing = false; }

// ---------- the hub asks ----------
const PAGE_OPTS = (g) => `window.__hearthHitchOpts = { hz: ${Math.round(Number(g.hz) || 60)} };`;
function list(source) {
  const dir = dirOf(source);
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => /^h[0-9a-z]+\.json$/i.test(x))) {
    try { const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); out.push({ id: m.id || f.slice(0, -5), session: m.session, at: m.at, secs: m.secs, hitches: m.hitches, spots: (m.spots || []).length, line: C.brief(m), top: m.spots?.[0] ? C.line(m.spots[0], m) : '' }); } catch { /* a broken one is skipped, never written over */ }
  }
  return out.sort((a, b) => (b.session || 0) - (a.session || 0));
}
async function op(req = {}) {
  const o = String(req.op || 'state');
  const g = G();
  if (o === 'state') {
    let page = null;
    if (g && S.on) { try { const v = await within(g.win.webContents.executeJavaScript('window.__hearthHitch ? window.__hearthHitch.pub() : ""', true), 1000, ''); page = v ? JSON.parse(v) : null; } catch { page = null; } }
    return { playing: Boolean(g), on: S.on, shots: S.shots.length, built: S.built, last: S.last, page };
  }
  if (o === 'on') {
    if (!g) return { ok: true, playing: false };
    if (S.on) return { ok: true, playing: true, already: true };
    S.on = true; S.shots = []; S.session = g.started; S.closing = false;
    try {
      const src = fs.readFileSync(pageFile(), 'utf8');
      await g.win.webContents.executeJavaScript(`${PAGE_OPTS(g)}\n${src}\n;1`, true);
      g.win.webContents.send('game:hitch-on', { on: true });
    } catch (err) { S.on = false; return { ok: false, why: err.message }; }
    return { ok: true, playing: true, now: true };
  }
  if (o === 'off') {
    if (!g || !S.on) { S.on = false; return { ok: true, playing: Boolean(g) }; }
    const r = await collect('asked', g);
    try { await g.win.webContents.executeJavaScript('window.__hearthHitch ? window.__hearthHitch.stop("asked") : 0', true); } catch { /* fine */ }
    try { g.win.webContents.send('game:hitch-on', { on: false }); } catch { /* fine */ }
    S.on = false;
    return { ok: true, playing: true, built: r };
  }
  if (o === 'collect') return collect(req.why || 'asked');
  const source = req.source || g?.source || null;
  if (!source) return { ok: false, why: 'no game' };
  const dir = dirOf(source);
  if (!dir) return { ok: false, why: 'no data folder' };
  if (o === 'list') return { ok: true, maps: list(source) };
  if (o === 'get') {
    const ls = list(source); const id = req.id || ls[0]?.id;
    if (!id || !/^h[0-9a-z]+$/.test(id)) return { ok: false, why: 'no map yet' };
    try { return { ok: true, map: JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')), maps: ls }; } catch { return { ok: false, why: 'that map is gone' }; }
  }
  if (o === 'shot') {
    const f = String(req.file || '');
    if (!/^h[0-9a-z]+-\d+\.jpg$/i.test(f)) return { ok: false, why: 'no picture' };
    const file = path.join(dir, f);
    if (req.path) return { ok: fs.existsSync(file), path: file };
    try {
      const { nativeImage } = require('electron');
      let img = nativeImage.createFromPath(file);
      if (img.isEmpty()) return { ok: false, why: 'the picture is gone' };
      if (req.width && img.getSize().width > req.width) img = img.resize({ width: Math.max(80, Math.min(1280, Number(req.width))), quality: 'good' });
      return { ok: true, data: img.toJPEG(76).toString('base64'), mime: 'image/jpeg', path: file, ...img.getSize() };
    } catch (err) { return { ok: false, why: err.message }; }
  }
  if (o === 'clear') {
    if (!fs.existsSync(dir)) return { ok: true, n: 0 };
    const n = list(source).length;
    const where = await toBin(dir);
    return { ok: Boolean(where), n, where };
  }
  return { ok: false, why: `unknown op ${o}` };
}

function init(o = {}) { if (o.dataDir) dataDir = o.dataDir; if (o.appDir) appDir = o.appDir; }
function register(a) { api = a; }

module.exports = { init, register, arm, pageTag, isPage, pageFile, onSpike, collect, closing, ended, op, list, PAGE, _test: { S, dirOf, idOf, DUMP } };
