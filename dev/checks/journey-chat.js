// Journey 3: chatting with both agents, typed like a person (composer, Enter, the message ⋯ menu): a plain Claude
// chat, /duo and /relay with Astra, a second opinion both ways, a handoff, pin / bookmark / export, search across
// chats, and the meter's numbers against the replies' own usage.
//   node dev/smoke.js --fake-engines --check-timeout 400000 --lib dev/checks/journey-lib.js --script dev/checks/journey-chat.js --shot /tmp/j3.png
const { wait, until, step, click, key, type, shot, visible } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
const C = H.claudeAgent();
const A = H.agents().find((a) => a.engine === 'codex');
const notes = (id) => [...Native.view(id).list.querySelectorAll('.msg.note .body')].map((n) => n.textContent.trim());
const idle = (id) => until(() => !Native.isBusy(H.activeChat[id]) && !Native.isAgentBusy(id), 90000);
async function say(id, text) {
  if (!visible(Native.view(id)?.input)) { activate(id); await wait(400); }
  await click(Native.view(id).input); await type(text); await key('Enter');
  await until(() => Native.isBusy(H.activeChat[id]) || Native.isAgentBusy(id), 3000);
  await idle(id); await wait(300);
}
const lastMsg = (id) => Native.current(id)?.messages.at(-1);

// 1. a plain Claude chat
activate(C.id); await wait(400);
await say(C.id, 'think code a spinning cube in three.js');
const m1 = lastMsg(C.id);
step('Claude replied (thinking + code)', m1?.role === 'assistant' && /```js/.test(m1.text) && Boolean(m1.thinking), { usage: m1?.usage });
step('reply shows its token badge', Boolean(Native.view(C.id).list.querySelector('.msg.assistant:last-of-type .meter-badge, .msg:last-child .tok-badge, .msg:last-child .meter-badge')));
await say(C.id, 'table thanks, now compare two materials');
await shot('claude');

// 2. /duo and /relay with Astra
await say(C.id, '/duo which easing feels snappier for a beat drop');
const collab = (mode) => [...(Native.current(C.id)?.messages || [])].reverse().find((x) => x.role === 'collab' && x.mode === mode);
await until(() => collab('duo')?.status === 'done', 60000);
step('/duo: both answered', collab('duo')?.parts?.every((p) => p.status === 'done'), collab('duo')?.parts?.map((p) => `${p.seat}:${p.status}:${p.usage?.input ?? '?'}`));
await say(C.id, '/relay claude→astra 1 write a haiku about bass');
await until(() => collab('relay')?.status && collab('relay').status !== 'running', 60000);
step('/relay finished', collab('relay')?.status === 'done', collab('relay')?.parts?.map((p) => `${p.seat}/${p.kind}`));
await shot('collab');

// 3. second opinion both ways: Claude's reply → Astra (message ⋯ menu), then Astra's own chat → Claude (/opinion)
await say(C.id, 'code a shader that pulses');
const lastReply = [...Native.view(C.id).list.querySelectorAll('.msg.assistant')].at(-1);
const more = lastReply?.querySelector('.msg-more, .msg-menu-btn, button[title*="More"], .msg-actions button:last-child');
let opinionVia = 'command';
if (more) {
  await click(lastReply, { at: [0.5, 0.3] }).catch(() => null);
  await click(more); await wait(300);
  const item = [...document.querySelectorAll('#menu button, #menu .item, .menu-item, [role=menuitem]')].find((b) => visible(b) && /Second opinion/i.test(b.textContent));
  if (item) { await click(item); opinionVia = 'menu'; } else await key('Escape');
}
if (opinionVia === 'command') await say(C.id, '/opinion');
const opinionOf = (id) => [...(Native.current(id)?.messages || [])].reverse().find((m) => m.role === 'opinion');
await until(() => opinionOf(C.id), 60000);
step('second opinion from Astra on Claude\'s reply', /astra/i.test(opinionOf(C.id)?.from || ''), { via: opinionVia, from: opinionOf(C.id)?.from, cost: opinionOf(C.id)?.cost });
step('the opinion shows in the chat', Boolean([...Native.view(C.id).list.querySelectorAll('.msg')].at(-1)?.textContent.includes('Astra')));
activate(A.id); await wait(400);
Native.newChat(A.id);
await say(A.id, 'think a plan for a music video');
await say(A.id, '/opinion');
await until(() => opinionOf(A.id), 60000);
step('second opinion from Claude on Astra\'s reply', /claude/i.test(opinionOf(A.id)?.from || ''), { from: opinionOf(A.id)?.from });
await shot('opinions');

// 4. handoff: Claude's chat continues with Astra
activate(C.id); await wait(400);
const chatsA0 = (await window.hub.listChats()).filter((c) => c.agentId === A.id).length;
await say(C.id, '/handoff astra');
await until(() => H.activeId === A.id && !Native.isAgentBusy(A.id), 60000);
await wait(800);
const chatsA1 = (await window.hub.listChats()).filter((c) => c.agentId === A.id).length;
step('handoff opened an Astra chat with the summary', chatsA1 === chatsA0 + 1 && H.activeId === A.id && /Handoff from Claude/.test(Native.current(A.id)?.messages[0]?.text || ''), { active: H.activeId, first: Native.current(A.id)?.messages[0]?.text?.slice(0, 80) });

// 5. pin, bookmark, export (back in Claude's chat)
activate(C.id); await wait(400);
const cid = H.activeChat[C.id];
await say(C.id, '/pin');
const meta = (await window.hub.listChats()).find((c) => c.id === cid);
step('/pin pinned the chat', Boolean(meta?.pinned), notes(C.id).slice(-1));
await say(C.id, '/bookmark');
const bms = await window.hub.kvGet('chat-bookmarks');
step('/bookmark saved the last reply', JSON.stringify(bms || {}).includes(cid), notes(C.id).slice(-1));
await say(C.id, '/export md');
await until(async () => (await J.saved()).some((f) => /\.md$/.test(f)), 5000);
step('/export md wrote a Markdown file', (await J.saved()).some((f) => /\.md$/.test(f)), await J.saved());

// 6. search across chats (the chats panel box, then /search)
const box = document.querySelector('#panel input');
if (box) { await click(box); await type('haiku'); await wait(800); }
// titles don't mention it: the panel offers "Search inside messages" (the palette's ? mode)
const deep = document.querySelector('#panel .deep-search');
step('panel offers a search inside messages', visible(deep), deep?.textContent);
if (deep) { await click(deep); await wait(1200); }
const pal = document.activeElement?.value?.startsWith('?') ? document.activeElement.parentElement?.parentElement : null;
const hits = pal ? [pal.textContent.replace(/\s+/g, ' ').slice(0, 160)] : [];
step('…and it finds the relay chat', hits.some((h) => /haiku/i.test(h)), hits.slice(0, 4));
await shot('deep-search');
await key('Escape'); await wait(200);
if (box) { await click(box); await key('a', { ctrl: true }); await key('Backspace'); await key('Escape'); }
await say(C.id, '/search haiku');
step('/search lists matches', /haiku/i.test(notes(C.id).at(-1) || ''), (notes(C.id).at(-1) || '').slice(0, 160));
await shot('search');

// 7. the meter: today's totals against the replies' own usage
const chats = await window.hub.listChats();
let sum = { i: 0, o: 0, r: 0 };
const add = (u) => { if (!u) return; sum.i += u.input || 0; sum.o += u.output || 0; sum.r += 1; };
for (const c of chats) {
  const full = await Native.load(c.id);
  for (const m of full?.messages || []) {
    if (m.role === 'assistant') add(m.usage);
    for (const p of m.parts || []) add(p.usage);
    if (m.role === 'opinion') add(m.cost);
  }
}
await wait(1500);
Meter.refresh?.();
const today = Meter._test.sumOf([Meter._test.dayKeys(1)[0]]);
// the meter also counts turns no chat keeps (the handoff's summary): at most one more than the messages show
step('meter today = the replies (+ the handoff summary)', today.i >= sum.i && today.o >= sum.o && today.r - sum.r <= 1, { meter: { i: today.i, o: today.o, r: today.r }, replies: sum });
await key('u', { ctrl: true, shift: true }); await wait(1200);
const dash = document.querySelector('dialog[open] .meter-dash, .meter-dashboard, dialog[open]');
step('Ctrl+Shift+U opens the dashboard', visible(dash), dash?.className);
await shot('dashboard');
await key('Escape');
return J.done();
