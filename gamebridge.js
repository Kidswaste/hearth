// Local bridge between Claude's Forgeheart tools (mcp/forge-game-mcp.js) and the live debug game
// in the hub window. Listens on 127.0.0.1 only, with a random token rewritten at every start.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { ipcMain } = require('electron');
const { DATA_DIR } = require('./store');

const INFO_PATH = path.join(DATA_DIR, 'game-bridge.json');
const pending = new Map(); // request id -> resolve
const timers = new Map(); // request id -> its time limit

function start(getWin) {
  const token = crypto.randomBytes(24).toString('hex');
  ipcMain.handle('game:result', (_e, id, result) => {
    pending.get(id)?.(result);
    pending.delete(id);
    clearTimeout(timers.get(id)); timers.delete(id); // (round 16) the time limit goes with the answer, not up to 45 min later
  });
  // /director-cost: what each director's tool sets and prompt cost per message (mcp/cost.js).
  ipcMain.handle('director:cost', (_e, agents) => {
    try { return require('./mcp/cost').report(Array.isArray(agents) && agents.length ? agents : undefined); } catch (err) { return { error: err.message }; }
  });
  // /director-guide: the Three Director's guide topics, as the agent reads them (three_do help).
  ipcMain.handle('director:guide', (_e, topic) => {
    try { return require('./mcp/three-guide').help(topic); } catch (err) { return `Error: ${err.message}`; }
  });

  // (round 52, chatkeep) the window's page going away (a crash, a reload) answers every call it was running at once:
  // the director's reply goes on (it can call again) instead of waiting up to the call's time limit (a minute, or
  // 45 for a render) for a page that will never answer, while the owner sees "still writing" after the crash
  const watched = new WeakSet();
  const dropAll = (why) => {
    for (const [id, resolve] of pending) { clearTimeout(timers.get(id)); timers.delete(id); resolve({ ok: false, error: `The Hearth window ${why} while this ran: nothing was changed by it; call it again.` }); }
    pending.clear();
  };
  const watch = (win) => {
    const wc = win?.webContents;
    if (!wc || watched.has(wc)) return;
    watched.add(wc);
    wc.on('render-process-gone', () => dropAll('crashed and reloaded'));
    wc.on('did-start-navigation', (d) => { if (d?.isMainFrame !== false && !d?.isSameDocument && pending.size) dropAll('reloaded'); });
  };
  // Ask the renderer (which owns the game webview) to run one tool call.
  const callRenderer = (tool, args) => new Promise((resolve) => {
    const win = getWin();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) { resolve({ ok: false, error: 'The hub window is not open.' }); return; }
    watch(win);
    const id = crypto.randomUUID();
    pending.set(id, resolve);
    win.webContents.send('game:call', { id, tool, args });
    // Renders can run for a long time; everything else should answer within a minute.
    // (three_do / forge_patch carry the real command in their arguments; the bridge routes them in the renderer)
    // (a Lab sequence render steps every frame: minutes for a long one)
    const slow = /^(adobe|deploy)_/.test(tool) || tool === 'chat_ask' || ((tool === 'three_sequence' || (tool === 'three_do' && args?.cmd === 'sequence')) && /^render$/.test(String(args?.op || '')));
    // capture: a recording for N seconds or a scripted tour can run for minutes
    // access_check (round 14): an approval card waits for the owner (it denies by itself after its own timeout)
    const limit = slow ? 45 * 60000 : tool === 'chat_sound' ? 120000 : tool === 'access_check' || tool === 'chat_open' ? 10 * 60000 : tool === 'capture_record' || tool === 'capture_frames' || /^(meshy_|apps_)/.test(tool) ? 15 * 60000 : tool === 'chat_second_opinion' ? 6 * 60000 : tool === 'three_load_media' || (tool === 'three_do' && args?.cmd === 'load_media') ? 3 * 60000 : tool === 'three_do' && args?.cmd === 'play' ? 3 * 60000 : tool === 'three_do' && args?.cmd === 'crew' ? 20 * 60000 : 60000; // (round 22) a crew waits for the owner's OK, then its helpers
    timers.set(id, setTimeout(() => {
      timers.delete(id);
      if (pending.has(id)) { pending.delete(id); resolve({ ok: false, error: `The hub did not answer within ${Math.round(limit / 1000)} s.` }); }
    }, limit));
  });

  const server = http.createServer((req, res) => {
    const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'POST' || req.url !== '/call' || req.headers['x-hub-token'] !== token) { reply(403, { ok: false, error: 'forbidden' }); return; }
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(); });
    req.on('end', async () => {
      try {
        const { tool, args } = JSON.parse(body || '{}');
        const result = await callRenderer(tool, args || {});
        delete result.png; // the full-size PNG is only for the hub's own Save button
        reply(200, result);
      } catch (err) { reply(400, { ok: false, error: err.message }); }
    });
  });
  server.listen(0, '127.0.0.1', () => {
    fs.writeFileSync(INFO_PATH, JSON.stringify({ port: server.address().port, token, pid: process.pid }));
  });
  return server;
}

module.exports = { start, INFO_PATH };
