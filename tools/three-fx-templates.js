// The FX pack's layer templates: ready-to-run music visuals (full-screen shaders, 3D scenes, 2D overlays for
// text, HUDs and social formats). Each one is a normal layer: its tweak() values are the sliders (Save /
// Shuffle / looks work as usual) and it reacts through the sandbox's `audio` helpers. They're added to
// ThreeLayers.TEMPLATES, so the Layers "＋" picker, /template and the Three Director see them.
(() => {
  const q = (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : Array.isArray(v) ? `[${v.map(q).join(', ')}]` : String(v));
  // P spec: { key: [value, min, max, label, group, step] | ['#hex', label, group] | [bool, label, group] | [choice, [options], label, group] }
  function specLines(P) {
    return Object.entries(P).map(([k, a]) => {
      const v = a[0];
      let parts;
      if (typeof v === 'number') parts = [`value: ${v}`, `min: ${a[1]}`, `max: ${a[2]}`, ...(a[5] ? [`step: ${a[5]}`] : []), `label: ${q(a[3])}`, `group: ${q(a[4] || 'Look')}`];
      else if (Array.isArray(a[1])) parts = [`value: ${q(v)}`, `options: ${q(a[1])}`, `label: ${q(a[2])}`, `group: ${q(a[3] || 'Look')}`];
      else parts = [`value: ${q(v)}`, `label: ${q(a[1])}`, `group: ${q(a[2] || (typeof v === 'string' ? 'Color' : 'Look'))}`];
      return `  ${k}: { ${parts.join(', ')} },`;
    }).join('\n');
  }
  const IMPORT = "import * as THREE from 'three';\n";
  // ---------- full-screen shader layers ----------
  const GLSL = `
uniform float uTime; uniform vec2 uRes; uniform float uKick; uniform float uSnare; uniform float uBass; uniform float uLevel; uniform float uBeat; uniform float uHats; uniform float uBeatPhase;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
vec3 hsv(float h, float s, float v) { vec3 p = abs(fract(vec3(h) + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return v * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), s); }
mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
`;
  const SPEC_GLSL = 'uniform sampler2D uSpec;\nfloat spec(float x) { return texture2D(uSpec, vec2(clamp(x, 0.0, 1.0), 0.5)).r; }\n';
  const SPEC_JS = `
// the spectrum as a 64-pixel texture (uSpec): log-spaced bands from about 30 Hz to 16 kHz
const SPEC = 64;
const specData = new Uint8Array(SPEC);
const specTex = new THREE.DataTexture(specData, SPEC, 1, THREE.RedFormat);
specTex.magFilter = THREE.LinearFilter;
specTex.needsUpdate = true;
uniforms.uSpec = { value: specTex };
const edges = Array.from({ length: SPEC + 1 }, (_, i) => Math.round((30 * Math.pow(16000 / 30, i / SPEC)) / 23.4));
function fillSpectrum() {
  const s = audio.spectrum;
  for (let i = 0; i < SPEC; i++) {
    let m = 0;
    for (let j = edges[i]; j <= Math.max(edges[i], edges[i + 1] - 1); j++) m = Math.max(m, s[j] || 0);
    specData[i] = Math.max(m, specData[i] * 0.85);
  }
  specTex.needsUpdate = true;
}
`;
  function shader({ desc, P, frag, spec = false }) {
    const decl = Object.entries(P).map(([k, a]) => `uniform ${typeof a[0] === 'string' ? 'vec3' : 'float'} u_${k};`).join(' ');
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

// every slider is a uniform u_<name> (colors are vec3); the music comes in as uKick, uSnare, uBass, uLevel, uBeat, uHats, uBeatPhase
const uniforms = { uTime: { value: 0 }, uRes: { value: new THREE.Vector2() }, uKick: { value: 0 }, uSnare: { value: 0 }, uBass: { value: 0 }, uLevel: { value: 0 }, uBeat: { value: 0 }, uHats: { value: 0 }, uBeatPhase: { value: 0 } };
const params = Object.keys(P).map((k) => [k, (uniforms['u_' + k] = { value: typeof P[k] === 'string' ? new THREE.Vector3() : 0 }), '']);
const setColor = (v, hex) => { const n = parseInt(hex.slice(1), 16); v.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
${spec ? SPEC_JS : ''}
const material = new THREE.ShaderMaterial({
  uniforms, transparent: true, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: \`${GLSL}${spec ? SPEC_GLSL : ''}${decl}
${frag.trim()}\`,
});
const scene = new THREE.Scene();
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
const camera = new THREE.Camera();

let kick = 0;
let snare = 0;
renderer.setAnimationLoop((now) => {
  kick = Math.max(kick * 0.9, audio.kick);
  snare = Math.max(snare * 0.9, audio.snare);
  uniforms.uTime.value = now / 1000;
  renderer.getDrawingBufferSize(uniforms.uRes.value);
  uniforms.uKick.value = kick;
  uniforms.uSnare.value = snare;
  uniforms.uBass.value = audio.bass;
  uniforms.uLevel.value = audio.level;
  uniforms.uBeat.value = audio.beat;
  uniforms.uHats.value = audio.hats;
  uniforms.uBeatPhase.value = audio.beatPhase || 0;
  for (const p of params) {
    const v = P[p[0]];
    if (typeof v === 'string') { if (v !== p[2]) { setColor(p[1].value, v); p[2] = v; } } else p[1].value = Number(v);
  }${spec ? '\n  fillSpectrum();' : ''}
  renderer.render(scene, camera);
});
`;
  }
  // ---------- 2D canvas layers (text, HUDs, bars) ----------
  function canvas2d({ desc, P, setup = '', draw }) {
    return `// ${desc}
// A 2D canvas layer: transparent where nothing is drawn. W and H are the canvas size in pixels.
const P = tweak({
${specLines(P)}
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
${setup.trim() ? `\n${setup.trim()}\n` : ''}
let kick = 0;
let snare = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const t = now / 1000;
  kick = Math.max(kick * 0.88, audio.kick);
  snare = Math.max(snare * 0.88, audio.snare);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
${draw.trim().split('\n').map((l) => `  ${l}`).join('\n')}
}
requestAnimationFrame(frame);
`;
  }
  // ---------- 3D scenes ----------
  function scene3d({ desc, P, setup, loop, camZ = 7, fov = 50 }) {
    return `${IMPORT}
// ${desc}
// A transparent layer: what it draws sits on top of the layers below.
const P = tweak({
${specLines(P)}
});

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(${fov}, innerWidth / innerHeight, 0.1, 200);
camera.position.z = ${camZ};

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

${setup.trim()}

let kick = 0;
let snare = 0;
renderer.setAnimationLoop((now) => {
  const t = now / 1000;
  kick = Math.max(kick * 0.9, audio.kick);
  snare = Math.max(snare * 0.9, audio.snare);
${loop.trim().split('\n').map((l) => `  ${l}`).join('\n')}
  renderer.render(scene, camera);
});
`;
  }
  const M = (react = 0.8, label = 'Kick punch') => ({ punch: [react, 0, 2, label, 'Music'] });
  const T = [];
  const add = (id, name, cat, desc, code, tags = '') => T.push({ id, name, cat, desc, tags, code, pack: 'fx' });
  // ===================== backgrounds & generative shaders =====================
  const BG = 'Backgrounds';
  add('gradient-flow', 'Gradient flow', BG, 'Soft flowing gradient of three colors that pulses on kicks', shader({
    desc: 'Gradient flow: three colors drifting through each other (a calm background)',
    P: { c1: ['#1b0f3b', 'Color 1'], c2: ['#ff6a3d', 'Color 2'], c3: ['#2bd9ff', 'Color 3'], speed: [0.15, 0, 1, 'Speed', 'Motion'], scale: [1.4, 0.3, 4, 'Size', 'Look'], ...M(0.4) },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * u_scale;
  float t = uTime * u_speed;
  float a = fbm(p + vec2(t, -t * 0.7));
  float b = fbm(p * 1.3 - vec2(t * 0.8, t * 0.4) + a);
  vec3 col = mix(u_c1, u_c2, smoothstep(0.25, 0.75, a));
  col = mix(col, u_c3, smoothstep(0.35, 0.85, b));
  col *= 1.0 + uKick * u_punch * 0.25;
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'gradient mesh calm');
  add('mesh-gradient', 'Mesh gradient', BG, 'Four colored blobs blending like a modern app wallpaper', shader({
    desc: 'Mesh gradient: four soft color points that wander (great behind text)',
    P: { c1: ['#ff9a8b', 'Color 1'], c2: ['#ff6a88', 'Color 2'], c3: ['#7a5cff', 'Color 3'], c4: ['#2bd9ff', 'Color 4'], speed: [0.25, 0, 2, 'Speed', 'Motion'], ...M(0.3) },
    frag: `
void main() {
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * u_speed;
  vec2 a = vec2(0.3 + 0.2 * sin(t * 0.9), 0.3 + 0.2 * cos(t * 0.7)) * vec2(uRes.x / uRes.y, 1.0);
  vec2 b = vec2(0.7 + 0.2 * cos(t * 0.6), 0.3 + 0.2 * sin(t * 0.8)) * vec2(uRes.x / uRes.y, 1.0);
  vec2 c = vec2(0.3 + 0.2 * cos(t * 0.5), 0.75 + 0.15 * sin(t * 1.1)) * vec2(uRes.x / uRes.y, 1.0);
  vec2 d = vec2(0.75 + 0.15 * sin(t * 0.7), 0.7 + 0.2 * cos(t * 0.9)) * vec2(uRes.x / uRes.y, 1.0);
  float wa = 1.0 / (0.02 + dot(p - a, p - a)), wb = 1.0 / (0.02 + dot(p - b, p - b)), wc = 1.0 / (0.02 + dot(p - c, p - c)), wd = 1.0 / (0.02 + dot(p - d, p - d));
  vec3 col = (u_c1 * wa + u_c2 * wb + u_c3 * wc + u_c4 * wd) / (wa + wb + wc + wd);
  col += (hash(vUv * uRes) - 0.5) * 0.02;
  col *= 1.0 + uKick * u_punch * 0.2;
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'wallpaper aurora soft');
  add('plasma', 'Plasma', BG, 'Classic demoscene plasma, faster with the bass', shader({
    desc: 'Plasma: sine-wave color field (demoscene classic)',
    P: { scale: [6, 1, 20, 'Size'], speed: [1, 0, 4, 'Speed', 'Motion'], hue: [0.6, 0, 1, 'Hue'], saturation: [0.8, 0, 1, 'Saturation'], bands: [1, 0.2, 4, 'Color bands'], ...M(0.6, 'Bass push') },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * u_scale;
  float t = uTime * u_speed * (1.0 + uBass * u_punch);
  float v = sin(p.x + t) + sin((p.y + t) * 0.5) + sin((p.x + p.y + t) * 0.5) + sin(length(p + vec2(sin(t * 0.3), cos(t * 0.5)) * 3.0) + t);
  gl_FragColor = vec4(hsv(u_hue + v * 0.125 * u_bands, u_saturation, 0.6 + 0.4 * sin(v * 3.14159)), 1.0);
}`,
  }), 'demoscene retro');
  add('aurora', 'Aurora', BG, 'Northern lights curtains over a dark sky', shader({
    desc: 'Aurora: glowing curtains drifting over a night sky',
    P: { c1: ['#3dffb5', 'Aurora color'], c2: ['#9b5cff', 'Top color'], sky: ['#020611', 'Sky'], speed: [0.3, 0, 2, 'Speed', 'Motion'], height: [0.55, 0.1, 1, 'Height'], ...M(0.5) },
    frag: `
void main() {
  vec2 p = vUv;
  float t = uTime * u_speed;
  vec3 col = u_sky + vec3(step(0.997, hash(floor(vUv * uRes / 2.0)))) * 0.8 * p.y;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = p.x * (1.5 + fi * 0.6) + t * (0.2 + fi * 0.1);
    float y0 = u_height - 0.15 * fi + 0.12 * fbm(vec2(x, fi * 3.0 + t * 0.3));
    float band = exp(-abs(p.y - y0) * 18.0) * (0.5 + 0.5 * fbm(vec2(x * 4.0, t)));
    float tail = smoothstep(y0 - 0.02, y0 + 0.35, p.y) * smoothstep(y0 + 0.45, y0, p.y) * 0.35;
    col += mix(u_c1, u_c2, clamp((p.y - y0) * 3.0, 0.0, 1.0)) * (band + tail * band * 3.0) * (0.7 + uKick * u_punch * 0.5);
  }
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'northern lights sky');
  add('starfield-warp', 'Warp starfield', BG, 'Stars streaking past, jumping to warp on kicks', shader({
    desc: 'Warp starfield: stars rushing toward you, faster on hits',
    P: { speed: [0.6, 0, 4, 'Speed', 'Motion'], density: [0.6, 0.1, 1, 'Stars'], streak: [1, 0, 3, 'Streak length'], tint: ['#b8d8ff', 'Star color'], background: ['#02030a', 'Background'], ...M(1.2, 'Kick warp') },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 col = u_background;
  float sp = u_speed * (1.0 + uKick * u_punch * 2.0);
  for (int l = 0; l < 4; l++) {
    float depth = fract(float(l) * 0.25 + uTime * sp * 0.2);
    float scale = mix(20.0, 0.5, depth);
    vec2 q = p * scale + float(l) * 7.3;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash(id + float(l));
    if (h > u_density) continue;
    vec2 off = (vec2(hash(id * 1.7), hash(id * 2.3)) - 0.5) * 0.6;
    vec2 d = f - off;
    vec2 dir = normalize(p + 1e-4);
    float along = dot(d, dir);
    float across = length(d - dir * along);
    float len = 0.02 + u_streak * 0.15 * depth * sp;
    float star = smoothstep(0.03, 0.0, across) * smoothstep(len, 0.0, abs(along + len * 0.5));
    col += u_tint * star * depth * 1.5;
  }
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'space hyperspace stars');
  add('shader-tunnel', 'Neon tunnel', BG, 'A flying tunnel of neon rings that flash on kicks', shader({
    desc: 'Neon tunnel: endless rings rushing toward you',
    P: { speed: [1, 0, 5, 'Speed', 'Motion'], twist: [0.5, -3, 3, 'Twist', 'Motion'], rings: [6, 1, 20, 'Rings'], c1: ['#ff2bd6', 'Color 1'], c2: ['#2bd9ff', 'Color 2'], sides: [0, 0, 8, 'Sides (0 = round)', 'Look', 1], ...M(1) },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float a = atan(p.y, p.x);
  float r = length(p);
  if (u_sides >= 3.0) { float s = 6.28318 / u_sides; r *= cos(s * 0.5) / cos(mod(a + s * 0.5, s) - s * 0.5); }
  float z = 0.3 / max(r, 0.001) + uTime * u_speed;
  float ang = a / 6.28318 + z * u_twist * 0.1;
  float ring = smoothstep(0.38, 0.5, abs(fract(z * u_rings * 0.25) - 0.5));
  float grid = smoothstep(0.46, 0.5, abs(fract(ang * 16.0) - 0.5)) * 0.4;
  vec3 col = mix(u_c1, u_c2, 0.5 + 0.5 * sin(z * 0.7)) * (ring * (1.0 + uKick * u_punch * 2.0) + grid);
  col *= smoothstep(0.0, 0.35, r);
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'tunnel rings fly');
  add('synth-grid', 'Synthwave grid', BG, 'Retro sun over a scrolling neon grid', shader({
    desc: 'Synthwave grid: a striped sun over a neon grid floor scrolling to the horizon',
    P: { grid: ['#ff2bd6', 'Grid color'], sunTop: ['#ffd75e', 'Sun top'], sunBottom: ['#ff3c7e', 'Sun bottom'], sky: ['#12002b', 'Sky'], speed: [1, 0, 5, 'Speed', 'Motion'], horizon: [0.42, 0.2, 0.7, 'Horizon'], ...M(0.8) },
    frag: `
void main() {
  vec2 uv = vUv;
  float asp = uRes.x / uRes.y;
  vec3 col = mix(u_sky, u_sky * 0.3, uv.y);
  float hz = u_horizon;
  vec2 sp = (uv - vec2(0.5, hz + 0.18)) * vec2(asp, 1.0);
  float sun = smoothstep(0.205, 0.2, length(sp));
  float stripes = step(0.5, fract((uv.y - hz) * 40.0 - uTime * 0.5)) + step(0.12, uv.y - hz);
  col = mix(col, mix(u_sunBottom, u_sunTop, clamp((uv.y - hz) * 3.0, 0.0, 1.0)), sun * clamp(stripes, 0.0, 1.0));
  col += u_sunBottom * exp(-length(sp) * 5.0) * 0.4 * (1.0 + uKick * u_punch);
  if (uv.y < hz) {
    float d = hz - uv.y;
    float z = 0.25 / d;
    float x = (uv.x - 0.5) * asp * z;
    float gz = fract(z + uTime * u_speed);
    float gx = fract(x);
    float lz = 1.0 - smoothstep(0.0, fwidth(z) * 1.5, min(gz, 1.0 - gz));
    float lx = 1.0 - smoothstep(0.0, fwidth(x) * 1.5, min(gx, 1.0 - gx));
    float line = max(lz, lx) * smoothstep(0.0, 0.04, d);
    col = u_sky * 0.5 + u_grid * line * (0.7 + uKick * u_punch * 0.8);
    col += u_grid * exp(-d * 30.0) * 0.6;
  }
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'retro outrun vaporwave');
  add('metaballs2d', 'Metaballs', BG, 'Gooey blobs that merge, swell on kicks', shader({
    desc: 'Metaballs: gooey blobs merging into each other',
    P: { count: [6, 2, 10, 'Blobs', 'Shape', 1], size: [0.12, 0.03, 0.4, 'Blob size', 'Shape'], c1: ['#ff4fd8', 'Color 1'], c2: ['#ffd75e', 'Color 2'], background: ['#0a0614', 'Background'], speed: [0.5, 0, 3, 'Speed', 'Motion'], ...M(1) },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float f = 0.0;
  float t = uTime * u_speed;
  for (int i = 0; i < 10; i++) {
    if (float(i) >= u_count) break;
    float fi = float(i);
    vec2 c = vec2(sin(t * (0.7 + fi * 0.13) + fi * 2.1), cos(t * (0.5 + fi * 0.11) + fi * 1.3)) * vec2(0.35 * uRes.x / uRes.y, 0.3);
    float r = u_size * (1.0 + uKick * u_punch * 0.4 * (0.5 + 0.5 * sin(fi)));
    f += r * r / dot(p - c, p - c);
  }
  float edge = smoothstep(0.95, 1.05, f);
  vec3 col = mix(u_background, mix(u_c1, u_c2, clamp(f - 1.0, 0.0, 1.0)), edge);
  col += u_c1 * smoothstep(0.6, 1.0, f) * (1.0 - edge) * 0.4;
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'blobs goo lava');
  add('lavalamp', 'Lava lamp', BG, 'Slow warm blobs rising and falling', shader({
    desc: 'Lava lamp: slow blobs drifting up and down',
    P: { c1: ['#ff5a1f', 'Lava'], c2: ['#ffcc33', 'Hot core'], background: ['#2b0a3d', 'Liquid'], speed: [0.2, 0, 1, 'Speed', 'Motion'], ...M(0.5, 'Bass swell') },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * u_speed;
  float f = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(fi * 2.4) * 0.3 * uRes.x / uRes.y, sin(t * (0.6 + fi * 0.1) + fi) * 0.4);
    float r = 0.06 + 0.04 * sin(fi * 1.7) + uBass * u_punch * 0.03;
    f += r * r / dot(p - c, p - c);
  }
  vec3 col = mix(u_background, u_c1, smoothstep(0.9, 1.1, f));
  col = mix(col, u_c2, smoothstep(2.0, 4.0, f));
  col += u_c1 * 0.15 * (1.0 - vUv.y);
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'retro blobs warm');
  add('voronoi-bg', 'Cell field', BG, 'Living Voronoi cells with glowing borders', shader({
    desc: 'Cell field: moving Voronoi cells with glowing borders',
    P: { cells: [6, 2, 20, 'Cells'], speed: [0.4, 0, 3, 'Speed', 'Motion'], edge: ['#48ddff', 'Border'], fill: ['#0b1020', 'Fill'], ...M(0.8) },
    frag: `
void main() {
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0) * u_cells;
  vec2 i = floor(p);
  float d1 = 9.0, d2 = 9.0; float id = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = i + vec2(float(x), float(y));
    vec2 o = 0.5 + 0.4 * sin(uTime * u_speed + 6.28 * vec2(hash(g), hash(g + 3.1)));
    float d = length(g + o - p);
    if (d < d1) { d2 = d1; d1 = d; id = hash(g); } else if (d < d2) d2 = d;
  }
  float border = smoothstep(0.08, 0.0, d2 - d1);
  vec3 col = u_fill * (0.6 + id * 0.8) + u_edge * border * (1.0 + uKick * u_punch * 1.5);
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'voronoi cells organic');
  add('sunburst', 'Sunburst', BG, 'Rotating rays from the center, pulsing on beats', shader({
    desc: 'Sunburst: rotating rays from the center (retro TV / manga look)',
    P: { rays: [16, 4, 48, 'Rays', 'Shape', 1], spin: [0.2, -2, 2, 'Spin', 'Motion'], c1: ['#ffd75e', 'Ray color'], c2: ['#ff8c42', 'Between'], ...M(0.6) },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float a = atan(p.y, p.x) + uTime * u_spin;
  float r = length(p);
  float ray = step(0.5, fract(a / 6.28318 * u_rays));
  vec3 col = mix(u_c2, u_c1, ray) * (1.0 - r * 0.6) * (1.0 + uKick * u_punch * 0.4);
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'rays manga retro');
  add('clouds', 'Clouds', BG, 'Soft drifting clouds (sky or smoke)', shader({
    desc: 'Clouds: soft fbm clouds drifting across a gradient sky',
    P: { sky1: ['#1d2b64', 'Sky top'], sky2: ['#f8cdda', 'Sky bottom'], cloud: ['#ffffff', 'Cloud'], cover: [0.5, 0, 1, 'Cover'], speed: [0.05, 0, 0.5, 'Speed', 'Motion'], ...M(0.2) },
    frag: `
void main() {
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0) * 2.5;
  float n = fbm(p + vec2(uTime * u_speed, 0.0));
  n = fbm(p + n * 1.5 + vec2(uTime * u_speed * 0.5, 0.0));
  vec3 col = mix(u_sky2, u_sky1, vUv.y);
  float c = smoothstep(1.0 - u_cover, 1.2 - u_cover * 0.6, n);
  col = mix(col, u_cloud * (0.85 + 0.15 * n), c * (0.9 + uKick * u_punch * 0.1));
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'sky smoke soft');
  add('fire', 'Fire', BG, 'Rising flames that flare on kicks', shader({
    desc: 'Fire: flames rising from the bottom',
    P: { height: [0.6, 0.1, 1.2, 'Height'], speed: [1.2, 0, 4, 'Speed', 'Motion'], hot: ['#ffe28a', 'Hot'], mid: ['#ff6a00', 'Flame'], dark: ['#3a0000', 'Embers'], ...M(0.8, 'Kick flare') },
    frag: `
void main() {
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0);
  float n = fbm(p * vec2(3.0, 2.0) - vec2(0.0, uTime * u_speed));
  float h = u_height * (1.0 + uKick * u_punch * 0.3);
  float f = clamp((h - vUv.y) / h + n * 0.6 - 0.3, 0.0, 1.0);
  vec3 col = mix(vec3(0.0), u_dark, smoothstep(0.0, 0.25, f));
  col = mix(col, u_mid, smoothstep(0.25, 0.55, f));
  col = mix(col, u_hot, smoothstep(0.6, 0.95, f));
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'flames hot forge');
  add('caustics', 'Water caustics', BG, 'Light dancing on a pool floor', shader({
    desc: 'Water caustics: rippling light like the bottom of a pool',
    P: { water: ['#05345a', 'Water'], light: ['#9ff3ff', 'Light'], scale: [1.2, 0.3, 5, 'Size'], speed: [0.6, 0, 3, 'Speed', 'Motion'], ...M(0.5) },
    frag: `
void main() {
  vec2 p = mod(vUv * vec2(uRes.x / uRes.y, 1.0) * u_scale * 6.28318, 6.28318) - 250.0;
  float t = uTime * u_speed;
  vec2 i = p;
  float c = 1.0;
  for (int n = 0; n < 4; n++) {
    float tn = t * (1.0 - 3.5 / float(n + 1));
    i = p + vec2(cos(tn - i.x) + sin(tn + i.y), sin(tn - i.y) + cos(tn + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tn) / 0.005), p.y / (cos(i.y + tn) / 0.005)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  float l = pow(abs(c), 8.0);
  gl_FragColor = vec4(u_water + u_light * clamp(l, 0.0, 1.0) * (1.0 + uKick * u_punch * 0.5), 1.0);
}`,
  }), 'pool water light');
  add('checker-warp', 'Warped checkers', BG, 'Op-art checkerboard twisting with the beat', shader({
    desc: 'Warped checkers: an op-art checkerboard bending and twisting',
    P: { size: [8, 2, 30, 'Squares'], twist: [1, 0, 4, 'Twist', 'Motion'], c1: ['#111111', 'Color 1'], c2: ['#f2f2f2', 'Color 2'], ...M(0.6) },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  p *= rot(u_twist * sin(uTime * 0.5) * (1.0 - r) * (1.0 + uKick * u_punch * 0.5));
  p *= 1.0 + 0.3 * sin(r * 6.0 - uTime * 2.0);
  vec2 q = floor(p * u_size);
  float k = mod(q.x + q.y, 2.0);
  gl_FragColor = vec4(mix(u_c1, u_c2, k), 1.0);
}`,
  }), 'op art illusion');
  add('pulse-circles', 'Pulse circles', BG, 'Concentric circles radiating out on every kick', shader({
    desc: 'Pulse circles: rings that radiate out from the center',
    P: { rings: [10, 2, 40, 'Rings'], width: [0.25, 0.02, 0.5, 'Line width'], speed: [0.5, 0, 3, 'Speed', 'Motion'], c1: ['#ffd75e', 'Ring'], background: ['#0d0614', 'Background'], ...M(1) },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  float f = fract(r * u_rings - uTime * u_speed - uKick * u_punch * 0.3);
  float ring = smoothstep(1.0 - u_width, 1.0, 1.0 - abs(f - 0.5) * 2.0);
  vec3 col = mix(u_background, u_c1, ring * (1.0 - r * 0.8));
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'rings radiate');
  add('hypno-spiral', 'Hypno spiral', BG, 'A spinning hypnotic spiral', shader({
    desc: 'Hypno spiral: a spinning black and white (or colored) spiral',
    P: { arms: [4, 1, 12, 'Arms', 'Shape', 1], tight: [8, 1, 30, 'Tightness'], spin: [1, -5, 5, 'Spin', 'Motion'], c1: ['#000000', 'Color 1'], c2: ['#ffffff', 'Color 2'], ...M(0.6) },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float a = atan(p.y, p.x);
  float r = length(p);
  float s = fract((a / 6.28318) * u_arms + log(r + 0.001) * u_tight * 0.2 - uTime * u_spin * (1.0 + uKick * u_punch));
  gl_FragColor = vec4(mix(u_c1, u_c2, smoothstep(0.48, 0.52, s)), 1.0);
}`,
  }), 'spiral illusion');
  add('julia', 'Fractal zoom', BG, 'A Julia set that morphs with the bass', shader({
    desc: 'Fractal: a Julia set that morphs with the music',
    P: { zoom: [1.2, 0.3, 4, 'Zoom'], morph: [0.2, 0, 2, 'Morph speed', 'Motion'], hue: [0.75, 0, 1, 'Hue'], ...M(0.5, 'Bass morph') },
    frag: `
void main() {
  vec2 z = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 3.0 / u_zoom;
  float t = uTime * u_morph;
  vec2 c = vec2(-0.75 + 0.15 * cos(t) + uBass * u_punch * 0.05, 0.15 + 0.15 * sin(t * 1.3));
  float n = 0.0;
  for (int i = 0; i < 64; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 16.0) break;
    n += 1.0;
  }
  float s = n / 64.0;
  gl_FragColor = vec4(hsv(u_hue + s * 0.5, 0.8, sqrt(s)) * (1.0 + uKick * 0.3), 1.0);
}`,
  }), 'julia mandelbrot math');
  add('raymarch-blob', 'Liquid orb', BG, 'A raymarched glossy orb that wobbles with the bass', shader({
    desc: 'Liquid orb: a raymarched blob that wobbles with the bass and jumps on kicks',
    P: { color: ['#7a5cff', 'Color'], rim: ['#ffd75e', 'Rim light'], wobble: [0.25, 0, 1, 'Wobble'], size: [1, 0.5, 1.6, 'Size', 'Shape'], spin: [0.4, -3, 3, 'Spin', 'Motion'], ...M(1) },
    frag: `
float map(vec3 p) {
  p.xz *= rot(uTime * u_spin);
  float d = length(p) - u_size * (1.0 + uKick * u_punch * 0.15);
  return d + u_wobble * (0.3 + uBass) * 0.25 * sin(p.x * 4.0 + uTime * 2.0) * sin(p.y * 4.0 + uTime * 1.7) * sin(p.z * 4.0);
}
void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ro = vec3(0.0, 0.0, 3.2), rd = normalize(vec3(uv, -1.4));
  float t = 0.0;
  for (int i = 0; i < 64; i++) { float d = map(ro + rd * t); if (d < 0.002 || t > 8.0) break; t += d * 0.8; }
  if (t > 8.0) { gl_FragColor = vec4(0.0); return; }
  vec3 p = ro + rd * t;
  vec2 e = vec2(0.002, 0.0);
  vec3 n = normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
  float diff = max(dot(n, normalize(vec3(0.5, 0.8, 0.6))), 0.0);
  float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  float spec = pow(max(dot(reflect(rd, n), normalize(vec3(0.5, 0.8, 0.6))), 0.0), 32.0);
  vec3 col = u_color * (0.2 + diff) + u_rim * fres * 1.2 + spec;
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'raymarch sphere 3d');
  add('raymarch-columns', 'Infinite columns', BG, 'Flying through an endless field of glowing pillars', shader({
    desc: 'Infinite columns: a raymarched flight through repeating pillars',
    P: { speed: [1, 0, 5, 'Speed', 'Motion'], glow: ['#ff2bd6', 'Glow'], fog: ['#05010a', 'Fog'], spacing: [3, 1.5, 6, 'Spacing', 'Shape'], ...M(1) },
    frag: `
float map(vec3 p) {
  vec3 q = p;
  q.xz = mod(q.xz + u_spacing * 0.5, u_spacing) - u_spacing * 0.5;
  return length(q.xz) - 0.25;
}
void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec3 ro = vec3(0.0, 0.0, -uTime * u_speed * 3.0), rd = normalize(vec3(uv, -1.0));
  rd.xy *= rot(sin(uTime * 0.2) * 0.2);
  float t = 0.0; float glow = 0.0;
  for (int i = 0; i < 60; i++) { float d = map(ro + rd * t); glow += 0.02 / (0.05 + d * d); if (d < 0.003 || t > 40.0) break; t += d; }
  vec3 col = mix(u_glow * glow * 0.05 * (1.0 + uKick * u_punch), u_fog, clamp(t / 40.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'raymarch pillars fly');
  add('moire', 'Moiré', BG, 'Two drifting ring patterns interfering', shader({
    desc: 'Moiré: two ring patterns drifting over each other',
    P: { density: [60, 10, 200, 'Density'], drift: [0.15, 0, 1, 'Drift', 'Motion'], c1: ['#ffffff', 'Line'], background: ['#000000', 'Background'], ...M(0.4) },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec2 a = p - vec2(sin(uTime * u_drift), cos(uTime * u_drift * 0.7)) * 0.15;
  vec2 b = p + vec2(cos(uTime * u_drift * 0.8), sin(uTime * u_drift)) * 0.15;
  float m = sin(length(a) * u_density) * sin(length(b) * u_density * (1.0 + uKick * u_punch * 0.03));
  gl_FragColor = vec4(mix(u_background, u_c1, smoothstep(0.0, 0.2, m)), 1.0);
}`,
  }), 'interference op art');
  add('shader-eq', 'Spectrum glow', BG, 'Full-screen glowing spectrum bars', shader({
    desc: 'Spectrum glow: the whole spectrum as glowing bars (bass on the left)',
    P: { bars: [48, 8, 64, 'Bars', 'Shape', 1], gap: [0.2, 0, 0.8, 'Gap', 'Shape'], c1: ['#2bd9ff', 'Low'], c2: ['#ff2bd6', 'High'], height: [0.8, 0.2, 1.5, 'Height'], mirror: [true, 'Mirror up / down'] },
    spec: true,
    frag: `
void main() {
  float x = vUv.x;
  float i = floor(x * u_bars);
  float v = spec((i + 0.5) / u_bars) * u_height;
  float y = u_mirror > 0.5 ? abs(vUv.y - 0.5) * 2.0 : vUv.y;
  float inBar = step(u_gap * 0.5, fract(x * u_bars)) * step(fract(x * u_bars), 1.0 - u_gap * 0.5);
  float on = step(y, v) * inBar;
  vec3 col = mix(u_c1, u_c2, i / u_bars);
  float glow = exp(-max(y - v, 0.0) * 12.0) * inBar * 0.4;
  gl_FragColor = vec4(col * (on + glow), clamp(on + glow, 0.0, 1.0));
}`,
  }), 'equalizer audio bars');
  add('spectrum-circle-shader', 'Spectrum halo', BG, 'The spectrum wrapped around a glowing circle', shader({
    desc: 'Spectrum halo: the spectrum as a glowing ring around the center (for a cover or logo)',
    P: { radius: [0.22, 0.05, 0.45, 'Radius', 'Shape'], height: [0.18, 0.02, 0.5, 'Bar height', 'Shape'], c1: ['#ffd75e', 'Color 1'], c2: ['#ff2bd6', 'Color 2'], spin: [0.05, -1, 1, 'Spin', 'Motion'] },
    spec: true,
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float a = atan(p.y, p.x) / 6.28318 + 0.5 + uTime * u_spin;
  float m = abs(fract(a) * 2.0 - 1.0);
  float v = spec(m * 0.85);
  float r = length(p);
  float ring = u_radius + v * u_height;
  float bar = step(u_radius, r) * step(r, ring) * step(0.25, fract(a * 96.0));
  float glow = exp(-abs(r - ring) * 60.0) * 0.6;
  vec3 col = mix(u_c1, u_c2, m);
  float alpha = clamp(bar + glow, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}`,
  }), 'circle audio ring');
  add('laser-beams', 'Laser show', BG, 'Sweeping laser beams from the bottom, flashing on hits', shader({
    desc: 'Laser show: beams sweeping from the bottom of the frame',
    P: { beams: [6, 1, 16, 'Beams', 'Shape', 1], c1: ['#00ff9c', 'Color 1'], c2: ['#ff2bd6', 'Color 2'], sweep: [0.6, 0, 3, 'Sweep speed', 'Motion'], width: [0.004, 0.001, 0.03, 'Beam width', 'Shape'], ...M(1) },
    frag: `
void main() {
  vec2 p = vUv - vec2(0.5, 0.0);
  p.x *= uRes.x / uRes.y;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (float(i) >= u_beams) break;
    float fi = float(i);
    float a = sin(uTime * u_sweep * (0.6 + fi * 0.13) + fi * 1.7) * 0.9;
    vec2 d = vec2(sin(a), cos(a));
    float dist = abs(p.x * d.y - p.y * d.x);
    float beam = u_width / (dist + u_width) * smoothstep(1.2, 0.0, length(p));
    col += mix(u_c1, u_c2, fi / max(1.0, u_beams - 1.0)) * beam * (0.5 + uKick * u_punch);
  }
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}`,
  }), 'lasers club beams');
  add('color-wash', 'Color wash', BG, 'Full-screen color flashes on kicks (transparent between hits)', shader({
    desc: 'Color wash: a flash of color on each kick, see-through in between',
    P: { color: ['#ff2bd6', 'Color'], hueStep: [0.12, 0, 0.5, 'Hue change per beat'], amount: [0.5, 0, 1, 'Strength'], ...M(1) },
    frag: `
void main() {
  float a = clamp(uKick * u_punch * u_amount, 0.0, 1.0);
  vec3 col = u_color;
  if (u_hueStep > 0.0) col = hsv(fract(floor(uTime * 2.0) * u_hueStep), 0.8, 1.0) * 0.5 + u_color * 0.5;
  gl_FragColor = vec4(col * a, a);
}`,
  }), 'flash overlay');
  add('spotlight', 'Spotlights', BG, 'Moving stage spotlights (transparent overlay)', shader({
    desc: 'Spotlights: stage lights sweeping over the picture (an overlay)',
    P: { lights: [3, 1, 6, 'Lights', 'Shape', 1], color: ['#fff1c9', 'Light'], size: [0.25, 0.05, 0.6, 'Size', 'Shape'], speed: [0.5, 0, 3, 'Speed', 'Motion'], ...M(0.8) },
    frag: `
void main() {
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0);
  float l = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= u_lights) break;
    float fi = float(i);
    vec2 c = vec2((0.5 + 0.4 * sin(uTime * u_speed * (0.7 + fi * 0.2) + fi * 2.0)) * uRes.x / uRes.y, 0.5 + 0.35 * cos(uTime * u_speed * (0.5 + fi * 0.15) + fi));
    l += smoothstep(u_size, u_size * 0.3, length(p - c));
  }
  float a = clamp(l * (0.35 + uKick * u_punch * 0.4), 0.0, 1.0);
  gl_FragColor = vec4(u_color * a, a);
}`,
  }), 'stage lights overlay');
  add('twinkle', 'Twinkling stars', BG, 'A starry sky that twinkles with the hi-hats', shader({
    desc: 'Twinkling stars: a night sky that sparkles with the hi-hats',
    P: { density: [0.5, 0.05, 1, 'Stars'], sky: ['#030414', 'Sky'], glow: ['#7aa0ff', 'Horizon glow'], ...M(1, 'Hi-hat sparkle') },
    frag: `
void main() {
  vec2 p = vUv * uRes / 3.0;
  vec2 id = floor(p);
  float h = hash(id);
  float star = step(1.0 - u_density * 0.01, h);
  float tw = 0.5 + 0.5 * sin(uTime * (2.0 + h * 5.0) + h * 40.0);
  vec3 col = mix(u_sky, u_glow * 0.4, pow(1.0 - vUv.y, 3.0));
  col += star * (tw * 0.7 + uHats * u_punch * hash(id + floor(uTime * 8.0))) * vec3(1.0);
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'night sky stars');
  add('truchet', 'Truchet maze', BG, 'Animated arcs tiling into a maze that flips on beats', shader({
    desc: 'Truchet maze: quarter-circle tiles that flip on the beat',
    P: { tiles: [10, 3, 40, 'Tiles'], width: [0.08, 0.01, 0.3, 'Line width'], c1: ['#48ddff', 'Line'], background: ['#0b0b16', 'Background'], ...M(0.5) },
    frag: `
void main() {
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0) * u_tiles;
  vec2 id = floor(p);
  vec2 f = fract(p);
  float flip = step(0.5, hash(id + floor(uTime * 2.0) * step(0.5, hash(id * 3.0))));
  if (flip > 0.5) f.x = 1.0 - f.x;
  float d = min(abs(length(f) - 0.5), abs(length(f - 1.0) - 0.5));
  float line = smoothstep(u_width, u_width * 0.5, d);
  gl_FragColor = vec4(mix(u_background, u_c1 * (1.0 + uKick * u_punch), line), 1.0);
}`,
  }), 'maze tiles pattern');
  add('led-matrix', 'Beat dots', BG, 'A grid of dots lighting up with the spectrum', shader({
    desc: 'Beat dots: a dot grid where each column follows a slice of the spectrum',
    P: { columns: [24, 6, 64, 'Columns', 'Shape', 1], c1: ['#ffd75e', 'Lit'], off: ['#1a1408', 'Unlit'], size: [0.35, 0.1, 0.5, 'Dot size', 'Shape'] },
    spec: true,
    frag: `
void main() {
  float cols = u_columns;
  float rows = floor(cols * uRes.y / uRes.x);
  vec2 g = vUv * vec2(cols, rows);
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float v = spec((id.x + 0.5) / cols);
  float lit = step(id.y / rows, v);
  float dotm = smoothstep(u_size, u_size - 0.06, length(f));
  vec3 col = mix(u_off, u_c1 * (0.6 + id.y / rows), lit) * dotm;
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'dot matrix led equalizer');
  add('glitch-blocks-bg', 'Glitch blocks', BG, 'Flickering colored blocks, more on hits', shader({
    desc: 'Glitch blocks: random colored blocks that flicker with the beat',
    P: { size: [12, 2, 40, 'Block grid'], c1: ['#ff2bd6', 'Color 1'], c2: ['#2bd9ff', 'Color 2'], amount: [0.15, 0, 1, 'Amount'], ...M(1) },
    frag: `
void main() {
  vec2 g = vUv * vec2(u_size * uRes.x / uRes.y, u_size);
  vec2 id = floor(g * vec2(1.0, 3.0)) / vec2(1.0, 3.0);
  float t = floor(uTime * 15.0);
  float h = hash(id + t);
  float on = step(1.0 - u_amount * (1.0 + uKick * u_punch * 3.0), h);
  vec3 col = mix(u_c1, u_c2, step(0.5, hash(id + t + 1.0)));
  gl_FragColor = vec4(col * on, on);
}`,
  }), 'digital overlay');
  add('ink-swirl', 'Ink swirl', BG, 'Marbled ink swirling (domain-warped noise)', shader({
    desc: 'Ink swirl: marbled colors folding into each other',
    P: { c1: ['#0f0c29', 'Color 1'], c2: ['#ff4e50', 'Color 2'], c3: ['#f9d423', 'Color 3'], speed: [0.1, 0, 1, 'Speed', 'Motion'], warp: [2, 0, 5, 'Swirl'], ...M(0.4) },
    frag: `
void main() {
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0) * 2.0;
  float t = uTime * u_speed;
  vec2 q = vec2(fbm(p + t), fbm(p + 5.2 - t));
  vec2 r = vec2(fbm(p + u_warp * q + 1.7 + t * 0.5), fbm(p + u_warp * q + 9.2));
  float f = fbm(p + u_warp * r * (1.0 + uKick * u_punch * 0.15));
  vec3 col = mix(u_c1, u_c2, clamp(f * f * 2.0, 0.0, 1.0));
  col = mix(col, u_c3, clamp(length(q) * 0.6, 0.0, 1.0) * f);
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'marble fluid');
  add('rings-sonar', 'Sonar', BG, 'A radar sweep with pings on hits', shader({
    desc: 'Sonar: a radar sweep with blips that ping on hits',
    P: { color: ['#3dff8b', 'Color'], speed: [0.4, 0, 2, 'Sweep speed', 'Motion'], rings: [5, 2, 12, 'Rings', 'Shape', 1], ...M(1) },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.2;
  float r = length(p);
  float a = atan(p.y, p.x);
  float sweep = fract((a / 6.28318) - uTime * u_speed);
  float beam = pow(1.0 - sweep, 6.0) * step(r, 1.0);
  float rings = smoothstep(0.02, 0.0, abs(fract(r * u_rings) - 0.5) - 0.48) * step(r, 1.0) * 0.4;
  float cross = (smoothstep(0.004, 0.0, abs(p.x)) + smoothstep(0.004, 0.0, abs(p.y))) * step(r, 1.0) * 0.3;
  vec2 id = floor(p * 6.0);
  float blip = step(0.93, hash(id)) * smoothstep(0.15, 0.0, length(fract(p * 6.0) - 0.5)) * (0.2 + uKick * u_punch);
  float v = beam * 0.6 + rings + cross + blip;
  gl_FragColor = vec4(u_color * v, clamp(v, 0.0, 1.0));
}`,
  }), 'radar hud');
  add('vapor-sun', 'Vapor sun', BG, 'A big striped sunset sun with a glow', shader({
    desc: 'Vapor sun: a striped sunset sun (put a grid or city in front)',
    P: { top: ['#ffd75e', 'Top'], bottom: ['#ff2b8a', 'Bottom'], sky: ['#1a0533', 'Sky'], size: [0.28, 0.1, 0.5, 'Size', 'Shape'], y: [0.55, 0, 1, 'Height', 'Shape'], ...M(0.5) },
    frag: `
void main() {
  vec2 p = (vUv - vec2(0.5, u_y)) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  float s = u_size * (1.0 + uKick * u_punch * 0.05);
  float k = (p.y + s) / (2.0 * s);
  float gap = step(0.5 + 0.4 * (1.0 - k), fract(k * 12.0 - uTime * 0.3)) * step(k, 0.55);
  float sun = smoothstep(s, s - 0.003, r) * (1.0 - gap);
  vec3 col = mix(u_sky, u_bottom * 0.6, exp(-r * 3.0));
  col = mix(col, mix(u_bottom, u_top, k), sun);
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'vaporwave sunset retro');
  add('noise-terrain-bg', 'Contour map', BG, 'Animated topographic map lines', shader({
    desc: 'Contour map: drifting topographic lines',
    P: { lines: [14, 4, 40, 'Lines'], line: ['#48ddff', 'Line'], background: ['#05101a', 'Background'], speed: [0.05, 0, 0.5, 'Speed', 'Motion'], ...M(0.5) },
    frag: `
void main() {
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0) * 2.0;
  float h = fbm(p + uTime * u_speed) + uBass * u_punch * 0.05;
  float f = fract(h * u_lines);
  float w = fwidth(h * u_lines);
  float l = smoothstep(w * 1.5, 0.0, min(f, 1.0 - f));
  gl_FragColor = vec4(mix(u_background, u_line, l * (0.6 + uKick * u_punch * 0.6)), 1.0);
}`,
  }), 'topographic map');
  add('kaleido-gen', 'Kaleido pattern', BG, 'A self-generating kaleidoscope (no picture needed)', shader({
    desc: 'Kaleido pattern: a self-generating kaleidoscope pattern',
    P: { segments: [8, 3, 20, 'Segments', 'Shape', 1], zoom: [3, 1, 10, 'Zoom'], speed: [0.3, 0, 2, 'Speed', 'Motion'], hue: [0.8, 0, 1, 'Hue'], ...M(0.6) },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float a = atan(p.y, p.x);
  float r = length(p);
  float seg = 6.28318 / u_segments;
  a = abs(mod(a, seg) - seg * 0.5);
  vec2 q = vec2(cos(a), sin(a)) * r * u_zoom;
  float t = uTime * u_speed;
  float n = fbm(q + vec2(t, -t));
  float m = fbm(q * 2.0 - n * 2.0 + t);
  vec3 col = hsv(u_hue + m * 0.4 + r * 0.2, 0.75, smoothstep(0.2, 0.8, m) * (1.0 + uKick * u_punch * 0.5));
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'mandala symmetric');
  add('rain-glass', 'Neon rain', BG, 'Falling neon streaks (rain at night)', shader({
    desc: 'Neon rain: falling colored streaks over a dark city glow',
    P: { density: [60, 10, 200, 'Drops'], speed: [1, 0.2, 4, 'Speed', 'Motion'], c1: ['#2bd9ff', 'Color 1'], c2: ['#ff2bd6', 'Color 2'], background: ['#05030c', 'Background'], ...M(0.5) },
    frag: `
void main() {
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0);
  float col_x = floor(p.x * u_density);
  float h = hash(vec2(col_x, 1.0));
  float y = fract(p.y + uTime * u_speed * (0.5 + h) + h * 10.0);
  float drop = smoothstep(0.0, 0.15, y) * smoothstep(0.35, 0.15, y) * step(0.6, hash(vec2(col_x, 2.0)));
  float xw = smoothstep(0.5, 0.0, abs(fract(p.x * u_density) - 0.5));
  vec3 c = mix(u_c1, u_c2, h);
  vec3 col = u_background + mix(u_c2, u_c1, vUv.y) * 0.08 + c * drop * xw * (0.6 + uKick * u_punch);
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'rain city night');
  add('glow-orbs', 'Bokeh', BG, 'Soft out-of-focus light circles drifting', shader({
    desc: 'Bokeh: soft out-of-focus lights drifting (great behind text)',
    P: { count: [24, 4, 40, 'Lights', 'Shape', 1], c1: ['#ffd75e', 'Color 1'], c2: ['#ff6a88', 'Color 2'], background: ['#0b0610', 'Background'], speed: [0.1, 0, 1, 'Speed', 'Motion'], ...M(0.5) },
    frag: `
void main() {
  vec2 p = vUv * vec2(uRes.x / uRes.y, 1.0);
  vec3 col = u_background;
  for (int i = 0; i < 40; i++) {
    if (float(i) >= u_count) break;
    float fi = float(i);
    vec2 c = vec2(hash(vec2(fi, 1.0)) * uRes.x / uRes.y, fract(hash(vec2(fi, 2.0)) + uTime * u_speed * (0.2 + hash(vec2(fi, 3.0)))));
    float r = 0.03 + 0.07 * hash(vec2(fi, 4.0));
    float d = length(p - c);
    float disk = smoothstep(r, r * 0.85, d) * (0.6 + 0.4 * smoothstep(r * 0.6, r, d));
    col += mix(u_c1, u_c2, hash(vec2(fi, 5.0))) * disk * 0.35 * (1.0 + uKick * u_punch * hash(vec2(fi, 6.0)));
  }
  gl_FragColor = vec4(col, 1.0);
}`,
  }), 'lights soft blur');
  add('stripes-sweep', 'Speed lines', BG, 'Manga speed lines radiating from the center', shader({
    desc: 'Speed lines: manga-style lines rushing from the center',
    P: { lines: [80, 20, 200, 'Lines', 'Shape', 1], color: ['#ffffff', 'Lines'], clear: [0.25, 0, 0.6, 'Clear center', 'Shape'], ...M(1) },
    frag: `
void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float a = atan(p.y, p.x) / 6.28318;
  float id = floor(a * u_lines);
  float h = hash(vec2(id, floor(uTime * 12.0)));
  float r = length(p);
  float line = step(0.6, h) * smoothstep(u_clear * (1.0 - uKick * u_punch * 0.3), u_clear + 0.3, r) * smoothstep(0.5, 0.1, abs(fract(a * u_lines) - 0.5));
  gl_FragColor = vec4(u_color * line, line);
}`,
  }), 'manga anime overlay');
  // ===================== 2D overlays: spectrum, waveform, text, HUD, social =====================
  const BANDS = `// log-spaced spectrum bands (about 30 Hz to 16 kHz), smoothed: quick up, slow down
let edges = [];
const vals = new Float32Array(256);
function readBands(n) {
  if (edges.length !== n + 1) { edges = []; for (let i = 0; i <= n; i++) edges.push(Math.max(1, Math.round((30 * Math.pow(16000 / 30, i / n)) / 23.4))); }
  const s = audio.spectrum;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = edges[i]; j <= Math.max(edges[i], edges[i + 1] - 1); j++) if (s[j] > m) m = s[j];
    const v = m / 255;
    vals[i] = v > vals[i] ? v : vals[i] * 0.85 + v * 0.15;
  }
  return vals;
}`;
  const VIS = 'Visualizers';
  const TXT = 'Text & HUD';
  const SOC = 'Social';
  const TEXTS = ['HEARTH', 'FORGEHEART', 'DROP', 'NEW MUSIC', 'OUT NOW', 'LISTEN', 'SUBSCRIBE', 'LIVE'];
  const FONTS = ['sans-serif', 'Impact', 'Georgia', 'monospace', 'Arial Black'];
  add('spectrum-bars', 'Spectrum bars', VIS, 'Classic equalizer bars along the bottom (or mirrored in the middle)', canvas2d({
    desc: 'Spectrum bars: the music as equalizer bars, bass on the left',
    P: { bars: [48, 8, 128, 'Bars', 'Shape', 1], height: [0.35, 0.05, 1, 'Height', 'Shape'], gap: [0.25, 0, 0.8, 'Gap', 'Shape'], mirror: [false, 'Mirror in the middle', 'Shape'], round: [true, 'Rounded', 'Shape'], c1: ['#2bd9ff', 'Low color'], c2: ['#ff2bd6', 'High color'], y: [0.95, 0.1, 1, 'Position (bottom)', 'Shape'] },
    setup: BANDS,
    draw: `const n = Math.round(P.bars);
const v = readBands(n);
const bw = W / n;
const grad = g.createLinearGradient(0, 0, W, 0);
grad.addColorStop(0, P.c1); grad.addColorStop(1, P.c2);
g.fillStyle = grad;
const base = H * P.y;
for (let i = 0; i < n; i++) {
  const h = Math.max(2, v[i] * H * P.height);
  const x = i * bw + (bw * P.gap) / 2;
  const w = bw * (1 - P.gap);
  const top = P.mirror ? H / 2 - h / 2 : base - h;
  g.beginPath();
  if (P.round && g.roundRect) g.roundRect(x, top, w, h, Math.min(w / 2, h / 2)); else g.rect(x, top, w, h);
  g.fill();
}`,
  }), 'equalizer audio analyzer');
  add('spectrum-radial', 'Radial spectrum', VIS, 'Spectrum bars around a circle (put a cover or logo in the middle)', canvas2d({
    desc: 'Radial spectrum: bars around a circle that pumps on kicks',
    P: { bars: [96, 16, 256, 'Bars', 'Shape', 1], radius: [0.2, 0.05, 0.45, 'Radius', 'Shape'], height: [0.18, 0.02, 0.5, 'Bar length', 'Shape'], width: [0.5, 0.1, 1, 'Bar width', 'Shape'], c1: ['#ffd75e', 'Color 1'], c2: ['#ff6a3d', 'Color 2'], spin: [0.05, -1, 1, 'Spin', 'Motion'], ...M(0.6) },
    setup: BANDS,
    draw: `const n = Math.round(P.bars);
const half = Math.ceil(n / 2);
const v = readBands(half);
const m = Math.min(W, H);
const r0 = m * P.radius * (1 + kick * P.punch * 0.08);
g.translate(W / 2, H / 2);
g.rotate(t * P.spin);
g.lineCap = 'round';
g.lineWidth = Math.max(1, ((Math.PI * 2 * r0) / n) * P.width);
for (let i = 0; i < n; i++) {
  const k = i < half ? i : n - 1 - i; // mirrored: bass at the top and bottom
  const a = (i / n) * Math.PI * 2;
  const len = Math.max(2, v[k] * m * P.height);
  g.strokeStyle = k / half < 0.5 ? P.c1 : P.c2;
  g.beginPath();
  g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
  g.lineTo(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len));
  g.stroke();
}`,
  }), 'circle audio');
  add('oscilloscope', 'Oscilloscope', VIS, 'The waveform as a glowing line across the frame', canvas2d({
    desc: 'Oscilloscope: the sound wave as a glowing line',
    P: { color: ['#3dff8b', 'Color'], width: [3, 1, 12, 'Line width', 'Shape'], height: [0.25, 0.02, 0.5, 'Height', 'Shape'], y: [0.5, 0, 1, 'Position', 'Shape'], glow: [12, 0, 40, 'Glow'], ...M(0.5) },
    draw: `const w = audio.waveform;
g.strokeStyle = P.color;
g.lineWidth = P.width * devicePixelRatio * (1 + kick * P.punch * 0.5);
g.shadowColor = P.color;
g.shadowBlur = P.glow;
g.beginPath();
const step = Math.max(1, Math.floor(w.length / 512));
for (let i = 0; i < w.length; i += step) {
  const x = (i / (w.length - 1)) * W;
  const y = H * P.y + w[i] * H * P.height;
  if (i) g.lineTo(x, y); else g.moveTo(x, y);
}
g.stroke();`,
  }), 'waveform scope');
  add('wave-ring', 'Waveform ring', VIS, 'The waveform bent into a circle', canvas2d({
    desc: 'Waveform ring: the sound wave drawn around a circle',
    P: { radius: [0.25, 0.05, 0.45, 'Radius', 'Shape'], amount: [0.15, 0.01, 0.5, 'Wave size', 'Shape'], width: [3, 1, 12, 'Line width', 'Shape'], color: ['#48ddff', 'Color'], fill: [false, 'Filled'], glow: [10, 0, 40, 'Glow'], ...M(0.6) },
    draw: `const w = audio.waveform;
const m = Math.min(W, H);
const r0 = m * P.radius * (1 + kick * P.punch * 0.1);
g.translate(W / 2, H / 2);
g.strokeStyle = P.color;
g.fillStyle = P.color + '33';
g.lineWidth = P.width * devicePixelRatio;
g.shadowColor = P.color;
g.shadowBlur = P.glow;
g.beginPath();
const n = 360;
for (let i = 0; i <= n; i++) {
  const a = (i / n) * Math.PI * 2;
  const s = w[Math.floor((i % n) / n * (w.length - 1))] || 0;
  const r = r0 + s * m * P.amount;
  if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
}
g.closePath();
if (P.fill) g.fill();
g.stroke();`,
  }), 'circle waveform');
  add('sound-blob', 'Sound blob', VIS, 'A smooth filled blob shaped by the spectrum', canvas2d({
    desc: 'Sound blob: a soft shape whose outline follows the spectrum',
    P: { radius: [0.2, 0.05, 0.4, 'Radius', 'Shape'], amount: [0.25, 0.02, 0.6, 'Spikiness', 'Shape'], c1: ['#ff2bd6', 'Inner'], c2: ['#7a5cff', 'Outer'], spin: [0.2, -2, 2, 'Spin', 'Motion'], ...M(0.6) },
    setup: BANDS,
    draw: `const v = readBands(32);
const m = Math.min(W, H);
const r0 = m * P.radius * (1 + kick * P.punch * 0.1);
g.translate(W / 2, H / 2);
g.rotate(t * P.spin);
const grad = g.createRadialGradient(0, 0, 0, 0, 0, r0 * 2);
grad.addColorStop(0, P.c1); grad.addColorStop(1, P.c2);
g.fillStyle = grad;
g.beginPath();
const pts = 64;
for (let i = 0; i <= pts; i++) {
  const a = (i / pts) * Math.PI * 2;
  const k = i % pts < pts / 2 ? (i % pts) : pts - (i % pts);
  const r = r0 + v[Math.min(31, k)] * m * P.amount;
  if (i) g.lineTo(Math.cos(a) * r, Math.sin(a) * r); else g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
}
g.closePath();
g.fill();`,
  }), 'organic shape audio');
  add('spectrogram', 'Spectrogram', VIS, 'A scrolling waterfall of the spectrum over time', canvas2d({
    desc: 'Spectrogram: the spectrum scrolling over time (bass at the bottom)',
    P: { speed: [2, 1, 8, 'Scroll speed', 'Motion', 1], hue: [0.75, 0, 1, 'Hue'], contrast: [1.4, 0.5, 3, 'Contrast'], opacity: [1, 0.1, 1, 'Opacity'] },
    setup: BANDS + `
const buf = document.createElement('canvas');
const bg = buf.getContext('2d');`,
    draw: `if (buf.width !== W || buf.height !== H) { buf.width = W; buf.height = H; }
const n = 128;
const v = readBands(n);
const sp = Math.round(P.speed);
bg.drawImage(buf, -sp, 0);
const bh = H / n;
for (let i = 0; i < n; i++) {
  const x = Math.pow(v[i], 1 / P.contrast);
  bg.fillStyle = 'hsl(' + Math.round((P.hue + x * 0.4) * 360) + ',90%,' + Math.round(x * 60) + '%)';
  bg.fillRect(W - sp, H - (i + 1) * bh, sp, bh + 1);
}
g.globalAlpha = P.opacity;
g.drawImage(buf, 0, 0);`,
  }), 'waterfall frequency');
  add('vu-meters', 'VU meters', VIS, 'Level, bass, mids and highs as meters with peak hold', canvas2d({
    desc: 'VU meters: level, bass, mids and highs with peak markers',
    P: { c1: ['#3dff8b', 'Low'], c2: ['#ffd75e', 'Mid'], c3: ['#ff3d3d', 'Hot'], segments: [20, 6, 40, 'Segments', 'Shape', 1], size: [0.3, 0.1, 0.8, 'Size', 'Shape'], x: [0.08, 0, 1, 'Position X', 'Shape'], y: [0.9, 0, 1, 'Position Y (bottom)', 'Shape'] },
    setup: 'const peaks = [0, 0, 0, 0];\nconst names = [\'LVL\', \'BASS\', \'MID\', \'HIGH\'];',
    draw: `const vals4 = [audio.level, audio.bass, audio.mid, audio.treble];
const segs = Math.round(P.segments);
const hgt = H * P.size;
const bw = hgt / 8;
g.font = Math.round(bw * 0.45) + 'px monospace';
g.textAlign = 'center';
for (let k = 0; k < 4; k++) {
  peaks[k] = Math.max(peaks[k] * 0.985, vals4[k]);
  const x = W * P.x + k * bw * 1.4;
  for (let i = 0; i < segs; i++) {
    const f = i / segs;
    const on = f < vals4[k];
    g.fillStyle = f > 0.85 ? P.c3 : f > 0.6 ? P.c2 : P.c1;
    g.globalAlpha = on ? 1 : 0.15;
    g.fillRect(x, H * P.y - (i + 1) * (hgt / segs), bw, hgt / segs - 2);
  }
  g.globalAlpha = 1;
  g.fillRect(x, H * P.y - peaks[k] * hgt - 2, bw, 3);
  g.fillText(names[k], x + bw / 2, H * P.y + bw * 0.6);
}`,
  }), 'meters levels hud');
  add('hifi-eq', 'Hi-fi equalizer', VIS, 'Segmented LED bars like an old stereo, with peak dots', canvas2d({
    desc: 'Hi-fi equalizer: segmented LED bars with falling peak dots',
    P: { bars: [16, 6, 40, 'Bars', 'Shape', 1], segments: [14, 6, 30, 'Segments', 'Shape', 1], c1: ['#2bff88', 'Low'], c2: ['#ffd75e', 'Mid'], c3: ['#ff3b3b', 'Top'], width: [0.6, 0.2, 1, 'Width', 'Shape'], height: [0.4, 0.1, 0.9, 'Height', 'Shape'] },
    setup: BANDS + '\nconst peak = new Float32Array(64);',
    draw: `const n = Math.round(P.bars);
const v = readBands(n);
const segs = Math.round(P.segments);
const total = W * P.width;
const x0 = (W - total) / 2;
const bw = total / n;
const sh = (H * P.height) / segs;
const yb = H * 0.5 + (H * P.height) / 2;
for (let i = 0; i < n; i++) {
  peak[i] = Math.max(peak[i] - 0.008, v[i]);
  const lit = Math.round(v[i] * segs);
  for (let s = 0; s < segs; s++) {
    const f = s / segs;
    g.fillStyle = f > 0.8 ? P.c3 : f > 0.55 ? P.c2 : P.c1;
    g.globalAlpha = s < lit ? 1 : 0.1;
    g.fillRect(x0 + i * bw + bw * 0.1, yb - (s + 1) * sh + sh * 0.15, bw * 0.8, sh * 0.7);
  }
  g.globalAlpha = 1;
  g.fillStyle = P.c3;
  g.fillRect(x0 + i * bw + bw * 0.1, yb - Math.round(peak[i] * segs) * sh - sh * 0.3, bw * 0.8, sh * 0.25);
}`,
  }), 'stereo led retro');
  add('title-card', 'Title', TXT, 'Big title text that punches on kicks (pick or edit the text)', canvas2d({
    desc: 'Title: big text that punches on kicks. Edit the options list in the code for your own words.',
    P: { text: ['HEARTH', TEXTS, 'Text', 'Text'], font: ['Impact', FONTS, 'Font', 'Text'], size: [0.16, 0.03, 0.5, 'Size', 'Text'], color: ['#ffffff', 'Color'], outline: ['#ff2bd6', 'Glow color'], glow: [30, 0, 80, 'Glow'], y: [0.5, 0, 1, 'Position Y', 'Text'], tracking: [0.05, -0.1, 0.5, 'Letter spacing', 'Text'], ...M(0.6) },
    draw: `const m = Math.min(W, H);
const s = m * P.size * (1 + kick * P.punch * 0.12);
g.font = 'bold ' + Math.round(s) + 'px ' + P.font;
g.textAlign = 'center';
g.textBaseline = 'middle';
if ('letterSpacing' in g) g.letterSpacing = Math.round(s * P.tracking) + 'px';
g.shadowColor = P.outline;
g.shadowBlur = P.glow * (1 + kick * P.punch);
g.fillStyle = P.color;
g.fillText(P.text, W / 2, H * P.y);`,
  }), 'text headline');
  add('caption-bar', 'Caption bar', TXT, 'A lower-third bar with a title and subtitle', canvas2d({
    desc: 'Caption bar: a lower-third with a title and a line under it',
    P: { title: ['FORGEHEART', TEXTS, 'Title', 'Text'], sub: ['new track · out now', ['new track · out now', 'live session', 'visualizer', 'official audio', 'made with Hearth'], 'Subtitle', 'Text'], bar: ['#000000', 'Bar'], accent: ['#ffd75e', 'Accent'], text: ['#ffffff', 'Text color'], y: [0.82, 0.5, 0.97, 'Position Y', 'Text'], opacity: [0.65, 0, 1, 'Bar opacity'] },
    draw: `const m = Math.min(W, H);
const h = m * 0.12;
const y = H * P.y - h / 2;
g.globalAlpha = P.opacity;
g.fillStyle = P.bar;
g.fillRect(0, y, W, h);
g.globalAlpha = 1;
g.fillStyle = P.accent;
g.fillRect(0, y, m * 0.015 + kick * m * 0.01, h);
g.fillStyle = P.text;
g.textBaseline = 'alphabetic';
g.font = 'bold ' + Math.round(h * 0.42) + 'px sans-serif';
g.fillText(P.title, m * 0.05, y + h * 0.5);
g.globalAlpha = 0.75;
g.font = Math.round(h * 0.24) + 'px sans-serif';
g.fillText(P.sub, m * 0.05, y + h * 0.85);`,
  }), 'lower third subtitle');
  add('beat-hud', 'Beat counter', TXT, 'Bar · beat · BPM readout with a beat light', canvas2d({
    desc: 'Beat counter: bar, beat and BPM, with a light that blinks on the beat',
    P: { color: ['#ffd75e', 'Color'], size: [0.04, 0.015, 0.1, 'Size', 'Text'], x: [0.04, 0, 1, 'Position X', 'Text'], y: [0.06, 0, 1, 'Position Y', 'Text'] },
    draw: `const m = Math.min(W, H);
const s = m * P.size;
g.font = Math.round(s) + 'px monospace';
g.textBaseline = 'top';
g.fillStyle = P.color;
const bpm = audio.bpm ? Math.round(audio.bpm) : '--';
g.fillText('BAR ' + String(audio.bar || 1).padStart(3, '0') + '  BEAT ' + (audio.beatInBar || 1) + '/' + audio.beatsPerBar + '  ' + bpm + ' BPM', W * P.x + s * 1.4, H * P.y);
g.globalAlpha = 0.25 + 0.75 * beatPulse(1, 8);
g.beginPath();
g.arc(W * P.x + s * 0.5, H * P.y + s * 0.5, s * 0.4, 0, Math.PI * 2);
g.fill();`,
  }), 'bpm hud readout');
  add('progress-bar', 'Song progress', TXT, 'A thin progress bar for the song (or loop)', canvas2d({
    desc: 'Song progress: a progress bar with the elapsed time',
    P: { color: ['#ffffff', 'Bar'], track: ['#ffffff', 'Track'], thickness: [0.008, 0.002, 0.03, 'Thickness', 'Shape'], y: [0.94, 0, 1, 'Position Y', 'Shape'], margin: [0.08, 0, 0.3, 'Margin', 'Shape'], times: [true, 'Show times', 'Shape'] },
    draw: `const m = Math.min(W, H);
const x0 = W * P.margin;
const w = W - x0 * 2;
const th = m * P.thickness;
const p = audio.duration ? audio.time / audio.duration : (t % 30) / 30;
g.globalAlpha = 0.25;
g.fillStyle = P.track;
g.fillRect(x0, H * P.y, w, th);
g.globalAlpha = 1;
g.fillStyle = P.color;
g.fillRect(x0, H * P.y, w * p, th);
g.beginPath();
g.arc(x0 + w * p, H * P.y + th / 2, th * 1.6, 0, Math.PI * 2);
g.fill();
if (P.times) {
  const f = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  g.font = Math.round(m * 0.028) + 'px sans-serif';
  g.textBaseline = 'top';
  g.fillText(f(audio.duration ? audio.time : t % 30), x0, H * P.y + th * 3);
  g.textAlign = 'right';
  g.fillText(f(audio.duration || 30), x0 + w, H * P.y + th * 3);
}`,
  }), 'timeline player');
  add('timecode', 'Timecode', TXT, 'A running SMPTE timecode in a corner', canvas2d({
    desc: 'Timecode: hours:minutes:seconds:frames in a corner',
    P: { color: ['#ffffff', 'Color'], box: ['#000000', 'Box'], fps: [30, 24, 60, 'Frames per second', 'Text', 1], size: [0.035, 0.015, 0.08, 'Size', 'Text'], corner: ['top right', ['top left', 'top right', 'bottom left', 'bottom right'], 'Corner', 'Text'] },
    draw: `const m = Math.min(W, H);
const s = m * P.size;
const tt = audio.duration ? audio.time : t;
const pad = (x) => String(Math.floor(x)).padStart(2, '0');
const label = pad(tt / 3600) + ':' + pad((tt % 3600) / 60) + ':' + pad(tt % 60) + ':' + pad((tt % 1) * P.fps);
g.font = Math.round(s) + 'px monospace';
const tw = g.measureText(label).width + s;
const right = P.corner.includes('right');
const bottom = P.corner.includes('bottom');
const x = right ? W - tw - s : s;
const y = bottom ? H - s * 2.6 : s;
g.globalAlpha = 0.6;
g.fillStyle = P.box;
g.fillRect(x, y, tw, s * 1.6);
g.globalAlpha = 1;
g.fillStyle = P.color;
g.textBaseline = 'middle';
g.fillText(label, x + s / 2, y + s * 0.8);`,
  }), 'smpte clock');
  add('now-playing', 'Now playing', TXT, 'A card with the song name, a little equalizer and progress', canvas2d({
    desc: 'Now playing: the song file name with a tiny equalizer and progress',
    P: { card: ['#101018', 'Card'], accent: ['#ffd75e', 'Accent'], text: ['#ffffff', 'Text'], x: [0.05, 0, 1, 'Position X', 'Shape'], y: [0.05, 0, 1, 'Position Y', 'Shape'], size: [0.35, 0.15, 0.9, 'Width', 'Shape'] },
    setup: BANDS,
    draw: `const m = Math.min(W, H);
const w = W * P.size;
const h = m * 0.11;
const x = W * P.x;
const y = H * P.y;
g.globalAlpha = 0.8;
g.fillStyle = P.card;
g.beginPath();
if (g.roundRect) g.roundRect(x, y, w, h, h * 0.2); else g.rect(x, y, w, h);
g.fill();
g.globalAlpha = 1;
const v = readBands(5);
for (let i = 0; i < 5; i++) { g.fillStyle = P.accent; const bh = Math.max(h * 0.08, v[i] * h * 0.6); g.fillRect(x + h * 0.2 + i * h * 0.1, y + h * 0.75 - bh, h * 0.07, bh); }
g.fillStyle = P.text;
g.font = 'bold ' + Math.round(h * 0.26) + 'px sans-serif';
g.textBaseline = 'middle';
const name = (audio.file || 'No song loaded').replace(/\\.[^.]+$/, '');
g.fillText(name.length > 34 ? name.slice(0, 33) + '…' : name, x + h * 0.8, y + h * 0.4);
g.globalAlpha = 0.3;
g.fillRect(x + h * 0.8, y + h * 0.7, w - h, h * 0.05);
g.globalAlpha = 1;
g.fillStyle = P.accent;
g.fillRect(x + h * 0.8, y + h * 0.7, (w - h) * (audio.duration ? audio.time / audio.duration : 0), h * 0.05);`,
  }), 'song card player');
  add('safe-zones', 'Safe zones', SOC, 'TikTok / Reels / Shorts UI zones to keep text clear (hide before exporting)', canvas2d({
    desc: 'Safe zones: where TikTok, Reels and Shorts put their buttons and captions (turn off before exporting)',
    P: { app: ['TikTok', ['TikTok', 'Reels', 'Shorts', 'Feed 4:5'], 'App', 'Guides'], color: ['#ff3b3b', 'Color'], opacity: [0.35, 0.05, 1, 'Opacity'] },
    draw: `g.globalAlpha = P.opacity;
g.fillStyle = P.color;
g.strokeStyle = P.color;
g.lineWidth = Math.max(2, W / 400);
// unsafe areas as fractions of the frame: top, bottom, right column (buttons)
const z = { TikTok: [0.1, 0.2, 0.16], Reels: [0.11, 0.24, 0.14], Shorts: [0.1, 0.22, 0.15], 'Feed 4:5': [0.05, 0.08, 0] }[P.app];
g.fillRect(0, 0, W, H * z[0]);
g.fillRect(0, H * (1 - z[1]), W, H * z[1]);
if (z[2]) g.fillRect(W * (1 - z[2]), H * z[0], W * z[2], H * (1 - z[0] - z[1]));
g.globalAlpha = Math.min(1, P.opacity * 2);
g.setLineDash([12, 8]);
g.strokeRect(W * 0.06, H * z[0], W * (0.94 - z[2]) - W * 0.06, H * (1 - z[0] - z[1]));
g.setLineDash([]);
g.font = Math.round(W / 30) + 'px sans-serif';
g.fillText(P.app + ' safe area', W * 0.07, H * z[0] + W / 24);`,
  }), 'guides tiktok reels shorts');
  add('drop-countdown', 'Drop countdown', TXT, 'Counts down to the next detected drop', canvas2d({
    desc: 'Drop countdown: seconds until the next drop (from the song analysis), flashing at zero',
    P: { color: ['#ffffff', 'Color'], accent: ['#ff2b5e', 'Drop color'], size: [0.12, 0.03, 0.4, 'Size', 'Text'], y: [0.5, 0, 1, 'Position Y', 'Text'], label: ['DROP IN', ['DROP IN', 'GET READY', 'NEXT', 'INCOMING'], 'Label', 'Text'] },
    draw: `const m = Math.min(W, H);
const s = m * P.size;
const left = audio.untilDrop;
const since = audio.sinceDrop;
g.textAlign = 'center';
g.textBaseline = 'middle';
if (since < 1.5) {
  g.globalAlpha = 1 - since / 1.5;
  g.fillStyle = P.accent;
  g.font = 'bold ' + Math.round(s * 1.6) + 'px Impact, sans-serif';
  g.fillText('DROP', W / 2, H * P.y);
} else if (Number.isFinite(left) && left < 16) {
  g.fillStyle = P.color;
  g.font = Math.round(s * 0.3) + 'px sans-serif';
  g.fillText(P.label, W / 2, H * P.y - s * 0.75);
  g.font = 'bold ' + Math.round(s) + 'px monospace';
  g.fillStyle = left < 3 ? P.accent : P.color;
  g.fillText(left.toFixed(1), W / 2, H * P.y);
}`,
  }), 'countdown timer');
  add('dvd-bounce', 'Bouncing logo', TXT, 'Text bouncing around the frame, changing color on each wall', canvas2d({
    desc: 'Bouncing logo: the old DVD screensaver, changing color when it hits a wall',
    P: { text: ['HEARTH', TEXTS, 'Text', 'Text'], size: [0.08, 0.02, 0.3, 'Size', 'Text'], speed: [0.25, 0, 1, 'Speed', 'Motion'], ...M(0.5) },
    setup: 'let bx = 0.2;\nlet by = 0.3;\nlet vx = 1;\nlet vy = 1;\nlet hue = 40;\nlet last = 0;',
    draw: `const dt = last ? Math.min(0.05, t - last) : 0;
last = t;
const m = Math.min(W, H);
const s = m * P.size * (1 + kick * P.punch * 0.1);
g.font = 'bold ' + Math.round(s) + 'px sans-serif';
const tw = g.measureText(P.text).width;
bx += vx * P.speed * dt * (W / m) * 0.5;
by += vy * P.speed * dt * 0.5;
const maxX = 1 - tw / W;
const maxY = 1 - s / H;
if (bx < 0 || bx > maxX) { vx = -vx; bx = Math.max(0, Math.min(maxX, bx)); hue = (hue + 67) % 360; }
if (by < 0 || by > maxY) { vy = -vy; by = Math.max(0, Math.min(maxY, by)); hue = (hue + 67) % 360; }
g.fillStyle = 'hsl(' + hue + ',90%,60%)';
g.textBaseline = 'top';
g.fillText(P.text, bx * W, by * H);`,
  }), 'dvd screensaver');
  add('confetti', 'Confetti', VIS, 'Bursts of confetti on hits', canvas2d({
    desc: 'Confetti: a burst of colored paper on every hit (kick by default)',
    P: { amount: [40, 5, 200, 'Pieces per hit', 'Shape', 1], size: [0.012, 0.004, 0.04, 'Piece size', 'Shape'], gravity: [0.6, 0, 2, 'Gravity', 'Motion'], on: ['kick', ['kick', 'snare', 'hit', 'beat', 'bass'], 'Burst on', 'Music'], c1: ['#ffd75e', 'Color 1'], c2: ['#ff2bd6', 'Color 2'], c3: ['#2bd9ff', 'Color 3'] },
    setup: `const MAX = 2000;
const px = new Float32Array(MAX); const py = new Float32Array(MAX); const vx = new Float32Array(MAX); const vy = new Float32Array(MAX);
const rot = new Float32Array(MAX); const life = new Float32Array(MAX); const col = new Uint8Array(MAX);
let head = 0;
let prev = 0;
let lastT = 0;`,
    draw: `const dt = lastT ? Math.min(0.05, t - lastT) : 0;
lastT = t;
const hit = P.on === 'beat' ? audio.beat : audio.trigger(P.on);
if (hit > 0.5 && prev <= 0.5) {
  for (let i = 0; i < P.amount; i++) {
    const k = head; head = (head + 1) % MAX;
    px[k] = 0.5 + (Math.random() - 0.5) * 0.2; py[k] = 0.55;
    const a = Math.random() * Math.PI * 2; const sp = 0.3 + Math.random() * 0.8;
    vx[k] = Math.cos(a) * sp * 0.6; vy[k] = Math.sin(a) * sp - 0.6;
    rot[k] = Math.random() * 6; life[k] = 2 + Math.random(); col[k] = Math.floor(Math.random() * 3);
  }
}
prev = hit;
const s = Math.min(W, H) * P.size;
for (let k = 0; k < MAX; k++) {
  if (life[k] <= 0) continue;
  life[k] -= dt;
  vy[k] += P.gravity * dt; vx[k] *= 0.99;
  px[k] += vx[k] * dt; py[k] += vy[k] * dt; rot[k] += dt * 6;
  g.fillStyle = col[k] === 0 ? P.c1 : col[k] === 1 ? P.c2 : P.c3;
  g.globalAlpha = Math.min(1, life[k]);
  g.setTransform(Math.cos(rot[k]), Math.sin(rot[k]) * 0.5, -Math.sin(rot[k]), Math.cos(rot[k]), px[k] * W, py[k] * H);
  g.fillRect(-s / 2, -s / 4, s, s / 2);
}`,
  }), 'party particles');
  add('marquee', 'Marquee', TXT, 'Scrolling text band (news ticker style)', canvas2d({
    desc: 'Marquee: a scrolling band of text',
    P: { text: ['NEW MUSIC · OUT NOW · LINK IN BIO · ', ['NEW MUSIC · OUT NOW · LINK IN BIO · ', 'FORGEHEART · FORGEHEART · ', 'LIVE · LIVE · LIVE · ', 'TURN IT UP · '], 'Text', 'Text'], band: ['#ffd75e', 'Band'], color: ['#000000', 'Text color'], speed: [0.15, -1, 1, 'Speed', 'Motion'], y: [0.88, 0, 1, 'Position Y', 'Text'], size: [0.06, 0.02, 0.2, 'Size', 'Text'], angle: [-3, -20, 20, 'Tilt', 'Text'] },
    draw: `const m = Math.min(W, H);
const h = m * P.size;
g.translate(W / 2, H * P.y);
g.rotate((P.angle * Math.PI) / 180);
g.fillStyle = P.band;
g.fillRect(-W, -h * 0.7, W * 2, h * 1.4);
g.font = 'bold ' + Math.round(h) + 'px Impact, sans-serif';
g.textBaseline = 'middle';
g.fillStyle = P.color;
const tw = Math.max(1, g.measureText(P.text).width);
let x = -W - ((t * P.speed * W) % tw + tw) % tw;
while (x < W) { g.fillText(P.text, x, 0); x += tw; }`,
  }), 'ticker scroll band');
  add('glitch-text', 'Glitch text', TXT, 'Text that tears into RGB slices on hits', canvas2d({
    desc: 'Glitch text: a title that tears into color slices on hits',
    P: { text: ['FORGEHEART', TEXTS, 'Text', 'Text'], size: [0.12, 0.03, 0.4, 'Size', 'Text'], color: ['#ffffff', 'Color'], amount: [1, 0, 3, 'Glitch'], y: [0.5, 0, 1, 'Position Y', 'Text'] },
    setup: 'const buf = document.createElement(\'canvas\');\nconst bg = buf.getContext(\'2d\');',
    draw: `const m = Math.min(W, H);
const s = Math.round(m * P.size);
if (buf.width !== W || buf.height !== s * 2) { buf.width = W; buf.height = s * 2; }
bg.clearRect(0, 0, buf.width, buf.height);
bg.font = 'bold ' + s + 'px Impact, sans-serif';
bg.textAlign = 'center';
bg.textBaseline = 'middle';
bg.fillStyle = P.color;
bg.fillText(P.text, W / 2, s);
const hit = Math.max(kick, snare, audio.hit) * P.amount;
const y0 = H * P.y - s;
if (hit > 0.05) {
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = 0.8;
  g.filter = 'none';
  g.drawImage(buf, -hit * s * 0.15, y0);
  g.drawImage(buf, hit * s * 0.15, y0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}
const slices = 12;
const sh = buf.height / slices;
for (let i = 0; i < slices; i++) {
  const off = Math.random() < hit * 0.3 ? (Math.random() - 0.5) * s * hit : 0;
  g.drawImage(buf, 0, i * sh, W, sh, off, y0 + i * sh, W, sh);
}`,
  }), 'text rgb');
  add('story-bars', 'Story bars', SOC, 'Instagram-story style segments that fill bar by bar', canvas2d({
    desc: 'Story bars: segments at the top that fill one per bar (or per 4 bars)',
    P: { segments: [8, 2, 16, 'Segments', 'Shape', 1], barsEach: [4, 1, 16, 'Bars per segment', 'Shape', 1], color: ['#ffffff', 'Color'], y: [0.03, 0, 0.2, 'Position Y', 'Shape'] },
    draw: `const n = Math.round(P.segments);
const pad = W * 0.03;
const gap = W * 0.008;
const w = (W - pad * 2 - gap * (n - 1)) / n;
const th = Math.max(3, H * 0.004);
const pos = (((audio.bar || 1) - 1) + (audio.barPhase || 0)) / Math.round(P.barsEach);
for (let i = 0; i < n; i++) {
  const f = Math.max(0, Math.min(1, pos - i));
  const x = pad + i * (w + gap);
  g.globalAlpha = 0.35;
  g.fillStyle = P.color;
  g.fillRect(x, H * P.y, w, th);
  g.globalAlpha = 1;
  g.fillRect(x, H * P.y, w * f, th);
}`,
  }), 'instagram stories');
  add('handle-tag', 'Handle tag', SOC, 'Your @handle in a pill in a corner, nudging on kicks', canvas2d({
    desc: 'Handle tag: your @handle in a rounded pill (edit the options in the code)',
    P: { handle: ['@forgeheart', ['@forgeheart', '@hearth', '@yourname'], 'Handle', 'Text'], pill: ['#000000', 'Pill'], color: ['#ffffff', 'Text'], size: [0.035, 0.015, 0.08, 'Size', 'Text'], corner: ['bottom left', ['top left', 'top right', 'bottom left', 'bottom right'], 'Corner', 'Text'], ...M(0.3) },
    draw: `const m = Math.min(W, H);
const s = m * P.size * (1 + kick * P.punch * 0.1);
g.font = 'bold ' + Math.round(s) + 'px sans-serif';
const tw = g.measureText(P.handle).width + s * 1.2;
const h = s * 1.7;
const x = P.corner.includes('right') ? W - tw - m * 0.04 : m * 0.04;
const y = P.corner.includes('bottom') ? H - h - m * 0.05 : m * 0.05;
g.globalAlpha = 0.6;
g.fillStyle = P.pill;
g.beginPath();
if (g.roundRect) g.roundRect(x, y, tw, h, h / 2); else g.rect(x, y, tw, h);
g.fill();
g.globalAlpha = 1;
g.fillStyle = P.color;
g.textBaseline = 'middle';
g.fillText(P.handle, x + s * 0.6, y + h / 2);`,
  }), 'username watermark');
  add('word-flash', 'Word flash', TXT, 'One word per beat from a list (kinetic typography)', canvas2d({
    desc: 'Word flash: a new word on every beat (edit the list in the code)',
    P: { words: ['FEEL · THE · BASS · DROP', ['FEEL · THE · BASS · DROP', 'ONE · TWO · THREE · FOUR', 'FORGE · THE · HEART', 'NEW · MUSIC · OUT · NOW'], 'Words', 'Text'], every: [1, 1, 8, 'Beats per word', 'Text', 1], size: [0.18, 0.05, 0.5, 'Size', 'Text'], color: ['#ffffff', 'Color'], font: ['Impact', FONTS, 'Font', 'Text'], ...M(0.8) },
    setup: 'let list = [];\nlet listOf = null;',
    draw: `if (listOf !== P.words) { listOf = P.words; list = P.words.split('·').map((w) => w.trim()).filter(Boolean); }
const beatNo = Math.floor((((audio.bar || 1) - 1) * audio.beatsPerBar + ((audio.beatInBar || 1) - 1)) / Math.round(P.every));
const word = list[((beatNo % list.length) + list.length) % list.length] || '';
const m = Math.min(W, H);
const s = m * P.size * (1 + beatPulse(1 / Math.round(P.every), 10) * P.punch * 0.15);
g.font = 'bold ' + Math.round(s) + 'px ' + P.font;
g.textAlign = 'center';
g.textBaseline = 'middle';
g.fillStyle = P.color;
g.fillText(word, W / 2, H / 2);`,
  }), 'kinetic typography lyrics');
  add('hud-readout', 'Data HUD', TXT, 'Sci-fi readouts of the music: levels, bpm, a mini scope', canvas2d({
    desc: 'Data HUD: sci-fi corner readouts of the music',
    P: { color: ['#48ddff', 'Color'], size: [0.022, 0.01, 0.05, 'Size', 'Text'], opacity: [0.85, 0.2, 1, 'Opacity'] },
    draw: `const m = Math.min(W, H);
const s = m * P.size;
g.globalAlpha = P.opacity;
g.strokeStyle = P.color;
g.fillStyle = P.color;
g.lineWidth = Math.max(1, s / 10);
g.font = Math.round(s) + 'px monospace';
g.textBaseline = 'top';
const x = m * 0.04; const y = m * 0.04;
const rows = [['LVL', audio.level], ['BASS', audio.bass], ['MID', audio.mid], ['HIGH', audio.treble]];
rows.forEach(([n, v], i) => {
  g.fillText(n, x, y + i * s * 1.5);
  g.strokeRect(x + s * 3.5, y + i * s * 1.5 + s * 0.15, s * 8, s * 0.7);
  g.fillRect(x + s * 3.5, y + i * s * 1.5 + s * 0.15, s * 8 * Math.min(1, v), s * 0.7);
});
g.fillText('BPM ' + (audio.bpm ? audio.bpm.toFixed(1) : '---') + '  T+' + (audio.time || t).toFixed(2), x, y + s * 6.4);
const w = audio.waveform;
const sx = W - m * 0.04 - s * 12; const sy = y; const sw = s * 12; const shh = s * 5;
g.strokeRect(sx, sy, sw, shh);
g.beginPath();
for (let i = 0; i < 128; i++) { const v = w[i * 16] || 0; const px = sx + (i / 127) * sw; const py = sy + shh / 2 + v * shh / 2; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
g.stroke();`,
  }), 'sci-fi readout interface');
  // ===================== 3D scenes =====================
  const S3 = '3D';
  const LIGHTS = `scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(3, 5, 4);
scene.add(sun);`;
  add('spectrum-city', 'Spectrum city', S3, 'A city of boxes: each row is the spectrum a moment ago, scrolling toward you', scene3d({
    desc: 'Spectrum city: rows of boxes are the spectrum over time, bass on the left',
    P: { height: [4, 0.5, 10, 'Height', 'Shape'], c1: ['#2bd9ff', 'Low'], c2: ['#ff2bd6', 'High'], tilt: [0.5, 0, 1.2, 'Camera tilt', 'Camera'], spin: [0.05, -1, 1, 'Spin', 'Motion'] },
    setup: `${LIGHTS}
const COLS = 32;
const ROWS = 24;
const box = new THREE.BoxGeometry(0.8, 1, 0.8);
box.translate(0, 0.5, 0);
const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 }), COLS * ROWS);
scene.add(mesh);
const hist = new Float32Array(COLS * ROWS);
const dummy = new THREE.Object3D();
const color = new THREE.Color();
const ca = new THREE.Color();
const cb = new THREE.Color();
const edges = Array.from({ length: COLS + 1 }, (_, i) => Math.max(1, Math.round((30 * Math.pow(16000 / 30, i / COLS)) / 23.4)));
camera.position.set(0, 14, 22);`,
    loop: `const s = audio.spectrum;
hist.copyWithin(COLS, 0, COLS * (ROWS - 1));
for (let c = 0; c < COLS; c++) { let m = 0; for (let j = edges[c]; j <= Math.max(edges[c], edges[c + 1] - 1); j++) if (s[j] > m) m = s[j]; hist[c] = m / 255; }
ca.set(P.c1); cb.set(P.c2);
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const i = r * COLS + c;
  dummy.position.set(c - COLS / 2 + 0.5, 0, r - ROWS / 2);
  dummy.scale.set(1, 0.05 + hist[i] * P.height, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
  mesh.setColorAt(i, color.copy(ca).lerp(cb, c / COLS).multiplyScalar(1 - r / ROWS * 0.7));
}
mesh.instanceMatrix.needsUpdate = true;
mesh.instanceColor.needsUpdate = true;
scene.rotation.y = Math.sin(t * P.spin) * 0.6;
camera.position.set(0, 4 + P.tilt * 14, 26 - P.tilt * 6);
camera.lookAt(0, 0, 0);`,
  }), 'equalizer instanced 3d bars');
  add('cube-burst', 'Cube burst', S3, 'Hundreds of cubes on a sphere that burst outward on kicks', scene3d({
    desc: 'Cube burst: cubes on a sphere that fly outward on kicks and pull back',
    P: { count: [600, 50, 3000, 'Cubes', 'Shape', 10], size: [0.12, 0.02, 0.5, 'Cube size', 'Shape'], radius: [2.2, 0.5, 5, 'Radius', 'Shape'], color: ['#ffd75e', 'Color'], spin: [0.3, -2, 2, 'Spin', 'Motion'], ...M(1.2) },
    setup: `${LIGHTS}
const N = Math.round(P.count);
const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: P.color, roughness: 0.3, metalness: 0.5 }), N);
scene.add(mesh);
const dirs = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2; const r = Math.sqrt(1 - y * y); const a = i * 2.39996;
  dirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
}
const dummy = new THREE.Object3D();
let push = 0;`,
    loop: `push = Math.max(push * 0.92, kick * P.punch);
mesh.material.color.set(P.color);
for (let i = 0; i < N; i++) {
  const d = dirs[i];
  const r = P.radius * (1 + push * (0.3 + 0.7 * ((i * 7919) % 100) / 100));
  dummy.position.copy(d).multiplyScalar(r);
  dummy.lookAt(0, 0, 0);
  dummy.scale.setScalar(P.size * (1 + push * 0.5));
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}
mesh.instanceMatrix.needsUpdate = true;
mesh.rotation.y += P.spin * 0.01;
mesh.rotation.x += P.spin * 0.004;`,
  }), 'instanced sphere explode');
  add('particle-galaxy', 'Particle galaxy', S3, 'A spiral galaxy of glowing points that spins with the music', scene3d({
    desc: 'Particle galaxy: spiral arms of points that spin faster when the music is loud',
    P: { count: [30000, 2000, 120000, 'Stars', 'Shape', 1000], arms: [3, 1, 8, 'Arms', 'Shape', 1], spread: [0.35, 0, 1, 'Spread', 'Shape'], inner: ['#ffd9a0', 'Core'], outer: ['#5a7bff', 'Edge'], size: [0.03, 0.005, 0.1, 'Star size'], spin: [0.15, 0, 1, 'Spin', 'Motion'], ...M(0.6) },
    setup: `const N = Math.round(P.count);
const pos = new Float32Array(N * 3);
const col = new Float32Array(N * 3);
const ci = new THREE.Color(P.inner); const co = new THREE.Color(P.outer); const c = new THREE.Color();
for (let i = 0; i < N; i++) {
  const r = Math.pow(Math.random(), 1.5) * 5;
  const arm = (i % Math.round(P.arms)) / Math.round(P.arms) * Math.PI * 2;
  const a = arm + r * 0.9;
  const j = () => (Math.random() - 0.5) * P.spread * r;
  pos[i * 3] = Math.cos(a) * r + j(); pos[i * 3 + 1] = j() * 0.4; pos[i * 3 + 2] = Math.sin(a) * r + j();
  c.copy(ci).lerp(co, r / 5);
  col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
const mat = new THREE.PointsMaterial({ size: P.size, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const points = new THREE.Points(geo, mat);
points.rotation.x = 0.6;
scene.add(points);
camera.position.set(0, 2, 8);`,
    loop: `points.rotation.y += P.spin * 0.01 * (1 + audio.level * 2);
mat.size = P.size * (1 + kick * P.punch * 0.8);`,
  }), 'stars spiral points');
  add('particle-sphere', 'Breathing sphere', S3, 'A sphere of points that breathes with the bass and ripples with noise', scene3d({
    desc: 'Breathing sphere: thousands of points on a sphere, pushed out by the bass',
    P: { count: [8000, 1000, 40000, 'Points', 'Shape', 500], radius: [2, 0.5, 4, 'Radius', 'Shape'], noise: [0.4, 0, 1.5, 'Ripple'], color: ['#48ddff', 'Color'], size: [0.025, 0.005, 0.1, 'Point size'], spin: [0.2, -2, 2, 'Spin', 'Motion'], ...M(1, 'Bass push') },
    setup: `const N = Math.round(P.count);
const base = new Float32Array(N * 3);
const pos = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2; const r = Math.sqrt(1 - y * y); const a = i * 2.39996;
  base[i * 3] = Math.cos(a) * r; base[i * 3 + 1] = y; base[i * 3 + 2] = Math.sin(a) * r;
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const mat = new THREE.PointsMaterial({ color: P.color, size: P.size, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const points = new THREE.Points(geo, mat);
scene.add(points);`,
    loop: `const push = 1 + audio.bass * P.punch * 0.35 + kick * 0.1;
for (let i = 0; i < N; i++) {
  const x = base[i * 3]; const y = base[i * 3 + 1]; const z = base[i * 3 + 2];
  const n = 1 + noise(x * 2 + t * 0.5, y * 2, z * 2) * P.noise * 0.4;
  const r = P.radius * push * n;
  pos[i * 3] = x * r; pos[i * 3 + 1] = y * r; pos[i * 3 + 2] = z * r;
}
geo.attributes.position.needsUpdate = true;
mat.color.set(P.color);
mat.size = P.size;
points.rotation.y += P.spin * 0.01;`,
  }), 'points fibonacci');
  add('particle-fountain', 'Particle fountain', S3, 'Sparks shooting up on every kick and falling back', scene3d({
    desc: 'Particle fountain: sparks burst up on kicks and fall with gravity',
    P: { burst: [400, 20, 2000, 'Sparks per kick', 'Shape', 10], power: [6, 1, 15, 'Power', 'Motion'], gravity: [9, 0, 30, 'Gravity', 'Motion'], color: ['#ff9a3c', 'Color'], size: [0.06, 0.01, 0.2, 'Spark size'], on: ['kick', ['kick', 'snare', 'hit', 'beat', 'bass'], 'Burst on', 'Music'] },
    setup: `const MAX = 20000;
const pos = new Float32Array(MAX * 3);
const vel = new Float32Array(MAX * 3);
const life = new Float32Array(MAX);
let head = 0;
let prev = 0;
let last = 0;
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const mat = new THREE.PointsMaterial({ color: P.color, size: P.size, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
scene.add(new THREE.Points(geo, mat));
for (let i = 0; i < MAX; i++) pos[i * 3 + 1] = -999;
camera.position.set(0, 2, 10);`,
    loop: `const dt = last ? Math.min(0.05, t - last) : 0;
last = t;
const hit = P.on === 'beat' ? audio.beat : audio.trigger(P.on);
if (hit > 0.5 && prev <= 0.5) {
  for (let n = 0; n < P.burst; n++) {
    const i = head; head = (head + 1) % MAX;
    const a = Math.random() * Math.PI * 2; const s = Math.random() * 0.35;
    pos[i * 3] = 0; pos[i * 3 + 1] = -3; pos[i * 3 + 2] = 0;
    vel[i * 3] = Math.cos(a) * s * P.power; vel[i * 3 + 1] = P.power * (0.7 + Math.random() * 0.5); vel[i * 3 + 2] = Math.sin(a) * s * P.power;
    life[i] = 3;
  }
}
prev = hit;
for (let i = 0; i < MAX; i++) {
  if (life[i] <= 0) continue;
  life[i] -= dt;
  vel[i * 3 + 1] -= P.gravity * dt;
  pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
  if (life[i] <= 0) pos[i * 3 + 1] = -999;
}
geo.attributes.position.needsUpdate = true;
mat.color.set(P.color);
mat.size = P.size;`,
  }), 'sparks fireworks');
  add('joy-lines', 'Pulsar lines', S3, 'Stacked waveform lines like a famous album cover', scene3d({
    desc: 'Pulsar lines: stacked lines, each a moment of the spectrum, scrolling back',
    P: { lines: [40, 10, 80, 'Lines', 'Shape', 1], height: [1.6, 0.2, 4, 'Height', 'Shape'], color: ['#ffffff', 'Line'], fill: ['#000000', 'Fill'], tilt: [0.45, 0, 1.2, 'Camera tilt', 'Camera'] },
    setup: `const L = Math.round(P.lines);
const PTS = 96;
const hist = new Float32Array(L * PTS);
const group = new THREE.Group();
scene.add(group);
const rows = [];
const lineMat = new THREE.LineBasicMaterial({ color: P.color });
const fillMat = new THREE.MeshBasicMaterial({ color: P.fill, side: THREE.DoubleSide });
for (let r = 0; r < L; r++) {
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PTS * 3), 3));
  const line = new THREE.Line(lg, lineMat);
  const fg = new THREE.PlaneGeometry(1, 1, PTS - 1, 1);
  const fillMesh = new THREE.Mesh(fg, fillMat);
  group.add(fillMesh, line);
  rows.push({ line, fillMesh });
}
const edges = Array.from({ length: PTS + 1 }, (_, i) => Math.max(1, Math.round((40 * Math.pow(8000 / 40, i / PTS)) / 23.4)));`,
    loop: `const s = audio.spectrum;
hist.copyWithin(PTS, 0, PTS * (L - 1));
for (let i = 0; i < PTS; i++) {
  let m = 0;
  for (let j = edges[i]; j <= Math.max(edges[i], edges[i + 1] - 1); j++) if (s[j] > m) m = s[j];
  const center = 1 - Math.abs(i / (PTS - 1) - 0.5) * 2;
  hist[i] = (m / 255) * Math.pow(center, 1.5);
}
lineMat.color.set(P.color);
fillMat.color.set(P.fill);
for (let r = 0; r < L; r++) {
  const pa = rows[r].line.geometry.attributes.position;
  const fa = rows[r].fillMesh.geometry.attributes.position;
  const z = -r * 0.25;
  for (let i = 0; i < PTS; i++) {
    const x = (i / (PTS - 1) - 0.5) * 8;
    const y = hist[r * PTS + i] * P.height + r * 0.12;
    pa.setXYZ(i, x, y, z);
    fa.setXYZ(i, x, y, z);
    fa.setXYZ(i + PTS, x, r * 0.12 - 0.5, z);
  }
  pa.needsUpdate = true;
  fa.needsUpdate = true;
}
camera.position.set(0, 2 + P.tilt * 6, 7);
camera.lookAt(0, 1.5, -4);`,
  }), 'unknown pleasures waveform');
  add('spectrum-terrain', 'Spectrum terrain', S3, 'A wireframe landscape raised by the spectrum, scrolling toward you', scene3d({
    desc: 'Spectrum terrain: a wireframe landscape built from the spectrum history',
    P: { height: [3, 0.5, 8, 'Height', 'Shape'], color: ['#ff2bd6', 'Wire'], glow: ['#2bd9ff', 'Peaks'], speed: [1, 1, 4, 'Scroll rows per frame', 'Motion', 1] },
    setup: `const SEG = 64;
const geo = new THREE.PlaneGeometry(16, 16, SEG, SEG);
geo.rotateX(-Math.PI / 2);
const colors = new Float32Array((SEG + 1) * (SEG + 1) * 3);
geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ wireframe: true, vertexColors: true }));
scene.add(mesh);
const hist = new Float32Array((SEG + 1) * (SEG + 1));
const ca = new THREE.Color(); const cb = new THREE.Color(); const c = new THREE.Color();
const edges = Array.from({ length: SEG + 2 }, (_, i) => Math.max(1, Math.round((30 * Math.pow(12000 / 30, i / (SEG + 1))) / 23.4)));
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, -2);`,
    loop: `const W1 = SEG + 1;
const s = audio.spectrum;
for (let k = 0; k < Math.round(P.speed); k++) hist.copyWithin(W1, 0, W1 * SEG);
for (let i = 0; i < W1; i++) {
  const mirror = Math.abs(i - SEG / 2) / (SEG / 2);
  const b = Math.floor(mirror * SEG);
  let m = 0;
  for (let j = edges[b]; j <= Math.max(edges[b], edges[b + 1] - 1); j++) if (s[j] > m) m = s[j];
  hist[i] = m / 255;
}
const pa = geo.attributes.position;
ca.set(P.color); cb.set(P.glow);
for (let r = 0; r < W1; r++) for (let i = 0; i < W1; i++) {
  const v = hist[(SEG - r) * W1 + i];
  const idx = r * W1 + i;
  pa.setY(idx, v * P.height);
  c.copy(ca).lerp(cb, v);
  colors[idx * 3] = c.r; colors[idx * 3 + 1] = c.g; colors[idx * 3 + 2] = c.b;
}
pa.needsUpdate = true;
geo.attributes.color.needsUpdate = true;`,
  }), 'landscape wireframe');
  add('ring-tunnel', 'Ring tunnel', S3, 'Glowing rings flying past the camera', scene3d({
    desc: 'Ring tunnel: neon rings flying toward you, faster on kicks',
    P: { rings: [30, 5, 80, 'Rings', 'Shape', 1], speed: [6, 0, 30, 'Speed', 'Motion'], c1: ['#ff2bd6', 'Color 1'], c2: ['#2bd9ff', 'Color 2'], twist: [0.3, -2, 2, 'Twist', 'Motion'], sides: [64, 3, 64, 'Sides', 'Shape', 1], ...M(1.5, 'Kick boost') },
    setup: `const N = Math.round(P.rings);
const geo = new THREE.TorusGeometry(2, 0.03, 6, Math.round(P.sides));
const rings = [];
for (let i = 0; i < N; i++) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i % 2 ? P.c1 : P.c2, transparent: true, blending: THREE.AdditiveBlending }));
  m.position.z = -i * 2;
  scene.add(m);
  rings.push(m);
}
camera.position.z = 2;
let last = 0;`,
    loop: `const dt = last ? Math.min(0.05, t - last) : 0;
last = t;
for (let i = 0; i < N; i++) {
  const m = rings[i];
  m.position.z += P.speed * (1 + kick * P.punch) * dt;
  if (m.position.z > 2) m.position.z -= N * 2;
  m.rotation.z = m.position.z * P.twist * 0.2 + t * 0.2;
  m.material.color.set(i % 2 ? P.c1 : P.c2);
  m.material.opacity = Math.min(1, (m.position.z + N * 2) / (N * 2) * 1.5);
}`,
  }), 'tunnel fly neon');
  add('synth-terrain', 'Wire mountains', S3, 'A wireframe noise landscape flyover (synthwave)', scene3d({
    desc: 'Wire mountains: a neon wireframe landscape you fly over',
    P: { color: ['#ff2bd6', 'Wire'], height: [1.5, 0, 5, 'Mountains', 'Shape'], speed: [2, 0, 10, 'Speed', 'Motion'], valley: [2, 0, 6, 'Valley width', 'Shape'], ...M(0.6, 'Bass lift') },
    setup: `const SEG = 60;
const geo = new THREE.PlaneGeometry(30, 30, SEG, SEG);
geo.rotateX(-Math.PI / 2);
const mat = new THREE.MeshBasicMaterial({ color: P.color, wireframe: true });
const mesh = new THREE.Mesh(geo, mat);
scene.add(mesh);
const base = Float32Array.from(geo.attributes.position.array);
scene.fog = new THREE.Fog(0x000000, 6, 26);
camera.position.set(0, 1.5, 8);
camera.lookAt(0, 0.5, 0);`,
    loop: `const pa = geo.attributes.position;
const off = t * P.speed;
for (let i = 0; i < pa.count; i++) {
  const x = base[i * 3]; const z = base[i * 3 + 2];
  const valley = Math.min(1, Math.max(0, (Math.abs(x) - P.valley) / 4));
  pa.setY(i, (noise(x * 0.25, (z - off) * 0.25) * 0.5 + 0.5) * P.height * 3 * valley * (1 + audio.bass * P.punch));
}
pa.needsUpdate = true;
mat.color.set(P.color);`,
  }), 'synthwave landscape retro');
  add('noise-blob', 'Noise blob', S3, 'A glossy blob deformed by noise, swelling with the bass', scene3d({
    desc: 'Noise blob: a sphere bent by moving noise in a shader, swelling with the bass',
    P: { color: ['#7a5cff', 'Color'], rim: ['#ffd75e', 'Rim light'], amount: [0.35, 0, 1.5, 'Bumps'], scale: [1.5, 0.3, 5, 'Bump size', 'Shape'], speed: [0.5, 0, 3, 'Speed', 'Motion'], ...M(0.8, 'Bass swell') },
    setup: `const uniforms = { uTime: { value: 0 }, uAmount: { value: 0 }, uScale: { value: 1 }, uColor: { value: new THREE.Color() }, uRim: { value: new THREE.Color() } };
const mat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: [
    'uniform float uTime; uniform float uAmount; uniform float uScale; varying vec3 vN; varying vec3 vV;',
    'float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }',
    'float n3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y), mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }',
    'void main() {',
    '  float d = n3(normal * uScale + uTime) * uAmount;',
    '  vec3 p = position + normal * d;',
    '  vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = -mv.xyz;',
    '  gl_Position = projectionMatrix * mv;',
    '}',
  ].join('\\n'),
  fragmentShader: [
    'uniform vec3 uColor; uniform vec3 uRim; varying vec3 vN; varying vec3 vV;',
    'void main() {',
    '  vec3 n = normalize(vN); vec3 v = normalize(vV);',
    '  float diff = max(dot(n, normalize(vec3(0.5, 0.8, 0.6))), 0.0);',
    '  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.5);',
    '  gl_FragColor = vec4(uColor * (0.25 + diff * 0.9) + uRim * fres, 1.0);',
    '}',
  ].join('\\n'),
});
const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 48), mat);
scene.add(blob);`,
    loop: `uniforms.uTime.value = t * P.speed;
uniforms.uAmount.value = P.amount * (1 + audio.bass * P.punch);
uniforms.uScale.value = P.scale;
uniforms.uColor.value.set(P.color);
uniforms.uRim.value.set(P.rim);
blob.scale.setScalar(1 + kick * 0.06);
blob.rotation.y += 0.004;`,
  }), 'shader sphere organic');
  add('knot', 'Chrome knot', S3, 'A shiny torus knot that twists on kicks', scene3d({
    desc: 'Chrome knot: a metallic torus knot spinning, twisting on kicks',
    P: { color: ['#d9e2ff', 'Color'], metal: [0.9, 0, 1, 'Metal'], rough: [0.2, 0, 1, 'Roughness'], spin: [0.5, -3, 3, 'Spin', 'Motion'], p: [2, 1, 9, 'Knot P', 'Shape', 1], q: [3, 1, 9, 'Knot Q', 'Shape', 1], ...M(1) },
    setup: `${LIGHTS}
const rim = new THREE.PointLight(0xff2bd6, 30, 20);
rim.position.set(-4, -2, 3);
scene.add(rim);
const mat = new THREE.MeshStandardMaterial({ color: P.color, metalness: P.metal, roughness: P.rough });
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.4, 0.42, 220, 32, Math.round(P.p), Math.round(P.q)), mat);
scene.add(knot);
let twist = 0;`,
    loop: `twist = Math.max(twist * 0.9, kick * P.punch);
knot.rotation.y += P.spin * 0.01 * (1 + twist * 4);
knot.rotation.x += P.spin * 0.004;
knot.scale.setScalar(1 + twist * 0.08);
mat.color.set(P.color);
mat.metalness = P.metal;
mat.roughness = P.rough;`,
  }), 'metal torus');
  add('orbits', 'Orbits', S3, 'Glowing spheres orbiting a core, each orbit a slice of the spectrum', scene3d({
    desc: 'Orbits: spheres on orbits around a pulsing core; each one follows a band of the spectrum',
    P: { count: [8, 2, 20, 'Planets', 'Shape', 1], core: ['#ffd75e', 'Core'], planet: ['#48ddff', 'Planets'], speed: [0.6, 0, 3, 'Speed', 'Motion'], trails: [true, 'Orbit lines'], ...M(1) },
    setup: `const N = Math.round(P.count);
const coreMat = new THREE.MeshBasicMaterial({ color: P.core });
const core = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 16), coreMat);
scene.add(core);
const pmat = new THREE.MeshBasicMaterial({ color: P.planet });
const planets = [];
const lineMat = new THREE.LineBasicMaterial({ color: P.planet, transparent: true, opacity: 0.25 });
for (let i = 0; i < N; i++) {
  const r = 1.2 + i * 0.35;
  const p = new THREE.Mesh(new THREE.SphereGeometry(0.08 + 0.04 * (i % 3), 16, 8), pmat);
  const orbit = new THREE.Group();
  orbit.rotation.set(Math.sin(i * 1.3) * 0.5, 0, Math.cos(i * 0.7) * 0.4);
  orbit.add(p);
  const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, k) => new THREE.Vector3(Math.cos((k / 96) * Math.PI * 2) * r, 0, Math.sin((k / 96) * Math.PI * 2) * r))), lineMat);
  orbit.add(ring);
  scene.add(orbit);
  planets.push({ p, r, ring, a: Math.random() * 6 });
}
camera.position.set(0, 3, 8);
camera.lookAt(0, 0, 0);
let last = 0;`,
    loop: `const dt = last ? Math.min(0.05, t - last) : 0;
last = t;
core.scale.setScalar(1 + kick * P.punch * 0.25);
coreMat.color.set(P.core);
pmat.color.set(P.planet);
lineMat.color.set(P.planet);
planets.forEach((o, i) => {
  const v = audio.band(40 * Math.pow(2, i), 80 * Math.pow(2, i));
  o.a += dt * P.speed * (0.4 + v * 2) / (1 + i * 0.2);
  o.p.position.set(Math.cos(o.a) * o.r, 0, Math.sin(o.a) * o.r);
  o.p.scale.setScalar(1 + v * 2);
  o.ring.visible = P.trails;
});`,
  }), 'planets solar system');
  add('dna-helix', 'DNA helix', S3, 'A rotating double helix of glowing beads', scene3d({
    desc: 'DNA helix: two strands of beads twisting, rungs flashing on kicks',
    P: { beads: [40, 10, 120, 'Beads', 'Shape', 1], c1: ['#ff2bd6', 'Strand 1'], c2: ['#2bd9ff', 'Strand 2'], spin: [1, -4, 4, 'Spin', 'Motion'], ...M(1) },
    setup: `const N = Math.round(P.beads);
const geo = new THREE.SphereGeometry(0.09, 12, 8);
const m1 = new THREE.MeshBasicMaterial({ color: P.c1 });
const m2 = new THREE.MeshBasicMaterial({ color: P.c2 });
const rungMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
const helix = new THREE.Group();
for (let i = 0; i < N; i++) {
  const y = (i / N - 0.5) * 8;
  const a = i * 0.45;
  const b1 = new THREE.Mesh(geo, m1); b1.position.set(Math.cos(a) * 1.2, y, Math.sin(a) * 1.2);
  const b2 = new THREE.Mesh(geo, m2); b2.position.set(-Math.cos(a) * 1.2, y, -Math.sin(a) * 1.2);
  const rung = new THREE.Line(new THREE.BufferGeometry().setFromPoints([b1.position, b2.position]), rungMat);
  helix.add(b1, b2, rung);
}
helix.rotation.z = 0.4;
scene.add(helix);`,
    loop: `helix.rotation.y += P.spin * 0.01;
m1.color.set(P.c1);
m2.color.set(P.c2);
rungMat.opacity = 0.15 + kick * P.punch * 0.6;
helix.scale.setScalar(1 + kick * P.punch * 0.05);`,
  }), 'science biology');
  add('cube-wave', 'Cube wave', S3, 'A grid of cubes rippling like water from the center', scene3d({
    desc: 'Cube wave: a grid of cubes rising and falling in waves from the center',
    P: { grid: [20, 6, 40, 'Grid size', 'Shape', 1], height: [1.5, 0.2, 5, 'Wave height', 'Shape'], speed: [2, 0, 8, 'Speed', 'Motion'], c1: ['#ffd75e', 'Top'], c2: ['#7a5cff', 'Bottom'], ...M(1) },
    setup: `${LIGHTS}
const G = Math.round(P.grid);
const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 1, 0.4), new THREE.MeshStandardMaterial({ roughness: 0.5 }), G * G);
scene.add(mesh);
const dummy = new THREE.Object3D();
const c = new THREE.Color(); const ca = new THREE.Color(); const cb = new THREE.Color();
camera.position.set(8, 9, 10);
camera.lookAt(0, 0, 0);`,
    loop: `ca.set(P.c1); cb.set(P.c2);
let i = 0;
for (let x = 0; x < G; x++) for (let z = 0; z < G; z++) {
  const px = (x - G / 2) * 0.5; const pz = (z - G / 2) * 0.5;
  const d = Math.hypot(px, pz);
  const h = (Math.sin(d * 1.5 - t * P.speed) * 0.5 + 0.5) * P.height * (1 + kick * P.punch * 0.5) + 0.1;
  dummy.position.set(px, h / 2, pz);
  dummy.scale.set(1, h, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
  mesh.setColorAt(i, c.copy(cb).lerp(ca, h / (P.height * 1.5)));
  i++;
}
mesh.instanceMatrix.needsUpdate = true;
mesh.instanceColor.needsUpdate = true;`,
  }), 'grid ripple instanced');
  add('lissajous', 'Lissajous', S3, 'A glowing 3D Lissajous curve that changes shape on bars', scene3d({
    desc: 'Lissajous: a looping 3D curve whose ratios change on every bar',
    P: { color: ['#48ddff', 'Color'], points: [600, 100, 3000, 'Detail', 'Shape', 10], size: [2.5, 0.5, 4, 'Size', 'Shape'], spin: [0.4, -3, 3, 'Spin', 'Motion'], ...M(0.8) },
    setup: `const N = Math.round(P.points);
const pos = new Float32Array(N * 3);
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const mat = new THREE.LineBasicMaterial({ color: P.color, transparent: true, blending: THREE.AdditiveBlending });
const line = new THREE.LineLoop(geo, mat);
scene.add(line);
const ratios = [[3, 2, 5], [5, 4, 3], [2, 3, 7], [4, 5, 6], [1, 2, 3], [5, 6, 7]];`,
    loop: `const rr = ratios[((audio.bar || 1) - 1) % ratios.length];
const s = P.size * (1 + kick * P.punch * 0.15);
for (let i = 0; i < N; i++) {
  const u = (i / N) * Math.PI * 2;
  pos[i * 3] = Math.sin(rr[0] * u + t * 0.3) * s;
  pos[i * 3 + 1] = Math.sin(rr[1] * u) * s;
  pos[i * 3 + 2] = Math.sin(rr[2] * u + t * 0.2) * s;
}
geo.attributes.position.needsUpdate = true;
mat.color.set(P.color);
line.rotation.y += P.spin * 0.01;`,
  }), 'curve math line');
  add('shape-cycle', 'Shape cycle', S3, 'A neon wireframe shape that becomes a new one every bar', scene3d({
    desc: 'Shape cycle: a wireframe shape that changes on every bar and pumps on kicks',
    P: { color: ['#ff2bd6', 'Color'], size: [1.8, 0.5, 4, 'Size', 'Shape'], spin: [0.6, -3, 3, 'Spin', 'Motion'], every: [1, 1, 8, 'Bars per shape', 'Motion', 1], ...M(1) },
    setup: `const shapes = [new THREE.IcosahedronGeometry(1, 0), new THREE.OctahedronGeometry(1, 0), new THREE.DodecahedronGeometry(1, 0), new THREE.TetrahedronGeometry(1, 0), new THREE.BoxGeometry(1.3, 1.3, 1.3), new THREE.TorusGeometry(0.8, 0.3, 8, 16), new THREE.TorusKnotGeometry(0.7, 0.2, 64, 8)];
const mat = new THREE.MeshBasicMaterial({ color: P.color, wireframe: true });
const mesh = new THREE.Mesh(shapes[0], mat);
scene.add(mesh);`,
    loop: `const idx = Math.floor(((audio.bar || 1) - 1) / Math.round(P.every)) % shapes.length;
if (mesh.geometry !== shapes[idx]) mesh.geometry = shapes[idx];
mat.color.set(P.color);
mesh.scale.setScalar(P.size * (1 + kick * P.punch * 0.2));
mesh.rotation.x += P.spin * 0.007;
mesh.rotation.y += P.spin * 0.01;`,
  }), 'wireframe geometry morph');
  add('box-tunnel', 'Box tunnel', S3, 'Flying through a square tunnel of boxes', scene3d({
    desc: 'Box tunnel: a square tunnel of boxes rushing past',
    P: { speed: [8, 0, 30, 'Speed', 'Motion'], c1: ['#2bd9ff', 'Color 1'], c2: ['#ff6a3d', 'Color 2'], twist: [0.2, -2, 2, 'Twist', 'Motion'], ...M(1.5, 'Kick boost') },
    setup: `${LIGHTS}
const RINGS = 40;
const PER = 16;
const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), new THREE.MeshStandardMaterial({ roughness: 0.4 }), RINGS * PER);
scene.add(mesh);
const dummy = new THREE.Object3D();
const c = new THREE.Color(); const ca = new THREE.Color(); const cb = new THREE.Color();
let z0 = 0;
let last = 0;
scene.fog = new THREE.Fog(0x000000, 10, 60);
camera.position.z = 0;`,
    loop: `const dt = last ? Math.min(0.05, t - last) : 0;
last = t;
z0 = (z0 + P.speed * (1 + kick * P.punch) * dt) % 2;
ca.set(P.c1); cb.set(P.c2);
let i = 0;
for (let r = 0; r < RINGS; r++) {
  const z = -r * 2 + z0;
  for (let k = 0; k < PER; k++) {
    const side = Math.floor(k / 4); const u = (k % 4) / 4 - 0.375;
    const a = side * Math.PI / 2 + z * P.twist * 0.1;
    const x = u * 4; const y = 2;
    dummy.position.set(Math.cos(a) * x - Math.sin(a) * y, Math.sin(a) * x + Math.cos(a) * y, z);
    dummy.rotation.set(0, 0, a);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, c.copy(ca).lerp(cb, (r % 4) / 3));
    i++;
  }
}
mesh.instanceMatrix.needsUpdate = true;
mesh.instanceColor.needsUpdate = true;`,
  }), 'tunnel instanced');
  add('swarm', 'Swarm', S3, 'A flock of little arrows swirling, scattering on kicks', scene3d({
    desc: 'Swarm: a flock swirling around an attractor, scattering on kicks',
    P: { count: [600, 50, 3000, 'Birds', 'Shape', 10], color: ['#e8f4ff', 'Color'], speed: [1, 0, 4, 'Speed', 'Motion'], ...M(1.2, 'Kick scatter') },
    setup: `const N = Math.round(P.count);
const geo = new THREE.ConeGeometry(0.04, 0.16, 4);
geo.rotateX(Math.PI / 2);
const mat = new THREE.MeshBasicMaterial({ color: P.color });
const mesh = new THREE.InstancedMesh(geo, mat, N);
scene.add(mesh);
const pos = new Float32Array(N * 3).map(() => (Math.random() - 0.5) * 6);
const vel = new Float32Array(N * 3).map(() => (Math.random() - 0.5));
const dummy = new THREE.Object3D();
const target = new THREE.Vector3();
let last = 0;`,
    loop: `const dt = last ? Math.min(0.05, t - last) : 0;
last = t;
target.set(Math.sin(t * 0.7) * 2.5, Math.sin(t * 1.1) * 1.5, Math.cos(t * 0.5) * 2);
for (let i = 0; i < N; i++) {
  const k = i * 3;
  let ax = target.x - pos[k]; let ay = target.y - pos[k + 1]; let az = target.z - pos[k + 2];
  const d = Math.hypot(ax, ay, az) + 0.01;
  const push = kick * P.punch * 6 / d;
  ax = ax / d * 2 - ax / d * push; ay = ay / d * 2 - ay / d * push; az = az / d * 2 - az / d * push;
  vel[k] += (ax + Math.sin(i + t) * 0.5) * dt * P.speed;
  vel[k + 1] += ay * dt * P.speed;
  vel[k + 2] += (az + Math.cos(i * 1.3 + t) * 0.5) * dt * P.speed;
  const sp = Math.hypot(vel[k], vel[k + 1], vel[k + 2]);
  const max = 2.5 * P.speed;
  if (sp > max) { vel[k] *= max / sp; vel[k + 1] *= max / sp; vel[k + 2] *= max / sp; }
  pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
  dummy.position.set(pos[k], pos[k + 1], pos[k + 2]);
  dummy.lookAt(pos[k] + vel[k], pos[k + 1] + vel[k + 1], pos[k + 2] + vel[k + 2]);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}
mesh.instanceMatrix.needsUpdate = true;
mat.color.set(P.color);`,
  }), 'flock boids birds');
  add('spectrum-ring-3d', 'Spectrum crown', S3, 'A circle of 3D bars standing up with the spectrum', scene3d({
    desc: 'Spectrum crown: 3D bars in a circle, each one a band of the spectrum',
    P: { bars: [64, 16, 128, 'Bars', 'Shape', 1], radius: [3, 1, 5, 'Radius', 'Shape'], height: [3, 0.5, 8, 'Height', 'Shape'], c1: ['#ffd75e', 'Low'], c2: ['#ff2b5e', 'High'], spin: [0.2, -2, 2, 'Spin', 'Motion'] },
    setup: `${LIGHTS}
const N = Math.round(P.bars);
const box = new THREE.BoxGeometry(0.15, 1, 0.15);
box.translate(0, 0.5, 0);
const mesh = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.4 }), N);
scene.add(mesh);
const dummy = new THREE.Object3D();
const c = new THREE.Color(); const ca = new THREE.Color(); const cb = new THREE.Color();
const vals = new Float32Array(N);
const half = Math.ceil(N / 2);
const edges = Array.from({ length: half + 1 }, (_, i) => Math.max(1, Math.round((30 * Math.pow(16000 / 30, i / half)) / 23.4)));
camera.position.set(0, 5, 8);
camera.lookAt(0, 1, 0);`,
    loop: `const s = audio.spectrum;
ca.set(P.c1); cb.set(P.c2);
for (let i = 0; i < N; i++) {
  const k = i < half ? i : N - 1 - i;
  let m = 0;
  for (let j = edges[k]; j <= Math.max(edges[k], edges[k + 1] - 1); j++) if (s[j] > m) m = s[j];
  vals[i] = Math.max(m / 255, vals[i] * 0.88);
  const a = (i / N) * Math.PI * 2 + t * P.spin;
  dummy.position.set(Math.cos(a) * P.radius, 0, Math.sin(a) * P.radius);
  dummy.rotation.set(0, -a, 0);
  dummy.scale.set(1, 0.05 + vals[i] * P.height, 1);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
  mesh.setColorAt(i, c.copy(ca).lerp(cb, k / half));
}
mesh.instanceMatrix.needsUpdate = true;
mesh.instanceColor.needsUpdate = true;`,
  }), 'circle bars equalizer');
  add('warp-stars-3d', 'Hyperspace', S3, 'Real 3D stars streaming past, jumping to warp on the drop', scene3d({
    desc: 'Hyperspace: stars streaming toward you, much faster on kicks and drops',
    P: { count: [6000, 500, 30000, 'Stars', 'Shape', 100], speed: [20, 0, 100, 'Speed', 'Motion'], color: ['#cfe3ff', 'Color'], size: [0.06, 0.01, 0.3, 'Star size'], ...M(1.5, 'Kick warp') },
    setup: `const N = Math.round(P.count);
const pos = new Float32Array(N * 3);
for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = (Math.random() - 0.5) * 40; pos[i * 3 + 2] = -Math.random() * 100; }
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const mat = new THREE.PointsMaterial({ color: P.color, size: P.size, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
scene.add(new THREE.Points(geo, mat));
camera.position.z = 0;
let last = 0;`,
    loop: `const dt = last ? Math.min(0.05, t - last) : 0;
last = t;
const drop = Number.isFinite(audio.sinceDrop) ? Math.exp(-audio.sinceDrop / 1.5) : 0;
const v = P.speed * (1 + kick * P.punch + drop * 4) * dt;
for (let i = 0; i < N; i++) {
  pos[i * 3 + 2] += v;
  if (pos[i * 3 + 2] > 1) { pos[i * 3 + 2] -= 100; pos[i * 3] = (Math.random() - 0.5) * 40; pos[i * 3 + 1] = (Math.random() - 0.5) * 40; }
}
geo.attributes.position.needsUpdate = true;
mat.color.set(P.color);
mat.size = P.size * (1 + drop);`,
  }), 'stars warp space');
  add('ripple-plane', 'Ripple floor', S3, 'A shiny floor where every kick drops a ripple', scene3d({
    desc: 'Ripple floor: a glossy plane where each kick sends out a ring',
    P: { color: ['#0b3d91', 'Floor'], glow: ['#48ddff', 'Ripple'], height: [0.4, 0, 1.5, 'Ripple height', 'Shape'], speed: [3, 0.5, 10, 'Ripple speed', 'Motion'], ...M(1) },
    setup: `const MAXR = 8;
const uniforms = { uT: { value: 0 }, uHits: { value: new Array(MAXR).fill(-100) }, uH: { value: 0.4 }, uSpeed: { value: 3 }, uColor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() } };
const mat = new THREE.ShaderMaterial({
  uniforms,
  vertexShader: [
    'uniform float uT; uniform float uHits[8]; uniform float uH; uniform float uSpeed; varying float vW; varying vec2 vP;',
    'void main() {',
    '  vec3 p = position; float w = 0.0; float r = length(p.xy);',
    '  for (int i = 0; i < 8; i++) { float age = uT - uHits[i]; if (age < 0.0 || age > 4.0) continue; float d = r - age * uSpeed; w += exp(-d * d * 4.0) * exp(-age * 1.2); }',
    '  p.z += w * uH; vW = w; vP = p.xy;',
    '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
    '}',
  ].join('\\n'),
  fragmentShader: [
    'uniform vec3 uColor; uniform vec3 uGlow; varying float vW; varying vec2 vP;',
    'void main() { float grid = smoothstep(0.96, 1.0, max(abs(fract(vP.x) - 0.5), abs(fract(vP.y) - 0.5)) * 2.0); gl_FragColor = vec4(uColor * 0.6 + uGlow * (vW * 1.5 + grid * 0.25), 1.0); }',
  ].join('\\n'),
});
const plane = new THREE.Mesh(new THREE.PlaneGeometry(30, 30, 160, 160), mat);
plane.rotation.x = -Math.PI / 2.3;
plane.position.y = -1.5;
scene.add(plane);
let head = 0;
let prev = 0;`,
    loop: `const hit = audio.kick;
if (hit > 0.5 && prev <= 0.5) { uniforms.uHits.value[head] = t; head = (head + 1) % MAXR; }
prev = hit;
uniforms.uT.value = t;
uniforms.uH.value = P.height * P.punch;
uniforms.uSpeed.value = P.speed;
uniforms.uColor.value.set(P.color);
uniforms.uGlow.value.set(P.glow);`,
  }), 'water floor shader');
  add('metaballs-3d', 'Metaballs 3D', S3, 'Real 3D metaballs (marching cubes) merging and swelling', scene3d({
    desc: 'Metaballs 3D: blobby balls (marching cubes) that merge and swell with the music',
    P: { balls: [8, 2, 20, 'Balls', 'Shape', 1], color: ['#ff6a3d', 'Color'], strength: [0.5, 0.1, 1.2, 'Ball size', 'Shape'], speed: [0.5, 0, 3, 'Speed', 'Motion'], ...M(1) },
    setup: `import('three/addons/objects/MarchingCubes.js').then(({ MarchingCubes }) => {
  mc = new MarchingCubes(40, new THREE.MeshStandardMaterial({ color: P.color, roughness: 0.25, metalness: 0.3 }), false, false, 30000);
  mc.scale.setScalar(2.6);
  scene.add(mc);
});
let mc = null;
${LIGHTS}`,
    loop: `if (mc) {
  mc.reset();
  const n = Math.round(P.balls);
  const s = P.strength * (1 + kick * P.punch * 0.4) / ((Math.sqrt(n) - 1) / 4 + 1);
  for (let i = 0; i < n; i++) {
    const a = t * P.speed;
    mc.addBall(0.5 + 0.27 * Math.sin(i + 1.26 * a * (1.03 + 0.5 * Math.cos(0.21 * i))), 0.5 + 0.27 * Math.cos(i + 1.12 * a * Math.cos(1.22 + 0.1424 * i)), 0.5 + 0.27 * Math.cos(i + 1.32 * a * 0.1 * Math.sin(0.92 + 0.53 * i)), s, 12);
  }
  mc.update();
  mc.material.color.set(P.color);
  mc.rotation.y = t * 0.2;
}`,
  }), 'marching cubes blobs goo');
  add('mirror-ball', 'Mirror ball', S3, 'A disco ball whose tiles flash to the music', scene3d({
    desc: 'Mirror ball: a spinning disco ball, tiles flashing with the hi-hats',
    P: { color: ['#c9d6ff', 'Tiles'], flash: ['#ffffff', 'Flash'], spin: [0.3, -2, 2, 'Spin', 'Motion'], ...M(1, 'Hi-hat sparkle') },
    setup: `const N = 900;
const tile = new THREE.PlaneGeometry(0.16, 0.16);
const mesh = new THREE.InstancedMesh(tile, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), N);
scene.add(mesh);
const dummy = new THREE.Object3D();
const c = new THREE.Color(); const ca = new THREE.Color(); const cb = new THREE.Color();
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2; const r = Math.sqrt(1 - y * y); const a = i * 2.39996;
  dummy.position.set(Math.cos(a) * r * 2, y * 2, Math.sin(a) * r * 2);
  dummy.lookAt(0, 0, 0);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}
const rnd = new Float32Array(N).map(() => Math.random());`,
    loop: `ca.set(P.color); cb.set(P.flash);
const hats = audio.hats * P.punch;
const step = Math.floor(t * 12);
for (let i = 0; i < N; i++) {
  const sparkle = ((rnd[i] * 997 + step * 0.618) % 1) < 0.04 + hats * 0.25 ? 1 : 0;
  mesh.setColorAt(i, c.copy(ca).multiplyScalar(0.3 + rnd[i] * 0.5).lerp(cb, sparkle));
}
mesh.instanceColor.needsUpdate = true;
mesh.rotation.y += P.spin * 0.01;`,
  }), 'disco club');
  // the starter templates get a category too
  const CATS = { empty: 'Shapes', rings: 'Shapes', particles: 'Shapes' };
  for (const t of ThreeLayers.TEMPLATES) t.cat ||= CATS[t.id] || 'Shapes';
  for (const t of T) if (!ThreeLayers.TEMPLATES.some((x) => x.id === t.id)) ThreeLayers.TEMPLATES.push(t);
})();
