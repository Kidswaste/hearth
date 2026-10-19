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
//   recall { dir, q?, budgetMs? }  (round 30) "what did we decide about X?": catches the recall index up (only chats that
//                                 changed, within the budget) and, with q, ranks the messages (recall-core.js)
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

const SS = require('./scenesafe-core');
const ssEnv = { fs, path, cache: new Map() };
// (round 43, datasafe) every other store: a save built on a failed read merges with the disk; copies; chats never vanish
const DS = require('./datasafe-core');
const dfs = DS.faults(fs, path.join(__dirname, 'data'));
const dsEnv = { fs: dfs, path, cache: new Map() };
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const TEXT_CAP = 16 * 1024 * 1024;
const TEXT_IDLE_MS = Number(process.env.HEARTH_TEXT_IDLE_MS) || 10 * 60 * 1000; // texts let go after this long without a search
let textsWarm = false; let coolT = null;
function warmTexts() {
  textsWarm = true; clearTimeout(coolT);
  coolT = setTimeout(() => { textsWarm = false; for (const e of index.values()) { e.texts = null; e.n = 0; } textChars = 0; }, TEXT_IDLE_MS);
  coolT.unref?.();
}
const written = new Map(); // file → { h, size, mtimeMs } of the text this thread last wrote / saw there
const index = new Map(); // chat file → { size, mtimeMs, sum, texts, lower }
const stubs = new Map(); // (round 43) chat file → its stub row, while it can't be read (kept for a folder that can't be listed)
let textChars = 0;
let recallIdx = null; // (round 30) recall-core.js's index, made on the first recall op

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
  return { size: st.size, mtimeMs: st.mtimeMs, sum: { id, agentId, title, updatedAt, pinned: Boolean(pinned), model }, texts: keep ? texts : null, n: keep ? n : 0 };
}
function drop(file) { const e = index.get(file); if (e) { textChars -= e.n; index.delete(file); } }
function readChat(file) { try { return JSON.parse(SS.readRetry(dfs, file)); } catch { return null; } }
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
    if (!e || e.size !== st.size || e.mtimeMs !== st.mtimeMs) {
      const chat = readChat(file);
      if (!chat) { bad += 1; const s = e || { size: -1, mtimeMs: -1, sum: DS.chatStub(f, st), texts: null, n: 0, stub: true }; if (!e) stubs.set(file, s); out.push({ file, e: s }); continue; }
      stubs.delete(file);
      drop(file);
      e = entryOf(chat, st);
      index.set(file, e);
    }
    out.push({ file, e });
  }
  if (bad) chats.doubt = { why: 'files', n: bad };
  for (const file of [...index.keys()]) if (file.startsWith(dir) && !seen.has(file)) drop(file);
  for (const file of [...stubs.keys()]) if (file.startsWith(dir) && !seen.has(file)) stubs.delete(file);
  return out;
}

const OPS = {
  write({ file, value, prev, chatDir, sent, removed, doubt, blind }) {
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
    if (sameOnDisk(file, h)) return { skipped: true };
    // (round 43, scenesafe) the Lab's scenes / History: scenes nobody deleted are kept, rotating copies, a damaged file
    // kept aside (scenesafe-core.js); a file held by another program throws here: the save waits for the next one
    let restored = null; let keepPrev = true;
    if (SS.guardedName(file)) {
      const g = SS.prepareWrite(ssEnv, { file, value, sent, removed });
      keepPrev = g.keepPrev;
      if (g.value !== value) { value = g.value; restored = g.restored.length ? g.restored : null; text = JSON.stringify(value, null, 2); h = sha(text); if (sameOnDisk(file, h)) return { skipped: true, ...(restored ? { restored } : {}) }; }
    }
    if (prev && keepPrev && fs.existsSync(file)) fs.copyFileSync(file, prev);
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
    if (chatDir && st && value && typeof value === 'object') { drop(file); index.set(file, entryOf(value, st)); if (recallIdx) recallIdx.add(file, value, index.get(file)); }
    return { bytes: text.length };
  },
  list({ dir, ds }) {
    const list = chats(dir).map(({ e }) => e.sum).sort((a, b) => b.updatedAt - a.updatedAt);
    return ds ? { list, doubt: chats.doubt } : list; // (round 43, datasafe) with what couldn't be read
  },
  search({ dir, query }) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];
    warmTexts();
    const hits = [];
    for (const { file, e } of chats(dir)) {
      let texts = e.texts;
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
  // the files thread (a second copy of this worker, so a big folder never holds up a save): fsapi's recursive listing
  // and its full-text search of a folder
  flist({ dir, opts }) { return flist(dir, opts || {}); },
  fsearch({ dir, q, opts }) { return fsearch(dir, q, opts || {}); },
  // cloud sync (sync-engine.js hashJson): a big JSON store read, put in its cloud form and hashed, as the engine does
  syncHash({ file, rel, cloud, ctx }) {
    const S = require('./sync-merge');
    let v;
    try { v = S.parseJson(fs.readFileSync(file, 'utf8')); } catch { return { bad: true }; }
    if (!cloud && rel === 'app/config.json') v = S.portableConfig(v);
    const t = JSON.stringify(cloud ? v : S.toCloud(v, ctx));
    return { h: sha(t), t: t.length < 16e6 ? t : null }; // the text too: a push / merge in this pass uses it (no second parse)
  },
  // (round 30) recall: the index is built only when asked (an idle moment, or a question), never at startup; nothing on disk
  recall({ dir, q, budgetMs = 12, limit }) {
    const t0 = performance.now();
    recallIdx ||= require('./recall-core').createIndex();
    const live = new Set(); let left = 0; let added = 0;
    for (const { file, e } of chats(dir)) {
      live.add(file);
      if (recallIdx.has(file, e)) continue;
      if (performance.now() - t0 > budgetMs) { left += 1; continue; }
      const chat = readChat(file);
      if (chat) { recallIdx.add(file, chat, e); added += 1; } else live.delete(file);
    }
    if (added && !left) recallIdx.trim?.(); // (round 34, lightweight) caught up: its lists cut to size
    for (const file of recallIdx.keys()) if (file.startsWith(dir) && !live.has(file)) recallIdx.drop(file);
    const size = recallIdx.size();
    if (!q) return { left, ...size, ms: Math.round(performance.now() - t0) };
    const reread = new Map();
    const textOf = (file, k) => {
      const e = index.get(file);
      if (e?.texts) return e.texts[k] || '';
      if (!reread.has(file)) reread.set(file, readChat(file));
      return reread.get(file)?.messages?.[k]?.text || '';
    };
    const res = recallIdx.search(q, { textOf, limit });
    return { ...res, left, ms: Math.round(performance.now() - t0) };
  },
  forget({ file }) { written.delete(file); drop(file); return true; },
  ping() { return { chats: index.size, textChars }; },
};

parentPort.on('message', (msg) => {
  const t0 = performance.now();
  let res; let err = null;
  try { res = OPS[msg.op](msg); } catch (e) { err = e.message || String(e); }
  parentPort.postMessage({ id: msg.id, res, err, ms: performance.now() - t0 });
});
