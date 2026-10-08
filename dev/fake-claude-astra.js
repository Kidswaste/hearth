#!/usr/bin/env node
// A stand-in for Claude Code in Astra's collaboration tests (settings.enginePaths.claude = this file). It
// prints Claude's stream-json: system init, text deltas, a result with usage. SLOW waits 20 s, FAIL errors,
// LOST simulates a resumed session that no longer exists. Arguments go to <tmp>/fake-claude-astra/last-args.json.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const STATE = path.join(os.tmpdir(), 'fake-claude-astra');
fs.mkdirSync(STATE, { recursive: true });
const argv = process.argv.slice(2);
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
if (argv[0] === '--version') { console.log('9.9.9 (Claude Code, fake)'); process.exit(0); }
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
fs.writeFileSync(path.join(STATE, 'last-args.json'), JSON.stringify({ argv }, null, 2));

let prompt = '';
process.stdin.on('data', (c) => { prompt += c; });
process.stdin.on('end', async () => {
  const resume = opt('--resume');
  if (resume && !fs.existsSync(path.join(STATE, `${resume}.json`))) {
    out({ type: 'result', is_error: true, result: `No conversation found with session ID: ${resume}` });
    process.exit(1);
  }
  const id = resume || opt('--session-id') || crypto.randomUUID();
  fs.writeFileSync(path.join(STATE, `${id}.json`), '{}');
  out({ type: 'system', subtype: 'init', session_id: id, mcp_servers: [], tools: [] });
  if (/FAIL/.test(prompt)) { out({ type: 'result', is_error: true, result: 'Claude fake failure' }); return; }
  if (/SLOW/.test(prompt)) await wait(20000);
  const ask = prompt.replace(/\s+/g, ' ').trim();
  let reply = `Claude here (${opt('--model') || 'default'}). You said: “${ask.slice(0, 90)}${ask.length > 90 ? '…' : ''}”`;
  if (/Improve this|improve it further/i.test(prompt)) reply = 'Improved version by Claude.\n\nChanges: clearer structure.';
  if (/Critique this|Review it again/i.test(prompt)) reply = '1. Too long.\n2. Missing a caveat.';
  if (/single best|Merge/i.test(prompt)) reply = 'Merged answer (Claude): the best of both.';
  if (/Revise your answer/i.test(prompt)) reply = 'Revised answer by Claude, shorter and with the caveat.';
  for (const piece of reply.match(/.{1,24}/gs)) {
    out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: piece } } });
    await wait(30);
  }
  out({ type: 'result', is_error: false, result: reply, usage: { input_tokens: 700 + Math.ceil(prompt.length / 4), cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: Math.ceil(reply.length / 4) } });
});
