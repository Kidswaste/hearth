// (round 55, chatsafe55) "Bring back <its AI>" for chats whose AI is missing, main side. A chat never moves to another
// AI: its own AI comes back instead, from wherever it still is. Required from main.js with one line.
//   IPC chatsafe:bring (agentId) → { ok, how: 'here' | 'on' | 'stash' | 'copy' | 'none', from?, name? }
//     here  it is set up already · on  it was turned off: turned on again
//     stash an update's stash still held it (updatermain.agentAside) · copy  Recover's places had it (automatic copies,
//           sync, the cloud folder, backups: datasafemain.scan / recover)
//     none  nowhere: the window makes it again under the same id (a director: the /director-setup one)
// Never written over what wasn't read: settings that can't be read just now change nothing (datasafe rule).
let o = { cfg: null, onConfig: () => {} };

const okId = (id) => typeof id === 'string' && /^[\w.-]{1,80}$/.test(id);

async function bring(id) {
  if (!okId(id)) return { ok: false, how: 'none', error: 'Not an AI\'s id' };
  const read = () => { try { return o.cfg.read(); } catch { return null; } };
  const cur = read();
  if (!cur || !Array.isArray(cur.agents)) return { ok: false, how: 'unread', error: 'Your settings couldn\'t be read just now: nothing was changed, try again in a moment' };
  const save = (next) => { const r = o.cfg.save(next); if (!r?.ok) return { ok: false, how: 'held', error: `Settings couldn't be saved just now (${r?.refused || 'held'}): try again in a moment` }; try { o.onConfig(); } catch { /* the watcher tells the window too */ } return null; };
  const have = cur.agents.find((a) => a?.id === id);
  if (have) {
    if (have.enabled !== false) return { ok: true, how: 'here', name: have.name };
    const bad = save({ ...cur, agents: cur.agents.map((a) => (a?.id === id ? { ...a, enabled: true } : a)) });
    return bad || { ok: true, how: 'on', name: have.name };
  }
  // 1. an update's stash (round 54: the owner's config.json waited in one)
  let found = null;
  try { found = await require('./updatermain').agentAside(id); } catch (err) { console.warn('chatsafe: stashes', err.message); }
  if (found?.agent) {
    const now = read();
    if (!now || !Array.isArray(now.agents)) return { ok: false, how: 'unread', error: 'Your settings couldn\'t be read just now: nothing was changed, try again in a moment' };
    if (now.agents.some((a) => a?.id === id)) return { ok: true, how: 'here', name: found.agent.name };
    const bad = save({ ...now, agents: [...now.agents, { ...found.agent, enabled: true }] });
    return bad || { ok: true, how: 'stash', from: found.from, name: found.agent.name };
  }
  // 2. everywhere Recover looks (automatic copies of the settings, sync, the cloud folder, backups)
  try {
    const DM = require('./datasafemain');
    const s = await DM.scan({});
    const row = (s.settings || []).find((r) => r.what === 'agent' && r.id === id);
    if (row) {
      const r = await DM.recover([row.key]);
      if (r.agents) return { ok: true, how: 'copy', from: row.from, name: row.name };
    }
  } catch (err) { console.warn('chatsafe: copies', err.message); }
  return { ok: false, how: 'none' };
}

function register(ipcMain, opts = {}) {
  o = { ...o, ...opts };
  ipcMain.handle('chatsafe:bring', (_e, id) => bring(String(id || '')));
}

module.exports = { register, bring, _set: (patch) => { o = { ...o, ...patch }; } };
