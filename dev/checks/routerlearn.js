// Smart learns from you (round 39, routerlearn.js): asking again with more thinking a few times on code fixes steps
// that kind up (the fake engine's "runinfo" says what the run REALLY got), the first change says so in one line, ⋯ AI
// setup → How hard it thinks lists it, ✕ forgets it; a plain retry / a new message say less.
//   node dev/smoke.js --fake-engines --check-timeout 180000 --script dev/checks/routerlearn.js --shot /tmp/routerlearn.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};
const A = H.claudeAgent();
const runOf = (m) => { const r = /run: model=(\S+) effort=(\S+)/.exec(m?.text || ''); return r ? `${r[1]} ${r[2]}` : null; };
const idle = async () => { await wait(150); await until(() => !Native.isBusy(H.activeChat[A.id]), 60000); await wait(250); };
const reply = async (text) => { await Native.send(A.id, text); await idle(); return Native.current(A.id).messages.at(-1); };
const CODE = 'fix this runinfo:\n```js\nconst a = b.map(x => x*2)\n```';

await wait(1000);
ok(typeof RouterLearn !== 'undefined', 'routerlearn.js loads');
ok(await until(() => RouterLearn.ready()), 'what it learned is read at start');
ok(Native.hooks.options.includes(RouterLearn.onOptions) && Native.hooks.finish.includes(RouterLearn.onFinish), 'it hears each send and each finished reply');
activate(A.id);
await until(() => Native.hasView(A.id));
const smart = H.agent(A.id);
const savedEffort = smart.effort;
delete smart.effort; // Smart (the test config is on Deep; in memory only)
RouterLearn.forget(A.id);
Native.newChat(A.id);

// ---------- before: a code fix gets the rule's pick ----------
let m = await reply(CODE);
out.before = [m.route?.label, runOf(m), m.route?.kind];
ok(m.route?.kind === 'code' && runOf(m) === `${A.model || 'default'} high`, `a code fix → the chat's own model, high (${JSON.stringify(out.before)})`);
ok(RouterLearn.waiting.get(Native.current(A.id).id)?.kind === 'code', 'the reply waits to hear how it went');

// ---------- a plain new message: "kept going" ----------
m = await reply('what does bloom do in three.js runinfo');
const st = () => RouterLearn.data.agents[A.id] || {};
ok(st().code?.log?.at(-1)?.s === 'accepted', `a new message after it: the code fix was fine (${JSON.stringify(st().code?.log)})`);

// ---------- ask again with more thinking, three times ----------
for (let i = 0; i < 3; i++) {
  m = await reply(CODE);
  if (i === 0) {
    // the pick on the reply, clicked like the owner would
    const chip = await until(() => [...Native.view(A.id).list.querySelectorAll('.msg.assistant .route-chip')].at(-1));
    ok(chip, 'the pick shows on the reply');
    chip?.click();
  } else await Router.harder(A.id);
  await idle();
}
out.log = (st().code?.hist || []).map((c) => `${c.from}→${c.to} ${c.why}: ${c.what}`);
ok(st().code?.d === 1, `three "think harder" on code fixes → Smart steps code fixes up (${JSON.stringify({ d: st().code?.d, s: st().code?.s, log: st().code?.log, hist: out.log })})`);
ok(/asked again with a stronger model/.test(out.log.join(' ')), `why it learned it (${out.log})`);

// ---------- after: the next code fix gets the top rung ----------
m = await reply(CODE);
out.after = [m.route?.label, runOf(m), m.route?.why, m.route?.rung];
ok(runOf(m) === `${A.model || 'default'} xhigh` && m.route?.rung === 'max' && /learned it from you/.test(m.route?.why || ''), `the next code fix: the chat's own model at xhigh (${JSON.stringify(out.after)})`);
m = await reply('thanks runinfo');
ok(runOf(m) === 'haiku low', `other kinds unchanged (${runOf(m)})`);

// ---------- the first change says so, once, in the chat ----------
Hints.flush();
const noteEl = await until(() => Native.view(A.id).list.querySelector('.msg.note[data-note-id="routerlearn"]'), 8000);
out.note = noteEl?.textContent;
ok(/Smart learned from you/.test(out.note || '') && /code fixes/.test(out.note || ''), `one calm line the first time (${out.note})`);
ok(RouterLearn.data.noted === true, 'only the first time');

// ---------- /route learned ----------
let said = '';
const run = async (line) => { said = ''; const r = await Commands.tryRun(line, A.id, null, { say: (t) => { said = String(t); }, note: (t) => { said = String(t); } }); return said || (typeof r === 'string' ? r : ''); };
out.cmd = await run('/route learned');
ok(/code fixes → Deepest/.test(out.cmd), `/route learned (${out.cmd})`);

// ---------- ⋯ AI setup → How hard it thinks: the learned line, ✕ forgets ----------
await Lazy.load('options');
Options.open({ agentId: A.id });
const row = await until(() => document.querySelector('.opt-sheet .opt-learned'));
out.row = row?.textContent;
ok(/Smart has learned:/.test(out.row || '') && /code fixes → Deepest/.test(out.row || ''), `AI setup shows what it learned (${out.row})`);
ok(row?.closest('.opt-sec')?.querySelector('.opt-h')?.textContent === 'How hard it thinks', 'under How hard it thinks');
await wait(300);
const x = row?.querySelector('.rl-x');
ok(x && /Forget/.test(x.title), 'each with ✕');
x?.click();
ok(await until(() => !document.querySelector('.opt-sheet .opt-learned')), '✕ forgets it: the line goes');
ok(!RouterLearn.shifts(A.id).code, 'and Smart is back to its usual pick');
Options.hide();
m = await reply(CODE);
ok(runOf(m) === `${A.model || 'default'} high`, `the next code fix: high again (${runOf(m)})`);

// ---------- nothing reaches the engine's prompt ----------
await wait(1200);
const kv = await window.hub.kvGet('router-learn', null);
ok(kv && kv.agents && kv.noted === true, `stored locally (kv router-learn: ${JSON.stringify(kv)?.slice(0, 120)})`);
RouterLearn.forget(A.id);
if (savedEffort) smart.effort = savedEffort;
return JSON.stringify({ ok: problems.length === 0, problems, out }, null, 1);
