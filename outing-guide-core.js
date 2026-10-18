/* Guided outings: local plans, honest route instructions and durable reminder keys. */
(function(root, make){if(typeof module==='object'&&module.exports)module.exports=make();else root.OutingGuideCore=make();})(typeof self!=='undefined'?self:this,()=>{
  const H=3600000, text=(x,n=240)=>String(x??'').replace(/[\x00-\x1f]/g,' ').trim().slice(0,n);
  const time=x=>typeof x==='number'&&Number.isFinite(x)?x:Date.parse(x)||0;
  const coords=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
  const coordinate=x=>x==null||x===''?null:Number.isFinite(Number(x))?Number(x):null;
  function plan(raw={}){
    const e=raw.event||raw,v=typeof e.venue==='object'?e.venue:{name:e.venue},mode=['walk','transit','bike','drive'].includes(raw.mode)?raw.mode:'walk';
    return {id:text(raw.id||e.key||e.id||'outing-'+Date.now(),100),questId:text(raw.questId||e.questId,100),homeAddress:text(raw.homeAddress,500),title:text(raw.title||e.title||'My outing'),venue:text(v?.name||raw.venue),address:text(raw.address||v?.address,500),lat:coordinate(raw.lat??v?.lat),lon:coordinate(raw.lon??v?.lon),start:time(raw.start??e.start),dateOnly:!!e.dateOnly,mode,
      readyAt:time(raw.readyAt),leaveAt:time(raw.leaveAt),returnAt:time(raw.returnAt),reminders:raw.reminders===true,progress:Math.max(0,Math.min(5,Number(raw.progress)||0)),route:raw.route||null,updatedAt:time(raw.updatedAt)||Date.now()};
  }
  function validate(s){if(!s||s.v!==1||!Array.isArray(s.plans))throw Error('The outing guide store is unreadable; it has been kept.');return {v:1,home:text(s.home,500),plans:s.plans.slice(0,100).map(plan),fired:s.fired&&typeof s.fired==='object'?s.fired:{},failures:s.failures&&typeof s.failures==='object'?s.failures:{}};}
  const initial=()=>({v:1,home:'',plans:[],fired:{},failures:{}});
  function checkSchedule(p){if(!p.readyAt||!p.leaveAt)throw Error('Choose get-ready and leave times.');if(p.readyAt>=p.leaveAt)throw Error('Get ready must be before leaving.');if(p.returnAt&&p.returnAt<=p.leaveAt)throw Error('Return must be after leaving.');if(p.start&&!p.dateOnly&&p.leaveAt>p.start)throw Error('Leave before the event starts.');}
  function reminders(s,now=Date.now()){
    const list=[];for(const p of s.plans){if(!p.reminders||p.progress>=5)continue;
      for(const kind of ['ready','leave']){const scheduledAt=kind==='ready'?p.readyAt:p.leaveAt,key=p.id+':'+kind+':'+scheduledAt,failure=s.failures?.[key],at=Math.max(scheduledAt,Number(failure?.retryAt)||0);
        if(!scheduledAt||s.fired[key]||failure?.attempts>=3||now-scheduledAt>6*H||kind==='ready'&&p.progress>=1||kind==='leave'&&p.progress>=2)continue;
        // On resume after departure, one useful reminder replaces two simultaneous stale alerts.
        if(kind==='ready'&&now>=p.leaveAt)continue;
        list.push({key,id:p.id,at,kind,title:kind==='ready'?'Time to get ready':'Time to leave',body:p.title+(kind==='ready'?' · ticket, headphones, keys.':' · your route is ready.'),overdue:now>scheduledAt+60000});
      }
    }return list.sort((a,b)=>a.at-b.at);
  }
  function directions(p,home,back=false){const target=p.address||[p.lat,p.lon].join(','),q=new URLSearchParams({api:'1',origin:back?target:home,destination:back?home:target,travelmode:{walk:'walking',transit:'transit',bike:'bicycling',drive:'driving'}[p.mode]||'walking'});return 'https://www.google.com/maps/dir/?'+q;}
  function routeUrl(a,b,mode='walk'){if(!coords(a)||!coords(b))throw Error('Choose a precise start and destination.');const q=new URLSearchParams({resource:'bdtopo-osrm',start:a.lon+','+a.lat,end:b.lon+','+b.lat,profile:mode==='drive'?'car':'pedestrian',optimization:'fastest',geometryFormat:'geojson',getSteps:'true',distanceUnit:'meter',timeUnit:'second'});return 'https://data.geopf.fr/navigation/itineraire?'+q;}
  function parseRoute(r){
    if(!Number.isFinite(r?.duration)||!Number.isFinite(r?.distance)||!Array.isArray(r?.geometry?.coordinates))throw Error('The routing service did not return a usable route.');
    const steps=(r.portions||[]).flatMap(p=>p.steps||[]).slice(0,400).map(s=>{const i=s.instruction||{},n=s.attributes?.name||{},street=text(n.nom_1_gauche||n.nom_1_droite||n.cpx_toponyme||'the path');const action=i.type==='depart'?'Start along':i.type==='arrive'?'Arrive at your destination':i.modifier==='left'?'Turn left onto':i.modifier==='right'?'Turn right onto':i.modifier==='sharp left'?'Turn sharply left onto':i.modifier==='sharp right'?'Turn sharply right onto':i.modifier==='slight left'?'Bear left onto':i.modifier==='slight right'?'Bear right onto':i.modifier==='uturn'?'Turn around on':'Continue along';return {text:i.type==='arrive'?action:action+' '+street,distance:Math.max(0,Number(s.distance)||0)};});
    return {duration:r.duration,distance:r.distance,coordinates:r.geometry.coordinates.filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])).slice(0,20000),steps,source:'IGN Géoplateforme · BD TOPO®',version:text(r.resourceVersion),checkedAt:Date.now()};
  }
  function stages(p){return [{title:'Get ready',body:'Ticket, charged phone, headphones and keys. Leave yourself a little room.',at:p.readyAt},{title:'Leave home',body:'Open your outbound directions and take the first step.',at:p.leaveAt},{title:'Arrive',body:'You made it. Check your ticket and enjoy being here.'},{title:'Enjoy the outing',body:'Keep one moment: a photo, a sound, or a note you want to remember.'},{title:'Head home',body:'Use your return route. Check the last train if travelling by transit.',at:p.returnAt},{title:'Home again',body:'Journey complete. Keep a tiny memory of the night.'}];}
  return {text,time,coords,plan,validate,initial,checkSchedule,reminders,directions,routeUrl,parseRoute,stages};
});
