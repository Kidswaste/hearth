// Three.js Lab content: starter templates (whole sketches), insertable snippets and shader presets.
const ThreeData = (() => {
  const BASE = `import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 200);
camera.position.set(3, 2, 5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
`;

  const TEMPLATES = [
    {
      name: 'Basic scene', desc: 'Lit cube, orbit controls, resize handling',
      code: `${BASE}
scene.background = new THREE.Color(0x15181e);
scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(4, 6, 3);
scene.add(sun);

const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: 0x7c5cff, roughness: 0.4 }));
scene.add(cube);

renderer.setAnimationLoop((now) => {
  const t = now / 1000; // seconds
  cube.rotation.set(t * 0.4, t * 0.6, 0);
  controls.update();
  renderer.render(scene, camera);
});
`,
    },
    {
      name: 'PBR materials + environment', desc: 'RoomEnvironment lighting, metal/rough grid of spheres',
      code: `${BASE}
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

renderer.toneMapping = THREE.ACESFilmicToneMapping;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.background = new THREE.Color(0x101014);
camera.position.set(0, 0, 9);

const geo = new THREE.SphereGeometry(0.4, 48, 32);
for (let x = 0; x < 6; x++) {
  for (let y = 0; y < 6; y++) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xe07a2f, metalness: x / 5, roughness: y / 5 });
    const s = new THREE.Mesh(geo, mat);
    s.position.set((x - 2.5) * 1, (y - 2.5) * 1, 0);
    scene.add(s);
  }
}
console.log('Left → right: metalness 0 → 1. Bottom → top: roughness 0 → 1.');

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
`,
    },
    {
      name: 'Instancing (10k objects)', desc: 'InstancedMesh with per-instance color and animation',
      code: `${BASE}
scene.background = new THREE.Color(0x0b0d12);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));
camera.position.set(0, 18, 36);

const COUNT = 10000;
const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.18, 0), new THREE.MeshStandardMaterial({ roughness: 0.5 }), COUNT);
const dummy = new THREE.Object3D();
const color = new THREE.Color();
const seeds = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  seeds[i] = Math.random() * Math.PI * 2;
  mesh.setColorAt(i, color.setHSL(i / COUNT, 0.7, 0.55));
}
scene.add(mesh);

renderer.setAnimationLoop((now) => {
  const t = now / 1000; // seconds
  for (let i = 0; i < COUNT; i++) {
    const a = i * 0.0125 + t * 0.2;
    const r = 4 + (i / COUNT) * 14;
    dummy.position.set(Math.cos(a) * r, Math.sin(seeds[i] + t * 2) * 1.5, Math.sin(a) * r);
    dummy.rotation.set(t + seeds[i], t, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
});
`,
    },
    {
      name: 'Particles (Points)', desc: 'BufferGeometry point cloud with additive blending',
      code: `${BASE}
scene.background = new THREE.Color(0x05060a);
camera.position.set(0, 0, 12);

const COUNT = 60000;
const positions = new Float32Array(COUNT * 3);
const colors = new Float32Array(COUNT * 3);
const c = new THREE.Color();
for (let i = 0; i < COUNT; i++) {
  const r = Math.pow(Math.random(), 0.5) * 6;
  const a = Math.random() * Math.PI * 2;
  const arm = (i % 3) * (Math.PI * 2 / 3);
  positions.set([Math.cos(a + arm + r * 0.6) * r, (Math.random() - 0.5) * 0.6, Math.sin(a + arm + r * 0.6) * r], i * 3);
  c.setHSL(0.6 + r * 0.04, 0.8, 0.6);
  colors.set([c.r, c.g, c.b], i * 3);
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.03, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
scene.add(points);

renderer.setAnimationLoop(() => {
  points.rotation.y += 0.002 * f60;
  controls.update();
  renderer.render(scene, camera);
});
`,
    },
    {
      name: 'Bloom post-processing', desc: 'EffectComposer + UnrealBloomPass on emissive shapes',
      code: `${BASE}
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

scene.background = new THREE.Color(0x020205);
camera.position.set(0, 0, 8);
const group = new THREE.Group();
for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.08, 16, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 12, 1, 0.55) }));
  m.position.set(Math.cos(i / 12 * Math.PI * 2) * 2.5, Math.sin(i / 12 * Math.PI * 2) * 2.5, 0);
  group.add(m);
}
scene.add(group);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1.2, 0.4, 0.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());
addEventListener('resize', () => composer.setSize(innerWidth, innerHeight));

renderer.setAnimationLoop((now) => {
  const t = now / 1000; // seconds
  group.rotation.z = t * 0.3;
  group.children.forEach((m, i) => { m.rotation.x = t + i; m.rotation.y = t * 0.7; });
  controls.update();
  composer.render();
});
`,
    },
    {
      name: 'Raycast picking', desc: 'Hover highlight and click selection with a Raycaster',
      code: `${BASE}
scene.background = new THREE.Color(0x14161c);
scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 2));
camera.position.set(0, 6, 10);

const boxes = [];
for (let i = 0; i < 40; i++) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x556070 }));
  b.position.set((Math.random() - 0.5) * 10, Math.random() * 2, (Math.random() - 0.5) * 10);
  scene.add(b);
  boxes.push(b);
}
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(9, 9);
let hovered = null;
addEventListener('pointermove', (e) => pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
addEventListener('click', () => { if (hovered) { hovered.material.color.set(0xe07a2f); console.log('Picked', hovered.position.toArray().map((v) => v.toFixed(2))); } });

renderer.setAnimationLoop(() => {
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(boxes)[0]?.object || null;
  if (hovered && hovered !== hit) hovered.scale.setScalar(1);
  hovered = hit;
  if (hovered) hovered.scale.setScalar(1.25);
  controls.update();
  renderer.render(scene, camera);
});
`,
    },
    {
      name: 'Custom ShaderMaterial', desc: 'Vertex displacement + fragment gradient with uniforms',
      code: `${BASE}
scene.background = new THREE.Color(0x0a0a0f);
camera.position.set(0, 1.5, 4);
const uniforms = { uTime: { value: 0 }, uColorA: { value: new THREE.Color(0x7c5cff) }, uColorB: { value: new THREE.Color(0xe07a2f) } };
const mat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: /* glsl */ \`
    uniform float uTime;
    varying float vH;
    void main() {
      vec3 p = position;
      float h = sin(p.x * 3.0 + uTime) * cos(p.y * 3.0 + uTime * 0.7) * 0.25;
      p.z += h;
      vH = h;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }\`,
  fragmentShader: /* glsl */ \`
    uniform vec3 uColorA, uColorB;
    varying float vH;
    void main() { gl_FragColor = vec4(mix(uColorA, uColorB, vH * 2.0 + 0.5), 1.0); }\`,
  side: THREE.DoubleSide,
});
const plane = new THREE.Mesh(new THREE.PlaneGeometry(4, 4, 128, 128), mat);
plane.rotation.x = -Math.PI / 2.4;
scene.add(plane);
renderer.setAnimationLoop((now) => { uniforms.uTime.value = now / 1000; controls.update(); renderer.render(scene, camera); });
`,
    },
    {
      name: 'Shadows', desc: 'Directional light shadows with a tuned shadow camera',
      code: `${BASE}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
scene.background = new THREE.Color(0x1a1d24);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(5, 8, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: 0x3a3f4a }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.28, 160, 24), new THREE.MeshStandardMaterial({ color: 0x10a37f, roughness: 0.3 }));
knot.position.y = 1.6;
knot.castShadow = true;
scene.add(knot);
renderer.setAnimationLoop(() => { knot.rotation.y += 0.01 * f60; controls.update(); renderer.render(scene, camera); });
`,
    },
    {
      name: 'GLTF model + animation', desc: 'Loads a sample model from the three.js repo and plays its clips',
      code: `${BASE}
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.background = new THREE.Color(0xbfd0e0);
camera.position.set(4, 2, 5);
let mixer;
new GLTFLoader().load('https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb', (gltf) => {
  scene.add(gltf.scene);
  mixer = new THREE.AnimationMixer(gltf.scene);
  console.log('Clips:', gltf.animations.map((c) => c.name).join(', '));
  mixer.clipAction(gltf.animations.find((c) => c.name === 'Dance') || gltf.animations[0]).play();
}, undefined, (err) => console.error(err));

let last = performance.now();
renderer.setAnimationLoop((now) => { mixer?.update((now - last) / 1000); last = now; controls.update(); renderer.render(scene, camera); });
`,
    },
    {
      name: 'Fog + infinite grid flythrough', desc: 'Camera flight over a grid with exponential fog',
      code: `import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0716);
scene.fog = new THREE.FogExp2(0x0b0716, 0.06);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200);
const grid = new THREE.GridHelper(200, 200, 0xff3fa4, 0x5a2a8a);
scene.add(grid);
const sun = new THREE.Mesh(new THREE.CircleGeometry(8, 64), new THREE.MeshBasicMaterial({ color: 0xff7b39, fog: false }));
sun.position.set(0, 6, -60);
scene.add(sun);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop((now) => {
  const t = now / 1000; // seconds
  camera.position.set(Math.sin(t * 0.3) * 2, 1.2, 10 - (t * 4) % 1);
  grid.position.z = (t * 4) % 1;
  renderer.render(scene, camera);
});
`,
    },
    {
      name: 'Text sprites & labels', desc: 'CanvasTexture labels that always face the camera',
      code: `${BASE}
scene.background = new THREE.Color(0x12141a);
function label(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = 'bold 64px Segoe UI, sans-serif';
  c.width = ctx.measureText(text).width + 40;
  c.height = 96;
  ctx.font = 'bold 64px Segoe UI, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.roundRect(0, 0, c.width, c.height, 24);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 20, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sprite.scale.set(c.width / c.height * 0.5, 0.5, 1);
  return sprite;
}
const names = ['Forge', 'Drone', 'Core', 'Rift', 'Lattice'];
names.forEach((n, i) => {
  const a = (i / names.length) * Math.PI * 2;
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshNormalMaterial());
  s.position.set(Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5);
  const l = label(n, '#e07a2f');
  l.position.set(0, 0.6, 0);
  s.add(l);
  scene.add(s);
});
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
`,
    },
    {
      name: 'Empty (minimal)', desc: 'Renderer, scene, camera, loop and nothing else',
      code: `${BASE}
renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
`,
    },
  ];

  const SNIPPETS = [
    { name: 'OrbitControls', code: `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';\nconst controls = new OrbitControls(camera, renderer.domElement);\ncontrols.enableDamping = true; // call controls.update() every frame\n` },
    { name: 'Resize handler', code: `addEventListener('resize', () => {\n  camera.aspect = innerWidth / innerHeight;\n  camera.updateProjectionMatrix();\n  renderer.setSize(innerWidth, innerHeight);\n});\n` },
    { name: 'Animation loop with delta', code: `let last = performance.now();\nrenderer.setAnimationLoop((now) => {\n  const dt = (now - last) / 1000; // seconds since last frame\n  last = now;\n  // update(dt)\n  renderer.render(scene, camera);\n});\n` },
    { name: 'GLTFLoader (+Draco)', code: `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';\nimport { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';\nconst draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');\nconst loader = new GLTFLoader().setDRACOLoader(draco);\nloader.load('model.glb', (gltf) => scene.add(gltf.scene));\n` },
    { name: 'Animation mixer', code: `const mixer = new THREE.AnimationMixer(model);\nconst action = mixer.clipAction(clips[0]);\naction.play();\n// in the loop: mixer.update(dt);\n` },
    { name: 'Environment lighting', code: `import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';\nscene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;\nrenderer.toneMapping = THREE.ACESFilmicToneMapping;\n` },
    { name: 'Shadows setup', code: `renderer.shadowMap.enabled = true;\nrenderer.shadowMap.type = THREE.PCFSoftShadowMap;\nlight.castShadow = true;\nlight.shadow.mapSize.set(2048, 2048);\nmesh.castShadow = true;\nground.receiveShadow = true;\n` },
    { name: 'Raycaster', code: `const raycaster = new THREE.Raycaster();\nconst pointer = new THREE.Vector2();\naddEventListener('pointermove', (e) => pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));\n// in the loop:\nraycaster.setFromCamera(pointer, camera);\nconst hit = raycaster.intersectObjects(scene.children, true)[0];\n` },
    { name: 'lil-gui panel', code: `import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.20/+esm';\nconst gui = new GUI();\nconst params = { speed: 1, color: '#7c5cff' };\ngui.add(params, 'speed', 0, 5);\ngui.addColor(params, 'color');\n` },
    { name: 'Texture loader (sRGB)', code: `const tex = new THREE.TextureLoader().load('texture.jpg');\ntex.colorSpace = THREE.SRGBColorSpace;\ntex.anisotropy = renderer.capabilities.getMaxAnisotropy();\n` },
    { name: 'InstancedMesh', code: `const COUNT = 1000;\nconst inst = new THREE.InstancedMesh(geometry, material, COUNT);\nconst dummy = new THREE.Object3D();\nfor (let i = 0; i < COUNT; i++) {\n  dummy.position.set(Math.random() * 10 - 5, 0, Math.random() * 10 - 5);\n  dummy.updateMatrix();\n  inst.setMatrixAt(i, dummy.matrix);\n}\nscene.add(inst);\n` },
    { name: 'Fit camera to object', code: `function frame(object, offset = 1.4) {\n  const box = new THREE.Box3().setFromObject(object);\n  const size = box.getSize(new THREE.Vector3()).length();\n  const center = box.getCenter(new THREE.Vector3());\n  camera.near = size / 100; camera.far = size * 100; camera.updateProjectionMatrix();\n  camera.position.copy(center).add(new THREE.Vector3(size, size * 0.6, size).multiplyScalar(offset * 0.5));\n  controls?.target.copy(center);\n}\n` },
    { name: 'Dispose an object', code: `function dispose(obj) {\n  obj.traverse((o) => {\n    o.geometry?.dispose();\n    for (const m of [].concat(o.material || [])) {\n      for (const v of Object.values(m)) if (v?.isTexture) v.dispose();\n      m.dispose();\n    }\n  });\n  obj.removeFromParent();\n}\n` },
    { name: 'Bloom pass', code: `import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';\nimport { RenderPass } from 'three/addons/postprocessing/RenderPass.js';\nimport { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';\nimport { OutputPass } from 'three/addons/postprocessing/OutputPass.js';\nconst composer = new EffectComposer(renderer);\ncomposer.addPass(new RenderPass(scene, camera));\ncomposer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 1, 0.4, 0.2));\ncomposer.addPass(new OutputPass());\n// in the loop: composer.render();\n` },
    { name: 'Tween value (lerp + easing)', code: `// smoothly approaches target; frame-rate independent\nfunction damp(current, target, lambda, dt) { return THREE.MathUtils.damp(current, target, lambda, dt); }\nmesh.position.x = damp(mesh.position.x, targetX, 6, dt);\n` },
    { name: 'Stats.js', code: `import Stats from 'three/addons/libs/stats.module.js';\nconst stats = new Stats();\ndocument.body.append(stats.dom);\n// in the loop: stats.update();\n` },
    { name: 'Screen-space UV in shader', code: `// fragment shader\nvec2 uv = gl_FragCoord.xy / uResolution.xy;\n` },
    { name: 'Fog', code: `scene.fog = new THREE.Fog(0x101014, 10, 60); // or new THREE.FogExp2(0x101014, 0.03)\n` },
  ];

  const SHADERS = {
    'Gradient + time': `void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 col = 0.5 + 0.5 * cos(uTime + uv.xyx + vec3(0.0, 2.0, 4.0));
  fragColor = vec4(col, 1.0);
}`,
    'Value noise clouds': `float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; } return v; }
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.y;
  float n = fbm(uv * 3.0 + vec2(uTime * 0.1, 0.0));
  vec3 col = mix(vec3(0.05, 0.07, 0.15), vec3(0.9, 0.5, 0.25), n);
  fragColor = vec4(col, 1.0);
}`,
    'Raymarched sphere': `float map(vec3 p) { return length(p) - 1.0 + 0.08 * sin(p.x * 8.0 + uTime) * sin(p.y * 8.0) * sin(p.z * 8.0); }
vec3 normal(vec3 p) { vec2 e = vec2(0.001, 0.0); return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx))); }
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  vec3 ro = vec3(0.0, 0.0, 3.0), rd = normalize(vec3(uv, -1.5));
  float t = 0.0;
  for (int i = 0; i < 96; i++) { float d = map(ro + rd * t); if (d < 0.001 || t > 20.0) break; t += d; }
  vec3 col = vec3(0.04, 0.05, 0.08);
  if (t < 20.0) {
    vec3 n = normal(ro + rd * t);
    float diff = max(dot(n, normalize(vec3(0.6, 0.8, 0.4))), 0.0);
    col = vec3(0.49, 0.36, 1.0) * diff + 0.15 * vec3(0.9, 0.5, 0.2) * pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  }
  fragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}`,
    'Shadertoy style (mainImage)': `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float d = length(uv - iMouse.xy / iResolution.xy);
  fragColor = vec4(vec3(smoothstep(0.2, 0.0, d)) * vec3(1.0, 0.6, 0.2), 1.0);
}`,
    'Mouse ripple': `void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.y;
  vec2 m = uMouse / uResolution.y;
  float d = length(uv - m);
  float w = sin(d * 40.0 - uTime * 6.0) * exp(-d * 4.0);
  fragColor = vec4(vec3(0.1, 0.12, 0.2) + w * vec3(0.5, 0.4, 1.0), 1.0);
}`,
  };

  // (Nov 9) Scenes v2 (WebGPU, docs/upgrades/scenes-v2-webgpu.md): a v2 layer is a module whose default export fills
  // the scene and camera it is given. ONE renderer draws the whole scene (tools/three-sandbox.html "Scenes v2"): layer
  // code never makes a renderer, a canvas or an animation loop. Shaders are TSL node materials (tsl.*), not GLSL.
  //   V2_LAYERS: layers for a v2 scene (the ＋ Layer picker of a v2 scene, /template in one) · V2_TEMPLATES: whole v2 scenes
  const V2_HEAD = '// v2 layer (WebGPU): fill `scene` and `camera`; the scene\'s one renderer draws it. No renderer, canvas or loop here.\n';
  const V2_LAYERS = [
    {
      id: 'v2-backdrop', name: 'Backdrop (v2)', desc: 'A slow gradient behind everything (a TSL background node)',
      code: `${V2_HEAD}export default ({ THREE, tsl, scene, tweak, audio, onFrame }) => {
  const { color, mix, screenUV, sin, time, uniform, float } = tsl;
  const P = tweak({
    top: { value: '#2a0f3a', label: 'Top', group: 'Look' },
    bottom: { value: '#05060c', label: 'Bottom', group: 'Look' },
    breathe: { value: 0.4, min: 0, max: 1, label: 'Breathe on bass', group: 'Music' },
  });
  const top = uniform(new THREE.Color(P.top)); const bottom = uniform(new THREE.Color(P.bottom)); const bass = uniform(0);
  const k = screenUV.y.oneMinus().add(sin(time.mul(0.3)).mul(0.05)).add(bass.mul(0.25)).clamp(0, 1);
  scene.backgroundNode = mix(bottom, top, k);
  onFrame(() => { top.value.set(P.top); bottom.value.set(P.bottom); bass.value = audio.bass * P.breathe; });
};
`,
    },
    {
      id: 'v2-knot', name: 'Glow knot (v2)', desc: 'A lit knot whose surface ripples and glows on the bass (node material)',
      code: `${V2_HEAD}export default ({ THREE, tsl, scene, camera, tweak, audio, onFrame }) => {
  const { mix, uniform, sin, time, positionLocal, normalLocal, vec3 } = tsl;
  const P = tweak({
    speed: { value: 1, min: 0, max: 4, label: 'Spin', group: 'Motion' },
    color: { value: '#7c5cff', label: 'Colour', group: 'Look' },
    glow: { value: 1, min: 0, max: 3, label: 'Glow', group: 'Look' },
    pulse: { value: 0.6, min: 0, max: 2, label: 'Pulse on bass', group: 'Music' },
  });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 4, 5); scene.add(sun);
  const bass = uniform(0); const tint = uniform(new THREE.Color(P.color)); const glow = uniform(P.glow);
  const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.2 });
  mat.colorNode = mix(tint, vec3(1, 0.85, 0.6), sin(positionLocal.y.mul(4).add(time.mul(2))).mul(0.5).add(0.5).mul(0.35));
  mat.emissiveNode = tint.mul(glow.mul(bass.mul(0.8).add(0.15)));
  mat.positionNode = positionLocal.add(normalLocal.mul(bass.mul(0.08).mul(sin(positionLocal.x.mul(10).add(time.mul(6))))));
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.32, 256, 48), mat);
  scene.add(knot);
  camera.position.set(0, 0, 5);
  onFrame((t, dt) => {
    bass.value = audio.bass * P.pulse; tint.value.set(P.color); glow.value = P.glow;
    knot.rotation.x += dt * 0.3 * P.speed; knot.rotation.y += dt * 0.5 * P.speed;
  });
};
`,
    },
    {
      id: 'v2-particles', name: 'Particle field (v2)', desc: '30,000 points drifting, bursting outwards on the kick (instanced sprites)',
      code: `${V2_HEAD}export default ({ THREE, tsl, scene, camera, tweak, audio, onFrame }) => {
  const { uniform, instanceIndex, hash, vec3, sin, cos, time, float, mix, color, uv } = tsl;
  const P = tweak({
    count: { value: 30, min: 1, max: 200, step: 1, label: 'Particles (thousands)', group: 'Look' },
    size: { value: 0.03, min: 0.005, max: 0.2, label: 'Size', group: 'Look' },
    tint: { value: '#62d0ff', label: 'Colour', group: 'Look' },
    burst: { value: 1, min: 0, max: 3, label: 'Burst on kick', group: 'Music' },
  });
  const N = Math.round(P.count * 1000);
  const kick = uniform(0); const tint = uniform(new THREE.Color(P.tint));
  const i = float(instanceIndex);
  // each point on a sphere shell (from its index), breathing out on the kick
  const a = hash(i).mul(6.2832); const b = hash(i.add(7.1)).mul(2).sub(1); const r = hash(i.add(3.3)).mul(2).add(1.5);
  const s = b.mul(b).oneMinus().sqrt();
  const dir = vec3(s.mul(cos(a.add(time.mul(0.05)))), b, s.mul(sin(a.add(time.mul(0.05)))));
  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.positionNode = dir.mul(r.add(kick.mul(0.6)));
  mat.colorNode = mix(tint, color('#ffffff'), kick.mul(0.5));
  mat.opacityNode = uv().sub(0.5).length().mul(2).oneMinus().clamp(0, 1).pow(2);
  mat.scaleNode = float(P.size);
  const pts = new THREE.Sprite(mat); pts.count = N; pts.frustumCulled = false;
  scene.add(pts);
  camera.position.set(0, 0, 7);
  onFrame((t, dt) => { kick.value = Math.max(kick.value * Math.exp(-dt * 6), (audio.kick || audio.bass) * P.burst); tint.value.set(P.tint); pts.rotation.y += dt * 0.05; });
};
`,
    },
  ];
  const V2_TEMPLATES = [
    { id: 'v2-music', name: 'Music visual (v2)', desc: 'Backdrop, particles and a glowing knot on one WebGPU renderer', layers: ['v2-backdrop', 'v2-particles', 'v2-knot'] },
    { id: 'v2-empty', name: 'Empty (v2)', desc: 'One v2 layer with a lit cube to start from', layers: ['v2-cube'] },
  ];
  V2_LAYERS.push({
    id: 'v2-cube', name: 'Cube (v2)', desc: 'A lit cube that turns (a starting point)',
    code: `${V2_HEAD}export default ({ THREE, tsl, scene, camera, tweak, onFrame }) => {
  const P = tweak({ speed: { value: 1, min: 0, max: 4, label: 'Spin' }, color: { value: '#7c5cff', label: 'Colour' } });
  scene.background = new THREE.Color('#15181e');
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(4, 6, 3); scene.add(sun);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardNodeMaterial({ color: P.color, roughness: 0.4 }));
  scene.add(cube);
  camera.position.set(3, 2, 5); camera.lookAt(0, 0, 0);
  onFrame((t, dt) => { cube.rotation.x += dt * 0.4 * P.speed; cube.rotation.y += dt * 0.6 * P.speed; cube.material.color.set(P.color); });
};
`,
  });
  // (Nov 10, fastkit) The fast kit: ready v2 layers for the expensive things (a spectrum visualizer, a particle
  // simulation, glow, camera tracking, footage), each written the cheap way: ONE draw call however many pieces, the
  // work in the shader (TSL) or a compute shader, data handed to the graphics card once a frame (a data texture / a
  // uniform array), nothing made inside onFrame (typed arrays and vectors are made once and refilled). The rules are
  // the director's `three_do help fast` (mcp/three-guide.js); the check is dev/checks/fastkit.js.
  V2_LAYERS.push(
    {
      id: 'v2-spectrum', fast: true, name: 'Spectrum (v2)', desc: 'The song as bars, a ring or a waveform: up to 512 pieces in one draw, fed by one small data texture a frame',
      code: `${V2_HEAD}// Fast: ONE instanced quad. The levels go to the graphics card once a frame as a 512 × 1 data texture; the shader places every piece.
export default ({ THREE, tsl, scene, camera, tweak, audio, onFrame }) => {
  const { uniform, texture, instanceIndex, positionGeometry, float, vec2, vec3, mix, sin, cos, varying } = tsl;
  const P = tweak({
    style: { value: 'bars', options: ['bars', 'ring', 'wave'], label: 'Style', group: 'Shape' },
    bars: { value: 96, min: 8, max: 512, step: 1, label: 'How many', group: 'Shape' },
    size: { value: 1, min: 0.2, max: 2.5, label: 'Size', group: 'Shape' },
    height: { value: 1, min: 0, max: 3, label: 'Height', group: 'Shape' },
    thick: { value: 0.7, min: 0.05, max: 1, label: 'Thickness', group: 'Shape' },
    mirror: { value: true, label: 'Mirror up and down', group: 'Shape' },
    low: { value: '#ff3cac', label: 'Low notes', group: 'Color' },
    high: { value: '#48ddff', label: 'High notes', group: 'Color' },
    glow: { value: 1.2, min: 0, max: 4, label: 'Glow', group: 'Color' },
    smooth: { value: 0.6, min: 0, max: 0.95, label: 'Smoothing', group: 'Music', hint: 'Higher = calmer, slower to fall' },
    punch: { value: 0.5, min: 0, max: 2, label: 'Punch on bass', group: 'Music' },
    spin: { value: 0, min: -2, max: 2, label: 'Spin', group: 'Motion' },
  });
  const MAX = 512; const W = 6; const R = 1.3;
  // made once, refilled every frame
  const lv = new Float32Array(MAX); const px = new Uint8Array(MAX); const edge = new Uint16Array(MAX + 1);
  const tex = new THREE.DataTexture(px, MAX, 1, THREE.RedFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const n = uniform(96); const ring = uniform(0); const wave = uniform(0); const mir = uniform(1);
  const hgt = uniform(1); const thick = uniform(0.7); const glow = uniform(1);
  const low = uniform(new THREE.Color(P.low)); const high = uniform(new THREE.Color(P.high));
  const i = float(instanceIndex); const u = i.add(0.5).div(n);
  const at = (k) => texture(tex, vec2(k.add(0.5).div(MAX), 0.5)).r;
  const a = at(i); const b = at(i.add(1).min(n.sub(1))); const a1 = a.add(0.015);
  const q = positionGeometry; const step = float(W).div(n); const x = u.sub(0.5).mul(W);
  // the three styles, all from the piece's number: the style sliders only mix them
  const bars = vec3(x.add(q.x.mul(step).mul(thick)), mix(q.y.add(0.5).mul(a1).mul(hgt).sub(1.2), q.y.mul(2).mul(a1).mul(hgt), mir), 0);
  const ang = u.mul(6.2832); const rr = float(R).add(mix(q.y.add(0.5), q.y, mir).mul(a1).mul(hgt)); const tt = q.x.mul(6.2832 * R).div(n).mul(thick);
  const rings = vec3(cos(ang).mul(rr).sub(sin(ang).mul(tt)), sin(ang).mul(rr).add(cos(ang).mul(tt)), 0);
  const line = vec3(x.add(q.x.mul(step)), mix(a, b, q.x.add(0.5)).sub(0.5).mul(2).mul(hgt).add(q.y.mul(thick).mul(0.12)), 0);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.positionNode = mix(mix(bars, rings, ring), line, wave);
  mat.colorNode = mix(low, high, varying(u)).mul(varying(mix(a, float(1), wave)).mul(glow).add(0.25));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.count = 96; mesh.frustumCulled = false;
  scene.add(mesh);
  camera.position.set(0, 0, 6);
  let lastN = 0;
  onFrame((t, dt) => {
    const N = Math.max(8, Math.min(MAX, Math.round(P.bars)));
    if (N !== lastN) { lastN = N; for (let k = 0; k <= N; k += 1) edge[k] = Math.min(1023, Math.round(2 * Math.pow(360, k / N))); } // (bars spaced like notes: ≈ 40 Hz … 15 kHz)
    const isWave = P.style === 'wave'; const fall = 1 - Math.pow(P.smooth, dt * 60);
    if (isWave) {
      const w = audio.waveform; const st = w.length / N;
      for (let k = 0; k < N; k += 1) { lv[k] += (w[(k * st) | 0] - lv[k]) * Math.max(fall, 0.05); px[k] = 128 + Math.max(-127, Math.min(127, lv[k] * 127)); }
    } else {
      const s = audio.spectrum;
      for (let k = 0; k < N; k += 1) {
        const lo = edge[k]; const hi = Math.max(lo + 1, edge[k + 1]); let m = 0;
        for (let j = lo; j < hi; j += 1) m += s[j];
        const v = m / ((hi - lo) * 255);
        lv[k] = v > lv[k] ? v : lv[k] + (v - lv[k]) * fall; // (up at once, down smoothly)
        px[k] = lv[k] * 255;
      }
    }
    tex.needsUpdate = true; // one 512-byte upload a frame
    mesh.count = N; n.value = N;
    ring.value = P.style === 'ring' ? 1 : 0; wave.value = isWave ? 1 : 0; mir.value = P.mirror ? 1 : 0;
    hgt.value = P.height; thick.value = P.thick; glow.value = P.glow;
    low.value.set(P.low); high.value.set(P.high);
    mesh.scale.setScalar(P.size * (1 + audio.bass * P.punch * 0.25));
    mesh.rotation.z += dt * P.spin;
  });
  return () => tex.dispose();
};
`,
    },
    {
      id: 'v2-swarm', fast: true, name: 'Particle swarm (v2)', desc: '150,000+ particles simulated on the graphics card (a compute shader): they swirl, burst on the kick, one draw',
      code: `${V2_HEAD}// Fast: the simulation is a compute shader (every particle moved on the graphics card), drawn as ONE instanced quad.
export default ({ THREE, tsl, scene, camera, tweak, audio, onFrame }) => {
  const { Fn, If, uniform, instancedArray, instanceIndex, hash, float, vec3, vec4, sin, cos, mix, uv, positionGeometry, modelViewMatrix, cameraProjectionMatrix } = tsl;
  const P = tweak({
    count: { value: 150, min: 10, max: 1000, step: 10, label: 'Particles (thousands)', group: 'Look', hint: 'Still one draw: the graphics card moves them' },
    size: { value: 0.02, min: 0.004, max: 0.1, label: 'Size', group: 'Look' },
    bright: { value: 0.6, min: 0, max: 3, label: 'Brightness', group: 'Look' },
    slow: { value: '#3a6bff', label: 'Slow ones', group: 'Color' },
    fast: { value: '#ffd9a0', label: 'Fast ones', group: 'Color' },
    spread: { value: 2.5, min: 0.5, max: 6, label: 'Spread', group: 'Motion' },
    speed: { value: 1, min: 0, max: 3, label: 'Speed', group: 'Motion' },
    swirl: { value: 1, min: 0, max: 4, label: 'Swirl', group: 'Motion' },
    pull: { value: 0.5, min: 0, max: 3, label: 'Pull to the centre', group: 'Motion' },
    life: { value: 6, min: 1, max: 20, label: 'Life (seconds)', group: 'Motion' },
    burst: { value: 1.5, min: 0, max: 5, label: 'Burst on kick', group: 'Music' },
    bass: { value: 0.6, min: 0, max: 3, label: 'Swirl on bass', group: 'Music' },
  });
  const N = Math.round(P.count * 1000);
  // each particle: where it is + the life it has left · how fast it goes (kept on the graphics card)
  const pos = instancedArray(N, 'vec4'); const vel = instancedArray(N, 'vec4');
  const A = pos.value.array; const r0 = P.spread;
  for (let k = 0; k < N; k += 1) {
    const a = Math.random() * 6.2832; const b = Math.random() * 2 - 1; const c = Math.sqrt(1 - b * b); const r = r0 * Math.cbrt(Math.random());
    A[k * 4] = c * Math.cos(a) * r; A[k * 4 + 1] = b * r; A[k * 4 + 2] = c * Math.sin(a) * r; A[k * 4 + 3] = Math.random();
  }
  const step = uniform(0); const seed = uniform(0); const flowT = uniform(0); const life = uniform(6); const spread = uniform(2.5);
  const swirl = uniform(1); const pull = uniform(0.5); const kick = uniform(0); const drag = uniform(1);
  const tick = Fn(() => {
    const p = pos.element(instanceIndex); const v = vel.element(instanceIndex); const id = float(instanceIndex);
    const left = p.w.sub(step.div(life).mul(hash(id).mul(0.6).add(0.7))).toVar();
    If(left.lessThanEqual(0), () => { // born again somewhere on a ball
      const s = id.add(seed);
      const a = hash(s).mul(6.2832); const b = hash(s.add(7.1)).mul(2).sub(1); const c = b.mul(b).oneMinus().sqrt();
      const dir = vec3(c.mul(cos(a)), b, c.mul(sin(a))).toVar();
      p.assign(vec4(dir.mul(spread).mul(hash(s.add(3.3)).mul(0.7).add(0.3)), 1));
      v.assign(vec4(dir.mul(0.15), 0));
    }).Else(() => {
      const q = p.xyz.mul(0.9).add(flowT);
      const flow = vec3(sin(q.z).add(cos(q.y)), sin(q.x).add(cos(q.z)), sin(q.y).add(cos(q.x)));
      const out = p.xyz.div(p.xyz.length().max(0.001));
      const nv = v.xyz.add(flow.mul(swirl).sub(p.xyz.mul(pull)).add(out.mul(kick)).mul(step)).mul(drag).toVar();
      v.assign(vec4(nv, 0));
      p.assign(vec4(p.xyz.add(nv.mul(step)), left));
    });
  })().compute(N);
  const slow = uniform(new THREE.Color(P.slow)); const fast = uniform(new THREE.Color(P.fast)); const bright = uniform(P.bright); const size = uniform(P.size);
  const pa = pos.toAttribute(); const va = vel.toAttribute();
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.vertexNode = cameraProjectionMatrix.mul(modelViewMatrix.mul(vec4(pa.xyz, 1)).add(vec4(positionGeometry.xy.mul(size), 0, 0))); // each one a small square facing the camera
  mat.colorNode = mix(slow, fast, va.xyz.length().mul(0.5).clamp(0, 1)).mul(bright);
  mat.opacityNode = uv().sub(0.5).length().mul(2).oneMinus().clamp(0, 1).pow(2).mul(pa.w.mul(pa.w.oneMinus()).mul(4).clamp(0, 1)); // (a soft dot, fading in and out over its life)
  const pts = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); pts.count = N; pts.frustumCulled = false; // (its own geometry: gone with the layer, buffers and all)
  pts.onBeforeRender = (renderer) => { renderer.compute(tick); }; // the simulation's step, on the scene's one renderer, just before its draw
  scene.add(pts);
  camera.position.set(0, 0, 7);
  let env = 0; let frame = 0;
  onFrame((t, dt) => {
    const h = Math.min(dt, 1 / 30) * P.speed;
    env = Math.max(env * Math.exp(-dt * 8), audio.kick || audio.bass);
    frame = (frame + 1) % 4096;
    step.value = h; seed.value = frame * 1.37; flowT.value = t * 0.25; life.value = P.life; spread.value = P.spread;
    swirl.value = P.swirl * (1 + audio.bass * P.bass); pull.value = P.pull; kick.value = env * P.burst * 4; drag.value = Math.exp(-h * 2.5);
    slow.value.set(P.slow); fast.value.set(P.fast); bright.value = P.bright; size.value = P.size;
    pts.rotation.y += dt * 0.05;
  });
  return () => tick.dispose();
};
`,
    },
    {
      id: 'v2-glow', fast: true, name: 'Glow lights (v2)', desc: 'Glowing orbs, rings or stars with their soft light drawn in the same pass: a bloom look with no bloom pass, one draw',
      code: `${V2_HEAD}// Fast: the glow is part of each shape's own shader (a bright core + a soft halo, added to the picture): no bloom pass, no composer, ONE draw.
export default ({ THREE, tsl, scene, camera, tweak, audio, onFrame }) => {
  const { uniform, instanceIndex, positionGeometry, hash, float, vec3, mix, sin, uv, time, abs, exp, smoothstep, varying } = tsl;
  const P = tweak({
    shape: { value: 'orbs', options: ['orbs', 'rings', 'stars'], label: 'Shape', group: 'Shape' },
    count: { value: 60, min: 1, max: 2000, step: 1, label: 'How many', group: 'Shape' },
    size: { value: 0.3, min: 0.05, max: 3, label: 'Size', group: 'Shape' },
    spread: { value: 3, min: 0, max: 8, label: 'Spread', group: 'Shape' },
    depth: { value: 2, min: 0, max: 8, label: 'Depth', group: 'Shape' },
    halo: { value: 1, min: 0, max: 3, label: 'Glow', group: 'Look', hint: 'The soft light around each shape' },
    bright: { value: 1, min: 0, max: 4, label: 'Brightness', group: 'Look' },
    a: { value: '#ff9a3c', label: 'Colour', group: 'Look' },
    b: { value: '#7c5cff', label: 'Second colour', group: 'Look' },
    drift: { value: 0.4, min: 0, max: 3, label: 'Drift', group: 'Motion' },
    twinkle: { value: 0.3, min: 0, max: 1, label: 'Twinkle', group: 'Motion' },
    flare: { value: 1, min: 0, max: 4, label: 'Flare on kick', group: 'Music' },
  });
  const ring = uniform(0); const star = uniform(0); const size = uniform(P.size); const spread = uniform(P.spread); const depth = uniform(P.depth);
  const halo = uniform(P.halo); const bright = uniform(P.bright); const ca = uniform(new THREE.Color(P.a)); const cb = uniform(new THREE.Color(P.b));
  const drift = uniform(P.drift); const twinkle = uniform(P.twinkle); const kick = uniform(0);
  const i = float(instanceIndex); const h1 = hash(i); const h2 = hash(i.add(1.7)); const h3 = hash(i.add(5.3)); const h4 = hash(i.add(9.1));
  const ph = time.mul(drift).mul(h4.mul(0.6).add(0.4));
  const centre = vec3(h1.sub(0.5).mul(spread).mul(2).add(sin(ph.add(h2.mul(40))).mul(0.4)), h2.sub(0.5).mul(spread).mul(2).add(sin(ph.mul(0.8).add(h3.mul(40))).mul(0.4)), h3.sub(0.5).mul(depth));
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.positionNode = centre.add(positionGeometry.mul(size.mul(h4.mul(0.8).add(0.4)).mul(kick.mul(0.25).add(1)).mul(4))); // (the quad is 4 × the shape: room for its halo)
  // the picture of one light, from the middle of its quad outwards
  const c = uv().sub(0.5).mul(2); const d = c.length(); const edge = d.oneMinus().clamp(0, 1);
  const orbCore = smoothstep(0.1, 0.16, d).oneMinus();
  const e = abs(d.sub(0.4)); const ringCore = smoothstep(0.015, 0.035, e).oneMinus(); const ringHalo = exp(e.mul(e).mul(-90)).mul(edge.sqrt());
  const streak = exp(abs(c.y).mul(-70)).mul(exp(abs(c.x).mul(-5))).add(exp(abs(c.x).mul(-70)).mul(exp(abs(c.y).mul(-5))));
  const core = mix(mix(orbCore, ringCore, ring), streak.add(smoothstep(0.05, 0.1, d).oneMinus()).min(1), star);
  const soft = mix(edge.pow(3), ringHalo, ring);
  const tw = varying(sin(time.mul(h1.mul(4).add(1)).add(h4.mul(40))).mul(0.5).add(0.5).mul(twinkle).oneMinus());
  const tint = varying(mix(ca, cb, h2));
  mat.colorNode = mix(tint, vec3(1, 1, 1), core.mul(0.45)).mul(core.add(soft.mul(halo).mul(0.5))).mul(bright).mul(tw).mul(kick.mul(0.6).add(1));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.count = Math.round(P.count); mesh.frustumCulled = false;
  scene.add(mesh);
  camera.position.set(0, 0, 7);
  onFrame((t, dt) => {
    mesh.count = Math.max(1, Math.round(P.count));
    ring.value = P.shape === 'rings' ? 1 : 0; star.value = P.shape === 'stars' ? 1 : 0;
    size.value = P.size; spread.value = P.spread; depth.value = P.depth; halo.value = P.halo; bright.value = P.bright;
    ca.value.set(P.a); cb.value.set(P.b); drift.value = P.drift; twinkle.value = P.twinkle;
    kick.value = Math.max(kick.value * Math.exp(-dt * 7), (audio.kick || audio.bass) * P.flare);
  });
};
`,
    },
    {
      id: 'v2-tracking', fast: true, name: 'Camera tracking (v2)', desc: 'Glowing markers with trails that follow your hands, body, face or movement from Camera in (they move by themselves while the camera is off)',
      code: `${V2_HEAD}// Fast: the tracked points are read once a frame into one uniform array (made once, refilled); every marker and its trail is ONE instanced quad.
// Needs Camera in (right-click the preview › 📷 Camera); hands / body / face need its tracking download. Off: the markers move by themselves.
export default ({ THREE, tsl, scene, camera, tweak, audio, size, onFrame }) => {
  const { uniform, uniformArray, instanceIndex, positionGeometry, float, vec3, mix, uv, varying, smoothstep } = tsl;
  const P = tweak({
    track: { value: 'hands', options: ['hands', 'body', 'face', 'movement', 'everything'], label: 'Follow', group: 'Tracking', hint: 'Only what you pick is tracked: fewer = lighter' },
    steady: { value: 0.5, min: 0, max: 0.95, label: 'Steadiness', group: 'Tracking', hint: 'Higher = smoother, a little later' },
    reach: { value: 1, min: 0.5, max: 1.5, label: 'Reach', group: 'Tracking', hint: 'How far across the frame the markers travel' },
    demo: { value: true, label: 'Move by itself while the camera is off', group: 'Tracking' },
    size: { value: 0.5, min: 0.05, max: 1.5, label: 'Marker size', group: 'Look' },
    trail: { value: 16, min: 1, max: 32, step: 1, label: 'Trail length', group: 'Look' },
    color: { value: '#48ddff', label: 'Colour', group: 'Look' },
    tail: { value: '#ff3cac', label: 'Trail colour', group: 'Look' },
    glow: { value: 1.2, min: 0, max: 4, label: 'Glow', group: 'Look' },
    grow: { value: 1, min: 0, max: 3, label: 'Grow on pinch / open mouth', group: 'Reactions' },
    pulse: { value: 0.3, min: 0, max: 2, label: 'Pulse on bass', group: 'Reactions' },
  });
  // [x, y, the feature that says it is seen, above what] per point; the sets say which are read (the tracker runs only those)
  const PTS = [['handX', 'handY', 'hands', 0.25], ['hand2X', 'hand2Y', 'hands', 0.75], ['headX', 'headY', 'person', 0.3], ['wristLX', 'wristLY', 'person', 0.3], ['wristRX', 'wristRY', 'person', 0.3], ['bodyX', 'bodyY', 'person', 0.3], ['faceX', 'faceY', '', 0], ['camX', 'camY', 'camMotion', 0.01]];
  const SETS = { hands: [0, 1], body: [2, 3, 4, 5], face: [6], movement: [7], everything: [0, 1, 2, 3, 4, 5, 6, 7] };
  const NP = PTS.length; const T = 32;
  // made once, refilled: each point now (x, y, seen) and its trail (the newest first)
  const now = new Float32Array(NP * 3); for (let k = 0; k < NP; k += 1) { now[k * 3] = 0.5; now[k * 3 + 1] = 0.5; }
  const hist = Array.from({ length: NP * T }, () => new THREE.Vector4(0.5, 0.5, 0, 0));
  const H = uniformArray(hist, 'vec4');
  const halfW = uniform(1); const halfH = uniform(1); const sz = uniform(P.size); const len = uniform(P.trail); const glow = uniform(P.glow);
  const col = uniform(new THREE.Color(P.color)); const tail = uniform(new THREE.Color(P.tail));
  const i = float(instanceIndex); const age = i.sub(i.div(T).floor().mul(T)); const fade = age.div(len).oneMinus().clamp(0, 1);
  const h = H.element(instanceIndex);
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mat.positionNode = vec3(h.x.sub(0.5).mul(2).mul(halfW), h.y.sub(0.5).mul(2).mul(halfH), 0).add(positionGeometry.mul(sz.mul(fade.mul(0.7).add(0.3))));
  const d = uv().sub(0.5).length().mul(2); const edge = d.oneMinus().clamp(0, 1);
  const light = varying(h.z.mul(fade));
  mat.colorNode = mix(tail, col, varying(fade)).mul(smoothstep(0.2, 0.3, d).oneMinus().mul(1.4).add(edge.pow(3).mul(glow))).mul(light);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.count = NP * T; mesh.frustumCulled = false;
  scene.add(mesh);
  camera.position.set(0, 0, 5);
  const cam = globalThis.webcam || null; const F = cam ? cam.feat : null;
  let acc = 0;
  onFrame((t, dt) => {
    const set = SETS[P.track] || SETS.hands; const live = Boolean(cam && cam.on); const k0 = 1 - Math.pow(P.steady, dt * 60);
    for (let k = 0; k < NP; k += 1) now[k * 3 + 2] = 0;
    for (let j = 0; j < set.length; j += 1) {
      const k = set[j]; const p = PTS[k]; let x = now[k * 3]; let y = now[k * 3 + 1]; let on = 0;
      if (live) { x = F[p[0]]; y = F[p[1]]; on = p[2] ? (F[p[2]] > p[3] ? 1 : 0) : 1; }
      else if (P.demo) { x = 0.5 + 0.32 * Math.sin(t * (0.7 + k * 0.13) + k * 2.1); y = 0.5 + 0.28 * Math.cos(t * (0.9 + k * 0.11) + k); on = 1; }
      now[k * 3] += (x - now[k * 3]) * k0; now[k * 3 + 1] += (y - now[k * 3 + 1]) * k0; now[k * 3 + 2] = on;
    }
    // the trails move on 60 times a second, whatever the screen's rate
    acc = Math.min(acc + dt, 0.1);
    while (acc >= 1 / 60) {
      acc -= 1 / 60;
      for (let k = 0; k < NP; k += 1) { const o = k * T; for (let a = T - 1; a > 0; a -= 1) hist[o + a].copy(hist[o + a - 1]); }
    }
    for (let k = 0; k < NP; k += 1) hist[k * T].set((now[k * 3] - 0.5) * P.reach + 0.5, (now[k * 3 + 1] - 0.5) * P.reach + 0.5, now[k * 3 + 2], 0);
    let big = 0;
    if (live && (P.track === 'hands' || P.track === 'everything')) big = F.pinch;
    if (live && (P.track === 'face' || P.track === 'everything')) big = Math.max(big, F.mouthOpen);
    halfH.value = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z; halfW.value = halfH.value * size.aspect;
    sz.value = P.size * (1 + big * P.grow + audio.bass * P.pulse); len.value = P.trail; glow.value = P.glow;
    col.value.set(P.color); tail.value.set(P.tail);
  });
};
`,
    },
    {
      id: 'v2-footage', fast: true, name: 'Footage backdrop (v2)', desc: 'A picture, a clip from References, the song\'s video or the camera filling the frame behind everything, graded in the same pass',
      code: `${V2_HEAD}// Fast: the picture IS the scene's background (one texture read per pixel, graded in the same shader): no canvas, no copy per frame.
// A video uploads a frame only when a new one is decoded.
export default ({ THREE, tsl, scene, tweak, audio, size, onFrame }) => {
  const { uniform, texture, screenUV, vec2, vec3, mix, luminance, smoothstep, step } = tsl;
  const names = Object.keys(globalThis.refs || {});
  const P = tweak({
    source: { value: 'auto', options: ['auto', 'song video', 'camera', ...names], label: 'Show', group: 'Picture', hint: 'auto: the song\\'s video, else the first picture or clip in References' },
    fit: { value: 'fill', options: ['fill', 'fit'], label: 'Fill or fit', group: 'Picture' },
    zoom: { value: 1, min: 0.5, max: 4, label: 'Zoom', group: 'Picture' },
    x: { value: 0, min: -1, max: 1, label: 'Left / right', group: 'Picture' },
    y: { value: 0, min: -1, max: 1, label: 'Up / down', group: 'Picture' },
    bright: { value: 1, min: 0, max: 2, label: 'Brightness', group: 'Look' },
    contrast: { value: 1, min: 0, max: 2, label: 'Contrast', group: 'Look' },
    sat: { value: 1, min: 0, max: 2, label: 'Colour amount', group: 'Look' },
    tint: { value: '#ffffff', label: 'Tint', group: 'Look' },
    edges: { value: 0.3, min: 0, max: 1, label: 'Darker edges', group: 'Look' },
    punch: { value: 0, min: 0, max: 0.5, label: 'Zoom on kick', group: 'Music' },
    flash: { value: 0, min: 0, max: 1, label: 'Flash on kick', group: 'Music' },
  });
  const blank = new THREE.DataTexture(new Uint8Array([10, 12, 20, 255]), 1, 1); blank.colorSpace = THREE.SRGBColorSpace; blank.needsUpdate = true;
  const scale = uniform(new THREE.Vector2(1, 1)); const off = uniform(new THREE.Vector2(0, 0));
  const bright = uniform(1); const contrast = uniform(1); const sat = uniform(1); const tint = uniform(new THREE.Color(P.tint)); const edges = uniform(0.3); const flash = uniform(0);
  const p = vec2(screenUV.x, screenUV.y.oneMinus()).sub(0.5).mul(scale).add(0.5).sub(off);
  const pic = texture(blank, p);
  const inside = step(0, p.x).mul(step(p.x, 1)).mul(step(0, p.y)).mul(step(p.y, 1)); // (fit: black outside the picture)
  const c1 = pic.rgb.sub(0.5).mul(contrast).add(0.5).mul(bright);
  const c2 = mix(vec3(luminance(c1)), c1, sat).mul(tint).mul(inside);
  scene.backgroundNode = c2.mul(smoothstep(0.35, 1, screenUV.sub(0.5).length().mul(1.4)).mul(edges).oneMinus()).add(flash).max(0);
  const cam = globalThis.webcam || null;
  let key = -2; let mine = null; let kick = 0;
  // which picture (0 the camera · 1 the song's video · 2… a reference · else none): asked again only when the choice (or what is loaded) changes
  const pick = (k) => {
    if (mine) { mine.dispose(); mine = null; }
    try {
      if (k === 0) { mine = cam ? cam.texture() : null; return mine; }
      if (k === 1) return media.texture();
      return k >= 2 ? refTexture(names[k - 2]) : null;
    } catch { return null; }
  };
  onFrame((t, dt) => {
    const s = P.source; const vid = Boolean(media.video);
    const k = s === 'camera' ? 0 : (s === 'auto' || s === 'song video') && vid ? 1 : s === 'auto' ? (names.length ? 2 : -1) : 2 + names.indexOf(s);
    if (k !== key) { key = k; pic.value = pick(k) || blank; }
    const img = pic.value.image; const iw = (img && (img.videoWidth || img.width)) || 1; const ih = (img && (img.videoHeight || img.height)) || 1;
    kick = Math.max(kick * Math.exp(-dt * 7), audio.kick || audio.bass);
    const r = size.aspect / (iw / ih); const fill = P.fit !== 'fit'; const z = 1 / (Math.max(0.05, P.zoom) * (1 + kick * P.punch));
    // fill: the picture covers the frame (cropped) · fit: all of it shows
    if (r > 1 === fill) scale.value.set(z, z / r); else scale.value.set(z * r, z);
    off.value.set(P.x * 0.5, P.y * 0.5);
    bright.value = P.bright; contrast.value = P.contrast; sat.value = P.sat; tint.value.set(P.tint); edges.value = P.edges; flash.value = kick * P.flash;
  });
  return () => { if (mine) mine.dispose(); blank.dispose(); };
};
`,
    },
  );
  V2_TEMPLATES.splice(1, 0, { id: 'v2-fast', name: 'Fast visualizer (v2)', desc: 'The fast kit together: backdrop, 150,000 simulated particles, glow lights and a spectrum, four draws', layers: ['v2-backdrop', 'v2-swarm', 'v2-glow', 'v2-spectrum'] });
  // a v2 layer by its id (the ＋ Layer menu of a v2 scene, three_add_layer { template: 'v2-…' })
  const v2Layer = (id) => V2_LAYERS.find((x) => x.id === id) || null;

  // a v2 template's layers as a scene's layers ({ id, name, code, slot })
  const v2Layers = (tpl) => (tpl?.layers || []).map((id, i) => { const L = V2_LAYERS.find((x) => x.id === id); return L ? { id: i ? `l${i + 1}` : 'main', name: L.name.replace(/ \(v2\)$/, ''), code: L.code, slot: i } : null; }).filter(Boolean);

  // (Nov 9) code written as a v2 layer (a default export, no renderer of its own): a director's new scene takes the v2
  // format then; old-style code (its own WebGLRenderer / animation loop) keeps the old format, so it still runs
  const isV2Code = (code) => /\bexport\s+default\b/.test(String(code || '')) && !/\bWebGL1?Renderer\b|\bsetAnimationLoop\b/.test(String(code || ''));
  return { isV2Code, TEMPLATES, SNIPPETS, SHADERS, V2_LAYERS, V2_TEMPLATES, v2Layers, v2Layer, VERSIONS: ['0.186.1', '0.180.0', '0.175.0', '0.170.0', '0.160.1'] };
})();
