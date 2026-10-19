// Real project UI and routine scheduler, synthetic quota and replies; no model/account calls.
const wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,m)=>{if(!v)throw Error(m);},until=async(fn,m)=>{for(let i=0;i<300;i++){if(fn())return;await wait(50);}throw Error(m);};
await Lazy.load('projects');await Projects.ready();await Lazy.load('usagelimits');await Lazy.load('routines');
store.set('routines.last',{});
const project=await ProjectWorkspace.create({name:'Clink · percentage budget',plugins:[]}),chat=ProjectWorkspace.currentChat(),agent=H.agent(chat.agentId);
agent.engine='codex';agent.model='fixture-model';chat.model='fixture-model';Native.save(chat);
let used=50,available=true,stale=false,afterReply=null,reads=0,sends=0,busy=false;
const reset=Date.now()+3600000;
UsageLimits.readClaude=async()=>null;
UsageLimits.readAstra=async opts=>{check(opts?.fresh===true,'Quota check used cached adapter');reads++;return available?{available:true,checkedAt:Date.now()-(stale?180000:0),buckets:[{id:'codex',windows:[{used,minutes:300,resetsAt:reset}]}]}:null;};
const realBusy=Native.isBusy;Native.isBusy=id=>id===chat.id?busy:realBusy(id);
Native.send=async(agentId,text,{chatId})=>{
  check(chatId===chat.id,'Wrong project chat');sends++;busy=true;
  const c=await Native.load(chatId),m={role:'user',text,at:Date.now()};c.messages.push(m);for(const fn of Native.hooks.send)fn(agentId,c,text);
  await wait(70);used+=5;busy=false;
  const e={type:'done',text:'Changed: character '+sends+' has a new attack.',chatId,agentId};
  for(const fn of Native.hooks.finish)fn(e,c,{});
  c.messages.push({role:'assistant',text:e.text,at:Date.now(),tools:['Edit · character.js']});Native.save(c);afterReply?.();
};
Routines._test.scale(.02);
document.querySelector('.workspace-auto').click();await until(()=>document.querySelector('.rt-dlg[open]'),'Setup absent');
let dlg=document.querySelector('.rt-dlg[open]');await until(()=>!dlg.querySelector('[type=submit]').disabled,'Fresh usage did not enable start');
check(dlg.querySelector('.rt-budget-mode').value==='remaining','Percentage is not the default');
check(dlg.querySelector('.rt-percent').value==='20','Default not 20%');
check(dlg.querySelector('.rt-token-fields').hidden,'Token counts are still front and center');
check(dlg.querySelector('.rt-quota-preview').textContent.includes('50% left → allow 10'),'Starting allocation wrong');
await smoke({shot:window.SMOKE_SAVES+'/remaining-setup.png'});
dlg.querySelector('[type=submit]').click();await until(()=>Routines.list().filter(r=>r.chatId===chat.id).at(-1)?.status==='done','Budget did not finish');
let r=Routines.list().filter(r=>r.chatId===chat.id).at(-1);check(sends===2&&r.allowance.windows[0].start===50&&r.allowance.windows[0].amount===10,'Budget rebased or sent extra round');
check(r.usageUnknown&&r.tokens===0,'Fixture expected missing raw token reports');check(RoutinesCore.allowanceProgress(r.allowance)===100,'Quota was guessed from tokens');
document.querySelector('.workspace-auto').click();await until(()=>document.querySelector('.rt-run[open]'),'Run panel absent');dlg=document.querySelector('.rt-run[open]');
check(dlg.querySelector('.rt-spent').textContent==='100% of budget used','Run panel did not show percentage');
check(!dlg.querySelector('details').open,'Raw traffic details should be collapsed');
await smoke({shot:window.SMOKE_SAVES+'/remaining-finished.png'});dlg.close();
const count=sends;available=false;let failed=false;
try{await Routines.start(chat.agentId,{remainingPercent:20,how:{kind:'forever'}},{chatId:chat.id});}catch(e){failed=/fresh account usage/.test(e.message);}
check(failed&&sends===count,'Unknown allowance started a run');
Routines.card(chat.agentId,{chatId:chat.id});await until(()=>document.querySelector('.rt-dlg[open]'),'Unavailable card absent');dlg=document.querySelector('.rt-dlg[open]');
await until(()=>dlg.querySelector('.rt-quota-preview').textContent.includes('unavailable'),'Unavailable explanation absent');check(dlg.querySelector('[type=submit]').disabled,'Unknown quota allows starting');dlg.close();
available=true;used=50;afterReply=()=>{stale=true;};
r=await Routines.start(chat.agentId,{remainingPercent:20,how:{kind:'forever'},lighter:false},{chatId:chat.id});await until(()=>r.status==='paused','Stale reading did not pause');
check(sends===count+1&&/refreshed/.test(r.why),'Stale quota silently continued');Routines.stop(r.id);afterReply=null;stale=false;
await wait(150);
const read=UsageLimits.readAstra;UsageLimits.readAstra=async opts=>{const result=await read(opts);agent.engine='claude';return result;};
failed=false;try{await Routines.start(chat.agentId,{remainingPercent:20,how:{kind:'forever'}},{chatId:chat.id});}catch(e){failed=/assistant or model changed/.test(e.message);}
check(failed&&sends===count+1,'Provider change during read used the wrong account allocation');agent.engine='codex';UsageLimits.readAstra=read;
await ProjectWorkspace.home();
return {pass:true,defaultPercent:20,startingRemaining:50,allocation:10,roundsUntilStop:2,rawTokensNotRequired:true,unavailableBlocks:true,stalePauses:true,providerRaceBlocked:true,reads};
