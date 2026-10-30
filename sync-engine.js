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
const K = require('./sync-kinds'); // (round 73, syncmedia73) what syncs, by kind: sizes for the panel
const Hard = require('./sync-hard'); // (round 74, synchard74) Windows names, locked / read-only / full disks, versions, secrets
const SState = require('./sync-state'); // (round 75, syncstate75) sync's own state kept in pieces (data/sync/state/)
const Aside = require('./sync-aside'); // (round 78, guardloss78) a conflict's losing side, kept in Deleted files with a note
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
const P_safe = (by) => String(by || 'here').replace(/[^\w.-]+/g, '_').slice(0, 64) || 'here'; // (round 89, packs89) a computer's name in a pack (chatpack-core safeBy)
// These are application databases, not user-deleted documents. Clearing an item
// is an edit inside its store. A missing cloud/local store must not erase the
// surviving database (including temporary cloud renames and conflict copies).
const appStore = rel => /^kv\/[^/]+\.json$/i.test(rel);
const chatTrashRel = rel => /^chats\/[^/]+\.json$/i.test(rel) ? rel.replace(/^chats\//i, 'trash/') : null;

async function exists(p) { try { await fsp.stat(p); return true; } catch { return false; } }
// (round 72, sync72) two spellings of one name (case / Unicode form) that are the same file on this disk (Mac, Windows)
const caseOnly = (a, b) => a !== b && nfc(a).toLowerCase() === nfc(b).toLowerCase();
async function sameNode(a, b) { try { const [x, y] = await Promise.all([fsp.stat(a), fsp.stat(b)]); return x.ino === y.ino && x.dev === y.dev; } catch { return false; } }
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
  // (sweep67) Windows and the Mac both ignore case on their usual disks, and the Mac may hand names decomposed (NFD):
  // fold both the same way so two spellings of one destination share one queue.
  const key = process.platform === 'win32' || process.platform === 'darwin' ? nfc(path.resolve(to)).toLowerCase() : path.resolve(to);
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

// (round 79, syncscope79) one file of a look (a scan): the last pass's look is kept between passes (a scoped pass
// starts from it), 2 × 50,000 of these at 50,000 files: the absolute path is made when asked, not kept (≈ 20 MB less)
class Ent {
  constructor(root, key, r, size, mtime, placeholder) { this.root = root; this.key = key; this.r = r === key ? null : r; this.size = size; this.mtime = mtime; this.placeholder = placeholder; }
  get file() { return path.join(this.root, ...(this.r ?? this.key).split('/')); }
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
  const aside = Aside.createAside({ stateDir, now: () => now(), log: (...a) => log(...a) }); // (round 78, guardloss78)
  const PK = o.packs || null; // (round 89, packs89) the pack lane (syncpack.js): only when "Send very long chats in pieces" is on; null = as before

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
  // (round 75, syncstate75) kept in pieces (sync-state.js): data/sync/state/index.json + up to 256 bucket files. Only
  // the buckets that changed are turned into text (a bucket at a time, with breaths between) and written (new files,
  // flushed, then the index renamed over: a crash leaves the old state or the new one, never a mix). Until round 74 it
  // was one file, state.json: ~14 MB at 50,000 files, all turned into text on the main process at every save
  // (≈ 120–180 ms in one piece). That file is moved in once and kept as state.json.prev. The state is read
  // asynchronously at start (a pass, Free up space, a fix… wait for it); nothing is saved before it was really read.
  const freshState = () => ({ v: 1, cloudRoot, base: {}, local: {}, cloud: {}, ext: {}, lastPass: 0, lastOk: 0, purgedAt: 0 });
  let state = { ...freshState(), held: true }; let loading = true; // (not saved: read first)
  // (round 16) written when something in it changed, or every 10 minutes for the clocks (lastPass / lastOk)
  // (round 70, bigprofile70) a mid-pass checkpoint (every 25 files) runs at most every 5 s; (round 74) spaced by its cost
  let savedSmall = ''; let savedAt = 0; let checkedAt = 0; let stateQ = Promise.resolve();
  const store = SState.createStateStore({
    dir: stateDir, cloudRoot, log, breathe: () => breathe(), rename: (a, b) => renameRetry(a, b), fresh: freshState,
    // a full disk / a held file: the last saved state stays whole, nothing half-written is left, the changed buckets
    // are written next time (round 74's rules, kept)
    onError: (err) => { savedSmall = ''; if (Hard.classify(err) === 'disk-full') block('sync/state.json', 'disk-full', { where: 'here' }); },
  });
  async function loadState() {
    const r = await store.load();
    if (r.held) { heldStart = true; log('state held', r.why); return false; } // (round 43, datasafe) read again at the next pass
    state = r.state;
    // a new drive (or the first time): no base, so the first pass merges both sides without overwriting either
    if (r.fresh) { baseDirs.clear(); await fsp.rm(path.join(stateDir, 'base'), { recursive: true, force: true }).catch(() => {}); }
    ctx = baseCtx(); savedSmall = ''; savedAt = 0;
    return true;
  }
  const ready = loadState().catch((err) => { heldStart = true; log('state', err.message); }).finally(() => { loading = false; });
  const keysOf = (m) => Object.keys(store.plain(m)); // (round 75) through the plain object: Object.keys of a watched map (a Proxy) asks it key by key (≈ 10× slower at 50,000)
  const afterLoad = (fn) => async (...a) => { await ready; return fn(...a); };
  // (round 79, syncscope79) fix / Free up space / a conflict's choice / a restore write files outside a pass: the next
  // pass looks at everything (it doesn't trust what the last one saw)
  const wrote = (fn) => async (...a) => { try { return await fn(...a); } finally { needFull = 'wrote'; } };
  const saveState = (checkpoint = false) => {
    if (heldStart || loading) return; // (round 43, datasafe) the real one couldn't be read yet: never written over
    if (checkpoint && now() - checkedAt < Math.max(5000, store.stats().costMs * 40)) return; // (round 74) ≤ ~2.5 % of a pass
    checkedAt = now();
    store.watch(state);
    const small = JSON.stringify({ ...state, base: 0, local: 0, cloud: 0, prev: 0, keepAll: 0, freed: 0, lastPass: 0, lastOk: 0 }); // everything but the big maps: small
    if (!store.isDirty() && small === savedSmall && now() - savedAt < 10 * 60000) return;
    savedSmall = small; savedAt = now();
    stateQ = store.save(state); // in order, never throws; a pass ends only once it is on disk
  };
  const basePath = (rel) => path.join(stateDir, 'base', ...rel.split('/'));
  function readBase(rel) { try { return S.parseJson(fs.readFileSync(basePath(rel), 'utf8')); } catch { return null; } }
  // (round 70, bigprofile70) each base folder is made once per run (a first pass over ~1,800 JSON files asked the disk
  // to make the same few folders ~1,800 times, on the main process); one that went away meanwhile is made again
  const baseDirs = new Set();
  // (round 72, sync72) base files are written asynchronously, in order per store (a first pass made ~1,800 sync write +
  // rename pairs on the main process: ≈ 1.3 s of it on a slow Windows disk); whoever reads one waits for its store's
  // writes (baseIdle), and a pass ends only when all are on disk (state.json never names a base that isn't written)
  const baseJobs = new Map();
  function baseJob(rel, fn) {
    const p = (baseJobs.get(rel) || Promise.resolve()).then(fn).catch((err) => log('base', rel, err.message));
    baseJobs.set(rel, p);
    p.then(() => { if (baseJobs.get(rel) === p) baseJobs.delete(rel); });
    return p;
  }
  const baseIdle = (rel) => (rel ? baseJobs.get(rel) || Promise.resolve() : Promise.all([...baseJobs.values()]));
  function writeBase(rel, text) {
    baseJob(rel, async () => {
      const f = basePath(rel), d = path.dirname(f);
      if (!baseDirs.has(d)) { await fsp.mkdir(d, { recursive: true }); baseDirs.add(d); }
      try { await fsp.writeFile(`${f}.tmp`, text); } catch (err) { if (err.code !== 'ENOENT') { await fsp.rm(`${f}.tmp`, { force: true }).catch(() => {}); throw err; } /* (round 74) a full disk: no half .tmp left */ baseDirs.delete(d); await fsp.mkdir(d, { recursive: true }); baseDirs.add(d); await fsp.writeFile(`${f}.tmp`, text); }
      await fsp.rename(`${f}.tmp`, f);
    });
  }
  function dropBase(rel) { delete state.base[rel]; if (state.prev) delete state.prev[rel]; if (state.keepAll) delete state.keepAll[rel]; const f = basePath(rel); baseJob(rel, () => Promise.all([fsp.rm(f, { force: true }), fsp.rm(`${f}.prev`, { force: true })])); }
  // (round 72, sync72) the base before the last one is kept too (its hash; a JSON store's text as base/<rel>.prev, a
  // rename, no copy): when a cloud client moves our upload aside, ours and theirs merge from it (rebase)
  function setBase(rel, h, text) {
    const old = state.base[rel];
    if (old && old !== h) { (state.prev ||= {})[rel] = old; if (S.isJsonRel(rel)) { const f = basePath(rel); baseJob(rel, () => fsp.rename(f, `${f}.prev`).catch(() => fsp.rm(`${f}.prev`, { force: true }))); } }
    state.base[rel] = h; if (text !== undefined && S.isJsonRel(rel)) writeBase(rel, text);
    if (state.keepAll) delete state.keepAll[rel]; // a new version both sides agree on: settled
    if (state.freed) delete state.freed[rel]; // (round 73) a new version: its cloud copy is whole again
  }
  function rebase(rel) {
    const p = state.prev?.[rel];
    delete state.cloud[rel];
    if (!p) { dropBase(rel); return; }
    // (the previous text missing: no base text, so they merge two-way, keeping everything)
    if (S.isJsonRel(rel)) { const f = basePath(rel); baseJob(rel, () => fsp.rename(`${f}.prev`, f).catch(() => fsp.rm(f, { force: true }))); }
    state.base[rel] = p; delete state.prev[rel];
  }
  // (round 72, sync72) "still being written": a modified time just now on this computer's clock. A time AHEAD of this
  // clock (the other computer's clock runs ahead, its cloud client keeps its times) says nothing: such a file counts as
  // settled once it has stayed the same for the settle time (it waited for the whole clock difference before)
  const ahead = new Map();
  function fresh(rel, C, ms) {
    const age = now() - Math.floor(C.mtime);
    if (age >= ms) { ahead.delete(rel); return false; }
    if (age > -ms) return true;
    const s = ahead.get(rel);
    if (!s || s.size !== C.size || s.mtime !== C.mtime) { ahead.set(rel, { size: C.size, mtime: C.mtime, since: now() }); return true; }
    if (now() - s.since < ms) return true;
    ahead.delete(rel); return false;
  }
  // (round 72, sync72) which journal entry of the other computers a cached cloud hash was made under: a new entry since
  // means the file may have changed under a placeholder (was: "older than our last good pass", which a late cloud client
  // or a slower clock made true for a NEW version: the stale hash then let a local edit be pushed over it)
  const jkey = (rel) => journalLatest.get(rel)?.t || 0; // its time is enough to tell a newer entry (kept small: state.json)
  // (round 72, sync72) a chat the other computer deleted: how long its trash copy may take to arrive (this computer's clock)
  const goneSeen = new Map();
  function waitGone(rel) {
    if (!goneSeen.has(rel)) { if (goneSeen.size > 500) goneSeen.clear(); goneSeen.set(rel, now()); }
    return now() - goneSeen.get(rel) < (o.goneWaitMs ?? 30 * 60000);
  }
  const copySeen = new Map(); // (round 72) a cloud client's copy of a non-JSON file: when it was first seen as it is
  // (round 72) stores whose base went back a step: merged keeping everything until they settle (in state.json: a restart
  // between the two must not merge them the ordinary way)
  const rebased = { has: (rel) => Boolean(state.keepAll?.[rel]), add: (rel) => { (state.keepAll ||= {})[rel] = 1; }, delete: (rel) => { if (state.keepAll) delete state.keepAll[rel]; } };

  let status = { state: 'idle', at: 0, pending: 0, conflicts: 0, cloudOnly: [], skippedBig: [], unreadable: [], waiting: [], lastError: null, held: null, error: '', last: null, blocked: [], peersOld: [] };
  // ---------- (round 74, synchard74) real Windows / Mac computers ----------
  // blocked: files sync can't move for a reason the owner can see and often fix (another program holds it, read-only, a
  // name Windows can't have, the disk is full…): [{ rel, why, where: 'here' | 'cloud' | 'there', fix, part?, code? }],
  // the first 60. Built during a pass (blockNow), published at its end; the big lane adds to the published list.
  const ME = o.format || Hard.FORMAT;
  let blockNow = null;
  function block(rel, why, x = {}) {
    const list = blockNow || status.blocked || (status.blocked = []);
    if (list.length >= 60 || list.some((b) => b.rel === rel && b.why === why)) return;
    list.push({ rel, why, where: x.where || 'here', fix: x.fix !== undefined ? x.fix : Hard.BLOCK[why]?.fix ?? null, ...(x.part ? { part: x.part } : {}), ...(x.code ? { code: x.code } : {}), ...(x.to ? { to: x.to } : {}), at: now() });
  }
  // an fs error on rel → a blocked entry (true) when it is one the owner can see / fix; the read-only test looks at the
  // files themselves (Windows refuses to replace or delete a read-only file: EPERM, like a file in use)
  async function blockErr(rel, err) {
    if (!err?.code || err.code === 'STOPPED' || err.code === 'FAULT') return false;
    let ro = null;
    for (const [f, where] of [[localPathOf(rel), 'here'], [cloudPathOf(rel), 'cloud']]) {
      try { const st = await fsp.stat(f); if (!(st.mode & 0o200)) { ro = where; break; } } catch { /* none */ }
    }
    const kind = Hard.classify(err, { readOnly: Boolean(ro), platform });
    if (!Hard.BLOCKING.has(kind)) return false;
    const inCloud = String(err.path || err.dest || '').startsWith(cloudDir) || String(err.dest || '').startsWith(cloudDir);
    block(rel, kind, { where: ro || (inCloud ? 'cloud' : 'here'), code: err.code });
    return kind;
  }
  // Windows computers syncing with this one (and how long their folders' paths are): names they can't hold are held
  // back here (never pushed) and shown with "Rename for Windows". OneDrive refuses those names on a Mac as well.
  const winPeers = () => peers.filter((p) => p.platform === 'win32');
  const winRootLen = () => { const w = winPeers(); return w.length ? Math.max(...w.flatMap((p) => [String(p.dataDir || '').length, String(p.cloudRoot || '').length + 14])) : undefined; };
  const winTarget = () => platform !== 'win32' && (winPeers().length > 0 || Boolean(o.winNames));
  // sleep: the clock jumps while the computer sleeps; what "has stayed the same for a minute / 6 h / 30 min" waited
  // through (a half download, a delete still arriving, a cloud client's copy) must not count the sleep. excuse(ms) moves
  // every such clock on by the time asleep. syncmain calls woke(ms) on a resume; a pass sees a jump itself too.
  const SLEEP_GAP = o.sleepGapMs ?? 120000; let sleepRuns = 0;
  // (round 74, synchard74) 50,000 files: a pass with nothing to do held the main process for ~2 s in one go (a cached
  // hash is awaited without ever giving the event loop a turn). The long loops let it breathe every ~12 ms (real time).
  let breathAt = Date.now();
  const breathe = () => { if (Date.now() - breathAt < 12) return null; return new Promise((r) => setImmediate(r)).then(() => { breathAt = Date.now(); }); };
  function excuse(ms) {
    if (!(ms > 0)) return;
    for (const m of [ahead, arriving, copySeen]) for (const v of m.values()) v.since += ms;
    for (const [k, t] of goneSeen) goneSeen.set(k, t + ms);
    status.woke = { at: now(), ms };
  }
  let running = null; let again = false; let stopping = false;
  const pulledPrev = new Map(); // rel → the value this computer had before a pull (cloud form): the guard's base
  // (the oldest one is kept until the app reloads it: that is the version still in its memory; huge stores aren't kept)
  const remember = (rel, value, size = 0) => { if (!pulledPrev.has(rel) && size < 16e6) pulledPrev.set(rel, value); };
  // (round 77, storeack77) when each store last arrived: an ack for a read that began before that is a read of the older
  // version (a second arrival landed while the window was reading): ignored, the guard stays until it reads again
  const pulledAt = new Map();
  // (round 72) { lazy: text }: parsed only if the app does save an older version (rare), not on every pull
  const prevOf = (rel) => { const v = pulledPrev.get(rel); return v && typeof v === 'object' && typeof v.lazy === 'string' ? S.parseJson(v.lazy) : v; };

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
  async function walk(root, fn, rel = '', blind = null, dirs = null) {
    let ents;
    // (round 79, syncscope79) dirs: each folder's modified time, read BEFORE it is listed (a file added or removed after
    // the listing changes it again): a scoped pass compares it to find adds / removes a watcher didn't report
    if (dirs) { try { dirs.set(rel, (await fsp.stat(rel ? path.join(root, ...rel.split('/')) : root)).mtimeMs); } catch { dirs.delete(rel); } }
    // (round 74, synchard74) + a folder that was listed a moment ago and is gone now (a cloud drive unmounted / moved
    // mid-scan), or the whole folder gone, is unknown too: it read as "every file in it deleted"
    try { ents = await fsp.readdir(rel ? path.join(root, ...rel.split('/')) : root, { withFileTypes: true }); } catch (err) { if (blind && err.code !== 'ENOTDIR') blind.add(rel ? `${nfc(rel)}/` : ''); return; }
    // (round 75, syncstate75) a folder's files are looked at WALK_N at a time (one stat after the other, 50,000 files
    // took ≈ 5 s per side, each pass); fn may return a commit function, run in the folder's own order (the same maps,
    // in the same order, as before)
    let batch = [];
    const flush = async () => { if (!batch.length) return; const res = await Promise.all(batch.map(([e, r]) => fn(e, r))); batch = []; for (const c of res) if (typeof c === 'function') c(); };
    for (const e of ents) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { await flush(); if (!S.dirLocalOnly(nfc(r)) && !S.localOnly(`${nfc(r)}/x`)) await walk(root, fn, r, blind, dirs); continue; }
      batch.push([e, r]); if (batch.length >= WALK_N) await flush();
    }
    await flush();
  }
  const WALK_N = o.walkN || 24;
  // (round 79, syncscope79) one file of the data folder → its entry (st0: already looked at, by a scoped pass)
  const localFn = (out) => async (e, r, st0) => {
    if (!e.isFile() || S.ignoredName(e.name) || S.localOnly(nfc(r))) return;
    const file = path.join(dataDir, ...r.split('/'));
    try { const st = st0 || await fsp.stat(file); return () => { const k = nfc(r); out.set(k, new Ent(dataDir, k, r, st.size, st.mtimeMs, false)); }; } catch (err) { return () => { if (err.code !== 'ENOENT') out.blind.add(nfc(r)); /* else gone */ }; } // (round 75) committed in order
  };
  async function scanLocal(dirs = null) {
    const out = new Map();
    out.blind = new Set();
    await walk(dataDir, localFn(out), '', out.blind, dirs);
    await localExtras(out);
    return out;
  }
  async function localExtras(out) { // (round 79) config / theme and the renders outside the data folder: looked at every pass
    for (const rel of out.extras || []) out.delete(rel); // (a scoped pass starts from the last pass's entries)
    out.extras = new Set();
    for (const [rel, file] of Object.entries(SPECIAL)) {
      if (!file) continue;
      try { const st = await fsp.stat(file); out.set(rel, { file, size: st.size, mtime: st.mtimeMs }); out.extras.add(rel); } catch { /* none */ }
    }
    // renders saved outside the data folder (Lab recordings and exports from before round 17), listed in kv/video-library
    refreshExt();
    for (const [rel, abs] of Object.entries(state.ext)) {
      if (out.has(rel)) continue;
      out.extras.add(rel);
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
    /^(.*) \([^()]*conflicted copy[^()]*(?:\(\d+\))?\)(\.[^./]+)?$/i, // Dropbox (round 72: also its second copy, "… copy 2026-10-27 (1))")
  ];
  const JSON_COPY = /^([\w-]+)(?: \d+| ?\(\d+\))\.json$/; // iCloud "x 2.json" / "x(1).json", Google Drive "x (1).json"
  // (round 79, syncscope79) one file of the cloud folder → its entry, or a cloud client's copy (st0: already looked at)
  const cloudFn = (out, copies) => {
    const hosts = new Set([machine.name, ...peers.map((p) => p.name)].filter(Boolean).map((n) => String(n).toUpperCase().replace(/\.LOCAL$/, '')));
    return async (e, r, st0) => {
      if (!e.isFile()) return;
      let name = e.name; let placeholder = false;
      const stub = /^\.(.+)\.icloud$/.exec(name);
      if (stub) { name = stub[1]; placeholder = true; } else if (S.ignoredName(name)) return;
      const rel = nfc(r.replace(/[^/]+$/, name));
      if (S.localOnly(rel)) { if (Hard.secretName(rel) && !/(^|\/)\./.test(rel)) out.secrets.push(rel); return; } // (round 74, synchard74) a key synced by an older version: shown, with a fix
      const file = path.join(FILES, ...r.split('/'));
      let st = st0; if (!st) try { st = await fsp.stat(file); } catch (err) { return () => { if (err.code !== 'ENOENT') out.blind.add(rel); }; }
      return () => { // (round 75, syncstate75) committed in the folder's order (walk looks at several files at once)
      // a Mac "dataless" file (Optimise Mac Storage, Google Drive streaming): stat works, reading downloads it
      if (!placeholder && platform === 'darwin' && st.size > 0 && st.blocks === 0) placeholder = true;
      const ent = new Ent(FILES, rel, r, placeholder && stub ? null : st.size, st.mtimeMs, placeholder); // (round 79: its path made when asked)
      // copies a cloud client made when both computers wrote the same file
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
      let orig = null;
      for (const re of CLOUD_COPY) { const mm = re.exec(name); if (mm) orig = `${dir}${mm[1]}${mm[2] || ''}`; }
      const jm = JSON_COPY.exec(name);
      if (!orig && jm) orig = `${dir}${jm[1]}.json`;
      const od = /^([\w-]+)-([A-Za-z0-9-]{2,})\.json$/.exec(name); // OneDrive "x-COMPUTERNAME.json"
      if (!orig && od && (hosts.has(od[2].toUpperCase()) || hosts.has(od[2].toUpperCase().replace(/-\d+$/, ''))) && !state.base[rel]) orig = `${dir}${od[1]}.json`; // (round 72) also its next copies "x-PC-2.json"
      // (round 72, sync72) the same copies of ANY file (iCloud "logo 2.png", Google Drive "plan (1).md", OneDrive
      // "theme-PCNAME.css"; they were pulled as new files: duplicates in both data folders): only next to a file both
      // computers have synced (its base is known here) and while no computer's journal claims the name
      let unsure = false;
      if (!orig && !state.base[rel] && !journalLatest.has(rel)) {
        const am = /^(.+?)(?: (\d{1,2})| ?\((\d{1,2})\))(\.[^./ ]+)?$/.exec(name);
        let o2 = am && (Number(am[2]) >= 2 || am[3]) ? `${dir}${am[1]}${am[4] || ''}` : null;
        if (!o2) { const ext = path.extname(name); const full = name.slice(0, name.length - ext.length); const stem = full.toUpperCase().replace(/-\d{1,2}$/, ''); for (const h of hosts) if (stem.length > h.length + 1 && stem.endsWith(`-${h}`)) { o2 = `${dir}${full.slice(0, stem.length - h.length - 1)}${ext}`; break; } }
        if (o2 && state.base[o2]) { orig = o2; unsure = true; }
      }
      if (orig && S.localOnly(orig)) return;
      if (orig && orig !== rel && !state.base[rel]) {
        // our own last upload, moved aside by the cloud client because the other computer's version got there first
        // (same size and time as the file this computer wrote there)
        const c = state.cloud[orig];
        const ours = Boolean(c && c[2] && c[0] === st.size && c[1] === st.mtimeMs && c[2] === state.base[orig]);
        copies.push({ rel, orig, file, size: ent.size, mtime: ent.mtime, placeholder: ent.placeholder, ours, unsure: unsure && !ours }); return;
      }
      out.set(rel, ent);
      };
    };
  };
  async function scanCloud(local = null, dirs = null) { // (round 74) local: this pass's local scan (which files changed here)
    const out = new Map(); const copies = [];
    out.blind = new Set(); out.secrets = []; // (round 74)
    await walk(FILES, cloudFn(out, copies), '', out.blind, dirs);
    await probeWin(out, copies, local);
    return { files: out, copies };
  }
  async function probeWin(out, copies, local) {
    if (platform === 'win32') {
      // (round 74, synchard74) only files new or changed since the last pass, in the cloud or here (sync may write over
      // its cloud copy), are asked about; one unchanged on both sides keeps its known hash whatever its download state.
      // 50,000 files were all asked each pass.
      const entries = [...[...out].filter(([rel, e]) => !cachedThere(rel, e) || !local?.get(rel) || local.get(rel).unavailable || !cachedHere(rel, local.get(rel))).map(([, e]) => e), ...copies];
      const probe = o.cloudAttributes || require('./cloud-files').attributes;
      let attributes; try { attributes = await probe(entries.map(e => e.file)); } catch { attributes = new Map(); }
      for (const e of entries) {
        const a = attributes.get(e.file);
        if (require('./cloud-files').pending(a)) { e.placeholder = true; e.downloading = true; e.cloudUnknown = !Number.isInteger(a); }
      }
    }
  }

  // ---------- (round 79, syncscope79) scoped passes ----------
  // A pass used to look at (stat) every file on both sides: ≈ 2 × 50,000 calls at 50,000 files, for each change; on
  // Windows each one goes through the antivirus and the cloud drive's filter. When the watchers say which paths changed
  // (opts.scope: { local: [rel], cloud: [rel] }: paths in the data folder / in <cloud>/Hearth/files, files or folders),
  // a pass starts from what the last pass saw and looks again only at:
  //   · those paths (a folder: walked again; a path that appeared or went: its folder listed again, for its neighbours)
  //   · what the last pass left open (waiting, held, retried) and every entry the state's cache doesn't confirm (sync's
  //     own copies change the cache: those are looked at again, never trusted from the last look)
  //   · the files the other computers' journals name since the last pass
  //   · safety checks that catch a lost watcher event: some folders' modified times (adds / removes) and some files
  //     (size + time), in turn, so every one is checked now and then
  // A whole look (full pass) still happens: the first pass, after a wake, an error, a pass cut short, a folder that
  // couldn't be read, a cloud folder that moved, an option changed, anything a fix / restore / conflict choice wrote,
  // a lost event found by the checks (right away), and at least every o.fullEveryMs (6 h); the caller asks for more
  // (syncmain.js: a watcher that failed or overflowed, idle on mains power). Nothing here decides what to copy: the
  // plan is the same code on the same maps, and every write still checks its file right before (a stale entry only
  // makes that file wait for the next pass, never overwrites anything).
  const FULL_EVERY = o.fullEveryMs ?? 6 * 3600000;
  const SAMPLE_N = o.sampleN ?? 48; const DIRS_N = o.dirsN ?? 256; const SCOPE_MAX = o.scopeMax ?? 4000; const RELIST_MAX = 64;
  let seen = null; // the last pass's look: { local, cloud, dirsL, dirsC, filesId, fullAt, startedAt, touchy, keysL, keysC, dirKeysL, dirKeysC, cur }
  let needFull = 'start'; // why the next pass must look at everything ('' = a scoped pass may run)
  const jNew = new Set(); let jNewAll = false; // names the other computers' journals mention since the last pass
  const scopeAcc = { local: new Set(), cloud: new Set(), full: false, any: false }; // asked for while a pass ran
  let pendRels = new Set(); // this pass's names left open (all of them; `waiting` keeps 60)
  const noteJournal = (rel) => { if (jNewAll) return; jNew.add(nfc(rel)); if (jNew.size > SCOPE_MAX) { jNewAll = true; jNew.clear(); } };
  const scopeStats = { full: 0, scoped: 0, missed: 0, lastFull: 0, lastWhy: '', looked: 0, mode: '' };
  function addScope(opts) {
    if (!opts?.scope || opts.fresh || opts.mass) { scopeAcc.full = true; return; }
    scopeAcc.any = true;
    for (const r of opts.scope.local || []) scopeAcc.local.add(r);
    for (const r of opts.scope.cloud || []) scopeAcc.cloud.add(r);
  }
  function takeScope() {
    const r = scopeAcc.full || !scopeAcc.any ? {} : { scope: { local: [...scopeAcc.local], cloud: [...scopeAcc.cloud] } };
    scopeAcc.local.clear(); scopeAcc.cloud.clear(); scopeAcc.full = false; scopeAcc.any = false;
    return r;
  }
  // → the scope to use ({ local, cloud }), or { why } for a full look
  function scopeOf(opts, filesId, nf) {
    if (nf) return { why: nf };
    if (!opts.scope) return { why: 'asked' };
    if (!seen) return { why: 'start' };
    if (opts.fresh || opts.mass) return { why: 'asked' };
    if (!filesId || seen.filesId !== filesId) return { why: 'moved' };
    if (now() - seen.fullAt >= FULL_EVERY || now() < seen.fullAt - 60000) return { why: 'due' };
    if (jNewAll) return { why: 'journal' };
    const l = opts.scope.local || []; const c = opts.scope.cloud || [];
    if (l.length + c.length > SCOPE_MAX) return { why: 'many' };
    if ([...l, ...c].some((r) => !r || typeof r !== 'string')) return { why: 'root' }; // a nameless event: the system lost track
    return { local: l.map((r) => nfc(r)), cloud: c.map((r) => nfc(r)) };
  }
  const parentOf = (r) => (r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : ''); // winmac-ok (sync's names always use /)
  const underSkipped = (r) => { const parts = r.split('/'); for (let i = 1; i < parts.length; i++) { const d = parts.slice(0, i).join('/'); if (S.dirLocalOnly(d) || S.localOnly(`${d}/x`)) return true; } return false; };
  const stubReal = (r) => r.replace(/(^|\/)\.([^/]+)\.icloud$/, '$1$2');
  const stubOf = (r) => { const d = parentOf(r); return `${d ? `${d}/` : ''}.${r.slice(d ? d.length + 1 : 0)}.icloud`; };
  const fakeEnt = (name) => ({ name, isFile: () => true, isDirectory: () => false });
  // looks again at `rels` on one side, and the safety checks; out / dirs: the last pass's maps, changed in place
  async function rescope(side, out, dirs, rels, fn, x) {
    const root = side === 'l' ? dataDir : FILES;
    const abs = (r) => (r ? path.join(root, ...r.split('/')) : root);
    const relist = new Set(); const gone = new Set(); const rewalk = new Set(); const look = new Set(rels);
    const moved = new Set(); // folders whose modified time changed since the last pass
    let looked = 0; let missed = 0;
    const late = (t) => t < x.since - 1000; // changed before the last pass started: its event should have come
    // when a file changed ON THIS DISK: its change time (a cloud client keeps the other computer's modified time, so a
    // file landing now can look minutes old); tests on a simulated clock stamp the modified time
    const when = (st) => (o.now ? st.mtimeMs : Math.max(st.mtimeMs, st.ctimeMs || 0));
    const heard = (r) => { if (x.reported.has(r) || look.has(r)) return true; for (let i = r.lastIndexOf('/'); i > 0; i = r.lastIndexOf('/', i - 1)) if (x.reported.has(r.slice(0, i))) return true; return false; }; // (it, or a folder above it) // winmac-ok
    const heardBelow = (d) => { for (const r of x.reported) if (r.startsWith(`${d}/`)) return true; return false; };
    // 1. safety checks, in turn: folders' modified times (something added / removed in them) and files (size + time)
    const dk = side === 'l' ? seen.dirKeysL : seen.dirKeysC; const cur = seen.cur;
    const dn = Math.min(DIRS_N, dk.length);
    for (let i = 0; i < dn; i++) {
      const d = dk[(cur[`d${side}`] + i) % dk.length];
      if (!dirs.has(d)) continue;
      looked += 1;
      let st = null; try { st = await fsp.stat(abs(d)); } catch (err) { if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') continue; }
      if (!st) { if (d) { gone.add(d); relist.add(parentOf(d)); } continue; }
      if (st.mtimeMs !== dirs.get(d)) { relist.add(d); moved.add(d); }
    }
    cur[`d${side}`] = dk.length ? (cur[`d${side}`] + dn) % dk.length : 0;
    const fk = side === 'l' ? seen.keysL : seen.keysC;
    const fnN = Math.min(SAMPLE_N, fk.length);
    for (let i = 0; i < fnN; i++) {
      const r = fk[(cur[side] + i) % fk.length]; const e = out.get(r);
      if (!e || !e.file || look.has(r) || e.unavailable || e.ext || out.extras?.has(r)) continue;
      looked += 1;
      let st = null; try { st = await fsp.stat(e.file); } catch (err) { if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') continue; }
      if (!st || (e.size !== null && st.size !== e.size) || st.mtimeMs !== e.mtime) {
        look.add(side === 'c' && /\.icloud$/.test(e.file) ? stubOf(r) : r);
        if (!heard(r) && (!st || late(when(st)))) { missed += 1; x.notes.push(`file ${side}:${r}`); }
      }
    }
    cur[side] = fk.length ? (cur[side] + fnN) % fk.length : 0;
    // 2. each path: a file (its entry again), a folder (walked again), gone (its entry and everything under it)
    for (const r0 of look) {
      if (!r0 || underSkipped(r0)) continue;
      const real = side === 'c' ? stubReal(r0) : r0;
      const forms = side === 'c' ? [stubOf(real), real] : [real]; // (the real file wins over a stub, as in a listing)
      const had = out.has(real);
      let any = false; let dir = false;
      for (const f of forms) {
        let st = null; looked += 1;
        try { st = await fsp.stat(abs(f)); } catch (err) { if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') { out.blind.add(real); any = true; continue; } }
        if (!st) continue;
        if (st.isDirectory()) { if (f === real) dir = true; continue; }
        if (!st.isFile()) continue;
        if (!any && had) out.delete(real); // (made again below: a copy now, or a stub now)
        any = true;
        const c = await fn(fakeEnt(f.slice(f.lastIndexOf('/') + 1)), f, st); // winmac-ok
        if (typeof c === 'function') c();
      }
      if (dir) { if (had) out.delete(real); gone.add(real); rewalk.add(real); relist.add(parentOf(real)); continue; }
      if (!any) { if (had) out.delete(real); if (had || dirs.has(real)) { gone.add(real); relist.add(parentOf(real)); } continue; }
      if (!had) relist.add(parentOf(real));
    }
    // 3. folders listed again: what appeared or went beside what was heard (a rename's other half, a lost event)
    if (relist.size > RELIST_MAX) return { full: 'relist' };
    const explained = new Set([...look].map((r) => parentOf(side === 'c' ? stubReal(r) : r))); let restat = 0;
    const kids = new Map([...relist].map((d) => [d, { files: new Set(), dirs: new Set() }]));
    if (kids.size) {
      let ki = 0;
      for (const k of out.keys()) { if ((++ki & 4095) === 0) { const b = breathe(); if (b) await b; } const kd = kids.get(parentOf(k)); if (kd) kd.files.add(k); }
      for (const d of dirs.keys()) { if (!d) continue; const kd = kids.get(parentOf(d)); if (kd) kd.dirs.add(d); }
    }
    for (const [d, kd] of kids) {
      if (d && underSkipped(`${d}/x`)) continue;
      let ents; looked += 1;
      try { ents = await fsp.readdir(abs(d), { withFileTypes: true }); } catch (err) {
        if (err.code === 'ENOENT' || err.code === 'ENOTDIR') { if (d) gone.add(d); } else out.blind.add(d ? `${d}/` : '');
        continue;
      }
      const named = new Set(); const subs = new Set();
      for (const e of ents) {
        const r = d ? `${d}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (S.dirLocalOnly(nfc(r)) || S.localOnly(`${nfc(r)}/x`)) continue;
          subs.add(nfc(r));
          if (!kd.dirs.has(nfc(r)) && !rewalk.has(nfc(r))) { rewalk.add(nfc(r)); if (!heard(nfc(r)) && !heardBelow(nfc(r))) { missed += 1; x.notes.push(`new folder ${side}:${r}`); } }
          continue;
        }
        if (!e.isFile()) continue;
        const real = nfc(side === 'c' ? stubReal(r) : r);
        named.add(real);
        if (out.has(real) || look.has(real) || look.has(r)) continue;
        let st = null; try { st = await fsp.stat(abs(r)); } catch { continue; } // (gone again: nothing to add)
        const c = await fn(e, r, st); looked += 1;
        if (typeof c === 'function') c();
        if (out.has(real) && !heard(real) && late(when(st))) { missed += 1; x.notes.push(`new ${side}:${real}`); }
      }
      for (const k of kd.files) {
        if (named.has(k) || out.extras?.has(k) || out.get(k)?.ext) continue;
        out.delete(k);
        if (!heard(k) && (dirs.get(d) === undefined || late(dirs.get(d)))) { missed += 1; x.notes.push(`went ${side}:${k}`); }
      }
      for (const sd of kd.dirs) if (!subs.has(sd)) gone.add(sd);
      // a folder that changed with nothing heard in it: a file saved there by a rename (how apps and cloud clients
      // replace a file) whose event was lost leaves only the folder's time changed: its files are looked at again
      if (moved.has(d) && !explained.has(d)) {
        const again = [...kd.files].filter((k) => named.has(k) && !look.has(k));
        if ((restat += again.length) > SCOPE_MAX) return { full: 'folder' };
        for (const k of again) {
          const e = out.get(k); if (!e?.file || e.ext) continue;
          let st = null; looked += 1; try { st = await fsp.stat(e.file); } catch { /* listed a moment ago: the next pass */ }
          if (!st || !st.isFile() || ((e.size === null || st.size === e.size) && st.mtimeMs === e.mtime)) continue;
          const c = await fn(fakeEnt(e.file.slice(e.file.lastIndexOf(path.sep) + 1)), side === 'c' && /\.icloud$/.test(e.file) ? stubOf(k) : k, st);
          if (typeof c === 'function') c();
          if (late(when(st))) { missed += 1; x.notes.push(`changed ${side}:${k}`); }
        }
      }
    }
    // 4. what went (and everything under it), then the folders walked again
    if (gone.size) {
      const g = [...gone]; let gi = 0;
      for (const k of [...out.keys()]) { if ((++gi & 4095) === 0) { const b = breathe(); if (b) await b; } if (g.some((p) => k === p || k.startsWith(`${p}/`))) out.delete(k); }
      for (const k of [...dirs.keys()]) if (k && g.some((p) => k === p || k.startsWith(`${p}/`))) dirs.delete(k);
    }
    for (const r of rewalk) if (!underSkipped(`${r}/x`)) { await walk(root, fn, r, out.blind, dirs); looked += 1; }
    for (const d of new Set([...relist, ...[...explained].filter((e) => dirs.has(e))])) if (!gone.has(d)) { try { dirs.set(d, (await fsp.stat(abs(d))).mtimeMs); } catch { /* gone */ } } // (the folders of what was heard: their time now, so a later lost event there shows)
    return { looked, missed };
  }
  // the scoped look: the last pass's maps, looked at again where something may have changed
  // → { local, cloud, copies, dirsL, dirsC, looked, missed, notes } | { full: why }
  async function scopedScan(sc) {
    const x = { since: seen.startedAt, reported: new Set([...sc.local, ...sc.cloud].map(stubReal)), notes: [] };
    // (the last pass's maps, changed in place: copying 2 × 50,000 entries held the main process; a pass that doesn't
    // end well leaves needFull set, so a half-changed map is never trusted)
    const local = seen.local; local.blind = new Set();
    const cloud = seen.cloud; cloud.blind = new Set(); cloud.secrets ||= []; const copies = [];
    const dirsL = seen.dirsL; const dirsC = seen.dirsC;
    // what the last pass left open, the journals' news, and every entry the state's cache doesn't confirm (sync's own
    // copies, a file that waited, a file held while it was being saved): never trusted from the last look
    const lrels = new Set(sc.local); const crels = new Set(sc.cloud);
    for (const r of seen.touchy) { lrels.add(r); crels.add(r); }
    for (const r of jNew) crels.add(r);
    let si = 0;
    for (const [rel, L] of local) { if ((++si & 4095) === 0) { const b = breathe(); if (b) await b; } if (!L.unavailable && !L.ext && !local.extras?.has(rel) && !cachedHere(rel, L) && !o.skip?.(rel)) lrels.add(rel); }
    for (const [rel, C] of cloud) { if ((++si & 4095) === 0) { const b = breathe(); if (b) await b; } if ((C.downloading || !cachedThere(rel, C)) && !o.skip?.(rel)) crels.add(C.file && /\.icloud$/.test(C.file) ? stubOf(rel) : rel); }
    for (const rel of keysOf(state.local)) { if ((++si & 4095) === 0) { const b = breathe(); if (b) await b; } if (!local.has(rel) && !SPECIAL[rel] && !state.ext[rel] && !o.skip?.(rel)) lrels.add(rel); } // (sync knows it here, the look doesn't)
    // a chat heard on either side: its trash copy is looked at on both (Hearth's Delete moves it there; a delete is only
    // taken when that copy is seen: with its event lost, the chat came back)
    for (const r of [...lrels, ...crels]) { const t = chatTrashRel(stubReal(r)); if (t) { lrels.add(t); crels.add(t); } }
    if (lrels.size + crels.size > SCOPE_MAX) return { full: 'many' };
    const a = await rescope('l', local, dirsL, lrels, localFn(local), x); if (a.full) return a;
    await localExtras(local);
    const b = await rescope('c', cloud, dirsC, crels, cloudFn(cloud, copies), x); if (b.full) return b;
    await probeWin(cloud, copies, local);
    return { local, cloud, copies, dirsL, dirsC, looked: a.looked + b.looked, missed: a.missed + b.missed, notes: x.notes };
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
            baseDirs.clear(); try { fs.rmSync(path.join(stateDir, 'base'), { recursive: true, force: true }); } catch { /* fine */ }
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
        let nl = 0;
        for (const line of text.split('\n')) {
          if (!line) continue;
          if ((++nl & 511) === 0) { const b = breathe(); if (b) await b; } // (round 74, synchard74) thousands of lines: a breath now and then
          let j; try { j = S.parseJson(line); } catch { continue; }
          if (!j.rel) continue;
          const cur = journalLatest.get(j.rel);
          if (!cur || cur.t <= j.t) { if (!cur || cur.t !== j.t || cur.h !== j.h || cur.op !== j.op) noteJournal(j.rel); journalLatest.set(j.rel, { h: j.h, s: j.s, t: j.t, m: mid, op: j.op, f: j.f }); } // (round 74, synchard74) f: the sync format of the Hearth that wrote it · (round 79) news for a scoped pass
          // (round 72, sync72) a move (a chat deleted to its trash is one) also says the old name is gone
          if (j.op === 'move' && j.from) { const cf = journalLatest.get(j.from); if (!cf || cf.t <= j.t) { if (!cf || cf.t !== j.t) noteJournal(j.from); journalLatest.set(j.from, { t: j.t, m: mid, op: 'del' }); } }
        }
      }
    } catch { /* none yet */ }
  }
  // (round 74, synchard74) .sync/format.json: { min } (missing / unreadable / a placeholder = no minimum)
  async function readFormat() { try { const j = S.parseJson(await fsp.readFile(path.join(META, 'format.json'), 'utf8')); return { min: Number(j.min) || 0 }; } catch { return { min: 0 }; } }
  const nameOf = (mid) => peers.find((p) => p.id === mid)?.name || (mid ? String(mid).replace(/-[0-9a-f]{8}$/, '') : 'another computer');
  let journalOut = [];
  // (round 73, syncmedia73) one flush at a time: the big lane and a pass may both end at once (two read-append-write
  // rounds side by side lost one's lines)
  let journalQ = Promise.resolve();
  const flushJournal = () => (journalQ = journalQ.then(flushJournalNow, flushJournalNow));
  async function flushJournalNow() {
    if (!journalOut.length) return;
    const file = path.join(META, 'journal', `${machine.id}.jsonl`);
    let lines = [];
    try { lines = (await fsp.readFile(file, 'utf8')).split('\n').filter(Boolean); } catch { /* new */ }
    lines.push(...journalOut.slice(-4000).map((j) => JSON.stringify({ ...j, f: ME }))); // (round 74, synchard74) stamped with this Hearth's format (round 75: only the 4,000 kept are turned into text: a first sync of 50,000 files held the main process ≈ 50 ms here)
    journalOut = [];
    await atomicWrite(file, `${lines.slice(-4000).join('\n')}\n`);
  }
  let machinePk = null; // (round 89, packs89) the packs part of the record last written
  async function writeMachine(force) {
    const file = path.join(META, 'machines', `${machine.id}.json`);
    const pk = PK ? JSON.stringify(PK.record()) : ''; // (round 89, packs89) "packs: 1" while the setting is on here (rewritten at once when it changes)
    if (!force && now() - (state.machineAt || 0) < 10 * 60 * 1000 && (!PK || pk === machinePk)) return;
    state.machineAt = now(); if (PK) machinePk = pk;
    await atomicWrite(file, JSON.stringify({ id: machine.id, name: machine.name, platform, dataDir, home: o.home || os.homedir(), cloudRoot, lastSeen: now(), lastOk: state.lastOk, format: ME, app: o.appVersion || undefined, ...(PK ? PK.record() : {}) }, null, 2)); // (round 74, synchard74) format: which sync rules this Hearth follows
  }

  // ---------- files ----------
  // (round 50, crashsafe) a temp file flushed to the disk before its rename: a power cut leaves the old file or the
  // whole new one (never an empty one that then syncs to the other computer)
  async function flushed(p) { let h = null; try { h = await fsp.open(p, 'r+'); await h.sync(); } catch { /* a disk / file that can't */ } finally { await h?.close().catch(() => {}); } }
  async function atomicWrite(file, data) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    const tmp = path.join(path.dirname(file), `.hearth-tmp-${rand()}-${path.basename(file)}`);
    try { await fsp.writeFile(tmp, data); } catch (err) { await fsp.rm(tmp, { force: true }).catch(() => {}); throw err; } // (round 74) a full disk left a half temp file
    await flushed(tmp); try { await renameRetry(tmp, file); } catch (err) { await fsp.rm(tmp, { force: true }); throw err; }
  }
  // the check right before a rename: the file is still the one this pass looked at (or still absent)
  const same = async (file, ent) => {
    let st;
    try { st = await fsp.stat(file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
    if (!ent) return !st;
    return Boolean(st) && st.size === (ent.size ?? st.size) && st.mtimeMs === ent.mtime;
  };
  // (round 74, synchard74) 50,000 small files: a write was ~10 calls to the disk, one file after the other. Now its
  // folder is made once per run (made again if it went away), and the temp file is written and flushed through one
  // handle (open, write, flush, close: 4 calls, was 6). A full disk leaves no half temp file behind.
  const madeDirs = new Set();
  async function writeFlushed(tmp, data) {
    const buf = Buffer.isBuffer(data) ? data : data instanceof Uint8Array ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(String(data)); // (round 82: bytes handed over by a thread)
    let fh = null;
    try {
      fh = await fsp.open(tmp, 'w');
      for (let pos = 0; pos < buf.length;) { const { bytesWritten } = await fh.write(buf, pos, buf.length - pos, pos); if (!bytesWritten) break; pos += bytesWritten; }
      await fh.sync().catch(() => {}); // a disk / file that can't: as flushed()
      await fh.close(); fh = null;
    } catch (err) { await fh?.close().catch(() => {}); await fsp.rm(tmp, { force: true }).catch(() => {}); throw err; }
  }
  async function casWrite(file, ent, data, fault) {
    const d = path.dirname(file);
    if (!madeDirs.has(d)) { await fsp.mkdir(d, { recursive: true }); if (madeDirs.size > 20000) madeDirs.clear(); madeDirs.add(d); }
    const tmp = path.join(d, `.hearth-tmp-${rand()}-${path.basename(file)}`);
    try { await writeFlushed(tmp, data); } catch (err) { if (err.code !== 'ENOENT') throw err; await fsp.mkdir(d, { recursive: true }); await writeFlushed(tmp, data); } // (its folder went away meanwhile)
    o.fault?.(fault, file);
    let ok = false;
    try { ok = await renameRetry(tmp, file, () => same(file, ent)); } finally { if (!ok) await fsp.rm(tmp, { force: true }).catch(() => {}); }
    return ok;
  }
  // big files: copied in chunks into "<name>.hearth-part" next to the target; a copy cut short (quit, crash, the
  // cloud folder gone) goes on from where it stopped next time, if the source hasn't changed.
  // (round 73, syncmedia73) x: { stage (put the copy together in this folder, then move it in whole: a push's half file
  // never sits in the cloud folder, where the cloud client starts uploading it as it grows), onChunk(pos, size) (progress) }
  async function copyBig(src, dst, ent, expectHash, x = {}) {
    const st0 = await fsp.stat(src);
    const part = x.stage ? path.join(x.stage, `.hearth-part-${sha(nfc(dst)).slice(0, 20)}`) : path.join(path.dirname(dst), `.hearth-part-${path.basename(dst)}`);
    const meta = `${part}.json`;
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    if (x.stage) await fsp.mkdir(x.stage, { recursive: true });
    let start = 0;
    const m = readJsonSync(meta);
    const pst = statSync(part);
    if (m && pst && m.size === st0.size && m.mtime === st0.mtimeMs && (!x.stage || m.src === src) && pst.size <= st0.size) start = pst.size - (pst.size % CHUNK);
    else {
      // (round 74, synchard74) a full disk already here: neither half-written note nor empty part is left behind
      try { await fsp.writeFile(meta, JSON.stringify({ size: st0.size, mtime: st0.mtimeMs, src })); await fsp.writeFile(part, ''); } catch (err) { await fsp.rm(meta, { force: true }).catch(() => {}); await fsp.rm(part, { force: true }).catch(() => {}); throw err; }
    }
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
        x.onChunk?.(pos, st0.size); // (round 73)
        o.fault?.('chunk', dst, pos);
        if (o.chunkWait) await o.chunkWait(dst, pos); // (round 73) tests: hold a copy mid-way
        if (stopping) throw Object.assign(new Error('stopped'), { code: 'STOPPED' });
      }
    } catch (err) {
      // (round 74, synchard74) the disk filled up mid-copy: the half part only takes the room the owner needs back
      // (the file it was going to replace is untouched; the copy starts again once there is room)
      if (Hard.classify(err) === 'disk-full') { await rf.close().catch(() => {}); await wf.close().catch(() => {}); await fsp.rm(part, { force: true }).catch(() => {}); await fsp.rm(meta, { force: true }).catch(() => {}); }
      throw err;
    } finally { await rf.close().catch(() => {}); await wf.close().catch(() => {}); }
    const hex = h.digest('hex');
    const st1 = await fsp.stat(src);
    if (st1.size !== st0.size || st1.mtimeMs !== st0.mtimeMs || (expectHash && hex !== expectHash)) {
      await fsp.rm(part, { force: true }); await fsp.rm(meta, { force: true });
      return null; // changed while copying: next pass
    }
    let ok;
    try { ok = await renameRetry(part, dst, () => same(dst, ent)); } catch (err) {
      if (err.code !== 'EXDEV') throw err;
      // (round 73) the staging folder is on another disk than the cloud drive: copied over once, then renamed
      const tmp = path.join(path.dirname(dst), `.hearth-tmp-${rand()}-${path.basename(dst)}`);
      await fsp.copyFile(part, tmp); await flushed(tmp);
      ok = await renameRetry(tmp, dst, () => same(dst, ent));
      if (!ok) await fsp.rm(tmp, { force: true });
      await fsp.rm(part, { force: true });
    }
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
  const OFF_MIN = o.offMin ?? 256 * 1024; const WHOLE_MAX = 1024 * 1024; // (round 72) offMin: tests send every store through the thread
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
  // (round 73, syncmedia73) a file whose cloud copy the owner made online-only (Free up space) still follows changes:
  // a NEW version from the other computer is read (downloaded) as before; an unchanged one is never touched
  const freedChanged = (rel, C) => Boolean(state.freed?.[rel]) && !cachedThere(rel, C);
  function readable(rel, C) {
    if (C.downloading) return false;
    if (!C.placeholder) return true;
    if (isStub(C)) { const j = journalLatest.get(rel); if (state.freed?.[rel] ? Boolean(j?.h && j.h !== state.cloud[rel]?.[2]) : (!j || (j.s ?? 0) <= SMALL || o.allowDownload?.has(rel))) o.requestDownload?.(C.file, rel); return false; }
    return (C.size ?? 0) <= SMALL || Boolean(o.allowDownload?.has(rel)) || Boolean(state.freed?.[rel]);
  }
  async function cloudReady(rel, C) {
    if (!C.downloading && !C.placeholder) return true;
    if (isStub(C)) { readable(rel, C); return false; } // asks the Mac provider for its stub
    // Preserve small-file / explicit downloads, but do not move a placeholder
    // until its read completes and the provider confirms local availability.
    if (C.cloudUnknown || (C.size > SMALL && !o.allowDownload?.has(rel) && !freedChanged(rel, C))) return false; // (round 73) freedChanged
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
      if (c && c[2] && (C.size === null || c[0] === C.size) && (!j || j.h === c[2] || c[3] === jkey(rel))) return c[2]; // (round 72, sync72) jkey
      return j && j.op !== 'del' && (C.size === null || j.s === C.size) ? j.h : UNKNOWN; // (round 72) a delete has no hash
    }
    if (c && c[0] === C.size && c[1] === C.mtime && c[2]) return c[2];
    // still being written (whole milliseconds: a file's mtime has sub-ms precision while now() is truncated, so a file
    // written this very millisecond looked 0.4 ms "in the future" and never started its arriving clock below)
    // (round 77, synclatency77) o.jsonSettleMs: a store needs less (a half-written JSON never parses: still arriving below)
    if (fresh(rel, C, S.isJsonRel(rel) && o.jsonSettleMs != null ? o.jsonSettleMs : o.settleMs ?? 2000)) return INFLIGHT; // (round 72, sync72) a clock ahead no longer holds it
    // not the size the other computer wrote: still arriving (a cloud client writing in place), unless it stays like
    // this for a minute (then the journal is the one late, and the file is what it is)
    // (round 72, sync72) SMALLER than what the other computer wrote is a download that stopped midway (a provider
    // paused / offline mid-file): it waits as long as it stays short (up to 6 h), whatever the journal's age; a half
    // video was pulled into the data folder after a minute before
    const short = Boolean(j && j.op !== 'del' && typeof j.s === 'number' && C.size < j.s);
    if (j && j.op !== 'del' && j.s !== C.size && (short || now() - j.t < 30 * 60 * 1000)) {
      const seen = arriving.get(rel);
      if (!seen || seen.size !== C.size || seen.mtime !== C.mtime) { arriving.set(rel, { size: C.size, mtime: C.mtime, since: now() }); return INFLIGHT; }
      if (now() - seen.since < (short ? (o.shortMs ?? 6 * 3600000) : (o.stableMs ?? 60000))) return INFLIGHT;
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
    state.cloud[rel] = [C.size, C.mtime, h, jkey(rel)]; // (round 72, sync72) + the journal entry it was made under
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
  const notePulled = (rel, kind, acc) => { pulledAt.set(rel, Date.now()); return (acc?.pulled || pulledNow).push({ rel, kind, from: nameOf(journalLatest.get(rel)?.m), ...(S.isJsonRel(rel) && !pulledPrev.has(rel) && !/-deleted$/.test(kind) ? { guard: false } : {}) }); }; // (round 73) acc: the big lane's own · (round 77, storeack77) pulledAt; guard: false = no base kept for the write guard (a store ≥ 16 MB): the window must not write its older copy first
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
    const st = await fsp.stat(localPathOf(rel)).catch(() => null); // (round 72) async: one stat per pulled file
    if (st) state.local[rel] = [st.size, st.mtimeMs, h];
  }
  async function afterCloudWrite(rel, h) {
    const st = await fsp.stat(cloudPathOf(rel));
    if (st) state.cloud[rel] = [st.size, st.mtimeMs, h, jkey(rel)];
    journalOut.push({ t: now(), op: 'put', rel, h, s: st?.size });
  }

  // (round 73, syncmedia73) acc: { sum, pulled, onChunk } of the big lane (it runs beside the passes: their counters
  // and pulled lists are not its own)
  async function push(rel, L, C, h, acc) {
    const dst = C?.file && !/\.icloud$/.test(C.file) ? C.file : cloudPathOf(rel);
    const cent = C ? { size: C.size, mtime: C.mtime } : null;
    if (C?.placeholder && /\.icloud$/.test(C.file || '')) { // replacing an iCloud stub: move it aside first
      if (!(await moveToCloudTrash(rel, C))) return false;
    }
    const target = C?.placeholder && /\.icloud$/.test(C.file || '') ? null : cent;
    let ok;
    if (S.isJsonRel(rel)) {
      // (round 82, bigchat82) a giant chat: its cloud form made on the files thread from its messages' bytes, handed over
      // as bytes (was: read, parsed, converted and stringified HERE, on the main process: ≈ 2 s for a 60 MB chat)
      const big = o.textJson && /^chats\//.test(rel) && (L.size || 0) >= (o.textMin ?? 16e6) ? await o.textJson({ file: L.file, rel, ctx }).catch(() => null) : null;
      const text = big?.text || await localText(rel, L);
      if ((big?.text ? big.h : hashed.get(text) ?? sha(text)) !== h) return false; // (round 20) a text hashed on the store thread isn't hashed again
      ok = await casWrite(dst, target, text, 'push');
      if (ok) setBase(rel, h, text);
    } else if (L.size <= SMALL) {
      const buf = await fsp.readFile(L.file);
      if (sha(buf) !== h) return false;
      ok = await casWrite(dst, target, buf, 'push');
      if (ok) setBase(rel, h);
    } else {
      ok = Boolean(await copyBig(L.file, dst, target, h, { stage: STAGE, onChunk: acc?.onChunk })); // (round 73) staged, with progress
      if (ok) setBase(rel, h);
    }
    if (!ok) return false;
    await afterCloudWrite(rel, h);
    (acc?.sum || sum).pushed += 1;
    return true;
  }
  async function pull(rel, L, C, h, acc) {
    const file = localPathOf(rel);
    const lent = L && !L.unavailable ? { size: L.size, mtime: L.mtime } : null;
    if (L?.unavailable) return false;
    let ok;
    if (S.isJsonRel(rel) && rel !== 'app/config.json' && o.pullJson && Math.max(C.size || 0, L?.size || 0) >= OFF_MIN) {
      // (round 72, sync72) a big store: read, checked, its paths made ours, the local copy kept aside and written out in
      // this computer's form on the store thread (was 60–130 ms of the main process per store); here, only the writes
      const r = await o.pullJson({ rel, cloudFile: C.file, h, ctx, localFile: L?.file || null,
        recovery: L?.file && /^(?:chats|kv)\/[^/]+\.json$/i.test(rel) ? path.join(stateDir, 'recovery', ...rel.split('/')) : null,
        aside: rel === 'kv/three-sketches.json' && L?.file ? { dir: path.join(dataDir, 'kv', '.history', 'three-sketches'), now: now() } : null }).catch((err) => { log('pull off', rel, err.message); return null; });
      if (!r || r.stale) return false;
      ok = await casWrite(file, lent, r.out, 'pull');
      if (ok) { setBase(rel, h, r.cloudText); remember(rel, r.prevCloud === null ? null : { lazy: r.prevCloud }); await afterLocalWrite(rel, r.lh); }
    } else if (S.isJsonRel(rel)) {
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
      ok = Boolean(await copyBig(C.file, file, lent, h, { onChunk: acc?.onChunk })); // (round 73) progress
      if (ok) { setBase(rel, h); await afterLocalWrite(rel, h); }
    }
    if (!ok) return false;
    // what arrived isn't what the journals say (written by hand, or the journal is late): say so in ours, so the
    // other computers don't wait for a version that never comes
    const j = journalLatest.get(rel);
    if (j && (j.h !== h || (C.size !== null && j.s !== C.size))) journalOut.push({ t: now(), op: 'put', rel, h, s: C.size ?? undefined });
    (acc?.sum || sum).pulled += 1;
    notePulled(rel, kindOf(rel), acc);
    return true;
  }
  async function relHashNow(rel) {
    let v = S.parseJson(await fsp.readFile(localPathOf(rel), 'utf8')); // (round 72) not a sync read per pulled file
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
      await baseIdle(rel); // (round 72) its base file on disk first
      let m; // { text, hm, local() (this computer's form), conflicts, theirsText, ours (for the write guard), aside() }
      if (rel !== 'app/config.json' && o.mergeJson && Math.max(L.size || 0, C.size || 0) >= OFF_MIN) {
        // (round 72, sync72) a big store: merged on the store thread (both parsed, three-way, the local form); here, writes
        const r = await o.mergeJson({ rel, localFile: L.file, cloudFile: C.file, baseFile: state.base[rel] ? basePath(rel) : null, ctx, lh, ch, counters: S.isCounterRel(rel), keepAll: rebased.has(rel),
          recovery: /^(?:chats|kv)\/[^/]+\.json$/i.test(rel) ? path.join(stateDir, 'recovery', ...rel.split('/')) : null,
          aside: rel === 'kv/three-sketches.json' ? { dir: path.join(dataDir, 'kv', '.history', 'three-sketches'), now: now() } : null }).catch((err) => { log('merge off', rel, err.message); return null; });
        if (!r || r.stale) return false;
        m = { text: r.text, hm: r.hm, local: () => r.localOut, conflicts: r.conflicts, theirsText: r.theirsText, ours: r.oursText === null ? undefined : { lazy: r.oursText }, aside: async () => {} };
      } else {
        const ours = S.parseJson(await localText(rel, L));
        const theirsText = await cloudText(rel, C);
        const theirs = S.toCloud(S.parseJson(theirsText), ctx);
        const base = state.base[rel] ? readBase(rel) : null;
        const r = S.merge3(base, ours, theirs, { counters: S.isCounterRel(rel), keepAll: rebased.has(rel) }); // (round 72, sync72)
        const text = canon(r.value);
        m = { text, hm: sha(text), local: () => localJsonText(rel, S.fromCloud(r.value, ctx), L), conflicts: r.conflicts, theirsText, ours, aside: async () => { keepScenesAside(rel, L, r.value); await keepStateAside(rel, L); } };
      }
      const { text, hm } = m;
      // this computer first, then the cloud: a cloud write that loses its race leaves the old base, so the next pass
      // merges again instead of pushing a version that misses the other computer's changes
      if (hm !== lh) {
        await m.aside();
        const ok = await casWrite(L.file, lent, m.local(), 'merge-local');
        if (!ok) return false;
        if (m.ours !== undefined) remember(rel, m.ours);
        await afterLocalWrite(rel, hm);
        notePulled(rel, kindOf(rel));
      }
      if (hm !== ch) {
        const ok = await casWrite(C.file, cent, text, 'merge-cloud');
        if (!ok) return false;
        await afterCloudWrite(rel, hm);
      }
      setBase(rel, hm, text); rebased.delete(rel);
      if (m.conflicts.length) await saveConflict(rel, { kind: 'json', text: m.theirsText, fields: m.conflicts, from: journalLatest.get(rel)?.m, oursAt: L.mtime, theirsAt: journalLatest.get(rel)?.t || C.mtime });
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
    if (laneBig(rel, L)) { laneAdd({ op: 'push', rel, L, C: null, h: lh }); return true; } // (round 73) a big one on its own lane
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
    const recase = caseOnly(from, to) && await sameNode(C.file, dst); // (round 72, sync72) Photo.png → photo.png: one file on a Mac / PC disk
    if (!recase && await exists(dst)) return false;
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    if (!(await renameRetry(C.file, dst, async () => (await same(C.file, C)) && (recase || await same(dst, null))))) return false;
    const st = await fsp.stat(dst);
    state.cloud[to] = [st.size, st.mtimeMs, h, jkey(to)]; delete state.cloud[from];
    await baseIdle(from); // (round 72)
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
    const recase = caseOnly(from, to) && await sameNode(L.file, dst); // (round 72, sync72) a case-only rename (it waited forever)
    if (!recase && await exists(dst)) return false;
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    if (!(await renameRetry(L.file, dst, async () => (await same(L.file, L)) && (recase || await same(dst, null))))) return false;
    const st = await fsp.stat(dst);
    state.local[to] = [st.size, st.mtimeMs, h]; delete state.local[from];
    await baseIdle(from); // (round 72)
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
    // (round 72, sync72) our own upload moved aside (see rebase): this computer has it (or newer), it goes to the trash
    if (cp.ours) { if (!(await same(cp.file, cp)) || !(await moveToCloudTrash(cp.rel, cp))) return false; sum.merged += 1; return true; }
    if (!(await cloudReady(cp.rel, cp)) || fresh(cp.rel, cp, o.settleMs ?? 4000)) return false;
    // (round 72, sync72) a copy of a non-JSON file (named like one, never claimed by a computer's journal) is taken for a
    // cloud client's once it stayed as it is for 10 minutes: a file the other computer named so is claimed meanwhile
    if (cp.unsure) {
      const s = copySeen.get(cp.rel);
      if (!s || s.size !== cp.size || s.mtime !== cp.mtime) { if (copySeen.size > 500) copySeen.clear(); copySeen.set(cp.rel, { size: cp.size, mtime: cp.mtime, since: now() }); return false; }
      if (now() - s.since < (o.copyWaitMs ?? 600000)) return false;
      copySeen.delete(cp.rel);
    }
    const L = local.get(cp.orig);
    try {
      if (S.isJsonRel(cp.orig) && !cp.placeholder && L && !L.unavailable) {
        let theirs; try { theirs = S.toCloud(S.parseJson(await fsp.readFile(cp.file, 'utf8')), ctx); } catch { return; }
        const ours = S.parseJson(await localText(cp.orig, L));
        // (round 72, sync72) a cloud client's copy forked from an OLDER version than this computer's base: the base may
        // already be the other computer's version (just pulled), so the copy looked like it had deleted everything that
        // version added (iCloud slow + a chat written on both → the PC's messages gone). Merged with no base: both kept.
        const r = S.merge3(null, ours, theirs, { counters: S.isCounterRel(cp.orig), shared: true });
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

  // ---------- (round 73, syncmedia73) the big lane ----------
  // Big files (videos, renders, stems: over 8 MB and not a JSON store) are hashed and copied here, one at a time, beside
  // the passes. A pass plans them and goes on, so a chat or a setting never waits behind a 2 GB upload (it waited for
  // the whole copy before). A new big file is hashed while it copies (read once, not twice). Each file's progress is in
  // the status (transfers); a copy cut short goes on from where it stopped (copyBig). After each file the lane asks for
  // a pass (o.onLane) so what it changed settles at once.
  const LANE_MIN = o.laneMin ?? SMALL;
  const STAGE = path.join(stateDir, 'parts');
  const lane = { q: [], cur: null, run: null, tick: 0, fault: null };
  const inLane = (rel) => lane.cur?.rel === rel || lane.q.some((j) => j.rel === rel);
  const laneBig = (rel, ...ents) => !S.isJsonRel(rel) && ents.some((e) => e && !e.unavailable && (e.size ?? 0) > LANE_MIN);
  const cachedHere = (rel, L) => { const c = state.local[rel]; return Boolean(c && c[0] === L.size && c[1] === L.mtime && c[2]); };
  function cachedThere(rel, C) { const c = state.cloud[rel]; return Boolean(c && c[2] && (C.size === null || c[0] === C.size) && (C.size === null || c[1] === C.mtime)); }
  function laneAdd(job) {
    if (inLane(job.rel)) return;
    lane.q.push({ op: job.op, side: job.side, rel: job.rel, L: job.L, C: job.C, h: job.h, done: 0, total: Math.max(job.L?.size || 0, job.C?.size || 0), at: now() });
    laneGo();
  }
  function laneGo() {
    if (lane.run || !lane.q.length || stopping) return;
    lane.run = (async () => {
      while (lane.q.length && !stopping) {
        const j = lane.cur = lane.q.shift();
        const acc = { sum: counts(), pulled: [], onChunk: (pos) => { j.done = pos; if (Date.now() - lane.tick >= 500) { lane.tick = Date.now(); emit(); } } };
        let ok = false;
        emit();
        try { ok = Boolean(await laneDo(j, acc)); } catch (err) {
          if (err.code === 'STOPPED') break;
          if (err.code === 'FAULT') { lane.fault = err; lane.q.length = 0; break; } // tests: a simulated crash
          const kind = await blockErr(j.rel, err); // (round 74, synchard74) shown by name with a fix; a full disk stops the lane (each next copy would fail the same way)
          if (kind) { const b = (status.blocked || []).find((x) => x.rel === j.rel && x.why === kind); if (b) b.lane = true; if (kind === 'disk-full') lane.q.length = 0; log('lane', j.op, j.rel, err.message); }
          else if (err.code !== 'ENOENT') { status.lastError = { rel: j.rel, op: j.op, message: err.message, code: err.code || '', at: now() }; log('lane', j.op, j.rel, err.message); }
        }
        lane.cur = null;
        if (ok && status.blocked?.some((b) => b.rel === j.rel)) status.blocked = status.blocked.filter((b) => b.rel !== j.rel); // (round 74) it moved after all
        await baseIdle(); await flushJournal().catch((err) => log('journal', err.message));
        saveState();
        if (acc.pulled.length) o.onPulled?.(acc.pulled);
        emit();
        if (ok) o.onLane?.({ rel: j.rel, op: j.op }); // a pass settles it (none after a file that couldn't move: no loop)
      }
    })().finally(() => { lane.run = null; lane.cur = null; });
    return lane.run;
  }
  async function laneDo(j, acc) {
    if (j.op === 'push') return push(j.rel, j.L, j.C, j.h, acc);
    if (j.op === 'pull') return pull(j.rel, j.L, j.C, j.h, acc);
    if (j.op === 'hash') { const h = j.side === 'c' ? await cloudHash(j.rel, j.C) : await localHash(j.rel, j.L); return typeof h === 'string' && h.length === 40; }
    if (j.op === 'pushNew') { // new here, nothing in the cloud, no history: hashed while it copies, staged outside the cloud folder
      const hex = await copyBig(j.L.file, cloudPathOf(j.rel), null, null, { stage: STAGE, onChunk: acc.onChunk });
      if (!hex) return false;
      const st = await fsp.stat(j.L.file).catch(() => null);
      if (st && st.size === j.L.size && st.mtimeMs === j.L.mtime) state.local[j.rel] = [st.size, st.mtimeMs, hex];
      setBase(j.rel, hex);
      await afterCloudWrite(j.rel, hex);
      acc.sum.pushed += 1;
      return true;
    }
    return false;
  }
  const laneList = () => [lane.cur, ...lane.q].filter(Boolean).slice(0, 30).map((j) => ({ rel: j.rel, op: j.op === 'pull' ? 'down' : j.op === 'hash' ? 'check' : 'up', done: j.done || 0, total: j.total || 0, moving: j === lane.cur }));
  const laneIdle = async () => { while (lane.run) await lane.run; await stateQ; }; // (round 74) + its state on disk

  // ---------- (round 73, syncmedia73) Free up space ----------
  // A big synced file is on this computer twice: Hearth's copy in the data folder (the one it uses) and the cloud
  // drive's copy in its folder. The cloud drive can make ITS copy online-only (o.evict: Windows attrib +U, macOS evict):
  // it stays in the cloud and on the other computer, and Hearth keeps working from its own. Only files whose three
  // versions agree (here, in the cloud, the last synced), not moving, and over 8 MB (small ones are read by sync, which
  // would download them again). Never anything not synced; only when the owner clicks (the panel lists them first).
  async function freeCheck(rel) {
    if (o.skip?.(rel) || S.isJsonRel(rel) || inLane(rel) || S.localOnly(rel)) return null;
    const c = state.cloud[rel]; const l = state.local[rel]; const b = state.base[rel];
    if (!c || !l || !b || c[2] !== b || l[2] !== b || (c[0] || 0) <= SMALL) return null;
    const file = cloudPathOf(rel);
    let st; let sl;
    try { [st, sl] = await Promise.all([fsp.stat(file), fsp.stat(localPathOf(rel))]); } catch { return null; }
    if (st.size !== c[0] || st.mtimeMs !== c[1] || sl.size !== l[0] || sl.mtimeMs !== l[1]) return null; // changed since the last pass
    if (platform === 'darwin' && st.size > 0 && st.blocks === 0) return null; // already online-only
    return { rel, size: st.size, file };
  }
  async function freeable() {
    let items = [];
    for (const rel of keysOf(state.cloud)) { const x = await freeCheck(rel); if (x) items.push(x); }
    if (platform === 'win32' && items.length) { // already online-only (Files On-Demand): not listed
      let a; try { a = await (o.cloudAttributes || require('./cloud-files').attributes)(items.map((x) => x.file)); } catch { a = new Map(); }
      items = items.filter((x) => !require('./cloud-files').pending(a.get(x.file)) || !Number.isInteger(a.get(x.file)));
    }
    items.sort((x, y) => y.size - x.size);
    return { items: items.map((x) => ({ rel: x.rel, size: x.size })), bytes: items.reduce((n, x) => n + x.size, 0), can: Boolean(o.evict) };
  }
  async function free(rels) {
    const out = { done: [], failed: [], bytes: 0, unsupported: false };
    if (!o.evict) return { ...out, unsupported: true };
    for (const rel of rels || []) {
      const x = await freeCheck(String(rel));
      if (!x) { out.failed.push({ rel, why: 'not-synced' }); continue; }
      let r; try { r = await o.evict(x.file, { rel: x.rel }); } catch (err) { r = { ok: false, error: err.message }; }
      if (!r?.ok) { out.failed.push({ rel, why: r?.unsupported ? 'unsupported' : 'refused', error: r?.error || '' }); if (r?.unsupported) { out.unsupported = true; break; } continue; }
      (state.freed ||= {})[x.rel] = 1;
      if (!r.already) { out.done.push(x.rel); out.bytes += x.size; if (r.later) out.later = (out.later || 0) + 1; } // later: the drive finishes it in a moment
    }
    saveState(); emit();
    return out;
  }

  // ---------- (round 74, synchard74) the sync panel's fix buttons ----------
  // fix(rel, how) → { ok, to?, links?, error? }
  //   'rename'    Rename for Windows: this computer's file gets a name a PC can hold (and short enough); every link to it
  //               in Hearth's own data (chats, scenes, boards…) is changed the way a file arriving from the other
  //               computer changes them (a copy kept first; the app's next save merges with it); then sync moves it
  //   'writable'  Allow changes: the file's read-only mark is taken off (the owner's or a copy's), so sync can update it
  //   'unsecret'  Remove from the cloud: a key / token file an older version put in the cloud copy is moved out, into
  //               this computer's Deleted files (never synced; 30 days, like anything deleted)
  async function fix(rel, how) {
    rel = nfc(String(rel || ''));
    if (!rel || rel.split('/').some((x) => !x || x === '.' || x === '..')) return { ok: false, error: 'Not a synced file' };
    if (how === 'writable') {
      let done = 0;
      for (const f of [localPathOf(rel), cloudPathOf(rel)]) {
        try { const st = await fsp.stat(f); if (!(st.mode & 0o200)) { await fsp.chmod(f, st.mode | 0o200); done += 1; } } catch { /* not there */ }
      }
      return done ? { ok: true } : { ok: false, error: 'It isn\'t read-only any more.' };
    }
    if (how === 'unsecret') {
      if (!Hard.secretName(rel)) return { ok: false, error: 'Not a key file' };
      const C = cloudPathOf(rel);
      if (!(await exists(C))) return { ok: true, gone: true };
      const dir = path.join(stateDir, 'trash', day(now()), ...rel.split('/').slice(0, -1));
      await fsp.mkdir(dir, { recursive: true });
      let dst = path.join(dir, path.basename(C));
      if (await exists(dst)) dst = path.join(dir, `${rand()}-${path.basename(C)}`);
      try { await renameRetry(C, dst); } catch (err) { if (err.code !== 'EXDEV') throw err; await fsp.copyFile(C, dst); await fsp.rm(C, { force: true }); }
      delete state.cloud[rel]; dropBase(rel); saveState();
      return { ok: true, kept: dst };
    }
    if (how !== 'rename') return { ok: false, error: 'Nothing to fix there' };
    if (SPECIAL[rel] || state.ext[rel]) return { ok: false, error: 'Hearth\'s own settings file can\'t be renamed' };
    const from = localPathOf(rel);
    let st; try { st = await fsp.stat(from); } catch { return { ok: false, error: 'It isn\'t on this computer' }; }
    const taken = (r) => r !== rel && (fs.existsSync(localPathOf(r)) || Boolean(state.base[r]));
    const to = Hard.winSafeRel(rel, { rootLen: winRootLen(), taken });
    if (to === rel) return { ok: false, error: 'Its name is already fine for Windows' };
    const dst = localPathOf(to);
    await fsp.mkdir(path.dirname(dst), { recursive: true });
    const L = { size: st.size, mtime: st.mtimeMs };
    if (!(await renameRetry(from, dst, async () => (await same(from, L)) && (caseOnly(rel, to) || await same(dst, null))))) return { ok: false, error: 'It changed just now: try again' };
    const links = await relink(rel, to).catch((err) => { log('relink', err.message); return 0; });
    notePulled(rel, `${kindOf(rel)}-deleted`); notePulled(to, kindOf(to));
    if (pulledNow.length) { o.onPulled?.(pulledNow.slice()); pulledNow = []; }
    return { ok: true, to, links };
  }
  // every string in Hearth's own JSON data pointing at `from` (a path in the data folder, a file:// URL to it, or the
  // bare relative path) now points at `to`: done like a pull (the copy before kept aside, written only if unchanged
  // since read, the app told to reload; its next save of an older copy merges with this one: the write guard)
  async function relink(from, to) {
    const enc = (r) => r.split('/').map(encodeURIComponent).join('/');
    const plain = new Set([`hearth-data:/${from}`]); const url = new Set([`hearth-data-url:/${from}`, `hearth-data-url:/${enc(from)}`, `hearth-data-url:/${encodeURI(from)}`]);
    const swap = (v) => {
      if (typeof v === 'string') {
        if (v === from) return to;
        if (plain.has(v)) return `hearth-data:/${to}`;
        for (const u of url) if (v === u || v.startsWith(`${u}?`) || v.startsWith(`${u}#`)) return `hearth-data-url:/${enc(to)}${v.slice(u.length)}`;
        return v;
      }
      if (Array.isArray(v)) return v.map(swap);
      if (v && typeof v === 'object') { const out = {}; for (const k of Object.keys(v)) out[k] = swap(v[k]); return out; }
      return v;
    };
    const name = path.basename(from); const needles = [name, encodeURIComponent(name), encodeURI(name), JSON.stringify(name).slice(1, -1)];
    let n = 0;
    const local = await scanLocal();
    for (const [rel, L] of local) {
      if (!S.isJsonRel(rel) || SPECIAL[rel] || L.unavailable || L.size > 16e6) continue;
      let text; try { text = await fsp.readFile(L.file, 'utf8'); } catch { continue; }
      if (!needles.some((x) => text.includes(x))) continue;
      let v; try { v = S.toCloud(S.parseJson(text), ctx); } catch { continue; }
      const before = canon(v); const next = swap(v); const after = canon(next);
      if (after === before) continue;
      await keepStateAside(rel, L).catch(() => {});
      if (!(await casWrite(L.file, L, localJsonText(rel, S.fromCloud(next, ctx), L), 'relink'))) continue;
      remember(rel, v);
      n += 1; notePulled(rel, kindOf(rel));
    }
    return n;
  }

  // ---------- one pass ----------
  async function pass(opts = {}) {
    if (running) { again = true; addScope(opts); return running; } // (round 79, syncscope79) what it asked to look at waits for the next round
    stopping = false;
    running = (async () => {
      let r;
      do { again = false; r = await passOnce(opts); opts = takeScope(); } while (again && !stopping); // (round 79) the asks that came meanwhile (any whole one: whole)
      await stateQ; // (round 74) its state on disk before the pass counts as done
      return r;
    })();
    try { return await running; } finally { running = null; }
  }
  async function passOnce(opts) {
    sum = counts(); pulledNow = []; texts = new Map(); hashed = new Map(); status.resumed = 0; status.bytes = 0;
    pendRels = new Set(); const nf0 = needFull; needFull = 'unfinished'; // (round 79, syncscope79) a pass that doesn't end well: the next one looks at everything
    await ready; // (round 75, syncstate75) the state read (asynchronously, at start)
    store.watch(state); // (round 74) the big maps say when they change (round 75: which buckets)
    const t0 = now();
    blockNow = []; // (round 74, synchard74) this pass's blocked files
    if (heldStart) { // (round 43, datasafe) the machine / state file read now, or this pass waits
      const m = readJsonSync(machineFile);
      if (m === HELD) return finish({ state: 'offline', error: 'held' }, t0);
      heldStart = false;
      if (!(await loadState())) return finish({ state: 'offline', error: 'held' }, t0); // (round 75) its pieces too
      if (m?.id) machine = { ...m, name: machine.name, platform }; else writeJsonSync(machineFile, { id: machine.id, created: machine.created });
    }
    if (!(await exists(cloudRoot))) return finish({ state: 'offline', error: '' }, t0);
    if (!(await exists(FILES))) {
      if (keysOf(state.base).length && !opts.fresh) return finish({ state: 'offline', error: 'missing' }, t0);
      await fsp.mkdir(FILES, { recursive: true });
      await atomicWrite(path.join(cloudDir, 'README.txt'), 'This folder is Hearth\'s sync copy (chats, scenes, boards, notes, settings…).\nHearth keeps working from each computer\'s own folder and copies changes here and back.\nPlease don\'t edit files here. Deleted things wait in trash/ for 30 days.\n');
    }
    if (opts.fresh) { await baseIdle(); state.base = {}; baseDirs.clear(); try { fs.rmSync(path.join(stateDir, 'base'), { recursive: true, force: true }); } catch { /* fine */ } }
    // (round 74, synchard74) the two computers on different versions: a newer Hearth that changed how it keeps things
    // in the cloud says so in .sync/format.json ({ min }); an older one then stops writing (it would damage them) and
    // says "update Hearth on this computer". This version only reads it (o.minFormat raises it, for a future break).
    const fmt = await readFormat();
    if (fmt.min > ME) return finish({ state: 'offline', error: 'old-version', need: fmt.min }, t0);
    if (o.minFormat && o.minFormat <= ME && !(fmt.min >= o.minFormat)) await atomicWrite(path.join(META, 'format.json'), JSON.stringify({ min: o.minFormat, by: machine.name, at: now() })).catch((err) => log('format', err.message));
    status.state = 'syncing'; emit();
    laneGo(); // (round 73) a lane stopped with the engine goes on
    await readPeers();
    if (o.devices) await o.devices.beforePass({ id: machine.id, writeMachine: () => writeMachine(true) }).catch((err) => log('devices', err.message)); // (round 90, devices90) this computer was forgotten (Settings › Your computers) and is back: its record again at once, before anything moves (devices90-core.js rejoin)
    const filesId = await fsp.stat(FILES).then((x) => `${x.dev}:${x.ino}`, () => ''); // (round 74) the cloud folder this pass looks at
    // (round 79, syncscope79) the paths the watchers heard (and what the last pass left open), or everything
    let sc = scopeOf(opts, filesId, nf0); let scan = null;
    if (!sc.why) { scan = await scopedScan(sc); if (scan.full) sc = { why: scan.full }; }
    const fullLook = Boolean(sc.why);
    const dirsL = fullLook ? new Map() : scan.dirsL; const dirsC = fullLook ? new Map() : scan.dirsC;
    const local = fullLook ? await scanLocal(dirsL) : scan.local;
    const { files: cloud, copies } = fullLook ? await scanCloud(local, dirsC) : { files: scan.cloud, copies: scan.copies };
    seen = { local, cloud, dirsL, dirsC, filesId, startedAt: t0, touchy: new Set(), cur: seen?.cur || { l: 0, c: 0, dl: 0, dc: 0 },
      fullAt: fullLook ? t0 : seen.fullAt, keysL: fullLook ? [...local.keys()] : seen.keysL, keysC: fullLook ? [...cloud.keys()] : seen.keysC,
      dirKeysL: [...dirsL.keys()], dirKeysC: [...dirsC.keys()] }; // (folders found since the whole look are checked too)
    jNew.clear(); jNewAll = false;
    Object.assign(scopeStats, { mode: fullLook ? 'full' : 'scoped', lastWhy: sc.why || '', looked: fullLook ? local.size + cloud.size + dirsL.size + dirsC.size : scan.looked, notes: fullLook ? [] : scan.notes.slice(0, 8) });
    if (fullLook) { scopeStats.full += 1; scopeStats.lastFull = t0; } else scopeStats.scoped += 1;
    // (round 74, synchard74) the cloud folder moved / renamed / unmounted DURING the scan (the drive ejected, the cloud
    // client relocating its folder): what was scanned is not the cloud, it is a hole. Paused, never "all deleted".
    if (!filesId || filesId !== await fsp.stat(FILES).then((x) => `${x.dev}:${x.ino}`, () => '')) return finish({ state: 'offline', error: 'missing' }, t0);
    // (round 74, synchard74) the cloud folder is there but empty, while this computer synced files with it and no
    // computer's journal says they were deleted: a cloud client starting over (OneDrive reset, iCloud signed out and back
    // in, a new empty folder put where the old one was). Paused with a plain question; never "everything deleted".
    if (!opts.fresh && opts.mass !== 'apply' && !cloud.size && !copies.length && !cloud.blind.size) {
      const known = keysOf(state.cloud).filter((rel) => state.base[rel] && !S.localOnly(rel) && !o.skip?.(rel));
      const said = known.filter((rel) => journalLatest.get(rel)?.op === 'del').length;
      if (known.length >= 3 && said < known.length / 2) return finish({ state: 'offline', error: 'emptied', known: known.length }, t0);
    }
    for (const rel of cloud.secrets || []) block(rel, 'secret-cloud', { where: 'cloud' }); // (round 74) keys an older version synced
    // (round 74, synchard74) on a Windows PC: files the other computer made whose names Windows can't hold (the cloud
    // client never brings them here): said by name, fixed on that computer ("Rename for Windows" there)
    if (platform === 'win32') for (const [rel, j] of journalLatest) { if (j.op !== 'del' && !cloud.has(rel) && !local.has(rel)) { const bad = Hard.winBad(rel, { rootLen: 0 }); if (bad && bad.why !== 'win-long') block(rel, 'win-there', { where: 'there', part: bad.part }); } }
    // (round 74, synchard74) a clock jump between two files = the computer slept mid-pass (once in a row: a pass that
    // really took that long between two files on a very slow disk isn't started again and again)
    let tick = now(); let slept = 0; const noSleep = sleepRuns >= 1;
    status.kindSizes = await K.sizesAsync(local, cloud, breathe); // (round 73, syncmedia73) What syncs: each kind's size here and in the cloud (round 75: with breaths, 100,000 names at 50,000 files)
    // (round 72, sync72) the cloud client moved OUR last upload aside (its own copy) because the other computer's
    // version got there first: the file in the cloud is now theirs and never saw ours. The base goes back one step, so
    // ours (still here) and theirs merge three-way below; the copy (ours) then goes to the trash.
    for (const cp of copies) if (cp.ours && !o.skip?.(cp.orig)) { rebase(cp.orig); rebased.add(cp.orig); }
    const cap = o.big === false ? (o.bigCap || BIG_CAP) : Infinity;
    const plan = []; const skippedBig = []; const cloudOnly = []; const unreadable = []; let pending = 0;
    // (round 72, sync72) what waits and why, by name (the first 60), for the sync panel: "12 waiting" in plain words
    const waiting = []; const why = (rel, w) => { pendRels.add(rel); /* (round 79) */ if (waiting.length < 60 && !waiting.some((x) => x.rel === rel)) waiting.push({ rel, why: w }); };
    // A cloud client may briefly remove a single chat while replacing/hydrating it.
    // Absence is not deletion intent. Hearth's Delete action moves the exact chat
    // to trash/<id>.json; require that matching copy on the side that lost it.
    // A stale trash copy must not delete a newer conversation. Ordinary files keep
    // their existing deletion/rename behavior, and an unreadable trash copy is safe.
    // (round 72, sync72) → true | false | 'wait': a trash copy that is there but still arriving / only in the cloud is
    // "can't tell yet" (it was "keep", and the deleted chat was published again: it came back on both computers);
    // so is a chat the other computer's journal says it deleted / moved whose trash copy hasn't arrived (≤ 30 min)
    const chatRemoved = async (rel, h, files, hash) => {
      const trashRel = chatTrashRel(rel);
      if (!trashRel) return true;
      const entry = files.get(trashRel);
      if (!entry || entry.unavailable) return files === cloud && journalLatest.get(rel)?.op === 'del' && waitGone(rel) ? 'wait' : false;
      try { const th = await hash(trashRel, entry); return th === h ? true : th === INFLIGHT || th === UNKNOWN ? 'wait' : false; } catch { return false; }
    };
    // (round 75, syncstate75) every name both sides and the state know, gathered with breaths (150,000 at 50,000 files:
    // one spread held the main process ≈ 100 ms with the sizes above)
    const rels = new Set(); { let ri = 0; for (const src of [local.keys(), cloud.keys(), keysOf(state.base)]) for (const r of src) { rels.add(r); if ((++ri & 4095) === 0) { const b = breathe(); if (b) await b; } } }
    // (round 73, syncmedia73) sizes of files deleted here that may have been renamed: a big file being hashed on the lane
    // with one of these sizes holds that delete back a pass (else a renamed video went to the trash and up again)
    const goneSizes = new Set(); const laneSizes = new Set();
    // and a file moved here keeps its size and modified time: its hash comes along (a renamed 2 GB video isn't read again)
    const moved = new Map();
    let gi = 0;
    for (const rel of keysOf(state.base)) {
      if ((++gi & 2047) === 0) { const b = breathe(); if (b) await b; } // (round 74) 50,000 files: a breath now and then
      if (!local.has(rel) && cloud.get(rel)?.size) goneSizes.add(cloud.get(rel).size);
      if (!cloud.has(rel) && local.get(rel)?.size) goneSizes.add(local.get(rel).size);
      const c = state.local[rel]; if (!local.has(rel) && c?.[2] && c[0] > LANE_MIN) moved.set(`${c[0]}:${c[1]}`, c[2]);
    }
    // (round 75, syncstate75) a first sync (or many new files from the other computer): the small files not hashed yet are
    // read and hashed 8 at a time before the plan below (which then finds them cached); one after the other, 50,000 took
    // ≈ 16 s. Errors are left for the plan (it hashes again and says why).
    {
      const want = []; let wi = 0;
      for (const rel of rels) {
        if ((++wi & 1023) === 0) { const b = breathe(); if (b) await b; }
        const L = local.get(rel); const C = cloud.get(rel);
        const wl = L && !L.unavailable && L.size <= WHOLE_MAX && !cachedHere(rel, L); const wc = C && !C.placeholder && !C.downloading && (C.size ?? 0) <= WHOLE_MAX && !cachedThere(rel, C);
        if ((!wl && !wc) || S.isJsonRel(rel) || S.localOnly(rel) || o.skip?.(rel) || inLane(rel)) continue; // (the cheap checks first: a steady pass wants none)
        if (wl) want.push(() => localHash(rel, L));
        if (wc) want.push(() => cloudHash(rel, C));
      }
      if (want.length > 64) {
        let wn = 0;
        await Promise.all(Array.from({ length: 8 }, async () => { while (wn < want.length && !stopping) { const j = want[wn++]; try { await j(); } catch { /* the plan says */ } const b = breathe(); if (b) await b; } }));
        tick = now(); // (a long read here is not a sleep: what was hashed before one stays right, keyed by size + time)
      }
    }
    // (round 43, datasafe) a file or folder that couldn't be listed / looked at on one side is unknown there this pass:
    // never "deleted" (a held chats folder on Windows looked like every chat deleted, and the cloud copy went to trash)
    const blindIn = (set, rel) => set.size > 0 && (set.has(rel) || set.has('') || [...set].some((b) => b.endsWith('/') && rel.startsWith(b)));
    for (const rel of rels) {
      if (stopping) break;
      { const b = breathe(); if (b) await b; } // (round 74)
      if (!noSleep && now() - tick > SLEEP_GAP) { slept = now() - tick; break; } tick = now(); // (round 74) asleep mid-pass: start again
      if (S.localOnly(rel)) continue; // previously mirrored caches stay untouched on either side
      const L = local.get(rel); const C = cloud.get(rel); const bh = state.base[rel];
      if (o.skip?.(rel)) { if (bh) dropBase(rel); continue; } // (round 73, syncmedia73) a kind turned off here: both sides left as they are (and no history: turned on again, nothing is deleted)
      if (inLane(rel)) { pending += 1; why(rel, lane.cur?.rel === rel ? 'moving' : 'queued'); continue; } // (round 73) moving on the big lane
      // (round 77, synclatency77) o.hold(rel): a file saved again and again right now (a reply streaming into its chat)
      // waits while only this computer changed it; syncmain lets it through once it calms down, and at least every 20 s
      // (60 s while replies run). Not counted as waiting: nothing is late, it is still being written.
      { const L0 = local.get(rel); const C0 = cloud.get(rel); if (L0 && !L0.unavailable && o.hold?.(rel) && !cachedHere(rel, L0) && (!C0 || cachedThere(rel, C0))) { pendRels.add(rel); /* (round 79) looked at again next pass */ continue; } }
      if (C?.downloading) await cloudReady(rel, C);
      if (L?.unavailable) { pending += 0; continue; } // a render on a drive that isn't plugged in: left alone
      if ((!L && blindIn(local.blind, rel)) || (!C && blindIn(cloud.blind, rel))) { pending += 1; why(rel, 'unlisted'); continue; }
      if (!L && !C) { dropBase(rel); delete state.local[rel]; delete state.cloud[rel]; continue; }
      // (round 74, synchard74) names Windows can't hold. On the PC: never written here (":" would make an NTFS stream,
      // not a file; a trailing dot is dropped by Windows: another file). Elsewhere, when a PC syncs too: held back if it
      // isn't in the cloud yet, shown with "Rename for Windows" (it keeps syncing between Macs if it already is).
      if (platform === 'win32') { const bad = Hard.winBad(rel, { rootLen: 0 }); if (bad && bad.why !== 'win-long') { block(rel, 'win-there', { where: L ? 'here' : 'there', part: bad.part }); continue; } }
      else if (L && winTarget()) { const bad = Hard.winBad(rel, { rootLen: winRootLen() }); if (bad) { block(rel, bad.why, { part: bad.part }); if (!C && !bh) continue; } }
      // (round 19) the chats' workspace syncs what they make, never a huge file (a model checkpoint, a build archive)
      const capHere = S.isWorkspaceRel(rel) ? Math.min(cap, o.bigCap || BIG_CAP) : cap;
      if ((L && L.size > capHere) || (C && (C.size ?? 0) > capHere)) { skippedBig.push(rel); continue; }
      // (round 73, syncmedia73) a big file not hashed yet goes to the big lane (hashed there; a new one hashed while it
      // copies), so this pass doesn't read gigabytes before the chats
      if (L && laneBig(rel, L) && !cachedHere(rel, L) && moved.has(`${L.size}:${L.mtime}`)) state.local[rel] = [L.size, L.mtime, moved.get(`${L.size}:${L.mtime}`)];
      if (L && laneBig(rel, L) && !cachedHere(rel, L)) {
        if (!C && !bh && !goneSizes.has(L.size)) laneAdd({ op: 'pushNew', rel, L }); else { laneAdd({ op: 'hash', side: 'l', rel, L }); laneSizes.add(L.size); }
        pending += 1; why(rel, 'queued'); continue;
      }
      if (C && laneBig(rel, C) && !C.placeholder && !C.downloading && !cachedThere(rel, C) && !(journalLatest.get(rel)?.s === C.size && journalLatest.get(rel)?.h && journalLatest.get(rel)?.op !== 'del') && !fresh(rel, C, o.settleMs ?? 2000)) {
        laneAdd({ op: 'hash', side: 'c', rel, C }); laneSizes.add(C.size); pending += 1; why(rel, 'queued'); continue;
      }
      let lh = null; let ch = null;
      // (round 74, synchard74) a file another program holds (the Sound desk's host on a WAV, an antivirus, OneDrive): said so
      try { lh = L ? await localHash(rel, L) : null; } catch (err) { if (!(await blockErr(rel, err))) { unreadable.push(rel); pending += 1; why(rel, 'unreadable'); } log('hash', rel, err.message); continue; }
      try { ch = C ? await cloudHash(rel, C) : null; } catch (err) { if (!(await blockErr(rel, err))) { pending += 1; why(rel, 'cloud-error'); } log('cloud hash', rel, err.message); continue; }
      if (C?.downloading && (C.cloudUnknown || ch === UNKNOWN || lh !== ch)) { pending += 1; cloudOnly.push(rel); why(rel, 'cloud-only'); continue; }
      if (lh === INFLIGHT || ch === INFLIGHT) { pending += 1; why(rel, lh === INFLIGHT ? 'writing' : 'arriving'); continue; }
      if (lh === BAD || ch === BAD) { unreadable.push(rel); pending += 1; why(rel, 'unreadable'); continue; }
      // (round 89, packs89) a giant chat whose changes travel in pieces (Hearth/packs): the pack lane says what its WHOLE
      // cloud file does now: as below (null), not yet (hold: the pieces carry it; written once the chat is quiet), or
      // adopt (the cloud's version is one this computer already took in: it becomes the base; pushed when quiet)
      if (PK && L && /^chats\/[^/]+\.json$/.test(rel)) {
        const pv = await PK.plan({ rel, L, C, lh, ch, bh }).catch((err) => { log('packs plan', rel, err.message); return null; });
        if (pv?.adopt && C && ch && ch !== bh) setBase(rel, ch, pv.adopt);
        if (pv?.hold || pv?.adopt) { pendRels.add(rel); if (pv.hold === 'pieces') { pending += 1; why(rel, 'pieces'); } continue; }
      }
      if (L && C) {
        if (ch === UNKNOWN) { if (lh !== bh) { pending += 1; cloudOnly.push(rel); why(rel, 'cloud-only'); } continue; } // can't know without downloading
        if (lh === ch) { if (bh !== lh) setBase(rel, lh, S.isJsonRel(rel) ? await localText(rel, L) : undefined); continue; }
        if (lh === bh) plan.push({ op: readable(rel, C) ? 'pull' : 'wait', rel, L, C, h: ch });
        else if (ch === bh) plan.push({ op: 'push', rel, L, C, h: lh });
        else plan.push({ op: S.isJsonRel(rel) && !readable(rel, C) ? 'wait' : 'merge', rel, L, C, lh, ch });
      } else if (L) {
        const gone = bh && lh === bh && !appStore(rel) ? await chatRemoved(rel, lh, cloud, cloudHash) : false;
        if (gone === 'wait') { pending += 1; why(rel, 'deleting'); } // (round 72, sync72)
        else if (gone) plan.push({ op: 'deleteHere', rel, L, h: lh });
        else plan.push({ op: 'push', rel, L, C: null, h: lh }); // new here (or changed here while deleted there: kept)
      } else {
        const gone = !appStore(rel) && bh && (ch === bh || (ch === UNKNOWN && state.cloud[rel] && state.cloud[rel][1] === C.mtime)) ? await chatRemoved(rel, bh, local, localHash) : false;
        if (gone === 'wait') { pending += 1; why(rel, 'deleting'); } // (round 72, sync72)
        else if (gone) plan.push({ op: 'deleteThere', rel, C, h: bh });
        else if (ch === UNKNOWN || !readable(rel, C)) { cloudOnly.push(rel); pending += 1; why(rel, 'cloud-only'); }
        else plan.push({ op: 'pull', rel, L: null, C, h: ch }); // new there (or changed there while deleted here: kept)
      }
    }
    for (const p of plan) if (p.op === 'wait') { cloudOnly.push(p.rel); pending += 1; why(p.rel, 'cloud-only'); }
    // (round 73) a delete that may be half of a rename whose new name is still being hashed on the lane: next pass
    for (const p of plan) if ((p.op === 'deleteThere' || p.op === 'deleteHere') && laneSizes.has((p.L || p.C)?.size)) { p.op = 'later'; pending += 1; why(p.rel, 'queued'); }
    { const b = breathe(); if (b) await b; } // (round 75) 50,000 files to copy: the lists below are long
    // renames: a delete and an add of the same content become one move (big files aren't copied again)
    const live = plan.filter((p) => p.op !== 'wait' && p.op !== 'later');
    // (round 74, synchard74) by hash, through a map: a folder of 50,000 files renamed was 50,000 x 50,000 comparisons
    const adds = (op, noSide) => { const m = new Map(); for (const p of live) if (p.op === op && !p[noSide] && !state.base[p.rel]) { if (!m.has(p.h)) m.set(p.h, []); m.get(p.h).push(p); } return m; };
    const firstFree = (m, h) => { const l = m.get(h); while (l?.length && l[0].used) l.shift(); return l?.[0] || null; };
    const pushes = adds('push', 'C'); { const b = breathe(); if (b) await b; } const pulls = adds('pull', 'L'); { const b = breathe(); if (b) await b; } // (round 75)
    for (const d of live.filter((p) => p.op === 'deleteThere' && !isStub(p.C))) {
      const a = firstFree(pushes, d.h);
      if (a) { a.used = true; d.op = 'renameThere'; d.to = a.rel; }
    }
    for (const d of live.filter((p) => p.op === 'deleteHere')) {
      const a = firstFree(pulls, d.h);
      if (a) { a.used = true; d.op = 'renameHere'; d.to = a.rel; }
    }
    { const b = breathe(); if (b) await b; } // (round 75)
    const ops = live.filter((p) => !p.used);
    // many deletions at once (a folder emptied, the wrong drive): wait for a yes
    const dels = ops.filter((p) => (p.op === 'deleteHere' || p.op === 'deleteThere') && !/^trash\//.test(p.rel));
    const known = keysOf(state.base).length;
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
    let n = 0; let full = false; let quit = false;
    if (!slept) tick = now();
    // (round 74, synchard74) up to 4 small copies / deletes at once (each is a few calls to the disk that mostly wait:
    // one after the other, 50,000 small files took minutes); merges and renames run alone, in order, as before
    const POOL = o.pool ?? 4; const inflight = new Set();
    const settle = async (all) => { while (inflight.size && (all || inflight.size >= POOL)) await Promise.race(inflight); };
    for (const p of ops) {
      if (stopping || slept || quit) break;
      { const b = breathe(); if (b) await b; } // (round 74)
      if (!noSleep && now() - tick > SLEEP_GAP) { slept = now() - tick; break; } // (round 74) asleep mid-pass: the rest is planned again
      if (p.op === 'held') continue;
      // (round 74, synchard74) a file a NEWER Hearth (on the other computer) wrote last: this one never pushes, merges or
      // deletes over it (it could drop what it doesn't know); taking it whole is safe. "Update Hearth here" in the panel.
      if (['push', 'merge', 'deleteThere', 'renameThere'].includes(p.op) && (journalLatest.get(p.rel)?.f || 0) > ME) { block(p.rel, 'newer-app', { where: 'there' }); continue; }
      if (full && p.op !== 'deleteThere' && p.op !== 'renameThere') { pending += 1; why(p.rel, 'disk-full'); continue; } // (round 74) the disk is full: no more copies this pass
      // (round 73, syncmedia73) big copies go to their own lane: the rest of this pass (chats, settings) doesn't wait
      if ((p.op === 'push' || p.op === 'pull') && laneBig(p.rel, p.L, p.C)) { laneAdd(p); pending += 1; why(p.rel, 'queued'); continue; }
      const one = async () => { try {
        let ok = true;
        if (p.op === 'push') ok = await push(p.rel, p.L, p.C, p.h);
        else if (p.op === 'pull') ok = await pull(p.rel, p.L, p.C, p.h);
        else if (p.op === 'merge') ok = await merge(p.rel, p.L, p.C, p.lh, p.ch);
        else if (p.op === 'deleteHere') ok = await deleteHere(p.rel, p.L);
        else if (p.op === 'deleteThere') ok = await deleteThere(p.rel, p.C);
        else if (p.op === 'renameThere') ok = await renameThere(p.rel, p.to, p.C, p.h);
        else if (p.op === 'renameHere') ok = await renameHere(p.rel, p.to, p.L, p.h);
        if (!ok) { sum.skipped += 1; pending += 1; why(p.rel, 'retry'); }
      } catch (err) {
        if (err.code === 'STOPPED') { quit = true; return; }
        if (err.code === 'FAULT') { quit = err; return; } // tests: a simulated crash
        const kind = await blockErr(p.rel, err); // (round 74, synchard74) locked / read-only / disk full / name: shown by name, with a fix
        if (kind) { log(p.op, p.rel, err.message); if (kind === 'disk-full') full = true; } else {
          sum.errors += 1; pending += 1; why(p.rel, 'error'); status.lastError = { rel: p.rel, op: p.op, message: err.message, code: err.code || '', at: now() }; log(p.op, p.rel, err.message);
        }
        if (!(await exists(cloudRoot))) quit = true; // the drive went away mid-pass
      } };
      if (['push', 'pull', 'deleteHere', 'deleteThere'].includes(p.op) && POOL > 1) { const pr = one().finally(() => inflight.delete(pr)); inflight.add(pr); await settle(false); }
      else { await settle(true); await one(); }
      if (!noSleep && now() - tick > SLEEP_GAP) { slept = now() - tick; break; } tick = now(); // (round 74) asleep during that file
      if (++n % 25 === 0) { if (baseJobs.size > 32) await baseIdle(); saveState(true); } // (round 72) ≤ 32 base writes in flight
    }
    await settle(true); // (round 74) the last ones in flight
    if (quit instanceof Error) throw quit;
    await baseIdle(); // (round 72) every base written before the state that names them
    // (round 74, synchard74) the computer slept mid-pass: what it planned before is old news (the cloud client brought
    // changes meanwhile; every write above checked its file right before, so nothing was overwritten). The time asleep
    // doesn't count toward any wait, and the pass starts again from a fresh look.
    if (slept) { excuse(slept); again = true; sleepRuns += 1; log('woke mid-pass', slept); } else sleepRuns = 0;
    // (round 89, packs89) the pack lane: the other computers' pieces taken in, this computer's giant chats published
    if (PK && !slept && !stopping && !quit) {
      const pr = await PK.pass({ local }).catch((err) => { log('packs', err.message); return null; });
      for (const w of pr?.waiting || []) { pending += 1; why(w.rel, w.why); }
      for (const r of pr?.touched || []) pendRels.add(r); // (what it wrote here: looked at again, never a "lost event")
      if (pr) { sum.pulled += pr.took; sum.pushed += pr.published; }
    }
    for (const cp of copies) if (!o.skip?.(cp.orig) && !(await absorbCopy(cp, local))) { pending += 1; if (!cp.unsure) cloudOnly.push(cp.rel); why(cp.orig, cp.unsure ? 'copy-check' : 'arriving'); }
    await flushJournal().catch((err) => log('journal', err.message));
    await writeMachine(false).catch(() => {});
    if (now() - (state.purgedAt || 0) > 864e5) await purge().catch(() => {});
    let conflicts = await listConflicts(); let resolvedNow = false;
    // (round 26) settled by themselves (o.autoResolve, on by default): data merged, files newest wins, losers in the trash
    if (conflicts.length && o.autoResolve?.()) {
      const r = await resolveAll('auto').catch((err) => { log('auto-resolve', err.message); return null; });
      if (r?.done) { o.onAutoResolved?.(r); conflicts = await listConflicts(); resolvedNow = true; }
    }
    // (round 79, syncscope79) what the next pass may trust from this one: the names left open and the ones copied are
    // looked at again; anything unusual (cut short, a folder unread, a cloud client's copies, deletes waiting for a yes,
    // conflicts settled, errors) or a lost watcher event found: the next pass looks at everything (a lost event: now)
    seen.touchy = pendRels; for (const p of ops) { seen.touchy.add(p.rel); if (p.to) seen.touchy.add(p.to); }
    needFull = slept ? 'slept' : stopping ? 'stopped' : local.blind.size || cloud.blind.size ? 'unlisted' : copies.length ? 'copies' : status.held ? 'held' : resolvedNow ? 'resolved' : sum.errors ? 'errors' : '';
    if (!fullLook && scan.missed) { scopeStats.missed += scan.missed; log('scoped pass: lost watcher events found', scan.notes.slice(0, 4).join(', ')); if (!needFull) { needFull = 'missed'; again = true; } }
    const offline = !(await exists(cloudRoot));
    if (!offline && !pending && !status.held) state.lastOk = now();
    if (!offline && !pending && !sum.errors) status.lastError = null; // (round 72) all caught up: the last problem is over
    return finish({ state: offline ? 'offline' : status.held ? 'held' : conflicts.length ? 'conflict' : pending ? 'pending' : 'synced', pending, conflicts: conflicts.length, cloudOnly: cloudOnly.slice(0, 200), skippedBig, unreadable, waiting, error: '' }, t0);
  }
  function finish(patch, t0) {
    // (round 74, synchard74) this pass's blocked files (an early stop, offline, keeps the last list); the big lane's own
    // stay while their file is still on the lane. Computers on an older sync format: "update Hearth there too".
    if (blockNow && patch.state !== 'offline') status.blocked = blockNow.concat((status.blocked || []).filter((b) => b.lane && now() - b.at < 600000 && !blockNow.some((x) => x.rel === b.rel)));
    blockNow = null;
    status.peersOld = peers.filter((p) => (p.format || 0) < ME).map((p) => ({ name: p.name, platform: p.platform, format: p.format || 0 }));
    if (patch.state !== 'offline') { delete status.need; delete status.known; }
    state.lastPass = now();
    saveState();
    Object.assign(status, patch, { at: now(), ms: now() - t0, last: sum, lastOk: state.lastOk });
    if (patch.state === 'offline') status.held = null;
    emit();
    if (pulledNow.length) o.onPulled?.(pulledNow.slice());
    return { ...status, pulledFiles: pulledNow.slice() };
  }
  const emit = () => o.onStatus?.(publicStatus());
  const publicStatus = () => ({ ...status, ...(PK ? { packs: PK.status() } : {}), /* (round 89, packs89) */ scope: { mode: scopeStats.mode, why: scopeStats.lastWhy, looked: scopeStats.looked, lastFull: scopeStats.lastFull, missed: scopeStats.missed }, /* (round 79, syncscope79) */ aside: aside.brief(), /* (round 78, guardloss78) */ transfers: laneList(), moving: lane.q.length + (lane.cur ? 1 : 0), machine: { id: machine.id, name: machine.name }, cloudRoot, cloudDir, peers: peers.map((p) => ({ name: p.name, platform: p.platform, lastSeen: p.lastSeen, lastOk: p.lastOk })) });

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
    await sweep(FILES); await sweep(dataDir); await sweep(STAGE); // (round 73) staged parts of copies never finished
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
  async function resolve(id, keep, ro = {}) { // (round 78, guardloss78) ro.auto: settled by itself → the loser gets a note
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
      const keptHere = await keepHere(rec.rel, file);
      let lost = keep === 'theirs' && ro.auto && keptHere ? 'ours' : null; // (round 78, guardloss78) newest wins: this one lost
      if (isJson) {
        let v = await theirsValue();
        if (keep === 'merge' && ours) {
          const theirsNewer = (rec.theirsAt || 0) > (rec.oursAt || 0);
          const mr = S.merge3(null, theirsNewer ? v : ours, theirsNewer ? ours : v, { counters: S.isCounterRel(rec.rel) });
          v = mr.value;
          // (round 78, guardloss78) fields changed two ways: the newer side's value won; the older side is kept whole
          // (this computer's: in Deleted files already; the other's: put there under its real name, not only in conflicts/)
          if (ro.auto && mr.conflicts.length) lost = theirsNewer ? (keptHere ? 'ours' : null) : 'theirs';
        }
        if (lost === 'theirs') {
          const tdir = path.join(TRASH, day(now()), ...rec.rel.split('/').slice(0, -1));
          await fsp.mkdir(tdir, { recursive: true });
          let dst = path.join(tdir, path.basename(rec.rel));
          if (await exists(dst)) dst = path.join(tdir, `${rand()}-${path.basename(rec.rel)}`);
          try { await fsp.copyFile(copy, dst); noteLoser(rec, 'theirs', dst, TRASH); } catch (err) { log('aside copy', rec.rel, err.message); }
        }
        await atomicWrite(file, localJsonText(rec.rel, S.fromCloud(v, ctx), statSync(file) ? { file } : null));
      } else {
        // (a copy whose content is still only in the cloud downloads now: this choice asks for it)
        const tmp = path.join(path.dirname(file), `.hearth-tmp-${rand()}-${path.basename(file)}`);
        await fsp.mkdir(path.dirname(file), { recursive: true });
        await fsp.copyFile(copy, tmp);
        await flushed(tmp); await renameRetry(tmp, file);
      }
      if (lost === 'ours') noteLoser(rec, 'ours', keptHere, path.join(stateDir, 'trash')); // (round 78, guardloss78)
      notePulled(rec.rel, kindOf(rec.rel));
    } else if (keep === 'both') {
      // (round 72, sync72) named like the panel's buttons: "(from Mac)" / "(from PC)" (its name when both are the same kind)
      const kind = (p) => ({ darwin: 'Mac', win32: 'PC' })[p];
      const from = String(kind(rec.fromPlatform) && kind(rec.fromPlatform) !== kind(platform) ? kind(rec.fromPlatform) : rec.from || 'the other computer').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40);
      if (isJson) {
        const m = /^chats\/(.+)\.json$/.exec(rec.rel);
        if (!m && rec.rel === 'app/config.json') return { ok: false, error: 'Settings are one version or the other: pick one, or Merge.' };
        if (!m) { // (round 72, sync72) Keep both for data: a scene / board changed two ways stays twice ("… (from Mac)")
          let ours = null; try { ours = oursValue(); } catch { /* none here */ }
          const theirs = await theirsValue();
          if (ours) remember(rec.rel, ours);
          await keepHere(rec.rel, file);
          await atomicWrite(file, localJsonText(rec.rel, S.fromCloud(ours ? S.keepBoth(ours, theirs, from, undefined, { inPlace: S.inPlaceOf(rec.rel) }) /* (round 91, projaudit91) */ : theirs, ctx), statSync(file) ? { file } : null));
          made = rec.rel;
        }
        if (m) {
        const v = S.fromCloud(await theirsValue(), ctx);
        const nid = `${m[1].slice(0, 40)}-${rand().slice(0, 5)}`;
        made = `chats/${nid}.json`;
        await atomicWrite(localPathOf(made), localForm({ ...v, ...(v && 'id' in v ? { id: nid } : {}), title: `${v?.title || 'Chat'} (from ${from})` }, true));
        }
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
      try { await renameRetry(copy, dst); if (ro.auto) noteLoser(rec, 'theirs', dst, TRASH); } catch { /* gone */ } // (round 78, guardloss78) + its note
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
      const ro = { auto: mode === 'auto' }; // (round 78, guardloss78) settled by itself / "Settle all for me": the loser gets a note
      let r = await resolve(rec.id, keep, ro).catch((err) => ({ ok: false, error: err.message }));
      if (!r?.ok && keep === 'merge') { keep = newerSide(rec); r = await resolve(rec.id, keep, ro).catch((err) => ({ ok: false, error: err.message })); }
      if (r?.ok) { out.done += 1; out.by[keep] = (out.by[keep] || 0) + 1; out.rels.push(rec.rel); } else { out.failed += 1; log('resolve-all', rec.rel, r?.error); }
    }
    return out;
  }
  // this computer's version, before a choice replaces it: a copy in data/sync/trash under its real name (Deleted files)
  async function keepHere(rel, file) { // → where it was kept (round 78), or null
    if (!statSync(file)) return null;
    const dir = path.join(stateDir, 'trash', day(now()), ...rel.split('/').slice(0, -1));
    await fsp.mkdir(dir, { recursive: true });
    let dst = path.join(dir, path.basename(file));
    if (await exists(dst)) dst = path.join(dir, `${rand()}-${path.basename(file)}`);
    await fsp.copyFile(file, dst);
    return dst;
  }
  // (round 19) what a conflict is about, for the choice: both versions (JSON values, or the files' paths), sizes, times
  async function preview(id) {
    const rec = (await listConflicts()).find((c) => c.id === id);
    if (!rec) return null;
    const file = localPathOf(rec.rel); const copy = path.join(CONFL, rec.copy);
    const out = { ...rec, here: file, there: copy, oursAt: rec.oursAt || statSync(file)?.mtimeMs || null, theirsAt: rec.theirsAt || null, canMerge: rec.kind === 'json', canBoth: rec.rel !== 'app/config.json' }; // (round 72) Keep both for data too
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
    let disk; let diskText; try { diskText = fs.readFileSync(file, 'utf8'); disk = S.parseJson(diskText); } catch { return value; }
    const isCfg = rel === 'app/config.json';
    const ours = S.toCloud(isCfg ? S.portableConfig(value) : value, ctx);
    const theirs = S.toCloud(isCfg ? S.portableConfig(disk) : disk, ctx);
    const r = S.merge3(prevOf(rel), ours, theirs, { counters: S.isCounterRel(rel) });
    guardLoser(rel, diskText, theirs, r); // (round 78, guardloss78)
    guardOurs.set(rel, ours); // (round 78) the window's copy as it last saved it (see asideDo)
    const merged = S.fromCloud(r.value, ctx);
    return isCfg ? S.applyPortable(value, merged) : merged;
  }

  // (round 78, guardloss78) the guard settled a real conflict (this computer's version won a field changed two ways):
  // the version on the disk (what arrived from the other computer) goes to Deleted files with a note in the sync panel.
  // Not when the disk holds the guard's own last merge (this computer kept saving before the window read it again).
  const guardOurs = new Map(); // rel → the window's value at its last guarded save (cloud form), until it acks
  function guardLoser(rel, diskText, theirs, r) {
    try {
      const th = sha(canon(theirs));
      if (r.conflicts.length && !aside.wroteIs(rel, th)) {
        const j = journalLatest.get(rel);
        const n = aside.keepText(rel, diskText, { why: 'guard', side: 'theirs', kind: 'json', from: nameOf(j?.m), fromPlatform: platOf(j?.m), fields: r.conflicts.slice(0, 5) });
        if (n) { log('kept aside (guard)', rel); setTimeout(emit, 0); }
      }
      aside.wrote(rel, sha(canon(r.value)));
    } catch (err) { log('guard aside', rel, err.message); }
  }
  // (round 78, guardloss78) a conflict settled by itself (auto): the side that lost is in Deleted files (dst); a note says so
  function noteLoser(rec, side, dst, root) {
    try {
      const r = path.relative(root, dst).split(path.sep).join('/');
      const own = side === 'ours';
      aside.add({ rel: rec.rel, trash: `${root === TRASH ? 'cloud' : 'here'}:${r}`, why: 'auto', side, kind: rec.kind, from: own ? machine.name : rec.from, fromPlatform: own ? platform : rec.fromPlatform, fields: (rec.fields || []).slice(0, 5) });
    } catch (err) { log('aside note', rec.rel, err.message); }
  }
  const trashFile = (id) => { const m = /^(cloud|here):(\d{4}-\d\d-\d\d)\/(.+)$/.exec(String(id || '')); if (!m || m[3].split('/').some((p) => !p || p === '.' || p === '..')) return null; return path.join(m[1] === 'cloud' ? TRASH : path.join(stateDir, 'trash'), m[2], ...m[3].split('/')); };
  // the sync panel's kept-aside notes: list (no id) · 'compare' (both versions) · 'both' (Keep both) · 'theirs' (use the
  // version kept aside; the one in place goes to Deleted files first) · 'dismiss'. The window holding the store is told
  // as for a resolve (onPulled → StoreAck: its change not written yet goes through the guard first, then it reads again).
  async function asideDo(id, how) {
    if (!id) return aside.brief();
    const n = aside.get(id);
    if (!n) return { ok: false, error: 'Already settled' };
    if (how === 'dismiss') { aside.drop(id); emit(); return { ok: true }; }
    const src = trashFile(n.trash); const file = localPathOf(n.rel); const isJson = S.isJsonRel(n.rel);
    const readV = (f) => { try { const st = f && statSync(f); if (!st || st.size > 6e6) return null; return S.fromCloud(S.parseJson(fs.readFileSync(f, 'utf8')), ctx); } catch { return null; } };
    if (how === 'compare') return { ok: true, ...n, kept: isJson ? readV(src) : null, now: isJson ? readV(file) : null, here: file, there: src };
    if (how !== 'both' && how !== 'theirs') return { ok: false, error: 'Nothing to do' };
    if (!src || !statSync(src)) { aside.drop(id); emit(); return { ok: false, error: 'That version is no longer in Deleted files' }; }
    if (n.rel === 'app/config.json' && how === 'both') return { ok: false, error: 'Settings are one version or the other.' };
    const kind = (p) => ({ darwin: 'Mac', win32: 'PC' })[p];
    const fromName = String(kind(n.fromPlatform) || n.from || 'the other computer').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40);
    let made = n.rel;
    if (isJson) {
      let ours = null; try { const v = S.parseJson(fs.readFileSync(file, 'utf8')); ours = S.toCloud(n.rel === 'app/config.json' ? S.portableConfig(v) : v, ctx); } catch { /* none here */ }
      const kept = S.toCloud(S.fromCloud(S.parseJson(await fsp.readFile(src, 'utf8')), ctx), ctx);
      const v = how === 'both' && ours ? S.keepBoth(ours, kept, fromName, undefined, { inPlace: S.inPlaceOf(n.rel) }) /* (round 91, projaudit91) one project with both names */ : kept;
      // the guard's base for the window's next save: its copy as it last saved it (its change waiting since then merges
      // with this version; the line it had won stays replaced), else this version's predecessor on the disk
      if (pulledPrev.has(n.rel) && guardOurs.has(n.rel)) pulledPrev.set(n.rel, guardOurs.get(n.rel)); else if (ours) remember(n.rel, ours);
      await keepHere(n.rel, file);
      await atomicWrite(file, localJsonText(n.rel, S.fromCloud(v, ctx), statSync(file) ? { file } : null));
    } else {
      const ext = path.extname(n.rel); const stem = n.rel.slice(0, n.rel.length - ext.length);
      if (how === 'both') { made = `${stem} (from ${fromName})${ext}`; for (let i = 2; await exists(localPathOf(made)); i++) made = `${stem} (from ${fromName} ${i})${ext}`; } else await keepHere(n.rel, file);
      const dst = localPathOf(made);
      const tmp = path.join(path.dirname(dst), `.hearth-tmp-${rand()}-${path.basename(dst)}`);
      await fsp.mkdir(path.dirname(dst), { recursive: true });
      await fsp.copyFile(src, tmp); await flushed(tmp); await renameRetry(tmp, dst);
    }
    notePulled(made, kindOf(made));
    if (pulledNow.length) { o.onPulled?.(pulledNow.slice()); pulledNow = []; }
    aside.drop(id); emit();
    return { ok: true, rel: n.rel, made };
  }

  function readJsonSync(f) { try { return S.parseJson(SS.readRetry(fs, f)); } catch (err) { return err?.code && SS.BUSY.has(err.code) ? HELD : null; } }
  function writeJsonSync(f, v) { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.${rand()}.tmp`; fs.writeFileSync(t, JSON.stringify(v)); fs.renameSync(t, f); }

  // (round 89, packs89) what the pack lane may use (the engine's own writes, so it follows the same rules)
  PK?.attach({ cloudDir, stateDir, machineId: () => machine.id, ctx: () => ctx, localPathOf, casWrite: (file, ent, data) => casWrite(file, ent, data, 'pack-take'), afterLocalWrite, notePulled: (rel) => notePulled(rel, kindOf(rel)), asideAdd: (n) => { const r = aside.add(n); setTimeout(emit, 0); return r; }, nameOf: (by) => peers.find((p) => P_safe(p.id) === by)?.name || nameOf(by),
    dataDir, knows: (rel) => Boolean(state.base[rel]), autoResolve: () => Boolean(o.autoResolve?.()), conflictsDir: CONFL, conflictId: () => `${day(now())}-${rand()}`,
    conflict: async (c) => { const mid = peers.find((p) => P_safe(p.id) === c.by)?.id || null; await writeConflictRecord({ id: c.id, rel: c.rel, kind: 'json', copy: c.copy, at: now(), by: machine.name, from: nameOf(mid), ...sides(mid, c.oursAt, c.theirsAt), fields: c.fields.slice(0, 20) }); sum.conflicts += 1; } });
  return {
    pass, stop: () => { stopping = true; lane.q.length = 0; }, status: publicStatus,
    laneIdle, freeable: afterLoad(freeable), free: wrote(afterLoad(free)), /* (round 73, syncmedia73) */ fix: wrote(afterLoad(fix)), woke: (ms) => { excuse(ms); needFull = 'wake'; if (running) again = true; }, /* (round 74, synchard74) */ set: (patch) => { needFull = 'set'; return Object.assign(o, patch); }, option: (k) => o[k], machine: () => ({ ...machine }),
    conflicts: listConflicts, aside: wrote(afterLoad(asideDo)), /* (round 78, guardloss78) */ resolve: wrote(afterLoad(resolve)), resolveAll: wrote(afterLoad(resolveAll)), preview, incoming, trash: listTrash, restore: wrote(afterLoad(restore)), guardWrite, relOfLocal, /* (round 75) after the state is read */
    scope: () => ({ ...scopeStats, need: needFull }), // (round 79) tests / the main side: the last pass's look
    ackPulled: (rels, since) => { if (!rels) { pulledPrev.clear(); pulledAt.clear(); guardOurs.clear(); } else for (const r of rels) if (!(since > 0) || !((pulledAt.get(r) || 0) > since)) { pulledPrev.delete(r); pulledAt.delete(r); guardOurs.delete(r); } }, // (round 78) + guardOurs // (round 77, storeack77) since: when the reader began reading
    hasPulled: (rel) => pulledPrev.has(rel),
    // (round 77, synclatency77) for the watchers (syncmain.js): is this file, as it is now (size + modified time), the
    // version sync already has (its own write, or one it already read)? Then an event about it is no news: no pass
    knows: (side, rel, size, mtime) => { const c = (side === 'cloud' ? state.cloud : state.local)?.[rel]; return Boolean(c && c[2] && c[0] === size && c[1] === mtime); },
    peers: async () => { await readPeers(); return peers; },
    cloudDir, FILES, stateDir, ctx: () => ctx,
    _state: () => state, _stateStore: () => store.stats(), // (round 75) tests: saves, buckets written, main-process ms
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
