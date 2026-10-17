const assert = require('node:assert/strict');
const C = require('../tools/quest-core'), D = require('../tools/quest-catalog');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const fresh = () => C.upgrade(C.initial());
const filters = (patch = {}) => ({ lane: 'any', mood: 'any', minutes: 60, shelf: 'all', ...patch });
test('thirty unique authored cards cover all five worlds and fit journal bounds with their twist', () => {
  assert.equal(D.deck.length, 30); assert.equal(new Set(D.deck.map(c => c.id)).size, 30);
  for (const lane of C.deckLanes.slice(1)) assert.ok(D.deck.filter(c => c.lane === lane).length >= 4);
  for (const c of D.deck) { const s = fresh(); s.deck.hand = [c.id]; const q = C.takeCard(s, c.id, true); assert.ok(q.done.includes(c.twist)); assert.ok(q.tiny && q.tool !== undefined); C.validate(s); }
});
test('upgrading an existing studio preserves submissions, contracts, reward goal and earned progress', () => {
  const old = fresh(); delete old.deck; old.rewardGoal = old.rewards[0].id; old.contracts['q-studio-demo-hook'] = 'sketch'; C.startSmall(old, 'q-studio-demo-hook');
  C.submit(old, 'q-studio-demo-hook', { type: 'external', title: 'Saved demo work', url: 'https://chatgpt.com/c/saved-demo', excerpt: 'Previously saved demo output and an arrangement excerpt retained through the deck upgrade.', images: [], analysis: '', coverage: 'Saved excerpt only.', fingerprint: 'b'.repeat(64) });
  const s = C.upgrade(old); assert.equal(old.deck, undefined); assert.deepEqual(s.contracts, old.contracts); assert.deepEqual(s.submissions, old.submissions); assert.equal(s.rewardGoal, old.rewardGoal); assert.equal(C.xp(s), 5); assert.deepEqual(C.upgrade(s), s);
});
test('deals visit the entire deck before repeating, persist order and never change XP', () => {
  let s = fresh(); const seen = [];
  for (let i = 0; i < 10; i++) { seen.push(...C.deckHand(s).map(c => c.id)); s = C.validate(JSON.parse(JSON.stringify(s))); C.deal(s); }
  assert.equal(new Set(seen).size, 30); assert.deepEqual(s.deck.hand, seen.slice(0, 3)); assert.equal(C.xp(s), 0);
});
test('filters, saved-only crate and hidden cards work together without fallback surprises', () => {
  const s = fresh(); C.markCard(s, 'tape-tail', 'saved'); C.markCard(s, 'frame-chrome', 'saved');
  C.deal(s, filters({ lane: 'music', minutes: 5, shelf: 'saved' })); assert.deepEqual(s.deck.hand, ['tape-tail']);
  C.markCard(s, 'tape-tail', 'hidden'); assert.equal(C.deckHand(s).length, 0); C.deal(s); assert.equal(s.deck.hand.length, 0);
  C.markCard(s, 'tape-tail', 'hidden'); C.deal(s); assert.deepEqual(s.deck.hand, ['tape-tail']);
  C.deal(s, filters({ lane: 'forge', mood: 'reset' })); assert.equal(s.deck.hand.length, 0);
  assert.equal(C.xp(s), 0); C.validate(s);
});
test('taking freezes the chosen brief, respects three slots and cannot mint duplicate quests', () => {
  const s = fresh(), cid = s.deck.hand[0], q = C.takeCard(s, cid, true); assert.equal(C.xp(s), 0);
  assert.equal(C.takeCard(s, cid, false).id, q.id); assert.equal(s.sideQuests.length, 1); assert.equal(s.sideQuests[0].deckTwist, true);
  for (const id of [...s.deck.hand]) C.takeCard(s, id); C.deal(s);
  const before = C.clone(s); assert.throws(() => C.takeCard(s, s.deck.hand[0]), /three/); assert.deepEqual(s, before);
  C.skip(s, q.id); const next = C.takeCard(s, s.deck.hand[0]); assert.ok(next); assert.ok(!C.deckPool(s).some(c => c.id === cid));
  assert.throws(() => C.takeCard(s, 'tape-answer'), /Deal/); assert.equal(C.xp(s), 0); C.validate(s);
});
test('deck quests retain proof gate and award XP once, independent of scores or twist', () => {
  const s = fresh(), q = C.takeCard(s, s.deck.hand[0], true); C.startSmall(s, q.id); assert.throws(() => C.complete(s, q.id), /proof/);
  const item = C.submit(s, q.id, { type: 'external', title: 'Actual test output', url: 'https://chatgpt.com/c/deck-proof', excerpt: 'Actual work excerpt with the exported artifact and the bounded change described.', images: [], analysis: '', coverage: 'Pasted text only.', fingerprint: 'a'.repeat(64) });
  assert.equal(item.brief, q.done);
  C.saveReview(s, q.id, item.id, { status: 'reviewed', score: 40, dimensions: [10,10,10,10], meetsBrief: true, summary: 'Fixture meets the chosen brief.', better: 'Improve the supporting part.', next: 'Change one note.', coverage: 'Fixture excerpt only.', limitations: 'No audio assessment.' });
  assert.equal(C.complete(s, q.id), 30); assert.equal(C.complete(s, q.id), 0); assert.equal(C.xp(s), 35); assert.equal(C.balance(s), 7); C.validate(s);
});
test('corrupt imports are rejected while old journals without deck metadata remain readable', () => {
  C.validate(C.initial());
  for (const change of [s => s.deck.v = 9, s => s.deck.hand.push(s.deck.hand[0]), s => s.deck.saved = ['missing'], s => s.deck.filters.minutes = -1, s => s.deck.seen = 'wrong', s => s.deck.filters.lane = 'invented']) { const s = fresh(); change(s); assert.throws(() => C.validate(s)); }
  const s = fresh(); C.takeCard(s, s.deck.hand[0]); s.sideQuests[0].deckTwist = 'yes'; assert.throws(() => C.validate(s));
});
console.log(`${checks} mixtape behavior checks passed`);
