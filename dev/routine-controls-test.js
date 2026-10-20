const assert=require('node:assert/strict'),C=require('../routines-core');
const now=Date.now(),make=()=>C.normalize({agentId:'a',chatId:'c',how:{kind:'forever'},cap:100000});
let r=make();assert.equal(C.readyStep(r,{now}),null);
for(const ctx of [{busy:true},{queued:true},{draft:true},{askFirst:true}])assert(C.readyStep(make(),{now,...ctx}),'Local wait must not need a provider read');
r=make();r.lastEnd=now;assert.equal(C.readyStep(r,{now}).act,'wait');
r.kickoff=false;r.lastEnd=now-5000;r.pause='1m';assert.equal(C.readyStep(r,{now}).act,'wait');
r=make();r.how={kind:'rounds',rounds:2};r.round=2;assert.equal(C.readyStep(r,{now}).act,'stop');
r=make();r.endAt=now-1;assert.equal(C.readyStep(r,{now}).act,'stop');
r=make();C.sent(r,now);C.stop(r);assert(r.inFlight,'Stopping further rounds must keep the final reply marked in flight');
C.roundEnded(r,{type:'done',text:'Changed: final fix.',usage:C.usageOf({input:100,output:20}),tokens:120},now+1000);
assert.equal(r.status,'stopped');assert.equal(r.inFlight,false);assert.equal(r.tokens,120);
r=make();C.sent(r);C.stop(r);r=C.normalize(JSON.parse(JSON.stringify(r)));C.restarted(r);assert.equal(r.status,'stopped');assert.equal(r.inFlight,false,'Restart clears a stopped process without resuming it');
for(const status of ['running','stopped']){
 r=make();r.status=status;r.feedback={projectId:'p',sceneId:'s',seconds:6,direction:'Edges'};r.feedbackActive=true;r.feedbackCalls=2;r.feedbackLastEnd=now;r.afterRestart=true;
 r=C.normalize(JSON.parse(JSON.stringify(r)));C.restarted(r);
 assert.equal(r.feedbackActive,false);assert.equal(r.feedbackCalls,2);assert.equal(r.feedback.seconds,6);assert(r.usageUnknown);
 assert.equal(r.status,status==='running'?'paused':'stopped');
}
console.log('Auto-improve controls: local waits, terminal gates, final-reply accounting and stopped/reviewer restart cleanup passed.');
