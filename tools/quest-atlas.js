// A small, dependency-free Web Mercator viewport. Tiles load only after an explicit
// opening of the Paris page; only visible tiles are requested. Chromium owns HTTP caching.
(function(root, make) { if(typeof module === 'object') module.exports=make(); else root.QuestAtlas=make(); })(typeof self !== 'undefined' ? self : this, () => {
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  function project(lat,lon,z){const n=256*2**z,r=clamp(lat,-85,85)*Math.PI/180;return [(lon+180)/360*n,(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n];}
  function unproject(x,y,z){const n=256*2**z;return [180/Math.PI*Math.atan(Math.sinh(Math.PI*(1-2*y/n))),x/n*360-180];}
  let view={lat:48.862,lon:2.35,z:12,enabled:true};
  function mount(host,{places=[],selected,onSelect=()=>{},onAdd=()=>{}}={}) {
    let {lat,lon,z,enabled}=view,drag=null,disposed=false;const events=new AbortController(),listen=(type,fn)=>host.addEventListener(type,fn,{signal:events.signal});
    const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text)n.textContent=text;return n;};
    host.classList.add('qj-atlas');host.setAttribute('aria-label','Real Paris map. Arrow keys pan; plus and minus zoom. Double-click to add a place.');host.tabIndex=0;
    const tiles=make('div','qj-atlas-tiles'),pins=make('div','qj-atlas-pins'),controls=make('div','qj-atlas-controls'),credit=make('a','qj-atlas-credit','© OpenStreetMap contributors'),hint=make('div','qj-atlas-hint','Your places are local. Load the street map to explore Paris.');
    credit.href='https://www.openstreetmap.org/copyright';credit.addEventListener('click',e=>{e.preventDefault();window.hub.openExternal(credit.href);});
    const action=(text,fn)=>{const b=make('button','qj-button qj-hardware',text);b.type='button';b.addEventListener('click',e=>{e.stopPropagation();fn();});controls.append(b);return b;};
    const load=action('Retry street map',()=>{enabled=true;tiles.replaceChildren();load.hidden=true;hint.textContent='Drag to explore · double-click to add a place';draw();});load.hidden=true;
    action('+',()=>zoom(1));action('−',()=>zoom(-1));action('Paris',()=>{lat=48.862;lon=2.35;z=12;draw();});
    if(enabled)hint.textContent='Drag to explore · double-click to add a place';
    host.append(tiles,pins,controls,credit,hint);
    function zoom(delta){z=clamp(z+delta,11,17);draw();}
    function draw(){if(disposed)return;lat=clamp(lat,48.7,49);lon=clamp(lon,2.15,2.6);const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;const [cx,cy]=project(lat,lon,z),left=cx-w/2,top=cy-h/2,keep=new Set();
      if(enabled)for(let x=Math.floor(left/256);x<=Math.floor((left+w-1)/256);x++)for(let y=Math.floor(top/256);y<=Math.floor((top+h-1)/256);y++){
        const key=`${z}/${x}/${y}`;keep.add(key);let img=tiles.querySelector(`[data-tile="${key}"]`);if(!img){img=make('img');img.alt='';img.draggable=false;img.dataset.tile=key;img.src=`https://tile.openstreetmap.org/${key}.png`;img.addEventListener('error',()=>{img.style.visibility='hidden';hint.textContent='Street map unavailable or access blocked. Your places are saved. If retry fails, check for a Hearth update.';load.hidden=false;});tiles.append(img);}img.style.left=`${x*256-left}px`;img.style.top=`${y*256-top}px`;
      }
      for(const img of [...tiles.children])if(!keep.has(img.dataset.tile))img.remove();
      pins.replaceChildren();for(const p of places){const [x,y]=project(p.lat,p.lon,z),px=x-left,py=y-top;if(px<-80||py<-40||px>w+80||py>h+40)continue;const b=make('button',`qj-atlas-pin${p.id===selected?' selected':''}${p.visitedAt?' visited':''}`);b.type='button';b.dataset.place=p.id;b.style.left=px+'px';b.style.top=py+'px';b.setAttribute('aria-label',`${p.name}${p.visitedAt?' — visited (self-reported)':''}`);b.append(make('span','',p.visitedAt?'✦':'◇'),make('strong','',p.name));b.addEventListener('click',e=>{e.stopPropagation();onSelect(p.id);});pins.append(b);}
    }
    listen('keydown',e=>{if(e.target!==host)return;const delta={ArrowLeft:[-120,0],ArrowRight:[120,0],ArrowUp:[0,-120],ArrowDown:[0,120]}[e.key];if(delta){e.preventDefault();const c=project(lat,lon,z);[lat,lon]=unproject(c[0]+delta[0],c[1]+delta[1],z);draw();}else if(['+','=','-'].includes(e.key)){e.preventDefault();zoom(e.key==='-'?-1:1);}});
    listen('pointerdown',e=>{if(e.target.closest('button,a'))return;drag={x:e.clientX,y:e.clientY,center:project(lat,lon,z)};host.setPointerCapture(e.pointerId);});
    listen('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;tiles.style.transform=pins.style.transform=`translate(${dx}px,${dy}px)`;});
    const end=e=>{if(!drag)return;[lat,lon]=unproject(drag.center[0]-e.clientX+drag.x,drag.center[1]-e.clientY+drag.y,z);lat=clamp(lat,48.7,49);lon=clamp(lon,2.15,2.6);drag=null;tiles.style.transform=pins.style.transform='';draw();};listen('pointerup',end);const cancel=()=>{drag=null;tiles.style.transform=pins.style.transform='';};listen('pointercancel',cancel);listen('lostpointercapture',cancel);
    listen('dblclick',e=>{if(e.target.closest('button,a'))return;const r=host.getBoundingClientRect(),c=project(lat,lon,z),point=unproject(c[0]+e.clientX-r.left-r.width/2,c[1]+e.clientY-r.top-r.height/2,z);onAdd({lat:+point[0].toFixed(6),lon:+point[1].toFixed(6)});});
    const observer=new ResizeObserver(draw);observer.observe(host);draw();
    return {destroy(){view={lat,lon,z,enabled};disposed=true;events.abort();observer.disconnect();},focus(p){lat=p.lat;lon=p.lon;draw();},center(){return {lat,lon};}};
  }
  return {project,unproject,mount};
});
