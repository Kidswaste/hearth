#!/usr/bin/env node
// Stateful app-server protocol fixture. Never contacts a model or touches Hearth's real data.
const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');
const dir = process.env.HEARTH_SERVER_TEST_DIR;
const trace = (value) => { if (dir) fs.appendFileSync(`${dir}/trace.jsonl`, JSON.stringify({ pid: process.pid, ...value }) + '\n'); };
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
const notify = (method, params) => send({ method, params });
const reply = (id, result) => send({ id, result });
const threads = new Map(); let initialized = false; let active = null; let timer;
trace({ start: true, args: process.argv.slice(2) });
const rl = readline.createInterface({ input: process.stdin });
rl.on('close', () => process.exit(0));
rl.on('line', (line) => {
  const m = JSON.parse(line); trace(m);
  if (m.method === 'initialize') { reply(m.id, { userAgent: 'fake' }); return; }
  if (m.method === 'initialized') { initialized = true; return; }
  if (!initialized) { send({ id: m.id, error: { message: 'Not initialized' } }); return; }
  if (m.method === 'config/read') { reply(m.id, { config: { mcp_servers: { unrelated: {} } } }); return; }
  if (m.method === 'thread/start' || m.method === 'thread/resume') {
    if (m.params.threadId === 'missing') { send({ id: m.id, error: { message: 'thread not found' } }); return; }
    const id = m.params.threadId || crypto.randomUUID();
    if (!threads.has(id)) threads.set(id, { n: 0 });
    reply(m.id, { thread: { id } }); return;
  }
  if (m.method === 'turn/interrupt') {
    clearTimeout(timer); reply(m.id, {});
    notify('turn/completed', { threadId: m.params.threadId, turn: { id: m.params.turnId, status: 'interrupted' } }); active = null; return;
  }
  if (m.method !== 'turn/start') return;
  const { threadId, input } = m.params; const text = input[0].text;
  const turnId = crypto.randomUUID(); const meta = { threadId, turnId };
  active = meta;
  if (text === 'BADJSON') { process.stdout.write('{broken json\n'); return; }
  if (text === 'NOACK') return;
  // Notifications may arrive before the RPC result (a real race seen in streaming clients).
  notify('turn/started', { threadId, turn: { id: turnId, status: 'inProgress' } });
  reply(m.id, { turn: { id: turnId, status: 'inProgress' } });
  notify('turn/completed', { threadId, turn: { id: 'old-turn', status: 'completed' } });
  if (text === 'WAIT') return;
  if (text === 'CRASH') { notify('item/agentMessage/delta', { ...meta, itemId: 'm', delta: 'Partial' }); setTimeout(() => process.exit(3), 80); return; }
  if (text === 'APPROVAL') send({ id: 'ask-1', method: 'item/commandExecution/requestApproval', params: { ...meta, command: 'blocked' } });
  if (text === 'BLOCKED') notify('item/completed', { ...meta, item: { type: 'mcpToolCall', id: 'blocked-tool', server: 'test', tool: 'read', status: 'failed', error: { message: 'Approval declined' } } });
  notify('item/agentMessage/delta', { threadId: 'other-chat', turnId, itemId: 'bad', delta: 'WRONG CHAT' });
  notify('item/reasoning/summaryTextDelta', { ...meta, itemId: 'r', delta: 'Checking' });
  notify('item/started', { ...meta, item: { type: 'commandExecution', id: 'tool', command: 'echo test', status: 'inProgress' } });
  notify('item/completed', { ...meta, item: { type: 'commandExecution', id: 'tool', command: 'echo test', status: 'completed', aggregatedOutput: 'test', exitCode: 0 } });
  notify('item/agentMessage/delta', { ...meta, itemId: 'm', delta: 'Hello ' });
  timer = setTimeout(() => {
    const encoded = Buffer.from(JSON.stringify({ method: 'item/agentMessage/delta', params: { ...meta, itemId: 'm', delta: '🌱' } }) + '\n');
    // Split both JSONL and a UTF-8 character across stdout chunks.
    const cut = encoded.indexOf(Buffer.from('🌱')) + 2; process.stdout.write(encoded.subarray(0, cut));
    setTimeout(() => {
      process.stdout.write(encoded.subarray(cut));
      notify('item/completed', { ...meta, item: { id: 'm', type: 'agentMessage', text: 'Hello 🌱' } });
      const n = ++threads.get(threadId).n;
      notify('thread/tokenUsage/updated', { ...meta, tokenUsage: { total: { inputTokens: n * 100, outputTokens: n * 20, cachedInputTokens: n * 50, reasoningOutputTokens: n * 5 }, last: { inputTokens: 10, outputTokens: 2 } } });
      notify('turn/completed', { threadId, turn: { id: turnId, status: text === 'FAIL' ? 'failed' : 'completed', error: text === 'FAIL' ? { message: 'Test failure' } : null } }); active = null;
    }, 15);
  }, 180);
});
