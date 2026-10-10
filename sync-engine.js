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

const SMALL = 8 * 1024 * 1024; // up to this, files are read whole (hash + copy); bigger ones stream
const BIG_CAP = 100 * 1024 * 1024; // with "Sync big videos" off, bigger files stay on each computer
const JSON_MAX = 96 * 1024 * 1024;
const TRASH_DAYS = 30;
const INFLIGHT = 'inflight'; const UNKNOWN = 'unknown'; const BAD = 'bad';
const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const day = (t) => new Date(t).toISOString().slice(0, 10);
const rand = () => crypto.randomBytes(4).toString('hex');
const nfc = (s) => s.normalize('NFC');

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
async function renameRetry(from, to, check) {
  for (let i = 0; ; i++) {
    if (check && !check()) return false;
    try { fs.renameSync(from, to); return true; } catch (err) {
      if (i >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      await new Promise((r) => setTimeout(r, 120 * (i + 1)));
    }
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
  if (!machine?.id) {
    machine = { id: `${(o.machineName || os.hostname()).replace(/[^\w-]+/g, '').slice(0, 20) || 'pc'}-${rand()}`, created: now() };
    writeJsonSync(machineFile, machine);
  }
  machine.name = o.machineName || os.hostname();
  machine.platform = platform;

  // ---------- state ----------
  const stateFile = path.join(stateDir, 'state.json');
  let state = readJsonSync(stateFile);
  if (!state || state.v !== 1 || state.cloudRoot !== cloudRoot) {
    // a new drive (or the first time): no base, so the first pass merges both sides without overwriting either
    state = { v: 1, cloudRoot, base: {}, local: {}, cloud: {}, ext: {}, lastPass: 0, lastOk: 0, purgedAt: 0 };
    try { fs.rmSync(path.join(stateDir, 'base'), { recursive: true, force: true }); } catch { /* fine */ }
  }
  const saveState = () => writeJsonSync(stateFile, state);
  const basePath = (rel) => path.join(stateDir, 'base', ...rel.split('/'));
  function readBase(rel) { try { return JSON.parse(fs.readFileSync(basePath(rel), 'utf8')); } catch { return null; } }
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
  async function walk(root, fn, rel = '') {
    let ents;
    try { ents = await fsp.readdir(rel ? path.join(root, ...rel.split('/')) : root, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!S.dirLocalOnly(nfc(r)) && !S.localOnly(`${nfc(r)}/x`)) await walk(root, fn, r); continue; }
      await fn(e, r);
    }
  }
  async function scanLocal() {
    const out = new Map();
    await walk(dataDir, async (e, r) => {
      if (!e.isFile() || S.ignoredName(e.name) || S.localOnly(nfc(r))) return;
      const file = path.join(dataDir, ...r.split('/'));
      try { const st = await fsp.stat(file); out.set(nfc(r), { file, size: st.size, mtime: st.mtimeMs }); } catch { /* gone */ }
    });
    for (const [rel, file] of Object.entries(SPECIAL)) {
      if (!file) continue;
      try { const st = await fsp.stat(file); out.set(rel, { file, size: st.size, mtime: st.mtimeMs }); } catch { /* none */ }
    }
    // renders saved outside the data folder (Video Review exports, Lab recordings), listed in kv/video-library
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
    try { data = st ? JSON.parse(fs.readFileSync(lib, 'utf8')) : {}; } catch { return; } // unreadable now: keep the list
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
  const JSON_COPY = /^([\w-]+)(?: \d+| \(\d+\))\.json$/; // iCloud "x 2.json", Google Drive "x (1).json"
  async function scanCloud() {
    const out = new Map(); const copies = [];
    const hosts = new Set([machine.name, ...peers.map((p) => p.name)].filter(Boolean).map((n) => String(n).toUpperCase().replace(/\.LOCAL$/, '')));
    await walk(FILES, async (e, r) => {
      if (!e.isFile()) return;
      let name = e.name; let placeholder = false;
      const stub = /^\.(.+)\.icloud$/.exec(name);
      if (stub) { name = stub[1]; placeholder = true; } else if (S.ignoredName(name)) return;
      const rel = nfc(r.replace(/[^/]+$/, name));
      if (S.localOnly(rel)) return;
      const file = path.join(FILES, ...r.split('/'));
      let st; try { st = await fsp.stat(file); } catch { return; }
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
      if (orig && orig !== rel && !state.base[rel]) { copies.push({ rel, orig, ...ent }); return; }
      out.set(rel, ent);
    });
    return { files: out, copies };
  }

  // ---------- peers and journals ----------
  let peers = [];
  const journalLatest = new Map(); // rel → { h, s, t, m } (other computers' newest entry)
  const journalSeen = {};
  async function readPeers() {
    const list = [];
    try {
      for (const f of await fsp.readdir(path.join(META, 'machines'))) {
        if (!f.endsWith('.json')) continue;
        try { const j = JSON.parse(await fsp.readFile(path.join(META, 'machines', f), 'utf8')); if (j.id && j.id !== machine.id) list.push(j); } catch { /* being written */ }
      }
    } catch { /* none yet */ }
    peers = list;
    const al = { data: [], cloud: [], home: [] };
    for (const p of list) { if (p.dataDir) al.data.push(p.dataDir); if (p.cloudRoot) al.cloud.push(p.cloudRoot); if (p.home) al.home.push(p.home); }
    if (JSON.stringify(al) !== JSON.stringify(aliases)) { aliases = al; ctx = baseCtx(); }
    try {
      for (const f of await fsp.readdir(path.join(META, 'journal'))) {
        if (!f.endsWith('.jsonl') || f === `${machine.id}.jsonl`) continue;
        const file = path.join(META, 'journal', f);
        let st; try { st = await fsp.stat(file); } catch { continue; }
        const key = `${st.size}:${st.mtimeMs}`;
        if (journalSeen[f] === key) continue;
        journalSeen[f] = key;
        let text = ''; try { text = await fsp.readFile(file, 'utf8'); } catch { continue; }
        const mid = f.slice(0, -6);
        for (const line of text.split('\n')) {
          if (!line) continue;
          let j; try { j = JSON.parse(line); } catch { continue; }
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
  async function atomicWrite(file, data) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), `.hearth-tmp-${rand()}-${path.basename(file)}`);
    await fsp.writeFile(tmp, data);
    try { await renameRetry(tmp, file); } catch (err) { await fsp.rm(tmp, { force: true }); throw err; }
  }
  // the check right before a rename: the file is still the one this pass looked at (or still absent)
  const same = (file, ent) => {
    const st = statSync(file);
    if (!ent) return !st;
    return Boolean(st) && st.size === (ent.size ?? st.size) && st.mtimeMs === ent.mtime;
  };
  async function casWrite(file, ent, data, fault) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), `.hearth-tmp-${rand()}-${path.basename(file)}`);
    await fsp.writeFile(tmp, data);
    o.fault?.(fault, file);
    let ok = false;
    try { ok = await renameRetry(tmp, file, () => same(file, ent)); } finally { if (!ok) await fsp.rm(tmp, { force: true }).catch(() => {}); }
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
  const arriving = new Map(); // rel → { size, mtime, since }: a cloud file whose size doesn't match its journal yet
  async function localHash(rel, L) {
    const c = state.local[rel];
    if (c && c[0] === L.size && c[1] === L.mtime && c[2]) return c[2];
    let h;
    if (S.isJsonRel(rel) && L.size <= JSON_MAX) {
      const text = await fsp.readFile(L.file, 'utf8');
      let v;
      try { v = JSON.parse(text); } catch { return now() - L.mtime < 5000 ? INFLIGHT : BAD; }
      if (rel === 'app/config.json') v = S.portableConfig(v);
      const t = canon(S.toCloud(v, ctx));
      if (t.length < 2e6) texts.set(`l:${rel}`, t);
      h = sha(t);
    } else if (L.size <= SMALL) h = sha(await fsp.readFile(L.file));
    else h = await hashFile(L.file, () => stopping);
    state.local[rel] = [L.size, L.mtime, h];
    return h;
  }
  async function localText(rel, L) {
    if (texts.has(`l:${rel}`)) return texts.get(`l:${rel}`);
    let v = JSON.parse(await fsp.readFile(L.file, 'utf8'));
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
    if (!C.placeholder) return true;
    if (isStub(C)) { const j = journalLatest.get(rel); if (!j || (j.s ?? 0) <= SMALL || o.allowDownload?.has(rel)) o.requestDownload?.(C.file, rel); return false; }
    return (C.size ?? 0) <= SMALL || Boolean(o.allowDownload?.has(rel));
  }
  async function cloudHash(rel, C) {
    const c = state.cloud[rel];
    const j = journalLatest.get(rel);
    if (C.placeholder && !readable(rel, C)) {
      if (c && c[2] && (C.size === null || c[0] === C.size) && (!j || j.h === c[2] || j.t < (state.lastOk || 0))) return c[2];
      return j && (C.size === null || j.s === C.size) ? j.h : UNKNOWN;
    }
    if (c && c[0] === C.size && c[1] === C.mtime && c[2]) return c[2];
    if (now() - C.mtime < (o.settleMs ?? 2000)) return INFLIGHT; // still being written
    // not the size the other computer wrote: still arriving (a cloud client writing in place), unless it stays like
    // this for a minute (then the journal is the one late, and the file is what it is)
    if (j && j.op !== 'del' && j.s !== C.size && now() - j.t < 30 * 60 * 1000) {
      const seen = arriving.get(rel);
      if (!seen || seen.size !== C.size || seen.mtime !== C.mtime) { arriving.set(rel, { size: C.size, mtime: C.mtime, since: now() }); return INFLIGHT; }
      if (now() - seen.since < (o.stableMs ?? 60000)) return INFLIGHT;
    }
    let h;
    if (S.isJsonRel(rel) && C.size <= JSON_MAX) {
      let v;
      try { v = JSON.parse(await fsp.readFile(C.file, 'utf8')); } catch { return now() - C.mtime < 30 * 60 * 1000 ? INFLIGHT : BAD; }
      const t = canon(v);
      if (t.length < 2e6) texts.set(`c:${rel}`, t);
      h = sha(t);
    } else if (C.size > SMALL && j && j.s === C.size && j.h) h = j.h;
    else if (C.size <= SMALL) h = sha(await fsp.readFile(C.file));
    else h = await hashFile(C.file, () => stopping);
    state.cloud[rel] = [C.size, C.mtime, h];
    return h;
  }
  async function cloudText(rel, C) {
    if (texts.has(`c:${rel}`)) return texts.get(`c:${rel}`);
    const t = canon(JSON.parse(await fsp.readFile(C.file, 'utf8')));
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
      let cur = {}; try { cur = JSON.parse(fs.readFileSync(SPECIAL[rel], 'utf8')); } catch { /* none */ }
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
    const st = statSync(cloudPathOf(rel));
    if (st) state.cloud[rel] = [st.size, st.mtimeMs, h];
    journalOut.push({ t: now(), op: 'put', rel, h, s: st?.size });
  }

  async function push(rel, L, C, h) {
    const dst = C?.file && !/\.icloud$/.test(C.file) ? C.file : cloudPathOf(rel);
    const cent = C ? { size: C.size, mtime: C.mtime } : null;
    if (C?.placeholder && /\.icloud$/.test(C.file || '')) { // replacing an iCloud stub: move it aside first
      await moveToCloudTrash(rel, C);
    }
    const target = C?.placeholder && /\.icloud$/.test(C.file || '') ? null : cent;
    let ok;
    if (S.isJsonRel(rel)) {
      const text = await localText(rel, L);
      if (sha(text) !== h) return false;
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
      const value = S.toCloud(JSON.parse(text), ctx); // (old paths of another computer written as-is are fixed too)
      const prev = L ? await localText(rel, L).catch(() => null) : null;
      ok = await casWrite(file, lent, localJsonText(rel, S.fromCloud(value, ctx), L), 'pull');
      if (ok) {
        setBase(rel, h, text);
        remember(rel, prev === null ? null : JSON.parse(prev), prev ? prev.length : 0);
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
    let v = JSON.parse(fs.readFileSync(localPathOf(rel), 'utf8'));
    if (rel === 'app/config.json') v = S.portableConfig(v);
    return sha(canon(S.toCloud(v, ctx)));
  }
  const kindOf = (rel) => (rel.startsWith('chats/') ? 'chat' : rel.startsWith('kv/') ? 'kv' : rel === 'app/config.json' ? 'config' : rel === 'app/theme.css' ? 'theme' : rel === 'memory.json' ? 'memory' : 'file');

  // both changed (or the first join): merge JSON, keep both copies of anything else
  async function merge(rel, L, C, lh, ch) {
    const lent = { size: L.size, mtime: L.mtime };
    const cent = { size: C.size, mtime: C.mtime };
    if (S.isJsonRel(rel) && lh !== BAD && ch !== BAD) {
      const ours = JSON.parse(await localText(rel, L));
      const theirsText = await cloudText(rel, C);
      const theirs = S.toCloud(JSON.parse(theirsText), ctx);
      const base = state.base[rel] ? readBase(rel) : null;
      const r = S.merge3(base, ours, theirs, { counters: S.isCounterRel(rel) });
      const text = canon(r.value);
      const hm = sha(text);
      // this computer first, then the cloud: a cloud write that loses its race leaves the old base, so the next pass
      // merges again instead of pushing a version that misses the other computer's changes
      if (hm !== lh) {
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
      if (r.conflicts.length) await saveConflict(rel, { kind: 'json', text: theirsText, fields: r.conflicts, from: journalLatest.get(rel)?.m });
      sum.merged += 1;
      return true;
    }
    // whole files: ours stays in place, theirs is kept as a conflict copy (moved inside the cloud, nothing downloads)
    const cid = `${day(now())}-${rand()}`;
    const copy = path.join(CONFL, `${cid}-${path.basename(C.file)}`);
    await fsp.mkdir(CONFL, { recursive: true });
    if (!same(C.file, C.placeholder ? { size: C.size ?? undefined, mtime: C.mtime } : cent)) return false;
    await renameRetry(C.file, copy);
    delete state.cloud[rel];
    await writeConflictRecord({ id: cid, rel, kind: 'file', copy: path.basename(copy), at: now(), by: machine.name, from: nameOf(journalLatest.get(rel)?.m), fields: [] });
    sum.conflicts += 1;
    return push(rel, L, null, lh);
  }
  async function saveConflict(rel, { text, fields, from }) {
    const cid = `${day(now())}-${rand()}`;
    await atomicWrite(path.join(CONFL, `${cid}.copy.json`), text);
    await writeConflictRecord({ id: cid, rel, kind: 'json', copy: `${cid}.copy.json`, at: now(), by: machine.name, from: nameOf(from), fields: fields.slice(0, 20) });
    sum.conflicts += 1;
  }
  async function writeConflictRecord(rec) { await atomicWrite(path.join(CONFL, `${rec.id}.json`), JSON.stringify(rec, null, 2)); }

  async function moveToCloudTrash(rel, C) {
    const dir = path.join(TRASH, day(now()), ...rel.split('/').slice(0, -1));
    await fsp.mkdir(dir, { recursive: true });
    let dst = path.join(dir, path.basename(C.file));
    if (await exists(dst)) dst = path.join(dir, `${rand()}-${path.basename(C.file)}`);
    await renameRetry(C.file, dst);
  }
  async function deleteThere(rel, C) { // this computer deleted it: the cloud copy goes to the synced trash
    if (!same(C.file, { size: C.size ?? undefined, mtime: C.mtime })) return false;
    await moveToCloudTrash(rel, C);
    delete state.cloud[rel]; delete state.local[rel]; dropBase(rel);
    journalOut.push({ t: now(), op: 'del', rel });
    sum.deletedThere += 1;
    return true;
  }
  async function deleteHere(rel, L) { // the other computer deleted it: ours goes to data/sync/trash (recoverable)
    if (SPECIAL[rel] || L.ext) { dropBase(rel); delete state.cloud[rel]; return true; } // config / theme / renders outside the data folder are never deleted here
    if (!same(L.file, L)) return false;
    const dir = path.join(stateDir, 'trash', day(now()), ...rel.split('/').slice(0, -1));
    await fsp.mkdir(dir, { recursive: true });
    let dst = path.join(dir, path.basename(L.file));
    if (await exists(dst)) dst = path.join(dir, `${rand()}-${path.basename(L.file)}`);
    o.fault?.('delete-here', L.file);
    await renameRetry(L.file, dst);
    delete state.local[rel]; delete state.cloud[rel]; dropBase(rel);
    sum.deletedHere += 1;
    notePulled(rel, `${kindOf(rel)}-deleted`);
    return true;
  }
  async function renameThere(from, to, C, h) { // a file renamed / moved here: moved in the cloud too (no re-upload)
    if (!same(C.file, { size: C.size ?? undefined, mtime: C.mtime })) return false;
    const dst = cloudPathOf(to);
    if (await exists(dst)) return false;
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await renameRetry(C.file, dst);
    const st = statSync(dst);
    state.cloud[to] = [st.size, st.mtimeMs, h]; delete state.cloud[from];
    const t = S.isJsonRel(from) ? (() => { try { return fs.readFileSync(basePath(from), 'utf8'); } catch { return undefined; } })() : undefined;
    setBase(to, h, t); dropBase(from); delete state.local[from];
    journalOut.push({ t: now(), op: 'move', from, rel: to, h, s: st.size });
    sum.renamed += 1;
    return true;
  }
  async function renameHere(from, to, L, h) {
    if (SPECIAL[from] || SPECIAL[to] || L.ext) return false;
    if (!same(L.file, L)) return false;
    const dst = localPathOf(to);
    if (await exists(dst)) return false;
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    await renameRetry(L.file, dst);
    const st = statSync(dst);
    state.local[to] = [st.size, st.mtimeMs, h]; delete state.local[from];
    const t = S.isJsonRel(from) ? (() => { try { return fs.readFileSync(basePath(from), 'utf8'); } catch { return undefined; } })() : undefined;
    setBase(to, h, t); dropBase(from); delete state.cloud[from];
    sum.renamed += 1;
    notePulled(from, `${kindOf(from)}-deleted`); notePulled(to, kindOf(to));
    return true;
  }

  // a copy a cloud client made ("x (conflicted copy).json", "x 2.json"): merged into x (JSON) or kept as a conflict
  async function absorbCopy(cp, local) {
    const L = local.get(cp.orig);
    try {
      if (S.isJsonRel(cp.orig) && !cp.placeholder && L && !L.unavailable) {
        let theirs; try { theirs = S.toCloud(JSON.parse(await fsp.readFile(cp.file, 'utf8')), ctx); } catch { return; }
        const ours = JSON.parse(await localText(cp.orig, L));
        const base = state.base[cp.orig] ? readBase(cp.orig) : null;
        const r = S.merge3(base, ours, theirs, { counters: S.isCounterRel(cp.orig) });
        const text = canon(r.value);
        if (sha(text) !== state.local[cp.orig]?.[2]) {
          const ok = await casWrite(L.file, L, localJsonText(cp.orig, S.fromCloud(r.value, ctx), L), 'absorb');
          if (!ok) return;
          remember(cp.orig, ours);
          await afterLocalWrite(cp.orig, sha(text));
          notePulled(cp.orig, kindOf(cp.orig));
        }
        if (r.conflicts.length) await saveConflict(cp.orig, { text: canon(theirs), fields: r.conflicts, from: null });
        await moveToCloudTrash(cp.rel, cp);
        sum.merged += 1;
      } else {
        const cid = `${day(now())}-${rand()}`;
        await fsp.mkdir(CONFL, { recursive: true });
        await renameRetry(cp.file, path.join(CONFL, `${cid}-${path.basename(cp.file)}`));
        await writeConflictRecord({ id: cid, rel: cp.orig, kind: 'file', copy: `${cid}-${path.basename(cp.file)}`, at: now(), by: 'cloud drive', from: 'a copy your cloud drive made', fields: [] });
        sum.conflicts += 1;
      }
    } catch (err) { sum.errors += 1; log('copy', cp.rel, err.message); }
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
    sum = counts(); pulledNow = []; texts = new Map(); status.resumed = 0; status.bytes = 0;
    const t0 = now();
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
    const rels = new Set([...local.keys(), ...cloud.keys(), ...Object.keys(state.base)]);
    for (const rel of rels) {
      if (stopping) break;
      const L = local.get(rel); const C = cloud.get(rel); const bh = state.base[rel];
      if (L?.unavailable) { pending += 0; continue; } // a render on a drive that isn't plugged in: left alone
      if (!L && !C) { dropBase(rel); delete state.local[rel]; delete state.cloud[rel]; continue; }
      if ((L && L.size > cap) || (C && (C.size ?? 0) > cap)) { skippedBig.push(rel); continue; }
      let lh = null; let ch = null;
      try { lh = L ? await localHash(rel, L) : null; } catch (err) { unreadable.push(rel); log('hash', rel, err.message); continue; }
      try { ch = C ? await cloudHash(rel, C) : null; } catch (err) { pending += 1; log('cloud hash', rel, err.message); continue; }
      if (lh === INFLIGHT || ch === INFLIGHT) { pending += 1; continue; }
      if (lh === BAD || ch === BAD) { unreadable.push(rel); continue; }
      if (L && C) {
        if (ch === UNKNOWN) { if (lh !== bh) { pending += 1; cloudOnly.push(rel); } continue; } // can't know without downloading
        if (lh === ch) { if (bh !== lh) setBase(rel, lh, S.isJsonRel(rel) ? await localText(rel, L) : undefined); continue; }
        if (lh === bh) plan.push({ op: readable(rel, C) ? 'pull' : 'wait', rel, L, C, h: ch });
        else if (ch === bh) plan.push({ op: 'push', rel, L, C, h: lh });
        else plan.push({ op: S.isJsonRel(rel) && !readable(rel, C) ? 'wait' : 'merge', rel, L, C, lh, ch });
      } else if (L) {
        if (bh && lh === bh) plan.push({ op: 'deleteHere', rel, L, h: lh });
        else plan.push({ op: 'push', rel, L, C: null, h: lh }); // new here (or changed here while deleted there: kept)
      } else {
        if (bh && (ch === bh || (ch === UNKNOWN && state.cloud[rel] && state.cloud[rel][1] === C.mtime))) plan.push({ op: 'deleteThere', rel, C, h: bh });
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
        status.held = { deletes: dels.length, here: dels.filter((p) => p.op === 'deleteHere').length, sample: dels.slice(0, 6).map((p) => p.rel) };
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
    for (const cp of copies) await absorbCopy(cp, local);
    await flushJournal().catch((err) => log('journal', err.message));
    await writeMachine(false).catch(() => {});
    if (now() - (state.purgedAt || 0) > 864e5) await purge().catch(() => {});
    const conflicts = await listConflicts();
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
        if (e.isDirectory()) { if (depth < 8 && !['sync', 'workspace', 'node_modules', '.git'].includes(e.name)) await sweep(f, depth + 1); continue; }
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
      try { out.push(JSON.parse(await fsp.readFile(path.join(CONFL, f), 'utf8'))); } catch { /* being written */ }
    }
    return out.sort((a, b) => b.at - a.at);
  }
  // keep = 'mine' (dismiss: the version in place stays) | 'theirs' (the kept copy replaces the version in place)
  async function resolve(id, keep) {
    const rec = (await listConflicts()).find((c) => c.id === id);
    if (!rec) return { ok: false, error: 'No such conflict' };
    const copy = path.join(CONFL, rec.copy);
    if (keep === 'theirs') {
      const file = localPathOf(rec.rel);
      if (S.isJsonRel(rec.rel)) { try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); remember(rec.rel, S.toCloud(rec.rel === 'app/config.json' ? S.portableConfig(v) : v, ctx)); } catch { /* none */ } }
      if (rec.kind === 'json') {
        const v = JSON.parse(await fsp.readFile(copy, 'utf8'));
        await atomicWrite(file, localJsonText(rec.rel, S.fromCloud(v, ctx), statSync(file) ? { file } : null));
      } else {
        // (a copy whose content is still only in the cloud downloads now: this choice asks for it)
        const tmp = path.join(path.dirname(file), `.hearth-tmp-${rand()}-${path.basename(file)}`);
        await fsp.mkdir(path.dirname(file), { recursive: true });
        await fsp.copyFile(copy, tmp);
        await renameRetry(tmp, file);
      }
      notePulled(rec.rel, kindOf(rec.rel));
    }
    // the record and the copy go to the trash (still recoverable)
    const dir = path.join(TRASH, day(now()), 'conflicts');
    await fsp.mkdir(dir, { recursive: true });
    for (const f of [rec.copy, `${rec.id}.json`]) { try { await renameRetry(path.join(CONFL, f), path.join(dir, f)); } catch { /* gone */ } }
    if (pulledNow.length) { o.onPulled?.(pulledNow.slice()); pulledNow = []; }
    return { ok: true, rel: rec.rel };
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
    return out;
  }
  async function restore(id) {
    const m = /^(cloud|here):(\d{4}-\d\d-\d\d)\/(.+)$/.exec(String(id));
    if (!m) return { ok: false, error: 'Not a trash item' };
    const [, where, d, r] = m;
    const src = path.join(where === 'cloud' ? TRASH : path.join(stateDir, 'trash'), d, ...r.split('/'));
    const rel = r.replace(/(^|\/)\.([^/]+)\.icloud$/, '$1$2').replace(/(^|\/)[0-9a-f]{8}-([^/]+)$/, '$1$2');
    const dst = localPathOf(rel);
    if (await exists(dst)) return { ok: false, error: `${rel} is already there` };
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    const tmp = path.join(path.dirname(dst), `.hearth-tmp-${rand()}-${path.basename(dst)}`);
    if (S.isJsonRel(rel)) { const v = JSON.parse(await fsp.readFile(src, 'utf8')); await fsp.writeFile(tmp, localForm(S.fromCloud(v, ctx), true)); } else await fsp.copyFile(src, tmp);
    await renameRetry(tmp, dst);
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
    let disk; try { disk = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return value; }
    const isCfg = rel === 'app/config.json';
    const ours = S.toCloud(isCfg ? S.portableConfig(value) : value, ctx);
    const theirs = S.toCloud(isCfg ? S.portableConfig(disk) : disk, ctx);
    const r = S.merge3(pulledPrev.get(rel), ours, theirs, { counters: S.isCounterRel(rel) });
    const merged = S.fromCloud(r.value, ctx);
    return isCfg ? S.applyPortable(value, merged) : merged;
  }

  function readJsonSync(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
  function writeJsonSync(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${rand()}.tmp`; fs.writeFileSync(t, JSON.stringify(v)); fs.renameSync(t, f); }

  return {
    pass, stop: () => { stopping = true; }, status: publicStatus, set: (patch) => Object.assign(o, patch), option: (k) => o[k], machine: () => ({ ...machine }),
    conflicts: listConflicts, resolve, trash: listTrash, restore, guardWrite, relOfLocal,
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
      try { const j = JSON.parse(fs.readFileSync(path.join(dir, '.sync', 'machines', f), 'utf8')); machines.push({ id: j.id, name: j.name, platform: j.platform, lastSeen: j.lastSeen }); } catch { /* skip */ }
    }
  } catch { /* none */ }
  return { dir, machines, lastSeen: Math.max(0, ...machines.map((m) => m.lastSeen || 0)) };
}

module.exports = { createEngine, hearthIn, SMALL, BIG_CAP };
