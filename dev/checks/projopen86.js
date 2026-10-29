// (round 86, projopen86) Project handling that feels instant, measured in the app on dev/projopen86-fixture.js (made
// up, never real data): 3 active projects, "Clink" with a BIG scene (6 drawing layers of ≈ 450 lines) and a LONG chat
// (1,600 messages), 1,063 things of which 300 files are written the other computer's way. For each step: the wall
// until it's usable, the window's longest tasks (PerformanceObserver longtask) and the main process's busy stretches
// (mainlag-probe.js, HEARTH_LOOPLAG=prof):
//   lab_first     the Lab's first start (backstage, as an import / Duplicate starts it): Lazy 'lab' + ThreeLab.cmd
//   restart       Hearth starts again (//@@ reload); the window's tasks from the start until the first click
//   cold          the first project opened after that restart (the Clink card) until ready, and its chat drawn
//   switch        the name ▾ in the workspace bar → the other 2 projects and back (3 rounds): until ready + the
//                 chat drawn, and the longest window task
//   export_card   ⇪ Export project… until its card shows (its sizes: 300 files mapped from the other computer)
//   import        ⇩ Import project… → Import as a new project (5 scenes added) until it's in the list
//   open_import   opening the imported project (its scene shown, its chat drawn)
//   duplicate     ⧉ Duplicate project, then open_dup: opening the copy
// What doesn't change is checked too: the imported / duplicated project has the scene's 6 layers with the same code,
// the long chat's 1,600 messages and the same last message.
// window.PO_REPORT = 1 (an --eval): report without failing (the code before this round) · window.PO_PROF = 1: each
// step's heaviest window functions (a CPU profile through the DevTools protocol) · window.PO_BUDGET = { task: 80 }
//   node dev/projopen86-fixture.js /tmp/hearth-projopen86
//   HEARTH_LOOPLAG=prof node dev/smoke.js --fake-engines --data /tmp/hearth-projopen86 --wait 1000 --check-timeout 900000 --script dev/checks/projopen86.js
{ const w8 = (ms) => new Promise((r) => setTimeout(r, ms));
  const til = async (fn, what, n = 1500) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await w8(20); } throw Error(`timed out: ${what}`); };
  const longs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: e.startTime, ms: Math.round(e.duration) }); }).observe({ type: 'longtask' }); } catch { /* none */ }
  await til(() => document.querySelector('#agent-buttons .space-button'), 'app'); await w8(3000);
  // the Lab's first start, backstage (an import or Duplicate with scenes starts it so)
  if (window.PO_PROF) { await smoke({ cdp: 'Profiler.enable' }); await smoke({ cdp: 'Profiler.setSamplingInterval', params: { interval: 250 } }); await smoke({ cdp: 'Profiler.start' }); }
  const t0 = performance.now();
  await Lazy.load('lab'); await ThreeLab.cmd({ show: false }); await til(() => ThreeLab.scenes?.adoptScene, 'lab');
  const ready = Math.round(performance.now() - t0); await w8(2500);
  const labFirst = { ms: ready, windowLong: longs.filter((x) => x.at >= t0).map((x) => x.ms).sort((a, b) => b - a).slice(0, 8) };
  if (window.PO_PROF) { // the long tasks' heaviest app functions (as in the part below)
    const p = (await smoke({ cdp: 'Profiler.stop' }))?.profile;
    if (p) { const by = new Map(p.nodes.map((n) => [n.id, n])); const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const key = (f) => `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`; const tasks = []; let cur = null;
      for (let i = 0; i < p.samples.length; i++) { const f = by.get(p.samples[i]).callFrame; const dt = (p.timeDeltas[i] || 0) / 1000; if (f.functionName === '(idle)') { if (cur) tasks.push(cur); cur = null; continue; } if (!cur) cur = { ms: 0, incl: new Map() }; cur.ms += dt; const seen = new Set(); for (let id = p.samples[i]; id != null; id = parent.get(id)) { const g = by.get(id).callFrame; if (!/\.js$/.test(g.url)) continue; const k = key(g); if (!seen.has(k)) { seen.add(k); cur.incl.set(k, (cur.incl.get(k) || 0) + dt); } } }
      if (cur) tasks.push(cur);
      labFirst.longTasks = tasks.filter((x) => x.ms >= 40).sort((a, b) => b.ms - a.ms).slice(0, 4).map((x) => `${Math.round(x.ms)}ms: ${[...x.incl].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${Math.round(v)}ms ${k}`).join(' · ')}`); }
  }
  // Clink opened once and left, as the owner always has a project they were in
  document.querySelector('#agent-buttons [data-space=projects]').click();
  const c = await til(() => document.querySelector('.pj-card[data-project="pjbp0"]'), 'cards'); await w8(300);
  c.click();
  await til(() => ProjectWorkspace.state().phase === 'ready' && ProjectWorkspace.state().project === 'pjbp0', 'first open', 3000);
  await w8(800); await ProjectWorkspace.home(); await Projects.flush(); await w8(800);
  localStorage.setItem('po86.before', JSON.stringify({ labFirst, opts: { report: Boolean(window.PO_REPORT), prof: Boolean(window.PO_PROF), budget: window.PO_BUDGET || null } }));
  return JSON.stringify({ session: 'before the restart', labFirst }); }
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, what, n = 1500) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(20); } throw Error(`timed out: ${what}`); };
const r0 = (x) => Math.round(x);
const before = JSON.parse(localStorage.getItem('po86.before') || '{}');
const OPTS = before.opts || {};
const BUDGET = Object.assign({ task: 50, mainBlock: 50 }, OPTS.budget || {}, window.PO_BUDGET || {});
const out = { budget: BUDGET, lab_first: before.labFirst || null, problems: [] };
const need = (ok, what) => { if (!ok) out.problems.push(what); return ok; };
// (a task of the scene's own page, a sandboxed frame of another origin, says so: 'cross-origin-descendant'; it's the
// scene's code and GL, apart from Hearth's: reported as sceneLong, not held to the budget)
const longs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: e.startTime, ms: r0(e.duration), who: e.name }); }).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
const sceneTask = (x) => /cross-origin/.test(x.who || '');
// long animation frames: what ran in each frame over the budget (script, function, ms) — where a long task comes from
const loafs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) loafs.push(e); }).observe({ type: 'long-animation-frame', buffered: true }); } catch { /* none */ }
const loafSince = (t) => loafs.filter((e) => e.startTime >= t && e.duration > BUDGET.task && e.blockingDuration > 0).sort((a, b) => b.duration - a.duration).slice(0, 4).map((e) => `${r0(e.duration)}ms (render ${r0(e.renderStart ? e.startTime + e.duration - e.renderStart : 0)}): ${[...(e.scripts || [])].sort((a, b) => b.duration - a.duration).slice(0, 4).map((x) => `${r0(x.duration)} ${x.invoker || ''} ${x.sourceFunctionName || ''}@${String(x.sourceURL || '').split('/').pop()}:${x.sourceCharPosition ?? ''}`).join(' · ')}`);
const longsSince = (t, t1 = Infinity) => longs.filter((x) => x.at >= t && x.at <= t1 && !sceneTask(x)).map((x) => x.ms).sort((a, b) => b - a);
const sceneSince = (t) => longs.filter((x) => x.at >= t && sceneTask(x)).map((x) => x.ms).sort((a, b) => b - a);
const whoSince = (t) => [...new Set(longs.filter((x) => x.at >= t).map((x) => x.who))];
const lag = (label) => window.hub.power?.test?.({ lag: { label } });
const mainOf = (r) => (r?.delay ? { max: r.delay.max, blocks: (r.blocks || []).map((b) => `${b.ms}ms ${(b.app || []).slice(0, 2).join(' | ')}`).slice(0, 4) } : null);
const blocksOver = (r, ms) => (r?.blocks || []).filter((b) => b.ms >= ms);
const click = (node) => { if (!node) throw Error('nothing to click'); node.click(); };
const menuItem = (re) => [...document.querySelectorAll('#menu button')].find((b) => re.test(b.textContent.trim()));
const isReady = (id) => { const s = ProjectWorkspace.state(); return s.phase === 'ready' && s.project === id; };
const card = (id) => document.querySelector(`.pj-card[data-project="${id}"]`);
const chatDrawn = (id) => { const c = Projects.get(id) && ProjectWorkspace.current()?.id === id ? ProjectWorkspace.currentChat() : null; const v = c && H.activeChat[c.agentId] === c.id && Native.view(c.agentId); return Boolean(v?.list?.querySelector('.msg')); };
// a CPU profile of a step (window.PO_PROF): the heaviest functions, self and with what they called
async function prof(fn) {
  if (!OPTS.prof && !window.PO_PROF) return [await fn(), null];
  await smoke({ cdp: 'Profiler.enable' }); await smoke({ cdp: 'Profiler.setSamplingInterval', params: { interval: 250 } }); await smoke({ cdp: 'Profiler.start' });
  let res; try { res = await fn(); } finally { /* stopped below */ }
  const p = (await smoke({ cdp: 'Profiler.stop' }))?.profile; if (!p) return [res, null];
  const by = new Map(p.nodes.map((n) => [n.id, n])); const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = (f) => `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`;
  const self = new Map(); const incl = new Map();
  for (let i = 0; i < p.samples.length; i++) {
    const n = by.get(p.samples[i]); const f = n.callFrame; const dt = (p.timeDeltas[i] || 0) / 1000;
    if (!/^\((idle|program|root)\)$/.test(f.functionName)) self.set(key(f), (self.get(key(f)) || 0) + dt);
    const seen = new Set(); for (let id = p.samples[i]; id != null; id = parent.get(id)) { const g = by.get(id).callFrame; if (!/\.js$/.test(g.url)) continue; const k = key(g); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + dt); } }
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${r0(v)}ms ${k}`);
  // the long tasks themselves: stretches of samples without idle (≥ 40 ms), each with its heaviest app functions
  const tasks = []; let cur = null;
  for (let i = 0; i < p.samples.length; i++) {
    const f = by.get(p.samples[i]).callFrame; const dt = (p.timeDeltas[i] || 0) / 1000;
    if (f.functionName === '(idle)') { if (cur) tasks.push(cur); cur = null; continue; }
    if (!cur) cur = { ms: 0, incl: new Map() };
    cur.ms += dt;
    const seen = new Set(); for (let id = p.samples[i]; id != null; id = parent.get(id)) { const g = by.get(id).callFrame; if (!/\.js$/.test(g.url)) continue; const k = key(g); if (!seen.has(k)) { seen.add(k); cur.incl.set(k, (cur.incl.get(k) || 0) + dt); } }
  }
  if (cur) tasks.push(cur);
  const longTasks = tasks.filter((x) => x.ms >= 40).sort((a, b) => b.ms - a.ms).slice(0, 4).map((x) => `${r0(x.ms)}ms: ${top(x.incl, 10).join(' · ')}`);
  return [res, { longTasks, self: top(self, 10), incl: top(incl, 14) }];
}
// one measured step: fn() resolves when the thing is usable; then 1.5 s for what it left behind (deferred work counts)
async function step(name, fn, { settle = 1500 } = {}) {
  await lag(`before-${name}`); await frame();
  const t = performance.now();
  const [res, profile] = await prof(async () => { const r = await fn(t); await wait(settle); return r; });
  const l = await lag(name);
  const s = { ...(res && typeof res === 'object' ? res : {}), windowLong: longsSince(t).slice(0, 8), sceneLong: sceneSince(t).slice(0, 4), who: whoSince(t), frames: loafSince(t), main: mainOf(l), ...(profile ? { profile } : {}) };
  out[name] = s;
  if ((s.windowLong[0] || 0) > BUDGET.task) out.problems.push(`${name}: the window held ${s.windowLong[0]} ms in one task (budget ${BUDGET.task})`);
  if (blocksOver(l, BUDGET.mainBlock).length) out.problems.push(`${name} held the main process: ${s.main.blocks.join('; ')}`);
  return s;
}
// a project opened (by fn) → { ready: ms until the workspace says ready, chat: ms until its chat shows messages }
async function opened(id, t, act) {
  act(); let chat = 0;
  await until(() => { if (!chat && chatDrawn(id)) chat = r0(performance.now() - t); return isReady(id); }, `${id} ready`, 3000);
  const readyMs = r0(performance.now() - t);
  await until(() => chatDrawn(id), `${id} chat drawn`, 500); if (!chat) chat = r0(performance.now() - t);
  return { ready: readyMs, chat, timings: ProjectWorkspace.state().timings };
}
const switchTo = (id) => (t) => opened(id, t, () => { click(document.querySelector('.workspace-project-name')); const name = Projects.get(id).name; click(menuItem(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))); });
const sceneFacts = (id) => { const s = ThreeLab.scenes.get(id); return s ? { layers: (s.layers || []).length, code: (s.layers || []).map((L) => L.code).join('\n').length } : null; };
const chatFacts = async (id) => { const c = await Native.load(id); return { n: c?.messages?.length ?? null, last: c?.messages?.at(-1)?.text?.slice(0, 80) ?? null }; };

try {
  const tStart = 0; // the window's tasks since this start
  await until(() => document.querySelector('#agent-buttons .space-button'), 'app');
  await wait(2500);
  click(document.querySelector('#agent-buttons [data-space=projects]'));
  await until(() => card('pjbp0'), 'cards'); const P = Projects; await P.ready();
  // the Lab mounts out of sight after the start when the last project's scene is the Lab's (tools/three-boot.js): up to 20 s
  { const t0 = performance.now(); try { await until(() => H.surfaces.get('tool:three')?.mounted || (LabBoot.state().skipped && !LabBoot.state().up), 'lab mounted', 1000); } catch { /* not this time */ } await wait(1500);
    out.restart = { labMounted: Boolean(H.surfaces.get('tool:three')?.mounted), waited: r0(performance.now() - t0), windowLong: longsSince(tStart).slice(0, 8) }; }
  out.fixture = { projects: P.live().length, clinkItems: P.get('pjbp0')?.items.length };
  need(P.get('pjbp0') && P.get('pjbp1') && P.get('pjbp2'), 'fixture: the 3 projects');
  // ---------- the first project opened after the restart ----------
  card('pjbp0').dispatchEvent(new PointerEvent('pointerenter', { bubbles: false })); await wait(300);
  await step('cold', (t) => opened('pjbp0', t, () => click(card('pjbp0'))));
  // ---------- switching with the name ▾ (3 rounds) ----------
  const runs = []; const order = ['pjbp1', 'pjbp2', 'pjbp0'];
  for (let r = 0; r < 3; r++) for (const id of order) { await wait(400); const s = await step(`switch_${id}_${r}`, switchTo(id)); runs.push({ id, ...s }); delete out[`switch_${id}_${r}`]; }
  out.switch = Object.fromEntries(order.map((id) => { const xs = runs.filter((x) => x.id === id); return [id, { ready: xs.map((x) => x.ready).join(' '), chat: xs.map((x) => x.chat).join(' '), longest: xs.map((x) => x.windowLong[0] || 0).join(' '), sceneLong: xs.map((x) => x.sceneLong[0] || 0).join(' '), who: [...new Set(xs.flatMap((x) => x.who))], main: xs.map((x) => x.main?.max ?? '-').join(' '), frames: xs.flatMap((x) => x.frames).slice(0, 4), ...(xs.some((x) => x.profile) ? { longTasks: xs.flatMap((x) => x.profile?.longTasks || []).slice(0, 6) } : {}) }]; }));
  out.switchWorst = Math.max(...runs.map((x) => x.windowLong[0] || 0));
  out.switchReady = Math.max(...runs.map((x) => x.ready));
  // ---------- ⇪ Export: the card's sizes (300 files mapped from the other computer) ----------
  await Lazy.load('projbundle');
  const p = P.get('pjbp0');
  const card2 = () => document.querySelector('dialog.pb-card[open]');
  let job = null;
  await step('export_card', async () => {
    job = ProjBundle.exportProject(p);
    const c = await until(() => card2()?.querySelector('.pb-go') && card2(), 'export card');
    return { files: c.querySelector('.pb-files')?.parentElement.textContent.trim().slice(0, 80) || null };
  });
  need(/\d/.test(out.export_card.files || ''), `export card: ${out.export_card.files}`);
  await step('export', async () => {
    const c = card2(); const files = c.querySelector('.pb-files'); if (files && files.checked) files.click();
    if (!c.querySelector('.pb-chats').checked) c.querySelector('.pb-chats').click();
    c.querySelector('.pb-go').click(); const r = await job; return { ok: Boolean(r?.ok), path: r?.path || null };
  });
  if (!need(out.export.ok, `export: ${JSON.stringify(out.export)}`)) throw Error('no export');
  // ---------- ⇩ Import as a new project, then opening it ----------
  const origScene = sceneFacts(p.workspace.sceneId); const origChat = await chatFacts(p.workspace.chatId);
  need(origScene?.layers === 6 && origChat.n === 1600, `fixture: Clink's scene / chat ${JSON.stringify({ origScene, n: origChat.n })}`);
  await step('import_card', async () => { job = ProjBundle.importProject(out.export.path); await until(() => card2()?.querySelector('.pb-adds'), 'import card'); return {}; });
  let imported = null;
  await step('import', async () => { card2().querySelector('.pb-go').click(); const r = await job; imported = r?.id || null; await until(() => document.querySelector(`.pw-desk, .pj-home`) || true, 'home'); return { ok: Boolean(imported) }; });
  if (!need(imported, 'import: no project')) throw Error('no import');
  await step('open_import', (t) => opened(imported, t, () => ProjectWorkspace.open(imported).catch((e) => need(false, `open_import: ${e.message}`))));
  { const q = P.get(imported); const sf = sceneFacts(q.workspace.sceneId); const cf = await chatFacts(q.workspace.chatId); out.open_import.facts = { scene: sf, chat: cf.n };
    need(sf?.layers === origScene.layers && sf.code === origScene.code, `import: the scene came in as ${JSON.stringify(sf)} (original ${JSON.stringify(origScene)})`);
    need(cf.n === origChat.n && cf.last === origChat.last, `import: the chat came in as ${JSON.stringify(cf)}`); }
  // ---------- ⧉ Duplicate, then opening the copy ----------
  let dup = null;
  await step('duplicate', async () => { const r = await ProjBundle.duplicateProject(P.get('pjbp0')); dup = r?.id || null; return { ok: Boolean(dup) }; });
  if (!need(dup, 'duplicate: no project')) throw Error('no duplicate');
  await step('open_dup', (t) => opened(dup, t, () => ProjectWorkspace.open(dup).catch((e) => need(false, `open_dup: ${e.message}`))));
  { const q = P.get(dup); const sf = sceneFacts(q.workspace.sceneId); const cf = await chatFacts(q.workspace.chatId); out.open_dup.facts = { scene: sf, chat: cf.n };
    need(sf?.layers === origScene.layers && sf.code === origScene.code, `duplicate: the scene is ${JSON.stringify(sf)}`);
    need(cf.n === origChat.n && cf.last === origChat.last, `duplicate: the chat is ${JSON.stringify(cf)}`); }
} catch (e) { out.problems.push(`stopped: ${e.message}`); }
if (OPTS.report || window.PO_REPORT) { out.reported = out.problems; out.problems = []; }
return JSON.stringify(out);
