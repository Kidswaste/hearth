// (round 116, layerdelete116) "also allow the chats to delete layers": every way a chat asks the Lab to delete layers
// (docs/upgrades/layerdelete116.md), with the fake engines making real MCP calls (three_do remove_layer in the lean
// list), in realscene-lib's real scene (dev/checks/realscene-lib.js: Backdrop, Beat burst, 🧊 RS bot, Beat rig,
// ✦ Bloom, a song) plus three particle layers, a 📁 group, a ◫ precomp and look-alike names. Files and scenes in the
// check's own temp folder / made here; no owner data. Each deletion is put back by one of the owner's undos (the
// toast's Undo, Ctrl/⌘+Z in the Lab, the dock's ↶) and the scene is compared with what it was.
//   on screen, docked director: by name, by number, "selected", a three_layers row ("4. Beat rig*"), a filter, a
//     precomp, a group by its name, a layer inside a group, three at once (layers: [...], one Undo), a part of a name
//     several layers have (refused, nothing deleted), two layers with the same name, the layer the owner typed in
//     (unsaved editor text comes back with Undo), every layer (an empty layer is left, Undo brings them all back)
//   backstage (a chat linked to a scene that isn't on screen, Claude and Astra): by name, several, the last one; the
//     owner's toast Undo; the reply's ↶ (LabTxn)
//   the tool lists: three_do names remove_layer with layers in lean mode (Claude and Astra), three_remove_layer takes
//     layers in full mode
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/checks/layerdelete116.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m) => { if (!c) fail.push(m); return Boolean(c); };
const mcp = (calls) => `mcp please\nmcp: ${JSON.stringify(calls)}`;
const S = () => ThreeLab.scenes;
const namesIn = (id) => S().layersOf(S().get(id)).map((L) => L.name);
const sigIn = (id) => JSON.stringify(S().layersOf(S().get(id)).map((L) => [L.id, L.name, L.code.length, L.group?.id || null]));
const LAYER = (name, color) => `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: 'Size' } });
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 48), new THREE.MeshBasicMaterial({ color: '${color}' }));
mesh.name = ${JSON.stringify(name)};
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.z = now / 1000; mesh.scale.setScalar(P.size); renderer.render(scene, camera); });`;
async function turn(agentId, text, ms = 120000) {
  await Native.send(agentId, text);
  await wait(400);
  const chatId = H.activeChat[agentId];
  await until(() => !Native.isBusy(chatId), ms);
  await wait(250);
  const chat = await Native.load(chatId);
  const m = chat.messages.at(-1);
  const lines = (String(m?.text || '').split('MCP calls:')[1] || '').split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  return { chatId, lines, text: lines.join(' | '), errors: lines.filter((l) => /^[\w]+: ERROR/.test(l)) };
}
const del = (args) => mcp([['three_do', { cmd: 'remove_layer', ...args }]]);
const toastUndo = async (re = /deleted/i) => {
  const t = await until(() => [...document.querySelectorAll('#toasts .toast')].reverse().find((n) => re.test(n.textContent) && n.querySelector('button:not(.toast-x)')), 5000);
  t?.querySelector('button:not(.toast-x)')?.click();
  await wait(700);
  return Boolean(t);
};
const ctrlZ = async () => {
  const at = ThreeLab.groupsHost?.panel;
  at?.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }));
  await wait(700);
  return Boolean(at);
};

try {
  // ---------- the scene ----------
  const info = await RS.open({ size: [320, 180] });
  ok(info.layers?.length >= 5, `the real scene is up: ${info.layers?.join(', ')}`);
  const D = ThreeLab.director;
  const A = S().currentId();
  for (const n of ['Particles A', 'Particles B', 'Particles C', 'Spark', 'Spark 2', 'Twin', 'Twin']) await D.addLayer({ name: n, code: LAYER(n, '#ffcc33') }, 0.3);
  // two layers really named "Twin" (the Lab names a new one "Twin 2": the second is renamed by hand, as an old scene can have)
  const twins = S().layersOf(S().get(A)).filter((L) => /^Twin/.test(L.name)); twins.forEach((L) => { L.name = 'Twin'; }); S().changed(A);
  const sparks = S().layersOf(S().get(A)).filter((L) => /^Spark/.test(L.name)).map((L) => L.id);
  LabGroups.groupPicked({ name: 'Sparks', ids: sparks }); await wait(300);
  const src = S().create({ name: 'Intro (precomp source)', code: LAYER('Intro', '#33ccff'), layers: [{ ...ThreeLayers.defaults({ name: 'Intro', code: LAYER('Intro', '#33ccff') }) }], open: false });
  const pc = ThreeComp.makeLayer({ sketch: src.id }, { name: 'Intro' });
  S().get(A).layers.splice(1, 0, pc); S().changed(A); await wait(800);
  out.info.scene = namesIn(A);
  ok(namesIn(A).includes('◫ Intro') && namesIn(A).filter((n) => n === 'Twin').length === 2, `the test scene: ${namesIn(A).join(', ')}`);

  // ---------- the chats ----------
  const C = H.agent('claude'); C.threeTools = true;
  await Commands.tryRun('/director-setup', C.id, null, { say: () => {}, note: () => {} });
  const DD = await until(() => H.agents().find((a) => a.dock === 'three'), 10000);
  await saveConfig(); await wait(400);
  ok(DD, 'a docked Three Director');
  activate('tool:three'); await wait(400);
  const first = await turn(DD.id, mcp([['three_do', { cmd: 'help', topic: 'remove_layer' }], ['three_do', { cmd: 'layers' }]]));
  ok(ChatScenes.linkOf(first.chatId) === A, `the director works on the scene on screen (${ChatScenes.linkOf(first.chatId)} vs ${A})`);
  ok(/three_do: \d+ chars · three_remove_layer \(lean: three_do remove_layer\).*args: layer, layers/.test(first.text), `lean list: three_do help remove_layer names layers (${first.text.slice(0, 260)})`);
  ok(/server three-mcp\.js: \d+ tools/.test(first.text), 'the director has the Lab server');

  // a deletion on screen, its undo, the scene as before → { r, gone, back }
  async function onScreen(name, args, undo, expectGone) {
    const before = sigIn(A); const n0 = namesIn(A);
    const r = await turn(DD.id, del(args));
    const after = namesIn(A);
    const gone = n0.filter((n, i) => !after.includes(n) || after.filter((x) => x === n).length < n0.filter((x) => x === n).length);
    const okGone = expectGone ? ok(!r.errors.length && expectGone.every((n) => !after.includes(n) || n0.filter((x) => x === n).length > after.filter((x) => x === n).length) && after.length === n0.length - expectGone.length, `${name}: deleted ${expectGone.join(', ')} (${r.text.slice(0, 200)}; now ${after.join(', ')})`) : true;
    let back = null;
    if (expectGone && okGone && undo) {
      const how = undo === 'toast' ? await toastUndo() : undo === 'ctrlz' ? await ctrlZ() : await ThreeDirector.undo().then(() => true, (e) => { out.info[`${name}:undo`] = e.message; return false; });
      await wait(500);
      back = sigIn(A) === before;
      ok(how && back, `${name}: ${undo} brings it back as it was (${namesIn(A).join(', ')})`);
    }
    return { r, gone, back };
  }
  const R = {};
  R.byName = await onScreen('by name', { layer: 'Beat rig' }, 'toast', ['Beat rig']);
  R.byNumber = await onScreen('by number', { layer: 3 }, 'ctrlz', [namesIn(A)[2]]);
  D.selectLayer('🧊 RS bot'); await wait(300);
  R.selected = await onScreen('the selected one', { layer: 'selected' }, 'dock', ['🧊 RS bot']);
  const row = `${namesIn(A).indexOf('Beat rig') + 1}. Beat rig*`;
  R.row = await onScreen('a three_layers row', { layer: row }, 'toast', ['Beat rig']);
  R.filter = await onScreen('a filter', { layer: 'Bloom' }, 'toast', ['✦ Bloom']);
  R.precomp = await onScreen('a precomp', { layer: 'Intro' }, 'toast', ['◫ Intro']);
  R.group = await onScreen('a group by its name', { layer: 'Sparks' }, 'toast', ['Spark', 'Spark 2']);
  R.inGroup = await onScreen('a layer in a group', { layer: 'Spark 2' }, 'ctrlz', ['Spark 2']);
  R.three = await onScreen('three at once', { layers: ['Particles A', 'Particles B', 'Particles C'] }, 'toast', ['Particles A', 'Particles B', 'Particles C']);
  ok([...document.querySelectorAll('#toasts .toast')].filter((n) => /deleted/i.test(n.textContent)).length <= 1, 'three at once: one toast');
  // a part several layers have: refused, with their numbers, nothing deleted
  const n0 = namesIn(A);
  const amb = await turn(DD.id, del({ layer: 'particles' }));
  ok(amb.errors.length && /fits 3 layers/.test(amb.text) && namesIn(A).length === n0.length, `a part of a name three layers have is refused with their numbers (${amb.text.slice(0, 220)})`);
  const twin = await turn(DD.id, del({ layer: 'Twin' }));
  ok(twin.errors.length && /fits 2 layers/.test(twin.text) && namesIn(A).length === n0.length, `two layers with the same name: refused, by number then (${twin.text.slice(0, 200)})`);
  const tn = namesIn(A).map((n, i) => (n === 'Twin' ? i + 1 : 0)).filter(Boolean);
  R.twinNum = await onScreen('a twin by number', { layers: [tn[1]] }, 'toast', ['Twin']);
  // the layer the owner is typing in (unsaved in the editor): deleted on request, Undo brings the typing back
  D.selectLayer('Particles B'); await wait(300);
  const ta = document.querySelector('.three-editor textarea.ce-area'); // the Lab's code editor (its text is the selected layer's)
  if (ta) { ta.value = `/*owner-typing*/${ta.value}`; ta.dispatchEvent(new Event('input', { bubbles: true })); await wait(300); } // as a key typed: the editor's onChange
  out.info.typed = Boolean(ta) && ThreeLab.director.codeOf('Particles B').code.includes('/*owner-typing*/');
  await wait(300);
  const typed = await turn(DD.id, del({ layer: 'Particles B' }));
  ok(!typed.errors.length && !namesIn(A).includes('Particles B'), `the layer the owner typed in is deleted on request (${typed.text.slice(0, 160)})`);
  await toastUndo();
  ok(S().layersOf(S().get(A)).find((L) => L.name === 'Particles B')?.code.includes('/*owner-typing*/'), 'Undo brings it back with the owner\'s typing');
  // every layer: an empty layer is left, no refusal; one Undo brings them all back
  const all0 = sigIn(A); const allN = namesIn(A).length;
  const every = await turn(DD.id, del({ layers: namesIn(A).map((_, i) => i + 1) }));
  ok(!every.errors.length && namesIn(A).length === 1 && namesIn(A)[0] === 'Empty layer' && /left/.test(every.text), `every layer (${allN}): an empty layer is left (${namesIn(A).join(', ')} · ${every.text.slice(0, 200)})`);
  await toastUndo();
  ok(sigIn(A) === all0, `…and one Undo brings all ${allN} back (${namesIn(A).length})`);
  out.info.onScreen = Object.fromEntries(Object.entries(R).map(([k, v]) => [k, { back: v.back, gone: v.gone }]));

  // ---------- backstage: a chat linked to a scene that isn't on screen ----------
  const mk = (n) => ThreeLayers.defaults({ name: n, code: LAYER(n, '#ff66aa') });
  const B = S().create({ name: 'Backstage 116', code: LAYER('One', '#fff'), layers: [mk('One'), mk('Glow A'), mk('Glow B'), mk('Glow C')], open: false });
  ok(S().currentId() === A, 'scene A stays on screen');
  activate(C.id); await wait(300); Native.newChat?.(C.id); await wait(200);
  const c0 = await turn(C.id, 'hello there');
  ChatScenes.linkGuest(c0.chatId, B.id);
  const b0 = sigIn(B.id);
  const b1 = await turn(C.id, del({ layer: 'Glow A' }));
  ok(!b1.errors.length && !namesIn(B.id).includes('Glow A') && S().currentId() === A, `backstage: by name (${b1.text.slice(0, 160)})`);
  ok(await toastUndo(/deleted.*Backstage 116/i) && sigIn(B.id) === b0, `backstage: the owner's toast Undo puts it back (${namesIn(B.id).join(', ')})`);
  const b2 = await turn(C.id, del({ layers: ['Glow A', 'Glow B', 'Glow C'] }));
  ok(!b2.errors.length && namesIn(B.id).join() === 'One', `backstage: three at once (${namesIn(B.id).join(', ')})`);
  const b3 = await turn(C.id, del({ layer: 'One' }));
  ok(!b3.errors.length && namesIn(B.id).join() === 'Empty layer', `backstage: the last one leaves an empty layer (${b3.text.slice(0, 160)})`);
  await ThreeDirector.undo().catch((e) => { out.info.backUndo = e.message; });
  await wait(500);
  ok(namesIn(B.id).join() === 'One', `backstage: the reply's ↶ puts its deletions back (${namesIn(B.id).join(', ')})`);
  await ThreeDirector.undo().catch((e) => { out.info.backUndo2 = e.message; });
  await wait(500);
  ok(sigIn(B.id) === b0, `backstage: …and the reply before it (${namesIn(B.id).join(', ')})`);

  // ---------- Astra (Codex path), backstage ----------
  const AS = H.agent('astra');
  await Commands.tryRun('/astra-tools on', AS.id, null, { say: () => {}, note: () => {} });
  ok(await until(() => H.agent('astra').threeTools, 5000), 'Astra has the Lab tools');
  activate(AS.id); await wait(300);
  const a0 = await turn(AS.id, 'hello astra');
  ChatScenes.linkGuest(a0.chatId, B.id);
  const a1 = await turn(AS.id, mcp([['three_do', { cmd: 'help', topic: 'remove_layer' }], ['three_do', { cmd: 'remove_layer', layers: ['Glow B', 'Glow C'] }]]));
  ok(/args: layer, layers/.test(a1.text), `Astra's lean list: remove_layer takes layers (${a1.text.slice(0, 200)})`);
  ok(!a1.errors.length && namesIn(B.id).join(', ') === 'One, Glow A', `Astra deletes two at once backstage (${namesIn(B.id).join(', ')} · ${a1.text.slice(-200)})`);
  ok(await toastUndo(/Astra deleted/) && sigIn(B.id) === b0, `Astra's deletion: the owner's toast Undo (${namesIn(B.id).join(', ')})`);

  // ---------- full mode (agent.toolMode 'full'): three_remove_layer itself ----------
  C.toolMode = 'full'; await saveConfig(); activate(C.id); await wait(300);
  const f1 = await turn(C.id, mcp([['three_remove_layer', { layers: ['Glow A'] }]]));
  ok(!f1.errors.length && !namesIn(B.id).includes('Glow A'), `full mode: three_remove_layer {layers} (${f1.text.slice(0, 200)})`);
  delete C.toolMode; await saveConfig();

  out.info.aiErrors = HubBridge.log().filter((e) => e.error && /remove_layer/.test(e.tool)).map((e) => String(e.error).slice(0, 120));
  ok(HubBridge.log().filter((e) => e.error).every((e) => !/undefined|TypeError: |at \w+ \(/.test(e.error)), 'every error an AI got is a sentence');
  await RS.close();
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
