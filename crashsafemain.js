// Nothing is lost when Hearth or the computer stops suddenly (round 50, crashsafe), the main side. safetynetmain.js
// keeps the session marker and the work journal; this keeps what only the main process sees:
//   replies   every engine event of a reply being written (main.js engine:send taps here): the words so far, its
//             tools, its session, written to data/safetynet/replies.json ≤ 0.8 s behind (one write at a time, temp file
//             flushed + renamed, off the main thread). The window says "saved" (ack) once the reply is in its chat;
//             what's left at the next start was cut off. A reply that ends while the window's page is gone (crashed,
//             reloading) is kept whole and handed to the next page (crashsafe:orphan)
//   inflight  renders / exports / backups writing one file over minutes: begin(kind, files, label) / end(id), kept in
//             data/safetynet/inflight.json (written at once). One still listed at a start was cut off by a crash or a
//             power cut: its half-made file goes to the Trash (only files the job made; never one that was there)
//   leftovers temp files killed writes left in the data folder (crashsafe-core tmpPlan): a whole newer version takes
//             the place of a missing / cut-short file, junk goes to the Trash. Once at the start, before the window
//             reads anything (only temp files are opened: a folder listing per data folder, a few ms)
//   shutdown  Windows ending the session (an update restart, a sign-out) or the Mac / Linux shutting down: what the
//             window kept is written at once (journal, replies), and the window is asked to save what it holds
//   page      the window's page crashing / reloading: a render it was feeding (renderfastmain) is stopped and its
//             half file removed (no ffmpeg left waiting forever), and replies still running become the next page's
// Required from main.js: register(ipcMain, { dataDir, getWin }); main.js's engine:send calls reply(chatId, agentId, ev).
const fs = require('fs');
const path = require('path');
const C = require('./crashsafe-core');

const TEST = Boolean(process.env.HEARTH_TEST_SAVE_DIR);
let dir = ''; let dataDir = ''; let getWin = () => null;
const file = (n) => path.join(dir, n);
const readJson = (p, fb) => { try { return JSON.parse(require('./scenesafe-core').readRetry(fs, p)); } catch { return fb; } };
let gen = 0; // the window's page: +1 each time it crashes or loads again
let prevRun = { replies: [], leftovers: [], tmp: [] }; // what the last run left (handed to the window once)
const report = { tmp: [] }; // what the leftovers sweep did

// ---------- the Trash (tests: a folder in the throwaway data, so a check can look) ----------
async function trash(p) {
  if (TEST) { const to = path.join(dir, 'test-trash', `${Date.now().toString(36)}-${path.basename(p)}`); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(p, to); return to; }
  await require('electron').shell.trashItem(p);
  return 'trash';
}

// ---------- replies being written ----------
const replies = new Map(); // chatId → entry (crashsafe-core newReply / add)
let rWriting = null; let rDirty = false; let rTimer = null;
const repliesValue = () => ({ v: C.V, at: Date.now(), list: [...replies.values()] });
function writeRepliesSoon() {
  rDirty = true;
  if (rTimer || rWriting) return;
  rTimer = setTimeout(() => { rTimer = null; flushReplies(); }, 800);
  rTimer.unref?.();
}
function flushReplies() {
  if (!rDirty || !dir) return rWriting || Promise.resolve();
  if (rWriting) return rWriting;
  rDirty = false;
  rWriting = C.writeAtomic(fs.promises, file('replies.json'), JSON.stringify(repliesValue()))
    .catch((err) => console.warn('crashsafe: replies', err.message))
    .finally(() => { rWriting = null; if (rDirty) writeRepliesSoon(); });
  return rWriting;
}
function flushRepliesSync() { if (!dir) return; try { C.writeAtomicSync(fs, file('replies.json'), JSON.stringify(repliesValue())); rDirty = false; } catch (err) { console.warn('crashsafe: replies', err.message); } }
const send = (ch, data) => { const w = getWin(); if (w && !w.isDestroyed()) w.webContents.send(ch, data); };
// main.js engine:send: every event of a reply
function reply(chatId, agentId, ev) {
  if (!dir || !chatId || !ev?.type) return;
  let e = replies.get(chatId);
  if (ev.type === 'start' || !e) { e = C.newReply(chatId, agentId, gen); replies.set(chatId, e); if (ev.type === 'start') return; }
  if (!['delta', 'tool', 'thinking', 'done', 'stopped', 'error'].includes(ev.type)) return;
  C.add(e, ev);
  if (e.final && e.gen !== gen) send('crashsafe:orphan', e); // its page is gone: the next one takes it
  writeRepliesSoon();
}
function ack(chatId) { if (replies.delete(chatId)) writeRepliesSoon(); return true; }

// ---------- long writes in flight ----------
let inflight = [];
const saveInflight = () => { try { C.writeAtomicSync(fs, file('inflight.json'), JSON.stringify({ v: C.V, list: inflight })); } catch (err) { console.warn('crashsafe: inflight', err.message); } };
let seq = 0;
function begin(kind, files, label = '') {
  if (!dir) return null;
  const id = `${kind}-${Date.now().toString(36)}-${++seq}`;
  inflight.push({ id, kind, label: String(label || '').slice(0, 80), files: (files || []).filter((f) => typeof f === 'string' && path.isAbsolute(f)), at: Date.now() });
  saveInflight();
  return id;
}
function end(id) { if (!id) return; const n = inflight.length; inflight = inflight.filter((x) => x.id !== id); if (inflight.length !== n) saveInflight(); }

async function cleanLeftovers(list) {
  const out = [];
  for (const l of C.leftovers(list, (f) => fs.existsSync(f))) {
    if (!l.files.length) continue; // nothing was left behind
    const gone = [];
    for (const f of l.files) { try { await trash(f); gone.push(f); } catch (err) { console.warn('crashsafe: trash', f, err.message); } }
    out.push({ ...l, files: gone, line: C.leftoverLine({ ...l, files: gone }) });
  }
  return out;
}

// ---------- temp files killed writes left (data folder; config.json next to the app) ----------
const SKIP_DIRS = new Set(['workspace', 'node_modules', 'electron', 'chrome', 'media', 'captures', 'renders', 'assets', 'ae', 'test-trash', 'mcp-runs']);
function tmpFiles(root, depth = 3, out = []) {
  let ents = [];
  try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const p = path.join(root, e.name);
    if (e.isDirectory()) { if (depth > 0 && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.hearth')) tmpFiles(p, depth - 1, out); } else if (C.realOf(e.name)) out.push(p);
  }
  return out;
}
const readMaybe = (p) => { try { return { text: fs.readFileSync(p, 'utf8'), state: 'ok' }; } catch (err) { return { text: null, state: err.code === 'ENOENT' ? 'missing' : 'held' }; } };
async function sweep({ roots = [dataDir], before = Date.now() - 60000 } = {}) {
  const done = [];
  for (const root of roots) {
    for (const p of tmpFiles(root, root === dataDir ? 3 : 0)) {
      let st; try { st = fs.statSync(p); } catch { continue; }
      if (st.mtimeMs > before || st.size > 64 << 20) continue; // being written right now / not a store
      const name = path.basename(p);
      const real = path.join(path.dirname(p), C.realOf(name));
      const r = readMaybe(real);
      const plan = C.tmpPlan({ name, tmpText: st.size < 32 << 20 ? readMaybe(p).text : null, realText: r.text, realState: r.state });
      try {
        if (plan.action === 'promote') {
          if (r.state === 'ok') { fs.copyFileSync(real, real.replace(/(\.json)?$/, `-torn-${Date.now().toString(36)}$1`)); } // the cut one kept aside
          fs.renameSync(p, real);
          done.push({ file: real, action: 'promote', why: plan.why });
        } else if (plan.action === 'trash') { await trash(p); done.push({ file: p, action: 'trash', why: plan.why }); }
      } catch (err) { console.warn('crashsafe: leftover', p, err.message); }
    }
  }
  report.tmp = done;
  return done;
}

// ---------- start ----------
function open(dd) {
  dataDir = dd; dir = path.join(dd, 'safetynet');
  fs.mkdirSync(dir, { recursive: true });
  const r = readJson(file('replies.json'), null);
  prevRun.replies = Array.isArray(r?.list) ? r.list.filter((e) => e && e.chatId) : [];
  const inf = readJson(file('inflight.json'), null);
  const left = Array.isArray(inf?.list) ? inf.list : [];
  inflight = [];
  // replies.json starts empty for this run (the last run's are in prevRun until the window took them)
  try { if (prevRun.replies.length) C.writeAtomicSync(fs, file('replies-prev.json'), JSON.stringify({ v: C.V, list: prevRun.replies })); else { const p = readJson(file('replies-prev.json'), null); if (Array.isArray(p?.list)) prevRun.replies = p.list; } } catch { /* the memory copy */ }
  flushRepliesSync();
  if (left.length) saveInflight();
  prevRun.cleaning = cleanLeftovers(left).then((l) => { prevRun.leftovers = l; return l; }).catch(() => []);
  return prevRun;
}
// the window's page took the last run's replies and leftovers (or there were none)
function done() { prevRun.replies = []; prevRun.leftovers = []; try { fs.rmSync(file('replies-prev.json'), { force: true }); } catch { /* gone */ } return true; }

// the window's page went away (crashed, or a new page is loading): renders it was feeding stop; its replies are orphans
function pageGone(why) {
  gen += 1;
  try { const rf = require.cache[path.join(__dirname, 'renderfastmain.js')]?.exports; if (rf?._jobs?.size) for (const id of [...rf._jobs.keys()]) rf.cancel(id); } catch (err) { console.warn('crashsafe: renders', err.message); }
  if (why === 'crash') flushRepliesSync();
}

// ---------- the Lab's preview pages: their own processes ----------
// A sandboxed preview page runs in a process of its own; when that process dies (a crash, the system killing it) the
// window isn't told (no event for a frame's process). Each preview page's process is noted when it loads, and looked at
// every 2 s while there is one (one cheap system call each; nothing runs without a preview page). Gone → the window
// gets the pages still up and makes the missing one again (tools/three.js crashCheck).
const watched = new Map(); // os pid → webContents
let wTimer = null;
function pageUrls(wc) { const out = []; for (const f of wc.mainFrame.framesInSubtree || []) { try { if (f !== wc.mainFrame) out.push(f.url); } catch { /* disposed */ } } return out; }
function checkPids() {
  for (const [pid, wc] of watched) {
    let alive = true;
    try { process.kill(pid, 0); } catch (err) { alive = err.code === 'EPERM'; }
    if (alive) continue;
    watched.delete(pid);
    if (!wc.isDestroyed()) { try { wc.send('crashsafe:frames', pageUrls(wc)); } catch { /* gone */ } }
  }
  if (!watched.size) { clearInterval(wTimer); wTimer = null; }
}
const seenWc = new WeakSet();
function watchFrames(wc) {
  if (seenWc.has(wc)) return;
  seenWc.add(wc);
  wc.on('did-frame-finish-load', (_e, isMain, fpid, frid) => {
    if (isMain) return;
    let pid = 0;
    try { const f = require('electron').webFrameMain.fromId(fpid, frid); if (f && /three-sandbox\.html/.test(f.url)) pid = f.osProcessId || 0; if (pid === wc.mainFrame.osProcessId) pid = 0; } catch { pid = 0; }
    if (!pid) return;
    watched.set(pid, wc);
    if (!wTimer) { wTimer = setInterval(checkPids, 2000); wTimer.unref?.(); }
  });
}

// the computer is going down (Windows: an update restart, a sign-out; Mac / Linux: shutdown): written now, not later
let downAt = 0;
function goingDown(why) {
  if (Date.now() - downAt < 2000) return;
  downAt = Date.now();
  send('crashsafe:flush', { why });
  flushRepliesSync();
  try { require('./safetynetmain').flushSync?.(); } catch { /* best effort */ }
}

function register(ipcMain, { dataDir: dd, getWin: gw } = {}) {
  const { app, powerMonitor } = require('electron');
  getWin = gw || getWin;
  if (!app.hasSingleInstanceLock()) return;
  open(dd);
  app.on('render-process-gone', (_e, wc, d) => { const w = getWin(); if (w && !w.isDestroyed() && wc === w.webContents && d?.reason !== 'clean-exit') pageGone('crash'); });
  app.on('web-contents-created', (_e, wc) => { watchFrames(wc); });
  try { for (const wc of require('electron').webContents.getAllWebContents()) watchFrames(wc); } catch { /* none yet */ }
  app.on('web-contents-created', (_e, wc) => { wc.on('did-start-navigation', (d, _url, inPlace, isMain) => { const w = getWin(); if ((d?.isMainFrame ?? isMain) && !(d?.isSameDocument ?? inPlace) && w && wc === w.webContents && wc.getURL()) pageGone('load'); }); });
  app.on('browser-window-created', (_e, w) => { w.on('query-session-end', () => goingDown('session')); w.on('session-end', () => goingDown('session')); });
  app.whenReady().then(() => { try { powerMonitor.on('shutdown', () => goingDown('shutdown')); } catch { /* not here */ } });
  app.on('will-quit', () => { flushRepliesSync(); });
  // before anything reads the stores: a temp file from before this start is a killed write's (one Hearth at a time)
  sweep({ roots: [dd, path.join(__dirname)], before: Date.now() - 1000 }).catch(() => {});
  ipcMain.handle('crashsafe:take', async () => { await prevRun.cleaning; return { replies: prevRun.replies, leftovers: prevRun.leftovers, orphans: [...replies.values()].filter((e) => e.gen !== gen), gen }; });
  ipcMain.handle('crashsafe:done', () => done());
  ipcMain.handle('crashsafe:ack', (_e, chatId) => ack(String(chatId || '')));
  ipcMain.handle('crashsafe:test', async (_e, op, arg) => { // (tests only: dev/checks/crashsafe.js)
    if (!TEST) return null;
    const w = getWin();
    if (op === 'state') return { gen, replies: [...replies.values()], inflight, report, prev: { replies: prevRun.replies, leftovers: prevRun.leftovers }, watched: [...watched.keys()] };
    if (op === 'sweep') return sweep({ roots: [dd], before: Date.now() + 1000 });
    if (op === 'down') { downAt = 0; goingDown('session'); return true; }
    if (op === 'begin') return begin(arg?.kind || 'render', arg?.files || [], arg?.label || '');
    const frames = () => { const out = []; for (const f of w?.webContents.mainFrame.framesInSubtree || []) { try { out.push({ url: f.url.slice(0, 120), pid: f.osProcessId, main: f === w.webContents.mainFrame }); } catch { /* disposed */ } } return out; };
    if (op === 'frames') return frames();
    if (op === 'kill-frame') { // the Lab preview's own process killed the hard way (only when it isn't the window's)
      const main = w.webContents.mainFrame.osProcessId;
      const f = frames().find((x) => x.url.includes(arg || 'three-sandbox') && x.pid !== main);
      if (!f) return false;
      process.kill(f.pid, 'SIGKILL');
      return true;
    }
    return null;
  });
}

module.exports = { register, reply, ack, begin, end, sweep, open, done, pageGone, goingDown, flushReplies, _state: () => ({ gen, replies, inflight, prevRun, report, dir }) };
