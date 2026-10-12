// Crew (tools/three-crew.js) end to end with the fake engines: /crew 3 shows the cost and waits; /crew go runs 3 lean
// helper runs (real MCP calls through HUB_TOOL_MODE=crew, routed to their own backstage stages); live thumbnails and a
// running total; the owner's scene untouched while they work; pick → the chat's scene, undo, the director's pick,
// keep as sketches, the merge ops (code diff, layer copy), Stop, the director starting one itself (off → refused, on →
// approved in the grid, helpers in the reply's liveness tree).
//   node dev/smoke.js --fake-engines --script dev/checks/crew.js --wait 6000 --check-timeout 420000 --shot /tmp/crew.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const SHOTS = window.CREW_SHOTS || window.SMOKE_SAVES || '/tmp';
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const say = async (text, id) => { let msg = ''; await Commands.tryRun(text, id, null, { say: (t) => { msg = t; }, note: (t) => { msg = t; } }); return msg; };

// what a helper's tool server listed (the fake engine reports it in its reply): the crew toolset's real size
const servers = new Set();
window.hub.onEngineEvent((ev) => { if (String(ev?.chatId).startsWith('crew-') && ev.type === 'done') { const m = /server [^\n]*/.exec(ev.text || ''); if (m) servers.add(m[0]); } });
await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const agent = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
await ThreeLab.cmd();
await until(() => ThreeLab.scenes && ThreeLab.director);
await wait(800);
const S = ThreeLab.scenes;
Native.newChat(agent.id);
await wait(600);
await Native.send(agent.id, 'Crew base: a calm orb');
await until(() => !Native.isBusy(H.activeChat[agent.id]), 30000);
const chatId = H.activeChat[agent.id];
const base = ChatScenes.linkOf(chatId) || S.currentId();
const codes = () => S.layersOf(S.get(base)).map((L) => L.code).join('\n');
const before = codes();
step(Boolean(window.ThreeCrew && base), 'crew loaded, the chat has a scene', S.get(base)?.name);
step(Boolean(Commands.get('crew')) && !Commands.duplicates().length, '/crew registered, no duplicate commands');

// 1. cost first: /crew 3 opens the grid with the estimate and runs nothing yet
const said = await say('/crew 3 crew test: hit harder', agent.id);
let c = ThreeCrew.current();
const panel = ThreeCrew.panel;
step(c?.status === 'plan' && c.n === 3, '/crew 3 plans 3 helpers and waits', said);
step(Boolean(panel?.querySelector('.crew-plan:not([hidden]) .crew-go')) && /≈ \d/.test(panel.querySelector('.crew-cost')?.textContent || ''), 'the grid shows the estimate and a Start button', panel?.querySelector('.crew-est')?.textContent);
out.estimate = { ...c.est };
step(c.est.fixed > 500 && c.est.fixed < 1400, 'the helper\'s fixed cost per step comes from director-cost (crew tools)', c.est.fixed);
step(!c.helpers.some((h) => h.status !== 'waiting'), 'nothing runs before the OK');
out.brief = ThreeCrew._test.briefFor(c, c.helpers[1]).split('\n').slice(0, 5).join('\n');
out.briefTokens = c.est.brief;
await smoke({ shot: `${SHOTS}/crew-plan.png` });

// 2. go: three helpers, live thumbnails and a running total
const t0 = Date.now();
await say('/crew go', agent.id);
step(c.status === 'running', '/crew go starts it');
const live = await until(() => c.helpers.filter((h) => h.thumb).length >= 2 && c.status === 'running' && c.helpers, 40000);
step(Boolean(live), 'live thumbnails while the helpers work', c.helpers.map((h) => `${h.n}:${h.thumb ? 'img' : '-'}:${h.status}`).join(' '));
await until(() => c.helpers.some((h) => h.calls >= 1), 30000);
const midTotal = panel.querySelector('.crew-cost')?.textContent;
out.stagesWhileRunning = document.querySelectorAll('.lab-backstage').length;
await smoke({ shot: `${SHOTS}/crew-running.png` });
await until(() => c.status !== 'running', 120000);
out.secs = Math.round((Date.now() - t0) / 1000);
step(c.status === 'done', 'all three helpers finished', `${c.status} in ${out.secs} s`);
step(c.helpers.every((h) => h.changed > 0 && h.calls >= 2 && h.real), 'each changed its copy with real MCP calls and reported its usage', c.helpers.map((h) => `${h.n}: ${h.calls} calls, ${h.changed} changes, ${h.real?.input}+${h.real?.output}`).join(' · '));
step(new Set(c.helpers.map((h) => h.sketch.layers.map((L) => L.code).join())).size === 3, 'three different variations');
step(codes() === before, 'the owner\'s scene untouched while they worked');
step(/^[1-9][\d.]*k? /.test(midTotal || ''), 'a running total while it works', midTotal);
out.total = panel.querySelector('.crew-cost')?.textContent;
out.lines = ThreeCrew.describe().split('\n');
out.stagesAfter = document.querySelectorAll('.lab-backstage').length;
step(out.stagesAfter < out.stagesWhileRunning, 'the helpers\' stages are thrown away at the end', `${out.stagesWhileRunning} → ${out.stagesAfter}`);
step(!ThreeDirector.history?.().some?.((h) => String(h.sketchId).startsWith('crew_')), 'crew edits stay out of the director\'s undo history');
await smoke({ shot: `${SHOTS}/crew-done.png` });

// 3. pick → the chat's scene; undo → as before
panel.querySelector('.crew-tile[data-n="2"]')?.click();
panel.querySelector('.crew-use')?.click();
await until(() => c.picked?.n === 2, 8000);
await wait(600);
step(codes() === c.helpers[1].sketch.layers.map((L) => L.code).join('\n'), 'Use #2: its layers are the chat\'s scene now');
step(S.currentId() === base && ThreeLab.director.capture().layers.map((L) => L.code).join('\n') === codes(), 'on screen at once');
const u = await say('/crew undo', agent.id);
await wait(600);
step(codes() === before, '/crew undo puts the scene back', u);

// 4. the director picks (one lean question with a numbered sheet), with a reason
const dp = await say('/crew pick auto', agent.id);
step(c.picked?.by === 'director' && Boolean(c.picked.reason), 'the director picks with a reason', dp);
out.pickTokens = c.pickTokens;
await ThreeCrew.undo();

// 5. keep the others as sketches
const kept = await say('/crew keep all', agent.id);
step(c.kept.length === 3 && c.kept.every((id) => S.get(id)), 'keep all: the variations become sketches', kept);

// 6. merge ops through the director's own tool (three_do crew)
const diff = await HubBridge.call('three_do', { cmd: 'crew', op: 'code', n: 3 }, { chatId });
step(diff.ok && /lines changed/.test(diff.value), 'crew code: what #3 changed, as a diff', String(diff.value).split('\n')[0]);
const layerName = c.helpers[2].sketch.layers.at(-1).name;
const cp = await HubBridge.call('three_do', { cmd: 'crew', op: 'copy', from: 3, layer: layerName }, { chatId });
await wait(400);
step(cp.ok && S.layersOf(S.get(base)).some((L) => L.code === c.helpers[2].sketch.layers.at(-1).code), 'crew copy: #3\'s layer lands in the chat\'s scene', cp.value || cp.error);
await ThreeDirector.undo({ sketchId: base }).catch(() => {});

// 7. stop anytime
await say('/crew 3 crew-slow stop test', agent.id);
c = ThreeCrew.current();
await say('/crew go', agent.id);
await until(() => c.helpers.every((h) => h.calls >= 1), 40000);
const ts = Date.now();
await say('/crew stop', agent.id);
await until(() => c.status !== 'running', 20000);
step(c.status === 'stopped' && c.helpers.every((h) => h.status === 'stopped'), '/crew stop stops every helper', `${c.status} in ${Date.now() - ts} ms`);

// 8. the director deploys one itself: refused while crew is off; with /crew on, the owner OKs it in the grid
const off = await HubBridge.call('three_do', { cmd: 'crew', op: 'start', n: 2, brief: 'x' }, { chatId });
step(off.ok === false && /off/.test(off.error), 'crew off: the director can\'t deploy one', off.error);
const on = await say('/crew on', agent.id);
step(/Crew on/.test(on), '/crew on', on);
const reply = Native.send(agent.id, 'mcp: [["three_do", {"cmd": "crew", "op": "start", "n": 2, "brief": "director brief"}]]');
const planned = await until(() => ThreeCrew.current()?.status === 'plan' && ThreeCrew.current().by === 'director' && ThreeCrew.panel, 30000);
step(Boolean(planned), 'the director\'s crew waits for the owner\'s OK with the cost');
ThreeCrew.panel?.querySelector('.crew-go')?.click();
const tree = await until(() => { const s = ChatLive.state(chatId); return s && [...s.agents.values()].filter((a) => a.kind === 'crew').length === 2 && s; }, 20000);
step(Boolean(tree), 'its helpers show in the reply\'s liveness tree', tree && [...tree.agents.values()].map((a) => `${a.description}: ${a.status}`).join(' · '));
await reply;
await until(() => !Native.isBusy(chatId), 120000);
const chat = await Native.loadChat(chatId);
const last = chat.messages.at(-1);
step(/Crew on|#1/.test(last?.text || '') || Boolean(last?.activity?.agents?.length), 'the director got the crew\'s results', `${(last?.text || '').slice(0, 160)} | agents ${last?.activity?.agents?.length || 0}`);
await say('/crew off', agent.id);
ThreeCrew.current() && ThreeCrew.stop();
await smoke({ shot: `${SHOTS}/crew-director.png` });
out.helperServer = [...servers];
return JSON.stringify(out, null, 1);
