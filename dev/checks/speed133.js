// (round 133, speed133) ⚡ "Why is this slow?" (tools/three-speed*.js, the page's "speed check" in tools/three-sandbox.html,
// docs/upgrades/speed133.md), ONE check on a deliberately heavy fixture scene (the check's own temp data, smoke.js; never
// an owner's scene):
//   Backdrop   a full-frame shader at 2× pixels (pixel-bound)
//   Particles  the planted heavy layer: 400k triangles (an InstancedMesh of 20-triangle shapes, a Count slider), 2× pixels,
//              antialias, and 3 spot lights casting shadows (of a few small cubes)
//   Edge       a white wedge on a black square in the top-left corner, antialiased (the still's AA probe)
// Steps:
//   chip     the preview slow for 5 s while it plays → "Slow: N fps · Why?" near the stats line
//   rank     Why? → the card measures (3 s) and ranks Particles first (its GPU time, left out for a moment), with
//            "'Particles' draws 400k triangles: cut to 100k", the pixel ratio and antialias among the causes
//   px       "Preview at 1× pixels": fps after / before (the card's own re-measure) up, judged relatively and load-aware
//            (dev/loadwait.js through smoke: a miss while the box waited for a CPU is "can't tell", not a failure)
//   still    + "Turn off antialias for the preview only": the preview's renderers draw without antialias, and a
//            rendered still is full size (480×270) with smooth (antialiased) edges in the probe corner
//   undo     each fix is ONE undo: ↶ Undo once per fix puts back exactly that one (antialias, pixels, the Count slider
//            400k → 100k → 400k, shadows 3 → 1 → 3)
//   ai       ✦ Ask the AI to optimise 'Particles': the cost line first, nothing sent without the click
//   safe     a simulated context loss (glrecover's __glRecover.lose) → "Reopen in safe mode" → 1× pixels, no antialias, no
//            shadows on the page; one undo puts the scene's settings back
//   node dev/smoke.js --fake-engines --check-timeout 1500000 --script dev/checks/speed133.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { steps: [], measure: {}, cantTell: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn, ms = 300000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 1000)} s`)), ms))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 600) }); } };

const BACKDROP = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const mat = new THREE.ShaderMaterial({ uniforms: { t: { value: 0 } }, vertexShader: 'varying vec2 v; void main() { v = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform float t; varying vec2 v; void main() { vec3 c = vec3(0.0); vec2 p = v * 6.0; for (int i = 0; i < 4; i++) { p = vec2(sin(p.y + t), cos(p.x - t)) * 1.3 + p * 0.2; c += 0.03 * vec3(0.4 + 0.4 * sin(p.x), 0.3, 0.6 + 0.3 * cos(p.y)); } gl_FragColor = vec4(c * 0.6, 1.0); }' });
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
renderer.setAnimationLoop((now) => { mat.uniforms.t.value = now / 1000; renderer.render(scene, camera); });`;
const PARTICLES = `import * as THREE from 'three';
const P = tweak({ count: { value: 400000, min: 1000, max: 600000, step: 1000, label: 'Count' } });
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 7;
scene.add(new THREE.HemisphereLight('#ffffff', '#223344', 2.2));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.8), new THREE.MeshLambertMaterial({ color: '#333' })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.2; floor.receiveShadow = true; scene.add(floor);
const cubes = []; for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: '#f6a' })); c.position.set(i * 0.8 - 0.8, -1.9, 0); c.castShadow = true; scene.add(c); cubes.push(c); }
for (let i = 0; i < 3; i++) { const l = new THREE.SpotLight('#ffffff', 30, 20, 0.6); l.position.set(i * 2 - 2, 3, 2); l.target.position.set(0, -2, 0); l.castShadow = true; l.shadow.mapSize.set(256, 256); scene.add(l, l.target); }
const geo = new THREE.IcosahedronGeometry(0.035, 0); const mat = new THREE.MeshStandardMaterial({ color: '#7ab8ff', roughness: 0.4, name: 'spark' });
let mesh = null; let made = -1;
function build(n) {
  if (mesh) { scene.remove(mesh); mesh.dispose(); }
  const copies = Math.max(1, Math.round(n / 20)); mesh = new THREE.InstancedMesh(geo, mat, copies);
  const m = new THREE.Matrix4(); let s = 7;
  for (let i = 0; i < copies; i++) { s = (s * 16807) % 2147483647; const a = s / 2147483647; s = (s * 16807) % 2147483647; const b = s / 2147483647; s = (s * 16807) % 2147483647; const c = s / 2147483647; m.setPosition((a - 0.5) * 9, (b - 0.5) * 5, (c - 0.5) * 3); mesh.setMatrixAt(i, m); }
  scene.add(mesh); made = n;
}
renderer.setAnimationLoop((now) => { if (made !== P.count) build(P.count); for (const c of cubes) c.rotation.y = now / 900; mesh.rotation.y = Math.sin(now / 2000) * 0.2; renderer.render(scene, camera); });`;
const EDGE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x000000, 0); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2); camera.position.z = 1;
const sq = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ color: '#000000' })); sq.position.set(-0.7, 0.7, 0); scene.add(sq);
const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.95, 0.45, 0.1, -0.45, 0.62, 0.1, -0.9, 0.95, 0.1], 3));
scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffffff' })));
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;

const TMP = window.SMOKE_TMP || '/tmp';
let c = null; let D = null; let sp = null;
const page = async () => { for (let i = 0; i < 6; i++) { const r = await D.evalInSketch('return JSON.stringify(window.__labSpeed ? window.__labSpeed.state() : null)'); if (r?.ok) { try { return JSON.parse(r.value); } catch { return null; } } await wait(500); } return null; };
const S = () => LabSpeed.state();
const row = (id) => LabSpeed.card?.querySelector(`.spd-row[data-id="${CSS.escape(id)}"]`);
const idle = () => until(() => (typeof LabSpeed !== 'undefined' && !S().busy ? true : null), 240000, 300);
async function clickFix(id) {
  const b = await until(() => row(id)?.querySelector('.spd-fix'), 8000);
  if (b) b.click(); else if ((S().analysis?.all || []).some((x) => x.id === id)) LabSpeed.fix(id).catch(() => {}); else return null; // (a cause past the top 3: the same fix)
  await until(() => S().done.find((d) => d.id === id && d.now != null), 240000, 300);
  await idle();
  return S().done.find((d) => d.id === id) || null;
}
async function undoOnce() {
  const n = S().undos.length;
  const b = LabSpeed.card?.querySelector('.spd-undo');
  if (b) b.click(); else LabSpeed.undo().catch(() => {});
  await until(() => S().undos.length === n - 1, 20000);
  await idle();
  return true;
}

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director && ThreeLab.speed, 60000);
  c = await ThreeLab.cmd(); D = ThreeLab.director; sp = ThreeLab.speed;
  await wait(600);
  await D.newSketch('Speed fixture (speed133)', BACKDROP, 2);
  const fixId = ThreeLab.scenes.currentId();
  try { c.customSize(480, 270); c.size('custom'); } catch { /* fit */ }
  try { await D.updateLayer(D.layers().layers[0].name, { name: 'Backdrop', code: BACKDROP }, 0.3); } catch (err) { step('fixture: backdrop', false, err.message); }
  for (const [name, code] of [['Particles', PARTICLES], ['Edge', EDGE]]) { try { await D.addLayer({ name, code }, 1); } catch (err) { step(`fixture: ${name}`, false, err.message); } }
  c.code?.(false);
  const adaptWas = c.adapt(); c.adapt(false); // Quality: full, so the measure sees the scene's own pixels
  await wait(3000);
  if (ThreeLab.scenes.currentId() !== fixId) { ThreeLab.scenes.open(fixId); await wait(2500); }
  try { c.customSize(480, 270); c.size('custom'); } catch { /* fit */ }
  await wait(2500);
  out.measure.layers = D.layers().layers.map((x) => x.name);
  const pid = D.layers().layers.find((x) => x.name === 'Particles')?.id;
  LabSpeedHook.hideChip(); LabSpeedHook.forget();

  // ---------- chip ----------
  await safe('chip', async () => {
    const t0 = Date.now();
    const chip = await until(() => { const x = sp.host.querySelector('.lab-speedchip.slow'); return x?.checkVisibility() ? x : null; }, 60000, 200);
    const h = LabSpeedHook.state();
    out.measure.chip = { text: chip?.textContent, after: Date.now() - t0, fps: h.fps };
    const near = chip && sp.stats && chip.parentElement === sp.stats.parentElement;
    step('chip: slow for 5 s while playing → "Slow: N fps · Why?" beside the stats line, dismissable', chip && /^Slow: \d+ fps ·Why\?✕$/.test(chip.textContent.replace(/\s+(?=Why|✕)/g, '')) && near && chip.querySelector('.lab-speedchip-x') && Date.now() - t0 >= 4000, out.measure.chip);
    chip?.querySelector('.lab-speedchip-go')?.click();
  });

  // ---------- rank ----------
  let A = null;
  await safe('rank', async () => {
    await until(() => typeof LabSpeed !== 'undefined' && LabSpeed.isOpen(), 30000);
    await until(() => S().analysis && !S().busy, 240000, 300);
    A = S().analysis;
    out.measure.first = { fps: A?.fps, layers: A?.layers?.map((L) => [L.name, L.gpuMs, L.drawMs, L.tris, L.pr, L.aa, `${L.size?.w}x${L.size?.h}`]), causes: A?.all?.map((x) => [x.id, x.title, x.gain]) };
    step('rank: the card measures and ranks the planted heavy layer (Particles) first', A?.ok && A.layers[0]?.name === 'Particles' && A.layers[0].gpuMs != null, out.measure.first);
    const lc = A?.causes?.find((x) => x.kind === 'layer');
    step('rank: its top 3 causes in plain words: "\'Particles\' draws 400k triangles: cut to 100k", each with a fix and a gain', A?.causes?.length === 3 && lc?.layer === pid && /'Particles' draws 400k triangles: cut to 100k/.test(lc.title) && A.causes.every((x) => x.fix?.label && /fps|little/.test(x.gainLine)), A?.causes);
    step('rank: the preview\'s pixel ratio (2×) and antialias are causes, preview only', A?.all?.some((x) => x.id === 'px' && /2× pixels/.test(x.title) && x.preview) && A.all.some((x) => x.id === 'aa' && x.preview), A?.all?.map((x) => x.title));
  });

  // ---------- px ----------
  await safe('px', async () => {
    const before = await smoke({ loadwait: 'snap' });
    const e = await clickFix('px');
    const pg = await page();
    out.measure.px = { was: e?.was, now: e?.now, page: pg && { px1: pg.px1 } };
    step('px: "Preview at 1× pixels" sets the scene\'s preview setting on the page', sp.get().px1 === true && pg?.px1 === true, out.measure.px);
    const ratio = e?.now && e?.was ? e.now / e.was : 0;
    const w = await smoke({ loadwait: 1, since: before.snap, ms: e?.now ? 1000 / e.now : 99999, budget: e?.was ? 1000 / (e.was * 1.15) : 0 });
    out.measure.px.ratio = Math.round(ratio * 100) / 100; out.measure.px.load = w;
    // load-aware: the smoke process's own wait for a CPU (dev/loadwait.js) or a box already loaded by other work (the
    // software GPU runs on the same 4 CPUs): a miss then is "can't tell", not the app's
    const busy = w?.judge === 'load' || (w?.loadavg?.[0] / Math.max(1, w?.cpus || 1)) >= 0.75;
    if (ratio >= 1.1) step('px: the card measures again and the fps went up (relative)', true, out.measure.px);
    else if (busy) { out.cantTell.push({ px: out.measure.px }); step('px: the card measures again (fps up, or can\'t tell on a busy box)', e?.now != null, out.measure.px); } else step('px: the card measures again and the fps went up (relative)', false, out.measure.px);
  });

  // ---------- still ----------
  await safe('still', async () => {
    const e = await clickFix('aa');
    const raw = S().raw;
    const edge = raw?.layers?.find((L) => sp.name(L.id) === 'Edge');
    const pg = await page();
    out.measure.aa = { now: e?.now, edgeAA: edge?.gl?.renderers?.map((r) => r.aa), page: pg && { noAA: pg.noAA, px1: pg.px1 } };
    step('still: "Turn off antialias for the preview only": the preview\'s renderers draw without antialias (a fresh page), the 1× pixels kept', sp.get().noAA && sp.get().px1 && pg?.noAA && pg?.px1 && edge && edge.gl.renderers.length && edge.gl.renderers.every((r) => r.aa === false), out.measure.aa);
    const r = await LabExport.render({ format: 'still', size: '480x270', at: 0.5, quiet: true });
    const u8 = await window.hub.fs.read(r.path, { encoding: 'buffer' });
    const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
    const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
    // the probe corner (the Edge layer's black square, x 0.05–0.25 / y 0.05–0.25 of the frame): grey steps along the wedge's edges
    const x0 = Math.round(bmp.width * 0.06); const y0 = Math.round(bmp.height * 0.06); const w = Math.round(bmp.width * 0.18); const h = Math.round(bmp.height * 0.18);
    const d = g.getImageData(x0, y0, w, h).data;
    let mid = 0; let white = 0; const levels = new Set();
    for (let i = 0; i < d.length; i += 4) { const l = Math.round((d[i] + d[i + 1] + d[i + 2]) / 3); levels.add(l >> 3); if (l > 235) white += 1; else if (l > 25) mid += 1; }
    out.measure.still = { w: bmp.width, h: bmp.height, mid, white, levels: levels.size };
    step('still: a render is full quality: the still\'s size (480×270) and smooth (antialiased) edges, whatever the preview draws', bmp.width === 480 && bmp.height === 270 && white > 30 && mid >= 8 && levels.size >= 4, out.measure.still);
  });

  // ---------- undo ----------
  await safe('undo', async () => {
    const u1 = await undoOnce();
    const p1 = await until(async () => { const p = await page(); return p && !p.noAA ? p : null; }, 30000);
    step('undo: one Undo puts back the antialias only (the 1× pixels stay)', u1 && !sp.get().noAA && sp.get().px1 && p1 && p1.px1, { set: sp.get(), page: p1 });
    const u2 = await undoOnce();
    const p2 = await page();
    step('undo: the next Undo puts back the pixels: the scene\'s preview settings are as they were', u2 && JSON.stringify(sp.get()) === JSON.stringify({ px1: false, noAA: false, sh: null, fxHalf: false }) && !ThreeLab.scenes.get(ThreeLab.scenes.currentId())?.speed && p2 && !p2.px1, { set: sp.get(), page: p2 });
    // the Count slider: 400k → 100k → 400k
    const lc = (S().analysis?.all || []).find((x) => x.kind === 'layer'); const lid = lc?.layer === pid ? lc.id : null;
    out.measure.layerCause = lc && { title: lc.title, fix: lc.fix };
    const cnt = () => D.sliders(pid).sliders.find((s) => s.key === 'count')?.value;
    const e = lid ? await clickFix(lid) : null;
    const cut = cnt();
    const u3 = await undoOnce();
    step('undo: "Cut to 100k" sets Count 400000 → 100000, one Undo → 400000', e && cut === 100000 && u3 && cnt() === 400000, { cut, back: cnt(), fps: e && [e.was, e.now] });
    // shadows: keep 1 of 3 (the preview), one Undo
    await until(() => S().analysis?.all?.some((x) => x.id === 'shadows'), 5000);
    const es = await clickFix('shadows');
    const ps = await page();
    const u4 = await undoOnce();
    const ps2 = await page();
    step('undo: "Keep 1" shadow light in the preview, one Undo → all 3 again', es && ps?.sh === 1 && u4 && ps2?.sh === null && sp.get().sh === null, { on: ps?.sh, off: ps2?.sh });
  }, 900000);

  // ---------- ai ----------
  await safe('ai', async () => {
    const b = LabSpeed.card?.querySelector('.spd-ask');
    b?.click();
    const ai = await until(() => (S().ai?.est ? S().ai : null), 20000);
    step('ai: "✦ Ask the AI to optimise \'Particles\'" shows the measured numbers and the cost first; nothing sent without Send', b && /optimise 'Particles'/.test(b.textContent) && /tokens in/.test(ai?.line || '') && /Particles/.test(ai?.text || '') && /400k triangles/.test(ai?.text || '') && S().sent.length === 0 && LabSpeed.card.querySelector('.spd-send'), ai);
    LabSpeed.card.querySelector('.spd-cancel')?.click();
  });

  // ---------- safe ----------
  await safe('safe', async () => {
    await D.evalInSketch('return __glRecover.lose({ restore: null })');
    const chip = await until(() => { const x = sp.host.querySelector('.lab-speedchip.gl'); return x?.checkVisibility() ? x : null; }, 20000);
    const cardRow = await until(() => LabSpeed.card?.querySelector('.spd-gl .spd-safe'), 5000);
    step('safe: the graphics card dropping the preview → "Reopen in safe mode" (the chip and the card)', chip && /Reopen in safe mode/.test(chip.textContent) && cardRow, chip?.textContent);
    chip?.querySelector('.lab-speedchip-go')?.click();
    await until(() => sp.get().noAA && sp.get().px1 && sp.get().sh === 0, 10000);
    const pg = await until(async () => { const p = await page(); return p && p.px1 && p.noAA && p.sh === 0 ? p : null; }, 60000, 600);
    const drawing = await until(async () => { try { return c.perf().fps > 0 ? c.perf().fps : null; } catch { return null; } }, 60000, 500);
    step('safe: reopened at 1× pixels, no antialias, no shadows (the page draws again)', pg && drawing, { set: sp.get(), page: pg, fps: drawing });
    await until(() => LabSpeed.card?.querySelector('.spd-undo'), 5000);
    const u = await undoOnce();
    step('safe: one Undo puts the scene\'s settings back', u && JSON.stringify(sp.get()) === JSON.stringify({ px1: false, noAA: false, sh: null, fxHalf: false }), sp.get());
  });
  LabSpeed.close();
  c.adapt(adaptWas !== false);
} catch (err) { step('ran', false, { error: String(err?.stack || err).slice(0, 800) }); }
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.ok = out.failed.length === 0;
return JSON.stringify(out, null, 1);
