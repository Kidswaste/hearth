/* Additive Sidequest surface. No polling, model calls or messages; only an explicit public-feed refresh. */
const OutingDesk = (() => {
  const C=OutingCore,KEY='sidequest-outings-v1';
  let state,loading,saving=Promise.resolve(),refreshing,api,active,paint,offset=0,mapReady=false;
  const E=(tag,props={},...children)=>el(tag,props,...children);
  const p=t=>E('p',{class:'qj-copy',text:t});
  const fmt=t=>t?new Date(t).toLocaleString('en-GB',{timeZone:'Europe/Paris',dateStyle:'medium',timeStyle:'short'}):'Choose your time';
  const short=t=>t?new Date(t).toLocaleDateString('en-GB',{timeZone:'Europe/Paris',day:'numeric',month:'short'}):'Date open';
  function say(t){const node=[...document.querySelectorAll('.qj dialog[open]')].at(-1)?.querySelector('.qj-dialog-status');if(node)node.textContent=t;}
  async function load(){
    if(state)return;if(loading)return loading;
    loading=(async()=>{const r=await window.hub.kvGet(KEY,null,{status:true});if(r?.state==='missing')state=C.initial();else if(r?.state==='ok')state=C.validate(r.value);else throw Error(r?.error||'The outing notebook could not be loaded. Nothing has been replaced.');})().finally(()=>{loading=null;});return loading;
  }
  function change(fn){const task=saving.catch(()=>{}).then(async()=>{await load();const next=C.clone(state);await fn(next);const checked=C.validate(next),r=await window.hub.kvSet(KEY,checked);if(r?.error)throw Error(r.error);state=checked;paint?.();if(mapReady)registerMap();});saving=task;return task;}
  function mapSummary(){return {count:C.filter(state?.feed||[],{days:30}).length};}
  function registerMap(){
    QuestJournal.addMapLayer({id:'outing-desk',owns:id=>id.startsWith('od-venue-'),
      pins:filters=>C.mapGroups(state||C.initial(),{...filters,saved:true}).map(g=>({id:g.id,name:g.name+' · '+g.events.length,lat:g.lat,lon:g.lon,kind:'calendar',color:'#ffb14a'})),
      select:(id,kit)=>QuestJournal.openOutings({venue:id}).catch(err=>kit.notice(err.message))
    });
  }
  async function ensureMap(){if(mapReady)return;await load();if(mapReady)return;mapReady=true;registerMap();}
  async function refresh(fetcher=url=>window.hub.fetchText(url)){
    await load();if(refreshing)return refreshing;
    if(state.fetchedAt&&Date.now()-Date.parse(state.fetchedAt)<15*60000){say('Already checked recently. Refresh is available every 15 minutes.');return;}
    refreshing=(async()=>{
      say('Checking the Paris agenda…');let timer;
      try{
        const request=Promise.all(C.feedUrls().map(async url=>{const raw=await fetcher(url);if(typeof raw!=='string'||raw.length>4000000)throw Error('Unexpected Paris agenda response.');const data=JSON.parse(raw);if(!Array.isArray(data.results))throw Error('The Paris agenda format changed.');return data.results;}));
        const batches=await Promise.race([request,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Paris agenda took too long. Your last list is kept.')),20000);})]);
        const events=C.feed(batches.flat());
        // A complete empty response is allowed; malformed/nonempty data must not erase a good cache silently.
        if(batches.flat().length&&!events.length)throw Error('No usable Paris dates came back. Your last list is kept.');
        await change(s=>{s.feed=events;s.fetchedAt=new Date().toISOString();});say(`${events.length} ideas checked. Dates and ticket availability still need the source page.`);
      }catch(err){say('Could not refresh. Your saved outings and last successful list are kept. '+err.message);throw err;}finally{clearTimeout(timer);refreshing=null;}
    })();return refreshing;
  }
  const btn=(text,fn,cls='')=>api.button(text,fn,cls);
  function icon(kind,title,fn,color='#bd8bff',pressed){const b=btn('',fn,'od-icon');b.append(QuestAtlas.icon(kind));b.setAttribute('aria-label',title);b.dataset.help=title;b.style.setProperty('--action-color',color);if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));return b;}
  function select(title,options,value){const input=E('select',{attrs:{'aria-label':title}});for(const [v,t]of options)input.append(E('option',{value:v,text:t}));input.value=value;return {input,node:E('label',{class:'qj-field'},E('span',{class:'qj-label',text:title}),input)};}
  function close(){active?.close();}
  async function exportCalendar(plans){const content=C.calendar(plans),r=await window.hub.saveFile({defaultPath:'hearth-outings.ics',filters:[{name:'Calendar',extensions:['ics']}],content});say(r?'Calendar exported. Import it into your calendar app.':'Export cancelled.');}
  function sourceLink(e){return icon('arrow','Open official source',()=>window.hub.openExternal(e.url),'#ffd75e');}
  function form(e){
    api.dialog(e?'Edit your event':'Keep an event link',(body,d)=>{
      const name=api.field('Event name',{value:e?.title,max:180}),link=api.field('HTTPS event link',{value:e?.url,max:2000}),venue=api.field('Venue',{value:e?.venue,max:160}),kind=select('Creative lane',C.kinds.map(k=>[k.id,k.name]),e?.kind||'music'),note=api.field('Why this one?',{value:e?.note,multiline:true,max:600});
      body.append(name.node,link.node,venue.node,kind.node,note.node,p('Keep a link from any event source. Set your own visit time and costs in the planner.'),btn('Save event',async()=>{
        const item=C.event({...e,id:e?.id||'manual-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),title:name.input.value,url:link.input.value,venue:venue.input.value,kind:kind.input.value,note:note.input.value,source:e?.source||'Your event link'});
        if(!item.url)throw Error('Add the HTTPS event page so you can recheck it.');await change(s=>{const saved=C.save(s,item);if(e)saved.event=item;});d.close();detail(item.id);
      },'qj-primary'));
    });
  }
  function localValue(iso){if(!iso)return '';const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
  function localIso(value){if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime())||localValue(d.toISOString())!==value)throw Error('That local time does not exist. Check the clock-change date.');return d.toISOString();}
  function detail(id){
    const item=state.saved.find(x=>x.event.id===id);if(!item)return;const e=item.event;
    api.dialog(e.title,(body,d)=>{
      const meta=E('div',{class:'od-detail-meta'},p(e.venue||'Venue to confirm'),sourceLink(e),api.explain('Event dates',e.dateNote||`Source window: ${fmt(e.start)} → ${fmt(e.end)}. Recheck the source, especially recurring events.`));body.append(meta);
      const start=api.field('Visit starts · computer local time',{type:'datetime-local',value:localValue(item.visitStart)}),end=api.field('Visit ends · computer local time',{type:'datetime-local',value:localValue(item.visitEnd)});
      const sessions=e.sessions.filter(s=>Date.parse(s.end)>=Date.now());
      if(sessions.length){const choice=select('Published sessions · Paris time',[['','Choose a published session'],...sessions.map((s,i)=>[String(i),fmt(s.start)+' → '+new Date(s.end).toLocaleTimeString('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'})])],'');choice.input.onchange=()=>{const s=sessions[Number(choice.input.value)];if(choice.input.value!==''&&s){start.input.value=localValue(s.start);end.input.value=localValue(s.end);}};body.append(choice.node);}
      body.append(E('div',{class:'od-pair'},start.node,end.node));
      const status=select('My plan',[['saved','Maybe'],['going','Planning to go'],['archived','Parked']],item.status),buddy=api.field('With whom? · optional',{value:item.buddy,max:80});
      const list=E('datalist',{attrs:{id:'od-friends-'+id}});for(const f of api.friends())list.append(E('option',{value:f.name}));buddy.input.setAttribute('list',list.id);
      body.append(E('div',{class:'od-pair'},status.node,buddy.node),list);
      const ticket=api.field('Ticket estimate · EUR',{type:'number',value:item.ticket===null?'':String(item.ticket)}),transport=api.field('Travel estimate · EUR',{type:'number',value:item.transport===null?'':String(item.transport)}),extras=api.field('Extras estimate · EUR',{type:'number',value:item.extras===null?'':String(item.extras)});
      for(const f of [ticket,transport,extras]){f.input.min='0';f.input.max='10000';f.input.step='.01';f.input.placeholder='Unknown';}
      const costs=E('details',{class:'od-fold'},E('summary',{text:'Budget · '+(C.cost(item).unknown?'€'+C.cost(item).known+' + unknown costs':'€'+C.cost(item).known)}),E('div',{class:'od-three'},ticket.node,transport.node,extras.node),p('Your estimates, not live ticket prices. Blank amounts stay unknown.'));
      const prompt=select('Bring something home',C.prompts.map(p=>[p.id,p.name]),item.prompt),brief=p(C.prompts.find(p=>p.id===item.prompt).brief);prompt.input.onchange=()=>{brief.textContent=C.prompts.find(p=>p.id===prompt.input.value).brief;};
      const note=api.field('Personal note / fallback',{value:item.note,multiline:true,max:600});
      const warnings=E('p',{class:'od-warning',attrs:{role:'status'}});
      const values=()=>({...item,visitStart:localIso(start.input.value),visitEnd:localIso(end.input.value),status:status.input.value,buddy:buddy.input.value,ticket:C.money(ticket.input.value),transport:C.money(transport.input.value),extras:C.money(extras.input.value),prompt:prompt.input.value,note:note.input.value});
      const updateWarning=()=>{try{const v=values(),conflicts=C.overlaps(state,v);warnings.textContent=conflicts.length?'Overlaps: '+conflicts.map(p=>p.event.title).join(' · '):v.visitStart?'Visit time shown in '+Intl.DateTimeFormat().resolvedOptions().timeZone+'. Allow time to travel.':'Choose your visit time before calendar export.';}catch(err){warnings.textContent=err.message;}};start.input.oninput=end.input.oninput=updateWarning;updateWarning();
      const persist=async()=>{const v=values();await change(s=>Object.assign(s.saved.find(p=>p.event.id===id),v));};
      body.append(costs,prompt.node,brief,note.node,warnings,btn('Save plan',async()=>{await persist();d.close();say('Outing plan saved.');},'qj-primary'));
      const actions=E('div',{class:'od-actions'});
      actions.append(icon('calendar','Export this visit to calendar',async()=>{await persist();await exportCalendar([state.saved.find(p=>p.event.id===id)]);}),icon('chat','Preview an invitation · nothing is sent',async()=>{await persist();api.dialog('Your invitation draft',b=>{const draft=api.field('Editable invitation',{value:C.invitation(state.saved.find(p=>p.event.id===id)),multiline:true,max:1500});b.append(draft.node,btn('Copy invitation',async()=>{await navigator.clipboard.writeText(draft.input.value);say('Invitation copied. Nothing sent.');}));});},'#ff6b9d'),icon('check','Mark source checked just now',async()=>{await persist();await change(s=>{s.saved.find(p=>p.event.id===id).checkedAt=new Date().toISOString();});d.close();detail(id);},'#ffd75e'));
      if(e.lat!==null)actions.append(icon('pin','Pin this venue on my Paris map',async()=>{await persist();await api.pin(e);d.close();close();},'#ff8c42'));
      if(e.id.startsWith('manual-'))actions.append(icon('edit','Edit event link',()=>{d.close();form(e);}));
      body.append(actions,p(item.checkedAt?'You last checked the source '+fmt(item.checkedAt)+'.':'Source not yet checked by you.'),btn(item.questId?'Open take-home quest':'Make a take-home quest',async()=>{
        await persist();const p=state.saved.find(p=>p.event.id===id),qid=await api.quest(p);await change(s=>{s.saved.find(p=>p.event.id===id).questId=qid;});d.close();close();api.openQuest(qid);
      },'qj-primary'),btn('Remove saved outing',()=>api.dialog('Remove this saved outing?',(b,confirm)=>b.append(p('The saved plan leaves this notebook. Any accepted quest and earned progress stay in Sidequest.'),btn('Remove outing',async()=>{await change(s=>{s.saved=s.saved.filter(p=>p.event.id!==id);});confirm.close();d.close();},'qj-danger'))),'qj-quiet'));
    },'OUTING / PERSONAL PLAN');
  }
  async function open(helpers,options={}){
    api=helpers;if(active?.open){if(options.eventId)detail(options.eventId);else if(options.venue)venue(options.venue);else {active.close();active=null;}if(active?.open)return;}await load();
    let tab=options.tab==='saved'?'saved':'discover',filters={kind:'all',query:'',free:false,days:30},area,results,tally;
    active=api.dialog('Outing desk',(body,d)=>{
      d.classList.add('od-dialog');
      const tabs=E('div',{class:'od-tabs',attrs:{role:'group','aria-label':'Outing desk sections'}});
      for(const [id,name,glyph]of [['discover','Discover','compass'],['saved','My lineup','bookmark'],['sources','Sources','folder']]){const b=btn(name,()=>{tab=id;offset=0;paint();},'od-tab');b.prepend(QuestAtlas.icon(glyph));b.dataset.tab=id;tabs.append(b);}
      const toolbar=E('div',{class:'od-toolbar'},tabs,icon('plus','Keep an event link',()=>form()),icon('refresh','Refresh the official Paris agenda',()=>refresh(),'#ffb14a'));
      body.append(toolbar);area=E('div',{class:'od-area'});body.append(area);
      d.addEventListener('close',()=>{if(active===d){active=null;paint=null;}});
      paint=()=>{
        const focus=document.activeElement?.dataset.odFocus;
        for(const b of tabs.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.tab===tab));
        area.replaceChildren();
        if(tab==='sources'){
          area.append(p('More places to find your next night. Open a programme, then keep the event link here.'));
          const grid=E('div',{class:'od-source-grid'});for(const source of C.sources){const b=btn('',()=>window.hub.openExternal(source.url),'od-source');b.append(QuestAtlas.icon(source.tag==='Sound'?'music':source.tag==='Visuals'?'visual':'compass'),E('strong',{text:source.name}),E('span',{text:source.tag}));b.dataset.help=source.note+' · Opens the official programme';b.setAttribute('aria-label',source.name);grid.append(b);}area.append(grid);return;
        }
        if(tab==='saved'){
          const b=C.budget(state),total=E('div',{class:'od-total'},E('div',{},E('span',{class:'qj-label',text:'PLANNED OUTINGS'}),E('strong',{text:`€${b.known}${b.unknown?' + ?':''}`})),p(`${b.count} planned${state.ceiling!==null?' / €'+state.ceiling+' spending ceiling':''}${b.over?' · Over ceiling':''}`),icon('settings','Set my outing spending ceiling',()=>api.dialog('Outing spending ceiling',(body,d)=>{const f=api.field('Total ceiling · EUR',{type:'number',value:state.ceiling===null?'':String(state.ceiling)});f.input.min=0;body.append(f.node,p('Only outings marked “Planning to go” count. This is separate from your reward allowance; nothing is charged.'),btn('Save ceiling',async()=>{await change(s=>{s.ceiling=C.money(f.input.value);});d.close();},'qj-primary'));})),icon('download','Export planned visits to calendar',()=>exportCalendar(state.saved.filter(p=>p.status==='going'))));if(b.over)total.classList.add('is-over');area.append(total);
          const rows=[...state.saved].sort((a,b)=>(a.status==='archived')-(b.status==='archived')||(a.visitStart||'z').localeCompare(b.visitStart||'z'));
          if(!rows.length)area.append(empty('Your next good night starts here.','Save a discovery, or keep a link from Claude’s shows feed.'));
          const grid=E('div',{class:'od-grid'});for(const plan of rows){const card=eventCard(plan.event,plan);if(C.overlaps(state,plan).length)card.append(E('span',{class:'od-warning',text:'Time overlap'}));grid.append(card);}area.append(grid);return;
        }
        const tools=E('div',{class:'od-filters'}),search=E('input',{type:'search',value:filters.query,attrs:{'aria-label':'Search events',placeholder:'Artist, place, idea…',maxlength:120},dataset:{odFocus:'query'}});
        search.oninput=()=>{filters.query=search.value;offset=0;drawResults();};tools.append(search);
        for(const k of [{id:'all',name:'All lanes',icon:'compass',color:'#c7c3cf'},...C.kinds])tools.append(icon(k.icon,k.name,()=>{filters.kind=k.id;offset=0;paint();},k.color,filters.kind===k.id));
        tools.append(icon('gift','Free admission only · reservations may still apply',()=>{filters.free=!filters.free;offset=0;paint();},'#ffd75e',filters.free));
        const when=select('When',[['7','Next 7 days'],['30','Next 30 days']],String(filters.days));when.input.onchange=()=>{filters.days=Number(when.input.value);offset=0;drawResults();};tools.append(when.input);area.append(tools);
        tally=p('');area.append(tally);results=E('div');area.append(results);drawResults();
        const footer=E('div',{class:'od-credit'},p(state.fetchedAt?`Checked ${fmt(state.fetchedAt)}${Date.now()-Date.parse(state.fetchedAt)>86400000?' · refresh recommended':''}. A bounded selection, not every Paris event.`:'Refresh to load the next 30 days. No background downloads.'),btn('Ville de Paris · ODbL',()=>window.hub.openExternal('https://opendata.paris.fr/explore/dataset/que-faire-a-paris-/'),'qj-quiet'));area.append(footer);
        if(focus)area.querySelector(`[data-od-focus="${focus}"]`)?.focus();
      };
      function empty(title,note){return E('div',{class:'od-empty'},QuestAtlas.icon('compass'),E('h3',{text:title}),p(note));}
      function eventCard(e,saved){const k=C.kinds.find(k=>k.id===e.kind),card=E('article',{class:'od-card'});card.style.setProperty('--od-color',k.color);
        const head=E('div',{class:'od-card-head'},QuestAtlas.icon(k.icon),E('span',{class:'qj-label',text:saved?({saved:'MAYBE',going:'PLANNING TO GO',archived:'PARKED'}[saved.status]):k.name}));
        const dateLabel=saved?.visitStart?short(saved.visitStart):e.sessions[0]?short(e.sessions[0].start):e.start&&Date.parse(e.start)<Date.now()&&Date.parse(e.end)>Date.now()?'Ongoing · until '+short(e.end):short(e.start);
        card.append(head,E('h3',{text:e.title}),p(e.venue||e.address),E('div',{class:'od-card-meta'},E('span',{text:dateLabel}),E('span',{text:e.free?'Free admission':'Price to check'})));
        const actions=E('div',{class:'od-actions'});if(saved)actions.append(btn('Plan outing',()=>detail(e.id),'qj-primary'));else actions.append(icon('bookmark','Save this outing',async()=>{await change(s=>C.save(s,e));say('Saved to My lineup.');},'#ffd75e'));if(e.url)actions.append(sourceLink(e));actions.append(api.explain(e.title,[e.note,e.price,e.dateNote].filter(Boolean).join(' · ')||'Check the official source for details.'));card.append(actions);return card;}
      function drawResults(){const matches=C.filter(state.feed,filters),slice=matches.slice(0,offset+12);tally.textContent=`${matches.length} ideas${filters.free?' · free admission':''}${state.fetchedAt&&Date.now()-Date.parse(state.fetchedAt)>86400000?' · saved list, refresh recommended':''}`;results.replaceChildren();if(!matches.length)results.append(empty(state.feed.length?'Try another lane.':'A city full of ingredients.','Concerts, exhibitions, workshops, games and places to wander.'));if(!state.fetchedAt||Date.now()-Date.parse(state.fetchedAt)>86400000)results.append(btn(state.fetchedAt?'Check for new events':'Load Paris events',()=>refresh(),'qj-primary od-load'));
        const grid=E('div',{class:'od-grid'});for(const e of slice)grid.append(eventCard(e,state.saved.find(p=>p.event.id===e.id)));results.append(grid);if(matches.length>slice.length)results.append(btn('Show 12 more',()=>{offset+=12;drawResults();},'od-more'));
      }
      paint();
    },'FH / CITY FREQUENCIES');
    if(options.eventId)detail(options.eventId);
    else if(options.venue)venue(options.venue);
  }
  function venue(id){const group=C.mapGroups(state).find(g=>g.id===id);if(!group)return;api.dialog(group.name,(body,d)=>{
    body.append(p(group.events.length+' upcoming ideas · check the source before leaving.'));
    for(const e of group.events){const card=E('article',{class:'od-card'},E('h3',{text:e.title}),p(short(e.sessions[0]?.start||e.start)+' · '+(e.free?'Free admission':'Price to check')),E('div',{class:'od-actions'},e.url?sourceLink(e):null,btn('Plan this outing',async()=>{await change(s=>C.save(s,e));d.close();detail(e.id);},'qj-primary')));card.style.setProperty('--od-color',C.kinds.find(k=>k.id===e.kind).color);body.append(card);}
  },'FH / AT THIS PLACE');}
  return {open,refresh,ensureMap,mapSummary,keepEvent:async raw=>{const e=C.event(raw);await change(s=>C.save(s,e));return e.id;},snapshot:()=>state&&C.clone(state),flush:()=>saving};
})();
