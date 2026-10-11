#!/usr/bin/env node
// The Three Director's MCP side, timed (round 21, labdirector): how fast the tool server starts (every engine run
// starts its own, from a per-run config file) and what one tool call costs on top of the hub's own work.
//   - start: spawn → initialize answered → tools/list answered (median of N), with the hub's Electron as Node
//     (what the CLIs really run) when it's there, and plain Node
//   - call: tools/call round trip through the server to a stand-in hub (127.0.0.1, answers at once), first and later
//   node dev/director-speed.js [--n 9] [--json]
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const N = Number(args[args.indexOf('--n') + 1]) || 9;
const SERVER = path.join(__dirname, '..', 'mcp', 'three-mcp.js');
const ELECTRON = process.env.ELECTRON || '/opt/hearth-electron/electron';
const med = (a) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.floor(s.length / 2)] * 10) / 10; };
const now = () => Number(process.hrtime.bigint() / 1000n) / 1000;

// a stand-in hub: the bridge file points the server at it (HUB_BRIDGE_INFO), every call answers at once
function fakeHub() {
  return new Promise((resolve) => {
    const token = 'speed-test';
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, value: { echo: JSON.parse(body).tool } })); });
    });
    server.listen(0, '127.0.0.1', () => {
      const file = path.join(os.tmpdir(), `hearth-speed-bridge-${process.pid}.json`);
      fs.writeFileSync(file, JSON.stringify({ port: server.address().port, token }));
      resolve({ server, file });
    });
  });
}

function client(command, env) {
  const t0 = now();
  const child = spawn(command, [SERVER], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'ignore'] });
  let buf = ''; let next = 1; const waiting = new Map();
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, nl); buf = buf.slice(nl + 1); try { const m = JSON.parse(line); waiting.get(m.id)?.(m); waiting.delete(m.id); } catch { /* not JSON */ } }
  });
  const rpc = (method, params) => new Promise((resolve) => { const id = next++; waiting.set(id, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); });
  return { t0, rpc, close: () => { child.stdin.end(); child.kill(); } };
}

(async () => {
  const hub = await fakeHub();
  const runtimes = [['node', process.execPath, {}]];
  if (fs.existsSync(ELECTRON)) runtimes.unshift(['electron-as-node', ELECTRON, { ELECTRON_RUN_AS_NODE: '1' }]);
  const report = {};
  for (const [name, bin, env0] of runtimes) {
    const env = { ...env0, HUB_BRIDGE_INFO: hub.file, HUB_NODES_TOOL: '1', HUB_TOOL_MODE: '' };
    const init = []; const list = []; const first = []; const later = []; const bare = [];
    // the runtime alone (start → exit with no code): the part no server change can remove
    for (let i = 0; i < N; i += 1) { const t = now(); await new Promise((r) => spawn(bin, ['-e', '0'], { env: { ...process.env, ...env0 }, stdio: 'ignore' }).on('exit', r)); bare.push(now() - t); }
    for (let i = 0; i < N; i += 1) {
      const c = client(bin, env);
      await c.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'speed', version: '0' } });
      init.push(now() - c.t0);
      await c.rpc('tools/list', {});
      list.push(now() - c.t0);
      let t = now(); await c.rpc('tools/call', { name: 'three_console', arguments: {} }); first.push(now() - t);
      for (let k = 0; k < 5; k += 1) { t = now(); await c.rpc('tools/call', { name: 'three_console', arguments: {} }); later.push(now() - t); }
      c.close();
    }
    report[name] = { runtimeAloneMs: med(bare), startToInitializeMs: med(init), startToToolsListMs: med(list), firstCallMs: med(first), laterCallMs: med(later) };
  }
  hub.server.close(); fs.rmSync(hub.file, { force: true });
  if (args.includes('--json')) { console.log(JSON.stringify(report, null, 1)); return; }
  for (const [k, v] of Object.entries(report)) console.log(`${k.padEnd(18)} runtime alone ${v.runtimeAloneMs} ms · start→initialize ${v.startToInitializeMs} ms · →tools/list ${v.startToToolsListMs} ms · first call ${v.firstCallMs} ms · later calls ${v.laterCallMs} ms`);
})();
