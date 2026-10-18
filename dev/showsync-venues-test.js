const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const V=require('../showsync-venues'),C=require('../showsync-core'),M=require('../showsyncmain'),F=require('./showsync-fixtures'),PF=require('./showsync-programme-fixtures');
const now=Date.parse('2026-10-18T12:00:00Z'),f=PF.fixtures(now),srcs=V.sources();
let checks=0;const check=(name,fn)=>{fn();checks++;};
check('Paris summer/winter clocks independent of host time zone',()=>{assert.equal(V.parisTime([2026,10,22],[18,0]),Date.parse('2026-10-22T16:00:00Z'));assert.equal(V.parisTime([2026,10,26],[18,0]),Date.parse('2026-10-26T17:00:00Z'));assert.ok(Number.isNaN(V.parisTime([2026,3,29],[2,30])));assert.ok(Number.isNaN(V.parisTime([2026,2,30],[12,0])));});
check('French dates',()=>{assert.deepEqual(V.dateParts('22 Oct, 2026'),[2026,10,22]);assert.deepEqual(V.dateParts('7 décembre 2026'),[2026,12,7]);assert.deepEqual(V.dateParts('25.10.26'),[2026,10,25]);});
for(const src of srcs){const cfg=V.config(src),url=f.urls[cfg.slug],html=f.responses[url].body;
  check(cfg.slug+' listing is bounded and same-origin',()=>{assert.equal(V.listing(f.responses[src.url].body,src,now).length,1);assert.equal(V.listing(`<a href="https://evil.example/show/one/">22 Oct, 2026</a>`,src,now).length,0);assert.equal(V.detailUrl(new URL(url).origin+'/account/',src),'');assert.equal(V.detailUrl(url+'?redirect=elsewhere',src),'');});
  check(cfg.slug+' explicit time, overnight end, ticket and provenance',()=>{const e=V.event(html,src,url,now);assert.equal(e.start,f.start);assert.equal(e.end-e.start,6.5*3600e3);assert.equal(e.price,null);assert.equal(e.programme.url,url);assert.equal(e.programme.checkedAt,now);assert.equal(e.platform,'shotgun');assert.ok(!Number.isFinite(e.venue.lat));});
  check(cfg.slug+' missing time/ticket is never invented',()=>{assert.equal(V.event(html.replace(/23[h:]/gi,'xx:'),src,url,now),null);assert.equal(V.event(html.replace('https://shotgun.live/events/','https://example.com/events/'),src,url,now),null);assert.equal(V.event('<title>Vercel Security Checkpoint</title>'+html,src,url,now),null);});
}
check('direct sold-out/cancelled information beats unknown programme stock',()=>{const e=V.event(f.responses[f.urls.badaboum].body,srcs[0],f.urls.badaboum,now),direct={...e,programme:undefined,soldOut:true,cancelled:true,price:{from:12,currency:'EUR'}};for(const list of [[e,direct],[direct,e]]){const merged=C.merge([list]);assert.equal(merged.length,1);assert.equal(merged[0].soldOut,true);assert.equal(merged[0].cancelled,true);assert.equal(merged[0].programme,undefined);}});
check('Vercel challenge at HTTP 200 is recognized',()=>assert.equal(C.looksBlocked('<title>Vercel Security Checkpoint</title>'),true));
check('broad city catalogue',()=>assert.equal(C.defaultSources()[0].url,'https://shotgun.live/en/cities/paris'));
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hearth-programme-test-'));let clock=now,hits=[],overrides={...f.responses,[C.PLATFORMS.shotgun.city]:{status:429,body:'<title>Vercel Security Checkpoint</title>'}};
  const make=()=>M.create({dataDir:dir,fetch:(u,o)=>F.fakeFetch({now,overrides,hits})(u,o),shrink:async b=>b,wait:async()=>{},now:()=>clock});
  let S=make(),snap=await S.refresh();
  check('challenged Shotgun still produces three programme venues on map',()=>{const shows=snap.shows.filter(s=>s.programme),pins=C.pins(C.venues(C.thisWeek(shows,clock)));assert.equal(shows.length,3);assert.equal(pins.length,3);assert.ok(shows.every(s=>Number.isFinite(s.venue.lat)));assert.ok(snap.sources.find(s=>s.url===C.PLATFORMS.shotgun.city).problem==='blocked');});
  check('venue programmes respect original source opt-out',()=>assert.equal(snap.from,'paris'));
  hits=[];await S.refresh({force:true});check('same-day button causes no repeated source requests',()=>assert.ok(hits.every(h=>h.url.startsWith('https://nominatim.openstreetmap.org/'))));
  clock+=21*3600e3;hits=[];overrides[f.urls.badaboum]={status:304,headers:{etag:'"venue-v1"'}};S=make();snap=await S.refresh();
  check('cache restart and conditional details keep dates/pins',()=>{assert.equal(snap.shows.filter(s=>s.programme).length,3);assert.equal(hits.find(h=>h.url===f.urls.badaboum).headers['If-None-Match'],'"venue-v1"');assert.equal(snap.shows.find(s=>s.programme?.name==='Badaboum').programme.checkedAt,clock);assert.ok(!hits.some(h=>h.url.startsWith('https://shotgun.live/')));});
  clock+=21*3600e3;overrides[f.urls.badaboum]={status:503};snap=await S.refresh();
  check('detail failure keeps last good event with original checked date',()=>{const s=snap.shows.find(s=>s.programme?.name==='Badaboum');assert.ok(s);assert.equal(s.programme.checkedAt,clock-21*3600e3);assert.equal(snap.sources.find(s=>s.id===srcs[0].id).problem,'partial');});
  await S.setSettings({from:'followed'});check('followed-only really excludes the recovery sources',()=>assert.equal(S.snapshot().shows.length,0));
  const dir2=fs.mkdtempSync(path.join(os.tmpdir(),'hearth-programme-deny-'));hits=[];
  overrides={...f.responses,'https://badaboum.paris/robots.txt':{body:'User-agent: *\nDisallow: /'}};
  const deny=M.create({dataDir:dir2,fetch:(u,o)=>F.fakeFetch({now,overrides,hits})(u,o),shrink:async b=>b,wait:async()=>{},now:()=>now});await deny.refresh();
  check('robots refusal stops programme and all details',()=>assert.ok(!hits.some(h=>h.url.startsWith('https://badaboum.paris/')&&!h.url.endsWith('robots.txt'))));
  const dir3=fs.mkdtempSync(path.join(os.tmpdir(),'hearth-programme-upgrade-')),legacy=C.sourceFromUrl('https://shotgun.live/en/concerts/paris'),cached=C.emptyCache();
  C.applyResult(cached,legacy,{ok:true,status:200,shows:C.parsePage(F.fillDates(fs.readFileSync(path.join(F.DIR,'shotgun-paris.html'),'utf8'),now),legacy).shows,etag:'old-url-etag'},now);
  cached.hosts={'shotgun.live':{blockedUntil:now+86400e3,status:429}};
  fs.mkdirSync(path.join(dir3,'showsync'));fs.writeFileSync(path.join(dir3,'showsync','cache.json'),JSON.stringify(cached));fs.writeFileSync(path.join(dir3,'showsync','settings.json'),JSON.stringify({enabled:true,from:'paris',follows:[]}));
  const upgrade=M.create({dataDir:dir3,fetch:(u,o)=>F.fakeFetch({now,overrides:f.responses,hits})(u,o),shrink:async b=>b,wait:async()=>{},now:()=>now});
  check('new sources trigger a refresh on an existing installation',()=>assert.equal(upgrade.snapshot().stale,true));
  const upgraded=await upgrade.refresh();
  check('concerts-to-city migration preserves old shows during host cooldown',()=>{assert.ok(upgraded.shows.some(s=>s.title.includes('Ben UFO')));assert.equal(upgrade._stores['cache.json'].value.sources[C.defaultSources()[0].id].etag,null);assert.equal(upgraded.shows.filter(s=>s.programme).length,3);});
  // Clean only the absolute temporary directories just created by this test.
  for(const d of [dir,dir2,dir3]){assert.ok(d.startsWith(path.join(os.tmpdir(),'hearth-programme-')));fs.rmSync(d,{recursive:true,force:true});}
  console.log(JSON.stringify({pass:true,checks}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
