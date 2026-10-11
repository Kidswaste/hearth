// Jank watch (round 20): long frames induced in known places are counted and, through a short profile, attributed to
// their file:line, function and area;
// a slow click counts as a slow input of the area it happened in; typing makes Jank.busy() true and holds
// background work until the gesture ends; the Lab's stats, a GPU loss and the main process's lag land in the log;
// /smooth reports it all with Copy for Claude; /smooth off / on / reset.
// Two fixture scripts are written into the throwaway copy (board-jankfixture.js, tools/three-jankfixture.js) so the
// long frames come from real files with known lines.
//   node dev/smoke.js --script dev/checks/jankwatch.js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await sleep(100); } return false; };
const out = { ok: [], bad: [], info: {} };
const check = (what, ok, detail = '') => (ok ? out.ok : out.bad).push(`${what}${detail ? `: ${detail}` : ''}`);
const mouse = (type, x, y) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'left', clickCount: 1 } });
const key = (type, k) => smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, text: type === 'keyDown' ? k : undefined } });

check('Jank loaded early, report lazy', typeof Jank === 'object' && Lazy.state().some((g) => g.name === 'jankwatch' && g.state === 'stub'), JSON.stringify(Lazy.state().find((g) => g.name === 'jankwatch')));
check('Long Animation Frames supported here', PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'));
await Jank.reset();

// ---------- fixtures: two real files with known lines ----------
const dir = decodeURIComponent(location.pathname.replace(/[^/]*$/, ''));
const BOARD = `// jank fixture (dev/checks/jankwatch.js)
function jankBoardTimer() { const t = Date.now(); let x = 0; while (Date.now() - t < 140) { for (let i = 0; i < 2000; i += 1) x += Math.sqrt(i * x + 1); } return x; }
function jankThrash() { const d = document.body; const t = Date.now(); while (Date.now() - t < 90) { d.style.paddingTop = (Math.random() * 2) + 'px'; void d.offsetHeight; } d.style.paddingTop = ''; }
window.jankFix = { ...(window.jankFix || {}), board: jankBoardTimer, thrash: jankThrash };
function jankBoardLater() { const t = Date.now(); let x = 0; while (Date.now() - t < 140) { for (let i = 0; i < 2000; i += 1) x += Math.sqrt(i * x + 1); } return x; }
window.jankFix.later = jankBoardLater;
`;
const LAB = `// jank fixture (dev/checks/jankwatch.js)

function jankLabClick() { const t = Date.now(); let x = 0; while (Date.now() - t < 160) { for (let i = 0; i < 2000; i += 1) x += Math.sqrt(i * x + 1); } return x; }
window.jankFix = { ...(window.jankFix || {}), lab: jankLabClick };
`;
await window.hub.fs.write(`${dir}board-jankfixture.js`, BOARD);
await window.hub.fs.write(`${dir}tools/three-jankfixture.js`, LAB);
for (const f of ['board-jankfixture.js', 'tools/three-jankfixture.js']) await new Promise((r) => { const s = document.createElement('script'); s.src = f; s.onload = r; s.onerror = r; document.head.append(s); });
check('fixtures loaded', typeof window.jankFix?.board === 'function' && typeof window.jankFix?.lab === 'function');

// ---------- 1–3. long frames from known places while a short profile runs ----------
// (file:// scripts aren't named by Long Animation Frames in Chromium: the profile names them)
const claude = H.claudeAgent();
activate(claude.id); await sleep(600);
const lf0 = Object.values(Jank._test.live()?.a || {}).reduce((a, x) => a + x.lf, 0);
const prof = Jank.profile(3500, 'asked');
await sleep(300);
setTimeout(window.jankFix.board, 0); // 1. a timer in board-jankfixture.js (line 2)
await sleep(500);
setTimeout(window.jankFix.thrash, 0); // 2. layout read after write in a loop (line 3)
await sleep(500);
// 3. a slow click: its handler in tools/three-jankfixture.js (line 3)
let clicks = 0;
const btn = document.createElement('button');
btn.textContent = 'jank'; btn.style.cssText = 'position:fixed;left:45%;top:45%;z-index:2147483647;width:90px;height:44px';
btn.addEventListener('click', () => { clicks += 1; });
btn.addEventListener('click', window.jankFix.lab);
document.body.append(btn);
await sleep(200);
const r = btn.getBoundingClientRect();
const n0 = Jank._test.live()?.a.chat?.n || 0;
await mouse('mousePressed', r.left + 45, r.top + 22); await mouse('mouseReleased', r.left + 45, r.top + 22);
const pr = await prof;
await sleep(400);
btn.remove();
out.info.profile = (pr.stretches || []).map((x) => `${x.ms}ms ${x.where?.f}:${x.where?.line} ${x.where?.fn} < ${x.entry?.fn} js ${x.js} prog ${x.prog}`);
check('profile ran', !pr.error && pr.stretches?.length >= 2, pr.error || '');
const lfN = Object.values(Jank._test.live()?.a || {}).reduce((a, x) => a + x.lf, 0);
check('long frames counted (≥ 3)', lfN - lf0 >= 3, `${lf0} → ${lfN}`);
const culprits = () => Object.values(Jank._test.live()?.c || {});
const cb = culprits().find((c) => c.f === 'board-jankfixture.js' && c.fn === 'jankBoardTimer');
check('timer → board-jankfixture.js:2 jankBoardTimer, area board', cb && cb.l === 2 && cb.a === 'board' && cb.ms >= 100, JSON.stringify(cb || culprits()));
const ct = culprits().find((c) => c.fn === 'jankThrash');
check('layout thrash → board-jankfixture.js:3 jankThrash', ct && ct.l === 3, JSON.stringify(ct));
const cl = culprits().find((c) => c.f === 'tools/three-jankfixture.js');
check('slow click → tools/three-jankfixture.js:3 jankLabClick, area Lab', clicks === 1 && cl && cl.l === 3 && cl.fn === 'jankLabClick' && cl.a === 'Lab', JSON.stringify(cl || culprits()));
const chat = Jank._test.live()?.a.chat;
check('the click counted as a chat input, slow (≥ 150 ms)', chat && chat.n > n0 && chat.wi >= 150 && chat.h.slice(7).some((x) => x > 0), JSON.stringify(chat));
const why = Object.values(Jank._test.live()?.a || {}).reduce((a, x) => ({ s: a.s + x.s, r: a.r + x.r }), { s: 0, r: 0 });
check('causes split (script / rendering)', why.s > 200, JSON.stringify(why));
check('no automatic profile in a test copy', !(Jank._test.live()?.ad || {})['profile (automatic)']);

// ---------- 4. busy now: typing holds background work ----------
const v = Native.view(claude.id);
let events = 0; const onBusy = () => { events += 1; }; addEventListener('hearth:busy', onBusy);
v.input.focus();
await key('keyDown', 'a'); await key('keyUp', 'a');
check('typing → Jank.busy()', Jank.busy());
const t0 = performance.now(); let waited = -1;
Jank.calm(5000, 'test job').then(() => { waited = performance.now() - t0; });
await key('keyDown', 'b'); await key('keyUp', 'b');
await until(() => waited >= 0, 4000);
check('calm() waited for the typing to end (~0.7 s), then ran', waited > 500 && waited < 3000 && !Jank.busy(), `${Math.round(waited)} ms`);
check('hearth:busy fired on and off', events >= 2, String(events));
removeEventListener('hearth:busy', onBusy);
v.input.value = '';
check('held job counted', Jank._test.live()?.ad['test job'] === 1, JSON.stringify(Jank._test.live()?.ad));

// ---------- 5. the Lab's stats, a GPU loss; no Light-mode toast in a test copy, the toast itself works ----------
for (let i = 0; i < 70; i += 1) Jank.lab({ fps: 20, worst: 120, cap: 0, quality: 0.6, p95: 9, light: false });
const lab = Jank._test.live()?.lab;
check('Lab stats recorded', lab && lab.n === 70 && lab.bad === 70 && lab.q === 0.6, JSON.stringify(lab));
check('no Light-mode suggestion in a test copy', ![...document.querySelectorAll('#toasts .toast')].some((t) => /Light mode/.test(t.textContent)));
Jank._test.suggestLight();
const tt = [...document.querySelectorAll('#toasts .toast')].find((t) => /keeps dropping frames/.test(t.textContent));
check('Light-mode suggestion: a toast with one button', tt && /Light mode/.test(tt.querySelector('button')?.textContent || ''));
tt?.remove();
Jank.gpu('Test view');
check('GPU loss logged', Jank._test.live()?.ev.some((e) => /Test view lost/.test(e.what)));

// ---------- 6. /smooth: report, saved log, Copy for Claude ----------
await sleep(400);
let note = null;
const said = [];
await Commands.tryRun('/smooth', claude.id, null, { note: (t, o) => { note = { t, o }; }, say: (t) => said.push(t) });
await until(() => note || said.length, 6000);
check('/smooth loaded its group', Lazy.loaded('jankwatch'));
const text = note?.t || said.join('\n');
out.info.report = text.slice(0, 1600);
check('report: areas table (long frames where you were)', /\| chat \| \d+ \| [^|]+ \| [^|]+ \| [^|]+ \| [3-9]/.test(text), text.slice(0, 400));
check('report: culprits with file:line and where they started', /board-jankfixture\.js:2/.test(text) && /tools\/three-jankfixture\.js:3/.test(text) && /started from/.test(text), text.slice(0, 1200));
check('report: plain names', /the mood board/.test(text) && /the Lab/.test(text));
check('report: causes, Lab, adapted, profile, GPU', /Why frames ran long/.test(text) && /Lab preview/.test(text) && /test job 1/.test(text) && /short profile/.test(text) && /Test view/.test(text), text.slice(-700));
check('report: Copy for Claude + Last week buttons', note?.o?.actions?.map((a) => a.label).join('|') === '📋 Copy for Claude|Last week', JSON.stringify(note?.o?.actions?.map((a) => a.label)));
const g = await JankReport.gather('day');
const claudeText = JankReport.forClaude(g);
out.info.forClaude = claudeText.slice(0, 1400);
check('Copy for Claude: culprits, areas, main process, suggested target', /1\. .*jankfixture\.js:\d+/.test(claudeText) && /- chat: inputs/.test(claudeText) && /Suggested first target/.test(claudeText), claudeText.slice(0, 400));
const main = g.sum.main;
check('main-process loop lag sampled', main && main.n > 0 && main.max >= 0, JSON.stringify(main));
const saved = await window.hub.kvGet('jank-log', null);
check('kept in kv/jank-log (one hourly bucket)', saved?.hours?.length >= 1 && saved.hours.at(-1).a.chat?.lf >= 3 && Object.keys(saved.hours.at(-1).c).length >= 3, JSON.stringify(saved?.hours?.map((h) => Object.keys(h.a))));
const size = JSON.stringify(saved).length;
check('log stays small', size < 20000, `${size} bytes`);
check('p50 / p95 from bins', JankReport.pct({ n: 10, h: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] }, 0.5) === '< 16 ms' && JankReport.pct({ n: 10, h: [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] }, 0.95) === '≤ 200 ms');

// ---------- 7. /smooth off / on / reset ----------
await Commands.tryRun('/smooth off', claude.id, null, { say: () => {} });
const lfBefore = Object.values(Jank._test.live()?.a || {}).reduce((a, x) => a + x.lf, 0);
setTimeout(window.jankFix.board, 0); await sleep(600);
const lfAfter = Object.values(Jank._test.live()?.a || {}).reduce((a, x) => a + x.lf, 0);
await key('keyDown', 'c'); await key('keyUp', 'c');
check('/smooth off: nothing measured, never busy', Jank.isOff() && lfAfter === lfBefore && !Jank.busy(), `${lfBefore} → ${lfAfter}`);
await Commands.tryRun('/smooth on', claude.id, null, { say: () => {} });
setTimeout(window.jankFix.board, 0); await sleep(700);
check('/smooth on: measuring again', !Jank.isOff() && Object.values(Jank._test.live()?.a || {}).reduce((a, x) => a + x.lf, 0) >= 1);
// /smooth profile names what ran long while it watched
const sp = []; const pp = Commands.tryRun('/smooth profile 2', claude.id, null, { say: (t) => sp.push(t), note: (t) => sp.push(t) });
await sleep(900); setTimeout(window.jankFix.later, 0); // (a function not run before: a hot loop V8 already optimized on the stack shows as browser work)
await pp;
await until(() => sp.some((t) => /long stretch/.test(t)), 4000);
check('/smooth profile: names the stretch', sp.some((t) => /board-jankfixture\.js:5/.test(t) && /jankBoardLater/.test(t)), sp.join(' | ').slice(0, 400));
await Jank.reset();
const empty = await window.hub.kvGet('jank-log', null);
check('/smooth reset empties the log', empty?.hours?.length === 0);
check('no duplicate commands', Commands.duplicates().length === 0);
return JSON.stringify(out, null, 1);
