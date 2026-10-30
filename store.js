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
  return renameSoon(src, path.join(TRASH_DIR, `${id}.json`));
}
// (windows hourly 5) moving a chat to / from the Trash: a cloud client or antivirus holding the file for a moment
// (EPERM / EBUSY / EACCES) made the delete or the restore fail. Tried again for up to 1 s, without blocking the window.
async function renameSoon(from, to) {
  for (let i = 0; ; i++) {
    try { await fs.promises.rename(from, to); return; } catch (err) {
      if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
}
// (round 84, bigchat84) a GIANT chat in the trash is listed from its own fields and its count (the files thread cuts
// it: chatHead), never parsed here (≈ 0.7 s of the main process for 60 MB each time Recently deleted opened)
async function listTrash() {
  const cutoff = Date.now() - TRASH_DAYS * 864e5;
  const out = [];
  for (const f of fs.readdirSync(TRASH_DIR).filter((x) => x.endsWith('.json'))) {
    const file = path.join(TRASH_DIR, f);
    const st = fs.statSync(file); const deletedAt = st.mtimeMs;
    if (deletedAt < cutoff) { fs.rmSync(file, { force: true }); continue; }
    const h = st.size >= BIGCHAT && thread() ? await chatHead(file) : null;
    if (h) { if (h.head) out.push({ id: h.head.id, agentId: h.head.agentId, title: h.head.title, messages: h.n || 0, deletedAt }); continue; }
    const chat = readJson(file, null);
    if (chat) out.push({ id: chat.id, agentId: chat.agentId, title: chat.title, messages: chat.messages?.length || 0, deletedAt });
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt);
}
// → { head, n } | { error } from the files thread, or null (no thread: read it here)
function chatHead(file) { return runOff('chatHead', { file }).then((r) => (r && (r.head || r.error) ? r : null), () => null); }
function restoreChat(id) {
  if (!SAFE_ID.test(id)) throw new Error(`bad chat id: ${id}`);
  const file = path.join(TRASH_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return false;
  return renameSoon(file, chatPath(id)).then(() => true);
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
  if (h.tries > 25) {
    held.delete(file); console.error('store: gave up saving', path.basename(file), '(it never read again)');
    // (round 52, chatkeep) a chat's save that never reached its file isn't dropped: kept beside, 🛟 Recover… finds it
    if (path.dirname(file) === CHATS_DIR && value && typeof value === 'object') { try { const d = path.join(DATA_DIR, '.held', 'chats'); fs.mkdirSync(d, { recursive: true }); writeFlushed(path.join(d, `${path.basename(file, '.json')}.json`), JSON.stringify(value)); } catch { /* the window still has it */ } }
    return { held: true, gaveUp: true };
  }
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
// (round 82, bigchat82) giant chats saved by what changed: how many were sent to the thread / finished there (the quit
// waits for them: the main process never holds such a chat whole, so there is nothing to write in their place)
const deltaSab = new SharedArrayBuffer(4); let deltaSent = 0;
const deltaFiles = new Map(); // file → changes on their way
const wstats = { writes: 0, skipped: 0, ms: 0, fallbacks: 0 };
function thread() {
  if (worker || workerOff) return worker;
  try {
    const { Worker } = require('worker_threads');
    worker = new Worker(path.join(__dirname, 'storework.js'), { workerData: { deltaSab } }); // (round 82) deltaSab: its finished chatDelta count
    worker.on('message', ({ id, res, err, ms }) => { const j = jobs.get(id); if (!j) return; jobs.delete(id); wstats.ms += ms || 0; if (err) j.reject(new Error(err)); else j.resolve(asBuffers(res)); });
    const dead = (why) => { workerOff = true; worker = null; for (const j of jobs.values()) j.reject(new Error(`store thread: ${why}`)); jobs.clear(); };
    worker.on('error', (err) => dead(err.message));
    worker.on('exit', (code) => { if (worker) dead(`exited (${code})`); });
  } catch { workerOff = true; worker = null; }
  return worker;
}
// (round 82, bigchat82) bytes handed over by a thread arrive as Uint8Arrays: made Buffers (no copy) so writes take them as bytes
function asBuffers(res) {
  if (!res || typeof res !== 'object' || Buffer.isBuffer(res)) return res;
  for (const k of Object.keys(res)) { const v = res[k]; if (v instanceof Uint8Array && !Buffer.isBuffer(v)) res[k] = Buffer.from(v.buffer, v.byteOffset, v.byteLength); }
  return res;
}
function ask(msg) {
  const w = thread();
  if (!w) return Promise.reject(new Error('no store thread'));
  const id = ++jobSeq;
  return new Promise((resolve, reject) => { jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); });
}
// (round 50, crashsafe) a temp file written and flushed to the disk (fsync): after a power cut the rename that follows
// leaves the old file or the whole new one, never an empty / half one
// (windows hourly 3) as the store thread's renameRetry (storework.js): on Windows a cloud client, antivirus or the
// search indexer holds a file for a moment (EPERM / EBUSY / EACCES). The quit flush and the fallback after a failed
// thread save run here, and one such moment lost that save ("save failed" in the log).
// (windows hourly 4) while Hearth runs, ≤ 50 ms of waiting in all on the main thread (round 65, SS.waitFor); the quit
// flush (nothing left to keep smooth) waits up to 0.6 s.
let flushing = false;
function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return; } catch (err) {
      const ms = flushing ? 60 * (i + 1) : SS.waitFor(i, 60 * (i + 1));
      if (i >= 4 || !ms || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    }
  }
}
function writeFlushed(p, text) {
  const fd = fs.openSync(p, 'w');
  try { fs.writeSync(fd, text); try { fs.fsyncSync(fd); } catch { /* a disk that can't */ } } finally { fs.closeSync(fd); }
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
  writeFlushed(tmp, JSON.stringify(value, null, 2)); // (round 50, crashsafe) on the disk before the rename, as the store thread does
  renameRetry(tmp, file);
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
function writeOff(file, value, { prev = null, chat = false, sent, removed, ver } = {}) {
  const ds = dsFlags(file);
  const o = { prev, chat, removed };
  if (!thread()) { try { return Promise.resolve(writeSync(file, value, prev, { sent, removed, ...ds })); } catch (err) { if (isHeld(err)) return Promise.resolve(hold(file, value, o)); console.error('save failed', file, err.message); return Promise.resolve(); } }
  const n = ++writeSeq;
  pending.set(file, { value, n });
  seen.add(file);
  return ask({ op: 'write', file, value, prev, chatDir: chat, sent, removed, ...ds, ...(ver && !ds.doubt && !ds.blind ? { chatVer: ver } : {}) })
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
      filesWorker.on('message', ({ id, res, err }) => { const j = filesJobs.get(id); if (!j) return; filesJobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(asBuffers(res)); });
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
  // (round 82, bigchat82) giant chats' changes on their way: the thread finishes them first (≤ 5 s)
  if (worker && deltaSent) { const v = new Int32Array(deltaSab); const until = Date.now() + 5000; for (let d = Atomics.load(v, 0); d < deltaSent && Date.now() < until; d = Atomics.load(v, 0)) Atomics.wait(v, 0, d, 100); }
  const w = worker; worker = null; workerOff = true; flushing = true;
  try { w?.terminate(); } catch { /* gone */ }
  try { filesWorker?.terminate(); } catch { /* gone */ }
  if (statsLive) { try { writeStats(statsLive); statsLive = null; } catch (err) { console.error('save failed', STATS_PATH, err.message); } } // (round 65) the token stats not written yet
  for (const [file, { value }] of pending) { try { writeSync(file, value, null, SS.guardedName(file) ? { sent: SS.idsOf(value) } : null); } catch (err) { console.error('save failed', file, err.message); } }
  pending.clear();
}

// (round 78, guardloss78) a store written by the main process while the window may hold it (🛟 Recover): until the
// window has read it again (its ack, sync:ack → outsideAck), a save of it from the window is merged three-way with what
// is there now, the version from just before as base — as sync's guard does for an arrival — so what was brought back
// isn't saved over by the window's older copy (its own change waiting is kept too). Six hours at most.
const outside = new Map(); // file → { base, at }
const OUTSIDE_MS = 6 * 3600e3;
function outsideMerge(file, value) {
  const x = outside.get(file);
  if (!x) return value;
  if (Date.now() - x.at > OUTSIDE_MS) { outside.delete(file); return value; }
  let now;
  if (pending.has(file)) now = pending.get(file).value; else { try { now = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return value; } }
  try { return require('./sync-merge').merge3(x.base, value, now).value ?? value; } catch { return value; }
}
const outsideFile = (n) => (n === 'memory.json' ? MEMORY_PATH : /[\\/]/.test(n) ? n : kvPath(n));
function outsideWrite(name, base) { outside.set(outsideFile(name), { base: base === undefined ? null : JSON.parse(JSON.stringify(base)), at: Date.now() }); }
function outsideAck(rels, since = 0) {
  if (!rels) { outside.clear(); return; }
  for (const rel of rels) {
    const file = rel === 'memory.json' ? MEMORY_PATH : path.join(DATA_DIR, ...String(rel).split('/'));
    const x = outside.get(file);
    if (x && !(since > 0 && since < x.at)) outside.delete(file); // a read begun before the write is a read of the older copy
  }
}

// Write to a temp file first so a crash mid-write can't corrupt a chat.
// Sync (syncmain.js) can merge a save with a version that just arrived from another computer (beforeWrite).
let beforeWrite = null;
let beforeWants = null; // (round 75, syncstate75) which files the guard may change (null: any); the others merge on the store thread
function writeJson(file, value, o) {
  // (round 43, scenesafe) the ids the caller sent, before sync's merge: the guard tells "not sent" from "merged away"
  const sent = SS.guardedName(file) && Array.isArray(value) ? SS.idsOf(value) : undefined;
  // (round 77, storeack77) o.fresh: the value was made from what is on disk right now (a store saved by what changed:
  // mergeKV), so it already holds what arrived from the other computer. Merged again by the guard (its base the version
  // before the arrival), a count arrived was counted twice on every save (feature usage grew by the other computer's
  // clicks each minute) and a thing taken out came back
  if (beforeWrite && !o?.fresh) { try { value = beforeWrite(file, value) ?? value; } catch { /* save as given */ } }
  if (outside.size && !o?.fresh && !o?.outside) value = outsideMerge(file, value); // (round 78, guardloss78)
  if (o?.off) return writeOff(file, value, { ...o, sent });
  try { return writeSync(file, value, o?.prev, { sent, removed: o?.removed, ...dsFlags(file) }); } catch (err) { if (isHeld(err)) return hold(file, value, o || {}); throw err; }
}

// (round 82, bigchat82) GIANT chats (≥ 8 MB: thousands of messages with tool output). Opening one used to read and parse
// it here (≈ 0.6 s of the main process for 60 MB) and send it on (≈ 70 ms more); saving a new message sent it all from
// the window (≈ 70 ms there), here (≈ 140 ms to receive it, ≈ 70 ms to pass it to the thread) and wrote it all.
// Now the store thread reads its bytes and hands them over (transferred: no copy here), the window parses them, and the
// window's later saves send only what changed (chatsave.js): the thread copies the rest from the file.
const BIGCHAT = Number(process.env.HEARTH_BIGCHAT_MIN) || 8 * 1024 * 1024;
const guardWants = (file) => (Boolean(beforeWrite) && (!beforeWants || beforeWants(file))) || outside.has(file);
// → { chat } (a chat like any other, or null), or { token, parts, size, ver } for a giant one: its bytes then fetched
// in 4 MB parts (openPart), parsed in the window's worker. One 60 MB reply held the main process ≈ 60–90 ms to send;
// a part is a few ms (and the main process never parses it)
const PART = 4 * 1024 * 1024;
const opened = new Map(); // token → { parts (each its own memory, as the store thread read them), t }
function openPart(token, i) {
  const o = opened.get(String(token)); const k = Number(i);
  if (!o || !Number.isInteger(k) || k < 0 || k >= o.parts.length) return null;
  const u = o.parts[k]; o.parts[k] = null;
  if (o.parts.every((x) => x === null)) { clearTimeout(o.t); opened.delete(String(token)); }
  return u ? Buffer.from(u.buffer, u.byteOffset, u.byteLength) : null;
}
// (round 86, chatwindow86) o.win (the window's characters per line): a giant chat opened WINDOWED → { win: { ver, n,
// from, head, bytes } } (storework.js chatWinOpen; chatwin.js): its last messages and one record per message, the rest
// read by range when you scroll up to it (chatWin below). Not while sync's guard wants it (it just arrived: its next
// save merges whole); a file the thread can't cut or read: the usual way below
async function openChat(id, o) {
  const file = chatPath(id);
  if (thread() && (deltaFiles.has(file) || pending.has(file))) await idle(); // (what's on its way lands first)
  let size = 0; try { size = fs.statSync(file).size; } catch { /* missing: as getChat */ }
  if (size < BIGCHAT || !thread() || pending.has(file) || held.has(file)) return { chat: readJson(file, null) };
  const ver = `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  if (o?.win && !guardWants(file) && !doubts.has(file)) {
    try {
      const r = await ask({ op: 'chatWinOpen', file, ver, cpl: Number(o.win) || 90, tail: 300 });
      if (r?.bytes) { seen.add(file); return { win: { ver, n: r.n, from: r.from, head: r.head, bytes: Buffer.from(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength) } }; }
    } catch { /* the usual way */ }
  }
  try {
    const r = await ask({ op: 'chatOpen', file, ver, part: PART });
    seen.add(file);
    const token = `${ver}${Math.random().toString(36).slice(2, 10)}`;
    const t = setTimeout(() => opened.delete(token), 120000); t.unref?.();
    opened.set(token, { parts: r.parts, t });
    return { token, parts: r.parts.length, size: r.size, ver };
  } catch { return { chat: readJson(file, null) }; }
}
// d: { id, from, to, keys, set, n, msgs } → { ok: true } | { ok: false, why } (the window then saves the chat whole).
// Not while sync's guard wants this chat (it just arrived from the other computer: the merge needs it whole), nor
// while it's held / in doubt (those saves merge with the disk, whole)
function saveChatDelta(d) {
  let file; try { file = chatPath(d?.id); } catch { return { ok: false, why: 'id' }; }
  if (!thread() || guardWants(file) || held.has(file) || doubts.has(file) || !seen.has(file)) return { ok: false, why: 'whole' };
  deltaSent += 1; deltaFiles.set(file, (deltaFiles.get(file) || 0) + 1);
  return ask({ op: 'chatDelta', file, from: d.from, to: d.to, keys: d.keys, set: d.set, n: d.n, msgs: d.msgs, trunc: Boolean(d.trunc) }) // (round 86: trunc, a chat cut shorter on purpose)
    .then((r) => { if (r?.ok) wstats.writes += 1; return r || { ok: false, why: 'none' }; }, (err) => ({ ok: false, why: err.message }))
    .finally(() => { const n = (deltaFiles.get(file) || 1) - 1; if (n > 0) deltaFiles.set(file, n); else deltaFiles.delete(file); });
}
// (round 86, chatwindow86) a windowed giant chat's other reads, on the store thread in the order of its saves:
// range { id, ver, from, to } → { n, same, bytes } · find { id, q } → { hits } · calc { id, what, agent, tools, upto }. A file
// that can't be read answers { error }: the window never takes that as "no messages"
async function chatWin(op, a) {
  let file; try { file = chatPath(a?.id); } catch { return { error: 'id' }; }
  if (!thread()) return { error: 'thread' };
  try {
    if (op === 'range') {
      const r = await ask({ op: 'chatRange', file, ver: String(a.ver || ''), from: Number(a.from) || 0, to: Number(a.to) || 0 });
      return r?.bytes ? { n: r.n, from: r.from, to: r.to, same: Boolean(r.same), bytes: Buffer.from(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength) } : { error: r?.error || 'read' };
    }
    if (op === 'find') return (await ask({ op: 'chatFind', file, q: String(a.q || '') })) || { error: 'read' };
    // (round 87, chatcalc87) heights { id, ver, cpl } → { same, h } · scan { id, ver, kind, from, to, seen, max } → { same,
    // seen, at } · head { id } → { big, head, n } (a chat ≥ 8 MB: chatsafe's reader reads it by range; smaller: big false)
    if (op === 'heights') return (await ask({ op: 'chatHeights', file, ver: String(a.ver || ''), cpl: Number(a.cpl) || 90 })) || { error: 'read' };
    if (op === 'scan') return (await ask({ op: 'chatScan', file, ver: String(a.ver || ''), kind: String(a.kind || ''), from: Number(a.from) || 0, to: Number(a.to) || 0, seen: Array.isArray(a.seen) ? a.seen.slice(0, 1000).map(String) : [], max: Math.min(1000, Number(a.max) || 12) })) || { error: 'read' };
    if (op === 'head') {
      let size = -1; try { size = fs.statSync(file).size; } catch { return { error: 'gone' }; }
      if (size < BIGCHAT) return { big: false };
      if (deltaFiles.has(file) || pending.has(file)) await idle(); // (what's on its way lands first)
      const r = await ask({ op: 'chatHead', file });
      return r?.head ? { big: true, head: r.head, n: r.n } : { error: r?.error || 'read' };
    }
    if (op === 'calc') { const g = a.agent || {}; return (await ask({ op: 'chatCalc', file, what: Array.isArray(a.what) ? a.what.map(String) : [], agent: { id: g.id, mode: g.mode, engine: g.engine, lighterAt: g.lighterAt, model: g.model }, tools: Boolean(a.tools), upto: a.upto == null ? undefined : Number(a.upto) })) || { error: 'read' }; }
  } catch (err) { return { error: err.message || 'read' }; }
  return { error: 'op' };
}
// a whole save of a chat: with the window's version (ver) only when it is written as sent (no merge on the way)
function saveChat(chat, o = {}) {
  const file = chatPath(chat.id);
  return writeJson(file, chat, { off: true, chat: true, ...(o?.ver && !guardWants(file) ? { ver: String(o.ver) } : {}) });
}
// a chat read after its changes on their way are on disk (versions, exports)
async function getChatFresh(id) { const file = chatPath(id); if (deltaFiles.has(file)) await idle(); return readJson(file, null); }
// (round 84, bigchat84) Earlier versions: a giant chat restored on the store thread, after this chat's saves on their
// way (storework.js chatRestore: read, kept first, written as a whole save). null: the usual way (no thread, sync's
// guard wants this chat, it is held or in doubt: those saves merge with the disk, whole)
async function restoreChatBig({ id, src, keep, at, over }) {
  const file = chatPath(id);
  if (!thread() || guardWants(file) || held.has(file) || doubts.has(file)) return null;
  const r = await ask({ op: 'chatRestore', file, src, keep, at, over });
  if (r?.ok) { seen.add(file); wstats.writes += 1; }
  return r;
}

// (round 85, projbig85) a project's GIANT chat added by name (projbundlemain.js adopt: an import's part file or a chat
// here for Duplicate project), written on the store thread as a whole save writes it (storework.js chatAdopt), after this
// source chat's saves on their way; the window never sends it, this process never parses it. A source held / in doubt
// (its file isn't what the window has): nothing is written. No thread (Node tools): the same, here
async function adoptChatBig({ file, head, src }) {
  if (path.dirname(String(file)) !== CHATS_DIR || !src?.file) return { ok: false, error: 'Not a chat Hearth can add' };
  if (pending.has(file) || fs.existsSync(file)) return { ok: false, error: 'That chat is already in your list.' };
  if (held.has(src.file) || doubts.has(src.file)) return { ok: false, held: true, code: 'EHELD', error: 'A chat in it can\'t be read just now. Nothing was added; try again in a moment.' };
  if (thread()) {
    const r = await ask({ op: 'chatAdopt', file, head, src });
    if (r?.ok) { seen.add(file); wstats.writes += 1; }
    return r;
  }
  let msgs = null;
  try { const v = JSON.parse(fs.readFileSync(src.file, 'utf8').replace(/^﻿/, '')); msgs = src.list ? v : v?.messages; } catch { msgs = null; }
  if (!Array.isArray(msgs)) return { ok: false, held: true, code: 'EHELD', error: 'A chat in it can\'t be read just now. Nothing was added; try again in a moment.' };
  const value = {}; let placed = false;
  for (const k of Object.keys(head)) { if (k === '__bigChat' || k === '__bigPart') continue; if (k === 'messages') { value.messages = msgs; placed = true; } else value[k] = head[k]; }
  if (!placed) value.messages = msgs;
  writeSync(file, value, null);
  return { ok: true, n: msgs.length, title: value.title };
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
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, SS.waitFor(i, 40 * (i + 1))); // (round 65) ≤ 50 ms in all on the main thread
    }
  }
}

// (round 20) on the store thread when it runs (a Promise then): only changed chat files are read again
// (round 43, datasafe) a chat file that can't be read keeps its row (its last known one, or a stub): a list is never
// shorter because a read failed; a folder that can't be listed gives the last list (and the card says so)
let lastList = null;
function listChats() {
  if (thread()) {
    return ask({ op: 'list', dir: CHATS_DIR, ds: true, cache: path.join(DATA_DIR, '.cache', 'chat-list.json') }).then((r) => {
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
// (round 81, projsearch81) Find in this project (projfind-core.js): on the store thread, after the saves asked before it;
// here only without a thread (Node tests / tools)
let findLocal = null;
function projFind(o = {}) {
  const msg = { op: 'projfind', spec: o.spec || {}, dirs: { chats: CHATS_DIR, kv: KV_DIR }, q: o.q, budgetMs: o.budgetMs, limit: o.limit };
  if (thread()) return ask(msg).catch(() => projFindSync(msg));
  return projFindSync(msg);
}
function projFindSync(msg) {
  const PF = require('./projfind-core');
  findLocal ||= PF.createIndex();
  return PF.run(findLocal, msg, { stat: (f) => { try { return fs.statSync(f); } catch { return null; } }, join: path.join, now: () => performance.now(), read: (f) => { const p = pending.get(f); if (p) return p.value; try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } } });
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
  writeJson(USAGE_PATH, all, { off: true }); // (round 82, bigchat82) on the store thread: its flush to disk held the main process ≈ 60–70 ms after every reply
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
const writeStats = (stats) => { const tmp = `${STATS_PATH}.tmp`; writeFlushed(tmp, JSON.stringify(stats)); renameRetry(tmp, STATS_PATH); };
// (round 65, mainhang65) after every reply the stats were read, flushed to the disk (fsync) and renamed on the main
// thread: on a Windows disk a flush can take a long moment, with the whole app waiting. Now they are kept in memory
// while a write is on its way and written off the main thread (temp file, flush, rename: crashsafe's writeAtomic),
// one write at a time, the newest numbers last; whatever is still unwritten at quit is written then (flushSync).
let statsLive = null; let statsChain = Promise.resolve(); let statsGen = 0;
function writeStatsSoon(stats) {
  statsLive = stats; const gen = ++statsGen;
  statsChain = statsChain.then(() => (gen === statsGen ? require('./crashsafe-core').writeAtomic(fs.promises, STATS_PATH, JSON.stringify(stats)) : null))
    .catch((err) => console.warn('token stats', err.code || err.message))
    .then(() => { if (gen === statsGen) statsLive = null; });
}
function addTokenStat(agentId, usage, meta) {
  const stats = statsLive || readJson(STATS_PATH, null);
  if (!stats?.backfilledAt) return; // the first read builds everything from the chats (this reply included)
  statInto(stats, agentId, usage, meta);
  writeStatsSoon(stats);
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
// (round 73, chatsteady73) a store changed a few fields at a time (the feature-usage counts, usage.js): the window sends
// only what changed, as [op, path, value] (inc: add to a number · max · def: set when missing · set · del), applied here
// to the store as it is (a save still on its way, else the disk) and saved like setKV (sync's merge, .prev, held files
// all as before). Sending the whole store (≈ 900 KB after a year of use) cost the window ≈ 70 ms after every click.
// → { ok: true }, or { ok: false, state } when the store is missing / can't be read (the window then sends it whole)
const applyOps = (root, ops) => require('./kvops').applyOps(root, ops); // (round 75, syncstate75) shared with the store thread (kvops.js; required when first used)
// the store as last merged, kept while nobody else changed it (the same save on its way, or the file as that save left
// it): a year-sized store isn't read and parsed again every minute (≈ 40 ms on this thread). Not while sync guards
// writes (its merge can change what is written).
let mergeMemo = null;
// (round 75, syncstate75) on the store thread when it runs (storework.js mergeKV): the file read, parsed, changed and
// written there; the main process only passes the changes on (≈ 50 ms of it once a minute with sync on: sync's guard
// turned the memo below off, so the whole year-sized store was read and parsed here). Here, as before, when the thread
// isn't there, when a whole save of the store is still on its way or waiting for a held file, and when sync's guard
// wants this very file (it just arrived from the other computer: its merge needs the value here).
const offMerging = new Map(); // file → the promise of the last merge sent to the thread
function mergeKV(name, ops) {
  const file = kvPath(name);
  if (SS.guardedName(file)) return { ok: false, state: 'guarded' }; // (the Lab's scenes: whole saves with their guard)
  const guard = Boolean(beforeWrite) && (!beforeWants || beforeWants(file));
  if (!guard && !pending.has(file) && !held.has(file) && thread()) {
    const ds = dsFlags(file); seen.add(file); mergeMemo = null;
    const p = ask({ op: 'mergeKV', file, ops, prev: file.replace(/\.json$/, '.prev.json'), ...ds })
      .then((r) => { if (r?.ok) { wstats.writes += 1; held.delete(file); return { ok: true }; } return { ok: false, state: r?.state || 'unreadable' }; },
        (err) => (isHeld(err) ? { ok: false, state: 'unreadable' } : mergeOnMain(file, ops))) // held: the window saves it whole (held then, as any save)
      .finally(() => { if (offMerging.get(file) === p) offMerging.delete(file); });
    offMerging.set(file, p);
    return p;
  }
  // one sent to the thread still on its way: this one after it (it reads what that one wrote)
  if (offMerging.has(file)) return offMerging.get(file).then(() => mergeKV(name, ops));
  return mergeOnMain(file, ops);
}
function mergeOnMain(file, ops) {
  let value = null;
  const m = !beforeWrite && mergeMemo?.file === file ? mergeMemo : null;
  if (m) {
    const p = pending.get(file);
    let same = p ? p.value === m.value : false;
    if (!p && m.size >= 0) { try { const st = fs.statSync(file); same = st.size === m.size && st.mtimeMs === m.mtimeMs; } catch { same = false; } }
    if (same) value = m.value;
  }
  if (!value) {
    const r = readKVStatus(file);
    if (r.state !== 'ok' || !r.value || typeof r.value !== 'object' || Array.isArray(r.value)) { mergeMemo = null; return { ok: false, state: r.state }; }
    value = r.value;
  }
  applyOps(value, ops);
  const w = writeJson(file, value, { off: true, prev: file.replace(/\.json$/, '.prev.json'), fresh: true }); // (round 77) fresh: see writeJson
  const memo = mergeMemo = beforeWrite ? null : { file, value, size: -1, mtimeMs: -1 };
  if (memo) Promise.resolve(w).then(() => { if (mergeMemo === memo && !pending.has(file)) { try { const st = fs.statSync(file); memo.size = st.size; memo.mtimeMs = st.mtimeMs; } catch { mergeMemo = null; } } }, () => { if (mergeMemo === memo) mergeMemo = null; });
  return { ok: true };
}

function getTokenStats(agents) {
  // (round 43, datasafe) a stats file that's there but can't be read is not rebuilt over (it reads next time)
  if (statsLive) return statsLive; // (round 65) the newest, still being written
  const r = DS.load(dfs, STATS_PATH, null);
  if (r.state === 'unreadable' && !r.canSave) return { ...emptyStats(), unreadable: true };
  const stats = r.value;
  return stats?.backfilledAt ? stats : buildTokenStats(agents);
}

module.exports = {
  // (round 44, idlecpu; tests) the store threads' busy time since they started (event loop utilization: active / idle ms)
  _threads: () => Object.fromEntries([['store', worker], ['files', filesWorker]].filter(([, w]) => w?.performance?.eventLoopUtilization).map(([k, w]) => { const u = w.performance.eventLoopUtilization(); return [k, { activeMs: Math.round(u.active * 10) / 10, idleMs: Math.round(u.idle) }]; })),
  // (round 91, longrun91; tests) each store thread's heap after a GC and its caches' sizes (storework.js _mem); a
  // thread not started yet is not started for this
  _threadMem: async (o = {}) => {
    const out = {};
    if (worker) out.store = await ask({ op: '_mem', snap: o.snap || undefined }).catch((err) => ({ error: err.message }));
    if (filesWorker) out.files = await runOff('_mem', {}).catch((err) => ({ error: err.message }));
    return out;
  },
  DATA_DIR,
  ATTACH_DIR,
  listChats,
  searchChats,
  recall,
  projFind, // (round 81, projsearch81)
  getChat: (id) => readJson(chatPath(id), null),
  getChatFresh, openChat, openPart, saveChatDelta, chatWin, // (round 82, bigchat82; chatWin: round 86, chatwindow86)
  restoreChatBig, chatHead, BIGCHAT, // (round 84, bigchat84)
  adoptChatBig, // (round 85, projbig85)
  saveChat,
  deleteChat: (id) => trashChat(id),
  listTrash,
  restoreChat,
  getHistory: () => readJson(HISTORY_PATH, {}),
  saveHistory: (history) => writeJson(HISTORY_PATH, history, { off: true, prev: HISTORY_PATH.replace(/\.json$/, '.prev.json') }),
  // { shared: "notes for every agent", agents: { [agentId]: "notes for one agent" } }
  getMemory: () => ({ shared: '', agents: {}, ...readJson(MEMORY_PATH, {}) }),
  saveMemory: (memory, o) => writeJson(MEMORY_PATH, memory, { off: true, prev: MEMORY_PATH.replace(/\.json$/, '.prev.json'), outside: Boolean(o?.outside) }), // (round 43) + its .prev copy · (round 78) o.outside: 🛟 Recover
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
  // (round 73, startfast73) a big list store's rows with only these fields (storework.js pick), or null (read it whole)
  getKVPick: (name, fields) => {
    const file = kvPath(name);
    const keys = Array.isArray(fields) ? fields.map(String).slice(0, 20) : [];
    const own = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').map((x) => { const o = {}; for (const k of keys) if (x[k] !== undefined) o[k] = x[k]; return o; }) : null);
    let size = 0; try { size = fs.statSync(file).size; } catch { return null; }
    if (pending.has(file) || !thread() || size <= 512 * 1024) return own(readKV(file, null));
    return ask({ op: 'pick', file, fields: keys }).catch(() => null);
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
    return writeJson(file, value, { off: true, prev: file.replace(/\.json$/, '.prev.json'), removed, outside: Boolean(o?.outside) }); // (round 78) o.outside: 🛟 Recover's own write
  },
  outsideWrite, outsideAck, _outside: () => outside.size, // (round 78, guardloss78) 🛟 Recover's writes vs the window's copy
  mergeKV, applyOps, // (round 73, chatsteady73) a store saved by what changed (usage.js)
  saveAttachment,
  importRef,
  ATTACH_DIR,
  addUsage,
  getUsage: () => readJson(USAGE_PATH, {}),
  getTokenStats,
  rebuildTokenStats: buildTokenStats,
  setBeforeWrite: (fn, wants) => { beforeWrite = typeof fn === 'function' ? fn : null; beforeWants = beforeWrite && typeof wants === 'function' ? wants : null; }, // (round 75) wants(file): would the guard change a save of it
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
