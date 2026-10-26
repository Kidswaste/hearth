// Native feel, main side (round 36, nativefeel): the window as each computer expects it.
//   · Window memory per computer and per screen layout (nativefeel-core.js), restored where it can be seen; a screen
//     unplugged while Hearth runs brings the window back to one that is there.
//   · The frame: on the Mac the title bar is hidden and the traffic lights sit in the rail, level with the headers
//     (titleBarStyle 'hiddenInset'); a double-click on a header does what System Settings says (zoom / minimise /
//     nothing). On Windows the system's own title bar stays (website agents and the chats' docks reach the top right,
//     where an overlay's buttons would sit), dark or light with the look.
//   · Light / dark: nativeTheme follows the look's kind (menus, dialogs, the title bar, form controls), or the
//     computer's own setting while the look follows it; the window's colour behind the page is the look's.
//   · Menus (both systems), the badge of replies that finished while Hearth was in the background (the Dock's number
//     and one bounce on the Mac; the taskbar's flash and an overlay number on Windows), cleared when you come back.
//   IPC: native:look ({ scheme, background, follow }) → { osDark } · native:titleDblClick · native:info
//   Events to the window: native:os-scheme { osDark } · native:state { fullscreen, maximized } · native:menu (action)
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('./nativefeel-core');
const B = require('./bigscreen-core');

let o = { dataDir: path.join(__dirname, 'data'), platform: process.platform, host: os.hostname() };
const file = () => path.join(o.dataDir, 'window.json');
const machine = () => `${o.platform}:${String(o.host || '').replace(/\.local$/i, '').toLowerCase() || 'this'}`;
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
function writeJson(f, v) { const t = `${f}.tmp`; fs.writeFileSync(t, JSON.stringify(v)); try { fs.renameSync(t, f); } catch { fs.writeFileSync(f, JSON.stringify(v)); fs.rmSync(t, { force: true }); } }

// ---------- the frame ----------
// The Mac: no title bar, the traffic lights in the rail (64 px wide) level with the 52 px headers. The owner can go back
// to the plain title bar with settings.macTitleBar = 'native' (/titlebar native; after a restart).
const LIGHTS = { x: 8, y: 20 }; // (the three lights are 52 × 12 px: 8…60 of the 64 px rail, centred on the 52 px headers)
function frameOptions(settings = {}) {
  if (o.platform !== 'darwin' || settings.macTitleBar === 'native') return {};
  return { titleBarStyle: 'hiddenInset', trafficLightPosition: { ...LIGHTS } };
}
const frameKind = (settings = {}) => (o.platform === 'darwin' && settings.macTitleBar !== 'native' ? 'inset' : 'system');

// ---------- window memory ----------
// screen: Electron's screen module (or a stand-in in tests)
function restore(screen) {
  const displays = screen.getAllDisplays();
  const state = C.read(readJson(file()), machine());
  const key = C.layoutKey(displays);
  const entry = C.pick(state, machine(), key, displays);
  const placed = C.place(entry, displays, screen.getPrimaryDisplay()?.id);
  // (round 38, bigscreen) a set of screens not seen yet: full screen as the screen it opens on had it last (the big
  // monitor full screen, the laptop windowed), and that screen handed to the zoom
  const d = displays.find((x) => x.id === placed.displayId) || null;
  const fsOf = d ? B.fullscreenFor(state, machine(), d, Boolean(state.machines?.[machine()]?.layouts?.[key])) : null;
  if (fsOf != null) placed.fullscreen = fsOf;
  placed.display = d;
  return placed;
}
// (round 38, bigscreen) the same file, for bigscreenmain.js (each screen's size of everything and full screen)
const readState = () => C.read(readJson(file()), machine());
function writeState(state) { try { writeJson(file(), state); } catch { /* not critical */ } }
function capture(win, screen) {
  const bounds = typeof win.getNormalBounds === 'function' ? win.getNormalBounds() : win.getBounds();
  const d = screen.getDisplayMatching(bounds);
  return { bounds, maximized: win.isMaximized(), fullscreen: win.isFullScreen(), displayId: d?.id ?? null, scale: d?.scaleFactor || 1 };
}
function save(win, screen) {
  if (!win || win.isDestroyed() || win.isMinimized()) return; // (a minimised window's place says nothing)
  try {
    const state = C.remember(readJson(file()), machine(), C.layoutKey(screen.getAllDisplays()), capture(win, screen));
    writeJson(file(), state);
  } catch { /* not critical */ }
}
function track(win, screen, send) {
  let t = null;
  const later = () => { clearTimeout(t); t = setTimeout(() => save(win, screen), 500); };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, later);
  const state = () => { later(); send?.('native:state', { fullscreen: win.isFullScreen(), maximized: win.isMaximized() }); };
  for (const ev of ['enter-full-screen', 'leave-full-screen']) win.on(ev, state);
  win.on('close', () => { clearTimeout(t); save(win, screen); });
  // a screen unplugged (or rearranged) while Hearth runs: the window comes back to one that is there
  const rescue = () => setTimeout(() => {
    if (win.isDestroyed() || win.isFullScreen() || win.isMaximized() || win.isMinimized()) return;
    const p = C.place({ bounds: win.getBounds() }, screen.getAllDisplays(), screen.getPrimaryDisplay()?.id);
    if (p.rescued && p.bounds) win.setBounds(p.bounds);
  }, 300);
  screen.on?.('display-removed', rescue);
  screen.on?.('display-metrics-changed', rescue);
  win.once('closed', () => { screen.removeListener?.('display-removed', rescue); screen.removeListener?.('display-metrics-changed', rescue); });
}
// after the window is shown: maximised / full screen as it was
function applyFlags(win, placed) {
  if (placed?.fullscreen) win.setFullScreen(true);
}

// ---------- light / dark ----------
let follow = false;
// (round 40, firstscreen) the last light / dark of this computer, set before the window is made (earlyTheme): setting it
// once the page asks (native:look) re-themed a window already there, ≈ 25–70 ms of the main process during the start
const THEMES = new Set(['system', 'light', 'dark']);
function keepTheme(want) {
  try {
    const s = C.read(readJson(file()), machine());
    if (s.machines[machine()]?.theme === want) return;
    s.machines[machine()] = { ...(s.machines[machine()] || {}), theme: want };
    writeJson(file(), s);
  } catch { /* not critical */ }
}
function earlyTheme(nativeTheme) {
  try {
    const t = C.read(readJson(file()), machine()).machines[machine()]?.theme;
    if (THEMES.has(t) && nativeTheme.themeSource !== t) nativeTheme.themeSource = t;
  } catch { /* the page sets it */ }
}
function setLook(win, nativeTheme, { scheme, background, follow: f } = {}) {
  follow = Boolean(f);
  const want = follow ? 'system' : scheme === 'light' ? 'light' : 'dark';
  if (nativeTheme.themeSource !== want) { nativeTheme.themeSource = want; keepTheme(want); }
  if (win && !win.isDestroyed() && /^#[0-9a-f]{6}$/i.test(String(background || ''))) {
    try { win.setBackgroundColor(background); } catch { /* fine */ }
  }
  return { osDark: follow ? nativeTheme.shouldUseDarkColors : null, source: nativeTheme.themeSource };
}

// ---------- attention: a reply finished while Hearth was in the background ----------
// The Mac: the Dock's number, one bounce per time away; Windows: the taskbar button flashes until you come back and
// shows the number on Hearth's icon. Notifications themselves are the system's (they follow Do Not Disturb / Focus
// on both: Electron's Notification goes through Notification Center / Windows' toasts); the badge never makes a sound.
let away = 0; let bounced = false;
function badgeImage(nativeImage, appshell, n) {
  try {
    const img = nativeImage.createFromBuffer(appshell.pngFromRgba(Buffer.from(C.badgeRgba(n, 16)), 16), { scaleFactor: 1 });
    img.addRepresentation({ scaleFactor: 2, buffer: appshell.pngFromRgba(Buffer.from(C.badgeRgba(n, 32)), 32) });
    return img;
  } catch { return null; }
}
function attention(win, { app, nativeImage, appshell }) {
  if (!win || win.isDestroyed() || (win.isFocused() && win.isVisible())) return { away: 0 };
  away += 1;
  if (o.platform === 'darwin') {
    try { app.dock?.setBadge(C.badgeText(away)); } catch { /* fine */ }
    if (!bounced) { bounced = true; try { app.dock?.bounce('informational'); } catch { /* fine */ } }
  } else if (o.platform === 'win32') {
    win.flashFrame(true);
    const img = badgeImage(nativeImage, appshell, away);
    if (img) { try { win.setOverlayIcon(img, `${away} finished while you were away`); } catch { /* fine */ } }
  } else {
    try { app.setBadgeCount?.(away); } catch { /* fine */ }
    win.flashFrame(true);
  }
  return { away };
}
function clearAttention(win, { app }) {
  const had = away; away = 0; bounced = false;
  if (!had) { if (win && !win.isDestroyed()) win.flashFrame(false); return; }
  if (o.platform === 'darwin') { try { app.dock?.setBadge(''); } catch { /* fine */ } }
  else if (o.platform === 'win32') { try { win.setOverlayIcon(null, ''); } catch { /* fine */ } }
  else { try { app.setBadgeCount?.(0); } catch { /* fine */ } }
  if (win && !win.isDestroyed()) win.flashFrame(false);
}

// ---------- menus ----------
function setupMenu({ Menu, app, getWin, send, appName }) {
  const main = () => { const w = getWin(); if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } return w; };
  const act = (action, arg) => () => { if (main()) send('native:menu', { action, arg }); };
  const tpl = C.menuTemplate({ platform: o.platform, appName, act: {
    settings: act('settings'), keys: act('keys'), report: act('report'), slow: act('slow'), onTop: act('onTop'),
    zoom: (d) => act('zoom', d)(),
    devtools: () => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.toggleDevTools(); },
    close: () => getWin()?.close(), quit: () => app.quit(),
  } });
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
  // About says Hearth (package.json's name stays "agent-hub" on purpose: it decides the profile folder)
  try { app.setAboutPanelOptions?.({ applicationName: appName, copyright: 'Your agents around one fire' }); } catch { /* fine */ }
  return tpl;
}

function register(ipcMain, { getWin, nativeTheme, systemPreferences, app, nativeImage, appshell, send }) {
  ipcMain.handle('native:look', (_e, look) => setLook(getWin(), nativeTheme, look || {}));
  ipcMain.handle('native:titleDblClick', () => {
    const win = getWin();
    if (!win || win.isDestroyed()) return 'none';
    let pref = '';
    if (o.platform === 'darwin') { try { pref = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string'); } catch { pref = ''; } }
    const what = C.macDoubleClick(pref);
    if (what === 'minimize') win.minimize();
    else if (what === 'zoom') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    return what;
  });
  ipcMain.handle('native:info', () => ({ platform: o.platform, osDark: nativeTheme.shouldUseDarkColors, source: nativeTheme.themeSource, away }));
  // the computer switched light / dark (only says something while a look follows it: themeSource 'system')
  nativeTheme.on('updated', () => { if (follow) send('native:os-scheme', { osDark: nativeTheme.shouldUseDarkColors }); });
  return { attention: () => attention(getWin(), { app, nativeImage, appshell }), clear: () => clearAttention(getWin(), { app }) };
}

module.exports = { frameOptions, frameKind, restore, earlyTheme, readState, writeState, capture, save, track, applyFlags, setLook, attention, clearAttention, setupMenu, register, machine, LIGHTS,
  _set: (x) => { o = { ...o, ...x }; away = 0; bounced = false; follow = false; }, _away: () => away };
