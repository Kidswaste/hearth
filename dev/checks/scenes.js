// Per-chat scenes (chat-scenes.js, tools/three-backstage.js) with the fake engines: three Three Director chats, each
// with its own sketch; switching chats switches the Lab; a director editing its scene while another chat is on
// screen (backstage, through the real MCP path with HUB_CHAT_ID and through HubBridge.call); identity marks on the
// rows / dock / preview; /scene commands; opening another chat's sketch offers to go to that chat.
//   node dev/smoke.js --fake-engines --script dev/checks/scenes.js --wait 6000 --check-timeout 300000 --shot /tmp/scenes.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const SHOTS = window.SCENE_SHOTS || '/tmp/hearth-scenes';
const shot = (name) => smoke({ shot: `${SHOTS}/${name}.png` });
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const run = (text, id) => Commands.tryRun(text, id);
const say = async (text, id) => { let msg = ''; await Commands.tryRun(text, id, null, { say: (t) => { msg = t; }, note: (t) => { msg = t; } }); return msg; };

await run('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const agent = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director);
await wait(800);
const S = ThreeLab.scenes;
const host = H.surfaces.get('tool:three').el;
const cur = () => S.get(S.currentId());
const firstSketch = S.currentId();
step(Boolean(S && ChatScenes), 'Lab and chat scenes loaded', cur()?.name);

// 1. chat A: "New chat" opens a calm starter; the first message links it and names it after the chat
Native.newChat(agent.id);
await until(() => cur()?.name === 'New chat' && S.currentId() !== firstSketch, 8000);
step(cur()?.name === 'New chat', 'a new chat opens a fresh starter', cur()?.name);
await Native.send(agent.id, 'Scene A: calm gold mist');
await until(() => !Native.isBusy(H.activeChat[agent.id]), 30000);
const A = H.activeChat[agent.id];
const skA = ChatScenes.linkOf(A);
step(skA === S.currentId() && S.get(skA).name === 'Scene A: calm gold mist', 'chat A owns its starter, named after the chat', S.get(skA)?.name);
step(S.layersOf(S.get(skA))[0].code.includes(ChatScenes.identity(A).color), 'starter tinted with chat A\'s color', ChatScenes.identity(A));

// 2. chat B and C: their own scenes
Native.newChat(agent.id);
await until(() => cur()?.name === 'New chat', 8000);
await Native.send(agent.id, 'Scene B: violet rings');
await until(() => !Native.isBusy(H.activeChat[agent.id]), 30000);
const B = H.activeChat[agent.id];
const skB = ChatScenes.linkOf(B);
Native.newChat(agent.id);
await until(() => cur()?.name === 'New chat', 8000);
await Native.send(agent.id, 'Scene C: sky particles');
await until(() => !Native.isBusy(H.activeChat[agent.id]), 30000);
const C = H.activeChat[agent.id];
const skC = ChatScenes.linkOf(C);
step(new Set([skA, skB, skC]).size === 3 && skA && skB && skC, 'three chats, three sketches', [skA, skB, skC].map((x) => S.get(x)?.name));
const ids = [A, B, C].map((x) => ChatScenes.identity(x));
step(new Set(ids.map((x) => `${x.color}${x.glyph}`)).size === 3, 'three distinct identities', ids.map((x) => `${x.glyph} ${x.colorName}`));

// 3. switching chats switches the Lab (panel rows and Native.open)
Native.open(agent.id, A);
await until(() => S.currentId() === skA, 8000);
step(S.currentId() === skA, 'switch to A → A\'s sketch', cur()?.name);
const rowA = document.querySelector(`#chat-groups .item[data-key="${CSS.escape(A)}"]`);
step(Boolean(rowA?.querySelector('.chat-ident')), 'chat rows carry the glyph', rowA?.querySelector('.chat-ident')?.textContent);
document.querySelector(`#chat-groups .item[data-key="${CSS.escape(B)}"]`)?.click();
await until(() => S.currentId() === skB, 8000);
step(S.currentId() === skB, 'click B\'s row → B\'s sketch', cur()?.name);
// frame size follows the sketch
ThreeLab.director.setFrame('9:16');
await wait(500);
Native.open(agent.id, A);
await until(() => S.currentId() === skA, 8000);
await wait(400);
const frameA = ThreeLab.director.report().frame.id;
Native.open(agent.id, B);
await until(() => S.currentId() === skB, 8000);
await wait(400);
step(frameA !== '9:16' && ThreeLab.director.report().frame.id === '9:16', 'frame size per chat', { A: frameA, B: ThreeLab.director.report().frame.id });
const tag = host.querySelector('.scene-tag');
step(Boolean(tag) && tag.textContent.includes('Scene B') && tag.querySelectorAll('.scene-av').length === 1, 'preview tag shows the chat and its agent', tag?.textContent);
step(host.querySelector('.three-preview').classList.contains('scene-framed'), 'preview framed in the chat color');
const head = host.querySelector('.tool-dock .native-head .chat-ident');
step(head?.textContent === ChatScenes.identity(B).glyph, 'dock header glyph = chat B', head?.textContent);
await wait(1500);
await shot('1-chat-B');

// 4. the director of A edits A's scene while B is on screen (HubBridge.call as A's run would)
const bBefore = S.layersOf(S.get(skB))[0].code;
const r1 = await HubBridge.call('three_edit_code', { edits: [{ find: 'drift: { value: 0.25', replace: 'drift: { value: 1.4' }], shot: true }, { chatId: A });
step(r1.ok !== false && S.layersOf(S.get(skA))[0].code.includes('drift: { value: 1.4'), 'backstage edit lands in A\'s sketch', r1.ok === false ? r1.error : r1.value?.changed);
step(S.layersOf(S.get(skB))[0].code === bBefore && S.currentId() === skB, 'B\'s scene untouched and still on screen');
step(/Backstage/.test(r1.value?.note || ''), 'the director is told it works backstage', String(r1.value?.note || '').slice(0, 80));
const r2 = await HubBridge.call('three_screenshot', { size: 'small' }, { chatId: A });
step(r2.ok !== false && r2.images?.length === 1, 'backstage screenshot', r2.value || r2.error);
if (r2.images?.[0]) { const im = document.createElement('img'); im.src = `data:image/jpeg;base64,${r2.images[0].data}`; im.id = 'bs-shot'; Object.assign(im.style, { position: 'fixed', right: '8px', top: '60px', width: '180px', zIndex: 99999, border: '2px solid #ff3d7f' }); document.body.append(im); }
const r3 = await HubBridge.call('three_eval', { code: '[innerWidth, innerHeight, typeof THREE]' }, { chatId: A });
step(r3.ok !== false, 'backstage eval', r3.value ?? r3.error);
const r4 = await HubBridge.call('three_console', {}, { chatId: A });
step(r4.ok !== false && /fps/.test(String(r4.value?.stats || '')), 'backstage renders (fps)', r4.value?.stats);
const r5 = await HubBridge.call('three_sliders', {}, { chatId: A });
step(r5.ok === false && /on screen/.test(r5.error), 'on-screen-only tools explain themselves', r5.error?.slice(0, 90));
// the dock's undo of that edit: undone in A's sketch, the Lab stays on B
const u = await ThreeDirector.undo();
step(u?.restored === 'before' && !S.layersOf(S.get(skA))[0].code.includes('drift: { value: 1.4') && S.currentId() === skB && S.layersOf(S.get(skB))[0].code === bBefore, 'undo of a background edit stays in its scene', u?.layer);
await ThreeDirector.redo();
step(S.layersOf(S.get(skA))[0].code.includes('drift: { value: 1.4'), 'redo too');
// a jam on B: both agents on the tag
ChatScenes.setWorkers(B, ['claude', 'codex']);
await wait(50);
step(host.querySelectorAll('.scene-tag .scene-av').length === 2, 'jam: Claude and Astra on the tag', [...host.querySelectorAll('.scene-tag .scene-av')].map((x) => x.title));
await shot('2-backstage-edit');
ChatScenes.setWorkers(B, null);
document.getElementById('bs-shot')?.remove();
// no chat given (tests / old runs): the sketch on screen, as before
const r6 = await HubBridge.call('three_read_code', { from: 1, to: 3 });
step(r6.ok !== false && S.currentId() === skB, 'calls without a chat use the sketch on screen');

// 5. the real path: the fake director in chat C calls the MCP server (HUB_CHAT_ID) while A is on screen
Native.open(agent.id, C);
await until(() => S.currentId() === skC, 8000);
const calls = [['three_edit_code', { edits: [{ find: 'breathe: { value: 0.35', replace: 'breathe: { value: 1.1' }] }], ['three_screenshot', { size: 'small' }]];
await Native.send(agent.id, `think slow mcp\nmcp: ${JSON.stringify(calls)}`);
await wait(400);
Native.open(agent.id, A);
await until(() => S.currentId() === skA, 8000);
await until(() => document.querySelector(`#chat-groups .item[data-key="${CSS.escape(C)}"] .busy.bg-busy`), 4000);
step(Boolean(document.querySelector(`#chat-groups .item[data-key="${CSS.escape(C)}"] .busy.bg-busy`)), 'working background chat: a dot in its color');
await shot('3-C-working-in-background');
await until(() => !Native.isBusy(C), 90000);
const replyC = (await Native.load(C)).messages.at(-1);
const aCode = S.layersOf(S.get(skA))[0].code;
step(S.layersOf(S.get(skC))[0].code.includes('breathe: { value: 1.1'), 'C\'s director edited C\'s scene (via MCP, backstage)', replyC?.text?.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(0, 110)));
step(!aCode.includes('breathe: { value: 1.1') && S.currentId() === skA, 'A\'s scene (on screen) untouched');
const logC = HubBridge.log().filter((e) => e.chatId === C).map((e) => e.tool);
step(logC.includes('three_edit_code'), 'calls carry the chat id', logC);

// a new sketch made by a background chat's director becomes that chat's scene, not opened
const nsBefore = S.currentId();
const r7 = await HubBridge.call('three_new_sketch', { name: 'C remix', code: ChatScenes.starter('#56c6ff') }, { chatId: C });
step(r7.ok !== false && S.get(ChatScenes.linkOf(C))?.name === 'C remix' && S.currentId() === nsBefore, 'three_new_sketch from a background chat relinks it', r7.error || S.get(ChatScenes.linkOf(C))?.name);
// the chat's title changes: the sketch we named follows
await Native.rename(B, 'Scene B: renamed');
await until(() => S.get(skB).name === 'Scene B: renamed', 3000);
step(S.get(skB).name === 'Scene B: renamed', 'renaming the chat renames its sketch', S.get(skB).name);

// 6. a sketch from "Your sketches" that belongs to another chat → offer to go there; unowned → opens unlinked
let toastText = '';
const obs = new MutationObserver(() => { const t = [...document.querySelectorAll('.toast')].map((x) => x.textContent).join(' | '); if (t.includes('is the scene of the chat')) toastText = t; });
obs.observe(document.body, { childList: true, subtree: true });
const picker = host.querySelector('select');
const sel = [...host.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === skB));
sel.value = skB; sel.dispatchEvent(new Event('change'));
await until(() => toastText, 4000);
obs.disconnect();
step(/scene of the chat/.test(toastText) && S.currentId() === skB, 'opening B\'s sketch from A offers to go to chat B', toastText.slice(0, 120));
step(host.querySelector('.scene-tag')?.classList.contains('viewing'), 'tag says "other chat"', host.querySelector('.scene-tag')?.textContent);
await shot('4-viewing-other-chat');
step(Boolean(picker), 'picker found');
// sending in A while B's scene shows: back to A's own scene
await Native.send(agent.id, 'make it calmer');
await until(() => S.currentId() === skA, 5000);
step(S.currentId() === skA, 'a message in A brings A\'s scene back');
await until(() => !Native.isBusy(A), 30000);

// 7. /scene commands
const m1 = await say('/scene', agent.id);
step(/this chat's scene/.test(m1), '/scene', m1.slice(0, 120));
const m2 = await say('/scene new', agent.id);
const skA2 = ChatScenes.linkOf(A);
step(skA2 && skA2 !== skA && S.currentId() === skA2, '/scene new', m2);
const m3 = await say('/scene unlink', agent.id);
step(!ChatScenes.linkOf(A), '/scene unlink', m3);
S.open(skA);
await wait(300);
const m4 = await say('/scene link', agent.id);
step(ChatScenes.linkOf(A) === skA, '/scene link', m4);
// a new chat: the starter is reused while untouched
Native.newChat(agent.id);
await until(() => cur()?.name === 'New chat', 8000);
const d1 = S.currentId();
Native.open(agent.id, B);
await until(() => S.currentId() === skB, 8000);
Native.newChat(agent.id);
await until(() => cur()?.name === 'New chat', 8000);
step(S.currentId() === d1, 'the untouched starter is reused (no pile of empty sketches)');
Native.open(agent.id, A);
await until(() => S.currentId() === skA, 8000);
const drew = await until(() => { const st = ThreeLab.director.report().stats; return st && typeof st === 'object' && st.fps > 0; }, 15000);
step(drew, 'the preview draws after all the switching', ThreeLab.director.report().stats?.fps);
await wait(800);
await shot('5-chat-A');
const tintOf = (id) => S.layersOf(S.get(id))[0].code.match(/tint: \{ value: '(#\w+)'/)?.[1];
const tints = { A: [tintOf(skA), ChatScenes.identity(A).color], B: [tintOf(skB), ChatScenes.identity(B).color], C: [tintOf(skC), ChatScenes.identity(C).color] };
step(Object.values(tints).every(([t, c]) => t === c), 'each starter keeps its chat\'s color', tints);
// 8. Video Director: each chat comes back to its video (needs the test videos: sh dev/make-test-videos.sh /tmp/hearth-test-videos)
const V1 = '/tmp/hearth-test-videos/neon_tunnel_v1.mp4'; const V2 = '/tmp/hearth-test-videos/square_loop.mp4';
if (await window.hub.fs.stat(V1).then(() => true, () => false)) {
  H.config.agents.push({ id: 'videodirector', name: 'Video Director', icon: '🎬', color: '#bd8bff', mode: 'native', engine: 'claude', dock: 'ae', videoTools: true, enabled: true });
  await saveConfig();
  await until(() => Tools.dockedAgent('ae'), 5000);
  activate('tool:ae'); await Review.ensureMounted(); await Review.waitReady?.().catch(() => null);
  const vd = Tools.dockedAgent('ae');
  await until(() => Native.hasView(vd.id), 5000);
  await Review.open(V1);
  await Native.send(vd.id, 'Video one');
  await until(() => !Native.isBusy(H.activeChat[vd.id]), 30000);
  const V = H.activeChat[vd.id];
  Native.newChat(vd.id);
  await wait(200);
  await Review.open(V2);
  await Native.send(vd.id, 'Video two');
  await until(() => !Native.isBusy(H.activeChat[vd.id]), 30000);
  const W = H.activeChat[vd.id];
  Native.open(vd.id, V);
  await until(() => Review.current?.path === V1, 6000);
  step(Review.current?.path === V1, 'video chat 1 → its video', Review.current?.path);
  Native.open(vd.id, W);
  await until(() => Review.current?.path === V2, 6000);
  step(Review.current?.path === V2, 'video chat 2 → its video', Review.current?.path);
  step(Boolean(document.querySelector(`#chat-groups .item[data-key="${CSS.escape(W)}"] .chat-ident`)), 'video chats carry their glyph too');
  await wait(800);
  await shot('6-video-director');
} else step(true, 'video part skipped (no test videos)');
out.dups = Commands.duplicates().length;
out.links = Object.keys(ChatScenes.data().links).length;
return JSON.stringify(out, null, 1);
