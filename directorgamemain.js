// ▶ Play-test (round 53, directorgame), the main side: a director's short input script played into the ▶ Play window
// and nowhere else, timed here (the hub window can sit behind the full-screen game, where its timers are slowed), plus
// ONE small picture of the game when asked. Loaded on first use (main.js lazyIpc); the hub side is tools/directorgame.js.
//   game:script { ops: [{ at, do: down|up|move|click|mark, key, dx, dy, x, y, i }] } → { ok, why, ms }
//   game:script-stop → true          (keys still held are let go)
//   game:shot { width } → { data, mime, w, h } | { error }
// Only the hub window may ask; input only reaches the game window that gamemodemain.js opened (its hearth-game://<token>
// page), never Hearth's own windows; the keys that leave the game (Esc, ⌘ / Win, Ctrl+W, Alt+F4) are never sent.
const { BrowserWindow } = require('electron');

let ctx = null;
let run = null; // { finish(why) }
const MAX_MS = 95000;
const MODS = { Shift: 'shift', Control: 'control', Alt: 'alt' };
const SAFE_KEY = /^([A-Z0-9]|F([1-9]|10|12)|Space|Enter|Tab|Backspace|Up|Down|Left|Right|Shift|Control|Alt)$/;

// the ▶ Play window (gamemodemain.js), found by its own address; null when no game plays
function gameWin() {
  let gm;
  try { gm = require('./gamemodemain'); } catch { return null; }
  const i = gm.info?.();
  if (!i?.playing || !i.url) return null;
  const origin = String(i.url).split('/').slice(0, 3).join('/');
  const hub = ctx?.getWin?.();
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w !== hub && w.webContents.getURL().startsWith(`${origin}/`)) || null;
}

function script(_e, { ops = [] } = {}) {
  const win = gameWin();
  if (!win) return { ok: false, why: 'not playing' };
  if (!Array.isArray(ops) || !ops.length) return { ok: false, why: 'no ops' };
  for (const op of ops) {
    if (!(op.at >= 0 && op.at <= MAX_MS)) return { ok: false, why: 'an op past 95 s' };
    if ((op.do === 'down' || op.do === 'up') && !SAFE_KEY.test(String(op.key))) return { ok: false, why: `key ${op.key} is not sent` };
  }
  run?.finish('replaced');
  const wc = win.webContents;
  const held = new Set();
  const [w, h] = win.getContentSize();
  const cur = { x: Math.round(w / 2), y: Math.round(h / 2) };
  const mods = () => [...held].filter((k) => MODS[k]).map((k) => MODS[k]);
  const send = (ev) => { if (!win.isDestroyed()) wc.sendInputEvent(ev); };
  const apply = (op) => {
    if (win.isDestroyed()) return;
    if (op.do === 'down') {
      held.add(op.key);
      send({ type: 'keyDown', keyCode: op.key, modifiers: mods() });
      if (op.key.length === 1) send({ type: 'char', keyCode: op.key, modifiers: mods() });
    } else if (op.do === 'up') {
      held.delete(op.key);
      send({ type: 'keyUp', keyCode: op.key, modifiers: mods() });
    } else if (op.do === 'move') {
      cur.x = Math.max(0, Math.min(w - 1, cur.x + (op.dx || 0))); cur.y = Math.max(0, Math.min(h - 1, cur.y + (op.dy || 0)));
      send({ type: 'mouseMove', x: cur.x, y: cur.y, movementX: op.dx || 0, movementY: op.dy || 0 });
    } else if (op.do === 'click') {
      cur.x = Math.round((op.x ?? 0.5) * (w - 1)); cur.y = Math.round((op.y ?? 0.5) * (h - 1));
      for (const type of ['mouseDown', 'mouseUp']) send({ type, x: cur.x, y: cur.y, button: 'left', clickCount: 1 });
    } else if (op.do === 'mark') {
      wc.executeJavaScript(`window.__dgPlay && window.__dgPlay.mark(${Number(op.i) || 0})`, true).catch(() => {});
    }
  };
  return new Promise((resolve) => {
    const t0 = Date.now();
    const timers = [];
    let done = false;
    const finish = (why) => {
      if (done) return;
      done = true;
      for (const t of timers) clearTimeout(t);
      for (const k of held) send({ type: 'keyUp', keyCode: k });
      held.clear();
      win.removeListener('closed', closed);
      if (run?.finish === finish) run = null;
      resolve({ ok: why === 'done', why, ms: Date.now() - t0 });
    };
    const closed = () => finish('left');
    win.once('closed', closed);
    run = { finish };
    const end = Math.max(...ops.map((o) => o.at));
    for (const op of ops) timers.push(setTimeout(() => apply(op), op.at));
    timers.push(setTimeout(() => finish('done'), end + 40));
  });
}

async function shot(_e, { width = 384 } = {}) {
  const win = gameWin();
  if (!win) return { error: 'not playing' };
  const img = await win.webContents.capturePage();
  if (img.isEmpty()) return { error: 'the game window drew nothing yet' };
  const small = img.resize({ width: Math.max(160, Math.min(768, Number(width) || 384)), quality: 'good' });
  const { width: w, height: h } = small.getSize();
  return { data: small.toJPEG(72).toString('base64'), mime: 'image/jpeg', w, h };
}

function register(ipcMain, c) {
  ctx = c;
  const hub = (fn) => (e, ...a) => { const w = ctx.getWin(); if (!w || w.isDestroyed() || e.sender !== w.webContents) throw new Error('not from Hearth'); return fn(e, ...a); };
  ipcMain.handle('game:script', hub(script));
  ipcMain.handle('game:script-stop', hub(() => { run?.finish('stopped'); return true; }));
  ipcMain.handle('game:shot', hub(shot));
}
module.exports = { register, _test: { gameWin, SAFE_KEY } };
