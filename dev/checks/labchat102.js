// (round 102, labchat102) labchat92's AI chat ↔ Lab flows again, after rounds 93–101 changed what's underneath (the Lab
// loading on intent, multi-file models, compiles after frames, History per scene, the director's files after the first
// screen). Fake engines (real Lab MCP calls), scenes and a model made here, in the check's own temp folder; no owner data.
// Parts (each after a reload; 2 and 3 with every lazy group held: localStorage lazy.hold + lazy.lab.mode none):
//   held      a docked director's ask sent while director-task.js isn't in (its goal kept), /task through its stand-in,
//             the dock's strip while director-dock.js isn't in; a .gltf (+ .bin, textures/, a picture a folder up)
//             dropped on a Claude chat linked to a scene while the Lab isn't loaded: copied whole into that scene
//   apply     ▶ Apply with the Lab not loaded (its code loads on the click) › Replace "Ring", ↶ Undo: the scene's
//             History (kv/three-hv-<scene>.json) has the versions; the same from the chat with another scene on screen
//             (backstage): the History of the chat's scene gets them too
//   model     ▶ Apply › Add it as a new layer with ~50 shader programs (held between frames, modelcompile101): the note
//             waits for its first frame (its console line from onAfterRender is in it); an AI's three_model add of the
//             .gltf (Claude, on screen) and of an .obj + .mtl (Astra, backstage): every file copied; its three_screenshot
//             right after waits for the full textures (not the 64-px stand-ins), capped; Astra's ▶ Apply backstage
//   node dev/smoke.js --fake-engines --no-lazy-wait --wait 1500 --check-timeout 900000 --script dev/checks/labchat102.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const LAYER = (name, color) => `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: 'Size' } });
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 16, 96), new THREE.MeshBasicMaterial({ color: '${color}' }));
mesh.name = ${JSON.stringify(name)};
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.z = now / 1000; mesh.scale.setScalar(P.size); renderer.render(scene, camera); });`;
const A = 'lc102a'; const B = 'lc102b';
const DIR = `${window.SMOKE_TMP || '/tmp'}/lc102m`;
const pngOf = async (rgb, n) => { const c = new OffscreenCanvas(n, n); const g = c.getContext('2d'); g.fillStyle = `rgb(${rgb.join(',')})`; g.fillRect(0, 0, n, n); g.fillStyle = '#ffffff'; g.fillRect(n - 8, n - 8, 8, 8); return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()); };
const P3 = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]; const UV = [0, 1, 1, 1, 1, 0, 0, 0]; const IX = [0, 1, 2, 0, 2, 3];
const W = (p, data) => window.hub.fs.write(p, data);
// a .gltf: buffers/car.bin, textures/paint.png (4096², sent up in slices), ../shared/glow.png
const pos = new Float32Array(P3); const uv = new Float32Array(UV); const ix = new Uint16Array(IX);
const bin = new Uint8Array(pos.byteLength + uv.byteLength + ix.byteLength + 4);
bin.set(new Uint8Array(pos.buffer), 0); bin.set(new Uint8Array(uv.buffer), pos.byteLength); bin.set(new Uint8Array(ix.buffer), pos.byteLength + uv.byteLength);
const gltf = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
  materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 }, emissiveTexture: { index: 1 }, emissiveFactor: [0, 0, 0] }],
  textures: [{ source: 0 }, { source: 1 }], images: [{ uri: 'textures/paint.png' }, { uri: '../shared/glow.png' }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] }, { bufferView: 1, componentType: 5126, count: 4, type: 'VEC2' }, { bufferView: 2, componentType: 5123, count: 6, type: 'SCALAR' }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength }, { buffer: 0, byteOffset: pos.byteLength, byteLength: uv.byteLength }, { buffer: 0, byteOffset: pos.byteLength + uv.byteLength, byteLength: ix.byteLength }],
  buffers: [{ uri: 'buffers/car.bin', byteLength: bin.length }] };
await W(`${DIR}/car/car.gltf`, JSON.stringify(gltf)); await W(`${DIR}/car/buffers/car.bin`, bin);
await W(`${DIR}/car/textures/paint.png`, await pngOf([230, 20, 20], 4096)); await W(`${DIR}/shared/glow.png`, await pngOf([250, 240, 10], 8));
await W(`${DIR}/car2/car.gltf`, JSON.stringify(gltf)); await W(`${DIR}/car2/buffers/car.bin`, bin); await W(`${DIR}/car2/textures/paint.png`, await pngOf([20, 40, 230], 4096)); await W(`${DIR}/shared/glow.png`, await pngOf([250, 240, 10], 8));
// an .obj + .mtl + a 2048² picture
await W(`${DIR}/chair/chair.obj`, `mtllib chair.mtl\n${[[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => `v ${x} ${y} 0`).join('\n')}\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nusemtl seat\nf 1/1 2/2 3/3\nf 1/1 3/3 4/4\n`);
await W(`${DIR}/chair/chair.mtl`, 'newmtl seat\nKd 1 1 1\nmap_Kd maps/seat.png\n'); await W(`${DIR}/chair/maps/seat.png`, await pngOf([20, 220, 30], 2048));
// two scenes; Claude with the Lab's tools; a docked director; every group held from the next start
const mk = (id, name, color) => ({ id, name, code: LAYER('Base', color), updatedAt: Date.now(), layers: [{ id: `${id}L1`, name: 'Base', code: LAYER('Base', color), visible: true, opacity: 1, blend: 'normal', slot: 0 }, { id: `${id}L2`, name: 'Ring', code: LAYER('Ring', '#ffffff'), visible: true, opacity: 1, blend: 'normal', slot: 1 }] });
const prev = (await window.hub.kvGet('three-sketches', null)) || [];
await window.hub.kvSet('three-sketches', [...prev.filter((x) => x.id !== A && x.id !== B), mk(A, 'Chat A', '#ff3d7f'), mk(B, 'Chat B', '#56c6ff')]);
store.set('three.current', A);
const C = H.agent('claude'); C.threeTools = true;
await Commands.tryRun('/director-setup', C.id, null, { say: () => {}, note: () => {} });
for (let i = 0; i < 100 && !H.agents().some((a) => a.dock === 'three'); i += 1) await wait(100);
H.config.settings = { ...H.config.settings, startOn: 'tool:home' };
await saveConfig();
localStorage.setItem('lc102.out', JSON.stringify({ ok: [], fails: [], info: {} }));
localStorage.setItem('lc102.dir', DIR);
localStorage.setItem('lazy.lab.mode', 'none');
localStorage.setItem('lazy.hold', '1');
await wait(1500);
return `[LABCHAT102] setup: fixtures in ${DIR}, two scenes, a docked director (${H.agents().find((a) => a.dock === 'three')?.name || 'none'}); next: every group held`;
//@@ reload
// ---------- held: the director's task / dock while their groups aren't in; a model dropped with the Lab not loaded ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const R = JSON.parse(localStorage.getItem('lc102.out')); const DIR = localStorage.getItem('lc102.dir');
const ok = (c, m) => { (c ? R.ok : R.fails).push(`held: ${m}`); return Boolean(c); };
const grp = (n) => Lazy.state().find((g) => g.name === n)?.state;
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
await wait(2500);
R.info.heldAtStart = { lab: grp('lab'), directortask: grp('directortask'), directordock: grp('directordock') };
ok(grp('lab') === 'stub' && grp('directortask') === 'stub' && grp('directordock') === 'stub', `the Lab, director-task and director-dock aren't in 2.5 s after the start (${JSON.stringify(R.info.heldAtStart)})`);
const D = H.agents().find((a) => a.dock === 'three');
const C = H.agent('claude');
try {
  // a docked director's ask, sent before director-task.js is in
  ok(D, 'the docked director');
  activate(D.id); await wait(400);
  Native.newChat?.(D.id); await wait(200);
  await Native.send(D.id, 'goal102: a slow spinning ring');
  await wait(300);
  const dChat = H.activeChat[D.id];
  await until(() => !Native.isBusy(dChat), 60000);
  ok(await until(() => Lazy.loaded('directortask'), 15000), 'the ask brings director-task.js in');
  const said = [];
  await Commands.tryRun('/task', D.id, null, { say: (t) => said.push(String(t)), note: (t) => said.push(String(t)) });
  R.info.task = said.join(' ').slice(0, 200);
  ok(/goal102/.test(R.info.task), `/task shows the goal sent before its file was in (${R.info.task})`);
  // a .gltf dropped on a Claude chat linked to scene A, the Lab not loaded
  activate(C.id); await wait(300);
  Native.newChat?.(C.id); await wait(200);
  await Native.send(C.id, 'hello lc102');
  await wait(300);
  const cChat = H.activeChat[C.id];
  await until(() => !Native.isBusy(cChat), 60000);
  ChatScenes.linkGuest(cChat, 'lc102a');
  R.info.labBeforeDrop = grp('lab');
  const t0 = Date.now();
  await Native.attachPaths(C.id, [`${DIR}/car/car.gltf`]);
  const ref = await until(() => (typeof ThreeLab !== 'undefined' ? ThreeLab.refsOf('lc102a').find((r) => r.name === 'car.gltf') : null), 20000);
  const chips = (Native.view(C.id)?.attachments || []).map((a) => a.name);
  R.info.drop = { ms: Date.now() - t0, ref: ref ? { files: ref.files || 1, path: ref.path, missing: ref.missing || [] } : null, chips };
  ok(ref, `the dropped .gltf is a reference of the chat's scene (not a lone attachment: ${chips.join(', ') || 'no chips'})`);
  if (ref) {
    ok(ref.files === 4 && !(ref.missing || []).length, `…copied with its .bin and both pictures (${ref.files || 1} files, missing: ${(ref.missing || []).join(', ') || 'none'})`);
    const dir = ref.path.replace(/[\\/]car\.gltf$/, '');
    const there = await Promise.all(['buffers/car.bin', 'textures/paint.png'].map((f) => window.hub.fs.stat(`${dir}/${f}`).then(() => true, () => false)));
    ok(there.every(Boolean), `…its files beside it in the copy (${there.join(', ')})`);
  }
  // the dock: the Lab shown with the director docked, director-dock.js held until then
  R.info.dockBefore = grp('directordock');
  activate('tool:three');
  const strip = await until(() => H.surfaces.get('tool:three')?.el.querySelector('.dd-strip'), 30000);
  ok(strip, `the docked director's strip shows (director-dock.js was ${R.info.dockBefore})`);
} catch (err) { R.fails.push(`held: threw ${err.stack || err}`); }
localStorage.setItem('lc102.out', JSON.stringify(R));
return `[LABCHAT102] held: ${R.fails.length} failing so far`;
//@@ reload
// ---------- apply: ▶ Apply with the Lab not loaded; ↶ Undo; History per scene (on screen and backstage) ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const R = JSON.parse(localStorage.getItem('lc102.out'));
const ok = (c, m) => { (c ? R.ok : R.fails).push(`apply: ${m}`); return Boolean(c); };
const grp = (n) => Lazy.state().find((g) => g.name === n)?.state;
const menuButtons = () => [...document.querySelectorAll('#menu button, #menu-fly button, .lab-pop button.menu-item')].filter((b) => b.offsetParent && !b.disabled);
const clickMenu = async (re) => { const b = await until(() => menuButtons().find((x) => re.test(x.textContent)), 20000); b?.click(); await wait(250); return Boolean(b); };
const noteOf = (agentId) => Native.view(agentId)?.list.querySelector('.msg.note[data-note-id="lab-apply"]') || null;
const noteBtn = (agentId, re) => [...(noteOf(agentId)?.querySelectorAll('.note-acts button') || [])].find((b) => re.test(b.textContent));
const applyBtn = (agentId) => [...(Native.view(agentId)?.list.querySelectorAll('.msg pre .code-act') || [])].filter((b) => /Apply to scene/.test(b.textContent)).at(-1);
const vers = async (sid, lid) => (await window.hub.kvGet(`three-hv-${sid}`, null))?.versions?.[`${sid}:${lid}`] || [];
const versions = async (sid, lid) => (await vers(sid, lid)).map((v) => v.code);
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
await wait(2500);
const C = H.agent('claude');
try {
  ok(grp('lab') === 'stub', `the Lab isn't loaded (${grp('lab')})`);
  activate(C.id); await wait(300);
  Native.newChat?.(C.id); await wait(200);
  await Native.send(C.id, 'layercode please');
  await wait(300);
  const chatId = H.activeChat[C.id];
  await until(() => !Native.isBusy(chatId), 60000); await wait(300);
  ChatScenes.linkGuest(chatId, 'lc102a');
  const hv0 = await versions('lc102a', 'lc102aL2');
  const t0 = Date.now();
  applyBtn(C.id)?.click();
  ok(await clickMenu(/Replace “Ring”/), `▶ Apply › Replace “Ring” offered with the Lab loading on the click (${grp('lab')})`);
  const n1 = await until(() => /Applied to/.test(noteOf(C.id)?.textContent || '') && noteOf(C.id), 30000);
  R.info.applyColdMs = Date.now() - t0;
  ok(n1 && /Applied to Ring in Chat A/.test(n1.textContent), `the note says it applied (${(n1?.textContent || '').slice(0, 90)})`);
  const S = () => ThreeLab.scenes;
  const ring = () => S().layersOf(S().get('lc102a')).find((L) => L.name === 'Ring')?.code || '';
  ok(ring().includes("'#33ff99'"), 'the reply\'s code is "Ring" now');
  noteBtn(C.id, /Undo/)?.click();
  ok(await until(() => /Undone/.test(noteOf(C.id)?.textContent || ''), 15000) && ring().includes("'#ffffff'"), '↶ Undo puts "Ring" back');
  const hv1 = await until(async () => { const v = await versions('lc102a', 'lc102aL2'); return v.length >= hv0.length + 2 ? v : null; }, 10000) || await versions('lc102a', 'lc102aL2');
  R.info.historyOnScreen = { before: hv0.length, after: hv1.length };
  ok(hv1.some((c) => c.includes('#33ff99')) && hv1.some((c) => c.includes("'#ffffff'")), `scene A's History file has the code before the Apply and the applied code (${hv0.length} → ${hv1.length} versions)`);
  // backstage: scene B on screen, the chat's scene is A
  await S().open('lc102b'); await wait(1500);
  const tB = Date.now();
  activate(C.id); await wait(300);
  applyBtn(C.id)?.click();
  ok(await clickMenu(/Replace another layer|Replace “Ring”/), '▶ Apply (backstage)');
  if (!menuButtons().length) { /* went straight */ } else await clickMenu(/Replace “Ring”/);
  const n2 = await until(() => /Applied to/.test(noteOf(C.id)?.textContent || '') && noteOf(C.id), 30000);
  ok(n2 && ring().includes('#33ff99') && S().currentId() === 'lc102b', `backstage: applied to the chat's scene A, B stays on screen (${(n2?.textContent || '').slice(0, 60)})`);
  noteBtn(C.id, /Undo/)?.click();
  ok(await until(() => /Undone/.test(noteOf(C.id)?.textContent || ''), 15000) && ring().includes("'#ffffff'"), 'backstage ↶ Undo puts "Ring" back');
  const newer = async () => (await vers('lc102a', 'lc102aL2')).filter((v) => v.at >= tB);
  const hv2 = await until(async () => { const v = await newer(); return v.length ? v : null; }, 10000) || await newer();
  R.info.historyBackstage = { newVersions: hv2.length, codes: hv2.map((v) => (v.code.includes('#33ff99') ? 'applied' : 'before')) };
  ok(hv2.some((v) => v.code.includes('#33ff99')), `backstage, scene A's History gets the versions too (${hv2.length} new: ${R.info.historyBackstage.codes.join(', ') || 'none'})`);
  const hvB = await versions('lc102b', 'lc102bL2');
  ok(!hvB.some((c) => c.includes('#33ff99')), 'scene B\'s History has nothing of it');
  await S().open('lc102a'); await wait(800);
} catch (err) { R.fails.push(`apply: threw ${err.stack || err}`); }
localStorage.removeItem('lazy.hold'); localStorage.removeItem('lazy.lab.mode');
localStorage.setItem('lc102.out', JSON.stringify(R));
return `[LABCHAT102] apply: ${R.fails.length} failing so far`;
//@@ reload
// ---------- model: a held new layer's Apply; an AI's multi-file model + its screenshot (Claude on screen, Astra backstage) ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const R = JSON.parse(localStorage.getItem('lc102.out')); const DIR = localStorage.getItem('lc102.dir');
const ok = (c, m) => { (c ? R.ok : R.fails).push(`model: ${m}`); return Boolean(c); };
const menuButtons = () => [...document.querySelectorAll('#menu button, #menu-fly button, .lab-pop button.menu-item')].filter((b) => b.offsetParent && !b.disabled);
const clickMenu = async (re) => { const b = await until(() => menuButtons().find((x) => re.test(x.textContent)), 20000); b?.click(); await wait(250); return Boolean(b); };
const noteOf = (agentId) => Native.view(agentId)?.list.querySelector('.msg.note[data-note-id="lab-apply"]') || null;
const applyBtn = (agentId) => [...(Native.view(agentId)?.list.querySelectorAll('.msg pre .code-act') || [])].filter((b) => /Apply to scene/.test(b.textContent)).at(-1);
const mcp = (calls) => `mcp please\nmcp: ${JSON.stringify(calls)}`;
async function turn(agentId, text, ms = 150000) {
  await Native.send(agentId, text); await wait(400);
  const chatId = H.activeChat[agentId];
  await until(() => !Native.isBusy(chatId), ms); await wait(300);
  const m = (await Native.load(chatId)).messages.at(-1);
  const lines = (String(m?.text || '').split('MCP calls:')[1] || '').split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  return { chatId, m, lines, errors: lines.filter((l) => /^[\w]+: ERROR/.test(l)) };
}
const sbx = async (code) => { for (let i = 0; i < 6; i += 1) { const r = await ThreeLab.director.evalInSketch(code); if (r?.ok) return typeof r.value === 'string' ? JSON.parse(r.value) : r.value; await wait(300); } return null; };
// ~50 programs (each its own shader): held between frames when added on screen; its console line once it really drew
const HEAVY = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 9;
let said = false;
for (let i = 0; i < 50; i += 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.ShaderMaterial({ vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(' + (i / 50).toFixed(3) + ', 0.6, 0.3, 1.0); }' }));
  m.position.set((i % 10) - 4.5, Math.floor(i / 10) - 2, 0);
  scene.add(m);
}
renderer.setAnimationLoop(() => { renderer.render(scene, camera); if (!said && renderer.info.render.calls > 0) { said = true; console.log('drew102 first frame'); } });`;
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000);
const C = H.agent('claude'); const AS = H.agent('astra');
try {
  await Lazy.load('lab'); activate('tool:three');
  await ThreeLab.cmd();
  const S = () => ThreeLab.scenes;
  if (S().currentId() !== 'lc102a') await S().open('lc102a');
  await until(() => S().currentId() === 'lc102a', 10000); await wait(2500);
  // ▶ Apply › Add it as a new layer: held while its shaders are made between frames
  activate(C.id); await wait(300);
  Native.newChat?.(C.id); await wait(200);
  const r1 = await turn(C.id, `echo\n\`\`\`js\n${HEAVY}\n\`\`\``);
  ChatScenes.linkGuest(r1.chatId, 'lc102a');
  ok(applyBtn(C.id), 'the echoed layer shows ▶ Apply to scene');
  const wg0 = await sbx('return JSON.stringify(window.__labWarmGap?.state() || null)');
  const t0 = Date.now();
  applyBtn(C.id)?.click();
  await clickMenu(/Add it as a new layer/);
  let buildingAtNote = null;
  const n = await until(() => { const x = /Added to/.test(noteOf(C.id)?.textContent || '') && noteOf(C.id); if (x) buildingAtNote = Boolean(ThreeLab.director.building?.()); return x; }, 30000, 20);
  const wg1 = await sbx('return JSON.stringify(window.__labWarmGap?.state() || null)');
  const page = await sbx('return JSON.stringify({ waiting: window.__labWarmGap?.state().waiting ?? null, rs: Object.entries(window.__scenes || {}).map(([k, e]) => [k, e.renderer?.__warm ?? null, Boolean(e.renderer?.__wg), e.renderer?.__renders || 0]) })');
  const noteMs = Date.now() - t0;
  R.info.held = { noteMs, note: (n?.textContent || '').slice(0, 160), held: (wg1?.held || 0) - (wg0?.held || 0), last: wg1?.last || null, stillHeldAtNote: page?.waiting ?? null, renderers: page?.rs || null, buildingAtNote, waitedDraw: LabChatLink.stats?.waitedDraw ?? null };
  ok(n, `the note after Add it as a new layer (${R.info.held.note})`);
  ok(buildingAtNote === false && (!R.info.held.held || noteMs >= (R.info.held.last?.ms || 0)), `…written once the layer drew its first frame (still building when it was written: ${buildingAtNote}; held between frames ${R.info.held.held ? `${R.info.held.last?.ms} ms` : 'no (its shaders made in its first frame)'}; note at ${noteMs} ms)`);
  // ↶ Undo takes the held layer out (a lighter page for what follows)
  [...(noteOf(C.id)?.querySelectorAll('.note-acts button') || [])].find((b) => /Undo/.test(b.textContent))?.click();
  ok(await until(() => /Undone/.test(noteOf(C.id)?.textContent || ''), 15000), '↶ Undo takes the added layer out');
  await wait(1500);
  // Claude's three_model add of the .gltf (on screen) and its screenshot right after
  activate(C.id); Native.newChat?.(C.id); await wait(200);
  const t0c = await turn(C.id, 'hello car');
  ChatScenes.linkGuest(t0c.chatId, 'lc102a');
  const ST = () => ThreeDirector.settled?.() || { asked: 0, waited: 0, ms: 0, capped: 0 };
  const before = ST();
  // (a timeline of the page right after the add answers: what a picture taken then would have shown)
  const tl = [];
  let stop = false;
  const watch = (async () => { const t = Date.now(); while (!stop && Date.now() - t < 20000) { const v = await sbx('return JSON.stringify(window.__labPicsSettle?.why?.() || null)'); tl.push([Date.now() - t, v ? Object.entries(v).filter(([, x]) => (Array.isArray(x) ? x.length : x)).map(([k, x]) => (k === 'held' ? `held(${JSON.stringify(x)})` : k)).join('+') || '-' : '?']); await wait(150); } })();
  const t1 = await turn(C.id, mcp([['three_model', { op: 'add', file: `${DIR}/car2/car.gltf` }], ['three_screenshot', { force: true }]]));
  stop = true; await watch;
  R.info.pageTimeline = tl.filter((x, i) => i === 0 || x[1] !== tl[i - 1][1]).map((x) => `${x[0]}:${x[1]}`).join(' ');
  ChatScenes.linkGuest(t1.chatId, 'lc102a');
  const after = ST();
  const added = ThreeLab.refAdded();
  const ref = ThreeLab.refsOf('lc102a').filter((r) => r.name === 'car.gltf').at(-1);
  const busy = await sbx('return JSON.stringify({ busy: window.__labPicsSettle?.busy?.() ?? null, why: window.__labPicsSettle?.why?.() ?? null, mt: window.__labModelTex?.state?.() || null })');
  R.info.claudeModel = { last: ThreeDirector.settled?.().last || null, lines: t1.lines.join(' | ').slice(0, 300), files: added?.files, ref: ref ? { files: ref.files } : null, settle: { asked: after.asked - before.asked, waited: after.waited - before.waited, ms: after.ms - before.ms, capped: after.capped - before.capped }, after: busy };
  ok(!t1.errors.length, `Claude: three_model add + three_screenshot answer without errors (${R.info.claudeModel.lines})`);
  ok(ref?.files === 4 && !(ref.missing || []).length, `Claude: the .gltf copied with every file (${ref?.files} files)`);
  const told = /Some textures were still lo/.test(t1.lines.join(" ")); // (the fake engine clips each line)
  ok(after.asked > before.asked && (busy?.busy === false || told), `Claude: its screenshot waited for the model's pictures, or says they were still loading (${JSON.stringify(R.info.claudeModel.settle)}; still going up after: ${busy?.busy}; said: ${told})`);
  // (round 102 follow-up) the 6 s cap holds when no gap ever comes: a 🧊 model layer added with the gaps stalled
  // (__labWarmGap.set({ stall: true }), a check knob) is released at the cap by its timer, and draws
  await sbx('window.__labWarmGap.set({ stall: true }); return 1');
  const c0 = await sbx('return JSON.stringify(window.__labWarmGap.state())');
  const tc = Date.now();
  await HubBridge.call('three_model', { op: 'add', file: `${DIR}/chair/chair.obj` }, { chatId: t1.chatId });
  const c1 = await until(async () => { const v = await sbx('return JSON.stringify(window.__labWarmGap.state())'); return v && v.done > c0.done && v.waiting === 0 ? v : null; }, 20000, 200);
  await sbx('window.__labWarmGap.set({ stall: false }); return 1');
  const drawn = await until(() => !ThreeLab.director.building(), 8000);
  R.info.cap = { ms: Date.now() - tc, held: c1 ? c1.held - c0.held : null, capped: c1 ? c1.capped - c0.capped : null, gaps: c1 ? c1.gaps - c0.gaps : null, last: c1?.last || null };
  ok(c1 && c1.held > c0.held && c1.capped > c0.capped && c1.gaps === c0.gaps, `a held 🧊 layer with no gap at all is let go by the cap (${JSON.stringify(R.info.cap)})`);
  ok(c1?.last?.ms <= 6000 + 1500, `…within the cap (held ${c1?.last?.ms} ms, cap 6000)`);
  ok(drawn, '…and it draws (no layer still building)');
  // Astra (Codex path): an .obj + .mtl into scene B, backstage, then its screenshot; and its ▶ Apply backstage
  await Commands.tryRun('/astra-tools on', AS.id, null, { say: () => {}, note: () => {} });
  ok(await until(() => H.agent('astra').threeTools, 5000), 'Astra has the Lab tools');
  activate(AS.id); await wait(300);
  const a0 = await turn(AS.id, 'hello astra');
  ChatScenes.linkGuest(a0.chatId, 'lc102b');
  const a1 = await turn(AS.id, mcp([['three_model', { op: 'add', file: `${DIR}/chair/chair.obj` }], ['three_screenshot', { force: true }]]));
  const aref = ThreeLab.refsOf('lc102b').find((r) => r.name === 'chair.obj');
  R.info.astraModel = { lines: a1.lines.join(' | ').slice(0, 300), ref: aref ? { files: aref.files, missing: aref.missing || [] } : null, onScreen: S().currentId() };
  ok(!a1.errors.length, `Astra: three_model add + three_screenshot backstage, no errors (${R.info.astraModel.lines})`);
  ok(aref?.files === 3 && !(aref.missing || []).length, `Astra: the .obj copied with its .mtl and picture into scene B (${aref?.files} files)`);
  ok(S().currentId() === 'lc102a', 'Astra\'s scene B stayed backstage');
  await turn(AS.id, 'layercode please');
  applyBtn(AS.id)?.click();
  await clickMenu(/Replace “Ring”|Replace another layer/);
  if (menuButtons().some((b) => /Replace “Ring”/.test(b.textContent))) await clickMenu(/Replace “Ring”/);
  const an = await until(() => /Applied to/.test(noteOf(AS.id)?.textContent || '') && noteOf(AS.id), 30000);
  const bRing = S().layersOf(S().get('lc102b')).find((L) => L.name === 'Ring')?.code || '';
  ok(an && /Chat B/.test(an.textContent) && bRing.includes('#33ff99'), `Astra: ▶ Apply lands in its scene B backstage (${(an?.textContent || '').slice(0, 80)})`);
  ok([...(an?.querySelectorAll('.note-acts button') || [])].some((b) => /Tell Astra/.test(b.textContent)), 'Astra: "Tell Astra what happened"');
  R.info.aiErrors = HubBridge.log().filter((e) => e.error).map((e) => `${e.tool}: ${String(e.error).slice(0, 100)}`).slice(-6);
  ok(HubBridge.log().filter((e) => e.error).every((e) => !/undefined|TypeError: |at \w+ \(/.test(e.error)), 'every error an AI got is a sentence');
} catch (err) { R.fails.push(`model: threw ${err.stack || err}`); }
for (const k of ['lc102.out', 'lc102.dir', 'lazy.hold', 'lazy.lab.mode']) localStorage.removeItem(k);
return JSON.stringify({ pass: R.fails.length === 0, fails: R.fails, info: R.info, ok: R.ok.length, passed: R.ok }, null, 1);
