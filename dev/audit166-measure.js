// (round 166, audit166) a realistic owner session, measured area by area (docs/upgrades/audit166.md). Not a check
// (dev/checks/audit166.js asserts this round's two fixes): a smoke.js script with its own temp data folder and the fake
// engines. The session: the start · 3 projects with 2 long chats each (400 turns, Markdown, code, pictures in replies
// and attached to questions) · each chat opened and scrolled · a streamed reply · Settings opened and closed · Trim
// Hearth opened and closed · the command bar · switching projects · the Mood board (when it's on) · Hearth hidden for a
// while · the same chats and scroll again with the Forgeheart look.
//   node dev/smoke.js --fake-engines --keep --check-timeout 1500000 --script dev/audit166-measure.js [--app <copy>]
// Per area: every process' CPU ms (main, window, GPU, others), the window's main-thread task / script / style / layout
// ms, its wakeups (timers, frames, observers: by the line that asked), the main process' timer wakeups, long tasks
// (count, longest), bytes the window loaded (scripts, styles, pictures: transfer and decoded), changes under the data
// folder (file events, by file), the window's JS heap after a GC and its renderer's memory.
// Prints one "[AUDIT166] {json}" line at the end. With --keep, the data folder stays for `du` (data growth).
const probe = () => {
  if (window.__auProbe) return;
  const P = window.__auProbe = { n: 0, by: new Map(), since: performance.now() };
  const site = () => {
    const s = String(new Error().stack || '').split('\n').slice(3).filter((x) => /\.(js|html)/.test(x));
    const f = (l) => (l || '?').trim().replace(/^at\s+/, '').replace(/\(?[^()]*\/([^/]+\.(?:js|html)):(\d+):\d+\)?/, '$1:$2').slice(0, 70);
    return /\/(ui|powerwise)\.js:/.test(s[0] || '') && s[1] ? `${f(s[0])} < ${f(s[1])}` : f(s[0]);
  };
  const count = (k) => { P.n += 1; P.by.set(k, (P.by.get(k) || 0) + 1); };
  for (const [name, kind] of [['setTimeout', 'timeout'], ['setInterval', 'interval'], ['requestAnimationFrame', 'raf'], ['requestIdleCallback', 'idle']]) {
    const orig = window[name]; if (!orig) continue;
    window[name] = function (fn, ...rest) { if (typeof fn !== 'function') return orig.call(window, fn, ...rest); const k = `${kind} ${site()}`; return orig.call(window, function (...a) { count(k); return fn.apply(this, a); }, ...rest); };
  }
  for (const name of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
    const Orig = window[name]; if (!Orig) continue;
    window[name] = class extends Orig { constructor(fn, ...rest) { const k = `${name} ${site()}`; super(function (...a) { count(k); return fn.apply(this, a); }, ...rest); } };
  }
  P.lt = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lt.push(Math.round(e.duration)); }).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
  P.take = () => {
    const ms = performance.now() - P.since; const per = (x) => Math.round(x * 10000 / ms) / 10;
    const o = { perSec: per(P.n), top: [...P.by].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${per(v)}/s ${k}`), longTasks: P.lt.length, longestMs: Math.max(0, ...P.lt) };
    P.n = 0; P.by.clear(); P.lt = []; P.since = performance.now(); return o;
  };
};
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: `(${probe.toString()})();` } });
return 'probe installed';
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 150) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const P = window.__auProbe;
const out = { areas: {}, notes: [] };
const A = out.areas;
const r1 = (x) => Math.round(x * 10) / 10;
const KB = (b) => Math.round(b / 1024);
const label = (m, pid) => {
  const pages = m.pages.filter((p) => p.pid === pid);
  if (pages.some((p) => p.type === 'window' && /index\.html/.test(p.url))) return 'window';
  if (pages.length) return 'other pages';
  const pr = m.procs.find((x) => x.pid === pid);
  return pr.type === 'Browser' ? 'main' : pr.type === 'GPU' ? 'gpu' : 'helpers';
};
const met = async () => (await T({ metrics: true, mem: true }))?.metrics || { procs: [], pages: [] };
const cpuBy = (m) => { const o = {}; for (const q of m.procs) { const k = label(m, q.pid); o[k] = (o[k] || 0) + (q.cpuS || 0); } return o; };
const perf = async () => { const r = await smoke({ cdp: 'Performance.getMetrics', params: {} }); const o = {}; for (const x of r?.metrics || []) o[x.name] = x.value; return o; };
const gc = async () => { for (let i = 0; i < 2; i++) { await smoke({ cdp: 'HeapProfiler.collectGarbage', params: {} }).catch(() => {}); await wait(100); } };
await smoke({ cdp: 'Performance.enable', params: {} });
const resIdx = () => performance.getEntriesByType('resource').length;
const resSince = (i) => {
  const list = performance.getEntriesByType('resource').slice(i);
  const o = { n: list.length, transferKB: 0, decodedKB: 0, by: {} };
  for (const e of list) {
    const k = /\.js(\?|$)/.test(e.name) ? 'js' : /\.css(\?|$)/.test(e.name) ? 'css' : /\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i.test(e.name) || e.initiatorType === 'img' ? 'img' : 'other';
    o.by[k] = (o.by[k] || 0) + (e.decodedBodySize || 0);
    o.transferKB += e.transferSize || 0; o.decodedKB += e.decodedBodySize || 0;
  }
  o.transferKB = KB(o.transferKB); o.decodedKB = KB(o.decodedKB); for (const k of Object.keys(o.by)) o.by[k] = KB(o.by[k]);
  return o;
};
const winMem = (m) => { const page = (m.pages || []).find((p) => /index\.html/.test(p.url) && p.type === 'window'); const pr = page && m.procs.find((x) => x.pid === page.pid); return pr ? { wsMB: Math.round(pr.mem / 1024), privMB: pr.priv ? Math.round(pr.priv / 1024) : null } : null; };
const allMem = (m) => Math.round(m.procs.reduce((s, q) => s + (q.mem || 0), 0) / 1024);
async function area(name, fn, { heap = true } = {}) {
  await T({ probe: 'start' }); await T({ writes: 'start' }); P.take();
  const m0 = await met(); const p0 = await perf(); const r0 = resIdx(); const t0 = performance.now();
  let note = null; try { note = await fn(); } catch (err) { note = `error: ${err.message}`; }
  const ms = performance.now() - t0;
  const m1 = await met(); const p1 = await perf();
  const c0 = cpuBy(m0); const c1 = cpuBy(m1);
  const cpu = {}; for (const k of Object.keys(c1)) cpu[k] = Math.round(((c1[k] || 0) - (c0[k] || 0)) * 1000);
  const mainP = (await T({ probe: 'take' }))?.probe; const w = (await T({ writes: 'take' }))?.writes;
  const win = P.take();
  if (heap) await gc();
  const m2 = heap ? await met() : m1; const p2 = heap ? await perf() : p1;
  A[name] = { seconds: r1(ms / 1000), cpuMs: cpu, cpuTotalMs: Object.values(cpu).reduce((a, b) => a + b, 0),
    window: { taskMs: Math.round((p1.TaskDuration - p0.TaskDuration) * 1000), scriptMs: Math.round((p1.ScriptDuration - p0.ScriptDuration) * 1000), styleMs: Math.round((p1.RecalcStyleDuration - p0.RecalcStyleDuration) * 1000), layoutMs: Math.round((p1.LayoutDuration - p0.LayoutDuration) * 1000), wakeupsPerSec: win.perSec, topWakeups: win.top, longTasks: win.longTasks, longestTaskMs: win.longestMs },
    mainWakeupsPerMin: mainP?.perMin, mainTop: mainP?.top?.slice(0, 4), loaded: resSince(r0), writes: w?.events, writesTop: w?.files?.slice(0, 6),
    heapMB: r1((p2.JSHeapUsedSize || 0) / 1048576), domNodes: p2.Nodes, winMem: winMem(m2), allProcsMB: allMem(m2), note: note ?? undefined };
}

// ---------- the start (the script runs once the window is up: what it loaded to get there) ----------
{
  const r = resSince(0); const m = await met(); const p = await perf();
  const nav = performance.getEntriesByType('navigation')[0];
  const paint = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint');
  A.start = { loaded: r, fcpMs: Math.round(paint?.startTime || 0), domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd || 0), heapMB: r1(p.JSHeapUsedSize / 1048576), domNodes: p.Nodes, winMem: winMem(m), allProcsMB: allMem(m), procs: m.procs.length };
}
await area('settle', () => wait(40000));
await area('idle', () => wait(30000));

// ---------- 3 projects × 2 long chats (400 turns: Markdown, code, tables, pictures) ----------
const claude = H.claudeAgent(); activate(claude.id); await wait(400);
if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
await Projects.ready(); await until(() => ProjChats._ok(), 20000);
const root = decodeURIComponent(new URL('.', location.href).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const png = `${root}assets/swirl.svg`;
const code = (n, k) => ['```js', ...Array.from({ length: n }, (_, j) => `const v${j} = scene.getObjectByName('layer${k}_${j}'); // tweak ${j}`), '```'].join('\n');
const table = (n) => ['| part | value | note |', '|---|---:|---|', ...Array.from({ length: n }, (_, j) => `| bloom ${j} | ${j * 3} | glow ${j} |`)].join('\n');
const replyText = (i) => [`Reply ${i}: **the plan** with \`code\` and a [link](https://example.com/${i}).`, '', '- one thing', '- another, a little longer, to wrap across the line', '',
  i % 4 === 1 ? code(i % 3 === 0 ? 40 : 10, i) : 'A paragraph of plain words to give it some height and wrap once or twice in the chat width here.',
  i % 7 === 3 ? `\n${table(6)}` : '', i % 9 === 5 ? `\n![frame ${i}](https://img.hearth.test/640x360/${i}.png)` : ''].join('\n');
const fixture = (N, tag) => {
  const t0 = Date.now() - N * 60000;
  return { id: `au-${tag}-${Date.now()}`, agentId: claude.id, title: `Session ${tag}`, createdAt: t0, updatedAt: Date.now(),
    messages: Array.from({ length: N }, (_, i) => (i % 2 === 0
      ? { role: 'user', text: `Question ${i}: what about this part?`, at: t0 + i * 60000, ...(i % 40 === 10 ? { attachments: [{ kind: 'image', name: 'ref.png' }], images: [png] } : {}) }
      : { role: 'assistant', text: replyText(i), at: t0 + i * 60000, usage: { input: 2000 + i, output: 300 + i }, ...(i % 3 === 2 ? { tools: ['Read', 'Grep', 'mcp__hearth__three_eval'] } : {}), ...(i % 15 === 7 ? { shows: [{ path: png, caption: `shot ${i}` }] } : {}) })) };
};
const projects = []; const chats = {};
await area('seed', async () => {
  for (let k = 0; k < 3; k++) {
    const p = Projects.create({ name: `Audit project ${k + 1}` }); projects.push(p); ProjChats.setScope(p.id); await wait(300);
    chats[p.id] = [];
    for (let j = 0; j < 2; j++) {
      const c = fixture(400, `${k}${j}`); await window.hub.saveChat(c); Native.save(c);
      H.chats = [{ id: c.id, agentId: c.agentId, title: c.title, updatedAt: c.updatedAt, pinned: false }, ...H.chats.filter((x) => x.id !== c.id)];
      Projects.add(p, 'chat', c.id, c.title, { links: false }); chats[p.id].push(c.id);
    }
  }
  await Projects.flush?.(); return '3 projects × 2 chats × 400 turns';
}, { heap: false });

const v = () => Native.view(claude.id);
const list = () => v().list;
const wheel = (dy) => { const r = list().getBoundingClientRect(); return smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: r.left + r.width / 2, y: r.top + r.height / 2, deltaX: 0, deltaY: dy } }); };
const key = async (k, code, mods = 0) => { for (const type of ['keyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : { Enter: 13, Escape: 27 }[k] || 0 } }); };
const openChat = async (id) => { Native.open(claude.id, id); await until(() => H.activeChat[claude.id] === id && list()?.querySelectorAll('.msg').length >= 20, 15000); await wait(400); };
const scroll = async (n = 30) => { for (let i = 0; i < n; i++) { await wheel(-500); await wait(90); } await wait(600); };

await area('open-chats', async () => { for (const p of projects) { ProjChats.setScope(p.id); await wait(300); for (const id of chats[p.id]) await openChat(id); } return '6 chats opened'; });
await area('scroll', async () => { await openChat(chats[projects[0].id][0]); await scroll(40); return '40 wheel turns up'; });
await area('stream', async () => {
  const id = chats[projects[0].id][0]; await openChat(id);
  const ta = v().input; ta.value = 'huge-text-40k'; ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.closest('form').requestSubmit();
  await until(() => Native.isBusy(id), 8000); await until(() => !Native.isBusy(id), 90000); await wait(800);
  return 'a 40 K-character reply streamed into a 400-turn chat';
});
await area('settings', async () => {
  const t = performance.now(); await AppUI.openSettings(); await until(() => document.querySelector('.settings-dialog, dialog[open], .modal'), 5000); const openMs = Math.round(performance.now() - t);
  await wait(1500); await key('Escape', 'Escape'); await wait(600);
  const t2 = performance.now(); await AppUI.openSettings(); const reopenMs = Math.round(performance.now() - t2); await wait(800); await key('Escape', 'Escape'); await wait(600);
  return `open ${openMs} ms, again ${reopenMs} ms`;
});
await area('trim', async () => {
  const t = performance.now(); await Commands.tryRun('/trim', claude.id); await until(() => document.querySelector('.trim-panel, #trim, [class*="trim"]'), 5000);
  const openMs = Math.round(performance.now() - t); await wait(1500); await key('Escape', 'Escape'); await wait(600); return `open ${openMs} ms`;
});
await area('cmdbar', async () => {
  for (let i = 0; i < 3; i++) { const t = performance.now(); await key(';', 'Semicolon', 2); await wait(500); await smoke({ cdp: 'Input.insertText', params: { text: 'open project' } }); await wait(700); await key('Escape', 'Escape'); await wait(400); if (!i) out.notes.push(`command bar first open+type ${Math.round(performance.now() - t)} ms`); }
  return '3 × open, type, close';
});
await area('switch-projects', async () => { for (let i = 0; i < 6; i++) { ProjChats.setScope(projects[i % 3].id); await wait(500); await openChat(chats[projects[i % 3].id][i % 2]); } return '6 switches'; });
const boardOn = !window.HearthFeatures || HearthFeatures.enabled('board');
if (boardOn) {
  await area('board', async () => { try { activate('tool:board'); } catch { /* none */ } await wait(4000); activate(claude.id); await wait(1500); return 'Mood board opened and left'; });
}
await area('hidden', async () => { await T({ window: 'hide' }); await wait(60000); await T({ window: 'show' }); await wait(1500); return '60 s hidden'; });
await area('idle-after', () => wait(30000));

// ---------- the same with the Forgeheart look ----------
H.config.theme = { ...(H.config.theme || {}), ...AppUI.THEMES.forgeheart, preset: 'forgeheart' };
delete H.config.theme.label; delete H.config.theme.group;
applyTheme(document.getElementById('user-theme').textContent);
try { window.Look?.applyPreset?.('forgeheart'); } catch { /* the look's own */ }
await wait(2500);
out.forgeSkin = document.documentElement.dataset.skin || null;
await area('forge-idle', () => wait(30000));
await area('forge-scroll', async () => { await openChat(chats[projects[1].id][0]); await scroll(40); return '40 wheel turns up (Forgeheart)'; });
await area('forge-stream', async () => {
  const id = chats[projects[1].id][0]; await openChat(id);
  const ta = v().input; ta.value = 'huge-text-40k'; ta.dispatchEvent(new Event('input', { bubbles: true })); ta.closest('form').requestSubmit();
  await until(() => Native.isBusy(id), 8000); await until(() => !Native.isBusy(id), 90000); await wait(800); return 'streamed (Forgeheart)';
});
await area('forge-settings', async () => { await AppUI.openSettings(); await wait(1500); await key('Escape', 'Escape'); await wait(600); });
await area('forge-switch', async () => { for (let i = 0; i < 6; i++) { ProjChats.setScope(projects[i % 3].id); await wait(500); await openChat(chats[projects[i % 3].id][i % 2]); } });
await area('forge-hidden', async () => { await T({ window: 'hide' }); await wait(60000); await T({ window: 'show' }); await wait(1500); });
out.modules = (await T({ modules: true }))?.modules?.count;
console.log(`[AUDIT166] ${JSON.stringify(out)}`);
return out;
