// Project bundles' heavy parts (round 85, projbig85), off the main process: a worker_threads worker started by
// projbundlemain.js for an export / an import and let go a minute after (inline there when a thread can't start: Node
// tools). A project holding a GIANT chat (thousands of messages, 60 MB) used to be copied, scrubbed and sent whole by
// the window (≈ 2 s of its thread), then copied, rewritten, stringified and compressed by the main process (≈ 4.7 s
// held), and an import parsed it there twice (≈ 1.2 s each) and sent it back to the window whole.
// Now a big chat (≥ 8 MB on disk) travels by its NAME: the window holds a stand-in, this thread reads the chat file
// itself, and the bytes it makes are the ones the old way made (dev/projbig85-test.js checks byte for byte):
//   chatInfo { files }        each chat: 'missing' (no file: left out as before), 'small' (the window does it as before),
//                             'unreadable' (the export / copy stops, nothing written: never "no chat"), or 'big' with
//                             its own fields (messages: [] in place, so the keys keep their order), its count and size
//                             and the paths it points at (the export card's sizes)
//   exportA { job, body, chats }   the window's body (big chats as { __bigChat: { id } }) with each big chat read here
//                             and prepared as projbundle-core prepare() does (session out, secrets scrubbed); checked;
//                             → the paths the JSON points at (the main process finds them on this computer)
//   exportB { job, map, itemRefs } → project.json as JSON.stringify writes it, its CRC and its deflated bytes (one
//                             deflateRaw at level 6, as writeZip did): handed over without a copy
//   peekBody { job?, file, entry, entries }   an import's project.json read, CRC-checked, inflated and parsed here,
//                             checked and counted (job: kept for finishImport)
//   finishImport { job, dir, bad, partsDir }  its paths made this computer's; each big chat's messages written to a
//                             part file (partsDir) and the chat replaced by its own fields + { __bigPart: { key, n } }:
//                             the window then adds it by name (projbundle:adopt → the store thread writes it)
// Nothing here writes outside partsDir (a temporary folder) and nothing is uploaded.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const P = require('./projbundle-core');
const { crc32 } = require('./zipkit');

const BIG = Number(process.env.HEARTH_BIGCHAT_MIN) || 8 * 1024 * 1024;
const state = new Map(); // job → { body, secrets }
const cache = new Map(); // file → { sig, chat } (the card's read, used again by the export a moment later)
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// a chat file read (a cloud client or antivirus holding it a moment: tried again), parsed; throws when it can't be
function readChat(file) {
  let text = null; let err = null;
  for (let i = 0; i < 5; i++) {
    try { text = fs.readFileSync(file, 'utf8'); break; } catch (e) { err = e; if (e.code === 'ENOENT' || !['EPERM', 'EBUSY', 'EACCES', 'EAGAIN'].includes(e.code)) break; sleep(80 * (i + 1)); }
  }
  if (text == null) throw Object.assign(new Error(err?.code === 'ENOENT' ? 'gone' : `can't be read (${err?.code || 'read'})`), { code: err?.code || 'EREAD' });
  const chat = JSON.parse(text.replace(/^﻿/, ''));
  if (!chat || typeof chat !== 'object' || Array.isArray(chat) || !Array.isArray(chat.messages)) throw Object.assign(new Error('not a chat'), { code: 'EPARSE' });
  return chat;
}
const sigOf = (st) => `${st.size}:${st.mtimeMs}`;
function loadBig(file) {
  const st = fs.statSync(file);
  const had = cache.get(file);
  if (had && had.sig === sigOf(st)) return had.chat;
  const chat = readChat(file);
  const st2 = fs.statSync(file);
  if (sigOf(st2) !== sigOf(st)) return readChat(file); // (changed while read: once more, not kept)
  cache.clear(); cache.set(file, { sig: sigOf(st), chat });
  return chat;
}
const headOf = (chat) => { const h = {}; for (const k of Object.keys(chat)) h[k] = k === 'messages' ? [] : chat[k]; return h; };

const OPS = {
  chatInfo({ files = [] } = {}) {
    const out = {};
    for (const { id, file } of files) {
      let st = null;
      try { st = fs.statSync(file); } catch (e) { out[id] = e.code === 'ENOENT' ? { state: 'missing' } : { state: 'unreadable', why: e.code || 'stat' }; continue; }
      if (st.size < BIG) { out[id] = { state: 'small' }; continue; }
      try {
        const chat = loadBig(file);
        out[id] = { state: 'big', size: st.size, n: chat.messages.length, head: headOf(chat), paths: P.collectPaths(chat) };
      } catch (e) { out[id] = e.code === 'ENOENT' ? { state: 'missing' } : { state: 'unreadable', why: e.code || e.message }; }
    }
    return out;
  },
  // the window's prepared body, its big chats read and prepared here (projbundle-core prepare: the same steps, in order)
  exportA({ job, body, chats = {} }) {
    const b = P.copy(body || {});
    let secrets = 0;
    for (const c of b.chats || []) {
      const big = c?.chat?.__bigChat;
      if (!big) continue;
      const file = chats[big.id];
      let chat;
      try { chat = file ? loadBig(file) : null; } catch (e) { chat = null; if (e.code !== 'ENOENT') throw Object.assign(new Error(`The chat “${String(big.title || big.id).slice(0, 60)}” can't be read just now, so nothing was written: try again in a moment`), { code: 'EHELD' }); }
      if (!chat) throw Object.assign(new Error(`The chat “${String(big.title || big.id).slice(0, 60)}” isn't on this computer any more, so nothing was written`), { code: 'EGONE' });
      const x = { ...chat }; // (the kept read stays as it is: only this copy's own fields change)
      x.session = {}; delete x.lastReply; delete x.pending;
      const sc = P.scrub(x);
      c.chat = sc.value; secrets += sc.count;
    }
    const chk = P.checkBody(b);
    if (!chk.ok) throw new Error(chk.problems[0]);
    // (the project's file / capture / render / download items are its own files: not assets)
    const assetSrc = { ...b, files: undefined, project: { ...b.project, items: b.project.items.filter((x) => !P.KIND_ITEMS.includes(x.type)) } };
    const paths = P.collectPaths(assetSrc);
    if (job != null) state.set(String(job), { body: b, secrets });
    return { paths, secrets };
  },
  // the body with tokens (projbundlemain's map / itemRefs) → project.json's bytes, as the main process made them
  exportB({ job, map = [], itemRefs: refs = [] }) {
    const s = state.get(String(job)); state.delete(String(job));
    if (!s) throw new Error('The export was stopped');
    const body = s.body; const m = new Map(map); const itemRefs = new Map(refs);
    const b2 = P.rewrite(body, (x) => (m.has(x) ? m.get(x) : x));
    b2.project.items = b2.project.items.filter((x) => !itemRefs.has(x.id) || itemRefs.get(x.id)).map((x) => (itemRefs.get(x.id) ? { ...x, ref: itemRefs.get(x.id), id: `${x.type}:${itemRefs.get(x.id)}` } : x));
    if (b2.project.cover && !b2.project.items.some((x) => x.id === b2.project.cover)) { const was = body.project.items.find((x) => x.id === b2.project.cover); b2.project.cover = was && itemRefs.get(was.id) ? `${was.type}:${itemRefs.get(was.id)}` : null; }
    b2.files = (b2.files || []).filter((f) => itemRefs.get(f.id)).map((f) => ({ id: `${f.type}:${itemRefs.get(f.id)}`, type: f.type, name: f.name || '', dir: Boolean(f.dir), path: itemRefs.get(f.id) }));
    // (JSON.stringify of a JSON round trip is JSON.stringify itself: the old way's extra copy changed nothing)
    const data = Buffer.from(JSON.stringify(b2));
    const counts = P.summarize(b2);
    const crc = crc32(data);
    const comp = zlib.deflateRawSync(data, { level: 6 });
    const method = comp.length < data.length ? 8 : 0;
    const src = method === 8 ? comp : data;
    const bytes = new Uint8Array(new ArrayBuffer(src.length)); bytes.set(src); // (its own memory: handed over whole)
    return { counts, crc, size: data.length, method, bytes, __transfer: [bytes.buffer] };
  },
  // an import's project.json: read (its local header, its bytes), inflated with a cap, CRC-checked, parsed, checked
  peekBody({ job, file, entry: e, entries = [] }) {
    let b;
    try {
      if (e.size > P.LIMITS.body) throw new Error(`"${e.name}" is too big`);
      const fd = fs.openSync(file, 'r');
      let raw;
      try {
        const lh = Buffer.alloc(30);
        if (fs.readSync(fd, lh, 0, 30, e.offset) < 30 || lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`"${e.name}" is damaged (no header)`);
        const start = e.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
        raw = Buffer.alloc(e.csize); let got = 0;
        while (got < e.csize) { const n = fs.readSync(fd, raw, got, e.csize - got, start + got); if (!n) break; got += n; }
        if (got !== e.csize) throw new Error(`"${e.name}" is cut short`);
      } finally { fs.closeSync(fd); }
      const data = e.method === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, e.size) }) : raw;
      if (data.length !== e.size || crc32(data) !== (e.crc >>> 0)) throw new Error(`"${e.name}" is damaged (its check doesn't match)`);
      b = JSON.parse(data.toString('utf8'));
    } catch (err) { return { ok: false, problems: [`Its project.json can't be read (${err.message})`] }; }
    const bc = P.checkBody(b);
    if (!bc.ok) return { ok: false, problems: bc.problems };
    // what the JSON points at must be in the file (anything else is left out and named)
    const names = new Set(entries.filter((x) => !x.dir).map((x) => x.name));
    const dirs = new Set(); for (const nm of names) { const s = nm.split('/'); for (let i = 3; i < s.length; i += 1) dirs.add(s.slice(0, i).join('/')); }
    const dangling = new Set();
    b = P.rewrite(b, (s) => { const x = P.entryOfToken(s); if (x == null) return s; if (!P.entryOk(x) && !dirs.has(x)) { dangling.add(x); return ''; } if (!names.has(x) && !dirs.has(x)) { dangling.add(x); return ''; } return s; });
    const counts = P.summarize(b);
    if (job != null) state.set(String(job), { body: b });
    return { ok: true, counts, dangling: [...dangling] };
  },
  // the kept body with this computer's paths; big chats' messages into part files (the window adds them by name)
  finishImport({ job, dir, bad = [], partsDir }) {
    const s = state.get(String(job)); state.delete(String(job));
    if (!s) throw new Error('The import was stopped');
    const badSet = new Set(bad);
    const local = (entry) => path.join(dir, ...entry.split('/'));
    const body = P.rewrite(s.body, (x) => { const e = P.entryOfToken(x); if (e == null) return x; if (badSet.has(e)) return ''; return local(e); });
    const parts = [];
    for (const c of body.chats || []) {
      const ms = c?.chat?.messages;
      if (!Array.isArray(ms) || !partsDir) continue;
      const text = JSON.stringify(ms);
      if (text.length < BIG) continue;
      fs.mkdirSync(partsDir, { recursive: true });
      const key = `${parts.length}.json`;
      fs.writeFileSync(path.join(partsDir, key), text);
      const head = headOf(c.chat);
      head.__bigPart = { key, n: ms.length };
      c.chat = head; parts.push(key);
    }
    return { body, parts };
  },
  forget({ job }) { state.delete(String(job)); return true; },
};

// as a thread: one message at a time, big bytes handed over (res.__transfer)
const wt = require('worker_threads');
if (!wt.isMainThread && wt.workerData?.projbundleWork) {
  wt.parentPort.on('message', (msg) => {
    let res; let err = null; let code = null;
    try { res = OPS[msg.op](msg.args || {}); } catch (e) { err = e.message || String(e); code = e.code || null; }
    const tr = res && typeof res === 'object' && Array.isArray(res.__transfer) ? res.__transfer : null;
    if (tr) delete res.__transfer;
    wt.parentPort.postMessage({ id: msg.id, res, err, code }, tr || undefined);
  });
}

module.exports = { OPS, BIG, headOf };
