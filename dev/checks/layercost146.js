// (round 146, layercost146) ⚡ Which layer costs the frames? (tools/three-layercost.js, docs/upgrades/layercost146.md),
// ONE check on a fixture scene with one deliberately heavy layer among light ones (the check's own temp data, smoke.js;
// never an owner's scene):
//   Sky        a flat colour, 1× pixels (light)
//   Spinner    one small cube, 1× pixels (light)
//   Particles  the planted heavy layer: 300k triangles (an InstancedMesh, a Count slider), 2× pixels, a shadow light
// Steps:
//   off      before the cost view: no cost badge on any Layers row
//   on       the slow chip's ▦ (or the card's "▦ Cost on layers") measures once, each layer left out in turn
//   rank     the heavy layer (Particles) ranks first, by its own GPU time a frame; the card's list is heaviest first
//   badge    a badge on each Layers row while the view is on (Particles' marked heavy); screenshot
//   lighten  Particles' "Fewer" (its Count halved): the card measures again and Particles' cost went down (load-aware:
//            a miss on a busy box is "can't tell"; its triangles must halve either way)
//   undo     ONE Ctrl/⌘+Z step (LabDirect) puts the Count back; "½ res" (preview only, sketch.speed.lay) and the card's ↶
//            put the scene's preview settings back exactly
//   play     the view on, the scene playing 4 s: no measure ran, no badge was built, the Layers panel never rebuilt
//   hide     the view off: no badge left on any row
//   node dev/smoke.js --fake-engines --check-timeout 1500000 --script dev/checks/layercost146.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { steps: [], measure: {}, cantTell: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn, ms = 400000) => { try { await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error(`${name}: still running after ${Math.round(ms / 1000)} s`)), ms))]); } catch (err) { step(name, false, { error: String(err?.stack || err).slice(0, 600) }); } };

const SKY = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#141a2b'); const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;
const SPINNER = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true }); renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x000000, 0); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); camera.position.z = 5;
const cube = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshNormalMaterial()); cube.position.set(2.2, 1.1, 0); scene.add(cube);
renderer.setAnimationLoop((now) => { cube.rotation.set(now / 1300, now / 900, 0); renderer.render(scene, camera); });`;
const PARTICLES = `import * as THREE from 'three';
const P = tweak({ count: { value: 300000, min: 1000, max: 600000, step: 1000, label: 'Count' } });
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
renderer.setPixelRatio(2); renderer.setSize(innerWidth, innerHeight); renderer.setClearColor(0x000000, 0); document.body.append(renderer.domElement);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 7;
scene.add(new THREE.HemisphereLight('#ffffff', '#223344', 2.2));
const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.8), new THREE.MeshLambertMaterial({ color: '#333' })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.2; floor.receiveShadow = true; scene.add(floor);
const l = new THREE.SpotLight('#ffffff', 30, 20, 0.6); l.position.set(0, 3, 2); l.target.position.set(0, -2, 0); l.castShadow = true; l.shadow.mapSize.set(256, 256); scene.add(l, l.target);
const geo = new THREE.IcosahedronGeometry(0.035, 0); const mat = new THREE.MeshStandardMaterial({ color: '#ff9a4a', roughness: 0.4 });
let mesh = null; let made = -1;
function build(n) {
  if (mesh) { scene.remove(mesh); mesh.dispose(); }
  const copies = Math.max(1, Math.round(n / 20)); mesh = new THREE.InstancedMesh(geo, mat, copies); mesh.castShadow = true;
  const m = new THREE.Matrix4(); let s = 7;
  for (let i = 0; i < copies; i++) { s = (s * 16807) % 2147483647; const a = s / 2147483647; s = (s * 16807) % 2147483647; const b = s / 2147483647; s = (s * 16807) % 2147483647; const c = s / 2147483647; m.setPosition((a - 0.5) * 9, (b - 0.5) * 5, (c - 0.5) * 3); mesh.setMatrixAt(i, m); }
  scene.add(mesh); made = n;
}
renderer.setAnimationLoop((now) => { if (made !== P.count) build(P.count); mesh.rotation.y = Math.sin(now / 2000) * 0.2; renderer.render(scene, camera); });`;

let c = null; let D = null; let sp = null;
const page = async () => { for (let i = 0; i < 6; i++) { const r = await D.evalInSketch('return JSON.stringify(window.__labSpeed ? window.__labSpeed.state() : null)'); if (r?.ok) { try { return JSON.parse(r.value); } catch { return null; } } await wait(500); } return null; };
const S = () => LabSpeed.state();
const idle = () => until(() => (typeof LabSpeed !== 'undefined' && !S().busy ? true : null), 300000, 300);
// an undo measures again (after the page settles): wait for that measure to finish, not just for "not busy now"
const remeasured = async (k) => { await until(() => S().measures > k && !S().busy, 300000, 300); };
const badges = () => [...document.querySelectorAll('.ly-row[data-id] .lc-badge')];
const DEF = JSON.stringify({ px1: false, noAA: false, sh: null, fxHalf: false });

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes && ThreeLab.director && ThreeLab.speed, 60000);
  c = await ThreeLab.cmd(); D = ThreeLab.director; sp = ThreeLab.speed;
  await wait(600);
  await D.newSketch('Layer cost fixture (layercost146)', SKY, 2);
  const fixId = ThreeLab.scenes.currentId();
  try { c.customSize(480, 270); c.size('custom'); } catch { /* fit */ }
  try { await D.updateLayer(D.layers().layers[0].name, { name: 'Sky', code: SKY }, 0.3); } catch (err) { step('fixture: sky', false, err.message); }
  for (const [name, code] of [['Spinner', SPINNER], ['Particles', PARTICLES]]) { try { await D.addLayer({ name, code }, 1); } catch (err) { step(`fixture: ${name}`, false, err.message); } }
  c.code?.(false);
  const adaptWas = c.adapt(); c.adapt(false); // Quality: full, so the measure sees the scene's own pixels
  await wait(3000);
  if (ThreeLab.scenes.currentId() !== fixId) { ThreeLab.scenes.open(fixId); await wait(2500); }
  try { c.customSize(480, 270); c.size('custom'); } catch { /* fit */ }
  try { ThreeLab.stageHooks.lkOpen(); } catch { /* the panel shows anyway */ }
  await wait(2500);
  const pid = D.layers().layers.find((x) => x.name === 'Particles')?.id;
  const cnt = () => D.sliders(pid).sliders.find((s) => s.key === 'count')?.value;
  out.measure.layers = D.layers().layers.map((x) => x.name);

  // ---------- off ----------
  await safe('off', async () => {
    const rows = document.querySelectorAll('.ly-row[data-id]').length;
    step('off: before the cost view, no cost badge on any Layers row', rows >= 3 && badges().length === 0, { rows, badges: badges().length });
  });

  // ---------- on + rank ----------
  let A = null;
  await safe('rank', async () => {
    LabSpeedHook.hideChip(); LabSpeedHook.forget();
    const chip = await until(() => { const x = sp.host.querySelector('.lab-speedchip.slow .lab-speedchip-cost'); return x?.checkVisibility() ? x : null; }, 40000, 200);
    out.measure.viaChip = Boolean(chip);
    if (chip) chip.click(); else await LabSpeedHook.card(() => LabCost.toggle(true));
    await until(() => typeof LabCost !== 'undefined' && LabCost.on && LabSpeed.isOpen(), 30000);
    await until(() => S().analysis?.ok && !S().busy, 300000, 300);
    A = S().analysis;
    out.measure.first = { fps: A?.fps, frameMs: A?.frameMs, layers: A?.layers?.map((L) => [L.name, L.gpuMs, Math.round(L.drawMs * 100) / 100, L.tris, L.pr]) };
    step('on: the slow chip\'s ▦ (or the card\'s button) turns the cost view on and measures once', LabCost.on && S().costOn && A?.ok, { viaChip: out.measure.viaChip });
    step('rank: the planted heavy layer (Particles) ranks first, by its own GPU time a frame', A?.ok && A.layers[0]?.name === 'Particles' && A.layers[0].gpuMs != null && LabCost.state().rows[0]?.name === 'Particles', out.measure.first);
    const rows = [...LabSpeed.card.querySelectorAll('.lc-sec .lc-row')].map((r) => r.querySelector('.lc-n')?.textContent);
    const acts = [...(LabSpeed.card.querySelector(`.lc-row[data-layer="${CSS.escape(pid)}"]`)?.querySelectorAll('.lc-act') || [])].map((b) => b.textContent);
    out.measure.card = { rows, acts };
    step('rank: the card lists each layer heaviest first, Particles with Fewer · ½ res · No shadows · Hide', rows[0] === 'Particles' && rows.length >= 3 && ['Fewer', '½ res', 'No shadows', 'Hide'].every((t) => acts.includes(t)), out.measure.card);
  });

  // ---------- badge ----------
  await safe('badge', async () => {
    await until(() => badges().length >= 3, 5000);
    const pb = document.querySelector(`.ly-row[data-id="${CSS.escape(pid)}"] .lc-badge`);
    out.measure.badges = badges().map((b) => [b.closest('.ly-row').querySelector('.ly-name').textContent, b.textContent, b.className]);
    step('badge: each Layers row shows its cost while the view is on, Particles marked heavy', badges().length === 3 && pb && /lc-heavy/.test(pb.className) && /ms/.test(pb.textContent), out.measure.badges);
    const pr = document.querySelector('.tw-column')?.getBoundingClientRect(); const br = pb?.getBoundingClientRect();
    out.measure.badgeBox = pr && br && { panel: [Math.round(pr.left), Math.round(pr.right)], badge: [Math.round(br.left), Math.round(br.right)] };
    step('badge: the heavy badge is on screen inside the panel', pb?.checkVisibility() && br.width > 20 && br.left >= pr.left && br.right <= pr.right + 1, out.measure.badgeBox);
    try { await smoke({ shot: '/tmp/hearth-checks/layercost146-badges.png' }); } catch { /* optional */ }
  });

  // ---------- lighten ----------
  await safe('lighten', async () => {
    const before = await smoke({ loadwait: 'snap' });
    const trisWas = S().analysis.layers.find((L) => L.id === pid)?.tris;
    const b = LabSpeed.card.querySelector(`.lc-row[data-layer="${CSS.escape(pid)}"] .lc-fewer`);
    b?.click();
    const e = await until(() => S().done.find((d) => d.id === `lt:${pid}:fewer` && d.now != null), 300000, 300);
    await idle();
    const ent = (LabSpeed.state().done.find((d) => d.id === `lt:${pid}:fewer`));
    const raw = S().undos; const L = S().analysis.layers.find((x) => x.id === pid);
    const entry = { costWas: null, costNow: null };
    // the entry's costs (kept on the undo entry; state() lists label / was / now)
    const row = LabSpeed.card.querySelector(`.lc-row[data-layer="${CSS.escape(pid)}"] .lc-done`)?.textContent || '';
    const m = row.match(/([\d.]+) → ([\d.]+) ms/); if (m) { entry.costWas = Number(m[1]); entry.costNow = Number(m[2]); }
    out.measure.lighten = { count: cnt(), trisWas, trisNow: L?.tris, ...entry, row, fps: ent && [ent.was, ent.now], undos: raw };
    step('lighten: "Fewer" halves Particles\' Count (300000 → 150000) and its triangles', b && e && cnt() === 150000 && L && L.tris < trisWas * 0.7, out.measure.lighten);
    const w = await smoke({ loadwait: 1, since: before.snap, ms: 1000 / Math.max(0.1, S().analysis.fps), budget: 1000 / Math.max(0.1, (ent?.was || 1) * 1.1) });
    const busy = w?.judge === 'load' || ((w?.loadavg?.[0] || 0) / Math.max(1, w?.cpus || 1)) >= 0.75;
    out.measure.lighten.load = w;
    const better = entry.costWas != null && entry.costNow != null && entry.costNow < entry.costWas * 0.9;
    if (better) step('lighten: the card measured again and Particles costs less (before → after on its row)', true, out.measure.lighten);
    else if (busy) { out.cantTell.push({ lighten: out.measure.lighten }); step('lighten: measured again (cost down, or can\'t tell on a busy box)', entry.costNow != null, out.measure.lighten); } else step('lighten: the card measured again and Particles costs less (before → after on its row)', false, out.measure.lighten);
  }, 600000);

  // ---------- undo ----------
  await safe('undo', async () => {
    const n0 = S().undos.length; const d0 = LabDirect.steps.length;
    const pane = sp.host.closest('.three-pane') || sp.host;
    const k0 = S().measures;
    LabDirect.undo(); // (the Lab's Ctrl/⌘+Z: its newest step)
    await until(() => S().undos.length === n0 - 1, 20000); await remeasured(k0);
    step('undo: ONE Ctrl/⌘+Z step (LabDirect) puts Particles\' Count back to 300000', cnt() === 300000 && S().undos.length === n0 - 1 && LabDirect.steps.length === d0 - 1, { count: cnt(), undos: S().undos, steps: LabDirect.steps.length, pane: Boolean(pane) });
    // ½ res, the preview only: the scene's preview settings, then the card's ↶
    const h = LabSpeed.card.querySelector(`.lc-row[data-layer="${CSS.escape(pid)}"] .lc-half`);
    h?.click();
    await until(() => S().done.find((d) => d.id === `lt:${pid}:half` && d.now != null), 300000, 300); await idle();
    const pg = await page();
    const on = sp.get().lay?.[pid]?.half === true && pg?.lay?.[pid]?.half === true;
    const u = LabSpeed.card.querySelector(`.lc-row[data-layer="${CSS.escape(pid)}"] .lc-undo1`);
    const k1 = S().measures;
    u?.click();
    await until(() => !S().done.some((d) => d.id === `lt:${pid}:half`), 20000); await remeasured(k1);
    const pg2 = await page();
    step('undo: "½ res" sets this layer\'s preview resolution on the page; the card\'s ↶ puts the settings back exactly (one step)', h && on && u && JSON.stringify(sp.get()) === DEF && !ThreeLab.scenes.get(ThreeLab.scenes.currentId())?.speed && pg2 && !Object.keys(pg2.lay || {}).length, { set: sp.get(), page: pg2 && pg2.lay });
  }, 700000);

  // ---------- play ----------
  await safe('play', async () => {
    if (!LabCost.on) await LabCost.toggle(true);
    await idle();
    await until(() => badges().length >= 3, 5000);
    const m0 = (await page())?.measures; const p0 = LabCost.state().paints; const s0 = S().measures;
    window.LabPlay?.reset?.();
    c.seek(0); await wait(100); c.play(true);
    await wait(4000);
    const playing = window.LabPlay?.playing;
    const counts = window.LabPlay?.counts?.() || {};
    c.play(false); await wait(300);
    const m1 = (await page())?.measures; const p1 = LabCost.state().paints; const s1 = S().measures;
    out.measure.play = { playing, pageMeasures: [m0, m1], paints: [p0, p1], cardMeasures: [s0, s1], counts, badges: badges().length };
    step('play: the view on and the scene playing 4 s: no measure ran, no badge was built, the Layers panel never rebuilt', playing && m0 != null && m0 === m1 && p0 === p1 && s0 === s1 && !counts.layers && badges().length >= 3, out.measure.play);
  });

  // ---------- hide ----------
  await safe('hide', async () => {
    const b = LabSpeed.card?.querySelector('.spd-costview.on');
    if (b) b.click(); else await LabCost.toggle(false);
    await until(() => !LabCost.on && badges().length === 0, 5000);
    step('hide: the view off (the card\'s button) and no badge left on any Layers row', !LabCost.on && badges().length === 0 && Boolean(b), { badges: badges().length });
  });
  // the picture the runner takes at the end (/tmp/hearth-checks/layercost146.png): the view on, the card open
  try { await LabCost.toggle(true); await idle(); await until(() => badges().length >= 3, 5000); LabSpeed.card?.querySelector('.lc-sec')?.scrollIntoView({ block: 'nearest' }); } catch { /* the picture only */ }
  c.adapt(adaptWas !== false);
} catch (err) { step('ran', false, { error: String(err?.stack || err).slice(0, 800) }); }
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.ok = out.failed.length === 0;
return JSON.stringify(out, null, 1);
