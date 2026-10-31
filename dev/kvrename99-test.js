#!/usr/bin/env node
// (round 99, kvrename99) "Rename for Windows" (round 74) and Hearth's own files, through the two-computer simulator
// (dev/sync-sim.js, the worlds of dev/sync72-test.js). A kv store's name is the app's id for it: renamed, the app
// never reads it again (projects, boards, Lab presets, settings seem to vanish). Cases:
//   repro      a PC whose folders' path is long (~180 characters) and a kv store whose name is too long for it: the Mac
//              never offers "Rename for Windows" for it (it said so before this round, and the click cut the store
//              off: Hearth then read it as missing, the board came up empty); it says the PC's folder path is too long;
//              the PC says so too, with what to move; the owner's own too-long file still gets its Rename button
//   refuse     fix(rel, 'rename') refuses every Hearth-named file (kv, chats, deleted chats, the data folder's own
//              files, templates, show listings, the tickets' index): nothing renamed, nothing moved
//   older      the other computer on the previous release does Rename for Windows on a Hearth-named store that already
//              synced: this computer never follows that rename (the store stays where the app reads it, the new name is
//              there too, both computers end the same, nothing lost); the app's own moves (a chat deleted to trash/ and
//              restored) are still followed; a kv store renamed there comes back there by itself
//   oldheld    an older Hearth renames a kv store it held back (never in the cloud): its copy under the new name
//              reaches this computer, nothing is lost; once updated, the Mac offers no rename for the store again
//   case       a case-only rename of a Hearth-named store on Mac / Windows disks (the same file there): followed, the
//              store still reads; on a disk that minds case it would not be (rules)
//   rules      sync-own.js: which files are Hearth-named, which moves are followed, the panel words for each new code
// Never touches real data or a real cloud drive: temp folders only (TMPDIR).
//   node dev/kvrename99-test.js [--only name,name] [--verbose]
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./sync72-test');
const Sim = require('./sync-sim');
const Hard = require('../sync-hard');
const Own = require('../sync-own');
const SS = require('../scenesafe-core');

const argv = process.argv.slice(2);
const ONLY = (() => { const i = argv.indexOf('--only'); return i >= 0 ? argv[i + 1].split(',') : null; })();
const VERBOSE = argv.includes('--verbose');
let passes = 0; let failures = 0;
const ok = (c, what, detail) => { if (c) { passes += 1; if (VERBOSE) console.log(`  ok ${what}`); } else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500)}` : ''}`); } };
const say = (s) => console.log(`  · ${s}`);
const raw = Sim.raw;
const blocked = (m) => m.e.status().blocked || [];
const blockedRel = (m, rel) => blocked(m).find((b) => b.rel === rel);
const has = (v, s) => JSON.stringify(v ?? null).includes(s);
async function rounds(w, n) { for (let i = 0; i < n; i++) await T.round(w); }
// what Hearth's kv read says for a store (store.js readKV → scenesafe-core readStatus): 'ok' | 'missing' | 'unreadable'
const appRead = (m, name) => SS.readStatus(fs, m.p(`kv/${name}.json`));
const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// a world whose folders' paths are long: the PC's data folder ≈ 180 characters (the round-98 note: "a data folder path
// over ~170 characters"); the cloud folder's is about as long (+ "\Hearth\files\" when Windows counts it)
let rootDir = null;
function longWorld(tag) {
  if (!rootDir) { const w0 = T.world('kr99-probe'); rootDir = path.dirname(w0.dir); }
  const room = 180 - (rootDir.length + 1 + '/PC/data'.length) - tag.length - 1;
  const name = `${tag}-${'Projects and client folders '.repeat(10).replace(/ /g, '_').slice(0, Math.max(8, room))}`;
  return T.world(name);
}
const BOARD = `board-${'a'.repeat(74)}`; // 80 characters: the longest a kv store's name can be (store.js SAFE_ID)
const BOARD_REL = `kv/${BOARD}.json`;
const card = (id, text) => ({ id, text });

// ---------- 1. the case round 98 left: a kv store too long for the PC's folders ----------
scenario('repro', async () => {
  const w = longWorld('repro');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  ok(pc.data.length >= 175 && pc.data.length <= 185, `repro: the PC's data folder path is long (${pc.data.length} characters)`);
  pc.write('chats/a.json', T.chat('a', [T.msg('user', 1, 'hi')]));
  ok(await T.converge(w) > 0, 'repro: first sync', T.why(w));
  const len = Own.rootLen(pc.data, pc.cloudRoot);
  ok(Hard.winBad(BOARD_REL, { rootLen: len })?.why === 'win-long', `repro: "${BOARD_REL.slice(0, 24)}…" is too long for the PC (${len} + 1 + ${BOARD_REL.length} > ${Hard.WIN_MAX})`);
  // a board made on the Mac, and an owner's capture whose name is too long for the PC as well
  mac.write(BOARD_REL, { id: BOARD.slice(6), items: [card('c1', 'a card on the board')] });
  const shot = `captures/${'Long capture name from the Mac '.repeat(3).trim()}.png`;
  mac.write(shot, 'png bytes');
  await rounds(w, 5);
  const b = blockedRel(mac, BOARD_REL);
  say(`the Mac's sync panel for the board: ${JSON.stringify(b && { why: b.why, fix: b.fix, over: b.over })}`);
  ok(b && b.why === 'win-long-app', 'repro: the board is said to be one of Hearth\'s own files whose path is too long for the PC (win-long-app)', b);
  ok(b && !b.fix, 'repro: no "Rename for Windows" for it (was: fix "rename", and the click cut the board off)', b);
  ok(b && b.over > 0, 'repro: how many characters too long is known (for the words)', b);
  ok(appRead(mac, BOARD).state === 'ok' && has(appRead(mac, BOARD).value, 'a card on the board'), 'repro: Hearth on the Mac reads the board');
  // the click anyway (an older window, a stale panel): refused, the board where the app reads it
  const r = await mac.e.fix(BOARD_REL, 'rename');
  say(`Rename for Windows on the board: ${JSON.stringify(r)}`);
  ok(!r.ok && r.error === Own.REFUSE, 'repro: fix(…, "rename") on the board is refused, in plain words', r);
  const after = appRead(mac, BOARD);
  say(`then Hearth reads the board: ${after.state}${after.state === 'missing' ? ' (the board comes up empty: cut off)' : ''}`);
  ok(after.state === 'ok' && has(after.value, 'a card on the board'), 'repro: the board is still read by Hearth after the click (was: "missing", an empty board)', after.state);
  ok(raw.readdirSync(mac.p('kv')).filter((f) => f.startsWith('board-')).length === 1, 'repro: no second copy under another name', raw.readdirSync(mac.p('kv')));
  // the owner's own capture: Rename for Windows as before (its links follow)
  const s = blockedRel(mac, shot);
  ok(s && s.why === 'win-long' && s.fix === 'rename', 'repro: the owner\'s too-long capture still has "Rename for Windows" (unchanged)', s);
  // the PC: says its folder path is too long, which folder, and how many of Hearth's files it keeps from it
  await rounds(w, 4);
  const lp = pc.e.status().longPath;
  say(`the PC's sync panel: ${JSON.stringify(lp)}`);
  ok(lp && lp.n >= 1 && lp.over > 0 && ['data', 'cloud'].includes(lp.which) && lp.by === 'Mac' && lp.sample.includes(BOARD_REL), 'repro: the PC says its folder path is too long for Hearth\'s files the Mac keeps back (with which folder to move)', lp);
  ok(!mac.e.status().longPath, 'repro: the Mac has no "this computer\'s path" note (its own folders aren\'t the problem)', mac.e.status().longPath);
  ok(!pc.has(BOARD_REL) && mac.has(BOARD_REL), 'repro: the board stays on the Mac meanwhile (held back for the PC, never lost)');
  // the owner moves the PC's folders somewhere shorter (here: the PC's record says so): the board reaches the PC
  const rec = path.join(mac.cloudRoot, 'Hearth', '.sync', 'machines', `${pc.e.machine().id}.json`);
  const short = (j) => ({ ...j, dataDir: 'C:\\Hearth\\data', cloudRoot: 'C:\\Users\\me\\OneDrive' });
  for (const f of [rec, path.join(pc.cloudRoot, 'Hearth', '.sync', 'machines', `${pc.e.machine().id}.json`)]) { try { raw.writeFileSync(f, JSON.stringify(short(JSON.parse(raw.readFileSync(f, 'utf8'))))); } catch { /* not there */ } }
  await mac.e.pass();
  ok(!blockedRel(mac, BOARD_REL), 'repro: with the PC\'s folders shorter, nothing is held back on the Mac', blocked(mac));
  ok(!Own.longHere({ dataDir: 'C:\\Hearth\\data', cloudRoot: 'C:\\Users\\me\\OneDrive', rels: [[BOARD_REL]] }), 'repro: and the PC\'s note goes (a short path fits every Hearth file name)');
});

// ---------- 2. fix(rel, 'rename') never renames a Hearth-named file ----------
scenario('refuse', async () => {
  const w = T.world('kr99-refuse');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  pc.write('chats/a.json', T.chat('a', [T.msg('user', 1, 'hi')]));
  ok(await T.converge(w) > 0, 'refuse: first sync', T.why(w));
  const own = { 'kv/projects.json': { list: [] }, 'chats/c1.json': T.chat('c1', [T.msg('user', 2, 'x')]), 'trash/c2.json': T.chat('c2', []), 'memory.json': { facts: [] },
    'templates/t1/template.json': { id: 't1' }, 'templates/t1/files/a:b.png': 'png', 'showsync/venues.json': { v: 1 }, 'tickets/index.json': { list: [] }, 'kv/con.json': { x: 1 } };
  for (const [rel, v] of Object.entries(own)) mac.write(rel, v);
  for (const rel of Object.keys(own)) {
    const before = mac.read(rel);
    const r = await mac.e.fix(rel, 'rename');
    ok(!r.ok && r.error === Own.REFUSE && mac.read(rel) === before, `refuse: "${rel}" is not renamed (Hearth finds it by this name)`, r);
  }
  // kv/con.json: a name Windows keeps for itself, on a Hearth store: said, never renamed
  await rounds(w, 3);
  const c = blockedRel(mac, 'kv/con.json');
  ok(c && c.why === 'win-name-app' && !c.fix, 'refuse: a Hearth store with a name Windows keeps for itself: said (win-name-app), no rename button', c);
  // an owner's file: renamed as before
  mac.write('attachments/a:b.txt', 'mine');
  const r = await mac.e.fix('attachments/a:b.txt', 'rename');
  ok(r.ok && r.to === 'attachments/a-b.txt' && mac.has('attachments/a-b.txt'), 'refuse: an owner\'s attachment is still renamed for Windows', r);
});

// ---------- 3. the other computer on the previous release ----------
// The Mac's "older Hearth" is played by hand: the rename its Rename for Windows did (sync-hard winSafeRel), on its disk.
scenario('older', async () => {
  const w = T.world('kr99-older');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  const LIST = 'showsync/venues-paris.json'; const KV = 'kv/board-b1.json';
  pc.write(LIST, { venues: [{ id: 'v1', name: 'Le Trianon' }] });
  pc.write(KV, { id: 'b1', items: [card('c1', 'a card')] });
  pc.write('chats/a.json', T.chat('a', [T.msg('user', 1, 'hi')]));
  pc.write('chats/b.json', T.chat('b', [T.msg('user', 1, 'hello')]));
  ok(await T.converge(w) > 0, 'older: first sync', T.why(w));
  // the older Hearth on the Mac renames both "for Windows" (as it would with a long PC path)
  const NEWLIST = Hard.winSafeRel(LIST, { rootLen: 245 }); const NEWKV = Hard.winSafeRel(KV, { rootLen: 245 });
  ok(NEWLIST !== LIST && NEWKV !== KV, `older: the older Hearth's new names: "${NEWLIST}", "${NEWKV}"`);
  for (const [a, b] of [[LIST, NEWLIST], [KV, NEWKV]]) { raw.mkdirSync(path.dirname(mac.p(b)), { recursive: true }); raw.renameSync(mac.p(a), mac.p(b)); }
  pc.pulled.length = 0;
  ok(await T.converge(w) > 0, 'older: both converge', T.why(w));
  ok(!pc.pulled.some((x) => x.rel === LIST && /-deleted$/.test(x.kind)), 'older: the PC never followed the rename of the show listings (not taken away from its name)', pc.pulled);
  for (const [m, who] of [[pc, 'PC'], [mac, 'Mac']]) {
    ok(has(m.json(LIST), 'Le Trianon'), `older: the show listings are where Hearth reads them on the ${who}`, m.json(LIST));
    ok(has(m.json(NEWLIST), 'Le Trianon'), `older: the copy under the new name is there too on the ${who} (nothing lost)`);
    ok(appRead(m, 'board-b1').state === 'ok' && has(appRead(m, 'board-b1').value, 'a card'), `older: the board reads on the ${who} (a kv store comes back by itself)`, appRead(m, 'board-b1').state);
  }
  ok(!T.copies(pc).length && !T.copies(mac).length, 'older: no cloud copies left', [...T.copies(pc), ...T.copies(mac)]);
  // the app's own moves are still followed: a chat deleted on the Mac goes to the PC's Deleted chats, and comes back
  mac.deleteChat('b');
  ok(await T.converge(w) > 0, 'older: a chat deleted on the Mac: converges', T.why(w));
  ok(!pc.has('chats/b.json') && has(pc.json('trash/b.json'), 'hello'), 'older: …it is in the PC\'s Deleted chats (the app\'s own move, followed)');
  raw.renameSync(mac.p('trash/b.json'), mac.p('chats/b.json')); // Restore
  ok(await T.converge(w) > 0, 'older: restored on the Mac: converges', T.why(w));
  ok(has(pc.json('chats/b.json'), 'hello') && !pc.has('trash/b.json'), 'older: …and restored on the PC (followed)');
});

// ---------- 4. an older Hearth renames a kv store it held back (never in the cloud) ----------
scenario('oldheld', async () => {
  const w = longWorld('oldheld');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  pc.write('chats/a.json', T.chat('a', [T.msg('user', 1, 'hi')]));
  ok(await T.converge(w) > 0, 'oldheld: first sync', T.why(w));
  mac.write(BOARD_REL, { id: BOARD.slice(6), items: [card('c1', 'a card held on the Mac')] });
  await rounds(w, 3);
  ok(!pc.has(BOARD_REL), 'oldheld: held back on the Mac');
  // the older Hearth's click: renamed on the Mac's disk
  const to = Hard.winSafeRel(BOARD_REL, { rootLen: Own.rootLen(pc.data, pc.cloudRoot) });
  raw.renameSync(mac.p(BOARD_REL), mac.p(to));
  say(`an older Hearth renamed it to "${to}": Hearth on the Mac reads the board as "${appRead(mac, BOARD).state}" (what that release does; this one never offers it)`);
  await rounds(w, 6);
  ok(has(pc.json(to), 'a card held on the Mac') && has(mac.json(to), 'a card held on the Mac'), 'oldheld: the card is on both computers under the name it was given (nothing lost)');
  // the app on the Mac saves the board again (it has it in memory): under its own name, held back, no rename offered
  mac.write(BOARD_REL, { id: BOARD.slice(6), items: [card('c1', 'a card held on the Mac'), card('c2', 'another')] });
  await rounds(w, 3);
  const b = blockedRel(mac, BOARD_REL);
  ok(b && b.why === 'win-long-app' && !b.fix, 'oldheld: once updated, the Mac offers no rename for it', b);
});

// ---------- 5. case-only renames on Mac / Windows disks ----------
scenario('case', async () => {
  const w = T.world('kr99-case');
  const pc = T.computer(w, 'PC', { platform: 'win32' });
  const mac = T.computer(w, 'Mac', { platform: 'darwin' });
  const A = 'showsync/Venues.json'; const B = 'showsync/venues.json';
  pc.write(A, { venues: [{ id: 'v1', name: 'La Cigale' }] });
  ok(await T.converge(w) > 0, 'case: first sync', T.why(w));
  raw.renameSync(Sim.ci(mac.p(A)), path.join(path.dirname(Sim.ci(mac.p(A))), 'venues.json'));
  ok(await T.converge(w) > 0, 'case: a case-only rename on the Mac converges', T.why(w));
  for (const [m, who] of [[pc, 'PC'], [mac, 'Mac']]) ok(has(m.json(A), 'La Cigale') && has(m.json(B), 'La Cigale'), `case: Hearth opens it by either spelling on the ${who} (one file there)`);
  ok(!T.copies(pc).length && !T.copies(mac).length, 'case: no copies');
});

// ---------- 6. the rules ----------
scenario('rules', async () => {
  for (const r of ['kv/projects.json', 'kv/board-x.json', 'kv/three-sketches.json', 'chats/abc.json', 'trash/abc.json', 'memory.json', 'usage.json', 'templates/t1/template.json', 'templates/t1/files/x.png', 'showsync/venues.json', 'tickets/index.json', 'creative-vst/soundbank/index.json', 'quest-guide/session.json', 'prompts/x.json']) ok(Own.appNamed(r), `rules: "${r}" is Hearth-named`);
  for (const r of ['captures/Capture 10:32.png', 'attachments/notes.', 'attachments/CON.txt', 'workspace/site/what?.md', 'notes/plan: v2.md', 'refs/123-model.glb', 'renders/a.mp4', 'tickets/2026-show.pdf', 'trash/quick-ideas/a.wav', 'board/media/1-a.png', 'lists/plan.json', 'paris-photos/a.jpg']) ok(!Own.appNamed(r), `rules: "${r}" is the owner's (renamed with its links)`);
  ok(!Own.followMove('kv/a.json', 'kv/a~x.json') && !Own.followMove('showsync/x.json', 'showsync/y.json') && !Own.followMove('chats/a.json', 'chats/b.json'), 'rules: a Hearth-named file taken away from its name is not followed');
  ok(Own.followMove('chats/a.json', 'trash/a.json') && Own.followMove('trash/a.json', 'chats/a.json') && Own.followMove('captures/a.png', 'captures/b.png') && Own.followMove('lists/plan.json', 'lists/p2.json'), 'rules: the app\'s own moves and the owner\'s renames are followed');
  ok(Own.followMove('showsync/Venues.json', 'showsync/venues.json') && !Own.followMove('showsync/Venues.json', 'showsync/venues.json', { ci: false }), 'rules: a case-only rename is followed on a disk that ignores case, not on one that minds it');
  ok(Own.winBlock('kv/a.json', { why: 'win-long', over: 9 }).why === 'win-long-app' && Own.winBlock('kv/a.json', { why: 'win-long' }).fix === null && Own.winBlock('captures/a:b.png', { why: 'win-chars' }).fix === 'rename', 'rules: winBlock');
  ok(JSON.stringify(Own.record([{ rel: 'kv/x.json', why: 'win-long-app', over: 5 }, { rel: 'a', why: 'locked' }])) === JSON.stringify({ winLong: { n: 1, over: 5, sample: ['kv/x.json'] } }) && JSON.stringify(Own.record([])) === '{}', 'rules: the machine record\'s note');
  const lh = Own.longHere({ dataDir: `C:\\${'x'.repeat(175)}`, cloudRoot: 'C:\\Users\\me\\OneDrive', rels: [[BOARD_REL, 'chats/a.json', 'captures/a.png']] });
  ok(lh && lh.n === 1 && lh.which === 'data' && lh.sample[0] === BOARD_REL, 'rules: longHere on a PC (its own data folder is the long one)', lh);
  ok(!Own.longHere({ dataDir: 'C:\\Hearth\\data', cloudRoot: 'C:\\Users\\me\\OneDrive', rels: [[BOARD_REL, `chats/${'c'.repeat(80)}.json`]] }), 'rules: a short PC path fits the longest names Hearth makes');
  // the panel has words for the new codes, and its "path too long" note on the PC
  const panel = fs.readFileSync(path.join(__dirname, '..', 'sync-panel.js'), 'utf8');
  ok(/'win-long-app'\s*:/.test(panel) && /'win-name-app'\s*:/.test(panel), 'rules: the sync panel has words for win-long-app and win-name-app');
  ok(/longPath/.test(panel) && /sp-longpath/.test(panel), 'rules: the sync panel shows the PC\'s "folder path too long" note');
  for (const why of ['win-long-app', 'win-name-app']) ok(Hard.BLOCK[why] && Hard.BLOCK[why].fix === null, `rules: sync-hard knows "${why}" (no fix button)`);
});

async function main() {
  const t0 = Date.now();
  for (const s of scenarios) {
    if (ONLY && !ONLY.includes(s.name)) continue;
    const before = failures; const t = Date.now();
    try { await s.fn(); } catch (err) { ok(false, `${s.name} threw`, err.stack); }
    console.log(`${failures > before ? 'FAIL' : 'ok  '} ${s.name} (${Date.now() - t} ms)`);
  }
  console.log(`\nkvrename99: ${passes} passed, ${failures} failed (${Date.now() - t0} ms)`);
  const w = T.world('kr99-end'); if (!argv.includes('--keep')) fs.rmSync(path.dirname(w.dir), { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}
main().catch((err) => { console.error(err); process.exit(1); });
