// (round 61, questhud61) The quest tracker's thinking (questhud-core.js) on Codex's own QuestCore: which quest the chip
// follows, its two steps, progress, the other active quests, /quest words, names for /quest track, map-pin distances.
const assert = require('node:assert/strict');
const C = require('../tools/quest-core');
const Q = require('../questhud-core');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const fresh = () => C.upgrade(C.validate(C.initial()));

test('the chip follows the tracked campaign\'s next quest, with its first move then its finish line', () => {
  const s = fresh(), c = s.campaigns.find((x) => x.id === s.active), q0 = c.quests[0];
  let cd = Q.card(C, s, Q.current(C, s));
  assert.equal(cd.id, q0.id); assert.equal(cd.next.id, 'start'); assert.equal(cd.progress.text, `1/${c.quests.length}`); assert.equal(cd.progress.frac, 0);
  C.startSmall(s, q0.id);
  cd = Q.card(C, s, Q.current(C, s));
  assert.equal(cd.next.id, 'finish'); assert.ok(cd.next.proof, 'studio journals need proof for the finish line'); assert.ok(cd.progress.frac > 0);
  delete s.studio; C.complete(s, q0.id); s.studio = { v: 1 };
  cd = Q.card(C, s, Q.current(C, s));
  assert.equal(cd.id, c.quests[1].id); assert.equal(cd.progress.text, `2/${c.quests.length}`);
});
test('a pinned side quest wins; parked, finished or unknown pins fall back to the main quest', () => {
  const s = fresh(), d = C.daily('2026-10-18')[0]; C.trackSide(s, d);
  assert.equal(Q.current(C, s, d.id).id, d.id);
  assert.equal(Q.current(C, s, 'q-nope').id, Q.main(C, s).id);
  s.sideQuests[0].parked = true; assert.equal(Q.current(C, s, d.id).id, Q.main(C, s).id);
  const sideCard = Q.card(C, s, { ...C.find(s, d.id) }); assert.ok(sideCard.side); assert.equal(sideCard.progress.text, '0/2');
});
test('nothing active: every campaign paused and no side quest → null (the chip goes tiny)', () => {
  const s = fresh(); s.campaigns.forEach((c) => { c.paused = true; });
  assert.equal(Q.current(C, s), null); assert.equal(Q.card(C, s, null), null); assert.match(Q.sig(null), /^none/);
});
test('actives: the followed quest first, then the main quest and open side quests, no duplicates, at most five', () => {
  const s = fresh(); C.daily('2026-10-18').forEach((q) => C.trackSide(s, q));
  const a = Q.actives(C, s, s.sideQuests[1].id);
  assert.equal(a[0].id, s.sideQuests[1].id); assert.equal(new Set(a.map((q) => q.id)).size, a.length); assert.ok(a.length <= 5 && a.length >= 4);
});
test('the signature changes when the next step changes, and not otherwise', () => {
  const s = fresh(), q = Q.current(C, s), a = Q.sig(Q.card(C, s, q));
  assert.equal(a, Q.sig(Q.card(C, s, q)));
  C.startSmall(s, q.id); assert.notEqual(a, Q.sig(Q.card(C, s, Q.current(C, s))));
});
test('/quest words: subcommands, synonyms, and a bare name means track', () => {
  assert.deepEqual(Q.parse(''), { sub: '', rest: '' });
  assert.deepEqual(Q.parse('next'), { sub: 'next', rest: '' });
  assert.deepEqual(Q.parse('done'), { sub: 'done', rest: '' });
  assert.deepEqual(Q.parse('check'), { sub: 'done', rest: '' });
  assert.deepEqual(Q.parse('track  Canal Saint-Martin '), { sub: 'track', rest: 'Canal Saint-Martin' });
  assert.deepEqual(Q.parse('Material world'), { sub: 'track', rest: 'Material world' });
  assert.deepEqual(Q.parse('hud off'), { sub: 'hud', rest: 'off' });
});
test('track names: exact beats prefix beats contains; accents and case don\'t matter; finished campaigns are out', () => {
  const s = fresh(), c = s.campaigns[1];
  assert.equal(Q.match(C, s, c.title).id, c.id);
  assert.equal(Q.match(C, s, c.title.slice(0, 5).toUpperCase()).kind, 'campaign');
  const d = C.daily('2026-10-18')[0]; C.trackSide(s, d);
  assert.equal(Q.match(C, s, d.title).kind, 'side');
  assert.equal(Q.match(C, s, 'zzzz-not-a-quest'), null);
  assert.equal(Q.norm('Été  Café'), 'ete cafe');
});
test('map pins: a field quest\'s place, distances in m / km, nearest first within 3 km', () => {
  const s = fresh();
  const c = C.startMapMission(s, 'place-canal', C.mapMissions[0].id), q = C.next(s, c);
  const cd = Q.card(C, s, q); assert.equal(cd.place.id, 'place-canal');
  const here = { lat: 48.8700, lon: 2.3600 }; // a few streets from the canal
  const list = Q.near(s, here); assert.equal(list[0].id, 'place-canal'); assert.ok(list.every((p, i) => i === 0 || p.km >= list[i - 1].km)); assert.ok(list.every((p) => p.km <= 3));
  assert.match(Q.say(0.34), /^\d+ m$/); assert.equal(Q.say(1.234), '1.2 km'); assert.equal(Q.walk(1.2), 15);
  assert.deepEqual(Q.near(s, null), []);
  const o = C.placeQuest(s, 'place-luxembourg'); assert.equal(Q.placeOf(s, C.next(s, o)).id, 'place-luxembourg');
});
console.log(`questhud-test: ${checks} checks passed`);
