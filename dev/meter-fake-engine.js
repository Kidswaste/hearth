#!/usr/bin/env node
// A stand-in for the Claude Code engine, for testing the token meter (dev/ only, never shipped): point
// settings.enginePaths.claude at this file. It reads the message from stdin and streams a reply in Claude's
// stream-json format (thinking, text deltas, one tool call), then reports usage like the real engine.
const crypto = require('crypto');

let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', async () => {
  const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  out({ type: 'system', subtype: 'init', session_id: crypto.randomUUID(), tools: [], mcp_servers: [] });
  out({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'thinking' } } });
  out({ type: 'stream_event', event: { delta: { type: 'thinking_delta', thinking: 'Thinking about it. '.repeat(20) } } });
  const words = `You said: ${input.slice(0, 60)}. ${'This is a streamed test reply with enough words to watch the meter tick. '.repeat(12)}`.split(' ');
  for (let i = 0; i < words.length; i += 6) {
    out({ type: 'stream_event', event: { delta: { type: 'text_delta', text: `${words.slice(i, i + 6).join(' ')} ` } } });
    await wait(Number(process.env.FAKE_DELAY || 60));
  }
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'three_eval', input: {} }] } });
  out({ type: 'result', is_error: false, result: words.join(' '), total_cost_usd: 0.0123,
    usage: { input_tokens: 812, cache_read_input_tokens: 4200, cache_creation_input_tokens: 300, output_tokens: 410 } });
});
