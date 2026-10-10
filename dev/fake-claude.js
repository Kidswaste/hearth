#!/usr/bin/env node
// Fake Claude Code CLI for development: speaks the same `-p --output-format stream-json --verbose
// --include-partial-messages` JSONL that engines.js parses (init, thinking / text deltas, tool_use, result with
// usage). Point Settings → Engines at it: settings.enginePaths.claude = "<hearth>/dev/fake-claude.js"
// (on Windows use dev/fake-claude.cmd). Keywords in the message pick the behavior: see dev/fake-common.js.
const F = require('./fake-common');

(async () => {
  const argv = process.argv.slice(2);
  // failure switches (fake-common.js): an old copy, signed out, too old for the model, network, MCP config
  const sw = F.switches();
  const version = sw.claudeVersion || '2.1.300';
  if (argv[0] === '--version') { console.log(`${version} (Claude Code) fake`); return; }
  // claudeNoAuth: an older Claude Code whose --help has no `auth` command
  if (argv[0] === '--help') { console.log(['Usage: claude [options] [command] [prompt]', '', 'Commands:', sw.claudeNoAuth ? null : '  auth              Manage authentication', '  mcp               Configure MCP servers', '  update            Check for updates and install'].filter((l) => l !== null).join('\n')); return; }
  if (argv[0] === 'auth' && sw.claudeNoAuth) { console.log('(fake) "auth" taken as a prompt: an old Claude Code'); process.exit(2); }
  if (argv[0] === 'auth' && argv[1] === 'status') {
    if (sw.claudeLoggedOut) { console.log('Not logged in. Run claude auth login'); process.exit(1); }
    console.log('Logged in (fake Claude Max account)'); return;
  }
  if (argv[0] === 'auth' || argv[0] === '/login') { F.setSwitch({ claudeLoggedOut: null }); console.log('(fake) signed in'); return; }
  if (argv[0] === 'update') { const to = sw.updateTo || '2.1.400'; F.setSwitch({ claudeVersion: to }); console.log(`Successfully updated from ${version} to version ${to}`); return; }
  // FAKE_CLAUDE_REJECT=--flag,--other acts like a Claude Code version that doesn't know those options
  const reject = (process.env.FAKE_CLAUDE_REJECT || '').split(',').find((f) => f && argv.includes(f));
  if (reject) { process.stderr.write(`error: unknown option '${reject}'\n`); process.exit(1); }
  // like the real CLI: a --mcp-config file that isn't there stops it before anything else
  const mcpAt = argv.indexOf('--mcp-config');
  if (mcpAt >= 0 && F.trip('claude-mcp', sw.claudeMcpMissing)) require('fs').rmSync(argv[mcpAt + 1], { force: true });
  if (mcpAt >= 0 && !require('fs').existsSync(argv[mcpAt + 1])) { process.stderr.write(`Error: Invalid MCP configuration:\nMCP config file not found: ${argv[mcpAt + 1]}\n`); process.exit(1); }
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const sessionId = arg('--resume') || arg('--session-id') || F.uuid();
  const model = arg('--model') || 'fake-opus';
  const prompt = await F.readStdin();
  if (F.trip('claude-network', sw.claudeNetwork)) { process.stderr.write('Error: getaddrinfo ENOTFOUND api.anthropic.com\n'); process.exit(1); }
  const tools = (arg('--allowedTools') || '').split(',').filter(Boolean);
  F.out({ type: 'system', subtype: 'init', session_id: sessionId, model, tools: ['Read', ...tools], mcp_servers: [], cwd: process.cwd() });
  const { p, thinking } = F.plan(prompt, 'claude');
  let { text } = F.plan(prompt, 'claude');
  const state = F.loadState(`claude-${sessionId}`);
  const wait = F.delayMs(p);

  if (sw.claudeLoggedOut) { F.out({ type: 'result', subtype: 'error', is_error: true, result: 'Invalid API key · Please run /login', session_id: sessionId }); return; }
  if (sw.claudeNeeds && F.older(version, sw.claudeNeeds)) { F.out({ type: 'result', subtype: 'error', is_error: true, result: `API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Claude Code version ${sw.claudeNeeds} or newer is required to use this model."}}`, session_id: sessionId }); return; }
  if (p.login) { F.out({ type: 'result', subtype: 'error', is_error: true, result: 'Invalid API key · Please run /login', session_id: sessionId }); return; }
  if (p.crash) { process.stderr.write('fake-claude: simulated crash\n'); process.exit(3); }

  F.out({ type: 'stream_event', event: { type: 'message_start', message: { id: `msg_${F.uuid()}`, model } }, session_id: sessionId });
  let index = 0;
  if (thinking) {
    F.out({ type: 'stream_event', event: { type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '' } } });
    for (const t of F.pieces(thinking)) { F.out({ type: 'stream_event', event: { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: t } } }); await F.sleep(wait); }
    F.out({ type: 'stream_event', event: { type: 'content_block_stop', index } });
    index += 1;
  }
  // `mcp`: real calls to the hub MCP servers from --mcp-config, with their results in the reply
  let mcpReport = '';
  if (p.mcp) {
    let servers = {};
    try { servers = JSON.parse(require('fs').readFileSync(arg('--mcp-config'), 'utf8')).mcpServers || {}; } catch { /* none given */ }
    const calls = p.mcpCalls || [['three_console', {}]];
    const lines = [];
    const clients = {};
    for (const [tool0, a0, fallback] of calls) {
      if (tool0 === 'sleep') { await F.sleep(Number(a0) || 0); continue; } // ["sleep", ms]: a pause between calls (a part that takes a while)
      let [tool, a] = [tool0, a0];
      const spec = F.serverFor(servers, tool);
      if (!spec) { lines.push(`${tool}: no server`); continue; }
      const key = JSON.stringify(spec);
      clients[key] ||= await F.mcpClient(spec);
      const c = clients[key];
      // [tool, args, [fallbackTool, args]]: what a director does when that tool isn't in its list (node tool off)
      if (fallback && !c.tools.some((t) => t.name === tool)) [tool, a] = fallback;
      if (!c.reported && (c.reported = true)) lines.push(`server ${spec.args?.[0]?.split(/[\\/]/).pop()}: ${c.tools.length} tools, list ${JSON.stringify(c.tools).length} chars, instructions ${c.instructions.length} chars`);
      const server = Object.keys(servers).find((k) => JSON.stringify(servers[k]) === key);
      const id = `toolu_${F.uuid().slice(0, 8)}`;
      F.out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: `mcp__${server}__${tool}`, input: a } ] }, session_id: sessionId });
      const r = await c.call(tool, a);
      const text = (r.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('\n');
      const imgs = (r.content || []).filter((x) => x.type === 'image').length;
      F.out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: Boolean(r.isError) }] }, session_id: sessionId });
      lines.push(`${tool}: ${r.isError ? 'ERROR ' : ''}${text.length} chars${imgs ? ` + ${imgs} image` : ''} · ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
    for (const c of Object.values(clients)) c.close();
    mcpReport = `\n\nMCP calls:\n${lines.map((l) => `- ${l}`).join('\n')}`;
  }
  const toolCalls = p.tools3 ? ['mcp__three__three_screenshot', 'mcp__three__three_eval', 'mcp__three__three_edit_code'] : p.tool ? ['mcp__claude_ai_Gmail__search_threads'] : [];
  for (const name of toolCalls) {
    const id = `toolu_${F.uuid().slice(0, 8)}`;
    F.out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input: { query: 'fake' } }] }, session_id: sessionId });
    await F.sleep(wait * 6);
    F.out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] }, session_id: sessionId });
  }
  if (p.error) { F.out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Fake engine error: the model is overloaded', session_id: sessionId }); return; }
  text += mcpReport;
  F.out({ type: 'stream_event', event: { type: 'content_block_start', index, content_block: { type: 'text', text: '' } } });
  for (const t of F.pieces(text)) { F.out({ type: 'stream_event', event: { type: 'content_block_delta', index, delta: { type: 'text_delta', text: t } } }); await F.sleep(wait); }
  F.out({ type: 'stream_event', event: { type: 'content_block_stop', index } });
  F.out({ type: 'assistant', message: { content: [{ type: 'text', text }] }, session_id: sessionId });
  // Input grows with the conversation; most of it comes from the cache after the first turn.
  state.turns += 1;
  state.chars += prompt.length + text.length;
  const input = p.big ? 125000 : 700 + Math.ceil(state.chars / 4);
  const output = Math.ceil((text.length + thinking.length) / 4);
  F.saveState(`claude-${sessionId}`, state);
  F.out({
    type: 'result', subtype: 'success', is_error: false, result: text, session_id: sessionId, num_turns: state.turns, duration_ms: 1234,
    usage: { input_tokens: 12, cache_creation_input_tokens: state.turns === 1 ? input - 12 : 40, cache_read_input_tokens: state.turns === 1 ? 0 : input - 52, output_tokens: output },
  });
})();
