// Apps → the Three.js Lab (round 14, apps stream): a 3D model (Meshy, Sketchfab, Spline, Poly Haven…) or an HDRI sky
// arrives as one of the open sketch's references (refs.<key>) plus a new layer that uses it, so the director chat can
// pick it up like any layer (sliders: size, spin, height, light; "Kick punch" stays at 0 until the owner wants it).
// The Lab's own pieces do the work: ThreeLab.addReference (copies the file into data/refs) and director.addLayer.
const AppsLab = (() => {
  const key = (s) => String(s || 'model').replace(/[^a-zA-Z0-9]/g, '');
  // a model on a transparent layer: centred, fitted to the view, lit by a soft studio light, turning slowly
  const modelCode = (refKey, name) => `import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ${String(name || refKey).replace(/[\r\n]+/g, ' ').slice(0, 80)}: a 3D model (refs.${refKey}) on a transparent layer.
const P = tweak({
  size: { value: 3, min: 0.2, max: 10, label: 'Size', group: 'Model' },
  height: { value: 0, min: -4, max: 4, label: 'Height', group: 'Model' },
  spin: { value: 0.25, min: -3, max: 3, label: 'Spin', group: 'Motion' },
  tilt: { value: 0.12, min: -1.5, max: 1.5, label: 'Tilt', group: 'Motion' },
  light: { value: 1, min: 0.1, max: 3, label: 'Light', group: 'Look' },
  punch: { value: 0, min: 0, max: 2, label: 'Kick punch', group: 'Music', hint: '0 = calm; raise it to pump on kicks (or the beat)' },
});

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 200);
camera.position.set(0, 0, 9);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const holder = new THREE.Group();
scene.add(holder);
let mixer = null;
new GLTFLoader().load(refs.${refKey}, (gltf) => {
  const model = gltf.scene;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const fit = new THREE.Group();
  fit.scale.setScalar(1 / Math.max(size.x, size.y, size.z, 1e-6));
  fit.add(model);
  holder.add(fit);
  if (gltf.animations.length) { mixer = new THREE.AnimationMixer(model); mixer.clipAction(gltf.animations[0]).play(); }
}, undefined, (err) => console.error('The model did not load:', err?.message || err));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const clock = new THREE.Clock();
let pump = 0;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const hit = audio.hits.kick.length ? audio.kick : audio.beat;
  pump = Math.max(pump * 0.88, hit);
  mixer?.update(dt);
  holder.scale.setScalar(P.size * (1 + pump * P.punch * 0.25));
  holder.position.y = P.height;
  holder.rotation.y += P.spin * dt;
  holder.rotation.x = P.tilt;
  renderer.toneMappingExposure = P.light;
  renderer.render(scene, camera);
});
`;
  // an HDRI: the sky behind everything (bottom layer), blurred to taste
  const hdriCode = (refKey, name, exr) => `import * as THREE from 'three';

// ${String(name || refKey).replace(/[\r\n]+/g, ' ').slice(0, 80)}: an HDRI sky (refs.${refKey}) as the backdrop.
const P = tweak({
  blur: { value: 0.15, min: 0, max: 1, label: 'Blur', group: 'Sky' },
  light: { value: 1, min: 0.1, max: 4, label: 'Light', group: 'Sky' },
  turn: { value: 0.03, min: -1, max: 1, label: 'Turn', group: 'Motion' },
  fov: { value: 60, min: 20, max: 110, label: 'Lens', group: 'Sky' },
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(P.fov, innerWidth / innerHeight, 0.1, 100);
${exr ? `const { EXRLoader } = await import('three/addons/loaders/EXRLoader.js');
const Loader = EXRLoader;` : `const mod = await import('three/addons/loaders/HDRLoader.js').catch(() => import('three/addons/loaders/RGBELoader.js'));
const Loader = mod.HDRLoader || mod.RGBELoader;`}
new Loader().load(refs.${refKey}, (tex) => {
  tex.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = tex;
  scene.environment = tex;
}, undefined, (err) => console.error('The HDRI did not load:', err?.message || err));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let yaw = 0;
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  yaw += P.turn * Math.min(clock.getDelta(), 0.1);
  camera.rotation.set(0, yaw, 0);
  if (camera.fov !== P.fov) { camera.fov = P.fov; camera.updateProjectionMatrix(); }
  scene.backgroundBlurriness = P.blur;
  renderer.toneMappingExposure = P.light;
  renderer.render(scene, camera);
});
`;

  async function addRef(file) {
    await ThreeLab.cmd();
    return ThreeLab.addReference(file);
  }
  const base = (file) => String(file).split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  async function addModel(file, { name } = {}) {
    if (!/\.(glb|gltf)$/i.test(file)) {
      const r = await addRef(file);
      toast(`${base(file)} is in the Lab's references (${r.key}); a .glb loads straight as a layer.`, { timeout: 4500 });
      return { ref: r.key, layer: null };
    }
    const r = await addRef(file);
    const label = (name || base(file)).slice(0, 40);
    const out = await ThreeLab.director.addLayer({ name: `🧊 ${label}`, code: modelCode(r.key, label) }, 1.5);
    toast(`🧊 ${label} is a layer in the Lab`, { timeout: 2600 });
    return { ref: r.key, layer: out?.added || label };
  }
  async function addHdri(file, { name } = {}) {
    const r = await addRef(file);
    const label = (name || base(file)).slice(0, 40);
    const out = await ThreeLab.director.addLayer({ name: `🌅 ${label}`, code: hdriCode(r.key, label, /\.exr$/i.test(file)), position: 'bottom' }, 1.5);
    toast(`🌅 ${label} is the Lab's sky (bottom layer)`, { timeout: 2600 });
    return { ref: r.key, layer: out?.added || label };
  }
  return { addModel, addHdri, modelCode, hdriCode, key };
})();
window.AppsLab = AppsLab;
