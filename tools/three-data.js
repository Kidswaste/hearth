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
  points.rotation.y += 0.002;
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
renderer.setAnimationLoop(() => { knot.rotation.y += 0.01; controls.update(); renderer.render(scene, camera); });
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

  return { TEMPLATES, SNIPPETS, SHADERS, VERSIONS: ['0.186.1', '0.180.0', '0.175.0', '0.170.0', '0.160.1'] };
})();
