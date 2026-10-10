// Board eyes in a real chat (round 14): the fake Claude really calls the board MCP server (board_look, board_watch,
// board_do pinterest) through the hub, so pictures travel as MCP image content; the reply shows one quiet card per
// look (what was sent: pictures, size, ≈ tokens; the items as links), Pinterest searches as buttons, item ids in the
// reply link back to the board (click = jump + select), nothing goes to the engine unless asked (a plain message stays
// plain), and what the owner showed is remembered on the reply.
//   sh dev/board-fixtures.sh && node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/eyes-chat.js
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const v = () => Native.view(C.id);
const lastMsg = (role) => [...v().list.querySelectorAll(`.msg.${role}`)].at(-1);
const reply = async (text) => { await Native.send(C.id, text); await wait(150); await until(() => !Native.isBusy(H.activeChat[C.id]), 90000); await wait(400); return Native.current(C.id).messages.at(-1); };
try {
  // a board with a picture and a clip, linked to the chat
  activate('tool:board');
  await until(() => Board.isMounted());
  await Board.create('Chat eyes');
  const b = Board.current();
  await Board.addFiles([`${FIX}/golden-hour.jpg`, `${FIX}/cuts.mp4`]);
  await until(() => b.items.every((i) => i.vibe), 40000);
  const [pic, clip] = b.items;
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat(C.id);
  await wait(200);
  Board.linkChat(H.activeChat[C.id], b.id);

  // a plain message: nothing about the board goes with it
  const plain = await reply('echo just words');
  ok(!plain.eyes && !/board_look|picture/.test(plain.text.replace(/echo just words/, '')), 'a plain message carries no pictures');

  // the board tools on: the fake engine calls the real MCP server
  await Commands.tryRun('/board-tools on', C.id, null, { say: () => {}, note: () => {} });
  const seen = [];
  const onEyes = (e) => seen.push(e.detail.record.tool);
  document.addEventListener('hearth:board-eyes', onEyes);
  const m = await reply(`mcp please\nmcp: ${JSON.stringify([['board_look', {}], ['board_look', { item: pic.id, size: 'small' }], ['board_watch', { item: clip.id, count: 4 }], ['board_do', { op: 'pinterest', aesthetic: 'y2k' }]])}`);
  document.removeEventListener('hearth:board-eyes', onEyes);
  out.reply = m.text.slice(-900);
  out.seen = seen;
  ok(/board_look: \d+ chars \+ 1 image/.test(m.text), 'board_look sent a real image through MCP');
  ok(/board_watch: \d+ chars \+ 1 image/.test(m.text), 'board_watch sent its contact sheet as an image');
  ok(seen.length === 4, `a live card per call while the reply ran (${seen})`);
  out.eyes = (m.eyes || []).map((r) => ({ tool: r.tool, size: r.size, items: r.items?.length, pins: r.pins?.length, thumb: Boolean(r.thumb) }));
  ok(m.eyes?.length === 4 && m.eyes[0].tool === 'look' && m.eyes[2].tool === 'watch' && m.eyes[3].pins?.length >= 2, 'the reply keeps what was looked at');
  ok(m.eyes?.[0]?.thumb && m.eyes[0].thumb.length < 20000, 'a small thumbnail per look (not the full picture)');
  ok(!m.things?.some((t) => t.k === 'frame'), 'looks are not saved as "made" frames');
  const node = lastMsg('assistant');
  const cards = node?.querySelectorAll('.eyes-strip .eyes-card') || [];
  out.cardText = [...cards].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
  ok(cards.length === 4 && /≈ \d+ tokens/.test(out.cardText[0]) && node.querySelector(".eyes-fold summary"), "cards under the reply say what was sent (3 looks fold into one line)");
  ok(node?.querySelectorAll('.eyes-pin').length >= 2, 'Pinterest searches as buttons');
  // item ids in the reply are links to the board
  const links = [...(node?.querySelectorAll('.body .eyes-ref') || [])];
  out.links = links.slice(0, 6).map((a) => a.textContent);
  ok(links.length >= 2 && links.some((a) => a.dataset.item === pic.id), 'item ids in the reply link to the board');
  await smoke({ shot: '/tmp/eyes-chat.png' });
  // click one: the board opens with it selected
  Board.select([]);
  const target = links.find((a) => a.dataset.item === clip.id) || links[0];
  target.click();
  await until(() => H.activeId === 'tool:board' && Board.selected().some((i) => i.id === target.dataset.item), 5000);
  ok(H.activeId === 'tool:board' && Board.selected()[0]?.id === target.dataset.item, 'click an id: jump to it on the board');
  out.jumped = Board.selected().map((i) => i.id);

  // the owner shows the clip, then asks: the picture goes with the message and the reply remembers it
  activate(C.id); await wait(200);
  await BoardEyesUI.showTo(C.id, { boardId: b.id, itemIds: [clip.id], watch: { count: 4 }, ask: 'echo what happens in this clip?' });
  await wait(150); await until(() => !Native.isBusy(H.activeChat[C.id]), 60000); await wait(300);
  const msgs = Native.current(C.id).messages;
  const user = msgs.at(-2); const asked = msgs.at(-1);
  out.askAttachments = user?.attachments?.map((a) => a.name);
  ok(user?.attachments?.some((a) => a.kind === 'image') && user.attachments.some((a) => /board ids/.test(a.name)), 'Ask about it: the picture + ids went with the question');
  ok(asked?.eyes?.[0]?.tool === 'shown' && asked.eyes[0].by === 'owner', 'the reply remembers what you showed');
  await Commands.tryRun('/board-tools off', C.id, null, { say: () => {}, note: () => {} });

  // Astra (Codex) sees the board the same way
  const A = H.agents().find((a) => a.engine === 'codex' && a.mode === 'native');
  if (ok(A, 'an Astra chat exists')) {
    activate(A.id); await until(() => Native.hasView(A.id)); Native.newChat(A.id); await wait(200);
    Board.linkChat(H.activeChat[A.id], b.id);
    await Commands.tryRun('/board-tools on', A.id, null, { say: () => {}, note: () => {} });
    await Native.send(A.id, `mcp please\nmcp: ${JSON.stringify([['board_look', { item: pic.id }]])}`);
    await wait(150); await until(() => !Native.isBusy(H.activeChat[A.id]), 90000); await wait(400);
    const am = Native.current(A.id).messages.at(-1);
    out.astra = { text: am?.text?.slice(-300), eyes: am?.eyes?.map((r) => r.size) };
    ok(/board_look: \d+ chars/.test(am?.text || '') && /1 picture/.test(am?.eyes?.[0]?.size || ''), 'Astra gets the picture too (the same MCP server), with its card');
    await Commands.tryRun('/board-tools off', A.id, null, { say: () => {}, note: () => {} });
  }
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: fail.length === 0, fail, ...out }, null, 1);
