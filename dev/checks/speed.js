// Speed (round 13): rank by habit, Again (Ctrl/⌘+.) and recent actions, learned shortcuts (a routine offered once,
// made a one-key macro on Ctrl/⌘+Alt+N), the keys sheet's "Yours", errors to fixes, the safer weekly tidy with
// /habits restore, and the pick-up card after a reload. Real key presses and clicks go through CDP (trusted events).
//   node dev/smoke.js --fake-engines --script dev/checks/speed.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const agent = H.claudeAgent().id;
const run = async (line, opts = {}) => { let text = ''; await Commands.tryRun(line, agent, null, { source: 'bar', say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, ...opts }); return text; };
const key = async (k, code, vk, mods) => { for (const type of ['rawKeyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods } }); };
const clickAt = async (node) => { const r = node.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2; for (const type of ['mousePressed', 'mouseReleased']) await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'left', clickCount: 1 } }); };
const toasts = () => [...document.querySelectorAll('#toasts .toast')];
const out = {};
await wait(1500);
for (const k of ['commands.recent', 'commands.recentByPlace', 'commands.favs']) localStorage.removeItem(k);

// ---------- commands exist, no duplicates ----------
ok(Commands.duplicates().length === 0, `no duplicate commands (${Commands.duplicates().map((d) => d.name).join(', ')})`);
for (const n of ['again', 'click', 'resume', 'habits', 'macro']) ok(Commands.get(n), `/${n} exists`);
ok(Commands.get('retry')?.name === 'retry' && Commands.get('again')?.variants?.length === 2, '/again shares its name with /retry (retry still writes the reply again in a plain chat)');

// ---------- Again: a command with its arguments ----------
const hits = []; Commands.register({ name: 'speed-probe', area: 'App', hidden: true, desc: 'test', run: (a) => { hits.push(a); return null; } });
for (const n of ['speed-a', 'speed-b', 'speed-c']) Commands.register({ name: n, area: 'App', hidden: true, desc: 'test', run: () => { hits.push(n); return null; } });
await run('/speed-probe hello there');
await Speed.again();
ok(hits.join('|') === 'hello there|hello there', `Again repeats the last command with the same arguments (${hits.join('|')})`);
await key('.', 'Period', 190, 2); await wait(500);
ok(hits.length === 3 && hits[2] === 'hello there', `Ctrl+. (a real key press) does it again (${hits.length})`);
await key('>', 'Period', 190, 2 | 8); await wait(400);
const menu = document.getElementById('menu');
ok(menu && !menu.hidden && /Recent actions/.test(menu.textContent) && /speed-probe hello there/.test(menu.textContent), 'Ctrl+Shift+. opens the recent actions');
hideMenu();
const listText = await run('/again list');
ok(/Recent actions/.test(listText) && /speed-probe hello there/.test(listText), '/again list shows them');
out.again = { hits: hits.length };

// ---------- Again: a button you clicked ----------
activate('tool:board'); await wait(1500);
const host = document.querySelector('.surface.active');
let pressed = 0;
const b = el('button', { type: 'button', title: 'Speed probe button', text: 'Probe it', on: { click: () => { pressed += 1; } } });
b.style.cssText = 'position:fixed;left:300px;top:200px;z-index:99999'; host.append(b); await wait(100);
await clickAt(b); await wait(200);
ok(pressed === 1 && Speed.lastAction()?.kind === 'click', `a real click is the last action (${Speed.lastAction()?.label})`);
await key('.', 'Period', 190, 2); await wait(500);
ok(pressed === 2, `Ctrl+. presses that button again (${pressed})`);
const pk = Speed.lastAction()?.key;
await run(`/click ${pk}`); await wait(200);
ok(pressed === 3, `/click ${pk} presses it by name`);
b.remove();

// ---------- rank by habit ----------
activate('tool:three'); await ThreeLab.cmd(); await wait(800);
for (let i = 0; i < 9; i += 1) Speed.count('Chat command › /freeze', 'three');
for (let i = 0; i < 4; i += 1) Speed.count('Chat command › /fps', 'three');
await wait(50);
const top = SpeedRank.top('three', 4).map((d) => d.name);
ok(top[0] === 'freeze', `the most used command here ranks first (${top.join(', ')})`);
const rows = ChatSlash.rows({ ctx: { agentId: agent } });
const usualAt = rows.findIndex((r) => r.kind === 'head' && /^Your usual in/.test(r.label));
ok(usualAt >= 0 && rows[usualAt + 1]?.def?.name === 'freeze', `the "/" menu shows "Your usual in …" with /freeze first (${rows.filter((r) => r.kind === 'head').map((r) => r.label).join(' | ')})`);
const fm = Commands.matching('f').map((d) => d.name);
ok(fm.indexOf('freeze') >= 0 && fm.indexOf('freeze') <= 1 && fm.indexOf('freeze') < fm.indexOf('fps'), `typed "/f": /freeze first (after an exact name), before less used ones (${fm.slice(0, 6).join(', ')})`);
for (let i = 0; i < 6; i += 1) Speed.count('Command palette › Lab: Present', 'three');
AppUI.palette(); await wait(200);
const pitems = [...document.querySelectorAll('.palette-item .p-label')].map((n) => n.textContent);
ok(pitems[0] === '↻ Again' && pitems.indexOf('Lab: Present') >= 1 && pitems.indexOf('Lab: Present') < 4, `Ctrl+K: ↻ Again first, then what you pick most (${pitems.slice(0, 4).join(' | ')})`);
document.querySelector('.palette')?.remove();
const now = await run('/habits now');
ok(/Your usual in .*\/freeze/.test(now), '/habits now says what ranks first here');
out.rank = { top, pal: pitems.slice(0, 3) };

// ---------- learned shortcuts ----------
toasts().forEach((t) => t.remove());
for (let i = 0; i < 3; i += 1) { await run('/speed-a'); await run('/speed-b'); await run('/speed-c'); }
await wait(300);
const offerT = toasts().find((t) => /You often do/.test(t.textContent));
ok(offerT && /speed-a → \/speed-b → \/speed-c/.test(offerT.textContent), `a routine done 3 times is offered as one key (${toasts().map((t) => t.textContent.slice(0, 60)).join(' | ')})`);
offerT?.querySelector('button:not(.toast-x)')?.click(); await wait(400);
const binds = Speed.data.learn?.binds || {};
const made = binds[1];
ok(made && Commands.get(made), `accepting makes a command bound to Ctrl+Alt+1 (${made})`);
hits.length = 0;
await key('1', 'Digit1', 49, 1 | 2); await wait(900);
ok(hits.join(',') === 'speed-a,speed-b,speed-c', `Ctrl+Alt+1 runs the routine (${hits.join(',')})`);
const keysText = await run('/macro keys');
ok(new RegExp(`/${made}`).test(keysText), '/macro keys lists it');
const learnedText = await run('/macro learned');
ok(/speed-a/.test(learnedText), '/macro learned lists the routine');
await key('9', 'Digit9', 57, 1 | 2); await wait(300);
ok(toasts().some((t) => /is free/.test(t.textContent)), 'an unbound Ctrl+Alt+9 says how to give it a macro');
// a fourth time: no second offer for the same routine
toasts().forEach((t) => t.remove());
await run('/speed-a'); await run('/speed-b'); await run('/speed-c'); await wait(200);
ok(!toasts().some((t) => /You often do/.test(t.textContent)), 'offered once only');

// ---------- the keys sheet: Yours ----------
for (let i = 0; i < 3; i += 1) Usage.track('Shortcut › Ctrl+K');
Usage.data.items['Preview › Freeze'] = { n: 16, first: Date.now() - 864e5, last: Date.now(), label: 'Freeze', area: 'Preview' };
Usage.data.items['Sliders › Zorblax'] = { n: 9, first: Date.now() - 864e5, last: Date.now(), label: 'Zorblax', area: 'Sliders' };
KeysUI.open(); await wait(250);
const yours = document.querySelector('.keys-sheet .speed-yours');
ok(yours && /Ctrl\+K|⌘K|K/.test(yours.textContent) && /3×/.test(yours.textContent), `the keys sheet starts with your own keys (${yours?.textContent.slice(0, 120)})`);
ok(yours && /Freeze: you click it 16×/.test(yours.textContent), 'and the key for something you click a lot');
ok(yours && /Zorblax: you click it 9× · give it a key/.test(yours.textContent), 'and "give it a key" for one without');
{ const gs = [...document.querySelectorAll('.keys-sheet .ks-group')]; const before = gs.slice(0, gs.indexOf(yours)); ok(yours && before.every((g) => / · /.test(g.querySelector('h4')?.textContent || '')), `"Yours" comes right after this screen's own keys (${before.length} before it)`); }
KeysUI.close(); await wait(200);

// ---------- errors to fixes ----------
toasts().forEach((t) => t.remove());
const err = 'Claude Code 2.1.1 is too old for this model';
toast(err, { type: 'error' });
let et = toasts().find((t) => t.textContent.includes('too old'));
ok(et && /Update the engine/.test(et.textContent), 'an error with a known fix gets it as its button');
toast(err, { type: 'error' }); toast(err, { type: 'error' }); await wait(1600);
ok(toasts().some((t) => /This keeps happening \(3×\)/.test(t.textContent) && /Update the engine/.test(t.textContent)), 'the third time: "this keeps happening" with the fix');
toast(err, { type: 'error' }); await wait(1500);
ok(toasts().filter((t) => /This keeps happening/.test(t.textContent)).length === 1, 'said once a day only');
const fixText = await run('/habits fix');
ok(/Update the engine/.test(fixText), '/habits fix lists the fix');
toast('Couldn\'t load /Users/me/a.mp4 (code 4)', { type: 'error' });
ok(toasts().some((t) => /a\.mp4/.test(t.textContent) && /Install ffmpeg/.test(t.textContent)), 'a video that will not load offers ffmpeg');
toasts().forEach((t) => t.remove());

// ---------- the weekly tidy: safer, logged, reversible ----------
Usage.data.since = Date.now() - 10 * 864e5;
activate('tool:ae'); await wait(1500);
const root = H.surfaces.get('tool:ae').el;
const vis = [...root.querySelectorAll('button')].filter((x) => x.checkVisibility?.({ visibilityProperty: true }) && Usage.keyOf(x) && Declutter.selectorFor(x) && !x.matches('.primary, .on') && !x.closest('dialog'));
const cand = vis.slice(0, 3);
const usedRecently = vis[3];
for (const x of cand) Usage.data.items[Usage.keyOf(x)] = { n: 0, first: Date.now() - 9 * 864e5, label: 'x', area: 'Video' };
if (usedRecently) Usage.data.items[Usage.keyOf(usedRecently)] = { n: 1, first: Date.now() - 60 * 864e5, last: Date.now() - 10 * 864e5, label: 'y', area: 'Video' };
store.set('habits.tidied', {});
const n = Habits.tidyHere();
ok(n >= cand.length && Habits.tidyLog().length >= cand.length, `the tidy tucks never-used controls and keeps a list (${n})`);
ok(!usedRecently || !Habits.tidyLog().some((x) => x.sel === Declutter.selectorFor(usedRecently)), 'never what you used in the last 30 days');
ok(toasts().some((t) => /Tidied: tucked \d+ control/.test(t.textContent) && /Undo/.test(t.textContent)), 'one line: "Tidied: tucked N controls" with Undo');
const cust = Declutter.customiseItems('Video Review')[1].items.find((it) => it.label === 'Tucked by the weekly tidy');
ok(cust, 'Customise… → Tucked by the weekly tidy');
const restored = await run('/habits restore');
ok(/back on screen/.test(restored) && Habits.tidyLog().length === 0 && !cand.some((x) => Declutter.mine().some((m) => m.sel === Declutter.selectorFor(x))), '/habits restore brings them all back');
toasts().forEach((t) => t.remove());

// ---------- the pick-up card (after the reload below) ----------
activate('tool:three'); await ThreeLab.cmd(); await wait(500);
const sceneId = ThreeLab.scenes.currentId();
// what a session that ended 20 minutes ago in the Lab would have left (written last, after the page's own snapshot)
const left = { t: Date.now() - 20 * 60e3, active: 'tool:three', lab: { sceneId, name: 'Probe scene', seqOn: false, t: Date.now() - 20 * 60e3 }, render: { path: '/tmp/hearth-speed-probe.mp4', name: 'probe-render.mp4', t: Date.now() - 30 * 60e3 } };
for (const ev of ['beforeunload', 'pagehide', 'unload']) addEventListener(ev, () => store.set('speed.where', left));
document.addEventListener('visibilitychange', () => store.set('speed.where', left));
activate(agent); // somewhere else: the card should offer the Lab first
window.__speedOut = out;
if (problems.length) throw new Error(`${problems.length} problem(s): ${problems.join(' · ')}`);
return JSON.stringify(out);
//@@ reload
const wait2 = (ms) => new Promise((r) => setTimeout(r, ms));
const problems2 = []; const ok2 = (c, what) => { if (!c) problems2.push(what); };
await wait2(4000);
const card = document.querySelector('.speed-resume');
const rowsC = card ? [...card.querySelectorAll('.sr-row')].map((r) => r.dataset.resume) : [];
ok2(card && rowsC[0] === 'lab' && rowsC.includes('render'), `after a restart: one card, the Lab scene first, the last render too (${rowsC.join(', ')})`);
ok2(card && /Probe scene/.test(card.textContent), 'it names the scene');
card?.querySelector('[data-resume="lab"]')?.click(); await wait2(1500);
ok2(H.surfaceIdFor(H.activeId) === 'tool:three', 'one click goes back to the Lab');
ok2(!document.querySelector('.speed-resume'), 'and the card is gone');
let said = ''; await Commands.tryRun('/resume off', H.claudeAgent().id, null, { say: (t) => { said = String(t); } });
ok2(/no longer shows/.test(said) && store.get('speed.resume') === false, '/resume off');
await Commands.tryRun('/resume on', H.claudeAgent().id, null, { say: () => {} });
// the speed group's errors on the page
if (problems2.length) throw new Error(`${problems2.length} problem(s): ${problems2.join(' · ')} · prev ${JSON.stringify(SpeedResume.prev)} · active ${H.activeId}`);
return JSON.stringify({ card: rowsC });
