// Background calm, main side (round 16, bgperf). One place that knows whether anybody is looking at Hearth and how
// the computer is doing, so background work can slow down when nobody is (and never runs while the computer sleeps):
//   state: { hidden (the hub window minimized / hidden to the tray), battery (on battery power), asleep (the computer
//            suspended or the screen locked), since (when the state last changed) } → subscribe(fn) gets every change
//   a steady text cursor: the blinking cursor in the chat box redraws the whole window twice a second, forever (the
//   GPU process spent 230 ms of every second on it at idle in the test copy). After CALM_MS without a key or a click
//   the cursor stops blinking (still shown, just steady: CSS caret-animation); the next key or click brings the
//   blink back. Nothing changes while you type.
// Required from main.js: register(getWin) once, attach(win) when the hub window exists.
const { app, powerMonitor } = require('electron');

const CALM_MS = Number(process.env.HEARTH_CALM_MS) || 12000;
const CALM_CSS = '*, *::before, *::after { caret-animation: manual !important; }';
let getWin = () => null;
const state = { hidden: false, battery: false, asleep: false, since: Date.now() };
const subs = new Set();

function set(patch) {
  let changed = false;
  for (const [k, v] of Object.entries(patch)) if (state[k] !== v) { state[k] = v; changed = true; }
  if (!changed) return;
  state.since = Date.now();
  for (const fn of subs) { try { fn({ ...state }); } catch (err) { console.warn('bgmain', err.message); } }
}
function subscribe(fn) { subs.add(fn); try { fn({ ...state }); } catch { /* the first call is a courtesy */ } return () => subs.delete(fn); }

// ---------- the steady cursor ----------
let lastInput = Date.now(); let calmKey = null; let calmT = null; let calmWin = null;
function armCalm() {
  if (calmT) return;
  const wait = Math.max(200, CALM_MS - (Date.now() - lastInput));
  calmT = setTimeout(() => {
    calmT = null;
    if (Date.now() - lastInput < CALM_MS) { armCalm(); return; }
    const wc = calmWin && !calmWin.isDestroyed() ? calmWin.webContents : null;
    if (!wc || calmKey) return;
    calmKey = 'pending';
    wc.insertCSS(CALM_CSS).then((k) => { if (calmKey === 'pending') calmKey = k; else wc.removeInsertedCSS(k).catch(() => {}); }).catch(() => { calmKey = null; });
  }, wait);
}
function onInput() {
  lastInput = Date.now();
  if (calmKey) {
    const k = calmKey; calmKey = null;
    const wc = calmWin && !calmWin.isDestroyed() ? calmWin.webContents : null;
    if (wc && k !== 'pending') wc.removeInsertedCSS(k).catch(() => {});
  }
  armCalm();
}

function attach(win) {
  calmWin = win;
  const vis = () => { if (!win.isDestroyed()) set({ hidden: win.isMinimized() || !win.isVisible() }); };
  for (const ev of ['minimize', 'restore', 'hide', 'show']) win.on(ev, vis);
  const wc = win.webContents;
  // keys (before-input-event) and clicks / wheel (input-event): a timestamp, no timer per event
  wc.on('before-input-event', (_e, input) => { if (input.type === 'keyDown') onInput(); });
  wc.on('input-event', (_e, input) => { if (input.type === 'mouseDown' || input.type === 'mouseWheel' || input.type === 'keyDown') onInput(); });
  wc.on('did-finish-load', () => { calmKey = null; onInput(); }); // a reload starts without the inserted rule
  armCalm();
}

function register(gw) {
  getWin = gw;
  app.whenReady().then(() => {
    try { set({ battery: powerMonitor.isOnBatteryPower?.() ?? powerMonitor.onBatteryPower ?? false }); } catch { /* unknown: on power */ }
    powerMonitor.on('on-battery', () => set({ battery: true }));
    powerMonitor.on('on-ac', () => set({ battery: false }));
    powerMonitor.on('suspend', () => set({ asleep: true }));
    powerMonitor.on('resume', () => set({ asleep: false }));
    powerMonitor.on('lock-screen', () => set({ asleep: true }));
    powerMonitor.on('unlock-screen', () => set({ asleep: false }));
  });
}

module.exports = { register, attach, subscribe, state: () => ({ ...state }), CALM_MS, _test: { onInput, calm: () => calmKey } };
