// ✦ GPU particles (round 24, particles): every preset runs as a ✦ layer without an error and draws; the particles
// move with the scene's clock; a kick (held through window.__labParticles.drive) bursts a kick-only preset; a model
// layer's surface and a word's letters are the places particles are born; the same exported frame twice is the same
// picture (the export page steps the sim on its seeded clock); /particles and three_do particles (the director).
//   node dev/smoke.js --check-timeout 420000 --script dev/checks/particles.js --shot /tmp/hearth-particles.png
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
const statOf = async (name) => { const L = rowOf(name); const all = await sbx('return window.__labParticles.info()'); return Array.isArray(all) ? all.find((x) => x.id === L?.id) || null : null; };
const probeOf = async (name, rows = 32) => { const L = rowOf(name); return sbx(`return window.__labParticles.probe(${JSON.stringify(L?.id)}, ${rows})`); };
const pix = async () => String(await sbx('return window.__labGpu.probe(16)')).split(',').map(Number);
const mean = (a) => (a?.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const BG = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#05060a'); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
await d.newSketch('particles probe', BG, 3);
step('LabParticles loaded with the Lab (presets, /particles)', typeof LabParticles !== 'undefined' && LabParticles.PRESETS.length >= 20 && Boolean(Commands.get('particles')), { presets: LabParticles?.PRESETS?.length });

// 1. every preset runs (one layer, replaced by each preset in turn): it draws, no error, sliders from the preset
let first = null;
await safe('presets', async () => {
  const r0 = await LabParticles.add('galaxy');
  first = r0.layer;
  const bad = {};
  for (const p of LabParticles.PRESETS) {
    if (['picture', 'modeldust', 'glowrise'].includes(p.id)) continue; // (need a picture / model / layer: below)
    const L = rowOf(first) || d.layers().layers.find((x) => /^particles/.test(x.kind || ''));
    await HubBridge.call('three_update_layer', { layer: L.id, code: LabParticles.codeFor(p), wait: 0.5 });
    const okNow = await until(async () => { const s = await statOf(L.name); return s && s.frames > 2 && s.ok != null; }, 8000);
    const s = await statOf(L.name);
    const errs = d.report().errors.filter((e) => e.layer === L.name);
    out.presets[p.id] = s ? { n: s.count, ms: s.ms, homes: s.homes, look: s.look } : null;
    if (!okNow || errs.length || !s?.homes || s.ok !== true) bad[p.id] = { frames: s?.frames, errs: errs.slice(0, 2), homes: s?.homes };
  }
  const n = LabParticles.PRESETS.length - 3;
  step(`${n} presets run as ✦ layers (draw, no errors)`, !Object.keys(bad).length, Object.keys(bad).length ? bad : n);
});

// 2. moving with the clock (galaxy: they turn; the picture changes)
await safe('moves', async () => {
  const L = rowOf(first);
  await HubBridge.call('three_update_layer', { layer: L.id, code: LabParticles.codeFor(LabParticles.preset('galaxy')), wait: 1 });
  await until(async () => (await statOf(L.name))?.frames > 5, 8000);
  const a = await probeOf(L.name); const pa = await pix(); await wait(800);
  const b = await probeOf(L.name); const pb = await pix();
  const s = await statOf(L.name);
  let dp = 0; for (let i = 0; i < pa.length; i++) dp += Math.abs(pa[i] - pb[i]); dp /= pa.length || 1;
  step('particles move with the scene\'s clock (state and picture)', a?.alive > 100 && Math.abs(a.sig - b.sig) > 0.05 && b.simT > a.simT && dp > 0.05 && mean(pb) > 1, { a, b, picMoved: Math.round(dp * 100) / 100, bright: Math.round(mean(pb)), count: s?.count, ms: s?.ms });
  const sl = d.sliders(L.id).sliders.map((x) => x.key);
  step('its sliders are the preset\'s (count, curl, kickEmit, bassForce, hueBright…)', ['count', 'curl', 'kickEmit', 'bassForce', 'hueBright', 'swirl', 'vortexPull'].every((k) => sl.includes(k)), sl);
  await smoke({ shot: '/tmp/hearth-particles-galaxy.png' });
});

// 3. a kick bursts a kick-only preset (sparks: emission 0)
await safe('kick', async () => {
  await sbx('return window.__labParticles.drive({ kick: 0, bass: 0 })');
  const L = rowOf(first);
  await HubBridge.call('three_update_layer', { layer: L.id, code: LabParticles.codeFor(LabParticles.preset('sparks')), wait: 1 });
  await until(async () => (await statOf(L.name))?.frames > 5, 8000);
  await wait(300);
  const before = await probeOf(L.name, 128);
  const b0 = (await statOf(L.name)).bursts;
  await sbx('return window.__labParticles.drive({ kick: 1 })');
  await until(async () => (await statOf(L.name))?.bursts > b0, 4000);
  await wait(150);
  const after = await probeOf(L.name, 128);
  await sbx('return window.__labParticles.drive({ kick: 0 })');
  await smoke({ shot: '/tmp/hearth-particles-sparks.png' });
  await wait(1700);
  const later = await probeOf(L.name, 128);
  step('a kick bursts them (none alive before, a share born on the kick, gone after their life)', before?.alive === 0 && after?.alive > 0.15 * after.of && later?.alive < after.alive * 0.2, { before: before?.alive, after: after?.alive, of: after?.of, later: later?.alive });
  await sbx('return window.__labParticles.drive({ kick: null, bass: null })');
});

// 4. born on a model layer's surface (a group named Model, as 🧊 model layers have) and on a word's letters
await safe('model', async () => {
  const MODEL = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0.5, 6); camera.lookAt(0, 0, 0);
const root = new THREE.Group(); root.name = 'Model'; root.position.set(1.2, 0, 0); scene.add(root);
root.add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.25, 64, 8), new THREE.MeshBasicMaterial({ color: '#c08040' })));
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
  await d.addLayer({ name: 'Knot model', code: MODEL }, 1.5);
  const r = await LabParticles.add('modeldust', { source: 'Knot model', sliders: { dissolve: 0, kickPush: 0 } });
  await until(async () => (await statOf(r.layer))?.homes > 0, 10000);
  await wait(900);
  const s = await statOf(r.layer); const p = await probeOf(r.layer, 64);
  step('emitted from a model layer: its surface (the knot at x = 1.2), its camera', s?.source === 'Knot model' && s.homes > 1000 && p?.alive > 500 && Math.abs(p.mean[0] - 1.2) < 0.35 && p.spread > 0.3 && p.spread < 1.6, { source: s?.source, homes: s?.homes, probe: p });
  await smoke({ shot: '/tmp/hearth-particles-model.png' });
  await d.updateLayer(r.layer, { visible: false }, 0.3);
  await d.updateLayer('Knot model', { visible: false }, 0.3);
});
await safe('text', async () => {
  const r = await LabParticles.add('dissolve', { text: 'HI', sliders: { dissolve: 0 } });
  await until(async () => (await statOf(r.layer))?.frames > 5, 8000);
  await wait(900);
  const s = await statOf(r.layer); const p = await probeOf(r.layer, 64);
  step('emitted from a text shape (the letters of "HI")', s?.source === 'text' && s.homes > 1000 && p?.alive > 500 && Math.abs(p.mean[0]) < 0.4 && p.spread > 0.2 && p.spread < 1.5, { homes: s?.homes, probe: p });
  // dissolve: released particles leave the letters
  await HubBridge.call('three_do', { cmd: 'particles', op: 'set', layer: r.layer, values: { dissolve: 1, curl: 2 } });
  await until(async () => (await statOf(r.layer))?.frames > 5, 8000);
  await wait(1500);
  const q = await probeOf(r.layer, 64);
  step('…and dissolves (Dissolve 1: they leave the letters)', q?.spread > p.spread * 1.15, { held: p?.spread, dissolved: q?.spread });
  await smoke({ shot: '/tmp/hearth-particles-text.png' });
});

// 5. the director and chat
await safe('director', async () => {
  const l = await HubBridge.call('three_do', { cmd: 'particles', op: 'list', filter: 'kick' });
  step('three_do particles list (the director)', l.ok && /sparks/.test(l.value), String(l.value || l.error).slice(0, 120));
  const a = await HubBridge.call('three_do', { cmd: 'particles', op: 'add', preset: 'snow', sliders: { count: 20 } });
  const rows = d.layers().layers.filter((x) => /^particles/.test(x.kind || ''));
  step('three_do particles add → a new ✦ layer the scene lists as particles', a.ok && rows.some((x) => x.name === a.value.layer), { r: a.ok ? a.value : a.error, kinds: rows.map((x) => x.name) });
  const i = await HubBridge.call('three_do', { cmd: 'particles', op: 'info', layer: a.value?.layer });
  step('three_do particles info', i.ok && i.value.options?.emitter === 'plane' && i.value.sliders.includes('gravity'), i.ok ? { options: i.value.options, n: i.value.particles } : i.error);
  let said = '';
  await Commands.tryRun('/particles list space', H.claudeAgent().id, null, { say: (x) => { said = x; }, note: (x) => { said = x; } });
  step('/particles list space', /galaxy/.test(said), said.slice(0, 120));
  await d.updateLayer(a.value.layer, { visible: false }, 0.3);
});

// 6. an exported frame twice is the same picture (the export page: a fresh page, the seeded clock)
await safe('export', async () => {
  await d.newSketch('particles export', BG, 3);
  await LabParticles.add('ribbons', { sliders: { count: 20 } });
  await wait(1200);
  const X = LabExport;
  const sigOf = async (p) => {
    const u8 = await window.hub.fs.read(p, { encoding: 'buffer' });
    const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
    const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, bmp.width, bmp.height).data;
  };
  const a = await X.render({ format: 'still', size: '320x180', at: 1.5, alpha: false });
  const b = await X.render({ format: 'still', size: '320x180', at: 1.5, alpha: false });
  const c = await X.render({ format: 'still', size: '320x180', at: 2.5, alpha: false });
  const [A, B, C] = [await sigOf(a.path), await sigOf(b.path), await sigOf(c.path)];
  let same = 0; let other = 0; let lit = 0;
  for (let k = 0; k < A.length; k++) { same += Math.abs(A[k] - B[k]); other += Math.abs(A[k] - C[k]); if (k % 4 !== 3 && A[k] > 40) lit += 1; }
  step('the same exported frame twice is the same picture; another time is another picture', same === 0 && other > 0 && lit > 50, { same, other: Math.round(other / A.length * 1000) / 1000, lit });
});

const h = await sbx('return window.__labHealth()');
out.health = h;
const failed = out.steps.filter((x) => !x.ok).map((x) => x.name);
return JSON.stringify({ ok: !failed.length, failed, ...out }, null, 1);
