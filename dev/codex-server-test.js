#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Pool, legacyItem } = require('../codex-server');
const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-server-'));
const fixture = path.join(__dirname, 'fake-codex-server.js');
const logs = [];
const pool = new Pool({ spawn, kill: (p) => p.kill(), idleMs: 30000, requestMs: 2000, log: (s) => logs.push(s) });
const parse = (msg) => msg.type === 'item.started' ? { type: 'tool', name: msg.item.type, id: msg.item.id }
  : msg.type === 'item.completed' ? { type: 'step', id: msg.item.id, ok: true } : null;
const plan = { bin: process.execPath, args: [fixture], cwd: dir, env: { ...process.env, HEARTH_SERVER_TEST_DIR: dir },
  thread: { model: 'test', sandbox: 'read-only', approvalPolicy: 'never' }, turn: {}, servers: [], parser: parse };
function turn(chatId, text, session = {}, extra = {}, onEvent) {
  return new Promise((resolve, reject) => {
    const events = []; const live = []; const start = Date.now();
    const timeout = setTimeout(() => reject(new Error('Test timed out')), 6000);
    pool.run({ ...plan, chatId, text, session, ...extra }, (e) => {
      events.push({ ...e, receivedMs: Date.now() - start }); onEvent?.(e);
      if (['done', 'error', 'stopped'].includes(e.type)) { clearTimeout(timeout); resolve({ end: e, events, live }); }
    }, (e) => live.push(e));
  });
}
const trace = () => fs.readFileSync(path.join(dir, 'trace.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
let checks = 0;
function ok(text) { console.log(`✓ ${text}`); checks++; }
(async () => {
  let a = await turn('a', 'hello');
  assert.equal(a.end.type, 'done'); assert.equal(a.end.text, 'Hello 🌱');
  assert.equal(a.events.filter(e => e.type === 'delta').map(e => e.text).join(''), a.end.text);
  assert(a.events.find(e => e.type === 'delta').receivedMs + 100 < a.events.at(-1).receivedMs);
  assert(a.end.timing.firstTextMs < a.end.timing.totalMs); assert(a.end.timing.setupMs <= a.end.timing.firstTextMs);
  assert(a.live.some(e => e.type === 'step')); assert.deepStrictEqual(a.end.usage, { input: 100, output: 20, cached: 50, reasoning: 5, contextInput: 10 });
  ok('partial text arrives before completion, UTF-8 survives, final text is not duplicated, tools and timings arrive');
  const b = await turn('a', 'again', a.end.session);
  assert(b.end.timing.connectionReused); assert.equal(b.end.session.id, a.end.session.id); assert.equal(b.end.usage.input, 100);
  assert.equal(trace().filter(x => x.start).length, 1); assert.equal(trace().filter(x => x.method === 'initialize').length, 1);
  assert.equal(trace().filter(x => x.method === 'thread/start').length, 1);
  assert(trace().find(x => x.method === 'thread/start').params.config['mcp_servers.unrelated.enabled'] === false);
  ok('second turn reuses process/thread; inherited unrelated MCP is disabled; cumulative usage becomes per-turn');
  const multi = await turn('multi', 'MULTI');
  assert.equal(multi.end.usage.input, 200); assert.equal(multi.end.usage.cached, 100);
  assert.equal(multi.end.usage.contextInput, 10, 'Final context is not the sum across model calls');
  assert.equal(multi.end.usage.output, 40, 'Duplicate notifications must not add usage twice');
  const resumed = await turn('resume-baseline', 'hello', { id: 'with-baseline' });
  assert.equal(resumed.end.usage.input, 100, 'Saved thread baseline must not be billed to the new turn');
  const warmMulti = await turn('multi', 'hello', multi.end.session);
  assert.equal(warmMulti.end.usage.input, 100);
  ok('multiple model calls, duplicate usage updates, and a saved baseline keep per-turn traffic separate from context');
  const pair = await Promise.all([turn('a', 'again', b.end.session), turn('b', 'hello')]);
  assert(pair.every(x => x.end.text === 'Hello 🌱')); assert.notEqual(pair[0].end.session.id, pair[1].end.session.id);
  assert.equal(trace().filter(x => x.start).length, 4);
  ok('parallel chats have separate processes and cannot receive each other’s text');
  const stopped = turn('a', 'WAIT', pair[0].end.session);
  await new Promise(r => setTimeout(r, 100)); assert(pool.stop('a'));
  assert.equal((await stopped).end.type, 'stopped');
  a = await turn('a', 'hello', pair[0].end.session); assert(a.end.timing.connectionReused);
  ok('Stop interrupts only the current turn and the next turn keeps the connection');
  const crashed = await turn('a', 'CRASH', a.end.session); assert.equal(crashed.end.type, 'error');
  assert(crashed.events.some(x => x.text === 'Partial')); assert(/not replayed/.test(crashed.end.message));
  const before = trace().filter(x => x.method === 'turn/start').length;
  await new Promise(r => setTimeout(r, 100)); assert.equal(trace().filter(x => x.method === 'turn/start').length, before);
  a = await turn('a', 'hello', crashed.end.session); assert.equal(a.end.type, 'done'); assert(!a.end.timing.connectionReused); assert.equal(a.end.usage.input, 100, 'Reloaded server may reset token totals');
  assert(trace().some(x => x.method === 'thread/resume' && x.params.threadId === crashed.end.session.id));
  ok('crash preserves partial text, does not replay work, and next turn reconnects/resumes');
  const lost = await turn('lost', 'latest', { id: 'missing' }, { fallbackText: 'saved conversation plus latest' });
  assert.equal(lost.end.type, 'done'); assert.notEqual(lost.end.session.id, 'missing');
  assert(trace().some(x => x.method === 'turn/start' && x.params.input[0].text === 'saved conversation plus latest'));
  ok('missing saved session starts once with supplied conversation context');
  const approved = await turn('b', 'APPROVAL', pair[1].end.session);
  assert.equal(approved.end.type, 'done'); assert(trace().some(x => x.id === 'ask-1' && x.result?.decision === 'decline'));
  const failed = await turn('b', 'FAIL', approved.end.session); assert.equal(failed.end.type, 'error');
  ok('unexpected approvals are declined and failed turns are never reported as success');
  const bad = await turn('bad', 'BADJSON'); assert.equal(bad.end.type, 'error'); assert(/Invalid JSON/.test(bad.end.message));
  const unacked = await turn('unacked', 'NOACK'); assert.equal(unacked.end.type, 'error'); assert(/timed out/.test(unacked.end.message));
  ok('malformed protocol and missing RPC response fail promptly without replay');
  const waiting = turn('busy', 'WAIT');
  await new Promise(r => setTimeout(r, 100));
  const duplicate = await turn('busy', 'hello'); assert.equal(duplicate.end.type, 'error'); assert(pool.active.has('busy'));
  pool.stop('busy'); assert.equal((await waiting).end.type, 'stopped');
  pool.idleMs = 30; await turn('idle', 'hello'); await new Promise(r => setTimeout(r, 80)); assert(!pool.connections.has('idle')); pool.idleMs = 30000;
  ok('duplicate sends cannot replace active work; idle connections are reclaimed');
  const once = await turn('once-check', 'hello'); assert.equal(once.end.type, 'done'); assert(!pool.connections.has('once-check'));
  const changed = await turn('a', 'hello', a.end.session, { args: [fixture, '--changed-tools'] }); assert(!changed.end.timing.connectionReused);
  const early = turn('early', 'WAIT'); pool.stop('early'); assert.equal((await early).end.type, 'stopped');
  pool.stopAll(); assert.equal(pool.connections.size, 0); assert.equal(pool.active.size, 0);
  ok('tool/config changes restart safely; one-off calls and early Stop clean up their processes');

  // Exercise the real engines.send boundary in a temp copy, including batching and usage writes.
  const copy = path.join(dir, 'app'); fs.mkdirSync(copy);
  for (const f of ['engines.js', 'codex-server.js', 'codex-workspace.js', 'codex-usage.js', 'codex-capabilities.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'connectionsmain.js']) fs.copyFileSync(path.join(root, f), path.join(copy, f));
  fs.cpSync(path.join(root, 'mcp'), path.join(copy, 'mcp'), { recursive: true });
  const engines = require(path.join(copy, 'engines.js')); engines.setEnginePaths({ codex: fixture });
  const agent = { id: 'astra', engine: 'codex', model: 'gpt-6-astra', effort: 'high', openTool: false };
  const firstEvents = []; const batch = engines._test.batched(e => firstEvents.push(e));
  batch({ type: 'thinking', text: 'Think' }); batch({ type: 'delta', text: 'First' });
  assert.equal(firstEvents.at(-1).text, 'First', 'First visible text must bypass the batching timer');
  batch({ type: 'delta', text: ' second' }); batch({ type: 'done' });
  assert.equal(firstEvents.map(e => e.text || '').join(''), 'ThinkFirst second');
  const p = engines._test.codexServerPlan(agent, {}, {});
  const deepest = engines._test.codexServerPlan({ ...agent, effort: 'max', verbosity: 'low' }, {}, {});
  assert.equal(deepest.turn.effort, 'max'); assert(deepest.args.includes('model_verbosity="low"'));
  assert.equal(p.args[0], 'app-server'); assert(!p.args.includes('--ignore-user-config')); assert.equal(p.turn.sandboxPolicy.type, 'readOnly');
  const edit = engines._test.codexServerPlan({ ...agent, workspace: copy, codexFiles: 'edit' }, {}, { images: ['test.png'] });
  assert.equal(edit.turn.sandboxPolicy.networkAccess, false); assert.deepStrictEqual(edit.turn.sandboxPolicy.writableRoots, [copy]);
  assert.equal(edit.turn.input[0].type, 'localImage');
  const conns = require(path.join(copy, 'connectionsmain.js'));
  conns.setReader(() => ({ connections: [{ id: 'remote', name: 'Remote', kind: 'http', url: 'https://example.com/mcp' }] }));
  const remote = engines._test.codexServerPlan({ ...agent, connections: { remote: 'full' } }, {}, {});
  assert(remote.servers.includes('remote'), 'HTTP MCP must not be disabled as an inherited server');
  const open = engines._test.codexServerPlan({ ...agent, astraNoSandbox: true, access: { level: 'write', folders: [copy] } }, {}, {});
  assert.equal(open.turn.sandboxPolicy.type, 'dangerFullAccess'); assert.equal(open.cwd, copy);
  const readOnly = engines._test.codexServerPlan({ ...agent, astraNoSandbox: true, access: { level: 'read', folders: [copy] } }, {}, {});
  assert.equal(readOnly.turn.sandboxPolicy.type, 'readOnly', 'Read access never becomes unsandboxed');
  const adapterEvents = [];
  const runEngine = (session = {}, text = 'hello') => new Promise(resolve => engines.send({ agent, chatId: 'integration', session, text }, e => { adapterEvents.push(e); if (['done', 'error', 'stopped'].includes(e.type)) resolve(e); }));
  const pending = runEngine(); assert.equal(engines.busy(), 1);
  let result = await pending; assert.equal(result.type, 'done', result.message); result = await runEngine(result.session); assert(result.timing.connectionReused);
  result = await runEngine(result.session, 'BLOCKED'); assert.equal(result.type, 'done');
  assert(!adapterEvents.some(e => e.type === 'blocked'), 'Internal parser events must not end the UI turn');
  assert(adapterEvents.some(e => e.type === 'thinking' && /blocked by the current permissions/.test(e.text)));
  assert.equal(legacyItem({ type: 'fileChange', status: 'declined' }).status, 'failed');
  assert.equal(engines.busy(), 0); engines.stopAll();
  ok('default engines.send uses app-server; sandbox/image settings survive; warm turns work through the real adapter');
  console.log(`\n${checks} groups passed. Test artifacts: ${dir}`);
})().catch(err => { console.error(err); pool.stopAll(); process.exitCode = 1; });
