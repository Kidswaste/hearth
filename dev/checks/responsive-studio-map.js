// Real isolated Electron UI; local fixtures, no AI or external event/tile requests.
const wait=ms=>new Promise(r=>setTimeout(r,ms)), frame=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
const check=(v,name)=>{if(!v)throw Error(name);};
const until=async(fn,name)=>{for(let i=0;i<300;i++){if(await fn())return;await wait(30);}throw Error('Timed out: '+name);};
const control=name=>document.querySelector('.cp-stage [aria-label="'+name+'"]');
const click=name=>{const b=[...document.querySelectorAll('.cp-stage button')].find(b=>b.textContent===name);check(b,name+' exists');b.click();};
const result={}; let phase='setup';
const source=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
Object.defineProperty(HTMLImageElement.prototype,'src',{...source,set(value){if(String(value).startsWith('https://tile.openstreetmap.org/'))return;source.set.call(this,value);}});
try {
  await Lazy.load('creative');
  const fixture=WorkbenchCore.defaults(); fixture.texture.size=512;
  fixture.drawing.strokes=Array.from({length:180},(_,i)=>({color:'#ff547d',width:3,brush:['pen','pencil','marker','ribbon','dots','line'][i%6],points:Array.from({length:150},(_,j)=>[(j*3+i)%512,(i*2+j%30)%512])}));
  fixture.storyboard.panels=Array.from({length:24},(_,i)=>({title:'Shot '+i,notes:'Keep this direction',duration:.25+i%3*.25,image:null}));
  await hub.kvSet('creative-workbenches',fixture);
  let uiGenerations=0,workerJobs=0,workers=0;
  const texture=WorkbenchCore.texture;WorkbenchCore.texture=(...args)=>{uiGenerations++;return texture(...args);};
  const WorkerClass=window.Worker;window.Worker=class extends WorkerClass {constructor(...args){super(...args);if(String(args[0]).includes('workbench-texture')){workers++;const post=this.postMessage.bind(this);this.postMessage=(...a)=>{workerJobs++;return post(...a);};}}};
  phase='materials';await WorkspaceNav.creative('texture');
  await until(()=>document.querySelector('.wb-material[aria-busy="false"]'),'worker preview');
  const beforeJobs=workerJobs,t=performance.now();
  const slider=control('Contrast');for(let i=0;i<30;i++){slider.value=String(.5+i*.05);slider.dispatchEvent(new Event('input',{bubbles:true}));}
  result.sliderBurstMs=+(performance.now()-t).toFixed(2);slider.dispatchEvent(new Event('change',{bubbles:true}));
  await until(()=>document.querySelector('.wb-material[aria-busy="false"]'),'latest material');
  result.jobsFor30Changes=workerJobs-beforeJobs;check(result.jobsFor30Changes<=2,'slider jobs bounded');check(uiGenerations===0,'no pixel generation on UI thread');check(result.sliderBurstMs<50,'slider handlers under 50 ms total');
  const expected=texture(WorkbenchUI.snapshot().texture),preview=document.querySelector('.wb-material canvas');
  for(const map of ['color','height','normal','roughness']){const select=control('Inspect map');select.value=map;select.dispatchEvent(new Event('change',{bubbles:true}));const actual=preview.getContext('2d').getImageData(0,0,512,512).data;check(actual.every((v,i)=>v===expected[map][i]),map+' worker pixels match original generator');}
  const beforeInspect=workerJobs;control('Check 3 × 3 tiling').click();check(workerJobs===beforeInspect,'tiling uses existing pixels');
  const beforeKeep=WorkbenchUI.snapshot().shelf.length;click('Keep on worktable');await until(()=>WorkbenchUI.snapshot().shelf.length===beforeKeep+1,'material kept');
  phase='drawing';await WorkspaceNav.creative('draw');await until(()=>control('Sketch canvas'),'sketch');await frame();
  let serializations=0;const svg=WorkbenchCore.drawingSVG;WorkbenchCore.drawingSVG=(...a)=>{serializations++;return svg(...a);};
  const drawStroke=async()=>{const started=performance.now(),c=control('Sketch canvas'),r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:r.left+20,clientY:r.top+20,bubbles:true}));for(let i=0;i<60;i++)c.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:r.left+20+i*2,clientY:r.top+30+i,bubbles:true}));c.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true}));result.drawingHandlerMs=+(performance.now()-started).toFixed(2);await frame();};
  const d0=WorkbenchUI.snapshot().drawing.strokes.length,dt=performance.now();await drawStroke();result.drawingBurstMs=+(performance.now()-dt).toFixed(2);check(serializations===0,'drawing does not serialize SVG on pointer move');
  check(WorkbenchUI.snapshot().drawing.strokes.length===d0+1,'stroke retained');click('Undo stroke');await frame();check(WorkbenchUI.snapshot().drawing.strokes.length===d0,'undo retained');click('Redo stroke');await frame();
  const firstCanvas=control('Sketch canvas');WorkspaceNav.open('chat');await frame();activate('tool:creative');await until(()=>control('Sketch canvas'),'editor resumes');check(control('Sketch canvas')===firstCanvas,'returning keeps the warm editor');await drawStroke();check(WorkbenchUI.snapshot().drawing.strokes.length===d0+2,'drawing works after returning');
  phase='storyboard';await WorkspaceNav.creative('story');await until(()=>control('Timeline playhead'),'timeline');await frame();
  let layoutReads=0;const descriptors={};for(const key of ['offsetLeft','offsetWidth']){const d=Object.getOwnPropertyDescriptor(HTMLElement.prototype,key);descriptors[key]=d;Object.defineProperty(HTMLElement.prototype,key,{...d,get(){if(this.classList?.contains('wb-shot'))layoutReads++;return d.get.call(this);}});}
  click('Play animatic');await wait(650);click('Stop animatic');result.timelineLayoutReads=layoutReads;check(layoutReads===0,'playback does not read layout');
  for(const [k,d] of Object.entries(descriptors))Object.defineProperty(HTMLElement.prototype,k,d);
  check(document.querySelectorAll('.wb-shot').length===24,'all shots retained');await WorkbenchUI.flush();
  phase='map';await Lazy.load('questhud');await Lazy.load('questjournal');activate('tool:quests');await until(()=>QuestJournal.ready(),'journal');
  QuestJournal.navigate('world');await until(()=>document.querySelector('.qj-atlas'),'map');await wait(600);await QuestJournal.flush();
  const root=document.querySelector('.qj'),input=root.querySelector('[data-focus="map-search"]'),profile=root.querySelector('.qj-profile'),filters=root.querySelector('.qj-command-map-filters');input.focus();
  const mt=performance.now();for(const value of ['p','pa','par','pari','paris']){input.value=value;input.dispatchEvent(new InputEvent('input',{bubbles:true}));}
  result.mapSearchBurstMs=+(performance.now()-mt).toFixed(2);check(document.activeElement===input,'typing keeps focus synchronously');await frame();
  check(root.querySelector('[data-focus="map-search"]')===input,'search input reused');check(document.activeElement===input,'search focus retained after draw');
  check(root.querySelector('.qj-profile')===profile && root.querySelector('.qj-command-map-filters')===filters,'search does not rebuild navigation or profile');
  input.value='';input.dispatchEvent(new InputEvent('input',{bubbles:true}));await frame();
  let mutations=0;WorkspaceNav.open('chat');await frame();const observer=new MutationObserver(records=>{mutations+=records.length;});observer.observe(root.querySelector('.qj-content'),{childList:true,subtree:true});
  for(let i=0;i<20;i++)QuestJournal.addMapLayer({id:'responsive-fixture',pins:()=>[]});await frame();result.hiddenMapMutations=mutations;check(mutations===0,'hidden map does not rebuild');observer.disconnect();
  activate('tool:quests');await frame();
  phase='route';const host=document.createElement('div');host.style.cssText='width:800px;height:400px';root.append(host);
  const route={id:'test-route',color:'#ffd75e',points:[{lat:48.86,lon:2.34,label:'1'},{lat:48.87,lon:2.36,label:'2'}]};
  const atlas=QuestAtlas.mount(host,{places:[{id:'test-place',lat:48.86,lon:2.34,name:'Fixture',kind:'music'}],lines:[route]});await frame();
  const svgRoute=host.querySelector('.qj-atlas-route'),tiles=[...host.querySelectorAll('[data-tile]')];
  for(let i=0;i<10;i++){host.dispatchEvent(new WheelEvent('wheel',{deltaX:1,deltaY:1,bubbles:true,cancelable:true}));await frame();}
  check(host.querySelector('.qj-atlas-route')===svgRoute,'panning retains route SVG');check(tiles.some(t=>t.isConnected),'visible tiles reused');
  atlas.update({lines:[]});check(!host.querySelector('.qj-atlas-route'),'route clears');atlas.destroy();host.remove();
  result.workerInstances=workers;result.pass=true;
  await smoke({shot:window.SMOKE_SAVES+'/responsive-map.png'});
  return JSON.stringify(result);
} catch(error){throw Error(JSON.stringify({phase,result,error:error.stack||error.message}));}
