// ⚛ Light physics (round 25, physics): every preset runs as a ⚛ layer without an error and draws; bodies fall onto
// the floor and pile up (balls collide: none inside another); a kick (held through window.__labPhysics.drive) changes
// the bodies' velocities; a flag moves with the wind; scrubbing back re-simulates from a cached state to the same
// numbers; the same exported frame twice is the same picture; /physics and three_do physics (the director).
//   node dev/smoke.js --check-timeout 420000 --script dev/checks/physics.js --shot /tmp/hearth-physics.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], presets: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.message || err).slice(0, 300) }); } };
activate('tool:three'); await wait(400);
await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(500); } return r; };
const rowOf = (name) => d.layers().layers.find((x) => x.name === name);
const statOf = async (name) => { const L = rowOf(name); const all = await sbx('return window.__labPhysics.info()'); return Array.isArray(all) ? all.find((x) => x.id === L?.id) || null : null; };
const probeOf = async (name) => { const L = rowOf(name); return sbx(`return window.__labPhysics.probe(${JSON.stringify(L?.id)})`); };
const bodiesOf = async (name, max = 80) => { const L = rowOf(name); return sbx(`return window.__labPhysics.bodies(${JSON.stringify(L?.id)}, ${max})`); };
const pix = async () => String(await sbx('return window.__labGpu.probe(16)')).split(',').map(Number);
const mean = (a) => (a?.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const BG = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0d12'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
await d.newSketch('physics probe', BG, 3);
step('LabPhysics loaded with the Lab (presets, /physics)', typeof LabPhysics !== 'undefined' && LabPhysics.PRESETS.length >= 20 && Boolean(Commands.get('physics')), { presets: LabPhysics?.PRESETS?.length });

// 1. every preset runs (one layer, replaced by each preset in turn): it steps, draws, no error
let first = null;
await safe('presets', async () => {
  const r0 = await LabPhysics.add('bounce');
  first = r0.layer;
  const bad = {};
  for (const p of LabPhysics.PRESETS) {
    const L = rowOf(first);
    await HubBridge.call('three_update_layer', { layer: L.id, code: LabPhysics.codeFor(p), wait: 0.4 });
    const okNow = await until(async () => { const s = await statOf(L.name); return s && s.frames > 3 && s.step > 3 && s.build === p.opts.build; }, 8000);
    const s = await statOf(L.name);
    const errs = d.report().errors.filter((e) => e.layer === L.name);
    out.presets[p.id] = s ? { bodies: s.bodies, n: s.particles, stepMs: s.stepMs, ms: s.ms, kinds: Object.entries(s.kinds || {}).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(' ') } : null;
    if (!okNow || errs.length || !s?.bodies) bad[p.id] = { frames: s?.frames, step: s?.step, errs: errs.slice(0, 2) };
  }
  step(`${LabPhysics.PRESETS.length} presets run as ⚛ layers (step, draw, no errors)`, !Object.keys(bad).length, Object.keys(bad).length ? bad : LabPhysics.PRESETS.length);
});

// 2. bodies fall and collide: balls rain into the box, pile up, none inside another; the picture has them
await safe('fall', async () => {
  const L = rowOf(first);
  await HubBridge.call('three_update_layer', { layer: L.id, code: LabPhysics.codeFor(LabPhysics.preset('bounce'), { sliders: { kick: 0, count: 24 } }), wait: 1 });
  await until(async () => (await statOf(L.name))?.frames > 5, 8000);
  const a = await bodiesOf(L.name); await wait(2500); const b = await bodiesOf(L.name);
  const p = await probeOf(L.name);
  let overlap = 0; const R = 0.16 * 1.35;
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) { const dd = Math.hypot(b[i].p[0] - b[j].p[0], b[i].p[1] - b[j].p[1], b[i].p[2] - b[j].p[2]); if (dd < 0.16 * 0.75 * 2 * 0.8) overlap += 1; }
  const fell = mean(a.map((x) => x.p[1])) > mean(b.map((x) => x.p[1])) + 0.1 || mean(b.map((x) => x.p[1])) < R * 1.5;
  const bright = mean(await pix());
  step('balls fall onto the floor and pile up without passing through each other', fell && b.every((x) => x.p[1] > 0.08) && overlap === 0 && bright > 1, { yBefore: Math.round(mean(a.map((x) => x.p[1])) * 100) / 100, yAfter: Math.round(mean(b.map((x) => x.p[1])) * 100) / 100, overlap, asleep: p.asleep, bright: Math.round(bright) });
  await smoke({ shot: '/tmp/hearth-physics-balls.png' });
});

// 3. a kick changes the velocities (held through drive), only on its rising edge
await safe('kick', async () => {
  const L = rowOf(first);
  await sbx('return window.__labPhysics.drive({ kick: 0 })');
  await HubBridge.call('three_update_layer', { layer: L.id, code: LabPhysics.codeFor(LabPhysics.preset('bounce'), { sliders: { kick: 4, count: 16 } }), wait: 1 });
  await until(async () => (await probeOf(L.name))?.asleep >= 12, 9000);
  const before = await probeOf(L.name);
  await sbx('return window.__labPhysics.drive({ kick: 1 })');
  await wait(120);
  const after = await probeOf(L.name);
  await sbx('return window.__labPhysics.drive({ kick: null })');
  step('a kick impulse makes resting bodies jump (velocities up, they wake)', before.maxV < 0.2 && after.maxV > 1.5 && after.kicks > before.kicks && after.awake > before.awake, { before: { maxV: before.maxV, asleep: before.asleep, kicks: before.kicks }, after: { maxV: after.maxV, awake: after.awake, kicks: after.kicks } });
  await smoke({ shot: '/tmp/hearth-physics-kick.png' });
});

// 4. cloth moves with the wind (flag: calm vs windy)
await safe('cloth', async () => {
  const L = rowOf(first);
  const reach = async (wind) => {
    await HubBridge.call('three_update_layer', { layer: L.id, code: LabPhysics.codeFor(LabPhysics.preset('flag'), { sliders: { wind, turb: 0, bassWind: 0 } }), wait: 0.8 });
    await until(async () => (await statOf(L.name))?.step > 100, 9000);
    await wait(600);
    return probeOf(L.name);
  };
  const calm = await reach(0); const windy = await reach(9);
  await smoke({ shot: '/tmp/hearth-physics-flag.png' });
  step('a flag hangs in calm air and flies out in the wind (its cloth moved)', Math.abs(windy.sig - calm.sig) > 20 && windy.meanY > calm.meanY + 0.2, { calm: { meanY: calm.meanY, sig: calm.sig }, windy: { meanY: windy.meanY, sig: windy.sig, ke: windy.ke } });
});

// 5. scrubbing back on a timeline re-simulates from a cached state to exactly the same numbers
await safe('scrub', async () => {
  const L = rowOf(first);
  await HubBridge.call('three_update_layer', { layer: L.id, code: LabPhysics.codeFor(LabPhysics.preset('dominoes'), { sliders: { count: 24 } }), wait: 0.8 });
  // the layer's clock held at a time (window.__labPhysics.hold: a timeline, as a song or the sequence give)
  const res = await sbx(`
    const id = ${JSON.stringify(L.id)}; const P = window.__labPhysics;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const at = async (t) => { P.hold(id, t); await wait(250); for (let i = 0; i < 60 && P.probe(id).behind > 0; i += 1) await wait(100); await wait(100); return P.probe(id); };
    try {
      P.hold(id, 0); P.poke(id, 'reset'); await wait(300);
      const a = await at(3.0); const mid = await at(1.2); const b = await at(3.0); const c = await at(4.5); const d2 = await at(3.0);
      return { a, mid, b, c, d: d2 };
    } finally { P.hold(id, null); }`);
  const ok = res?.a && res.a.sig === res.b.sig && res.b.sig === res.d.sig && res.mid.step === 72 && res.a.step === 180 && res.b.resims > res.a.resims && res.c.sig !== res.a.sig;
  step('scrubbing back re-simulates from a cached state: the same frame, the same state (3 s → 1.2 s → 3 s → 4.5 s → 3 s)', ok, res?.error ? res : { a: res?.a?.sig, back: res?.mid?.step, again: res?.b?.sig, later: res?.c?.sig, againAfter: res?.d?.sig, resims: res?.d?.resims, cached: res?.d?.snaps });
});

// 6. the director and chat
await safe('director', async () => {
  const l = await HubBridge.call('three_do', { cmd: 'physics', op: 'list', filter: 'cloth' });
  step('three_do physics list (the director)', l.ok && /flag/.test(l.value), String(l.value || l.error).slice(0, 120));
  const a = await HubBridge.call('three_do', { cmd: 'physics', op: 'add', preset: 'pyramid', sliders: { count: 4 } });
  const rows = d.layers().layers.filter((x) => /^physics/.test(x.kind || ''));
  step('three_do physics add → a new ⚛ layer the scene lists as physics', a.ok && rows.some((x) => x.name === a.value.layer), { r: a.ok ? a.value : a.error, kinds: rows.map((x) => x.name) });
  const b = await HubBridge.call('three_do', { cmd: 'physics', op: 'body', layer: a.value?.layer, type: 'ball', at: [0, 3, 0], r: 0.3 });
  await wait(800);
  const i = await HubBridge.call('three_do', { cmd: 'physics', op: 'info', layer: a.value?.layer });
  step('three_do physics body + info (a ball added to the scene\'s own bodies)', b.ok && i.ok && i.value.options?.build === 'pyramid' && i.value.options.bodies?.length === 1 && i.value.bodies === 11, i.ok ? { options: i.value.options, bodies: i.value.bodies, now: i.value.now } : i.error);
  const k = await HubBridge.call('three_do', { cmd: 'physics', op: 'poke', layer: a.value?.layer, what: 'drop' });
  step('three_do physics poke drop', k.ok, k.ok ? k.value : k.error);
  const h = await HubBridge.call('three_do', { cmd: 'help', topic: 'physics' });
  step('three_do help physics (on demand)', h.ok && /LIGHT PHYSICS/.test(h.value), String(h.value || h.error).slice(0, 80));
  let said = '';
  await Commands.tryRun('/physics list rigid', H.claudeAgent().id, null, { say: (x) => { said = x; }, note: (x) => { said = x; } });
  step('/physics list rigid', /dominoes/.test(said), said.slice(0, 120));
  await d.updateLayer(a.value.layer, { visible: false }, 0.3);
});

// 7. an exported frame twice is the same picture (the export page: a fresh page, the seeded clock)
await safe('export', async () => {
  await d.newSketch('physics export', BG, 3);
  await LabPhysics.add('cuberain', { sliders: { count: 30 } });
  await wait(1200);
  const X = LabExport;
  const sigOf = async (p) => {
    const u8 = await window.hub.fs.read(p, { encoding: 'buffer' });
    const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
    const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, bmp.width, bmp.height).data;
  };
  const a = await X.render({ format: 'still', size: '320x180', at: 3, alpha: false });
  const b = await X.render({ format: 'still', size: '320x180', at: 3, alpha: false });
  const c = await X.render({ format: 'still', size: '320x180', at: 4.5, alpha: false });
  const [A, B, C] = [await sigOf(a.path), await sigOf(b.path), await sigOf(c.path)];
  let same = 0; let other = 0; let lit = 0;
  for (let k = 0; k < A.length; k++) { same += Math.abs(A[k] - B[k]); other += Math.abs(A[k] - C[k]); if (k % 4 !== 3 && A[k] > 40) lit += 1; }
  step('the same exported frame twice is the same picture; another time is another picture', same === 0 && other > 0 && lit > 50, { same, other: Math.round(other / A.length * 1000) / 1000, lit });
});

const h = await sbx('return window.__labHealth()');
out.health = h;
const failed = out.steps.filter((x) => !x.ok).map((x) => x.name);
return JSON.stringify({ ok: !failed.length, failed, ...out }, null, 1);
