// Cache-wise chats (round 32, cachewise.js): what the prompt cache saved shows where tokens already show (a reply's
// token line, the meter, /cache, Spending's week at a glance), and a change made mid-chat (⋯ AI setup → personality,
// or anything else before the next send) gets one calm line in the chat, once, never a block.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/cachewise.js --shot /tmp/cachewise.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};
const C = H.claudeAgent();
const A = () => H.agent(C.id);
const keep = JSON.stringify({ systemPrompt: C.systemPrompt ?? null, instructions: C.instructions ?? null });
const reply = async (text) => { await Native.send(C.id, text); await wait(150); await until(() => !Native.isBusy(H.activeChat[C.id]), 60000); await wait(250); return Native.current(C.id).messages.at(-1); };
const notes = () => [...Native.view(C.id).list.querySelectorAll('.msg.note')].map((n) => n.textContent).filter((t) => /↻/.test(t));
try {
  await wait(800);
  await Lazy.load('budget');
  ok(typeof Cachewise !== 'undefined', 'cachewise loads with the budget group');
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat(C.id);
  await reply('hello there');
  const r2 = await reply('and a second message');
  out.usage = r2?.usage;
  ok(r2?.usage?.cached > 0, `the second message reads from the cache (${JSON.stringify(r2?.usage)})`);
  const badge = Native.view(C.id).list.querySelector('.msg.assistant:last-of-type .meter-badge') || [...Native.view(C.id).list.querySelectorAll('.meter-badge')].at(-1);
  out.badge = badge?.title;
  ok(/saved by the cache/.test(badge?.title || ''), `the reply's token line says what the cache saved (${badge?.title})`);
  const chat = Native.current(C.id);
  ok(chat.cacheSig && chat.session?.id, 'the chat remembers its setup at send');
  ok(!notes().length, 'no note while nothing changed');

  // a chat worth re-reading (the fake engine's chats are tiny)
  chat.messages.at(-1).usage.input = 24000;
  // ⋯ AI setup → personality, mid-chat
  Native.view(C.id).root.querySelector('.native-head button[aria-label="Chat options"]').click();
  const S = await until(() => document.querySelector('aside.opt-sheet'));
  const sec = [...S.querySelectorAll('.opt-sec')].find((s) => s.querySelector('.opt-h')?.textContent === 'Personality');
  const psel = sec.querySelector('select');
  psel.value = [...psel.options].find((o) => o.value !== 'plain' && o.value !== 'own').value;
  psel.dispatchEvent(new Event('change'));
  await until(() => notes().length, 4000);
  out.note1 = notes();
  ok(out.note1.length === 1 && /^↻ Its personality changed mid-chat: the next message/.test(out.note1[0]) && /24k/.test(out.note1[0]), `one line right away (${out.note1})`);
  Options.hide?.();
  await wait(200);
  // the message after it: no second line for the same change, and the send goes through
  const r3 = await reply('third one');
  ok(r3?.role === 'assistant', 'the message still goes (never blocked)');
  out.notes2 = notes();
  ok(out.notes2.length === 1, `still one line after sending (${out.notes2.length})`);

  // a change made elsewhere (an instruction set from a command): the line comes with the next send
  Native.current(C.id).messages.at(-1).usage.input = 30000;
  A().instructions = [...(A().instructions || []), { text: 'Use metric units' }];
  await reply('fourth one');
  // (round 38, hintcalm) the line waits for the reply to end (hints.js: none while a reply streams), then replaces the old one
  await until(() => notes().some((t) => /standing instructions changed/.test(t)), 8000);
  out.notes3 = notes();
  ok(out.notes3.length === 1 && /Its standing instructions changed since the last message: this message/.test(out.notes3[0]), `a change made elsewhere: one line at the send (${out.notes3})`);

  // the meter and Spending
  const cacheLine = await Commands.tryRun('/cache today', C.id);
  out.cache = typeof cacheLine === 'string' ? cacheLine : Native.view(C.id).list.querySelector('.msg.note:last-of-type')?.textContent;
  await Meter.refresh?.();
  const w = await Budget.glance?.();
  out.glance = document.querySelector('.bud-dlg .bud-sub')?.textContent;
  ok(/saved by the cache/.test(out.glance || ''), `the week at a glance says what the cache saved (${out.glance})`);
  document.querySelector('.bud-dlg')?.close();
} catch (e) {
  problems.push(`threw: ${e.message}`);
} finally {
  const k = JSON.parse(keep);
  for (const [f, v] of Object.entries(k)) { if (v === null) delete A()[f]; else A()[f] = v; }
}
return JSON.stringify({ ok: !problems.length, problems, out }, null, 1);
