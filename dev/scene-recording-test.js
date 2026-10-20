// Recorder ownership and cleanup contracts without a GPU (the Electron check records real frames).
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../tools/three-sandbox.html'),'utf8');
const block=html.slice(html.indexOf('let recorder = null;'),html.indexOf('// ---------- move with the music',html.indexOf('let recorder = null;')));
const events=[],takes=[],timers=new Map();let timerId=0,stoppedTracks=0;
class Recorder {
  static isTypeSupported(){return true;}
  constructor(){this.state='inactive';takes.push(this);}
  start(){this.state='recording';}
  stop(){this.state='inactive';this.ondataavailable({data:new Blob(['video'])});this.finished=this.onstop();}
}
const canvas={width:640,height:360,captureStream:()=>({getVideoTracks:()=>[{stop:()=>stoppedTracks++}]})};
const ctx=vm.createContext({MediaRecorder:Recorder,Blob,performance:{now:()=>100},post:m=>events.push(m),setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),lastRenderer:{domElement:canvas},SQ:{on:false},needsComposite:()=>false,mediaEl:null,liveSrc:null,compRec:null,recUntil:null});
vm.runInContext(block+'\nglobalThis.recTest={startRecording,stopRecording,current:()=>recorder};',ctx);
(async()=>{
 const r=ctx.recTest;
 r.startRecording({recordId:'feedback-first',maxSeconds:6});assert.equal(events.at(-1).recordId,'feedback-first');assert.equal(takes.length,1);
 r.startRecording({recordId:'feedback-other'});assert.equal(events.at(-1).type,'record-error');assert.equal(events.at(-1).recordId,'feedback-other');assert.equal(takes.length,1);
 r.stopRecording('feedback-other');assert.equal(takes[0].state,'recording');
 r.stopRecording('feedback-first');await takes[0].finished;assert.equal(stoppedTracks,1);assert.equal(r.current(),null);assert.equal(timers.size,0);assert.equal(events.at(-1).recordId,'feedback-first');assert.equal(events.at(-1).buffer.byteLength,5);
 r.startRecording({recordId:'feedback-timed',maxSeconds:6});[...timers.values()][0]();await takes[1].finished;assert.equal(events.at(-1).type,'recording');assert.equal(events.at(-1).recordId,'feedback-timed');
 r.startRecording({recordId:'feedback-error',maxSeconds:6});takes[2].onerror({error:Error('Encoder unavailable')});assert.equal(r.current(),null);assert.equal(timers.size,0);assert.equal(events.at(-1).type,'record-error');assert.equal(stoppedTracks,3);
 ctx.lastRenderer=null;r.startRecording({recordId:'feedback-empty'});assert.equal(events.at(-1).recordId,'feedback-empty');assert.match(events.at(-1).message,/Nothing is rendering/);assert.equal(takes.length,3);
 ctx.lastRenderer={domElement:canvas};r.startRecording();r.stopRecording();await takes[3].finished;assert.equal(events.at(-1).recordId,null);assert.equal(events.at(-1).type,'recording');
 console.log('Scene recorder checks passed: owned stop, duplicate refusal, timed finish, track/timer cleanup, encoder error, empty scene, manual recording.');
})().catch(e=>{console.error(e);process.exitCode=1;});
