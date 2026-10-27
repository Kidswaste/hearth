// opt-in: LONGRUN72
// (round 72, longrun72) Does Hearth get heavier or hitchier the longer it stays open? The owner keeps it open for days
// (in the tray) and the hiccups "got worse for a few versions"; rounds 65 and 70 found nothing on a fresh run. This
// runs a compressed DAY on the heavy owner-like profile (dev/bigprofile.js: 1,500 chats, a full quest journal, 50 Lab
// scenes, shows, reminders, photos) for LR_MINUTES (default 30) of real time, one "hour" per cycle (~70 s):
//   day hours: long chats switched (and scrolled up), a message sent each hour (fake Claude; fake Astra every 3rd hour)
//     with sync on (a cloud folder: every saved chat makes a pass), and in turn: the Lab (a scene of the profile opened,
//     then hidden again), the Sound desk (fake audio host: an instrument goes live, then the desk is left), Sidequest
//     (the journal's Map tab, the ✦ tracker opened and shut), dialogs (Settings, Ctrl+K, a confirm, a right-click menu),
//     the window hidden to the tray and shown again
//   night hours: hidden to the tray, the computer asleep (the real powerMonitor suspend / resume events, lock / unlock)
//   every hour: the leave reminders' FAKE CLOCK (LeaveSoon._test.clock) moves one hour on, so they ring on the day's
//     timeline (notifications stubbed: Hearth "away")
// Every minute, in the same state (the first long chat on screen, nothing open), after forced GCs, both processes:
//   window: JS heap, DOM nodes (all / in the document), JS listeners, window + document listeners (DOMDebugger), live
//     intervals / pending timeouts / observers / object URLs by the line that made them, timeouts fired per minute,
//     animation frames per minute, IPC listeners per channel (hub.ipcListeners), event-loop delay p99 / max (a 50 ms
//     ticker while visible), long tasks; the 🐢 hiccups the "That was slow" card counts (jankmain)
//   main: JS heap, handles by kind, live timers by line (powerwisemain's test probe), timers fired per minute, child
//     processes (what they run), ipcMain listeners / invoke handlers, listeners on app / powerMonitor / the window, the
//     app's processes by type, event-loop delay p99 / max and busy stretches ≥ 100 ms with their app lines
//     (mainlag-probe.js, HEARTH_LOOPLAG=prof)
// Growth per hour = the least-squares slope after the warm-up (LR_WARMUP_MIN, default 4); a metric "grows" when the
// fit is clean (R² ≥ 0.6) and it gained more than its noise floor (GROW below). Hiccups that only come later: busy
// stretches / long tasks / 🐢 counted in the first and last third. Fails on growth or later hiccups (window.LR_REPORT =
// 1 reports without failing). The whole series goes to LR_OUT (default SMOKE_TMP)/longrun72.json.
//   LONGRUN72=1 node dev/run-checks.js --exact longrun72          (≈ 32 min; run-checks makes the fixture)
//   by hand: HEARTH_LOOPLAG=prof node dev/smoke.js --fake-engines --fake-vst --data /tmp/hearth-bigprofile70 --wait 1000 --check-timeout 3600000 --script dev/checks/longrun72.js
//   --eval "window.LR_MINUTES=8" for a short run · window.LR_SNAP = '<dir>': heap snapshots (window + main) after the
//   warm-up and at the end, for a by-constructor diff
// ---------- part 1: the counters, in every frame before its own scripts (then the window reloads) ----------
const src = await hub.fs.read(`${SMOKE_DEV}/soak.js`);
const body = src.slice(src.indexOf('const PROBE = `') + 15, src.indexOf('})();`;', src.indexOf('const PROBE = `')) + 5);
const SOAK = body.replace(/\\\\/g, '\\');
// timeouts (pending by line, fired per line), the window's event-loop delay (a 50 ms ticker on the page's own timer,
// counted only while the window is visible), long tasks
const LR = `(() => { if (window.__lr) return; const L = window.__lr = { pend: new Map(), fires: new Map(), lag: [], longs: [] };
  const st = window.setTimeout, ct = window.clearTimeout;
  const where = () => { const l = String(new Error().stack || '').split('\\n').slice(3, 5).map((x) => x.trim().replace(/^at /, '').replace(/\\(?(?:file|https?):\\/\\/[^)]*\\/([^/)]+:\\d+):\\d+\\)?/, '$1')); return l.join(' < ').slice(0, 140); };
  window.setTimeout = function (fn, ms, ...a) { if (typeof fn !== 'function') return st.call(this, fn, ms, ...a); const s = where(); let id = 0; id = st.call(this, function (...b) { L.pend.delete(id); L.fires.set(s, (L.fires.get(s) || 0) + 1); return fn.apply(this, b); }, ms, ...a); L.pend.set(id, s); return id; };
  window.clearTimeout = function (id) { L.pend.delete(id); return ct.call(this, id); };
  let due = performance.now() + 50; const tick = () => { const now = performance.now(); if (document.visibilityState === 'visible') L.lag.push(now - due); due = now + 50; st(tick, 50); }; st(tick, 50);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) L.longs.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: false }); } catch {}
  const top = (m, n = 8) => { const by = {}; for (const v of m.values()) by[v] = (by[v] || 0) + 1; return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, n); };
  L.take = () => { const d = L.lag.slice().sort((a, b) => a - b); const q = (p) => (d.length ? Math.round(d[Math.min(d.length - 1, Math.floor(p * d.length))]) : null);
    const fires = [...L.fires].sort((a, b) => b[1] - a[1]); const out = { pending: L.pend.size, pendingTop: top(L.pend), fires: fires.reduce((a, x) => a + x[1], 0), firesTop: fires.slice(0, 8), lag: { n: d.length, p50: q(0.5), p99: q(0.99), max: d.length ? Math.round(d[d.length - 1]) : null }, longs: { n: L.longs.length, max: Math.max(0, ...L.longs), over100: L.longs.filter((x) => x >= 100).length, over250: L.longs.filter((x) => x >= 250).length } };
    L.lag = []; L.longs = []; L.fires.clear(); return out; };
  L.reset = () => { L.lag = []; L.longs = []; L.fires.clear(); };
})();`;
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: SOAK } });
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: LR } });
// (the --eval options outlive the reload)
localStorage.lr72 = JSON.stringify(Object.fromEntries(['LR_MINUTES', 'LR_WARMUP_MIN', 'LR_OUT', 'LR_SNAP', 'LR_REPORT'].filter((k) => window[k] != null).map((k) => [k, window[k]])));
return 'probes installed';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const cdp = (method, params = {}) => smoke({ cdp: method, params });
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const MB = (b) => (b == null ? null : r1(b / 1048576));
try { Object.assign(window, JSON.parse(localStorage.lr72 || '{}')); } catch { /* defaults */ }
const out = { setup: {}, samples: [], errs: {}, problems: [] };
const fails = [];
const MINUTES = Number(window.LR_MINUTES) || 30;
const WARM = (Number(window.LR_WARMUP_MIN) || 4) * 60000;
const T0 = Date.now(); const END = T0 + MINUTES * 60000;
const L = window.__lr; const P = window.__soakProbe;
if (!L || !P) { out.problems.push('the probes are not in'); return out; }
await until(() => window.H?.config && H.claudeAgent?.() && document.querySelector('#panel .item'), 120000);
await wait(4000);
const test = (t) => window.hub.power.test(t);
if (!(await test({ lag: { label: 'boot' } }))?.delay) out.problems.push('the main lag probe is off (HEARTH_LOOPLAG): main delay not measured');
const C = H.claudeAgent(); const A = Native.astraAgent?.();
async function act(name, fn) {
  const t = Date.now();
  try { await fn(); } catch (err) { (out.errs[name] ||= []).push(String(err?.message || err).slice(0, 160)); if (out.errs[name].length > 3) out.errs[name].shift(); }
  (out.acts ||= {})[name] = ((out.acts[name] || 0) + 1);
  return Date.now() - t;
}
async function calm() { hideMenu?.(); document.querySelectorAll('dialog[open]').forEach((d) => { try { d.close(); } catch { /* gone */ } }); try { QuestHud?.close?.(); } catch { /* not loaded */ } }
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + Math.min(r.width / 2, 200)), Math.round(r.top + Math.min(r.height / 2, 60))]; };
const click = async (n, button = 'left') => { const [x, y] = mid(n); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount: 1 }); };
const key = async (k, mods = 0) => { const code = k.length === 1 ? `Key${k.toUpperCase()}` : k; const vk = k === 'Escape' ? 27 : k === 'Enter' ? 13 : k.toUpperCase().charCodeAt(0); await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers: mods, windowsVirtualKeyCode: vk }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers: mods, windowsVirtualKeyCode: vk }); };

// ---------- setup: the long chats, a "today" chat, sync on, reminders' clock, the notifications stub ----------
const chats = (await window.hub.listChats().catch(() => [])) || [];
const longChats = chats.filter((c) => c.agentId === C.id && /-long\d/.test(c.id)).slice(0, 8).map((c) => c.id);
out.setup.chats = chats.length; out.setup.long = longChats.length;
if (longChats.length < 4) { out.problems.push('the big profile is not here (dev/bigprofile.js)'); return out; }
activate(C.id); await until(() => Native.hasView(C.id)); await Native.open(C.id, longChats[0]); await wait(800);
await window.hub.notify?.test?.({ stub: true, away: true, clear: true }).catch(() => null);
const CLOUD = `${window.SMOKE_TMP}/lr72-cloud`;
if (window.hub.sync?.on) {
  await window.hub.fs.write(`${CLOUD}/.keep`, '');
  const s0 = Date.now(); await window.hub.sync.on({ root: CLOUD });
  for (let i = 0; i < 480; i++) { const x = await window.hub.sync.status(); if (['synced', 'conflict', 'pending'].includes(x?.state)) break; await wait(500); }
  out.setup.syncFirstPassS = Math.round((Date.now() - s0) / 1000); out.setup.sync = (await window.hub.sync.status())?.state;
}
await until(() => window.Lazy?.isIn?.('questhud'), 60000);
await until(() => window.LeaveSoon, 20000);
let clock = Date.now();
const tick = async () => { clock += 3600e3; try { await LeaveSoon._test.clock(clock); } catch (err) { (out.errs.clock ||= [err.message]); } };
// the Sound desk's instruments (two fake plugin folders the fake host lists; the profile's own workbench kept)
const VST = `${window.SMOKE_TMP}/lr72-vst`;
await hub.fs.write(`${VST}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}');
try { await Lazy.load('creative'); const wb = (await hub.kvGet('creative-workbenches')) || WorkbenchCore.defaults(); wb.vst = { ...(wb.vst || {}), roots: [...new Set([...(wb.vst?.roots || []), VST])] }; await hub.kvSet('creative-workbenches', wb); out.setup.vst = (await hub.vst?.status?.())?.version || 'none'; } catch (err) { out.setup.vst = `error: ${err.message}`; }
let today = null;

// ---------- the day's parts ----------
const parts = {
  async chats(h) {
    activate(C.id); await wait(200);
    for (let k = 0; k < 4; k++) {
      const id = longChats[(h * 3 + k) % longChats.length]; await Native.open(C.id, id); await frame(); await wait(250);
      const list = Native.view(C.id)?.list; if (list && k % 2 === 0) { for (let s = 0; s < 6; s++) { list.scrollTop = Math.max(0, list.scrollTop - 1500); await wait(60); } }
    }
    // a list row clicked like a person would
    const row = [...document.querySelectorAll('#panel .item')].filter((r) => r.checkVisibility?.())[h % 6]; if (row) { await click(row); await wait(400); }
  },
  async send(h) {
    activate(C.id); await wait(150);
    if (!today || !H.chats.some((c) => c.id === today)) { Native.newChat(C.id); await wait(300); today = Native.current?.(C.id)?.id || H.activeChat?.[C.id]; }
    else { await Native.open(C.id, today); await wait(200); }
    Native.sendText(C.id, `hour ${h}: what about the fog in the intro scene, a table and some code`); await until(() => Native.isAgentBusy(C.id), 5000); await until(() => !Native.isAgentBusy(C.id), 90000);
    if (A && h % 3 === 2) {
      activate(A.id); await until(() => Native.hasView(A.id)); Native.newChat(A.id); await wait(200);
      Native.sendText(A.id, `astra hour ${h}`); await until(() => Native.isAgentBusy(A.id), 5000); await until(() => !Native.isAgentBusy(A.id), 90000);
      const made = Native.current?.(A.id)?.id; activate(C.id); await wait(200);
      if (made) await window.hub.deleteChat(made).catch(() => {}); // the day keeps one Claude chat, Astra's go to the trash
    }
  },
  async lab(h) {
    activate('tool:three'); await until(() => typeof ThreeLab !== 'undefined', 30000); await ThreeLab.cmd?.({ show: true });
    await until(() => ThreeLab.scenes?.all?.().length, 30000);
    const all = ThreeLab.scenes.all(); const id = all[(h * 7) % Math.min(all.length, 12)]?.id;
    let drawn = false; const on = (e) => { if (e.data?.source === 'three-sandbox' && e.data.type === 'stack-drawn') drawn = true; };
    addEventListener('message', on); try { ThreeLab.scenes.open(id); await until(() => drawn, 20000); } finally { removeEventListener('message', on); }
    await wait(2500);
    activate(C.id); await wait(300);
  },
  async sound() {
    await Lazy.load('creative'); activate('tool:creative'); await until(() => document.querySelector('.wb-stations, .wb-sound-desk'), 20000);
    CreativePlayground.openFeature?.('vst');
    const card = await until(() => [...document.querySelectorAll('.wb-instrument-card')].find((b) => /Vital/.test(b.textContent)), 15000);
    if (card) { card.click(); await until(() => /^LIVE/.test(document.querySelector('.wb-live-stats')?.textContent || ''), 15000); await wait(3000); }
    activate(C.id); await wait(500);
  },
  async quests() {
    await Lazy.load('questjournal'); activate('tool:quests');
    await until(() => typeof QuestJournal !== 'undefined' && QuestJournal.ready?.(), 30000);
    const map = [...document.querySelectorAll('.qj button')].find((b) => /^\s*Map\s*$/.test(b.textContent) || b.getAttribute('aria-label') === 'Map');
    if (map) { await click(map); await wait(1500); }
    activate(C.id); await wait(300);
    const chip = document.querySelector('.qh-chip'); if (chip) { await click(chip); await until(() => document.querySelector('.qh-panel'), 5000); await wait(800); QuestHud.close?.(); }
  },
  async dialogs(h) {
    activate(C.id); await wait(200);
    await AppUI.openSettings(); await until(() => document.querySelector('dialog.settings-dialog[open]'), 5000); await wait(400); document.querySelector('dialog.settings-dialog[open]')?.close(); await wait(200);
    await key('k', 2); await wait(400); for (const ch of 'sync') { await cdp('Input.dispatchKeyEvent', { type: 'char', text: ch }); await wait(40); } await wait(400); await key('Escape'); await wait(200);
    const c = Modal.confirm('Long day', `Hour ${h}: still here?`); await wait(300); document.querySelector('dialog[open] button')?.click(); await c.catch(() => {});
    const msg = [...(Native.view(C.id)?.list?.querySelectorAll('.msg.assistant .body') || [])].pop();
    if (msg) { msg.scrollIntoView({ block: 'center' }); await wait(100); await click(msg, 'right'); await wait(300); await key('Escape'); await wait(150); }
  },
  async tray() { await test({ window: 'hide' }); await wait(12000); await test({ window: 'show' }); await wait(800); },
  async night() {
    await test({ window: 'hide' }); await wait(3000);
    await test({ power: 'lock-screen' }); await test({ power: 'suspend' }); await test({ sleep: 'suspend' }); await wait(15000);
    await test({ sleep: 'resume' }); await test({ power: 'resume' }); await wait(2000); await test({ power: 'unlock-screen' }); await wait(2000);
    await test({ window: 'show' }); await wait(1000);
  },
};
// one hour of the day (h = 0 … ): 08:00 → 23:00 are day hours, 00:00 → 07:00 night hours
const DAY = [['lab', 'dialogs'], ['quests', 'sound'], ['dialogs', 'tray'], ['lab', 'quests'], ['sound', 'dialogs'], ['tray', 'lab']];
async function hour(h) {
  const at = (8 + h) % 24;
  await act('clock', tick);
  if (at < 8) { await act('night', parts.night); await act('chats', () => parts.chats(h)); return; }
  await act('chats', () => parts.chats(h));
  await act('send', () => parts.send(h));
  for (const p of DAY[h % DAY.length]) { await act(p, () => parts[p](h)); await calm(); }
}

// ---------- a sample (the same state every time) ----------
let snapped = false;
async function sample() {
  // what the last minute felt like (before the GCs below make their own pauses)
  const win = L.take();
  const lag = await test({ lag: { label: `m${out.samples.length}` } }).catch(() => null);
  const timersMain = (await test({ probe: 'take' }).catch(() => null))?.probe || null;
  const since = out.lastAt || T0; out.lastAt = Date.now();
  const jr = await window.hub.jank?.recent?.(Date.now() - since + 1000).catch(() => null);
  const stalls = (jr?.stalls || []).filter((x) => x.t + x.ms > since);
  // the standard state
  await calm(); activate(C.id); await Native.open(C.id, longChats[0]); await wait(1500);
  for (let i = 0; i < 2; i++) { await cdp('HeapProfiler.collectGarbage'); await wait(200); }
  const heap = (await cdp('Runtime.getHeapUsage')) || {};
  const dom = (await cdp('Memory.getDOMCounters')) || {};
  const listenersOn = async (expr) => { const o = await cdp('Runtime.evaluate', { expression: expr }); const id = o?.result?.objectId; if (!id) return null; const l = await cdp('DOMDebugger.getEventListeners', { objectId: id }); cdp('Runtime.releaseObject', { objectId: id }); const by = {}; for (const x of l?.listeners || []) by[x.type] = (by[x.type] || 0) + 1; return { n: (l?.listeners || []).length, by }; };
  const winL = await listenersOn('window'); const docL = await listenersOn('document');
  let attached = 0; { const w = document.createTreeWalker(document, NodeFilter.SHOW_ALL); while (w.nextNode()) attached++; }
  const live = P.live(); const main = (await test({ longrun: {} }).catch(() => null))?.longrun || null;
  const ipcWin = window.hub.ipcListeners?.() || null;
  const s = {
    min: r1((Date.now() - T0) / 60000), hour: out.hour,
    win: { heap: heap.usedSize, nodes: dom.nodes, attached, docs: dom.documents, js: dom.jsEventListeners, winL: winL?.n, docL: docL?.n, winBy: winL?.by, docBy: docL?.by,
      intervals: live.intervals, observers: live.observers, urls: live.urls, byInterval: live.byInterval, byObserver: live.byObserver, byListener: live.byListener,
      pending: win.pending, pendingTop: win.pendingTop, fires: win.fires, firesTop: win.firesTop, raf: P.rafCalls, ipc: ipcWin, chats: H.chats?.length, lag: win.lag, longs: win.longs },
    main: main && { heap: main.heap, rss: main.rss, ext: main.external, handles: main.handles, children: main.children, res: main.res, timers: main.timers, ipc: main.ipc, listeners: main.listeners, procs: main.procs, contents: main.contents, windows: main.windows },
    mainTimers: timersMain && { perMin: timersMain.perMin, top: timersMain.top?.slice(0, 6), statPolls: timersMain.statPollsPerMin },
    mainLag: lag?.delay ? { p99: lag.delay.p99, max: lag.delay.max, blocks: (lag.blocks || []).filter((b) => b.ms >= 100).map((b) => `${b.ms}ms · ${(b.app || []).slice(0, 3).join(' | ')} · from ${String(b.first || '').slice(0, 120)}`), ipcTop: (lag.ipc?.top || []).slice(0, 4).map((x) => `${x.n}× ${x.ms}ms ${x.k}`), sends: (lag.sends || []).slice(0, 4) } : null,
    stalls: { n: stalls.length, worst: Math.max(0, ...stalls.map((x) => x.ms)) },
  };
  P.rafCalls = 0;
  if (window.LR_SNAP && !snapped && Date.now() - T0 >= WARM) { snapped = true; await smoke({ snapshot: `${window.LR_SNAP}/win-a.heapsnapshot` }); await test({ longrun: { snapshot: `${window.LR_SNAP}/main-a.heapsnapshot` } }); }
  out.samples.push(s);
  // the sampling's own GCs / walks are not the next minute's hiccups
  L.reset(); await test({ lag: { label: 'after sample' } }).catch(() => null); await test({ probe: 'take' }).catch(() => null); out.lastAt = Date.now();
  return s;
}

// ---------- the day ----------
await sample();
let next = Date.now() + 60000; let h = 0;
while (Date.now() < END) {
  out.hour = h;
  await hour(h); h += 1;
  if (Date.now() >= next) { await sample(); next = Math.max(next + 60000, Date.now() + 30000); }
}
await sample();
if (window.LR_SNAP) { await smoke({ snapshot: `${window.LR_SNAP}/win-b.heapsnapshot` }); await test({ longrun: { snapshot: `${window.LR_SNAP}/main-b.heapsnapshot` } }); }
out.hours = h;
if (window.hub.sync?.off) await window.hub.sync.off().catch(() => {});

// ---------- growth per hour ----------
const S = out.samples;
const sum = (o) => Object.values(o || {}).reduce((a, v) => a + (Number(v) || 0), 0);
// [name, get, unit divisor, noise floor (gained over the run after the warm-up)]
const GROW = [
  ['window JS heap MB', (s) => s.win.heap, 1048576, 6 * 1048576],
  ['window DOM nodes', (s) => s.win.nodes, 1, 3000],
  ['window detached nodes', (s) => s.win.nodes - s.win.attached, 1, 3000],
  ['window JS listeners', (s) => s.win.js, 1, 400],
  ['window+document listeners', (s) => (s.win.winL || 0) + (s.win.docL || 0), 1, 12],
  ['window intervals', (s) => s.win.intervals, 1, 4],
  ['window pending timeouts', (s) => s.win.pending, 1, 15],
  ['window timeouts fired/min', (s) => s.win.fires, 1, 600],
  ['window observers', (s) => s.win.observers, 1, 20],
  ['window object URLs', (s) => s.win.urls, 1, 20],
  ['window IPC listeners', (s) => s.win.ipc?.total, 1, 6],
  ['main JS heap MB', (s) => s.main?.heap, 1048576, 6 * 1048576],
  ['main RSS MB', (s) => s.main?.rss, 1048576, 60 * 1048576],
  ['main timers alive', (s) => sum(s.main?.timers), 1, 8],
  ['main timers fired/min', (s) => s.mainTimers?.perMin, 1, 120],
  ['main handles', (s) => sum(s.main?.handles), 1, 10],
  ['main child processes', (s) => s.main?.handles?.ChildProcess || 0, 1, 2],
  ['main IPC listeners', (s) => s.main?.ipc?.total, 1, 3],
  ['main app/power/window listeners', (s) => (s.main?.listeners?.app?.n || 0) + (s.main?.listeners?.powerMonitor?.n || 0) + (s.main?.listeners?.win?.n || 0) + (s.main?.listeners?.wc?.n || 0), 1, 6],
  ['app processes', (s) => sum(Object.fromEntries(Object.entries(s.main?.procs || {}).map(([k, v]) => [k, v.n]))), 1, 2],
  ['web contents', (s) => s.main?.contents, 1, 2],
];
const after = S.filter((s) => s.min * 60000 >= WARM); const pts = after.length >= 5 ? after : S;
out.growth = []; out.curves = {};
for (const [name, get, div, floor] of GROW) {
  const xy = pts.map((s) => [s.min / 60, get(s)]).filter(([, y]) => Number.isFinite(y));
  out.curves[name] = S.map((s) => { const v = get(s); return Number.isFinite(v) ? r1(v / div) : null; });
  if (xy.length < 5) continue;
  const n = xy.length; const mx = xy.reduce((a, p) => a + p[0], 0) / n; const my = xy.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0; for (const [x, y] of xy) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  const slope = sxx ? sxy / sxx : 0; const r2 = sxx && syy ? (sxy * sxy) / (sxx * syy) : 0; const gained = slope * (xy.at(-1)[0] - xy[0][0]);
  const grows = r2 >= 0.6 && gained > floor && slope > 0;
  out.growth.push(`${grows ? '✖ GROWS' : 'ok'} ${name}: ${r1(xy[0][1] / div)} → ${r1(xy.at(-1)[1] / div)} (${slope >= 0 ? '+' : ''}${r1(slope / div)}/h, R² ${r1(r2)})`);
  if (grows) fails.push(`grows: ${name} +${r1(slope / div)}/h`);
}
// where it grows: per line / channel, the first sample after the warm-up → the last
const first = pts[0]; const last = S.at(-1);
const diff = (a, b, min) => Object.keys(b || {}).map((k) => [k, (b[k] || 0) - (a?.[k] || 0)]).filter(([, d]) => d >= min).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, d]) => `+${d} ${k}`);
const pairs = (arr) => Object.fromEntries(arr || []);
out.where = {
  windowListeners: diff(first.win.byListener, last.win.byListener, 5),
  windowIntervals: diff(first.win.byInterval, last.win.byInterval, 1),
  windowPending: diff(pairs(first.win.pendingTop), pairs(last.win.pendingTop), 3),
  windowWinDoc: [...diff(first.win.winBy, last.win.winBy, 2), ...diff(first.win.docBy, last.win.docBy, 2)],
  windowIpc: diff(first.win.ipc?.multi, last.win.ipc?.multi, 1),
  mainTimers: diff(first.main?.timers, last.main?.timers, 2),
  mainIpc: diff(first.main?.ipc?.multi, last.main?.ipc?.multi, 1),
  mainChildren: diff(first.main?.children, last.main?.children, 1),
  mainHandles: diff(first.main?.handles, last.main?.handles, 2),
  mainListeners: [...diff(first.main?.listeners?.app?.by, last.main?.listeners?.app?.by, 1), ...diff(first.main?.listeners?.powerMonitor?.by, last.main?.listeners?.powerMonitor?.by, 1), ...diff(first.main?.listeners?.win?.by, last.main?.listeners?.win?.by, 1), ...diff(first.main?.listeners?.wc?.by, last.main?.listeners?.wc?.by, 1)],
};
// ---------- hiccups: early vs late ----------
const third = Math.max(1, Math.floor((S.length - 1) / 3));
const early = S.slice(1, 1 + third); const late = S.slice(-third);
const hic = (arr) => ({ minutes: arr.length, mainBlocks100: arr.reduce((a, s) => a + (s.mainLag?.blocks?.length || 0), 0), mainP99avg: r1(arr.reduce((a, s) => a + (s.mainLag?.p99 || 0), 0) / arr.length), mainMax: Math.max(0, ...arr.map((s) => s.mainLag?.max || 0)),
  winLong100: arr.reduce((a, s) => a + (s.win.longs?.over100 || 0), 0), winLong250: arr.reduce((a, s) => a + (s.win.longs?.over250 || 0), 0), winLagP99avg: r1(arr.reduce((a, s) => a + (s.win.lag?.p99 || 0), 0) / arr.length), winLagMax: Math.max(0, ...arr.map((s) => s.win.lag?.max || 0)), stalls: arr.reduce((a, s) => a + (s.stalls?.n || 0), 0) });
out.hiccups = { early: hic(early), late: hic(late), all: hic(S.slice(1)) };
const E = out.hiccups.early; const La = out.hiccups.late;
if (La.mainBlocks100 > 2 * E.mainBlocks100 + 3) fails.push(`later main busy stretches ≥ 100 ms: ${E.mainBlocks100} → ${La.mainBlocks100}`);
if (La.winLong250 > 2 * E.winLong250 + 3) fails.push(`later window long tasks ≥ 250 ms: ${E.winLong250} → ${La.winLong250}`);
if (La.stalls > E.stalls + 2) fails.push(`later 🐢 hiccups: ${E.stalls} → ${La.stalls}`);
if (La.mainP99avg > 2 * E.mainP99avg + 10) fails.push(`later main p99: ${E.mainP99avg} → ${La.mainP99avg} ms`);
out.blocksLate = S.slice(-third).flatMap((s) => s.mainLag?.blocks || []).slice(0, 10);
if (Object.keys(out.errs).length) out.problems.push(...Object.entries(out.errs).map(([k, v]) => `${k}: ${v[0]}`).slice(0, 4));
// the whole series to a file (the output keeps the curves and the verdict)
try { const f = `${window.LR_OUT || window.SMOKE_TMP}/longrun72.json`; await window.hub.fs.write(f, JSON.stringify(out, null, 1)); out.file = f; } catch (err) { out.file = `not written: ${err.message}`; }
const brief = { minutes: MINUTES, hours: out.hours, acts: out.acts, setup: out.setup, growth: out.growth, where: out.where, hiccups: out.hiccups, blocksLate: out.blocksLate, curves: out.curves, file: out.file, errs: out.errs };
brief.fails = window.LR_REPORT ? [] : fails; if (window.LR_REPORT) brief.wouldFail = fails;
brief.problems = out.problems.filter((p) => !/^(lab|sound|quests|dialogs|tray|night|chats|send|clock):/.test(p)); brief.partErrors = out.problems.filter((p) => !brief.problems.includes(p));
brief.pass = !brief.fails.length && !brief.problems.length;
return brief;
