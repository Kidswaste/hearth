// (round 153c, labwin153) The Lab window: one Lab scene in its own lean window (lab-window.html: the Lab's code only,
// no chats, boards, usage scanners or background features), its own renderer process, drawing at full speed while
// another app is in front (backgroundThrottling off for this window only; Lite mode's 30 fps cap is the Lab's own).
//
//   - Same security model as Hearth's window: contextIsolation, the same preload bridge (preload.js), no node
//     integration, no <webview>, the page's own CSP; links open in the browser, nothing navigates the window.
//   - One scene, one editor: the main window releases its Lab for that scene (tools/three-labwin.js) and shows
//     "Open in Lab window ↗" until this window closes; saves of the Lab's scenes file are merged here so neither window
//     writes the other's scene back (the Lab window owns its scene, the main window every other one).
//   - The AI: a director chat stays in the main window; its Lab calls for this scene are relayed here (labwin:call) and
//     answered by this window's Lab. The Lab window's slim drawer sends what you type to that chat (labwin:ask).
//   - Hearth's window goes quiet meanwhile: its Lab released, its renderer throttled, optionally hidden ("Hide Hearth
//     while the Lab window is open"); closing the Lab window brings it back on that scene.
const path = require('path');
const crypto = require('crypto');

const SCENES = 'three-sketches';
// the Lab's stores keyed by scene id ({ [sceneId]: … }): merged the same way as the scenes list
const KEYED = new Set(['three-lab-extras', 'three-thumbs', 'three-notes', 'three-refs']);
const merges = (name) => name === SCENES || KEYED.has(name);
let labWin = null;
let scene = null; // the scene id the Lab window owns
let hidMain = false;
let getMain = () => null;
let store = null;
const pending = new Map(); // call id → resolve
const stats = { opened: 0, calls: 0, merges: 0, keptForLab: 0, keptForMain: 0 };

const alive = (w) => Boolean(w && !w.isDestroyed() && !w.webContents.isDestroyed());
const main = () => { const w = getMain(); return alive(w) ? w : null; };
const isLab = (wc) => Boolean(alive(labWin) && wc && wc.id === labWin.webContents.id);
const toMain = (ch, data) => { try { main()?.webContents.send(ch, data); } catch { /* going away */ } };
const toLab = (ch, data) => { try { if (alive(labWin)) labWin.webContents.send(ch, data); } catch { /* going away */ } };

// ---------- one scene, one editor: the scenes file merged by who owns which scene ----------
// A save from the Lab window keeps only its own scene from what it sends (every other scene as it is on disk: the
// main window may have changed one backstage meanwhile); a save from the main window keeps the Lab window's scene as
// it is on disk (the main window's copy is the one from before the Lab window opened). Saves are merged one at a time.
let chain = Promise.resolve();
function mergeScenes(sender, name, value) {
  if (!merges(name) || !scene || !alive(labWin) || !store) return Promise.resolve(value);
  const fromLab = isLab(sender);
  if (KEYED.has(name)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return Promise.resolve(value);
    const job = chain.then(async () => {
      let disk = null;
      try { disk = await store.getKVOff(name, null); } catch { disk = null; }
      if (!disk || typeof disk !== 'object' || Array.isArray(disk)) return value;
      stats.merges += 1;
      const out = fromLab ? { ...disk } : { ...value };
      const src = fromLab ? value : disk;
      if (scene in src) out[scene] = src[scene]; else delete out[scene];
      return out;
    });
    chain = job.catch(() => {});
    return job;
  }
  if (!Array.isArray(value)) return Promise.resolve(value);
  const job = chain.then(async () => {
    let disk = null;
    try { disk = await store.getKVOff(SCENES, null); } catch { disk = null; }
    if (!Array.isArray(disk)) return value;
    stats.merges += 1;
    const onDisk = new Map(disk.filter((d) => d?.id).map((d) => [d.id, d]));
    if (fromLab) {
      const mine = value.find((x) => x?.id === scene);
      if (!mine) return disk; // (the Lab window never deletes scenes: what it sends without its scene changes nothing)
      stats.keptForMain += 1;
      return onDisk.has(scene) ? disk.map((d) => (d?.id === scene ? mine : d)) : [...disk, mine];
    }
    const theirs = onDisk.get(scene);
    if (!theirs) return value;
    stats.keptForLab += 1;
    return value.some((x) => x?.id === scene) ? value.map((x) => (x?.id === scene ? theirs : x)) : [...value, theirs];
  });
  chain = job.catch(() => {});
  return job;
}

// ---------- the window ----------
function open({ scene: id, hideMain = false, bounds = null } = {}, ctx) {
  if (!/^[\w-]{1,80}$/.test(String(id || ''))) return { ok: false, error: 'No scene to open.' };
  const { BrowserWindow, screen } = require('electron');
  if (alive(labWin)) {
    if (scene !== id) return { ok: false, error: 'The Lab window already has another scene open. Close it first.', scene };
    if (labWin.isMinimized()) labWin.restore();
    labWin.show(); labWin.focus();
    return { ok: true, scene, again: true };
  }
  scene = id;
  stats.opened += 1;
  const m = main();
  const area = m ? screen.getDisplayMatching(m.getBounds()).workArea : screen.getPrimaryDisplay().workArea;
  const b = bounds && bounds.width > 300 ? bounds : { width: Math.round(area.width * 0.86), height: Math.round(area.height * 0.88) };
  labWin = new BrowserWindow({
    ...b, minWidth: 640, minHeight: 420, show: false, title: 'Hearth Lab', autoHideMenuBar: true,
    backgroundColor: '#0b0b0c', icon: ctx.icon?.() || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, spellcheck: false,
      backgroundThrottling: false, // full speed while another app is in front (the Lab's Auto / Lite caps still apply)
      autoplayPolicy: 'no-user-gesture-required', // the scene's song plays inside its sandbox frame
      additionalArguments: [`--hearth-labwin=${id}`, `--hearth-frame=system`],
    },
  });
  const w = labWin;
  w.__prefs = { contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false, backgroundThrottling: false };
  w.loadFile(path.join(__dirname, 'lab-window.html'), { query: { scene: id } });
  w.once('ready-to-show', () => { if (!w.isDestroyed()) { w.show(); w.focus(); } });
  setTimeout(() => { if (!w.isDestroyed() && !w.isVisible()) w.show(); }, 1500);
  w.webContents.setWindowOpenHandler(({ url }) => { ctx.openExternal?.(url); return { action: 'deny' }; });
  w.webContents.on('will-navigate', (e, url) => { e.preventDefault(); ctx.openExternal?.(url); });
  // the Lab's keys while its preview frame has the keyboard: Ctrl/⌘+; (the command bar) and Ctrl/⌘+. (Again)
  w.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !(input.control || (process.platform === 'darwin' && input.meta)) || input.alt) return;
    if (input.key === ';' || input.code === 'Semicolon' || input.code === 'Period') { e.preventDefault(); toLab('shortcut', { key: input.code === 'Period' ? '.' : ';', shift: input.shift }); }
  });
  w.webContents.on('render-process-gone', () => dropCalls('crashed'));
  w.on('closed', () => {
    if (labWin === w) labWin = null;
    const was = scene; scene = null;
    dropCalls('closed');
    const mw = main();
    if (mw) {
      try { mw.webContents.setBackgroundThrottling(true); } catch { /* closing */ }
      if (hidMain) { hidMain = false; if (mw.isMinimized()) mw.restore(); mw.show(); }
      mw.focus();
    }
    toMain('labwin:closed', { scene: was });
  });
  // Hearth's window goes quiet: it rests whenever it isn't seen (its default), and is hidden when asked
  if (m) {
    try { m.webContents.setBackgroundThrottling(true); } catch { /* fine */ }
    if (hideMain) { hidMain = true; m.hide(); } else hidMain = false;
  }
  return { ok: true, scene };
}

function dropCalls(why) {
  for (const [, resolve] of pending) resolve({ ok: false, error: `The Lab window ${why} while this ran: call it again (the scene is back in Hearth's Lab).` });
  pending.clear();
}

// a director call from the main window (its chat) for the scene this window owns: answered by this window's Lab
function call(tool, args, ctx) {
  if (!alive(labWin)) return Promise.resolve(null); // null: the main window handles it itself
  stats.calls += 1;
  const id = crypto.randomUUID();
  return new Promise((resolve) => {
    const slow = /sequence|render|play/.test(String(tool)) ? 45 * 60000 : 70000;
    const t = setTimeout(() => { if (pending.delete(id)) resolve({ ok: false, error: `The Lab window did not answer ${tool} within ${Math.round(slow / 1000)} s.` }); }, slow);
    pending.set(id, (r) => { clearTimeout(t); resolve(r); });
    toLab('labwin:call', { id, tool, args, ctx });
  });
}

function state() {
  const m = main();
  return {
    open: alive(labWin), scene, hidMain, stats: { ...stats },
    visible: alive(labWin) ? labWin.isVisible() : false, focused: alive(labWin) ? labWin.isFocused() : false,
    mainVisible: m ? m.isVisible() : false, mainThrottled: m ? m.webContents.getBackgroundThrottling?.() ?? null : null,
    prefs: alive(labWin) ? labWin.__prefs : null, pid: alive(labWin) ? labWin.webContents.getOSProcessId() : null,
    mainPid: m ? m.webContents.getOSProcessId() : null,
  };
}

function register(ipcMain, ctx) {
  getMain = ctx.getWin; store = ctx.store;
  ipcMain.handle('labwin:open', (_e, o) => open(o || {}, ctx));
  ipcMain.handle('labwin:state', () => state());
  ipcMain.handle('labwin:close', () => { if (alive(labWin)) labWin.close(); return true; });
  ipcMain.handle('labwin:focus', () => { if (!alive(labWin)) return false; if (labWin.isMinimized()) labWin.restore(); labWin.show(); labWin.focus(); return true; });
  ipcMain.handle('labwin:call', (_e, tool, args, c) => call(tool, args, c));
  ipcMain.handle('labwin:result', (e, id, result) => { if (!isLab(e.sender)) return false; pending.get(id)?.(result); pending.delete(id); return true; });
  // the Lab window's drawer: a message for the scene's director chat (sent by the main window's chat, as typed there)
  ipcMain.handle('labwin:ask', (e, o) => { if (!isLab(e.sender) || !main()) return { ok: false, error: 'Hearth is not open.' }; toMain('labwin:ask', { ...(o || {}), scene }); return { ok: true }; });
  // the main window's chat working: a line for the drawer (what the AI is doing, its reply's first words)
  ipcMain.on('labwin:note', (e, o) => { if (!isLab(e.sender)) toLab('labwin:note', o); });
  // "Show in Hearth": the main window to the front (on its chat)
  ipcMain.handle('labwin:showMain', (e, o) => { if (!isLab(e.sender)) return false; const m = main(); if (!m) return false; hidMain = false; if (m.isMinimized()) m.restore(); m.show(); m.focus(); toMain('labwin:showChat', o || {}); return true; });
}

module.exports = { register, mergeScenes, merges, isLab, state, window: () => (alive(labWin) ? labWin : null), scene: () => scene };
