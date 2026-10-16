// ▶ Game performance (round 52, gameperf): a game-like Lab scene with deliberate problems, measured for real in the Lab
// preview (Clink, the owner's game, is a Lab scene; an html build goes through the same probe):
//   · per-frame allocation: update() makes new Vector3s for every crate each frame (≈ MB/s of garbage, GC pauses)
//   · 400 un-instanced meshes sharing one geometry and material (≈ 400 draw calls)
//   · a late shader compile: a new ShaderMaterial appears mid-play (window.__fx.shader)
//   · a big texture upload mid-play: a 4096×4096 DataTexture shown mid-play (window.__fx.texture)
// Checks: the attribution names the shader compile and the texture upload as the cause of their stutters and sees the
// garbage (GCs + MB/s); the doctor lists draw calls (instancing), garbage in update() with its line, the late shader and
// the late texture, each with a fix; the Lab's one-click fix changes only that code and Undo puts it back; the
// director's few lines; the chip costs ~0 hidden (no DOM, a few µs a frame) and draws when shown (F in ▶ Play).
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/gameperf.js --shot /tmp/gameperf.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
activate('tool:three'); await wait(400);
const lc = await ThreeLab.cmd();
const d = ThreeLab.director;
const sbx = (code) => d.evalInSketch(code).then((r) => (r?.ok ? r.value : { error: r?.error }));

const GAME = `import * as THREE from 'three';
// a game-like fixture: a field of crates drifting toward the player, with deliberate performance problems
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 6, 22);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 2));
const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
const mat = new THREE.MeshLambertMaterial({ color: 0xc08040 });
const crates = [];
for (let i = 0; i < 400; i++) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set((i % 35) - 17, 0, Math.floor(i / 35) - 10);
  m.userData.v = (i % 7) * 0.1 + 0.2;
  scene.add(m); crates.push(m);
}
const window2 = window;
function update(dt, t) {
  for (const c of crates) {
    const target = new THREE.Vector3(Math.sin(t + c.userData.v) * 0.5, Math.sin(t * 2 + c.position.x) * 0.3, 0);
    const step = new THREE.Vector3();
    step.subVectors(target, c.position).multiplyScalar(0.5);
    c.position.y += step.y;
    c.rotation.y += dt * c.userData.v;
  }
}
let lateShader = null; let bigTex = null;
const poster = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: new THREE.DataTexture(new Uint8Array(64).fill(200), 4, 4) }));
poster.material.map.needsUpdate = true; poster.position.set(-8, 4, -2); scene.add(poster);
function surprises() {
  const fx = window2.__fx || {};
  if (fx.shader && !lateShader) {
    lateShader = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 16), new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec3 vp; void main() { vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float t; varying vec3 vp; float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); } void main() { vec3 c = vec3(0.0); for (int i = 0; i < 24; i++) { float k = float(i); c += vec3(h(vp + k), h(vp * 1.3 + k), h(vp * 1.7 - k)) * 0.04 * sin(t + k); } gl_FragColor = vec4(c + 0.2, 1.0); }',
    }));
    lateShader.position.set(0, 4, 0); scene.add(lateShader);
  }
  if (fx.texture && !bigTex) {
    const n = 4096; const data = new Uint8Array(n * n * 4);
    for (let i = 0; i < data.length; i += 4096) data[i] = 255;
    bigTex = new THREE.DataTexture(data, n, n); bigTex.needsUpdate = true;
    poster.material.map = bigTex; // (the same program: only the upload)
  }
}
let last = 0;
renderer.setAnimationLoop(function gameLoop(now) {
  const t = now / 1000; const dt = Math.min(0.1, t - last); last = t;
  update(dt, t);
  surprises();
  if (lateShader) lateShader.material.uniforms.t.value = t;
  renderer.render(scene, camera);
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
`;

await d.newSketch('Clink fixture (gameperf)', GAME, 3);
lc.customSize(640, 360); await wait(1500); // (a small frame: the software GPU here draws 400 crates fast enough to see the spikes)
await sbx('window.__labAdapt?.set({ level: 0, hold: true }); window.__fx = {}; return 1');
await until(async () => (await sbx('return Object.keys(__scenes).length')) >= 1, 15000);
await wait(1500);
if (typeof GamePerf === 'undefined') await Lazy.load('gameperf');
step('the gameperf group loads on first use (lazy)', typeof GamePerf !== 'undefined' && Lazy.loaded('gameperf'));
const t0 = await GamePerf.attachLab({ hz: 60 });
step('attached to the Lab scene', t0?.label === 'Clink fixture (gameperf)', t0);

// ---------- the chip: ~0 while hidden ----------
await sbx('__gamePerf.start(); return 1'); await wait(2500);
const hidden = await sbx('return __gamePerf.cost()');
const bench = await sbx('return __gamePerf.bench(2000)');
out.hidden = { ...hidden, benchUs: bench };
step(`hidden chip: not in the page, ${bench} µs a frame of measuring (budget 20 µs; 240 Hz = 4,167 µs)`, hidden && !hidden.inDom && hidden.frames > 3 && bench < 20, out.hidden);
await GamePerf.chip(true); await wait(1500);
const shown = await sbx('return __gamePerf.cost()');
await smoke({ shot: '/tmp/gameperf-chip.png' });
step(`chip shown: drawn in the game (${Math.round(shown?.chipUs || 0)} µs a frame)`, shown?.inDom && shown.chipUs > 0, shown);
await GamePerf.chip(false); await wait(300);
step('chip off: gone from the page', !(await sbx('return __gamePerf.cost()'))?.inDom);

// ---------- a play session with the surprises ----------
await sbx('__gamePerf.start(); return 1');
await wait(2500);
await sbx('window.__fx.shader = true; return 1');
await wait(2500);
await sbx('window.__fx.texture = true; return 1');
await wait(3000);
const st0 = await GamePerf.doctor({ secs: 0 });
const st = { ...st0, findings: GamePerf.findings };
const R = GamePerf.report;
out.report = { fps: R.fps, hz: R.hz, dtMed: R.dtMed, workMed: R.workMed, stutters: R.stutters, alloc: R.alloc, shaders: { n: R.shaders.n, late: R.shaders.late }, textures: { n: R.textures.n, late: R.textures.late }, calls: R.scene?.calls, instancing: R.scene?.instancing, self: R.self };
out.findings = st.findings.map((f) => ({ id: f.id, title: f.title, impact: f.impact, fix: Boolean(f.lab?.layers?.length) }));
const raw = GamePerf.raw;
const B = Math.max(R.budget, Math.min(R.dtMed, R.budget * 4)); // (the budget summarize judges a stutter by)
const causeOf = (f) => (f ? GamePerfCore.attribute(f, B).cause : null);
// the frame that linked the new shader / sent the 4096×4096 texture (a busy test computer makes every frame slow: the
// frame itself is named, and when it stands out as a stutter, the report says so too)
const shF = raw.slow.find((f) => f.links); const txF = raw.slow.find((f) => f.texMB >= 32);
const inList = (cause, f) => R.stutters.list.some((x) => x.cause === cause) || (f && f.dt < Math.max(R.budget * 1.5, R.dtMed * 1.6));
step(`attribution: the late shader compile's frame is put down to it (${shF?.dt} ms frame)`, causeOf(shF) === 'shader' && R.shaders.late.length >= 1 && inList('shader', shF), { frame: shF, late: R.shaders.late, list: R.stutters.list });
step(`attribution: the big texture upload's frame is put down to it (${txF?.dt} ms frame)`, causeOf(txF) === 'texture' && R.textures.late.some((x) => x.w === 4096) && inList('texture', txF), { frame: txF, late: R.textures.late });
step(`attribution: the garbage is seen (${R.alloc.mbps} MB/s, ${R.alloc.gcs} GCs)`, R.alloc.mbps >= 0.5 && R.alloc.gcs >= 1, R.alloc);
const F = (id) => st.findings.find((f) => f.id === id);
step('doctor: draw calls → instance the crates', F('drawcalls') && /400 meshes share one geometry and material \(BoxGeometry\) — instance them/.test(F('drawcalls').title), F('drawcalls')?.title);
const gLine = GAME.split('\n').findIndex((l) => l.includes('const target = new THREE.Vector3')) + 1;
step(`doctor: garbage made in update() (line ${gLine})`, F('garbage') && new RegExp(`in update\\(\\) \\(line ${gLine}\\)`).test(F('garbage').title) && F('garbage').fix, F('garbage')?.title);
step('doctor: the late shader compile, with its fix', Boolean(F('shader-late') && /compileAsync/.test(F('shader-late').fix)), F('shader-late')?.title);
step('doctor: the late texture upload, with its fix', F('texture-late') && /4096×4096/.test(F('texture-late').title), F('texture-late')?.title);
step('doctor: sorted by impact', st.findings.every((f, i) => i === 0 || st.findings[i - 1].impact >= f.impact));
await smoke({ shot: '/tmp/gameperf-card.png' });
step('the card is on the preview', GamePerf.card?.isConnected && GamePerf.card.querySelectorAll('.gp-row').length >= 4);

// ---------- the director's few lines ----------
const dt = await GamePerf.directorTool('three_perf', {});
out.director = dt.value;
step(`director: three_do perf in ${dt.value?.length} chars (≈ ${Math.round((dt.value?.length || 0) / 4)} tokens)`, dt.ok && dt.value.length < 1600 && /draw calls/.test(dt.value) && /\[garbage, fix\]/.test(dt.value), dt.value);

// ---------- a Lab one-click fix, then Undo ----------
const before = d.codeOf(d.capture().layers[0].id).code;
const fx = st.findings.find((f) => f.id === 'garbage' && f.fix);
let after = null;
if (fx) { await GamePerf.fix('garbage'); await wait(1500); after = d.codeOf(d.capture().layers[0].id).code; }
step('Lab fix "Reuse them": update() reuses one Vector3 (made once above it)', after && after !== before && /const _gpStep\d+ = new THREE\.Vector3\(\);/.test(after) && /const step = _gpStep\d+\.set\(0, 0, 0\);/.test(after), after && after.split('\n').filter((l) => l.includes('_gp')));
step('the target Vector3 (passed to subVectors as an argument) is reused too, the rest is unchanged', after && /const target = _gpTarget\d+\.set\(/.test(after) && after.split('\n').length === before.split('\n').length + 2);
await sbx('return 1'); await wait(500);
const errs = await sbx('return (window.__labErrors || []).length');
await GamePerf.undo(); await wait(1500);
step('Undo puts the code back exactly', d.codeOf(d.capture().layers[0].id).code === before);
out.labErrors = errs;

// ---------- the same game as an html build: patches are suggestions, never applied ----------
const codeNow = d.codeOf(d.capture().layers[0].id).code;
await GamePerf.attach({ exec: async (e) => { const r = await d.evalInSketch(`return (${e})`); if (!r?.ok) throw new Error(r?.error); return r.value; } }, { kind: 'html', label: 'Clink (html build)', hz: 60, source: async () => GAME });
await GamePerf.doctor({ secs: 2, show: false });
const hg = GamePerf.findings.find((f) => f.id === 'garbage');
const refused = await GamePerf.fix('garbage').then(() => false, (e) => /html build/.test(e.message));
step('html build: the garbage fix is a suggested patch (a diff to copy or send to a director chat), never applied', hg?.patch && /^\+ .*_gpStep\d+\.set\(0, 0, 0\)/m.test(hg.patch) && refused && d.codeOf(d.capture().layers[0].id).code === codeNow, hg?.patch);
GamePerf.close();

out.ok = out.steps.every((s) => s.ok);
out.pass = out.ok;
return JSON.stringify(out, null, 1);
