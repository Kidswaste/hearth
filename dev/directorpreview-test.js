// Node tests for ◧ Try it first (tools/three-try-core.js): what the scenes file gets while an edit waits (the scene as
// it was; a scene made meanwhile left out), the one-line summary of an edit, the short "Try another way" message, the
// cost line.
//   node dev/directorpreview-test.js
const assert = require('assert');
const C = require('../tools/three-try-core.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.message}`); process.exitCode = 1; } };

const sk = (id, code, extra = {}) => ({ id, name: `Scene ${id}`, code, updatedAt: 1, layers: [{ id: 'main', name: 'Main', code }], ...extra });

ok('no trial: the list is written as it is (the same array, nothing copied)', () => {
  const list = [sk('a', 'x'), sk('b', 'y')];
  assert.strictEqual(C.diskList(list, []), list);
  assert.strictEqual(C.diskList(list, [{ sceneId: 'a', sketch: null }]), list); // not taken yet: nothing changed so far
});
ok('a waiting edit: its scene is written as it was when the turn started; the others as they are', () => {
  const before = sk('a', 'old');
  const list = [sk('a', 'new', { updatedAt: 9 }), sk('b', 'y')];
  const out = C.diskList(list, [{ sceneId: 'a', sketch: before, startIds: ['a', 'b'], running: false, newIds: [] }]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].code, 'old');
  assert.strictEqual(out[0].layers[0].code, 'old');
  assert.strictEqual(out[1], list[1]);
  assert.notStrictEqual(out[0], before); // a copy: later saves can't change the kept one
  assert.strictEqual(list[0].code, 'new'); // what's in memory (the preview) is untouched
});
ok('while the turn runs, any scene made since isn\'t written; after it, only the one the chat moved to', () => {
  const t = { sceneId: 'a', sketch: sk('a', 'old'), startIds: ['a', 'b'], running: true, newIds: [] };
  const list = [sk('a', 'new'), sk('b', 'y'), sk('c', 'made by the director'), sk('d', 'made by you')];
  assert.deepStrictEqual(C.diskList(list, [t]).map((x) => x.id), ['a', 'b']);
  t.running = false; t.newIds = ['c'];
  assert.deepStrictEqual(C.diskList(list, [t]).map((x) => x.id), ['a', 'b', 'd']);
});
ok('two chats trying first: each scene keeps its own before', () => {
  const list = [sk('a', 'a2'), sk('b', 'b2'), sk('z', 'z')];
  const out = C.diskList(list, [{ sceneId: 'a', sketch: sk('a', 'a1'), startIds: ['a', 'b', 'z'], newIds: [] }, { sceneId: 'b', sketch: sk('b', 'b1'), startIds: ['a', 'b', 'z'], newIds: [] }]);
  assert.deepStrictEqual(out.map((x) => x.code), ['a1', 'b1', 'z']);
});
ok('the edit in one line: what changed + the first sentence of the reply, ≤ 140 characters', () => {
  const l = C.line({ summary: 'Orb +3 −1 · tint, speed', reply: '**Made** the rings pink and slower. Then I also tweaked the glow so it matches.' });
  assert.strictEqual(l, 'Orb +3 −1 · tint, speed · “Made the rings pink and slower.”');
  assert.ok(C.line({ summary: 'x'.repeat(300) }).length <= 140);
  assert.strictEqual(C.line({ newScene: 'Neon tunnel', summary: 'no change' }), 'made a new scene “Neon tunnel”');
  assert.strictEqual(C.line({}), 'an edit to the scene');
  assert.strictEqual(C.firstSentence('```js\ncode\n```\nDone: [the orb](x) spins.'), 'Done: the orb spins.');
});
ok('"Try another way" is one short message: the rejected edit named, a different approach asked (≈ 40 tokens)', () => {
  const m = C.followUp('Orb +3 −1 · “Made the rings pink.”');
  assert.ok(/undid it/.test(m) && /Made the rings pink/.test(m) && /different approach/.test(m));
  assert.ok(m.length < 220, `${m.length} chars`);
  assert.ok(C.followUp('y'.repeat(400)).length < 260);
});
ok('the cost: tokens over the turn(s), cached shown, replies counted', () => {
  let u = C.addUsage(null, { input: 3000, output: 1200, cached: 2500 });
  assert.strictEqual(C.costText(u), '4.2k tokens (2.5k cached)');
  u = C.addUsage(u, { input: 9000, output: 600 });
  assert.strictEqual(C.costText(u), '14k tokens (2.5k cached) · 2 replies');
  assert.strictEqual(C.costText(C.addUsage(null, null)), '');
  assert.strictEqual(C.whoName('codex'), 'Astra');
  assert.strictEqual(C.whoName('claude'), 'Claude');
});
console.log(`${n} tests${process.exitCode ? ' (some failed)' : ', all pass'}`);
