const assert=require('node:assert/strict'),Q=require('../tools/quest-project'),C=require('../tools/quest-core'),G=require('../questguide-core'),P=require('../questguide-project');
const project={id:'clink',name:'Clink',workspace:{sceneId:'clinky',plugins:[]},items:[{type:'scene',ref:'clinky'}]};
const scenes=[{id:'clinky',name:'Clinky',layers:[{id:'a',name:'Fighters • Rivet & Loom'},{id:'z',name:'Fighters • Folio & Valse'},
 {id:'b',name:'Combat • guard & status'},{id:'c',name:'Shop • awning & counter'},{id:'d',name:'Stages • living weather'},{id:'y',name:'Fighters • flow & side specials'},
 {id:'zz',name:'Fighters • Removed',visible:false}]},{id:'other',name:'Other project',layers:[{id:'alien',name:'Fighters • Alien'}]}];
const list=Q.catalog(project,scenes),s=C.initial();
assert.match(list[0].title,/Folio/);assert(list.some(q=>/Valse/.test(q.title)));assert(list.some(q=>/test guard/.test(q.title)));assert(list.some(q=>/shop purchase/.test(q.title)));
assert(!list.some(q=>/Removed|Alien|flow/.test(q.title)),'hidden, other-project and descriptive layers are not characters');
for(const q of list){assert.equal(q.projectId,project.id);assert(q.guideSteps.every(t=>t.action.tab!=='scene'||t.action.sceneId==='clinky'));assert(q.tiny.length<=500);}
const test=list.find(q=>q.projectTask.topic==='mechanic');assert(test.guideSteps.every(t=>t.check==='manual'),'testing must not require changing a working mechanic');
assert.match(test.done,/No code change/);assert.match(test.guideSteps[3].instruction,/failed test/i);
for(const q of C.daily())C.trackSide(s,q);
const offered=Q.choose(project,list,s,C);const untouched=JSON.stringify(s);assert.equal(offered.id,list[0].id);assert.equal(JSON.stringify(s),untouched,'offer is read-only');
Q.track(s,offered,C);Q.track(s,offered,C);C.validate(s);assert.equal(C.allQuests(s).filter(q=>q.id===offered.id).length,1);assert.equal(C.sideCount(s),3,'daily slots unchanged');
assert.equal(C.xp(s),0,'no acceptance XP');assert(C.available(s,offered.id));assert.equal(Q.choose(project,list,s,C).id,offered.id,'resume accepted work');
C.skip(s,offered.id);const second=Q.choose(project,list,s,C);assert.equal(second.id,test.id);Q.track(s,second,C);C.validate(s);assert(C.available(s,second.id));
const other={...project,id:'other-project',name:'Other'};assert(Q.catalog(other,scenes).every(q=>!list.some(a=>a.id===q.id)),'IDs scoped to project');
assert.deepEqual(Q.catalog(project,scenes).map(q=>q.id),list.map(q=>q.id),'stable across rebuilds');
const empty=Q.catalog({id:'new',name:'New idea',items:[]});assert.equal(empty.length,1);assert(empty[0].guideSteps.every(t=>t.action.tab==='chat'),'no invented scene or characters');
const sound=Q.catalog({id:'sound',name:'EP',workspace:{plugins:['Serum 2','Uninstalled']}});assert.equal(sound.length,1);assert.equal(sound[0].path,'music');assert.match(sound[0].title,/Serum 2/);
const visual=Q.catalog({...project,id:'visual',name:'Passage',workspace:{sceneId:'visual'}},[{id:'visual',name:'Passage 01',layers:[{id:'glass',name:'Glass subject'}]}]);assert.equal(visual[0].path,'visual');assert(!visual.some(q=>/attack|guard|shop/.test(q.title)));
const steps=G.start({steps:offered.guideSteps}).steps;assert.equal(steps[1].action.sceneId,'clinky');
const session={projectId:'clink',projectCheckpoint:{scene:'old',scenes:{clinky:'a',other:'a'}}},step=steps[1];
assert.equal(P.evidence(session,step,{projectId:'clink',scene:'new',scenes:{clinky:'a',other:'b'}}),null,'other scene change cannot complete named target');
assert.equal(P.evidence(session,step,{projectId:'clink',scene:'new',scenes:{other:'b'}}),null,'missing named target not proof');
assert(P.evidence(session,step,{projectId:'clink',scene:'new',scenes:{clinky:'b',other:'a'}}));
assert.equal(Q.choose(other,Q.catalog(other,scenes),s,C).projectId,other.id,'no mission leakage across projects');
console.log('Project missions: grounded targets, hidden/unrelated exclusion, stable IDs, per-project log, no acceptance XP, pure tests, named-scene evidence and visual/music fallbacks passed.');
