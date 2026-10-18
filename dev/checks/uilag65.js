// (round 65, uilag65) "The app hangs a lot and is laggy when scrolling / clicking / hovering." The main window on a
// big profile (300 chats in the list, a 400-message chat with code / tables, a quest journal with its Paris pins, a Lab
// scene open in another tab), driven by real CDP input under one timeline trace (dev/trace-stats.js):
//   list        the chats list wheeled down and up
//   chat        the long chat wheeled up and down
//   hover-rail  the pointer gliding up and down the rail
//   hover-list  … over the chats list
//   hover-msgs  … over the messages
//   click       clicks between chats in the list and the two agents in the rail
//   qhud        the ✦ tracker chip clicked open / shut
//   quests      Sidequest Studio (the Paris map) opened, hovered, wheeled
//   sound       the Sound desk opened and hovered
//   after-*     the list / chat / hovers again after visiting the Studio and the Sound desk (features that stay
//               attached after their page is left show up here)
//   idle        3 s with nothing happening: timer fires
// Global listeners (window / document / body, by type, via CDP DOMDebugger) and live observers (Mutation / Resize /
// Intersection, via Runtime.queryObjects) are counted at the start and after visiting everything.
// Budgets: no main-thread task over 50 ms (CPU time) in a scroll / hover / click stretch, ≈ 0 forced style / layout
// per input, no capture-phase pointer / mouse / scroll listeners on window / document left behind by a page that was
// left, at most UL_BUDGET.globalHot hot global listeners, a modal dialog no longer restyling the hidden Lab / Studio /
// Sound desk (UL_BUDGET.modalStyledElements). window.UL_REPORT = 1 reports without failing.
//   node dev/smoke.js --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/uilag65.js
const { wait, until } = M;
const out = { numbers: {}, problems: [] };
const fail = (m) => out.problems.push(m);
// (its 8 s guard is cleared once answered: left running, each one fired later in the idle stretch)
const cdp = (method, params) => { let t; return Promise.race([smoke({ cdp: method, params }), new Promise((r) => { t = setTimeout(r, 8000); })]).finally(() => clearTimeout(t)); };
const claude = H.claudeAgent();
const tile = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src'); // (no network: map tiles fail at once)
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...tile, set(v) { if (String(v).startsWith('https://tile.openstreetmap.org/')) { queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } tile.set.call(this, v); } });
let inflight = []; let sent = 0;
const wheel = (x, y, dy) => { sent += 1; inflight.push(cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(x), y: Math.round(y), deltaX: 0, deltaY: dy })); };
const drain = async () => { const all = inflight; inflight = []; await Promise.race([Promise.all(all), wait(30000)]); };
const move = (x, y) => { sent += 1; return cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'none' }); };
const click = async (x, y) => { sent += 1; await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 }); };
const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
const mid = (n) => { const r = n.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 200), r.top + r.height / 2]; };
const vis = (n) => Boolean(n && n.isConnected && n.getClientRects().length);
const scrollerOf = (n) => { for (let e = n; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (/(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 4) return e; } return null; };
const notches = async (x, y, n, dy, gap = 10) => { for (let i = 0; i < n; i++) { wheel(x, y, dy); await wait(gap); } await drain(); };
// a pointer gliding over a column of things (top to bottom and back), one move every `gap` ms
const glide = async (x, y0, y1, n = 60, gap = 12) => { for (let i = 0; i < n; i++) { const t = (i % 30) / 29; const k = Math.floor(i / 30) % 2 ? 1 - t : t; move(x + (i % 3) * 3, y0 + (y1 - y0) * k); await wait(gap); } await wait(100); };

// ---------- counts: global listeners and live observers ----------
const HOT = /^(scroll|wheel|mousewheel|mousemove|mouseover|mouseout|mouseenter|mouseleave|pointermove|pointerover|pointerout|pointerenter|pointerleave|pointerdown|pointerup|mousedown|mouseup|click|resize|keydown|keyup|focusin|focusout)$/;
async function listeners() {
  const o = { total: 0, hot: 0, capture: 0, by: {} };
  for (const [name, expr] of [['window', 'window'], ['document', 'document'], ['body', 'document.body'], ['html', 'document.documentElement']]) {
    const ref = await cdp('Runtime.evaluate', { expression: expr, objectGroup: 'ul65' });
    const id = ref?.result?.objectId; if (!id) continue;
    const ls = (await cdp('DOMDebugger.getEventListeners', { objectId: id, depth: 0 }))?.listeners || [];
    for (const l of ls) {
      o.total++;
      if (!HOT.test(l.type)) continue;
      o.hot++; if (l.useCapture) o.capture++;
      const k = `${name}.${l.type}${l.useCapture ? '!' : ''}${l.passive ? '~' : ''}`;
      const where = `${String(l.url || '').split('/').pop()}:${(l.lineNumber ?? -1) + 1} ${String(l.handler?.description || '').replace(/\s+/g, ' ').slice(0, 50)}`;
      (o.by[k] = o.by[k] || []).push(where);
    }
  }
  return o;
}
async function observers() {
  const o = {};
  for (const T of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
    const p = await cdp('Runtime.evaluate', { expression: `${T}.prototype`, objectGroup: 'ul65' });
    const q = await cdp('Runtime.queryObjects', { prototypeObjectId: p?.result?.objectId, objectGroup: 'ul65' });
    const n = await cdp('Runtime.callFunctionOn', { objectId: q?.objects?.objectId, functionDeclaration: 'function () { return this.length; }', returnByValue: true });
    o[T] = n?.result?.value ?? null;
  }
  await cdp('Runtime.releaseObjectGroup', { objectGroup: 'ul65' });
  return o;
}

// ---------- the profile (before the trace) ----------
const para = (i) => {
  const kind = i % 10;
  const base = `Reply ${i}: here is **some** text with \`code\` and a [link](https://example.com).\n\n- one point about the scene\n- two: the beat, the colors, the pacing\n\n${'A longer paragraph of plain words to give the reply a realistic height and some wrapping in the column. '.repeat(3)}`;
  if (kind === 1) return `${base}\n\n\`\`\`js\nconst x${i} = ${i};\nfor (let k = 0; k < 4; k++) console.log(x${i} * k, "s");\n\`\`\``;
  if (kind === 5) return `${base}\n\n| a | b | c |\n| --- | ---: | --- |\n| ${i} | ${i * 2} | warm |\n| x | y | grain |`;
  return base;
};
const at0 = Date.now() - 2e7;
const long = { id: `ul65-long-${Math.random().toString(36).slice(2, 7)}`, agentId: claude.id, title: 'UL65 long chat', createdAt: at0, updatedAt: at0 + 1e7, messages: Array.from({ length: 400 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}: what about this part of the scene, and the beat at bar ${i}?`, at: at0 + i * 1000 })) };
await window.hub.saveChat(long); Native.save(long);
for (let i = 0; i < 300; i++) H.chats.push({ id: `ul65f-${i}`, agentId: i % 5 ? claude.id : (H.config.agents.find((a) => a.id === 'astra')?.id || claude.id), title: `UL65 chat ${i} about ${['shaders', 'the intro', 'beats', 'the board', 'colors', 'Paris', 'the set'][i % 7]}`, updatedAt: at0 - 5000 - i * 60e3, pinned: i < 3 });
H.chats = H.chats.slice();
// a quest journal with its pins (the Studio's own starting journal + the Paris guide), so the ✦ chip shows
try {
  await Lazy.load('questcore');
  const seed = QuestCore.upgrade(QuestCore.initial());
  await window.hub.kvSet('quest-journal', seed);
  if (typeof QuestHud !== 'undefined') await QuestHud.refresh?.();
} catch (err) { out.numbers.questSeed = String(err.message || err); }
// a Lab scene open in another tab (the Lab mounted, then left)
if (!window.UL_NO_LAB) { activate('tool:three'); await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.scenes, 60000); await wait(2500); }
activate(claude.id); await wait(300);
Native.open(claude.id, long.id);
await until(() => Native.view(claude.id).list.querySelectorAll('.msg').length >= 20, 15000);
Panel.render(); await wait(600);
for (let i = 0; i < 12; i++) { const b = document.querySelector('#chat-groups .show-more:not(.deep-search)'); if (!b) break; b.click(); Panel.flush?.(); await wait(150); }
await wait(1200);
out.numbers.chipShown = vis(document.querySelector('#rail .qh-chip'));
out.listenersStart = await listeners();
out.observersStart = await observers();

const segs = []; const sentBy = {};
const seg = async (name, fn) => { performance.mark(`hz240:${name}`); segs.push(name); const t0 = performance.now(); sent = 0; try { await fn(); out.numbers[`${name}Sec`] = Math.round((performance.now() - t0) / 100) / 10; sentBy[name] = sent; } catch (err) { fail(`${name}: ${err.message || err}`); } await settle(); await wait(250); performance.mark('hz240:between'); await wait(150); };

await smoke({ trace: 'start', detail: true });
const v = () => Native.view(claude.id);
const listRoot = () => document.getElementById('chat-groups');
const listSc = () => scrollerOf(listRoot().querySelector('.item') || listRoot()) || listRoot();
const rail = document.getElementById('rail');
const everyday = async (pfx) => {
  await move(...mid(listSc())); await wait(400);
  await seg(`${pfx}list`, async () => { const [x, y] = mid(listSc()); await notches(x, y, 25, 100); await notches(x, y, 25, -100); });
  await seg(`${pfx}chat`, async () => { const [x, y] = mid(v().list); await notches(x, y, 30, -200); await notches(x, y, 30, 200); });
  await seg(`${pfx}hover-rail`, async () => { const r = rail.getBoundingClientRect(); await glide(r.left + r.width / 2, r.top + 20, r.bottom - 60, 90); });
  await seg(`${pfx}hover-list`, async () => { const r = listSc().getBoundingClientRect(); await glide(r.left + r.width / 2, r.top + 10, r.bottom - 10, 90); });
  await seg(`${pfx}hover-msgs`, async () => { const r = v().list.getBoundingClientRect(); await glide(r.left + r.width / 2, r.top + 10, r.bottom - 10, 90); });
};
await everyday('');
await seg('click', async () => {
  const rows = [...listRoot().querySelectorAll('.item')].filter(vis).slice(0, 6);
  for (const row of rows) { await click(...mid(row)); await wait(250); }
  const other = [...rail.querySelectorAll('[data-id], .rail-item, button')].filter(vis).find((b) => b.dataset?.id === 'astra' || /astra/i.test(b.title || ''));
  if (other) { await click(...mid(other)); await wait(400); }
  const mine = [...rail.querySelectorAll('[data-id], .rail-item, button')].filter(vis).find((b) => b.dataset?.id === claude.id);
  if (mine) { await click(...mid(mine)); await wait(400); }
  Native.open(claude.id, long.id); await wait(500);
});
await seg('qhud', async () => {
  const c = document.querySelector('#rail .qh-chip');
  if (!vis(c)) { out.numbers.qhud = 'no chip'; return; }
  for (let i = 0; i < 3; i++) { await click(...mid(c)); await wait(450); const p = document.querySelector('.qh-panel'); if (p && i === 0) { const r = p.getBoundingClientRect(); await glide(r.left + r.width / 2, r.top + 10, r.bottom - 10, 30); } await click(...mid(c)); await wait(350); }
});
await seg('quests-open', async () => { await Lazy.load('questjournal'); activate('tool:quests'); await until(() => typeof QuestJournal !== 'undefined' && QuestJournal.ready?.(), 20000); await wait(800); });
await seg('quests', async () => {
  const s = document.querySelector('.surface.active') || document.body;
  const r = s.getBoundingClientRect();
  await glide(r.left + r.width / 2, r.top + 40, r.bottom - 40, 60);
  const sc = [...s.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 40 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
  if (sc) { const [x, y] = mid(sc); await notches(x, y, 10, 100); await notches(x, y, 10, -100); }
});
await seg('sound-open', async () => { await Lazy.load('creative'); activate('tool:creative'); await until(() => document.querySelector('.wb-stations, .wb-sound-desk'), 15000); try { CreativePlayground.openFeature?.('vst'); } catch { /* no desk here */ } await wait(1000); });
await seg('sound', async () => { const s = document.querySelector('.surface.active') || document.body; const r = s.getBoundingClientRect(); await glide(r.left + r.width / 2, r.top + 40, r.bottom - 40, 60); });
activate(claude.id); await wait(300); Native.open(claude.id, long.id); await wait(800);
await everyday('after-');
// a modal dialog opened 5 times over the chat with the Lab, the Studio and the Sound desk mounted but hidden (a modal
// makes the rest of the page inert: hidden pages that still get styled pay for it every time)
await seg('modal', async () => {
  for (let i = 0; i < 5; i++) { const d = document.createElement('dialog'); d.textContent = `uilag65 ${i}`; document.body.append(d); d.showModal(); await wait(120); d.close(); d.remove(); await wait(120); }
});
await seg('idle', () => wait(3000));
const tr = await smoke({ trace: 'stop', detail: true, dump: window.UL_DUMP || undefined }); // (UL_DUMP: a file for the raw trace)
out.listenersEnd = await listeners();
out.observersEnd = await observers();

// ---------- per stretch ----------
const d = tr.detail || {};
const S = {};
for (const name of segs) {
  const s = d.segments?.[name]; if (!s) continue;
  S[name] = { sent: sentBy[name], inputs: s.inputs, longestCpu: s.longestCpu, longest: s.longTasks.max, tasksOver8: s.longTasks.over8, cpuMs: s.cpuMs, forced: s.forced.n, forcedInInput: s.forced.inInputJs, forcedMs: s.forced.ms, forcedTop: s.forced.top?.slice(0, 3), style: `${s.style.n}×${s.style.elements}el ${s.style.ms}ms`, layout: `${s.layout.n}×${s.layout.objects}obj ${s.layout.ms}ms`, scripts: s.scripts, files: s.filesCpu && Object.fromEntries(Object.entries(s.filesCpu).sort((a, b) => b[1] - a[1]).slice(0, 6)), fired: s.fired, frames: `${s.frames.n} (${s.frames.over8} > 8 ms, worst ${s.frames.worst})` };
}
out.stretches = S;
out.whole = { tasks: d.tasks, forced: d.forced?.top };

// ---------- budgets ----------
const BUDGET = window.UL_BUDGET || {
  longestCpu: 50, // ms, any task in a scroll / hover / click stretch (opening a page is excluded)
  forcedPerInput: 0.05, // style / layout forced inside input handlers (wheel / pointer / mouse) per input sent, scroll / hover stretches (a frame callback that measures once per frame isn't counted: the long chat bringing in earlier messages does)
  globalHot: 110, // hot global listeners (pointer / mouse / scroll / wheel / key / resize on window / document / body / html): 104 in round 58, 105 in rounds 62–65; no growth
  leftBehind: 0, // capture-phase pointer / mouse / scroll / wheel / key listeners added by visiting the Studio / Sound desk that stay after leaving them (a page's own one-time resize listener is fine)
  idleTimerFires: 30, // timer fires in 3 s idle (the check's own CDP calls count: ≈ 0 from the app here)
  modalStyledElements: 6000, // elements restyled over 5 modal opens / closes (hidden Lab / Studio / Sound desk styled each time: 3× more)
};
out.budgets = BUDGET;
const over = (k, val, b) => { if (val == null || val > b) fail(`${k}: ${val} (budget ${b})`); };
for (const [name, s] of Object.entries(S)) {
  if (/open$|^idle$/.test(name)) continue;
  over(`${name}: longest task CPU ms`, s.longestCpu, BUDGET.longestCpu);
  if (/list|chat|hover/.test(name) && s.sent) over(`${name}: forced style/layout per input`, Math.round(((s.forcedInInput || 0) / s.sent) * 100) / 100, BUDGET.forcedPerInput);
}
over('hot global listeners at the start', out.listenersStart.hot, BUDGET.globalHot);
const left = Object.keys(out.listenersEnd.by).filter((k) => k.includes('!') && !/\.resize/.test(k)).reduce((a, k) => a + Math.max(0, out.listenersEnd.by[k].length - (out.listenersStart.by[k]?.length || 0)), 0);
out.numbers.leftBehind = left;
out.numbers.leftBehindWhat = Object.keys(out.listenersEnd.by).filter((k) => out.listenersEnd.by[k].length > (out.listenersStart.by[k]?.length || 0)).map((k) => `${k} ${out.listenersEnd.by[k].join(',')}`);
over('hot global listeners left behind after leaving the Studio / Sound desk', left, BUDGET.leftBehind);
over('modal: elements restyled by 5 modal dialogs', d.segments?.modal?.style?.elements, BUDGET.modalStyledElements);
out.numbers.modalStyle = d.segments?.modal?.style;
const idle = d.segments?.idle; out.numbers.idleFired = idle?.fired;
over('timer fires in 3 s idle', idle?.fired?.timer, BUDGET.idleTimerFires);
if (window.UL_REPORT) { out.reportOnly = out.problems; out.problems = []; }
return JSON.stringify(out, null, 1);
