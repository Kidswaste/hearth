// A game-like Lab scene in three layers for ▶ Play's checks (dev/checks/gamemode.js; dev/make-game-fixture.js writes it
// as JSON): a sky at the bottom, the world in the middle (a cube you steer with WASD / arrows, Space jumps, the mouse
// turns once captured, eight coins to pick up, a loop), and a HUD on top (the score as bars). Each layer makes its own
// three.js renderer, as Lab layers do; ▶ Play merges all three into ONE canvas / WebGL context.
// Deterministic: no randomness; the layers share their state through globalThis.__clink (the checks read it).
const SKY = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b1020');
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 500);
const N = 600; const pos = new Float32Array(N * 3);
for (let i = 0; i < N; i++) { const a = i * 2.399963; const y = 1 - (i / (N - 1)) * 2; const r = Math.sqrt(1 - y * y); pos.set([Math.cos(a) * r * 200, Math.abs(y) * 200, Math.sin(a) * r * 200], i * 3); }
const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfe0ff', size: 1.4, sizeAttenuation: false })));
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop(() => { const C = globalThis.__clink; camera.rotation.y = C ? C.yaw : 0; renderer.render(scene, camera); });`;

const WORLD = `import * as THREE from 'three';
const C = globalThis.__clink = globalThis.__clink || { score: 0, frames: 0, keys: {}, presses: 0, yaw: 0, x: 0, z: 0, locked: false };
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
scene.add(new THREE.HemisphereLight('#ffffff', '#203040', 1.3));
const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(5, 9, 4); scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: '#27324a', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const player = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: '#ff8a3d', roughness: 0.4 }));
player.position.y = 0.4; scene.add(player);
const coins = [];
for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const c = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.09, 12, 32), new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.7, roughness: 0.25 })); c.position.set(Math.cos(a) * (3 + i % 3), 0.6, Math.sin(a) * (3 + i % 3)); scene.add(c); coins.push(c); }
for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2 + i % 3, 16), new THREE.MeshStandardMaterial({ color: '#4fd1c5' })); const a = i / 6 * Math.PI * 2 + 0.3; p.position.set(Math.cos(a) * 9, (2 + i % 3) / 2, Math.sin(a) * 9); scene.add(p); }
addEventListener('keydown', (e) => { C.keys[e.code] = true; C.presses += 1; C.lastKey = e.code; });
addEventListener('keyup', (e) => { C.keys[e.code] = false; });
addEventListener('mousemove', (e) => { if (document.pointerLockElement) C.yaw -= e.movementX * 0.003; });
document.addEventListener('pointerlockchange', () => { C.locked = Boolean(document.pointerLockElement); });
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
let last = performance.now(); let vy = 0;
renderer.setAnimationLoop((t) => {
  const dt = Math.min(0.05, Math.max(0, (t - last) / 1000)); last = t;
  const k = C.keys; const sp = 5 * dt;
  const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0); const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  player.position.x += (Math.sin(C.yaw) * -f + Math.cos(C.yaw) * s) * sp; player.position.z += (Math.cos(C.yaw) * -f - Math.sin(C.yaw) * s) * sp;
  if (k.Space && player.position.y <= 0.41) vy = 5;
  vy -= 12 * dt; player.position.y = Math.max(0.4, player.position.y + vy * dt);
  for (const c of coins) { c.rotation.y += dt * 3; if (c.visible && c.position.distanceTo(player.position) < 0.8) { c.visible = false; C.score += 1; } }
  camera.position.set(player.position.x + Math.sin(C.yaw) * 7, 4.5, player.position.z + Math.cos(C.yaw) * 7); camera.lookAt(player.position);
  renderer.render(scene, camera);
  C.frames += 1; C.x = player.position.x; C.z = player.position.z;
});`;

const HUD = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
const bars = [];
for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.04), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.25 })); m.position.set(0.04 + i * 0.032, 0.94, 0); scene.add(m); bars.push(m); }
const frame = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.07), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35 })); frame.position.set(0.152, 0.94, -0.5); scene.add(frame);
renderer.setAnimationLoop(() => { const C = globalThis.__clink; const n = C ? C.score : 0; bars.forEach((b, i) => { b.material.opacity = i < n ? 1 : 0.25; }); renderer.render(scene, camera); });`;

module.exports = { name: 'Clink fixture', layers: [{ name: 'Sky', code: SKY }, { name: 'World', code: WORLD }, { name: 'HUD', code: HUD }] };
