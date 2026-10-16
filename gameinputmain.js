// ▶ Play feels instant to control (round 53, gameinput), main side: the game window's input, set up once when it opens
// (gamemodemain.js calls attach right after making the window). Nothing here runs per mouse move; per key only the one
// before-input-event handler the window already had (Esc / leave keys), which now also answers F and Enter, so the
// game's page has no listener of Hearth's on its keys (game-preload.js) and the Lab player none either (?game=1).
//   - Focus on open: the game window and its page get the keyboard without a click. Mac: Hearth is made the active app
//     (a game started from a chat or a timer while you were elsewhere), again once its full-screen space is in.
//     Windows: the foreground lock lets only the app you last typed in bring a window forward (else a flashing
//     taskbar button); topmost for a moment wins it, then the window is a normal full-screen one again. Checked
//     after 300 ms and tried once more.
//   - Keys held for the game: every ⌘ shortcut on the Mac (⌘H, ⌘M, ⌘, … never hide or minimize the game; ⌘Q / ⌘W
//     leave), Alt+Space (the window menu) on Windows; Esc shows the "Back to Hearth" card, Esc again / Enter leave, from
//     here, so even a stuck game can be left. The browser's Keyboard Lock (navigator.keyboard.lock, which would also
//     take ⌘Tab / the Windows key) is refused by Electron 44 (measured, round 53: "lock() request could not be
//     registered", in Hearth's own window too): those system keys stay the system's.
//   - No text selection, no drag ghosts (a stylesheet; editable fields keep selection).
// Shapes: tools/game-api.md (info.input).
const CSS = `html, body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
input, textarea, select, [contenteditable], [contenteditable] * { -webkit-user-select: text; user-select: text; }
img, a, canvas, video, svg { -webkit-user-drag: none; }`;

let cur = null; // the game window's input state (one game at a time)
let wired = false;

function wire(ipcMain) {
  if (wired) return;
  wired = true;
  const mine = (e) => Boolean(cur?.win && !cur.win.isDestroyed() && e.sender === cur.win.webContents);
  // rare messages from the game window's preload: the mouse captured or not; the card shown by the page itself (the
  // mouse let go by Esc: Chromium keeps that Esc for itself), or closed by "Keep playing"
  ipcMain.on('game:lock', (e, on) => { if (mine(e)) cur.state.locked = Boolean(on); });
  ipcMain.on('game:menu-on', (e) => { if (mine(e)) cur.state.menu = true; });
  ipcMain.on('game:menu-off', (e) => { if (mine(e)) cur.state.menu = false; });
}

// the window's keys (before-input-event, browser side, before the page sees them): true = taken here
function key(e, input) {
  const g = cur; if (!g || input.type !== 'keyDown') return false;
  const k = String(input.key || '').toLowerCase();
  const S = g.state; const wc = g.win.webContents;
  const mods = input.meta || input.control || input.alt;
  if (k === 'escape' && !mods) {
    if (S.menu) { e.preventDefault(); g.leave('key'); return true; } // (Esc twice: from here, even if the page is stuck)
    S.menu = true; wc.send('game:menu'); return false; // (the game gets its Esc too, as before)
  }
  if (S.menu && k === 'enter' && !mods) { e.preventDefault(); g.leave('key'); return true; }
  if (k === 'f' && !mods && !input.isAutoRepeat && !S.locked && !S.menu) { wc.send('game:stats'); return false; }
  if (process.platform !== 'darwin' && input.alt && k === ' ') { e.preventDefault(); return true; } // (Windows' window menu)
  return false;
}

function attach(win, opts = {}) {
  const { app, ipcMain } = require('electron');
  wire(ipcMain);
  const mac = process.platform === 'darwin';
  const win32 = process.platform === 'win32';
  const wc = win.webContents;
  const state = { menu: false, locked: false, focus: null, keys: { held: mac ? 'every ⌘ shortcut (⌘Q / ⌘W leave)' : 'Alt+Space (Alt+F4 / Ctrl+W leave)', esc: 'the card, Esc again leaves', system: 'the system\'s (Electron refuses the browser keyboard lock)' }, lowLatency: Boolean(opts.lowLatency), raw: 'asked (unadjustedMovement, plain movement where the system has none)', selection: 'off' };
  const g = cur = { win, state, leave: opts.leave || (() => win.close()) };
  win.once('closed', () => { if (cur === g) cur = null; });
  wc.on('dom-ready', () => { wc.insertCSS(CSS).catch(() => {}); });

  // ---------- focus ----------
  const t0 = Date.now();
  const grab = (tries) => {
    if (win.isDestroyed()) return;
    if (mac) { try { app.focus({ steal: true }); } catch { /* older */ } }
    if (win32 || tries > 1) { try { win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop?.(); } catch { /* fine */ } }
    try { win.show(); win.focus(); wc.focus(); } catch { /* gone */ }
    if (win32 || tries > 1) setTimeout(() => { try { if (!win.isDestroyed()) win.setAlwaysOnTop(false); } catch { /* gone */ } }, 120);
    setTimeout(() => {
      if (win.isDestroyed()) return;
      const ok = win.isFocused() && wc.isFocused();
      state.focus = { ok, tries, ms: Date.now() - t0 };
      if (!ok && tries < 2) grab(tries + 1);
    }, 300);
  };
  // once the window is up and its page loaded (the Mac's native full screen: once its space is in)
  let shown = false; let loaded = false;
  const ready = () => { if (shown && loaded) grab(1); };
  win.once('ready-to-show', () => {
    if (mac && opts.macFullscreen !== 'simple') {
      let done = false; const go = () => { if (!done) { done = true; shown = true; ready(); } };
      win.once('enter-full-screen', go); setTimeout(go, 1500); // (the space animates in ≈ 0.7 s)
    } else { shown = true; setTimeout(ready, 0); }
  });
  wc.once('did-finish-load', () => { loaded = true; ready(); });
  return g;
}

module.exports = { attach, key, CSS, state: () => cur?.state || null, _test: { use: (g) => { cur = g; } } };
