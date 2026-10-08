// Smoke check: the newer chat extras (aliases, chains, typo guard, raw view, archive, palette entries, keys, paste).
//   node dev/smoke.js --fake-engines --script dev/checks/chat-extra.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(80); } return false; };
const agent = H.claudeAgent();
activate(agent.id);
const v = Native.view(agent.id);
const out = {};
const lastNote = () => [...v.list.querySelectorAll('.msg.note .body')].at(-1)?.textContent || '';
const submit = async (text) => { v.input.value = text; v.input.dispatchEvent(new Event('input')); v.form.requestSubmit(); await wait(150); };
try {
  await Native.send(agent.id, 'think table code');
  await until(() => !Native.isBusy(H.activeChat[agent.id]));
  // typo guard: "/stas" is not sent; Enter again sends it
  const before = Native.current(agent.id).messages.length;
  await submit('/stas');
  out.typoNote = lastNote().slice(0, 80);
  out.typoKept = v.input.value;
  out.typoNotSent = Native.current(agent.id).messages.length === before;
  v.input.value = '';
  // aliases and chains
  await Commands.tryRun('/alias wide /run /width wide ; /density compact', agent.id);
  out.aliasNote = lastNote().slice(0, 60);
  await Commands.tryRun('/wide', agent.id);
  out.afterAlias = { width: ChatUX.pref('width'), density: ChatUX.pref('density') };
  await Commands.tryRun('/run /width normal ; /density cozy', agent.id);
  out.afterRun = { width: ChatUX.pref('width'), density: ChatUX.pref('density') };
  await Commands.tryRun('/unalias wide', agent.id);
  out.aliasGone = !Commands.get('wide');
  // raw view
  await Commands.tryRun('/raw', agent.id);
  out.raw = Boolean(v.list.querySelector('.body.raw'));
  await Commands.tryRun('/raw', agent.id);
  // archive hides the chat from the list
  await Commands.tryRun('/archive', agent.id);
  await wait(400);
  out.archivedRows = document.querySelectorAll('#chat-groups .item').length;
  await Commands.tryRun('/undo', agent.id);
  await wait(400);
  out.unarchivedRows = document.querySelectorAll('#chat-groups .item').length;
  // palette has the chat commands
  out.paletteChat = AppUI.actions().filter((a) => a.label.startsWith('/')).length;
  // Alt+B bookmarks the last reply, Alt+P pins it
  v.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', altKey: true, bubbles: true }));
  v.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', altKey: true, bubbles: true }));
  await wait(100);
  const last = Native.current(agent.id).messages.at(-1);
  out.altKeys = { bookmark: last.bookmark, pinned: last.pinnedMsg };
  // smart paste of code into the box
  v.input.value = '';
  const dt = new DataTransfer();
  dt.setData('text/plain', 'function a() {\n  return 1;\n}');
  v.input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  out.pasted = v.input.value;
  v.input.value = '';
  // calc, typos and /help count
  await Commands.tryRun('/calc (2+3)^2 - 10 % 4', agent.id);
  out.calc = lastNote();
  out.closest = Commands.closest('stas')?.name;
  out.commands = Commands.list().length;
  // markdown image + task list rendering
  out.md = renderMarkdown('![logo](https://example.com/a.png)\n\n- [x] ok').replace(/\s+/g, ' ').slice(0, 160);
} catch (err) { out.error = String(err.stack || err); }
return JSON.stringify(out, null, 1);
