// (round 72, labbridge72) A plain Claude chat and a plain Astra chat working on Lab scenes, end to end: the fake engines
// make REAL tool calls through the Lab's MCP server (list layers, read a layer's code, move a slider, add a layer, edit
// it and undo, put a file the owner dropped in the chat into the scene, take a screenshot). The matrix: the Lab not
// loaded yet (scene linked before the Lab is in), the scene backstage, the scene on screen, a chat with no scene (its
// error in words + "Link this chat to a scene" by click), a project's chat (its project's scene, not the one on screen),
// two chats on one scene at once, the preview reloading mid-call. Every call must land on the chat's own scene, never
// on the one on screen by accident; attachments (picture, GLB, video) land in that scene; errors come back in words.
//   node dev/smoke.js --fake-engines --wait 5000 --check-timeout 900000 --script dev/checks/labbridge72.js --shot /tmp/labbridge72.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const A_ID = 's72a'; const B_ID = 's72b';
const LAYER = (name, color) => `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: 'Size' }, color: { value: '${color}', label: 'Color' }, spin: [0.4, -2, 2] });
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
const mesh = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 16, 96), new THREE.MeshBasicMaterial({ color: P.color }));
mesh.name = ${JSON.stringify(name)};
scene.add(mesh);
renderer.setAnimationLoop((now) => { mesh.rotation.z = now / 1000 * P.spin; mesh.scale.setScalar(P.size); renderer.render(scene, camera); });`;
const S = () => ThreeLab.scenes;
const layersOf = (id) => S().layersOf(S().get(id)).map((L) => L.name);
const layerCode = (id, name) => S().layersOf(S().get(id)).find((L) => L.name === name)?.code || '';
const refsOf = (id) => ThreeLab.refsOf(id).map((r) => r.name);
// a turn: send, wait for the reply, its "MCP calls" lines (the fake engines list each call and its result)
async function turn(agentId, text, ms = 150000) {
  await Native.send(agentId, text);
  await wait(400);
  const chatId = H.activeChat[agentId];
  const t0 = Date.now();
  await until(() => !Native.isBusy(chatId), ms);
  await wait(300);
  const chat = await Native.load(chatId);
  const m = chat.messages.at(-1);
  const lines = (String(m?.text || '').split('MCP calls:')[1] || '').split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)).filter((l) => !/^(servers|server) /.test(l));
  return { chatId, m, lines, ms: Date.now() - t0, errors: lines.filter((l) => /^[\w]+: ERROR/.test(l)) };
}
// the owner drops a file in a chat (the chat box's drop: Native.addPath)
async function drop(agentId, name, b64) { const p = await window.hub.saveAttachment(name, b64); await Native.addPath(agentId, p); return p; }
function pngB64(color) { const c = document.createElement('canvas'); c.width = 48; c.height = 32; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 48, 32); return c.toDataURL('image/png').split(',')[1]; }
const junk = (n) => btoa('glTF'.padEnd(n, 'x'));
// the Lab's everyday calls in one turn; "@@ATTACHED@@" is the first file path the prompt lists (what the AI copies)
const FULL = (tag, color) => `mcp please\nmcp: ${JSON.stringify([
  ['three_do', { cmd: 'layers' }],
  ['three_read_code', { layer: 'Base' }],
  ['three_sliders', { layer: 'Base', set: { size: 2.2 } }],
  ['three_add_layer', { name: `Ring ${tag}`, code: LAYER(`Ring ${tag}`, color) }],
  ['three_edit_code', { layer: `Ring ${tag}`, edits: [{ find: 'spin: [0.4', replace: 'spin: [1.6' }] }],
  ['three_do', { cmd: 'undo' }],
  ['three_do', { cmd: 'references', action: 'add', path: '@@ATTACHED@@' }],
  ['three_screenshot', { size: 'small' }],
])}`;
const chipOf = (agentId) => Native.view(agentId)?.form.querySelector('.scene-link-chip');
const menuButtons = () => [...document.querySelectorAll('#menu button, #menu-fly button')].filter((b) => b.offsetParent);
const clickMenu = async (re) => { const b = await until(() => menuButtons().find((x) => re.test(x.textContent)), 4000); b?.click(); return Boolean(b); };
const shot = async (name) => { if (window.__shots) await smoke({ shot: `${window.__shots}-${name}.png` }); };

try {
  const C = H.agent('claude'); const AS = H.agent('astra');
  ok(C && AS, 'the default Claude and Astra agents');
  // a plain Claude chat with the Lab's tools (Settings › its tools › Three.js Lab) and a plain Astra with them (/astra-tools on)
  C.threeTools = true; await saveConfig(); await wait(600);
  await Commands.tryRun('/astra-tools on', AS.id, null, { say: () => {}, note: () => {} });
  ok(await until(() => H.agent('astra').threeTools, 5000), 'Astra has the Lab tools');

  // ---------- the Lab not loaded yet: two scenes on disk, the chat linked to one before the Lab reads them ----------
  out.labAtStart = typeof ThreeLab !== 'undefined' && Boolean(ThreeLab.scenes);
  ok(!out.labAtStart, 'the Lab is not loaded at the start (else this case tests nothing)');
  const prev = (await window.hub.kvGet('three-sketches', null)) || [];
  const mk = (id, name, color) => ({ id, name, code: LAYER(name, color), updatedAt: Date.now(), layers: [{ id: `${id}L1`, name: 'Base', code: LAYER(name, color), visible: true, opacity: 1, blend: 'normal', slot: 0 }] });
  await window.hub.kvSet('three-sketches', [...prev.filter((x) => x.id !== A_ID && x.id !== B_ID), mk(A_ID, 'Bridge A', '#ff3d7f'), mk(B_ID, 'Bridge B', '#56c6ff')]);
  store.set('three.current', B_ID);

  activate(C.id); await wait(400);
  const hello = await turn(C.id, 'hello there');
  const c1 = hello.chatId;
  ok(c1, 'a plain Claude chat');
  await until(() => typeof ChatScenes !== 'undefined');
  ChatScenes.linkGuest(c1, A_ID);
  await wait(300);
  out.chipBeforeLab = (await until(() => chipOf(C.id)?.textContent, 5000)) || null;
  ok(/^🔗 Scene:/.test(out.chipBeforeLab || ''), `the 🔗 Scene chip shows before the Lab is in (${out.chipBeforeLab})`);
  await drop(C.id, 'drop-one.png', pngB64('#ff3d7f'));
  const t1 = await turn(C.id, FULL('one', '#ffc23d'));
  out.notLoaded = { lines: t1.lines.map((l) => l.slice(0, 110)), ms: t1.ms, current: S()?.currentId() };
  ok(t1.lines.length >= 8 && !t1.errors.length, `Lab not loaded: every call worked (${t1.errors.join(' | ') || t1.lines.length})`);
  ok(S() && layersOf(A_ID).includes('Ring one'), `Lab not loaded: the new layer is in the chat's scene (${S() && layersOf(A_ID)})`);
  ok(S() && !layersOf(B_ID).includes('Ring one'), 'Lab not loaded: nothing landed on the scene on screen');
  ok(/spin: \[0\.4/.test(layerCode(A_ID, 'Ring one')), 'Lab not loaded: undo took the edit back');
  ok(refsOf(A_ID).some((n) => /drop-one/.test(n)), `Lab not loaded: the dropped picture is in the scene's references (${refsOf(A_ID)})`);
  ok(/size: \{ value: 2\.2/.test(layerCode(A_ID, 'Base')), 'backstage: the slider move is written into the layer (saved)');
  out.backstageScene = S()?.currentId();
  ok(out.backstageScene === B_ID, `it ran backstage (${out.backstageScene} on screen)`);
  await until(() => /Bridge A/.test(chipOf(C.id)?.textContent || ''), 4000);
  out.chip = chipOf(C.id)?.textContent;
  ok(out.chip === '🔗 Scene: Bridge A', `the chip names the scene (${out.chip})`);

  // ---------- a chat with no scene (the Lab not on screen): its error in words, the Link button by click ----------
  Native.newChat(C.id); await wait(400);
  const glbPath = await drop(C.id, 'robot72.glb', junk(256));
  const t2 = await turn(C.id, `mcp please\nmcp: ${JSON.stringify([['three_do', { cmd: 'layers' }]])}`);
  const c2 = t2.chatId;
  out.unlinked = t2.lines;
  ok(t2.errors.length === 1 && /isn't linked to a Lab scene/.test(t2.errors[0]), `an unlinked chat's call fails in words (${t2.lines})`);
  out.unlinkedSent = ((await Native.load(c2)).messages.find((m) => m.role === 'user')?.sent || '').slice(-260);
  ok(/three_do references/.test(out.unlinkedSent) && /robot72\.glb/.test(out.unlinkedSent), 'the dropped GLB stays an attachment the AI is told how to use');
  ok(!refsOf(A_ID).concat(refsOf(B_ID)).some((n) => /robot72/.test(n)), 'the GLB dropped in an unlinked chat went into no scene');
  const note = await until(() => Native.view(C.id).list.querySelector('.msg.note[data-note-id="scene-link"]'), 5000);
  ok(note, 'a note with the Link button in the chat');
  ok(chipOf(C.id)?.classList.contains('unlinked') && /Link this chat to a scene/.test(chipOf(C.id)?.textContent || ''), `the chip offers the link (${chipOf(C.id)?.textContent})`);
  await shot('unlinked');
  note?.querySelector('.note-acts button')?.click();
  out.linkMenu = (await until(() => menuButtons().map((b) => b.textContent.trim()).filter(Boolean).join(' | '), 4000)) || '';
  ok(/A fresh scene/.test(out.linkMenu) && /open in the Lab: Bridge B/.test(out.linkMenu), `the link menu (${out.linkMenu})`);
  ok(await clickMenu(/open in the Lab: Bridge B/), 'picked the scene open in the Lab');
  ok(await until(() => ChatScenes.linkOf(c2) === B_ID, 4000), 'the chat is linked by that click');
  ok(await until(() => chipOf(C.id)?.textContent === '🔗 Scene: Bridge B', 4000), `the chip follows (${chipOf(C.id)?.textContent})`);
  const t2b = await turn(C.id, `mcp please\nmcp: ${JSON.stringify([['three_do', { cmd: 'layers' }], ['three_add_layer', { name: 'Linked by click', code: LAYER('Linked by click', '#7cd992') }]])}`);
  ok(!t2b.errors.length && layersOf(B_ID).includes('Linked by click') && !layersOf(A_ID).includes('Linked by click'), `after the click its calls reach that scene (${t2b.lines.map((l) => l.slice(0, 60))})`);
  ok(ChatScenes.ownerOf(B_ID) !== c2, 'a guest link takes the scene from nobody');

  // ---------- the scene on screen (the Lab showing the chat's scene) ----------
  Native.open(C.id, c1); await wait(300);
  activate('tool:three'); await wait(300);
  S().open(A_ID);
  await until(() => S().currentId() === A_ID && ThreeLab.onScreen?.() !== false, 6000); await wait(1800);
  await drop(C.id, 'drop-two.png', pngB64('#ffc23d'));
  await drop(C.id, 'robot72.glb', junk(300));
  await drop(C.id, 'clip72.mp4', junk(512));
  out.dropsOnScreen = refsOf(A_ID);
  ok(refsOf(A_ID).some((n) => /robot72/.test(n)) && refsOf(A_ID).some((n) => /clip72/.test(n)), `a GLB and a video dropped in the chat go into ITS scene (${refsOf(A_ID)})`);
  const t3 = await turn(C.id, FULL('two', '#a970ff'));
  out.onScreen = { lines: t3.lines.map((l) => l.slice(0, 110)), ms: t3.ms };
  ok(!t3.errors.length && t3.lines.length >= 8, `on screen: every call worked (${t3.errors.join(' | ')})`);
  ok(layersOf(A_ID).includes('Ring two') && !layersOf(B_ID).includes('Ring two'), 'on screen: the layer is in the chat\'s scene');
  ok(/spin: \[0\.4/.test(layerCode(A_ID, 'Ring two')), 'on screen: undo took the edit back');
  ok(refsOf(A_ID).some((n) => /drop-two/.test(n)), 'on screen: the dropped picture is a reference of the scene');
  await shot('onscreen');

  // ---------- the scene backstage, from Astra (the Lab on screen shows another scene) ----------
  S().open(B_ID); await until(() => S().currentId() === B_ID, 5000); await wait(1200);
  activate(AS.id); await wait(500);
  const ah = await turn(AS.id, 'hello from the owner');
  const a1 = ah.chatId;
  ok(a1, 'a plain Astra chat');
  ChatScenes.linkGuest(a1, A_ID);
  activate('tool:three'); await wait(400);
  await drop(AS.id, 'drop-astra.png', pngB64('#56c6ff'));
  const t4 = await turn(AS.id, FULL('astra', '#56c6ff'));
  out.astra = { lines: t4.lines.map((l) => l.slice(0, 110)), ms: t4.ms };
  ok(!t4.errors.length && t4.lines.length >= 8, `Astra backstage: every call worked (${t4.errors.join(' | ') || t4.lines.length})`);
  ok(layersOf(A_ID).includes('Ring astra') && !layersOf(B_ID).includes('Ring astra'), 'Astra backstage: the layer is in its scene, not the one on screen');
  ok(refsOf(A_ID).some((n) => /drop-astra/.test(n)), `Astra got the dropped picture's path and put it in the scene (${refsOf(A_ID)})`);
  ok(S().currentId() === B_ID, 'the owner\'s view stayed on their scene');

  // ---------- two chats on one scene at once (Claude and Astra, backstage) ----------
  await drop(C.id, 'drop-dual-c.png', pngB64('#ff7a1a'));
  await drop(AS.id, 'drop-dual-a.png', pngB64('#c8f04a'));
  const [d1, d2] = await Promise.all([turn(C.id, FULL('dualC', '#ff7a1a')), turn(AS.id, FULL('dualA', '#c8f04a'))]);
  out.dual = { claude: d1.errors, astra: d2.errors, ms: [d1.ms, d2.ms] };
  ok(!d1.errors.length && !d2.errors.length, `two chats on one scene: no errors (${[...d1.errors, ...d2.errors].join(' | ')})`);
  ok(['Ring dualC', 'Ring dualA'].every((n) => layersOf(A_ID).includes(n)) && !layersOf(B_ID).some((n) => /dual/.test(n)), `two chats on one scene: both layers in it (${layersOf(A_ID)})`);
  ok(/spin: \[0\.4/.test(layerCode(A_ID, 'Ring dualC')) && /spin: \[0\.4/.test(layerCode(A_ID, 'Ring dualA')), 'two chats on one scene: each undo took back its own edit');

  // ---------- a project's chat: its project's scene, not the one on screen ----------
  await Lazy.load('projects'); await Projects.ready?.();
  Native.newChat(C.id); await wait(300);
  const ph = await turn(C.id, 'hello project');
  const c3 = ph.chatId;
  const P1 = Projects.create({ name: 'Bridge project' });
  Projects.add(P1, 'chat', c3, 'hello project', { links: false });
  Projects.add(P1, 'scene', A_ID, 'Bridge A', { links: false });
  Projects.setWorkspace(P1, { sceneId: A_ID, chatId: c3, plugins: [] });
  await wait(300);
  const t5 = await turn(C.id, `mcp please\nmcp: ${JSON.stringify([['three_add_layer', { name: 'Project ring', code: LAYER('Project ring', '#c9d3ff') }]])}`);
  out.project = t5.lines;
  ok(!t5.errors.length && layersOf(A_ID).includes('Project ring') && !layersOf(B_ID).includes('Project ring'), `a project's chat works on its project's scene, not the one on screen (${t5.lines})`);
  ok(ChatScenes.linkOf(c3) === A_ID && await until(() => chipOf(C.id)?.textContent === '🔗 Scene: Bridge A', 3000), `its chip names it (${chipOf(C.id)?.textContent})`);
  // linked by hand to another project's scene: the link wins
  ChatScenes.linkGuest(c3, B_ID);
  const t6 = await turn(C.id, `mcp please\nmcp: ${JSON.stringify([['three_add_layer', { name: 'Other project ring', code: LAYER('Other project ring', '#c9d3ff') }]])}`);
  ok(!t6.errors.length && layersOf(B_ID).includes('Other project ring') && !layersOf(A_ID).includes('Other project ring'), 'a scene from another project, linked by hand: the calls go there');

  // ---------- the preview reloads in the middle of a call ----------
  Native.open(C.id, c1); activate('tool:three'); await wait(300);
  S().open(A_ID); await until(() => S().currentId() === A_ID, 5000); await wait(2000);
  const rl = Native.send(C.id, `mcp please\nmcp: ${JSON.stringify([['three_eval', { code: "await new Promise((r) => setTimeout(r, 5000)); return 'late';" }], ['three_do', { cmd: 'layers' }]])}`);
  const started = await until(() => HubBridge.log().find((e) => e.tool === 'three_eval' && e.running), 30000);
  ok(started, 'the eval call started');
  await wait(800);
  out.restarted = ThreeLab.restartVisible();
  await rl;
  await wait(400);
  await until(() => !Native.isBusy(c1), 60000);
  const ev = HubBridge.log().filter((e) => e.tool === 'three_eval').at(-1);
  out.reload = { ms: ev?.ms, ok: ev?.ok, error: ev?.error };
  ok(out.restarted, 'the preview restarted');
  ok(ev && ev.ms < 4500, `the call stuck on the reloaded page ended at once (${ev?.ms} ms)`);
  ok(ev && (ev.ok || /reloaded/.test(ev.error || '')), `…in words (${ev?.error})`);
  const after = (await Native.load(c1)).messages.at(-1);
  ok(/three_do: (?!ERROR)/.test(after?.text || ''), 'the next call in the same turn worked');

  // every Lab error the AI got today was a sentence, never a stack or "undefined"
  out.aiErrors = HubBridge.log().filter((e) => e.error).map((e) => `${e.tool}: ${e.error.slice(0, 90)}`);
  ok(out.aiErrors.every((e) => !/undefined|TypeError|ReferenceError|at \w+ \(/.test(e)), `errors in words (${out.aiErrors})`);
  // the chip's menu
  activate(C.id); await wait(300);
  chipOf(C.id)?.click();
  out.chipMenu = (await until(() => menuButtons().map((b) => b.textContent.trim()).filter(Boolean).join(' | '), 4000)) || '';
  ok(/Open “Bridge A” in the Lab/.test(out.chipMenu) && /Link to another scene/.test(out.chipMenu), `the chip's menu (${out.chipMenu})`);
  await shot('chip-menu');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
