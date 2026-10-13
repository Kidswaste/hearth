// ◎ Missions, finished (round 26, missions2): the picker's More fold, one calm result card for multi-AI missions
// (avatars with a live status, the answer up front, the rest folded, Use this one / Merge, tokens), the mission chip on
// your message with ↻, Plan first (▶ Go ahead), Explain like a teacher (the note it adds is on the chip), Research and
// Second opinion only through the other AI, Ask everyone in one card, and the helper agents' rows under a reply.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/missions2.js --shot /tmp/missions2.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const C = H.claudeAgent();
const A = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
// Ask everyone: only the two native chats here (website agents would open real pages)
const askAllWas = new Map(H.agents().map((a) => [a, a.askAll]));
for (const a of H.agents()) if (a !== C && a !== A) a.askAll = false;
try {
  ok(A, 'an Astra agent exists (fake engines)');
  activate(C.id); await until(() => Native.hasView(C.id)); Native.newChat(C.id); await wait(200);
  const v = Native.view(C.id);
  const chat = () => Native.current(C.id);
  const last = (sel) => [...v.list.querySelectorAll(sel)].at(-1);
  const type = async (t) => { const i = v.root.querySelector('textarea'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); v.root.querySelector('form.composer').requestSubmit(); await wait(300); };
  const idle = () => until(() => !Native.isBusy(chat()?.id) && !Astra._test.live.size && !Missions._live.size, 40000);

  // 1. the picker: the usual ones, rarer ones under More
  v.root.querySelector('.ms-btn').click(); await wait(200);
  const main = [...document.querySelectorAll('.ms-pop .ms-cards > .ms-grid .ms-pick b')].map((b) => b.textContent);
  const more = [...document.querySelectorAll('.ms-pop .ms-more .ms-pick b')].map((b) => b.textContent);
  out.picker = { main, more };
  ok(main.length <= 8 && more.length >= 4 && main.length + more.length <= 13, `short list + More (${main.length} + ${more.length})`);
  ok(['Plan first', 'Research', 'Explain like a teacher', 'Second opinion only'].every((w) => [...main, ...more].some((x) => x.includes(w))), 'the new missions are listed');
  ok(!document.querySelector('.ms-pop .ms-more').open, 'More is folded');
  document.querySelector('.ms-pop .ms-more > summary').click(); await wait(100);
  [...document.querySelectorAll('.ms-pop .ms-more .ms-pick')].find((b) => /teacher/.test(b.textContent)).click(); await wait(100);
  ok(/teacher/.test(v.root.querySelector('.ms-btn').textContent), 'picked from More');

  // 2. Explain like a teacher: the note goes with this message only, and the chip says so
  await type('echo what is a shader uniform');
  await idle(); await wait(300);
  const teachUser = chat().messages.filter((m) => m.role === 'user').at(-1);
  ok(teachUser.mission === 'teach', 'your message remembers its mission');
  ok(/\[Mission: explain like a teacher/.test(chat().messages.at(-1).text), 'the AI got the teacher note (echo)');
  ok(!/Mission:/.test(teachUser.text), 'your words stay as you wrote them');
  const tchip = last('.msg.user .ms-chip');
  ok(tchip && /Explain like a teacher/.test(tchip.textContent) && /Sent with this note/.test(tchip.title), 'the chip on your bubble names it and the note');

  // 3. Swarm: one result card (avatars + status, the chair's answer up front, the rounds folded, tokens)
  Missions.set(C.id, 'swarm');
  await type('Name three colors for a calm intro');
  ok(await until(() => last('.collab-card.mr-card .mr-av.thinking, .collab-card.mr-card .mr-av.waiting, .collab-card.mr-card .mr-status'), 8000), 'swarm: live status while it runs');
  await idle(); await wait(400);
  const swarm = last('.collab-card.mr-card');
  out.swarm = swarm && { avatars: swarm.querySelectorAll('.mr-head .mr-av').length, done: swarm.querySelectorAll('.mr-head .mr-av.done').length, final: Boolean(swarm.querySelector('.mr-final')), others: swarm.querySelector('.mr-others > summary')?.textContent, tok: swarm.querySelector('.mr-tok')?.textContent };
  ok(out.swarm?.avatars >= 3 && out.swarm.done === out.swarm.avatars, `swarm: everyone took part and is done (${JSON.stringify(out.swarm)})`);
  ok(out.swarm?.final && /How they got there/.test(out.swarm.others || '') && /tokens/.test(out.swarm.tok || ''), 'swarm: the final answer up front, the rest folded, tokens small');
  ok(last('.msg.user .ms-chip')?.textContent.includes('Swarm'), 'swarm: 🐝 chip on your message');
  await smoke({ shot: '/tmp/missions2-swarm.png' });

  // 4. ↻ on the chip: the same mission again
  const collabs = () => chat().messages.filter((m) => m.role === 'collab').length;
  const before = collabs();
  last('.msg.user .ms-chip .ms-again').click();
  ok(await until(() => collabs() === before + 1, 4000), '↻ runs it again with Swarm');
  await idle(); await wait(300);

  // 5. Side by side: both answers to choose from, "Use this one" keeps one up front
  Missions.set(C.id, 'duo');
  await type('One line about kick drums');
  await idle(); await wait(400);
  let duo = last('.collab-card.mr-card');
  const use = [...duo.querySelectorAll('.collab-col-foot .primary-act')].filter((b) => b.textContent === 'Use this one');
  ok(use.length === 2 && duo.querySelector(':scope > .collab-grid'), 'side by side: two answers, each with Use this one');
  ok([...duo.querySelectorAll('.collab-actions .msg-act')].some((b) => /Merge/.test(b.textContent)), 'side by side: Merge is offered');
  use[1].click(); await wait(400);
  duo = last('.collab-card.mr-card');
  ok(duo.querySelector(':scope > .mr-final') && /other answer/i.test(duo.querySelector('.mr-others > summary')?.textContent || ''), 'kept: up front, the other folded');

  // 6. Plan first: a plan, then ▶ Go ahead sends the go
  Missions.set(C.id, 'plan');
  await type('echo build a small particle intro');
  await idle(); await wait(500);
  ok(/\[Mission: plan first/.test(chat().messages.at(-1).text), 'plan first: it was asked for a plan only');
  const go = [...v.list.querySelectorAll('.ms-plan .msg-act')].find((b) => /Go ahead/.test(b.textContent));
  ok(go, 'plan first: ▶ Go ahead under the plan');
  go?.click(); await wait(300);
  ok(/go ahead with the plan/.test(chat().messages.filter((m) => m.role === 'user').at(-1)?.text || ''), 'Go ahead sends the go');
  await idle(); await wait(300);
  ok(!v.list.querySelector('.ms-plan'), 'the bar leaves once answered');

  // 7. Research from a Claude chat: Astra answers it (web search on), in the same card
  Missions.set(C.id, 'research');
  await type('latest three.js release notes');
  await idle(); await wait(400);
  const res = last('.mission-msg .mr-card');
  ok(res && res.querySelector('.mr-av.done') && res.querySelector('.mr-final .mr-answer')?.textContent.length > 5, 'research: Astra\'s answer in the result card');
  ok(/searched the web/.test(res?.querySelector('.mr-by')?.textContent || ''), 'research: it says it searched');

  // 8. Second opinion only: only the other AI answers
  const replies = chat().messages.filter((m) => m.role === 'assistant').length;
  Missions.set(C.id, 'other');
  await type('Is that release worth upgrading to?');
  await idle(); await wait(400);
  ok(chat().messages.filter((m) => m.role === 'assistant').length === replies && chat().messages.at(-1).role === 'mission' && chat().messages.at(-1).rows[0].status === 'done', 'second opinion only: Astra answers, Claude stays quiet');

  // 9. Ask everyone: one card, a row per AI, live then done
  Missions.set(C.id, 'everyone');
  await type('Say hi in five words');
  ok(await until(() => last('.mission-msg .mr-card .mr-av'), 4000), 'ask everyone: the card shows at once');
  await idle(); await until(() => chat().messages.find((m) => m.kind === 'everyone')?.rows.every((r) => r.status !== 'thinking'), 20000); await wait(300);
  const ev = chat().messages.find((m) => m.kind === 'everyone');
  out.everyone = ev?.rows.map((r) => `${r.name}: ${r.status}`);
  ok(ev?.rows.length === 2 && ev.rows.every((r) => r.status === 'done'), `ask everyone: both answered (${out.everyone})`);
  const evCard = last('.mission-msg .mr-card');
  ok(evCard?.querySelector('.mr-final') && evCard.querySelector('.mr-others .mr-row'), 'ask everyone: one up front, the other folded');
  evCard.querySelector('.mr-others').open = true; const row = evCard.querySelector('.mr-row'); row.open = true; await wait(100);
  [...row.querySelectorAll('.msg-act')].find((b) => b.textContent === 'Use this one')?.click(); await wait(300);
  ok(Number.isInteger(chat().messages.find((m) => m.kind === 'everyone').kept) && chat().carry, 'Use this one: kept, the next message continues from it');

  // 10. Split it up: helper agents in tidy rows under the reply
  Missions.set(C.id, 'split');
  await type('subagents');
  let rows = 0;
  await until(() => { rows = Math.max(rows, v.list.querySelectorAll('.msg.streaming .live-agents .live-agent .la-name').length); return !Native.isBusy(chat().id) && rows; }, 30000);
  await idle(); await wait(400);
  ok(rows === 3, `split: 3 helper rows live (${rows})`);
  const fold = last('.msg.assistant > .agent-fold');
  ok(fold && fold.previousElementSibling?.classList.contains('body'), 'split: the helpers stay under the reply');
  if (fold) { fold.open = true; await wait(100); }
  ok(fold?.querySelectorAll('.live-agent .la-pip').length === 3, 'split: one row per helper when done');
  await smoke({ shot: '/tmp/missions2-split.png' });
  v.list.scrollTop = 0;
} catch (err) { fail.push(`threw: ${err.message}`); }
for (const [a, was] of askAllWas) { if (was === undefined) delete a.askAll; else a.askAll = was; }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
