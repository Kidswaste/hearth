// Portable project preferences. No filesystem paths or generated executable code.
(function(root, make) { if (typeof module === 'object') module.exports = make(); else root.ProjectWorkspaceCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const PERSONAS = {
    partner: ['Creative partner', 'Be a candid, concise creative partner. Help me finish small, strong pieces. Offer one useful next step.'],
    director: ['Art director', 'Be a discerning art director: focus on composition, motion, story and a distinctive visual identity. Be concrete and concise.'],
    producer: ['Music producer', 'Be a music producer: focus on sound, groove, arrangement and finishing a playable demo. Offer specific, practical feedback.'],
    builder: ['Game builder', 'Be a game designer and engineer: make a small playable loop, clear feedback and reliable code. Help me finish before expanding.'],
    coach: ['Finish-line coach', 'Be a supportive but frank creative coach. Break work into small achievable steps, notice blockers and help me finish. Avoid motivational filler.'],
  };
  const ICONS = { projects:'M3 5h7l2 3h9v13H3ZM3 5V3h7l2 2', ship:'m12 2 5 10 5 6-8-2-2 6-2-6-8 2 5-6 5-10ZM10 10h4M7 19l-2 3M17 19l2 3', brushes:'m4 2 16 15-3 3L2 4Zm16 0L2 17l3 3L22 4ZM3 18l-1 4 4-1M18 18l4 4', spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z', music:'M9 18V5l11-2v13M9 8l11-2M9 18c0 4-6 4-6 1s6-4 6-1M20 16c0 4-6 4-6 1s6-4 6-1', scene:'m4 7 8-4 8 4v10l-8 4-8-4V7Zm0 0 8 4 8-4M12 11v10', board:'M3 3h7v10H3ZM14 3h7v6h-7ZM14 13h7v8h-7ZM3 17h7v4H3Z', chat:'M4 4h16v12H9l-5 4V4Zm4 5h8M8 12h5', plus:'M12 4v16M4 12h16', life:'M12 3 4 7v14l8-4 8 4V7l-8-4Zm0 0v14M8 10l2 2 5-5' };
  const plugins = value => [...new Set((Array.isArray(value) ? value : ['Serum 2','Vital']).filter(v => ['Serum 2','Vital'].includes(v)))];
  function workspace(value = {}) { return { ...value, v: 1, persona: PERSONAS[value.persona] ? value.persona : 'partner', plugins: plugins(value.plugins), description: String(value.description || '').slice(0, 500) }; }
  const key = id => { if (!/^[\w-]{1,100}$/.test(id)) throw Error('Invalid project id'); return 'workbench-' + id; };
  function frontpage(value = {}) {
    const num = (v, d, lo, hi) => Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d;
    const color = (v, d) => /^#[\da-f]{6}$/i.test(v || '') ? v : d;
    return { shape: ['orbit','crystal','wave'].includes(value.shape) ? value.shape : 'orbit', color: color(value.color, '#ff9866'), accent: color(value.accent, '#db78ff'), speed: num(value.speed,.2,.03,.6), count: Math.round(num(value.count,18,6,32)), title: String(value.title || 'Ideas in orbit').slice(0,60) };
  }
  function banner(value={},name='Project') {
    const base=frontpage(value),num=(v,d,lo,hi)=>Number.isFinite(+v)?Math.max(lo,Math.min(hi,+v)):d;
    const color=(v,d)=>/^#[\da-f]{6}$/i.test(v||'')?v:d;
    const vector=(v,d,lo,hi)=>[0,1,2].map(i=>num(v?.[i],d[i],lo,hi));
    return {...base,v:1,kind:'banner',title:String(value.title||name).slice(0,36),tagline:String(value.tagline||'').slice(0,65),symbol:['brushes','chunks','ship','orbit','crystal','wave'].includes(value.symbol)?value.symbol:'crystal',background:color(value.background,'#141318'),elements:(Array.isArray(value.elements)?value.elements:[]).slice(0,24).map(e=>({shape:['box','sphere','ring','crystal'].includes(e?.shape)?e.shape:'crystal',color:color(e?.color,base.accent),position:vector(e?.position,[0,0,0],-5,5),scale:vector(e?.scale,[.3,.3,.3],.05,2),rotation:vector(e?.rotation,[0,0,0],-6.3,6.3)}))};
  }
  // Import links, never chat/scene contents. A repeat run is a no-op; stale links
  // and chats in the trash stay untouched. Shared scenes share a project.
  function sceneProjects(chats,scenes,links,projects) {
    const known=new Set(projects.flatMap(p=>p.items||[]).filter(x=>x.type==='chat').map(x=>x.ref)),sk=new Map(scenes.map(s=>[s.id,s])),groups=new Map();
    for(const c of chats){const id=links?.links?.[c.id]?.sketch,s=sk.get(id);if(known.has(c.id)||c.id.includes('-project-')||!s)continue;
      let g=groups.get(id);if(!g){g={sceneId:id,name:s.name&&s.name!=='New chat'?s.name:c.title||'Creative project',chats:[],projectId:projects.find(p=>p.workspace?.sceneId===id)?.id||null};groups.set(id,g);}g.chats.push({id:c.id,title:c.title,agentId:c.agentId});
    }return [...groups.values()];
  }
  return { PERSONAS, ICONS, plugins, workspace, key, frontpage, banner, sceneProjects };
});
