// Giant chats (round 82, bigchat82): the pure, byte-level part. A chat file of 5,000+ messages is 50 MB+ (tool output,
// attachments' details, thinking): JSON.parse of it holds a thread ≈ 0.3–0.6 s, JSON.stringify ≈ 0.2 s, and every path
// that read a chat "in one go" did both. Here a chat file is read as BYTES and cut into its messages without parsing
// it: JSON's structure characters are all ASCII and never appear inside a UTF-8 multi-byte character, strings are
// skipped with Buffer.indexOf('"') (native), so finding where each message starts and ends costs a few ms per 10 MB.
// Each message is then parsed (or copied, or hashed) on its own, as it is needed, in slices.
//   BIG                       files at least this big take these paths (smaller chats: as before, whole)
//   scanInit() / scanStep(st, buf, avail)   the resumable cut: st.els = [start, end, …] of each message (bytes),
//                             st.arrS / st.arrE the messages list's [ and ], st.done / st.bad
//   scanBuf(buf)              the same over a whole buffer
//   headOf(buf, st)           the chat without its messages (messages: [] in its place): id, title, session, compact…
//   reader(fs, file, o)       a chat file read and parsed message by message, in steps (projfind / recall / versions)
//   compactInto(buf, s, e, out, w, flags)   one value's bytes as JSON.stringify(JSON.parse(·)) would write them (no
//                             whitespace), or -1 when they aren't written that way (a number like 1.0, an escape like \/):
//                             the caller parses that one then. flags.pathy: a string that may be a path (sync's toCloud
//                             could change it); flags.cloud: a "hearth-…" string (fromCloud could)
//   prettyOf(buf, s, e, level)  compact bytes as JSON.stringify(·, null, 2) writes them at that depth
//   topFields(buf, s, e)      an object's own id / role / at (what sync's merge keys a message by), without parsing it
//   prettyMsg(m) / shell(head, pretty)   a message as it sits in a pretty chat file; the chat around its messages
// Pure (fs is handed in): dev/bigchat82-test.js checks every output byte for byte against JSON.parse / JSON.stringify.
'use strict';
const nodeBuffer = require('buffer'); const { Buffer } = nodeBuffer; // (Node only: the store thread, its files / sync copies and Node tests; never the window)
const BIG = Number(process.env.HEARTH_BIGCHAT_MIN) || 8 * 1024 * 1024;
const Q = 0x22; const BS = 0x5c;

// ---------- the cut ----------
// depth 0: outside the chat · 1: the chat object · 2: inside its "messages" list (st.inMsgs) or another top value
function scanInit() { return { p: 0, d: 0, expectKey: false, key: null, pending: null, inMsgs: false, arrS: -1, arrE: -1, elS: -1, els: [], done: false, bad: false, end: -1 }; }
// the closing quote of the string opening at p (an escaped quote has an odd number of backslashes before it), or -1
// when it isn't within the bytes read so far
function strEnd(buf, p, avail) {
  let q = buf.indexOf(Q, p + 1);
  while (q >= 0 && q < avail) {
    let b = 0; let k = q - 1;
    while (buf[k] === BS) { b += 1; k -= 1; }
    if (!(b & 1)) return q;
    q = buf.indexOf(Q, q + 1);
  }
  return -1;
}
function endPrim(st, buf, p) { let e = p; while (e > st.elS && buf[e - 1] <= 0x20) e -= 1; st.els.push(st.elS, e); st.elS = -1; }
function scanStep(st, buf, avail) {
  if (st.done || st.bad) return st;
  let p = st.p; let d = st.d;
  if (p === 0 && avail >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) p = 3; // a BOM (parseJson strips it too)
  while (p < avail) {
    const c = buf[p];
    if (c === Q) {
      const q = strEnd(buf, p, avail);
      if (q < 0) break; // the rest of this string isn't read yet
      if (d === 1) {
        if (st.expectKey) { st.key = buf.toString('utf8', p + 1, q); st.expectKey = false; } else st.pending = null;
      } else if (d === 2 && st.inMsgs && st.elS < 0) st.elS = p;
      p = q + 1; continue;
    }
    if (c === 0x7b || c === 0x5b) { // { [
      if (d === 0) { if (c !== 0x7b) { st.bad = true; break; } d = 1; st.expectKey = true; } else if (d === 1) {
        if (st.pending === 'messages' && c === 0x5b) { if (st.arrS >= 0) { st.bad = true; break; } st.arrS = p; st.inMsgs = true; }
        st.pending = null; d = 2;
      } else { if (d === 2 && st.inMsgs && st.elS < 0) st.elS = p; d += 1; }
    } else if (c === 0x7d || c === 0x5d) { // } ]
      if (d === 2 && st.inMsgs) {
        if (c !== 0x5d) { st.bad = true; break; }
        if (st.elS >= 0) endPrim(st, buf, p);
        st.arrE = p + 1; st.inMsgs = false; d = 1;
      } else {
        d -= 1;
        if (d < 0) { st.bad = true; break; }
        if (d === 2 && st.inMsgs && st.elS >= 0) { st.els.push(st.elS, p + 1); st.elS = -1; }
        if (d === 0) { st.done = true; st.end = p + 1; p += 1; break; }
      }
    } else if (c === 0x2c) { // ,
      if (d === 1) st.expectKey = true;
      else if (d === 2 && st.inMsgs && st.elS >= 0) endPrim(st, buf, p);
    } else if (c === 0x3a) { // :
      if (d === 1) st.pending = st.key;
    } else if (c > 0x20) { // a number, true, false, null
      if (d === 2 && st.inMsgs && st.elS < 0) st.elS = p;
      else if (d === 1) st.pending = null;
      else if (d === 0) { st.bad = true; break; }
    }
    p += 1;
  }
  st.p = p; st.d = d;
  return st;
}
function scanBuf(buf) {
  const st = scanStep(scanInit(), buf, buf.length);
  if (!st.done || st.arrS < 0 || st.arrE < 0) st.bad = true;
  return st;
}
// the chat without its messages: the bytes before its [ and from its ], parsed (messages: [] where it was)
function headOf(buf, st) {
  return JSON.parse(Buffer.concat([buf.subarray(0, st.arrS + 1), buf.subarray(st.arrE - 1, st.end)]).toString('utf8').replace(/^﻿/, ''));
}
const elCount = (st) => st.els.length / 2;

// ---------- reading a big chat in steps ----------
// r.step(over) reads, cuts and parses messages until over() says the slice is spent; → 'more' | 'done' | 'changed'
// (the file changed under it: start again) | 'bad' (not a chat this can cut: read it whole instead). Each parsed
// message is handed to o.onMessage(m, k, start, end). r.head once done. Nothing stays open between steps.
function reader(fs, file, o = {}) {
  const chunk = o.chunk || 4 * 1024 * 1024;
  let st = null; let buf = null; let got = 0; let size = 0; let sig = null; let k = 0;
  const r = { state: 'more', head: null, count: () => k, sig: () => sig, bytes: () => size, st: () => st };
  r.step = (over = () => false) => {
    if (r.state !== 'more') return r.state;
    let s0;
    try { s0 = fs.statSync(file); } catch { r.state = 'changed'; return r.state; }
    if (!buf) { size = s0.size; sig = `${s0.size}:${s0.mtimeMs}`; buf = Buffer.allocUnsafe(size); st = scanInit(); } else if (`${s0.size}:${s0.mtimeMs}` !== sig) { buf = null; r.state = 'changed'; return r.state; }
    let fd = null;
    try {
      for (;;) {
        if (k < elCount(st)) {
          const s = st.els[k * 2]; const e = st.els[k * 2 + 1];
          let m; try { m = JSON.parse(buf.toString('utf8', s, e)); } catch { r.state = 'bad'; break; }
          o.onMessage?.(m, k, s, e); k += 1;
        } else if (st.done) {
          try { r.head = headOf(buf, st); } catch { r.state = 'bad'; break; }
          r.state = 'done'; break;
        } else if (st.bad || got >= size) { r.state = 'bad'; break; } else {
          if (fd === null) fd = fs.openSync(file, 'r');
          const n = fs.readSync(fd, buf, got, Math.min(chunk, size - got), got);
          if (!n) { r.state = 'changed'; break; }
          got += n;
          scanStep(st, buf, got);
          if (st.done && (st.arrS < 0 || st.arrE < 0)) st.bad = true;
        }
        if (over()) break;
      }
    } finally { if (fd !== null) fs.closeSync(fd); }
    if (r.state !== 'more') buf = null; // (done: the bytes are let go; the caller keeps what it took from them)
    return r.state;
  };
  return r;
}

// ---------- compact / pretty, byte for byte as JSON.stringify writes ----------
// A number token is as JSON.stringify writes it when writing back what it parses to gives the same characters
const numOk = (buf, s, e) => { const t = buf.toString('latin1', s, e); const n = Number(t); return Number.isFinite(n) && JSON.stringify(n) === t; };
// a string's escapes as JSON.stringify writes them: \" \\ \b \f \n \r \t, \u00XX only below 0x20, \uD8xx–\uDFxx
// only for a lone surrogate (taken as fine here: rare, and a pair would be written raw — a mismatch shows as a hash
// difference, never as damage). \/ and \u for anything else mean "not written by JSON.stringify"
function escOk(buf, s, e) {
  let i = buf.indexOf(BS, s);
  while (i >= 0 && i < e) {
    const c = buf[i + 1];
    if (c === 0x75) { // \uXXXX: lowercase hex, a control character without a short form, or a lone surrogate
      const t = buf.toString('latin1', i + 2, i + 6);
      if (!/^[0-9a-f]{4}$/.test(t)) return false;
      const h = parseInt(t, 16);
      if (!(h < 0x20 && h !== 8 && h !== 9 && h !== 10 && h !== 12 && h !== 13) && !(h >= 0xd800 && h <= 0xdfff)) return false;
      if (h >= 0xd800 && h <= 0xdbff && buf[i + 6] === BS && buf[i + 7] === 0x75) { const l = parseInt(buf.toString('latin1', i + 8, i + 12), 16); if (l >= 0xdc00 && l <= 0xdfff) return false; } // a pair: written as the character itself
      i = buf.indexOf(BS, i + 6);
    } else if (c === Q || c === BS || c === 0x62 || c === 0x66 || c === 0x6e || c === 0x72 || c === 0x74) i = buf.indexOf(BS, i + 2);
    else return false;
  }
  return true;
}
// a string value that sync's toCloud might rewrite: starts like a path (/…, \…, C:…, file:…). Conservative on purpose
function pathyAt(buf, p) {
  const c = buf[p + 1];
  if (c === 0x2f || c === BS) return true;
  if (((c | 0x20) >= 0x61 && (c | 0x20) <= 0x7a) && buf[p + 2] === 0x3a) return true;
  if ((c | 0x20) === 0x66 && (buf[p + 2] | 0x20) === 0x69 && (buf[p + 3] | 0x20) === 0x6c && (buf[p + 4] | 0x20) === 0x65 && buf[p + 5] === 0x3a) return true;
  return false;
}
// "hearth-" at the start of a string: fromCloud might rewrite it
const cloudyAt = (buf, p) => buf[p + 1] === 0x68 && buf.toString('latin1', p + 1, p + 8) === 'hearth-';
// the value's bytes [s, e) without whitespace, into out at w → the new w, or -1 (not as JSON.stringify writes it)
function compactInto(buf, s, e, out, w, flags) {
  let p = s;
  while (p < e) {
    const c = buf[p];
    if (c === Q) {
      const q = strEnd(buf, p, e);
      if (q < 0) return -1;
      if (!escOk(buf, p + 1, q)) return -1;
      if (flags) { if (!flags.pathy && pathyAt(buf, p)) flags.pathy = true; if (!flags.cloud && cloudyAt(buf, p)) flags.cloud = true; }
      w += buf.copy(out, w, p, q + 1); p = q + 1; continue;
    }
    if (c <= 0x20) { p += 1; continue; }
    if (c === 0x2d || (c >= 0x30 && c <= 0x39)) {
      let q = p + 1;
      while (q < e) { const x = buf[q]; if ((x >= 0x30 && x <= 0x39) || x === 0x2e || x === 0x65 || x === 0x45 || x === 0x2b || x === 0x2d) q += 1; else break; }
      if (!numOk(buf, p, q)) return -1;
      w += buf.copy(out, w, p, q); p = q; continue;
    }
    out[w++] = c; p += 1;
  }
  return w;
}
const SP = ' '.repeat(256);
const indent = (n) => (n <= 128 ? SP.slice(0, n * 2) : '  '.repeat(n));
// compact (canonical) bytes → JSON.stringify(value, null, 2) as it sits at depth `level` (its first line not indented)
function prettyOf(buf, s, e, level = 0) {
  const parts = []; let d = level; let p = s; let from = s;
  const flush = (to) => { if (to > from) parts.push(buf.toString('utf8', from, to)); };
  while (p < e) {
    const c = buf[p];
    if (c === Q) { const q = strEnd(buf, p, e); if (q < 0) throw new Error('cut string'); p = q + 1; continue; }
    if (c === 0x7b || c === 0x5b) {
      const close = c === 0x7b ? 0x7d : 0x5d;
      if (buf[p + 1] === close) { p += 2; continue; } // {} [] stay as they are
      flush(p + 1); d += 1; parts.push(`\n${indent(d)}`); p += 1; from = p; continue;
    }
    if (c === 0x7d || c === 0x5d) { flush(p); d -= 1; parts.push(`\n${indent(d)}`); from = p; p += 1; continue; }
    if (c === 0x2c) { flush(p + 1); parts.push(`\n${indent(d)}`); p += 1; from = p; continue; }
    if (c === 0x3a) { flush(p + 1); parts.push(' '); p += 1; from = p; continue; }
    p += 1;
  }
  flush(e);
  return parts.join('');
}
// an object's own id / role / at as parsed values (undefined when it has none), read off its top level only
function topFields(buf, s, e) {
  const out = {};
  if (buf[s] !== 0x7b) return out;
  let p = s + 1; let d = 1; let key = null; let expectKey = true; let want = null;
  while (p < e) {
    const c = buf[p];
    if (c === Q) {
      const q = strEnd(buf, p, e); if (q < 0) break;
      if (d === 1 && expectKey) { key = buf.toString('utf8', p + 1, q); expectKey = false; } else if (d === 1 && want) { out[want] = JSON.parse(buf.toString('utf8', p, q + 1)); want = null; }
      p = q + 1; continue;
    }
    if (c === 0x7b || c === 0x5b) { if (d === 1 && want) { out[want] = c === 0x7b ? {} : []; want = null; } d += 1; } else if (c === 0x7d || c === 0x5d) d -= 1;
    else if (c === 0x2c) { if (d === 1) expectKey = true; } else if (c === 0x3a) { if (d === 1) want = key === 'id' || key === 'role' || key === 'at' ? key : null; } else if (c > 0x20 && d === 1 && want) {
      let q = p; while (q < e && buf[q] !== 0x2c && buf[q] !== 0x7d && buf[q] > 0x20) q += 1;
      out[want] = JSON.parse(buf.toString('latin1', p, q)); want = null; p = q; continue;
    }
    p += 1;
  }
  return out;
}
// a message as JSON.stringify(chat, null, 2) writes it inside the chat's messages (at depth 2)
const prettyMsg = (m) => (JSON.stringify(m, null, 2) ?? 'null').replace(/\n/g, '\n    ');
// the chat around its messages: [before, after] where the messages list goes (pretty or compact as asked)
let nonce = 0;
function shell(head, pretty) {
  const mark = `\u0000bigchat-${process.pid}-${++nonce}-${Math.random().toString(36).slice(2)}\u0000`;
  const t = JSON.stringify({ ...head, messages: mark }, null, pretty ? 2 : undefined);
  const q = JSON.stringify(mark);
  const i = t.indexOf(q);
  return [t.slice(0, i), t.slice(i + q.length)];
}
// the messages list as written: pretty "[\n    a,\n    b\n  ]" or compact "[a,b]"; parts: strings or Buffers
const LIST = { pretty: { open: '[\n    ', sep: ',\n    ', close: '\n  ]' }, compact: { open: '[', sep: ',', close: ']' } };
function listParts(parts, pretty) {
  if (!parts.length) return ['[]'];
  const L = pretty ? LIST.pretty : LIST.compact;
  const out = [L.open];
  parts.forEach((x, i) => { if (i) out.push(L.sep); out.push(x); });
  out.push(L.close);
  return out;
}
// is this file laid out as JSON.stringify(chat, null, 2) lays a chat out (between its messages exactly ",\n    ")?
function prettyLayout(buf, st) {
  const n = elCount(st);
  if (!n) return buf.toString('latin1', st.arrS, st.arrE) === '[]';
  if (buf.toString('latin1', st.arrS, st.els[0]) !== LIST.pretty.open || buf.toString('latin1', st.els[n * 2 - 1], st.arrE) !== LIST.pretty.close) return false;
  for (let i = 1; i < n; i++) if (st.els[i * 2] - st.els[i * 2 - 1] !== 6 || buf.toString('latin1', st.els[i * 2 - 1], st.els[i * 2]) !== LIST.pretty.sep) return false;
  return true;
}

// ---------- a big chat saved by what changed (storework.js op chatDelta) ----------
// What the store thread knows of the file as it last wrote / read it: e = { head (the chat without its messages), els
// (each message's [start, end) in the file), sig }. d (from the window, chatsave.js): { keys (the chat's keys in order),
// set ({ key: value } of the keys that changed), n (messages now), msgs ([[k, message]] of those that changed or are
// new) }. Written to tmp: the chat's own fields from the head, unchanged messages COPIED byte for byte from the file
// (one read + one write per unchanged stretch), changed / new ones written fresh. The result is byte for byte what
// JSON.stringify(chat, null, 2) writes (dev/bigchat82-test.js). → { head, els, bytes }. Throws (nothing renamed: the
// caller removes tmp) when the file isn't the one e describes, or the change doesn't fit it.
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function deltaWrite(fs, file, tmp, e, d, o = {}) {
  if (!Array.isArray(d?.keys) || !d.keys.includes('messages') || !Array.isArray(d.msgs) || !(d.n >= 0)) throw new Error('not a chat change');
  const set = d.set || {};
  const head = {};
  for (const k of d.keys) {
    if (k === 'messages') head[k] = [];
    else if (own(set, k)) head[k] = set[k];
    else if (own(e.head, k)) head[k] = e.head[k];
    else throw new Error(`no value for ${k}`);
  }
  const changed = new Map();
  for (const x of d.msgs) { if (!Array.isArray(x) || !(x[0] >= 0) || x[0] >= d.n) throw new Error('bad message index'); changed.set(x[0], x[1]); }
  const oldN = e.els.length / 2;
  for (let k = oldN; k < d.n; k++) if (!changed.has(k)) throw new Error(`message ${k} missing`);
  const [pre, post] = shell(head, true);
  const old = fs.openSync(file, 'r');
  let fd = null; const els = new Array(d.n * 2); let w = 0;
  const copyBuf = Buffer.allocUnsafe(Math.min(8 * 1024 * 1024, Math.max(65536, e.els.length ? e.els[e.els.length - 1] : 0)));
  try {
    const st = fs.fstatSync(old);
    if (`${st.size}:${st.mtimeMs}` !== e.sig) throw new Error('changed');
    fd = fs.openSync(tmp, 'w');
    const put = (x) => { const b = typeof x === 'string' ? Buffer.from(x, 'utf8') : x; let off = 0; while (off < b.length) off += fs.writeSync(fd, b, off, b.length - off); w += b.length; };
    const copy = (from, to) => { for (let pos = from; pos < to;) { const n = fs.readSync(old, copyBuf, 0, Math.min(copyBuf.length, to - pos), pos); if (!n) throw new Error('changed'); let off = 0; while (off < n) off += fs.writeSync(fd, copyBuf, off, n - off); pos += n; w += n; } };
    put(pre);
    if (!d.n) put('[]');
    else {
      put(LIST.pretty.open);
      for (let k = 0; k < d.n;) {
        if (k) put(LIST.pretty.sep);
        if (!changed.has(k) && k < oldN) { // a stretch of unchanged messages, separators and all
          let j = k; while (j + 1 < d.n && j + 1 < oldN && !changed.has(j + 1)) j += 1;
          const from = e.els[k * 2];
          for (let t = k; t <= j; t++) { els[t * 2] = w + (e.els[t * 2] - from); els[t * 2 + 1] = w + (e.els[t * 2 + 1] - from); }
          copy(from, e.els[j * 2 + 1]);
          k = j + 1;
        } else {
          const b = Buffer.from(prettyMsg(changed.get(k)), 'utf8');
          els[k * 2] = w; put(b); els[k * 2 + 1] = w;
          k += 1;
        }
      }
      put(LIST.pretty.close);
    }
    put(post);
    if (o.fsync !== false) { try { fs.fsyncSync(fd); } catch { /* a disk that can't */ } }
  } finally { fs.closeSync(old); if (fd !== null) fs.closeSync(fd); }
  return { head, els, bytes: w };
}
// the summary the chats list shows, from a head
const sumOf = (h) => ({ id: h.id, agentId: h.agentId, title: h.title, updatedAt: h.updatedAt, pinned: Boolean(h.pinned), model: h.model });

module.exports = { BIG, deltaWrite, sumOf, scanInit, scanStep, scanBuf, headOf, elCount, reader, compactInto, prettyOf, topFields, prettyMsg, shell, listParts, prettyLayout, strEnd, LIST };
