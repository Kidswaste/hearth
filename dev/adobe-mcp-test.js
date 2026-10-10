#!/usr/bin/env node
// The Adobe and publishing MCP servers the way the CLIs start them (stdio JSON-RPC): one tool each, lean, no
// instructions, a clean error when Hearth isn't running, and the opt-in wiring in engines.js (Claude and Astra,
// never by default, never for lean runs).   node dev/adobe-mcp-test.js
const fs = require('fs');
const path = require('path');
const F = require('./fake-common');

const root = path.join(__dirname, '..');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };
(async () => {
  for (const [file, tool, key, max] of [['adobe-mcp.js', 'adobe_do', 'adobeTools', 330], ['deploy-mcp.js', 'deploy_do', 'deployTools', 260]]) {
    const c = await F.mcpClient({ command: process.execPath, args: [path.join(root, 'mcp', file)], env: { HUB_CHAT_ID: 'test-chat' } });
    check(c.tools.map((t) => t.name).join(',') === tool, `${file}: one tool (${tool})`);
    check(!c.instructions, `${file}: no MCP instructions`);
    const cost = require(path.join(root, 'mcp', 'cost.js')).measure(key);
    check(cost.total < max, `${file}: tool list ≈ ${cost.total} tokens (< ${max})`);
    const r = await c.call(tool, { action: 'status' });
    check(r.isError && /not running|Couldn't reach/i.test(r.content[0].text), `${file}: without Hearth, a clean error (${r.content[0].text.slice(0, 50)})`);
    c.close();
  }
  const E = require(path.join(root, 'engines.js'))._test;
  const claude = { id: 'claude', name: 'Claude', engine: 'claude', mode: 'native' };
  check(!E.hubToolsets(claude).some((k) => k === 'adobeTools' || k === 'deployTools'), 'off by default (token frugality)');
  check(!E.hubToolsets({ id: 'td', engine: 'claude', dock: 'three', threeTools: true }).includes('deployTools'), 'off for the Three Director by default');
  check(E.hubToolsets({ ...claude, adobeTools: true, deployTools: true }).filter((k) => k === 'adobeTools' || k === 'deployTools').length === 2, 'on with agent.adobeTools / agent.deployTools');
  const cx = E.codexArgs({ id: 'astra', name: 'Astra', engine: 'codex', mode: 'native', deployTools: true, adobeTools: true, hubChatId: 'c1' }, {}, {}).join(' ');
  check(/mcp_servers\.deploy\.tool_timeout_sec=2700/.test(cx) && /mcp_servers\.adobe\.tool_timeout_sec=2700/.test(cx) && /deploy-mcp\.js/.test(cx), 'Astra (Codex) gets both servers with a long tool timeout (the owner\'s answer can take a while)');
  const src = fs.readFileSync(path.join(root, 'engines.js'), 'utf8');
  check(/adobeTools: false, deployTools: false/.test(src), 'lean runs drop them');
  const gb = fs.readFileSync(path.join(root, 'gamebridge.js'), 'utf8');
  check(/\/\^\(adobe\|deploy\)_\/\.test\(tool\)/.test(gb), 'the hub bridge waits long enough for them (asks, renders, uploads)');
  const map = require(path.join(root, 'mcp', 'hearth-map.js'));
  check(/ADOBE/.test(map.topic('photoshop')) && /PUBLISH/.test(map.topic('vercel')) && map.topic('deploy') === map.topic('publish'), 'app map: adobe and publish topics (+ aliases)');
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
