#!/usr/bin/env node
// Opt-in real-model smoke check, in a temporary Hearth copy and an ephemeral Codex thread.
// node dev/codex-server-smoke.js --live [path/to/codex] [model]
if (!process.argv.includes('--live')) { console.log('Pass --live to send three tiny requests through your signed-in Codex account, including a read-only fixture tool.'); process.exit(0); }
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { Pool } = require('../codex-server');
const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-server-smoke-'));
for (const f of ['engines.js', 'codex-server.js', 'store.js', 'installs.js', 'winpolish.js']) fs.copyFileSync(path.join(root, f), path.join(dir, f));
fs.cpSync(path.join(root, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
const engines = require(path.join(dir, 'engines.js'));
const Win = require(path.join(dir, 'winpolish.js'));
const bin = process.argv[3] || engines.locate('codex');
const agent = { id: 'hearth-smoke', engine: 'codex', model: process.argv[4] || 'gpt-6-astra', effort: 'low', openTool: false, noHubTools: true, autoMemory: false };
const pool = new Pool({ spawn: Win.spawn, kill: p => p.kill(), requestMs: 60000, activeIdleMs: 60000 });
const timeout = setTimeout(() => { pool.stopAll(); console.error('Live smoke timed out'); process.exitCode = 1; }, 120000);
function run(text, session = {}, withTool = false) {
  const plan = engines._test.codexServerPlan(agent, session, {});
  plan.thread.ephemeral = true;
  if (withTool) {
    // The noHubTools fixture persona normally says tools are disabled; this test exposes one.
    plan.thread.baseInstructions = 'You are a test assistant. Use the available read-only notes_read tool when requested.';
    plan.servers.push('hearth_test');
    for (const [key, value] of Object.entries({ command: process.execPath, args: [path.join(__dirname, 'fake-mcp-server.js')], enabled_tools: ['notes_read'] })) {
      plan.args.push('-c', `mcp_servers.hearth_test.${key}=${JSON.stringify(value)}`);
    }
  }
  const deltas = []; const toolCalls = [];
  return new Promise(resolve => pool.run({ ...plan, chatId: 'smoke', bin, env: process.env, session, text, parser: engines._test.codexParser(session, agent) }, e => {
    if (e.type === 'delta') deltas.push(e.text);
    if (e.type === 'tool') toolCalls.push(e.name);
    if (['done', 'error', 'stopped'].includes(e.type)) resolve({ ...e, deltaCount: deltas.length, streamed: deltas.join(''), toolCalls });
  }));
}
(async () => {
  const first = await run('Without tools, reply with the integers 1 through 30, separated by spaces. No other text.');
  assert.equal(first.type, 'done', first.message); assert.equal(first.text, first.streamed); assert(first.deltaCount > 1, 'Expected incremental text events');
  console.log(JSON.stringify({ turn: 1, deltaCount: first.deltaCount, timing: first.timing, usage: first.usage }));
  const second = await run('What number ended your previous response? Reply with that number only, without tools.', first.session);
  assert.equal(second.type, 'done', second.message); assert.equal(second.text.trim(), '30'); assert(second.timing.connectionReused);
  console.log(JSON.stringify({ turn: 2, text: second.text, deltaCount: second.deltaCount, timing: second.timing, usage: second.usage }));
  // A separate ephemeral thread validates actual MCP events, using only a static in-memory note.
  const third = await run('Use hearth_test notes_read to read the note named hello. Reply only with its contents.', {}, true);
  assert.equal(third.type, 'done', third.message); assert(third.toolCalls.some(name => name.includes('notes_read')), `Expected a real MCP tool event: ${JSON.stringify({ text: third.text, tools: third.toolCalls })}`);
  assert(third.text.includes('Hello from the fake server.'));
  console.log(JSON.stringify({ turn: 3, toolCalls: third.toolCalls, timing: third.timing }));
  console.log('Live streaming, warm conversation continuity and read-only MCP passed.');
})().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => { clearTimeout(timeout); pool.stopAll(); });
