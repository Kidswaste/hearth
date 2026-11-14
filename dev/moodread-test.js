#!/usr/bin/env node
// (round 179, moodread179) The mood read (moodread-core.js), in one Node test, its AI passes through the fake engines
// (dev/fake-claude.js / fake-codex.js via engines.once):
//   1. produced: every picture gets its three looks at the full-size file (a clip: its frames) plus a second, independent
//      look by the other AI; then one pass over the whole board
//   2. stored: kept per board with each picture's signature, its time, the AIs and the tokens it cost
//   3. paid once, refreshed on change: the same board again asks nothing; one new picture reads only that picture and the
//      board again; a removed picture drops its read; moving a picture changes nothing
//   4. accuracy you can see: the read's own claims next to the measured numbers (a contradiction is named), and next to
//      the second look
//   5. delivered: what a director gets is the board's qualities and the inspiration rule, never the literal "seen" line;
//      the owner's own material is the one named exception; the project brief's AI pass is given the read and the rule
//   6. the owner's edit round-trips, survives a refresh (the next board pass is told to keep it), and corrections lead
//   7. the cost before a run is stated, and a stopped run keeps what it already paid for
// Everything in a temp root; no data/ of the owner's is touched.   node dev/moodread-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moodread-'));
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'macpolish.js', 'access-rules.js', 'datalock.js', 'context-core.js', 'toolwake.js', 'spawnhelper.js', 'spawnhelper-child.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
const engines = require(path.join(dir, 'engines.js'));
engines.setEnginePaths({ claude: path.join(__dirname, 'fake-claude.js'), codex: path.join(__dirname, 'fake-codex.js') });
const M = require(path.join(ROOT, 'moodread-core.js'));
const PB = require(path.join(ROOT, 'projectbrief-core.js'));
let passed = 0;
const ok = (name) => { passed += 1; console.log(`✓ ${name}`); };

const vibe = (over = {}) => ({ palette: [{ hex: '#e68c3c', share: 0.6 }, { hex: '#140c08', share: 0.4 }], light: 0.2, contrast: 0.8, sat: 0.7, warmth: 0.5, edges: 0.3, grain: 0.3, space: 0.4, symmetry: 0.3, ...over });
const board = (extra = []) => ({ id: 'b1', name: 'Ember refs', brief: '', items: [
  { id: 'i1', type: 'image', title: 'Harbor at night', src: '/board/harbor.jpg', natural: [3000, 2000], x: 0, y: 0, w: 300, h: 200, vibe: vibe(), like: 'the way the light gives up before the edges' },
  { id: 'i2', type: 'video', title: 'Lantern clip', src: '/board/lantern.mp4', natural: [1280, 720], duration: 12, x: 320, y: 0, w: 300, h: 200, vibe: vibe({ warmth: -0.6 }) },
  { id: 'i3', type: 'image', title: 'My own plate', src: '/board/plate.jpg', natural: [800, 800], x: 0, y: 300, w: 200, h: 200, vibe: vibe(), footage: true },
  { id: 'n1', type: 'note', text: 'quiet, then one flare', x: 0, y: 600, w: 200, h: 100 },
  ...extra,
] });
const kvFile = path.join(dir, 'mood-reads.json');
const pic = (name) => { const p = path.join(dir, name); fs.writeFileSync(p, Buffer.from([0xff, 0xd8, 0xff, 0xd9])); return p; };
let asked = []; let opened = []; let now = 1700000000000;
const deps = (b, over = {}) => ({
  board: async () => b,
  pictures: async (it) => { opened.push(it.id); return M.isClip(it) ? Array.from({ length: M.CLIP_FRAMES }, (_x, k) => pic(`${it.id}-f${k}.jpg`)) : [pic(`${it.id}.jpg`)]; },
  ask: async (rq) => {
    asked.push(rq);
    const agent = rq.second ? { id: 'second', name: 'Second reader', mode: 'native', engine: 'claude' } : { id: 'claude', name: 'Claude', mode: 'native', engine: 'claude' };
    const r = await engines.once({ agent, text: rq.text, images: rq.images, options: { lean: true, helper: true, persona: rq.persona } });
    return { ...r, by: agent.name };
  },
  read: async () => (fs.existsSync(kvFile) ? JSON.parse(fs.readFileSync(kvFile, 'utf8')) : null),
  write: async (d) => { fs.writeFileSync(kvFile, JSON.stringify(d)); },
  now: () => now, ...over,
});
const stored = () => M.entry(JSON.parse(fs.readFileSync(kvFile, 'utf8')), 'b1');

(async () => {
  // ---------- 7a. the cost, before anything runs ----------
  const b0 = board();
  const est = M.estimate(M.media(b0.items));
  assert.equal(est.calls, 3 * 4 + 1, 'three looks + a second look per picture, one board pass');
  assert.ok(est.in > 6 * M.tokensOf(1280, 720) * 4 && est.out > 0 && /tokens in/.test(M.costLine(est)), `the estimate counts a clip's frames in every look: ${M.costLine(est)}`);
  assert.ok(M.estimate(M.media(b0.items), { second: false }).in < est.in, 'no second look costs less');
  ok(`the cost is stated before a run (${M.costLine(est)})`);

  // ---------- 1. produced ----------
  const r1 = await M.run('b1', {}, deps(b0));
  assert.deepEqual(r1.failed, [], `nothing failed: ${r1.failed}`);
  assert.equal(asked.length, 13, 'thirteen AI passes');
  const looks = asked.filter((q) => /^Mood read, look/.test(q.text));
  assert.equal(looks.length, 9);
  assert.ok(looks.filter((q) => /Lantern|frames from it/.test(q.text)).every((q) => q.images.length === 6), 'a clip goes as its six frames in every look');
  assert.ok(looks.filter((q) => !/frames from it/.test(q.text)).every((q) => q.images.length === 1), 'a still goes as one full-size picture');
  assert.ok(asked.filter((q) => q.second).length === 3 && asked.filter((q) => q.second).every((q) => q.images.length >= 1 && !/first two looks/.test(q.text)), 'the second look sees the picture but none of the first read');
  assert.ok(/what the owner likes about it.*light gives up/is.test(looks[0].text), 'what the owner likes leads the read of that picture');
  const boardAsk = asked.at(-1);
  assert.ok(/^Mood read, the whole board/.test(boardAsk.text) && boardAsk.images.length === 0 && (boardAsk.text.match(/^PICTURE \d/gm) || []).length === 3, 'the board pass reads the three pictures\' reads, no picture');
  assert.ok(/quiet, then one flare/.test(boardAsk.text) && /Do NOT average/.test(boardAsk.text), 'with the owner\'s board note, and told not to average');
  assert.ok(!/a test picture/.test(boardAsk.text), 'the literal "seen" lines are not passed on to the board pass');
  ok('produced: three looks at every picture at full size (a clip: 6 frames), a second independent look, one board pass');

  // ---------- 2. stored ----------
  const e1 = stored();
  assert.ok(e1 && Object.keys(e1.items).length === 3 && e1.items.i1.sig === M.itemSig(b0.items[0]) && e1.items.i1.at === now);
  assert.ok(/pictures seen: 1/.test(e1.items.i1.seen) && /pictures seen: 6/.test(e1.items.i2.seen), `the engine really got the files: ${e1.items.i2.seen}`);
  assert.ok(e1.items.i1.colour && e1.items.i1.depth && e1.items.i1.feeling && e1.items.i1.words.length === 4 && e1.items.i1.claims.key === 'low');
  assert.ok(e1.items.i1.second?.by === 'Second reader' && e1.by === 'Claude' && e1.second === 'Second reader', 'who read, and who gave the second look');
  assert.ok(/3 pictures/.test(e1.board.mood) && e1.board.threads.length === 1 && e1.board.make.length === 2 && e1.board.pictures === 3 && e1.board.sig);
  assert.ok(e1.usage.calls === 13, 'the passes it cost are kept');
  ok('stored with the board: each picture\'s read, signature and time, both AIs, the board read, what it cost');

  // ---------- 3. paid once; refreshed on change ----------
  asked = []; opened = [];
  await M.run('b1', {}, deps(board()));
  assert.equal(asked.length, 0, 'the same board again: nothing is asked');
  const moved = board(); moved.items[0].x = 999;
  assert.deepEqual(M.stale(e1, moved.items), { add: [], gone: [], board: false, outside: 0 }, 'moving a picture changes nothing');
  const plus = board([{ id: 'i4', type: 'image', title: 'New one', src: '/board/new.jpg', natural: [1000, 1000], vibe: vibe() }]);
  assert.deepEqual(M.stale(e1, plus.items).add, ['i4']);
  now += 1000;
  await M.run('b1', {}, deps(plus));
  assert.deepEqual(opened, ['i4'], 'only the new picture is opened');
  assert.equal(asked.length, 5, 'its three looks, its second look, and the board again');
  assert.ok(/4 pictures/.test(stored().board.mood) && stored().items.i1.at === now - 1000, 'the board read covers four now; the old reads are the old ones');
  const liked = board(); liked.items[2].like = 'the chipped glaze';
  assert.deepEqual(M.stale(stored(), liked.items).add, ['i3'], 'new words from the owner on a picture: that picture is read again');
  asked = []; opened = [];
  await M.run('b1', {}, deps(board()));
  assert.ok(!stored().items.i4 && opened.length === 0 && asked.length === 1 && /3 pictures/.test(stored().board.mood), 'a removed picture drops its read; only the board pass runs');
  ok('paid once: no change asks nothing; a new picture reads only itself + the board; a removed one drops out');

  // ---------- 4. accuracy you can see ----------
  const c1 = M.check(e1.items.i1, b0.items[0].vibe);
  assert.ok(c1.n === 6 && c1.agree >= 4 && c1.flags.length === 0, `the read agrees with the measurement: ${JSON.stringify(c1)}`);
  const c2 = M.check(e1.items.i2, b0.items[1].vibe);
  assert.ok(c2.flags.length === 1 && /warmth: the read says warm, the measurement says cool \(-0\.6\)/.test(c2.flags[0]), `a contradiction is named: ${c2.flags}`);
  const ag = M.agreement(e1.items.i1);
  assert.ok(ag.n === 6 && ag.same === 5 && ag.differ.length === 1 && /contrast: hard \/ soft/.test(ag.differ[0]) && ag.shared.includes('ember'), `the second look next to the first: ${JSON.stringify(ag)}`);
  ok('accuracy shown: the read\'s claims against the measured numbers, and against the second look');

  // ---------- 5. delivered ----------
  const text = M.directorText(stored(), board());
  assert.ok(/^MOOD READ of the moodboard "Ember refs" \(3 references read closely/.test(text) && /ember light held back/.test(text) && /Threads inside the board/.test(text) && /This mood is NOT:/.test(text) && /To make new work in this mood:/.test(text));
  assert.ok(text.includes(M.RULE) && /owner's own material.*"My own plate"/.test(text), 'the inspiration rule, and the owner\'s own material as the one exception');
  assert.ok(!/a test picture|pictures seen/.test(text) && !/Harbor at night|Lantern clip/.test(text), 'no literal description and no other reference\'s title reaches the director');
  assert.ok(/none goes into the scene as is/.test(M.directorText(stored(), { ...board(), items: board().items.map((i) => ({ ...i, footage: undefined })) })), 'nothing marked mine: none may be used as is');
  assert.ok(/board changed \(1 new or changed\)/.test(M.directorText(stored(), plus)), 'a read behind its board says so');
  const lines = M.briefLines(stored(), board());
  const prompt = PB.prompt(PB.inputs({ project: { name: 'Night' }, board: board(), moodRead: lines }));
  assert.ok(/Mood read of the moodboard.*ember light/.test(prompt) && /no step may import, trace or rebuild a reference/.test(prompt) && /"My own plate"/.test(prompt), 'the project brief\'s AI pass reads the mood read and the rule');
  assert.ok(/no step may import, trace or rebuild/.test(PB.prompt(PB.inputs({ project: { name: 'Night' }, board: board() }))), 'the rule is there without a read too');
  assert.deepEqual(PB.changed(PB.fingerprints(PB.inputs({ project: { name: 'N' }, board: board() })), PB.fingerprints(PB.inputs({ project: { name: 'N' }, board: board(), moodRead: lines }))), ['the mood read'], 'a new read makes the brief stale');
  ok('delivered: the director gets qualities + the inspiration rule (never the literal line); the brief is written from the read');

  // ---------- 6. the owner's edit ----------
  const t = M.toText(stored().board);
  const back = M.fromText(t);
  assert.deepEqual({ ...back }, (({ sig, at, pictures, ...rest }) => rest)(stored().board), 'the read as text and back is the same read');
  assert.equal(M.fromText('Essence: no mood line'), null, 'an edit without its mood line is refused');
  const mineEdit = M.fromText(t.replace(/^Mood: .*/m, 'Mood: a held breath before the flare'));
  fs.writeFileSync(kvFile, JSON.stringify(M.put(JSON.parse(fs.readFileSync(kvFile, 'utf8')), 'b1', { board: { ...stored().board, ...mineEdit, edited: now }, corrections: 'less nostalgia, more threat' })));
  assert.ok(/a held breath before the flare/.test(M.directorText(stored(), board())) && /less nostalgia, more threat/.test(M.directorText(stored(), board())) && /the owner edited it/.test(M.directorText(stored(), board())));
  asked = [];
  await M.run('b1', { force: false }, deps(board([{ id: 'i5', type: 'image', title: 'Another', src: '/board/a.jpg', natural: [900, 900], vibe: vibe() }])));
  const again = asked.at(-1).text;
  assert.ok(/THE OWNER'S CORRECTIONS.*less nostalgia, more threat/.test(again) && /owner edited the previous read[\s\S]*a held breath before the flare/.test(again), 'a refresh hands the owner\'s edit and corrections to the next board pass');
  assert.ok(stored().corrections === 'less nostalgia, more threat' && /corrections were read/.test(stored().board.tensions.join()), 'the corrections stay with the board');
  ok('the owner\'s edit round-trips, and a refresh is told to keep it; corrections lead');

  // ---------- 7b. a stopped run keeps what it paid for ----------
  fs.rmSync(kvFile);
  let n = 0;
  const rs = await M.run('b1', {}, deps(board(), { stopped: () => (n += 1) > 1 }));
  assert.ok(rs.stopped && Object.keys(stored().items).length === 1 && !stored().board, 'stopped after one picture: that read is kept, no board pass yet');
  asked = []; opened = [];
  await M.run('b1', {}, deps(board()));
  assert.deepEqual(opened, ['i2', 'i3'], 'the next run reads only the rest');
  // a picture whose file is gone is named, the rest still read
  fs.rmSync(kvFile);
  const rf = await M.run('b1', { second: false }, deps(board(), { pictures: async (it) => (it.id === 'i2' ? [] : [pic(`${it.id}.jpg`)]) }));
  assert.ok(rf.failed.length === 1 && /Lantern clip: its file could not be opened/.test(rf.failed[0]) && stored().items.i2.error && stored().board.pictures === 2 && !stored().items.i1.second, 'an unreadable picture is named and left out; without the second look none is stored');
  ok('a stopped run keeps its reads and the next one finishes; an unreadable picture is named, not guessed');

  console.log(`\nall passed (${passed})`);
  fs.rmSync(dir, { recursive: true, force: true });
})().catch((err) => { console.error(err); process.exit(1); });
