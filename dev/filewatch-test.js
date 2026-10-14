#!/usr/bin/env node
// Files changed outside Hearth (round 42, filewatch): the rules (filewatch-core.js) on a simulated Mac (path.posix,
// /Users/quent, FSEvents) and Windows PC (path.win32, C:\Users\quent, ReadDirectoryChangesW), Linux's fallback, the
// coalescer on a fake clock, then the main-side service (filewatchmain.js) on real temp folders: a change, editors' swap
// files, a safe save, a burst of 200 writes, a rename, a delete, Hearth's own writes, sync's tree, a folder gone and back,
// a watch that fails (slow check), a wake, and nothing running while idle.
//   node dev/filewatch-test.js
process.env.HEARTH_TEST_SAVE_DIR ||= require('os').tmpdir(); // (filewatchmain's test hooks)
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../filewatch-core');

let pass = 0; let fail = 0;
const check = (ok, name, info) => { if (ok) pass += 1; else { fail += 1; console.log(`✖ ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- names that are never news ----------
const IGN = ['.DS_Store', '._logo.png', '~$report.docx', '.notes.md.swp', '.notes.md.swo', 'notes.md~', '.#notes.md', '#notes.md#', '4913', 'movie.mp4.crdownload', 'song.wav.part', 'a.download', 'x.tmp', 'Photoshop Temp12345', '~PST1234.tmp', 'logo.png.sb-1a2b3c4d-AbCdEf', '.logo.png.icloud', 'Thumbs.db', 'desktop.ini', 'a.js___jb_tmp___', '.goutputstream-ABC123', '.~lock.sheet.ods#', 'cfg.json.hubtmp', '.hearth-part-3', 'node_modules/x/index.js', '.git/index', 'proj/.git/HEAD', 'Photoshop Temp99/thing.psd', '$RECYCLE.BIN/x', '.Trash/a.png', 'x.crswap', 'clip.mov.tmp.drivedownload'];
const KEEP = ['logo.png', 'song.wav', 'notes.md', 'report.docx', 'My Photoshop.psd', 'a~b.txt', 'swap.txt', 'shader.frag', 'scene.json', 'Icon.png', 'tmp/real.png', 'temp.txt', 'part.wav', 'download.png', 'Music/Track 01.mp3', 'clip.mov'];
for (const n of IGN) check(C.ignored(n), `ignored: ${n}`);
for (const n of KEEP) check(!C.ignored(n), `kept: ${n}`);
check(C.icloudOf('.logo.png.icloud') === 'logo.png' && C.icloudOf('logo.png') === null, 'iCloud placeholder → its file');

// ---------- per computer ----------
const MAC = { platform: 'darwin', P: path.posix, home: '/Users/quent' };
const WIN = { platform: 'win32', P: path.win32, home: 'C:\\Users\\quent' };
const LIN = { platform: 'linux', P: path.posix, home: '/home/quent' };
check(C.options('darwin').recursive === true && C.options('win32').recursive === true && C.options('darwin').persistent === false, 'Mac / Windows: one recursive watch, never keeps Hearth running', C.options('darwin'));
check(C.options('darwin', false).recursive === false, 'a folder alone: not recursive');
check(C.nativeRecursive('darwin') && C.nativeRecursive('win32') && !C.nativeRecursive('linux'), 'native recursive only on the Mac and Windows');
for (const [ctx, dir] of [[MAC, '/'], [MAC, '/Users/quent'], [MAC, '/Users'], [MAC, '/Volumes/USB'], [MAC, '/Volumes'], [WIN, 'C:\\'], [WIN, 'D:\\'], [WIN, 'c:\\users\\QUENT'], [WIN, 'C:\\Users'], [LIN, '/home/quent'], [LIN, '/media/quent/USB']]) check(C.huge(dir, ctx), `never recursive: ${dir}`);
for (const [ctx, dir] of [[MAC, '/Users/quent/Projects'], [MAC, '/Volumes/USB/clips'], [WIN, 'C:\\Users\\quent\\Projects'], [WIN, 'D:\\Work'], [LIN, '/home/quent/site']]) check(!C.huge(dir, ctx), `recursive ok: ${dir}`);
check(C.volumeOf('/Volumes/USB/clips/a.mp4', MAC) === '/Volumes/USB' && C.volumeOf('/Users/quent/a.mp4', MAC) === null, 'Mac: the disk a file is on (/Volumes/X)');
check(C.volumeOf('D:\\clips\\a.mp4', WIN) === 'D:\\' && C.volumeOf('C:\\Users\\quent\\a.mp4', WIN) === null && C.volumeOf('\\\\nas\\share\\a.mp4', WIN) === '\\\\nas\\share\\', 'Windows: another drive / a share is a disk that can be out', C.volumeOf('\\\\nas\\share\\a.mp4', WIN));
check(C.inside('C:\\users\\QUENT\\proj\\a.png', 'c:\\Users\\quent\\Proj', WIN.P, 'win32') && !C.inside('/Users/quent/Proj/a.png', '/Users/quent/proj', MAC.P, 'darwin'), 'Windows ignores case, the Mac compares as written');
check(!C.inside('/Users/quent/projects2/a', '/Users/quent/projects', MAC.P, 'darwin'), 'a sibling with a longer name is not inside');

// ---------- the plan ----------
{
  const wants = [
    { path: '/Users/quent/Projects/site', kind: 'folder' },
    { path: '/Users/quent/Projects/site/assets', kind: 'folder' },
    { path: '/Users/quent/Projects/site/img/logo.png', kind: 'file' },
    { path: '/Users/quent/Music/song.wav', kind: 'file' },
    { path: '/Users/quent/Music/other.wav', kind: 'file' },
    { path: '/Users/quent', kind: 'folder' },
    { path: '/Users/quent/Docs', kind: 'folder', presence: true, deep: false },
  ];
  const r = C.plan(wants, MAC);
  const by = Object.fromEntries(r.map((x) => [x.dir, x.recursive]));
  check(by['/Users/quent/Projects/site'] === true, 'Mac: a project folder is one recursive watch', r);
  check(!('/Users/quent/Projects/site/assets' in by) && !('/Users/quent/Projects/site/img' in by), 'Mac: what is inside it needs no watch of its own', r);
  check(by['/Users/quent/Music'] === false && r.filter((x) => x.dir === '/Users/quent/Music').length === 1, 'Mac: two songs in Music = one watch of the folder (never one per file)', r);
  check(by['/Users/quent'] === false, 'Mac: the home folder is never watched recursively', r);
  check(by['/Users/quent/Docs'] === false, 'a presence-only folder: the folder alone', r);
  const again = C.plan(wants.slice().reverse(), MAC);
  check(C.planSig(again, 'darwin') === C.planSig(r, 'darwin'), 'the plan does not depend on the order of the wants');
}
{
  const r = C.plan([{ path: 'C:\\Users\\quent\\Projects\\Site', kind: 'folder' }, { path: 'c:\\users\\quent\\projects\\site\\logo.png', kind: 'file' }, { path: 'D:\\Clips\\a.mp4', kind: 'file' }, { path: 'D:\\', kind: 'folder' }], WIN);
  check(r.length === 3 && r.find((x) => /site$/i.test(x.dir))?.recursive === true, 'Windows: the project folder recursive, its file covered whatever the case', r);
  check(r.find((x) => x.dir === 'D:\\')?.recursive === false && r.find((x) => x.dir === 'D:\\Clips')?.recursive === false, 'Windows: a drive root never recursive; its file by its folder', r);
}
{
  const small = new Set(['/home/quent/site']);
  const r = C.plan([{ path: '/home/quent/site', kind: 'folder' }, { path: '/home/quent/big', kind: 'folder' }, { path: '/home/quent/data', kind: 'folder', force: true }], { ...LIN, smallTree: (d) => small.has(d) });
  const by = Object.fromEntries(r.map((x) => [x.dir, x.recursive]));
  check(by['/home/quent/site'] === true && by['/home/quent/big'] === false, 'Linux: recursive only for a small tree (inotify: a watch per folder)', r);
  check(by['/home/quent/data'] === true, 'Linux: sync\'s own folders stay recursive (as before)', r);
}

// ---------- coalescing on a fake clock ----------
{
  let t = 0; const timers = []; let made = 0;
  const setTimer = (fn, ms) => { made += 1; const x = { fn, at: t + ms, live: true }; timers.push(x); return x; };
  const clearTimer = (x) => { if (x) x.live = false; };
  const run = (until) => { for (;;) { const due = timers.filter((x) => x.live && x.at <= until).sort((a, b) => a.at - b.at)[0]; if (!due) break; t = due.at; due.live = false; due.fn(); } t = until; };
  const got = [];
  const co = C.createCoalescer({ now: () => t, setTimer, clearTimer, onFlush: (items, n) => got.push({ items, n, at: t }) });
  for (let i = 0; i < 200; i++) { co.push(i % 2 ? '/a/song.wav' : `/a/f${i}.png`, 'change'); t += 0.4; }
  run(t + 2000);
  check(got.length === 1, 'a burst of 200 events → one batch', got.length);
  check(got[0]?.n === 200 && got[0].items.length === 101 && got[0].items.find((x) => x.path === '/a/song.wav')?.n === 100, 'the batch: each path once, with its count', { n: got[0]?.n, paths: got[0]?.items.length });
  check(made <= 3, `few timers for the whole burst (${made})`, made);
  got.length = 0; made = 0;
  // an export writing for 10 s without a pause: a batch at most every maxWait, not one per write
  for (let i = 0; i < 100; i++) { co.push('/a/render.mp4', 'change'); run(t + 100); }
  run(t + 2000);
  check(got.length >= 3 && got.length <= 5 && got.slice(0, -1).every((g, k) => k === 0 || g.at - got[k - 1].at >= C.MAX_WAIT - 1), `a 10 s stream of writes → a batch every ${C.MAX_WAIT} ms while it lasts, then one when it stops (${got.length})`, got.map((g) => g.at));
  got.length = 0;
  co.push('/a/x', 'change'); co.cancel(); run(t + 5000);
  check(got.length === 0 && co.size() === 0, 'cancel drops what waits');
}

// ---------- what happened ----------
{
  const T = 1_000_000;
  check(C.classify({ size: 10, mtime: 5 }, { size: 12, mtime: 9 }, { t: T }).kind === 'change', 'size / time differ → change');
  check(C.classify({ size: 10, mtime: 5 }, { size: 10, mtime: 5 }, { t: T }).kind === null, 'same size and time → nothing new (an atime, a metadata touch)');
  check(C.classify({ size: 10, mtime: 5 }, null, { t: T }).kind === 'delete', 'gone → delete');
  check(C.classify({ none: true }, null, { t: T }).kind === null, 'was already gone → nothing');
  check(C.classify({ size: 10, mtime: 5 }, null, { t: T, placeholder: true }).kind === 'offloaded', 'iCloud swapped it for a placeholder → offloaded (not deleted)');
  check(C.classify({ none: true }, { size: 3, mtime: 2 }, { t: T }).kind === 'add', 'back again → add');
  check(C.classify({ size: 1, mtime: 2 }, { size: 9, mtime: T - 10 }, { t: T }).busy === true, 'written a moment ago → still being written (waits)');
  check(C.classify({ size: 1, mtime: 2 }, { size: 9, mtime: T - 5000 }, { t: T }).busy === false, 'written seconds ago → done');
}
{
  const ch = [
    { path: '/Users/q/Music/song.wav', kind: 'delete', prev: { size: 100, mtime: 50 } },
    { path: '/Users/q/Music/song (final).wav', kind: 'add', size: 100, mtime: 50 },
    { path: '/Users/q/Pictures/logo.png', kind: 'delete', prev: { size: 7, mtime: 1 } },
    { path: '/Users/q/Desktop/logo.png', kind: 'add', size: 7, mtime: 1 },
    { path: '/Users/q/Pictures/other.png', kind: 'delete', prev: { size: 9, mtime: 1 } },
    { path: '/Users/q/Pictures/new.png', kind: 'add', size: 10, mtime: 1 },
  ];
  const r = C.pairRenames(ch, MAC);
  const ren = r.filter((c) => c.kind === 'rename');
  check(ren.some((c) => c.path === '/Users/q/Music/song.wav' && c.to === '/Users/q/Music/song (final).wav'), 'renamed in Finder (same folder) → rename', ren);
  check(ren.some((c) => c.path === '/Users/q/Pictures/logo.png' && c.to === '/Users/q/Desktop/logo.png'), 'moved to another folder (same name) → rename', ren);
  check(r.some((c) => c.path === '/Users/q/Pictures/other.png' && c.kind === 'delete') && r.some((c) => c.kind === 'add' && /new\.png$/.test(c.path)), 'another size → a delete and an add, not a rename');
  const w = C.pairRenames([{ path: 'C:\\Music\\Song.wav', kind: 'delete', prev: { size: 5, mtime: 3 } }, { path: 'c:\\music\\song2.wav', kind: 'add', size: 5, mtime: 3 }], WIN);
  check(w.length === 1 && w[0].kind === 'rename', 'Windows: same folder whatever the case', w);
}
{
  const wants = [{ path: '/p/site', kind: 'folder', tag: 'ai-folder:a' }, { path: '/p/docs', kind: 'folder', presence: true, tag: 'ai-folder:b' }, { path: '/p/site/a.js', kind: 'file', tag: 'ai-file' }, { path: '/p/top', kind: 'folder', deep: false, tag: 'top' }];
  check(JSON.stringify(C.tagsFor('/p/site/a.js', wants, MAC)) === JSON.stringify(['ai-folder:a', 'ai-file']), 'tags: the folder and the file', C.tagsFor('/p/site/a.js', wants, MAC));
  check(C.tagsFor('/p/docs/x.md', wants, MAC).length === 0 && C.tagsFor('/p/docs', wants, MAC)[0] === 'ai-folder:b', 'presence-only: the folder itself, never what is inside');
  check(C.tagsFor('/p/top/x', wants, MAC)[0] === 'top' && C.tagsFor('/p/top/sub/x', wants, MAC).length === 0, 'not deep: direct children only');
  check(C.tagsFor('C:\\P\\SITE\\A.JS', wants.map((x) => ({ ...x, path: x.path.replace(/^\/p/, 'C:\\p').replace(/\//g, '\\') })), WIN).includes('ai-file'), 'Windows tags ignore case');
}
check(C.words([{ path: '/x/logo.png', kind: 'change' }]) === 'logo.png updated from disk' && C.words([{}, {}, {}]) === '3 files updated from disk', 'the one quiet line');

// ---------- the service on real folders ----------
(async () => {
  const FW = require('../filewatchmain');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-fw-'));
  const D = (...p) => path.join(root, ...p);
  for (const d of ['lab', 'ai', 'ai/sub', 'sync', 'gone', 'poll']) fs.mkdirSync(D(d), { recursive: true });
  const write = (p, s) => fs.writeFileSync(p, s);
  write(D('lab', 'logo.png'), 'v1'); write(D('lab', 'song.wav'), 'song-1'); write(D('ai', 'notes.md'), 'n1'); write(D('gone', 'clip.mp4'), 'c1'); write(D('poll', 'p.txt'), 'p1');
  const batches = [];
  FW.onChanges((list) => batches.push(list));
  const settle = async (ms = 1200) => { await wait(ms); };
  FW.want('lab', [{ path: D('lab', 'logo.png'), tag: 'lab-ref:r1' }, { path: D('lab', 'song.wav'), tag: 'lab-song' }]);
  FW.want('ai', [{ path: D('ai'), kind: 'folder', presence: true, tag: 'ai-folder:x' }, { path: D('ai', 'notes.md'), tag: 'ai-file' }]);
  FW.want('gone', [{ path: D('gone', 'clip.mp4'), tag: 'gone-file' }, { path: D('gone'), kind: 'folder', presence: true, tag: 'gone-folder' }]);
  await settle(400);
  const st0 = FW.state();
  check(st0.roots.length >= 3 && st0.roots.every((r) => r.mode === 'watch'), 'the plan is watching (one per folder)', st0.roots);
  check(st0.files === 4, 'four wanted files stamped', st0.files);

  // a change
  batches.length = 0;
  write(D('lab', 'logo.png'), 'v2-bigger');
  await settle();
  const c1 = batches.flat();
  check(batches.length === 1 && c1.length === 1 && c1[0].kind === 'change' && c1[0].tags.includes('lab-ref:r1'), 'a picture saved again → one change for its tag', batches);

  // editors' swap / temp files: nothing
  batches.length = 0;
  for (const n of ['.DS_Store', '~$notes.md', '.notes.md.swp', 'x.crdownload', 'Photoshop Temp123', '.logo2.png.icloud', 'x.tmp']) write(D('lab', n), 'junk');
  await settle();
  check(batches.length === 0, 'swap / temp / placeholder files → no batch', batches);

  // a safe save (temp file, then renamed over the original): one change
  batches.length = 0;
  write(D('lab', 'song.wav.sb-1a2b3c4d-AbCdEf'), 'song-2-safe');
  fs.renameSync(D('lab', 'song.wav.sb-1a2b3c4d-AbCdEf'), D('lab', 'song.wav'));
  await settle();
  check(batches.length === 1 && batches[0].length === 1 && batches[0][0].kind === 'change' && batches[0][0].tags[0] === 'lab-song', 'a safe save (temp + rename over) → one change', batches);

  // a burst: 200 writes to the song and 200 new files next to it in an AI folder (presence only)
  batches.length = 0;
  for (let i = 0; i < 200; i++) { write(D('lab', 'song.wav'), `song-burst-${i}-${'x'.repeat(i)}`); write(D('ai', `gen-${i}.txt`), String(i)); }
  await settle(4000);
  const flat = batches.flat();
  check(batches.length === 1 && flat.length === 1 && flat[0].tags[0] === 'lab-song', `a burst of 200 writes (+ 200 new files in an AI folder) → one batch, one change (${batches.length} batches)`, batches.map((b) => b.map((c) => `${path.basename(c.path)}:${c.kind}`)));

  // Hearth's own write: nothing
  batches.length = 0;
  FW.own(D('lab', 'logo.png'));
  write(D('lab', 'logo.png'), 'own-write');
  await settle();
  check(batches.length === 0, 'Hearth\'s own write → no batch', batches);

  // a rename in Finder (same folder) → rename to the new name
  batches.length = 0;
  fs.renameSync(D('lab', 'song.wav'), D('lab', 'song (final).wav'));
  await settle();
  const ren = batches.flat().find((c) => c.kind === 'rename');
  check(ren && ren.to === D('lab', 'song (final).wav') && ren.tags.includes('lab-song'), 'renamed next to itself → followed (rename, to)', batches);

  // deleted outside
  batches.length = 0;
  fs.unlinkSync(D('ai', 'notes.md'));
  await settle();
  check(batches.flat().some((c) => c.kind === 'delete' && c.tags.includes('ai-file')), 'deleted outside → delete', batches);

  // sync's tree: raw names, temp files already left out
  const names = [];
  const h = FW.tree(D('sync'), (n) => names.push(n));
  await wait(150);
  write(D('sync', 'chat.json'), '{}'); write(D('sync', 'chat.json.hubtmp'), '{}');
  await wait(600);
  check(names.includes('chat.json') && !names.some((n) => /hubtmp/.test(n)), 'sync\'s folder through the same service: its names, no temp files', names);
  h.close();

  // a folder deleted (renamed away): its file and the folder said once; back → re-armed
  batches.length = 0;
  fs.renameSync(D('gone'), D('gone-moved'));
  await settle();
  const g = batches.flat();
  check(g.some((c) => c.tags.includes('gone-file') && c.kind === 'delete') && g.some((c) => c.tags.includes('gone-folder') && c.kind === 'delete'), 'the folder renamed away: its file and itself → delete', g);
  check(FW.state().roots.some((r) => r.dir === D('gone') && r.mode === 'gone') && FW.state().polling, 'the gone folder waits on the slow check', FW.state().roots);
  FW._test.testHook({ pollMs: 200 });
  batches.length = 0;
  fs.renameSync(D('gone-moved'), D('gone'));
  await settle(1500);
  check(FW.state().roots.find((r) => r.dir === D('gone'))?.mode === 'watch', 'back → watched again', FW.state().roots);
  check(batches.flat().some((c) => c.tags.includes('gone-folder') && c.kind === 'available'), 'back → the folder is available again', batches);
  check(!FW.state().polling, 'nothing to check slowly any more → the slow check stops');
  batches.length = 0;
  write(D('gone', 'clip.mp4'), 'c2-changed');
  await settle();
  check(batches.flat().some((c) => c.tags.includes('gone-file') && c.kind === 'change'), 'a change after it came back is seen', batches);

  // a watch the system drops (a network drive, a full inotify table): the slow check takes over
  FW.want('poll', [{ path: D('poll', 'p.txt'), tag: 'poll-file' }]);
  await wait(300);
  FW._test.testHook({ fail: D('poll', 'p.txt') });
  const pr = FW.state().roots.find((r) => r.dir === D('poll'));
  check(pr?.mode === 'poll' && FW.state().polling, 'a failed watch → the slow check', FW.state().roots);
  batches.length = 0;
  // (the slow check first tries the system again: the next poll re-arms the watch here, so the change shows either way)
  write(D('poll', 'p.txt'), 'p2-polled');
  await settle(1500);
  check(batches.flat().some((c) => c.tags.includes('poll-file') && c.kind === 'change'), 'changed while on the slow check → seen', batches);

  // a wake: every watch opened again, what changed meanwhile goes out once
  for (const r of FW._test.roots.values()) { try { r.w?.close(); } catch { /* closed */ } r.w = null; }
  write(D('lab', 'logo.png'), 'changed-while-asleep-xx');
  await wait(300);
  batches.length = 0;
  const n = FW.rearm();
  check(n === 1 && batches.length === 1 && batches[0][0].kind === 'change' && batches[0][0].tags.includes('lab-ref:r1'), 'after a wake: one batch with what changed while asleep', batches);
  batches.length = 0;
  write(D('lab', 'logo.png'), 'after-wake');
  await settle();
  check(batches.length === 1, 'and watched again after the wake', batches);

  // idle: nothing scheduled
  await wait(1200);
  const idle = FW.state();
  check(!idle.polling && FW._test.co.size() === 0, 'idle: no slow check, nothing waiting', { polling: idle.polling, pending: FW._test.co.size() });
  // handles: one per watched folder, none per file
  check(idle.roots.length <= 5, `watches: ${idle.roots.length} folders for ${idle.files} files`, idle.roots);

  fs.rmSync(root, { recursive: true, force: true });
  console.log(`filewatch-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
