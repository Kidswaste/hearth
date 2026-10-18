// The main process never hangs the app (round 65, mainhang65). The owner: "the app hangs a lot and is laggy when
// scrolling/clicking/hovering". In Electron the whole app freezes when the MAIN process is busy: every IPC call of the
// window (a chat opening, a list scrolling in more rows, a hover asking for a preview) waits behind it. This measures the
// main process' event-loop delay (mainlag-probe.js: perf_hooks monitorEventLoopDelay, a 1 ms CPU profile cut into
// blocks, every fs.*Sync call, IPC per channel) on a BIG data folder (dev/make-bighome-fixture.js: thousands of chats,
// attachments, a long quest journal, preset folders) and a Windows-slow disk (HEARTH_SLOWFS_US: each sync fs call made
// that much slower, as on NTFS with Defender scanning), during:
//   1. startup (from the first line of main.js to the window settled)
//   2. 30 s idle (the owner reading)
//   3. common actions: opening / switching chats, the chats list searched and scrolled, rows hovered, the ✦ tracker,
//      a tool or two, a message sent, the daily backup
// Budget per phase: p99 < 50 ms and max < 200 ms (window.MH_REPORT = 1 reports without failing).
//   node dev/make-bighome-fixture.js /tmp/hearth-bighome
//   HEARTH_LOOPLAG=prof HEARTH_SLOWFS_US=150 node dev/smoke.js --fake-engines --data /tmp/hearth-bighome \
//     --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/mainhang65.js
const { step, wait } = J;
const out = J.out;
const lag = (o) => window.hub.power.test({ lag: o });
const IDLE = Number(localStorage.getItem('mh.idleMs')) || 30000;
const BUDGET = { p99: 50, max: 200 };
const ok = (r) => r.delay.p99 < BUDGET.p99 && r.delay.max < BUDGET.max;
const brief = (r) => ({ seconds: r.seconds, delay: r.delay, fsSync: { n: r.fsSync.n, ms: r.fsSync.ms, top: r.fsSync.top.slice(0, 8).map((x) => `${x.n}× ${x.ms}ms ${x.k}`) },
  ipc: { n: r.ipc.n, slowest: r.ipc.top.slice(0, 6).map((x) => `${x.n}× ${x.ms}ms ${x.k}`), busiest: r.ipc.busiest.slice(0, 5) }, sends: r.sends.slice(0, 5),
  blocks: (r.blocks || []).slice(0, 6).map((b) => `${b.ms}ms @${b.atMs} · ${b.app.slice(0, 3).join(' | ')}`) });
out.phases = {};
if (!window.hub?.power?.test) { step('the test hook is there', false); return J.done(); }
// 1. startup: the window up, the chat list drawn, then everything the first minute starts (lazy modules, the warm
// host's timer, the deferred startup work) given time to run
await wait(8000);
const s = await lag({ label: 'startup' });
if (!s?.delay) { step('the lag probe is on (HEARTH_LOOPLAG)', false, s); return J.done(); }
out.phases.startup = brief(s);
step(`startup: main-process delay p99 ${s.delay.p99} ms, max ${s.delay.max} ms`, ok(s) || window.MH_REPORT, out.phases.startup.blocks.slice(0, 3));

// 2. idle
await wait(IDLE);
const i = await lag({ label: 'idle' });
out.phases.idle = brief(i);
step(`idle ${Math.round(IDLE / 1000)} s: p99 ${i.delay.p99} ms, max ${i.delay.max} ms`, ok(i) || window.MH_REPORT, out.phases.idle.blocks.slice(0, 3));

// 3. common actions
const claude = H.claudeAgent?.() || (H.config.agents || []).find((a) => a.engine === 'claude');
const chats = (await window.hub.listChats?.().catch(() => null)) || [];
const mine = chats.filter((c) => c.agentId === claude?.id).slice(0, 40);
const did = [];
try {
  activate(claude.id); await wait(500);
  for (const c of mine.slice(0, 12)) { Native.open(claude.id, c.id); await wait(350); }
  did.push(`opened ${Math.min(12, mine.length)} chats`);
  // back to the first ones (switching)
  for (const c of mine.slice(0, 4)) { Native.open(claude.id, c.id); await wait(250); }
  // the chats list: searched, cleared, scrolled
  if (window.Panel?.setFilter) {
    for (const q of ['s', 'sh', 'sha', 'shad', 'shader', '']) { Panel.setFilter(q); Panel.flush?.(); await wait(120); }
    did.push('searched the chats list');
  }
  const list = document.querySelector('#panel .list, #panel-list, .panel-list, #chats');
  if (list) { for (let k = 0; k < 20; k++) { list.scrollTop += 600; await wait(60); } did.push('scrolled the chats list'); }
  // hovering rows (previews, tooltips)
  const rows = [...document.querySelectorAll('#panel .row, #panel [data-chat], .panel-row')].slice(0, 15);
  for (const r of rows) { const b = r.getBoundingClientRect(); if (b.width) { await J.mouse('mouseMoved', b.left + b.width / 2, b.top + b.height / 2, { button: 'none' }); await wait(80); } }
  if (rows.length) did.push(`hovered ${rows.length} rows`);
  // the ✦ tracker, a tool or two, then back
  for (const t of ['tool:quests', 'tool:notes', 'tool:board']) { if (H.surfaces?.has?.(t) || (window.Tools?.get?.(t.slice(5)))) { activate(t); await wait(900); did.push(t); } }
  activate(claude.id); await wait(400);
  // a new chat and a message to the fake engine
  Native.newChat(claude.id); await wait(300);
  Native.setDraft?.(claude.id, 'hello there'); await wait(100);
  await J.command(claude.id, 'hello there', 2500).catch(() => {});
  did.push('sent a message');
  // settings saved a few times (a toggle, the panel's width, the rail's order: each save of config.json used to come
  // back from the file watcher as "config changed" and redraw the rail, the surfaces and the whole chats list)
  {
    const long = []; const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push(Math.round(e.duration)); });
    try { po.observe({ entryTypes: ['longtask'] }); } catch { /* no long tasks here */ }
    let echoes = 0; const off = window.hub.onConfigChanged?.(() => { echoes += 1; });
    for (let k = 0; k < 4; k++) { await saveConfig(); await wait(1200); }
    po.disconnect(); if (typeof off === 'function') off();
    out.configSaves = { saves: 4, echoes, longTasks: long, longMs: long.reduce((x, y) => x + y, 0) };
    did.push(`saved settings 4× (${echoes} echoes, ${long.length} long tasks, ${out.configSaves.longMs} ms)`);
  }
  // the daily backup (Settings › Backups; it runs by itself once a day while the owner works): the whole data folder
  // copied aside, zipped and checked
  const b = await window.hub.backupauto?.run?.('manual').catch((err) => ({ error: err.message }));
  did.push(`backup ${b?.ok === false || b?.error ? `failed (${b.error || b.why || ''})` : 'made'}`);
} catch (err) { out.problems.push(`actions: ${err.message}`); }
await wait(2000);
const a = await lag({ label: 'actions' });
out.phases.actions = { did, ...brief(a) };
step(`common actions: p99 ${a.delay.p99} ms, max ${a.delay.max} ms`, ok(a) || window.MH_REPORT, out.phases.actions.blocks.slice(0, 3));
out.budget = BUDGET;
return J.done();
