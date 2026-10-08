// Smoke check: a chat with a few replies, then one of the menus open for the screenshot.
//   node dev/smoke.js --fake-engines --eval "window.MENU='slash'" --script dev/checks/chat-menus.js --shot /tmp/m.png
//   MENU: 'slash' (the / menu), 'msg' (a reply's ⋯ menu), 'find' (find in chat), 'panel' (chat list filter + tags)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(80); } return false; };
const agent = H.claudeAgent();
activate(agent.id);
for (const m of ['think table', 'code suggest remember']) {
  await Native.send(agent.id, m);
  await until(() => !Native.isBusy(H.activeChat[agent.id]));
}
await Commands.tryRun('/tag music', agent.id);
await Commands.tryRun('/folder Visuals', agent.id);
await Commands.tryRun('/bookmark 2', agent.id);
const v = Native.view(agent.id);
const out = {};
if (window.MENU === 'slash') {
  await Commands.tryRun('/stats', agent.id); // a recent command
  v.input.focus();
  v.input.value = '/';
  v.input.dispatchEvent(new Event('input'));
  await wait(400);
  out.items = document.querySelectorAll('.slash-item').length;
} else if (window.MENU === 'msg') {
  const btn = v.list.querySelector('.msg.assistant:last-of-type .msg-more') || [...v.list.querySelectorAll('.msg-more')].at(-1);
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await wait(300);
  out.menu = [...document.querySelectorAll('#menu button')].map((b) => b.textContent);
} else if (window.MENU === 'find') {
  ChatUX.find(agent.id, 'fake');
  await wait(300);
  out.hits = v.list.querySelectorAll('mark.find-hit').length;
} else if (window.MENU === 'panel') {
  await Native.send(H.agents().find((a) => a.engine === 'codex').id, 'hi astra');
  await wait(2500);
  document.querySelector('.panel-filter-btn').click();
  await wait(300);
  out.menu = [...document.querySelectorAll('#menu button')].map((b) => b.textContent);
}
return JSON.stringify(out);
