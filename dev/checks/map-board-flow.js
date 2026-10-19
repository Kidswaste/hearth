// Isolated Electron fixtures only: no real edits, AI calls, events or map tile requests.
const wait=ms=>new Promise(r=>setTimeout(r,ms)),frame=()=>new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));
const check=(x,m)=>{if(!x)throw Error(m);},until=async(f,m)=>{for(let i=0;i<250;i++){if(await f())return;await wait(30);}throw Error(m);};
const control=name=>document.querySelector('.cp-stage [aria-label="'+name+'"]');
const click=name=>{const b=[...document.querySelectorAll('.cp-stage button')].find(b=>b.textContent===name);check(b,'Missing '+name);b.click();};
const result={};let phase='setup';
const source=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
Object.defineProperty(HTMLImageElement.prototype,'src',{...source,set(value){if(String(value).startsWith('https://tile.openstreetmap.org/'))return;source.set.call(this,value);}});
try{
  await Lazy.load('creative');const fixture=WorkbenchCore.defaults(),sample=document.createElement('canvas');sample.width=sample.height=16;
  const images=['#ff547d','#ffbe59','#b78aff'].map(color=>{sample.getContext('2d').fillStyle=color;sample.getContext('2d').fillRect(0,0,16,16);return sample.toDataURL();});
  fixture.storyboard.panels=Array.from({length:24},(_,i)=>({title:'Shot '+(i+1),notes:'Original direction '+i,duration:1,image:images[i%3]}));
  await hub.kvSet('creative-workbenches',fixture);
  phase='timeline';await WorkspaceNav.creative('story');await until(()=>control('Timeline playhead'),'Storyboard opens');await frame();await frame();
  const originals=[...document.querySelectorAll('.wb-shot')],thumbs=originals.map(b=>b.querySelector('img')),duration=control('Shot duration (seconds)');
  const t=performance.now();for(let i=0;i<30;i++){duration.value=String(.25+i*.25);duration.dispatchEvent(new Event('input',{bubbles:true}));}
  result.durationBurstMs=+(performance.now()-t).toFixed(2);
  check(originals.every((b,i)=>document.querySelectorAll('.wb-shot')[i]===b&&b.querySelector('img')===thumbs[i]),'Duration edits replaced shots or thumbnails');
  const title=control('Shot title');title.value='Neon opening';title.dispatchEvent(new Event('input',{bubbles:true}));
  check(originals[0].textContent.includes('Neon opening'),'Title updates while typing');
  const notes=control('Direction / sound / action');notes.value='Unblurred direction';notes.dispatchEvent(new Event('input',{bubbles:true}));
  await WorkbenchUI.flush();const saved=await hub.kvGet('creative-workbenches');check(saved.storyboard.panels[0].notes===notes.value&&saved.storyboard.panels[0].duration===7.5,'Input changes did not save without blur');
  originals[0].focus();originals[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  check(control('Shot title').value==='Shot 2','Arrow key selection');
  originals[1].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true,cancelable:true}));
  check(WorkbenchUI.snapshot().storyboard.panels[0].title==='Shot 2','Alt arrow reorder');
  check(document.querySelector('.wb-shot')===originals[1],'Reorder recreated node');
  click('Duplicate shot');await frame();check(document.querySelectorAll('.wb-shot').length===24,'Shot limit bypassed'); // 24-shot limit stays intact.
  click('Remove shot');await frame();check(document.querySelectorAll('.wb-shot').length===23,'Remove shot');
  click('Duplicate shot');await frame();check(document.querySelectorAll('.wb-shot').length===24,'Duplicate shot');
  let decodes=0;const ImageClass=window.Image;window.Image=class extends ImageClass{constructor(...args){super(...args);decodes++;}};
  const scrub=control('Timeline playhead');for(let i=0;i<30;i++){scrub.value=String([0,15.5,16.5][i%3]);scrub.dispatchEvent(new Event('input',{bubbles:true}));await frame();}
  check(decodes<=3,'Scrubbing repeatedly decoded cached frames');window.Image=ImageClass;result.scrubImageLoads=decodes;
  await frame();let layoutReads=0;const descriptors={};for(const key of ['offsetLeft','offsetWidth']){const d=Object.getOwnPropertyDescriptor(HTMLElement.prototype,key);descriptors[key]=d;Object.defineProperty(HTMLElement.prototype,key,{...d,get(){if(this.classList?.contains('wb-shot'))layoutReads++;return d.get.call(this);}});}
  const preview=control('Storyboard preview');preview.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));await wait(200);
  check([...document.querySelectorAll('.wb-transport button')].some(b=>b.textContent==='Pause animatic'),'Space starts preview');
  preview.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));
  check([...document.querySelectorAll('.wb-transport button')].some(b=>b.textContent==='Play animatic'),'Space pauses preview');
  for(const [k,d]of Object.entries(descriptors))Object.defineProperty(HTMLElement.prototype,k,d);check(!layoutReads,'Playback forced layout');result.playbackLayoutReads=layoutReads;
  document.querySelectorAll('.toast').forEach(n=>n.remove());await smoke({shot:window.SMOKE_SAVES+'/storyboard-flow.png'});
  phase='drawing';await CreativePlayground.openFeature('draw');const c=control('Sketch canvas'),rect=c.getBoundingClientRect();
  c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:rect.left+30,clientY:rect.top+30,bubbles:true}));c.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:rect.left+80,clientY:rect.top+80,bubbles:true}));c.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,bubbles:true}));
  check(WorkbenchUI.snapshot().drawing.strokes.length===1,'Stroke missing');
  c.dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true}));check(WorkbenchUI.snapshot().drawing.strokes.length===0,'Mac undo');
  c.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}));check(WorkbenchUI.snapshot().drawing.strokes.length===1,'Windows redo');
  document.querySelector('.workspace-creative-tabs [aria-pressed="true"]').click();await frame();check(control('Sketch canvas')===c,'Active tool click rebuilt editor');
  phase='map';await Lazy.load('questhud');await Lazy.load('questjournal');activate('tool:quests');await until(()=>QuestJournal.ready(),'Journal ready');QuestJournal.navigate('world');await until(()=>document.querySelector('.qj-atlas'),'Map ready');await wait(700);
  const input=document.querySelector('[data-focus="map-search"]'),map=document.querySelector('.qj-atlas'),tiles=[...map.querySelectorAll('[data-tile]')].map(n=>[n.dataset.tile,n.style.transform]);
  const term=QuestJournal.snapshot().atlas.places.find(p=>p.name.includes('Canal'))?.name||'Paris';input.focus();input.value=term;input.dispatchEvent(new InputEvent('input',{bubbles:true}));await frame();
  check(document.activeElement===input,'Search stole focus');check(JSON.stringify(tiles)===JSON.stringify([...map.querySelectorAll('[data-tile]')].map(n=>[n.dataset.tile,n.style.transform])),'Search moved map');
  check(document.querySelector('.qj-map-matches [data-map-match]'),'Matching result absent');
  input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));check(document.activeElement.hasAttribute('data-map-match'),'ArrowDown does not reach result');document.activeElement.click();await frame();
  check(map.querySelector('.qj-atlas-pin.selected'),'Picked place not selected');
  document.querySelector('[aria-label="Fit all matches"]').click();await frame();check(+map.dataset.zoom>=12,'Fit matches did not zoom');
  await smoke({shot:window.SMOKE_SAVES+'/map-results.png'});
  input.focus();input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await frame();check(!input.value&&document.querySelector('.qj-map-matches').hidden,'Escape did not clear search');
  phase='worker alignment';
  const RealWorker=window.Worker;let held=[],delay=false,terminations=0;window.Worker=class{
    constructor(url,...args){if(!String(url).includes('quest-atlas-worker'))return new RealWorker(url,...args);this.worker=new RealWorker(url,...args);this.worker.onmessage=ev=>{if(delay)held.push(()=>this.onmessage?.(ev));else this.onmessage?.(ev);};this.worker.onerror=ev=>this.onerror?.(ev);}
    postMessage(...a){this.worker.postMessage(...a);}terminate(){terminations++;this.worker.terminate();}
  };
  const host=document.createElement('div');Object.assign(host.style,{position:'fixed',inset:'100px',zIndex:100});document.body.append(host);
  const places=Array.from({length:10000},(_,i)=>({id:'flow-'+i,name:'Place '+i,lat:48.862+i%10*.00001,lon:2.35+i%10*.00001,minZoom:i<10?11:17,kind:'music'}));
  const atlas=QuestAtlas.mount(host,{places});atlas.focus(places[0]);await until(()=>host.querySelector('.qj-atlas-pin'),'Worker pins ready');
  const pin=host.querySelector('.qj-atlas-pin'),before=pin.getBoundingClientRect();delay=true;host.dispatchEvent(new WheelEvent('wheel',{deltaX:36,deltaY:24,bubbles:true,cancelable:true}));await frame();
  const after=pin.getBoundingClientRect();check(Math.abs(after.x-before.x+36)<1&&Math.abs(after.y-before.y+24)<1,'Worker-pending pins lag behind map pan');
  await until(()=>held.length,'Worker response held');delay=false;held.splice(0).forEach(fn=>fn());await frame();
  const settled=pin.getBoundingClientRect();check(Math.abs(settled.x-after.x)<1&&Math.abs(settled.y-after.y)<1,'Pins jump when worker returns');
  const center=atlas.center();atlas.destroy();host.replaceChildren();check(terminations===1,'Worker leaked');const reopened=QuestAtlas.mount(host,{places:places.slice(0,4)});check(Math.abs(reopened.center().lat-center.lat)<1e-9,'Viewport lost on reopen');check(JSON.parse(localStorage.getItem('hearth.paris.viewport')).lon===center.lon,'Viewport not persisted');reopened.destroy();host.remove();window.Worker=RealWorker;
  result.pass=true;result.stableShots=24;result.workerCatalog=10000;return result;
}catch(err){throw Error(JSON.stringify({phase,result,error:err.stack||err.message}));}
