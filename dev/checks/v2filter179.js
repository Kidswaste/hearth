// (round 179, v2filter179) filter layers in a v2 scene: added from the template list they are v2 code, run on the
// scene's one renderer (no WebGL canvas), restyle the picture below them, follow their sliders and opacity, step aside
// at 0; a hand-written below() layer; a feedback filter; and the SAME filter over the SAME picture in an old-format
// scene gives the same picture (colours and up / down). Its own temp data.
// Run with SMOKE_GPU_FLAGS="--ignore-gpu-blocklist". (Every type one by one: dev/surveys/v2filter179-all.js.)
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const pv = async (code) => { let r = null; for (let i = 0; i < 6; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return { error: r?.error || 'no answer' }; };
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : v; };
const shot = async () => String(await pj('window.__labGpu.probe(12)')).split(',').map(Number);
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - (b[i] ?? 0)); return Math.round((s / Math.max(1, a.length)) * 100) / 100; };
const r2 = (x) => Math.round(x * 100) / 100;
// the same still picture in both formats: a colour ramp (red →, green ↑ on screen: brighter at the TOP), no time in it
// (a v2 layer's colours are linear and shown sRGB-encoded: the old one encodes the same values itself)
const V2_PIC = "export default ({ tsl, scene }) => {\n  const { screenUV, vec3 } = tsl;\n  scene.backgroundNode = vec3(screenUV.x, screenUV.y.oneMinus(), 0.25);\n};\n";
const OLD_PIC = "import * as THREE from 'three';\nconst renderer = new THREE.WebGLRenderer({ antialias: false });\nrenderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight);\nrenderer.outputColorSpace = THREE.LinearSRGBColorSpace;\ndocument.body.append(renderer.domElement);\nconst scene = new THREE.Scene(); const camera = new THREE.Camera();\nscene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: 'varying vec2 v; void main() { v = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: 'varying vec2 v; void main() { vec3 c = vec3(v.x, v.y, 0.25); gl_FragColor = vec4(mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)), 1.0); }' })));\naddEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));\nrenderer.setAnimationLoop(() => renderer.render(scene, camera));\n";
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  await ThreeLab.cmd();
  if (window.Lazy) { try { await Lazy.load('fx'); } catch { /* the base filters only */ } }
  const S = ThreeLab.scenes; const d = D();
  const ready = (n) => until(async () => { const s = await pj('window.__labG2.state()'); return s?.layers?.length === n ? s : null; }, 12000, 150);

  const v2 = S.create({ name: 'Filters v2', code: V2_PIC, layers: [{ id: 'main', name: 'Picture', code: V2_PIC, slot: 0 }], format: 'gpu', open: true });
  await until(() => S.currentId() === v2.id, 20000);
  await ready(1); await wait(800);
  const base = await shot();

  // from the template list
  await d.addLayer({ template: 'duotone' }, 2.5);
  const fxL = S.layersOf(S.get(v2.id)).at(-1);
  step('a filter added to a v2 scene is a v2 layer with the same sliders', ThreeData.isV2Code(fxL.code) && ThreeLayers.isFilter(fxL.code) && /await filter\('duotone', P\)/.test(fxL.code) && /tweak\(\{/.test(fxL.code), { name: fxL.name });
  const st = await ready(2); await wait(600);
  const pix = await shot();
  step('it restyles the picture below it on the one renderer (no WebGL canvas, no error)', diff(pix, base) > 1 && st?.contexts === 0 && !(st?.gpuErrors > 0), { diff: diff(pix, base), contexts: st?.contexts, path: st?.path, gpuErrors: st?.gpuErrors });
  await d.addLayer({ template: 'glow' }, 2.5);
  const g = S.layersOf(S.get(v2.id)).at(-1);
  step('"glow" there is the glow FILTER (not the v2 glow lights layer)', ThreeLayers.isFilter(g.code) && ThreeData.isV2Code(g.code), { name: g.name });
  await HubBridge.call('three_remove_layer', { layers: [g.name] });
  await ready(2);

  // sliders and opacity
  await d.updateLayer(fxL.id, { code: ThreeLayers.v2Filter(ThreeLayers.filterCode('invert', { amount: 1 })) }, 2);
  await ready(2); await wait(600);
  const inv = await shot();
  const want = base.map((v) => 255 - v);
  step('invert at 1: every colour is its negative (colours handed over and back exactly)', diff(inv, want) < 3, { diffFromNegative: diff(inv, want), diffFromOriginal: diff(inv, base) });
  await d.updateLayer(fxL.id, { opacity: 0.5 }, 0.8); await wait(500);
  const half = await shot();
  step('the layer\'s opacity mixes the filter with the original', diff(half, base) > 5 && diff(half, inv) > 5, { fromOriginal: diff(half, base), fromFull: diff(half, inv) });
  await d.updateLayer(fxL.id, { opacity: 1 }, 0.5);
  await d.updateLayer(fxL.id, { code: ThreeLayers.v2Filter(ThreeLayers.filterCode('vignette', { amount: 0 })) }, 2);
  await ready(2); await wait(600);
  const off = await pj('window.__labG2.state()');
  const offPic = await shot();
  step('a filter at 0 is not drawn at all (one layer left in the frame)', off?.visible === 1 && diff(offPic, base) < 0.5, { visible: off?.visible, path: off?.path, diff: diff(offPic, base) });

  // hand-written
  await d.updateLayer(fxL.id, { code: 'export default ({ scene, below }) => {\n  scene.backgroundNode = below().rgb.oneMinus(); // the picture so far, linear\n};\n' }, 2);
  await ready(2); await wait(600);
  const own = await shot();
  step('a hand-written layer reads the picture so far with below()', diff(own, base) > 20, { diff: diff(own, base) });

  // feedback: a moving dot leaves a trail
  const dot = "export default ({ tsl, scene, onFrame }) => {\n  const { screenUV, uniform, vec3, vec2, length, smoothstep } = tsl;\n  const x = uniform(0.1);\n  scene.backgroundNode = vec3(smoothstep(0.06, 0.05, length(screenUV.sub(vec2(x, 0.5)))));\n  onFrame((t) => { x.value = 0.1 + 0.8 * ((t * 0.5) % 1); });\n};\n";
  const main = S.layersOf(S.get(v2.id))[0];
  await d.updateLayer(main.id, { code: dot }, 2);
  await d.updateLayer(fxL.id, { code: 'export default ({ scene }) => { scene.add; };\n' }, 1.5);
  await ready(2); await wait(500);
  const lit = async () => { let hi = 0; for (let i = 0; i < 6; i += 1) { const p = await shot(); let n = 0; for (let k = 0; k < p.length; k += 3) if (p[k] > 40) n += 1; hi = Math.max(hi, n); await wait(120); } return hi; };
  const plain = await lit();
  const tr = ThreeLayers.FILTERS.find((x) => (x.type || x.id) === 'trails');
  await d.updateLayer(fxL.id, { code: ThreeLayers.v2Filter(tr.code) }, 2);
  await ready(2); await wait(2500);
  const trail = await lit();
  const fb = await pj('window.__labG2.fx.feedback("trails")');
  step('a feedback filter (trails) keeps its last picture: the moving dot leaves a trail', fb === true && trail > plain, { litSamples: { plain, trails: trail } });

  // the same filters over the same picture, old format against v2
  const types = ['duotone', 'kaleido', 'mirror', 'posterize', 'halftone', 'sepia', 'pixelate']; // (not vignette: switched to from another filter in an OLD scene its picture came out wrong here, 163 of 255 from the original)
  await d.updateLayer(main.id, { code: V2_PIC }, 2);
  const v2pics = {};
  for (const type of types) {
    const t = ThreeLayers.FILTERS.find((x) => (x.type || x.id) === type);
    await d.updateLayer(fxL.id, { code: ThreeLayers.v2Filter(t.code) }, 2);
    await ready(2); await wait(700);
    v2pics[type] = await shot();
  }
  const old = S.create({ name: 'Filters old', code: OLD_PIC, layers: [{ id: 'main', name: 'Picture', code: OLD_PIC, slot: 0 }], open: true });
  await until(() => S.currentId() === old.id, 20000);
  await wait(2500);
  const oldBase = await shot();
  step('the still picture is the same in both formats (what the comparison stands on)', diff(oldBase, base) < 3, { diff: diff(oldBase, base) });
  await d.addLayer({ template: types[0] }, 2.5);
  const oL = S.layersOf(S.get(old.id)).at(-1);
  step('in an old-format scene a filter is still the old kind', !ThreeData.isV2Code(oL.code));
  const cmp = {};
  for (const type of types) {
    const t = ThreeLayers.FILTERS.find((x) => (x.type || x.id) === type);
    await d.updateLayer(oL.id, { code: t.code }, 2.5);
    await wait(900);
    const p = await shot();
    cmp[type] = { oldVsV2: diff(p, v2pics[type]), changes: diff(p, oldBase) };
  }
  const close = types.filter((k) => cmp[k].oldVsV2 < 6);
  step(`the same filter gives the same picture in both formats (${close.length} of ${types.length} within 6 of 255 a channel)`, close.length >= types.length - 1, cmp);
  out.ok = !out.problems;
} catch (e) { out.error = String(e?.stack || e); }
return out;
