const assert = require('node:assert/strict');
const C = require('../tools/quest-core');
const R = require('../tools/quest-review');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const fresh = () => C.upgrade(C.initial());
let serial = 0;
function finish(s, q) {
  const proof = { type: 'external', title: 'Fixture checklist', url: 'https://chatgpt.com/c/life-fixture', excerpt: 'TEST FIXTURE: a saved redacted checklist with the concrete action taken and its result.', images: [], analysis: '', coverage: 'Fixture excerpt only.', fingerprint: String(++serial).padStart(64, 'b') };
  const p = C.submit(s, q.id, proof);
  C.saveReview(s, q.id, p.id, { status: 'reviewed', score: 60, dimensions: [15,15,15,15], meetsBrief: true, summary: 'Fixture meets the small brief.', better: 'Make the next action more concrete.', next: 'Continue to the next checkpoint.', coverage: 'Text fixture only.', limitations: 'Not an assessment of the person.' });
  C.complete(s, q.id);
}
test('life routes are opt-in, isolated from catalog and idempotent across re-entry', () => {
  const s = fresh(), before = C.clone(s); assert.equal(C.lifeArcs.length, 6);
  assert.ok(!s.campaigns.some(c => c.id.startsWith('c-life-')));
  const c = C.startLifeArc(s, 'c-life-base', 'My music desk'); const first = c.quests[0]; finish(s, first);
  c.quests[1].title = 'My own setup'; c.paused = true;
  C.startLifeArc(s, c.id); assert.equal(c.intention, 'My music desk'); assert.equal(c.paused, false);
  assert.equal(c.quests[1].title, 'My own setup'); assert.notEqual(C.lifeArcs[0].quests[1].title, c.quests[1].title);
  assert.equal(s.campaigns.length, before.campaigns.length + 1); assert.equal(C.xp(s), 20);
  assert.deepEqual(s.deck, before.deck); assert.deepEqual(s.rewards, before.rewards); C.validate(s);
});
test('all eighteen life checkpoints obey proof, ordering, XP and round-trip persistence', () => {
  const s = fresh(); let expected = 0; const ids = new Set();
  for (const template of C.lifeArcs) {
    const c = C.startLifeArc(s, template.id, 'Personal finish line'); assert.equal(c.quests.length, 3);
    for (const q of c.quests) {
      assert.ok(!ids.has(q.id)); ids.add(q.id); assert.ok(q.proofHint && q.tiny && q.minutes <= 15);
      assert.equal(C.available(s, q.id), true); assert.throws(() => C.complete(s, q.id));
      C.startSmall(s, q.id); C.startSmall(s, q.id); finish(s, q); C.complete(s, q.id); expected += q.xp;
      assert.equal(C.xp(s), expected); C.validate(s);
    }
    assert.equal(C.campaignDone(s, c), true); const restored = C.upgrade(C.validate(JSON.parse(JSON.stringify(s)))); assert.deepEqual(restored, s);
  }
  assert.equal(ids.size, 18); assert.equal(C.mastery(s, 'restart').rank, 3); assert.equal(C.balance(s), Math.floor(expected / 5));
});
test('skip, pause and undo preserve honest badges and existing proof', () => {
  const s = fresh(), c = C.startLifeArc(s, 'c-life-admin'), [one,two,three] = c.quests;
  C.skip(s, one.id); assert.equal(C.xp(s), 0); finish(s, two); finish(s, three); assert.equal(C.campaignDone(s, c), false);
  C.revisit(s, one.id); finish(s, one); assert.equal(C.campaignDone(s, c), true);
  C.undo(s, three.id); assert.equal(C.campaignDone(s, c), false); assert.ok(C.latest(s, three.id).review);
  c.paused = true; assert.equal(C.available(s, three.id), false); C.startLifeArc(s, c.id); assert.equal(C.available(s, three.id), true); C.validate(s);
});
test('invalid selection, capacity, colliding quest IDs and invalid notes do not silently overwrite', () => {
  const s = fresh(); assert.throws(() => C.startLifeArc(s, 'missing')); const original = C.clone(s);
  s.sideQuests.push({ ...C.lifeArcs[0].quests[0], path: 'life' }); assert.throws(() => C.startLifeArc(s, 'c-life-base')); assert.equal(s.campaigns.length, original.campaigns.length);
  const full = fresh(); for (let i = full.campaigns.length; i < 100; i++) C.addCampaign(full, { title: 'Fixture', why: '', path: 'life', milestones: ['One step'] });
  assert.throws(() => C.startLifeArc(full, 'c-life-base')); assert.equal(full.campaigns.length, 100);
  const c = C.startLifeArc(original, 'c-life-base'); c.intention = { invalid: true }; assert.throws(() => C.validate(original));
});
test('everyday reviews assess concrete evidence without sharing the personal route note', () => {
  const s = fresh(), c = C.startLifeArc(s, 'c-life-admin', 'PRIVATE LOCAL INTENTION');
  const item = { brief: c.quests[0].done, intent: '', proof: { title: 'Redacted checklist', type: 'file', excerpt: 'Task, next action and finish line.', analysis: '', coverage: 'Actual text.', images: [] } };
  const prompt = R.prompt(C.find(s, c.quests[0].id), item);
  assert.ok(prompt.includes('Everyday quest rubric')); assert.ok(prompt.includes('not independently verified')); assert.ok(prompt.includes('A bare claim of done is insufficient'));
  assert.ok(!prompt.includes('PRIVATE LOCAL INTENTION')); assert.ok(!R.prompt(C.find(s, 'q-material-seed'), item).includes('Everyday quest rubric'));
});
console.log(`Life expeditions: ${checks} behavior checks passed.`);
