// Loaded into Electron's main process by dev/coldstart-report.js (NODE_OPTIONS=--require): records when the main
// process reached each step of a cold start, without any help from main.js, so old and new builds compare fairly.
// Times are ms since the process started (performance.now() in the main process) plus the wall clock at 0, written
// to $HEARTH_BOOT_PROBE as JSON after every step. Also: how long each module main.js requires at load takes.
// (Child processes inherit NODE_OPTIONS: anything that isn't Electron's main process is left alone.)
// (round 34, lightweight) HEARTH_BOOT_PROBE_BYTES=1 also sums what each channel's answers weigh (JSON length, or bytes),
// and HEARTH_BOOT_PROBE_MS sets how long after the window IPC is counted (default 5000).
const OUT = process.env.HEARTH_BOOT_PROBE;
if (OUT && process.versions.electron && process.type === 'browser') {
  const fs = require('fs');
  const Module = require('module');
  const t = { wall0: Date.now() - performance.now(), marks: {}, requires: [] };
  const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(t)); } catch { /* ignore */ } };
  const mark = (name) => { if (t.marks[name] == null) { t.marks[name] = Math.round(performance.now() * 10) / 10; save(); } };
  mark('probe');

  // 'electron' can't be required yet from here: the hooks go in when main.js asks for it
  const hook = (electron) => {
    const { app, ipcMain } = electron;
    // every IPC call the window makes in its first 5 s: how many per channel and the main process's time in them
    t.ipc = {};
    const handle = ipcMain.handle.bind(ipcMain);
    ipcMain.handle = (ch, fn) => handle(ch, (...a) => {
      if (performance.now() > (t.marks.windowCreated ?? 1e9) + (Number(process.env.HEARTH_BOOT_PROBE_MS) || 5000)) return fn(...a);
      const t0 = performance.now();
      const weigh = (x) => { if (!process.env.HEARTH_BOOT_PROBE_BYTES || x == null) return 0; try { return typeof x === 'string' ? x.length : x.byteLength ?? JSON.stringify(x).length; } catch { return 0; } };
      const done = (x) => { const s = (t.ipc[ch] ||= [0, 0, 0]); s[0] += 1; s[1] += performance.now() - t0; if (process.env.HEARTH_BOOT_PROBE_BYTES) s[3] = (s[3] || 0) + weigh(x); save(); };
      let r;
      try { r = fn(...a); } finally { const s = (t.ipc[ch] ||= [0, 0, 0]); s[2] += performance.now() - t0; } // [calls, ms to answer, ms of main-thread work]
      if (r && typeof r.then === 'function') r.then(done, done); else done();
      return r;
    });
    app.once('will-finish-launching', () => mark('willFinishLaunching'));
    app.once('ready', () => mark('appReady'));
    app.on('browser-window-created', (_e, win) => {
      if (t.marks.windowCreated != null) return;
      mark('windowCreated');
      if (win.isVisible()) mark('windowShown');
      win.once('show', () => mark('windowShown'));
      win.once('ready-to-show', () => mark('readyToShow'));
      win.webContents.once('dom-ready', () => mark('domReady'));
      win.webContents.once('did-finish-load', () => mark('didFinishLoad'));
    });
  };
  // the app's own modules main.js requires (their nested requires included), until the window exists
  const load = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (t.marks.windowCreated != null || !/[\\/]main\.js$/.test(parent?.filename || '')) return load.call(this, request, parent, ...rest);
    if (t.marks.mainjs == null) mark('mainjs');
    const t0 = performance.now();
    const out = load.call(this, request, parent, ...rest);
    if (request === 'electron' && !t.hooked) { t.hooked = true; hook(out); }
    if (request.startsWith('.')) t.requires.push([request, Math.round((performance.now() - t0) * 10) / 10]);
    return out;
  };
}
