// A typical Three Director layer (the owner's music-visual style: sliders in groups, time first, a little audio),
// used by dev/concise-measure.js to price a whole-layer rewrite against targeted edits. Not loaded by the app.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const P = tweak({
  count: { value: 24, min: 6, max: 60, step: 1, label: 'Rings', group: 'Shape', hint: 'How many rings make the tunnel' },
  radius: { value: 2.4, min: 0.5, max: 6, label: 'Radius', group: 'Shape' },
  thickness: { value: 0.035, min: 0.005, max: 0.2, label: 'Thickness', group: 'Shape' },
  gap: { value: 0.9, min: 0.2, max: 3, label: 'Gap', group: 'Shape', hint: 'Space between rings' },
  speed: { value: 0.8, min: 0, max: 4, label: 'Speed', group: 'Motion', hint: 'How fast you fly through' },
  twist: { value: 0.35, min: 0, max: 2, label: 'Twist', group: 'Motion' },
  wobble: { value: 0.2, min: 0, max: 1, label: 'Wobble', group: 'Motion' },
  colorA: { value: '#ff3cac', label: 'Color A', group: 'Color' },
  colorB: { value: '#2b86c5', label: 'Color B', group: 'Color' },
  bg: { value: '#05030a', label: 'Background', group: 'Color' },
  bloom: { value: 1.1, min: 0, max: 3, label: 'Glow', group: 'Look' },
  fov: { value: 70, min: 30, max: 110, label: 'Lens', group: 'Camera' },
  kick: { value: 0.4, min: 0, max: 1.5, label: 'Kick punch', group: 'Music', hint: 'How much the kick pushes the rings' },
});

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(P.bg);
scene.fog = new THREE.FogExp2(P.bg, 0.06);
const camera = new THREE.PerspectiveCamera(P.fov, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 0, 0);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), P.bloom, 0.6, 0.15);
composer.addPass(bloomPass);

const group = new THREE.Group();
scene.add(group);
const rings = [];
const colA = new THREE.Color();
const colB = new THREE.Color();

function build() {
  for (const r of rings) { group.remove(r); r.geometry.dispose(); r.material.dispose(); }
  rings.length = 0;
  colA.set(P.colorA);
  colB.set(P.colorB);
  for (let i = 0; i < P.count; i++) {
    const geo = new THREE.TorusGeometry(P.radius, P.thickness, 12, 160);
    const mat = new THREE.MeshBasicMaterial({ color: colA.clone().lerp(colB, i / Math.max(1, P.count - 1)), transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.z = -i * P.gap;
    ring.userData.base = -i * P.gap;
    group.add(ring);
    rings.push(ring);
  }
}
build();
let built = `${P.count}|${P.radius}|${P.thickness}|${P.gap}`;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

const ease = (t) => t * t * (3 - 2 * t);
let last = 0;
let travel = 0;
renderer.setAnimationLoop((now) => {
  const t = now / 1000;
  const dt = Math.min(0.05, t - last || 0);
  last = t;
  const key = `${P.count}|${P.radius}|${P.thickness}|${P.gap}`;
  if (key !== built) { build(); built = key; }
  colA.set(P.colorA);
  colB.set(P.colorB);
  scene.background.set(P.bg);
  scene.fog.color.set(P.bg);
  camera.fov = P.fov;
  camera.updateProjectionMatrix();
  bloomPass.strength = P.bloom * (1 + (audio.kick || 0) * P.kick);
  travel += dt * P.speed;
  const len = P.count * P.gap;
  rings.forEach((ring, i) => {
    let z = ring.userData.base + (travel % P.gap);
    if (z > 1) z -= len;
    ring.position.z = z;
    const k = ease(Math.min(1, Math.max(0, (z + len) / len)));
    ring.rotation.z = t * P.twist + i * 0.12;
    ring.position.x = Math.sin(t * 0.7 + i * 0.4) * P.wobble;
    ring.position.y = Math.cos(t * 0.5 + i * 0.3) * P.wobble;
    ring.scale.setScalar(1 + (audio.kick || 0) * P.kick * (1 - k) * 0.3);
    ring.material.color.copy(colA).lerp(colB, k);
    ring.material.opacity = 0.25 + 0.75 * k;
  });
  composer.render();
});
