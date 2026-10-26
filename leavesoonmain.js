// (round 68, leavesoon68) "⏰ Remind me to leave", the main side: ONE timeout to the next reminder that's on (or snoozed),
// armed at start, after every change and when the computer wakes up. Nothing polls; no reminder on = no timer at all.
// It lives here (not in the window) so it rings with Hearth in the tray. When it's time the window is told
// ('leave:due') and shows it through Hearth's notifications (notify.js: Windows' / the Mac's own, "Show on map",
// "Snooze 10 min", "Dismiss"; a toast when Hearth is in front). A reminder whose time went by while Hearth was closed or
// asleep is NOT rung late: it's marked missed and shown once (leave:op 'missed', then 'seen').
// Store: data/leavesoon/reminders.json (this computer only: sync-merge.js LOCAL_DIRS), careful read (a file that can't be
// read is never treated as empty or saved over), atomic writes. The window computes the travel and the times
// (leavesoon-core.js); this side only keeps them and keeps time.
// IPC: leave:op ({ op: 'list' | 'put' | 'remove' | 'snooze' | 'dismiss' | 'missed' | 'seen' | 'test' }) · events leave:due, leave:changed
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const K = require('./leavesoon-core');
const DS = require('./datasafe-core');
const CS = require('./crashsafe-core');
const MAX_WAIT = 2 ** 31 - 1; // setTimeout's limit (≈ 24.8 days): a later reminder re-arms when this one wakes

function create({ dataDir, now = () => Date.now(), emit = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const file = path.join(dataDir, 'leavesoon', 'reminders.json');
  let s = null, ok = true, timer = null, nextDue = null, writing = Promise.resolve();
  let offset = 0; // (checks) a fake clock
  const clock = () => now() + offset;
  function read() {
    if (s) return s;
    const r = DS.load(fs, file, null);
    try { s = r.value ? K.validate(r.value) : K.empty(); ok = r.canSave; } catch { s = K.empty(); ok = false; } // can't be read: nothing rings, nothing is saved over it
    if (r.state === 'unreadable' && !r.value) ok = false;
    return s;
  }
  function save() {
    if (!ok) return Promise.resolve(false);
    const data = JSON.stringify(s);
    writing = writing.then(async () => { await fsp.mkdir(path.dirname(file), { recursive: true }); await CS.writeAtomic(fsp, file, data); return true; }).catch((err) => { console.warn('[leavesoon] save', err.message); return false; });
    return writing;
  }
  function arm() {
    if (timer) { clearTimer(timer); timer = null; }
    read();
    if (K.settle(s, clock())) { save(); emit('leave:changed', {}); }
    const n = K.next(s, clock());
    nextDue = n;
    if (n) { timer = setTimer(() => { timer = null; wake(); }, Math.min(MAX_WAIT, Math.max(0, n.due - clock()))); timer?.unref?.(); }
    return state();
  }
  // the timeout woke: ring what's due (or mark it missed when the wake came too late), then the next one
  function wake() {
    read();
    const at = clock(), n = K.next(s, at);
    if (n && n.due <= at + 1000) { const it = K.fire(s, n.key, at); save(); emit('leave:due', { key: it.key, ...K.notice(it, at), item: it }); emit('leave:changed', {}); }
    return arm();
  }
  const state = () => ({ armed: !!timer, next: nextDue, now: clock(), count: (s?.items || []).length, saving: ok });
  async function op(a = {}) {
    read();
    const at = clock();
    switch (a.op) {
      case 'list': K.settle(s, at); return { items: s.items, now: at, state: state() };
      case 'put': { if (!ok) throw Error('Your leave reminders couldn’t be read just now, so nothing was changed.'); const it = K.put(s, a.item || {}, at); await save(); arm(); emit('leave:changed', {}); return it; }
      case 'remove': { const gone = K.remove(s, String(a.key || '')); if (gone) { await save(); arm(); emit('leave:changed', {}); } return gone; }
      case 'snooze': case 'dismiss': { const it = K[a.op](s, String(a.key || ''), at); await save(); arm(); emit('leave:changed', {}); return it; }
      case 'missed': K.settle(s, at); return K.missed(s);
      case 'seen': { let n = 0; for (const it of s.items) if (it.state === 'missed' && !it.missedSeen && (!a.keys || a.keys.includes(it.key))) { it.missedSeen = true; n++; } if (n) await save(); return n; }
      case 'test': // (checks only) a fake clock: "now" jumps to a.now and runs on from there; then re-armed as at a start
        if (!process.env.HEARTH_TEST_SAVE_DIR) throw Error('Only in checks.');
        if (a.now != null) offset = Number(a.now) - now();
        if (a.reload) s = null; // read the file again, as a fresh start would
        return arm();
      default: return state();
    }
  }
  return { arm, wake, op, state, _store: () => read() };
}

let api = null;
function register(ipcMain, { dataDir, getWin, powerMonitor }) {
  api = create({ dataDir, emit: (ch, ev) => { try { const w = getWin?.(); if (w && !w.isDestroyed()) w.webContents.send(ch, ev); } catch { /* no window: nothing to tell */ } } });
  try { api.arm(); } catch (err) { console.warn('[leavesoon] arm', err.message); }
  try { powerMonitor?.on?.('resume', () => { try { api.arm(); } catch { /* next change re-arms */ } }); } catch { /* no power events here */ } // after sleep: due → rings (within 2 min) or missed
  ipcMain.handle('leave:op', async (_e, a = {}) => { try { return { ok: true, value: await api.op(a) }; } catch (err) { return { ok: false, error: err.message }; } });
}
module.exports = { create, register };
