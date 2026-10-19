// Optional gallery artwork. WebGL and its animation loop live entirely off the UI thread.
import * as THREE from './lib/three-frontpage/three.module.min.js';
let renderer, scene, camera, group, timer=0, running=false, reduced=false, frame=0, spec;
function draw() {
  clearTimeout(timer); if(!renderer)return;
  const t=performance.now()/1000*spec.speed;
  group.rotation.set(.25, reduced ? .3 : t*.24, -.2);
  group.children.forEach((o,i)=>{if(!reduced){o.rotation.x=t*.25+i; o.rotation.z=t*.14;}if(spec.shape==='wave')o.position.y=Math.sin(i*.45+(reduced?0:t))*1.3;});
  renderer.render(scene,camera);if(frame++===0)postMessage({ready:true});
  if(running&&!reduced)timer=setTimeout(draw,1000/30);
}
onmessage=({data:d})=>{
  try {
    if(d.canvas){
      spec=d.spec;reduced=d.reduced;
      renderer=new THREE.WebGLRenderer({canvas:d.canvas,alpha:true,antialias:true,powerPreference:'low-power'});
      renderer.setPixelRatio(1);scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(40,1,.1,100);camera.position.set(0,0,11);
      group=new THREE.Group();scene.add(group);
      scene.add(new THREE.AmbientLight(0xffffff,2));const key=new THREE.DirectionalLight(0xffffff,4);key.position.set(3,5,4);scene.add(key);
      const geo=spec.shape==='crystal'?new THREE.OctahedronGeometry(.42):spec.shape==='wave'?new THREE.BoxGeometry(.22,.8,.22):new THREE.TorusGeometry(.33,.065,8,28);
      const materials=[spec.color,spec.accent].map(color=>new THREE.MeshStandardMaterial({color,metalness:.65,roughness:.23}));
      for(let i=0;i<spec.count;i++){const o=new THREE.Mesh(geo,materials[i%2]),a=i/spec.count*Math.PI*2;o.position.set(spec.shape==='wave'?(i-spec.count/2)*.28:Math.cos(a)*3,Math.sin(a)*1.7,Math.sin(i*1.8));group.add(o);}
    }
    if(!renderer)return;
    if(d.size){renderer.setSize(d.size[0],d.size[1],false);camera.aspect=d.size[0]/d.size[1];camera.updateProjectionMatrix();}
    if('running' in d)running=d.running;
    if('reduced' in d)reduced=d.reduced;
    draw();
  } catch(e){clearTimeout(timer);postMessage({error:e.message});}
};
