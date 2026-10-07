// Layers for Three.js Lab sketches: a Photoshop-style list (select, show/hide, reorder, add, duplicate,
// delete, rename) and the selected layer's settings (opacity, blend mode, fades, position/scale/rotation
// and when it plays). Each layer is its own sketch module; the Lab stacks them in the preview.
const ThreeLayers = (() => {
  const COLORS = ['#ffd75e', '#48ddff', '#bd8bff', '#ff6a6a', '#7cd992', '#ff8c42', '#7ad0ff', '#f5a3d0'];
  const BLENDS = [['normal', 'Normal'], ['add', 'Add (glow)'], ['screen', 'Screen'], ['lighten', 'Lighten'], ['overlay', 'Overlay'], ['soft-light', 'Soft light'], ['multiply', 'Multiply'], ['darken', 'Darken'], ['difference', 'Difference'], ['exclusion', 'Exclusion'], ['color-dodge', 'Color dodge']];
  // ---------- keyframes ----------
  // keys = [{ t: seconds, v: number | '#rrggbb', ease: 'linear' | 'ease' | 'hold' }], sorted by t;
  // `ease` shapes the move from that key to the next one.
  const ANIM = ['opacity', 'x', 'y', 'scale', 'rotate'];
  const KEY_EPS = 1 / 60;
  const mixColor = (a, b, u) => {
    const pa = parseInt(a.slice(1), 16); const pb = parseInt(b.slice(1), 16);
    const ch = (sh) => Math.round(((pa >> sh) & 255) + ((((pb >> sh) & 255) - ((pa >> sh) & 255)) * u));
    return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
  };
  function evalKeys(keys, t, base) {
    if (!keys?.length || t == null) return base;
    if (t <= keys[0].t) return keys[0].v;
    const last = keys[keys.length - 1];
    if (t >= last.t) return last.v;
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1].t) i += 1;
    const a = keys[i]; const b = keys[i + 1];
    if (a.ease === 'hold') return a.v;
    let u = (t - a.t) / (b.t - a.t || 1);
    if (a.ease === 'ease') u = u * u * (3 - 2 * u);
  // 'curve' (FL Studio-style tension): c in -1..1 bends the move toward the start or the end
  else if (a.ease === 'curve' && a.c) u = a.c > 0 ? Math.pow(u, 1 + a.c * 4) : 1 - Math.pow(1 - u, 1 - a.c * 4);
    if (typeof a.v === 'string' && typeof b.v === 'string') return mixColor(a.v, b.v, u);
    if (typeof a.v === 'boolean') return a.v;
    return a.v + (b.v - a.v) * u;
  }
  function upsertKey(keys = [], t, v, ease) {
    const r = Math.round(t * 1000) / 1000;
    const at = keys.findIndex((k) => Math.abs(k.t - r) < KEY_EPS);
    const next = [...keys];
    if (at >= 0) next[at] = { ...next[at], v, ...(ease ? { ease } : {}) };
    else next.push({ t: r, v, ease: ease || 'ease' });
    return next.sort((a, b) => a.t - b.t);
  }
  const keyAt = (keys, t) => keys?.find((k) => Math.abs(k.t - t) < KEY_EPS) || null;
  const newId = () => `l${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const defaults = (o = {}) => ({ id: newId(), name: 'Layer', code: '', visible: true, opacity: 1, blend: 'normal', in: null, out: null, fadeIn: 0, fadeOut: 0, x: 0, y: 0, scale: 1, rotate: 0, ...o });

  const HEAD = `import * as THREE from 'three';

// A transparent layer: what it draws sits on top of the layers below (no scene.background here).
`;
  const BODY = `const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 7;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
`;
  const TEMPLATES = [
    {
      id: 'empty', name: 'Shape', desc: 'One wireframe shape that pumps on kicks: a starting point to describe what you want',
      code: `${HEAD}const P = tweak({
  color: { value: '#ffd75e', label: 'Color', group: 'Look' },
  size: { value: 1, min: 0.1, max: 4, label: 'Size', group: 'Look' },
  spin: { value: 0.5, min: -3, max: 3, label: 'Spin', group: 'Motion' },
  punch: { value: 0.6, min: 0, max: 2, label: 'Kick punch', group: 'Music', hint: 'How much it grows on your kick markers (or on beats if none are marked)' },
});

${BODY}
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: P.color, wireframe: true }));
scene.add(mesh);

let pump = 0;
renderer.setAnimationLoop((now) => {
  const hit = audio.hits.kick.length ? audio.kick : audio.beat;
  pump = Math.max(pump * 0.88, hit);
  mesh.material.color.set(P.color);
  mesh.scale.setScalar(P.size * (1 + pump * P.punch * 0.4));
  mesh.rotation.y += P.spin * 0.01;
  mesh.rotation.x += P.spin * 0.004;
  renderer.render(scene, camera);
});
`,
    },
    {
      id: 'rings', name: 'Pulse rings', desc: 'Glowing rings that swell on kicks',
      code: `${HEAD}const P = tweak({
  rings: { value: 6, min: 1, max: 24, step: 1, label: 'Rings', group: 'Shape' },
  size: { value: 1, min: 0.2, max: 3, label: 'Size', group: 'Shape' },
  thickness: { value: 0.025, min: 0.005, max: 0.15, label: 'Thickness', group: 'Shape' },
  color: { value: '#48ddff', label: 'Color', group: 'Color' },
  spin: { value: 0.2, min: -2, max: 2, label: 'Spin', group: 'Motion' },
  punch: { value: 0.8, min: 0, max: 2, label: 'Kick punch', group: 'Music', hint: 'How much the rings grow on kicks (or beats)' },
});

${BODY}
const mat = new THREE.MeshBasicMaterial({ color: P.color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
const group = new THREE.Group();
scene.add(group);
for (let i = 0; i < P.rings; i++) group.add(new THREE.Mesh(new THREE.TorusGeometry(1 + i * 0.35, P.thickness, 8, 160), mat));

let pump = 0;
renderer.setAnimationLoop(() => {
  const hit = audio.hits.kick.length ? audio.kick : audio.beat;
  pump = Math.max(pump * 0.9, hit);
  mat.color.set(P.color);
  group.scale.setScalar(P.size * (1 + pump * P.punch * 0.25));
  group.rotation.z += P.spin * 0.01;
  renderer.render(scene, camera);
});
`,
    },
    {
      id: 'particles', name: 'Particle field', desc: 'A cloud of drifting dots that flashes on snares',
      code: `${HEAD}const P = tweak({
  count: { value: 4000, min: 500, max: 20000, step: 100, label: 'Particles', group: 'Shape' },
  spread: { value: 6, min: 1, max: 15, label: 'Spread', group: 'Shape' },
  size: { value: 0.05, min: 0.005, max: 0.25, label: 'Dot size', group: 'Look' },
  color: { value: '#bd8bff', label: 'Color', group: 'Color' },
  drift: { value: 0.15, min: 0, max: 1, label: 'Drift speed', group: 'Motion' },
  flash: { value: 0.8, min: 0, max: 2, label: 'Snare flash', group: 'Music', hint: 'Brightness burst on snares (or beats)' },
});

${BODY}
const positions = new Float32Array(P.count * 3);
for (let i = 0; i < P.count; i++) {
  const r = P.spread * Math.cbrt(Math.random());
  const t = Math.random() * Math.PI * 2;
  const u = Math.acos(2 * Math.random() - 1);
  positions.set([r * Math.sin(u) * Math.cos(t), r * Math.sin(u) * Math.sin(t), r * Math.cos(u)], i * 3);
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
const mat = new THREE.PointsMaterial({ color: P.color, size: P.size, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
const points = new THREE.Points(geo, mat);
scene.add(points);

let glow = 0;
renderer.setAnimationLoop(() => {
  const hit = audio.hits.snare.length ? audio.snare : audio.beat;
  glow = Math.max(glow * 0.9, hit);
  mat.color.set(P.color);
  mat.size = P.size * (1 + glow * P.flash * 0.6);
  mat.opacity = Math.min(1, 0.55 + glow * P.flash * 0.45);
  points.rotation.y += P.drift * 0.004;
  points.rotation.x += P.drift * 0.0015;
  renderer.render(scene, camera);
});
`,
    },
  ];



  // What the layer settings can do over time (automation lanes and keyframes).
  const ANIM_META = {
    opacity: { label: 'Opacity', min: 0, max: 1, step: 0.01, def: 1 },
    x: { label: 'Move X', min: -100, max: 100, step: 0.5, def: 0 },
    y: { label: 'Move Y', min: -100, max: 100, step: 0.5, def: 0 },
    scale: { label: 'Scale', min: 0.1, max: 3, step: 0.01, def: 1 },
    rotate: { label: 'Rotate', min: -180, max: 180, step: 0.5, def: 0 },
  };
  // One-click animations: each returns { prop: keys } for the range ctx.a..ctx.b (the layer's time, the loop
  // or the whole song). ctx: { a, b, beat, bar, beats, kicks, snares, base(prop) }.
  const k = (t, v, ease = 'ease', c) => ({ t: Math.round(t * 1000) / 1000, v, ease, ...(c != null ? { c } : {}) });
  const PRESETS = [
    { id: 'fadeIn', name: 'Fade in', desc: 'Over one bar from the start', make: (c) => ({ opacity: [k(c.a, 0), k(c.a + c.bar, c.base('opacity'))] }) },
    { id: 'fadeOut', name: 'Fade out', desc: 'Over the last bar', make: (c) => ({ opacity: [k(c.b - c.bar, c.base('opacity')), k(c.b, 0)] }) },
    { id: 'popIn', name: 'Pop in', desc: 'Grows in with a little overshoot', make: (c) => ({ scale: [k(c.a, c.base('scale') * 0.4, 'curve', -0.6), k(c.a + c.beat * 0.6, c.base('scale') * 1.08), k(c.a + c.beat * 1.2, c.base('scale'))], opacity: [k(c.a, 0, 'linear'), k(c.a + c.beat * 0.4, c.base('opacity'))] }) },
    { id: 'slideLeft', name: 'Slide in from the left', desc: 'Over one bar', make: (c) => ({ x: [k(c.a, -100, 'curve', -0.7), k(c.a + c.bar, c.base('x'))] }) },
    { id: 'slideRight', name: 'Slide in from the right', desc: 'Over one bar', make: (c) => ({ x: [k(c.a, 100, 'curve', -0.7), k(c.a + c.bar, c.base('x'))] }) },
    { id: 'slideUp', name: 'Slide up from below', desc: 'Over one bar', make: (c) => ({ y: [k(c.a, 100, 'curve', -0.7), k(c.a + c.bar, c.base('y'))] }) },
    { id: 'slideDown', name: 'Drop in from above', desc: 'Over one bar', make: (c) => ({ y: [k(c.a, -100, 'curve', -0.7), k(c.a + c.bar, c.base('y'))] }) },
    { id: 'zoom', name: 'Zoom through', desc: 'Slowly grows over the whole range', make: (c) => ({ scale: [k(c.a, c.base('scale'), 'linear'), k(c.b, c.base('scale') * 1.6)] }) },
    { id: 'spin', name: 'Spin', desc: 'One turn over the range', make: (c) => ({ rotate: [k(c.a, 0, 'linear'), k(c.b, 360)] }) },
    { id: 'pulse', name: 'Pulse on beats', desc: 'A small bump on every beat', make: (c) => ({ scale: c.beats.flatMap((t) => [k(t, c.base('scale') * 1.1, 'curve', 0.6), k(t + c.beat * 0.6, c.base('scale'))]) }) },
    { id: 'shake', name: 'Shake on kicks', desc: 'A jolt on each kick marker (or beat)', make: (c) => ({ x: (c.kicks.length ? c.kicks : c.beats).flatMap((t) => [k(t, c.base('x') + 3, 'linear'), k(t + 0.04, c.base('x') - 2, 'linear'), k(t + 0.1, c.base('x'))]) }) },
    { id: 'blink', name: 'Blink on snares', desc: 'Dips on each snare marker (or every other beat)', make: (c) => ({ opacity: (c.snares.length ? c.snares : c.beats.filter((_, i) => i % 2)).flatMap((t) => [k(t, c.base('opacity') * 0.15, 'curve', 0.5), k(t + c.beat * 0.5, c.base('opacity'))]) }) },
  ];

  // Filter layers: they change everything below them (like adjustment layers). The settings are sliders.
  const fx = (type, what, spec) => `// Filter layer: ${what}
// It changes everything below it. Its settings are the sliders; the layer's opacity mixes it with the original,
// and its bar on the timeline sets when it's on.
const P = tweak({
${spec}
});
filter('${type}', P);
`;
  const FILTERS = [
    { id: 'ascii', name: 'ASCII', desc: 'Turns the picture into text characters', code: fx('ascii', 'ASCII art', `  cell: { value: 10, min: 4, max: 40, step: 1, label: 'Character size', group: 'ASCII' },
  contrast: { value: 1.3, min: 0.5, max: 3, label: 'Contrast', group: 'ASCII' },
  colors: { value: 'source', options: ['source', 'white', 'green', 'amber'], label: 'Colors', group: 'ASCII' },
  tint: { value: '#ffffff', label: 'Tint', group: 'ASCII' },
  background: { value: 0, min: 0, max: 0.6, label: 'Picture behind', group: 'ASCII', hint: 'How much of the original shows behind the characters' },`) },
    { id: 'datamosh', name: 'Datamosh', desc: 'Smeared, blocky trails of earlier frames, bursting on hits', code: fx('datamosh', 'datamosh (frames melting into each other)', `  amount: { value: 0.5, min: 0, max: 1, label: 'Mosh amount', group: 'Datamosh' },
  block: { value: 24, min: 4, max: 96, step: 1, label: 'Block size', group: 'Datamosh' },
  smear: { value: 0.6, min: 0, max: 2, label: 'Smear', group: 'Datamosh', hint: 'How far moshed blocks slide' },
  persist: { value: 0.92, min: 0, max: 0.99, label: 'Trail length', group: 'Datamosh' },
  onHits: { value: true, label: 'Burst on hits', group: 'Music', hint: 'Mosh harder on your kick and snare markers (or the beat)' },`) },
    { id: 'vhs', name: 'Found footage', desc: 'VHS tape: jitter, tracking bands, grain, color fringes, REC timecode', code: fx('vhs', 'found footage / VHS camcorder', `  grain: { value: 0.35, min: 0, max: 1, label: 'Grain', group: 'Tape' },
  aberration: { value: 0.4, min: 0, max: 1, label: 'Color fringes', group: 'Tape' },
  jitter: { value: 0.3, min: 0, max: 1, label: 'Jitter', group: 'Tape' },
  tracking: { value: 0.35, min: 0, max: 1, label: 'Tracking bands', group: 'Tape' },
  vignette: { value: 0.5, min: 0, max: 1, label: 'Dark corners', group: 'Look' },
  fade: { value: 0.35, min: 0, max: 1, label: 'Washed out', group: 'Look' },`) },
    { id: 'glitch', name: 'Glitch', desc: 'RGB split and torn slices on hits', code: fx('glitch', 'digital glitch', `  amount: { value: 0.6, min: 0, max: 1, label: 'Glitch amount', group: 'Glitch' },
  split: { value: 0.5, min: 0, max: 2, label: 'RGB split', group: 'Glitch' },
  slices: { value: 24, min: 2, max: 120, step: 1, label: 'Slices', group: 'Glitch' },
  onHits: { value: true, label: 'Glitch on hits', group: 'Music', hint: 'Fire on your kick / snare / hit markers (or the beat)' },`) },
    { id: 'crt', name: 'CRT', desc: 'Old TV: curved screen, scanlines, phosphor dots', code: fx('crt', 'old CRT television', `  curve: { value: 0.5, min: 0, max: 1.5, label: 'Screen curve', group: 'CRT' },
  scanlines: { value: 0.6, min: 0, max: 1, label: 'Scanlines', group: 'CRT' },
  mask: { value: 0.4, min: 0, max: 1, label: 'Phosphor dots', group: 'CRT' },
  glow: { value: 0.3, min: 0, max: 1.5, label: 'Glow', group: 'CRT' },`) },
    { id: 'pixelate', name: 'Pixelate', desc: 'Chunky pixels with fewer colors', code: fx('pixelate', 'pixel art', `  size: { value: 8, min: 1, max: 64, step: 1, label: 'Pixel size', group: 'Pixels' },
  levels: { value: 0, min: 0, max: 16, step: 1, label: 'Colors (0 = all)', group: 'Pixels' },
  punch: { value: 0.5, min: 0, max: 2, label: 'Kick punch', group: 'Music', hint: 'Pixels get bigger on kicks' },`) },
    { id: 'halftone', name: 'Halftone', desc: 'Printed dots, like a comic or newspaper', code: fx('halftone', 'halftone print', `  dot: { value: 10, min: 3, max: 40, label: 'Dot size', group: 'Halftone' },
  angle: { value: 25, min: 0, max: 90, label: 'Angle', group: 'Halftone' },
  colors: { value: 'source', options: ['source', 'ink'], label: 'Colors', group: 'Halftone' },
  ink: { value: '#111111', label: 'Ink', group: 'Halftone' },
  paper: { value: '#f4efe6', label: 'Paper', group: 'Halftone' },`) },
    { id: 'film', name: 'Film', desc: 'Grain, vignette, warmth and a little flicker', code: fx('film', 'analog film', `  grain: { value: 0.3, min: 0, max: 1, label: 'Grain', group: 'Film' },
  vignette: { value: 0.5, min: 0, max: 1, label: 'Dark corners', group: 'Film' },
  warmth: { value: 0.4, min: -1, max: 1, label: 'Warmth', group: 'Film' },
  contrast: { value: 1.1, min: 0.5, max: 2, label: 'Contrast', group: 'Film' },
  flicker: { value: 0.3, min: 0, max: 1, label: 'Flicker', group: 'Film' },`) },
    { id: 'kaleido', name: 'Kaleidoscope', desc: 'Mirrored segments around the center', code: fx('kaleido', 'kaleidoscope', `  segments: { value: 6, min: 2, max: 16, step: 1, label: 'Segments', group: 'Kaleidoscope' },
  spin: { value: 0.1, min: -2, max: 2, label: 'Spin', group: 'Kaleidoscope' },
  zoom: { value: 1, min: 0.3, max: 3, label: 'Zoom', group: 'Kaleidoscope' },`) },
    { id: 'edges', name: 'Edge glow', desc: 'Neon outlines of everything below', code: fx('edges', 'neon edges', `  strength: { value: 2, min: 0, max: 6, label: 'Edge strength', group: 'Edges' },
  glow: { value: '#48ddff', label: 'Edge color', group: 'Edges' },
  keep: { value: 0.25, min: 0, max: 1, label: 'Original picture', group: 'Edges' },
  punch: { value: 0.6, min: 0, max: 2, label: 'Kick punch', group: 'Music' },`) },
    { id: 'thermal', name: 'Thermal', desc: 'Heat-camera colors', code: fx('thermal', 'thermal camera', `  mix: { value: 1, min: 0, max: 1, label: 'Amount', group: 'Thermal' },
  contrast: { value: 1.2, min: 0.5, max: 3, label: 'Contrast', group: 'Thermal' },`) },
    { id: 'duotone', name: 'Duotone', desc: 'Two colors: one for shadows, one for highlights', code: fx('duotone', 'duotone', `  shadows: { value: '#1b0f3b', label: 'Shadows', group: 'Duotone' },
  highlights: { value: '#ffb86b', label: 'Highlights', group: 'Duotone' },
  contrast: { value: 1.1, min: 0.5, max: 3, label: 'Contrast', group: 'Duotone' },
  mix: { value: 1, min: 0, max: 1, label: 'Amount', group: 'Duotone' },`) },
    { id: 'glow', name: 'Glow', desc: 'Soft bloom around bright parts', code: fx('glow', 'glow / bloom', `  strength: { value: 0.8, min: 0, max: 3, label: 'Glow strength', group: 'Glow' },
  radius: { value: 1, min: 0.2, max: 4, label: 'Glow size', group: 'Glow' },
  threshold: { value: 0.55, min: 0, max: 1, label: 'Only above brightness', group: 'Glow' },
  punch: { value: 0.5, min: 0, max: 2, label: 'Kick punch', group: 'Music' },`) },
  ];
  const isFilter = (code) => /\bfilter\(\s*['"]/.test(code || '');

  // onSelect(id), onChange(id, props, { live }), onAdd(templateId | 'copy' | 'ask'), onRemove(id),
  // onReorder(idsBottomFirst), now() → playhead seconds, duration() → song length, loop() → { a, b } | null.
  // keyState(id, prop) → 'none' | 'animated' | 'on'; toggleKey(id, prop, value); valueAt(L, prop) → shown value.
  function panel({ onSelect, onChange, onAdd, onRemove, onReorder, now, duration, loop, keyState, toggleKey, valueAt, onPreset, onSolo }) {
    const { fmtMs, parseTime } = ThreeMedia._test;
    let layers = [];
    let selectedId = null;
    const list = el('div', { class: 'ly-list' });
    const count = el('span', { class: 'tw-count' });
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    const addBtn = btn('＋ Layer', 'Add a layer on top', (e) => addMenu(e.currentTarget), 'primary small');
    const dupBtn = btn('⧉', 'Duplicate the selected layer', () => onAdd('copy'));
    const delBtn = btn('🗑', 'Delete the selected layer', () => selectedId && onRemove(selectedId));
    const props = el('div', { class: 'ly-props' });
    let liveRanges = {}; // prop → { r, out, fmt, diamond }
    const root = el('div', { class: 'layers' },
      el('div', { class: 'tw-head' }, el('b', { text: 'Layers' }), count, el('span', { class: 'spacer' }), addBtn, dupBtn, delBtn),
      list, props);

    function addMenu(anchor) {
      const items = [
        'Scene layers',
        ...TEMPLATES.map((t) => [t.name, t.desc, () => onAdd(t.id)]),
        ['Copy of the selected layer', 'Same code and settings', () => onAdd('copy')],
        ['Ask the Three Director…', 'Describe the layer you want in the chat', () => onAdd('ask')],
        'Filters: change everything below',
        ...FILTERS.map((t) => [t.name, t.desc, () => onAdd(t.id)]),
      ];
      const menu = el('div', { class: 'mb-menu ly-addmenu' }, items.map((it) => (typeof it === 'string' ? el('div', { class: 'menu-head', text: it }) : el('button', { class: 'menu-item', on: { click: () => { menu.remove(); it[2](); } } }, el('b', { text: it[0] }), el('span', { class: 'hint', text: it[1] })))));
      const r = anchor.getBoundingClientRect();
      Object.assign(menu.style, { left: `${Math.max(8, Math.min(innerWidth - 270, r.left))}px`, top: `${r.bottom + 4}px`, transform: 'none' });
      document.body.append(menu);
      const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); removeEventListener('pointerdown', close, true); } };
      setTimeout(() => addEventListener('pointerdown', close, true));
    }

    let dragId = null;
    function renderList() {
      count.textContent = layers.length > 1 ? `${layers.length}` : '';
      delBtn.disabled = layers.length <= 1;
      list.replaceChildren(...[...layers].reverse().map((L) => {
        const eye = el('button', { class: `ly-eye${L.visible === false ? ' off' : ''}`, text: L.visible === false ? '◌' : '👁', title: `${L.visible === false ? 'Show this layer' : 'Hide this layer'} · Alt+click: show only this one (again: all)`, on: { click: (e) => { e.stopPropagation(); if (e.altKey && onSolo) { onSolo(L.id); return; } onChange(L.id, { visible: L.visible === false }, { live: false }); } } });
        const name = el('span', { class: 'ly-name', text: L.name, title: 'Double-click to rename' });
        name.addEventListener('dblclick', async (e) => {
          e.stopPropagation();
          const v = await Modal.prompt('Rename layer', { value: L.name });
          if (v?.trim()) onChange(L.id, { name: v.trim() }, { live: false });
        });
        const tags = [isFilter(L.code) ? 'FX' : '', L.blend && L.blend !== 'normal' ? BLENDS.find((b) => b[0] === L.blend)?.[1].split(' ')[0] : '', (L.opacity ?? 1) < 1 ? `${Math.round(L.opacity * 100)}%` : '', L.in != null || L.out != null ? '⏱' : ''].filter(Boolean).join(' · ');
        const row = el('div', { class: `ly-row${L.id === selectedId ? ' on' : ''}${L.visible === false ? ' hidden-layer' : ''}`, attrs: { draggable: 'true' }, title: 'Click to select · drag to reorder', on: { click: () => onSelect(L.id) } },
          eye, el('span', { class: 'ly-swatch', style: { background: L.color } }), name, el('span', { class: 'ly-tags', text: tags }));
        row.addEventListener('dragstart', (e) => { dragId = L.id; e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
        row.addEventListener('dragend', () => { dragId = null; row.classList.remove('dragging'); });
        row.addEventListener('dragover', (e) => { if (dragId && dragId !== L.id) { e.preventDefault(); row.classList.add('drop-target'); } });
        row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
        row.addEventListener('drop', (e) => {
          e.preventDefault();
          row.classList.remove('drop-target');
          if (!dragId || dragId === L.id) return;
          // dropped onto L: the dragged layer takes L's place (above it when moving up the list)
          const ids = layers.map((x) => x.id).filter((x) => x !== dragId);
          const from = layers.findIndex((x) => x.id === dragId);
          const to = layers.findIndex((x) => x.id === L.id);
          ids.splice(ids.indexOf(L.id) + (from < to ? 1 : 0), 0, dragId);
          onReorder(ids);
        });
        return row;
      }));
    }

    function renderProps() {
      const L = layers.find((x) => x.id === selectedId);
      props.replaceChildren();
      liveRanges = {};
      if (!L) return;
      const live = (patch) => onChange(L.id, patch, { live: true });
      const commit = (patch) => onChange(L.id, patch, { live: false });
      const range = (label, key, min, max, step, fmt, title) => {
        const v = valueAt ? valueAt(L, key) : L[key] ?? (key === 'scale' || key === 'opacity' ? 1 : 0);
        const out = el('span', { class: 'ly-val', text: fmt(v) });
        const r = el('input', { type: 'range', min, max, step, value: v, title: `${title || label} (double-click to reset)` });
        r.addEventListener('input', () => { out.textContent = fmt(Number(r.value)); live({ [key]: Number(r.value) }); });
        r.addEventListener('change', () => commit({ [key]: Number(r.value) }));
        r.addEventListener('dblclick', () => { const d = key === 'scale' || key === 'opacity' ? 1 : 0; r.value = d; out.textContent = fmt(d); commit({ [key]: d }); });
        const diamond = el('button', { class: 'kf-btn', type: 'button', on: { click: (e) => { e.preventDefault(); toggleKey?.(L.id, key, Number(r.value)); } } });
        paintDiamond(diamond, keyState?.(L.id, key) || 'none');
        liveRanges[key] = { r, out, fmt, diamond };
        return el('label', { class: 'ly-field kf' }, diamond, el('span', { text: label }), r, out);
      };
      const blend = el('select', { class: 'tw-select', title: 'How this layer mixes with the layers below' }, BLENDS.map(([v, l]) => el('option', { value: v, text: l, selected: v === (L.blend || 'normal') })));
      blend.addEventListener('change', () => commit({ blend: blend.value }));
      const timeIn = (key) => {
        const i = el('input', { type: 'text', class: 'mb-tin', value: L[key] == null ? '' : fmtMs(L[key]), placeholder: key === 'in' ? 'start' : 'end', title: `When this layer ${key === 'in' ? 'appears' : 'disappears'} (m:ss.mmm, empty = ${key === 'in' ? 'from the start' : 'until the end'})` });
        i.addEventListener('change', () => { const v = i.value.trim() ? parseTime(i.value) : null; if (v === null || Number.isFinite(v)) commit({ [key]: v }); });
        return i;
      };
      const here = (key) => btn('here', `Set the layer ${key === 'in' ? 'start' : 'end'} at the playhead`, () => commit({ [key]: Math.round(now() * 1000) / 1000 }));
      const fade = (key, label) => {
        const i = el('input', { type: 'number', class: 'ly-num', min: 0, max: 30, step: 0.1, value: L[key] || 0, title: `${label} in seconds (needs a ${key === 'fadeIn' ? 'start' : 'end'} time)` });
        i.addEventListener('change', () => commit({ [key]: Math.max(0, Number(i.value) || 0) }));
        return el('label', { class: 'ly-fade' }, el('span', { text: label }), i, el('span', { class: 'mb-unit', text: 's' }));
      };
      const hasSong = duration() > 0;
      const lp = loop();
      props.append(
        el('div', { class: 'ly-sel' }, el('span', { class: 'ly-swatch', style: { background: L.color } }), el('b', { text: L.name })),
        range('Opacity', 'opacity', 0, 1, 0.01, (v) => `${Math.round(v * 100)}%`),
        el('label', { class: 'ly-field' }, el('span', { text: 'Blend' }), blend),
        el('div', { class: 'ly-time' },
          el('span', { class: 'ly-label', text: 'Plays' }),
          hasSong ? el('span', { class: 'ly-timebox' }, timeIn('in'), here('in'), el('span', { class: 'mb-arrow', text: '→' }), timeIn('out'), here('out')) : el('span', { class: 'hint', text: 'Load a song to time layers' }),
          hasSong ? el('span', { class: 'ly-timebtns' },
            btn('Whole song', 'Play this layer for the whole song', () => commit({ in: null, out: null })),
            lp ? btn('Loop only', 'Play this layer only during the loop', () => commit({ in: lp.a, out: lp.b })) : null) : null),
        hasSong ? el('div', { class: 'ly-fades' }, fade('fadeIn', 'Fade in'), fade('fadeOut', 'Fade out')) : null,
        hasSong ? el('div', { class: 'ly-animate' },
          btn('Animate ▾', 'One-click animations: they add keyframes you can then edit in the layer\'s automation lane', (e) => {
            const items = PRESETS.map((pr) => [pr.name, pr.desc, () => onPreset?.(L.id, pr.id)]);
            const menu = el('div', { class: 'mb-menu' }, items.map(([label, hint, fn]) => el('button', { class: 'menu-item', on: { click: () => { menu.remove(); fn(); } } }, el('b', { text: label }), el('span', { class: 'hint', text: hint }))));
            const r = e.currentTarget.getBoundingClientRect();
            Object.assign(menu.style, { left: `${Math.max(8, Math.min(innerWidth - 270, r.left))}px`, top: `${r.bottom + 4}px`, transform: 'none', maxHeight: '60vh', overflowY: 'auto' });
            document.body.append(menu);
            const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); removeEventListener('pointerdown', close, true); } };
            setTimeout(() => addEventListener('pointerdown', close, true));
          }),
          el('span', { class: 'hint', text: 'over this layer\'s time (or the loop)' })) : null,
        el('details', { class: 'ly-transform', open: store.get('three.layerTransform', false), on: { toggle: (e) => store.set('three.layerTransform', e.currentTarget.open) } },
          el('summary', { text: 'Position, size, rotation' }),
          range('Move X', 'x', -100, 100, 0.5, (v) => `${v}%`, 'Move left / right (% of the frame)'),
          range('Move Y', 'y', -100, 100, 0.5, (v) => `${v}%`, 'Move up / down (% of the frame)'),
          range('Scale', 'scale', 0.1, 3, 0.01, (v) => `${Math.round(v * 100)}%`),
          range('Rotate', 'rotate', -180, 180, 0.5, (v) => `${v}°`)),
      );
    }

    return {
      el: root,
      render(next, sel) { layers = next; selectedId = sel; renderList(); renderProps(); },
      refreshProps: () => renderProps(),
      // While the song plays: animated fields show their current value, and ◆ shows whether you're on a keyframe.
      sync(values, states) {
        for (const [k, ui] of Object.entries(liveRanges)) {
          if (k in values && document.activeElement !== ui.r) { ui.r.value = values[k]; ui.out.textContent = ui.fmt(Number(values[k])); }
          if (states?.[k]) paintDiamond(ui.diamond, states[k]);
        }
      },
    };
  }
  function paintDiamond(b, state) {
    b.textContent = state === 'on' ? '◆' : '◇';
    b.className = `kf-btn kf-${state}`;
    b.title = state === 'on' ? 'Remove this keyframe' : state === 'animated' ? 'Add a keyframe here (it\'s animated: moving the slider also adds one)' : 'Animate: add a keyframe at the playhead';
  }

  return { panel, TEMPLATES, FILTERS, isFilter, ANIM_META, PRESETS, COLORS, BLENDS, defaults, newId, ANIM, KEY_EPS, evalKeys, upsertKey, keyAt };
})();
