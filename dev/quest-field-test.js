const assert=require('node:assert/strict'),C=require('../tools/quest-core');
const fresh=()=>C.upgrade(C.initial());
const old=fresh(),copy=C.clone(old);assert.deepEqual(C.upgrade(old),copy);
assert.equal(C.mapMissions.length,12);assert.equal(C.mapKinds.length,6);
assert.equal(C.placeKind(old.atlas.places[0]),'music');
const s=fresh(),place=C.savePlace(s,{name:'Test field bench',lat:48.87,lon:2.36,quest:'One demo',kind:'music'});
place.favorite=true;place.visitedAt='2026-10-18T12:00:00Z';
C.savePlace(s,{...place,name:'Renamed bench',kind:'visual'});assert(place.favorite&&place.visitedAt);
for(const m of C.mapMissions){const c=C.startMapMission(s,place.id,m.id);assert.equal(c.quests.length,1);assert.equal(c.path,m.path);assert.equal(C.startMapMission(s,place.id,m.id),c);assert.throws(()=>C.complete(s,c.quests[0].id));C.validate(s);}
assert.equal(C.xp(s),0,'accepting and revisiting must not grant XP');
const c=s.campaigns.find(c=>c.mapMission==='pocket-beat'),qid=c.quests[0].id,brief=c.quests[0].done;
C.savePlace(s,{...place,name:'A later name',quest:'Changed mission'});assert.equal(C.startMapMission(s,place.id,'pocket-beat').quests[0].done,brief,'accepted scope stays fixed');
const proof={type:'chat',title:'Fixture exported loop',chatId:'chat-fixture',agentId:'astra',messageId:'1',excerpt:'TEST FIXTURE: actual loop evidence',analysis:'',coverage:'Fixture only',images:[],fingerprint:'a'.repeat(64)};
const item=C.submit(s,qid,proof);assert.throws(()=>C.complete(s,qid));
C.saveReview(s,qid,item.id,{status:'reviewed',meetsBrief:true,score:60,dimensions:[15,15,15,15],summary:'Fixture finish.',better:'Fixture edit.',next:'Fixture next.',coverage:'Fixture evidence.',limitations:'Fixture review.'});
C.complete(s,qid);assert.equal(C.xp(s),35);C.startMapMission(s,place.id,'pocket-beat');assert.equal(C.xp(s),35);
const rewards=C.rewardBlueprints.filter(r=>r.id.startsWith('field-'));assert.equal(rewards.length,8);
for(const b of rewards){const r=C.stockReward(s,b.id);assert.equal(r.amount,b.amount);assert.equal(C.stockReward(s,b.id),r);}
const coffee=s.rewards.find(r=>r.blueprint==='field-coffee');coffee.cost=1;
assert.throws(()=>C.redeem(s,coffee.id),'zero budget prevents paid reward');s.rewardBudget.monthly=6;
const receipt=C.redeem(s,coffee.id);assert.equal(C.rewardMoney(s).remaining,0);assert.throws(()=>C.redeem(s,coffee.id));C.returnReward(s,receipt.id);assert.equal(C.rewardMoney(s).remaining,6);
assert.deepEqual(C.validate(JSON.parse(JSON.stringify(s))),s);
for(const corrupt of [s=>s.atlas.places[0].kind='unknown',s=>s.atlas.places[0].favorite='yes',s=>s.campaigns.find(c=>c.mapPlace).mapPlace='missing',s=>{const c=C.clone(s.campaigns.find(c=>c.mapPlace));c.id='c-duplicate';c.quests[0].id='q-duplicate';s.campaigns.push(c);}]){const bad=C.clone(s);corrupt(bad);assert.throws(()=>C.validate(bad));}
const long=fresh();long.atlas.places[0].id='place-'+ 'x'.repeat(94);long.atlas.selected=long.atlas.places[0].id;C.startMapMission(long,long.atlas.selected,'tiny-detour');C.validate(long);
const before=C.clone(s);assert.throws(()=>C.startMapMission(s,'missing','tiny-detour'));assert.deepEqual(s,before);
console.log('Field kit: legacy preservation, categories/favorites, 12 stable proof-gated missions, 8 budgeted rewards, refunds, fixed scope, import validation and long IDs pass.');
