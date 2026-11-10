// (round 154, mem154) A window that has been out of sight a while gives memory back (docs/upgrades/mem154.md).
// Hearth's window hidden (the tray, "Hide Hearth while the Lab window is open") or minimised for 30 s: its preload
// empties Blink's caches and runs a full garbage collection under "memory pressure" (webFrame.clearCache), and the page
// drops its own caches ('hearth:mem-trim'). Once per time out of sight; nothing runs while the window is shown. Chats,
// drafts and a reply streaming are untouched (only caches that are made again on demand go).
// (round 176, keep176) Out of sight 5 minutes: a second, deep trim ('mem:trim' { deep }): the page first lets go of the
// chats it keeps ready for switching back ('hearth:mem-trim-deep', native.js keepRelease), then the same clearCache
// takes them with its GC. Once per time out of sight too.
// HEARTH_TRIM_MS / HEARTH_TRIM_DEEP_MS: the waits (tests).
const stats = { trims: 0, deep: 0, last: null, windows: 0 };
const envMs = (k, def) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : def; };
const waitMs = () => envMs('HEARTH_TRIM_MS', 30000);
const deepMs = () => envMs('HEARTH_TRIM_DEEP_MS', 5 * 60000);
function attach(win, name = 'window') {
  if (!win || win.isDestroyed()) return;
  stats.windows += 1;
  let timer = null; let done = false; let deepT = null; let deepDone = false;
  const away = () => !win.isDestroyed() && (!win.isVisible() || win.isMinimized());
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (done || !away()) return;
      done = true; stats.trims += 1; stats.last = { name, at: Date.now() };
      try { win.webContents.send('mem:trim'); } catch { /* closing */ }
    }, waitMs());
    timer.unref?.();
    clearTimeout(deepT);
    deepT = setTimeout(() => {
      deepT = null;
      if (deepDone || !away()) return;
      deepDone = true; stats.deep += 1; stats.last = { name, at: Date.now(), deep: true };
      try { win.webContents.send('mem:trim', { deep: true }); } catch { /* closing */ }
    }, deepMs());
    deepT.unref?.();
  };
  const back = () => { clearTimeout(timer); timer = null; done = false; clearTimeout(deepT); deepT = null; deepDone = false; };
  win.on('hide', arm); win.on('minimize', arm);
  win.on('show', back); win.on('restore', back);
  win.on('closed', () => { clearTimeout(timer); clearTimeout(deepT); });
}
module.exports = { attach, state: () => ({ ...stats, waitMs: waitMs(), deepMs: deepMs() }) };
