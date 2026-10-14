// (round 35, concise) ⋯ AI setup → How hard it thinks → "How long its answers are" (Short · Normal · Detailed):
// the choice is saved on the AI, changes ONLY the end of the system prompt the engine really gets (the fake Claude's
// "promptinfo" ends a reply with it), a reply's token hover shows the output split and the length it was asked for,
// /answers sets the same thing.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/concise.js --shot /tmp/concise.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const S = () => document.querySelector('aside.opt-sheet');
const rowOf = (label) => [...(S()?.querySelectorAll('.opt-row') || [])].find((r) => r.querySelector('.opt-label')?.textContent === label);
const sysOf = (m) => (/system<<<([\s\S]*)>>>/.exec(m?.text || '') || [])[1] ?? null;
try {
  if (window.Lazy?.load) await Lazy.load('budget').catch(() => {});
  ok(await until(() => typeof Concise !== 'undefined'), 'concise.js loads (budget group)');
  ok(Commands.get('answers') && !Commands.duplicates().some((d) => d.name === 'answers'), '/answers exists, no duplicate');
  const C = H.claudeAgent();
  const A = () => H.agent(C.id);
  const keep = { verbosity: A().verbosity, autoMemory: A().autoMemory };
  delete A().verbosity;
  A().autoMemory = false; // the fake engine may <remember> a fact, which a new chat's memory would then carry
  await saveConfig(); await wait(400);
  activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const reply = async (text) => { await Native.send(C.id, text); await wait(150); await until(() => !Native.isBusy(H.activeChat[C.id]), 60000); await wait(250); return Native.current(C.id).messages.at(-1); };

  // Normal: the prompt as before
  let m = await reply('hello promptinfo');
  const s0 = sysOf(m);
  out.normalLen = s0?.length;
  ok(s0 && !/Answer length/.test(s0), 'Normal: no answer-length line in the prompt the engine got');

  // ⋯ AI setup: the row, Short
  Native.view(C.id).root.querySelector('.native-head button[aria-label="Chat options"]').click(); // the chat's ⋯
  ok(await until(() => rowOf('How long its answers are')), 'AI setup shows "How long its answers are"');
  const row = rowOf('How long its answers are');
  out.buttons = [...row.querySelectorAll('button')].map((b) => `${b.textContent}${b.classList.contains('on') ? '*' : ''}`);
  ok(out.buttons.join() === 'Short,Normal*,Detailed', `three plain choices, Normal on (${out.buttons})`);
  ok(row.closest('.opt-sec')?.querySelector('.opt-h')?.textContent === 'How hard it thinks', 'it sits in How hard it thinks (no new section)');
  [...row.querySelectorAll('button')].find((b) => b.textContent === 'Short').click();
  ok(await until(() => A().verbosity === 'low'), 'Short is saved on the AI (verbosity low)');
  const saved = await window.hub.getConfig();
  ok((saved?.config || saved)?.agents?.find((a) => a.id === C.id)?.verbosity === 'low', 'and in config.json');
  ok(await until(() => rowOf('How long its answers are')?.querySelector('button.on')?.textContent === 'Short'), 'the row shows Short');

  // the next message: the same prompt + one line at the end
  m = await reply('thanks think promptinfo');
  const s1 = sysOf(m);
  out.shortAdded = s1 && s0 ? s1.length - s0.length : null;
  ok(s1 && s1.startsWith(s0) && /^\n\nAnswer length: short\. [^\n]+$/.test(s1.slice(s0.length)), `Short changes only the end of the prompt (+${out.shortAdded} chars)`);
  ok(m.answers === 'short', 'the reply records the length it was asked for');
  const badge = await until(() => [...Native.view(C.id).list.querySelectorAll('.msg.assistant .meter-badge')].at(-1));
  out.hover = badge?.title;
  ok(/output tokens: ≈ [\d,]+ written · ≈ [\d,]+ thinking/.test(badge?.title || '') && /Answers: short/.test(badge?.title || ''), 'the token hover splits the output (written · thinking) and says Short');

  // /answers: the same setting from the chat
  await Commands.tryRun('/answers detailed', C.id);
  ok(await until(() => A().verbosity === 'high'), '/answers detailed → Detailed');
  m = await reply('ok promptinfo');
  ok(/\n\nAnswer length: detailed\. [^\n]+$/.test(sysOf(m) || '') && sysOf(m).startsWith(s0), 'Detailed: its line at the end, the rest unchanged');
  await Commands.tryRun('/answers normal', C.id);
  ok(await until(() => A().verbosity === undefined), '/answers normal → back to Normal (nothing saved)');
  m = await reply('fine promptinfo');
  ok(sysOf(m) === s0, 'Normal again: byte-identical to the first prompt');

  S()?.querySelector('.opt-head button[title^="Close"]')?.click();
  for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete A()[k]; else A()[k] = v; }
  await saveConfig();
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
