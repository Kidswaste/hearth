// Spending (round 30, budget.js): a weekly limit per AI from the meter's own numbers; the warning at 80 % and 100 %
// (toast + Activity line, once each); "use cheaper answers" really reaches the engine (the fake engines' runinfo says
// what the run got); "ask before each message" asks and Cancel keeps your words; "would pass your limit" for costly
// confirms; ⋯ AI setup → Spending; the week at a glance and a one-click fix.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/budget.js --shot /tmp/budget.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};
const A = H.claudeAgent();
const runOf = (m) => { const r = /run: model=(\S+) effort=(\S+)/.exec(m?.text || ''); return r ? `${r[1]} ${r[2]}` : null; };
const reply = async (agentId, text) => { await Native.send(agentId, text); await wait(150); await until(() => !Native.isBusy(H.activeChat[agentId]), 60000); await wait(250); return Native.current(agentId).messages.at(-1); };

await wait(800);
await Lazy.load('budget');
ok(typeof Budget !== 'undefined' && typeof BudgetCore !== 'undefined', 'budget group loads');
ok(Commands.get('spending') && !Commands.duplicates().some((d) => d.name === 'spending'), '/spending exists once');
activate(A.id);
await until(() => Native.hasView(A.id));
const me = H.agent(A.id);
const savedEffort = me.effort;
delete me.effort; // Smart (in memory only)
Native.newChat(A.id);

// some use this week, as the meter counts it
await reply(A.id, 'hello there runinfo');
const used = await until(async () => { await Meter.refresh(); const s = Budget.state(A.id); return s.tokens > 0 ? s.tokens : 0; }, 10000);
out.used = used;
ok(used > 0, 'this week\'s use comes from the meter');

// ---------- near: a calm warning, once ----------
Budget._test.resetAlerts();
const toasts = () => [...document.querySelectorAll('#toasts > *')].map((t) => t.textContent).join(' | ');
Budget.set(A.id, { limit: Math.ceil(used / 0.85), mode: 'cheaper' });
out.near = Budget.state(A.id);
ok(out.near.level === 'near', `near the limit at 85 % (${JSON.stringify(out.near)})`);
await wait(200);
out.toast = toasts();
ok(/% of this week's limit/.test(out.toast) && /lighter answers/.test(out.toast), `the 80 % toast (${out.toast})`);
await Lazy.load('activity');
await wait(200);
out.activity = Activity.history().filter((e) => e.icon === '◔').map((e) => e.text);
ok(out.activity.length === 1 && out.activity[0].includes(A.name), `a line in Activity (${JSON.stringify(out.activity)})`);
Budget.check();
await wait(200);
ok(Activity.history().filter((e) => e.icon === '◔').length === 1, 'the same warning never twice');

// ---------- cheaper answers reach the engine ----------
let m = await reply(A.id, 'make me a short poem about embers runinfo');
out.cheaper = [m.route?.label, runOf(m), m.route?.why];
ok(runOf(m) === 'sonnet low' && m.route?.label === 'Sonnet · low' && /weekly limit/.test(m.route?.why || ''), `near: an everyday make → Sonnet · low, and says why (${JSON.stringify(out.cheaper)})`);
await Native.setModel(A.id, 'claude-opus-5-5');
m = await reply(A.id, 'make me a short poem about embers runinfo');
out.pinned = [m.route?.label, runOf(m)];
ok(/^claude-opus-5-5 /.test(runOf(m) || ''), `a model picked for the chat stays (${JSON.stringify(out.pinned)})`);
await Native.setModel(A.id, '');

// ---------- over: once more, two rungs ----------
const now = Budget.state(A.id).tokens;
Budget.set(A.id, { limit: Math.max(1, Math.floor(now * 0.9)) });
await wait(200);
out.overToast = toasts();
ok(/reached this week's limit/.test(out.overToast) && /Nothing is blocked/.test(out.overToast), `the 100 % toast (${out.overToast})`);
m = await reply(A.id, 'make me a short poem about embers runinfo');
out.over = [m.route?.label, runOf(m)];
ok(runOf(m) === 'haiku low', `past it: two rungs down (${JSON.stringify(out.over)})`);
ok(Budget.passLine(A.id, 5000).includes('already past'), 'costly confirms: already past');
Budget.set(A.id, { limit: now + 10000 });
out.pass = Budget.passLine(A.id, 50000);
ok(/would pass your weekly limit/.test(out.pass), `costly confirms: "this would pass your weekly limit" (${out.pass})`);
ok(Budget.passLine(A.id, 10) === '', 'a small cost that fits says nothing');

// ---------- ask before each message ----------
Budget.set(A.id, { limit: Math.ceil(Budget.state(A.id).tokens / 0.9), mode: 'ask' });
const v = Native.view(A.id);
const count = () => Native.current(A.id).messages.length;
let before = count();
v.input.value = 'tell me about embers runinfo';
v.form.requestSubmit();
const dlg = await until(() => document.querySelector('dialog.ui-modal[open]'));
out.ask = dlg?.textContent;
ok(dlg && /Near this week's limit/.test(out.ask) && /Send it anyway/.test(out.ask), `it asks first (${out.ask})`);
[...(dlg?.querySelectorAll('button') || [])].find((b) => b.textContent === 'Cancel')?.click();
await wait(300);
ok(count() === before && v.input.value === 'tell me about embers runinfo', 'Cancel: nothing sent, your words stay');
v.form.requestSubmit();
const dlg2 = await until(() => document.querySelector('dialog.ui-modal[open]'));
[...(dlg2?.querySelectorAll('button') || [])].find((b) => b.textContent === 'Send')?.click();
await until(() => count() > before, 5000);
await until(() => !Native.isBusy(H.activeChat[A.id]), 60000);
ok(count() > before && !v.input.value, 'Send: it goes');
before = count();
v.input.value = '/spending';
v.form.requestSubmit();
await wait(300);
ok(!document.querySelector('dialog.ui-modal[open]'), 'commands never ask');

// ---------- ⋯ AI setup → Spending ----------
await Lazy.load('options');
Options.open({ agentId: A.id });
const sec = await until(() => document.querySelector('.opt-sheet .bud-sec'));
out.section = sec?.textContent;
ok(sec && /Spending/.test(out.section) && /This week: ≈/.test(out.section) && sec.querySelector('select[aria-label="Weekly limit"]') && sec.querySelector('select[aria-label="Near the limit"]') && sec.querySelector('.bud-bar'), `the Spending part (${out.section})`);
const pick = sec?.querySelector('select[aria-label="Weekly limit"]');
pick.value = '';
pick.dispatchEvent(new Event('change'));
await wait(300);
ok(!Budget.state(A.id).limit && !document.querySelector('.opt-sheet .bud-sec select[aria-label="Near the limit"]'), 'No limit: the "near it" row goes');
Options.hide();

// ---------- the week at a glance ----------
me.boardTools = true; // in memory: the fix is saved through a stub
const w = await Budget.glance();
const box = await until(() => document.querySelector('dialog.bud-dlg[open]'));
out.glance = box?.textContent.slice(0, 400);
ok(box && /This week/.test(out.glance) && /Biggest chats/.test(out.glance) && /Sent with every message/.test(out.glance), `the glance (${out.glance})`);
ok(w.tools.some((t) => t.key === 'boardTools' && t.agentId === A.id), 'board tools counted with every message');
let saved = null;
Budget._test.setSave(async (id, patch) => { saved = [id, patch]; for (const [k, val] of Object.entries(patch)) if (val === undefined) delete H.agent(id)[k]; });
await Budget._test.applyFix({ kind: 'tools', agentId: A.id, patch: { boardTools: undefined } });
ok(saved && !H.agent(A.id).boardTools, 'one-click fix switches board tools off');
out.cmd = await Commands.get('spending').run('', { agentId: A.id });
ok(/this week/.test(out.cmd), `/spending (${out.cmd})`);

Budget.set(A.id, { limit: 0 });
if (savedEffort) me.effort = savedEffort;
return JSON.stringify({ ok: problems.length === 0, problems, out }, null, 1);
