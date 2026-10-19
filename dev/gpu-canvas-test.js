const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),C=require('../gpu52-core');
const settings={gpuCanvasBackend:'graphite'},flags=d=>Object.fromEntries(d.switches);
const d=C.decide({platform:'win32',settings});assert.equal(flags(d)['enable-features'],'SkiaGraphite');assert.equal(d.marker.key,'auto+graphite');
for(const platform of ['darwin','linux'])assert.equal(flags(C.decide({platform,settings}))['enable-features'],undefined,'other platforms keep their default');
for(const state of ['pending','failed']){const next=C.decide({platform:'win32',settings,marker:{key:d.marker.key,state}});assert.equal(next.canvas,'auto');assert.equal(flags(next)['enable-features'],undefined);}
assert.equal(flags(C.decide({platform:'win32',settings,argv:['--disable-features=SkiaGraphite']}))['enable-features'],undefined);
assert.equal(flags(C.decide({platform:'win32',settings,argv:['--disable-gpu']}))['enable-features'],undefined);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hearth-canvas-')),switches={'enable-features':'ExistingFeature'},app={commandLine:{getSwitchValue:n=>switches[n]||'',appendSwitch:(n,v)=>switches[n]=v}};
require('../gpu52main').early(app,{settings,dataDir:dir,platform:'win32',argv:[]});assert.equal(switches['enable-features'],'ExistingFeature,SkiaGraphite');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'gpu52.json'))).state,'pending');
console.log('Canvas backend: explicit Windows choice, Mac/Linux defaults, driver failure fallback, external disables, existing feature flags and startup marker passed.');
