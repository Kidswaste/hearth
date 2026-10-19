window.ProjectFrontpage = (() => {
  let dispose=()=>{};
  let identityDispose=()=>{},identityModal=false;const posters=new Map();
  const stop=()=>{dispose();dispose=()=>{};if(!identityModal){identityDispose();identityDispose=()=>{};}};
  function hero(projects) {
    const box=el('section',{class:'pw-gallery-hero'},el('div',{class:'pw-hero-copy'},el('span',{class:'pw-eyebrow',text:'HEARTH / YOUR CREATIVE WORLDS'}),el('h1',{text:'What are we making?'}),el('p',{text:'One project. Everything you need to finish it.'}),el('span',{class:'pw-hero-count',text:`${projects.length} project${projects.length===1?'':'s'} in orbit`})),el('div',{class:'pw-orbit',attrs:{'aria-hidden':'true'}},ProjectWorkspace.svg('scene')));
    if(!store.get('projectFrontpage.enabled',false))return box;
    let gone=false,worker,ro,io,inView=false;const motion=matchMedia('(prefers-reduced-motion: reduce)');
    const visible=()=>worker?.postMessage({running:inView&&!document.hidden&&H.surfaceIdFor(H.activeId)==='tool:home'&&box.isConnected,reduced:motion.matches});
    dispose=()=>{gone=true;worker?.terminate();ro?.disconnect();io?.disconnect();document.removeEventListener('visibilitychange',visible);motion.removeEventListener('change',visible);};
    hub.kvGet('projects-frontpage',null).then(raw=>{
      if(gone||!raw||!HTMLCanvasElement.prototype.transferControlToOffscreen)return;
      const c=el('canvas',{class:'pw-motion',attrs:{'aria-hidden':'true'}});box.append(c);
      try{
        worker=new Worker('project-frontpage-worker.js',{type:'module'});const canvas=c.transferControlToOffscreen();
        worker.postMessage({canvas,spec:ProjectWorkspaceCore.frontpage(raw),reduced:motion.matches,running:false},[canvas]);
        worker.onmessage=({data})=>{if(data.error){c.remove();worker.terminate();}else if(data.ready){box.classList.add('has-motion');c.dataset.ready='true';}};
        worker.onerror=()=>{c.remove();worker.terminate();};
        ro=new ResizeObserver(es=>{const r=es[0].contentRect;if(r.width&&r.height)worker.postMessage({size:[Math.min(1600,Math.round(r.width)),Math.min(360,Math.round(r.height))]});});ro.observe(box);
        io=new IntersectionObserver(es=>{inView=es[0].isIntersecting;visible();});io.observe(box);
        document.addEventListener('visibilitychange',visible);motion.addEventListener('change',visible);
      }catch{c.remove();worker?.terminate();}
    }).catch(()=>{});return box;
  }
  const bannerKey=p=>'project-banner-'+ProjectWorkspaceCore.key(p.id).slice('workbench-'.length);
  function animate(box,raw,{modal=false}={}) {
    identityDispose();identityModal=modal;
    const c=el('canvas',{class:'pw-banner-canvas',attrs:{'aria-hidden':'true'}});box.append(c);
    const requests=new Map(),motion=matchMedia('(prefers-reduced-motion: reduce)');let worker,ro,gone=false;
    const clear=()=>{if(gone)return;gone=true;worker?.terminate();ro?.disconnect();c.remove();document.removeEventListener('visibilitychange',visible);motion.removeEventListener('change',visible);for(const r of requests.values()){clearTimeout(r.timer);r.reject(Error('Banner preview closed.'));}requests.clear();};
    const visible=()=>worker?.postMessage({running:!document.hidden&&box.isConnected,reduced:motion.matches});
    identityDispose=clear;
    try{
      worker=new Worker('project-frontpage-worker.js',{type:'module'});const canvas=c.transferControlToOffscreen();
      worker.postMessage({canvas,spec:ProjectWorkspaceCore.banner(raw),size:[960,360],running:!document.hidden,reduced:motion.matches},[canvas]);
      worker.onmessage=({data})=>{if(data.error){box.dataset.error=data.error;clear();}if(data.ready)c.dataset.ready='true';if(data.poster||data.pick){const id=data.poster||data.pick,r=requests.get(id);if(r){clearTimeout(r.timer);requests.delete(id);r.resolve(data.poster?new Blob([data.bytes],{type:'image/png'}):data.index);}}};
      worker.onerror=e=>{box.dataset.error=e.message;clear();};
      ro=new ResizeObserver(es=>{const r=es[0].contentRect;if(r.width&&r.height){const k=Math.min(1,960/r.width,360/r.height);worker.postMessage({size:[Math.max(1,Math.round(r.width*k)),Math.max(1,Math.round(r.height*k))]});}});ro.observe(box);
      document.addEventListener('visibilitychange',visible);motion.addEventListener('change',visible);
    }catch(err){box.dataset.error=err.message;clear();}
    const request=(kind,extra={})=>new Promise((resolve,reject)=>{if(gone)return reject(Error('This computer could not start the Three.js preview.'));const id=crypto.randomUUID(),timer=setTimeout(()=>{requests.delete(id);reject(Error('Banner preview took too long. Try again.'));},10000);requests.set(id,{resolve,reject,timer});worker.postMessage(kind==='pick'?{pick:{id,...extra}}:{poster:id});});
    return {stop:clear,update:next=>{if(!gone)worker?.postMessage({spec:ProjectWorkspaceCore.banner(next)});},poster:()=>request('poster'),pick:(x,y)=>request('pick',{x,y})};
  }
  function decorate(box,p,{live=false}={}) {
    if(!p.workspace?.banner)return;box.classList.add('pw-banner');
    const stamp=p.workspace.bannerAt;
    const show=raw=>{if(!box.isConnected||p.workspace.bannerAt!==stamp||!raw?.poster)return;box.querySelector('img')?.remove();box.querySelector('.pj-cover-mark')?.remove();box.prepend(el('img',{src:raw.poster,alt:`${p.name} project banner`,decoding:'async'}));};
    if(posters.has(p.id))queueMicrotask(()=>show(posters.get(p.id)));
    else hub.kvGet(bannerKey(p),null).then(raw=>{if(!raw)return;posters.set(p.id,raw);if(posters.size>24)posters.delete(posters.keys().next().value);show(raw);}).catch(()=>{});
    let preview;
    const start=()=>{if(!preview&&box.isConnected&&!document.querySelector('.pw-banner-editor[open]'))preview=animate(box,p.workspace.banner);};
    const end=()=>{preview?.stop();preview=null;};
    box.addEventListener('pointerenter',start);box.addEventListener('pointerleave',end);
    if(live)requestAnimationFrame(start);
  }
  async function edit(p) {
    const C=ProjectWorkspaceCore,saved=p.workspace?.banner;
    let spec=C.banner(saved||{title:p.name,symbol:/clink/i.test(p.name)?'brushes':/chunk/i.test(p.name)?'chunks':/forge/i.test(p.name)?'ship':'crystal',color:p.ident.color,accent:'#ff9b65'},p.name),preview,busy=false,revision=0,selected=-1;
    const undo=[],redo=[],remember=()=>{undo.push(structuredClone(spec));if(undo.length>30)undo.shift();redo.length=0;};
    const d=el('dialog',{class:'ui-modal pw-banner-editor'}),stage=el('div',{class:'pw-banner-preview'}),brief=el('textarea',{rows:2,placeholder:'Crossed lacquered brushes, pink chrome, a playful arcade identity…',value:p.workspace?.bannerBrief||'',maxLength:1400}),status=el('p',{class:'pw-banner-status',attrs:{role:'status','aria-live':'polite'},text:'A live Three.js identity for this project.'}),motif=el('select',{attrs:{'aria-label':'Starting symbol'}}),title=el('input',{value:spec.title,maxLength:36,attrs:{'aria-label':'Logo title'}}),accent=el('input',{type:'color',value:spec.accent,attrs:{'aria-label':'Accent color'}});
    for(const [value,label]of[['brushes','Crossed brushes'],['chunks','Chunky blocks'],['ship','Starship'],['orbit','Orbit'],['crystal','Crystal'],['wave','Sound wave'],['none','Lettering only']])motif.append(el('option',{value,text:label,selected:value===spec.symbol}));
    const draw=()=>{if(preview){preview.update(spec);return;}preview=animate(stage,spec,{modal:true});};
    const button=(text,fn,cls='ghost')=>el('button',{type:'button',class:cls,text,on:{click:async()=>{if(busy)return;busy=true;d.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=true);try{await fn();}catch(e){status.textContent=calmError(e);}finally{busy=false;d.querySelectorAll('button,input,select,textarea').forEach(b=>b.disabled=false);}}}});
    const update=()=>{if(busy)return;remember();spec=C.banner({...spec,title:title.value,symbol:motif.value,accent:accent.value},p.name);draw();};
    title.onchange=motif.onchange=accent.onchange=update;
    const inspector=el('div',{class:'pw-logo-inspector'}),elementSelect=el('select',{attrs:{'aria-label':'Select logo element'}});
    const change=fn=>{remember();fn();spec=C.banner(spec,p.name);draw();paintInspector();};
    const field=(label,input)=>el('label',{class:'pw-logo-field'},el('span',{text:label}),input);
    const choose=(label,values,value,fn)=>{const s=el('select',{attrs:{'aria-label':label}},...values.map(v=>el('option',{value:v,text:v,selected:v===value})));s.onchange=()=>change(()=>fn(s.value));return field(label,s);};
    const number=(label,value,min,max,step,fn)=>{const x=el('input',{type:'range',value,min,max,step,attrs:{'aria-label':label}});x.onchange=()=>change(()=>fn(+x.value));return field(label,x);};
    const colour=(label,value,fn)=>{const x=el('input',{type:'color',value,attrs:{'aria-label':label}});x.onchange=()=>change(()=>fn(x.value));return field(label,x);};
    const paintInspector=()=>{
      elementSelect.replaceChildren(el('option',{value:-1,text:'Lettering & composition'}),...spec.elements.map((e,i)=>el('option',{value:i,text:e.name})));elementSelect.value=selected;
      const e=spec.elements[selected];inspector.replaceChildren();
      if(!e){
        const tagline=el('input',{value:spec.tagline,maxLength:65,attrs:{'aria-label':'Tagline'},placeholder:'Optional tagline'});tagline.onchange=()=>change(()=>spec.tagline=tagline.value);
        inspector.append(choose('Layout',['split','badge','wordmark'],spec.layout,v=>spec.layout=v),choose('Lettering',['heavy','arcade','rounded','editorial','mono'],spec.lettering.font,v=>spec.lettering.font=v),choose('Finish',['solid','outline','chrome','ink','neon'],spec.lettering.style,v=>spec.lettering.style=v),colour('Text',spec.lettering.color,v=>spec.lettering.color=v),colour('Outline / depth',spec.lettering.outline,v=>spec.lettering.outline=v),number('Letter spacing',spec.lettering.tracking,-.04,.12,.005,v=>spec.lettering.tracking=v),number('Text tilt',spec.lettering.tilt,-.18,.18,.01,v=>spec.lettering.tilt=v),number('Depth',spec.lettering.depth,0,20,1,v=>spec.lettering.depth=v),number('Symbol size',spec.symbolScale,.25,1.8,.05,v=>spec.symbolScale=v),colour('Background',spec.background,v=>spec.background=v),field('Tagline',tagline));
      }else{
        const name=el('input',{value:e.name,maxLength:32,attrs:{'aria-label':'Element name'}});name.onchange=()=>{change(()=>e.name=name.value);paintInspector();};
        inspector.append(field('Name',name),choose('Shape',['box','sphere','ring','crystal','star','bolt'],e.shape,v=>e.shape=v),colour('Colour',e.color,v=>e.color=v),choose('Movement',['still','float','spin','pulse'],e.motion,v=>e.motion=v));
        for(const [key,limits]of [['position',[-5,5,.05]],['scale',[.05,2,.05]],['rotation',[-3.14,3.14,.05]]])for(let i=0;i<3;i++)inspector.append(number(`${key} ${'XYZ'[i]}`,e[key][i],...limits,v=>{spec.elements[selected][key][i]=v;}));
        inspector.append(button('Duplicate element',()=>{if(spec.elements.length>=24)throw Error('This logo already has 24 elements.');change(()=>{const copy=structuredClone(spec.elements[selected]);copy.position[0]=Math.min(5,copy.position[0]+.3);copy.name+=' copy';spec.elements.push(copy);selected=spec.elements.length-1;});paintInspector();}),button('Remove element',()=>{change(()=>spec.elements.splice(selected,1));selected=-1;paintInspector();}));
      }
    };
    elementSelect.onchange=()=>{selected=+elementSelect.value;paintInspector();};
    stage.onclick=async e=>{if(busy)return;try{const r=stage.getBoundingClientRect(),index=await preview.pick((e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);selected=index;paintInspector();}catch{}};
    const history=(from,to)=>{if(!from.length)return;to.push(structuredClone(spec));spec=from.pop();title.value=spec.title;motif.value=spec.symbol;accent.value=spec.accent;selected=-1;draw();paintInspector();};
    const controls=el('div',{class:'pw-logo-controls'},elementSelect,el('div',{class:'pw-logo-actions'},button('＋ Element',()=>{if(spec.elements.length>=24)throw Error('This logo already has 24 elements.');change(()=>{spec.elements.push({name:'New accent',shape:'star',color:spec.accent,position:[2,1,0],scale:[.3,.3,.3],rotation:[0,0,0],motion:'float'});selected=spec.elements.length-1;});paintInspector();}),button('Undo',()=>history(undo,redo)),button('Redo',()=>history(redo,undo))),inspector);
    d.append(el('div',{class:'pw-eyebrow',text:'PROJECT IDENTITY / THREE.JS'}),el('h2',{text:`Make ${p.name} recognisable.`}),el('div',{class:'pw-logo-workspace'},el('div',{},stage,el('div',{class:'pw-banner-controls'},title,motif,accent),brief,status),controls),el('div',{class:'dialog-actions'},button('Cancel',()=>d.close()),button('✦ Generate with AI',async()=>{if(!brief.value.trim())throw Error('Describe the banner you want first.');status.textContent='Designing lettering, emblem and motion…';const ticket=revision,next=await ProjectWorkspace.designBanner(p,brief.value);if(ticket!==revision||!d.isConnected)return;remember();spec=next;selected=-1;title.value=spec.title;motif.value=spec.symbol;accent.value=spec.accent;draw();paintInspector();status.textContent='Preview ready. Click an element to edit it, or choose Lettering.';}),button('Save banner',async()=>{
      const blob=await preview.poster(),poster=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not save the banner image'));r.readAsDataURL(blob);});
      const raw={spec,poster},r=await hub.kvSet(bannerKey(p),raw);if(r?.error)throw Error(r.error);
      Projects.setWorkspace(p,{banner:spec,bannerAt:Date.now(),bannerBrief:brief.value.trim()});await Projects.flush();posters.set(p.id,raw);d.close();ProjectsHome.paint();
    },'primary')));
    d.onclose=()=>{revision++;preview?.stop();d.remove();};d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});document.body.append(d);d.showModal();draw();paintInspector();return d;
  }
  return {hero,stop,decorate,edit};
})();
