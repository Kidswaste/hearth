// Regression: paused dialogs, chat-to-lineup, cached event pins, guide action and real persistence.
const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(v){if(String(v).startsWith('https://tile.openstreetmap.org/')){queueMicrotask(()=>this.dispatchEvent(new Event('error')));return;}descriptor.set.call(this,v);}});
const wait=ms=>new Promise(r=>setTimeout(r,ms)),until=async f=>{for(let i=0;i<160;i++){if(await f())return;await wait(50);}throw Error('City timeout');};
let checks=0;const check=(v,m)=>{if(!v)throw Error(m);checks++;};
await Lazy.load('questjournal');activate('tool:quests');await until(()=>QuestJournal.ready());
const root=document.querySelector('.qj'),top=()=>[...root.querySelectorAll('dialog[open]')].at(-1);
const press=async(name,scope=top()||root)=>{const b=[...scope.querySelectorAll('button')].find(b=>b.textContent===name||b.getAttribute('aria-label')===name);check(b,'button '+name);b.click();await until(()=>!b.disabled);await wait(70);};
await QuestJournal.mutate(s=>{s.motion=false;});
await QuestJournal.openOutings();await wait(350);check(getComputedStyle(top()).opacity==='1','motion-off dialog remains visible');check(top().getBoundingClientRect().height>100,'dialog has content');
check([...top().querySelectorAll('button')].some(b=>b.textContent==='Load Paris events'),'empty desk has direct load action');top().close();await wait(70);
activate(H.railAgents()[0].id);await wait(80);await QuestJournal.openOutings();await wait(350);check(H.activeId==='tool:quests','dialog from chat activates studio');check(getComputedStyle(top()).opacity==='1','chat dialog visible');
document.documentElement.dataset.away='';await press('Keep an event link');await wait(350);check(getComputedStyle(top()).opacity==='1','nested dialog visible while app animations paused');top().close();delete document.documentElement.dataset.away;await wait(60);top().close();await wait(60);
const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.now()+90000000).toISOString();
const rows=[{id:'811',title:'Fixture listening night',address_name:'Fixture canal venue',qfap_tags:'Concert',url:'https://www.paris.fr/evenements/test',date_start:start,date_end:end,price_type:'gratuit',lat_lon:{lat:48.8719,lon:2.3635}},{id:'812',title:'Fixture visual night',address_name:'Fixture canal venue',qfap_tags:'Exposition',url:'https://www.paris.fr/evenements/test-two',date_start:start,date_end:end,lat_lon:{lat:48.8719,lon:2.3635}}];
await OutingDesk.refresh(async()=>JSON.stringify({results:rows}));QuestJournal.navigate('world');await until(()=>root.querySelector('[data-place^="od-venue-"]'));
check(OutingCore.mapGroups(OutingDesk.snapshot()).length===1,'two events grouped at one venue');
await press('Explore places',root);check(QuestParis.hasGuide(QuestJournal.snapshot()),'one action fills guide');check(QuestJournal.snapshot().atlas.places.length>=44,'44 guide places available');
await smoke({shot:window.SMOKE_SAVES+'/city-map.png'});
root.querySelector('[data-place^="od-venue-"]').click();await until(()=>top()?.getAttribute('aria-label')==='Fixture canal venue');check(top().textContent.includes('Fixture listening night')&&top().textContent.includes('Fixture visual night'),'pin shows both actual events');
await press('Plan this outing');check(top().getAttribute('aria-label')==='Fixture listening night','pin opens usable planner');check(OutingDesk.snapshot().saved.length===1,'pin saves plan once');
await press('Make a take-home quest');check(QuestJournal.snapshot().campaigns.some(c=>c.id.startsWith('c-outing-')),'pin becomes proof quest');check(QuestCore.xp(QuestJournal.snapshot())===0,'no XP for planning');top().close();await wait(80);
activate(H.railAgents()[0].id);await QuestJournal.keepOuting({id:'showsync-fixture',title:'Fixture from shows',url:'https://example.com/show',start,end,kind:'music'});await wait(350);check(top().getAttribute('aria-label')==='Fixture from shows','show bridge opens the saved event itself');check(root.querySelector('.od-tab[data-tab="saved"]').getAttribute('aria-pressed')==='true','bridge starts on My lineup');
await smoke({shot:window.SMOKE_SAVES+'/city-plan.png'});
await smoke({cdp:'Emulation.setDeviceMetricsOverride',params:{width:760,height:1000,deviceScaleFactor:1,mobile:false}});check(top().scrollWidth<=top().clientWidth+2,'planner fits narrower window');await smoke({shot:window.SMOKE_SAVES+'/city-plan-narrow.png'});await smoke({cdp:'Emulation.clearDeviceMetricsOverride'});
while(top()){top().close();await wait(60);}QuestJournal.navigate('world');root.querySelector('[data-focus="map-filter-visual"]').click();await wait(80);check(root.querySelectorAll('[data-place^="od-venue-"]').length===1,'visual filter has venue');root.querySelector('[data-focus="map-filter-game"]').click();await wait(80);check(!root.querySelector('[data-place^="od-venue-"]'),'unrelated lane hides events');
await QuestJournal.flush();await OutingDesk.flush();return `City integration: ${checks} checks passed.`;
//@@ reload
await Lazy.load('questjournal');activate('tool:quests');for(let i=0;i<160&&!QuestJournal.ready();i++)await new Promise(r=>setTimeout(r,50));
await OutingDesk.ensureMap();if(OutingDesk.snapshot().feed.length!==2||OutingDesk.snapshot().saved.length!==2||!QuestParis.hasGuide(QuestJournal.snapshot())||!QuestJournal.snapshot().campaigns.some(c=>c.id.startsWith('c-outing-'))||!OutingDesk.snapshot().saved.some(p=>p.questId))throw Error('City persistence failed');return 'Guide, event cache, lineup and proof quest survive real reload.';
