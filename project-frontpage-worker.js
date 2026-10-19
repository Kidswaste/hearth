// Optional gallery artwork. WebGL and its animation loop live entirely off the UI thread.
import * as THREE from './lib/three-frontpage/three.module.min.js';
let renderer, scene, camera, group, timer=0, running=false, reduced=false, frame=0, spec;
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
  for(const e of spec.elements||[]){const geo=e.shape==='ring'?new THREE.TorusGeometry(1,.15,8,24):e.shape==='sphere'?new THREE.SphereGeometry(1,12,8):e.shape==='box'?new THREE.BoxGeometry(1,1,1):new THREE.OctahedronGeometry(1);const m=mesh(geo,metal(e.color),e.position,e.scale);m.rotation.set(...e.rotation);scene.add(m);}
  const art=new OffscreenCanvas(1400,480),ctx=art.getContext('2d');ctx.fillStyle='#f6f1ed';ctx.font='900 250px sans-serif';const title=spec.title;const width=ctx.measureText(title).width;if(width>1250)ctx.font=`900 ${Math.floor(250*1250/width)}px sans-serif`;ctx.fillText(title,40,230);ctx.fillStyle=spec.accent;ctx.font='42px monospace';ctx.fillText((spec.tagline||'A LITTLE WORLD / MADE IN HEARTH').toUpperCase(),45,310);
  const tex=new THREE.CanvasTexture(art);tex.colorSpace=THREE.SRGBColorSpace;const word=new THREE.Mesh(new THREE.PlaneGeometry(6.2,2.13),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthTest:false}));word.position.set(-1.65,-.15,1);word.renderOrder=5;scene.add(word);
}
function draw() {
  clearTimeout(timer); if(!renderer)return;
  const t=performance.now()/1000*spec.speed;
  if(spec.kind==='banner'){const s=group.children[0];s.rotation.set(.1, reduced?.25:Math.sin(t)*.25,.08);s.position.y=reduced?.15:.15+Math.sin(t*.8)*.1;}
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
    if(d.poster){const blob=await renderer.domElement.convertToBlob({type:'image/png'});const bytes=await blob.arrayBuffer();postMessage({poster:d.poster,bytes},[bytes]);}
  } catch(e){clearTimeout(timer);postMessage({error:e.message});}
};
