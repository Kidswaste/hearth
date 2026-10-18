// (round 64, newtour64) ✦ Try what's new (trynew-core.js): the 13 paths of rounds 61–63 as data, finding a path by
// words, the steps a copy can show, and the progress rules ("7 of 13 tried", skip / later, a tried path stays tried,
// a round's queue, stores from other copies cleaned).
const assert = require('node:assert/strict');
const C = require('../trynew-core');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const OPENS = ['chat', 'studio:world', 'studio:rewards', 'week', 'review', 'desk', 'lab', 'sounds'];

test('13 paths: 5 from round 61, 4 from 62, 4 from 63, unique ids, 1–3 steps each, every step rings something', () => {
  assert.equal(C.PATHS.length, 13);
  assert.deepEqual(C.ROUNDS, [61, 62, 63]);
  assert.deepEqual(C.ROUNDS.map((r) => C.PATHS.filter((p) => p.round === r).length), [5, 4, 4]);
  assert.equal(new Set(C.PATHS.map((p) => p.id)).size, 13);
  for (const p of C.PATHS) {
    assert.ok(p.steps.length >= 1 && p.steps.length <= 3, p.id);
    assert.ok(p.steps[0].open && OPENS.includes(p.steps[0].open), `${p.id}: the first step opens a place`);
    for (const s of p.steps) {
      assert.ok(s.title && s.text && s.text.length < 260, `${p.id}: short words`);
      assert.ok(Array.isArray(s.target) && s.target.length, `${p.id}: a target`);
      if (s.open) assert.ok(OPENS.includes(s.open), `${p.id}: ${s.open}`);
      if (s.cmd) assert.match(s.cmd, /^\/[a-z]/);
    }
  }
});
test('the commands the owner asked for are suggested', () => {
  const cmds = C.PATHS.flatMap((p) => p.steps.map((s) => s.cmd)).filter(Boolean);
  for (const c of ['/quest add airpods', '/quest paris', '/quest week', '/quest review', '/shows week', '/shows prep ', '/jam park buttes', '/song', '/sounds dark', '/reward add new record at Superfly 300', '/playtest notes', '/playtest hitchmap on', '/quest walk belleville 3h', '/audio doctor']) assert.ok(cmds.includes(c), c);
});
test('/audio doctor shows only when this copy has it (audiodoctor64)', () => {
  const p = C.byId('livevst');
  assert.equal(C.stepsFor(p).length, 1);
  assert.equal(C.stepsFor(p, { audiodoctor: true }).length, 2);
});
test('find by id, name, start of a name or words', () => {
  assert.equal(C.find('walk').id, 'walk');
  assert.equal(C.find('Park jam').id, 'park');
  assert.equal(C.find('sound bank').id, 'soundbank');
  assert.equal(C.find('✦ preset').id, 'preset');
  assert.equal(C.find('hitch').id, 'hitchmap');
  assert.equal(C.find('F8').id, 'playnotes');
  assert.equal(C.find(''), null);
  assert.equal(C.find('nothing like it'), null);
});
test('progress: tried / skipped / later, "N of 13 tried", per round', () => {
  let p = {};
  assert.equal(C.label(p), '0 of 13 tried');
  p = C.mark(p, 'tracker', 'tried', 1);
  p = C.mark(p, 'walk', 'tried', 2);
  p = C.mark(p, 'paris', 'skipped', 3);
  p = C.mark(p, 'week', 'later', 4);
  assert.equal(C.label(p), '2 of 13 tried');
  assert.deepEqual(C.count(p, 61), { tried: 1, skipped: 1, total: 5 });
  assert.equal(C.label(p, 63), '1 of 4 tried');
  assert.ok(C.isTried(p, 'walk') && !C.isTried(p, 'paris'));
});
test('a tried path stays tried when it is paused again; skip after tried is the owner\'s word', () => {
  let p = C.mark({}, 'tracker', 'tried', 1);
  p = C.mark(p, 'tracker', 'later', 2);
  assert.equal(p.tracker.state, 'tried');
  p = C.mark(p, 'tracker', 'skipped', 3);
  assert.equal(p.tracker.state, 'skipped');
});
test('mark never takes unknown paths or states, and never changes the object it was given', () => {
  const p0 = { tracker: { state: 'tried', at: 1 } };
  const p1 = C.mark(p0, 'nope', 'tried');
  const p2 = C.mark(p0, 'walk', 'loved');
  assert.deepEqual(p1, p0); assert.deepEqual(p2, p0);
  C.mark(p0, 'walk', 'tried');
  assert.equal(p0.walk, undefined);
});
test('a store from another copy is cleaned (unknown ids / states / shapes dropped, never a throw)', () => {
  assert.deepEqual(C.clean(null), {});
  assert.deepEqual(C.clean([1, 2]), {});
  assert.deepEqual(C.clean('x'), {});
  assert.deepEqual(C.clean({ tracker: { state: 'tried', at: '5' }, old: { state: 'tried' }, walk: { state: 'meh' }, park: 3 }), { tracker: { state: 'tried', at: 5 } });
});
test('queue: paused first, then new ones, in order; tried and skipped are out; next() and allTried()', () => {
  let p = C.mark({}, 'shows', 'later');
  p = C.mark(p, 'tracker', 'tried');
  p = C.mark(p, 'livevst', 'skipped');
  assert.deepEqual(C.queue(p, 61).map((x) => x.id), ['shows', 'paris', 'preset']);
  assert.equal(C.next(p).id, 'shows');
  let all = {};
  for (const x of C.PATHS) all = C.mark(all, x.id, 'tried');
  assert.ok(C.allTried(all));
  assert.equal(C.next(all), null);
  assert.equal(C.label(all), '13 of 13 tried');
});
test('the chat list names every path with its command and state', () => {
  const t = C.listText(C.mark({}, 'walk', 'tried'));
  for (const p of C.PATHS) assert.ok(t.includes(`/try ${p.id}`), p.id);
  assert.match(t, /Round 63\*\* · 1 of 4 tried/);
  assert.match(t, /Quest walk .*✓ tried/);
});
console.log(`trynew-test: ${checks} checks passed`);
