// Habits (habits.js): errors are counted (an error toast, a failed reply), /habits reports usage, never-used buttons
// and the top errors with their fix; after a week of tracking, never-used buttons on a screen go behind Alt the first
// time it's opened (with Undo), and /habits tidy off stops that.
//   node dev/smoke.js --fake-engines --script dev/checks/habits.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); };
const run = async (line) => { let text = ''; const r = await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text || (typeof r === 'string' ? r : ''); };
await wait(1500);
toast('Couldn\'t load /Users/me/clip-01.mp4 (code 4)\n\nFix: install ffmpeg', { type: 'error' });
toast('Couldn\'t load /Users/me/clip-02.mp4 (code 4)', { type: 'error' });
await wait(300);
const errs = Habits.top(5);
ok(errs[0]?.n === 2 && /‹path›/.test(errs[0].key) && /install ffmpeg/.test(errs[0].fix || ''), 'the same error with another path counts once, twice, with its fix');
const rep = await run('/habits');
ok(/Your habits/.test(rep) && /goes wrong most/.test(rep) && /install ffmpeg/.test(rep), '/habits shows the report with the top error and its fix');
// a week of tracking: a visible button on the board never used
Usage.data.since = Date.now() - 10 * 864e5;
activate('tool:board'); await wait(2500);
const root = H.surfaces.get('tool:board').el;
const cand = [...root.querySelectorAll('button')].filter((b) => b.checkVisibility?.({ visibilityProperty: true }) && Usage.keyOf(b)).slice(0, 2);
for (const b of cand) Usage.data.items[Usage.keyOf(b)] = { n: 0, first: Date.now() - 9 * 864e5, label: b.textContent.trim() || b.title, area: 'Board' };
store.set('habits.tidied', {});
activate(H.claudeAgent().id); await wait(400); activate('tool:board'); Usage.open('tool:board'); await wait(3500);
const tucked = Declutter.mine().filter((m) => m.area === 'board');
ok(cand.length && tucked.length >= 1, 'opening the board tucked its never-used buttons behind Alt');
ok([...document.querySelectorAll('#toasts .toast, .toast')].some((t) => /Tidied/.test(t.textContent)), 'with one quiet note (Undo)');
const r2 = await run('/habits tidy off');
ok(/off/.test(r2) && store.get('habits.tidy') === false, '/habits tidy off stops it');
return JSON.stringify({ problems, errs: errs.slice(0, 2).map((e) => [e.n, e.key]), cand: cand.map((b) => Usage.keyOf(b)), tucked }, null, 1);
