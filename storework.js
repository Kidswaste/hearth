// The data writer / chat index thread (round 20, offmain): a worker_threads worker started by store.js in the main
// process. Saving a store means JSON.stringify of the whole thing (a 4 MB Lab scenes store: ~20 ms) and searching the
// chats meant reading and parsing every chat file: both used to run on the main process's thread, so every IPC answer
// (a chat opening, a setting, a ping) waited behind them. Here they run on their own thread, in the order they were
// asked (a list or a search after a save sees that save):
//   write { file, value, prev? }  JSON (2-space, as before) → <file>.w.tmp → rename; prev: the old file is copied
//                                 there first (kv stores' one step of undo). A save that would write exactly what is on
//                                 disk already (same text, file untouched since) is skipped: no write, no .prev copy,
//                                 nothing for cloud sync to look at.
//   list { dir }                  the chats list (id, agent, title, updated, pinned, model), newest first
//   search { dir, query }         full-text search through every chat's messages (same hits, counts and snippets)
//   read { file, fallback }       a big store read and parsed here
//   flist / fsearch               fsapi.js's recursive folder listing and folder search (on a second copy: "files")
//   syncHash { file, rel, cloud, ctx }  cloud sync: a big JSON store's cloud form + hash (sync-engine.js hashJson)
//   mergeKV { file, ops, prev }   (round 75) a store saved by what changed (store.js mergeKV, kvops.js applyOps)
//   projfind { spec, dirs, q?, budgetMs? }  (round 81) Find in this project: its index caught up in a slice (only what
//                                 changed since), then the query (projfind-core.js); made on the first find, let go when idle
//   recall { dir, q?, budgetMs? }  (round 30) "what did we decide about X?": catches the recall index up (only chats that
//                                 changed, within the budget) and, with q, ranks the messages (recall-core.js)
//   chatOpen { file, ver }        (round 82, bigchat82) a GIANT chat's bytes for the window (handed over, not copied, to
//                                 the main process, which only passes them on): its parse happens in the window, never here
//                                 nor on the main process; the thread notes which version the window now holds (ver)
//   chatDelta { file, from, to, keys, set, n, msgs }  (round 82) a giant chat saved by what changed since version `from`
//                                 (bigchat-core.js deltaWrite: unchanged messages copied byte for byte, the file the same
//                                 as a whole save); { ok: false } when this thread doesn't hold that version (the window
//                                 then saves it whole, once)
// Chat files are parsed once and kept (by size + mtime): a list or a search only re-reads the files that changed, and
// a chat saved through here is indexed from the value itself (no re-read). Texts are kept up to TEXT_CAP characters
// in all; past that, a search reads the files again (still on this thread).
// (round 34, lightweight) the texts are kept only while you search: the first search reads them in, and 10 minutes
// after the last one they're let go (a list never reads them in: with an imported history they were tens of MB held in
// the main process from the first second, for a search that may never come). No lowercase copy is kept either.
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { list: flist, search: fsearch } = require('./fswalk');
const { workerData } = require('worker_threads');
let BCmod = null; const BC = () => (BCmod ||= require('./bigchat-core')); // (round 82, bigchat82) giant chats, required when first met
const BIG = Number(process.env.HEARTH_BIGCHAT_MIN) || 8 * 1024 * 1024;
const SYNC_BIG = Number(process.env.HEARTH_SYNCCHAT_MIN) || 16e6; // (round 82) sync: a chat this big goes by its messages' bytes (bigchat-core.js)
const isChatRel = (rel) => /^chats\/[^/]+\.json$/i.test(String(rel || ''));
const sizeOf = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
// (round 82) giant chats' cloud forms as made here this pass (a pass hashes a file, then pushes / pulls / merges it: made
// once), by file + whether it was converted (local) + its size and time; let go a minute after the last use
const forms = new Map(); let formsT = null;
const digests = new Map(); // (round 82) Earlier versions: a giant chat copy's digest by its file (kept while it stays the same)
// read(file) → { buf, sig } only when the file stayed the same while read (else null: the whole-file way)
function readStill(file) { const s1 = bigSig(stat(file)); const buf = fs.readFileSync(file); return s1 && bigSig(stat(file)) === s1 ? { buf, sig: s1 } : null; }
// got: bytes already read with their sig (readStill): a kept form is used only for those very bytes
function formOf(file, ctx, S, got = null) {
  const key = `${ctx ? 'l' : 'c'}:${file}`;
  clearTimeout(formsT); formsT = setTimeout(() => forms.clear(), 60000); formsT.unref?.();
  const sig = got ? got.sig : bigSig(stat(file));
  const had = forms.get(key);
  if (had && had.sig === sig) return had.cf;
  const r = got || readStill(file);
  if (!r || r.sig !== sig) return null;
  const cf = BC().cloudForm(r.buf, ctx, S);
  if (cf) { // (at most 160 MB of forms kept: the oldest go first)
    forms.set(key, { sig, cf });
    let total = 0; for (const x of forms.values()) total += x.cf.text.length;
    for (const k of forms.keys()) { if (total <= 160 * 1024 * 1024 || forms.size <= 1) break; total -= forms.get(k).cf.text.length; forms.delete(k); }
  }
  return cf;
}
const FIND_BIG = Math.min(BIG, 128 * 1024); // (round 82) Find in this project / recall: a chat this big is read (and its words indexed) a slice at a time
// (round 82) how many chatDelta ops are finished (the main process waits on it before stopping this thread at quit)
const deltaDone = workerData?.deltaSab ? new Int32Array(workerData.deltaSab) : null;

const SS = require('./scenesafe-core');
const ssEnv = { fs, path, cache: new Map() };
// (round 43, datasafe) every other store: a save built on a failed read merges with the disk; copies; chats never vanish
const DS = require('./datasafe-core');
const dfs = DS.faults(fs, path.join(__dirname, 'data'));
const dsEnv = { fs: dfs, path, cache: new Map() };
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
// (round 72, sync72) for syncPull / syncMerge: a whole text written next to its place, then renamed (crash-safe)
function atomicText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, text); renameRetry(tmp, file); // (windows hourly 3) a cloud client holding the file
}
// Lab scenes about to lose some (a delete on the other computer… or a list lost there): this computer's whole file is
// kept in kv/.history/three-sketches first (🛟 Recover lost scenes finds it), as sync-engine.js keepScenesAside does
function sceneAside(aside, mine, next, text) {
  if (!Array.isArray(mine) || !Array.isArray(next)) return;
  const have = new Set(next.map((x) => x?.id));
  if (!mine.some((x) => x?.id && !have.has(x.id))) return;
  fs.mkdirSync(aside.dir, { recursive: true });
  fs.writeFileSync(path.join(aside.dir, SS.copyName(aside.now, mine.length, 'sync')), text);
}
const TEXT_CAP = 16 * 1024 * 1024;
const TEXT_IDLE_MS = Number(process.env.HEARTH_TEXT_IDLE_MS) || 10 * 60 * 1000; // texts let go after this long without a search
let textsWarm = false; let coolT = null;
function warmTexts() {
  textsWarm = true; clearTimeout(coolT);
  coolT = setTimeout(() => { textsWarm = false; for (const e of index.values()) { e.texts = null; e.n = 0; } textChars = 0; bigSearch.clear(); }, TEXT_IDLE_MS);
  coolT.unref?.();
}
const written = new Map(); // file → { h, size, mtimeMs } of the text this thread last wrote / saw there
// (round 82, bigchat82) giant chats searched by their bytes (bigchat-core.js searchIndex): file → { sig, ix }, kept while
// searching (let go with the texts), 256 MB at most
const bigSearch = new Map();
function bigSearchIx(file, e) {
  const sig = `${e.size}:${e.mtimeMs}`;
  const had = bigSearch.get(file);
  if (had?.sig === sig) return had.ix;
  bigSearch.delete(file);
  const got = readStill(file);
  if (!got || got.sig !== sig) return null;
  const ix = BC().searchIndex(got.buf);
  if (!ix) return null;
  let total = ix.lower.length; for (const x of bigSearch.values()) total += x.ix.lower.length;
  if (total <= 256 * 1024 * 1024) bigSearch.set(file, { sig, ix });
  return ix;
}
// message k's text, read from the file by where the cut found it
function textAtBytes(file, ix, k) {
  let fd = null;
  try { fd = fs.openSync(file, 'r'); const s = ix.els[k * 2]; const b = Buffer.allocUnsafe(ix.els[k * 2 + 1] - s); fs.readSync(fd, b, 0, b.length, s); return JSON.parse(b.toString('utf8'))?.text; } catch { return undefined; } finally { if (fd !== null) fs.closeSync(fd); }
}
const merged = new Map(); // (round 75) file → { value, size, mtimeMs }: a store as mergeKV last wrote it
const applyOps = (root, ops) => require('./kvops').applyOps(root, ops); // (round 75, syncstate75) kvops.js, required when first used
const index = new Map(); // chat file → { size, mtimeMs, sum, texts, lower }
const stubs = new Map(); // (round 43) chat file → its stub row, while it can't be read (kept for a folder that can't be listed)
let textChars = 0;
let recallIdx = null; // (round 30) recall-core.js's index, made on the first recall op
// (round 83, idleburst83) the index kept between starts (data/.cache/recall-index.bin: this computer only, never synced;
// a cache): read on the first recall op, each chat in it checked by its size + modified time (recallSrc), so a start
// reads only the chats changed since instead of every chat again (a minute or more of this thread on a big profile).
// Written once it has caught up after reading ≥ 25 chats (or none was kept), a few seconds later, off the hot path.
const recallSrc = (e) => (e ? `${e.size}:${e.mtimeMs}` : null);
const recallKeep = { file: null, changed: 0, t: null, had: false };
function recallLoad(dir) {
  const RC = require('./recall-core');
  recallKeep.file = path.join(process.env.HEARTH_RECALL_CACHE || path.join(path.dirname(dir), '.cache'), 'recall-index.bin');
  try {
    const buf = fs.readFileSync(recallKeep.file);
    const ix = RC.createIndex(buf);
    for (const [file, sig, els] of ix.extra().spans || []) spans.set(file, { sig, els }); // where each long chat's messages sit (a quote read back without parsing it)
    recallKeep.had = true;
    return ix;
  } catch { return RC.createIndex(); } // none kept / another version / damaged: built as before
}
function recallSave() {
  if (!recallKeep.file || recallKeep.t || recallJobs.size) return;
  recallKeep.t = setTimeout(() => {
    recallKeep.t = null;
    if (!recallIdx || recallJobs.size) return;
    const keys = new Set(recallIdx.keys());
    const buf = recallIdx.snapshot({ spans: [...spans].filter(([file]) => keys.has(file)).map(([file, x]) => [file, x.sig, Array.isArray(x.els) ? x.els : Array.from(x.els)]) });
    if (!buf) return;
    try { atomicText(recallKeep.file, buf); recallKeep.changed = 0; recallKeep.had = true; } catch { /* a cache: the next start builds it */ }
  }, 4000);
  recallKeep.t.unref?.();
}
// (round 83, idleburst83) a catch-up's slices share one look at the chats folder (≤ 2 s old): every 12 ms slice used to
// list it and stat every chat again (≈ 2,200 stats a slice, ~50 slices a second on a big profile) before indexing anything
let recallList = null; // { dir, at, list }
const recallJobs = new Map(); // (round 82, bigchat82) file → a long chat being read for recall, a slice at a time
const spans = new Map(); // (round 82) file → { sig, els }: where each message of a long chat sits in it (one message read back for a quote)
// one message of a long chat read back from its bytes (undefined: not known here, read the chat)
function msgAt(file, k, e) {
  const sp = spans.get(file);
  if (!sp || !e || sp.sig !== `${e.size}:${e.mtimeMs}` || k * 2 + 1 >= sp.els.length) return undefined;
  let fd = null;
  try {
    fd = fs.openSync(file, 'r');
    const st = fs.fstatSync(fd); if (`${st.size}:${st.mtimeMs}` !== sp.sig) return undefined;
    const s = sp.els[k * 2]; const b = Buffer.allocUnsafe(sp.els[k * 2 + 1] - s);
    fs.readSync(fd, b, 0, b.length, s);
    return JSON.parse(b.toString('utf8'));
  } catch { return undefined; } finally { if (fd !== null) fs.closeSync(fd); }
}
let findIdx = null; let findT = null; // (round 81, projsearch81) projfind-core.js's index: made on the first find, let go 20 min after the last
// (round 82, bigchat82) giant chats the window holds: file → { vers (the versions handed out for the file as it is: a
// window's copy and anyone else's who opened it since), sig (the file as this thread left / read it), head, els (each
// message's bytes in it; null until the first change needs them) }. Small: no messages are kept here, only where they
// are in the file. A change from any of those versions applies; after it, only the version it made does.
const bigs = new Map();
const bigSig = (st) => (st ? `${st.size}:${st.mtimeMs}` : '');

function stat(file) { try { return fs.statSync(file); } catch { return null; } }
function sameOnDisk(file, h) {
  const w = written.get(file);
  if (w) { const st = stat(file); return Boolean(st) && w.h === h && st.size === w.size && st.mtimeMs === w.mtimeMs; }
  // not written from here yet: compare with the file's text (read here, off the main thread)
  try { const st = stat(file); if (!st || st.size > 64 * 1024 * 1024) return false; const same = sha(fs.readFileSync(file, 'utf8')) === h; if (same) written.set(file, { h, size: st.size, mtimeMs: st.mtimeMs }); return same; } catch { return false; }
}
function renameRetry(from, to) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(from, to); return; } catch (err) {
      // Windows: a cloud client / antivirus holding the file for a moment
      if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60 * (i + 1));
    }
  }
}

// ---------- the chat index ----------
function entryOf(chat, st) {
  const texts = textsWarm ? (chat.messages || []).map((m) => m.text || '') : null;
  const n = texts ? texts.reduce((a, t) => a + t.length, 0) : 0;
  const keep = Boolean(texts) && textChars + n <= TEXT_CAP;
  if (keep) textChars += n;
  const { id, agentId, title, updatedAt, pinned, model } = chat;
  return { size: st.size, mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, sum: { id, agentId, title, updatedAt, pinned: Boolean(pinned), model }, texts: keep ? texts : null, n: keep ? n : 0 };
}
function drop(file) { const e = index.get(file); if (e) { textChars -= e.n; index.delete(file); rows.dirty = true; } }
// (round 73, startfast73) the list's rows kept on disk between starts (data/.cache/chat-list.json: this computer only,
// never synced; a cache). The first list of a session used to read and parse every chat file (≈ 0.45 s with 1,500 chats,
// 140 MB): now a file whose size and modified time match its kept row isn't read; changed / new files are, as before.
const rows = { file: null, loaded: false, dirty: false, t: null };
function rowsLoad(cacheFile, dir) {
  if (rows.loaded || !cacheFile) return;
  rows.loaded = true; rows.file = cacheFile;
  let j = null;
  try { j = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { return; }
  if (j?.v !== 1 || !j.rows || typeof j.rows !== 'object') return;
  for (const [name, r] of Object.entries(j.rows)) {
    const file = path.join(dir, name);
    if (index.has(file) || !r || typeof r.size !== 'number' || typeof r.mtimeMs !== 'number' || typeof r.ctimeMs !== 'number' || !r.sum || typeof r.sum !== 'object') continue;
    index.set(file, { size: r.size, mtimeMs: r.mtimeMs, ctimeMs: r.ctimeMs, sum: r.sum, texts: null, n: 0 });
  }
}
function rowsSave(dir) {
  if (!rows.file || !rows.dirty || rows.t) return;
  rows.t = setTimeout(() => {
    rows.t = null; if (!rows.dirty) return; rows.dirty = false;
    const out = {};
    for (const [file, e] of index) if (!e.stub && path.dirname(file) === dir) out[path.basename(file)] = { size: e.size, mtimeMs: e.mtimeMs, ctimeMs: e.ctimeMs, sum: e.sum };
    try { atomicText(rows.file, JSON.stringify({ v: 1, rows: out })); } catch { /* a cache: the next start reads the files */ }
  }, 3000);
  rows.t.unref?.();
}
function readChat(file) { try { return JSON.parse(SS.readRetry(dfs, file)); } catch { return null; } }
// (round 82, bigchat82) a giant chat's own fields (title, times, pinned…) without parsing its messages: the bytes cut
// (bigchat-core.js), only the part around the messages parsed. The list's row needs nothing else. ≈ 10× less work
// than JSON.parse of the whole file; a file the cut can't read is parsed whole, as before
function readHead(file) {
  let buf;
  try { buf = dfs.readFileSync(file); } catch { return readChat(file); }
  const st = BC().scanBuf(buf);
  if (st.bad) { try { return JSON.parse(buf.toString('utf8').replace(/^\uFEFF/, '')); } catch { return null; } }
  try { return BC().headOf(buf, st); } catch { return null; }
}
// every chat file, fresh: unchanged files come from the index, changed / new ones are read once
// (round 43, datasafe) a held chat file is read again a few times; one that still can't be read keeps its last row (or
// a stub row: chats never vanish from the list because a read failed); a folder that can't be listed (held, a cloud
// client) gives what the index already knows instead of "no chats" — chats.doubt says which happened
function chats(dir) {
  let names;
  chats.doubt = null;
  for (let i = 0; ; i++) {
    try { names = dfs.readdirSync(dir).filter((f) => f.endsWith('.json')); break; } catch (err) {
      if (err.code === 'ENOENT') return [];
      if (i < 4 && DS.BUSY.has(err.code)) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40 * (i + 1)); continue; }
      chats.doubt = { why: 'folder', code: err.code };
      return [...index.entries(), ...[...stubs.entries()].filter(([file]) => !index.has(file))].filter(([file]) => file.startsWith(dir)).map(([file, e]) => ({ file, e }));
    }
  }
  const seen = new Set();
  const out = [];
  let bad = 0;
  for (const f of names) {
    const file = path.join(dir, f);
    seen.add(file);
    const st = stat(file);
    if (!st) continue;
    let e = index.get(file);
    if (!e || e.size !== st.size || e.mtimeMs !== st.mtimeMs || (e.ctimeMs != null && e.ctimeMs !== st.ctimeMs)) { // (ctime: a kept row also matches the file's change time)
      const chat = st.size >= BIG ? readHead(file) : readChat(file); // (round 82, bigchat82) a giant one: its own fields only (cut, not parsed)
      if (!chat) { bad += 1; const s = e || { size: -1, mtimeMs: -1, sum: DS.chatStub(f, st), texts: null, n: 0, stub: true }; if (!e) stubs.set(file, s); out.push({ file, e: s }); continue; }
      stubs.delete(file);
      drop(file);
      e = entryOf(chat, st);
      index.set(file, e); rows.dirty = true;
    }
    out.push({ file, e });
  }
  if (bad) chats.doubt = { why: 'files', n: bad };
  for (const file of [...index.keys()]) if (file.startsWith(dir) && !seen.has(file)) drop(file);
  for (const file of [...stubs.keys()]) if (file.startsWith(dir) && !seen.has(file)) stubs.delete(file);
  return out;
}

const OPS = {
  write({ file, value, prev, chatDir, sent, removed, doubt, blind, chatVer }) {
    // (round 43, datasafe) a save built on a failed read: merged with the file (throws when it's still held: nothing is
    // written); the first save of a session that shrinks a store a lot keeps a copy aside; rotating copies
    let kept = 0;
    if (!SS.guardedName(file) && (doubt || blind || DS.storeOf(file))) {
      const d = DS.guardWrite(dsEnv, { file, value, doubt, blind });
      if (!d.keepPrev) prev = null;
      value = d.value; kept = d.kept;
    }
    let text = JSON.stringify(value, null, 2);
    let h = sha(text);
    if (sameOnDisk(file, h)) { if (chatDir && chatVer && Array.isArray(value?.messages)) { const st = stat(file); const had = bigs.get(file); if (st && had?.sig === bigSig(st)) had.vers.add(chatVer); else if (st) bigs.set(file, { vers: new Set([chatVer]), sig: bigSig(st), head: { ...value, messages: [] }, els: null }); } return { skipped: true }; }
    // (round 43, scenesafe) the Lab's scenes / History: scenes nobody deleted are kept, rotating copies, a damaged file
    // kept aside (scenesafe-core.js); a file held by another program throws here: the save waits for the next one
    let restored = null; let keepPrev = true;
    if (SS.guardedName(file)) {
      const g = SS.prepareWrite(ssEnv, { file, value, sent, removed });
      keepPrev = g.keepPrev;
      if (g.value !== value) { value = g.value; restored = g.restored.length ? g.restored : null; text = JSON.stringify(value, null, 2); h = sha(text); if (sameOnDisk(file, h)) return { skipped: true, ...(restored ? { restored } : {}) }; }
    }
    if (prev && keepPrev && fs.existsSync(file)) fs.copyFileSync(file, prev);
    if (findIdx) findIdx.stale(file); // (round 81) a saved chat / scene / board / worktable is read again at the next find
    const tmp = `${file}.w.tmp`;
    // (round 29, safetynet) flushed to the disk before the rename: after a power cut the file is the old one or the
    // new one, never an empty one (this thread waits for it; the window and the main process don't)
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, text); try { fs.fsyncSync(fd); } catch { /* a disk that can't: as before */ } } finally { fs.closeSync(fd); }
    renameRetry(tmp, file);
    const st = stat(file);
    if (st) written.set(file, { h, size: st.size, mtimeMs: st.mtimeMs });
    if (SS.guardedName(file)) SS.afterWrite(ssEnv, file, value);
    if (restored) return { bytes: text.length, restored };
    if (kept) return { bytes: text.length, kept };
    // a chat saved here goes straight into the index (no read back)
    // (round 82, bigchat82) a giant one isn't tokenized for recall here (seconds of this thread on every save): its next
    // recall reads it in slices (recall below). chatVer: the window holds this version now (its next saves: by change)
    if (chatDir && st && value && typeof value === 'object') { drop(file); index.set(file, entryOf(value, st)); rows.dirty = true; rowsSave(path.dirname(file)); if (recallIdx && text.length < BIG) { recallIdx.add(file, value, recallSrc(index.get(file))); recallKeep.changed += 1; } }
    if (chatDir) { if (chatVer && st && Array.isArray(value?.messages)) bigs.set(file, { vers: new Set([chatVer]), sig: bigSig(st), head: { ...value, messages: [] }, els: null }); else bigs.delete(file); }
    return { bytes: text.length };
  },
  // (round 82, bigchat82) a giant chat for the window: its bytes in parts of `part` bytes (each its own memory), handed
  // over (transferred) without a copy; the main process passes each part on as it is
  chatOpen({ file, ver, part = 4 * 1024 * 1024 }) {
    const fd = fs.openSync(file, 'r');
    try {
      const st = fs.fstatSync(fd);
      const parts = [];
      for (let pos = 0; pos < st.size || !parts.length;) {
        const u = new Uint8Array(new ArrayBuffer(Math.min(part, st.size - pos)));
        for (let got = 0; got < u.length;) { const n = fs.readSync(fd, u, got, u.length - got, pos + got); if (!n) throw new Error('changed while read'); got += n; }
        parts.push(u); pos += u.length;
        if (!u.length) break;
      }
      const prev = bigs.get(file);
      if (prev?.sig === bigSig(st)) { prev.vers.add(ver); if (prev.vers.size > 16) prev.vers.delete(prev.vers.values().next().value); } else bigs.set(file, { vers: new Set([ver]), sig: bigSig(st), head: null, els: null });
      return { parts, size: st.size, __transfer: parts.map((u) => u.buffer) };
    } finally { fs.closeSync(fd); }
  },
  // (round 82, bigchat82) a giant chat saved by what changed (see the header). The file is cut once (the first change
  // after it was opened), then each save copies what didn't change and writes what did
  chatDelta(d) {
    const { file } = d;
    try {
      const e = bigs.get(file);
      if (!e || !e.vers.has(d.from)) return { ok: false, why: 'version' };
      const st0 = stat(file);
      if (!st0 || bigSig(st0) !== e.sig) { bigs.delete(file); return { ok: false, why: 'changed' }; }
      if (!e.els || !e.head) {
        const buf = fs.readFileSync(file);
        if (bigSig(stat(file)) !== e.sig) { bigs.delete(file); return { ok: false, why: 'changed' }; }
        const cut = BC().scanBuf(buf);
        if (cut.bad || !BC().prettyLayout(buf, cut)) { bigs.delete(file); return { ok: false, why: 'layout' }; }
        e.head = BC().headOf(buf, cut); e.els = cut.els;
      }
      const tmp = `${file}.w.tmp`;
      let r;
      try { r = BC().deltaWrite(fs, file, tmp, e, d); } catch (err) { try { fs.rmSync(tmp, { force: true }); } catch { /* gone */ } bigs.delete(file); return { ok: false, why: err.message }; }
      renameRetry(tmp, file);
      const st = stat(file);
      if (!st) { bigs.delete(file); return { ok: false, why: 'gone' }; }
      Object.assign(e, { vers: new Set([d.to]), sig: bigSig(st), head: r.head, els: r.els });
      written.set(file, { h: '', size: st.size, mtimeMs: st.mtimeMs }); // (no hash: a whole save of the same chat writes again)
      merged.delete(file);
      if (findIdx) findIdx.stale(file);
      drop(file); index.set(file, { size: st.size, mtimeMs: st.mtimeMs, ctimeMs: st.ctimeMs, sum: BC().sumOf(r.head), texts: null, n: 0 }); rows.dirty = true; rowsSave(path.dirname(file));
      return { ok: true, bytes: r.bytes };
    } finally { if (deltaDone) { Atomics.add(deltaDone, 0, 1); Atomics.notify(deltaDone, 0); } }
  },
  list({ dir, ds, cache }) {
    rowsLoad(cache, dir);
    const list = chats(dir).map(({ e }) => e.sum).sort((a, b) => b.updatedAt - a.updatedAt);
    rowsSave(dir);
    return ds ? { list, doubt: chats.doubt } : list; // (round 43, datasafe) with what couldn't be read
  },
  search({ dir, query }) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];
    warmTexts();
    const hits = [];
    for (const { file, e } of chats(dir)) {
      let texts = e.texts;
      if (!texts && e.size >= BIG) { // (round 82, bigchat82) a giant chat: its bytes searched, not the file parsed again
        const ix = bigSearchIx(file, e);
        if (ix) {
          const r = BC().searchBig(ix, q, (k) => textAtBytes(file, ix, k));
          let snippet = null;
          if (r.count) { const t = String(textAtBytes(file, ix, r.first) || ''); const i = t.toLowerCase().indexOf(q); if (i >= 0) snippet = `${i > 50 ? '…' : ''}${t.slice(Math.max(0, i - 50), i + q.length + 70).replace(/\s+/g, ' ')}`; }
          const s0 = e.sum;
          if (r.count || s0.title?.toLowerCase().includes(q)) hits.push({ id: s0.id, agentId: s0.agentId, title: s0.title, updatedAt: s0.updatedAt, count: r.count, snippet });
          continue;
        }
      }
      if (!texts) {
        const chat = readChat(file); texts = (chat?.messages || []).map((m) => m.text || '');
        const n = texts.reduce((a, t) => a + t.length, 0);
        if (textChars + n <= TEXT_CAP) { e.texts = texts; e.n = n; textChars += n; } // kept for the next keystrokes
      }
      let count = 0; let snippet = null;
      for (let k = 0; k < texts.length; k++) {
        const i = texts[k].toLowerCase().indexOf(q);
        if (i < 0) continue;
        count += 1;
        const t = texts[k];
        snippet ||= `${i > 50 ? '…' : ''}${t.slice(Math.max(0, i - 50), i + q.length + 70).replace(/\s+/g, ' ')}`;
      }
      const s = e.sum;
      if (count || s.title?.toLowerCase().includes(q)) hits.push({ id: s.id, agentId: s.agentId, title: s.title, updatedAt: s.updatedAt, count, snippet });
    }
    return hits.sort((a, b) => b.count - a.count || b.updatedAt - a.updatedAt).slice(0, 100);
  },
  // a big store read and parsed here (the main thread only receives the result)
  read({ file, fallback, status, ds }) {
    if (path.basename(file) === 'projects.json') {
      const before = stat(file);
      const r = status ? SS.readStatus(fs, file) : DS.load(dfs, file, fallback ?? null);
      const result = before ? require('./project-index-maintenance').compactRead(fs, file, r, before) : r;
      if (status || ds) { delete result.prev; return result; }
      return result.value;
    }
    if (status) return SS.readStatus(fs, file); // (round 43, scenesafe) ok / missing / unreadable, never a silent fallback
    if (ds) { const r = DS.load(dfs, file, fallback ?? null); delete r.prev; return r; } // (round 43, datasafe) + what happened
    let text;
    try { text = SS.readRetry(fs, file); } catch { return fallback ?? null; }
    try { const v = JSON.parse(text); const st = stat(file); if (st) written.set(file, { h: sha(text), size: st.size, mtimeMs: st.mtimeMs }); return v; } catch { /* cut short or garbled */ }
    // (round 29, safetynet) a store that can't be read falls back to its previous version (<name>.prev.json)
    try { return JSON.parse(fs.readFileSync(file.replace(/\.json$/, '.prev.json'), 'utf8')); } catch { return fallback ?? null; }
  },
  // (round 73, startfast73) a big list store's rows with only some of their fields (the Lab's scenes' ids, names and
  // times, without their code): the window gets a few KB instead of MBs. null: not a list, or not readable (the caller
  // reads the whole store then, with its careful fallbacks)
  pick({ file, fields }) {
    let v;
    try { v = JSON.parse(SS.readRetry(fs, file)); } catch { return null; }
    if (!Array.isArray(v)) return null;
    const keys = Array.isArray(fields) ? fields.map(String) : [];
    return v.filter((x) => x && typeof x === 'object').map((x) => { const o = {}; for (const k of keys) if (x[k] !== undefined) o[k] = x[k]; return o; });
  },
  // the files thread (a second copy of this worker, so a big folder never holds up a save): fsapi's recursive listing
  // and its full-text search of a folder
  flist({ dir, opts }) { return flist(dir, opts || {}); },
  fsearch({ dir, q, opts }) { return fsearch(dir, q, opts || {}); },
  // cloud sync (sync-engine.js hashJson): a big JSON store read, put in its cloud form and hashed, as the engine does
  syncHash({ file, rel, cloud, ctx }) {
    const S = require('./sync-merge');
    // (round 82, bigchat82) a giant chat: its cloud form made from its messages' bytes (bigchat-core.js cloudForm)
    if (isChatRel(rel) && sizeOf(file) >= SYNC_BIG) {
      try { const cf = formOf(file, cloud ? null : ctx, S); if (cf) return { h: cf.h, t: null }; } catch { /* the whole-file way below */ }
    }
    let v;
    try { v = S.parseJson(fs.readFileSync(file, 'utf8')); } catch { return { bad: true }; }
    if (!cloud && rel === 'app/config.json') v = S.portableConfig(v);
    const t = JSON.stringify(cloud ? v : S.toCloud(v, ctx));
    return { h: sha(t), t: t.length < 16e6 ? t : null }; // the text too: a push / merge in this pass uses it (no second parse)
  },
  // (round 72, sync72) a big JSON store arriving from the other computer (sync-engine.js pull), all the JSON work here:
  // the cloud copy read and checked against the hash the pass saw, its paths made this computer's, this computer's
  // version kept first (data/sync/recovery; Lab scenes about to lose some: kv/.history), the text to write in this
  // computer's form (pretty unless it was compact) and its hash. Was ≈ 60–130 ms of the main process per big store.
  syncPull({ rel, cloudFile, h, ctx, localFile, recovery, aside }) {
    const S = require('./sync-merge');
    // (round 82, bigchat82) a giant chat: checked and laid out in this computer's form from its messages' bytes
    if (isChatRel(rel) && Math.max(sizeOf(cloudFile), localFile ? sizeOf(localFile) : 0) >= SYNC_BIG) {
      let cf; try { cf = formOf(cloudFile, null, S); } catch { return { stale: true }; }
      if (cf) {
        forms.delete(`c:${cloudFile}`); // (its bytes are handed over)
        if (cf.h !== h) return { stale: true };
        let prev = null;
        if (localFile) { try { prev = fs.readFileSync(localFile); } catch (err) { if (err.code !== 'ENOENT') throw err; } }
        if (prev !== null) {
          if (BC().scanBuf(prev).bad) S.parseJson(prev.toString('utf8')); // a local version that can't be read stops the replacement (as below)
          if (recovery) atomicText(recovery, prev);
        }
        const pretty = prev === null || prev.length < 2 || /^[[{]\s/.test(prev.toString('latin1', 0, 2));
        const r = BC().localFromCloud(cf, ctx, S, pretty);
        return { out: r.out, lh: r.lh, cloudText: cf.text, prevCloud: null, __transfer: [r.out.buffer, cf.text.buffer] };
      }
    }
    let raw; try { raw = fs.readFileSync(cloudFile, 'utf8'); } catch { return { stale: true }; }
    let cloudText; try { cloudText = JSON.stringify(S.parseJson(raw)); } catch { return { stale: true }; }
    if (sha(cloudText) !== h) return { stale: true };
    const value = S.toCloud(JSON.parse(cloudText), ctx);
    let prev = null;
    if (localFile) { try { prev = fs.readFileSync(localFile, 'utf8'); } catch (err) { if (err.code !== 'ENOENT') throw err; } }
    let prevCloud = null;
    if (prev !== null) {
      const mine = S.parseJson(prev); // a local version that can't be read stops the replacement (as on the main side)
      if (recovery) atomicText(recovery, prev);
      if (aside && Array.isArray(mine) && Array.isArray(value)) sceneAside(aside, mine, value, prev);
      if (prev.length < 16e6) prevCloud = JSON.stringify(S.toCloud(mine, ctx));
    }
    const pretty = prev === null || prev.length < 2 || /^[[{]\s/.test(prev.slice(0, 2));
    const local = S.fromCloud(value, ctx);
    const out = pretty ? JSON.stringify(local, null, 2) : JSON.stringify(local);
    return { out, lh: sha(JSON.stringify(S.toCloud(JSON.parse(out), ctx))), cloudText, prevCloud };
  },
  // (round 72, sync72) both computers changed a big store (sync-engine.js merge): the three-way merge here; the main
  // side only writes. lh / ch: the hashes the pass saw (changed since → stale, the next pass looks again)
  syncMerge({ rel, localFile, cloudFile, baseFile, ctx, lh, ch, counters, keepAll, recovery, aside }) {
    const S = require('./sync-merge');
    // (round 82, bigchat82) a giant chat changed on both computers: merged with the messages all three versions share
    // stood in for (bigchat-core.js mergeChat): a new message on each side doesn't re-merge 60 MB
    if (isChatRel(rel) && Math.max(sizeOf(localFile), sizeOf(cloudFile)) >= SYNC_BIG) {
      let lr; let cr; let bb = null;
      try { lr = readStill(localFile); cr = readStill(cloudFile); } catch { return { stale: true }; }
      if (!lr || !cr) return { stale: true }; // (one is being written: the next pass)
      if (baseFile) { try { bb = fs.readFileSync(baseFile); } catch { bb = null; } }
      const O = formOf(localFile, ctx, S, lr); const T = formOf(cloudFile, null, S, cr);
      const lb = lr.buf;
      const r = O && T ? BC().mergeChat({ baseBuf: bb, localBuf: lb, cloudBuf: cr.buf, ctx, S, lh, ch, counters, keepAll, forms: { O, T } }) : null;
      if (r?.stale) return r;
      if (r) {
        if (r.localOut && recovery) atomicText(recovery, lb);
        return { ...r, __transfer: [r.text.buffer, ...(r.localOut ? [r.localOut.buffer] : [])].filter((x, i, a) => a.indexOf(x) === i) };
      }
    }
    let localRaw; let cloudRaw;
    try { localRaw = fs.readFileSync(localFile, 'utf8'); cloudRaw = fs.readFileSync(cloudFile, 'utf8'); } catch { return { stale: true }; }
    let ours; let theirsText;
    try { ours = S.toCloud(S.parseJson(localRaw), ctx); theirsText = JSON.stringify(S.parseJson(cloudRaw)); } catch { return { stale: true }; }
    const oursText = JSON.stringify(ours);
    if (sha(oursText) !== lh || sha(theirsText) !== ch) return { stale: true };
    let base = null; if (baseFile) { try { base = S.parseJson(fs.readFileSync(baseFile, 'utf8')); } catch { base = null; } }
    const r = S.merge3(base, ours, S.toCloud(JSON.parse(theirsText), ctx), { counters, keepAll });
    const text = JSON.stringify(r.value); const hm = sha(text);
    let localOut = null;
    if (hm !== lh) {
      if (recovery) atomicText(recovery, localRaw);
      if (aside && Array.isArray(r.value)) sceneAside(aside, S.parseJson(localRaw), r.value, localRaw);
      const pretty = localRaw.length < 2 || /^[[{]\s/.test(localRaw.slice(0, 2));
      const local = S.fromCloud(r.value, ctx);
      localOut = pretty ? JSON.stringify(local, null, 2) : JSON.stringify(local);
    }
    return { text, hm, localOut, conflicts: r.conflicts, theirsText: r.conflicts.length ? theirsText : null, oursText: hm !== lh && oursText.length < 16e6 ? oursText : null }; // (only what the main side uses: less to copy over)
  },
  // (round 82, bigchat82) a giant chat's cloud form for a push (sync-engine.js o.textJson): made here (or kept from
  // this pass's hash), handed over without a copy; the main process writes the bytes as they are
  syncText({ file, ctx }) {
    const S = require('./sync-merge');
    const cf = formOf(file, ctx, S);
    if (!cf) return null;
    forms.delete(`l:${file}`); // (its bytes are handed over)
    return { h: cf.h, text: cf.text, __transfer: [cf.text.buffer] };
  },
  // (round 82, bigchat82) Earlier versions of a giant chat: a copy's digest (bigchat-core.js digestBytes), not the copy.
  // ctx: a cloud copy (its paths made this computer's first) · wrapped: a copy kept before a restore ({ thing })
  chatDigest({ file, ctx, wrapped }) {
    const S = require('./sync-merge'); const VC = require('./versions-core');
    const key = `${ctx ? 'c' : 'l'}${wrapped ? 'w' : ''}:${file}`;
    const got = readStill(file);
    if (!got) return null;
    const had = digests.get(key);
    if (had && had.sig === got.sig) return had.dg;
    let dg = wrapped ? null : BC().digestBytes(got.buf, ctx, S, VC);
    if (!dg) { // (a wrapped copy, a file the cut can't read: parsed here, never on the main process)
      let v; try { v = S.parseJson(got.buf.toString('utf8')); } catch { return null; }
      if (ctx) v = S.fromCloud(v, ctx);
      if (wrapped) v = v?.thing;
      dg = BC().digestValue(v, VC);
    }
    if (dg) { digests.set(key, { sig: got.sig, dg }); if (digests.size > 32) digests.delete(digests.keys().next().value); }
    return dg;
  },
  // (round 82, bigchat82) a giant chat's copy in this computer's form, as bytes for the window (Earlier versions' Preview /
  // Restore): a cloud copy laid out from its bytes (localFromCloud), a wrapped one taken out of its wrapper here
  chatBytes({ file, ctx, wrapped }) {
    const S = require('./sync-merge');
    const got = readStill(file);
    if (!got) return null;
    let out = null;
    if (!wrapped && !ctx) out = got.buf;
    else if (!wrapped) { const cf = BC().cloudForm(got.buf, null, S); if (cf) out = BC().localFromCloud(cf, ctx, S, true).out; }
    if (!out) { let v = S.parseJson(got.buf.toString('utf8')); if (ctx) v = S.fromCloud(v, ctx); if (wrapped) v = v?.thing; if (!v) return null; out = Buffer.from(JSON.stringify(v), 'utf8'); }
    const copy = new Uint8Array(new ArrayBuffer(out.length)); copy.set(out); // (its own memory: handed over whole)
    return { bytes: copy, __transfer: [copy.buffer] };
  },
  // (round 30) recall: the index is built only when asked (an idle moment, or a question), never at startup; nothing on disk
  recall({ dir, q, budgetMs = 12, limit }) {
    const t0 = performance.now();
    recallIdx ||= recallLoad(dir);
    const live = new Set(); let left = 0; let added = 0;
    const soft = budgetMs * 0.7;
    // a question looks at the folder as it is now; a background slice may reuse the last look (≤ 2 s)
    const fresh = q || !recallList || recallList.dir !== dir || Date.now() - recallList.at > 2000;
    if (fresh) recallList = { dir, at: Date.now(), list: chats(dir) };
    for (const { file, e } of recallList.list) {
      live.add(file);
      if (recallIdx.has(file, recallSrc(e))) { const j = recallJobs.get(file); if (j) { recallIdx.abort(j.b); recallJobs.delete(file); } continue; }
      if (performance.now() - t0 > (e.size >= FIND_BIG ? soft : budgetMs)) { left += 1; continue; }
      // (round 82, bigchat82) a long chat (≥ 128 KB): read and indexed a slice at a time; what it was stays found until then
      if (e.size >= FIND_BIG) {
        const sig = `${e.size}:${e.mtimeMs}`;
        let j = recallJobs.get(file);
        if (j && j.sig !== sig) { recallIdx.abort(j.b); recallJobs.delete(file); j = null; }
        if (!j) {
          const b = recallIdx.begin(file, recallSrc(e)); const els = [];
          j = { sig, b, els, r: BC().reader(fs, file, { chunk: 512 * 1024, onMessage: (m, k, s, x) => { recallIdx.msg(b, m, k); els.push(s, x); } }) };
          recallJobs.set(file, j);
        }
        const state = j.r.step(() => performance.now() - t0 > soft);
        if (state === 'more') { left += 1; continue; }
        recallJobs.delete(file);
        if (state === 'done') { recallIdx.end(j.b, j.r.head || {}); spans.set(file, { sig, els: j.els }); added += 1; continue; }
        recallIdx.abort(j.b);
        if (state === 'changed') { left += 1; continue; }
      }
      const chat = readChat(file);
      if (chat) { recallIdx.add(file, chat, recallSrc(e)); added += 1; } else live.delete(file);
    }
    for (const [file, j] of recallJobs) if (!live.has(file)) { recallIdx.abort(j.b); recallJobs.delete(file); }
    recallKeep.changed += added;
    if (added && !left) recallIdx.trim?.(); // (round 34, lightweight) caught up: its lists cut to size
    if (!left && (recallKeep.changed >= 25 || (!recallKeep.had && recallKeep.changed > 0))) recallSave(); // (round 83) kept for the next start
    for (const file of recallIdx.keys()) if (file.startsWith(dir) && !live.has(file)) recallIdx.drop(file);
    const size = recallIdx.size();
    if (!q) return { left, ...size, ms: Math.round(performance.now() - t0) };
    const reread = new Map();
    const textOf = (file, k) => {
      const e = index.get(file);
      if (e?.texts) return e.texts[k] || '';
      const one = msgAt(file, k, e); if (one !== undefined) return one?.text || ''; // (round 82) a long chat: that one message read
      if (!reread.has(file)) reread.set(file, readChat(file));
      return reread.get(file)?.messages?.[k]?.text || '';
    };
    const res = recallIdx.search(q, { textOf, limit });
    return { ...res, left, ms: Math.round(performance.now() - t0) };
  },
  // (round 75, syncstate75) a store saved by what changed (usage.js → store.js mergeKV): read here (with its .prev copy
  // when damaged, as the main side did), the changes applied, written as write() does. The main process only passes
  // the changes on. The value as last merged here is kept while the file stays as this thread left it (size + time):
  // a year-sized store isn't read and parsed again every minute. → { ok: true } | { ok: false, state }
  mergeKV({ file, ops, prev, doubt, blind }) {
    let value = null;
    const m = merged.get(file);
    if (m) { const st = stat(file); if (st && st.size === m.size && st.mtimeMs === m.mtimeMs) value = m.value; else merged.delete(file); }
    if (!value) {
      const r = SS.readStatus(dfs, file);
      if (r.state !== 'ok' || !r.value || typeof r.value !== 'object' || Array.isArray(r.value)) return { ok: false, state: r.state };
      value = r.value;
    }
    applyOps(value, ops);
    merged.delete(file);
    const res = OPS.write({ file, value, prev, doubt, blind });
    const st = stat(file);
    if (st && !doubt && !blind && !res?.kept) { merged.set(file, { value, size: st.size, mtimeMs: st.mtimeMs }); if (merged.size > 8) merged.delete(merged.keys().next().value); }
    return { ok: true };
  },
  // (round 81, projsearch81) Find in this project: the window asks in slices while the Desk is open (budgetMs), then queries
  projfind(msg) {
    const PF = require('./projfind-core');
    findIdx ||= PF.createIndex();
    clearTimeout(findT); findT = setTimeout(() => { findIdx = null; }, 20 * 60000); findT.unref?.();
    return PF.run(findIdx, msg, { stat, join: path.join, now: () => performance.now(), read: (f) => { try { return JSON.parse(SS.readRetry(dfs, f)); } catch { return null; } },
      big: { min: FIND_BIG, open: (file, onMessage, o) => BC().reader(fs, file, { ...o, onMessage, chunk: 512 * 1024 }) } }); // (round 82, bigchat82) a long chat (≥ 128 KB): read and indexed in slices
  },
  // (round 83, idleburst83) 🧭 Cost coach's look at one chat (costcoachmain.js scan): parsed here, only its per-reply
  // records go back (a long chat's JSON.parse held the main process 70–140 ms)
  costRecords({ file, from, to }) {
    const chat = readChat(file);
    if (!chat) return null;
    return { id: chat.id, agent: chat.agentId, title: String(chat.title || '').slice(0, 80), recs: require('./costcoach-core').recordsOf(chat, { from, to }) };
  },
  forget({ file }) { written.delete(file); merged.delete(file); bigs.delete(file); drop(file); if (findIdx) findIdx.stale(file); return true; },
  ping() { return { chats: index.size, textChars }; },
};

parentPort.on('message', (msg) => {
  const t0 = performance.now();
  let res; let err = null;
  try { res = OPS[msg.op](msg); } catch (e) { err = e.message || String(e); }
  // (round 82, bigchat82) big bytes handed over, not copied (res.__transfer: their ArrayBuffers)
  const tr = res && typeof res === 'object' && Array.isArray(res.__transfer) ? res.__transfer : null;
  if (tr) delete res.__transfer;
  parentPort.postMessage({ id: msg.id, res, err, ms: performance.now() - t0 }, tr || undefined);
});
