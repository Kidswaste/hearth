// Shotgun's public OpenAgenda listings, distributed by the documented Explore API.
// Only public event facts are requested; no accounts, credentials or ticket stock.
const C = require('./showsync-core');
const DAY = 86400e3, DAYS = 180, LIMIT = 100, MAX_PAGES = 3;
const ORIGIN = 'https://public.opendatasoft.com';
const DATASET = 'evenements-publics-openagenda';
const PAGE = `${ORIGIN}/explore/dataset/${DATASET}/`;
const API = `${ORIGIN}/api/explore/v2.1/catalog/datasets/${DATASET}/records`;
const TARGETS = [
  { slug:'rex', name:'Rex Club', field:'location_name', query:'Rex Club', matches:r=>C.venueKey(r.location_name)===C.venueKey('Rex Club') },
  { slug:'phantom', name:'Phantom', field:'location_name', query:'Phantom', matches:r=>/^phantom(?: paris)?$/.test(C.fold(r.location_name)) },
  { slug:'madame-loyal', name:'Madame Loyal', field:'title_fr', query:'Madame Loyal', matches:r=>/\bmadame loyal\b/.test(C.fold(r.title_fr)) }
];
const FIELDS = 'uid,title_fr,originagenda_uid,timings,location_name,location_coordinates,location_city,location_address,status,registration,updatedat,canonicalurl';
const sources = () => TARGETS.map(t=>({id:'shotgun-openagenda-'+t.slug,platform:'shotgun',kind:'syndication',builtin:true,label:t.name+' · OpenAgenda',url:PAGE}));
const config = src => src?.url===PAGE && TARGETS.find(t=>src.id==='shotgun-openagenda-'+t.slug);
function url(src, now, offset=0) {
  const t=config(src); if(!t)throw Error('Unknown syndication source');
  const where=`originagenda_uid="9969608" AND search(${t.field}, "${t.query}") AND lastdate_end >= date'${new Date(now).toISOString().slice(0,10)}' AND firstdate_begin < date'${new Date(now+(DAYS+1)*DAY).toISOString().slice(0,10)}'`;
  return API+'?'+new URLSearchParams({select:FIELDS,where,limit:String(LIMIT),offset:String(offset),order_by:'firstdate_begin asc'});
}
const json = value => typeof value==='string' ? JSON.parse(value) : value;
function ticket(value) {
  const links=json(value); if(!Array.isArray(links))return '';
  for(const link of links)try {
    const u=new URL(link?.value);
    if(link.type==='link' && u.protocol==='https:' && u.hostname==='shotgun.live' && !u.username && !u.password && /^\/(?:[a-z]{2}\/)?(?:events|festivals)\/[\w-]+\/?$/.test(u.pathname))return u.origin+u.pathname.replace(/\/$/,'');
  } catch { /* not a ticket */ }
  return '';
}
function parse(data,src,now) {
  const t=config(src);
  if(!t || !data || !Number.isInteger(data.total_count) || data.total_count<0 || !Array.isArray(data.results) || data.results.length>LIMIT || data.total_count<data.results.length || (data.total_count>0&&!data.results.length))throw Error('OpenAgenda response changed');
  const shows=[];
  for(const r of data.results) {
    if(!r || typeof r.title_fr!=='string' || typeof r.location_name!=='string' || !r.uid || r.originagenda_uid===undefined)throw Error('OpenAgenda record changed');
    if(String(r.originagenda_uid)!=='9969608' || !t.matches(r))continue;
    const geo=r.location_coordinates;
    if(!geo || typeof geo.lat!=='number' || typeof geo.lon!=='number')throw Error('Missing published coordinates');
    if(!C.inParis(geo.lat,geo.lon))continue; // Madame Loyal is a travelling promoter, never a made-up Paris pin.
    const status=json(r.status);
    if(!Number.isInteger(status?.id))throw Error('Unknown event status');
    if(status.id!==1)continue; // only explicitly scheduled events; cancelled/postponed dates must disappear
    const link=ticket(r.registration); if(!link)throw Error('Missing Shotgun ticket');
    const times=json(r.timings);
    if(!Array.isArray(times)||!times.length||times.length>100)throw Error('Missing event dates');
    const spans=times.map(x=>({start:Date.parse(x.begin),end:Date.parse(x.end)}));
    if(spans.some(x=>!Number.isFinite(x.start)||!Number.isFinite(x.end)||x.end<=x.start))throw Error('Invalid event dates');
    // One festival ticket spans its published sessions, rather than duplicating it into daily quests.
    const start=Math.min(...spans.map(x=>x.start)),end=Math.max(...spans.map(x=>x.end));
    if(end<now||start>=now+DAYS*DAY)continue;
    const show=C.fromEvent({name:r.title_fr,startDate:new Date(start).toISOString(),endDate:new Date(end).toISOString(),url:link,location:{name:r.location_name,address:r.location_address||r.location_city,geo:{latitude:geo.lat,longitude:geo.lon}}},src);
    if(!show)throw Error('Unreadable event');
    let listing;try{listing=new URL(r.canonicalurl);}catch{throw Error('Missing source listing');}
    if(listing.protocol!=='https:'||listing.hostname!=='openagenda.com'||listing.username||listing.password||!/^\/(?:[a-z]{2}\/)?shotgun\/events\//.test(listing.pathname))throw Error('Invalid source listing');
    show.programme={name:'Shotgun via OpenAgenda',url:listing.href,checkedAt:now,updatedAt:Number.isFinite(Date.parse(r.updatedat))?Date.parse(r.updatedat):null,syndicated:true};
    shows.push(show);
  }
  return shows;
}
module.exports={sources,config,url,parse,ORIGIN,PAGE,API,DAYS,LIMIT,MAX_PAGES};
