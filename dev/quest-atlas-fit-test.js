const assert=require('node:assert/strict');
const Atlas=require('../tools/quest-atlas');
const points=[{lat:48.85,lon:2.31},{lat:48.89,lon:2.41},{lat:48.86,lon:2.36}];
for(const [width,height] of [[800,500],[320,330],[1600,900]]){
  const view=Atlas.fitBounds(points,width,height),center=Atlas.project(view.lat,view.lon,view.z);
  for(const p of points){const xy=Atlas.project(p.lat,p.lon,view.z);assert(Math.abs(xy[0]-center[0])<=width/2-47);assert(Math.abs(xy[1]-center[1])<=height/2-47);}
  assert(view.z>=11&&view.z<=16);
}
assert.equal(Atlas.fitBounds([],800,500),null);
assert.equal(Atlas.fitBounds([{lat:NaN,lon:2.3}],800,500),null);
assert.equal(Atlas.fitBounds(points,0,500),null);
const single=Atlas.fitBounds([points[0]],800,500);assert.equal(single.z,16);assert(Math.abs(single.lat-points[0].lat)<1e-8);
assert.deepEqual(Atlas.fitBounds([...points,{lat:NaN,lon:Infinity}],800,500),Atlas.fitBounds(points,800,500));
console.log('Map framing: desktop/mobile margins, single place, invalid/empty input passed.');
