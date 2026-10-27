// opt-in: BIGPROFILE70
// (round 73, chatsteady73) What a click or a key costs in the chat views on the HEAVY profile (dev/bigprofile.js: 1,500
// chats, 120 long ones with pictures, a year of feature usage = a 900 KB usage store). Each action is done like a user
// (CDP mouse / keys on real controls); measured per action:
//   handler  the slowest of its events (Event Timing: the event's start → its handlers done; ≥ 16 ms reported)
//   paint    the same → the next frame painted (software GL here paints a long chat slowly: reported, budgeted loosely)
//   busy     the window's CPU (profiler samples, not idle) from the action to 3.5 s after it (catches work a click starts
//            on a timer: the usage store's save landed 3 s after every click), with the top functions by self time
// Then "the usage save": what saving a minute of clicks costs the window (Usage.flush(): only what changed is sent).
// window.CS_REPORT = 1 reports without failing (the before numbers).
//   BIGPROFILE70=1 node dev/run-checks.js --exact chatsteady73
//   by hand: node dev/smoke.js --fake-engines --data /tmp/hearth-bigprofile70 --wait 1000 --check-timeout 600000 --script dev/checks/chatsteady73.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, n = 200) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(15000)]);
const r0 = (x) => Math.round(x);
const out = { fixture: {}, actions: {}, problems: [] };
const BUDGET = Object.assign({ handler: 16, busyAfter: 40, usageSave: 5, keyHandler: 16 }, window.CS_BUDGET || {});
// (handler: the slowest event handler of a click / key, ms · busyAfter: the window's CPU in the 3.5 s after a click beyond
// the click's own events, ms · usageSave: the window's own time to save the usage store, ms)
const evs = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) evs.push({ name: e.name, t: e.startTime, h: e.processingEnd - e.startTime, p: e.processingEnd - e.processingStart, d: e.duration }); }).observe({ type: 'event', durationThreshold: 16, buffered: false }); } catch { out.problems.push('no Event Timing'); }
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const click = async (n) => { n.scrollIntoView({ block: 'nearest' }); await frame(); const [x, y] = mid(n); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
const key = async (k, code, mods = 0, text) => { for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : { Enter: 13, Escape: 27, ' ': 32 }[k] || 0, ...(type === 'keyDown' && text ? { text } : {}) }); };

await until(() => document.querySelector('#panel .item'), 300);
await wait(8000); // (start-up work settles)
const claude = H.claudeAgent();
const chats = (await window.hub.listChats().catch(() => [])) || [];
const longChats = chats.filter((c) => c.agentId === claude.id && /-long\d/.test(c.id)).slice(0, 6);
out.fixture = { chats: chats.length, long: longChats.length, usageKB: r0(JSON.stringify(Usage.data || {}).length / 1024) };
if (!longChats.length) { out.problems.push('no long chats in the fixture'); return out; }
activate(claude.id); await wait(500);
Native.open(claude.id, longChats[0].id); await until(() => Native.view(claude.id)?.list.querySelectorAll('.msg').length > 20, 200); await wait(2500);
const v = () => Native.view(claude.id);

await cdp('Profiler.enable'); await cdp('Profiler.setSamplingInterval', { interval: 250 });
const marks = [];
async function act(name, fn, { after = 3500 } = {}) {
  const e0 = evs.length; const t0 = performance.now();
  try { await fn(); } catch (err) { out.problems.push(`${name}: ${err.message}`); }
  await frame(); const t1 = performance.now();
  await wait(after);
  marks.push({ name, t0, t1, t2: performance.now() });
  const mine = evs.slice(e0).filter((e) => e.t >= t0 - 5);
  out.actions[name] = { handler: r0(Math.max(0, ...mine.map((e) => e.h))), paint: r0(Math.max(0, ...mine.map((e) => e.d))), slowEvents: mine.sort((a, b) => b.h - a.h).slice(0, 3).map((e) => `${e.name} ${r0(e.h)}/${r0(e.d)}ms`) };
}
await cdp('Profiler.start');
const pStart = performance.now();
// 1. the chats list: another long chat (its row clicked) ×3
for (let i = 1; i <= 3; i++) {
  await act(`list row → long chat ${i}`, async () => {
    const row = await until(() => document.querySelector(`#chat-groups .item[data-key="${CSS.escape(longChats[i].id)}"]`), 40);
    if (row) await click(row); else Native.open(claude.id, longChats[i].id);
    await until(() => H.activeChat[claude.id] === longChats[i].id && v().list.querySelectorAll('.msg').length > 20, 100);
  });
}
const L = () => v().list;
const lastIn = (sel) => [...L().querySelectorAll(sel)].filter((n) => n.checkVisibility?.()).pop();
// 2. a thinking block opened and shut, a tool-steps fold
await act('thinking: open', async () => { const s = lastIn('.msg details.thinking > summary'); if (!s) throw Error('no thinking'); await click(s); });
await act('thinking: shut', async () => { const s = lastIn('.msg details.thinking[open] > summary'); if (s) await click(s); });
await act('tool steps: open', async () => { const s = lastIn('.msg details.tool-fold > summary'); if (!s) throw Error('no tool fold'); await click(s); });
// 3. a reply's ⋯ menu, then Escape; Copy
await act('message ⋯ menu', async () => { const b = lastIn('.msg.assistant .msg-more'); if (!b) throw Error('no ⋯'); await click(b); await until(() => document.querySelector('#menu:not([hidden]) .menu-item, #menu .menu-item'), 30); });
await act('menu: Escape', async () => { await key('Escape', 'Escape'); });
await act('Copy a reply', async () => { const b = lastIn('.msg.assistant .copy-msg'); if (!b) throw Error('no Copy'); await click(b); });
// 4. the message box: clicked, 30 keys typed, cleared
await act('message box: click', async () => { await click(v().input); });
await act('typing 30 keys', async () => { for (const ch of 'the fog in the intro, bass drop') { await key(ch === ' ' ? ' ' : ch, ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`, 0, ch); await wait(30); } });
await act('select all + delete', async () => { await key('a', 'KeyA', 2); await key('Backspace', 'Backspace'); });
// 5. find in chat (Alt+F) opened and shut; scrolled up a screen by the wheel
await act('find: Alt+F', async () => { v().input.focus(); await key('f', 'KeyF', 1); await until(() => v().root.querySelector('.chat-find input'), 30); });
await act('find: Escape', async () => { await key('Escape', 'Escape'); });
await act('wheel up a screen', async () => { const [x, y] = mid(L()); await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: -900 }); });
// 6. the chat's own menu (the header's ⋯), shut
await act('chat ⋯ menu', async () => { const b = [...v().root.querySelectorAll('.native-head button')].find((x) => /⋯|More/.test(x.textContent + x.title) && x.checkVisibility?.()); if (!b) throw Error('no chat menu'); await click(b); });
await act('chat menu: Escape', async () => { await key('Escape', 'Escape'); });
const prof = await cdp('Profiler.stop');
// the window's CPU per action (from the action to 3.5 s after), top functions by self time
try {
  const p = prof.profile; const byId = new Map(p.nodes.map((n) => [n.id, n]));
  let t = p.startTime; // µs, the profiler's clock; mapped onto performance.now() by its start
  const off = pStart * 1000 - p.startTime;
  for (const m of marks) m.busy = 0, m.after = 0, m.top = new Map();
  for (let i = 0; i < p.samples.length; i++) {
    t += p.timeDeltas[i] || 0; const at = (t + off) / 1000; const dt = (p.timeDeltas[i + 1] || 0) / 1000;
    const n = byId.get(p.samples[i]); const cf = n.callFrame;
    if (/^\((idle|program|garbage collector)\)$/.test(cf.functionName)) continue;
    const m = marks.find((x) => at >= x.t0 && at < x.t2); if (!m) continue;
    m.busy += dt; if (at >= m.t1) m.after += dt;
    const k = `${cf.functionName || '(anon)'} ${String(cf.url).split('/').pop()}:${cf.lineNumber + 1}`; m.top.set(k, (m.top.get(k) || 0) + dt);
  }
  for (const m of marks) Object.assign(out.actions[m.name], { busy: r0(m.busy), busyAfter: r0(m.after), top: [...m.top].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, ms]) => `${r0(ms)}ms ${k}`) });
} catch (err) { out.problems.push(`profile: ${err.message}`); }
// 7. the usage store's save (a minute of clicks: what the window does to send it)
{
  for (let i = 0; i < 20; i++) Usage.track(`Test › click ${i % 5}`);
  // (before round 73 there's no flush: the save it made 3 s after a click was hub.kvSet of the whole store)
  const t0 = performance.now(); const p = Usage.flush ? Usage.flush() : window.hub.kvSet('ui-usage', Usage.data); const sync = performance.now() - t0;
  const r = await Promise.resolve(p); const total = performance.now() - t0;
  out.usageSave = { windowMs: Math.round(sync * 10) / 10, roundTripMs: r0(total), incremental: Boolean(Usage.flush), result: r ?? null };
  const disk = await window.hub.kvGet('ui-usage', null);
  if (!disk?.items?.['Test › click 0'] || disk.items['Test › click 0'].n !== Usage.data.items['Test › click 0'].n) out.problems.push(`usage save: the file doesn't hold the clicks (${JSON.stringify(disk?.items?.['Test › click 0'])} vs ${JSON.stringify(Usage.data.items['Test › click 0'])})`);
}
// ---------- verdicts ----------
const fails = [];
for (const [name, a] of Object.entries(out.actions)) {
  if (a.handler > (/typing|keys|Escape|Alt/.test(name) ? BUDGET.keyHandler : BUDGET.handler)) fails.push(`${name}: slowest handler ${a.handler} ms (${a.slowEvents.join(', ')})`);
  if (a.busyAfter > BUDGET.busyAfter && !/list row|wheel/.test(name)) fails.push(`${name}: ${a.busyAfter} ms of window CPU after it (${(a.top || []).join(' · ')})`);
}
if (out.usageSave.windowMs > BUDGET.usageSave) fails.push(`the usage save cost the window ${out.usageSave.windowMs} ms`);
out.budget = BUDGET;
if (window.CS_REPORT) { out.wouldFail = fails; out.pass = true; } else { out.fails = fails; out.pass = !fails.length && !out.problems.length; }
return JSON.stringify(out, null, 1);
