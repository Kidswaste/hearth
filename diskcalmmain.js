// 🧹 Disk calm, the main process (round 53, diskcalm; the words and rules are in diskcalm-core.js, the window in
// diskcalm.js). Loaded on first use (main.js lazyIpc) or by its schedule.
//   measure  what each part takes: the data folder (classified), Present bakes (wherever captures go), backups (every
//            backup folder of this computer), Electron's own profile (caches / sign-ins), Hearth's temp folders in the
//            computer's temp folder. Read only; cached for 30 s
//   free     one rebuildable part to the Trash (the no-bin check first: a network share / USB stick keeps it, said
//            why). The live caches (Chromium's own) are emptied through Electron instead (moving files a running
//            Chromium holds would break it). Refused while a game plays; refused when its index couldn't be read
//   tidy     calm and automatic, every 6 h on powerwise's schedule (never while a game plays, a render / backup /
//            export writes, or a Lab show runs): the caps (oldest first) and the provable orphans, to the Trash.
//            One quiet line goes to the window's Activity
// Never touches: chats, scenes, memory, settings, renders and captures you kept, backups, the owner's project files.
// In test runs (HEARTH_TEST_SAVE_DIR) the Trash is a folder there and the computer's temp folder is <saves>/tmp.
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const C = require('./diskcalm-core');

const TEST = Boolean(process.env.HEARTH_TEST_SAVE_DIR);
let o = { dataDir: '', getWin: () => null, store: null, settings: () => ({}) };
const E = () => o.electron || require('electron');
const dataDir = () => o.dataDir;
const userData = () => { if (o.userData) return o.userData; try { return E().app.getPath('userData'); } catch { return ''; } };
const tmpRoot = () => o.tmpDir || (TEST ? path.join(process.env.HEARTH_TEST_SAVE_DIR, 'tmp') : os.tmpdir());
const home = () => o.home || (TEST ? path.join(process.env.HEARTH_TEST_SAVE_DIR, 'home') : os.homedir());
const captureDir = () => { try { return o.settings?.()?.captureDir || path.join(dataDir(), 'captures'); } catch { return path.join(dataDir(), 'captures'); } };
const bakesDirs = () => [...new Set([path.join(captureDir(), 'Present bakes'), path.join(home(), 'Hearth presentations')])];
const backupDirs = () => { try { return (o.backupDirs ? o.backupDirs() : require('./backupautomain').dirs()) || []; } catch { return []; } };
const caseless = process.platform !== 'linux';
const norm = (p) => { const n = path.resolve(String(p || '')).normalize('NFC'); return caseless ? n.toLowerCase() : n; };
const same = (a, b) => norm(a) === norm(b);
const inside = (child, parent) => { const c = norm(child); const p = norm(parent); return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep); };
const playing = () => { try { if (o.playing) return o.playing(); return Boolean(require.cache[require.resolve('./gamemodemain')] && require('./gamemodemain').info().playing); } catch { return false; } };
// a render / export / backup / sync copy writing right now (crashsafe's in-flight list), or a Lab show
function busy() {
  if (o.busy) return o.busy();
  try { if (require('./crashsafemain')._state().inflight.length) return 'a long write is running'; } catch { /* not there */ }
  try { if (require('./powerwisemain').quietNow?.()) return 'a show is running'; } catch { /* not there */ }
  return '';
}

// ---------- walking (read only; links are never followed) ----------
async function walk(root, fn, rel = '', depth = 0) {
  let ents = [];
  try { ents = await fsp.readdir(path.join(root, rel), { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) { if (depth < 40 && fn(r, null, true) !== false) await walk(root, fn, r, depth + 1); continue; }
    let st; try { st = await fsp.lstat(path.join(root, r)); } catch { continue; }
    fn(r, st, false);
  }
}
async function sizeOf(p) {
  let st; try { st = await fsp.lstat(p); } catch { return 0; }
  if (!st.isDirectory()) return st.size;
  let n = 0; await walk(p, (_r, s) => { if (s) n += s.size; }); return n;
}
const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
async function listDir(d) { try { return (await fsp.readdir(d, { withFileTypes: true })).filter((e) => !e.isSymbolicLink()).map((e) => ({ name: e.name, path: path.join(d, e.name), dir: e.isDirectory(), at: mtime(path.join(d, e.name)) })); } catch { return []; } }
// a render's title frames (.hearth-titles-…) in the folders renders write to (two levels down at most)
async function findTitles() {
  const roots = [path.join(dataDir(), 'renders'), captureDir(), path.join(home(), 'Hearth exports')];
  const out = [];
  const look = async (d, depth) => { for (const e of await listDir(d)) { if (!e.dir) continue; if (/^\.hearth-titles-/i.test(e.name)) out.push(e); else if (depth < 2 && !e.name.startsWith('.')) await look(e.path, depth + 1); } };
  for (const r of [...new Set(roots)]) await look(r, 0);
  return out.filter((e, i) => out.findIndex((x) => same(x.path, e.path)) === i);
}
const hearthTemps = async () => (await listDir(tmpRoot())).filter((e) => C.isHearthTemp(e.name));

// ---------- measure ----------
let cached = null;
async function measure({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cached.at < 30000) return cached;
  const parts = Object.fromEntries(C.PARTS.map((p) => [p.id, 0]));
  const add = (id, n) => { parts[id] = (parts[id] || 0) + (Number(n) || 0); };
  const dd = dataDir();
  const bakes = bakesDirs();
  const bakesIn = bakes.find((b) => inside(b, dd));
  const bakesRel = bakesIn ? path.relative(dd, bakesIn).split(path.sep).join('/') : null;
  await walk(dd, (rel, st) => { if (st) add(C.classify(rel, { bakesRel }), st.size); });
  for (const b of bakes) if (!inside(b, dd)) add('bakes', await sizeOf(b));
  for (const t of await findTitles()) if (!inside(t.path, dd)) add('leftovers', await sizeOf(t.path));
  for (const t of await hearthTemps()) add('leftovers', await sizeOf(t.path));
  const seenB = [];
  for (const b of backupDirs()) { if (!b || inside(b, dd) || seenB.some((x) => inside(b, x))) continue; seenB.push(b); add('backups', await sizeOf(b)); }
  const ud = userData();
  if (ud && !inside(ud, dd)) await walk(ud, (rel, st, isDir) => { if (isDir) return !inside(path.join(ud, rel), dd); if (st) add(C.classifyProfile(rel), st.size); return true; });
  let diskFree = null; try { const s = fs.statfsSync(dd); diskFree = Number(s.bavail) * Number(s.bsize); } catch { /* unknown */ }
  const total = C.total(parts);
  cached = { at: Date.now(), parts, total, line: C.summary(parts), groups: C.groups(parts), freeable: C.freeable(parts), diskFree, playing: playing(), hint: C.hintFor({ total, freeable: C.freeable(parts), diskFree }), last };
  return cached;
}

// ---------- the Trash ----------
async function trash(p) {
  if (o.trash) return o.trash(p);
  if (TEST) {
    const to = path.join(process.env.HEARTH_TEST_SAVE_DIR, 'diskcalm-trash', `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}-${path.basename(p)}`);
    await fsp.mkdir(path.dirname(to), { recursive: true });
    try { await fsp.rename(p, to); } catch (err) { if (err.code !== 'EXDEV') throw err; await fsp.cp(p, to, { recursive: true }); await fsp.rm(p, { recursive: true, force: true }); }
    return to;
  }
  // (platform46) a network share, or a USB stick on Windows, has no Trash: there it stays (nothing is deleted for good)
  const check = process.platform === 'win32' ? require('./winpolish').trashCheck(p, { platform: 'win32' })
    : process.platform === 'darwin' ? require('./macpolish').trashCheck(p, { platform: 'darwin' }) : { ok: true };
  if (!check.ok) throw new Error(check.error || check.why || 'no Trash on that drive: left where it is');
  await E().shell.trashItem(check.path || p);
  return 'trash';
}
// several paths to the Trash; what couldn't go stays (and says why once)
async function trashAll(list, part, moved, failed) {
  for (const it of list) {
    const p = typeof it === 'string' ? it : it.path;
    const bytes = typeof it === 'object' && it.bytes != null ? it.bytes : await sizeOf(p);
    try { await trash(p); moved.push({ part, path: p, bytes }); } catch (err) { failed.push({ part, path: p, why: String(err.message || err) }); }
  }
}

// ---------- reads the rules need (unknown when they can't be read) ----------
async function scenes() { try { return C.sceneIds(await o.store.getKVStatus('three-sketches')); } catch { return null; } }
async function bakeIndex() {
  try {
    const r = await o.store.getKVStatus('present-bakes');
    if (r.state === 'missing') return [];
    if (r.state !== 'ok' || r.from === 'prev') return null;
    return Array.isArray(r.value) ? r.value : null;
  } catch { return null; }
}
function optimizedIndex() {
  const r = require('./datasafe-core').load(fs, path.join(dataDir(), 'game-cache', 'index.json'), null);
  if (r.state === 'missing') return { v: 1, entries: {} };
  return r.state === 'ok' && r.value && typeof r.value.entries === 'object' ? r.value : null;
}
const forgetOptimized = () => { try { if (require.cache[require.resolve('./gamereadymain')]) require('./gamereadymain').forget?.(); } catch { /* not loaded */ } };
async function builds() {
  return Promise.all((await listDir(path.join(dataDir(), 'game'))).filter((e) => e.dir).map(async (e) => ({ ...e, at: mtime(path.join(e.path, 'hearth-play.json')) || e.at, bytes: await sizeOf(e.path) })));
}
async function filesIn(dirs) { const out = []; for (const d of dirs) for (const e of await listDir(d)) if (!e.dir) out.push(e); return out; }

// ---------- free up one part (asked for) ----------
async function clearSession(ses) {
  await ses.clearCache();
  try { await ses.clearCodeCaches({}); } catch { /* older Electron */ }
  try { await ses.clearStorageData({ storages: ['shadercache'] }); } catch { /* not this session's */ }
}
async function free(id) {
  const P = C.BY[id];
  if (!P) return { ok: false, why: 'Hearth doesn\'t know that part.' };
  if (!P.free) return { ok: false, why: `${P.label}: ${P.keep}.${/never/.test(P.keep) ? '' : ' Hearth never frees it.'}` };
  if (['play', 'optimized', 'gameshaders'].includes(id) && playing()) return { ok: false, why: 'A game is playing: free this after it ends.' };
  const before = (await measure({ fresh: true })).parts[id] || 0;
  const moved = []; const failed = [];
  const dd = dataDir();
  if (id === 'play') await trashAll((await builds()).map((b) => ({ path: b.path, bytes: b.bytes })), id, moved, failed);
  else if (id === 'optimized') {
    if (!optimizedIndex()) return { ok: false, why: 'The list of optimized models couldn\'t be read just now: nothing was moved. Try again in a moment.' };
    const gc = path.join(dd, 'game-cache');
    await trashAll((await listDir(gc)).map((e) => e.path), id, moved, failed);
    forgetOptimized();
  } else if (id === 'bakes') {
    const idx = await bakeIndex();
    if (!idx) return { ok: false, why: 'The list of bakes couldn\'t be read just now: nothing was moved. Try again in a moment.' };
    await trashAll(await filesIn(bakesDirs()), id, moved, failed);
    const kept = idx.filter((e) => failed.some((f) => same(f.path, e.path || '')));
    if (idx.length !== kept.length) { try { await o.store.setKV('present-bakes', kept); } catch { /* a missing file is baked again anyway */ } }
  } else if (id === 'thumbs') await trashAll((await listDir(path.join(dd, '.cache'))).map((e) => e.path), id, moved, failed);
  else if (id === 'logs') await trashAll(['engine.prev.log', 'engine.log'].map((n) => path.join(dd, n)).filter((p) => fs.existsSync(p)), id, moved, failed);
  else if (id === 'leftovers') await tidyLeftovers({ now: Date.now(), age: true, moved, failed });
  else if (id === 'gameshaders' || id === 'appcache') {
    const S = E().session;
    try {
      if (id === 'gameshaders') await clearSession(S.fromPartition('persist:hearth-game'));
      else {
        await clearSession(S.defaultSession);
        for (const e of await listDir(path.join(userData(), 'Partitions'))) if (e.dir && e.name.toLowerCase() !== 'hearth-game') await clearSession(S.fromPartition(`persist:${e.name}`));
      }
    } catch (err) { failed.push({ part: id, path: '', why: String(err.message || err) }); }
  }
  const after = (await measure({ fresh: true })).parts[id] || 0;
  const freed = Math.max(0, before - after);
  const res = { ok: !failed.length || moved.length > 0 || freed > 0, part: id, freed, moved: moved.length, failed: failed.slice(0, 5).map((f) => f.why), back: P.back, line: cached.line };
  if (!res.ok) res.why = failed[0]?.why || 'Nothing could be moved.';
  return res;
}

// ---------- tidy: caps and orphans, by itself ----------
// the provable leftovers: render title frames (6 h), Hearth's temp folders (2 days); a free-up asked for takes them at
// an hour (renders and copies write as they go: an hour-old one has stopped). asked: the rules' clocks run ahead so
// their 6 h / 2 days become that hour
async function tidyLeftovers({ now, age = false, moved, failed }) {
  await trashAll(C.staleTitles(await findTitles(), { now: age ? now + 5 * C.HOUR : now }), 'leftovers', moved, failed);
  await trashAll(C.staleTemps(await hearthTemps(), { now: age ? now + 47 * C.HOUR : now }), 'leftovers', moved, failed);
  // temp files a killed save left in the data folder: crashsafe decides (a whole newer version takes its place)
  try { const cs = require('./crashsafemain'); if (age && cs._state().dir) for (const d of await cs.sweep({ roots: [dataDir()], before: now - C.HOUR })) if (d.action === 'trash') moved.push({ part: 'leftovers', path: d.file, bytes: 0 }); } catch { /* not there */ }
}
let last = null; // { at, line, bytes, moved }
let running = null;
function tidy(reason = 'auto') { if (!running) running = doTidy(reason).finally(() => { running = null; }); return running; }
async function doTidy(reason) {
  const why = playing() ? 'a game is playing' : busy();
  if (why) return { skipped: why };
  const now = Date.now(); const moved = []; const failed = [];
  const ids = await scenes();
  // ▶ Play builds: scenes that are gone, then the cap (oldest built first)
  let bs = await builds();
  const gone = C.orphanBuilds(bs, ids, { now });
  await trashAll(gone, 'play', moved, failed);
  bs = bs.filter((b) => !gone.includes(b));
  await trashAll(C.capPlan(bs, { ...C.CAPS.play, now }).drop, 'play', moved, failed);
  // Present bakes of scenes that are gone; bake files no entry points at
  const idx = await bakeIndex();
  if (idx) {
    const ob = C.orphanBakes(idx, ids, await filesIn(bakesDirs()), { now, same });
    await trashAll(ob.entries.filter((e) => fs.existsSync(e.path || '')).map((e) => ({ path: e.path, bytes: e.bytes })), 'bakes', moved, failed);
    await trashAll(ob.files, 'bakes', moved, failed);
    const dropKeys = new Set(ob.entries.filter((e) => !failed.some((f) => same(f.path, e.path || ''))).map((e) => e.key));
    if (dropKeys.size) { try { await o.store.setKV('present-bakes', idx.filter((e) => !dropKeys.has(e.key))); } catch { /* next time */ } }
  }
  // optimized copies no index points at
  const oi = optimizedIndex();
  if (oi) await trashAll(C.orphanOptimized(oi, await filesIn([path.join(dataDir(), 'game-cache', 'files')]), { now, same }), 'optimized', moved, failed);
  // asset pictures: the cap (oldest first)
  const th = await filesIn((await listDir(path.join(dataDir(), '.cache'))).filter((e) => e.dir).map((e) => e.path));
  const thumbs = await Promise.all(th.map(async (f) => ({ ...f, bytes: await sizeOf(f.path) })));
  await trashAll(C.capPlan(thumbs, { ...C.CAPS.thumbs, now }).drop, 'thumbs', moved, failed);
  await tidyLeftovers({ now, moved, failed });
  const bytes = moved.reduce((s, m) => s + (m.bytes || 0), 0);
  if (moved.length) {
    last = { at: now, reason, bytes, moved: moved.length, line: C.tidyLine(moved), parts: [...new Set(moved.map((m) => m.part))] };
    send('diskcalm:tidied', last);
  }
  cached = null;
  const m = await measure({ fresh: true });
  if (m.hint) send('diskcalm:hint', { ...m.hint, line: m.line, freeable: m.freeable });
  return { moved, failed: failed.map((f) => f.why), bytes, line: moved.length ? last.line : '', measured: m.line };
}
const send = (ch, d) => { try { const w = o.getWin?.(); if (w && !w.isDestroyed()) w.webContents.send(ch, d); } catch { /* closing */ } };
const tick = () => tidy('auto').catch((err) => console.warn('diskcalm: tidy', err.message));

// ---------- tests: a throwaway heavy week (only with HEARTH_TEST_SAVE_DIR) ----------
// files: [{ where: 'data' | 'userData' | 'backups' | 'tmp' | 'home', rel, bytes, ago (ms), text }]
async function testHook(op, arg) {
  if (!TEST) throw new Error('Tests only');
  if (op === 'fixture') {
    const roots = { data: dataDir(), userData: userData(), backups: backupDirs()[0], tmp: tmpRoot(), home: home() };
    for (const f of arg || []) {
      const root = roots[f.where || 'data'];
      if (!root || (f.where === 'home' && !TEST)) continue;
      const p = path.join(root, ...String(f.rel).split('/'));
      await fsp.mkdir(path.dirname(p), { recursive: true });
      if (f.text != null) await fsp.writeFile(p, f.text); else { await fsp.writeFile(p, ''); await fsp.truncate(p, Number(f.bytes) || 0); }
      if (f.ago) { // the file and the folders it made take its age (a render's title folder, a temp folder)
        const t = new Date(Date.now() - f.ago); await fsp.utimes(p, t, t);
        for (let d = path.dirname(p); inside(d, root) && !same(d, root); d = path.dirname(d)) { try { await fsp.utimes(d, t, t); } catch { /* fine */ } }
      }
    }
    cached = null;
    return { roots };
  }
  if (op === 'trash') { const d = path.join(process.env.HEARTH_TEST_SAVE_DIR, 'diskcalm-trash'); return (await listDir(d)).map((e) => e.name); }
  if (op === 'roots') return { data: dataDir(), userData: userData(), backups: backupDirs(), tmp: tmpRoot(), bakes: bakesDirs(), home: home() };
  if (op === 'set') { o = { ...o, ...arg }; cached = null; return true; }
  throw new Error(`no test op ${op}`);
}

function configure(opts = {}) { o = { ...o, ...opts }; cached = null; return o; }
function register(ipcMain, opts = {}) {
  configure(opts);
  ipcMain.handle('diskcalm:measure', (_e, a) => measure({ fresh: Boolean(a?.fresh) }));
  ipcMain.handle('diskcalm:free', (_e, id) => free(String(id || '')));
  ipcMain.handle('diskcalm:tidy', () => tidy('asked'));
  ipcMain.handle('diskcalm:last', () => last);
  ipcMain.handle('diskcalm:test', (_e, op, arg) => testHook(op, arg));
}

module.exports = { register, configure, measure, free, tidy, tick, last: () => last, _test: { walk, sizeOf, findTitles, hearthTemps, trash, testHook, reset: () => { cached = null; last = null; } } };
