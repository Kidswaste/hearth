#!/usr/bin/env node
// (round 111, syncfix111) Three engine-side items left by round 110 (docs/upgrades/syncaudit110.md, "For Codex"), each
// reproduced through the two-computer simulator (dev/sync-sim.js, the sync72 harness), on the main side and the store
// thread, and with the previous release (sync-engine.js before this round, from git) on the Mac:
//   restore   · a chat deleted on the Mac (moved to Recently deleted), brought back on the PC from Deleted files through
//               the engine's restore: it is back on both computers and NOT left in Recently deleted, here, in the cloud
//               copy or on the Mac; the Recently deleted copy waits in Deleted files (nothing lost)
//   recovery  · "the version before the last change" copies: none after a first sync of a joined Hearth where every
//               store merged keeping everything (one per store before), none when a message only arrives; still made
//               when the old version holds something the new one doesn't (a title changed, an item removed), and
//               restorable; old ones whose content is all in the current file are marked inside: true for the panel
//   waits     · a file held by another program (EBUSY; EPERM on a PC) or a drive that didn't answer (EIO) carries
//               waits: true on its blocked entry; a read-only file doesn't; Fix.waitsOf reads an older engine's entries
//   node dev/syncfix111-test.js [--keep] [--only restore|recovery|waits|mixed]
// Never touches real data: temp folders only (sync72-test's own, under the system's temp folder).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) { passes += 1; console.log(`✓ ${what}`); } else { failures += 1; console.log(`✖ ${what}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`); } };
function rmTemp(d) { // only a test's own temp folder: directly under the system's temp folder, named by a test
  const r = path.resolve(d);
  if (path.dirname(r) !== path.resolve(os.tmpdir()) || !/^hearth-sync72-/.test(path.basename(r))) { console.log(`  (not removed: ${r})`); return; }
  fs.rmSync(r, { recursive: true, force: true });
}

const T = require('./sync72-test');
const Sim = require('./sync-sim');
const Fix = require('../sync-fix111');
const raw = Sim.raw;
const cloudHas = (m, rel) => raw.existsSync(path.join(m.cloudRoot, 'Hearth', 'files', ...rel.split('/')));
const recoveries = async (m) => (await m.e.trash()).filter((t) => t.recovery).map((t) => t.rel).sort();
const rounds = async (w, n) => { for (let i = 0; i < n; i++) await T.round(w); };

// ---------- 1. a deleted chat restored from Deleted files leaves Recently deleted ----------
async function restoreCase(tag, o = {}) {
  const w = T.world(`sf111-restore-${tag}`);
  const pc = T.computer(w, 'PC', { platform: 'win32', thread: o.thread });
  const mac = (o.macT || T).computer(w, 'Mac', { platform: 'darwin', thread: o.macT ? false : o.thread });
  pc.write('chats/c1.json', T.chat('c1', [T.msg('user', 1, 'hello')], { title: 'Mac sketchbook' }));
  ok(await T.converge(w) > 0, `restore ${tag}: first sync`, T.why(w));
  mac.edit('chats/c1.json', (c) => { c.title = 'Mac sketchbook (renamed)'; c.updatedAt = 2; c.messages.push(T.msg('assistant', 2, 'from the Mac')); });
  ok(await T.converge(w) > 0, `restore ${tag}: the Mac's change arrives`, T.why(w));
  mac.deleteChat('c1');
  ok(await T.converge(w) > 0, `restore ${tag}: the Mac's delete arrives`, T.why(w));
  ok(!pc.has('chats/c1.json') && pc.has('trash/c1.json'), `restore ${tag}: on the PC the chat is in Recently deleted (data/trash)`, { chat: pc.has('chats/c1.json'), trash: pc.has('trash/c1.json') });
  const row = (await pc.e.trash()).find((t) => t.rel === 'chats/c1.json');
  ok(Boolean(row), `restore ${tag}: Deleted files has a version of the chat`, await pc.e.trash());
  if (!row) return;
  const r = await pc.e.restore(row.id);
  ok(r.ok && pc.has('chats/c1.json'), `restore ${tag}: Restore puts the chat back on the PC`, r);
  ok(!pc.has('trash/c1.json'), `restore ${tag}: and takes it out of the PC's Recently deleted (it was left there)`);
  const kept = (await pc.e.trash()).find((t) => t.rel === 'trash/c1.json' && t.where === 'here');
  let keptChat = null; try { keptChat = JSON.parse(raw.readFileSync(path.join(pc.e.stateDir, 'trash', ...kept.id.replace(/^here:/, '').split('/')), 'utf8')); } catch { /* none */ }
  ok(keptChat?.title === 'Mac sketchbook (renamed)' && T.texts(keptChat).join() === 'hello,from the Mac', `restore ${tag}: the Recently deleted copy (the newer version) waits in Deleted files: nothing lost`, kept || null);
  ok(await T.converge(w) > 0, `restore ${tag}: converges after the restore`, T.why(w));
  ok(pc.has('chats/c1.json') && mac.has('chats/c1.json') && cloudHas(pc, 'chats/c1.json'), `restore ${tag}: the chat is back on both computers and in the cloud copy`);
  ok(!pc.has('trash/c1.json') && !mac.has('trash/c1.json') && !cloudHas(pc, 'trash/c1.json') && !cloudHas(mac, 'trash/c1.json'), `restore ${tag}: no copy left in Recently deleted: PC, Mac, cloud copy`, { pc: pc.has('trash/c1.json'), mac: mac.has('trash/c1.json'), cloud: cloudHas(pc, 'trash/c1.json') });
  ok((await mac.e.trash()).some((t) => t.rel === 'trash/c1.json'), `restore ${tag}: the Mac's Recently deleted copy is in its Deleted files (moved, not removed)`);
  await rounds(w, 3);
  ok(pc.has('chats/c1.json') && mac.has('chats/c1.json'), `restore ${tag}: it stays back (not deleted again)`);
}

// ---------- 2. recovery copies ----------
async function recoveryCase(thread) {
  const tag = thread ? 'store thread' : 'main side';
  const w = T.world(`sf111-recovery-${thread ? 't' : 'm'}`);
  const pc = T.computer(w, 'PC', { platform: 'win32', thread });
  const mac = T.computer(w, 'Mac', { platform: 'darwin', thread });
  // two Hearths joined: each has its own chats and stores, some stores on both
  pc.write('chats/a.json', T.chat('a', [T.msg('user', 1, 'PC hello')]));
  pc.write('kv/notes.json', { a: 1, text: 'PC line' });
  pc.write('kv/list.json', { items: [{ id: 'x', name: 'X' }], updatedAt: 10 });
  pc.write('kv/projects.json', { v: 1, list: [{ id: 'p1', name: 'My game' }] });
  mac.write('chats/b.json', T.chat('b', [T.msg('user', 1, 'Mac hello')]));
  mac.write('kv/notes.json', { a: 1, c: 2 });
  mac.write('kv/list.json', { items: [{ id: 'y', name: 'Y' }], updatedAt: 20 });
  mac.write('kv/projects.json', { v: 1, list: [{ id: 'p2', name: 'Mac game' }] });
  ok(await T.converge(w) > 0, `recovery ${tag}: first sync of two joined Hearths`, T.why(w));
  const lst = pc.json('kv/list.json');
  ok(lst?.items?.length === 2 && pc.json('kv/projects.json')?.list?.length === 2 && pc.json('kv/notes.json')?.c === 2 && mac.json('kv/notes.json')?.text === 'PC line', `recovery ${tag}: every store merged keeping both computers' things`, { lst, p: pc.json('kv/projects.json') });
  const r1 = { pc: await recoveries(pc), mac: await recoveries(mac) };
  ok(!r1.pc.length && !r1.mac.length, `recovery ${tag}: no "version before the last change" copies after the first sync (all of each is in the merge)`, r1);
  // day to day: a message arrives (the chat's time stamp moves on): the old version is all in the new one
  mac.edit('chats/a.json', (c) => { c.updatedAt = 5; c.messages.push(T.msg('assistant', 2, 'Mac reply')); });
  ok(await T.converge(w) > 0, `recovery ${tag}: a message from the Mac arrives`, T.why(w));
  ok(T.texts(pc.json('chats/a.json')).join() === 'PC hello,Mac reply' && !(await recoveries(pc)).includes('chats/a.json'), `recovery ${tag}: no copy when a message only arrives`, await recoveries(pc));
  // the old version holds something the new one doesn't: the copy is made, as before, and restores
  mac.edit('chats/a.json', (c) => { c.title = 'Renamed on the Mac'; });
  mac.edit('kv/list.json', (v) => { v.items = v.items.filter((x) => x.id !== 'x'); });
  ok(await T.converge(w) > 0, `recovery ${tag}: a title changed and an item removed on the Mac arrive`, T.why(w));
  const r2 = await recoveries(pc);
  ok(r2.includes('chats/a.json') && r2.includes('kv/list.json'), `recovery ${tag}: copies kept for the chat (its old title) and the list (the removed item)`, r2);
  const oldChat = JSON.parse(raw.readFileSync(path.join(pc.e.stateDir, 'recovery', 'chats', 'a.json'), 'utf8'));
  const oldList = JSON.parse(raw.readFileSync(path.join(pc.e.stateDir, 'recovery', 'kv', 'list.json'), 'utf8'));
  ok(oldChat.title === 'Chat a' && oldList.items.some((x) => x.id === 'x'), `recovery ${tag}: they hold what only they have`, { oldChat: oldChat.title, oldList });
  const row = (await pc.e.trash()).find((t) => t.recovery && t.rel === 'kv/list.json');
  const back = await pc.e.restore(row.id, { replace: true });
  ok(back.ok && pc.json('kv/list.json').items.some((x) => x.id === 'x'), `recovery ${tag}: and Restore brings the removed item back`, back);
  // an old copy (from before this round) whose content is all in the current file: marked, not removed
  raw.mkdirSync(path.join(pc.e.stateDir, 'recovery', 'kv'), { recursive: true });
  raw.writeFileSync(path.join(pc.e.stateDir, 'recovery', 'kv', 'notes.json'), JSON.stringify({ a: 1 }));
  const rows = await pc.e.trash();
  const notes = rows.find((t) => t.recovery && t.rel === 'kv/notes.json'); const chatRow = rows.find((t) => t.recovery && t.rel === 'chats/a.json');
  ok(notes?.inside === true && !chatRow?.inside, `recovery ${tag}: an old copy already inside the current file is marked inside (the panel folds it); one with something of its own isn't`, { notes, chatRow });
  ok(raw.existsSync(path.join(pc.e.stateDir, 'recovery', 'kv', 'notes.json')), `recovery ${tag}: listing removes nothing`);
}
function insideUnit() {
  ok(Fix.inside({ a: 1 }, { a: 1, b: 2 }) && !Fix.inside({ a: 1, b: 2 }, { a: 1 }) && !Fix.inside({ a: 1 }, { a: 2 }), 'inside: keys kept / removed / changed');
  ok(Fix.inside({ updatedAt: 1, t: 'x' }, { updatedAt: 9, t: 'x' }) && !Fix.inside({ name: 'a' }, { name: 'b' }) && !Fix.inside({ last: 'words' }, { last: 'other' }), 'inside: a time moving on is not data; a name or text is');
  ok(Fix.inside({ m: [{ role: 'user', at: 1, text: 'a' }] }, { m: [{ role: 'user', at: 1, text: 'a' }, { role: 'assistant', at: 2, text: 'b' }] }) && !Fix.inside({ m: [{ role: 'user', at: 1, text: 'a' }] }, { m: [{ role: 'user', at: 1, text: 'edited' }] }), 'inside: messages added keep it inside; one edited does not');
  ok(Fix.inside(['a', 'b'], ['b', 'c', 'a']) && !Fix.inside(['a', 'b'], ['a']) && !Fix.inside([{ x: 1 }], [{ x: 2 }]) && Fix.inside([], [1]), 'inside: plain lists by value');
  ok(Fix.inside({ n: 5 }, { n: 5 }) && !Fix.inside({ n: 5 }, { n: 6 }), 'inside: a count that changes keeps the copy');
  ok(!Fix.textInside('{broken', { a: 1 }, {}) && !Fix.textInside('{"a":1}', undefined, {}), 'textInside: unreadable or nothing to compare → the copy is made');
}

// ---------- 3. files that only wait ----------
async function waitsCase() {
  const w = T.world('sf111-waits');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  pc.write('attachments/held.txt', 'one'); pc.write('attachments/drive.txt', 'one'); pc.write('attachments/manual.pdf', 'v1');
  ok(await T.converge(w) > 0, 'waits: first sync', T.why(w));
  mac.write('attachments/held.txt', 'two'); mac.write('attachments/drive.txt', 'two'); mac.write('attachments/manual.pdf', 'v2');
  Sim.lock(pc.p('attachments/held.txt'), 'EPERM'); Sim.lock(pc.p('attachments/drive.txt'), 'EIO');
  Sim.T.winReadOnly = true; fs.chmodSync(Sim.ci(pc.p('attachments/manual.pdf')), 0o444);
  try {
    await rounds(w, 5);
    const bl = pc.e.status().blocked || [];
    const by = (rel) => bl.find((b) => b.rel === rel);
    ok(by('attachments/held.txt')?.why === 'locked' && by('attachments/held.txt')?.waits === true, 'waits: a file another program holds (EPERM on a PC) is marked waits: true by the engine', bl);
    ok(by('attachments/drive.txt')?.why === 'drive' && by('attachments/drive.txt')?.waits === true, 'waits: a drive that didn\'t answer (EIO) is marked waits: true', bl);
    ok(by('attachments/manual.pdf')?.why === 'read-only' && !by('attachments/manual.pdf')?.waits, 'waits: a read-only file (needs Allow changes) is not', bl);
    ok(bl.filter(Fix.waitsOf).length === 2, 'waitsOf: two wait', bl);
  } finally { Sim.unlock(); Sim.T.winReadOnly = false; try { fs.chmodSync(Sim.ci(pc.p('attachments/manual.pdf')), 0o644); } catch { /* */ } }
  ok(await T.converge(w) > 0 && pc.read('attachments/held.txt') === 'two' && !(pc.e.status().blocked || []).length, 'waits: once free, it syncs by itself and nothing is listed', T.why(w));
  ok(Fix.waitsOf({ why: 'locked' }) && Fix.waitsOf({ why: 'drive' }) && !Fix.waitsOf({ why: 'read-only' }) && Fix.waitsOf({ why: 'other', waits: true }) && !Fix.waitsOf({ why: 'locked', waits: false }), 'waitsOf: the engine\'s mark first, an older engine\'s entries by why');
  ok(Fix.waits('other', 'EHELD') && Fix.waits('locked') && !Fix.waits('denied', 'EPERM') && !Fix.waits('disk-full', 'ENOSPC'), 'waits: EHELD waits; macOS refusing (denied) and a full disk don\'t');
}

// ---------- mixed: the previous release on the Mac ----------
async function mixed() {
  let prev = null;
  try {
    const first = execFileSync('git', ['log', '--format=%H', '--grep=syncfix111', '--', 'sync-engine.js'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean).pop();
    prev = execFileSync('git', ['show', `${first || 'HEAD'}${first ? '^' : ''}:sync-engine.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { prev = null; }
  if (!prev || prev.includes('syncfix111')) { console.log('  (no git history here: the mixed-version case not run)'); return; }
  const file = path.join(ROOT, '.syncfix111-prev-sync-engine.js'); // beside sync-engine.js (its requires are relative); removed below
  fs.writeFileSync(file, prev);
  const key = require.resolve('../sync-engine'); const tkey = require.resolve('./sync72-test');
  const real = require.cache[key].exports; const realT = require.cache[tkey];
  let Tp;
  try {
    require.cache[key].exports = require(file); delete require.cache[tkey];
    Tp = require('./sync72-test'); // its createEngine: the previous release's
  } finally { require.cache[key].exports = real; require.cache[tkey] = realT; fs.rmSync(file, { force: true }); delete require.cache[file]; }
  try {
    await restoreCase('mixed (previous release on the Mac)', { macT: Tp });
  } finally { rmTemp(path.dirname(Tp.world('sf111-end').dir)); }
}

async function main() {
  const t0 = Date.now();
  const cases = [['restore', () => restoreCase('main side')], ['restore', () => restoreCase('store thread', { thread: true })], ['recovery', insideUnit], ['recovery', () => recoveryCase(false)], ['recovery', () => recoveryCase(true)], ['waits', waitsCase], ['mixed', mixed]];
  for (const [name, fn] of cases) {
    if (only && only !== name) continue;
    try { await fn(); } catch (err) { ok(false, `${name} threw`, err.stack); }
    Sim.T.hook = null; Sim.unlock();
  }
  if (!argv.includes('--keep')) rmTemp(path.dirname(T.world('sf111-end').dir));
  console.log(`\nsyncfix111: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
