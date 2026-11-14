// A game's saves (round 180, gamekit), main side: what a game's `save` writes, kept by Hearth on this computer.
// One folder per game under <data>/game-saves/<game>/ : slots/<slot>.json (one file per slot) and settings.json (small
// values not tied to a slot). Written whole (temp + rename), so a cut-short write never leaves half a save. Deleting
// (one slot, or all of a game's) moves to the system Trash, never unlinks.
// A game = a Lab scene (its id) or an HTML game (its path, hashed). The game window never names the game itself:
// gamemodemain.js passes the one playing; the Lab passes the scene open in it.
//   op(dataDir, game, req, deps) → { ok, … } | { ok: false, why }
//   req.op: 'write' { slot, data } · 'read' { slot } · 'list' · 'remove' { slot } · 'reset' · 'get' { key } ·
//           'set' { key, value } · 'dir'
// No Electron needed except to trash (deps.trash, given by gamemodemain.js): dev/gamesaves-test.js runs it in Node.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const P = fs.promises;
const MAX = 4 * 1024 * 1024; // a slot, as JSON text
const MAX_SLOTS = 200;
const SLOT = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;
const KEY = /^[\w .:-]{1,80}$/;

const gameKey = (source) => {
  if (!source) return '';
  if (typeof source === 'string') return source.replace(/[^\w-]+/g, '_').slice(0, 60);
  if (source.kind === 'html') return `html-${crypto.createHash('sha1').update(path.resolve(String(source.path || ''))).digest('hex').slice(0, 14)}`;
  return String(source.id || '').replace(/[^\w-]+/g, '_').slice(0, 60);
};
const dirOf = (dataDir, game) => path.join(dataDir, 'game-saves', gameKey(game));
const no = (why) => ({ ok: false, why });
async function whole(file, text) {
  await P.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.part`;
  await P.writeFile(tmp, text);
  await P.rename(tmp, file);
}
const readJson = async (file) => { try { return JSON.parse(await P.readFile(file, 'utf8')); } catch { return null; } };

async function list(dir) {
  let names = [];
  try { names = await P.readdir(path.join(dir, 'slots')); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const f = path.join(dir, 'slots', n);
    try { const st = await P.stat(f); const j = await readJson(f); out.push({ slot: j?.slot || n.slice(0, -5), at: Number(j?.at) || Math.round(st.mtimeMs), bytes: st.size, ...(j?.note ? { note: String(j.note).slice(0, 120) } : {}) }); } catch { /* gone meanwhile */ }
  }
  return out.sort((a, b) => b.at - a.at);
}

// settings are written one after another (two set() calls at once would each read the old file)
let chain = Promise.resolve();
const inTurn = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

async function op(dataDir, game, req = {}, deps = {}) {
  const key = gameKey(game);
  if (!key) return no('no game');
  const dir = dirOf(dataDir, game);
  const o = String(req.op || 'list');
  const slotFile = (slot) => path.join(dir, 'slots', `${slot}.json`);
  if (o === 'dir') return { ok: true, dir };
  if (o === 'list') return { ok: true, slots: await list(dir) };
  if (o === 'write' || o === 'read' || o === 'remove') {
    const slot = String(req.slot ?? '').trim();
    if (!SLOT.test(slot)) return no('a slot\'s name is 1 to 40 letters, digits, spaces, - or _');
    const file = slotFile(slot);
    if (o === 'read') { const j = await readJson(file); return j ? { ok: true, data: j.data ?? null, at: j.at || null } : { ok: true, data: null, at: null }; }
    if (o === 'remove') {
      try { await P.access(file); } catch { return { ok: true, removed: false }; }
      if (!deps.trash) return no('nothing here can move a save to the Trash');
      try { await deps.trash(file); } catch (err) { return no(`the Trash refused it (${err.message})`); }
      return { ok: true, removed: true };
    }
    let text;
    try { text = JSON.stringify({ v: 1, slot, at: Date.now(), ...(req.note ? { note: String(req.note).slice(0, 120) } : {}), data: req.data ?? null }); } catch (err) { return no(`this save can't be written as data (${err.message})`); }
    if (text.length > MAX) return no(`this save is too big (${Math.round(text.length / 1024)} KB; a slot holds ${MAX / 1024 / 1024} MB)`);
    let there = false; try { await P.access(file); there = true; } catch { /* a new slot */ }
    if (!there && (await list(dir)).length >= MAX_SLOTS) return no(`this game already has ${MAX_SLOTS} saves`);
    await whole(file, text);
    return { ok: true, slot, bytes: text.length };
  }
  if (o === 'reset') {
    try { await P.access(dir); } catch { return { ok: true, removed: false }; }
    if (!deps.trash) return no('nothing here can move saves to the Trash');
    try { await deps.trash(dir); } catch (err) { return no(`the Trash refused it (${err.message})`); }
    return { ok: true, removed: true };
  }
  if (o === 'get' || o === 'set') {
    const k = String(req.key ?? '');
    if (!KEY.test(k)) return no('a setting\'s name is 1 to 80 letters, digits, spaces or . : - _');
    const file = path.join(dir, 'settings.json');
    if (o === 'get') { const all = (await readJson(file)) || {}; return { ok: true, value: Object.prototype.hasOwnProperty.call(all, k) ? all[k] : null, has: Object.prototype.hasOwnProperty.call(all, k) }; }
    return inTurn(async () => {
      const all = (await readJson(file)) || {};
      if (req.value === undefined || req.value === null) delete all[k]; else all[k] = req.value;
      let text; try { text = JSON.stringify(all); } catch (err) { return no(`this setting can't be written as data (${err.message})`); }
      if (text.length > MAX) return no('this game\'s settings are too big');
      await whole(file, text);
      return { ok: true };
    });
  }
  return no(`unknown: ${o}`);
}

module.exports = { op, gameKey, dirOf, SLOT, MAX };
