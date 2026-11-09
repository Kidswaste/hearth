// (Nov 9) Scenes v2: frames drawn a second by the one WebGPU renderer vs the page's animation frames (diagnostic)
const out = {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const pj = async (code) => { const r = await D().evalInSketch(`return JSON.stringify(${code})`); return r?.ok ? JSON.parse(r.value) : r; };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  const c = await ThreeLab.cmd(); c.fps('0'); ThreeLab.quality?.set('high', { quiet: true });
  const code = (n) => `export default ({ THREE, scene, onFrame }) => { const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicNodeMaterial({ color: '#${n}' })); scene.add(m); onFrame((t, dt) => { m.rotation.y += dt; }); };`;
  for (const n of [1, 3, 6]) {
    const layers = Array.from({ length: n }, (_, i) => ({ id: i ? `l${i + 1}` : 'main', name: `L${i}`, code: code(['ff0000', '00ff00', '0000ff', 'ffff00', 'ff00ff', '00ffff'][i]), slot: i }));
    ThreeLab.scenes.create({ name: `rate ${n}`, code: layers[0].code, layers, open: true, format: 'gpu' });
    await until(() => ThreeLab.workspace.state().ready, 60000); c.play(true);
    await until(async () => (await pj('window.__labG2.state()')).layers.length === n, 30000, 300);
    await wait(3000);
    out[n] = await pj(`await (async () => { const raf0 = window.__labRafN || 0; let k = 0; const nr = (window.__nraf ||= requestAnimationFrame); const s0 = window.__labG2.state(); const t0 = performance.now(); await new Promise((r) => setTimeout(r, 2000)); const s1 = window.__labG2.state(); const dt = (performance.now() - t0) / 1000; return { g2fps: Math.round((s1.frames - s0.frames) / dt), path: s1.path, cpu: s1.cpuMs, gpu: s1.gpuMs, ts: s1.ts }; })()`);
    out[`${n} lab`] = c.perf().fps;
    await pj('window.__labG2.timing(false)'); await wait(1500);
    out[`${n} no-timing`] = await pj(`await (async () => { const s0 = window.__labG2.state(); const t0 = performance.now(); await new Promise((r) => setTimeout(r, 2000)); const s1 = window.__labG2.state(); return Math.round((s1.frames - s0.frames) / ((performance.now() - t0) / 1000)); })()`);
    await pj('window.__labG2.timing(true)');
  }
  c.play(false);
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
