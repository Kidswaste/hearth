// (Nov 9) Scenes v2 phase 2: a v2 layer's opacity, blend mode, move / scale / turn and mask, merged by the one WebGPU
// renderer (tools/three-sandbox.html "layers as pictures"). Two solid layers (red under, green over) and pixels read
// from the merged picture, the layer's props sent as the Lab's Layers panel sends them ('layer-props'). Its own temp data.
//   SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" ELECTRON="$PWD/electron/electron.exe" node dev/smoke.js --script dev/checks/scenesv2-comp.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const pv = async (code) => { let r = null; for (let i = 0; i < 6; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return { error: r?.error || 'no answer' }; };
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : v; };
const props = (p) => pv(`postMessage(${JSON.stringify({ target: 'three-sandbox', type: 'layer-props', id: 'l2', props: p })}, '*'); return 1`);
const px = (x, y) => pj(`window.__labG2.pixel(${x}, ${y})`);
const solid = (hex) => `export default ({ THREE, scene }) => { scene.background = new THREE.Color('${hex}'); };`;
const isR = (p) => p && p[0] > 200 && p[1] < 40; const isG = (p) => p && p[1] > 200 && p[0] < 40;
const RESET = { opacity: 1, blend: 'normal', x: 0, y: 0, scale: 1, rotate: 0, mask: null, visible: true };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  ThreeLab.scenes.create({ name: 'Scenes v2 merge', code: solid('#ff0000'), open: true, format: 'gpu', layers: [{ id: 'main', name: 'Red', code: solid('#ff0000'), slot: 0 }, { id: 'l2', name: 'Green', code: solid('#00ff00'), slot: 1 }] });
  await until(() => ThreeLab.workspace.state().ready, 60000);
  const st = await until(async () => { const s = await pj('window.__labG2 && window.__labG2.state()'); return s && s.layers.length === 2 ? s : null; }, 60000, 300);
  step('two v2 layers on the one renderer', Boolean(st), st);
  const r0 = await px(0.5, 0.5);
  step('plain: the green top covers the red', isG(r0), r0);
  await props({ ...RESET, opacity: 0.5 }); await wait(300);
  const r1 = await px(0.5, 0.5); const s1 = await pj('window.__labG2.state()');
  step('opacity 0.5: half red, half green, merged by the TSL pass (≈ 188, 188: blended in linear)', r1 && Math.abs(r1[0] - 188) <= 4 && Math.abs(r1[1] - 188) <= 4 && s1.path === 'merged', { px: r1, path: s1.path, rt: s1.rt, merges: s1.merges });
  await props({ ...RESET, blend: 'multiply' }); await wait(300);
  const r2 = await px(0.5, 0.5);
  step('multiply: red × green is black', r2 && r2[0] < 30 && r2[1] < 30, r2);
  await props({ ...RESET, blend: 'screen' }); await wait(300);
  const r3 = await px(0.5, 0.5);
  step('screen: red ⊕ green is yellow', r3 && r3[0] > 200 && r3[1] > 200, r3);
  await props({ ...RESET, blend: 'difference' }); await wait(300);
  const r3b = await px(0.5, 0.5);
  step('difference: |red − green| is yellow', r3b && r3b[0] > 200 && r3b[1] > 200 && r3b[2] < 40, r3b);
  await props({ ...RESET, scale: 0.5 }); await wait(300);
  const c4 = await px(0.5, 0.5); const e4 = await px(0.05, 0.05);
  step('scale 0.5: green in the middle, red at the corner', isG(c4) && isR(e4), { mid: c4, corner: e4 });
  await props({ ...RESET, x: 50 }); await wait(300);
  const l5 = await px(0.25, 0.5); const r5 = await px(0.75, 0.5);
  step('x 50 %: moved right (red left, green right)', isR(l5) && isG(r5), { left: l5, right: r5 });
  await props({ ...RESET, y: 50 }); await wait(300);
  const t6 = await px(0.5, 0.25); const b6 = await px(0.5, 0.75);
  step('y 50 %: moved down (red top, green bottom)', isR(t6) && isG(b6), { top: t6, bottom: b6 });
  await props({ ...RESET, x: 50, rotate: 180 }); await wait(300);
  const l7 = await px(0.25, 0.5); const r7 = await px(0.75, 0.5);
  step('rotate 180 around its own centre after the move: still right', isR(l7) && isG(r7), { left: l7, right: r7 });
  await props({ ...RESET, mask: { points: [[0, 0], [50, 0], [50, 100], [0, 100]] } }); await wait(300);
  const l8 = await px(0.25, 0.5); const r8 = await px(0.75, 0.5);
  step('mask on the left half: green left, red right', isG(l8) && isR(r8), { left: l8, right: r8 });
  await props({ ...RESET, visible: false }); await wait(300);
  const r9 = await px(0.5, 0.5);
  step('hidden: red', isR(r9), r9);
  await props(RESET); await wait(300);
  const s10 = await pj('window.__labG2.state()');
  step('back to plain: green (two plain layers: one picture, one copy)', isG(await px(0.5, 0.5)), s10.path);
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
