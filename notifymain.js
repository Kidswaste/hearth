// (round 44, notify) Hearth's desktop notifications, the main side: Electron's own Notification (Notification Center on
// the Mac, Windows' toasts), so they carry Hearth's name and icon, follow Focus / Do Not Disturb (the OS holds them;
// nothing here bypasses it: no urgency, no "never time out") and route a click back to the right window and chat.
//   notify:send (ev)   the window decided the switches (notify.js + notify-core.js); here: is Hearth in front (then
//                      nothing), the words (NotifyCore.compose), one per group (a newer one replaces it) and a burst
//                      summed up (NotifyCore.grouper), then shown. → { shown, why?, group }
//   notify:seen (group)  you looked at that chat in Hearth: its notification leaves the OS's centre
//   a click / an action button: "Show in Finder / Explorer" reveals the file without bringing Hearth up; anything else
//   restores + focuses the main window (the Mac: app.focus steal, so it comes in front of the app you were in) and
//   tells the window where to go (notify:go → notify.js: the chat, the card, the renders, the update). A permission's
//   "Allow…" only opens its card; approving stays a click on the card itself.
// Windows: Electron needs the app id (main.js: app.setAppUserModelId('Hearth')) AND a Start-menu shortcut carrying it
// for a toast to show Hearth's name / icon and come back on a click; the first notification makes sure that shortcut
// exists (only the Start menu one, never the desktop) or gives the existing one the id. The Mac shows the buttons
// (actions); Windows runs the first action on a click (Electron's action buttons there depend on its version).
const path = require('path');
const fs = require('fs');
const C = require('./notify-core');

const o = { platform: process.platform };
let deps = null;
const live = new Map(); // group → Notification (kept referenced: a collected one loses its click)
let groups = C.grouper();
const test = { stub: false, away: null, log: [] }; // (dev checks) a recorder instead of the OS, Hearth "in the background"

function focused() {
  if (test.away != null) return !test.away;
  const win = deps?.getWin?.();
  try { return Boolean(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused()); } catch { return false; }
}

// ---------- Windows: the Start-menu shortcut with Hearth's app id ----------
let aumidDone = false;
function ensureAumid() {
  if (aumidDone || o.platform !== 'win32' || test.stub) return;
  aumidDone = true;
  const { shell, app, appshell } = deps;
  try {
    const lnk = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${appshell.APP_NAME}.lnk`);
    if (fs.existsSync(lnk)) {
      let cur = null; try { cur = shell.readShortcutLink(lnk); } catch { /* unreadable: leave it */ }
      if (cur && cur.appUserModelId !== appshell.APP_NAME) shell.writeShortcutLink(lnk, 'update', { appUserModelId: appshell.APP_NAME });
    } else {
      const appDir = app.getAppPath();
      shell.writeShortcutLink(lnk, 'create', { target: process.execPath, args: `"${appDir}" --restart`, cwd: appDir, icon: appshell.ICON_ICO, iconIndex: 0, appUserModelId: appshell.APP_NAME, description: `Start ${appshell.APP_NAME} (or restart it if it is already open)` });
    }
  } catch (err) { console.warn('notify: start menu shortcut', err.message); }
}

// ---------- a click ----------
function bringUp() {
  const win = deps.getWin();
  if (!win || win.isDestroyed()) return null;
  try {
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    if (o.platform === 'darwin') deps.app.focus?.({ steal: true });
  } catch { /* gone */ }
  return win;
}
function run(note, i) {
  const a = note.actions?.[i] || note.actions?.[0] || null;
  const go = a ? a.go : null;
  if (test.stub) test.log.push({ ran: { group: note.group, action: a?.text || null, go } });
  live.delete(note.group); groups.closed(note.group);
  if (go?.file) { if (test.stub) return go; try { deps.shell.showItemInFolder(go.file); } catch (err) { console.warn('notify: reveal', err.message); } return go; }
  if (!bringUp()) return go;
  deps.send('notify:go', { go, group: note.group, type: note.type });
  return go;
}

// ---------- showing / closing ----------
class Recorder { // (dev checks) stands in for Electron's Notification: records, and can be "clicked"
  constructor(opts) { this.opts = opts; this.handlers = {}; this.closed = false; }
  on(ev, fn) { this.handlers[ev] = fn; return this; }
  show() { test.log.push({ shown: { title: this.opts.title, body: this.opts.body, actions: (this.opts.actions || []).map((a) => a.text), silent: this.opts.silent, urgency: this.opts.urgency || null } }); }
  close() { this.closed = true; test.log.push({ closed: this.group }); }
  static isSupported() { return true; }
}
function close(group) {
  const n = live.get(group);
  live.delete(group);
  if (n) { try { n.close(); } catch { /* already gone */ } }
}
function show(note) {
  const N = test.stub ? Recorder : deps.Notification;
  if (!N || (N.isSupported && !N.isSupported())) return false;
  ensureAumid();
  const opts = { title: note.title, body: note.body || '', silent: false };
  // the buttons: the Mac shows them (the first is also what a click on the notification does); elsewhere Electron
  // shows them where it can and a click does the first
  if (note.actions?.length) opts.actions = note.actions.map((a) => ({ type: 'button', text: a.text }));
  if (o.platform !== 'darwin') { try { opts.icon = deps.appshell.ensureIcon(); } catch { /* the app's own */ } }
  let n;
  try { n = new N(opts); } catch (err) { console.warn('notify:', err.message); return false; }
  n.group = note.group;
  n.on('click', () => run(note, 0));
  n.on('action', (_e, i) => run(note, Number(i) || 0));
  n.on('close', () => { if (live.get(note.group) === n) { live.delete(note.group); groups.closed(note.group); } });
  n.on('failed', (_e, err) => console.warn('notify: failed', err));
  live.set(note.group, n);
  try { n.show(); } catch (err) { console.warn('notify:', err.message); return false; }
  return true;
}
function send(ev = {}) {
  if (focused() && !ev.force) return { shown: false, why: 'focused' };
  const note = C.compose(ev, { platform: o.platform });
  const ops = groups.add(note, Date.now());
  let shown = false; let as = note;
  for (const op of ops) {
    if (op.op === 'close') close(op.group);
    else { shown = show(op.note) || shown; as = op.note; }
  }
  return { shown, group: as.group, summary: as.type === 'summary' };
}

function register(ipcMain, d) {
  deps = d;
  ipcMain.handle('notify:send', (_e, ev) => send(ev || {}));
  ipcMain.handle('notify:seen', (_e, group) => { for (const op of groups.seen(String(group || ''))) close(op.group); return true; });
  // (dev checks) a recorder instead of the OS; Hearth "away"; what was shown; click one / press its button
  ipcMain.handle('notify:test', (_e, a = {}) => {
    if (a.stub != null) { test.stub = Boolean(a.stub); live.clear(); groups = C.grouper(a.burst ? { burst: a.burst, windowMs: a.windowMs || 12000 } : {}); }
    if ('away' in a) test.away = a.away;
    if (a.clear) test.log.length = 0;
    if (a.click) {
      const n = live.get(a.click.group);
      if (!n) return { ok: false, why: 'no such notification', open: [...live.keys()] };
      const h = a.click.action != null ? n.handlers.action : n.handlers.click;
      h?.({}, a.click.action);
      return { ok: true };
    }
    return { log: test.log.slice(-60), open: [...live.keys()], stub: test.stub };
  });
  return { send, seen: (g) => groups.seen(g).forEach((op) => close(op.group)) };
}

module.exports = { register, awayForChecks: () => test.away === true, _test: { send, focused, o, test, reset: () => { live.clear(); groups = C.grouper(); test.log.length = 0; }, setDeps: (d) => { deps = d; } } };
