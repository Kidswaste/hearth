// Send preview (round 44, sendpreview.js) through the fake engines:
//   1. a small message (a new chat, then a chat with a few short replies) → nothing next to Send
//   2. a long made-up chat whose cache expired 15 minutes ago + a big attachment → "≈ Nk" next to Send; pointing at it
//      (a real mouse move) explains it (the chat re-read with the cache expired, the attachment, the answer) and offers
//      the one cheaper way; Send anyway is there; Esc closes it and focus returns
//   3. the cheaper way works: Continue lighter first → the summary, then the message goes, and the engine reads far less
//   4. a big file sent whole in a short chat → "Send only what you ask about from …" → the message goes trimmed
//   5. calibration: what the engine reported after a plain message moves this AI's factor, and the estimate with it,
//      toward the real usage; saved in kv send-preview
//   6. /send-preview, typing never shows it for a command, the hint goes once sent
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/sendpreview.js --shot /tmp/sendpreview.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};
const C = H.claudeAgent();
const V = () => Native.view(C.id);
const hint = () => V().form.querySelector('.sp-wrap');
const shownHint = () => { const h = hint(); return h && !h.hidden ? h.querySelector('.sp-hint') : null; };
const pop = () => document.querySelector('.sp-pop');
const type = (text) => { const i = V().input; i.value = text; i.dispatchEvent(new Event('input', { bubbles: true })); };
const idle = () => until(() => !Native.isBusy(H.activeChat[C.id]), 60000);
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(4000)]);
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const NOW = Date.now();
const MIN = 60e3;
// a long chat (30 exchanges, ≈ 2k tokens a message), the last message 15 minutes ago, in an engine session
function longChat(id, ago = 15 * MIN) {
  const messages = [];
  let ctx = 900;
  const para = (i, w) => { let s = `${w} ${i}: the outro pacing, the glow on the kick and the title card timing for the Shorts cut. `; let k = 0; while (s.length < 8000) s += `beat ${k++} holds the ember palette while the camera eases in on bar ${i}. `; return s; };
  for (let i = 0; i < 30; i++) {
    const at = NOW - ago - (30 - i) * 3 * MIN;
    messages.push({ role: 'user', text: para(i, 'Shot'), at });
    ctx += 4000;
    messages.push({ role: 'assistant', text: para(i, 'Done'), at: at + MIN, usage: { input: ctx, output: 900, cached: Math.round(ctx * 0.9) } });
  }
  messages.at(-1).at = NOW - ago;
  return { id, agentId: C.id, title: 'Send preview: a long chat', createdAt: NOW - 3 * 3600e3, updatedAt: NOW - ago, session: { id: `sp-${id}` }, messages };
}
try {
  await wait(800);
  for (const g of ['budget', 'attachlean', 'sendpreview']) await Lazy.load(g);
  ok(typeof SendPreview !== 'undefined' && Commands.get('send-preview'), 'send preview loads after the first screen (/send-preview)');
  activate(C.id);
  await until(() => Native.hasView(C.id));
  const store = await SendPreview.load();
  store.ai = {}; // a clean start for this AI's correction
  SendPreview._test.setFixed(C.id, 1000);

  // 1. a small message → nothing
  Native.newChat(C.id);
  type('hi there, what is a good name for a dusk palette?');
  await wait(700);
  ok(!shownHint(), 'a small message in a new chat: nothing next to Send');
  for (const t of ['Name three dusk colors.', 'And a fourth one?', 'Thanks, which one for the title?']) { await Native.send(C.id, t); await wait(100); await idle(); }
  type('Make the second one a bit warmer please.');
  await wait(700);
  ok(!shownHint(), 'a small message in a chat with short replies: nothing');
  const w0 = SendPreview.work(C.id, 'Make the second one a bit warmer please.');
  out.small = { tokens: w0.est.tokens, median: w0.st.median, show: w0.sh.show };
  type('/send-preview');
  await wait(600);
  ok(!shownHint(), 'a command in the chat box: never');

  // 5. calibration: a plain message sent through the chat box, then what the engine reported
  const calText = 'Now pick a font for the title, something round and warm.';
  type(calText);
  await wait(500);
  const before = SendPreview.work(C.id, calText).est;
  const f0 = SendPreview._test.calOf(C.id).f;
  V().form.requestSubmit();
  await wait(150); await idle(); await wait(300);
  const r1 = Native.current(C.id).messages.filter((m) => m.role === 'assistant').at(-1);
  const real = (r1?.usage?.input || 0) + (r1?.usage?.output || 0);
  const cal = SendPreview._test.calOf(C.id);
  out.calibration = { raw: before.raw, estimate: before.tokens, real, f0, f1: cal.f, n: cal.n };
  ok(cal.n === 1 && cal.f !== f0, `calibrated on the reply: factor ${f0} → ${cal.f} (estimate ${before.tokens}, real ${real})`);
  ok(Math.abs(before.raw * cal.f - real) < Math.abs(before.raw * f0 - real), 'the estimate moved toward what the engine reported');
  await wait(1600);
  const disk = await window.hub.kvGet('send-preview', null, { status: true });
  ok(disk?.state === 'ok' && disk.value?.v === 1 && disk.value.ai?.[C.id]?.n === 1, `saved in kv send-preview (${JSON.stringify(disk?.value?.ai?.[C.id])})`);
  const next = SendPreview.work(C.id, calText).est;
  out.calibration.next = next.tokens;
  ok(next.factor === cal.f, 'the next estimate uses it');

  // 2. a long chat, cache expired, + a big attachment → the hint, its breakdown, the cheaper way
  const chat = longChat(`sp-long-${NOW.toString(36)}`);
  const oldCtx = chat.messages.at(-1).usage.input;
  await window.hub.saveChat(chat);
  Native.adopt(chat); await wait(400);
  ok(H.activeChat[C.id] === chat.id, 'the long chat is open');
  const big = Array.from({ length: 2400 }, (_, i) => `${i}: notes on shot ${i % 40} — the glow, the type and the outro beats line up on the kick.`).join('\n');
  V().attachments.push({ kind: 'text', name: 'shot-notes.txt', content: big });
  Native.renderChips(C.id);
  await until(() => V().attachments[0]?.lean, 4000);
  type('Tighten the outro pacing so the logo lands on the last kick.');
  const h = await until(() => shownHint(), 4000);
  out.hint = h?.textContent;
  ok(h && /^≈ \d+k$/.test(h.textContent), `the hint next to Send: “${h?.textContent}”`);
  ok(h && /^This message will cost about \d+k tokens, more than usual/.test(h.getAttribute('aria-label') || ''), 'its name says what it is (screen readers)');
  out.order = [...V().form.querySelectorAll(':scope > button')].filter((b) => b.checkVisibility()).map((b) => b.textContent.trim()).join(' ');
  ok(/^◎ ＋ Send$/.test(out.order), `the chat box's buttons stay ◎ ＋ Send (chatcalm's order): ${out.order}`);
  // point at it with the real mouse
  if (h) { const [x, y] = mid(h); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }); }
  const p = await until(() => pop()?.isConnected && pop(), 3000);
  out.pop = p ? [...p.querySelectorAll('.sp-head, .sp-why, li, button')].map((n) => n.textContent.trim()) : null;
  ok(p && p.getAttribute('role') === 'dialog' && p.getAttribute('aria-label'), 'pointing at it opens the explanation (a named dialog)');
  const txt = p?.textContent || '';
  ok(/Re-reading this chat/.test(txt) && /the cache expired \(last message 1\d min ago\)/.test(txt), 'it says the chat is re-read and the cache expired');
  ok(/shot-notes\.txt/.test(txt) && /Its answer/.test(txt) && /Its instructions and tools/.test(txt), 'it lists the attachment, the answer and the fixed part');
  const cheap = p?.querySelector('.sp-cheap');
  const anyway = p?.querySelector('.sp-anyway');
  out.cheaper = cheap?.textContent;
  ok(anyway && anyway.textContent === 'Send anyway', 'Send anyway is one click away');
  ok(cheap && /— ≈ \d/.test(cheap.textContent), `one cheaper way: “${cheap?.textContent}”`);
  await smoke({ shot: '/tmp/sendpreview-hint.png' });
  // Esc closes it, focus back on the hint
  cheap?.focus();
  cheap?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(100);
  ok(!pop()?.isConnected && document.activeElement === shownHint(), 'Esc closes it and focus returns to the hint');
  // with the attachment sent whole: the trimmed attachment is the lossless way
  ok(/Send only what you ask about from shot-notes\.txt|Continue lighter first/.test(out.cheaper || ''), 'the cheaper way is the trimmed file or Continue lighter');
  // take the attachment away: Continue lighter first is the way for the chat itself
  V().attachments.splice(0); Native.renderChips(C.id);
  type('Tighten the outro pacing so the logo lands on the last kick.');
  await wait(700);
  const w1 = SendPreview.shown.get(C.id);
  out.long = w1 ? { tokens: w1.est.tokens, fresh: w1.est.fresh, cold: w1.est.why, best: w1.best?.label, bestTokens: w1.best?.tokens } : null;
  ok(w1?.best?.id === 'lighter' && w1.best.tokens < w1.est.tokens * 0.4, `the long chat alone: ${w1?.best?.label} — ≈ ${w1?.best?.tokens} (was ≈ ${w1?.est.tokens})`);

  // 3. take it: Continue lighter first, then the message goes
  shownHint()?.click();
  const p2 = await until(() => pop()?.isConnected && pop(), 3000);
  const go = p2?.querySelector('.sp-cheap');
  ok(go && /^Continue lighter first — ≈ \d/.test(go.textContent), `the button: “${go?.textContent}”`);
  const nBefore = Native.current(C.id).messages.length;
  go?.click();
  const sent = await until(() => { const c = Native.current(C.id); return c.compact?.lighter && c.messages.some((m, i) => i >= nBefore && m.role === 'user' && /Tighten the outro/.test(m.text)) && !Native.isBusy(c.id) && c.messages.at(-1).role === 'assistant' && c.messages.at(-1).usage; }, 60000);
  const after = Native.current(C.id);
  const lastReply = after.messages.at(-1);
  out.lighter = { summary: Boolean(after.compact?.lighter), replyInput: lastReply?.usage?.input, before: oldCtx };
  ok(sent, 'Continue lighter first: the summary, then the message was sent');
  ok(lastReply?.usage && lastReply.usage.input < oldCtx * 0.4, `and the engine read far less (${lastReply?.usage?.input} vs ${oldCtx} before)`);
  ok(!shownHint() && !V().input.value, 'the hint went with the message');

  // 4. a big file sent whole in a short chat → trimmed in one click
  Native.newChat(C.id);
  for (const t of ['Here is the plan for the intro.', 'Sounds good, go on.']) { await Native.send(C.id, t); await wait(100); await idle(); }
  V().attachments.push({ kind: 'text', name: 'render.log', content: big });
  Native.renderChips(C.id);
  const a = await until(() => V().attachments[0]?.lean && V().attachments[0], 4000);
  if (a) { a.whole = true; Native.renderChips(C.id); }
  type('Why does the render stop at shot 12?');
  const h3 = await until(() => shownHint(), 4000);
  const w3 = SendPreview.shown.get(C.id);
  out.file = w3 ? { tokens: w3.est.tokens, why: w3.sh.why, best: w3.best?.label, bestTokens: w3.best?.tokens } : null;
  ok(h3 && w3?.best?.id === 'attachment' && /^Send only what you ask about from render\.log$/.test(w3.best.label), `a whole file: “${w3?.best?.label}” — ≈ ${w3?.best?.tokens} (was ≈ ${w3?.est.tokens})`);
  h3?.click();
  const go3 = (await until(() => pop()?.isConnected && pop(), 3000))?.querySelector('.sp-cheap');
  go3?.click();
  const um = await until(() => Native.current(C.id).messages.find((m) => m.role === 'user' && /render stop at shot 12/.test(m.text)), 10000);
  const att = um?.attachments?.[0];
  out.fileSent = att;
  ok(att?.lean?.mode === 'lean' && att.lean.tokens < 6000 && att.lean.wholeTokens > 20000, `sent trimmed: ≈ ${att?.lean?.tokens} tokens of ≈ ${att?.lean?.wholeTokens}`);
  await idle();

  // 6. /send-preview in words
  let said = '';
  await Commands.tryRun('/send-preview Tighten the outro pacing', C.id, null, { say: (t) => { said += String(t); }, note: (t) => { said += String(t); } });
  out.cmd = said || null;
  ok(/^These words in this chat: ≈ \d/.test(out.cmd || '') && /Re-reading this chat|The chat so far|Your words/.test(out.cmd || ''), '/send-preview says it in words');
} catch (e) {
  problems.push(`threw: ${e.message}`);
}
return JSON.stringify({ ok: !problems.length, pass: !problems.length, problems, out }, null, 1);
