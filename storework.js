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
// Chat files are parsed once and kept (by size + mtime): a list or a search only re-reads the files that changed, and
// a chat saved through here is indexed from the value itself (no re-read). Texts are kept up to TEXT_CAP characters
// in all; past that, a search reads the files again (still on this thread).
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { list: flist, search: fsearch } = require('./fswalk');

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const TEXT_CAP = 32 * 1024 * 1024;
const written = new Map(); // file → { h, size, mtimeMs } of the text this thread last wrote / saw there
const index = new Map(); // chat file → { size, mtimeMs, sum, texts, lower }
let textChars = 0;

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
  const texts = (chat.messages || []).map((m) => m.text || '');
  const n = texts.reduce((a, t) => a + t.length, 0);
  const keep = textChars + n <= TEXT_CAP;
  if (keep) textChars += n;
  const { id, agentId, title, updatedAt, pinned, model } = chat;
  return { size: st.size, mtimeMs: st.mtimeMs, sum: { id, agentId, title, updatedAt, pinned: Boolean(pinned), model }, texts: keep ? texts : null, lower: null, n: keep ? n : 0 };
}
function drop(file) { const e = index.get(file); if (e) { textChars -= e.n; index.delete(file); } }
function readChat(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
// every chat file, fresh: unchanged files come from the index, changed / new ones are read once
function chats(dir) {
  let names;
  try { names = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const seen = new Set();
  const out = [];
  for (const f of names) {
    const file = path.join(dir, f);
    seen.add(file);
    const st = stat(file);
    if (!st) continue;
    let e = index.get(file);
    if (!e || e.size !== st.size || e.mtimeMs !== st.mtimeMs) {
      drop(file);
      const chat = readChat(file);
      if (!chat) continue;
      e = entryOf(chat, st);
      index.set(file, e);
    }
    out.push({ file, e });
  }
  for (const file of [...index.keys()]) if (file.startsWith(dir) && !seen.has(file)) drop(file);
  return out;
}

const OPS = {
  write({ file, value, prev, chatDir }) {
    const text = JSON.stringify(value, null, 2);
    const h = sha(text);
    if (sameOnDisk(file, h)) return { skipped: true };
    if (prev && fs.existsSync(file)) fs.copyFileSync(file, prev);
    const tmp = `${file}.w.tmp`;
    // (round 29, safetynet) flushed to the disk before the rename: after a power cut the file is the old one or the
    // new one, never an empty one (this thread waits for it; the window and the main process don't)
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, text); try { fs.fsyncSync(fd); } catch { /* a disk that can't: as before */ } } finally { fs.closeSync(fd); }
    renameRetry(tmp, file);
    const st = stat(file);
    if (st) written.set(file, { h, size: st.size, mtimeMs: st.mtimeMs });
    // a chat saved here goes straight into the index (no read back)
    if (chatDir && st && value && typeof value === 'object') { drop(file); index.set(file, entryOf(value, st)); }
    return { bytes: text.length };
  },
  list({ dir }) {
    return chats(dir).map(({ e }) => e.sum).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  search({ dir, query }) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];
    const hits = [];
    for (const { file, e } of chats(dir)) {
      let texts = e.texts;
      if (!texts) { const chat = readChat(file); texts = (chat?.messages || []).map((m) => m.text || ''); }
      const lower = e.lower || texts.map((t) => t.toLowerCase());
      if (e.texts && !e.lower) e.lower = lower; // kept next to the texts (so up to twice TEXT_CAP in all)
      let count = 0; let snippet = null;
      for (let k = 0; k < lower.length; k++) {
        const i = lower[k].indexOf(q);
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
  read({ file, fallback }) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return fallback ?? null; }
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
    try { v = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { bad: true }; }
    if (!cloud && rel === 'app/config.json') v = S.portableConfig(v);
    const t = JSON.stringify(cloud ? v : S.toCloud(v, ctx));
    return { h: sha(t), t: t.length < 16e6 ? t : null }; // the text too: a push / merge in this pass uses it (no second parse)
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
