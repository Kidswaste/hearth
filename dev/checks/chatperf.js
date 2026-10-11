// Chat weight and streaming cost (round 16, chatperf): main-thread time (script / style / layout from CDP
// Performance.getMetrics) for one whole streamed reply, DOM churn, then a 300-message chat shown in full: DOM
// nodes per message, JS heap after a GC, open time, switch time, and wheel scrolling through it.
// CPU time is less noisy than fps on a shared machine: compare before / after runs from the same machine.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/smooth-lib.js --script dev/checks/chatperf.js
const { wait, until, measure, brief } = M;
const out = { hidden: document.hidden };
const claude = H.claudeAgent();
activate(claude.id); await wait(300);
const v = () => Native.view(claude.id);
await smoke({ cdp: 'Performance.enable', params: {} });
const metrics = async () => { const r = await smoke({ cdp: 'Performance.getMetrics', params: {} }); const o = {}; for (const m of r.metrics || []) o[m.name] = m.value; return o; };
const gc = async () => { await smoke({ cdp: 'HeapProfiler.collectGarbage', params: {} }).catch(() => {}); await wait(100); await smoke({ cdp: 'HeapProfiler.collectGarbage', params: {} }).catch(() => {}); };
const busy = (a, b) => ({ scriptMs: Math.round((b.ScriptDuration - a.ScriptDuration) * 1000), styleMs: Math.round((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000), layoutMs: Math.round((b.LayoutDuration - a.LayoutDuration) * 1000), layouts: b.LayoutCount - a.LayoutCount, taskMs: Math.round((b.TaskDuration - a.TaskDuration) * 1000) });

// 0. the frozen-prefix streaming paint draws exactly what a full render draws (fences with blank lines, lists that
// keep counting, tables, quotes, callouts, $$ formulas, a fence still open at the end of a piece)
{
  const sample = ['# Title', 'Intro with **bold** and `code`.', '```js\nconst a = 1;\n\nconst b = 2;\n```', '1. one\n2. two', '3. three after a gap', '| a | b |\n|---|--:|\n| 1 | 2 |',
    '> [!NOTE] Heads up\n> inside', '$$\nx^2\n\ny_1\n$$', '- [ ] task\n- [x] done', 'Last paragraph\nwith a second line.', '```\nunclosed fence\n\nstill code'].join('\n\n');
  const ref = document.createElement('div'); ref.innerHTML = window.renderMarkdownLive(sample); const want = ref.innerHTML;
  const bad = [5, 12, 37].filter((step) => Native._streamHTML(sample, step) !== want);
  out.streamSameAsFull = bad.length ? `DIFFERENT at steps ${bad.join(', ')}` : 'same';
  if (bad.length) throw new Error(`streamed Markdown differs from the full render (steps ${bad.join(', ')})`);
}
// 1. one whole streamed reply (thinking, a table, a code block, 60 paragraphs), start to finish
Native.newChat(claude.id); await wait(300);
let muts = 0;
const mo = new MutationObserver((r) => { muts += r.length; });
mo.observe(v().list, { subtree: true, childList: true, characterData: true, attributes: true });
let m0 = await metrics(); let t0 = performance.now();
Native.send(claude.id, 'long table code think');
await until(() => Native.isBusy(H.activeChat[claude.id]), 8000);
await until(() => !Native.isBusy(H.activeChat[claude.id]), 60000);
await wait(400);
let m1 = await metrics(); const secs = (performance.now() - t0) / 1000;
mo.disconnect();
out.wholeReply = { secs: Math.round(secs * 10) / 10, ...busy(m0, m1), mutPerSec: Math.round(muts / secs), replyNodes: v().list.querySelector('.msg.assistant:last-of-type')?.querySelectorAll('*').length };
// the same, measured as frames while it streams
Native.send(claude.id, 'long');
await until(() => v().list.querySelector('.msg.streaming .body p'), 8000);
out.stream = brief(await measure(2500));
await until(() => !Native.isBusy(H.activeChat[claude.id]), 60000);

// 2. a 300-message chat, every message shown (↑ Show earlier)
const para = (i) => `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\n${i % 10 === 0 ? '```js\nconst x = 1;\nconsole.log(x);\n```' : 'Another paragraph of plain words to give it some height.'}${i % 5 === 0 ? `\n\n${Array.from({ length: 30 }, (_, k) => `Long paragraph ${k} with enough words to wrap across the line at least once or twice.`).join('\n\n')}` : ''}`;
const mk = (n, title) => {
  const at = Date.now() - n * 60000;
  return { id: `perf-${title.replace(/\W/g, '')}-${Date.now()}`, agentId: claude.id, title, createdAt: at, updatedAt: Date.now(), messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part?`, at: at + i * 60000, ...(i % 2 && i % 3 === 0 ? { thinking: `Thinking about ${i}. `.repeat(40), thinkMs: 4000, tools: ['mcp__hearth__three_eval', 'mcp__hearth__three_screenshot', 'Read'] } : {}) })) };
};
const big = mk(300, 'Perf long chat'); const small = mk(12, 'Perf short chat');
await window.hub.saveChat(big); await window.hub.saveChat(small);
Native.save(big); Native.save(small); await wait(300);
await gc(); const heap0 = (await metrics()).JSHeapUsedSize;
let t = performance.now();
Native.open(claude.id, big.id);
await until(() => v().list.querySelectorAll('.msg').length >= 40, 10000);
await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
out.openLongChatMs = Math.round(performance.now() - t);
await wait(700);
t = performance.now();
Native.showEarlier(claude.id);
await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
out.showAllMs = Math.round(performance.now() - t);
await wait(1200);
const msgs = v().list.querySelectorAll('.msg').length;
const nodes = v().list.querySelectorAll('*').length;
out.fullChat = { messages: msgs, domNodes: nodes, nodesPerMessage: Math.round(nodes / Math.max(1, msgs)), listeners: undefined };
await gc(); const mm = await metrics();
out.fullChat.heapMB = Math.round((mm.JSHeapUsedSize / 1048576) * 10) / 10;
out.fullChat.heapGrowMB = Math.round(((mm.JSHeapUsedSize - heap0) / 1048576) * 10) / 10;
out.fullChat.documentNodes = mm.Nodes;
// wheel through the whole chat
const lr = v().list.getBoundingClientRect();
m0 = await metrics();
out.wheelScroll = brief(await measure(2400, async () => {
  for (let i = 0; i < 40; i++) { await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: lr.left + lr.width / 2, y: lr.top + lr.height / 2, deltaX: 0, deltaY: -400 } }); await wait(30); }
}));
m1 = await metrics();
out.wheelBusy = busy(m0, m1);
// 3. switching between it (all shown: fullChats remembers) and a short chat
const sw = [];
m0 = await metrics();
for (let i = 0; i < 4; i++) {
  for (const id of [small.id, big.id]) {
    t = performance.now(); Native.open(claude.id, id);
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    sw.push(performance.now() - t); await wait(250);
  }
}
m1 = await metrics();
sw.sort((a, b) => a - b);
out.switch = { medianMs: Math.round(sw[Math.floor(sw.length / 2)]), worstMs: Math.round(sw.at(-1)), ...busy(m0, m1) };
// 4. a reply ends in a long chat: how much of the list is rebuilt
Native.open(claude.id, big.id); await wait(500);
let rebuilt = 0;
const mo2 = new MutationObserver((r) => { for (const x of r) for (const n of x.addedNodes) if (n.classList?.contains('msg')) rebuilt += 1; });
mo2.observe(v().list, { childList: true });
m0 = await metrics();
Native.send(claude.id, 'hi');
await until(() => Native.isBusy(H.activeChat[claude.id]), 8000);
await until(() => !Native.isBusy(H.activeChat[claude.id]), 30000);
await wait(400);
m1 = await metrics();
mo2.disconnect();
out.sendInLongChat = { messagesAdded: rebuilt, ...busy(m0, m1) };
// 5. typing 80 characters in the composer of the long chat (each keystroke: counter, Send button, box height, "/" menu)
{
  const ta = v().input; ta.focus(); ta.value = '';
  let tm = 0; const mo3 = new MutationObserver((r) => { tm += r.length; }); mo3.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  m0 = await metrics();
  for (let i = 0; i < 80; i++) { ta.value += i % 9 === 8 ? ' ' : 'a'; ta.dispatchEvent(new Event('input', { bubbles: true })); await wait(16); }
  m1 = await metrics(); mo3.disconnect();
  out.typing80 = { mutations: tm, ...busy(m0, m1) };
  ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true }));
}
// folded tool steps fill in when opened (they have no list until then)
{
  const fold = v().list.querySelector('.tool-fold');
  const before = fold?.querySelectorAll('li').length;
  if (fold) { fold.open = true; await wait(150); }
  out.toolFold = { listBefore: before, itemsWhenOpen: fold?.querySelectorAll('.tool-list li').length };
  if (!fold || before !== 0 || !out.toolFold.itemsWhenOpen) throw new Error(`tool fold: ${JSON.stringify(out.toolFold)}`);
}
// 6. the chats list (one set of listeners for every row) and repeated toasts
{
  const row = document.querySelector(`#chat-groups .item[data-key="${CSS.escape(small.id)}"]`);
  row.click(); await wait(300);
  const opened = H.activeChat[claude.id] === small.id;
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 200 })); await wait(200);
  const menu = Boolean(document.getElementById('menu') && !document.getElementById('menu').hidden && /Rename/.test(document.getElementById('menu').textContent));
  hideMenu(); await wait(100);
  for (let i = 0; i < 3; i++) toast('Same thing again', { timeout: 3000 });
  const same = [...document.querySelectorAll('#toasts .toast')].filter((t) => /Same thing again/.test(t.textContent));
  out.listAndToasts = { rowOpensChat: opened, rowRightClickMenu: menu, repeatedToasts: same.length, counter: same[0]?.querySelector('.toast-n')?.textContent.trim() };
  if (!opened || !menu || same.length !== 1) throw new Error(`chats list / toasts: ${JSON.stringify(out.listAndToasts)}`);
}
return JSON.stringify(out, null, 1);
