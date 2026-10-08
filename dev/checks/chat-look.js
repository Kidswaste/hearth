// Smoke check for the look of a chat: a reply with thinking, tools, code, table, callout, marks; then hover.
//   node dev/smoke.js --fake-engines --script dev/checks/chat-look.js --shot /tmp/look.png
// Set window.LOOK_DOCK = true (or pass "dock" in the env through --eval) to show a docked director chat instead.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(80); } return false; };
let agent = H.claudeAgent();
if (window.LOOK_DOCK) {
  H.config.agents.push({ id: 'threedirector', name: 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', threeTools: true });
  await saveConfig();
  await until(() => H.agent('threedirector') && Native.view?.('threedirector'), 8000).catch(() => {});
  activate('tool:three');
  await wait(1500);
  agent = H.agent('threedirector');
} else activate(agent.id);
await Native.send(agent.id, 'think tool code table long');
await until(() => !Native.isBusy(H.activeChat[agent.id]));
await Native.send(agent.id, 'think tools3 suggest code');
await until(() => !Native.isBusy(H.activeChat[agent.id]));
await Commands.tryRun('/pin-msg 2', agent.id);
await Commands.tryRun('/react fire', agent.id);
await Commands.tryRun('/tone concise', agent.id);
await Commands.tryRun('/stats', agent.id);
const evs = []; window.hub.onEngineEvent((e) => evs.push(e.type));
// a reply in progress, to see the live status
Native.send(agent.id, 'think slow long');
await wait(1600);
const v = Native.view(agent.id);
v.list.scrollTop = v.list.scrollHeight;
return JSON.stringify({ evs: evs.join(","), msgs: v.list.querySelectorAll('.msg').length, status: v.list.querySelector('.stream-status')?.textContent });
