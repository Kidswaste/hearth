// Lightweight (round 34): does an hour-like session leave Hearth heavier once it's over? The soak test's counters
// (dev/soak.js PROBE: live observers / intervals / object URLs / WebGL contexts and listeners by the line that added
// them) go in before the app's scripts (a reload), then a compressed session runs three times: the Lab opened (a scene
// drawn) and left · ⋯ AI setup opened / closed · several chats (new ones answered, older 80-message ones reopened) ·
// a long streamed reply · Astra answering · ◉ Activity opened / closed · then everything closed again (back to one chat).
// Samples after a forced GC: renderer JS heap, DOM nodes, JS listeners, documents / frames, window listeners, live
// observers / intervals / URLs / WebGL contexts, chats kept in memory, process memory by type (main, renderer, GPU,
// utility, hidden pages) and every page / iframe / worker target.
// Fails when the heap after the session grows past its budget, when the second → third session still grows (a leak:
// a session should cost nothing once closed), or when a known leak source comes back (observers, intervals, window
// listeners, hidden pages or WebGL contexts left after closing).
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/lightweight.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const src = await hub.fs.read(`${SMOKE_DEV}/soak.js`);
const body = src.slice(src.indexOf('const PROBE = `') + 15, src.indexOf('})();`;', src.indexOf('const PROBE = `')) + 5);
const PROBE = body.replace(/\\\\/g, '\\'); // the template literal's only escapes are doubled backslashes (no eval: the page's CSP)
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: PROBE } });
return 'probe installed';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
const out = { samples: {} }; const fail = [];
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const P = window.__soakProbe;
ok(P, 'the probe is in (reload with the counters)');
const cdp = (method, params = {}) => smoke({ cdp: method, params });
const C = H.claudeAgent();
const A = Native.astraAgent?.();
await smoke({ cdp: 'Performance.enable' });
const metrics = async () => { const r = await cdp('Performance.getMetrics'); const o = {}; for (const m of r.metrics || []) o[m.name] = m.value; return o; };
const winListeners = async () => { const w = await cdp('Runtime.evaluate', { expression: 'window' }); const r = await cdp('DOMDebugger.getEventListeners', { objectId: w.result.objectId }); return r.listeners?.length ?? null; };
const docListeners = async () => { const w = await cdp('Runtime.evaluate', { expression: 'document' }); const r = await cdp('DOMDebugger.getEventListeners', { objectId: w.result.objectId }); return r.listeners?.length ?? null; };
async function sample(name) {
  hideMenu?.(); document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(2500);
  for (let i = 0; i < 3; i++) { await cdp('HeapProfiler.collectGarbage'); await wait(200); }
  const m = await metrics(); const live = P.live(); const gl = P.gl();
  const bg = await hub.bgState(); const procs = {}; for (const p of bg.procs) { const k = p.type === 'Utility' ? `Utility:${p.name}` : p.type; procs[k] = (procs[k] || 0) + p.mb; }
  await cdp('DOM.enable'); const dd = (await cdp('DOM.getDetachedDomNodes')).detachedNodes || []; await cdp('DOM.disable');
  const detached = {}; let detachedN = 0; for (const n of dd) { const t = n.treeNode || {}; const a = t.attributes || []; const k = `${(t.nodeName || '?').toLowerCase()}${a.includes('class') ? `.${String(a[a.indexOf('class') + 1]).split(' ')[0]}` : ''}`; const c = 1 + (n.retainedNodeIds?.length || 0); detached[k] = (detached[k] || 0) + c; detachedN += c; }
  const targets = ((await cdp('Target.getTargets')).targetInfos || []).map((t) => `${t.type} ${t.url.replace(/^file:\/\/\/[^#?]*\//, '').slice(0, 60)}`);
  const s = { heapMB: Math.round(m.JSHeapUsedSize / 1e5) / 10, nodes: m.Nodes, listeners: m.JSEventListeners, docs: m.Documents, frames: m.Frames, winL: await winListeners(), docL: await docListeners(),
    detachedN, detached, observers: live.observers, intervals: live.intervals, urls: live.urls, gl: gl.contexts, procs, procN: bg.procs.length, targets, topObservers: live.topObservers, topIntervals: live.topIntervals, byListener: live.byListener, byDom: live.byDom };
  out.samples[name] = s;
  return s;
}

// older chats to reopen (80 messages each), made once
const para = (i) => `Reply ${i}: some **text** with \`code\` and a [link](https://example.com).\n\n- one\n- two\n\nAnother paragraph of plain words.`;
const olds = [];
for (let k = 0; k < 6; k++) {
  const at0 = Date.now() - 900000 - k * 1000;
  const c = { id: `lw-old-${k}`, agentId: C.id, title: `LW older ${k}`, createdAt: at0, updatedAt: at0, messages: Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: i % 2 ? para(i) : `Question ${i}?`, at: at0 + i * 100 })) };
  await window.hub.saveChat(c); olds.push(c);
}
const made = []; // chats this check started (removed at the end)
const idle = (id) => until(() => !Native.isAgentBusy(id), 60000);
async function session(i) {
  // the Lab: opened, a scene drawn, left
  activate('tool:three'); await ThreeLab.cmd(); await until(() => ThreeLab.scenes && ThreeLab.director, 20000); await wait(3000);
  activate(C.id); await wait(500);
  // ⋯ AI setup, three times
  for (let k = 0; k < 3; k++) {
    const b = Native.view(C.id)?.root.querySelector('.native-head button[aria-label="Chat options"]');
    if (b) b.click(); else { await Lazy.load('options'); Options.open({ agentId: C.id }); }
    await until(() => document.querySelector('aside.opt-sheet')); await wait(300);
    Options.hide(); await wait(200);
  }
  // several chats: two new ones answered, the older ones reopened
  for (let k = 0; k < 2; k++) {
    Native.newChat(C.id); await wait(200);
    Native.sendText(C.id, `hello ${i}.${k} table`); await until(() => Native.isAgentBusy(C.id), 5000); await idle(C.id);
    made.push(Native.current?.(C.id)?.id || H.activeChat?.[C.id]);
  }
  for (const c of olds) { Native.open(C.id, c.id); await wait(350); }
  // a long streamed reply
  Native.newChat(C.id); await wait(200);
  Native.sendText(C.id, 'long think please'); await until(() => Native.isAgentBusy(C.id), 5000); await idle(C.id);
  made.push(Native.current?.(C.id)?.id);
  // Astra answers too
  if (A) { activate(A.id); await until(() => Native.hasView(A.id)); Native.newChat(A.id); await wait(200); Native.sendText(A.id, `astra ${i} code`); await until(() => Native.isAgentBusy(A.id), 5000); await idle(A.id); made.push(Native.current?.(A.id)?.id); activate(C.id); }
  // ◉ Activity
  await Lazy.load('activity'); Activity.open(); await wait(600); Activity.close(); await wait(200);
}
async function closeAll() {
  Options.sheet && Options.hide?.(); Activity.close?.();
  activate(C.id); Native.open(C.id, olds[0].id); await wait(500);
  // a steady state: the chats this session made go again (what stays is then what the session left behind)
  for (const id of made.splice(0)) if (id) await Native.remove(id).catch(() => {});
  document.querySelectorAll('.toast').forEach((t) => t.remove());
}

const t0 = performance.now();
await sample('start');
const N = Number(localStorage.lwSessions) || 3;
for (let i = 1; i <= N; i++) {
  await session(i);
  if (i === 1) await sample('session');
  await closeAll();
  await sample(`closed${i}`);
}
out.ms = Math.round(performance.now() - t0);
out.readyMs = Math.round(performance.getEntriesByName('hearth:ready')[0]?.startTime || 0);
const S = out.samples; const s0 = S.start; const a = S[`closed${N - 1}`]; const z = S[`closed${N}`];
const diff = (x, y) => { const o = {}; for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) { const d = (y?.[k] || 0) - (x?.[k] || 0); if (d) o[k] = d; } return o; };
out.perSession = { heapMB: Math.round((z.heapMB - a.heapMB) * 10) / 10, nodes: z.nodes - a.nodes, listeners: z.listeners - a.listeners, docL: z.docL - a.docL, winL: z.winL - a.winL, observers: z.observers - a.observers, intervals: z.intervals - a.intervals, listenersWhere: diff(a.byListener, z.byListener), detachedWhere: diff(a.detached, z.detached) };
out.afterAll = { heapMB: Math.round((z.heapMB - s0.heapMB) * 10) / 10, nodes: z.nodes - s0.nodes, listeners: z.listeners - s0.listeners, procs: z.procN - s0.procN, mb: Object.fromEntries(Object.keys(z.procs).map((k) => [k, `${s0.procs[k] ?? '–'} → ${z.procs[k]}`])) };

// ---------- budgets (measured round 34 on 4 CPUs, software GL: start 9.1 MB heap · after 3 sessions 13.6 MB · a
// session once warm: +0–0.4 MB, +0–130 nodes, +1 listener; before the round's fixes: +0.6 MB, +2,580 nodes, +226 listeners) ----------
ok(z.heapMB - s0.heapMB <= 8, `heap after the sessions within 8 MB of the start (${s0.heapMB} → ${z.heapMB} MB)`);
ok(z.heapMB - a.heapMB <= 1.2, `a session once warm costs ≤ 1.2 MB of heap (${a.heapMB} → ${z.heapMB} MB)`);
ok(z.nodes - a.nodes <= 600, `a session once warm leaves ≤ 600 nodes (${a.nodes} → ${z.nodes})`);
ok(z.listeners - a.listeners <= 40, `a session once warm leaves ≤ 40 listeners (${a.listeners} → ${z.listeners})`);
// known leak sources, after closing: the ⋯ AI setup sheets (document listeners kept each one), observers, timers,
// window / document listeners, hidden pages, WebGL contexts in the window
ok(z.docL <= a.docL && z.docL - s0.docL <= 16, `document listeners don't grow per session (${s0.docL} · ${a.docL} → ${z.docL})`);
ok(z.winL <= a.winL && z.winL - s0.winL <= 30, `window listeners don't grow per session (${s0.winL} · ${a.winL} → ${z.winL})`);
// (round 74, checkhealth74) + chat-rest.js's IntersectionObserver, one per chat list drawn (round 72: 3 here, Claude /
// Astra / the Lab's dock) made during the first session and kept: measured 20 → 38 → 38 on 660fb71 (flat once warm,
// what this guards), so the allowance from the start is 16 + 3 (one per list) — a per-session leak still fails the first half
ok(z.observers <= a.observers && z.observers - s0.observers <= 19, `observers don't grow per session (${s0.observers} · ${a.observers} → ${z.observers}: ${z.topObservers.join(' · ')})`);
ok(z.intervals <= a.intervals && z.intervals - s0.intervals <= 3, `intervals don't grow per session (${s0.intervals} · ${a.intervals} → ${z.intervals}: ${z.topIntervals.join(' · ')})`);
ok((z.detached['aside.opt-sheet'] || 0) <= 400, `closed ⋯ AI setup sheets are let go (${z.detached['aside.opt-sheet'] || 0} detached nodes of them)`);
const sheetBtns = Object.entries(z.byListener).filter(([k]) => /btn options\.js/.test(k)).reduce((n, [, v]) => n + v, 0);
// (round 39) a sheet now has 4 of these buttons (round 38's Tidy memory… is the 4th): two sheets = 8
ok(sheetBtns <= 8, `AI setup's buttons kept for two sheets at most (${sheetBtns} listeners; 4 a sheet, ${N * 3} sheets opened)`);
ok(z.gl === 0, `no WebGL context left in the window (${z.gl})`);
const pages = z.targets.filter((t) => /^page /.test(t)); const frames = z.targets.filter((t) => /^iframe /.test(t));
ok(pages.length === 1 && frames.length <= 1 && frames.every((t) => /three-sandbox/.test(t)), `no hidden page left but the Lab's preview (${z.targets.join(' | ')})`);
ok(z.procN <= s0.procN + 1, `processes: the Lab's preview at most (${s0.procN} → ${z.procN})`);
ok(z.urls === 0 || z.urls <= s0.urls, `object URLs let go (${z.urls})`);
// compact: the big per-site maps only where they changed
for (const s of Object.values(S)) { delete s.byListener; delete s.byDom; s.detached = Object.fromEntries(Object.entries(s.detached).filter(([, n]) => n >= 20)); }
out.ok = !fail.length; out.fail = fail;
return JSON.stringify(out, null, 1);
