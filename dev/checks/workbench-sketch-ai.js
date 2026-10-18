// Uses only dev/smoke.js --fake-meshy's local API, no live Meshy account or credits.
//   node dev/smoke.js --fake-meshy --script dev/checks/workbench-sketch-ai.js
const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async fn=>{for(let i=0;i<300;i++){const r=await fn();if(r)return r;await wait(100);}throw Error('Sketch AI flow timed out');};
const assert=(v,msg)=>{if(!v)throw Error(msg);console.log('[J] ✓ '+msg);};
await Lazy.load('creative');await Lazy.load('apps');activate('tool:creative');await until(()=>document.querySelector('.wb-stations'));
const status=await hub.apps.status();assert(status.testBase?.startsWith('http://127.0.0.1:'),'isolated fake provider configured');await hub.apps.key('meshy','set','msy_fake_sketch_test_12345');
await CreativePlayground.openFeature('draw');await until(()=>document.querySelector('.wb-create'));const c=document.querySelector('.wb-canvas'),r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:r.x+50,clientY:r.y+50,buttons:1}));c.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:r.x+100,clientY:r.y+100,buttons:1}));c.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}));
const p=document.querySelector('[aria-label="Describe the finish you want"]');p.value='Chrome and vivid pink enamel';p.dispatchEvent(new Event('input'));
const button=label=>[...document.querySelectorAll('.wb-shell button')].find(b=>b.textContent===label);button('Create AI model').click();
const dialog=await until(()=>[...document.querySelectorAll('dialog[open]')].find(d=>d.textContent.includes('Spend Meshy credits')));assert(dialog.textContent.includes('30 credits'),'existing cost gate shown');[...dialog.querySelectorAll('button')].find(b=>b.textContent.includes('Make it')).click();
await until(()=>button('Model frame → storyboard'));assert(WorkbenchUI.snapshot().drawing.jobs.length===1,'real background generation reference saved');
const jobs=(await hub.apps.meshy('jobs',{resume:false})).value;const j=jobs.find(j=>j.id===WorkbenchUI.snapshot().drawing.jobs[0].id);assert(j.status==='done'&&j.files.glb&&j.files.thumb,'API produced and downloaded model and thumbnail');
button('Model frame → storyboard').click();await until(()=>WorkbenchUI.snapshot().storyboard.panels.length===4);assert(WorkbenchUI.snapshot().storyboard.panels[3].image.startsWith('data:image/png;base64,'),'generated model thumbnail becomes portable storyboard frame');
button('Add model to asset library').click();await until(()=>typeof Assets!=='undefined'&&Assets.find(j.files.glb));assert(Assets.find(j.files.glb),'model added to common Hearth asset library');
button('Open model in Lab').click();await until(()=>typeof ThreeLab!=='undefined'&&JSON.stringify(ThreeLab.director?.layers?.() || '').includes('Chrome and vivid pink enamel'));assert(true,'generated model loaded as real Lab layer');
return 'Sketch image → real provider IPC → generated GLB/thumbnail → storyboard, shared library and Lab passed against local fake Meshy (no paid calls).';
