// 💡 Quick idea (round 71, quickidea71), the main-process side: the small always-on-top window (tray › 💡 Quick idea…, or
// its own key, Ctrl+Alt+I by default: appshell.js), the ideas inbox store (kv 'quick-ideas', read and written HERE only,
// one change at a time: quickidea-core.js has its shape) and the voice memos (<Hearth data>/quick-ideas/Idea <date>.wav,
// recorded in the small window while 🎙 is held, written here; nothing is uploaded, nothing is sent anywhere).
// Loaded on first use (main.js keeps one handler line); the window is made when first opened and closed for good after
// 10 minutes hidden. The main window never comes forward: a saved Quest / Project idea is put in its place by the main
// window's page in the background (quickidea.js, asked with 'tray:ideas').
const fs = require('fs');
const path = require('path');
const electron = () => require('electron'); // (required when used: dev/boot-test.js reads this file in plain Node)
const C = require('./quickidea-core');

const APP_DIR = __dirname;
const IDLE_CLOSE_MS = 10 * 60e3;
const TEST = Boolean(process.env.HEARTH_TEST_SAVE_DIR);
let o = null; // { store, dataDir, getWin, send, icon, keyInfo }
let quick = null, idleT = null, chain = Promise.resolve(), quitting = false;

// ---------- the store (kv 'quick-ideas': a read that failed is never "empty", nothing is saved over it) ----------
async function readAsync() {
  const r = await o.store.getKVStatus(C.KEY);
  if (!r || r.state === 'unreadable') throw Error('Your ideas inbox couldn’t be read just now, so nothing was changed. Try again in a moment.');
  return r.state === 'missing' ? C.empty() : C.validate(r.value);
}
// one change at a time: read → change → write (the write is awaited: done means on disk)
function change(fn) {
  inFlight += 1;
  const task = chain.catch(() => {}).then(async () => {
    const s = await readAsync();
    const result = await fn(s);
    await o.store.setKV(C.KEY, s);
    return { s, result };
  });
  task.catch(() => {}).finally(() => { inFlight -= 1; });
  chain = task; return task;
}
const view = (s) => ({ ideas: s.ideas, trash: s.trash, last: s.last, counts: C.counts(s), memoDir: memoDir() });
function changed(s, what) {
  o.send('quickidea:changed', { what, counts: C.counts(s) });
  if (what === 'saved' || what === 'moved' || what === 'restored') { if (C.pending(s).length) o.send('tray:ideas'); } // the page puts it in its place (quietly)
}

// ---------- voice memos ----------
const memoDir = () => path.join(o.dataDir, 'quick-ideas');
function writeMemo(bytes, now = new Date()) {
  const info = C.checkWav(bytes);
  const dir = memoDir(); fs.mkdirSync(dir, { recursive: true });
  let file = path.join(dir, C.memoName(now));
  for (let n = 2; fs.existsSync(file) && n < 100; n++) file = path.join(dir, C.memoName(now, n));
  const tmp = `${file}.part`; fs.writeFileSync(tmp, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)); fs.renameSync(tmp, file);
  return { file, seconds: info.seconds };
}
const isOurs = (file) => { if (typeof file !== 'string' || !path.isAbsolute(file) || !/\.wav$/i.test(file)) return false; const root = path.resolve(memoDir()) + path.sep; return path.resolve(file).toLowerCase().startsWith(root.toLowerCase()); };
// to the computer's Trash / Recycle Bin (never deleted for good); a check run: its own folder; no Trash there: Hearth's data/trash
async function toBin(file) {
  if (!isOurs(file) || !fs.existsSync(file)) return null;
  const moveTo = (base) => { fs.mkdirSync(base, { recursive: true }); const to = path.join(base, `${Date.now().toString(36)}-${path.basename(file)}`); fs.renameSync(file, to); return to; };
  if (TEST) return moveTo(path.join(process.env.HEARTH_TEST_SAVE_DIR, 'quickidea-trash'));
  const check = process.platform === 'win32' ? require('./winpolish').trashCheck(file, { platform: 'win32' })
    : process.platform === 'darwin' ? require('./macpolish').trashCheck(file, { platform: 'darwin' }) : { ok: true };
  if (!check.ok) return moveTo(path.join(o.dataDir, 'trash', 'quick-ideas'));
  try { await require('electron').shell.trashItem(check.path || file); return 'trash'; } catch { return moveTo(path.join(o.dataDir, 'trash', 'quick-ideas')); }
}

// ---------- the ops (the main window: 'quickidea:op'; the small window: 'quickidea:win') ----------
async function projects() {
  try { const r = await o.store.getKVStatus('projects'); return r?.state === 'ok' ? C.recentProjects(r.value) : []; } catch { return []; }
}
async function info() {
  let last = { dest: 'later' }, counts = null;
  try { const s = await readAsync(); last = s.last; counts = C.counts(s); } catch { /* the window still opens: a save then says why */ }
  return { last, counts, projects: await projects(), key: o.keyInfo?.() || null, dests: C.DESTS };
}
async function save({ text, to, wav, seconds } = {}) {
  const t = C.target(to);
  if (t.dest === 'project') { const p = (await projects()).find((x) => x.id === t.projectId); if (!p) throw Error('That project isn’t there any more. Pick another one.'); t.projectName = p.name; }
  if (!C.clean(text) && !wav) throw Error('Type an idea or hold 🎙 to record one first.');
  await readAsync(); // can the inbox be read at all? (before a memo file is written)
  const now = new Date();
  const memo = wav ? writeMemo(wav instanceof Uint8Array ? wav : new Uint8Array(wav), now) : null;
  try {
    const { s, result } = await change((st) => C.add(st, C.make({ text, to: t, memo: memo ? { file: memo.file, seconds: memo.seconds || seconds } : null }, now.getTime())));
    changed(s, 'saved');
    return { ok: true, idea: result, where: C.whereWords(result.to), label: C.label(result.to) };
  } catch (err) { if (memo) { try { fs.unlinkSync(memo.file); } catch { /* left: harmless */ } } throw err; }
}
async function op(a = {}) {
  switch (a.op) {
    case 'list': return view(await readAsync());
    case 'info': return info();
    case 'count': { const s = await readAsync(); return C.counts(s); }
    case 'projects': return projects();
    case 'save': return save(a);
    case 'open': open(); return { ok: true };
    case 'move': { const { s, result } = await change((st) => C.move(st, a.id, a.to)); changed(s, 'moved'); return { ok: true, idea: result }; }
    case 'placed': { const { s, result } = await change((st) => C.setPlaced(st, a.id, a.placed || null)); changed(s, 'placed'); return { ok: true, idea: result }; }
    case 'trash': { const { s, result } = await change((st) => C.trash(st, a.id)); for (const g of result.gone) if (g.memo) await toBin(g.memo.file).catch(() => null); changed(s, 'trashed'); return { ok: true, idea: result.idea }; }
    case 'restore': { const { s, result } = await change((st) => C.restore(st, a.id)); changed(s, 'restored'); return { ok: true, idea: result }; }
    case 'empty-trash': case 'purge': {
      const { s, result } = await change((st) => C.purge(st, Date.now(), a.op === 'empty-trash'));
      let binned = 0; for (const g of result) if (g.memo && await toBin(g.memo.file).catch(() => null)) binned++;
      if (result.length) changed(s, 'purged'); return { ok: true, n: result.length, memos: binned };
    }
    case 'reveal': { const s = await readAsync(); const i = [...s.ideas, ...s.trash].find((x) => x.id === a.id); if (i?.memo && isOurs(i.memo.file)) require('electron').shell.showItemInFolder(i.memo.file); return { ok: Boolean(i?.memo) }; }
    case 'key': return o.keyInfo?.() || null;
    case 'test': return test(a);
    default: throw Error(`unknown op ${a.op}`);
  }
}
const wrap = (fn) => async (...a) => { try { const v = await fn(...a); return v && v.ok === false ? v : { ok: true, value: v }; } catch (err) { return { ok: false, error: err.message }; } };

// ---------- the small window ----------
function place(w) {
  try {
    const d = electron().screen.getDisplayNearestPoint(electron().screen.getCursorScreenPoint()).workArea, [ww, wh] = w.getSize();
    w.setPosition(Math.round(d.x + (d.width - ww) / 2), Math.round(d.y + Math.max(24, d.height * 0.18)));
  } catch { w.center(); }
}
function open() {
  clearTimeout(idleT);
  if (quick && !quick.isDestroyed()) {
    if (!quick.isVisible()) place(quick);
    quick.show(); quick.focus(); quick.webContents.send('quickidea:shown'); return quick;
  }
  const dark = (() => { try { return require('electron').nativeTheme.shouldUseDarkColors; } catch { return true; } })();
  quick = new (electron().BrowserWindow)({
    width: 460, height: 430, minWidth: 380, minHeight: 380, show: false, title: '💡 Quick idea', icon: o.icon, autoHideMenuBar: true,
    alwaysOnTop: true, skipTaskbar: true, minimizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: dark ? '#16120f' : '#f6f0ea',
    ...(process.platform === 'darwin' ? { type: 'panel' } : {}), // a Mac: a floating panel, so Hearth's main window doesn't come forward with it
    webPreferences: { preload: path.join(APP_DIR, 'quickidea-preload.js'), contextIsolation: true, sandbox: true, spellcheck: true, autoplayPolicy: 'no-user-gesture-required' }, // (▶ plays the memo you just made)
  });
  try { quick.setAlwaysOnTop(true, 'floating'); if (process.platform === 'darwin') quick.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch { /* plain always-on-top */ }
  place(quick);
  quick.on('close', (e) => { if (quitting) return; e.preventDefault(); hide(); }); // closing hides it (the words stay in the box for next time)
  quick.on('closed', () => { quick = null; clearTimeout(idleT); });
  quick.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  quick.webContents.on('will-navigate', (e) => e.preventDefault());
  quick.once('ready-to-show', () => { try { quick.show(); quick.focus(); } catch { /* gone */ } });
  quick.loadFile(path.join(APP_DIR, 'quickidea-window.html'));
  return quick;
}
function hide() {
  if (!quick || quick.isDestroyed()) return;
  quick.hide();
  clearTimeout(idleT); idleT = setTimeout(() => { if (quick && !quick.isDestroyed() && !quick.isVisible()) { quitting = true; quick.destroy(); quitting = false; } }, IDLE_CLOSE_MS); idleT.unref?.();
}
async function winOp(e, a = {}) {
  if (!quick || quick.isDestroyed() || e.sender !== quick.webContents) throw Error('Not the quick idea window.');
  if (a.op === 'hide') { hide(); return { ok: true }; }
  if (a.op === 'inbox') { hide(); const w = o.getWin(); if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } o.send('tray:ideas-open'); return { ok: true }; }
  if (a.op === 'info') return info();
  if (a.op === 'save') return save(a);
  throw Error(`unknown op ${a.op}`);
}

// ---------- checks only (a throwaway profile: HEARTH_TEST_SAVE_DIR) ----------
async function test(a) {
  if (!TEST) throw Error('Only in a check run.');
  const w = o.getWin();
  if (a.what === 'state') return { open: Boolean(quick && !quick.isDestroyed()), visible: Boolean(quick && !quick.isDestroyed() && quick.isVisible()), onTop: Boolean(quick && !quick.isDestroyed() && quick.isAlwaysOnTop()), mainFocused: Boolean(w && !w.isDestroyed() && w.isFocused()), mainVisible: Boolean(w && !w.isDestroyed() && w.isVisible()), memoDir: memoDir(), key: o.keyInfo?.() || null, tray: (o.trayMenu?.()?.items || []).map((i) => i.label).filter(Boolean) };
  if (a.what === 'eval') { if (!quick || quick.isDestroyed()) throw Error('The quick idea window isn’t open.'); return quick.webContents.executeJavaScript(String(a.js), true); }
  if (a.what === 'tray') { const it = (o.trayMenu?.()?.items || []).find((i) => i.label === '💡 Quick idea…'); if (!it) throw Error('No 💡 Quick idea… in the tray menu.'); it.click(); return { ok: true }; } // the tray's item, clicked
  if (a.what === 'hide-main') { if (w && !w.isDestroyed()) { w.webContents.setBackgroundThrottling(false); w.hide(); } return { ok: true }; } // (the check's own timers keep their pace while hidden)
  if (a.what === 'show-main') { if (w && !w.isDestroyed()) { w.show(); w.focus(); } return { ok: true }; }
  if (a.what === 'shot') { if (!quick || quick.isDestroyed()) throw Error('The quick idea window isn’t open.'); const img = await quick.webContents.capturePage(); fs.writeFileSync(String(a.file), img.toPNG()); return { ok: true, size: img.getSize() }; }
  if (a.what === 'destroy') { if (quick && !quick.isDestroyed()) { quitting = true; quick.destroy(); quitting = false; } return { ok: true }; }
  throw Error(`unknown test ${a.what}`);
}

// (round 77, storeack77) the other computer's ideas arrived: a change on its way lands first (sync's guard merges it), and
// sync is told (StoreAck: each change reads the file again, nothing older is held), so an idea deleted or moved here
// right after it arrived stays that way
let inFlight = 0;
function init(opts) {
  o = opts;
  require('./storeackmain').hold(C.KEY, { name: 'Quick ideas', pending: () => inFlight > 0, flush: () => chain.catch(() => {}),
    read: () => readAsync().catch(() => null), apply: (s) => { if (s) changed(s, 'synced'); } }); // an open inbox redraws
}
// main.js: lazyIpc('quickideamain.js', …): loaded on the first call from a window, or by the tray item / the key
function register(ipcMain, opts) {
  init(opts);
  ipcMain.handle('quickidea:op', (_e, a) => wrap(op)(a)); // the main window: the inbox, Move to…, Delete, putting ideas in place
  ipcMain.handle('quickidea:win', wrap(winOp)); // the small window: info, save, hide, open the inbox
  try { electron().app.on('before-quit', () => { quitting = true; }); } catch { /* plain Node (dev/boot-test.js) */ }
}
module.exports = { init, register, op: wrap((a) => op(a)), open, hide, _core: C, _isOurs: (f) => isOurs(f) };
