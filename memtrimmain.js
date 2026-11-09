// (round 154, mem154) A window that has been out of sight a while gives memory back (docs/upgrades/mem154.md).
// Hearth's window hidden (the tray, "Hide Hearth while the Lab window is open") or minimised for 30 s: its preload
// empties Blink's caches and runs a full garbage collection under "memory pressure" (webFrame.clearCache), and the page
// drops its own caches ('hearth:mem-trim'). Once per time out of sight; nothing runs while the window is shown. Chats,
// drafts and a reply streaming are untouched (only caches that are made again on demand go).
// HEARTH_TRIM_MS: the wait (tests).
const stats = { trims: 0, last: null, windows: 0 };
const waitMs = () => { const n = Number(process.env.HEARTH_TRIM_MS); return Number.isFinite(n) && n > 0 ? n : 30000; };
function attach(win, name = 'window') {
  if (!win || win.isDestroyed()) return;
  stats.windows += 1;
  let timer = null; let done = false;
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
  };
  const back = () => { clearTimeout(timer); timer = null; done = false; };
  win.on('hide', arm); win.on('minimize', arm);
  win.on('show', back); win.on('restore', back);
  win.on('closed', () => clearTimeout(timer));
}
module.exports = { attach, state: () => ({ ...stats, waitMs: waitMs() }) };
