// Two copies of Hearth on one computer, main side (round 64, twocopies64; the plain rules are in twocopies-core.js).
//   · early({ app })   at the very top of main.js (before the single-window lock and anything that reads the profile):
//                      this data folder's id, and which Electron profile this copy uses. Every Hearth folder used to
//                      share one profile (all are called "agent-hub"), so a second, empty copy read and wrote the real
//                      copy's open chat, Lab scene, resume card, typed queue, routines and first-run marks. Now the copy
//                      that owns the usual profile keeps it (marked in <profile>/hearth-copy.json); another copy gets
//                      its own next to it ("agent-hub-copy-<id>"), kept from then on.
//   · gate(o)          in 'ready', before the main window: a copy with no chats that finds another Hearth folder with
//                      chats shows one card first — "You already have Hearth with 142 chats in C:\Users\you\agent-hub.
//                      Open that one (recommended) · Bring its chats here · Start fresh here". Nothing empty is shown
//                      before the owner chose. Open that one starts the other copy and quits this one; Bring its chats
//                      here copies them with 🛟 Recover's own code (datasafemain: copy only, the other folder is never
//                      written, moved or deleted); Start fresh is remembered (data/twocopies.json).
//   · others()         the other copies with chats (for Recover… and the shortcuts)
// Only the real app (package "agent-hub") does this; test copies (smoke runs rename the package) never look at the
// computer's real folders. Tests: HEARTH_TWOCOPIES=1 forces it on, =0 off (a copy from before this round);
// HEARTH_TWOCOPIES_HOME is the home folder looked in.
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('./twocopies-core');

const APP_DIR = __dirname;
let S = { on: false, copyId: null, primary: true, defaultDir: '', profile: '', why: 'off', dataDir: path.join(APP_DIR, 'data') };
const home = () => process.env.HEARTH_TWOCOPIES_HOME || os.homedir();
function enabled() {
  const e = process.env.HEARTH_TWOCOPIES;
  if (e === '0') return false;
  if (e === '1') return true;
  try { return require('./package.json').name === 'agent-hub'; } catch { return false; }
}
const chatsHere = () => C.countChats(fs, path, S.dataDir).chats;
// Windows: where the Start menu / Desktop "Hearth.lnk" and the login item point (only once Electron is ready)
function winLinks() {
  if (process.platform !== 'win32') return { links: [], loginItems: [] };
  const links = []; let loginItems = [];
  try {
    const { shell, app } = require('electron');
    for (const f of [path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Hearth.lnk'), path.join(home(), 'Desktop', 'Hearth.lnk'), path.join(home(), 'OneDrive', 'Desktop', 'Hearth.lnk')]) {
      try { if (fs.existsSync(f)) links.push(shell.readShortcutLink(f)); } catch { /* not a link we can read */ }
    }
    try { loginItems = app.getLoginItemSettings().launchItems || []; } catch { loginItems = []; }
  } catch { /* no Electron (a test) */ }
  return { links, loginItems };
}
function others({ withLinks = true } = {}) {
  if (!S.on) return [];
  try { return C.findOthers({ fs, platform: process.platform, home: home(), env: process.env, appDir: APP_DIR, ...(withLinks ? winLinks() : {}) }); } catch { return []; }
}

// ---------- which profile (before anything reads it) ----------
function early({ app, dataDir = path.join(APP_DIR, 'data') } = {}) {
  S.dataDir = dataDir;
  if (!enabled() || !app) return S;
  S.on = true;
  try {
    S.copyId = C.ensureId({ fs, path, dataDir, appDir: APP_DIR });
    S.defaultDir = app.getPath('userData');
    const pick = C.pickProfile({ fs, path, defaultDir: S.defaultDir, copyId: S.copyId, dataDir, appDir: APP_DIR, chatsHere: chatsHere(), others: () => others({ withLinks: false }) });
    S.primary = pick.primary; S.why = pick.why; S.profile = pick.dir;
    if (pick.dir && pick.dir !== S.defaultDir) { fs.mkdirSync(pick.dir, { recursive: true }); app.setPath('userData', pick.dir); }
    if (pick.claim) C.writeMarker({ fs, path, defaultDir: S.defaultDir, copyId: S.copyId, dataDir, appDir: APP_DIR });
    if (!pick.primary) console.log(`Hearth: another Hearth folder uses the usual profile; this one (${APP_DIR}) has its own (${pick.why})`);
  } catch (err) { console.warn('twocopies:', err.message); }
  return S;
}
const info = () => ({ ...S });

// ---------- the card before the main window ----------
let ipcDone = false; let cur = null; // (the card on screen: its state and its answer)
// o = { app, BrowserWindow, ipcMain, bring(other) → Promise<{ chats, memory, agents, kv }>, icon }
// → Promise<{ quit?: true, note?: string, close(): void }>
async function gate(o) {
  const none = { close() {} };
  if (!S.on) return none;
  let found = [];
  try {
    if (chatsHere() > 0) return none;
    const choice = C.readChoice({ fs, path, dataDir: S.dataDir });
    found = others();
    if (!C.shouldAsk({ chatsHere: 0, choice, others: found })) return none;
  } catch (err) { console.warn('twocopies: look', err.message); return none; }
  const { app, BrowserWindow, ipcMain } = o;
  return new Promise((resolve) => {
    let settled = false; let card = null; let busy = false;
    const close = () => { try { if (card && !card.isDestroyed()) card.destroy(); } catch { /* gone */ } };
    const done = (r) => { if (settled) return; settled = true; resolve({ close, ...r }); };
    const state = { here: APP_DIR, others: found.map((x) => ({ dir: x.dir, chats: x.chats, newest: x.newest })), platform: process.platform };
    if (!ipcDone) {
      ipcDone = true;
      ipcMain.handle('twocopies:info', () => cur?.state || null);
      ipcMain.handle('twocopies:choose', (_e, a) => (cur ? cur.choose(a || {}) : { ok: false }));
    }
    cur = { state, choose: null };
    cur.choose = async ({ what, dir }) => {
      if (busy || settled) return { ok: false };
      const other = found.find((x) => C.same(process.platform, x.dir, dir)) || found[0];
      if (what === 'open') {
        const plan = C.openPlan({ fs, platform: process.platform, other: other.dir, execPath: process.execPath, home: home(), passArgs: passArgs() });
        if (plan.folder) { try { require('electron').shell.openPath(plan.folder); } catch { /* shown in the card */ } return { ok: false, folder: plan.folder }; }
        try {
          try { app.releaseSingleInstanceLock(); } catch { /* not held */ }
          const child = require('child_process').spawn(plan.cmd, plan.args, { cwd: plan.cwd, detached: true, stdio: 'ignore', windowsHide: false, env: childEnv() });
          child.unref();
          noteOpened(plan);
        } catch (err) { return { ok: false, error: err.message }; }
        setTimeout(() => { done({ quit: true }); close(); app.quit(); }, 300);
        return { ok: true };
      }
      if (what === 'bring') {
        busy = true;
        try {
          const r = await o.bring(other.dir);
          C.writeChoice({ fs, path, dataDir: S.dataDir, choice: 'brought', other: other.dir });
          busy = false;
          setTimeout(() => done({ note: `Copied ${r.chats} chat${r.chats === 1 ? '' : 's'} from ${other.dir}. That folder wasn't changed: its chats are still there too.` }), 900);
          return { ok: true, ...r };
        } catch (err) { busy = false; return { ok: false, error: err.message }; }
      }
      if (what === 'fresh') {
        C.writeChoice({ fs, path, dataDir: S.dataDir, choice: 'fresh', other: other.dir });
        done({});
        return { ok: true };
      }
      return { ok: false };
    };
    try {
      card = new BrowserWindow({
        width: 600, height: 500, minWidth: 420, minHeight: 380, show: false, title: 'Hearth', icon: o.icon, autoHideMenuBar: true, backgroundColor: o.background || '#16120f',
        webPreferences: { preload: path.join(APP_DIR, 'twocopies-preload.js'), contextIsolation: true, sandbox: true },
      });
      card.on('close', (e) => { if (settled) return; e.preventDefault(); if (busy) return; done({}); }); // closed: this copy opens, asked again next time
      card.once('ready-to-show', () => { try { card.show(); } catch { /* gone */ } });
      card.loadFile(path.join(APP_DIR, 'twocopies.html'));
    } catch (err) { console.warn('twocopies: card', err.message); done({}); }
  });
}
// a test run passes its own switches on to the copy it starts (the profile it was given, no sandbox here)
function passArgs() {
  const out = [];
  for (const a of process.argv.slice(1)) if (a === '--no-sandbox' || (/^--user-data-dir=/.test(a) && S.defaultDir)) out.push(a === '--no-sandbox' ? a : `--user-data-dir=${S.defaultDir}`);
  return out;
}
function childEnv() { const e = { ...process.env }; delete e.ELECTRON_RUN_AS_NODE; return e; }
function noteOpened(plan) { try { if (process.env.HEARTH_TWOCOPIES_NOTE) fs.writeFileSync(process.env.HEARTH_TWOCOPIES_NOTE, JSON.stringify({ at: Date.now(), plan })); } catch { /* tests only */ } }

module.exports = { early, gate, info, others, enabled, chatsHere: () => (S.on ? chatsHere() : null) };
