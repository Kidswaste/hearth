#!/usr/bin/env node
// (round 74, synchard74) Sync on real Windows / Mac computers, through the two-computer simulator (dev/sync-sim.js, the
// worlds of dev/sync72-test.js). Each case is what a real PC or Mac does to sync; after each, nothing written on either
// computer is lost and the sync status says what is blocked, in a code the panel turns into plain words + a fix.
//   locked     a WAV the Sound desk's host holds, a file OneDrive / an antivirus holds (EBUSY / EPERM): "in use", retried,
//              the file in place untouched, then it syncs once let go
//   readonly   Windows' read-only mark: an update / a delete from the Mac is refused; "Allow changes" fixes it
//   winnames   names a PC can't hold made on the Mac (":" "?" a trailing dot, CON, a path over 260): held back on the
//              Mac with "Rename for Windows" (links in chats follow), never written on the PC, said by name there
//   diskfull   the disk fills up mid-copy (here or the cloud folder): nothing half-written left, nothing damaged,
//              "disk full", then everything once there is room
//   unmount    the cloud folder unmounted / moved mid-scan / emptied by a cloud client starting over: paused, never
//              "everything deleted"; back → synced, nothing lost
//   versions   the two computers on different versions: an older Hearth stops writing when a newer one says so, and
//              never merges / pushes over a file a newer Hearth wrote last; the newer one says "update it there"
//   many       50,000 small files (pass times; a renamed folder of 5,000 is moved in one pass)
//   sleep      the computer sleeps mid-pass / while a download or a delete is still arriving: the time asleep doesn't
//              count toward any wait (a half file was taken as final; a deleted chat came back)
//   secrets    keys / tokens / passwords and per-computer settings never reach the cloud; one an older version put
//              there is shown with "Remove from the cloud"
// Never touches real data or a real cloud drive: a temp folder.
//   node dev/synchard74-test.js [--only name,name] [--many 50000] [--keep]
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./sync72-test'); // its worlds and computers (requiring it runs nothing)
const Sim = require('./sync-sim');
const Hard = require('../sync-hard');
const S = require('../sync-merge');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
const MANY = (() => { const i = argv.indexOf('--many'); return i >= 0 ? Number(argv[i + 1]) : 5000; })(); // 50,000: --many 50000 (≈ 5 min here)
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500)}` : ''}`); } };
const raw = Sim.raw;
const MB = 1024 * 1024;
const cloudFile = (m, rel) => path.join(m.cloudRoot, 'Hearth', 'files', ...rel.split('/'));
const readOr = (f) => { try { return raw.readFileSync(f); } catch { return null; } };
const same = (a, b) => Boolean(a && b) && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const blocked = (m, why) => (m.e.status().blocked || []).filter((b) => !why || b.why === why);
const blockedRel = (m, rel, why) => blocked(m, why).find((b) => b.rel === rel);
// files whose names say a copy was left half-done (temp files, parts of big copies)
function leftovers(dir) { const out = []; const walk = (d) => { let es = []; try { es = raw.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/^\.hearth-(tmp|part)|\.tmp$/.test(e.name)) out.push(f); } }; walk(dir); return out; }
function filesIn(dir) { const out = []; const walk = (d, r) => { let es = []; try { es = raw.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { const rr = r ? `${r}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(d, e.name), rr); else out.push(rr); } }; walk(dir, ''); return out; }
// (round 75, syncstate75) sync's state is in pieces: the index reads, and so does every piece it names
function stateWhole(m) { try { const d = path.join(m.data, 'sync', 'state'); const ix = JSON.parse(raw.readFileSync(path.join(d, 'index.json'), 'utf8')); return ix.v === 2 && Object.values(ix.parts).every((n) => JSON.parse(raw.readFileSync(path.join(d, n), 'utf8')).v === 2); } catch { return false; } }
const trashed = (m) => filesIn(path.join(m.data, 'sync', 'trash'));
async function rounds(w, n, o) { for (let i = 0; i < n; i++) await T.round(w, o); }
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// ---------- 1. files locked by another program ----------
scenario('locked', async () => {
  const w = T.world('h-locked');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  const take = 'creative-sketches/Night/take 1.wav';
  pc.write(take, Buffer.alloc(300 * 1024, 1));
  pc.write('chats/a.json', T.chat('a', [T.msg('user', 1, 'hi')]));
  ok(await T.converge(w) > 0, 'locked: first sync', T.why(w));
  // the Mac changes the take while the Sound desk's host on the PC holds it open
  mac.write(take, Buffer.alloc(300 * 1024, 2));
  Sim.lock(pc.p(take), 'EBUSY');
  await rounds(w, 4);
  const b = blockedRel(pc, take, 'locked');
  ok(b && b.fix === 'retry' && b.where === 'here', 'locked: the WAV is listed as "in use" (locked, here, Try again)', blocked(pc));
  ok(same(readOr(pc.p(take)), Buffer.alloc(300 * 1024, 1)), 'locked: the file in use is untouched (the Sound desk keeps playing the old take)');
  ok(!pc.last.lastError && !leftovers(pc.data).length, 'locked: not reported as an error, no temp file left', { err: pc.last.lastError, left: leftovers(pc.data) });
  // a file edited here while held: its read fails the same way (was "unreadable, skipped")
  pc.write('attachments/held.txt', 'one'); await rounds(w, 3);
  pc.write('attachments/held.txt', 'two'); Sim.lock(pc.p('attachments/held.txt'), 'EBUSY');
  await rounds(w, 2);
  ok(blockedRel(pc, 'attachments/held.txt', 'locked') && !(pc.last.unreadable || []).includes('attachments/held.txt'), 'locked: a held file edited here: "in use", not "unreadable"', { b: blocked(pc), u: pc.last.unreadable });
  // OneDrive holding the cloud copy (EPERM on Windows): said to be the cloud folder's
  pc.write('chats/a.json', T.chat('a', [T.msg('user', 1, 'hi'), T.msg('user', 2, 'pc')]));
  Sim.lock(cloudFile(pc, 'chats/a.json'), 'EPERM');
  await rounds(w, 2);
  const c = blockedRel(pc, 'chats/a.json', 'locked');
  ok(c && c.where === 'cloud', 'locked: the cloud copy held by the cloud client: "in use" in the cloud folder', blocked(pc));
  // let go: everything syncs, nothing lost, the list empties
  Sim.unlock();
  ok(await T.converge(w) > 0, 'locked: once let go, converges', T.why(w));
  ok(same(readOr(pc.p(take)), Buffer.alloc(300 * 1024, 2)) && mac.read('attachments/held.txt') === 'two' && T.texts(mac.json('chats/a.json')).join() === 'hi,pc', 'locked: the new take on the PC, the held edits on the Mac');
  ok(!blocked(pc).length && !blocked(mac).length, 'locked: nothing blocked any more', blocked(pc));
});

// ---------- 2. read-only files (Windows) ----------
scenario('readonly', async () => {
  const w = T.world('h-readonly');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  pc.write('attachments/manual.pdf', 'v1'); pc.write('attachments/old.txt', 'old');
  ok(await T.converge(w) > 0, 'readonly: first sync', T.why(w));
  Sim.T.winReadOnly = true;
  try {
    fs.chmodSync(Sim.ci(pc.p('attachments/manual.pdf')), 0o444);
    fs.chmodSync(Sim.ci(pc.p('attachments/old.txt')), 0o444); // (Windows lets a read-only file be moved: its delete goes to Deleted files as usual)
    mac.write('attachments/manual.pdf', 'v2 from the Mac');
    fs.unlinkSync(mac.p('attachments/old.txt'));
    await rounds(w, 4);
    const b = blockedRel(pc, 'attachments/manual.pdf', 'read-only');
    ok(b && b.fix === 'writable' && b.where === 'here', 'readonly: an update refused by the read-only mark: "read-only", Allow changes', blocked(pc));
    ok(pc.read('attachments/manual.pdf') === 'v1' && !leftovers(pc.data).length && !pc.last.lastError, 'readonly: untouched, no temp file left, not an "error"');
    const r = await pc.e.fix('attachments/manual.pdf', 'writable');
    ok(r.ok && (raw.statSync(pc.p('attachments/manual.pdf')).mode & 0o200), 'readonly: Allow changes takes the mark off', r);
    ok(await T.converge(w) > 0, 'readonly: then converges', T.why(w));
    ok(pc.read('attachments/manual.pdf') === 'v2 from the Mac' && !pc.has('attachments/old.txt') && trashed(pc).some((f) => f.endsWith('old.txt')), 'readonly: the update arrives, the delete goes to Deleted files');
    ok(!blocked(pc).length, 'readonly: nothing blocked any more', blocked(pc));
  } finally { Sim.T.winReadOnly = false; }
});

// ---------- 3. names a Windows PC can't hold, from the Mac ----------
scenario('winnames', async () => {
  const w = T.world('h-winnames');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  pc.view.winNames = true; // OneDrive / iCloud for Windows: such a name never appears in this folder
  const mac = T.computer(w, 'Mac', { platform: 'darwin', nfd: true });
  pc.write('chats/a.json', T.chat('a', [T.msg('user', 1, 'hi')]));
  ok(await T.converge(w) > 0, 'winnames: first sync (the Mac knows a PC syncs too)', T.why(w));
  const deep = `workspace/${'Long project folder name '.repeat(5).trim()}/${'nested assets folder '.repeat(4).trim()}/${'a rather long file name that goes on '.repeat(3).trim()}.txt`;
  const bad = { 'captures/Capture 10:32.png': 'win-chars', 'workspace/site/what?.md': 'win-chars', 'attachments/notes.': 'win-ending', 'attachments/draft ': 'win-ending', 'attachments/CON.txt': 'win-reserved', 'attachments/aux': 'win-reserved', [deep]: 'win-long' };
  for (const rel of Object.keys(bad)) mac.write(rel, `content of ${rel}`);
  mac.write('chats/b.json', T.chat('b', [{ role: 'user', at: 5, text: 'look', attachments: [{ path: mac.p('captures/Capture 10:32.png'), name: 'Capture 10:32.png' }] }]));
  await rounds(w, 5);
  for (const [rel, why] of Object.entries(bad)) {
    const b = blockedRel(mac, rel);
    ok(b && b.why === why && b.fix === 'rename', `winnames: "${rel.slice(0, 40)}" held on the Mac: ${why}, Rename for Windows`, blocked(mac).map((x) => [x.rel.slice(0, 30), x.why]));
    ok(!readOr(cloudFile(mac, rel)) && !w.cloud.server.has(Sim.fold(`Hearth/files/${rel}`)), `winnames: "${rel.slice(0, 40)}" not sent to the cloud`);
  }
  ok(pc.has('chats/b.json') && !filesIn(pc.data).some((f) => /[:?]|[. ]$|(^|\/)(con|aux)(\.|$)/i.test(f)), 'winnames: everything else reaches the PC; no such name on its disk', filesIn(pc.data));
  ok(!mac.last.lastError && !mac.last.last.errors, 'winnames: no error', mac.last.lastError);
  // a name like that already in the cloud from an older Mac (in its journal, never on the PC): said by name on the PC
  const oldRel = 'notes/plan: v2.md';
  raw.mkdirSync(path.dirname(cloudFile(mac, oldRel)), { recursive: true }); raw.writeFileSync(cloudFile(mac, oldRel), 'older version');
  const jf = path.join(mac.cloudRoot, 'Hearth', '.sync', 'journal', `${mac.e.machine().id}.jsonl`);
  raw.writeFileSync(jf, `${raw.readFileSync(jf, 'utf8')}${JSON.stringify({ t: w.clock.now(), op: 'put', rel: oldRel, h: Sim.sha(Buffer.from('older version')), s: 13 })}\n`);
  await rounds(w, 4);
  const there = blockedRel(pc, oldRel, 'win-there');
  ok(there && there.where === 'there' && !there.fix, 'winnames: on the PC, a Mac file Windows can\'t name is listed (fix it on the Mac)', blocked(pc));
  ok(!pc.has(oldRel) && !filesIn(pc.data).some((f) => /plan/.test(f)), 'winnames: …and never written on the PC (":" would make an NTFS stream)');
  // even if a cloud client did bring one into the PC's folder: never written into the PC's data folder
  raw.mkdirSync(path.dirname(cloudFile(pc, 'attachments/x')), { recursive: true }); raw.writeFileSync(cloudFile(pc, 'attachments/why?.txt'), 'dropbox-style');
  pc.view.online = false; await pc.e.pass(); pc.view.online = true;
  ok(!pc.has('attachments/why?.txt') && blockedRel(pc, 'attachments/why?.txt', 'win-there'), 'winnames: a bad name in the PC\'s cloud folder is never written into its data folder', blocked(pc));
  raw.rmSync(cloudFile(pc, 'attachments/why?.txt'));
  // Rename for Windows, on the Mac, for each; the chat's link follows
  for (const rel of Object.keys(bad)) {
    const r = await mac.e.fix(rel, 'rename');
    ok(r.ok && r.to && !Hard.winBad(r.to, { rootLen: 0 }) && r.to.length <= rel.length + 1 && mac.has(r.to) && !mac.has(rel), `winnames: Rename for Windows: "${rel.slice(0, 30)}" → "${String(r.to).slice(0, 40)}"`, r);
    if (rel.startsWith('captures/')) ok(r.links === 1 && mac.json('chats/b.json').messages[0].attachments[0].path === mac.p('captures/Capture 10-32.png'), 'winnames: the chat\'s link to the capture follows the new name (its shown name stays)', mac.json('chats/b.json').messages[0]);
  }
  const old2 = await mac.e.fix(oldRel, 'rename'); // the old one too (it is on the Mac now)
  ok(old2.ok, 'winnames: the older one renamed too', old2);
  ok(await T.converge(w) > 0, 'winnames: then both converge', T.why(w));
  ok(pc.has('captures/Capture 10-32.png') && pc.has('attachments/CON_.txt') && pc.has('notes/plan- v2.md') && JSON.stringify(pc.json('chats/b.json')).includes('Capture 10-32.png'), 'winnames: the renamed files are on the PC, the chat\'s link points at it there', filesIn(pc.data).filter((f) => !f.startsWith('sync/')));
  ok(!blocked(mac).length && !blocked(pc).length, 'winnames: nothing blocked any more', [...blocked(mac), ...blocked(pc)]);
  ok(!T.copies(pc).length && !T.copies(mac).length, 'winnames: no duplicates', [...T.copies(pc), ...T.copies(mac)]);
  // the rules on their own
  ok(Hard.winBad('a/b.txt') === null && Hard.winBad('a/COM1.log').why === 'win-reserved' && Hard.winBad('a/con ').why === 'win-ending' && Hard.winBad('lpt¹').why === 'win-reserved' && Hard.winBad('x\u0001y').why === 'win-chars' && Hard.winBad('console.txt') === null && Hard.winBad('a\\b').why === 'win-chars', 'winnames: rules (reserved names with or without an extension, control characters, "console" is fine)');
  ok(Hard.winSafeName('a:b?c*d|e"f<g>h') === 'a-bcd-e\'f(g)h' && Hard.winSafeName('NUL.txt') === 'NUL_.txt' && Hard.winSafeName('end. . ') === 'end' && Hard.winSafeName('...') === '_', 'winnames: safe names', [Hard.winSafeName('a:b?c*d|e"f<g>h'), Hard.winSafeName('NUL.txt'), Hard.winSafeName('end. . ')]);
});

// ---------- 4. the disk fills up mid-copy ----------
scenario('diskfull', async () => {
  const w = T.world('h-diskfull');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  pc.write('chats/a.json', T.chat('a', [T.msg('user', 1, 'kept safe')]));
  ok(await T.converge(w) > 0, 'diskfull: first sync', T.why(w));
  const before = pc.read('chats/a.json');
  const video = Buffer.alloc(12 * MB, 7); video[0] = 1;
  mac.write('renders/final.mp4', video);
  mac.write('attachments/pic.png', Buffer.alloc(200 * 1024, 3));
  mac.edit('chats/a.json', (c) => { c.messages.push(T.msg('user', 2, 'from the Mac')); });
  Sim.quota(pc.data, 2 * MB); // the PC's disk: 2 MB left
  try {
    await rounds(w, 6);
    const b = blockedRel(pc, 'renders/final.mp4', 'disk-full');
    ok(b && b.fix === 'space' && b.where === 'here', 'diskfull: the video that doesn\'t fit: "disk full" here, Free up space', blocked(pc));
    ok(!leftovers(pc.data).length, 'diskfull: no half copy and no temp file left taking room', leftovers(pc.data));
    ok(!pc.has('renders/final.mp4'), 'diskfull: no half video in the data folder');
    const chat = pc.json('chats/a.json');
    ok(chat && (pc.read('chats/a.json') === before || T.texts(chat).join() === 'kept safe,from the Mac'), 'diskfull: the chat is either as it was or whole with the new message, never cut', pc.read('chats/a.json')?.slice(0, 120));
    ok(stateWhole(pc), 'diskfull: sync\'s own state still whole (its index and every piece it names)'); // (round 75, syncstate75: in pieces)
    // a tighter disk: even the small writes fail; still nothing damaged
    Sim.quota(pc.data, 100);
    mac.edit('chats/a.json', (c) => { c.messages.push(T.msg('user', 3, 'more from the Mac')); });
    await rounds(w, 3);
    ok(pc.json('chats/a.json') && !leftovers(pc.data).length, 'diskfull: completely full: every file still whole, nothing left behind', leftovers(pc.data));
  } finally { Sim.quota(pc.data, null); }
  ok(await T.converge(w) > 0, 'diskfull: room again: converges', T.why(w));
  ok(same(readOr(pc.p('renders/final.mp4')), video) && T.texts(pc.json('chats/a.json')).join() === 'kept safe,from the Mac,more from the Mac', 'diskfull: everything arrived whole');
  ok(!blocked(pc).length, 'diskfull: nothing blocked any more', blocked(pc));
  // the cloud folder's disk full (the PC pushing)
  Sim.quota(pc.cloudRoot, 1000);
  try {
    pc.write('attachments/big note.txt', 'x'.repeat(5000));
    await rounds(w, 3);
    const c = blockedRel(pc, 'attachments/big note.txt', 'disk-full');
    ok(c && c.where === 'cloud' && !leftovers(pc.cloudRoot).length, 'diskfull: the cloud folder\'s disk full: said so, nothing half in the cloud folder', { b: blocked(pc), left: leftovers(pc.cloudRoot) });
  } finally { Sim.quota(pc.cloudRoot, null); }
  ok(await T.converge(w) > 0 && mac.read('attachments/big note.txt')?.length === 5000, 'diskfull: then it goes up', T.why(w));
});

// ---------- 5. the cloud folder unmounted / moved / emptied ----------
scenario('unmount', async () => {
  const w = T.world('h-unmount');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  for (let i = 0; i < 6; i++) pc.write(`attachments/f${i}.txt`, `file ${i}`);
  for (let i = 0; i < 4; i++) pc.write(`chats/c${i}.json`, T.chat(`c${i}`, [T.msg('user', i, `chat ${i}`)]));
  pc.write('kv/projects.json', { v: 1, list: [{ id: 'p1', name: 'Clink', notes: 'n' }] });
  ok(await T.converge(w) > 0, 'unmount: first sync', T.why(w));
  const snap = JSON.stringify(Sim.snapshot(pc.data, S, pc.e.ctx()));
  // a) the drive unmounted (the cloud root gone): offline, nothing touched
  const away = `${pc.cloudRoot}-ejected`;
  raw.renameSync(pc.cloudRoot, away);
  const r1 = await pc.e.pass();
  ok(r1.state === 'offline' && JSON.stringify(Sim.snapshot(pc.data, S, pc.e.ctx())) === snap && !trashed(pc).length, 'unmount: drive gone: offline, nothing here touched', r1.state);
  raw.renameSync(away, pc.cloudRoot);
  ok(await T.converge(w) > 0 && !trashed(pc).length && !trashed(mac).length, 'unmount: back: synced, nothing deleted anywhere', T.why(w));
  // b) the cloud folder moved away WHILE the pass scans it (half the folders listed, then gone)
  let moved = false;
  Sim.T.hook = (op, p) => { if (op === 'scandir' && !moved && /[\\/]Hearth[\\/]files[\\/]kv$/.test(String(p))) { moved = true; raw.renameSync(path.join(pc.cloudRoot, 'Hearth'), path.join(pc.cloudRoot, 'Hearth (moved)')); return 'ENOENT'; } return null; };
  let r2; try { pc.view.online = false; r2 = await pc.e.pass(); } finally { Sim.T.hook = null; }
  ok(moved && r2.state === 'offline' && r2.error === 'missing', 'unmount: moved mid-scan: paused, "missing"', { moved, st: r2.state, e: r2.error });
  ok(JSON.stringify(Sim.snapshot(pc.data, S, pc.e.ctx())) === snap && !trashed(pc).length, 'unmount: …nothing deleted or moved to Deleted files here', trashed(pc));
  ok(!raw.existsSync(path.join(pc.cloudRoot, 'Hearth', 'files')), 'unmount: …and no new cloud copy started in its place');
  raw.renameSync(path.join(pc.cloudRoot, 'Hearth (moved)'), path.join(pc.cloudRoot, 'Hearth')); pc.view.online = true;
  ok(await T.converge(w) > 0 && !trashed(pc).length && !trashed(mac).length, 'unmount: put back: synced, nothing lost', T.why(w));
  // c) the cloud client starting over: the folder there, empty (OneDrive reset, a new empty folder in its place)
  pc.view.online = false;
  const files = path.join(pc.cloudRoot, 'Hearth', 'files'); const keep = `${pc.cloudRoot}-kept`;
  raw.renameSync(files, keep); raw.mkdirSync(files);
  const r3 = await pc.e.pass();
  ok(r3.state === 'offline' && r3.error === 'emptied' && JSON.stringify(Sim.snapshot(pc.data, S, pc.e.ctx())) === snap && !trashed(pc).length, 'unmount: emptied by the cloud client: paused ("emptied"), nothing deleted here', { st: r3.state, e: r3.error });
  raw.rmSync(files, { recursive: true }); raw.renameSync(keep, files); pc.view.online = true;
  ok(await T.converge(w) > 0 && !trashed(pc).length && !trashed(mac).length, 'unmount: filled again: synced, nothing lost', T.why(w));
  // a real "delete everything" from the other computer is still possible (its journal says so; the many-deletes guard asks)
  for (let i = 0; i < 6; i++) fs.unlinkSync(mac.p(`attachments/f${i}.txt`));
  ok(await T.converge(w) > 0 && !pc.has('attachments/f0.txt'), 'unmount: files really deleted on the Mac still go (to Deleted files)', T.why(w));
});

// ---------- 6. two versions of Hearth ----------
scenario('versions', async () => {
  const w = T.world('h-versions');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  pc.write('kv/projects.json', { v: 1, list: [{ id: 'p1', name: 'Clink', notes: 'start' }] });
  ok(await T.converge(w) > 0, 'versions: first sync', T.why(w));
  const fmt = JSON.parse(raw.readFileSync(path.join(pc.cloudRoot, 'Hearth', '.sync', 'machines', `${pc.e.machine().id}.json`), 'utf8')).format;
  const lines = raw.readFileSync(path.join(pc.cloudRoot, 'Hearth', '.sync', 'journal', `${pc.e.machine().id}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(fmt === Hard.FORMAT && lines.every((j) => j.f === Hard.FORMAT), 'versions: the machine record and every journal line carry the sync format', { fmt, f: lines.map((j) => j.f) });
  // a) the PC is updated to a newer Hearth (format 75); it writes a file; the Mac (74) edited the same one meanwhile
  pc.e = pc.make({ format: Hard.FORMAT + 1 });
  mac.view.online = false;
  pc.edit('kv/projects.json', (d) => { d.list[0].notes += '\nfrom the newer PC'; d.list[0].newField = { made: 'by 75' }; });
  await rounds(w, 2);
  mac.edit('kv/projects.json', (d) => { d.list[0].name = 'Clink (Mac)'; });
  mac.view.online = true;
  await rounds(w, 4);
  const b = blockedRel(mac, 'kv/projects.json', 'newer-app');
  ok(b && !b.fix, 'versions: the older Mac never merges over what the newer PC wrote: "made by a newer Hearth: update this one"', blocked(mac));
  const cloudV = JSON.parse(readOr(cloudFile(mac, 'kv/projects.json')));
  ok(cloudV.list[0].newField?.made === 'by 75' && /newer PC/.test(cloudV.list[0].notes), 'versions: the newer data in the cloud is intact', cloudV);
  ok(mac.json('kv/projects.json').list[0].name === 'Clink (Mac)', 'versions: the Mac\'s own edit stays on the Mac meanwhile');
  ok((pc.e.status().peersOld || []).some((p) => p.platform === 'darwin'), 'versions: the newer PC says the Mac runs an older Hearth', pc.e.status().peersOld);
  // the Mac is updated: everything merges, both edits kept
  mac.e = mac.make({ format: Hard.FORMAT + 1 });
  ok(await T.converge(w) > 0, 'versions: the Mac updated: converges', T.why(w));
  const v = pc.json('kv/projects.json').list[0];
  ok(v.name === 'Clink (Mac)' && /newer PC/.test(v.notes) && v.newField?.made === 'by 75', 'versions: both edits kept after the update', v);
  // b) a newer Hearth that changed how it keeps things says so: an older one stops writing altogether
  pc.e = pc.make({ format: Hard.FORMAT + 2, minFormat: Hard.FORMAT + 2 });
  mac.e = mac.make({ format: Hard.FORMAT + 1 });
  await rounds(w, 2);
  mac.edit('kv/projects.json', (d) => { d.list[0].name = 'Mac while old'; });
  const cloudBefore = readOr(cloudFile(mac, 'kv/projects.json'));
  await rounds(w, 3);
  ok(mac.last.state === 'offline' && mac.last.error === 'old-version' && mac.last.need === Hard.FORMAT + 2, 'versions: the older Mac pauses: "update Hearth on this computer"', { st: mac.last.state, e: mac.last.error, need: mac.last.need });
  ok(same(readOr(cloudFile(mac, 'kv/projects.json')), cloudBefore) && mac.json('kv/projects.json').list[0].name === 'Mac while old', 'versions: it wrote nothing to the cloud; its own edit waits on the Mac');
  mac.e = mac.make({ format: Hard.FORMAT + 2 });
  ok(await T.converge(w) > 0 && pc.json('kv/projects.json').list[0].name === 'Mac while old', 'versions: updated: its edit arrives', T.why(w));
});

// ---------- 7. very many small files ----------
scenario('many', async () => {
  const w = T.world('h-many');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  const N = MANY;
  // the longest the event loop was held during each phase (in the app: the main process, where the engine runs)
  const { monitorEventLoopDelay } = require('perf_hooks');
  const lag = []; const phase = async (name, fn) => { const h = monitorEventLoopDelay({ resolution: 5 }); h.enable(); const t0 = Date.now(); const r = await fn(); h.disable(); lag.push({ name, ms: Date.now() - t0, maxLag: Math.round(h.max / 1e6) }); return r; };
  let t = Date.now();
  const dirs = new Set();
  for (let i = 0; i < N; i++) { const d = path.join(pc.data, 'workspace', `proj${i % 50}`, `d${Math.floor(i / 1000)}`); if (!dirs.has(d)) { raw.mkdirSync(d, { recursive: true }); dirs.add(d); } raw.writeFileSync(path.join(d, `f${i}.txt`), `small file ${i}\n`); }
  const made = Date.now() - t;
  t = Date.now(); const r1 = await phase('first', () => pc.e.pass()); const first = Date.now() - t;
  ok(r1.last.pushed >= N && !r1.pending, `many: the PC's first pass sends ${N} files (${(first / 1000).toFixed(1)} s)`, { pushed: r1.last.pushed, pending: r1.pending });
  t = Date.now(); const r2 = await phase('steady', () => pc.e.pass()); const steady = Date.now() - t;
  ok(!r2.pending && r2.last.pushed === 0, `many: a pass with nothing changed (${(steady / 1000).toFixed(1)} s)`);
  pc.view.tick(); mac.view.tick(); w.clock.advance(3000);
  t = Date.now(); const r3 = await phase('join', () => mac.e.pass()); const join = Date.now() - t;
  ok(r3.last.pulled >= N, `many: the Mac joins: ${N} files down (${(join / 1000).toFixed(1)} s)`, r3.last);
  // a folder of 1,000 files renamed (×5 folders): moved in the cloud in one pass, not deleted + sent again
  for (let k = 0; k < 5; k++) raw.renameSync(path.join(pc.data, 'workspace', `proj${k}`), path.join(pc.data, 'workspace', `proj${k}-renamed`));
  const moved = Math.ceil(N / 50) * 5;
  t = Date.now(); const r4 = await phase('rename', () => pc.e.pass()); const ren = Date.now() - t;
  ok(r4.last.renamed === moved && r4.last.pushed === 0 && r4.last.deletedThere === 0, `many: ${moved} files in renamed folders moved in the cloud in one pass (${(ren / 1000).toFixed(1)} s)`, r4.last);
  const perK = (ms) => ms / (N / 1000);
  console.log(`  many: ${N} files · made ${made} ms · first pass ${first} ms · steady ${steady} ms · Mac join ${join} ms · rename of ${moved} ${ren} ms (per 1,000 files: first ${perK(first).toFixed(0)} ms, steady ${perK(steady).toFixed(0)} ms)`);
  console.log(`  many: longest event-loop stall per phase: ${lag.map((x) => `${x.name} ${x.maxLag} ms`).join(' · ')}`);
  ok(perK(steady) < 600, `many: steady pass under 600 ms per 1,000 files in the simulator (${perK(steady).toFixed(0)} ms)`);
  const worst = Math.max(...lag.map((x) => x.maxLag));
  ok(worst < Math.max(150, N / 500), `many: the event loop is never held long (worst ${worst} ms; budget ${Math.max(150, N / 500)} ms)`, lag);
  ok(ren < Math.max(5000, first), `many: the renamed folders take no longer than the first pass (${ren} ms vs ${first} ms)`);
});

// ---------- 8. the computer sleeps ----------
scenario('sleep', async () => {
  const w = T.world('h-sleep');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin', partialDown: 64 * 1024, downTicks: 2 });
  pc.write('chats/x.json', T.chat('x', [T.msg('user', 1, 'to delete')]));
  pc.write('chats/y.json', T.chat('y', [T.msg('user', 1, 'kept')]));
  ok(await T.converge(w) > 0, 'sleep: first sync', T.why(w));
  // a) a download cut in half by the Mac going to sleep (its cloud client stops too) for 8 hours
  const big = Buffer.alloc(400 * 1024, 9); big[5] = 1;
  pc.write('attachments/song.wav', big);
  await T.round(w, { order: [pc, mac] }); pc.view.tick(); mac.view.tick(); // the PC sends it; the Mac's cloud client writes the first half
  ok(raw.existsSync(cloudFile(mac, 'attachments/song.wav')) && raw.statSync(cloudFile(mac, 'attachments/song.wav')).size < big.length, 'sleep: the Mac has half the file in its cloud folder');
  mac.view.online = false; // asleep: its cloud client stops mid-file
  for (let i = 0; i < 3; i++) { w.clock.advance(3000); await mac.e.pass(); } // seen short: its "still arriving" clock runs
  w.clock.advance(8 * 3600000); mac.e.woke(8 * 3600000); // eight hours later (syncmain tells the engine how long it slept)
  await mac.e.pass(); await mac.e.pass();
  ok(!mac.has('attachments/song.wav'), 'sleep: after 8 h asleep, the half file is still not taken as the whole one (it was: the 6 h wait counted the sleep)');
  mac.view.online = true;
  ok(await T.converge(w) > 0 && same(readOr(mac.p('attachments/song.wav')), big), 'sleep: awake, the download finishes: whole on the Mac', T.why(w));
  // b) a chat deleted on the PC; on the Mac its deletion arrived but its trash copy not yet, and the Mac sleeps 1 h
  pc.deleteChat('x');
  await T.round(w, { order: [pc, mac] }); pc.view.tick(); mac.view.tick();
  mac.view.online = false;
  const tc = cloudFile(mac, 'trash/x.json'); const hold = path.join(path.dirname(tc), '.sim-hold');
  if (raw.existsSync(tc)) raw.renameSync(tc, hold); // not arrived yet
  if (raw.existsSync(cloudFile(mac, 'chats/x.json'))) { const t2 = cloudFile(mac, 'chats/x.json'); raw.renameSync(t2, path.join(path.dirname(t2), '.sim-hold2')); }
  const ra = await mac.e.pass();
  ok(ra.waiting.some((x) => x.rel === 'chats/x.json' && x.why === 'deleting'), 'sleep: the Mac waits for the delete to arrive', ra.waiting);
  w.clock.advance(3600000); mac.e.woke(3600000);
  await mac.e.pass();
  ok(!raw.existsSync(cloudFile(mac, 'chats/x.json')), 'sleep: after an hour asleep it still waits: the deleted chat is not sent back (it came back on both computers)');
  if (raw.existsSync(hold)) raw.renameSync(hold, tc);
  const h2 = path.join(path.dirname(cloudFile(mac, 'chats/x.json')), '.sim-hold2'); if (raw.existsSync(h2)) raw.rmSync(h2);
  mac.view.online = true;
  ok(await T.converge(w) > 0 && !mac.has('chats/x.json') && !pc.has('chats/x.json') && mac.has('chats/y.json'), 'sleep: the chat stays deleted on both', T.why(w));
  // c) asleep in the middle of a pass: the PC changed a chat meanwhile; the Mac starts its pass again from a fresh look
  mac.edit('chats/y.json', (c) => { c.messages.push(T.msg('user', 10, 'mac before sleep')); });
  mac.write('attachments/a1.txt', 'a1'); mac.write('attachments/a2.txt', 'a2'); mac.write('attachments/a3.txt', 'a3');
  let slept = false;
  mac.e.set({ fault: (what) => { if (!slept && what === 'push') { slept = true; w.clock.advance(5 * 3600000); pc.edit('chats/y.json', (c) => { c.messages.push(T.msg('user', 11, 'pc while the mac slept')); }); } } });
  w.clock.advance(3000);
  await mac.e.pass();
  ok(slept && mac.e.status().woke?.ms >= 5 * 3600000, 'sleep: the jump is seen mid-pass, the pass starts again', mac.e.status().woke);
  mac.e.set({ fault: null });
  ok(await T.converge(w) > 0, 'sleep: converges', T.why(w));
  ok(T.texts(pc.json('chats/y.json')).join() === 'kept,mac before sleep,pc while the mac slept' && pc.read('attachments/a3.txt') === 'a3', 'sleep: nothing lost from either side', T.texts(pc.json('chats/y.json')));
});

// ---------- 9. secrets and per-computer settings ----------
scenario('secrets', async () => {
  const w = T.world('h-secrets');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  const KEYS = { openai: 'sk-proj-ABCDEFGHIJKLMNOPQRSTUVWXYZ012345', gh: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', anth: 'sk-ant-api03-SECRETSECRETSECRET', pem: '-----BEGIN RSA PRIVATE KEY-----\nMIIEsecret\n-----END RSA PRIVATE KEY-----\n' };
  const secretFiles = { 'workspace/app/.env': `OPENAI_API_KEY=${KEYS.openai}\n`, 'workspace/app/id_rsa': KEYS.pem, 'workspace/app/id_ed25519.pub': 'ssh-ed25519 AAAA pub', 'workspace/app/server.pem': KEYS.pem, 'workspace/app/credentials.json': `{"token":"${KEYS.gh}"}`, 'attachments/service-account-123.json': '{"private_key":"x"}', 'workspace/app/config/secrets.yaml': `key: ${KEYS.gh}\n`, 'workspace/app/my_private_key': KEYS.pem, 'workspace/app/.npmrc': '//registry/:_authToken=x', 'workspace/app/cert.p12': 'p12', 'workspace/.ssh/config': 'Host x' };
  const perComputer = { 'gpu52.json': '{"state":"failed"}', 'game-cache/budget.json': '{"clink":{}}', 'game-cache/readyspeed.json': '{}', 'creative-vst/warm.json': '{}', 'connectors.json': '{}', 'window.json': '{}', 'remote/devices.json': '[{"key":"pairing"}]', 'interop/obs.json': '{"kx":"sealed"}', 'kv/offline-queue.json': '[]', 'leavesoon/reminders.json': '[]', 'claude-flags.json': '{}', 'engine-installs.json': '{}', 'kv/speed.json': '{}' };
  const fine = { 'attachments/Pitch.key': 'keynote deck', 'workspace/app/keyboard.md': 'keys', 'workspace/app/tokenizer.js': 'x', 'attachments/password tips.md': 'tips' };
  for (const [rel, v] of Object.entries({ ...secretFiles, ...perComputer, ...fine })) pc.write(rel, v);
  raw.writeFileSync(path.join(pc.data, 'sync', 'settings.json'), JSON.stringify({ on: true, root: pc.cloudRoot, provider: 'onedrive' }));
  pc.setCfg((c) => { c.settings.openaiApiKey = KEYS.openai; c.settings.githubToken = KEYS.gh; c.settings.notes = 'plain'; c.settings.misc = { webhook: KEYS.gh, password: 'hunter2', maxTokens: 4096 }; c.agents[0].env = { ANTHROPIC_API_KEY: KEYS.anth, LANG: 'en' }; c.settings.zoom = 1.25; });
  ok(await T.converge(w) > 0, 'secrets: converges', T.why(w));
  const server = [...w.cloud.server.values()];
  const keys = server.map((x) => x.key.replace(/^Hearth\/files\//, ''));
  for (const rel of [...Object.keys(secretFiles), ...Object.keys(perComputer), 'sync/settings.json']) ok(!keys.some((k) => Sim.fold(k) === Sim.fold(rel)), `secrets: ${rel} never reaches the cloud`);
  for (const rel of Object.keys(fine)) ok(mac.has(rel), `secrets: ${rel} still syncs (not a key file)`);
  const blob = server.filter((x) => x.buf).map((x) => x.buf.toString('utf8')).join('\n');
  for (const [k, v] of Object.entries(KEYS)) ok(!blob.includes(v.split('\n')[0]), `secrets: the ${k} key isn't anywhere in the cloud`);
  ok(!blob.includes('hunter2'), 'secrets: a password field in the settings isn\'t in the cloud');
  const mc = mac.cfg();
  ok(!mc.settings.openaiApiKey && !mc.settings.githubToken && !mc.settings.misc?.password && !mc.settings.misc?.webhook && !mc.agents[0].env?.ANTHROPIC_API_KEY && mc.agents[0].env?.LANG === 'en' && mc.settings.misc?.maxTokens === 4096 && mc.settings.notes === 'plain', 'secrets: the Mac gets the settings without their secrets (maxTokens and the rest still travel)', mc.settings);
  const pcc = pc.cfg();
  ok(pcc.settings.openaiApiKey === KEYS.openai && pcc.settings.githubToken === KEYS.gh && pcc.agents[0].env.ANTHROPIC_API_KEY === KEYS.anth && pcc.settings.misc.password === 'hunter2' && pcc.settings.zoom === 1.25, 'secrets: the PC keeps its own after the round trip', pcc.settings);
  // the Mac changes a setting: the PC's secrets survive the merge
  mac.setCfg((c) => { c.settings.notes = 'from the Mac'; });
  ok(await T.converge(w) > 0 && pc.cfg().settings.notes === 'from the Mac' && pc.cfg().settings.openaiApiKey === KEYS.openai && pc.cfg().agents[0].env.ANTHROPIC_API_KEY === KEYS.anth, 'secrets: a settings change from the Mac keeps the PC\'s secrets', pc.cfg().settings);
  // a key an older version put in the cloud copy: listed with "Remove from the cloud"; removed, kept in Deleted files here
  const old = 'workspace/old/id_rsa';
  raw.mkdirSync(path.dirname(cloudFile(pc, old)), { recursive: true }); raw.writeFileSync(cloudFile(pc, old), KEYS.pem);
  await rounds(w, 3);
  ok(blockedRel(pc, old, 'secret-cloud')?.fix === 'unsecret' && blockedRel(mac, old, 'secret-cloud'), 'secrets: an old key in the cloud copy is listed on both computers, with Remove from the cloud', blocked(pc));
  const r = await pc.e.fix(old, 'unsecret');
  ok(r.ok && !raw.existsSync(cloudFile(pc, old)) && trashed(pc).some((f) => f.endsWith('id_rsa')), 'secrets: removed from the cloud folder, kept in this computer\'s Deleted files', r);
  await rounds(w, 3);
  ok(![...w.cloud.server.values()].some((x) => /id_rsa$/.test(x.key)) && !blockedRel(mac, old), 'secrets: gone from the cloud everywhere', [...w.cloud.server.keys()].filter((k) => /id_rsa/.test(k)));
  // the rules on their own
  ok(Hard.secretKey('apiKey') && Hard.secretKey('OPENAI_API_KEY') && Hard.secretKey('githubToken') && Hard.secretKey('client_secret') && !Hard.secretKey('maxTokens') && !Hard.secretKey('hotkey') && !Hard.secretKey('quickIdeaKey') && !Hard.secretKey('tokenBudget'), 'secrets: field names (maxTokens, hotkey, quickIdeaKey stay)');
  ok(Hard.secretName('a/.env.local') && Hard.secretName('x/id_rsa') && !Hard.secretName('a/Pitch.key') && Hard.secretName('a/server.key') && !Hard.secretName('a/keys.md') && !Hard.secretName('kv/projects.json'), 'secrets: file names (Keynote stays)');
});

// ---------- 9b. Windows: the cloud-attributes probe at scale ----------
scenario('winprobe', async () => {
  const CF = require('../cloud-files');
  // batches: each PowerShell call gets at most 1,500 paths; a batch that fails marks only its own paths unknown
  const calls = [];
  const fake = (_exe, _args, _o, done) => ({ stdin: { on() {}, end(text) { const ps = JSON.parse(text); calls.push(ps.length); setImmediate(() => (calls.length === 2 ? done(Object.assign(new Error('timeout'), { killed: true })) : done(null, JSON.stringify(ps.map((p) => ({ path: p, attributes: 0x20 })))))); } } });
  const paths = Array.from({ length: 5000 }, (_, i) => `C:\\Users\\q\\OneDrive\\Hearth\\files\\workspace\\f${i}.txt`);
  const r = await CF.attributes(paths, { platform: 'win32', execFile: fake });
  ok(calls.length === 4 && calls.every((n) => n <= 1500), 'winprobe: 5,000 files asked in batches of at most 1,500 (one call each)', calls);
  ok(paths.slice(0, 1500).every((p) => !CF.pending(r.get(p))) && paths.slice(1500, 3000).every((p) => CF.pending(r.get(p))) && paths.slice(3000).every((p) => !CF.pending(r.get(p))), 'winprobe: a batch that fails leaves only its own files unknown (was: every file, so nothing synced)');
  // the engine: a PC's steady pass asks about no unchanged file
  const w = T.world('h-winprobe');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  for (let i = 0; i < 300; i++) mac.write(`workspace/p/f${i}.txt`, `file ${i}`);
  ok(await T.converge(w) > 0, 'winprobe: 300 files reach the PC', T.why(w));
  let asked = 0; const probe = pc.view.attributes;
  pc.e = pc.make({ cloudAttributes: async (ps) => { asked += ps.length; return probe(ps); } });
  await pc.e.pass(); asked = 0; await pc.e.pass();
  ok(asked === 0, `winprobe: a steady pass asks Windows about no unchanged cloud file (${asked} asked; was every file, each pass)`);
  mac.write('workspace/p/f1.txt', 'changed on the Mac'); mac.write('workspace/p/new.txt', 'new');
  await T.round(w, { order: [mac, pc] }); mac.view.tick(); pc.view.tick(); asked = 0; w.clock.advance(3000); await pc.e.pass();
  ok(asked >= 2 && asked <= 4 && pc.read('workspace/p/f1.txt') === 'changed on the Mac' && pc.has('workspace/p/new.txt'), `winprobe: only the changed / new ones are asked about, and they arrive (${asked} asked)`);
});

// ---------- 10. error words: every code the engine sends has the panel's words ----------
scenario('classify', async () => {
  const c = (code, o) => Hard.classify(Object.assign(new Error(code), { code }), o);
  ok(c('EBUSY') === 'locked' && c('EPERM') === 'locked' && c('EPERM', { readOnly: true }) === 'read-only' && c('ENOSPC') === 'disk-full' && c('EDQUOT') === 'disk-full' && c('ENAMETOOLONG') === 'too-long' && c('EIO') === 'drive' && c('ENOENT') === 'gone' && c('EINVAL') === 'bad-name', 'classify: fs codes → plain categories');
  const panel = fs.readFileSync(path.join(__dirname, '..', 'sync-panel.js'), 'utf8');
  for (const why of Object.keys(Hard.BLOCK)) ok(new RegExp(`['"]?${why.replace('-', '\\-')}['"]?\\s*:`).test(panel.slice(panel.indexOf('BLOCKED'))), `classify: the panel has words for "${why}"`);
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); }
    Sim.unlock(); Sim.T.hook = null; Sim.T.winReadOnly = false; Sim.T.quotas.clear();
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  console.log(`\nsynchard74: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  const w = T.world('h-end'); if (!argv.includes('--keep')) fs.rmSync(path.dirname(w.dir), { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
