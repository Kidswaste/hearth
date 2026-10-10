// Board eyes from the owner's hands (round 14): right-click an item › Show to a chat (submenu of chats, Ask about it…,
// frames of a clip, side by side), the board menu (show the whole board, Pinterest searches), a drawer tile's
// right-click, Alt+drop of a drawer tile on a chat (the picture, where a plain drop gives the vibe), an item dragged off
// the board onto a chat (shown there, the item goes back), alt text, /board's completion, keys listed.
//   sh dev/board-fixtures.sh && node dev/smoke.js --check-timeout 300000 --script dev/checks/eyes-ui.js
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const menuRows = () => [...document.querySelectorAll('#menu button')].map((b) => b.textContent.trim());
const closeMenu = () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.hideMenu?.(); };
const clickRow = async (re) => { const b = [...document.querySelectorAll('#menu button')].find((x) => re.test(x.textContent.trim())); if (b) { b.click(); await wait(200); } return Boolean(b); };
try {
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat(C.id);
  const v = Native.view(C.id);
  activate('tool:board');
  await until(() => Board.isMounted());
  await Board.create('UI eyes');
  const b = Board.current();
  await Board.addFiles([`${FIX}/golden-hour.jpg`, `${FIX}/cuts.mp4`]);
  await until(() => b.items.every((i) => i.vibe), 40000);
  const [pic, clip] = b.items;
  Board.zoomFit(); await wait(400);

  // right-click the picture: Show to a chat › Claude
  Board.select([pic.id]); await wait(100);
  const node = Board._.S.nodes.get(pic.id);
  const r = node.getBoundingClientRect();
  node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }));
  await wait(200);
  out.menu = menuRows();
  ok(out.menu.some((x) => /^Show to a chat/.test(x)), `item menu has Show to a chat (${out.menu.slice(0, 12)})`);
  await clickRow(/^Show to a chat/);
  out.sub = menuRows();
  await smoke({ shot: '/tmp/eyes-menu.png' });
  ok(out.sub.some((x) => x.startsWith(C.name)) && out.sub.some((x) => /Ask about it/.test(x)), `its submenu: chats + Ask about it (${out.sub})`);
  v.attachments.length = 0;
  await clickRow(new RegExp(`^${C.name}`));
  await until(() => v.attachments.some((a) => a.kind === 'image'), 8000);
  ok(v.attachments.some((a) => a.kind === 'image') && H.activeId === C.id, 'clicking a chat attaches the picture there and goes to it');
  closeMenu();

  // a clip: frames, one per shot
  activate('tool:board'); await wait(300);
  Board.select([clip.id]);
  const items = BoardEyesUI.itemsMenu([clip], b)[0].items();
  ok(items.some((x) => /frames/.test(x.label || '')) && items.some((x) => /per shot/.test(x.label || '')), 'a clip offers its frames / one per shot');
  v.attachments.length = 0;
  await items.find((x) => /per shot/.test(x.label || '')).action();
  ok(v.attachments.filter((a) => a.kind === 'image').length === 1, 'one frame per shot: one contact sheet');
  // two items: side by side
  activate('tool:board'); await wait(300);
  const two = BoardEyesUI.itemsMenu([pic, clip], b)[0].items();
  ok(two.some((x) => /Side by side/.test(x.label || '')), 'two items: side by side');

  // the board menu: show the whole board, Pinterest
  const bm = Board._.boardItems();
  const pinItems = bm.find((x) => /Pinterest/.test(x.label)).items();
  out.pinMenu = pinItems.map((x) => x.label || x).slice(0, 8);
  ok(pinItems.filter((x) => /^📌/.test(x.label || '')).length >= 3, 'Pinterest: searches from the board');
  // a frame: show the frame
  Board.select([pic.id]); Board.frameSelection(); await wait(100);
  const fr = b.items.find((i) => i.type === 'frame');
  const fx = Board._.itemExtras([fr]);
  ok(fx.some((x) => /Show this frame/.test(x.label)) && !fx.some((x) => x.label === 'Show to a chat'), 'a frame: show this frame (one entry)');
  Board.removeItems([fr.id]);

  // the drawer: tile right-click, Alt+drop = the picture, plain drop = the vibe
  activate(C.id); await wait(300);
  BoardDrawer.toggle(true);
  await until(() => document.querySelectorAll('.bdd-tile').length >= 2, 5000);
  const tile = document.querySelector('.bdd-tile');
  const tr = tile.getBoundingClientRect();
  tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: tr.left + 5, clientY: tr.top + 5 }));
  await wait(200);
  out.tileMenu = menuRows();
  ok(out.tileMenu.some((x) => /Show it to a chat/.test(x)) && out.tileMenu.some((x) => /Ask about it/.test(x)), 'drawer tile: show / ask');
  closeMenu();
  const drop = async (altKey) => {
    const dt = new DataTransfer();
    tile.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const ta = v.input; const q = ta.getBoundingClientRect();
    ta.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: q.left + 10, clientY: q.top + 10, altKey }));
    ta.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: q.left + 10, clientY: q.top + 10, altKey }));
  };
  v.attachments.length = 0;
  await drop(true);
  await until(() => v.attachments.length >= 2, 8000);
  ok(v.attachments.some((a) => a.kind === 'image') && v.attachments.some((a) => /board ids/.test(a.name)), 'Alt+drop: the picture itself');
  v.attachments.length = 0;
  await drop(false);
  await until(() => v.attachments.length >= 1, 5000);
  ok(v.attachments.length === 1 && /^vibe · /.test(v.attachments[0].name), 'a plain drop still attaches the vibe');
  BoardDrawer.toggle(false);
  v.attachments.length = 0;

  // an item dragged off the board onto a chat: shown there, the item goes back
  const ta = v.input; const q = ta.getBoundingClientRect();
  activate(C.id); await wait(200);
  const before = { x: pic.x, y: pic.y };
  pic.x += 900; pic.y += 300; // where the drag left it
  const moved = Board._.dropOut({ clientX: q.left + 20, clientY: q.top + 10, altKey: false }, { items: [pic], start: new Map([[pic.id, before]]) });
  await until(() => v.attachments.some((a) => a.kind === 'image'), 8000);
  ok(moved && pic.x === before.x && pic.y === before.y && v.attachments.some((a) => a.kind === 'image'), 'drag off the board onto a chat: shown there, the item stays put');
  v.attachments.length = 0;

  // alt text from the menu, /board completion, keys
  Board.select([pic.id]);
  await Commands.tryRun('/board-alt a warm hill at dusk', C.id, null, { say: () => {}, note: () => {} });
  ok(pic.alt === 'a warm hill at dusk' && /seen "a warm hill/.test(BoardVibe.text(pic)), '/board-alt saves the alt text (in the vibe text after)');
  const comp = Commands.get('board').complete('', { agentId: C.id });
  ok(['look', 'watch', 'compare', 'find', 'pinterest'].every((w) => comp.some((x) => x.value === w)), '/board completes its new words');
  const comp2 = Commands.get('board').complete('pinterest y', { agentId: C.id });
  ok(comp2.some((x) => x.value === 'pinterest y2k'), '/board pinterest completes aesthetics');
  const keys = (Keys.groups(true).get('Board') || []).map((k) => `${k.keys} ${k.what}`).join('\n');
  ok(/Alt\+drop a drawer tile/.test(keys) && /Click an item id/.test(keys), 'keys listed in the keys sheet');
  ok(!Commands.duplicates().length, 'no duplicate commands');
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: fail.length === 0, fail, ...out }, null, 1);
