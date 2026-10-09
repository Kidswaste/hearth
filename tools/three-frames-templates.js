// Footage layer templates (round 8, labframes): layers that read the Lab's video footage exactly — the frame the
// decoder presented (media.texture(), updated on requestVideoFrameCallback), its number (media.frame), the cut part
// playing (media.part) — for motion design on footage: fill / fit, a timecode burn-in, frame echoes, animating on
// twos, a time RGB split, motion glow, a flash on every cut, footage in a shape, a delay grid, a slit scan.
// Added to ThreeLayers.TEMPLATES (category "Footage") like the FX pack's, so the Layers ＋ picker, /template and the
// Three Director see them. Each is an ordinary layer: its tweak() values are sliders, keyframes and looks work.
(() => {
  if (typeof ThreeLayers === 'undefined') return;
  // ---------- shared pieces (pasted into each template, so a layer stays one self-contained module) ----------
  const HEAD = `import * as THREE from 'three';

// Footage layer: the Lab's loaded video (load one with 🎵 or drop it on the preview; no song needed).
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
// cover (0) fills the frame, fit (1) shows all of it, stretch (2) ignores its shape
const FIT_GLSL = 'vec2 fitUv(vec2 uv, vec2 res, vec2 vid, float m) { float ra = res.x / res.y; float va = vid.x / max(1.0, vid.y); vec2 s = vec2(1.0); if (m < 0.5) { if (ra > va) s.y = va / ra; else s.x = ra / va; } else if (m < 1.5) { if (ra > va) s.x = ra / va; else s.y = va / ra; } return (uv - 0.5) * s + 0.5; }\\nfloat inside(vec2 uv) { return step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0); }\\n';
const FITS = ['cover', 'fit', 'stretch'];
// shaders write linear light: the last line turns it into the canvas's (or the target's) color space
const OUT = (src) => src.replace(/\}\s*$/, ' gl_FragColor = linearToOutputTexel(gl_FragColor); }');
const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); blank.needsUpdate = true;
const video = () => media.texture() || blank;
const vidSize = (v) => v.set(media.width || 16, media.height || 9);
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
`;
  // a history of the last 16 presented frames in one atlas (4 × 4 tiles): past(k, uv) in GLSL = k frames ago
  const HISTORY = `
const HIST = 16; const COLS = 4;
const tileW = Math.min(960, Math.max(160, Math.round(innerWidth / 2))); const tileH = Math.max(90, Math.round(tileW * innerHeight / innerWidth));
const atlas = new THREE.WebGLRenderTarget(tileW * COLS, tileH * (HIST / COLS));
atlas.texture.colorSpace = THREE.SRGBColorSpace;
const copyU = { uV: { value: blank }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uVid: { value: new THREE.Vector2(16, 9) }, uFit: { value: 0 } };
const copyScene = new THREE.Scene();
copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: copyU, vertexShader: VS,
  fragmentShader: OUT('uniform sampler2D uV; uniform vec2 uRes; uniform vec2 uVid; uniform float uFit; varying vec2 vUv;\\n' + FIT_GLSL + 'void main() { vec2 u = fitUv(vUv, uRes, uVid, uFit); gl_FragColor = texture2D(uV, u) * inside(u); }') })));
let head = 0; let lastFrame = -2; let pushed = 0;
// a new frame on screen goes into the next tile (only when the presented frame changes: a paused video adds nothing)
function pushFrame(fit) {
  // a video that hasn't decoded its picture yet adds nothing (paused, the same frame would never be pushed again)
  if (!media.video || media.video.readyState < 2 || !(video().version > 0)) return false;
  if ((media.frame === lastFrame || media.frame < 0) && pushed > 0) return false;
  lastFrame = media.frame;
  head = (head + 1) % HIST; pushed += 1;
  copyU.uV.value = video(); vidSize(copyU.uVid.value); copyU.uRes.value.set(innerWidth, innerHeight); copyU.uFit.value = fit;
  const col = head % COLS; const row = Math.floor(head / COLS);
  atlas.viewport.set(col * tileW, row * tileH, tileW, tileH); atlas.scissor.set(col * tileW, row * tileH, tileW, tileH); atlas.scissorTest = true;
  renderer.setRenderTarget(atlas); renderer.render(copyScene, camera); renderer.setRenderTarget(null);
  return true;
}
const PAST_GLSL = 'uniform sampler2D uAtlas; uniform float uHead; uniform float uPushed;\\nvec4 past(float k, vec2 uv) { k = min(k, uPushed - 1.0); float i = mod(uHead - max(0.0, k) + 16.0, 16.0); vec2 t = vec2(mod(i, 4.0), floor(i / 4.0)); return texture2D(uAtlas, (t + clamp(uv, 0.0, 1.0)) / 4.0); }\\n';
const histUniforms = () => ({ uAtlas: { value: atlas.texture }, uHead: { value: 0 }, uPushed: { value: 1 } });
const syncHist = (u) => { u.uHead.value = head; u.uPushed.value = Math.max(1, Math.min(HIST, pushed)); };
`;
  const quad = (frag, extra = '') => `const uniforms = { uV: { value: blank }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uVid: { value: new THREE.Vector2(16, 9) }, uTime: { value: 0 }${extra} };
const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, transparent: true,
  fragmentShader: OUT('uniform sampler2D uV; uniform vec2 uRes; uniform vec2 uVid; uniform float uTime; varying vec2 vUv;\\n' + FIT_GLSL + ${frag}) });
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
`;
  const T = [];
  const add = (id, name, desc, code, tags) => T.push({ id, name, cat: 'Footage', desc, tags: `footage video frames ${tags}`, code, pack: 'labframes' });

  add('footage-fill', 'Footage', 'The Lab\'s video, full frame (cover, fit or stretch), with zoom and a quick grade; it shows exactly the frame the timeline is on', `${HEAD}
const P = tweak({
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
  zoom: { value: 1, min: 1, max: 4, label: 'Zoom', group: 'Frame' },
  panX: { value: 0, min: -0.5, max: 0.5, label: 'Pan X', group: 'Frame' },
  panY: { value: 0, min: -0.5, max: 0.5, label: 'Pan Y', group: 'Frame' },
  brightness: { value: 0, min: -0.5, max: 0.5, label: 'Brightness', group: 'Grade' },
  contrast: { value: 1, min: 0, max: 2, label: 'Contrast', group: 'Grade' },
  saturation: { value: 1, min: 0, max: 2, label: 'Saturation', group: 'Grade' },
});
${quad(`'uniform float uFit; uniform float uZoom; uniform vec2 uPan; uniform float uB; uniform float uC; uniform float uS;\\nvoid main() { vec2 u = fitUv((vUv - 0.5) / uZoom + 0.5 - uPan, uRes, uVid, uFit); vec4 c = texture2D(uV, u); vec3 g = (c.rgb - 0.5) * uC + 0.5 + uB; float l = dot(g, vec3(0.299, 0.587, 0.114)); g = mix(vec3(l), g, uS); gl_FragColor = vec4(g, c.a) * inside(u); }'`, ', uFit: { value: 0 }, uZoom: { value: 1 }, uPan: { value: new THREE.Vector2() }, uB: { value: 0 }, uC: { value: 1 }, uS: { value: 1 }')}
renderer.setAnimationLoop(() => {
  uniforms.uV.value = video(); vidSize(uniforms.uVid.value); uniforms.uRes.value.set(innerWidth, innerHeight);
  uniforms.uFit.value = FITS.indexOf(P.fit); uniforms.uZoom.value = P.zoom; uniforms.uPan.value.set(P.panX, P.panY);
  uniforms.uB.value = P.brightness; uniforms.uC.value = P.contrast; uniforms.uS.value = P.saturation;
  renderer.render(scene, camera);
});
`, 'fill cover fit grade');

  add('footage-timecode', 'Timecode burn-in', 'The footage\'s timecode and frame number written over the picture, like a review copy (the exact frame on screen)', `import * as THREE from 'three';

// A timecode burn-in for the Lab's video footage: media.timecode / media.frame are the frame the decoder presented.
const P = tweak({
  show: { value: 'both', options: ['both', 'timecode', 'frame'], label: 'Show', group: 'Text' },
  corner: { value: 'bottom', options: ['bottom', 'top', 'bottom-left', 'bottom-right', 'top-left', 'top-right', 'center'], label: 'Where', group: 'Text' },
  size: { value: 0.05, min: 0.02, max: 0.2, label: 'Size', group: 'Text' },
  color: { value: '#ffffff', label: 'Color', group: 'Text' },
  box: { value: 0.6, min: 0, max: 1, label: 'Box', group: 'Text' },
  prefix: { value: 'TC', label: 'Label', group: 'Text' },
});
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const cv = document.createElement('canvas'); const g = cv.getContext('2d');
const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true })));
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
let drawn = '';
renderer.setAnimationLoop(() => {
  const text = [P.prefix, media.frame < 0 ? 'no footage' : P.show === 'frame' ? \`f\${media.frame}\` : P.show === 'timecode' ? media.timecode : \`\${media.timecode}  f\${media.frame}\`].filter(Boolean).join('  ');
  const key = \`\${text}|\${innerWidth}|\${innerHeight}|\${P.corner}|\${P.size}|\${P.color}|\${P.box}\`;
  if (key !== drawn) {
    drawn = key;
    cv.width = innerWidth; cv.height = innerHeight; g.clearRect(0, 0, cv.width, cv.height);
    const fs = Math.max(10, Math.round(innerHeight * P.size)); g.font = \`600 \${fs}px Consolas, monospace\`;
    const w = g.measureText(text).width + fs; const h = fs * 1.5; const m = fs * 0.8;
    const x = /left/.test(P.corner) ? m : /right/.test(P.corner) ? innerWidth - w - m : (innerWidth - w) / 2;
    const y = /top/.test(P.corner) ? m : P.corner === 'center' ? (innerHeight - h) / 2 : innerHeight - h - m;
    g.fillStyle = \`rgba(0,0,0,\${P.box})\`; g.fillRect(x, y, w, h);
    g.fillStyle = P.color; g.textBaseline = 'middle'; g.fillText(text, x + fs / 2, y + h / 2);
    tex.needsUpdate = true;
  }
  renderer.render(scene, camera);
});
`, 'timecode burn-in counter review');

  add('footage-echo', 'Frame echo', 'Onion skin: the last frames of the footage as fading ghosts behind the current one (every N frames)', `${HEAD}${HISTORY}
const P = tweak({
  ghosts: { value: 4, min: 1, max: 7, step: 1, label: 'Ghosts', group: 'Echo' },
  spacing: { value: 2, min: 1, max: 2, step: 1, label: 'Every N frames', group: 'Echo' },
  decay: { value: 0.6, min: 0.1, max: 0.95, label: 'Fade', group: 'Echo' },
  tint: { value: '#48ddff', label: 'Ghost tint', group: 'Echo' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`PAST_GLSL + 'uniform float uN; uniform float uGap; uniform float uDecay; uniform vec3 uTint;\\nvoid main() { vec4 now = past(0.0, vUv); vec3 acc = vec3(0.0); float w = 1.0; float tot = 0.0; for (int i = 1; i <= 7; i++) { if (float(i) > uN) break; w *= uDecay; vec4 p = past(float(i) * uGap, vUv); acc += p.rgb * w; tot += w; } vec3 ghost = tot > 0.0 ? acc / tot * uTint : vec3(0.0); gl_FragColor = vec4(max(now.rgb, ghost * 0.85), max(now.a, tot > 0.0 ? 0.8 : 0.0)); }'`, ', ...histUniforms(), uN: { value: 4 }, uGap: { value: 2 }, uDecay: { value: 0.6 }, uTint: { value: new THREE.Color() }')}
renderer.setAnimationLoop(() => {
  pushFrame(FITS.indexOf(P.fit)); syncHist(uniforms);
  uniforms.uN.value = P.ghosts; uniforms.uGap.value = P.spacing; uniforms.uDecay.value = P.decay; uniforms.uTint.value.set(P.tint);
  renderer.render(scene, camera);
});
`, 'onion skin ghosts trails');

  add('footage-twos', 'On twos', 'Animate on twos (threes, fours…): the footage holds every frame for N frames, the hand-made stop-motion feel', `${HEAD}${HISTORY}
const P = tweak({
  hold: { value: 2, min: 1, max: 6, step: 1, label: 'Hold (frames)', group: 'Timing' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`PAST_GLSL + 'uniform float uK;\\nvoid main() { gl_FragColor = past(uK, vUv); }'`, ', ...histUniforms(), uK: { value: 0 }')}
renderer.setAnimationLoop(() => {
  pushFrame(FITS.indexOf(P.fit)); syncHist(uniforms);
  // show the frame where (frame number) was last a multiple of hold: k frames back from the newest
  uniforms.uK.value = media.frame >= 0 ? media.frame % Math.max(1, P.hold) : 0;
  renderer.render(scene, camera);
});
`, 'stop motion stutter steps choppy');

  add('footage-time-rgb', 'Time RGB split', 'Red from this frame, green and blue from frames before it: colored edges wherever things move', `${HEAD}${HISTORY}
const P = tweak({
  delay: { value: 2, min: 1, max: 7, step: 1, label: 'Delay (frames)', group: 'Split' },
  amount: { value: 1, min: 0, max: 1, label: 'Amount', group: 'Split' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`PAST_GLSL + 'uniform float uD; uniform float uAmt;\\nvoid main() { vec4 a = past(0.0, vUv); vec4 b = past(uD, vUv); vec4 c = past(uD * 2.0, vUv); vec3 split = vec3(a.r, b.g, c.b); gl_FragColor = vec4(mix(a.rgb, split, uAmt), a.a); }'`, ', ...histUniforms(), uD: { value: 2 }, uAmt: { value: 1 }')}
renderer.setAnimationLoop(() => {
  pushFrame(FITS.indexOf(P.fit)); syncHist(uniforms);
  uniforms.uD.value = P.delay; uniforms.uAmt.value = P.amount;
  renderer.render(scene, camera);
});
`, 'chromatic temporal split');

  add('footage-motion', 'Motion glow', 'What moved since the last frame, as glowing color (over the footage or on its own)', `${HEAD}${HISTORY}
const P = tweak({
  gain: { value: 4, min: 0.5, max: 20, label: 'Sensitivity', group: 'Glow' },
  color: { value: '#ff6a3d', label: 'Color', group: 'Glow' },
  footage: { value: 0.35, min: 0, max: 1, label: 'Footage under it', group: 'Glow' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`PAST_GLSL + 'uniform float uGain; uniform vec3 uCol; uniform float uBase;\\nvoid main() { vec4 a = past(0.0, vUv); vec4 b = past(1.0, vUv); float d = clamp(length(a.rgb - b.rgb) * uGain, 0.0, 1.0); vec3 c = a.rgb * uBase + uCol * d; gl_FragColor = vec4(c, max(a.a * uBase, d)); }'`, ', ...histUniforms(), uGain: { value: 4 }, uCol: { value: new THREE.Color() }, uBase: { value: 0.35 }')}
renderer.setAnimationLoop(() => {
  pushFrame(FITS.indexOf(P.fit)); syncHist(uniforms);
  uniforms.uGain.value = P.gain; uniforms.uCol.value.set(P.color); uniforms.uBase.value = P.footage;
  renderer.render(scene, camera);
});
`, 'difference movement highlight');

  add('footage-cut-flash', 'Flash on cuts', 'A flash of color on every cut of the footage: your Lab cuts (a new part) and jumps in the frames', `import * as THREE from 'three';

// Flashes when the footage cuts: the part playing changes (the Lab's cut list) or the frame number jumps.
const P = tweak({
  color: { value: '#ffffff', label: 'Color', group: 'Flash' },
  frames: { value: 4, min: 1, max: 24, step: 1, label: 'Length (frames)', group: 'Flash' },
  strength: { value: 0.85, min: 0, max: 1, label: 'Strength', group: 'Flash' },
});
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
let lastPart = media.part; let lastFrame = media.frame; let left = 0;
media.onFrame((n) => {
  const jumped = lastFrame >= 0 && n !== lastFrame + 1 && n !== lastFrame && audio.playing;
  if (media.part !== lastPart || jumped) left = P.frames;
  else if (left > 0) left -= 1;
  lastPart = media.part; lastFrame = n;
});
renderer.setAnimationLoop(() => {
  mat.color.set(P.color);
  mat.opacity = left > 0 ? P.strength * (left / Math.max(1, P.frames)) : 0;
  renderer.render(scene, camera);
});
`, 'cut flash transition white');

  add('footage-shape', 'Footage in a shape', 'The footage inside a circle, rounded box, diamond or ring with a border (move and size it with the layer\'s position / scale)', `${HEAD}
const P = tweak({
  shape: { value: 'circle', options: ['circle', 'rounded', 'diamond', 'ring'], label: 'Shape', group: 'Shape' },
  size: { value: 0.7, min: 0.1, max: 1.5, label: 'Size', group: 'Shape' },
  border: { value: 0.012, min: 0, max: 0.08, label: 'Border', group: 'Shape' },
  borderColor: { value: '#ffd75e', label: 'Border color', group: 'Shape' },
  soft: { value: 0.004, min: 0, max: 0.05, label: 'Softness', group: 'Shape' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`'uniform float uShape; uniform float uSize; uniform float uBorder; uniform vec3 uBC; uniform float uSoft; uniform float uFit;\\nfloat sd(vec2 p) { if (uShape < 0.5) return length(p) - uSize * 0.5; if (uShape < 1.5) { vec2 q = abs(p) - vec2(uSize * 0.5 - 0.06); return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.06; } if (uShape < 2.5) return (abs(p.x) + abs(p.y)) - uSize * 0.6; return abs(length(p) - uSize * 0.4) - uSize * 0.12; }\\nvoid main() { float ar = uRes.x / uRes.y; vec2 p = (vUv - 0.5) * vec2(ar, 1.0); float d = sd(p); vec2 u = fitUv(vUv, uRes, uVid, uFit); vec4 c = texture2D(uV, u) * inside(u); float a = 1.0 - smoothstep(-uSoft, uSoft, d); float b = (1.0 - smoothstep(-uSoft, uSoft, d - uBorder)) - a; gl_FragColor = vec4(c.rgb * a + uBC * b, max(a * c.a, b)); }'`, ', uShape: { value: 0 }, uSize: { value: 0.7 }, uBorder: { value: 0.01 }, uBC: { value: new THREE.Color() }, uSoft: { value: 0.004 }, uFit: { value: 0 }')}
const SHAPES = ['circle', 'rounded', 'diamond', 'ring'];
renderer.setAnimationLoop(() => {
  uniforms.uV.value = video(); vidSize(uniforms.uVid.value); uniforms.uRes.value.set(innerWidth, innerHeight);
  uniforms.uShape.value = SHAPES.indexOf(P.shape); uniforms.uSize.value = P.size; uniforms.uBorder.value = P.border; uniforms.uBC.value.set(P.borderColor); uniforms.uSoft.value = P.soft; uniforms.uFit.value = FITS.indexOf(P.fit);
  renderer.render(scene, camera);
});
`, 'mask circle picture in picture round');

  add('footage-delay-grid', 'Delay grid', 'The footage tiled 2 × 2 or 3 × 3, each tile a few frames behind the one before it', `${HEAD}${HISTORY}
const P = tweak({
  tiles: { value: 2, min: 2, max: 3, step: 1, label: 'Tiles a side', group: 'Grid' },
  delay: { value: 2, min: 0, max: 3, step: 1, label: 'Delay per tile (frames)', group: 'Grid' },
  gap: { value: 0.006, min: 0, max: 0.03, label: 'Gap', group: 'Grid' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`PAST_GLSL + 'uniform float uN; uniform float uD; uniform float uGap;\\nvoid main() { vec2 cell = floor(vUv * uN); vec2 f = fract(vUv * uN); float idx = cell.x + (uN - 1.0 - cell.y) * uN; vec2 g = step(vec2(uGap * uN), f) * step(f, vec2(1.0 - uGap * uN)); gl_FragColor = past(idx * uD, f) * g.x * g.y; }'`, ', ...histUniforms(), uN: { value: 2 }, uD: { value: 2 }, uGap: { value: 0.006 }')}
renderer.setAnimationLoop(() => {
  pushFrame(FITS.indexOf(P.fit)); syncHist(uniforms);
  uniforms.uN.value = P.tiles; uniforms.uD.value = Math.min(P.delay, Math.floor(15 / (P.tiles * P.tiles - 1))); uniforms.uGap.value = P.gap;
  renderer.render(scene, camera);
});
`, 'tiles split screen delay');

  add('footage-slit-scan', 'Slit scan', 'Each band of the picture from a different past frame (rows or columns): time smeared across the frame', `${HEAD}${HISTORY}
const P = tweak({
  direction: { value: 'rows', options: ['rows', 'columns'], label: 'Bands', group: 'Scan' },
  depth: { value: 15, min: 2, max: 15, step: 1, label: 'Frames deep', group: 'Scan' },
  smooth: { value: 0, min: 0, max: 1, label: 'Smooth', group: 'Scan' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`PAST_GLSL + 'uniform float uDir; uniform float uDepth; uniform float uSmooth;\\nvoid main() { float x = uDir < 0.5 ? vUv.y : vUv.x; float k = x * uDepth; float k0 = floor(k); vec4 a = past(k0, vUv); vec4 b = past(k0 + 1.0, vUv); gl_FragColor = mix(a, b, fract(k) * uSmooth); }'`, ', ...histUniforms(), uDir: { value: 0 }, uDepth: { value: 15 }, uSmooth: { value: 0 }')}
renderer.setAnimationLoop(() => {
  pushFrame(FITS.indexOf(P.fit)); syncHist(uniforms);
  uniforms.uDir.value = P.direction === 'rows' ? 0 : 1; uniforms.uDepth.value = P.depth; uniforms.uSmooth.value = P.smooth;
  renderer.render(scene, camera);
});
`, 'time displacement smear');

  add('footage-freeze-hit', 'Freeze on hits', 'The footage freezes for a few frames on every kick / hit marker (or every N frames without markers)', `${HEAD}${HISTORY}
const P = tweak({
  on: { value: 'kick', options: ['kick', 'snare', 'hit', 'every'], label: 'Freeze on', group: 'Freeze' },
  hold: { value: 6, min: 1, max: 15, step: 1, label: 'Hold (frames)', group: 'Freeze' },
  every: { value: 24, min: 4, max: 96, step: 1, label: 'Every N frames (no markers)', group: 'Freeze' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`PAST_GLSL + 'uniform float uK;\\nvoid main() { gl_FragColor = past(uK, vUv); }'`, ', ...histUniforms(), uK: { value: 0 }')}
let held = -1; let since = 99;
renderer.setAnimationLoop(() => {
  if (pushFrame(FITS.indexOf(P.fit))) {
    const hit = P.on === 'every' ? media.frame % Math.max(1, P.every) === 0 : audio.trigger(P.on) > 0.9;
    if (hit && since >= P.hold) { held = 0; since = 0; } else { since += 1; if (held >= 0) held += 1; if (held >= P.hold) held = -1; }
  }
  syncHist(uniforms);
  uniforms.uK.value = held >= 0 ? held : 0;
  renderer.render(scene, camera);
});
`, 'freeze stop hold beat');

  // ---------- batch 2: blends, keys, social fill, cut accents ----------
  add('footage-blur-frames', 'Frame blend', 'Motion blur from the footage\'s own frames: this frame blended with the ones before it', `${HEAD}${HISTORY}
const P = tweak({
  frames: { value: 3, min: 1, max: 8, step: 1, label: 'Frames blended', group: 'Blur' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`PAST_GLSL + 'uniform float uN;\\nvoid main() { vec4 acc = past(0.0, vUv); float n = 1.0; for (int i = 1; i <= 7; i++) { if (float(i) >= uN) break; acc += past(float(i), vUv); n += 1.0; } gl_FragColor = acc / n; }'`, ', ...histUniforms(), uN: { value: 3 }')}
renderer.setAnimationLoop(() => {
  pushFrame(FITS.indexOf(P.fit)); syncHist(uniforms);
  uniforms.uN.value = P.frames;
  renderer.render(scene, camera);
});
`, 'motion blur smear average');

  add('footage-strobe', 'Frame strobe', 'Shows one frame in N and leaves the rest dark (or a color): a strobing, flickering footage', `${HEAD}
const P = tweak({
  every: { value: 3, min: 2, max: 12, step: 1, label: 'One frame in', group: 'Strobe' },
  gap: { value: '#000000', label: 'Between', group: 'Strobe' },
  gapAlpha: { value: 1, min: 0, max: 1, label: 'Between opacity', group: 'Strobe' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`'uniform float uOn; uniform vec3 uGap; uniform float uGapA; uniform float uFit;\\nvoid main() { vec2 u = fitUv(vUv, uRes, uVid, uFit); vec4 c = texture2D(uV, u) * inside(u); gl_FragColor = uOn > 0.5 ? c : vec4(uGap, uGapA); }'`, ', uOn: { value: 1 }, uGap: { value: new THREE.Color() }, uGapA: { value: 1 }, uFit: { value: 0 }')}
renderer.setAnimationLoop(() => {
  uniforms.uV.value = video(); vidSize(uniforms.uVid.value); uniforms.uRes.value.set(innerWidth, innerHeight); uniforms.uFit.value = FITS.indexOf(P.fit);
  uniforms.uOn.value = media.frame < 0 || media.frame % Math.max(2, P.every) === 0 ? 1 : 0;
  uniforms.uGap.value.set(P.gap); uniforms.uGapA.value = P.gapAlpha;
  renderer.render(scene, camera);
});
`, 'flicker strobe blink');

  add('footage-then-now', 'Then / now', 'Split screen in time: one side is this frame, the other N frames ago, with a moving divider', `${HEAD}${HISTORY}
const P = tweak({
  delay: { value: 8, min: 1, max: 15, step: 1, label: 'Frames ago', group: 'Split' },
  split: { value: 0.5, min: 0, max: 1, label: 'Divider', group: 'Split' },
  vertical: { value: true, label: 'Side by side', group: 'Split' },
  line: { value: '#ffd75e', label: 'Line color', group: 'Split' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`PAST_GLSL + 'uniform float uD; uniform float uS; uniform float uVert; uniform vec3 uLine;\\nvoid main() { float x = uVert > 0.5 ? vUv.x : vUv.y; vec4 c = x < uS ? past(uD, vUv) : past(0.0, vUv); float l = 1.0 - smoothstep(0.0, 0.003, abs(x - uS)); gl_FragColor = vec4(mix(c.rgb, uLine, l), max(c.a, l)); }'`, ', ...histUniforms(), uD: { value: 8 }, uS: { value: 0.5 }, uVert: { value: 1 }, uLine: { value: new THREE.Color() }')}
renderer.setAnimationLoop(() => {
  pushFrame(FITS.indexOf(P.fit)); syncHist(uniforms);
  uniforms.uD.value = P.delay; uniforms.uS.value = P.split; uniforms.uVert.value = P.vertical ? 1 : 0; uniforms.uLine.value.set(P.line);
  renderer.render(scene, camera);
});
`, 'before after compare split time');

  add('footage-punch-cuts', 'Punch-in on cuts', 'The footage zooms in for a few frames on every cut, then settles (a classic edit accent)', `${HEAD}
const P = tweak({
  amount: { value: 0.12, min: 0, max: 0.6, label: 'Punch', group: 'Punch' },
  frames: { value: 6, min: 1, max: 24, step: 1, label: 'Length (frames)', group: 'Punch' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`'uniform float uZoom; uniform float uFit;\\nvoid main() { vec2 u = fitUv((vUv - 0.5) / uZoom + 0.5, uRes, uVid, uFit); gl_FragColor = texture2D(uV, u) * inside(u); }'`, ', uZoom: { value: 1 }, uFit: { value: 0 }')}
let lastPart = media.part; let lastFrame = media.frame; let left = 0;
media.onFrame((n) => { const jumped = lastFrame >= 0 && n !== lastFrame + 1 && n !== lastFrame && audio.playing; if (media.part !== lastPart || jumped) left = P.frames; else if (left > 0) left -= 1; lastPart = media.part; lastFrame = n; });
renderer.setAnimationLoop(() => {
  uniforms.uV.value = video(); vidSize(uniforms.uVid.value); uniforms.uRes.value.set(innerWidth, innerHeight); uniforms.uFit.value = FITS.indexOf(P.fit);
  const k = left > 0 ? left / Math.max(1, P.frames) : 0;
  uniforms.uZoom.value = 1 + P.amount * k * k;
  renderer.render(scene, camera);
});
`, 'zoom punch cut accent');

  add('footage-shake-cuts', 'Shake on cuts', 'A short camera shake on every cut of the footage', `${HEAD}
const P = tweak({
  amount: { value: 0.03, min: 0, max: 0.15, label: 'Shake', group: 'Shake' },
  frames: { value: 8, min: 1, max: 24, step: 1, label: 'Length (frames)', group: 'Shake' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`'uniform vec2 uOff; uniform float uFit;\\nvoid main() { vec2 u = fitUv((vUv - 0.5) * 0.94 + 0.5 + uOff, uRes, uVid, uFit); gl_FragColor = texture2D(uV, u) * inside(u); }'`, ', uOff: { value: new THREE.Vector2() }, uFit: { value: 0 }')}
let lastPart = media.part; let lastFrame = media.frame; let left = 0;
const rnd = seeded(7);
media.onFrame((n) => { const jumped = lastFrame >= 0 && n !== lastFrame + 1 && n !== lastFrame && audio.playing; if (media.part !== lastPart || jumped) left = P.frames; else if (left > 0) left -= 1; lastPart = media.part; lastFrame = n; });
renderer.setAnimationLoop(() => {
  uniforms.uV.value = video(); vidSize(uniforms.uVid.value); uniforms.uRes.value.set(innerWidth, innerHeight); uniforms.uFit.value = FITS.indexOf(P.fit);
  const k = left > 0 ? left / Math.max(1, P.frames) : 0;
  uniforms.uOff.value.set((rnd() - 0.5) * 2 * P.amount * k, (rnd() - 0.5) * 2 * P.amount * k);
  renderer.render(scene, camera);
});
`, 'camera shake jolt cut');

  add('footage-glitch-cuts', 'Glitch on cuts', 'RGB tearing for a few frames on every cut, clean in between', `${HEAD}
const P = tweak({
  amount: { value: 0.03, min: 0, max: 0.15, label: 'Tear', group: 'Glitch' },
  frames: { value: 5, min: 1, max: 24, step: 1, label: 'Length (frames)', group: 'Glitch' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`'uniform float uAmt; uniform float uFit; uniform float uSeed;\\nfloat h(float x) { return fract(sin(x * 91.7 + uSeed) * 43758.5); }\\nvoid main() { float band = floor(vUv.y * 24.0); float s = (h(band) - 0.5) * uAmt * step(0.6, h(band + 3.0)); vec2 u = fitUv(vUv + vec2(s, 0.0), uRes, uVid, uFit); float r = texture2D(uV, u + vec2(uAmt * 0.5, 0.0)).r; vec4 g = texture2D(uV, u); float b = texture2D(uV, u - vec2(uAmt * 0.5, 0.0)).b; gl_FragColor = vec4(r, g.g, b, g.a) * inside(u); }'`, ', uAmt: { value: 0 }, uFit: { value: 0 }, uSeed: { value: 0 }')}
let lastPart = media.part; let lastFrame = media.frame; let left = 0;
media.onFrame((n) => { const jumped = lastFrame >= 0 && n !== lastFrame + 1 && n !== lastFrame && audio.playing; if (media.part !== lastPart || jumped) left = P.frames; else if (left > 0) left -= 1; lastPart = media.part; lastFrame = n; });
renderer.setAnimationLoop(() => {
  uniforms.uV.value = video(); vidSize(uniforms.uVid.value); uniforms.uRes.value.set(innerWidth, innerHeight); uniforms.uFit.value = FITS.indexOf(P.fit);
  uniforms.uAmt.value = left > 0 ? P.amount * (left / Math.max(1, P.frames)) : 0; uniforms.uSeed.value = media.frame;
  renderer.render(scene, camera);
});
`, 'rgb tear glitch accent');

  add('footage-luma-key', 'Luma key', 'Keeps the bright (or the dark) parts of the footage and lets the layers below show through the rest', `${HEAD}
const P = tweak({
  keep: { value: 'bright', options: ['bright', 'dark'], label: 'Keep', group: 'Key' },
  threshold: { value: 0.5, min: 0, max: 1, label: 'Threshold', group: 'Key' },
  soft: { value: 0.1, min: 0.001, max: 0.5, label: 'Softness', group: 'Key' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`'uniform float uDark; uniform float uT; uniform float uSoft; uniform float uFit;\\nvoid main() { vec2 u = fitUv(vUv, uRes, uVid, uFit); vec4 c = texture2D(uV, u) * inside(u); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); float a = smoothstep(uT - uSoft, uT + uSoft, l); if (uDark > 0.5) a = 1.0 - a; gl_FragColor = vec4(c.rgb, c.a * a); }'`, ', uDark: { value: 0 }, uT: { value: 0.5 }, uSoft: { value: 0.1 }, uFit: { value: 0 }')}
renderer.setAnimationLoop(() => {
  uniforms.uV.value = video(); vidSize(uniforms.uVid.value); uniforms.uRes.value.set(innerWidth, innerHeight); uniforms.uFit.value = FITS.indexOf(P.fit);
  uniforms.uDark.value = P.keep === 'dark' ? 1 : 0; uniforms.uT.value = P.threshold; uniforms.uSoft.value = P.soft;
  renderer.render(scene, camera);
});
`, 'key transparent bright dark');

  add('footage-chroma-key', 'Green screen', 'Removes a color (green by default) from the footage so the sketch shows behind it', `${HEAD}
const P = tweak({
  key: { value: '#00ff00', label: 'Key color', group: 'Key' },
  tolerance: { value: 0.35, min: 0.01, max: 1, label: 'Tolerance', group: 'Key' },
  soft: { value: 0.1, min: 0.001, max: 0.5, label: 'Softness', group: 'Key' },
  spill: { value: 0.5, min: 0, max: 1, label: 'Spill removal', group: 'Key' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`'uniform vec3 uKey; uniform float uTol; uniform float uSoft; uniform float uSpill; uniform float uFit;\\nvec2 cbcr(vec3 c) { return vec2(dot(c, vec3(-0.169, -0.331, 0.5)), dot(c, vec3(0.5, -0.419, -0.081))); }\\nvoid main() { vec2 u = fitUv(vUv, uRes, uVid, uFit); vec4 c = texture2D(uV, u) * inside(u); float d = distance(cbcr(c.rgb), cbcr(uKey)); float a = smoothstep(uTol * 0.5, uTol * 0.5 + uSoft, d); vec3 col = c.rgb; float g = max(col.g - max(col.r, col.b), 0.0); col.g -= g * uSpill; gl_FragColor = vec4(col, c.a * a); }'`, ', uKey: { value: new THREE.Color() }, uTol: { value: 0.35 }, uSoft: { value: 0.1 }, uSpill: { value: 0.5 }, uFit: { value: 0 }')}
renderer.setAnimationLoop(() => {
  uniforms.uV.value = video(); vidSize(uniforms.uVid.value); uniforms.uRes.value.set(innerWidth, innerHeight); uniforms.uFit.value = FITS.indexOf(P.fit);
  uniforms.uKey.value.set(P.key); uniforms.uTol.value = P.tolerance; uniforms.uSoft.value = P.soft; uniforms.uSpill.value = P.spill;
  renderer.render(scene, camera);
});
`, 'chroma key green screen blue screen');

  add('footage-blur-fill', 'Fit on a blurred fill', 'The whole footage fitted in the frame over a blurred, zoomed copy of itself (the social 9:16 reframe)', `${HEAD}
const P = tweak({
  blur: { value: 0.02, min: 0, max: 0.06, label: 'Blur', group: 'Fill' },
  dim: { value: 0.55, min: 0, max: 1, label: 'Fill brightness', group: 'Fill' },
  size: { value: 1, min: 0.5, max: 1, label: 'Picture size', group: 'Picture' },
});
${quad(`'uniform float uBlur; uniform float uDim; uniform float uSize;\\nvoid main() { vec2 cu = fitUv(vUv, uRes, uVid, 0.0); vec3 acc = vec3(0.0); for (int i = 0; i < 12; i++) { float a = float(i) * 0.5236; vec2 o = vec2(cos(a), sin(a)) * uBlur * (0.5 + mod(float(i), 3.0) * 0.5); acc += texture2D(uV, cu + o).rgb; } vec3 bg = acc / 12.0 * uDim; vec2 fu = fitUv((vUv - 0.5) / uSize + 0.5, uRes, uVid, 1.0); vec4 fg = texture2D(uV, fu); float m = inside(fu); gl_FragColor = vec4(mix(bg, fg.rgb, m), 1.0); }'`, ', uBlur: { value: 0.02 }, uDim: { value: 0.55 }, uSize: { value: 1 }')}
renderer.setAnimationLoop(() => {
  uniforms.uV.value = video(); vidSize(uniforms.uVid.value); uniforms.uRes.value.set(innerWidth, innerHeight);
  uniforms.uBlur.value = P.blur; uniforms.uDim.value = P.dim; uniforms.uSize.value = P.size;
  renderer.render(scene, camera);
});
`, 'reframe vertical social 9:16 blur background');

  add('footage-frame-wall', 'Frame wall', 'The last 16 frames as a 4 × 4 wall, newest top left: the motion laid out', `${HEAD}${HISTORY}
const P = tweak({
  gap: { value: 0.004, min: 0, max: 0.02, label: 'Gap', group: 'Wall' },
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Frame' },
});
${quad(`PAST_GLSL + 'uniform float uGap;\\nvoid main() { vec2 cell = floor(vUv * 4.0); vec2 f = fract(vUv * 4.0); float idx = cell.x + (3.0 - cell.y) * 4.0; vec2 g = step(vec2(uGap * 4.0), f) * step(f, vec2(1.0 - uGap * 4.0)); gl_FragColor = past(idx, f) * g.x * g.y; }'`, ', ...histUniforms(), uGap: { value: 0.004 }')}
renderer.setAnimationLoop(() => {
  pushFrame(FITS.indexOf(P.fit)); syncHist(uniforms);
  uniforms.uGap.value = P.gap;
  renderer.render(scene, camera);
});
`, 'grid contact sheet wall');

  const CATS = ThreeLayers.TEMPLATES;
  for (const t of T) if (!CATS.some((x) => x.id === t.id)) CATS.push(t);
})();
