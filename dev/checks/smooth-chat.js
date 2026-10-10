// Smoothness of chats: a streaming reply (paint + auto-scroll), scrolling up while it streams (auto-scroll must not
// pull you back), a long chat (320 messages: open time and wheel scrolling), switching chats (.chat-enter).
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/smooth-lib.js --script dev/checks/smooth-chat.js
const { wait, until, measure, brief, mouse } = M;
const out = {};
const claude = H.claudeAgent();
activate(claude.id); await wait(300);
const v = () => Native.view(claude.id);
// 1. a long streaming reply
Native.newChat(claude.id); await wait(200);
Native.send(claude.id, 'long table think');
await until(() => v().list.querySelector('.msg.streaming .body p'), 8000);
{ const m = await measure(2500); out.stream = brief(m); if (window.SMOOTH_DEBUG) out.streamDetail = { mut: m.mut.top, paint: m.trace.top, loaf: m.loaf.top }; }
await until(() => !Native.isBusy(H.activeChat[claude.id]), 30000);
// 2. scrolling up a little while it streams: the view must stay where you put it
Native.send(claude.id, 'long');
await until(() => v().list.querySelector('.msg.streaming .body p'), 8000);
await until(() => v().list.scrollHeight > v().list.clientHeight + 300, 10000); await wait(100);
const L = v().list; const lr = L.getBoundingClientRect();
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: lr.left + lr.width / 2, y: lr.top + lr.height / 2, deltaX: 0, deltaY: -60 } });
await wait(150);
const afterWheel = L.scrollTop;
await wait(800);
out.scrollUpWhileStreaming = { userTop: Math.round(afterWheel), oneSecondLater: Math.round(L.scrollTop), pulledBack: L.scrollTop > afterWheel + 4 };
await window.hub.stop(H.activeChat[claude.id]);
await until(() => !Native.isBusy(H.activeChat[claude.id]), 10000);
// 3. a long chat: 320 messages
// every 5th reply is long (it starts folded: the fold check measures each reply)
const para = (i) => `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\n${i % 10 === 0 ? '```js\nconst x = 1;\nconsole.log(x);\n```' : 'Another paragraph of plain words to give it some height.'}${i % 5 === 0 ? `\n\n${Array.from({ length: 30 }, (_, k) => `Long paragraph ${k} with enough words to wrap across the line at least once or twice.`).join('\n\n')}` : ''}`;
const mk = (n, title) => {
  const t0 = Date.now() - n * 60000;
  return { id: `smooth-${title.replace(/\W/g, "")}-${Date.now()}`, agentId: claude.id, title, createdAt: t0, updatedAt: Date.now(), messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part?`, at: t0 + i * 60000 })) };
};
const big = mk(320, 'Long chat'); const small = mk(12, 'Short chat');
await window.hub.saveChat(big); await window.hub.saveChat(small);
Native.save(big); Native.save(small); await wait(300);
let t = performance.now();
Native.open(claude.id, big.id);
await until(() => v().list.querySelectorAll('.msg').length >= 40, 10000); // a long chat opens on its last 40 messages (↑ Show earlier brings the rest)
await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
out.openLongChatMs = Math.round(performance.now() - t);
await wait(800);
const lr2 = v().list.getBoundingClientRect();
out.wheelScroll = brief(await measure(2000, async () => {
  for (let i = 0; i < 30; i++) { await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: lr2.left + lr2.width / 2, y: lr2.top + lr2.height / 2, deltaX: 0, deltaY: -100 } }); await wait(30); }
}));
// 4. switching chats back and forth
out.switchChats = brief(await measure(2400, async () => {
  for (let i = 0; i < 4; i++) { Native.open(claude.id, small.id); await wait(300); Native.open(claude.id, big.id); await wait(300); }
}));
// 5. idle in a long chat
await wait(800);
out.idle = brief(await measure(2000));
return JSON.stringify(out, null, 1);
