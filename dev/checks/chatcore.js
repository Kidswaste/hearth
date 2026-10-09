// Chats at the core (round 9): cards for what a reply made (a real capture_shot through the MCP server, a video card
// that plays and scrubs frame by frame), the ＋ menu, attach from anywhere (a Video Review drop, a pasted path, the
// Lab frame), the "/" menu's short view with area rows, the context strip and "use the board" (one line, only when
// your words point at it), inheritance on "continue with", right-click on every message part, and token frugality
// (a plain message reaches the engine exactly as typed).
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/chatcore.js --shot /tmp/chatcore.png
const VID = '/tmp/hearth-capture-test/cfr25.mp4';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(120); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const v = () => Native.view(C.id);
const menuRows = () => [...document.querySelectorAll('#menu button')].map((b) => b.textContent.trim());
const closeMenu = () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); hideMenu?.(); };
const lastMsg = (role) => [...v().list.querySelectorAll(`.msg.${role}`)].at(-1);
const reply = async (text) => { await Native.send(C.id, text); await wait(150); await until(() => !Native.isBusy(H.activeChat[C.id]), 60000); await wait(300); return Native.current(C.id).messages.at(-1); };
const rclick = (node) => { const r = node.getBoundingClientRect(); node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 6, clientY: r.top + 6 })); };
try {
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat(C.id);

  // commands
  const names = ['things', 'open-last', 'attach-board', 'attach-capture', 'attach-frame', 'attach-scene', 'attach-region', 'attach-render', 'attach-menu', 'chat-context', 'render-again'];
  out.missing = names.filter((n) => !Commands.get(n));
  ok(!out.missing.length, `commands registered (${out.missing})`);
  out.dups = Commands.duplicates();
  ok(!out.dups.length, `no duplicate commands (${JSON.stringify(out.dups).slice(0, 200)})`);

  // pure helpers
  out.paths = ChatThings.pathsIn('path: /tmp/a b/shot 1.png\nrendered C:\\Users\\q\\x.mp4, and /no/ext');
  ok(out.paths.length === 2 && out.paths[0] === '/tmp/a b/shot 1.png' && /x\.mp4$/.test(out.paths[1]), `paths found in results (${out.paths})`);
  const fb = ChatThings.fromCall({ tool: 'board_add', args: { title: 'Neon' }, result: { ok: true, value: 'added b12 (picture) to "Refs"' }, chatId: 'x' });
  ok(fb.found.some((t) => t.k === 'board' && t.id === 'b12' && t.board === 'Refs'), 'board_add → a board card');
  const fl = ChatThings.fromCall({ tool: 'capture_list', args: {}, result: { ok: true, value: '🎬 /tmp/a.mp4' }, chatId: 'x' });
  ok(!fl.found.length, 'listings make no cards');
  const fs3 = ChatThings.fromCall({ tool: 'three_screenshot', args: {}, result: { ok: true, value: 'ok', images: [{ data: 'AAAA', mime: 'image/jpeg' }] }, chatId: 'x' });
  ok(fs3.frame && !fs3.found.length, 'a Lab screenshot becomes one frame card');

  // token frugality: a plain message goes exactly as typed (echo returns the prompt the engine got)
  const plain = await reply('echo hello there');
  out.plainEcho = plain.text.slice(-120);
  ok(!/Hearth context|<file name="vibe/.test(plain.text) && /echo hello there/.test(plain.text), 'a plain message carries nothing extra');
  ok(!plain.things, 'a plain reply has no cards');

  // a real tool call: capture_shot through the capture MCP server → a picture card in the reply
  await Commands.tryRun('/capture-tools on', C.id, null, { say: () => {}, note: () => {} });
  const shot = await reply('mcp please\nmcp: [["capture_shot", {"target": "window"}]]');
  out.shotThings = shot.things;
  ok(shot.things?.some((t) => t.k === 'image' && /\.png$/i.test(t.path || '')), 'capture_shot made a picture card');
  const card = lastMsg('assistant')?.querySelector('.thing-strip .thing');
  ok(card && card.querySelector('img'), 'the card shows under the reply');
  ok(!/\[Hearth|thing/i.test(JSON.stringify(Native.current(C.id).messages.filter((m) => m.role === 'user').map((m) => m.sent || ''))), 'cards add nothing to what was sent');
  // right-click on the card
  if (card) { rclick(card); await wait(150); out.cardMenu = menuRows(); closeMenu(); }
  ok(out.cardMenu?.some((x) => /^Open/.test(x)) && out.cardMenu.some((x) => /^Send to/.test(x)), `card right-click menu (${out.cardMenu})`);
  // the tool calls fold to one line, with its own right-click
  const fold = lastMsg('assistant')?.querySelector('.tool-fold');
  out.fold = fold?.querySelector('summary')?.textContent;
  ok(fold && /⚙/.test(out.fold), `tool calls folded (${out.fold})`);
  if (fold) { rclick(fold.querySelector('summary')); await wait(150); out.foldMenu = menuRows(); closeMenu(); }
  ok(out.foldMenu?.includes('Copy the steps'), `steps right-click (${out.foldMenu})`);
  out.things = await Commands.tryRun('/things', C.id).then(() => v().list.querySelector('.msg.note[data-note-id="things"]')?.textContent.slice(0, 80));
  ok(/Made in this chat/.test(out.things || ''), '/things lists them');

  // a video card: plays on hover, scrubs frame by frame on its bottom edge
  const chat = Native.current(C.id);
  chat.messages.push({ role: 'assistant', text: 'Here is the render.', at: Date.now(), things: [{ k: 'video', path: VID, name: 'cfr25.mp4', src: 'test' }] });
  Native.save(chat); await Native.refresh(C.id); await wait(400);
  const vc = lastMsg('assistant')?.querySelector('.thing-video');
  ok(vc, 'a video card');
  if (vc) {
    vc.scrollIntoView(); await wait(300);
    vc.dispatchEvent(new MouseEvent('mouseenter'));
    const vid = vc.querySelector('video');
    await until(() => vid.readyState >= 2, 8000);
    const scrub = vc.querySelector('.thing-scrub');
    const r = scrub.getBoundingClientRect();
    scrub.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + 4 }));
    await until(() => /^f \d+/.test(vc.querySelector('.thing-read').textContent), 6000);
    out.scrubRead = vc.querySelector('.thing-read').textContent;
    out.scrubTime = vid.currentTime;
    const f0 = Number(out.scrubRead.match(/^f (\d+)/)?.[1]);
    vc.focus(); vc.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await until(() => Number(vc.querySelector('.thing-read').textContent.match(/^f (\d+)/)?.[1]) === f0 + 1, 4000);
    out.stepRead = vc.querySelector('.thing-read').textContent;
    ok(f0 > 0 && Math.abs(vid.currentTime - (f0 + 1.5) / 25) < 0.021, `frame-exact scrub + step (${out.scrubRead} → ${out.stepRead}, t=${vid.currentTime})`);
    vc.dispatchEvent(new MouseEvent('mouseleave'));
  }

  // the ＋ menu
  v().form.querySelector('.attach-btn').click();
  await until(() => menuRows().length > 3, 4000);
  out.plusMenu = menuRows();
  ok(['Files…', 'Board', 'Captures', 'Lab', 'Screen', 'Recent renders'].every((l) => out.plusMenu.some((x) => x.startsWith(l))), `＋ menu (${out.plusMenu})`);
  window.__plusShot && await smoke({ shot: window.__plusShot });
  closeMenu();

  // attach from anywhere: a Video Review drag (its contact sheet), a pasted picture path
  const dt = new DataTransfer(); dt.setData('text/x-hearth-video', VID); dt.setData('text/plain', VID);
  v().input.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  await until(() => v().attachments.some((a) => /contact sheet/.test(a.name)), 30000);
  out.dropped = v().attachments.map((a) => a.name);
  ok(out.dropped.some((n) => /cfr25\.mp4 · contact sheet/.test(n)), `a dropped video attaches its contact sheet (${out.dropped})`);
  const pic = shot.things?.find((t) => t.k === 'image')?.path;
  if (pic) {
    const cd = new DataTransfer(); cd.setData('text/plain', pic);
    v().input.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: cd }));
    await until(() => v().attachments.length >= 2, 6000);
    ok(v().attachments.some((a) => a.kind === 'image' && a.path && !/contact/.test(a.name)), 'a pasted picture path attaches the picture');
  }
  v().attachments.length = 0; Native.renderChips(C.id);

  // the "/" menu: short, by area, areas open in place
  const ta = v().input; ta.focus(); ta.value = '/'; ta.dispatchEvent(new Event('input'));
  await until(() => v().root.querySelector('.slash-menu .slash-area'), 3000);
  const sm = () => v().root.querySelector('.slash-menu');
  out.slashRows = sm().querySelectorAll('.slash-item').length;
  out.slashAreas = sm().querySelectorAll('.slash-area').length;
  out.slashHeads = [...sm().querySelectorAll('.slash-head')].map((h) => h.textContent);
  ok(out.slashAreas >= 8 && out.slashAreas <= 9 && out.slashRows <= 26, `short "/" view (${out.slashRows} rows, ${out.slashAreas} areas)`);
  ok(out.slashHeads.includes('For this chat'), `context-aware rows (${out.slashHeads})`);
  window.__slashShot && await smoke({ shot: window.__slashShot });
  const area = [...sm().querySelectorAll('.slash-area')].find((x) => /^Compose/.test(x.textContent)) || sm().querySelector('.slash-area');
  area.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await wait(200);
  out.areaOpen = [...sm().querySelectorAll('.slash-item b')].slice(0, 4).map((b) => b.textContent);
  ok(out.areaOpen[0] === '‹ All areas' && out.areaOpen.length >= 3, `an area opens in place (${out.areaOpen})`);
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
  await wait(200);
  ok(sm()?.querySelector('.slash-area'), '← goes back to every area');
  ta.value = '/attach-r'; ta.dispatchEvent(new Event('input')); await wait(200);
  out.typed = [...(sm()?.querySelectorAll('.slash-item b') || [])].map((b) => b.textContent).slice(0, 3);
  ok(out.typed.some((x) => /^\/attach-re/.test(x)), `typing filters (${out.typed})`);
  ta.value = ''; ta.dispatchEvent(new Event('input')); ta.blur();

  // the context strip and "use the board"
  await Board.ready();
  const b = Board.create ? await Board.create('Chatcore refs') : null;
  const bid = (b?.id) || Board.boards().find((x) => x.name === 'Chatcore refs')?.id || Board.current().id;
  Board.linkChat(H.activeChat[C.id], bid);
  Board.addSwatch?.(['#ff2e88', '#0b0f1a', '#2de2e6'], null, { title: 'Neon' });
  await wait(500); await ChatContext.paint(C.id); await wait(200);
  out.strip = [...v().form.querySelectorAll('.ctx-strip .ctx-chip')].map((c) => c.dataset.k);
  ok(out.strip.includes('board') && out.strip.includes('captures'), `context strip (${out.strip})`);
  ok(getComputedStyle(v().form.querySelector('.ctx-strip')).visibility === 'hidden', 'the strip stays out of the way until you point at the chat box');
  ta.focus(); await wait(200);
  ok(getComputedStyle(v().form.querySelector('.ctx-strip')).visibility === 'visible', 'the strip shows while you type');
  window.__stripShot && await smoke({ shot: window.__stripShot });
  const useBoard = await reply('echo use the board for this');
  out.useBoardEcho = useBoard.text.slice(0, 300);
  const um = Native.current(C.id).messages.filter((m) => m.role === 'user').at(-1);
  ok(/\[Hearth context: board "/.test(useBoard.text) && /<file name="vibe/.test(useBoard.text), '“use the board” names it and brings its vibe (no board tools)');
  ok(um.ctxLine && lastMsg('user').querySelector('.ctx-sent'), 'your message shows the ⌖ mark');
  const again = await reply('echo render it again with the last capture');
  ok(/Hearth context: [^\]]*last picture \//.test(again.text), `“the last capture” names its path (${again.text.slice(-160)})`);
  await Commands.tryRun('/chat-context auto off', C.id, null, { say: () => {}, note: () => {} });
  const off = await reply('echo use the board again');
  ok(!/Hearth context/.test(off.text), '/chat-context auto off: exactly as typed');
  await Commands.tryRun('/chat-context auto on', C.id, null, { say: () => {}, note: () => {} });

  // handoff carries it: continue with Astra
  const A = Native.astraAgent();
  const from = H.activeChat[C.id];
  await Native.continueWith(from, A.id);
  await wait(800);
  const g = ChatContext.gather(H.activeChat[A.id], Native.current(A.id));
  out.inherited = { board: g.board?.name, captures: g.captures?.length, inherited: g.inherited };
  ok(g.board?.name === 'Chatcore refs' && g.captures?.length >= 1, `continuing with Astra carries the context (${JSON.stringify(out.inherited)})`);
  activate(C.id); await wait(300);

  // right-click on the other parts: a suggestion chip, a note, the streaming reply
  const sug = await reply('suggest');
  const chip = lastMsg('assistant')?.querySelector('.suggest-chip');
  if (chip) { rclick(chip); await wait(150); out.chipMenu = menuRows(); closeMenu(); }
  ok(out.chipMenu?.includes('Put it in my message'), `suggestion chip right-click (${out.chipMenu})`);
  const note = v().list.querySelector('.msg.note');
  if (note) { rclick(note.querySelector('.body')); await wait(150); out.noteMenu = menuRows(); closeMenu(); }
  ok(out.noteMenu?.some((x) => x.startsWith('Dismiss every note')), `note right-click (${out.noteMenu})`);
  void sug;
  await Native.send(C.id, 'slow long think');
  await until(() => v().list.querySelector('.msg.streaming .body')?.textContent.length > 20, 10000);
  const st = v().list.querySelector('.msg.streaming');
  if (st) { rclick(st.querySelector('.body')); await wait(150); out.streamMenu = menuRows(); closeMenu(); }
  ok(out.streamMenu?.some((x) => x.startsWith('■ Stop')), `streaming reply right-click (${out.streamMenu})`);
  Native.stop(C.id);
  await until(() => !Native.isBusy(H.activeChat[C.id]), 15000);
  v().list.scrollTop = v().list.scrollHeight;
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
