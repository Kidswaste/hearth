// 3D models in the Lab (round 15, lab3d): a tiny animated GLB (two clips) made here, driven like the owner would with
// /model verbs and like a director with three_do model: added as a 🧊 layer (loaded, clips read, a thumbnail in the
// library), material, clip + speed, light, ground, a studio look (bloom on), an HDRI sky, a camera move (keyframes on the
// camera sliders + a 🎥 cue), turntable / explode through three_do, the gizmo on the model, replace in place (sliders and
// keys kept, no renderer left behind), a bad file (a clear error, nothing breaks), the library panel and the preview menu.
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/lab3d-models.js --shot /tmp/lab3d-models.png
const DIR = '/tmp/hearth-lab3d';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const fail = []; const out = {};
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const say = async (line) => { let text = ''; let err = ''; await Commands.tryRun(line, C.id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (e) => { err = String(e); } }); return err || text; };
const evalIn = async (expr) => { const r = await HubBridge.call('three_eval', { code: `return JSON.stringify(${expr})`, max: 20000 }); try { return r.ok ? JSON.parse(typeof r.value === 'string' ? r.value : r.value.result) : null; } catch { return null; } };
const models = () => evalIn('lab3d.list()');
const model = async (name) => (await models() || []).find((m) => m.name === name);

// a GLB: a little triangle mesh with two animation clips ("Bounce" moves it, "Spin" turns it)
function glb(tag = 'bot') {
  const pos = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, -0.5]);
  const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 3, 2, 0, 3, 1]);
  const t = new Float32Array([0, 1]); const tr = new Float32Array([0, 0, 0, 0, 0.5, 0]); const rot = new Float32Array([0, 0, 0, 1, 0, 0.7071, 0, 0.7071]);
  const parts = [pos, idx, t, tr, rot]; const views = []; let off = 0; const chunks = [];
  for (const p of parts) { const b = new Uint8Array(p.buffer); const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); chunks.push(b, new Uint8Array(pad)); off += b.length + pad; }
  const bin = new Uint8Array(off); let o = 0; for (const c of chunks) { bin.set(c, o); o += c.length; }
  const json = { asset: { version: '2.0', generator: `hearth lab3d check (${tag})` }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: tag }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.5, 0.2, 1] } }],
    buffers: [{ byteLength: off }], bufferViews: views,
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1, 0] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] }, { bufferView: 3, componentType: 5126, count: 2, type: 'VEC3' }, { bufferView: 4, componentType: 5126, count: 2, type: 'VEC4' }],
    animations: [{ name: 'Bounce', samplers: [{ input: 2, output: 3 }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }, { name: 'Spin', samplers: [{ input: 2, output: 4 }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] }] };
  let js = new TextEncoder().encode(JSON.stringify(json)); const jpad = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jpad).fill(0x20)]);
  const total = 12 + 8 + js.length + 8 + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
  return u;
}
function hdr() { const head = new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 4\n'); const px = new Uint8Array(32); for (let i = 0; i < 8; i++) px.set([200, 160, 100 + i * 10, 128], i * 4); return new Uint8Array([...head, ...px]); }

try {
  await hub.fs.write(`${DIR}/bot.glb`, glb('bot'));
  await hub.fs.write(`${DIR}/other.glb`, glb('other'));
  await hub.fs.write(`${DIR}/studio.hdr`, hdr());
  await hub.fs.write(`${DIR}/broken.glb`, '<!doctype html><title>Download</title><p>not a model</p>');
  activate('tool:three'); await ThreeLab.cmd();
  const D = ThreeLab.director;

  // ---- add: a 🧊 layer, loaded, clips read from the GLB ----
  const said = await say(`/model add ${DIR}/bot.glb`);
  ok(/🧊 bot/.test(said) && /Bounce/.test(said), `/model add says the layer and its clips (${said})`);
  const m1 = await until(async () => { const m = await model('bot'); return m?.loaded && m; }, 25000);
  ok(m1 && m1.clips?.join() === 'Bounce,Spin' && m1.tris === 4 && m1.kind === 'glb', `the model loaded in the preview: ${JSON.stringify(m1)}`);
  const L = D.layers().layers.find((x) => x.name === '🧊 bot');
  ok(L && L.sliders.includes('Material') && L.sliders.includes('Orbit (°)') && L.sliders.includes('Clip'), 'its knobs are sliders (Material, Orbit, Clip…)');
  ok(/lab3d\.model\(refs\.\w+, P, \{ name: 'bot' \}\)/.test(D.codeOf('🧊 bot').code), 'the layer code is one lab3d.model call');

  // ---- materials, clips, light, ground, a look ----
  ok(/material/.test(await say('/model material chrome')), '/model material chrome');
  ok(await until(async () => (await model('bot'))?.material === 'chrome', 6000), 'the preview shows chrome');
  await say('/model clip Spin speed 2');
  ok(await until(async () => (await model('bot'))?.clip === 'Spin', 6000), '/model clip Spin plays it');
  ok(D.sliders('🧊 bot').sliders.find((s) => s.key === 'speed')?.value === 2, 'clip speed 2');
  await say('/model light neon'); await say('/model ground mirror');
  ok(await until(async () => { const m = await model('bot'); return m?.light === 'neon' && m.ground === 'mirror'; }, 6000), 'neon light, mirror ground');
  await say('/model look hologram');
  ok(await until(async () => { const m = await model('bot'); return m?.material === 'holographic' && /^true/.test(m.fx); }, 8000), `the hologram look (holographic, bloom on: ${JSON.stringify(await model('bot'))})`);

  // ---- an HDRI sky lights it ----
  out.sky = await say(`/model sky ${DIR}/studio.hdr`);
  ok(/lit by/.test(out.sky), '/model sky <file>');
  ok(await until(async () => (await model('bot'))?.hdri, 30000), 'the sky lights the model (environment from the HDRI)');
  ok(/hdri: refs\.\w+/.test(D.codeOf('🧊 bot').code), 'the sky is in the layer code');

  // ---- a camera move: keyframes on the camera sliders + a cue ----
  const mv = await say('/model move hero at 1');
  ok(/Hero reveal 1–6 s/.test(mv), `/model move hero (${mv})`);
  const kf = D.layers().layers.find((x) => x.name === '🧊 bot')?.keyframes || {};
  ok(kf['slider orbit']?.length === 2 && kf['slider distance']?.length === 2 && kf['slider exposure']?.length === 2, `keyframes on orbit / distance / exposure (${JSON.stringify(kf)})`);
  ok(JSON.stringify(D.timeline()).includes('🎥 Hero reveal'), 'a 🎥 cue on the timeline');

  // ---- the director: three_do model ----
  const tt = await HubBridge.call('three_do', { cmd: 'model', op: 'turntable', speed: 2 });
  ok(tt.ok && D.sliders('🧊 bot').sliders.find((s) => s.key === 'spin')?.value === 2, `three_do model turntable (${tt.error || ''})`);
  const ex = await HubBridge.call('three_do', { cmd: 'model', op: 'explode', amount: 1.5 });
  ok(ex.ok && D.sliders('🧊 bot').sliders.find((s) => s.key === 'explode')?.value === 1.5, 'three_do model explode');
  const ls = await HubBridge.call('three_do', { cmd: 'model', op: 'list' });
  ok(ls.ok && ls.value.some((x) => /bot/.test(x)), `three_do model list (${JSON.stringify(ls.value).slice(0, 160)})`);
  const help = await HubBridge.call('three_do', { cmd: 'help', topic: 'model' });
  out.help = help.ok !== false;

  // ---- the gizmo on the model ----
  await say('/model gizmo rotate');
  ok(await until(() => D.previewHost?.() ? document.querySelector('.three-preview.editing') : document.querySelector('.editing'), 4000), 'the scene editor is on (W / E / R gizmo)');
  await ThreeLab.cmd().then((c) => c.edit(false));

  // ---- the library: a thumbnail of the model alone, the panel, the preview menu ----
  const lib = await until(async () => (await ThreeModels.library()).find((x) => x.name === 'bot' && /^data:image/.test(x.thumb || '')), 8000);
  ok(lib, 'the library has bot with its own picture');
  await say('/model library');
  ok(document.querySelectorAll('.lab3d-panel:not([hidden]) .lab3d-card').length >= 1, 'the library panel shows cards');
  await wait(300);
  try { await smoke({ shot: '/tmp/lab3d-library.png' }); } catch { /* optional */ }
  ThreeModels.closeLibrary();
  const menu = ThreeModels.previewItem().items().map((x) => x?.label).filter(Boolean);
  ok(menu.includes('Camera move') && menu.includes('Material') && menu.includes('✥ Move / rotate / scale'), `right-click → 🧊 3D model (${menu.join(' · ')})`);

  // ---- replace in place: same layer, sliders and keys kept, nothing left behind ----
  const before = D.layers().layers.length;
  const health0 = await evalIn('__labHealth()');
  ok(/replaces/.test(await say(`/model replace ${DIR}/other.glb`)), '/model replace');
  ok(await until(async () => (await model('other'))?.loaded, 20000), 'the new model loaded');
  const L2 = D.layers().layers.find((x) => x.name === '🧊 other');
  ok(D.layers().layers.length === before && L2 && L2.keyframes?.['slider orbit']?.length === 2, 'same layer count, the camera keys kept');
  ok(D.sliders('🧊 other').sliders.find((s) => s.key === 'material')?.value === 'holographic', 'the sliders kept (holographic)');
  const health1 = await evalIn('__labHealth()');
  ok(health1.renderers <= health0.renderers, `no renderer left behind (${health0.renderers} → ${health1.renderers})`);
  ok((await until(models, 8000))?.length === 1, 'one model alive in the preview');

  // ---- a bad file: a clear error, the rest keeps going ----
  await say(`/model add ${DIR}/broken.glb`);
  const bad = await until(async () => (await models())?.find((m) => m.error), 30000); // (slow under a software GPU)
  ok(bad && /web page/.test(bad.error), `a clear error for a web page saved as .glb (${bad?.error})`);
  ok((await model('other'))?.loaded, 'the other model still draws');
  ok(D.report().errors.some((e) => /web page/.test(e.message)), 'the error is in the Lab\'s errors (the director sees it)');
  out.models = (await models() || []).map((m) => `${m.name}: ${m.loaded ? 'ok' : m.error}`);
  out.health = health1;
} catch (err) { fail.push(`threw: ${err.stack || err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, out }, null, 1);
