// Continue lighter (round 34, autocompact.js) through the fake engines: a 30-message chat measured twice (the offer off,
// then on and taken when it shows): tokens each message re-reads, before → after. The offer is one calm line under the
// reply with one button, never silent (the old 110k auto-compact and long-chat banner give way to it); the summary runs
// on the cheapest model and comes back in shape; every message stays in the chat; the saving shows in the context meter
// and the reply's token line; ⋯ AI setup → Spending → "Offer to continue lighter"; /lighter.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/autocompact.js --shot /tmp/autocompact.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};
const C = H.claudeAgent();
const A = () => H.agent(C.id);
const keep = A().lighterAt;
const reply = async (text) => { await Native.send(C.id, text); await wait(120); await until(() => !Native.isBusy(H.activeChat[C.id]), 60000); await wait(150); return Native.current(C.id).messages.filter((m) => m.role === 'assistant' && !m.compactSummary).at(-1); };
const lighterNote = () => Native.view(C.id).list.querySelector('.msg.note[data-note-id="autocompact"]');
// a director-like turn: the ask plus what came back (≈ 3k tokens), words varying a little per message
const pad = (i) => { let s = `${i ? `Step ${i}: adjust the tunnel` : 'Build a neon tunnel scene for Shorts'}. `; let k = 0; while (s.length < 12000) s += `tunnel layer ${k % 7} glow ${i}-${k++} keeps the ember palette and kick timing steady. `; return s; };
const N = 30;
try {
  await wait(800);
  await Lazy.load('budget');
  ok(typeof Autocompact !== 'undefined' && Commands.get('lighter'), 'autocompact loads with the budget group (/lighter)');
  activate(C.id);
  await until(() => Native.hasView(C.id));

  // 1. before: the offer off, 30 messages
  A().lighterAt = 0;
  Native.newChat(C.id);
  const before = [];
  for (let i = 0; i < N; i++) before.push((await reply(pad(i)))?.usage?.input || 0);
  ok(!lighterNote(), 'off: no offer');
  out.before = before;
  await wait(800);

  // 2. after: default (about 40k), the offer taken when it shows
  delete A().lighterAt;
  Native.newChat(C.id);
  const after = [];
  let offers = 0;
  for (let i = 0; i < N; i++) {
    after.push((await reply(pad(i)))?.usage?.input || 0);
    const n = await until(() => lighterNote(), 900);
    if (!n) continue;
    const btns = n.querySelectorAll('.note-acts button');
    if (!btns.length) { (out.odd ||= []).push(`${i + 1}: ${n.textContent.slice(0, 120)}`); continue; }
    offers++;
    if (offers === 1) {
      out.line = n.querySelector('.body').textContent.trim();
      ok(/^This chat re-reads ≈ \d+k tokens each message\. Continue lighter\? \(keeps a summary, ≈ \d+k\)$/.test(out.line), `one calm line: “${out.line}”`);
      ok(btns.length === 1, `one button (${btns.length})`);
      ok(Native.current(C.id).messages.every((m) => !m.compactSummary), 'nothing compacted before the click (never silent)');
      out.offerAt = i + 1;
    }
    const count = Native.current(C.id).messages.length;
    const at0 = Native.current(C.id).compact?.at;
    btns[0].click();
    const div = await until(() => Native.current(C.id).compact?.lighter && Native.current(C.id).compact.at !== at0 && Native.view(C.id).list.querySelector('.compact-divider'), 20000);
    const chat = Native.current(C.id);
    const sm = chat.messages.at(-1);
    if (offers === 1) {
      out.divider = div?.querySelector('summary')?.textContent;
      out.summary = sm?.text;
      ok(/Continued lighter here · was \d+k tokens per message · the last 2 exchanges kept word for word/.test(out.divider || ''), `the divider says it (${out.divider})`);
      ok(sm?.lighter?.by === 'model' && sm.lighter.model === 'haiku' && /^Goal: /.test(sm.text) && /\nOpen tasks:\n- /.test(sm.text), `the cheapest model wrote a summary in shape (${JSON.stringify(sm?.lighter)})`);
      ok(chat.messages.length === count + 1 && !chat.session?.id, 'every message stays; the next message starts a new session');
      const meter = Native.view(C.id).root.querySelector('.ctx-meter');
      out.meter = [meter?.textContent, meter?.title];
      ok(/^≈ \d/.test(meter?.querySelector('.ctx-text')?.textContent || '') && /before continuing lighter/.test(meter?.title || ''), `the context meter shows what the next message sends (${out.meter})`);
    }
  }
  out.after = after;
  out.offers = offers;
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  out.totals = { before: sum(before), after: sum(after), saved: `${Math.round((1 - sum(after) / sum(before)) * 100)}%`, last: [before.at(-1), after.at(-1)] };
  ok(offers >= 1 && offers <= 3, `the offer came ${offers} time(s) in ${N} messages`);
  ok(sum(after) < sum(before) * 0.8 && after.at(-1) < before.at(-1) * 0.5, `tokens re-read over ${N} messages: ${sum(before)} → ${sum(after)} (${out.totals.saved} less)`);
  // the reply after continuing lighter: its token line says the saving (hover)
  const badges = [...Native.view(C.id).list.querySelectorAll('.meter-badge, .tok-badge')].map((b) => b.title);
  out.badge = badges.find((t) => /Continued lighter/.test(t));
  ok(Boolean(out.badge), `a reply's token line says what continuing lighter saved (${out.badge?.split('\n').at(-1)})`);
  // the carried message: the summary, then the last exchanges word for word
  const kept = Native.current(C.id);
  ok(kept.compact.tail < kept.compact.index - 1 && kept.messages[kept.compact.tail].role === 'user', 'the kept exchanges start at a message of yours');

  // 3. never silent: a huge reply no longer compacts by itself, no banner either
  Native.newChat(C.id);
  await reply('hello big');
  await wait(1500);
  ok(!Native.current(C.id).messages.some((m) => m.compactSummary || m.compactReq) && !Native.view(C.id).list.querySelector('.long-chat'), 'past 110k nothing compacts silently and no banner');

  // 4. ⋯ AI setup → Spending → Offer to continue lighter
  Native.view(C.id).root.querySelector('.native-head button[aria-label="Chat options"]').click();
  const S = await until(() => document.querySelector('aside.opt-sheet'));
  const spend = await until(() => S.querySelector('[data-fold="spending"]'), 6000);
  if (spend) spend.open = true;
  const sel = await until(() => S.querySelector('select[aria-label="Offer to continue lighter"]'), 4000);
  out.options = sel ? [...sel.options].map((o) => `${o.text}${o.selected ? ' ✓' : ''}`) : null;
  ok(sel && sel.value === '40000' && [...sel.options][0].text === 'Off' && [...sel.options].some((o) => o.text === '≈ 100k tokens'), `the Spending row: ${out.options}`);
  if (sel) { sel.value = '0'; sel.dispatchEvent(new Event('change')); await until(() => A().lighterAt === 0, 3000); }
  ok(A().lighterAt === 0, 'Off is saved on the AI');
  Options.hide?.();
  await wait(200);
  out.cmd = await Commands.tryRun('/lighter 60k', C.id);
  ok(A().lighterAt === 60000, `/lighter 60k (${typeof out.cmd === 'string' ? out.cmd : ''})`);
} catch (e) {
  problems.push(`threw: ${e.message}`);
} finally {
  if (keep === undefined) delete A().lighterAt; else A().lighterAt = keep;
}
return JSON.stringify({ ok: !problems.length, problems, out }, null, 1);
