const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),C=require('../project-workspace-core'),{cachePaper}=require('./clink-performance');
const html=fs.readFileSync(require.resolve('../tools/three-sandbox.html'),'utf8'),cap=html.match(/function capOk\(t\) \{[\s\S]*?\n\}/)[0];
for(const hz of [60,75,100,120,144,165,240]){
 const ctx={};vm.createContext(ctx);vm.runInContext('let fpsCap=60,capT=-1,capNext=-1;'+cap+';globalThis.accept=capOk;',ctx);let n=0;
 for(let i=0;i<hz*10;i++){const t=i*1000/hz;if(ctx.accept(t)){n++;assert(ctx.accept(t),'same-frame layers must render together');}}
 assert(Math.abs(n-600)<=1,`${hz} Hz produced ${n/10} fps`);
}
const banner=C.banner({lettering:{font:'bad',tracking:999,depth:100,tilt:Infinity},elements:[{shape:'bolt',name:'Ray',motion:'spin'}]});
assert.equal(banner.lettering.font,'heavy');assert.equal(banner.lettering.depth,20);assert.equal(banner.lettering.tracking,.12);assert.equal(banner.lettering.tilt,0);assert.equal(banner.elements[0].shape,'bolt');
assert.throws(()=>cachePaper('different game'));assert.equal(cachePaper('// CLINK_PAPER_CACHE_V1'),'// CLINK_PAPER_CACHE_V1');
const media=fs.readFileSync(require.resolve('../tools/three-media.js'),'utf8'),toggle=media.slice(media.indexOf('    function toggle(force) {'),media.indexOf('    function seek(t) {'));
const state={st:{bytes:null},picked:0,pick(){state.picked++;},seekFlush(){},performance:{now:()=>0},hooks:{},send(){}};vm.createContext(state);vm.runInContext('let wish;'+toggle,state);state.toggle(false);assert.equal(state.picked,0);state.toggle();assert.equal(state.picked,1);
console.log('Frame cap holds 60 fps across 60–240 Hz; editable logo bounds and guarded Clink cache pass.');
