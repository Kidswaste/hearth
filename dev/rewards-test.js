// (round 63, rewards63) Real rewards for real quests (rewards-core.js) on Codex's own QuestCore and weekquest62's
// streak: XP ↔ sparks math, "N XP to your next reward", claiming never below zero, the capped streak bonus, the
// savings jar (the owner moves the money), the history, the chat words.
const assert = require('node:assert/strict');
const C = require('../tools/quest-core');
const W = require('../weekquest-core');
const R = require('../rewards-core');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const fresh = () => { const s = C.upgrade(C.validate(C.initial())); s.rewards = []; s.rewardGoal = null; return s; };
// earn XP with a one-quest campaign of `xp` (no proof rule in this fixture: Codex's own complete())
let n = 0;
function earn(s, xp, at = new Date().toISOString(), path = 'music') {
  if (xp > 100) { earn(s, xp - 100, at, path); xp = 100; } // a quest gives 5–100 XP (Codex's rule)
  const c = C.addCampaign(s, { title: `Earn ${++n}`, why: 'test', path, milestones: ['one'] }); c.quests[0].xp = xp;
  const studio = s.studio; delete s.studio; C.complete(s, c.quests[0].id, {}, at); s.studio = studio; return c;
}

test('a reward is added in XP and kept in sparks (5 XP each), like the Studio\'s own rewards', () => {
  const s = fresh(), r = R.add(C, s, { name: 'A new record at Superfly', xp: 300 });
  assert.equal(r.cost, 60); assert.equal(R.xpOf(r.cost), 300); assert.equal(R.sparksFor(302), 61);
  C.validate(s);
  assert.throws(() => R.add(C, s, { name: 'a new record at superfly', xp: 100 }), /already/);
  assert.throws(() => R.add(C, s, { name: 'x', xp: 0 }), /cost in XP/);
  assert.throws(() => R.add(C, s, { name: '', xp: 100 }), /Name/);
});
test('XP balance math with Codex\'s XP: exact XP to go, counting XP between two sparks', () => {
  const s = fresh(); R.add(C, s, { name: 'Breakfast', xp: 200 });
  earn(s, 37); // 37 XP → 7 sparks, 2 XP toward the 8th
  const w = R.wallet(C, s); assert.equal(w.xp, 37); assert.equal(w.sparks, 7); assert.equal(w.spendXp, 35);
  const cd = R.next(C, s); assert.equal(cd.toGo, 200 - 37); assert.equal(cd.ready, false);
  assert.equal(R.say(cd), '163 XP to your next reward: Breakfast');
  earn(s, 100); earn(s, 63); // 200 XP
  assert.equal(R.next(C, s).ready, true); assert.equal(R.next(C, s).toGo, 0);
});
test('the next reward: your goal, else the biggest one ready now, else the nearest one ahead', () => {
  const s = fresh(); const a = R.add(C, s, { name: 'Small', xp: 50 }), b = R.add(C, s, { name: 'Mid', xp: 200 }), c = R.add(C, s, { name: 'Big', xp: 500 });
  earn(s, 40); assert.equal(R.next(C, s).id, a.id); assert.equal(R.next(C, s).toGo, 10);
  earn(s, 20); assert.equal(R.next(C, s).id, a.id); assert.equal(R.next(C, s).ready, true);
  C.redeem(s, a.id); assert.equal(R.next(C, s).id, b.id, 'claimed and not yet enjoyed: it steps aside');
  C.enjoyReward(s, s.redemptions[0].id); earn(s, 50);
  s.rewardGoal = c.id; assert.equal(R.next(C, s).id, c.id); assert.equal(R.next(C, s).goal, true);
  assert.deepEqual(R.ready(C, s).map((r) => r.id), [a.id]);
  s.rewardGoal = null; earn(s, 200); assert.equal(R.next(C, s).id, b.id, 'the biggest one ready now');
  C.redeem(s, b.id); assert.equal(R.next(C, s).id, a.id, 'Mid claimed, not enjoyed yet: it steps aside');
});
test('redeem can\'t go negative: refused with XP to go, nothing written; claimed once affordable', () => {
  const s = fresh(), r = R.add(C, s, { name: 'Record', xp: 300 });
  earn(s, 100);
  const before = JSON.stringify(s);
  assert.throws(() => R.redeem(C, s, r.id), /200 XP to go/); assert.equal(JSON.stringify(s), before);
  earn(s, 100); earn(s, 100);
  const receipt = R.redeem(C, s, r.id); assert.equal(receipt.cost, 60); assert.equal(C.balance(s), 0);
  assert.throws(() => R.redeem(C, s, r.id), /XP to go/);
  assert.throws(() => C.redeem(s, r.id), /more sparks/); // Codex's own rule agrees
  assert.equal(C.xp(s), 300, 'claiming never lowers XP'); C.validate(s);
  C.returnReward(s, receipt.id); assert.equal(C.balance(s), 60, 'a returned reward gives its sparks back');
});
test('history: newest first, with claimed / enjoyed / returned', () => {
  const s = fresh(), r = R.add(C, s, { name: 'Coffee', xp: 25 }); earn(s, 100);
  const a = R.redeem(C, s, r.id, '2026-10-01T10:00:00.000Z'), b = R.redeem(C, s, r.id, '2026-10-02T10:00:00.000Z'), c = R.redeem(C, s, r.id, '2026-10-03T10:00:00.000Z');
  C.enjoyReward(s, a.id, 'good'); C.returnReward(s, b.id);
  const h = R.history(s);
  assert.deepEqual(h.map((x) => x.id), [c.id, b.id, a.id]); assert.deepEqual(h.map((x) => x.state), ['claimed', 'returned', 'enjoyed']);
  assert.equal(h[0].xp, 25);
});
test('streak bonus from weekquest62\'s streak: once a week, 1 spark per week beyond the first, capped at 4', () => {
  const s = fresh(); const now = Date.parse('2026-10-15T12:00:00'); // a Thursday
  const wk = (k) => new Date(W.parse(W.addDays(W.monday(W.key(new Date(now))), -7 * k)).getTime() + 36e6).toISOString();
  earn(s, 35, wk(0), 'life');
  assert.equal(R.bonusDue(C, W, s, now), null, 'a 1-week streak gives no bonus');
  earn(s, 35, wk(1), 'life'); earn(s, 35, wk(2), 'life');
  const due = R.bonusDue(C, W, s, now); assert.deepEqual([due.streak, due.sparks], [3, 2]);
  const bal = C.balance(s); R.grantBonus(C, W, s, now); assert.equal(C.balance(s), bal + 2); C.validate(s);
  assert.equal(R.bonusDue(C, W, s, now), null, 'only once a week'); assert.equal(R.grantBonus(C, W, s, now), null);
  for (let k = 3; k < 12; k++) earn(s, 35, wk(k), 'life');
  const next = Date.parse('2026-10-22T12:00:00'); earn(s, 35, new Date(next).toISOString(), 'life');
  assert.equal(R.bonusDue(C, W, s, next).sparks, R.BONUS_MAX, 'a 13-week streak still gets at most 4 sparks');
  R.grantBonus(C, W, s, next); assert.equal(C.bonus(s), 6);
  // a forged bonus is refused by the journal's own check
  const bad = C.clone(s); bad.rewardBonus.weeks.push({ week: '2026-01-05', sparks: 50, streak: 3, at: new Date().toISOString() });
  assert.throws(() => C.validate(bad), /streak bonus/);
  const dup = C.clone(s); dup.rewardBonus.weeks.push({ ...dup.rewardBonus.weeks[0] }); assert.throws(() => C.validate(dup), /streak bonus/);
});
test('savings jar: claimed jar rewards wait for you to move the money; notes never go below €0', () => {
  const s = fresh(), r = R.add(C, s, { name: 'Concert ticket fund +€10', xp: 50, jar: 10 }); earn(s, 100);
  const rc = R.redeem(C, s, r.id);
  let j = R.jar(s); assert.equal(j.total, 0); assert.equal(j.toMove, 10); assert.equal(j.pending[0].receipt, rc.id);
  R.jarMove(C, s, { amount: 10, receipt: rc.id, note: 'moved' });
  j = R.jar(s); assert.equal(j.total, 10); assert.equal(j.pending.length, 0);
  assert.throws(() => R.jarMove(C, s, { amount: 10, receipt: rc.id }), /Already/);
  assert.throws(() => R.jarMove(C, s, { amount: -25 }), /below €0/);
  R.jarMove(C, s, { amount: -10, note: 'ticket' }); assert.equal(R.jar(s).total, 0);
  assert.ok(R.checkJar(s.rewardJar)); C.validate(s);
  const rc2 = R.redeem(C, s, r.id); C.returnReward(s, rc2.id); assert.equal(R.jar(s).pending.length, 0, 'a returned claim asks nothing');
  for (let i = 0; i < 520; i++) R.jarMove(C, s, { amount: 1 });
  assert.ok(s.rewardJar.moves.length <= 500); assert.equal(R.jar(s).total, 520, 'old notes fold without changing the total');
});
test('starters: kind, editable, added once; a removed reward keeps its claims', () => {
  const s = fresh(); assert.equal(R.starters(s).length, R.STARTERS.length);
  const r = R.addStarter(C, s, 'superfly'); assert.equal(r.cost, 60); assert.equal(R.addStarter(C, s, 'superfly'), r);
  assert.ok(!R.starters(s).some((x) => x.key === 'superfly'));
  const fund = R.addStarter(C, s, 'concert-fund'); assert.equal(fund.jar, 10);
  R.edit(C, s, r.id, { xp: 350 }); assert.equal(r.cost, 70);
  earn(s, 400); R.redeem(C, s, r.id); s.rewardGoal = r.id; R.remove(s, r.id);
  assert.equal(s.rewardGoal, null); assert.equal(R.history(s)[0].name, 'A new record at Superfly'); C.validate(s);
});
test('chat words: /reward add parsing, sub-commands, matching by name', () => {
  assert.deepEqual(R.parseAdd('new record at Superfly 300'), { name: 'new record at Superfly', xp: 300, jar: 0 });
  assert.deepEqual(R.parseAdd('a long breakfast at Enfants Rouges 200xp'), { name: 'a long breakfast at Enfants Rouges', xp: 200, jar: 0 });
  assert.deepEqual(R.parseAdd('concert ticket fund +10€ 500 XP'), { name: 'concert ticket fund +10€', xp: 500, jar: 10 });
  assert.equal(R.parseAdd('no cost here').xp, null);
  assert.deepEqual(R.parse('add x 5'), { sub: 'add', rest: 'x 5' }); assert.equal(R.parse('claim x').sub, 'redeem'); assert.equal(R.parse('').sub, '');
  const s = fresh(); R.add(C, s, { name: 'A new record at Superfly', xp: 300 }); R.add(C, s, { name: 'A new Serum preset pack', xp: 400 });
  assert.equal(R.match(s, 'superfly').name, 'A new record at Superfly'); assert.equal(R.match(s, 'serum').name, 'A new Serum preset pack');
  assert.equal(R.match(s, 'a new'), null, 'two fit: ask for more words'); assert.equal(R.match(s, 'nothing like it'), null);
  assert.match(R.summary(C, s), /XP to spend/);
});
console.log(`rewards-test: ${checks} checks passed`);
