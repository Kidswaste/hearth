// Real project navigation + isolated synthetic replies. No model/account calls.
const wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,m)=>{if(!v)throw Error(m);},until=async(fn,m)=>{for(let i=0;i<250;i++){if(fn())return;await wait(50);}throw Error(m);};
await Lazy.load('projects');await Projects.ready();await Lazy.load('usagelimits');
UsageLimits.readAstra=async()=>null;UsageLimits.readClaude=async()=>null;
const p=await ProjectWorkspace.create({name:'Clink · auto-improve',plugins:[]}),primary=ProjectWorkspace.currentChat();
const second={id:primary.agentId+'-auto-second',agentId:primary.agentId,title:'Folio · attack polish',messages:[],session:{}};
await hub.saveChat(second);Native.adopt(second,{openIt:false});Projects.add(p,'chat',second.id,second.title,{links:false});await Projects.flush();
await ProjectWorkspace.conversation(p,second.id);
check(ProjectWorkspace.currentChat().id===second.id,'Selected project conversation lost');
const entry=()=>document.querySelector('.workspace-auto');
check(entry()&&!entry().hidden,'Auto-improve absent before first run');
entry().click();await until(()=>document.querySelector('.rt-dlg[open]'),'Setup did not open');
let dlg=document.querySelector('.rt-dlg[open]');check(dlg.textContent.includes(second.title),'Setup targets wrong project conversation');
dlg.querySelector('.rt-budget-mode').value='tokens';dlg.querySelector('.rt-budget-mode').dispatchEvent(new Event('change'));
check(dlg.textContent.includes('current reply can exceed'),'Budget falsely presented as a hard cap');
check(dlg.querySelector('[aria-label="Stop before a usage limit at"]'),'Account ceiling hidden');
await smoke({shot:window.SMOKE_SAVES+'/auto-improve-setup.png'});
dlg.close();await wait(50);check(!Routines.forChat(second.id),'Cancelling started work');
const adapter=await Routines.start(second.agentId,{prompt:'Hello',how:{kind:'rounds',rounds:1},cap:1000000,lighter:false},{chatId:second.id});
await until(()=>adapter.status==='done','Real Native.send with fake engine failed');check(adapter.tokens>0,'Fake provider usage was not counted');
// A routine error must not acquire an automatic Offline retry outside its budget.
const errorChat=await Native.load(second.id),tag={role:'user',text:'Fixture loop',at:Date.now(),routine:{id:'offline-budget-fixture',n:1}};
errorChat.messages.push(tag,{role:'error',text:'Server is busy, try again later',at:Date.now()+1});
for(const fn of Native.hooks.event)fn({type:'error',message:'Server is busy, try again later'},errorChat);
check(!Offline.items().some(x=>x.chatId===second.id),'Offline queued an automatic loop retry');errorChat.messages.splice(-2,2);Native.save(errorChat);
let delay=80,report={input:4000,output:200,cached:3000,cost:.25},sends=0,busy=false;
const realSend=Native.send,realBusy=Native.isBusy;
Native.isBusy=id=>id===second.id?busy:realBusy(id);
Native.send=async(agentId,text,{chatId})=>{
  check(chatId===second.id,'Sent to primary/wrong chat');sends++;busy=true;
  const chat=await Native.load(chatId),m={role:'user',text,at:Date.now()};chat.messages.push(m);
  for(const fn of Native.hooks.send)fn(agentId,chat,text);
  await wait(delay);busy=false;
  const e={type:'done',text:'Improved Folio '+sends,usage:report,chatId,agentId};
  for(const fn of Native.hooks.finish)fn(e,chat,{});
  chat.messages.push({role:'assistant',text:e.text,usage:report,at:Date.now(),tools:['Edit · folio.js']});Native.save(chat);
  // Duplicate terminal delivery must not double-count the round.
  for(const fn of Native.hooks.finish)fn(e,chat,{});
};
Routines._test.scale(.02);
entry().click();await until(()=>document.querySelector('.rt-dlg[open]'),'Reopen failed');dlg=document.querySelector('.rt-dlg[open]');
if(dlg.classList.contains('rt-run')){[...dlg.querySelectorAll('button')].find(b=>b.textContent==='New run & budget').click();await until(()=>document.querySelector('.rt-words'),'New budget failed');dlg=document.querySelector('.rt-dlg:not(.rt-run)[open]');}
dlg.querySelector('.rt-budget-mode').value='tokens';dlg.querySelector('.rt-budget-mode').dispatchEvent(new Event('change'));
dlg.querySelector('.rt-num').value='2';const cap=dlg.querySelector('.rt-cap');cap.value='custom';cap.dispatchEvent(new Event('change'));dlg.querySelector('.rt-custom-cap').value='100000';
dlg.querySelector('button[type=submit]').click();await until(()=>sends===2&&Routines.list().filter(r=>r.chatId===second.id).at(-1)?.status==='done','Two rounds did not finish');
const first=Routines.list().filter(r=>r.chatId===second.id).at(-1);check(sends===2&&first.tokens===8400&&first.usageTotals.cached===6000,'Usage duplicated/cache double-counted');
entry().click();await until(()=>document.querySelector('.rt-run[open]'),'History unavailable');
check(document.querySelector('.rt-run').textContent.includes('8,400'),'Exact run total missing');
await smoke({shot:window.SMOKE_SAVES+'/auto-improve-run.png'});document.querySelector('.rt-run').close();
for(const tab of ['scene','board','moodboard','overview']){await ProjectWorkspace.go(tab);check(entry(),'Button missing from '+tab);}
await ProjectWorkspace.go('chat');
delay=600;const stopped=await Routines.start(second.agentId,{prompt:'Polish Folio.',how:{kind:'rounds',rounds:5},cap:100000,lighter:false},{chatId:second.id});
await until(()=>busy,'Round never started');Routines.stop(stopped.id);await until(()=>stopped.tokens===4200,'Stopped run lost final usage');check(stopped.status==='stopped','Stopped run restarted');
delay=80;report=undefined;const unknown=await Routines.start(second.agentId,{prompt:'Check attack.',how:{kind:'rounds',rounds:5},cap:100000,lighter:false},{chatId:second.id});
await until(()=>unknown.status==='paused','Missing usage did not pause');check(unknown.usageUnknown&&unknown.tokens===0,'Unknown report became a free round');
const before=sends;await wait(400);check(sends===before,'Missing usage sent another round');Routines.stop(unknown.id);
Native.send=realSend;Native.isBusy=realBusy;
await ProjectWorkspace.home();check(!entry(),'Project control leaked into home');
check((await Native.load(primary.id)).messages.length===0,'Primary chat changed');
return {pass:true,selectedConversation:true,allProjectTabs:true,cancelIsReadOnly:true,exactReportedUsage:8400,duplicateSafe:true,stopKeepsFinalUsage:true,missingUsagePauses:true};
