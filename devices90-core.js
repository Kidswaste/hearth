// (round 90, devices90) The computers Hearth knows, "Forget this computer…", and the space very long chats' pieces take.
// Pure (fs.promises handed in): the main side (syncmain.js: sync:devices / sync:forget / sync:packSpace / sync:packFree)
// and dev/devices90-test.js use it. The window's part is devices90.js (lazy group 'devices90', Settings › This computer
// & sync). docs/upgrades/devices90.md has the why.
//
//   list(fsp, o)        every machine record in <cloud>/Hearth/.sync/machines: name, platform, last seen, Hearth version,
//                       whether it reads pieces (packs), this computer marked; a record that can't be read is listed as
//                       such (never left out: it shuts the packs gate); + the forgotten ones (and whether they came back)
//   forget(fsp, o)      a computer not seen for STALE_MS: its record MOVED (never deleted) to .sync/forgotten/, with a
//                       small note (who, when). Never this computer, never one seen lately, never a record that can't be
//                       read right now unless it has been untouched for STALE_MS. Re-read just before the move.
//   rejoin(fsp, o)      the engine's hook at the start of each pass (o.devices): this computer's own record missing AND
//                       a forgotten copy of it in .sync/forgotten → it was forgotten and is back: its record is written
//                       at once (before anything moves), so the other computers' packs gate shuts again at once if it
//                       doesn't read pieces. Its sync itself is a returning computer's: its own base, three-way merges.
//   space(fsp, o)       bytes: the pieces in the cloud folder (Hearth/packs), this computer's copies kept for merges
//                       (data/sync/packbase), the pack trash (data/sync/packtrash) and how much of it is older than 7 days
//   freeUp(fsp, o)      the pack trash's pieces older than 7 days → this computer's Trash (o.trashItem), one chat folder
//                       at a time. A piece any manifest still names is never moved; if ANY manifest (cloud folder,
//                       packbase, the pack trash) can't be read, nothing is moved at all. No automatic cap: only a click.
// Nothing here deletes anything for good (moves only), uploads anything, or reads a secret.
'use strict';
const path = require('path');

const DAY = 864e5;
const STALE_MS = 7 * DAY; // "not seen for a while": a computer that hasn't synced for a week may be forgotten
const FREE_DAYS = 7; // Free up: kept-aside pieces older than this
const isDay = (d) => /^\d{4}-\d\d-\d\d$/.test(d);
const dayStart = (d) => Date.parse(`${d}T00:00:00Z`);
const stampOf = (t) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const safeFile = (f) => typeof f === 'string' && /^[^\\/]+\.json$/.test(f) && !f.startsWith('.') && f !== '..';
const M = (cloudDir) => path.join(cloudDir, '.sync', 'machines');
const F = (cloudDir) => path.join(cloudDir, '.sync', 'forgotten');
const parse = (text) => JSON.parse(String(text).replace(/^﻿/, ''));

async function readdir(fsp, dir) {
  try { return { names: await fsp.readdir(dir) }; } catch (err) { return err.code === 'ENOENT' ? { names: [] } : { error: err.code || 'unreadable' }; }
}

// ---------- the list ----------
// o: { cloudDir, myId, now } → { computers: [...], forgotten: [...], error? }
async function list(fsp, o) {
  const now = o.now ?? Date.now();
  const out = { computers: [], forgotten: [], staleDays: STALE_MS / DAY };
  const r = await readdir(fsp, M(o.cloudDir));
  if (r.error) return { ...out, error: r.error }; // (a folder that can't be read: nothing is listed as "none")
  for (const f of r.names.sort()) {
    if (!safeFile(f)) continue;
    const file = path.join(M(o.cloudDir), f);
    let j = null; let why = '';
    try { j = parse(await fsp.readFile(file, 'utf8')); } catch (err) { why = err.code || 'garbled'; }
    if (j && (typeof j !== 'object' || f !== `${j.id}.json`)) continue; // (a cloud client's conflict copy is not a computer)
    if (!j) {
      let at = 0; try { at = (await fsp.stat(file)).mtimeMs; } catch { /* gone */ }
      if (f === `${o.myId}.json`) continue;
      out.computers.push({ file: f, unreadable: why, lastSeen: at || null, me: false, stale: Boolean(at) && now - at >= STALE_MS, canForget: Boolean(at) && now - at >= STALE_MS, packs: false });
      continue;
    }
    const me = j.id === o.myId;
    const seen = Number(j.lastSeen) || 0;
    const stale = !me && (!seen || now - seen >= STALE_MS);
    out.computers.push({ file: f, id: j.id, name: String(j.name || j.id), platform: String(j.platform || ''), lastSeen: seen || null, app: j.app ? String(j.app) : '', format: Number(j.format) || 0, packs: Number(j.packs) >= 1, me, stale, canForget: stale });
  }
  out.computers.sort((a, b) => (b.me - a.me) || ((b.lastSeen || 0) - (a.lastSeen || 0)));
  out.forgotten = await forgottenList(fsp, o, out.computers);
  return out;
}
async function forgottenList(fsp, o, computers) {
  const r = await readdir(fsp, F(o.cloudDir));
  if (r.error) return [];
  const out = [];
  for (const f of r.names.sort()) {
    const x = /^(\d{8}T\d{6}Z)-(.+\.json)$/.exec(f);
    if (!x || f.endsWith('.note.json')) continue;
    let note = {}; try { note = parse(await fsp.readFile(path.join(F(o.cloudDir), `${f.slice(0, -5)}.note.json`), 'utf8')); } catch { /* the move is what counts */ }
    let rec = null; try { rec = parse(await fsp.readFile(path.join(F(o.cloudDir), f), 'utf8')); } catch { /* listed by its file name */ }
    const at = Number(note.at) || Date.parse(x[1].replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/, '$1-$2-$3T$4:$5:$6Z')) || 0;
    const id = rec?.id || note.id || x[2].slice(0, -5);
    const now = computers.find((c) => c.id && c.id === id);
    out.push({ file: f, id, name: String(rec?.name || note.name || id), platform: String(rec?.platform || ''), at, by: String(note.by || ''), back: Boolean(now && (now.lastSeen || 0) > at), backAt: now && (now.lastSeen || 0) > at ? now.lastSeen : null });
  }
  return out.sort((a, b) => b.at - a.at);
}

// ---------- forget ----------
// o: { cloudDir, myId, file (the record's file name, from list), now, by (this computer's name) } → { ok, to } | { ok: false, why }
async function forget(fsp, o) {
  const now = o.now ?? Date.now();
  if (!safeFile(o.file)) return { ok: false, why: 'unknown' };
  if (o.file === `${o.myId}.json`) return { ok: false, why: 'this-computer' };
  const from = path.join(M(o.cloudDir), o.file);
  let text;
  try { text = await fsp.readFile(from, 'utf8'); } catch (err) { return { ok: false, why: err.code === 'ENOENT' ? 'gone' : 'unreadable' }; } // (held / a placeholder: never "nothing there")
  let j = null; try { j = parse(text); } catch { /* a garbled record */ }
  if (j) {
    if (typeof j !== 'object' || o.file !== `${j.id}.json`) return { ok: false, why: 'unknown' };
    if (j.id === o.myId) return { ok: false, why: 'this-computer' };
    if (now - (Number(j.lastSeen) || 0) < STALE_MS) return { ok: false, why: 'recent' };
  } else {
    let at = 0; try { at = (await fsp.stat(from)).mtimeMs; } catch { return { ok: false, why: 'gone' }; }
    if (now - at < STALE_MS) return { ok: false, why: 'being-written' }; // (a record half written right now: never forgotten)
  }
  const stamp = stampOf(now);
  const toName = `${stamp}-${o.file}`;
  const to = path.join(F(o.cloudDir), toName);
  await fsp.mkdir(F(o.cloudDir), { recursive: true });
  try { await fsp.stat(to); return { ok: false, why: 'busy' }; } catch { /* free */ }
  // re-read just before the move: a computer that wrote its record meanwhile is not forgotten
  let again; try { again = await fsp.readFile(from, 'utf8'); } catch { return { ok: false, why: 'gone' }; }
  if (again !== text) return { ok: false, why: 'recent' };
  await fsp.rename(from, to); // (a move inside the cloud folder: the same bytes, kept)
  try { await fsp.writeFile(path.join(F(o.cloudDir), `${toName.slice(0, -5)}.note.json`), JSON.stringify({ id: j?.id || o.file.slice(0, -5), name: j?.name || '', at: now, by: o.by || '' })); } catch { /* the move is what counts */ }
  return { ok: true, to: path.join('.sync', 'forgotten', toName), name: j?.name || o.file.slice(0, -5) };
}

// ---------- the forgotten computer comes back ----------
// o: { cloudDir, id, writeMachine } → { back } (its record was written at once) | {}
async function rejoin(fsp, o) {
  try { await fsp.stat(path.join(M(o.cloudDir), `${o.id}.json`)); return {}; } catch (err) { if (err.code !== 'ENOENT') return {}; }
  const r = await readdir(fsp, F(o.cloudDir));
  if (r.error || !r.names.some((f) => f.endsWith(`-${o.id}.json`) && /^\d{8}T\d{6}Z-/.test(f))) return {};
  await o.writeMachine();
  return { back: true };
}
// the engine's o.devices (sync-engine.js, round 90): only rejoin, at the start of each pass
function hook(fsp, cloudDir, log = () => {}) {
  return { beforePass: async ({ id, writeMachine }) => { const r = await rejoin(fsp, { cloudDir, id, writeMachine }); if (r.back) log('devices: this computer was forgotten and is back: its record is written again'); return r; } };
}

// ---------- space ----------
async function walk(fsp, dir, fn, rel = '') {
  let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch (err) { if (err.code === 'ENOENT') return; throw err; }
  for (const e of ents) {
    if (e.isSymbolicLink()) continue;
    const p = path.join(dir, e.name); const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(fsp, p, fn, r);
    else if (e.isFile()) { let st = null; try { st = await fsp.stat(p); } catch { /* gone */ } if (st) await fn(p, r, st); }
  }
}
const D = (o) => ({ packs: path.join(o.cloudDir, 'packs'), base: path.join(o.stateDir, 'packbase'), trash: path.join(o.stateDir, 'packtrash') });
// o: { cloudDir, stateDir, now, days } → { cloud: { bytes, files }, base: {…}, trash: { bytes, files, old, oldFiles }, error? }
async function space(fsp, o) {
  const now = o.now ?? Date.now(); const days = o.days ?? FREE_DAYS; const d = D(o);
  const out = { cloud: { bytes: 0, files: 0 }, base: { bytes: 0, files: 0 }, trash: { bytes: 0, files: 0, old: 0, oldFiles: 0 }, days };
  try {
    await walk(fsp, d.packs, (_p, _r, st) => { out.cloud.bytes += st.size; out.cloud.files += 1; });
    await walk(fsp, d.base, (_p, _r, st) => { out.base.bytes += st.size; out.base.files += 1; });
    await walk(fsp, d.trash, (_p, r, st) => {
      out.trash.bytes += st.size; out.trash.files += 1;
      const day = r.split('/')[1];
      if (isDay(day) && dayStart(day) < now - days * DAY) { out.trash.old += st.size; out.trash.oldFiles += 1; }
    });
  } catch (err) { out.error = err.code || 'unreadable'; }
  return out;
}

// ---------- free up ----------
// every manifest Hearth keeps (cloud folder, packbase, the pack trash): the pieces they name → Set of "<sha1>.seg";
// → { names } | { held: why, file } (one that can't be read, or is only a cloud placeholder: it may name anything)
async function namedPieces(fsp, o) {
  const P = require('./chatpack-core');
  const d = D(o); const names = new Set();
  // (a manifest in the pack trash that is itself older than the free-up's line goes too: it still has to read, but the
  // pieces it names are not kept for it)
  const cut = (o.now ?? Date.now()) - (o.days ?? FREE_DAYS) * DAY;
  const look = async (root, inTrash) => {
    let held = null;
    try {
      await walk(fsp, root, async (p, r) => {
        if (held) return;
        const b = path.basename(p);
        if (/^\.?m-.+\.json\.icloud$/.test(b) || /^\.m-.+\.icloud$/.test(b)) { held = { held: 'placeholder', file: r }; return; }
        if (!/^m-.+\.json$/.test(b)) return;
        let m;
        try { m = P.parseManifest(await fsp.readFile(p, 'utf8')); } catch (err) { held = { held: err.code === 'manifest-newer' ? 'newer' : 'manifest', file: r }; return; }
        const day = r.split('/')[1];
        if (inTrash && isDay(day) && dayStart(day) < cut) return;
        for (const s of m.segs) names.add(`${s.h}.seg`);
      });
    } catch (err) { return { held: 'folder', file: root, code: err.code }; }
    return held;
  };
  for (const root of [d.packs, d.base, d.trash]) { const h = await look(root, root === d.trash); if (h) return h; }
  return { names };
}
// o: { cloudDir, stateDir, now, days, trashItem (async path → this computer's Trash; throws when it can't), dry }
// → { ok, moved, bytes, kept, failed } | { ok: false, held, file }
async function freeUp(fsp, o) {
  const now = o.now ?? Date.now(); const days = o.days ?? FREE_DAYS; const d = D(o);
  const named = await namedPieces(fsp, o);
  if (named.held) return { ok: false, held: named.held, file: named.file, moved: 0, bytes: 0 };
  const out = { ok: true, moved: 0, bytes: 0, kept: 0, failed: [], items: [] };
  // the pack trash: <kind>/<day>/<chat>/<files>; only days older than `days`
  const kinds = await readdir(fsp, d.trash);
  if (kinds.error) return { ok: false, held: 'folder', file: d.trash, moved: 0, bytes: 0 };
  for (const kind of kinds.names) {
    const kd = path.join(d.trash, kind);
    const ds = await readdir(fsp, kd);
    if (ds.error) { out.failed.push({ path: kd, why: ds.error }); continue; }
    for (const day of ds.names) {
      if (!isDay(day) || !(dayStart(day) < now - days * DAY)) continue;
      const dd = path.join(kd, day);
      const chats = await readdir(fsp, dd);
      if (chats.error) { out.failed.push({ path: dd, why: chats.error }); continue; }
      for (const c of chats.names) {
        const cd = path.join(dd, c);
        let st; try { st = await fsp.stat(cd); } catch { continue; }
        if (!st.isDirectory()) continue;
        const files = []; let all = true;
        try {
          await walk(fsp, cd, (p, r, s) => {
            if (named.names.has(path.basename(p))) { all = false; out.kept += 1; return; } // (a piece a manifest still names: never)
            files.push({ p, bytes: s.size });
          });
        } catch (err) { out.failed.push({ path: cd, why: err.code || 'unreadable' }); continue; }
        if (!files.length) continue;
        const items = all ? [{ p: cd, bytes: files.reduce((a, f) => a + f.bytes, 0), n: files.length }] : files.map((f) => ({ ...f, n: 1 }));
        for (const it of items) {
          if (o.dry) { out.moved += it.n; out.bytes += it.bytes; continue; }
          try { await o.trashItem(it.p); out.moved += it.n; out.bytes += it.bytes; out.items.push(path.relative(d.trash, it.p)); } catch (err) { out.failed.push({ path: it.p, why: String(err?.message || err) }); }
        }
      }
      if (!o.dry) { try { await fsp.rmdir(dd); } catch { /* not empty: what stays, stays */ } }
    }
  }
  return out;
}

// ---------- words ----------
function fmt(b) {
  if (!(b > 0)) return '0 MB';
  if (b >= 1e9) return `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB`;
  if (b >= 1e6) return `${Math.round(b / 1e6)} MB`;
  return `${Math.max(1, Math.round(b / 1e3))} KB`;
}
function ago(t, now = Date.now()) {
  if (!t) return 'never';
  const s = Math.max(0, now - t) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 36 * 3600) return `${Math.round(s / 3600)} hours ago`;
  const dd = Math.round(s / 86400);
  return dd < 60 ? `${dd} day${dd === 1 ? '' : 's'} ago` : `${Math.round(dd / 30)} months ago`;
}
const platformWord = (p) => (p === 'darwin' ? 'Mac' : p === 'win32' ? 'Windows' : p === 'linux' ? 'Linux' : p ? p : 'unknown system');
const WHY = {
  'this-computer': 'This is the computer you are on: it can\'t be forgotten.',
  recent: 'That computer synced lately, so it isn\'t forgotten. If it is really gone, try again after a week without it.',
  'being-written': 'Its record is being written right now: try again later.',
  unreadable: 'Its record can\'t be read right now (your cloud drive may still be bringing it down): nothing was changed.',
  gone: 'It is already gone from the list.',
  unknown: 'That isn\'t a computer Hearth knows.',
  busy: 'Try again in a moment.',
};
const HELD = {
  manifest: 'One of the pieces\' lists can\'t be read right now, so nothing was removed (a list may still name any piece).',
  newer: 'A newer Hearth wrote some pieces\' lists, so nothing was removed. Update Hearth here first.',
  placeholder: 'Some pieces\' lists are still only in the cloud (not downloaded yet), so nothing was removed.',
  folder: 'A pieces folder can\'t be read right now, so nothing was removed.',
};

module.exports = { STALE_MS, FREE_DAYS, list, forget, rejoin, hook, space, freeUp, namedPieces, fmt, ago, platformWord, WHY, HELD, stampOf };
