// ▶ Play, ready sooner (round 56, readyspeed), main side. gamereadymain.js loads it (no IPC of its own: its channel
// 'gameready:speed' is gamereadymain's). What each game's getting ready learnt, kept between runs and launches, so the
// next ▶ Play of the same game skips or shortens what is still valid:
//   hints(source, ctx)  → { was, show, renderers, ab, quiet, abKey } for the page's query (tools/gameready-page.js):
//                        the first ▶ Play's time ("was", said once on the card when clearly sooner), how many renderers
//                        to wait for, the budget's A/B verdict when the game's files, Hearth's helpers in the window, the
//                        screen's refresh and the look are all the same (abKey), one quiet warm-up pass when enough
//   note(source, run)   a run's times and what it found (ReadySpeedCore.note), saved (debounced, atomic)
//   get(source)         the entry (for /game ready)
// data/game-cache/readyspeed.json: 100 games at most, datasafe read (unreadable → never written over).
// Nothing here ever changes the owner's files: they're only stat'ed (size + date) for the A/B key.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Core = require('./tools/readyspeed-core');

const MAX = 100;
let dataDir = null; let appDir = __dirname;
let mem = null; let bad = false; let saveT = 0;
const file = () => path.join(dataDir, 'game-cache', 'readyspeed.json');
function read() {
  if (mem) return mem;
  if (!dataDir) return (mem = { v: 1, games: {} });
  const r = require('./datasafe-core').load(fs, file(), null);
  if (r.state === 'unreadable' || (r.value && !r.value.games)) bad = true;
  mem = r.value?.games ? r.value : { v: 1, games: {} };
  return mem;
}
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(flush, 300);
}
function flush() {
  clearTimeout(saveT);
  if (bad || !dataDir || !mem) return false;
  try { fs.mkdirSync(path.dirname(file()), { recursive: true }); require('./crashsafe-core').writeAtomicSync(fs, file(), JSON.stringify(mem)); return true; } catch { return false; }
}
// a game's key: the budget's (a Lab scene by its id, an HTML build by its file)
const key = (source) => require('./playbudgetmain').key(source);
const stamp = (p) => { try { const s = fs.statSync(p); return `${s.size}:${Math.round(s.mtimeMs)}`; } catch { return '-'; } };
// Hearth's own scripts in the game window: an update to any of them measures again
const HELPERS = ['tools/playbudget-page.js', 'tools/gameready-page.js', 'tools/gamestream-page.js', 'tools/gameaudio-page.js', 'gamelook-preload.js', 'game-preload.js', 'tools/gameperf-probe.js'];
// the A/B's key: the game's files as served (a Lab scene: its built page's own key; an HTML build: its page and every
// file it loaded last time, by size + date), Hearth's helpers, the refresh, the look, the helpers kept off
function abKey(ctx = {}) {
  const h = crypto.createHash('sha1');
  h.update(String(Core.V));
  if (ctx.kind === 'lab' && ctx.root) { let k = '-'; try { k = JSON.parse(fs.readFileSync(path.join(ctx.root, 'hearth-play.json'), 'utf8')).key || '-'; } catch { /* a new build */ } h.update(`lab:${k}`); }
  else {
    // an HTML build: every file in its folder by size + date (sorted: the order a game loads them in varies), up to
    // 3000; a bigger folder adds the files it loaded last time
    h.update(`html:${ctx.file || ''}:${stamp(ctx.file || '')}`);
    const w = ctx.root ? walk(ctx.root, 3000) : { files: [], cut: true };
    for (const f of w.files) h.update(`${f}:${stamp(path.join(ctx.root, f))}`);
    if (w.cut) for (const f of [...(ctx.files || [])].sort().slice(0, 2000)) h.update(`${f}:${stamp(f)}`);
  }
  for (const f of HELPERS) h.update(`${f}:${stamp(path.join(appDir, f))}`);
  h.update(JSON.stringify([Math.round(Number(ctx.hz) || 60), ctx.look || '', [...(ctx.off || [])].sort()]));
  return h.digest('hex').slice(0, 20);
}
// a folder's files (relative, sorted), skipping dot folders and node_modules; cut: more than max
function walk(root, max) {
  const files = []; let cut = false;
  const go = (d, rel, depth) => {
    if (cut || depth > 8) return;
    let list = []; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      if (files.length >= max) { cut = true; return; }
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) go(path.join(d, e.name), r, depth + 1); else if (e.isFile()) files.push(r);
    }
  };
  go(root, '', 0);
  return { files: files.sort(), cut };
}
function hints(source, ctx = {}) {
  const k = key(source); const e = k ? read().games[k] : null;
  let ak = null; try { ak = abKey(ctx); } catch { ak = null; }
  return { ...Core.hints(e, { ab: ak }), abKey: ak };
}
function note(source, run = {}, ak = null) {
  const k = key(source); if (!k || bad) return null;
  const M = read();
  const e = Core.note(M.games[k], { ...run, abKey: ak });
  e.title = String(source.title || '').slice(0, 80);
  M.games[k] = e;
  const ks = Object.keys(M.games);
  if (ks.length > MAX) { ks.sort((a, b) => (M.games[a].at || 0) - (M.games[b].at || 0)); for (const x of ks.slice(0, ks.length - MAX)) delete M.games[x]; }
  save();
  return e;
}
function get(source) { const k = key(source); return k ? read().games[k] || null : null; }
function init(o = {}) { if (o.dataDir && o.dataDir !== dataDir) { dataDir = o.dataDir; mem = null; bad = false; } if (o.appDir) appDir = o.appDir; }
// (a test's fresh start: what a new launch reads from disk)
function forget() { flush(); mem = null; bad = false; }
module.exports = { init, hints, note, get, abKey, flush, forget, file };
