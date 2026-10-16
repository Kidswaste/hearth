// Coin Run: walk the cube over the coins (WASD / arrows), Space jumps, the mouse looks around once captured (click).
// Deterministic: the level comes from ./assets/level.json, the floor's picture from ./assets/checker.svg.
// window.__game tells the checks what happened: assets in, frames, keys seen, pointer lock, the renderer's settings.
import * as THREE from 'three';

const G = window.__game = { ready: false, frames: 0, keys: {}, presses: 0, locked: false, assets: {}, score: 0, x: 0, z: 0 };
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0e1424');
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
scene.add(new THREE.HemisphereLight('#ffffff', '#223344', 1.4));
const sun = new THREE.DirectionalLight('#ffffff', 2); sun.position.set(4, 8, 3); scene.add(sun);

const level = await (await fetch('./assets/level.json')).json();
G.assets.level = level.name;
const tex = await new THREE.TextureLoader().loadAsync('./assets/checker.svg');
G.assets.texture = `${tex.image.width}x${tex.image.height}`;
tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(level.size / 2, level.size / 2); tex.colorSpace = THREE.SRGBColorSpace;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(level.size, level.size), new THREE.MeshStandardMaterial({ map: tex }));
floor.rotation.x = -Math.PI / 2; scene.add(floor);
const player = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), new THREE.MeshStandardMaterial({ color: '#ff8a3d' }));
player.position.y = 0.4; scene.add(player);
const coins = level.coins.map(([x, z]) => { const c = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 12, 24), new THREE.MeshStandardMaterial({ color: '#ffd23f', metalness: 0.6, roughness: 0.3 })); c.position.set(x, 0.6, z); scene.add(c); return c; });

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
addEventListener('keydown', (e) => { G.keys[e.code] = true; G.presses += 1; G.lastKey = e.code; });
addEventListener('keyup', (e) => { G.keys[e.code] = false; });
renderer.domElement.addEventListener('click', () => { if (!document.pointerLockElement) renderer.domElement.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => { G.locked = Boolean(document.pointerLockElement); });
let yaw = 0; let vy = 0;
addEventListener('mousemove', (e) => { if (document.pointerLockElement) yaw -= e.movementX * 0.003; });

let last = performance.now();
renderer.setAnimationLoop((t) => {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  const k = G.keys; const sp = 5 * dt;
  const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0); const s = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
  player.position.x += (Math.sin(yaw) * -f + Math.cos(yaw) * s) * sp; player.position.z += (Math.cos(yaw) * -f - Math.sin(yaw) * s) * sp;
  if (k.Space && player.position.y <= 0.41) vy = 5;
  vy -= 12 * dt; player.position.y = Math.max(0.4, player.position.y + vy * dt);
  for (const c of coins) { c.rotation.y += dt * 3; if (c.visible && c.position.distanceTo(player.position) < 0.7) { c.visible = false; G.score += 1; } }
  camera.position.set(player.position.x + Math.sin(yaw) * 6, 4, player.position.z + Math.cos(yaw) * 6); camera.lookAt(player.position);
  renderer.render(scene, camera);
  G.frames += 1; G.x = player.position.x; G.z = player.position.z;
  if (!G.ready) { const gl = renderer.getContext(); G.ready = true; G.gl = { antialias: gl.getContextAttributes().antialias, samples: gl.getParameter(gl.SAMPLES), pixelRatio: renderer.getPixelRatio(), dpr: devicePixelRatio }; }
});
