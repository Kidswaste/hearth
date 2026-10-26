// 🪲 Something broke, main side (round 68, bugbutton68). What went wrong lately, kept so the card can say it in plain
// words and Copy report for Claude can hand it over. Nothing runs until something goes wrong: no timer, no poll.
//   ring     this run's problems (at most 40; the same problem again counts up), each redacted the moment it arrives
//            (bugcard-core.js redact: no folder above the Hearth folder, no keys / tokens / passwords, no chat text):
//              · the main process's own JS errors (uncaughtExceptionMonitor: Electron's own error box still shows as
//                before; unhandled rejections: Electron's main process only warns about them, and still does)
//              · requests from the window that failed (jankmain.js watchIpc hands over the handlers that threw)
//              · the window's errors (bugwatch.js forwards what DevReportHooks keeps: page errors, unhandled
//                rejections, error toasts, failed replies, WebGL views losing the graphics card)
//              · Chromium's helpers stopping (the GPU process, the network / audio services), a window's page crashing,
//                a window not answering
//              · programs Hearth runs stopping on their own: gone(name, …) from engines.js (Claude / Astra), codex-server.js
//                (Astra's app-server), creative-vstmain.js (the VST plugin host), aemain.js (the After Effects bridge)
//   live     data/bugbutton/live.json: the ring on disk (written a moment after a problem, at once for the main process's
//            own errors), so a run that ends badly still has it at the next start
//   saved    data/bugbutton/saved.json: the last 3 reports kept after Hearth closed unexpectedly (safetynet's session
//            marker says so at start) or the window's page crashed; the window shows a one-time note for the newest
// The folder is this computer's (sync-merge.js LOCAL_DIRS). Nothing is sent anywhere.
// Required from main.js: watch() at the top (with jankmain's watchIpc), register(ipcMain, { dataDir, getWin }) once.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Core = require('./bugcard-core');

const MAX = 40; const KEEP = 3;
const ring = [];
const started = Date.now();
let dir = ''; let getWin = () => null; let saveT = 0; let quitting = false; let watching = false;
const R = { appDir: __dirname, home: os.homedir() };
const file = (n) => path.join(dir, n);
const mainWc = () => { const w = getWin(); return w && !w.isDestroyed() ? w.webContents : null; };

// one problem in (raw: { kind, message, stack?, t?, where?, ch?, name?, code?, signal?, reason?, agent? })
function add(raw, { now = false } = {}) {
  let e;
  try { e = Core.entry({ src: 'main', ...raw }, R); } catch { return null; }
  if (!e) return null;
  // the toast that tells an error already kept ("Something went wrong: Uncaught Error: …") isn't a second problem
  // (either may arrive first)
  const echo = (toast, x) => toast.kind === 'toast' && x.kind !== 'toast' && x.what && Math.abs((x.last || x.t) - toast.t) < 15000 && toast.what.includes(x.what.slice(0, 60));
  if (ring.some((x) => echo(e, x))) return null;
  for (let i = ring.length - 1; i >= 0; i--) if (echo(ring[i], e)) ring.splice(i, 1);
  const same = ring.find((x) => x.kind === e.kind && x.src === e.src && x.what === e.what && x.ch === e.ch && x.name === e.name);
  if (same) { same.n = (same.n || 1) + 1; same.last = e.t; if (!same.where && e.where) same.where = e.where; } else { ring.push(e); if (ring.length > MAX) ring.shift(); }
  const it = same || e;
  // which page was open (the main process's own problems: the window says, if it can)
  if (e.src === 'main' && !it.where && !same) {
    const wc = mainWc();
    if (wc && !wc.isCrashed?.()) wc.executeJavaScript('window.BugWatch?.view?.() || ""', true).then((v) => { if (v && !it.where) { it.where = Core.redact(String(v), { ...R, max: 80 }); persist(); } }).catch(() => {});
  }
  persist(now);
  return it;
}
// (a moment after a problem: one write for a burst; the main process's own error at once, it may be about to go)
function persist(now = false) {
  if (!dir) return;
  if (now) { clearTimeout(saveT); saveT = 0; writeLive(); return; }
  if (!saveT) saveT = setTimeout(() => { saveT = 0; writeLive(); }, 400);
}
function write(name, value) {
  try { fs.mkdirSync(dir, { recursive: true }); require('./crashsafe-core').writeAtomicSync(fs, file(name), JSON.stringify(value)); } catch (err) { console.warn('bugbutton:', name, err.message); }
}
const writeLive = () => write('live.json', { v: 1, started, pid: process.pid, entries: ring });

// ---------- the main process's own errors ----------
function watch() {
  if (watching) return; watching = true;
  process.on('uncaughtExceptionMonitor', (err, origin) => add({ kind: 'main', message: err?.message || String(err), stack: err?.stack, origin }, { now: true }));
  // (Electron's main process warns about these and goes on: listening doesn't change that)
  process.on('unhandledRejection', (r) => add({ kind: 'main', message: `Unhandled: ${r?.message || String(r)}`, stack: r?.stack }, { now: true }));
}
// a request from the window whose handler threw (jankmain.js watchIpc); a file that isn't there is an answer, not a problem
const QUIET = /ENOENT|no such file|AbortError|aborted|cancell?ed/i;
function ipcFailed(ch, err) {
  if (/^bug:/.test(String(ch)) && !/test/.test(String(ch))) return;
  const msg = err?.message || String(err || '');
  if (err?.code === 'ENOENT' || QUIET.test(msg)) return;
  add({ kind: 'ipc', ch: String(ch), message: msg, stack: err?.stack });
}
// a program Hearth runs stopped on its own (not stopped by Hearth): name in the owner's words
function gone(name, { code = null, signal = null, what = '' } = {}) {
  if (quitting) return null;
  return add({ kind: 'child', name: String(name || 'a program'), code, signal, message: what || name });
}

// ---------- reports kept after an unexpected end ----------
function readSaved() {
  const r = require('./datasafe-core').load(fs, file('saved.json'), { v: 1, reports: [] });
  return { list: Array.isArray(r.value?.reports) ? r.value.reports : [], canSave: r.canSave };
}
function keepReport(rep) {
  const s = readSaved();
  if (!s.canSave) return null; // (a held file isn't written over blind)
  const r = { id: `${rep.kind}-${Date.now().toString(36)}`, seen: false, ...rep };
  write('saved.json', { v: 1, reports: [...s.list, r].slice(-KEEP) });
  return r;
}
// at start: the last run's log becomes a saved report when that run ended unexpectedly, else it's done with
function boot(last) {
  const live = require('./datasafe-core').load(fs, file('live.json'), null);
  const prev = live.state === 'ok' && live.value && Array.isArray(live.value.entries) ? live.value : null;
  if (last?.kind === 'process') {
    keepReport({ kind: 'closed', at: Date.now(), ended: Math.max(Number(last.at) || 0, ...(prev?.entries || []).map((e) => Number(e.last || e.t) || 0)) || null, started: prev?.started || null,
      entries: (prev?.entries || []).map((e) => Core.entry(e, R)).filter(Boolean).slice(-MAX), view: prev?.view || '' });
  }
  try { fs.rmSync(file('live.json'), { force: true }); } catch { /* next write replaces it */ }
  if (ring.length) writeLive(); // (problems from before register: the main process's start)
}

function register(ipcMain, { dataDir, getWin: gw, test = Boolean(process.env.HEARTH_TEST_SAVE_DIR) } = {}) {
  const { app, BrowserWindow } = require('electron');
  getWin = gw || getWin;
  watch();
  if (dataDir && app.hasSingleInstanceLock()) {
    dir = path.join(dataDir, 'bugbutton');
    try { fs.mkdirSync(dir, { recursive: true }); boot(require('./safetynetmain').last?.()); } catch (err) { console.warn('bugbutton: start', err.message); }
  }
  app.on('before-quit', () => { quitting = true; });
  app.on('child-process-gone', (_e, d) => {
    if (!d || d.reason === 'clean-exit' || quitting) return;
    const svc = String(d.serviceName || d.name || '');
    const name = d.type === 'GPU' ? 'the graphics card\'s process' : /network/i.test(svc) ? 'Chromium\'s network helper' : /audio/i.test(svc) ? 'Chromium\'s audio helper' : `a helper of Chromium (${d.type || 'unknown'})`;
    add(d.type === 'GPU' ? { kind: 'gpu', reason: d.reason, code: d.exitCode } : { kind: 'child', name, reason: d.reason, code: d.exitCode, message: name });
  });
  app.on('render-process-gone', (_e, wc, d) => {
    if (!d || d.reason === 'clean-exit' || quitting) return;
    const main = wc && wc === mainWc();
    add({ kind: 'page', reason: d.reason, code: d.exitCode, message: main ? 'the main window' : 'another Hearth window' }, { now: true });
    // the main window's page: a report kept now (its note shows when the page is back)
    if (main && dir) keepReport({ kind: 'page', at: Date.now(), started, entries: ring.map((x) => ({ ...x })) });
  });
  const watchWin = (w) => {
    if (!w || w.__bugWatch) return; w.__bugWatch = true;
    w.on('unresponsive', () => { if (!quitting) add({ kind: 'hang', message: w === getWin() ? 'The window' : 'Another Hearth window' }); });
  };
  for (const w of BrowserWindow?.getAllWindows?.() || []) watchWin(w);
  app.on('browser-window-created', (_e, w) => watchWin(w));

  ipcMain.handle('bug:note', (_e, list) => { for (const raw of (Array.isArray(list) ? list : [list]).slice(0, 30)) if (raw && typeof raw === 'object') add({ ...raw, src: 'window', kind: String(raw.kind || 'error') }); return true; });
  ipcMain.handle('bug:recent', () => ({ entries: ring.map((x) => ({ ...x })), started, saved: readSaved().list.map((r) => ({ id: r.id, kind: r.kind, at: r.at, ended: r.ended || null, n: (r.entries || []).length })), info: info() }));
  // the newest saved report the window hasn't shown a note for (all marked shown: the note is once)
  ipcMain.handle('bug:start', () => {
    const s = readSaved();
    const fresh = s.list.filter((r) => !r.seen);
    if (!fresh.length) return null;
    if (s.canSave) write('saved.json', { v: 1, reports: s.list.map((r) => ({ ...r, seen: true })) });
    return fresh[fresh.length - 1];
  });
  ipcMain.handle('bug:saved', (_e, id) => readSaved().list.find((r) => r.id === id) || null);
  // test copies only (dev/checks/bugbutton68.js): a main-process error and a request that fails, made on purpose
  if (test) {
    ipcMain.handle('bug:test', (_e, what) => {
      const secret = 'sk-ant-api03-TESTKEYabcdefghijklmnopqrstuvwxyz';
      if (what === 'main') { setImmediate(() => { Promise.reject(new Error(`bugbutton68 (made on purpose): a main-process error (key ${secret}, file ${path.join(os.homedir(), 'Private stuff', 'diary.txt')})`)); }); return true; }
      if (what === 'child') return Boolean(gone('the plugin host (VST)', { code: 3221225477 }));
      throw new Error(`bugbutton68 (made on purpose): a request that fails (password=hunter2 in ${path.join(__dirname, 'bugmain.js')})`);
    });
  }
}
function info() {
  let release = os.release();
  try { if (process.getSystemVersion) release = process.getSystemVersion(); } catch { /* os.release() then */ }
  let version = '';
  try { version = require('electron').app.getVersion(); } catch { /* tests */ }
  return { version, os: { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[process.platform] || process.platform, release, arch: process.arch, electron: process.versions.electron || '', up: Math.round(process.uptime()) };
}

module.exports = { watch, register, add, ipcFailed, gone, _test: { ring, boot, keepReport, readSaved, setDir: (d) => { dir = d; } } };
