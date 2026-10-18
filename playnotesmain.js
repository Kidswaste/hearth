// ▶ Play's playtest notes (round 62, playnotes62), main side. gamemodemain.js owns the game window; this adds one key,
// read where the window's other keys are (its before-input-event, like Esc / F / Ctrl+P: nothing listens in the page):
//   F8 (or the key set with /playtest key)  a note at that moment: the window's picture (capturePage: the compositor's
//            own frame, taken once, now: no per-frame capture, no preserveDrawingBuffer), the time into the session,
//            what the game saves (a Lab layer's saveState() through window.__labHot; an HTML build's window.hearthState()
//            / window.game / window.__game) and the cameras (window.__scenes), the frame rate then (the performance
//            probe's last frames when it's attached, else the budget watch's last second: both already running, so
//            nothing is measured for this), one short read in the page, then "✎ Note 3" over the game for a moment.
//   Shift+F8 the same, plus a small box over the game for words (typed; 🎤 asks Hearth's voice input, only when pressed).
// Until the key is pressed this costs nothing in the game window: no script, no listener, no frame callback of its own.
// Notes live per game in data/game-cache/<game>/notes: log.json (atomic writes, datasafe read: a log that can't be read
// is never written over) and one JPEG per note. The game's own files are never touched.
// Channels (registered in gamemodemain.js, which main.js reads for its lazy load):
//   game:notes { op: 'list' | 'shot' | 'text' | 'remove' | 'clear' | 'state' | 'box' | 'take', source?, id?, … } (hub)
//   game:note-text { id, text } · game:note-voice { id } · game:note-box-off (the game window's box)
//   events to the hub: game:notes-ev { type: 'added' | 'voice' | 'text', … }; to the game window: game:note, game:note-box
const fs = require('fs');
const path = require('path');
const C = require('./playnotes-core');

let api = null; // { ctx(), game() } from gamemodemain
let dataDir = null;
const S = { combo: C.combo(C.DEFAULT_KEY), session: 0, n: 0, busy: false, box: null, last: null, logs: new Map(), bad: new Set() };

const G = () => { const g = api?.game?.(); return g?.win && !g.win.isDestroyed() ? g : null; };
const hubWin = () => { const w = api?.ctx?.()?.getWin?.(); return w && !w.isDestroyed() ? w : null; };
const tell = (d) => { try { hubWin()?.webContents.send('game:notes-ev', d); } catch { /* gone */ } };
const toGame = (ch, d) => { try { G()?.win.webContents.send(ch, d); } catch { /* gone */ } };
const gameKey = (source) => { try { return require('./playbudgetmain').key(source); } catch { return null; } };
const dirOf = (source) => { const k = gameKey(source); return k && dataDir ? path.join(dataDir, 'game-cache', C.folder(k), 'notes') : null; };

// ---------- the log (one per game, kept in memory once read) ----------
function readLog(source) {
  const dir = dirOf(source); if (!dir) return null;
  if (S.logs.has(dir)) return S.logs.get(dir);
  const r = require('./datasafe-core').load(fs, path.join(dir, 'log.json'), null);
  if (r.state === 'unreadable' || (r.value && !C.valid(r.value))) S.bad.add(dir);
  const log = C.valid(r.value) ? r.value : C.empty({ key: gameKey(source), title: source.title, kind: source.kind, id: source.id, path: source.path });
  if (source.title) log.game.title = String(source.title).slice(0, 80);
  S.logs.set(dir, log);
  return log;
}
function writeLog(source, log) {
  const dir = dirOf(source);
  if (!dir || S.bad.has(dir)) return false; // (unreadable on disk: never written over)
  fs.mkdirSync(dir, { recursive: true });
  require('./crashsafe-core').writeAtomicSync(fs, path.join(dir, 'log.json'), JSON.stringify(log));
  return true;
}

// ---------- the key ----------
// gamemodemain's before-input-event asks this first; true = taken (the page doesn't get it; Esc / F / Ctrl+P aren't read)
function key(e, input) {
  if (S.box) {
    // the words box is open: Esc closes it (the words typed are kept); every other key is the box's (typed into it),
    // not the window's shortcuts (F would toggle the chip, Esc the card)
    if (input.type === 'keyDown' && String(input.key) === 'Escape') { e.preventDefault(); closeBox('esc'); return true; }
    // Ctrl/⌘+P (back to editing) and the leave keys still work: the box closes (its words kept) and they go on
    if (input.type === 'keyDown' && (input.control || input.meta) && /^(KeyP|KeyQ|KeyW)$/.test(String(input.code || ''))) { closeBox('key'); return false; }
    return true;
  }
  const m = C.matches(S.combo, input);
  if (!m) return false;
  e.preventDefault();
  take({ box: m === 'box', by: 'key' }).catch(() => {});
  return true;
}

// one short read in the game's page, only now: what it saves, its cameras, the frame rate it already measures
const READ = `(() => {
  var W = window, out = { t: performance.now() }, seen = new WeakSet(), left = 6000;
  function plain(v, d) {
    if (left-- <= 0) return undefined;
    if (v == null || typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.slice(0, 400);
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'object' || d > 6 || seen.has(v)) return undefined;
    if (typeof Node !== 'undefined' && v instanceof Node) return undefined;
    seen.add(v);
    if (v.isVector2 || v.isVector3 || v.isVector4 || v.isQuaternion || v.isEuler || v.isColor) { try { return v.toArray(); } catch (e) { return undefined; } }
    if (v.isObject3D) return { position: v.position.toArray(), quaternion: v.quaternion.toArray() };
    if (ArrayBuffer.isView(v)) return v.length <= 64 ? Array.prototype.slice.call(v) : undefined;
    if (typeof v.then === 'function' || v instanceof Map || v instanceof Set || v instanceof WeakMap) return undefined;
    if (Array.isArray(v)) return v.slice(0, 400).map(function (x) { var y = plain(x, d + 1); return y === undefined ? null : y; });
    var o = {}, ks = Object.keys(v).slice(0, 120);
    for (var i = 0; i < ks.length; i++) { var y; try { y = plain(v[ks[i]], d + 1); } catch (e) { y = undefined; } if (y !== undefined) o[ks[i]] = y; }
    return o;
  }
  var xyz = function (p) { return p && typeof p.x === 'number' ? { x: p.x, y: typeof p.y === 'number' ? p.y : 0, z: typeof p.z === 'number' ? p.z : 0 } : Array.isArray(p) && p.length === 3 && p.every(function (n) { return typeof n === 'number'; }) ? { x: p[0], y: p[1], z: p[2] } : null; };
  var posIn = function (s) { if (!s || typeof s !== 'object') return null; return xyz(s.player && (s.player.position || s.player)) || xyz(s.position) || xyz(s.pos) || (typeof s.x === 'number' && (typeof s.z === 'number' || typeof s.y === 'number') ? xyz(s) : null); };
  try {
    if (W.__labHot) { out.kind = 'lab'; out.state = plain(W.__labHot.save(), 0); for (var id in out.state || {}) { var p = posIn(out.state[id]); if (p) { out.pos = Object.assign(p, { from: 'state' }); break; } } }
    else {
      out.kind = 'html';
      var names = ['hearthState', 'game', '__game', 'gameState', 'GAME'];
      for (var i = 0; i < names.length && out.state === undefined; i++) {
        var v; try { v = W[names[i]]; if (names[i] === 'hearthState' && typeof v === 'function') v = v(); } catch (e) { v = null; }
        if (v && typeof v === 'object' && !(typeof Node !== 'undefined' && v instanceof Node)) { out.state = plain(v, 0); out.from = names[i]; var p2 = posIn(v); if (p2) out.pos = Object.assign(p2, { from: 'state' }); }
      }
      out.restore = typeof W.hearthRestore === 'function';
    }
  } catch (e) { out.err = String(e && e.message || e).slice(0, 200); }
  var cams = {};
  try { var sc = W.__scenes; if (sc) for (var k in sc) { var c = sc[k] && sc[k].camera; if (c && c.isCamera) cams[k] = { p: c.position.toArray(), q: c.quaternion.toArray(), z: c.zoom }; } } catch (e) { /* fine */ }
  try { var c2 = W.camera; if (c2 && c2.isCamera && !Object.keys(cams).length) cams.camera = { p: c2.position.toArray(), q: c2.quaternion.toArray(), z: c2.zoom }; } catch (e) { /* fine */ }
  out.cams = cams;
  if (!out.pos) { for (var k2 in cams) { out.pos = { x: cams[k2].p[0], y: cams[k2].p[1], z: cams[k2].p[2], from: 'camera' }; break; } }
  try { var gp = W.__gamePerf; if (gp && gp.recent) out.perf = gp.recent(60); } catch (e) { /* fine */ }
  try { var hb = W.__hearthBudget; if (!out.perf && hb && hb.pace) out.perf = hb.pace(); } catch (e) { /* fine */ }
  out.readMs = performance.now() - out.t;
  return JSON.stringify(out);
})()`;
const within = (p, ms, v) => Promise.race([p, new Promise((r) => setTimeout(r, ms, v))]);

async function take({ box = false, by = 'key' } = {}) {
  const g = G();
  if (!g) return { ok: false, why: 'not playing' };
  if (S.busy) return { ok: false, why: 'busy' };
  S.busy = true;
  const at = Date.now();
  try {
    const wc = g.win.webContents;
    if (S.session !== g.started) { S.session = g.started; S.n = 0; }
    // the picture first (the moment the key went down), the page's read beside it
    const [img, raw] = await Promise.all([
      within(wc.capturePage().catch(() => null), 3000, null),
      within(wc.executeJavaScript(READ, true).catch(() => null), 1500, null),
    ]);
    let r = {}; try { r = raw ? JSON.parse(raw) : {}; } catch { r = {}; }
    const id = `n${at.toString(36)}`;
    let shot = null; let w = null; let h = null;
    const dir = dirOf(g.source);
    if (!dir) return { ok: false, why: 'no data folder' };
    if (img && !img.isEmpty()) {
      const sz = img.getSize();
      const small = sz.width > 1280 ? img.resize({ width: 1280, quality: 'good' }) : img;
      ({ width: w, height: h } = small.getSize());
      fs.mkdirSync(dir, { recursive: true });
      shot = `${id}.jpg`;
      require('./crashsafe-core').writeAtomicSync(fs, path.join(dir, shot), small.toJPEG(82));
    }
    const log = readLog(g.source);
    const res = C.add(log, { id, at, session: g.started, secs: (at - g.started) / 1000, kind: g.source.kind, shot, w, h, state: r.state, cams: r.cams, pos: r.pos, perf: r.perf, hz: g.hz, readMs: r.readMs });
    for (const d of res.dropped) if (d.shot) { try { fs.rmSync(path.join(dir, d.shot), { force: true }); } catch { /* fine */ } }
    const saved = writeLog(g.source, res.log);
    S.n += 1;
    const brief = C.brief(res.note, res.log.notes.length - 1);
    S.last = { id, ms: Date.now() - at, readMs: r.readMs ?? null, saved, by };
    toGame('game:note', { text: saved ? `✎ Note ${S.n}${box ? '' : ` · ${S.label || S.combo.text}`}` : '✎ Note kept for now (its log couldn\'t be read: not saved)' });
    if (box) openBox(id);
    tell({ type: 'added', source: g.source, session: g.started, n: S.n, note: brief, saved });
    return { ok: true, id, n: S.n, saved, note: brief, ms: S.last.ms };
  } finally { S.busy = false; }
}

// ---------- the words box ----------
function openBox(id) { S.box = { id, at: Date.now() }; toGame('game:note-box', { open: true, id }); }
function closeBox(why = 'asked') { if (!S.box) return; S.box = null; toGame('game:note-box', { open: false, why }); }
function setText(source, id, text, { append = false, echo = false } = {}) {
  const log = readLog(source); if (!log) return null;
  const n = C.update(log, id, { text, append });
  if (!n) return null;
  writeLog(source, log);
  if (echo) toGame('game:note-box', { text: n.text, id });
  tell({ type: 'text', source, id, text: n.text });
  return n;
}

// ---------- the hub asks ----------
async function op(req = {}) {
  const o = String(req.op || 'state');
  const g = G();
  const source = req.source || g?.source || null;
  if (o === 'state') return { playing: Boolean(g), key: S.combo?.text || null, session: S.session, n: S.n, box: Boolean(S.box), last: S.last };
  if (o === 'key') { const c = C.combo(req.key); if (!c) return { ok: false, key: S.combo?.text }; S.combo = c; S.label = req.label || c.text; return { ok: true, key: c.text }; }
  if (o === 'take') return take({ box: Boolean(req.box), by: 'asked' });
  if (o === 'box') { if (req.status) toGame('game:note-box', { status: String(req.status).slice(0, 80) }); else if (req.open === false) closeBox('asked'); return { box: Boolean(S.box) }; }
  if (!source) return { ok: false, why: 'no game' };
  const log = readLog(source);
  const dir = dirOf(source);
  if (!log || !dir) return { ok: false, why: 'no game' };
  if (o === 'list') {
    const notes = C.list(log);
    return { ok: true, game: log.game, notes: req.session ? notes.filter((n) => n.session === req.session) : notes, unreadable: S.bad.has(dir) };
  }
  const note = req.id ? log.notes.find((n) => n.id === req.id) : null;
  if (o === 'get') return note ? { ok: true, note, game: log.game } : { ok: false, why: 'no such note' };
  if (o === 'shot') {
    if (!note?.shot) return { ok: false, why: 'no picture' };
    const file = path.join(dir, note.shot);
    if (req.path) return { ok: fs.existsSync(file), path: file };
    try {
      const { nativeImage } = require('electron');
      let img = nativeImage.createFromPath(file);
      if (img.isEmpty()) return { ok: false, why: 'the picture is gone' };
      if (req.width && img.getSize().width > req.width) img = img.resize({ width: Math.max(80, Math.min(1280, Number(req.width))), quality: 'good' });
      return { ok: true, data: img.toJPEG(req.width ? 76 : 86).toString('base64'), mime: 'image/jpeg', path: file, ...img.getSize() };
    } catch (err) { return { ok: false, why: err.message }; }
  }
  if (o === 'text') { const n = setText(source, req.id, req.text, { append: Boolean(req.append), echo: Boolean(req.echo) }); return n ? { ok: true, text: n.text } : { ok: false, why: 'no such note' }; }
  if (o === 'remove') {
    const n = C.remove(log, req.id);
    if (!n) return { ok: false, why: 'no such note' };
    writeLog(source, log);
    if (n.shot) await toBin(path.join(dir, n.shot));
    return { ok: true };
  }
  if (o === 'clear') {
    const n = log.notes.length;
    if (!n) return { ok: true, n: 0 };
    if (S.bad.has(dir)) return { ok: false, why: 'its log couldn\'t be read: left as it is' };
    const where = await toBin(dir);
    S.logs.delete(dir);
    return { ok: Boolean(where), n, where };
  }
  return { ok: false, why: `unknown op ${o}` };
}
// to the Trash / Recycle Bin (never deleted for good); a check: its own folder; no Trash there: Hearth's data/trash
async function toBin(p) {
  if (!fs.existsSync(p)) return null;
  const moveTo = async (base) => { const to = path.join(base, `${Date.now().toString(36)}-${path.basename(path.dirname(p))}-${path.basename(p)}`); fs.mkdirSync(base, { recursive: true }); fs.renameSync(p, to); return to; };
  if (process.env.HEARTH_TEST_SAVE_DIR) return moveTo(path.join(process.env.HEARTH_TEST_SAVE_DIR, 'playnotes-trash'));
  // (platform46) a network share / a USB stick on Windows has no Trash (it would delete for good): Hearth's own trash then
  const check = process.platform === 'win32' ? require('./winpolish').trashCheck(p, { platform: 'win32' })
    : process.platform === 'darwin' ? require('./macpolish').trashCheck(p, { platform: 'darwin' }) : { ok: true };
  if (!check.ok) return moveTo(path.join(dataDir, 'trash', 'playnotes'));
  try { await require('electron').shell.trashItem(check.path || p); return 'trash'; } catch { return moveTo(path.join(dataDir, 'trash', 'playnotes')); }
}

// ---------- wiring (gamemodemain.js) ----------
function init(o = {}) { if (o.dataDir && o.dataDir !== dataDir) { dataDir = o.dataDir; S.logs.clear(); S.bad.clear(); } }
function register(a) { api = a; }
// a game starts: its key (the hub's setting: { key, label }) and a fresh count; returns the key's label for the window's hint
function arm(o = {}) {
  const c = C.combo(o.key) || C.combo(C.DEFAULT_KEY);
  S.combo = c; S.label = o.label || c.text; S.session = 0; S.n = 0; S.box = null; S.busy = false; // (the session: the window's start, at its first note)
  return S.label;
}
function ended() { S.box = null; S.busy = false; }
function fromGame(e) { const g = G(); return Boolean(g && e.sender === g.win.webContents); }
const onText = (e, d = {}) => { if (!fromGame(e) || !d.id) return; setText(G().source, String(d.id), String(d.text || ''), {}); if (d.close) closeBox('enter'); };
const onVoice = (e, d = {}) => { if (!fromGame(e) || !d.id) return; tell({ type: 'voice', source: G().source, id: String(d.id) }); };
const onBoxOff = (e) => { if (fromGame(e)) S.box = null; };

module.exports = { init, register, arm, ended, key, take, op, onText, onVoice, onBoxOff, READ, _test: { S, readLog, dirOf } };
