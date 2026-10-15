// The graphics card going away, main process side (round 43, glrecover). Watches Chromium's GPU process: a crash
// ('child-process-gone' of type GPU) and what drawing uses now (app.getGPUFeatureStatus(), again on 'gpu-info-update'),
// and tells the window one calm note (glrecover-core.js decides which): "The graphics card restarted — …" or "Hearth is
// drawing without the graphics card right now — Restart Hearth to get it back". A note made before the window listens
// waits in `notes` until it asks (glrecover:state). The Lab's own recovery is in the preview page and tools/three.js.
//   glrecover:state → { kind, sawGpu, crashes, notes, status } · glrecover:shown (id) · glrecover:sim (test copies only:
//   a stubbed GPU status and a GPU process gone, the same paths as the real events) · → window 'glrecover:note'
const Core = require('./glrecover-core');

function register(ipcMain, { getWin, app = require('electron').app, status = null, test = Boolean(process.env.HEARTH_TEST_SAVE_DIR), delays = {} } = {}) {
  const D = { crash: 2500, late: 7000, info: 600, ...delays }; // (after a crash the status settles once the GPU process is back)
  let stub = null; // (tests: the status a check pretends)
  const read = () => { if (stub) return stub; try { return (status || (() => app.getGPUFeatureStatus()))() || {}; } catch { return {}; } };
  const st = Core.init(read());
  let quitting = false;
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const send = (n) => { const w = getWin?.(); if (!w || w.isDestroyed?.()) return; try { w.webContents.send('glrecover:note', { ...n, text: Core.text(n.kind), labText: Core.text(n.kind, { lab: true }) }); } catch { /* window gone */ } };
  const check = (after) => { const n = Core.step(st, { type: 'check', status: read(), after }); if (n) send(n); return n; };
  let infoT = 0;
  const onGone = (_e, d) => {
    if (!Core.isCrash(d, quitting)) return;
    Core.step(st, { type: 'crash' });
    later(D.crash, () => check('crash'));
    later(D.late, () => check('late')); // (a fall to software can be decided a moment later)
  };
  const onInfo = () => { clearTimeout(infoT); infoT = setTimeout(() => check('info'), D.info); };
  const onQuit = () => { quitting = true; };
  app.on('child-process-gone', onGone);
  app.on('gpu-info-update', onInfo);
  app.on('before-quit', onQuit);
  ipcMain.handle('glrecover:state', () => ({ ...Core.view(st), status: read() }));
  ipcMain.handle('glrecover:shown', (_e, id) => { const n = st.notes.find((x) => x.id === id); if (n) n.shown = true; return Boolean(n); });
  // (dev/checks/glrecover.js: only in a test copy) o.status: the GPU status to pretend from now on (null: the real one)
  // · o.gone: a GPU process gone with that reason · o.info: a 'gpu-info-update' · o.delays: shorter waits
  ipcMain.handle('glrecover:sim', (_e, o = {}) => {
    if (!test) return { ok: false, error: 'only in a test copy' };
    if ('status' in o) stub = o.status || null;
    if (o.delays) Object.assign(D, o.delays);
    if (o.gone) app.emit('child-process-gone', {}, { type: 'GPU', reason: String(o.gone), exitCode: Number(o.exitCode) || 1 });
    if (o.info) app.emit('gpu-info-update');
    return { ok: true, ...Core.view(st) };
  });
  return {
    state: () => Core.view(st),
    dispose() { for (const t of timers) clearTimeout(t); timers.clear(); clearTimeout(infoT); app.removeListener('child-process-gone', onGone); app.removeListener('gpu-info-update', onInfo); app.removeListener('before-quit', onQuit); },
  };
}

module.exports = { register };
