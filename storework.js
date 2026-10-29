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
  coolT = setTimeout(() => { textsWarm = false; for (const e of index.values()) { e.texts = null; e.n = 0; } textChars = 0; }, TEXT_IDLE_MS);
  coolT.unref?.();
}
const written = new Map(); // file → { h, size, mtimeMs } of the text this thread last wrote / saw there
const merged = new Map(); // (round 75) file → { value, size, mtimeMs }: a store as mergeKV last wrote it
const applyOps = (root, ops) => require('./kvops').applyOps(root, ops); // (round 75, syncstate75) kvops.js, required when first used
const index = new Map(); // chat file → { size, mtimeMs, sum, texts, lower }
const stubs = new Map(); // (round 43) chat file → its stub row, while it can't be read (kept for a folder that can't be listed)
let textChars = 0;
let recallIdx = null; // (round 30) recall-core.js's index, made on the first recall op
let findIdx = null; let findT = null; // (round 81, projsearch81) projfind-core.js's index: made on the first find, let go 20 min after the last

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
      const chat = readChat(file);
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
    if (chatDir && st && value && typeof value === 'object') { drop(file); index.set(file, entryOf(value, st)); rows.dirty = true; rowsSave(path.dirname(file)); if (recallIdx) recallIdx.add(file, value, index.get(file)); }
    return { bytes: text.length };
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
    return PF.run(findIdx, msg, { stat, join: path.join, now: () => performance.now(), read: (f) => { try { return JSON.parse(SS.readRetry(dfs, f)); } catch { return null; } } });
  },
  forget({ file }) { written.delete(file); merged.delete(file); drop(file); if (findIdx) findIdx.stale(file); return true; },
  ping() { return { chats: index.size, textChars }; },
};

parentPort.on('message', (msg) => {
  const t0 = performance.now();
  let res; let err = null;
  try { res = OPS[msg.op](msg); } catch (e) { err = e.message || String(e); }
  parentPort.postMessage({ id: msg.id, res, err, ms: performance.now() - t0 });
});
