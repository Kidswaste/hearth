const wait=ms=>new Promise(r=>setTimeout(r,ms));
const check=(x,m)=>{if(!x)throw Error(m);};
const until=async(f,m)=>{for(let i=0;i<200;i++){if(await f())return;await wait(50);}throw Error(m);};
await Lazy.load('projects');await Projects.ready();
const p=await ProjectWorkspace.create({name:'Clinky test',plugins:[]});
const c=H.chats.find(c=>c.id===p.workspace.chatId),v=Native.view(c.agentId);
v.input.value='Unsent idea';v.input.dispatchEvent(new Event('input',{bubbles:true}));
await ProjectWorkspace.go('board');await CreativePlayground.openFeature('draw');
const drawing=document.querySelector('.wb-canvas');
let mounts=0,refreshes=0;const mount=WorkbenchUI.mount,refresh=Native.refresh;
WorkbenchUI.mount=function(...a){mounts++;return mount(...a);};Native.refresh=function(...a){refreshes++;return refresh(...a);};
const frame=document.querySelector('iframe[src*="three-sandbox"]'),src=frame?.src;
for(let i=0;i<3;i++){await ProjectWorkspace.go('scene');await ProjectWorkspace.go('chat');check(v.root.closest('.surface').dataset.id==='tool:projectchat','chat in full project surface');await ProjectWorkspace.go('board');}
check(mounts===0,'returning board rebuilt '+mounts+' times');check(refreshes===0,'chat redrawn '+refreshes+' times');
check(document.querySelector('.wb-canvas')===drawing,'drawing canvas retained');check(v.input.value==='Unsent idea','composer draft retained');check(!frame||frame.src===src,'scene frame retained');
WorkbenchUI.mount=mount;Native.refresh=refresh;
// Inactive controllers keep the complete values API without constructing 5,000 rows.
const raw=Array.from({length:5000},(_,i)=>`const raw${i}=${i+2};`).join('\n')+'\nconst SENTINEL_VALUE=8192;';
const ctl=ThreeTweaks.controller({send:()=>{},rerun:()=>{},commit:()=>{}});ctl.prepare(raw);
check(ctl.el.querySelectorAll('.tw-row').length===0,'inactive layer built controls');document.body.append(ctl.el);ctl.showUI();
check(ctl.el.querySelectorAll('.tw-row').length<=120,'raw controls unbounded');check(ctl.find('SENTINEL_VALUE')>0,'search cannot reach unmounted values');
ctl.destroy();ctl.el.remove();
// Save a real off-thread Three.js banner, then display its poster without a worker.
await ProjectWorkspace.home();const dialog=await ProjectFrontpage.edit(p);
await until(()=>{if(dialog.querySelector('.pw-banner-preview').dataset.error)throw Error(dialog.querySelector('.pw-banner-preview').dataset.error);return dialog.querySelector('canvas[data-ready=true]');},'banner worker did not draw');
await smoke({shot:window.SMOKE_SAVES+'/banner-editor.png'});
[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Save banner').click();
await until(()=>!dialog.isConnected,'banner save failed');await ProjectsHome.paint();await wait(150);
const cover=document.querySelector(`[data-project="${p.id}"] .pj-cover`);check(cover?.querySelector('img')?.src.startsWith('data:image/png'),'saved poster missing');check(cover.querySelector('.pw-banner-edit'),'banner button lost');check(!cover.querySelector('canvas'),'gallery spawned idle animation');
await smoke({shot:window.SMOKE_SAVES+'/project-banners.png'});
// No destructive migration: same existing linked project, repeat stays empty.
const originalChat=JSON.stringify(await hub.getChat(p.workspace.chatId)),originalScene=JSON.stringify(ThreeLab.scenes.get(p.workspace.sceneId));
await ProjectWorkspace.importScenes({quiet:true});check((await ProjectWorkspace.importScenes({quiet:true})).length===0,'import duplicated projects');
check(JSON.stringify(await hub.getChat(p.workspace.chatId))===originalChat,'import changed chat');check(JSON.stringify(ThreeLab.scenes.get(p.workspace.sceneId))===originalScene,'import changed scene');
const related={id:c.agentId+'-related-fixture',agentId:c.agentId,title:'Original conversation',messages:[{role:'user',text:'Keep this original work'}],createdAt:Date.now(),updatedAt:Date.now(),session:{}};
await hub.saveChat(related);Native.adopt(related,{openIt:false});Projects.add(p,'chat',related.id,related.title,{links:false});
await Projects.openItem({type:'chat',ref:related.id});check(ProjectWorkspace.current()===p&&H.activeChat[c.agentId]===related.id,'related chat lost project context');
await ProjectWorkspace.conversation(p,p.workspace.chatId);check(v.input.value==='Unsent idea','related conversation overwrote draft');await ProjectWorkspace.home();
return {pass:true,boardMounts:mounts,chatRefreshes:refreshes,banner:true,rawValuesSearch:true,draft:true,idempotentImport:true};

