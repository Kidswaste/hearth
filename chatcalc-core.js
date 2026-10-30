// (round 87, chatcalc87) A windowed giant chat's whole-chat numbers, kept per message on the store thread.
// Round 86 (chatwindow86) worked them out on the store thread from the file: autocompact's "continue lighter?" decision,
// sendpreview's history a message re-reads and historylean's lighter history. Each ask parsed the whole file (≈ 0.3 s
// for 60 MB) and made autocompact's words again (≈ 0.3 s): ≈ 0.5–1 s of that thread per reply in a giant chat.
// Now the thread keeps ONE RECORD PER MESSAGE (made once from the message, by its index in the file as this thread
// last wrote or read it: the file's signature): its small fields (role, time, usage, flags), what the three need from
// its content (token counts, lengths, its words as numbers, its long code blocks' keys) and nothing else. A save by
// change (chatDelta) updates the records it changed (new messages at the end, a cut with trunc, an old one reacted
// to); a file changed any other way (sync, a whole save) is read again once. An ask then reads the records, plus the
// few messages whose words really go into the answer (the last exchanges, the lighter history's newest rows), each
// read by its offsets in the file.
// The answers are the SAME as the pure modules' on the whole chat (dev/chatcalc87-test.js: random chats and random
// changes, compared as JSON): the parts that only read small fields run the pure code itself on the records (a record
// THROWS on any field it doesn't hold: then the whole way below answers instead, never a guess), and the parts that
// read every message's text are the pure code's steps with the record's numbers in place of the text.
'use strict';
const AC = require('./autocompact');
const SPC = require('./sendpreview-core');
const HLC = require('./historylean-core');

const tok = HLC.tok;
// ---------- the whole way (round 86's chatCalc, unchanged): the parsed chat ----------
function whole(chat, { what = [], agent = {}, tools = false, upto, now = Date.now() } = {}) {
  const out = { n: chat.messages.length };
  if (what.includes('lighter')) out.lighter = AC.decide(AC.inputOf(chat, agent));
  if (what.includes('preview')) out.preview = { st: SPC.stats(chat), history: SPC.historyOf(chat), lighter: AC.split(chat).older.length ? AC.decide({ ...AC.inputOf(chat, agent), at: 1 }) : null };
  if (what.includes('lean')) {
    const end = upto ?? chat.messages.length;
    const built = HLC.build(chat, { upto: end, chatTools: Boolean(tools) });
    out.lean = { now, built, input: HLC.inputOf(chat, agent, { now, upto: end, chatTools: Boolean(tools), built }) };
  }
  return out;
}

// ---------- records ----------
// a field the record doesn't hold was asked for: the whole way answers instead
class Miss extends Error { constructor(k) { super(`chatcalc: ${String(k)} not in the record`); this.code = 'ECALCMISS'; } }
const CAP = ['role', 'at', 'usage', 'compactReq', 'compactSummary', 'handoffBrief', 'from', 'histLean'];
const KEYSETS = new Map();
const keySet = (keys) => { const id = keys.join('\u0001'); let x = KEYSETS.get(id); if (!x) { if (KEYSETS.size > 2000) KEYSETS.clear(); KEYSETS.set(id, (x = new Set(keys))); } return x; };
// a message as the pure code sees it when it only reads small fields: those are there, a field the message doesn't
// have is undefined (as it is), any other field throws Miss
const LIGHT = {
  get(t, p) { if (typeof p !== 'string') return undefined; if (Object.prototype.hasOwnProperty.call(t.v, p)) return t.v[p]; if (!t.k.has(p)) return p in Object.prototype ? Object.prototype[p] : undefined; throw new Miss(p); },
  has: (t, p) => typeof p === 'string' && (t.k.has(p) || p in Object.prototype),
  set: (t, p) => { throw new Miss(p); }, deleteProperty: (t, p) => { throw new Miss(p); }, defineProperty: (t, p) => { throw new Miss(p); },
  ownKeys: () => { throw new Miss('its keys'); }, getOwnPropertyDescriptor: (t, p) => { throw new Miss(p); },
};
// the words of every kept chat as numbers (autocompact's words: 6-letter stems), shared
function vocab() { const ids = new Map(); return { ids, id: (w) => { let i = ids.get(w); if (i === undefined) ids.set(w, (i = ids.size)); return i; } }; }

// one message → its record: { L (the light message), d (what the three need from its content) }; null: a message the
// pure code itself can't read (not an object…): the whole way for this chat
function recOf(m, V) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return null;
  try {
    const v = Object.create(null); for (const k of CAP) if (Object.prototype.hasOwnProperty.call(m, k)) v[k] = m[k];
    const ac = Boolean(AC.talk(m)); const sp = Boolean(SPC.talk(m)); const hl = Boolean(HLC.talk(m));
    const say = m.role !== 'error' && !m.handoffBrief && (m.ctx || m.text) ? `${SPC.label(m)}: ${m.ctx || m.text}`.length : -1;
    let w = null; if (ac) { const ws = AC.words(m.text); w = new Int32Array(ws.size); let i = 0; for (const x of ws) w[i++] = V.id(x); }
    const blk = []; for (const x of HLC.blocksOf(m, 0)) if (x.long) blk.push(Number(x.id.slice(2)), x.key);
    const d = {
      ac, sp, hl, say, w, blk,
      tt: tok(m.text), tct: tok(m.ctx || m.text), tof: tok(SPC.textOf(m)), pic: SPC.picTok(m), fu: tok(m.sent || m.text),
      tools: Array.isArray(m.tools) ? m.tools.length : 0, pics: (m.attachments || []).filter((a) => a.kind === 'image').length,
    };
    return { L: new Proxy({ v, k: keySet(Object.keys(m)) }, LIGHT), d };
  } catch { return null; }
}
// a message as the file holds it (what JSON keeps: an undefined field gone, NaN → null…)
const asSaved = (m) => (m === undefined ? null : JSON.parse(JSON.stringify(m)));

// ---------- a chat's kept records ----------
// state: { sig, n, head, els (each message's offsets in the file), L, D, bad (messages the pure code can't read),
// V (words), tail (messages read whole lately: k → message, the newest ~400) }
function make(head, els, msgAt, V = vocab()) {
  const n = els.length / 2; const L = new Array(n); const D = new Array(n); let bad = 0;
  for (let k = 0; k < n; k++) { const r = recOf(msgAt(k), V); if (r) { L[k] = r.L; D[k] = r.d; } else bad += 1; }
  return { head: asSaved(head), els, n, L, D, bad, V, tail: new Map() };
}
// a save by change: d { n, msgs: [[k, m]] } (chatDelta's), the new head and offsets
function apply(s, d, head, els) {
  for (const k of s.tail.keys()) if (k >= d.n) s.tail.delete(k);
  s.L.length = d.n; s.D.length = d.n; s.n = d.n; // (a cut: trunc)
  for (const [k, m] of d.msgs) { const r = recOf(asSaved(m), s.V); s.L[k] = r?.L; s.D[k] = r?.d; s.tail.delete(k); }
  let bad = 0; for (let k = 0; k < d.n; k++) if (!s.L[k]) bad += 1;
  s.bad = bad; s.head = asSaved(head); s.els = els;
}

// ---------- the asks, from the records ----------
// o: { what, agent, tools, upto, now, read(k) → message k as in the file }. → chatCalc's answer; throws Miss when a
// record doesn't hold what was asked (the caller then answers the whole way)
function calc(s, o) {
  if (s.bad) throw new Miss('a message that is not an object');
  const { what = [], agent = {}, tools = false, upto, now = Date.now() } = o;
  const n = s.n; const L = s.L; const D = s.D;
  const I = Array.from({ length: n }, (_, k) => k); // (slices of indexes: the same bounds as the pure code's slices)
  const full = (k) => { let m = s.tail.get(k); if (m === undefined) { m = o.read(k); s.tail.set(k, m); if (s.tail.size > 400) s.tail.delete(s.tail.keys().next().value); } return m; };
  const chat = { ...s.head, messages: L };
  const out = { n };
  if (what.includes('lighter')) out.lighter = AC.decide(acInput(s, chat, agent, I, full));
  if (what.includes('preview')) {
    // stats: small fields, and the last reply itself
    const ms = L.slice(); const kl = I.findLast((k) => L[k].role === 'assistant'); if (kl !== undefined) ms[kl] = full(kl);
    const sp = acSplit(s, chat, I);
    out.preview = { st: SPC.stats({ ...chat, messages: ms }), history: history(s, chat, I, full), lighter: sp.older.length ? AC.decide({ ...acInput(s, chat, agent, I, full, sp), at: 1 }) : null };
  }
  if (what.includes('lean')) {
    const end = upto ?? n;
    const built = build(s, chat, { upto: end, chatTools: Boolean(tools) }, I, full);
    // inputOf reads small fields, and in full: the last reply, the session's first reply and first message of yours,
    // the last 6 replies (their tools) and the message being sent
    const ms = L.slice(); const prior = I.slice(0, end);
    const put = (k) => { if (k !== undefined && k >= 0 && k < n) ms[k] = full(k); };
    put(prior.findLast((k) => L[k].role === 'assistant' && L[k].usage));
    const hd = s.head;
    const start = hd?.lean && hd.lean.at < end ? hd.lean.at : hd?.compact ? hd.compact.index : hd?.handoff ? hd.handoff.at : 0;
    put(prior.slice(start).find((k) => L[k].role === 'assistant' && L[k].usage)); put(prior.slice(start).find((k) => L[k].role === 'user'));
    for (const k of prior.filter((x) => L[x].role === 'assistant' && L[x].usage).slice(-6)) put(k);
    if (typeof end === 'number' && Number.isInteger(end)) put(end);
    out.lean = { now, built, input: HLC.inputOf({ ...chat, messages: ms }, agent, { now, upto: end, chatTools: Boolean(tools), built }) };
  }
  return out;
}

// autocompact split(): the older part (indexes) and the kept part (the messages themselves)
function acSplit(s, chat, I) {
  const c = chat.compact;
  const from = c ? (c.tail ?? c.index) : 0;
  const tail = AC.tailStart(s.L, AC.KEEP_EXCHANGES, from);
  return { from, tail, older: I.slice(from, tail).filter((k) => s.D[k].ac), keptK: I.slice(tail).filter((k) => s.D[k].ac) };
}
// autocompact inputOf(), from the records (the same steps; the texts it reads: the kept exchanges, your last message)
function acInput(s, chat, agent, I, full, sp = acSplit(s, chat, I)) {
  const L = s.L; const D = s.D;
  const u = AC.usageOf(chat);
  const kept = sp.keptK.map(full);
  const previous = chat.compact?.summary || '';
  const replies = L.filter((m) => m.role === 'assistant' && m.usage).slice(-4);
  const hitRate = replies.length > 1 ? replies.slice(1).reduce((n, m) => n + (m.usage.cached || 0) / Math.max(1, m.usage.input), 0) / (replies.length - 1) : undefined;
  const start = chat.compact ? chat.compact.index : 0;
  const first = L.slice(start).find((m) => m.role === 'assistant' && m.usage);
  const fu = I.slice(start).find((k) => L[k].role === 'user');
  const carried = chat.compact ? tok(chat.compact.summary) + 60 + I.slice(chat.compact.tail ?? start, start).filter((k) => D[k].ac).reduce((n, k) => n + D[k].tct + 4, 0) : 0;
  const fixed = first ? Math.max(300, (first.usage.contextInput ?? first.usage.input) - (fu === undefined ? 0 : D[fu].fu) - carried) : 1500;
  const lu = I.findLast((k) => L[k].role === 'user');
  const older = sp.older;
  return {
    ctx: u?.contextInput ?? u?.input ?? 0, cached: u?.contextCached ?? u?.cached ?? 0, at: AC.atOf(agent), fixed, older: { length: older.length }, kept, previous, hitRate,
    userCount: L.filter((m) => m.role === 'user' && !m.compactReq).length, lastUser: lu === undefined ? '' : full(lu).text || '',
    olderTok: older.reduce((n, k) => n + D[k].tct + 4, 0),
    // the words of the last exchanges against the older messages' (decide's relevance and topic, the same sums)
    words: (recent) => {
      const V = s.V; const mark = new Uint8Array(V.ids.size); const seen = new Uint8Array(V.ids.size);
      for (const r of recent) { const id = V.ids.get(r); if (id !== undefined) mark[id] = 1; }
      let relTok = 0;
      for (const k of older) { const w = D[k].w; let c = 0; for (let i = 0; i < w.length; i++) { c += mark[w[i]]; seen[w[i]] = 1; } if (c >= Math.min(2, w.length)) relTok += D[k].tct; }
      return { relTok, all: { has: (x) => { const id = V.ids.get(x); return id !== undefined && seen[id] === 1; } } };
    },
  };
}

// sendpreview historyOf(), from the records
function history(s, chat, I, full) {
  const L = s.L; const D = s.D; const ms = L;
  if (!ms.length) return { tokens: 0, cacheable: 0, kind: 'none', session: false };
  const h = chat.handoff; const c = chat.compact;
  const lr = I.findLast((k) => L[k].role === 'assistant' && !L[k].compactSummary);
  if (chat.session?.id) {
    let from = 0; let carried = 0; let kind = 'session';
    if (c && c.index >= (h?.at || 0)) { from = c.index; carried = tok(c.summary) + 60 + I.slice(c.tail ?? c.index, c.index).filter((k) => D[k].sp).reduce((n, k) => n + D[k].tct + 4, 0); kind = 'lighter'; }
    else if (h?.brief) { from = h.at; carried = h.whole ? tok(h.whole) : (h.tokens || tok(h.brief)); kind = h.whole ? 'whole' : 'brief'; }
    const own = I.slice(from).filter((k) => D[k].sp).reduce((n, k) => n + D[k].tof + D[k].pic + 4, 0);
    const tokens = carried + own;
    return { tokens, cacheable: Math.max(0, tokens - (lr !== undefined ? D[lr].tt : 0)), kind, session: true };
  }
  // the earlier conversation's length: its rows ("Who: text") joined by blank lines
  const sayLen = (ks) => { let len = 0; let rows = 0; for (const k of ks) if (D[k].say >= 0) { len += D[k].say; rows += 1; } return rows ? len + 2 * (rows - 1) : 0; };
  const CH = SPC.CONTEXT_CHARS;
  const capped = (len) => Math.min(len, CH) + (len > CH ? 1 : 0);
  if (h?.brief && !(c && c.index >= h.at)) {
    const since = capped(sayLen(I.slice(h.at)));
    return { tokens: (h.whole ? tok(h.whole) + 30 : tok(h.brief)) + Math.ceil(since / 4), cacheable: 0, kind: h.whole ? 'whole' : 'brief', session: false };
  }
  if (c) {
    const after = capped(sayLen(I.slice(c.tail ?? c.index).filter((k) => !L[k].compactSummary && !L[k].compactReq)));
    return { tokens: tok(c.summary) + 40 + Math.ceil(after / 4), cacheable: 0, kind: 'lighter', session: false };
  }
  const len = sayLen(I);
  return { tokens: len ? Math.ceil(capped(len) / 4) + 30 : 0, cacheable: 0, kind: len ? 'earlier' : 'none', session: false };
}

// historylean build(), from the records: its rows made from the end (buildFromEnd's steps), only the rows that are
// kept read whole; a short history (≤ LAZY_FROM rows): the pure build on its messages read whole
function build(s, chat, o, I, full) {
  const L = s.L; const D = s.D;
  const upto = o.upto ?? Math.max(0, s.n - 1);
  const ms = I.slice(0, upto);
  const c = chat.compact; const h = chat.handoff;
  let head = ''; let raw = ms;
  if (c && c.index >= (h?.at ?? -1) && c.summary) { head = `<summary>\n${c.summary}\n</summary>`; raw = ms.slice(c.tail ?? c.index); } else if (h?.brief && !h.whole) { head = h.brief; raw = ms.slice(h.at); }
  const list = raw.filter((k) => D[k].hl);
  if (list.length <= HLC.LAZY_FROM) {
    const inScope = new Set(raw);
    return HLC.build({ ...chat, messages: I.map((k) => (inScope.has(k) ? full(k) : L[k])) }, o);
  }
  const KEEP = HLC.KEEP; const RECENT = HLC.RECENT; const MAX_CHARS = HLC.MAX_CHARS;
  const n = list.length;
  let users = 0;
  const tiers = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    tiers[i] = users < KEEP ? 'keep' : users < KEEP + RECENT ? 'recent' : 'old';
    if (L[list[i]].role === 'user') users += 1;
  }
  const firstKeep = tiers.indexOf('keep');
  const seen = new Set(); const current = new Set();
  const longs = (i, fn) => { const b = D[list[i]].blk; for (let j = b.length - 2; j >= 0; j -= 2) fn(`${i}:${b[j]}`, b[j + 1]); };
  const scan = (i) => longs(i, (id, key) => { if (!seen.has(key)) { seen.add(key); current.add(id); } });
  const rows = new Array(n);
  let scanned = n;
  const rowAt = (i) => { while (scanned > i) scan(--scanned); return (rows[i] = HLC.render(full(list[i]), tiers[i], i, current)); };
  rowAt(n - 1);
  let tail = rows[n - 1].length + 2; let cut = n - 1;
  const firstLen = () => (rows[0] ?? '').length + 2;
  const firstCurrent = () => { const cc = new Set(current); const s2 = new Set(seen); longs(0, (id, key) => { if (!s2.has(key)) { s2.add(key); cc.add(id); } }); return cc; };
  const row0 = () => { if (rows[0] !== undefined) return; if (D[list[0]].blk.length) { while (scanned > 1) scan(--scanned); } rows[0] = HLC.render(full(list[0]), tiers[0], 0, firstCurrent()); };
  if (n > 1) {
    row0();
    while (cut > 1) {
      const i = cut - 1;
      const len = rowAt(i).length + 2;
      if (i >= firstKeep && firstKeep >= 0) { tail += len; cut = i; continue; }
      if (head.length + firstLen() + tail + len > MAX_CHARS) break;
      tail += len; cut = i;
    }
  } else cut = 1;
  const kept0 = n ? [rows[0] ?? (row0(), rows[0])] : [];
  const dropped = Math.max(0, cut - 1);
  const fetch = o.chatTools ? 'chat_do {op: "earlier", query: "<words>"} returns any earlier message word for word' : 'ask me if you need an earlier detail';
  const kept = dropped > 0 ? [kept0[0], `[… ${dropped} earlier messages left out here; ${o.chatTools ? 'chat_do earlier finds them' : 'ask me for them'} …]`, ...rows.slice(cut)] : [...kept0, ...rows.slice(1)];
  const history = [head, kept.join('\n\n')].filter(Boolean).join('\n\n');
  const stubs = { tools: list.reduce((k, x) => k + D[x].tools, 0), pictures: list.reduce((k, x) => k + D[x].pics, 0), code: (history.match(/\[code[^\]]*lines: /g) || []).length, clipped: (history.match(/\[…≈ /g) || []).length };
  const intro = `We continue this chat in a fresh session to save tokens. Here is our conversation so far, lighter: tool results and pictures are not sent again, and earlier code versions and older long answers are shortened (in [brackets]). Re-run a tool to see the current state; ${fetch}. Continue naturally; don't redo finished work.`;
  const text = `${intro}\n\n<earlier_conversation>\n${history}\n</earlier_conversation>\n\n${o.text ?? ''}`;
  return { text, history, tokens: tok(text) - tok(o.text ?? ''), dropped, stubs, messages: n };
}

module.exports = { whole, make, apply, calc, recOf, vocab, asSaved, Miss };
