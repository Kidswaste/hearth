window.ProjectFrontpage = (() => {
  let dispose=()=>{};
  const stop=()=>{dispose();dispose=()=>{};};
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
  return {hero,stop};
})();
