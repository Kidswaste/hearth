// (Nov 9, labplayer) The Lab player, Hearth's side: the Lab preview run in its own Electron app (labplayer/main.js),
// with its own graphics process, laid exactly over the Lab's preview area. Opt-in (the Lab dock's PLAYER switch); the
// Lab drives it as it drives the Stage window (tools/three.js sandboxFrame target 'player'), through here.
//   labplayer:open { query, fresh } → the page loaded (the app started the first time, again when fresh)
//   labplayer:to msg → the page · labplayer:rect { x, y, width, height, visible } (CSS px in the Lab's window) → placed
//   labplayer:close → the app goes · events: labplayer:from msg, labplayer:closed (it ended: the Lab takes the preview back)
// The window follows Hearth's: moved, resized, minimised (hidden), focused again (kept just above it, moveAbove).
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const cp = require('child_process');
const { pathToFileURL } = require('url');

const SANDBOX = pathToFileURL(path.join(__dirname, 'tools', 'three-sandbox.html')).href;
// the graphics path Hearth runs with (gpu52's choices), given to the player so both draw the same way
const SWITCHES = ['use-angle', 'use-gl', 'enable-features', 'disable-features', 'force_high_performance_gpu', 'force_low_power_gpu', 'ignore-gpu-blocklist'];

let child = null; let ready = null; let owner = null; let ownerWin = null;
let rect = null; let visible = false; let lastBounds = null; let lastWhy = 'not placed yet';
const toOwner = (ch, msg) => { try { if (owner && !owner.isDestroyed()) owner.send(ch, msg); } catch { /* window gone */ } };
const post = (m) => { try { child?.connected && child.send(m); } catch { /* ended */ } };

function start() {
  if (child) return ready;
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.HEARTH_LP_SWITCHES = JSON.stringify(SWITCHES.filter((n) => app.commandLine.hasSwitch(n)).map((n) => [n, app.commandLine.getSwitchValue(n)]));
  try { env.HEARTH_LP_DATA = require('./store').DATA_DIR; } catch { /* the default: data/ next to the app */ } // (the player serves three.js from Hearth's kept copies)
  const c = cp.spawn(process.execPath, [path.join(__dirname, 'labplayer')], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'], serialization: 'advanced', env, windowsHide: true });
  child = c;
  c.stderr?.on('data', () => {}); // (Chromium's own chatter: read so the pipe never fills)
  ready = new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 15000);
    c.on('message', (m) => {
      if (m?.op === 'ready') { clearTimeout(t); resolve(true); place(); return; }
      if (m?.op === 'from') { toOwner('labplayer:from', m.msg); return; }
      if (m?.op === 'gone') { toOwner('labplayer:closed', { why: m.why }); }
    });
    c.on('exit', () => { clearTimeout(t); resolve(false); if (child === c) { child = null; ready = null; toOwner('labplayer:closed', { why: 'exit' }); } });
    c.on('error', () => { clearTimeout(t); resolve(false); });
  });
  return ready;
}
// (asked to stop: no labplayer:closed for this one, the Lab knows)
function stop() { const c = child; child = null; ready = null; if (!c) return; try { c.send({ op: 'quit' }); } catch { /* gone */ } setTimeout(() => { try { if (c.exitCode == null) c.kill(); } catch { /* gone */ } }, 1500); }

// where the player's window goes: the preview's rectangle in screen coordinates (DIP), just above Hearth's window
function place() {
  if (!child) return;
  const w = ownerWin;
  const why = !w || w.isDestroyed() ? 'no window' : !visible ? 'the Lab says hidden' : !rect ? 'no place yet' : w.isMinimized() ? 'minimised' : !w.isVisible() ? 'window hidden' : '';
  lastWhy = why;
  if (why) { post({ op: 'hide' }); return; }
  const cb = w.getContentBounds();
  let zf = 1; try { zf = owner.getZoomFactor(); } catch { /* 1 */ }
  const bounds = { x: cb.x + rect.x * zf, y: cb.y + rect.y * zf, width: rect.width * zf, height: rect.height * zf };
  let above = null; try { above = w.getMediaSourceId(); } catch { /* none */ }
  lastBounds = bounds;
  post({ op: 'place', bounds, above });
}
let placeT = 0;
const placeSoon = () => { clearTimeout(placeT); placeT = setTimeout(place, 0); };
function follow(w) {
  if (ownerWin === w) return;
  ownerWin = w;
  for (const ev of ['move', 'resize', 'restore', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen', 'show', 'focus']) w.on(ev, placeSoon);
  w.on('minimize', () => post({ op: 'hide' }));
  w.on('hide', () => post({ op: 'hide' }));
  w.on('closed', () => { if (ownerWin === w) { ownerWin = null; stop(); } });
}

function register() {
  ipcMain.handle('labplayer:open', async (e, { query, fresh } = {}) => {
    owner = e.sender; follow(BrowserWindow.fromWebContents(e.sender));
    if (fresh) stop();
    if (!(await start())) return false;
    post({ op: 'load', url: `${SANDBOX}${query || ''}` });
    placeSoon();
    return true;
  });
  ipcMain.on('labplayer:to', (_e, msg) => post({ op: 'to', msg }));
  ipcMain.on('labplayer:rect', (e, r) => {
    owner = e.sender; follow(BrowserWindow.fromWebContents(e.sender));
    visible = Boolean(r?.visible); rect = visible ? { x: r.x, y: r.y, width: r.width, height: r.height } : rect;
    placeSoon();
  });
  ipcMain.handle('labplayer:close', () => { visible = false; stop(); return true; });
  ipcMain.handle('labplayer:state', () => ({ running: Boolean(child), pid: child?.pid || null, visible, rect, bounds: lastBounds, why: lastWhy, owner: ownerWin && !ownerWin.isDestroyed() ? ownerWin.getBounds() : null }));
  app.on('before-quit', stop);
}

module.exports = { register, _test: { state: () => ({ running: Boolean(child), pid: child?.pid || null, visible, rect }) } };
