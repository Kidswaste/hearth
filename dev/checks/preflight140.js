// (round 140, preflight140) ✈ the check before a render (docs/upgrades/preflight140.md), one check, on a scene it makes
// (Backdrop, Glow ring, Title; 16:9) with the fixture song and a picture reference, all in the check's own temp data:
//   1. a clean scene: ⇪ Export renders at once, no card; the check took under 1 s; the Render card shows the estimate
//   2. a missing reference (Hearth's copy moved away): listed; Relink… (the original picked) brings it back; Cancel
//      leaves the Render card open
//   3. solo on: "Only "Glow ring" is visible (solo is on)"; Turn solo off works, and the button then reads ⇪ Render
//   4. a 9:16 project with a 16:9 preset (its own "Wide promo") and the reel ticked: ONE card for both; Switch to 9:16
//      makes the promo 9:16 (probed)
//   5. the time and size: "Very slow: … would take about …" from a slow measured pace, Render at half size cuts it
//   6. low disk (simulated): "Not enough room", with Render at half size / Save somewhere else…
//   7. a ⧉ batch (2 rows × its formats) with solo on and a missing file: one combined card
//   8. Render anyway: the render goes ahead with solo still on
// Renders are tiny (160 px, 1 s). Only the check's own temp data (smoke.js) and the fixture song; never an owner's file.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/preflight140.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const base = (p) => String(p || '').split(/[\\/]/).pop();
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==';

try {
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.player, 60000);
  const SC = ThreeLab.scenes; const D = ThreeLab.director; const P = ThreeLab.stageHooks.player;
  const code = (color) => `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 50); cam.position.z = 4;
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 8, 24), new THREE.MeshBasicMaterial({ color: '${color}' }));
scene.add(mesh);
renderer.setAnimationLoop((t) => { mesh.rotation.y = t / 1000; renderer.render(scene, cam); });`;
  const TYPE = 'const P = tweak({ size: { value: 0.08, min: 0.02, max: 0.4, label: \'Size\' } });\n\ntextLayer(P, {"text":"HEARTH","mode":"2d"});\n';
  const layers = [ThreeLayers.defaults({ id: 'pfBack', name: 'Backdrop', code: code('#3355ff'), slot: 0 }), ThreeLayers.defaults({ id: 'pfRing', name: 'Glow ring', code: code('#ff3d7f'), slot: 1 }), ThreeLayers.defaults({ id: 'pfTitle', name: 'Title', code: TYPE, slot: 2 })];
  const sk = SC.create({ name: 'Preflight check', code: layers[0].code, layers, frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id, 20000);
  await cmd.loadSong(SONG);
  await until(() => P.loaded && P.analysis?.sections?.length, 60000);
  D.timelineEdit({ loop: { start: 0, end: 1 } }); // (the Render card renders the A–B loop: 1 s)
  await wait(1500);
  store.set('three.export', { format: 'mp4', size: 'custom', custom: '160x90', fps: 30, quality: 'draft', ss: 1, blur: 1 });
  store.set('three.export.pace', []);
  step('setup: a 16:9 scene with three layers, the fixture song, a 1 s loop', SC.currentId() === sk.id && P.loaded && P.loop?.b === 1, { loop: P.loop });

  const card = () => document.querySelector('dialog.lx-panel[open]');
  const pf = () => document.querySelector('dialog.pf-card[open]');
  const openCard = async (o = {}) => { LabExport.panel(o); await until(() => card(), 15000); await until(() => typeof LabPreflight !== 'undefined' && card()?.querySelector('.lx-est'), 15000); return card(); };
  const closeCard = () => { const d = card(); if (d) d.close(); };
  const press = () => card().querySelector('.modal-actions .primary').click();
  const items = () => [...(pf()?.querySelectorAll('.pf-item') || [])].map((li) => li.textContent);
  const fixBtn = (re) => [...(pf()?.querySelectorAll('.pf-fix') || [])].find((b) => re.test(b.textContent));
  const rendered = async (l0) => until(() => { const l = LabExport.status().last; return l !== l0 && l?.path ? l : null; }, 180000);

  // ---------- 1. a clean scene: no card, the render starts at once ----------
  await openCard();
  const estText = card().querySelector('.lx-est')?.textContent || '';
  step('the Render card shows the estimate: about how long, how big', /about \d+ s · ~\d+ (KB|MB)/.test(estText), estText);
  const l1 = LabExport.status().last; const runs1 = LabPreflight._S.runs;
  press();
  const r1 = await rendered(l1);
  step('a clean scene: ⇪ Export renders straight away, with no card', LabPreflight._S.runs === runs1 + 1 && LabPreflight.last?.card === false && !pf() && r1?.w === 160 && !card(), { last: LabPreflight.last, render: r1 && `${r1.w}×${r1.h} ${base(r1.path)}` });
  step('…and the check took under 1 s', LabPreflight.last?.ms < 1000, `${LabPreflight.last?.ms} ms`);

  // ---------- 2. a missing reference ----------
  const orig = `/tmp/hearth-preflight140-${Date.now().toString(36)}/logo.png`; // (the check's own temp folder)
  await window.hub.fs.write(orig, PNG, { base64: true });
  await ThreeLab.addReference(orig);
  const ref = await until(() => D.refs.list().find((r) => r.key === 'logo'), 10000);
  await window.hub.fs.trash([ref.path]);
  const gone = !(await window.hub.fs.stat(ref.path));
  await openCard();
  press();
  await until(() => pf(), 10000);
  const it2 = items();
  step('a missing reference is listed, with Relink…', gone && it2.some((t) => /picture "logo\.png" is missing/.test(t)) && fixBtn(/Relink/), it2);
  LabPreflight._S.pick = async () => orig;
  fixBtn(/Relink/).click();
  await until(() => !items().some((t) => /missing/.test(t)), 10000);
  const back = await window.hub.fs.stat(ref.path);
  step('…Relink (the original picked) puts it back: the item is gone, the file is there', back?.size > 0 && !items().some((t) => /missing/.test(t)) && /✓ Relink/.test(pf()?.querySelector('.pf-done')?.textContent || ''), { items: items(), size: back?.size });
  pf().querySelector('.pf-cancel').click();
  await wait(200);
  step('Cancel: nothing renders and the Render card stays open', !pf() && Boolean(card()), { card: Boolean(card()) });
  closeCard();

  // ---------- 3. solo on ----------
  cmd.solo('Glow ring');
  await until(() => LayerGroups.soloId(SC.layersOf(SC.get(sk.id))), 5000);
  await openCard();
  const l3 = LabExport.status().last;
  press();
  await until(() => pf(), 10000);
  const it3 = items();
  step('solo on is caught: "Only "Glow ring" is visible (solo is on)", with Turn solo off', it3.some((t) => /Only "Glow ring" is visible \(solo is on\)/.test(t)) && fixBtn(/Turn solo off/), it3);
  fixBtn(/Turn solo off/).click();
  await until(() => !items().length, 8000);
  const goText = pf()?.querySelector('.pf-go')?.textContent;
  step('…Turn solo off: no layer is solo any more, every layer shows, and the button reads ⇪ Render', !LayerGroups.soloId(SC.layersOf(SC.get(sk.id))) && SC.layersOf(SC.get(sk.id)).every((L) => L.visible !== false) && goText === '⇪ Render', { goText, items: items() });
  pf().querySelector('.pf-go').click();
  const r3 = await rendered(l3);
  step('…and ⇪ Render renders', Boolean(r3?.path), r3 && base(r3.path));

  // ---------- 4. a 9:16 project, a 16:9 preset ----------
  await Lazy.load('projects'); await Projects.ready();
  const pj = Projects.create({ name: 'Pre Test' });
  Projects.add(pj, 'scene', sk.id, '', { links: false });
  pj.prefs = { aspect: '9:16', fps: 30, renderPresets: [RenderPreCore.makeSaved('Wide promo', 'full', { format: 'mp4', size: 'custom', custom: '1920x1080', fps: 30, quality: 'draft' })] };
  Projects.changed(pj, 'prefs');
  await Projects.flush();
  const wide = pj.prefs.renderPresets[0].id;
  LabRenderPre.tiny({ long: 160, secs: 1 });
  await openCard();
  await until(() => card().querySelector(`.rp-chip[data-preset="${wide}"]`), 8000);
  card().querySelector('.rp-chip[data-preset="reel"]').click(); await wait(80);
  card().querySelector(`.rp-chip[data-preset="${wide}"]`).click(); await wait(80);
  const cards4 = LabPreflight._S.cards; const last4 = LabRenderPre.last;
  press();
  await until(() => pf(), 10000);
  const it4 = items();
  step('a 9:16 project with a 16:9 preset: caught, on one card for both presets', LabPreflight._S.cards === cards4 + 1 && /2 presets/.test(pf()?.querySelector('h3')?.textContent || '') && it4.length === 1 && /The project "Pre Test" is 9:16, but "Wide promo" is 16:9 \(160×90\)/.test(it4[0]) && fixBtn(/Switch to 9:16/), { title: pf()?.querySelector('h3')?.textContent, items: it4 });
  fixBtn(/Switch to 9:16/).click();
  await until(() => !items().length, 8000);
  pf().querySelector('.pf-go').click();
  await until(() => LabRenderPre.last !== last4 && LabRenderPre.last?.files?.length + LabRenderPre.last?.failed?.length >= 2, 240000);
  const promo = LabRenderPre.last?.files?.find((f) => f.label === 'Wide promo');
  const pp = promo && await window.hub.video.probe(promo.path);
  step('…Switch to 9:16: the promo renders 9:16 (90×160)', pp?.w === 90 && pp?.h === 160, { promo: pp && `${pp.w}×${pp.h}`, failed: LabRenderPre.last?.failed });
  LabRenderPre.tiny(null);
  pj.prefs = {}; Projects.changed(pj, 'prefs'); // (below: the scene's own 16:9 and the card's own frame rate)

  // ---------- 5. the time and size estimate ----------
  store.set('three.export', { format: 'mp4', size: '4k', custom: '', fps: 60, quality: 'high', ss: 1, blur: 1 });
  store.set('three.export.pace', [{ mpx: 1, ms: 40, tail: 0 }, { mpx: 1, ms: 40, tail: 0 }]);
  D.timelineEdit({ loop: { start: 0, end: 120 } });
  await openCard();
  const est5 = card().querySelector('.lx-est')?.textContent || '';
  press();
  await until(() => pf(), 10000);
  const it5 = items(); const e5 = LabPreflight.last?.est;
  step('the time and size: "Very slow: 4K at 60 fps would take about … min", with the size on the card', /Very slow: 4K at 60 fps would take about \d+ min/.test(it5.join('|')) && /about \d+ min · ~[\d.]+ (MB|GB)/.test(pf()?.querySelector('.pf-est')?.textContent || '') && /about \d+ min/.test(est5), { items: it5, est: pf()?.querySelector('.pf-est')?.textContent, card: est5 });
  fixBtn(/half size/).click();
  await until(() => LabPreflight.last?.est?.secs < e5.secs, 8000);
  step('…Render at half size cuts the estimate (about a quarter of the pixels)', LabPreflight.last.est.secs < e5.secs * 0.4 && LabPreflight.last.est.bytes < e5.bytes * 0.4, { before: e5.text, after: LabPreflight.last.est.text });
  pf().querySelector('.pf-cancel').click(); await wait(150);
  closeCard();

  // ---------- 6. low disk (simulated) ----------
  store.set('three.export', { format: 'mp4', size: '1080p', custom: '', fps: 30, quality: 'high', ss: 1, blur: 1 });
  store.set('three.export.pace', []);
  D.timelineEdit({ loop: { start: 0, end: 10 } });
  LabPreflight._S.free = 40 * 1048576;
  await openCard();
  press();
  await until(() => pf(), 10000);
  const it6 = items();
  step('low disk: "Not enough room: … has 40 MB free", with Save somewhere else…', it6.some((t) => /Not enough room: the disk of ".+" has 40 MB free/.test(t)) && fixBtn(/Save somewhere else/), it6);
  pf().querySelector('.pf-cancel').click(); await wait(150);
  closeCard();
  LabPreflight._S.free = undefined;

  // ---------- 7. a batch: one combined card ----------
  store.set('three.export', { format: 'mp4', size: 'custom', custom: '160x90', fps: 30, quality: 'draft', ss: 1, blur: 1 });
  D.timelineEdit({ loop: { start: 0, end: 1 } });
  cmd.solo('Glow ring');
  await until(() => LayerGroups.soloId(SC.layersOf(SC.get(sk.id))), 5000);
  await window.hub.fs.trash([ref.path]);
  await Lazy.load('labbatch');
  const bst = await LabBatch.open({ template: 'scene' });
  bst.rowsEl.value = 'One\nTwo'; bst.reparse(true);
  await until(() => bst.rowsOk?.().length === 2, 5000);
  const cards7 = LabPreflight._S.cards;
  document.querySelector('dialog .lb-go').click();
  await until(() => pf(), 10000);
  const it7 = items();
  step('a batch: one combined card for every video (solo and the missing file on it)', LabPreflight._S.cards === cards7 + 1 && document.querySelectorAll('dialog.pf-card[open]').length === 1 && /batch \(\d+ videos\)/.test(pf()?.querySelector('h3')?.textContent || '') && it7.some((t) => /solo is on/.test(t)) && it7.some((t) => /logo\.png" is missing/.test(t)), { title: pf()?.querySelector('h3')?.textContent, items: it7 });
  pf().querySelector('.pf-cancel').click(); await wait(150);
  step('…Cancel keeps the batch dialog open, nothing started', Boolean(document.querySelector('dialog .lb-go')) && !LabBatch.status().running);
  LabBatch.close();
  await window.hub.fs.copy(orig, ref.path); await D.refs.reload(ref.id);

  // ---------- 8. Render anyway ----------
  await openCard();
  const l8 = LabExport.status().last;
  press();
  await until(() => pf(), 10000);
  step('Render anyway: the card shows (solo is still on)…', items().some((t) => /solo is on/.test(t)) && pf()?.querySelector('.pf-go')?.textContent === 'Render anyway', items());
  pf().querySelector('.pf-go').click();
  const r8 = await rendered(l8);
  step('…and the render goes ahead as it is', Boolean(r8?.path) && r8.w === 160 && Boolean(LayerGroups.soloId(SC.layersOf(SC.get(sk.id)))), r8 && base(r8.path));
  cmd.solo(null);
  LabPreflight._S.pick = null;
  await window.hub.fs.trash([orig.replace(/[\\/]logo\.png$/, '')]).catch(() => {});
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
