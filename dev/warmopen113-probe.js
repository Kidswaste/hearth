// (round 113, warmopen113) A warm project switch on the heavy profile, measured: dev/bigprofile.js's 40 projects (the
// fixture perfguard uses, /tmp/hearth-bigprofile72: made up, never real data), "Clink" (pjbp0: a 700-message chat, 14
// related long chats, 4 scenes, 3 boards, 400 files, 220 captures, 120 renders) and two others, each left last on the
// Lab (its return point's tab 'scene'). Before the reload: each opened once and left on the Lab. After it: Clink opened
// from its card (cold), then the name ▾ switcher (a real click on the project's name, then its row) between the three,
// ROUNDS rounds, then ‹ Projects → the Clink card again (perfguard's warm open) twice. For each:
//   ready     click → the workspace says ready (its card gone, the Lab on screen): the time until usable
//   chat      click → the project's chat shows messages
//   scene     the scene's own page work inside it (its first layer started → every layer drawn, + ready-prep's
//             warm-up), as perfguard's probe counts it; hearth = ready − scene (perfguard's "Hearth's part")
//   long      the window's longest tasks (PerformanceObserver longtask; the scene's own page left out) and the long
//             animation frames' heaviest scripts
//   cpu       the window thread's CPU ms (CDP Performance ThreadTime) for the open
// With localStorage 'wo113.prof' = '1' (an --eval before the first part: window.WO_PROF = 1): a CPU profile over the
// switches, its long stretches (≥ 40 ms) with their heaviest app functions.
// Written to <SMOKE_TMP>/warmopen113.json.
//   node dev/smoke.js --fake-engines --data /tmp/hearth-bigprofile72 --wait 1000 --check-timeout 900000 --tmp <dir> --script dev/warmopen113-probe.js
{ const w8 = (ms) => new Promise((r) => setTimeout(r, ms));
  const til = async (fn, what, n = 1500) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await w8(20); } throw Error(`timed out: ${what}`); };
  await til(() => document.querySelector('#agent-buttons .space-button'), 'app'); await w8(2500);
  try { localStorage.setItem('wo113.prof', window.WO_PROF ? '1' : '0'); localStorage.setItem('wo113.rounds', String(window.WO_ROUNDS || 3)); } catch { /* none */ }
  document.querySelector('#agent-buttons [data-space=projects]').click();
  await til(() => document.querySelector('.pj-card[data-project="pjbp0"]'), 'cards'); await w8(300);
  // each project opened once and left on the Lab (its last view)
  for (const id of ['pjbp1', 'pjbp2', 'pjbp0']) {
    await ProjectWorkspace.open(id);
    await til(() => ProjectWorkspace.state().phase === 'ready' && ProjectWorkspace.state().project === id, `${id} open`, 3000);
    await ProjectWorkspace.go('scene'); await w8(700);
  }
  await ProjectWorkspace.home(); await Projects.flush(); await w8(800);
  const rp = store.get('workspace.returnPoints', {});
  return JSON.stringify({ session: 'before the reload', tabs: Object.fromEntries(['pjbp0', 'pjbp1', 'pjbp2'].map((id) => [id, rp[id]?.tab])) }); }
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, what, n = 1500) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(20); } throw Error(`timed out: ${what}`); };
const r0 = (x) => Math.round(x);
const PROF = localStorage.getItem('wo113.prof') === '1';
const ROUNDS = Number(localStorage.getItem('wo113.rounds')) || 3;
const out = { rounds: ROUNDS, steps: [], problems: [] };
const longs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: e.startTime, ms: r0(e.duration), who: e.name }); }).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
const loafs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) loafs.push(e); }).observe({ type: 'long-animation-frame', buffered: true }); } catch { /* none */ }
const own = (x) => !/cross-origin/.test(x.who || '');
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(15000)]);
await cdp('Performance.enable');
const thr = async () => { const m = (await cdp('Performance.getMetrics'))?.metrics || []; const v = m.find((x) => x.name === 'ThreadTime')?.value; return Number.isFinite(v) ? v * 1000 : NaN; };
const isReady = (id) => { const s = ProjectWorkspace.state(); return s.phase === 'ready' && s.project === id; };
const chatDrawn = (id) => { const c = ProjectWorkspace.current()?.id === id ? ProjectWorkspace.currentChat() : null; const v = c && H.activeChat[c.agentId] === c.id && Native.view(c.agentId); return Boolean(v?.list?.querySelector('.msg')); };
const card = (id) => document.querySelector(`.pj-card[data-project="${id}"]`);
const menuItem = (re) => [...document.querySelectorAll('#menu button')].find((b) => re.test(b.textContent.trim()));
const mid = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const realClick = async (n) => { const [x, y] = mid(n); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
const sc = { start: 0, drawn: 0, warm: 0 };
addEventListener('message', (e) => { const d = e.data; const t = d?.type; if (t === 'fixture-layer-start' && !sc.start) sc.start = d.at; if (t === 'stack-drawn') sc.drawn = Date.now(); if (t === 'ready-prepped') sc.warm = Number(d.ms) || 0; }, true);
// the CPU profile (PROF): long stretches without idle, each with its heaviest app functions (inclusive)
let prof = null;
const profStart = async () => { if (!PROF) return; await cdp('Profiler.enable'); await cdp('Profiler.setSamplingInterval', { interval: 250 }); await cdp('Profiler.start'); prof = true; };
const profStop = async () => {
  if (!prof) return null; prof = null;
  const p = (await cdp('Profiler.stop'))?.profile; if (!p) return null;
  const by = new Map(p.nodes.map((n) => [n.id, n])); const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = (f) => `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`;
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${Math.round(v * 10) / 10}ms ${k}`);
  const tasks = []; let cur = null; const self = new Map();
  for (let i = 0; i < p.samples.length; i++) {
    const f = by.get(p.samples[i]).callFrame; const dt = (p.timeDeltas[i] || 0) / 1000;
    if (f.functionName === '(idle)') { if (cur) tasks.push(cur); cur = null; continue; }
    if (!/^\((program|root)\)$/.test(f.functionName)) self.set(key(f), (self.get(key(f)) || 0) + dt);
    if (!cur) cur = { ms: 0, incl: new Map(), self: new Map() };
    cur.ms += dt; cur.self.set(key(f), (cur.self.get(key(f)) || 0) + dt);
    const seen = new Set(); for (let id = p.samples[i]; id != null; id = parent.get(id)) { const g = by.get(id).callFrame; if (!/\.js$/.test(g.url)) continue; const k = key(g); if (!seen.has(k)) { seen.add(k); cur.incl.set(k, (cur.incl.get(k) || 0) + dt); } }
  }
  if (cur) tasks.push(cur);
  return { self: top(self, 25), long: tasks.filter((x) => x.ms >= 40).sort((a, b) => b.ms - a.ms).slice(0, 10).map((x) => ({ ms: r0(x.ms), incl: top(x.incl, 14), self: top(x.self, 8) })) };
};
async function step(kind, id, act) {
  await frame(); Object.assign(sc, { start: 0, drawn: 0, warm: 0 });
  const c0 = await thr(); const t = performance.now();
  await act();
  let chat = 0;
  await until(() => { if (!chat && chatDrawn(id)) chat = r0(performance.now() - t); return isReady(id); }, `${id} ready`, 3000);
  const ready = performance.now() - t; await frame();
  const cpu = (await thr()) - c0;
  if (!chat) { await until(() => chatDrawn(id), `${id} chat`, 300).catch(() => {}); chat = r0(performance.now() - t); }
  const scene = (sc.start && sc.drawn > sc.start ? sc.drawn - sc.start : 0) + sc.warm;
  await wait(1200); // what it left behind
  const ls = longs.filter((x) => x.at >= t && own(x)).map((x) => x.ms).sort((a, b) => b - a);
  const frames = loafs.filter((e) => e.startTime >= t && e.duration > 50).sort((a, b) => b.duration - a.duration).slice(0, 3)
    .map((e) => `${r0(e.duration)}ms: ${[...(e.scripts || [])].sort((a, b) => b.duration - a.duration).slice(0, 4).map((x) => `${r0(x.duration)} ${x.invoker || ''} ${x.sourceFunctionName || ''}@${String(x.sourceURL || '').split('/').pop()}`).join(' · ')}`);
  const s = { kind, id, ready: r0(ready), chat, scene: r0(scene), hearth: r0(ready - scene), cpu: r0(cpu), longest: ls[0] || 0, long: ls.slice(0, 6), frames, timings: ProjectWorkspace.state().timings, tab: ProjectWorkspace.state().lastSwitch?.tab || null, onLab: H.activeId === 'tool:three' };
  out.steps.push(s);
  return s;
}
try {
  document.querySelector('#agent-buttons [data-space=projects]').click();
  await until(() => card('pjbp0'), 'cards'); await Projects.ready();
  try { await until(() => H.surfaces.get('tool:three')?.mounted || (LabBoot.state().skipped && !LabBoot.state().up), 'lab mounted', 1000); } catch { /* not this time */ }
  await wait(1500);
  await step('cold', 'pjbp0', () => card('pjbp0').click());
  await profStart();
  for (let r = 0; r < ROUNDS; r++) for (const id of ['pjbp1', 'pjbp2', 'pjbp0']) {
    await wait(400);
    await step('switch', id, async () => { await realClick(document.querySelector('.workspace-project-name')); const name = Projects.get(id).name; const row = await until(() => menuItem(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))), 'menu row', 100); await realClick(row); });
  }
  out.profile = await profStop();
  for (let i = 0; i < 2; i++) {
    (document.querySelector('.workspace-back') || document.querySelector('#agent-buttons [data-space=projects]')).click();
    await until(() => !ProjectWorkspace.current() && card('pjbp0'), 'Projects home', 1500); await frame(); await wait(300);
    await step('warm', 'pjbp0', () => card('pjbp0').click());
  }
} catch (err) { out.problems.push(String(err?.message || err).slice(0, 300)); }
const med = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
out.summary = Object.fromEntries(['cold', 'switch', 'warm'].map((k) => { const xs = out.steps.filter((s) => s.kind === k); return [k, { n: xs.length, ready: med(xs.map((s) => s.ready)), hearth: med(xs.map((s) => s.hearth)), chat: med(xs.map((s) => s.chat)), cpu: med(xs.map((s) => s.cpu)), longest: med(xs.map((s) => s.longest)), longestMax: Math.max(0, ...xs.map((s) => s.longest)), onLab: xs.every((s) => s.onLab) }]; }));
await window.hub.fs.write(`${window.SMOKE_TMP}/warmopen113.json`, JSON.stringify(out, null, 1));
return JSON.stringify({ summary: out.summary, problems: out.problems });
