// Optional gallery artwork. WebGL and its animation loop live entirely off the UI thread.
import * as THREE from './lib/three-frontpage/three.module.min.js';
let renderer, scene, camera, group, timer=0, running=false, reduced=false, frame=0, spec;
const decor=[];
function emblem(shape){const s=new THREE.Shape();if(shape==='bolt'){[[.2,1.2],[-.8,-.1],[-.1,-.1],[-.3,-1.2],[.8,.25],[.15,.25]].forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));}else for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.42:1; i?s.lineTo(Math.cos(a)*r,Math.sin(a)*r):s.moveTo(Math.cos(a)*r,Math.sin(a)*r);}s.closePath();return new THREE.ExtrudeGeometry(s,{depth:.12,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.04,bevelThickness:.04});}
function identity() {
  scene.background=new THREE.Color(spec.background);camera.position.z=11;
  const metal=color=>new THREE.MeshStandardMaterial({color,metalness:.7,roughness:.22});
  const a=metal(spec.color),b=metal(spec.accent),symbol=new THREE.Group();symbol.position.set(2.7,.15,0);group.add(symbol);
  const mesh=(geo,mat,pos=[0,0,0],scale=[1,1,1])=>{const m=new THREE.Mesh(geo,mat);m.position.set(...pos);m.scale.set(...scale);return m;};
  if(spec.symbol==='brushes')for(const angle of [-.65,.65]){const brush=new THREE.Group();brush.rotation.z=angle;brush.add(mesh(new THREE.CylinderGeometry(.11,.14,2.4,12),a),mesh(new THREE.CylinderGeometry(.18,.13,.42,12),b,[0,1.35,0]),mesh(new THREE.ConeGeometry(.23,.7,12),b,[0,1.9,0]));symbol.add(brush);}
  else if(spec.symbol==='ship'){const s=new THREE.Shape();s.moveTo(0,1.8);s.lineTo(.6,.2);s.lineTo(1.5,-.9);s.lineTo(.4,-.55);s.lineTo(0,-1.3);s.lineTo(-.4,-.55);s.lineTo(-1.5,-.9);s.lineTo(-.6,.2);s.closePath();symbol.add(mesh(new THREE.ExtrudeGeometry(s,{depth:.3,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.08,bevelThickness:.08}),a));symbol.add(mesh(new THREE.SphereGeometry(.25,16,12),b,[0,.1,.45],[.6,1,.6]));}
  else if(spec.symbol==='chunks'){for(let i=0;i<7;i++){const m=mesh(new THREE.BoxGeometry(.82,.82,.82),i%2?a:b,[(i%3-1)*.88,Math.floor(i/3)*.85-1,Math.sin(i)*.4]);m.rotation.set(.2,i*.2,.12);symbol.add(m);}}
  else if(spec.symbol==='orbit'){for(let i=0;i<3;i++){const m=mesh(new THREE.TorusGeometry(1.25,.09,10,64),i%2?a:b);m.rotation.set(i*.65,i*.7,0);symbol.add(m);}symbol.add(mesh(new THREE.IcosahedronGeometry(.6),a));}
  else if(spec.symbol==='wave'){for(let i=0;i<11;i++)symbol.add(mesh(new THREE.BoxGeometry(.15,.4+Math.sin(i*.65)**2*2.6,.2),i%2?a:b,[(i-5)*.25,0,0]));}
  else symbol.add(mesh(new THREE.IcosahedronGeometry(1.5,0),a));
  symbol.scale.setScalar(spec.symbolScale||1);symbol.visible=spec.symbol!=='none';
  if(spec.layout==='badge'){symbol.position.set(0,.8,-.6);symbol.scale.multiplyScalar(.8);}else if(spec.layout==='wordmark'){symbol.position.set(3.4,.2,-.8);symbol.scale.multiplyScalar(.65);}
  for(const [i,e] of (spec.elements||[]).entries()){const geo=['star','bolt'].includes(e.shape)?emblem(e.shape):e.shape==='ring'?new THREE.TorusGeometry(1,.15,8,24):e.shape==='sphere'?new THREE.SphereGeometry(1,12,8):e.shape==='box'?new THREE.BoxGeometry(1,1,1):new THREE.OctahedronGeometry(1);const m=mesh(geo,metal(e.color),e.position,e.scale);m.rotation.set(...e.rotation);m.userData.index=i;decor.push({mesh:m,spec:e});scene.add(m);}
  const art=new OffscreenCanvas(1600,600),ctx=art.getContext('2d'),l=spec.lettering||{},fonts={arcade:'Impact, sans-serif',rounded:'Arial Rounded MT Bold, Trebuchet MS, sans-serif',editorial:'Georgia, serif',mono:'monospace',heavy:'Arial Black, sans-serif'};
  let size=280;ctx.font=`900 ${size}px ${fonts[l.font]||fonts.heavy}`;const title=spec.title,tracking=(l.tracking||0)*size,total=ctx.measureText(title).width+Math.max(0,title.length-1)*tracking;size*=Math.min(1,1400/total);ctx.font=`900 ${size}px ${fonts[l.font]||fonts.heavy}`;
  const advance=[...title].map(c=>ctx.measureText(c).width+(l.tracking||0)*size),width=advance.reduce((a,b)=>a+b,0),x0=(1600-width)/2;
  ctx.textBaseline='middle';ctx.lineJoin='round';ctx.translate(800,300);ctx.rotate(l.tilt||0);ctx.translate(-800,-300);
  const gradient=ctx.createLinearGradient(0,180,0,400);[['0','#fff8f0'],['.4',l.color||'#eee'],['.48','#30323c'],['.52','#fff'],['1',l.outline||spec.accent]].forEach(([p,c])=>gradient.addColorStop(+p,c));
  let x=x0;for(const [i,ch]of [...title].entries()){
    ctx.save();ctx.translate(x,270);if(l.style==='ink')ctx.rotate((i%2?1:-1)*.035);
    ctx.fillStyle=l.outline||spec.accent;for(let n=Math.min(20,l.depth||0);n>0;n-=2)ctx.fillText(ch,n,n);
    ctx.lineWidth=l.style==='outline'?5:Math.max(3,size*.025);ctx.strokeStyle=l.outline||spec.accent;
    if(l.style==='neon'){ctx.shadowColor=l.outline||spec.accent;ctx.shadowBlur=24;}
    if(l.style!=='solid')ctx.strokeText(ch,0,0);
    if(l.style!=='outline'){ctx.fillStyle=l.style==='chrome'?gradient:l.color||'#f6f1ed';ctx.fillText(ch,0,0);}
    ctx.restore();x+=advance[i];
  }
  ctx.fillStyle=spec.accent;ctx.font='32px monospace';ctx.textAlign='center';ctx.fillText(spec.tagline.toUpperCase(),800,430,1380);
  const tex=new THREE.CanvasTexture(art);tex.colorSpace=THREE.SRGBColorSpace;const word=new THREE.Mesh(new THREE.PlaneGeometry(spec.layout==='split'?6.8:9, spec.layout==='split'?2.55:3.375),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthTest:false}));word.position.set(spec.layout==='split'?-1.7:0,spec.layout==='badge'?-1.25:0,1);word.renderOrder=5;scene.add(word);
}
function draw() {
  clearTimeout(timer); if(!renderer)return;
  const t=performance.now()/1000*spec.speed;
  if(spec.kind==='banner'){const s=group.children[0],y=spec.layout==='badge'?.8:.15;s.rotation.set(.1,reduced?.25:Math.sin(t)*.25,.08);s.position.y=y+(reduced?0:Math.sin(t*.8)*.1);for(const {mesh:m,spec:e} of decor){if(e.motion==='float')m.position.y=e.position[1]+(reduced?0:Math.sin(t*2+m.userData.index)*.18);if(e.motion==='spin')m.rotation.z=e.rotation[2]+(reduced?0:t*.4);if(e.motion==='pulse')m.scale.fromArray(e.scale).multiplyScalar(reduced?1:1+Math.sin(t*2)*.06);}}
  else {group.rotation.set(.25, reduced ? .3 : t*.24, -.2);group.children.forEach((o,i)=>{if(!reduced){o.rotation.x=t*.25+i; o.rotation.z=t*.14;}if(spec.shape==='wave')o.position.y=Math.sin(i*.45+(reduced?0:t))*1.3;});}
  renderer.render(scene,camera);if(frame++===0)postMessage({ready:true});
  if(running&&!reduced)timer=setTimeout(draw,1000/30);
}
onmessage=async({data:d})=>{
  try {
    if(d.canvas){
      spec=d.spec;reduced=d.reduced;
      renderer=new THREE.WebGLRenderer({canvas:d.canvas,alpha:true,antialias:true,powerPreference:'low-power'});
      renderer.setPixelRatio(1);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(0,0,11);
    }
    if(d.spec){
      spec=d.spec;
      if(scene){scene.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean)){m.map?.dispose();m.dispose();}});scene.clear();decor.length=0;}
      group=new THREE.Group();scene.add(group);
      scene.add(new THREE.AmbientLight(0xffffff,2));const key=new THREE.DirectionalLight(0xffffff,4);key.position.set(3,5,4);scene.add(key);
      if(spec.kind==='banner')identity();else{
      const geo=spec.shape==='crystal'?new THREE.OctahedronGeometry(.42):spec.shape==='wave'?new THREE.BoxGeometry(.22,.8,.22):new THREE.TorusGeometry(.33,.065,8,28);
      const materials=[spec.color,spec.accent].map(color=>new THREE.MeshStandardMaterial({color,metalness:.65,roughness:.23}));
      for(let i=0;i<spec.count;i++){const o=new THREE.Mesh(geo,materials[i%2]),a=i/spec.count*Math.PI*2;o.position.set(spec.shape==='wave'?(i-spec.count/2)*.28:Math.cos(a)*3,Math.sin(a)*1.7,Math.sin(i*1.8));group.add(o);}
      }
    }
    if(!renderer)return;
    if(d.size){renderer.setSize(d.size[0],d.size[1],false);camera.aspect=d.size[0]/d.size[1];if(spec.kind==='banner')camera.position.z=11*Math.max(1,(8/3)/camera.aspect);camera.updateProjectionMatrix();}
    if('running' in d)running=d.running;
    if('reduced' in d)reduced=d.reduced;
    draw();
    if(d.pick){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(d.pick.x*2-1,1-d.pick.y*2),camera);const hit=ray.intersectObjects(decor.map(x=>x.mesh))[0];postMessage({pick:d.pick.id,index:hit?.object.userData.index??-1});}
    if(d.poster){const blob=await renderer.domElement.convertToBlob({type:'image/png'});const bytes=await blob.arrayBuffer();postMessage({poster:d.poster,bytes},[bytes]);}
  } catch(e){clearTimeout(timer);postMessage({error:e.message});}
};
