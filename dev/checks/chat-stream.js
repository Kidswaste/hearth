// Smoke check: real streaming through engines.js with the fake CLIs.
//   node dev/smoke.js --fake-engines --script dev/checks/chat-stream.js --shot /tmp/stream.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(100); } return false; };
const status = await window.hub.engineStatus();
const out = { status };
for (const agent of [H.agents().find((a) => a.engine === 'codex'), H.claudeAgent()]) {
  activate(agent.id);
  Native.newChat(agent.id);
  await Native.send(agent.id, 'think tool code suggest remember table');
  const chatId = H.activeChat[agent.id];
  await wait(200);
  out[`${agent.id}.streaming`] = Native.isBusy(chatId);
  await until(() => !Native.isBusy(chatId));
  const chat = await window.hub.getChat(chatId);
  const reply = chat.messages.at(-1);
  out[agent.id] = { role: reply.role, usage: reply.usage, tools: reply.tools, thinking: Boolean(reply.thinking), suggest: reply.suggest, remembered: reply.remembered, session: Boolean(chat.session?.id) };
}
// a second turn resumes the session and shows the per-turn usage
const claude = H.claudeAgent();
await Native.send(claude.id, 'hello again');
await until(() => !Native.isBusy(H.activeChat[claude.id]));
out.secondTurn = (await window.hub.getChat(H.activeChat[claude.id])).messages.at(-1).usage;
// errors and stopping
await Native.send(claude.id, 'error please');
await until(() => !Native.isBusy(H.activeChat[claude.id]));
out.error = (await window.hub.getChat(H.activeChat[claude.id])).messages.at(-1);
await Native.send(claude.id, 'slow long');
await wait(800);
await window.hub.stop(H.activeChat[claude.id]);
await until(() => !Native.isBusy(H.activeChat[claude.id]));
out.stopped = (await window.hub.getChat(H.activeChat[claude.id])).messages.at(-1).stopped;
return JSON.stringify(out, null, 1);
