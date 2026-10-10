// Local storage for hub-owned data: native chats, website conversations you've opened, memory,
// attachments, token usage and small named stores used by the tools (tasks, notes, prompts…).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CHATS_DIR = path.join(DATA_DIR, 'chats');
const KV_DIR = path.join(DATA_DIR, 'kv');
const TRASH_DIR = path.join(DATA_DIR, 'trash');
const TRASH_DAYS = 30;
const ATTACH_DIR = path.join(DATA_DIR, 'attachments');
const HISTORY_PATH = path.join(DATA_DIR, 'web-history.json');
const MEMORY_PATH = path.join(DATA_DIR, 'memory.json');
const USAGE_PATH = path.join(DATA_DIR, 'usage.json');
const SAFE_ID = /^[\w-]{1,80}$/;

for (const dir of [CHATS_DIR, KV_DIR, ATTACH_DIR, TRASH_DIR]) fs.mkdirSync(dir, { recursive: true });

// Deleted chats wait in data/trash for 30 days so a mistaken delete can be undone.
function trashChat(id) {
  const src = chatPath(id);
  if (!fs.existsSync(src)) return;
  fs.renameSync(src, path.join(TRASH_DIR, `${id}.json`));
}
function listTrash() {
  const cutoff = Date.now() - TRASH_DAYS * 864e5;
  const out = [];
  for (const f of fs.readdirSync(TRASH_DIR).filter((x) => x.endsWith('.json'))) {
    const file = path.join(TRASH_DIR, f);
    const deletedAt = fs.statSync(file).mtimeMs;
    if (deletedAt < cutoff) { fs.rmSync(file, { force: true }); continue; }
    const chat = readJson(file, null);
    if (chat) out.push({ id: chat.id, agentId: chat.agentId, title: chat.title, messages: chat.messages?.length || 0, deletedAt });
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt);
}
function restoreChat(id) {
  if (!SAFE_ID.test(id)) throw new Error(`bad chat id: ${id}`);
  const file = path.join(TRASH_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return false;
  fs.renameSync(file, chatPath(id));
  return true;
}

function chatPath(id) {
  if (!SAFE_ID.test(id)) throw new Error(`bad chat id: ${id}`);
  return path.join(CHATS_DIR, `${id}.json`);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// Write to a temp file first so a crash mid-write can't corrupt a chat.
// Sync (syncmain.js) can merge a save with a version that just arrived from another computer (beforeWrite).
let beforeWrite = null;
function writeJson(file, value) {
  if (beforeWrite) { try { value = beforeWrite(file, value) ?? value; } catch { /* save as given */ } }
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function allChats() {
  return fs.readdirSync(CHATS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(CHATS_DIR, f), null))
    .filter(Boolean);
}

function listChats() {
  return allChats()
    .map(({ id, agentId, title, updatedAt, pinned, model }) => ({ id, agentId, title, updatedAt, pinned: Boolean(pinned), model }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Full-text search through every native chat's messages.
function searchChats(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = [];
  for (const chat of allChats()) {
    let count = 0;
    let snippet = null;
    for (const m of chat.messages || []) {
      const t = m.text || '';
      const i = t.toLowerCase().indexOf(q);
      if (i < 0) continue;
      count += 1;
      snippet ||= `${i > 50 ? '…' : ''}${t.slice(Math.max(0, i - 50), i + q.length + 70).replace(/\s+/g, ' ')}`;
    }
    if (count || chat.title?.toLowerCase().includes(q)) {
      hits.push({ id: chat.id, agentId: chat.agentId, title: chat.title, updatedAt: chat.updatedAt, count, snippet });
    }
  }
  return hits.sort((a, b) => b.count - a.count || b.updatedAt - a.updatedAt).slice(0, 100);
}

const kvPath = (name) => {
  if (!SAFE_ID.test(name)) throw new Error(`bad store name: ${name}`);
  return path.join(KV_DIR, `${name}.json`);
};

// Reference files for Lab sketches are copied here, so they keep working if the original moves.
function importRef(src) {
  const dir = path.join(DATA_DIR, 'refs');
  fs.mkdirSync(dir, { recursive: true });
  const safe = path.basename(src).replace(/[^\w.\- ]+/g, '_').slice(-80) || 'file';
  const file = path.join(dir, `${Date.now()}-${safe}`);
  fs.copyFileSync(src, file);
  return file;
}

function saveAttachment(name, base64) {
  const safe = name.replace(/[^\w.\- ]+/g, '_').slice(-80) || 'file';
  const file = path.join(ATTACH_DIR, `${Date.now()}-${safe}`);
  fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  return file;
}

// usage.json: { "2026-10-04": { claude: { input, output, replies, cached } } }
// meta (optional): { chatId, model, dock, ms, tools } for the meter's richer aggregates below.
const dayKey = (t = Date.now()) => new Date(t).toLocaleDateString('en-CA');
function addUsage(agentId, usage, meta = {}) {
  if (!usage) return;
  const all = readJson(USAGE_PATH, {});
  const day = dayKey();
  const entry = ((all[day] ||= {})[agentId] ||= { input: 0, output: 0, replies: 0 });
  entry.input += usage.input || 0;
  entry.output += usage.output || 0;
  entry.replies += 1;
  if (usage.cached) entry.cached = (entry.cached || 0) + usage.cached;
  writeJson(USAGE_PATH, all);
  try { addTokenStat(agentId, usage, meta); } catch { /* the meter's aggregates are best-effort */ }
}

// ---------- token stats (the meter, meter.js) ----------
// kv/token-stats.json, one small update per reply (written compact, no .prev copy):
// { v, since, backfilledAt,
//   days: { 'YYYY-MM-DD': { a: { agentId: T }, m: { model: T }, t: { tool: T }, h: { hour: tokens } } },
//   chats: { chatId: { a, model, last, peak, ctx, ...T } } }
// T = { i: input (cached included), o: output, c: cache reads, w: cache writes, r: replies, ms, tools, cost }
const STATS_PATH = path.join(KV_DIR, 'token-stats.json');
const emptyStats = () => ({ v: 1, since: Date.now(), days: {}, chats: {} });
const round6 = (n) => Math.round(n * 1e6) / 1e6;
function bump(t, usage, meta) {
  t.i = (t.i || 0) + (usage.input || 0);
  t.o = (t.o || 0) + (usage.output || 0);
  if (usage.cached) t.c = (t.c || 0) + usage.cached;
  if (usage.cacheWrite) t.w = (t.w || 0) + usage.cacheWrite;
  if (usage.cost) t.cost = round6((t.cost || 0) + usage.cost);
  if (meta.ms) t.ms = (t.ms || 0) + meta.ms;
  if (meta.tools) t.tools = (t.tools || 0) + meta.tools;
  t.r = (t.r || 0) + (meta.replies ?? 1);
  return t;
}
// Which tool a reply belongs to: a docked director's tool, a one-off second opinion, or plain chat.
const toolOf = (meta) => (meta.chatId?.startsWith('once-') ? 'second-opinion' : meta.dock || 'chat');
function statInto(stats, agentId, usage, meta, at = Date.now()) {
  const day = (stats.days[dayKey(at)] ||= { a: {}, m: {}, t: {}, h: {} });
  bump(day.a[agentId] ||= {}, usage, meta);
  bump(day.m[meta.model || 'default'] ||= {}, usage, meta);
  bump(day.t[toolOf(meta)] ||= {}, usage, meta);
  const hour = new Date(at).getHours();
  day.h[hour] = (day.h[hour] || 0) + (usage.input || 0) + (usage.output || 0);
  if (meta.chatId && !meta.chatId.startsWith('once-')) {
    const c = (stats.chats[meta.chatId] ||= { a: agentId });
    bump(c, usage, meta);
    c.last = at;
    c.peak = Math.max(c.peak || 0, usage.input || 0);
    c.ctx = usage.input || 0; // what the latest message sent as context
    if (meta.model) c.model = meta.model;
  }
}
const writeStats = (stats) => { const tmp = `${STATS_PATH}.tmp`; fs.writeFileSync(tmp, JSON.stringify(stats)); fs.renameSync(tmp, STATS_PATH); };
function addTokenStat(agentId, usage, meta) {
  const stats = readJson(STATS_PATH, null);
  if (!stats?.backfilledAt) return; // the first read builds everything from the chats (this reply included)
  statInto(stats, agentId, usage, meta);
  writeStats(stats);
}
// First run (and "rebuild"): everything the chats recorded (every reply keeps its usage), then each day
// topped up to usage.json's per-agent counts, which also saw deleted chats and second opinions.
function buildTokenStats(agents = []) {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const stats = emptyStats();
  let first = Date.now();
  for (const chat of allChats()) {
    const agent = byId.get(chat.agentId) || {};
    for (const m of chat.messages || []) {
      if (m.role !== 'assistant' || !m.usage || !m.at) continue;
      first = Math.min(first, m.at);
      statInto(stats, chat.agentId, m.usage, { chatId: chat.id, model: chat.model || agent.model || '', dock: agent.dock || '', ms: m.ms || 0, tools: m.tools?.length || 0 }, m.at);
    }
  }
  for (const [day, perAgent] of Object.entries(readJson(USAGE_PATH, {}))) {
    for (const [agentId, u] of Object.entries(perAgent || {})) {
      const have = stats.days[day]?.a?.[agentId] || {};
      const gap = { input: Math.max(0, (u.input || 0) - (have.i || 0)), output: Math.max(0, (u.output || 0) - (have.o || 0)) };
      const replies = Math.max(0, (u.replies || 0) - (have.r || 0));
      if (!gap.input && !gap.output && !replies) continue;
      const d = (stats.days[day] ||= { a: {}, m: {}, t: {}, h: {} });
      bump(d.a[agentId] ||= {}, gap, { replies });
      bump(d.t.untracked ||= {}, gap, { replies });
      first = Math.min(first, new Date(`${day}T12:00`).getTime());
    }
  }
  stats.since = first;
  stats.backfilledAt = Date.now();
  writeStats(stats);
  return stats;
}
function getTokenStats(agents) {
  const stats = readJson(STATS_PATH, null);
  return stats?.backfilledAt ? stats : buildTokenStats(agents);
}

module.exports = {
  DATA_DIR,
  ATTACH_DIR,
  listChats,
  searchChats,
  getChat: (id) => readJson(chatPath(id), null),
  saveChat: (chat) => writeJson(chatPath(chat.id), chat),
  deleteChat: (id) => trashChat(id),
  listTrash,
  restoreChat,
  getHistory: () => readJson(HISTORY_PATH, {}),
  saveHistory: (history) => writeJson(HISTORY_PATH, history),
  // { shared: "notes for every agent", agents: { [agentId]: "notes for one agent" } }
  getMemory: () => ({ shared: '', agents: {}, ...readJson(MEMORY_PATH, {}) }),
  saveMemory: (memory) => writeJson(MEMORY_PATH, memory),
  getKV: (name, fallback = null) => readJson(kvPath(name), fallback),
  setKV: (name, value) => {
    // Keep the previous version of every store as <name>.prev.json (one step of undo for tools).
    const file = kvPath(name);
    if (fs.existsSync(file)) fs.copyFileSync(file, file.replace(/\.json$/, '.prev.json'));
    writeJson(file, value);
  },
  saveAttachment,
  importRef,
  ATTACH_DIR,
  addUsage,
  getUsage: () => readJson(USAGE_PATH, {}),
  getTokenStats,
  rebuildTokenStats: buildTokenStats,
  setBeforeWrite: (fn) => { beforeWrite = typeof fn === 'function' ? fn : null; },
};
