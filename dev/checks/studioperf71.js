// opt-in: BIGPROFILE70
// (round 71, studioperf71) Sidequest Studio (Life) on the heavy owner-like profile (dev/bigprofile.js: the Paris map
// full with 100 places, 60 campaigns, 220 side quests, ~280 finished quests, 600 cached shows, a show log, My Paris
// photos). Round 70 measured the Map open at 1.4–1.5 s with 135–190 ms window tasks, the rest in Codex's
// quest-journal.js render() and QuestCore.clone. First, cold: Life opened from a chat, its Map tab clicked as soon as
// it's there (wall to the pins drawn, long tasks). Then traced, 3 rounds each (best of 3, the box is shared):
//   map-open      Life › Map (the Map tab clicked on the Today page) → pins drawn + the next frame
//   tab-today     Map → Today            tab-progress   Today → Progress      tab-back   Progress → Today
//   quest-dialog  a quest's details dialog opened         dialog-close   its × (the page comes back)
//   visit-stamp   the selected place's "Stamp my visit" (save → re-render)
// Per interaction: wall ms (click → the next frame, in the page), script ms (handlers, timers, microtasks, frame
// callbacks with the style / layout they force: dev/trace-stats.js segments), CPU ms, the longest task. Then one CPU
// profile per interaction (the top functions by self and total time). Budgets (window.SP_BUDGET overrides;
// window.SP_REPORT = 1 reports without failing): map open < 600 ms wall, a tab switch < 100 ms script, the dialog open
// < 50 ms script. Last, the Outing desk (Map › Events) opened and closed 3 times and a quest dialog closed: no closed
// dialog may stay in the page (it did: the close event waits for a drawn frame). Offline map tiles, no network, no AI.
// Opt-in (the 140 MB fixture): BIGPROFILE70=1 node dev/run-checks.js --exact studioperf71
//   by hand: node dev/smoke.js --fake-engines --data /tmp/hearth-bigprofile70 --wait 1000 --check-timeout 600000 --script dev/checks/studioperf71.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, what, n = 300) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(30); } throw Error(`timed out: ${what}`); };
const BUDGET = Object.assign({ mapOpenWall: 600, tabScript: 100, dialogScript: 50 }, window.SP_BUDGET || {});
const out = { fixture: {}, coldOpen: {}, interactions: {}, profiles: {}, budget: BUDGET }; const fails = [];
const root = () => document.querySelector('.qj');
const dlg = () => [...document.querySelectorAll('dialog.qj-dialog[open]')].at(-1);
const tab = (id) => root().querySelector(`[data-nav-group="${id}"]`);
const btn = (re, scope = root()) => [...scope.querySelectorAll('button')].find((b) => re.test(b.getAttribute('aria-label') || b.textContent.trim()));
const closeAll = async () => { document.querySelectorAll('dialog.qj-dialog[open]').forEach((d) => d.close()); await wait(150); };
window.hub.openExternal = () => {};

try {
  await until(() => document.querySelector('#panel .item'), 'app', 600);
  await wait(2500);
  // ---------- Life › Map from a chat, cold: the module loads, mounts, reads the journal and draws Today; the Map tab is
  // clicked as soon as it's there (its layers, shows and the one-time guide seeding arrive) ----------
  { const longs = []; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); }); try { po.observe({ type: 'longtask' }); } catch { /* none */ }
    // long animation frames: how much of each was script and how much the frame's own style / layout / paint
    const loafs = []; const lo = new PerformanceObserver((l) => { for (const e of l.getEntries()) loafs.push(`${Math.round(e.duration)}ms (script ${Math.round((e.scripts || []).reduce((a, s) => a + s.duration, 0))}, render ${Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0)})`); }); try { lo.observe({ type: 'long-animation-frame' }); } catch { /* none */ }
    const t0 = performance.now(); await Lazy.load('questjournal'); activate('tool:quests'); await until(() => root() && QuestJournal.ready() && root().querySelector('.qj-content > *'), 'journal'); await frame();
    const t1 = performance.now(); out.coldOpen.lifeMs = Math.round(t1 - t0);
    root().querySelector('[data-nav-group="map"]').click(); out.coldOpen.mapClickMs = Math.round(performance.now() - t1); out.coldOpen.pinsInClick = !!root().querySelector('.qj-atlas .qj-atlas-pin'); await until(() => root().querySelector('.qj-atlas .qj-atlas-pin'), 'first map'); await frame();
    out.coldOpen.mapMs = Math.round(performance.now() - t1); out.coldOpen.wallMs = Math.round(performance.now() - t0);
    await wait(2500); await QuestJournal.flush(); po.disconnect(); lo.disconnect(); out.coldOpen.longTasks = longs.sort((a, b) => b - a).slice(0, 6); out.coldOpen.longFrames = loafs.slice(0, 8); }
  const S = QuestJournal.snapshot();
  out.fixture = { places: S.atlas.places.length, campaigns: S.campaigns.length, sideQuests: S.sideQuests.length, records: Object.keys(S.records).length, bytes: JSON.stringify(S).length };
  // a quest to open: the tracked campaign's next one (else the first quest)
  const qid = (QuestCore.next(S, S.campaigns.find((c) => c.id === S.active) || S.campaigns[0]) || S.campaigns[0].quests[0]).id;
  // an own place to stamp (selected on the map before the stamp)
  const pid = (S.atlas.places.find((p) => !p.guide && !p.visitedAt) || S.atlas.places[0]).id;
  const toMap = async () => { if (QuestJournal.page !== 'world') { QuestJournal.navigate('world'); } await until(() => root().querySelector('.qj-atlas .qj-atlas-pin'), 'map'); };
  const toToday = async () => { if (QuestJournal.page !== 'adventure') QuestJournal.navigate('adventure'); await frame(); };
  const plan = [
    ['_setup-today', async () => { await closeAll(); await toToday(); }],
    ['map-open', async () => { tab('map').click(); await until(() => root().querySelector('.qj-atlas .qj-atlas-pin'), 'map pins'); }],
    ['tab-today', async () => { tab('quests').click(); await until(() => QuestJournal.page === 'adventure', 'today'); }],
    ['tab-progress', async () => { tab('progress').click(); await until(() => QuestJournal.page === 'collection', 'progress'); }],
    ['tab-back', async () => { tab('quests').click(); await until(() => QuestJournal.page === 'adventure', 'today again'); }],
    ['quest-dialog', async () => { QuestJournal.questDetail(qid); await until(dlg, 'quest dialog'); }],
    ['dialog-close', async () => { dlg().querySelector('.qj-close').click(); await until(() => !dlg(), 'closed'); }],
    ['_setup-pin', async () => { await toMap(); await QuestJournal.flush(); const pin = root().querySelector(`.qj-atlas-pin[data-place="${pid}"]`); if (pin && !pin.classList.contains('selected')) pin.click(); await until(() => btn(/^(Stamp my visit|Undo visit stamp)$/), 'stamp button'); }],
    ['visit-stamp', async () => { btn(/^(Stamp my visit|Undo visit stamp)$/).click(); await wait(0); }],
  ];
  const wallOf = {}; const seq = [];
  const it1 = async (name, fn) => { await QuestJournal.flush(); await frame(); await wait(250); performance.mark(`hz240:${name}`); seq.push(name); const t0 = performance.now(); await fn(); await QuestJournal.flush(); await frame(); wallOf[name] = Math.round(performance.now() - t0); await wait(350); };
  // warm-up round (not traced: the first Map open pulls the map's lazy parts, shows and layers)
  for (const [name, fn] of plan) await it1(`warm-${name}`, fn);
  await wait(1500);
  await smoke({ trace: 'start', detail: true });
  for (let round = 1; round <= 3; round++) for (const [name, fn] of plan) await it1(`${name}#${round}`, fn);
  await it1('_end', async () => {});
  const tr = await smoke({ trace: 'stop', detail: true });
  const SCRIPT = ['FunctionCall', 'EventDispatch', 'TimerFire', 'FireAnimationFrame', 'v8.callFunction', 'RunMicrotasks', 'FireIdleCallback'];
  const runs = {};
  for (const name of seq) {
    if (name.startsWith('_') || name.startsWith('warm-')) continue;
    const g = tr.detail?.segments?.[name]; if (!g) { fails.push(`${name}: no trace segment`); continue; }
    const ph = Object.fromEntries(String(g.phases || '').split(', ').map((x) => { const m = /^(.*) ([\d.]+)$/.exec(x); return m ? [m[1], +m[2]] : [x, 0]; }));
    const script = Math.round(SCRIPT.reduce((a, k) => a + (ph[k] || 0), 0) * 10) / 10;
    const base = name.split('#')[0]; (runs[base] ||= []).push({ script, wall: wallOf[name], cpu: g.cpuMs });
    const cur = out.interactions[base]; if (cur && cur.scriptMs <= script) continue;
    out.interactions[base] = { wallMs: wallOf[name], scriptMs: script, cpuMs: g.cpuMs, longestCpu: g.longestCpu, style: `${g.style.n}×${g.style.elements}el ${g.style.ms}ms`, layoutMs: g.layout.ms, forcedMs: g.forced.ms, phases: g.phases };
  }
  for (const [name, v] of Object.entries(out.interactions)) { v.runs = runs[name].map((r) => `${r.script}/${r.wall}`).join(' '); v.bestWallMs = Math.min(...runs[name].map((r) => r.wall)); }
  // ---------- one CPU profile per interaction (where the time goes) ----------
  const prof = async (name, fn) => {
    await QuestJournal.flush(); await frame(); await wait(250);
    await smoke({ cdp: 'Profiler.enable' }); await smoke({ cdp: 'Profiler.setSamplingInterval', params: { interval: 100 } }); await smoke({ cdp: 'Profiler.start' });
    await fn(); await QuestJournal.flush(); await frame(); await wait(400); // the timers that follow the click count too
    const p = (await smoke({ cdp: 'Profiler.stop' })).profile || {}; const nodes = p.nodes || [], byId = new Map(nodes.map((n) => [n.id, n])), cnt = {};
    (p.samples || []).forEach((id, i) => { cnt[id] = (cnt[id] || 0) + (p.timeDeltas[i] || 0); });
    const key = (n) => `${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber + 1} ${n.callFrame.functionName || '(anon)'}`;
    const tot = (n) => { let t = cnt[n.id] || 0; for (const c of n.children || []) t += tot(byId.get(c)); n.t = t; return t; };
    nodes.filter((n) => !nodes.some((m) => (m.children || []).includes(n.id))).forEach(tot);
    const self = {}, incl = {}; for (const n of nodes) { const k = key(n); self[k] = (self[k] || 0) + (cnt[n.id] || 0) / 1e3; if (!/^:0 \((root|program|idle)\)/.test(k)) incl[k] = Math.max(incl[k] || 0, n.t / 1e3); }
    const top = (o, n) => Object.entries(o).filter(([k]) => !/\((idle|program|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(1)} ${k}`);
    out.profiles[name] = { self: top(self, 12), total: top(incl, 14) };
    await wait(300);
  };
  for (const [name, fn] of plan) { if (name.startsWith('_')) { await fn(); continue; } await prof(name, fn); }
  // ---------- closed dialogs leave the page (lifechecks70: closed Outing desk dialogs stayed) ----------
  { await closeAll(); await wait(300); const mapRow = () => root().querySelector('.qj-command-panel[data-group="map"]');
    for (let i = 0; i < 3; i++) { btn(/^Events$/, mapRow()).click(); await until(() => dlg()?.classList.contains('od-dialog'), 'outing desk'); await wait(150); dlg().querySelector('.qj-close').click(); await wait(250); }
    QuestJournal.questDetail(qid); await until(dlg, 'quest dialog again'); dlg().querySelector('.qj-close').click(); await wait(300);
    const left = [...root().querySelectorAll('dialog')].map((d) => `${d.getAttribute('aria-label')}${d.open ? ' (open)' : ''}`);
    out.dialogLeak = { left }; if (left.length) fails.push(`dialogs left in the page after closing: ${left.join(', ')}`); }
  out.journalAfter = { visited: !!QuestJournal.snapshot().atlas.places.find((p) => p.id === pid)?.visitedAt };
  out.dom = { qj: root().querySelectorAll('*').length, dialogsLeft: root().querySelectorAll('dialog').length };
  // budgets
  const I = out.interactions;
  if (out.coldOpen.wallMs > BUDGET.mapOpenWall) fails.push(`Life › Map cold: ${out.coldOpen.wallMs} ms wall (budget ${BUDGET.mapOpenWall})`);
  if (I['map-open'] && I['map-open'].bestWallMs > BUDGET.mapOpenWall) fails.push(`map-open: ${I['map-open'].bestWallMs} ms wall, best of 3 (budget ${BUDGET.mapOpenWall}): ${I['map-open'].runs}`);
  for (const n of ['tab-today', 'tab-progress', 'tab-back']) if (I[n] && I[n].scriptMs > BUDGET.tabScript) fails.push(`${n}: ${I[n].scriptMs} ms script (budget ${BUDGET.tabScript}): ${I[n].runs}`);
  if (I['quest-dialog'] && I['quest-dialog'].scriptMs > BUDGET.dialogScript) fails.push(`quest-dialog: ${I['quest-dialog'].scriptMs} ms script (budget ${BUDGET.dialogScript}): ${I['quest-dialog'].runs}`);
} catch (err) { fails.push(`error: ${err.stack || err.message || err}`); }
await closeAll();
if (fails.length && !window.SP_REPORT) throw Error(JSON.stringify({ fails, out }));
return JSON.stringify({ ok: !fails.length, fails, ...out });
