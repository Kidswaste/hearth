// (round 39, labmemory) A long Lab session stays light: scene after scene (40 switches between six scenes, new scenes
// from templates, director edits re-run, 🎲 variations), the preview page's GPU and JS memory level off.
// Each sample comes after a forced GC (the preview's own process and the window), with window.__labMem() inside the
// preview: GL objects alive on every context (pooled ones too), linked programs kept, three.js' counters, contexts,
// canvases, videos, AudioContexts, object URLs, ImageBitmaps, layer modules; the preview's JS heap and its arrays'
// memory (ArrayBuffers live outside the JS heap: geometry, textures' data); the window's heap and DOM nodes.
// Then the guard: with a tiny budget, a switch makes the preview clean up by itself, and one calm note comes.
// Fails above the budgets (BUDGET below), or when something keeps growing from the middle of the session to its end.
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/checks/labmemory.js
//   localStorage.lmRounds (an --eval) = rounds of 8 switches (default 5 = 40 switches)
const out = { steps: [], samples: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const ROUNDS = Number(localStorage.getItem('lmRounds')) || 5;

await SQL.lab();
await ThreeLab.cmd({ show: true }); // (the sliders panel: 🎲 variations need it)
const d = ThreeLab.director;
const sbx = async (code) => { for (let i = 0; i < 6; i++) { const r = await d.evalInSketch(code); if (r?.ok) return r.value; await wait(400); } return null; };
// the scenes: each its own shader (a new program), textures (a canvas, a data texture), a render target drawn every
// frame, a PMREM environment on some, an object URL never revoked on one
const scene = (i) => `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: ${i % 2 === 0} });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color().setHSL(${(i * 0.17) % 1}, 0.5, 0.5);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const g = cv.getContext('2d');
g.fillStyle = '#${(0x334455 + i * 0x111111).toString(16).slice(-6)}'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#fff'; g.fillText('scene ${i}', 20, 40);
const ct = new THREE.CanvasTexture(cv);
const data = new Uint8Array(128 * 128 * 4).fill(${40 + i * 30});
const dt = new THREE.DataTexture(data, 128, 128); dt.needsUpdate = true;
const rt = new THREE.WebGLRenderTarget(256, 256);
const rtScene = new THREE.Scene(); rtScene.background = new THREE.Color(${i} / 6, 0.3, 0.6);
const rtBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1, ${4 + i}, 4, 4), new THREE.MeshBasicMaterial({ map: dt }));
rtScene.add(rtBox);
const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 }, a: { value: ct }, b: { value: rt.texture } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform float t; uniform sampler2D a; uniform sampler2D b; varying vec2 vUv; void main() { gl_FragColor = vec4(mix(texture2D(a, vUv).rgb, texture2D(b, vUv).rgb, 0.5 + 0.5 * sin(t + ${i}.0)), 1.0); }' });
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, ${120 + i * 20}, 16), mat); scene.add(knot);
for (let k = 0; k < 12; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16 + k, 8), new THREE.MeshStandardMaterial({ color: k * 0x111111 + ${i} })); m.position.set(Math.cos(k) * 1.8, Math.sin(k) * 1.2, -1); scene.add(m); }
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));
${i % 3 === 0 ? "const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new THREE.Scene().add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ color: 0x8899aa, side: THREE.BackSide })))).texture;" : ''}
${i === 4 ? "const u = URL.createObjectURL(new Blob([new Uint8Array(64 * 1024)])); new THREE.TextureLoader().load(u, () => {}, undefined, () => {});" : ''}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
renderer.setAnimationLoop((now) => { mat.uniforms.t.value = now / 1000; knot.rotation.y = now / 2000; rtBox.rotation.x = now / 900; renderer.setRenderTarget(rt); renderer.render(rtScene, camera); renderer.setRenderTarget(null); renderer.render(scene, camera); });
`;
// a point cloud of 1.5M numbers (6 MB), the kind of data a particle scene holds, with two sliders (for 🎲 variations)
const cloud = `import * as THREE from 'three';
const P = tweak({ size: [0.02, 0.005, 0.08], spin: [1, 0, 3] });
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x203040);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 4;
const arr = new Float32Array(1500000); for (let k = 0; k < arr.length; k++) arr[k] = (Math.random() - 0.5) * 4;
const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: P.size, color: 0xffcc88 })); scene.add(pts);
renderer.setAnimationLoop((now) => { pts.rotation.y = now / 3000 * P.spin; pts.material.size = P.size; renderer.render(scene, camera); });`;
// a 2D canvas scene with a video element, an interval and a window listener of its own
const flat = `const c = document.createElement('canvas'); c.width = 400; c.height = 300; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d'); function draw(t) { g.fillStyle = '#123'; g.fillRect(0, 0, 400, 300); g.fillStyle = '#fc6'; g.beginPath(); g.arc(200 + Math.cos(t / 500) * 80, 150, 40, 0, 7); g.fill(); requestAnimationFrame(draw); } requestAnimationFrame(draw);
const v = document.createElement('video'); v.muted = true; v.loop = true;
setInterval(() => {}, 1000); addEventListener('pointermove', () => {});`;
const ids = [];
for (let i = 0; i < 6; i++) ids.push(ThreeLab.scenes.create({ name: `labmemory ${i}`, code: i === 5 ? flat : i === 3 ? cloud : scene(i) }).id);
step('six scenes made', new Set(ids.filter(Boolean)).size === 6, ids);
let notes = 0;
addEventListener('message', (e) => { if (e.data?.source === 'three-sandbox' && e.data.type === 'mem-note') notes += 1; });

const drawnWait = async (go) => {
  let drawn = false; const on = (e) => { if (e.data?.source === 'three-sandbox' && e.data.type === 'stack-drawn') drawn = true; };
  addEventListener('message', on); try { await go(); await until(() => drawn, 20000); } finally { removeEventListener('message', on); }
  await wait(450); // (the cross-fade)
  return drawn;
};
const gc = async () => {
  for (let i = 0; i < 2; i++) { await smoke({ target: 'three-sandbox', cdp: 'HeapProfiler.collectGarbage', params: {} }); await smoke({ cdp: 'HeapProfiler.collectGarbage', params: {} }); await wait(150); }
};
const MB = (b) => (b ? +(b / 1048576).toFixed(1) : null);
async function sample(label) {
  await wait(3200); // (what a switch leaves is emptied 2.5 s after it; the guard reads at 3 s)
  await gc();
  const m = await sbx('return window.__labMem ? window.__labMem() : null');
  const ph = await smoke({ target: 'three-sandbox', cdp: 'Runtime.getHeapUsage', params: {} });
  const hh = await smoke({ cdp: 'Runtime.getHeapUsage', params: {} });
  const dom = await smoke({ cdp: 'Memory.getDOMCounters', params: {} });
  const s = { label, pageHeapMB: MB(ph.usedSize), pageArraysMB: MB(ph.backingStorageSize), hubHeapMB: MB(hh.usedSize), hubNodes: dom.nodes, ...(m || {}) };
  out.samples.push(s);
  return s;
}
const open = async (id) => (ThreeLab.scenes.currentId() === id ? true : drawnWait(() => ThreeLab.scenes.open(id)));
// (before / after: localStorage.lmOwn = '0' leaves what gone layers made as it was before round 39)
if (localStorage.getItem('lmOwn') === '0') await sbx('window.__labMemGuard.own(false); return 1');
await open(ids[0]);
await sample('start');
let switches = 0; const undrawn = [];
const ORDER = [0, 1, 2, 3, 4, 5, 2, 0];
for (let r = 0; r < ROUNDS; r++) {
  for (const k of ORDER) { const i = (k + r) % 6; if (!(await open(ids[i]))) undrawn.push(`${switches}:${i}`); switches += 1; }
  // the rest of a session between switches: a new scene from a template, director edits re-run, 🎲 variations
  if (r === 1 || r === 3) {
    const tpl = ThreeData.TEMPLATES[(r * 3) % ThreeData.TEMPLATES.length];
    await drawnWait(() => d.newSketch(`labmemory tpl ${r}`, tpl.code, 0.1)); await wait(800);
    const tid = ThreeLab.scenes.currentId(); await open(ids[0]); if (tid && !ids.includes(tid)) ThreeLab.scenes.remove(tid);
  }
  if (r === 2) {
    await open(ids[1]);
    for (let e = 0; e < 3; e++) { await d.setCode(scene(7 + e), 1); await wait(600); }
    await d.setCode(scene(1), 1); await wait(600);
    await open(ids[3]); await wait(1500);
    try {
      await window.Lazy?.load('labvar');
      if (typeof LabVariations !== 'undefined') {
        await LabVariations.open();
        const ok = await until(() => LabVariations.state().tiles?.length === 6 && !LabVariations.busy, 40000);
        LabVariations.close(); await wait(500);
        step('🎲 variations opened and closed in the session', ok, LabVariations.state());
      }
    } catch (err) { step('🎲 variations', false, String(err)); }
  }
  await sample(`after ${switches} switches`);
}
await open(ids[0]);
const sEnd = await sample('end');
out.switches = switches; out.undrawn = undrawn;

// ---------- the guard: a budget set very low, then switches: it cleans by itself, and notes it once ----------
await sbx('window.__labMemGuard.set({ objects: 10, programs: 1 }); return 1');
const g0 = (await sbx('return window.__labMem().guard'))?.cleaned || 0;
for (const i of [1, 2, 0]) { await open(ids[i]); await wait(3600); }
const gEnd = await sbx('return window.__labMem().guard');
await sbx('window.__labMemGuard.set({ objects: 6000, programs: 96 }); return 1');
step('the guard cleans up after a switch over its budget', (gEnd?.cleaned || 0) > g0, gEnd);
step('still over its budget: one calm note (once per page)', notes === 1, { notes });
await wait(600);
const after = await sbx('return window.__labMem()');
step('a scene still draws after the guard cleaned', after?.gl?.contexts >= 1 && !undrawn.includes('guard'), after?.gl);

// ---------- the verdict ----------
const mid = out.samples[Math.min(out.samples.length - 2, 2)];
const delta = (f) => (f(sEnd) ?? 0) - (f(mid) ?? 0);
const BUDGET = { pageHeapMB: 40, pageArraysMB: 40, glObjects: 900, programs: 60, contexts: 3, pooled: 3, objectURLs: 12, bitmaps: 8, audioContexts: 1, videosPlaying: 1, layerUrls: 4, canvases: 12 };
const fails = [];
if (undrawn.length) fails.push(`${undrawn.length} switch(es) never drew (${undrawn.join(', ')})`);
const chk = (name, v, max) => { if (v != null && v > max) fails.push(`${name} ${v} > ${max}`); };
chk('preview heap MB', sEnd.pageHeapMB, BUDGET.pageHeapMB);
chk('preview arrays MB', sEnd.pageArraysMB, BUDGET.pageArraysMB);
chk('GL objects', sEnd.gl?.objects, BUDGET.glObjects);
chk('linked programs', sEnd.gl?.programs, BUDGET.programs);
chk('contexts', sEnd.gl?.contexts, BUDGET.contexts);
chk('pooled contexts', sEnd.gl?.pooled, BUDGET.pooled);
chk('object URLs', sEnd.objectURLs, BUDGET.objectURLs);
chk('ImageBitmaps open', sEnd.bitmaps, BUDGET.bitmaps);
chk('AudioContexts', sEnd.audioContexts, BUDGET.audioContexts);
chk('videos playing', sEnd.videosPlaying, BUDGET.videosPlaying);
chk('layer modules', sEnd.layerUrls, BUDGET.layerUrls);
chk('canvases', sEnd.canvases, BUDGET.canvases);
// nothing keeps climbing once the session is under way (the same scenes again: what's needed is already there)
const grow = (name, f, max) => { const v = delta(f); if (v > max) fails.push(`${name} grew ${+v.toFixed(1)} from "${mid.label}" to the end (> ${max})`); };
grow('preview heap MB', (s) => s.pageHeapMB, 4);
grow('preview arrays MB', (s) => s.pageArraysMB, 8);
grow('GL objects', (s) => s.gl?.objects, 80);
grow('linked programs', (s) => s.gl?.programs, 8);
grow('window heap MB', (s) => s.hubHeapMB, 6);
grow('window DOM nodes', (s) => s.hubNodes, 600);
grow('object URLs', (s) => s.objectURLs, 2);
for (const st of out.steps) if (!st.ok) fails.push(st.name);
out.fails = fails;
out.table = out.samples.map((s) => `${s.label}: page ${s.pageHeapMB} MB + arrays ${s.pageArraysMB} MB · hub ${s.hubHeapMB} MB · nodes ${s.hubNodes} · gl ${s.gl?.objects} (prog ${s.gl?.programs}, tex ${s.gl?.textures}, buf ${s.gl?.buffers}, fb ${s.gl?.framebuffers}, cached ${s.gl?.cached}/${s.gl?.cachedIdle} idle) · ctx ${s.gl?.contexts}+${s.gl?.pooled} · three ${s.three?.geometries}g ${s.three?.textures}t ${s.three?.programs}p · cv ${s.canvases} · url ${s.objectURLs} · bmp ${s.bitmaps} · ac ${s.audioContexts} · vid ${s.videos}/${s.videosPlaying} · mods ${s.layerUrls}${s.guard ? ` · emptied ${s.guard.own.arrays}a ${s.guard.own.textures}t ${s.guard.own.canvases}c ${s.guard.own.urls}u ${s.guard.own.media}m ${s.guard.own.mb} MB` : ''}`);
for (const id of ids.slice(1)) ThreeLab.scenes.remove(id);
return `[LABMEMORY]${JSON.stringify(out.table, null, 1)}\n${JSON.stringify({ ...out, samples: undefined, table: undefined })}${fails.length ? `\nFAIL: ${fails.join('; ')}` : '\nPASS'}`;
