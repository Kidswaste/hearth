// Long-task scenarios for the fake engines (round 21, liveness): what real Claude Code / Codex runs look like when a
// task takes minutes. Used by dev/fake-claude.js and dev/fake-codex.js when the user's message has one of these words:
//   subagents     Claude: Task / Agent tool calls whose own steps carry parent_tool_use_id (one in parallel with
//                 another, one fails); Codex: collab_tool_call items (spawn_agent, wait with agents_states)
//   marathon[:N]  N tool calls (default 120) with results and short thinking between them, then a long reply
//   hugeout[:MB]  one tool result of MB megabytes (default 6) on a single JSONL line, written in 64 KB pieces
//   longthink[:KB] a thinking block of KB kilobytes (default 160)
//   quiet[:S]     a tool call, then S seconds of silence (default 8) with the process idle, then the rest
//   busyquiet[:S] the same, but the process keeps a CPU busy meanwhile
//   hang          a tool call, then silence until it is stopped
//   die           some text, then the process kills itself (SIGKILL: no result, no stderr)
//   orphan        some text, then exits with an error while a child it started keeps stdout open (120 s)
// Shapes follow the real CLIs: stream-json lines carry session_id, uuid and parent_tool_use_id (null on the main
// thread); tool results come back as user messages with tool_result blocks.
const { spawn } = require('child_process');
const F = require('./fake-common');

const WORDS = ['subagents', 'marathon', 'hugeout', 'longthink', 'quiet', 'busyquiet', 'hang', 'die', 'orphan'];
function wants(msg) {
  const got = {};
  for (const w of WORDS) {
    const m = msg.match(new RegExp(`\\b${w}(?::(\\d+))?\\b`, 'i'));
    if (m) got[w] = m[1] ? Number(m[1]) : true;
  }
  return Object.keys(got).length ? got : null;
}
const num = (v, d) => (typeof v === 'number' ? v : d);
// waits in a way that writes nothing; busy: keeps one CPU at work (an engine thinking hard / a tool computing)
async function silent(ms, busy) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (busy) { const t = Date.now() + 40; while (Date.now() < t) Math.sqrt(Math.random()); await F.sleep(5); } else await F.sleep(Math.min(200, end - Date.now()));
  }
}
const write = (s) => new Promise((r) => { if (process.stdout.write(s)) r(); else process.stdout.once('drain', r); });
// one JSONL line of `bytes` bytes, written in pieces (what a huge tool result looks like on the pipe)
async function bigLine(head, field, bytes, tail) {
  const start = `${JSON.stringify(head).slice(0, -1)},${JSON.stringify(field)}:"`;
  await write(start);
  const piece = 'x'.repeat(65536);
  for (let n = 0; n < bytes; n += piece.length) await write(piece);
  await write(`"${tail ? `,${JSON.stringify(tail).slice(1)}` : '}'}\n`);
}

// ---------- Claude Code (stream-json) ----------
function claudeOut(sessionId) {
  const base = (parent) => ({ session_id: sessionId, parent_tool_use_id: parent || null, uuid: F.uuid() });
  const o = {
    assistant: (content, parent) => F.out({ type: 'assistant', message: { id: `msg_${F.uuid().slice(0, 8)}`, type: 'message', role: 'assistant', model: 'fake-opus', content, stop_reason: null }, ...base(parent) }),
    toolUse: (name, input, parent) => { const id = `toolu_${F.uuid().slice(0, 12)}`; o.assistant([{ type: 'tool_use', id, name, input }], parent); return id; },
    result: (id, content, parent, isError) => F.out({ type: 'user', message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content, ...(isError ? { is_error: true } : {}) }] }, ...base(parent) }),
    ev: (event, parent) => F.out({ type: 'stream_event', event, ...base(parent) }),
    async text(text, parent, wait = 4) {
      o.ev({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }, parent);
      for (const t of F.pieces(text)) { o.ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: t } }, parent); if (wait) await F.sleep(wait); }
      o.ev({ type: 'content_block_stop', index: 0 }, parent);
      o.assistant([{ type: 'text', text }], parent);
    },
    async think(text, wait = 2) {
      o.ev({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } });
      for (const t of text.match(/[\s\S]{1,40}/g) || []) { o.ev({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: t } }); if (wait) await F.sleep(wait); }
      o.ev({ type: 'content_block_stop', index: 0 });
    },
  };
  return o;
}

async function claude(prompt, sessionId) {
  const w = wants(F.userPartOf ? F.userPartOf(prompt) : prompt);
  if (!w) return false;
  const o = claudeOut(sessionId);
  let reply = 'Done.';
  let tools = 0;
  if (w.longthink) {
    const kb = num(w.longthink, 160);
    const para = 'Weighing the layers, the beat grid and the shader cost before touching anything. ';
    await o.think(para.repeat(Math.ceil((kb * 1024) / para.length)).slice(0, kb * 1024), 0);
  }
  if (w.subagents) {
    await o.think('This is three separate jobs: I will deploy agents for the shader, the particles and the audio map.', 3);
    // two Task calls in ONE assistant message (parallel), then an Agent call (the newer name) on its own
    const a = `toolu_${F.uuid().slice(0, 12)}`; const b = `toolu_${F.uuid().slice(0, 12)}`;
    o.assistant([
      { type: 'tool_use', id: a, name: 'Task', input: { description: 'Shader glow pass', prompt: 'Write the bloom shader for the orb layer.', subagent_type: 'general-purpose' } },
      { type: 'tool_use', id: b, name: 'Task', input: { description: 'Particle field', prompt: 'Build the particle layer that reacts to the kick.', subagent_type: 'general-purpose' } },
    ]);
    tools += 2;
    await F.sleep(150);
    // their steps interleave, each tagged with its parent
    const r1 = o.toolUse('mcp__hearth-three__three_read_code', { layer: 'orb' }, a); await F.sleep(120);
    const r2 = o.toolUse('Grep', { pattern: 'kick', path: '/lab/sketch.js' }, b); await F.sleep(120);
    o.result(r1, 'const orb = …(2,400 chars)', a); o.result(r2, '3 matches', b);
    await o.text('Subagent A thinking out loud: this text belongs to the shader agent, never to the main reply.', a, 2);
    const r3 = o.toolUse('mcp__hearth-three__three_edit_code', { layer: 'orb', find: 'glow', replace: 'bloom' }, a); await F.sleep(250);
    o.result(r3, 'edited', a);
    const r4 = o.toolUse('mcp__hearth-three__three_eval', { code: 'scene.children.length' }, b); await F.sleep(200);
    o.result(r4, 'Error: particles is not defined', b, true);
    o.result(a, [{ type: 'text', text: 'Bloom pass added to the orb layer (strength 1.4, radius 0.6).' }]);
    o.result(b, [{ type: 'text', text: 'Could not build the particle layer: particles is not defined.' }], null, true);
    const c = o.toolUse('Agent', { description: 'Audio map', prompt: 'Map kick / snare to the layers.', subagent_type: 'general-purpose' }); tools += 1;
    const r5 = o.toolUse('mcp__hearth-three__three_sliders', { group: 'Music' }, c); await F.sleep(300);
    o.result(r5, 'Music: punch 1.2, glow 0.4', c);
    o.result(c, [{ type: 'text', text: 'Kick drives punch, snare drives glow.' }]);
    reply = 'Deployed three agents: the bloom pass is in, the audio map is set, the particle layer failed (particles is not defined).';
  }
  if (w.marathon) {
    const n = num(w.marathon, 120);
    const names = ['mcp__hearth-three__three_eval', 'mcp__hearth-three__three_edit_code', 'mcp__hearth-three__three_screenshot', 'mcp__hearth-three__three_read_code', 'Read', 'Grep'];
    for (let i = 0; i < n; i += 1) {
      if (i % 10 === 0) await o.think(`Step ${i}: checking the layer before the next edit.`, 1);
      const name = names[i % names.length];
      const id = o.toolUse(name, name === 'Read' ? { file_path: `/lab/part-${i}.js` } : name === 'Grep' ? { pattern: `beat${i}` } : { code: `layer(${i}).opacity`, layer: `layer-${i}` });
      await F.sleep(8);
      o.result(id, `result ${i}: ${'ok '.repeat(20)}`);
      tools += 1;
    }
    reply = `Ran ${n} steps.\n\n${Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1}: the layer stack is settled and the beat grid lines up with the kick.`).join('\n\n')}`;
  }
  if (w.hugeout) {
    const id = o.toolUse('mcp__hearth-three__three_read_code', { layer: 'all' }); tools += 1;
    await bigLine({ type: 'user', message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content: '' }] } }, 'pad', num(w.hugeout, 6) * 1048576, { session_id: sessionId, parent_tool_use_id: null });
    reply = 'Read the whole sketch.';
  }
  if (w.quiet || w.busyquiet) {
    const id = o.toolUse('mcp__hearth-three__three_screenshot', { frames: 12 }); tools += 1;
    await silent(num(w.quiet || w.busyquiet, 8) * 1000, Boolean(w.busyquiet));
    o.result(id, 'contact sheet saved');
    reply = 'The contact sheet is ready.';
  }
  if (w.hang) { o.toolUse('mcp__hearth-three__three_eval', { code: 'while(true){}' }); await silent(3600e3, false); return true; }
  if (w.die) { await o.text('Working on it, halfway there…', null, 3); await F.sleep(300); process.kill(process.pid, 'SIGKILL'); }
  if (w.orphan) {
    await o.text('Started the render; ', null, 3);
    spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: ['ignore', 'inherit', 'inherit'], detached: true }).unref();
    process.stderr.write('Error: the render helper crashed\n');
    process.exit(1);
  }
  await o.text(reply, null, 3);
  F.out({ type: 'result', subtype: 'success', is_error: false, result: reply, session_id: sessionId, num_turns: tools + 1, duration_ms: 1000, total_cost_usd: 0.01, usage: { input_tokens: 10, cache_read_input_tokens: 900, cache_creation_input_tokens: 0, output_tokens: Math.ceil(reply.length / 4) }, uuid: F.uuid() });
  return true;
}

// ---------- Codex (exec --json) ----------
async function codex(prompt, threadId) {
  const w = wants(F.userPartOf ? F.userPartOf(prompt) : prompt);
  if (!w) return false;
  let n = 0;
  const item = (type, it) => F.out({ type, item: it });
  let text = 'Done.';
  if (w.longthink) item('item.completed', { id: `item_${n++}`, type: 'reasoning', text: 'Planning the layers. '.repeat(Math.ceil((num(w.longthink, 160) * 1024) / 21)) });
  if (w.subagents) {
    item('item.completed', { id: `item_${n++}`, type: 'reasoning', text: 'Two independent jobs: spawning agents.' });
    const kids = [F.uuid(), F.uuid()];
    const spawnId = `item_${n++}`;
    item('item.started', { id: spawnId, type: 'collab_tool_call', tool: 'spawn_agent', sender_thread_id: threadId, receiver_thread_ids: [kids[0]], prompt: 'Shader glow pass: write the bloom shader', agents_states: {}, status: 'in_progress' });
    item('item.completed', { id: spawnId, type: 'collab_tool_call', tool: 'spawn_agent', sender_thread_id: threadId, receiver_thread_ids: [kids[0]], prompt: 'Shader glow pass: write the bloom shader', agents_states: { [kids[0]]: { status: 'running', message: null } }, status: 'completed' });
    const spawn2 = `item_${n++}`;
    item('item.completed', { id: spawn2, type: 'collab_tool_call', tool: 'spawn_agent', sender_thread_id: threadId, receiver_thread_ids: [kids[1]], prompt: 'Particle field reacting to the kick', agents_states: { [kids[1]]: { status: 'running', message: null } }, status: 'completed' });
    const waitId = `item_${n++}`;
    item('item.started', { id: waitId, type: 'collab_tool_call', tool: 'wait', sender_thread_id: threadId, receiver_thread_ids: kids, agents_states: { [kids[0]]: { status: 'running' }, [kids[1]]: { status: 'running' } }, status: 'in_progress' });
    await F.sleep(600);
    item('item.completed', { id: waitId, type: 'collab_tool_call', tool: 'wait', sender_thread_id: threadId, receiver_thread_ids: kids, agents_states: { [kids[0]]: { status: 'completed', message: 'Bloom pass added.' }, [kids[1]]: { status: 'errored', message: 'particles is not defined' } }, status: 'completed' });
    text = 'Two agents ran: bloom added, particles failed.';
  }
  if (w.marathon) {
    const k = num(w.marathon, 120);
    for (let i = 0; i < k; i += 1) {
      const id = `item_${n++}`;
      item('item.started', { id, type: 'mcp_tool_call', server: 'hearth-three', tool: 'three_eval', arguments: { code: `layer(${i})` }, status: 'in_progress' });
      await F.sleep(8);
      item('item.completed', { id, type: 'mcp_tool_call', server: 'hearth-three', tool: 'three_eval', arguments: { code: `layer(${i})` }, result: { content: [{ type: 'text', text: `ok ${i}` }] }, status: 'completed' });
    }
    text = `Ran ${k} steps.`;
  }
  if (w.quiet || w.busyquiet) {
    const id = `item_${n++}`;
    item('item.started', { id, type: 'command_execution', command: 'ffmpeg -i in.mp4 out.webm', status: 'in_progress' });
    await silent(num(w.quiet || w.busyquiet, 8) * 1000, Boolean(w.busyquiet));
    item('item.completed', { id, type: 'command_execution', command: 'ffmpeg -i in.mp4 out.webm', aggregated_output: 'done', exit_code: 0, status: 'completed' });
  }
  if (w.hang) { item('item.started', { id: `item_${n++}`, type: 'mcp_tool_call', server: 'hearth-three', tool: 'three_eval', status: 'in_progress' }); await silent(3600e3, false); return true; }
  if (w.die) { item('item.completed', { id: `item_${n++}`, type: 'agent_message', text: 'Halfway there…' }); await F.sleep(300); process.kill(process.pid, 'SIGKILL'); }
  item('item.completed', { id: `item_${n++}`, type: 'agent_message', text });
  F.out({ type: 'turn.completed', usage: { input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 40 } });
  return true;
}

module.exports = { claude, codex, wants };
