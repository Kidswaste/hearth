const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),C=require('../tools/quest-chat-core');
const p={id:'project',name:'Clink',workspace:{chatId:'chat',sceneId:'scene'},items:[{type:'chat',ref:'chat'}]},scenes=[{id:'scene',name:'Clinky',layers:[]}];
const wait=()=>new Promise(r=>setImmediate(r));
function world(){
 const w={chat:{id:'chat',title:'Clinky',messages:[{role:'user',at:1,text:'Add Kiddy with a painted mask and a crooked smile.'}]},cache:new Map(),sends:[],stops:[],dialogs:[],events:[],busy:false};
 const kit={E:()=>({}),button:()=>({}),dialog:(_title,build)=>{const listeners={};const d={open:true,dataset:{},addEventListener:(n,f)=>{listeners[n]=f;},close:()=>{d.open=false;listeners.close?.();}};build({append(){}},d);w.dialogs.push(d);return d;}};
 const globals={QuestChatCore:C,H:{chats:[{id:'chat',updatedAt:1}],agents:()=>[{id:'astra',mode:'native',engine:'codex'}]},Native:{hooks:{event:[]},load:async()=>w.chat,isBusy:()=>w.busy},ChatScenes:{linkOf:()=> 'scene'},Projects:{get:()=>p,all:()=>[p],Src:{sketches:async()=>scenes}},ProjectWorkspace:{conversation:async()=>{}},document:{dispatchEvent:e=>w.events.push(e)},CustomEvent:class{constructor(type,o){this.type=type;this.detail=o.detail;}},setTimeout,clearTimeout,console};
 globals.hub={onEngineEvent:f=>{w.engine=f;},send:async a=>w.sends.push(a),stop:async id=>w.stops.push(id),kvGet:async k=>w.cache.get(k),kvSet:async(k,v)=>w.cache.set(k,v)};
 vm.runInNewContext(fs.readFileSync(require.resolve('../tools/quest-chat'),'utf8')+';this.api=QuestChat',globals);w.api=globals.api;w.qj={paris:{ui:()=>kit}};
 w.result=()=>{const c=C.context(p,[w.chat],scenes,{chat:'scene'});return {tasks:[{sourceId:c.focusId,quote:'Add Kiddy with a painted mask',target:'Kiddy mask',mode:'build',tab:'scene',path:'game',title:'shape Kiddy’s mask',goal:'Keep a readable mask silhouette.',first:'Open the scene and inspect Kiddy.',work:'Change the mask silhouette and save it.',verify:'Compare the silhouette at game size.'}]};};
 w.reply=tasks=>w.engine({chatId:w.sends.at(-1).chatId,type:'done',text:JSON.stringify(tasks||w.result()),usage:{input:100,output:20}});
 return w;
}
(async()=>{
 const w=world(),first=w.api.suggest(p,scenes,w.qj);await wait();assert.equal(w.sends.length,1);assert.equal(await w.api.suggest(p,scenes,w.qj),null,'double click does not duplicate request/offer');
 assert.equal(w.sends[0].options.questReview,true);assert.equal(w.sends[0].options.webSearch,'disabled');assert.equal(JSON.stringify(w.sends[0].session),'{}','isolated model session');
 w.reply();const out=await first;assert.equal(out.quests.length,1);assert.equal(w.dialogs[0].open,false);assert.equal(w.events[0].detail.source,'project-quests');
 const cached=await w.api.suggest(p,scenes,w.qj);assert.equal(w.sends.length,1,'identical context is free');assert.equal(cached.quests[0].id,out.quests[0].id);
 const x=world(),pending=x.api.suggest(p,scenes,x.qj);await wait();const old=x.result();x.chat.messages.push({role:'user',at:2,text:'Forget Kiddy for now. Work on the parry mechanic.'});x.reply(old);await assert.rejects(pending,/changed while planning/);assert.equal(x.cache.size,0,'stale result not cached');
 const cancel=world(),cancelled=cancel.api.suggest(p,scenes,cancel.qj);await wait();cancel.dialogs[0].close();assert.equal(await cancelled,null);assert.equal(cancel.stops.length,1);assert.equal(cancel.cache.size,0);
 const bad=world(),invalid=bad.api.suggest(p,scenes,bad.qj);await wait();bad.reply({tasks:[{...bad.result().tasks[0],quote:'not in this chat at all'}]});await assert.rejects(invalid,/source/);assert.equal(bad.cache.size,0);
 const busy=world();busy.busy=true;await assert.rejects(busy.api.suggest(p,scenes,busy.qj),/still working/);assert.equal(busy.sends.length,0,'no competing helper while project chat works');
 const empty=world();empty.chat.messages=[];assert.equal((await empty.api.suggest(p,scenes,empty.qj)).fromChat,false);assert.equal(empty.sends.length,0,'empty project needs no model');
 console.log('Chat quest service: one isolated request, caching, usage, cancellation, stale/malformed rejection, busy-chat guard and empty fallback passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
