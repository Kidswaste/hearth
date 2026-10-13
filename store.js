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
  if (pending.has(src)) return idle().then(() => trashChat(id)); // (round 20) its last save lands first, then it moves
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
  const p = pending.get(file); // (round 20) saved a moment ago, still on its way to the disk (storework.js)
  if (p) return structuredClone(p.value);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// ---------- (round 20, offmain) the writer thread ----------
// Chats, kv stores, memory and history are saved by storework.js on its own thread (stringify + write + rename, a
// skipped write when nothing changed), so the main process stays free to answer the window. Until a save is on disk
// its value is kept here (pending) and every read returns it; the chats list and the search run on the same thread,
// after the saves asked before them. Electron only (Node tests and tools write synchronously, as before); if the
// thread can't start or dies, writes go back to synchronous. idle() resolves once everything asked is on disk
// (sync passes wait for it); flushSync() writes what's left on quit.
const pending = new Map(); // file → { value, n }
let worker = null; let workerOff = !process.versions.electron && !process.env.HEARTH_STORE_THREAD; let jobSeq = 0; let writeSeq = 0;
const jobs = new Map(); // id → { resolve, reject }
const wstats = { writes: 0, skipped: 0, ms: 0, fallbacks: 0 };
function thread() {
  if (worker || workerOff) return worker;
  try {
    const { Worker } = require('worker_threads');
    worker = new Worker(path.join(__dirname, 'storework.js'));
    worker.on('message', ({ id, res, err, ms }) => { const j = jobs.get(id); if (!j) return; jobs.delete(id); wstats.ms += ms || 0; if (err) j.reject(new Error(err)); else j.resolve(res); });
    const dead = (why) => { workerOff = true; worker = null; for (const j of jobs.values()) j.reject(new Error(`store thread: ${why}`)); jobs.clear(); };
    worker.on('error', (err) => dead(err.message));
    worker.on('exit', (code) => { if (worker) dead(`exited (${code})`); });
  } catch { workerOff = true; worker = null; }
  return worker;
}
function ask(msg) {
  const w = thread();
  if (!w) return Promise.reject(new Error('no store thread'));
  const id = ++jobSeq;
  return new Promise((resolve, reject) => { jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); });
}
function writeSync(file, value, prev) {
  if (prev && fs.existsSync(file)) fs.copyFileSync(file, prev);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
function writeOff(file, value, { prev = null, chat = false } = {}) {
  if (!thread()) { writeSync(file, value, prev); return; }
  const n = ++writeSeq;
  pending.set(file, { value, n });
  ask({ op: 'write', file, value, prev, chatDir: chat })
    .then((r) => { wstats.writes += 1; if (r?.skipped) wstats.skipped += 1; })
    .catch(() => { wstats.fallbacks += 1; if (pending.get(file)?.n === n) { try { writeSync(file, value, prev); } catch (err) { console.error('save failed', file, err.message); } } })
    .finally(() => { if (pending.get(file)?.n === n) pending.delete(file); });
}
// (round 20) a second copy of the thread for folder work (fsapi.js: recursive listings, searching a folder), so a big
// folder never holds up a save; started on first use, Electron only
let filesWorker = null; let filesSeq = 0; const filesJobs = new Map();
function runOff(op, args) {
  if (workerOff && !worker) return Promise.reject(new Error('no store thread'));
  if (!filesWorker) {
    try {
      const { Worker } = require('worker_threads');
      filesWorker = new Worker(path.join(__dirname, 'storework.js'));
      filesWorker.on('message', ({ id, res, err }) => { const j = filesJobs.get(id); if (!j) return; filesJobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
      const dead = (why) => { filesWorker = null; for (const j of filesJobs.values()) j.reject(new Error(why)); filesJobs.clear(); };
      filesWorker.on('error', (e) => dead(e.message)); filesWorker.on('exit', () => dead('exited'));
    } catch (err) { filesWorker = null; return Promise.reject(err); }
  }
  const id = ++filesSeq;
  return new Promise((resolve, reject) => { filesJobs.set(id, { resolve, reject }); filesWorker.postMessage({ ...args, op, id }); });
}
// resolves when every save asked so far is on disk (the thread works in order: a ping answers after them)
function idle() { return worker ? ask({ op: 'ping' }).catch(() => null) : Promise.resolve(null); }
// on quit: the thread is stopped and what is still pending is written here, synchronously
function flushSync() {
  const w = worker; worker = null; workerOff = true;
  try { w?.terminate(); } catch { /* gone */ }
  try { filesWorker?.terminate(); } catch { /* gone */ }
  for (const [file, { value }] of pending) { try { writeSync(file, value, null); } catch (err) { console.error('save failed', file, err.message); } }
  pending.clear();
}

// Write to a temp file first so a crash mid-write can't corrupt a chat.
// Sync (syncmain.js) can merge a save with a version that just arrived from another computer (beforeWrite).
let beforeWrite = null;
function writeJson(file, value, o) {
  if (beforeWrite) { try { value = beforeWrite(file, value) ?? value; } catch { /* save as given */ } }
  if (o?.off) writeOff(file, value, o); else writeSync(file, value, o?.prev);
}

function allChats() {
  return fs.readdirSync(CHATS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(CHATS_DIR, f), null))
    .filter(Boolean);
}

// (round 20) on the store thread when it runs (a Promise then): only changed chat files are read again
function listChats() {
  if (thread()) return ask({ op: 'list', dir: CHATS_DIR }).catch(() => listChatsSync());
  return listChatsSync();
}
function listChatsSync() {
  return allChats()
    .map(({ id, agentId, title, updatedAt, pinned, model }) => ({ id, agentId, title, updatedAt, pinned: Boolean(pinned), model }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

// Full-text search through every native chat's messages.
function searchChats(query) {
  if (thread()) return ask({ op: 'search', dir: CHATS_DIR, query: String(query || '') }).catch(() => searchChatsSync(query));
  return searchChatsSync(query);
}
function searchChatsSync(query) {
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

// (round 29, safetynet) a kv store that can't be read (cut short by a crash, garbled) falls back to its previous
// version (<name>.prev.json, kept by every save) instead of starting empty and being saved over
function readKV(file, fallback) {
  const p = pending.get(file);
  if (p) return structuredClone(p.value);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return fallback; }
  try { return JSON.parse(text); } catch { /* below */ }
  const prev = readJson(file.replace(/\.json$/, '.prev.json'), undefined);
  if (prev !== undefined) { console.warn(`store: ${path.basename(file)} could not be read; using its previous version`); return prev; }
  return fallback;
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
  saveChat: (chat) => writeJson(chatPath(chat.id), chat, { off: true, chat: true }),
  deleteChat: (id) => trashChat(id),
  listTrash,
  restoreChat,
  getHistory: () => readJson(HISTORY_PATH, {}),
  saveHistory: (history) => writeJson(HISTORY_PATH, history, { off: true }),
  // { shared: "notes for every agent", agents: { [agentId]: "notes for one agent" } }
  getMemory: () => ({ shared: '', agents: {}, ...readJson(MEMORY_PATH, {}) }),
  saveMemory: (memory) => writeJson(MEMORY_PATH, memory, { off: true }),
  getKV: (name, fallback = null) => readKV(kvPath(name), fallback),
  // (round 20) the kv:get IPC: a big store (over 512 KB, e.g. the Lab scenes) is read and parsed on the store thread
  getKVOff: (name, fallback = null) => {
    const file = kvPath(name);
    if (pending.has(file) || !thread()) return readKV(file, fallback);
    let size = 0; try { size = fs.statSync(file).size; } catch { return fallback; }
    return size > 512 * 1024 ? ask({ op: 'read', file, fallback }).catch(() => readKV(file, fallback)) : readKV(file, fallback);
  },
  setKV: (name, value) => {
    // Keep the previous version of every store as <name>.prev.json (one step of undo for tools).
    // (round 20) the copy is made on the store thread right before the write, and skipped with it when nothing changed
    const file = kvPath(name);
    writeJson(file, value, { off: true, prev: file.replace(/\.json$/, '.prev.json') });
  },
  saveAttachment,
  importRef,
  ATTACH_DIR,
  addUsage,
  getUsage: () => readJson(USAGE_PATH, {}),
  getTokenStats,
  rebuildTokenStats: buildTokenStats,
  setBeforeWrite: (fn) => { beforeWrite = typeof fn === 'function' ? fn : null; },
  _sync: { list: () => listChatsSync(), search: (q) => searchChatsSync(q) }, // (tests) the code the thread replaces
  idle, flushSync, runOff, pendingCount: () => pending.size, writerStats: () => ({ ...wstats, thread: Boolean(worker), pending: pending.size }),
};
