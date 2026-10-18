// 💾 Automatic backups, main side (round 45, backupauto; the pure parts are in backupauto-core.js). Required by main.js
// (one line, right after datasafe): the backups run here, where the files are.
//   · run(reason)        one backup: the data folder (scenes, chats, memory, tool data), config.json and theme.css are
//                        copied aside (a held file is read again a few times), counted, zipped with a list of contents
//                        (hearth-backup.json), CHECKED (the zip opened again, every key file parsed, the counts compared)
//                        and only then given its real name; big media (20 MB+, not JSON) goes once into the media store
//                        next to the zips (<folder>/.hearth/media) and is skipped while unchanged; then the rotation
//   · automatic          on powerwise's schedule (powerwisemain.every): once a day when the computer is idle, never while
//                        rendering / recording / presenting / updating, never on battery below 40 % (the window tells us
//                        the level), never asleep; after a failure it tries again later. On by default.
//   · before(reason)     before an update (updatermain), a restore (fsapi) and a Recover (datasafemain / the Lab's): a
//                        backup first, unless a good one is fresh; never longer than 3 minutes in the way
//   · per computer       the folder, on / off and the history live in data/.backup/state.json (a hidden folder: never
//                        synced, so each computer keeps its own); read the datasafe way (a held file is never "empty",
//                        never written over: the backups go on with what was read before)
//   · where              Documents/Hearth backups by default; iCloud Drive (Mac) / OneDrive (Windows) offered when
//                        there; never inside the data folder, the app's folder or the sync folder (backupauto-core)
// Each backup has a small card next to it (<folder>/.hearth/<zip name>.json: what's inside, the check, which computer):
// the list in Settings › Backups reads those, not the zips. Older zips without one are looked into once.
// IPC: backupauto:state · :list · :run · :verify · :inspect · :places · :setDir · :setAuto · :before · :battery ·
// :reveal · :test (tests only) · event backupauto:changed → the window.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const C = require('./backupauto-core');

const TEST = Boolean(process.env.HEARTH_TEST_SAVE_DIR);
const SKIP_DIRS = new Set(['workspace', 'ae', 'sync', '.backup', 'node_modules', 'mcp-runs']); // (as before: workspace / ae / sync) + this computer's backup state
const SKIP_NAME = /\.(hubtmp|tmp|partial|crdownload|download|icloud)$|^\.hearth-tmp-|\.hearth-part|^\._|^\.DS_Store$|^Thumbs\.db$|^desktop\.ini$/i; // (round 46) + the Mac's "._" / .DS_Store, Windows' Thumbs.db / desktop.ini, iCloud placeholders
const DETAILS = '.hearth';
const MAX_MS = 30 * 60000;

let o = { dataDir: path.join(__dirname, 'data'), configPath: require('./configsafe-core').ownFile(__dirname, 'config.json'), themePath: require('./configsafe-core').ownFile(__dirname, 'theme.css'), /* (round 55) data/ once moved */ appDir: __dirname, syncmain: null, store: null, getWin: () => null, platform: process.platform, home: os.homedir(), env: process.env };
const test = { auto: false, before: false, idle: null, corruptNext: false, failNext: null, clock: 0 };
const now = () => Date.now() + test.clock;

// ---------- this computer's state (datasafe rules) ----------
const stateFile = () => path.join(o.dataDir, '.backup', 'state.json');
let state = null; let held = false;
const fresh = () => ({ v: 1, auto: true, dir: null, since: now(), lastOk: 0, lastTry: 0, failures: 0, last: null, history: [] });
function load() {
  const r = require('./datasafe-core').load(fs, stateFile(), null);
  held = r.state === 'unreadable' && !r.canSave;
  if (held) { state ||= fresh(); return state; } // held: what we had (or the defaults for this run), never written over
  state = { ...fresh(), ...(r.value && typeof r.value === 'object' ? r.value : {}) };
  if (!r.value && registered) { state.since = now(); save(); }
  return state;
}
let registered = false; // (required by another module's unit test without the app: reads only, never writes)
function save() {
  if (!registered) return false;
  if (held) { load(); if (held) return false; }
  const f = stateFile();
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { fs.copyFileSync(f, f.replace(/\.json$/, '.prev.json')); } catch { /* the first one */ }
    require('./crashsafe-core').writeAtomicSync(fs, f, JSON.stringify(state, null, 1)); // (round 50, crashsafe) flushed, then renamed
    return true;
  } catch { return false; }
}
const S = () => state || load();

// ---------- this computer ----------
function machine() {
  let id = '';
  try { id = require('./datasafe-core').load(fs, path.join(o.dataDir, 'sync', 'machine.json'), null, { prev: false }).value?.id || ''; } catch { /* none yet */ }
  const name = o.platform === 'win32' ? (o.env.COMPUTERNAME || os.hostname()) : os.hostname().replace(/\.local$/i, '');
  return { id: id || `host:${os.hostname()}`, name, platform: o.platform, slug: C.slugOf(name) };
}
function documents() {
  if (TEST) return path.join(process.env.HEARTH_TEST_SAVE_DIR, 'Documents');
  try { return require('electron').app.getPath('documents'); } catch { return path.join(o.home, 'Documents'); }
}
function drives() {
  if (TEST && test.drives) return test.drives;
  try {
    return require('./sync-merge').detectClouds({ platform: o.platform, home: o.home, env: o.env, exists: (p) => fs.existsSync(p), readdir: (p) => fs.readdirSync(p), readJson: (p) => JSON.parse(fs.readFileSync(p, 'utf8')) });
  } catch { return []; }
}
const io = () => ({ platform: o.platform, home: o.home, documents: documents(), env: o.env, drives: drives() });
const syncDir = () => { const st = o.syncmain?.status?.() || {}; return st.on && st.root ? path.join(st.root, 'Hearth') : null; };
// (a test run's own Documents sits inside the throwaway app copy: the app-folder rule is left out there only)
const ctx = () => ({ platform: o.platform, dataDir: o.dataDir, appDir: TEST && C.inside(process.env.HEARTH_TEST_SAVE_DIR, o.appDir, o.platform) ? null : o.appDir, syncDir: syncDir() });
// the old place (settings.backupDir in config.json: it syncs, so it can be the other computer's path)
function legacyDir() {
  try {
    const d = require('./datasafe-core').load(fs, o.configPath, null).value?.settings?.backupDir;
    if (typeof d === 'string' && path.isAbsolute(d) && !require('./twocomputers-core').foreign?.(d, o.platform) && fs.existsSync(d) && C.checkDir(d, ctx()).ok) return d;
  } catch { /* none */ }
  return null;
}
function dir() { const s = S(); return s.dir || legacyDir() || C.places(io()).def.dir; }
// every folder that may hold backups on this computer (this one first): the list and Recover look in all of them
function dirs() { return [...new Set([dir(), legacyDir(), C.places(io()).def.dir].filter(Boolean))].filter((d, i) => i === 0 || fs.existsSync(d)); }

// ---------- zip tools ----------
// (round 46, platform46) plain Node (zipkit.js) on every computer: Windows' tar.exe garbled accented names and the
// Mac's tar added "._name" files the check read as damaged stores; no outside tool to be missing or blocked
const Zip = require('./zipkit');
async function zipDir(src, target) { await Zip.writeZip(src, target); }
async function unzipAll(zip, dest) { await Zip.extract(zip, dest); }
async function unzipSome(zip, members, dest) {
  try { await Zip.extract(zip, dest, { members, skipBad: true }); } catch { /* not a zip it reads: nothing came out */ }
}
async function names(zip) { return Zip.names(zip); }

// ---------- walking the data folder ----------
async function walk(root, relBase, out) {
  let ents = [];
  try { ents = await fsp.readdir(root, { withFileTypes: true }); } catch (err) { if (relBase === 'data') throw err; return out; }
  for (const e of ents) {
    if (SKIP_NAME.test(e.name)) continue;
    const abs = path.join(root, e.name);
    const rel = `${relBase}/${e.name}`;
    if (e.isDirectory()) { if (relBase === 'data' && SKIP_DIRS.has(e.name)) continue; if (e.name === 'node_modules' || e.name === '.git') continue; await walk(abs, rel, out); } else if (e.isFile()) {
      try { const st = await fsp.stat(abs); out.push({ rel, abs, size: st.size, mtime: st.mtimeMs }); } catch { /* gone meanwhile */ }
    }
  }
  return out;
}
// a copy that is read again a few times when another program holds the file for a moment (Windows)
async function copyCareful(from, to) {
  for (let i = 0; ; i++) {
    try { await fsp.copyFile(from, to); return true; } catch (err) {
      if (err.code === 'ENOENT') return false;
      if (i >= 4 || !['EBUSY', 'EPERM', 'EACCES', 'EAGAIN', 'EIO', 'UNKNOWN'].includes(err.code)) throw err;
      await new Promise((r) => setTimeout(r, 80 * (i + 1)));
    }
  }
}
function freeBytes(d) { try { const s = fs.statfsSync(d); return Number(s.bavail) * Number(s.bsize); } catch { return null; } }
const readJsonIn = (root) => (rel) => { try { return JSON.parse(fs.readFileSync(path.join(root, ...rel.split('/')), 'utf8')); } catch { return undefined; } };
const listIn = (root) => (rel) => { try { return fs.readdirSync(path.join(root, ...rel.split('/'))); } catch { return []; } };

// ---------- the cards next to the zips ----------
const cardOf = (zip) => path.join(path.dirname(zip), DETAILS, `${path.basename(zip)}.json`);
function readCard(zip) { try { return JSON.parse(fs.readFileSync(cardOf(zip), 'utf8')); } catch { return null; } }
function writeCard(zip, card) { try { fs.mkdirSync(path.dirname(cardOf(zip)), { recursive: true }); const f = cardOf(zip); fs.writeFileSync(`${f}.tmp`, JSON.stringify(card, null, 1)); fs.renameSync(`${f}.tmp`, f); } catch { /* the zip is what counts */ } }

// ---------- the check ----------
// → { ok, problems, counts, files, legacy? }
async function verify(zip, { media = true, base = path.dirname(zip) } = {}) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-backup-check-'));
  try {
    try { await unzipAll(zip, dest); } catch (err) {
      // in plain words, without the temp folder: "data/kv/notes.json doesn't read back the same"
      if (err.entry) return { ok: false, problems: [`the zip is damaged (${err.entry} doesn't read back the same)`], at: now() }; // (round 46) zipkit names the file
      const raw = String(err.detail || err.message || '').split(dest).join('').replace(/^[\\/]+/gm, '');
      const crc = raw.match(/([^\s:]+)\s+bad CRC/i) || raw.match(/(?:CRC|checksum)[^\n]*?([\w./-]+\.\w+)/i);
      const what = crc ? `${crc[1].replace(/^[\\/]+/, '')} doesn't read back the same` : raw.split('\n')[0].replace(/^(unzip|tar):\s*/i, '').slice(0, 140) || 'it is damaged';
      return { ok: false, problems: [`the zip is damaged (${what})`], at: now() };
    }
    const read = readJsonIn(dest);
    const manifest = read('hearth-backup.json');
    const bad = []; let files = 0;
    const all = await walk(path.join(dest, 'data'), 'data', []).catch(() => []);
    files += all.length;
    for (const f of ['config.json', 'theme.css']) if (fs.existsSync(path.join(dest, f))) files += 1;
    const key = (rel) => rel === 'config.json' || rel === 'data/memory.json' || /^data\/(chats|kv)\/[^/]+\.json$/.test(rel);
    for (const rel of ['config.json', ...all.map((f) => f.rel)].filter(key)) {
      if (!fs.existsSync(path.join(dest, ...rel.split('/')))) continue;
      try { JSON.parse(fs.readFileSync(path.join(dest, ...rel.split('/')), 'utf8')); } catch { bad.push(rel); }
    }
    const counts = C.countsOf({ read, list: listIn(dest) });
    if (!manifest) return { ok: !bad.length, legacy: true, problems: bad.map((r) => `${r} is damaged`), counts, files, at: now() };
    counts.media = (manifest.media || []).length;
    const missing = [];
    if (media) for (const m of manifest.media || []) { const f = path.join(base, DETAILS, 'media', m.key); try { if (fs.statSync(f).size !== m.size) missing.push(m.rel); } catch { if (!present(f)) missing.push(m.rel); } }
    const r = C.compare(manifest, { counts, files, bad, media: { missing } });
    return { ...r, counts, files, at: now() };
  } finally { fs.rm(dest, { recursive: true, force: true, maxRetries: 4 }, () => {}); }
}
// an older zip (no card): what's inside, once (a few files and the list of names)
async function inspect(zip) {
  const card = readCard(zip);
  if (card?.counts) return card;
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-backup-look-'));
  try {
    let list = [];
    try { list = await names(zip); } catch (err) { const c = { v: 1, legacy: true, ok: false, problems: [`the zip can't be opened (${(err.detail || err.message || '').slice(0, 120)})`], checkedAt: now() }; writeCard(zip, c); return c; }
    await unzipSome(zip, ['hearth-backup.json', 'config.json', 'data/memory.json', 'data/kv/three-sketches.json', 'data/kv/notes.json'].filter((m) => list.includes(m)), dest);
    const manifest = readJsonIn(dest)('hearth-backup.json');
    const inDir = (d) => list.filter((n) => n.startsWith(`${d}/`) && !n.slice(d.length + 1).includes('/')).map((n) => n.slice(d.length + 1));
    const counts = manifest?.counts || C.countsOf({ read: readJsonIn(dest), list: inDir });
    const c = { v: 1, legacy: !manifest, counts, reason: manifest?.reason || 'legacy', machine: manifest?.machine || null, at: manifest?.at || null };
    writeCard(zip, c);
    return c;
  } finally { fs.rm(dest, { recursive: true, force: true }, () => {}); }
}

// (round 64, twocopies64) which Hearth folder this is (twocopiesmain: its id, and whether it owns the usual profile)
function copyNow() { try { const i = require('./twocopiesmain').info(); return { id: i.on ? i.copyId : null, primary: i.on ? i.primary !== false : true }; } catch { return { id: null, primary: true }; } }
// ---------- the list ----------
async function list() {
  const me = machine();
  // every id this computer went by (sync makes its own id later; the host name before that)
  const ids = new Set([me.id, `host:${os.hostname()}`, ...(S().ids || [])]);
  const items = [];
  for (const d of dirs()) {
    let ns = [];
    try { ns = await fsp.readdir(d); } catch { continue; }
    for (const n of ns.filter((x) => /\.zip$/i.test(x))) {
      const p = path.join(d, n);
      let st; try { st = await fsp.stat(p); } catch { continue; }
      const card = readCard(p);
      const parsed = C.parseName(n);
      const machineId = card?.machine?.id || null;
      // (round 64, twocopies64) two Hearth folders on one computer share the backups folder: a backup another folder made
      // is never this one's to rotate away; one that says no folder (older) is rotated only by the folder that owns the
      // usual profile (the one with the chats)
      const cp = copyNow(); const theirCopy = card?.machine?.copy || null;
      const mine = (theirCopy ? !cp.id || theirCopy === cp.id : cp.primary) && (machineId ? ids.has(machineId) : Boolean(parsed) && (!parsed.computer || parsed.computer === me.slug));
      items.push({ name: n, path: p, dir: d, here: d === dirs()[0], at: card?.at || parsed?.at || st.mtimeMs, size: st.size, ok: card?.ok ?? undefined, problems: card?.problems || [], counts: card?.counts || null,
        reason: card?.reason || (parsed ? 'legacy' : 'other'), computer: card?.machine?.name || parsed?.computer || '', mine, hearth: Boolean(parsed || card), checkedAt: card?.checkedAt || 0, media: (card?.media || []).length });
    }
  }
  items.sort((a, b) => b.at - a.at);
  return { dir: dir(), dirs: dirs(), items, state: pub() };
}
// for Recover (datasafemain / scenesafemain): the newest zips that weren't found damaged, from every backup folder
async function recoverZips(n = 8) {
  if (!registered) return null; // (the caller looks in its own folder, as before)
  const { items } = await list();
  return items.filter((b) => b.ok !== false).slice(0, n).map((b) => ({ n: b.name, f: b.path, t: b.at }));
}

// ---------- one backup ----------
let running = null; // { reason, since, step, p }
const step = (s) => { if (running) { running.step = s; tell(); } };
function run(reason = 'manual') {
  if (running) return running.p;
  running = { reason, since: now(), step: 'starting' };
  running.p = doRun(reason).finally(() => { running = null; tell(); });
  tell();
  return running.p;
}
async function doRun(reason) {
  const s = S();
  const at = now(); const t0 = Date.now();
  const me = machine();
  if (!(s.ids || []).includes(me.id)) s.ids = [...(s.ids || []), me.id].slice(-6);
  const target = dir();
  let stage = null;
  s.lastTry = at;
  try {
    if (test.failNext) { const e = Object.assign(new Error(test.failNext.message || 'test failure'), { code: test.failNext.code }); test.failNext = null; throw e; }
    const chk = C.checkDir(target, ctx());
    if (!chk.ok) throw Object.assign(new Error(chk.why), { code: 'INSIDE' });
    // a folder of your choice on a disk that isn't there: never made again on the computer's own disk
    const isDefault = target === C.places(io()).def.dir;
    if (!fs.existsSync(target)) {
      if (!isDefault && !fs.existsSync(path.dirname(target))) throw Object.assign(new Error('no folder'), { code: 'NODIR' });
      fs.mkdirSync(target, { recursive: true });
    }
    step('looking');
    const files = await walk(o.dataDir, 'data', []);
    for (const [rel, abs] of [['config.json', o.configPath], ['theme.css', o.themePath]]) { try { const st = fs.statSync(abs); files.push({ rel, abs, size: st.size, mtime: st.mtimeMs }); } catch { /* none */ } }
    const mediaDir = path.join(target, DETAILS, 'media');
    let have = new Set(); try { have = new Set(fs.readdirSync(mediaDir).map((n) => offloadedName(n) || n)); } catch { /* none yet */ }
    const plan = C.split(files, have);
    const free = freeBytes(target);
    const need = Math.round(plan.zipBytes * 0.7) + plan.copyBytes + 20 * 1048576;
    if (free != null && free < need) throw Object.assign(new Error('no space'), { code: 'ENOSPC', free, need });
    // copied aside first: the zip is made from a still picture of your files, not ones changing under it
    step('copying');
    stage = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-backup-'));
    const byRel = new Map(files.map((f) => [f.rel, f]));
    const skipped = []; let n = 0;
    for (const rel of plan.zip) {
      const f = byRel.get(rel);
      const to = path.join(stage, ...rel.split('/'));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      try { if (await copyCareful(f.abs, to)) n += 1; } catch (err) { skipped.push({ rel, code: err.code || 'ERR' }); }
    }
    const counts = { ...C.countsOf({ read: readJsonIn(stage), list: listIn(stage) }), media: plan.media.length };
    const manifest = { v: 1, app: 'Hearth', at, reason, machine: { id: me.id, name: me.name, platform: me.platform, ...(copyNow().id ? { copy: copyNow().id, folder: o.appDir } : {}) }, counts, files: n, media: plan.media.map(({ rel, key, size }) => ({ rel, key, size })), skipped };
    fs.writeFileSync(path.join(stage, 'hearth-backup.json'), JSON.stringify(manifest, null, 1));
    // big media: once into the store next to the zips (skipped while unchanged)
    if (plan.copy.length) {
      step('media');
      fs.mkdirSync(mediaDir, { recursive: true });
      for (const m of plan.copy) {
        const to = path.join(mediaDir, m.key);
        try { await copyCareful(byRel.get(m.rel).abs, `${to}.partial`); fs.renameSync(`${to}.partial`, to); } catch (err) { skipped.push({ rel: m.rel, code: err.code || 'ERR' }); }
      }
    }
    step('zipping');
    const partDir = path.join(target, DETAILS, 'partial');
    fs.mkdirSync(partDir, { recursive: true });
    let name = C.fileName(at, me.name);
    if (fs.existsSync(path.join(target, name))) name = name.replace(/\.zip$/, `-${Date.now().toString(36).slice(-3)}.zip`);
    const part = path.join(partDir, name);
    try { fs.rmSync(part, { force: true }); } catch { /* none */ }
    const inflight = require('./crashsafemain').begin('backup', [part], name); // (round 50, crashsafe) cut off mid-zip: the half zip goes at the next start
    try { await zipDir(stage, part); } catch (err) { require('./crashsafemain').end(inflight); throw err; }
    if (test.corruptNext) { test.corruptNext = false; corrupt(part); }
    step('checking');
    const v = await verify(part, { base: target });
    if (!v.ok) { try { fs.rmSync(part, { force: true }); } catch { /* left in .hearth/partial */ } require('./crashsafemain').end(inflight); throw Object.assign(new Error('verify'), { verify: v.problems }); }
    const final = path.join(target, name);
    fs.renameSync(part, final);
    require('./crashsafemain').end(inflight);
    const size = fs.statSync(final).size;
    writeCard(final, { ...manifest, ok: true, problems: [], checkedAt: v.at, size, ms: Date.now() - t0 });
    s.lastOk = at; s.failures = 0;
    s.last = { at, ok: true, reason, name, path: final, size, counts, skipped: skipped.length, ms: Date.now() - t0 };
    const r = { ok: true, path: final, name, size, counts, dir: target, skipped, ms: Date.now() - t0 };
    step('tidying');
    try { r.removed = await rotateNow(); } catch { r.removed = 0; }
    return r;
  } catch (err) {
    const x = C.explain(err, o.platform);
    s.failures = (Number(s.failures) || 0) + 1;
    s.last = { at, ok: false, reason, why: x.why, fix: x.fix, code: x.code, dir: target };
    return { ok: false, why: x.why, fix: x.fix, code: x.code, dir: target };
  } finally {
    if (stage) fs.rm(stage, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }, () => {});
    s.history = [{ at, ok: s.last?.at === at ? s.last.ok : false, reason, ...(s.last?.ok ? { name: s.last.name } : { why: s.last?.why }) }, ...(s.history || [])].slice(0, 20);
    save();
  }
}
function corrupt(file) { // tests: a few bytes in the middle of the zip changed (its check must say so)
  const fd = fs.openSync(file, 'r+'); const size = fs.fstatSync(fd).size;
  const junk = Buffer.alloc(Math.min(4096, Math.max(16, Math.floor(size / 4))), 0x5a);
  fs.writeSync(fd, junk, 0, junk.length, Math.floor(size / 3)); fs.closeSync(fd);
}

// ---------- the rotation ----------
// (round 46) iCloud on an older macOS swaps a file it offloaded for ".name.icloud"; Sonoma and later, and OneDrive's
// online-only files, keep the real name (a read downloads it)
const offloadedName = (n) => { const m = /^\.(.+)\.icloud$/.exec(String(n)); return m ? m[1] : null; };
const present = (p) => fs.existsSync(p) || fs.existsSync(path.join(path.dirname(p), `.${path.basename(p)}.icloud`));
function trashable(p) {
  try {
    if (o.platform === 'win32') return require('./winpolish').trashCheck(p, { platform: 'win32' }).ok;
    if (o.platform === 'darwin') return require('./macpolish').trashCheck(p, { platform: 'darwin' }).ok;
  } catch { /* no check: the bin decides */ }
  return true;
}
const pinned = new Set(); // zips being restored right now: never rotated away meanwhile
function pin(file, on = true) { const k = path.normalize(String(file || '')); if (on) pinned.add(k); else pinned.delete(k); }
async function rotateNow() {
  const target = dir();
  const { items } = await list();
  const here = items.filter((b) => b.dir === target && b.hearth);
  const r = C.rotate(here.map((b) => ({ name: b.name, at: b.at, ok: b.ok, mine: b.mine, reason: b.reason })), now());
  let removed = 0;
  for (const nm of r.drop) {
    const p = path.join(target, nm);
    if (pinned.has(path.normalize(p))) continue;
    try {
      // (round 46) a disk with no bin (a network share, a USB stick on Windows) would delete for good: left as it is
      if (!trashable(p)) continue;
      if (TEST) fs.rmSync(p); else await require('electron').shell.trashItem(p); // to the Trash / Recycle Bin (tests: no desktop bin here)
      try { fs.rmSync(cardOf(p), { force: true }); } catch { /* none */ }
      removed += 1;
    } catch { /* a disk with no bin (a network share): left as it is */ }
  }
  // the media store keeps what a remaining backup (of any computer) points at
  // (round 46) a card or zip iCloud offloaded (older macOS: ".name.icloud") is still there: nothing is tidied while
  // one is, and an offloaded media file is never taken for a stray one
  const mediaDir = path.join(target, DETAILS, 'media');
  try {
    const keepKeys = new Set();
    const cards = await fsp.readdir(path.join(target, DETAILS));
    if (cards.some((n) => /\.icloud$/i.test(n))) return removed;
    for (const n of cards) {
      if (!n.endsWith('.zip.json')) continue;
      if (!present(path.join(target, n.slice(0, -5)))) { fs.rmSync(path.join(target, DETAILS, n), { force: true }); continue; }
      try { for (const m of JSON.parse(fs.readFileSync(path.join(target, DETAILS, n), 'utf8')).media || []) keepKeys.add(m.key); } catch { /* a card we can't read: keep everything */ return removed; }
    }
    for (const k of await fsp.readdir(mediaDir).catch(() => [])) if (!keepKeys.has(offloadedName(k) || k)) fs.rmSync(path.join(mediaDir, k), { force: true });
  } catch { /* nothing to tidy */ }
  return removed;
}

// ---------- big media back on a restore ----------
async function restoreMedia(zip, { dryRun = true } = {}) {
  let manifest = readCard(zip);
  if (!manifest?.media) {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-backup-m-'));
    try { await unzipSome(zip, ['hearth-backup.json'], dest); manifest = readJsonIn(dest)('hearth-backup.json'); } finally { fs.rm(dest, { recursive: true, force: true }, () => {}); }
  }
  const out = { add: 0, missing: 0 };
  for (const m of manifest?.media || []) {
    const to = path.join(o.dataDir, ...m.rel.replace(/^data\//, '').split('/'));
    if (fs.existsSync(to)) continue;
    const from = path.join(path.dirname(zip), DETAILS, 'media', m.key);
    if (!fs.existsSync(from)) { out.missing += 1; continue; }
    out.add += 1;
    if (!dryRun) { fs.mkdirSync(path.dirname(to), { recursive: true }); await fsp.copyFile(from, to); }
  }
  return out;
}

// ---------- before an update / a restore / a Recover ----------
async function before(reason = 'update', { timeout = 180000 } = {}) {
  if (!registered) return { skipped: 'not running' };
  if (TEST && !test.before) return { skipped: 'test' }; // (other checks' updates / restores / Recovers aren't slowed by a backup)
  const s = S();
  if (s.auto === false) return { skipped: 'off' };
  if (C.freshEnough(s, reason, now())) return { skipped: 'fresh', lastOk: s.lastOk };
  const p = run(reason);
  const r = await Promise.race([p, new Promise((res) => { const t = setTimeout(() => res({ skipped: 'slow' }), timeout); t.unref?.(); })]);
  return r;
}

// ---------- automatic ----------
let battery = { level: null, charging: null };
let lastDecision = null;
function envNow() {
  let pw = {}; try { pw = require('./powerwisemain').state(); } catch { /* not there */ }
  const holds = (pw.awake?.held || []).filter((h) => !h.allowed).map((h) => h.reason);
  let idleMs = 0;
  if (TEST && test.idle != null) idleMs = test.idle;
  else { try { idleMs = require('electron').powerMonitor.getSystemIdleTime() * 1000; } catch { idleMs = 0; } }
  const w = o.getWin(); let hidden = false; try { hidden = !w || w.isDestroyed() || !w.isVisible() || w.isMinimized(); } catch { hidden = false; }
  return { now: now(), idleMs, hidden: hidden || Boolean(pw.hidden), holds, battery: Boolean(pw.battery) && battery.charging !== true, level: battery.level, asleep: Boolean(pw.asleep), running: Boolean(running) };
}
function tick() {
  if (TEST && !test.auto) return null;
  const d = C.decide(S(), envNow());
  lastDecision = { ...d, at: now() };
  if (d.go) run('auto');
  return lastDecision;
}

// ---------- the window ----------
function pub() {
  const s = S();
  const m = machine();
  return { auto: s.auto !== false, dir: dir(), label: C.placeLabel(dir(), io()), custom: Boolean(s.dir), since: s.since, lastOk: s.lastOk || 0, lastTry: s.lastTry || 0, failures: s.failures || 0, last: s.last || null,
    history: (s.history || []).slice(0, 8), running: running ? { reason: running.reason, since: running.since, step: running.step } : null, decision: lastDecision, stale: C.stale(s, now()), now: now(),
    computer: m.name, platform: o.platform, held };
}
let tellT = null;
function tell() {
  if (tellT) return;
  tellT = setImmediate(() => { tellT = null; const w = o.getWin(); try { if (w && !w.isDestroyed()) w.webContents.send('backupauto:changed', pub()); } catch { /* closing */ } });
}
async function setDir(arg) {
  const pl = C.places(io());
  let d = null;
  if (arg === 'documents' || arg === 'default') d = pl.def.dir;
  else if (pl.offers.some((x) => x.id === arg)) d = pl.offers.find((x) => x.id === arg).dir;
  else if (arg === 'pick') {
    if (TEST && process.env.HEARTH_TEST_OPEN != null) d = process.env.HEARTH_TEST_OPEN.split(path.delimiter)[0] || null;
    else {
      const { dialog } = require('electron');
      const r = await dialog.showOpenDialog(o.getWin(), { title: 'Where should this computer keep its backups?', defaultPath: dir(), properties: ['openDirectory', 'createDirectory'] });
      d = r.canceled ? null : r.filePaths[0];
    }
    if (!d) return { ok: false, cancelled: true };
  } else if (typeof arg === 'string' && path.isAbsolute(arg)) d = arg;
  if (!d) return { ok: false, why: 'That place isn\'t on this computer.' };
  const chk = C.checkDir(d, ctx());
  if (!chk.ok) return { ok: false, why: chk.why };
  const s = S();
  s.dir = d === pl.def.dir && !legacyDir() ? null : d;
  save(); tell();
  return { ok: true, dir: d, label: C.placeLabel(d, io()) };
}

function register(ipcMain, opts = {}) {
  o = { ...o, ...opts };
  registered = true;
  load();
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => fn(...a));
  h('backupauto:state', () => pub());
  h('backupauto:list', () => list());
  h('backupauto:run', (reason) => run(['manual', 'auto', 'update', 'restore', 'recover'].includes(reason) ? reason : 'manual'));
  h('backupauto:verify', async (file) => {
    const p = path.normalize(String(file || ''));
    if (!path.isAbsolute(p) || !/\.zip$/i.test(p)) throw new Error('Not a backup zip');
    const v = await verify(p);
    const card = readCard(p) || { v: 1, legacy: true };
    writeCard(p, { ...card, ok: v.ok, problems: v.problems, checkedAt: v.at, counts: card.counts || v.counts });
    tell();
    return v;
  });
  h('backupauto:inspect', (file) => inspect(path.normalize(String(file || ''))));
  h('backupauto:places', () => ({ ...C.places(io()), dir: dir(), label: C.placeLabel(dir(), io()), sync: syncDir() }));
  h('backupauto:setDir', (arg) => setDir(arg));
  h('backupauto:setAuto', (on) => { const s = S(); s.auto = Boolean(on); if (s.auto && !s.lastOk) s.since = now(); save(); tell(); return pub(); });
  h('backupauto:before', (reason) => before(String(reason || 'update')));
  h('backupauto:battery', (b) => { battery = { level: typeof b?.level === 'number' ? b.level : null, charging: typeof b?.charging === 'boolean' ? b.charging : null }; return true; });
  h('backupauto:reveal', (file) => {
    const { shell } = require('electron');
    if (file && fs.existsSync(file)) { shell.showItemInFolder(path.normalize(file)); return true; }
    const d = dir(); if (!fs.existsSync(d)) { try { fs.mkdirSync(d, { recursive: true }); } catch { return false; } }
    shell.openPath(d); return true;
  });
  h('backupauto:test', (t) => testHook(t || {}));
  // the schedule: a look every 10 minutes (calmer on battery / hidden as powerwise decides; nothing asleep), the
  // first a few minutes after the start
  try { require('./powerwisemain').every('backupauto', 10 * 60000, tick, { hidden: 'run', first: TEST ? 3000 : 4 * 60000 }); } catch { /* no schedule: backups when asked */ }
}

// ---------- tests only ----------
async function testHook(t) {
  if (!TEST) throw new Error('Tests only');
  if (t.auto != null) test.auto = Boolean(t.auto);
  if (t.before != null) test.before = Boolean(t.before);
  if (t.idle !== undefined) test.idle = t.idle;
  if (t.clock != null) test.clock = Number(t.clock) || 0;
  if (t.corruptNext) test.corruptNext = true;
  if (t.failNext) test.failNext = t.failNext;
  if (t.drives) test.drives = t.drives;
  if (t.battery) battery = { level: t.battery.level ?? null, charging: t.battery.charging ?? null };
  if (t.state) { Object.assign(S(), t.state); save(); }
  const out = {};
  if (t.tick) out.decision = tick();
  if (t.wait && running) out.result = await running.p;
  if (t.rotate) out.removed = await rotateNow();
  if (t.corrupt) { corrupt(t.corrupt); out.corrupted = true; }
  out.state = pub();
  return out;
}

module.exports = { register, run, before, pin, list, verify, inspect, dir, dirs, recoverZips, restoreMedia, state: pub, tick, _test: { testHook, envNow, rotateNow, set: (x) => { o = { ...o, ...x }; state = null; held = false; }, test } };
