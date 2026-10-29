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
function scanInit(o = {}) { return { array: Boolean(o.array), root: null, p: 0, d: 0, expectKey: false, key: null, pending: null, inMsgs: false, arrS: -1, arrE: -1, elS: -1, els: [], done: false, bad: false, end: -1 }; }
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
      if (d === 0) {
        if (c === 0x5b && st.array) { st.root = 'array'; st.arrS = p; st.inMsgs = true; d = 2; } // (a store that is one list: the Lab's scenes)
        else if (c !== 0x7b) { st.bad = true; break; } else { d = 1; st.expectKey = true; }
      } else if (d === 1) {
        if (st.pending === 'messages' && c === 0x5b) { if (st.arrS >= 0) { st.bad = true; break; } st.arrS = p; st.inMsgs = true; if (st.stop) { st.pending = null; d = 2; p += 1; break; } }
        st.pending = null; d = 2;
      } else { if (d === 2 && st.inMsgs && st.elS < 0) st.elS = p; d += 1; }
    } else if (c === 0x7d || c === 0x5d) { // } ]
      if (d === 2 && st.inMsgs) {
        if (c !== 0x5d) { st.bad = true; break; }
        if (st.elS >= 0) endPrim(st, buf, p);
        st.arrE = p + 1; st.inMsgs = false; d = 1;
        if (st.root === 'array') { st.done = true; st.end = p + 1; d = 0; p += 1; break; }
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
  const fast = fastCut(buf);
  if (fast) return fast;
  const st = scanStep(scanInit(), buf, buf.length);
  if (!st.done || st.arrS < 0 || st.arrE < 0) st.bad = true;
  return st;
}
// A chat laid out as JSON.stringify(chat, null, 2) lays it out: each message is "{" … "\n    }" (its own fields one
// level deeper, so "\n    }" can only be its end: strings hold no raw newline), so one native search finds where it
// ends instead of walking its bytes. The part before and after the messages is cut as usual. null: not laid out so
// (the full cut then). Same result as the full cut (dev/bigchat82-test.js).
const NL4 = Buffer.from('\n    }'); const OPEN4 = Buffer.from('\n    {'); const CLOSE2 = Buffer.from('\n  ]');
function fastCut(buf) {
  const st = scanInit(); st.stop = true; // (stops right inside the messages' [)
  for (let avail = Math.min(buf.length, 65536); ; avail = Math.min(buf.length, avail * 4)) {
    scanStep(st, buf, avail);
    if (st.bad || st.inMsgs || st.done || avail >= buf.length) break;
  }
  if (st.bad || !st.inMsgs || st.els.length) return null;
  let p = st.arrS + 1;
  if (buf[p] === 0x5d) st.arrE = p + 1;
  else {
    for (;;) {
      if (p + 6 > buf.length || buf.compare(OPEN4, 0, 6, p, p + 6) !== 0) return null;
      const s = p + 5;
      let e;
      if (buf[s + 1] === 0x7d) e = s + 2; else { const q = buf.indexOf(NL4, s); if (q < 0) return null; e = q + 6; }
      st.els.push(s, e);
      if (buf[e] === 0x2c) { p = e + 1; continue; }
      if (e + 4 > buf.length || buf.compare(CLOSE2, 0, 4, e, e + 4) !== 0) return null;
      st.arrE = e + 4; break;
    }
  }
  st.inMsgs = false; st.elS = -1; st.d = 1; st.p = st.arrE; st.stop = false;
  scanStep(st, buf, buf.length);
  if (!st.done || st.bad) return null;
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
// o.array: the file may be one list (the Lab's scenes): its items are handed over the same way (r.head stays null)
function reader(fs, file, o = {}) {
  const chunk = o.chunk || 4 * 1024 * 1024;
  let st = null; let buf = null; let got = 0; let size = 0; let sig = null; let k = 0; let reads = 0;
  const r = { state: 'more', head: null, count: () => k, sig: () => sig, bytes: () => size, st: () => st };
  r.step = (over = () => false) => {
    if (r.state !== 'more') return r.state;
    let s0;
    try { s0 = fs.statSync(file); } catch { r.state = 'changed'; return r.state; }
    if (!buf) { size = s0.size; sig = `${s0.size}:${s0.mtimeMs}`; buf = Buffer.allocUnsafe(size); st = scanInit(o); } else if (`${s0.size}:${s0.mtimeMs}` !== sig) { buf = null; r.state = 'changed'; return r.state; }
    let fd = null;
    try {
      for (;;) {
        if (k < elCount(st)) {
          const s = st.els[k * 2]; const e = st.els[k * 2 + 1];
          let m; try { m = JSON.parse(buf.toString('utf8', s, e)); } catch { r.state = 'bad'; break; }
          o.onMessage?.(m, k, s, e); k += 1;
        } else if (st.done) {
          if (st.root !== 'array') { try { r.head = headOf(buf, st); } catch { r.state = 'bad'; break; } }
          r.state = 'done'; break;
        } else if (st.bad || got >= size) { r.state = 'bad'; break; } else {
          if (fd === null) fd = fs.openSync(file, 'r');
          // (the first reads small: a thread's code that hasn't run yet is slow, and grows fast once warm)
          const n = fs.readSync(fd, buf, got, Math.min(chunk, 16384 * 2 ** Math.min(reads++, 12), size - got), got);
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
// only for a lone surrogate. \/ and \u for anything else mean "not written by JSON.stringify". bs: { at } the next
// backslash at or after the strings looked at so far (one search for many strings: a stretch without any isn't
// searched again for each string in it)
function escOk(buf, s, e, bs) {
  let i = bs.at;
  if (i !== -1 && i < s) i = buf.indexOf(BS, s);
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
  bs.at = i;
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
const cloudyAt = (buf, p) => buf[p + 1] === 0x68 && buf[p + 7] === 0x2d && buf.toString('latin1', p + 1, p + 8) === 'hearth-';
const isNum = (x) => (x >= 0x30 && x <= 0x39) || x === 0x2e || x === 0x65 || x === 0x45 || x === 0x2b || x === 0x2d;
// the value's bytes [s, e) without whitespace, into out at w → the new w, or -1 (not as JSON.stringify writes it).
// Bytes are copied in runs (between whitespace), not string by string. bs: escOk's shared search (one per buffer)
function compactInto(buf, s, e, out, w, flags, bs = { at: -2 }) {
  let p = s; let run = s;
  while (p < e) {
    const c = buf[p];
    if (c === Q) {
      const q = strEnd(buf, p, e);
      if (q < 0 || !escOk(buf, p + 1, q, bs)) return -1;
      if (flags) { if (!flags.pathy && pathyAt(buf, p)) flags.pathy = true; if (!flags.cloud && c === Q && cloudyAt(buf, p)) flags.cloud = true; }
      p = q + 1; continue;
    }
    if (c <= 0x20) {
      if (p > run) w += buf.copy(out, w, run, p);
      p += 1; while (p < e && buf[p] <= 0x20) p += 1;
      run = p; continue;
    }
    if (c === 0x2d || (c >= 0x30 && c <= 0x39)) {
      let q = p + 1; while (q < e && isNum(buf[q])) q += 1;
      if (!numOk(buf, p, q)) return -1;
      p = q; continue;
    }
    p += 1;
  }
  if (e > run) w += buf.copy(out, w, run, e);
  return w;
}
const SP = ' '.repeat(256);
const indent = (n) => (n <= 128 ? SP.slice(0, n * 2) : '  '.repeat(n));
const SPB = Buffer.from(`\n${' '.repeat(512)}`);
// compact (canonical) bytes → JSON.stringify(value, null, 2) as it sits at depth `level` (its first line not
// indented), into out at w (null: only the size) → the new w
function prettyInto(buf, s, e, level, out, w) {
  let d = level; let p = s; let from = s;
  const flush = (to) => { if (to > from) { if (out) buf.copy(out, w, from, to); w += to - from; } };
  const nl = () => { const n = 1 + d * 2; if (out) { if (n <= SPB.length) SPB.copy(out, w, 0, n); else { out[w] = 0x0a; out.fill(0x20, w + 1, w + n); } } w += n; };
  while (p < e) {
    const c = buf[p];
    if (c === Q) { const q = strEnd(buf, p, e); if (q < 0) throw new Error('cut string'); p = q + 1; continue; }
    if (c === 0x7b || c === 0x5b) {
      if (buf[p + 1] === (c === 0x7b ? 0x7d : 0x5d)) { p += 2; continue; } // {} [] stay as they are
      flush(p + 1); d += 1; nl(); p += 1; from = p; continue;
    }
    if (c === 0x7d || c === 0x5d) { flush(p); d -= 1; nl(); from = p; p += 1; continue; }
    if (c === 0x2c) { flush(p + 1); nl(); p += 1; from = p; continue; }
    if (c === 0x3a) { flush(p + 1); if (out) out[w] = 0x20; w += 1; p += 1; from = p; continue; }
    p += 1;
  }
  flush(e);
  return w;
}
function prettyOf(buf, s, e, level = 0) {
  const out = Buffer.allocUnsafe(prettyInto(buf, s, e, level, null, 0));
  prettyInto(buf, s, e, level, out, 0);
  return out.toString('utf8');
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

// ---------- sync (round 82): a giant chat's cloud form, a pull and a merge, by its messages' bytes ----------
// sync-merge.js's whole-file way: JSON.parse the 60 MB file, toCloud / fromCloud every string, JSON.stringify, hash —
// 1–9 s of a thread per pass for one chat (and for the push, on the main process). Here a message whose bytes are
// already as JSON.stringify writes them and hold no string sync would rewrite (a path for toCloud, "hearth-…" for
// fromCloud) is COPIED (compact) or re-laid out (pretty) as bytes; the others (few: pictures attached, things made) are
// parsed and converted one by one. Same bytes, same hashes as the whole-file way (dev/bigchat82-sync.js).
const FLAG_PATHY = 1; const FLAG_CLOUDY = 2;
const sha1 = () => require('crypto').createHash('sha1');
// a growable output buffer
function sink(cap) {
  const o = { b: Buffer.allocUnsafe(Math.max(1024, cap)), w: 0 };
  o.room = (n) => { if (o.w + n > o.b.length) { const nb = Buffer.allocUnsafe(Math.max(o.b.length * 2, o.w + n + 1024)); o.b.copy(nb, 0, 0, o.w); o.b = nb; } };
  o.put = (x) => { const b = typeof x === 'string' ? Buffer.from(x, 'utf8') : x; o.room(b.length); b.copy(o.b, o.w); o.w += b.length; };
  return o;
}
// flags of a piece of compact JSON (pathy / cloudy strings in it)
function flagsOf(b) { const f = {}; compactInto(b, 0, b.length, Buffer.allocUnsafe(b.length), 0, f); return (f.pathy ? FLAG_PATHY : 0) | (f.cloud ? FLAG_CLOUDY : 0); }
// A chat file's bytes → its cloud form (sync-engine's canon(toCloud(JSON.parse(file)))) as bytes, with where each message
// sits in it. ctx null: a cloud copy (only made canonical). → { text, h, offs [s, e…], flags (per message), head } | null
function cloudForm(buf, ctx, S) {
  const st = scanBuf(buf);
  if (st.bad) return null;
  let head; try { head = headOf(buf, st); } catch { return null; }
  if (ctx) head = S.toCloud(head, ctx);
  const [pre, post] = shell(head, false);
  const n = elCount(st); const offs = new Array(n * 2); const flags = new Uint8Array(n); const bs = { at: -2 };
  const o = sink(buf.length + 4096);
  o.put(pre); o.put('[');
  for (let k = 0; k < n; k++) {
    if (k) { o.room(1); o.b[o.w++] = 0x2c; }
    const s = st.els[k * 2]; const e = st.els[k * 2 + 1];
    o.room(e - s);
    const f = {}; const w0 = o.w;
    const w = compactInto(buf, s, e, o.b, w0, f, bs);
    if (w < 0 || (ctx && f.pathy)) {
      let m; try { m = JSON.parse(buf.toString('utf8', s, e)); } catch { return null; }
      if (ctx) m = S.toCloud(m, ctx);
      const piece = Buffer.from(JSON.stringify(m) ?? 'null', 'utf8');
      o.w = w0; o.put(piece);
      flags[k] = flagsOf(piece);
    } else { o.w = w; flags[k] = (f.pathy ? FLAG_PATHY : 0) | (f.cloud ? FLAG_CLOUDY : 0); }
    offs[k * 2] = w0; offs[k * 2 + 1] = o.w;
  }
  o.put(']'); o.put(post);
  const text = o.b.subarray(0, o.w);
  return { text, h: sha1().update(text).digest('hex'), offs, flags, head, n };
}
// what a pull writes here: the cloud copy in this computer's form (pretty unless the file here was compact), and the
// hash of THAT in cloud form (lh, as syncPull computes it). cf: cloudForm(cloud bytes, null). As syncPull, the copy
// goes through toCloud first (a path the other computer left as it was may be one of this computer's), then fromCloud
function localFromCloud(cf, ctx, S, pretty) {
  const headL = S.fromCloud(S.toCloud(cf.head, ctx), ctx);
  const [pre, post] = shell(headL, pretty);
  const o = sink(Math.round(cf.text.length * (pretty ? 1.25 : 1)) + 4096);
  const L = pretty ? LIST.pretty : LIST.compact;
  // the local copy in cloud form again: the cloud text itself unless a converted part comes back different (then hashed)
  const headBack = S.toCloud(headL, ctx);
  const diff = new Map(); // message → its own cloud form when it differs from the copy's
  const headSame = JSON.stringify(headBack) === JSON.stringify(cf.head);
  o.put(pre); o.put(cf.n ? L.open : '[]');
  for (let k = 0; k < cf.n; k++) {
    if (k) o.put(L.sep);
    const s = cf.offs[k * 2]; const e = cf.offs[k * 2 + 1]; const fl = cf.flags[k];
    if (fl & (FLAG_CLOUDY | FLAG_PATHY)) {
      const m = S.fromCloud(S.toCloud(JSON.parse(cf.text.toString('utf8', s, e)), ctx), ctx);
      o.put(pretty ? prettyMsg(m) : (JSON.stringify(m) ?? 'null'));
      const bk = Buffer.from(JSON.stringify(S.toCloud(m, ctx)) ?? 'null', 'utf8');
      if (!bk.equals(cf.text.subarray(s, e))) diff.set(k, bk);
    } else {
      if (pretty) { const size = prettyInto(cf.text, s, e, 2, null, 0); o.room(size); o.w = prettyInto(cf.text, s, e, 2, o.b, o.w); } else o.put(cf.text.subarray(s, e));
    }
  }
  if (cf.n) o.put(L.close);
  o.put(post);
  if (headSame && !diff.size) return { out: o.b.subarray(0, o.w), lh: cf.h };
  const back = sha1(); const [cpre, cpost] = shell(headBack, false);
  back.update(cpre); back.update(cf.n ? '[' : '[]');
  for (let k = 0; k < cf.n; k++) { if (k) back.update(','); back.update(diff.get(k) || cf.text.subarray(cf.offs[k * 2], cf.offs[k * 2 + 1])); }
  if (cf.n) back.update(']');
  back.update(cpost);
  return { out: o.b.subarray(0, o.w), lh: back.digest('hex') };
}
// Both computers changed a giant chat: sync-merge.js merge3 on the chat with each message that is the SAME (bytes) in
// the base, here and there stood in for by a tiny stand-in holding only what the merge looks at (id, role, at: how it
// keys and orders messages; a stand-in shared by the three sides compares equal at once). Every other message is parsed.
// The result is laid out again from bytes: stand-ins → their bytes, the rest stringified. → as storework's syncMerge
// returns, or null (no base, not chats: the whole-file merge then). localBuf: this computer's file (its form).
function mergeChat({ baseBuf, localBuf, cloudBuf, ctx, S, lh, ch, counters, keepAll, forms = {} }) {
  if (!baseBuf) return null;
  const O = forms.O || cloudForm(localBuf, ctx, S); const T = forms.T || cloudForm(cloudBuf, null, S); const B = forms.B || cloudForm(baseBuf, null, S); // (forms: made earlier this pass)
  if (!O || !T || !B) return null;
  if (O.h !== lh || T.h !== ch) return { stale: true };
  // (theirs goes through toCloud too, as in syncMerge: only its messages with a path-like string can change)
  const local = scanBuf(localBuf);
  const prettyHere = localBuf.length < 2 || /^[[{]\s/.test(localBuf.toString('latin1', 0, 2));
  const localPretty = prettyHere && !local.bad && elCount(local) === O.n && prettyLayout(localBuf, local);
  const proxyOf = new Map(); // stand-in → its index in O (and B, T)
  const piece = (X, k) => X.text.subarray(X.offs[k * 2], X.offs[k * 2 + 1]);
  const parsed = (X, k) => JSON.parse(X.text.toString('utf8', X.offs[k * 2], X.offs[k * 2 + 1]));
  const bm = new Array(B.n); const om = new Array(O.n); const tm = new Array(T.n);
  for (let k = 0; k < B.n; k++) {
    const pb = piece(B, k);
    if (k < O.n && k < T.n && pb[0] === 0x7b && !(T.flags[k] & FLAG_PATHY) && pb.equals(piece(O, k)) && pb.equals(piece(T, k))) {
      const f = topFields(B.text, B.offs[k * 2], B.offs[k * 2 + 1]);
      const x = {}; if ('id' in f) x.id = f.id; if ('role' in f) x.role = f.role; if ('at' in f) x.at = f.at;
      proxyOf.set(x, k); bm[k] = om[k] = tm[k] = x;
    } else bm[k] = parsed(B, k);
  }
  for (let k = 0; k < O.n; k++) if (!om[k]) om[k] = parsed(O, k);
  for (let k = 0; k < T.n; k++) if (!tm[k]) tm[k] = T.flags[k] & FLAG_PATHY ? S.toCloud(parsed(T, k), ctx) : parsed(T, k);
  const r = S.merge3({ ...B.head, messages: bm }, { ...O.head, messages: om }, { ...S.toCloud(T.head, ctx), messages: tm }, { counters, keepAll });
  const v = r.value;
  if (!v || typeof v !== 'object' || !Array.isArray(v.messages)) return null;
  const msgs = v.messages;
  // the cloud text
  const [cpre, cpost] = shell({ ...v, messages: [] }, false);
  const o = sink(Math.max(O.text.length, T.text.length) + 4096);
  o.put(cpre); o.put('[');
  msgs.forEach((x, i) => { if (i) o.put(','); const k = proxyOf.get(x); o.put(k !== undefined ? piece(O, k) : Buffer.from(JSON.stringify(x) ?? 'null', 'utf8')); });
  o.put(']'); o.put(cpost);
  const text = o.b.subarray(0, o.w);
  const hm = sha1().update(text).digest('hex');
  let localOut = null;
  if (hm !== lh) {
    const headL = S.fromCloud({ ...v, messages: [] }, ctx);
    const [pre, post] = shell(headL, prettyHere);
    const L = prettyHere ? LIST.pretty : LIST.compact;
    const lo = sink(localBuf.length + 4096);
    lo.put(pre); lo.put(msgs.length ? L.open : '[]');
    msgs.forEach((x, i) => {
      if (i) lo.put(L.sep);
      const k = proxyOf.get(x);
      if (k !== undefined && !(O.flags[k] & (FLAG_PATHY | FLAG_CLOUDY)) && (localPretty || !prettyHere)) lo.put(localPretty ? localBuf.subarray(local.els[k * 2], local.els[k * 2 + 1]) : piece(O, k));
      else { const m = S.fromCloud(k !== undefined ? parsed(O, k) : x, ctx); lo.put(prettyHere ? prettyMsg(m) : (JSON.stringify(m) ?? 'null')); }
    });
    if (msgs.length) lo.put(L.close);
    lo.put(post);
    localOut = lo.b.subarray(0, lo.w);
  }
  return { text, hm, localOut, conflicts: r.conflicts, theirsText: r.conflicts.length ? T.text.toString('utf8') : null, oursText: null, fast: true };
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

module.exports = { BIG, cloudForm, localFromCloud, mergeChat, prettyInto, deltaWrite, sumOf, fastCut, scanInit, scanStep, scanBuf, headOf, elCount, reader, compactInto, prettyOf, topFields, prettyMsg, shell, listParts, prettyLayout, strEnd, LIST };
