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

function start(getWin) {
  const token = crypto.randomBytes(24).toString('hex');
  ipcMain.handle('game:result', (_e, id, result) => {
    pending.get(id)?.(result);
    pending.delete(id);
  });
  // /director-cost: what each director's tool sets and prompt cost per message (mcp/cost.js).
  ipcMain.handle('director:cost', (_e, agents) => {
    try { return require('./mcp/cost').report(Array.isArray(agents) && agents.length ? agents : undefined); } catch (err) { return { error: err.message }; }
  });
  // /director-guide: the Three Director's guide topics, as the agent reads them (three_do help).
  ipcMain.handle('director:guide', (_e, topic) => {
    try { return require('./mcp/three-guide').help(topic); } catch (err) { return `Error: ${err.message}`; }
  });

  // Ask the renderer (which owns the game webview) to run one tool call.
  const callRenderer = (tool, args) => new Promise((resolve) => {
    const win = getWin();
    if (!win) { resolve({ ok: false, error: 'The hub window is not open.' }); return; }
    const id = crypto.randomUUID();
    pending.set(id, resolve);
    win.webContents.send('game:call', { id, tool, args });
    // Renders can run for a long time; everything else should answer within a minute.
    // (three_do / forge_patch carry the real command in their arguments; the bridge routes them in the renderer)
    const slow = tool === 'ae_render' || tool === 'video_export' || tool === 'chat_ask';
    const limit = slow ? 45 * 60000 : tool === 'chat_second_opinion' ? 6 * 60000 : tool === 'three_load_media' || (tool === 'three_do' && args?.cmd === 'load_media') ? 3 * 60000 : 60000;
    setTimeout(() => {
      if (pending.has(id)) { pending.delete(id); resolve({ ok: false, error: `The hub did not answer within ${Math.round(limit / 1000)} s.` }); }
    }, limit);
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
