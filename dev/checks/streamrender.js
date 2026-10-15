// Streaming and long chats under load (round 35, streamrender): a ≈ 100 KB reply (fake engine "huge": long Markdown,
// big highlighted code blocks, long tables and lists, pictures that load late) and a 1,200-message chat, driven with
// real input (CDP) under a timeline trace (dev/trace-stats.js), in the owner's look:
//   stream-follow  the reply streaming while you watch it (the chat follows it)
//   stream-type    typing in the composer while it streams
//   stream-up      you scroll up a little while it streams: it must stop following and nothing may move under you
//   stream-back    the ↓ button: it follows again
//   stream-end     the rest of the reply, the end of the reply (the finished message replaces the live one) and its
//                  pictures settling
//   bench          the finished reply painted again ≈ 250 characters at a time, each paint timed with the style and
//                  layout it causes: the starting code's way (copied in here) against the live renderer, interleaved
//                  (frame-free, so it holds on a busy machine)
//   open-long      opening the 1,200-message chat · scroll-long  wheeling up through it (earlier messages come in)
//   find / jump / select   find in chat, jump to message #3 (recall's jump), selecting text in an old message
// Reports per stretch: main-thread busy ms, frames over 4.2 / 8.3 ms, tasks over 4.2 ms and the longest, style /
// layout work, input latency; Markdown characters parsed while streaming (vs the reply's length); how far the chat
// drifted under you; DOM nodes and JS heap. With the incremental renderer it also streams a corpus of tricky Markdown
// in random pieces and compares the live HTML with a full render (Native._test.streamCorpus): any difference fails.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/streamrender.js
const { wait, until } = M;
const out = {};
const fails = [];
// what other parts of the app add to a reply's HTML, left out when it's compared with a full render: cmdbar.js marks
// the code it checked, juice.js turns a pointed-at title into data-tip, pictures already seen hold their size
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i += 1; return `at ${i}: …${a.slice(Math.max(0, i - 80), i + 80)}… vs …${b.slice(Math.max(0, i - 80), i + 80)}…`; };
const clean = (h) => h.replace(/ data-cmdchk="1"/g, '').replace(/ data-dd-out="1"( draggable="true")?/g, '').replace(/ style="width: \d+px; aspect-ratio: [^"]*"/g, '').replace(/ (title|data-tip)="[^"]*"/g, '');
const claude = H.claudeAgent();
const cdp = (method, params) => smoke({ cdp: method, params });
const KEYS = { Escape: [27, 'Escape'], Backspace: [8, 'Backspace'], End: [35, 'End'] };
async function key(k) {
  const special = KEYS[k];
  const p = special ? { key: k, code: special[1], windowsVirtualKeyCode: special[0] } : { key: k, code: /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : '', windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), text: k };
  await cdp('Input.dispatchKeyEvent', { type: special ? 'rawKeyDown' : 'keyDown', ...p });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
}
const wheel = (x, y, dy) => cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const click = async (x, y) => { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const memory = async () => {
  await cdp('HeapProfiler.collectGarbage', {});
  const h = await cdp('Runtime.getHeapUsage', {}); const d = await cdp('Memory.getDOMCounters', {});
  return `heap ${(h.usedSize / 1048576).toFixed(1)} MB · nodes ${d.nodes} · listeners ${d.jsEventListeners}`;
};

H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);
activate(claude.id); await wait(400);

// ---- 0. the live HTML equals a full render, on a corpus of tricky Markdown streamed in random pieces ----
if (Native._test?.streamCorpus) {
  const { docs } = JSON.parse(await hub.fs.read(`${SMOKE_DEV}/streamrender-corpus.json`));
  const r = Native._test.streamCorpus({ docs, runs: 6 });
  out.equal = `${r.docs} documents × ${r.runs} random streams (${r.steps} live paints): ${r.diffs.length ? `${r.diffs.length} DIFFERENT` : 'identical to the full render'}`;
  if (r.diffs.length) { fails.push(`live ≠ full: ${r.diffs.slice(0, 3).join(' | ')}`); out.equalDiffs = r.diffs.slice(0, 5); }
} else out.equal = '(no Native._test.streamCorpus: the starting code)';

// ---- Markdown work while streaming: characters parsed live (the starting code: renderMarkdownLive) ----
let liveChars = 0;
if (window.renderMarkdownLive && !window.Md?.liveStats) { const orig = window.renderMarkdownLive; window.renderMarkdownLive = (s) => { liveChars += s.length; return orig(s); }; }
const parsedLive = () => (window.Md?.liveStats ? Md.liveStats().chars : liveChars);
const hlLive = () => (window.Md?.liveStats ? Md.liveStats().hlChars : null);

const segs = [];
const seg = async (name, fn) => { performance.mark(`hz240:${name}`); segs.push(name); try { await fn(); } catch (err) { out[`${name}Error`] = String(err.stack || err.message || err).slice(0, 300); } await settle(); };

// ---- the long chat (1,200 messages: text, lists, code, tables, pictures), saved before the trace ----
const para = (i) => {
  const kind = i % 12;
  const base = `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com)${i === 17 ? ' and the word zanzibarite to find' : ''}.\n\n- one\n- two\n\nAnother paragraph of plain words to give it some height, about the scene ${i}.`;
  if (kind === 1) return `${base}\n\n\`\`\`js\nconst x${i} = ${i};\n/* note */\nconsole.log(x${i}, "s");\n\`\`\``;
  if (kind === 5) return `${base}\n\n| a | b |\n| --- | ---: |\n| ${i} | ${i * 2} |\n| x | y |`;
  if (kind === 9) return `${base}\n\n![shot ${i}](https://img.hearth.test/480x270/${i}.png)`;
  return base;
};
const at0 = Date.now() - 2e7;
const long = { id: `sr-long-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title: 'SR long chat', createdAt: at0, updatedAt: at0, messages: Array.from({ length: 1200 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part?`, at: at0 + i * 1000 })) };
await window.hub.saveChat(long); Native.save(long);
await wait(600);

await smoke({ trace: 'start', detail: true });
const t0 = performance.now();

// ---- 1. a huge reply streaming in a fresh chat ----
Native.newChat(claude.id); await settle();
const v = Native.view(claude.id);
let list = v.list; // (round 45, chatswitch: each chat has its own list; taken again after a switch)
const [lx, ly] = mid(list);
const gapNow = () => list.scrollHeight - list.scrollTop - list.clientHeight;
// what you see: the gap to the bottom as each frame is drawn (a ResizeObserver runs after the frame's scripts and layout)
const watchGap = () => { let worst = 0; const ro = new ResizeObserver(() => { worst = Math.max(worst, gapNow()); }); for (const n of list.children) ro.observe(n); const mo = new MutationObserver((rs) => { for (const r of rs) for (const n of r.addedNodes) if (n.nodeType === 1) ro.observe(n); }); mo.observe(list, { childList: true }); const body = list.querySelector('.msg.streaming .body'); if (body) ro.observe(body); return () => { ro.disconnect(); mo.disconnect(); return Math.round(worst); }; };
const scrollSettled = async () => { let last = -1; let same = 0; while (same < 8) { await new Promise((r) => requestAnimationFrame(r)); if (Math.abs(list.scrollTop - last) < 0.5) same += 1; else same = 0; last = list.scrollTop; } };
let reply = null; let replyChars = 0;
const sent = performance.now();
// DOM changes while the reply streams (whole document)
let muts = 0; const mo = new MutationObserver((rs) => { muts += rs.length; });
mo.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
const parsed0 = parsedLive(); const hl0 = hlLive();
await seg('stream-follow', async () => {
  Native.sendText(claude.id, 'huge-160k');
  await until(() => list.querySelector('.msg.streaming .body')?.textContent.length > 200, 15000);
  // following: as each frame is drawn the bottom of the reply is in view
  const stop = watchGap(); await wait(5000);
  out.followGapWorstPx = stop();
});
await seg('stream-type', async () => {
  v.input.focus(); await settle();
  for (const c of 'make the rings bigger ') { await key(c); await wait(4); }
});
(() => { v.input.value = ''; v.input.dispatchEvent(new Event('input', { bubbles: true })); })();
await seg('stream-up', async () => {
  for (let i = 0; i < 4; i++) { await wheel(lx, ly, -240); await wait(30); }
  await scrollSettled();
  // what's at the top of the chat now must stay where it is while the reply keeps growing below
  const top = list.getBoundingClientRect().top;
  const anchor = [...list.querySelectorAll('.msg.streaming .body > *, .messages > .msg')].find((n) => n.getBoundingClientRect().bottom > top + 40);
  const y0 = anchor?.getBoundingClientRect().top; const s0 = list.scrollTop; let drift = 0; let pulled = false;
  const tEnd = performance.now() + 4000;
  while (performance.now() < tEnd) {
    await new Promise((r) => requestAnimationFrame(r));
    if (anchor) drift = Math.max(drift, Math.abs(anchor.getBoundingClientRect().top - y0));
    if (gapNow() < 20) pulled = true;
  }
  out.scrolledUp = `drift ${Math.round(drift)} px · scrollTop ${Math.round(s0)} → ${Math.round(list.scrollTop)} · pulled to the bottom: ${pulled} · following: ${v.follow !== false}`;
  if (pulled || v.follow !== false) fails.push(`scrolled up while streaming: ${out.scrolledUp}`);
  if (drift > 2) fails.push(`the chat moved under you while you read above the reply (${Math.round(drift)} px)`);
});
await seg('stream-back', async () => {
  if (!v.jump.hidden) await click(...mid(v.jump)); else { list.scrollTop = list.scrollHeight; }
  await wait(500);
  const stop = watchGap(); await wait(1500);
  out.backGapPx = stop();
  if (out.backGapPx > 40) fails.push(`↓ didn't keep the reply in view (gap up to ${out.backGapPx} px)`);
});
// the live reply painted with all its text so far equals a full render of that text (twice, half a second apart)
await seg('check-live', async () => {
  if (!Native._test?.livePaint) { out.liveEqual = '(the starting code)'; return; }
  if (!Native.isBusy(H.activeChat[claude.id])) { out.liveEqual = '(the reply had ended)'; return; }
  const res = [];
  for (let i = 0; i < 2; i++) {
    const r = Native._test.livePaint(H.activeChat[claude.id]); if (!r) break;
    const t = document.createElement('template'); t.innerHTML = window.renderMarkdownLive(r.text); t.innerHTML = clean(t.innerHTML);
    // (pictures already seen hold their size; cmdbar.js marks the code it checked for commands)
    const html = clean(r.html);
    res.push(`${r.text.length} characters: ${html === t.innerHTML ? 'identical' : 'DIFFERENT'}`);
    if (html !== t.innerHTML) fails.push(`the live reply differs from a full render at ${r.text.length} characters ${firstDiff(html, t.innerHTML)}`);
    await wait(500);
  }
  out.liveEqual = res.join(' · ');
});
await seg('stream-end', async () => {
  const chatId = H.activeChat[claude.id];
  const stop = watchGap(); // the rest of the reply and its end: the chat must stay at its bottom (pictures too)
  await until(() => !Native.isBusy(chatId), 240000);
  out.streamMs = Math.round(performance.now() - sent);
  mo.disconnect(); out.streamMutations = `${muts.toLocaleString()} DOM changes (${Math.round(muts / (out.streamMs / 1000))}/s)`;
  reply = (await Native.load(chatId))?.messages.at(-1);
  replyChars = reply?.text.length || 0;
  await wait(2500); // the finished message replaces the live one, its pictures load again
  out.endGapWorstPx = stop();
});
// the finished reply (the live node, kept: native.js messageEl `live`) equals the same message drawn from scratch
await seg('end-equal', async () => {
  const lastBody = () => [...list.querySelectorAll(':scope > .msg.assistant > .body')].pop();
  const a = lastBody(); const kept = clean(a?.innerHTML || '');
  await Native.refresh(claude.id); await settle(); await wait(300);
  const b = lastBody();
  out.endEqual = `${b !== a ? 'redrawn' : 'NOT redrawn'}: ${clean(b?.innerHTML || '') === kept ? 'identical to the finished reply' : 'DIFFERENT'}`;
  if (b === a || clean(b?.innerHTML || '') !== kept) fails.push(`finished reply vs drawn from scratch: ${out.endEqual} ${firstDiff(kept, clean(b?.innerHTML || ''))}`);
});
out.reply = `${replyChars.toLocaleString()} characters, ${out.streamMs} ms`;
out.parsedLive = `${(parsedLive() - parsed0).toLocaleString()} characters of Markdown parsed while streaming (${replyChars ? ((parsedLive() - parsed0) / replyChars).toFixed(1) : '?'}× the reply)${hl0 != null ? ` · highlighted ${(hlLive() - hl0).toLocaleString()}` : ''}`;
out.memAfterStream = await memory();

// ---- 1b. per paint, timed in the page: the finished reply's text painted again into a live reply at the end of the
// chat, ≈ 250 characters at a time (one paint's worth at a model's pace), each paint followed by the style and layout
// it causes (read synchronously): the way of the starting code (copied below, round 16-21) against Native's live
// renderer, interleaved (old, new, new, old) so the machine's load hits both alike. Not frame-bound, so it holds on a
// busy machine where frame timings don't.
// The starting code's paintBody (native.js before round 35), verbatim apart from names:
function oldPatch(body, html, start = 0) {
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  const next = [...tpl.content.childNodes]; const cur = body.childNodes;
  let i = 0;
  while (start + i < cur.length && i < next.length && cur[start + i].isEqualNode(next[i])) i += 1;
  while (cur.length > start + i) body.lastChild.remove();
  body.append(...next.slice(i));
  return next.length;
}
function oldPaint(p, body, text) {
  const FENCE = /^\s*```/gm; const mdLive = window.renderMarkdownLive;
  let st = p.md;
  if (!st || st.body !== body || !text.startsWith(st.src)) { st = p.md = { body, src: '', count: 0 }; body.replaceChildren(); }
  let cut = text.lastIndexOf('\n\n');
  for (let tries = 0; tries < 2 && cut > st.src.length; tries += 1) {
    const seg = text.slice(st.src.length, cut); const fences = [...seg.matchAll(FENCE)];
    if (fences.length % 2 === 0 && (seg.split('$$').length - 1) % 2 === 0) { st.count += oldPatch(body, mdLive(seg), st.count); st.src = text.slice(0, cut); break; }
    cut = fences.length % 2 ? text.lastIndexOf('\n\n', st.src.length + fences.at(-1).index) : -1;
  }
  const tail = text.slice(st.src.length);
  oldPatch(body, tail.trim() ? mdLive(tail) : '', st.count);
}
async function bench(text, paint, step = 250) {
  const node = el('div', { class: 'msg assistant streaming' }, el('div', { class: 'body' }));
  const body = node.firstChild; list.append(node);
  const p = { md: null }; const ms = []; let muts = 0;
  const mo = new MutationObserver((rs) => { muts += rs.length; }); mo.observe(body, { subtree: true, childList: true, attributes: true, characterData: true });
  for (let at = step; at < text.length + step; at += step) {
    const t = performance.now();
    paint(p, body, text.slice(0, Math.min(at, text.length)));
    void list.scrollHeight; // the style + layout this paint causes
    ms.push(performance.now() - t);
    if (ms.length % 20 === 0) await wait(0);
  }
  mo.disconnect(); node.remove();
  ms.sort((a, b) => a - b);
  const sum = ms.reduce((a, b) => a + b, 0);
  return { paints: ms.length, sum, p50: ms[Math.floor(ms.length / 2)], p95: ms[Math.floor(ms.length * 0.95)], max: ms.at(-1), muts };
}
await seg('bench', async () => {
  if (!reply?.text) return;
  Native.newChat(claude.id); await settle(); list = v.list;
  const runs = { old: [], new: [] };
  const order = Native._test?.paintBody ? ['old', 'new', 'new', 'old'] : ['old', 'old'];
  for (const k of order) runs[k].push(await bench(reply.text, k === 'old' ? oldPaint : Native._test.paintBody));
  const fmt = (rs) => { if (!rs.length) return null; const m = (f) => (rs.reduce((a, r) => a + r[f], 0) / rs.length); return `${rs[0].paints} paints: ${Math.round(m('sum'))} ms in all · per paint p50 ${m('p50').toFixed(2)} p95 ${m('p95').toFixed(2)} max ${m('max').toFixed(1)} ms · ${Math.round(m('muts')).toLocaleString()} DOM changes`; };
  out.benchOld = fmt(runs.old);
  out.benchNew = fmt(runs.new) || '(the starting code)';
});

// ---- 2. the long chat ----
await seg('open-long', async () => {
  const t = performance.now();
  Native.open(claude.id, long.id);
  await until(() => (list = v.list).querySelector('.msg[data-index="1199"]'), 15000);
  await settle();
  out.openLongMs = Math.round(performance.now() - t);
});
await wait(800);
await seg('scroll-long', async () => {
  // a long wheel up through the chat: earlier messages come in as you reach them
  for (let i = 0; i < 160; i++) { await wheel(lx, ly, -600); await wait(16); }
  await wait(500);
  out.longShown = list.querySelectorAll('.msg').length;
});
await seg('jump', async () => {
  // like recall's jump (recall.js): asks again until the message is drawn
  let ok = false;
  for (let i = 0; i < 30 && !ok; i++) { ok = Native.jumpTo(claude.id, 2); if (!ok) await wait(100); }
  await settle(); await wait(200);
  const n = list.querySelector('.msg[data-index="2"]'); const r = n?.getBoundingClientRect(); const lr = list.getBoundingClientRect();
  out.jump = `${ok} · in view: ${Boolean(r && r.bottom > lr.top && r.top < lr.bottom)}`;
  if (!(r && r.bottom > lr.top && r.top < lr.bottom)) fails.push(`jump to message #3: not in view (${out.jump})`);
});
await seg('find', async () => {
  if (typeof ChatUX === 'undefined') { out.find = 'no ChatUX'; return; }
  const f = ChatUX.find(claude.id, 'zanzibarite'); await settle(); await wait(200);
  const hit = list.querySelector('mark.cur, .find-hit.cur, .cur'); const r = hit?.getBoundingClientRect(); const lr = list.getBoundingClientRect();
  out.find = `${f?.hits?.length ?? 0} found · in view: ${Boolean(r && r.bottom > lr.top && r.top < lr.bottom)}`;
  if (!f?.hits?.length || !(r && r.bottom > lr.top && r.top < lr.bottom)) fails.push(`find in chat: ${out.find}`);
  ChatUX.closeFind(claude.id);
});
await seg('select', async () => {
  const n = list.querySelector('.msg[data-index="3"] .body');
  n?.scrollIntoView({ block: 'center' }); await settle();
  const r = document.createRange(); r.selectNodeContents(n); getSelection().removeAllRanges(); getSelection().addRange(r);
  const t = String(getSelection());
  out.select = `${t.length} characters selected · has the reply: ${t.includes('Reply 3: here is some text')}`;
  if (!t.includes('Reply 3: here is some text')) fails.push(`selecting an old message: ${out.select}`);
  getSelection().removeAllRanges();
});
await seg('idle-after', () => wait(1000));
performance.mark('hz240:end');
await settle();
const tr = await smoke({ trace: 'stop', detail: true });
out.memAfterLong = await memory();
const dd = tr.detail || {};
out.ms = Math.round(performance.now() - t0);
out.all = `busy ${dd.tasks?.busyMs} ms · tasks>4.2ms ${dd.tasks?.over4} (>8.3 ${dd.tasks?.over8}, >50 ${dd.tasks?.over50}, max ${dd.tasks?.maxMs}) · frames ${dd.frames?.n} over4.2 ${dd.frames?.over4} over8.3 ${dd.frames?.over8} p95 ${dd.frames?.p95} · forced ${dd.forced?.n}/${dd.forced?.ms}ms · style ${dd.style?.n}× ${dd.style?.elements}el ${dd.style?.ms}ms · layout ${dd.layout?.n}× ${dd.layout?.objects}obj ${dd.layout?.ms}ms`;
const line = (s) => `busy ${s.busyMs} ms · in ${s.inputs} lat p95 ${s.latency.p95} · work p95 ${s.work.p95} max ${s.work.max} · frames ${s.frames.n} >4.2 ${s.frames.over4} >8.3 ${s.frames.over8} worst ${s.frames.worst} · tasks>4.2 ${s.longTasks.over4} max ${s.longTasks.max} · style ${s.style.n}×${s.style.elements}el ${s.style.ms}ms · layout ${s.layout.n}×${s.layout.objects}obj ${s.layout.ms}ms · forced ${s.forced.n}/${s.forced.ms}ms`;
out.segments = {};
for (const n of segs) { const s = dd.segments?.[n]; if (!s) continue; out.segments[n] = line(s); out.segments[`${n} time`] = `${s.phases} · scripts: ${s.scripts.join(' | ')}`; if (s.forced.n) out.segments[`${n} forced`] = s.forced.top.join(' | '); }
const broken = Object.keys(out).filter((k) => k.endsWith('Error'));
for (const k of broken) fails.push(`${k}: ${out[k]}`);
if (!replyChars || replyChars < 50000) fails.push(`the huge reply didn't arrive whole (${replyChars} characters)`);
out.ok = !fails.length;
if (fails.length) out.fails = fails;
return JSON.stringify(out, null, 1);
