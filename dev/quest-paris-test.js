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

test('guide data: 60–80 places with every field', () => {
  assert(P.guide.length >= 60 && P.guide.length <= 80, 'guide size ' + P.guide.length);
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
  assert(n('records') === 4); assert(n('11e') >= 4); assert.equal(n('11'), n('11e')); assert.equal(n('1er'), n('1'));
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

test('discovery combines accent-insensitive search, lane, new and unvisited filters',()=>{
  const s=fresh();assert.equal(P.newPlaces.length,16);assert.equal(P.discover(s,{newOnly:true}).length,16);
  assert.deepEqual(P.discover(s,{query:'poesie'}).map(g=>g.id),['pp-maison-poesie']);
  const music=P.discover(s,{newOnly:true,kind:'music'});assert(music.length>=5&&music.every(g=>g.kind==='music'));
  P.ensurePin(s,'pp-dizonord').visitedAt='2026-10-18T12:00:00Z';assert(!P.discover(s,{newOnly:true,unvisited:true}).some(g=>g.id==='pp-dizonord'));
  assert.equal(P.discover(s,{query:'zzzz'}).length,0);
  for(const pid of P.newPlaces)assert(new URL(P.byId(pid).url).protocol==='https:');
});
test('six mini adventures freeze the chosen place, survive reload and use proof-gated XP',()=>{
  const s=fresh();assert.equal(P.outings.length,6);
  for(const t of P.outings){
    const c=P.startOuting(s,t.id,t.places[0]);assert.equal(c.quests.length,3);assert.equal(c.parisPlace,t.places[0]);
    assert.equal(P.startOuting(s,t.id,t.places[1]),c);assert.equal(c.parisPlace,t.places[0]);
    assert.throws(()=>C.complete(s,c.quests[0].id));assert.equal(C.xp(s),0);
  }
  C.validate(s);assert.deepEqual(C.validate(JSON.parse(JSON.stringify(s))),s);
  const c=s.campaigns.find(c=>c.id==='c-pq-city-tiny-reset');for(let i=0;i<3;i++)finish(s,c.quests[i].id,i+1);
  assert.equal(C.xp(s),90);assert(C.campaignDone(s,c));assert.equal(C.complete(s,c.quests[2].id),0);assert.equal(C.xp(s),90);
  assert.throws(()=>P.startOuting(s,'tile-safari','place-canal'));assert.throws(()=>P.startOuting(s,'missing','place-canal'));
});
test('friend missions cover the whole circle without inventing interests or requiring replies',()=>{
  const s=fresh();assert.equal(P.socialMissions.length,10);assert.equal(P.socialTreats.length,8);
  for(const f of s.world.friends)for(const t of P.socialMissions){
    const c=P.startSocial(s,t.id,f.id,t.places[0]);assert.equal(c.quests.length,3);assert.equal(P.startSocial(s,t.id,f.id,t.places[1]),c);assert.equal(c.parisPlace,t.places[0]);
    assert(c.quests[1].done.includes(t.solo));assert(c.quests[0].done.includes('reply is not required'));
    assert(P.socialInvite(s,t.id,f.id,t.places[0]).includes(f.name));
  }
  assert.equal(s.campaigns.filter(c=>c.socialMission).length,70);assert.equal(C.xp(s),0);C.validate(s);
  assert.equal(P.socialChoices(s,{friendId:'friend-valentin'})[0].id,'coop-scout');
  assert.equal(P.socialChoices(s,{friendId:'friend-guillaume'})[0].id,'demo-swap');
  assert.equal(P.socialChoices(s,{friendId:'friend-camille'})[0].id,'demo-swap');
  assert.equal(P.socialChoices(s,{quick:true}).length,4);
  assert(P.socialChoices(s,{quick:true}).every(t=>t.minutes<=20));
  assert.deepEqual(C.validate(JSON.parse(JSON.stringify(s))),s);
});
test('social steps are proof gated, repeat safe and preserve accepted friends and reward edits',()=>{
  const s=fresh(),c=P.startSocial(s,'check-in','friend-guillaume','place-canal',{treatId:'listening'}),reward=s.rewards.find(r=>r.id===c.socialTreat);
  assert.equal(s.rewardGoal,reward.id);assert.equal(s.redemptions.length,0);assert.equal(C.balance(s),0);assert.throws(()=>C.complete(s,c.quests[0].id),/proof/i);
  assert.throws(()=>C.redeem(s,reward.id),/sparks/);
  s.world.friends.find(f=>f.id==='friend-guillaume').name='G';reward.name='My own listening ritual';reward.cost=9;
  assert.equal(P.startSocial(s,'check-in','friend-guillaume','pp-montsouris',{treatId:'show-fund'}),c);assert.equal(c.socialFriendName,'Guillaume');assert.equal(s.rewardGoal,reward.id);
  assert.equal(P.stockSocialTreat(s,'listening'),reward);assert.equal(reward.name,'My own listening ritual');assert.equal(reward.cost,9);
  for(let i=0;i<3;i++)finish(s,c.quests[i].id,i+1);
  assert.equal(C.xp(s),90);assert.equal(C.balance(s),18);assert(C.campaignDone(s,c));assert.equal(C.complete(s,c.quests[2].id),0);
  const receipt=C.redeem(s,reward.id);assert.equal(C.balance(s),9);C.returnReward(s,receipt.id);assert.equal(C.balance(s),18);
  C.validate(s);
});
test('priced social treats obey monthly allowance and invalid starts leave data alone',()=>{
  const s=fresh(),c=P.startSocial(s,'sunset-postcard','friend-camille','place-canal',{treatId:'pastry'});
  for(let i=0;i<3;i++)finish(s,c.quests[i].id,i+1);
  assert.throws(()=>C.redeem(s,c.socialTreat),/budget/);s.rewardBudget.monthly=5;const r=C.redeem(s,c.socialTreat);assert.equal(r.amount,5);assert.equal(C.rewardMoney(s).remaining,0);C.returnReward(s,r.id);assert.equal(C.rewardMoney(s).remaining,5);
  for(const args of [['missing','friend-jean','place-canal'],['check-in','missing','place-canal'],['check-in','friend-jean','pp-dizonord'],['check-in','friend-jean','place-canal',{treatId:'missing'}]]){const before=JSON.stringify(s);assert.throws(()=>P.startSocial(s,...args));assert.equal(JSON.stringify(s),before);}
  const old=s.campaigns.find(c=>c.socialMission);P.removeGuide(s);assert(s.atlas.places.some(p=>p.id===old.parisPlace));C.validate(s);
});
// (round 64, parisdedupe64) one real place = one pin: the guide (ours + Codex's 60), Codex's default pins and a journal
test('no two pins within 120 m with similar names (guide, personal pins, Codex’s default pins)', () => {
  const all = [...fresh().atlas.places.filter(p => !P.byId(p.id)), ...P.guide, ...Object.values(P.pins)];
  const ids = all.map(p => p.id); assert.equal(new Set(ids).size, ids.length, 'duplicate ids');
  const pairs = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (P.metres(all[i], all[j]) < 120 && P.sameName(all[i].name, all[j].name)) pairs.push(all[i].id + '~' + all[j].id);
  assert.deepEqual(pairs, []);
  // names alone: the same name twice anywhere in Paris is a duplicate too
  const fold = n => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const names = all.map(p => fold(p.name)); assert.equal(new Set(names).size, names.length, 'duplicate names');
  assert(P.sameName('Point Éphémère', 'Point Ephemere') && P.sameName('Le Bataclan', 'Bataclan') && !P.sameName('La Bellevilloise', 'La Maroquinerie') && !P.sameName('Petit Palais', 'Petit Bain'));
});
test('a place of yours at a guide place is its pin: no second pin, the guide attaches to it', () => {
  const s = fresh();
  C.savePlace(s, { name: 'Point Éphémère', lat: 48.88145, lon: 2.36830, kind: 'music', quest: 'Friday gig' });
  const mine = s.atlas.places.at(-1), before = s.atlas.places.length;
  const r = P.addGuide(s);
  assert.equal(r.linked, 1); assert.equal(mine.guide, 'pp-point-ephemere'); assert(!s.atlas.places.some(p => p.id === 'pp-point-ephemere'));
  assert.equal(s.atlas.places.length, before + P.guide.filter(g => g.id.startsWith('pp-')).length - 1); assert(P.hasGuide(s));
  assert.equal(P.of(mine).id, 'pp-point-ephemere'); assert.equal(P.pinOf(s, 'pp-point-ephemere'), mine);
  const c = P.startPlace(s, 'pp-point-ephemere'); assert.equal(c.id, 'c-pp-point-ephemere'); assert.equal(s.atlas.selected, mine.id);
  assert.equal(P.startPersonal(s, 'gig').parisPlace, 'pp-point-ephemere'); assert.equal(s.atlas.selected, mine.id);
  assert.equal(mine.name, 'Point Éphémère'); assert.equal(mine.quest, 'Friday gig'); // yours wins
  assert.equal(P.spotPin(s, { name: 'Point Ephemere', lat: 48.8812, lon: 2.3686 }), mine); // an Outing desk venue → the same pin
  assert.equal(P.spotPin(s, { name: 'Le Trabendo', lat: 48.8926, lon: 2.3939 }).id, 'pp-trabendo');
  assert.equal(P.spotPin(s, { name: 'Somewhere else', lat: 48.8926, lon: 2.3939 }), null); assert.equal(P.spotPin(s, { name: 'Point Éphémère', lat: NaN, lon: 2 }), null);
  P.removeGuide(s); assert(s.atlas.places.includes(mine)); C.validate(s);
});
test('an existing journal with both pins is merged once and keeps every visit, star and quest', () => {
  const s = fresh(); P.addGuide(s);
  const pin = s.atlas.places.find(p => p.id === 'pp-bataclan'); pin.visitedAt = '2026-09-01T10:00:00.000Z'; pin.favorite = true; pin.quest = 'My own Bataclan note';
  const placeQuest = P.startPlace(s, 'pp-bataclan'); finish(s, placeQuest.quests[0].id, 1);
  const mission = C.mapMissions.find(m => m.kind === 'music'); const field = C.startMapMission(s, 'pp-bataclan', mission.id);
  C.savePlace(s, { name: 'Bataclan', lat: 48.86305, lon: 2.37075, kind: 'social', quest: 'Gig night' });
  const mine = s.atlas.places.at(-1); mine.visitedAt = '2026-10-01T10:00:00.000Z'; s.atlas.selected = 'pp-bataclan';
  const xp = C.xp(s), n = s.atlas.places.length, campaigns = JSON.stringify(s.campaigns.map(c => c.id));
  assert(P.needsDedupe(s)); assert.deepEqual(P.dedupe(s), ['pp-bataclan']);
  assert.equal(s.atlas.places.length, n - 1); assert(!s.atlas.places.some(p => p.id === 'pp-bataclan'));
  assert.equal(mine.guide, 'pp-bataclan'); assert.equal(mine.visitedAt, '2026-09-01T10:00:00.000Z'); assert.equal(mine.favorite, true);
  assert.equal(mine.kind, 'social'); assert.match(mine.quest, /^Gig night · My own Bataclan note$/);
  assert.equal(s.atlas.selected, mine.id); assert.equal(field.mapPlace, mine.id);
  assert.equal(JSON.stringify(s.campaigns.map(c => c.id)), campaigns); assert.equal(C.xp(s), xp); assert(C.done(s, placeQuest.quests[0].id));
  assert.equal(P.startPlace(s, 'pp-bataclan'), placeQuest); C.validate(s);
  const again = JSON.stringify(s); assert(!P.needsDedupe(s)); assert.deepEqual(P.dedupe(s), []); assert.equal(JSON.stringify(s), again); // once
  assert.equal(P.addGuide(s).added, 0); assert.equal(s.atlas.places.length, n - 1); // Explore places adds nothing back
  assert(P.discover(s, { query: 'bataclan' }).some(g => g.id === 'pp-bataclan')); // Browse places still lists it
});
test('dedupe leaves both pins when Codex’s one-campaign-per-place-and-mission rule would clash', () => {
  const s = fresh(); P.addGuide(s); const mission = C.mapMissions.find(m => m.kind === 'music');
  C.startMapMission(s, 'pp-bataclan', mission.id);
  C.savePlace(s, { name: 'Bataclan', lat: 48.86305, lon: 2.37075, kind: 'music', quest: 'Gig night' }); C.startMapMission(s, s.atlas.places.at(-1).id, mission.id);
  const before = JSON.stringify(s); assert(!P.needsDedupe(s)); assert.deepEqual(P.dedupe(s), []); assert.equal(JSON.stringify(s), before); C.validate(s);
});
test('today gives three bounded, deterministic, unfinished stories for energy, budget and company',()=>{
  const s=fresh();assert.equal(P.eleven.length,6);assert.equal(P.guide.length,72);assert(P.eleven.every(r=>P.byId('pp-'+r[0]).arr===11));
  for(const energy of [1,2,3])for(const budget of [0,5,15])for(const friendId of ['',...s.world.friends.map(f=>f.id)]){
    const opts={energy,budget,friendId},a=P.today(s,opts,'2026-10-18');assert.equal(a.length,3);assert(a.every(t=>t.energy<=energy&&t.cap<=budget));assert.deepEqual(P.today(s,opts,'2026-10-18'),a);
  }
  const cheap=P.today(s,{energy:1,budget:0},'2026-10-18');assert(!cheap.some(t=>t.id==='cafe-frequency'));assert.notDeepEqual(P.today(s,{energy:1,budget:0},'2026-10-18',3),cheap);
  assert(P.today(s,{placeId:'pp-jules-verne',energy:3}).every(t=>t.places.includes('pp-jules-verne')));assert.throws(()=>P.today(s,{friendId:'missing'}));
});
test('story chapters pay for reviewed output, freeze choices and leave old quests untouched',()=>{
  const s=fresh(),before=JSON.stringify(s.campaigns);let serial=0;
  for(const t of P.stories){const c=P.startStory(s,t.id,t.places[0],{energy:3,budget:15,friendId:'friend-thomas'});assert.equal(c.quests.length,t.chapters.length);assert(c.quests.every(q=>q.deep.includes('not a countdown')));assert.equal(P.startStory(s,t.id,t.places[1],{energy:3,budget:15}),c);assert.equal(c.storyCompany,'Thomas');assert.equal(c.parisPlace,t.places[0]);assert.throws(()=>C.complete(s,c.quests[0].id));for(const q of c.quests)finish(s,q.id,++serial);assert(C.campaignDone(s,c));assert.equal(C.complete(s,c.quests.at(-1).id),0);}
  assert.equal(JSON.stringify(s.campaigns.filter(c=>!c.cityStory)),before);assert.equal(C.xp(s),P.stories.flatMap(t=>t.chapters).reduce((n,c)=>n+c[2],0));assert.equal(P.today(s,{energy:3,budget:15}).length,0);assert.equal(s.redemptions.length,0);assert.deepEqual(C.validate(JSON.parse(JSON.stringify(s))),s);
  const freshState=fresh(),copy=JSON.stringify(freshState);assert.throws(()=>P.startStory(freshState,'cafe-frequency','pp-gardette',{energy:1,budget:0}));assert.equal(JSON.stringify(freshState),copy);P.startStory(freshState,'heartbeat','pp-gardette',{energy:1,budget:0},true);assert.equal(freshState.rewardGoal,'r-city-social-listening');assert.equal(C.xp(freshState),0);C.validate(freshState);
});
console.log(`quest-paris-test: ${checks} groups passed`);
