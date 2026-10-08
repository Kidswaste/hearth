#!/usr/bin/env node
// Fake Claude Code CLI for development: speaks the same `-p --output-format stream-json --verbose
// --include-partial-messages` JSONL that engines.js parses (init, thinking / text deltas, tool_use, result with
// usage). Point Settings → Engines at it: settings.enginePaths.claude = "<hearth>/dev/fake-claude.js"
// (on Windows use dev/fake-claude.cmd). Keywords in the message pick the behavior: see dev/fake-common.js.
const F = require('./fake-common');

(async () => {
  const argv = process.argv.slice(2);
  if (argv[0] === 'auth' || argv[0] === '--version') { console.log('fake-claude 0.0.0'); return; }
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const sessionId = arg('--resume') || arg('--session-id') || F.uuid();
  const model = arg('--model') || 'fake-opus';
  const prompt = await F.readStdin();
  const tools = (arg('--allowedTools') || '').split(',').filter(Boolean);
  F.out({ type: 'system', subtype: 'init', session_id: sessionId, model, tools: ['Read', ...tools], mcp_servers: [], cwd: process.cwd() });
  const { p, text, thinking } = F.plan(prompt);
  const state = F.loadState(`claude-${sessionId}`);
  const wait = F.delayMs(p);

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
  const toolCalls = p.tools3 ? ['mcp__three__three_screenshot', 'mcp__three__three_eval', 'mcp__three__three_edit_code'] : p.tool ? ['mcp__claude_ai_Gmail__search_threads'] : [];
  for (const name of toolCalls) {
    const id = `toolu_${F.uuid().slice(0, 8)}`;
    F.out({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input: { query: 'fake' } }] }, session_id: sessionId });
    await F.sleep(wait * 6);
    F.out({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] }, session_id: sessionId });
  }
  if (p.error) { F.out({ type: 'result', subtype: 'error_during_execution', is_error: true, result: 'Fake engine error: the model is overloaded', session_id: sessionId }); return; }
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
