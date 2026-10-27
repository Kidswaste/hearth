// (round 75, syncstate75) Cloud sync's own state (data/sync/state/), kept in pieces. Pure Node (no Electron): used by
// sync-engine.js, tested by dev/syncstate75-test.js.
//
// Until round 74 the state was ONE file, data/sync/state.json: every synced file's base hash and stat caches. At 50,000
// files that is ~14 MB, and every pass that changed anything turned all of it into text on the main process
// (≈ 120–180 ms in one piece) and wrote all of it. Now:
//   data/sync/state/index.json            the small part (cloud folder, clocks, renders outside the data folder…) and
//                                         which piece file holds each bucket: { v: 2, gen, small, parts: { "17": name } }
//   data/sync/state/p-<bucket>-<gen>-<rand>.json   one bucket of files: { v: 2, b, rows: { rel: { b, l, c, p, k, f } } }
// Every file name (rel) falls in one of 256 buckets by a hash of its name; ALL that is known about one file (base hash,
// local stat cache, cloud stat cache, previous base, keep-all mark, freed mark) is in the same bucket. The engine's maps
// (state.base / local / cloud / prev / keepAll / freed) are watched (a Proxy on set / delete only: reads are untouched),
// so a save turns into text only the buckets that changed: one chat changed = one ~55 KB bucket + the index.
//
// Crash safety (a crash or power cut at any moment of a save leaves the state of the save before, or the new one, never
// a mix and never a damaged file): the changed buckets are written to NEW files (never over a file the index names),
// each flushed to the disk; then the index is written to a temp file, flushed and renamed over index.json (the one
// atomic step); only then are the replaced bucket files removed. Files no index names (a save cut short) are removed at
// the next start. dev/syncstate75-test.js crashes a save at every one of its disk calls and checks this.
//
// Several engines on one folder (sync switched off and on, a restart while a pass ends): every load and save of a folder
// runs one at a time (a lock per folder in this process), and a save builds on the index on the disk, not on what it
// read at start, so it never removes a file another save's index names.
//
// The old single file is read once (migration), written in pieces, then renamed state.json.prev (kept). If a Hearth
// from before this round ran meanwhile (an update undone) its newer state.json is taken again the same way.
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const MAPS = ['base', 'local', 'cloud', 'prev', 'keepAll', 'freed'];
const KEYS = { base: 'b', local: 'l', cloud: 'c', prev: 'p', keepAll: 'k', freed: 'f' };
const NB = 256;
const BUSY = new Set(['EBUSY', 'EPERM', 'EACCES', 'EAGAIN', 'EMFILE', 'ENFILE', 'UNKNOWN', 'ETIMEDOUT', 'ECANCELED']);
const HELD = 'held';
// FNV-1a: the same bucket for a name on every run and every computer
function bucketOf(rel) { let h = 0x811c9dc5; for (let i = 0; i < rel.length; i++) { h ^= rel.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0) & (NB - 1); }
const sameVal = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]));
const hex = (i) => i.toString(16).padStart(2, '0');
const rand = () => crypto.randomBytes(3).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// one save / load of a folder at a time, in this process
const locks = new Map();
async function withLock(dir, fn) {
  const prev = locks.get(dir) || Promise.resolve();
  let release; const next = new Promise((r) => { release = r; }); locks.set(dir, next);
  await prev;
  try { return await fn(); } finally { release(); if (locks.get(dir) === next) locks.delete(dir); }
}
// → { state: 'ok', value, mtimeMs } | { state: 'missing' } | { state: 'held', code } | { state: 'bad' }
async function readJson(file, tries = 5) {
  for (let i = 0; ; i++) {
    let text;
    try { text = await fsp.readFile(file, 'utf8'); } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return { state: 'missing' };
      if (i < tries - 1 && BUSY.has(err.code)) { await sleep(30 * (i + 1)); continue; }
      return BUSY.has(err.code) || err.code === 'EIO' ? { state: HELD, code: err.code } : { state: 'bad', code: err.code };
    }
    try { return { state: 'ok', value: JSON.parse(text.replace(/^﻿/, '')) }; } catch { return { state: 'bad' }; }
  }
}
// a whole file on the disk before anyone names it (open, write, flush, close); nothing half left behind on failure
async function writeFlushed(file, text) {
  let fh = null;
  try {
    fh = await fsp.open(file, 'w');
    await fh.writeFile(text);
    try { await fh.sync(); } catch { /* a disk that can't: as before */ }
    await fh.close(); fh = null;
  } catch (err) {
    if (fh) await fh.close().catch(() => {});
    await fsp.rm(file, { force: true }).catch(() => {});
    throw err;
  }
}
async function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try { return await fsp.rename(from, to); } catch (err) {
      if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      await sleep(120 * (i + 1));
    }
  }
}

// o: { dir (data/sync), cloudRoot, log, breathe () → Promise | null, rename (from, to), fresh () → a new state, onError (err) }
function createStateStore(o) {
  const dir = path.join(o.dir, 'state');
  const key = path.resolve(dir);
  const indexFile = path.join(dir, 'index.json');
  const legacyFile = path.join(o.dir, 'state.json');
  const log = o.log || (() => {});
  const rename = o.rename || renameRetry;
  const breathe = o.breathe || (() => null);
  const fresh = o.fresh;
  // the watched maps: proxy → its plain object; which buckets changed; who is in each bucket (a superset: a name with
  // nothing left is dropped when its bucket is written)
  const target = new WeakMap();
  let members = Array.from({ length: NB }, () => new Set());
  const dirty = new Set(); let allDirty = true;
  let migrating = false; // the state came from the old single file: renamed .prev once it is saved in pieces
  let queued = null; let q = Promise.resolve();
  const st = { costMs: 0, saves: 0, written: 0, bytes: 0, lastMs: 0 };

  const mark = (k) => { if (typeof k !== 'string') return; const b = bucketOf(k); dirty.add(b); members[b].add(k); };
  const watch1 = (m) => {
    if (!m || typeof m !== 'object' || target.has(m)) return m;
    const px = new Proxy(m, {
      set(t, k, v) { if (!sameVal(t[k], v)) mark(k); t[k] = v; return true; },
      deleteProperty(t, k) { if (own(t, k)) { mark(k); delete t[k]; } return true; },
    });
    target.set(px, m); allDirty = true; return px;
  };
  // every map of this state watched (one replaced by the engine, or missing, is wrapped / made: all buckets rewritten)
  function watch(state) {
    if (!state) return;
    for (const k of MAPS) { if (!state[k] || typeof state[k] !== 'object') state[k] = {}; if (!target.has(state[k])) state[k] = watch1(state[k]); }
  }
  const plain = (m) => target.get(m) || m;
  const smallOf = (state) => { const s = {}; for (const [k, v] of Object.entries(state)) if (!MAPS.includes(k)) s[k] = v; return s; };
  const isDirty = () => allDirty || dirty.size > 0;

  // ---------- loading ----------
  // → { state, held?, fresh?, why? }: held = a file is there but can't be read now (Windows: held by another program):
  // nothing is saved over it until it reads (the engine waits); fresh = no state for this cloud folder (a new drive)
  async function load() {
    return withLock(key, async () => {
      const idx = await readJson(indexFile);
      if (idx.state === HELD) return { held: true, why: 'index' };
      let leg = null; try { leg = await fsp.stat(legacyFile); } catch { /* none */ }
      let idxAt = 0; if (idx.state === 'ok') { try { idxAt = (await fsp.stat(indexFile)).mtimeMs; } catch { /* gone meanwhile */ } }
      // the old single file: when there are no pieces yet, or a Hearth from before this round wrote it since
      if (leg && (idx.state !== 'ok' || leg.mtimeMs > idxAt)) {
        const r = await readJson(legacyFile);
        if (r.state === HELD) return { held: true, why: 'legacy' };
        const s = r.value;
        if (r.state === 'ok' && s && s.v === 1 && s.cloudRoot === o.cloudRoot) {
          reset(); migrating = true;
          for (const k of MAPS) if (!s[k] || typeof s[k] !== 'object') s[k] = {};
          watch(s); allDirty = true;
          log('state', 'moving the single state file into pieces');
          return { state: s, migrated: true };
        }
        if (idx.state !== 'ok') { reset(); migrating = r.state === 'ok' || r.state === 'bad'; const s2 = fresh(); watch(s2); return { state: s2, fresh: true, why: r.state === 'ok' ? 'other-drive' : 'legacy-bad' }; }
      }
      const ix = idx.value;
      if (idx.state !== 'ok' || !ix || ix.v !== 2 || !ix.small || ix.small.cloudRoot !== o.cloudRoot || !ix.parts || typeof ix.parts !== 'object') {
        reset(); const s = fresh(); watch(s);
        return { state: s, fresh: true, why: idx.state === 'missing' ? 'none' : idx.state === 'ok' ? 'other-drive' : 'index-bad' };
      }
      const maps = Object.fromEntries(MAPS.map((k) => [k, {}]));
      const mem = Array.from({ length: NB }, () => new Set());
      const lost = [];
      for (const [b, name] of Object.entries(ix.parts)) {
        const bi = Number(b);
        if (!(bi >= 0 && bi < NB) || typeof name !== 'string' || name.includes('/') || name.includes('\\')) continue;
        const r = await readJson(path.join(dir, name));
        if (r.state === HELD) return { held: true, why: name };
        const rows = r.state === 'ok' && r.value?.rows && typeof r.value.rows === 'object' ? r.value.rows : null;
        // a piece the index names that is gone or damaged (it never should be: flushed before the index names it): its
        // files are as if never synced (both sides kept, nothing deleted), and the bucket is written again
        if (!rows) { lost.push(name); continue; }
        for (const [rel, row] of Object.entries(rows)) {
          if (!row || typeof row !== 'object') continue;
          for (const k of MAPS) if (own(row, KEYS[k])) maps[k][rel] = row[KEYS[k]];
          mem[bi].add(rel);
        }
        const br = breathe(); if (br) await br;
      }
      reset();
      members = mem;
      const s = { ...ix.small, ...maps };
      watch(s); allDirty = false; // (wrapping marks everything: these are what is on the disk)
      for (const name of lost) { const bi = Number(Object.entries(ix.parts).find(([, n]) => n === name)?.[0]); if (bi >= 0) dirty.add(bi); }
      if (lost.length) log('state', `pieces missing or damaged: ${lost.join(', ')}`);
      // what a save cut short left (pieces no index names, temp files) goes; the old single file is kept as .prev
      await tidy(new Set(Object.values(ix.parts)));
      if (leg) await rename(legacyFile, `${legacyFile}.prev`).catch((err) => log('state', err.message));
      return { state: s, lost: lost.length };
    });
  }
  function reset() { members = Array.from({ length: NB }, () => new Set()); dirty.clear(); allDirty = true; migrating = false; }
  async function tidy(keep) {
    let names = []; try { names = await fsp.readdir(dir); } catch { return; }
    for (const n of names) if (n !== 'index.json' && !keep.has(n) && /^(p-[0-9a-f]{2}-\d+-[0-9a-f]+\.json|index\.json\.[0-9a-f]+\.tmp)$/.test(n)) await fsp.rm(path.join(dir, n), { force: true }).catch(() => {});
  }

  // ---------- saving ----------
  // asked by the engine (a pass's end, a checkpoint): one save at a time, in order; one waiting to start takes
  // everything changed until it starts (asks coalesce). → the promise of the queue (resolves when it is on the disk;
  // never rejects: a failed save leaves the last one whole, keeps its buckets marked and tries again next time)
  function save(state) {
    if (queued) { queued.state = state; return q; }
    const job = { state };
    queued = job;
    q = q.then(() => { if (queued === job) queued = null; return withLock(key, () => write(job.state)); }).catch((err) => { log('state', err.message); o.onError?.(err); });
    return q;
  }
  async function write(state) {
    const t0 = Date.now(); let main = 0; let s0 = performance.now();
    const pause = async () => { const b = breathe(); if (b) { main += performance.now() - s0; await b; s0 = performance.now(); } };
    watch(state);
    const full = allDirty;
    if (allDirty) { // every name again (a migration, a new drive, a map the engine replaced)
      allDirty = false;
      members = Array.from({ length: NB }, () => new Set());
      let n = 0;
      for (const k of MAPS) for (const rel of Object.keys(plain(state[k]))) { members[bucketOf(rel)].add(rel); if ((++n & 4095) === 0) await pause(); }
      for (let i = 0; i < NB; i++) dirty.add(i);
    }
    const take = [...dirty].sort((a, b) => a - b); dirty.clear();
    const m = MAPS.map((k) => [KEYS[k], plain(state[k])]);
    const texts = [];
    for (const b of take) {
      const rows = {}; let n = 0;
      for (const rel of members[b]) {
        let row = null;
        for (const [kk, mm] of m) if (own(mm, rel)) (row ||= {})[kk] = mm[rel];
        if (row) { rows[rel] = row; n += 1; } else members[b].delete(rel);
      }
      texts.push([b, n ? JSON.stringify({ v: 2, b, rows }) : null]);
      await pause();
    }
    const small = smallOf(state);
    main += performance.now() - s0;
    // on the disk: new pieces (flushed), then the index (flushed, renamed: the atomic step), then the old pieces go
    const madeNow = [];
    try {
      await fsp.mkdir(dir, { recursive: true });
      const disk = await readJson(indexFile);
      if (disk.state === HELD) throw Object.assign(new Error('state index held'), { code: disk.code || 'EBUSY' });
      // (another cloud folder's index: a full save, below, replaces every piece it names)
      const cur = disk.state === 'ok' && disk.value?.v === 2 && disk.value.parts && typeof disk.value.parts === 'object' ? disk.value : { gen: 0, parts: {} };
      const gen = (Number(cur.gen) || 0) + 1; const tag = rand();
      const parts = { ...cur.parts }; const old = [];
      const todo = texts.filter(([, t]) => t);
      for (let i = 0; i < todo.length; i += 8) {
        await Promise.all(todo.slice(i, i + 8).map(async ([b, t]) => { const name = `p-${hex(b)}-${gen}-${tag}.json`; madeNow.push(name); await writeFlushed(path.join(dir, name), t); st.bytes += t.length; }));
      }
      for (const [b, t] of texts) { if (parts[b]) old.push(parts[b]); if (t) parts[b] = `p-${hex(b)}-${gen}-${tag}.json`; else delete parts[b]; }
      const tmp = `${indexFile}.${rand()}.tmp`;
      madeNow.push(path.basename(tmp));
      await writeFlushed(tmp, JSON.stringify({ v: 2, gen, at: Date.now(), small, parts }));
      await rename(tmp, indexFile);
      madeNow.length = 0; // named now: never removed below
      st.saves += 1; st.written += todo.length;
      const named = new Set(Object.values(parts));
      for (const f of old) if (!named.has(f)) await fsp.rm(path.join(dir, f), { force: true }).catch(() => {});
      if (full) await tidy(named); // (a new drive / a migration: whatever an older index named goes too)
      if (migrating) { migrating = false; await rename(legacyFile, `${legacyFile}.prev`).catch((err) => { if (err.code !== 'ENOENT') log('state', err.message); }); }
    } catch (err) {
      for (const n of madeNow) await fsp.rm(path.join(dir, n), { force: true }).catch(() => {});
      for (const [b] of texts) dirty.add(b); // written again next time
      throw err;
    } finally {
      st.costMs = Math.round(main * 10) / 10; st.lastMs = Date.now() - t0;
    }
  }
  return { load, watch, save, isDirty, plain, idle: () => q, stats: () => ({ ...st }), dir, indexFile, legacyFile, _members: () => members };
}

module.exports = { createStateStore, bucketOf, NB, MAPS };
