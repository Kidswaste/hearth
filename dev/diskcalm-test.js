#!/usr/bin/env node
// Unit test for "Space Hearth uses" (round 53, diskcalm), on throwaway folders only:
//   · the rules (diskcalm-core.js): where a file belongs, the one-line summary, the caps (oldest first, never one used
//     in the last hour), the orphan rules (and that each decides nothing when what it compares against is unknown),
//     the calm note's thresholds, the Activity line
//   · a simulated heavy week (sparse files: the sizes are real to the disk's accounting, no room used): the measured
//     total of every part is exactly what was written; the table printed is the one in docs/upgrades/diskcalm.md
//   · Free up moves only that rebuildable part to a test Trash; the owner's work, backups and safety copies are
//     refused and every one of their files is untouched (same size and bytes); a game playing holds the game parts
//   · the calm tidy: Play builds of deleted scenes, bakes of deleted scenes and stray bake files, optimized copies no
//     index points at, old render title frames and old Hearth temp folders go; fresh ones stay; an unreadable scenes
//     store or bakes list removes nothing; the caps
//   node dev/diskcalm-test.js            (--table: only print the heavy week's measure)
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-diskcalm-'));
process.env.HEARTH_TEST_SAVE_DIR = base; // the Trash is <base>/diskcalm-trash, the temp folder <base>/tmp, home <base>/home
const C = require(path.join(ROOT, 'diskcalm-core.js'));
const M = require(path.join(ROOT, 'diskcalmmain.js'));
const { MB, GB, HOUR, DAY } = C;

let fails = 0;
const check = (ok, label, extra) => { if (!ok) { fails += 1; console.log(`✖ ${label}${extra !== undefined ? ` · ${JSON.stringify(extra).slice(0, 400)}` : ''}`); } else console.log(`✓ ${label}`); };
const table = process.argv.includes('--table');

// ---------- the heavy week (a week of the owner's real use, scaled from round 52's ▶ Play / Present / capture sizes) ----------
// [where, rel, bytes, part, age]
function heavyWeek() {
  const L = [];
  const add = (where, rel, bytes, part, ago = HOUR * 30, extra = {}) => L.push({ where, rel, bytes, part, ago, ...extra });
  // your work
  for (let i = 0; i < 400; i++) add('data', `chats/c${i}.json`, 42 * 1024, 'work');
  add('data', 'kv/three-sketches.json', 0, 'work', HOUR * 2, { text: JSON.stringify([{ id: 'clink' }, { id: 'orbit' }, { id: 'neon tunnel' }]) });
  add('data', 'kv/three-history.json', 9 * MB, 'work');
  add('data', 'kv/notes.json', 2 * MB, 'work');
  add('data', 'memory.json', 300 * 1024, 'work');
  add('data', 'attachments/big-ref.png', 300 * MB, 'work');
  for (let i = 0; i < 6; i++) add('data', `captures/recordings/take${i}.webm`, 420 * MB, 'work');
  for (let i = 0; i < 4; i++) add('data', `renders/clink-${i}.mp4`, 450 * MB, 'work');
  add('data', 'assets/packs/hdri.exr', 120 * MB, 'work');
  add('data', 'workspace/session.jsonl', 18 * MB, 'work');
  // ▶ Play builds (3 scenes that exist, 2 deleted), the optimize cache, the game's shader cache
  for (const id of ['clink', 'orbit', 'neon_tunnel', 'old_demo', 'test_scene']) {
    add('data', `game/${id}/play.html`, 40 * 1024, 'play', DAY * 2);
    add('data', `game/${id}/three/three.module.js`, 1300 * 1024, 'play', DAY * 2);
    add('data', `game/${id}/assets/song.mp3`, 9 * MB, 'play', DAY * 2);
    add('data', `game/${id}/hearth-play.json`, 0, 'play', DAY * 2, { text: JSON.stringify({ key: id }) });
  }
  add('data', 'game-cache/index.json', 0, 'optimized', DAY, { text: JSON.stringify({ v: 1, entries: { k1: { key: 'k1', out: 'GC/files/k1.glb' }, k2: { key: 'k2', out: 'GC/files/k2.glb' } } }) });
  add('data', 'game-cache/files/k1.glb', 280 * MB, 'optimized');
  add('data', 'game-cache/files/k2.glb', 260 * MB, 'optimized');
  add('data', 'game-cache/files/k3.glb.part.glb', 60 * MB, 'optimized', DAY * 3); // a killed Optimize
  add('userData', 'Partitions/hearth-game/GPUCache/data_1', 32 * MB, 'gameshaders');
  add('userData', 'Partitions/hearth-game/Code Cache/js/index', 22 * MB, 'gameshaders');
  add('userData', 'Partitions/hearth-game/Cache/Cache_Data/data_2', 30 * MB, 'gameshaders');
  // Present bakes (the captures folder): 4 listed (one of a deleted scene) + one stray from a cancelled bake
  for (const [k, scene] of [['b1', 'clink'], ['b2', 'orbit'], ['b3', 'clink'], ['b4', 'gone-scene']]) add('data', `captures/Present bakes/${k}.mp4`, 300 * MB, 'bakes', DAY * 2, { bake: { key: k, scene } });
  add('data', 'captures/Present bakes/b9.mp4', 90 * MB, 'bakes', DAY * 3);
  // backups (outside the data folder)
  for (let i = 0; i < 7; i++) add('backups', `Hearth backup ${i}.zip`, 120 * MB, 'backups');
  add('backups', '.hearth/media/take0.webm', 420 * MB, 'backups');
  add('backups', '.hearth/media/clink-0.mp4', 450 * MB, 'backups');
  // Electron's own: caches and the profile (sign-ins)
  add('userData', 'Cache/Cache_Data/data_3', 140 * MB, 'appcache');
  add('userData', 'Code Cache/js/x', 46 * MB, 'appcache');
  add('userData', 'GPUCache/data_0', 8 * MB, 'appcache');
  add('userData', 'Partitions/miro/Cache/Cache_Data/d', 60 * MB, 'appcache');
  add('userData', 'Partitions/miro/Cookies', 1 * MB, 'profile');
  add('userData', 'Local Storage/leveldb/000.ldb', 6 * MB, 'profile');
  // asset pictures
  for (let i = 0; i < 400; i++) add('data', `.cache/asset-thumbs/t${i}.webp`, 60 * 1024, 'thumbs', DAY * (1 + (i % 30)));
  add('data', '.cache/asset-previews/p.jpg', 40 * MB, 'thumbs', DAY * 40);
  // logs
  add('data', 'engine.log', 1.6 * MB, 'logs');
  add('data', 'engine.prev.log', 2 * MB, 'logs');
  // safety copies
  for (let i = 0; i < 10; i++) add('data', `kv/.history/three-sketches/${i}.json`, 3 * MB, 'safety');
  add('data', 'kv/three-history.prev.json', 9 * MB, 'safety');
  add('data', 'trash/c-old.json', 20 * MB, 'safety');
  add('data', 'sync/trash/2026-10-10/chats/c.json', 30 * MB, 'safety');
  add('data', '.undo-hold/a1/file.png', 25 * MB, 'safety');
  add('data', '.held/chats/c9.json', 1 * MB, 'safety');
  add('data', 'safetynet/journal.json', 200 * 1024, 'safety');
  // Hearth's own records
  add('data', 'sync/state.json', 2 * MB, 'other');
  add('data', 'window.json', 1024, 'other');
  // leftovers: a killed render's title frames (old) and one still being written (fresh); temp folders (old / fresh)
  add('data', 'renders/.hearth-titles-xp1a2b/frame_00001.png', 150 * MB, 'leftovers', DAY);
  add('data', 'renders/.hearth-titles-xp9z/frame_00001.png', 20 * MB, 'leftovers', 5 * 60e3);
  add('tmp', 'hub-zip-abc/data/kv/notes.json', 380 * MB, 'leftovers', DAY * 3);
  add('tmp', 'hearth-report-123-x.md', 20 * 1024, 'leftovers', DAY * 4);
  add('tmp', 'hearth-backup-fresh/x.json', 10 * MB, 'leftovers', 10 * 60e3);
  add('tmp', 'someone-elses-temp/x.bin', 50 * MB, null, DAY * 9); // not Hearth's: never counted, never moved
  return L;
}

function writeFixture(roots, list) {
  for (const f of list) {
    const p = path.join(roots[f.where], ...f.rel.split('/'));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (f.text != null) fs.writeFileSync(p, f.text); else { fs.writeFileSync(p, ''); fs.truncateSync(p, Math.round(f.bytes)); }
    const t = new Date(Date.now() - f.ago);
    fs.utimesSync(p, t, t);
  }
  // folders take the age of what's in them (a render's title folder, a temp folder, a build)
  for (const f of list) {
    const segs = f.rel.split('/');
    for (let i = segs.length - 1; i > 0; i--) { const d = path.join(roots[f.where], ...segs.slice(0, i)); const t = new Date(Date.now() - f.ago); try { fs.utimesSync(d, t, t); } catch { /* fine */ } }
  }
}
// a file as it is: its size, its date and the hash of its first 1 MB (the big fixture files are sparse zeros)
const sha = (p) => { try { const st = fs.statSync(p); const fd = fs.openSync(p, 'r'); const b = Buffer.alloc(Math.min(st.size, MB)); fs.readSync(fd, b, 0, b.length, 0); fs.closeSync(fd); return `${crypto.createHash('sha1').update(b).digest('hex')}:${st.size}:${st.mtimeMs}`; } catch { return 'gone'; } };
const exists = (p) => fs.existsSync(p);

// a kv store like store.js's: { state, value, from } from data/kv/<name>.json; faults: names that can't be read
function kvStore(dataDir, faults = new Set()) {
  const file = (n) => path.join(dataDir, 'kv', `${n}.json`);
  return {
    getKVStatus: (n) => { if (faults.has(n)) return { state: 'unreadable', code: 'EBUSY' }; try { return { state: 'ok', value: JSON.parse(fs.readFileSync(file(n), 'utf8')), from: 'file' }; } catch (err) { return err.code === 'ENOENT' ? { state: 'missing' } : { state: 'unreadable' }; } },
    setKV: (n, v) => { fs.mkdirSync(path.dirname(file(n)), { recursive: true }); fs.writeFileSync(file(n), JSON.stringify(v)); return true; },
  };
}
// Electron's session stand-in: clearCache empties that profile's cache folders (Chromium's own job)
function electronStub(userData, calls) {
  const wipe = (rootRel) => { for (const d of C.CACHE_DIRS) fs.rmSync(path.join(userData, rootRel, d), { recursive: true, force: true }); };
  const ses = (rel) => ({ clearCache: async () => { calls.push(`cache:${rel || 'default'}`); wipe(rel); }, clearCodeCaches: async () => calls.push(`code:${rel || 'default'}`), clearStorageData: async () => calls.push(`storage:${rel || 'default'}`) });
  return { session: { defaultSession: ses(''), fromPartition: (p) => ses(path.join('Partitions', p.replace(/^persist:/, ''))) }, app: { getPath: () => userData }, shell: { trashItem: async () => { throw new Error('the real Trash is never used in tests'); } } };
}

function setup(name, { faults } = {}) {
  const dir = path.join(base, name);
  const roots = { data: path.join(dir, 'data'), userData: path.join(dir, 'userData'), backups: path.join(dir, 'Documents', 'Hearth backups'), tmp: path.join(dir, 'tmp'), home: path.join(dir, 'home') };
  for (const r of Object.values(roots)) fs.mkdirSync(r, { recursive: true });
  const list = heavyWeek();
  writeFixture(roots, list);
  // the bakes list and the optimize index name real paths
  const bakes = list.filter((f) => f.bake).map((f) => ({ key: f.bake.key, scene: f.bake.scene, path: path.join(roots.data, ...f.rel.split('/')), bytes: f.bytes, usedAt: Date.now() - f.ago }));
  kvStore(roots.data).setKV('present-bakes', bakes);
  const ix = path.join(roots.data, 'game-cache', 'index.json');
  fs.writeFileSync(ix, fs.readFileSync(ix, 'utf8').replaceAll('GC/', `${path.join(roots.data, 'game-cache').split(path.sep).join('/')}/`).replace(/"out":"([^"]+)"/g, (_m, p) => `"out":${JSON.stringify(path.normalize(p))}`));
  const calls = [];
  let play = false;
  M._test.reset();
  M.configure({ dataDir: roots.data, userData: roots.userData, tmpDir: roots.tmp, home: roots.home, backupDirs: () => [roots.backups], store: kvStore(roots.data, faults), settings: () => ({}), electron: electronStub(roots.userData, calls), playing: () => play, busy: () => '', trash: undefined });
  return { dir, roots, list, calls, setPlaying: (v) => { play = v; }, pathOf: (f) => path.join(roots[f.where], ...f.rel.split('/')), trashDir: path.join(base, 'diskcalm-trash') };
}
// what each part should measure: the sizes written (a text file as it is on disk now: setup rewrites the index), plus
// the bakes list setup wrote (the owner's kv store: your work)
const expected = (list, roots) => {
  const e = Object.fromEntries(C.PARTS.map((p) => [p.id, 0]));
  for (const f of list) if (f.part) e[f.part] += f.text != null ? fs.statSync(path.join(roots[f.where], ...f.rel.split('/'))).size : Math.round(f.bytes);
  e.work += fs.statSync(path.join(roots.data, 'kv', 'present-bakes.json')).size;
  return e;
};

(async () => {
  // ---------- the rules ----------
  const cls = {
    'chats/c1.json': 'work', 'kv/three-sketches.json': 'work', 'memory.json': 'work', 'captures/recordings/a.webm': 'work', 'renders/x.mp4': 'work', 'attachments/a-before-b.png': 'work',
    'game/clink/play.html': 'play', 'game-cache/files/k.glb': 'optimized', 'captures/Present bakes/b.mp4': 'bakes', '.cache/asset-thumbs/a.webp': 'thumbs',
    'engine.log': 'logs', 'engine.prev.log': 'logs', 'kv/notes.prev.json': 'safety', 'kv/.history/notes/1.json': 'safety', '.history/memory/1.json': 'safety',
    'trash/x.json': 'safety', 'sync/trash/2026-01-01/x': 'safety', '.held/chats/c.json': 'safety', 'kv/notes-torn-abc.json': 'safety', 'attachments/x.prev.json': 'work',
    'renders/.hearth-titles-xp12/f.png': 'leftovers', 'sync/state.json': 'other', 'mcp-runs/a.json': 'other', 'window.json': 'other',
    'chats\\c2.json': 'work', 'game\\x\\three\\a.js': 'play',
  };
  const wrong = Object.entries(cls).filter(([r, want]) => C.classify(r) !== want).map(([r, want]) => `${r}: ${C.classify(r)} ≠ ${want}`);
  check(!wrong.length, `classify: ${Object.keys(cls).length} paths, the owner's work unless proven otherwise`, wrong);
  check(C.classify('Bakes/x.mp4', { bakesRel: 'Bakes' }) === 'bakes' && C.classify('captures/Present bakes/b.mp4', { bakesRel: null }) === 'work', 'classify: bakes follow where captures go');
  const prof = { 'Cache/Cache_Data/x': 'appcache', 'GPUCache/a': 'appcache', 'Partitions/hearth-game/GPUCache/a': 'gameshaders', 'Partitions/Hearth-Game/Code Cache/js/a': 'gameshaders', 'Partitions/miro/Cache/a': 'appcache', 'Partitions/miro/Cookies': 'profile', 'Local Storage/leveldb/1.ldb': 'profile', 'Preferences': 'profile' };
  const wrongP = Object.entries(prof).filter(([r, want]) => C.classifyProfile(r) !== want);
  check(!wrongP.length, 'classifyProfile: caches vs sign-ins', wrongP);
  check(['hub-zip-1', 'hearth-backup-x', 'hearth-report-1-a.md', 'hearth-frames', 'agent-hub-import-z'].every(C.isHearthTemp) && !['hearth', 'motion', 'voice', 'Hearth drag', 'someone-hearth-backup-'].some(C.isHearthTemp), 'Hearth\'s temp folders by name, nothing else');
  check(C.fmt(2.4 * GB) === '2.4 GB' && C.fmt(600 * MB) === '600 MB' && C.fmt(0) === '0 KB' && C.fmt(1536) === '2 KB', 'sizes in plain words');
  const s1 = C.summary({ backups: 1.2 * GB, play: 400 * MB, optimized: 200 * MB, bakes: 400 * MB, logs: 50 * MB, leftovers: 150 * MB, work: 0 });
  check(s1 === '2.4 GB: backups 1.2 GB · game cache 600 MB · bakes 400 MB · other 200 MB', 'the one line reads like the brief', s1);
  check(C.summary({}) === 'Nothing yet', 'nothing measured: "Nothing yet"');
  const now = Date.now();
  const ents = [1, 2, 3, 4, 5].map((i) => ({ path: `p${i}`, bytes: 100, at: now - i * DAY }));
  check(C.capPlan(ents, { bytes: 250, now }).drop.map((e) => e.path).join() === 'p5,p4,p3', 'cap by size: the oldest first until under');
  check(C.capPlan(ents, { count: 3, now }).drop.map((e) => e.path).join() === 'p5,p4', 'cap by count: the oldest first');
  check(C.capPlan([...ents, { path: 'fresh', bytes: 10000, at: now - 60e3 }], { bytes: 100, now }).drop.every((e) => e.path !== 'fresh'), 'a cap never takes one used in the last hour');
  check(C.capPlan(ents, { bytes: 1e9, count: 99, now }).drop.length === 0, 'under the cap: nothing goes');
  check(C.sceneIds({ state: 'unreadable' }) === null && C.sceneIds({ state: 'ok', from: 'prev', value: [{ id: 'a' }] }) === null && C.sceneIds({ state: 'ok', value: [] }) === null && C.sceneIds({ state: 'missing' }) === null, 'scenes unknown (unreadable, from a copy, empty, missing): no rule runs on them');
  const builds = [{ name: 'clink', at: now - DAY }, { name: 'neon_tunnel', at: now - DAY }, { name: 'gone', at: now - DAY }, { name: 'gone_new', at: now - 60e3 }];
  check(C.orphanBuilds(builds, ['clink', 'neon tunnel'], { now }).map((b) => b.name).join() === 'gone', 'Play builds of deleted scenes (ids made folder-safe; never one built in the last hour)');
  check(C.orphanBuilds(builds, null, { now }).length === 0, 'Play builds: scenes unknown → nothing');
  const ob = C.orphanBakes([{ key: 'a', scene: 's1', path: '/b/a.mp4' }, { key: 'b', scene: 'gone', path: '/b/b.mp4' }], ['s1'], [{ path: '/b/a.mp4', at: 0 }, { path: '/b/b.mp4', at: 0 }, { path: '/b/c.mp4', at: 0 }, { path: '/b/d.mp4', at: now }], { now });
  check(ob.entries.map((e) => e.key).join() === 'b' && ob.files.map((f) => f.path).join() === '/b/c.mp4', 'bakes of deleted scenes + stray bake files a day old', ob);
  check(C.orphanBakes(null, ['s1'], [{ path: '/b/c.mp4', at: 0 }], { now }).files.length === 0, 'bakes list unreadable → nothing');
  check(C.orphanBakes([{ key: 'a', scene: 'x', path: '/b/a.mp4' }], null, [], { now }).entries.length === 0, 'bakes: scenes unknown → no scene rule');
  check(C.orphanOptimized({ entries: { a: { out: '/g/a.glb' } } }, [{ path: '/g/a.glb', at: 0 }, { path: '/g/z.part.glb', at: 0 }, { path: '/g/new.glb', at: now }], { now }).map((f) => f.path).join() === '/g/z.part.glb', 'optimized copies no index points at (a day old)');
  check(C.orphanOptimized(null, [{ path: '/g/z.glb', at: 0 }], { now }).length === 0, 'optimize index unreadable → nothing');
  check(C.staleTitles([{ name: '.hearth-titles-xp1', at: now - 7 * HOUR }, { name: '.hearth-titles-xp2', at: now - HOUR }, { name: 'titles', at: 0 }], { now }).length === 1, 'render title frames: only a render that ended (6 h)');
  check(C.staleTemps([{ name: 'hub-zip-a', at: now - 3 * DAY }, { name: 'hub-zip-b', at: now - DAY }, { name: 'other', at: 0 }], { now }).length === 1, 'Hearth temp folders: two days untouched');
  check(C.hintFor({ total: 30 * GB, freeable: 3 * GB, diskFree: 200 * GB })?.kind === 'big' && C.hintFor({ total: 30 * GB, freeable: 200 * MB, diskFree: 200 * GB }) === null && C.hintFor({ total: 10 * GB, freeable: 9 * GB, diskFree: 200 * GB }) === null, 'the note: only past 25 GB with 1 GB+ to free');
  check(C.hintFor({ total: 1 * GB, freeable: 0, diskFree: 3 * GB })?.kind === 'low' && C.hintFor({ total: 1 * GB, diskFree: null }) === null, 'the note: under 5 GB free whatever Hearth uses');
  const tl = C.tidyLine([{ part: 'play', bytes: 900 * MB }, { part: 'leftovers', bytes: 380 * MB }]);
  check(/^Tidied 1\.3 GB .* \(play builds, leftovers\) — to the Trash$/.test(tl) && C.tidyLine([]) === '', 'the Activity line', tl);

  // ---------- the heavy week, measured ----------
  const A = setup('measure');
  const m = await M.measure({ fresh: true });
  const want = expected(A.list, A.roots);
  const off = C.PARTS.filter((p) => m.parts[p.id] !== want[p.id]).map((p) => `${p.id}: ${m.parts[p.id]} ≠ ${want[p.id]}`);
  // the profile has Chromium's own files too in a real run; here only the fixture's
  check(!off.length, 'every part measures exactly what was written (data, bakes, backups, profile, temp)', off);
  check(m.total === C.total(want) && m.line === C.summary(want), `the total and the line: ${m.line}`);
  check(m.freeable === C.freeable(want), `can be freed: ${C.fmt(m.freeable)}`);
  console.log('\nThe heavy week, measured:');
  for (const g of m.groups) console.log(`  ${g.group.padEnd(14)} ${C.fmt(g.bytes).padStart(8)}  (${g.ids.map((id) => `${id} ${C.fmt(m.parts[id])}`).join(', ')})`);
  console.log(`  ${'total'.padEnd(14)} ${C.fmt(m.total).padStart(8)}\n`);
  if (table) { fs.rmSync(base, { recursive: true, force: true }); process.exit(0); }

  // ---------- Free up ----------
  const B = setup('free');
  const kept = B.list.filter((f) => ['work', 'backups', 'safety', 'other', 'profile'].includes(f.part) || f.part == null).map((f) => [B.pathOf(f), sha(B.pathOf(f))]);
  for (const id of ['work', 'backups', 'safety', 'profile', 'other']) {
    const r = await M.free(id);
    check(!r.ok && /never frees/i.test(r.why), `Free up ${id}: refused in plain words`, r.why);
  }
  B.setPlaying(true);
  for (const id of ['play', 'optimized', 'gameshaders']) { const r = await M.free(id); check(!r.ok && /game is playing/.test(r.why), `Free up ${id} while a game plays: after it ends`); }
  B.setPlaying(false);
  const before = await M.measure({ fresh: true });
  let freedAll = 0;
  for (const id of C.FREEABLE) {
    const r = await M.free(id);
    const after = await M.measure({ fresh: true });
    freedAll += r.freed;
    const left = after.parts[id];
    // leftovers: a render still writing its frames and a fresh temp folder stay
    const leftOk = id === 'leftovers' ? left === 20 * MB + 10 * MB : left === 0;
    check(r.ok && leftOk, `Free up ${C.BY[id].label}: ${C.fmt(r.freed)} freed${id === 'leftovers' ? ' (what is still being written stays)' : ''} · ${r.back}`, { r, left });
  }
  check(B.calls.includes('cache:Partitions/hearth-game') && B.calls.includes('cache:default') && B.calls.includes('cache:Partitions/miro') && !B.calls.some((c) => /miro/.test(c) && /hearth-game/.test(c)), 'live caches emptied through Electron (the game\'s, the default one, each partition)', B.calls);
  const touched = kept.filter(([p, h]) => sha(p) !== h).map(([p]) => path.relative(B.dir, p));
  check(!touched.length, `the owner's work, backups, safety copies, sign-ins and others' temp files: all ${kept.length} files untouched`, touched);
  const inTrash = fs.readdirSync(B.trashDir);
  check(inTrash.length > 0 && inTrash.some((n) => /clink-?$|clink$/.test(n) || /-clink$/.test(n)) && inTrash.some((n) => n.endsWith('-b1.mp4')), `moved to the test Trash (${inTrash.length} items), nothing deleted`, inTrash.slice(0, 8));
  const idx = JSON.parse(fs.readFileSync(path.join(B.roots.data, 'kv', 'present-bakes.json'), 'utf8'));
  check(Array.isArray(idx) && idx.length === 0, 'the bakes list is emptied with them (Present bakes again)');
  check(!exists(path.join(B.roots.data, 'game-cache', 'index.json')), 'the optimize index went with its copies (a new cache next time)');
  const end = await M.measure({ fresh: true });
  check(end.total < before.total && Math.abs(before.total - end.total - freedAll) < MB, `everything freeable freed: ${C.fmt(before.total)} → ${C.fmt(end.total)}`);

  // an unreadable bakes list / optimize index: nothing moved
  const Bx = setup('free-held', { faults: new Set(['present-bakes']) });
  const rb = await M.free('bakes');
  check(!rb.ok && /couldn't be read/.test(rb.why) && fs.readdirSync(path.join(Bx.roots.data, 'captures', 'Present bakes')).length === 5, 'Free up bakes with its list unreadable: refused, every bake stays');
  fs.writeFileSync(path.join(Bx.roots.data, 'game-cache', 'index.json'), '{"v":1,"entr');
  fs.rmSync(path.join(Bx.roots.data, 'game-cache', 'index.prev.json'), { force: true });
  const ro = await M.free('optimized');
  check(!ro.ok && exists(path.join(Bx.roots.data, 'game-cache', 'files', 'k1.glb')), 'Free up optimized with a damaged index: refused, the copies stay');

  // ---------- the calm tidy ----------
  const T = setup('tidy');
  // two more builds than the cap allows, each 1 h+ old, of scenes that exist (none of the deleted ones)
  const ids = JSON.parse(fs.readFileSync(path.join(T.roots.data, 'kv', 'three-sketches.json'), 'utf8'));
  for (let i = 0; i < 7; i++) {
    ids.push({ id: `extra${i}` });
    const d = path.join(T.roots.data, 'game', `extra${i}`);
    fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'play.html'), 'x'); fs.writeFileSync(path.join(d, 'hearth-play.json'), '{}');
    const t = new Date(Date.now() - (10 + i) * DAY); fs.utimesSync(path.join(d, 'hearth-play.json'), t, t);
  }
  fs.writeFileSync(path.join(T.roots.data, 'kv', 'three-sketches.json'), JSON.stringify(ids));
  const keptT = T.list.filter((f) => ['work', 'backups', 'safety', 'other', 'profile'].includes(f.part) || f.part == null).map((f) => [T.pathOf(f), sha(T.pathOf(f))]);
  const r = await M.tidy();
  const g = (rel) => exists(path.join(T.roots.data, ...rel.split('/')));
  check(!g('game/old_demo') && !g('game/test_scene'), 'tidy: Play builds of deleted scenes → Trash');
  check(g('game/clink') && g('game/orbit') && g('game/neon_tunnel'), 'tidy: Play builds of scenes you have stay');
  const leftBuilds = fs.readdirSync(path.join(T.roots.data, 'game'));
  check(leftBuilds.length === 8 && !leftBuilds.includes('extra6') && !leftBuilds.includes('extra5'), `tidy: the Play builds cap (8): the oldest went (${leftBuilds.length} left)`, leftBuilds);
  check(!g('captures/Present bakes/b4.mp4') && !g('captures/Present bakes/b9.mp4') && g('captures/Present bakes/b1.mp4') && g('captures/Present bakes/b3.mp4'), 'tidy: the bake of a deleted scene and a stray bake → Trash; the others stay');
  const idxT = JSON.parse(fs.readFileSync(path.join(T.roots.data, 'kv', 'present-bakes.json'), 'utf8'));
  check(idxT.map((e) => e.key).join() === 'b1,b2,b3', 'tidy: the bakes list follows');
  check(!g('game-cache/files/k3.glb.part.glb') && g('game-cache/files/k1.glb'), 'tidy: a killed Optimize\'s copy → Trash; indexed ones stay');
  check(!g('renders/.hearth-titles-xp1a2b') && g('renders/.hearth-titles-xp9z'), 'tidy: an ended render\'s title frames → Trash; one still writing stays');
  check(!exists(path.join(T.roots.tmp, 'hub-zip-abc')) && !exists(path.join(T.roots.tmp, 'hearth-report-123-x.md')) && exists(path.join(T.roots.tmp, 'hearth-backup-fresh')) && exists(path.join(T.roots.tmp, 'someone-elses-temp')), 'tidy: old Hearth temp folders → Trash; fresh ones and other programs\' stay');
  check(g('.cache/asset-thumbs/t0.webp') && g('.cache/asset-previews/p.jpg'), 'tidy: asset pictures under their cap stay');
  check(/^Tidied .* — to the Trash$/.test(r.line), `tidy: one quiet line: ${r.line}`);
  const touchedT = keptT.filter(([p, h]) => sha(p) !== h).map(([p]) => path.relative(T.dir, p));
  check(!touchedT.length, `tidy: all ${keptT.length} files of the owner's work, backups and safety copies untouched`, touchedT);
  const r2 = await M.tidy();
  check(!r2.moved.length && r2.line === '', 'tidy again: nothing more (calm)');

  // the thumbs cap: 1 GB of pictures, the oldest go
  fs.writeFileSync(path.join(T.roots.data, '.cache', 'asset-previews', 'huge.jpg'), ''); fs.truncateSync(path.join(T.roots.data, '.cache', 'asset-previews', 'huge.jpg'), Math.round(1.05 * GB));
  await M.tidy();
  check(!g('.cache/asset-previews/p.jpg') && g('.cache/asset-previews/huge.jpg'), 'tidy: the asset pictures cap (1 GB): the oldest first, the newest stays');

  // scenes unreadable: no build or bake rule runs
  const U = setup('tidy-held', { faults: new Set(['three-sketches']) });
  await M.tidy();
  check(exists(path.join(U.roots.data, 'game', 'old_demo')) && exists(path.join(U.roots.data, 'captures', 'Present bakes', 'b4.mp4')), 'tidy with the scenes store unreadable: no build or bake of a "deleted" scene moves');
  check(!exists(path.join(U.roots.data, 'captures', 'Present bakes', 'b9.mp4')), 'tidy with the scenes unreadable: a stray bake file (not in the list) still goes');
  const P = setup('tidy-playing');
  P.setPlaying(true);
  const rp = await M.tidy();
  check(rp.skipped && exists(path.join(P.roots.data, 'game', 'old_demo')), 'tidy while a game plays: waits', rp);

  fs.rmSync(base, { recursive: true, force: true });
  console.log(fails ? `\n${fails} failed` : '\nall passed');
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
