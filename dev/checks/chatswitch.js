// Switching chats feels instant (round 45, chatswitch): chats opened from the chats list with real input (CDP: the
// pointer comes over the row, rests a moment like a hand does, then clicks), in the Forgeheart look, with the Lab
// loaded. Per switch, in-page: click → the chat's messages on screen (the end of the frame that shows them), → at the
// right place (its end), → the message box ready (focused, its draft in); and from the timeline trace: the main-thread
// work of the click (input → its frame), all work in the next 700 ms (idle slices included), the longest task,
// elements styled, objects laid out. Kinds: a short chat, a long one (1,000 messages), one with code and pictures —
// each first opened (nothing of it in memory), then switched back to (recent); the Lab → a chat → the Lab.
// Then: memory (DOM nodes, JS heap after GC, what the kept chats hold) and what must still be right after the
// switches (the chat shown is the one clicked, at its end, its draft back, find / jump / ↑ Show earlier work).
// Fails above the budgets (BUDGET below; window.CS_REPORT = 1 reports without failing; window.CS_DETAIL = 1 prints where
// the time went in every switch). Timings use the main thread's own CPU time (dev/trace-stats.js workFg / at marks):
// on this shared machine wall time stretches 5–20× with the load.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/chatswitch.js
const { wait, until } = M;
const out = { budgets: {}, numbers: {}, problems: [] };
const fail = (m) => out.problems.push(m);
const r1 = (x) => Math.round(x * 10) / 10;
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? r1(s[Math.floor((s.length - 1) / 2)]) : null; };
const max = (a) => { const s = a.filter((x) => x != null); return s.length ? r1(Math.max(...s)) : null; };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(5000)]);
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1, ...extra });
const mid = (n) => { const r = n.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 80), r.top + r.height / 2]; };
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const settle = async () => { await frame(); await frame(); await wait(30); };
const mark = (n) => performance.mark(`hz240:${n}`);
// the window idle (the Lab's own warm-up done): idle callbacks with their whole 50 ms several times in a row
const quiet = async (max = 20000) => { const t = performance.now(); let calm = 0; while (performance.now() - t < max && calm < 6) { const left = await new Promise((r) => requestIdleCallback((d) => r(d.timeRemaining()), { timeout: 1000 })); calm = left > 40 ? calm + 1 : 0; await wait(20); } return Math.round(performance.now() - t); };
// Xvfb + software GL on shared CPUs: frame timings move 2–5× with the load. The budgets are on the work the switch
// itself does (main-thread ms of the click, in-page time to the first frame of the chat) with room for the load.
// (round 45) This machine is shared (load 20–30 while it was written, software GL): wall times stretch 5–20×, and even
// CPU time grows several-fold. The budgets that fail are the switch's own work in units the load doesn't change
// (elements styled, objects laid out, the chat's own script CPU) plus CPU time to the first paint with wide room.
const BUDGET = window.CS_BUDGET || {
  recentStyled: 400, // a recent chat (switched back to): elements styled in the switch, median (before: 626, the code chat 6,183)
  recentLaidOut: 300, // … objects laid out, median (before: 612, the code chat 8,811)
  recentStyledMax: 800, // … the worst kind (before: the code chat, 6,183 styled / 8,811 laid out)
  recentChatJsMs: 8, // … the chat's own scripts (native.js, panel.js, md.js) CPU, median (before: 11.5, the code chat 46)
  recentPaintMs: 60, // … click → its messages on screen, main-thread CPU (input, frames), median
  longFirstPaintMs: 100, // a long chat (1,000 messages) opened the first time: click → its messages on screen, main-thread CPU
  firstPaintMs: 150, // any chat opened the first time: click → messages on screen, CPU, worst (before: 213 for the code chat)
  firstLongestTaskMs: 150, // … the longest main-thread task (CPU) in a first open, idle slices after it included
  labChatJsMs: 4, // the Lab ↔ a chat: the chat's own scripts in the switch, CPU, median
  keptNodes: 20000, // elements in the kept (parked) chat lists, all chat windows together (native.js PANE_NODES)
  heapMB: 40, // JS heap after GC once everything ran
};
out.budgets = BUDGET;
const n = out.numbers;

// ---------- the owner's look, the Lab loaded, the chats ----------
await until(() => H.config && H.claudeAgent?.() && typeof AppUI !== 'undefined', 60000); // (a busy machine: the start can be slow)
H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);
const claude = H.claudeAgent();
activate('tool:three'); await wait(400);
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director, 20000);
await wait(1500);

const at0 = Date.now() - 86400000;
const para = (i) => `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com), and a few more words so it wraps over a line or two like a real answer does.\n\n- one point about ${i}\n- another, *slightly* longer point\n\n${i % 10 === 1 ? '```js\nconst x = 1;\nfor (let k = 0; k < 4; k++) console.log(x + k);\n```' : 'Another paragraph of plain words to give it some height.'}`;
const codeReply = (i) => `Here's the scene ${i}:\n\n\`\`\`js\n${Array.from({ length: 36 }, (_, k) => `  const v${k} = new THREE.Vector3(${k}, ${i % 7}, ${k * 2}); // point ${k}\n  mesh${k % 3}.position.add(v${k}.multiplyScalar(0.${(k % 9) + 1}));`).join('\n')}\n\`\`\`\n\n![frame ${i}](https://img.hearth.test/640x360/cs${i}.png)\n\n| a | b |\n|---|---|\n| ${i} | ${i * 2} |\n| x | y |`;
const mk = async (key, title, count, reply) => {
  const c = { id: `cs-${key}-${Math.random().toString(36).slice(2, 6)}`, agentId: claude.id, title, createdAt: at0, updatedAt: at0 + count * 1000, messages: Array.from({ length: count }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? reply(i) : `Question ${i}: what about this part of it?`, at: at0 + i * 1000 })) };
  await window.hub.saveChat(c);
  const summary = { id: c.id, agentId: c.agentId, title: c.title, updatedAt: c.updatedAt, pinned: false };
  H.chats = [summary, ...H.chats.filter((x) => x.id !== c.id)];
  return c;
};
// saved to disk and listed only: nothing of them is in the window's memory yet (a first open reads them like a real one)
const C = {
  start: await mk('start', 'CS start chat', 30, para),
  short: await mk('short', 'CS short chat', 6, para),
  long: await mk('long', 'CS long chat', 1000, para),
  rich: await mk('rich', 'CS code and pictures', 60, codeReply),
  rested: await mk('rested', 'CS rested on first', 60, codeReply), // (opened after the pointer rested on it: made ready ahead)
};
if (!H.panelOpen) { H.panelOpen = true; applyLayout(); }
Panel.render(); await settle();
activate(claude.id); await wait(300);
Native.open(claude.id, C.start.id);
await until(() => Native.view(claude.id)?.list.querySelector('.msg[data-index="29"]'), 10000);
await wait(1200);
n.quietMs = await quiet();
// a draft left in the short chat comes back when you return to it
store.set(`draft.${claude.id}.${C.short.id}`, 'half-written thought');

// ---------- the probe: one switch, from the click to the chat ready ----------
const rowOf = (id) => document.querySelector(`#chat-groups .item[data-key="${CSS.escape(id)}"]`);
let armed = null;
addEventListener('pointerdown', (e) => { if (armed && e.isTrusted && !armed.t0) armed.t0 = e.timeStamp; }, true);
const post = (fn) => { const ch = new MessageChannel(); ch.port1.onmessage = fn; ch.port2.postMessage(0); };
function watch(chat, { draft } = {}) {
  const r = { t0: 0, paint: null, place: null, ready: null, full: null };
  armed = r;
  const v = Native.view(claude.id);
  const last = chat.messages.length - 1;
  const first = chat.messages.length > 50 ? chat.messages.length - 40 : 0; // (the window a chat opens on)
  const at = (k) => { r[k] = performance.now() - r.t0; performance.mark(`at:${k}`); };
  let frames = 0;
  return new Promise((resolve) => {
    const tick = () => post(() => { // after the frame's rendering: what this frame showed
      frames += 1;
      const shown = r.t0 && v.root.classList.contains('active') && v.title.textContent.endsWith(chat.title) && v.list.querySelector(`.msg[data-index="${last}"]`)?.isConnected;
      if (shown && r.paint == null) at('paint');
      if (shown && r.place == null && v.list.scrollHeight - v.list.scrollTop - v.list.clientHeight < 4) at('place');
      if (shown && r.ready == null && document.activeElement === v.input && !v.input.disabled && (!draft || v.input.value === draft)) at('ready');
      if (shown && r.full == null && v.list.querySelector(`.msg[data-index="${first}"]`)) at('full');
      if ((r.paint != null && r.place != null && r.ready != null && r.full != null) || frames > 400) { armed = null; resolve(r); return; }
      requestAnimationFrame(tick);
    });
    requestAnimationFrame(tick);
  });
}
async function switchTo(key, label, opts = {}) {
  const chat = C[key];
  const row = rowOf(chat.id);
  if (!row) { fail(`${label}: no row for ${chat.title} in the chats list`); return null; }
  row.scrollIntoView({ block: 'nearest' }); await settle();
  const [x, y] = mid(row);
  await mouse('mouseMoved', 4, 4);
  await quiet(4000);
  await mouse('mouseMoved', x - 30, y); await wait(16); await mouse('mouseMoved', x, y);
  await wait(opts.hover ?? 140); // a hand rests on the row a moment before it clicks
  mark(label);
  const p = watch(chat, opts);
  await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y);
  const r = await p;
  await wait(700); // idle slices after the switch count in its stretch
  return r;
}
async function railTo(id, label) {
  const b = document.querySelector(`#agent-buttons .agent-btn[data-id="${CSS.escape(id)}"]`);
  if (!b) { fail(`no rail button for ${id}`); return null; }
  const [x, y] = mid(b);
  await mouse('mouseMoved', x, y); await wait(120);
  mark(label);
  const t = { t0: 0, shown: null };
  armed = t;
  const s = H.surfaces.get(id);
  await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y);
  await new Promise((resolve) => { let f = 0; const tick = () => post(() => { f += 1; if (t.t0 && s.el.classList.contains('active') && t.shown == null) { t.shown = performance.now() - t.t0; performance.mark('at:shown'); } if (t.shown != null || f > 300) { armed = null; resolve(); } else requestAnimationFrame(tick); }); requestAnimationFrame(tick); });
  await wait(600);
  return t;
}

// a first click on the list (its first use wakes a few things up: tips, glints), then quiet
{ const r = rowOf(C.start.id); r?.scrollIntoView({ block: 'nearest' }); await settle(); if (r) { const [x, y] = mid(r); await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); } await wait(800); await quiet(6000); }
await cdp('HeapProfiler.collectGarbage');
const heap0 = performance.memory?.usedJSHeapSize || 0;
await smoke({ trace: 'start', detail: true });
const runs = [];
const go = async (key, kind, opts) => { const label = `${kind}-${key}-${runs.length}`; const r = await switchTo(key, label, opts); if (r) runs.push({ key, kind, label, ...r }); };
// first opens (nothing in memory), then back to each (recent), a few rounds
await go('short', 'first', { draft: 'half-written thought' });
await go('long', 'first');
await go('rich', 'first');
await go('rested', 'rested', { hover: 900 }); // the pointer rests on its row a while first (prefetch's case)
for (let k = 0; k < 2; k++) {
  await go('short', 'recent', { draft: 'half-written thought' });
  await go('long', 'recent');
  await go('rich', 'recent');
}
// the Lab and back (the chat on screen in the Claude surface stays the rich one)
const labRuns = [];
for (let k = 0; k < 3; k++) {
  const a = await railTo('tool:three', `to-lab-${k}`);
  const b = await railTo(claude.id, `to-chat-${k}`);
  labRuns.push({ toLab: a?.shown, toChat: b?.shown, k });
}
mark('end');
await settle();
const tr = await smoke({ trace: 'stop', detail: true });
const S = (name) => tr.detail?.segments?.[name] || {};

// ---------- numbers ----------
// Wall times (in-page and from the trace) stretch with the machine's load; the main thread's own CPU time (the trace's
// thread durations) is what the work costs. "Click work" / "to paint" / "to all" count the input, frame and rendering
// tasks from the click on (not other features' timers / idle callbacks that ran in between: the Lab's, here); "in
// all" is every task in the 700 ms after. Budgets are on CPU time, wall times are reported next to them.
for (const r of runs) {
  const s = S(r.label);
  const fileMs = (f) => s.filesCpu?.[f] || 0;
  Object.assign(r, { work: s.workFg?.max ?? null, workWall: s.work?.max ?? null, paintCpu: s.at?.paint?.fgMs ?? null, fullCpu: s.at?.full?.fgMs ?? null, chatJs: r1(fileMs('native.js') + fileMs('panel.js') + fileMs('md.js')), cpu: s.cpuMs ?? null, longest: s.longestCpu ?? null, style: s.style?.elements ?? null, layout: s.layout?.objects ?? null });
}
const pick = (kind, key) => runs.filter((r) => r.kind === kind && (!key || r.key === key));
const sum = (rs) => ({ chatJs: med(rs.map((r) => r.chatJs)), paint: med(rs.map((r) => r.paint)), place: med(rs.map((r) => r.place)), ready: med(rs.map((r) => r.ready)), full: med(rs.map((r) => r.full)), paintCpu: med(rs.map((r) => r.paintCpu)), fullCpu: med(rs.map((r) => r.fullCpu)), work: med(rs.map((r) => r.work)), workWall: med(rs.map((r) => r.workWall)), cpu: med(rs.map((r) => r.cpu)), longest: max(rs.map((r) => r.longest)), style: med(rs.map((r) => r.style)), layout: med(rs.map((r) => r.layout)) });
const line = (x) => `CPU: click work ${x.work} · to paint ${x.paintCpu} · to all ${x.fullCpu} · in all ${x.cpu} · longest task ${x.longest} · chat scripts ${x.chatJs} ms | wall: paint ${x.paint} · place ${x.place} · ready ${x.ready} · all ${x.full} · click work ${x.workWall} ms | styled ${x.style} · laid out ${x.layout}`;
n.switches = {};
for (const kind of ['first', 'recent']) for (const key of ['short', 'long', 'rich']) n.switches[`${kind} ${key}`] = line(sum(pick(kind, key)));
n.switches['first, rested on (code + pictures)'] = line(sum(pick('rested')));
n.recentAll = line(sum(pick('recent')));
const labSeg = (pre) => labRuns.map((x) => S(`${pre}-${x.k}`));
const labLine = (pre, wall) => { const ss = labSeg(pre); return `CPU: click work ${med(ss.map((s) => s.workFg?.max))} · to shown ${med(ss.map((s) => s.at?.shown?.fgMs))} · in all ${med(ss.map((s) => s.cpuMs))} ms | wall: shown ${med(wall)} · click work ${med(ss.map((s) => s.work?.max))} ms | styled ${med(ss.map((s) => s.style?.elements))} · laid out ${med(ss.map((s) => s.layout?.objects))}`; };
const labWork = (pre) => med(labSeg(pre).map((s) => s.workFg?.max ?? null));
n.labToChat = labLine('to-chat', labRuns.map((x) => x.toChat));
n.chatToLab = labLine('to-lab', labRuns.map((x) => x.toLab));
n.slowest = runs.slice().sort((a, b) => (b.work || 0) - (a.work || 0)).slice(0, 3).map((r) => `${r.label}: ${S(r.label).scripts?.slice(0, 3).join(' | ')} · ${S(r.label).phases}`);
// where the time goes in one of each (window.CS_DETAIL: every stretch)
const detailOf = (label) => { const s = S(label); return `${s.phases} · files ${JSON.stringify(s.files || {})} · scripts: ${(s.scripts || []).slice(0, 4).join(' | ')} · forced ${s.forced?.n}/${s.forced?.ms}ms: ${(s.forced?.top || []).slice(0, 3).join(' | ')}`; };
n.detail = Object.fromEntries((window.CS_DETAIL ? [...runs.map((r) => r.label), ...labRuns.flatMap((x) => [`to-lab-${x.k}`, `to-chat-${x.k}`])] : [runs.find((r) => r.kind === 'first' && r.key === 'long')?.label, runs.findLast((r) => r.kind === 'recent' && r.key === 'rich')?.label, runs.findLast((r) => r.kind === 'recent' && r.key === 'short')?.label, 'to-lab-2', 'to-chat-2']).filter(Boolean).map((l) => [l, detailOf(l)]));

// ---------- memory ----------
for (let i = 0; i < 3; i++) { await cdp('HeapProfiler.collectGarbage'); await wait(150); }
n.heapMB = r1((performance.memory?.usedJSHeapSize || 0) / 1048576);
n.heapGrowMB = r1(((performance.memory?.usedJSHeapSize || 0) - heap0) / 1048576);
n.domNodes = document.getElementsByTagName('*').length;
const kept = Native._test?.kept?.() || null; // (chatswitch) what the recent chats keep
n.kept = kept;
const keptNodes = kept ? kept.nodes : null;

// ---------- still right ----------
const v = Native.view(claude.id);
await go('short', 'check', { draft: 'half-written thought' });
const lastShort = runs.at(-1);
if (H.activeChat[claude.id] !== C.short.id) fail('the short chat should be the open one after clicking it');
if (v.input.value !== 'half-written thought') fail(`the short chat's draft should be back in the box (got ${JSON.stringify(v.input.value)})`);
if (!lastShort || lastShort.place == null) fail('the short chat should be shown at its end');
if (v.list.querySelectorAll('.msg[data-index]').length !== 6) fail(`the short chat should show its 6 messages only (shows ${v.list.querySelectorAll('.msg[data-index]').length})`);
v.input.value = ''; v.input.dispatchEvent(new Event('input'));
await go('long', 'check');
const shownLong = v.list.querySelectorAll('.msg[data-index]').length;
if (shownLong < 40 || shownLong > 60) fail(`the long chat opens on its last messages (shows ${shownLong})`);
if (v.list.querySelector('.msg[data-index]')?.dataset.index < 900) fail('the long chat should open near its end');
if (!v.list.querySelector('.rest-line')) fail('the long chat should say its earlier messages are resting (· Show all)'); // (round 72, chatwindow72)
// find, jump, Show earlier still work on a chat switched back to
if (typeof ChatUX !== 'undefined' && ChatUX.find) {
  ChatUX.find(claude.id, 'Reply 999'); await wait(400);
  if (!v.list.querySelector('mark, .find-hit, .hl-find')) n.findNote = 'no find mark seen (reported)';
  ChatUX.find?.(claude.id, ''); document.querySelector('.find-bar .find-x, .chat-find .x')?.click();
}
Native.jumpTo(claude.id, 3);
const inView = () => { const j = v.list.querySelector('.msg[data-index="3"]'); if (!j) return false; const lr = v.list.getBoundingClientRect(); const jr = j.getBoundingClientRect(); return jr.bottom > lr.top && jr.top < lr.bottom; };
await until(inView, 15000); await wait(800);
if (!inView()) fail('jumping to message #4 of the long chat should land on it (and stay there)');
await go('rich', 'check');
const imgs = [...v.list.querySelectorAll('img.md-img')];
if (!imgs.length) fail('the code + pictures chat should show its pictures');
if (!v.list.querySelector('pre .code-label')) fail('code blocks should keep their label after switching');
if (H.activeChat[claude.id] !== C.rich.id) fail('the rich chat should be open');
// the other chats aren't in this chat's list (kept ones are out of the way)
if (v.list.querySelector(`.msg[data-index="999"]`)) fail('the long chat\'s messages should not show in another chat');

// ---------- budgets ----------
const recent = sum(pick('recent'));
const firsts = pick('first');
const B = BUDGET;
const over = (name, val, lim) => { if (val == null || val > lim) fail(`${name}: ${val} (budget ${lim})`); };
over('recent chat: elements styled (median)', recent.style, B.recentStyled);
over('recent chat: objects laid out (median)', recent.layout, B.recentLaidOut);
over('recent chat: elements styled, worst kind', max(['short', 'long', 'rich'].map((k) => sum(pick('recent', k)).style)), B.recentStyledMax);
over('recent chat: the chat\'s own scripts, CPU ms (median)', recent.chatJs, B.recentChatJsMs);
over('recent chat: click → its messages on screen, CPU ms (median)', recent.paintCpu, B.recentPaintMs);
over('long chat first open: click → messages on screen, CPU ms', pick('first', 'long')[0]?.paintCpu, B.longFirstPaintMs);
over('first opens: click → messages on screen, CPU ms (worst)', max(firsts.map((r) => r.paintCpu)), B.firstPaintMs);
over('first opens: longest task, CPU ms', max(firsts.map((r) => r.longest)), B.firstLongestTaskMs);
over('the Lab ↔ a chat: the chat\'s own scripts, CPU ms (median)', med(['to-chat', 'to-lab'].flatMap((pre) => labSeg(pre).map((s) => (s.filesCpu?.['native.js'] || 0) + (s.filesCpu?.['panel.js'] || 0)))), B.labChatJsMs);
if (keptNodes != null) over('elements kept in parked chat lists', keptNodes, B.keptNodes);
over('JS heap after GC MB', n.heapMB, B.heapMB);
if (window.CS_REPORT) { out.reportOnly = out.problems; out.problems = []; }
out.ok = out.problems.length === 0;
return JSON.stringify(out, null, 1);
