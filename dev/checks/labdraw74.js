// The Lab preview's own per-frame cost (round 74, labdraw74), in the real preview (SwiftShader under Xvfb):
//   still    a still scene left alone draws at most a refresh (≤ 1 a second; 4 s apart once settled); the check's own
//            evals and the pointer moving over it draw nothing; a slider still draws at once
//   crowd    a big InstancedMesh crowd moved every frame (a shadowed sun): only the copies the camera or the sun's
//            shadow box can see are drawn (triangles a frame cull on vs off), the picture is the SAME (pixels compared,
//            the crowd's order back in the sketch's hands after render: getMatrixAt reads what it wrote)
//   hidden   a hidden layer costs nothing (its frames don't run, nothing drawn: the Lab's own rule since labcanvas56,
//            held here); shown again: it draws at once
//   shadows  a shadowed scene whose camera orbits and whose non-casting particles move: the maps are kept (casters
//            and lights didn't move) instead of drawn every frame
//   slider   Quality auto doesn't step down while a slider is moving (frames forced "slow"), and does once let go
//   node dev/smoke.js --fake-engines --check-timeout 400000 --script dev/checks/labdraw74.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [], numbers: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 500) }); } };
activate('tool:three'); await wait(400);
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director, 60000);
const c = await ThreeLab.cmd(); const D = ThreeLab.director;
const sbx1 = (code) => D.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));
const sbx = async (code) => { let r; for (let i = 0; i < 5; i++) { r = await sbx1(code); if (!r?.error) return r; await wait(600); } return r; };
try { c.customSize(480, 270); c.size('custom'); } catch (err) { out.sizeError = err.message; }
await wait(800);

// ---------- still ----------
const STILL = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#141a2a');
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 1.5, 6); camera.lookAt(0, 0, 0);
scene.add(new THREE.AmbientLight('#fff', 0.5)); const l = new THREE.DirectionalLight('#fff', 2); l.position.set(3, 4, 5); scene.add(l);
const P = tweak({ hue: [0.6, 0, 1] });
const mat = new THREE.MeshStandardMaterial({ color: '#80c0ff', roughness: 0.4 });
scene.add(new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.32, 160, 24), mat));
function frame() { requestAnimationFrame(frame); mat.color.setHSL(P.hue, 0.6, 0.6); renderer.render(scene, camera); }
requestAnimationFrame(frame);`;
const PS = () => sbx('return window.__labPace.state()');
await D.newSketch('labdraw74 still', STILL, 3);
await wait(5000); // (settled: past the 3 s of refreshes a second)
await safe('still', async () => {
  await sbx('window.__labPace.reset(); return 1');
  const a = await PS(); await wait(6000); const b = await PS();
  const sec = 6; const drawn = b.drawn - a.drawn;
  out.numbers.still = { drawnPerSec: Math.round((drawn / sec) * 100) / 100, refreshes: b.refreshes - a.refreshes, why: b.why, pokes: b.poke - a.poke, soft: b.soft - a.soft, quality: b.quality, level: b.level };
  step('a still scene left alone (2 evals in the window): ≤ 1 draw a second (settled: a refresh every 4 s)', drawn / sec <= 1, out.numbers.still);
  // a slider: drawn at once
  const s0 = (await PS()).drawn; c.setSlider('hue', 0.2); await wait(400);
  const s1 = (await PS()).drawn;
  step('a slider moved on a still scene: it draws at once', s1 > s0, { drew: s1 - s0 });
});
await safe('slider', async () => {
  // a scene that draws every frame (Quality auto judges drawn frames), with a slider
  await D.newSketch('labdraw74 spin', STILL.replace('mat.color.setHSL(P.hue, 0.6, 0.6);', 'mat.color.setHSL(P.hue, 0.6, 0.6); scene.rotation.y += 0.01 * f60;'), 3);
  await wait(2500);
  await sbx('window.__labAdapt.set({ level: 0, hold: false, target: 1 }); return 1'); // (a target of 1 ms: every frame is "slow")
  const t0 = Date.now(); let v = 0.2;
  while (Date.now() - t0 < 3000) { v = v > 0.8 ? 0.2 : v + 0.05; try { c.setSlider('hue', v); } catch { /* fine */ } await wait(100); }
  const during = await sbx('return window.__labAdapt.state()');
  const after = await until(async () => { const x = await sbx('return window.__labAdapt.state()'); return x?.level > 0 ? x : null; }, 8000) || await sbx('return window.__labAdapt.state()');
  out.numbers.slider = { during: { level: during.level, editing: during.editing, editSkips: during.editSkips }, after: { level: after.level, editing: after.editing } };
  step('Quality auto: no step down while a slider moves (frames "slow")', during.level === 0 && during.editing === true && during.editSkips > 0, out.numbers.slider);
  step('… and it steps down once the slider is let go (frames still slow)', after.level > 0, out.numbers.slider);
  await sbx('window.__labAdapt.set({ level: 0, hold: false, target: 0 }); return 1');
});

// ---------- the crowd, a hidden layer, shadows ----------
const HEAD = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 300); camera.position.set(0, 6, 14); camera.lookAt(0, 0.5, 0);
const scene = new THREE.Scene();`;
const CROWD = `${HEAD}
scene.background = new THREE.Color('#10141c'); renderer.shadowMap.enabled = true;
const sun = new THREE.DirectionalLight('#fff', 2); sun.position.set(-6, 12, 4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun, new THREE.HemisphereLight('#9cf', '#432', 0.6));
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#334' })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const P = tweak({ t: [0.3, 0, 10] });
const N = 2000; const im = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.12, 0.4, 4, 8), new THREE.MeshStandardMaterial({ color: '#ddd' }), N); im.castShadow = true; im.receiveShadow = true; scene.add(im);
const o = new THREE.Object3D(); const col = new THREE.Color(); for (let i = 0; i < N; i++) im.setColorAt(i, col.setHSL((i * 0.13) % 1, 0.5, 0.5));
window.__crowd = im;
renderer.setAnimationLoop(() => { const s = P.t; for (let i = 0; i < N; i++) { const a = i * 0.618 + s; const r = 3 + (i % 70) * 0.25; o.position.set(Math.cos(a) * r, 0.35 + Math.abs(Math.sin(s * 4 + i)) * 0.2, Math.sin(a) * r); o.updateMatrix(); im.setMatrixAt(i, o.matrix); } im.instanceMatrix.needsUpdate = true; renderer.render(scene, camera); if (window.__grab) { window.__grab = 0; window.__grabbed = renderer.domElement.toDataURL('image/png'); } });`;
const HIDDEN = `${HEAD}
const mat = new THREE.MeshNormalMaterial(); const ms = []; for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1, 64, 8), mat); m.position.set((i % 6 - 2.5) * 1.5, 7 + Math.floor(i / 6) * 0.8, -4); scene.add(m); ms.push(m); }
window.__hidRuns = 0;
renderer.setAnimationLoop((t) => { window.__hidRuns += 1; ms.forEach((m, i) => { m.rotation.y = t / 900 + i; }); renderer.render(scene, camera); });`;
const SHADOWS = `${HEAD}
renderer.shadowMap.enabled = true; const sun = new THREE.DirectionalLight('#fff', 2); sun.position.set(4, 10, 3); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.add(sun, new THREE.AmbientLight('#fff', 0.3));
const mat = new THREE.MeshStandardMaterial({ color: '#c84' }); for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.4), mat); m.position.set((i % 5) - 2, 9.4, -2 - Math.floor(i / 5)); m.castShadow = true; scene.add(m); }
const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshStandardMaterial({ color: '#555', transparent: true, opacity: 0.5 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 9, -3.5); floor.receiveShadow = true; scene.add(floor);
const N = 3000; const pos = new Float32Array(N * 3); for (let i = 0; i < N * 3; i++) pos[i] = Math.sin(i * 12.9898) * 6; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.03, color: '#8cf' })); pts.position.y = 9; scene.add(pts);
renderer.setAnimationLoop((t) => { const s = t / 1000; for (let i = 1; i < N * 3; i += 3) pos[i] += Math.sin(s + i) * 0.003; g.attributes.position.needsUpdate = true; camera.position.x = Math.sin(s * 0.5) * 3; camera.lookAt(0, 8, -3); renderer.render(scene, camera); });`;
const list = [['Crowd', CROWD], ['Hidden', HIDDEN], ['Shadows', SHADOWS]];
await D.newSketch('labdraw74 layers', `${HEAD}\nrenderer.setAnimationLoop(() => renderer.render(scene, camera));`, 2);
const SCENE = ThreeLab.scenes.currentId();
await D.restore({ sketch: 'labdraw74 layers', sketchId: SCENE, layers: list.map(([name, code], i) => ({ id: `ld-${i}`, name, code, slot: i, visible: true, opacity: 1, blend: 'normal' })) }, { wait: 3 }).catch((err) => step('the layers', false, String(err)));
await until(async () => (await sbx('return window.__rdyLive().filter((r) => /^ld-/.test(r.__layer || "")).length')) >= 3, 30000);
await wait(2500);
await sbx('window.__labAdapt.set({ level: 0, hold: true }); return 1'); // (full quality held: pictures compare)
const R = (id) => `window.__rdyLive().find((r) => r.__layer === '${id}')`;
const info = () => sbx('return window.__labDraw.info()');

await safe('crowd', async () => {
  const tri = async () => { const a = await sbx(`const r = ${R('ld-0')}; return { f: r.info.render.frame, tris: r.info.render.triangles }`); return a; };
  await sbx('window.__labDraw.reset(); return 1');
  await wait(2000);
  const on = await info(); const tOn = await tri();
  await sbx('window.__labDraw.set({ cull: false }); return 1'); await wait(1500);
  const tOff = await tri();
  await sbx('window.__labDraw.set({ cull: true }); return 1'); await wait(800);
  out.numbers.crowd = { cull: on.cull, trianglesLastRender: { on: tOn.tris, off: tOff.tris } };
  step('a crowd of 2,000 moved every frame: only the copies a view can see are drawn', on.cull.frames > 0 && on.cull.drawnCopies < on.cull.copies * 0.85, on.cull);
  step('… fewer triangles a render (main pass + shadow pass)', tOn.tris > 0 && tOn.tris < tOff.tris * 0.9, out.numbers.crowd.trianglesLastRender);
  // the sketch's own order and count are back after render (getMatrixAt reads what it wrote)
  const back = await sbx(`const im = window.__crowd; const m = new im.matrix.constructor(); im.getMatrixAt(1999, m); const e = m.elements; const a = 1999 * 0.618 + 0.3; const r = 3 + (1999 % 70) * 0.25; return { count: im.count, ok: Math.abs(e[12] - Math.cos(a) * r) < 1e-4 && Math.abs(e[14] - Math.sin(a) * r) < 1e-4 }`);
  step('… the sketch\'s crowd is as it wrote it after render (count 2,000, copy #1999 where it put it)', back?.count === 2000 && back.ok, back);
  // the same picture: only the crowd shown, cull on vs off, the merged preview's pixels
  for (const n of ['Hidden', 'Shadows']) await D.updateLayer(n, { visible: false }, 0.2);
  await wait(1200);
  // the frame as the sketch's own render() just drew it (the culled draw itself), read in the same task
  const shot = async () => { await sbx('window.__grabbed = null; window.__grab = 1; return 1'); await until(async () => typeof (await sbx('return window.__grabbed')) === 'string', 8000); return sbx('return window.__grabbed'); };
  const pOn = await shot(); await wait(800); const pOn2 = await shot(); // (a control: the same setting twice)
  await sbx('window.__labDraw.set({ cull: false }); return 1'); await wait(1200);
  const pOff = await shot();
  await sbx('window.__labDraw.set({ cull: true }); return 1');
  const TMP = window.SMOKE_TMP || '/tmp';
  for (const [n, u] of [['on', pOn], ['on2', pOn2], ['off', pOff]]) if (typeof u === 'string') await window.hub.fs.write(`${TMP}/labdraw74-crowd-${n}.png`, Uint8Array.from(atob(u.split(',')[1]), (ch) => ch.charCodeAt(0))).catch(() => null);
  const px = async (u) => { const img = new Image(); img.src = u; await img.decode(); const cv = new OffscreenCanvas(img.width, img.height); const g = cv.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
  if (typeof pOn !== 'string' || typeof pOff !== 'string') { step('… the same picture with and without it', false, { pOn: typeof pOn, pOff: typeof pOff }); return; }
  const A = await px(pOn); const B = await px(pOff); const A2 = typeof pOn2 === 'string' ? await px(pOn2) : A;
  const cmp = (X, Y) => { let diff = 0; let max = 0; for (let i = 0; i < X.length; i++) { const d = Math.abs(X[i] - Y[i]); if (d > 2) diff += 1; if (d > max) max = d; } return { diff, max }; };
  const d1 = cmp(A, B); const d0 = cmp(A, A2); const diff = d1.diff;
  out.numbers.crowd.picture = { bytes: A.length, differing: d1.diff, maxDiff: d1.max, control: d0 };
  step('… the same picture with and without it (pixels compared)', A.length === B.length && diff <= A.length * 0.0005, out.numbers.crowd.picture);
});
await safe('hidden', async () => {
  // (Hidden and Shadows are hidden now, from the crowd's picture)
  await sbx('window.__labDraw.reset(); return 1');
  const a = await sbx(`return { f: ${R('ld-1')}.info.render.frame, runs: window.__hidRuns }`); await wait(1500);
  const b = await sbx(`return { f: ${R('ld-1')}.info.render.frame, runs: window.__hidRuns }`);
  out.numbers.hidden = { renders: b.f - a.f, frames: b.runs - a.runs };
  step('a hidden layer costs nothing (no frame run, nothing drawn)', b.f - a.f === 0 && b.runs - a.runs === 0, out.numbers.hidden);
  await D.updateLayer('Hidden', { visible: true }, 0.2);
  const c0 = await sbx(`return ${R('ld-1')}.info.render.frame`); await wait(600);
  const c1 = await sbx(`return ${R('ld-1')}.info.render.frame`);
  step('… shown again: it draws at once', c1 > c0, { renders: c1 - c0 });
});
await safe('shadows', async () => {
  await D.updateLayer('Shadows', { visible: true }, 0.2); await D.updateLayer('Crowd', { visible: false }, 0.2); await wait(1500); // (the crowd's casters move every frame: its maps are drawn each time, as they should)
  const run = async (casters) => { await sbx(`window.__labDraw.set({ casters: ${casters} }); window.__labDraw.reset(); return 1`); await wait(3000); return (await info()).shadows; };
  const on = await run(true); const off = await run(false); await sbx('window.__labDraw.set({ casters: true }); return 1');
  out.numbers.shadows = { castersOnly: on, before: off };
  step('an orbiting camera and moving non-casting particles: the shadow maps are kept (casters and lights still)', on.skipped > on.drawn * 2, out.numbers.shadows);
  step('… (before, the whole scene\'s signature: the maps were drawn every frame)', off.drawn > off.skipped, out.numbers.shadows);
});

out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = out.ok;
return JSON.stringify(out, null, 1);
