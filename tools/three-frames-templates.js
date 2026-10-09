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
  if (media.frame === lastFrame || media.frame < 0) return false;
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

  const CATS = ThreeLayers.TEMPLATES;
  for (const t of T) if (!CATS.some((x) => x.id === t.id)) CATS.push(t);
})();
