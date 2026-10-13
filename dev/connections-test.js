#!/usr/bin/env node
// Connections (round 26), Node only: server names, what each engine gets (Claude's --mcp-config file and tool rules,
// Codex's -c overrides), read only vs full, env values kept out of prompts and masked in the shown command line, the
// Test (dev/fake-mcp-server.js: works / crashes / never answers / not installed, and a local HTTP MCP server), and
// real runs of the fake CLIs calling a tool of the owner's connection.
// engines.js + store.js + connectionsmain.js + mcp/ are copied to a temp folder so nothing touches a real data/ folder.
//   node dev/connections-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
let passed = 0;
const ok = (name) => { passed += 1; console.log(`✓ ${name}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'connections-engine-'));
for (const f of ['engines.js', 'store.js', 'installs.js', 'access-rules.js', 'connectionsmain.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
const C = require(path.join(dir, 'connectionsmain.js'));
const engines = require(path.join(dir, 'engines.js'));
const FAKE_CLAUDE = path.join(__dirname, 'fake-claude.js');
const FAKE_CODEX = path.join(__dirname, 'fake-codex.js');
const SERVER = path.join(__dirname, 'fake-mcp-server.js');
engines.setEnginePaths({ claude: FAKE_CLAUDE, codex: FAKE_CODEX });
const T = engines._test;
T.loadDropped(FAKE_CLAUDE);
const after = (args, flag) => args[args.indexOf(flag) + 1];
const SECRET = 'sk-test-0123456789';

const notes = { id: 'c1', name: 'Notes', kind: 'stdio', command: process.execPath, args: [SERVER], env: { FAKE_MCP_TOKEN: SECRET, 'bad name': 'x' }, tools: [{ n: 'notes_list', ro: true }, { n: 'notes_read', ro: true }, { n: 'notes_write', ro: false }, { n: 'notes_env', ro: true }], tokens: 180 };
const web = { id: 'c2', name: 'Three', kind: 'http', url: 'https://example.com/mcp', headers: { Authorization: `Bearer ${SECRET}` } };
const off = { id: 'c3', name: 'Broken', kind: 'stdio', command: '' };
let LIST = [notes, web, off];
C.setReader(() => ({ connections: LIST }));
const claude = { id: 'claude', name: 'Claude', mode: 'native', engine: 'claude' };
const astra = { id: 'astra', name: 'Astra', mode: 'native', engine: 'codex' };

(async () => {
  // ---------- names ----------
  const names = C.serverNames([notes, web, { id: 'c4', name: 'Notes' }, { id: 'c5', name: 'My files!' }]);
  assert.deepStrictEqual([...names.values()], ['notes', 'my_three', 'notes_2', 'my_files']);
  ok('server names: a slug, unique, never one of Hearth\'s own (three → my_three)');

  // ---------- nothing on: nothing changes ----------
  const base = T.claudeArgs(claude, {}, {});
  assert.deepStrictEqual(C.enabledFor(claude), []);
  assert.strictEqual(T.buildPrompt({ ...claude, connections: {} }), T.buildPrompt(claude));
  assert(!T.codexArgs(astra, {}, {}).some((a) => /mcp_servers\.notes/.test(a)));
  assert(!base.join(' ').includes('notes'));
  ok('no connection on: the same flags and prompt as before (no tokens added)');

  // ---------- Claude ----------
  const full = { ...claude, connections: { c1: 'full', c2: 'read', c3: 'full', gone: 'full' } };
  const fa = T.claudeArgs(full, {}, {});
  const cfg = JSON.parse(fs.readFileSync(after(fa, '--mcp-config'), 'utf8'));
  assert.strictEqual(cfg.mcpServers.notes.command, process.execPath);
  assert.deepStrictEqual(cfg.mcpServers.notes.args, [SERVER]);
  assert.strictEqual(cfg.mcpServers.notes.env.FAKE_MCP_TOKEN, SECRET, 'the env value reaches the server');
  assert(!('bad name' in cfg.mcpServers.notes.env) && cfg.mcpServers.notes.env.PATH, 'bad env names dropped; a PATH that finds node / python');
  assert.deepStrictEqual(cfg.mcpServers.my_three, { type: 'http', url: web.url, headers: { Authorization: `Bearer ${SECRET}` } });
  assert(cfg.mcpServers.chat, 'the hub tool sets stay');
  assert(!cfg.mcpServers.broken, 'a connection without a command is skipped');
  const allowed = after(fa, '--allowedTools').split(',');
  assert(allowed.includes('mcp__notes'), 'Full: the whole server');
  assert(!allowed.some((t) => t.startsWith('mcp__my_three')), 'Read only, never tested: nothing pre-approved');
  const prompt = T.buildPrompt(full);
  assert(!prompt.includes(SECRET) && !/You have no tools/.test(T.buildPrompt({ ...claude, chatTools: false, connections: { c1: 'full' } })));
  assert(!fa.some((a) => a.includes(SECRET)), 'the secret is in the config file only, not on the command line');
  const ro = T.claudeArgs({ ...claude, connections: { c1: 'read' } }, {}, {});
  assert.deepStrictEqual(after(ro, '--allowedTools').split(',').filter((t) => t.startsWith('mcp__notes')), ['mcp__notes__notes_list', 'mcp__notes__notes_read', 'mcp__notes__notes_env']);
  assert.strictEqual(after(ro, '--disallowedTools'), 'mcp__notes__notes_write');
  // a plain chat with no hub tools at all still gets the file
  const lone = T.claudeArgs({ ...claude, chatTools: false, connections: { c1: 'full' } }, {}, {});
  assert(lone.includes('--mcp-config') && lone.includes('--strict-mcp-config'));
  assert.deepStrictEqual(C.enabledFor({ ...full, noHubTools: true }), [], 'one-off calls (second opinions) get none');
  ok('Claude: in the same --mcp-config file as the hub tool sets; Full allows the server, Read only its looking tools; env never in the prompt');

  // ---------- Codex ----------
  const ca = T.codexArgs({ ...astra, connections: { c1: 'read', c2: 'full' } }, {}, {});
  const j = ca.join('\n');
  assert(j.includes(`mcp_servers.notes.command=${JSON.stringify(process.execPath)}`));
  assert(j.includes(`mcp_servers.notes.args=[${JSON.stringify(SERVER)}]`));
  assert(/mcp_servers\.notes\.env=\{ PATH="[^"]*", FAKE_MCP_TOKEN="sk-test-0123456789" \}/.test(j));
  assert(j.includes('mcp_servers.notes.enabled_tools=["notes_list", "notes_read", "notes_env"]'), 'Read only: the looking tools');
  assert(j.includes('mcp_servers.my_three.url="https://example.com/mcp"') && j.includes('mcp_servers.my_three.http_headers={ Authorization="Bearer sk-test-0123456789" }'));
  assert(!j.includes('mcp_servers.my_three.enabled_tools'), 'Full: every tool');
  assert(j.includes('mcp_servers.notes.default_tools_approval_mode="approve"') && j.includes('mcp_servers.notes.startup_timeout_sec=60'));
  assert(!T.buildPrompt({ ...astra, connections: { c1: 'full' } }).includes(SECRET));
  const masked = C.maskArgs(ca).join('\n');
  assert(!masked.includes(SECRET) && masked.includes('••••'));
  ok('Codex: -c mcp_servers overrides (stdio and URL), Read only → enabled_tools, pre-approved like hub tools; shown args masked');

  // ---------- Test ----------
  const good = await C.test(notes);
  assert(good.ok && good.server === 'fake-notes', JSON.stringify(good));
  assert.deepStrictEqual(good.tools.map((t) => `${t.n}:${t.ro ? 'ro' : 'rw'}`), ['notes_list:ro', 'notes_read:ro', 'notes_write:rw', 'notes_env:ro']);
  assert(good.tokens > 50 && good.tokens < 400, `tokens ${good.tokens}`);
  const crash = await C.test({ ...notes, args: [SERVER, '--crash'] });
  assert(!crash.ok && /stopped before answering \(exit 2\)/.test(crash.error) && /missing folder/.test(crash.hint), JSON.stringify(crash));
  const mute = await C.test({ ...notes, args: [SERVER, '--mute'] }, { ms: 1200 });
  assert(!mute.ok && /No answer in 1 s/.test(mute.error), JSON.stringify(mute));
  const none = await C.test({ id: 'x', name: 'x', command: 'uvx-not-here-hearth', args: [] });
  assert(!none.ok && /isn't on this computer/.test(none.error), JSON.stringify(none));
  const npx = await C.test({ id: 'x', name: 'x', command: '/no/such/npx', args: [] });
  assert(!npx.ok && /Node\.js/.test(npx.hint), JSON.stringify(npx));
  ok(`Test: lists tools (read only from annotations / names), ≈ ${good.tokens} tokens; clear errors when it crashes, hangs or isn't installed`);

  // a local HTTP MCP server (JSON and event-stream answers, a session id, a sign-in refusal)
  let sawSession = false;
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => { body += d; }); req.on('end', () => {
      if (req.url === '/locked') { res.writeHead(401); res.end(); return; }
      const m = JSON.parse(body);
      if (m.method !== 'initialize' && req.headers['mcp-session-id'] === 'S1') sawSession = true;
      if (m.id == null) { res.writeHead(202); res.end(); return; }
      const result = m.method === 'initialize' ? { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'web-fake' } } : { tools: [{ name: 'search_docs', description: 'Search', inputSchema: { type: 'object' } }, { name: 'post_note', description: 'Post', inputSchema: { type: 'object' } }] };
      const msg = JSON.stringify({ jsonrpc: '2.0', id: m.id, result });
      if (m.method === 'tools/list') { res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': 'S1' }); res.end(`event: message\ndata: ${msg}\n\n`); } else { res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'S1' }); res.end(msg); }
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const at = `http://127.0.0.1:${srv.address().port}`;
  const h = await C.test({ id: 'h', name: 'web', kind: 'http', url: `${at}/mcp` });
  assert(h.ok && h.server === 'web-fake' && h.tools.map((t) => `${t.n}:${t.ro ? 'ro' : 'rw'}`).join() === 'search_docs:ro,post_note:rw' && sawSession, JSON.stringify(h));
  const locked = await C.test({ id: 'h', name: 'web', kind: 'http', url: `${at}/locked` });
  assert(!locked.ok && /sign-in/.test(locked.error), JSON.stringify(locked));
  srv.close();
  const nobody = await C.test({ id: 'h', name: 'web', kind: 'http', url: 'http://127.0.0.1:9/mcp' }, { ms: 3000 });
  assert(!nobody.ok && /Nothing answers/.test(nobody.error), JSON.stringify(nobody));
  ok('Test over HTTP: JSON and event-stream answers, the session id, a sign-in refusal, nothing at that address');

  // ---------- real runs of the fake CLIs ----------
  const run = (agent, text) => new Promise((resolve) => {
    const events = [];
    engines.send({ agent, chatId: `chat-${agent.engine}`, session: {}, text, options: {} }, (e) => { events.push(e); if (!['delta', 'tool', 'thinking', 'progress'].includes(e.type)) resolve(events.filter((x) => x.type === 'delta').map((x) => x.text).join('')); });
  });
  const ask = 'mcp: [["notes_read", {"name": "hello"}], ["notes_env", {}]]';
  const rc = await run({ ...claude, chatTools: false, connections: { c1: 'full' } }, ask);
  assert(/notes_read: .*Hello from the fake server/.test(rc) && /notes_env: .*token set \(18 chars\)/.test(rc), rc);
  const rx = await run({ ...astra, connections: { c1: 'read' } }, ask);
  assert(/servers: .*notes/.test(rx) && /Hello from the fake server/.test(rx) && /token set/.test(rx), rx);
  ok('fake Claude and fake Codex call the connection\'s tools for real (env value reached the server, not the chat)');

  console.log(`\n${passed} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
