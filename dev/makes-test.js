// Node tests for makes-core.js (the make model and every consistency rule): identity determinism, naming, plans → rooms,
// the rename cascade, dismiss / restore, progress, waiting text, the agents' context line and the creators audit.
//   node dev/makes-test.js
const assert = require('assert');
const path = require('path');
const C = require(path.join(__dirname, '..', 'makes-core.js'));
let n = 0; let failed = 0;
const ok = (name, fn) => { n += 1; try { fn(); console.log(`ok ${n} ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${n} ${name}\n  ${err.stack.split('\n').slice(0, 3).join('\n  ')}`); } };

ok('identity: the same seed gives the same color and mark, every time', () => {
  const a = C.identity('mk123'); const b = C.identity('mk123');
  assert.deepStrictEqual(a, b);
  assert.ok(C.PALETTE.some(([c]) => c === a.color) && C.GLYPHS.includes(a.glyph));
  assert.strictEqual(C.genName('mk123'), C.genName('mk123'));
  assert.match(C.genName('mk123'), /^(Gold|Ember|Violet|Rose|Sky|Mint|Lime|Ice) \w+$/);
});
ok('identity: makes on screen never share a color or a mark (deterministic for the same list)', () => {
  const taken = []; const seen = new Set();
  for (let i = 0; i < 7; i += 1) { const id = C.identity(`seed-${i % 2}`, taken); assert.ok(!taken.some((t) => t[0] === id.ci), `color clash ${i}`); assert.ok(!taken.some((t) => t[1] === id.gi), `mark clash ${i}`); taken.push([id.ci, id.gi]); seen.add(id.color); }
  assert.strictEqual(seen.size, 7);
  assert.deepStrictEqual(C.identity('x', [[1, 2]]), C.identity('x', [[1, 2]]));
});
ok('identity: a make keeps its identity (stored on it)', () => {
  const m = C.create({ id: 'mkfixed', parts: [{ kind: 'lab' }] });
  assert.deepStrictEqual(m.ident, C.identity('mkfixed'));
  assert.strictEqual(m.name, C.genName('mkfixed', m.ident));
  assert.ok(m.auto);
});
ok('naming: one scheme for rooms, files and slugs', () => {
  const m = C.create({ name: 'Neon Tunnel', parts: [{ kind: 'lab' }, { kind: 'video' }, { kind: 'board' }] });
  assert.deepStrictEqual(m.parts.map((p) => C.roomTitle(m, p)), ['Neon Tunnel · Lab', 'Neon Tunnel · Video', 'Neon Tunnel · Board']);
  assert.strictEqual(C.fileBase(m, m.parts[1]), 'Neon Tunnel · Video');
  assert.strictEqual(C.fileBase({ name: 'A/B: "x"?' }), 'A-B- -x--');
  assert.strictEqual(C.slug(m), 'neon-tunnel');
  const two = C.create({ name: 'Two', parts: [{ kind: 'lab' }, { kind: 'lab' }] });
  assert.deepStrictEqual(two.parts.map((p) => C.roomTitle(two, p)), ['Two · Lab 1', 'Two · Lab 2']);
  const sub = C.create({ name: 'Comp', parts: [{ kind: 'lab', label: 'Lab 1/2', sub: 'red pulse' }] });
  assert.strictEqual(C.roomTitle(sub, sub.parts[0]), 'Comp · Lab 1/2 · red pulse');
});
ok('naming: words of the idea, "called X", else a generated name', () => {
  assert.strictEqual(C.nameFor('a neon tunnel three.js animation that cuts into a video'), 'Neon Tunnel');
  assert.strictEqual(C.nameFor('make a video called "Launch Day"'), 'Launch Day');
  assert.strictEqual(C.nameFor('a three.js animation that cuts into a video'), '');
  const m = C.create({ name: C.nameFor('a three.js animation that cuts into a video'), parts: [] });
  assert.ok(m.auto && /\w+ \w+/.test(m.name));
});
ok('plan: "a three.js animation that cuts into a video" → a Lab room, then a Video room', () => {
  const p = C.parsePlan('a three.js animation that cuts into a video');
  assert.deepStrictEqual(p.parts.map((x) => x.kind), ['lab', 'video']);
  assert.ok(p.auto);
  const m = C.create({ name: p.name, parts: p.parts });
  assert.deepStrictEqual(m.parts.map((x) => C.KINDS[x.kind].room), ['chat', 'chat']);
  assert.strictEqual(C.KINDS.lab.agent, 'three'); assert.strictEqual(C.KINDS.video.agent, 'ae');
  assert.strictEqual(C.chain(m), 'Lab → Video');
});
ok('plan: more shapes of words', () => {
  const k = (t) => C.parsePlan(t).parts.map((x) => x.kind).join(',');
  assert.strictEqual(k('board refs, then a lab scene, then the edit with captions'), 'board,lab,video');
  assert.strictEqual(k('an orb loop'), 'lab');
  assert.strictEqual(k('a shader -> a 15 s reel'), 'lab,video');
  assert.strictEqual(k('something nice'), 'lab');
  assert.strictEqual(k('a scene and then a montage and then a caption script'), 'lab,video,chat');
  assert.deepStrictEqual(C.parsePlan('x', { kinds: ['video', { kind: 'board', brief: 'refs' }, 'nope'] }).parts.map((x) => x.kind), ['video', 'board']);
  assert.ok(C.parsePlan('a b c d e f g h, then a lab, then a video, then a board, then a video, then a lab, then a chat, then astra').parts.length <= 6);
});
ok('waiting: a room before anything is made says what it waits for', () => {
  const m = C.create({ name: 'W', parts: [{ kind: 'lab', brief: 'three.js animation' }, { kind: 'video' }] });
  assert.strictEqual(C.waitText(m, m.parts[0]), 'planned · ready to start');
  assert.strictEqual(C.waitText(m, m.parts[1]), 'planned · waiting for Lab (three.js animation)');
  m.parts[0].status = 'done';
  assert.strictEqual(C.waitText(m, m.parts[1]), 'planned · ready to start');
});
ok('rename cascade: every room the make made, not the chats it adopted', () => {
  const m = C.create({ name: 'Old', parts: [{ kind: 'lab', chatId: 'a' }, { kind: 'video', chatId: 'b' }, { kind: 'chat', chatId: 'c', own: false }, { kind: 'step' }] });
  m.parts.push({ ...C.addPart(C.create({}), { kind: 'board' }) });
  m.parts[4].frameId = 'f1'; m.parts[4].id = 'p5';
  const list = C.rename(m, 'New Name');
  assert.strictEqual(m.name, 'New Name');
  assert.deepStrictEqual(list.map((x) => x.title), ['New Name · Lab', 'New Name · Video', 'New Name · Board']);
  assert.ok(!m.auto);
  assert.deepStrictEqual(C.rename(m, '   '), []);
  assert.strictEqual(m.name, 'New Name');
});
ok('dismiss / restore: the whole make, its own rooms (to the trash and back)', () => {
  const m = C.create({ name: 'D', parts: [{ kind: 'lab', chatId: 'a' }, { kind: 'video', chatId: 'b' }, { kind: 'chat', chatId: 'c', own: false }] });
  assert.deepStrictEqual(C.dismiss(m, 5), ['a', 'b']);
  assert.strictEqual(m.dismissed, 5);
  assert.strictEqual(C.statusOf(m), 'dismissed');
  assert.deepStrictEqual(C.restore(m), ['a', 'b']);
  assert.strictEqual(m.dismissed, null);
  assert.strictEqual(C.statusOf(m), 'planned');
});
ok('status and progress: parts, the progress stream, the whole make', () => {
  const m = C.create({ name: 'P', parts: [{ kind: 'lab' }, { kind: 'video' }] });
  assert.strictEqual(C.pctOf(m), 0);
  C.progress(m, 'p1', { pct: 50, label: 'building', eta: 20 });
  assert.strictEqual(m.parts[0].status, 'working');
  assert.strictEqual(C.statusOf(m), 'working');
  assert.strictEqual(C.pctOf(m), 25);
  C.progress(m, 'p1', { pct: 140 });
  assert.strictEqual(m.parts[0].progress.pct, 100);
  assert.strictEqual(m.parts[0].status, 'done');
  assert.strictEqual(C.statusOf(m), 'going');
  C.progress(m, null, { pct: 80, label: 'rendering' });
  assert.strictEqual(C.pctOf(m), 80);
  m.parts[1].status = 'done';
  assert.strictEqual(C.statusOf(m), 'done');
  assert.strictEqual(C.progress(m, 'nope', { pct: 1 }), null);
  m.parts[1].status = 'stuck';
  assert.strictEqual(C.statusOf(m), 'stuck');
});
ok('outputs: once each, newest first, kinds from the file', () => {
  const m = C.create({ name: 'O' });
  assert.ok(C.addOutput(m, { path: '/x/a.mp4' }));
  assert.strictEqual(C.addOutput(m, { path: '/x/a.mp4' }), null);
  C.addOutput(m, '/x/b.png', 'p1');
  assert.deepStrictEqual(m.outputs.map((o) => [o.kind, o.part]), [['still', 'p1'], ['video', null]]);
});
ok('context line: short, names the room, the chain and the file name', () => {
  const m = C.create({ name: 'Neon Tunnel', parts: [{ kind: 'lab', brief: 'neon tunnel animation' }, { kind: 'video' }] });
  const line = C.contextLine(m, m.parts[0]);
  assert.match(line, /^\[Make “Neon Tunnel” · this room: Lab \(1 of 2: Lab → Video\)/);
  assert.match(line, /next: Video/); assert.match(line, /“Neon Tunnel · Lab”/);
  assert.ok(line.length / 4 < 60, `≈ ${Math.round(line.length / 4)} tokens`);
  assert.match(C.contextLine(m, m.parts[1]), /before it: Lab \(planned\)/);
});
ok('creators: the registry audit — big ones make a make, small ones join the room you are in', () => {
  assert.ok(C.creatorOf('dispatch').standalone && C.creatorOf('/intro').adapter === 'intro');
  assert.strictEqual(C.creatorOf('shot').standalone, false);
  assert.strictEqual(C.creatorOf('scene', ''), null);
  assert.ok(C.creatorOf('scene', 'new'));
  assert.ok(C.creatorOf('comp', 'render 9:16')); assert.strictEqual(C.creatorOf('comp', 'add x'), null);
  assert.strictEqual(C.creatorOf('freeze'), null);
  for (const [k, v] of Object.entries(C.CREATORS)) assert.ok(v.what && (v.cat ? C.CATS[v.cat] : true), k);
});
ok('ids: unique, even made in the same millisecond', () => {
  const ids = new Set(Array.from({ length: 200 }, () => C.create({ at: 42 }).id));
  assert.strictEqual(ids.size, 200);
});

console.log(`\n${n - failed}/${n} passed`);
process.exit(failed ? 1 : 0);
