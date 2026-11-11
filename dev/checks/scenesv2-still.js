// (Nov 11, still178) Scenes v2: draw only what changed (docs/upgrades/still178.md). Its own temp data.
// A v2 scene, bottom first: a still backdrop, a still lit knot, a spinning box (onFrame), a still ring on top, and
// three more that start hidden: a layer that says still() and has an onFrame, one whose node callback reads the song,
// one that moves from a timer. Proves:
//   the still bottom layers are measurably not redrawn (their draw counts stand while the spinner's follows the frames)
//   and one kept picture stands for them; the still ring above the spinner is drawn (it can't be kept exactly);
//   the picture with kept pictures = the picture with every layer drawn (__labG2.kab), with a plain and with a merged
//   layer above the kept ones, at two sizes;
//   every layer still: nothing is drawn at all (0 passes), and a still read between frames is still right;
//   each way a kept picture is made again: redraw(), the layer's own timer, a change no one announced (found by the
//   probe draw), opacity, size; still() keeps a layer with an onFrame, redraw() draws it; a node callback is never kept.
//   SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" ELECTRON="$PWD/electron/electron.exe" node dev/run-checks.js --exact scenesv2-still
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const pv = async (code) => { let r = null; for (let i = 0; i < 6; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return { error: r?.error || 'no answer' }; };
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : v; };
const props = (id, p) => pv(`postMessage(${JSON.stringify({ target: 'three-sandbox', type: 'layer-props', id, props: p })}, '*'); return 1`);
const RESET = { opacity: 1, blend: 'normal', x: 0, y: 0, scale: 1, rotate: 0, mask: null, visible: true };
const st = () => pj('window.__labG2.state()');
const lay = (s, id) => s.layers.find((x) => x.id === id);
const LAYERS = {
  Backdrop: `export default ({ THREE, tsl, scene }) => { const { mix, screenUV, color } = tsl; scene.backgroundNode = mix(color('#05060c'), color('#3a1f5a'), screenUV.y.oneMinus()); };`,
  Knot: `export default ({ THREE, scene, camera }) => {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.5)); const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 4, 5); scene.add(sun);
  const k = new THREE.Mesh(new THREE.TorusKnotGeometry(0.9, 0.3, 200, 32), new THREE.MeshStandardNodeMaterial({ color: '#7c5cff', roughness: 0.35 })); k.rotation.set(0.4, 0.7, 0); scene.add(k);
  camera.position.set(0, 0, 4); window.__knot = k;
};`,
  Spinner: `export default ({ THREE, scene, camera, onFrame }) => {
  const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicNodeMaterial({ color: '#ff3cac' })); b.position.set(-2, 1, 0); scene.add(b); camera.position.z = 6;
  onFrame((t, dt) => { b.rotation.x += dt; b.rotation.y += dt * 0.7; });
};`,
  Ring: `export default ({ THREE, scene, camera }) => { const r = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.05, 8, 128), new THREE.MeshBasicNodeMaterial({ color: '#19c37d' })); scene.add(r); camera.position.z = 7; };`,
  // says it is still, and has an onFrame all the same: kept until it calls redraw()
  Said: `export default ({ THREE, scene, camera, onFrame, still, redraw }) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshBasicNodeMaterial({ color: '#ffd23c' })); m.position.set(2, -1, 0); scene.add(m); camera.position.z = 6;
  still(); let n = 0; onFrame(() => { n += 1; window.__saidFrames = n; });
  window.__said = { move: (x) => { m.position.x = x; redraw(); } };
};`,
  // a node update callback of its own (the song's bass into a uniform): per-frame code, never guessed still
  NodeCode: `export default ({ THREE, tsl, scene, camera, audio }) => {
  const u = tsl.uniform(0).onRenderUpdate(() => audio.bass); const mat = new THREE.MeshBasicNodeMaterial(); mat.colorNode = tsl.vec3(0.2, 0.6, 1).mul(u.add(0.5));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), mat); m.position.set(2, 1.2, 0); scene.add(m); camera.position.z = 6;
};`,
  // moves when asked, from its own timer
  Timer: `export default ({ THREE, scene, camera }) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicNodeMaterial({ color: '#ffffff' })); m.position.set(-2, -1.2, 0); scene.add(m); camera.position.z = 6;
  window.__timerGo = null; const once = () => { if (window.__timerGo != null) { m.position.x = window.__timerGo; window.__timerGo = null; } };
  window.__timerArm = () => setTimeout(once, 50);
};`,
};
const IDS = { Backdrop: 'main', Knot: 'l2', Spinner: 'l3', Ring: 'l4', Said: 'l5', NodeCode: 'l6', Timer: 'l7' };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  const c = await ThreeLab.cmd(); ThreeLab.quality?.set('high', { quiet: true });
  const layers = Object.entries(LAYERS).map(([name, code], i) => ({ id: IDS[name], name, code, slot: i }));
  ThreeLab.scenes.create({ name: 'v2 still', code: layers[0].code, layers, open: true, format: 'gpu' });
  await until(() => ThreeLab.workspace.state().ready, 60000);
  const s0 = await until(async () => { const s = await st(); return s && s.layers.length === 7 && s.frames > 30 ? s : null; }, 120000, 500);
  step('seven v2 layers on the one renderer, keeping on', Boolean(s0) && s0.keep === true, s0 && { layers: s0.layers.length, keep: s0.keep });
  c.customSize(1920, 1080); c.size('custom');
  for (const id of ['l5', 'l6', 'l7']) await props(id, { ...RESET, visible: false });
  await wait(2500);
  const few = (r) => r && r.max <= 1 && r.differing <= Math.max(1, r.of / 100000);
  const same = (r) => few(r) && few({ ...r.noise, of: r.of }) && r.lit > r.of * 0.2; // (as scenesv2-onepass: what two draws of the same thing differ by here)

  // ---- still under moving: not redrawn, one kept picture ----
  const a0 = await st(); await wait(2000); const a1 = await st();
  const F = a1.frames - a0.frames; const d = (id) => lay(a1, id).drawn - lay(a0, id).drawn;
  step('the still backdrop and knot are kept (one picture for both), the spinner is not', a1.kept === 2 && a1.keptPicture && lay(a1, 'main').kept && lay(a1, 'l2').kept && !lay(a1, 'l3').kept, { kept: a1.kept, of: a1.visible, path: a1.path });
  step('measured: the still layers are drawn about 1 frame in 20 (the probe), the spinner every frame', F >= 40 && d('main') <= F / 10 + 3 && d('l2') <= F / 10 + 3 && d('l3') >= F * 0.9, { frames: F, backdrop: d('main'), knot: d('l2'), spinner: d('l3'), ring: d('l4') });
  step('a still layer above the moving one is drawn (not kept: it could not be laid over exactly)', !lay(a1, 'l4').kept && d('l4') >= F * 0.9, { ring: d('l4'), frames: F });
  step('what a still layer\'s draw sends to the graphics card: nothing', lay(a1, 'main').sent === 0 && lay(a1, 'l2').sent === 0 && lay(a1, 'l3').sent > 0, { backdrop: lay(a1, 'main').sent, knot: lay(a1, 'l2').sent, spinner: lay(a1, 'l3').sent });
  const perf = c.perf();
  step('the Lab\'s stats say it (the line and the AIs\' read-back)', perf.stillLayers === 2 && perf.v2Layers === 4, { stillLayers: perf.stillLayers, v2Layers: perf.v2Layers });

  // ---- the same picture: a merged layer above the kept ones (exact), then a plain one ----
  c.play(false); await wait(400); // (❚❚: the spinner holds, so both draws are of the same moment)
  await props('l3', { ...RESET, opacity: 0.6 }); await wait(300);
  const k1 = await pj('window.__labG2.kab(1920, 1080)');
  step('kept pictures under a merged layer: the same pixels as every layer drawn', same(k1) && k1.kept === 2, k1);
  await props('l3', RESET); await wait(300);
  const k2 = await pj('window.__labG2.kab(1920, 1080)');
  out.plainOverKept = k2;
  step('kept pictures under a plain layer: the same pixels but where its antialiased edges cross theirs (measured, under 0.05 % of the frame)', k2 && k2.kept === 2 && k2.differing <= k2.of * 0.0005 && k2.noise.differing <= Math.max(1, k2.of / 100000), { differing: k2?.differing, of: k2?.of, max: k2?.max, at: k2?.at });
  c.customSize(3840, 2160); c.size('custom'); await wait(1500);
  await props('l3', { ...RESET, opacity: 0.6 }); await wait(400);
  const k3 = await pj('window.__labG2.kab(960, 540)');
  step('after a change of size the kept picture is made again: the same pixels at 4K', same(k3), k3);
  await props('l3', RESET); c.customSize(1920, 1080); c.size('custom'); c.play(true); await wait(1500);

  // ---- every layer still: nothing drawn ----
  await props('l3', { ...RESET, visible: false }); await wait(1500);
  const b0 = await st(); await wait(1500); const b1 = await until(async () => { const s = await st(); return s.path === 'kept' ? s : null; }, 2000, 60) || await st(); // (not the probe's frame: 1 in 20 draws)
  const FB_ = b1.frames - b0.frames;
  step('every layer still: the frame draws nothing (0 passes), frame after frame', b1.path === 'kept' && b1.passes === 0 && b1.keptFrames - b0.keptFrames >= FB_ * 0.85, { path: b1.path, passes: b1.passes, frames: FB_, notDrawn: b1.keptFrames - b0.keptFrames });
  const lit = await pj('window.__labG2.lit()'); const k4 = await pj('window.__labG2.kab(1920, 1080)');
  step('a still read between frames is the right picture', lit.lit > lit.of * 0.5 && same(k4), { lit, max: k4.max, differing: k4.differing });
  const ge = await pj('await window.__labG2.gpuError()');
  step('nothing refused by the graphics card', ge === null, ge);

  // ---- each way a kept picture is made again ----
  const px = (x, y) => pj(`window.__labG2.pixel(${x}, ${y})`);
  const isKnot = (p) => p && p[2] > 150 && p[0] > 60 && p[0] < 200;
  // a change no one announced (as from a promise): found by the probe draw
  const before = await px(0.39, 0.7);
  await pv('window.__knot.position.x = 5; return 1');
  const gone = await until(async () => { const s = await st(); const p = await px(0.39, 0.7); return s.path !== 'kept' || !isKnot(p) ? { p, s: s.path } : null; }, 3000, 100);
  const afterMove = await px(0.39, 0.7);
  step('a change no one announced (set from outside, as a promise would): seen by the probe draw, the picture follows', isKnot(before) && Boolean(gone) && !isKnot(afterMove), { before, after: afterMove });
  await pv('window.__knot.position.x = 0; return 1'); await wait(800);
  step('…and back', isKnot(await px(0.39, 0.7)));
  // opacity
  await wait(800); const o0 = await px(0.39, 0.7);
  await props('l2', { ...RESET, opacity: 0.3 }); await wait(300); const o1 = await px(0.39, 0.7);
  step('opacity of a kept layer: the picture follows at once', isKnot(o0) && o1[2] < o0[2] - 40, { before: o0, after: o1 });
  await props('l2', RESET); await wait(300);
  // still(): kept with an onFrame, until redraw()
  await props('l5', RESET); await wait(1500);
  const s5a = await st(); const f5a = await pj('window.__saidFrames'); await wait(1200); const s5b = await st(); const f5b = await pj('window.__saidFrames');
  step('still(): a layer with an onFrame is kept (its onFrame runs, it is not drawn)', lay(s5b, 'l5').kept && lay(s5b, 'l5').drawn - lay(s5a, 'l5').drawn <= (s5b.frames - s5a.frames) / 10 + 2 && f5b - f5a >= (s5b.frames - s5a.frames) * 0.9, { frames: s5b.frames - s5a.frames, drawn: lay(s5b, 'l5').drawn - lay(s5a, 'l5').drawn, onFrames: f5b - f5a, still: lay(s5b, 'l5').still });
  const y0 = await px(0.7, 0.68);
  await pv('window.__said.move(-3); return 1'); await wait(200); const y2 = await px(0.7, 0.68); const s5c = await st();
  step('still(): redraw() draws it again at once', y0[0] > 200 && y2[0] < 120, { before: y0, redrawn: y2, draws: lay(s5c, 'l5').drawn - lay(s5b, 'l5').drawn });
  await props('l5', { ...RESET, visible: false });
  // a node callback of its own: never kept
  await props('l6', RESET); await wait(1500);
  const s6 = await st();
  step('a layer with its own node update callback is per-frame code: never kept', lay(s6, 'l6').code === true && !lay(s6, 'l6').kept, lay(s6, 'l6'));
  await props('l6', { ...RESET, visible: false });
  // its own timer
  await props('l7', RESET); await wait(1500);
  const s7a = await until(async () => { const s = await st(); return lay(s, 'l7').kept ? s : null; }, 4000, 150) || await st(); const t0 = await px(0.3, 0.71);
  await pv('window.__timerGo = 3; window.__timerArm(); return 1'); await wait(250); const t1 = await px(0.3, 0.71); const s7b = await st();
  step('the layer\'s own timer changed it: drawn again at once', lay(s7a, 'l7').kept && t0[0] > 200 && t1[0] < 120, { kept: lay(s7a, 'l7').kept, before: t0, after: t1, draws: lay(s7b, 'l7').drawn - lay(s7a, 'l7').drawn });

  // ---- off: every layer drawn every frame, as before ----
  await pj('window.__labG2.keep(false)'); await wait(300);
  const z0 = await st(); await wait(1000); const z1 = await st();
  step('keeping off (__labG2.keep(false)): every layer drawn every frame', z1.kept === 0 && lay(z1, 'main').drawn - lay(z0, 'main').drawn >= (z1.frames - z0.frames) * 0.9, { frames: z1.frames - z0.frames, backdrop: lay(z1, 'main').drawn - lay(z0, 'main').drawn });
  await pj('window.__labG2.keep(true)');
  const errs = D().report?.()?.errors || null; const s9 = await st();
  step('no layer error, no frame error, the one pass still in place', (!errs || !errs.length) && !s9.err && !s9.onepassErr, { errs, err: s9.err, fellBack: s9.onepassErr });
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
