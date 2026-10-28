#!/usr/bin/env node
// (round 36, nativefeel) Unit tests for nativefeel-core.js and nativefeelmain.js with an injected platform, screens,
// window and Electron stand-ins (no Electron, no real screens): window memory per computer and per screen layout, the
// off-screen guard, the menus of both systems and the keys they take (checked against every key line in the app),
// the Mac's frame and double-click setting, light / dark (nativeTheme), the badge, the screen-scale rule (also the
// copy inside the Lab's sandbox). Node only: node dev/nativefeel-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../nativefeel-core');
const M = require('../nativefeelmain');

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
const ROOT = path.join(__dirname, '..');

// ---------- screens ----------
const disp = (id, x, y, w, h, scale = 1, menuBar = 0) => ({ id, bounds: { x, y, width: w, height: h }, workArea: { x, y: y + menuBar, width: w, height: h - menuBar - 40 }, scaleFactor: scale });
const LAPTOP = disp(1, 0, 0, 1512, 982, 2, 25); // a MacBook alone
const STUDIO = disp(2, 1512, -300, 2560, 1440, 1); // + a monitor on its right, higher up
const PC_A = disp(10, 0, 0, 2560, 1440, 1.5); // Windows: 150 %
const PC_B = disp(11, -1920, 0, 1920, 1080, 1.25); // a second monitor on the LEFT (negative x)

const kLaptop = C.layoutKey([LAPTOP]); const kBoth = C.layoutKey([STUDIO, LAPTOP]);
ok(kBoth === C.layoutKey([LAPTOP, STUDIO]), 'layout key: the order of the screens doesn\'t matter');
ok(kLaptop !== kBoth, 'layout key: another set of screens is another layout');
ok(C.layoutKey([{ ...LAPTOP, scaleFactor: 1 }]) !== kLaptop, 'layout key: a new scale is another layout');
eq(C.layoutKey([]), 'none', 'layout key: no screens');

// ---------- the off-screen guard ----------
let p = C.place({ bounds: { x: 100, y: 60, width: 1200, height: 800 } }, [LAPTOP], 1);
eq(p.bounds, { x: 100, y: 60, width: 1200, height: 800 }, 'on screen: kept as it was');
ok(!p.rescued && p.displayId === 1, 'on screen: not rescued, on the laptop');
// saved on the studio monitor, the monitor gone
p = C.place({ bounds: { x: 1800, y: -200, width: 1600, height: 1000 }, displayId: 2, maximized: true }, [LAPTOP], 1);
ok(p.rescued, 'monitor gone: rescued');
ok(p.bounds.x >= 0 && p.bounds.y >= 25 && p.bounds.x + p.bounds.width <= 1512 && p.bounds.y + p.bounds.height <= 982 - 40, `monitor gone: inside the laptop's work area (${JSON.stringify(p.bounds)})`);
ok(p.maximized === true, 'monitor gone: still maximised as it was');
ok(p.bounds.width === 1512 && p.bounds.height === 982 - 25 - 40, 'monitor gone: a window bigger than the laptop fits it');
// the title bar under the Mac's menu bar
p = C.place({ bounds: { x: 100, y: 0, width: 900, height: 600 } }, [LAPTOP], 1);
ok(p.rescued && p.bounds.y >= 25, 'title above the work area (under the menu bar): brought down');
// dragged almost entirely off the left edge
p = C.place({ bounds: { x: -1150, y: 100, width: 1200, height: 700 } }, [LAPTOP], 1);
ok(p.rescued && p.bounds.x >= 0, 'only 50 px showing: brought back');
// a sliver of 130 px is enough to grab it: kept
p = C.place({ bounds: { x: -1046, y: 100, width: 1200, height: 700 } }, [LAPTOP], 1);
ok(!p.rescued, '130 px of title showing: left where you put it');
// Windows: a monitor on the left (negative x) is a real place
p = C.place({ bounds: { x: -1700, y: 100, width: 1400, height: 800 }, displayId: 11 }, [PC_A, PC_B], 10);
ok(!p.rescued && p.displayId === 11, 'Windows: on the left monitor (negative x): kept');
// that left monitor unplugged: back on the main one, its own size
p = C.place({ bounds: { x: -1700, y: 100, width: 1400, height: 800 }, displayId: 11 }, [PC_A], 10);
ok(p.rescued && p.displayId === 10 && p.bounds.width === 1400 && p.bounds.height === 800, 'Windows: left monitor gone → centred on the main one, same size');
eq(p.bounds, { x: Math.round((2560 - 1400) / 2), y: Math.round((1400 - 800) / 2), width: 1400, height: 800 }, 'Windows: centred');
// a window spanning two screens (its title on both) stays
p = C.place({ bounds: { x: 1300, y: 100, width: 800, height: 600 } }, [LAPTOP, STUDIO], 1);
ok(!p.rescued, 'across two screens with its title visible: kept');
// a smaller screen now (scale went up): taller than the screen → fitted, kept on that screen
p = C.place({ bounds: { x: 10, y: 30, width: 1500, height: 1200 } }, [LAPTOP], 1);
ok(p.rescued && p.bounds.height <= 982 - 25 - 40 && p.bounds.y >= 25, 'taller than its screen: fitted inside');
// nothing remembered
p = C.place(null, [PC_A, PC_B], 10);
ok(p.displayId === 10 && p.bounds.width === 1480 && p.bounds.height === 940 && !p.rescued, 'first start: 1480×940 centred on the main screen');
p = C.place(null, [disp(5, 0, 0, 1024, 700)], 5);
ok(p.bounds.width <= 1024 && p.bounds.height <= 660, 'first start on a small screen: fits it');
ok(p.bounds.width >= 760 && p.bounds.height >= 480, 'first start on a small screen: at least the minimum size');
// no screens at all (a headless start): the saved bounds as they are
p = C.place({ bounds: { x: 5, y: 5, width: 900, height: 700 } }, [], null);
eq(p.bounds, { x: 5, y: 5, width: 900, height: 700 }, 'no screen info: unchanged');
// junk in the file
p = C.place({ bounds: { x: 'a', y: null } }, [LAPTOP], 1);
ok(p.bounds && p.bounds.width > 0 && !p.rescued, 'junk bounds: a default place');
// every rescued place is grabbable
for (const [e, list] of [[{ bounds: { x: 9000, y: 9000, width: 800, height: 600 } }, [LAPTOP]], [{ bounds: { x: -5000, y: -5000, width: 3000, height: 3000 } }, [PC_A, PC_B]], [{ bounds: { x: 0, y: 5000, width: 800, height: 600 } }, [STUDIO, LAPTOP]]]) {
  const r = C.place(e, list, list[0].id);
  ok(r.rescued && C.grabbable(r.bounds, list), `far away ${JSON.stringify(e.bounds)}: rescued onto a screen`);
}

// ---------- the file: per computer, per layout ----------
eq(C.read({ x: 10, y: 20, width: 1000, height: 700, maximized: true }, 'darwin:mbp').machines['darwin:mbp'], { last: 'legacy', layouts: { legacy: { bounds: { x: 10, y: 20, width: 1000, height: 700 }, maximized: true, fullscreen: false, at: 0 } } }, 'the round-35 file: read as this computer\'s');
eq(C.read(null, 'x'), { v: 2, machines: {} }, 'no file');
eq(C.read('garbage', 'x'), { v: 2, machines: {} }, 'a broken file');
let s = C.remember(null, 'darwin:mbp', kLaptop, { bounds: { x: 1, y: 30, width: 900, height: 600 } }, 1000);
s = C.remember(s, 'darwin:mbp', kBoth, { bounds: { x: 1600, y: -200, width: 2000, height: 1200 }, displayId: 2 }, 2000);
s = C.remember(s, 'win32:quent-pc', C.layoutKey([PC_A, PC_B]), { bounds: { x: -1700, y: 100, width: 1400, height: 800 } }, 3000);
eq(C.pick(s, 'darwin:mbp', kLaptop).bounds, { x: 1, y: 30, width: 900, height: 600 }, 'the Mac alone: its own place');
eq(C.pick(s, 'darwin:mbp', kBoth).displayId, 2, 'the Mac + studio monitor: on the monitor');
eq(C.pick(s, 'darwin:mbp', 'some-new-layout').displayId, 2, 'a new layout: the last place (then guarded by place())');
eq(C.pick(s, 'win32:quent-pc', C.layoutKey([PC_A, PC_B])).bounds.x, -1700, 'the PC keeps its own');
eq(C.pick(s, 'win32:other', kLaptop), null, 'another computer\'s places are never used');
let big = null;
for (let i = 0; i < 12; i += 1) big = C.remember(big, 'darwin:mbp', `layout-${i}`, { bounds: { x: i, y: 30, width: 900, height: 600 } }, 100 + i);
eq(Object.keys(big.machines['darwin:mbp'].layouts).length, 8, 'at most 8 layouts per computer');
ok(big.machines['darwin:mbp'].layouts['layout-11'] && !big.machines['darwin:mbp'].layouts['layout-0'], 'the oldest layouts go');
for (let i = 0; i < 6; i += 1) big = C.remember(big, `linux:m${i}`, 'k', { bounds: { x: 0, y: 0, width: 900, height: 600 } }, 1000 + i);
eq(Object.keys(big.machines).length, 4, 'at most 4 computers');

// ---------- main side with an injected platform and screens ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nativefeel-'));
const fakeScreen = (displays, primary) => {
  const L = {};
  return { getAllDisplays: () => displays, getPrimaryDisplay: () => displays.find((d) => d.id === primary) || displays[0],
    getDisplayMatching: (r) => C.displayFor(r, displays), on: (ev, fn) => { (L[ev] ||= []).push(fn); }, removeListener: (ev, fn) => { L[ev] = (L[ev] || []).filter((f) => f !== fn); }, fire: (ev) => (L[ev] || []).forEach((f) => f()), L };
};
const fakeWin = (bounds, extra = {}) => {
  const L = {}; const calls = [];
  const w = { bounds: { ...bounds }, max: false, full: false, min: false, focused: false, visible: true, destroyed: false, calls,
    getBounds: () => ({ ...w.bounds }), getNormalBounds: () => ({ ...w.bounds }), setBounds: (b) => { calls.push(['setBounds', b]); w.bounds = { ...b }; },
    isMaximized: () => w.max, isFullScreen: () => w.full, isMinimized: () => w.min, isDestroyed: () => w.destroyed, isFocused: () => w.focused, isVisible: () => w.visible,
    on: (ev, fn) => { (L[ev] ||= []).push(fn); }, once: (ev, fn) => { (L[ev] ||= []).push(fn); }, emit: (ev) => (L[ev] || []).forEach((f) => f()),
    flashFrame: (on) => calls.push(['flashFrame', on]), setOverlayIcon: (img, d) => calls.push(['overlay', img ? 'img' : null, d]),
    setFullScreen: (on) => { calls.push(['fullscreen', on]); w.full = on; }, setBackgroundColor: (c) => calls.push(['bg', c]),
    minimize: () => calls.push(['minimize']), maximize: () => { calls.push(['maximize']); w.max = true; }, unmaximize: () => { calls.push(['unmaximize']); w.max = false; }, ...extra };
  return w;
};
M._set({ dataDir: tmp, platform: 'darwin', host: 'Quentins-MacBook-Pro.local' });
eq(M.machine(), 'darwin:quentins-macbook-pro', 'this computer: platform + host name (".local" dropped)');
// an old round-35 file on this Mac
fs.writeFileSync(path.join(tmp, 'window.json'), JSON.stringify({ x: 40, y: 40, width: 1300, height: 800, maximized: false }));
let scr = fakeScreen([LAPTOP], 1);
eq(M.restore(scr).bounds, { x: 40, y: 40, width: 1300, height: 800 }, 'main: the old file still restores');
// moved onto the studio monitor and maximised there, then closed
scr = fakeScreen([LAPTOP, STUDIO], 1);
let w = fakeWin({ x: 1700, y: -250, width: 1800, height: 1100 });
M.track(w, scr, () => {});
w.max = true; w.emit('close');
let saved = JSON.parse(fs.readFileSync(path.join(tmp, 'window.json'), 'utf8'));
ok(saved.v === 2 && saved.machines['darwin:quentins-macbook-pro'].layouts[C.layoutKey([LAPTOP, STUDIO])].maximized === true, 'main: saved per computer + layout, maximised');
eq(saved.machines['darwin:quentins-macbook-pro'].layouts[C.layoutKey([LAPTOP, STUDIO])].displayId, 2, 'main: on the studio monitor');
ok(saved.machines['darwin:quentins-macbook-pro'].layouts.legacy, 'main: the old place is kept for the laptop alone');
// next start with the monitor there: on it, maximised
p = M.restore(fakeScreen([LAPTOP, STUDIO], 1));
ok(p.maximized && p.displayId === 2 && !p.rescued, 'main: next start with the monitor: there, maximised');
// next start without it (on the train): the laptop's own place
p = M.restore(fakeScreen([LAPTOP], 1));
eq(p.bounds, { x: 40, y: 40, width: 1300, height: 800 }, 'main: without the monitor: the laptop\'s own place');
// the same data folder on the PC (portable pack): the Mac's places aren't used there
M._set({ dataDir: tmp, platform: 'win32', host: 'QUENT-PC' });
p = M.restore(fakeScreen([PC_A], 10));
ok(p.bounds.width === 1480 && p.displayId === 10, 'main: another computer starts with its own default, not the Mac\'s place');
// a minimised window's place isn't saved
w = fakeWin({ x: -32000, y: -32000, width: 160, height: 28 });
M.track(w, fakeScreen([PC_A], 10), () => {});
w.min = true; w.emit('close');
saved = JSON.parse(fs.readFileSync(path.join(tmp, 'window.json'), 'utf8'));
ok(!saved.machines['win32:quent-pc'], 'main: a minimised window (Windows parks it at −32000) isn\'t remembered');
// full screen: told to the window, remembered, restored after showing
let sent = [];
w = fakeWin({ x: 100, y: 100, width: 1400, height: 900 });
M.track(w, fakeScreen([PC_A], 10), (ch, d) => sent.push([ch, d]));
w.full = true; w.emit('enter-full-screen');
eq(sent[0], ['native:state', { fullscreen: true, maximized: false }], 'main: full screen told to the window');
w.emit('close');
p = M.restore(fakeScreen([PC_A], 10));
ok(p.fullscreen, 'main: full screen remembered');
const w2 = fakeWin({ x: 0, y: 0, width: 10, height: 10 }); M.applyFlags(w2, p);
eq(w2.calls, [['fullscreen', true]], 'main: full screen put back after showing');
// a monitor unplugged while running: the window comes back
scr = fakeScreen([PC_A, PC_B], 10);
w = fakeWin({ x: -1700, y: 100, width: 1400, height: 800 });
M.track(w, scr, () => {});
scr.getAllDisplays = () => [PC_A];
scr.fire('display-removed');
setTimeout(() => {
  ok(w.calls.some((c) => c[0] === 'setBounds' && c[1].x >= 0), 'main: a screen unplugged while running: the window comes back to one that is there');
  w.emit('closed');
  ok(!(scr.L['display-removed'] || []).length, 'main: screen listeners removed with the window');
  rest();
}, 380);

function rest() {
  // ---------- the frame ----------
  M._set({ dataDir: tmp, platform: 'darwin', host: 'mbp' });
  eq(M.frameOptions({}), { titleBarStyle: 'hiddenInset', trafficLightPosition: M.LIGHTS }, 'Mac: hidden inset title bar, traffic lights placed');
  ok(M.LIGHTS.x + 52 <= 64 && M.LIGHTS.y + 12 <= 44, 'Mac: the three lights (52 × 12 px) fit in the 64 px rail above its first button (44 px)');
  eq(M.frameOptions({ macTitleBar: 'native' }), {}, 'Mac: /titlebar native keeps the plain title bar');
  eq(M.frameKind({}), 'inset', 'Mac: frame kind inset');
  M._set({ platform: 'win32' });
  eq(M.frameOptions({}), {}, 'Windows: the system title bar');
  eq(M.frameKind({}), 'system', 'Windows: frame kind system');
  M._set({ platform: 'linux' });
  eq(M.frameOptions({}), {}, 'Linux: unchanged');

  // ---------- double-click on the title (macOS setting) ----------
  eq(['Maximize', 'Fill', '', null, 'Minimize', 'None', 'No Action'].map(C.macDoubleClick), ['zoom', 'zoom', 'zoom', 'zoom', 'minimize', 'none', 'none'], 'Mac: AppleActionOnDoubleClick');

  // ---------- light / dark (nativeTheme) ----------
  const NT = { themeSource: 'system', shouldUseDarkColors: false, L: [], on(ev, fn) { this.L.push(fn); } };
  w = fakeWin({ x: 0, y: 0, width: 900, height: 600 });
  let r = M.setLook(w, NT, { scheme: 'dark', background: '#08090c', follow: false });
  ok(NT.themeSource === 'dark' && r.osDark === null, 'a dark look: menus / dialogs / title bar dark');
  eq(w.calls.pop(), ['bg', '#08090c'], 'the window\'s colour behind the page is the look\'s');
  M.setLook(w, NT, { scheme: 'light', background: 'not a colour' });
  ok(NT.themeSource === 'light' && !w.calls.some((c) => c[1] === 'not a colour'), 'a light look: light; a strange colour is ignored');
  NT.shouldUseDarkColors = true;
  r = M.setLook(w, NT, { scheme: 'light', background: '#f4efe6', follow: true });
  ok(NT.themeSource === 'system' && r.osDark === true, 'following the computer: the system decides, and says it is dark');

  // ---------- attention: the badge ----------
  const app = { dock: { badge: null, bounces: 0, setBadge(b) { this.badge = b; }, bounce() { this.bounces += 1; } }, count: 0, setBadgeCount(n) { this.count = n; } };
  const nativeImage = { createFromBuffer: () => ({ reps: 1, addRepresentation() { this.reps += 1; } }) };
  const appshell = { pngFromRgba: (b, n) => ({ png: n, bytes: b.length }) };
  M._set({ platform: 'darwin' });
  w = fakeWin({ x: 0, y: 0, width: 900, height: 600 });
  w.focused = true;
  eq(M.attention(w, { app, nativeImage, appshell }), { away: 0 }, 'Mac: focused: no badge');
  w.focused = false;
  M.attention(w, { app, nativeImage, appshell }); M.attention(w, { app, nativeImage, appshell });
  ok(app.dock.badge === '2' && app.dock.bounces === 1, `Mac: the Dock shows 2, bounced once (${app.dock.badge}, ${app.dock.bounces})`);
  M.clearAttention(w, { app });
  ok(app.dock.badge === '' && M._away() === 0, 'Mac: back in Hearth: the badge goes');
  M.attention(w, { app, nativeImage, appshell });
  ok(app.dock.bounces === 2, 'Mac: away again: one more bounce');
  M._set({ platform: 'win32' });
  w = fakeWin({ x: 0, y: 0, width: 900, height: 600 });
  for (let i = 0; i < 11; i += 1) M.attention(w, { app, nativeImage, appshell });
  ok(w.calls.some((c) => c[0] === 'flashFrame' && c[1] === true), 'Windows: the taskbar button flashes');
  eq(w.calls.filter((c) => c[0] === 'overlay').pop(), ['overlay', 'img', '11 finished while you were away'], 'Windows: the number on the icon, said for screen readers');
  M.clearAttention(w, { app });
  ok(w.calls.some((c) => c[0] === 'overlay' && c[1] === null) && w.calls.at(-1)[0] === 'flashFrame' && w.calls.at(-1)[1] === false, 'Windows: back in Hearth: no overlay, no flash');
  w.visible = false; w.focused = true;
  eq(M.attention(w, { app, nativeImage, appshell }).away, 1, 'a hidden window (in the tray) counts as away even if it had the focus');
  M.clearAttention(w, { app });

  // ---------- the badge picture ----------
  eq([1, 9, 10, 99, 0].map(C.badgeText), ['1', '9', '9+', '9+', '1'], 'badge text');
  for (const size of [16, 32]) {
    for (const n of [3, 12]) {
      const px = C.badgeRgba(n, size);
      ok(px.length === size * size * 4, `badge ${n} @${size}: size`);
      ok(px[3] === 0, `badge ${n} @${size}: transparent corner`);
      let white = 0; let ember = 0;
      for (let i = 0; i < px.length; i += 4) { if (px[i + 3] === 255 && px[i] === 255 && px[i + 1] === 255) white += 1; else if (px[i + 3] === 255 && px[i] === 228) ember += 1; }
      ok(white >= (size === 16 ? 8 : 30) && ember > white, `badge ${n} @${size}: white digits on an ember disc (${white} / ${ember})`);
    }
  }

  // ---------- menus ----------
  const clicks = [];
  const act = new Proxy({}, { get: (_t, k) => (...a) => clicks.push([k, ...a]) });
  const mac = C.menuTemplate({ platform: 'darwin', appName: 'Hearth', act });
  const appMenu = mac[0];
  eq(appMenu.label, 'Hearth', 'Mac: the app menu is Hearth\'s');
  const roles = (m) => m.submenu.filter((i) => i.role).map((i) => i.role);
  eq(roles(appMenu), ['about', 'services', 'hide', 'hideOthers', 'unhide', 'quit'], 'Mac: About, Services, Hide, Hide Others, Show All, Quit');
  const settings = appMenu.submenu.find((i) => /^Settings/.test(i.label || ''));
  ok(settings && settings.accelerator === 'Cmd+,' && settings.registerAccelerator !== false, 'Mac: Settings… ⌘, (the menu takes it, as Mac apps do)');
  settings.click(); eq(clicks.pop(), ['settings'], 'Mac: Settings… opens Settings');
  ok(appMenu.submenu.find((i) => i.role === 'quit').label === 'Quit Hearth' && appMenu.submenu.find((i) => i.role === 'hide').label === 'Hide Hearth', 'Mac: named Hearth (not agent-hub)');
  ok(mac.some((m) => m.role === 'editMenu'), 'Mac: an Edit menu (⌘C / ⌘V / ⌘Z work in every text field)');
  ok(mac.some((m) => m.role === 'windowMenu'), 'Mac: a Window menu');
  ok(mac.some((m) => m.label === 'View' && m.submenu.some((i) => i.role === 'togglefullscreen')), 'Mac: View → full screen');
  ok(mac.some((m) => m.role === 'help'), 'Mac: a Help menu');
  eq(C.takenKeys(mac), ['Cmd+,', 'Alt+Cmd+I'], 'Mac: the only keys Hearth\'s menu items take (the rest are shown, the page keeps them)');
  const win = C.menuTemplate({ platform: 'win32', appName: 'Hearth', act });
  eq(win.map((m) => m.label), ['&File', '&Edit', '&View', '&Window', '&Help'], 'Windows: File / Edit / View / Window / Help (Alt shows them, Alt+F… opens one)');
  eq(C.takenKeys(win), ['Ctrl+Shift+I'], 'Windows: the menu takes no key the page uses (only Developer tools, as Electron\'s default menu did)');
  ok(win[1].submenu.filter((i) => i.role).every((i) => i.registerAccelerator === false), 'Windows: Edit shows Ctrl+C / V / Z but the text fields keep them (no double undo)');
  const wf = win[0].submenu;
  ok(wf.find((i) => i.label === 'Settings').accelerator === 'Ctrl+,', 'Windows: File → Settings Ctrl+,');
  ok(wf.find((i) => i.label === 'Close window').accelerator === 'Alt+F4' && wf.find((i) => i.label === 'Exit'), 'Windows: Close window (Alt+F4) and Exit');
  wf.find((i) => i.label === 'Exit').click(); eq(clicks.pop(), ['quit'], 'Windows: Exit quits');
  wf.find((i) => i.label === 'Close window').click(); eq(clicks.pop(), ['close'], 'Windows: Close window closes (the tray setting decides the rest)');
  const zoomIn = win[2].submenu.find((i) => i.label === 'Bigger'); zoomIn.click(); eq(clicks.pop(), ['zoom', 1], 'View → Bigger');
  ok(!JSON.stringify(win).includes('Ctrl+W') && !JSON.stringify(win).includes('Ctrl+R') && !JSON.stringify(win).includes('Ctrl+Q'), 'Windows: no Ctrl+W / Ctrl+R / Ctrl+Q in the menu (Electron\'s default menu closed or reloaded the window)');
  // setupMenu builds it (with a fake Menu)
  let built = null;
  const Menu = { buildFromTemplate: (t) => ({ t }), setApplicationMenu: (m) => { built = m; } };
  M._set({ platform: 'darwin' });
  const fakeApp = { quit: () => clicks.push(['app.quit']), about: null, setAboutPanelOptions(o) { this.about = o; } };
  const mw = fakeWin({ x: 0, y: 0, width: 1, height: 1 }, { show() {}, focus() {}, restore() {}, webContents: { toggleDevTools: () => clicks.push(['devtools']) } });
  const sentMenu = [];
  M.setupMenu({ Menu, app: fakeApp, getWin: () => mw, send: (ch, d) => sentMenu.push([ch, d]), appName: 'Hearth' });
  ok(built?.t?.[0]?.label === 'Hearth' && fakeApp.about?.applicationName === 'Hearth', 'setupMenu: the Mac menu is set, About says Hearth');
  built.t[0].submenu.find((i) => /^Settings/.test(i.label || '')).click();
  eq(sentMenu.pop(), ['native:menu', { action: 'settings', arg: undefined }], 'setupMenu: Settings… is sent to the window');
  built.t[2].submenu.find((i) => i.label === 'Developer tools').click();
  eq(clicks.pop(), ['devtools'], 'setupMenu: Developer tools');

  // ---------- the keys the menus take vs every key line in the app ----------
  // Hearth's own keys: Keys.add lines ("keys: '…'") and main.js HUB_KEYS; ⌘ is Ctrl in Hearth's notation on a Mac
  const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, f)).concat(fs.readdirSync(path.join(ROOT, 'tools')).filter((f) => f.endsWith('.js')).map((f) => path.join(ROOT, 'tools', f)));
  const lines = [];
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/keys: (?:[A-Z]+ \? '[^']*' : )?'([^']+)'/g)) lines.push({ f: path.basename(f), keys: m[1] });
  ok(lines.length > 100, `read the app's key lines (${lines.length})`);
  const norm = (k) => k.replace(/\s+/g, '').toLowerCase();
  // what the Mac menu takes, in Hearth's notation (⌘ = Ctrl): Settings ⌘, (= Hearth's own Ctrl+, Settings: the same
  // action), ⌥⌘I, and the roles' ⌘Q ⌘H ⌥⌘H ⌘M ⌃⌘F, the Edit menu's ⌘Z ⌘X ⌘C ⌘V ⌘A ⇧⌘Z ⌥⇧⌘V
  const macTaken = { 'ctrl+alt+i': 'Developer tools', 'ctrl+q': 'Quit', 'ctrl+h': 'Hide', 'ctrl+alt+h': 'Hide others', 'ctrl+m': 'Minimise' };
  const winTaken = { f11: 'Full screen', 'ctrl+shift+i': 'Developer tools' };
  for (const { f, keys } of lines.filter((l) => l.f !== 'nativefeel.js')) { // (nativefeel.js lists the menus' own keys)
    for (const part of keys.split(/\s*[/·]\s*/).map(norm)) {
      // (round 74) a key the Mac presses with the real Control (WinMac.MAC_REAL_CTRL: the show / hide key ⌃⌥H, 💡 Quick idea ⌃⌥I) is not the menu's ⌥⌘ one
      if (macTaken[part] && !(f === 'keys-ui.js' && require('../winmac.js').MAC_REAL_CTRL.has(part))) ok(false, `Mac menu's ${macTaken[part]} takes ${part} from ${f}`);
      if (winTaken[part]) ok(false, `Windows menu's ${winTaken[part]} takes ${part} from ${f}`);
    }
  }
  const hub = /HUB_KEYS = new Set\(\[([^\]]+)\]/.exec(fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8'))[1];
  ok(!/'[qhmi]'/.test(hub), 'main.js HUB_KEYS: none of Q / H / M / I (the Mac menu\'s)');
  // the global hotkey on a Mac is ⌃⌥H (the real Control key), not ⌥⌘H (Hide Others)
  ok(/MAC \? '⌃⌥H'/.test(fs.readFileSync(path.join(ROOT, 'keys-ui.js'), 'utf8')), 'the global hotkey line says ⌃⌥H on a Mac');

  // ---------- light / dark pairs ----------
  const appui = fs.readFileSync(path.join(ROOT, 'appui.js'), 'utf8');
  const ids = new Set([...appui.matchAll(/^\s+'?([\w-]+)'?: (?:forge2\(|\{ label)/gm)].map((m) => m[1]));
  const lightIds = new Set([...appui.matchAll(/^\s+'?([\w-]+)'?: (?:forge2\('[^']+', 'Light', \{ scheme: 'light'|\{ label: '[^']+', group: '[^']+', scheme: 'light')/gm)].map((m) => m[1]));
  ok(ids.size > 20 && lightIds.size >= 4, `read the looks (${ids.size}, ${lightIds.size} light)`);
  for (const [a, b] of Object.entries(C.PAIRS)) ok(ids.has(a) && ids.has(b) && !lightIds.has(a) && lightIds.has(b), `pair ${a} (dark) → ${b} (light) exist`);
  const T = Object.fromEntries([...ids].map((id) => [id, { scheme: lightIds.has(id) ? 'light' : 'dark' }]));
  eq(C.followPair('forgeheart', T), { dark: 'forgeheart', light: 'forge-light' }, 'Forgeheart ↔ Forge Light');
  eq(C.followPair('forge-light', T), { light: 'forge-light', dark: 'forgeheart' }, 'Forge Light ↔ Forgeheart');
  eq(C.followPair('chrome-light', T), { light: 'chrome-light', dark: 'chrome-forge' }, 'Chrome Light ↔ Chrome Forge');
  eq(C.followPair('molten', T), { dark: 'molten', light: 'forge-light' }, 'a bold dark look without a partner: Forge Light by day');
  eq(C.followPair('parchment', T), { light: 'parchment', dark: 'classic' }, 'Parchment ↔ Classic');
  eq(C.followPair(undefined, T), { dark: 'forgeheart', light: 'forge-light' }, 'no look picked: Forgeheart / Forge Light');
  for (const id of ids) { const pr = C.followPair(id, T); ok(T[pr.dark]?.scheme === 'dark' && T[pr.light]?.scheme === 'light', `${id}: a dark and a light look`); }
  eq([C.followTarget({ dark: 'a', light: 'b' }, true), C.followTarget({ dark: 'a', light: 'b' }, false), C.followTarget(null, true)], ['a', 'b', null], 'which side');

  // ---------- screen scale (also the copy in the Lab's sandbox) ----------
  const html = fs.readFileSync(path.join(ROOT, 'tools', 'three-sandbox.html'), 'utf8');
  const src = /\/\/ <dpr-core>[^\n]*\n([\s\S]*?)\/\/ <\/dpr-core>/.exec(html)?.[1];
  ok(src, 'the sandbox has its <dpr-core>');
  const dprNext = new Function(`${src}; return dprNext;`)(); // eslint-disable-line no-new-func
  const CASES = [[1, 1, 1.5, 1.5, 'full ratio follows 100 → 150 %'], [2, 2, 1, 1, 'Retina → a plain monitor'], [1.25, 1.25, 2, 2, '125 % → Retina'], [2, 3, 1.5, 1.5, 'a cap of 2 on a 3× screen → 1.5×'], [2, 3, 4, 2, 'a cap of 2 stays 2 on a 4× screen'],
    [1, 2, 3, 1, 'a fixed 1 stays 1'], [1, 2, 1, 1, 'a fixed 1 on a 1× screen'], [0, 1, 2, 0, 'no ratio yet: unchanged'], [1.5, 1.5, 0, 1.5, 'a strange new ratio: unchanged']];
  for (const [base, from, to, want, what] of CASES) { eq(C.nextRatio(base, from, to), want, `nextRatio: ${what}`); eq(dprNext(base, from, to), want, `sandbox dprNext: ${what}`); }

  // ---------- the renderer's wiring is there ----------
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(idx.indexOf('src="nativefeel.js"') > idx.indexOf('src="winmac.js"') && idx.indexOf('src="nativefeel.js"') < idx.indexOf('src="ui.js"') && !idx.includes('src="nativefeel-core.js"'), 'index.html: nativefeel.js early (before ui.js); its core loads after the first screen');
  ok(/s\.src = 'nativefeel-core\.js'/.test(fs.readFileSync(path.join(ROOT, 'nativefeel.js'), 'utf8')), 'nativefeel.js loads nativefeel-core.js itself');
  ok(idx.indexOf('href="nativefeel.css"') > idx.indexOf('href="look.css"'), 'index.html: nativefeel.css after look.css (its scrollbars win)');
  ok(/window\.json/.test(fs.readFileSync(path.join(ROOT, 'sync-merge.js'), 'utf8').match(/LOCAL_FILES = new Set\(\[[^\]]*\]/)[0]), 'window.json never syncs (each computer its own)');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`nativefeel-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
