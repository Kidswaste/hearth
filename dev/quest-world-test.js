const assert = require('node:assert/strict');
const C = require('../tools/quest-core');
let checks=0;const test=(name,fn)=>{fn();checks++;console.log('✓ '+name);};
const fresh=()=>C.upgrade(C.initial());
const plan=(s,values={})=>C.saveWorldPlan(s,{title:'A Toulouse weekend',kind:'trip',district:'gare',date:'2027-01-15',endDate:'2027-01-17',destination:'Toulouse',venue:'',budget:100,note:'Visit a friend',...values});
test('world upgrade adds only the user-supplied circle once and preserves edited friends',()=>{
 const old=fresh();delete old.world;old.deck.saved.push('tape-hook');const before=C.clone(old),s=C.upgrade(old);assert.deepEqual(old,before);assert.deepEqual(s.world,{v:1,selected:'home',friends:C.friendStarters,plans:[]});assert.equal(s.world.friends.length,7);assert.ok(s.world.friends.every(f=>f.birthday===''));assert.deepEqual(s.deck,old.deck);s.world.friends[0].interests='My edited note';assert.deepEqual(C.upgrade(s),s);assert.notEqual(C.friendStarters[0].interests,s.world.friends[0].interests);assert.equal(C.friendSuggestion(C.friendStarters.find(f=>f.name==='Valentin')),'One co-op session');assert.equal(C.friendSuggestion(C.friendStarters.find(f=>f.name==='Guillaume')),'A small catch-up');C.validate(s);
});
test('birthdays and New Year roll forward on valid calendar dates, including leap years',()=>{
 const s=fresh();const f=C.saveFriend(s,{name:'Fixture friend',birthday:'02-29',interests:'Music'});assert.equal(C.occasions(s,'2026-10-17').find(e=>e.friendId===f.id).date,'2028-02-29');assert.equal(C.occasions(s,'2026-12-31').find(e=>e.kind==='nye').date,'2026-12-31');assert.equal(C.occasions(s,'2027-01-01').find(e=>e.kind==='nye').date,'2027-12-31');assert.throws(()=>C.saveFriend(s,{name:'Invalid',birthday:'02-30'}));assert.equal(s.world.friends.length,C.friendStarters.length+1);assert.throws(()=>C.occasions(s,'2026-02-30'));
});
test('plans validate dates, budgets and friend references before mutation',()=>{
 const s=fresh();for(const values of [{date:'2027-02-30'},{endDate:'2027-01-14'},{friendId:'missing'},{budget:-1},{budget:'Infinity'},{kind:'other'}])assert.throws(()=>plan(s,values));assert.equal(s.world.plans.length,0);const p=plan(s);assert.equal(C.xp(s),0);const old=C.clone(p);assert.throws(()=>plan(s,{id:p.id,budget:-5}));assert.deepEqual(p,old);C.validate(s);
});
test('invitations use chosen details; research uses exact trip dates and never sends or books',()=>{
 const s=fresh(),f=C.saveFriend(s,{name:'Test pal',birthday:'',interests:'PRIVATE INTEREST'}),p=plan(s,{friendId:f.id});assert.ok(C.invitation(s,p.id).includes('Test pal'));const draft=C.tripResearch(p);assert.ok(draft.includes('2027-01-15')&&draft.includes('2027-01-17')&&draft.includes('€100'));assert.ok(!draft.includes('Test pal')&&!draft.includes('PRIVATE INTEREST'));assert.ok(draft.includes('Do not')&&draft.includes('book'));assert.equal(C.xp(s),0);
});
test('quoted fares are dated, scoped and never treated as live prices',()=>{
 const s=fresh(),p=plan(s),now='2026-10-17T12:00:00Z',f=C.addFare(s,p.id,{label:'Fixture return fare',amount:60,scope:'return',url:'https://www.sncf-connect.com/train/trajet/paris/toulouse'},now);
 assert.ok(C.fareStatus(p,f,Date.parse(now)).withinBudget);assert.ok(C.fareStatus(p,f,Date.parse(now)).label.includes('unverified'));assert.ok(C.fareStatus(p,f,Date.parse(now)+86400001).stale);assert.ok(C.fareStatus(p,f,Date.parse(now)-1).stale);
 const one=C.addFare(s,p.id,{label:'Outbound only',amount:30,scope:'one-way',url:'https://www.flixbus.fr/'},now);assert.equal(C.fareStatus(p,one,Date.parse(now)).withinBudget,false);
 C.saveWorldPlan(s,{...p,date:'2027-01-16'});assert.ok(C.fareStatus(p,f,Date.parse(now)).stale);C.validate(s);
});
test('bad fare links, blank amounts and unspecified return dates are rejected without saving',()=>{
 const s=fresh(),p=plan(s);for(const values of [{url:'javascript:alert(1)'},{url:'https://user:secret@example.com/'},{amount:''},{amount:-1}])assert.throws(()=>C.addFare(s,p.id,{label:'Fixture',amount:10,scope:'return',url:'https://example.com/',...values}));assert.equal(p.fares.length,0);C.saveWorldPlan(s,{...p,endDate:''});assert.throws(()=>C.addFare(s,p.id,{label:'Fixture',amount:10,scope:'return',url:'https://example.com/'}));C.validate(s);
});
test('turning a plan into quests freezes scope, preserves proof gating and cannot farm XP',()=>{
 const s=fresh(),p=plan(s),c=C.planCampaign(s,p.id),brief=c.quests[0].done;assert.equal(c.quests.length,3);assert.equal(s.sideQuests.length,0);assert.equal(C.xp(s),0);assert.throws(()=>C.complete(s,c.quests[0].id));C.startSmall(s,c.quests[0].id);C.saveWorldPlan(s,{...p,destination:'Lyon'});assert.equal(C.planCampaign(s,p.id).quests[0].done,brief);assert.equal(C.xp(s),5);assert.equal(s.campaigns.filter(x=>x.id===c.id).length,1);p.status='archived';assert.throws(()=>C.planCampaign(s,p.id));C.validate(s);
});
test('world backup round-trips and corrupt IDs, dates and price data are rejected',()=>{
 const s=fresh(),f=C.saveFriend(s,{name:'Fixture',birthday:'12-31',interests:'Music'}),p=plan(s,{friendId:f.id});C.addFare(s,p.id,{label:'Fixture',amount:70,scope:'return',url:'https://example.com/'});C.planCampaign(s,p.id);assert.deepEqual(C.validate(JSON.parse(JSON.stringify(s))),s);
 for(const corrupt of [x=>x.world.selected='missing',x=>x.world.friends[0].birthday='13-01',x=>x.world.plans[0].friendId='missing',x=>x.world.plans[0].fares[0].url='file:///private',x=>x.world.plans.push(C.clone(x.world.plans[0]))]){const copy=C.clone(s);corrupt(copy);assert.throws(()=>C.validate(copy));}
});
console.log(`Paris world: ${checks} behavior checks passed.`);
