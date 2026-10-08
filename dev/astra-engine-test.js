#!/usr/bin/env node
// Engine tests for Astra (Codex) and the shared send() plumbing, run with plain Node against the fake engines
// (dev/fake-codex-astra.js, dev/fake-claude-astra.js). engines.js + store.js are copied to a temp folder so the
// test never writes into a real data/ folder.   node dev/astra-engine-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-engine-'));
for (const f of ['engines.js', 'store.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
const engines = require(path.join(dir, 'engines.js'));
engines.setEnginePaths({ codex: path.join(__dirname, 'fake-codex-astra.js'), claude: path.join(__dirname, 'fake-claude-astra.js') });
const T = engines._test;
const lastArgs = (name) => JSON.parse(fs.readFileSync(path.join(os.tmpdir(), name, 'last-args.json'), 'utf8'));

const astra = { id: 'astra', name: 'Astra', mode: 'native', engine: 'codex', model: 'gpt-6-astra', effort: 'high' };
const claude = { id: 'claude', name: 'Claude', mode: 'native', engine: 'claude', model: 'opus' };
let passed = 0;
const ok = (name) => { passed += 1; console.log(`✓ ${name}`); };

// Runs one turn and collects its events.
function turn(agent, text, session = {}, options = {}, onStart) {
  return new Promise((resolve) => {
    const events = [];
    const chatId = `t-${Math.random().toString(36).slice(2)}`;
    engines.send({ agent, chatId, session, text, options }, (e) => {
      events.push(e);
      if (!['delta', 'tool', 'thinking', 'progress'].includes(e.type)) resolve({ events, end: e, text: events.filter((x) => x.type === 'delta').map((x) => x.text).join('') });
    });
    onStart?.(chatId);
  });
}

(async () => {
  // ---- argument building
  const a1 = T.codexArgs(astra, {}, {});
  assert(a1.includes('--ignore-user-config') && a1.includes('--ignore-rules') && a1.includes('--skip-git-repo-check'));
  assert(a1.includes('shell_tool') && a1.includes('web_search="disabled"') && a1.join(' ').includes('-s read-only'));
  assert(!a1.some((x) => /mcp_servers/.test(x)), 'no MCP for a plain Astra');
  ok('Astra keeps the frugal flags (no user config, features off, no web, no MCP, read-only)');
  const a2 = T.codexArgs(astra, { id: 'abc' }, { effort: 'xhigh', webSearch: 'live', model: 'gpt-6-luna', images: ['/x.png'] });
  assert.deepStrictEqual(a2.slice(0, 3), ['exec', 'resume', 'abc']);
  assert(a2.includes('model_reasoning_effort="xhigh"') && a2.includes('web_search="live"') && a2.includes('gpt-6-luna') && a2.includes('/x.png'));
  assert(!a2.includes('-C'), 'resume runs keep their session folder');
  ok('per-chat effort / web search / model / images reach codex exec resume');
  assert(!T.codexArgs({ ...astra, effort: 'max' }, {}, {}).some((x) => /reasoning_effort/.test(x)), 'unknown effort is dropped');
  ok('an effort Codex does not know is dropped instead of failing');
  assert(T.codexArgs(astra, {}, { effort: 'minimal', webSearch: 'cached' }).includes('model_reasoning_effort="low"'));
  ok('minimal effort with web search on becomes low (they don\'t mix)');
  const feat = T.codexArgs({ ...astra, codexFeatures: ['view_image'] }, {}, {});
  assert(!feat.includes('view_image') && feat.includes('image_generation'));
  ok('a Codex feature switched back on per agent is no longer disabled (the others stay off)');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "astra o'folder-"));
  const ro = T.codexArgs({ ...astra, workspace: folder }, {}, {});
  assert(!ro.includes('shell_tool') && ro.includes('sandbox_mode="read-only"') && !ro.some((x) => /writable_roots/.test(x)));
  const ed = T.codexArgs({ ...astra, workspace: folder, codexFiles: 'edit' }, { id: 'z' }, {});
  assert(ed.includes('sandbox_mode="workspace-write"') && ed.includes(`sandbox_workspace_write.writable_roots=[${JSON.stringify(folder)}]`) && ed.includes('sandbox_workspace_write.network_access=false'));
  ok('opt-in file access: read-only sandbox, or writes only inside the folder (paths with quotes survive)');
  const dir2 = T.codexArgs({ ...astra, threeTools: true, chatTools: true }, {}, {});
  assert(dir2.some((x) => /^mcp_servers\.three\.command=/.test(x)) && dir2.some((x) => /^mcp_servers\.chat\.env=\{ELECTRON_RUN_AS_NODE="1",HUB_AGENT_ID="astra"\}$/.test(x)));
  ok('a director (three tools) and talk-back tools run on Codex through MCP config overrides');
  assert(T.hubToolsets(claude).includes('chatTools') && !T.hubToolsets(astra).includes('chatTools'));
  ok('talk-back tools stay on by default for Claude, opt-in for Astra');
  const p = T.buildPrompt({ ...astra, chatTools: true });
  assert(/second opinion from Claude/.test(p) && /second opinion from Astra/.test(T.buildPrompt(claude)));
  ok('second opinions point at the other engine');
  assert(/<suggest>/.test(T.buildPrompt({ ...astra, suggestNext: true })) && !/<suggest>/.test(T.buildPrompt(astra)));
  ok('next-step suggestions are opt-in for Astra');
  const c1 = T.claudeArgs(claude, {}, { effort: 'low' });
  assert(c1.includes('--effort') && c1[c1.indexOf('--effort') + 1] === 'low' && c1.includes('--tools') && c1.includes('--strict-mcp-config'));
  ok('Claude flags unchanged (per-chat effort only replaces the value)');
  const s = T.codexArgs({ ...astra, showThinking: false, verbosity: 'low' }, {}, {});
  assert(s.includes('model_reasoning_summary="none"') && s.includes('model_verbosity="low"'));
  ok('thinking summaries off / verbosity are opt-in config');

  // ---- parser
  const st = {};
  const parse = T.codexParser(st, astra);
  parse({ type: 'thread.started', thread_id: 'th' });
  assert.strictEqual(st.id, 'th');
  assert.deepStrictEqual(parse({ type: 'item.updated', item: { id: 'm', type: 'agent_message', text: 'Hel' } }), { type: 'delta', text: 'Hel' });
  assert.deepStrictEqual(parse({ type: 'item.completed', item: { id: 'm', type: 'agent_message', text: 'Hello' } }), { type: 'delta', text: 'lo' });
  assert.strictEqual(parse({ type: 'item.started', item: { type: 'command_execution', command: 'ls -la' } }).name, 'Shell · ls -la');
  assert.strictEqual(parse({ type: 'item.updated', item: { type: 'todo_list', items: [{ text: 'a', completed: true }] } }).steps[0].status, 'done');
  assert.strictEqual(parse({ type: 'error', message: 'Reconnecting... 1/5' }).type, 'thinking');
  const d1 = parse({ type: 'turn.completed', usage: { input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 100 } });
  const d2 = parse({ type: 'turn.completed', usage: { input_tokens: 11000, cached_input_tokens: 9000, output_tokens: 160 } });
  assert.deepStrictEqual([d2.usage.input, d2.usage.output, d2.usage.cached], [6000, 60, 5000]);
  const d3 = parse({ type: 'turn.completed', usage: { input_tokens: 5200, output_tokens: 40 } });
  assert.deepStrictEqual([d3.usage.input, d3.usage.output], [5200, 40]);
  assert(d1.usage.input === 5000);
  ok('parser: streamed message deltas, shell/plan items, retries, cumulative→delta tokens, per-turn fallback');
  assert(/Fix:/.test(T.friendlyError('codex', "The 'x' model is not supported when using Codex with a ChatGPT account.").message));
  assert(T.friendlyError('codex', 'Error: not logged in').needsLogin);
  assert(/limit/.test(T.friendlyError('codex', "You've hit your usage limit").fix));
  assert(T.LOST_SESSION.test('Error: no rollout found for thread id 1') && T.LOST_SESSION.test('No conversation found with session ID: x'));
  ok('errors come with fixes (model, limits, login, lost sessions)');

  // ---- real runs against the fake engines
  let r = await turn(astra, 'hello there');
  assert.strictEqual(r.end.type, 'done');
  assert(/Astra here \(gpt-6-astra, effort high\)/.test(r.text) && r.end.text === r.text);
  const session = r.end.session;
  assert(session.id && session.totals.input > 0);
  ok('a turn streams and finishes with a session and usage');
  r = await turn(astra, 'second turn', session);
  assert(r.end.type === 'done' && r.end.usage.input < r.end.session.totals.input);
  ok(`resumed turn shows only its own tokens (${r.end.usage.input} of ${r.end.session.totals.input})`);
  r = await turn(astra, 'third TOOL turn REMEMBER', r.end.session);
  assert(r.events.some((e) => e.type === 'progress') && r.events.some((e) => e.type === 'tool' && /Shell/.test(e.name)) && /<remember>/.test(r.end.text));
  ok('tools, plans and <remember> come through');
  r = await turn(astra, 'old codex NOID NONEWLINE');
  assert(r.end.type === 'done' && /Astra here/.test(r.end.text));
  ok('older Codex output and a last line without newline still finish');
  r = await turn(astra, 'model FAIL');
  assert(r.end.type === 'error' && /Fix:/.test(r.end.message));
  ok('a failed turn surfaces the error with a fix');
  r = await turn(astra, 'continue', { id: 'gone-thread' }, { fallbackText: 'Here is our earlier conversation… continue' });
  assert(r.end.type === 'done' && r.events.some((e) => e.type === 'thinking' && /couldn't be resumed/.test(e.text)) && r.end.session.id !== 'gone-thread');
  ok('a lost Codex session continues in a fresh one with the conversation as context');
  r = await turn(claude, 'continue', { id: 'gone-claude' }, { fallbackText: 'context + continue' });
  assert(r.end.type === 'done' && /Claude here/.test(r.end.text));
  ok('a lost Claude session too');
  const t0 = Date.now();
  r = await turn(astra, 'SLOW please', {}, {}, (id) => setTimeout(() => engines.stop(id), 700));
  assert(r.end.type === 'stopped' && Date.now() - t0 < 8000 && r.end.session.id);
  ok('Stop ends a run as stopped and keeps its session id');
  r = await turn({ ...astra, systemPrompt: 'orig' }, 'hi', {}, { persona: 'You are a strict reviewer.', lean: true });
  const args = lastArgs('fake-codex-astra');
  const file = args.configs.model_instructions_file.replace(/^"|"$/g, '').replace(/\\\\/g, '\\');
  assert(/strict reviewer/.test(fs.readFileSync(file, 'utf8')));
  ok('a persona run writes its own instructions file');
  const once = await engines.once({ agent: astra, text: 'quick question', options: { lean: true, effort: 'low' } });
  assert(once.ok && /effort low/.test(once.text) && once.usage);
  ok('once() returns text and usage with per-run options');
  const doc = await engines.doctor();
  assert(doc.codex.found && /fake/.test(doc.codex.version) && doc.codex.loggedIn === true && doc.claude.found);
  ok('doctor reports path, version and sign-in');
  console.log(`\n${passed} checks passed`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((err) => { console.error('✖', err); process.exit(1); });
