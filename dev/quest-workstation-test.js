const assert = require('node:assert/strict');
const C = require('../tools/quest-core');
let checks = 0; const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const fresh = () => C.upgrade(C.initial());
const proof = n => ({ type: 'external', title: 'Fixture work', url: 'https://chatgpt.com/c/workstation-fixture', excerpt: 'Actual fixture output with the exported result and reproduction steps in this excerpt.', images: [], analysis: '', coverage: 'Fixture excerpt only.', fingerprint: String(n).padStart(64, 'a') });
const review = { status: 'reviewed', score: 40, dimensions: [10,10,10,10], meetsBrief: true, summary: 'Fixture meets the brief.', better: 'Improve one detail.', next: 'Make one changed export.', coverage: 'Text fixture only.', limitations: 'No audio or gameplay assessment.' };
let proofNumber = 0;
function finish(s, q) { const p = C.submit(s, q.id, proof(++proofNumber)); C.saveReview(s, q.id, p.id, review); C.complete(s, q.id); }
test('workstation upgrade preserves deck, proof, rewards and earned XP, and is idempotent', () => {
  const old = fresh(); delete old.workstation; const q = C.find(old, 'q-material-seed'); finish(old, q); old.deck.saved.push('forge-drone');
  const s = C.upgrade(old); assert.equal(old.workstation, undefined); assert.deepEqual(s.deck, old.deck); assert.deepEqual(s.submissions, old.submissions); assert.deepEqual(s.rewards, old.rewards); assert.equal(C.xp(s), 25); assert.deepEqual(C.upgrade(s), s);
});
test('all eight specializations have reachable practice and earn exactly three evidence-based ranks', () => {
  for (const route of C.specializations) {
    const s = fresh();
    for (let i = 0; i < 5; i++) { const q = C.startPractice(s, route.id); assert.ok(q); finish(s, q); assert.equal(C.mastery(s, route.id).count, i + 1); C.validate(s); }
    const m = C.mastery(s, route.id); assert.equal(m.rank, 3); C.equipTitle(s, route.id, 3); assert.equal(C.activeTitle(s).name, route.titles[2]); C.validate(s);
  }
});
test('small starts, legacy unreviewed finishes and revisions cannot manufacture specialization ranks', () => {
  const old = C.initial(); C.complete(old, 'q-material-seed'); const s = C.upgrade(old);
  assert.equal(C.mastery(s, 'materials').count, 0); const q = C.startPractice(s, 'songs'); C.startSmall(s, q.id); assert.equal(C.mastery(s, 'songs').count, 0); assert.throws(() => C.equipTitle(s, 'songs', 1));
  finish(s, q); const revision = C.revisionQuest(s, q.id); finish(s, revision); assert.equal(C.mastery(s, 'songs').count, 1); assert.equal(C.mastery(s, 'finish').count, 1);
});
test('mastery keeps approved completion while a new version waits, and undo removes active title eligibility', () => {
  const s = fresh(), q = C.startPractice(s, 'forgeheart'); finish(s, q); C.equipTitle(s, 'forgeheart', 1); C.submit(s, q.id, proof(999));
  assert.equal(C.mastery(s, 'forgeheart').rank, 1); assert.ok(C.activeTitle(s)); C.undo(s, q.id); assert.equal(C.activeTitle(s), null); assert.equal(C.mastery(s, 'forgeheart').rank, 0); C.validate(s);
});
test('practice respects locked campaigns, parked work, hidden cards and side capacity', () => {
  const s = fresh(); s.campaigns.forEach(c => c.paused = true); s.deck.hidden.push('forge-drone');
  const q = C.startPractice(s, 'forgeheart'); assert.equal(q.deckCard, 'forge-affix'); s.sideQuests[0].parked = true;
  for (const id of ['tape-hook','frame-chrome','feel-impact']) { s.deck.hand = [id]; C.takeCard(s, id); }
  assert.equal(C.practicePick(s, 'forgeheart'), null); assert.throws(() => C.startPractice(s, 'forgeheart')); assert.equal(C.xp(s), 0);
});
test('stocking a blueprint is explicit and idempotent, preserves customized names and spends nothing', () => {
  const s = fresh(), old = s.rewards.length; const r = C.stockReward(s, 'game-night', { name: 'My exact game', cost: 7, note: 'Saturday after dinner.' });
  assert.equal(s.rewards.length, old + 1); assert.equal(C.stockReward(s, 'game-night', { name: 'Replacement', cost: 90 }).name, 'My exact game'); assert.equal(C.balance(s), 0); assert.equal(s.redemptions.length, 0); assert.throws(() => C.stockReward(s, 'first-listen', { cost: -1 })); assert.equal(s.rewards.length, old + 1); C.validate(s);
});
test('enjoy-later receipts keep the ritual, never change XP and refund once only after undoing enjoyed', () => {
  const s = fresh(); finish(s, C.find(s, 'q-material-seed')); const r = C.stockReward(s, 'first-listen', { cost: 4, note: 'My own demo in the headphones.' }); const receipt = C.redeem(s, r.id);
  r.note = 'Changed later'; assert.equal(receipt.plan, 'My own demo in the headphones.'); const xp = C.xp(s), balance = C.balance(s);
  C.enjoyReward(s, receipt.id, 'Loved the ending.'); C.enjoyReward(s, receipt.id, 'Ignored duplicate'); assert.equal(receipt.note, 'Loved the ending.'); assert.equal(C.balance(s), balance); assert.equal(C.xp(s), xp); assert.throws(() => C.returnReward(s, receipt.id));
  delete receipt.enjoyedAt; delete receipt.note; C.returnReward(s, receipt.id); C.returnReward(s, receipt.id); assert.equal(C.balance(s), balance + 4); assert.throws(() => C.enjoyReward(s, receipt.id)); C.validate(s);
});
test('invalid loadouts and malformed receipt metadata are rejected on restore', () => {
  for (const mutate of [s => s.workstation.accent = 'css()', s => s.workstation.callsign = '', s => s.workstation.target = 'unknown', s => s.workstation.title = { route: 'songs', rank: 4 }, s => s.workstation.lamp = 'yes', s => s.rewards[0].note = 'x'.repeat(501)]) { const s = fresh(); mutate(s); assert.throws(() => C.validate(s)); }
  const s = fresh(); finish(s, C.find(s, 'q-material-seed')); const r = C.stockReward(s, 'first-listen', { cost: 1 }); const receipt = C.redeem(s, r.id); receipt.enjoyedAt = 'invalid'; assert.throws(() => C.validate(s));
});
console.log(`${checks} workstation behavior checks passed`);
