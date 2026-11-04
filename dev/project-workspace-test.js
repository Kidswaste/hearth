const assert=require('node:assert/strict');
const C=require('../project-workspace-core'), P=require('../projects-core');
assert.equal(C.key('pj-hello'),'workbench-pj-hello');assert.throws(()=>C.key('../other'));
assert.deepEqual(C.plugins(['Serum 2','Unknown','Vital','Serum 2']),['Serum 2','Vital']);
assert.equal(C.workspace({persona:'evil',custom:{keep:true}}).persona,'partner');
assert.deepEqual(C.workspace({custom:{keep:true}}).custom,{keep:true});
assert.equal(C.frontpage({count:100000,speed:42,color:'url(x)',shape:'script'}).count,32);
assert.equal(C.frontpage({color:'url(x)'}).color,'#ff9866');
const p=P.create({name:'Watchdog'});p.workspace=C.workspace({sceneId:'scene-kept',chatId:'chat-kept',plugins:['Vital']});
assert.deepEqual(P.normalize({v:1,list:[p],dismissed:[]}).list[0].workspace,p.workspace);
console.log('Project preferences round-trip and bounded AI configuration passed.'); // (round 116, slim116: the quest map's pin index left with the Life tab)
const banner=C.banner({symbol:'<script>',elements:Array.from({length:100},()=>({position:[Infinity,-99,99],scale:[0,999,1],color:'url(x)'}))},'Clinky');
assert.equal(banner.elements.length,24);assert.equal(banner.symbol,'crystal');assert.deepEqual(banner.elements[0].position,[0,-5,5]);assert.deepEqual(banner.elements[0].scale,[.05,2,1]);assert.equal(banner.title,'Clinky');
const chats=[{id:'c1',title:'One'},{id:'c2',title:'Two'},{id:'c3',title:'Gone'}],scenes=[{id:'s1',name:'Clinky'}],links={links:{c1:{sketch:'s1'},c2:{sketch:'s1'},c3:{sketch:'missing'}}};
const groups=C.sceneProjects(chats,scenes,links,[]);assert.equal(groups.length,1);assert.equal(groups[0].chats.length,2);
assert.equal(C.sceneProjects(chats,scenes,links,[{id:'p1',items:[{type:'chat',ref:'c1'},{type:'chat',ref:'c2'}]}]).length,0);
assert.equal(C.sceneProjects(chats,scenes,links,[{id:'p1',workspace:{sceneId:'s1'},items:[]}])[0].projectId,'p1');
console.log('Banner bounds and idempotent scene/chat grouping passed.');
