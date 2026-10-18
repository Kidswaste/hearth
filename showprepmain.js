// (round 62, showprep62) The show night reminder, main side: ONE timer for the next "on the day" reminder the owner
// switched on (off by default, per show), armed from data/kv/show-nights.json (the window's log + prepared shows) at
// start and whenever the window saves it. Nothing else runs: no polling; no reminder on = no timer at all.
// When it's time, the window is told ('shows:remind') and shows it through Hearth's notifications (notify.js: the
// computer's own Focus / Do Not Disturb holds it; a toast when Hearth is in front). Each reminder goes once: what has
// gone is kept in data/showsync/reminded.json (careful read, atomic write).
// Registered from showsyncmain.js (register → showprepmain.register). IPC: shows:remind ({ op: 'arm' | 'state' | 'fire' })
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const Core = require('./showprep-core');
const DS = require('./datasafe-core');
const CS = require('./crashsafe-core');
const MAX_WAIT = 2 ** 31 - 1; // setTimeout's limit (≈ 24.8 days): a later reminder re-arms when this one wakes

function create({ dataDir, now = () => Date.now(), emit = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const kvFile = path.join(dataDir, 'kv', 'show-nights.json'), firedFile = path.join(dataDir, 'showsync', 'reminded.json');
  let timer = null, next = null, fired = null, firedOk = true;
  function readFired() {
    if (fired) return fired;
    const r = DS.load(fs, firedFile, {});
    firedOk = r.canSave; fired = r.value && typeof r.value === 'object' && !Array.isArray(r.value) ? r.value : {};
    return fired;
  }
  function arm() {
    if (timer) { clearTimer(timer); timer = null; }
    const r = DS.load(fs, kvFile, null);
    let store = null; try { store = r.value ? Core.validate(r.value) : null; } catch { store = null; } // a log that can't be read: no reminder (it is never rewritten here)
    next = store ? Core.nextReminder(store, now(), readFired()) : null;
    if (next) timer = setTimer(() => { timer = null; if (next && next.at - now() > 1000) return arm(); fire(); }, Math.min(MAX_WAIT, Math.max(0, next.at - now())));
    timer?.unref?.();
    return state();
  }
  async function fire() {
    const n = next; if (!n) return null;
    readFired(); fired[n.key] = new Date(now()).toISOString();
    for (const [k, at] of Object.entries(fired)) if (now() - Date.parse(at) > 60 * 86400e3) delete fired[k]; // a reminder older than two months is forgotten
    if (firedOk) { try { await fsp.mkdir(path.dirname(firedFile), { recursive: true }); await CS.writeAtomic(fsp, firedFile, JSON.stringify(fired)); } catch { /* it may come again; better than never */ } }
    emit('shows:remind', { key: n.key, title: n.title, body: n.body });
    arm();
    return n;
  }
  const state = () => ({ armed: !!timer, next: next ? { at: next.at, key: next.key, title: next.title } : null });
  return { arm, fire, state, _fired: () => readFired() };
}

let api = null;
function register(ipcMain, { dataDir, getWin }) {
  api = create({ dataDir, emit: (ch, ev) => { try { const w = getWin?.(); if (w && !w.isDestroyed()) w.webContents.send(ch, ev); } catch { /* no window: nothing to tell */ } } });
  try { api.arm(); } catch (err) { console.warn('[showprep] reminder', err.message); }
  ipcMain.handle('shows:remind', async (_e, { op } = {}) => {
    try {
      if (op === 'arm') return { ok: true, value: api.arm() };
      if (op === 'fire' && process.env.HEARTH_TEST_SAVE_DIR) return { ok: true, value: await api.fire() }; // checks only: "it's time" now
      return { ok: true, value: api.state() };
    } catch (err) { return { ok: false, error: err.message }; }
  });
}
module.exports = { create, register };
