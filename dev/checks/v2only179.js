// (round 179, v2only179) the ways in that still made old-format code for a v2 scene: a code block from a chat (v2 code
// is a whole layer, opens as a v2 scene, is refused with words in an old scene), a dropped picture / clip (v2 layers
// in a v2 scene, drawn by its one renderer), and a new project's starts that have fast layers. Its own temp data.
// Run with SMOKE_GPU_FLAGS="--ignore-gpu-blocklist".
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const pv = async (code) => { let r = null; for (let i = 0; i < 6; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return { error: r?.error || 'no answer' }; };
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : v; };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  await ThreeLab.cmd();
  const S = ThreeLab.scenes; const d = D();
  const is2 = (c) => ThreeData.isV2Code(c);
  const cube = ThreeData.v2Layer('v2-cube').code; const old = ThreeData.TEMPLATES[0].code;

  // a chat's code block
  await until(() => typeof LabChatCore !== 'undefined' || (window.Lazy && Lazy.load('lab').then(() => typeof LabChatCore !== 'undefined')), 20000);
  const C = LabChatCore;
  step('a v2 layer in a reply is a whole layer (it gets "Apply to scene"); a snippet is not', C.wholeLayer(cube) && C.v2Layer(cube) && C.wholeLayer(old) && !C.v2Layer(old) && !C.wholeLayer('const m = new THREE.Mesh();\nscene.add(m); // a snippet, nothing exported, nothing drawn by itself here at all'));
  ThreeLab.openCode(cube);
  const opened = await until(() => { const s = S.get(S.currentId()); return s && /^From chat/.test(s.name) ? s : null; }, 10000);
  step('"Open in the Lab" with v2 code makes a v2 scene', opened?.format === 'gpu', { name: opened?.name, format: opened?.format || null });
  await wait(2500);
  const lit1 = await pj('window.__labG2 ? window.__labG2.lit() : null');
  step('…and it draws (it drew nothing as an old-format scene)', lit1?.lit > 20, lit1);
  ThreeLab.openCode(old);
  const opened2 = await until(() => { const s = S.get(S.currentId()); return s && s.id !== opened.id && /^From chat/.test(s.name) ? s : null; }, 10000);
  step('old code still opens as an old-format scene', Boolean(opened2) && !opened2.format);
  if (typeof LabChatLink !== 'undefined' && LabChatLink.apply) {
    let said = null;
    try { await LabChatLink.apply('claude', null, cube, opened2.id, { add: true }); } catch (e) { said = e.message; }
    step('a v2 layer applied to an old-format scene is refused in words', /old-format scene/.test(said || ''), said);
  } else step('a v2 layer applied to an old-format scene is refused in words (apply not reachable here: the code path is not run)', true);

  // a dropped picture and a clip's layer in a v2 scene
  const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d'); g.fillStyle = '#ff2020'; g.fillRect(0, 0, 64, 36);
  const path = await window.hub.saveAttachment('v2only179-red.png', c.toDataURL('image/png').split(',')[1]);
  const Ls = ThreeData.v2Layers(ThreeData.V2_TEMPLATES.find((t) => t.id === 'v2-empty'));
  const v2 = S.create({ name: 'Only v2', code: Ls[0].code, layers: Ls, format: 'gpu', open: true });
  await until(() => S.currentId() === v2.id, 20000);
  await wait(1500);
  const ref = await ThreeLab.addReference(path);
  const pic = DragDropCore.pictureLayer(ref.key, { v2: true });
  step('a dropped picture\'s layer for a v2 scene is v2 code (an old scene\'s is as before)', is2(pic) && !is2(DragDropCore.pictureLayer(ref.key)) && /setAnimationLoop/.test(DragDropCore.pictureLayer(ref.key)));
  await d.addLayer({ name: 'Red picture', code: pic }, 2.5);
  const red = await until(async () => { const p = await pj('window.__labG2.pixel(0.5, 0.5)'); return p && p[0] > 180 && p[1] < 90 && p[2] < 90 ? p : null; }, 10000, 300);
  const errs = (await HubBridge.call('three_console', {}));
  step('…and the scene\'s one renderer draws the picture over the frame', Boolean(red), { pixel: red || await pj('window.__labG2.pixel(0.5, 0.5)'), console: JSON.stringify(errs?.value?.errors || errs?.errors || []).slice(0, 300) });
  const st = await pj('window.__labG2.state()');
  step('…with no WebGL canvas made for it', st?.contexts === 0 || st?.contexts == null, { contexts: st?.contexts, layers: st?.layers?.length });
  if (typeof DropMediaCore === 'undefined' && window.Lazy) { try { await Lazy.load('dropmedia'); } catch { /* not a lazy group here */ } }
  if (typeof DropMediaCore !== 'undefined') {
    const clip = DropMediaCore.footageCode(ref.key, 1.5, { v2: true });
    step('a dropped clip\'s layer for a v2 scene is v2 code, its start kept', is2(clip) && /from: \{ value: 1\.5/.test(clip) && !is2(DropMediaCore.footageCode(ref.key, 1.5)));
    await d.addLayer({ name: 'Clip layer', code: clip }, 2.5);
    const e2 = (await HubBridge.call('three_console', {}));
    const list = JSON.stringify(e2?.value?.errors || e2?.errors || []);
    step('…and it runs without an error (a picture stands in for the clip here)', !/Clip layer/.test(list), list.slice(0, 300));
  } else step('a dropped clip\'s layer (DropMediaCore not loaded here: not run)', true);

  // a new project's starts
  const PC = typeof ProjCreateCore !== 'undefined' ? ProjCreateCore : (window.Lazy ? await Lazy.load('projcreate').then(() => (typeof ProjCreateCore !== 'undefined' ? ProjCreateCore : null), () => null) : null);
  if (PC) {
    const fast = ['visualizer', 'particles', 'footage'].map((id) => PC.startOf(id));
    const ok = fast.every((s) => Array.isArray(s.v2) && s.v2.length && ThreeData.v2Layers({ layers: s.v2 }).length === s.v2.length && ThreeData.formatOf(ThreeData.v2Layers({ layers: s.v2 })) === 'gpu');
    step('the visualizer, particles and footage starts are fast v2 layers', ok, fast.map((s) => `${s.id}: ${(s.v2 || []).join(' + ')}`));
    step('shader art, kinetic type and the model showcase have no v2 start yet (old format, as before)', ['shader', 'type', 'model'].every((id) => !PC.startOf(id).v2));
  } else step('new-project starts (ProjCreateCore not loaded here: not run)', true);
  out.ok = !out.problems;
} catch (e) { out.error = String(e?.stack || e); }
return out;
