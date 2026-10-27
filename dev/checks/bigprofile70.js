// opt-in: BIGPROFILE70
// (round 70, bigprofile70) The owner's lag on a HEAVY profile like his (dev/bigprofile.js: 1,500 chats, 120 long ones
// with pictures, Sidequest's journal full, 50 Lab scenes, 600 cached shows, a show log, tickets, leave reminders,
// 400 My Paris photos, 200 music sessions, a year of usage) on a Windows-slow disk (HEARTH_SLOWFS_US=150), with sync to
// a cloud folder switched on (the PC ↔ Mac sync). Measured, both processes:
//   1. cold start: the main process's start → the first frame, → Hearth's ready mark, → idle (the last long task of
//      either process in the first minute)
//   2. sync's first pass (reported), then 2 minutes idle with sync on (its minute-by-minute passes run in it)
//   3. typical clicks: switching between long chats (list clicks and opens), Sidequest's map, the Sound desk, Settings
//      opened and shut, typing a sentence in the chat box
//   4. that sentence sent (Enter, the fake engine answers), and the sync pass that follows the saved chat
// Main process: event-loop delay (mainlag-probe.js: p99 / max, busy stretches with the app's lines behind them) and the
// hiccups the 🐢 card would count (jankmain's recent()); window: long tasks (> 50 ms) and the slowest key press (Event
// Timing). A CPU profile of the window over the clicks names the top functions (self time; written to SMOKE_TMP).
// Budgets (BP_BUDGET overrides; window.BP_REPORT = 1 reports without failing) are in BUDGET below.
// Opt-in (a ~6-minute run on a 140 MB fixture): BIGPROFILE70=1 node dev/run-checks.js --exact bigprofile70
//   by hand: node dev/bigprofile.js /tmp/hearth-bigprofile70 && HEARTH_LOOPLAG=prof HEARTH_SLOWFS_US=150
//   node dev/smoke.js --fake-engines --data /tmp/hearth-bigprofile70 --wait 1000 --check-timeout 900000 --script dev/checks/bigprofile70.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, n = 200) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const lag = (label) => window.hub.power.test({ lag: { label } });
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(15000)]);
const r0 = (x) => Math.round(x);
const out = { fixture: {}, start: {}, phases: {}, actions: {}, problems: [] };
const BUDGET = Object.assign({
  firstFrame: 6000, // ms from the main process's start to the window's first paint
  idle: 20000, // ms from the main process's start to the last long task of either process (the first minute)
  mainP99: 50, mainMax: 150, // ms, main-process event-loop delay in idle / clicks / chat + sync (max counts only when a busy
  // stretch ≥ 150 ms is behind it: on the shared 4-CPU test box a process also waits for a CPU). Round 69: 185–236 ms
  // stretches in shows:get (fails); round 70: ≤ 62 ms
  hiccups: 0, // main-process stalls ≥ 500 ms in idle / clicks (what 🐢 That was slow counts)
  winLongIdle: 0, // window long tasks ≥ 100 ms during the 2 idle minutes
  winLongest: 400, // ms, the window's longest task during the clicks (opening a page included)
  keyMax: 50, // ms, the slowest key press while typing: waiting + its handlers (Event Timing: start → processing end; the paint
  // after it is reported as toPaintMax, not budgeted: software GL here paints a long chat in ≈ 50 ms every frame)
}, window.BP_BUDGET || {});
const fails = [];
const judge = (name, ok, detail) => { if (!ok) fails.push(`${name}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); };
const longest = (r) => Math.max(0, ...(r.blocks || []).map((b) => b.ms));
const mainOk = (r) => r.delay.p99 < BUDGET.mainP99 && (r.delay.max < BUDGET.mainMax || longest(r) < 150);
const brief = (r) => ({ delay: r.delay, fsSync: { n: r.fsSync.n, ms: r.fsSync.ms, top: r.fsSync.top.slice(0, 6).map((x) => `${x.n}× ${x.ms}ms ${x.k}`) },
  ipc: r.ipc.top.slice(0, 6).map((x) => `${x.n}× ${x.ms}ms ${x.k}`), blocks: (r.blocks || []).slice(0, 8).map((b) => `${b.ms}ms @${b.atMs} · ${b.app.slice(0, 3).join(' | ')}`), appTop: (r.appTop || []).slice(0, 10) });
// the window's long tasks (and long animation frames: their scripts)
const longs = []; const loafs = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: performance.timeOrigin + e.startTime, ms: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.duration > 100) loafs.push({ at: performance.timeOrigin + e.startTime, ms: r0(e.duration), scripts: (e.scripts || []).slice(0, 3).map((s) => `${r0(s.duration)}ms ${s.invoker || ''} ${String(s.sourceURL || '').split('/').pop()}:${s.sourceCharPosition}`) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch { /* none */ }
const keys = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (/key|input|beforeinput/.test(e.name)) keys.push({ d: r0(e.duration), h: r0(e.processingEnd - e.startTime) }); }).observe({ type: 'event', durationThreshold: 16, buffered: false }); } catch { /* none */ }
const winIn = (a, b, min = 50) => longs.filter((x) => x.at >= a && x.at < b && x.ms >= min).map((x) => r0(x.ms)).sort((x, y) => y - x);
const hiccups = async (since) => { const r = await window.hub.jank.recent?.(Date.now() - since + 1000).catch(() => null); const st = (r?.stalls || []).filter((x) => x.t + x.ms > since); return { n: st.length, worst: Math.max(0, ...st.map((x) => x.ms)), slowIpc: (r?.slow || []).slice(0, 4).map((x) => `${x.ms}ms ${x.what}`), late: (r?.late || []).length }; };

if (!window.hub?.power?.test) { out.problems.push('no test hook'); return out; }
// ---------- 1. cold start ----------
await until(() => document.querySelector('#panel .item'), 300);
// quiet: no new long task in the window for 4 s (≤ 90 s)
for (let i = 0, last = longs.length, still = 0; i < 180 && still < 8; i++) { await wait(500); if (longs.length === last) still += 1; else { still = 0; last = longs.length; } }
await wait(3000);
const st = await lag('startup');
if (!st?.delay) { out.problems.push('the lag probe is off (HEARTH_LOOPLAG)'); return out; }
const t0 = st.procStart;
const paint = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint') || performance.getEntriesByType('paint')[0];
const ready = performance.getEntriesByName('hearth:ready')[0];
const firstMin = t0 + 60000;
const lastWin = longs.filter((x) => x.at < firstMin).reduce((m, x) => Math.max(m, x.at + x.ms), 0);
const lastMain = (st.blocks || []).filter((b) => b.ms >= 50).reduce((m, b) => Math.max(m, st.profAt + b.atMs + b.ms), 0);
out.start = {
  firstFrame: paint ? r0(performance.timeOrigin + paint.startTime - t0) : null,
  windowOpened: r0(performance.timeOrigin - t0),
  ready: ready ? r0(performance.timeOrigin + ready.startTime - t0) : null,
  idle: r0(Math.max(lastWin, lastMain, performance.timeOrigin + (paint?.startTime || 0)) - t0),
  windowLong: longs.filter((x) => x.at < firstMin).map((x) => r0(x.ms)).sort((a, b) => b - a).slice(0, 10),
  windowLoafs: loafs.filter((x) => x.at < firstMin).sort((a, b) => b.ms - a.ms).slice(0, 5),
  main: brief(st),
};
judge('first frame', out.start.firstFrame != null && out.start.firstFrame < BUDGET.firstFrame, out.start.firstFrame);
judge('start → idle', out.start.idle < BUDGET.idle, out.start.idle);
const chats = (await window.hub.listChats().catch(() => [])) || [];
out.fixture = { chats: chats.length, long: chats.filter((c) => /-long\d/.test(c.id)).length };

// ---------- 2. sync on, its first pass (reported), then 2 minutes idle ----------
if (window.hub.sync?.on) {
  const CLOUD = `${window.SMOKE_TMP}/bp70-cloud`;
  await window.hub.fs.write(`${CLOUD}/.keep`, '');
  const s0 = Date.now(); await window.hub.sync.on({ root: CLOUD });
  for (let i = 0; i < 480; i++) { const x = await window.hub.sync.status(); if (['synced', 'conflict', 'pending'].includes(x?.state)) break; await wait(500); }
  const sf = await lag('sync first pass');
  out.phases.syncFirst = { secs: Math.round((Date.now() - s0) / 1000), state: (await window.hub.sync.status())?.state, ...brief(sf) };
}
const IDLE = Number(window.BP_IDLE_MS) || 120000;
const i0 = Date.now(); const h0 = Date.now();
await wait(IDLE);
const idle = await lag('idle');
out.phases.idle = { secs: IDLE / 1000, ...brief(idle), windowLong: winIn(i0, Date.now()), windowLoafs: loafs.filter((x) => x.at >= i0).sort((a, b) => b.ms - a.ms).slice(0, 5), hiccups: await hiccups(h0) };
judge('idle main', mainOk(idle), idle.delay);
judge('idle window long tasks ≥ 100 ms', winIn(i0, Date.now(), 100).length <= BUDGET.winLongIdle, winIn(i0, Date.now(), 100));

// ---------- 3. typical clicks (the window's CPU profile over all of them) ----------
const claude = H.claudeAgent?.() || (H.config.agents || []).find((a) => a.engine === 'claude');
const longChats = chats.filter((c) => c.agentId === claude.id && /-long\d/.test(c.id)).slice(0, 10);
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const click = async (x, y) => { await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
const typeKey = async (ch) => { const p = ch === ' ' ? { key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 } : { key: ch, code: `Key${ch.toUpperCase()}`, text: ch, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) }; await cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...p }); };
async function act(name, fn) {
  const a = Date.now(); const p0 = performance.now();
  try { await fn(); } catch (err) { out.problems.push(`${name}: ${err.message}`); }
  await frame(); const wall = r0(performance.now() - p0); await wait(400);
  out.actions[name] = { wall, windowLong: winIn(a, Date.now()).slice(0, 6) };
}
await lag('before clicks');
await cdp('Profiler.enable'); await cdp('Profiler.setSamplingInterval', { interval: 500 }); await cdp('Profiler.start');
const c0 = Date.now();
await act('open the chats', async () => { activate(claude.id); await wait(300); });
await act('switch long chats ×10', async () => { for (const c of longChats) { Native.open(claude.id, c.id); await frame(); await wait(300); } });
await act('click list rows ×6', async () => { const rows = [...document.querySelectorAll('#panel .item')].filter((r) => r.checkVisibility?.()).slice(0, 6); for (const r of rows) { await click(...mid(r)); await wait(300); } });
await act('back to a long chat', async () => { Native.open(claude.id, longChats[0].id); await wait(300); });
await act('Sidequest map', async () => {
  await Lazy.load('questjournal'); activate('tool:quests');
  await until(() => typeof QuestJournal !== 'undefined' && QuestJournal.ready?.(), 300);
  const map = [...document.querySelectorAll('.qj button')].find((b) => /^\s*Map\s*$/.test(b.textContent) || b.getAttribute('aria-label') === 'Map');
  if (map) { await click(...mid(map)); await wait(800); }
  await until(() => document.querySelector('.qj .qa-map, .qj [class*="atlas"]'), 100);
});
await act('Sound desk', async () => { await Lazy.load('creative'); activate('tool:creative'); await until(() => document.querySelector('.wb-stations, .wb-sound-desk'), 250); try { CreativePlayground.openFeature?.('vst'); } catch { /* none */ } await wait(600); });
await act('Settings open / shut', async () => { activate(claude.id); await wait(300); await AppUI.openSettings(); await until(() => document.querySelector('dialog.settings-dialog[open]'), 100); await wait(500); document.querySelector('dialog.settings-dialog[open]')?.close(); });
await act('type in chat', async () => {
  Native.open(claude.id, longChats[1].id); await wait(500);
  const box = document.querySelector('.surface.active textarea, .native.active textarea, textarea.native-input') || [...document.querySelectorAll('textarea')].find((t) => t.checkVisibility?.());
  if (!box) throw Error('no chat box');
  await click(...mid(box)); await wait(100);
  for (const ch of 'what about the fog in the intro scene and the bass drop') { await typeKey(ch); await wait(35); }
});
const prof = await cdp('Profiler.stop');
const cl = await lag('clicks');
out.phases.clicks = { ...brief(cl), windowLong: winIn(c0, Date.now()), windowLoafs: loafs.filter((x) => x.at >= c0).sort((a, b) => b.ms - a.ms).slice(0, 6), keys: { n: keys.length, max: Math.max(0, ...keys.map((k) => k.h)), over50: keys.filter((k) => k.h > 50).length, toPaintMax: Math.max(0, ...keys.map((k) => k.d)) }, hiccups: await hiccups(c0) };
// the window's top functions by self time
try {
  const p = prof?.profile; const self = new Map(); const byId = new Map(p.nodes.map((n) => [n.id, n]));
  for (let i = 0; i < p.samples.length; i++) { const n = byId.get(p.samples[i]); const cf = n.callFrame; if (/^\((idle|program)\)$/.test(cf.functionName)) continue; const k = `${cf.functionName || '(anon)'} ${String(cf.url).split('/').pop()}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (p.timeDeltas[i] || 0)); }
  out.phases.clicks.windowTop = [...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${r0(v / 1000)}ms ${k}`);
  await window.hub.fs.write(`${window.SMOKE_TMP}/bp70-window.cpuprofile`, JSON.stringify(p)); out.windowProfile = `${window.SMOKE_TMP}/bp70-window.cpuprofile`;
} catch (err) { out.problems.push(`profile: ${err.message}`); }
// ---------- 4. a message sent (Enter), its reply saved, and the sync pass that follows (the owner chatting, sync on) ----------
{
  const before = (await window.hub.sync?.status?.())?.at || 0; const m0 = Date.now();
  const box = [...document.querySelectorAll('textarea')].find((t) => t.checkVisibility?.());
  if (box) { box.focus(); await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }); }
  let passed = false;
  for (let i = 0; i < 160 && !passed; i++) { await wait(500); const x = await window.hub.sync?.status?.(); passed = Boolean(x?.at && x.at > before && x.at > m0 + 1000); }
  await wait(1500);
  const cs = await lag('chat + sync');
  out.phases.chatSync = { syncPassed: passed, secs: Math.round((Date.now() - m0) / 1000), ...brief(cs), windowLong: winIn(m0, Date.now()), hiccups: await hiccups(m0) };
  judge('chat + sync main', mainOk(cs), cs.delay);
}
judge('clicks main', mainOk(cl), cl.delay);
judge('clicks window longest task', (out.phases.clicks.windowLong[0] || 0) < BUDGET.winLongest, out.phases.clicks.windowLong.slice(0, 3));
judge('typing: slowest key', out.phases.clicks.keys.max < BUDGET.keyMax, out.phases.clicks.keys);
for (const ph of ['idle', 'clicks', 'chatSync']) { const h = out.phases[ph]?.hiccups; if (h?.n != null) judge(`${ph} hiccups ≥ 500 ms`, h.n <= BUDGET.hiccups, h.n); }
if (window.hub.sync?.off) await window.hub.sync.off();
out.budget = BUDGET;
out.fails = window.BP_REPORT ? [] : fails;
if (window.BP_REPORT) out.wouldFail = fails;
out.pass = !out.fails.length && !out.problems.length;
return out;
