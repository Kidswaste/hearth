// opt-in: BIGPROFILE70
// (round 72, projects72) Projects on the heavy owner-like profile (dev/bigprofile.js --projects 40: 1,500 chats, a full
// quest journal, 50 Lab scenes AND 40 projects — "Clink" with a 700-message chat, 14 related long chats, 4 scenes,
// 3 boards, 400 files half of them not on this computer, 220 captures, 120 renders; two medium ones; a project whose
// scene hasn't arrived and one whose chat hasn't). Everything by clicks, like the owner:
//   cold open     Projects (rail) → the pointer on the Clink card (300 ms) → its click → the project is ready (its chat,
//                 scene, board, sound): the first open since Hearth started
//   warm open     ‹ Projects → the Clink card again
//   switch        the name ▾ in the workspace bar → another project in its menu (3 rounds, best of 3)
//   resume        a project left on its Scene tab comes back on its Scene; a related chat comes back as the chat
//   desk          Desk with many files: the page, "Project files" opened, a search typed, Show more; the project's chat
//                 keeps its place (its end) and draws no more messages while the tabs change
//   not arrived   the project whose scene / chat isn't here says so calmly and keeps its links (nothing rewritten)
//   offline       right-click › Prepare for offline… → the dialog's answer (the missing scene and files listed)
//   delete / undo right-click › Delete the project… → Undo; archive → ⋯ › Archived projects lists it → back to Active
// What counts: the wall from the click to "ready" (the loading card gone), minus the scene's OWN work in its page — its
// layers' code running to their first frame (from the first layer's code starting to 'stack-drawn') and the warm-up of
// its textures and shaders (the page's own 'ready-prepped' ms). That part is the scene's GPU work: here software GL
// (SwiftShader) makes it 1–3 s for the simplest 2–4-layer scene, on the owner's GPU a few frames. Everything else —
// saving the project left, reading the chat, drawing it, the page's own start, the board, the instrument, the Desk — is
// Hearth's, and that is what the budgets hold (both numbers are reported).
// Budgets (window.PJ_BUDGET overrides; window.PJ_REPORT = 1 reports without failing): opening (cold and warm) < 800 ms,
// switching < 600 ms of Hearth's part, Desk paint < 150 ms, the files shelf < 150 ms, a window task while switching < 250 ms.
// No network, fake engines, a throwaway copy of the fixture (never real data).
// Opt-in (the 146 MB fixture): BIGPROFILE70=1 node dev/run-checks.js --exact projects72
//   by hand: node dev/smoke.js --fake-engines --data /tmp/hearth-bigprofile72 --wait 1000 --check-timeout 600000 --script dev/checks/projects72.js
// (round 73, coldopen73) Two parts. The first is the session before: Clink opened once and left (a fresh profile's very
// first open, reported, not held to a budget), then Hearth starts again (//@@ reload: everything read back from disk),
// as for the owner, who always has a project they were in. The second part is the run below: its cold open is the
// first project opened after that start.
{ const w8 = (ms) => new Promise((r) => setTimeout(r, ms));
  const til = async (fn, what, n = 600) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await w8(20); } throw Error(`timed out: ${what}`); };
  try { localStorage.setItem('pj72.opts', JSON.stringify({ report: Boolean(window.PJ_REPORT), budget: window.PJ_BUDGET || null })); } catch { /* none */ }
  await til(() => document.querySelector('#agent-buttons .space-button'), 'app', 1500); await w8(2500);
  document.querySelector('#agent-buttons [data-space=projects]').click();
  const c = await til(() => document.querySelector('.pj-card[data-project="pjbp0"]'), 'cards', 1500); await w8(300);
  const t0 = performance.now(); c.click();
  await til(() => ProjectWorkspace.state().phase === 'ready' && ProjectWorkspace.state().project === 'pjbp0', 'first open', 2000);
  const first = { wall: Math.round(performance.now() - t0), timings: ProjectWorkspace.state().timings };
  await w8(500); await ProjectWorkspace.home(); await Projects.flush(); await w8(800);
  localStorage.setItem('pj72.first', JSON.stringify(first));
  return JSON.stringify({ session: 'before the restart', firstEverOpen: first }); }
//@@ reload
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, what, n = 600) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(20); } throw Error(`timed out: ${what}`); };
const OPTS = (() => { try { return JSON.parse(localStorage.getItem('pj72.opts')) || {}; } catch { return {}; } })(); // (round 73) set before the restart
if (OPTS.report) window.PJ_REPORT = 1;
const BUDGET = Object.assign({ open: 800, switch: 600, desk: 150, files: 150, switchTask: 250 }, OPTS.budget || {}, window.PJ_BUDGET || {});
const out = { budget: BUDGET, fixture: {}, open: { firstEver: JSON.parse(localStorage.getItem('pj72.first') || 'null') }, switch: {}, resume: {}, desk: {}, notArrived: {}, offline: {}, lifecycle: {}, profiles: {} }; const fails = [];
const need = (ok, what) => { if (!ok) fails.push(what); return ok; };
const click = (node) => { if (!node) throw Error('nothing to click'); node.click(); };
const menuItem = (re) => [...document.querySelectorAll('#menu button')].find((b) => re.test(b.textContent.trim()));
const ready = (id) => { const s = ProjectWorkspace.state(); return s.phase === 'ready' && s.project === id; };
const card = (id) => document.querySelector(`.pj-card[data-project="${id}"]`);
const longs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: e.startTime, ms: Math.round(e.duration) }); }).observe({ type: 'longtask' }); } catch { /* none */ }
const longestSince = (t) => Math.max(0, ...longs.filter((x) => x.at >= t).map((x) => x.ms));
// (round 74, projdesk74) long animation frames: how a measured frame's time splits between script and rendering
const loafs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) loafs.push(e); }).observe({ type: 'long-animation-frame' }); } catch { /* none */ }
const loafSince = (t, t1) => loafs.filter((e) => e.startTime + e.duration >= t && e.startTime <= t1).map((e) => { const r = e.renderStart ? e.startTime + e.duration - e.renderStart : 0; return `${Math.round(e.startTime - t)}+${Math.round(e.duration)}ms (render ${Math.round(r)}, script ${Math.round(e.duration - r)})`; });
window.hub.openExternal = () => {};
// the scene's own work: the fixture's layers post 'fixture-layer-start' (Date.now()) as their code starts in the page
// (it's another origin: a sandboxed page); from the first of them to the page's 'stack-drawn' is the layers' own code and
// first frames; 'ready-prepped' says how long the page's warm-up of textures and shaders took (ms)
const sc = { start: 0, drawn: 0, warm: 0 };
addEventListener('message', (e) => { const d = e.data; const t = d?.type; if (t === 'fixture-layer-start' && !sc.start) sc.start = d.at; if (t === 'stack-drawn') sc.drawn = Date.now(); if (t === 'ready-prepped') sc.warm = Number(d.ms) || 0; }, true);
// a click → the project ready; wall from the click, the scene's own part, the longest window task, the app's stage timings
async function timed(id, act) {
  await frame(); Object.assign(sc, { start: 0, drawn: 0, warm: 0 }); const t0 = performance.now(); const d0 = Date.now(); act();
  const stages = {}; await until(() => { const st = ProjectWorkspace.state(); if (st.stage && !(st.stage in stages)) stages[st.stage] = Date.now() - d0; return ready(id); }, `${id} ready`, 2000); const d1 = Date.now();
  await frame(); const wall = Math.round(performance.now() - t0);
  const draw = sc.start && sc.drawn > sc.start ? sc.drawn - sc.start : 0;
  const scene = Math.round(draw + sc.warm);
  // (round 73) where Hearth's part lies: before the scene's code starts in its page, after it drew (the warm-up's own ms excluded)
  const split = sc.start ? { before: sc.start - d0, after: sc.drawn ? d1 - sc.drawn - Math.round(sc.warm) : null, drawnAt: sc.drawn ? sc.drawn - d0 : null, readyAt: d1 - d0, stages } : null;
  return { hearth: wall - scene, wall, scene, sceneDraw: Math.round(draw), sceneWarm: Math.round(sc.warm), split, longest: longestSince(t0), timings: ProjectWorkspace.state().timings };
}
async function toProjects() {
  click(document.querySelector('.workspace-back') || document.querySelector('#agent-buttons [data-space=projects]'));
  await until(() => !ProjectWorkspace.current() && H.surfaceIdFor(H.activeId) === 'tool:home' && card('pjbp0'), 'Projects home', 1500);
  await frame();
}
async function switchTo(id) {
  return timed(id, () => { click(document.querySelector('.workspace-project-name')); const name = Projects.get(id).name; const b = menuItem(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)); click(b); });
}
async function profile(name, fn) {
  await wait(300);
  await smoke({ cdp: 'Profiler.enable' }); await smoke({ cdp: 'Profiler.setSamplingInterval', params: { interval: 200 } }); await smoke({ cdp: 'Profiler.start' });
  try { await fn(); } finally {
    const p = (await smoke({ cdp: 'Profiler.stop' })).profile || {}; const nodes = p.nodes || []; const byId = new Map(nodes.map((n) => [n.id, n])); const cnt = {};
    (p.samples || []).forEach((id, i) => { cnt[id] = (cnt[id] || 0) + (p.timeDeltas[i] || 0); });
    const key = (n) => `${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber + 1} ${n.callFrame.functionName || '(anon)'}`;
    const tot = (n) => { let t = cnt[n.id] || 0; for (const c of n.children || []) t += tot(byId.get(c)); n.t = t; return t; };
    nodes.filter((n) => !nodes.some((m) => (m.children || []).includes(n.id))).forEach(tot);
    const self = {}; const incl = {}; for (const n of nodes) { const k = key(n); self[k] = (self[k] || 0) + (cnt[n.id] || 0) / 1e3; if (!/^:0 \((root|program|idle)\)/.test(k)) incl[k] = Math.max(incl[k] || 0, n.t / 1e3); }
    const top = (o, n) => Object.entries(o).filter(([k]) => !/\((idle|root)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(1)} ${k}`);
    out.profiles[name] = { self: top(self, 12), total: top(incl, 12) };
  }
}

try {
  await until(() => document.querySelector('#panel .item') || document.querySelector('#agent-buttons .space-button'), 'app', 1500);
  await wait(2500);
  // ---------- Projects from the rail (the projects group loads, Home draws its cards) ----------
  { const t0 = performance.now(); click(document.querySelector('#agent-buttons [data-space=projects]'));
    await until(() => card('pjbp0'), 'cards', 1500); await frame(); out.home = { wall: Math.round(performance.now() - t0), longest: longestSince(t0), cards: document.querySelectorAll('.pj-card').length }; }
  const P = Projects; await P.ready();
  out.fixture = { projects: P.all().length, items: P.all().reduce((n, p) => n + p.items.length, 0), clinkItems: P.get('pjbp0')?.items.length, chats: H.chats.length };
  need(out.fixture.projects === 40, 'fixture: 40 projects');
  // ---------- cold open: the Clink card ----------
  // (round 73) the Lab mounts out of sight after the start when the last project's scene is the Lab's (tools/three-boot.js
  // mountSoon): given up to 20 s here (software GL draws the warm page slowly); the owner's first click comes later
  { const t0 = performance.now(); try { await until(() => H.surfaces.get('tool:three')?.mounted || (LabBoot.state().skipped && !LabBoot.state().up), 'lab mounted', 1000); } catch { /* not this time */ }
    out.open.labBeforeClick = { mounted: Boolean(H.surfaces.get('tool:three')?.mounted), waited: Math.round(performance.now() - t0), boot: LabBoot.state() }; }
  // the pointer reaches the card first, as with a real click (300 ms on it), then the click
  card('pjbp0').dispatchEvent(new PointerEvent('pointerenter', { bubbles: false })); await wait(300);
  // (round 73) the project's long chat on its first open: drawn once at its end, no resting block of older messages woken
  // on the way (it used to draw at its top, then wake 20 older messages there and stay in the middle)
  const chatProbe = { rests: [], msgs: 0 }; const probeT = setInterval(() => { const c = ProjectWorkspace.currentChat?.(); const l = c && Native.view(c.agentId)?.list; if (!l || !Native.view(c.agentId) || H.activeChat[c.agentId] !== 'claude-project-pjbp0') return; const r = l.querySelectorAll(':scope > .msg-rest').length; if (r && r !== chatProbe.rests.at(-1)) chatProbe.rests.push(r); chatProbe.msgs = Math.max(chatProbe.msgs, l.querySelectorAll('.msg').length); }, 8);
  await profile('cold-open', async () => { out.open.cold = await timed('pjbp0', () => click(card('pjbp0'))); });
  await wait(900); clearInterval(probeT);
  { const c = ProjectWorkspace.currentChat(); const l = Native.view(c.agentId)?.list; out.open.chat = { restingBlocks: chatProbe.rests.join(' → '), mostDrawn: chatProbe.msgs, fromEnd: l && l.clientHeight ? Math.round(l.scrollHeight - l.scrollTop - l.clientHeight) : 'not on screen' };
    need(chatProbe.rests.every((r, i) => !i || r >= chatProbe.rests[i - 1]), `first open of the long chat woke older messages (resting blocks ${out.open.chat.restingBlocks})`);
    need(out.open.chat.fromEnd === 'not on screen' || out.open.chat.fromEnd < 80, `first open of the long chat isn't at its end (${out.open.chat.fromEnd} px above it)`); }
  need(out.open.cold.hearth < BUDGET.open, `cold open: Hearth's part ${out.open.cold.hearth} ms ≥ ${BUDGET.open}`);
  need(ProjectWorkspace.currentChat()?.id === 'claude-project-pjbp0', 'cold open: the project chat');
  // ---------- warm open (best of 2) ----------
  const warm = [];
  for (let i = 0; i < 2; i++) { await toProjects(); await wait(300); warm.push(await timed('pjbp0', () => click(card('pjbp0')))); }
  out.open.warm = warm.sort((a, b) => a.hearth - b.hearth)[0]; out.open.warmRuns = warm.map((r) => `${r.hearth}/${r.wall}`).join(' ');
  need(out.open.warm.hearth < BUDGET.open, `warm open: Hearth's part ${out.open.warm.hearth} ms ≥ ${BUDGET.open}`);
  // ---------- switch via the name ▾ (3 rounds) ----------
  const runs = []; const order = ['pjbp1', 'pjbp2', 'pjbp0'];
  for (let r = 0; r < 3; r++) for (const id of order) { await wait(250); const x = await switchTo(id); runs.push({ id, ...x }); }
  await profile('switch', async () => { out.switch.profiled = await switchTo('pjbp1'); });
  await switchTo('pjbp0');
  for (const id of order) { const xs = runs.filter((x) => x.id === id).sort((a, b) => a.hearth - b.hearth); out.switch[id] = { best: xs[0].hearth, split: xs[0].split, bestWall: Math.min(...xs.map((x) => x.wall)), scene: xs[0].scene, runs: xs.map((x) => `${x.hearth}/${x.wall}`).join(' '), longest: Math.max(...xs.map((x) => x.longest)), timings: xs[0].timings }; }
  const bestSwitch = Math.max(...order.map((id) => out.switch[id].best));
  need(bestSwitch < BUDGET.switch, `switch: Hearth's part ${bestSwitch} ms ≥ ${BUDGET.switch}`);
  const switchTask = Math.min(...order.map((id) => out.switch[id].longest));
  need(switchTask < BUDGET.switchTask, `switch window task ${switchTask} ms ≥ ${BUDGET.switchTask}`);
  // ---------- resume: Scene tab, then a related chat ----------
  { await switchTo('pjbp1'); click([...document.querySelectorAll('.workspace-switcher button')].find((b) => b.textContent.trim() === 'Scene'));
    await until(() => H.surfaceIdFor(H.activeId) === 'tool:three', 'scene tab');
    await switchTo('pjbp2'); await switchTo('pjbp1');
    out.resume.sceneTab = H.surfaceIdFor(H.activeId); out.resume.scene = ThreeLab.scenes.currentId();
    need(out.resume.sceneTab === 'tool:three' && out.resume.scene === P.get('pjbp1').workspace.sceneId, 'resume: back on the scene tab with its scene');
    await switchTo('pjbp0'); click([...document.querySelectorAll('.workspace-switcher button')].find((b) => b.textContent.trim() === 'Desk'));
    await until(() => document.querySelector('.pw-desk .pw-shelf-section'), 'desk');
    const rel = P.get('pjbp0').items.find((x) => x.type === 'chat' && x.ref !== 'claude-project-pjbp0');
    const row = [...document.querySelectorAll('.pw-shelf-section button.pw-shelf-row')].find((b) => b.textContent.includes(P.nameOf(rel)));
    if (need(row, 'desk: a related conversation row')) { click(row); await until(() => ProjectWorkspace.currentChat()?.id === rel.ref, 'related chat'); }
    await toProjects(); await timed('pjbp0', () => click(card('pjbp0')));
    out.resume.chat = ProjectWorkspace.currentChat()?.id; out.resume.chatTab = H.surfaceIdFor(H.activeId);
    need(out.resume.chat === rel.ref, 'resume: the related chat comes back'); }
  // ---------- desk with many files ----------
  { click([...document.querySelectorAll('.workspace-switcher button')].find((b) => b.textContent.trim() === 'Desk'));
    await until(() => document.querySelector('.pw-desk .pw-project-files'), 'desk files'); await wait(400);
    // the project's chat moves between its tools (Desk, Scene): it keeps its place at its end and draws no more messages
    const chatList = () => Native.view(ProjectWorkspace.currentChat().agentId)?.list; const drawn0 = chatList()?.querySelectorAll('.msg').length;
    const runs2 = [];
    for (let i = 0; i < 3; i++) { click([...document.querySelectorAll('.workspace-switcher button')].find((b) => b.textContent.trim() === 'Scene')); await until(() => H.surfaceIdFor(H.activeId) === 'tool:three', 'scene'); await wait(250);
      const t0 = performance.now(); click([...document.querySelectorAll('.workspace-switcher button')].find((b) => b.textContent.trim() === 'Desk'));
      await until(() => document.querySelector('.pw-desk .pw-project-files') && H.surfaceIdFor(H.activeId) === 'tool:home', 'desk'); await frame(); runs2.push({ wall: Math.round(performance.now() - t0), longest: longestSince(t0) }); }
    out.desk.paint = Math.min(...runs2.map((r) => r.wall)); out.desk.paintRuns = runs2.map((r) => r.wall).join(' ');
    click([...document.querySelectorAll('.workspace-switcher button')].find((b) => b.textContent.trim() === 'Scene')); await until(() => H.surfaceIdFor(H.activeId) === 'tool:three', 'scene'); await wait(900);
    { const l = chatList(); out.desk.chatDrawn = `${drawn0} → ${l?.querySelectorAll('.msg').length}`; out.desk.chatFromEnd = l ? Math.round(l.scrollHeight - l.scrollTop - l.clientHeight) : null; }
    need(chatList()?.querySelectorAll('.msg').length === drawn0, `tab switches drew more of the chat (${out.desk.chatDrawn} messages)`);
    need(out.desk.chatFromEnd != null && out.desk.chatFromEnd < 80, `the chat lost its place at its end (${out.desk.chatFromEnd} px above it)`);
    click([...document.querySelectorAll('.workspace-switcher button')].find((b) => b.textContent.trim() === 'Desk')); await until(() => document.querySelector('.pw-desk .pw-project-files') && H.surfaceIdFor(H.activeId) === 'tool:home', 'desk again');
    // (round 74) the shelf is clicked once the Desk is on screen and its frames are steady again (three in a row under
    // 34 ms, at most 2 s), as a person clicks what they see. It used to be clicked 5–20 ms after the Desk tab: the rows
    // still came in the first frame after the click, but right after the Scene tab the Desk is rasterized again in
    // software for ≈ 1–1.5 s here (frames 130–250 ms apart, base and branch alike), and that frame waited for it
    { const t0 = performance.now(); let last = await new Promise(requestAnimationFrame); let ok = 0;
      while (ok < 3 && performance.now() - t0 < 2000) { const t = await new Promise(requestAnimationFrame); ok = t - last < 34 ? ok + 1 : 0; last = t; }
      out.desk.steadyAfterTab = Math.round(performance.now() - t0); }
    const files = document.querySelector('.pw-project-files');
    // (round 74) in frames too: the animation frames from the click to the one that shows the rows, and how long that took
    let t0 = 0; await profile('desk-files', async () => { const ticks = []; let on = true; const tick = (t) => { ticks.push(t); if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick); await frame();
      let rowsAt = 0; const mo = new MutationObserver(() => { if (!rowsAt && files.querySelector('.pw-file-results .pj-item')) rowsAt = performance.now(); }); mo.observe(files, { childList: true, subtree: true });
      t0 = performance.now(); const n0 = ticks.length; files.querySelector('summary').click(); await until(() => files.querySelector('.pw-file-results .pj-item'), 'files'); rowsAt = rowsAt || performance.now(); mo.disconnect(); await frame(); out.desk.files = Math.round(performance.now() - t0); on = false;
      const after = ticks.slice(n0); const shown = after.findIndex((t) => t >= rowsAt);
      out.desk.filesFrames = { rowsBuiltAt: Math.round(rowsAt - t0), frameShowingRows: shown < 0 ? null : shown + 1, frameAt: shown < 0 ? null : Math.round(after[shown] - t0), longFrames: loafSince(t0, performance.now()) }; });
    out.desk.filesRows = files.querySelectorAll('.pj-item').length; out.desk.count = files.querySelector('.pw-file-footer .hint')?.textContent;
    out.desk.faded = files.querySelectorAll('.pj-item.pj-gone').length;
    const q = files.querySelector('.pw-file-search'); await profile('desk-search', async () => { t0 = performance.now(); q.value = 'take'; q.dispatchEvent(new Event('input')); await frame(); out.desk.search = Math.round(performance.now() - t0); });
    q.value = ''; q.dispatchEvent(new Event('input')); await frame();
    t0 = performance.now(); files.querySelector('.pw-file-footer button').click(); await frame(); out.desk.more = Math.round(performance.now() - t0); out.desk.rowsAfterMore = files.querySelectorAll('.pj-item').length;
    need(out.desk.paint < BUDGET.desk, `desk paint ${out.desk.paint} ms ≥ ${BUDGET.desk}`);
    need(out.desk.files < BUDGET.files, `desk files ${out.desk.files} ms ≥ ${BUDGET.files}`);
    files.querySelector('summary').click();
    // typing in the project's notes (4,000 characters already): each key's own work, and what follows it (the chats
    // list, Home, the save) in the next 400 ms
    const about = document.querySelector('.pw-about'); about.querySelector('summary').click(); await frame();
    const notes = about.querySelector('.pj-notes'); notes.focus(); const keys = []; const t1 = performance.now();
    notes.setSelectionRange(notes.value.length, notes.value.length);
    await profile('notes-typing', async () => { for (const ch of ' and one more line') { const k0 = performance.now(); document.execCommand('insertText', false, ch); keys.push(performance.now() - k0); await wait(60); } });
    need(notes.maxLength === 4000, 'notes: the box stops at the 4,000 characters a project keeps (nothing typed past it is dropped)');
    await wait(400); out.desk.noteKeyMax = Math.round(Math.max(...keys) * 10) / 10; out.desk.noteKeyLongest = longestSince(t1);
    need(P.get('pjbp0').notes.endsWith(' and one more line'), 'notes: typed words kept');
    need(out.desk.noteKeyMax < 16, `notes: a key's own work ${out.desk.noteKeyMax} ms ≥ 16`);
    about.querySelector('summary').click(); }
  // ---------- not arrived: a scene, a chat ----------
  // (round 74) reported as notArrived: run-checks reads a top-level "missing…" field as a list of failures, so every passing run showed ✖
  for (const [id, key] of [['pjbp38', 'scene'], ['pjbp39', 'chat']]) {
    const before = JSON.stringify(P.get(id));
    await toProjects(); click(card(id));
    const d = await until(() => document.querySelector('dialog.pw-loading.failed'), `${key} not arrived`, 1500);
    out.notArrived[key] = d.querySelector('.pw-load-status')?.textContent; out.notArrived[`${key}Detail`] = d.querySelector('.pw-load-detail')?.textContent;
    need(/not (available|arrived)|hasn.t arrived|isn.t on this computer/i.test(out.notArrived[key]), `${key} not arrived: says so (${out.notArrived[key]})`);
    need(!/error|undefined|null|cannot read|failed to/i.test(out.notArrived[key]), `${key} not arrived: calm words`);
    const after = P.get(id); need(after && after.workspace[`${key}Id`] === JSON.parse(before).workspace[`${key}Id`] && after.items.length === JSON.parse(before).items.length, `${key} not arrived: links kept`);
    click([...d.querySelectorAll('button')].find((b) => /Back to projects/.test(b.textContent)));
    await until(() => !document.querySelector('dialog.pw-loading') && card('pjbp0'), 'back');
  }
  // ---------- prepare for offline (right-click a card) ----------
  for (const id of ['pjbp0', 'pjbp38']) {
    await until(() => !document.querySelector('dialog.offline-prepare'), 'the last offline dialog gone');
    card(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }));
    const t0 = performance.now(); click(menuItem(/Prepare for offline/));
    const d = await until(() => { const x = document.querySelector('dialog.offline-prepare[open]'); return x && !/Checking/.test(x.querySelector('[role=status]').textContent) && x; }, 'offline answer', 3000);
    out.offline[id] = { ms: Math.round(performance.now() - t0), status: d.querySelector('[role=status]').textContent, rows: [...d.querySelectorAll(':scope > div > p')].map((p) => p.textContent), issues: d.querySelector('details summary')?.textContent };
    if (id === 'pjbp38') need([...d.querySelectorAll('p')].some((p) => /scene has not arrived/i.test(p.textContent)), 'offline: the missing scene is named');
    click([...d.querySelectorAll('button')].find((b) => b.textContent === 'Close')); await wait(100);
  }
  // ---------- delete → Undo, archive → Archived projects → Active ----------
  { const id = 'pjbp5'; const name = P.get(id).name; const before = JSON.stringify(P.get(id));
    card(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })); click(menuItem(/Delete the project/));
    await until(() => !card(id), 'card gone'); out.lifecycle.deletedCardGone = true;
    const undo = [...document.querySelectorAll('#toasts .toast button')].find((b) => b.textContent === 'Undo');
    if (need(undo, 'delete: an Undo')) { click(undo); await until(() => card(id), 'card back'); }
    out.lifecycle.undoSame = JSON.stringify(P.get(id)) === before; need(out.lifecycle.undoSame, 'delete → Undo: the same project back');
    card(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })); click(menuItem(/^Status/)); await wait(50); click(await until(() => menuItem(/^Archived/), 'archived item'));
    await until(() => !card(id), 'archived leaves Home');
    click(document.querySelector('.pj-quick-more')); click(menuItem(/^Archived projects/)); const back = await until(() => menuItem(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))), 'archived list');
    out.lifecycle.archivedListed = Boolean(back);
    // the archived project opens from that list; its Desk's status menu puts it back to Active
    click(back); await until(() => ready(id), 'archived opens', 2000);
    click([...document.querySelectorAll('.workspace-switcher button')].find((b) => b.textContent.trim() === 'Desk'));
    const st = await until(() => document.querySelector('.pj-p-status'), 'status menu'); st.value = 'active'; st.dispatchEvent(new Event('change'));
    await toProjects(); await until(() => card(id), 'active again'); out.lifecycle.unarchived = P.get(id).status === 'active';
    // deleted again, the toast left to go: Projects › ⋯ › Recently deleted projects brings it back as it was
    const kept = JSON.stringify(P.get(id));
    card(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 })); click(menuItem(/Delete the project/));
    await until(() => !card(id), 'deleted again'); document.querySelectorAll('#toasts .toast .toast-x').forEach((x) => x.click());
    click(document.querySelector('.pj-quick-more')); click(menuItem(/^Recently deleted projects/));
    click(await until(() => menuItem(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))), 'recently deleted list'));
    await until(() => card(id), 'restored from Recently deleted');
    out.lifecycle.trashRestoredSame = JSON.stringify(P.get(id)) === kept; need(out.lifecycle.trashRestoredSame, 'Recently deleted → the same project back (notes, links, look)');
    need(!P.trashed().some((x) => x.id === id), 'restored: out of Recently deleted'); }
  await P.flush();
  const disk = await hub.kvGet('projects', null); out.lifecycle.onDisk = disk?.list?.length; need(disk?.list?.length === 40, 'projects on disk: 40');
} catch (err) { fails.push(`stopped: ${err.message}`); out.error = String(err.stack || err).slice(0, 600); }
out.longTasks = longs.map((x) => x.ms).sort((a, b) => b - a).slice(0, 12).join(' ');
out.fails = fails;
if (fails.length && !window.PJ_REPORT) throw Error(`${fails.join(' · ')}\n${JSON.stringify(out, null, 1)}`);
return JSON.stringify(out, null, 1);
