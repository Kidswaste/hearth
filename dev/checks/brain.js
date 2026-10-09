// Round 6 "brain": both engines drive the Lab the way the owner wants, and pick up each other's task. With the fake
// engines (their "direct:" keyword follows the director habits through real MCP calls):
//   - every ask becomes ONE new layer, built through the node tool (on by default), animated on the timeline, with no
//     music reactivity until "make it react" (/make-it-react through three_do run)
//   - Hearth keeps the chat's task state; /director-engine astra and /handoff keep the chat and the scene, and the
//     next engine gets the task state (the fake Codex / Claude answer "Picking up: …")
//   - the node tool on a scene that isn't on screen (backstage) edits that chat's sketch only
//   - /nodes-director off: the fake falls back to a code layer (still a new layer)
//   node dev/smoke.js --fake-engines --script dev/checks/brain.js --wait 6000 --check-timeout 400000 --shot /tmp/brain.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [], problems: [], measure: {} };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const say = async (text, id) => { let msg = ''; await Commands.tryRun(text, id, null, { say: (t) => { msg = typeof t === 'string' ? t : t?.textContent || ''; }, note: (t) => { msg = typeof t === 'string' ? t : t?.textContent || ''; } }); return msg; };
const MUSIC = /audio\.(bass|mid|treble|level|beat\b|kick|snare|hit\b|hats|trigger|spectrum|waveform|band|energy|peak)|onHit\(|spectrumAt\(/;

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const agent = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director);
await wait(800);
const S = ThreeLab.scenes;
step(agent.nodesTool !== false, 'the node tool is on for the Three Director by default');

// a fresh chat with its own scene
Native.newChat(agent.id);
await until(() => S.get(S.currentId())?.name === 'New chat', 8000);
const ask = async (text) => {
  await Native.send(agent.id, text);
  await wait(300);
  await until(() => !Native.isBusy(H.activeChat[agent.id]), 120000);
  return Native.current(agent.id).messages.at(-1);
};
const layersNow = () => [...S.layersOf(S.get(ChatScenes.linkOf(H.activeChat[agent.id]) || S.currentId()))]; // a copy: the sketch keeps the same array
const asks = [];
const record = (label, before, after) => { asks.push({ ask: label, layersAdded: after.length - before.length }); };

// 1. two asks → two new node layers, moving on the timeline, not reacting to music
let before = layersNow();
let r = await ask('direct: add a tunnel');
const A = H.activeChat[agent.id];
let after = layersNow();
record('add a tunnel', before, after);
const top = after.at(-1);
step(after.length === before.length + 1, 'ask 1 → exactly one new layer', after.map((L) => L.name));
step(/\/\/ @nodes:v1 /.test(top.code) && Boolean(ThreeNodes.fromCode(top.code)) && !ThreeNodes.fromCode(top.code).edited, 'the new layer is a node graph (round-trips through ThreeNodes.fromCode)', top.name);
step(!MUSIC.test(top.code.replace(/\/\/ @nodes:v1 .*$/m, '')), 'the new layer does not react to the music', top.code.match(MUSIC)?.[0]);
step(/keyAt\(/.test(top.code), 'it moves on the timeline (Keyframes node)');
step((top.keys?.opacity || []).length === 2, 'and fades in with layer keyframes', top.keys?.opacity);
step(ThreeNodes.lab?.mode === 'nodes' && ThreeNodes.lab?.state === 'ok', 'the Nodes view shows what the director made', { mode: ThreeNodes.lab?.mode, state: ThreeNodes.lab?.state });
step(r.tools?.some((t) => /three_nodes/.test(t)), 'built with three_nodes', r.tools);
before = layersNow();
r = await ask('direct: add some cubes');
after = layersNow();
record('add some cubes', before, after);
step(after.length === before.length + 1 && /@nodes:v1/.test(after.at(-1).code), 'ask 2 → one more node layer', after.map((L) => L.name));

// the director's checklist becomes the open todos (chat_progress through the real chat MCP server)
await ask(`mcp todo\nmcp: ${JSON.stringify([['chat_progress', { steps: [{ text: 'Tunnel layer', status: 'done' }, { text: 'Color pass on the cubes', status: 'doing' }, { text: 'Title card at the drop', status: 'todo' }] }]])}`);
// 2. Hearth's task state for this chat
await DirectorTask.ready();
step(/Open todos: Color pass on the cubes; Title card at the drop/.test(DirectorTask.text(A)), 'chat_progress steps become the open todos', DirectorTask.state(A)?.todos);
const t1 = DirectorTask.text(A);
step(/Goal: direct: add a tunnel/.test(t1) && /added node layer \(keyed-tunnel\)/.test(t1) && /keyframes top\.opacity/.test(t1) && /Scene "/.test(t1), 'the task state records goal, work and the scene', t1);
out.measure.taskStateTokens = Math.round(t1.length / 4);

// 3. switch to Astra: same chat, same scene, the task state handed over
const sketchA = ChatScenes.linkOf(A);
// what the next engine reads instead of the whole conversation
const chatNow = Native.current(agent.id);
out.measure.wholeConversationTokens = Math.round(chatNow.messages.filter((m) => m.text).map((m) => m.text).join('\n\n').length / 4);
const origHandover = DirectorTask.handover;
let handed = null;
DirectorTask.handover = (...a) => { const x = origHandover(...a); if (x) handed = x; return x; };
const sw = await say('/director-engine astra', agent.id);
await until(() => H.agent(agent.id).engine === 'codex');
step(H.agent(agent.id).engine === 'codex' && H.agent(agent.id).hubTools === true && H.activeChat[agent.id] === A && ChatScenes.linkOf(A) === sketchA, '/director-engine astra keeps the chat and the scene', sw);
before = layersNow();
r = await ask('direct: add a galaxy');
after = layersNow();
record('add a galaxy (Astra)', before, after);
DirectorTask.handover = origHandover;
out.measure.handoverTokens = handed ? Math.round(handed.length / 4) : null;
step(Boolean(handed) && /\[Task state, kept by Hearth — you are taking over from Claude/.test(handed) && /Open todos:/.test(handed), 'the first Astra message carries the task state', handed?.split('\n')[0]);
step(/^Picking up: direct: add a tunnel/.test(r.text) && /things done/.test(r.text), 'Astra picks up the task from the handed-over state', r.text.split('\n')[0]);
step(after.length === before.length + 1 && /@nodes:v1/.test(after.at(-1).code), 'Astra builds a node layer too (same tools)', after.map((L) => L.name));
step(Native.current(agent.id).sessionEngine === 'codex', 'the chat now runs on Astra\'s session');
r = await ask('direct: make it react');
const reactLine = r.text.split('\n').find((l) => /three_do/.test(l) && !/cmd.*task/.test(l)) || '';
step(r.tools?.length >= 1 && !/three_do: ERROR/.test(r.text), 'make it react → /make-it-react through three_do run', r.text.split('\n').filter((l) => l.startsWith('- ')).slice(-2));
out.measure.reactLine = reactLine.slice(0, 160);
const task = await say('/task', agent.id);
step(/Task state/.test(task) && /Astra/.test(task), '/task shows the state and who worked on it', task.slice(0, 200));

// 4. /handoff in a director chat: back to Claude in place
await say('/handoff', agent.id);
await until(() => H.agent(agent.id).engine === 'claude');
step(H.agent(agent.id).engine === 'claude' && H.activeChat[agent.id] === A, '/handoff in a director chat switches the engine in place');
before = layersNow();
r = await ask('direct: add rings');
after = layersNow();
record('add rings (Claude again)', before, after);
step(/^Picking up:/.test(r.text) && after.length === before.length + 1, 'Claude picks up again and adds one layer', r.text.split('\n')[0]);

// 5. the node tool on another chat's scene (backstage): only that chat's sketch changes
Native.newChat(agent.id);
await until(() => S.get(S.currentId())?.name === 'New chat', 8000);
await Native.send(agent.id, 'Scene B: hello');
await until(() => !Native.isBusy(H.activeChat[agent.id]), 30000);
const B = H.activeChat[agent.id];
const skB = ChatScenes.linkOf(B);
Native.open(agent.id, A);
await until(() => S.currentId() === sketchA, 8000);
const nA = S.layersOf(S.get(sketchA)).length; const nB = S.layersOf(S.get(skB)).length;
const nb = await HubBridge.call('three_nodes', { command: 'layer drift-cubes' }, { chatId: B });
await wait(300);
step(nb.ok && S.layersOf(S.get(skB)).length === nB + 1 && S.layersOf(S.get(sketchA)).length === nA && /@nodes:v1/.test(S.layersOf(S.get(skB)).at(-1).code), 'three_nodes backstage adds the layer to that chat\'s scene only', nb.value?.result?.split('\n')[0] || nb.error);
const nset = await HubBridge.call('three_nodes', { command: 'set keys1 ease=linear' }, { chatId: B });
const codeB = S.layersOf(S.get(skB)).at(-1).code;
step(nset.ok && /keyAt\(keys1K, .*?, 1, /.test(codeB), 'and edits its graph backstage (set → recompiled)', nset.value?.result?.split('\n')[0] || nset.error);
const nlist = await HubBridge.call('three_nodes', { command: 'list' }, { chatId: B });
step(nlist.ok && /keys1/.test(nlist.value.result), 'list reads the backstage graph', nlist.value?.result?.split('\n').slice(0, 2));

// 6. node tool off → the fake director falls back to a code layer (still one new layer per ask)
await say('/nodes-director off', agent.id);
step(H.agent(agent.id).nodesTool === false, '/nodes-director off sets nodesTool false');
before = layersNow();
r = await ask('direct: add a ring');
after = layersNow();
record('add a ring (nodes off)', before, after);
step(after.length === before.length + 1 && !/@nodes:v1/.test(after.at(-1).code) && /alpha: true/.test(after.at(-1).code), 'without the node tool: still a new layer (code)', r.tools);
await say('/nodes-director on', agent.id);
step(H.agent(agent.id).nodesTool === undefined, '/nodes-director on: back to the default');

// 7. presets: timeline ones first and marked; the default for "layer" is timeline-driven
const pl = await ThreeNodes.run('presets');
step(/^- `timed-shape` ⏱ /.test(pl) && /♪ Beat-pulsing particles/.test(pl), 'preset list: ⏱ timeline presets first, ♪ music ones marked', pl.split('\n').slice(0, 2));
// layer templates start calm
const shape = ThreeLayers.TEMPLATES.find((x) => x.id === 'empty').code;
step(/punch: \{ value: 0,/.test(shape) && /breathe/.test(shape), 'the Shape template breathes on time; Kick punch starts at 0');

out.measure.asks = asks;
out.measure.layersPerAsk = asks.reduce((n, a) => n + a.layersAdded, 0) / asks.length;
out.measure.nodeLayers = S.layersOf(S.get(sketchA)).filter((L) => /@nodes:v1/.test(L.code)).length;
out.measure.layersA = S.layersOf(S.get(sketchA)).map((L) => `${L.name}${/@nodes:v1/.test(L.code) ? ' (nodes)' : ''}`);
out.ok = !out.problems.length;
return JSON.stringify(out, null, 1);
