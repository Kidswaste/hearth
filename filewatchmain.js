// Files changed outside Hearth (round 42, filewatch), main side: ONE watcher service for everything Hearth follows on
// disk (the rules are in filewatch-core.js). The owner edits files in Finder / Explorer, VS Code, Photoshop on the Mac
// and the PC, inside their AIs' folders and the Lab's media; Hearth notices once, calmly:
//   · wants per topic from the window (fw:want): the Lab's song / video, its references and their originals, My
//     templates' folder, the files the AIs changed and the folders they use, the files in the chat boxes. In the main
//     process: tree(dir, fn) for sync's own folders (syncmain.js), so the data folder isn't watched twice.
//   · the fewest system watches (plan): one recursive watch per folder on the Mac (FSEvents) and Windows
//     (ReadDirectoryChangesW), Linux recursive only for small trees; files are watched through their folder (never a
//     handle per file); temp / swap / placeholder files ignored
//   · a burst (a save, an export writing 200 times, a folder copied in) becomes one batch: stat once each, only real
//     changes (size / modified time), a delete + add of the same file = a rename, a file still being written waits,
//     Hearth's own writes skipped (own(path), fsapi's write tells it)
//   · cheap when idle: no timer and no polling while nothing happens; a folder the system can't watch (a network drive,
//     a full inotify table) gets the slow check on powerwise's schedule (30 s, slower hidden / on battery, none asleep)
//   · survives: a watched folder renamed or deleted, a disk unplugged (its files are "unavailable", not deleted) and
//     plugged back, sleep / wake (every watch re-armed and every wanted file re-checked after the wake's settle)
// IPC: fw:want (topic, items) · fw:own (paths) · fw:state · fw:test (tests only) · event fw:changes → the window.
// Nothing here costs a token: no prompt, no engine flag, no message changes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('./filewatch-core');

const TEST = Boolean(process.env.HEARTH_TEST_SAVE_DIR);
const P = path; const platform = process.platform;
const key = (p) => C.keyOf(path.resolve(String(p)), platform);
let getWin = () => null;
let powerwise = null;
const pw = () => { if (!powerwise) { try { powerwise = require('./powerwisemain'); } catch { powerwise = {}; } } return powerwise; };

// ---------- wants ----------
const topics = new Map(); // topic → [{ path, kind, tag, deep }]
const trees = new Set(); // main-side subscribers { dir, fn, force }
let wants = []; // flattened, with { topic }
const stamps = new Map(); // key(file) → { size, mtime } | { none } | { offloaded } (wanted files only)
const ownUntil = new Map(); // key → time (Hearth's own writes)
const stats = { batches: 0, raw: 0, sent: 0, last: null, polls: 0, rearms: 0, errors: 0 };

// ---------- the system watches ----------
const roots = new Map(); // key(dir) → { dir, recursive, mode: 'watch' | 'poll' | 'gone', w, list? (poll: names → stamp) }
let planned = '';
const smallTree = (dir) => {
  // (Linux) a bounded count of folders: recursive only when the tree is small
  let n = 0; const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) if (e.isDirectory() && !C.ignored(e.name)) { n += 1; if (n > C.LINUX_MAX_DIRS) return false; stack.push(path.join(d, e.name)); }
  }
  return true;
};
function open(r) {
  closeW(r);
  if (!fs.existsSync(r.dir)) { r.mode = 'gone'; return; }
  try {
    const w = fs.watch(r.dir, C.options(platform, r.recursive), (ev, name) => onRaw(r, ev, name));
    w.on('error', () => { stats.errors += 1; closeW(r); r.mode = fs.existsSync(r.dir) ? 'poll' : 'gone'; if (r.mode === 'poll') r.list = listing(r.dir); onLost(r); armPoll(); });
    r.w = w; r.mode = 'watch';
  } catch (err) {
    stats.errors += 1;
    r.mode = err?.code === 'ENOENT' ? 'gone' : 'poll';
    if (r.mode === 'poll') r.list = listing(r.dir);
  }
}
function closeW(r) { if (r.w) { try { r.w.close(); } catch { /* closed */ } r.w = null; } }
let replanT = null;
function replan(now = false) {
  if (!now) { if (!replanT) { replanT = setTimeout(() => { replanT = null; replan(true); }, 120); replanT.unref?.(); } return; }
  const all = [...wants.map((w) => ({ path: w.path, kind: w.kind, deep: w.deep })), ...[...trees].map((t) => ({ path: t.dir, kind: 'folder', force: t.force !== false }))];
  const next = C.plan(all, { platform, P, home: os.homedir(), smallTree: platform === 'linux' ? smallTree : null });
  const sig = C.planSig(next, platform);
  if (sig !== planned) {
    planned = sig;
    const keep = new Set(next.map((r) => `${r.recursive ? 'R' : 'D'}${key(r.dir)}`));
    for (const [k, r] of roots) if (!keep.has(`${r.recursive ? 'R' : 'D'}${k}`)) { closeW(r); roots.delete(k); }
    for (const n of next) {
      const k = key(n.dir);
      const had = roots.get(k);
      if (had && had.recursive === n.recursive) continue;
      const r = { dir: n.dir, recursive: n.recursive, mode: 'watch', w: null };
      roots.set(k, r);
      open(r);
      // not there when asked (a file from the other computer, a disk not plugged in): no slow check for it; looked at
      // again on the next plan and after a wake
      if (r.mode === 'gone') r.mode = 'absent';
    }
  }
  for (const r of roots.values()) if (r.mode === 'absent' && fs.existsSync(r.dir)) open(r); // (it's there now)
  // the wanted files: their stamps now (a want arriving for a file that changed meanwhile isn't news: the window read it)
  const live = new Set();
  for (const w of wants) {
    if (w.kind !== 'file') continue;
    const k = key(w.path); live.add(k);
    if (!stamps.has(k)) stamps.set(k, stampNow(w.path));
  }
  for (const k of [...stamps.keys()]) if (!live.has(k)) stamps.delete(k);
  armPoll();
}
function stat(p) { try { const s = fs.statSync(p); return { size: s.size, mtime: s.mtimeMs, isDir: s.isDirectory() }; } catch { return null; } }
const placeholderOf = (p) => path.join(path.dirname(p), `.${path.basename(p)}.icloud`);
function stampNow(p) { const st = stat(p); if (st) return C.stampOf(st); return fs.existsSync(placeholderOf(p)) ? { none: true, offloaded: true } : { none: true }; }

// ---------- raw events → one batch ----------
const co = C.createCoalescer({ onFlush: (items, n) => flush(items, n) });
const touched = new Set(); // roots that had events in this batch (is the folder itself still there?)
function onRaw(r, ev, name) {
  stats.raw += 1;
  touched.add(r);
  // (round 46) the Mac's FSEvents names files decomposed (NFD): composed like every other path Hearth holds
  const rel = name == null ? '' : platform === 'darwin' ? String(name).normalize('NFC') : String(name);
  const abs = rel ? path.join(r.dir, rel) : r.dir;
  // sync's folders hear every event as fs.watch gave it (its own debounce and ignore list: an iCloud placeholder
  // arriving is news to sync, which asks iCloud for the file)
  for (const t of trees) if (C.inside(abs, t.dir, P, platform)) { try { t.fn(path.relative(t.dir, abs), ev); } catch (err) { console.warn('filewatch tree', err.message); } }
  if (!wants.length) { touched.delete(r); return; } // only sync listens here: no batch to make
  if (rel && C.ignored(rel)) {
    // an iCloud placeholder appearing / going is news for the file it stands for
    const real = C.icloudOf(path.basename(rel));
    if (!real) return;
    const file = path.join(r.dir, path.dirname(rel), real);
    if (stamps.has(key(file))) co.push(file, ev);
    return;
  }
  // an event without a name (the system lost track): the folder is looked at in the batch
  if (!rel) { co.push(r.dir, 'self'); return; }
  // only what a want can be about (a wanted file's folder, a wanted folder): the data folder's own saves (chats, kv)
  // under sync's watch never make a batch
  if (!near.dirs.has(key(path.dirname(abs))) && !near.folders.some((f) => C.inside(abs, f, P, platform))) {
    if (ev === 'rename') co.push(r.dir, 'touch'); // (a rename might be the folder itself going: looked at in the batch)
    else touched.delete(r);
    return;
  }
  co.push(abs, ev);
}
const near = { dirs: new Set(), folders: [] };
const busyFirst = new Map(); // key → when a file still being written was first seen
function flush(items, rawN) {
  stats.batches += 1;
  const t = Date.now();
  let changes = [];
  const later = [];
  const hasWantedDelete = { v: false };
  // a watched folder itself: gone (renamed, deleted, unplugged: its wanted files said once, by checkRoot) or still there
  const gone = [];
  for (const r of touched) if (roots.get(key(r.dir)) === r && !fs.existsSync(r.dir)) { checkRoot(r); gone.push(r); }
  touched.clear();
  for (const it of items) {
    const k = key(it.path);
    if (gone.some((r) => C.inside(it.path, r.dir, P, platform))) continue;
    // an event without a name (the system lost track): the folder's wanted files are looked at again
    const r = roots.get(k);
    if (r && it.evs.includes('self')) { checkRoot(r); if (r.mode !== 'gone') resync(r); continue; }
    if (r && it.evs.every((e) => e === 'touch')) continue; // (its folder was looked at above)
    const wanted = stamps.has(k);
    const folderTags = C.tagsFor(it.path, wants.filter((w) => w.kind === 'folder'), { P, platform });
    if (!wanted && !folderTags.length) { changes.push({ path: it.path, unknown: true }); continue; }
    const st = stat(it.path);
    const prev = stamps.get(k) || null;
    const c = C.classify(prev, st, { placeholder: !st && fs.existsSync(placeholderOf(it.path)), t });
    if (c.busy) {
      const f = busyFirst.get(k) || t; busyFirst.set(k, f);
      if (t - f < C.BUSY_MAX) { later.push(it.path); continue; }
    }
    busyFirst.delete(k);
    if (wanted) stamps.set(k, st ? C.stampOf(st) : { none: true, offloaded: c.kind === 'offloaded' });
    if (ownUntil.has(k)) { if (ownUntil.get(k) > t) continue; ownUntil.delete(k); }
    if (!c.kind) continue;
    if (c.kind === 'delete' && wanted) hasWantedDelete.v = true;
    changes.push({ path: it.path, kind: c.kind, size: st?.size ?? null, mtime: st?.mtime ?? null, prev, dir: Boolean(c.dir) });
  }
  // unknown paths count only as the other half of a rename of a wanted file (same folder: a rename in Finder)
  const unknown = changes.filter((c) => c.unknown);
  changes = changes.filter((c) => !c.unknown);
  if (hasWantedDelete.v) {
    for (const u of unknown) { const st = stat(u.path); if (st && !st.isDir) changes.push({ path: u.path, kind: 'add', size: st.size, mtime: st.mtime }); }
    changes = C.pairRenames(changes, { P, platform });
    // the add half of a rename nobody wants stays out; a rename's new name becomes the wanted file
    changes = changes.filter((c) => c.kind !== 'add' || stamps.has(key(c.path)) || C.tagsFor(c.path, wants, { P, platform }).length);
  }
  for (const p of later) setTimeout(() => co.push(p, 'busy'), C.SETTLE).unref?.();
  emit(changes, rawN);
}
function emit(changes, rawN = 0) {
  const out = [];
  for (const c of changes) {
    const tags = [...new Set([...C.tagsFor(c.path, wants, { P, platform }), ...(c.to ? C.tagsFor(c.to, wants, { P, platform }) : [])])];
    if (!tags.length) continue;
    out.push({ path: c.path, kind: c.kind, ...(c.to ? { to: c.to } : {}), size: c.size ?? null, mtime: c.mtime ?? null, tags });
  }
  stats.last = { at: Date.now(), raw: rawN, n: out.length };
  if (!out.length) return;
  stats.sent += 1;
  const w = getWin();
  try { if (w && !w.isDestroyed()) w.webContents.send('fw:changes', out); } catch { /* closing */ }
  for (const fn of listeners) { try { fn(out); } catch (err) { console.warn('filewatch', err.message); } }
}
const listeners = new Set();

// ---------- a watched folder gone / back, and the slow check ----------
function onLost(r) {
  // the folder's wanted files: unavailable (its disk is out) or deleted (the folder went)
  const vol = C.volumeOf(r.dir, { P, platform });
  const out = mode(r) === 'gone' ? wantedUnder(r).map((w) => {
    const k = key(w.path); const prev = stamps.get(k);
    if (prev?.none) return null;
    stamps.set(k, { none: true, unavailable: Boolean(vol && !fs.existsSync(vol)) });
    return { path: w.path, kind: vol && !fs.existsSync(vol) ? 'unavailable' : 'delete', prev };
  }).filter(Boolean) : [];
  if (out.length) emit(out);
}
const mode = (r) => r.mode;
// what a folder holds of what's wanted (gone: everything inside went with it, whatever watches it)
function wantedUnder(r) { return wants.filter((w) => C.inside(w.path, r.dir, P, platform)); }
function checkRoot(r) {
  if (fs.existsSync(r.dir)) {
    if (r.mode === 'gone') {
      open(r);
      const back = wants.filter((w) => w.kind === 'folder' && key(w.path) === key(r.dir)).map((w) => ({ path: w.path, kind: 'available' }));
      if (back.length) emit(back);
      resync(r);
    }
    return;
  }
  closeW(r); r.mode = 'gone';
  onLost(r);
  armPoll();
}
// every wanted file under a root (or all): stat again, what changed meanwhile goes out as one batch
function resync(r = null) {
  const out = [];
  for (const w of wants) {
    if (w.kind !== 'file' || (r && !wantedUnder(r).includes(w))) continue;
    const k = key(w.path); const prev = stamps.get(k) || null;
    const st = stat(w.path);
    const c = C.classify(prev?.unavailable ? null : prev, st, { placeholder: !st && fs.existsSync(placeholderOf(w.path)), settle: 0 });
    stamps.set(k, st ? C.stampOf(st) : { none: true });
    if (c.kind) out.push({ path: w.path, kind: prev?.unavailable && st ? 'available' : c.kind, size: st?.size ?? null, mtime: st?.mtime ?? null, prev });
  }
  if (out.length) emit(out);
  return out.length;
}
// a folder's direct children (poll mode): name → size:mtime
function listing(dir) {
  const m = new Map();
  try { for (const e of fs.readdirSync(dir, { withFileTypes: true }).slice(0, 2000)) { if (C.ignored(e.name)) continue; const s = stat(path.join(dir, e.name)); if (s) m.set(e.name, `${s.size}:${s.mtime}`); } } catch { /* gone */ }
  return m;
}
let polling = false;
function armPoll() {
  const need = [...roots.values()].some((r) => r.mode === 'poll' || r.mode === 'gone');
  const every = pw().every; const stop = pw().stop;
  if (need && !polling && every) { polling = true; every('filewatch', TEST && pollMs ? pollMs : C.POLL, poll); }
  if (!need && polling && stop) { polling = false; stop('filewatch'); }
}
let pollMs = 0;
function poll() {
  stats.polls += 1;
  for (const r of [...roots.values()]) {
    if (r.mode === 'gone') { checkRoot(r); continue; }
    if (r.mode !== 'poll') continue;
    if (!fs.existsSync(r.dir)) { checkRoot(r); continue; }
    // try the system again (a full table frees up, a share answers again), else compare the listing
    const was = r.list || new Map();
    open(r);
    const now = listing(r.dir);
    for (const [n, s] of now) if (was.get(n) !== s) co.push(path.join(r.dir, n), 'poll');
    for (const n of was.keys()) if (!now.has(n)) co.push(path.join(r.dir, n), 'poll');
    r.list = r.mode === 'poll' ? now : null;
    if (r.mode === 'watch') resync(r);
  }
  armPoll();
}

// ---------- sleep / wake ----------
// FSEvents can drop events across a sleep, a network share's handle can go stale: after the wake's settle every watch is
// opened again and every wanted file looked at once (one batch for what changed meanwhile)
let wokeSeen = 0; let wakeT = null;
function onPower(s) {
  if (!s?.wokeAt || s.wokeAt <= wokeSeen) return;
  wokeSeen = s.wokeAt;
  clearTimeout(wakeT);
  wakeT = setTimeout(() => { wakeT = null; rearm(); }, Math.max(0, s.wokeAt + (TEST && wakeMs != null ? wakeMs : pw().WAKE?.settle ?? 20000) - Date.now()));
  wakeT.unref?.();
}
let wakeMs = null;
function rearm() {
  stats.rearms += 1;
  for (const r of roots.values()) {
    if (r.mode === 'gone') { checkRoot(r); continue; }
    const was = r.mode; open(r);
    if (was === 'absent' && r.mode === 'gone') r.mode = 'absent';
  }
  const n = resync();
  armPoll();
  return n;
}

// ---------- the API ----------
let powered = false;
function hookPower() { if (powered) return; powered = true; pw().onState?.(onPower); }
function setWants(topic, items) {
  hookPower();
  const list = (Array.isArray(items) ? items : []).filter((x) => x && typeof x.path === 'string' && path.isAbsolute(x.path)).slice(0, 2000)
    .map((x) => ({ path: path.resolve(x.path), kind: x.kind === 'folder' ? 'folder' : 'file', tag: String(x.tag || topic), deep: x.deep !== false && !x.presence, presence: Boolean(x.presence), topic: String(topic) }));
  if (list.length) topics.set(String(topic), list); else topics.delete(String(topic));
  wants = [...topics.values()].flat();
  near.dirs = new Set(wants.filter((w) => w.kind === 'file').map((w) => key(path.dirname(w.path))));
  near.folders = wants.filter((w) => w.kind === 'folder' && !w.presence).map((w) => w.path); // (presence only: the folder itself, through its own root)
  replan();
  return { ok: true, n: list.length };
}
// Hearth is writing these itself (fsapi write / copy): not news for a moment
function own(paths) { const until = Date.now() + C.OWN_MS; for (const p of [].concat(paths || [])) if (p) ownUntil.set(key(p), until); if (ownUntil.size > 500) for (const [k, t] of ownUntil) if (t < Date.now()) ownUntil.delete(k); }
// main-side: every event under dir (relative name, event) → fn; { close() }
function tree(dir, fn, o = {}) {
  hookPower();
  const t = { dir: path.resolve(dir), fn, force: o.force !== false };
  trees.add(t);
  replan(true);
  // (round 79, syncscope79) healthy(): a live recursive system watch covers the folder (not polled, not gone): sync
  // trusts what it hears to look only at those paths; otherwise its passes look at everything
  return { close() { if (trees.delete(t)) replan(); }, healthy: () => [...roots.values()].some((r) => r.recursive && r.mode === 'watch' && r.w && C.inside(t.dir, r.dir, P, platform)) };
}
function state() {
  return {
    platform, roots: [...roots.values()].map((r) => ({ dir: r.dir, recursive: r.recursive, mode: r.mode })),
    wants: wants.length, topics: Object.fromEntries([...topics].map(([k, v]) => [k, v.length])), trees: trees.size,
    files: stamps.size, polling, ...stats,
  };
}

function register(ipcMain, o = {}) {
  getWin = o.getWin || getWin;
  hookPower();
  ipcMain.handle('fw:want', (_e, topic, items) => setWants(topic, items));
  ipcMain.handle('fw:own', (_e, paths) => { own(paths); return true; });
  ipcMain.handle('fw:state', () => state());
  ipcMain.handle('fw:test', (_e, t = {}) => testHook(t));
}

// ---------- tests only ----------
function testHook(t) {
  if (!TEST) throw new Error('Tests only');
  const out = {};
  if (t.pollMs != null) { pollMs = Number(t.pollMs); if (polling) { pw().stop?.('filewatch'); polling = false; } armPoll(); }
  if (t.wakeMs != null) wakeMs = Number(t.wakeMs);
  if (t.fail) { const r = roots.get(key(t.fail)) || [...roots.values()].find((x) => C.inside(t.fail, x.dir, P, platform)); if (r) { r.w?.emit('error', new Error('test')); out.failed = r.dir; } }
  if (t.rearm) out.rearmed = rearm();
  // another app at work (Hearth's own fs:write marks its writes as its own): write / rename / delete as Finder would
  for (const o of t.outside || []) {
    try {
      if (o.op === 'write') { fs.mkdirSync(path.dirname(o.path), { recursive: true }); fs.writeFileSync(o.path, o.b64 != null ? Buffer.from(o.b64, 'base64') : String(o.text ?? '')); }
      if (o.op === 'burst') for (let i = 0; i < (o.n || 200); i++) fs.writeFileSync(o.path, Buffer.from(o.b64s[i % o.b64s.length], 'base64'));
      if (o.op === 'rename') fs.renameSync(o.path, o.to);
      if (o.op === 'unlink') fs.unlinkSync(o.path);
      if (o.op === 'rmdir') fs.rmSync(o.path, { recursive: true, force: true });
      if (o.op === 'mkdir') fs.mkdirSync(o.path, { recursive: true });
    } catch (err) { (out.errors ||= []).push(`${o.op} ${o.path}: ${err.message}`); }
  }
  if (t.flush) co.flush();
  out.state = state();
  return out;
}

module.exports = { register, want: setWants, own, tree, state, resync, rearm, onChanges: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, _test: { roots, stamps, co, flush, testHook } };
