// (round 89, desk89) Clink's Desk (1,069 things) drawn without a long window task, measured in the app on
// dev/projopen86-fixture.js (made up, never real data), and Export…'s prepare in slices. For each step: the window task
// that drew the Desk (found by a MutationObserver on the Desk's body: it runs in the task that replaced it), the frame
// after it (a requestAnimationFrame from there: that frame lays out the Desk now), and the window's other long tasks:
//   cold          the first project opened in the session (the Clink card)
//   switch        the name ▾: Ember Tide 1 → Glass Tide 2 → Clink, 3 rounds
//   back          Clink's Desk left with its files shelf open (60 rows), a filter typed, scrolled down and the caret
//                 in the filter, then the name ▾ to Ember Tide 1 and back: the Desk must come back the same (the same
//                 rows in the same order, the shelf open, the filter, the place, in the very first frame, and the caret)
//   export        ⇪ Export… with its chats: the click's task, the prepare's slices (ProjBundle.last.prep), the file
//                 written; and PrepSlice.prepare = ProjBundleCore.prepare on Clink's own body (value, left out, count)
// The aim, held here: no Desk task and no frame after it over 50 ms (BUDGET.desk), the export click's tasks under 50.
// Load-aware (round 88, checkfix88): each step runs under a light trace of the window's tasks, so a task over budget is
// judged by its own CPU time and the thread's wait for a CPU (dev/trace-stats.js longTasks): over on CPU fails; over only
// because the box was busy is "can't tell" (out.cantTell), not a failure. Without a trace: the wall time.
// window.D89_REPORT = 1 (an --eval): report without failing (the code before this round, with --app <its copy>).
//   node dev/projopen86-fixture.js /tmp/hearth-projopen86
//   node dev/smoke.js --fake-engines --data /tmp/hearth-projopen86 --wait 1000 --check-timeout 900000 --script dev/checks/desk89.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, what, n = 1500) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(20); } throw Error(`timed out: ${what}`); };
const r0 = (x) => Math.round(x);
const BUDGET = Object.assign({ desk: 50, task: 50, open: 100 }, window.D89_BUDGET || {});
const out = { budget: BUDGET, problems: [], cantTell: [], over50: [] };
const need = (ok, what) => { if (!ok) out.problems.push(what); return ok; };
const longs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: e.startTime, ms: r0(e.duration), who: e.name }); }).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
const sceneTask = (x) => /cross-origin/.test(x.who || ''); // the scene's own page (another origin): not Hearth's window work
const taskAt = (t) => longs.find((x) => !sceneTask(x) && x.at <= t + 1 && t <= x.at + x.ms + 1) || null;
// the Desk's draws: each replace of its body, with the frame after it
const draws = [];
let deskObs = null;
function watchDesk() {
  const body = document.querySelector('.pj-home-body'); if (!body || deskObs) return;
  deskObs = new MutationObserver(() => { if (!body.querySelector(':scope > .pj-p-head')) return; const d = { at: performance.now(), top: null }; draws.push(d); performance.mark('d89:desk'); requestAnimationFrame(() => { d.frameAt = performance.now(); performance.mark('d89:frame'); d.top = document.querySelector('.pj-home')?.scrollTop ?? null; }); });
  deskObs.observe(body, { childList: true });
}
const isReady = (id) => { const s = ProjectWorkspace.state(); return s.phase === 'ready' && s.project === id; };
const click = (node) => { if (!node) throw Error('nothing to click'); node.click(); };
const menuItem = (re) => [...document.querySelectorAll('#menu button')].find((b) => re.test(b.textContent.trim()));
const switchTo = (id) => { click(document.querySelector('.workspace-project-name')); const name = Projects.get(id).name; click(menuItem(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))); };
const opened = async (id, act) => { act(); await until(() => isReady(id), `${id} ready`, 3000); await until(() => document.querySelector('.pj-home.is-project .pj-p-name')?.textContent === Projects.get(id).name, `${id} Desk`, 500); };
// one measured step, under a light trace (load-aware)
async function step(name, fn, { budget = BUDGET.desk } = {}) {
  await frame();
  const traced = await smoke({ trace: 'start', tasks: true }).then((r) => !r?.error).catch(() => false);
  performance.mark(`d89:${name}`);
  const t = performance.now(); const d0 = draws.length;
  const res = await fn();
  await wait(1200);
  const mine = draws.slice(d0);
  const desk = mine.map((d) => ({ task: taskAt(d.at), frame: d.frameAt ? taskAt(d.frameAt) : null }));
  const deskTasks = desk.map((x) => x.task?.ms || 0); const frameTasks = desk.map((x) => x.frame?.ms || 0);
  const judged = []; for (const x of desk) for (const k of ['task', 'frame']) if (x[k] && !judged.includes(x[k])) judged.push(x[k]);
  const observed = judged.map((x) => ({ at: x.at - t, ms: x.ms }));
  const lt = traced ? await smoke({ trace: 'stop', tasks: { min: 0, budget, mark: `d89:${name}`, observed, marked: ['d89:desk', 'd89:frame'] } }).catch(() => null) : null;
  // each Desk draw's own task and the frame after it, long or not (from the trace; the long-task list only has those ≥ 50 ms)
  const deskMs = lt?.marked?.['d89:desk']?.map((x) => x?.ms ?? null) || []; const frameMs = lt?.marked?.['d89:frame']?.map((x) => x?.ms ?? null) || [];
  const s = { draws: mine.length, deskMs, frameMs, deskTask: deskTasks, frameAfter: frameTasks, windowLong: longs.filter((x) => x.at >= t && !sceneTask(x)).map((x) => x.ms).sort((a, b) => b - a).slice(0, 6), ...(res && typeof res === 'object' ? res : {}) };
  if (lt) s.trace = { verdict: lt.verdict, cpu: (lt.tasks || []).slice(0, 4).map((x) => `${x.ms}ms (cpu ${x.cpuMs})`) };
  const worst = Math.max(0, ...deskTasks, ...frameTasks);
  if (worst > 50) out.over50.push(`${name} ${worst}`);
  if (worst > budget) {
    if (lt && lt.verdict === 'load') out.cantTell.push(`${name}: a ${worst} ms Desk task over the ${budget} ms budget, but the box, not the app: ${lt.why}`);
    else if (lt && lt.verdict === 'ok') { /* (the trace found it under) */ } else out.problems.push(`${name}: the Desk held the window ${worst} ms in one task (budget ${budget})${lt?.why ? `: ${lt.why}` : ''}`);
  }
  return s;
}
const deskFacts = () => {
  const b = document.querySelector('.pj-home-body');
  const texts = (sel) => [...b.querySelectorAll(sel)].map((n) => n.textContent.trim());
  return { head: b.querySelector('.pj-p-name')?.textContent, meta: b.querySelector('.pj-p-head .pj-meta')?.textContent, shelves: texts('.pw-shelf-section h3, details > summary'), rows: texts('.pw-shelf-row'), files: texts('.pw-file-results .pj-item'), fileHeads: texts('.pw-file-results h4'), open: [...b.querySelectorAll('details[open]')].map((d) => d.className),
    fileQuery: b.querySelector('.pw-file-search')?.value, count: b.querySelector('.pw-file-footer [role=status]')?.textContent, find: Boolean(b.querySelector('.pf')) };
};

try {
  await until(() => document.querySelector('#agent-buttons .space-button'), 'app'); await wait(2500);
  click(document.querySelector('#agent-buttons [data-space=projects]'));
  await until(() => document.querySelector('.pj-card[data-project="pjbp0"]'), 'cards'); await Projects.ready();
  watchDesk();
  out.fixture = { clinkItems: Projects.get('pjbp0')?.items.length, deskPaint: typeof DeskPaint !== 'undefined' };
  need(out.fixture.clinkItems > 1000, `fixture: Clink holds ${out.fixture.clinkItems} things`);
  document.querySelector('.pj-card[data-project="pjbp0"]').dispatchEvent(new PointerEvent('pointerenter', { bubbles: false })); await wait(300);
  out.cold = await step('cold', () => opened('pjbp0', () => click(document.querySelector('.pj-card[data-project="pjbp0"]'))));
  const runs = [];
  for (let r = 0; r < 3; r++) for (const id of ['pjbp1', 'pjbp2', 'pjbp0']) { await wait(400); runs.push({ id, ...(await step(`switch_${id}_${r}`, () => opened(id, () => switchTo(id)))) }); }
  out.switch = Object.fromEntries(['pjbp1', 'pjbp2', 'pjbp0'].map((id) => { const xs = runs.filter((x) => x.id === id); return [id, { deskMs: xs.map((x) => x.deskMs.join('+') || '-').join(' '), frameMs: xs.map((x) => x.frameMs.join('+') || '-').join(' '), deskTask: xs.map((x) => x.deskTask.join('+') || '-').join(' '), frameAfter: xs.map((x) => x.frameAfter.join('+') || '-').join(' '), windowLong: xs.map((x) => x.windowLong[0] || 0).join(' ') }]; }));
  out.switchDeskWorst = Math.max(...runs.flatMap((x) => [...x.deskTask, ...x.frameAfter]));
  out.clinkDeskMs = runs.filter((x) => x.id === 'pjbp0').flatMap((x) => x.deskMs).concat(out.cold.deskMs); out.clinkFrameMs = runs.filter((x) => x.id === 'pjbp0').flatMap((x) => x.frameMs).concat(out.cold.frameMs);

  // ---------- leaving Clink's Desk as you use it, and coming back ----------
  const files = document.querySelector('.pw-project-files'); files.open = true; await until(() => files.querySelectorAll('.pj-item').length === 60, 'files shelf drawn');
  const q = files.querySelector('.pw-file-search'); q.value = 'take'; q.dispatchEvent(new Event('input')); await frame();
  const root = document.querySelector('.pj-home'); root.scrollTop = 700; await frame(); await frame();
  const place = root.scrollTop; need(place > 300, `the Desk scrolled (${place})`);
  const before = deskFacts();
  await wait(300);
  await opened('pjbp1', () => ProjectWorkspace.open('pjbp1'));
  await wait(400);
  const d0 = draws.length;
  out.back = await step('back', () => opened('pjbp0', () => ProjectWorkspace.open('pjbp0')));
  const after = deskFacts(); const first = draws[d0];
  for (const k of Object.keys(before)) need(JSON.stringify(after[k]) === JSON.stringify(before[k]), `back: the Desk's ${k} came back ${JSON.stringify(after[k]).slice(0, 160)} (was ${JSON.stringify(before[k]).slice(0, 160)})`);
  need(Math.abs(root.scrollTop - place) <= 1, `back: the place is ${root.scrollTop} (was ${place})`);
  need(first && Math.abs((first.top ?? -1) - place) <= 1, `back: the first frame showed ${first?.top} (the place: ${place})`);
  // the caret: a Desk drawn again in place (the project changed: Projects.changed, not saved) keeps the field and its selection
  { const q1 = document.querySelector('.pw-file-search'); q1.focus({ preventScroll: true }); q1.setSelectionRange(1, 3); await frame(); const place1 = root.scrollTop; /* (the caret shown may move the Desk a little) */ const files1 = deskFacts().files; const d1 = draws.length;
    Projects.changed(Projects.get('pjbp0'), 'check', false); await until(() => draws.length > d1, 'the Desk drawn again', 300); await frame(); await frame();
    const f = document.activeElement; need(f?.classList.contains('pw-file-search') && f !== q1 && f.selectionStart === 1 && f.selectionEnd === 3, `again: the caret in the filter (${f?.className} ${f?.selectionStart}-${f?.selectionEnd})`);
    need(Math.abs(root.scrollTop - place1) <= 1, `again: the place ${root.scrollTop} (was ${place1})`); need(JSON.stringify(deskFacts().files) === JSON.stringify(files1), 'again: the same rows'); }
  out.back.facts = { rows: after.rows.length, files: after.files.length, place: root.scrollTop, firstFrame: first?.top };
  // the filter and the shelf still work after the Desk came back (typed, then cleared; Show more)
  const q2 = document.querySelector('.pw-file-search'); q2.value = ''; q2.dispatchEvent(new Event('input')); await frame();
  need(document.querySelectorAll('.pw-file-results .pj-item').length === 60, 'back: the filter cleared shows 60 rows');
  document.querySelector('.pw-file-footer button')?.click(); await frame();
  need(document.querySelectorAll('.pw-file-results .pj-item').length === 120, `back: Show more (${document.querySelectorAll('.pw-file-results .pj-item').length})`);
  document.querySelector('.pw-project-files').open = false; root.scrollTop = 0; document.activeElement?.blur(); await frame();
  // back to the top for the next opens (the place a person leaves is kept per project, as before)
  await opened('pjbp1', () => ProjectWorkspace.open('pjbp1')); await opened('pjbp0', () => ProjectWorkspace.open('pjbp0'));
  if (typeof DeskPaint !== 'undefined') out.deskPaint = { ...DeskPaint.stats };

  // ---------- ⇪ Export… (its prepare in slices) ----------
  await Lazy.load('projbundle');
  const p = Projects.get('pjbp0');
  const card = () => document.querySelector('dialog.pb-card[open]');
  const job = ProjBundle.exportProject(p);
  await until(() => card()?.querySelector('.pb-go'), 'export card', 3000); await wait(500);
  out.export = await step('export', async () => {
    const c = card(); const fb = c.querySelector('.pb-files'); if (fb && fb.checked) fb.click(); if (!c.querySelector('.pb-chats').checked) c.querySelector('.pb-chats').click();
    const t = performance.now(); c.querySelector('.pb-go').click(); const clickTask = taskAt(t + 0.5)?.ms || 0;
    const r = await job; return { ok: Boolean(r?.ok), clickTask, prep: ProjBundle.last?.prep || null };
  }, { budget: BUDGET.task });
  { const ex = out.export; const worst = Math.max(0, ...ex.windowLong); if (worst > BUDGET.task) { if (ex.trace?.verdict === 'load') out.cantTell.push(`export: a ${worst} ms task, the box's`); else out.over50.push(`export ${worst}`); }
    if (ex.clickTask > BUDGET.task) out.problems.push(`export: the click's task held ${ex.clickTask} ms`); }
  need(out.export.ok, `export: ${JSON.stringify(out.export).slice(0, 200)}`);
  if (typeof PrepSlice !== 'undefined') {
    need(out.export.prep?.slices > 2, `export: prepared in slices (${JSON.stringify(out.export.prep)})`);
    // the same answer as ProjBundleCore.prepare on Clink's own body (with a secret planted in a copy of it: never the store)
    const body = await ProjBundle.gather(p);
    body.project.notes = `${body.project.notes || ''} sk-ant-api03-MadeUpMadeUpMadeUp00 password`; body.project.workspace = { ...body.project.workspace, apiKey: 'made-up' };
    const bare = body.chats.map((c) => (c.chat?.__bigChat ? { ...c, chat: { __bigChat: { id: c.chat.__bigChat.id }, messages: [] } } : c));
    for (const choice of [{ chats: true, files: false }, { chats: true, files: true }, { chats: false, files: false }]) {
      const a = ProjBundleCore.prepare({ ...body, chats: bare, away: undefined }, choice);
      const b = await PrepSlice.prepare({ ...body, chats: bare, away: undefined }, choice);
      need(JSON.stringify(a) === JSON.stringify(b), `export: PrepSlice = ProjBundleCore.prepare on Clink (${JSON.stringify(choice)})`);
      need(a.secrets >= 2 && !JSON.stringify(b.body).includes('sk-ant-api03-MadeUp') && !JSON.stringify(b.body).includes('"apiKey"'), `export: the planted secrets are gone (${a.secrets})`);
    }
  }
} catch (e) { out.problems.push(`stopped: ${e.message}`); }
if (window.D89_REPORT) { out.reported = out.problems; out.problems = []; }
return JSON.stringify(out);
