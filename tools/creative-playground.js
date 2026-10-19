// Focused creative stations; previous notebook fields remain intact on disk.
const CreativePlayground = (() => {
  const C = CreativeCore, KEY = 'creative-playground';
  let host, stage, nav, feedback, state = {v:1,seed:'hearth-01'}, feature = 'studio', ready = false, writable = false, saving = Promise.resolve(), context, source;
  const notice = text => { if (feedback) feedback.textContent = text; };
  const para = text => el('p', {class:'cp-hint',text});
  function button(text, fn, attrs = {}) { return el('button', {type:'button',text,...attrs,on:{click:async e => {const b=e.currentTarget;b.disabled=true;try{await fn();}catch(err){notice(err.message);}finally{b.disabled=false;}}}}); }
  function persist() { if(!writable)return Promise.resolve(); const snapshot=JSON.parse(JSON.stringify(state)); saving=saving.catch(()=>{}).then(async()=>{const r=await hub.kvSet(KEY,snapshot);if(r?.error)throw Error(r.error);}).catch(err=>notice(`Settings could not save: ${err.message}`));return saving; }
  function stopAudio(){try{source?.stop();}catch{}source=null;context?.suspend();}
  let suspended = false, mountedScope=null, mounting=null, boardFeature='studio';
  function pause(){suspended=true;mountedScope=null;stopAudio();WorkbenchUI.pause();}
  function suspend(){if(suspended)return;suspended=true;stopAudio();WorkbenchUI.suspend();}
  function resume(){if(!suspended)return;return openFeature(feature,{reuse:true});}
  async function play(samples,sr=44100){stopAudio();context ||= new AudioContext();await context.resume();const b=context.createBuffer(1,samples.length,sr);b.copyToChannel(samples,0);source=context.createBufferSource();source.buffer=b;const volume=context.createGain();volume.gain.value=.3;source.connect(volume).connect(context.destination);source.start();}
  async function saveFile(name,data,extension){const r=await hub.saveFile({defaultPath:name,content:data,filters:[{name:extension.toUpperCase(),extensions:[extension]}]});if(r?.error)throw Error(r.error);notice(r?`Exported ${name}`:'Export cancelled.');return r;}
  async function tileCanvas(svg){const im=new Image();im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await im.decode();const c=document.createElement('canvas');c.width=c.height=512;c.getContext('2d').drawImage(im,0,0);return c;}
  function tiles(out){
    const art=C.svg(state.seed,'pattern'),preview=el('img',{class:'cp-art',attrs:{alt:'Seamless tile preview',src:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(art)}});
    const seed=el('input',{value:state.seed,attrs:{maxlength:80,'aria-label':'Tile seed'}});seed.onchange=()=>{state.seed=seed.value||'hearth';persist();openFeature('pattern');};
    const settings=el('div',{class:'cp-tile-controls'},el('label',{class:'cp-field'},el('span',{text:'Variation seed'}),seed),
      button('New variation',()=>{state.seed='tile-'+Math.random().toString(36).slice(2,8);persist();openFeature('pattern');}),
      para('The 512px export repeats cleanly on every edge. Keep it on your worktable to use it in a shot.'),
      button('Export SVG',()=>saveFile('hearth-seamless-tile.svg',art,'svg')),
      button('Export PNG',async()=>{const c=await tileCanvas(art),blob=await new Promise(r=>c.toBlob(r,'image/png'));if(!blob)throw Error('PNG export failed.');await saveFile('hearth-seamless-tile.png',new Uint8Array(await blob.arrayBuffer()),'png');}),
      button('Keep on worktable',async()=>{const c=await tileCanvas(art);await WorkbenchUI.addAsset({name:`Seamless tile · ${state.seed}`,image:c.toDataURL('image/png')});notice('Tile kept on the worktable. Ready for your storyboard.');}),
      button('Open storyboard ↗',()=>openFeature('story')));
    out.append(el('div',{class:'cp-tile-workbench'},preview,settings));
  }
  function openFeature(id,{reuse=false}={}){
    if(!ready)return;const f=C.FEATURES.find(f=>f.id===id)||C.FEATURES[0];
    if(reuse && feature===f.id && mountedScope===WorkbenchUI.scope()){
      if(mounting)return mounting;
      if(!suspended || WorkbenchUI.resume()){suspended=false;return Promise.resolve();}
    }
    pause();suspended=false;feature=f.id;stage.replaceChildren();
    mountedScope=WorkbenchUI.scope();if(feature!=='vst')boardFeature=feature;
    if(feature!=='vst')stage.append(el('nav',{class:'workspace-creative-tabs',attrs:{'aria-label':'Creative board'}},...[["studio","Shelf"],["texture","Materials"],["pattern","Seamless tiles"],["draw","Drawing"],["story","Storyboard"]].map(([id,label])=>button(label,()=>openFeature(id),{attrs:{'aria-pressed':String(feature===id)}}))));
    stage.append(el('h2',{text:feature==='studio'?'Creative board':f.name}),para(f.description));
    nav.querySelectorAll('[data-feature-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.featureId===feature)));

    document.dispatchEvent(new Event('hearth:creative-feature'));
    const target=el('div');stage.append(target);const selected=feature; const task=WorkbenchUI.mount(target,selected,{notice,saveFile,openFeature,play,stopAudio}).then(()=>{if(target.isConnected && selected==='pattern')tiles(target.querySelector('.wb-content'));if(suspended)WorkbenchUI.suspend();}).catch(err=>{mountedScope=null;notice(err.message);}).finally(()=>{if(mounting===task)mounting=null;});mounting=task;return task;
  }
  async function mount(body){
    host=el('div',{class:'cp-workspace cp-modern'});body.append(host);feedback=el('p',{class:'cp-feedback',attrs:{role:'status','aria-live':'polite'}});
    try{const saved=await hub.kvGet(KEY);if(saved?.error)throw Error(saved.error);if(saved&&(saved.v!==1||typeof saved.seed!=='string'))throw Error('Unknown notebook format');if(saved)state=saved;writable=true;}catch(err){notice(`Tile settings unavailable; saved data preserved. ${err.message}`);}
    nav=el('nav',{class:'cp-nav',attrs:{'aria-label':'Creative workbenches'}},el('h3',{text:'Workbenches'}));
    for(const f of C.FEATURES)nav.append(button(f.name,()=>openFeature(f.id),{dataset:{featureId:f.id},attrs:{'aria-pressed':'false',title:f.description}}));
    stage=el('main',{class:'cp-stage'});
    host.append(el('header',{class:'cp-heading'},el('h1',{text:'Creative Playground'}),button('✦ Quest journal',async()=>{await Lazy.load('questjournal');activate('tool:quests');})),feedback,el('div',{class:'cp-layout'},nav,stage));
    ready=true;openFeature(feature);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else if(suspended && H.surfaceIdFor(H.activeId)==='tool:creative')resume();});
    document.addEventListener('hearth:activate',()=>{if(H.surfaceIdFor(H.activeId)!=='tool:creative')suspend();});
  }
  Tools.define({id:'creative',offRail:true,name:'Creative board',icon:'✺',color:'#ed77a8',description:'Sounds, sketches, materials and storyboards',mount:body=>{mount(body).catch(e=>{body.textContent=`Creative desk could not open: ${calmError(e)}`;});},onShow:()=>{if(ready && suspended)resume();}});
  Commands.register({name:'playground',area:'Create',desc:'Open your sounds, sketches, materials and storyboard',run:()=>activate('tool:creative')});
  return {openFeature,pause,lastBoard:()=>boardFeature,ready:()=>ready,flush:()=>saving,snapshot:()=>({feature,state:JSON.parse(JSON.stringify(state)),playing:Boolean(source)})};
})();
