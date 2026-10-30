// Where its tokens go (round 36, tokenaudit), main side: measures the fixed part one AI's every message carries, from
// what the engine really gets: the system prompt's named parts (engines.js promptParts, the same text buildPrompt joins
// for --system-prompt / Codex's instructions file), each Hearth tool set's definitions (mcp/cost.js exactOf, the lists
// the MCP servers serve), claude.ai connectors (their tool names from Claude's own startup report, connectors.json; the
// definitions themselves aren't reported, so ≈ an estimate per tool), the owner's own connections (their measured list
// from Test) and hooks (they live in Hearth: 0 tokens). For each tool it also measures what switching it off would save
// (the prompt rebuilt without it), so a trim's number is the next prompt's real change. Reads only; changes nothing.
// Also a one-time history seed for the tool-use log: tool calls in the chats of the last 35 days (message.tools).
// Loaded on first use (main.js lazyIpc); tokenaudit.js is the renderer side, tokenaudit-core.js the plain rules.
const fs = require('fs');
const path = require('path');

const tok = (s) => Math.round(String(s || '').length / 4);
const CONNECTOR_TOOL = 350; // ≈ tokens one claude.ai connector tool's definition adds (name, description, schema)
const req = (m) => { try { return require(m); } catch { return null; } };
const deps = { engines: () => req('./engines'), cost: () => req('./mcp/cost'), Conn: () => req('./connectionsmain') };

// the fixed part as a number (what the trims are measured against): the whole prompt + every tool definition
function fixedOf(agent, d) {
  const prompt = tok(d.engines.buildPrompt(agent));
  const sets = d.cost.exactOf({ ...agent, exact: true }).tools.reduce((n, t) => n + t[1], 0);
  return prompt + sets + connectorTools(agent, d).reduce((n, t) => n + t.tokens, 0) + connTools(agent, d).reduce((n, t) => n + t.tokens, 0);
}
const prefix = (name) => String(name).replace(/[^A-Za-z0-9_-]/g, '_');
function connectorTools(agent, d) {
  if (agent.engine !== 'claude' || !d.engines.readConnectorCache) return [];
  const cache = d.engines.readConnectorCache()?.claude || {};
  const all = Array.isArray(cache.tools) ? cache.tools : [];
  return Object.entries(agent.connectors || {}).filter(([, m]) => m === 'read' || m === 'full').map(([name, mode]) => {
    const p = `mcp__${prefix(name)}__`;
    const tools = all.filter((t) => t.startsWith(p)).map((t) => t.slice(p.length));
    const n = mode === 'read' ? tools.filter((t) => d.engines.isReadOnlyTool(t)).length : tools.length;
    return { key: `connector:${name}`, kind: 'connector', id: name, name: name.replace(/^claude\.ai\s+/, ''), tokens: n * CONNECTOR_TOOL, count: n, estimate: true, servers: [prefix(name)] };
  });
}
function connTools(agent, d) {
  if (!d.Conn?.enabledFor) return [];
  return d.Conn.enabledFor(agent).map(({ conn, mode, name }) => {
    const list = Array.isArray(conn.tools) ? conn.tools : [];
    // read only: the tools that only look (the others are blocked, Codex doesn't list them)
    const share = mode === 'read' && list.length ? list.filter((t) => t.ro).length / list.length : 1;
    return { key: `conn:${conn.id}`, kind: 'conn', id: conn.id, name: conn.name || name, tokens: Math.round((conn.tokens || 0) * share), untested: !conn.tokens, servers: [name] };
  });
}
// the agent with one tool off, the same way ⋯ AI setup / the trim switches it off (tokenaudit.js offPatch)
function without(agent, t) {
  const a = JSON.parse(JSON.stringify(agent));
  if (t.kind === 'set') {
    if (t.id === 'chatTools') { if (a.engine === 'codex') { delete a.chatTools; delete a.hubTools; } else a.chatTools = false; } else if (t.id === 'openTool') a.openTool = false; else delete a[t.id];
  } else if (t.kind === 'connector') { delete a.connectors?.[t.id]; } else if (t.kind === 'conn') { delete a.connections?.[t.id]; }
  return a;
}

function measure(agent, d = { engines: deps.engines(), cost: deps.cost(), Conn: deps.Conn() }) {
  if (!agent || !d.engines?.promptParts || !d.cost) return { error: 'Nothing to measure here.' };
  const a = JSON.parse(JSON.stringify(agent));
  delete a.hubChatId;
  const parts = d.engines.promptParts(a, null);
  const servers = d.engines.HUB_TOOLSETS || {};
  const sets = d.cost.exactOf({ ...a, exact: true }).tools.map(([k, n]) => ({ key: `set:${k}`, kind: 'set', id: k, tokens: n, servers: servers[k] ? [servers[k].server] : [] }));
  const tools = [...sets, ...connectorTools(a, d), ...connTools(a, d)];
  const total = fixedOf(a, d);
  for (const t of tools) { try { t.saves = Math.max(0, total - fixedOf(without(a, t), d)); } catch { /* measured without it: no */ } }
  // memory that goes only with the messages it's about (big, or /memory relevant on): no part in the prompt
  let memory = parts.some(([k]) => k === 'memory') ? 'prompt' : 'none';
  try { const m = req('./store')?.getMemory?.(); if (memory === 'none' && !a.memoryOff && [m?.shared, ...Object.entries(m?.places || {}).filter(([p]) => (req('./context-core')?.PLACES || []).some((x) => x.id === p && x.on(a))).map(([, v]) => v), m?.agents?.[a.id]].some((x) => String(x || '').trim())) memory = 'relevant'; /* (round 38) + its places */ } catch { /* no store */ }
  return { parts, tools, total, chars: d.engines.buildPrompt(a).length, hooks: (Array.isArray(a.hooks) ? a.hooks : []).filter((h) => h && h.on !== false).length, memory };
}

// tool calls in the chats of the last `days` days: { since, days: { day: { agentId: { server: n } } } }
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// one chat's tool calls into the log (the seed's work per file)
function addChat(log, chat, from) {
  for (const m of Array.isArray(chat?.messages) ? chat.messages : []) {
    if (!m || !m.at) continue;
    if (m.at < from) { log.since = Math.min(log.since, from); continue; }
    log.since = Math.min(log.since, m.at);
    if (m.role !== 'assistant' || !Array.isArray(m.tools) || !chat.agentId) continue;
    for (const n of m.tools) {
      const s = /^mcp__(.+?)__/.exec(String(n))?.[1] || /^([\w-]+) · [\w-]+$/.exec(String(n))?.[1];
      if (!s || /^(Shell|Edited|Edit failed|Web search)$/.test(s)) continue;
      const day = (log.days[dayKey(m.at)] ||= {});
      const mine = (day[chat.agentId] ||= {});
      mine[s] = (mine[s] || 0) + 1;
    }
  }
}
async function seed(chatsDir, days = 35, now = Date.now()) {
  const from = now - days * 864e5;
  const log = { since: now, days: {}, seeded: now };
  let names = [];
  try { names = (await fs.promises.readdir(chatsDir)).filter((f) => f.endsWith('.json')); } catch { return log; }
  for (const f of names) {
    const file = path.join(chatsDir, f);
    let st;
    try { st = await fs.promises.stat(file); } catch { continue; }
    if (st.mtimeMs < from) { log.since = Math.min(log.since, from); continue; } // older history exists: tracked from the window's start
    if (st.size > 60e6) continue;
    let chat;
    try { chat = JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch { continue; }
    addChat(log, chat, from);
    await new Promise((r) => setImmediate(r)); // one chat at a time: the window stays smooth
  }
  return log;
}
// (round 93, perf93) the same seed on the store's folder thread (storework.js op toolSeed): reading and parsing every
// chat of the last 35 days (a giant one is ~55 MB of JSON) held the main process ~1 s on a profile without the log
// yet. The same answer; synchronous there (a thread of its own)
function seedSync(chatsDir, days = 35, now = Date.now()) {
  const from = now - days * 864e5;
  const log = { since: now, days: {}, seeded: now };
  let names = [];
  try { names = fs.readdirSync(chatsDir).filter((f) => f.endsWith('.json')); } catch { return log; }
  for (const f of names) {
    const file = path.join(chatsDir, f);
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    if (st.mtimeMs < from) { log.since = Math.min(log.since, from); continue; }
    if (st.size > 60e6) continue;
    let chat;
    try { chat = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    addChat(log, chat, from);
  }
  return log;
}

// (main.js lazyIpc finds the channels by how they are spelled below: keep the parameter named ipcMain)
function register(ipcMain, opts = {}) {
  ipcMain.handle('tokenaudit:measure', (_e, agent) => { try { return measure(agent); } catch (err) { return { error: err.message }; } });
  ipcMain.handle('tokenaudit:seed', async () => {
    const dir = path.join(opts.dataDir || req('./store')?.DATA_DIR || '.', 'chats');
    // (round 93, perf93) on the store's folder thread when there is one; here (a chat at a time) when not
    const off = req('./store')?.runOff;
    if (off) { try { const r = await off('toolSeed', { dir, days: 35, now: Date.now() }); if (r && r.days) return r; } catch { /* no thread: here */ } }
    try { return await seed(dir); } catch (err) { return { error: err.message }; }
  });
}

module.exports = { register, measure, seed, seedSync, without, fixedOf, CONNECTOR_TOOL };
