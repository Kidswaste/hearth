#!/usr/bin/env node
// The mood board's MCP server as the CLIs start it (stdio JSON-RPC, no hub): lean tool list, the "references give a
// vibe, never footage" rule in descriptions, clean failure without a hub, a round trip through a fake hub bridge, and
// the opt-in in engines.js (no board tools or prompt line unless agent.boardTools; Astra gets -c mcp_servers.board).
//   node dev/board-mcp-test.js
const fs = require('fs');
const http = require('http');
const path = require('path');
const F = require('./fake-common');

const root = path.join(__dirname, '..');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  const script = path.join(root, 'mcp', 'board-mcp.js');
  const def = require(script);
  check(def.tools.length === 5 && def.tools.every((t) => t.name.startsWith('board_')), `5 lean tools (${def.tools.map((t) => t.name).join(', ')})`);
  const size = JSON.stringify(def.tools).length;
  check(size < 2600, `tool definitions ≈ ${Math.round(size / 4)} tokens`);
  check(/never place reference media/.test(def.tools.find((t) => t.name === 'board_vibe').description), 'board_vibe says: vibe, never the media');
  check(/never place reference media/.test(def.guide), 'guide line says it too');

  // without a running hub: a clean error
  const infoPath = path.join(root, 'data', 'game-bridge.json');
  const hadInfo = fs.existsSync(infoPath) ? fs.readFileSync(infoPath, 'utf8') : null;
  // a fake hub bridge on 127.0.0.1 answering like the renderer handler would
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => { const { tool, args } = JSON.parse(body); calls.push({ tool, args, token: req.headers['x-hub-token'] }); res.end(JSON.stringify(tool === 'board_vibe' ? { ok: true, value: { vibe: 'Board "x": palette #000000' } } : { ok: false, error: 'nope' })); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  fs.mkdirSync(path.dirname(infoPath), { recursive: true });
  fs.writeFileSync(infoPath, JSON.stringify({ port: server.address().port, token: 'tok', pid: process.pid }));
  try {
    const c = await F.mcpClient({ command: process.execPath, args: [script], env: { HUB_CHAT_ID: 'chat-1' } });
    check(c.tools.length === 5 && !c.instructions, 'served over stdio, no MCP instructions');
    const r = await c.call('board_vibe', { focus: 'palette' });
    check(!r.isError && /palette #000000/.test(r.content[0].text), 'board_vibe round trip through the hub bridge');
    check(calls[0]?.token === 'tok' && calls[0]?.args.hubChatId === 'chat-1' && calls[0]?.args.focus === 'palette', 'the chat id and arguments reach the hub');
    const e = await c.call('board_add', { kind: 'note', text: 'x' });
    check(e.isError && /nope/.test(e.content[0].text), 'hub errors come back as tool errors');
    c.close();
  } finally {
    server.close();
    if (hadInfo != null) fs.writeFileSync(infoPath, hadInfo); else fs.rmSync(infoPath, { force: true });
  }

  // engines.js: opt-in only
  const engines = require(path.join(root, 'engines.js'));
  const t = engines._test;
  const plain = { id: 'c', name: 'Claude', engine: 'claude', mode: 'native' };
  check(!t.hubToolsets(plain).includes('boardTools') && !/MOOD BOARD/.test(engines.buildPrompt(plain)), 'off by default (no tools, no prompt line)');
  const on = { ...plain, boardTools: true };
  check(t.hubToolsets(on).includes('boardTools') && /never place reference media/.test(engines.buildPrompt(on)), 'boardTools: tools + one prompt line');
  const grow = engines.buildPrompt(on).length - engines.buildPrompt(plain).length;
  check(grow < 400, `prompt grows by ${grow} chars only`);
  const dir = { id: 'td', name: 'Three Director', engine: 'claude', dock: 'three', threeTools: true, boardTools: true };
  check(/MOOD BOARD/.test(engines.buildPrompt(dir)) && /ONE LAYER PER EFFECT/.test(engines.buildPrompt(dir)), 'a director with the board keeps its own guide + the board line');
  const cx = t.codexArgs({ ...dir, engine: 'codex', hubTools: true, hubChatId: 'td-1' }, {}, {}).join(' ');
  check(/mcp_servers\.board\.command=/.test(cx) && /board-mcp\.js/.test(cx), 'Astra gets the board server through -c mcp_servers');
  check(!t.hubToolsets({ ...on, noHubTools: true }).length, 'one-off calls never get it');
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
