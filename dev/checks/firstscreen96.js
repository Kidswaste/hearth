// (round 96, firstscreen96) What left the first screen this round works from the first moment, both when its group is
// already in (the usual case: all of them load right after the first frame) and when it is still a stand-in (after a
// reload with every group held back: the first use loads it):
//   director-dock.js (group directordock): the Lab's docked director gets its strip and chips, Alt+Shift+D folds it
//   the Lab's right-click menus (declutter-lab.js, the last file of the lab group): right-click the Lab's toolbar
//   director-task.js (directortask): an ask sent to a director is kept (even before the group is in), /task and
//     three_task read it
//   progress-ui.js (progressui): what Hearth learned of how long things take is read from the start, a thing in
//     progress shows on the rail's dot, /progress and its Ctrl/⌘+K line open the list
//   decide.js (in the assist group): ✦ Let Astra pick in the look picker (button), /decide (command), its Ctrl/⌘+K
//     lines, Assist's and the Lab sequence's own kinds
//   node dev/smoke.js --fake-engines --script dev/checks/firstscreen96.js --wait 6000 --check-timeout 300000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = []; const bad = [];
const ok = (c, m) => { (c ? out : bad).push(m); };
const state = (g) => Lazy.state().find((x) => x.name === g)?.state;
const GROUPS = ['directordock', 'directortask', 'progressui', 'assist'];
async function round(label) {
  const until = async (fn, ms = 6000) => { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(60); } };
  const closeAll = async () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); try { hideMenu(); } catch { /* none */ } await sleep(80); };
  const said = [];
  const run = (line, agentId) => Commands.exec(line, agentId, { say: (t) => said.push(String(t)), note: (t) => said.push(String(t)) });
  const claude = H.claudeAgent?.() || H.agents().find((a) => a.mode === 'native');

  // ---------- progress-ui.js: a thing in progress shows on the rail's dot, /progress, its Ctrl/⌘+K line ----------
  Progress.set('fs96:bar', { title: `fs96 bar (${label})`, kind: 'fs96', pct: 40, where: ['#keys-btn'] });
  const dot = await until(() => { const d = document.getElementById('pg-dot'); return d && !d.hidden ? d : null; });
  ok(dot && /fs96 bar/.test(dot.title), `${label}: a thing in progress shows on the rail's dot (${dot ? dot.title.split('\n')[1] : 'no dot'})`);
  ok(await until(() => document.querySelector('#keys-btn .pg-bar')), `${label}: …and as a bar on the thing itself`);
  said.length = 0;
  await run('/progress', claude.id);
  ok(/fs96 bar/.test(said.join('\n')) && await until(() => document.querySelector('.pg-pop')), `${label}: /progress answers and opens the list (${said.join(' ').slice(0, 50)})`);
  ProgressUI.close();
  const pa = (AppUI.actions?.() || []).find((a) => a.label === 'What\'s in progress (loading bars)');
  try { await pa?.run?.(); } catch (err) { ok(false, `${label}: progress action: ${err.message}`); }
  ok(pa && await until(() => document.querySelector('.pg-pop')), `${label}: Ctrl/⌘+K › What's in progress opens the list`);
  ProgressUI.close();
  Progress.drop('fs96:bar');

  // ---------- director-task.js: an ask to a director is kept; /task and three_task read it ----------
  if (!H.agents().some((a) => a.dock === 'three')) { await Commands.tryRun('/director-setup', claude.id); await until(() => H.agents().some((a) => a.dock === 'three')); }
  const dir = H.agents().find((a) => a.dock === 'three');
  ok(dir, `${label}: a Three Director to work with`);
  const ask = `fs96 ${label}: make a slow neon tunnel`;
  const chat = Native.ensureChat(dir.id, `fs96 task ${label}`);
  const t0 = state('directortask');
  await Native.send(dir.id, ask, { chatId: chat.id });
  await until(() => !Native.isBusy?.(chat.id), 60000);
  const st = await until(() => (Lazy.isIn('directortask') ? DirectorTask.state(chat.id) : null));
  ok(st && st.asks?.includes(ask.split('\nmcp:')[0]), `${label}: the ask is kept for the chat (group was ${t0} at the send; asks: ${JSON.stringify(st?.asks || null).slice(0, 80)})`);
  const tr = await HubBridge.call('three_task', {}, { chatId: chat.id });
  ok(tr?.ok && tr.value.includes('slow neon tunnel'), `${label}: three_task reads it (${String(tr?.value || tr?.error).slice(0, 60)})`);
  said.length = 0;
  H.activeChat[dir.id] = chat.id;
  await run('/task', dir.id);
  ok(/slow neon tunnel/.test(said.join('\n')), `${label}: /task shows it`);

  // ---------- the Lab: the dock's strip (director-dock.js) and the Lab's right-click menus (declutter-lab.js) ----------
  await Lazy.load('lab');
  activate('tool:three');
  await ThreeLab.cmd();
  const host = H.surfaces.get('tool:three')?.el;
  ok(await until(() => host?.querySelector('.dd-strip'), 20000), `${label}: the docked director gets its strip (directordock ${state('directordock')})`);
  ok(host?.querySelectorAll('.dd-chip').length > 0, `${label}: …and its quick chips`);
  const folded = () => host.classList.contains('dock-collapsed');
  const f0 = folded();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', code: 'KeyD', altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  await sleep(150);
  ok(folded() !== f0, `${label}: Alt+Shift+D folds / opens the docked chat`);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', code: 'KeyD', altKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  await sleep(150);
  const tb = await until(() => [...host.querySelectorAll('.three-toolbar, .tb-group')].find((n) => n.checkVisibility?.() && !n.closest('.media-bar')), 15000);
  if (tb) { const r = tb.getBoundingClientRect(); tb.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + Math.min(8, r.height / 2) })); }
  const labels = await until(() => { const m = document.getElementById('menu'); return m && !m.hidden ? [...m.querySelectorAll(':scope > button')].map((b) => b.textContent) : null; });
  ok(labels && labels.some((l) => /Run/.test(l)) && labels.some((l) => /Customise this/.test(l)), `${label}: right-click on the Lab's toolbar opens its menu (${(labels || []).slice(0, 3).join(' · ')})`);
  ok(typeof Declutter.labToolbar === 'function' && Declutter.labToolbar().length > 4, `${label}: Declutter.labToolbar is there with the Lab`);
  await closeAll();

  // ---------- decide.js (assist group): the look picker's ✦ button, /decide, Ctrl/⌘+K, the kinds others add ----------
  const pick = Look.picker();
  ok(pick?.querySelector?.('.decide-btn'), `${label}: the look picker has ✦ Let Astra pick (assist ${state('assist')})`);
  said.length = 0;
  await run('/decide log', claude.id);
  ok(said.join('').length > 0 && typeof Decide !== 'undefined', `${label}: /decide log answers (${said.join(' ').slice(0, 50)})`);
  ok((AppUI.actions?.() || []).some((a) => a.label === 'Let Astra decide: the app look'), `${label}: its Ctrl/⌘+K lines are there`);
  ok(Decide.KINDS.saved && await until(() => Decide.KINDS.arrangement), `${label}: Assist's (saved looks) and the Lab sequence's (arrangement) kinds are added`);
  activate(claude.id);
  await sleep(200);
}

// 1. the groups loaded right after the first frame (the usual case)
const g0 = Object.fromEntries(GROUPS.map((g) => [g, state(g)]));
for (let i = 0; i < 60 && GROUPS.some((g) => state(g) !== 'loaded'); i++) await sleep(100);
ok(GROUPS.every((g) => state(g) === 'loaded'), `the groups come in right after the first frame: ${JSON.stringify(g0)} → ${JSON.stringify(Object.fromEntries(GROUPS.map((g) => [g, state(g)])))}`);
await round('loaded');
// 2. after a reload with every group held back: the first use of each loads its group
const hist = { ...(store.get('progress.hist', null) || {}), fs96probe: { n: 3, lm: 9, lv: 0.1, tools: 0, chars: 0 } };
store.set('progress.hist', hist);
await sleep(300);
localStorage.setItem('fs96.round', round.toString());
localStorage.setItem('fs96.part1', JSON.stringify({ out, bad }));
localStorage.setItem('lazy.hold', '1');
return `part 1: ${bad.length ? `FAIL ${bad.length}` : 'PASS'} ${out.length} ok`;
//@@ reload
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { out, bad } = JSON.parse(localStorage.getItem('fs96.part1'));
const ok = (c, m) => { (c ? out : bad).push(m); };
const state = (g) => Lazy.state().find((x) => x.name === g)?.state;
const GROUPS = ['directordock', 'directortask', 'progressui', 'assist'];
const round = eval(`(${localStorage.getItem('fs96.round')})`); // eslint-disable-line no-eval
localStorage.removeItem('lazy.hold');
const held = Object.fromEntries(GROUPS.map((g) => [g, state(g)]));
ok(Object.values(held).every((s) => s === 'stub'), `groups held before the first use: ${JSON.stringify(held)}`);
// what Hearth learned of how long things take is read at the start, without the bars' group
ok(Progress._test.hist().fs96probe?.n === 3 && state('progressui') === 'stub', `the learned times are read from the start (progressui ${state('progressui')})`);
const h = store.get('progress.hist', {}) || {}; delete h.fs96probe; store.set('progress.hist', h);
await round('stand-in');
const miss = Lazy.misses().filter((x) => ['DirectorDock', 'DirectorTask', 'ProgressUI', 'Decide', 'Assist'].includes(x.name));
ok(miss.filter((x) => !/firstscreen96|<anonymous>|eval|astra\.js|comp-dispatch\.js/.test(x.where || '')).length === 0, `no app code touched the moved globals before their group (astra.js's handover asks with typeof, on purpose): ${JSON.stringify(miss.map((x) => `${x.name} ${x.where}`))}`);
localStorage.removeItem('fs96.round'); localStorage.removeItem('fs96.part1');
return `${bad.length ? `FAIL ${bad.length}\n✖ ${bad.join('\n✖ ')}\n` : 'PASS '}${out.length} ok\n${out.join('\n')}`;
