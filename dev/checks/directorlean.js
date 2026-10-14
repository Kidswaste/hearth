// (round 37, directorlean) The Three Director's session memory end to end: a director chat's REAL MCP calls (fake Claude
// `mcp:` keyword → mcp/three-mcp.js → gamebridge → HubBridge with the chat id → the Lab → tools/three-director.js).
// The same layer read in two messages of one chat: the second is one line ("unchanged since you read it 1 message
// ago"); a new chat gets it whole again; the default picture is small; play / seek answers in one line.
//   node dev/smoke.js --fake-engines --script dev/checks/directorlean.js --wait 6000 --check-timeout 240000
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(60); } return false; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const agent = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director);
await wait(600);
Native.newChat(agent.id);
await wait(600);

// one message whose reply makes these MCP calls; the reply lists each call's result ("- tool: N chars · text")
async function turn(calls) {
  const chatId0 = H.activeChat[agent.id];
  await Native.send(agent.id, `mcp: ${JSON.stringify(calls)}`);
  await wait(50);
  await until(() => !Native.isBusy(H.activeChat[agent.id] || chatId0), 120000);
  await until(() => !HubBridge.log().some((e) => e.running), 5000);
  return (Native.current(agent.id).messages.at(-1)?.text || '').match(/^- three_\w+: .*$/gm) || [];
}
const layer = ThreeLab.director.codeOf().name;
const chars = (line) => Number((line || '').match(/: (?:ERROR )?(\d+) chars/)?.[1] || 0);
const t1 = await turn([['three_read_code', { layer }], ['three_screenshot', {}]]);
step(chars(t1[0]) > 200 && !/unchanged/.test(t1[0]), 'first message: the layer\'s code', t1[0]?.slice(0, 120));
step(/\+ 1 image/.test(t1[1] || '') && Math.max(...(t1[1].match(/Screenshot \((\d+)×(\d+)/) || [0, 0, 0]).slice(1).map(Number)) === 512, 'the default picture is small (512 px)', t1[1]?.slice(0, 120));
const t2 = await turn([['three_read_code', { layer }]]);
step(/unchanged since you read it 1 message ago/.test(t2[0] || '') && chars(t2[0]) < 160, 'next message, same chat: one line', t2[0]?.slice(0, 160));
const t3 = await turn([['three_read_code', { layer, force: true }]]);
step(chars(t3[0]) === chars(t1[0]), 'force: true sends it whole', `${chars(t3[0])} chars`);
const t4 = await turn([['three_media_control', { action: 'seek', time: 1 }]]);
step(chars(t4[0]) < 200, 'seek answers with the transport in one line', t4[0]?.slice(0, 160));
Native.newChat(agent.id);
await wait(800);
const layer2 = ThreeLab.director.codeOf().name;
const t5 = await turn([['three_read_code', { layer: layer2 }]]);
step(chars(t5[0]) > 200 && !/unchanged/.test(t5[0]), 'a new chat: the code whole again', t5[0]?.slice(0, 120));
out.saved = ThreeDirector.saved();
out.ok = !out.problems.length;
return JSON.stringify(out, null, 1);
