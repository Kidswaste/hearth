// (round 176, gpuaware176) what makes or copies a scene knows the v2 (WebGPU) format: a layer added to a v2 scene is a
// v2 layer, its empty layer too; the format survives delete → restore and a snapshot restored as a new scene; the
// director's short results and three_get_code say format "v2"; an old scene behaves as before. Its own temp data.
// Run with SMOKE_GPU_FLAGS="--ignore-gpu-blocklist".
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  await ThreeLab.cmd();
  const S = ThreeLab.scenes; const d = ThreeLab.director;
  const is2 = (c) => ThreeData.isV2Code(c);
  step('helpers: formatOf / v2Layer', ThreeData.formatOf([{ code: 'export default () => {};' }]) === 'gpu' && ThreeData.formatOf([{ code: 'new THREE.WebGLRenderer()' }]) === null && ThreeData.formatOf([], 'gpu') === 'gpu' && ThreeData.v2Layer('knot')?.id === 'v2-knot' && is2(ThreeData.V2_EMPTY_CODE));

  // a v2 scene
  const Ls = ThreeData.v2Layers(ThreeData.V2_TEMPLATES.find((t) => t.id === 'v2-empty'));
  const v2 = S.create({ name: 'Aware v2', code: Ls[0].code, layers: Ls, format: 'gpu', open: true });
  await until(() => S.currentId() === v2.id, 20000);
  await wait(1500);
  const a = await d.addLayer({}, 1);
  const added = S.layersOf(S.get(v2.id)).at(-1);
  step('a layer added to a v2 scene with no template is a v2 layer', is2(added.code), { added: a.added });
  await d.addLayer({ template: 'particles' }, 1);
  const p = S.layersOf(S.get(v2.id)).at(-1);
  step('…"particles" there is the v2 particle field', is2(p.code) && /Particle/.test(p.name), { name: p.name });
  await d.addLayer({ template: 'rings' }, 1);
  const r = S.layersOf(S.get(v2.id)).at(-1);
  step('…a named old template is still added as asked', !is2(r.code), { name: r.name });
  step('three_get_code and three_layers say format v2', d.getCode().format === 'v2' && d.layers().format === 'v2');
  const short = await HubBridge.call('three_console', {});
  step('the director\'s short result says format v2', short?.value?.format === 'v2' || short?.format === 'v2', { keys: Object.keys(short?.value || short || {}) });
  const snap = d.capture({ save: false });
  step('a snapshot records the format', snap.format === 'gpu');
  // every layer removed: the empty layer is a v2 one
  await HubBridge.call('three_remove_layer', { layers: S.layersOf(S.get(v2.id)).map((L) => L.name) });
  await wait(800);
  const left = S.layersOf(S.get(v2.id));
  step('all layers removed: the empty layer is a v2 layer', left.length === 1 && left[0].code === ThreeData.V2_EMPTY_CODE, { n: left.length, name: left[0]?.name });
  // restored as a new scene
  await d.restore(snap, { asNew: 'Aware v2 restored', wait: 0.5 });
  const back = S.all().find((x) => x.name === 'Aware v2 restored');
  step('a snapshot restored as a new scene is a v2 scene', S.get(back?.id)?.format === 'gpu');
  // delete → restore
  S.remove(back.id);
  const again = S.undelete(back.id);
  step('a deleted v2 scene comes back v2', again?.format === 'gpu');

  // an old scene: as before
  const OLD = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 4;
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
  const old = S.create({ name: 'Aware old', code: OLD, open: true });
  await until(() => S.currentId() === old.id, 20000);
  await wait(1000);
  await d.addLayer({}, 1);
  const o = S.layersOf(S.get(old.id)).at(-1);
  step('old scene: a layer added with no template is the old first template', !is2(o.code) && o.code === ThreeLayers.TEMPLATES[0].code);
  step('old scene: no format in results', d.getCode().format === undefined && d.capture({ save: false }).format === undefined);
  await d.addLayer({ code: ThreeData.v2Layer('cube').code, name: 'stray v2' }, 1);
  step('a pack / template of an old scene stays old; any v2 layer makes formatOf say v2', ThreeData.formatOf([{ code: OLD }]) === null && ThreeData.formatOf(S.layersOf(S.get(old.id))) === 'gpu');
  out.ok = !out.problems;
} catch (e) { out.error = String(e?.stack || e); }
return out;
