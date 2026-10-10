// Round 11 (pack11) on the mood board: copied items paste after a restart (kept in storage), bare addresses and
// link lists become website cards, smart collections (saved + the board's moods), vibe groups in named frames, the
// clips on a timeline (shots, pace), palette → Lab look, the agents' board_do, the Board menu entries.
//   sh dev/board-fixtures.sh && node dev/smoke.js --script dev/checks/board-pack.js
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = { steps: [] }; const fail = [];
const ok = (cond, what, info) => { out.steps.push(`${cond ? '✓' : '✖'} ${what}${info === undefined ? '' : ` · ${JSON.stringify(info).slice(0, 300)}`}`); if (!cond) fail.push(what); return cond; };
const X = Board._;
const said = []; const run = async (line) => { said.length = 0; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => said.push(String(t)), error: (m) => said.push(`ERROR ${m}`) }); return said.join('\n'); };
try {
  activate('tool:board');
  await until(() => Board.isMounted() && Board.current());
  ok(['board-collection', 'board-groups', 'board-lab-look', 'board-timeline'].every((n) => Commands.get(n)), 'the pack commands are registered');
  const added = await Board.addFiles([`${FIX}/neon big.png`, `${FIX}/golden-hour.jpg`, `${FIX}/cuts.mp4`, `${FIX}/calm.mp4`, `${FIX}/loop.gif`]);
  await until(() => added.every((i) => Board.item(i.id)?.vibe), 60000);
  ok(added.every((i) => Board.item(i.id)?.vibe), 'five references with their vibe read');

  // copy → paste keeps working without the in-memory copy (a restart): the items are kept in storage
  Board.select([added[0].id, added[1].id]);
  X.copy();
  const kept = store.get('board.clip', null);
  ok(kept?.items?.length === 2, 'copied items are kept for a later paste', kept?.items?.length);
  const n0 = Board.items().length;
  ok(X.pasteItems(`hearth-board-items:2\nwhatever`), 'the board takes its own copied items back');
  ok(Board.items().length === n0 + 2, 'two items pasted', Board.items().length - n0);
  ok(X.pasteItems('plain text') === false, 'plain text still pastes as before (not swallowed)');

  // websites: a bare address, a list of links
  const nWeb = Board.items().filter((i) => i.type === 'web').length;
  await Board.addTextSmart('example.com/page');
  await until(() => Board.items().some((i) => i.type === 'web' && i.url === 'https://example.com/page'), 5000);
  ok(Board.items().some((i) => i.type === 'web' && i.url === 'https://example.com/page'), 'a bare address becomes a website card');
  await Board.addTextSmart('https://one.example/\nhttps://two.example/\nhttps://three.example/');
  await until(() => Board.items().filter((i) => i.type === 'web').length >= nWeb + 4, 8000);
  ok(Board.items().filter((i) => i.type === 'web').length === nWeb + 4, 'a list of links becomes one card each', Board.items().filter((i) => i.type === 'web').length - nWeb);
  ok(!Board.items().some((i) => i.type === 'note' && /one\.example/.test(i.text || '')), 'not a note full of links');

  // smart collections
  const moods = BoardPack.moodCollections(Board.items());
  out.moods = moods.map((m) => `${m.name} ${m.n}`);
  await run('/board-collection save Clips clip');
  ok(Board.current().collections?.some((c) => c.name === 'Clips'), 'a saved collection lives on the board', said);
  await run('/board-collection show Clips');
  ok(Board.selected().length >= 2 && Board.selected().every((i) => i.type === 'video'), '/board-collection show lights up and selects its references', Board.selected().map((i) => i.type));
  const dimmed = [...X.S.nodes.values()].filter((n) => n.classList.contains('bd-dim')).length;
  ok(dimmed > 0, 'the rest is dimmed like a search', dimmed);
  await Board.addFiles([`${FIX}/calm.mp4`]);
  await wait(300);
  ok(X.matches('clip').length >= 3, 'a collection stays live: a new clip joins it', X.matches('clip').length);
  X.applyFilter(null);
  const listTxt = await run('/board-collection');
  ok(/Clips \(clip\): \d/.test(listTxt), '/board-collection lists the saved ones (and the board\'s moods)', listTxt.slice(0, 160));

  // vibe groups in named frames
  const frames0 = Board.items().filter((i) => i.type === 'frame').length;
  const gtxt = await run('/board-groups');
  const framesNow = Board.items().filter((i) => i.type === 'frame');
  ok(framesNow.length > frames0 && framesNow.length - frames0 >= 2, '/board-groups frames alike references together', { said: gtxt.slice(0, 200), frames: framesNow.length - frames0 });
  const fr = framesNow.find((f) => !Board.items().slice(0, 0).includes(f));
  const inside = (f, i) => i.x >= f.x && i.y >= f.y && i.x + (i.w || 0) <= f.x + f.w + 1 && i.y + (i.h || 0) <= f.y + f.h + 1;
  const newFrames = framesNow.slice(0, framesNow.length - frames0);
  ok(newFrames.every((f) => f.title && Board.items().some((i) => i.type !== 'frame' && inside(f, i))), 'each group frame is named and holds its references', newFrames.map((f) => f.title));
  Board.undo(); await wait(200);
  ok(Board.items().filter((i) => i.type === 'frame').length === frames0, 'Ctrl+Z undoes the grouping');

  // the clips on a timeline
  await run('/board-timeline');
  const tl = document.querySelector('.bdp-timeline');
  ok(tl && tl.querySelectorAll('.bdp-row').length >= 2 && tl.querySelectorAll('.bdp-shot').length >= 3, 'the clips on a timeline: one row each, a block per shot', tl && { rows: tl.querySelectorAll('.bdp-row').length, shots: tl.querySelectorAll('.bdp-shot').length });
  const r = tl?.getBoundingClientRect();
  ok(r && r.width > 300 && r.bottom <= innerHeight && r.left >= 0, 'it fits on screen', r && { w: r.width, b: r.bottom });
  await smoke({ shot: '/tmp/board-shots/pack-timeline.png' });
  tl?.querySelector('.bdp-head button:last-child')?.click();
  ok(!document.querySelector('.bdp-timeline'), '✕ closes it');

  // board_do for the agents
  const t1 = await BoardPack.handle('board_do', { op: 'timeline' });
  const t2 = await BoardPack.handle('board_do', { op: 'collections' });
  const t3 = await BoardPack.handle('board_do', { op: 'nope' });
  ok(t1.ok && /cuts|one shot/.test(t1.value) && t2.ok && t2.value.saved.some((c) => c.name === 'Clips') && !t3.ok, 'board_do: timeline, collections, a clear error', [t1.value?.slice?.(0, 120), t3.error]);

  // menus
  const labels = X.boardItems().map((x) => x.label);
  ok(['Collections', 'Group by vibe (framed, named)', 'Palette → Lab look', 'Clips on a timeline'].every((l) => labels.includes(l)), 'the Board menu has the pack', labels.slice(-6));
  Board.select([added[2].id, added[3].id]);
  const extras = X.itemExtras(Board.selected()).map((x) => x.label);
  ok(extras.includes('Group these by vibe') && extras.includes('Clips on a timeline'), 'right-click on a selection has them too', extras);

  // palette → Lab look
  Board.select([]);
  const lt = await run('/board-lab-look Board night');
  const lab = await ThreeLab.cmd({ show: false });
  const pal = lab.palette();
  ok(/Lab palette #/.test(lt) && pal.length >= 2, '/board-lab-look puts the board palette on the Lab sketch', { said: lt.slice(0, 160), pal });
  activate('tool:board'); await wait(300);
  ok(!Commands.duplicates().length, '0 duplicate command names', Commands.duplicates());
} catch (err) { ok(false, `crashed: ${err.message}`, String(err.stack).split('\n').slice(0, 3).join(' | ')); }
out.ok = !fail.length;
out.fail = fail;
return JSON.stringify(out, null, 1);
