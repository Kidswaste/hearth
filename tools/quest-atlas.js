// A small, dependency-free Web Mercator viewport. Tiles load only after an explicit
// opening of the Paris page; only visible tiles are requested. Chromium owns HTTP caching.
(function(root, make) { if(typeof module === 'object') module.exports=make(); else root.QuestAtlas=make(); })(typeof self !== 'undefined' ? self : this, () => {
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  function project(lat,lon,z){const n=256*2**z,r=clamp(lat,-85,85)*Math.PI/180;return [(lon+180)/360*n,(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n];}
  function unproject(x,y,z){const n=256*2**z;return [180/Math.PI*Math.atan(Math.sinh(Math.PI*(1-2*y/n))),x/n*360-180];}
  let view={lat:48.862,lon:2.35,z:12,enabled:true};
  // Original Forgeheart field-kit glyphs. User content never enters SVG markup.
  function icon(kind) {
    const paths={
      music:'M9 18V5l11-2v13M9 8l11-2M9 18c0 4-6 4-6 1s6-4 6-1M20 16c0 4-6 4-6 1s6-4 6-1',
      visual:'m12 2 9 5v10l-9 5-9-5V7Zm0 10v10M3 7l9 5 9-5M7 5l10 5v5',
      social:'M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M16 5a3 3 0 0 1 0 6M2 21v-3a6 6 0 0 1 12 0v3M17 14a5 5 0 0 1 5 5v2',
      game:'M7 6h10c3 0 5 13 2 14l-5-4h-4l-5 4C1 21 3 6 7 6ZM7 10v5M5 12h5M16 11h.1M19 14h.1',
      reset:'M5 8h12v9a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Zm12 1h2a3 3 0 0 1 0 6h-2M8 2v3M13 2v3',
      travel:'M5 17V5q0-3 7-3t7 3v12ZM5 8h14M9 17l-4 5M15 17l4 5M8 13h.1M16 13h.1',
      star:'m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z',
      compass:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 5-3 7-7 3 3-7Z',
      gift:'M3 10h18v4H3ZM5 14v8h14v-8M12 10v12M12 10C1 10 4 0 9 4Zm0 0c11 0 8-10 3-6Z',
      calendar:'M3 5h18v17H3ZM7 2v6M17 2v6M3 11h18M8 15h2M14 15h2M8 19h2',
      plus:'M12 4v16M4 12h16', edit:'m3 17 1 5 5-1L22 8l-6-6Zm11-13 6 6M3 17l6 4',
      check:'m4 12 5 5L20 5', list:'M9 5h13M9 12h13M9 19h13M2 5h1M2 12h1M2 19h1',
      dice:'m4 3 17 1-1 17-17-1ZM8 8h.1M16 8h.1M12 12h.1M8 16h.1M16 16h.1',
      info:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 10v7M12 6h.1',
      target:'M12 2v4M12 18v4M2 12h4M18 12h4M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM12 11v2',
      arrow:'M4 12h16M14 6l6 6-6 6',
      clock:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 6v6l4 3',
      bookmark:'M6 3h12v19l-6-4-6 4Z',
      skip:'m4 5 10 7-10 7ZM19 5v14',
      pause:'M7 4v16M17 4v16',
      play:'m6 3 15 9-15 9Z',
      chat:'M3 3h18v13H9l-6 5ZM7 7h10M7 11h7',
      folder:'M2 6V3h7l3 3h10v15H2ZM2 9h20',
      upload:'M12 17V2M6 8l6-6 6 6M3 15v7h18v-7',
      download:'M12 2v15M6 11l6 6 6-6M3 15v7h18v-7',
      settings:'M4 6h16M4 18h16M8 3v6M16 15v6M4 12h16M14 9v6',
      lamp:'m8 3-5 9h18l-5-9ZM12 12v9M7 22h10',
      motion:'M2 7h10M2 12h6M2 17h10M14 5l7 7-7 7',
      small:'M9 3v6H3M15 21v-6h6M3 3l6 6M21 21l-6-6',
      undo:'M8 4 2 10l6 6M2 10h13a6 6 0 0 1 0 12',
      shield:'m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Zm-5 9 3 3 7-7',
      spark:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
      notebook:'M5 2h16v20H5ZM2 6h6M2 12h6M2 18h6M11 7h6M11 12h6',
      close:'M5 5l14 14M19 5 5 19'
    };
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),p=document.createElementNS(svg.namespaceURI,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.classList.add('qj-map-icon');
    for(const [k,v]of Object.entries({d:paths[kind]||paths.compass,fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round'}))p.setAttribute(k,v);
    svg.append(p);return svg;
  }
  function mount(host,{places=[],selected,onSelect=()=>{},onAdd=()=>{}}={}) {
    let {lat,lon,z,enabled}=view,drag=null,disposed=false;const events=new AbortController(),listen=(type,fn)=>host.addEventListener(type,fn,{signal:events.signal});
    const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
    host.classList.add('qj-atlas');host.setAttribute('aria-label','Real Paris map. Arrow keys pan; plus and minus zoom. Double-click to add a place.');host.tabIndex=0;
    const tiles=make('div','qj-atlas-tiles'),pins=make('div','qj-atlas-pins'),controls=make('div','qj-atlas-controls'),credit=make('a','qj-atlas-credit','© OpenStreetMap contributors'),hint=make('div','qj-atlas-hint','Your places are local. Load the street map to explore Paris.');
    credit.href='https://www.openstreetmap.org/copyright';credit.addEventListener('click',e=>{e.preventDefault();window.hub.openExternal(credit.href);});
    const action=(text,fn)=>{const b=make('button','qj-button qj-hardware',text);b.type='button';b.addEventListener('click',e=>{e.stopPropagation();fn();});controls.append(b);return b;};
    const load=action('Retry street map',()=>{enabled=true;tiles.replaceChildren();load.hidden=true;hint.textContent='Drag to explore · double-click to add a place';draw();});load.hidden=true;
    action('+',()=>zoom(1)).setAttribute('aria-label','Zoom in');action('−',()=>zoom(-1)).setAttribute('aria-label','Zoom out');action('Paris',()=>{lat=48.862;lon=2.35;z=12;draw();});
    const locate=action('',()=>{const p=places.find(p=>p.id===selected);if(p){lat=p.lat;lon=p.lon;draw();}});locate.append(icon('target'));locate.title='Center on selected place';locate.setAttribute('aria-label',locate.title);
    if(enabled)hint.textContent='Drag to explore · double-click to add a place';
    host.append(tiles,pins,controls,credit,hint);
    function zoom(delta){z=clamp(z+delta,11,17);draw();}
    function draw(){if(disposed)return;lat=clamp(lat,48.7,49);lon=clamp(lon,2.15,2.6);const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;const [cx,cy]=project(lat,lon,z),left=cx-w/2,top=cy-h/2,keep=new Set();
      if(enabled)for(let x=Math.floor(left/256);x<=Math.floor((left+w-1)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+h-1)/256);y++){
        const key=`${z}/${x}/${y}`;keep.add(key);let img=tiles.querySelector(`[data-tile="${key}"]`);if(!img){img=make('img');img.alt='';img.draggable=false;img.dataset.tile=key;img.src=`https://tile.openstreetmap.org/${key}.png`;img.addEventListener('error',()=>{img.style.visibility='hidden';hint.textContent='Map unavailable · pins saved';hint.title='The street map is offline or blocked. Retry once; if it still fails, check for a Hearth update.';load.hidden=false;});tiles.append(img);}img.style.left=`${x*256-left}px`;img.style.top=`${y*256-top}px`;
      }
      for(const img of [...tiles.children])if(!keep.has(img.dataset.tile))img.remove();
      pins.replaceChildren();for(const p of places){const [x,y]=project(p.lat,p.lon,z),px=x-left,py=y-top;if(px<-80||py<-40||px>w+80||py>h+40)continue;const b=make('button',`qj-atlas-pin${p.id===selected?' selected':''}${p.visitedAt?' visited':''}`);b.type='button';b.dataset.place=p.id;b.style.left=px+'px';b.style.top=py+'px';b.style.setProperty('--pin',p.color||'#f279b3');b.setAttribute('aria-label',`${p.name}${p.visitedAt?' — visited (self-reported)':''}`);b.setAttribute('aria-pressed',String(p.id===selected));const symbol=make('span');if(p.logo){const logo=make('img','qj-atlas-logo');logo.alt='';logo.draggable=false;logo.decoding='async';logo.src=p.logo;logo.addEventListener('error',()=>logo.replaceWith(icon(p.kind)),{once:true});symbol.append(logo);b.classList.add('has-logo');}else symbol.append(icon(p.kind));/* (round 61, showsync61) a pin may carry a local logo picture (venues from Shotgun / DICE) */b.append(symbol,make('strong','',p.name));if(p.favorite)b.append(make('i','qj-pin-star','★'));b.addEventListener('click',e=>{e.stopPropagation();onSelect(p.id);});pins.append(b);}
    }
    listen('keydown',e=>{if(e.target!==host)return;const delta={ArrowLeft:[-120,0],ArrowRight:[120,0],ArrowUp:[0,-120],ArrowDown:[0,120]}[e.key];if(delta){e.preventDefault();const c=project(lat,lon,z);[lat,lon]=unproject(c[0]+delta[0],c[1]+delta[1],z);draw();}else if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?-1:1);}});
    listen('pointerdown',e=>{if(e.target.closest('button,a'))return;drag={x:e.clientX,y:e.clientY,center:project(lat,lon,z)};host.setPointerCapture(e.pointerId);});
    listen('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;tiles.style.transform=pins.style.transform=`translate(${dx}px,${dy}px)`;});
    const end=e=>{if(!drag)return;[lat,lon]=unproject(drag.center[0]-e.clientX+drag.x,drag.center[1]-e.clientY+drag.y,z);lat=clamp(lat,48.7,49);lon=clamp(lon,2.15,2.6);drag=null;tiles.style.transform=pins.style.transform='';draw();};listen('pointerup',end);const cancel=()=>{drag=null;tiles.style.transform=pins.style.transform='';};listen('pointercancel',cancel);listen('lostpointercapture',cancel);
    listen('dblclick',e=>{if(e.target.closest('button,a'))return;const r=host.getBoundingClientRect(),c=project(lat,lon,z),point=unproject(c[0]+e.clientX-r.left-r.width/2,c[1]+e.clientY-r.top-r.height/2,z);onAdd({lat:+point[0].toFixed(6),lon:+point[1].toFixed(6)});});
    const observer=new ResizeObserver(draw);observer.observe(host);draw();
    return {destroy(){view={lat,lon,z,enabled};disposed=true;events.abort();observer.disconnect();},focus(p){lat=p.lat;lon=p.lon;draw();},center(){return {lat,lon};}};
  }
  return {project,unproject,mount,icon};
});
