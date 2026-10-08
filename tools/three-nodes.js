// Three.js Lab ⇄ Nodes: music-driven three.js scenes as node graphs (nodes.js). A graph compiles to a normal,
// readable sketch layer (renderer, scene and camera are implied) with its knobs as tweak() sliders, so the Lab's
// sliders panel, Save, Shuffle, looks and keyframes keep working. The graph rides along in the code's last line
// (// @nodes:v1 {…}) and comes back when you switch to Nodes. Graphs whose output is a filter node compile to a
// filter layer (filter(type, P)) instead.
const ThreeNodes = (() => {
  const TYPES = {
    num: { color: '#48ddff', label: 'Number' },
    trig: { color: '#ff6a6a', label: 'Hit (0..1 pulse)' },
    bool: { color: '#eae0d5', label: 'On / off' },
    color: { color: '#ff6b9d', label: 'Color' },
    vec3: { color: '#bd8bff', label: 'Vector (x, y, z)' },
    geo: { color: '#7cd992', label: 'Shape' },
    mat: { color: '#ff8c42', label: 'Material' },
    obj: { color: '#ffd75e', label: '3D object' },
    tex: { color: '#7ad0ff', label: 'Picture / video' },
    pass: { color: '#f5a3d0', label: 'Post effect' },
    cam: { color: '#c9b79c', label: 'Camera' },
  };
  // Slider groups in the Lab: a node inside a frame uses the frame's title; otherwise its category's group.
  const GROUP = { Music: 'Music', Triggers: 'Music', Time: 'Motion', Motion: 'Motion', Shapes: 'Shape', Materials: 'Material', Objects: 'Formation', Particles: 'Particles', Lights: 'Light', Colors: 'Colors', Camera: 'Camera', Post: 'Post', Math: 'Math', Vectors: 'Math', Sliders: 'Controls', Layer: 'Layer', Output: 'Look', 'Filter layer': 'Filter' };
  const frameOf = (node, graph) => (graph.frames || []).find((f) => node.x >= f.x && node.y >= f.y && node.x < f.x + f.w && node.y < f.y + f.h);
  // helpers (math, triggers, time) join the group of what they feed: "Bass → jitter" sits with the filter's sliders
  const HELPERS = new Set(['Math', 'Vectors', 'Triggers', 'Time']);
  function groupOf(node, def, graph, depth = 0) {
    if (node.group) return node.group;
    const f = frameOf(node, graph);
    if (f) return f.title;
    if (HELPERS.has(def.category) && depth < 6) {
      const l = graph.links.find((x) => x.from[0] === node.id);
      const next = l && graph.nodes.find((n) => n.id === l.to[0]);
      const nd = next && (next.type === '@reroute' ? null : reg.get(next.type));
      if (nd) return groupOf(next, nd, graph, depth + 1);
    }
    return def.group || GROUP[def.category] || def.category;
  }
  const lit = (v) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : JSON.stringify(v));
  const reg = NodeView.createRegistry({
    name: 'three', types: TYPES, staticTypes: ['geo', 'mat', 'obj', 'tex', 'pass', 'cam'],
    compat: { num: ['trig', 'vec3', 'bool'], trig: ['num', 'bool', 'vec3'], bool: ['num', 'trig'] },
    convert: (from, to, e) => {
      if (to === 'vec3' && (from === 'num' || from === 'trig')) return `Array(3).fill(${e})`;
      if (from === 'bool' && (to === 'num' || to === 'trig')) return `(${e} ? 1 : 0)`;
      if (to === 'bool' && (from === 'num' || from === 'trig')) return `(${e} > 0.5)`;
      return e;
    },
    groupOf: (node, def, graph) => groupOf(node, def, graph),
    assemble: (parts, graph, info) => assemble(parts, graph, info),
  });
  const define = (d) => reg.define(d);

  // ---------- field helpers ----------
  const N = (name, value, min, max, o = {}) => ({ name, type: 'num', value, min, max, ...o });
  const S = (name, value, min, max, o = {}) => N(name, value, min, max, { at: 'setup', ...o }); // read when the scene is built
  const I = (name, value, min, max, o = {}) => S(name, value, min, max, { step: 1, ...o }); // whole numbers (counts, segments)
  const C = (name, value, o = {}) => ({ name, type: 'color', value, ...o });
  const B = (name, value, o = {}) => ({ name, type: 'bool', value, ...o });
  const V = (name, value = [0, 0, 0], o = {}) => ({ name, type: 'vec3', value, step: 0.05, ...o });
  const SEL = (name, options, o = {}) => ({ name, kind: 'select', options, value: options[0], slider: false, ...o });
  const SOCK = (name, type, o = {}) => ({ name, type, kind: null, ...o }); // a socket without a widget
  const HIT = (name, o = {}) => ({ name, type: 'trig', value: 0, min: 0, max: 1, slider: false, ...o }); // usually wired to the music
  const O = (name, type, label) => ({ name, type, ...(label ? { label } : {}) });
  const TRANSFORM = () => [V('position'), V('rotation', [0, 0, 0], { label: 'Rotation °', step: 1 }), N('scale', 1, 0.05, 5)];

  // ---------- compile helpers ----------
  const isZero = (v) => !Array.isArray(v) || v.every((x) => !x);
  // Does a Motion node (spin, pulse, orbit…) move this object? Then the object resets its transform each frame.
  function motionKids(c, port = 'obj') {
    const g = c.graph; const seen = new Set();
    const walk = (id, p) => g.links.filter((l) => l.from[0] === id && l.from[1] === p).some((l) => {
      const n = g.nodes.find((x) => x.id === l.to[0]);
      if (!n || seen.has(n.id)) return false;
      seen.add(n.id);
      if (n.type === '@reroute') return walk(n.id, 'out');
      return Boolean(reg.get(n.type)?.motion);
    });
    return walk(c.id, port);
  }
  function vecExpr(c, name, deg = false) {
    if (c.linked(name)) { const e = c.in(name); return deg ? `...${e}.map(THREE.MathUtils.degToRad)` : `...${e}`; }
    const v = c.value(name) || [0, 0, 0];
    return (deg ? v.map((x) => Math.round(x * Math.PI / 180 * 10000) / 10000) : v).join(', ');
  }
  function transform(c, id, { skipScale = false } = {}) {
    const has = (n) => c.def.inputs.some((f) => f.name === n) && !(skipScale && n === 'scale');
    const every = motionKids(c) || ['position', 'rotation', 'scale'].some((n) => has(n) && c.dyn(n));
    const add = every ? c.frame : c.setup;
    if (has('position') && (every || c.linked('position') || !isZero(c.value('position')))) add(`${id}.position.set(${vecExpr(c, 'position')});`);
    if (has('rotation') && (every || c.linked('rotation') || !isZero(c.value('rotation')))) add(`${id}.rotation.set(${vecExpr(c, 'rotation', true)});`);
    if (has('scale')) { const e = c.in('scale'); if (every || e !== '1') add(`${id}.scale.setScalar(${e});`); }
  }
  // Material settings: fixed ones go in the constructor, changing ones (sliders, music) are set every frame.
  function matOpts(c, id, list) {
    const opts = [];
    for (const [f, prop, kind] of list) {
      const e = c.in(f);
      if (kind === 'blend') {
        if (c.dyn(f)) { c.frame(`${id}.blending = ${e} ? THREE.AdditiveBlending : THREE.NormalBlending;`); c.frame(`${id}.depthWrite = !${e};`); } else if (c.value(f)) opts.push('blending: THREE.AdditiveBlending', 'depthWrite: false');
        continue;
      }
      if (c.dyn(f)) c.frame(kind === 'color' ? `${id}.${prop}.set(${e});` : `${id}.${prop} = ${e};`);
      else if (!(kind === 'bool' && e === 'false')) opts.push(`${prop}: ${e}`);
    }
    return opts;
  }
  const mapOpt = (c) => (c.linked('map') ? [`map: ${c.in('map')}`] : []);
  // the dot sprite that makes points round and soft
  const DOT = `function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.65)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}`;
  const MIXCOLOR = `// blend two colors ('#rrggbb'), t 0..1
const _ca = new THREE.Color(); const _cb = new THREE.Color();
function mixColor(a, b, t) { return '#' + _ca.set(a).lerp(_cb.set(b), Math.max(0, Math.min(1, t))).getHexString(); }`;
  const HUESHIFT = `// turn a color's hue by turns (0..1), lighten / darken by l
const _ch = new THREE.Color();
function shiftColor(c, turns, l = 0) { return '#' + _ch.set(c).offsetHSL(turns, 0, l).getHexString(); }`;
  const PALCOLOR = `// a color along a list of colors, t 0..1 (wraps)
function paletteColor(cols, t) {
  const x = (((t % 1) + 1) % 1) * cols.length; const i = Math.floor(x);
  return mixColor(cols[i], cols[(i + 1) % cols.length], x - i);
}`;
  const SPEC = `// the music spectrum at a position 0..1 (low → high, spread like hearing), 0..1
function spectrumAt(p) { const s = audio.spectrum; return s.length ? s[Math.min(s.length - 1, Math.floor(Math.pow(Math.max(0, Math.min(1, p)), 1.6) * s.length * 0.72))] / 255 : 0; }`;
  const BEATS = `// beats since the song started (from the beat grid)
function beatCount() { return ((audio.bar || 1) - 1) * audio.beatsPerBar + ((audio.beatInBar || 1) - 1) + (audio.beatPhase || 0); }`;
  const helper = (c, name) => {
    const code = { mixColor: MIXCOLOR, shiftColor: HUESHIFT, paletteColor: PALCOLOR, dotTexture: DOT, spectrumAt: SPEC, beatCount: BEATS }[name];
    if (name === 'paletteColor') c.helper('mixColor', MIXCOLOR);
    c.helper(name, code);
    return name;
  };
  // rising edge of a hit: true once when it crosses 0.5
  const edge = (c, e) => { c.setup(`let ${c.id}Was = false; let ${c.id}Hit = false;`); c.frame(`${c.id}Hit = ${e} > 0.5 && !${c.id}Was;`); c.frame(`${c.id}Was = ${e} > 0.5;`); return `${c.id}Hit`; };

  // ---------- Output ----------
  define({
    type: 'output', title: 'Output', category: 'Output', color: '#ffd75e', width: 200, idBase: 'out',
    desc: 'What the layer shows: the objects in the scene, the camera, post effects and the background. Objects not wired anywhere are added too.',
    inputs: [SOCK('objects', 'obj', { multi: true }), SOCK('camera', 'cam'), SOCK('post', 'pass', { multi: true, label: 'Post effects' }),
      C('background', '#05060a'), B('backgroundOn', false, { label: 'Background', hint: 'Off: transparent, so layers below show through' }), N('fog', 0, 0, 0.2, { label: 'Fog', step: 0.001, slider: false }), N('exposure', 1, 0.2, 3, { slider: false })],
    widgets: [SEL('toneMap', ['none', 'aces', 'agx'], { label: 'Tone map' })],
    compile(c) {
      const objs = c.ins('objects');
      if (objs.length) c.setup(`scene.add(${[...new Set(objs)].join(', ')});`);
      if (c.value('backgroundOn') || c.linked('backgroundOn') || c.dyn('backgroundOn')) {
        c.setup(`const ${c.id}Background = new THREE.Color();`);
        const on = c.in('backgroundOn'); const bg = c.in('background');
        const stmt = `scene.background = ${on} ? ${c.id}Background.set(${bg}) : null;`;
        if (c.dyn('background') || c.dyn('backgroundOn')) c.frame(stmt); else c.setup(stmt);
      }
      if (c.linked('fog') || c.value('fog') > 0 || c.dyn('fog')) {
        c.setup(`scene.fog = new THREE.FogExp2(${c.in('background')}, ${c.in('fog')});`);
        if (c.dyn('fog')) c.frame(`scene.fog.density = ${c.in('fog')};`);
        if (c.dyn('background')) c.frame(`scene.fog.color.set(${c.in('background')});`);
      }
      const tm = c.value('toneMap');
      if (tm !== 'none') c.setup(`renderer.toneMapping = THREE.${tm === 'agx' ? 'AgX' : 'ACESFilmic'}ToneMapping;`);
      if (c.dyn('exposure') || c.value('exposure') !== 1) c.apply('exposure', (e) => `renderer.toneMappingExposure = ${e};`);
      c.shared.passes = c.ins('post');
      return {};
    },
  });

  // ---------- Shapes (geometry) ----------
  const geoDef = (type, title, ctor, params, desc, keywords = '') => define({
    type, title, category: 'Shapes', color: '#7cd992', desc, keywords, idBase: type,
    inputs: params, outputs: [O('geo', 'geo', 'Shape')],
    compile: (c) => { c.setup(`const ${c.id} = new THREE.${ctor}(${params.map((p) => c.in(p.name)).join(', ')});`); return { geo: c.id }; },
  });
  geoDef('box', 'Box', 'BoxGeometry', [S('width', 1, 0.05, 10), S('height', 1, 0.05, 10), S('depth', 1, 0.05, 10)], 'A box / cube', 'cube');
  geoDef('sphere', 'Sphere', 'SphereGeometry', [S('radius', 1, 0.05, 10), I('widthSegments', 48, 3, 128, { label: 'Detail' }), I('heightSegments', 24, 2, 64, { label: 'Rings' })], 'A smooth ball');
  geoDef('icosahedron', 'Icosahedron', 'IcosahedronGeometry', [S('radius', 1, 0.05, 10), I('detail', 1, 0, 6)], 'A gem-like ball (detail 0 = 20 faces, higher = rounder)', 'gem crystal ico');
  geoDef('torus', 'Torus', 'TorusGeometry', [S('radius', 1, 0.05, 10), S('tube', 0.3, 0.01, 3), I('radialSegments', 16, 3, 64, { label: 'Tube detail' }), I('tubularSegments', 96, 3, 256, { label: 'Ring detail' })], 'A donut / ring', 'donut ring');
  geoDef('torusKnot', 'Torus knot', 'TorusKnotGeometry', [S('radius', 1, 0.05, 10), S('tube', 0.28, 0.01, 2), I('tubularSegments', 160, 8, 400, { label: 'Detail' }), I('radialSegments', 16, 3, 48, { label: 'Tube detail' }), I('p', 2, 1, 12), I('q', 3, 1, 12)], 'A knotted tube (p, q change the knot)', 'knot');
  geoDef('plane', 'Plane', 'PlaneGeometry', [S('width', 4, 0.1, 40), S('height', 4, 0.1, 40), I('widthSegments', 1, 1, 256, { label: 'Columns' }), I('heightSegments', 1, 1, 256, { label: 'Rows' })], 'A flat rectangle (a screen, a floor)', 'flat floor screen');
  geoDef('cylinder', 'Cylinder', 'CylinderGeometry', [S('radiusTop', 1, 0, 10, { label: 'Top radius' }), S('radiusBottom', 1, 0, 10, { label: 'Bottom radius' }), S('height', 2, 0.05, 20), I('radialSegments', 32, 3, 128, { label: 'Detail' })], 'A tube, pillar or bar', 'pillar tube');
  geoDef('cone', 'Cone', 'ConeGeometry', [S('radius', 1, 0.05, 10), S('height', 2, 0.05, 20), I('radialSegments', 32, 3, 128, { label: 'Detail' })], 'A cone / pyramid (detail 4)', 'pyramid');
  geoDef('ringShape', 'Flat ring', 'RingGeometry', [S('innerRadius', 0.8, 0, 10, { label: 'Inner' }), S('outerRadius', 1, 0.05, 10, { label: 'Outer' }), I('thetaSegments', 64, 3, 256, { label: 'Detail' })], 'A flat ring (a halo)', 'halo circle');
  geoDef('capsule', 'Capsule', 'CapsuleGeometry', [S('radius', 0.5, 0.05, 5), S('length', 1, 0, 10), I('capSegments', 8, 1, 32, { label: 'Cap detail' }), I('radialSegments', 16, 3, 64, { label: 'Detail' })], 'A pill shape', 'pill');
  define({
    type: 'polyhedron', title: 'Polyhedron', category: 'Shapes', color: '#7cd992', desc: 'Tetrahedron, octahedron or dodecahedron', keywords: 'tetra octa dodeca crystal',
    widgets: [SEL('kind', ['Octahedron', 'Tetrahedron', 'Dodecahedron'], { label: 'Kind' })], inputs: [S('radius', 1, 0.05, 10), I('detail', 0, 0, 5)], outputs: [O('geo', 'geo', 'Shape')],
    compile: (c) => { c.setup(`const ${c.id} = new THREE.${c.value('kind')}Geometry(${c.in('radius')}, ${c.in('detail')});`); return { geo: c.id }; },
  });

  // ---------- Materials ----------
  define({
    type: 'basicMat', title: 'Basic material', category: 'Materials', color: '#ff8c42', idBase: 'basic', desc: 'Flat color, no lights needed. Additive = glowing (bright where things overlap).', keywords: 'unlit flat neon glow',
    inputs: [C('color', '#48ddff'), N('opacity', 1, 0, 1), B('wireframe', false), B('additive', false, { label: 'Additive glow' }), SOCK('map', 'tex', { label: 'Picture' })], outputs: [O('mat', 'mat', 'Material')],
    compile: (c) => {
      const opts = ['transparent: true', ...mapOpt(c), ...matOpts(c, c.id, [['color', 'color', 'color'], ['opacity', 'opacity'], ['wireframe', 'wireframe', 'bool'], ['additive', '', 'blend']])];
      c.setup(`const ${c.id} = new THREE.MeshBasicMaterial({ ${opts.join(', ')} });`);
      return { mat: c.id };
    },
  });
  define({
    type: 'standardMat', title: 'Standard material', category: 'Materials', color: '#ff8c42', idBase: 'standard', desc: 'Lit by lights: rough or shiny, metal or not, with its own glow (emissive). Add a light!', keywords: 'pbr metal rough lit',
    inputs: [C('color', '#bd8bff'), N('roughness', 0.4, 0, 1), N('metalness', 0.2, 0, 1), C('emissive', '#000000', { label: 'Glow color' }), N('emissiveIntensity', 1, 0, 10, { label: 'Glow' }), N('opacity', 1, 0, 1), B('wireframe', false), B('flatShading', false, { label: 'Faceted', slider: false }), SOCK('map', 'tex', { label: 'Picture' })], outputs: [O('mat', 'mat', 'Material')],
    compile: (c) => {
      const opts = ['transparent: true', ...mapOpt(c), ...matOpts(c, c.id, [['color', 'color', 'color'], ['roughness', 'roughness'], ['metalness', 'metalness'], ['emissive', 'emissive', 'color'], ['emissiveIntensity', 'emissiveIntensity'], ['opacity', 'opacity'], ['wireframe', 'wireframe', 'bool'], ['flatShading', 'flatShading', 'bool']])];
      c.setup(`const ${c.id} = new THREE.MeshStandardMaterial({ ${opts.join(', ')} });`);
      return { mat: c.id };
    },
  });
  define({
    type: 'physicalMat', title: 'Glass / physical', category: 'Materials', color: '#ff8c42', idBase: 'glass', desc: 'Glass, clear coat and rainbow iridescence (needs lights; looks best with an environment)', keywords: 'glass transmission iridescence clearcoat',
    inputs: [C('color', '#ffffff'), N('roughness', 0.1, 0, 1), N('metalness', 0, 0, 1), N('transmission', 1, 0, 1, { label: 'Glass' }), N('thickness', 1, 0, 5), N('clearcoat', 1, 0, 1), N('iridescence', 0.6, 0, 1), C('emissive', '#000000', { label: 'Glow color' })], outputs: [O('mat', 'mat', 'Material')],
    compile: (c) => {
      const opts = matOpts(c, c.id, [['color', 'color', 'color'], ['roughness', 'roughness'], ['metalness', 'metalness'], ['transmission', 'transmission'], ['thickness', 'thickness'], ['clearcoat', 'clearcoat'], ['iridescence', 'iridescence'], ['emissive', 'emissive', 'color']]);
      c.setup(`const ${c.id} = new THREE.MeshPhysicalMaterial({ ${opts.join(', ')} });`);
      return { mat: c.id };
    },
  });
  define({
    type: 'normalMat', title: 'Rainbow normals', category: 'Materials', color: '#ff8c42', idBase: 'normals', desc: 'Colors from the surface direction: instant rainbow look, no lights needed', keywords: 'normal rainbow',
    inputs: [B('flatShading', false, { label: 'Faceted', slider: false }), B('wireframe', false), N('opacity', 1, 0, 1)], outputs: [O('mat', 'mat', 'Material')],
    compile: (c) => { c.setup(`const ${c.id} = new THREE.MeshNormalMaterial({ ${['transparent: true', ...matOpts(c, c.id, [['flatShading', 'flatShading', 'bool'], ['wireframe', 'wireframe', 'bool'], ['opacity', 'opacity']])].join(', ')} });`); return { mat: c.id }; },
  });
  define({
    type: 'toonMat', title: 'Toon material', category: 'Materials', color: '#ff8c42', idBase: 'toon', desc: 'Cartoon shading in bands (needs a light)', keywords: 'cel cartoon',
    inputs: [C('color', '#ff6b9d'), C('emissive', '#000000', { label: 'Glow color' })], outputs: [O('mat', 'mat', 'Material')],
    compile: (c) => { c.setup(`const ${c.id} = new THREE.MeshToonMaterial({ ${matOpts(c, c.id, [['color', 'color', 'color'], ['emissive', 'emissive', 'color']]).join(', ')} });`); return { mat: c.id }; },
  });
  define({
    type: 'glowMat', title: 'Rim glow', category: 'Materials', color: '#ff8c42', idBase: 'rimGlow', desc: 'A glowing edge (fresnel) like a hologram or force field; additive', keywords: 'fresnel hologram rim neon',
    inputs: [C('color', '#48ddff'), N('power', 2, 0.2, 8, { label: 'Edge sharpness' }), N('intensity', 1.5, 0, 6, { label: 'Brightness' })], outputs: [O('mat', 'mat', 'Material')],
    compile: (c) => {
      const id = c.id;
      c.setup(`const ${id} = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(${c.in('color')}) }, uPower: { value: ${c.in('power')} }, uIntensity: { value: ${c.in('intensity')} } },
  vertexShader: 'varying vec3 vN; varying vec3 vV;\\nvoid main() {\\n  vec4 p = vec4(position, 1.0); vec3 n = normal;\\n#ifdef USE_INSTANCING\\n  p = instanceMatrix * p; n = mat3(instanceMatrix) * n;\\n#endif\\n  vec4 mv = modelViewMatrix * p; vN = normalize(normalMatrix * n); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv;\\n}',
  fragmentShader: 'uniform vec3 uColor; uniform float uPower; uniform float uIntensity; varying vec3 vN; varying vec3 vV; void main() { float f = pow(1.0 - abs(dot(vN, vV)), uPower) * uIntensity; gl_FragColor = vec4(uColor * f, f); }',
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
});`);
      if (c.dyn('color')) c.frame(`${id}.uniforms.uColor.value.set(${c.in('color')});`);
      if (c.dyn('power')) c.frame(`${id}.uniforms.uPower.value = ${c.in('power')};`);
      if (c.dyn('intensity')) c.frame(`${id}.uniforms.uIntensity.value = ${c.in('intensity')};`);
      return { mat: id };
    },
  });
  define({
    type: 'gradientMat', title: 'Gradient', category: 'Materials', color: '#ff8c42', idBase: 'gradient', desc: 'Two colors blended from bottom to top of the object, no lights needed', keywords: 'shader two colors',
    inputs: [C('bottom', '#1b0f3b'), C('top', '#ff6b9d'), N('size', 2, 0.1, 20, { label: 'Height', hint: 'Over how much height the colors blend' }), N('opacity', 1, 0, 1)], outputs: [O('mat', 'mat', 'Material')],
    compile: (c) => {
      const id = c.id;
      c.setup(`const ${id} = new THREE.ShaderMaterial({
  uniforms: { uA: { value: new THREE.Color(${c.in('bottom')}) }, uB: { value: new THREE.Color(${c.in('top')}) }, uSize: { value: ${c.in('size')} }, uOpacity: { value: ${c.in('opacity')} } },
  vertexShader: 'varying float vY;\\nvoid main() {\\n  vec4 p = vec4(position, 1.0); vY = position.y;\\n#ifdef USE_INSTANCING\\n  p = instanceMatrix * p;\\n#endif\\n  gl_Position = projectionMatrix * modelViewMatrix * p;\\n}',
  fragmentShader: 'uniform vec3 uA; uniform vec3 uB; uniform float uSize; uniform float uOpacity; varying float vY; void main() { gl_FragColor = vec4(mix(uA, uB, clamp(vY / uSize + 0.5, 0.0, 1.0)), uOpacity); }',
  transparent: true,
});`);
      for (const [f, u, col] of [['bottom', 'uA', 1], ['top', 'uB', 1], ['size', 'uSize'], ['opacity', 'uOpacity']]) if (c.dyn(f)) c.frame(col ? `${id}.uniforms.${u}.value.set(${c.in(f)});` : `${id}.uniforms.${u}.value = ${c.in(f)};`);
      return { mat: id };
    },
  });
  define({
    type: 'refImage', title: 'Reference picture', category: 'Materials', color: '#7ad0ff', idBase: 'picture', desc: 'A picture or video from the sketch\'s References (by its name), as a texture', keywords: 'image texture logo reference refs',
    widgets: [{ name: 'name', kind: 'text', value: 'logo', label: 'Name', slider: false }], outputs: [O('tex', 'tex', 'Picture')],
    compile: (c) => { c.setup(`const ${c.id} = refTexture(${lit(String(c.value('name') || ''))});`); return { tex: c.id }; },
  });
  define({
    type: 'videoTex', title: 'Music video', category: 'Materials', color: '#7ad0ff', idBase: 'video', desc: 'The video loaded in the Lab (an mp4 / mov) as a texture', keywords: 'mp4 movie footage',
    outputs: [O('tex', 'tex', 'Video')],
    compile: (c) => { c.setup(`const ${c.id} = media.texture();`); return { tex: c.id }; },
  });

  // ---------- Objects ----------
  define({
    type: 'mesh', title: 'Mesh', category: 'Objects', color: '#ffd75e', desc: 'A shape with a material: the basic 3D object', keywords: 'object model',
    inputs: [SOCK('geometry', 'geo', { label: 'Shape', fallback: 'new THREE.IcosahedronGeometry(1, 1)' }), SOCK('material', 'mat', { fallback: 'new THREE.MeshNormalMaterial()' }), ...TRANSFORM()], outputs: [O('obj', 'obj', 'Object')],
    compile: (c) => { c.setup(`const ${c.id} = new THREE.Mesh(${c.in('geometry')}, ${c.in('material')});`); transform(c, c.id); return { obj: c.id }; },
  });
  define({
    type: 'group', title: 'Group', category: 'Objects', color: '#ffd75e', desc: 'Moves, turns and scales several objects together', keywords: 'parent container',
    inputs: [SOCK('children', 'obj', { multi: true, label: 'Objects' }), ...TRANSFORM()], outputs: [O('obj', 'obj', 'Group')],
    compile: (c) => {
      c.setup(`const ${c.id} = new THREE.Group();`);
      const kids = c.ins('children');
      if (kids.length) c.setup(`${c.id}.add(${[...new Set(kids)].join(', ')});`);
      transform(c, c.id);
      return { obj: c.id };
    },
  });
  define({
    type: 'particles', title: 'Particles', category: 'Particles', color: '#bd8bff', desc: 'A cloud of soft glowing dots in a sphere, shell, cube, galaxy disc or ring. Pulse makes them swell (wire a kick to it).', keywords: 'points dots stars cloud galaxy',
    widgets: [SEL('shape', ['sphere', 'shell', 'cube', 'galaxy', 'ring'], { label: 'Shape' })],
    inputs: [I('count', 5000, 100, 40000, { step: 100, label: 'Count' }), S('spread', 5, 0.5, 20), I('seed', 1, 1, 999, { slider: false }), N('size', 0.08, 0.005, 0.5, { label: 'Dot size' }), C('color', '#bd8bff'), N('opacity', 0.85, 0, 1), N('spin', 0.1, -2, 2), HIT('pulse', { label: 'Pulse' }), N('punch', 1.2, 0, 4, { label: 'Pulse amount' }), N('scale', 1, 0.05, 5)],
    outputs: [O('obj', 'obj', 'Particles')],
    compile: (c) => {
      const id = c.id;
      helper(c, 'dotTexture');
      const shape = {
        sphere: 'const r = R * Math.cbrt(rnd()); const u = Math.acos(2 * rnd() - 1); const a = rnd() * Math.PI * 2;\n  pos.set([r * Math.sin(u) * Math.cos(a), r * Math.sin(u) * Math.sin(a), r * Math.cos(u)], i * 3);',
        shell: 'const r = R * (0.92 + 0.08 * rnd()); const u = Math.acos(2 * rnd() - 1); const a = rnd() * Math.PI * 2;\n  pos.set([r * Math.sin(u) * Math.cos(a), r * Math.sin(u) * Math.sin(a), r * Math.cos(u)], i * 3);',
        cube: 'pos.set([(rnd() - 0.5) * 2 * R, (rnd() - 0.5) * 2 * R, (rnd() - 0.5) * 2 * R], i * 3);',
        galaxy: 'const r = R * Math.pow(rnd(), 0.7); const a = (i % 3) * (Math.PI * 2 / 3) + r * 1.3 + (rnd() - 0.5) * 0.6;\n  pos.set([Math.cos(a) * r, (rnd() - 0.5) * R * 0.08 * (1.2 - r / R), Math.sin(a) * r], i * 3);',
        ring: 'const r = R * (0.8 + 0.4 * rnd()); const a = rnd() * Math.PI * 2;\n  pos.set([Math.cos(a) * r, (rnd() - 0.5) * R * 0.1, Math.sin(a) * r], i * 3);',
      }[c.value('shape')] || '';
      c.setup(`const ${id} = (() => {
  const n = Math.round(${c.in('count')}); const R = ${c.in('spread')}; const rnd = seeded(${c.in('seed')});
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
  ${shape}
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ size: 0.08, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  return new THREE.Points(geo, mat);
})();
let ${id}Spin = 0;`);
      transform(c, id);
      if (c.linked('pulse')) c.frame(`${id}.material.size = ${c.in('size')} * (1 + ${c.in('pulse')} * ${c.in('punch')});`);
      else c.apply('size', (e) => `${id}.material.size = ${e};`);
      c.apply('color', (e) => `${id}.material.color.set(${e});`);
      c.apply('opacity', (e) => `${id}.material.opacity = ${e};`);
      c.frame(`${id}Spin += ${c.in('spin')} * dt;`);
      c.frame(`${id}.rotation.y = ${id}Spin;`);
      return { obj: id };
    },
  });
  define({
    type: 'starfield', title: 'Warp stars', category: 'Particles', color: '#bd8bff', idBase: 'stars', desc: 'Stars rushing toward the camera (hyperspace). Wire energy or a kick to Speed.', keywords: 'hyperspace warp speed stars fly',
    inputs: [I('count', 2000, 100, 20000, { step: 100 }), S('spread', 12, 1, 40, { label: 'Width' }), S('depth', 60, 10, 200), N('speed', 12, 0, 80), HIT('boost', { label: 'Boost' }), N('size', 0.12, 0.01, 1, { label: 'Star size' }), C('color', '#ffffff')],
    outputs: [O('obj', 'obj', 'Stars')],
    compile: (c) => {
      const id = c.id;
      helper(c, 'dotTexture');
      c.setup(`const ${id} = (() => {
  const n = Math.round(${c.in('count')}); const W = ${c.in('spread')}; const D = ${c.in('depth')};
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * W * 2, (Math.random() - 0.5) * W * 2, 8 - Math.random() * D], i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.12, map: dotTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.userData.depth = D;
  return pts;
})();`);
      c.apply('color', (e) => `${id}.material.color.set(${e});`);
      c.apply('size', (e) => `${id}.material.size = ${e};`);
      c.frame(`{
  const p = ${id}.geometry.attributes.position; const step = (${c.in('speed')}) * (1 + 3 * ${c.in('boost')}) * dt; const D = ${id}.userData.depth;
  for (let i = 0; i < p.count; i++) { let z = p.getZ(i) + step; if (z > camera.position.z) z -= D; p.setZ(i, z); }
  p.needsUpdate = true;
}`);
      return { obj: id };
    },
  });
  define({
    type: 'tunnel', title: 'Tunnel', category: 'Objects', color: '#ffd75e', desc: 'Rings flying toward the camera: an endless tunnel. Wire a kick to Pulse, energy to Speed.', keywords: 'rings corridor fly through wormhole',
    widgets: [SEL('ringShape', ['circle', 'square', 'hexagon', 'triangle'], { label: 'Ring shape' })],
    inputs: [I('rings', 40, 4, 160), S('radius', 3, 0.5, 15), S('spacing', 1.2, 0.2, 6), S('thickness', 0.04, 0.005, 0.5), N('speed', 4, -30, 30), N('twist', 0.15, -2, 2), C('color', '#48ddff'), B('palette', true, { label: 'Palette colors' }), HIT('pulse'), N('punch', 0.35, 0, 2, { label: 'Pulse amount' })],
    outputs: [O('obj', 'obj', 'Tunnel')],
    compile: (c) => {
      const id = c.id;
      helper(c, 'paletteColor');
      const seg = { circle: 64, square: 4, hexagon: 6, triangle: 3 }[c.value('ringShape')] || 64;
      c.setup(`const ${id} = new THREE.Group();
const ${id}Rings = [];
for (let i = 0; i < Math.round(${c.in('rings')}); i++) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(${c.in('radius')}, ${c.in('thickness')}, 6, ${seg}), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  ${id}.add(ring);
  ${id}Rings.push(ring);
}
let ${id}Travel = 0;`);
      c.frame(`{
  ${id}Travel += ${c.in('speed')} * dt;
  const gap = ${c.in('spacing')}; const total = ${id}Rings.length * gap; const grow = 1 + ${c.in('pulse')} * ${c.in('punch')};
  ${id}Rings.forEach((ring, i) => {
    const z = (((i * gap + ${id}Travel) % total) + total) % total; // 0 = far … total = at the camera
    ring.position.z = camera.position.z - total + z - 0.5;
    ring.rotation.z = i * ${c.in('twist')} + t * 0.1;
    ring.scale.setScalar(grow);
    ring.material.color.set(${c.in('palette')} ? paletteColor(palette.length ? palette : ['#48ddff', '#bd8bff', '#ff6b9d', '#ffd75e'], i / ${id}Rings.length + t * 0.05) : ${c.in('color')});
    ring.material.opacity = Math.min(1, z / total * 1.6);
  });
}`);
      return { obj: id };
    },
  });
  define({
    type: 'gridCopies', title: 'Grid of copies', category: 'Objects', color: '#ffd75e', idBase: 'grid', desc: 'Many copies of a shape on a floor grid that ripple, wave, follow noise or the spectrum. Amount scales the motion (wire a kick).', keywords: 'instances instanced field floor city bars',
    widgets: [SEL('mode', ['wave', 'ripple', 'noise', 'spectrum'], { label: 'Motion' })],
    inputs: [SOCK('geometry', 'geo', { label: 'Shape', fallback: 'new THREE.BoxGeometry(0.4, 0.4, 0.4)' }), SOCK('material', 'mat', { fallback: 'new THREE.MeshNormalMaterial()' }), I('columns', 24, 2, 120), I('rows', 24, 2, 120), S('spacing', 0.6, 0.1, 4), N('height', 1.2, 0, 6), N('speed', 1, 0, 6), N('amount', 1, 0, 4, { label: 'Amount' }), B('palette', false, { label: 'Palette colors' }), ...TRANSFORM()],
    outputs: [O('obj', 'obj', 'Grid')],
    compile: (c) => {
      const id = c.id;
      const mode = c.value('mode');
      if (mode === 'spectrum') helper(c, 'spectrumAt');
      c.setup(`const ${id}Cols = Math.round(${c.in('columns')}); const ${id}Rows = Math.round(${c.in('rows')});
const ${id} = new THREE.InstancedMesh(${c.in('geometry')}, ${c.in('material')}, ${id}Cols * ${id}Rows);
const ${id}Dummy = new THREE.Object3D(); const ${id}Color = new THREE.Color();`);
      const h = {
        wave: 'Math.sin(x * 0.6 + t * sp) * Math.cos(z * 0.6 + t * sp * 0.8)',
        ripple: 'Math.sin(Math.hypot(x, z) * 1.3 - t * sp * 3)',
        noise: 'noise(x * 0.25, z * 0.25, t * sp * 0.3)',
        spectrum: `spectrumAt(Math.hypot(i - ${id}Cols / 2, j - ${id}Rows / 2) / Math.hypot(${id}Cols / 2, ${id}Rows / 2))`,
      }[mode];
      transform(c, id);
      c.frame(`{
  const gap = ${c.in('spacing')}; const sp = ${c.in('speed')}; const amp = ${c.in('height')} * ${c.in('amount')}; const usePalette = ${c.in('palette')};
  for (let i = 0, k = 0; i < ${id}Cols; i++) for (let j = 0; j < ${id}Rows; j++, k++) {
    const x = (i - (${id}Cols - 1) / 2) * gap; const z = (j - (${id}Rows - 1) / 2) * gap;
    const h = ${h};
    ${id}Dummy.position.set(x, h * amp * 0.5, z);
    ${id}Dummy.scale.set(1, 1 + Math.max(0, h) * amp * 2, 1);
    ${id}Dummy.updateMatrix();
    ${id}.setMatrixAt(k, ${id}Dummy.matrix);
    if (usePalette) ${id}.setColorAt(k, ${id}Color.set(paletteAt(k / (${id}Cols * ${id}Rows) + h * 0.15 + t * 0.03)));
  }
  ${id}.instanceMatrix.needsUpdate = true;
  if (${id}.instanceColor) ${id}.instanceColor.needsUpdate = true;
}`);
      return { obj: id };
    },
  });
  define({
    type: 'ringCopies', title: 'Ring of copies', category: 'Objects', color: '#ffd75e', idBase: 'circle', desc: 'Copies of a shape around a circle; each one reacts to its part of the spectrum, a wave or the hit you wire to React.', keywords: 'instances circle around radial',
    widgets: [SEL('mode', ['spectrum', 'wave', 'together'], { label: 'Each copy' })],
    inputs: [SOCK('geometry', 'geo', { label: 'Shape', fallback: 'new THREE.BoxGeometry(0.2, 0.2, 0.6)' }), SOCK('material', 'mat', { fallback: 'new THREE.MeshNormalMaterial()' }), I('count', 32, 3, 400), S('radius', 3, 0.2, 20), N('react', 1, 0, 6, { label: 'React' }), N('spin', 0.2, -3, 3), B('palette', false, { label: 'Palette colors' }), ...TRANSFORM()],
    outputs: [O('obj', 'obj', 'Ring')],
    compile: (c) => {
      const id = c.id;
      const mode = c.value('mode');
      if (mode === 'spectrum') helper(c, 'spectrumAt');
      c.setup(`const ${id}N = Math.round(${c.in('count')});
const ${id} = new THREE.InstancedMesh(${c.in('geometry')}, ${c.in('material')}, ${id}N);
const ${id}Dummy = new THREE.Object3D(); const ${id}Color = new THREE.Color();
let ${id}Turn = 0;`);
      const v = { spectrum: `spectrumAt(i / ${id}N)`, wave: `0.5 + 0.5 * Math.sin(i / ${id}N * Math.PI * 4 + t * 3)`, together: '1' }[mode];
      transform(c, id);
      c.frame(`{
  ${id}Turn += ${c.in('spin')} * dt;
  const R = ${c.in('radius')}; const react = ${c.in('react')}; const usePalette = ${c.in('palette')};
  for (let i = 0; i < ${id}N; i++) {
    const a = i / ${id}N * Math.PI * 2 + ${id}Turn; const v = ${v};
    ${id}Dummy.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    ${id}Dummy.rotation.set(0, 0, a);
    ${id}Dummy.scale.setScalar(1 + v * react);
    ${id}Dummy.updateMatrix();
    ${id}.setMatrixAt(i, ${id}Dummy.matrix);
    if (usePalette) ${id}.setColorAt(i, ${id}Color.set(paletteAt(i / ${id}N)));
  }
  ${id}.instanceMatrix.needsUpdate = true;
  if (${id}.instanceColor) ${id}.instanceColor.needsUpdate = true;
}`);
      return { obj: id };
    },
  });
  define({
    type: 'spectrumBars', title: 'Spectrum bars', category: 'Objects', color: '#ffd75e', idBase: 'bars', desc: 'An equalizer: one bar per frequency band, in a line, a circle or a half circle', keywords: 'equalizer eq fft frequency analyzer',
    widgets: [SEL('layout', ['line', 'circle', 'arc'], { label: 'Layout' })],
    inputs: [I('count', 64, 4, 256), S('width', 8, 1, 30, { label: 'Width / radius' }), N('height', 4, 0.1, 15), S('thickness', 0.08, 0.01, 1), N('smoothing', 0.5, 0, 0.95), C('color', '#48ddff'), B('palette', true, { label: 'Palette colors' }), B('mirror', false, { label: 'Mirror' }), ...TRANSFORM()],
    outputs: [O('obj', 'obj', 'Bars')],
    compile: (c) => {
      const id = c.id;
      helper(c, 'spectrumAt');
      const layout = c.value('layout');
      c.setup(`const ${id}N = Math.round(${c.in('count')});
const ${id} = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), ${id}N);
const ${id}Level = new Float32Array(${id}N); const ${id}Dummy = new THREE.Object3D(); const ${id}Color = new THREE.Color();`);
      const place = {
        line: `const x = (i / (${id}N - 1) - 0.5) * W; ${id}Dummy.position.set(x, mirror ? 0 : h / 2, 0); ${id}Dummy.rotation.set(0, 0, 0);`,
        circle: `const a = i / ${id}N * Math.PI * 2; const r = W / 2 + (mirror ? 0 : h / 2); ${id}Dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); ${id}Dummy.rotation.set(0, 0, a - Math.PI / 2);`,
        arc: `const a = Math.PI * (1 - i / (${id}N - 1)); const r = W / 2 + (mirror ? 0 : h / 2); ${id}Dummy.position.set(Math.cos(a) * r, Math.sin(a) * r - W / 4, 0); ${id}Dummy.rotation.set(0, 0, a - Math.PI / 2);`,
      }[layout];
      transform(c, id);
      c.frame(`{
  const W = ${c.in('width')}; const H = ${c.in('height')}; const th = ${c.in('thickness')}; const keep = ${c.in('smoothing')}; const mirror = ${c.in('mirror')}; const usePalette = ${c.in('palette')};
  for (let i = 0; i < ${id}N; i++) {
    ${id}Level[i] = Math.max(spectrumAt(i / ${id}N), ${id}Level[i] * keep);
    const h = 0.02 + ${id}Level[i] * H;
    ${place}
    ${id}Dummy.scale.set(Math.max(0.005, (${layout === 'line' ? 'W' : 'W * Math.PI'} / ${id}N) * 0.7), h, th);
    ${id}Dummy.updateMatrix();
    ${id}.setMatrixAt(i, ${id}Dummy.matrix);
    ${id}.setColorAt(i, ${id}Color.set(usePalette ? paletteAt(i / ${id}N) : ${c.in('color')}));
  }
  ${id}.instanceMatrix.needsUpdate = true;
  ${id}.instanceColor.needsUpdate = true;
}`);
      return { obj: id };
    },
  });
  define({
    type: 'waveLine', title: 'Waveform line', category: 'Objects', color: '#ffd75e', idBase: 'waveform', desc: 'The sound wave as a glowing line, straight or in a circle', keywords: 'oscilloscope wave line scope',
    widgets: [SEL('layout', ['line', 'circle'], { label: 'Layout' })],
    inputs: [I('points', 512, 32, 2048), S('width', 10, 1, 30, { label: 'Width / radius' }), N('amplitude', 1.5, 0, 8), C('color', '#ffd75e'), N('opacity', 1, 0, 1), ...TRANSFORM()],
    outputs: [O('obj', 'obj', 'Line')],
    compile: (c) => {
      const id = c.id;
      c.setup(`const ${id}N = Math.round(${c.in('points')});
const ${id} = new THREE.${c.value('layout') === 'circle' ? 'LineLoop' : 'Line'}(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(${id}N * 3), 3)), new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending }));`);
      c.apply('color', (e) => `${id}.material.color.set(${e});`);
      c.apply('opacity', (e) => `${id}.material.opacity = ${e};`);
      transform(c, id);
      const place = c.value('layout') === 'circle'
        ? 'const a = i / N * Math.PI * 2; const r = W / 2 + v * A; p.setXYZ(i, Math.cos(a) * r, Math.sin(a) * r, 0);'
        : 'p.setXYZ(i, (i / (N - 1) - 0.5) * W, v * A, 0);';
      c.frame(`{
  const p = ${id}.geometry.attributes.position; const w = audio.waveform; const N = ${id}N; const W = ${c.in('width')}; const A = ${c.in('amplitude')};
  for (let i = 0; i < N; i++) { const v = w.length ? w[Math.floor(i / N * w.length)] : 0; ${place} }
  p.needsUpdate = true;
}`);
      return { obj: id };
    },
  });
  define({
    type: 'blob', title: 'Morphing blob', category: 'Objects', color: '#ffd75e', desc: 'A ball whose surface boils with noise; wire bass or a kick to Amount', keywords: 'organic morph noise sphere liquid',
    inputs: [SOCK('material', 'mat', { fallback: 'new THREE.MeshNormalMaterial()' }), S('radius', 1.5, 0.2, 6), I('detail', 96, 16, 256), N('amount', 0.35, 0, 2), N('speed', 0.6, 0, 4), N('frequency', 1.2, 0.1, 6, { label: 'Lumpiness' }), ...TRANSFORM()],
    outputs: [O('obj', 'obj', 'Blob')],
    compile: (c) => {
      const id = c.id;
      c.setup(`const ${id} = new THREE.Mesh(new THREE.SphereGeometry(${c.in('radius')}, Math.round(${c.in('detail')}), Math.round(${c.in('detail')} / 2)), ${c.in('material')});
const ${id}Base = ${id}.geometry.attributes.position.array.slice();`);
      transform(c, id);
      c.frame(`{
  const p = ${id}.geometry.attributes.position; const b = ${id}Base; const amt = ${c.in('amount')}; const f = ${c.in('frequency')}; const s = t * ${c.in('speed')};
  for (let i = 0; i < p.count; i++) {
    const x = b[i * 3], y = b[i * 3 + 1], z = b[i * 3 + 2];
    const k = 1 + amt * noise(x * f + s, y * f + s * 0.7, z * f - s * 0.4);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  p.needsUpdate = true;
  ${id}.geometry.computeVertexNormals();
}`);
      return { obj: id };
    },
  });
  define({
    type: 'wavePlane', title: 'Wave terrain', category: 'Objects', color: '#ffd75e', idBase: 'terrain', desc: 'A floor of rolling noise hills (wireframe by default) that rises with the music', keywords: 'landscape floor mountains synthwave retro grid',
    inputs: [SOCK('material', 'mat', { fallback: "new THREE.MeshBasicMaterial({ color: '#bd8bff', wireframe: true, transparent: true, opacity: 0.8 })" }), S('size', 30, 2, 120), I('segments', 80, 4, 256), N('height', 1.2, 0, 8), N('speed', 0.6, -4, 4), N('react', 1, 0, 4, { label: 'React' }), N('frequency', 0.18, 0.02, 1, { label: 'Hill size', hint: 'Smaller = wider hills' }), V('position', [0, -2, 0]), V('rotation', [0, 0, 0], { label: 'Rotation °', step: 1 }), N('scale', 1, 0.05, 5)],
    outputs: [O('obj', 'obj', 'Terrain')],
    compile: (c) => {
      const id = c.id;
      c.setup(`const ${id} = new THREE.Mesh(new THREE.PlaneGeometry(${c.in('size')}, ${c.in('size')}, Math.round(${c.in('segments')}), Math.round(${c.in('segments')})).rotateX(-Math.PI / 2), ${c.in('material')});
let ${id}Travel = 0;`);
      transform(c, id);
      c.frame(`{
  ${id}Travel += ${c.in('speed')} * dt;
  const p = ${id}.geometry.attributes.position; const f = ${c.in('frequency')}; const H = ${c.in('height')} * (1 + ${c.in('react')});
  for (let i = 0; i < p.count; i++) p.setY(i, noise(p.getX(i) * f, (p.getZ(i) - ${id}Travel) * f, t * 0.1) * H);
  p.needsUpdate = true;
}`);
      return { obj: id };
    },
  });
  define({
    type: 'imagePlane', title: 'Picture plane', category: 'Objects', color: '#ffd75e', idBase: 'screen', desc: 'A flat screen showing a picture or the video (keeps its shape)', keywords: 'image video screen billboard logo',
    inputs: [SOCK('map', 'tex', { label: 'Picture' }), S('width', 4, 0.2, 30), N('opacity', 1, 0, 1), B('additive', false, { label: 'Additive glow' }), ...TRANSFORM()],
    outputs: [O('obj', 'obj', 'Screen')],
    compile: (c) => {
      const id = c.id;
      const opts = ['transparent: true', ...mapOpt(c), ...matOpts(c, `${id}Mat`, [['opacity', 'opacity'], ['additive', '', 'blend']])];
      c.setup(`const ${id}Mat = new THREE.MeshBasicMaterial({ ${opts.join(', ')} });`);
      c.setup(`const ${id} = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ${id}Mat);`);
      transform(c, id, { skipScale: true });
      // sized every frame to the picture's own shape (known once it has loaded)
      c.frame(`{ const img = ${id}Mat.map?.image; const w = img?.videoWidth || img?.width; const h = img?.videoHeight || img?.height; const W = ${c.in('width')} * ${c.in('scale')}; ${id}.scale.set(W, w && h ? W * h / w : W * 9 / 16, 1); }`);
      return { obj: id };
    },
  });

  // ---------- Lights ----------
  define({ type: 'ambientLight', title: 'Ambient light', category: 'Lights', color: '#fff3b0', idBase: 'ambient', desc: 'Soft light from everywhere (fills shadows)', keywords: 'light fill',
    inputs: [C('color', '#ffffff'), N('intensity', 0.6, 0, 5)], outputs: [O('obj', 'obj', 'Light')],
    compile: (c) => { c.setup(`const ${c.id} = new THREE.AmbientLight();`); c.apply('color', (e) => `${c.id}.color.set(${e});`); c.apply('intensity', (e) => `${c.id}.intensity = ${e};`); return { obj: c.id }; } });
  define({ type: 'dirLight', title: 'Sun light', category: 'Lights', color: '#fff3b0', idBase: 'sun', desc: 'Parallel light from a direction, like the sun', keywords: 'directional light sun key',
    inputs: [C('color', '#ffffff'), N('intensity', 2, 0, 10), V('position', [3, 5, 4])], outputs: [O('obj', 'obj', 'Light')],
    compile: (c) => { c.setup(`const ${c.id} = new THREE.DirectionalLight();`); c.apply('color', (e) => `${c.id}.color.set(${e});`); c.apply('intensity', (e) => `${c.id}.intensity = ${e};`); (c.linked('position') ? c.frame : c.setup)(`${c.id}.position.set(${vecExpr(c, 'position')});`); return { obj: c.id }; } });
  define({ type: 'pointLight', title: 'Point light', category: 'Lights', color: '#fff3b0', idBase: 'lamp', desc: 'A bulb that lights everything around it; wire a kick to Intensity for flashes', keywords: 'bulb lamp light flash',
    inputs: [C('color', '#ff6b9d'), N('intensity', 30, 0, 300), S('distance', 0, 0, 100, { hint: '0 = no limit' }), V('position', [0, 2, 3])], outputs: [O('obj', 'obj', 'Light')],
    compile: (c) => { c.setup(`const ${c.id} = new THREE.PointLight('#ffffff', 1, ${c.in('distance')});`); c.apply('color', (e) => `${c.id}.color.set(${e});`); c.apply('intensity', (e) => `${c.id}.intensity = ${e};`); (c.linked('position') ? c.frame : c.setup)(`${c.id}.position.set(${vecExpr(c, 'position')});`); return { obj: c.id }; } });
  define({ type: 'hemiLight', title: 'Sky light', category: 'Lights', color: '#fff3b0', idBase: 'sky', desc: 'Sky color from above, ground color from below', keywords: 'hemisphere light',
    inputs: [C('sky', '#9ad7ff'), C('ground', '#2a1640'), N('intensity', 1, 0, 5)], outputs: [O('obj', 'obj', 'Light')],
    compile: (c) => { c.setup(`const ${c.id} = new THREE.HemisphereLight();`); c.apply('sky', (e) => `${c.id}.color.set(${e});`); c.apply('ground', (e) => `${c.id}.groundColor.set(${e});`); c.apply('intensity', (e) => `${c.id}.intensity = ${e};`); return { obj: c.id }; } });

  // ---------- Motion (object in → object out; they add on top of the object's own transform) ----------
  const motion = (o) => define({ category: 'Motion', color: '#ffb35e', motion: true, ...o, inputs: [SOCK('obj', 'obj', { label: 'Object', required: true }), ...o.inputs], outputs: [O('obj', 'obj', 'Object')],
    compile: (c) => { const obj = c.in('obj'); if (obj === 'undefined') return {}; o.body(c, obj); return { obj }; } });
  motion({ type: 'spin', title: 'Spin', desc: 'Keeps turning around an axis', keywords: 'rotate turn', widgets: [SEL('axis', ['y', 'x', 'z', 'all'], { label: 'Axis' })], inputs: [N('speed', 0.5, -6, 6)],
    body: (c, obj) => { c.setup(`let ${c.id}Angle = 0;`); c.frame(`${c.id}Angle += ${c.in('speed')} * dt;`); const ax = c.value('axis'); c.frame(ax === 'all' ? `${obj}.rotation.x += ${c.id}Angle * 0.7; ${obj}.rotation.y += ${c.id}Angle; ${obj}.rotation.z += ${c.id}Angle * 0.3;` : `${obj}.rotation.${ax} += ${c.id}Angle;`); } });
  motion({ type: 'pulse', title: 'Pulse', desc: 'Grows with a hit (wire a kick or the beat to Amount)', keywords: 'pump bump scale beat kick', inputs: [HIT('amount', { label: 'Amount' }), N('strength', 0.4, 0, 3)],
    body: (c, obj) => c.frame(`${obj}.scale.multiplyScalar(1 + ${c.in('amount')} * ${c.in('strength')});`) });
  motion({ type: 'move', title: 'Move', desc: 'Adds an offset (wire a vector, a circle path or an LFO)', keywords: 'translate offset position', inputs: [V('offset', [0, 0, 0])],
    body: (c, obj) => c.frame(`${obj}.position.add(new THREE.Vector3(${vecExpr(c, 'offset')}));`) });
  motion({ type: 'orbit', title: 'Orbit', desc: 'Circles around the center', keywords: 'circle around revolve', inputs: [N('radius', 2, 0, 20), N('speed', 0.5, -6, 6), N('phase', 0, 0, 1)],
    body: (c, obj) => c.frame(`{ const a = (t * ${c.in('speed')} + ${c.in('phase')}) * Math.PI * 2; ${obj}.position.x += Math.cos(a) * ${c.in('radius')}; ${obj}.position.z += Math.sin(a) * ${c.in('radius')}; }`) });
  motion({ type: 'bounce', title: 'Bounce', desc: 'Jumps up with a hit', keywords: 'jump hop kick', inputs: [HIT('amount', { label: 'Amount' }), N('height', 1, 0, 10)],
    body: (c, obj) => c.frame(`${obj}.position.y += ${c.in('amount')} * ${c.in('height')};`) });
  motion({ type: 'shake', title: 'Shake', desc: 'Jitters with a hit (camera-shake feeling for one object)', keywords: 'jitter vibrate', inputs: [HIT('amount', { label: 'Amount' }), N('strength', 0.3, 0, 3)],
    body: (c, obj) => c.frame(`{ const s = ${c.in('amount')} * ${c.in('strength')}; ${obj}.position.x += (Math.random() - 0.5) * s; ${obj}.position.y += (Math.random() - 0.5) * s; }`) });
  motion({ type: 'wobble', title: 'Wobble', desc: 'Sways back and forth smoothly', keywords: 'sway rock swing', inputs: [N('amount', 15, 0, 90, { label: 'Degrees' }), N('speed', 0.6, 0, 6)],
    body: (c, obj) => c.frame(`{ const a = THREE.MathUtils.degToRad(${c.in('amount')}); ${obj}.rotation.x += Math.sin(t * ${c.in('speed')} * Math.PI * 2) * a; ${obj}.rotation.z += Math.cos(t * ${c.in('speed')} * Math.PI * 1.3) * a * 0.6; }`) });
  motion({ type: 'tumble', title: 'Tumble on hit', desc: 'Turns a quarter (or any angle) on each hit, easing into place', keywords: 'flip rotate step kick', inputs: [HIT('hit', { label: 'Hit' }), N('degrees', 90, -360, 360), N('smooth', 10, 1, 40, { label: 'Snappiness' })],
    body: (c, obj) => { const e = edge(c, c.in('hit')); c.setup(`let ${c.id}Target = 0; let ${c.id}Now = 0;`); c.frame(`if (${e}) ${c.id}Target += THREE.MathUtils.degToRad(${c.in('degrees')});`); c.frame(`${c.id}Now = damp(${c.id}Now, ${c.id}Target, ${c.in('smooth')}, dt);`); c.frame(`${obj}.rotation.y += ${c.id}Now;`); } });
  motion({ type: 'visible', title: 'Show when', desc: 'Shows the object only while the value is above the threshold (strobes, sections)', keywords: 'hide visibility strobe', inputs: [N('value', 1, 0, 1), N('threshold', 0.5, 0, 1)],
    body: (c, obj) => c.frame(`${obj}.visible = ${c.in('value')} > ${c.in('threshold')};`) });
  motion({ type: 'faceCamera', title: 'Face the camera', desc: 'Always turns to face the camera (for screens, sprites, text)', keywords: 'billboard look', inputs: [],
    body: (c, obj) => c.frame(`${obj}.quaternion.copy(camera.quaternion);`) });
  motion({ type: 'transform', title: 'Place', desc: 'Sets position, rotation and scale (other motion nodes then add to it)', keywords: 'position rotation scale set', inputs: TRANSFORM(),
    body: (c, obj) => { c.frame(`${obj}.position.set(${vecExpr(c, 'position')});`); c.frame(`${obj}.rotation.set(${vecExpr(c, 'rotation', true)});`); c.frame(`${obj}.scale.setScalar(${c.in('scale')});`); } });

  // ---------- Camera ----------
  define({
    type: 'camera', title: 'Camera', category: 'Camera', color: '#c9b79c', desc: 'How the camera moves: still, orbiting, flying forward or drifting; with shake and zoom punches (wire hits)', keywords: 'view orbit fly fov zoom shake',
    widgets: [SEL('mode', ['still', 'orbit', 'drift', 'fly'], { label: 'Move' })],
    inputs: [N('fov', 50, 10, 120, { label: 'Lens (fov)', kind: 'knob' }), N('distance', 8, 1, 60), N('height', 0, -20, 20), N('speed', 0.15, -3, 3), HIT('shake'), N('shakeStrength', 0.25, 0, 2, { label: 'Shake amount' }), HIT('zoom', { label: 'Zoom punch' }), N('zoomStrength', 0.15, 0, 0.6, { label: 'Zoom amount' })],
    outputs: [O('cam', 'cam', 'Camera')],
    compile: (c) => {
      const mode = c.value('mode');
      c.setup(`const ${c.id}Target = new THREE.Vector3();`);
      c.frame(c.linked('zoom') ? `camera.fov = ${c.in('fov')} * (1 - ${c.in('zoom')} * ${c.in('zoomStrength')});` : `camera.fov = ${c.in('fov')};`);
      c.frame('camera.updateProjectionMatrix();');
      const d = c.in('distance'); const h = c.in('height'); const sp = c.in('speed');
      c.frame({
        still: `camera.position.set(0, ${h}, ${d});`,
        orbit: `camera.position.set(Math.sin(t * ${sp}) * ${d}, ${h}, Math.cos(t * ${sp}) * ${d});`,
        drift: `camera.position.set(Math.sin(t * ${sp}) * ${d} * 0.25, ${h} + Math.cos(t * ${sp} * 0.7) * ${d} * 0.12, ${d});`,
        fly: `camera.position.set(Math.sin(t * ${sp}) * 0.6, ${h} + Math.cos(t * ${sp} * 0.8) * 0.4, ${d});`,
      }[mode]);
      c.frame(`camera.lookAt(${c.id}Target);`);
      if (c.linked('shake')) c.frame(`{ const s = ${c.in('shake')} * ${c.in('shakeStrength')}; camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s; }`);
      return { cam: 'camera' };
    },
  });

  // ---------- Music ----------
  const music = (o) => define({ category: 'Music', color: '#ff6b9d', live: true, ...o });
  music({ type: 'levels', title: 'Music levels', idBase: 'music', desc: 'How loud the music is right now, overall and in the low, mid and high ranges (0..1)', keywords: 'audio bass mid treble volume loudness energy',
    inputs: [N('gain', 1, 0, 4, { kind: 'knob' })], outputs: [O('bass', 'num', 'Bass'), O('mid', 'num', 'Mids'), O('treble', 'num', 'Highs'), O('level', 'num', 'Level'), O('energy', 'num', 'Energy (1 s)'), O('peak', 'num', 'Peak (3 s)')],
    compile: (c) => { const g = c.in('gain'); const k = (e) => (g === '1' ? e : `(${e} * ${g})`); return { bass: k('audio.bass'), mid: k('audio.mid'), treble: k('audio.treble'), level: k('audio.level'), energy: k('audio.energy'), peak: 'audio.peak' }; } });
  music({ type: 'hits', title: 'Hits', desc: 'Kick, snare, hats and hits: 1 on each hit, fading in ~120 ms. From your hand-placed markers, else from ⚡ Triggers (kick falls back to the beat).', keywords: 'kick snare hat drum trigger marker onset',
    outputs: [O('kick', 'trig', 'Kick'), O('snare', 'trig', 'Snare'), O('hats', 'trig', 'Hats'), O('hit', 'trig', 'Hit'), O('bass', 'trig', 'Bass hit')],
    compile: () => ({ kick: '(audio.hits.kick.length ? audio.kick : audio.beat)', snare: 'audio.snare', hats: 'audio.hats', hit: 'audio.hit', bass: 'audio.bassHit' }) });
  music({ type: 'beat', title: 'Beat', desc: 'The beat grid: a pulse on each beat (or 8th / 16th), where you are in the beat and the bar', keywords: 'tempo bpm bar rhythm grid',
    widgets: [SEL('division', [{ value: '1', label: 'every beat' }, { value: '2', label: '8th notes' }, { value: '4', label: '16th notes' }, { value: '0.5', label: 'every 2 beats' }, { value: '0.25', label: 'every bar (4)' }], { label: 'Pulse' })],
    inputs: [N('sharpness', 6, 1, 20)], outputs: [O('pulse', 'trig', 'Pulse'), O('beat', 'trig', 'Beat'), O('phase', 'num', 'Beat phase'), O('barPhase', 'num', 'Bar phase'), O('beatInBar', 'num', 'Beat in bar'), O('bar', 'num', 'Bar')],
    compile: (c) => ({ pulse: `beatPulse(${Number(c.value('division')) || 1}, ${c.in('sharpness')})`, beat: 'audio.beat', phase: 'audio.beatPhase', barPhase: 'audio.barPhase', beatInBar: 'audio.beatInBar', bar: 'audio.bar' }) });
  music({ type: 'band', title: 'Frequency band', idBase: 'band', desc: 'Loudness of a frequency range in Hz (40–90 kick, 150–400 snare body, 6000+ hats)', keywords: 'hz range filter eq',
    inputs: [N('low', 40, 20, 16000, { label: 'From Hz', step: 10 }), N('high', 120, 20, 20000, { label: 'To Hz', step: 10 }), N('gain', 1.5, 0, 6)], outputs: [O('out', 'num', 'Level')],
    compile: (c) => ({ out: `Math.min(1, audio.band(${c.in('low')}, ${c.in('high')}) * ${c.in('gain')})` }) });
  music({ type: 'spectrumBin', title: 'Spectrum spot', idBase: 'spot', desc: 'The spectrum at one spot, 0 = lowest bass … 1 = highest treble', keywords: 'fft frequency',
    inputs: [N('position', 0.1, 0, 1), N('gain', 1, 0, 4)], outputs: [O('out', 'num', 'Level')],
    compile: (c) => { helper(c, 'spectrumAt'); return { out: `(spectrumAt(${c.in('position')}) * ${c.in('gain')})` }; } });
  music({ type: 'song', title: 'Song', desc: 'The song: time, how far through it is, tempo, playing, and whether it\'s a loud part', keywords: 'track time progress bpm section loud',
    outputs: [O('time', 'num', 'Time (s)'), O('progress', 'num', 'Progress'), O('bpm', 'num', 'BPM'), O('playing', 'bool', 'Playing'), O('loud', 'bool', 'Loud part'), O('intensity', 'num', 'Section 0..1')],
    compile: () => ({ time: 'audio.time', progress: '(audio.duration ? audio.time / audio.duration : 0)', bpm: 'audio.bpm', playing: 'audio.playing', loud: "(audio.section === 'loud')", intensity: "({ quiet: 0, medium: 0.5, loud: 1 }[audio.section] ?? 0.5)" }) });
  music({ type: 'cue', title: 'Song section', idBase: 'section', desc: 'Your named cues (Intro, Drop…): progress through the current one, its number, and whether it\'s the one you name here', keywords: 'cue section part drop chorus',
    widgets: [{ name: 'name', kind: 'text', value: 'Drop', label: 'Is it', slider: false }], outputs: [O('active', 'bool', 'Is it'), O('progress', 'num', 'Progress'), O('index', 'num', 'Number')],
    compile: (c) => ({ active: `(audio.cue?.name?.toLowerCase() === ${lit(String(c.value('name') || '').toLowerCase())})`, progress: '(audio.cue?.progress ?? 0)', index: '(audio.cue?.index ?? -1)' }) });
  music({ type: 'drop', title: 'Drop', desc: 'Build-up (0→1 over the seconds before a detected drop) and a flash fading after it', keywords: 'build riser drop',
    inputs: [N('buildSeconds', 8, 1, 32, { label: 'Build (s)' }), N('fade', 2, 0.1, 10, { label: 'After (s)' })], outputs: [O('build', 'num', 'Build-up'), O('after', 'trig', 'After drop')],
    compile: (c) => ({ build: `Math.max(0, 1 - audio.untilDrop / ${c.in('buildSeconds')})`, after: `Math.exp(-audio.sinceDrop / ${c.in('fade')})` }) });
  music({ type: 'everyBeats', title: 'Every N beats', idBase: 'every', desc: 'A pulse every few beats (2 = every other beat, 4 = each bar, 16 = every 4 bars)', keywords: 'bar phrase counter',
    inputs: [N('beats', 4, 1, 32, { step: 1 }), N('sharpness', 5, 1, 20)], outputs: [O('pulse', 'trig', 'Pulse'), O('phase', 'num', 'Phase')],
    compile: (c) => { helper(c, 'beatCount'); return { pulse: `Math.exp(-(beatCount() % ${c.in('beats')}) * ${c.in('sharpness')})`, phase: `((beatCount() % ${c.in('beats')}) / ${c.in('beats')})` }; } });
  define({ type: 'layerTime', title: 'Layer timing', category: 'Layer', color: '#c9b79c', live: true, desc: 'This layer\'s own time on the song (from its in point), its progress 0..1 and fade mix', keywords: 'in out intro outro fade',
    outputs: [O('time', 'num', 'Time (s)'), O('progress', 'num', 'Progress'), O('mix', 'num', 'Fade mix')],
    compile: () => ({ time: '(layer?.time ?? t)', progress: '(layer?.progress ?? 0)', mix: '(layer?.mix ?? 1)' }) });

  // ---------- Triggers (things that happen on hits) ----------
  const trigger = (o) => define({ category: 'Triggers', color: '#ff6a6a', live: true, ...o });
  trigger({ type: 'envelope', title: 'Hit envelope', idBase: 'env', desc: 'Jumps to 1 on each hit and falls back over Decay seconds (a clean flash from a noisy signal)', keywords: 'decay flash adsr',
    inputs: [HIT('hit', { label: 'Hit' }), N('decay', 0.25, 0.02, 3, { label: 'Decay (s)' })], outputs: [O('out', 'trig', 'Envelope')],
    compile: (c) => { const e = edge(c, c.in('hit')); c.setup(`let ${c.id} = 0;`); c.frame(`${c.id} = ${e} ? 1 : ${c.id} * Math.exp(-dt / ${c.in('decay')});`); return { out: c.id }; } });
  trigger({ type: 'counter', title: 'Hit counter', idBase: 'count', desc: 'Counts hits; Step goes 0, 1, 2… up to Steps-1 and around (cycle colors, positions, looks)', keywords: 'count step cycle sequence',
    inputs: [HIT('hit', { label: 'Hit' }), N('steps', 4, 1, 64, { step: 1 })], outputs: [O('count', 'num', 'Count'), O('step', 'num', 'Step'), O('phase', 'num', 'Step 0..1')],
    compile: (c) => { const e = edge(c, c.in('hit')); c.setup(`let ${c.id} = 0;`); c.frame(`if (${e}) ${c.id} += 1;`); const st = c.in('steps'); return { count: c.id, step: `(${c.id} % ${st})`, phase: `((${c.id} % ${st}) / Math.max(1, ${st} - 1))` }; } });
  trigger({ type: 'flipflop', title: 'Toggle on hit', idBase: 'toggle', desc: 'Flips on / off on each hit', keywords: 'switch alternate flip',
    inputs: [HIT('hit', { label: 'Hit' })], outputs: [O('out', 'bool', 'On'), O('num', 'num', '0 / 1')],
    compile: (c) => { const e = edge(c, c.in('hit')); c.setup(`let ${c.id} = false;`); c.frame(`if (${e}) ${c.id} = !${c.id};`); return { out: c.id, num: `(${c.id} ? 1 : 0)` }; } });
  trigger({ type: 'randomOnHit', title: 'Random on hit', idBase: 'pick', desc: 'A new random number between Min and Max on each hit (held until the next)', keywords: 'sample hold dice',
    inputs: [HIT('hit', { label: 'Hit' }), N('min', 0, -10, 10), N('max', 1, -10, 10)], outputs: [O('out', 'num', 'Value')],
    compile: (c) => { const e = edge(c, c.in('hit')); c.setup(`let ${c.id} = Math.random();`); c.frame(`if (${e}) ${c.id} = Math.random();`); return { out: `(${c.in('min')} + ${c.id} * (${c.in('max')} - ${c.in('min')}))` }; } });
  trigger({ type: 'threshold', title: 'Threshold', desc: 'Fires a hit when a value goes above the line (make hits from bass, a band or energy)', keywords: 'gate compare onset',
    inputs: [N('value', 0, 0, 1), N('threshold', 0.6, 0, 1)], outputs: [O('out', 'trig', 'Hit'), O('above', 'bool', 'Above')],
    compile: (c) => ({ out: `(${c.in('value')} > ${c.in('threshold')} ? 1 : 0)`, above: `(${c.in('value')} > ${c.in('threshold')})` }) });
  trigger({ type: 'sequence', title: 'Step sequence', idBase: 'seq', desc: 'Steps through a list of numbers, one per beat (or per hit when Hit is wired)', keywords: 'sequencer pattern list steps',
    inputs: [HIT('hit', { label: 'Hit' })], widgets: [{ name: 'values', kind: 'text', value: '1, 0.2, 0.6, 0.2', label: 'Values', slider: false }], outputs: [O('out', 'num', 'Value'), O('index', 'num', 'Step')],
    compile: (c) => {
      const vals = String(c.value('values') || '0').split(/[,\s]+/).map(Number).filter(Number.isFinite);
      c.setup(`const ${c.id}Values = ${lit(vals.length ? vals : [0])};`);
      if (c.linked('hit')) { const e = edge(c, c.in('hit')); c.setup(`let ${c.id}Step = 0;`); c.frame(`if (${e}) ${c.id}Step = (${c.id}Step + 1) % ${c.id}Values.length;`); } else { helper(c, 'beatCount'); c.setup(`let ${c.id}Step = 0;`); c.frame(`${c.id}Step = Math.floor(beatCount()) % ${c.id}Values.length;`); }
      return { out: `${c.id}Values[${c.id}Step]`, index: `${c.id}Step` };
    } });
  trigger({ type: 'hold', title: 'Hold after hit', idBase: 'hold', desc: 'On for a few seconds after each hit (keep a strobe or a color for a moment)', keywords: 'sustain timer gate',
    inputs: [HIT('hit', { label: 'Hit' }), N('seconds', 0.5, 0.02, 8)], outputs: [O('out', 'bool', 'On'), O('left', 'num', 'Time left 0..1')],
    compile: (c) => { const e = edge(c, c.in('hit')); c.setup(`let ${c.id}Until = -1;`); c.frame(`if (${e}) ${c.id}Until = t + ${c.in('seconds')};`); return { out: `(t < ${c.id}Until)`, left: `Math.max(0, (${c.id}Until - t) / ${c.in('seconds')})` }; } });

  // ---------- Time ----------
  const time = (o) => define({ category: 'Time', color: '#7ad0ff', live: true, ...o });
  time({ type: 'time', title: 'Time', desc: 'Seconds since the sketch started (times Speed), the song time, the frame time and beats', keywords: 'clock seconds elapsed',
    inputs: [N('speed', 1, -4, 4)], outputs: [O('time', 'num', 'Time'), O('song', 'num', 'Song time'), O('delta', 'num', 'Frame time'), O('beats', 'num', 'Beats')],
    compile: (c) => { helper(c, 'beatCount'); return { time: c.in('speed') === '1' ? 't' : `(t * ${c.in('speed')})`, song: 'audio.time', delta: 'dt', beats: 'beatCount()' }; } });
  time({ type: 'lfo', title: 'LFO wave', idBase: 'lfo', desc: 'A repeating wave (sine, triangle, saw, square) at a rate in Hz, or in beats when Sync is on', keywords: 'oscillator wave sine saw triangle square cycle',
    widgets: [SEL('shape', ['sine', 'triangle', 'saw', 'square'], { label: 'Shape' })],
    inputs: [N('rate', 0.5, 0.01, 8, { label: 'Rate' }), B('sync', false, { label: 'In beats', hint: 'On: Rate = cycles per beat (0.25 = once a bar)' }), N('amplitude', 1, 0, 10), N('offset', 0, -10, 10)], outputs: [O('out', 'num', 'Wave')],
    compile: (c) => {
      helper(c, 'beatCount');
      const ph = `(${c.in('sync')} ? beatCount() : t) * ${c.in('rate')}`;
      const w = { sine: `wave(${ph})`, triangle: `pingpong(${ph})`, saw: `fract(${ph})`, square: `(fract(${ph}) < 0.5 ? 1 : 0)` }[c.value('shape')];
      return { out: `(${c.in('offset')} + ${c.in('amplitude')} * ${w})` };
    } });
  time({ type: 'noiseWave', title: 'Noise', idBase: 'noise', desc: 'Smooth random wandering (Perlin noise), -1..1 or 0..1', keywords: 'perlin random smooth wander organic',
    inputs: [N('speed', 0.5, 0, 6), N('seed', 1, 0, 100, { step: 1 }), N('amplitude', 1, 0, 10), B('positive', true, { label: '0..1' })], outputs: [O('out', 'num', 'Value')],
    compile: (c) => ({ out: `(${c.in('amplitude')} * (${c.in('positive')} ? 0.5 + 0.5 * noise(t * ${c.in('speed')}, ${c.in('seed')} * 7.13) : noise(t * ${c.in('speed')}, ${c.in('seed')} * 7.13)))` }) });
  time({ type: 'ramp', title: 'Ramp', desc: 'Goes 0 → 1 over Seconds, then starts again', keywords: 'loop timer progress', inputs: [N('seconds', 4, 0.1, 60)], outputs: [O('out', 'num', 'Ramp')],
    compile: (c) => ({ out: `fract(t / ${c.in('seconds')})` }) });
  define({ type: 'random', title: 'Random number', category: 'Math', color: '#48ddff', desc: 'A random number between Min and Max, the same every run for the same seed', keywords: 'seed constant dice',
    inputs: [N('seed', 1, 0, 999, { step: 1 }), N('min', 0, -100, 100), N('max', 1, -100, 100)], outputs: [O('out', 'num', 'Value')],
    compile: (c) => { c.setup(`const ${c.id} = seeded(${c.in('seed')})();`); return { out: `(${c.in('min')} + ${c.id} * (${c.in('max')} - ${c.in('min')}))` }; } });

  // ---------- Math ----------
  const math = (o) => define({ category: 'Math', color: '#48ddff', ...o });
  math({ type: 'number', title: 'Number', idBase: 'num', desc: 'A number (a slider in the Lab)', keywords: 'value constant', inputs: [N('value', 1, -10, 10)], outputs: [O('out', 'num', 'Value')], compile: (c) => ({ out: c.in('value') }) });
  const OPS = { add: '+', subtract: '−', multiply: '×', divide: '÷', min: 'min', max: 'max', power: 'pow', modulo: 'mod' };
  const opExpr = (op, a, b) => ({ add: `(${a} + ${b})`, subtract: `(${a} - ${b})`, multiply: `(${a} * ${b})`, divide: `(${a} / (${b} || 1e-6))`, min: `Math.min(${a}, ${b})`, max: `Math.max(${a}, ${b})`, power: `Math.pow(${a}, ${b})`, modulo: `(((${a} % ${b}) + ${b}) % ${b})` }[op]);
  math({ type: 'math', title: 'Math', desc: 'a + − × ÷ min max pow mod b', keywords: 'arithmetic operation', widgets: [SEL('op', Object.keys(OPS).map((k) => ({ value: k, label: `${OPS[k]} ${k}` })), { label: 'Operation' })],
    inputs: [N('a', 0, -10, 10), N('b', 1, -10, 10)], outputs: [O('out', 'num', 'Result')], compile: (c) => ({ out: opExpr(c.value('op'), c.in('a'), c.in('b')) }) });
  math({ type: 'add', title: 'Add', desc: 'a + b', keywords: 'plus sum', inputs: [N('a', 0, -10, 10), N('b', 0, -10, 10)], outputs: [O('out', 'num', 'Sum')], compile: (c) => ({ out: `(${c.in('a')} + ${c.in('b')})` }) });
  math({ type: 'multiply', title: 'Multiply', desc: 'a × b (scale a music value by a slider)', keywords: 'times scale gain', inputs: [N('a', 1, -10, 10), N('b', 1, -10, 10)], outputs: [O('out', 'num', 'Product')], compile: (c) => ({ out: `(${c.in('a')} * ${c.in('b')})` }) });
  math({ type: 'mix', title: 'Mix', desc: 'Blend from A to B by T (0 = A, 1 = B)', keywords: 'lerp blend interpolate crossfade', inputs: [N('a', 0, -10, 10), N('b', 1, -10, 10), N('t', 0.5, 0, 1)], outputs: [O('out', 'num', 'Value')], compile: (c) => ({ out: `mix(${c.in('a')}, ${c.in('b')}, ${c.in('t')})` }) });
  math({ type: 'remap', title: 'Remap', desc: 'Maps a value from one range to another (e.g. bass 0..1 → size 1..3)', keywords: 'map range scale fit', inputs: [N('value', 0, -10, 10), N('inMin', 0, -10, 10, { label: 'From min', slider: false }), N('inMax', 1, -10, 10, { label: 'From max', slider: false }), N('outMin', 0, -100, 100, { label: 'To min' }), N('outMax', 1, -100, 100, { label: 'To max' }), B('clamp', true, { slider: false })], outputs: [O('out', 'num', 'Value')],
    compile: (c) => ({ out: `map(${c.in('value')}, ${c.in('inMin')}, ${c.in('inMax')}, ${c.in('outMin')}, ${c.in('outMax')}, ${c.in('clamp')})` }) });
  math({ type: 'clamp', title: 'Clamp', desc: 'Keeps a value between Min and Max', keywords: 'limit', inputs: [N('value', 0, -10, 10), N('min', 0, -10, 10), N('max', 1, -10, 10)], outputs: [O('out', 'num', 'Value')], compile: (c) => ({ out: `clamp(${c.in('value')}, ${c.in('min')}, ${c.in('max')})` }) });
  const FNS = { sin: 'Math.sin(x)', cos: 'Math.cos(x)', abs: 'Math.abs(x)', floor: 'Math.floor(x)', round: 'Math.round(x)', fract: 'fract(x)', sqrt: 'Math.sqrt(Math.max(0, x))', square: 'x * x', exp: 'Math.exp(x)', oneMinus: '(1 - x)', negate: '(-x)', sign: 'Math.sign(x)' };
  math({ type: 'func', title: 'Function', desc: 'sin, cos, abs, floor, round, fract, sqrt, square, exp, 1 − x…', keywords: 'sin cos abs floor', widgets: [SEL('fn', Object.keys(FNS), { label: 'Function' })], inputs: [N('x', 0, -10, 10)], outputs: [O('out', 'num', 'Result')],
    compile: (c) => ({ out: `(${FNS[c.value('fn')].replace(/\bx\b/g, `(${c.in('x')})`)})` }) });
  math({ type: 'compare', title: 'Compare', desc: 'Is A bigger / smaller / equal to B? (on / off)', keywords: 'if greater less condition', widgets: [SEL('op', ['>', '<', '>=', '<=', '==', '!='], { label: 'Test' })], inputs: [N('a', 0, -10, 10), N('b', 0.5, -10, 10)], outputs: [O('out', 'bool', 'True')],
    compile: (c) => ({ out: `(${c.in('a')} ${{ '==': '===', '!=': '!==' }[c.value('op')] || c.value('op')} ${c.in('b')})` }) });
  math({ type: 'switch', title: 'Choose', desc: 'A when the switch is on, else B', keywords: 'if select condition ternary', inputs: [B('when', true, { label: 'Switch' }), N('a', 1, -10, 10), N('b', 0, -10, 10)], outputs: [O('out', 'num', 'Value')], compile: (c) => ({ out: `(${c.in('when')} ? ${c.in('a')} : ${c.in('b')})` }) });
  math({ type: 'expression', title: 'Expression', idBase: 'expr', desc: 'Your own formula with a, b, c (also t, dt, audio, Math, noise, mix…)', keywords: 'formula code custom javascript',
    inputs: [N('a', 0, -10, 10, { slider: false }), N('b', 0, -10, 10, { slider: false }), N('c', 0, -10, 10, { slider: false })], widgets: [{ name: 'expr', kind: 'text', value: 'a * 2 + Math.sin(t)', label: 'Formula', slider: false }], outputs: [O('out', 'num', 'Result')],
    compile: (c) => { const f = String(c.value('expr') || '0').replace(/[;{}`]/g, ''); return { out: `((a, b, c) => (${f}))(${c.in('a')}, ${c.in('b')}, ${c.in('c')})` }; } });
  math({ type: 'smooth', title: 'Smooth', live: true, desc: 'Follows a value smoothly (higher Speed = snappier). Calms jumpy music values.', keywords: 'damp lerp ease follow lowpass',
    inputs: [N('value', 0, 0, 1), N('speed', 6, 0.1, 40)], outputs: [O('out', 'num', 'Smooth')],
    compile: (c) => { c.setup(`let ${c.id} = 0;`); c.frame(`${c.id} = damp(${c.id}, ${c.in('value')}, ${c.in('speed')}, dt);`); return { out: c.id }; } });
  math({ type: 'peak', title: 'Pump', live: true, desc: 'Jumps up with the value and falls back slowly (the classic "pump" on kicks)', keywords: 'peak hold decay release envelope follower',
    inputs: [N('value', 0, 0, 1), N('release', 0.88, 0.5, 0.995, { label: 'Hold', hint: 'Higher = falls back slower' })], outputs: [O('out', 'trig', 'Pump')],
    compile: (c) => { c.setup(`let ${c.id} = 0;`); c.frame(`${c.id} = Math.max(${c.id} * Math.pow(${c.in('release')}, dt * 60), ${c.in('value')});`); return { out: c.id }; } });
  math({ type: 'spring', title: 'Spring', live: true, desc: 'Follows a value with a bouncy overshoot (jelly motion)', keywords: 'bounce elastic jelly physics',
    inputs: [N('value', 0, -10, 10), N('stiffness', 120, 5, 600), N('damping', 8, 0.5, 40)], outputs: [O('out', 'num', 'Spring')],
    compile: (c) => { c.setup(`let ${c.id} = 0; let ${c.id}Vel = 0;`); c.frame(`for (let left = dt; left > 1e-6; left -= 1 / 120) { const h = Math.min(left, 1 / 120); ${c.id}Vel += ((${c.in('value')} - ${c.id}) * ${c.in('stiffness')} - ${c.id}Vel * ${c.in('damping')}) * h; ${c.id} += ${c.id}Vel * h; } // small steps: stable at any frame rate`); return { out: c.id }; } });
  math({ type: 'ease', title: 'Ease curve', desc: 'Shapes a 0..1 value with an easing curve (out back, elastic, bounce…)', keywords: 'easing curve tween',
    inputs: [N('t', 0.5, 0, 1)], widgets: [{ name: 'curve', kind: 'curve', value: 'outCubic', label: 'Curve', slider: false }], outputs: [O('out', 'num', 'Eased')],
    compile: (c) => ({ out: `ease.${c.value('curve') in NodeView.EASES ? c.value('curve') : 'linear'}(clamp(${c.in('t')}))` }) });
  math({ type: 'smoothstep', title: 'Soft step', desc: '0 below Edge 0, 1 above Edge 1, smooth between', keywords: 'smoothstep threshold soft', inputs: [N('value', 0, 0, 1), N('edge0', 0.2, 0, 1, { label: 'Edge 0' }), N('edge1', 0.8, 0, 1, { label: 'Edge 1' })], outputs: [O('out', 'num', 'Value')],
    compile: (c) => ({ out: `smoothstep(${c.in('edge0')}, ${c.in('edge1')}, ${c.in('value')})` }) });
  math({ type: 'quantize', title: 'Snap to steps', idBase: 'steps', desc: 'Rounds to steps of a size (stepped, robotic motion)', keywords: 'snap round quantize', inputs: [N('value', 0, -10, 10), N('step', 0.25, 0.01, 5)], outputs: [O('out', 'num', 'Value')], compile: (c) => ({ out: `snap(${c.in('value')}, ${c.in('step')})` }) });

  // ---------- Vectors ----------
  const vecs = (o) => define({ category: 'Vectors', color: '#bd8bff', ...o });
  vecs({ type: 'vector', title: 'Vector', idBase: 'vec', desc: 'x, y, z into a position / direction', keywords: 'xyz combine position', inputs: [N('x', 0, -10, 10), N('y', 0, -10, 10), N('z', 0, -10, 10)], outputs: [O('out', 'vec3', 'Vector')], compile: (c) => ({ out: `[${c.in('x')}, ${c.in('y')}, ${c.in('z')}]` }) });
  vecs({ type: 'split', title: 'Split vector', desc: 'A vector into x, y, z', keywords: 'separate xyz', inputs: [V('v', [0, 0, 0], { label: 'Vector' })], outputs: [O('x', 'num', 'x'), O('y', 'num', 'y'), O('z', 'num', 'z')],
    compile: (c) => { const v = c.linked('v') ? c.in('v') : `[${vecExpr(c, 'v')}]`; return { x: `${v}[0]`, y: `${v}[1]`, z: `${v}[2]` }; } });
  vecs({ type: 'circlePath', title: 'Circle path', idBase: 'path', desc: 'A point going around a circle (or a figure 8) over time', keywords: 'orbit around lissajous figure eight', widgets: [SEL('shape', ['circle', 'figure 8', 'spiral'], { label: 'Path' })], inputs: [N('radius', 2, 0, 20), N('speed', 0.3, -4, 4)], outputs: [O('out', 'vec3', 'Point')],
    compile: (c) => { const a = `(t * ${c.in('speed')} * Math.PI * 2)`; const r = c.in('radius'); return { out: { circle: `[Math.cos(${a}) * ${r}, Math.sin(${a}) * ${r}, 0]`, 'figure 8': `[Math.sin(${a}) * ${r}, Math.sin(${a} * 2) * ${r} * 0.5, 0]`, spiral: `[Math.cos(${a}) * ${r} * fract(t * 0.1), Math.sin(${a}) * ${r} * fract(t * 0.1), 0]` }[c.value('shape')] }; } });
  vecs({ type: 'vecMath', title: 'Vector math', desc: 'A + B, A − B or A × number', keywords: 'add subtract scale', widgets: [SEL('op', ['add', 'subtract', 'scale'], { label: 'Operation' })], inputs: [V('a', [0, 0, 0], { label: 'A' }), V('b', [0, 0, 0], { label: 'B' }), N('s', 1, -10, 10, { label: 'Number' })], outputs: [O('out', 'vec3', 'Vector')],
    compile: (c) => { const a = c.linked('a') ? c.in('a') : `[${vecExpr(c, 'a')}]`; const b = c.linked('b') ? c.in('b') : `[${vecExpr(c, 'b')}]`; const s = c.in('s'); return { out: { add: `${a}.map((x, i) => x + ${b}[i])`, subtract: `${a}.map((x, i) => x - ${b}[i])`, scale: `${a}.map((x) => x * ${s})` }[c.value('op')] }; } });

  // ---------- Colors ----------
  const PALETTES = {
    'sketch palette': null, forgeheart: ['#ffd75e', '#ff8c42', '#ff6a6a', '#bd8bff', '#48ddff'], neon: ['#ff2bd6', '#00f0ff', '#7cff4f', '#fff200'], sunset: ['#ffb86b', '#ff6b6b', '#c94b8b', '#5b2a86'],
    ocean: ['#0b3d91', '#1e81b0', '#48ddff', '#b9f3ff'], vapor: ['#ff71ce', '#01cdfe', '#05ffa1', '#b967ff', '#fffb96'], fire: ['#ffef9f', '#ffb000', '#ff5f00', '#c1121f'], ice: ['#e0fbfc', '#98c1d9', '#3d5a80', '#293241'],
    acid: ['#d4ff00', '#00ff9c', '#ff00e6', '#1a1aff'], pastel: ['#ffd6e0', '#c1fba4', '#7bf1a8', '#90f1ef', '#ffef9f'], mono: ['#ffffff', '#9a9187', '#2b2a26'], gold: ['#fff1b0', '#ffd75e', '#c9a227', '#7a5c00'],
  };
  const colors = (o) => define({ category: 'Colors', color: '#ff6b9d', ...o });
  colors({ type: 'color', title: 'Color', idBase: 'color', desc: 'A color (a color slider in the Lab)', keywords: 'hex swatch', inputs: [C('color', '#ff6b9d')], outputs: [O('out', 'color', 'Color')], compile: (c) => ({ out: c.in('color') }) });
  colors({ type: 'palette', title: 'Palette', desc: 'A color along a palette (the sketch\'s palette from References, or a preset): wire a time, a counter or the spectrum to Position', keywords: 'colors scheme gradient theme coolors',
    widgets: [SEL('palette', Object.keys(PALETTES), { label: 'Palette' }), { name: 'custom', kind: 'text', value: '', label: 'Own colors', placeholder: '#hex, #hex…', slider: false }],
    inputs: [N('position', 0, 0, 1), N('drift', 0.03, -1, 1, { label: 'Drift / s', hint: 'Slowly moves along the palette over time' })], outputs: [O('out', 'color', 'Color')],
    compile: (c) => {
      helper(c, 'paletteColor');
      const own = String(c.value('custom') || '').match(/#[0-9a-f]{6}/gi);
      const cols = own?.length ? own : PALETTES[c.value('palette')];
      const list = cols ? lit(cols) : "(palette.length ? palette : ['#48ddff', '#bd8bff', '#ff6b9d', '#ffd75e'])";
      if (cols) c.setup(`const ${c.id}Colors = ${list};`);
      return { out: `paletteColor(${cols ? `${c.id}Colors` : list}, ${c.in('position')} + t * ${c.in('drift')})` };
    } });
  colors({ type: 'hsl', title: 'Hue / saturation / lightness', idBase: 'hsl', desc: 'A color from hue (0..360), saturation and lightness (0..1): wire music to hue for color shifts', keywords: 'hsv hue', inputs: [N('hue', 200, 0, 360), N('saturation', 0.9, 0, 1), N('lightness', 0.6, 0, 1)], outputs: [O('out', 'color', 'Color')],
    compile: (c) => ({ out: `hsl(((${c.in('hue')} % 360) + 360) % 360, ${c.in('saturation')}, ${c.in('lightness')})` }) });
  colors({ type: 'mixColors', title: 'Mix colors', idBase: 'blend', desc: 'Blends from color A to B by T (wire a kick for color flashes)', keywords: 'lerp blend flash', inputs: [C('a', '#1b0f3b', { label: 'A' }), C('b', '#ffffff', { label: 'B' }), N('t', 0, 0, 1)], outputs: [O('out', 'color', 'Color')],
    compile: (c) => { helper(c, 'mixColor'); return { out: `mixColor(${c.in('a')}, ${c.in('b')}, ${c.in('t')})` }; } });
  colors({ type: 'hueShift', title: 'Shift hue', desc: 'Turns a color around the color wheel (turns 0..1) and lightens / darkens it', keywords: 'rotate hue lighten darken', inputs: [C('color', '#48ddff'), N('turns', 0, -1, 1), N('lighten', 0, -0.5, 0.5)], outputs: [O('out', 'color', 'Color')],
    compile: (c) => { helper(c, 'shiftColor'); return { out: `shiftColor(${c.in('color')}, ${c.in('turns')}, ${c.in('lighten')})` }; } });
  colors({ type: 'rainbow', title: 'Rainbow cycle', live: true, desc: 'A color cycling around the color wheel', keywords: 'cycle hue rotate disco', inputs: [N('speed', 0.1, -2, 2, { label: 'Turns / s' }), N('saturation', 0.85, 0, 1), N('lightness', 0.6, 0, 1), N('offset', 0, 0, 1)], outputs: [O('out', 'color', 'Color')],
    compile: (c) => ({ out: `hsl(fract(t * ${c.in('speed')} + ${c.in('offset')}) * 360, ${c.in('saturation')}, ${c.in('lightness')})` }) });
  colors({ type: 'colorOnHit', title: 'Next color on hit', idBase: 'colorStep', live: true, desc: 'Jumps to the next palette color on each hit', keywords: 'cycle switch palette kick', widgets: [SEL('palette', Object.keys(PALETTES), { label: 'Palette' })], inputs: [HIT('hit', { label: 'Hit' })], outputs: [O('out', 'color', 'Color')],
    compile: (c) => { const e = edge(c, c.in('hit')); const cols = PALETTES[c.value('palette')]; c.setup(`const ${c.id}Colors = ${cols ? lit(cols) : "palette.length ? palette : ['#48ddff', '#bd8bff', '#ff6b9d', '#ffd75e']"}; let ${c.id}Index = 0;`); c.frame(`if (${e}) ${c.id}Index = (${c.id}Index + 1) % ${c.id}Colors.length;`); return { out: `${c.id}Colors[${c.id}Index]` }; } });

  // ---------- Sliders (your own named knobs in the Lab) ----------
  define({ type: 'slider', title: 'Slider', category: 'Sliders', color: '#ffd75e', desc: 'Your own named slider in the Lab\'s sliders panel (label, range and group are yours)', keywords: 'tweak knob control parameter',
    widgets: [{ name: 'label', kind: 'text', value: 'Amount', label: 'Label', slider: false }, { name: 'group', kind: 'text', value: 'Controls', label: 'Group', slider: false }, N('min', 0, -100, 100, { slider: false, label: 'Min' }), N('max', 1, -100, 100, { slider: false, label: 'Max' })],
    inputs: [N('value', 0.5, 0, 1, { label: 'Value', minFrom: 'min', maxFrom: 'max', labelFrom: 'label', groupFrom: 'group' })], outputs: [O('out', 'num', 'Value')], compile: (c) => ({ out: c.in('value') }) });
  define({ type: 'colorSlider', title: 'Color slider', category: 'Sliders', color: '#ffd75e', desc: 'Your own named color in the Lab\'s sliders panel', keywords: 'tweak swatch control',
    widgets: [{ name: 'label', kind: 'text', value: 'Main color', label: 'Label', slider: false }, { name: 'group', kind: 'text', value: 'Colors', label: 'Group', slider: false }],
    inputs: [C('value', '#48ddff', { label: 'Color', labelFrom: 'label', groupFrom: 'group' })], outputs: [O('out', 'color', 'Color')], compile: (c) => ({ out: c.in('value') }) });
  define({ type: 'switchSlider', title: 'Switch', category: 'Sliders', color: '#ffd75e', desc: 'Your own named on / off switch in the Lab\'s sliders panel', keywords: 'toggle checkbox tweak',
    widgets: [{ name: 'label', kind: 'text', value: 'Effect on', label: 'Label', slider: false }, { name: 'group', kind: 'text', value: 'Controls', label: 'Group', slider: false }],
    inputs: [B('value', true, { label: 'On', labelFrom: 'label', groupFrom: 'group' })], outputs: [O('out', 'bool', 'On'), O('num', 'num', '0 / 1')], compile: (c) => ({ out: c.in('value'), num: `(${c.in('value')} ? 1 : 0)` }) });

  // ---------- Post effects (EffectComposer passes, applied to this layer) ----------
  const post = (o) => define({ category: 'Post', color: '#f5a3d0', ...o, outputs: [O('pass', 'pass', 'Effect')] });
  const passSet = (c, id, list) => { for (const [f, target] of list) if (c.dyn(f)) c.frame(`${id}.${target} = ${c.in(f)};`); };
  post({ type: 'bloom', title: 'Bloom', desc: 'Glow around bright things (wire a kick to Strength for flashes)', keywords: 'glow unreal bright', inputs: [N('strength', 0.8, 0, 4, { kind: 'knob' }), N('radius', 0.4, 0, 1.5, { kind: 'knob' }), N('threshold', 0.5, 0, 1, { kind: 'knob', hint: 'Only things brighter than this glow' })],
    compile: (c) => { c.import('UnrealBloomPass', 'three/addons/postprocessing/UnrealBloomPass.js'); c.setup(`const ${c.id} = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), ${c.in('strength')}, ${c.in('radius')}, ${c.in('threshold')});`); passSet(c, c.id, [['strength', 'strength'], ['radius', 'radius'], ['threshold', 'threshold']]); return { pass: c.id }; } });
  post({ type: 'afterimage', title: 'Trails', desc: 'Motion trails: each frame keeps a ghost of the last ones', keywords: 'afterimage echo ghost feedback smear', inputs: [N('length', 0.88, 0, 0.99, { label: 'Trail length', kind: 'knob' })],
    compile: (c) => { c.import('AfterimagePass', 'three/addons/postprocessing/AfterimagePass.js'); c.setup(`const ${c.id} = new AfterimagePass(${c.in('length')});`); if (c.dyn('length')) c.frame(`${c.id}.uniforms.damp.value = ${c.in('length')};`); return { pass: c.id }; } });
  post({ type: 'rgbShift', title: 'RGB split', desc: 'Red / blue color fringes (chromatic aberration); wire a hit to Amount', keywords: 'chromatic aberration glitch fringe', inputs: [N('amount', 0.003, 0, 0.03, { step: 0.0005 }), N('angle', 0, 0, 360)],
    compile: (c) => { c.import('ShaderPass', 'three/addons/postprocessing/ShaderPass.js'); c.import('RGBShiftShader', 'three/addons/shaders/RGBShiftShader.js'); c.setup(`const ${c.id} = new ShaderPass(RGBShiftShader);`); c.apply('amount', (e) => `${c.id}.uniforms.amount.value = ${e};`); c.apply('angle', (e) => `${c.id}.uniforms.angle.value = THREE.MathUtils.degToRad(${e});`); return { pass: c.id }; } });
  post({ type: 'film', title: 'Film grain', desc: 'Noise and grain like film', keywords: 'noise grain analog', inputs: [N('intensity', 0.4, 0, 2), B('grayscale', false, { label: 'Black & white' })],
    compile: (c) => { c.import('FilmPass', 'three/addons/postprocessing/FilmPass.js'); c.setup(`const ${c.id} = new FilmPass(${c.in('intensity')}, ${c.in('grayscale')});`); if (c.dyn('intensity')) c.frame(`${c.id}.uniforms.intensity.value = ${c.in('intensity')};`); if (c.dyn('grayscale')) c.frame(`${c.id}.uniforms.grayscale.value = ${c.in('grayscale')};`); return { pass: c.id }; } });
  post({ type: 'dotScreen', title: 'Dot screen', desc: 'Black and white printed dots', keywords: 'halftone print comic', inputs: [N('scale', 1.2, 0.2, 4), N('angle', 30, 0, 180)],
    compile: (c) => { c.import('DotScreenPass', 'three/addons/postprocessing/DotScreenPass.js'); c.setup(`const ${c.id} = new DotScreenPass(new THREE.Vector2(0, 0), THREE.MathUtils.degToRad(${c.in('angle')}), ${c.in('scale')});`); if (c.dyn('scale')) c.frame(`${c.id}.uniforms.scale.value = ${c.in('scale')};`); if (c.dyn('angle')) c.frame(`${c.id}.uniforms.angle.value = THREE.MathUtils.degToRad(${c.in('angle')});`); return { pass: c.id }; } });
  post({ type: 'vignette', title: 'Vignette', desc: 'Darker corners that pull the eye to the middle', keywords: 'corners dark frame', inputs: [N('offset', 1, 0, 2, { label: 'Size' }), N('darkness', 1.2, 0, 3)],
    compile: (c) => { c.import('ShaderPass', 'three/addons/postprocessing/ShaderPass.js'); c.import('VignetteShader', 'three/addons/shaders/VignetteShader.js'); c.setup(`const ${c.id} = new ShaderPass(VignetteShader);`); c.apply('offset', (e) => `${c.id}.uniforms.offset.value = ${e};`); c.apply('darkness', (e) => `${c.id}.uniforms.darkness.value = ${e};`); return { pass: c.id }; } });
  post({ type: 'kaleido', title: 'Kaleidoscope', desc: 'Mirrors the picture into segments around the center', keywords: 'mirror symmetry mandala', inputs: [N('sides', 6, 2, 24, { step: 1 }), N('angle', 0, 0, 360)],
    compile: (c) => { c.import('ShaderPass', 'three/addons/postprocessing/ShaderPass.js'); c.import('KaleidoShader', 'three/addons/shaders/KaleidoShader.js'); c.setup(`const ${c.id} = new ShaderPass(KaleidoShader);`); c.apply('sides', (e) => `${c.id}.uniforms.sides.value = ${e};`); c.apply('angle', (e) => `${c.id}.uniforms.angle.value = THREE.MathUtils.degToRad(${e});`); return { pass: c.id }; } });
  post({ type: 'glitch', title: 'Glitch burst', desc: 'Digital glitch; goes wild while Hit is high (wire a snare or the drop)', keywords: 'digital corrupt', inputs: [HIT('hit', { label: 'Go wild' })],
    compile: (c) => { c.import('GlitchPass', 'three/addons/postprocessing/GlitchPass.js'); c.setup(`const ${c.id} = new GlitchPass();`); c.frame(`${c.id}.enabled = ${c.in('hit')} > 0.3;`); c.frame(`${c.id}.goWild = ${c.in('hit')} > 0.6;`); return { pass: c.id }; } });
  post({ type: 'hueSat', title: 'Hue / saturation', idBase: 'grade', desc: 'Turns all colors around the wheel and boosts or drains color', keywords: 'grade color correction saturate', inputs: [N('hue', 0, -1, 1), N('saturation', 0, -1, 1)],
    compile: (c) => { c.import('ShaderPass', 'three/addons/postprocessing/ShaderPass.js'); c.import('HueSaturationShader', 'three/addons/shaders/HueSaturationShader.js'); c.setup(`const ${c.id} = new ShaderPass(HueSaturationShader);`); c.apply('hue', (e) => `${c.id}.uniforms.hue.value = ${e};`); c.apply('saturation', (e) => `${c.id}.uniforms.saturation.value = ${e};`); return { pass: c.id }; } });
  post({ type: 'brightContrast', title: 'Brightness / contrast', idBase: 'levels', desc: 'Brighter / darker and more / less contrast (wire a kick to Brightness for flashes)', keywords: 'exposure levels flash', inputs: [N('brightness', 0, -1, 1), N('contrast', 0, -1, 1)],
    compile: (c) => { c.import('ShaderPass', 'three/addons/postprocessing/ShaderPass.js'); c.import('BrightnessContrastShader', 'three/addons/shaders/BrightnessContrastShader.js'); c.setup(`const ${c.id} = new ShaderPass(BrightnessContrastShader);`); c.apply('brightness', (e) => `${c.id}.uniforms.brightness.value = ${e};`); c.apply('contrast', (e) => `${c.id}.uniforms.contrast.value = ${e};`); return { pass: c.id }; } });
  post({ type: 'sepia', title: 'Sepia', desc: 'Old-photo brown tint', keywords: 'vintage old warm', inputs: [N('amount', 0.8, 0, 1)],
    compile: (c) => { c.import('ShaderPass', 'three/addons/postprocessing/ShaderPass.js'); c.import('SepiaShader', 'three/addons/shaders/SepiaShader.js'); c.setup(`const ${c.id} = new ShaderPass(SepiaShader);`); c.apply('amount', (e) => `${c.id}.uniforms.amount.value = ${e};`); return { pass: c.id }; } });

  // ---------- Layer look (CSS on this layer's picture) ----------
  define({ type: 'layerLook', title: 'Layer look', category: 'Layer', color: '#c9b79c', desc: 'Brightness, contrast, saturation, hue, blur and invert on this layer\'s whole picture (wire hits for flashes)', keywords: 'css filter blur invert brightness flash',
    inputs: [N('brightness', 1, 0, 4), N('contrast', 1, 0, 3), N('saturate', 1, 0, 3), N('hue', 0, -180, 180, { label: 'Hue °' }), N('blur', 0, 0, 20, { label: 'Blur px' }), N('invert', 0, 0, 1)],
    compile: (c) => {
      const css = `'brightness(' + ${c.in('brightness')} + ') contrast(' + ${c.in('contrast')} + ') saturate(' + ${c.in('saturate')} + ') hue-rotate(' + ${c.in('hue')} + 'deg) blur(' + ${c.in('blur')} + 'px) invert(' + ${c.in('invert')} + ')'`;
      const dyn = ['brightness', 'contrast', 'saturate', 'hue', 'blur', 'invert'].some((f) => c.dyn(f));
      (dyn ? c.frame : c.setup)(`renderer.domElement.style.filter = ${css};`);
      return {};
    } });

  // ---------- Filter layer nodes (from the Lab's filter templates, so new filters show up here too) ----------
  function filterDefs() {
    if (typeof ThreeLayers === 'undefined' || typeof ThreeTweaks === 'undefined') return;
    for (const f of ThreeLayers.FILTERS) {
      if (reg.has(`fx-${f.id}`)) continue;
      let items = [];
      try { items = ThreeTweaks.scan(f.code).items.filter((it) => it.key != null); } catch { continue; }
      const inputs = items.map((it) => {
        const base = { name: it.key, label: it.label || it.key, hint: it.hint, slider: true };
        if (it.kind === 'number') return { ...base, type: 'num', value: it.orig, min: it.range?.min ?? 0, max: it.range?.max ?? 1, ...(it.range?.step >= 1 ? { step: it.range.step } : {}) };
        if (it.kind === 'color') return { ...base, type: 'color', value: it.orig };
        if (it.kind === 'bool') return { ...base, type: 'bool', value: it.orig };
        return { ...base, type: 'any', kind: 'select', options: it.options || [it.orig], value: it.orig };
      });
      define({ type: `fx-${f.id}`, title: `${f.name} filter`, category: 'Filter layer', color: '#f5a3d0', idBase: f.id, desc: `${f.desc}. Makes this layer a filter layer: it restyles every layer below it (scene nodes in the same graph are ignored).`, keywords: 'filter adjustment layer fx',
        inputs, outputs: [],
        compile: (c) => {
          if (c.shared.filter) { c.warn('One filter per layer: this one is ignored (add another layer)'); return {}; }
          c.shared.filter = { type: f.id, params: inputs.map((x) => ({ key: x.name, expr: c.in(x.name) })) };
          return {};
        } });
    }
  }

  // ---------- assembling the code ----------
  const tweakSpec = (t) => [`value: ${lit(t.value)}`, t.min != null ? `min: ${t.min}` : '', t.max != null ? `max: ${t.max}` : '', t.step ? `step: ${t.step}` : '', t.options ? `options: ${lit(t.options)}` : '', `label: ${lit(t.label)}`, `group: ${lit(t.group)}`, t.hint ? `hint: ${lit(t.hint)}` : ''].filter(Boolean).join(', ');
  function blocks(list, indent) {
    const out = [];
    for (const { node, def, code } of list) {
      const lines = code.flatMap((s) => String(s).split('\n'));
      const local = lines.some((l) => /^(const|let) /.test(l)) && indent;
      out.push(`${indent}// ${node.title || def.title} (${node.id})`);
      if (local) out.push(`${indent}{`, ...lines.map((l) => `${indent}  ${l}`), `${indent}}`);
      else out.push(...lines.map((l) => `${indent}${l}`));
    }
    return out;
  }
  function assemble(parts, graph, { outs }) {
    const L = [];
    const tw = parts.tweaks;
    const tweakBlock = tw.length ? ['const P = tweak({', ...tw.map((t) => `  ${t.key}: { ${tweakSpec(t)} },`), '});', ''] : [];
    const helpers = [...parts.helpers.values()];
    const probe = parts.probes.length ? `nodeValues[nodeLayer] = { ${parts.probes.map((p) => `'${p.key}': ${p.expr}`).join(', ')} };` : '';
    const probeSetup = probe ? ['// live values for the node view (shown on the nodes while it plays)', "const nodeLayer = globalThis.layer?.id || 'main';", 'const nodeValues = (globalThis.__nodeValues ||= {});'] : [];
    const filter = parts.shared.filter;
    if (filter) {
      const body = [
        '// A filter layer made with Nodes (Three.js Lab → Nodes): it restyles every layer below it.',
        '// Its knobs are the sliders; the last line keeps the node graph.',
        ...tweakBlock,
        'let t = 0; // seconds since the start',
        'let dt = 1 / 60; // seconds since the last frame',
        ...helpers, helpers.length ? '' : null,
        ...blocks(parts.setup, ''),
        `filter(${lit(filter.type)}, {`, ...filter.params.map((p) => `  get ${p.key}() { return ${p.expr}; },`), '});',
      ].filter((x) => x != null);
      if (parts.frame.length || probe) {
        body.push('', ...probeSetup, 'let last = performance.now();', 'requestAnimationFrame(function tick() {', '  const now = performance.now();', '  dt = Math.min(0.1, (now - last) / 1000);', '  last = now;', '  t += dt;', ...blocks(parts.frame, '  '), probe ? `  ${probe}` : null, '  requestAnimationFrame(tick);', '});');
      }
      const imp = [...parts.imports].map(([from, names]) => `import { ${[...names].sort().join(', ')} } from '${from}';`);
      const needThree = body.some((l) => l && /\bTHREE\./.test(l));
      return [...(needThree ? ["import * as THREE from 'three';"] : []), ...imp, ...(needThree || imp.length ? [''] : []), ...body.filter((x) => x != null)].join('\n');
    }
    const passes = parts.shared.passes || [];
    if (passes.length) {
      const add = (n, f) => { const s = parts.imports.get(f) || new Set(); s.add(n); parts.imports.set(f, s); };
      add('EffectComposer', 'three/addons/postprocessing/EffectComposer.js'); add('RenderPass', 'three/addons/postprocessing/RenderPass.js'); add('OutputPass', 'three/addons/postprocessing/OutputPass.js');
    }
    L.push("import * as THREE from 'three';", ...[...parts.imports].map(([from, names]) => `import { ${[...names].sort().join(', ')} } from '${from}';`), '');
    L.push('// Made with Nodes (Three.js Lab → Nodes): switch the code pane to Nodes to edit it as a graph.', "// The sliders are the nodes' knobs; the last line keeps the graph.");
    L.push(...tweakBlock);
    L.push('const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });', 'renderer.setPixelRatio(Math.min(devicePixelRatio, 2));', 'renderer.setSize(innerWidth, innerHeight);', 'document.body.append(renderer.domElement);',
      'const scene = new THREE.Scene();', 'const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 500);', 'camera.position.set(0, 0, 8);',
      'let t = 0; // seconds since the start', 'let dt = 1 / 60; // seconds since the last frame', '');
    if (helpers.length) L.push(...helpers, '');
    L.push(...blocks(parts.setup, ''));
    // objects nothing is wired to still show up
    const loose = [];
    for (const n of graph.nodes) {
      const def = reg.get(n.type);
      for (const o of def?.outputs || []) if (o.type === 'obj' && !graph.links.some((l) => l.from[0] === n.id && l.from[1] === o.name)) { const e = outs.get(`${n.id}.${o.name}`)?.expr; if (e && !loose.includes(e)) loose.push(e); }
    }
    if (loose.length) L.push('', '// objects not wired to the Output', `scene.add(${loose.join(', ')});`);
    if (passes.length) L.push('', '// post effects', 'const composer = new EffectComposer(renderer);', 'composer.addPass(new RenderPass(scene, camera));', ...passes.map((p) => `composer.addPass(${p});`), 'composer.addPass(new OutputPass());');
    L.push('', "addEventListener('resize', () => {", '  camera.aspect = innerWidth / innerHeight;', '  camera.updateProjectionMatrix();', '  renderer.setSize(innerWidth, innerHeight);', passes.length ? '  composer.setSize(innerWidth, innerHeight);' : null, '});', '');
    if (probeSetup.length) L.push(...probeSetup);
    L.push('let last = performance.now();', 'renderer.setAnimationLoop((now) => {', '  dt = Math.min(0.1, (now - last) / 1000);', '  last = now;', '  t += dt;');
    L.push(...blocks(parts.frame, '  '));
    L.push(passes.length ? '  composer.render(dt);' : '  renderer.render(scene, camera);');
    if (probe) L.push(`  ${probe}`);
    L.push('});');
    return L.filter((x) => x != null).join('\n');
  }

  // ---------- compile / read back ----------
  function compile(graph) {
    filterDefs();
    const r = reg.compile(graph, { probe: true });
    r.code = NodeView.embed(r.code, r.graph, reg);
    return r;
  }
  // The graph in a layer's code, with slider values the Lab saved into the code since (Save, Shuffle + Save).
  // edited: the code no longer matches the graph (changed by hand or by the director).
  function fromCode(code) {
    filterDefs();
    const hit = NodeView.extract(code);
    if (!hit) return null;
    const graph = NodeView.normalize(hit.graph, reg);
    let items = [];
    try { items = ThreeTweaks.scan(hit.body).items.filter((it) => it.key != null && it.call === 0); } catch { /* unreadable code */ }
    const first = reg.compile(graph);
    for (const tw of first.parts.tweaks) {
      const it = items.find((x) => x.key === tw.key);
      const n = graph.nodes.find((x) => x.id === tw.node);
      if (it && n && it.orig !== undefined) n.values[tw.field] = it.orig;
    }
    const again = compile(graph);
    const norm = (s) => String(s).replace(/\s+$/g, '').replace(/[ \t]+$/gm, '');
    return { graph, edited: norm(NodeView.extract(again.code)?.body) !== norm(hit.body) };
  }

  // ---------- presets ----------
  const PRESETS = [];
  // p(id, name, desc, build(g)): g.add(type, values?, title?) → id, g.link('a.out', 'b.in'), g.frame(title, [ids], color)
  function preset(id, name, desc, build, tags = '') { PRESETS.push({ id, name, desc, tags, build }); }
  function buildPreset(p) {
    filterDefs();
    const g = NodeView.emptyGraph('three');
    const api = {
      add(type, values = {}, title) {
        const d = reg.get(type);
        if (!d) throw new Error(`preset ${p.id}: unknown node ${type}`);
        const id = reg.idFor(d, g);
        g.nodes.push({ id, type, x: 0, y: 0, values, ...(title ? { title } : {}) });
        return id;
      },
      link(a, b) { const [x, xp] = a.split('.'); const [y, yp] = b.split('.'); g.links.push({ from: [x, xp], to: [y, yp] }); },
      // a slider group for these nodes in the Lab (no frame drawn: preset columns overlap)
      group(title, ids) { for (const n of g.nodes) if (ids.includes(n.id)) n.group = title; },
      frame(title, ids) { api.group(title, ids); },
    };
    p.build(api);
    const graph = NodeView.normalize(g, reg);
    NodeView.autoLayout(graph, reg, { colW: 240 });
    graph.meta = { preset: p.id };
    return graph;
  }
  // 1
  preset('beat-particles', 'Beat-pulsing particles', 'A sphere of glowing dots that swells on every kick, with bloom', (g) => {
    const hits = g.add('hits'); const pump = g.add('peak', { release: 0.86 });
    const pts = g.add('particles', { count: 7000, spread: 4.5, color: '#bd8bff', size: 0.07, punch: 1.6 });
    const pal = g.add('palette', { palette: 'vapor', drift: 0.04 });
    const bloom = g.add('bloom', { strength: 0.72 }); const out = g.add('output');
    g.link(`${hits}.kick`, `${pump}.value`); g.link(`${pump}.out`, `${pts}.pulse`); g.link(`${pal}.out`, `${pts}.color`);
    g.link(`${pts}.obj`, `${out}.objects`); g.link(`${bloom}.pass`, `${out}.post`);
    g.frame('Music', [hits, pump], '#ff6b9d'); g.frame('Particles', [pts, pal], '#bd8bff');
  }, 'kick particles bloom');
  // 2
  preset('audio-tunnel', 'Audio tunnel', 'Endless rings rushing at you; speed follows the energy, rings punch on kicks', (g) => {
    const lv = g.add('levels'); const hits = g.add('hits');
    const speed = g.add('remap', { inMin: 0, inMax: 1, outMin: 3, outMax: 14 }, 'Energy → speed');
    const tun = g.add('tunnel', { rings: 48, radius: 3.2, twist: 0.12 }); const pump = g.add('peak', { release: 0.85 });
    const cam = g.add('camera', { mode: 'fly', distance: 8, speed: 0.4 });
    const bloom = g.add('bloom', { strength: 0.91, radius: 0.6 }); const out = g.add('output');
    g.link(`${lv}.energy`, `${speed}.value`); g.link(`${speed}.out`, `${tun}.speed`); g.link(`${hits}.kick`, `${pump}.value`); g.link(`${pump}.out`, `${tun}.pulse`);
    g.link(`${tun}.obj`, `${out}.objects`); g.link(`${cam}.cam`, `${out}.camera`); g.link(`${bloom}.pass`, `${out}.post`);
    g.frame('Music', [lv, hits, speed, pump], '#ff6b9d');
  }, 'tunnel rings fly');
  // 3
  preset('kick-flash-grid', 'Kick-flash grid', 'A floor of wire cubes rippling out, flashing white on every kick', (g) => {
    const hits = g.add('hits'); const env = g.add('envelope', { decay: 0.2 });
    const flash = g.add('mixColors', { a: '#1f4fff', b: '#ffffff' }, 'Kick flash');
    const box = g.add('box', { width: 0.4, height: 0.4, depth: 0.4 }); const mat = g.add('basicMat', { wireframe: true });
    const grid = g.add('gridCopies', { mode: 'ripple', columns: 22, rows: 22, spacing: 0.6, height: 0.7 });
    const amt = g.add('remap', { outMin: 0.5, outMax: 1.8 }, 'Kick → height');
    const cam = g.add('camera', { mode: 'orbit', distance: 15, height: 7, speed: 0.08 }); const bloom = g.add('bloom', { strength: 0.45, threshold: 0.5 }); const out = g.add('output');
    g.link(`${hits}.kick`, `${env}.hit`); g.link(`${env}.out`, `${flash}.t`); g.link(`${flash}.out`, `${mat}.color`); g.link(`${env}.out`, `${amt}.value`); g.link(`${amt}.out`, `${grid}.amount`);
    g.link(`${box}.geo`, `${grid}.geometry`); g.link(`${mat}.mat`, `${grid}.material`); g.link(`${grid}.obj`, `${out}.objects`); g.link(`${cam}.cam`, `${out}.camera`); g.link(`${bloom}.pass`, `${out}.post`);
    g.frame('Music', [hits, env, amt], '#ff6b9d'); g.frame('Formation', [box, mat, grid, flash], '#ffd75e');
  }, 'grid floor kick flash');
  // 4
  preset('spectrum-circle', 'Spectrum circle', 'A round equalizer in palette colors that breathes with the bass', (g) => {
    const bars = g.add('spectrumBars', { layout: 'circle', count: 96, width: 5, height: 3.5 });
    const lv = g.add('levels'); const sm = g.add('smooth', { speed: 8 }); const sc = g.add('remap', { outMin: 1, outMax: 1.25 }, 'Bass → size');
    const spin = g.add('spin', { axis: 'z', speed: 0.15 }); const bloom = g.add('bloom', { strength: 0.85 }); const out = g.add('output');
    g.link(`${lv}.bass`, `${sm}.value`); g.link(`${sm}.out`, `${sc}.value`); g.link(`${sc}.out`, `${bars}.scale`); g.link(`${bars}.obj`, `${spin}.obj`); g.link(`${spin}.obj`, `${out}.objects`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'equalizer eq bars round');
  // 5
  preset('spectrum-line', 'Spectrum bars', 'A classic mirrored equalizer across the screen', (g) => {
    const bars = g.add('spectrumBars', { layout: 'line', count: 72, width: 11, height: 4, mirror: true, thickness: 0.2 });
    const wave = g.add('waveLine', { width: 11, amplitude: 0.8, color: '#ffffff', opacity: 0.6 });
    const bloom = g.add('bloom', { strength: 0.59 }); const out = g.add('output');
    g.link(`${bars}.obj`, `${out}.objects`); g.link(`${wave}.obj`, `${out}.objects`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'equalizer eq bars');
  // 6
  preset('morph-blob', 'Morphing blob', 'A glossy blob boiling with the bass, lit by colored lights that flash on snares', (g) => {
    const lv = g.add('levels'); const sm = g.add('smooth', { speed: 7 }); const amt = g.add('remap', { outMin: 0.15, outMax: 0.9 }, 'Bass → morph');
    const mat = g.add('standardMat', { color: '#bd8bff', roughness: 0.25, metalness: 0.5 }); const blob = g.add('blob', { radius: 1.8, detail: 128 });
    const hits = g.add('hits'); const env = g.add('envelope', { decay: 0.3 }); const flash = g.add('remap', { outMin: 20, outMax: 160 }, 'Snare → light');
    const amb = g.add('ambientLight', { intensity: 0.4 }); const lamp = g.add('pointLight', { color: '#ff6b9d', position: [3, 2, 4] }); const lamp2 = g.add('pointLight', { color: '#48ddff', intensity: 60, position: [-4, -1, 3] });
    const spin = g.add('spin', { speed: 0.2, axis: 'all' }); const out = g.add('output');
    g.link(`${lv}.bass`, `${sm}.value`); g.link(`${sm}.out`, `${amt}.value`); g.link(`${amt}.out`, `${blob}.amount`); g.link(`${mat}.mat`, `${blob}.material`);
    g.link(`${hits}.snare`, `${env}.hit`); g.link(`${env}.out`, `${flash}.value`); g.link(`${flash}.out`, `${lamp}.intensity`);
    g.link(`${blob}.obj`, `${spin}.obj`); for (const x of [spin, amb, lamp, lamp2]) g.link(`${x}.obj`, `${out}.objects`);
    g.frame('Music', [lv, sm, amt, hits, env, flash], '#ff6b9d'); g.frame('Light', [amb, lamp, lamp2], '#fff3b0');
  }, 'blob liquid organic');
  // 7
  preset('waveform-ring', 'Waveform ring', 'The sound wave drawn as a glowing circle, with a second echo ring', (g) => {
    const w1 = g.add('waveLine', { layout: 'circle', width: 6, amplitude: 1.4, color: '#48ddff' });
    const w2 = g.add('waveLine', { layout: 'circle', width: 7.5, amplitude: 0.8, color: '#ff6b9d', opacity: 0.6 });
    const rb = g.add('rainbow', { speed: 0.05 }); const spin = g.add('spin', { axis: 'z', speed: -0.2 });
    const trails = g.add('afterimage', { length: 0.85 }); const bloom = g.add('bloom', { strength: 0.78 }); const out = g.add('output');
    g.link(`${rb}.out`, `${w2}.color`); g.link(`${w2}.obj`, `${spin}.obj`); g.link(`${w1}.obj`, `${out}.objects`); g.link(`${spin}.obj`, `${out}.objects`); g.link(`${trails}.pass`, `${out}.post`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'oscilloscope circle scope');
  // 8
  preset('warp-stars', 'Warp speed', 'Hyperspace stars; the speed follows the energy and boosts on kicks', (g) => {
    const lv = g.add('levels'); const hits = g.add('hits'); const sp = g.add('remap', { outMin: 6, outMax: 40 }, 'Energy → speed');
    const stars = g.add('starfield', { count: 3000 }); const cam = g.add('camera', { mode: 'drift', speed: 0.2 });
    const trails = g.add('afterimage', { length: 0.8 }); const bloom = g.add('bloom', { strength: 0.65 }); const out = g.add('output');
    g.link(`${lv}.energy`, `${sp}.value`); g.link(`${sp}.out`, `${stars}.speed`); g.link(`${hits}.kick`, `${stars}.boost`); g.link(`${hits}.snare`, `${cam}.shake`);
    g.link(`${stars}.obj`, `${out}.objects`); g.link(`${cam}.cam`, `${out}.camera`); g.link(`${trails}.pass`, `${out}.post`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'stars hyperspace space');
  // 9
  preset('pulse-rings', 'Pulse rings', 'A ring of glowing tori that each react to their slice of the spectrum', (g) => {
    const geo = g.add('torus', { radius: 0.35, tube: 0.05 }); const mat = g.add('glowMat', { color: '#ffd75e', intensity: 2 });
    const ring = g.add('ringCopies', { count: 24, radius: 3, react: 1.6, palette: false }); const hits = g.add('hits'); const pulse = g.add('pulse', { strength: 0.15 });
    const bloom = g.add('bloom', { strength: 0.78 }); const out = g.add('output');
    g.link(`${geo}.geo`, `${ring}.geometry`); g.link(`${mat}.mat`, `${ring}.material`); g.link(`${ring}.obj`, `${pulse}.obj`); g.link(`${hits}.kick`, `${pulse}.amount`); g.link(`${pulse}.obj`, `${out}.objects`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'rings donuts circle');
  // 10
  preset('synth-terrain', 'Synthwave terrain', 'Wireframe hills rolling toward you under a glowing sun', (g) => {
    const lv = g.add('levels'); const sm = g.add('smooth', { speed: 4 });
    const mat = g.add('basicMat', { color: '#ff2bd6', wireframe: true, opacity: 0.85 }); const ter = g.add('wavePlane', { speed: 2, height: 1, size: 40 });
    const sunG = g.add('sphere', { radius: 2.4 }); const sunM = g.add('gradientMat', { bottom: '#ff2bd6', top: '#ffd75e', size: 4.8 }); const sun = g.add('mesh', { position: [0, 1.6, -14] }, 'Sun');
    const cam = g.add('camera', { mode: 'fly', height: 0.6, distance: 8, speed: 0.2 }); const bloom = g.add('bloom', { strength: 0.85, threshold: 0.35 }); const out = g.add('output', { backgroundOn: true, background: '#0a0118', fog: 0.045 });
    g.link(`${lv}.bass`, `${sm}.value`); g.link(`${sm}.out`, `${ter}.react`); g.link(`${mat}.mat`, `${ter}.material`); g.link(`${sunG}.geo`, `${sun}.geometry`); g.link(`${sunM}.mat`, `${sun}.material`);
    g.link(`${ter}.obj`, `${out}.objects`); g.link(`${sun}.obj`, `${out}.objects`); g.link(`${cam}.cam`, `${out}.camera`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'retro 80s outrun landscape');
  // 11
  preset('neon-knot', 'Neon knot', 'A rim-glowing torus knot that tumbles a quarter turn on each kick', (g) => {
    const geo = g.add('torusKnot', { radius: 1.6, tube: 0.42, p: 3, q: 5 }); const mat = g.add('glowMat', { color: '#48ddff', power: 1.8, intensity: 1.3 });
    const mesh = g.add('mesh'); const hits = g.add('hits'); const tum = g.add('tumble', { degrees: 90 }); const spin = g.add('spin', { speed: 0.3, axis: 'x' });
    const rb = g.add('palette', { palette: 'neon', drift: 0.06 }); const bloom = g.add('bloom', { strength: 0.7 }); const out = g.add('output');
    g.link(`${geo}.geo`, `${mesh}.geometry`); g.link(`${mat}.mat`, `${mesh}.material`); g.link(`${rb}.out`, `${mat}.color`); g.link(`${mesh}.obj`, `${tum}.obj`); g.link(`${hits}.kick`, `${tum}.hit`); g.link(`${tum}.obj`, `${spin}.obj`); g.link(`${spin}.obj`, `${out}.objects`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'knot glow neon');
  // 12
  preset('snare-strobe', 'Snare strobe', 'A white background strobe on snares, behind a spinning wireframe', (g) => {
    const hits = g.add('hits'); const env = g.add('envelope', { decay: 0.12 }); const bg = g.add('mixColors', { a: '#000000', b: '#ffffff' }, 'Strobe');
    const geo = g.add('icosahedron', { radius: 2, detail: 1 }); const mat = g.add('basicMat', { color: '#ff6a6a', wireframe: true }); const mesh = g.add('mesh');
    const spin = g.add('spin', { axis: 'all', speed: 0.6 }); const pulse = g.add('pulse', { strength: 0.3 }); const out = g.add('output', { backgroundOn: true });
    g.link(`${hits}.snare`, `${env}.hit`); g.link(`${env}.out`, `${bg}.t`); g.link(`${bg}.out`, `${out}.background`); g.link(`${hits}.kick`, `${pulse}.amount`);
    g.link(`${geo}.geo`, `${mesh}.geometry`); g.link(`${mat}.mat`, `${mesh}.material`); g.link(`${mesh}.obj`, `${spin}.obj`); g.link(`${spin}.obj`, `${pulse}.obj`); g.link(`${pulse}.obj`, `${out}.objects`);
  }, 'strobe flash white');
  // 13
  preset('orbit-lights', 'Orbiting lights', 'Shiny spheres lit by colored lights circling them; lights flare on kicks', (g) => {
    const geo = g.add('sphere', { radius: 0.6 }); const mat = g.add('standardMat', { color: '#ffffff', roughness: 0.15, metalness: 0.9 });
    const ring = g.add('ringCopies', { count: 9, radius: 2.4, mode: 'together', react: 0.2 });
    const p1 = g.add('pointLight', { color: '#ff6b9d', intensity: 60 }); const p2 = g.add('pointLight', { color: '#48ddff', intensity: 60 });
    const path1 = g.add('circlePath', { radius: 3.5, speed: 0.25 }); const path2 = g.add('circlePath', { radius: 3.5, speed: -0.18, shape: 'figure 8' });
    const hits = g.add('hits'); const env = g.add('envelope', { decay: 0.3 }); const fl = g.add('remap', { outMin: 40, outMax: 220 }, 'Kick → light');
    const amb = g.add('ambientLight', { intensity: 0.15 }); const spin = g.add('spin', { axis: 'z', speed: 0.2 }); const out = g.add('output');
    g.link(`${geo}.geo`, `${ring}.geometry`); g.link(`${mat}.mat`, `${ring}.material`); g.link(`${path1}.out`, `${p1}.position`); g.link(`${path2}.out`, `${p2}.position`);
    g.link(`${hits}.kick`, `${env}.hit`); g.link(`${env}.out`, `${fl}.value`); g.link(`${fl}.out`, `${p1}.intensity`); g.link(`${fl}.out`, `${p2}.intensity`);
    g.link(`${ring}.obj`, `${spin}.obj`); for (const x of [spin, p1, p2, amb]) g.link(`${x}.obj`, `${out}.objects`);
  }, 'chrome metal spheres lights');
  // 14
  preset('hue-cubes', 'Hue cubes', 'A wave of palette-colored cubes, hues sliding with the music', (g) => {
    const box = g.add('box', { width: 0.5, height: 0.5, depth: 0.5 }); const mat = g.add('standardMat', { color: '#ffffff', roughness: 0.5, metalness: 0.1 });
    const grid = g.add('gridCopies', { mode: 'wave', columns: 18, rows: 18, spacing: 0.7, palette: true, rotation: [50, 0, 0] });
    const lv = g.add('levels'); const sm = g.add('smooth', { speed: 5 }); const amt = g.add('remap', { outMin: 0.4, outMax: 2 }, 'Level → waves');
    const sun = g.add('dirLight', { intensity: 2.5 }); const amb = g.add('ambientLight', { intensity: 0.5 }); const out = g.add('output');
    g.link(`${box}.geo`, `${grid}.geometry`); g.link(`${mat}.mat`, `${grid}.material`); g.link(`${lv}.level`, `${sm}.value`); g.link(`${sm}.out`, `${amt}.value`); g.link(`${amt}.out`, `${grid}.amount`);
    for (const x of [grid, sun, amb]) g.link(`${x}.obj`, `${out}.objects`);
  }, 'cubes colors wave grid');
  // 15
  preset('kaleido-crystals', 'Kaleido crystals', 'Faceted gems mirrored into a kaleidoscope that turns with the bars', (g) => {
    const geo = g.add('polyhedron', { kind: 'Octahedron', radius: 0.8 }); const mat = g.add('normalMat', { flatShading: true });
    const ring = g.add('ringCopies', { count: 12, radius: 2.2, mode: 'spectrum', react: 1.2, spin: 0.3 }); const beat = g.add('beat');
    const ang = g.add('remap', { outMin: 0, outMax: 90 }, 'Bar → angle'); const kal = g.add('kaleido', { sides: 8 }); const bloom = g.add('bloom', { strength: 0.45 }); const out = g.add('output');
    g.link(`${geo}.geo`, `${ring}.geometry`); g.link(`${mat}.mat`, `${ring}.material`); g.link(`${beat}.barPhase`, `${ang}.value`); g.link(`${ang}.out`, `${kal}.angle`);
    g.link(`${ring}.obj`, `${out}.objects`); g.link(`${kal}.pass`, `${out}.post`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'kaleidoscope mirror gems');
  // 16
  preset('trails-dancer', 'Trails dancer', 'A glowing shape dancing a figure 8 and leaving long trails', (g) => {
    const geo = g.add('torus', { radius: 0.7, tube: 0.12 }); const mat = g.add('basicMat', { additive: true }); const rb = g.add('rainbow', { speed: 0.15 });
    const mesh = g.add('mesh'); const path = g.add('circlePath', { shape: 'figure 8', radius: 3, speed: 0.35 }); const move = g.add('move');
    const spin = g.add('spin', { axis: 'all', speed: 1.5 }); const hits = g.add('hits'); const pulse = g.add('pulse', { strength: 0.6 });
    const trails = g.add('afterimage', { length: 0.93 }); const bloom = g.add('bloom', { strength: 0.91 }); const out = g.add('output');
    g.link(`${geo}.geo`, `${mesh}.geometry`); g.link(`${mat}.mat`, `${mesh}.material`); g.link(`${rb}.out`, `${mat}.color`); g.link(`${mesh}.obj`, `${move}.obj`); g.link(`${path}.out`, `${move}.offset`);
    g.link(`${move}.obj`, `${spin}.obj`); g.link(`${spin}.obj`, `${pulse}.obj`); g.link(`${hits}.kick`, `${pulse}.amount`); g.link(`${pulse}.obj`, `${out}.objects`); g.link(`${trails}.pass`, `${out}.post`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'trails afterimage dance');
  // 17
  preset('glitch-drop', 'Glitch on the drop', 'Calm particles that glitch, split and flash when the drop hits', (g) => {
    const drop = g.add('drop'); const hits = g.add('hits'); const any = g.add('math', { op: 'max' }, 'Drop or snare');
    const pts = g.add('particles', { shape: 'shell', count: 6000, color: '#48ddff', spread: 4 }); const gl = g.add('glitch'); const rgb = g.add('rgbShift');
    const amt = g.add('remap', { outMin: 0.001, outMax: 0.02 }, 'Hit → split'); const bloom = g.add('bloom'); const out = g.add('output');
    g.link(`${drop}.after`, `${any}.a`); g.link(`${hits}.snare`, `${any}.b`); g.link(`${any}.out`, `${gl}.hit`); g.link(`${any}.out`, `${amt}.value`); g.link(`${amt}.out`, `${rgb}.amount`);
    g.link(`${hits}.kick`, `${pts}.pulse`); g.link(`${pts}.obj`, `${out}.objects`); for (const x of [bloom, rgb, gl]) g.link(`${x}.pass`, `${out}.post`);
  }, 'glitch drop rgb');
  // 18
  preset('disco-orbit', 'Disco orbit', 'A ring of mirror tiles orbited by the camera, palette colors stepping on each kick', (g) => {
    const geo = g.add('box', { width: 0.5, height: 0.5, depth: 0.08 }); const mat = g.add('standardMat', { color: '#e8e8f0', roughness: 0.3, metalness: 0.55 });
    const hits = g.add('hits'); const col = g.add('colorOnHit', { palette: 'vapor' }); const ring = g.add('ringCopies', { count: 40, radius: 3, mode: 'wave', react: 0.4, spin: 0.4 });
    const lamp = g.add('pointLight', { intensity: 120, position: [0, 0, 4] }); const amb = g.add('ambientLight', { intensity: 0.3 });
    const cam = g.add('camera', { mode: 'orbit', distance: 9, height: 2, speed: 0.25 }); const bloom = g.add('bloom', { strength: 0.52 }); const out = g.add('output');
    g.link(`${geo}.geo`, `${ring}.geometry`); g.link(`${mat}.mat`, `${ring}.material`); g.link(`${hits}.kick`, `${col}.hit`); g.link(`${col}.out`, `${lamp}.color`); g.link(`${hits}.snare`, `${cam}.zoom`);
    for (const x of [ring, lamp, amb]) g.link(`${x}.obj`, `${out}.objects`); g.link(`${cam}.cam`, `${out}.camera`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'disco mirror ball');
  // 19
  preset('bass-sphere', 'Breathing sphere', 'One clean sphere that breathes with the bass and glows on kicks', (g) => {
    const lv = g.add('levels'); const sm = g.add('smooth', { speed: 9 }); const sc = g.add('remap', { outMin: 1, outMax: 1.6 }, 'Bass → size');
    const geo = g.add('sphere', { radius: 1.6 }); const mat = g.add('glowMat', { color: '#ff8c42', power: 2.5, intensity: 2 }); const mesh = g.add('mesh');
    const hits = g.add('hits'); const env = g.add('envelope', { decay: 0.25 }); const gl = g.add('remap', { outMin: 1.5, outMax: 5 }, 'Kick → glow');
    const out = g.add('output'); const bloom = g.add('bloom');
    g.link(`${lv}.bass`, `${sm}.value`); g.link(`${sm}.out`, `${sc}.value`); g.link(`${sc}.out`, `${mesh}.scale`); g.link(`${geo}.geo`, `${mesh}.geometry`); g.link(`${mat}.mat`, `${mesh}.material`);
    g.link(`${hits}.kick`, `${env}.hit`); g.link(`${env}.out`, `${gl}.value`); g.link(`${gl}.out`, `${mat}.intensity`); g.link(`${mesh}.obj`, `${out}.objects`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'sphere breathe minimal');
  // 20
  preset('lava-lamp', 'Lava lamp', 'Three warm blobs drifting slowly, morphing with the mids', (g) => {
    const lv = g.add('levels'); const sm = g.add('smooth', { speed: 3 }); const amt = g.add('remap', { outMin: 0.2, outMax: 0.7 }, 'Mids → morph');
    const mat = g.add('standardMat', { color: '#ff5f00', emissive: '#c1121f', emissiveIntensity: 0.6, roughness: 0.3 });
    const b1 = g.add('blob', { radius: 1.2, detail: 80, position: [-2, 0, 0] }); const b2 = g.add('blob', { radius: 0.9, detail: 72, position: [2, 1, -1], speed: 0.8 }); const b3 = g.add('blob', { radius: 0.7, detail: 64, position: [0.5, -1.6, 1], speed: 1.1 });
    const n1 = g.add('noiseWave', { speed: 0.2, amplitude: 1, positive: false }); const mv = g.add('vector'); const move = g.add('move');
    const amb = g.add('hemiLight', { sky: '#ffb000', ground: '#5b2a86' }); const sun = g.add('dirLight', { color: '#ffef9f' }); const out = g.add('output', { backgroundOn: true, background: '#1a0505' });
    g.link(`${lv}.mid`, `${sm}.value`); g.link(`${sm}.out`, `${amt}.value`); for (const b of [b1, b2, b3]) { g.link(`${amt}.out`, `${b}.amount`); g.link(`${mat}.mat`, `${b}.material`); }
    g.link(`${n1}.out`, `${mv}.y`); g.link(`${mv}.out`, `${move}.offset`); g.link(`${b1}.obj`, `${move}.obj`);
    for (const x of [move, b2, b3, amb, sun]) g.link(`${x}.obj`, `${out}.objects`);
  }, 'blobs warm lava');
  // 21
  preset('galaxy', 'Particle galaxy', 'A spiral galaxy of dots turning slowly, flaring on kicks', (g) => {
    const pts = g.add('particles', { shape: 'galaxy', count: 16000, spread: 6, size: 0.05, spin: 0.08, rotation: [65, 0, 0] });
    const pal = g.add('palette', { palette: 'sketch palette', drift: 0.02 }); const hits = g.add('hits'); const pump = g.add('peak', { release: 0.9 });
    const cam = g.add('camera', { mode: 'drift', speed: 0.1, distance: 9 }); const bloom = g.add('bloom', { strength: 0.78 }); const out = g.add('output');
    g.link(`${pal}.out`, `${pts}.color`); g.link(`${hits}.kick`, `${pump}.value`); g.link(`${pump}.out`, `${pts}.pulse`);
    g.link(`${pts}.obj`, `${out}.objects`); g.link(`${cam}.cam`, `${out}.camera`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'galaxy spiral space stars');
  // 22
  preset('retro-sun', 'Retro sun', 'A gradient sun rising behind an arc equalizer, with film grain', (g) => {
    const sunG = g.add('sphere', { radius: 2.5 }); const sunM = g.add('gradientMat', { bottom: '#ff2bd6', top: '#fff200', size: 5 }); const sun = g.add('mesh', { position: [0, 0.6, -2] }, 'Sun');
    const bars = g.add('spectrumBars', { layout: 'arc', count: 48, width: 7, height: 2.4, palette: true, position: [0, -0.6, 0] });
    const prog = g.add('song'); const rise = g.add('remap', { outMin: -1.5, outMax: 0.8 }, 'Song → sunrise'); const vec = g.add('vector', { z: -2 }); const place = g.add('transform');
    const film = g.add('film', { intensity: 0.5 }); const bloom = g.add('bloom', { strength: 0.59 }); const out = g.add('output', { backgroundOn: true, background: '#140021' });
    g.link(`${sunG}.geo`, `${sun}.geometry`); g.link(`${sunM}.mat`, `${sun}.material`); g.link(`${prog}.progress`, `${rise}.value`); g.link(`${rise}.out`, `${vec}.y`); g.link(`${vec}.out`, `${place}.position`); g.link(`${sun}.obj`, `${place}.obj`);
    g.link(`${place}.obj`, `${out}.objects`); g.link(`${bars}.obj`, `${out}.objects`); g.link(`${bloom}.pass`, `${out}.post`); g.link(`${film}.pass`, `${out}.post`);
  }, 'sunrise 80s outrun');
  // 23
  preset('step-colors', 'Step colors', 'Shapes jumping between palette colors and positions on each beat', (g) => {
    const beat = g.add('beat'); const cnt = g.add('counter', { steps: 4 }); const col = g.add('colorOnHit', { palette: 'forgeheart' });
    const seq = g.add('sequence', { values: '0, 1.5, -1.5, 0.75' }); const vec = g.add('vector'); const sm = g.add('spring', { stiffness: 220, damping: 12 });
    const geo = g.add('box', { width: 1.4, height: 1.4, depth: 1.4 }); const mat = g.add('basicMat', { wireframe: true }); const mesh = g.add('mesh'); const move = g.add('move');
    const tum = g.add('tumble', { degrees: 90, smooth: 14 }); const out = g.add('output'); const bloom = g.add('bloom', { strength: 0.65 });
    g.link(`${beat}.beat`, `${cnt}.hit`); g.link(`${beat}.beat`, `${col}.hit`); g.link(`${col}.out`, `${mat}.color`); g.link(`${seq}.out`, `${sm}.value`); g.link(`${sm}.out`, `${vec}.x`); g.link(`${vec}.out`, `${move}.offset`);
    g.link(`${geo}.geo`, `${mesh}.geometry`); g.link(`${mat}.mat`, `${mesh}.material`); g.link(`${mesh}.obj`, `${move}.obj`); g.link(`${move}.obj`, `${tum}.obj`); g.link(`${beat}.beat`, `${tum}.hit`); g.link(`${tum}.obj`, `${out}.objects`); g.link(`${bloom}.pass`, `${out}.post`);
  }, 'sequencer steps beat colors');
  // 24
  preset('vhs-filter', 'VHS filter layer', 'A found-footage filter for the layers below; the jitter jumps with the bass', (g) => {
    const lv = g.add('levels'); const sm = g.add('smooth', { speed: 10 }); const j = g.add('remap', { outMin: 0.15, outMax: 0.9 }, 'Bass → jitter');
    const vhs = g.add('fx-vhs');
    g.link(`${lv}.bass`, `${sm}.value`); g.link(`${sm}.out`, `${j}.value`); g.link(`${j}.out`, `${vhs}.jitter`);
  }, 'filter vhs camcorder found footage');
  // 25
  preset('glitch-filter', 'Glitch filter layer', 'A glitch filter for the layers below that fires on snares and the drop', (g) => {
    const hits = g.add('hits'); const drop = g.add('drop'); const mx = g.add('math', { op: 'max' }, 'Snare or drop');
    const gl = g.add('fx-glitch', { onHits: false });
    g.link(`${hits}.snare`, `${mx}.a`); g.link(`${drop}.after`, `${mx}.b`); g.link(`${mx}.out`, `${gl}.amount`);
  }, 'filter glitch');
  // 26
  preset('kaleido-filter', 'Kaleidoscope filter layer', 'Mirrors the layers below; segments step up every bar', (g) => {
    const beat = g.add('beat'); const cnt = g.add('counter', { steps: 4 }); const seg = g.add('remap', { inMax: 3, outMin: 4, outMax: 10 }, 'Bar → segments'); const st = g.add('quantize', { step: 2 });
    const k = g.add('fx-kaleido');
    g.link(`${beat}.barPhase`, `${cnt}.hit`); g.link(`${cnt}.step`, `${seg}.value`); g.link(`${seg}.out`, `${st}.value`); g.link(`${st}.out`, `${k}.segments`);
  }, 'filter kaleidoscope mirror');
  // 27
  preset('shape', 'Kick shape', 'One wireframe shape that pumps on kicks: the simplest start', (g) => {
    const hits = g.add('hits'); const pump = g.add('peak'); const geo = g.add('icosahedron', { detail: 1 }); const mat = g.add('basicMat', { color: '#ffd75e', wireframe: true });
    const mesh = g.add('mesh'); const spin = g.add('spin'); const pulse = g.add('pulse'); const out = g.add('output');
    g.link(`${hits}.kick`, `${pump}.value`); g.link(`${pump}.out`, `${pulse}.amount`); g.link(`${geo}.geo`, `${mesh}.geometry`); g.link(`${mat}.mat`, `${mesh}.material`);
    g.link(`${mesh}.obj`, `${spin}.obj`); g.link(`${spin}.obj`, `${pulse}.obj`); g.link(`${pulse}.obj`, `${out}.objects`);
  }, 'starter simple basic');
  // 28
  preset('video-screen', 'Video screen', 'The loaded video on a floating screen that bounces on kicks, with RGB split on snares', (g) => {
    const vid = g.add('videoTex'); const scr = g.add('imagePlane', { width: 6 }); const hits = g.add('hits'); const b = g.add('pulse', { strength: 0.06 }); const w = g.add('wobble', { amount: 6, speed: 0.2 });
    const rgb = g.add('rgbShift'); const amt = g.add('remap', { outMin: 0.0005, outMax: 0.012 }, 'Snare → split'); const out = g.add('output');
    g.link(`${vid}.tex`, `${scr}.map`); g.link(`${scr}.obj`, `${w}.obj`); g.link(`${w}.obj`, `${b}.obj`); g.link(`${hits}.kick`, `${b}.amount`); g.link(`${hits}.snare`, `${amt}.value`); g.link(`${amt}.out`, `${rgb}.amount`);
    g.link(`${b}.obj`, `${out}.objects`); g.link(`${rgb}.pass`, `${out}.post`);
  }, 'video mp4 footage screen');
  // 29
  preset('empty', 'Empty graph', 'Just the Output: add nodes with Tab', (g) => { g.add('output'); }, 'blank start');

  // ---------- the Lab: Code ⇄ Nodes ----------
  let lab = null; // set by attach()
  const MODE_KEY = 'three.nodesMode';
  function attach(hook) {
    filterDefs();
    const host = hook.host;
    host.classList.add('tn-host');
    let mode = store.get(MODE_KEY, 'code');
    let state = 'none'; // none | ok | edited | code (no graph) | outline
    let applied = null; // the code we wrote last (so our own writes aren't read back)
    let layerKey = null;
    const graphCache = new Map(); // layer → its last graph
    const codeBtn = el('button', { text: 'Code', title: 'The code of the selected layer' });
    const nodesBtn = el('button', { text: 'Nodes', title: 'The selected layer as nodes and wires (Alt+N)' });
    codeBtn.dataset.feature = 'Lab code view'; nodesBtn.dataset.feature = 'Lab nodes view';
    const sw = el('div', { class: 'tn-switch', title: 'Code ⇄ Nodes' }, codeBtn, nodesBtn);
    const pane = el('div', { class: 'tn-pane', hidden: true });
    const banner = el('div', { class: 'tn-bar', hidden: true });
    const viewHost = el('div', { style: { flex: '1', minHeight: '0', display: 'flex' } });
    const empty = el('div', { class: 'tn-empty', hidden: true });
    pane.append(banner, viewHost, empty);
    host.append(pane, sw);
    const view = NodeView.create(viewHost, {
      registry: reg, graph: NodeView.emptyGraph('three'), storeKey: 'three.nodes', spacePan: false, // Space stays play / pause in the Lab
      onChange: (graph, info) => onGraph(graph, info),
      menuItems: () => [
        'Three.js Lab',
        ['Presets…', 'Start this layer from a music-visual graph', () => presetPicker('replace')],
        ['New layer from a preset…', 'Adds a layer built from a preset', () => presetPicker('layer')],
        ['New sketch from a preset…', '', () => presetPicker('sketch')],
        state === 'edited' ? ['Rebuild the code from these nodes', 'Replaces the code edits made outside the nodes', () => rebuild()] : null,
        ['Outline of the code (read-only)', 'Functions, sliders and music uses of this layer\'s code', () => showOutline()],
        ['Copy the graph (JSON)', '', () => { navigator.clipboard.writeText(JSON.stringify(NodeView.compact(view.getGraph(), reg))); toast('Graph copied', { timeout: 1200 }); }],
      ],
      pickerExtras: () => PRESETS.map((p) => ({ label: `Preset: ${p.name}`, category: 'Presets', desc: p.desc, run: () => usePreset(p.id, 'replace') })),
    });
    const layerOf = () => hook.layer();
    const keyOf = () => `${hook.sketch()?.id}:${layerOf()?.id}`;
    function setMode(m, { quiet = false, init = false } = {}) {
      mode = m === 'nodes' ? 'nodes' : 'code';
      store.set(MODE_KEY, mode);
      codeBtn.classList.toggle('on', mode === 'code');
      nodesBtn.classList.toggle('on', mode === 'nodes');
      pane.hidden = mode !== 'nodes';
      host.closest('.three-split')?.classList.toggle('tn-wide', mode === 'nodes');
      if (mode === 'nodes') {
        if (!init && !hook.codeShown()) hook.showCode(true);
        sync(hook.editor.value, { force: true });
        requestAnimationFrame(() => { view.relayout(); if (!quiet) view.focus(); });
        startProbe();
      } else stopProbe();
    }
    codeBtn.addEventListener('click', () => setMode('code'));
    nodesBtn.addEventListener('click', () => setMode('nodes'));
    // the editor's text changes when a layer is selected, the director edits, history restores… → read it back
    const setValue = hook.editor.setValue.bind(hook.editor);
    hook.editor.setValue = (v) => { setValue(v); if (mode === 'nodes' && v !== applied) sync(v); };
    hook.editor.area.addEventListener('input', () => { applied = null; });
    function setBanner(text, kind, buttons = []) {
      banner.hidden = !text;
      banner.replaceChildren(el('span', { class: `tn-state ${kind || ''}`, text: text || '' }), ...buttons.map(([label, title, fn, cls]) => el('button', { class: cls || 'ghost small', text: label, title, on: { click: fn } })));
    }
    function sync(code, { force = false } = {}) {
      const k = keyOf();
      const sameLayer = k === layerKey;
      layerKey = k;
      if (!force && sameLayer && code === applied) return;
      let r = fromCode(code);
      // the director rewrote the layer from a shortened read ("// @nodes:v1 {…}"): the graph is still known here
      if (!r && /@nodes:v1 \{…\}/.test(code) && graphCache.has(k)) r = { graph: graphCache.get(k), edited: true };
      if (r) graphCache.set(k, r.graph);
      empty.hidden = true;
      if (!r) {
        state = 'code';
        view.setReadOnly(false);
        view.setGraph(NodeView.emptyGraph('three'), { history: false });
        setBanner('');
        empty.replaceChildren(el('div', { class: 'tn-empty-card' },
          el('b', { text: 'This layer is code' }),
          el('p', { text: 'Start it again from a node preset, from an empty graph, or look at an outline of its code (read-only).' }),
          el('div', { class: 'tn-row' },
            el('button', { class: 'primary small', text: 'Presets…', on: { click: () => presetPicker('replace') } }),
            el('button', { class: 'ghost small', text: 'Empty graph', on: { click: () => usePreset('empty', 'replace') } }),
            el('button', { class: 'ghost small', text: 'New layer from a preset…', on: { click: () => presetPicker('layer') } }),
            el('button', { class: 'ghost small', text: 'Outline', on: { click: () => showOutline() } }))));
        empty.hidden = false;
        view.setStatus('');
        return;
      }
      // the same nodes as on screen (slider values saved by the Lab, say): keep the layout you see
      if (sameLayer && state !== 'code') {
        const cur = view.getGraph();
        const ids = (g) => g.nodes.map((n) => n.id).sort().join();
        if (ids(cur) === ids(r.graph)) {
          for (const n of r.graph.nodes) { const m = cur.nodes.find((x) => x.id === n.id); n.x = m.x; n.y = m.y; if (m.collapsed) n.collapsed = true; else delete n.collapsed; }
          r.graph.frames = cur.frames; r.graph.notes = cur.notes;
        }
      }
      state = r.edited ? 'edited' : 'ok';
      view.setGraph(r.graph, { keepView: sameLayer, history: !sameLayer ? false : true });
      view.setReadOnly(r.edited);
      if (r.edited) {
        setBanner('The code was changed outside the nodes (by hand or the director): the nodes are read-only.', 'warn', [
          ['Rebuild code from nodes', 'Replace those code edits with the code made from these nodes', () => rebuild(), 'primary small'],
          ['Keep the code', 'Go back to the code view', () => setMode('code')]]);
      } else setBanner('');
      status(compile(r.graph));
    }
    function status(r) {
      view.setDynamic(r.dynamic);
      view.setErrors(r.errors);
      const g = view.getGraph();
      const sliders = r.parts.tweaks.length;
      const msg = r.errors.length ? `⚠ ${r.errors[0].message}` : r.warnings.length ? `${r.warnings[0].message}` : `${g.nodes.length} nodes · ${g.links.length} wires · ${sliders} slider${sliders === 1 ? '' : 's'}${r.parts.shared.filter ? ' · filter layer' : ''}`;
      view.setStatus(msg, r.errors.length ? 'error' : '');
    }
    const applySoon = debounce((graph) => apply(graph), 220);
    function onGraph(graph, info) {
      if (state === 'edited') return;
      if (state === 'code' && info.kind !== 'value') { state = 'ok'; empty.hidden = true; }
      // dragging a knob that is a Lab slider: move the slider live, write the code when you let go
      if (info.live && info.node && info.field) {
        const key = `${info.node}_${info.field}`;
        if (hook.slider?.(key, info.value)) return;
      }
      applySoon(graph);
    }
    function apply(graph) {
      const r = compile(graph);
      status(r);
      if (r.errors.some((e) => /loop of wires/.test(e.message))) return;
      // only the layout changed (moved nodes, frames, notes): save it without re-running the sketch
      const before = NodeView.extract(hook.editor.value)?.body;
      const rerun = before == null || before !== NodeView.extract(r.code)?.body;
      applied = r.code;
      layerKey = keyOf();
      graphCache.set(layerKey, graph);
      hook.setCode(r.code, { rerun });
    }
    function rebuild() { state = 'ok'; view.setReadOnly(false); setBanner(''); apply(view.getGraph()); toast('Code rebuilt from the nodes', { timeout: 1500 }); }
    function showOutline() {
      const o = NodeView.outline(hook.editor.value);
      if (!o.graph.nodes.length) { toast('Nothing to outline in this code', { timeout: 1500 }); return; }
      NodeView.autoLayout(o.graph, o.registry, { colW: 280 });
      NodeView.showGraph(o.graph, o.registry, { title: `Outline · ${layerOf()?.name || 'layer'}`, note: 'read-only: functions, sliders, music and what uses what', actions: [{ label: 'Presets…', run: () => presetPicker('replace') }] });
    }
    function usePreset(id, where = 'replace') {
      const p = PRESETS.find((x) => x.id === id) || PRESETS.find((x) => x.name.toLowerCase() === String(id).toLowerCase()) || PRESETS.find((x) => `${x.id} ${x.name} ${x.tags}`.toLowerCase().includes(String(id).toLowerCase()));
      if (!p) throw new Error(`No preset "${id}". Presets: ${PRESETS.map((x) => x.id).join(', ')}`);
      const graph = buildPreset(p);
      const r = compile(graph);
      if (where === 'sketch') { hook.newSketch(p.name, r.code); setMode('nodes', { quiet: true }); return p; }
      if (where === 'layer') { hook.addLayer(p.name, r.code); setMode('nodes', { quiet: true }); return p; }
      state = 'ok'; view.setReadOnly(false); setBanner(''); empty.hidden = true;
      view.setGraph(graph);
      applied = r.code; layerKey = keyOf();
      hook.setCode(r.code);
      status(r);
      return p;
    }
    function presetPicker(where) {
      const q = el('input', { class: 'tn-preset-q', placeholder: `Find a preset (${PRESETS.length})…` });
      const grid = el('div', { class: 'tn-presets' });
      const paint = () => {
        const s = q.value.toLowerCase();
        grid.replaceChildren(...PRESETS.filter((p) => `${p.name} ${p.desc} ${p.tags}`.toLowerCase().includes(s)).map((p) => el('button', { class: 'tn-preset', on: { click: () => { d.close(); try { usePreset(p.id, where); } catch (err) { toast(err.message, { type: 'error' }); } } } },
          el('b', { text: p.name }), el('span', { text: p.desc }), el('small', { text: `/nodes-new ${p.id}` }))));
      };
      q.addEventListener('input', paint);
      const d = el('dialog', { class: 'nv-dialog', style: { height: 'auto', maxHeight: '86vh' } },
        el('div', { class: 'nv-dialog-head' }, el('b', { text: where === 'layer' ? 'New layer from a preset' : where === 'sketch' ? 'New sketch from a preset' : 'Start this layer from a preset' }), el('span', { class: 'spacer' }), el('button', { class: 'ghost small', text: '✕', on: { click: () => d.close() } })),
        el('div', { style: { padding: '10px' } }, q, grid));
      d.addEventListener('close', () => d.remove());
      document.body.append(d);
      d.showModal();
      paint();
      q.focus();
    }
    // live values on the nodes while the nodes show
    let probeTimer = 0;
    function startProbe() {
      stopProbe();
      probeTimer = setInterval(async () => {
        if (mode !== 'nodes' || state !== 'ok' || document.hidden || !pane.offsetParent) return;
        const id = layerOf()?.id || 'main';
        const r = await hook.evalInSketch(`globalThis.__nodeValues?.[${JSON.stringify(id)}] ?? globalThis.__nodeValues?.main ?? null`);
        if (r?.ok && r.value && typeof r.value === 'object') view.setLive(r.value);
      }, 300);
    }
    function stopProbe() { clearInterval(probeTimer); probeTimer = 0; }
    addEventListener('keydown', (e) => {
      if (!e.altKey || e.ctrlKey || e.code !== 'KeyN' || !host.isConnected || !host.closest('.tabpane')?.offsetParent) return;
      // not while typing in the docked chat, a dialog or another box (⌥N types ñ / ˜ on a Mac)
      if (e.target.closest?.('.tool-dock, dialog, .composer') || (/^(INPUT|SELECT)$/.test(e.target.tagName))) return;
      e.preventDefault();
      setMode(mode === 'nodes' ? 'code' : 'nodes');
      Usage.key('Alt+N', 'Lab nodes');
    }, true);
    setMode(mode, { quiet: true, init: true });
    lab = {
      view, hook, setMode, usePreset, presetPicker, showOutline, rebuild, sync: () => sync(hook.editor.value, { force: true }),
      get mode() { return mode; }, get state() { return state; },
      // edits from chat / the director: apply to the graph (the view keeps undo) and write the code
      edit(fn) {
        if (mode !== 'nodes') setMode('nodes', { quiet: true });
        if (state === 'code') usePreset('empty', 'replace');
        const wasEdited = state === 'edited';
        if (wasEdited) { state = 'ok'; view.setReadOnly(false); setBanner(''); }
        const out = fn(view);
        apply(view.getGraph());
        return { out, replacedCodeEdits: wasEdited };
      },
    };
    return lab;
  }

  // ---------- chat commands + the director's tool ----------
  async function ensureLab() {
    if (lab) return lab;
    try { Tools.shown(Tools.get('three')); } catch { /* not loaded yet */ }
    for (let i = 0; i < 40 && !lab; i += 1) await new Promise((r) => setTimeout(r, 100));
    if (!lab) { ThreeLab.act('noop'); for (let i = 0; i < 60 && !lab; i += 1) await new Promise((r) => setTimeout(r, 100)); }
    if (!lab) throw new Error('Open the Three.js Lab (Sketch tab) first');
    return lab;
  }
  // "particles1.pulse" → [id, port] (port optional)
  const ref = (s) => { const [id, port] = String(s || '').split('.'); return [id, port]; };
  const parseValue = (v) => {
    if (/^(true|on|yes)$/i.test(v)) return true;
    if (/^(false|off|no)$/i.test(v)) return false;
    if (/^-?\d*\.?\d+(e-?\d+)?$/i.test(v)) return Number(v);
    if (/^\[.*\]$/.test(v)) { try { return JSON.parse(v); } catch { /* text */ } }
    if (/^-?[\d.]+,-?[\d.]+,-?[\d.]+$/.test(v)) return v.split(',').map(Number);
    return v.replace(/^['"]|['"]$/g, '');
  };
  const pairs = (s) => [...String(s || '').matchAll(/([\w]+)=("[^"]*"|'[^']*'|\[[^\]]*\]|\S+)/g)].map((m) => [m[1], parseValue(m[2])]);
  function summary(graph, { full = false } = {}) {
    const g = NodeView.normalize(graph, reg);
    if (!g.nodes.length) return 'The graph is empty.';
    const lines = g.nodes.map((n) => {
      const d = reg.get(n.type);
      const changed = Object.entries(n.values).filter(([k, v]) => { const f = d.fields.find((x) => x.name === k); return full || (f && JSON.stringify(f.value) !== JSON.stringify(v)); }).map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`);
      const ins = g.links.filter((l) => l.to[0] === n.id).map((l) => `${l.to[1]}←${l.from[0]}.${l.from[1]}`);
      return `- ${n.id} (${d.title}${n.title ? `: ${n.title}` : ''})${changed.length ? ` ${changed.join(' ')}` : ''}${ins.length ? ` · ${ins.join(', ')}` : ''}`;
    });
    return lines.join('\n');
  }
  function typeList(filter = '') {
    filterDefs();
    const q = filter.toLowerCase();
    const by = new Map();
    for (const d of reg.list()) {
      if (q && !`${d.type} ${d.title} ${d.category} ${d.keywords || ''}`.toLowerCase().includes(q)) continue;
      if (!by.has(d.category)) by.set(d.category, []);
      by.get(d.category).push(q ? `${d.type} (in: ${d.inputs.map((f) => f.name).join(', ') || '–'}; out: ${d.outputs.map((o) => o.name).join(', ') || '–'})` : d.type);
    }
    return [...by].map(([c, list]) => `**${c}**: ${list.join(', ')}`).join('\n') || `No node type matches "${filter}".`;
  }
  // One line → text: the chat commands and the director's three_nodes tool share this.
  async function run(line) {
    const [verb, ...rest] = String(line || '').trim().split(/\s+/);
    const args = rest.join(' ');
    const v = (verb || 'list').toLowerCase().replace(/^\/?nodes-?/, '') || 'show';
    if (v === 'presets') return PRESETS.filter((p) => !args || `${p.id} ${p.name} ${p.tags}`.toLowerCase().includes(args.toLowerCase())).map((p) => `- \`${p.id}\` ${p.name}: ${p.desc}`).join('\n');
    if (v === 'types') return typeList(args);
    const L = await ensureLab();
    if (v === 'show' || v === 'on' || v === 'nodes') { ThreeLab.act('noop'); L.setMode('nodes'); return null; }
    if (v === 'code' || v === 'off') { L.setMode('code'); return null; }
    if (v === 'new' || v === 'sketch') { const p = L.usePreset(args || 'shape', 'sketch'); return `New sketch "${p.name}" from nodes.\n${summary(L.view.getGraph())}`; }
    if (v === 'layer') { const p = L.usePreset(args || 'shape', 'layer'); return `Added the layer "${p.name}" (nodes).\n${summary(L.view.getGraph())}`; }
    if (v === 'preset' || v === 'replace') { L.setMode('nodes', { quiet: true }); const p = L.usePreset(args || 'shape', 'replace'); return `This layer is now "${p.name}".\n${summary(L.view.getGraph())}`; }
    if (v === 'list' || v === 'graph') { if (L.mode !== 'nodes') L.setMode('nodes', { quiet: true }); return L.state === 'code' ? 'This layer is code, not nodes. Start one with /nodes-new <preset> or /nodes-preset <preset>.' : `${L.state === 'edited' ? '(Read-only: the code was edited outside the nodes; /nodes-rebuild writes the nodes back.)\n' : ''}${summary(L.view.getGraph(), { full: args === 'all' })}`; }
    if (v === 'rebuild') { L.rebuild(); return 'Code rebuilt from the nodes.'; }
    if (v === 'from-code' || v === 'outline') { L.showOutline(); return null; }
    if (v === 'layout') { L.edit((view) => view.layout()); L.view.fit(); return null; }
    if (v === 'fit') { L.view.fit(); return null; }
    if (v === 'undo') { L.view.undo(); return null; }
    if (v === 'redo') { L.view.redo(); return null; }
    if (v === 'json') return `\`\`\`json\n${JSON.stringify(NodeView.compact(L.view.getGraph(), reg))}\n\`\`\``;
    if (v === 'add') {
      const [type, ...kv] = args.split(/\s+/);
      filterDefs();
      const def = reg.get(type) || reg.list().find((d) => d.title.toLowerCase() === String(type).toLowerCase()) || reg.list().find((d) => `${d.type} ${d.title}`.toLowerCase().includes(String(type).toLowerCase()));
      if (!def) throw new Error(`No node type "${type}". See /nodes-types.`);
      const vals = Object.fromEntries(pairs(kv.join(' ')));
      const to = vals.to; delete vals.to; // to=out1.objects connects its first fitting output
      const { out: id } = L.edit((view) => {
        const nid = view.addNode(def.type, { values: vals });
        if (to) { const [tid, tport] = ref(to); const o = def.outputs.find((x) => { const tf = reg.get(view.getGraph().nodes.find((n) => n.id === tid)?.type)?.inputs.find((f) => f.name === tport); return tf && reg.compatible(x.type, tf.type); }); if (o) view.connect(nid, o.name, tid, tport); }
        return nid;
      });
      return `Added ${id} (${def.title}). Inputs: ${def.inputs.map((f) => f.name).join(', ') || '–'}; outputs: ${def.outputs.map((o) => o.name).join(', ') || '–'}.`;
    }
    if (v === 'link' || v === 'connect') {
      const [a, b] = args.split(/\s+|→|->/).filter(Boolean);
      const [x, xp] = ref(a); const [y, yp] = ref(b);
      const { out: ok } = L.edit((view) => view.connect(x, xp, y, yp));
      if (!ok) throw new Error(`Could not connect ${a} to ${b} (check the names with /nodes-list and the types).`);
      return `Connected ${a} → ${b}.`;
    }
    if (v === 'unlink' || v === 'disconnect') { const [y, yp] = ref(args); L.edit((view) => view.disconnect(y, yp || null)); return `Disconnected ${args}.`; }
    if (v === 'set') {
      const [id, ...kv] = args.split(/\s+/);
      const set = pairs(kv.join(' '));
      if (!set.length) throw new Error('Use: /nodes-set <node> field=value …');
      const { out: done } = L.edit((view) => set.filter(([k, val]) => view.setValue(id, k, val)).map(([k]) => k));
      if (!done.length) throw new Error(`Nothing set on ${id}. Fields: ${reg.get(L.view.getGraph().nodes.find((n) => n.id === id)?.type)?.fields.map((f) => f.name).join(', ') || '(no such node)'}`);
      return `Set ${done.map((k) => `${id}.${k}`).join(', ')}.`;
    }
    if (v === 'rm' || v === 'remove' || v === 'delete') { const ids = args.split(/[\s,]+/).filter(Boolean); L.edit((view) => view.removeNodes(ids)); return `Removed ${ids.join(', ')}.`; }
    if (v === 'rename') { const [id, ...t] = args.split(/\s+/); L.edit((view) => view.setTitle(id, t.join(' '))); return null; }
    if (v === 'frame' || v === 'group') {
      const [title, ...want] = args.split(/\s+/);
      const have = new Set(L.view.getGraph().nodes.map((n) => n.id));
      const ids = (want.length ? want : L.view.selection()).filter((x) => have.has(x));
      if (!ids.length) throw new Error(`No such nodes${want.length ? `: ${want.join(', ')}` : ' selected'}. Nodes: ${[...have].join(', ')}`);
      L.edit((view) => view.frame(ids, { title: title || 'Group' }));
      return `Framed ${ids.join(', ')} as "${title || 'Group'}" (their slider group in the Lab).`;
    }
    if (v === 'note') { L.edit((view) => view.note(args)); return null; }
    throw new Error(`Unknown: ${verb}. Try presets, types, new, layer, preset, list, add, link, unlink, set, rm, layout, rebuild, outline.`);
  }

  const area = 'Nodes';
  const presetComplete = (a) => PRESETS.filter((p) => `${p.id} ${p.name}`.toLowerCase().includes(a.toLowerCase())).slice(0, 14).map((p) => ({ value: p.id, label: p.name, hint: p.desc }));
  const nodeIds = () => (lab ? lab.view.getGraph().nodes.map((n) => n.id) : []);
  const cmd = (name, o) => Commands.register({ name, area, ...o, run: async (args) => { const r = await run(`${o.verb || name} ${args}`); return r || undefined; } });
  if (typeof Commands !== 'undefined') {
    // The director only gets its three_nodes tool when you opt in (it adds ~90 tokens to each of its messages).
    Commands.register({
      name: 'nodes-director', area, args: 'on|off', desc: 'Let Three.js director agents edit node graphs themselves (adds ~90 tokens per message)',
      complete: () => [{ value: 'on' }, { value: 'off' }],
      run: async (a) => {
        const dirs = H.config.agents.filter((x) => x.threeTools);
        if (!dirs.length) return 'No Three.js director agent yet.';
        const want = a.trim() ? a.trim() === 'on' : !dirs[0].nodesTool;
        for (const d of dirs) d.nodesTool = want || undefined;
        await saveConfig();
        return want ? `Directors can now edit node graphs (${dirs.map((d) => d.name).join(', ')}). Takes effect in their next new chat.` : 'Directors no longer get the node tool; you can still use /nodes yourself.';
      },
    });
    Commands.register({ name: 'nodes', area, args: '[code]', desc: 'Show the selected Lab layer as nodes (/nodes code: back to the code)', complete: () => [{ value: 'code', hint: 'back to the code' }], run: async (a) => (await run(a.trim() === 'code' ? 'code' : 'show')) || undefined });
    cmd('nodes-new', { verb: 'new', args: '<preset>', desc: 'New Lab sketch from a node preset (beat particles, tunnel, spectrum…)', complete: presetComplete });
    cmd('nodes-layer', { verb: 'layer', args: '<preset>', desc: 'Add a layer built from a node preset', complete: presetComplete });
    cmd('nodes-preset', { verb: 'preset', args: '<preset>', desc: 'Replace the selected layer with a node preset', complete: presetComplete });
    cmd('nodes-presets', { verb: 'presets', args: '[filter]', desc: 'List the node presets for music visuals' });
    cmd('nodes-types', { verb: 'types', args: '[filter]', desc: 'List the node types (with a filter: their inputs and outputs)' });
    cmd('nodes-list', { verb: 'list', args: '[all]', desc: 'The selected layer\'s graph: nodes, changed values and wires' });
    cmd('nodes-add', { verb: 'add', args: '<type> [field=value…] [to=node.input]', desc: 'Add a node (to= wires it into a node\'s input)', complete: (a) => reg.list().filter((d) => d.type.toLowerCase().startsWith(a.toLowerCase()) || d.title.toLowerCase().includes(a.toLowerCase())).slice(0, 14).map((d) => ({ value: d.type, label: d.title, hint: d.category })) });
    cmd('nodes-link', { verb: 'link', args: '<node.output> <node.input>', desc: 'Wire an output into an input', complete: (a) => nodeIds().filter((id) => id.startsWith(a)).map((id) => ({ value: `${id}.` })) });
    cmd('nodes-unlink', { verb: 'unlink', args: '<node.input>', desc: 'Remove the wires into an input' });
    cmd('nodes-set', { verb: 'set', args: '<node> field=value…', desc: 'Set node values (numbers, #colors, on/off, x,y,z)', complete: (a) => nodeIds().filter((id) => id.startsWith(a)).map((id) => ({ value: `${id} ` })) });
    cmd('nodes-rm', { verb: 'rm', args: '<node…>', desc: 'Delete nodes', complete: (a) => nodeIds().filter((id) => id.startsWith(a)).map((id) => ({ value: id })) });
    cmd('nodes-layout', { verb: 'layout', desc: 'Tidy the graph into columns (inputs → output)' });
    cmd('nodes-frame', { verb: 'frame', args: '<title> [node…]', desc: 'Frame nodes under a title (it becomes their slider group)' });
    cmd('nodes-from-code', { verb: 'outline', desc: 'Outline of the selected layer\'s code as nodes (read-only)' });
    cmd('nodes-rebuild', { verb: 'rebuild', desc: 'Write the code from the nodes again (after code edits outside them)' });
    cmd('nodes-undo', { verb: 'undo', desc: 'Undo the last node edit' });
    cmd('nodes-json', { verb: 'json', desc: 'The graph as compact JSON' });
  }
  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Lab: Nodes ⇄ Code', () => ensureLab().then((L) => { ThreeLab.act('noop'); L.setMode(L.mode === 'nodes' ? 'code' : 'nodes'); }));
    AppUI.addAction('Lab: Node presets…', () => ensureLab().then((L) => { ThreeLab.act('noop'); L.setMode('nodes'); L.presetPicker('replace'); }));
    AppUI.addAction('Lab: New layer from a node preset…', () => ensureLab().then((L) => { ThreeLab.act('noop'); L.presetPicker('layer'); }));
  }
  // The Three Director's three_nodes tool: one command line, the same verbs as the chat commands.
  async function tool(args = {}) {
    try {
      const text = await run(String(args.command || 'list'));
      const L = lab;
      const r = L && L.state !== 'code' ? compile(L.view.getGraph()) : null;
      await new Promise((res) => setTimeout(res, 900));
      return { ok: true, value: { result: text || 'done', ...(r ? { errors: r.errors.map((e) => `${e.node || ''} ${e.message}`.trim()), warnings: r.warnings.map((e) => e.message) } : {}), note: 'It runs in the Lab now; three_console / three_screenshot show the result.' } };
    } catch (err) { return { ok: false, error: err.message }; }
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_nodes'], (name, args) => tool(args));
  // NodeView.openCode(code) for three.js sketches: a sketch made with nodes reopens as nodes; other three.js code
  // opens in the Lab with its outline.
  NodeView.registerAdapter({
    id: 'three', label: 'Three.js Lab', kinds: ['three'],
    detect: (code, lang) => /from\s+['"]three['"]|\bTHREE\.|\bfilter\(\s*['"]/.test(code) && !/^(py|python|glsl|frag|vert)$/i.test(lang || ''),
    open: async (code, lang, graph) => {
      ThreeLab.openCode(code);
      const L = await ensureLab();
      setTimeout(() => { L.setMode('nodes'); if (!graph) L.showOutline(); }, 400);
      return L;
    },
  });

  return { registry: reg, compile, fromCode, presets: () => PRESETS.map(({ id, name, desc }) => ({ id, name, desc })), buildPreset: (id) => buildPreset(PRESETS.find((p) => p.id === id)), attach, run, tool, summary, get lab() { return lab; } };
})();
