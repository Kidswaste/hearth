// Real decoder/contact sheets and UI; synthetic Astra replies, no user data or paid model calls.
const check=(v,m)=>{if(!v)throw Error(m);},wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,m)=>{for(let n=0;n<1800;n++){if(await fn())return;await wait(100);}throw Error(m());};
await Lazy.load('projects');await Projects.ready();
const p=await ProjectWorkspace.create({name:'Adaptive flower feedback',plugins:[]});
await Lazy.load('visualfeedback');
let d=await VisualFeedback.open(window.FEEDBACK_FIXTURE);
const ask=()=>[...d.querySelectorAll('button')].find(b=>b.textContent.includes('Ask Astra'));
const scope=()=>d.querySelector('[aria-label="Review scope"]');
const status=()=>d.querySelector('.vf-status').textContent;
const choose=mode=>{scope().value=mode;scope().dispatchEvent(new Event('change'));};
check(scope().value==='auto','Auto is not the default');
const complete=async()=>{const h=await hub.kvGet('visual-feedback',{reviews:[]});return !ask().disabled&&h.reviews[0]?.meta?.complete?h.reviews[0]:null;};
ask().click();ask().click();await until(complete,()=>status());
let a=(await hub.kvGet('visual-feedback')).reviews[0];
check(a.meta.mode==='auto'&&a.meta.turns===2,'Auto did not use exactly two replies');
check(a.meta.passes.length===2&&a.packet.stage==='final','No consolidated final');
check(a.packet.prior[0].issues.every(q=>q.evidence.every(n=>a.packet.frames[n-1])),'Prior evidence labels not remapped');
check(a.packet.frames.length>12,'No close-up frames');
check(a.packet.frames.some((f,i)=>i&&f.frame===a.packet.frames[i-1].frame+1),'No consecutive frames');
check(d.querySelector('.vf-passes').textContent.includes('Coverage'),'Coverage missing');
await smoke({shot:window.SMOKE_SAVES+'/auto-results.png'});
// (round 88, checkfix88) The expected budget comes from the clip's own frame count, not a fixed 60: this check was written
// on a 2 s / 60-frame take, but the runner hands it the shared 6 s / 180-frame test video (dev/make-test-videos.sh), and
// the app rightly budgets that one as 4 batches / 6 replies. Batches are worked out here independently of the app's
// deepPlan: 48 consecutive frames each, the next one starting 46 later (2 frames of overlap), the last one cut at the end.
const N=(await FrameRead.info(window.FEEDBACK_FIXTURE)).frames;
check(Number.isInteger(N)&&N>48&&N<=600,'Test clip frame count unusable for a deep review: '+N);
const want=[];for(let s=0;s<N;s+=46){want.push(Math.min(48,N-s));if(s+48>=N)break;}
const cost=()=>d.querySelector('.vf-cost').textContent;
choose('deep');await until(()=>!ask().disabled,()=>status());
check(cost().includes(`all ${N} frames`),'Deep budget not shown before sending: '+cost());
check(cost().includes(`${want.length} consecutive batches`)&&cost().includes(`${want.length+2} Astra replies`),'Deep reply budget wrong: '+cost());
ask().click();await until(async()=>{const v=await complete();return v?.meta.mode==='deep';},()=>status());
const deep=(await hub.kvGet('visual-feedback')).reviews[0];
check(deep.meta.turns===want.length+2&&deep.meta.seenFrames.length===N,'Deep did not include all decoded frames: '+deep.meta.turns+' turns, '+deep.meta.seenFrames.length+'/'+N);
check(deep.meta.passes.filter(p=>p.stage==='deep-batch').map(p=>p.frames).join(',')===want.join(','),'Deep batches wrong: '+deep.meta.passes.map(p=>p.stage+':'+p.frames).join(' '));
check(deep.packet.coverage.includes(`every one of ${N}`),'Full coverage not labelled');
check(!VisualFeedback.busy,'Review stayed busy');
await smoke({shot:window.SMOKE_SAVES+'/deep-results.png'});
// Stop after overview, while locally preparing a batch; never send the next paid turn.
d.close();d=await VisualFeedback.open(window.FEEDBACK_FIXTURE);choose('deep');await until(()=>!ask().disabled,()=>status());
const original=FrameRead.frames;let release;
FrameRead.frames=(file,wants,opts)=>wants.frames.length===N?new Promise(r=>{release=r;}):original(file,wants,opts);
ask().click();await until(()=>release,()=>status());
check(VisualFeedback.busy && await Updater.run({ask:false})===null,'Updater did not protect a running feedback round');
[...d.querySelectorAll('button')].find(b=>b.textContent==='Stop').click();release([]);FrameRead.frames=original;
await until(()=>!ask().disabled&&!VisualFeedback.busy,()=>status());
const partial=(await hub.kvGet('visual-feedback')).reviews[0];
check(partial.meta.complete===false&&partial.meta.turns===1,'Cancelled deep review lost partial state or sent another reply');
check(status().includes('Partial review kept'),'Partial state not explained');
d.close();d=await VisualFeedback.open(window.FEEDBACK_FIXTURE);
[...d.querySelectorAll('button')].find(b=>b.textContent==='Previous review').click();await wait(300);
check(d.querySelector('.vf-passes').textContent.includes('Partial review'),'Reopened partial review claims completion');
// Unsupported deep input is blocked before an AI turn; changing back remains usable.
const oldInfo=FrameRead.info;FrameRead.info=async()=>({frames:601,duration:21,exact:true});choose('deep');await wait(150);
check(ask().disabled&&d.querySelector('.vf-cost').textContent.includes('shorter'),'Oversized deep review not blocked');
FrameRead.info=oldInfo;choose('auto');check(!ask().disabled,'Auto stuck disabled after deep limit');
return {ok:true,autoReplies:2,deepReplies:want.length+2,allFrames:N,deepBatches:want,partialReviewKept:true,cancelStartsNoLaterTurn:true,deepBudgetVisible:true};
