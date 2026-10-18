// parisquests61: the Paris guide data (fields, bounds, arrondissements) and its quest rules, on throwaway journals.
const assert = require('node:assert/strict');
const C = require('../tools/quest-core');
const P = require('../tools/quest-paris');
let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
const fresh = () => C.upgrade(C.initial());
const proof = n => ({ type: 'chat', title: 'Fixture field note ' + n, chatId: 'chat-fixture', agentId: 'astra', messageId: String(n), excerpt: 'TEST FIXTURE: field note', analysis: '', coverage: 'Fixture only', images: [], fingerprint: String(n).repeat(64).slice(0, 64) });
const review = { status: 'reviewed', meetsBrief: true, score: 60, dimensions: [15, 15, 15, 15], summary: 'Fixture finish.', better: 'Fixture edit.', next: 'Fixture next.', coverage: 'Fixture evidence.', limitations: 'Fixture review.' };
const finish = (s, qid, n) => { const item = C.submit(s, qid, proof(n)); C.saveReview(s, qid, item.id, review); return C.complete(s, qid); };
// Rough centre of each arrondissement (12e without the Bois de Vincennes, 16e without the Bois de Boulogne).
const ARR = { 1: [48.8625, 2.3364], 2: [48.8683, 2.3428], 3: [48.8630, 2.3601], 4: [48.8543, 2.3576], 5: [48.8445, 2.3507], 6: [48.8491, 2.3328], 7: [48.8562, 2.3122], 8: [48.8727, 2.3125], 9: [48.8771, 2.3375], 10: [48.8761, 2.3607], 11: [48.8591, 2.3800], 12: [48.8396, 2.3876], 13: [48.8283, 2.3623], 14: [48.8292, 2.3266], 15: [48.8401, 2.2929], 16: [48.8604, 2.2700], 17: [48.8873, 2.3067], 18: [48.8925, 2.3484], 19: [48.8871, 2.3848], 20: [48.8634, 2.4012] };
const km = ([a, b], [c, d]) => Math.hypot((a - c) * 111.2, (b - d) * 73.2);

test('guide data: 44–60 places with every field', () => {
  assert(P.guide.length >= 44 && P.guide.length <= 60, 'guide size ' + P.guide.length);
  const ids = new Set();
  for (const g of [...P.guide, ...Object.values(P.pins)]) {
    assert(/^(pp|place)-[a-z0-9-]+$/.test(g.id) && !ids.has(g.id), 'id ' + g.id); ids.add(g.id);
    for (const k of ['name', 'why', 'best']) assert(typeof g[k] === 'string' && g[k].trim().length > 3, g.id + ' ' + k);
    assert(g.name.length <= 100 && g.why.length <= 500, g.id + ' lengths');
    assert(Number.isInteger(g.arr) && g.arr >= 1 && g.arr <= 20, g.id + ' arrondissement');
    assert(C.mapKinds.some(k => k.id === g.kind), g.id + ' kind');
    assert(g.tags.every(t => P.TAGS[t]), g.id + ' tags');
  }
  for (const g of P.guide) for (const k of ['todo', 'proof']) assert(typeof g[k] === 'string' && g[k].length > 10 && g[k].length <= 1000, g.id + ' ' + k);
  assert(P.guide.some(g => g.tags.includes('show')) && P.guide.some(g => g.tags.includes('records')) && P.guide.some(g => g.kind === 'reset'), 'a real mix');
});

test('coordinates: inside Paris, inside the map bounds, near their arrondissement, no stacked pins', () => {
  const all = [...P.guide, ...Object.values(P.pins)];
  for (const g of all) {
    assert(g.lat > 48.815 && g.lat < 48.903 && g.lon > 2.224 && g.lon < 2.47, g.id + ' inside Paris');
    assert(g.lat >= 48.7 && g.lat <= 49 && g.lon >= 2.15 && g.lon <= 2.6, g.id + ' inside the atlas bounds');
    assert(km([g.lat, g.lon], ARR[g.arr]) < 2.9, `${g.id} is ${km([g.lat, g.lon], ARR[g.arr]).toFixed(1)} km from the ${g.arr} centre`);
  }
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert(km([all[i].lat, all[i].lon], [all[j].lat, all[j].lon]) > 0.05, all[i].id + ' and ' + all[j].id + ' overlap');
  const apple = P.pins['pp-apple-opera']; assert.equal(apple.arr, 9); assert(/12 rue Halévy/.test(apple.why));
  // Codex's default pins keep their coordinates (the guide only adds notes).
  const s = fresh(); for (const p of s.atlas.places) { const g = P.byId(p.id); if (g) { assert.equal(g.lat, p.lat); assert.equal(g.lon, p.lon); } }
});

test('guide pins join the map once, reuse default pins and validate', () => {
  const s = fresh(), before = s.atlas.places.length;
  const r = P.addGuide(s), extra = P.guide.filter(g => g.id.startsWith('pp-')).length;
  assert.equal(r.added, extra); assert.equal(s.atlas.places.length, before + extra); assert(P.hasGuide(s));
  assert.equal(new Set(s.atlas.places.map(p => p.id)).size, s.atlas.places.length, 'no duplicate pins');
  assert.equal(P.addGuide(s).added, 0, 'idempotent'); C.validate(s); assert.equal(C.xp(s), 0, 'pins award nothing');
  const full = fresh(); for (let i = 0; full.atlas.places.length < 95; i++) C.savePlace(full, { name: 'Fixture ' + i, lat: 48.86, lon: 2.35, quest: '', kind: 'reset' });
  const r2 = P.addGuide(full); assert.equal(full.atlas.places.length, 100); assert.equal(r2.added, 5); assert(r2.full > 0); C.validate(full);
});

test('filters: tags, plurals, kinds, arrondissements and words', () => {
  const n = q => P.guide.filter(g => P.matches(g, q)).length;
  assert.equal(n(''), P.guide.length); assert(n('show') >= 6); assert.equal(n('shows'), n('show'));
  assert(n('records') === 3); assert(n('11e') >= 4); assert.equal(n('11'), n('11e')); assert.equal(n('1er'), n('1'));
  assert(n('music') >= 10); assert(n('canal') >= 1); assert(n('pigalle') >= 1); assert.equal(n('zzzz'), 0);
  assert.equal(P.findPlace('bataclan').id, 'pp-bataclan'); assert.equal(P.findPlace('canal').id, 'place-canal'); assert.equal(P.findPlace('belleville').id, 'pp-belleville-view');
  assert.equal(P.findPersonal('airpods').key, 'airpods'); assert.equal(P.findPersonal('apple').key, 'airpods'); assert.equal(P.findPersonal('open-mic').key, 'openmic');
});

test('a place quest is go → do → proof, stable, and pays XP only after proof + review', () => {
  const s = fresh(), c = P.startPlace(s, 'pp-point-ephemere');
  assert.equal(c.id, 'c-pp-point-ephemere'); assert.equal(c.quests.length, 3); assert.equal(c.path, 'music'); assert.equal(s.active, c.id);
  assert(/^Get to/.test(c.quests[0].title) && c.quests[2].title === 'Bring it home');
  assert(s.atlas.places.some(p => p.id === 'pp-point-ephemere'), 'the pin comes with the quest');
  assert.equal(P.startPlace(s, 'pp-point-ephemere'), c, 'same campaign twice'); C.validate(s); assert.equal(C.xp(s), 0);
  assert.throws(() => C.complete(s, c.quests[0].id), /proof/i);
  assert.equal(C.startSmall(s, c.quests[0].id), 5); assert.equal(finish(s, c.quests[0].id, 1), 15);
  assert.equal(C.next(s, c).id, c.quests[1].id, 'the next step opens');
  assert.throws(() => C.complete(s, c.quests[2].id), 'steps stay in order');
  const prog = P.progress(s).find(x => x.id === c.id); assert.equal(prog.done, 1); assert.equal(prog.total, 3);
  finish(s, c.quests[1].id, 2); finish(s, c.quests[2].id, 3); assert(C.campaignDone(s, c)); assert.equal(C.xp(s), 90);
  assert.deepEqual(C.validate(JSON.parse(JSON.stringify(s))), s);
  const canal = P.startPlace(s, 'place-canal'); assert.equal(canal.id, 'c-pp-canal'); assert.equal(s.atlas.places.filter(p => p.id === 'place-canal').length, 1);
  for (const g of P.guide) P.startPlace(s, g.id); C.validate(s);
});

test('personal quests: AirPods at Apple Opéra, music at the park, and kind social quests', () => {
  const s = fresh();
  assert(P.personal.length >= 6, 'at least AirPods, park, drink and three more');
  for (const t of P.personal) { const c = P.startPersonal(s, t.key); assert.equal(c.id, t.id); assert(c.quests.length >= 3); assert.equal(P.startPersonal(s, t.key), c); }
  C.validate(s);
  const air = s.campaigns.find(c => c.id === 'c-pq-airpods');
  assert(s.atlas.places.some(p => p.id === 'pp-apple-opera')); assert(/apple\.com\/fr/.test(air.quests[0].done)); assert(/12 rue Halévy/.test(air.quests[1].done)); assert(/Find My/.test(air.quests[2].done));
  const park = P.personal.find(t => t.key === 'park'); assert(/\/quest park/.test(park.steps[0][1]) && /2-minute/.test(park.steps[1][1]));
  const s2 = fresh(); P.startPersonal(s2, 'park', { park: 'luxembourg' }); assert.equal(s2.campaigns.find(c => c.id === 'c-pq-park').parisPlace, 'place-luxembourg');
  assert.equal(P.sketchTitle('place-buttes', new Date(2026, 9, 18)), 'Park sketch · Buttes-Chaumont · 18 Oct');
  const drink = P.personal.find(t => t.key === 'drink'), text = JSON.stringify(drink).toLowerCase();
  assert(/any answer/.test(text) && /never insist/.test(text) && /leave it there/.test(text), 'consent-aware steps');
  for (const t of P.personal) { const all = JSON.stringify(t).toLowerCase(); for (const bad of ['pickup line', 'pick-up', 'number close', 'score', 'seduce', 'target her', 'neg ']) assert(!all.includes(bad), t.key + ' wording: ' + bad); }
});

test('taking the guide off keeps visited, starred and quest pins', () => {
  const s = fresh(); P.addGuide(s); P.startPlace(s, 'pp-rex');
  s.atlas.places.find(p => p.id === 'pp-cigale').favorite = true; s.atlas.places.find(p => p.id === 'pp-superfly').visitedAt = '2026-10-18T12:00:00Z';
  s.atlas.selected = 'pp-bataclan';
  const removed = P.removeGuide(s); assert(removed > 20);
  for (const id of ['pp-rex', 'pp-cigale', 'pp-superfly', 'place-canal', 'place-buttes']) assert(s.atlas.places.some(p => p.id === id), id + ' stays');
  assert(!s.atlas.places.some(p => p.id === 'pp-bataclan')); assert(s.atlas.places.some(p => p.id === s.atlas.selected)); C.validate(s);
});

console.log(`quest-paris-test: ${checks} groups passed`);
