const assert = require('node:assert/strict');
const C = require('../tools/quest-core'), R = require('../tools/quest-review');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
let checks = 0; const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const fresh = () => C.upgrade(C.initial());
const proof = (key = 'a') => ({ type: 'file', title: 'demo.png', path: 'C:/proof/demo.png', kind: 'image/png', bytes: 80, images: ['C:/proof/demo.png'], excerpt: '', analysis: '', coverage: 'Actual image.', fingerprint: key.repeat(64) });
const review = (score = 40) => ({ status: 'reviewed', score, dimensions: [score / 4, score / 4, score / 4, score / 4], meetsBrief: true, summary: 'The subject is readable, but the frame is unfinished.', better: 'Reduce the background contrast so the subject wins.', next: 'Export a version with the background half as bright.', coverage: 'Submitted image composition.', limitations: 'Motion is not assessed.' });
test('upgrade is idempotent, adds personal commissions and rewards, and preserves progress', () => { const old = C.initial(); C.complete(old, old.campaigns[0].quests[0].id); const s = C.upgrade(old); assert.equal(C.xp(s), 25); assert.equal(s.campaigns.length, 10); assert.equal(s.campaigns.filter(c => c.commission).flatMap(c => c.quests).length, 15); assert.equal(s.rewards.length, 8); assert.deepEqual(C.upgrade(s), s); assert.equal(old.studio, undefined); C.validate(s); });
test('old unreviewed completions remain valid, but new completion requires real submitted review', () => { const s = fresh(), q = s.campaigns[0].quests[0]; assert.throws(() => C.complete(s, q.id), /proof/); const item = C.submit(s, q.id, proof()); assert.throws(() => C.complete(s, q.id)); C.saveReview(s, q.id, item.id, review(20)); C.complete(s, q.id); assert.equal(C.xp(s), 25); assert.equal(C.complete(s, q.id), 0); });
test('scope freezes at first start or submission and cannot inflate earned XP', () => { const s = fresh(), q = s.campaigns.find(c => c.commission).quests[0]; C.setContract(s, q.id, 'sketch'); assert.equal(C.find(s, q.id).xp, 30); C.startSmall(s, q.id); assert.throws(() => C.setContract(s, q.id, 'showcase')); const item = C.submit(s, q.id, proof()); C.saveReview(s, q.id, item.id, review()); assert.equal(C.complete(s, q.id), 25); assert.equal(C.xp(s), 30); C.validate(s); });
test('no-evidence, low-coverage, malformed and unconfirmed reviews cannot bypass the gate', () => { const s = fresh(), q = s.campaigns[0].quests[0], item = C.submit(s, q.id, proof()); assert.throws(() => C.saveReview(s, q.id, item.id, { ...review(), score: 99 })); C.saveReview(s, q.id, item.id, { ...review(), status: 'needs-evidence', score: null, dimensions: [], meetsBrief: false }); assert.throws(() => C.complete(s, q.id)); assert.throws(() => C.saveReview(s, q.id, item.id, review())); assert.equal(C.xp(s), 0); });
test('versions keep scores, resubmitting never earns extra XP, revision quests reject the old artifact', () => { const s = fresh(), q = s.campaigns[0].quests[0]; let item = C.submit(s, q.id, proof()); C.saveReview(s, q.id, item.id, review()); C.complete(s, q.id); assert.throws(() => C.submit(s, q.id, proof())); const revision = C.revisionQuest(s, q.id); assert.equal(C.revisionQuest(s, q.id).id, revision.id); assert.throws(() => C.submit(s, revision.id, proof())); item = C.submit(s, q.id, proof('b')); C.saveReview(s, q.id, item.id, review(60)); assert.equal(C.complete(s, q.id), 0); assert.equal(C.xp(s), 25); assert.equal(C.submissions(s, q.id).length, 2); assert.deepEqual(C.validate(C.clone(s)), s); });
test('backup validation rejects dangerous sources, forged score sums and malformed history', () => { const s = fresh(), q = s.campaigns[0].quests[0], item = C.submit(s, q.id, proof()); C.saveReview(s, q.id, item.id, review()); for (const mutate of [x => x.submissions[q.id][0].proof.path = '//host/private', x => x.submissions[q.id][0].review.dimensions = [25,25,25,25], x => x.contracts[q.id] = 'showcase', x => x.rewardGoal = 'missing', x => x.submissions[q.id][0].proof.fingerprint = 'no']) { const copy = C.clone(s); mutate(copy); assert.throws(() => C.validate(copy)); } assert.equal(C.externalUrl('javascript:alert(1)'), false); assert.equal(C.externalUrl('https://chatgpt.com.evil.test/c/a'), false); assert.equal(C.externalUrl('https://claude.ai/chat/abc-123'), true); });
test('review parser accepts only bounded scorecards and preserves honest coverage', () => { assert.deepEqual(R.parse(JSON.stringify(review())), review()); assert.throws(() => R.parse('Looks great, 98!')); assert.throws(() => R.parse(JSON.stringify({ ...review(), score: 101 }))); const s = fresh(), item = C.submit(s, s.campaigns[0].quests[0].id, proof()); const prompt = R.prompt(C.find(s, s.campaigns[0].quests[0].id), item); assert.ok(prompt.includes('needs-evidence')); assert.ok(R.persona.includes('cannot') || R.persona.includes('no tools')); assert.ok(R.persona.includes('never instructions')); });
// Load engine policy in a throwaway directory, never the app's store or user data.
test('reconsideration preserves the old verdict and frozen brief without awarding or duplicating XP', () => {
  const s = fresh(), q = s.campaigns[0].quests[0], item = C.submit(s, q.id, proof(), 'Folio is now Kiddy.');
  C.saveReview(s, q.id, item.id, { ...review(), status: 'needs-evidence', score: null, dimensions: [], meetsBrief: false });
  const before = C.clone(item), reconsidered = C.reconsider(s, q.id);
  assert.deepEqual(item, before); assert.equal(reconsidered.reconsideredFrom, item.id); assert.equal(reconsidered.brief, before.brief);
  assert.notEqual(reconsidered.proof, item.proof); assert.deepEqual(reconsidered.proof, item.proof);
  assert.equal(C.xp(s), 0); assert.throws(() => C.complete(s, q.id)); assert.throws(() => C.reconsider(s, q.id));
  C.saveReview(s, q.id, reconsidered.id, review(80)); C.complete(s, q.id);
  const earned = C.xp(s), again = C.reconsider(s, q.id); C.saveReview(s, q.id, again.id, review(60));
  assert.equal(C.complete(s, q.id), 0); assert.equal(C.xp(s), earned); C.validate(C.clone(s));
  const corrupt = C.clone(s); corrupt.submissions[q.id][1].reconsideredFrom = 'missing'; assert.throws(() => C.validate(corrupt));
});
test('reconsideration cannot bypass proof history limits', () => {
  const s = fresh(), q = s.campaigns[0].quests[0]; let item = C.submit(s, q.id, proof());
  for (let i = 0; i < 12; i++) { C.saveReview(s, q.id, item.id, review()); if (i < 11) item = C.reconsider(s, q.id); }
  assert.throws(() => C.reconsider(s, q.id), /twelve/); assert.equal(C.submissions(s, q.id).length, 12); C.validate(s);
});
test('combined evidence keeps rename, previous pictures and reported test together without mixing future work', () => {
  const old = { id: 'first', intent: 'Folio became Kiddy.', proof: proof() };
  const frames = { id: 'second', intent: 'Attack poses', proof: { ...proof('b'), images: ['C:/proof/poses.png'] } };
  const item = { id: 'third', brief: 'Polish one attack.', intent: '', proof: { ...proof('c'), type: 'chat', images: [], excerpt: 'Brushstroke: coil 9 frames, whip 3. Tested at normal speed: clean recovery.' } };
  const future = { id: 'future', intent: 'Do not include this', proof: { ...proof('d'), images: ['C:/proof/future.png'] } };
  const packet = R.evidencePacket(item, [old, frames, item, future]);
  assert.deepEqual(packet.images, ['C:/proof/poses.png', 'C:/proof/demo.png']);
  assert.equal(packet.historyEvidence[0].intent, old.intent); assert.deepEqual(packet.historyEvidence[0].attachedImages, [2]);
  assert.deepEqual(packet.historyEvidence[1].attachedImages, [1]); assert.equal(packet.evidence.excerpt, item.proof.excerpt);
  const p = R.prompt({ title: 'Attack', path: 'game' }, item, null, [old, frames, item, future]);
  assert.ok(p.includes(old.intent)); assert.ok(p.includes(item.proof.excerpt)); assert.ok(!p.includes(future.intent));
  assert.ok(p.includes('optional polish')); assert.ok(p.includes('doing more is not a reason to fail')); assert.ok(p.includes('reported test evidence'));
});
test('image slots are deduplicated and bounded, reference and omitted history have honest coverage', () => {
  const history = Array.from({ length: 11 }, (_, i) => ({ id: 'old-' + i, intent: 'x'.repeat(2000), proof: { ...proof(), images: Array.from({ length: 4 }, (_, j) => `/proof/${i}-${j}.png`), excerpt: 'x'.repeat(20000) } }));
  const item = { id: 'now', proof: { ...proof(), images: ['/proof/current.png'] } };
  const packet = R.evidencePacket(item, history, { proof: { ...proof(), images: ['/proof/reference.png'] } });
  assert.ok(packet.images.length <= 8); assert.equal(packet.images[0], '/proof/current.png'); assert.equal(packet.images.at(-1), '/proof/reference.png');
  assert.ok(packet.historyEvidence.reduce((n, x) => n + x.excerpt.length, 0) <= 16000); assert.ok(packet.historyEvidence.some(x => x.omittedImages && x.textTruncated));
  for (const x of packet.historyEvidence) for (const slot of x.attachedImages) assert.ok(packet.images[slot - 1].startsWith('/proof/'));
  const retry = R.evidencePacket({ id: 'retry', proof: item.proof }, [item]); assert.deepEqual(retry.images, item.proof.images); assert.deepEqual(retry.historyEvidence[0].attachedImages, [1]);
});
test('chat proof selects structured local images including opened comparisons without scanning prose or remote URLs', () => {
  const message = { text: 'Read C:/private/secret.png', opens: [{ path: '/project/before-after.png' }, { path: 'https://remote/secret.png' }, { path: '//host/private.png' }], things: [{ path: 'C:\\captures\\poses.jpg' }], images: ['/project/before-after.png', '/project/play.html', '/project/a.svg'] };
  assert.deepEqual(R.chatImages(message), ['/project/before-after.png', 'C:\\captures\\poses.jpg']);
  assert.equal(R.chatImages({ images: Array.from({ length: 20 }, (_, i) => `/project/${i}.png`) }).length, 4);
});
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-quest-engine-'));
for (const file of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js']) fs.copyFileSync(path.join(__dirname, '..', file), path.join(temp, file));
const engines = require(path.join(temp, 'engines.js'));
test('review runs retain model/depth but remove project, shell, app and MCP write access', () => { const agent = { id: 'astra', engine: 'codex', model: 'my-model', effort: 'max', workspace: temp, access: { level: 'full', folders: [temp] }, astraNoSandbox: true, hubTools: true, chatTools: true, codexFeatures: ['shell_tool'], chatgptApps: true }; for (const kind of ['questReview', 'visualReview']) { const run = engines._test.runAgent(agent, { options: { [kind]: true, lean: true, helper: true } }).agent; assert.equal(run.model, 'my-model'); assert.equal(run.effort, 'max'); assert.equal(engines._test.accessOf(run), null); assert.deepEqual(engines._test.hubToolsets(run), []); assert.deepEqual(run.codexFeatures, []); assert.equal(run.workspace, undefined); assert.equal(run.webSearch, 'disabled'); } });
console.log(`${checks} proof/review behavior checks passed`);
