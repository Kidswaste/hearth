// Big screen, main side (round 38, bigscreen): Hearth as a real full-screen app on a big monitor.
//   · Full screen: one IPC for the ⛶ button / Ctrl+K / the command (the View menu's item, F11 on Windows, ⌃⌘F and the
//     green button on the Mac are the system's own). The Mac gets its own full-screen space (native full screen, the
//     traffic lights hidden with the title bar); Windows a borderless window over the taskbar (Electron's full screen).
//     Remembered per screen (bigscreen-core.js): the big monitor reopens full screen, the laptop windowed.
//   · Size of everything (the window's zoom) per screen: Auto from the screen's size in points, or the owner's pick
//     for that screen. The zoom the window opens with is handed to preload.js (--hearth-zoom=), so its first frame is
//     already at the right size; a move to another screen sends 'big:display' and the window re-zooms.
//   IPC: big:info → { sig, name, zoom, pref, auto, fullscreen, size, scale } · big:fullscreen (true | false | 'toggle')
//        · big:zoom (pref: 'auto' | 0.6…2) · big:testBounds (tests only: the window's size on the virtual screen)
//   Events to the window: big:display (the same as big:info, when the screen, its scale or full screen changed)
const B = require('./bigscreen-core');

let nf = require('./nativefeelmain'); // the window.json it keeps, this computer's name
const state = () => nf.readState();
const displayOf = (win, screen) => { try { return screen.getDisplayMatching(win.getBounds()); } catch { return screen.getPrimaryDisplay(); } };

function info(win, screen) {
  if (!win || win.isDestroyed()) return null;
  const d = displayOf(win, screen);
  const pref = B.screenOf(state(), nf.machine(), d)?.zoom ?? 'auto';
  const m = B.measure(d) || {};
  return { sig: B.sig(d), name: B.describe(d), pref, auto: B.autoZoom(d), zoom: B.zoomFor(pref, d), fullscreen: win.isFullScreen(), size: d?.size || null, scale: m.scale || 1, px: m.px || null };
}
// the zoom the window opens with, for the screen nativefeel placed it on
function startArgs(placed, screen) {
  try {
    const d = placed?.display || screen.getPrimaryDisplay();
    const z = B.zoomFor(B.screenOf(state(), nf.machine(), d)?.zoom ?? 'auto', d);
    return z !== 1 ? [`--hearth-zoom=${z}`] : [];
  } catch { return []; }
}

function setFullscreen(win, on) {
  if (!win || win.isDestroyed()) return false;
  const want = on === 'toggle' ? !win.isFullScreen() : Boolean(on);
  if (want !== win.isFullScreen()) {
    if (win.isMinimized()) win.restore();
    win.setFullScreen(want);
  }
  return want;
}

function track(win, screen, send) {
  let last = '';
  const tell = () => {
    const i = info(win, screen);
    if (!i) return;
    const key = `${i.sig}|${i.zoom}|${i.fullscreen}`;
    if (key === last) return;
    last = key;
    send('big:display', i);
  };
  let t = null;
  const soon = () => { clearTimeout(t); t = setTimeout(tell, 250); };
  for (const ev of ['move', 'resize']) win.on(ev, soon);
  // full screen on this screen remembered (the system's own ways in and out land here too: the green button, F11, ⌃⌘F)
  const remember = () => {
    if (win.isDestroyed()) return;
    nf.writeState(B.rememberScreen(state(), nf.machine(), displayOf(win, screen), { fullscreen: win.isFullScreen() }));
    tell();
  };
  for (const ev of ['enter-full-screen', 'leave-full-screen']) win.on(ev, remember);
  screen.on?.('display-metrics-changed', soon);
  screen.on?.('display-removed', soon);
  win.once('closed', () => { clearTimeout(t); screen.removeListener?.('display-metrics-changed', soon); screen.removeListener?.('display-removed', soon); });
  return { tell };
}

function register(ipcMain, { getWin, screen }) {
  ipcMain.handle('big:info', () => info(getWin(), screen));
  ipcMain.handle('big:fullscreen', (_e, on = 'toggle') => {
    const win = getWin();
    const want = setFullscreen(win, on);
    return { fullscreen: want };
  });
  ipcMain.handle('big:zoom', (_e, pref) => {
    const win = getWin();
    if (!win || win.isDestroyed()) return null;
    nf.writeState(B.rememberScreen(state(), nf.machine(), displayOf(win, screen), { zoom: pref }));
    return info(win, screen);
  });
  // tests only (dev/smoke.js sets HEARTH_TEST_SAVE_DIR): the window's size on the virtual screen
  ipcMain.handle('big:testBounds', (_e, b) => {
    const win = getWin();
    if (!process.env.HEARTH_TEST_SAVE_DIR || !win || win.isDestroyed()) return null;
    if (win.isFullScreen()) win.setFullScreen(false);
    win.setBounds({ x: b.x || 0, y: b.y || 0, width: b.width, height: b.height });
    return win.getBounds();
  });
}

module.exports = { register, track, info, startArgs, setFullscreen, _set: (x) => { nf = x; } };
