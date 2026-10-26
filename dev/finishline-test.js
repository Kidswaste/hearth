// Node tests for ⚑ Finish line (tools/three-finish-core.js): sizes and their default lines, ticking / editing /
// adding / removing lines, "done" only when every line is ticked, Polish this → exactly three concrete steps (unticked
// lines first, then a short look at the scene), and a side quest QuestCore accepts (on a fresh journal in memory:
// nothing is read from or written to the owner's data).
//   node dev/finishline-test.js
const assert = require('assert');
const C = require('../tools/three-finish-core.js');
const QC = require('../tools/quest-core.js');
let n = 0;
const ok = (name, fn) => { try { fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { console.log(`✖ ${name}: ${err.stack}`); process.exitCode = 1; } };

ok('no size yet: an empty list, the chip invites', () => {
  const st = C.normalize(null);
  assert.deepStrictEqual(st.items, []);
  assert.strictEqual(st.size, null);
  assert.strictEqual(C.chip(st).text, '⚑ Finish line');
  assert.strictEqual(C.progress(st).finished, false);
});
ok('10 s starts with its three default lines', () => {
  const st = C.setSize(null, '10s');
  assert.deepStrictEqual(st.items.map((x) => x.text), ['One clear idea', 'Loops cleanly', 'Sound fits']);
  assert.strictEqual(C.chip(st).text, '⚑ 10 s · 0/3');
});
ok('an unknown size changes nothing', () => {
  const st = C.setSize(C.setSize(null, '30s'), 'huge');
  assert.strictEqual(st.size, '30s');
});
ok('switching size with untouched lines: the new defaults, shared ticks kept', () => {
  let st = C.setSize(null, '10s');
  st = C.toggle(st, st.items.find((x) => x.text === 'Sound fits').id);
  st = C.setSize(st, '30s');
  assert.strictEqual(st.items.length, 4);
  assert.ok(st.items.every((x) => !x.done)); // "Sound fits" isn't a 30 s line
  st = C.setSize(st, '10s');
  assert.strictEqual(st.items[0].text, 'One clear idea');
});
ok('edited lines survive a size change', () => {
  let st = C.setSize(null, '10s');
  st = C.rename(st, st.items[0].id, 'The orb breathes');
  assert.strictEqual(st.custom, true);
  st = C.setSize(st, 'full');
  assert.strictEqual(st.size, 'full');
  assert.strictEqual(st.items[0].text, 'The orb breathes');
  assert.strictEqual(st.items.length, 3);
});
ok('done only when every line is ticked; undoing a tick un-finishes', () => {
  let st = C.setSize(null, '10s');
  for (const x of st.items) st = C.toggle(st, x.id);
  assert.strictEqual(C.progress(st).finished, true);
  assert.ok(st.doneAt > 0);
  assert.match(C.chip(st).text, /done ✓/);
  st = C.toggle(st, st.items[1].id);
  assert.strictEqual(C.progress(st).finished, false);
  assert.strictEqual(st.doneAt, null);
});
ok('add / remove / reset; at most 8 lines; blank text ignored', () => {
  let st = C.setSize(null, '10s');
  st = C.add(st, '   ');
  assert.strictEqual(st.items.length, 3);
  for (let i = 0; i < 10; i += 1) st = C.add(st, `line ${i}`);
  assert.strictEqual(st.items.length, C.MAX_ITEMS);
  st = C.remove(st, st.items[0].id);
  assert.strictEqual(st.items.length, C.MAX_ITEMS - 1);
  st = C.reset(st);
  assert.strictEqual(st.custom, false);
  assert.deepStrictEqual(st.items.map((x) => x.text), C.DEFAULTS['10s']);
});
ok('rename to blank keeps the old text; ids stay unique after junk', () => {
  let st = C.setSize(null, '10s');
  st = C.rename(st, st.items[0].id, '  ');
  assert.strictEqual(st.items[0].text, 'One clear idea');
  const junk = C.normalize({ size: '10s', items: [{ id: 'a', text: 'x' }, { id: 'a', text: 'y' }, null, { text: '' }, 5], quest: { id: 'evil id' } });
  assert.strictEqual(junk.items.length, 2);
  assert.notStrictEqual(junk.items[0].id, junk.items[1].id);
  assert.strictEqual(junk.quest, null);
});
ok('a list where the lines all fit one rule each: concrete, scene-specific words', () => {
  for (const size of ['10s', '30s', 'full']) for (const text of C.DEFAULTS[size]) {
    const s = C.stepFor(text);
    assert.ok(!/^Make “/.test(s.title), `"${text}" fell through to the generic step`);
    assert.ok(s.instruction.includes(text), `"${text}" isn't named in its step`);
  }
  assert.strictEqual(C.stepFor('Loops cleanly').title, 'Make the seam invisible');
  assert.strictEqual(C.stepFor('A clear start, middle and end').title, 'Give it a shape');
  assert.strictEqual(C.stepFor('Sound and picture stay together').title, 'Line up sound and picture');
  assert.match(C.stepFor('Purple is purple enough').title, /Make “Purple is purple enough” true/);
});
ok('Polish this: always exactly three steps', () => {
  const info = { layers: ['Sky', 'Orb'], seconds: 10 };
  const st0 = C.setSize(null, 'full'); // five lines open
  assert.strictEqual(C.polishSteps(st0, info).length, 3);
  let st = C.setSize(null, '10s');
  st = C.toggle(st, st.items[0].id); st = C.toggle(st, st.items[1].id); // one open
  const one = C.polishSteps(st, info);
  assert.strictEqual(one.length, 3);
  assert.strictEqual(one[0].item, st.items[2].id);
  assert.strictEqual(one[1].title, 'Watch it through once');
  for (const x of st.items) if (!x.done) st = C.toggle(st, x.id); // none open: a look at the scene
  const look = C.polishSteps(st, info);
  assert.deepStrictEqual(look.map((s) => s.title), ['Watch it through once', 'Change only that moment', 'Record it and watch it back']);
  assert.match(look[0].instruction, /10 s/);
  assert.match(look[1].instruction, /Sky, Orb/);
  assert.strictEqual(C.polishSteps(null, {}).length, 3); // no list at all
  assert.deepStrictEqual(look.map((s) => s.id), ['finish-1', 'finish-2', 'finish-3']);
});
ok('the side quest passes QuestCore.validate and trackSide (fresh journal in memory)', () => {
  const st = C.setSize(null, '10s');
  const q = C.quest({ sceneId: 'sAbc_9', sceneName: 'Neon orb', size: '10s', n: 2 }, C.polishSteps(st, {}));
  assert.ok(C.isOurs(q.id));
  assert.match(q.id, /^q-finish-[a-z0-9]+-2$/);
  assert.strictEqual(q.guideSteps.length, 3);
  assert.ok(q.guideSteps.every((s) => s.check === 'manual' && s.action.type === 'hearth-tool' && s.action.tool === 'lab'));
  assert.match(q.guideSteps[0].instruction, /Neon orb/);
  const s = QC.upgrade(QC.initial());
  QC.trackSide(s, q);
  QC.validate(s);
  assert.ok(s.sideQuests.some((x) => x.id === q.id));
  const g = C.guideStart(q);
  assert.strictEqual(g.op, 'start');
  assert.strictEqual(g.steps.length, 3);
});
ok('the three-side-quest limit is QuestCore\'s plain message', () => {
  const s = QC.upgrade(QC.initial());
  for (let i = 1; i <= 3; i += 1) QC.trackSide(s, C.quest({ sceneId: `s${i}`, sceneName: `Scene ${i}`, size: '10s' }, C.polishSteps(null, {})));
  assert.throws(() => QC.trackSide(s, C.quest({ sceneId: 's4', sceneName: 'Four', size: '10s' }, C.polishSteps(null, {}))), /three side quests/);
});
ok('a long scene name and odd ids still make a valid quest', () => {
  const q = C.quest({ sceneId: 'X'.repeat(300), sceneName: 'N'.repeat(500), size: null }, C.polishSteps(null, {}));
  const s = QC.upgrade(QC.initial());
  QC.trackSide(s, q);
  QC.validate(s);
});
console.log(`${n} passed`);
