// (round 176, silent176) Windows has no xvfb: a check's throwaway copy of Hearth opened its windows on the owner's
// screen, took the keyboard and played sound. dev/smoke.js loads this file into that copy's main process (electron -r)
// on Windows: every window of the test copy is kept far off the screen, out of the taskbar, and never takes focus;
// they still draw at full speed (the flags smoke.js adds turn off Chromium's "window is hidden" savings).
// SMOKE_SHOW=1 runs a check the old way, to watch it.
const { app } = require('electron');
const FAR = -30000;
let n = 0;
app.on('browser-window-created', (_e, w) => {
  const slot = (n++ % 8) * 40; // (windows side by side out there, not all on one spot: positions stay distinct)
  let busy = false;
  const park = () => {
    if (busy || w.isDestroyed()) return;
    busy = true;
    try {
      if (w.isFullScreen()) w.setFullScreen(false);
      if (w.isMaximized()) w.unmaximize();
      const b = w.getBounds();
      if (b.x > FAR + 5000 || b.y > FAR + 5000) w.setPosition(FAR + slot, FAR + slot);
      w.setSkipTaskbar(true);
    } catch { /* closing */ }
    busy = false;
  };
  // shown without taking the keyboard from what the owner is typing in
  const show = w.showInactive.bind(w);
  w.show = () => { park(); show(); park(); };
  w.focus = () => {};
  w.moveTop = () => {};
  const full = w.setFullScreen.bind(w);
  w.setFullScreen = (on) => { if (!on) full(false); };
  for (const ev of ['show', 'move', 'moved', 'restore', 'maximize', 'enter-full-screen', 'ready-to-show', 'resize']) w.on(ev, park);
  park();
  setImmediate(park);
});
// no tray balloon or sound from a test copy's notifications
try { app.setAppUserModelId('hearth.smoke.silent'); } catch { /* fine */ }
