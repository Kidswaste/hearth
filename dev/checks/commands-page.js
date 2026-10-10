// Commands page (round 11), driven like a user: open it from the rail button, search in plain words, point at a
// command (its preview plays, a still poster otherwise), click it (the big example opens, nothing runs), Enter on a
// focused row (the example) then Enter again (it starts); a principal command run input by input from the Lab: skip
// the optional size, answer the yes / no, "How many times?" ×2, "Then…" chain /calc (needed: its expression), the
// summary, ▶ Run (back to the Lab, both commands ran); a chain that feeds the result of one command into the next
// ({last}); the run's live card in the chat; a run left halfway, Hearth "restarted" (persist + restore) and picked up
// on the page; ↻ Again (same answers, a new run); change an answer (a branch); /commands <name>; Ctrl+Shift+F; the
// "/" menu's rows; the keys sheet; every registered command's questions valid in the app.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/commands-page.js --shot /tmp/commands-page.png
const SHOTS = window.CMDPAGE_SHOTS || '/tmp/hearth-checks/commands-page';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const shot = async (name) => { try { await smoke({ shot: `${SHOTS}-${name}.png` }); } catch { /* pictures are optional */ } };
const C = H.claudeAgent();
const right = () => document.querySelector('.cp-right');
const qTitle = () => right()?.querySelector('.cp-q h3')?.textContent || '';
const optBtn = (label) => [...right().querySelectorAll('.cp-q .cp-opt')].find((b) => b.textContent.replace(/^\d/, '').trim().startsWith(label));
const key = async (k, code = k) => { const vk = { Enter: 13, ArrowDown: 40, Escape: 27 }[k] || 0; await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k === 'Enter' ? '\r' : undefined } }); await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk } }); };
async function waitQ(re, ms = 8000) { const good = await until(() => re.test(qTitle()), ms); if (!good) fail.push(`question ${re} (on screen: “${qTitle()}” · ${Flows.line(Flows.run(CmdPage.state.runId) || {})})`); return good; }
async function type(text) { const inp = right().querySelector('.cp-q .cp-input'); inp.value = text; inp.dispatchEvent(new Event('input')); inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(250); }
try {
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat(C.id);
  await until(() => typeof CmdPage !== 'undefined' && Flows.list().length > 20, 10000);
  // every registered command yields a valid question list in the app (the real registry, complete() and all)
  const badQ = [];
  for (const d of Commands.list()) { try { const q = CmdPage.questionsOf(d); const e = CmdPageCore.checkQuestions(q); if (e.length) badQ.push(`${d.name}: ${e[0]}`); CmdPageCore.buildFlow([{ name: d.name, ...q }]); } catch (err) { badQ.push(`${d.name}: ${err.message}`); } }
  out.commands = Commands.list().length;
  ok(out.commands > 900 && !badQ.length, `every command (${out.commands}) has a valid question list (${badQ.slice(0, 4)})`);
  ok(!Commands.duplicates().length, `no duplicate commands (${JSON.stringify(Commands.duplicates()).slice(0, 160)})`);
  ok(Commands.get('help').area === 'Chat' && Commands.get('?')?.name === 'help' && Commands.get('commands')?.name === 'commands', '/help keeps /?, /commands is the page');

  // ---- open from the rail ----
  const railBtn = document.querySelector('#agent-buttons .agent-btn[data-id="tool:commands"]');
  ok(railBtn, 'a Commands button in the rail');
  railBtn?.click();
  await until(() => CmdPage.isOpen() && document.querySelectorAll('.cp-row').length > 900, 8000);
  out.rows = document.querySelectorAll('.cp-row[data-name]').length;
  out.heads = [...document.querySelectorAll('.cp-head')].map((h) => h.textContent).slice(0, 6);
  ok(out.rows >= Commands.list().length, `every command is listed (${out.rows} rows for ${Commands.list().length})`);
  ok(out.heads[0] === 'Principal' && out.heads.includes('Step lists (flows)'), `principal ones first, then the flows, then by area (${out.heads})`);
  const firstRows = [...document.querySelectorAll('.cp-row[data-name]')].slice(0, 5).map((b) => b.dataset.name);
  ok(firstRows.every((n) => FlowsUI.principal().has(n)), `the first rows are principal (${firstRows})`);
  await shot('list');

  // ---- search in plain words ----
  const search = document.querySelector('.cp-search');
  search.value = 'make it vertical'; search.dispatchEvent(new Event('input'));
  await until(() => document.querySelector('.cp-head')?.textContent === 'Best matches', 3000);
  out.search = [...document.querySelectorAll('.cp-row[data-name]')].slice(0, 6).map((b) => b.dataset.name);
  ok(out.search.slice(0, 4).includes('size'), `"make it vertical" finds /size (${out.search})`);
  search.value = 'record'; search.dispatchEvent(new Event('input')); await wait(300);
  out.search2 = [...document.querySelectorAll('.cp-row[data-name]')].slice(0, 6).map((b) => b.dataset.name);
  ok(out.search2.some((n) => /^rec(ord)?$/.test(n)), `"record" finds /record, /rec (${out.search2})`);
  search.value = ''; search.dispatchEvent(new Event('input')); await wait(300);

  // ---- hover plays the preview, a still poster otherwise ----
  const row = (n) => document.querySelector(`.cp-row[data-name="${n}"]`);
  const rSize = row('size');
  rSize.scrollIntoView({ block: 'center' }); await wait(300);
  ok(rSize.querySelector('.cp-pv svg') && !rSize.querySelector('.cp-pv.on'), 'a row shows a still poster (paused SVG)');
  const paused = getComputedStyle(rSize.querySelector('.cp-pv .pv-a')).animationPlayState;
  rSize.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); await wait(250);
  const playing = getComputedStyle(rSize.querySelector('.cp-pv .pv-a')).animationPlayState;
  ok(paused === 'paused' && playing === 'running' && rSize.querySelector('.cp-pv.on'), `pointing at a command plays its preview (${paused} → ${playing})`);
  out.clipOnHover = Boolean(CmdPreviews.clipOf('size')) ? Boolean(rSize.querySelector('.cp-pv video')) : 'no clip';
  if (CmdPreviews.clipOf('size')) ok(out.clipOnHover === true, 'a principal command plays its recorded clip on hover');
  await shot('hover');
  document.querySelector('.cp-list').dispatchEvent(new PointerEvent('pointerleave')); await wait(100);
  ok(!rSize.querySelector('.cp-pv.on') && !rSize.querySelector('.cp-pv video'), 'it stops (and drops the clip) when the pointer leaves');

  // ---- a click opens the example, big; nothing runs ----
  const runs0 = Flows.runs().length;
  rSize.click(); await wait(300);
  ok(right().querySelector('.cp-example h2')?.textContent === '/size' && right().querySelector('.cp-big svg'), 'a click opens the example with a big preview');
  ok(/needed/.test(right().querySelector('.cp-asks')?.textContent) && /Which frame size/.test(right().textContent) && right().querySelector('.cp-about'), 'the example says what it will ask and what / when');
  ok(right().querySelector('.cp-big.on') || right().querySelector('.cp-big .pv-host.on') || right().querySelector('.pv-host.on'), 'the big preview plays while visible');
  ok(Flows.runs().length === runs0, 'nothing ran on the first click');
  await shot('example');

  // ---- keyboard: Enter on a row = the example, Enter again = start ----
  const rStill = row('still'); rStill.focus(); await wait(80);
  await key('Enter'); await wait(300);
  ok(right().querySelector('.cp-example h2')?.textContent === '/still' && Flows.runs().length === runs0, `Enter on a row opens its example, nothing runs (${right().querySelector('.cp-example h2')?.textContent})`);
  ok(document.activeElement?.classList.contains('cp-use'), '▶ Use this command has the focus');

  // ---- /still from the Lab, input by input ----
  // come from the Lab (so ▶ Run acts there), then the page again
  activate('tool:three'); await until(() => typeof ThreeLab !== 'undefined', 8000); await wait(1500);
  CmdPage.open('still'); await wait(400);
  document.querySelector('.cp-use').focus();
  await key('Enter');
  await until(() => Flows.runs().length > runs0, 4000);
  const run = Flows.run(CmdPage.state.runId);
  ok(run && run.flow.guided && run.chatId, `Enter again started a guided run in a chat (${run && Flows.line(run)})`);
  await waitQ(/which size/i);
  ok(/step 1 of/.test(right().querySelector('.cp-step')?.textContent), `step 1 of N (${right().querySelector('.cp-step')?.textContent})`);
  ok(optBtn('Skip'), 'an optional question can be skipped');
  await shot('q-optional');
  optBtn('Skip').click();
  await waitQ(/clipboard/i);
  ok(optBtn('Yes, copy it') && optBtn('No'), 'a yes or no question');
  optBtn('No').click();
  await waitQ(/how many times/i);
  out.repeatOpts = [...right().querySelectorAll('.cp-q .cp-opt')].map((b) => b.textContent.replace(/^\d/, ''));
  ok(out.repeatOpts.some((x) => /Every 30 seconds/.test(x)), `once / n times / every… (${out.repeatOpts})`);
  optBtn('2 times').click();
  await waitQ(/^Then/);
  optBtn('Then another command').click();
  await waitQ(/Which command next/);
  await type('calc');
  await waitQ(/needs|expression/i);
  ok(/Needed/.test(right().querySelector('.cp-q .cp-chip')?.textContent), `the chained command's needed input is marked (${right().querySelector('.cp-q .cp-chip')?.textContent})`);
  ok(run.flow.commands.join(',') === 'still,calc', `the run grew a second command (${run.flow.commands})`);
  await shot('q-needed');
  await type('6*7');
  await waitQ(/^Then/);
  optBtn('That\'s all').click();
  await waitQ(/Ready/);
  out.plan = [...right().querySelectorAll('.cp-plan li')].map((li) => li.textContent);
  ok(out.plan.length === 2 && /\/still/.test(out.plan[0]) && /2 times/.test(out.plan[0]) && /\/calc 6\*7/.test(out.plan[1]), `the summary says what will happen (${out.plan})`);
  out.done = [...right().querySelectorAll('.cp-done-row')].map((b) => b.textContent);
  ok(out.done.length >= 5, `what's done is listed (${out.done.length})`);
  await shot('summary');
  optBtn('▶ Run').click();
  await until(() => run.status === 'done' || run.status === 'hung', 30000);
  out.ran = run.steps.filter((e) => e.kind === 'action').map((e) => `${e.input} → ${e.status}`);
  ok(run.status === 'done' && run.steps.some((e) => e.input === '/repeat 2 /still') && run.steps.some((e) => e.input === '/calc 6*7'), `both commands ran, the first twice (${out.ran} · ${Flows.line(run)})`);
  ok(/42/.test(run.result), `the result (${String(run.result).slice(0, 60)})`);
  ok(H.surfaceIdFor(H.activeId) === 'tool:three', `▶ Run went back to the Lab (${H.activeId})`);
  // the same live card in the chat
  ok(Native.view(run.agentId)?.list.querySelector(`.msg.note[data-note-id="flow-${run.id}"]`), 'the run has its live card in the chat');

  // ---- a chain that feeds the result of one command into the next ----
  CmdPage.open('calc'); await wait(300);
  document.querySelector('.cp-use').click();
  await waitQ(/needs|expression/i);
  await type('20+22');
  await waitQ(/^Then/); optBtn('Then another command').click();
  await waitQ(/Which command next/); await type('echo');
  await waitQ(/text|needs/i);
  ok(optBtn('↳ the result of the step before'), 'a chained command offers the result of the step before');
  optBtn('↳ the result of the step before').click();
  await waitQ(/^Then/); optBtn('That\'s all').click();
  await waitQ(/Ready/);
  ok(/uses the result before/.test(right().querySelector('.cp-plan')?.textContent), 'the summary shows the feed');
  const chain = Flows.run(CmdPage.state.runId);
  optBtn('▶ Run').click();
  await until(() => chain.status === 'done' || chain.status === 'hung', 15000);
  out.chain = chain.steps.filter((e) => e.kind === 'action').map((e) => e.input);
  ok(chain.status === 'done' && /^\/echo 20\+22 = 42$/.test(out.chain[1]), `the result fed the next command (${out.chain} · ${Flows.line(chain)})`);
  await shot('chain-done');

  // ---- halfway, Hearth restarts, picked up on the page ----
  CmdPage.open('calc'); await wait(300);
  document.querySelector('.cp-use').click();
  await waitQ(/needs|expression/i);
  const half = Flows.run(CmdPage.state.runId);
  await type('2*21');
  await waitQ(/^Then/);
  await Flows.persist(); await Flows.restore(); // what a restart does with the runs on disk
  const back = Flows.run(half.id);
  ok(back && back !== half && back.status === 'waiting-you', `the run came back from disk, waiting (${back && Flows.line(back)})`);
  CmdPage.state.list && document.querySelector('.cp-search').dispatchEvent(new Event('input')); await wait(500);
  const going = document.querySelector(`.cp-runrow[data-run="${half.id}"]`);
  ok(going, 'it is listed under Going now');
  going?.click(); await wait(300);
  await waitQ(/^Then/);
  optBtn('That\'s all').click(); await waitQ(/Ready/);
  optBtn('▶ Run').click();
  await until(() => back.status === 'done', 10000);
  ok(back.status === 'done' && /42/.test(back.result), `picked up after the restart and finished (${Flows.line(back)})`);

  // ---- ↻ Again: same answers, a new run ----
  CmdPage.openRun(back.id); await wait(300);
  const againBtn = optBtn('↻ Again');
  ok(againBtn, 'a finished run offers ↻ Again');
  againBtn.click();
  await until(() => CmdPage.state.runId !== back.id && Flows.run(CmdPage.state.runId)?.status === 'done', 10000);
  const again = Flows.run(CmdPage.state.runId);
  ok(again && again.parent?.run === back.id && again.steps.some((e) => e.input === '/calc 2*21') && again.status === 'done', `again ran the same line (${again && Flows.line(again)})`);
  // change an answer: a branch that asks that question again
  const qi = again.steps.findIndex((e) => e.node === 's1q1');
  right().querySelectorAll('.cp-done-row')[0]?.click();
  await until(() => CmdPage.state.runId !== again.id, 4000);
  const br = Flows.run(CmdPage.state.runId);
  ok(qi >= 0 && br?.parent?.kind === 'branch' && Flows.waiting(br)?.node.id === 's1q1', `clicking a done answer changes it (a branch asks again) (${br && Flows.line(br)})`);
  Flows.stop(br.id);
  await shot('again');

  // ---- /commands <name>, Ctrl+Shift+F, the "/" menu, keys ----
  activate(C.id); await wait(300);
  await Commands.tryRun('/commands board-add', C.id);
  await wait(400);
  ok(CmdPage.isOpen() && right().querySelector('.cp-example h2')?.textContent === '/board-add', '/commands <name> opens the page on that command');
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  await wait(300);
  ok(!CmdPage.isOpen(), 'Ctrl+Shift+F again goes back');
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  await wait(300);
  ok(CmdPage.isOpen(), 'Ctrl+Shift+F opens the page');
  activate(C.id); await wait(300);
  const ta = Native.view(C.id).input; ta.focus(); ta.value = '/'; ta.dispatchEvent(new Event('input'));
  await until(() => Native.view(C.id).root.querySelector('.slash-menu .slash-item'), 3000);
  const pageRow = [...Native.view(C.id).root.querySelectorAll('.slash-menu .slash-item')].find((x) => /Every command, step by step/.test(x.textContent));
  ok(pageRow, 'the "/" menu has "Every command, step by step…"');
  pageRow?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await wait(400);
  ok(CmdPage.isOpen(), 'and it opens the page');
  ta.value = ''; ta.dispatchEvent(new Event('input'));
  out.keys = Keys.all().filter((k) => k.area === 'Commands').length;
  ok(out.keys >= 5, `keys listed (${out.keys})`);
  // the advanced node view is still there
  FlowsUI.open({ runId: again.id }); await wait(300);
  ok(document.querySelector('.fl-dialog')?.open, 'the node view (advanced) still opens a run');
  document.querySelector('.fl-dialog')?.close();
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
