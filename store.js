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
// (round 43, scenesafe) reads that say what happened, the Lab scenes' guard and rotating copies (scenesafe-core.js)
const SS = require('./scenesafe-core');
const ssEnv = { fs, path, cache: new Map() };
// (round 43, datasafe) the same for every other store: a read that failed is never "empty", a store read with a
// fallback is merged with the disk before it's saved, a held file is never written blind (datasafe-core.js)
const DS = require('./datasafe-core');
const dfs = DS.faults(fs, DATA_DIR); // (tests: Windows-style errors from data/.datasafe-faults.json, smoke runs only)
const dsEnv = { fs: dfs, path, cache: new Map() };
const doubts = new Map(); // file → { name, why, code, at } — read with a fallback / a copy in this window's session
const seen = new Set(); // files read or written since the window started (a save without a read is "blind")
const held = new Map(); // file → { value, o, tries, t } — a save that waits for a held file to read again
let chatsDoubt = null; // { at, why, n } when the chats folder (or some chat files) couldn't be read

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
  // (round 43, datasafe) a held file is read again a few times, then its .prev copy; a failure is remembered (doubt), so
  // a save built on the fallback is merged with the file instead of replacing it
  const r = DS.load(dfs, file, fallback);
  seen.add(file);
  noteDoubt(file, r);
  return r.value;
}
// (round 43, datasafe) what's in doubt, for the calm card (datasafe.js) and the guard before a save
const nameOf = (file) => DS.storeOf(file)?.name || (/[\\/]chats[\\/]/.test(file) ? `chat:${path.basename(file, '.json')}` : path.basename(file, '.json'));
function noteDoubt(file, r) {
  if (!r?.doubt || SS.guardedName(file)) return;
  if (!doubts.has(file)) { try { doubtCb?.(); } catch { /* no window yet */ } }
  if (!doubts.has(file)) console.warn(`store: ${path.basename(file)} ${r.state === 'unreadable' ? `could not be read (${r.code})` : 'read from its copy'}; a save will be merged with it, not written over it`);
  doubts.set(file, { name: nameOf(file), why: r.state === 'unreadable' && r.from !== 'prev' ? 'unreadable' : r.garbled ? 'damaged' : 'copy', code: r.code || null, at: Date.now() });
}
let doubtCb = null; // main.js: the window is told (datasafe.js shows the calm card)
const dsFlags = (file) => (SS.guardedName(file) ? {} : { doubt: doubts.has(file), blind: !seen.has(file) });
const isHeld = (err) => err?.code === 'EHELD' || /can't be read just now/.test(String(err?.message || err));
// a save refused because the file can't be read: tried again (1 s, 2 s, 4 s … then every 2 min, ~25 times)
function hold(file, value, o) {
  const h = held.get(file) || { tries: 0 };
  clearTimeout(h.t);
  h.value = value; h.o = o; h.tries += 1;
  if (h.tries > 25) { held.delete(file); console.error('store: gave up saving', path.basename(file), '(it never read again)'); return { held: true, gaveUp: true }; }
  h.t = setTimeout(() => { if (held.get(file) === h) writeJson(file, h.value, { ...h.o, off: true }); }, Math.min(120000, 1000 * 2 ** Math.min(h.tries - 1, 7)));
  h.t.unref?.();
  held.set(file, h);
  if (h.tries === 1) { try { doubtCb?.(); } catch { /* no window yet */ } }
  return { held: true };
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
function writeSync(file, value, prev, g = null) {
  let keepPrev = true; let restored = null; let kept = 0;
  if (!SS.guardedName(file) && (g?.doubt || g?.blind || DS.storeOf(file))) { // (round 43, datasafe) throws EHELD: nothing written
    const d = DS.guardWrite(dsEnv, { file, value, doubt: g?.doubt, blind: g?.blind });
    keepPrev = d.keepPrev; value = d.value; kept = d.kept;
  }
  if (SS.guardedName(file)) { // (round 43, scenesafe) as on the store thread (storework.js write)
    const r = SS.prepareWrite(ssEnv, { file, value, sent: g?.sent, removed: g?.removed });
    keepPrev = r.keepPrev;
    if (r.value !== value) { value = r.value; restored = r.restored.length ? r.restored : null; }
  }
  if (prev && keepPrev && fs.existsSync(file)) fs.copyFileSync(file, prev);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
  if (SS.guardedName(file)) SS.afterWrite(ssEnv, file, value);
  seen.add(file); held.delete(file);
  return restored ? { restored } : kept ? { kept } : undefined;
}
// (round 35, bugbash2) returns a promise that settles once this save is on disk (or was given up on: never rejects), so
// the kv:set / chats:save IPC answers only then: `await hub.kvSet(…)` means "written", and something reading the file
// itself right after (a fake engine's switches, another process) sees the new value
// (round 43, scenesafe) resolves with { restored: [ids] } when the scenes guard kept scenes the save would have dropped
// (round 43, datasafe) resolves with { held: true } when the file couldn't be read to merge with (tried again later),
// { kept: n } when a save built on a failed read was merged with the disk
function writeOff(file, value, { prev = null, chat = false, sent, removed } = {}) {
  const ds = dsFlags(file);
  const o = { prev, chat, removed };
  if (!thread()) { try { return Promise.resolve(writeSync(file, value, prev, { sent, removed, ...ds })); } catch (err) { if (isHeld(err)) return Promise.resolve(hold(file, value, o)); console.error('save failed', file, err.message); return Promise.resolve(); } }
  const n = ++writeSeq;
  pending.set(file, { value, n });
  seen.add(file);
  return ask({ op: 'write', file, value, prev, chatDir: chat, sent, removed, ...ds })
    .then((r) => { wstats.writes += 1; if (r?.skipped) wstats.skipped += 1; held.delete(file); return r?.restored ? { restored: r.restored } : r?.kept ? { kept: r.kept } : undefined; })
    .catch((err) => {
      if (isHeld(err)) { if (pending.get(file)?.n === n) pending.delete(file); return hold(file, value, o); } // never written blind: the disk stays as it is
      wstats.fallbacks += 1;
      if (pending.get(file)?.n === n) { try { return writeSync(file, value, prev, { sent, removed, ...ds }); } catch (e2) { if (isHeld(e2)) { pending.delete(file); return hold(file, value, o); } console.error('save failed', file, e2.message); } }
      return undefined;
    })
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
  for (const [file, { value }] of pending) { try { writeSync(file, value, null, SS.guardedName(file) ? { sent: SS.idsOf(value) } : null); } catch (err) { console.error('save failed', file, err.message); } }
  pending.clear();
}

// Write to a temp file first so a crash mid-write can't corrupt a chat.
// Sync (syncmain.js) can merge a save with a version that just arrived from another computer (beforeWrite).
let beforeWrite = null;
function writeJson(file, value, o) {
  // (round 43, scenesafe) the ids the caller sent, before sync's merge: the guard tells "not sent" from "merged away"
  const sent = SS.guardedName(file) && Array.isArray(value) ? SS.idsOf(value) : undefined;
  if (beforeWrite) { try { value = beforeWrite(file, value) ?? value; } catch { /* save as given */ } }
  if (o?.off) return writeOff(file, value, { ...o, sent });
  try { return writeSync(file, value, o?.prev, { sent, removed: o?.removed, ...dsFlags(file) }); } catch (err) { if (isHeld(err)) return hold(file, value, o || {}); throw err; }
}

function allChats() {
  return chatNames()
    .map((f) => readJson(path.join(CHATS_DIR, f), null))
    .filter(Boolean);
}
// (round 43, datasafe) the chats folder read again when it's held for a moment; still unreadable → noted and thrown (the
// list then keeps what it showed: listChatsSync), never "no chats"
function chatNames() {
  for (let i = 0; ; i++) {
    try { return dfs.readdirSync(CHATS_DIR).filter((f) => f.endsWith('.json')); } catch (err) {
      if (err.code === 'ENOENT') return [];
      if (i >= 4 || !DS.BUSY.has(err.code)) { chatsDoubt = { at: Date.now(), why: 'folder', code: err.code }; throw err; }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40 * (i + 1));
    }
  }
}

// (round 20) on the store thread when it runs (a Promise then): only changed chat files are read again
// (round 43, datasafe) a chat file that can't be read keeps its row (its last known one, or a stub): a list is never
// shorter because a read failed; a folder that can't be listed gives the last list (and the card says so)
let lastList = null;
function listChats() {
  if (thread()) {
    return ask({ op: 'list', dir: CHATS_DIR, ds: true }).then((r) => {
      chatsDoubt = r.doubt ? { at: Date.now(), ...r.doubt } : null;
      lastList = r.list; return r.list.slice();
    }).catch(() => listChatsSync());
  }
  return listChatsSync();
}
function listChatsSync() {
  let names;
  try { names = chatNames(); } catch { return lastList ? lastList.slice() : []; }
  const out = []; let bad = 0;
  for (const f of names) {
    const file = path.join(CHATS_DIR, f);
    const c = readJson(file, null);
    if (c && typeof c === 'object') { const { id, agentId, title, updatedAt, pinned, model } = c; out.push({ id, agentId, title, updatedAt, pinned: Boolean(pinned), model }); continue; }
    bad += 1;
    let st = null; try { st = fs.statSync(file); } catch { /* gone meanwhile */ }
    if (st) out.push(lastList?.find((x) => x.id === f.slice(0, -5)) || DS.chatStub(f, st));
  }
  chatsDoubt = bad ? { at: Date.now(), why: 'files', n: bad } : null;
  lastList = out.sort((a, b) => b.updatedAt - a.updatedAt);
  return lastList.slice();
}

// Full-text search through every native chat's messages.
function searchChats(query) {
  if (thread()) return ask({ op: 'search', dir: CHATS_DIR, query: String(query || '') }).catch(() => searchChatsSync(query));
  return searchChatsSync(query);
}
// (round 30) recall: the ranked "what did we decide about X?" (storework.js op recall; here when there is no thread)
let recallLocal = null;
function recall(o = {}) {
  if (thread()) return ask({ op: 'recall', dir: CHATS_DIR, q: String(o.q || ''), budgetMs: o.budgetMs || 12, limit: o.limit }).catch(() => recallSync(o));
  return recallSync(o);
}
function recallSync({ q = '', limit } = {}) {
  const R = require('./recall-core');
  recallLocal ||= R.createIndex();
  const all = allChats();
  for (const c of all) recallLocal.add(c.id, c);
  for (const k of recallLocal.keys()) if (!all.some((c) => c.id === k)) recallLocal.drop(k);
  const byId = new Map(all.map((c) => [c.id, c]));
  return q ? { ...recallLocal.search(q, { textOf: (id, k) => byId.get(id)?.messages?.[k]?.text || '', limit }), left: 0 } : { left: 0, ...recallLocal.size() };
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
// (round 43, scenesafe) a file another program holds for a moment (Windows: an antivirus, OneDrive / iCloud for Windows,
// the search indexer; an online-only placeholder) is read again a few times, and if it still can't be read its previous
// version is used too: "couldn't read it" used to return the fallback (an empty list), which the Lab then saved over
// your scenes. readKVStatus says which it was ('ok' / 'missing' / 'unreadable') for callers that must know.
function readKVStatus(file) {
  const p = pending.get(file);
  if (p) return { state: 'ok', value: structuredClone(p.value), from: 'pending' };
  const r = SS.readStatus(fs, file);
  if (r.garbled) console.warn(`store: ${path.basename(file)} could not be read; using its previous version`);
  if (r.state === 'unreadable') console.warn(`store: ${path.basename(file)} could not be read (${r.code})`);
  return r;
}
function readKV(file, fallback) {
  if (SS.guardedName(file)) { // the Lab's own (it reads with a status and waits: tools/three-scenesafe.js)
    const r = readKVStatus(file);
    if (r.state === 'ok') return r.value;
    if (r.state === 'unreadable' && r.prev !== undefined) return r.prev;
    return fallback;
  }
  // (round 43, datasafe) every other store: a read with a fallback is remembered, so its save merges with the disk
  return readJson(file, fallback);
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
    const context = usage.contextInput ?? usage.input ?? 0;
    c.peak = Math.max(c.peak || 0, context);
    c.ctx = context; // last model call's input, not all repeated inputs across a tool-using turn
    if (usage.contextWindow) c.contextWindow = usage.contextWindow;
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
  // (round 43, datasafe) a stats file that's there but can't be read is not rebuilt over (it reads next time)
  const r = DS.load(dfs, STATS_PATH, null);
  if (r.state === 'unreadable' && !r.canSave) return { ...emptyStats(), unreadable: true };
  const stats = r.value;
  return stats?.backfilledAt ? stats : buildTokenStats(agents);
}

module.exports = {
  // (round 44, idlecpu; tests) the store threads' busy time since they started (event loop utilization: active / idle ms)
  _threads: () => Object.fromEntries([['store', worker], ['files', filesWorker]].filter(([, w]) => w?.performance?.eventLoopUtilization).map(([k, w]) => { const u = w.performance.eventLoopUtilization(); return [k, { activeMs: Math.round(u.active * 10) / 10, idleMs: Math.round(u.idle) }]; })),
  DATA_DIR,
  ATTACH_DIR,
  listChats,
  searchChats,
  recall,
  getChat: (id) => readJson(chatPath(id), null),
  saveChat: (chat) => writeJson(chatPath(chat.id), chat, { off: true, chat: true }),
  deleteChat: (id) => trashChat(id),
  listTrash,
  restoreChat,
  getHistory: () => readJson(HISTORY_PATH, {}),
  saveHistory: (history) => writeJson(HISTORY_PATH, history, { off: true, prev: HISTORY_PATH.replace(/\.json$/, '.prev.json') }),
  // { shared: "notes for every agent", agents: { [agentId]: "notes for one agent" } }
  getMemory: () => ({ shared: '', agents: {}, ...readJson(MEMORY_PATH, {}) }),
  saveMemory: (memory) => writeJson(MEMORY_PATH, memory, { off: true, prev: MEMORY_PATH.replace(/\.json$/, '.prev.json') }), // (round 43) + its .prev copy
  getKV: (name, fallback = null) => readKV(kvPath(name), fallback),
  // (round 20) the kv:get IPC: a big store (over 512 KB, e.g. the Lab scenes) is read and parsed on the store thread
  getKVOff: (name, fallback = null) => {
    const file = kvPath(name);
    if (pending.has(file) || !thread()) return readKV(file, fallback);
    // (round 43) only a file that isn't there is "not there": a stat that fails otherwise goes on to the careful read
    // (round 43, datasafe) a missing file whose .prev copy is still there is read from that copy (readKV)
    let size = 0; try { size = fs.statSync(file).size; } catch (err) { if (err.code === 'ENOENT' && (SS.guardedName(file) || !fs.existsSync(file.replace(/\.json$/, '.prev.json')))) { seen.add(file); return fallback; } }
    if (size <= 512 * 1024) return readKV(file, fallback);
    if (SS.guardedName(file)) return ask({ op: 'read', file, fallback }).catch(() => readKV(file, fallback));
    return ask({ op: 'read', file, fallback, ds: true }).then((r) => { seen.add(file); noteDoubt(file, r); return r.value; }).catch(() => readKV(file, fallback));
  },
  // (round 43, scenesafe) the same read, saying what happened: { state: 'ok' | 'missing' | 'unreadable', value?, from?, prev? }
  getKVStatus: (name) => {
    const file = kvPath(name);
    if (pending.has(file) || !thread()) return readKVStatus(file);
    let size = 0; try { size = fs.statSync(file).size; } catch { /* the read says */ }
    return size > 512 * 1024 ? ask({ op: 'read', file, status: true }).catch(() => readKVStatus(file)) : readKVStatus(file);
  },
  // o.removed: (the Lab's scenes) ids deleted on purpose; any other scene the save would drop is kept (scenesafe-core.js)
  setKV: (name, value, o = null) => {
    // Keep the previous version of every store as <name>.prev.json (one step of undo for tools).
    // (round 20) the copy is made on the store thread right before the write, and skipped with it when nothing changed
    const file = kvPath(name);
    const removed = Array.isArray(o?.removed) ? o.removed.filter((x) => typeof x === 'string').slice(0, 5000) : undefined;
    return writeJson(file, value, { off: true, prev: file.replace(/\.json$/, '.prev.json'), removed });
  },
  saveAttachment,
  importRef,
  ATTACH_DIR,
  addUsage,
  getUsage: () => readJson(USAGE_PATH, {}),
  getTokenStats,
  rebuildTokenStats: buildTokenStats,
  setBeforeWrite: (fn) => { beforeWrite = typeof fn === 'function' ? fn : null; },
  // (round 43, datasafe) what couldn't be read in this window's session (the calm card), saves waiting for a held file,
  // and a fresh page (a reload reads everything again: the old page's doubts go with it; held saves stay)
  health: () => ({
    doubts: [...doubts.values()].map(({ name, why, code, at }) => ({ name, label: name.startsWith('chat:') ? 'A chat' : DS.labelOf(name), why, code, at })),
    held: [...held.keys()].map((f) => ({ name: nameOf(f), label: DS.labelOf(nameOf(f)), tries: held.get(f).tries })),
    chats: chatsDoubt,
  }),
  recheck: () => {
    const ok = []; const still = [];
    for (const [file, d] of doubts) { const r = SS.readStatus(dfs, file); (r.state === 'unreadable' && r.prev === undefined ? still : ok).push(d.name); }
    if (chatsDoubt) { try { chatNames(); ok.push('chats'); } catch { still.push('chats'); } }
    return { ok, still };
  },
  newPage: () => { doubts.clear(); seen.clear(); chatsDoubt = null; },
  onDoubt: (fn) => { doubtCb = typeof fn === 'function' ? fn : null; },
  MEMORY_PATH, CHATS_DIR, TRASH_DIR, KV_DIR,
  _sync: { list: () => listChatsSync(), search: (q) => searchChatsSync(q) }, // (tests) the code the thread replaces
  idle, flushSync, runOff, pendingCount: () => pending.size, writerStats: () => ({ ...wstats, thread: Boolean(worker), pending: pending.size }),
};
