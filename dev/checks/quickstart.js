// "What can I do here?" (round 31, quickstart): one calm card per window. Checks: the card's group is not loaded at
// the first screen; by itself only the first time a chat opens (× = gone for good, never again by itself); the chat's
// right-click menu and AI setup's "?" open it; a long chat puts "What did we decide?" first and its click opens the
// recall card (then it's off the card); the Lab toolbar's ⋯ opens it in the Lab; an empty scene → Describe it and the
// gallery first, and the Lab's own chips step aside while the card is up; a song loaded → "React to the drums", one
// click sets the director's mission; the board's ⋯ opens it; an empty board → Add first; pictures → Find images like
// this first; Discover's daily tip doesn't pop up by itself; nothing is sent to any AI.
//   node dev/smoke.js --fake-engines --check-timeout 180000 --script dev/checks/quickstart.js --shot /tmp/quickstart.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const fail = []; const out = { steps: [] };
const ok = (c, what, info) => { out.steps.push(`${c ? '✓' : '✗'} ${what}${info === undefined ? '' : ` · ${JSON.stringify(info).slice(0, 300)}`}`); if (!c) fail.push(what); return Boolean(c); };
const lz = (n) => Lazy.state().find((g) => g.name === n)?.state;
const card = () => document.querySelector('.qs-card:not(.qs-out)');
const rows = () => [...document.querySelectorAll('.qs-card:not(.qs-out) .qs-row')].map((b) => b.dataset.qs);
const menuClick = async (re) => { const it = await until(() => [...document.querySelectorAll('button')].find((x) => re.test(x.textContent) && x.offsetParent && !x.closest('.qs-card, .surface'))); it?.click(); return Boolean(it); };
const C = H.claudeAgent();
let sends = 0;
Native.hooks.send.push(() => { sends += 1; });
try {
  ok(lz('quickstartui') === 'stub', 'first screen: the card\'s group is not loaded', lz('quickstartui'));
  await until(() => lz('quickstart') === 'loaded', 20000);
  ok(typeof QuickstartHooks !== 'undefined' && Commands.get('what-can-i-do')?.name === 'what-can-i-do', 'the ways in are there (and /what-can-i-do)');
  ok(Commands.duplicates ? !Commands.duplicates().length : true, 'no duplicate commands', Commands.duplicates?.());

  // ---------- by itself, once, the first time a chat opens ----------
  store.set('quickstart.testAuto', true); // (never by itself in test runs otherwise)
  activate('tool:board'); await wait(300); activate(C.id);
  const auto = await until(() => card(), 15000);
  ok(auto && auto.dataset.place === 'chat' && auto.closest('.surface')?.dataset.id === C.id, 'the first time a chat opens: the card, by itself, in that chat', auto?.dataset.place);
  ok(rows().length >= 3 && rows().length <= 5, '3–5 things to try', rows());
  ok(lz('quickstartui') === 'loaded', 'its group loaded then');
  ok(store.get('quickstart', {}).seen?.chat, 'seen: noted');
  await smoke({ shot: '/tmp/quickstart-chat.png' });
  document.querySelector('.qs-card .qs-x').click();
  await wait(300);
  ok(!card() && store.get('quickstart', {}).gone?.chat === true, '× = gone for good');
  activate('tool:board'); await wait(400); activate(C.id); await wait(3500);
  ok(!card() || card().dataset.place !== 'chat', 'never again by itself in a chat');
  store.set('quickstart.testAuto', false);
  Quickstart.close();

  // ---------- a long chat: "What did we decide?" first ----------
  const now = Date.now();
  const msgs = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i === 10 ? "Let's go with Inter for the titles." : `message ${i} about the intro`, at: now - (40 - i) * 6e4 }));
  const long = { id: 'qs-long', agentId: C.id, title: 'Intro (long)', createdAt: now - 3e6, updatedAt: now, messages: msgs };
  await window.hub.saveChat(long); Native.save(long);
  Native.open(C.id, 'qs-long'); await wait(500);
  const items = Native.chatMenuItems(C.id);
  const mi = items.find((x) => x && /What can I do here/.test(x.label || ''));
  ok(mi, 'the chat\'s right-click menu has "✦ What can I do here?"');
  mi?.action();
  await until(() => card());
  ok(rows()[0] === 'chat-recall', 'a long chat → "What did we decide?" first', rows());
  ok(rows().includes('chat-fresh'), 'a long chat → carry on in a fresh chat');
  document.querySelector('.qs-card:not(.qs-out) .qs-row[data-qs="chat-recall"]').click();
  const rec = await until(() => document.querySelector('.recall-dlg[open]'), 15000);
  ok(rec && !card(), 'one click: the recall card opens (the quickstart card goes)');
  document.querySelector('.recall-dlg[open]')?.close();
  const after = (await Quickstart.list('chat', C.id)).map((x) => x.id);
  ok(!after.includes('chat-recall'), 'tried: off the card for good', after);

  // ---------- AI setup's "?" ----------
  document.querySelector(`.surface[data-id="${C.id}"] .native-head button[aria-label="Chat options"]`)?.click();
  const q = await until(() => document.querySelector('.opt-sheet .qs-ask'), 10000);
  ok(q, 'AI setup (the chat\'s ⋯) has a small "?"');
  q?.click();
  await until(() => card());
  ok(card()?.dataset.place === 'chat' && !document.querySelector('aside.opt-sheet'), '"?": the card in the chat, AI setup steps away');
  // a mission from the card: one click, the ◎ shows it, nothing sent
  const plan = document.querySelector('.qs-card:not(.qs-out) .qs-row[data-qs="chat-plan"]');
  if (plan) { plan.click(); await wait(200); ok(Missions.current(C.id).id === 'plan', 'Plan first: the next message\'s mission is set (nothing sent)'); Missions.set(C.id, 'normal'); }
  Quickstart.close();

  // ---------- the Lab ----------
  await Commands.tryRun('/director-setup', C.id);
  await until(() => H.agents().some((a) => a.dock === 'three'), 15000);
  const dir = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  await ThreeLab.cmd({ show: true });
  await until(() => typeof LabInstantHook !== 'undefined', 15000);
  const shape = ThreeLayers.TEMPLATES.find((x) => x.id === 'empty');
  const blank = ThreeLab.scenes.create({ name: 'QS blank', code: shape.code, layers: [ThreeLayers.defaults({ name: 'Shape', code: shape.code, slot: 0 })] });
  ThreeLab.director.openSketch(blank.id);
  await wait(1500);
  LabInstantHook.paint();
  await until(() => document.querySelector('.lab-inst-empty'), 4000);
  document.querySelector('[data-feature="Lab more"]')?.click();
  const labRow = await menuClick(/What can I do here/);
  ok(labRow, 'the Lab toolbar\'s ⋯ has "✦ What can I do here?"');
  if (!labRow) await QuickstartHooks.open('lab');
  await until(() => card());
  ok(card()?.dataset.place === 'lab' && card().closest('.surface')?.dataset.id === 'tool:three', 'the card in the Lab');
  ok(rows().slice(0, 2).join() === 'lab-describe,lab-gallery', 'an empty scene → Describe it, then Start from something like…', rows());
  const chip = document.querySelector('.lab-inst-empty');
  ok(!chip || getComputedStyle(chip).display === 'none', 'the Lab\'s own first-run chip steps aside while the card is up');
  await smoke({ shot: '/tmp/quickstart-lab.png' });
  Quickstart.close();
  await wait(200);
  ok(!chip || getComputedStyle(chip).display !== 'none', '…and comes back after');

  // a song loaded → React to the drums
  const SONG = '/tmp/hearth-test-song.wav';
  ThreeLab.director.openSketch(ThreeLab.scenes.all().find((s) => s.id !== blank.id)?.id || blank.id);
  await wait(800);
  const r = await ThreeLab.peek().loadSong(SONG);
  await until(() => ThreeLab.peek().state.song, 10000);
  const ctx = await Quickstart.context('lab');
  ok(r?.ok !== false && ctx.song && ctx.director, 'a song on the scene', ctx);
  await QuickstartHooks.open('lab');
  await until(() => card());
  ok(rows()[0] === 'lab-drums', 'a song loaded → "React to the drums" first', rows());
  document.querySelector('.qs-card:not(.qs-out) .qs-row[data-qs="lab-drums"]')?.click();
  await wait(300);
  ok(Missions.current(dir.id).id === 'lab-stems', 'one click: the director\'s next message reacts to the drums (nothing sent)', Missions.current(dir.id).id);
  Missions.set(dir.id, 'normal');

  // ---------- the board ----------
  activate('tool:board');
  await until(() => typeof Board !== 'undefined' && Board.isMounted(), 15000);
  await Board.create('QS board');
  await wait(400);
  await Board._.boardMenu({ currentTarget: document.querySelector('.bd-boardbtn') });
  const bRow = await menuClick(/What can I do here/);
  ok(bRow, 'the board\'s ⋯ has "✦ What can I do here?"');
  await until(() => card());
  ok(card()?.dataset.place === 'board' && rows()[0] === 'board-add', 'an empty board → Add pictures first', rows());
  Quickstart.close();
  await Board.addFiles(['/tmp/hearth-board-fixtures/neon big.png', '/tmp/hearth-board-fixtures/golden-hour.jpg']);
  await until(() => Board.items().length >= 2, 10000);
  await QuickstartHooks.open('board');
  await until(() => card());
  ok(rows()[0] === 'board-pins', 'a board with pictures → "Find images like this" first', rows());
  ok(!rows().includes('board-add'), 'not empty: no "Add" row');
  await smoke({ shot: '/tmp/quickstart-board.png' });
  // right-click a row: not for me
  const vibeRow = document.querySelector('.qs-card:not(.qs-out) .qs-row[data-qs="board-vibe"]');
  if (vibeRow) {
    vibeRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }));
    ok(await menuClick(/Not for me/), 'right-click a row: "Not for me"');
    ok(!(await Quickstart.list('board')).some((x) => x.id === 'board-vibe'), '…and it stays off');
  }
  Quickstart.close();

  // ---------- one place for things to try ----------
  const tipBefore = document.querySelector('.dc-tip');
  if (typeof Discover !== 'undefined') ok((await Discover.maybeTip()) === null && !tipBefore, 'Discover\'s daily tip doesn\'t pop up by itself next to the card');
  ok(sends === 0, 'nothing was sent to any AI', sends);
  ok(!card(), 'closed at the end');
} catch (err) { fail.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
