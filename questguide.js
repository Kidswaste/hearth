// The studio's entry to its persistent companion. Progress comes from the main process;
// creative completion still goes through the journal's existing proof/review contract.
const QuestGuide = (() => {
  let state=null,lastProgress='',syncing=Promise.resolve();
  const studio=()=>typeof QuestJournal!=='undefined'&&QuestJournal.ready?.()?QuestJournal:null;
  async function call(op,values={}) {if(typeof window.hub?.questGuide!=='function')throw Error('The quest helper is unavailable in this build. Check Hearth’s updater.');const r=await window.hub.questGuide({op,...values});if(!r?.ok)throw Error(r?.error||'The quest helper could not answer.');return r.value;}
  const count=s=>Number.isFinite(s?.completed)?s.completed:(s?.session?.done||[]).length;
  function summary(qid) {if(!state?.session||qid&&state.session.questId!==qid)return null;return {completed:count(state),total:state.total||state.session.steps?.length||0,next:state.step?.title||'',active:!state.session.paused,visible:!!state.visible};}
  function accept(value) {
    state=value;const session=value?.session;if(!session){lastProgress='';document.dispatchEvent(new CustomEvent('questguide:changed',{detail:null}));return;}
    const sig=JSON.stringify([session.id,session.questId,count(value),value.index,session.paused]);
    if(sig===lastProgress)return;lastProgress=sig;
    document.dispatchEvent(new CustomEvent('questguide:changed',{detail:summary(session.questId)}));
    if(!session.questId||session.questId.startsWith('outing:')||!count(value))return;
    // Award the existing small-start once, not quest completion or a proof score.
    syncing=syncing.catch(()=>{}).then(async()=>{
      if(typeof QuestHud==='undefined')return;
      await QuestHud.core();const {C}=QuestHud.journal();
      await QuestHud.write(s=>{const q=C.find(s,session.questId);if(q&&!C.record(s,q.id).startedAt&&C.available(s,q.id))C.startSmall(s,q.id);},'Guided progress saved.');
    }).catch(err=>console.warn('[quest guide progress]',err.message));
  }
  async function ready() {await Lazy.load('questjournal');if(!studio())Tools.shown(Tools.get('quests'));for(let i=0;i<100&&!studio();i++)await new Promise(r=>setTimeout(r,40));if(!studio())throw Error('The quest journal is still loading. Try again in a moment.');return studio();}
  async function review({questId}={}) {const qj=await ready();if(questId?.startsWith('outing:')){const s=await OutingGuide.call({op:'state'}),plan=s.plans.find(p=>p.id===questId.slice(7));if(plan?.questId&&QuestCore.find(qj.snapshot(),plan.questId))qj.questDetail(plan.questId);else return OutingGuide.open({id:questId.slice(7)});}else if(questId&&QuestCore.find(qj.snapshot(),questId)){const q=QuestCore.find(qj.snapshot(),questId);if(q.projectId||state?.session?.questId===questId&&state.session.projectId)await qj.finishQuest(questId);else qj.questDetail(questId);}else{activate('tool:quests');qj.navigate('adventure');}}
  async function waitFor(check,message){for(let i=0;i<120;i++){if(check())return;await new Promise(r=>setTimeout(r,50));}throw Error(message);}
  async function launchTool({tool,stepId,projectId,tab,sceneId,chatId}={}) {
    if(projectId){await Lazy.load('projects');await Projects.ready();await ProjectWorkspace.open(projectId,sceneId?'overview':tab);if(sceneId)await ProjectWorkspace.openScene(sceneId);if(chatId&&tab==='chat')await ProjectWorkspace.conversation(Projects.get(projectId),chatId);return;}
    const targets={lab:'three',forge:'forgeheart',tiles:'creative',sounds:'creative',rack:'creative',arena:'three'};
    const target=targets[tool];if(!target)throw Error('This workbench is not supported. Start a fresh guided pass for this quest.');
    await Lazy.load(target==='creative'?'creative':target==='three'?'lab':'addons');
    activate('tool:'+target);
    const surface=()=>H.surfaces.get('tool:'+target);
    const mounted=()=>H.activeId==='tool:'+target&&surface()?.mounted&&!surface().tool?.__lazy&&surface().body?.isConnected;
    await waitFor(mounted,'The workbench did not finish opening. Try its button again.');
    if(target==='three'){await ThreeLab.cmd();await waitFor(()=>mounted()&&ThreeLab.director&&surface().head.querySelector('.lab-tabs'),'The Lab’s sketch workspace is still loading. Try again once it is ready.');}
    if(target==='forgeheart')await waitFor(()=>mounted()&&surface().body.querySelector('.tabbar button')&&surface().body.querySelector('.tabpane > *'),'Forgeheart’s workspace did not load. Open Forgeheart and check its project folder.');
    if(target==='creative'){
      await waitFor(()=>surface().body.querySelector('.cp-nav [data-feature-id]'),'Creative Playground is still loading.');
      const feature=tool==='tiles'?'pattern':'vst';
      await CreativePlayground.openFeature(feature);
      // Selection is assigned before async mount, and mount errors become UI notices.
      // Require the real station contents before reporting successful opening.
      const marker=feature==='pattern'?'.cp-stage .cp-tile-workbench input':'.cp-stage .wb-sound-picker';
      if(!mounted()||CreativePlayground.snapshot().feature!==feature||!surface().body.querySelector(marker))throw Error(feature==='vst'?'The Sound desk needs setup before this step can be checked. Resolve its audio setup message, then open it again.':'The tile workbench did not finish opening. Check its message and try again.');
    }
    if(!mounted())throw Error('The app changed before the workbench was ready. Open it again to check this step.');
    accept(await call('tool-opened',{stepId,tool}));
  }
  const planningQuest=q=>/^(choose|pick|find)\b/i.test(q.title)&&/write|listen|choose|pick/i.test(q.done);
  function customSteps(q) {
    if(planningQuest(q))return [{id:'first-move',title:'Find your starting point',instruction:q.tiny,check:'manual'},{id:'keep-choice',title:q.title,instruction:q.done+' Describe your choice here so you can pick it up next time.',check:'manual'}];
    const steps=[];
    if(q.tool==='slice')steps.push({id:'open-fl',title:'Open FL Studio for your sound',instruction:'Open FL Studio and load the sound you want to trim or reuse. Hearth checks that FL Studio is running; trimming and export remain yours to confirm.',check:'app',app:'fl'});
    else if(['lab','forge','tiles','sounds','rack','arena'].includes(q.tool))steps.push({id:'open-tool',title:q.tool==='arena'?'Open your game workspace':'Open your workbench',instruction:q.tool==='arena'?'Open Three.js Lab for your playable prototype. Use its Sketch editor and preview to build and test your interaction. Keep this helper beside it.':'Open the tool for this quest. Keep this helper beside it.',check:'tool',action:{type:'hearth-tool',tool:q.tool}});
    const app=q.tool==='slice'?{app:'fl'}:{};
    steps.push({id:'first-move',title:'One small move',instruction:q.tiny||'Make the smallest useful start. You can stop after this step.',check:'manual',...app});
    steps.push({id:'make',title:'Make the thing',instruction:q.done||'Finish one small result you can show.',check:'manual',...app});
    steps.push({id:'keep',title:'Save something you can show',instruction:'Save or export your result. Keep a file, image, sound or Hearth chat ready for your proof review.',check:'manual',...app});
    return steps;
  }
  function projectSteps(q) {
    if(q.projectTask?.v===1&&q.guideSteps?.length)return structuredClone(q.guideSteps);
    if (planningQuest(q)) return [
      {id:'first-move',title:'Find your starting point',instruction:q.tiny,check:'manual',action:{type:'project',tab:'chat'}},
      {id:'keep-choice',title:q.title,instruction:q.done+' Keep your choice in this project’s chat or notes, then describe it here.',check:'manual',action:{type:'project',tab:'chat'}},
    ];
    const target=['sounds','rack'].includes(q.tool)?'sound':['tiles'].includes(q.tool)||/draw|storyboard|material|texture/i.test(q.title)?'board':'scene';
    const action={type:'project',tab:target};
    const task=target==='sound'?'Choose Serum 2 or Vital. Change one sound into something you would use; save its preset.':target==='board'?'Use Materials, Drawing or Storyboard. Make one purposeful change and keep the result on your worktable.':'Change one visible or playable detail in your scene. Run it, fix any error, and save the version you prefer.';
    return [
      {id:'first-move',title:'Start small',instruction:q.tiny||'Choose one detail worth finishing today. Name it before expanding the idea.',check:'manual',action},
      {id:'project-make',title:q.done?'Make your next version':'Make one useful change',instruction:[q.done,task,'Hearth checks a saved change, not whether it is good.'].filter(Boolean).join(' '),check:'project-change',target,action},
      {id:'try-it',title:target==='sound'?'Listen, then decide':target==='scene'?'Try it as a player':'Look at the whole piece',instruction:target==='sound'?'Play a short phrase. Check the attack, tail and level. Describe one thing that works and one thing to improve.':target==='scene'?'Play your scene. Try the interaction you changed, including one awkward edge case. Note what works and the next fix.':'Preview your drawing, material or storyboard in context. Check readability and rhythm. Note what works and the next improvement.',check:'manual',action},
      {id:'project-keep',title:'Keep something worth showing',instruction:'Keep an image on this project’s worktable, save an instrument preset, or add your exported file / capture to the project. Then open your quest’s proof review for feedback and rewards.',check:'project-output',target,action:{type:'project',tab:target==='scene'?'overview':target}},
    ];
  }
  let checking=false,checkTimer;
  async function checkProject(quiet=false) {
    if(checking)return;const s=state?.session,step=state?.step;
    if(!s?.projectId||s.paused||!['project-change','project-output'].includes(step?.check))return;
    checking=true;
    try{if(window.WorkbenchUI?.scope?.()===s.projectId)await WorkbenchUI.flush();await Projects.flush();accept(await call('check-project',{stepId:step.id,quiet}));}
    finally{checking=false;}
  }
  const saved=()=>{clearTimeout(checkTimer);if(state?.session?.projectId&&!state.session.paused)checkTimer=setTimeout(()=>checkProject(true).catch(err=>console.warn('[quest saved check]',err.message)),650);};
  window.addEventListener('hearth:scene-saved',saved);window.addEventListener('hearth:projects',saved);window.addEventListener('hearth:workbench-saved',saved);
  function projectCard(p) {
    const root=el('section',{class:'pw-shelf-section qg-project-card',dataset:{questProject:p.id}});
    const paint=()=>{
      const s=state?.session,linked=s?.projectId===p.id,step=linked&&state.step;
      const button=(text,fn,title)=>el('button',{type:'button',class:'ghost small',text,title,on:{click:async e=>{const b=e.currentTarget;b.disabled=true;try{await fn();}catch(err){toast(err.message,{type:'error'});}finally{b.disabled=false;}}}});
      root.replaceChildren(el('h3',{text:linked?`✦ NEXT MOVE · ${count(state)}/${state.total}`:'✦ A small win'}));
      if(!linked){root.append(button('Take a quest',()=>open(null,p.id),'See your next quest for this project'));return;}
      root.append(el('strong',{text:step?.title||'Ready for proof review'}),el('p',{text:step?.instruction||'Show your result for feedback and rewards.'}));
      const actions=el('div',{class:'qg-project-actions'});
      if(step?.action)actions.append(button('↗ Work',()=>call('action',{stepId:step.id}),`Open ${step.action.tab||'workspace'}`));
      if(step?.check?.startsWith('project-'))actions.append(button('✓ Check',()=>checkProject(false),'Check this project’s saved work'));
      actions.append(button(step?'Helper ↗':'Review ↗',()=>step?call('show'):review({questId:s.questId}),'Open the guide and evidence history'));root.append(actions);
      root.append(button('New from chat',()=>open(null,p.id,{fresh:true}),'Offer a new quest from recent project work. Your current quest and progress stay in the log.'));
    };root._questPaint=paint;paint();return root;
  }
  document.addEventListener('questguide:changed',()=>document.querySelectorAll('[data-quest-project]').forEach(n=>n._questPaint?.()));
  document.addEventListener('questproject:chat-changed',e=>{for(const n of document.querySelectorAll('[data-quest-project]'))if(n.dataset.questProject===e.detail.projectId){n.querySelector('.qg-chat-fresh')?.remove();n.append(el('small',{class:'qg-chat-fresh',text:'✦ Next quest follows your latest chat',title:'Your accepted quest stays as it is. New suggestions use the latest conversation when you take your next quest.'}));}});
  async function open(quest,projectId,options={}) {
    const qj=await ready();state=await call('state');
    await Lazy.load('projects');await Projects.ready();
    const journal=qj.snapshot(),eligible=q=>q&&!QuestCore.done(journal,q.id)&&!QuestCore.skipped(journal,q.id)&&!q.parked&&QuestCore.available(journal,q.id);
    const requested=typeof quest==='string'?quest:quest?.id;
    const daily=requested&&QuestCore.daily().find(q=>q.id===requested);
    let q=requested?QuestCore.find(journal,requested)||daily:null;
    if(quest&&!eligible(q)&&!(daily&&!QuestCore.find(journal,requested)))throw Error('This quest is finished, paused or waiting for an earlier step. Choose an active quest from your notebook.');
    const context=Projects.get(projectId||ProjectWorkspace.current()?.id);
    if(!quest&&context){
      q=options.fresh?null:QuestProject.choose(context,[],journal,QuestCore);
      if(!q){
        const scenes=await Projects.Src.sketches(),suggestion=await QuestChat.suggest(context,scenes,qj);
        if(suggestion===null)return;
        const candidates=suggestion.fromChat?suggestion.quests:QuestProject.catalog(context,scenes),latest=qj.snapshot();
        q=options.fresh?candidates.find(x=>!QuestCore.find(latest,x.id)):QuestProject.choose(context,candidates,latest,QuestCore);
        if(!q&&suggestion.fromChat)throw Error('No new unfinished quest from your latest conversation. Keep working in the project chat; your next suggestion will follow it.');
      }
      if(!q)throw Error('You’ve finished or set aside this project’s current missions. Revisit one in the quest log, or add new work to the project for fresh targets.');
    }
    if(!q){const campaign=journal.campaigns.find(c=>c.id===journal.active&&!c.paused),planned=journal.plan?.quest&&QuestCore.find(journal,journal.plan.quest),tracked=QuestCore.next(journal,campaign);q=eligible(planned)?planned:eligible(tracked)?tracked:QuestCore.allQuests(journal).find(eligible);}
    if(!q)throw Error('Choose an unfinished quest from your notebook first.');
    const campaign=journal.campaigns.find(c=>c.id===q.campaign);
    if(campaign?.show&&window.OutingGuide){const s=campaign.show;return OutingGuide.open({id:s.key||'quest-'+q.id,title:s.title,venue:s.venue,address:s.address,start:s.start,dateOnly:s.dateOnly,questId:q.id});}
    const kit=qj.paris.ui();
    const saved=await call('quest',{questId:q.id}),current=saved.session;
    const keepProgress=!!current?.done.length;
    const creative=['lab','tiles','sounds','rack','arena','forge'].includes(q.tool);
    const pid=q.projectTask?q.projectId:keepProgress?current.projectId:creative?(projectId||ProjectWorkspace.current()?.id||current?.projectId||''):'';
    if(q.projectTask&&!Projects.get(pid))throw Error('This quest’s project is not available here yet. Your quest progress is kept.');
    const music=!pid&&q.path==='music'&&!['sounds','rack','slice'].includes(q.tool)&&/\b(make|build|write|record|arrange|finish|export|polish)\b/i.test(q.title)&&/song|demo|bass|loop|beat|track|sketch/i.test(q.title);
    const kind=keepProgress?current.kind:music?'music':'custom';
    const steps=keepProgress?current.steps:pid?projectSteps(q):kind==='music'?undefined:customSteps(q);
    const step=keepProgress?saved.step:steps?.[0]||{instruction:'Open FL Studio and start a song project. Your guide will stay beside it.'};
    const location=pid?(Projects.get(pid)?.name||current?.projectStart?.name||'Your project'):kind==='music'||q.tool==='slice'?'FL Studio':({tiles:'Seamless tiles',lab:'Scene studio',arena:'Scene studio',forge:'Forgeheart',sounds:'Sound desk',rack:'Sound desk'}[q.tool]||'Your quest log');
    const continuing=!!current||!!QuestCore.record(journal,q.id).acceptedAt||!!QuestCore.record(journal,q.id).startedAt;
    return kit.dialog(q.title,(body,d)=>{
      d.classList.add('qg-offer');d.dataset.questOffer=q.id;d.dataset.project=pid||'';
      body.append(kit.E('div',{class:'qg-offer-meta'},kit.E('span',{text:'◷ '+q.minutes+' min'}),kit.E('span',{text:'✦ '+q.xp+' XP'}),kit.E('span',{text:'⌖ '+location})),kit.E('p',{class:'qg-offer-goal',text:q.done}));
      if(q.projectTask?.quote)body.append(kit.E('details',{class:'qg-offer-source'},kit.E('summary',{text:'From your project chat'}),kit.E('blockquote',{text:q.projectTask.quote}),kit.button('↗ Open source chat',async()=>{d.close();try{await QuestChat.source(q);}catch(err){toast(err.message,{type:'error'});}},'qj-quiet')));
      else if(q.projectTask)body.append(kit.E('small',{class:'qg-offer-source',text:'From '+q.projectTask.source,title:'Based on the named scene or tool in this project. Proof review still checks the result.'}));
      body.append(kit.E('section',{class:'qg-offer-next'},kit.label(keepProgress?step?'NEXT STEP · '+(saved.completed+1)+' / '+saved.total:'READY TO REVIEW':'FIRST STEP'),kit.E('p',{text:step?.instruction||'Show your result to get feedback and collect your rewards.'})));
      const error=kit.E('p',{class:'qj-copy',attrs:{role:'status'}});
      const later=kit.button('Not now',()=>d.close(),'qj-quiet');
      const start=kit.button(current&&!step?'Review result':continuing?'Continue quest':'Accept quest',async()=>{
        later.disabled=true;
        try{
          if(pid){await Projects.flush();if(window.WorkbenchUI?.scope?.()===pid)await WorkbenchUI.flush();}
          if(q.projectTask?.context&&!QuestCore.find(qj.snapshot(),q.id)){const fresh=await QuestChat.context(Projects.get(pid),await Projects.Src.sketches());if(fresh.fingerprint!==q.projectTask.context||fresh.messages.some(m=>Native.isBusy(m.chatId)))throw Error('Your project chat changed. Close this offer and take a quest again for the latest work.');}
          if(q.projectTask?.sceneId){const p=Projects.get(pid),sid=q.projectTask.sceneId;if(!p||(p.workspace?.sceneId!==sid&&!p.items.some(x=>x.type==='scene'&&x.ref===sid))||!(await Projects.Src.sketches()).some(s=>s.id===sid))throw Error('This quest’s scene is no longer available in the project. Your progress is kept.');}
          await qj.mutate(s=>{
            if(!QuestCore.find(s,q.id)){
              if(q.projectTask)QuestProject.track(s,q,QuestCore);
              else{const fresh=QuestCore.daily().find(x=>x.id===q.id);if(!fresh)throw Error('This suggestion changed. Open your quest log and choose again.');QuestCore.trackSide(s,fresh);}
            }
            if(!QuestCore.available(s,q.id)||QuestCore.done(s,q.id))throw Error('This quest is no longer available.');
            const record=QuestCore.record(s,q.id);s.records[q.id]={...record,acceptedAt:record.acceptedAt||new Date().toISOString()};
            if(q.campaign)s.active=q.campaign;
            QuestCore.planQuest(s,q.id,step?.instruction?.slice(0,500)||q.done,Math.min(120,Math.max(1,Math.round(q.minutes))));
          },'Quest added to your log.');
          await Lazy.load('questhud');await QuestHud.refresh();QuestHud.pin(q.id);
          const next=await call('start',{questId:q.id,title:q.title,kind,bpm:128,projectId:pid||undefined,steps,replanUnstarted:true});accept(next);d.close();
          try{if(!next.step)await review({questId:q.id});else if(next.step.action)await launchTool({...next.step.action,stepId:next.step.id,projectId:next.session.projectId});else if(next.step.app==='fl')accept(await call('launch'));}
          catch(err){toast('Quest saved. '+err.message,{type:'error'});}
        }catch(err){error.textContent=err.message;start.textContent='Continue quest';}
        finally{later.disabled=false;}
      },'qj-primary');
      body.append(kit.E('div',{class:'qg-offer-actions'},start,later),error);
    },continuing?'IN YOUR QUEST LOG':'QUEST OFFER');
  }
  const report=fn=>(v)=>Promise.resolve().then(()=>fn(v)).catch(err=>toast(err.message,{type:'error'}));
  window.hub.onQuestGuide?.(accept);
  window.hub.onQuestGuideReview?.(report(review));
  window.hub.onQuestGuideTool?.(report(launchTool));
  window.hub.onQuestGuideOuting?.(report(async v=>{await ready();return window.OutingGuide?.openFromHelper(v);}));
  window.hub.onOutingGuide?.(report(async v=>{await ready();return window.OutingGuide?.open(v);}));
  if(window.hub.questGuide)call('state').then(accept).catch(()=>{});
  const api={open,summary,review,call,projectCard,projectSteps,checkProject,snapshot:()=>state};window.QuestGuide=api;return api;
})();
