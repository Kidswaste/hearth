#!/usr/bin/env node
// (round 46, platform46) Rounds 41–45 on a Mac and a Windows PC, simulated here (process.platform overrides, path.win32,
// fake iCloud placeholders). Node only, in UNIT: node dev/platform46-test.js
//   1. zipkit: accents / emoji / NFD names come back as written (UTF-8, NFC), a damaged file is named, Recover takes
//      what reads (skipBad), names can't climb out ("..", absolute, C:), big files stream, scripts keep their mode,
//      Linux's unzip reads the zips (when it's there)
//   2. backups: the Mac's "._" / .DS_Store and Windows' Thumbs.db never make a backup "damaged"; accented data names
//      survive; an iCloud-offloaded card / media file is never tidied away; a disk with no bin keeps its zips
//   3. backupauto words: cloud drives, long Windows paths; the Mac compares folders without case / Unicode form
//   4. errorcalm: Windows' EPERM on a rename, Controlled folder access, OneDrive / iCloud online-only files
//   5. filewatch: the Mac's FSEvents (NFD) names match the window's (NFC); case ignored on the Mac and Windows
//   6. renderfast: an ffmpeg that can't start (a .cmd on Windows) answers instead of throwing
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0; let fail = 0;
const check = (cond, what, got) => { if (cond) { pass += 1; console.log(`✓ ${what}`); } else { fail += 1; console.log(`✖ ${what}${got !== undefined ? ` — ${JSON.stringify(got).slice(0, 300)}` : ''}`); } };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 'platform46-test-'));
const w = (root, rel, v) => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, v); return f; };

(async () => {
  // ---------- 1. zipkit ----------
  const Z = require(path.join(ROOT, 'zipkit.js'));
  const src = path.join(T, 'src');
  const NFD = 'Mu\u0301sique e\u0301te\u0301 #2 100%'; const NFC = NFD.normalize('NFC');
  w(src, `data/${NFD}/clip 🎬.json`, JSON.stringify({ ok: 1 }));
  w(src, 'data/kv/notes.json', JSON.stringify([{ id: 'n1', text: require('crypto').randomBytes(4000).toString('hex') }]));
  w(src, 'mac/setup-mac.sh', '#!/bin/sh\necho hi\n'); try { fs.chmodSync(path.join(src, 'mac/setup-mac.sh'), 0o755); } catch { /* no modes here */ }
  w(src, 'big.bin', Buffer.alloc(300000, 3));
  const zip = path.join(T, 'a.zip');
  const made = await Z.writeZip(src, zip, { big: 100000 });
  check(made.files === 4, 'zipkit: every file in', made);
  const names = await Z.names(zip);
  check(names.includes(`data/${NFC}/clip 🎬.json`), 'zipkit: an accented / emoji name is stored as written, composed (NFC) like Windows names it', names);
  const ents = await Z.entries(zip);
  check(ents.every((e) => (e.flags & 0x0800) === 0x0800), 'zipkit: every name flagged UTF-8 (Explorer, Finder and tar read it right)');
  const out = path.join(T, 'out');
  await Z.extract(zip, out, { big: 100000 });
  check(fs.readFileSync(path.join(out, 'data', NFC, 'clip 🎬.json'), 'utf8') === '{"ok":1}' && fs.readFileSync(path.join(out, 'big.bin')).equals(Buffer.alloc(300000, 3)), 'zipkit: everything reads back the same (small deflated, big streamed)');
  if (process.platform !== 'win32') check((ents.find((e) => e.name === 'mac/setup-mac.sh') || {}).mode === 0o755, 'zipkit: a script keeps its "run me" bit (Finder\'s Archive Utility gives it back)', ents.map((e) => [e.name, e.mode]));
  check(!fs.readdirSync(path.join(out, 'data')).some((n) => n.startsWith('._')), 'zipkit: no "._" AppleDouble files (the Mac\'s tar added them)');
  // a damaged zip: the file is named; Recover takes what reads
  const bad = path.join(T, 'bad.zip');
  const ne = ents.find((e) => e.name === 'data/kv/notes.json'); const b = fs.readFileSync(zip); const at = ne.offset + 30 + Buffer.byteLength(ne.name) + Math.floor(ne.csize / 2); b.fill(0x5a, at, at + 8); fs.writeFileSync(bad, b);
  let err = null; try { await Z.extract(bad, path.join(T, 'bad-out')); } catch (e) { err = e; }
  check(err && err.code === 'EZIPCRC' && err.entry === 'data/kv/notes.json', 'zipkit: a damaged file is named ("data/kv/notes.json doesn\'t read back the same")', err && { code: err.code, entry: err.entry, m: err.message });
  const some = await Z.extract(bad, path.join(T, 'bad-out2'), { skipBad: true });
  check(some.bad.length === 1 && some.files === 3 && !fs.existsSync(path.join(T, 'bad-out2', 'data', 'kv', 'notes.json')), 'zipkit: Recover (skipBad) takes what reads and leaves the damaged file out', some);
  // names that would land outside
  check(Z._test.safeName('../evil.txt') === null && Z._test.safeName('/etc/x') === null && Z._test.safeName('C:\\Windows\\x') === null && Z._test.safeName('a/../../x') === null && Z._test.safeName('ok\\win\\name.json') === 'ok/win/name.json', 'zipkit: "..", absolute and drive names never leave the folder; Windows backslashes read as folders');
  check(Z.crc32(Buffer.from('hello')) === Z._test.crcSlow(Buffer.from('hello')) && Z._test.crcSlow(Buffer.from('hello')) === 907060870, 'zipkit: the CRC matches zlib\'s (and the fallback for an older Node)');
  // other tools read it (Linux here; Windows' tar / Finder read the same standard)
  try { const l = require('child_process').execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }); check(l.split('\n').includes(`data/${NFC}/clip 🎬.json`), 'unzip reads zipkit\'s names'); } catch { console.log('· (no unzip here: skipped)'); }
  // a zip made by Linux's zip reads too (older backups)
  try {
    const legacy = path.join(T, 'legacy.zip');
    require('child_process').execFileSync('zip', ['-qr', legacy, 'data'], { cwd: src });
    const r = await Z.extract(legacy, path.join(T, 'legacy-out'), { members: ['data/kv/'] });
    check(r.files === 1 && fs.existsSync(path.join(T, 'legacy-out', 'data', 'kv', 'notes.json')), 'zipkit reads an older zip (made by another tool), one folder of it', r);
  } catch { console.log('· (no zip here: skipped)'); }

  // ---------- 2. backups on real files, the Mac's / Windows' litter, iCloud placeholders ----------
  process.env.HEARTH_TEST_SAVE_DIR = path.join(T, 'saves');
  delete process.env.HEARTH_TEST_OPEN;
  fs.mkdirSync(process.env.HEARTH_TEST_SAVE_DIR, { recursive: true });
  const app = path.join(T, 'app'); const data = path.join(app, 'data');
  fs.mkdirSync(app, { recursive: true });
  fs.writeFileSync(path.join(app, 'config.json'), JSON.stringify({ agents: [{ id: 'claude' }], settings: {} }));
  w(data, 'kv/three-sketches.json', JSON.stringify([{ id: 's1' }, { id: 's2' }]));
  w(data, 'kv/._three-sketches.json', Buffer.from([0, 5, 22, 7, 0, 2, 0, 0, 77, 97, 99])); // the Mac's AppleDouble (not JSON)
  w(data, 'kv/.DS_Store', Buffer.from([0, 0, 0, 1, 66, 117]));
  w(data, 'chats/Thumbs.db', Buffer.from([1, 2, 3]));
  w(data, 'chats/c1.json', JSON.stringify({ id: 'c1', messages: [] }));
  w(data, `attachments/${NFD}.json`, JSON.stringify({ a: 1 }));
  w(data, 'captures/take.mp4', Buffer.alloc(21 * 1048576, 9));
  const BA = require(path.join(ROOT, 'backupautomain.js'));
  BA._test.set({ dataDir: data, configPath: path.join(app, 'config.json'), themePath: path.join(app, 'theme.css'), appDir: app, platform: 'darwin', home: path.join(T, 'home'), getWin: () => null });
  BA.register({ handle: () => {} }, { dataDir: data, configPath: path.join(app, 'config.json'), themePath: path.join(app, 'theme.css'), appDir: app, getWin: () => null });
  const r1 = await BA.run('manual');
  check(r1.ok, 'a Mac backup with "._" / .DS_Store / Thumbs.db in the data folder is good (they were read as damaged stores)', r1);
  const inZip = r1.ok ? await Z.names(r1.path) : [];
  check(!inZip.some((n) => /(^|\/)(\._|\.DS_Store|Thumbs\.db)/.test(n)) && inZip.includes(`data/attachments/${NFC}.json`), 'the zip: no litter, the accented name as written', inZip);
  const dir = BA.dir(); const det = path.join(dir, '.hearth'); const media = path.join(det, 'media');
  const mediaKey = fs.readdirSync(media)[0];
  // iCloud (older macOS) offloads the media file and the card: ".name.icloud"
  fs.renameSync(path.join(media, mediaKey), path.join(media, `.${mediaKey}.icloud`));
  const card = `${r1.name}.json`;
  fs.renameSync(path.join(det, card), path.join(det, `.${card}.icloud`));
  await BA._test.testHook({ rotate: true });
  check(fs.existsSync(path.join(media, `.${mediaKey}.icloud`)) && fs.existsSync(path.join(det, `.${card}.icloud`)), 'an iCloud-offloaded card / big file is never tidied away (the rotation left them)', fs.readdirSync(det));
  // the zip itself offloaded: its card stays
  fs.renameSync(path.join(det, `.${card}.icloud`), path.join(det, card));
  fs.renameSync(path.join(media, `.${mediaKey}.icloud`), path.join(media, mediaKey));
  fs.renameSync(r1.path, path.join(dir, `.${r1.name}.icloud`));
  await BA._test.testHook({ rotate: true });
  check(fs.existsSync(path.join(det, card)) && fs.existsSync(path.join(media, mediaKey)), 'an offloaded zip keeps its card and its big file', fs.readdirSync(det));
  fs.renameSync(path.join(dir, `.${r1.name}.icloud`), r1.path);
  const v = await BA.verify(r1.path);
  check(v.ok, 'the check still passes', v);
  // a Windows PC whose backup folder has no Recycle Bin (here: not a drive path at all) → rotation removes nothing
  // older backups of this computer (by name), more than the rotation keeps; the folder chosen by hand
  for (let d = 1; d <= 9; d++) fs.copyFileSync(r1.path, path.join(dir, `hearth-backup-2020-0${d}-0${d}-10-00.zip`));
  await BA._test.testHook({ state: { dir } });
  BA._test.set({ platform: 'win32' }); // (a path Windows can't put in a Recycle Bin: no drive letter)
  const zipsBefore = fs.readdirSync(dir).filter((n) => n.endsWith('.zip')).length;
  const removed = (await BA._test.testHook({ rotate: true })).removed;
  check(removed === 0 && fs.readdirSync(dir).filter((n) => n.endsWith('.zip')).length === zipsBefore, 'Windows: a folder with no Recycle Bin keeps its backups (never deleted for good)', { removed, zipsBefore });
  BA._test.set({ platform: 'linux' });
  const rm2 = (await BA._test.testHook({ rotate: true })).removed;
  check(rm2 > 0 && fs.existsSync(r1.path), '…while a folder with a bin rotates as before (the newest kept)', { rm2, zipsBefore });

  // ---------- 3. backupauto words / places ----------
  const C = require(path.join(ROOT, 'backupauto-core.js'));
  check(C.inside('/Users/Q/Hearth/data/backups', '/users/q/hearth/Data', 'darwin') && C.inside(`/Users/q/${NFD}/data/x`, `/Users/q/${NFC}/data`, 'darwin'), 'the Mac: "inside the data folder" ignores case and the Unicode form (as its disks do)');
  check(!C.inside('/home/Q/data/x', '/home/q/data', 'linux'), 'Linux: exact');
  check(C.inside('C:/Users/Q/Hearth/data/b', 'c:\\users\\q\\hearth\\DATA', 'win32'), 'Windows: either slash, any case');
  check(/OneDrive/.test(C.explain({ code: 'UNKNOWN', message: 'UNKNOWN: unknown error, open' }, 'win32').why) && C.explain({ code: 'UNKNOWN' }, 'win32').fix === 'retry', 'Windows: OneDrive\'s online-only file it couldn\'t fetch, in plain words');
  check(/iCloud Drive/.test(C.explain({ code: 'EDEADLK' }, 'darwin').why), 'the Mac: iCloud\'s file it couldn\'t fetch (EDEADLK)');
  check(/260 characters/.test(C.explain({ code: 'ENAMETOOLONG' }, 'win32').why) && C.explain({ code: 'ENAMETOOLONG' }, 'win32').fix === 'folder', 'Windows: a path too long → a shorter folder');
  check(/Controlled folder access/.test(C.explain({ code: 'EPERM' }, 'win32').why) && /Privacy & Security/.test(C.explain({ code: 'EPERM' }, 'darwin').why), 'EPERM: Controlled folder access on Windows, Privacy & Security on the Mac');

  // ---------- 4. errorcalm ----------
  const E = require(path.join(ROOT, 'errorcalm-core.js'));
  const say = (t, platform) => E.calm(`Couldn't save the scene: ${t}`, { platform });
  check(/held by another program/.test(say("EPERM: operation not permitted, rename 'C:\\Users\\q\\a.json.tmp' -> 'C:\\Users\\q\\a.json'", 'win32').text), 'Windows: EPERM on a rename = another program (an antivirus, OneDrive) holding it');
  check(/Controlled folder access/.test(say("EACCES: permission denied, open 'C:\\Users\\q\\Documents\\x.json'", 'win32').text) && /Privacy & Security/.test(say("EPERM: operation not permitted, open '/Users/q/Documents/x.json'", 'darwin').text), 'permission: each computer\'s own place to allow it');
  check(/kept online by OneDrive/.test(say("UNKNOWN: unknown error, open 'C:\\Users\\q\\OneDrive\\song.wav'", 'win32').text) && /kept online by iCloud Drive/.test(say("EDEADLK: resource deadlock avoided, open '/Users/q/Library/Mobile Documents/com~apple~CloudDocs/song.wav'", 'darwin').text), 'online-only files: OneDrive / iCloud named, not "unknown error"');
  check(E.isRaw('UNKNOWN: unknown error, open \'C:\\x\'') && E.isRaw('EDEADLK: resource deadlock avoided'), 'those read as raw (never shown as they are)');

  // ---------- 5. filewatch ----------
  const F = require(path.join(ROOT, 'filewatch-core.js'));
  const wants = [{ path: `/Users/q/${NFC}/song.wav`, kind: 'file', tag: 'lab-song' }];
  check(F.tagsFor(`/Users/q/${NFD}/song.wav`, wants, { P: path.posix, platform: 'darwin' })[0] === 'lab-song', 'the Mac: an FSEvents (NFD) name finds the wanted (NFC) file');
  check(F.tagsFor('/users/Q/' + NFC + '/Song.wav', wants, { P: path.posix, platform: 'darwin' })[0] === 'lab-song', 'the Mac: case ignored');
  check(F.tagsFor('C:\\USERS\\q\\song.WAV', [{ path: 'c:\\Users\\Q\\song.wav', kind: 'file', tag: 't' }], { P: path.win32, platform: 'win32' })[0] === 't', 'Windows: case ignored');
  const plan = F.plan([{ path: `/Users/q/${NFC}/a.wav`, kind: 'file' }, { path: `/Users/q/${NFD}/b.wav`, kind: 'file' }], { platform: 'darwin', P: path.posix, home: '/Users/q' });
  check(plan.length === 1, 'the Mac: one folder named two ways is watched once', plan);

  // ---------- 6. renderfast ----------
  const aemain = require(path.join(ROOT, 'aemain.js'));
  const realFf = aemain.ffStatus;
  aemain.ffStatus = () => ({ ffmpeg: path.join(T, 'ffmpeg.cmd'), hint: '' });
  const cp = require('child_process'); const realSpawn = cp.spawn;
  cp.spawn = () => { throw Object.assign(new Error('spawn EINVAL'), { code: 'EINVAL' }); };
  delete require.cache[require.resolve(path.join(ROOT, 'renderfastmain.js'))];
  const RF = require(path.join(ROOT, 'renderfastmain.js'));
  let ans = null; try { ans = RF.open({ id: 'x', args: ['-i', 'INPUT', 'OUTPUT'], output: path.join(T, 'out', 'v.mp4') }); } catch (e) { ans = { threw: e.message }; }
  cp.spawn = realSpawn; aemain.ffStatus = realFf;
  check(ans && ans.ok === false && /EINVAL/.test(ans.error), 'renderfast: an ffmpeg Windows won\'t start (a .cmd) answers "couldn\'t be started" instead of throwing', ans);

  fs.rmSync(T, { recursive: true, force: true });
  console.log(`\nplatform46-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
