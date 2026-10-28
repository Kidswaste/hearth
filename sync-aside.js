// (round 78, guardloss78) Kept aside: when sync settles a real conflict by picking a side on its own (the write guard
// after an arrival: this computer's version wins; a conflict settled by itself: the newer one wins), the side that lost
// is kept in Deleted files under its real name, and a plain note says so in the sync panel ("Mac's version of Notes
// kept aside — compare"), with Compare, Keep both, Use that one and OK. Before, the guard's loser was kept nowhere.
// Notes live in data/sync/aside.json (this computer only, like its Deleted files); 30 days, at most 40. Used by
// sync-engine.js (main process); nothing here touches the window or the cloud copy.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DS = require('./datasafe-core'); // a notes file that can't be read is never "no notes" (and never saved over)

const DAYS = 30; const MAX = 40;
const day = (t) => new Date(t).toISOString().slice(0, 10);
const rand = () => crypto.randomBytes(4).toString('hex');

function createAside({ stateDir, now = () => Date.now(), log = () => {} }) {
  const FILE = path.join(stateDir, 'aside.json');
  let list = null; let canSave = true;
  const seen = new Map(); // rel → hash of the losing text already kept (the guard runs on every save until the ack)
  function load() {
    if (list) return list;
    const r = DS.load(fs, FILE, []);
    list = Array.isArray(r.value) ? r.value : []; canSave = r.canSave;
    const cut = now() - DAYS * 864e5;
    list = list.filter((n) => n && n.id && n.at > cut).slice(0, MAX);
    return list;
  }
  function save() {
    if (!canSave) { // read again first: a held / unreadable file is merged with, never written over
      const r = DS.load(fs, FILE, []);
      if (!r.canSave) return;
      const have = new Set(list.map((n) => n.id));
      list = [...list, ...(Array.isArray(r.value) ? r.value : []).filter((n) => n?.id && !have.has(n.id))].sort((a, b) => b.at - a.at); canSave = true;
    }
    try {
      fs.mkdirSync(stateDir, { recursive: true });
      const tmp = `${FILE}.${rand()}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(list.slice(0, MAX), null, 2)); fs.renameSync(tmp, FILE);
    } catch (err) { log('aside save', err.message); }
  }
  function add(note) {
    load();
    const n = { id: `${day(now())}-${rand()}`, at: now(), ...note };
    list.unshift(n);
    if (list.length > MAX) list.length = MAX;
    save();
    return n;
  }
  // the losing text written into this computer's Deleted files (data/sync/trash/<day>/<rel>), synchronously (the write
  // guard runs inside a save); → the note, or null (the same text was already kept, or it couldn't be written: logged)
  function keepText(rel, text, info = {}) {
    const h = crypto.createHash('sha1').update(String(text)).digest('hex');
    if (seen.get(rel) === h) return null;
    try {
      const d = day(now());
      const parts = rel.split(/[\\/]/); // (sync's rels use /)
      const dir = path.join(stateDir, 'trash', d, ...parts.slice(0, -1));
      fs.mkdirSync(dir, { recursive: true });
      let name = parts.pop();
      if (fs.existsSync(path.join(dir, name))) name = `${rand()}-${name}`;
      const f = path.join(dir, name);
      const tmp = `${f}.${rand()}.tmp`;
      fs.writeFileSync(tmp, text); fs.renameSync(tmp, f);
      seen.set(rel, h);
      if (seen.size > 200) seen.delete(seen.keys().next().value);
      const trashRel = [...parts, name].join('/');
      return add({ rel, trash: `here:${d}/${trashRel}`, ...info });
    } catch (err) { log('aside keep', rel, err.message); return null; }
  }
  // a guard's own later merges: what it wrote is on the disk, so the next save's "other side" is this computer's
  const wrote = (rel, h) => { if (h) seen.set(`out:${rel}`, h); };
  const wroteIs = (rel, h) => seen.get(`out:${rel}`) === h;
  const get = (id) => load().find((n) => n.id === id) || null;
  function drop(id) { load(); const i = list.findIndex((n) => n.id === id); if (i < 0) return false; list.splice(i, 1); save(); return true; }
  // what the status carries (the panel's list): the newest few, without file paths
  const brief = () => load().slice(0, 8).map(({ id, at, rel, trash, why, side, from, fromPlatform, fields, kind }) => ({ id, at, rel, trash, why, side, from, fromPlatform, kind, fields: (fields || []).slice(0, 3) }));
  return { keepText, add, get, drop, list: () => load().slice(), brief, wrote, wroteIs, count: () => load().length };
}

module.exports = { createAside };
