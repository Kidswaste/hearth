// Lab adaptive quality (round 31 "labadapt"): a deliberately heavy scene (a heavy layer fully under an opaque one with
// shadows, bloom + grade + vignette over it) measured with adapting off, with only the covered layer skipped, at the
// old half-resolution floor and at the lightest step, interleaved (frame gaps inside the preview: fps / p50 / p95;
// SwiftShader on a shared machine is slow, so the numbers are relative); it steps down by itself and the corner note
// shows; the covered layer stops drawing and draws again when its cover fades; it climbs back with headroom (and the
// note goes); GPU particles draw fewer while lighter and all of them at full quality; a still and a freeze while lighter
// are the full-quality picture; an export (the hidden export page) is the same with the preview at its lightest as
// with adapting off; the right-click switch.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/labadapt.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], perf: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.message || err).slice(0, 300) }); } };
activate('tool:three'); await wait(400);
const c = await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx1 = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(800); } return r; };
// frame gaps inside the preview (frames told apart by document.timeline.currentTime, as in labperf.js)
const PROBE = `if (!window.__ap) {
  const ap = window.__ap = { gaps: [], last: 0, on: false };
  for (const P of [window.WebGL2RenderingContext?.prototype, window.WebGLRenderingContext?.prototype]) {
    if (!P) continue;
    for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const f = P[m]; if (typeof f !== 'function') continue;
      P[m] = function (...a) { if (ap.on) { const t = document.timeline.currentTime; if (t !== ap.last) { if (ap.last) ap.gaps.push(t - ap.last); ap.last = t; } } return f.apply(this, a); };
    }
  }
}
window.__ap.gaps = []; window.__ap.last = 0; window.__ap.on = true; return 1`;
const pct = (g, p) => { const s = g.slice().sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : null; };
async function gaps(ms) {
  await sbx(PROBE);
  const t0 = performance.now(); await wait(ms); const el = performance.now() - t0;
  const g = (await sbx('window.__ap.on = false; return window.__ap.gaps.map((x) => Math.round(x * 10) / 10)')) || [];
  return { g: Array.isArray(g) ? g : [], el };
}
const summ = (g, el, st) => ({ frames: g.length, fps: Math.round((g.length / el) * 10000) / 10, p50: pct(g, 0.5), p95: pct(g, 0.95), level: st?.level, covered: st?.covered });
async function measure(ms = 4000) { const { g, el } = await gaps(ms); return summ(g, el, await sbx('return window.__labAdapt.state()')); }
const A = (code) => sbx(`return window.__labAdapt.${code}`);

// the heavy scene (for SwiftShader: a few fps at full quality): bottom = 1500 instanced shapes (fully covered), Cover = opaque, shadows (2048 map), particles, filters
const HEAVY = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 14);
scene.add(new THREE.AmbientLight('#ffffff', 0.5)); const l = new THREE.DirectionalLight('#ffffff', 2); l.position.set(3, 4, 5); scene.add(l);
const n = 1500; const m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.12, 1), new THREE.MeshStandardMaterial({ color: '#80c0ff' }), n);
const o = new THREE.Object3D(); for (let i = 0; i < n; i++) { o.position.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6); o.updateMatrix(); m.setMatrixAt(i, o.matrix); } scene.add(m);
function frame() { requestAnimationFrame(frame); m.rotation.y = performance.now() / 3000; renderer.render(scene, camera); }
requestAnimationFrame(frame);`;
const COVER = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1a2238');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 3, 9); camera.lookAt(0, 0, 0);
scene.add(new THREE.AmbientLight('#ffffff', 0.35));
const l = new THREE.DirectionalLight('#ffe8d0', 2.5); l.position.set(4, 8, 5); l.castShadow = true; l.shadow.mapSize.set(1024, 1024);
Object.assign(l.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7 }); scene.add(l);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#334466' })); floor.rotation.x = -Math.PI / 2; floor.position.y = -1.5; floor.receiveShadow = true; scene.add(floor);
const g = new THREE.Group(); scene.add(g);
for (let i = 0; i < 60; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(i / 60, 0.6, 0.55) })); s.position.set(Math.cos(i * 0.7) * (1 + i / 40), Math.sin(i * 0.31), Math.sin(i * 0.7) * (1 + i / 40)); s.castShadow = true; g.add(s); }
function frame() { requestAnimationFrame(frame); g.rotation.y = performance.now() / 4000; renderer.render(scene, camera); }
requestAnimationFrame(frame);`;
// a small exact frame size: the machine running the checks is shared and SwiftShader is slow; the numbers are relative
try { c.customSize(640, 360); c.size('custom'); } catch (err) { out.sizeError = err.message; }
await wait(1500);
await d.newSketch('labadapt heavy', HEAVY, 3);
await d.addLayer({ name: 'Cover', code: COVER }, 3);
// (GPU particles are looked at on their own below: on SwiftShader one particle layer alone takes the preview to ~1 fps)
const fx = ['bloom', 'grade', 'vignette'].map((id) => ThreeLayers.FILTERS.find((f) => f.id === id) || ThreeLayers.FILTERS.find((f) => f.id.includes(id))).filter(Boolean);
for (const f of fx) await d.addLayer({ name: f.name, code: f.code }, 1.5);
out.filters = fx.map((f) => f.id);
await wait(2500);
step('the adapt runtime is in the preview', Boolean((await A('state()'))?.on != null), await A('state()'));

// 1) before → after, the same heavy scene: each setting twice, interleaved (the machine's load moves): off (full
// quality), the covered layer skipped only, the old ladder's floor (half resolution only), the lightest step
await safe('measure', async () => {
  const CFG = {
    off: async () => { c.adapt(false); },
    coveredSkipped: async () => { c.adapt(true); await wait(300); await A('set({ level: 0, hold: true })'); },
    resolutionOnly: async () => { c.adapt(true); await wait(300); await A('set({ level: 3, hold: true, cull: false })'); },
    lightest: async () => { c.adapt(true); await wait(300); await A('set({ level: 9, hold: true })'); },
  };
  const acc = Object.fromEntries(Object.keys(CFG).map((k) => [k, { g: [], el: 0, st: null }]));
  for (let round = 0; round < 2; round += 1) {
    for (const [k, set] of Object.entries(CFG)) {
      await set(); await wait(2500);
      const r = await gaps(5000); acc[k].g.push(...r.g); acc[k].el += r.el; acc[k].st = await A('state()');
    }
  }
  for (const [k, a] of Object.entries(acc)) out.perf[k] = summ(a.g, a.el, a.st);
  const P = out.perf;
  out.relative = { p50: { off: 1, coveredSkipped: +(P.coveredSkipped.p50 / P.off.p50).toFixed(2), resolutionOnly: +(P.resolutionOnly.p50 / P.off.p50).toFixed(2), lightest: +(P.lightest.p50 / P.off.p50).toFixed(2) }, fps: { off: P.off.fps, coveredSkipped: P.coveredSkipped.fps, resolutionOnly: P.resolutionOnly.fps, lightest: P.lightest.fps } };
  step('skipping the covered layer: frames take less time than full quality (p50)', P.coveredSkipped.p50 < P.off.p50, out.relative);
  step('the lightest step: frames take clearly less time than full quality (p50 ≤ 80 %)', P.lightest.p50 <= P.off.p50 * 0.8, out.relative);
  step('the lightest step beats the old resolution-only floor (p50)', P.lightest.p50 <= P.resolutionOnly.p50, out.relative);
});
// 2) on its own: it steps down, the note shows, the covered layer is found
await safe('auto', async () => {
  await A('set({ level: 0, hold: false })');
  const went = await until(async () => (await A('state()'))?.level >= 2, 45000);
  const st = await A('state()');
  out.auto = st;
  step('on its own under the heavy scene it steps down (level ≥ 2)', went, st);
  const note = document.querySelector('.three-preview .lab-adapt-note');
  await until(() => note && !note.hidden, 3000);
  step('the corner note shows while lighter', Boolean(note && !note.hidden && /lighter to stay smooth/.test(note.textContent)), { text: note?.textContent, hidden: note?.hidden });
  const cov = await A('cover()');
  step('the layer under the opaque one is found covered (and skips drawing)', Array.isArray(cov) && cov.length >= 1, { covered: cov });
  out.perf.auto = await measure(5000);
  await smoke({ shot: '/tmp/labadapt-note.png' }).catch(() => null);
});
// 3) the cover fades: the layer under it draws again (the frame the cover stops covering)
await safe('uncover', async () => {
  await d.updateLayer('Cover', { opacity: 0.6 }, 0.3);
  const gone = await until(async () => (await A('cover()'))?.length === 0, 4000);
  step('the cover fades to 60 %: nothing is skipped any more', gone, { covered: await A('cover()') });
  await d.updateLayer('Cover', { opacity: 1 }, 1);
  const back = await until(async () => (await A('cover()'))?.length >= 1, 6000);
  step('…opaque again: the layer under it is skipped again', back);
});
// 4) climbing back with headroom (a fast machine played: frames may take 1 s), the note goes
await safe('climb', async () => {
  await A('set({ level: 9, hold: false, target: 1000 })');
  const t0 = Date.now();
  const up = await until(async () => (await A('state()'))?.level === 0, 70000);
  out.climbSeconds = Math.round((Date.now() - t0) / 100) / 10;
  const note = document.querySelector('.three-preview .lab-adapt-note');
  await until(() => note?.hidden, 3000);
  step('headroom: it climbs back to full quality step by step, and the note goes', up && note?.hidden, { ...(await A('state()')), seconds: out.climbSeconds });
  await A('set({ level: 0, hold: false })');
});
// 5) GPU particles: the particle steps draw fewer of them in the preview, all of them at full quality
await safe('particles', async () => {
  await d.addLayer({ name: 'Sparks', code: 'particles({ count: 60, emit: 1, size: 0.05 });' }, 3);
  const info = () => sbx('return (window.__labParticles?.info() || []).map((x) => ({ count: x.count, active: x.active }))');
  await A('set({ level: 0, hold: true })'); await wait(2500);
  const full = await info();
  await A('set({ level: 9, hold: true })'); await wait(2500);
  const light = await info();
  out.particles = { full, light };
  step('particles: all of them at full quality, fewer at the lightest step (the same when the count is already at the floor of 256)', full[0]?.active === full[0]?.count && (light[0]?.active < full[0]?.active || full[0]?.count <= 256), out.particles);
  await d.updateLayer('Sparks', { visible: false }, 0.5);
});
// 6) stills and exports: a clean still scene (nothing moves) with the filters
const decode = async (url) => { const img = new Image(); img.src = url; await img.decode(); const cv = new OffscreenCanvas(96, 96); const g = cv.getContext('2d'); g.drawImage(img, 0, 0, 96, 96); return g.getImageData(0, 0, 96, 96).data; };
const mad = (a, b) => { if (!a || a.length !== b?.length) return 999; let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return Math.round((s / a.length) * 1000) / 1000; };
await safe('still', async () => {
  await d.newSketch('labadapt still', COVER.replace('g.rotation.y = performance.now() / 4000;', ''), 3);
  // (the filters not moving with the demo beat either, so two pictures at different moments compare)
  for (const f of fx) await d.addLayer({ name: f.name, code: f.spec?.react ? ThreeLayers.filterCode(f.id, { react: 0 }) : f.code }, 1.5);
  c.adapt(false); await wait(2500);
  const full = await decode(await d.shot());
  c.adapt(true); await wait(500); await A('set({ level: 9, hold: true })'); await wait(3000);
  const peek = await decode(await A('peek()'));
  const lighter = await decode(await d.shot());
  out.still = { lighterPreviewVsFull: mad(peek, full), stillWhileLighterVsFull: mad(lighter, full) };
  step('the preview at its lightest really draws differently (the test can see it)', out.still.lighterPreviewVsFull > 0.05, out.still);
  step('a still taken while lighter is the full-quality picture (mean difference ≤ 0.6 of 255)', out.still.stillWhileLighterVsFull <= 0.6, out.still);
  c.freeze(true); await wait(2500);
  const frozen = await decode(await A('peek()'));
  c.freeze(false); await wait(500);
  out.still.frozenWhileLighterVsFull = mad(frozen, full);
  step('freezing while lighter holds a full-quality frame (≤ 0.6)', out.still.frozenWhileLighterVsFull <= 0.6, out.still);
});
await safe('export', async () => {
  if (typeof LabExport === 'undefined') { step('LabExport is there', false); return; }
  const sigOf = async (p) => { const u8 = await window.hub.fs.read(p, { encoding: 'buffer' }); const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' })); const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); return g.getImageData(0, 0, bmp.width, bmp.height).data; };
  const R = () => LabExport.render({ format: 'still', size: '400x225', at: 0.5, alpha: false }).then((r) => sigOf(r.path));
  c.adapt(false); await wait(800);
  const a = await R();
  c.adapt(true); await wait(500); await A('set({ level: 9, hold: true })'); await wait(1500);
  const b = await R();
  c.adapt(false); await wait(800);
  const a2 = await R();
  // (the export page's own noise: two renders with adapting off)
  out.export = { offVsOff: mad(a, a2), lightestVsOff: mad(b, a2), lightestVsFirstOff: mad(b, a) };
  step('an exported frame is the same with the preview at its lightest as with adapting off (no more different than two renders with it off)', out.export.lightestVsOff <= Math.max(0.05, out.export.offVsOff), out.export);
  c.adapt(true);
});
// 7) the right-click switch
await safe('switch', async () => {
  const items = []; const orig = window.showMenu;
  window.showMenu = (x, y, it) => { items.push(...(typeof it === 'function' ? it() : it)); return null; };
  try { await sbx1('dispatchEvent(new MouseEvent("contextmenu", { clientX: 40, clientY: 40, bubbles: true })); return 1'); await until(() => items.length, 3000); } finally { window.showMenu = orig; }
  const view = items.find((i) => i && i.label === 'View');
  const row = view ? (typeof view.items === 'function' ? view.items() : view.items).find((i) => i && /Lighten to stay smooth|^Quality: auto/.test(i.label)) : null; // (round 74) renamed "Quality: auto" by labfps72 (round 72), the same setting
  step('right-click › View › Quality: auto (was Lighten to stay smooth) (checked)', Boolean(row && row.checked === true), { found: Boolean(row), hint: row?.hint });
  if (row) {
    await A('set({ level: 4, hold: true })'); await wait(400);
    row.action(); await wait(1000);
    const st = await A('state()');
    const note = document.querySelector('.three-preview .lab-adapt-note');
    step('…turning it off: full quality, nothing skipped, no note, remembered', st?.on === false && st.level === 0 && st.covered === 0 && note?.hidden && store.get('three.adapt') === false, st);
    c.adapt(true);
  }
});
out.ok = out.steps.every((s) => s.ok);
return JSON.stringify(out);
