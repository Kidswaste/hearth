// Flows (round 10): "Make a video" driven like a user in the flow view: the idea typed on the node, format and length
// picked on the nodes, Astra (fake Codex) drafts the beats, "Change them" → words → Astra again, Yes, the video project
// is planned through /intro (its length and format set), "Not now" → the result; then ↻ Again (the same answers,
// the AI asked again: a new run that branches off this one), ✎ Refine (the result kept, one change asked), the list
// of runs, the card in the chat and the flow started from the flows list (double-click).
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/flows-video.js --shot /tmp/flows-video.png
const SHOTS = window.FLOW_SHOTS || '/tmp/hearth-checks/flows-video';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const dlg = () => document.querySelector('.fl-dialog');
const nodeEl = (id) => dlg().querySelector(`.nv-node[data-id="${id}"]`);
const shot = async (name) => { try { await smoke({ shot: `${SHOTS}-${name}.png` }); } catch { /* optional */ } };
const opt = (id, label) => [...(nodeEl(id)?.querySelectorAll('.fl-opt') || [])].find((r) => r.textContent.trim().startsWith(label));
const waitingAt = (run, id, ms = 20000) => until(() => Flows.waiting(run)?.node.id === id && nodeEl(id)?.querySelector('[data-fl="validate"], .fl-input'), ms);
async function choose(run, id, label) {
  ok(await waitingAt(run, id), `waiting at ${id} (${Flows.line(run)})`);
  const o = opt(id, label);
  ok(o, `option "${label}" on ${id}`);
  o?.click(); await wait(60);
  nodeEl(id).querySelector('[data-fl="validate"]').click();
  await until(() => Flows.waiting(run)?.node.id !== id, 10000);
}
async function type(run, id, text) {
  ok(await waitingAt(run, id), `waiting at ${id} (${Flows.line(run)})`);
  const inp = nodeEl(id).querySelector('.fl-input');
  inp.value = text; inp.dispatchEvent(new Event('input', { bubbles: true }));
  inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })); // Ctrl+Enter in a text box validates
  await until(() => Flows.waiting(run)?.node.id !== id, 10000);
}
try {
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat(C.id);
  await until(() => typeof FlowsUI !== 'undefined' && Flows.get('make-video'), 10000);
  // from the flows list: Ctrl+Shift+F, then double-click "Make a video"
  FlowsUI.open({}); // (round 11) the node view is the advanced one (Ctrl+Shift+F opens the Commands page)
  await until(() => dlg()?.open, 3000);
  const item = [...dlg().querySelectorAll('.fl-item')].find((x) => /Make a video/.test(x.textContent));
  item.click(); await wait(300);
  ok(/▶ Start/.test(document.querySelector('.fl-primary').textContent), 'a flow shows first, with ▶ Start');
  await shot('preview');
  item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await until(() => Flows.runs()[0]?.flowId === 'make-video', 5000);
  const run = Flows.runs()[0];
  ok(run.chatId === H.activeChat[C.id], 'the run belongs to this chat');
  await type(run, 'idea', 'a 15 s teaser: two AIs, one window');
  await choose(run, 'fmt', '9:16');
  await choose(run, 'len', '15 s');
  // Astra drafts the beats (fake Codex, a lean one-off question)
  ok(await until(() => run.status === 'waiting-ai' || Flows.waiting(run)?.node.id === 'keep', 8000), `Astra on it (${Flows.line(run)})`);
  ok(await waitingAt(run, 'keep', 30000), `beats drafted (${Flows.line(run)})`);
  out.beats = run.vars.beats;
  ok(run.steps.find((e) => e.node === 'beats')?.engine === 'astra' && /15 s social video \(9:16\) about: a 15 s teaser/.test(run.steps.find((e) => e.node === 'beats').input), `the beats prompt was filled (${run.steps.find((e) => e.node === 'beats')?.input})`);
  ok(nodeEl('beats')?.querySelector('.fl-out')?.textContent.length > 5, 'the beats show on the node');
  await shot('beats');
  await choose(run, 'keep', 'Change them');
  await type(run, 'change', 'shorter hook, end on the logo');
  ok(await waitingAt(run, 'keep', 30000), 'Astra changed the beats, the choice is back');
  ok(/Change only this: shorter hook/.test(run.steps.filter((e) => e.node === 'redo').at(-1)?.input || ''), 'the change went to Astra with the old beats');
  await choose(run, 'keep', 'Yes');
  // /intro plans the project with the idea, its length and format
  ok(await waitingAt(run, 'go', 60000), `the project is planned (${Flows.line(run)})`);
  out.cmds = run.steps.filter((e) => e.kind === 'action').map((e) => e.input);
  ok(out.cmds.join('|') === '/intro a 15 s teaser: two AIs, one window|/intro length 15|/intro formats 9:16', `the /intro steps (${out.cmds})`);
  out.project = typeof Intro !== 'undefined' ? Intro.list().map((p) => `${p.name}: ${p.status}`).slice(0, 2) : null;
  ok(!out.project || out.project.length >= 1, `a video project exists (${out.project})`);
  await shot('go');
  await choose(run, 'go', 'Not now');
  ok(await until(() => run.status === 'done', 8000), `done (${Flows.line(run)})`);
  await until(() => nodeEl('planned')?.querySelector('.fl-result'), 3000);
  ok(/planned with these beats/.test(run.result) && nodeEl('planned')?.querySelector('.fl-result'), `the result on its node (${String(run.result).slice(0, 80)})`);
  await shot('done');
  // ↻ Again: the same answers, Astra asked again (a new run, branched from this one)
  const asks = run.steps.filter((e) => e.kind === 'ai').length;
  document.querySelector('.fl-primary').click();
  await until(() => Flows.runs()[0] !== run && Flows.runs()[0].flowId === 'make-video', 5000);
  const again = Flows.runs()[0];
  ok(await until(() => again.status === 'done' || Flows.waiting(again), 60000), `again: moving (${Flows.line(again)})`);
  out.again = Flows.line(again);
  ok(again.parent?.run === run.id && again.steps.filter((e) => e.replayed).length >= 4, `again replays your answers (${again.steps.filter((e) => e.replayed).map((e) => e.node)})`);
  ok(again.steps.some((e) => e.kind === 'ai' && e.status === 'done' && !e.replayed), 'again asks the AI again (a new result)');
  ok(asks >= 2, 'the first run asked Astra twice (draft + change)');
  // the runs list shows both, the branch is linked
  await wait(300);
  out.list = [...dlg().querySelectorAll('.fl-list .fl-run .fl-rn')].map((x) => x.textContent);
  ok(out.list.some((x) => /Make a video/.test(x)), `runs in the list (${out.list})`);
  // ✎ Refine the first one
  FlowsUI.open({ runId: run.id });
  await until(() => nodeEl('planned')?.querySelector('[data-fl="refine"]'), 4000);
  out.plannedNode = nodeEl('planned')?.innerText.replace(/\s+/g, ' ').slice(0, 200);
  nodeEl('planned').querySelector('[data-fl="refine"]').click();
  await until(() => document.querySelector('dialog.ui-modal[open] input, dialog[open] .modal-fields input, dialog[open] label input'), 3000);
  const inp = [...document.querySelectorAll('dialog[open] input')].at(-1);
  inp.value = 'add a call to action';
  inp.closest('form')?.requestSubmit?.() || inp.closest('dialog').querySelector('button.primary')?.click();
  await until(() => run.refines === 1 && run.status === 'done', 30000);
  out.refined = String(run.result).slice(0, 160);
  ok(run.refines === 1 && run.status === 'done' && run.steps.some((e) => e.node === 'refine1' && /add a call to action/.test(e.input)), `refined (${out.refined})`);
  ok(run.steps.find((e) => e.node === 'refine1')?.engine === 'astra', 'refined by the flow\'s own engine (Astra)');
  await until(() => nodeEl('refined-result1'), 3000);
  ok(nodeEl('refined-result1'), 'the refine steps show as nodes');
  await shot('refined');
  dlg().close();
  // the card in the chat says it's done, with Again / Refine (/intro opened the project's chat: back to the run's)
  out.chatMoved = H.activeChat[C.id] !== run.chatId;
  if (out.chatMoved) { Native.open(C.id, run.chatId); }
  await until(() => /done/.test(Native.view(C.id).list.querySelector(`.msg.note[data-note-id="flow-${run.id}"]`)?.innerText || ''), 5000);
  ok(/add a call to action/.test(run.steps.find((e) => e.node === 'refine1').input) && /planned with these beats/.test(run.steps.find((e) => e.node === 'refine1').input), 'the refine starts from the result');
  const card = Native.view(C.id).list.querySelector(`.msg.note[data-note-id="flow-${run.id}"]`);
  out.card = card?.innerText.replace(/\s+/g, ' ').slice(0, 200);
  ok(card && /done/.test(out.card) && /Again/.test(out.card) && /Refine/.test(out.card), `the chat card (${out.card})`);
  await shot('card');
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
