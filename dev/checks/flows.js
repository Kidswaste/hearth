// Flows (round 10), driven like a user: the "/" menu shows the principal commands and Flows ›; tucked commands still
// run typed by name (and hidden ones too); Doctor started from the "/" menu, its options picked on the nodes and
// validated, the live card in the chat answered from the chat, a refine, a change of answer (a branch), a run that
// hangs (a check that never comes, then Hearth "restarted": restore) picked up again, the chat line that rides along
// only when your words are about the flow and a <flow answer="…"/> in a reply that moves it, /flow-status, /flow-step,
// /flow-where, /principal, the editor (add a step, rewire, save as mine) and /flow-make with the fake engine.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/flows.js --shot /tmp/flows.png
const SHOTS = window.FLOW_SHOTS || '/tmp/hearth-checks/flows';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const v = () => Native.view(C.id);
const dlg = () => document.querySelector('.fl-dialog');
const nodeEl = (id) => dlg().querySelector(`.nv-node[data-id="${id}"]`);
const shot = async (name) => { try { await smoke({ shot: `${SHOTS}-${name}.png` }); } catch { /* pictures are optional */ } };
const mouse = (node, type = 'mousedown') => node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
try {
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat(C.id);
  await until(() => typeof FlowsUI !== 'undefined' && Flows.list().length > 20, 10000);

  // ---- principal commands, tucked ones, hidden ones ----
  out.commands = Commands.list().length;
  out.principal = [...FlowsUI.principal()];
  out.tucked = Commands.list().filter((d) => Commands.isTucked(d)).length;
  ok(out.principal.length >= 25 && out.principal.length <= 44, `25–40 principal commands (+ up to 4 of yours): ${out.principal.length}`);
  ok(out.principal.every((n) => Commands.get(n)), `every principal command exists (${out.principal.filter((n) => !Commands.get(n))})`);
  ok(!Commands.duplicates().length, `no duplicate commands (${JSON.stringify(Commands.duplicates()).slice(0, 200)})`);
  // every command lands in a flow
  FlowsUI.ensure();
  const inFlows = new Set(FlowsUI.generated().flatMap((f) => f.commands));
  out.lost = Commands.list().filter((d) => !inFlows.has(d.name)).map((d) => d.name);
  ok(!out.lost.length, `every command is in a flow (${out.lost.slice(0, 10)})`);
  out.flows = { journeys: FlowsUI.journeys().length, generated: FlowsUI.generated().length };
  ok(out.flows.journeys === 10 && out.flows.generated >= 20 && out.flows.generated <= 40, `a few dozen flows (${JSON.stringify(out.flows)})`);
  out.invalid = Flows.list().map((f) => [f.id, Flows.validate(f)]).filter(([, r]) => !r.ok || r.warnings.length).map(([id, r]) => `${id}: ${[...r.errors, ...r.warnings].slice(0, 2)}`);
  ok(!out.invalid.length, `every flow is valid against the real registry (${out.invalid.slice(0, 4)})`);

  // the "/" view: principal areas, then Flows ›
  const ta = v().input; ta.focus(); ta.value = '/'; ta.dispatchEvent(new Event('input'));
  await until(() => v().root.querySelector('.slash-menu .slash-area'), 3000);
  const sm = () => v().root.querySelector('.slash-menu');
  out.slashHeads = [...sm().querySelectorAll('.slash-head')].map((h) => h.textContent);
  out.slashAreas = [...sm().querySelectorAll('.slash-area b')].map((b) => b.textContent);
  ok(out.slashHeads.includes('Flows') && out.slashAreas.includes('⇢ Flows ›'), `"/" shows Flows › (${out.slashHeads} · ${out.slashAreas})`);
  const fl = [...sm().querySelectorAll('.slash-area')].find((x) => /⇢ Flows/.test(x.textContent));
  mouse(fl); await wait(200);
  out.flowRows = [...sm().querySelectorAll('.slash-item b')].map((b) => b.textContent).slice(0, 14);
  ok(out.flowRows.some((x) => /Doctor/.test(x)) && out.flowRows.some((x) => /Make a video/.test(x)), `Flows › lists the journeys (${out.flowRows})`);
  await shot('slash');
  // an area lists its principal commands, then "N more … ›"
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })); await wait(150);
  const lab = [...sm().querySelectorAll('.slash-area')].find((x) => /^Messages/.test(x.textContent)) || [...sm().querySelectorAll('.slash-area')].find((x) => !/Flows|More/.test(x.textContent));
  mouse(lab); await wait(200);
  out.areaRows = [...sm().querySelectorAll('.slash-item b')].map((b) => b.textContent);
  ok(out.areaRows.some((x) => /more .* commands ›/.test(x)), `an area ends with "N more … commands ›" (${out.areaRows})`);
  // typing: principal first, the tucked ones under "In flows"
  ta.value = '/board'; ta.dispatchEvent(new Event('input')); await wait(250);
  out.typed = [...sm().querySelectorAll('.slash-item b')].map((b) => b.textContent.split(' ')[0]).slice(0, 5);
  out.typedHeads = [...sm().querySelectorAll('.slash-head')].map((h) => h.textContent);
  ok(out.typed[0] === '/board' && out.typedHeads.includes('In flows (run by name)'), `typed: principal first, tucked under "In flows" (${out.typed} · ${out.typedHeads})`);
  ta.value = ''; ta.dispatchEvent(new Event('input')); ta.blur();
  // tucked and hidden commands still run by name
  out.calc = await Commands.tryRun('/calc 6*7 | draft', C.id);
  ok(Commands.isTucked(Commands.get('calc')) && out.calc && /42/.test(v().input.value), `a tucked command runs typed by name (${v().input.value})`);
  v().input.value = '';
  const hidden = Commands.list().find((d) => d.hidden && !d.args && /^(unpin|bottom|top|refresh)$/.test(d.name));
  if (hidden) ok(await Commands.tryRun(`/${hidden.name}`, C.id), `a hidden command runs by name (/${hidden.name})`);
  out.where = await new Promise((res) => Commands.tryRun('/flow-where board-align', C.id, null, { say: res }));
  ok(/Mood board/.test(out.where) && /tucked/.test(out.where), `/flow-where says where it went (${out.where})`);

  // ---- Doctor like a user ----
  ta.focus(); ta.value = '/'; ta.dispatchEvent(new Event('input'));
  await until(() => sm()?.querySelector('.slash-area'), 3000);
  mouse([...sm().querySelectorAll('.slash-area')].find((x) => /⇢ Flows/.test(x.textContent))); await wait(200);
  out.rows2 = [...(sm()?.querySelectorAll('.slash-item b') || [])].map((b) => b.textContent).slice(0, 6);
  const docRow = [...sm().querySelectorAll('.slash-item')].find((x) => /✚ Doctor/.test(x.textContent));
  ok(docRow, `Doctor in Flows › (${out.rows2})`);
  mouse(docRow);
  // (round 11) Flows › starts it on the Commands page; the node view is the advanced one
  await until(() => Flows.runs()[0]?.flowId === 'doctor' && Flows.runs()[0]?.status === 'waiting-you', 20000);
  ok(typeof CmdPage === 'undefined' || CmdPage.isOpen(), 'Flows › opens the run on the Commands page');
  FlowsUI.open({ runId: Flows.runs()[0].id });
  await until(() => dlg()?.open, 3000);
  const run = Flows.runs()[0];
  out.doctor1 = Flows.line(run);
  ok(run.flowId === 'doctor' && run.chatId === H.activeChat[C.id], `Doctor started in this chat (${out.doctor1})`);
  await until(() => nodeEl('ok')?.classList.contains('run-wait'), 5000);
  ok(nodeEl('check')?.classList.contains('run-ok') && /both engines can work/.test(nodeEl('check').querySelector('.fl-out')?.textContent || ''), 'the past step shows what it made');
  ok(nodeEl('ok').querySelector('.fl-guess') && /Hearth thinks: Yes/.test(nodeEl('ok').textContent), 'the guess is lit on the node');
  ok(/Validate: Yes/.test(document.querySelector('.fl-primary').textContent), `Validate says what it takes (${document.querySelector('.fl-primary').textContent})`);
  await shot('doctor-1');
  // pick "No" on the node, then Yes again, then Validate on the node
  const opt = (id, label) => [...nodeEl(id).querySelectorAll('.fl-opt')].find((r) => r.textContent.trim().startsWith(label));
  opt('ok', 'No').click(); await wait(80);
  ok(opt('ok', 'No').classList.contains('fl-sel'), 'clicking an option selects it');
  opt('ok', 'Yes').click(); await wait(80);
  nodeEl('ok').querySelector('[data-fl="validate"]').click();
  await until(() => Flows.waiting(run)?.node.id === 'test', 8000);
  ok(Flows.waiting(run)?.node.id === 'test', `validated: on to "Test both" (${Flows.line(run)})`);
  // keys: 1 picks the first option, Enter validates
  dlg().focus();
  dlg().dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
  ok(document.querySelector('.fl-primary').textContent.includes('Yes'), 'key 1 picks Yes');
  dlg().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await until(() => run.status === 'done', 20000);
  await until(() => nodeEl('done')?.querySelector('[data-fl="again"]'), 3000);
  ok(run.status === 'done' && run.steps.some((e) => e.node === 'run' && e.status === 'done'), `Doctor done after the test (${Flows.line(run)})`);
  ok(nodeEl('done')?.querySelector('[data-fl="again"]'), 'the result offers Again / Refine on the node');
  await shot('doctor-done');
  // the steps list
  out.steps = [...dlg().querySelectorAll('.fl-step .fl-st')].map((x) => x.textContent);
  ok(out.steps.length >= 4, `the steps list (${out.steps})`);
  // change an answer: a branch from step 2 with "No" (the old run stays)
  const before = run.steps.length;
  const b = await Flows.branch(run.id, 1, 'no');
  ok(b.parent?.run === run.id && run.steps.length === before && Flows.waiting(b)?.node.id === 'which', `a branch from step 2 (${Flows.line(b)})`);
  Flows.stop(b.id);
  // refine the result (fake Claude rewrites it)
  FlowsUI.open({ runId: run.id });
  await Flows.refine(run.id, 'only the versions');
  ok(run.status === 'done' && run.refines === 1 && /Fake reply|only the versions/.test(run.result), `refined (${String(run.result).slice(0, 80)})`);
  dlg().close();

  // ---- the chat card ----
  activate(C.id); await wait(200); // (round 11) Flows › left the Commands page on screen
  const r2 = await FlowsUI.startIn('doctor', { agentId: C.id, chatId: H.activeChat[C.id] });
  const card = () => v().list.querySelector(`.msg.note[data-note-id="flow-${r2.id}"]`);
  await until(() => /waiting for you/.test(card()?.innerText || ''), 15000);
  out.card = card()?.innerText.replace(/\s+/g, ' ');
  ok(card() && /Doctor/.test(out.card) && /waiting for you/.test(out.card), `the live card in the chat (${out.card})`);
  [...card().querySelectorAll('.note-acts button')].find((x) => x.textContent === 'No').click();
  await until(() => Flows.waiting(r2)?.node.id === 'which', 5000);
  await until(() => /Which one/.test(card()?.innerText || ''), 3000);
  ok(/Which one/.test(card()?.innerText || ''), 'answered from the card, the card moved on');
  await shot('card');

  // ---- the chat reads where it is and moves it ----
  await Native.send(C.id, 'echo hello there');
  await until(() => !Native.isBusy(H.activeChat[C.id]), 20000);
  ok(!/Hearth flow/.test(Native.current(C.id).messages.at(-1).text), 'a message not about the flow carries nothing extra');
  await Native.send(C.id, 'echo where are we in the flow?');
  await until(() => !Native.isBusy(H.activeChat[C.id]), 20000);
  out.echo = Native.current(C.id).messages.at(-1).text.slice(-260);
  ok(/\[Hearth flow: Doctor .*Which one has the problem/.test(out.echo), `"where are we" carries one line about the run (${out.echo})`);
  // a reply that moves the flow: <flow answer="codex"/> (the fake echoes it back)
  await Native.send(C.id, 'echo next step please <flow answer="codex"/>');
  await until(() => !Native.isBusy(H.activeChat[C.id]), 20000);
  await until(() => Flows.waiting(r2)?.node.id === 'what', 5000);
  ok(Flows.waiting(r2)?.node.id === 'what', `the reply's <flow answer> moved it (${Flows.line(r2)})`);
  ok(!/<flow /.test(Native.current(C.id).messages.at(-1).text), 'the tag is not shown in the reply');
  // /flow-status and /flow-step (what a chat or a director runs)
  out.status = await new Promise((res) => Commands.tryRun('/flow-status', C.id, null, { say: res }));
  ok(/Doctor .*What does the card say/.test(out.status), `/flow-status (${out.status})`);
  await Commands.tryRun('/flow-step login', C.id);
  await until(() => Flows.waiting(r2)?.node.id === 'wait', 6000);
  ok(Flows.waiting(r2)?.node.id === 'wait' && r2.steps.some((e) => e.node === 'login' && e.input === '/astra-login'), `/flow-step answered, Codex sign-in ran (${Flows.line(r2)})`);
  Flows.stop(r2.id);

  // ---- hung and picked up after a restart ----
  const hang = { id: 'hang-test', name: 'Hang test', nodes: [{ id: 'a', kind: 'action', title: 'Wait a bit', cmd: '/wait 30s', next: 'b' }, { id: 'b', kind: 'result', text: 'ok {last}' }] };
  Flows.define(hang);
  const r3 = await new Promise((res) => { FlowsUI.startIn('hang-test', { agentId: C.id }).catch(() => {}); setTimeout(() => res(Flows.runs()[0]), 400); });
  ok(r3.flowId === 'hang-test' && r3.status === 'running', `a long step runs (${Flows.line(r3)})`);
  await Flows.persist();
  await Flows.restore(); // what a restart of Hearth does
  const back = Flows.run(r3.id);
  ok(back.status === 'hung' && /closed/.test(back.why), `after a restart the step is hung (${Flows.line(back)})`);
  FlowsUI.open({ runId: back.id });
  await until(() => nodeEl('a')?.querySelector('[data-fl="resume"]'), 4000);
  ok(document.querySelector('.fl-primary').textContent.includes('Pick up here'), 'Pick up here on the node and in the head');
  await shot('hung');
  back.flow.nodes[0].cmd = '/calc 1+1'; // quick this time
  nodeEl('a').querySelector('[data-fl="resume"]').click();
  await until(() => Flows.run(back.id).status === 'done', 8000);
  ok(Flows.run(back.id).status === 'done' && Flows.run(back.id).resumed === 1, `picked up and finished (${Flows.line(Flows.run(back.id))})`);
  dlg().close();

  // ---- /principal ----
  await Commands.tryRun('/principal add board-align', C.id);
  ok(!Commands.isTucked(Commands.get('board-align')), '/principal add puts a command in the "/" menu');
  await Commands.tryRun('/principal reset', C.id);
  ok(Commands.isTucked(Commands.get('board-align')), '/principal reset');

  // ---- authoring: edit a copy, add a step, wire it, save; /flow-make ----
  FlowsUI.open({ flowId: 'look' });
  await wait(200);
  await Commands.tryRun('/flow-edit look', C.id);
  await until(() => FlowsUI.view?.mode === 'edit', 3000);
  const V = FlowsUI.view;
  const nid = V.view.addNode('k:action', { x: 900, y: 40 });
  await wait(100);
  const draft = V.draft;
  const added = draft.nodes.find((n) => n.kind === 'action' && n.cmd === '/help');
  ok(added, `a new step from the picker becomes a real step (${draft.nodes.map((n) => n.id)})`);
  if (added) { V.view.connect('back', 'next', added.id, 'in'); await wait(50); const a2 = V.draft.nodes.find((n) => n.id === added.id); a2.cmd = '/calc 2+2'; a2.title = 'Sum'; ok(V.draft.nodes.find((n) => n.id === 'back')?.next === added.id, 'wired from "Back to the one before"'); }
  await wait(100);
  await shot('edit');
  document.querySelector('.fl-primary').click(); // Save as mine
  await until(() => FlowsUI.yours().length, 4000);
  const myFlow = FlowsUI.yours()[0];
  ok(myFlow && /mine/.test(myFlow.id) && myFlow.nodes.length === Flows.get('look').nodes.length + 1, `saved as mine (${myFlow?.id}, ${myFlow?.nodes.length} steps)`);
  ok((await window.hub.kvGet('flows-mine', [])).length === 1, 'yours are on disk');
  dlg().close();
  await Commands.tryRun('/flow-make shuffle until I like it then freeze', C.id);
  await until(() => FlowsUI.view?.mode === 'edit' && /Fake flow/.test(FlowsUI.view.draft?.name || ''), 20000);
  out.made = FlowsUI.view?.draft && { name: FlowsUI.view.draft.name, steps: FlowsUI.view.draft.nodes.map((n) => `${n.kind}:${n.cmd || n.title}`) };
  ok(out.made && out.made.steps.length === 4, `/flow-make: Claude wrote a flow from the commands (${JSON.stringify(out.made)})`);
  await shot('made');
  dlg().close();
  // keys sheet
  out.keys = Keys.all().filter((k) => k.area === 'Flows' || /Flows/.test(k.what)).length;
  ok(out.keys >= 6, `keys listed (${out.keys})`);
  // Ctrl+Shift+F opens the Commands page now (round 11); /flows nodes the node view
  activate(C.id); await wait(200);
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  await wait(300);
  ok(CmdPage.isOpen(), 'Ctrl+Shift+F opens the Commands page');
  await Commands.tryRun('/flows nodes', C.id); await wait(300);
  ok(dlg()?.open, '/flows nodes opens the node view');
  dlg()?.close();
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
