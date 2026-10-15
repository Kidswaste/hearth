// Hearth never loses work, main side (round 29, safetynet). What the window can't do itself:
//   session  data/safetynet/session.json says "running" from the start and "closed cleanly" on a normal quit; a start
//            that finds "running" knows the last run ended unexpectedly (a crash, a forced quit, power loss)
//   page     the window's page crashing (render-process-gone) is noted and the page reloads (not in a crash loop:
//            3 crashes in 2 minutes and it stays down, as before)
//   journal  what safetynet.js keeps while you work (unsaved Lab code and sliders, chat drafts and queued messages,
//            board edits, text boxes), written to data/safetynet/journal.json a moment after it changes: temp file,
//            flushed to the disk, then renamed over the old one (off the main thread: fs.promises)
//   status   the next page after an unexpected exit gets { unclean, journal } (the journal as it was at that moment)
//            until it says done; nothing here decides what comes back (safetynet-core.js plans, safetynet.js acts)
// The folder is this computer's (sync-merge.js LOCAL_DIRS). Required from main.js: register(ipcMain, { dataDir, getWin }).
const fs = require('fs');
const path = require('path');
const Core = require('./safetynet-core');

let dir = '';
const file = (n) => path.join(dir, n);
let unclean = null; // { kind, at, reason } until the window says done
let journal = Core.empty(); // this run's journal (what the page sends)
let atCrash = null; // the journal as it was when the page crashed / the last run ended
let started = false;
const crashTimes = [];

// (round 43, datasafe) a journal / session file held for a moment (Windows) is read again before it counts as missing
function readJson(p, fallback) { try { return JSON.parse(require('./scenesafe-core').readRetry(fs, p)); } catch { return fallback; } }
function writeSync(p, value) {
  const tmp = `${p}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, p);
}

// ---------- the session marker (synchronous: once at start, once at quit) ----------
function openSession(dataDir, now = Date.now()) {
  dir = path.join(dataDir, 'safetynet');
  fs.mkdirSync(dir, { recursive: true });
  const prev = readJson(file('session.json'), null);
  const s = Core.start(prev, now, process.pid);
  unclean = s.unclean;
  // the last run's journal: kept aside for the window when that run ended unexpectedly (journal-prev.json, until the
  // window says done), else it's done with
  try {
    if (unclean) {
      const j = readJson(file('journal.json'), null);
      if (Core.valid(j)) { atCrash = j; fs.renameSync(file('journal.json'), file('journal-prev.json')); } else { const p = readJson(file('journal-prev.json'), null); atCrash = Core.valid(p) ? p : Core.empty(); }
    } else { fs.rmSync(file('journal.json'), { force: true }); fs.rmSync(file('journal-prev.json'), { force: true }); }
  } catch { atCrash ||= Core.empty(); }
  try { writeSync(file('session.json'), s.marker); } catch (err) { console.error('safetynet: session marker', err.message); }
  started = true;
  return { unclean, journal: atCrash };
}
function markClean() {
  if (!started) return;
  try { writeSync(file('session.json'), { ...readJson(file('session.json'), {}), clean: true, ended: Date.now() }); } catch { /* best effort */ }
}

// ---------- the journal (asynchronous, one write at a time, the newest wins) ----------
let writing = null; let next = null;
async function writeJournal(value) {
  const p = file('journal.json'); const tmp = `${p}.tmp`;
  const h = await fs.promises.open(tmp, 'w');
  try { await h.writeFile(JSON.stringify(value)); await h.sync(); } finally { await h.close(); }
  await fs.promises.rename(tmp, p);
}
function keep(value) {
  if (!started || !Core.valid(value)) return false;
  journal = value;
  if (writing) { next = value; return true; }
  const run = (v) => { writing = writeJournal(v).catch((err) => console.warn('safetynet: journal', err.message)).finally(() => { writing = null; if (next) { const n = next; next = null; run(n); } }); };
  run(value);
  return true;
}

function pageGone(reason, reload) {
  const now = Date.now();
  crashTimes.push(now);
  // the page's journal as it was: what the next page restores from
  atCrash = journal; journal = Core.empty();
  if (!unclean) unclean = Core.page(reason, now);
  if (reload && Core.shouldReload(crashTimes, now)) setTimeout(reload, 400);
}

function register(ipcMain, { dataDir, getWin } = {}) {
  const { app } = require('electron');
  // only the first copy of Hearth keeps the marker (a second launch just hands over and quits)
  if (app.hasSingleInstanceLock()) openSession(dataDir);
  app.on('will-quit', markClean);
  app.on('render-process-gone', (_e, wc, d) => {
    const win = getWin?.();
    if (!win || win.isDestroyed() || wc !== win.webContents || d?.reason === 'clean-exit') return;
    pageGone(d?.reason, () => { if (!win.isDestroyed()) win.webContents.reload(); });
  });
  ipcMain.handle('safetynet:status', () => (unclean ? { unclean, journal: atCrash || Core.empty() } : null));
  ipcMain.handle('safetynet:keep', (_e, value) => keep(value));
  // the window restored what it could: the next page starts fresh (the report is the window's: localStorage)
  ipcMain.handle('safetynet:done', () => { unclean = null; atCrash = null; try { fs.rmSync(file('journal-prev.json'), { force: true }); } catch { /* gone */ } keep(journal); return true; });
  // (tests only: dev/checks/safetynet.js) crash the window's page the hard way, as a real crash would
  ipcMain.handle('safetynet:test-crash', () => {
    if (!process.env.HEARTH_TEST_SAVE_DIR) return false;
    const win = getWin?.();
    setTimeout(() => { try { win?.webContents.forcefullyCrashRenderer(); } catch { /* gone */ } }, 50);
    return true;
  });
}

module.exports = { register, openSession, markClean, keep, pageGone, _state: () => ({ unclean, journal, atCrash, dir }), _flush: () => writing || Promise.resolve() };
