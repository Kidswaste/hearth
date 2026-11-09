// (Nov 9) Scenes v2 phase 3: new scenes are v2; old scenes sit under "Old version" in the Lab's sketch picker and in
// Your sketches, and still open and run exactly the old way. Its own temp data.
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const pj = async (code) => { const r = await ThreeLab.director.evalInSketch(`return JSON.stringify(${code})`); return r?.ok ? JSON.parse(r.value) : r; };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  await ThreeLab.cmd();
  const OLD = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 4;
const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()); scene.add(m);
renderer.setAnimationLoop((now) => { m.rotation.y = now / 1000; renderer.render(scene, camera); });`;
  const old = ThreeLab.scenes.create({ name: 'Lists old scene', code: OLD });
  // a new scene from the gallery's first v2 starting point (as the Lab's New does)
  if (typeof LabGallery === 'undefined') await Lazy.load('gallery');
  await until(() => typeof LabGallery !== 'undefined', 20000);
  const item = LabGallery.items?.().find((x) => x.format === 'gpu');
  let made = null;
  if (item) made = await LabGallery.use(item); else out.noItems = true;
  const v2 = made?.id ? ThreeLab.scenes.get(made.id) : null;
  step('New scene from the gallery\'s v2 starting point is a v2 scene', v2?.format === 'gpu', { made, format: v2?.format });
  await until(() => ThreeLab.workspace.state().ready, 60000);
  const g2 = await until(async () => { const s = await pj('window.__labG2.state()'); return s && s.layers.length >= 1 && s.frames > 5 ? s : null; }, 60000, 500);
  step('…and it runs on the one WebGPU renderer', Boolean(g2), g2 && { layers: g2.layers.length, path: g2.path });
  // the picker
  const sel = document.querySelector('.three-sketch-select');
  const groups = [...sel.querySelectorAll('optgroup')].map((g) => ({ label: g.label, n: g.children.length, names: [...g.children].map((o) => o.textContent) }));
  const firstOld = groups.findIndex((g) => /^Old version/.test(g.label));
  step('picker: the old scenes are under "Old version", after the v2 ones', firstOld > 0 && groups.slice(firstOld).every((g) => /^Old version/.test(g.label)) && groups[firstOld].names.some((n) => /Lists old scene/.test(n)) && !groups.slice(0, firstOld).some((g) => g.names.some((n) => /Lists old scene/.test(n))), groups);
  // Your sketches
  (await ThreeLab.cmd()).browse();
  out.dialog = Boolean(await until(() => document.querySelector('.sb-dialog'), 10000));
  if (document.querySelector('.sb-dialog')) {
    const fold = document.querySelector('.sb-dialog .sb-old');
    const oldCards = fold ? [...fold.querySelectorAll('.sb-card b')].map((b) => b.textContent) : [];
    const topCards = [...document.querySelectorAll('.sb-dialog .sb-grid:not(.sb-old-grid) > .sb-card b')].map((b) => b.textContent);
    step('Your sketches: v2 cards first, old ones folded under "Old version"', Boolean(fold) && oldCards.some((n) => /Lists old scene/.test(n)) && topCards.some((n) => n === v2?.name) && !topCards.some((n) => /Lists old scene/.test(n)), { summary: fold?.querySelector('summary')?.textContent, top: topCards, old: oldCards.slice(0, 5) });
    document.querySelector('.sb-dialog')?.close?.();
  }
  // the old scene opens and runs the old way
  ThreeLab.scenes.open(old.id);
  await until(() => ThreeLab.workspace.state().ready, 60000);
  const h = await until(async () => { const x = await pj('window.__labHealth()'); return x && x.contexts >= 1 ? x : null; }, 60000, 500);
  const g2b = await pj('window.__labG2 ? window.__labG2.state() : null');
  step('the old scene opens and runs the old way (its own WebGL context; the v2 runtime idle)', Boolean(h) && (!g2b || g2b.layers.length === 0), { contexts: h?.contexts, g2: g2b?.layers?.length });
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
