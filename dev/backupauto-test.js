#!/usr/bin/env node
// 💾 Automatic backups (round 45, backupauto): the pure parts (backupauto-core.js) and the main side
// (backupautomain.js) in Node, on throwaway folders (never a real Hearth data folder):
//   1. names: a backup's file name per computer, read back
//   2. the rotation: 7 daily, 4 weekly, 6 monthly + the newest 3, over 400 simulated days; failed ones go once a good one
//      is newer; another computer's backups are never touched; the newest before an update / a restore stays
//   3. when an automatic backup runs: off, asleep, rendering / recording / updating, battery below 40 %, not due, after a
//      failure, idle or not, late; the calm note after 3 days
//   4. where: Mac (iCloud Drive offered), Windows (OneDrive offered, case-insensitive checks), Linux; never inside the
//      data folder / the app / the sync folder
//   5. what goes in the zip and what goes once to the media store; counts and their words; the check's comparison
//   6. plain words for failures, per system
//   7. the main side on real files (zip / unzip): a backup, its check and card; the second backup skips unchanged big
//      media; the list with counts; a damaged zip reported; a backup whose check fails isn't kept; a full disk; the
//      rotation on a moving clock; the media store tidied; the state kept per computer and never written over while held
//   node dev/backupauto-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fails = 0; let n = 0;
const check = (ok, name, info) => { n += 1; console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined || ok ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info).slice(0, 400)}`}`); if (!ok) fails += 1; };
const C = require(path.join(ROOT, 'backupauto-core.js'));
const DAY = 864e5; const HOUR = 36e5; const MIN = 6e4;

// ---------- 1. names ----------
{
  const at = new Date(2026, 9, 15, 9, 30).getTime();
  const nm = C.fileName(at, 'Quentin’s MacBook Pro');
  check(nm === 'hearth-backup-2026-10-15-09-30-Quentins-MacBook-Pro.zip', 'a name per computer, local time', nm);
  const p = C.parseName(nm);
  check(p && p.at === at && p.computer === 'Quentins-MacBook-Pro', 'read back (time + computer)', p);
  check(C.parseName('hearth-backup-2026-10-15-09-30.zip')?.computer === '', 'an older backup (no computer) still reads');
  check(C.parseName('holiday.zip') === null, 'another zip is not a backup');
  check(C.slugOf('QUENT-PC') === 'QUENT-PC' && C.slugOf('') === 'computer', 'slugs');
}

// ---------- 2. rotation ----------
{
  // one automatic backup a day at 03:00 for 400 days, rotated every day (as the app does after each backup)
  const t0 = new Date(2025, 8, 1, 3, 0).getTime();
  let kept = [];
  for (let d = 0; d < 400; d++) {
    const at = t0 + d * DAY;
    kept.push({ name: `b${d}`, at, ok: true, mine: true, reason: 'auto' });
    const r = C.rotate(kept, at);
    kept = kept.filter((b) => r.keep.includes(b.name));
  }
  const last = t0 + 399 * DAY;
  const days = new Set(kept.map((b) => C.dayKey(b.at)));
  check(kept.length <= 3 + 7 + 4 + 6 && kept.length >= 12, `after 400 days: ${kept.length} kept (≤ 20)`, kept.map((b) => b.name));
  const last7 = [...Array(7)].map((_, i) => C.dayKey(last - i * DAY));
  check(last7.every((k) => days.has(k)), 'one for each of the last 7 days');
  const weeks = new Set(kept.map((b) => C.weekKey(b.at)));
  check([0, 1, 2, 3].every((i) => weeks.has(C.weekKey(last - i * 7 * DAY))), 'one for each of the last 4 weeks');
  const months = new Set(kept.map((b) => C.monthKey(b.at)));
  const m6 = [...Array(6)].map((_, i) => { const d = new Date(last); return `${new Date(d.getFullYear(), d.getMonth() - i, 1).getFullYear()}-${new Date(d.getFullYear(), d.getMonth() - i, 1).getMonth()}`; });
  check(m6.every((k) => months.has(k)), 'one for each of the last 6 months', { m6, months: [...months] });
  check(!kept.some((b) => b.at < last - 200 * DAY), 'nothing older than ~6 months stays');
  // failed, another computer's, before an update
  const now = t0;
  const items = [
    { name: 'good-new', at: now - HOUR, ok: true, mine: true, reason: 'auto' },
    { name: 'failed-old', at: now - 2 * HOUR, ok: false, mine: true, reason: 'auto' },
    { name: 'pc', at: now - 400 * DAY, ok: true, mine: false, reason: 'auto' },
    ...[...Array(12)].map((_, i) => ({ name: `same-day-${i}`, at: now - 3 * HOUR - i * MIN, ok: true, mine: true, reason: 'manual' })),
    { name: 'upd', at: now - 90 * DAY - 5 * HOUR, ok: true, mine: true, reason: 'update' },
  ];
  const r = C.rotate(items, now);
  check(r.drop.includes('failed-old'), 'a failed backup goes once a good one is newer');
  check(!r.drop.includes('pc') && !r.keep.includes('pc'), 'another computer\'s backups are never touched');
  check(r.keep.includes('good-new') && r.keep.includes('upd'), 'the newest, and the newest made before an update, stay', r);
  check(r.drop.filter((x) => x.startsWith('same-day-')).length >= 9, 'many backups on one day: the extra ones go', r.drop);
  const r2 = C.rotate([{ name: 'ok1', at: now - DAY, ok: true, mine: true }, { name: 'bad-latest', at: now, ok: false, mine: true }], now);
  check(r2.keep.includes('bad-latest') && r2.keep.includes('ok1'), 'the latest attempt failed: kept (shown) until a good one follows');
  const r3 = C.rotate([{ name: 'old-unchecked', at: now - DAY, mine: true }, { name: 'x', at: now, ok: true, mine: true }], now);
  check(r3.keep.includes('old-unchecked'), 'an older backup that was never checked counts as one');
}

// ---------- 3. when ----------
{
  const now = 1e12;
  const base = { now, idleMs: 10 * MIN, hidden: false, holds: [], battery: false, level: null, asleep: false, running: false };
  const st = { auto: true, lastOk: now - 25 * HOUR, lastTry: now - 25 * HOUR, failures: 0 };
  const D = (s, e) => C.decide({ ...st, ...s }, { ...base, ...e });
  check(D({}, {}).go, 'due, idle, plugged in: goes');
  check(D({ auto: false }, {}).why === 'off', 'off on this computer: no');
  check(D({}, { asleep: true }).why === 'asleep', 'asleep: no');
  check(D({}, { running: true }).why === 'running', 'one at a time');
  for (const h of ['render', 'export', 'formats', 'record', 'present', 'update']) check(D({}, { holds: [h] }).why === `busy:${h}`, `never while ${h}`);
  check(D({}, { holds: ['agent', 'download'] }).go, 'an AI working or a download: still fine');
  check(D({}, { battery: true, level: 0.39 }).why === 'battery', 'on battery below 40 %: no');
  check(D({}, { battery: true, level: null }).why === 'battery', 'on battery, level unknown: no');
  check(D({}, { battery: true, level: 0.8 }).go, 'on battery above 40 %: goes');
  check(D({ lastOk: now - 3 * HOUR }, {}).why === 'not due', 'a backup 3 h ago: not due');
  check(D({ lastOk: now - 21 * HOUR }, {}).go, '21 h ago: due (once a day with slack)');
  check(D({}, { idleMs: 30e3 }).why === 'not idle', 'in use (30 s idle): waits');
  check(D({}, { idleMs: 70e3, hidden: true }).go, 'Hearth hidden and 1 min idle: goes');
  check(D({ lastOk: now - 3 * DAY }, { idleMs: 35e3 }).go, 'late (3 days): 30 s idle is enough');
  check(D({ lastOk: 0 }, { idleMs: 35e3 }).go, 'never backed up: soon');
  check(D({ failures: 1, lastTry: now - 10 * MIN }, {}).why === 'retry later', 'after a failure: waits 30 min');
  check(D({ failures: 1, lastTry: now - 31 * MIN }, {}).go, '…then tries again');
  check(D({ failures: 9, lastTry: now - 5 * HOUR }, {}).why === 'retry later' && D({ failures: 9, lastTry: now - 6.1 * HOUR }, {}).go, 'many failures: every 6 h at most');
  check(!C.stale({ lastOk: now - 2 * DAY }, now) && C.stale({ lastOk: now - 3 * DAY }, now), 'the calm note after 3 days without a good backup');
  check(!C.stale({ lastOk: 0, since: now - DAY }, now) && C.stale({ lastOk: 0, since: now - 4 * DAY }, now), 'never one: counted from when backups started here');
  check(!C.stale({ auto: false, lastOk: 0, since: 0 }, now), 'off: no note');
  check(C.freshEnough({ lastOk: now - 20 * HOUR }, 'update', now) && !C.freshEnough({ lastOk: now - 25 * HOUR }, 'update', now), 'before an update: skipped when one is < 1 day old (the nightly one counts)');
  check(!C.freshEnough({ lastOk: now - 30 * MIN }, 'restore', now), 'before a restore: a fresh one (10 min)');
}

// ---------- 4. where ----------
{
  const S = require(path.join(ROOT, 'sync-merge.js'));
  const fakeIo = (platform, home, have, env = {}) => ({ platform, home, env, exists: (p) => have.includes(p), readdir: (p) => (p.endsWith('CloudStorage') ? have.filter((h) => h.startsWith(p)).map((h) => h.slice(p.length + 1)) : []), readJson: () => { throw new Error('none'); } });
  // Mac with iCloud Drive
  const macHome = '/Users/quent';
  const macDrives = S.detectClouds(fakeIo('darwin', macHome, [`${macHome}/Library/Mobile Documents/com~apple~CloudDocs`]));
  const mac = C.places({ platform: 'darwin', home: macHome, drives: macDrives });
  check(mac.def.dir === '/Users/quent/Documents/Hearth backups', 'Mac: Documents/Hearth backups by default', mac.def);
  check(mac.offers[0]?.id === 'icloud' && mac.offers[0].dir === '/Users/quent/Library/Mobile Documents/com~apple~CloudDocs/Hearth backups' && /iCloud Drive/.test(mac.offers[0].why) && /Mac breaks/.test(mac.offers[0].why), 'Mac: iCloud Drive offered with a plain why', mac.offers);
  check(C.places({ platform: 'darwin', home: macHome, drives: [] }).offers.length === 0, 'Mac without iCloud Drive: nothing offered');
  // Windows with OneDrive (and Documents moved by OneDrive's folder backup)
  const winHome = 'C:\\Users\\quent';
  const winDrives = S.detectClouds(fakeIo('win32', winHome, ['C:\\Users\\quent\\OneDrive'], { USERPROFILE: winHome, OneDrive: 'C:\\Users\\quent\\OneDrive' }));
  const win = C.places({ platform: 'win32', home: winHome, documents: 'C:\\Users\\quent\\OneDrive\\Documents', drives: winDrives });
  check(win.def.dir === 'C:\\Users\\quent\\OneDrive\\Documents\\Hearth backups', 'Windows: the real Documents folder (moved into OneDrive) is used', win.def);
  check(win.offers[0]?.id === 'onedrive' && win.offers[0].dir === 'C:\\Users\\quent\\OneDrive\\Hearth backups', 'Windows: OneDrive offered', win.offers);
  const lin = C.places({ platform: 'linux', home: '/home/q', drives: [] });
  check(lin.def.dir === '/home/q/Documents/Hearth backups', 'Linux: Documents/Hearth backups');
  // never inside
  const winCtx = { platform: 'win32', dataDir: 'C:\\Hearth\\data', appDir: 'C:\\Hearth', syncDir: 'C:\\Users\\quent\\OneDrive\\Hearth' };
  check(!C.checkDir('c:/hearth/DATA/backups', winCtx).ok, 'Windows: inside the data folder refused (other case, other slashes)');
  check(!C.checkDir('C:\\Users\\quent\\OneDrive\\Hearth\\b', winCtx).ok && /sync folder/.test(C.checkDir('C:\\Users\\quent\\OneDrive\\Hearth', winCtx).why), 'inside the sync folder refused, said why');
  check(C.checkDir('C:\\Users\\quent\\OneDrive\\Hearth backups', winCtx).ok, 'next to the sync folder ("Hearth backups"): fine');
  check(!C.checkDir('C:\\Hearth\\backups', winCtx).ok, 'inside the app\'s folder refused');
  const macCtx = { platform: 'darwin', dataDir: '/Users/quent/hearth/data', appDir: '/Users/quent/hearth', syncDir: '/Users/quent/Library/Mobile Documents/com~apple~CloudDocs/Hearth' };
  check(C.checkDir(mac.offers[0].dir, macCtx).ok && C.checkDir(mac.def.dir, macCtx).ok, 'Mac: Documents and iCloud Drive/Hearth backups are fine');
  check(!C.checkDir('/Users/quent/hearth/data/x', macCtx).ok && !C.checkDir('/Users/quent/hearth/data', macCtx).ok, 'Mac: inside / the data folder refused');
  check(C.checkDir('/Users/quent/hearth-data-backups', macCtx).ok, 'a name that only starts the same is fine');
  check(!C.checkDir('relative/dir', macCtx).ok, 'a relative path is refused');
  check(C.placeLabel(mac.offers[0].dir, { platform: 'darwin', home: macHome, drives: macDrives }) === 'iCloud Drive › Hearth backups', 'words for the place (iCloud)');
  check(C.placeLabel('C:\\Users\\quent\\OneDrive\\Documents\\Hearth backups', { platform: 'win32', home: winHome, documents: 'C:\\Users\\quent\\OneDrive\\Documents', drives: winDrives }) === 'Documents › Hearth backups', 'words for the place (Windows Documents)');
}

// ---------- 5. what goes where, counts, the check ----------
{
  const files = [
    { rel: 'data/kv/three-sketches.json', size: 30 * 1048576, mtime: 1 },
    { rel: 'data/chats/a.json', size: 50 * 1048576, mtime: 1 },
    { rel: 'data/captures/rec.mp4', size: 400 * 1048576, mtime: 5 },
    { rel: 'data/attachments/pic.png', size: 2 * 1048576, mtime: 1 },
    { rel: 'config.json', size: 9000, mtime: 1 },
  ];
  const a = C.split(files);
  check(a.zip.includes('data/kv/three-sketches.json') && a.zip.includes('data/chats/a.json') && a.zip.includes('config.json'), 'scenes / chats / settings always in the zip, however big');
  check(a.media.length === 1 && a.media[0].rel === 'data/captures/rec.mp4' && a.copy.length === 1, 'big media goes to the media store');
  const b = C.split(files, new Set([a.media[0].key]));
  check(b.copy.length === 0 && b.copyBytes === 0 && b.media.length === 1, 'unchanged big media: skipped the next time');
  const c = C.split(files.map((f) => (f.rel.endsWith('.mp4') ? { ...f, mtime: 6 } : f)), new Set([a.media[0].key]));
  check(c.copy.length === 1, 'changed big media: copied again');
  const read = (rel) => ({ 'data/kv/three-sketches.json': [{ id: 'a' }, { id: 'b' }], 'data/memory.json': { shared: 'x\ny', agents: { c: 'z' } }, 'config.json': { agents: [{}, {}, {}] }, 'data/kv/notes.json': [1] })[rel];
  const list = (d) => ({ 'data/chats': ['a.json', 'b.json', 'a.prev.json'], 'data/kv': ['three-sketches.json', 'notes.json'], 'data/attachments': ['p.png'] })[d] || [];
  const counts = C.countsOf({ read, list });
  check(counts.scenes === 2 && counts.chats === 2 && counts.memory === 3 && counts.agents === 3 && counts.notes === 1 && counts.kv === 2 && counts.attachments === 1, 'counts', counts);
  check(C.summary(counts) === '2 scenes · 2 chats · 3 memory lines · 3 AIs · 1 note · settings', 'in words', C.summary(counts));
  check(C.summary({ scenes: 1, chats: 1, agents: 1 }) === '1 scene · 1 chat · 1 AI · settings', 'singulars');
  const man = { counts: { scenes: 2, chats: 2, agents: 3 }, files: 10 };
  check(C.compare(man, { counts, files: 10, bad: [], media: { missing: [] } }).ok, 'the check: all there');
  const bad = C.compare(man, { counts: { ...counts, scenes: 1 }, files: 9, bad: ['data/kv/notes.json'], media: { missing: ['data/captures/rec.mp4'] } });
  check(!bad.ok && bad.problems.some((p) => /notes\.json is damaged/.test(p)) && bad.problems.some((p) => /2 scenes but holds 1/.test(p)) && bad.problems.some((p) => /1 of 10 files/.test(p)) && bad.problems.some((p) => /rec\.mp4/.test(p)), 'the check: damaged, missing, wrong counts, media', bad.problems);
  check(!C.compare(null, {}).ok, 'no list of contents: not good');
}

// ---------- 6. plain words ----------
{
  const w = (e, p) => C.explain(e, p);
  check(/Controlled folder access/.test(w({ code: 'EPERM' }, 'win32').why) && w({ code: 'EPERM' }, 'win32').fix === 'permission', 'Windows: no permission → Controlled folder access');
  check(/Privacy & Security/.test(w({ code: 'EACCES' }, 'darwin').why), 'Mac: no permission → Privacy & Security');
  check(/enough room/.test(w({ code: 'ENOSPC', free: 5 * 1048576, need: 200 * 1048576 }).why) && /5 MB free, about 200 MB needed/.test(w({ code: 'ENOSPC', free: 5 * 1048576, need: 200 * 1048576 }).why), 'a full disk, with numbers');
  check(/isn't there any more/.test(w({ code: 'ENOENT' }).why) && w({ code: 'ENOENT' }).fix === 'folder', 'the folder is gone (a disk unplugged)');
  check(/tar\.exe/.test(w({ code: 'ENOENT', syscall: 'spawn tar' }, 'win32').why), 'the zip tool missing (Windows)');
  check(/checking it found a problem: x is damaged/.test(w({ verify: ['x is damaged'] }).why), 'a failed check');
  check(/held a file/.test(w({ code: 'EBUSY' }).why), 'held by another program');
  check(/Something went wrong: boom/.test(w(new Error('boom')).why), 'anything else, said as it is');
  check(C.ago(Date.now() - 2 * HOUR) === '2 h ago' && C.ago(0) === 'never' && C.ago(Date.now() - 1.2 * DAY) === 'yesterday', 'ago');
}

// ---------- 7. the main side on real files ----------
(async () => {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'backupauto-test-'));
  process.env.HEARTH_TEST_SAVE_DIR = path.join(T, 'saves');
  delete process.env.HEARTH_TEST_OPEN;
  fs.mkdirSync(process.env.HEARTH_TEST_SAVE_DIR, { recursive: true });
  const app = path.join(T, 'app'); const data = path.join(app, 'data');
  const w = (rel, v) => { const f = path.join(data, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof v === 'string' || Buffer.isBuffer(v) ? v : JSON.stringify(v)); };
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'config.json'), JSON.stringify({ agents: [{ id: 'claude' }, { id: 'astra' }], settings: {} }));
  fs.writeFileSync(path.join(app, 'theme.css'), ':root{}');
  w('kv/three-sketches.json', [{ id: 's1', name: 'One' }, { id: 's2', name: 'Two' }, { id: 's3', name: 'Three' }]);
  w('kv/notes.json', [{ id: 'n1' }]);
  w('chats/c1.json', { id: 'c1', messages: [] }); w('chats/c2.json', { id: 'c2', messages: [] });
  w('memory.json', { shared: 'likes teal', agents: {} });
  w('workspace/huge.bin', Buffer.alloc(1024)); // the chats' workspace: never in backups (as before)
  w('sync/state.json', {});
  const big = Buffer.alloc(21 * 1048576, 7);
  w('captures/take.mp4', big);
  const BA = require(path.join(ROOT, 'backupautomain.js'));
  // (windows hourly 14) this computer's platform, not 'linux': on Windows a linux run joined the paths with / and checkDir refused them
  BA._test.set({ dataDir: data, configPath: path.join(app, 'config.json'), themePath: path.join(app, 'theme.css'), appDir: app, platform: process.platform, home: path.join(T, 'home'), getWin: () => null });
  const ipc = { handle: () => {} };
  BA.register(ipc, { dataDir: data, configPath: path.join(app, 'config.json'), themePath: path.join(app, 'theme.css'), appDir: app, getWin: () => null });
  try {
    const dir = BA.dir();
    check(dir === path.join(process.env.HEARTH_TEST_SAVE_DIR, 'Documents', 'Hearth backups'), 'a test run backs up into its own Documents (never the real one)', dir);
    check(fs.existsSync(path.join(data, '.backup', 'state.json')), 'this computer\'s state: data/.backup (hidden: never synced)');
    const r1 = await BA.run('auto');
    check(r1.ok && fs.existsSync(r1.path) && /hearth-backup-\d{4}-\d\d-\d\d-\d\d-\d\d-/.test(r1.name), 'a backup is written', r1);
    check(r1.counts.scenes === 3 && r1.counts.chats === 2 && r1.counts.agents === 2 && r1.counts.memory === 1 && r1.counts.media === 1, 'with its counts', r1.counts);
    const card = JSON.parse(fs.readFileSync(path.join(dir, '.hearth', `${r1.name}.json`), 'utf8'));
    check(card.ok === true && card.reason === 'auto' && card.machine?.platform === process.platform && card.media.length === 1, 'its card: checked, why, which computer, the big file', card);
    const mediaFiles = fs.readdirSync(path.join(dir, '.hearth', 'media'));
    check(mediaFiles.length === 1 && fs.statSync(path.join(dir, '.hearth', 'media', mediaFiles[0])).size === big.length, 'the big video went once to the media store');
    check(fs.statSync(r1.path).size < 2 * 1048576, 'the zip itself stays small (no big media in it)', fs.statSync(r1.path).size);
    const v = await BA.verify(r1.path);
    check(v.ok && v.counts.scenes === 3, 'checking it again: good', v);
    const zl = require('child_process').execFileSync('unzip', ['-Z1', r1.path]).toString();
    check(!/workspace\//.test(zl) && !/data\/sync\//.test(zl) && !/\.backup\//.test(zl) && /hearth-backup\.json/.test(zl) && /config\.json/.test(zl), 'workspace / sync / its own state left out; config + list of contents in');
    // second backup a day later: the media isn't copied again
    const mt = fs.statSync(path.join(dir, '.hearth', 'media', mediaFiles[0])).mtimeMs;
    await BA._test.testHook({ clock: DAY });
    const r2 = await BA.run('auto');
    check(r2.ok && fs.statSync(path.join(dir, '.hearth', 'media', mediaFiles[0])).mtimeMs === mt && fs.readdirSync(path.join(dir, '.hearth', 'media')).length === 1, 'the next backup skips the unchanged big video');
    // the list
    const L = await BA.list();
    check(L.items.length === 2 && L.items.every((b) => b.ok === true && b.mine && b.counts?.scenes === 3), 'the list: both, checked, with counts', L.items);
    // a damaged zip is reported
    BA._test.testHook({ corrupt: r1.path });
    const v2 = await BA.verify(r1.path);
    check(!v2.ok && v2.problems.length > 0, 'a damaged zip: the check says so', v2);
    // a backup whose check fails is not kept, and says why
    await BA._test.testHook({ corruptNext: true, clock: 2 * DAY });
    const r3 = await BA.run('auto');
    check(!r3.ok && r3.code === 'VERIFY' && /checking it found a problem/.test(r3.why) && !fs.readdirSync(dir).includes(C.fileName(Date.now() + 2 * DAY, require('os').hostname())), 'a backup that fails its check: not kept, said plainly', r3);
    check(BA.state().failures === 1 && BA.state().last.ok === false, 'the failure is remembered (Retry)');
    await BA._test.testHook({ failNext: { code: 'ENOSPC' } });
    const r4 = await BA.run('manual');
    check(!r4.ok && r4.fix === 'space' && /enough room/.test(r4.why), 'a full disk: plain words');
    // a folder chosen on a disk that's gone: never made again on this disk
    const gone = path.join(T, 'unplugged', 'Hearth backups');
    const sd = await (async () => { const C2 = BA; const s = await C2._test.testHook({ state: { dir: gone } }); return s; })();
    const r5 = await BA.run('manual');
    check(!r5.ok && r5.fix === 'folder' && !fs.existsSync(path.join(T, 'unplugged')), 'the chosen folder\'s disk is gone: nothing made, said why', r5);
    await BA._test.testHook({ state: { dir: null } });
    check(Boolean(sd), '(state patched)');
    // the rotation on a moving clock: 60 days of backups
    for (let d = 3; d < 60; d++) { await BA._test.testHook({ clock: d * DAY }); const r = await BA.run('auto'); if (!r.ok) { check(false, `day ${d}`, r); break; } }
    const L2 = await BA.list();
    check(L2.items.length <= 3 + 7 + 4 + 6 && L2.items.length >= 10, `rotation: ${L2.items.length} backups kept of 60`, L2.items.map((b) => b.name));
    const cards = fs.readdirSync(path.join(dir, '.hearth')).filter((x) => x.endsWith('.zip.json'));
    check(cards.length === L2.items.length, 'their cards go with them');
    check(fs.readdirSync(path.join(dir, '.hearth', 'media')).length === 1, 'the media store keeps what a backup points at');
    // big media gone from every backup → tidied
    fs.rmSync(path.join(data, 'captures', 'take.mp4'));
    for (let d = 60; d < 260; d += 7) { await BA._test.testHook({ clock: d * DAY }); await BA.run('auto'); }
    check(fs.readdirSync(path.join(dir, '.hearth', 'media')).length === 0, 'a big file no backup points at any more is tidied away');
    // media back on a restore
    w('captures/take2.mp4', big);
    await BA._test.testHook({ clock: 300 * DAY });
    const r6 = await BA.run('auto');
    fs.rmSync(path.join(data, 'captures', 'take2.mp4'));
    const dry = await BA.restoreMedia(r6.path, { dryRun: true });
    check(dry.add === 1 && !fs.existsSync(path.join(data, 'captures', 'take2.mp4')), 'restore (looking): the missing big file would come back');
    await BA.restoreMedia(r6.path, { dryRun: false });
    check(fs.existsSync(path.join(data, 'captures', 'take2.mp4')) && fs.statSync(path.join(data, 'captures', 'take2.mp4')).size === big.length, 'restore: it is back');
    // an older zip (no card): looked into once
    const legacy = path.join(dir, 'hearth-backup-2020-01-01-10-00.zip');
    // (windows hourly 14) Windows has no zip command: its tar.exe makes the zip (-a: the format from the .zip name)
    // (System32's own: Git's GNU tar can come first on the PATH, and it makes no zips)
    if (process.platform === 'win32') require('child_process').execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-a', '-cf', legacy, 'data/kv/three-sketches.json', 'data/chats', 'config.json'], { cwd: app, windowsHide: true });
    else require('child_process').execFileSync('zip', ['-qr', legacy, 'data/kv/three-sketches.json', 'data/chats', 'config.json'], { cwd: app });
    const ins = await BA.inspect(legacy);
    check(ins.legacy && ins.counts.scenes === 3 && ins.counts.chats === 2 && ins.counts.agents === 2, 'an older backup: what\'s inside, read once', ins);
    const z = await BA.recoverZips(8);
    check(z.length >= 2 && z.every((x) => fs.existsSync(x.f)), 'Recover gets the backups (newest first, damaged ones left out)');
    // before an update: skipped when fresh
    await BA._test.testHook({ before: true });
    const b1 = await BA.before('update');
    check(b1.skipped === 'fresh', 'before an update: skipped when a good one is fresh', b1);
    // datasafe rules: a state file that can't be read is never written over
    const sf = path.join(data, '.backup', 'state.json');
    const prevF = path.join(data, '.backup', 'state.prev.json');
    fs.rmSync(prevF, { force: true });
    fs.rmSync(sf); fs.mkdirSync(sf); // a "file" that can't be read (EISDIR), no .prev
    BA._test.set({});
    BA.state();
    await BA._test.testHook({ state: { auto: false } });
    check(fs.statSync(sf).isDirectory(), 'its state held: never written over');
    fs.rmdirSync(sf);
    fs.writeFileSync(sf, JSON.stringify({ v: 1, auto: true, dir: null, since: 1, lastOk: 5, lastTry: 5, failures: 0, history: [] }));
    BA._test.set({});
    check(BA.state().lastOk === 5, 'read again once it can be');
  } catch (err) {
    check(false, 'no error', String(err?.stack || err));
  } finally {
    fs.rmSync(T, { recursive: true, force: true });
  }
  console.log(`\n${n - fails}/${n} passed`);
  process.exit(fails ? 1 : 0);
})();
