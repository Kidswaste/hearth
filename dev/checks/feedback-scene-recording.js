// Isolated real canvas recording/decoding, no paid model call, no user data.
const check = (v,m) => { if (!v) throw Error(m); }, wait = ms => new Promise(r => setTimeout(r,ms));
const until = async (fn,m) => { for(let i=0;i<900;i++){if(await fn())return;await wait(100);}throw Error(m()); };
await Lazy.load('projects'); await Projects.ready();
const p = await ProjectWorkspace.create({name:'Canvas feedback fixture',plugins:[]});
await ProjectWorkspace.go('scene'); await wait(1500);
const scene = ProjectWorkspace.currentScene(), saved = JSON.stringify(ThreeLab.scenes.get(scene));
await ProjectWorkspace.go('chat');
await Lazy.load('visualfeedback');
const ctx = await VisualFeedback.context(); check(ctx.sceneId===scene,'Context lost the project scene in chat');
const cmd = await ThreeLab.cmd({show:false});
const beforeMessages = (await Native.load(ctx.chatId)).messages.length;
let d = await VisualFeedback.open();
const record = () => d.querySelector('.vf-record'), status = () => d.querySelector('.vf-status').textContent;
check(record(),'No record scene button');
record().click(); record().click();
await until(() => /Scene captured|empty clip|failed|Nothing|changed|not responding/.test(status()), () => 'Recording did not finish: '+status());
check(/Scene captured/.test(status()),status());
check(d.querySelectorAll('.vf-frame').length===12,'No prepared overview');
const file = d.querySelector('[aria-label="Video to review"]').value;
check(/feedback.*\.(mp4|webm)$/i.test(file),'Clip not selected automatically');
const info = await FrameRead.info(file);
check(info.duration>=4 && info.duration<15,'Wrong clip duration: '+info.duration);
const added = p.items.filter(x=>x.type==='capture'&&x.ref===file);
check(added.length===1,'Duplicate take or missing project capture');
check(!cmd.recording,'Scene recorder still busy');
check((await Native.load(ctx.chatId)).messages.length===beforeMessages,'Recording sent a chat turn');
check(!(await hub.kvGet('visual-feedback',{reviews:[]})).reviews?.length,'Recording used AI automatically');
const diff = await FrameRead.diff(file, 2, Math.max(3,info.frames-3));
check(diff.score>0.00001,'Recorded image is not moving: '+diff.score);
await smoke({shot:window.SMOKE_SAVES+'/recorded-ready.png'});
// Closing a recording cancels only that take and never opens Save As. A retry remains usable.
record().click(); await until(()=>cmd.recording,()=>status()); d.close();
await wait(1200); check(!cmd.recording,'Closing Feedback left the recorder running');
const retry = await cmd.recordClip({seconds:2}); check(retry.buffer.byteLength>1000,'Retry after cancel produced no video');
check(p.items.filter(x=>x.type==='capture').length===1,'Cancelled take added a project capture');
check(JSON.stringify(ThreeLab.scenes.get(scene))===saved,'Recording modified scene data');
// A stale project/scene cannot silently record another project.
let error=''; try {await VisualFeedback.recordScene({...ctx,sceneId:'not-this-scene'},6,new AbortController().signal);}catch(e){error=e.message;}
check(/changed/.test(error),'Stale scene not rejected');
// A take already owned by another caller must keep running.
const own = new AbortController(), pending = cmd.recordClip({seconds:6,signal:own.signal}).catch(e=>e.message);
await wait(300); error='';try{await VisualFeedback.recordScene(ctx,6,new AbortController().signal);}catch(e){error=e.message;}
check(/current recording/.test(error)&&cmd.recording,'Existing recording interrupted'); own.abort(); await pending;
return {ok:true,file,seconds:info.duration,frames:info.frames,movement:diff.score,preparedFrames:12,noAIUsage:true,cancellation:true,ownership:true,sceneUnchanged:true};
