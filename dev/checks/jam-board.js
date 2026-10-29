// (Oct 29) a jam whose idea names a mood board gives that board's look to every build and direction turn.
//   node dev/smoke.js --fake-engines --script dev/checks/jam-board.js --wait 6000 --check-timeout 400000
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const C = H.claudeAgent();
await Lazy.load('board'); await Board.ready();
const b = await Board.create('Glasswing', { quiet: true, open: true });
Board.addNote('cold teal neon, rain on glass, slow and moody', undefined, {}, Board.current());
Board.addSwatch(['#0b3d4a', '#19c3c9', '#e8f6f7'], undefined, {}, Board.current());
await Board.save?.(Board.current());
activate('tool:three');
await until(() => window.ThreeLab?.scenes?.currentId?.(), 30000);
await Commands.tryRun('/jam 2 use the glasswing moodboard for a rainy night', C.id);
const m = await until(() => Jam.latest(), 30000);
await until(() => !Jam.running(), 300000);
// the prompts each turn got, built again from the finished jam (the same functions the turns used)
const T = Jam._test; const lead = { key: 'claude' };
const builds = m.list.map((R, i) => T.buildPrompt(m, R, lead, {}, m.list[i - 1] || null));
const directs = m.list.filter((R) => R.build).map((R) => T.directPrompt(m, R, { key: 'astra' }, {}));
const has = (t) => t.includes('The mood board "Glasswing"') && /teal neon/.test(t);
const out = { status: m?.status, board: m?.board?.name, note: (m?.notes || []).find((n) => /mood board/.test(n)), builds: builds.length, buildsWithBoard: builds.filter(has).length, directs: directs.length, directsWithBoard: directs.filter(has).length, sample: directs[0]?.slice(0, 400) };
out.ok = out.status === 'done' && out.board === 'Glasswing' && builds.length > 0 && out.buildsWithBoard === builds.length && directs.length > 0 && out.directsWithBoard === directs.length;
// without a board named (and no project): nothing added
await Commands.tryRun('/jam 1 a plain test', C.id);
const m2 = await until(() => Jam.latest()?.id !== m.id && Jam.latest(), 30000);
await until(() => !Jam.running(), 300000);
out.plainHasBoard = Boolean(m2?.board) || m2.list.some((R, i) => T.buildPrompt(m2, R, lead, {}, m2.list[i - 1] || null).includes('The mood board'));
out.ok = out.ok && !out.plainHasBoard;
return JSON.stringify(out);
