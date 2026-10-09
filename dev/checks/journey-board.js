// Journey 6 (round 8): the mood board into a Lab scene, the way the owner starts the Hearth intro video, with real
// mouse and keyboard events: open ▦ Board from the rail, add references by typed commands (a picture whose path has a
// space, a clip, colors, a note), look at the vibe, right-click / Alt / keys sheet on the board, the board keys
// (duplicate, undo, note, fit), the drawer over the docked Three Director (Ctrl+Shift+M), drag a reference into the
// director's message box, ask for a layer (fake engine, real MCP calls): the new layer takes the vibe's palette and
// never the reference media; switch chats mid-drawer, small windows, then a reload: the board, its vibe, the chat link
// and the layer are still there. Nothing is written outside Hearth's data folder (the fixture folder is unchanged).
//   sh dev/run-checks.sh journey-board      (or: sh dev/board-fixtures.sh, then
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/journey-board.js)
const { wait, until, step, click, key, type, shot, visible, hitOk } = J;
J.shotDir = window.JOURNEY_SHOTS || localStorage.getItem('journey.shots') || '/tmp';
localStorage.setItem('journey.shots', J.shotDir);
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const claude = H.claudeAgent();
const listing = async (dir) => ((await window.hub.fs.list(dir).catch(() => [])) || []).map((f) => `${f.name}:${f.size}`).sort().join('|');
const fixBefore = await listing(FIX);
const menuRows = () => [...document.querySelectorAll('#menu button, .menu-flyout button')].filter(visible);
const menuText = () => menuRows().map((b) => b.textContent.trim().replace(/\s+/g, ' ')).join(' | ');

// 1. ▦ Board from the rail (a real click on its rail button)
activate(claude.id); await wait(400);
const railBtn = document.querySelector('#rail .agent-btn[data-id="tool:board"]') || [...document.querySelectorAll('#rail .tool-btn-rail')].find((b) => /Board/.test(b.title));
step('▦ Board is in the rail', visible(railBtn) && hitOk(railBtn), railBtn?.title);
if (railBtn) await click(railBtn);
await until(() => Board.isMounted() && Board.visible(), 8000);
step('the board opens', Board.isMounted() && Board.visible() && H.activeId === 'tool:board');
const BR = H.surfaces.get('tool:board').el;
await shot('board-empty');

// 2. references by typed commands in Claude's chat (a new board linked to the chat)
activate(claude.id); await wait(300);
Native.ensureChat(claude.id, 'Intro video');
const chatId = H.activeChat[claude.id];
await J.command(claude.id, '/board-new Hearth intro refs', 900);
await J.command(claude.id, '/board-link Hearth intro refs', 700);
const pic = await J.command(claude.id, `/board-add ${FIX}/neon big.png`, 1500);
step('/board-add with a path that has a space adds the picture (not a note)', /picture|image|Added/.test(pic) && Board.items().some((i) => i.type === 'image' && /neon big/.test(i.title || i.file || '')), pic);
await J.command(claude.id, `/board-add ${FIX}/cuts.mp4`, 1500);
await J.command(claude.id, '/board-add #ff2e88 #2de2e6 #0b0f1a', 600);
await J.command(claude.id, '/board-note sodium light, slow push-ins, **grain**', 600);
const b = await Board.boardFor(chatId);
step('board linked to the chat', b?.name === 'Hearth intro refs', b?.name);
await until(() => b.items.filter((i) => i.type === 'image' || i.type === 'video').every((i) => i.vibe), 40000);
step('vibes read for the picture and the clip', b.items.filter((i) => i.type === 'image' || i.type === 'video').every((i) => i.vibe), b.items.map((i) => `${i.type}:${Boolean(i.vibe)}`));
const dirs = await window.hub.board.dir();
const media = b.items.filter((i) => i.src && (i.type === 'image' || i.type === 'video'));
step('references are copies in Hearth\'s data folder (originals untouched)', media.length >= 2 && media.every((i) => i.src.startsWith(dirs.media)), media.map((i) => i.src.replace(dirs.media, 'media')));
const vibeNote = await J.command(claude.id, '/vibe', 900);
step('/vibe shows the board\'s vibe here (nothing sent)', /palette: #/.test(vibeNote) && !(Native.current(claude.id)?.messages || []).some((m) => m.role === 'user'), vibeNote.slice(0, 120));

// 3. on the board: right-click an item (submenus), Alt reveal, the keys sheet, real keys
activate('tool:board'); await wait(600);
await Board.zoomFit?.(); await wait(600);
const imgNode = [...BR.querySelectorAll('.bd-item')].find((n) => Board.item(n.dataset.id)?.type === 'image');
step('the picture is on screen', visible(imgNode));
if (imgNode) await click(imgNode, { right: true });
await wait(300);
step('right-click an item: its menu with › submenus', menuRows().length >= 4 && /›/.test(menuText()), menuText().slice(0, 200));
await key('Escape'); await wait(200);
await click(imgNode); await wait(200);
step('a click selects it', Board.selected().length === 1);
// Alt held: the rotate handle shows (bd-alt)
await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'rawKeyDown', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 1 } });
await wait(250);
const altOn = BR.querySelector('.bd-root')?.classList.contains('bd-alt');
await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'Alt', code: 'AltLeft', windowsVirtualKeyCode: 18, modifiers: 0 } });
await wait(200);
step('hold Alt: rotate / crop handles show, let go: they hide', altOn && !BR.querySelector('.bd-root')?.classList.contains('bd-alt'));
const n0 = b.items.length;
await key('d', { ctrl: true }); await wait(300);
step('Ctrl+D duplicates on the board', b.items.length === n0 + 1, { before: n0, after: b.items.length });
await key('z', { ctrl: true }); await wait(300);
step('Ctrl+Z undoes it', b.items.length === n0, b.items.length);
await key('='); await key('='); await wait(500);
const z0 = Board._.S.view.z;
await key('1', { shift: true }); await wait(900);
step('= zooms in, Shift+1 zooms back to fit', Math.abs(Board._.S.view.z - z0) > 0.01, { from: z0, to: Board._.S.view.z });
await key('a', { ctrl: true }); await wait(200);
await key('g', { ctrl: true }); await wait(300);
step('Ctrl+A then Ctrl+G groups on the board (not "all agents side by side")', H.activeId === 'tool:board' && b.items.some((i) => i.group), { active: H.activeId, grouped: b.items.filter((i) => i.group).length });
await key('z', { ctrl: true }); await wait(300);
step('Ctrl+Z ungroups again', !b.items.some((i) => i.group) && b.items.length === n0, b.items.length);
const toasts = () => [...document.querySelectorAll('.toast')].map((t) => t.textContent.slice(0, 40));
await key('0', { ctrl: true }); await wait(500);
step('Ctrl+0 on the board zooms it to fit, not the app\'s text size', H.activeId === 'tool:board' && !/text size|zoom/i.test(toasts().join(' ')), toasts());
// the keys sheet: Ctrl+/ lists the board's keys first
await key('/', { ctrl: true }); await wait(500);
const sheet = document.querySelector('.ku-sheet, .keys-sheet');
const sheetText = sheet?.textContent || '';
step('Ctrl+/ on the board: the keys sheet, Board first', visible(sheet) && /Board/.test(sheetText.slice(0, 600)), sheetText.slice(0, 160));
await key('Escape'); await wait(200); await key('Escape'); await wait(200);
await shot('board-refs');

// 4. the Three Director, docked in the Lab, gets a reference by drag from the drawer (Ctrl+Shift+M)
activate(claude.id); await wait(300);
await J.command(claude.id, '/director-setup', 1500);
await until(() => H.agents().some((a) => a.dock === 'three'), 8000);
const dir = H.agents().find((a) => a.dock === 'three');
activate('tool:three'); await wait(1500);
await until(() => visible(Native.view(dir.id)?.input), 8000);
step('Lab with the Three Director docked', Boolean(dir) && visible(Native.view(dir.id)?.input));
const c = await ThreeLab.cmd();
await wait(1500);
await click(Native.view(dir.id).input);
await key('m', { ctrl: true, shift: true });
await until(() => BoardDrawer.isOpen() && document.querySelectorAll('.bdd-tile').length >= 3, 6000);
step('Ctrl+Shift+M: the drawer over the Lab, the chat\'s board', BoardDrawer.isOpen() && document.querySelectorAll('.bdd-tile').length >= 3, document.querySelector('.bdd-head select')?.selectedOptions?.[0]?.textContent);
await shot('drawer-lab');
const v = Native.view(dir.id);
v.attachments.length = 0;
const tile = [...document.querySelectorAll('.bdd-tile')].find((t) => /neon big/.test(t.title));
const dt = new DataTransfer();
tile?.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
const ir = v.input.getBoundingClientRect();
v.input.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: ir.left + 10, clientY: ir.top + 10 }));
v.input.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: ir.left + 10, clientY: ir.top + 10 }));
await until(() => v.attachments.length === 1, 4000);
const att = v.attachments[0];
step('drag a reference into the director: a vibe chip, not the file', /^vibe · /.test(att?.name || '') && att?.kind === 'text' && /#[0-9a-f]{6}/i.test(att?.content || '') && !/\.png|board[\\/]media/i.test(att?.content || ''), { name: att?.name, text: (att?.content || '').slice(0, 160) });
const dragText = dt.getData('text/plain');
step('the drag also carries the vibe as text (for any other text field)', /#[0-9a-f]{6}/i.test(dragText) && /vibe only/.test(dragText), dragText.slice(0, 80));
// switching to another chat with the drawer open: it follows the chat on screen
activate(claude.id); await wait(500);
const linkedHere = document.querySelector('.bdd-foot button')?.textContent || '';
step('switch chats with the drawer open: it shows that chat\'s linked board', BoardDrawer.isOpen() && /Linked/.test(linkedHere) && /Hearth intro refs/.test(document.querySelector('.bdd-head select')?.selectedOptions?.[0]?.textContent || ''), linkedHere);
activate('tool:three'); await wait(600);
await key('m', { ctrl: true, shift: true }); await wait(300);
step('Ctrl+Shift+M again closes the drawer', !BoardDrawer.isOpen());
step('the vibe chip survived the chat switch', v.attachments.length === 1 && /^vibe · /.test(v.attachments[0]?.name || ''));

// 5. ask for a layer: the fake director reads the vibe and builds with its palette (real MCP calls into the Lab)
const layers0 = c.layers().length;
const palette = [...new Set(((att?.content || '').match(/#[0-9a-f]{6}/gi) || []).map((h) => h.toLowerCase()))];
await click(v.input); await type('direct: add a neon ring for the intro'); await key('Enter');
await until(() => Native.isBusy(H.activeChat[dir.id]), 5000);
await until(() => !Native.isBusy(H.activeChat[dir.id]), 120000);
const reply = Native.current(dir.id)?.messages.at(-1)?.text || '';
const sent = Native.current(dir.id)?.messages.filter((m) => m.role === 'user').at(-1);
step('the message went with the vibe attached', (sent?.attachments || sent?.files || []).length >= 1 || /vibe/.test(JSON.stringify(sent || {})), Object.keys(sent || {}));
step('the director says it took the references\' vibe', /Took the references' vibe/.test(reply), reply.slice(0, 200));
await until(() => c.layers().length > layers0, 15000);
const sk = () => ThreeLab.scenes.get(ThreeLab.scenes.currentId()) || {};
const top = (sk().layers || []).find((l) => /neon ring/.test(l.name));
step('a new layer, colored from the vibe\'s palette', c.layers().length === layers0 + 1 && palette.some((h) => (top?.code || '').toLowerCase().includes(h)), { layers: c.layers().map((l) => l.name), palette: palette.slice(0, 4) });
const allCode = (sk().layers || []).map((l) => l.code || '').join('\n') + (sk().code || '');
step('the reference media never enters the scene', allCode.length > 100 && !/neon big|board[\\/]media|\.png/.test(allCode), allCode.length);
await shot('director-vibe');
localStorage.setItem('journey.board', JSON.stringify({ chatId, boardId: b.id, items: b.items.length, layer: top?.name, sketch: ThreeLab.scenes?.currentId?.() || null, dir: dir.id }));

// 6. small windows: the board and the drawer at 900×600 and 640×480 (nothing off screen, + Add still clickable)
activate('tool:board'); await wait(400);
const sizes = [];
for (const [w, h] of [[900, 600], [640, 480]]) {
  await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: w, height: h, deviceScaleFactor: 1, mobile: false } });
  await wait(700);
  const add = BR.querySelector('.bd-add');
  const r = add?.getBoundingClientRect();
  sizes.push({ w, h, add: Boolean(r && r.right <= w && r.bottom <= h && hitOk(add)), x: innerWidth });
}
await shot('board-small');
BoardDrawer.toggle(true); await wait(400);
const dr = document.querySelector('.bdd')?.getBoundingClientRect();
sizes.push({ drawer: Boolean(dr && dr.width > 0 && dr.width <= 640 && dr.bottom <= 481) });
BoardDrawer.toggle(false);
await smoke({ cdp: 'Emulation.clearDeviceMetricsOverride', params: {} });
await wait(500);
step('small windows: + Add and the drawer stay on screen', sizes.every((s) => s.add !== false && s.drawer !== false), sizes);

// 7. data folder: the fixture folder is untouched; flush the board before the reload
Board._.flush?.();
await wait(1200);
step('nothing written next to the originals', (await listing(FIX)) === fixBefore);
return J.done();
//@@ reload
// after the reload: everything read back from disk
const { wait, until, step, shot } = J;
J.shotDir = localStorage.getItem('journey.shots') || '/tmp';
const was = JSON.parse(localStorage.getItem('journey.board') || '{}');
await Board.ready?.();
await until(() => Board.boards().some((x) => x.id === was.boardId), 10000);
const b2 = await Board.load(was.boardId);
step('after a reload: the board and its references are back', b2 && b2.items.length === was.items, { items: b2?.items.length, was: was.items });
step('their vibes are kept (not read again)', b2 && b2.items.filter((i) => i.type === 'image' || i.type === 'video').every((i) => i.vibe));
step('the board is still linked to the chat', (await Board.boardFor(was.chatId))?.id === was.boardId);
activate('tool:three'); await wait(2500);
const c2 = await ThreeLab.cmd();
await until(() => c2.layers().some((l) => l.name === was.layer), 15000);
step('the director\'s vibe layer is still in its scene', c2.layers().some((l) => l.name === was.layer), c2.layers().map((l) => l.name));
await shot('after-reload');
localStorage.removeItem('journey.board');
return J.done();
