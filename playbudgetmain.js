// ▶ Play's budget (round 55, playbudget), main side. gamemodemain.js owns the game window; this adds one script, first
// in every HTML page the window serves (tools/playbudget-page.js, on the game's own address: the game's files are never
// changed), and remembers, per game, which of Hearth's helpers were slowing it (the page switched them off), so the
// next ▶ Play of that game starts without them.
//   pageTag(o)        '<script src="/__playbudget-page.js?hz=…&t=…&off=…">' (o: { hz, title, off })
//   isPage / pageFile the script itself
//   forGame(source)   { off: ['stream', …], by, ms, at } remembered for that game (a Lab scene by its id, an HTML build
//                     by its file); nothing known: { off: [] }
//   note(source, pub) what the page decided (window.__hearthBudget.pub()): the helpers it switched off are kept
//   reset(source)     forget it (the doctor's "Turn them back on", /game helpers on)
//   (round 56, shadowready) the Best look's shadow size chosen while getting ready (pub.shadow: { size, to, hz }) is kept
//   in the same record (forGame(source).shadow); the next ▶ Play of that game starts at it (gamemodemain.js hands it to
//   gamelook-preload.js). forgetShadow(source): /game look shadows reset
// data/game-cache/budget.json: 100 games at most, datasafe read (unreadable → never written over), atomic write.
const fs = require('fs');
const path = require('path');

const PAGE = '__playbudget-page.js';
const IDS = ['look', 'stream', 'audio', 'ready', 'perf']; // (the ones the page can switch off)
const MAX = 100;
let dataDir = null; let appDir = __dirname;
let mem = null; let bad = false; let saveT = 0;
const file = () => path.join(dataDir, 'game-cache', 'budget.json');

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
  saveT = setTimeout(() => {
    if (bad || !dataDir) return;
    try { fs.mkdirSync(path.dirname(file()), { recursive: true }); require('./crashsafe-core').writeAtomicSync(fs, file(), JSON.stringify(mem)); } catch { /* only a memory */ }
  }, 300);
}
// a game's key: a Lab scene by its id; an HTML build by its file (a folder: its index.html), case-blind on Mac / Windows
function key(source) {
  if (!source) return null;
  if (source.kind === 'lab') return source.id ? `lab:${source.id}` : null;
  if (!source.path) return null;
  let p = path.resolve(String(source.path));
  try { if (fs.statSync(p).isDirectory()) p = path.join(p, 'index.html'); } catch { /* as given */ }
  return `html:${process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p}`;
}
function forGame(source) {
  const k = key(source); const e = k ? read().games[k] : null;
  return e ? { off: e.off.filter((id) => IDS.includes(id)), by: e.by || {}, ms: e.ms || {}, at: e.at || 0, title: e.title || '', ...(e.shadow ? { shadow: e.shadow } : {}) } : { off: [] };
}
function note(source, pub) {
  const k = key(source); if (!k || !pub || !Array.isArray(pub.off)) return false;
  const M = read(); const e = M.games[k] || { off: [], by: {}, ms: {} };
  let changed = false;
  // (round 56, shadowready) the shadow size chosen while getting ready (a fresh choice, or the remembered one confirmed)
  const sh = pub.shadow;
  if (sh && Number(sh.size) >= 512 && Number(sh.size) <= 16384 && Number(sh.hz) > 0 && (sh.by === 'ready' || sh.by === 'remembered')) {
    const v = { size: Number(sh.size), to: Number(sh.to) || 0, hz: Math.round(Number(sh.hz)), at: Date.now() };
    if (!e.shadow || e.shadow.size !== v.size || e.shadow.to !== v.to || e.shadow.hz !== v.hz) { e.shadow = v; changed = true; }
  }
  for (const o of pub.off) {
    if (!o || !IDS.includes(o.id) || o.by === 'remembered' || e.off.includes(o.id)) continue;
    e.off.push(o.id); e.by[o.id] = o.by === 'ab' ? 'ab' : 'watch'; if (Number.isFinite(o.ms)) e.ms[o.id] = o.ms;
    changed = true;
  }
  if (!changed) return false;
  e.at = Date.now(); e.title = String(source.title || pub.title || '').slice(0, 80);
  M.games[k] = e;
  const ks = Object.keys(M.games);
  if (ks.length > MAX) { ks.sort((a, b) => (M.games[a].at || 0) - (M.games[b].at || 0)); for (const x of ks.slice(0, ks.length - MAX)) delete M.games[x]; }
  save();
  return true;
}
function forgetShadow(source) {
  const k = key(source); const M = read();
  if (!k || !M.games[k] || !M.games[k].shadow) return false;
  delete M.games[k].shadow;
  if (!M.games[k].off.length) delete M.games[k];
  save();
  return true;
}
function reset(source) {
  const k = key(source); const M = read();
  if (!k || !M.games[k]) return false;
  delete M.games[k]; save();
  return true;
}
function pageTag(o = {}) {
  const q = new URLSearchParams({ hz: String(Math.round(Number(o.hz) || 60)), t: String(o.title || '').slice(0, 80) });
  const off = (o.off || []).filter((id) => IDS.includes(id));
  if (off.length) q.set('off', off.join(','));
  return `<script src="/${PAGE}?${q}"></script>`;
}
const isPage = (pathname) => pathname === `/${PAGE}`;
const pageFile = () => path.join(appDir, 'tools', 'playbudget-page.js');
function init(o = {}) { if (o.dataDir && o.dataDir !== dataDir) { dataDir = o.dataDir; mem = null; bad = false; } if (o.appDir) appDir = o.appDir; }

module.exports = { init, pageTag, isPage, pageFile, forGame, note, reset, forgetShadow, key, IDS };
