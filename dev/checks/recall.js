// Recall (round 30): "what did we decide about X?" across every chat, local and free. A few seeded chats, then: the
// index is not built at startup, it catches up in slices; the ranked answer (decisions / open questions); the chats
// panel's "Find the answer" row → the card → Jump to it (the chat opens on that message); the ◎ mission; the optional
// AI sum-up (its cost is on the button, and only the quotes are sent).
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/recall.js --shot /tmp/recall.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const C = H.claudeAgent();
const DAY = 86400e3; const now = Date.now();
const m = (role, text, d) => ({ role, text, at: now - d * DAY });
const SECRET = 'zebra-lantern-secret';
const chats = [
  { id: 'rc-intro', agentId: C.id, title: 'Intro video', createdAt: now - 20 * DAY, updatedAt: now - 2 * DAY, messages: [
    m('user', 'What font should the intro titles use? Maybe Inter or Söhne.', 20),
    m('assistant', `Inter is free and reads well small; Söhne is paid. ${SECRET} is not part of any quote.`, 20),
    m('user', "Let's go with Inter for the intro titles, bold, tracking -2%.", 19),
    m('assistant', 'Done: the intro titles now use Inter Bold.', 19),
    m('user', 'Should we add a logo sting at the end of the intro? Not sure yet.', 2)] },
  { id: 'rc-bloom', agentId: C.id, title: 'Bloom shader', createdAt: now - 40 * DAY, updatedAt: now - 40 * DAY, messages: [
    m('user', 'The bloom is too strong on the orb.', 40), m('assistant', 'I lowered bloom strength to 0.6.', 40), m('user', 'We decided to keep bloom at 0.6 from now on.', 40)] },
  { id: 'rc-misc', agentId: C.id, title: 'Odds and ends', createdAt: now - 5 * DAY, updatedAt: now - 5 * DAY, messages: [
    m('user', 'Tell me about fonts in general.', 5), m('assistant', 'Fonts come in serif and sans families.', 5)] },
];
try {
  await wait(800);
  ok(window.RecallHooks?.state?.() !== 'building' && window.RecallHooks?.state?.() !== 'ready', 'the index is not built at startup');
  for (const c of chats) { await window.hub.saveChat(c); Native.save(c); }
  await Lazy.load('recall');
  ok(Commands.get('decided')?.name === 'decided' && Commands.get('recall')?.name === 'drafts', '/decided exists (/recall stays /drafts)');
  ok(Missions.LIST.some((x) => x.id === 'recall' && /decided/.test(x.label)), 'the ◎ mission "Remind me what we decided"');

  // ---- the index, in slices (what the idle build does) ----
  let r = await window.hub.recall({ budgetMs: 1 }); let slices = 1; let worst = r.ms || 0;
  while (r.left && slices < 400) { r = await window.hub.recall({ budgetMs: 12 }); slices += 1; worst = Math.max(worst, r.ms || 0); }
  out.index = { slices, worst, chats: r.chats, messages: r.messages, terms: r.terms };
  ok(!r.left && r.chats >= 3, 'the index catches up');

  // ---- the ranking ----
  const a = await window.hub.recall({ q: 'what did we decide about the intro font?', budgetMs: 250 });
  out.answer = { took: a.ms, dec: a.decisions.map((h) => `${h.chatId}#${h.k}`), open: a.open.map((h) => `${h.chatId}#${h.k}`), men: a.mentions.length };
  ok(a.decisions[0]?.chatId === 'rc-intro' && a.decisions[0].k === 2 && /go with Inter/.test(a.decisions[0].snippet), 'the decision comes first, on the right message');
  ok(a.open.some((h) => h.chatId === 'rc-intro' && /logo sting/.test(h.snippet)), 'the open question is grouped apart');
  // a chat saved after the build is in the next answer (incremental)
  const late = { id: 'rc-late', agentId: C.id, title: 'Poster', createdAt: now, updatedAt: now, messages: [m('user', "Let's go with the teal palette for the poster.", 0)] };
  await window.hub.saveChat(late); Native.save(late);
  const b = await window.hub.recall({ q: 'which palette for the poster?', budgetMs: 250 });
  ok(b.decisions[0]?.chatId === 'rc-late', 'a chat saved later is found at once');

  // ---- the chats panel: "Find the answer" ----
  activate(C.id); await wait(300);
  const box = document.getElementById('chat-search');
  box.value = 'intro font'; box.dispatchEvent(new Event('input'));
  await wait(200);
  ok(!document.querySelector('#chat-groups .recall-row'), 'no row for plain words');
  box.value = 'what did we decide about the intro font?'; box.dispatchEvent(new Event('input'));
  const row = await until(() => document.querySelector('#chat-groups .recall-row'));
  ok(row && /Find the answer/.test(row.textContent), 'a question gets the "Find the answer" row');
  row?.click();
  const hit = await until(() => document.querySelector('.recall-dlg[open] .rc-dec .rc-hit'), 10000);
  ok(hit && /Inter/.test(hit.textContent) && /Intro video/.test(hit.textContent), 'the card shows the decision with its chat');
  ok(Boolean(document.querySelector('.recall-dlg[open] .rc-open .rc-hit')), 'and the open question');
  const ai = document.querySelector('.recall-dlg[open] .rc-ai');
  ok(ai && /≈ [\d,]+ tokens/.test(ai.textContent), 'the AI sum-up shows its cost first');
  out.button = ai?.textContent;
  await smoke({ shot: '/tmp/recall-card.png' });
  hit?.querySelector('.rc-jump')?.click();
  await until(() => H.activeChat[C.id] === 'rc-intro');
  const flashed = await until(() => Native.view(C.id)?.list.querySelector('.msg[data-index="2"]'), 6000);
  ok(H.activeChat[C.id] === 'rc-intro' && flashed && !document.querySelector('.recall-dlg[open]'), 'Jump to it opens the chat on that message');
  box.value = ''; box.dispatchEvent(new Event('input'));

  // ---- the mission: the message becomes the question, nothing is sent ----
  const before = Native.current(C.id).messages.length;
  Missions.start(C.id, 'recall', 'bloom strength?');
  const bh = await until(() => document.querySelector('.recall-dlg[open] .rc-dec .rc-hit'), 10000);
  ok(bh && /0\.6/.test(bh.textContent), 'the mission opens the card on its question');
  ok(Native.current(C.id).messages.length === before, 'the mission sends nothing');

  // ---- the optional sum-up: only the quotes ----
  document.querySelector('.recall-dlg[open] .rc-ai')?.click();
  const sent = await until(() => { const msgs = Native.current(C.id).messages; return msgs.slice(before).find((x) => x.role === 'user'); }, 8000);
  ok(sent && /bloom/.test(sent.text) && /only these quotes/.test(sent.text), 'the sum-up sends the quotes');
  ok(sent && !sent.text.includes(SECRET), 'never whole chats');
  await until(() => !Native.isBusy(H.activeChat[C.id]), 20000);
  await smoke({ shot: '/tmp/recall-sent.png' });
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
