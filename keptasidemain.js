// (round 94, keptaside94) The compare view's main side (keptaside.js in the window): what sync's own calls don't do.
// Required by syncmain.js, which hands it its IPC helper and the engine. Every copy goes into this computer's Deleted
// files (data/sync/trash/<day>/<the thing's own path>, where the engine keeps the versions a choice replaces, so the
// sync panel's Deleted files lists them and Restore brings them back). Nothing here deletes a file outright, and
// nothing goes anywhere but this computer's own folders (the sync engine uploads, as for any change).
//   sync:keepCopy (rel)          this computer's version, as it is now, into Deleted files → { ok, id } (before a
//                                "Combine" replaces it: the Undo brings it back)
//   sync:keepTheirs (conflictId) a conflict's other version into Deleted files under its real name → { ok, id } (before
//                                "Keep both" / "Merge": where both changed one value, one side wins and the other was
//                                only in a hidden folder)
//   sync:putAway (rel)           a copy "Keep both" made ("x (from Mac).png"), moved into Deleted files (an Undo)
//   sync:chatDiff ({ src, id })  a very long chat's differing messages, worked out on the store thread
//                                (src: 'conflict' | 'aside')
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const S = require('./sync-merge');

const fsp = fs.promises;
const day = (t) => new Date(t).toISOString().slice(0, 10);
const rand = () => crypto.randomBytes(4).toString('hex');
// a data-folder path sync handles (never settings' own place, nothing outside the folder, nothing kept per computer)
const okRel = (rel) => typeof rel === 'string' && rel.length > 0 && rel.length < 400 && !rel.split('/').some((p) => !p || p === '.' || p === '..' || /[:\\]/.test(p)) && !/^(app|sync)\//.test(rel) && !S.localOnly(rel);
const exists = (f) => fsp.stat(f).then((s) => s, () => null);

function register(h, { engine, dataDir, store, schedule }) {
  const off = () => ({ ok: false, error: 'Sync is off' });
  const hereTrash = () => path.join(engine().stateDir, 'trash');
  // a file copied into this computer's Deleted files under rel → its id ("here:<day>/<rel>")
  async function keep(src, rel) {
    const d = day(Date.now()); const parts = rel.split('/');
    const dir = path.join(hereTrash(), d, ...parts.slice(0, -1));
    await fsp.mkdir(dir, { recursive: true });
    let name = parts[parts.length - 1];
    if (await exists(path.join(dir, name))) name = `${rand()}-${name}`;
    const dst = path.join(dir, name); const tmp = `${dst}.${rand()}.tmp`;
    await fsp.copyFile(src, tmp); await fsp.rename(tmp, dst);
    return `here:${d}/${[...parts.slice(0, -1), name].join('/')}`;
  }
  const localOf = (rel) => path.join(dataDir(), ...rel.split('/'));
  h('sync:keepCopy', async (rel) => {
    if (!engine()) return off();
    if (!okRel(rel)) return { ok: false, error: 'Not something sync keeps' };
    const f = localOf(rel);
    if (!(await exists(f))) return { ok: true, id: null }; // (nothing here to keep)
    try { return { ok: true, id: await keep(f, rel) }; } catch (err) { return { ok: false, error: err.message }; }
  });
  h('sync:keepTheirs', async (id) => {
    if (!engine()) return off();
    const p = await engine().preview(String(id || '')).catch(() => null);
    if (!p?.there || !okRel(p.rel)) return { ok: false, error: 'That conflict is already settled' };
    try { return { ok: true, id: await keep(p.there, p.rel) }; } catch (err) { return { ok: false, error: err.message }; }
  });
  // only a copy Keep both made: "… (from Mac).png", a chat is put away through the chats' own Trash (the window)
  h('sync:putAway', async (rel) => {
    if (!engine()) return off();
    if (!okRel(rel) || !/ \(from [^/()]+\)(\.[^/.]+)?$/.test(rel) || /^chats\//.test(rel)) return { ok: false, error: 'Only a copy “Keep both” made can be put away here' };
    const f = localOf(rel);
    if (!(await exists(f))) return { ok: true, id: null };
    try { const kept = await keep(f, rel); await fsp.rm(f, { force: true }); schedule?.(500, 'put-away'); return { ok: true, id: kept }; } catch (err) { return { ok: false, error: err.message }; }
  });
  // a very long chat: the two files, compared on the store thread
  h('sync:chatDiff', async (o = {}) => {
    if (!engine()) return off();
    const id = String(o.id || '');
    let a = null; let b = null;
    if (o.src === 'conflict') { const p = await engine().preview(id).catch(() => null); a = p?.here; b = p?.there; if (!/^chats\//.test(p?.rel || '')) a = null; } else if (o.src === 'aside') { const n = await engine().aside(id, 'compare').catch(() => null); a = n?.here; b = n?.there; if (!/^chats\//.test(n?.rel || '')) a = null; }
    if (!a || !b) return { ok: false, error: 'Those two versions aren\'t there any more' };
    if (!store?.runOff) return { ok: false, error: 'The compare isn\'t available here' };
    const r = await store.runOff('chatDiff', { a, b, max: Number(o.max) || 40 }).catch((err) => ({ error: err.message }));
    return r?.error ? { ok: false, error: `One version can't be read right now (${r.error})`, side: r.side } : { ok: true, ...r };
  });
}

module.exports = { register, okRel };
