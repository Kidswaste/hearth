// Board eyes (round 14): the board_look / board_watch tools as an agent calls them (HubBridge.call reaches the same
// handler the MCP server does): the whole board as one picture with ids, one item small / large / a close-up, the
// selection, a frame, compare, a clip and a gif over time (contact sheet + frames with timestamps), find, captions
// kept in the vibe text, credit on a found picture; and the owner's side: Show to a chat (the pictures go with the next
// message), /board look · watch · compare · find, the menus.
//   sh dev/board-fixtures.sh && node dev/smoke.js --script dev/checks/eyes-look.js
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return cond; };
const C = H.claudeAgent();
const said = [];
const run = async (line, id = C.id) => { said.length = 0; await Commands.tryRun(line, id, null, { say: (t) => said.push(String(t)), note: (t, o) => said.push(String(t) + (o?.actions ? ` [${o.actions.map((a) => a.label).join(' | ')}]` : '')) }); return said.join('\n'); };
const call = (tool, args) => HubBridge.call(tool, args);
const dims = async (im) => { const i = new Image(); i.src = `data:${im.mime};base64,${im.data}`; await i.decode(); return [i.naturalWidth, i.naturalHeight]; };

activate(C.id);
await until(() => Native.hasView(C.id));
Native.ensureChat(C.id, 'Eyes test chat');

// a board with pictures, a clip with cuts, a gif, a note, colors and a frame
activate('tool:board');
await until(() => Board.isMounted());
await Board.create('Eyes board');
const b = Board.current();
await Board.addFiles([`${FIX}/golden-hour.jpg`, `${FIX}/neon big.png`, `${FIX}/cuts.mp4`, `${FIX}/loop.gif`]);
Board.addNote('slow push-ins, sodium light', { x: 0, y: 700 });
Board.addSwatch(['#ff2e88', '#0b0f1a'], { x: 400, y: 700 });
await until(() => b.items.filter((i) => ['image', 'video', 'gif'].includes(i.type)).every((i) => i.vibe), 40000);
const [gold, neon, clip, gif] = ['golden-hour', 'neon big', 'cuts', 'loop'].map((t) => b.items.find((i) => i.title === t));
ok(gold && neon && clip && gif, 'fixtures on the board');
Board.select([gold.id, neon.id]); Board.frameSelection(); await wait(100);
const frame = b.items.find((i) => i.type === 'frame');
if (frame) Board.patch([frame.id], { title: 'Warm and neon' }, 'rename');
Board.select([]);

// the whole board: one picture with ids, small by default
const whole = await call('board_look', {});
out.whole = { ok: whole.ok, sent: whole.value?.sent, items: whole.value?.items?.length, n: whole.images?.length };
ok(whole.ok && whole.images?.length === 1 && /1 picture/.test(whole.value.sent) && /tokens/.test(whole.value.sent), 'board_look (no target): one overview picture, what was sent is said');
const wd = whole.images?.[0] ? await dims(whole.images[0]) : [0, 0];
ok(Math.max(...wd) <= 768, `the overview is small by default (${wd})`);
ok(whole.value.items.some((l) => l.startsWith(gold.id)), 'its item ids are listed');
ok(whole.eyes?.board === b.id && whole.eyes.items.length >= 5, 'a record for the chat card');
// one item: small, then large, then a close-up
const one = await call('board_look', { item: gold.id });
const od = await dims(one.images[0]);
ok(one.ok && Math.max(...od) <= 512 && /light/.test(one.value.vibe) && /never put this media/.test(one.value.rule), `one item small (${od})`);
const big = await call('board_look', { item: neon.id, size: 'large' });
const bd = await dims(big.images[0]);
ok(big.ok && Math.max(...bd) > 1024, `size large is bigger (${bd})`);
const crop = await call('board_look', { item: neon.id, region: [0.5, 0, 0.5, 0.5], size: 'medium' });
const cd = await dims(crop.images[0]);
ok(crop.ok && Math.abs(cd[0] / cd[1] - (1200 / 800)) < 0.1, `a close-up of a region (${cd})`);
out.closeTokens = crop.value.sent;
// by words, the selection, a frame, several items (a sheet), compare
const byWords = await call('board_look', { item: 'golden' });
ok(byWords.ok && byWords.eyes.items[0].id === gold.id, 'an item named by words');
Board.select([gold.id, clip.id, gif.id]);
const sel = await call('board_look', { selection: true });
ok(sel.ok && sel.images.length === 1 && sel.value.items.length === 3, 'the selection as one sheet');
Board.select([]);
if (frame) { const fr = await call('board_look', { frame: 'warm' }); ok(fr.ok && fr.value.frame === 'Warm and neon' && fr.eyes.items.length === 2, 'a frame'); }
const cmp = await call('board_look', { items: [gold.id, neon.id], compare: true });
out.compare = cmp.value?.differences;
ok(cmp.ok && cmp.images.length === 1 && /apart/.test(cmp.value.differences[0]), 'compare: side by side + differences');
const cmp2 = await call('board_compare', { items: [gold.id, neon.id] });
ok(cmp2.ok, 'board_compare (same thing, old name)');
const clipLook = await call('board_look', { item: clip.id });
// (round 44) board_watch is an op of board_do since round 41 (toolslim): the pointer names the tool the AI has
ok(clipLook.ok && /board_do watch/.test(clipLook.value.clip), 'looking at a clip points to board_do watch');

// a clip over time: contact sheet with timestamps, scenes, exact times, frames
const w1 = await call('board_watch', { item: clip.id });
out.watch = w1.value;
ok(w1.ok && w1.images.length === 1 && /#1 0:00/.test(w1.value.frames) && /6s/.test(w1.value.length), 'board_watch: one timestamped sheet');
const w2 = await call('board_watch', { item: clip.id, mode: 'scenes' });
out.scenes = w2.value?.frames;
ok(w2.ok && (w2.value.frames.match(/#/g) || []).length === 3, `scenes: one frame per shot (${w2.value?.frames})`);
const w3 = await call('board_watch', { item: clip.id, times: [0.5, 2.5, 4.5], as: 'frames' });
out.times = w3.value?.frames || w3.error;
ok(w3.ok && w3.images.length === 3 && /0:02\.(4[0-9]|5)/.test(w3.value.frames), 'exact times as separate frames');
const wg = await call('board_watch', { item: gif.id, count: 4 });
out.gif = wg.value;
ok(wg.ok && wg.images.length === 1 && /gif frames/.test(wg.value.length), 'a gif over time (decoded in the page)');
const wbad = await call('board_watch', { item: gold.id });
ok(!wbad.ok && /not a clip/.test(wbad.error), 'watching a still says so');

// find, captions, credit
const f = await call('board_do', { op: 'find', query: 'dark pink neon picture' });
out.find = f.value;
ok(f.ok && f.value.matches[0].startsWith(neon.id), 'find by description');
const cap = await call('board_do', { op: 'caption', item: gold.id, text: 'a warm orange sky over a dark brown hill' });
ok(cap.ok && gold.alt === 'a warm orange sky over a dark brown hill', 'caption saved on the item');
const vib = await call('board_vibe', { item: gold.id });
ok(/seen "a warm orange sky/.test(vib.value.vibe), 'the vibe text carries the caption');
const f2 = await call('board_do', { op: 'find', query: 'orange sky hill' });
ok(f2.value.matches?.[0]?.startsWith(gold.id), 'find reads captions');
const add = await call('board_add', { kind: 'url', url: `file://${FIX}/golden-hour.jpg`, source: 'https://example.com/photo/12', credit: 'Jane Doe' });
const found = b.items.at(-1);
ok(add.ok && found.source === 'https://example.com/photo/12' && found.credit === 'Jane Doe', 'a found picture keeps its source and credit');

// the owner shows things to the chat: pictures ride with the next message
const v = Native.view(C.id);
v.attachments.length = 0;
const r = await BoardEyesUI.showTo(C.id, { boardId: b.id, itemIds: [gold.id] });
ok(v.attachments.filter((a) => a.kind === 'image').length === 1 && v.attachments.some((a) => a.kind === 'text' && a.content.includes(gold.id)), 'Show to a chat: one picture + its id');
out.shown = r?.sent;
v.attachments.length = 0;
out.cmdLook = await run('/board look sel');
ok(/Nothing is selected/.test(out.cmdLook) || /picture/.test(out.cmdLook), '/board look sel');
v.attachments.length = 0;
out.cmdLook2 = await run('/board look');
ok(/picture/.test(out.cmdLook2) && v.attachments.some((a) => a.kind === 'image'), '/board look (the board)');
v.attachments.length = 0;
out.cmdWatch = await run(`/board watch ${clip.id} 4`);
ok(/4 frames/.test(out.cmdWatch) && v.attachments.some((a) => a.kind === 'image'), '/board watch');
v.attachments.length = 0;
out.cmdCompare = await run(`/board compare ${gold.id} ${neon.id}`);
ok(/picture/.test(out.cmdCompare), '/board compare');
v.attachments.length = 0;
out.cmdFind = await run('/board find warm orange');
ok(/Found/.test(out.cmdFind) && out.cmdFind.includes(gold.id), '/board find');
out.cmdShow = await run('/board-show neon medium');
ok(/picture/.test(out.cmdShow), '/board-show');
v.attachments.length = 0;
out.alt = await run('/board-alt');
ok(Commands.get('board-watch') && Commands.get('board-find') && Commands.get('board-pinterest') && Commands.get('board-alt'), 'the new commands exist');
ok(!Commands.duplicates().length, `no duplicate commands (${JSON.stringify(Commands.duplicates()).slice(0, 200)})`);
// the item menu has Show to a chat; the board menu shows the board / Pinterest
Board.select([gold.id]);
const extras = Board._.itemExtras(Board.selected());
ok(extras.some((x) => x.label === 'Show to a chat'), 'item menu: Show to a chat');
const bm = Board._.boardItems();
ok(bm.some((x) => x.label === 'Show the board to a chat') && bm.some((x) => /Pinterest/.test(x.label)), 'board menu: show the board, Pinterest');
await smoke({ shot: '/tmp/eyes-board.png' });
out.ok = fail.length === 0;
out.fail = fail;
return JSON.stringify({ ok: out.ok, fail, ...out }, null, 1);
