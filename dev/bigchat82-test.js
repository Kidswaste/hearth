#!/usr/bin/env node
// (round 82, bigchat82) giant chats: the byte-level cut and its helpers (bigchat-core.js) give exactly what
// JSON.parse / JSON.stringify give, on made-up chats with every awkward thing (escapes, accents, emoji, empty lists,
// nested lists, numbers, paths, a BOM); a big chat read in steps; the save by what changed (storework.js op chatDelta)
// writes byte for byte what a whole save writes; sync's giant-chat paths (cloud form, pull, append-aware merge) give
// what the whole-file paths give; versions' digest; projfind / recall built in slices give the same results.
//   node dev/bigchat82-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const B = require(path.join(ROOT, 'bigchat-core.js'));

let passes = 0; let failures = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
let seed = 82;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WORDS = ['orb', 'café', 'naïve', '日本語', '🔥', 'quote"inside', 'back\\slash', 'line\nbreak', 'tab\there', 'ctrl\u0001x', 'slash/ok', '\u2028sep', 'lone\ud800x', 'end'];
const str = () => Array.from({ length: int(0, 12) }, () => pick(WORDS)).join(' ');
function value(depth = 0) {
  const r = rnd();
  if (depth > 3 || r < 0.35) return pick([() => str(), () => int(-5, 1e6), () => rnd() * 1000, () => 1e21, () => -0.5, () => true, () => false, () => null, () => '', () => '/Users/me/x.png', () => 'C:\\Users\\me\\x.png', () => 'file:///Users/me/a.png', () => 'hearth-data:/attachments/a.png'])();
  if (r < 0.55) return Array.from({ length: int(0, 4) }, () => value(depth + 1));
  const o = {}; for (let i = 0; i < int(0, 5); i++) o[pick(['a', 'b', 'k é', 'path', 'n', 'list', 'x"y'])] = value(depth + 1);
  return o;
}
function message(k) {
  const m = { role: pick(['user', 'assistant', 'error', 'opinion']), text: Array.from({ length: int(1, 30) }, () => str()).join('\n'), at: 1700000000000 + k * 1000 };
  if (rnd() < 0.3) m.usage = { input: int(1, 9000), output: int(1, 3000) };
  if (rnd() < 0.3) m.extra = value();
  if (rnd() < 0.2) m.attachments = [{ kind: 'image', name: 'a.png', path: pick(['/Users/me/data/attachments/a.png', 'C:\\Hearth\\data\\attachments\\a.png']) }];
  if (rnd() < 0.1) m.id = `m${k}`;
  if (rnd() < 0.05) m.empty = {};
  if (rnd() < 0.05) m.list = [];
  return m;
}
const chatOf = (n, extra = {}) => ({ id: 'giant', agentId: 'claude', title: 'A "giant" chat — été 🔥', createdAt: 1, updatedAt: 2, ...extra, messages: Array.from({ length: n }, (_, k) => message(k)), session: { id: 's1', at: 3 }, pinned: true });
const enc = (s) => Buffer.from(s, 'utf8');

// ---------- the cut ----------
for (const [label, chat, pretty] of [['pretty', chatOf(60), true], ['compact', chatOf(60), false], ['empty', chatOf(0), true], ['one', chatOf(1), false], ['messages last', (() => { const c = chatOf(5); const { messages, ...rest } = c; return { ...rest, messages }; })(), true]]) {
  const text = JSON.stringify(chat, null, pretty ? 2 : undefined);
  const buf = enc(text);
  const st = B.scanBuf(buf);
  ok(!st.bad && B.elCount(st) === chat.messages.length, `${label}: cut into ${B.elCount(st)} / ${chat.messages.length}`);
  let same = true;
  for (let k = 0; k < B.elCount(st); k++) if (JSON.stringify(JSON.parse(buf.toString('utf8', st.els[k * 2], st.els[k * 2 + 1]))) !== JSON.stringify(chat.messages[k])) same = false;
  ok(same, `${label}: each message parses to itself`);
  const head = B.headOf(buf, st);
  ok(JSON.stringify(head) === JSON.stringify({ ...chat, messages: [] }), `${label}: the head is the chat without its messages`);
  ok(B.prettyLayout(buf, st) === pretty || (chat.messages.length === 0), `${label}: layout told (${B.prettyLayout(buf, st)})`);
  // (the fast cut for a file laid out as the app writes it: the same cut, or none)
  const fc = B.fastCut(buf);
  ok(pretty && chat.messages.length ? fc && fc.els.join() === st.els.join() && fc.arrS === st.arrS && fc.arrE === st.arrE && fc.end === st.end : (!fc || fc.els.join() === st.els.join()), `${label}: fast cut ${fc ? 'same' : 'none'}`);
  // cut in uneven pieces (resumable): the same cut
  const st2 = B.scanInit(); let avail = 0;
  while (avail < buf.length) { avail = Math.min(buf.length, avail + int(1, 400)); B.scanStep(st2, buf, avail); }
  ok(st2.done && st2.els.join() === st.els.join(), `${label}: resumable cut`);
}
{ // a BOM, odd spacing, primitive messages, a key named "messages" deeper down
  const text = `\uFEFF { "id" : "x", "deep": {"messages": [1, 2]}, "messages" : [ 1 , "two" , null , {"messages":[]} , [3] ] , "title":"t" } `;
  const buf = enc(text); const st = B.scanBuf(buf);
  ok(!st.bad && B.elCount(st) === 5, `odd: ${B.elCount(st)} elements`);
  ok(JSON.stringify(Array.from({ length: 5 }, (_, k) => JSON.parse(buf.toString('utf8', st.els[k * 2], st.els[k * 2 + 1])))) === JSON.stringify([1, 'two', null, { messages: [] }, [3]]), 'odd: the elements');
  ok(JSON.stringify(B.headOf(buf, st)) === JSON.stringify({ id: 'x', deep: { messages: [1, 2] }, messages: [], title: 't' }), 'odd: its head');
  ok(B.scanBuf(enc('[1,2]')).bad && B.scanBuf(enc('{"messages": 3}')).bad && B.scanBuf(enc('{"messages":[1]')).bad, 'not a chat / cut short: bad');
}

// ---------- compact / pretty ----------
{
  let same = 0; let refused = 0; let n = 0; let prettySame = 0; let flagsOk = 0;
  for (let i = 0; i < 400; i++) {
    const v = i % 2 ? message(i) : value();
    const pretty = enc(JSON.stringify(v, null, 2) ?? 'null');
    const out = Buffer.alloc(pretty.length); const flags = {};
    const w = B.compactInto(pretty, 0, pretty.length, out, 0, flags);
    n += 1;
    if (w >= 0 && out.toString('utf8', 0, w) === JSON.stringify(v)) same += 1;
    const compact = enc(JSON.stringify(v) ?? 'null');
    if (B.prettyOf(compact, 0, compact.length, 0) === (JSON.stringify(v, null, 2) ?? 'null')) prettySame += 1;
    const strs = []; JSON.stringify(v, (k, x) => { if (typeof x === 'string') strs.push(x); return x; });
    const mayPath = strs.some((s) => /^(?:[/\\]|[A-Za-z]:|file:)/i.test(s));
    const mayCloud = strs.some((s) => s.startsWith('hearth-'));
    if ((!mayPath || flags.pathy) && (!mayCloud || flags.cloud)) flagsOk += 1;
  }
  ok(same === n, `compactInto = JSON.stringify for ${same} / ${n}`);
  ok(prettySame === n, `prettyOf = JSON.stringify(·, null, 2) for ${prettySame} / ${n}`);
  ok(flagsOk === n, `every path-like / hearth- string flagged (${flagsOk} / ${n})`);
  const bad = ['1.0', '"a\\/b"', '"\\u00e9"', '1E5', '"\\ud83d\\ude00"', '"\\u001B"'];
  for (const t of bad) { const b = enc(t); refused += B.compactInto(b, 0, b.length, Buffer.alloc(b.length), 0, null) < 0 ? 1 : 0; }
  ok(refused === bad.length, `not as JSON.stringify writes: refused (${refused} / ${bad.length})`);
  const deep = enc(JSON.stringify({ a: [[{ b: [] }], {}], c: 'x' }));
  ok(B.prettyOf(deep, 0, deep.length, 2) === JSON.stringify({ a: [[{ b: [] }], {}], c: 'x' }, null, 2).replace(/\n/g, '\n    '), 'prettyOf at depth 2');
  for (let i = 0; i < 50; i++) { const m = message(i); const b = enc(JSON.stringify(m, null, 2)); const f = B.topFields(b, 0, b.length); if (f.id !== m.id || f.role !== m.role || f.at !== m.at) { ok(false, `topFields ${JSON.stringify(f)}`); break; } }
  ok(true, 'topFields');
}
{ // the shell + the list = the whole file, pretty and compact
  const chat = chatOf(30);
  const [a, b] = B.shell({ ...chat, messages: [] }, true);
  ok(a + B.listParts(chat.messages.map(B.prettyMsg), true).join('') + b === JSON.stringify(chat, null, 2), 'shell + list (pretty) = JSON.stringify(chat, null, 2)');
  const [c, d] = B.shell({ ...chat, messages: [] }, false);
  ok(c + B.listParts(chat.messages.map((m) => JSON.stringify(m)), false).join('') + d === JSON.stringify(chat), 'shell + list (compact) = JSON.stringify(chat)');
  const empty = { ...chat, messages: [] };
  const [e, f] = B.shell(empty, true);
  ok(e + B.listParts([], true).join('') + f === JSON.stringify(empty, null, 2), 'an empty list');
}

// ---------- reading in steps ----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigchat82-'));
  const file = path.join(dir, 'giant.json');
  const chat = chatOf(300);
  fs.writeFileSync(file, JSON.stringify(chat, null, 2));
  const seen = [];
  const r = B.reader(fs, file, { chunk: 4096, onMessage: (m, k) => { seen[k] = m; } });
  let steps = 0; let calls = 0;
  while (r.step(() => (calls += 1) % 7 === 0) === 'more') steps += 1;
  ok(r.state === 'done' && steps > 10, `read in ${steps} steps`);
  ok(JSON.stringify(seen) === JSON.stringify(chat.messages) && JSON.stringify(r.head) === JSON.stringify({ ...chat, messages: [] }), 'read in steps: every message and the head');
  const r2 = B.reader(fs, file, { chunk: 4096 });
  r2.step(() => true);
  fs.writeFileSync(file, JSON.stringify(chatOf(301), null, 2));
  ok(r2.step() === 'changed', 'a file changed between steps: changed');
  fs.writeFileSync(file, '{"id":"x","messages":[1,2');
  const r3 = B.reader(fs, file); while (r3.step() === 'more');
  ok(r3.state === 'bad', 'cut short: bad');
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = { chatOf, message, ok, rnd, int, pick };
if (require.main === module) {
  const more = process.env.BIGCHAT82_PARTS ? process.env.BIGCHAT82_PARTS.split(',') : ['delta', 'sync', 'versions', 'index', 'summaries'];
  (async () => {
    for (const part of more) {
      const f = path.join(__dirname, `bigchat82-${part}.js`);
      if (fs.existsSync(f)) { const r = await require(f)({ ok, chatOf, message, rnd, int, pick, B, ROOT }); if (r) console.log(`  ${part}: ${r}`); } else if (part !== 'none') ok(false, `no part ${part}`);
    }
    console.log(`bigchat82: ${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  })().catch((err) => { console.error(err); process.exit(1); });
}
