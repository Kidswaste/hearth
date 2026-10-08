// QA: chats streaming (fake engines) while the Lab, the look effects and the meter are all busy: a docked Three
// Director chat inside the Lab, a main Claude chat replying in the background (unread mark), token badges,
// <suggest> command chips, Video Review open with a reply streaming.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/qa-stream.js --shot x.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(100); } return false; };
const out = { errors: [] };
const origErr = console.error;
console.error = (...a) => { out.errors.push(a.map(String).join(' ').slice(0, 200)); origErr(...a); };
addEventListener('error', (e) => out.errors.push(`uncaught ${e.message}`));
const claude = H.claudeAgent();
// a docked director in the Lab (as the owner has)
if (!H.agents().some((a) => a.dock === 'three')) {
  H.config.agents.push({ id: 'qadirector', name: 'Three Director', icon: '🔺', color: '#48ddff', mode: 'native', engine: 'claude', dock: 'three', enabled: true });
  await saveConfig(); await wait(1500);
}
const dir = H.agents().find((a) => a.dock === 'three');
out.director = dir?.id;
await Commands.tryRun('/glow 90', claude.id); await Commands.tryRun('/motion full', claude.id); await Commands.tryRun('/sparkles on', claude.id);
activate('tool:three'); await wait(3500);
Tools.syncDocks?.(); await wait(500);
out.dockShown = Boolean(document.querySelector('.tool-dock:not([hidden]) .composer'));
// 1. main Claude chat replies while you look at the Lab -> unread mark
Native.newChat(claude.id);
activate('tool:three'); await wait(300);
await Native.send(claude.id, 'think table long');
const mainChat = H.activeChat[claude.id]; // the chat exists once the first message is sent
// 2. the docked director streams at the same time
Native.newChat(dir.id);
await Native.send(dir.id, 'think tool code suggest');
const dirChat = H.activeChat[dir.id];
await wait(400);
out.bothBusy = Native.isBusy(mainChat) && Native.isBusy(dirChat);
out.meterLive = document.querySelector('.meter-strip, .meter-pill')?.textContent.slice(0, 120);
out.waitedBoth = await until(() => !Native.isBusy(mainChat) && !Native.isBusy(dirChat), 90000);
await wait(500);
out.unreadMain = H.unreadChats?.has(mainChat);
const dv = Native.view(dir.id);
out.dirBadge = Boolean(dv.list.querySelector('.meter-badge, .tok-badge'));
out.dirChips = [...dv.list.querySelectorAll('.suggest-chip')].map((c) => c.textContent).slice(0, 6);
const chip = dv.list.querySelector('.suggest-chip.cmd');
if (chip) { chip.click(); await wait(400); out.chipRan = chip.dataset.suggest; }
out.dirNotes = [...dv.list.querySelectorAll('.msg.note .body')].map((n) => n.textContent.slice(0, 80)).slice(-2);
// a shared command from the docked chat runs the Lab's version
await Commands.tryRun('/look', dir.id); await wait(300);
out.lookInLab = [...dv.list.querySelectorAll('.msg.note .body')].at(-1)?.textContent.slice(0, 80);
// 3. Video Review open while Claude replies
activate('tool:ae'); await wait(2500);
out.claudeBusyBefore = Native.isBusy(H.activeChat[claude.id]);
await until(() => !Native.isBusy(H.activeChat[claude.id]), 60000);
await Native.send(claude.id, 'code table');
await until(() => !Native.isBusy(H.activeChat[claude.id]), 20000);
await Commands.tryRun('/compare', claude.id); await wait(300);
out.compareOutsideVideo = Native.view(claude.id).list.querySelector('.msg.note:last-of-type .body')?.textContent.slice(0, 80);
out.meterToday = document.querySelector('.meter-strip, .meter-pill')?.textContent.slice(0, 120);
activate(claude.id); await wait(500);
out.unreadAfterOpen = H.unreadChats?.has(mainChat);
console.error = origErr;
return JSON.stringify(out, null, 1);
