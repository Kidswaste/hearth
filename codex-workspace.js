// Explicit workspace operations. Catalogs and activity never enter the model's prompt.
const crypto = require('crypto');
const { Connection } = require('./codex-server');
const { pages } = require('./codex-capabilities');
const clip = (s, n = 2000) => String(s || '').slice(0, n);
const keyOf = o => crypto.createHash('sha256').update(JSON.stringify({ bin: o.bin, args: o.args, cwd: o.cwd })).digest('hex');
function record(pool, chatId, method, p) {
  pool.workspaces ||= new Map();
  let s = pool.workspaces.get(chatId);
  if (!s) { s = { items: [], diff: '', usage: null, turnId: null }; pool.workspaces.set(chatId, s); }
  if (method === 'turn/started') { s.items = []; s.diff = ''; s.turnId = p.turn.id; s.startedAt = Date.now(); s.finishedAt = null; }
  if (method === 'thread/tokenUsage/updated') s.usage = p.tokenUsage;
  if (method === 'turn/diff/updated') { s.diff = clip(p.diff, 200000); s.diffTruncated = (p.diff?.length || 0) > 200000; }
  if (/^item\/(started|completed)$/.test(method) && ['commandExecution', 'fileChange', 'mcpToolCall', 'webSearch', 'contextCompaction'].includes(p.item?.type)) {
    const i = p.item; const old = s.items.find(x => x.id === i.id);
    const row = { id: i.id, type: i.type, label: clip(i.command || (i.server ? `${i.server} / ${i.tool}` : i.type === 'webSearch' ? i.query : i.type), 300),
      status: i.status || (method.endsWith('completed') ? 'completed' : 'inProgress'), at: old?.at || Date.now(),
      ...(method.endsWith('completed') ? { ms: Date.now() - (old?.at || Date.now()) } : {}),
      files: (i.changes || []).slice(0, 100).map(c => ({ path: clip(c.path, 1000), kind: c.kind?.type || c.kind })) };
    if (old) Object.assign(old, row); else s.items.push(row);
    if (s.items.length > 150) { s.items.shift(); s.itemsTruncated = true; }
  }
  if (method === 'turn/completed') { s.finishedAt = Date.now(); s.status = p.turn.status; }
  // Only recent chats retained; no tool arguments/results or question answers stored here.
  if (pool.workspaces.size > 40) for (const id of pool.workspaces.keys()) { if (!pool.active.has(id) && id !== chatId) { pool.workspaces.delete(id); break; } }
}
async function skills(conn, cwd) {
  const r = await conn.request('skills/list', { cwds: [cwd], forceReload: true }, { soft: true });
  return { data: (r.data || []).flatMap(x => (x.skills || []).map(s => ({ name: s.name, path: s.path, description: s.description, enabled: s.enabled, scope: s.scope }))),
    errors: (r.data || []).flatMap(x => x.errors || []).map(e => clip(e.message)) };
}
async function skillInputs(conn, cwd, selected) {
  if (!selected?.length) return [];
  if (!Array.isArray(selected) || selected.length > 5) throw new Error('Choose up to five skills.');
  const available = (await skills(conn, cwd)).data;
  return selected.map(s => {
    const found = available.find(a => a.enabled !== false && a.name === s.name && a.path === s.path);
    if (!found) throw new Error(`The selected skill ${clip(s.name, 80)} is no longer available. Choose it again.`);
    return { type: 'skill', name: found.name, path: found.path };
  });
}
async function resources(conn) {
  const servers = await pages((m, p) => conn.request(m, { ...p, threadId: conn.threadId }, { soft: true }), 'mcpServerStatus/list');
  return servers.map(s => ({ name: s.name, status: s.runtimeStatus, resources: (s.resources || []).map(r => ({ name: r.name, uri: r.uri, description: r.description, mimeType: r.mimeType })),
    templates: (s.resourceTemplates || []).map(r => ({ name: r.name, uriTemplate: r.uriTemplate })) }));
}
async function compact(conn) {
  let timer; let settle; let activeTurn; let observed = false;
  const finished = new Promise((resolve, reject) => {
    settle = { resolve, reject };
    timer = setTimeout(() => reject(new Error('Compaction did not finish in time. Its outcome is unknown; it was not retried.')), 120000);
  });
  finished.catch(() => {});
  const prior = conn.onNotification;
  conn.onNotification = (method, p) => {
    prior?.(method, p);
    if (p.threadId !== conn.threadId) return;
    if (method === 'turn/started') activeTurn = p.turn.id;
    if (p.item?.type === 'contextCompaction') observed = true;
    if (method === 'turn/completed' && activeTurn && p.turn.id === activeTurn) {
      if (p.turn.status === 'completed' && observed) settle.resolve({ compacted: true });
      else settle.reject(new Error(p.turn.error?.message || 'Compaction did not complete.'));
    }
  };
  conn.onClose = e => settle.reject(e);
  try { await conn.request('thread/compact/start', { threadId: conn.threadId }); return await finished; }
  finally { clearTimeout(timer); conn.onNotification = prior; conn.onClose = null; }
}
async function manage(pool, o, kind, args = {}) {
  if (kind === 'activity') return pool.workspaces?.get(o.chatId) || { items: [], diff: '', usage: null };
  if (!['skills', 'resources', 'readResource', 'fork', 'compact', 'context'].includes(kind)) throw new Error('Unknown Astra workspace action');
  pool.maintenance ||= new Set();
  if (pool.active.has(o.chatId) || pool.maintenance.has(o.chatId)) throw new Error('Wait for this chat’s current operation to finish.');
  pool.maintenance.add(o.chatId);
  let conn = pool.connections.get(o.chatId);
  try {
    const key = keyOf(o);
    if (conn && (conn.closed || conn.key !== key)) { conn.close(); conn = null; }
    if (!conn) { conn = new Connection({ ...o, spawn: pool.spawn, kill: pool.kill, requestMs: pool.requestMs }); conn.key = key; pool.connections.set(o.chatId, conn); }
    clearTimeout(conn.idleTimer); await conn.ready;
    const config = { ...o.thread.config };
    for (const name of conn.inheritedServers || []) if (!o.servers.includes(name)) config[`mcp_servers.${name}.enabled`] = false;
    for (const name of o.servers) config[`mcp_servers.${name}.enabled`] = true;
    if (kind === 'skills') return await skills(conn, o.cwd);
    if (!o.session?.id) throw new Error('Send a message in this chat first.');
    const signature = JSON.stringify({ ...o.thread, config });
    if (conn.threadId !== o.session.id || conn.signature !== signature) {
      const r = await conn.request('thread/resume', { ...o.thread, config, threadId: o.session.id });
      conn.threadId = r.thread.id; conn.signature = signature;
    }
    conn.onNotification = (m, p) => { if (p.threadId === conn.threadId) record(pool, o.chatId, m, p); };
    if (kind === 'context') return { ...(pool.workspaces?.get(o.chatId) || {}), threadId: conn.threadId };
    if (kind === 'resources') return { data: await resources(conn) };
    if (kind === 'readResource') {
      const list = await resources(conn);
      if (!list.find(s => s.name === args.server)?.resources.some(r => r.uri === args.uri)) throw new Error('This resource is no longer listed by the connection. Refresh the list.');
      const r = await conn.request('mcpServer/resource/read', { threadId: conn.threadId, server: args.server, uri: args.uri }, { soft: true });
      let budget = 64000; let truncated = false;
      const contents = (r.contents || []).slice(0, 30).map(c => { const text = typeof c.text === 'string' ? c.text.slice(0, budget) : null; truncated ||= typeof c.text === 'string' && c.text.length > budget; budget -= text?.length || 0; return { uri: c.uri, mimeType: c.mimeType, text, binary: typeof c.blob === 'string' }; });
      return { contents, truncated: truncated || (r.contents?.length || 0) > 30 };
    }
    if (kind === 'fork') {
      const r = await conn.request('thread/fork', { ...o.thread, config, threadId: conn.threadId, excludeTurns: true });
      if (!r.thread?.id || r.thread.id === conn.threadId) throw new Error('Codex did not return a separate branch.');
      return { session: { id: r.thread.id } };
    }
    const r = await compact(conn);
    const usage = pool.workspaces?.get(o.chatId)?.usage;
    const u = usage?.total;
    const totals = u ? { input: u.inputTokens || 0, output: u.outputTokens || 0, cached: u.cachedInputTokens || 0, reasoning: u.reasoningOutputTokens || 0 } : o.session.totals;
    conn.totals = totals;
    return { ...r, session: { ...o.session, totals }, usage };
  } catch (err) { if (kind === 'compact') conn?.close(err); throw err; }
  finally {
    pool.maintenance.delete(o.chatId);
    if (conn) { conn.onNotification = null; conn.onClose = null; conn.idleTimer = setTimeout(() => { conn.close(); if (pool.connections.get(o.chatId) === conn) pool.connections.delete(o.chatId); }, pool.idleMs); conn.idleTimer.unref?.(); }
  }
}
module.exports = { manage, record, skillInputs };
