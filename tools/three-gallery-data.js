// The Lab gallery's built-in starting points (round 27, gallery): whole music-visual scenes to start from, grouped
// by mood. Each one is a stack of normal layers (bottom first): a layer template of the FX pack, particles, type…
// (ThreeLayers.TEMPLATES by id, sometimes with a few slider values changed), a filter for the look
// (ThreeLayers.filterCode) or one of the new layers written here (an outrun sunset, a hyper tunnel, a liquid gradient,
// a chrome blob, a beat burst of particles, a kinetic title opener). Every slider has a plain name and a group, and
// every starting point has something that follows the music (its "Music" sliders: Kick punch, Bass…), driven by the
// demo beat until a song is loaded. tools/three-gallery.js shows them (with the owner's own scenes, history and the
// rest of the Lab's library) and turns one into layers.
const LabGalleryData = (() => {
  const q = (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : Array.isArray(v) ? `[${v.map(q).join(', ')}]` : String(v));
  // a tweak() spec written out: { key: { value, min, max, step, options, label, group, hint } }
  const specLines = (P) => Object.entries(P).map(([k, s]) => `  ${k}: { ${Object.entries(s).filter(([, v]) => v !== undefined).map(([a, v]) => `${a}: ${q(v)}`).join(', ')} },`).join('\n');
  // slider helpers: num(value, min, max, label, group, hint) · col('#hex', label, group) · pick(value, options, label, group)
  const num = (value, min, max, label, group = 'Look', hint, step) => ({ value, min, max, step, label, group, hint });
  const col = (value, label, group = 'Colors') => ({ value, label, group });
  const pick = (value, options, label, group = 'Text') => ({ value, options, label, group });
  const flag = (value, label, group = 'Look') => ({ value, label, group });
  const IMPORT = "import * as THREE from 'three';\n";

  // ---------- a full-screen shader layer: sliders are uniforms u_<key> (colors vec3), the music uKick, uSnare, uBass,
  // uLevel, uBeat, uHats; uTravel moves at the Speed slider and faster with the bass (travel: the bass' share) ----------
  const GLSL = `
uniform float uTime; uniform vec2 uRes; uniform float uKick; uniform float uSnare; uniform float uBass; uniform float uLevel; uniform float uBeat; uniform float uHats; uniform float uTravel;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
`;
  function shader({ desc, P, frag, travel = 'P.speed * (1 + bass * 0.6)' }) {
    const decl = Object.entries(P).filter(([, s]) => typeof s.value !== 'boolean').map(([k, s]) => `uniform ${typeof s.value === 'string' ? 'vec3' : 'float'} u_${k};`).join(' ');
    return `${IMPORT}
// ${desc}
const P = tweak({
${specLines(P)}
});

const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));

// every slider is a uniform u_<name> (colors are vec3); the music comes in as uKick, uSnare, uBass, uLevel, uBeat, uHats
const uniforms = { uTime: { value: 0 }, uRes: { value: new THREE.Vector2() }, uKick: { value: 0 }, uSnare: { value: 0 }, uBass: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 }, uHats: { value: 0 }, uTravel: { value: 0 } };
const params = Object.keys(P).filter((k) => typeof P[k] !== 'boolean').map((k) => [k, (uniforms['u_' + k] = { value: typeof P[k] === 'string' ? new THREE.Vector3() : 0 }), '']);
const setColor = (v, hex) => { const n = parseInt(hex.slice(1), 16); v.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const material = new THREE.ShaderMaterial({
  uniforms, transparent: true, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: \`${GLSL}${decl}
${frag.trim()}\`,
});
const scene = new THREE.Scene();
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
const camera = new THREE.Camera();

let kick = 0;
let snare = 0;
let bass = 0;
let last = 0;
renderer.setAnimationLoop((now) => {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  kick = Math.max(kick * 0.9, audio.kick);
  snare = Math.max(snare * 0.9, audio.snare);
  bass += (audio.bass - bass) * 0.2;
  uniforms.uTime.value = now / 1000;
  uniforms.uTravel.value += dt * (${travel});
  renderer.getDrawingBufferSize(uniforms.uRes.value);
  uniforms.uKick.value = kick;
  uniforms.uSnare.value = snare;
  uniforms.uBass.value = bass;
  uniforms.uLevel.value = audio.level;
  uniforms.uBeat.value = audio.beat;
  uniforms.uHats.value = audio.hats;
  for (const p of params) {
    const v = P[p[0]];
    if (typeof v === 'string') { if (v !== p[2]) { setColor(p[1].value, v); p[2] = v; } } else p[1].value = Number(v);
  }
  renderer.render(scene, camera);
});
`;
  }

  // ---------- the new layers ----------
  const OUTRUN = shader({
    desc: 'Outrun sunset: a striped sun over mountains and a neon grid racing to the horizon. Kicks light the grid, the bass swells the sun.',
    P: {
      skyTop: col('#12002b', 'Sky top'), skyLow: col('#ff3c7e', 'Sky at the horizon'), sunTop: col('#ffd75e', 'Sun top'), sunBottom: col('#ff2b8a', 'Sun bottom'),
      grid: col('#ff2bd6', 'Grid'), ground: col('#0b0018', 'Ground'), mountain: col('#1d0638', 'Mountains'),
      sunSize: num(0.24, 0.08, 0.45, 'Sun size', 'Shape'), sunY: num(0.12, -0.1, 0.4, 'Sun height', 'Shape'), horizon: num(0.42, 0.25, 0.65, 'Horizon', 'Shape'),
      mountains: num(1, 0, 2.5, 'Mountains', 'Shape'), stars: num(0.8, 0, 2, 'Stars', 'Shape'),
      speed: num(1, 0, 5, 'Grid speed', 'Motion'),
      punch: num(1, 0, 2, 'Kick lights the grid', 'Music', 'How bright the grid flashes on each kick'), bassGlow: num(0.8, 0, 2, 'Bass swells the sun', 'Music'),
    },
    travel: 'P.speed * (1 + bass * 0.8)',
    frag: `
void main() {
  float asp = uRes.x / max(uRes.y, 1.0);
  vec2 p = vec2((vUv.x - 0.5) * asp, vUv.y);
  float hz = u_horizon;
  vec3 col;
  if (p.y > hz) {
    float k = (p.y - hz) / (1.0 - hz);
    col = mix(u_skyLow, u_skyTop, pow(k, 0.55));
    vec2 sp = floor(p * 220.0);
    col += step(0.995, hash(sp)) * (0.5 + 0.5 * sin(uTime * 3.0 + hash(sp + 3.0) * 30.0)) * smoothstep(0.2, 1.0, k) * u_stars;
    vec2 sc = vec2(0.0, hz + u_sunY);
    float r = u_sunSize * (1.0 + uBass * u_bassGlow * 0.12);
    float d = length(p - sc);
    float sy = (p.y - sc.y) / r;
    float gaps = clamp((0.15 - sy) * 0.55, 0.0, 0.9);
    float stripes = step(gaps, fract(sy * 4.0 - uTime * 0.25));
    vec3 sunCol = mix(u_sunBottom, u_sunTop, clamp(sy * 0.5 + 0.5, 0.0, 1.0));
    float sun = (1.0 - smoothstep(r - 0.004, r, d)) * stripes;
    col = mix(col, sunCol, sun);
    col += sunCol * 0.45 * exp(-max(d - r, 0.0) * 7.0) * (0.6 + uBass * u_bassGlow);
    float m = hz + u_mountains * (0.03 + 0.11 * fbm(vec2(p.x * 2.2 + 3.0, 1.3))) * smoothstep(0.05, 0.55, abs(p.x));
    if (p.y < m) col = mix(u_mountain, u_skyLow * 0.35, smoothstep(hz, m, p.y) * 0.35);
    col += u_grid * smoothstep(0.004, 0.0, abs(p.y - m)) * 0.7 * step(0.001, m - hz);
  } else {
    float depth = hz - p.y;
    float z = 0.3 / max(depth, 0.0008);
    vec2 g = vec2(p.x * z * 1.6, z + uTravel * 2.0);
    vec2 gd = 0.5 - abs(fract(g) - 0.5);
    float lw = clamp(0.012 * z, 0.0, 0.5);
    float line = 1.0 - smoothstep(0.0, lw + 0.01, min(gd.x, gd.y));
    float fade = exp(-z * 0.06);
    col = u_ground + u_grid * line * fade * (0.8 + uKick * u_punch * 1.6);
    col += u_skyLow * 0.55 * exp(-depth * 22.0);
  }
  vec2 v = vUv - 0.5;
  col *= 1.0 - dot(v, v) * 0.6;
  gl_FragColor = vec4(col, 1.0);
}`,
  });

  const TUNNEL = shader({
    desc: 'Hyper tunnel: neon rings and lanes rushing at you. The bass pushes you forward, kicks flash the rings, snares light the walls.',
    P: {
      c1: col('#ff2bd6', 'Color 1'), c2: col('#2bd9ff', 'Color 2'),
      sides: num(6, 0, 8, 'Sides (0 = round)', 'Shape', 'A polygon tunnel with that many walls', 1), lanes: num(8, 1, 24, 'Lanes', 'Shape', undefined, 1), depth: num(0.35, 0.1, 1, 'Width', 'Shape'),
      speed: num(1.2, 0, 5, 'Speed', 'Motion'), twist: num(1, -4, 4, 'Twist', 'Motion'), roll: num(0.4, -3, 3, 'Roll', 'Motion'), fog: num(1, 0, 3, 'Darkness far away', 'Look'),
      punch: num(1, 0, 2, 'Kick flashes the rings', 'Music'), flash: num(0.6, 0, 2, 'Snare lights the walls', 'Music'),
    },
    travel: 'P.speed * (1 + bass * 1.2)',
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  p *= rot(uTime * u_roll * 0.15);
  float a = atan(p.y, p.x);
  float r = length(p);
  float sides = floor(u_sides);
  if (sides >= 3.0) { float s = 6.2831853 / sides; r *= cos(mod(a + s * 0.5, s) - s * 0.5) / cos(s * 0.5); }
  float z = u_depth / max(r, 0.001);
  float tz = z + uTravel * 3.0;
  float ang = a / 6.2831853 + 0.5 + z * u_twist * 0.02;
  float ring = 1.0 - smoothstep(0.0, 0.07, abs(fract(tz * 0.5) - 0.5) * 2.0 - 0.0);
  ring = smoothstep(0.86, 1.0, ring);
  float lane = smoothstep(0.92, 1.0, 1.0 - abs(fract(ang * floor(u_lanes)) - 0.5) * 2.0);
  float fog = exp(-z * u_fog * 0.12);
  vec3 c = mix(u_c1, u_c2, 0.5 + 0.5 * sin(tz * 0.5 + ang * 6.2831853));
  vec3 col = c * (ring * (1.2 + uKick * u_punch * 2.5) + lane * 0.7) * fog;
  col += c * (0.06 + uSnare * u_flash * 0.25) * fog;
  col += mix(u_c1, u_c2, 0.5) * 0.04 / (r * 6.0 + 0.05) * (0.6 + uBass * 0.6);
  gl_FragColor = vec4(col, 1.0);
}`,
  });

  const LIQUID = (o = {}) => shader({
    desc: 'Liquid gradient: four colors folding through each other like warm paint in water. The bass stirs it, kicks add a sheen.',
    P: {
      c1: col(o.c1 || '#1a0b3d', 'Deep color'), c2: col(o.c2 || '#ff5e7e', 'Main color'), c3: col(o.c3 || '#ffb26b', 'Highlight'), c4: col(o.c4 || '#5ad1ff', 'Accent'),
      scale: num(o.scale ?? 1.6, 0.4, 5, 'Size', 'Shape'), warp: num(o.warp ?? 1, 0, 2.5, 'Folding', 'Shape'),
      speed: num(o.speed ?? 0.25, 0, 2, 'Flow', 'Motion'), sheen: num(o.sheen ?? 0.6, 0, 2, 'Sheen', 'Look'), grain: num(o.grain ?? 0.5, 0, 2, 'Grain', 'Look'),
      punch: num(o.punch ?? 0.7, 0, 2, 'Kick glow', 'Music', 'The bright folds glow on each kick'),
    },
    travel: 'P.speed * (1 + bass * 1.5)',
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0) * u_scale;
  float t = uTravel;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.3)), fbm(p + vec2(5.2, 1.3) - t * 0.2));
  vec2 w = vec2(fbm(p + 4.0 * q * u_warp + vec2(1.7, 9.2) + t * 0.15), fbm(p + 4.0 * q * u_warp + vec2(8.3, 2.8) - t * 0.12));
  float f = fbm(p + 3.0 * w * u_warp);
  vec3 col = mix(u_c1, u_c2, smoothstep(0.25, 0.75, f));
  col = mix(col, u_c3, smoothstep(0.45, 0.95, length(q)) * 0.85);
  col = mix(col, u_c4, smoothstep(0.55, 0.95, w.y) * 0.7);
  col *= 1.0 + uKick * u_punch * 0.35 * smoothstep(0.35, 0.85, f);
  col += pow(max(f - 0.5, 0.0) * 2.0, 3.0) * u_sheen;
  col += (hash(vUv * uRes + fract(uTime * 7.0) * 91.0) - 0.5) * u_grain * 0.08;
  gl_FragColor = vec4(col, 1.0);
}`,
  });

  const CHROME = (o = {}) => `${IMPORT}
// Chrome blob: a liquid-metal blob in a studio of colored light panels. It ripples on its own; the bass makes it
// wobble harder and kicks puff it up. Transparent around it: put a background layer under it.
const P = tweak({
${specLines({
    tint: col(o.tint || '#ffffff', 'Metal tint'), light1: col(o.light1 || '#ff3c9d', 'Light 1'), light2: col(o.light2 || '#3ad6ff', 'Light 2'), light3: col(o.light3 || '#ffd75e', 'Light 3'),
    size: num(1.1, 0.4, 2, 'Size', 'Shape'), wobble: num(0.32, 0, 1, 'Wobble', 'Shape'), detail: num(1.6, 0.5, 4, 'Ripple size', 'Shape', 'Bigger = smaller ripples'),
    rough: num(0.08, 0, 0.6, 'Roughness', 'Look'), flow: num(0.5, 0, 2, 'Flow', 'Motion'), spin: num(0.3, -2, 2, 'Spin', 'Motion'),
    punch: num(1, 0, 2, 'Kick puff', 'Music'), bassFlow: num(1, 0, 3, 'Bass wobble', 'Music'),
  })}
});

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 100);
const fit = () => {
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(0, 0, 6 * Math.max(1, 0.85 / camera.aspect)); // tall frames: step back so it fits the width
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
};
fit();
addEventListener('resize', fit);

// what the chrome reflects: a dark room with soft light panels in the three light colors (rebuilt when they change)
const pmrem = new THREE.PMREMGenerator(renderer);
let envKey = '';
function studio() {
  const key = P.light1 + P.light2 + P.light3;
  if (key === envKey) return;
  envKey = key;
  const room = new THREE.Scene();
  room.background = new THREE.Color('#08080c');
  const panel = (color, x, y, z, w, h, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  panel(P.light1, -5, 1, 2, 3, 8, 3);
  panel(P.light2, 5, -1, 1, 3, 7, 3);
  panel(P.light3, 0, 6, -1, 9, 2, 3);
  panel('#ffffff', 2, 2, 6, 1.5, 1.5, 5);
  const old = scene.environment;
  scene.environment = pmrem.fromScene(room, 0.02).texture;
  old?.dispose();
  room.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
}
studio();

// the ripples are moved on the graphics card: each point is pushed out by a 3D noise, its normal follows
const u = { uFlow: { value: 0 }, uAmp: { value: 0.3 }, uFreq: { value: 1.6 } };
const mat = new THREE.MeshStandardMaterial({ color: P.tint, metalness: 1, roughness: P.rough });
mat.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, u);
  sh.vertexShader = \`uniform float uFlow; uniform float uAmp; uniform float uFreq;
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float blob(vec3 p) { vec3 q = p * uFreq + vec3(0.0, uFlow * 0.7, uFlow); return uAmp * (n3(q) * 0.7 + n3(q * 2.1 + 7.0) * 0.3 - 0.5); }
\${sh.vertexShader}\`
    .replace('#include <beginnormal_vertex>', \`vec3 bnP = position;
vec3 bnN = normalize(position);
vec3 bnT = normalize(cross(bnN, abs(bnN.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
vec3 bnB = normalize(cross(bnN, bnT));
vec3 bnQ = bnP + bnN * blob(bnP);
vec3 bnA = normalize(bnP + bnT * 0.01) * length(bnP); bnA += normalize(bnA) * blob(bnA);
vec3 bnC = normalize(bnP + bnB * 0.01) * length(bnP); bnC += normalize(bnC) * blob(bnC);
vec3 objectNormal = normalize(cross(bnA - bnQ, bnC - bnQ));
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif\`)
    .replace('#include <begin_vertex>', 'vec3 transformed = bnQ;');
};
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 32), mat);
scene.add(mesh);

let kick = 0;
let bass = 0;
let flow = 0;
let last = 0;
renderer.setAnimationLoop((now) => {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  kick = Math.max(kick * 0.88, audio.kick);
  bass += (audio.bass - bass) * 0.15;
  flow += dt * P.flow * (1 + bass * P.bassFlow);
  u.uFlow.value = flow;
  u.uAmp.value = P.wobble * (1 + bass * P.bassFlow * 0.8) + kick * P.punch * 0.12;
  u.uFreq.value = P.detail;
  mat.color.set(P.tint);
  mat.roughness = P.rough;
  studio();
  mesh.scale.setScalar(P.size * (1 + kick * P.punch * 0.07));
  mesh.rotation.y += dt * P.spin;
  mesh.rotation.x = Math.sin(now / 5000) * 0.35;
  renderer.render(scene, camera);
});
`;

  const BURST = (o = {}) => `${IMPORT}
// Beat burst: a cloud of glowing particles that bursts outward on every kick, breathes with the bass and swirls.
// Transparent around it: put a background layer under it.
const P = tweak({
${specLines({
    count: num(o.count ?? 30, 2, 120, 'Particles (thousands)', 'Particles', 'Rebuilds the cloud', 1),
    radius: num(1.6, 0.4, 4, 'Size of the cloud', 'Shape'), size: num(1, 0.2, 4, 'Particle size', 'Particles'), glow: num(1, 0.2, 3, 'Brightness', 'Look'),
    c1: col(o.c1 || '#ffd75e', 'Color 1'), c2: col(o.c2 || '#ff3c7e', 'Color 2'),
    swirl: num(0.6, -3, 3, 'Swirl', 'Motion'), spin: num(0.15, -2, 2, 'Spin', 'Motion'), drift: num(0.5, 0, 2, 'Drift', 'Motion'),
    burst: num(1.2, 0, 3, 'Kick burst', 'Music', 'How far they fly out on each kick'), breathe: num(0.6, 0, 2, 'Bass breathing', 'Music'),
  })}
});

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
const fit = () => {
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(0, 0, 7 * Math.max(1, 0.85 / camera.aspect));
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
};
fit();
addEventListener('resize', fit);

const u = { uTime: { value: 0 }, uBurst: { value: 0 }, uRadius: { value: 1 }, uSwirl: { value: 0 }, uSize: { value: 1 }, uScale: { value: 40 }, uDrift: { value: 0.5 }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uGlow: { value: 1 } };
const mat = new THREE.ShaderMaterial({
  uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: \`uniform float uTime; uniform float uBurst; uniform float uRadius; uniform float uSwirl; uniform float uSize; uniform float uScale; uniform float uDrift;
attribute vec3 aDir; attribute vec4 aRnd;
varying float vMix; varying float vA;
void main() {
  float r = uRadius * (0.45 + 0.55 * aRnd.x) + uBurst * (0.4 + 1.8 * aRnd.y * aRnd.y);
  vec3 p = aDir * r;
  float a = uSwirl * (0.3 + aRnd.z) * (uTime * 0.3 + 1.5 / (0.6 + r));
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
  p += uDrift * 0.25 * vec3(sin(uTime * 0.7 + aRnd.w * 30.0), cos(uTime * 0.9 + aRnd.x * 20.0), sin(uTime * 0.5 + aRnd.y * 40.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, uSize * (0.4 + aRnd.w) * (1.0 + uBurst * 0.3) * uScale / -mv.z);
  vMix = aRnd.y; vA = 0.35 + 0.65 * aRnd.z;
}\`,
  fragmentShader: \`uniform vec3 uC1; uniform vec3 uC2; uniform float uGlow;
varying float vMix; varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(mix(uC1, uC2, vMix) * uGlow, a * a * vA);
}\`,
});
let points = null;
let built = 0;
function build() {
  const n = Math.round(P.count) * 1000;
  if (n === built) return;
  built = n;
  if (points) { scene.remove(points); points.geometry.dispose(); }
  const dir = new Float32Array(n * 3);
  const rnd = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const z = Math.random() * 2 - 1; const t = Math.random() * Math.PI * 2; const s = Math.sqrt(1 - z * z);
    dir.set([s * Math.cos(t), z, s * Math.sin(t)], i * 3);
    rnd.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);
  points = new THREE.Points(geo, mat);
  scene.add(points);
}
build();

let kick = 0;
let bass = 0;
const size = new THREE.Vector2();
renderer.setAnimationLoop((now) => {
  build();
  kick = Math.max(kick * 0.9, audio.kick);
  bass += (audio.bass - bass) * 0.15;
  u.uTime.value = now / 1000;
  u.uBurst.value = kick * P.burst;
  u.uRadius.value = P.radius * (1 + bass * P.breathe * 0.25);
  u.uSwirl.value = P.swirl;
  u.uSize.value = P.size;
  u.uDrift.value = P.drift;
  u.uScale.value = renderer.getDrawingBufferSize(size).y * 0.035;
  u.uC1.value.set(P.c1);
  u.uC2.value.set(P.c2);
  u.uGlow.value = P.glow;
  points.rotation.y += P.spin * 0.01;
  points.rotation.x = Math.sin(now / 6000) * 0.3;
  renderer.render(scene, camera);
});
`;

  const OPENER = (o = {}) => `// Kinetic opener: one big word per beat (or every few beats), letters rising in one after another, outlined echoes
// behind it that swell on kicks and a flash on every bar. Edit the options list in the code for your own words.
// A 2D canvas layer: transparent where nothing is drawn.
const P = tweak({
${specLines({
    words: pick(o.words || 'NEW MUSIC OUT NOW', ['NEW MUSIC OUT NOW', 'TURN IT UP TONIGHT', 'FEEL THE BASS DROP', 'HEARTH PRESENTS', 'LISTEN LOUD', 'FRIDAY 9 PM LIVE'], 'Words'),
    font: pick(o.font || 'Arial Black', ['Arial Black', 'Impact', 'Helvetica', 'Georgia', 'monospace'], 'Font'),
    beats: num(o.beats ?? 1, 1, 8, 'Beats per word', 'Text', undefined, 1),
    size: num(0.2, 0.05, 0.5, 'Size', 'Text'), y: num(0.5, 0.1, 0.9, 'Position Y', 'Text'),
    color: col(o.color || '#ffffff', 'Text'), accent: col(o.accent || '#ff3c7e', 'Echo & flash'),
    echoes: num(o.echoes ?? 4, 0, 10, 'Echo outlines', 'Look', undefined, 1), rise: num(0.4, 0, 1.5, 'Letter rise', 'Motion'),
    punch: num(1, 0, 2, 'Kick punch', 'Music'), flash: num(o.flash ?? 0.35, 0, 1, 'Flash on each bar', 'Music'),
  })}
});

const cv = document.createElement('canvas');
cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
document.body.append(cv);
const g = cv.getContext('2d');
let W = 0;
let H = 0;
const fit = () => { W = cv.width = Math.round(innerWidth * devicePixelRatio); H = cv.height = Math.round(innerHeight * devicePixelRatio); };
fit();
addEventListener('resize', fit);

let kick = 0;
let beats = 0;
let lastPhase = 0;
let shown = -1;
let bornAt = 0;
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000;
  kick = Math.max(kick * 0.88, audio.kick);
  // a beat counter from the beat's phase (the demo beat when no song is loaded)
  const ph = audio.beatPhase || 0;
  if (ph < lastPhase - 0.5) beats += 1;
  lastPhase = ph;
  const words = String(P.words).split(/\\s+/).filter(Boolean);
  const i = Math.floor(beats / Math.max(1, Math.round(P.beats))) % Math.max(1, words.length);
  if (i !== shown) { shown = i; bornAt = t; }
  const age = t - bornAt;
  const word = words[i] || '';
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  const bar = Math.max(0, 1 - (audio.barPhase || 0) * 5);
  if (P.flash > 0 && bar > 0) { g.globalAlpha = bar * P.flash; g.fillStyle = P.accent; g.fillRect(0, 0, W, H); }
  const m = Math.min(W, H);
  let s = m * P.size * (1.18 - 0.18 * ease(age / 0.3)) * (1 + kick * P.punch * 0.08);
  g.font = \`900 \${Math.round(s)}px \${P.font}, Impact, sans-serif\`;
  const full = g.measureText(word).width;
  if (full > W * 0.9) { s *= (W * 0.9) / full; g.font = \`900 \${Math.round(s)}px \${P.font}, Impact, sans-serif\`; }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const cy = H * P.y;
  for (let k = Math.round(P.echoes); k >= 1; k--) {
    const grow = 1 + k * 0.16 * (1 + kick * P.punch * 0.6);
    g.globalAlpha = 0.55 * (1 - k / (P.echoes + 1)) * ease(age / 0.4);
    g.strokeStyle = P.accent;
    g.lineWidth = Math.max(1, s * 0.012);
    g.font = \`900 \${Math.round(s * grow)}px \${P.font}, Impact, sans-serif\`;
    g.strokeText(word, W / 2, cy);
  }
  g.font = \`900 \${Math.round(s)}px \${P.font}, Impact, sans-serif\`;
  g.textAlign = 'left';
  const w = g.measureText(word).width;
  let x = W / 2 - w / 2;
  g.fillStyle = P.color;
  for (let j = 0; j < word.length; j++) {
    const e = ease((age - j * 0.035) / 0.25);
    g.globalAlpha = e;
    g.fillText(word[j], x, cy + (1 - e) * s * P.rise);
    x += g.measureText(word[j]).width;
  }
  g.globalAlpha = 1;
}
requestAnimationFrame(frame);
`;

  // ---------- the starting points ----------
  // layer: { t: template id } | { f: filter id, v: values } | { code, name } — plus vals (slider values), name, blend, opacity
  const T = (t, more = {}) => ({ t, ...more });
  const F = (f, v = {}, more = {}) => ({ f, v, ...more });
  const C = (name, code, more = {}) => ({ name, code, ...more });
  const MOODS = [
    { id: 'neon', label: 'Neon & retro', icon: '🌆' },
    { id: 'chrome', label: 'Chrome & glossy', icon: '🪩' },
    { id: 'dreamy', label: 'Soft & dreamy', icon: '☁' },
    { id: 'dark', label: 'Dark & hypnotic', icon: '🌀' },
    { id: 'club', label: 'Club energy', icon: '⚡' },
    { id: 'type', label: 'Type openers', icon: '🅰' },
  ];
  const STARTS = [
    // neon & retro
    { id: 'outrun', name: 'Outrun sunset', mood: 'neon', tags: 'synthwave retro grid sun 80s vapor drive', desc: 'A striped sun, mountains and a neon grid racing to the horizon; kicks light the grid',
      layers: [C('Outrun sunset', OUTRUN), F('bloom', {}, { name: '✦ Bloom' }), F('scanlines', {}, { name: '✦ Scanlines', opacity: 0.5 })] },
    { id: 'hyper-tunnel', name: 'Hyper tunnel', mood: 'neon', tags: 'tunnel speed warp neon rings fly through', desc: 'Neon rings and lanes rushing at you; the bass pushes you forward',
      layers: [C('Hyper tunnel', TUNNEL), F('bloom', {}, { name: '✦ Bloom' }), F('chromatic', {}, { name: '✦ Chromatic aberration' })] },
    { id: 'wire-dusk', name: 'Wire mountains at dusk', mood: 'neon', tags: 'synthwave terrain wireframe sun retro', desc: 'Wireframe mountains scrolling under a vapor sun; the bass lifts the peaks',
      layers: [T('vapor-sun'), T('synth-terrain'), F('bloom', {}, { name: '✦ Bloom' }), F('grain', {}, { name: '✦ Film grain' })] },
    { id: 'arcade-eq', name: 'Arcade equalizer', mood: 'neon', tags: 'spectrum bars crt retro arcade grid equalizer', desc: 'Mirrored spectrum bars over a synthwave grid, on an arcade CRT',
      layers: [T('synth-grid'), T('spectrum-bars', { vals: { mirror: true, height: 0.5 } }), F('crt-arcade', {}, { name: '✦ CRT arcade' })] },
    // chrome & glossy
    { id: 'chrome-blob', name: 'Chrome blob', mood: 'chrome', tags: 'chrome metal liquid blob reflective y2k', desc: 'A liquid-metal blob in colored studio light; the bass makes it wobble',
      layers: [C('Backdrop', LIQUID({ c1: '#07060d', c2: '#2a1240', c3: '#ff3c9d', c4: '#3ad6ff', sheen: 0.2, scale: 1.2 })), C('Chrome blob', CHROME()), F('halation', {}, { name: '✦ Halation' })] },
    { id: 'gold-blob', name: 'Molten gold', mood: 'chrome', tags: 'gold metal blob luxury warm liquid', desc: 'The chrome blob in warm gold light over a dark ember gradient',
      layers: [C('Backdrop', LIQUID({ c1: '#0a0503', c2: '#3b1406', c3: '#ff8c42', c4: '#ffd75e', sheen: 0.3, speed: 0.15 })), C('Gold blob', CHROME({ tint: '#ffc45c', light1: '#ff8c42', light2: '#ffd75e', light3: '#fff1c9' })), F('bloom', {}, { name: '✦ Bloom' })] },
    { id: 'chrome-knot', name: 'Chrome knot', mood: 'chrome', tags: 'chrome knot torus metal glossy gradient', desc: 'A turning chrome knot over a soft mesh gradient',
      layers: [T('mesh-gradient'), T('knot'), F('halation', {}, { name: '✦ Halation' })] },
    { id: 'mirror-ball', name: 'Disco mirror ball', mood: 'chrome', tags: 'disco club mirror ball spotlights sparkle', desc: 'A disco ball whose tiles flash with the hi-hats, under sweeping spotlights',
      layers: [T('spotlight'), T('mirror-ball'), F('bloom', {}, { name: '✦ Bloom' })] },
    // soft & dreamy
    { id: 'liquid-gradient', name: 'Liquid gradient', mood: 'dreamy', tags: 'gradient fluid paint soft calm background warm', desc: 'Warm colors folding through each other like paint in water; the bass stirs it',
      layers: [C('Liquid gradient', LIQUID()), F('vignette', {}, { name: '✦ Vignette' })] },
    { id: 'aurora-night', name: 'Aurora night', mood: 'dreamy', tags: 'aurora northern lights stars night calm', desc: 'Northern lights over twinkling stars, with a soft film grain',
      layers: [T('aurora'), T('twinkle', { blend: 'screen' }), F('grain', {}, { name: '✦ Film grain' })] },
    { id: 'bokeh-dream', name: 'Bokeh dream', mood: 'dreamy', tags: 'bokeh lights blur soft dreamy pastel', desc: 'Out-of-focus lights drifting over a flowing gradient',
      layers: [T('gradient-flow'), T('glow-orbs', { blend: 'screen' }), F('dreamglow', {}, { name: '✦ Dream glow' })] },
    { id: 'pastel-flow', name: 'Pastel flow', mood: 'dreamy', tags: 'pastel gradient soft lofi chill calm', desc: 'A slow pastel liquid gradient for lo-fi and chill tracks',
      layers: [C('Pastel flow', LIQUID({ c1: '#8f7cf0', c2: '#ff9fbf', c3: '#ffd9a0', c4: '#7fd0f5', speed: 0.12, sheen: 0, grain: 0.8 })), F('lightleak', {}, { name: '✦ Light leaks', opacity: 0.35 })] },
    // dark & hypnotic
    { id: 'pulsar', name: 'Pulsar lines', mood: 'dark', tags: 'joy division unknown pleasures lines minimal black white', desc: 'Stacked waveform lines like a pulsar chart, in black and white',
      layers: [T('joy-lines'), F('grain', {}, { name: '✦ Film grain' }), F('vignette', {}, { name: '✦ Vignette' })] },
    { id: 'galaxy', name: 'Particle galaxy', mood: 'dark', tags: 'galaxy stars space spiral particles', desc: 'A spiral galaxy of 30,000 stars that pulses with the kick',
      layers: [T('particle-galaxy'), F('bloom', {}, { name: '✦ Bloom' })] },
    { id: 'hypno', name: 'Hypno spiral', mood: 'dark', tags: 'hypnotic spiral op art trippy', desc: 'A turning hypnotic spiral, split into color on hits',
      layers: [T('hypno-spiral'), F('rgbsplit', {}, { name: '✦ RGB split' })] },
    { id: 'fractal', name: 'Fractal dive', mood: 'dark', tags: 'fractal zoom julia mandelbrot infinite trippy', desc: 'An endless zoom into a fractal, with a soft bloom',
      layers: [T('julia'), F('bloom', {}, { name: '✦ Bloom' }), F('vignette', {}, { name: '✦ Vignette' })] },
    // club energy
    { id: 'beat-burst', name: 'Beat burst', mood: 'club', tags: 'particles burst explode kick audio reactive', desc: '30,000 particles that burst out on every kick and breathe with the bass',
      layers: [C('Backdrop', LIQUID({ c1: '#030208', c2: '#1a0730', c3: '#4a1060', c4: '#0b3b5c', sheen: 0, speed: 0.1, grain: 0.4, punch: 0.3 })), C('Beat burst', BURST()), F('bloom', {}, { name: '✦ Bloom' })] },
    { id: 'spectrum-crown', name: 'Spectrum crown', mood: 'club', tags: 'spectrum ring circle equalizer 3d halo', desc: 'A 3D crown of spectrum bars inside a glowing spectrum halo',
      layers: [T('spectrum-circle-shader'), T('spectrum-ring-3d'), F('bloom', {}, { name: '✦ Bloom' })] },
    { id: 'hyperspace', name: 'Hyperspace', mood: 'club', tags: 'stars warp speed space jump', desc: 'Stars streaking past at warp speed, a zoom blur on the bass',
      layers: [C('Deep space', LIQUID({ c1: '#010208', c2: '#06123a', c3: '#2a0f5c', c4: '#0a4a7a', sheen: 0.1, speed: 0.3, grain: 0.3, punch: 0.4 })), T('warp-stars-3d', { blend: 'add' }), F('zoomblur', {}, { name: '✦ Zoom blur' })] },
    { id: 'laser-show', name: 'Laser show', mood: 'club', tags: 'lasers club rave beams strobe', desc: 'Sweeping laser beams with a flash on every snare',
      layers: [C('Haze', LIQUID({ c1: '#030308', c2: '#12062a', c3: '#2a0b45', c4: '#06243a', sheen: 0, speed: 0.15, grain: 0.6, punch: 0.6 })), T('laser-beams', { blend: 'add' }), F('bloom', {}, { name: '✦ Bloom' }), F('snareflash', {}, { name: '✦ Snare flash' })] },
    { id: 'ember-burst', name: 'Ember burst', mood: 'club', tags: 'particles fire embers warm burst', desc: 'Warm embers bursting on the kick over a fiery gradient',
      layers: [C('Backdrop', LIQUID({ c1: '#080202', c2: '#3a0a02', c3: '#c2410c', c4: '#ffa600', sheen: 0.2, speed: 0.2, punch: 0.4 })), C('Embers', BURST({ c1: '#ffd75e', c2: '#ff3c00', count: 20 })), F('bloom', {}, { name: '✦ Bloom' })] },
    // type openers
    { id: 'kinetic-opener', name: 'Kinetic opener', mood: 'type', tags: 'type text words title opener kinetic typography intro', desc: 'One big word per beat, letters rising in, outlined echoes and a flash on each bar',
      layers: [C('Backdrop', LIQUID({ c1: '#050505', c2: '#1b1b24', c3: '#3a1030', c4: '#10263a', sheen: 0, speed: 0.1, grain: 1, punch: 0.2 })), C('Kinetic opener', OPENER()), F('rgbsplit', {}, { name: '✦ RGB split', opacity: 0.6 })] },
    { id: 'glitch-title', name: 'Glitch title', mood: 'type', tags: 'glitch text title cyber digital', desc: 'A glitching title over a mesh gradient, on scanlines',
      layers: [T('mesh-gradient', { vals: { c1: '#0b0b1a', c2: '#2b1055', c3: '#7a5cff', c4: '#2bd9ff' } }), T('glitch-text'), F('scanlines', {}, { name: '✦ Scanlines', opacity: 0.6 })] },
    { id: 'out-now', name: 'Out now poster', mood: 'type', tags: 'release out now title poster sunset', desc: 'OUT NOW in big type that punches on kicks, over a vapor sun',
      layers: [T('vapor-sun'), T('title-card', { vals: { text: 'OUT NOW' } }), F('grain', {}, { name: '✦ Film grain' })] },
    { id: 'word-flash', name: 'Word flash', mood: 'type', tags: 'words beat text lyrics flash ink', desc: 'A word on every beat over swirling ink',
      layers: [T('ink-swirl'), T('word-flash'), F('vignette', {}, { name: '✦ Vignette' })] },
    { id: 'friday-live', name: 'Friday live', mood: 'type', tags: 'event announcement live show promo opener', desc: 'An event opener: FRIDAY 9 PM LIVE word by word, two beats each, over the hyper tunnel',
      layers: [C('Hyper tunnel', TUNNEL), C('Kinetic opener', OPENER({ words: 'FRIDAY 9 PM LIVE', beats: 2, accent: '#2bd9ff', echoes: 6, flash: 0.2 })), F('bloom', {}, { name: '✦ Bloom' })] },
  ];

  // a slider's value changed in a layer's code (its tweak() line "key: { value: …,")
  function setVals(code, vals = {}) {
    let out = code;
    for (const [k, v] of Object.entries(vals)) out = out.replace(new RegExp(`(\\n\\s*${k}: \\{ value: )([^,]+)(,)`), (_m, a, _b, c) => `${a}${q(v)}${c}`);
    return out;
  }
  // a starting point's layers as Lab layers ({ name, code, blend, opacity }), bottom first; missing parts are skipped
  function layersOf(start) {
    const out = [];
    for (const x of start.layers) {
      let code = null; let name = x.name;
      if (x.code) code = x.code;
      else if (x.t) { const t = ThreeLayers.TEMPLATES.find((y) => y.id === x.t); if (t) { code = setVals(t.code, x.vals); name ||= t.name.replace(/^\W+\s*/, ''); } }
      else if (x.f) { code = ThreeLayers.filterCode?.(x.f, x.v || {}); name ||= `✦ ${ThreeLayers.FILTERS.find((y) => y.id === x.f)?.name || x.f}`; }
      if (!code) continue;
      out.push({ name: name || 'Layer', code, ...(x.blend ? { blend: x.blend } : {}), ...(x.opacity != null ? { opacity: x.opacity } : {}), filter: Boolean(x.f) });
    }
    return out;
  }
  return { MOODS, STARTS, layersOf, setVals, NEW: { OUTRUN, TUNNEL, LIQUID, CHROME, BURST, OPENER } };
})();
