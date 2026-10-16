// The best graphics path on each computer (round 52, gpu52), the main process side. gpu52-core.js decides; this:
//   early(app, …)   before Electron's 'ready' (main.js, right after config.json can be read): the switches for this
//                   start (the fast card, the ANGLE path if you picked one, the blocklist), and the start marker
//                   (data/gpu52.json) that brings a picked path back to the default when a start never reached the card
//   register(…)     after the window: a few seconds in, did this start reach the card? (the marker is settled; a start
//                   in software on a computer with a real card is told once, calmly, with why and Restart); on
//                   Windows, its own per-app graphics choice (written only when you never set one); gpu52:info for
//                   Settings › Advanced › Graphics and /graphics
//   gpu52:info → { line, name, backend, hz, video, kind, dual, decision, flags, note } · gpu52:reset (a new choice
//   gets its own try) · gpu52:sim (test copies only: a pretend status / card / crash) · → window 'gpu52:note'
const fs = require('fs');
const path = require('path');
const Core = require('./gpu52-core');

const TEST = Boolean(process.env.HEARTH_TEST_SAVE_DIR);
let D = null; // this start's decision
let file = '';
let marker = {};
const readMarker = () => { try { return JSON.parse(require('./scenesafe-core').readRetry(fs, file, { tries: 2 })) || {}; } catch { return {}; } };
// (a small file only Hearth writes; losing it costs one more try of a picked path: written whole, temp + rename)
function writeMarker(m) {
  if (!file) return;
  marker = m || {};
  try { const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(marker)); fs.renameSync(tmp, file); } catch (err) { console.warn('gpu52: marker', err.message); }
}

function early(app, { settings = {}, dataDir, platform = process.platform, argv = process.argv } = {}) {
  file = path.join(dataDir, 'gpu52.json');
  marker = readMarker();
  D = Core.decide({ platform, settings, marker, argv });
  for (const [n, v] of D.switches) { if (v == null) app.commandLine.appendSwitch(n); else app.commandLine.appendSwitch(n, v); }
  if (D.marker) writeMarker(D.marker);
  return D;
}

// Windows: HKCU\Software\Microsoft\DirectX\UserGpuPreferences "<Hearth's exe>" (what Settings › Graphics writes)
const REG = 'HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences';
function winRegistry(exe, power, run = require('child_process').execFile) {
  return new Promise((resolve) => {
    run('reg', ['query', REG, '/v', exe], { windowsHide: true, timeout: 5000 }, (err, out) => {
      const current = err ? null : (/REG_SZ\s+(.*)$/m.exec(String(out || '')) || [])[1]?.trim() || null;
      const plan = Core.winPref({ current, ours: marker.win?.ours ?? null, power });
      const done = (wrote) => { writeMarker({ ...marker, win: { ours: wrote ? plan.want : marker.win?.ours ?? null, user: plan.user } }); resolve({ current, ...plan, wrote }); };
      if (!plan.write) { done(false); return; }
      run('reg', ['add', REG, '/v', exe, '/t', 'REG_SZ', '/d', plan.write, '/f'], { windowsHide: true, timeout: 5000 }, (e2) => done(!e2));
    });
  });
}

function register(ipcMain, { getWin, app = require('electron').app, screen = null, delays = {}, status = null, gpuInfo = null } = {}) {
  const T = { settle: 4000, late: 12000, reg: 15000, ...delays };
  if (!D) D = Core.decide({ platform: process.platform, settings: {}, marker: {} }); // (early() wasn't called: a test)
  let stub = null; let infoStub = null; let crashes = 0; let note = null; let info = null; let sawGpu = false;
  const readStatus = () => { if (stub) return stub; try { return (status || (() => app.getGPUFeatureStatus()))() || {}; } catch { return {}; } };
  const readInfo = async () => {
    if (infoStub) return infoStub;
    try { info = await (gpuInfo || ((t) => app.getGPUInfo(t)))(info ? 'basic' : 'complete'); } catch { /* unknown */ }
    return info;
  };
  const send = (n) => { const w = getWin?.(); if (!w || w.isDestroyed?.()) return; try { w.webContents.send('gpu52:note', n); } catch { /* gone */ } };
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const onGone = (_e, d) => { if (d?.type === 'GPU' && d.reason !== 'clean-exit') crashes += 1; };
  app.on('child-process-gone', onGone);

  // did this start reach the card? (settle the marker; tell once when it didn't on a computer that has one)
  async function look() {
    const st = readStatus(); const k = Core.kind(st);
    if (k === 'gpu') sawGpu = true;
    const next = Core.settle(marker, k);
    if (next) writeMarker(next);
    const back = D.fellBack?.why === 'never-started';
    if (!back && (k === 'gpu' || k === 'unknown' || sawGpu)) return note; // (on the card earlier this session: glrecover's note says that)
    const n = Core.startNote({ status: st, info: back ? null : await readInfo(), decision: D, crashes, told: marker.told || '' }); // (the card's info only when needed)
    if (n && (!note || note.id !== n.id)) { note = { ...n, shown: false }; writeMarker({ ...marker, told: n.id }); send(note); }
    return note;
  }
  later(T.settle, () => { look().catch(() => {}); });
  later(T.late, () => { look().catch(() => {}); }); // (a start that went to software a moment later)
  app.on('before-quit', () => { const next = Core.settle(marker, Core.kind(readStatus())); if (next) writeMarker(next); }); // (a quick quit on the card isn't a start that failed)
  if (process.platform === 'win32' && !TEST) later(T.reg, () => { winRegistry(process.execPath, D.power).catch(() => {}); });

  const hzOf = () => {
    try {
      const scr = screen || require('electron').screen; const w = getWin?.();
      const d = w && !w.isDestroyed() ? scr.getDisplayMatching(w.getBounds()) : scr.getPrimaryDisplay();
      return Math.round(d?.displayFrequency || 0);
    } catch { return 0; }
  };
  const flags = () => Object.fromEntries([...Core.NEVER, 'use-angle', 'force_high_performance_gpu', 'force_low_power_gpu', 'ignore-gpu-blocklist'].map((n) => [n, app.commandLine.hasSwitch(n) ? (app.commandLine.getSwitchValue(n) || true) : false]));
  ipcMain.handle('gpu52:info', async (_e, o = {}) => {
    const st = readStatus(); const inf = await readInfo(); const hz = hzOf();
    const r = Core.parseRenderer(inf?.auxAttributes?.glRenderer);
    return {
      line: Core.line({ info: inf, status: st, hz, fps: Number(o.fps) || 0, decision: D }),
      name: Core.gpuName(inf), backend: r.backend || Core.label(D.backend), hz, video: /^enabled/.test(String(st.video_decode || '')),
      kind: Core.kind(st), dual: Core.dualGpu(inf), crashes,
      decision: { backend: D.backend, auto: D.auto, power: D.power, choice: D.choice, ignoreBlocklist: D.ignoreBlocklist, switches: D.switches, fellBack: D.fellBack, external: D.external, platform: D.platform },
      flags: flags(), note, marker: { key: marker.key || '', state: marker.state || '' }, status: st,
    };
  });
  ipcMain.handle('gpu52:shown', () => { if (note) note.shown = true; return true; });
  ipcMain.handle('gpu52:reset', () => { writeMarker({ win: marker.win, told: marker.told }); return true; }); // (a new choice: tried afresh at the next start)
  // (dev/checks/gpu52.js, a test copy only) o.status / o.info: what to pretend · o.decision: this start's choice as if
  // made with these settings / marker (o.settings, o.marker, o.platform) · o.gone: a GPU crash · o.look: look now
  ipcMain.handle('gpu52:sim', async (_e, o = {}) => {
    if (!TEST) return { ok: false, error: 'only in a test copy' };
    if ('status' in o) stub = o.status || null;
    if ('info' in o) infoStub = o.info || null;
    if (o.settings || o.marker || o.platform) D = Core.decide({ platform: o.platform || process.platform, settings: o.settings || {}, marker: o.marker || {}, argv: [] });
    if (o.marker) marker = { ...o.marker };
    if (o.forget) { note = null; sawGpu = false; }
    if (o.gone) app.emit('child-process-gone', {}, { type: 'GPU', reason: String(o.gone), exitCode: 1 });
    const n = o.look ? await look() : null;
    return { ok: true, note: n, marker: { ...marker }, decision: D };
  });
  return {
    decision: () => D, look,
    dispose() { for (const t of timers) clearTimeout(t); timers.clear(); app.removeListener('child-process-gone', onGone); },
  };
}

// for the ▶ Play window (gamemode): its BrowserWindow webPreferences (never throttled) and the page patch that makes a
// game's WebGL ask for the fast card (the power you picked)
module.exports = { early, register, winRegistry, playWindowPrefs: Core.playWindowPrefs, pagePatch: () => Core.pagePatch(D?.power), decision: () => D };
