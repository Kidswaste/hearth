// One project across existing tools, using real chats/scenes/boards and additive metadata.
window.ProjectWorkspace = (() => {
  const C = ProjectWorkspaceCore, P = Projects, surfaces = new Set(['home','three','creative','board','projectchat']);
  let active = null, surface = 'home', route = 0, preparing = new Map(), conversationId=null, conversationScene=null;
  let lifecycle = Promise.resolve(), opening = null, loadState = { phase:'idle' };
  const serial = fn => lifecycle = lifecycle.catch(()=>{}).then(fn);
  const cancelled = signal => { if(signal?.aborted)throw new DOMException('Opening cancelled','AbortError'); };
  const describing = new Set();
  const get = () => active && P.get(active);
  const chatOf = p => (H.chats || []).find(c => c.id === (p?.id===active && conversationId || p?.workspace?.chatId));
  const sceneOf = p => p?.id===active && conversationScene || p?.workspace?.sceneId;
  const current = () => get() || null;
  const resumeKey='workspace.returnPoints';
  const returnPoint=id=>store.get(resumeKey,{})?.[id]||{};
  function remember(tab=loadState.lastSwitch?.tab) {
    const p=get();if(!p||!tab)return;
    const old=store.get(resumeKey,{}),point={...returnPoint(p.id),tab,chatId:chatOf(p)?.id,sceneId:sceneOf(p),at:Date.now()};
    if(tab==='board'&&Lazy.loaded('creative'))point.feature=CreativePlayground.lastBoard();
    old[p.id]=point;store.set(resumeKey,Object.fromEntries(Object.entries(old).sort((a,b)=>(b[1]?.at||0)-(a[1]?.at||0)).slice(0,100)));
  }
  document.addEventListener('hearth:creative-feature',()=>{if(get()&&surface==='creative'&&H.activeId==='tool:creative')remember(CreativePlayground.snapshot().feature==='vst'?'sound':'board');});
  function switcher(anchor) {
    const rect=anchor.getBoundingClientRect(),labels={overview:'Desk',chat:'Chat',scene:'Scene',board:'Creative board',sound:'Sound',moodboard:'Moodboard'};
    showMenu(rect.left,rect.bottom+4,[...P.live().slice(0,12).map(p=>({label:`${p.ident.glyph} ${p.name}`,checked:p.id===active,hint:labels[returnPoint(p.id).tab]||'Desk',action:()=>open(p.id).catch(err=>{if(!err?.shown)toast(calmError(err),{type:'error'});})})),'-',{label:'All projects',action:()=>home()},{label:'＋ New project',action:()=>wizard()}]);
  }
  const base = path => String(path).split(/[\\/]/).pop();
  const agentFor = tool => surfaces.has(tool) && get() ? H.agent(chatOf(get())?.agentId) : null;
  const surfaceFor = id => { const c = chatOf(get()); return c && id === c.agentId && H.activeChat[id] === c.id ? 'tool:' + surface : null; };
  function svg(kind) { const s = document.createElementNS('http://www.w3.org/2000/svg','svg'), p = document.createElementNS(s.namespaceURI,'path'); s.setAttribute('viewBox','0 0 24 24'); s.setAttribute('aria-hidden','true'); p.setAttribute('d',C.ICONS[kind] || C.ICONS.spark); s.append(p); return s; }
  const action = (text, fn, cls = 'ghost small') => el('button',{type:'button',class:cls,text,on:{click:async e=>{const b=e.currentTarget;b.disabled=true;try{await fn();}catch(err){toast(calmError(err),{type:'error'});}finally{b.disabled=false;}}}});
  const save = async (p, patch) => { P.setWorkspace(p, patch); await P.flush(); };
  async function ensure(p, options = {}) {
    if(p.workspace?.chatId && p.workspace.sceneId && p.workspace.boardId && chatOf(p))return p;
    if (preparing.has(p.id)) return preparing.get(p.id);
    const task = (async () => {
      // Save each reference immediately. Retrying a partial setup reuses completed parts.
      // (round 72) a project whose chat hasn't arrived yet isn't rewritten (nor moved to the top) each time it's tried
      const w = C.workspace(p.workspace); if(JSON.stringify(w)!==JSON.stringify(p.workspace))P.setWorkspace(p,w);
      if (!w.chatId) {
        const old = p.items.filter(x=>x.type==='chat').map(x=>H.chats.find(c=>c.id===x.ref)).find(c=>H.agent(c?.agentId)?.mode==='native');
        if (old) await save(p,{chatId:old.id});
        else {
          const a = H.agent(options.agentId) || H.agents().find(a=>a.mode==='native' && a.engine==='codex' && !a.dock) || H.claudeAgent();
          if (!a || a.mode!=='native') throw Error('Add a native AI in Settings to create a project chat.');
          const at=Date.now(), chat={id:`${a.id}-project-${p.id}`,agentId:a.id,title:p.name,createdAt:at,updatedAt:at,session:{},messages:[],style:C.PERSONAS[w.persona][1]};
          const r=await hub.saveChat(chat); if(r?.error)throw Error(r.error);
          Native.adopt(chat,{openIt:false}); P.add(p,'chat',chat.id,chat.title,{links:false}); await save(p,{chatId:chat.id});
        }
      }
      if (!chatOf(p)) throw Error('This project’s chat is not available on this computer yet. Its saved link has been kept.');
      if (!p.workspace.sceneId) {
        await Lazy.load('lab'); await ThreeLab.cmd({show:false});
        const linked=ChatScenes.linkOf(p.workspace.chatId), old=p.items.find(x=>x.type==='scene' && ThreeLab.scenes.get(x.ref));
        const source=options.sceneId && ThreeLab.scenes.get(options.sceneId);
        const scene=source ? ThreeLab.scenes.duplicate(source.id,p.name) : linked && ThreeLab.scenes.get(linked) || old && ThreeLab.scenes.get(old.ref) || ChatScenes.fresh(p.workspace.chatId);
        if (!scene) throw Error('The scene is still loading. Reopen the project to finish setup.');
        if (!old && !linked) ThreeLab.scenes.rename(scene.id,p.name);
        if (!linked) ChatScenes.link(p.workspace.chatId,scene.id,{rename:false});
        P.add(p,'scene',scene.id,scene.name,{links:false}); await save(p,{sceneId:scene.id});
      }
      if (!p.workspace.boardId) {
        await Lazy.load('board'); await Board.ready();
        const old=p.items.find(x=>x.type==='board' && Board.findBoard(x.ref));
        const source=options.boardId && await Board.load(options.boardId);
        const board=old ? await Board.load(old.ref) : source ? await Board.duplicate(source) : await Board.create(`${p.name} · Moodboard`,{quiet:true,open:false});
        if(source)await Board.rename(`${p.name} · Moodboard`,board);
        Board.linkChat(p.workspace.chatId,board.id); P.add(p,'board',board.id,board.name,{links:false}); await save(p,{boardId:board.id});
      }
      return p;
    })().finally(()=>preparing.delete(p.id)); preparing.set(p.id,task); return task;
  }
  function loading(p, closing=false) {
    document.querySelector('.pw-loading')?.close();
    const d=el('dialog',{class:'pw-loading',attrs:{'aria-label':closing?'Saving project':'Opening project'}}), ship=el('button',{class:'pw-load-ship',type:'button',title:'Give the ship a little spin',attrs:{'aria-label':'Spin the loading ship'}},svg(p.name.toLowerCase().includes('clink')?'brushes':'ship'));
    const status=el('p',{class:'pw-load-status',attrs:{role:'status','aria-live':'polite'},text:closing?'Saving your work…':'Opening your workspace…'}),fill=el('i'), stages=el('div',{class:'pw-load-stages'}),actions=el('div',{class:'pw-load-actions'}),detail=el('p',{class:'pw-load-detail',text:'Your next little world is taking shape.'});
    ['Files','Scene','Board','Sound','Ready'].forEach((text,i)=>stages.append(el('span',{text,dataset:{step:i}})));
    let step=-1, slow;
    ship.onclick=()=>{ship.classList.remove('boost');void ship.offsetWidth;ship.classList.add('boost');};
    const cancel=action('Back to projects',()=>home());if(!closing)actions.append(cancel);
    d.append(el('div',{class:'pw-load-orbit'},ship),el('div',{class:'pw-eyebrow',text:closing?'DOCKING / SAVING':'HEARTH / OPENING'}),el('h2',{text:p.name}),status,el('div',{class:'pw-load-bar',attrs:{role:'progressbar','aria-label':'Project loading stages'}},fill),stages,detail,actions);
    d.oncancel=e=>{e.preventDefault();if(!closing)home().catch(err=>toast(calmError(err),{type:'error'}));};
    d.onclose=()=>{clearTimeout(slow);d.remove();};document.body.append(d);d.showModal();
    const ui={
      update(n,text){step=Math.max(step,n);status.textContent=text;fill.style.transform=`scaleX(${(step+1)/5})`;stages.querySelectorAll('span').forEach((s,i)=>s.classList.toggle('done',i<=step));d.querySelector('[role=progressbar]').setAttribute('aria-valuetext',text);clearTimeout(slow);slow=setTimeout(()=>{detail.textContent='Still working. Larger assets and instruments can take a little longer.';},7000);},
      error(err,retry,editor){clearTimeout(slow);d.classList.add('failed');status.textContent=calmError(err);detail.textContent=/not (available|arrived) on this computer|has not arrived/i.test(err?.message)?'It may still be on its way from your other computer. Your project and saved links are kept.':'Your project and saved links are kept.';actions.replaceChildren(action('Retry',retry),...(editor?[action('Open scene editor',editor)]:[]),action(closing?'Keep working':'Back to projects',closing?()=>d.close():()=>home()));},
      close(){d.close();clearTimeout(slow);d.remove();}
    };return ui;
  }
  // switching: another project opens right after, so the Lab keeps its preview page for it (round 72, projects72)
  async function closeCurrent(ui,{switching=false}={}) {
    const p=get();if(!p)return;
    remember();
    ui?.update(0,'Saving scene and chat…');
    const c=chatOf(p);Native.view(c?.agentId)?.saveDraft?.flush();
    if(Lazy.loaded('lab'))await ThreeLab.workspace?.close(switching?{keep:true}:undefined);
    ui?.update(2,'Saving creative board and instrument…');
    if(Lazy.loaded('board')){await Board._.flush();Board._.stopAllPreviews();Board._.cancelAnim();}
    if(Lazy.loaded('creative')){await WorkbenchUI.setProject(null);CreativePlayground.pause();}
    await P.flush();active=null;conversationId=null;conversationScene=null;surface='home';loadState={phase:'idle',closed:p.id};WorkspaceNav.sync();
  }
  function open(id, tab=null, options={}) {
    opening?.abort();const controller=new AbortController();opening=controller;const ticket=++route;
    return serial(async()=>{
      await P.ready();if(controller.signal.aborted)return;const p=P.get(id);if(!p)throw Error('Project not found.');
      if(get()===p&&loadState.phase==='ready'){opening=null;if(tab)await go(tab,ticket);return p;}
      const ui=loading(p),started=performance.now(),timings={};
      const stage=(n,text)=>{ui.update(n,text);loadState={phase:'opening',project:id,stage:text,timings};};
      try{
        await closeCurrent(ui,{switching:true});cancelled(controller.signal);
        active=id;stage(0,'Reading project files…');
        await ensure(p);cancelled(controller.signal);
        // (round 72) the chat to resume is read while the workspace's code loads, and the worktable while the Lab mounts
        const early=C.resume(p,{...returnPoint(id),...options,...(tab?{tab}:{})},H.chats,[]).chatId,chatRead=early?Native.load(early):null;chatRead?.catch(()=>{});
        await Promise.all([Lazy.load('lab'),Lazy.load('board'),Lazy.load('creative')]);
        const desk=WorkbenchUI.setProject(p.id,{title:p.name,plugins:C.workspace(p.workspace).plugins});desk.catch(()=>{});
        // the Lab mounting for the first time opens the scene of the chat on screen: this project's chat is put there
        // first, so the Lab's first page is the project's scene (not the last Lab scene, released and loaded again)
        const first=H.chats.find(x=>x.id===early);if(first&&!ThreeLab.workspace)Native.selectChat(first.agentId,first.id);
        await ThreeLab.cmd({show:false});cancelled(controller.signal);
        active=id;const point=C.resume(p,{...returnPoint(id),...options,...(tab?{tab}:{})},H.chats,ThreeLab.scenes.all());
        conversationId=point.chatId;conversationScene=point.sceneId;tab=point.tab;
        const c=chatOf(p);await (c.id===early?chatRead:Native.load(c.id));Native.selectChat(c.agentId,c.id);P.touch(p);
        await desk;
        timings.filesMs=Math.round(performance.now()-started);cancelled(controller.signal);
        stage(1,'Building your scene…');surface='three';activate('tool:three');Tools.openDock('three');
        // (round 72) the scene starts first and the chat draws while its page works; the moodboard is read meanwhile
        const board=Board.ready().then(()=>Board.load(p.workspace.boardId));board.catch(()=>{});
        const scene=options.preview!==false?ThreeLab.workspace.prepare(sceneOf(p),{signal:controller.signal,progress:text=>stage(1,text)}):null;scene?.catch(()=>{});
        await Native.refresh(c.agentId,{keepScroll:true});
        if(scene)await scene;
        else if(!ThreeLab.scenes.open(sceneOf(p)))throw Error('This scene is not available yet.');
        timings.sceneMs=Math.round(performance.now()-started)-timings.filesMs;cancelled(controller.signal);
        stage(2,'Preparing the creative board…');
        if(!await board)throw Error('The moodboard is not available on this computer yet.');
        stage(3,'Restoring your instrument…');
        const soundAt=performance.now();const warning=await WorkbenchUI.preloadSound({signal:controller.signal});timings.soundMs=Math.round(performance.now()-soundAt);cancelled(controller.signal);
        await go(tab,ticket);cancelled(controller.signal);
        timings.totalMs=Math.round(performance.now()-started);const lastSwitch=loadState.lastSwitch;stage(4,'Ready to make something.');loadState={phase:'ready',project:id,timings,lastSwitch};
        ui.close();if(warning)toast(warning,{timeout:7000});return p;
      }catch(err){
        if(err.name==='AbortError'||controller.signal.aborted){ui.close();return;}
        loadState={phase:'error',project:id,error:calmError(err),timings};
        // (round 72) the editor is offered only for a scene that is on this computer; the dialog is the message (err.shown)
        ui.error(err,()=>open(id,tab),Lazy.loaded('lab')&&ThreeLab.scenes?.get(sceneOf(p))?()=>open(id,'scene',{preview:false}):null);err.shown=true;throw err;
      }finally{if(opening===controller)opening=null;}
    });
  }
  async function go(tab, ticket=++route) {
    const p=get(); if(!p)return;const started=performance.now();
    const target={overview:'home',chat:'projectchat',scene:'three',sound:'creative',board:'creative',moodboard:'board'}[tab] || 'home';
    if(target==='three'){await Lazy.load('lab');await ThreeLab.cmd({show:false});}
    if(target==='board')await Lazy.load('board');
    if(target==='creative'){await Lazy.load('creative');await WorkbenchUI.setProject(p.id,{title:p.name,plugins:C.workspace(p.workspace).plugins});}
    if(ticket!==route || get()!==p)return;
    surface=target; const c=chatOf(p); if(c)Native.selectChat(c.agentId,c.id);
    if(target==='home')ProjectsHome.show(p.id);
    if(target==='three' && !ThreeLab.scenes.open(sceneOf(p)))throw Error('This scene has not arrived on this computer yet.');
    if(target==='board' && !await Board.open(p.workspace.boardId))throw Error('This moodboard has not arrived on this computer yet.');
    if(ticket!==route || get()!==p)return;
    if(target==='creative')await WorkspaceNav.creative(tab==='sound'?'vst':returnPoint(p.id).feature||'studio');
    else activate('tool:'+target);
    if(ticket!==route || get()!==p)return;
    Tools.openDock(target);
    WorkspaceNav.sync();
    loadState.lastSwitch={tab,ms:Math.round((performance.now()-started)*10)/10};
    remember(tab);
  }
  async function openScene(id,p=get()) {
    if(!p||!(p.workspace?.sceneId===id||p.items.some(x=>x.type==='scene'&&x.ref===id)))throw Error('This scene is no longer linked to the project. Its saved work is kept.');
    await Lazy.load('lab');await ThreeLab.cmd({show:false});
    if(!ThreeLab.scenes.get(id))throw Error('This quest’s scene has not arrived on this computer yet.');
    const linked=p.items.find(x=>x.type==='chat'&&ChatScenes.linkOf(x.ref)===id&&H.chats.some(c=>c.id===x.ref));
    if(get()!==p)return open(p.id,'scene',{sceneId:id,chatId:linked?.ref||p.workspace.chatId});
    if(linked&&chatOf(p)?.id!==linked.ref)await conversation(p,linked.ref);
    conversationScene=id;await go('scene');
  }
  async function conversation(p,id) {
    if(!p.items.some(x=>x.type==='chat'&&x.ref===id))throw Error('This chat does not belong to the project.');
    const c=H.chats.find(c=>c.id===id);if(!c||H.agent(c.agentId)?.mode!=='native')throw Error('This chat’s AI is not available here.');
    if(get()!==p){const linked=ChatScenes.linkOf(id);await open(p.id,'chat',{chatId:id,sceneId:linked||p.workspace.sceneId});}
    Native.view(chatOf(p)?.agentId)?.saveDraft?.flush();await Native.load(id);
    conversationId=id;const linked=ChatScenes.linkOf(id);conversationScene=p.items.some(x=>x.type==='scene'&&x.ref===linked)?linked:null;
    await go('chat');await Native.refresh(c.agentId,{keepScroll:true});
  }
  function leave() {
    opening?.abort();route++;
    return serial(async()=>{const p=get();if(!p){document.querySelector('.pw-loading')?.close();if(Lazy.loaded('lab'))ThreeLab.workspace?.releaseKept?.();return;}const ui=loading(p,true);loadState={phase:'closing',project:p.id};try{await closeCurrent(ui);ui.close();}catch(err){loadState={phase:'error',project:p.id,error:calmError(err)};ui.error(err,()=>home());throw err;}});
  }
  async function home() { await leave();await Lazy.load('projects');ProjectsHome.show(null);activate('tool:home'); }
  async function create(options) {
    const name=String(options.name || '').trim(); if(!name)throw Error('Give your project a name.');
    await leave();
    await P.ready(); const p=options.resumeId && P.get(options.resumeId) || P.create({name,notes:options.brief||''});
    await save(p,C.workspace({persona:options.persona,plugins:options.plugins,brief:options.brief||''}));
    try {
      await ensure(p,options);
      for(const path of options.files||[]) P.add(p,'file',path,base(path),{links:false});
      if(options.files?.length){const b=await Board.load(p.workspace.boardId);await Board.addFiles(options.files.filter(f=>/\.(png|jpe?g|webp|gif|mp4|webm)$/i.test(f)),null,b);}
      const song=options.files?.find(f=>/\.(wav|mp3|flac|ogg|m4a|aiff?)$/i.test(f));
      if(song)ThreeLab.scenes.setExtras(p.workspace.sceneId,{media:{path:song}});
      await P.flush(); await open(p.id);
      if(options.describe && options.brief) describe(p).catch(err=>toast(`Project saved. Description: ${calmError(err)}`,{type:'error'}));
      return p;
    } catch(err) { err.projectId=p.id; toast(`“${p.name}” is saved. Reopen it to resume setup.`,{timeout:8000}); throw err; }
  }
  async function wizard(defaults={}) {
    await P.ready();
    const d=el('dialog',{class:'ui-modal pw-wizard'}), form=el('form'), title=el('input',{value:defaults.name||'',placeholder:'Name this little world',required:true,maxLength:48}), brief=el('textarea',{rows:3,placeholder:'What do you want to make?',maxLength:2000}), persona=el('select'), agents=el('select'), scene=el('select',{},el('option',{value:'',text:'A fresh animated scene'}));
    Object.entries(C.PERSONAS).forEach(([id,[label]])=>persona.append(el('option',{value:id,text:label})));
    const ai=H.agents().filter(a=>a.mode==='native'); ai.sort((a,b)=>(b.engine==='codex')-(a.engine==='codex')); ai.forEach(a=>agents.append(el('option',{value:a.id,text:a.name})));
    const sketches=await P.Src.sketches(); sketches.slice(0,150).forEach(s=>scene.append(el('option',{value:s.id,text:s.name})));
    const board=el('select',{},el('option',{value:'',text:'An empty moodboard'}));
    const boards=await P.Src.boards();(Array.isArray(boards)?boards:[]).slice(0,150).forEach(b=>board.append(el('option',{value:b.id,text:b.name+' (copy)'})));
    let files=[]; const fileList=el('p',{class:'pw-files',text:'Animation, song, artwork, references…'}), plugins=el('div',{class:'pw-plugins'});
    for(const name of ['Serum 2','Vital'])plugins.append(el('label',{class:'pw-plugin'},el('input',{type:'checkbox',checked:true,value:name}),svg('music'),el('span',{text:name})));
    const label=(name,input)=>el('label',{class:'pw-field'},el('span',{text:name}),input), status=el('p',{class:'hint',attrs:{role:'status'}}), generate=el('input',{type:'checkbox',checked:false});
    form.append(el('div',{class:'pw-eyebrow',text:'NEW / PROJECT'}),el('h2',{text:'Give your idea a home.'}),label('Project name',title),label('The idea',brief),el('div',{class:'pw-form-grid'},label('AI',agents),label('Personality',persona)),label('Starting scene',scene),plugins,action('＋ Starting files / moodboard',async()=>{const picked=await hub.openDialog({title:'Starting material',properties:['openFile','multiSelections']});if(picked?.length){files=[...new Set([...files,...picked])];fileList.textContent=files.map(base).join(' · ');}}),fileList,el('label',{class:'check'},generate,' Write the project description with AI when I create it'),status,el('div',{class:'dialog-actions'},action('Cancel',()=>d.close()),el('button',{type:'submit',class:'primary',text:'Create project ↗',disabled:!ai.length})));
    if(!ai.length)status.textContent='Add a native AI in Settings first.';
    scene.parentElement.after(label('Starting moodboard',board));
    let busy=false,retryId=null; d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;status.textContent='Creating your chat, scene and moodboard…';form.querySelectorAll('button').forEach(b=>b.disabled=true);try{await create({resumeId:retryId,name:title.value,brief:brief.value,persona:persona.value,agentId:agents.value,sceneId:scene.value,boardId:board.value,plugins:[...plugins.querySelectorAll('input:checked')].map(i=>i.value),files,describe:generate.checked});d.close();}catch(err){retryId=err.projectId||retryId;status.textContent=calmError(err);}finally{busy=false;form.querySelectorAll('button').forEach(b=>b.disabled=false);}};
    d.append(form);d.onclose=()=>d.remove();document.body.append(d);d.showModal();title.focus();return d;
  }
  async function ask(text,persona) {
    const a=H.agents().find(a=>a.mode==='native'&&a.engine==='codex') || H.claudeAgent();if(!a)throw Error('Add a native AI first.');
    const r=await hub.askOnce({agentId:a.id,text,options:{lean:true,helper:true,persona}});if(!r?.ok)throw Error(r?.error||'AI did not reply.');
    if(r.usage)document.dispatchEvent(new CustomEvent('hearth:usage',{detail:{agentId:a.id,usage:r.usage,source:'project-workspace'}}));return String(r.text||'').trim();
  }
  async function describe(p) {
    if(describing.has(p.id))return;describing.add(p.id);
    try{const text=await ask(`Write a specific, vivid project description in 1–2 sentences, at most 50 words. Only use these supplied facts; do not claim to have viewed files.\n${JSON.stringify({name:p.name,idea:p.notes,items:p.items.slice(0,24).map(x=>({kind:x.type,name:x.name}))})}`,'You write concise creative project descriptions. Return plain text only.');if(!text)throw Error('The description was empty.');await save(p,{description:text.slice(0,500),descriptionAt:Date.now()});}finally{describing.delete(p.id);}
  }
  async function frontpage() {
    const words=await Modal.prompt('An animated Projects frontpage',{label:'Describe its mood and motion. AI designs a lightweight Three.js scene.',placeholder:'A dark forge computer with warm orbiting fragments'});if(!words?.trim())return;
    toast('Designing the Projects frontpage…');
    const text=await ask(`Design a Three.js gallery scene for: ${words.slice(0,1200)}. Return JSON only: {"shape":"orbit|crystal|wave","color":"#rrggbb","accent":"#rrggbb","count":6..32,"speed":0.03..0.6,"title":"short title"}. Dark Forgeheart style, no text other than title.`,'Return a compact scene configuration, never code.');
    const spec=C.frontpage(JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')));
    const r=await hub.kvSet('projects-frontpage',spec);if(r?.error)throw Error(r.error);store.set('projectFrontpage.enabled',true);ProjectsHome.paint();
  }
  async function importScenes({quiet=false}={}) {
    await P.ready();const [scenes,links]=await Promise.all([P.Src.sketches(),hub.kvGet('chat-scenes',{})]);
    const plan=C.sceneProjects(H.chats,scenes,links,P.all()),created=[];
    for(const group of plan){const p=group.projectId?P.get(group.projectId):P.create({name:group.name});
      P.add(p,'scene',group.sceneId,group.name,{links:false});
      for(const chat of group.chats)P.add(p,'chat',chat.id,chat.title,{links:false});
      if(!p.workspace?.sceneId)P.setWorkspace(p,C.workspace({sceneId:group.sceneId,chatId:group.chats[0].id,plugins:[],importedAt:Date.now()}));
      created.push({id:p.id,name:p.name,chats:group.chats.map(c=>c.id),scene:group.sceneId});
    }
    await P.flush();if(!quiet)toast(created.length?`${created.length} scene projects ready. Your original chats and scenes are kept.`:'Your linked Three.js chats already have projects.');return created;
  }
  async function designBanner(p,brief) {
    const text=await ask(`Design a complete animated Three.js identity, including distinctive lettering, emblem and supporting shapes. Project facts: ${JSON.stringify({name:p.name,description:p.workspace?.description,brief:p.notes})}. Art direction: ${brief.slice(0,1400)}. Return JSON only: {"symbol":"brushes|chunks|ship|orbit|crystal|wave|none","title":"project name","tagline":"optional short line","layout":"split|badge|wordmark","symbolScale":0.25..1.8,"lettering":{"font":"heavy|arcade|rounded|editorial|mono","style":"solid|outline|chrome|ink|neon","color":"#rrggbb","outline":"#rrggbb","tracking":-0.04..0.12,"tilt":-0.18..0.18,"depth":0..20},"color":"#rrggbb","accent":"#rrggbb","background":"#rrggbb","speed":0.03..0.6,"count":6..32,"elements":[{"name":"meaningful editable name","shape":"box|sphere|ring|crystal|star|bolt","position":[x,y,z],"scale":[x,y,z],"rotation":[x,y,z],"color":"#rrggbb","motion":"still|float|spin|pulse"}]}. Use 8–18 purposeful supporting elements: frame, rays, ink droplets, orbit rings, geometric backing; build a cohesive composition rather than random confetti. Up to 24 elements, position -5..5, scale .05..2, rotation in radians. Split layout: symbol x=2.7, title x=-1.7. Badge: symbol above a centred wordmark. Wordmark: title dominates the centre. Text stays in front. Keep lettering legible. Render area x=-5..5 y=-2.5..2.5. Dark Forgeheart computer, vivid accents; make the lettering part of the logo’s personality.`,'You are a motion identity designer. Return a bounded, editable Three.js composition as JSON, never executable code.');
    return C.banner(JSON.parse(text.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'')),p.name);
  }
  function toolbar(p) {
    const w=C.workspace(p.workspace), node=el('div',{class:'pw-project-tools'});
    for(const [tab,title,kind] of [['chat','Chat','chat'],['scene','Scene','scene'],['sound','Sound','music'],['board','Creative board','brushes'],['moodboard','Moodboard','board']]){const b=action(title,()=>go(tab),'pw-tool');b.prepend(svg(kind));node.append(b);}
    return el('section',{class:'pw-project-intro'},el('div',{class:'pw-eyebrow',text:`PROJECT / ${C.PERSONAS[w.persona][0]}`}),el('p',{class:'pw-description',text:w.description || p.notes || 'A space for your next finished piece.'}),node,action('✦ Three.js banner / logo',()=>ProjectFrontpage.edit(p)),action(w.description?'✦ Refresh description':'✦ Write description with AI',()=>describe(p)),action('Project setup',()=>settings(p)));
  }
  async function settings(p) {
    const w=C.workspace(p.workspace),v=await Modal.form('Project setup',[{name:'persona',label:'AI personality',type:'select',value:w.persona,options:Object.entries(C.PERSONAS).map(([value,[label]])=>({value,label}))},{name:'serum',label:'Serum 2',type:'checkbox',value:w.plugins.includes('Serum 2')},{name:'vital',label:'Vital',type:'checkbox',value:w.plugins.includes('Vital')}],{ok:'Save'});if(!v)return;
    await save(p,{persona:v.persona,plugins:[...(v.serum?['Serum 2']:[]),...(v.vital?['Vital']:[])]});const c=chatOf(p);if(c){const chat=await Native.load(c.id);chat.style=C.PERSONAS[v.persona][1];Native.save(chat);if(H.activeChat[c.agentId]===c.id)Native.setStyle(c.agentId,chat.style);}
    if(Lazy.loaded('creative') && current()===p)await WorkbenchUI.setProject(p.id,{title:p.name,plugins:p.workspace.plugins});
  }
  Tools.define({id:'projectchat',offRail:true,name:'Project chat',icon:'◇',mount:body=>body.closest('.surface')?.classList.add('pw-chat-surface')});
  document.addEventListener('hearth:activate',e=>{const sid=e.detail.surfaceId;if(!get())return;if(!surfaces.has(String(sid).replace('tool:',''))){leave().catch(err=>toast(calmError(err),{type:'error'}));return;}surface=sid.slice(5);});
  Native.hooks.options.push((_a,chat,_text,_message,options)=>{if(P.projectOfChat(chat.id)?.workspace && !options.lean)options.asDirector='three';});
  Native.hooks.compose.push((_a,chat,text)=>{const p=P.projectOfChat(chat.id);if(!p?.workspace)return text;return `[Hearth project: ${JSON.stringify({name:p.name,scene:p.id===active?sceneOf(p):ChatScenes.linkOf(chat.id)||p.workspace.sceneId,moodboard:p.workspace.boardId,plugins:p.workspace.plugins})}. Work on this project's linked scene/board. Sound controls require its Sound desk open.]\n${text}`;});
  return { current,currentChat:()=>chatOf(get()) || null,currentScene:()=>sceneOf(get()) || null,switcher,agentFor,surfaceFor,open,go,openScene,conversation,home,leave,create,wizard,ensure,describe,frontpage,importScenes,designBanner,toolbar,settings,svg,state:()=>structuredClone(loadState) };
})();
