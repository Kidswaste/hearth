// (Nov 9) Scenes v2: a 20-layer v2 scene (past Chromium's 16 WebGL contexts a page, where an old scene goes black):
// every layer mounted on the one renderer, the picture drawn, no WebGL context, the Lab's fps. Its own temp data.
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const pj = async (code) => { const r = await ThreeLab.director.evalInSketch(`return JSON.stringify(${code})`); return r?.ok ? JSON.parse(r.value) : r; };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  const c = await ThreeLab.cmd();
  const N = 20;
  const code = (i) => `export default ({ THREE, scene, camera, audio, onFrame }) => {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.08, 16, 64), new THREE.MeshStandardNodeMaterial({ color: new THREE.Color().setHSL(${i} / ${N}, 0.8, 0.55) }));
  m.position.set(((${i} % 5) - 2) * 0.9, (Math.floor(${i} / 5) - 1.5) * 0.9, 0); scene.add(m, new THREE.HemisphereLight(0xffffff, 0x223344, 2));
  onFrame((t, dt) => { m.rotation.x += dt; m.rotation.y += dt * 0.7; m.scale.setScalar(1 + audio.bass * 0.3); });
};`;
  const layers = Array.from({ length: N }, (_, i) => ({ id: i ? `l${i + 1}` : 'main', name: `Ring ${i + 1}`, code: code(i), slot: i }));
  ThreeLab.scenes.create({ name: 'v2 twenty layers', code: layers[0].code, layers, open: true, format: 'gpu' });
  await until(() => ThreeLab.workspace.state().ready, 60000); c.play(true);
  const st = await until(async () => { const s = await pj('window.__labG2.state()'); return s && s.layers.length === N && s.frames > 60 ? s : null; }, 120000, 500);
  await wait(5000);
  const s2 = await pj('window.__labG2.state()'); const lit = await pj('window.__labG2.lit()'); const h = await pj('window.__labHealth()');
  step(`${N} v2 layers on one renderer, drawing`, Boolean(st) && s2.layers.length === N, { layers: s2.layers.length, frames: s2.frames, path: s2.path });
  step('no WebGL context for them', h.contexts === 0, { contexts: h.contexts });
  step('the picture shows (not black)', lit && lit.lit > 30, lit);
  out.fps = c.perf().fps; out.cpuMs = s2.cpuMs;
  c.play(false);
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
