// Smart routing (round 28, router.js): with "How hard it thinks" on Smart, each message gets its own model + effort.
// The fake engines' "runinfo" ends a reply with the model and effort the run REALLY got (their own --model / --effort,
// -m / model_reasoning_effort), so this checks what reached the engine, not only what the app meant to send.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/router.js --shot /tmp/router.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};
const A = H.claudeAgent();
const runOf = (m) => { const r = /run: model=(\S+) effort=(\S+)/.exec(m?.text || ''); return r ? `${r[1]} ${r[2]}` : null; };
const reply = async (agentId, text) => { await Native.send(agentId, text); await wait(150); await until(() => !Native.isBusy(H.activeChat[agentId]), 60000); await wait(250); return Native.current(agentId).messages.at(-1); };

await wait(1000);
ok(typeof Router !== 'undefined' && Native.hooks.options?.length, 'router.js loads and hooks into sends');
ok(Commands.get('route'), '/route exists');
ok(!Commands.duplicates().some((d) => d.name === 'route'), 'no duplicate /route');
activate(A.id);
await until(() => Native.hasView(A.id));
const smart = H.agent(A.id);
const savedEffort = smart.effort;
delete smart.effort; // Smart (the test config is on Deep; in memory only, no config save / reload)
Native.newChat(A.id);

// ---------- what each kind of message really got ----------
let m = await reply(A.id, 'thanks runinfo');
out.chat = [m.route?.label, runOf(m)];
ok(m.route?.label === 'Haiku · low' && runOf(m) === 'haiku low', `chit-chat → Haiku · low (${JSON.stringify(out.chat)})`);
m = await reply(A.id, 'what does bloom do in three.js runinfo');
out.question = [m.route?.label, runOf(m)];
ok(m.route?.label === 'Sonnet · low' && runOf(m) === 'sonnet low', `a short question → Sonnet · low (${JSON.stringify(out.question)})`);
ok(m.model === 'sonnet', 'the reply records the model that answered (the meter prices it)');
m = await reply(A.id, 'fix this runinfo:\n```js\nconst a = b.map(x => x*2)\n```');
out.code = [m.route?.label, runOf(m), m.route?.why];
ok(m.route?.tier === 'hard' && runOf(m) === `${A.model || 'default'} high`, `code → the chat's own model, high (${JSON.stringify(out.code)})`);
ok(!Native.current(A.id).model, "the chat's saved model never changed");

// ---------- the pick on the reply, hover: why, click: think harder ----------
const list = () => Native.view(A.id).list;
const chip = await until(() => [...list().querySelectorAll('.msg.assistant .route-chip')].at(-1));
out.chip = [chip?.textContent, chip?.title];
ok(chip && /· high$/.test(chip.textContent) && /code to write, fix or explain/.test(chip.title) && /think(ing)? harder/i.test(chip.title), `the reply shows the pick and why (${JSON.stringify(out.chip)})`);
ok(list().querySelectorAll('.msg.assistant .route-chip').length >= 3, 'every routed reply shows its pick');
const before = Native.current(A.id).messages.length;
chip.click();
await wait(300);
await until(() => !Native.isBusy(H.activeChat[A.id]), 60000);
await wait(300);
m = Native.current(A.id).messages.at(-1);
out.harder = [m.route?.label, runOf(m), Native.current(A.id).messages.length, before];
ok(m.route?.forced && runOf(m) === `${A.model || 'default'} xhigh` && Native.current(A.id).messages.length === before, `"ask again, thinking harder" re-sends the last one with more effort (${JSON.stringify(out.harder)})`);
ok(await until(() => list().querySelector('.msg.assistant:last-of-type .route-chip.forced, .route-chip.forced')), 'the harder reply is marked');

// ---------- the owner's picks stay ----------
await Native.setModel(A.id, 'sonnet');
m = await reply(A.id, 'cool runinfo');
out.pinned = [m.route?.label, runOf(m)];
ok(runOf(m) === 'sonnet low' && m.route?.label === 'Sonnet · low', `a model picked for the chat is never routed away (${JSON.stringify(out.pinned)})`);
await Native.setModel(A.id, '');
smart.effort = 'high'; // Deep: fixed
m = await reply(A.id, 'thanks runinfo');
out.deep = [m.route, runOf(m)];
ok(!m.route && runOf(m) === `${A.model || 'default'} high`, `Deep stays fixed (${JSON.stringify(out.deep)})`);
smart.effort = 'low'; // Quick: fixed
m = await reply(A.id, 'compare these two approaches and tell me the trade-offs runinfo');
out.quick = [m.route, runOf(m)];
// (the engine side reads the saved config, still on Deep here: not routed = the agent's own saved effort)
ok(!m.route && runOf(m) === `${A.model || 'default'} high`, `Quick stays fixed (${JSON.stringify(out.quick)})`);
delete smart.effort;

// ---------- /route ----------
let said = '';
const run = async (line) => { said = ''; const r = await Commands.tryRun(line, A.id, null, { say: (t) => { said = String(t); }, note: (t) => { said = String(t); } }); return said || (typeof r === 'string' ? r : ''); };
out.routeCmd = await run('/route test think carefully about the shader');
ok(/· high: you asked it to think it through/.test(out.routeCmd), `/route test (${out.routeCmd})`);

// ---------- Astra (Codex) ----------
const X = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
if (ok(X, 'an Astra agent')) {
  const xs = H.agent(X.id); const xEffort = xs.effort; delete xs.effort;
  activate(X.id);
  await until(() => Native.hasView(X.id));
  Native.newChat(X.id);
  m = await reply(X.id, 'thanks runinfo');
  out.astraChat = [m.route?.label, runOf(m)];
  ok(m.route?.label === 'Luna · minimal' && runOf(m) === 'gpt-6-luna minimal', `Astra chit-chat → Luna · minimal (${JSON.stringify(out.astraChat)})`);
  m = await reply(X.id, 'implement a GLSL noise function for the background runinfo');
  out.astraBuild = [m.route?.label, runOf(m)];
  ok(m.route?.tier === 'hard' && runOf(m) === `${X.model || 'default'} high`, `Astra code → its own model, high (${JSON.stringify(out.astraBuild)})`);
  if (xEffort) xs.effort = xEffort;
  activate(A.id);
}

// ---------- ⋯ AI setup says what Smart does ----------
await Lazy.load('options');
Options.open({ agentId: A.id });
const sheet = await until(() => document.querySelector('.opt-sheet'));
out.setup = [...(sheet?.querySelectorAll('.opt-sec') || [])].map((s) => s.textContent).find((t) => /How hard it thinks/.test(t));
ok(/Smart picks for each message/.test(out.setup || ''), 'AI setup explains Smart');
Options.hide();
if (savedEffort) smart.effort = savedEffort;
return JSON.stringify({ ok: problems.length === 0, problems, out }, null, 1);
