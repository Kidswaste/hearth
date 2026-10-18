// Minimal synthetic versions of the public markup verified on 2026-10-18.
const V = require('../showsync-venues');
const C = require('../showsync-core');
function fixtures(now=Date.now()) {
  const date=new Date(now+3*86400e3),parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(x=>[x.type,x.value]));
  const p=[+parts.year,+parts.month,+parts.day],formatted=`${parts.day}.${parts.month}.${parts.year}`,short=`${parts.day}-${parts.month}-${parts.year.slice(2)}`;
  const urls={},responses={},add=(url,body,headers={})=>responses[url]={body,headers:{'content-type':'text/html',...headers}};
  for(const [i,src] of V.sources().entries()) {
    const cfg=V.config(src),url=new URL(cfg.slug==='glazart'?`/${short}-fixture-night/`:(cfg.slug==='kilometre25'?'/evenement/':cfg.prefix)+'fixture-night/',src.url).href;
    urls[cfg.slug]=url;
    const title=`Fixture ${cfg.name} night`,ticket=`https://shotgun.live/events/fixture-${cfg.slug}`;
    let fields=cfg.slug==='badaboum'?`<div class="date">${formatted}</div><div class="heure">23h30 - 06h00</div><h1>${title}</h1>`:cfg.slug==='mia-mao'?`<span class="c-date">${formatted} — 23:30</span><span class="c-record_title || c-heading">${title}</span><span>23:30 - 06:00</span>`:`<p>Friday ${formatted} &gt; 23H30 – 06H00</p><p>${title}</p>`;
    if(cfg.slug==='la-machine')fields=`<h1 class="entry-title">${title}</h1><time datetime="${parts.year}-${parts.month}-${parts.day}T23:30:00+00:00"></time><div id="tyevtagenda">23H30 — 06H00</div>`;
    if(cfg.slug==='kilometre25')fields=`<h1>${title}</h1><div class="text-block-3">${formatted}</div>`;
    add(src.url,`<main><a href="${url}">${formatted} ${title}</a></main>`);
    add(url,fields+`<div id="lienheadtevt"><a href="${ticket}">Tickets</a></div>`,{etag:'"venue-v1"'});
    add(new URL('/robots.txt',src.url).href,'User-agent: *\nAllow: /',{'content-type':'text/plain'});
    add(C.nominatimUrl(cfg.address),JSON.stringify([{lat:String(48.86+i*.01),lon:String(2.37+i*.01)}]),{'content-type':'application/json'});
  }
  return {responses,urls,start:V.parisTime(p,[23,30]),parts:p};
}
module.exports={fixtures};
