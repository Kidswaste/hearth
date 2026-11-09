// (round 162, main162) the main process lighter and quicker to start (docs/upgrades/main162.md), ONE check of the wins,
// tolerant of box variance. Its own temp data folder (smoke.js), the fake engines; never an owner's data.
//   start     the window on screen within 1.5 s of the process start (≈ 0.45 s here), the first screen within 3 s
//   lazy      the sync engine (sync off, no Hearth folder in a drive) and the frame reader are not loaded once settled;
//             the frame reader comes in on the first capture call (and answers)
//   idle      a chat open, untouched for 60 s: the main process wakes ≤ 3 times a minute (6 before: the config safety
//             net every 10 s → 30 s), no stat polling, NOTHING written in the data folder
//   watch     a settings file changed outside Hearth still reaches the window within 5 s (its watcher, armed after the
//             first screen)
//   hidden    Hearth hidden 45 s: ≤ 3 wake-ups a minute, nothing written
//   stream    a long reply (≈ 100 KB, fake engine): its pieces are sent ≤ 18 times a second (25 before: every 40 → 60 ms),
//             and ≤ 5 a second while Hearth is hidden (every 250 ms); the whole reply arrives either way
//   windows   the Lab window opened and closed 10 ×: no listener / IPC handler / web contents left behind, the main
//             heap after a GC within 3 MB of before
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/checks/main162.js
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const phase = async (ms, during) => {
  await T({ probe: 'start' }); await T({ writes: 'start' });
  if (during) await during(); else await wait(ms);
  const p = (await T({ probe: 'take' }))?.probe; const w = (await T({ writes: 'take' }))?.writes;
  return { perMin: p?.perMin, top: p?.top?.slice(0, 5), statPollsPerMin: p?.statPollsPerMin, writes: w?.events, files: w?.files?.slice(0, 6), seconds: p?.seconds };
};
const sample = async () => { const s = (await T({ longrun: { gc: true } }))?.longrun; return { heapMB: Math.round(s.heap / 1e5) / 10, ipc: s.ipc.total, invoke: s.ipc.invoke, app: s.listeners.app.n, power: s.listeners.powerMonitor.n, win: s.listeners.win?.n || 0, wc: s.listeners.wc?.n || 0, contents: s.contents, windows: s.windows }; };
const batchRate = (top) => { const l = (top || []).find((x) => /engines\.js/.test(x) && /timeout fn/.test(x)); return l ? Number(l.split('/')[0]) / 60 : 0; };
const has = (mods, f) => (mods?.own || []).includes(f);

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  const boot = (await window.hub.bootStatus())?.times || {};
  out.measure.boot = boot;
  step('start: the window is on screen within 1.5 s of the process start, the first screen within 3 s', boot.shown > 0 && boot.shown <= 1500 && boot.firstScreen > 0 && boot.firstScreen <= 3000, boot);

  const claude = H.claudeAgent();
  activate(claude.id); await wait(300); Native.newChat(claude.id); await wait(200);
  await Native.send(claude.id, 'hello there, a short reply please');
  await until(() => !Native.isAgentBusy(claude.id), 30000);
  document.activeElement?.blur?.();
  await until(() => performance.now() > 70000, 120000);

  // ---------- lazy ----------
  const mods = (await T({ modules: true }))?.modules;
  out.measure.modules = mods?.count;
  step('lazy: settled with sync off, the sync engine and the frame reader are not loaded', mods && !has(mods, 'sync-engine.js') && !has(mods, 'framereader.js'), { count: mods?.count, syncEngine: has(mods, 'sync-engine.js'), frameReader: has(mods, 'framereader.js') });

  // ---------- idle ----------
  const idle = await phase(60000); out.measure.idle = idle;
  step('idle: the main process wakes ≤ 3 times a minute, no stat polling', idle.perMin <= 3 && idle.statPollsPerMin === 0, idle);
  step('idle: nothing is written in the data folder', idle.writes === 0, idle.files);

  // ---------- lazy: first use ----------
  const dir = await window.hub.capture.dir().catch((err) => ({ error: err.message }));
  const mods2 = (await T({ modules: true }))?.modules;
  step('lazy: the first capture call loads the frame reader and answers', has(mods2, 'framereader.js') && dir && !dir.error, { dir: typeof dir === 'object' ? Object.keys(dir) : dir });

  // ---------- watch ----------
  const D = (await window.hub.reach.info()).dataDir;
  const cfgFile = `${D}/config.json`;
  const cfg = JSON.parse(await window.hub.fs.read(cfgFile));
  const mark = `m162-${Date.now()}`;
  cfg.settings = { ...(cfg.settings || {}), main162Probe: mark };
  const t0 = performance.now();
  await window.hub.fs.write(cfgFile, JSON.stringify(cfg, null, 2));
  const heard = await until(() => H.config?.settings?.main162Probe === mark, 8000, 100);
  out.measure.watchMs = heard ? Math.round(performance.now() - t0) : null;
  step('watch: settings changed outside Hearth reach the window within 5 s', Boolean(heard) && out.measure.watchMs <= 5000, out.measure.watchMs);

  // ---------- hidden ----------
  await T({ window: 'hide' }); await until(() => document.visibilityState === 'hidden', 5000); await wait(2000);
  const hidden = await phase(45000); out.measure.hidden = hidden;
  step('hidden: ≤ 3 wake-ups a minute, nothing written', hidden.perMin <= 3 && hidden.writes === 0, hidden);

  // ---------- stream (hidden, then shown) ----------
  const streamOnce = async (label) => {
    let len = 0;
    const r = await phase(0, async () => {
      Native.newChat(claude.id); await wait(200);
      await Native.send(claude.id, `huge-text please (${label})`);
      await until(() => !Native.isAgentBusy(claude.id), 150000, 200);
      const id = H.activeChat[claude.id];
      await until(async () => { const c = await window.hub.getChat(id).catch(() => null); len = (c?.messages || []).filter((m) => m.role === 'assistant').map((m) => String(m.text || '').length).pop() || 0; return len > 0; }, 10000, 300);
    });
    return { ...r, perSec: Math.round(batchRate(r.top) * 10) / 10, replyChars: len };
  };
  const sh = await streamOnce('hidden'); out.measure.streamHidden = sh;
  await T({ window: 'show' }); await until(() => document.visibilityState === 'visible', 5000); await wait(1500);
  const sv = await streamOnce('shown'); out.measure.stream = sv;
  step('stream: a long reply\'s pieces are sent ≤ 18 times a second while Hearth is on screen', sv.perSec > 0 && sv.perSec <= 18, { perSec: sv.perSec, top: sv.top });
  step('stream: ≤ 5 a second while Hearth is hidden', sh.perSec <= 5, { perSec: sh.perSec, top: sh.top });
  step('stream: the whole reply arrives either way (same length)', sv.replyChars > 50000 && Math.abs(sv.replyChars - sh.replyChars) <= 200, { shown: sv.replyChars, hidden: sh.replyChars });

  // ---------- windows ----------
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.workspace.state().ready, 60000);
  const openClose = async () => {
    await window.hub.labwin.open({ scene: ThreeLab.scenes.currentId() });
    const ok = await until(async () => (await window.hub.labwin.state()).open, 20000);
    await wait(1500);
    await window.hub.labwin.close();
    await until(async () => !(await window.hub.labwin.state()).open, 15000);
    await wait(400);
    return Boolean(ok);
  };
  await openClose(); // (the first one loads what every later one shares)
  const s0 = await sample();
  let opened = 0; for (let i = 0; i < 10; i++) if (await openClose()) opened += 1;
  await wait(1500);
  const s1 = await sample();
  out.measure.windows = { before: s0, after: s1 };
  const grew = ['ipc', 'invoke', 'app', 'power', 'win', 'wc', 'contents', 'windows'].filter((k) => s1[k] > s0[k]);
  step('windows: the Lab window opened and closed 10 ×, no listener / IPC handler / web contents left behind', opened === 10 && !grew.length, { opened, grew, before: s0, after: s1 });
  step('windows: the main heap after a GC within 3 MB of before', s1.heapMB - s0.heapMB <= 3, { before: s0.heapMB, after: s1.heapMB });
  activate(claude.id);
} catch (err) { step(`threw: ${String(err?.stack || err).slice(0, 500)}`, false); }
out.ok = !out.problems;
if (out.problems) throw new Error(`main162: ${out.problems.length} failed\n${out.steps.join('\n')}`);
return JSON.stringify(out, null, 1);
