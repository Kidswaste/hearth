// Live activity of long tasks in a chat (round 21, liveness), driven like a user with the fake engines' long scenarios
// (dev/fake-liveness.js): Claude deploys three subagents (a tree under the reply, their steps kept out of it, "Deployed 3
// agents" after), Astra spawns two, the activity panel lists steps live, a silent tool is explained and offers Wait /
// Stop / Stop & retry from here, a killed engine ends with an error and the partial text kept, /activity and /subagents.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/liveness-ui.js --shot /tmp/liveness.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(50); } return false; };
const out = {};
const fail = [];
const expect = (cond, what) => { if (!cond) fail.push(what); };
const claude = H.claudeAgent();
const astra = H.agents().find((a) => a.engine === 'codex');
const v = (id = claude.id) => Native.view(id);
const lastReply = async (id = claude.id) => (await window.hub.getChat(H.activeChat[id])).messages;
ChatLive._tune({ stallMs: 4000, quietMs: 1500 }); // the 2 min / 5 s of real use, shortened

// 1. Claude deploys subagents: watched while it streams
activate(claude.id); await wait(300);
Native.newChat(claude.id); await wait(200);
Native.send(claude.id, 'subagents');
let seen = { agents: 0, running: 0, status: '', mixed: false };
await until(() => Native.isBusy(H.activeChat[claude.id]), 8000);
await until(() => {
  const live = v().list.querySelector('.msg.streaming');
  if (live) {
    const rows = live.querySelectorAll('.live-agents .live-agent');
    seen.agents = Math.max(seen.agents, rows.length);
    seen.running = Math.max(seen.running, live.querySelectorAll('.live-agents .live-agent.running').length);
    const st = live.querySelector('.stream-status')?.textContent || '';
    if (/agent/.test(st)) seen.status = st;
    if (/Subagent A thinking/.test(live.querySelector('.body')?.textContent || '')) seen.mixed = true;
  }
  return !Native.isBusy(H.activeChat[claude.id]);
}, 30000);
await wait(300);
let msgs = await lastReply();
let reply = msgs.at(-1);
out.subagents = { seen, activity: reply.activity, tools: reply.tools, fold: v().list.querySelector('.msg:last-child .agent-fold summary')?.textContent };
expect(seen.agents === 3, `3 agents shown live (saw ${seen.agents})`);
expect(!seen.mixed && !/Subagent A thinking/.test(reply.text), "a subagent's text stays out of the reply");
expect(reply.activity?.agents?.length === 3 && reply.activity.agents.filter((a) => a.status === 'failed').length === 1, 'the reply keeps its 3 agents, one failed');
expect(/Deployed 3 agents · 2 done · 1 failed/.test(out.subagents.fold || ''), 'finished reply: "Deployed 3 agents" fold');
expect(!(reply.tools || []).some((t) => /three_read_code|Grep/.test(t)), "subagents' tool calls aren't in the reply's own steps");
const fold = v().list.querySelector('.msg:last-child .agent-fold');
if (fold) { fold.open = true; await wait(100); out.subagents.foldList = [...fold.querySelectorAll('li')].map((li) => li.textContent); }
expect(out.subagents.foldList?.some((t) => /Bloom pass added/.test(t)), "the fold lists each agent's result");
await smoke({ shot: '/tmp/liveness-agents.png' });

// 2. Astra's spawned agents
if (astra) {
  activate(astra.id); await wait(300);
  Native.newChat(astra.id); await wait(200);
  Native.send(astra.id, 'subagents');
  await until(() => Native.isBusy(H.activeChat[astra.id]), 8000);
  await until(() => !Native.isBusy(H.activeChat[astra.id]), 30000);
  await wait(200);
  const r = (await lastReply(astra.id)).at(-1);
  out.astraAgents = r.activity?.agents?.map((a) => `${a.description}: ${a.status}`);
  expect(r.activity?.agents?.length === 2, 'Astra: 2 spawned agents kept');
  activate(claude.id); await wait(300);
}

// 3. the activity panel, live, during a marathon (opened by the user: it stays open for the next replies)
Native.newChat(claude.id); await wait(200);
Native.send(claude.id, 'marathon:90');
await until(() => v().list.querySelector('.msg.streaming .live-activity'), 15000);
const panel = v().list.querySelector('.msg.streaming .live-activity');
panel.open = true;
let maxRows = 0;
await until(() => { const n = v().list.querySelectorAll('.msg.streaming .live-steps li').length; maxRows = Math.max(maxRows, n); return !Native.isBusy(H.activeChat[claude.id]); }, 60000);
out.panel = { maxRows, summary: panel.querySelector('summary')?.textContent, activity: (await lastReply()).at(-1).activity };
expect(maxRows > 10 && maxRows <= 60, `the panel lists steps live, at most 60 rows (${maxRows})`);
expect(/Activity · \d+ steps/.test(out.panel.summary || ''), 'the panel summary counts the steps');
store.set('chat.activityOpen', false);

// 4. a tool that stays silent: explained, then Wait / Stop / Stop & retry from here
Native.newChat(claude.id); await wait(200);
Native.send(claude.id, 'quiet:9');
await until(() => /last news/.test(v().list.querySelector('.msg.streaming .stream-status')?.textContent || ''), 8000);
out.quietLine = v().list.querySelector('.msg.streaming .stream-status')?.textContent;
expect(/Running three screenshot on frames: 12/.test(out.quietLine || ''), `the line names the running tool (${out.quietLine})`);
await until(() => v().list.querySelector('.msg.streaming .stream-status.stalled'), 8000);
const st = v().list.querySelector('.msg.streaming .stream-status');
out.stallLine = st?.textContent;
out.stallButtons = [...(st?.querySelectorAll('.live-acts button') || [])].map((b) => b.textContent);
expect(/No news for/.test(out.stallLine || '') && /three screenshot/.test(out.stallLine || ''), `stalled: says so and names the tool (${out.stallLine})`);
expect(out.stallButtons.slice(0, 3).join('|') === 'Wait|Stop|Stop & retry from here', 'stalled: Wait · Stop · Stop & retry from here (then ⚑ Report, devreport)');
await smoke({ shot: '/tmp/liveness-stall.png' });
st.querySelector('.live-acts button').click(); // Wait
await wait(1200);
expect(!v().list.querySelector('.msg.streaming .stream-status.stalled'), 'Wait clears the stall for a while');
await until(() => !Native.isBusy(H.activeChat[claude.id]), 20000);
expect((await lastReply()).at(-1).role === 'assistant', 'the quiet task still ends normally');

// 5. a hung engine: Stop & retry from here stops it and asks it to carry on
Native.newChat(claude.id); await wait(200);
Native.send(claude.id, 'hang');
await until(() => v().list.querySelector('.msg.streaming .stream-status.stalled .live-acts'), 15000);
[...v().list.querySelectorAll('.msg.streaming .live-acts button')].find((b) => /retry/.test(b.textContent))?.click();
await until(async () => { const m = await lastReply(); return m.length >= 4 && !Native.isBusy(H.activeChat[claude.id]); }, 30000);
msgs = await lastReply();
out.unstick = msgs.map((m) => `${m.role}${m.stopped ? '(stopped)' : ''}: ${String(m.text).slice(0, 90)}`);
expect(msgs.some((m) => m.role === 'user' && /Continue from where you stopped \(it seemed stuck on hearth-three · three eval/.test(m.text)), 'Stop & retry sends one short "continue" naming what was stuck');

// 6. a killed engine: an error, what it wrote kept
Native.newChat(claude.id); await wait(200);
Native.send(claude.id, 'die');
await until(() => !Native.isBusy(H.activeChat[claude.id]), 20000);
msgs = await lastReply();
out.die = msgs.slice(-2).map((m) => `${m.role}${m.stopped ? '(stopped)' : ''}: ${String(m.text).slice(0, 120)}`);
expect(msgs.at(-1).role === 'error' && /stopped unexpectedly/.test(msgs.at(-1).text), 'killed engine: a clear error');
expect(msgs.at(-2).role === 'assistant' && /halfway/.test(msgs.at(-2).text), 'killed engine: the partial reply is kept');

// 7. commands
out.activityCmd = await new Promise((resolve) => Commands.tryRun('/activity', claude.id, null, { say: resolve, note: resolve }).then((r) => typeof r === 'string' && resolve(r)));
await Commands.tryRun('/subagents on', claude.id, null, { say: () => {} });
out.subagentsOn = Boolean(Native.current(claude.id)?.subagents);
expect(out.subagentsOn, '/subagents on marks the chat');
await Commands.tryRun('/subagents off', claude.id, null, { say: () => {} });
expect(!Native.current(claude.id)?.subagents, '/subagents off clears it');
for (const n of ['activity', 'subagents', 'unstick']) expect(Commands.get(n), `/${n} exists`);

out.fail = fail;
if (fail.length) throw new Error(`liveness-ui: ${fail.join('; ')}\n${JSON.stringify(out, null, 1)}`);
return JSON.stringify(out, null, 1);
