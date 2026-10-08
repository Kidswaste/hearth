#!/usr/bin/env node
// A stand-in for the Codex CLI in tests (no network, no account). Point Settings → Engines at it
// (settings.enginePaths.codex = this file). It speaks the same `codex exec --json` JSONL that engines.js parses:
//   thread.started, turn.started, item.started / item.updated / item.completed, turn.completed (running totals),
//   turn.failed, error. Also answers `--version` and `login status`.
// Words in the prompt steer it: SLOW (answers after 20 s, to test Stop), FAIL (model error), LIMIT (usage
// limit), TOOL (a shell command + a plan), REMEMBER (<remember> tag), SUGGEST (<suggest> tags), NOID (old
// Codex without item ids), PARTIALFAIL (fails after some text), PERTURN (per-turn usage instead of running totals), NONEWLINE (last line unterminated).
// Every run's arguments are saved in <tmp>/fake-codex-astra/last-args.json for checks.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const STATE = path.join(os.tmpdir(), 'fake-codex-astra');
fs.mkdirSync(STATE, { recursive: true });
const argv = process.argv.slice(2);
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

if (argv[0] === '--version') { console.log('codex-cli 0.99.0 (fake)'); process.exit(0); }
if (argv[0] === 'login' && argv[1] === 'status') {
  if (process.env.FAKE_CODEX_LOGGED_OUT) { console.error('Not logged in'); process.exit(1); }
  console.error('Logged in using ChatGPT');
  process.exit(0);
}
if (argv[0] === 'login') { console.log('(fake) open the browser to sign in'); process.exit(0); }
if (argv[0] !== 'exec') { console.error(`error: unexpected argument '${argv[0]}' found`); process.exit(2); }

const configs = {};
let model = 'gpt-default';
let resume = null;
const images = [];
for (let i = 1; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === 'resume') resume = argv[++i];
  else if (a === '-c') { const [k, ...v] = argv[++i].split('='); configs[k] = v.join('='); }
  else if (a === '-m') model = argv[++i];
  else if (a === '-i') images.push(argv[++i]);
  else if (a === '--disable' || a === '-s' || a === '-C') i += 1;
}
fs.writeFileSync(path.join(STATE, 'last-args.json'), JSON.stringify({ argv, configs, model, resume, images }, null, 2));
const effort = (configs.model_reasoning_effort || '"default"').replace(/"/g, '');

let prompt = '';
process.stdin.on('data', (c) => { prompt += c; });
process.stdin.on('end', () => main().catch((err) => { console.error(`Error: ${err.message}`); process.exit(1); }));

async function main() {
  let thread = resume;
  const stateFile = (id) => path.join(STATE, `${id}.json`);
  let totals = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
  if (resume) {
    if (!fs.existsSync(stateFile(resume))) { console.error(`Error: no rollout found for thread id ${resume}`); process.exit(1); }
    totals = JSON.parse(fs.readFileSync(stateFile(resume), 'utf8'));
  } else thread = crypto.randomUUID();
  out({ type: 'thread.started', thread_id: thread });
  out({ type: 'turn.started' });
  if (/PARTIALFAIL/.test(prompt)) { out({ type: 'item.updated', item: { id: 'item_p', type: 'agent_message', text: 'Half of an answer' } }); await wait(100); out({ type: 'turn.failed', error: { message: 'stream disconnected before completion' } }); return; }
  if (/FAIL/.test(prompt)) { out({ type: 'turn.failed', error: { message: `The '${model}' model is not supported when using Codex with a ChatGPT account.` } }); return; }
  if (/LIMIT/.test(prompt)) { out({ type: 'error', message: "You've hit your usage limit. Try again later." }); return; }
  out({ type: 'item.completed', item: { id: 'item_0', type: 'reasoning', text: `**Reading the request** (${prompt.length} chars)` } });
  if (/TOOL/.test(prompt)) {
    out({ type: 'item.started', item: { id: 'item_t', type: 'todo_list', items: [{ text: 'Look at the files', completed: false }, { text: 'Answer', completed: false }] } });
    out({ type: 'item.started', item: { id: 'item_c', type: 'command_execution', command: 'rg -n "TODO" .', status: 'in_progress' } });
    out({ type: 'item.completed', item: { id: 'item_c', type: 'command_execution', command: 'rg -n "TODO" .', aggregated_output: '', exit_code: 0, status: 'completed' } });
    out({ type: 'item.updated', item: { id: 'item_t', type: 'todo_list', items: [{ text: 'Look at the files', completed: true }, { text: 'Answer', completed: false }] } });
  }
  if (/SLOW/.test(prompt)) await wait(20000);
  const ask = prompt.replace(/\s+/g, ' ').trim();
  let reply = `Astra here (${model}, effort ${effort}${images.length ? `, ${images.length} image${images.length > 1 ? 's' : ''}` : ''}). You said: “${ask.slice(0, 90)}${ask.length > 90 ? '…' : ''}”`;
  if (/Improve this|improve it further/i.test(prompt)) reply = `Improved version by Astra.\n\nChanges: tightened wording, fixed one mistake.`;
  if (/Critique this|Review it again/i.test(prompt)) reply = '1. The intro is vague.\n2. A step is missing.\n3. Add an example.';
  if (/serves the user better/.test(prompt)) reply = '2\nIt is more concrete.';
  if (/single best|Merge/i.test(prompt)) reply = `Merged answer (Astra): the best of both.`;
  if (/Revise your answer/i.test(prompt)) reply = 'Revised answer by Astra, with the missing step.';
  if (/REMEMBER/.test(prompt)) reply += '\n<remember>The user likes fake tea</remember>';
  if (/SUGGEST/.test(prompt)) reply += '\n<suggest>Make it shorter</suggest><suggest>Add an example</suggest>';
  const noId = /NOID/.test(prompt);
  if (noId) out({ type: 'item.completed', item: { type: 'agent_message', text: reply } });
  else {
    const cut = [Math.floor(reply.length / 3), Math.floor((reply.length * 2) / 3), reply.length];
    for (const n of cut.slice(0, 2)) { out({ type: 'item.updated', item: { id: 'item_1', type: 'agent_message', text: reply.slice(0, n) } }); await wait(120); }
    out({ type: 'item.completed', item: { id: 'item_1', type: 'agent_message', text: reply } });
  }
  const turn = { input_tokens: 4000 + Math.ceil(prompt.length / 4), cached_input_tokens: 3000, output_tokens: Math.ceil(reply.length / 4) + 20, reasoning_output_tokens: 16 };
  const perTurn = /PERTURN/.test(prompt);
  for (const k of Object.keys(totals)) totals[k] += turn[k];
  fs.writeFileSync(stateFile(thread), JSON.stringify(totals));
  const done = JSON.stringify({ type: 'turn.completed', usage: perTurn ? turn : totals });
  if (/NONEWLINE/.test(prompt)) process.stdout.write(done);
  else process.stdout.write(`${done}\n`);
}
