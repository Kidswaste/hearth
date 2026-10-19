const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,name)=>{for(let i=0;i<250;i++){if(fn())return;await wait(40);}throw Error('Timed out: '+name);};
const check=(v,name)=>{if(!v)throw Error(name);};
await Lazy.load('questjournal');
const RealWorker=window.Worker,instances=[];
window.Worker=class extends RealWorker{constructor(url,...args){super(url,...args);if(String(url).includes('quest-atlas-worker'))instances.push(this);}terminate(){this.wasTerminated=true;return super.terminate();}};
const host=document.createElement('div');Object.assign(host.style,{position:'fixed',inset:'100px 100px 120px',zIndex:100});document.body.append(host);
const places=Array.from({length:10000},(_,i)=>({id:'worker-'+i,name:'Place '+i,lat:48.862+(i%20)*.00001,lon:2.35+(i%20)*.00001,minZoom:i<10?11:17,kind:'music'}));
let atlas;
try{
  atlas=QuestAtlas.mount(host,{places});await until(()=>instances.length&&host.querySelectorAll('.qj-atlas-pin').length>=10,'worker pin results');
  check(host.querySelectorAll('.qj-atlas-pin').length<100,'zoom rules keep distant details quiet');
  for(let i=0;i<60;i++)host.dispatchEvent(new WheelEvent('wheel',{deltaX:1,deltaY:1,bubbles:true,cancelable:true}));
  await wait(250);atlas.update({places:places.slice(0,4)});await until(()=>host.querySelectorAll('.qj-atlas-pin').length===4,'catalog replacement');
  atlas.destroy();check(instances.every(w=>w.wasTerminated),'workers terminated on map close');
}finally{atlas?.destroy();host.remove();window.Worker=RealWorker;}
return {pass:true,catalog:10000,worker:true,zoomFiltering:true,latestCatalog:true,terminated:true};
