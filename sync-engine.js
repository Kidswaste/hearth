// Sync engine (main process, no Electron needed): mirrors Hearth's local data folder to <cloud drive>/Hearth/ and
// back. Hearth always runs from its local folder (fast, offline); this engine compares three versions of every file
// (this computer's, the cloud copy, and the last version both had: the "base") and copies only what changed.
//
// Cloud layout (<cloud drive>/Hearth/):
//   files/<rel>                      the mirror (JSON stores in their portable form, see sync-merge.js path forms)
//   trash/<YYYY-MM-DD>/<rel>         deleted files (from any computer), restorable for 30 days
//   .sync/machines/<id>.json         each computer: name, platform, folders, last seen
//   .sync/journal/<id>.jsonl         each computer's change journal: { t, op, rel, h (sha1), s (size) } per line
//   .sync/conflicts/<cid>.json (+ copy)  a true conflict: the version that didn't win, kept whole
// Local state (data/sync/, never synced): state.json (base hashes + stat caches), base/<rel> (the base of each JSON
// store, for three-way merges), trash/ (files the other computer deleted), machine.json (this computer's id).
//
// Rules: writes are atomic on both sides (temp file + rename, checked right before the rename so a file written in
// between is never overwritten); big files copy in resumable chunks; cloud placeholders (iCloud ".icloud" stubs,
// Mac "dataless" files) are never read unless asked; deletions go to a trash, never straight away; a pass that would
// delete many files at once waits for a yes.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const S = require('./sync-merge');
const SS = require('./scenesafe-core');
// (round 43, datasafe) a state / machine file held for a moment (Windows) isn't "none": no new id or empty state over it
const HELD = Symbol('held');

const SMALL = 8 * 1024 * 1024; // up to this, files are read whole (hash + copy); bigger ones stream
const BIG_CAP = 100 * 1024 * 1024; // with "Sync big videos" off, bigger files stay on each computer
const JSON_MAX = 96 * 1024 * 1024;
const TRASH_DAYS = 30;
const INFLIGHT = 'inflight'; const UNKNOWN = 'unknown'; const BAD = 'bad';
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const day = (t) => new Date(t).toISOString().slice(0, 10);
const rand = () => crypto.randomBytes(4).toString('hex');
const nfc = (s) => s.normalize('NFC');
// These are application databases, not user-deleted documents. Clearing an item
// is an edit inside its store. A missing cloud/local store must not erase the
// surviving database (including temporary cloud renames and conflict copies).
const appStore = rel => /^kv\/[^/]+\.json$/i.test(rel);
const chatTrashRel = rel => /^chats\/[^/]+\.json$/i.test(rel) ? rel.replace(/^chats\//i, 'trash/') : null;

async function exists(p) { try { await fsp.stat(p); return true; } catch { return false; } }
function statSync(p) { try { return fs.statSync(p); } catch { return null; } }
async function hashFile(file, shouldStop) {
  const h = crypto.createHash('sha1');
  const fh = await fsp.open(file, 'r');
  try {
    const buf = Buffer.alloc(1 << 20);
    for (let pos = 0; ;) {
      const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
      if (!bytesRead) break;
      h.update(buf.subarray(0, bytesRead));
      pos += bytesRead;
      if (shouldStop?.()) throw Object.assign(new Error('stopped'), { code: 'STOPPED' });
    }
  } finally { await fh.close(); }
  return h.digest('hex');
}
// Windows: a rename over a file another program holds open (a cloud client, an antivirus) fails for a moment.
// Several engines can briefly share a destination (restart / switching sync
// settings). Serialize each destination and recheck only after its lock is held.
const renameQueues = new Map();
async function renameRetry(from, to, check) {
  const key = process.platform === 'win32' ? path.resolve(to).toLowerCase() : path.resolve(to);
  const previous = renameQueues.get(key) || Promise.resolve();
  let release; const next = new Promise(r => { release = r; }); renameQueues.set(key, next);
  await previous;
  try {
    for (let i = 0; ; i++) {
      if (check && !(await check())) return false;
      // Cloud providers can wait on downloads or display native dialogs here.
      // Never put that wait on Electron's main thread.
      try { await fsp.rename(from, to); return true; } catch (err) {
        if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
        await new Promise((r) => setTimeout(r, 120 * (i + 1)));
      }
    }
  } finally {
    release(); if (renameQueues.get(key) === next) renameQueues.delete(key);
  }
}

function createEngine(o) {
  const now = o.now || (() => Date.now());
  const log = o.log || (() => {});
  const platform = o.platform || process.platform;
  const dataDir = o.dataDir;
  const stateDir = o.stateDir || path.join(dataDir, 'sync');
  const cloudRoot = o.cloudRoot; // the cloud drive (Dropbox, My Drive…)
  const cloudDir = path.join(cloudRoot, 'Hearth');
  const FILES = path.join(cloudDir, 'files');
  const META = path.join(cloudDir, '.sync');
  const TRASH = path.join(cloudDir, 'trash');
  const CONFL = path.join(META, 'conflicts');
  const CHUNK = o.chunk || 4 * 1024 * 1024;
  const SPECIAL = { 'app/config.json': o.configPath, 'app/theme.css': o.themePath };
  fs.mkdirSync(stateDir, { recursive: true });

  // ---------- this computer ----------
  const machineFile = path.join(stateDir, 'machine.json');
  let machine = readJsonSync(machineFile);
  let heldStart = machine === HELD; // read again at the first pass; until then nothing is synced
  if (heldStart) machine = { id: `held-${rand()}`, created: now() };
  else if (!machine?.id) {
    machine = { id: `${(o.machineName || os.hostname()).replace(/[^\w-]+/g, '').slice(0, 20) || 'pc'}-${rand()}`, created: now() };
    writeJsonSync(machineFile, machine);
  }
  machine.name = o.machineName || os.hostname();
  machine.platform = platform;

  // ---------- state ----------
  const stateFile = path.join(stateDir, 'state.json');
  let state = readJsonSync(stateFile);
  if (state === HELD) { heldStart = true; state = null; }
  if (heldStart) state = { v: 1, cloudRoot, base: {}, local: {}, cloud: {}, ext: {}, lastPass: 0, lastOk: 0, purgedAt: 0, held: true }; // not saved: re-read first
  else if (!state || state.v !== 1 || state.cloudRoot !== cloudRoot) {
    // a new drive (or the first time): no base, so the first pass merges both sides without overwriting either
    state = { v: 1, cloudRoot, base: {}, local: {}, cloud: {}, ext: {}, lastPass: 0, lastOk: 0, purgedAt: 0 };
    try { fs.rmSync(path.join(stateDir, 'base'), { recursive: true, force: true }); } catch { /* fine */ }
  }
  // (round 16) a pass where nothing moved left state.json as it was, but wrote it anyway (every file's hashes, each
  // minute): now it's written when something in it changed, or every 10 minutes for the clocks (lastPass / lastOk)
  let savedKey = ''; let savedAt = 0;
  const saveState = () => {
    if (heldStart) return; // (round 43, datasafe) the real one couldn't be read yet: never written over
    const text = JSON.stringify(state);
    const key = JSON.stringify({ ...state, lastPass: 0, lastOk: 0 });
    if (key === savedKey && now() - savedAt < 10 * 60000) return;
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const t = `${stateFile}.${rand()}.tmp`; fs.writeFileSync(t, text); fs.renameSync(t, stateFile);
    savedKey = key; savedAt = now();
  };
  const basePath = (rel) => path.join(stateDir, 'base', ...rel.split('/'));
  function readBase(rel) { try { return S.parseJson(fs.readFileSync(basePath(rel), 'utf8')); } catch { return null; } }
  function writeBase(rel, text) { try { const f = basePath(rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(`${f}.tmp`, text); fs.renameSync(`${f}.tmp`, f); } catch (err) { log('base', rel, err.message); } }
  function dropBase(rel) { delete state.base[rel]; try { fs.rmSync(basePath(rel), { force: true }); } catch { /* fine */ } }
  function setBase(rel, h, text) { state.base[rel] = h; if (text !== undefined && S.isJsonRel(rel)) writeBase(rel, text); }

  let status = { state: 'idle', at: 0, pending: 0, conflicts: 0, cloudOnly: [], skippedBig: [], unreadable: [], held: null, error: '', last: null };
  let running = null; let again = false; let stopping = false;
  const pulledPrev = new Map(); // rel → the value this computer had before a pull (cloud form): the guard's base
  // (the oldest one is kept until the app reloads it: that is the version still in its memory; huge stores aren't kept)
  const remember = (rel, value, size = 0) => { if (!pulledPrev.has(rel) && size < 16e6) pulledPrev.set(rel, value); };

  // ---------- path forms ----------
  let aliases = { data: [], cloud: [], home: [] };
  const baseCtx = () => S.withExt({ dataDir, cloudRoot, home: o.home || os.homedir(), win: platform === 'win32', aliases }, state.ext);
  let ctx = baseCtx();
  const canon = (value) => JSON.stringify(value);
  const localForm = (value, pretty) => (pretty ? `${JSON.stringify(value, null, 2)}` : JSON.stringify(value));

  // ---------- where files live ----------
  const localPathOf = (rel) => SPECIAL[rel] || state.ext[rel] || path.join(dataDir, ...rel.split('/'));
  const cloudPathOf = (rel) => path.join(FILES, ...rel.split('/'));
  const relOfLocal = (file) => {
    for (const [rel, p] of Object.entries(SPECIAL)) if (p && path.resolve(p) === path.resolve(file)) return rel;
    const r = path.relative(dataDir, file);
    if (!r || r.startsWith('..') || path.isAbsolute(r)) return null;
    return nfc(r.split(path.sep).join('/'));
  };

  // ---------- scanning ----------
  // (round 43, datasafe) a folder that can't be listed (held, a cloud client busy with it) is "unknown", not "empty":
  // walk.blind collects it, and nothing under it is deleted or pulled over this pass
  async function walk(root, fn, rel = '', blind = null) {
    let ents;
    try { ents = await fsp.readdir(rel ? path.join(root, ...rel.split('/')) : root, { withFileTypes: true }); } catch (err) { if (blind && err.code !== 'ENOENT' && err.code !== 'ENOTDIR') blind.add(rel ? `${nfc(rel)}/` : ''); return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!S.dirLocalOnly(nfc(r)) && !S.localOnly(`${nfc(r)}/x`)) await walk(root, fn, r, blind); continue; }
      await fn(e, r);
    }
  }
  async function scanLocal() {
    const out = new Map();
    out.blind = new Set();
    await walk(dataDir, async (e, r) => {
      if (!e.isFile() || S.ignoredName(e.name) || S.localOnly(nfc(r))) return;
      const file = path.join(dataDir, ...r.split('/'));
      try { const st = await fsp.stat(file); out.set(nfc(r), { file, size: st.size, mtime: st.mtimeMs }); } catch (err) { if (err.code !== 'ENOENT') out.blind.add(nfc(r)); /* else gone */ }
    }, '', out.blind);
    for (const [rel, file] of Object.entries(SPECIAL)) {
      if (!file) continue;
      try { const st = await fsp.stat(file); out.set(rel, { file, size: st.size, mtime: st.mtimeMs }); } catch { /* none */ }
    }
    // renders saved outside the data folder (Lab recordings and exports from before round 17), listed in kv/video-library
    refreshExt();
    for (const [rel, abs] of Object.entries(state.ext)) {
      if (out.has(rel)) continue;
      try { const st = await fsp.stat(abs); out.set(rel, { file: abs, size: st.size, mtime: st.mtimeMs, ext: true }); } catch { out.set(rel, { unavailable: true }); }
    }
    return out;
  }
  let extSeen = '';
  function refreshExt() {
    const lib = path.join(dataDir, 'kv', 'video-library.json');
    const st = statSync(lib);
    const key = st ? `${st.size}:${st.mtimeMs}` : '';
    if (key === extSeen) return;
    let data;
    try { data = st ? S.parseJson(fs.readFileSync(lib, 'utf8')) : {}; } catch { return; } // unreadable now: keep the list
    extSeen = key;
    const found = new Set();
    const visit = (v) => {
      if (typeof v === 'string') { if (S.MEDIA.test(v) && path.isAbsolute(v) && !relOfLocal(v) && /\.(mp4|mov|webm|mkv|m4v|gif)$/i.test(v)) found.add(v); return; }
      if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') Object.values(v).forEach(visit);
    };
    visit(data);
    const next = {};
    const byAbs = new Map(Object.entries(state.ext).map(([rel, abs]) => [abs, rel]));
    for (const abs of found) {
      let rel = byAbs.get(abs);
      if (!rel) {
        const name = nfc(path.basename(abs));
        rel = `renders/${name}`;
        if (next[rel] || fs.existsSync(path.join(dataDir, 'renders', name))) rel = `renders/${sha(abs).slice(0, 6)}-${name}`;
      }
      next[rel] = abs;
    }
    state.ext = next;
    ctx = baseCtx();
  }
  const CLOUD_COPY = [
    /^(.*) \([^()]*conflicted copy[^()]*\)(\.[^./]+)?$/i, // Dropbox
  ];
  const JSON_COPY = /^([\w-]+)(?: \d+| ?\(\d+\))\.json$/; // iCloud "x 2.json" / "x(1).json", Google Drive "x (1).json"
  async function scanCloud() {
    const out = new Map(); const copies = [];
    out.blind = new Set();
    const hosts = new Set([machine.name, ...peers.map((p) => p.name)].filter(Boolean).map((n) => String(n).toUpperCase().replace(/\.LOCAL$/, '')));
    await walk(FILES, async (e, r) => {
      if (!e.isFile()) return;
      let name = e.name; let placeholder = false;
      const stub = /^\.(.+)\.icloud$/.exec(name);
      if (stub) { name = stub[1]; placeholder = true; } else if (S.ignoredName(name)) return;
      const rel = nfc(r.replace(/[^/]+$/, name));
      if (S.localOnly(rel)) return;
      const file = path.join(FILES, ...r.split('/'));
      let st; try { st = await fsp.stat(file); } catch (err) { if (err.code !== 'ENOENT') out.blind.add(rel); return; }
      // a Mac "dataless" file (Optimise Mac Storage, Google Drive streaming): stat works, reading downloads it
      if (!placeholder && platform === 'darwin' && st.size > 0 && st.blocks === 0) placeholder = true;
      const ent = { file, size: placeholder && stub ? null : st.size, mtime: st.mtimeMs, placeholder };
      // copies a cloud client made when both computers wrote the same file
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
      let orig = null;
      for (const re of CLOUD_COPY) { const mm = re.exec(name); if (mm) orig = `${dir}${mm[1]}${mm[2] || ''}`; }
      const jm = JSON_COPY.exec(name);
      if (!orig && jm) orig = `${dir}${jm[1]}.json`;
      const od = /^([\w-]+)-([A-Za-z0-9-]{2,})\.json$/.exec(name); // OneDrive "x-COMPUTERNAME.json"
      if (!orig && od && hosts.has(od[2].toUpperCase()) && !state.base[rel]) orig = `${dir}${od[1]}.json`;
      if (orig && S.localOnly(orig)) return;
      if (orig && orig !== rel && !state.base[rel]) { copies.push({ rel, orig, ...ent }); return; }
      out.set(rel, ent);
    }, '', out.blind);
    if (platform === 'win32') {
      const entries = [...out.values(), ...copies];
      const probe = o.cloudAttributes || require('./cloud-files').attributes;
      let attributes; try { attributes = await probe(entries.map(e => e.file)); } catch { attributes = new Map(); }
      for (const e of entries) {
        const a = attributes.get(e.file);
        if (require('./cloud-files').pending(a)) { e.placeholder = true; e.downloading = true; e.cloudUnknown = !Number.isInteger(a); }
      }
    }
    return { files: out, copies };
  }

  // ---------- peers and journals ----------
  let peers = []; let cloned = false;
  const journalLatest = new Map(); // rel → { h, s, t, m } (other computers' newest entry)
  const journalSeen = {};
  async function readPeers() {
    const list = [];
    try {
      for (const f of await fsp.readdir(path.join(META, 'machines'))) {
        if (!f.endsWith('.json')) continue;
        try {
          const j = S.parseJson(await fsp.readFile(path.join(META, 'machines', f), 'utf8'));
          if (f !== `${j.id}.json`) continue; // a cloud conflict copy is not another computer
          // this computer's id on another computer (its data folder was copied, sync state and all): a new id here,
          // and no base, so the next pass merges both sides like a first join
          if (j.id === machine.id && j.dataDir && j.dataDir !== dataDir && j.name !== machine.name && !cloned) {
            cloned = true;
            machine = { ...machine, id: `${String(machine.name).replace(/[^\w-]+/g, '').slice(0, 20) || 'pc'}-${rand()}`, created: now() };
            writeJsonSync(machineFile, { id: machine.id, created: machine.created });
            state = { v: 1, cloudRoot, base: {}, local: {}, cloud: {}, ext: state.ext || {}, lastPass: 0, lastOk: 0, purgedAt: 0 };
            try { fs.rmSync(path.join(stateDir, 'base'), { recursive: true, force: true }); } catch { /* fine */ }
            log('machine id was a copy: new id', machine.id);
          }
          if (j.id && j.id !== machine.id) list.push(j);
        } catch { /* being written */ }
      }
    } catch { /* none yet */ }
    peers = list;
    const al = { data: [], cloud: [], home: [] };
    for (const p of list) { if (p.dataDir) al.data.push(p.dataDir); if (p.cloudRoot) al.cloud.push(p.cloudRoot); if (p.home) al.home.push(p.home); }
    if (JSON.stringify(al) !== JSON.stringify(aliases)) { aliases = al; ctx = baseCtx(); }
    try {
      const journals = new Set(peers.map(p => `${p.id}.jsonl`));
      for (const f of await fsp.readdir(path.join(META, 'journal'))) {
        if (!journals.has(f)) continue; // metadata copies are only hints; never treat ours as a peer
        const file = path.join(META, 'journal', f);
        let st; try { st = await fsp.stat(file); } catch { continue; }
        const key = `${st.size}:${st.mtimeMs}`;
        if (journalSeen[f] === key) continue;
        let text = ''; try { text = await fsp.readFile(file, 'utf8'); } catch { continue; }
        journalSeen[f] = key;
        const mid = f.slice(0, -6);
        for (const line of text.split('\n')) {
          if (!line) continue;
          let j; try { j = S.parseJson(line); } catch { continue; }
          if (!j.rel) continue;
          const cur = journalLatest.get(j.rel);
          if (!cur || cur.t <= j.t) journalLatest.set(j.rel, { h: j.h, s: j.s, t: j.t, m: mid, op: j.op });
        }
      }
    } catch { /* none yet */ }
  }
  const nameOf = (mid) => peers.find((p) => p.id === mid)?.name || (mid ? String(mid).replace(/-[0-9a-f]{8}$/, '') : 'another computer');
  let journalOut = [];
  async function flushJournal() {
    if (!journalOut.length) return;
    const file = path.join(META, 'journal', `${machine.id}.jsonl`);
    let lines = [];
    try { lines = (await fsp.readFile(file, 'utf8')).split('\n').filter(Boolean); } catch { /* new */ }
    lines.push(...journalOut.map((j) => JSON.stringify(j)));
    journalOut = [];
    await atomicWrite(file, `${lines.slice(-4000).join('\n')}\n`);
  }
  async function writeMachine(force) {
    const file = path.join(META, 'machines', `${machine.id}.json`);
    if (!force && now() - (state.machineAt || 0) < 10 * 60 * 1000) return;
    state.machineAt = now();
    await atomicWrite(file, JSON.stringify({ id: machine.id, name: machine.name, platform, dataDir, home: o.home || os.homedir(), cloudRoot, lastSeen: now(), lastOk: state.lastOk }, null, 2));
  }

  // ---------- files ----------
  // (round 50, crashsafe) a temp file flushed to the disk before its rename: a power cut leaves the old file or the
  // whole new one (never an empty one that then syncs to the other computer)
  async function flushed(p) { let h = null; try { h = await fsp.open(p, 'r+'); await h.sync(); } catch { /* a disk / file that can't */ } finally { await h?.close().catch(() => {}); } }
  async function atomicWrite(file, data) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), `.hearth-tmp-${rand()}-${path.basename(file)}`);
    await fsp.writeFile(tmp, data);
    await flushed(tmp); try { await renameRetry(tmp, file); } catch (err) { await fsp.rm(tmp, { force: true }); throw err; }
  }
  // the check right before a rename: the file is still the one this pass looked at (or still absent)
  const same = async (file, ent) => {
    let st;
    try { st = await fsp.stat(file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    if (!ent) return !st;
    return Boolean(st) && st.size === (ent.size ?? st.size) && st.mtimeMs === ent.mtime;
  };
  async function casWrite(file, ent, data, fault) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), `.hearth-tmp-${rand()}-${path.basename(file)}`);
    await fsp.writeFile(tmp, data);
    o.fault?.(fault, file);
    let ok = false;
    try { await flushed(tmp); ok = await renameRetry(tmp, file, () => same(file, ent)); } finally { if (!ok) await fsp.rm(tmp, { force: true }).catch(() => {}); }
    return ok;
  }
  // big files: copied in chunks into "<name>.hearth-part" next to the target; a copy cut short (quit, crash, the
  // cloud folder gone) goes on from where it stopped next time, if the source hasn't changed.
  async function copyBig(src, dst, ent, expectHash) {
    const st0 = await fsp.stat(src);
    const part = path.join(path.dirname(dst), `.hearth-part-${path.basename(dst)}`);
    const meta = `${part}.json`;
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    let start = 0;
    const m = readJsonSync(meta);
    const pst = statSync(part);
    if (m && pst && m.size === st0.size && m.mtime === st0.mtimeMs && pst.size <= st0.size) start = pst.size - (pst.size % CHUNK);
    else { await fsp.writeFile(meta, JSON.stringify({ size: st0.size, mtime: st0.mtimeMs, src })); await fsp.writeFile(part, ''); }
    const h = crypto.createHash('sha1');
    const buf = Buffer.alloc(CHUNK);
    const rf = await fsp.open(src, 'r');
    const wf = await fsp.open(part, 'r+');
    try {
      if (start) { // the part already copied counts toward the hash
        for (let pos = 0; pos < start;) { const { bytesRead } = await wf.read(buf, 0, Math.min(CHUNK, start - pos), pos); if (!bytesRead) break; h.update(buf.subarray(0, bytesRead)); pos += bytesRead; }
        status.resumed = (status.resumed || 0) + 1;
      }
      await wf.truncate(start);
      for (let pos = start; ;) {
        const { bytesRead } = await rf.read(buf, 0, CHUNK, pos);
        if (!bytesRead) break;
        await wf.write(buf, 0, bytesRead, pos);
        h.update(buf.subarray(0, bytesRead));
        pos += bytesRead;
        status.bytes = (status.bytes || 0) + bytesRead;
        o.fault?.('chunk', dst, pos);
        if (stopping) throw Object.assign(new Error('stopped'), { code: 'STOPPED' });
      }
    } finally { await rf.close(); await wf.close(); }
    const hex = h.digest('hex');
    const st1 = await fsp.stat(src);
    if (st1.size !== st0.size || st1.mtimeMs !== st0.mtimeMs || (expectHash && hex !== expectHash)) {
      await fsp.rm(part, { force: true }); await fsp.rm(meta, { force: true });
      return null; // changed while copying: next pass
    }
    const ok = await renameRetry(part, dst, () => same(dst, ent));
    await fsp.rm(meta, { force: true });
    if (!ok) { await fsp.rm(part, { force: true }); return null; }
    return hex;
  }

  // ---------- hashing (cached by size + modified time) ----------
  let texts = new Map(); // `${side}:${rel}` → canonical (cloud-form) JSON text, this pass only
  let hashed = new Map(); // (round 20) text → its hash, for the big stores hashed on the store thread (this pass only)
  const arriving = new Map(); // rel → { size, mtime, since }: a cloud file whose size doesn't match its journal yet
  // (round 20, offmain) a big JSON store (≥ 256 KB: Lab scenes, boards, long chats) is read, put in its cloud form and
  // hashed on another thread when the app gives one (o.hashJson: the store thread in Hearth), so a pass never holds
  // the main process for the whole parse + stringify; big plain files are hashed in 1 MB steps (hashFile)
  const OFF_MIN = 256 * 1024; const WHOLE_MAX = 1024 * 1024;
  async function hashOff(file, size, rel, cloud) {
    if (!o.hashJson || size < OFF_MIN) return null;
    try { return await o.hashJson(file, { rel, cloud, ctx: cloud ? null : ctx }); } catch { return null; }
  }
  async function localHash(rel, L) {
    const c = state.local[rel];
    if (c && c[0] === L.size && c[1] === L.mtime && c[2]) return c[2];
    let h;
    const off = S.isJsonRel(rel) && L.size <= JSON_MAX ? await hashOff(L.file, L.size, rel, false) : null;
    if (off?.bad) return now() - L.mtime < 5000 ? INFLIGHT : BAD;
    if (off?.h) { h = off.h; if (off.t) { texts.set(`l:${rel}`, off.t); hashed.set(off.t, h); } } else if (S.isJsonRel(rel) && L.size <= JSON_MAX) {
      const text = await fsp.readFile(L.file, 'utf8');
      let v;
      try { v = S.parseJson(text); } catch { return now() - L.mtime < 5000 ? INFLIGHT : BAD; }
      if (rel === 'app/config.json') v = S.portableConfig(v);
      const t = canon(S.toCloud(v, ctx));
      if (t.length < 2e6) texts.set(`l:${rel}`, t);
      h = sha(t);
    } else if (L.size <= WHOLE_MAX) h = sha(await fsp.readFile(L.file));
    else h = await hashFile(L.file, () => stopping);
    state.local[rel] = [L.size, L.mtime, h];
    return h;
  }
  async function localText(rel, L) {
    if (texts.has(`l:${rel}`)) return texts.get(`l:${rel}`);
    let v = S.parseJson(await fsp.readFile(L.file, 'utf8'));
    if (rel === 'app/config.json') v = S.portableConfig(v);
    const t = canon(S.toCloud(v, ctx));
    texts.set(`l:${rel}`, t);
    return t;
  }
  // A placeholder (content still only in the cloud) is read only when small (stores, notes, pictures: the app needs
  // them) or when asked ("Download the big files now"); iCloud's ".icloud" stubs can't be read at all, their download
  // is requested from iCloud instead. Big videos are never downloaded behind your back.
  const isStub = (C) => /\.icloud$/i.test(C.file || '');
  function readable(rel, C) {
    if (C.downloading) return false;
    if (!C.placeholder) return true;
    if (isStub(C)) { const j = journalLatest.get(rel); if (!j || (j.s ?? 0) <= SMALL || o.allowDownload?.has(rel)) o.requestDownload?.(C.file, rel); return false; }
    return (C.size ?? 0) <= SMALL || Boolean(o.allowDownload?.has(rel));
  }
  async function cloudReady(rel, C) {
    if (!C.downloading && !C.placeholder) return true;
    if (isStub(C)) { readable(rel, C); return false; } // asks the Mac provider for its stub
    // Preserve small-file / explicit downloads, but do not move a placeholder
    // until its read completes and the provider confirms local availability.
    if (C.cloudUnknown || (C.size > SMALL && !o.allowDownload?.has(rel))) return false;
    try {
      await hashFile(C.file, () => stopping);
      if (platform === 'win32') {
        const attrs = await (o.cloudAttributes || require('./cloud-files').attributes)([C.file]);
        if (require('./cloud-files').pending(attrs.get(C.file))) return false;
      }
      const st = await fsp.stat(C.file);
      if (platform === 'darwin' && st.size > 0 && st.blocks === 0) return false;
      Object.assign(C, { size: st.size, mtime: st.mtimeMs, placeholder: false, downloading: false });
      return true;
    } catch (err) { log('cloud download', rel, err.message); return false; }
  }
  async function cloudHash(rel, C) {
    const c = state.cloud[rel];
    const j = journalLatest.get(rel);
    // An unchanged, offloaded large file does not need downloading just to say
    // it is synced. Reuse only an exact metadata match; changed/unknown cloud
    // files must remain pending until their actual contents can be read.
    if (C.downloading) return !C.cloudUnknown && c && c[0] === C.size && c[1] === C.mtime && c[2] ? c[2] : UNKNOWN;
    if (C.placeholder && !readable(rel, C)) {
      if (c && c[2] && (C.size === null || c[0] === C.size) && (!j || j.h === c[2] || j.t < (state.lastOk || 0))) return c[2];
      return j && (C.size === null || j.s === C.size) ? j.h : UNKNOWN;
    }
    if (c && c[0] === C.size && c[1] === C.mtime && c[2]) return c[2];
    // still being written (whole milliseconds: a file's mtime has sub-ms precision while now() is truncated, so a file
    // written this very millisecond looked 0.4 ms "in the future" and never started its arriving clock below)
    if (now() - Math.floor(C.mtime) < (o.settleMs ?? 2000)) return INFLIGHT;
    // not the size the other computer wrote: still arriving (a cloud client writing in place), unless it stays like
    // this for a minute (then the journal is the one late, and the file is what it is)
    if (j && j.op !== 'del' && j.s !== C.size && now() - j.t < 30 * 60 * 1000) {
      const seen = arriving.get(rel);
      if (!seen || seen.size !== C.size || seen.mtime !== C.mtime) { arriving.set(rel, { size: C.size, mtime: C.mtime, since: now() }); return INFLIGHT; }
      if (now() - seen.since < (o.stableMs ?? 60000)) return INFLIGHT;
    }
    let h;
    const off = S.isJsonRel(rel) && C.size <= JSON_MAX ? await hashOff(C.file, C.size, rel, true) : null;
    if (off?.bad) return now() - C.mtime < 30 * 60 * 1000 ? INFLIGHT : BAD;
    if (off?.h) { h = off.h; if (off.t) texts.set(`c:${rel}`, off.t); } else if (S.isJsonRel(rel) && C.size <= JSON_MAX) {
      let v;
      try { v = S.parseJson(await fsp.readFile(C.file, 'utf8')); } catch { return now() - C.mtime < 30 * 60 * 1000 ? INFLIGHT : BAD; }
      const t = canon(v);
      if (t.length < 2e6) texts.set(`c:${rel}`, t);
      h = sha(t);
    } else if (C.size > SMALL && j && j.s === C.size && j.h) h = j.h;
    else if (C.size <= WHOLE_MAX) h = sha(await fsp.readFile(C.file));
    else h = await hashFile(C.file, () => stopping);
    state.cloud[rel] = [C.size, C.mtime, h];
    return h;
  }
  async function cloudText(rel, C) {
    if (texts.has(`c:${rel}`)) return texts.get(`c:${rel}`);
    const t = canon(S.parseJson(await fsp.readFile(C.file, 'utf8')));
    texts.set(`c:${rel}`, t);
    return t;
  }

  // ---------- the operations ----------
  const counts = () => ({ pulled: 0, pushed: 0, merged: 0, conflicts: 0, deletedHere: 0, deletedThere: 0, renamed: 0, skipped: 0, errors: 0 });
  let sum = counts();
  let pulledNow = [];
  const notePulled = (rel, kind) => pulledNow.push({ rel, kind, from: nameOf(journalLatest.get(rel)?.m) });
  // a JSON value as this computer stores it (pretty unless the file was compact)
  function localJsonText(rel, value, L) {
    if (rel === 'app/config.json') {
      let cur = {}; try { cur = S.parseJson(fs.readFileSync(SPECIAL[rel], 'utf8')); } catch { /* none */ }
      return `${JSON.stringify(S.applyPortable(cur, value), null, 2)}\n`;
    }
    let pretty = true;
    if (L?.file) { try { const fd = fs.openSync(L.file, 'r'); const b = Buffer.alloc(2); fs.readSync(fd, b, 0, 2, 0); fs.closeSync(fd); pretty = /^[[{]\s/.test(b.toString()) || b.length < 2; } catch { /* new */ } }
    return localForm(value, pretty);
  }
  async function afterLocalWrite(rel, h) {
    const st = statSync(localPathOf(rel));
    if (st) state.local[rel] = [st.size, st.mtimeMs, h];
  }
  async function afterCloudWrite(rel, h) {
    const st = await fsp.stat(cloudPathOf(rel));
    if (st) state.cloud[rel] = [st.size, st.mtimeMs, h];
    journalOut.push({ t: now(), op: 'put', rel, h, s: st?.size });
  }

  async function push(rel, L, C, h) {
    const dst = C?.file && !/\.icloud$/.test(C.file) ? C.file : cloudPathOf(rel);
    const cent = C ? { size: C.size, mtime: C.mtime } : null;
    if (C?.placeholder && /\.icloud$/.test(C.file || '')) { // replacing an iCloud stub: move it aside first
      if (!(await moveToCloudTrash(rel, C))) return false;
    }
    const target = C?.placeholder && /\.icloud$/.test(C.file || '') ? null : cent;
    let ok;
    if (S.isJsonRel(rel)) {
      const text = await localText(rel, L);
      if ((hashed.get(text) ?? sha(text)) !== h) return false; // (round 20) a text hashed on the store thread isn't hashed again
      ok = await casWrite(dst, target, text, 'push');
      if (ok) setBase(rel, h, text);
    } else if (L.size <= SMALL) {
      const buf = await fsp.readFile(L.file);
      if (sha(buf) !== h) return false;
      ok = await casWrite(dst, target, buf, 'push');
      if (ok) setBase(rel, h);
    } else {
      ok = Boolean(await copyBig(L.file, dst, target, h));
      if (ok) setBase(rel, h);
    }
    if (!ok) return false;
    await afterCloudWrite(rel, h);
    sum.pushed += 1;
    return true;
  }
  async function pull(rel, L, C, h) {
    const file = localPathOf(rel);
    const lent = L && !L.unavailable ? { size: L.size, mtime: L.mtime } : null;
    if (L?.unavailable) return false;
    let ok;
    if (S.isJsonRel(rel)) {
      const text = await cloudText(rel, C);
      if (sha(text) !== h) return false;
      const value = S.toCloud(S.parseJson(text), ctx); // (old paths of another computer written as-is are fixed too)
      const prev = L ? await localText(rel, L).catch(() => null) : null;
      keepScenesAside(rel, L, value);
      await keepStateAside(rel, L);
      ok = await casWrite(file, lent, localJsonText(rel, S.fromCloud(value, ctx), L), 'pull');
      if (ok) {
        setBase(rel, h, text);
        remember(rel, prev === null ? null : S.parseJson(prev), prev ? prev.length : 0);
        // what this computer now has, in cloud form (equal to h unless a path couldn't be expressed here)
        let lh = h; try { lh = await relHashNow(rel); } catch { /* keep h */ }
        await afterLocalWrite(rel, lh);
      }
    } else if (C.size <= SMALL) {
      const buf = await fsp.readFile(C.file);
      if (sha(buf) !== h) return false;
      ok = await casWrite(file, lent, buf, 'pull');
      if (ok) { setBase(rel, h); await afterLocalWrite(rel, h); }
    } else {
      ok = Boolean(await copyBig(C.file, file, lent, h));
      if (ok) { setBase(rel, h); await afterLocalWrite(rel, h); }
    }
    if (!ok) return false;
    // what arrived isn't what the journals say (written by hand, or the journal is late): say so in ours, so the
    // other computers don't wait for a version that never comes
    const j = journalLatest.get(rel);
    if (j && (j.h !== h || (C.size !== null && j.s !== C.size))) journalOut.push({ t: now(), op: 'put', rel, h, s: C.size ?? undefined });
    sum.pulled += 1;
    notePulled(rel, kindOf(rel));
    return true;
  }
  async function relHashNow(rel) {
    let v = S.parseJson(fs.readFileSync(localPathOf(rel), 'utf8'));
    if (rel === 'app/config.json') v = S.portableConfig(v);
    return sha(canon(S.toCloud(v, ctx)));
  }
  // One last local version per store/chat, outside the cloud mirror. Failure to
  // save this copy stops the replacement. Also offered by Sync → Deleted files.
  async function keepStateAside(rel, L) {
    if (!L?.file || L.unavailable || !/^(?:chats|kv)\/[^/]+\.json$/i.test(rel)) return;
    const raw=await fsp.readFile(L.file,'utf8'); S.parseJson(raw);
    await atomicWrite(path.join(stateDir,'recovery',...rel.split('/')),raw);
  }
  // (round 43, scenesafe) before what arrives replaces this computer's Lab scenes with a list missing some of them (a
  // delete on the other computer… or a list lost there), this computer's file is kept in data/kv/.history/three-sketches
  // (not synced: a hidden folder) so 🛟 Recover lost scenes finds them; the store's guard keeps them when the Lab saves
  function keepScenesAside(rel, L, next) {
    if (rel !== 'kv/three-sketches.json' || !L?.file || L.unavailable || !Array.isArray(next)) return;
    try {
      const text = fs.readFileSync(L.file, 'utf8');
      const mine = S.parseJson(text);
      if (!Array.isArray(mine)) return;
      const have = new Set(next.map((x) => x?.id));
      const gone = mine.filter((x) => x?.id && !have.has(x.id));
      if (!gone.length) return;
      const SS = require('./scenesafe-core');
      const dir = path.join(dataDir, 'kv', '.history', 'three-sketches');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, SS.copyName(now(), mine.length, 'sync')), text);
      log('scenes kept aside before sync', gone.length);
    } catch (err) { log('scenes aside', err.message); }
  }
  const kindOf = (rel) => (rel.startsWith('chats/') ? 'chat' : rel.startsWith('kv/') ? 'kv' : rel === 'app/config.json' ? 'config' : rel === 'app/theme.css' ? 'theme' : rel === 'memory.json' ? 'memory' : 'file');

  // both changed (or the first join): merge JSON, keep both copies of anything else
  async function merge(rel, L, C, lh, ch) {
    const lent = { size: L.size, mtime: L.mtime };
    const cent = { size: C.size, mtime: C.mtime };
    if (S.isJsonRel(rel) && lh !== BAD && ch !== BAD) {
      const ours = S.parseJson(await localText(rel, L));
      const theirsText = await cloudText(rel, C);
      const theirs = S.toCloud(S.parseJson(theirsText), ctx);
      const base = state.base[rel] ? readBase(rel) : null;
      const r = S.merge3(base, ours, theirs, { counters: S.isCounterRel(rel) });
      const text = canon(r.value);
      const hm = sha(text);
      // this computer first, then the cloud: a cloud write that loses its race leaves the old base, so the next pass
      // merges again instead of pushing a version that misses the other computer's changes
      if (hm !== lh) {
        keepScenesAside(rel, L, r.value);
        await keepStateAside(rel, L);
        const ok = await casWrite(L.file, lent, localJsonText(rel, S.fromCloud(r.value, ctx), L), 'merge-local');
        if (!ok) return false;
        remember(rel, ours);
        await afterLocalWrite(rel, hm);
        notePulled(rel, kindOf(rel));
      }
      if (hm !== ch) {
        const ok = await casWrite(C.file, cent, text, 'merge-cloud');
        if (!ok) return false;
        await afterCloudWrite(rel, hm);
      }
      setBase(rel, hm, text);
      if (r.conflicts.length) await saveConflict(rel, { kind: 'json', text: theirsText, fields: r.conflicts, from: journalLatest.get(rel)?.m, oursAt: L.mtime, theirsAt: journalLatest.get(rel)?.t || C.mtime });
      sum.merged += 1;
      return true;
    }
    // whole files: ours stays in place, theirs is kept as a conflict copy (moved inside the cloud, nothing downloads)
    const cid = `${day(now())}-${rand()}`;
    const copy = path.join(CONFL, `${cid}-${path.basename(C.file)}`);
    await fsp.mkdir(CONFL, { recursive: true });
    if (!(await same(C.file, C.placeholder ? { size: C.size ?? undefined, mtime: C.mtime } : cent))) return false;
    const moved = await renameRetry(C.file, copy, () => same(C.file, C));
    if (!moved) return false;
    delete state.cloud[rel];
    await writeConflictRecord({ id: cid, rel, kind: 'file', copy: path.basename(copy), at: now(), by: machine.name, from: nameOf(journalLatest.get(rel)?.m), ...sides(journalLatest.get(rel)?.m, L.mtime, journalLatest.get(rel)?.t || C.mtime), size: L.size, theirsSize: C.size ?? null, fields: [] });
    sum.conflicts += 1;
    return push(rel, L, null, lh);
  }
  // (round 19) each side's computer, platform and time of its last change, so the choice says what it saves over
  const platOf = (mid) => peers.find((p) => p.id === mid)?.platform || (peers.length === 1 ? peers[0].platform : null);
  const sides = (mid, oursAt, theirsAt) => ({ byPlatform: platform, fromId: mid || null, fromPlatform: platOf(mid), oursAt: oursAt || now(), theirsAt: theirsAt || null });
  async function saveConflict(rel, { text, fields, from, oursAt, theirsAt }) {
    const cid = `${day(now())}-${rand()}`;
    await atomicWrite(path.join(CONFL, `${cid}.copy.json`), text);
    await writeConflictRecord({ id: cid, rel, kind: 'json', copy: `${cid}.copy.json`, at: now(), by: machine.name, from: nameOf(from), ...sides(from, oursAt, theirsAt), fields: fields.slice(0, 20) });
    sum.conflicts += 1;
  }
  async function writeConflictRecord(rec) { await atomicWrite(path.join(CONFL, `${rec.id}.json`), JSON.stringify(rec, null, 2)); }

  async function moveToCloudTrash(rel, C) {
    const dir = path.join(TRASH, day(now()), ...rel.split('/').slice(0, -1));
    await fsp.mkdir(dir, { recursive: true });
    let dst = path.join(dir, path.basename(C.file));
    if (await exists(dst)) dst = path.join(dir, `${rand()}-${path.basename(C.file)}`);
    return renameRetry(C.file, dst, () => same(C.file, C));
  }
  async function deleteThere(rel, C) { // this computer deleted it: the cloud copy goes to the synced trash
    if (!(await same(C.file, { size: C.size ?? undefined, mtime: C.mtime }))) return false;
    if (!(await moveToCloudTrash(rel, C))) return false;
    delete state.cloud[rel]; delete state.local[rel]; dropBase(rel);
    journalOut.push({ t: now(), op: 'del', rel });
    sum.deletedThere += 1;
    return true;
  }
  async function deleteHere(rel, L) { // the other computer deleted it: ours goes to data/sync/trash (recoverable)
    if (SPECIAL[rel] || L.ext) { dropBase(rel); delete state.cloud[rel]; return true; } // config / theme / renders outside the data folder are never deleted here
    if (!(await same(L.file, L))) return false;
    const dir = path.join(stateDir, 'trash', day(now()), ...rel.split('/').slice(0, -1));
    await fsp.mkdir(dir, { recursive: true });
    let dst = path.join(dir, path.basename(L.file));
    if (await exists(dst)) dst = path.join(dir, `${rand()}-${path.basename(L.file)}`);
    o.fault?.('delete-here', L.file);
    if (!(await renameRetry(L.file, dst, () => same(L.file, L)))) return false;
    delete state.local[rel]; delete state.cloud[rel]; dropBase(rel);
    sum.deletedHere += 1;
    notePulled(rel, `${kindOf(rel)}-deleted`);
    return true;
  }
  async function renameThere(from, to, C, h) { // a file renamed / moved here: moved in the cloud too (no re-upload)
    if (!(await same(C.file, { size: C.size ?? undefined, mtime: C.mtime }))) return false;
    const dst = cloudPathOf(to);
    if (await exists(dst)) return false;
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    if (!(await renameRetry(C.file, dst, async () => (await same(C.file, C)) && (await same(dst, null))))) return false;
    const st = await fsp.stat(dst);
    state.cloud[to] = [st.size, st.mtimeMs, h]; delete state.cloud[from];
    const t = S.isJsonRel(from) ? (() => { try { return fs.readFileSync(basePath(from), 'utf8'); } catch { return undefined; } })() : undefined;
    setBase(to, h, t); dropBase(from); delete state.local[from];
    journalOut.push({ t: now(), op: 'move', from, rel: to, h, s: st.size });
    sum.renamed += 1;
    return true;
  }
  async function renameHere(from, to, L, h) {
    if (SPECIAL[from] || SPECIAL[to] || L.ext) return false;
    if (!(await same(L.file, L))) return false;
    const dst = localPathOf(to);
    if (await exists(dst)) return false;
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    if (!(await renameRetry(L.file, dst, async () => (await same(L.file, L)) && (await same(dst, null))))) return false;
    const st = await fsp.stat(dst);
    state.local[to] = [st.size, st.mtimeMs, h]; delete state.local[from];
    const t = S.isJsonRel(from) ? (() => { try { return fs.readFileSync(basePath(from), 'utf8'); } catch { return undefined; } })() : undefined;
    setBase(to, h, t); dropBase(from); delete state.cloud[from];
    sum.renamed += 1;
    notePulled(from, `${kindOf(from)}-deleted`); notePulled(to, kindOf(to));
    return true;
  }

  // a copy a cloud client made ("x (conflicted copy).json", "x 2.json"): merged into x (JSON) or kept as a conflict
  async function absorbCopy(cp, local) {
    // Cloud duplicates can appear before their download has finished. Keep the
    // whole copy in place until it is ready and has stopped changing.
    if (!(await cloudReady(cp.rel, cp)) || now() - Math.floor(cp.mtime) < (o.settleMs ?? 4000)) return false;
    const L = local.get(cp.orig);
    try {
      if (S.isJsonRel(cp.orig) && !cp.placeholder && L && !L.unavailable) {
        let theirs; try { theirs = S.toCloud(S.parseJson(await fsp.readFile(cp.file, 'utf8')), ctx); } catch { return; }
        const ours = S.parseJson(await localText(cp.orig, L));
        const base = state.base[cp.orig] ? readBase(cp.orig) : null;
        const r = S.merge3(base, ours, theirs, { counters: S.isCounterRel(cp.orig) });
        const text = canon(r.value);
        if (sha(text) !== state.local[cp.orig]?.[2]) {
          keepScenesAside(cp.orig, L, r.value);
          await keepStateAside(cp.orig, L);
          const ok = await casWrite(L.file, L, localJsonText(cp.orig, S.fromCloud(r.value, ctx), L), 'absorb');
          if (!ok) return;
          remember(cp.orig, ours);
          await afterLocalWrite(cp.orig, sha(text));
          notePulled(cp.orig, kindOf(cp.orig));
        }
        if (r.conflicts.length) await saveConflict(cp.orig, { text: canon(theirs), fields: r.conflicts, from: null, oursAt: L.mtime, theirsAt: cp.mtime });
        if (!(await same(cp.file, cp))) return false;
        if (!(await moveToCloudTrash(cp.rel, cp))) return false;
        sum.merged += 1;
      } else {
        const cid = `${day(now())}-${rand()}`;
        await fsp.mkdir(CONFL, { recursive: true });
        if (!(await renameRetry(cp.file, path.join(CONFL, `${cid}-${path.basename(cp.file)}`), () => same(cp.file, cp)))) return false;
        await writeConflictRecord({ id: cid, rel: cp.orig, kind: 'file', copy: `${cid}-${path.basename(cp.file)}`, at: now(), by: 'cloud drive', from: 'a copy your cloud drive made', fields: [] });
        sum.conflicts += 1;
      }
      return true;
    } catch (err) { sum.errors += 1; log('copy', cp.rel, err.message); return false; }
  }

  // ---------- one pass ----------
  async function pass(opts = {}) {
    if (running) { again = true; return running; }
    stopping = false;
    running = (async () => {
      let r;
      do { again = false; r = await passOnce(opts); opts = {}; } while (again && !stopping);
      return r;
    })();
    try { return await running; } finally { running = null; }
  }
  async function passOnce(opts) {
    sum = counts(); pulledNow = []; texts = new Map(); hashed = new Map(); status.resumed = 0; status.bytes = 0;
    const t0 = now();
    if (heldStart) { // (round 43, datasafe) the machine / state file read now, or this pass waits
      const m = readJsonSync(machineFile); const s = readJsonSync(stateFile);
      if (m === HELD || s === HELD) return finish({ state: 'offline', error: 'held' }, t0);
      heldStart = false;
      if (m?.id) machine = { ...m, name: machine.name, platform }; else writeJsonSync(machineFile, { id: machine.id, created: machine.created });
      state = s && s.v === 1 && s.cloudRoot === cloudRoot ? s : { v: 1, cloudRoot, base: {}, local: {}, cloud: {}, ext: {}, lastPass: 0, lastOk: 0, purgedAt: 0 };
      ctx = baseCtx();
    }
    if (!(await exists(cloudRoot))) return finish({ state: 'offline', error: '' }, t0);
    if (!(await exists(FILES))) {
      if (Object.keys(state.base).length && !opts.fresh) return finish({ state: 'offline', error: 'missing' }, t0);
      await fsp.mkdir(FILES, { recursive: true });
      await atomicWrite(path.join(cloudDir, 'README.txt'), 'This folder is Hearth\'s sync copy (chats, scenes, boards, notes, settings…).\nHearth keeps working from each computer\'s own folder and copies changes here and back.\nPlease don\'t edit files here. Deleted things wait in trash/ for 30 days.\n');
    }
    if (opts.fresh) { state.base = {}; try { fs.rmSync(path.join(stateDir, 'base'), { recursive: true, force: true }); } catch { /* fine */ } }
    status.state = 'syncing'; emit();
    await readPeers();
    const local = await scanLocal();
    const { files: cloud, copies } = await scanCloud();
    const cap = o.big === false ? (o.bigCap || BIG_CAP) : Infinity;
    const plan = []; const skippedBig = []; const cloudOnly = []; const unreadable = []; let pending = 0;
    // A cloud client may briefly remove a single chat while replacing/hydrating it.
    // Absence is not deletion intent. Hearth's Delete action moves the exact chat
    // to trash/<id>.json; require that matching copy on the side that lost it.
    // A stale trash copy must not delete a newer conversation. Ordinary files keep
    // their existing deletion/rename behavior, and an unreadable trash copy is safe.
    const chatRemoved = async (rel, h, files, hash) => {
      const trashRel = chatTrashRel(rel);
      if (!trashRel) return true;
      const entry = files.get(trashRel);
      if (!entry || entry.unavailable) return false;
      try { return await hash(trashRel, entry) === h; } catch { return false; }
    };
    const rels = new Set([...local.keys(), ...cloud.keys(), ...Object.keys(state.base)]);
    // (round 43, datasafe) a file or folder that couldn't be listed / looked at on one side is unknown there this pass:
    // never "deleted" (a held chats folder on Windows looked like every chat deleted, and the cloud copy went to trash)
    const blindIn = (set, rel) => set.size > 0 && (set.has(rel) || set.has('') || [...set].some((b) => b.endsWith('/') && rel.startsWith(b)));
    for (const rel of rels) {
      if (stopping) break;
      if (S.localOnly(rel)) continue; // previously mirrored caches stay untouched on either side
      const L = local.get(rel); const C = cloud.get(rel); const bh = state.base[rel];
      if (C?.downloading) await cloudReady(rel, C);
      if (L?.unavailable) { pending += 0; continue; } // a render on a drive that isn't plugged in: left alone
      if ((!L && blindIn(local.blind, rel)) || (!C && blindIn(cloud.blind, rel))) { pending += 1; continue; }
      if (!L && !C) { dropBase(rel); delete state.local[rel]; delete state.cloud[rel]; continue; }
      // (round 19) the chats' workspace syncs what they make, never a huge file (a model checkpoint, a build archive)
      const capHere = S.isWorkspaceRel(rel) ? Math.min(cap, o.bigCap || BIG_CAP) : cap;
      if ((L && L.size > capHere) || (C && (C.size ?? 0) > capHere)) { skippedBig.push(rel); continue; }
      let lh = null; let ch = null;
      try { lh = L ? await localHash(rel, L) : null; } catch (err) { unreadable.push(rel); pending += 1; log('hash', rel, err.message); continue; }
      try { ch = C ? await cloudHash(rel, C) : null; } catch (err) { pending += 1; log('cloud hash', rel, err.message); continue; }
      if (C?.downloading && (C.cloudUnknown || ch === UNKNOWN || lh !== ch)) { pending += 1; cloudOnly.push(rel); continue; }
      if (lh === INFLIGHT || ch === INFLIGHT) { pending += 1; continue; }
      if (lh === BAD || ch === BAD) { unreadable.push(rel); pending += 1; continue; }
      if (L && C) {
        if (ch === UNKNOWN) { if (lh !== bh) { pending += 1; cloudOnly.push(rel); } continue; } // can't know without downloading
        if (lh === ch) { if (bh !== lh) setBase(rel, lh, S.isJsonRel(rel) ? await localText(rel, L) : undefined); continue; }
        if (lh === bh) plan.push({ op: readable(rel, C) ? 'pull' : 'wait', rel, L, C, h: ch });
        else if (ch === bh) plan.push({ op: 'push', rel, L, C, h: lh });
        else plan.push({ op: S.isJsonRel(rel) && !readable(rel, C) ? 'wait' : 'merge', rel, L, C, lh, ch });
      } else if (L) {
        if (bh && lh === bh && !appStore(rel) && await chatRemoved(rel, lh, cloud, cloudHash)) plan.push({ op: 'deleteHere', rel, L, h: lh });
        else plan.push({ op: 'push', rel, L, C: null, h: lh }); // new here (or changed here while deleted there: kept)
      } else {
        if (!appStore(rel) && bh && (ch === bh || (ch === UNKNOWN && state.cloud[rel] && state.cloud[rel][1] === C.mtime)) && await chatRemoved(rel, bh, local, localHash)) plan.push({ op: 'deleteThere', rel, C, h: bh });
        else if (ch === UNKNOWN || !readable(rel, C)) { cloudOnly.push(rel); pending += 1; }
        else plan.push({ op: 'pull', rel, L: null, C, h: ch }); // new there (or changed there while deleted here: kept)
      }
    }
    for (const p of plan) if (p.op === 'wait') { cloudOnly.push(p.rel); pending += 1; }
    // renames: a delete and an add of the same content become one move (big files aren't copied again)
    const live = plan.filter((p) => p.op !== 'wait');
    for (const d of live.filter((p) => p.op === 'deleteThere' && !isStub(p.C))) {
      const a = live.find((p) => p.op === 'push' && !p.C && p.h === d.h && !p.used && !state.base[p.rel]);
      if (a) { a.used = true; d.op = 'renameThere'; d.to = a.rel; }
    }
    for (const d of live.filter((p) => p.op === 'deleteHere')) {
      const a = live.find((p) => p.op === 'pull' && !p.L && p.h === d.h && !p.used && !state.base[p.rel]);
      if (a) { a.used = true; d.op = 'renameHere'; d.to = a.rel; }
    }
    const ops = live.filter((p) => !p.used);
    // many deletions at once (a folder emptied, the wrong drive): wait for a yes
    const dels = ops.filter((p) => (p.op === 'deleteHere' || p.op === 'deleteThere') && !/^trash\//.test(p.rel));
    const known = Object.keys(state.base).length;
    if (dels.length > 25 && dels.length > known * 0.3 && opts.mass !== 'apply') {
      if (opts.mass === 'keep') {
        for (const p of dels) { if (p.op === 'deleteHere') { p.op = 'push'; p.C = null; } else { p.op = 'pull'; p.L = null; } dropBase(p.rel); }
      } else {
        status.held = { deletes: dels.length, here: dels.filter((p) => p.op === 'deleteHere').length, sample: dels.slice(0, 6).map((p) => p.rel),
          // (round 19) every one by name for the review: where it would be removed, and who deleted it
          list: dels.slice(0, 300).map((p) => ({ rel: p.rel, where: p.op === 'deleteHere' ? 'here' : 'cloud', size: (p.L || p.C)?.size ?? null, by: p.op === 'deleteHere' ? nameOf(journalLatest.get(p.rel)?.m) : machine.name })) };
        for (const p of dels) p.op = 'held';
      }
    } else status.held = null;
    let n = 0;
    for (const p of ops) {
      if (stopping) break;
      if (p.op === 'held') continue;
      try {
        let ok = true;
        if (p.op === 'push') ok = await push(p.rel, p.L, p.C, p.h);
        else if (p.op === 'pull') ok = await pull(p.rel, p.L, p.C, p.h);
        else if (p.op === 'merge') ok = await merge(p.rel, p.L, p.C, p.lh, p.ch);
        else if (p.op === 'deleteHere') ok = await deleteHere(p.rel, p.L);
        else if (p.op === 'deleteThere') ok = await deleteThere(p.rel, p.C);
        else if (p.op === 'renameThere') ok = await renameThere(p.rel, p.to, p.C, p.h);
        else if (p.op === 'renameHere') ok = await renameHere(p.rel, p.to, p.L, p.h);
        if (!ok) { sum.skipped += 1; pending += 1; }
      } catch (err) {
        if (err.code === 'STOPPED') break;
        if (err.code === 'FAULT') throw err; // tests: a simulated crash
        sum.errors += 1; pending += 1; log(p.op, p.rel, err.message);
        if (!(await exists(cloudRoot))) break; // the drive went away mid-pass
      }
      if (++n % 25 === 0) saveState();
    }
    for (const cp of copies) if (!(await absorbCopy(cp, local))) { pending += 1; cloudOnly.push(cp.rel); }
    await flushJournal().catch((err) => log('journal', err.message));
    await writeMachine(false).catch(() => {});
    if (now() - (state.purgedAt || 0) > 864e5) await purge().catch(() => {});
    let conflicts = await listConflicts();
    // (round 26) settled by themselves (o.autoResolve, on by default): data merged, files newest wins, losers in the trash
    if (conflicts.length && o.autoResolve?.()) {
      const r = await resolveAll('auto').catch((err) => { log('auto-resolve', err.message); return null; });
      if (r?.done) { o.onAutoResolved?.(r); conflicts = await listConflicts(); }
    }
    const offline = !(await exists(cloudRoot));
    if (!offline && !pending && !status.held) state.lastOk = now();
    return finish({ state: offline ? 'offline' : status.held ? 'held' : conflicts.length ? 'conflict' : pending ? 'pending' : 'synced', pending, conflicts: conflicts.length, cloudOnly: cloudOnly.slice(0, 200), skippedBig, unreadable, error: '' }, t0);
  }
  function finish(patch, t0) {
    state.lastPass = now();
    saveState();
    Object.assign(status, patch, { at: now(), ms: now() - t0, last: sum, lastOk: state.lastOk });
    if (patch.state === 'offline') status.held = null;
    emit();
    if (pulledNow.length) o.onPulled?.(pulledNow.slice());
    return { ...status, pulledFiles: pulledNow.slice() };
  }
  const emit = () => o.onStatus?.(publicStatus());
  const publicStatus = () => ({ ...status, machine: { id: machine.id, name: machine.name }, cloudRoot, cloudDir, peers: peers.map((p) => ({ name: p.name, platform: p.platform, lastSeen: p.lastSeen, lastOk: p.lastOk })) });

  // ---------- trash, conflicts ----------
  async function purge() {
    state.purgedAt = now();
    const cutoff = day(now() - TRASH_DAYS * 864e5);
    for (const root of [TRASH, path.join(stateDir, 'trash')]) {
      let ds = []; try { ds = await fsp.readdir(root); } catch { continue; }
      for (const d of ds) if (/^\d{4}-\d\d-\d\d$/.test(d) && d < cutoff) await fsp.rm(path.join(root, d), { recursive: true, force: true });
    }
    // temp files of a crash (a day old) and parts of copies whose source is gone (a week old), on both sides
    const sweep = async (dir, depth = 0) => {
      let ents = []; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of ents) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) { if (depth < 8 && !['sync', 'node_modules', '.git'].includes(e.name)) await sweep(f, depth + 1); continue; }
        const tmp = /^\.hearth-tmp-/.test(e.name); const part = /^\.hearth-part-/.test(e.name);
        if (!tmp && !part) continue;
        try { const st = await fsp.stat(f); if (now() - st.mtimeMs > (tmp ? 864e5 : 7 * 864e5)) await fsp.rm(f, { force: true }); } catch { /* gone */ }
      }
    };
    await sweep(FILES); await sweep(dataDir);
  }
  async function listConflicts() {
    const out = [];
    let fl = []; try { fl = await fsp.readdir(CONFL); } catch { return out; }
    for (const f of fl) {
      if (!/^\d{4}-\d\d-\d\d-[0-9a-f]{8}\.json$/.test(f)) continue;
      try { out.push(S.parseJson(await fsp.readFile(path.join(CONFL, f), 'utf8'))); } catch { /* being written */ }
    }
    return out.sort((a, b) => b.at - a.at);
  }
  // keep = 'mine'   this computer's version stays; the other one goes to the synced trash under its own name
  //        'theirs' the other computer's version replaces this one; this one goes to this computer's trash first
  //        'both'   both stay: the other one is saved next to it as "… (from MacBook)" (whole files and chats)
  //        'merge'  data (JSON): everything from both, the newer side winning where they differ (this one to the trash first)
  // (round 19) every choice can be undone from Deleted files: the version that lost is there under its real name.
  async function resolve(id, keep) {
    const rec = (await listConflicts()).find((c) => c.id === id);
    if (!rec) return { ok: false, error: 'No such conflict' };
    const copy = path.join(CONFL, rec.copy);
    const file = localPathOf(rec.rel);
    const isJson = rec.kind === 'json';
    const theirsValue = async () => S.parseJson(await fsp.readFile(copy, 'utf8')); // cloud form
    const oursValue = () => { const v = S.parseJson(fs.readFileSync(file, 'utf8')); return S.toCloud(rec.rel === 'app/config.json' ? S.portableConfig(v) : v, ctx); };
    let made = null;
    if (keep === 'theirs' || keep === 'merge') {
      if (keep === 'merge' && !isJson) return { ok: false, error: 'Only data (chats, scenes, settings…) can be merged; pictures and files are one version or the other.' };
      let ours = null;
      if (isJson) { try { ours = oursValue(); remember(rec.rel, ours); } catch { /* none here */ } }
      await keepHere(rec.rel, file);
      if (isJson) {
        let v = await theirsValue();
        if (keep === 'merge' && ours) {
          const theirsNewer = (rec.theirsAt || 0) > (rec.oursAt || 0);
          v = S.merge3(null, theirsNewer ? v : ours, theirsNewer ? ours : v, { counters: S.isCounterRel(rec.rel) }).value;
        }
        await atomicWrite(file, localJsonText(rec.rel, S.fromCloud(v, ctx), statSync(file) ? { file } : null));
      } else {
        // (a copy whose content is still only in the cloud downloads now: this choice asks for it)
        const tmp = path.join(path.dirname(file), `.hearth-tmp-${rand()}-${path.basename(file)}`);
        await fsp.mkdir(path.dirname(file), { recursive: true });
        await fsp.copyFile(copy, tmp);
        await flushed(tmp); await renameRetry(tmp, file);
      }
      notePulled(rec.rel, kindOf(rec.rel));
    } else if (keep === 'both') {
      const from = String(rec.from || 'the other computer').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40);
      if (isJson) {
        const m = /^chats\/(.+)\.json$/.exec(rec.rel);
        if (!m) return { ok: false, error: 'Keep both works for chats, pictures and files; for this one pick a version, or Merge.' };
        const v = S.fromCloud(await theirsValue(), ctx);
        const nid = `${m[1].slice(0, 40)}-${rand().slice(0, 5)}`;
        made = `chats/${nid}.json`;
        await atomicWrite(localPathOf(made), localForm({ ...v, ...(v && 'id' in v ? { id: nid } : {}), title: `${v?.title || 'Chat'} (from ${from})` }, true));
      } else {
        const ext = path.extname(rec.rel); const stem = rec.rel.slice(0, rec.rel.length - ext.length);
        made = `${stem} (from ${from})${ext}`;
        for (let i = 2; await exists(localPathOf(made)); i++) made = `${stem} (from ${from} ${i})${ext}`;
        const dst = localPathOf(made);
        const tmp = path.join(path.dirname(dst), `.hearth-tmp-${rand()}-${path.basename(dst)}`);
        await fsp.mkdir(path.dirname(dst), { recursive: true });
        await fsp.copyFile(copy, tmp);
        await flushed(tmp); await renameRetry(tmp, dst);
      }
      notePulled(made, kindOf(made));
    }
    // keep 'mine': the other version goes to the synced trash under its real name (restorable); the record is put away
    if (keep !== 'theirs' && keep !== 'merge' && keep !== 'both') {
      const tdir = path.join(TRASH, day(now()), ...rec.rel.split('/').slice(0, -1));
      await fsp.mkdir(tdir, { recursive: true });
      let dst = path.join(tdir, path.basename(rec.rel));
      if (await exists(dst)) dst = path.join(tdir, `${rand()}-${path.basename(rec.rel)}`);
      try { await renameRetry(copy, dst); } catch { /* gone */ }
    }
    const dir = path.join(TRASH, day(now()), 'conflicts');
    await fsp.mkdir(dir, { recursive: true });
    for (const f of [rec.copy, `${rec.id}.json`]) { try { await renameRetry(path.join(CONFL, f), path.join(dir, f)); } catch { /* gone */ } }
    if (pulledNow.length) { o.onPulled?.(pulledNow.slice()); pulledNow = []; }
    return { ok: true, rel: rec.rel, made };
  }
  // (round 26) the owner: "try and resolve conflicts by yourself, or give me the option to clear them all".
  // auto: data (chats, scenes, settings) merges: everything from both, the newer side winning where a field differs;
  // whole files (pictures, videos): the newer one wins. 'newest' / 'mine' / 'theirs' apply that to every conflict.
  // Every loser waits in Deleted files (30 days), as with a choice made by hand.
  const newerSide = (rec) => ((rec.theirsAt || 0) > (rec.oursAt || 0) ? 'theirs' : 'mine');
  const autoPick = (rec) => (rec.kind === 'json' ? 'merge' : newerSide(rec));
  async function resolveAll(mode = 'auto') {
    const out = { done: 0, failed: 0, by: {}, rels: [] };
    for (const rec of await listConflicts()) {
      let keep = mode === 'auto' ? autoPick(rec) : mode === 'newest' ? newerSide(rec) : mode === 'theirs' ? 'theirs' : 'mine';
      let r = await resolve(rec.id, keep).catch((err) => ({ ok: false, error: err.message }));
      if (!r?.ok && keep === 'merge') { keep = newerSide(rec); r = await resolve(rec.id, keep).catch((err) => ({ ok: false, error: err.message })); }
      if (r?.ok) { out.done += 1; out.by[keep] = (out.by[keep] || 0) + 1; out.rels.push(rec.rel); } else { out.failed += 1; log('resolve-all', rec.rel, r?.error); }
    }
    return out;
  }
  // this computer's version, before a choice replaces it: a copy in data/sync/trash under its real name (Deleted files)
  async function keepHere(rel, file) {
    if (!statSync(file)) return;
    const dir = path.join(stateDir, 'trash', day(now()), ...rel.split('/').slice(0, -1));
    await fsp.mkdir(dir, { recursive: true });
    let dst = path.join(dir, path.basename(file));
    if (await exists(dst)) dst = path.join(dir, `${rand()}-${path.basename(file)}`);
    await fsp.copyFile(file, dst);
  }
  // (round 19) what a conflict is about, for the choice: both versions (JSON values, or the files' paths), sizes, times
  async function preview(id) {
    const rec = (await listConflicts()).find((c) => c.id === id);
    if (!rec) return null;
    const file = localPathOf(rec.rel); const copy = path.join(CONFL, rec.copy);
    const out = { ...rec, here: file, there: copy, oursAt: rec.oursAt || statSync(file)?.mtimeMs || null, theirsAt: rec.theirsAt || null, canMerge: rec.kind === 'json', canBoth: rec.kind !== 'json' || /^chats\//.test(rec.rel) };
    const read = (f, cloudForm) => { try { const st = statSync(f); if (!st || st.size > 6e6) return null; const v = S.parseJson(fs.readFileSync(f, 'utf8')); return cloudForm ? S.fromCloud(v, ctx) : v; } catch { return null; } };
    if (rec.kind === 'json') { out.ours = read(file, false); out.theirs = read(copy, true); } else { out.size = statSync(file)?.size ?? rec.size ?? null; out.theirsSize = statSync(copy)?.size ?? rec.theirsSize ?? null; }
    return out;
  }
  // (round 19) is this data-folder file on its way from the other computer? (in the cloud copy, or in its journal)
  function incoming(rel) {
    if (!rel || S.localOnly(rel)) return null;
    const C = cloudPathOf(rel);
    const stub = path.join(path.dirname(C), `.${path.basename(C)}.icloud`);
    const j = journalLatest.get(rel);
    if (statSync(C) || statSync(stub)) return { from: nameOf(j?.m), inCloud: true };
    if (j && j.op !== 'del') return { from: nameOf(j.m), inCloud: false };
    return null;
  }
  async function listTrash() {
    const out = [];
    const add = async (root, where) => {
      let ds = []; try { ds = await fsp.readdir(root); } catch { return; }
      for (const d of ds.filter((x) => /^\d{4}-\d\d-\d\d$/.test(x)).sort().reverse()) {
        await walk(path.join(root, d), async (e, r) => { if (e.isFile() && !r.startsWith('conflicts/')) out.push({ id: `${where}:${d}/${r}`, rel: r.replace(/(^|\/)\.([^/]+)\.icloud$/, '$1$2'), day: d, where }); });
      }
    };
    await add(TRASH, 'cloud');
    await add(path.join(stateDir, 'trash'), 'here');
    await walk(path.join(stateDir,'recovery'),async(e,r)=>{if(e.isFile())out.push({id:`recovery:${r}`,rel:r,where:'recovery',recovery:true,day:'Before last sync'});});
    return out.sort((a,b)=>Number(Boolean(b.recovery))-Number(Boolean(a.recovery)));
  }
  async function restore(id, ro = {}) {
    const recovery=/^recovery:(.+)$/.exec(String(id));
    const m = recovery ? [id,'recovery','',recovery[1]] : /^(cloud|here):(\d{4}-\d\d-\d\d)\/(.+)$/.exec(String(id));
    if (!m) return { ok: false, error: 'Not a trash item' };
    const [, where, d, r] = m;
    if (r.split(/[\\/]/).some(p=>!p||p==='.'||p==='..'||p.includes(':'))) return {ok:false,error:'Invalid recovery path'};
    const src = path.join(where === 'cloud' ? TRASH : path.join(stateDir, where === 'recovery'?'recovery':'trash'), d, ...r.split('/'));
    const rel = recovery ? r : r.replace(/(^|\/)\.([^/]+)\.icloud$/, '$1$2').replace(/(^|\/)[0-9a-f]{8}-([^/]+)$/, '$1$2');
    const dst = localPathOf(rel);
    if (await exists(dst)) {
      if (!ro.replace) return { ok: false, error: `${rel} is already there`, exists: true };
      await keepHere(rel, dst); // (round 19) undoing a choice: the version in place goes to the trash first
    }
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    const tmp = path.join(path.dirname(dst), `.hearth-tmp-${rand()}-${path.basename(dst)}`);
    if (S.isJsonRel(rel)) { const v = S.parseJson(await fsp.readFile(src, 'utf8')); await fsp.writeFile(tmp, localForm(S.fromCloud(v, ctx), true)); } else await fsp.copyFile(src, tmp);
    await flushed(tmp); await renameRetry(tmp, dst);
    await fsp.rm(src, { force: true });
    o.onPulled?.([{ rel, kind: kindOf(rel), from: 'trash' }]);
    return { ok: true, rel };
  }

  // ---------- the write guard ----------
  // After a pull, the app may still hold the older version in memory and save it again: that save is merged with what
  // arrived (three-way, the older version as base) so the other computer's changes aren't undone.
  function guardWrite(file, value) {
    const rel = relOfLocal(file);
    if (!rel || !pulledPrev.has(rel)) return value;
    let disk; try { disk = S.parseJson(fs.readFileSync(file, 'utf8')); } catch { return value; }
    const isCfg = rel === 'app/config.json';
    const ours = S.toCloud(isCfg ? S.portableConfig(value) : value, ctx);
    const theirs = S.toCloud(isCfg ? S.portableConfig(disk) : disk, ctx);
    const r = S.merge3(pulledPrev.get(rel), ours, theirs, { counters: S.isCounterRel(rel) });
    const merged = S.fromCloud(r.value, ctx);
    return isCfg ? S.applyPortable(value, merged) : merged;
  }

  function readJsonSync(f) { try { return S.parseJson(SS.readRetry(fs, f)); } catch (err) { return err?.code && SS.BUSY.has(err.code) ? HELD : null; } }
  function writeJsonSync(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${rand()}.tmp`; fs.writeFileSync(t, JSON.stringify(v)); fs.renameSync(t, f); }

  return {
    pass, stop: () => { stopping = true; }, status: publicStatus, set: (patch) => Object.assign(o, patch), option: (k) => o[k], machine: () => ({ ...machine }),
    conflicts: listConflicts, resolve, resolveAll, preview, incoming, trash: listTrash, restore, guardWrite, relOfLocal,
    ackPulled: (rels) => { if (!rels) pulledPrev.clear(); else for (const r of rels) pulledPrev.delete(r); },
    hasPulled: (rel) => pulledPrev.has(rel),
    peers: async () => { await readPeers(); return peers; },
    cloudDir, FILES, stateDir, ctx: () => ctx,
    _state: () => state,
  };
}

// Is there a Hearth already in this drive? → { machines: [{ name, platform, lastSeen }], files } or null
function hearthIn(cloudRoot) {
  const dir = path.join(cloudRoot, 'Hearth');
  if (!fs.existsSync(path.join(dir, 'files'))) return null;
  const machines = [];
  try {
    for (const f of fs.readdirSync(path.join(dir, '.sync', 'machines'))) {
      try { const j = S.parseJson(fs.readFileSync(path.join(dir, '.sync', 'machines', f), 'utf8')); if (f === `${j.id}.json`) machines.push({ id: j.id, name: j.name, platform: j.platform, lastSeen: j.lastSeen }); } catch { /* skip */ }
    }
  } catch { /* none */ }
  return { dir, machines, lastSeen: Math.max(0, ...machines.map((m) => m.lastSeen || 0)) };
}

module.exports = { createEngine, hearthIn, SMALL, BIG_CAP };
