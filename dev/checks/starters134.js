// (round 134, starters134) ★ My work: start from my own work, by clicks (docs/upgrades/starters134.md):
//   1. the library lists the fixture projects' main scenes, a saved template and the standout layers (a rendered layer
//      kept 40 days; a new, unrendered one stays out), with pictures or swatches
//   2. search, and the filters by kind, by project and by look (palette swatches behind ◆ Look)
//   3. ✦ Like my past work through the fake engine: the cost shows first and nothing is sent before the click; then 3
//      ideas, each with Start from this (it fills the new-project card)
//   4. ＋ New project › ★ My work… › a past scene › Create: the new scene has its layers with fresh ids; the original is
//      untouched. The sketch browser's ★ My work › Start a new scene from this: the same, in the Lab
//   5. Add this layer here: one layer of a past scene, recolored to this project's palette (ticked), as ONE undo step;
//      unticked it keeps its colors. Use this look: a palette as one undo step
// Only the check's own temp data folder is used (smoke.js), never real data.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/journey-lib.js --script dev/checks/starters134.js
const { step, wait, until, click } = J;
J.shotDir = window.SMOKE_TMP || '/tmp';
const DAY = 86400000;
const btn = (root, re) => [...(root || document).querySelectorAll('button')].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const byName = (n) => Projects.all().find((p) => p.name === n) || null;
const ready = (n) => ProjectWorkspace.current()?.name === n && ProjectWorkspace.state().phase === 'ready';
const section = async (name, fn) => { try { await fn(); } catch (err) { step(`${name}: stopped`, false, String(err?.stack || err).slice(0, 400)); await smoke({ shot: `${J.shotDir}/starters134-${name.slice(0, 2)}.png` }).catch(() => {}); for (const d of document.querySelectorAll('dialog[open]')) d.close(); } };
const LAYER = (name, a, b) => `import * as THREE from 'three';
const P = tweak({
  tint: { value: '${a}', label: '${name} color' },
  glow: { value: '${b}', label: '${name} glow' },
  size: { value: 1, min: 0.2, max: 3, label: '${name} size' },
});
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3), new THREE.MeshBasicMaterial({ color: P.tint }));
scene.add(m);
renderer.setAnimationLoop((t) => { m.rotation.y = t / 1000; m.scale.setScalar(P.size); renderer.render(scene, camera); });
`;
const RAIN = ['#101820', '#f2aa4c', '#e94b3c'];
const BLOOM = ['#2d1e2f', '#f7b2bd', '#c9f2c7'];
const mw = () => document.querySelector('dialog.mw[open]');
const cards = () => [...(mw()?.querySelectorAll('.mw-card') || [])];
const keys = () => cards().map((c) => c.dataset.key);
const loaded = () => until(() => mw() && !/Reading your work/.test(mw().querySelector('.mw-status')?.textContent || '') && cards().length, 15000);
const typeIn = async (input, text) => { input.focus(); input.value = ''; input.dispatchEvent(new Event('input')); await J.type(text); await wait(150); };

await Lazy.load('projects'); await Projects.ready();
await Lazy.load('lab');
const claude = H.claudeAgent();
const S = new Proxy({}, { get: (_, k) => ThreeLab.scenes[k] }); // (the Lab's scenes once its surface is up)
// ---------- fixture: two past projects, a rendered old layer, a template ----------
async function project(name, layers, palette) {
  await ProjectWorkspace.create({ name, brief: '', persona: 'partner', agentId: claude.id, sceneId: '', boardId: '', plugins: [], files: [], describe: false });
  await until(() => ready(name), 40000);
  const p = byName(name); const sid = p.workspace.sceneId;
  S.get(sid).layers = layers; S.get(sid).palette = palette.slice(); S.changed(sid);
  Projects.setWorkspace(p, { palette: palette.slice() });
  return { p, sid };
}
const sparksId = `l${(Date.now() - 40 * DAY).toString(36)}ab`;
const A = await project('Neon Rain', [ThreeLayers.defaults({ id: 'main', name: 'Tunnel', code: LAYER('Tunnel', '#e94b3c', '#f2aa4c'), slot: 0 }), ThreeLayers.defaults({ id: sparksId, name: 'Sparks', code: LAYER('Sparks', '#e94b3c', '#f2aa4c'), slot: 1 })], RAIN);
Projects.add(A.p, 'render', '/tmp/neon-rain-final.mp4', 'Neon Rain final', { links: false });
const B = await project('Quiet Bloom', [ThreeLayers.defaults({ id: 'main', name: 'Petals', code: LAYER('Petals', '#f7b2bd', '#c9f2c7'), slot: 0 })], BLOOM);
await Projects.flush();
const att = await window.hub.attachmentsDir();
const tplDir = `${String(att).replace(/[\\/]attachments[\\/]?$/, '')}/templates/mw134tpl`;
await window.hub.fs.write(`${tplDir}/template.json`, JSON.stringify({ format: 'hearth-template', v: 1, id: 'mw134tpl', name: 'Chrome Drift', at: Date.now(), fields: [], scene: { name: 'Chrome Drift', layers: [{ id: 'main', name: 'Knot', code: LAYER('Knot', '#c0c0c0', '#00e5ff') }], palette: ['#c0c0c0', '#3a3a3a', '#00e5ff'], extras: {} } }));
const sigL = (id) => JSON.stringify(S.layersOf(S.get(id)).map((L) => [L.id, L.name, L.code])); // (what the owner made: ids, names, code)
const origA = sigL(A.sid);
const origB = sigL(B.sid);

// ---------- 1–3. the library in the new-project card, search and filters, ✦ Like my past work ----------
let card = null;
await section('1. the library', async () => {
  await ProjectWorkspace.wizard();
  await until(() => document.querySelector('dialog.pcw[open]'), 15000);
  card = document.querySelector('dialog.pcw[open]');
  card.querySelector('input').focus(); await J.type('From Rain');
  card.querySelector('textarea').value = 'rainy synthwave loop'; card.querySelector('textarea').dispatchEvent(new Event('input'));
  await click(card.querySelector('[data-sec=ai] summary'));
  await click([...card.querySelectorAll('[data-sec=ai] .pcw-chip')].find((b) => b.textContent === claude.name));
  await click(btn(card, /^★ My work…$/));
  await loaded();
  const k = keys();
  step('Start from › ★ My work… opens the library: both projects\' main scenes and the saved template', k.includes(`scene:${A.sid}`) && k.includes(`scene:${B.sid}`) && k.includes('template:mw134tpl'), k);
  step('…the standout layers: Sparks (rendered, kept 40 days) and Tunnel (rendered); the new unrendered Petals stays out', k.includes(`layer:${A.sid}:${sparksId}`) && k.includes(`layer:${A.sid}:main`) && !k.includes(`layer:${B.sid}:main`), MyWork.last.read);
  const sp = cards().find((c) => c.dataset.key === `layer:${A.sid}:${sparksId}`);
  step('…a standout says why (rendered 1× · kept 40 days)', /rendered 1×/.test(sp?.title || '') && /kept 40 days/.test(sp?.title || ''), sp?.title);
  step('…each card has a picture or the palette\'s swatches', cards().every((c) => c.querySelector('.mw-img')?.style.backgroundImage || c.querySelector('.mw-img .mw-sw, .mw-img span')));
});
await section('2. search and filters', async () => {
  const q = mw().querySelector('.mw-q');
  await typeIn(q, 'sparks');
  step('search "sparks": only the Sparks layer', JSON.stringify(keys()) === JSON.stringify([`layer:${A.sid}:${sparksId}`]), keys());
  await typeIn(q, '');
  await click(mw().querySelector('.mw-kind[data-kind="look"]'));
  step('kind Looks: only looks (the palettes used)', cards().length >= 3 && cards().every((c) => c.dataset.kind === 'look'), keys());
  await click(mw().querySelector('.mw-kind[data-kind="scene"]'));
  step('kind Scenes: scenes and templates only', cards().length >= 3 && cards().every((c) => ['scene', 'template'].includes(c.dataset.kind)), keys());
  await click(mw().querySelector('.mw-kind[data-kind=""]'));
  const sel = mw().querySelector('.mw-proj'); sel.value = B.p.id; sel.dispatchEvent(new Event('change'));
  await wait(100);
  step('project Quiet Bloom: only its scene and look', cards().length >= 1 && keys().includes(`scene:${B.sid}`) && keys().every((x) => !x.includes(A.sid) && x !== 'template:mw134tpl'), keys());
  sel.value = ''; sel.dispatchEvent(new Event('change'));
  step('the look swatches are folded behind ◆ Look', mw().querySelector('.mw-looks').hidden);
  await click(btn(mw(), /^◆ Look$/));
  const sw = mw().querySelector(`.mw-look[data-look="${RAIN.join(',')}"]`);
  await click(sw);
  step('look Neon Rain\'s palette: only things in those colors', keys().includes(`scene:${A.sid}`) && !keys().includes(`scene:${B.sid}`) && !keys().includes('template:mw134tpl'), keys());
  await click(mw().querySelector(`.mw-look[data-look="${RAIN.join(',')}"]`));
  step('a second click on the swatch clears the look filter', keys().includes(`scene:${B.sid}`));
});
await section('3. ✦ Like my past work', async () => {
  const sent0 = MyWork.last.sent.length;
  await click(btn(mw(), /^✦ Like my past work$/));
  await until(() => mw().querySelector('.mw-cost')?.textContent, 5000);
  const cost = mw().querySelector('.mw-cost')?.textContent || '';
  await wait(800);
  step('✦ Like my past work shows the cost first (tokens · Claude, who directs) and what it reads; nothing is sent', /About [\d.]+k? tokens in and [\d.]+k? out · Claude/.test(cost) && /titles, palettes, layer kinds/.test(cost) && MyWork.last.sent.length === sent0, cost);
  await click(btn(mw(), /^✦ Suggest 3$/));
  await until(() => mw()?.querySelectorAll('.mw-idea').length === 3, 30000);
  const sent = MyWork.last.sent.at(-1)?.text || '';
  step('one call, with the compact summary (titles, palettes, layer kinds) and the brief; no code', MyWork.last.sent.length === sent0 + 1 && /Neon Rain/.test(sent) && /#e94b3c/.test(sent) && /rainy synthwave loop/.test(sent) && !/WebGLRenderer/.test(sent), sent.slice(0, 300));
  const ideas = [...mw().querySelectorAll('.mw-idea')];
  step('3 starting points, each with "Start from this"', ideas.length === 3 && ideas.every((x) => btn(x, /^Start from this$/)), ideas.length ? ideas.map((x) => x.textContent.slice(0, 60)) : [mw()?.querySelector('.mw-aibox')?.textContent, MyWork.last.raw]);
  const first = ideas[0].dataset.key;
  await click(btn(ideas[0], /^Start from this$/));
  await until(() => !mw(), 5000);
  step('Start from this fills the new-project card\'s Start from', /My work|My template|Lab templates/.test(card.querySelector('[data-sec=start] .pcw-sum').textContent), { first, sum: card.querySelector('[data-sec=start] .pcw-sum').textContent });
});

// ---------- 4. a new scene from a past one: fresh ids, the original untouched ----------
await section('4. start from a past scene', async () => {
  await click(btn(card, /^★ My work…$/));
  await loaded();
  await click(cards().find((c) => c.dataset.key === `scene:${A.sid}`));
  await click(btn(mw(), /^Start from this$/));
  await until(() => !mw(), 5000);
  step('the card says "My work: Neon Rain" and takes its palette', /My work: “Neon Rain”/.test(card.querySelector('[data-sec=start] .pcw-sum').textContent) && /3 colors/.test(card.querySelector('[data-sec=look] .pcw-sum').textContent), card.querySelector('[data-sec=start] .pcw-sum').textContent);
  await click(btn(card, /^Create project/));
  await until(() => ready('From Rain'), 60000);
  const pc = byName('From Rain'); const nid = pc?.workspace?.sceneId; const x = nid && S.get(nid);
  const Ls = x ? S.layersOf(x) : [];
  step('Create: a new project whose scene has Tunnel and Sparks, Sparks with a fresh id', JSON.stringify(Ls.map((L) => L.name)) === '["Tunnel","Sparks"]' && nid !== A.sid && Ls[1].id !== sparksId, Ls.map((L) => [L.name, L.id]));
  step('…the original scene is untouched', sigL(A.sid) === origA && byName('Neon Rain').workspace.sceneId === A.sid);
  // the Lab: the sketch browser's ★ My work › Start a new scene from this
  activate('tool:three');
  await ThreeLab.cmd();
  const browse = () => [...document.querySelectorAll('button')].find((b) => b.title === 'All your sketches as pictures' && J.visible(b));
  if (await until(browse, 4000)) await click(browse()); else (await ThreeLab.cmd()).browse(); // (▦ may be tucked away by declutter: the same browser)
  await until(() => btn(document.querySelector('dialog.sb-dialog[open]'), /^★ My work$/), 5000);
  await click(btn(document.querySelector('dialog.sb-dialog[open]'), /^★ My work$/));
  await loaded();
  step('the sketch browser\'s ★ My work opens on Scenes', [...mw().querySelectorAll('.mw-kind.on')].map((b) => b.dataset.kind).join() === 'scene');
  await click(cards().find((c) => c.dataset.key === `scene:${B.sid}`));
  await click(btn(mw(), /^Start a new scene from this$/));
  await until(() => MyWork.last.started?.from === B.sid && S.currentId() === MyWork.last.started.id, 10000);
  const y = S.get(S.currentId());
  step('Start a new scene from this: a new scene on screen, Petals with a fresh copy, the palette; the original untouched', y && y.id !== B.sid && S.layersOf(y)[0].name === 'Petals' && JSON.stringify(y.palette) === JSON.stringify(BLOOM) && sigL(B.sid) === origB, { id: y?.id, layers: y && S.layersOf(y).map((L) => L.id) });
});

// ---------- 5. add a layer here (one undo, recolored when ticked); use a look (one undo) ----------
await section('5. add a layer here', async () => {
  S.open(B.sid);
  await until(() => S.currentId() === B.sid, 10000);
  await wait(800);
  const sigOf = async () => LabTxn._test.sigOf(await LabTxn.snap(B.sid));
  const sig0 = await sigOf();
  await MyWork.open({ mode: 'lab', kind: 'layer' }); // (the ＋ Add › ★ From my work… row's own call)
  await loaded();
  step('＋ Add › ★ From my work… opens on Layers', [...mw().querySelectorAll('.mw-kind.on')].map((b) => b.dataset.kind).join() === 'layer' && cards().every((c) => c.dataset.kind === 'layer'), keys());
  await click(cards().find((c) => c.dataset.key === `layer:${A.sid}:${sparksId}`));
  const tick = mw().querySelector('.mw-recolor input');
  step('a layer shows "Recolor to this project\'s palette", ticked, with its swatches', tick?.checked === true && mw().querySelectorAll('.mw-recolor .mw-sw i').length === 3);
  await click(btn(mw(), /^Add this layer here$/));
  await until(() => MyWork.last.added?.scene === B.sid, 15000);
  const Ls = ThreeLab.director.layers().layers;
  const added = Ls.at(-1); const code = ThreeLab.director.codeOf(added.id).code;
  step('Add this layer here: Sparks on top, recolored to Quiet Bloom\'s palette (its darkest and lightest colors)', Ls.length === 2 && added.name === 'Sparks' && /'#2d1e2f'/.test(code) && !/'#e94b3c'/.test(code) && MyWork.last.added.recolored, { names: Ls.map((L) => L.name), head: code.split('\n').slice(1, 4) });
  step('…its source layer is unchanged', sigL(A.sid) === origA);
  await LabTxn.undoTurn();
  step('ONE undo (the dock\'s ↶ step) puts the scene back exactly', await until(async () => (await sigOf()) === sig0, 8000) && ThreeLab.director.layers().layers.length === 1);
  await MyWork.open({ mode: 'lab', kind: 'layer' });
  await loaded();
  await click(cards().find((c) => c.dataset.key === `layer:${A.sid}:${sparksId}`));
  await click(mw().querySelector('.mw-recolor input'));
  await click(btn(mw(), /^Add this layer here$/));
  await until(() => MyWork.last.added?.scene === B.sid && MyWork.last.added.recolored === false, 15000);
  const code2 = ThreeLab.director.codeOf(ThreeLab.director.layers().layers.at(-1).id).code;
  step('unticked, the layer keeps its own colors', /'#e94b3c'/.test(code2) && MyWork.last.added.step);
  await LabTxn.undoTurn();
  await until(async () => (await sigOf()) === sig0, 8000);
  // Use this look: Neon Rain's palette on Petals' color sliders, one undo
  await MyWork.open({ mode: 'lab', kind: 'look' });
  await loaded();
  const look = cards().find((c) => c.dataset.key === `look:pal:${RAIN.join(',')}`);
  await click(look);
  await click(btn(mw(), /^Use this look$/));
  await until(() => MyWork.last.look, 10000);
  const vals = ThreeLab.director.sliders(ThreeLab.director.layers().layers[0].id, null).sliders.filter((s) => /^#/.test(String(s.value))).map((s) => s.value);
  step('Use this look: the palette on the color sliders, as one step', MyWork.last.look.changed >= 1 && MyWork.last.look.step && vals.every((v) => RAIN.includes(String(v).toLowerCase())), { look: MyWork.last.look, vals });
  await LabTxn.undoTurn();
  step('…and one undo takes it back', await until(async () => (await sigOf()) === sig0, 8000));
  step('the owner\'s originals were never changed', sigL(A.sid) === origA && sigL(B.sid) === origB);
});

return J.done();
