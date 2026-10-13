// Lean missions (round 33, swarmlean.js): the ◎ picker's one-line estimate on costly missions (none on single
// replies), Swarm's helpers on the cheaper pick (the fake engines' runinfo says what each seat's run got) while the chair
// keeps the chat's model, a short summary back into the chat (m.ctx / carry) with the full answer still in the card,
// Ask everyone answering in a new chat of the other AI, and past the weekly limit a costly mission asks first (Cancel
// keeps your words).
//   node dev/smoke.js --fake-engines --check-timeout 180000 --script dev/checks/swarmlean.js --shot /tmp/swarmlean.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const C = H.claudeAgent();
const A = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
const askAllWas = new Map(H.agents().map((a) => [a, a.askAll]));
for (const a of H.agents()) if (a !== C && a !== A) a.askAll = false;
const limitsWas = store.get('budget.limits', null);
try {
  ok(typeof SwarmLean !== 'undefined' && SwarmLean.estimate, 'swarmlean.js loaded');
  activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const v = Native.view(C.id);
  const chat = () => Native.current(C.id);
  const type = async (t) => { v.input.value = t; v.input.dispatchEvent(new Event('input', { bubbles: true })); v.form.requestSubmit(); await wait(300); };
  const idle = () => until(() => !Native.isAgentBusy(C.id) && !Native.isAgentBusy(A.id) && !Astra._test.live.size && !Missions._live.size, 60000);

  // 1. the picker: a plain line on the costly ones, nothing on a single reply
  v.root.querySelector('.ms-btn').click(); await wait(200);
  const lines = Object.fromEntries([...document.querySelectorAll('.ms-pop .ms-card')].map((c) => [c.querySelector('.ms-pick b')?.textContent.replace(/^\S+\s/, ''), c.querySelector('.ms-est')?.textContent || null]));
  out.lines = lines;
  ok(/^≈ \d+ helpers? · about [\d.]+k? tokens$/.test(lines.Swarm || ''), `Swarm shows "≈ n helpers · about …k tokens" (${lines.Swarm})`);
  ok(lines.Debate && lines['Side by side'] && lines['Answer, then review'], 'Debate, Side by side and Answer then review show theirs');
  ok(!lines['Just answer'] && !lines['Plan first'], 'single replies show none');
  await smoke({ shot: '/tmp/swarmlean-picker.png' });
  document.querySelector('.ms-pop .ms-card .ms-pick')?.click(); await wait(100);

  // 2. Swarm: the helpers on the cheaper pick, the chair on the chat's model; a short summary goes back
  Missions.set(C.id, 'swarm');
  await type(`runinfo ${'A long question about the intro hook and the music. '.repeat(3)}`);
  await idle(); await wait(400);
  const m = chat().messages.findLast((x) => x.role === 'collab');
  const runOf = (p) => (/run: model=(\S+) effort=(\S+)/.exec(p?.text || '') || []).slice(1).join(' ');
  out.swarm = m?.parts.map((p) => `${m.seats[p.seat].label}:${p.kind}:${p.helper ? 'helper' : 'own'}:${runOf(p)}`);
  const helpers = m?.parts.filter((p) => p.helper) || [];
  ok(helpers.length >= 2 && helpers.every((p) => runOf(p) && !/gpt-6-astra|opus/.test(runOf(p))), `helpers on the cheaper model (${out.swarm})`);
  const fin = m?.parts[m.final];
  ok(fin && !fin.helper && !/sonnet|gpt-6-sol/.test(runOf(fin)), `the chair keeps the chat's model (${runOf(fin)})`);
  ok(m?.ctx && m.ctx.length < m.text.length + 400 && m.ctx.length <= 1300, `a short summary for the chat's context (${m?.ctx?.length} chars)`);
  ok(chat().carry && chat().carry.length <= 1500, `the next message carries the summary, not every answer (${chat().carry?.length})`);
  ok(document.querySelector(`.collab-card[data-cid="${m.id}"] .mr-final`), 'the full answer stays in the card');

  // 3. Ask everyone: Astra answers in a new chat of its own (not on top of the one open there)
  activate(A.id); await until(() => Native.hasView(A.id)); Native.newChat(A.id); await wait(150);
  await Native.send(A.id, 'an unrelated chat about embers'); await idle();
  const astraOld = Native.current(A.id).id;
  activate(C.id); await wait(150);
  Missions.set(C.id, 'everyone');
  await type('Say hi in five words');
  await until(() => chat().messages.find((x) => x.kind === 'everyone')?.rows.every((r) => r.status !== 'thinking' && r.status !== 'sending'), 30000); await idle();
  const ev = chat().messages.findLast((x) => x.kind === 'everyone');
  const astraRow = ev?.rows.find((r) => r.agentId === A.id);
  out.everyone = ev?.rows.map((r) => `${r.name}:${r.status}:${r.chatId}`);
  ok(astraRow?.status === 'done' && astraRow.chatId && astraRow.chatId !== astraOld, `Astra answered in a new chat (${out.everyone}, old ${astraOld})`);

  // 4. past the weekly limit: a costly mission asks first; Cancel keeps your words
  await Lazy.load('budget');
  Budget.set(C.id, { limit: 1000, mode: 'warn' });
  await Meter.refresh?.();
  out.used = await until(() => (Budget.state(C.id).tokens >= 1000 ? Budget.state(C.id).tokens : 0), 8000);
  const est = SwarmLean.estimate(C.id, 'duo');
  ok(est?.over && /weekly limit/.test(est.line), `the estimate says it's past the limit (${est?.line})`);
  Missions.set(C.id, 'duo');
  const n = chat().messages.length;
  await type('Two words about bass');
  const dlg = await until(() => document.querySelector('dialog.ui-modal[open]'), 5000);
  out.ask = dlg?.textContent;
  ok(dlg && /week's limit|weekly limit/i.test(out.ask) && /Start it anyway/.test(out.ask), `it asks first (${out.ask})`);
  await smoke({ shot: '/tmp/swarmlean-ask.png' });
  [...(dlg?.querySelectorAll('button') || [])].find((b) => b.textContent === 'Cancel')?.click();
  await wait(400);
  ok(chat().messages.length === n && v.input.value === 'Two words about bass', 'Cancel: nothing ran, your words are back');
  Missions.set(C.id, 'normal'); v.input.value = '';
} finally {
  for (const [a, x] of askAllWas) a.askAll = x;
  if (typeof Budget !== 'undefined') Budget.set(C.id, { limit: 0 });
  store.set('budget.limits', limitsWas);
}
return JSON.stringify({ ok: !fail.length, fail, out });
