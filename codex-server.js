// A private stdio app-server per Hearth chat. No daemon attachment, shared stdin, or automatic
// replay of an in-flight turn: reconnecting after an uncertain result must never repeat edits.
const crypto = require('crypto');
const { performance } = require('perf_hooks');

const MAX_LINE = 64 * 1024 * 1024;
const LOST = /no (saved |matching )?(conversation|session|thread|rollout)s? (was )?found|(thread|session|conversation|rollout) (not found|does not exist)|could not (find|resume)|failed to (resume|load)/i;
const terminal = new Set(['done', 'error', 'stopped']);
const snake = { commandExecution: 'command_execution', fileChange: 'file_change', mcpToolCall: 'mcp_tool_call', dynamicToolCall: 'mcp_tool_call', collabAgentToolCall: 'collab_tool_call', webSearch: 'web_search' };
function legacyItem(item) {
  return { ...item, type: snake[item.type] || item.type, exit_code: item.exitCode,
    status: item.type === 'fileChange' && item.status === 'declined' ? 'failed' : item.status,
    aggregated_output: item.aggregatedOutput, receiver_thread_ids: item.receiverThreadIds,
    agents_states: item.agentsStates,
    changes: item.changes?.map((c) => ({ ...c, kind: c.kind?.type || c.kind })) };
}

class Connection {
  constructor({ spawn, kill, bin, args, cwd, env, requestMs = 120000 }) {
    this.kill = kill; this.pending = new Map(); this.nextId = 0; this.closed = false;
    this.requestMs = requestMs; this.parts = []; this.bytes = 0;
    this.child = spawn(bin, args, { cwd, env, windowsHide: true });
    this.child.stdout.setEncoding('utf8'); this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.read(chunk));
    this.child.stderr.on('data', (chunk) => { this.stderr = ((this.stderr || '') + chunk).slice(-4000); });
    this.child.stdin.on('error', (err) => this.close(err));
    this.child.on('error', (err) => this.close(err));
    this.child.on('close', (code) => this.close(new Error(`Codex connection closed (${code ?? 'signal'}). ${this.stderr || ''}`)));
    this.ready = this.request('initialize', { clientInfo: { name: 'hearth', title: 'Hearth', version: '0.1.0' } })
      .then(() => { this.write({ method: 'initialized' }); return this.request('config/read', { includeLayers: false }); })
      .then((r) => { this.inheritedServers = Object.keys(r.config?.mcp_servers || {}); });
    // A failed handshake is observed by run(), even if Stop was pressed during initialization.
    this.ready.catch(() => {});
  }
  write(msg) {
    if (this.closed) throw new Error('Codex connection is closed');
    this.child.stdin.write(`${JSON.stringify(msg)}\n`);
  }
  request(method, params) {
    if (this.closed) return Promise.reject(new Error('Codex connection is closed'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close(new Error(`Codex ${method} timed out; the request was not replayed.`)), this.requestMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); } catch (err) { this.close(err); }
    });
  }
  read(chunk) {
    let from = 0; let at;
    while ((at = chunk.indexOf('\n', from)) !== -1) {
      const part = chunk.slice(from, at); from = at + 1;
      this.bytes += Buffer.byteLength(part);
      if (this.bytes > MAX_LINE) { this.close(new Error('Codex response exceeded the message size limit')); return; }
      this.parts.push(part); const line = this.parts.join(''); this.parts = []; this.bytes = 0;
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { this.close(new Error('Invalid JSON from Codex app-server')); return; }
      if (msg.method && msg.id != null) this.serverRequest(msg);
      else if (msg.id != null) {
        const p = this.pending.get(msg.id); if (!p) continue;
        this.pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message || 'Codex request failed')); else p.resolve(msg.result);
      } else if (msg.method) this.onNotification?.(msg.method, msg.params || {});
    }
    const tail = chunk.slice(from); this.parts.push(tail); this.bytes += Buffer.byteLength(tail);
    if (this.bytes > MAX_LINE) this.close(new Error('Codex response exceeded the message size limit'));
  }
  serverRequest(msg) {
    // Hearth's existing tools ask through chat_ask / access. Never silently grant a new native
    // permission or leave the model waiting forever for an approval UI this client doesn't own.
    let result;
    if (/^(item\/(commandExecution|fileChange)\/requestApproval)$/.test(msg.method)) result = { decision: 'decline' };
    else if (/^(execCommandApproval|applyPatchApproval)$/.test(msg.method)) result = { decision: 'denied' };
    else if (msg.method === 'item/permissions/requestApproval') result = { permissions: {}, scope: 'turn' };
    else if (msg.method === 'item/tool/requestUserInput') result = { answers: {} };
    else if (msg.method === 'mcpServer/elicitation/request') result = { action: 'decline', content: null };
    this.write(result ? { id: msg.id, result } : { id: msg.id, error: { code: -32601, message: `Hearth does not implement ${msg.method}` } });
    this.onRequest?.(msg.method);
  }
  close(err = new Error('Codex connection stopped')) {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.idleTimer);
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(err); }
    this.pending.clear(); this.parts = []; this.bytes = 0;
    if (this.child.exitCode == null && this.child.signalCode == null) { try { this.kill(this.child); } catch { /* process already exited */ } }
    this.onClose?.(err);
  }
}

class Pool {
  constructor({ spawn, kill, log = () => {}, idleMs = 5 * 60000, activeIdleMs = 50 * 60000, requestMs = 120000 }) {
    Object.assign(this, { spawn, kill, log, idleMs, activeIdleMs, requestMs });
    this.connections = new Map(); this.active = new Map();
  }
  run({ chatId, bin, args, cwd, env, session, thread, turn, servers, parser, fallbackText, text, showThinking = true }, emit, live) {
    if (this.active.has(chatId)) { emit({ type: 'error', message: 'This Hearth chat already has a running Codex turn.' }); return; }
    const start = performance.now(); const elapsed = () => Math.round(performance.now() - start);
    const timing = { engine: 'codex', transport: 'app-server', connectionReused: false, setupMs: null, firstEventMs: null, firstTextMs: null, totalMs: null };
    const key = crypto.createHash('sha256').update(JSON.stringify({ bin, args, cwd })).digest('hex');
    let conn = this.connections.get(chatId);
    if (conn && (conn.closed || conn.key !== key)) { conn.close(); this.connections.delete(chatId); conn = null; }
    timing.connectionReused = Boolean(conn);
    let done = false; let cancelled = false; let turnId = null; let output = ''; let usage = null;
    let activeIdle; let interruptTimer; let pulse; let lastEvent = performance.now(); const messages = new Map(); const reasoning = new Set();
    let baseline = null; let threadReady = false;
    const touch = () => { lastEvent = performance.now(); clearTimeout(activeIdle); activeIdle = setTimeout(() => conn?.close(new Error('Codex stopped responding; the turn was not replayed.')), this.activeIdleMs); };
    const finish = (event) => {
      if (done) return; done = true; clearTimeout(activeIdle); clearTimeout(interruptTimer); clearInterval(pulse);
      this.active.delete(chatId); timing.totalMs = elapsed();
      if (conn) {
        conn.onNotification = null; conn.onClose = null; conn.onRequest = null;
        if (conn.closed || chatId.startsWith('once-')) { conn.close(); this.connections.delete(chatId); }
        else { conn.idleTimer = setTimeout(() => { conn.close(); if (this.connections.get(chatId) === conn) this.connections.delete(chatId); }, this.idleMs); conn.idleTimer.unref?.(); }
      }
      this.log(`codex ${chatId} ${event.type} timing=${JSON.stringify(timing)}`);
      emit({ ...event, session: { ...session }, timing });
    };
    const forward = (events) => {
      for (const e of (Array.isArray(events) ? events : events ? [events] : [])) {
        if (terminal.has(e.type)) continue;
        if (e.type === 'blocked') { emit({ type: 'thinking', text: `${e.name}: ${e.message}\n\n` }); continue; }
        if (['step', 'agent', 'pulse', 'status'].includes(e.type)) live?.(e); else emit(e);
      }
    };
    const append = (id, delta) => {
      if (!delta) return;
      const old = messages.get(id) || '';
      const text = (!old && output ? '\n\n' : '') + delta;
      messages.set(id, old + delta); output += text;
      if (timing.firstTextMs == null) timing.firstTextMs = elapsed();
      emit({ type: 'delta', text });
    };
    const stop = () => {
      if (done || cancelled) return; cancelled = true;
      if (!turnId) { conn?.close(new Error('Stopped')); finish({ type: 'stopped' }); return; }
      // Keep the connection until the interrupt is acknowledged by turn/completed. If it hangs,
      // close this chat's server only; never interrupt another chat.
      interruptTimer = setTimeout(() => { conn.close(); finish({ type: 'stopped' }); }, 5000);
      conn.request('turn/interrupt', { threadId: session.id, turnId }).catch(() => { conn.close(); finish({ type: 'stopped' }); });
    };
    this.active.set(chatId, { stop, finish });
    try {
      if (!conn) { conn = new Connection({ spawn: this.spawn, kill: this.kill, bin, args, cwd, env, requestMs: this.requestMs }); conn.key = key; this.connections.set(chatId, conn); }
      clearTimeout(conn.idleTimer);
      conn.onClose = (err) => finish(cancelled ? { type: 'stopped' } : { type: 'error', message: `${err.message}\nThe turn was not replayed. Check any partial work before retrying.` });
      conn.onRequest = (method) => { if (!done) emit({ type: 'thinking', text: `Hearth could not complete the Codex request (${method}); no additional permission was granted.\n\n` }); };
      conn.onNotification = (method, p) => {
        if (done || !threadReady || p.threadId !== session.id || (turnId && p.turnId && p.turnId !== turnId)) return;
        touch(); if (timing.firstEventMs == null) timing.firstEventMs = elapsed();
        if (method === 'turn/started') { turnId = p.turn.id; return; }
        if (method === 'item/agentMessage/delta') { append(p.itemId, p.delta); return; }
        if (method === 'item/reasoning/summaryTextDelta') { reasoning.add(p.itemId); if (showThinking) emit({ type: 'thinking', text: p.delta }); return; }
        if (method === 'item/reasoning/summaryPartAdded') { if (showThinking && reasoning.has(p.itemId)) emit({ type: 'thinking', text: '\n\n' }); return; }
        if (method === 'thread/tokenUsage/updated') {
          // total is cumulative across model calls; last is only the last model call, not the
          // whole user turn. Warm turns use the previous total. On resume the server may publish
          // a baseline before turn/start; older exec sessions carry the equivalent totals.
          const u = p.tokenUsage.total;
          const totals = { input: u.inputTokens || 0, output: u.outputTokens || 0, cached: u.cachedInputTokens || 0, reasoning: u.reasoningOutputTokens || 0 };
          let prev = baseline || session.totals || {};
          // Some server versions reset usage totals when a saved thread is reloaded.
          if (totals.input < (prev.input || 0) || totals.output < (prev.output || 0)) { baseline = {}; prev = baseline; }
          usage = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.max(0, v - (prev[k] || 0))]));
          session.totals = totals; conn.totals = totals;
          return;
        }
        if (method === 'turn/plan/updated') { emit({ type: 'progress', steps: (p.plan || []).map((s) => ({ text: s.step, status: s.status === 'completed' ? 'done' : s.status === 'inProgress' ? 'doing' : 'todo' })) }); return; }
        if (method === 'item/mcpToolCall/progress') { live?.({ type: 'status', text: String(p.message || 'Tool running').slice(0, 200) }); return; }
        if (method === 'item/started' || method === 'item/completed') {
          const item = p.item;
          if (item.type === 'agentMessage') { if (method === 'item/completed') { const seen = messages.get(item.id) || ''; if ((item.text || '').startsWith(seen)) append(item.id, item.text.slice(seen.length)); } return; }
          if (item.type === 'reasoning') { if (showThinking && method === 'item/completed' && !reasoning.has(item.id)) emit({ type: 'thinking', text: (item.summary || []).join('\n\n') }); return; }
          forward(parser({ type: method === 'item/started' ? 'item.started' : 'item.completed', item: legacyItem(item) })); return;
        }
        if (method === 'error') {
          if (p.willRetry) emit({ type: 'thinking', text: `Codex is reconnecting: ${p.error?.message || 'temporary error'}\n\n` });
          else { conn.close(new Error(p.error?.message || 'Codex turn failed')); }
          return;
        }
        if (method === 'turn/completed') {
          if (turnId && p.turn.id !== turnId) return;
          if (p.turn.status === 'completed') finish({ type: 'done', text: output, usage: usage || { input: 0, output: 0 } });
          else if (p.turn.status === 'interrupted') finish({ type: 'stopped' });
          else finish({ type: 'error', message: p.turn.error?.message || `Codex turn ${p.turn.status}` });
        }
      };
      touch();
      pulse = setInterval(() => { if (!done) live?.({ type: 'pulse', quietMs: Math.round(performance.now() - lastEvent), alive: !conn.closed, cpu: null }); }, 10000);
      (async () => {
        await conn.ready; if (done) return;
        const config = { ...(thread.config || {}) };
        for (const name of conn.inheritedServers || []) if (!servers.includes(name)) config[`mcp_servers.${name}.enabled`] = false;
        for (const name of servers) config[`mcp_servers.${name}.enabled`] = true;
        const signature = JSON.stringify({ ...thread, config });
        let inputText = text;
        if (!session.id || conn.threadId !== session.id || conn.signature !== signature) {
          let result;
          try { result = await conn.request(session.id ? 'thread/resume' : 'thread/start', { ...thread, config, ...(session.id ? { threadId: session.id } : {}) }); }
          catch (err) {
            if (!session.id || !fallbackText || !LOST.test(err.message)) throw err;
            emit({ type: 'thinking', text: 'The previous Codex session is unavailable. Continuing in a new session with the saved conversation.\n\n' });
            result = await conn.request('thread/start', { ...thread, config }); inputText = fallbackText; delete session.totals;
          }
          if (done) return;
          if (conn.threadId !== result.thread.id) conn.totals = null;
          session.id = result.thread.id; conn.threadId = session.id; conn.signature = signature;
        }
        baseline = { ...(session.totals || conn.totals || {}) }; threadReady = true;
        timing.setupMs = elapsed();
        const result = await conn.request('turn/start', { ...turn, threadId: session.id, input: [{ type: 'text', text: inputText }, ...(turn.input || [])] });
        if (!done) turnId = result.turn.id;
      })().catch((err) => { if (!done) { conn.close(err); finish({ type: cancelled ? 'stopped' : 'error', message: err.message }); } });
    } catch (err) { finish({ type: 'error', message: err.message }); }
  }
  stop(chatId) { const run = this.active.get(chatId); if (!run) return false; run.stop(); return true; }
  stopAll() { const count = this.active.size; for (const run of this.active.values()) run.stop(); for (const c of this.connections.values()) c.close(); this.connections.clear(); return count; }
}

module.exports = { Pool, Connection, legacyItem };
