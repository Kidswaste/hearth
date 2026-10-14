// Pinterest for the board (round 14): searches made from the board's vibe (and an aesthetic), the in-app window on a
// local Pinterest-like page (dev/fixtures/pinterest-like.html; its own 'persist:pinterest' session), a real click on
// "＋ Board" over a pin (trusted input events from the main process) adds its largest picture to the board with the pin
// link kept as the source, a pin dragged out keeps its link too, only Pinterest / local pages can be the window,
// /board pinterest + /board-pinterest, the chat's board_do pinterest, and the Apps registry when there is one.
//   sh dev/board-fixtures.sh && node dev/smoke.js --check-timeout 300000 --script dev/checks/eyes-pins.js
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const notes = [];
const run = async (line, id = C.id) => { notes.length = 0; await Commands.tryRun(line, id, null, { say: (t) => notes.push({ t: String(t) }), note: (t, o) => notes.push({ t: String(t), actions: o?.actions || [] }) }); return notes; };
const P = window.hub.board.pins;
try {
  activate(C.id);
  await until(() => Native.hasView(C.id));
  activate('tool:board');
  await until(() => Board.isMounted());
  await Board.create('Pins board');
  const b = Board.current();
  await Board.addFiles([`${FIX}/neon big.png`]);
  await until(() => b.items[0]?.vibe, 30000);

  // searches from the board's vibe, and with an aesthetic
  const s1 = await BoardPins.forBoard(b);
  const s2 = await BoardPins.forBoard(b, 'y2k');
  out.fromBoard = s1; out.y2k = s2.phrases;
  ok(s1.phrases.length >= 3 && s1.colors.length >= 1, 'searches from the board (phrases + color words)');
  ok(s2.phrases[0] === 'y2k aesthetic' && s2.phrases.includes('y2k chrome aesthetic') && s2.phrases.some((p) => !/y2k/.test(p)), 'an aesthetic leads, the board\'s vibe follows');

  // only Pinterest or a local page can be the window
  const evil = await P('url', { query: 'x', base: 'https://evil.example/?q={q}' });
  ok(/^https:\/\/www\.pinterest\.com\/search\/pins\/\?q=x$/.test(evil.url), `other sites are refused (${evil.url})`);
  const real = await P('url', { query: 'neon night' });
  ok(real.url === 'https://www.pinterest.com/search/pins/?q=neon%20night', 'Pinterest search address');

  // the window, on the local Pinterest-like page
  const base = 'file:///tmp/hearth-pins-fixture/pinterest-like.html?q={q}'; // dev/fixtures/pinterest-like.html (dev/run-checks.js copies it)
  Board.setPref('pinBase', base);
  await BoardPins.open('neon night');
  await until(async () => (await P('state')).open && /q=neon/.test((await P('state')).url), 15000);
  await wait(800);
  const st = await P('state');
  out.state = st;
  ok(st.open && st.partition === 'persist:pinterest' && /Pins board/.test(st.title || ''), 'the window opens on the search, its own session, the board in its title');

  // a real click on "＋ Board" over the second pin (its srcset's largest picture)
  const before = b.items.length;
  const clicked = await P('test-click', { n: 1 });
  out.clicked = clicked;
  await until(() => b.items.length > before && b.items.at(-1).source, 20000);
  const pin = b.items.at(-1);
  out.pin = { type: pin?.type, title: pin?.title, source: pin?.source, credit: pin?.credit, tags: pin?.tags, src: pin?.src };
  ok(clicked.ok && pin && pin.type === 'image' && /\/pin\/202\/$/.test(pin.source || ''), 'the pin is on the board with its link as the source');
  ok(pin?.credit === 'Pinterest' && pin.tags?.includes('pinterest') && pin.title === 'Neon pink and teal blocks', 'credit, tag and the pin title');
  await until(() => pin.natural, 20000);
  ok(pin?.natural?.[0] === 2400, `its largest picture was taken (${pin?.natural})`);
  ok(/1 added/.test((await P('state')).title || '') || BoardPins._.added >= 1, 'the window counts what was added');
  // a gif pin
  const n2 = b.items.length;
  await P('test-click', { n: 2 });
  await until(() => b.items.length > n2, 15000);
  ok(b.items.at(-1)?.type === 'gif' && /\/pin\/303\//.test(b.items.at(-1).source || ''), 'a gif pin stays a gif');

  // a pin dragged out of the window and dropped on the board keeps its link
  const img = `file://${FIX}/golden-hour.jpg`;
  BoardPins.noteDrag({ image: img, link: 'https://www.pinterest.com/pin/999/', title: 'Dragged pin' });
  const dropped = await Board.addUrl(img);
  await until(() => dropped.source, 5000);
  ok(dropped?.source === 'https://www.pinterest.com/pin/999/' && dropped.credit === 'Pinterest', 'a dragged pin keeps its link');

  // from the chat: /board pinterest <words> opens the first search and offers the others as buttons
  const r = await run('/board pinterest dark academia');
  out.cmd = r.map((x) => ({ t: x.t.slice(0, 160), actions: x.actions?.map((a) => a.label) }));
  await until(async () => /dark%20academia/.test((await P('state')).url || ''), 8000);
  ok(r[0]?.actions?.length >= 3 && /dark academia/.test(r[0].actions[0].label), '/board pinterest: buttons');
  ok(/dark%20academia/.test((await P('state')).url || ''), '/board pinterest <words> opens the window on it');
  r[0].actions[1].run(); await wait(400);
  ok((await P('state')).url.includes(encodeURIComponent(r[0].actions[1].label.replace(/^📌 /, ''))), 'a button opens its search');
  const r2 = await run('/board-pinterest');
  ok(r2[0]?.actions?.length >= 2, '/board-pinterest from the board alone');
  // the chat tool
  const t = await HubBridge.call('board_do', { op: 'pinterest', phrases: ['chrome type', 'Liquid metal <b>'] });
  ok(t.ok && t.value.searches.join('|') === 'chrome type|liquid metal b' && t.eyes.pins.length === 2, 'board_do pinterest: cleaned phrases for the chat card');
  const t2 = await HubBridge.call('board_do', { op: 'pinterest', aesthetic: 'brutalist' });
  ok(t2.ok && t2.value.searches.includes('brutalist graphic design'), 'board_do pinterest from an aesthetic');

  // the Apps registry (round 14, apps stream) when it exists
  // (round 35, bugbash2) the app registry is there since round 14 and BoardPins registered on load (its window replaces
  // the apps stream's stand-in): the check swapped in a fake window.Apps after that, which the module never reads again
  const pinApp = typeof Apps !== 'undefined' ? Apps.get?.('pinterest') : null;
  ok(pinApp && !pinApp.fallback && typeof pinApp.open === 'function' && /Board/.test(pinApp.describe?.() || ''), 'registers a Pinterest app when Apps exists');
  await P('close');
  await until(async () => !(await P('state')).open, 5000);
  ok(!(await P('state')).open, 'the window closes');
  Board.setPref('pinBase', undefined);
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: fail.length === 0, fail, ...out }, null, 1);
