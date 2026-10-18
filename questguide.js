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
  async function ready() {await Lazy.load('questjournal');activate('tool:quests');for(let i=0;i<100&&!studio();i++)await new Promise(r=>setTimeout(r,40));if(!studio())throw Error('The quest journal is still loading. Try again in a moment.');return studio();}
  async function review({questId}={}) {const qj=await ready();if(questId?.startsWith('outing:')){const s=await OutingGuide.call({op:'state'}),plan=s.plans.find(p=>p.id===questId.slice(7));if(plan?.questId&&QuestCore.find(qj.snapshot(),plan.questId))qj.questDetail(plan.questId);else return OutingGuide.open({id:questId.slice(7)});}else if(questId&&QuestCore.find(qj.snapshot(),questId))qj.questDetail(questId);else qj.navigate('adventure');}
  async function waitFor(check,message){for(let i=0;i<120;i++){if(check())return;await new Promise(r=>setTimeout(r,50));}throw Error(message);}
  async function launchTool({tool,stepId}={}) {
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
  function customSteps(q) {
    const steps=[];
    if(q.tool==='slice')steps.push({id:'open-fl',title:'Open FL Studio for your sound',instruction:'Open FL Studio and load the sound you want to trim or reuse. Hearth checks that FL Studio is running; trimming and export remain yours to confirm.',check:'app',app:'fl'});
    else if(['lab','forge','tiles','sounds','rack','arena'].includes(q.tool))steps.push({id:'open-tool',title:q.tool==='arena'?'Open your game workspace':'Open your workbench',instruction:q.tool==='arena'?'Open Three.js Lab for your playable prototype. Use its Sketch editor and preview to build and test your interaction. Keep this helper beside it.':'Open the tool for this quest. Keep this helper beside it.',check:'tool',action:{type:'hearth-tool',tool:q.tool}});
    const app=q.tool==='slice'?{app:'fl'}:{};
    steps.push({id:'first-move',title:'One small move',instruction:q.tiny||'Make the smallest useful start. You can stop after this step.',check:'manual',...app});
    steps.push({id:'make',title:'Make the thing',instruction:q.done||'Finish one small result you can show.',check:'manual',...app});
    steps.push({id:'keep',title:'Save something you can show',instruction:'Save or export your result. Keep a file, image, sound or Hearth chat ready for your proof review.',check:'manual',...app});
    return steps;
  }
  async function open(quest) {
    const qj=await ready();state=await call('state');
    const journal=qj.snapshot(),eligible=q=>q&&!QuestCore.done(journal,q.id)&&!QuestCore.skipped(journal,q.id)&&!q.parked&&QuestCore.available(journal,q.id);
    let q=quest?QuestCore.find(journal,typeof quest==='string'?quest:quest.id):null;
    if(quest&&!eligible(q))throw Error('This quest is finished, paused or waiting for an earlier step. Choose an active quest from your notebook.');
    if(!q){const campaign=journal.campaigns.find(c=>c.id===journal.active&&!c.paused),planned=journal.plan?.quest&&QuestCore.find(journal,journal.plan.quest),tracked=QuestCore.next(journal,campaign);q=eligible(planned)?planned:eligible(tracked)?tracked:QuestCore.allQuests(journal).find(eligible);}
    if(!q)throw Error('Choose an unfinished quest from your notebook first.');
    const campaign=journal.campaigns.find(c=>c.id===q.campaign);
    if(campaign?.show&&window.OutingGuide){const s=campaign.show;return OutingGuide.open({id:s.key||'quest-'+q.id,title:s.title,venue:s.venue,address:s.address,start:s.start,dateOnly:s.dateOnly,questId:q.id});}
    const kit=qj.paris.ui();
    return kit.dialog('Guide me · '+q.title,(body,d)=>{
      const intro=kit.E('p',{class:'qg-intro',text:'One step beside your work. Automatic checks show what Hearth observed; creative steps stay yours to confirm.'});
      body.append(intro);
      const current=summary(q.id);
      if(current){body.append(kit.p(`${current.completed}/${current.total} steps saved · ${current.next||'Ready to show the result'}`),kit.button('Continue in the helper',async()=>{accept(await call('show'));d.close();},'qj-primary'));}
      const recipe=kit.E('select',{attrs:{'aria-label':'Guided recipe'}});
      recipe.append(kit.E('option',{value:'custom',text:'This quest, step by step'}),kit.E('option',{value:'music',text:'FL Studio · a song sketch'}));
      recipe.value=q.tool!=='slice'&&q.path==='music'&&/song|demo|bass|loop|beat|track|sketch/i.test(q.title+' '+q.done)?'music':'custom';
      const bpm=kit.E('input',{type:'number',value:'128',attrs:{min:'40',max:'250','aria-label':'Target tempo'}});
      const tempo=kit.E('label',{class:'qj-field'},kit.label('TARGET BPM'),bpm);
      const preview=kit.E('ol',{class:'qg-preview'});
      const refresh=()=>{tempo.hidden=recipe.value!=='music';preview.replaceChildren(...(recipe.value==='music'?['Open FL Studio — checked when running','Set your tempo — checked from FL','Build a bass — checked from channel/note evidence','Arrange a small idea','Save a demo, then show your result']:customSteps(q).map(s=>s.title)).map(t=>kit.E('li',{text:t})));};
      recipe.addEventListener('change',refresh);refresh();
      body.append(kit.E('label',{class:'qj-field'},kit.label('YOUR PATH'),recipe),tempo,preview);
      const error=kit.E('p',{class:'qj-copy',attrs:{role:'status'}});
      body.append(kit.button(current?'Start a new guided pass':'Start guided quest',async()=>{
        try{const value=Number(bpm.value);if(recipe.value==='music'&&(!Number.isFinite(value)||value<40||value>250))throw Error('Choose a tempo from 40 to 250 BPM.');
          accept(await call('start',{questId:q.id,title:q.title,kind:recipe.value,bpm:value,restart:!!current,...(recipe.value==='custom'?{steps:customSteps(q)}:{})}));d.close();
          if(recipe.value==='music'||q.tool==='slice')try{accept(await call('launch'));}catch(err){toast(err.message,{type:'error'});}
        }catch(err){error.textContent=err.message;}
      },'qj-primary'),error);
      body.append(kit.p('The helper stays above your apps. FL tempo and bass checks can read a chosen .flp when you save, or use the live read-only MIDI connection. Choose either setup in the helper. Your final XP and review still require proof.'));
    });
  }
  const report=fn=>(v)=>Promise.resolve().then(()=>fn(v)).catch(err=>toast(err.message,{type:'error'}));
  window.hub.onQuestGuide?.(accept);
  window.hub.onQuestGuideReview?.(report(review));
  window.hub.onQuestGuideTool?.(report(launchTool));
  window.hub.onQuestGuideOuting?.(report(async v=>{await ready();return window.OutingGuide?.openFromHelper(v);}));
  window.hub.onOutingGuide?.(report(async v=>{await ready();return window.OutingGuide?.open(v);}));
  if(window.hub.questGuide)call('state').then(accept).catch(()=>{});
  const api={open,summary,review,call,snapshot:()=>state};window.QuestGuide=api;return api;
})();
