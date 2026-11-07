// (round 147, safeopen147) 🛟 A heavy scene that crashes the preview never locks you out (tools/three-safeopen.js,
// docs/upgrades/safeopen147.md). ONE check, in the check's own temp data (smoke.js; never an owner's scene), on a fixture
// named like the owner's ("vizualizer2"): Sky (flat colour), Spinner (one cube) and Heavy, whose first run on a page loses
// every WebGL context of the page the way a GPU reset does (WEBGL_lose_context, through the page's __glRecover.lose).
// Steps:
//   recover   the first crash recovers by itself (contexts back, layers rebuilt in place), no Safe open; the scene's crash
//             marker is in the app's state (localStorage hub.three.safeopen), not in the scene
//   edit      an edit to Spinner made just before a second crash survives it (in the Lab and on disk)
//   safe      the second crash → Safe open: a fresh page with every layer held back, lowest quality step, 1× pixels, no
//             antialias / shadows, the banner "vizualizer2 crashed again · opened safely", one "health:" note for the AIs
//   back      "Bring layers back one by one": Sky, then Spinner come back (1, then 2 layers on the page), the cost view on;
//             Heavy last: its return crashes the preview again → it is kept off and named on the banner
//   normal    "Open normally": every layer back, full quality steps, no banner (Heavy's one crash recovers by itself)
//   source    the scene's saved source is byte-identical from just after the edit to the end (nothing of Safe open in it)
//   hang      a layer that hangs its page: the page's process is ended and made again; hanging again → Safe open
//   reopen    vizualizer2 opened again: it crashed on its last open → Safe open, "crashed last time" (the end picture)
//   node dev/smoke.js --fake-engines --check-timeout 1500000 --script dev/checks/safeopen147.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { steps: [], info: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn, ms = 400000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 1000)} s`)), ms))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 600) }); } };

const SKY = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#141a2b'); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
const SPINNER = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x000000, 0); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); camera.position.z = 5;
const cube = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshNormalMaterial()); cube.position.set(-1.6, 0.6, 0); scene.add(cube);
renderer.setAnimationLoop((now) => { cube.rotation.set(now / 1300, now / 900, 0); renderer.render(scene, camera); });`;
// the planted culprit: on the first run in a page, every context of the page goes, as in a GPU reset (in-place rebuilds
// run it again in the same page: then it draws)
const HEAVY = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x000000, 0); document.body.append(renderer.domElement);
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); camera.position.z = 5;
scene.add(new THREE.HemisphereLight('#fff', '#334', 2));
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.7, 0.22, 200, 24), new THREE.MeshStandardMaterial({ color: '#ff8a3a', roughness: 0.35 })); knot.position.set(1.3, -0.2, 0); scene.add(knot);
if (!globalThis.__boom147) { globalThis.__boom147 = 1; window.__glRecover.lose({ restore: 400 }); }
renderer.setAnimationLoop((now) => { knot.rotation.set(now / 1700, now / 1100, 0); renderer.render(scene, camera); });`;
// a layer that hangs its page (the first run in each page: a fresh page made after its process was ended hangs again)
const HANGER = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2b1414'); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
if (!globalThis.__hang147) { globalThis.__hang147 = 1; const t = performance.now(); while (performance.now() - t < 180000) { /* hung */ } }
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;

let c = null; let D = null;
const LS = () => LabSafe.state();
const pageState = async () => { for (let i = 0; i < 8; i++) { const r = await D.evalInSketch('return JSON.stringify({ gl: window.__glRecover.state(), ad: window.__labAdapt.state(), spd: window.__labSpeed.state() })').catch(() => null); if (r?.ok) { try { return JSON.parse(r.value); } catch { return null; } } await wait(500); } return null; };
const banner = () => { const b = document.querySelector('.lab-safe'); return b?.checkVisibility() ? b : null; };
const diskScene = async (id) => { const r = await window.hub.kvGet('three-sketches', null, { status: true }); const list = r && r.state ? r.value : r; const sk = (list || []).find((x) => x.id === id); return sk ? JSON.stringify(sk) : null; };
const layerCode = (name) => D.layers().layers.find((x) => x.name === name);

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  localStorage.setItem('hub.safeopen.hangMs', '6000'); // (a hang is noticed after 6 s of silence here; 15 s in use)
  localStorage.removeItem('hub.three.safeopen');
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director && ThreeLab.safe && typeof LabSafe !== 'undefined', 60000);
  c = await ThreeLab.cmd(); D = ThreeLab.director;
  await wait(600);
  await D.newSketch('vizualizer2', SKY, 2);
  const vizId = ThreeLab.scenes.currentId();
  try { c.customSize(480, 270); c.size('custom'); } catch { /* fit */ }
  try { await D.updateLayer(D.layers().layers[0].name, { name: 'Sky', code: SKY }, 0.3); } catch (err) { step('fixture: sky', false, err.message); }
  try { await D.addLayer({ name: 'Spinner', code: SPINNER }, 1); } catch (err) { step('fixture: spinner', false, err.message); }
  c.code?.(false);
  await wait(1500);
  const heavyId = () => D.layers().layers.find((x) => x.name === 'Heavy')?.id;

  // ---------- recover: the first crash ----------
  await safe('recover', async () => {
    const g0 = (await pageState())?.gl;
    try { await D.addLayer({ name: 'Heavy', code: HEAVY }, 1); } catch (err) { out.info.addHeavy = err.message; }
    const back = await until(async () => { const p = await pageState(); return p && p.gl.losses > (g0?.losses || 0) && p.gl.rebuilds > (g0?.rebuilds || 0) && !p.gl.lost && p.gl.layers === 3 ? p : null; }, 60000, 400);
    await until(() => LS().recovered, 20000);
    const mk = LabSafe.marker(vizId);
    out.info.recover = { gl: back?.gl && { losses: back.gl.losses, restores: back.gl.restores, rebuilds: back.gl.rebuilds, layers: back.gl.layers }, safe: LS().safe, crashed: LS().crashed, marker: mk };
    step('recover: the first crash (every context lost) recovers by itself in place: 3 layers drawing again, no Safe open', back && LS().crashed === 1 && !LS().safe && !banner(), out.info.recover);
    const sk = await diskScene(vizId);
    step('recover: the crash is marked in the app\'s own state for this scene ("crashed at step … layer …"), nothing in the scene', mk?.n === 1 && mk.kind === 'gpu' && mk.step && Array.isArray(mk.layers) && sk && !/safeopen|"held"|"crashed"/.test(sk), { marker: mk });
  });

  // ---------- edit + second crash → Safe open ----------
  let srcA = null;
  await safe('safe', async () => {
    await wait(1500);
    const sp = layerCode('Spinner');
    const edited = sp.code.replace('0.6, 0.6, 0.6', '0.8, 0.8, 0.8') + '\n// edit-147: made just before the crash';
    await D.updateLayer('Spinner', { code: edited }, 0); // (no wait: the crash comes while the save is still pending)
    const r = await D.evalInSketch('return window.__glRecover.lose({ restore: null })');
    out.info.lose = r;
    srcA = await until(async () => { const s = await diskScene(vizId); return s && s.includes('edit-147') ? s : null; }, 15000, 100);
    const on = await until(() => (LS().safe && banner() ? LS().safe : null), 30000, 200);
    const page = await until(async () => { const p = await pageState(); return p && !p.gl.lost && p.gl.layers === 0 && p.ad.level >= 9 ? p : null; }, 60000, 500);
    out.info.safe = { safe: on, page: page && { layers: page.gl.layers, level: page.ad.level, scale: page.ad.scale, shadow: page.ad.shadow, px1: page.spd.px1, noAA: page.spd.noAA, sh: page.spd.sh, fxHalf: page.spd.fxHalf }, text: banner()?.textContent };
    step('edit: the edit made just before the crash is in the Lab and on disk after it', layerCode('Spinner')?.code.includes('edit-147') && Boolean(srcA), { lab: layerCode('Spinner')?.code.includes('edit-147'), disk: Boolean(srcA) });
    step('safe: the second crash opens the scene safely: every layer held back on a fresh page, lowest quality step, 1× pixels, no antialias, no shadows', on && on.why === 'again' && on.held.length === 3 && page && page.spd.px1 && page.spd.noAA && page.spd.sh === 0, out.info.safe);
    const b = banner(); const t = b?.textContent || '';
    step('safe: the banner says "vizualizer2 crashed again · opened safely" with Bring layers back one by one · Open normally', /vizualizer2/.test(t) && /opened safely/.test(t) && b.querySelector('.ls-go')?.textContent === 'Bring layers back one by one' && b.querySelector('.ls-norm'), { text: t });
    const recs = LabHealth.state(vizId).filter((x) => x.kind === 'safe');
    const line = recs[0] ? LabHealth.words(vizId, recs[0]) : '';
    out.info.note = line;
    step('safe: the AIs get one short "health:" note (Safe open on, don\'t re-run heavy code as is)', recs.length === 1 && /Safe open is on/.test(line) && line.length < 260, { line });
  });

  // ---------- back: one by one ----------
  await safe('back', async () => {
    const n = [];
    for (let i = 0; i < 2; i++) {
      banner()?.querySelector('.ls-go')?.click();
      const p = await until(async () => { const q = await pageState(); return q && q.gl.layers === i + 1 ? q : null; }, 40000, 400);
      n.push({ page: p?.gl.layers, back: LS().safe?.back.map((id) => D.layers().layers.find((x) => x.id === id)?.name) });
      await until(() => typeof LabSpeed !== 'undefined' && LabSpeed.isOpen() && !LabSpeed.state().busy, 240000, 400);
    }
    await wait(2000); await until(() => !LabSpeed.state().busy, 240000, 400);
    out.info.back = { n, costOn: typeof LabCost !== 'undefined' && LabCost.on, badges: document.querySelectorAll('.ly-row .lc-badge').length };
    step('back: layers come back one at a time (1, then 2 on the page; the lightest / unsuspected first)', n[0]?.page === 1 && n[1]?.page === 2 && !LS().safe.back.includes(heavyId()), out.info.back);
    step('back: the cost view is on while they come back', typeof LabCost !== 'undefined' && LabCost.on, out.info.back);
    try { await smoke({ shot: '/tmp/hearth-checks/safeopen147-back.png' }); } catch { /* optional */ }
    // Heavy last: its return crashes the preview again → kept off, named
    banner()?.querySelector('.ls-go')?.click();
    const hit = await until(() => (LS().safe?.hit ? LS().safe : null), 40000, 300);
    const p = await until(async () => { const q = await pageState(); return q && !q.gl.lost && q.gl.layers === 2 ? q : null; }, 60000, 500);
    const t = banner()?.textContent || '';
    out.info.hit = { safe: hit, page: p?.gl.layers, text: t };
    step('back: the culprit\'s return crashes it again: Heavy is kept off and named on the banner, the other two keep drawing', hit && hit.held.length === 1 && hit.held[0] === heavyId() && /Heavy/.test(t) && /kept off/.test(t) && p, out.info.hit);
  }, 700000);

  // ---------- normal ----------
  await safe('normal', async () => {
    try { if (typeof LabCost !== 'undefined' && LabCost.on) await LabCost.toggle(false); LabSpeed?.close?.(); } catch { /* fine */ }
    const g0 = (await pageState())?.gl;
    banner()?.querySelector('.ls-norm')?.click();
    const p = await until(async () => { const q = await pageState(); return q && q.gl.layers === 3 && !q.gl.lost && q.gl.rebuilds >= 1 && !q.spd.px1 && !q.spd.noAA ? q : null; }, 90000, 500);
    await until(() => LS().recovered, 20000);
    out.info.normal = { page: p && { layers: p.gl.layers, level: p.ad.level, px1: p.spd.px1, noAA: p.spd.noAA, sh: p.spd.sh, losses: p.gl.losses }, safe: LS().safe, banner: Boolean(banner()), g0: g0 && g0.losses };
    step('normal: "Open normally" brings every layer back at normal quality, no banner (Heavy\'s one crash recovered by itself)', p && !LS().safe && !banner() && !p.spd.px1 && p.spd.sh == null, out.info.normal);
    await wait(2500);
    const srcB = await diskScene(vizId);
    out.info.source = { same: srcA === srcB, a: srcA?.length, b: srcB?.length, speed: srcB ? JSON.parse(srcB).speed || null : 'missing' };
    step('source: the scene\'s saved source is byte-identical from just after the edit to now (no Safe open setting written)', srcA && srcA === srcB && !JSON.parse(srcB).speed, out.info.source);
  });

  // ---------- hang ----------
  await safe('hang', async () => {
    await D.newSketch('hang fixture (safeopen147)', SKY, 2);
    const hid = ThreeLab.scenes.currentId();
    await wait(2500);
    const s0 = LS().stats;
    try { await D.addLayer({ name: 'Hanger', code: HANGER }, 0); } catch { /* the page hangs: no answer */ }
    const on = await until(() => (LS().safe && LS().safe.id === hid ? LS().safe : null), 120000, 500);
    const p = await until(async () => { const q = await pageState(); return q && q.gl.layers === 0 ? q : null; }, 60000, 600);
    const s1 = LS().stats;
    out.info.hang = { safe: on, hangs: s1.hangs - s0.hangs, unsticks: s1.unsticks - s0.unsticks, page: p?.gl.layers, marker: LabSafe.marker(hid), text: banner()?.textContent };
    step('hang: a layer that hangs its page is noticed (no answer while it should draw), its process ended and made again; hanging again → Safe open, the page answers', on && on.kind === 'hang' && s1.hangs - s0.hangs >= 2 && s1.unsticks - s0.unsticks >= 2 && p && /stopped responding/.test(banner()?.textContent || ''), out.info.hang);
  }, 300000);

  // ---------- reopen: crashed on its last open ----------
  await safe('reopen', async () => {
    ThreeLab.scenes.open(vizId);
    const on = await until(() => (LS().safe && LS().safe.id === vizId && banner() ? LS().safe : null), 30000, 300);
    const t = banner()?.textContent || '';
    out.info.reopen = { safe: on, text: t };
    step('reopen: vizualizer2 crashed on its last open, so it opens safely: "vizualizer2 crashed last time · opened safely"', on && on.why === 'last' && /vizualizer2/.test(t) && /crashed last time · opened safely/.test(t) && !LS().safe.back.length, out.info.reopen);
    await until(async () => { const q = await pageState(); return q && q.gl.layers === 0 && q.ad.level >= 9; }, 30000, 500);
    await wait(1200);
  });
} catch (err) { step('ran', false, { error: String(err?.stack || err).slice(0, 800) }); }
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.ok = out.failed.length === 0;
return JSON.stringify(out, null, 1);
