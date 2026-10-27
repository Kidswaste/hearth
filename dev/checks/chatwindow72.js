// (round 72, chatwindow72) A 900-message chat kept open cheaply: only the recent messages are real DOM, the older ones
// rest as one spacer per block of the right height (the scrollbar stays honest), woken as you scroll up to them and put
// back to rest when far out of view. Made up here (never real data): 900 messages with code blocks (some long), tables,
// pictures and videos a reply made (chat-media heroes), Lab screenshots (show cards), folded tool steps, thinking,
// pictures you attached. Measured (main-thread ms from CDP Performance.getMetrics; the box is shared, compare runs):
//   open        the chat's row clicked in the chats list → its messages drawn + the next frame; DOM nodes, heap (GC'd)
//   typing      40 characters typed in the message box (real key events): busy ms, the slowest key → next frame
//   reply       a message sent (Send clicked, the fake engine answers): busy ms, messages added to the list
//   scroll up   the wheel, up through the whole chat: frames, worst gap, the DOM node peak, content jumps (a message on
//               screen must move by exactly what the wheel scrolled, and stay put once you stop)
//   find        Alt+F, a word only in message #4 (resting): found, the message woken and on screen
//   rest        back at the end: the woken blocks rest again (DOM back near the open size)
//   show all    "Earlier messages are resting · Show all" clicked: every message drawn
// window.CW_REPORT = 1: report without failing (the before numbers).
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/smooth-lib.js --script dev/checks/chatwindow72.js
const { wait, until, measure, brief } = M;
const out = { problems: [] };
const bad = (msg) => out.problems.push(msg);
const claude = H.claudeAgent();
activate(claude.id); await wait(400);
const v = () => Native.view(claude.id);
const list = () => v().list;
await smoke({ cdp: 'Performance.enable', params: {} });
const metrics = async () => { const r = await smoke({ cdp: 'Performance.getMetrics', params: {} }); const o = {}; for (const m of r.metrics || []) o[m.name] = m.value; return o; };
const gc = async () => { for (let i = 0; i < 2; i++) { await smoke({ cdp: 'HeapProfiler.collectGarbage', params: {} }).catch(() => {}); await wait(100); } };
const busy = (a, b) => ({ scriptMs: Math.round((b.ScriptDuration - a.ScriptDuration) * 1000), styleMs: Math.round((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000), layoutMs: Math.round((b.LayoutDuration - a.LayoutDuration) * 1000), taskMs: Math.round((b.TaskDuration - a.TaskDuration) * 1000) });
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const nodes = () => list().getElementsByTagName('*').length;
const MB = (x) => Math.round((x / 1048576) * 10) / 10;
const key = async (k, code, mods = 0, text) => { for (const type of ['keyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : { Enter: 13, Escape: 27 }[k] || 0, ...(type === 'keyDown' && text ? { text } : {}) } }); };
const wheel = (dy) => { const r = list().getBoundingClientRect(); return smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: r.left + r.width / 2, y: r.top + r.height / 2, deltaX: 0, deltaY: dy } }); };
const click = async (node) => { node.scrollIntoView({ block: 'nearest' }); await frame(); const r = node.getBoundingClientRect(); for (const type of ['mousePressed', 'mouseReleased']) await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x: r.left + r.width / 2, y: r.top + r.height / 2, button: 'left', clickCount: 1 } }); };

// ---------- the made-up 900-message chat (files from the app copy's own assets: never the owner's) ----------
const root = decodeURIComponent(new URL('.', location.href).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const png = `${root}assets/swirl.svg`; const mp4 = `${root}assets/cmd-clips/astra.mp4`;
const N = 900; const RARE = 'zanzibarquartz';
const code = (n, k) => ['```js', ...Array.from({ length: n }, (_, j) => `const v${j} = scene.getObjectByName('layer${k}_${j}'); // tweak ${j}`), '```'].join('\n');
const table = (n) => ['| part | value | note |', '|---|---:|---|', ...Array.from({ length: n }, (_, j) => `| bloom ${j} | ${j * 3} | glow and grain ${j} |`)].join('\n');
const replyText = (i) => [`Reply ${i}: here is **the plan** with \`code\` and a [link](https://example.com/${i}).`, '', '- one thing to try', '- another, a little longer, to wrap across the line', '',
  i % 4 === 1 ? code(i % 3 === 0 ? 60 : 12, i) : 'A paragraph of plain words to give it some height and wrap once or twice in the chat width here.',
  i % 7 === 3 ? `\n${table(8)}` : '', i % 9 === 5 ? `\n${Array.from({ length: 14 }, (_, k) => `Paragraph ${k} of a long answer with enough words to wrap across the line at least once.`).join('\n\n')}` : ''].join('\n');
const t0 = Date.now() - N * 60000;
const messages = Array.from({ length: N }, (_, i) => {
  const at = t0 + i * 60000;
  if (i % 2 === 0) return { role: 'user', text: i === 4 ? `Question ${i}: can the ${RARE} layer glow?` : `Question ${i}: what about this part?`, at, ...(i % 50 === 10 ? { attachments: [{ kind: 'image', name: 'ref.png' }], images: [png] } : {}) };
  return { role: 'assistant', text: replyText(i), at, usage: { input: 2000 + i, output: 300 + i },
    ...(i % 6 === 1 ? { thinking: `Thinking about ${i}. `.repeat(30), thinkMs: 3000 } : {}),
    ...(i % 5 === 2 ? { tools: ['mcp__hearth__three_eval', 'mcp__hearth__three_screenshot', 'mcp__hearth__three_edit_code', 'Read'] } : {}),
    ...(i % 15 === 7 ? { shows: [{ path: png, caption: `Lab screenshot ${i}` }] } : {}),
    ...(i % 20 === 9 ? { things: [{ k: 'image', path: png, name: 'poster.png', src: 'made' }] } : {}),
    ...(i % 40 === 19 ? { things: [{ k: 'video', path: mp4, name: 'clip.mp4', src: 'made' }] } : {}) };
});
const big = { id: `cw72-${Date.now()}`, agentId: claude.id, title: 'Window72 long chat', createdAt: t0, updatedAt: Date.now(), messages };
const small = { id: `cw72s-${Date.now()}`, agentId: claude.id, title: 'Window72 short chat', createdAt: t0, updatedAt: Date.now() - 1000, messages: messages.slice(-6).map((m) => ({ ...m })) };
await window.hub.saveChat(big); await window.hub.saveChat(small);
Native.save(big); Native.save(small);
Native.open(claude.id, small.id); await wait(800);
out.fixture = { messages: N, code: messages.filter((m) => /```/.test(m.text)).length, tables: messages.filter((m) => /\|---/.test(m.text)).length, videos: messages.filter((m) => m.things?.[0]?.k === 'video').length, pictures: messages.filter((m) => m.things?.[0]?.k === 'image').length, labShots: messages.filter((m) => m.shows).length, toolCards: messages.filter((m) => m.tools).length };

// ---------- 1. open: its row clicked ----------
await gc(); const heap0 = (await metrics()).JSHeapUsedSize;
const row = (await until(() => document.querySelector(`#chat-groups .item[data-key="${CSS.escape(big.id)}"]`), 5000)) ? document.querySelector(`#chat-groups .item[data-key="${CSS.escape(big.id)}"]`) : null;
let m0 = await metrics(); let t = performance.now();
if (row) await click(row); else Native.open(claude.id, big.id);
await until(() => H.activeChat[claude.id] === big.id && list().querySelectorAll('.msg').length >= 30, 10000);
await frame();
const openMs = Math.round(performance.now() - t);
await wait(1500); let m1 = await metrics();
await gc(); const mOpen = await metrics();
out.open = { ms: openMs, ...busy(m0, m1), messagesInDom: list().querySelectorAll('.msg').length, listNodes: nodes(), documentNodes: mOpen.Nodes, heapMB: MB(mOpen.JSHeapUsedSize), heapGrowMB: MB(mOpen.JSHeapUsedSize - heap0), viaRow: Boolean(row) };
const openNodes = out.open.listNodes;
const sb = list(); out.open.scrollHeight = sb.scrollHeight; out.open.atEnd = sb.scrollHeight - sb.scrollTop - sb.clientHeight < 4;

// ---------- 2. typing 40 characters (real keys) ----------
{
  const ta = v().input; ta.focus(); await frame();
  m0 = await metrics(); let worst = 0;
  for (let i = 0; i < 40; i++) { const ch = i % 8 === 7 ? ' ' : 'a'; const k0 = performance.now(); await smoke({ cdp: 'Input.insertText', params: { text: ch } }); await frame(); worst = Math.max(worst, performance.now() - k0); }
  m1 = await metrics();
  out.typing40 = { ...busy(m0, m1), worstKeyMs: Math.round(worst) };
  ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true }));
}

// ---------- 3. a new reply in the long chat ----------
{
  let added = 0;
  const mo = new MutationObserver((r) => { for (const x of r) for (const n of x.addedNodes) if (n.classList?.contains('msg')) added += 1; });
  mo.observe(list(), { childList: true });
  const ta = v().input; ta.value = 'hi'; ta.dispatchEvent(new Event('input', { bubbles: true }));
  m0 = await metrics(); t = performance.now();
  const send = v().root.querySelector('form button.primary[type=submit]');
  if (send) await click(send); else ta.closest('form').requestSubmit();
  await until(() => Native.isBusy(big.id), 8000);
  await until(() => !Native.isBusy(big.id), 30000);
  await wait(500); m1 = await metrics(); mo.disconnect();
  out.reply = { ms: Math.round(performance.now() - t), ...busy(m0, m1), messagesAdded: added, listNodes: nodes(), viaButton: Boolean(send) };
}

// ---------- 4. the wheel, up through the whole chat ----------
{
  const L = list(); let peak = nodes(); const jumps = []; let steps = 0; let blank = 0;
  const center = () => { const r = L.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.4); return e?.closest?.('.msg, .msg-rest') || null; };
  const settled = async () => { await wait(160); let last = -1; let still = 0; for (let k = 0; k < 40 && still < 3; k++) { await wait(40); still = Math.abs(L.scrollTop - last) < 1 ? still + 1 : 0; last = L.scrollTop; } }; // (the wheel's smooth scroll first starts, then stops)
  m0 = await metrics(); t = performance.now();
  // each turn of the wheel: once the scroll stops, what's on screen must stay put while the blocks around it wake / rest
  const meas = await measure(100, async () => {
    for (let i = 0; i < 300; i++) {
      const s0 = L.scrollTop; await wheel(-1500); await until(() => Math.abs(L.scrollTop - s0) >= 1, 1500); await settled(); steps += 1; // (the wheel's own scroll first: a late one isn't a jump)
      const a = center(); const ay = a?.getBoundingClientRect().top;
      if (a?.classList.contains('msg-rest')) blank += 1; // (a spacer under the eye: woken too late)
      await wait(220);
      peak = Math.max(peak, nodes());
      if (a?.classList.contains('msg') && a.isConnected) { const moved = Math.round(a.getBoundingClientRect().top - ay); if (Math.abs(moved) > 2) jumps.push(moved); }
      if (L.scrollTop <= 0 && L.querySelector('.msg[data-index="0"]')) break;
    }
  });
  m1 = await metrics();
  out.scrollUp = { steps, ms: Math.round(performance.now() - t), ...busy(m0, m1), frames: brief(meas), peakListNodes: peak, blankAtStop: blank, jumps: jumps.length, worstJumps: jumps.sort((a, b) => Math.abs(b) - Math.abs(a)).slice(0, 6), reachedFirst: Boolean(L.querySelector('.msg[data-index="0"]')) };
  // stays put once you stop: a message on screen keeps its place while the blocks around settle
  await wheel(300); await wait(200);
  const a = center(); const ay = a?.getBoundingClientRect().top; await wait(1500);
  out.scrollUp.settleDrift = a?.isConnected ? Math.round(a.getBoundingClientRect().top - ay) : 'gone';
}

// ---------- 5. find a resting message (Alt+F, typed, Enter) ----------
{
  const L = list();
  // back to the end first: message #4 rests again
  for (let i = 0; i < 6; i++) { L.scrollTop = L.scrollHeight; await wait(250); }
  await wait(900);
  out.rest = { listNodesBackAtEnd: nodes(), openNodes, msg4InDom: Boolean(L.querySelector('.msg[data-index="4"]')) };
  v().input.focus();
  await key('f', 'KeyF', 1); await wait(300);
  const bar = v().root.querySelector('.chat-find input');
  if (bar) { bar.focus(); await smoke({ cdp: 'Input.insertText', params: { text: RARE } }); await wait(400); await key('Enter', 'Enter'); }
  const hit = (await until(() => list().querySelector('.msg[data-index="4"] mark.find-hit'), 5000)) ? list().querySelector('.msg[data-index="4"] mark.find-hit') : null;
  await wait(600);
  const now = list().querySelector('.msg[data-index="4"] mark.find-hit'); // (marked again as the blocks around it wake)
  const r = now?.getBoundingClientRect(); const lr = list().getBoundingClientRect();
  out.find = { bar: Boolean(bar), count: v().root.querySelector('.chat-find .find-count')?.textContent, found: Boolean(hit), onScreen: Boolean(r && r.top >= lr.top - 2 && r.bottom <= lr.bottom + 2) };
  if (bar) { await key('Escape', 'Escape'); await wait(200); }
}

// ---------- 6. "Show all" (the quiet line on top of what's drawn) ----------
{
  const L = list();
  for (let i = 0; i < 4; i++) { L.scrollTop = L.scrollHeight; await wait(250); }
  await wait(600);
  const line = L.querySelector('.rest-line');
  const all = line?.querySelector('button, a, .rest-all') || line;
  t = performance.now();
  if (all) { await click(all); await until(() => L.querySelectorAll('.msg').length >= N - 5, 20000); await frame(); }
  out.showAll = { line: line ? line.textContent.trim() : null, ms: Math.round(performance.now() - t), messagesInDom: L.querySelectorAll('.msg').length, listNodes: nodes() };
}

// ---------- verdicts (budgets) ----------
const B = { openMs: 1500, openNodes: 4500, peakNodes: 9000, jumps: 2, drift: 2, replyTaskMs: 900, worstKeyMs: 120 };
out.budget = B;
if (out.open.ms > B.openMs) bad(`opening took ${out.open.ms} ms (> ${B.openMs})`);
if (out.open.listNodes > B.openNodes) bad(`open: ${out.open.listNodes} DOM nodes in the list (> ${B.openNodes})`);
if (!out.open.atEnd) bad('the chat did not open at its end');
if (out.scrollUp.peakListNodes > B.peakNodes) bad(`scrolling up peaked at ${out.scrollUp.peakListNodes} nodes (> ${B.peakNodes})`);
if (!out.scrollUp.reachedFirst) bad('scrolling up never reached message #1');
if (out.scrollUp.jumps > B.jumps) bad(`${out.scrollUp.jumps} content jumps while scrolling up (${out.scrollUp.worstJumps.join(', ')} px)`);
if (typeof out.scrollUp.settleDrift !== 'number' || Math.abs(out.scrollUp.settleDrift) > B.drift) bad(`the content moved ${out.scrollUp.settleDrift} px after the wheel stopped`);
if (out.rest.msg4InDom) bad('message #4 still in the DOM back at the end (woken blocks should rest again)');
if (out.rest.listNodesBackAtEnd > openNodes * 1.6 + 400) bad(`back at the end: ${out.rest.listNodesBackAtEnd} nodes (opened with ${openNodes})`);
if (!out.find.found || !out.find.onScreen) bad(`find: ${JSON.stringify(out.find)}`);
if (out.reply.taskMs > B.replyTaskMs) bad(`a reply in the long chat: ${out.reply.taskMs} ms of main-thread tasks (> ${B.replyTaskMs})`);
if (out.reply.messagesAdded > 4) bad(`a reply re-added ${out.reply.messagesAdded} messages`);
if (out.typing40.worstKeyMs > B.worstKeyMs) bad(`slowest key ${out.typing40.worstKeyMs} ms (> ${B.worstKeyMs})`);
if (!out.showAll.line || !/resting/i.test(out.showAll.line) || out.showAll.messagesInDom < N - 5) bad(`show all: ${JSON.stringify(out.showAll)}`);
// (the made-up chats go: nothing left behind in the app copy's list)
Native.open(claude.id, small.id); await wait(300);
out.pass = window.CW_REPORT ? true : out.problems.length === 0;
return JSON.stringify(out, null, 1);
