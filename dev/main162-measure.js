// (round 162, main162) what the main process costs, start to an hour-like session (docs/upgrades/main162.md). A smoke.js
// script (not a check): its own temp data folder, the fake engines.
//   node dev/smoke.js --fake-engines --check-timeout 1500000 --script dev/main162-measure.js [--app <old copy>]
// (an old copy needs this round's powerwisemain.js for the write counter and the module list: copy it in first)
//   boot      the main process' own marks (ms since it started): ready, window made, shown, first frame, first screen
//   modules   Hearth's main-process modules in at the first screen, after settling and after the session
//   idle      a chat open, focused, untouched 60 s (after 75 s of start-up): main CPU ms/s, its timer wakeups / min (by
//             the line that made them), changes under the data folder / min
//   hidden    the same with Hearth hidden
//   stream    a long reply streaming (fake engine, ≈ 100 KB): main CPU ms/s, wakeups, writes
//   session   10 × (a new chat, a reply, deleted), 10 × the Lab window opened and closed, the Lab shown and left: the
//             main heap after a GC, listeners, IPC handlers, timers alive, before → after
const out = { measure: {} };
const M = out.measure;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const cpu = async () => { const m = (await T({ metrics: true }))?.metrics; return { at: Date.now(), main: m?.mainCpu ? (m.mainCpu.user + m.mainCpu.system) / 1000 : null }; };
const rate = (a, b) => Math.round(((b.main - a.main) / ((b.at - a.at) / 1000)) * 10) / 10;
const phase = async (name, ms, during) => {
  await T({ probe: 'start' }); await T({ writes: 'start' });
  const c0 = await cpu();
  const job = during ? during() : wait(ms);
  await job;
  const c1 = await cpu();
  const p = (await T({ probe: 'take' }))?.probe;
  const w = (await T({ writes: 'take' }))?.writes;
  M[name] = { seconds: p?.seconds, mainCpuMsPerS: rate(c0, c1), wakeupsPerMin: p?.perMin, top: p?.top?.slice(0, 8), statPollsPerMin: p?.statPollsPerMin, writesPerMin: w?.perMin, writes: w?.events, files: w?.files?.slice(0, 8) };
};
const sample = async () => { const s = (await T({ longrun: { gc: true } }))?.longrun; return s && { heapMB: Math.round(s.heap / 1e5) / 10, rssMB: Math.round(s.rss / 1e5) / 10, extMB: Math.round(s.external / 1e5) / 10, ipc: s.ipc, listeners: s.listeners, handles: s.handles, timers: s.timers, contents: s.contents, windows: s.windows }; };
const mainWs = async () => { const m = (await T({ metrics: true }))?.metrics; const b = m?.procs?.find((p) => p.type === 'Browser'); return b ? Math.round(b.mem / 1024) : null; };

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  M.boot = (await window.hub.bootStatus())?.times;
  M.modulesAtReady = (await T({ modules: true }))?.modules;
  const claude = H.claudeAgent();
  activate(claude.id); await wait(300); Native.newChat(claude.id); await wait(200);
  await Native.send(claude.id, 'hello there, a short reply please');
  await until(() => !Native.isAgentBusy(claude.id), 30000);
  document.activeElement?.blur?.();
  await until(() => performance.now() > 75000, 120000);
  M.modulesSettled = (await T({ modules: true }))?.modules;
  M.settled = { ...(await sample()), mainWsMB: await mainWs() };

  await phase('idle', 60000);
  await T({ window: 'hide' }); await until(() => document.visibilityState === 'hidden', 5000); await wait(3000);
  await phase('hidden', 60000);
  await T({ window: 'show' }); await until(() => document.visibilityState === 'visible', 5000); await wait(3000);
  await phase('stream', 0, async () => {
    Native.newChat(claude.id); await wait(200);
    const t0 = performance.now();
    await Native.send(claude.id, 'huge-text please, a long one');
    await until(() => !Native.isAgentBusy(claude.id), 120000, 100);
    M.streamMs = Math.round(performance.now() - t0);
  });

  // ---------- session ----------
  const s0 = await sample(); M.sessionBefore = { ...s0, mainWsMB: await mainWs() };
  for (let i = 0; i < 10; i++) {
    Native.newChat(claude.id); await wait(150);
    await Native.send(claude.id, `session chat ${i}, short reply`);
    await until(() => !Native.isAgentBusy(claude.id), 30000, 100);
    const id = H.activeChat[claude.id];
    if (id && i % 2 === 0) { try { await Native.remove(id); } catch { /* kept */ } }
  }
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && window.LabWinHost, 60000);
  await until(() => ThreeLab.workspace.state().ready, 30000);
  const opens = [];
  for (let i = 0; i < 10; i++) {
    const t0 = performance.now();
    try { await window.hub.labwin.open({ scene: ThreeLab.scenes.currentId() }); } catch (err) { opens.push(`error ${err.message}`); break; }
    const ok = await until(async () => (await window.hub.labwin.state()).open, 20000);
    await wait(2500);
    await window.hub.labwin.close();
    await until(async () => !(await window.hub.labwin.state()).open, 15000);
    opens.push(ok ? Math.round(performance.now() - t0) : 'no');
    await wait(500);
  }
  M.labwinOpens = opens;
  activate(claude.id); await wait(3000);
  const s1 = await sample(); M.sessionAfter = { ...s1, mainWsMB: await mainWs() };
  M.modulesAfter = (await T({ modules: true }))?.modules;
  M.growth = { heapMB: Math.round((s1.heapMB - s0.heapMB) * 10) / 10, ipc: s1.ipc.total - s0.ipc.total, invoke: s1.ipc.invoke - s0.ipc.invoke, app: s1.listeners.app.n - s0.listeners.app.n, powerMonitor: s1.listeners.powerMonitor.n - s0.listeners.powerMonitor.n, win: (s1.listeners.win?.n || 0) - (s0.listeners.win?.n || 0), wc: (s1.listeners.wc?.n || 0) - (s0.listeners.wc?.n || 0), contents: s1.contents - s0.contents };
  await phase('idleAfterSession', 60000);
} catch (err) { out.error = String(err?.stack || err).slice(0, 800); }
return JSON.stringify(out, null, 1);
