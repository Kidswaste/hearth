// On-demand, cached chat-to-quest planning. Never runs a model on each reply/token.
const QuestChat=(()=>{
  const C=QuestChatCore,runs=new Map(),pending=new Map();let listening=false;
  function helper(c){
    const agent=H.agents().find(a=>a.mode==='native'&&a.engine==='codex'&&!a.dock)||H.agents().find(a=>a.mode==='native'&&!a.dock);
    if(!agent)throw Error('Add Astra or Claude to make quests from your project chat.');
    if(!listening){hub.onEngineEvent(ev=>runs.get(ev.chatId)?.(ev));listening=true;}
    const id='quest-chat-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7);let finish;
    const promise=new Promise((resolve,reject)=>{
      let output='';const timer=setTimeout(()=>{hub.stop(id).catch(()=>{});finish(Error('The quest planner took too long. Your progress is unchanged.'));},90000);
      finish=(error,value)=>{if(!runs.has(id))return;runs.delete(id);clearTimeout(timer);error?reject(error):resolve(value);};
      runs.set(id,ev=>{
        if(ev.type==='delta'){output+=ev.text||'';if(output.length>16000){hub.stop(id).catch(()=>{});finish(Error('The quest plan was too long.'));}}
        else if(ev.type==='done'){if(ev.usage)document.dispatchEvent(new CustomEvent('hearth:usage',{detail:{agentId:agent.id,usage:ev.usage,source:'project-quests'}}));try{finish(null,C.validate(ev.text||output,c));}catch(e){finish(e);}}
        else if(ev.type==='error'||ev.type==='stopped')finish(Error(ev.message||'Quest planning stopped.'));
      });
      hub.send({agentId:agent.id,chatId:id,session:{},text:C.prompt(c),options:{questReview:true,lean:true,helper:true,persona:C.persona,webSearch:'disabled'}}).catch(finish);
    });
    return {promise,cancel:()=>{hub.stop(id).catch(()=>{});finish(Error('Cancelled.'));}};
  }
  async function context(p,scenes){
    const ids=new Set([p.workspace?.chatId,...p.items.filter(x=>x.type==='chat').map(x=>x.ref)].filter(Boolean));
    const summaries=H.chats.filter(c=>ids.has(c.id)).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,3);
    const chats=await Promise.all(summaries.map(c=>Native.load(c.id).catch(()=>null)));
    const links=Object.fromEntries([...ids].map(id=>[id,ChatScenes.linkOf(id)]));
    return C.context(p,chats.filter(Boolean),scenes,links);
  }
  async function suggest(p,scenes,qj){
    // Repeated clicks must not create a second dialog/request or offer.
    if(pending.has(p.id))return null;
    const promise=prepare(p,scenes,qj).finally(()=>pending.delete(p.id));pending.set(p.id,promise);return promise;
  }
  async function prepare(p,scenes,qj){
    const c=await context(p,scenes);if(!c.focusId)return {quests:[],fromChat:false};
    if(c.messages.some(m=>Native.isBusy(m.chatId)))throw Error('Your project chat is still working. Finish or stop its reply, then take a quest from the latest result.');
    const cacheKey='quest-chat-'+p.id,cached=await hub.kvGet(cacheKey,null);
    if(cached?.fingerprint===c.fingerprint){try{return {quests:C.quests(c,C.validate({tasks:cached.tasks},c)),fromChat:true};}catch{/* stale/invalid cache is regenerated */}}
    const kit=qj.paris.ui();let cancelled=false,finished=false,job;
    const d=kit.dialog('Following your latest work',body=>{
      body.append(kit.E('p',{class:'qj-copy',text:'Turning your recent project conversation into one small, specific quest…'}),kit.button('Not now',()=>d.close(),'qj-quiet'));
    },p.name);
    d.dataset.questPlanning=p.id;
    d.addEventListener('close',()=>{if(!finished){cancelled=true;job?.cancel();}},{once:true});
    try{
      job=helper(c);const tasks=await job.promise;
      if(cancelled)return null;
      // A new message or scene change during planning invalidates the result before it can be offered/cached.
      const fresh=await context(Projects.get(p.id)||p,await Projects.Src.sketches());
      if(cancelled)return null;
      if(fresh.fingerprint!==c.fingerprint||fresh.messages.some(m=>Native.isBusy(m.chatId)))throw Error('Your project chat changed while planning. Take a quest again to use the latest work.');
      await hub.kvSet(cacheKey,{v:1,fingerprint:c.fingerprint,tasks,at:Date.now()});
      if(cancelled)return null;return {quests:C.quests(c,tasks),fromChat:true};
    }catch(err){if(cancelled)return null;throw err;}
    finally{finished=true;if(d.open)d.close();}
  }
  async function source(q){
    const p=Projects.get(q.projectId),chatId=q.projectTask?.chatId;
    if(!p||!p.items.some(x=>x.type==='chat'&&x.ref===chatId)&&p.workspace?.chatId!==chatId)throw Error('The source chat is no longer linked to this project. Its quest progress is kept.');
    await ProjectWorkspace.conversation(p,chatId);
    const chat=await Native.load(chatId),index=chat.messages.findIndex(m=>m.at===q.projectTask.messageAt);
    if(index>=0)Native.jumpTo(chat.agentId,index);
  }
  // A tiny notice only. Extraction happens on Take a quest; no background API requests.
  Native.hooks.event.push((ev,chat)=>{if(!['done','error','stopped'].includes(ev.type))return;for(const p of Projects.all())if(p.workspace?.chatId===chat.id||p.items.some(x=>x.type==='chat'&&x.ref===chat.id))document.dispatchEvent(new CustomEvent('questproject:chat-changed',{detail:{projectId:p.id}}));});
  return {suggest,context,source};
})();
