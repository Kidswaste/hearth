// Explicit opt-in: one actual Astra reply on a synthetic clip, never a user's project data.
if(!window.FEEDBACK_LIVE)return 'Skipped: FEEDBACK_LIVE is required.';
await Lazy.load('visualfeedback');
const agent=H.agents().find(a=>a.engine==='codex'&&!a.dock);if(!agent)throw Error('No Astra agent');
agent.model='gpt-6-astra';agent.effort='high';
const packet=await VisualFeedback.prepare(window.FEEDBACK_FIXTURE,'overview',0,new AbortController().signal,()=>{});
const start=Date.now();
const result=await VisualFeedback.review(packet,{name:'Synthetic colour and movement study',messages:[]},'This is a synthetic decoder test pattern with colour blocks and moving shapes, not a finished artwork. Describe what is visible and suggest at most one modest visual-composition change. It is fine to report that the pattern is doing its job.',()=>{},new AbortController().signal);
await hub.fs.write(window.SMOKE_SAVES+'/live-review.json',JSON.stringify({model:agent.model,effort:agent.effort,ms:Date.now()-start,result,frames:packet.frames.map(f=>({frame:f.frame,time:f.time}))},null,2));
return {actualModelReview:true,model:agent.model,ms:Date.now()-start,result};
