// ▶ Play's sound (round 54, gameaudio), main side. gamemodemain.js owns the game window; this adds one script, first in
// every HTML page the window serves (tools/gameaudio-page.js, on the game's own address: the game's files are never
// changed), and remembers which sound files a game loaded, so the next ▶ Play of it decodes them before the first frame.
//   pageTag(root, o)   '<script src="/__gameaudio-page.js?k=html&s=[…]">': k = lab | html, s = the sounds this game's
//                      folder served last time (an HTML build; a Lab scene's sounds come with its references)
//   isPage / pageFile  the script itself
//   served(root, rel)  a file the window served: a sound is kept for that folder (data/game-cache/sounds.json, 50
//                      folders × 60 sounds, datasafe read + atomic write, saved a moment after the last one)
const fs = require('fs');
const path = require('path');

const SOUND = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac|weba)$/i;
const PAGE = '__gameaudio-page.js';
const MAX_ROOTS = 50; const MAX_SOUNDS = 60;
let dataDir = null; let appDir = __dirname;
let mem = null; let bad = false; let saveT = 0;
const file = () => path.join(dataDir, 'game-cache', 'sounds.json');

function read() {
  if (mem) return mem;
  if (!dataDir) return (mem = { v: 1, roots: {} });
  // datasafe's read: missing → nothing known yet; unreadable → never written over
  const r = require('./datasafe-core').load(fs, file(), null);
  if (r.state === 'unreadable' || (r.value && !r.value.roots)) bad = true;
  mem = r.value?.roots ? r.value : { v: 1, roots: {} };
  return mem;
}
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (bad || !dataDir) return;
    try { fs.mkdirSync(path.dirname(file()), { recursive: true }); require('./crashsafe-core').writeAtomicSync(fs, file(), JSON.stringify(mem)); } catch { /* only a cache */ }
  }, 800);
}
const key = (root) => { const p = path.resolve(String(root || '')); return process.platform === 'win32' || process.platform === 'darwin' ? p.toLowerCase() : p; };

function served(root, rel) {
  if (!root || !SOUND.test(String(rel || ''))) return false;
  const M = read(); const k = key(root);
  const list = M.roots[k]?.sounds || [];
  if (list.includes(rel)) return false;
  M.roots[k] = { sounds: [...list, rel].slice(-MAX_SOUNDS), at: Date.now() };
  const ks = Object.keys(M.roots);
  if (ks.length > MAX_ROOTS) { ks.sort((a, b) => (M.roots[a].at || 0) - (M.roots[b].at || 0)); for (const x of ks.slice(0, ks.length - MAX_ROOTS)) delete M.roots[x]; }
  save();
  return true;
}
const sounds = (root) => (root ? read().roots[key(root)]?.sounds || [] : []);

function pageTag(root, o = {}) {
  const q = new URLSearchParams({ k: o.kind === 'lab' ? 'lab' : 'html' });
  const s = o.kind === 'lab' ? [] : sounds(root);
  if (s.length) q.set('s', JSON.stringify(s));
  return `<script src="/${PAGE}?${q}"></script>`;
}
const isPage = (pathname) => pathname === `/${PAGE}`;
const pageFile = () => path.join(appDir, 'tools', 'gameaudio-page.js');
function init(o = {}) { if (o.dataDir && o.dataDir !== dataDir) { dataDir = o.dataDir; mem = null; bad = false; } if (o.appDir) appDir = o.appDir; }

module.exports = { init, pageTag, isPage, pageFile, served, sounds, SOUND };
