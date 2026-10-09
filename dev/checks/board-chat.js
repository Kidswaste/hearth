// Mood board ⇄ chats: chat commands (/board-add, /board-note, /vibe, /board-use, /ref, /board-link…), the drawer over a
// chat (Ctrl+Shift+M) with a reference dragged into the composer (the chat gets a vibe text, not the file), the board_
// tools as an agent calls them (HubBridge.call: the same handler the MCP server reaches), and no duplicate commands.
//   sh dev/board-fixtures.sh && node dev/smoke.js --fake-engines --script dev/checks/board-chat.js
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return cond; };
const C = H.claudeAgent();
const said = [];
const run = async (line, id = C.id) => { said.length = 0; await Commands.tryRun(line, id, null, { say: (t) => said.push(String(t)), note: (t) => said.push(String(t)) }); return said.join('\n'); };

activate(C.id);
await until(() => Native.hasView(C.id));
Native.ensureChat(C.id, 'Board test chat');
const chatId = H.activeChat[C.id];

// commands exist, no duplicates, keys registered
const names = ['board', 'boards', 'board-new', 'board-add', 'board-note', 'board-use', 'ref', 'vibe', 'board-link', 'board-layout', 'board-lens', 'board-template', 'board-export', 'board-present', 'board-peek', 'board-tools', 'board-clip', 'board-crop', 'board-look'];
out.missing = names.filter((n) => !Commands.get(n) || Commands.get(n).area !== 'Board');
ok(!out.missing.length, `commands registered (${out.missing})`);
out.boardCommands = Commands.list().filter((d) => d.area === 'Board').length;
out.dups = Commands.duplicates();
ok(!out.dups.length, 'no duplicate commands');
out.keys = (Keys.groups(true).get('Board') || []).length;
ok(out.keys >= 30, `board keys registered (${out.keys})`);

// add things from the chat, to a board linked to this chat
out.newBoard = await run('/board-new Chat refs');
activate(C.id); await wait(200);
out.link = await run('/board-link Chat refs');
ok(/Chat refs/.test(out.link) && (await Board.boardFor(chatId)).name === 'Chat refs', 'board linked to the chat');
out.add1 = await run(`/board-add ${FIX}/golden-hour.jpg`);
out.add2 = await run(`/board-add file://${FIX}/page.html`);
out.add3 = await run('/board-add #ff2e88 #0b0f1a #2de2e6');
out.add4 = await run('/board-note slow push-ins, sodium-vapour light, **grain**');
out.add5 = await run('/board-color golden hour');
const b = await Board.boardFor(chatId);
await until(() => b.items.filter((i) => i.type === 'image').every((i) => i.vibe) && b.items.filter((i) => i.type === 'web').every((i) => i.snapped), 30000);
out.kinds = b.items.map((i) => i.type);
ok(out.kinds.includes('image') && out.kinds.includes('web') && out.kinds.includes('palette') && out.kinds.includes('note'), `added from chat (${out.kinds})`);

// /vibe prints locally (nothing sent)
out.vibe = await run('/vibe');
ok(/palette: #/.test(out.vibe) && /light:/.test(out.vibe) && /owner's notes/.test(out.vibe), 'vibe text');
ok(!Native.current(C.id)?.messages?.length, 'nothing sent to the agent');

// /board-use attaches a vibe chip (a text attachment), not the file
const v = Native.view(C.id);
v.attachments.length = 0;
out.use = await run('/board-use palette');
ok(v.attachments.length === 1 && v.attachments[0].kind === 'text' && /palette/.test(v.attachments[0].content) && !/golden-hour\.jpg/.test(v.attachments[0].content), 'board-use attaches a palette-only vibe');
out.useAttachment = v.attachments[0]?.name;
out.useText = v.attachments[0]?.content;
ok(/don't put the reference media/.test(v.attachments[0]?.content || ''), 'the vibe says "reference, not footage"');
v.attachments.length = 0;
out.ref = await run('/ref golden | light');
ok(v.attachments.length === 1 && /light/.test(v.attachments[0].content), '/ref attaches matching references');
v.attachments.length = 0;

// the drawer over the chat; drag a tile into the composer
await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'M', code: 'KeyM', modifiers: 10, windowsVirtualKeyCode: 77 } });
await until(() => BoardDrawer.isOpen() && document.querySelectorAll('.bdd-tile').length >= 3, 5000);
out.drawer = { open: BoardDrawer.isOpen(), tiles: document.querySelectorAll('.bdd-tile').length, linked: document.querySelector('.bdd-foot button')?.textContent };
ok(out.drawer.open && out.drawer.tiles >= 3, 'drawer opens with Ctrl+Shift+M');
await smoke({ shot: '/tmp/board-shots/7-drawer.png' });
const tile = document.querySelector('.bdd-tile');
const dt = new DataTransfer();
tile.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
out.dragTypes = [...dt.types];
const ta = v.input;
const tr = ta.getBoundingClientRect();
ta.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: tr.left + 10, clientY: tr.top + 10 }));
ta.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: tr.left + 10, clientY: tr.top + 10 }));
await until(() => v.attachments.length === 1, 3000);
ok(v.attachments.length === 1 && /^vibe · /.test(v.attachments[0].name), `drag a tile into the chat attaches its vibe (${v.attachments[0]?.name})`);
out.dragAttachment = v.attachments[0]?.content;
await smoke({ shot: '/tmp/board-shots/8-chip.png' });
BoardDrawer.toggle(false);

// the board tools (as Claude / Astra call them through mcp/board-mcp.js → gamebridge → HubBridge)
const call = (tool, args = {}) => HubBridge.call(tool, args, { chatId });
const l = await call('board_list');
out.list = l.value;
ok(l.ok && l.value.boards.some((x) => /Chat refs.*linked to this chat/.test(x)), 'board_list marks the linked board');
const bv = await call('board_vibe', { items: true });
ok(bv.ok && /palette:/.test(bv.value.vibe) && bv.value.items.length >= 4, 'board_vibe (linked board by default) + item list');
out.boardVibe = bv.value;
const img = b.items.find((i) => i.type === 'image');
const iv = await call('board_vibe', { item: img.id, image: true });
ok(iv.ok && /light/.test(iv.value.vibe) && iv.value.preview && iv.image && /never|not place|do not place/.test(iv.value.rule), 'board_vibe for one item: vibe + preview path + small image');
out.itemVibe = iv.value; out.previewKB = Math.round((iv.image || '').length * 0.75 / 1024);
const ad = await call('board_add', { kind: 'note', text: 'From the director: try a teal key light', tags: ['director'] });
ok(ad.ok && b.items.some((i) => i.type === 'note' && i.tags?.includes('director')), 'board_add note with a tag');
const ac = await call('board_add', { kind: 'colors', colors: ['#112233', '#ffcc00'], title: 'Director palette' });
ok(ac.ok, 'board_add colors');
const ar = await call('board_arrange', { layout: 'masonry' });
ok(ar.ok && /arranged/.test(ar.value), 'board_arrange');
const bad = await call('board_vibe', { item: 'nope-404' });
ok(!bad.ok && /No item/.test(bad.error), 'board_vibe on a missing item fails cleanly');

// more commands
out.layout = await run('/board-layout by-hue');
out.lens = await run('/board-lens motion');
out.boards = await run('/boards');
ok(/Chat refs/.test(out.boards) && /linked here/.test(out.boards), '/boards');
out.tools = await run('/board-tools on');
ok(H.agent(C.id).boardTools === true, '/board-tools on sets the opt-in');
await run('/board-tools off');
ok(!H.agent(C.id).boardTools, '/board-tools off');
out.exportCsv = await run('/board-export csv');
out.fail = fail;
return JSON.stringify(out, null, 1);
