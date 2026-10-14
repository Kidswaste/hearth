// (round 37, directorlean) A Three Director harness without Electron: tools/three-director.js (any version, from a
// file or a git ref) loaded in a Node vm with canvas / image stubs, and a fake Lab director API (the `d` that
// tools/three.js hands it) over a realistic scene: three layers (the concise fixture's 103-line tunnel, a 70-line
// particle layer, a glow filter), sliders parsed from their tweak() blocks, a 3:12 song with sections / hits / energy,
// errors and console lines when asked. labCall mirrors tools/three.js's own handlers for the tools ThreeDirector
// leaves to the Lab (layers, select_layer, media_control, input, contact_sheet…), so before / after compare the
// same answers the model would read. Pictures carry their size in their bytes: tokens ≈ w × h / 750 (Claude).
// Used by dev/directorlean-measure.js and dev/directorlean-test.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const tok = (s) => Math.ceil(String(s ?? '').length / 4);
// what the MCP server sends the model (mcp/common.js fmtValue)
const { fmtValue } = require(path.join(ROOT, 'mcp', 'common.js'));

// ---------- pictures: a data URL whose bytes say its size ----------
const fakeUrl = (w, h, mime = 'image/jpeg') => `data:${mime};base64,${Buffer.from(`IMG:${Math.round(w)}x${Math.round(h)}:${'x'.repeat(Math.round((w * h) / (mime === 'image/png' ? 3 : 18)) % 4096)}`).toString('base64')}`;
function dimsOf(data) {
  const m = Buffer.from(String(data).replace(/^data:[^,]*,/, ''), 'base64').toString('latin1').match(/^IMG:(\d+)x(\d+)/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}
// Claude bills a picture at about width × height / 750 tokens after shrinking it to ≤ 1568 px on its long side
function imageTokens(data) {
  const d = dimsOf(data);
  if (!d) return 0;
  const k = Math.min(1, 1568 / Math.max(d.w, d.h));
  return Math.round((d.w * k * d.h * k) / 750);
}

// ---------- the director, loaded in a vm ----------
function sourceOf(ref) {
  if (!ref || ref === 'work') return fs.readFileSync(path.join(ROOT, 'tools', 'three-director.js'), 'utf8');
  return execFileSync('git', ['-C', ROOT, 'show', `${ref}:tools/three-director.js`], { encoding: 'utf8' });
}
function loadDirector(ref, { pixel = () => 0 } = {}) {
  const kv = new Map();
  class Ctx { drawImage() {} fillRect() {} fillText() {} measureText(t) { return { width: String(t).length * 7 }; } getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(pixel()) }; } }
  const canvas = () => ({ width: 300, height: 150, getContext: () => new Ctx(), toDataURL(mime = 'image/png') { return fakeUrl(this.width, this.height, mime); } });
  class FakeImage { set src(u) { this._src = u; const d = dimsOf(u) || { w: 1, h: 1 }; this.width = d.w; this.height = d.h; } get src() { return this._src; } decode() { return Promise.resolve(); } }
  const nativeHooks = { send: [], event: [] };
  const ctx = {
    console, setTimeout: (fn) => setImmediate(fn), clearTimeout: () => {}, Promise, JSON, Math, Map, Set, Number, String, Array, Object, Boolean, RegExp, Error, Uint8Array, Uint8ClampedArray, Uint16Array, Date,
    performance: { now: () => Date.now() },
    document: { createElement: () => canvas() },
    Image: FakeImage,
    store: { get: (k, d) => (kv.has(k) ? kv.get(k) : d), set: (k, v) => kv.set(k, v) },
    canvasDataUrl: async (c, mime) => c.toDataURL(mime),
    toast: () => {},
    H: { agent: () => ({ threeTools: true }) },
    Native: { hooks: nativeHooks },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const D = vm.runInContext(`${sourceOf(ref)}\n;ThreeDirector`, ctx, { filename: 'three-director.js' });
  return { D, hooks: nativeHooks, store: ctx.store };
}

// ---------- the scene ----------
const TUNNEL = fs.readFileSync(path.join(__dirname, 'fixtures', 'concise-scene.js'), 'utf8').split('\n').filter((l) => !/^\/\/ (A typical|used by)/.test(l)).join('\n');
const SPARKLES = `import * as THREE from 'three';

const P = tweak({
  count: { value: 1800, min: 200, max: 6000, step: 1, label: 'Sparks', group: 'Shape' },
  size: { value: 0.06, min: 0.01, max: 0.3, label: 'Size', group: 'Shape' },
  spread: { value: 3.5, min: 1, max: 8, label: 'Spread', group: 'Shape' },
  rise: { value: 0.4, min: 0, max: 2, label: 'Rise speed', group: 'Motion' },
  swirl: { value: 0.6, min: 0, max: 3, label: 'Swirl', group: 'Motion' },
  color: { value: '#ffd75e', label: 'Spark color', group: 'Color' },
  burst: { value: 1.2, min: 0, max: 4, label: 'Kick burst', group: 'Music', hint: 'How far sparks jump on a kick' },
  fade: { value: 0.8, min: 0, max: 1, label: 'Fade', group: 'Look' },
});

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 6;

let points = null;
function build() {
  if (points) { scene.remove(points); points.geometry.dispose(); points.material.dispose(); }
  const n = Math.round(P.count);
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * P.spread * 2;
    pos[i * 3 + 1] = (Math.random() - 0.5) * P.spread * 2;
    pos[i * 3 + 2] = (Math.random() - 0.5) * P.spread;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.PointsMaterial({ color: P.color, size: P.size, transparent: true, opacity: P.fade, blending: THREE.AdditiveBlending, depthWrite: false });
  points = new THREE.Points(geo, mat);
  points.name = 'sparks';
  scene.add(points);
}
build();
let built = P.count;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let punch = 0;
onHit('kick', (s) => { punch = Math.max(punch, s); });
renderer.setAnimationLoop((now) => {
  const t = now / 1000;
  if (Math.round(P.count) !== built) { build(); built = Math.round(P.count); }
  punch *= 0.9 ** f60;
  const pos = points.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let y = pos.getY(i) + 0.01 * P.rise * f60;
    if (y > P.spread) y = -P.spread;
    pos.setY(i, y);
  }
  pos.needsUpdate = true;
  points.rotation.z = t * 0.1 * P.swirl;
  points.scale.setScalar(1 + punch * P.burst * 0.2);
  points.material.color.set(P.color);
  points.material.size = P.size * (1 + punch);
  points.material.opacity = P.fade;
  renderer.render(scene, camera);
});`;
const GLOW = `// Glow: a filter layer (restyles every layer below it)
const P = tweak({
  strength: { value: 0.9, min: 0, max: 3, label: 'Strength', group: 'Look' },
  radius: { value: 0.5, min: 0, max: 1, label: 'Radius', group: 'Look' },
  threshold: { value: 0.6, min: 0, max: 1, label: 'Threshold', group: 'Look' },
  tint: { value: '#ff4fd8', label: 'Tint', group: 'Color' },
});
filter('glow', P);`;
// a 200+ line layer (the outline case): the tunnel with a block of helpers in front
const HELPERS = Array.from({ length: 14 }, (_, k) => `function helper${k}(a, b = ${k + 1}) {\n  const x = Math.sin(a * ${k + 1}) * b;\n  const y = Math.cos(a * ${k + 2}) * b;\n  if (x > y) return x - y * 0.5;\n  return y + x * 0.25;\n}\n`).join('\n');
const BIG = TUNNEL.replace("const renderer =", `// ---------- HELPERS ----------\n${HELPERS}\nconst renderer =`);

// tweak() block → the Lab's controls (key, label, group, value, min, max)
function parseSliders(code) {
  const out = [];
  for (const ln of code.split('\n')) {
    const m = ln.match(/^\s*(\w+):\s*\{\s*value:\s*('[^']*'|-?[\d.]+|true|false)(?:,\s*min:\s*(-?[\d.]+),\s*max:\s*(-?[\d.]+))?.*?label:\s*'([^']*)'(?:,\s*group:\s*'([^']*)')?/);
    if (!m) continue;
    const v = m[2].startsWith("'") ? m[2].slice(1, -1) : m[2] === 'true' ? true : m[2] === 'false' ? false : Number(m[2]);
    out.push({ key: m[1], label: m[5], group: m[6], value: v, ...(m[3] != null ? { min: Number(m[3]), max: Number(m[4]) } : {}), live: true });
  }
  return out;
}

function fakeLab({ big = false } = {}) {
  const S = { pixel: 10, errors: [], console: ['tunnel: 24 rings', 'sparkles: 1800 points'], frame: { id: '9:16', width: 1080, height: 1920 }, time: 31.4, playing: false };
  const mk = (id, name, code, extra = {}) => ({ id, name, code, visible: true, opacity: 1, blend: 'normal', vals: {}, ...extra });
  const layers = [mk('l1', 'Tunnel', big ? BIG : TUNNEL), mk('l2', 'Sparkles', SPARKLES, { blend: 'add', keys: { opacity: [{ t: 0, v: 0 }, { t: 8, v: 1 }] }, music: { burst: { source: 'kick' } } }), mk('l3', 'Glow', GLOW, { kind: 'filter (changes the layers below it)' })];
  let selId = 'l1';
  const sketch = { id: 'sk1', name: 'Neon tunnel' };
  const find = (ref) => {
    if (ref == null || ref === '' || ref === 'selected') return layers.find((L) => L.id === selId);
    if (ref === 'top') return layers.at(-1);
    if (ref === 'bottom') return layers[0];
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) return layers[Number(ref) - 1];
    const r = String(ref).toLowerCase();
    return layers.find((L) => L.id === ref) || layers.find((L) => L.name.toLowerCase() === r) || layers.find((L) => L.name.toLowerCase().includes(r));
  };
  const must = (ref) => { const L = find(ref); if (!L) throw new Error(`No layer "${ref}". Layers: ${layers.map((x) => x.name).join(', ')}`); return L; };
  const controls = (L) => parseSliders(L.code).map((c) => ({ ...c, value: c.key in L.vals ? L.vals[c.key] : c.value, ...(L.music?.[c.key] ? { followsMusic: L.music[c.key] } : {}) }));
  const unsaved = (L) => parseSliders(L.code).filter((c) => c.key in L.vals && L.vals[c.key] !== c.value).map((c) => ({ name: c.label, line: L.code.split('\n').findIndex((l) => l.includes(`${c.key}: {`)) + 1, inCode: JSON.stringify(c.value), slider: L.vals[c.key] }));
  const summary = () => layers.map((L, i) => ({ id: L.id, name: L.name, ...(L.kind ? { kind: L.kind } : {}), order: `${i + 1} of ${layers.length} (1 = bottom)`, selected: L.id === selId, visible: L.visible, opacity: L.opacity, blend: L.blend, plays: 'whole song', sliders: controls(L).map((c) => c.label), ...(L.keys ? { keyframes: Object.fromEntries(Object.entries(L.keys).map(([p, ks]) => [p, ks.map((k) => `${k.t}s=${k.v}`)])) } : {}) }));
  const sel = () => must(null);
  const report = () => ({
    sketch: sketch.name, layer: sel().name, layers: summary(),
    errors: S.errors.map((e) => ({ ...e })),
    console: S.console.slice(-30),
    stats: { fps: 58, worstFrameMs: 24, renderMs: 3.4, drawCalls: 31, triangles: 1180000, points: 1800, textures: 4 },
    frame: S.frame,
    ...(controls(sel()).length ? { sliders: controls(sel()) } : { sliders: 'none: add named controls with tweak()' }),
    ...(unsaved(sel()).length ? { unsavedSliders: unsaved(sel()) } : {}),
    music: { file: 'C:\\Users\\owner\\Music\\night-drive.mp3', bpm: 124, duration: 192.3, time: S.time, playing: S.playing },
  });
  const codeOrOutline = (code) => { // the Lab's own (350 lines)
    const lines = code.split('\n');
    if (lines.length <= 350) return { code };
    return { outline: lines.filter((l) => /^function|^const/.test(l)).join('\n'), note: 'outline' };
  };
  const energy = Array.from({ length: 39 }, (_, i) => ({ at: i * 5, level: Math.round((0.3 + 0.5 * Math.abs(Math.sin(i / 4))) * 100) / 100, bass: Math.round((0.2 + 0.6 * Math.abs(Math.sin(i / 3))) * 100) / 100, mid: 0.41, highs: 0.33 }));
  const hits = (n, step) => ({ count: n, first: Array.from({ length: 12 }, (_, i) => Math.round((0.48 + i * step) * 1000) / 1000) });
  const media = {
    loaded: true,
    info: () => ({ loaded: true, file: 'C:\\Users\\owner\\Music\\night-drive.mp3', video: false, duration: 192.3, time: S.time, playing: S.playing, loop: 'off',
      grid: { bpm: 124, firstDownbeat: 0.48, beatsPerBar: 4, setBy: 'the user (trust it)' },
      hits: { kick: hits(96, 0.4839), snare: hits(48, 0.9677), hit: hits(9, 7.74), setBy: 'the user, by hand: cut and hit on these, not on guesses' },
      beats: 396, sections: [{ start: 0, end: 15.5, energy: 0.3, label: 'intro' }, { start: 15.5, end: 46.4, energy: 0.55, label: 'verse' }, { start: 46.4, end: 64.1, energy: 0.7, label: 'build' }, { start: 64.1, end: 95.1, energy: 0.92, label: 'drop' }, { start: 95.1, end: 126, energy: 0.5, label: 'break' }, { start: 126, end: 157, energy: 0.9, label: 'drop 2' }, { start: 157, end: 192.3, energy: 0.35, label: 'outro' }],
      drops: [64.1, 126], detectedHits: { kick: 388, snare: 190, hats: 760, note: 'found in the audio; /mark-kicks writes them as markers' }, style: { preset: 'house', why: '124 bpm, four on the floor' }, energyEvery5s: energy }),
    seek: (t) => { S.time = t; }, toggle: (on) => { S.playing = on; }, setLoop: () => true,
  };
  const d = {
    codeOf(ref = null) { const L = must(ref); return { id: L.id, name: L.name, sketchId: sketch.id, sketch: sketch.name, code: L.code }; },
    getCode: () => ({ sketch: sketch.name, layer: sel().name, layers: summary(), frame: S.frame, lines: sel().code.split('\n').length, ...codeOrOutline(sel().code), ...(controls(sel()).length ? { sliders: controls(sel()) } : {}), ...(unsaved(sel()).length ? { unsavedSliders: unsaved(sel()), note: 'The user moved these sliders but has not saved them into the code; keep their values when you rewrite.' } : {}) }),
    report,
    layers: () => ({ sketch: sketch.name, selected: sel().name, layers: summary() }),
    selectLayer(ref) { selId = must(ref).id; return d.getCode(); },
    async updateLayer(ref, patch = {}) {
      const L = must(ref);
      if (patch.code != null) { L.code = String(patch.code); L.vals = {}; S.pixel += 7; S.errors = S.errors.filter((e) => e.layer !== L.name); S.console = S.console.filter((l) => !l.startsWith(`[${L.name}]`)); S.console.push(`${L.name.toLowerCase()}: re-run`); }
      for (const k of ['visible', 'opacity', 'blend', 'name']) if (k in patch) L[k] = patch[k];
      if (patch.order != null) { layers.splice(layers.indexOf(L), 1); layers.splice(patch.order === 'top' ? layers.length : patch.order === 'bottom' ? 0 : Number(patch.order) - 1, 0, L); S.pixel += 3; }
      return { updated: L.name, ...report() };
    },
    async setCode(code) { return d.updateLayer(null, { code }); },
    async addLayer({ name, code, template }) {
      const L = mk(`l${layers.length + 1}`, name || template || 'Layer', code || (template === 'glow' ? GLOW : '// template'));
      layers.push(L); selId = L.id; S.pixel += 9;
      return { added: L.name, ...report() };
    },
    sliders(ref, set) {
      const L = ref ? must(ref) : sel();
      const changed = [];
      if (set) for (const [k, v] of Object.entries(set)) { const c = parseSliders(L.code).find((x) => x.key === k); if (c) { L.vals[k] = v; changed.push(k); } }
      if (changed.length) S.pixel += 2;
      return { layer: L.name, changed, sliders: controls(L), looks: [{ name: 'Calm' }, { name: 'Drop' }] };
    },
    evalInSketch: async (code) => ({ ok: true, value: /children/.test(code) ? 26 : /P\./.test(code) ? { speed: 0.8, kick: 0.4, bloom: 1.1 } : 'ok' }),
    inputToSketch: async (actions) => ({ ok: true, log: actions.map((a) => Object.keys(a).join(' ')) }),
    shot: async () => fakeUrl(S.frame.width, S.frame.height, 'image/png'),
    shotSmall: async (max) => { const k = max / Math.max(S.frame.width, S.frame.height); return fakeUrl(S.frame.width * k, S.frame.height * k, 'image/jpeg'); },
    async contactSheet() { // 8 frames at the cues, 420 px tiles, 4 columns (tools/three.js sheetFromFrames)
      const tw = 420; const th = Math.round(tw * (S.frame.height / S.frame.width));
      return { dataUrl: fakeUrl(4 * (tw + 6) + 6, 2 * (th + 22 + 6) + 6, 'image/jpeg'), frames: Array.from({ length: 8 }, (_, i) => ({ n: i + 1, time: Math.round(i * 24 * 100) / 100, cue: ['intro', 'verse', 'build', 'drop', 'break', 'drop 2', 'outro', ''][i] || undefined })) };
    },
    media, ensureTimeline() {},
    setFrame(id) { S.frame = { id, width: 1080, height: id === '16:9' ? 608 : 1920 }; },
    timeline: () => ({}),
  };
  // test knobs: break a layer, let the owner move / save sliders or edit by hand
  const lab = {
    d, S, layers,
    breakLayer(name, line, message, times = 3) { for (let i = 0; i < times; i += 1) S.errors.push({ layer: name, line, message }); S.console.push(`[${name}] [error] (line ${line}) ${message}`); },
    ownerEdit(name, find, replace) { const L = must(name); L.code = L.code.replace(find, replace); S.pixel += 1; },
  };
  return lab;
}

// mirrors tools/three.js's own director handlers (directorCall after ThreeDirector) for the tools measured here
async function labCall(tool, args, d) {
  if (tool === 'three_get_code') return { ok: true, value: d.getCode() };
  if (tool === 'three_console') return { ok: true, value: d.report() };
  if (tool === 'three_layers') return { ok: true, value: d.layers() };
  if (tool === 'three_select_layer') return { ok: true, value: d.selectLayer(args.layer) };
  if (tool === 'three_media_control') {
    if (args.action === 'seek' || args.time != null) d.media.seek(Number(args.time) || 0);
    if (args.action === 'play') d.media.toggle(true);
    if (args.action === 'pause') d.media.toggle(false);
    return { ok: true, value: d.media.info() };
  }
  if (tool === 'three_media_info') return { ok: true, value: d.media.info() };
  if (tool === 'three_input') {
    const r = await d.inputToSketch(args.actions || []);
    if (!args.screenshot) return { ok: true, value: { done: r.log } };
    const url = await d.shot();
    return { ok: true, value: { done: r.log }, images: [{ data: url.split(',')[1], mime: 'image/png' }] };
  }
  if (tool === 'three_contact_sheet') { const s = await d.contactSheet(); return { ok: true, images: [{ data: s.dataUrl.split(',')[1], mime: 'image/jpeg' }], value: { frames: s.frames, note: 'Numbered left to right, top to bottom.' } }; }
  if (tool === 'three_update_layer') return { ok: true, value: await d.updateLayer(args.layer, { ...(args.settings || {}), ...(args.order != null ? { order: args.order } : {}) }) };
  return { ok: false, error: `Unknown tool ${tool}` };
}

// One director (a version) on one fresh scene, with a chat session: call(tool, args) → { text, images, tokens }
function session(ref, { big = false, chatId = 'chat-1' } = {}) {
  const lab = fakeLab({ big });
  const { D, hooks } = loadDirector(ref, { pixel: () => lab.S.pixel % 256 });
  const chat = { id: chatId, session: {} };
  let n = 0;
  return {
    D, lab, chat,
    // a user message: the hooks the app fires (Native.hooks.send), then its reply ends 'done' with the session id
    turn() { for (const fn of hooks.send) fn('dir', chat, 'ask'); },
    done() { chat.session = { id: 'sess-1' }; for (const fn of hooks.event) fn({ type: 'done' }, chat); },
    async call(tool, args = {}) {
      n += 1;
      let r;
      try { // (the app's bridge turns a throw into an error result the same way)
        r = await D.handle(tool, { ...args }, lab.d, { chatId });
        if (!r) { r = await labCall(tool, args, lab.d); if (D.trim) r = await D.trim(tool, args, r); }
      } catch (err) { r = { ok: false, error: err.message }; }
      const text = r.ok === false ? `Error: ${r.error}` : fmtValue(r.value);
      const imgs = r.images || [];
      const pic = imgs.reduce((s, im) => s + imageTokens(im.data), 0);
      return { r, text, textTok: tok(text), picTok: pic, pics: imgs.map((im) => dimsOf(im.data)), tokens: tok(text) + pic };
    },
  };
}

module.exports = { loadDirector, fakeLab, labCall, session, imageTokens, dimsOf, fakeUrl, tok, parseSliders, TUNNEL, SPARKLES, GLOW, BIG };
