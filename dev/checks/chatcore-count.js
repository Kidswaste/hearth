// Chats at the core (round 9): the declutter count of the chat view, for a before / after table in
// docs/upgrades/chatcore.md (run it in this tree and in an older copy). The same conversation in both: thinking, a
// fake tool, three tool steps with suggestions, a real capture_shot. Counted like dev/checks/declutter-count.js
// (visible buttons, selects, inputs, summaries, links), plus the characters of secondary info always on screen (the
// tool-call lines and attachment chips) and the composer while it has the focus.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/chatcore-count.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const SEL = 'button, select, input:not([type=hidden]), textarea, summary, a[href], [role=button]';
const vis = (n) => n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0 && getComputedStyle(n).opacity !== '0';
const count = (root, skip) => (root ? [...root.querySelectorAll(SEL)].filter((n) => vis(n) && !(skip && n.closest(skip))).length : 0);
const C = H.claudeAgent();
activate(C.id); await wait(400);
const quiet = { say: () => {}, note: () => {} };
await Commands.tryRun('/capture-tools on', C.id, null, quiet);
for (const m of ['think tool code', 'tools3 suggest', 'mcp please\nmcp: [["capture_shot", {"target": "window"}]]']) {
  await Native.send(C.id, m); await wait(200);
  await until(() => !Native.isBusy(H.activeChat[C.id]));
}
await wait(600);
const v = Native.view(C.id);
document.activeElement?.blur?.();
v.list.scrollTop = 0; await wait(150);
const all = () => {
  const msgs = [...v.list.querySelectorAll('.msg')];
  return {
    'chat header': count(v.root.querySelector('.native-head')),
    'messages (whole chat)': msgs.reduce((s, m) => s + count(m), 0),
    'older message feet': [...v.list.querySelectorAll('.msg:not(:last-child) > .msg-foot')].reduce((s, f) => s + count(f), 0),
    'composer (unfocused)': count(v.form),
    'tool lines, characters': [...v.list.querySelectorAll('.tool-chips')].reduce((s, t) => s + (t.matches('details') ? t.querySelector('summary').textContent.length : t.textContent.length), 0),
  };
};
const out = { tidy: all() };
v.input.focus(); await wait(200);
out.tidy['composer (typing)'] = count(v.form);
v.input.blur();
await Commands.tryRun('/calm off', C.id, null, quiet); await wait(250);
out.everything = all();
await Commands.tryRun('/calm on', C.id, null, quiet);
out.cards = v.list.querySelectorAll('.thing').length;
return JSON.stringify(out, null, 1);
