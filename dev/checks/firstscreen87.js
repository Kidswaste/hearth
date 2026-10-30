// (round 87, firstscreen87) The three files taken off the first screen (memorytidy-core.js, updater.js,
// comp-dispatch.js: lazy groups 'memorytidycore', 'updater', 'compdispatch') work from the first moment, both when
// their group is already in (the usual case) and when it is still a stand-in (after a reload with every group held
// back: the first use loads it):
//   memory tidy's core: a fact an AI saves (<remember>) replaces the one it repeats, and its Undo puts it back
//   the updater: /update (command), its two Ctrl/⌘+K lines (palette), the ⬆ rail button (button) and its dialog,
//     Settings' update row
//   comp dispatch: /dispatch (command), its Ctrl/⌘+K line, a comp card in the open chat (drawn whole), three_do comp
//   node dev/smoke.js --script dev/checks/firstscreen87.js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = []; const bad = [];
const ok = (c, m) => { (c ? out : bad).push(m); };
const closeAll = async () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); await sleep(80); };
const state = (g) => Lazy.state().find((x) => x.name === g)?.state;
async function round(label) {
  const until = async (fn, ms = 4000) => { const t0 = Date.now(); for (;;) { let v; try { v = fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(50); } };
  const before = { memorytidycore: state('memorytidycore'), updater: state('updater'), compdispatch: state('compdispatch') };
  const agent = H.claudeAgent?.() || H.agents().find((a) => a.mode === 'native');
  const said = [];
  const run = (line) => Commands.exec(line, agent?.id, { say: (t) => said.push(String(t)), note: (t) => said.push(String(t)) });

  // ---------- memory tidy's core (memorytidycore) ----------
  const mem0 = await window.hub.getMemory();
  try {
    const fact = `Works at night on visuals (fs87 ${label})`;
    const r1 = await Native.rememberFacts(agent.id, [fact]);
    ok(r1 && Array.isArray(r1.skipped), `${label}: a saved fact goes through memory tidy (saveFacts ran: ${r1 ? 'yes' : 'no'})`);
    const r2 = await Native.rememberFacts(agent.id, [fact]);
    const m2 = await window.hub.getMemory();
    const n = (m2.agents[agent.id] || '').split('\n').filter((l) => l.includes(`fs87 ${label}`)).length;
    ok(r2?.skipped?.length === 1 && n === 1, `${label}: the same fact saved twice is kept once (${n} line${n === 1 ? '' : 's'})`);
    ok(typeof MemoryTidyCore !== 'undefined' && state('memorytidycore') === 'loaded', `${label}: memorytidycore in after the first save`);
  } catch (err) { ok(false, `${label}: memory tidy: ${err.message}`); } finally { await window.hub.saveMemory(mem0); }

  // ---------- the updater ----------
  const auto0 = store.get('update.auto', true);
  said.length = 0;
  await run('/update auto off');
  ok(/by itself: \*\*off\*\*/.test(said.join('\n')) && store.get('update.auto', true) === false, `${label}: /update auto off answers (${said.join(' ').slice(0, 60)})`);
  said.length = 0;
  await run('/update auto on');
  ok(/\*\*on\*\*/.test(said.join('\n')), `${label}: /update auto on answers`);
  store.set('update.auto', auto0);
  ok(state('updater') === 'loaded' && typeof Updater !== 'undefined', `${label}: the updater is in`);
  // the ⬆ button: a fake main two changes ahead (no git, no network)
  Updater._setApi(() => ({ status: async () => ({ ok: true, behind: 2, head: 'aaaaaaa', remote: 'bbbbbbb', commits: [{ subject: 'fs87 one' }, { subject: 'fs87 two' }] }) }));
  await Updater.check();
  const up = await until(() => { const b = document.getElementById('up-btn'); return b && !b.hidden ? b : null; });
  ok(up && /2/.test(up.textContent), `${label}: the ⬆ rail button shows 2 changes`);
  up?.click();
  const dlg = await until(() => document.querySelector('dialog.up-dlg[open]'));
  ok(dlg && /fs87 one/.test(dlg.textContent), `${label}: a click on ⬆ opens What's new with the changes`);
  await closeAll();
  // its Ctrl/⌘+K lines (the palette runs the action's function)
  const acts = AppUI.actions?.() || [];
  const pn = acts.find((a) => /^Patch notes: what changed/.test(a.label));
  ok(pn && acts.some((a) => /^Go back to the previous Hearth version/.test(a.label)), `${label}: its two Ctrl/⌘+K lines are there`);
  try { await pn?.run?.(); } catch (err) { ok(false, `${label}: Patch notes: ${err.message}`); }
  ok(await until(() => document.querySelector('dialog[open]')), `${label}: Ctrl/⌘+K › Patch notes opens the notes`);
  await closeAll();
  // Settings' What's new row reads Updater.status
  await AppUI.openSettings('update');
  const st = await until(() => document.querySelector('dialog.settings-dialog[open]'));
  ok(st && /2 new change|Hearth looks for updates|updates/i.test(st.textContent), `${label}: Settings opens with its update row`);
  await closeAll();
  Updater._setApi(() => window.hub.update);

  // ---------- comp dispatch ----------
  said.length = 0;
  const p1 = run('/dispatch');
  const ask = await until(() => [...document.querySelectorAll('dialog[open]')].find((d) => /Dispatch parts to other chats/.test(d.textContent)));
  ok(ask, `${label}: /dispatch opens its "Dispatch parts" box`);
  await closeAll(); await p1;
  const da = (AppUI.actions?.() || []).find((a) => /^Lab: Dispatch parts to other chats/.test(a.label));
  ok(da, `${label}: its Ctrl/⌘+K line is there`);
  try { da?.run?.(); } catch (err) { ok(false, `${label}: dispatch action: ${err.message}`); }
  ok(await until(() => [...document.querySelectorAll('dialog[open]')].find((d) => /Dispatch parts to other chats/.test(d.textContent))), `${label}: Ctrl/⌘+K › Dispatch parts opens the box`);
  await closeAll();
  ok(typeof CompDispatch !== 'undefined' && typeof CompDispatch.handle === 'function', `${label}: compdispatch is in (three_do comp reaches it)`);
  return before;
}

// a comp card in the open chat (drawn by native.js through CompDispatch.cardEl, a stand-in head until the group is in)
async function card(label) {
  const until = async (fn, ms = 4000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(50); } };
  const agent = H.claudeAgent?.() || H.agents().find((a) => a.mode === 'native');
  activate(agent.id);
  await sleep(300);
  let chat = Native.current(agent.id);
  if (!chat) chat = Native.ensureChat(agent.id, 'fs87 comp card'); // (an empty profile: a fresh chat, not saved)
  if (!chat) { ok(false, `${label}: no chat to draw a comp card in`); return; }
  const m = { role: 'comp', id: `fs87${label.replace(/\W/g, '')}`, at: Date.now(), layout: 'time', len: 8, host: { chatId: chat.id, sketchId: null }, text: '◫ Comp (fs87)',
    parts: [{ n: 1, name: 'Opening', brief: 'an opening', engine: 'claude', chatId: 'fs87-none-1', state: 'done', last: 'done' }, { n: 2, name: 'Drop', brief: 'the drop', engine: 'codex', chatId: 'fs87-none-2', state: 'waiting', last: '' }] };
  chat.messages.push(m);
  try {
    await Native.refresh(agent.id);
    const head = await until(() => document.querySelector(`.comp-card[data-cid="${m.id}"] .comp-head`));
    ok(head && /2 parts/.test(head.textContent), `${label}: the comp card shows at once (${head ? head.textContent.slice(0, 30) : 'none'})`);
    const rows = await until(() => document.querySelectorAll(`.comp-card[data-cid="${m.id}"] .comp-row`).length === 2);
    ok(rows, `${label}: the comp card is drawn whole, its two parts with their buttons`);
  } catch (err) { ok(false, `${label}: comp card: ${err.message}`); } finally {
    const i = chat.messages.indexOf(m); if (i >= 0) chat.messages.splice(i, 1);
    await Native.refresh(agent.id);
  }
}

// 1. the groups loaded after the first screen (the usual case: updater and compdispatch right after the first frame)
const g0 = { memorytidycore: state('memorytidycore'), updater: state('updater'), compdispatch: state('compdispatch') };
ok(g0.updater !== 'stub' && g0.compdispatch !== 'stub', `updater / compdispatch come in right after the first frame: ${JSON.stringify(g0)}`);
await Lazy.load('memorytidycore');
await card('loaded');
await round('loaded');
// 2. after a reload with every group held back: the first use of each loads its group
localStorage.setItem('fs87.round', round.toString());
localStorage.setItem('fs87.card', card.toString());
localStorage.setItem('fs87.part1', JSON.stringify({ out, bad }));
localStorage.setItem('lazy.hold', '1');
return `part 1: ${bad.length ? `FAIL ${bad.length}` : 'PASS'} ${out.length} ok`;
//@@ reload
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { out, bad } = JSON.parse(localStorage.getItem('fs87.part1'));
const ok = (c, m) => { (c ? out : bad).push(m); };
const closeAll = async () => { for (const d of document.querySelectorAll('dialog[open]')) d.close(); await sleep(80); };
const state = (g) => Lazy.state().find((x) => x.name === g)?.state;
const round = eval(`(${localStorage.getItem('fs87.round')})`); // eslint-disable-line no-eval
const card = eval(`(${localStorage.getItem('fs87.card')})`); // eslint-disable-line no-eval
localStorage.removeItem('lazy.hold');
const held = { memorytidycore: state('memorytidycore'), updater: state('updater'), compdispatch: state('compdispatch') };
ok(Object.values(held).every((s) => s === 'stub'), `groups held before the first use: ${JSON.stringify(held)}`);
await card('stand-in');
ok(state('compdispatch') === 'loaded', 'a comp card drawn before its group loads it');
// (Lazy.load: each group is held again for its own first use)
await round('stand-in');
ok(Lazy.misses().filter((x) => ['Updater', 'CompDispatch'].includes(x.name) && !/firstscreen87|<anonymous>|eval|messageEl native\.js/.test(x.where || '')).length === 0, `no app code touched Updater / CompDispatch before its group (native.js's comp card asks for it with typeof, on purpose): ${JSON.stringify(Lazy.misses().filter((x) => ['Updater', 'CompDispatch', 'MemoryTidyCore'].includes(x.name)).map((x) => x.where))}`);
localStorage.removeItem('fs87.round'); localStorage.removeItem('fs87.card'); localStorage.removeItem('fs87.part1');
return `${bad.length ? `FAIL ${bad.length}\n✖ ${bad.join('\n✖ ')}\n` : 'PASS '}${out.length} ok\n${out.join('\n')}`;
