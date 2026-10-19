// A small, dependency-free Web Mercator viewport. Tiles load only after an explicit
// opening of the Paris page; only visible tiles are requested. Chromium owns HTTP caching.
(function(root, make) { if(typeof module === 'object') module.exports=make(); else root.QuestAtlas=make(); })(typeof self !== 'undefined' ? self : this, () => {
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  function project(lat,lon,z){const n=256*2**z,r=clamp(lat,-85,85)*Math.PI/180;return [(lon+180)/360*n,(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n];}
  function unproject(x,y,z){const n=256*2**z;return [180/Math.PI*Math.atan(Math.sinh(Math.PI*(1-2*y/n))),x/n*360-180];}
  let view={lat:48.862,lon:2.35,z:12,enabled:true};
  let fitted=null; // (round 63, questwalk63) the last line framed by `fit`, so a re-render never undoes the owner's own pan / zoom
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
      close:'M5 5l14 14M19 5 5 19',
      food:'M4 3v6a3 3 0 0 0 6 0V3M7 3v18M18 3c-4 4-4 9 0 9h2M20 3v18',
      refresh:'M20 8a9 9 0 1 0 1 8M20 2v6h-6'
    };
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),p=document.createElementNS(svg.namespaceURI,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.classList.add('qj-map-icon');
    for(const [k,v]of Object.entries({d:paths[kind]||paths.compass,fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round'}))p.setAttribute(k,v);
    svg.append(p);return svg;
  }
  function mount(host,{places=[],selected,onSelect=()=>{},onAdd=()=>{},lines=[]}={}) { // lines: (round 63, questwalk63) [{ id, color, fit, points: [{ id?, lat, lon, label? }] }] drawn over the pins; `fit` frames a new line once; pins not on it fade
    let {lat,lon,z,enabled}=view,drag=null,disposed=false,frame=0,lastWheelZoom=0;
    // (round 65, questperf65) the host's size, kept from the ResizeObserver (read when layout is already clean), so a draw
    // from a click / a re-render never forces the whole page's layout; pinNodes: the drawn pins by id, reused while unchanged
    let W=0,Ht=0,routeNode=null,routeKey='',routeLeft=0,routeTop=0;const pinNodes=new Map(),tileNodes=new Map();const size=()=>{if(!W||!Ht){W=host.clientWidth;Ht=host.clientHeight;}return [W,Ht];};const events=new AbortController(),listen=(type,fn,options={})=>host.addEventListener(type,fn,{...options,signal:events.signal});
    const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
    host.classList.add('qj-atlas');host.setAttribute('aria-label','Real Paris map. Scroll or drag to pan. Ctrl plus scroll zooms. Arrow keys pan; plus and minus zoom. Double-click to add a place.');host.tabIndex=0;
    const tiles=make('div','qj-atlas-tiles'),pins=make('div','qj-atlas-pins'),controls=make('div','qj-atlas-controls'),credit=make('a','qj-atlas-credit','© OpenStreetMap contributors'),hint=make('div','qj-atlas-hint','Your places are local. Load the street map to explore Paris.');
    credit.href='https://www.openstreetmap.org/copyright';credit.addEventListener('click',e=>{e.preventDefault();window.hub.openExternal(credit.href);});
    const action=(text,fn)=>{const b=make('button','qj-button qj-hardware',text);b.type='button';b.addEventListener('click',e=>{e.stopPropagation();fn();});controls.append(b);return b;};
    const load=action('Retry street map',()=>{enabled=true;tiles.replaceChildren();tileNodes.clear();load.hidden=true;hint.textContent='Drag to explore · double-click to add a place';draw();});load.hidden=true;
    action('+',()=>zoom(1)).setAttribute('aria-label','Zoom in');action('−',()=>zoom(-1)).setAttribute('aria-label','Zoom out');action('Paris',()=>{lat=48.862;lon=2.35;z=12;draw();});
    const locate=action('',()=>{const p=places.find(p=>p.id===selected);if(p){lat=p.lat;lon=p.lon;draw();}});locate.append(icon('target'));locate.title='Center on selected place';locate.setAttribute('aria-label',locate.title);
    if(enabled)hint.textContent='Scroll or drag to move · Ctrl + scroll to zoom';
    host.append(tiles,pins,controls,credit,hint);
    // (round 63, questwalk63) polylines in one SVG in the pins layer (it pans with the pins); labels are text nodes, never markup
    // Small catalogs cache projection once. Large catalogs get a spatial index in a worker;
    // rapid pans retain one running request and only the latest desired viewport.
    let catalog=0, indexSource=null, localIndex, spatialWorker, busy=false, desired=null, result=null, sentCatalog=-1, workerFailed=false;
    function projectedPlaces(left,top,width,height){
      if(indexSource!==places){indexSource=places;catalog++;localIndex=null;result=null;}
      const view={left,top,width,height,z,selected},key=JSON.stringify([catalog,left,top,width,height,z,selected]);
      if(places.length<500||workerFailed){localIndex ||= QuestAtlasIndex.build(places);return QuestAtlasIndex.query(localIndex,view);}
      if(result?.key===key)return result.rows;
      desired={key,view,catalog};requestPins();return null;
    }
    function requestPins(){
      if(busy||!desired||disposed)return;
      try{
        if(!spatialWorker){spatialWorker=new Worker('tools/quest-atlas-worker.js');spatialWorker.onmessage=({data})=>{busy=false;if(disposed)return;if(data.error){workerFailed=true;spatialWorker.terminate();scheduleDraw();return;}result=data;if(desired?.key!==data.key)requestPins();else scheduleDraw();};spatialWorker.onerror=()=>{busy=false;workerFailed=true;spatialWorker.terminate();scheduleDraw();};}
        busy=true;const job=desired,points=sentCatalog===job.catalog?null:places.map(p=>({id:p.id,lat:p.lat,lon:p.lon,minZoom:p.minZoom}));sentCatalog=job.catalog;spatialWorker.postMessage({key:job.key,view:job.view,...(points?{points}:{})});
      }catch{busy=false;workerFailed=true;scheduleDraw();}
    }
    function route(list,left,top,w,h){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('class','qj-atlas-route');svg.setAttribute('width',w);svg.setAttribute('height',h);svg.setAttribute('aria-hidden','true');
      for(const l of list){const pts=(l.points||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)).map(p=>{const [x,y]=project(p.lat,p.lon,z);return {x:x-left,y:y-top,label:p.label};});if(pts.length<2)continue;
        const line=document.createElementNS(ns,'polyline');line.setAttribute('points',pts.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' '));line.setAttribute('data-route',l.id||'');line.style.setProperty('--route',l.color||'#ffd75e');svg.append(line);
        for(const p of pts)if(p.label){const g=document.createElementNS(ns,'g'),c=document.createElementNS(ns,'circle'),t=document.createElementNS(ns,'text');g.setAttribute('class','qj-route-stop');c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',9);t.setAttribute('x',p.x);t.setAttribute('y',p.y+3.5);t.textContent=String(p.label).slice(0,3);g.append(c,t);svg.append(g);}}
      return svg;}
    // (round 63, questwalk63) frame a new line once: its centre, the closest zoom (12–16) that holds it with a margin
    function fit(){const l=lines.find(l=>l.fit&&l.id&&l.id!==fitted);if(!l)return;/* (round 65, questperf65) no new line to frame: no size read (it forced a full layout on every draw) */const [w,h]=size();if(!w||!h)return;const pts=(l.points||[]).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));if(pts.length<2)return;fitted=l.id;
      const la=pts.map(p=>p.lat),lo=pts.map(p=>p.lon);lat=(Math.min(...la)+Math.max(...la))/2;lon=(Math.min(...lo)+Math.max(...lo))/2;
      for(z=16;z>12;z--){const xy=pts.map(p=>project(p.lat,p.lon,z)),xs=xy.map(p=>p[0]),ys=xy.map(p=>p[1]);if(Math.max(...xs)-Math.min(...xs)<=w-120&&Math.max(...ys)-Math.min(...ys)<=h-120)break;}}
    function zoom(delta){z=clamp(z+delta,11,17);draw();}
    function draw(){if(disposed)return;fit();if(host.dataset.zoom!==String(z))host.dataset.zoom=z;/* (round 64, mapfirst64) the zoom, for CSS (guide pins become dots at the city zoom) */lat=clamp(lat,48.7,49);lon=clamp(lon,2.15,2.6);const [w,h]=size();if(!w||!h)return;const [cx,cy]=project(lat,lon,z),left=cx-w/2,top=cy-h/2,keep=new Set();
      if(enabled)for(let x=Math.floor(left/256);x<=Math.floor((left+w-1)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+h-1)/256);y++){
        const key=`${z}/${x}/${y}`;keep.add(key);let img=tileNodes.get(key);if(!img){img=make('img');img.alt='';img.draggable=false;img.dataset.tile=key;img.src=`https://tile.openstreetmap.org/${key}.png`;img.addEventListener('error',()=>{img.style.visibility='hidden';hint.textContent='Map unavailable · pins saved';hint.title='The street map is offline or blocked. Retry once; if it still fails, check for a Hearth update.';load.hidden=false;});tiles.append(img);tileNodes.set(key,img);}const position=`translate(${x*256-left}px,${y*256-top}px)`;if(img.style.transform!==position)img.style.transform=position;
      }
      for(const [key,img] of tileNodes)if(!keep.has(key)){img.remove();tileNodes.delete(key);}
      // (round 65, questperf65) pins are diffed, not rebuilt: a pin whose look is unchanged keeps its button (only its position
      // moves); new / changed ones are made; the rest leave. A click, a re-render or a pan touches only what changed.
      const want=[],look=p=>[!!p.visitedAt,p.tone||'',p.name,p.count||0,p.color||'',p.kind||'',p.logo||'',!!p.favorite].join('\u0001');
      const visible=projectedPlaces(left,top,w,h);if(!visible)return;
      for(const [i,x,y] of visible){const p=places[i],px=x-left,py=y-top;
        const sig=look(p);let b=pinNodes.get(p.id);
        if(!b||b.__look!==sig){b=make('button',`qj-atlas-pin${p.visitedAt?' visited':''}${/^[\w-]+$/.test(p.tone||'')?' '+p.tone:''}`);/* (round 64, mapfirst64) tone: an extra class (the guide's untouched places are drawn lighter) */b.type='button';b.dataset.place=p.id;b.title=p.name+(p.count?' · '+p.count+' upcoming nights':'');b.style.setProperty('--pin',p.color||'#f279b3');b.setAttribute('aria-label',`${p.name}${p.visitedAt?' — visited (self-reported)':''}`);const symbol=make('span');if(p.logo){const logo=make('img','qj-atlas-logo');logo.alt='';logo.draggable=false;logo.decoding='async';logo.src=p.logo;logo.addEventListener('error',()=>logo.replaceWith(icon(p.kind)),{once:true});symbol.append(logo);b.classList.add('has-logo');}else symbol.append(icon(p.kind));/* (round 61, showsync61) a pin may carry a local logo picture (venues from Shotgun / DICE) */b.append(symbol,make('strong','',p.name));if(p.favorite)b.append(make('i','qj-pin-star','★'));b.addEventListener('click',e=>{e.stopPropagation();onSelect(b.dataset.place);});b.__look=sig;}
        const on=p.id===selected,dz=String(z>=16),L=px+'px',T=py+'px';if(b.classList.contains('selected')!==on||!b.hasAttribute('aria-pressed')){b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));}if(b.dataset.details!==dz)b.dataset.details=dz;if(b.style.left!==L)b.style.left=L;if(b.style.top!==T)b.style.top=T;want.push(b);}
      const onRoute=lines.length?new Set(lines.flatMap(l=>(l.points||[]).map(p=>p.id)).filter(Boolean)):null;
      for(const b of want){const off=!!onRoute&&!onRoute.has(b.dataset.place)&&b.dataset.place!==selected;if(b.classList.contains('off-route')!==off)b.classList.toggle('off-route',off);}
      // Routes keep their SVG while panning. Only a changed route, zoom or viewport rebuilds geometry.
      const nextRouteKey=lines.length?JSON.stringify([z,w,h,lines]):'';
      if(nextRouteKey!==routeKey){routeNode?.remove();routeNode=null;routeKey=nextRouteKey;if(lines.length){routeNode=route(lines,left,top,w,h);routeNode.style.overflow='visible';routeLeft=left;routeTop=top;}}
      if(routeNode)routeNode.style.transform=`translate(${routeLeft-left}px,${routeTop-top}px)`;
      const kept=new Set(want);if(routeNode)kept.add(routeNode);for(const n of [...pins.children])if(!kept.has(n))n.remove();pinNodes.clear();
      want.forEach((b,i)=>{pinNodes.set(b.dataset.place,b);if(pins.children[i]!==b)pins.insertBefore(b,pins.children[i]||null);});
      if(routeNode && pins.lastChild!==routeNode)pins.append(routeNode);
    }
    listen('keydown',e=>{if(e.target!==host)return;const delta={ArrowLeft:[-120,0],ArrowRight:[120,0],ArrowUp:[0,-120],ArrowDown:[0,120]}[e.key];if(delta){e.preventDefault();const c=project(lat,lon,z);[lat,lon]=unproject(c[0]+delta[0],c[1]+delta[1],z);draw();}else if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?-1:1);}});
    listen('pointerdown',e=>{if(e.target.closest('button,a'))return;drag={x:e.clientX,y:e.clientY,center:project(lat,lon,z)};host.setPointerCapture(e.pointerId);});
    listen('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;tiles.style.transform=pins.style.transform=`translate(${dx}px,${dy}px)`;});
    const end=e=>{if(!drag)return;[lat,lon]=unproject(drag.center[0]-e.clientX+drag.x,drag.center[1]-e.clientY+drag.y,z);lat=clamp(lat,48.7,49);lon=clamp(lon,2.15,2.6);drag=null;tiles.style.transform=pins.style.transform='';draw();};listen('pointerup',end);const cancel=()=>{drag=null;tiles.style.transform=pins.style.transform='';};listen('pointercancel',cancel);listen('lostpointercapture',cancel);
    listen('dblclick',e=>{if(e.target.closest('button,a'))return;const r=host.getBoundingClientRect(),c=project(lat,lon,z),point=unproject(c[0]+e.clientX-r.left-r.width/2,c[1]+e.clientY-r.top-r.height/2,z);onAdd({lat:+point[0].toFixed(6),lon:+point[1].toFixed(6)});});
    function scheduleDraw(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;draw();});}
    listen('wheel',e=>{
      if(drag||e.target.closest('.qj-atlas-controls,a'))return;e.preventDefault();
      const scale=e.deltaMode===1?16:e.deltaMode===2?host.clientHeight:1;
      if(e.ctrlKey||e.metaKey){
        const now=performance.now();if(now-lastWheelZoom<140||!e.deltaY)return;lastWheelZoom=now;
        const next=clamp(z+(e.deltaY<0?1:-1),11,17);if(next===z)return;
        const r=host.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,c=project(lat,lon,z),at=unproject(c[0]+dx,c[1]+dy,z);z=next;const p=project(...at,z);[lat,lon]=unproject(p[0]-dx,p[1]-dy,z);
      }else{const c=project(lat,lon,z),dx=(e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX)*scale,dy=(e.shiftKey&&!e.deltaX?0:e.deltaY)*scale;[lat,lon]=unproject(c[0]+dx,c[1]+dy,z);}
      lat=clamp(lat,48.7,49);lon=clamp(lon,2.15,2.6);scheduleDraw();
    },{passive:false});
    const observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;if(W===r.width&&Ht===r.height)return;W=r.width;Ht=r.height;scheduleDraw();});observer.observe(host);draw();
    return {destroy(){view={lat,lon,z,enabled};disposed=true;spatialWorker?.terminate();events.abort();observer.disconnect();cancelAnimationFrame(frame);},focus(p){if(!p)return;lat=p.lat;lon=p.lon;draw();},select(id){selected=id;for(const b of pins.querySelectorAll('[data-place]')){b.classList.toggle('selected',b.dataset.place===id);b.setAttribute('aria-pressed',String(b.dataset.place===id));}},center(){return {lat,lon};},
      // (round 65, questperf65) new places / selection / lines on the SAME mounted map (the journal re-renders its page around it): pins diff, no remount
      update(o={}){if(disposed)return;if(o.places){places=o.places;indexSource=null;}if('selected' in o)selected=o.selected;if(o.lines)lines=o.lines;if(o.onSelect)onSelect=o.onSelect;if(o.onAdd)onAdd=o.onAdd;if(o.center){lat=o.center.lat;lon=o.center.lon;}draw();},host};
  }
  return {project,unproject,mount,icon};
});
