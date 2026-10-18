// Personal event planning. Public feed facts stay separate from the user's plans and quest ledger.
(function(root, make) { if (typeof module === 'object') module.exports = make(); else root.OutingCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const clone = x => JSON.parse(JSON.stringify(x));
  const text = (x, n = 400) => String(x ?? '').replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, n);
  const url = x => { try { const u = new URL(x); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; } catch { return ''; } };
  const iso = x => typeof x === 'string' && /^\d{4}-\d\d-\d\dT/.test(x) && /(?:Z|[+-]\d\d:\d\d)$/.test(x) && Number.isFinite(Date.parse(x)) ? new Date(x).toISOString() : '';
  const money = x => { if (x === '' || x == null) return null; const n = typeof x==='boolean'?NaN:Number(x); if (!Number.isFinite(n) || n < 0 || n > 10000) throw Error('Use an amount between €0 and €10,000, or leave it unknown.'); return Math.round(n * 100) / 100; };
  const kinds = [
    {id:'music',name:'Sound',icon:'music',color:'#ffb14a'}, {id:'visual',name:'Visuals',icon:'visual',color:'#bd8bff'},
    {id:'game',name:'Play',icon:'game',color:'#ff6b9d'}, {id:'learn',name:'Make & learn',icon:'spark',color:'#ffd75e'}, {id:'wander',name:'Wander',icon:'compass',color:'#e7a0ff'}
  ];
  const sources = [
    ['paris','Que faire à Paris','https://www.paris.fr/quefaire','All','Official open-data feed + programme'],
    ['philharmonie','Philharmonie','https://philharmoniedeparis.fr/fr/agenda','Sound','Concerts, sound and musical practice'],
    ['philharmonie-free','Philharmonie · free','https://philharmoniedeparis.fr/fr/agenda-selection/agenda-des-evenements-gratuits','Sound','Check reservation requirements'],
    ['104','CENTQUATRE','https://www.104.fr/programme','Visuals','Performance and creative discoveries'],
    ['fgo','FGO-Barbara','https://fgo-barbara.fr/programmation','Sound','Live music and artist encounters'],
    ['hasard','Le Hasard Ludique','https://www.lehasardludique.paris/programmation','Sound','Concerts, gatherings and record discoveries'],
    ['forum','Forum des images','https://www.forumdesimages.fr/agenda','Visuals','Cinema and image culture'],
    ['tokyo','Palais de Tokyo','https://palaisdetokyo.com/agenda-palais-de-tokyo/','Visuals','Contemporary art and workshops'],
    ['musees','Paris Musées','https://parismusees.paris.fr/fr','Visuals','Exhibitions across the city'],
    ['villette','La Villette','https://www.lavillette.com/programmation-/','Explore','Performance and outdoor discoveries'],
    ['grandparis','Agenda Grand Paris','https://agenda.parisjetaime.com/','Explore','Official tourism agenda'],
    ['loisirs','Paris · play & leisure','https://www.paris.fr/quefaire/loisirs','Play','Games, leisure and workshops']
  ].map(([id,name,url,tag,note])=>({id,name,url,tag,note}));
  const prompts = [
    {id:'ear',name:'Borrow a feeling',icon:'music',path:'music',brief:'Make a 20–40 second original demo inspired by one feeling from the outing. Attach the bounce and name the detail that sparked it. Do not sample a performance without permission.'},
    {id:'light',name:'Pocket a palette',icon:'visual',path:'visual',brief:'Make a still or seamless tile from three colors you noticed. Attach your own export and a short note connecting it to the outing.'},
    {id:'forge',name:'Bring it to Forgeheart',icon:'game',path:'game',brief:'Build one tiny Forgeheart prop or interaction inspired by the place. Show a screenshot or short playable capture and explain the reference.'},
    {id:'story',name:'Three-shot memory',icon:'notebook',path:'visual',brief:'Make a three-frame storyboard: arrival, one striking detail, departure. Attach your frames with one sentence about the rhythm.'},
    {id:'note',name:'Keep one real moment',icon:'bookmark',path:'life',brief:'Keep your own concrete field note: what you did, one detail you noticed, and one thing you would repeat. A ticket or plan alone is not a visit.'}
  ];
  const initial = () => ({v:1,feed:[],fetchedAt:'',saved:[],ceiling:null});
  function category(value) {
    const s = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if (/\b(concerts?|musique|jazz|dj|sonore|electro)\b/.test(s)) return 'music';
    if (/\b(jeux?|gaming|video games?)\b/.test(s)) return 'game';
    if (/\b(ateliers?|formation|conferences?|rencontres?)\b/.test(s)) return 'learn';
    if (/\b(expo|expositions?|cinema|photo|dessin|arts?|danse)\b/.test(s)) return 'visual';
    return 'wander';
  }
  function event(raw) {
    if (!raw || typeof raw !== 'object') throw Error('Invalid event.');
    const e = {id:text(raw.id,100),title:text(raw.title,180),url:url(raw.url),venue:text(raw.venue,160),address:text(raw.address,240),kind:raw.kind,
      start:iso(raw.start),end:iso(raw.end),sessions:[],dateNote:text(raw.dateNote,600),free:raw.free === true,price:text(raw.price,300),note:text(raw.note,600),
      lat:null,lon:null,source:text(raw.source,100),updatedAt:iso(raw.updatedAt)};
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(e.id) || !e.title || !kinds.some(k=>k.id===e.kind)) throw Error('Give the event a name and category.');
    if (raw.url && !e.url) throw Error('Use a complete HTTPS source link.');
    if (e.end && (!e.start || e.end <= e.start)) e.end='';
    if (raw.lat != null && raw.lon != null && raw.lat !== '' && raw.lon !== '') {
      const lat=Number(raw.lat),lon=Number(raw.lon);
      if (Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=48.7&&lat<=49&&lon>=2.15&&lon<=2.6) {e.lat=lat;e.lon=lon;}
    }
    for (const pair of (Array.isArray(raw.sessions)?raw.sessions:[]).slice(0,1000)) {
      const start=iso(pair.start),end=iso(pair.end);
      if(start && end>start && Date.parse(end)-Date.parse(start)<=18*3600000 && !e.sessions.some(s=>s.start===start))e.sessions.push({start,end});
      if(e.sessions.length>=60)break;
    }
    e.sessions.sort((a,b)=>a.start.localeCompare(b.start));return e;
  }
  function feed(records, now=Date.now()) {
    if (!Array.isArray(records)) throw Error('The Paris agenda returned an unexpected format.');
    const out = new Map(),horizon=now+30*86400000;
    for (const r of records.slice(0,200)) {
      try {
        if(!r || !/^\d{1,30}$/.test(String(r.id??'')))continue;
        const sessions=String(r.occurrences||'').split(';').map(x=>{const [start,end]=x.split('_');return {start,end};}).filter(x=>Date.parse(x.end)>=now&&Date.parse(x.start)<=horizon);
        const e=event({id:'paris-'+r.id,title:r.title,url:r.url,venue:r.address_name,address:[r.address_street,r.address_zipcode,r.address_city].filter(Boolean).join(', '),kind:category(r.qfap_tags+' '+r.title),
          start:r.date_start,end:r.date_end,sessions,dateNote:r.date_description,free:r.price_type==='gratuit',price:r.price_detail||r.price_type,note:r.lead_text,lat:r.lat_lon?.lat,lon:r.lat_lon?.lon,source:'Ville de Paris · ODbL',updatedAt:r.updated_at});
        if(!e.url||!e.start||Date.parse(e.start)>horizon||!e.end||Date.parse(e.end)<now)continue;
        // Only Paris-map coordinates. The source also includes virtual and overseas events.
        if(e.lat===null)continue;
        out.set(e.id,e);
      } catch { /* A malformed public record must not discard the rest of the feed. */ }
    }
    const next=e=>Math.max(now,Date.parse(e.sessions[0]?.start||e.start));
    return [...out.values()].sort((a,b)=>next(a)-next(b));
  }
  function feedUrls(now=Date.now()) {
    const start=new Date(now).toISOString(),end=new Date(now+30*86400000).toISOString();
    const select='id,title,url,address_name,address_street,address_zipcode,address_city,qfap_tags,date_start,date_end,occurrences,date_description,price_type,price_detail,lead_text,lat_lon,updated_at';
    return [false,true].map(ongoing=>{
      const p=new URLSearchParams({select,limit:'100',where:`date_end >= "${start}" AND date_start ${ongoing?'<':'>='} "${start}" AND date_start <= "${end}"`,order_by:ongoing?'date_end asc':'date_start asc'});
      return 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/records?'+p;
    });
  }
  function plan(e) {return {event:event(e),status:'saved',visitStart:'',visitEnd:'',ticket:e.free?0:null,transport:null,extras:null,buddy:'',note:'',prompt:'note',checkedAt:'',questId:''};}
  function validate(s) {
    if(!s||s.v!==1||!Array.isArray(s.feed)||s.feed.length>200||!Array.isArray(s.saved)||s.saved.length>100)throw Error('The outing notebook could not be read safely.');
    const out={v:1,feed:s.feed.map(event),fetchedAt:iso(s.fetchedAt),ceiling:money(s.ceiling),saved:[]},ids=new Set();
    for(const p of s.saved){
      const e=event(p.event);if(ids.has(e.id)||!['saved','going','archived'].includes(p.status)||!prompts.some(x=>x.id===p.prompt))throw Error('Invalid saved outing.');ids.add(e.id);
      const visitStart=iso(p.visitStart),visitEnd=iso(p.visitEnd);
      if((p.visitStart&&!visitStart)||(p.visitEnd&&!visitEnd)||!!visitStart!==!!visitEnd||(visitStart&&(!(visitEnd>visitStart)||Date.parse(visitEnd)-Date.parse(visitStart)>18*3600000)))throw Error('Choose a visit end after its start, within 18 hours.');
      out.saved.push({event:e,status:p.status,visitStart,visitEnd,ticket:money(p.ticket),transport:money(p.transport),extras:money(p.extras),buddy:text(p.buddy,80),note:text(p.note,600),prompt:p.prompt,checkedAt:iso(p.checkedAt),questId:text(p.questId,100)});
    }return out;
  }
  function save(s,e){let p=s.saved.find(p=>p.event.id===e.id);if(p)return p;if(s.saved.length>=100)throw Error('Your notebook holds 100 outings. Remove an old saved outing first.');p=plan(e);s.saved.push(p);return p;}
  function cost(p){const values=[p.ticket,p.transport,p.extras];return {known:Math.round(values.reduce((n,v)=>n+(v??0),0)*100)/100,unknown:values.filter(v=>v===null).length};}
  function budget(s){const rows=s.saved.filter(p=>p.status==='going'),known=Math.round(rows.reduce((n,p)=>n+cost(p).known,0)*100)/100,unknown=rows.reduce((n,p)=>n+cost(p).unknown,0);return {known,unknown,count:rows.length,over:s.ceiling!==null&&known>s.ceiling};}
  function overlaps(s,p){if(!p.visitStart)return [];return s.saved.filter(o=>o.event.id!==p.event.id&&o.status==='going'&&o.visitStart&&o.visitStart<p.visitEnd&&o.visitEnd>p.visitStart);}
  function filter(events,{query='',kind='all',free=false,days=30}={},now=Date.now()){
    const needle=text(query).toLowerCase(),end=now+days*86400000;
    return events.filter(e=>(kind==='all'||e.kind===kind)&&(!free||e.free)&&(!needle||[e.title,e.venue,e.note].join(' ').toLowerCase().includes(needle))&&(!e.start||(Date.parse(e.end||e.start)>=now&&Date.parse(e.start)<=end)));
  }
  function invitation(p){return `Hey${p.buddy?' '+p.buddy:''}! Fancy ${p.event.title}${p.venue?' at '+p.venue:p.event.venue?' at '+p.event.venue:''}${p.visitStart?' on '+new Date(p.visitStart).toLocaleString('en-GB',{timeZone:'Europe/Paris',dateStyle:'medium',timeStyle:'short'})+' (Paris time)':''}? No pressure if not — another time is good too.${p.event.url?'\n'+p.event.url:''}`;}
  const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
  const stamp=s=>s.replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  function fold(line){let out='',part='',size=0;for(const char of line){const n=new TextEncoder().encode(char).length;if(size+n>74){out+=part+'\r\n';part=' ';size=1;}part+=char;size+=n;}return out+part;}
  function calendar(plans,now=new Date().toISOString()) {
    if(!plans.length||plans.some(p=>!p.visitStart||!p.visitEnd))throw Error('Set the start and end of each planned visit before exporting.');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Hearth//Outing Desk//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
    for(const p of plans)lines.push('BEGIN:VEVENT',`UID:${p.event.id}@hearth-outings`,`DTSTAMP:${stamp(iso(now))}`,`DTSTART:${stamp(p.visitStart)}`,`DTEND:${stamp(p.visitEnd)}`,`SUMMARY:${esc(p.event.title)}`,`LOCATION:${esc([p.event.venue,p.event.address].filter(Boolean).join(', '))}`,`DESCRIPTION:${esc('Personal plan; recheck schedule and booking.\n'+p.event.source+'\n'+p.event.url+'\n'+p.note)}`,`URL:${p.event.url}`,'STATUS:TENTATIVE','END:VEVENT');
    return [...lines,'END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
  }
  function campaign(s,p,C){
    const cid='c-outing-'+p.event.id,existing=s.campaigns.find(c=>c.id===cid);if(existing){existing.paused=false;s.active=cid;return existing;}
    if(s.campaigns.length>=100)throw Error('The journal holds 100 campaigns.');
    const prompt=prompts.find(x=>x.id===p.prompt);if(!prompt)throw Error('Choose a take-home mission.');
    const c={id:cid,title:text(p.event.title,100),subtitle:'PARIS / TAKE SOMETHING HOME',path:prompt.path,why:text(`${p.event.venue} · ${prompt.name}`,600),badge:'Outing keepsake',quests:[{id:'q-outing-'+p.event.id,title:prompt.name,done:text(`${p.event.title}: ${prompt.brief}`,1000),tiny:'Choose one detail to pay attention to. The outing and finished result can come later.',minutes:15,xp:35,tool:null,deep:'Polish one detail after saving the first version.',proofHint:'Show your own result or specific field note. Booking, saving an event or sending an invitation does not complete the quest.'}]};
    s.campaigns.push(c);s.active=cid;C.validate(s);return c;
  }
  // One pin per venue, not one overlapping pin per event. Never consumes saved-place slots.
  function mapGroups(s,filters={}){
    if(filters.guide)return [];
    const saved=new Set(s.saved.filter(p=>p.status!=='archived').map(p=>p.event.id));
    const events=[...new Map([...s.feed,...s.saved.filter(p=>p.status!=='archived').map(p=>p.event)].map(e=>[e.id,e])).values()];
    const groups=new Map();
    for(const e of filter(events,{days:30,query:filters.query||''})){
      if(e.lat===null||e.lon===null||!e.start||filters.saved&&!saved.has(e.id))continue;
      const kind=['music','visual','game'].includes(e.kind)?e.kind:'reset';
      if(filters.kind&&filters.kind!=='all'&&filters.kind!==kind)continue;
      const key=e.lat.toFixed(4)+'-'+e.lon.toFixed(4),id='od-venue-'+key;
      if(!groups.has(id))groups.set(id,{id,name:e.venue||e.title,lat:e.lat,lon:e.lon,events:[]});
      groups.get(id).events.push(e);
    }
    return [...groups.values()];
  }
  return {clone,text,url,iso,money,kinds,sources,prompts,initial,event,feed,feedUrls,plan,validate,save,cost,budget,overlaps,filter,invitation,calendar,campaign,mapGroups};
});
