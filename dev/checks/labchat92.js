// (round 92, labchat92) The AI chat and the Lab working together, by clicks, with the fake engines making real Lab MCP
// calls (bundled starter-style scenes made here; no owner data). Each flow of docs/upgrades/labchat92.md:
//   1. a chat started from the Lab (⋯ Sketch › More › Ask Claude about this layer; the console's Ask to fix while
//      Claude's open chat works on another scene): linked to the scene it came from, its draft names the scene, its
//      layers and the selected one; its AI's Lab calls reach that scene
//   2. a reply's code block: ▶ Apply to scene › Replace "Ring" → the layer runs it; the chat says what happened
//      (no errors, its console line); ↶ Undo; "Tell Claude what happened" sends a short message (only on the click);
//      a broken block: its error in the note, "Send the error to Claude"; Add it as a new layer; the chat's scene
//      backstage (another scene on screen): it lands in the chat's scene; a layer typed in after the reply asks first
//   3. a scene error (a syntax error put in by another hand): the chat's note says "a syntax error on line 2", one
//      click sends it with the code around it
//   4. the owner typing while the AI edits: an AI edit to another layer doesn't take the owner's editor (their keys
//      stay in their layer); an AI edit to the layer they type in keeps their cursor; a whole-layer rewrite that
//      hasn't seen their typing is refused in words (nothing changed), and works once the AI read the layer
//   5. many quick AI edits (8 in one reply) while the owner types: all land, the owner's text stays, hot runs counted
//   6. switching scenes on screen while a reply works: its edit lands in the chat's own scene
//   7. what a chat sends about the scene per message (an echo turn), the scene line's size, a layers call's tokens
//   8. the same Apply + typing guard from an Astra chat (Codex path)
//   node dev/smoke.js --fake-engines --wait 5000 --check-timeout 900000 --script dev/checks/labchat92.js --shot /tmp/labchat92.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
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
const S = () => ThreeLab.scenes;
const A = 's92a'; const B = 's92b';
const layersIn = (id) => S().layersOf(S().get(id));
const codeIn = (id, name) => layersIn(id).find((L) => L.name === name)?.code || '';
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const type = async (text, gap = 20) => { for (const ch of text) { await cdp('Input.insertText', { text: ch }); await wait(gap); } };
const menuButtons = () => [...document.querySelectorAll('#menu button, #menu-fly button, .lab-pop button.menu-item')].filter((b) => b.offsetParent && !b.disabled);
const clickMenu = async (re) => { const b = await until(() => menuButtons().find((x) => re.test(x.textContent)), 5000); b?.click(); await wait(250); return Boolean(b); };
const escape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const mcp = (calls) => `mcp please\nmcp: ${JSON.stringify(calls)}`;
async function turn(agentId, text, ms = 150000) {
  const t0 = Date.now();
  await Native.send(agentId, text);
  await wait(400);
  const chatId = H.activeChat[agentId];
  await until(() => !Native.isBusy(chatId), ms);
  await wait(300);
  const chat = await Native.load(chatId);
  const m = chat.messages.at(-1);
  const lines = (String(m?.text || '').split('MCP calls:')[1] || '').split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  return { chatId, m, lines, ms: Date.now() - t0, errors: lines.filter((l) => /^[\w]+: ERROR/.test(l)) };
}
const noteOf = (agentId, id) => Native.view(agentId)?.list.querySelector(`.msg.note[data-note-id="${id}"]`) || null;
const noteBtn = (agentId, id, re) => [...(noteOf(agentId, id)?.querySelectorAll('.note-acts button') || [])].find((b) => re.test(b.textContent));
const lastUser = async (chatId) => (await Native.load(chatId)).messages.filter((m) => m.role === 'user').at(-1)?.text || '';
const applyBtn = (agentId) => [...(Native.view(agentId)?.list.querySelectorAll('.msg pre .code-act') || [])].filter((b) => /Apply to scene/.test(b.textContent)).at(-1);
// ▶ Apply to scene › Replace "name" (straight, or under Replace another layer)
async function applyTo(agentId, name) {
  applyBtn(agentId)?.click();
  const direct = await until(() => menuButtons().find((b) => b.textContent.includes(`Replace “${name}”`) || /Replace another layer/.test(b.textContent)), 5000);
  if (!direct) return false;
  if (direct.textContent.includes(`Replace “${name}”`)) { direct.click(); await wait(250); return true; }
  direct.click(); await wait(250);
  return clickMenu(new RegExp(`Replace “${name}”`));
}
const editorTa = () => [...document.querySelectorAll('.three-split textarea')].find((x) => x.offsetParent);
const shot = async (name) => { if (window.__shots) await smoke({ shot: `${window.__shots}-${name}.png` }); };

try {
  const C = H.agent('claude'); const AS = H.agent('astra');
  ok(C && AS, 'the default Claude and Astra agents');
  C.threeTools = true; await saveConfig(); await wait(500);
  const prev = (await window.hub.kvGet('three-sketches', null)) || [];
  const mk = (id, name, color) => ({ id, name, code: LAYER('Base', color), updatedAt: Date.now(), layers: [{ id: `${id}L1`, name: 'Base', code: LAYER('Base', color), visible: true, opacity: 1, blend: 'normal', slot: 0 }, { id: `${id}L2`, name: 'Ring', code: LAYER('Ring', '#ffffff'), visible: true, opacity: 1, blend: 'normal', slot: 1 }] });
  await window.hub.kvSet('three-sketches', [...prev.filter((x) => x.id !== A && x.id !== B), mk(A, 'Chat A', '#ff3d7f'), mk(B, 'Chat B', '#56c6ff')]);
  store.set('three.current', A);
  const c = await ThreeLab.cmd();
  await until(() => S().currentId() === A, 10000); await wait(2500);
  ok(await until(() => typeof LabChatLink !== 'undefined' && typeof LabChatCore !== 'undefined', 5000), 'the chat ↔ Lab glue loads with the Lab');
  const d = ThreeLab.director;

  // ---------- 1. a chat started from the Lab ----------
  // Claude's open chat works on scene B; the owner asks from scene A's Lab
  activate(C.id); await wait(300);
  const pre = await turn(C.id, 'hello there');
  ChatScenes.linkGuest(pre.chatId, B);
  activate('tool:three'); await wait(400);
  d.selectLayer('Ring'); await wait(200);
  const lab = H.surfaces.get('tool:three')?.el;
  const sketchBtn = [...lab.querySelectorAll('button')].find((b) => /^Sketch ▾/.test(b.textContent.trim()) && b.offsetParent);
  ok(sketchBtn, 'the Lab\'s Sketch ▾ button');
  sketchBtn?.click(); await wait(300);
  ok(await clickMenu(/^More/), 'Sketch ▾ › More');
  ok(await clickMenu(/Ask Claude about this layer/), '… › Ask Claude about this layer');
  await wait(500);
  const draft = Native.view(C.id)?.input.value || '';
  out.fromLab = { draft: draft.split('\n')[0], chars: draft.length, newChat: H.activeChat[C.id] !== pre.chatId };
  ok(!/import \* as THREE/.test(draft), `a Claude with the Lab's tools isn't sent the layer's whole code in the draft (${draft.length} characters)`);
  ok(out.fromLab.newChat, 'Ask Claude about this layer starts a new chat (the one on scene B is left alone)');
  ok(/^\[Lab scene "Chat A" · layers, bottom first \(\* = selected\): Base, Ring\*\]/.test(draft), `its draft names the scene, the layers and the selected one (${out.fromLab.draft})`);
  out.sceneLineTokens = Math.ceil(out.fromLab.draft.length / 4);
  ok(ChatScenes.linkOf(pre.chatId) === B, 'the chat on scene B still works on B');
  // the owner sends it (with a Lab call): the new chat is linked to A and its call reaches A even from the chat view
  Native.setDraft(C.id, `${draft}\n${mcp([['three_do', { cmd: 'layers' }]])}`);
  const t1 = await turn(C.id, Native.view(C.id).input.value);
  Native.setDraft(C.id, '');
  const askChat = t1.chatId;
  out.fromLab.link = ChatScenes.linkOf(askChat);
  ok(out.fromLab.link === A, `the chat started from the Lab is linked to its scene (${out.fromLab.link})`);
  ok(!t1.errors.length && /Chat A/.test(t1.lines.join(' ')), `its AI's Lab call reached "Chat A" (${t1.lines.join(' | ').slice(0, 160)})`);
  // the console's "Ask director to fix" while Claude's open chat is on scene B
  activate(C.id); Native.open(C.id, pre.chatId); await wait(300); activate('tool:three'); await wait(300);
  await HubBridge.call('three_update_layer', { layer: 'Ring', code: 'import * as THREE from "three";\nconsole.warn("ring92 broke");\n' }, { chatId: askChat });
  await wait(1500);
  const fixBtn = lab.querySelector('.tc-fix');
  c.console?.(true); await wait(200);
  fixBtn?.click(); await wait(600);
  out.fix = { chat: H.activeChat[C.id], draft: (Native.view(C.id)?.input.value || '').slice(0, 90) };
  ok(out.fix.chat !== pre.chatId, `"Ask director to fix" from scene A doesn't land in the chat working on scene B (${out.fix.chat === pre.chatId ? 'it did' : 'new chat'})`);
  ok(/Chat A/.test(out.fix.draft), `…its draft is about scene A (${out.fix.draft})`);
  Native.setDraft(C.id, '');
  await HubBridge.call('three_update_layer', { layer: 'Ring', code: LAYER('Ring', '#ffffff') }, { chatId: askChat });
  activate(C.id); Native.open(C.id, askChat); await wait(400);

  // ---------- 7. what a chat sends about the scene each message ----------
  const e1 = await turn(C.id, 'echo hello one');
  const e2 = await turn(C.id, 'echo hello two');
  out.cost = { echoOne: e1.m.text.length, echoTwo: e2.m.text.length, sceneLineTokens: out.sceneLineTokens };
  ok(e1.m.text.trim() === 'echo hello one' && e2.m.text.trim() === 'echo hello two', `a linked chat's messages carry nothing extra about the scene (${e2.m.text.length} characters)`);
  const lay = HubBridge.log().filter((e) => e.tool === 'three_layers' || (e.tool === 'three_do')).at(-1);
  out.cost.layersCallTokens = lay?.tokens ?? null;

  // ---------- 2. a reply's code: ▶ Apply to scene ----------
  activate(C.id); await wait(200);
  const r1 = await turn(C.id, 'layercode please');
  await wait(400);
  let ab = applyBtn(C.id);
  ok(ab, 'a whole-layer code block shows ▶ Apply to scene');
  const scenesBefore = S().all().length;
  ok(await applyTo(C.id, 'Ring'), '▶ Apply › Replace “Ring”');
  const n1 = await until(() => noteOf(C.id, 'lab-apply'), 15000);
  out.apply = { note: n1?.textContent.slice(0, 160) || null };
  ok(codeIn(A, 'Ring').includes("'#33ff99'"), 'the reply\'s code is the layer "Ring" now');
  ok(S().all().length === scenesBefore, 'no new sketch was made');
  ok(/Applied to Ring in Chat A:\s*it runs with no errors/.test(n1?.textContent || ''), `the chat says what happened (${out.apply.note})`);
  ok(/applied92 ready/.test(n1?.textContent || ''), 'the note carries the layer\'s console line');
  const before = await lastUser(r1.chatId);
  ok(before === 'layercode please', 'nothing was sent to the AI by the apply');
  await shot('applied');
  noteBtn(C.id, 'lab-apply', /Undo/)?.click();
  ok(await until(() => /Undone/.test(noteOf(C.id, 'lab-apply')?.textContent || ''), 10000), '↶ Undo says it\'s undone');
  ok(codeIn(A, 'Ring').includes("'#ffffff'") && !codeIn(A, 'Ring').includes('#33ff99'), '↶ Undo put "Ring" back');
  // apply again, then tell the AI (one click)
  await applyTo(C.id, 'Ring');
  await until(() => /Applied/.test(noteOf(C.id, 'lab-apply')?.textContent || ''), 15000);
  noteBtn(C.id, 'lab-apply', /Tell Claude what happened/)?.click();
  await wait(600);
  await until(() => !Native.isBusy(r1.chatId), 60000);
  out.apply.told = (await lastUser(r1.chatId)).slice(0, 200);
  ok(/replaced the layer "Ring" in the Lab scene "Chat A"/.test(out.apply.told) && /no errors/.test(out.apply.told) && /applied92 ready/.test(out.apply.told), `"Tell Claude what happened" sends what happened (${out.apply.told})`);
  ok(!/import \* as THREE/.test(out.apply.told), '…without resending the code');
  // a broken block
  const r2 = await turn(C.id, 'layercode-bad please');
  await wait(400);
  await applyTo(C.id, 'Ring');
  const n2 = await until(() => /error/.test(noteOf(C.id, 'lab-apply')?.textContent || '') && noteOf(C.id, 'lab-apply'), 15000);
  out.applyBad = n2?.textContent.slice(0, 200) || null;
  ok(/1 error: SyntaxError/.test(out.applyBad || ''), `a broken block: its error in the chat (${out.applyBad})`);
  ok(noteBtn(C.id, 'lab-apply', /Send the error to Claude/), '…with "Send the error to Claude"');
  noteBtn(C.id, 'lab-apply', /Send the error to Claude/)?.click();
  await wait(600); await until(() => !Native.isBusy(r2.chatId), 60000);
  const sentErr = await lastUser(r2.chatId);
  ok(/SyntaxError/.test(sentErr) && /Please fix it/.test(sentErr), `one click sends the error (${sentErr.slice(0, 120)})`);
  await HubBridge.call('three_update_layer', { layer: 'Ring', code: LAYER('Ring', '#ffffff') }, { chatId: r2.chatId }); // (the AI's fix)
  await wait(800);
  // add as a new layer
  const r3 = await turn(C.id, 'layercode please');
  await wait(300);
  const nL = layersIn(A).length;
  applyBtn(C.id)?.click(); await clickMenu(/Add it as a new layer/);
  await until(() => /Added/.test(noteOf(C.id, 'lab-apply')?.textContent || ''), 15000);
  ok(layersIn(A).length === nL + 1 && layersIn(A).at(-1).code.includes('#33ff99'), 'Add it as a new layer adds it on top');
  noteBtn(C.id, 'lab-apply', /Undo/)?.click();
  await until(() => layersIn(A).length === nL, 10000);
  ok(layersIn(A).length === nL, '↶ Undo takes the added layer out');
  // the chat's scene backstage: the Lab shows B, the apply lands in A
  await S().open(B); await wait(1500);
  activate(C.id); await wait(300);
  await applyTo(C.id, 'Ring');
  await until(() => /Applied/.test(noteOf(C.id, 'lab-apply')?.textContent || ''), 15000);
  ok(codeIn(A, 'Ring').includes('#33ff99') && !codeIn(B, 'Ring').includes('#33ff99'), 'backstage: the apply landed in the chat\'s scene, not the one on screen');
  noteBtn(C.id, 'lab-apply', /Undo/)?.click(); await until(() => codeIn(A, 'Ring').includes('#ffffff'), 10000);
  await S().open(A); await wait(1500);
  // the owner typed in "Ring" after the reply: Apply asks first; Cancel changes nothing
  activate('tool:three'); await wait(300);
  c.code(true); await wait(800);
  d.selectLayer('Ring'); await wait(300);
  let ta = editorTa(); ta.focus(); ta.setSelectionRange(20, 20);
  await type('/*mine*/');
  activate(C.id); await wait(300);
  applyBtn(C.id)?.click(); await clickMenu(/Replace “Ring” \(the selected layer\)/);
  const dlg = await until(() => [...document.querySelectorAll('dialog[open]')].find((x) => /by hand after this reply/.test(x.textContent)), 5000);
  ok(dlg, 'a layer typed in after the reply: Apply asks first');
  [...(dlg?.querySelectorAll('button') || [])].find((b) => /Cancel/.test(b.textContent))?.click();
  await wait(600);
  ok(codeIn(A, 'Ring').includes('/*mine*/') && !codeIn(A, 'Ring').includes('#33ff99'), '…Cancel: the owner\'s typing stays, nothing applied');
  activate('tool:three'); await wait(200); editorTa()?.blur();
  await HubBridge.call('three_read_code', { layer: 'Ring', force: true }, { chatId: askChat });
  await HubBridge.call('three_update_layer', { layer: 'Ring', code: LAYER('Ring', '#ffffff') }, { chatId: askChat });
  activate(C.id); await wait(300);

  // ---------- 3. a scene error in the chat ----------
  await HubBridge.call('three_update_layer', { layer: 'Base', code: 'import * as THREE from "three";\nconst x = ;\n' }, { chatId: askChat });
  activate(C.id); await wait(1500);
  LabHealth.paintChat(askChat);
  const hn = await until(() => noteOf(C.id, 'scene-health'), 8000);
  out.health = hn?.textContent.slice(0, 120) || null;
  ok(/a syntax error/.test(out.health || ''), `a syntax error shows in the chat in words (${out.health})`);
  const fixB = [...(hn?.querySelectorAll('.note-acts button') || [])].find((b) => /Ask Claude to fix/.test(b.textContent));
  ok(fixB, '…with Ask Claude to fix');
  fixB?.click(); await wait(600); await until(() => !Native.isBusy(askChat), 60000);
  const fixMsg = await lastUser(askChat);
  ok(/SyntaxError/.test(fixMsg) && /const x = ;/.test(fixMsg), `one click sends the error and the code around it (${fixMsg.slice(0, 100)})`);
  await HubBridge.call('three_update_layer', { layer: 'Base', code: LAYER('Base', '#ff3d7f') }, { chatId: askChat });

  // ---------- 4. the owner typing while the AI edits ----------
  activate('tool:three'); await wait(300);
  d.selectLayer('Base'); await wait(300);
  ta = editorTa(); ta.focus(); ta.setSelectionRange(40, 40);
  await type('/*hand*/');
  const tRing = Native.send(C.id, mcp([['three_edit_code', { layer: 'Ring', edits: [{ find: "'#ffffff'", replace: "'#eeeeee'" }] }]]));
  await until(() => HubBridge.log().some((e) => e.tool === 'three_edit_code' && e.running), 30000);
  ta.focus();
  await type('/*more*/', 60);
  await tRing; await until(() => !Native.isBusy(askChat), 60000); await wait(500);
  out.typing = { selected: d.layers().selected, baseMore: codeIn(A, 'Base').includes('/*more*/'), ringMore: codeIn(A, 'Ring').includes('/*more*/'), ringEdited: codeIn(A, 'Ring').includes('#eeeeee') };
  ok(out.typing.ringEdited, 'the AI\'s edit to "Ring" landed');
  ok(out.typing.selected === 'Base', `the owner's editor stayed on "Base" while they typed (${out.typing.selected})`);
  ok(out.typing.baseMore && !out.typing.ringMore, 'the owner\'s keys stayed in "Base" (none landed in "Ring")');
  // an AI edit to the layer being typed in keeps the cursor
  ta.focus(); const at0 = codeIn(A, 'Base').indexOf('/*more*/') + 8; ta.setSelectionRange(at0, at0);
  await type('X');
  const tEdit = await turn(C.id, mcp([['three_edit_code', { layer: 'Base', edits: [{ find: "'#ff3d7f'", replace: "'#ff3d80'" }] }]]));
  out.caret = { at: ta.selectionStart, want: codeIn(A, 'Base').indexOf('/*more*/X') + 9, len: ta.value.length };
  ok(!tEdit.errors.length && codeIn(A, 'Base').includes('#ff3d80'), 'the AI\'s edit to the layer being typed in landed');
  ok(document.activeElement === ta && out.caret.at === out.caret.want, `the owner's cursor stayed after their last key (${out.caret.at} / ${out.caret.want})`);
  // a whole-layer rewrite that hasn't seen the owner's typing: refused in words; after a read it works
  ta.focus(); await type('/*keep*/');
  const tw = await turn(C.id, mcp([['three_update_layer', { layer: 'Base', code: LAYER('Base', '#123456') }]]));
  out.rewrite = tw.lines.join(' | ').slice(0, 260);
  ok(tw.errors.length === 1 && /editing "Base" by hand/.test(out.rewrite), `a stale whole-layer rewrite is refused in words (${out.rewrite})`);
  ok(codeIn(A, 'Base').includes('/*keep*/') && !codeIn(A, 'Base').includes('#123456'), '…the owner\'s typing stays');
  ta.blur();
  const tw2 = await turn(C.id, mcp([['three_read_code', { layer: 'Base', force: true }], ['three_update_layer', { layer: 'Base', code: LAYER('Base', '#123456') }]]));
  ok(!tw2.errors.length && codeIn(A, 'Base').includes('#123456'), `after reading it, the rewrite goes through (${tw2.errors.join(' | ')})`);

  // ---------- 5. many quick AI edits while the owner types ----------
  d.selectLayer('Base'); await wait(300);
  const runs0 = ThreeLab.live.counts();
  const edits = Array.from({ length: 8 }, (_, i) => ['three_edit_code', { layer: 'Ring', edits: [{ find: `size: { value: ${i === 0 ? 1 : (1 + i / 10).toFixed(1)},`, replace: `size: { value: ${(1 + (i + 1) / 10).toFixed(1)},` }] }]);
  ta = editorTa(); ta.focus(); ta.setSelectionRange(5, 5);
  const tMany = Native.send(C.id, mcp(edits));
  const t0 = Date.now();
  await until(() => HubBridge.log().some((e) => e.tool === 'three_edit_code' && e.running), 30000);
  ta.focus(); await type('/*busy*/', 120);
  await tMany; await until(() => !Native.isBusy(askChat), 120000); await wait(300);
  const runs1 = ThreeLab.live.counts();
  const callMs = HubBridge.log().filter((e) => e.tool === 'three_edit_code' && e.chatId === askChat).slice(-8).map((e) => e.ms).sort((x, y) => x - y);
  out.many = { ms: Date.now() - t0, medianCallMs: callMs[4], hotRuns: (runs1.sent?.['preview hot-layer'] || 0) - (runs0.sent?.['preview hot-layer'] || 0), ringSize: /size: \{ value: ([\d.]+),/.exec(codeIn(A, 'Ring'))?.[1], busy: codeIn(A, 'Base').includes('/*busy*/'), selected: d.layers().selected };
  ok(out.many.ringSize === '1.8', `all 8 quick edits landed (${out.many.ringSize})`);
  ok(out.many.busy && out.many.selected === 'Base', 'the owner\'s typing during them stayed in their layer');
  ta.blur();

  // ---------- 6. switching scenes on screen while a reply works ----------
  const tSw = Native.send(C.id, mcp([['three_eval', { code: "await new Promise((r) => setTimeout(r, 2500)); return 'waited';" }], ['three_edit_code', { layer: 'Ring', edits: [{ find: "'#eeeeee'", replace: "'#dddddd'" }] }]]));
  await until(() => HubBridge.log().some((e) => e.tool === 'three_eval' && e.running), 30000);
  await S().open(B);
  await tSw; await until(() => !Native.isBusy(askChat), 60000); await wait(400);
  out.switch = { a: codeIn(A, 'Ring').includes('#dddddd'), b: codeIn(B, 'Ring').includes('#dddddd'), onScreen: S().currentId() };
  ok(out.switch.a && !out.switch.b, `a reply working while the owner switched scenes lands in its own scene (A: ${out.switch.a}, B: ${out.switch.b})`);
  await S().open(A); await wait(1200);

  // ---------- 8. Astra (Codex path) ----------
  await Commands.tryRun('/astra-tools on', AS.id, null, { say: () => {}, note: () => {} });
  ok(await until(() => H.agent('astra').threeTools, 5000), 'Astra has the Lab tools');
  activate(AS.id); await wait(300);
  const a0 = await turn(AS.id, 'hello astra');
  ChatScenes.linkGuest(a0.chatId, A);
  const a1 = await turn(AS.id, 'layercode please');
  await wait(400);
  await applyTo(AS.id, 'Ring');
  const an = await until(() => /Applied/.test(noteOf(AS.id, 'lab-apply')?.textContent || '') && noteOf(AS.id, 'lab-apply'), 15000);
  ok(an && codeIn(A, 'Ring').includes('#33ff99'), `Astra: ▶ Apply works the same (${an?.textContent.slice(0, 80)})`);
  ok(noteBtn(AS.id, 'lab-apply', /Tell Astra what happened/), 'Astra: "Tell Astra what happened"');
  noteBtn(AS.id, 'lab-apply', /Tell Astra/)?.click();
  await wait(600); await until(() => !Native.isBusy(a1.chatId), 60000);
  ok(/replaced the layer "Ring"/.test(await lastUser(a1.chatId)), 'Astra: the click sends what happened');
  activate('tool:three'); await wait(300);
  d.selectLayer('Ring'); await wait(200);
  ta = editorTa(); ta.focus(); ta.setSelectionRange(10, 10); await type('/*astra-keep*/');
  activate(AS.id); await wait(200);
  const aw = await turn(AS.id, mcp([['three_update_layer', { layer: 'Ring', code: LAYER('Ring', '#abcdef') }]]));
  ok(/editing "Ring" by hand/.test(aw.lines.join(' ')) && codeIn(A, 'Ring').includes('/*astra-keep*/'), `Astra: a stale rewrite is refused the same way (${aw.lines.join(' | ').slice(0, 140)})`);
  ta.blur();
  out.stats = { link: LabChatLink.stats, aiErrors: HubBridge.log().filter((e) => e.error).map((e) => `${e.tool}: ${String(e.error).slice(0, 80)}`).slice(-6) };
  ok(HubBridge.log().filter((e) => e.error).every((e) => !/undefined|TypeError: |at \w+ \(/.test(e.error)), 'every error an AI got is a sentence');
  await shot('end');
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
