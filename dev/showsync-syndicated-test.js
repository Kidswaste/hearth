const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const S=require('../showsync-syndicated'),C=require('../showsync-core'),M=require('../showsyncmain'),F=require('./showsync-fixtures'),SF=require('./showsync-syndicated-fixtures');
const now=Date.parse('2026-10-18T12:00:00Z'),f=SF.fixtures(now),srcs=S.sources(),rex=srcs[0],phantom=srcs[1],madame=srcs[2];
let checks=0;const check=(name,fn)=>{fn();checks++;};
const parse=(rows,src=rex)=>S.parse({total_count:rows.length,results:rows},src,now);
check('published dates, venue, coordinates, ticket and attribution',()=>{const [s]=parse(f.records.rex);assert.equal(s.venue.lat,48.870573);assert.equal(s.url,'https://shotgun.live/events/fixture-rex');assert.equal(s.programme.updatedAt,now-3*86400e3);assert.equal(s.programme.checkedAt,now);assert.equal(s.price,null);assert.equal(s.end-s.start,6*3600e3);});
check('Madame Loyal: future Paris festival in; Rennes out',()=>{const shows=parse(f.records['madame-loyal'],madame);assert.equal(shows.length,1);assert.equal(shows[0].title,'Madame Loyal Paris');assert.ok(shows[0].url.includes('/festivals/'));});
check('Phantom lookahead survives the old 21-day cut',()=>assert.ok(parse(f.records.phantom,phantom)[0].start>now+21*86400e3));
check('venue rows distinguish same weekday nights by calendar date',()=>{const a=parse(f.records.phantom,phantom)[0],b={...a,start:a.start+7*86400e3};assert.notEqual(C.showWhen(a),C.showWhen(b));assert.match(C.showWhen(a),/14:00|13:00/);});
check('wrong agenda and similarly named locations excluded',()=>{assert.equal(parse([{...f.records.rex[0],originagenda_uid:'other'}]).length,0);assert.equal(parse([{...f.records.rex[0],location_name:'RED CLUB'}]).length,0);assert.equal(parse([{...f.records['madame-loyal'][0],title_fr:'Madame Loyale'}],madame).length,0);});
check('cancelled and expired events excluded',()=>{assert.equal(parse([{...f.records.rex[0],status:'{"id":2}'}]).length,0);assert.equal(parse([f.record('old','Rex Club',-3)]).length,0);});
check('bad shapes/times/coordinates/links fail closed instead of erasing cache',()=>{for(const data of [{results:[]},{total_count:1,results:[]},null])assert.throws(()=>S.parse(data,rex,now));for(const extra of [{timings:'broken'},{timings:'[]'},{location_coordinates:null},{status:'{}'},{registration:'[{"type":"link","value":"https://shotgun.live.evil.test/events/foo"}]'},{canonicalurl:'https://evil.test/shotgun/events/foo'}])assert.throws(()=>parse([{...f.records.rex[0],...extra}]));});
check('multi-session festival remains one ticket with real outer dates',()=>{const row={...f.records['madame-loyal'][0],timings:JSON.stringify([{begin:'2026-10-24T18:00:00+02:00',end:'2026-10-25T02:00:00+02:00'},{begin:'2026-10-25T18:00:00+01:00',end:'2026-10-26T04:00:00+01:00'}])};const [s]=parse([row],madame);assert.equal(s.start,Date.parse('2026-10-24T16:00:00Z'));assert.equal(s.end,Date.parse('2026-10-26T03:00:00Z'));});
check('real ticket-platform stock overrides syndicated unknown stock without duplicates',()=>{const [s]=parse(f.records.rex);for(const pair of [[s,{...s,programme:undefined,soldOut:true}],[{...s,programme:undefined,soldOut:true},s]]){const merged=C.merge([pair]);assert.equal(merged.length,1);assert.equal(merged[0].soldOut,true);}});
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hearth-syndication-'));let clock=now,hits=[],mode='good';
 const fetch=async(u,o)=>{if(u.startsWith(S.API)){
   if(mode==='offline')throw Error('offline');
   if(mode==='blocked'){hits.push({url:u});return new Response('',{status:429});}
   if(mode==='bad'){hits.push({url:u});return new Response('{"results":[]}');}
   if(mode==='empty'){hits.push({url:u});return new Response('{"total_count":0,"results":[]}');}
   if(mode==='paged') {hits.push({url:u});const offset=+new URL(u).searchParams.get('offset');return new Response(JSON.stringify({total_count:1000,results:[{...f.records.rex[0],uid:'page-'+offset}]}));}
 }return F.fakeFetch({now:clock,overrides:{$syndicated:true},hits})(u,o);};
 const make=()=>M.create({dataDir:dir,fetch,shrink:async b=>b,wait:async()=>{},now:()=>clock});let app=make(),snap=await app.refresh();
 check('three recovery events and pins without geocoding, including 45-day Phantom',()=>{const recovered=snap.shows.filter(s=>s.programme?.syndicated);assert.equal(recovered.length,3);assert.equal(C.pins(C.venues(recovered)).length,3);assert.ok(recovered.some(s=>s.venue.name==='Phantom Paris'));});
 hits=[];await app.refresh({force:true});check('refresh button respects minimum gap',()=>assert.equal(hits.filter(h=>h.url.startsWith(S.API)).length,0));
 clock+=21*3600e3;app=make();mode='offline';snap=await app.refresh();
 check('restart/offline keeps last good dates and checked time',()=>{assert.equal(snap.shows.filter(s=>s.programme?.syndicated).length,3);assert.equal(snap.shows.find(s=>s.programme?.syndicated).programme.checkedAt,now);assert.ok(snap.sources.find(s=>s.id===rex.id).problem);});
 clock+=21*3600e3;mode='bad';snap=await app.refresh();check('schema change retains cache',()=>assert.equal(snap.shows.filter(s=>s.programme?.syndicated).length,3));
 clock+=21*3600e3;mode='empty';snap=await app.refresh();check('validated empty really removes cancelled/unpublished cached dates',()=>assert.equal(snap.shows.filter(s=>s.programme?.syndicated).length,0));
 clock+=21*3600e3;mode='paged';hits=[];await app.refresh();check('pagination bounded to three requests per target',()=>assert.equal(hits.filter(h=>h.url.startsWith(S.API)).length,9));
 clock+=21*3600e3;mode='blocked';hits=[];await app.refresh();check('429 stops the entire API host for a day',()=>assert.equal(hits.filter(h=>h.url.startsWith(S.API)).length,1));
 clock+=11*60e3;hits=[];await app.refresh({force:true});check('manual retry cannot bypass cooldown',()=>assert.equal(hits.filter(h=>h.url.startsWith(S.API)).length,0));
 await app.setSettings({from:'followed'});check('source opt-out preserved',()=>assert.equal(app.sources().length,0));
 assert.ok(dir.startsWith(path.join(os.tmpdir(),'hearth-syndication-')));fs.rmSync(dir,{recursive:true,force:true});
 console.log(JSON.stringify({pass:true,checks}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
