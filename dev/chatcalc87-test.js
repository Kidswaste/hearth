#!/usr/bin/env node
// (round 87, chatcalc87) a windowed giant chat's whole-chat numbers from records kept per message (chatcalc-core.js), checked:
//   · = the pure modules on the whole chat (autocompact's decision, sendpreview's stats / history / lighter offer,
//     historylean's lighter history and its inputs), compared as JSON, on random chats: sessions or none, Continue
//     lighter (compact), handoffs (brief / whole), lighter starts (lean), second opinions, errors, compact requests,
//     attachments (pictures, files, refs), tools, code blocks (long, repeated: earlier versions), sent / ctx texts,
//     every `upto`; short histories (the pure build on its messages) and long ones (from the end)
//   · = again after random changes saved by change (chatDelta's form: new messages at the end, a cut with trunc, an old
//     message reacted to or edited, its own fields), each applied to the records (only what changed)
//   · a record never guesses: a field it doesn't hold throws (the whole way then answers)
//   · the store thread (storework.js chatCalc): the first ask makes the records, the next ones after saves by change
//     read them (how: 'kept'); the answers = the whole way's on the file; a file changed another way (a whole save,
//     sync): read again; a damaged / missing file: an error, never an answer
//   · chatwin-core profOf / pxAt (round 87, a width change): the height at any width = msgPx, exact; the store thread's
//     chatHeights = metaOf's heights at that width
//   · chatScan (round 87: chat-refs' @file list on a windowed chat): = the window's walk from the end on the whole chat
//   node dev/chatcalc87-test.js [--bench]   (--bench: bigchat84's giant chat, per reply: the whole way vs the records)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const ROOT = path.join(__dirname, '..');
const CC = require(path.join(ROOT, 'chatcalc-core.js'));
const CW = require(path.join(ROOT, 'chatwin-core.js'));

let passes = 0; let failures = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
let seed = 87;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const clone = (x) => JSON.parse(JSON.stringify(x));
const WORDS = 'shot glow layer beat camera palette kick snare bloom grain orbit spline mesh shader timing slider color frame scene light the and with café 日本語 quokka zanzibar render export sequence'.split(' ');
const words = (n) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
const code = (lang, file, lines) => `\n\`\`\`${lang}\n// ${file}\n${Array.from({ length: lines }, (_, j) => `const v${j} = ${int(0, 99)};`).join('\n')}\n\`\`\`\n`;
function text() {
  let t = words(int(0, 60));
  if (rnd() < 0.25) t += code(pick(['js', 'glsl', '']), pick(['src/app.js', 'a.glsl', 'notes.md', '']), pick([3, 14, 40, 130]));
  if (rnd() < 0.12) { const f = pick(['src/app.js', 'b.glsl']); t += `${code('js', f, 20)}${words(5)}${code('js', f, pick([16, 150]))}`; } // (two versions in one message)
  if (rnd() < 0.1) t += `\n<file name="x.txt">${words(30)}</file>`;
  if (rnd() < 0.1) t += `\n${'long line '.repeat(int(10, 400))}`;
  if (rnd() < 0.05) t += `\nsee /home/me/project/${pick(['a', 'b'])}.${pick(['md', 'js', 'png'])} and C:\\work\\x.txt`;
  return t;
}
function message(k) {
  const role = pick(['user', 'user', 'assistant', 'assistant', 'assistant', 'opinion', 'error']);
  const m = { role, text: rnd() < 0.04 ? '' : text(), at: 1.7e12 + k * 6e4 };
  if (role === 'opinion' && rnd() < 0.8) m.from = pick(['Astra', 'Claude']);
  if (role === 'assistant' && rnd() < 0.85) { m.usage = { input: int(0, 90000), output: int(10, 3000), cached: int(0, 50000) }; if (rnd() < 0.4) m.usage.contextInput = int(1000, 60000); if (rnd() < 0.2) m.usage.contextCached = int(0, 30000); if (rnd() < 0.3) m.usage.ttl = pick(['5m', '1h']); }
  if (role === 'assistant' && rnd() < 0.4) m.tools = Array.from({ length: int(1, 6) }, () => pick(['Read · app.js', 'Bash', 'three_eval', 'three_edit_code']));
  if (rnd() < 0.15) m.ctx = text();
  if (role === 'user' && rnd() < 0.2) m.sent = `${m.text}\n\n[Attached files]\n${words(40)}`;
  if (rnd() < 0.12) m.attachments = Array.from({ length: int(1, 3) }, () => (rnd() < 0.5 ? { kind: 'image', name: 'shot.png', ...(rnd() < 0.5 ? { tokens: int(500, 2000) } : {}), ...(rnd() < 0.2 ? { lean: { tokens: 900 } } : {}) } : { kind: 'text', name: 'a.js', tokens: int(10, 900), ...(rnd() < 0.2 ? { ref: 'sess' } : {}) }));
  if (rnd() < 0.03) m.compactReq = true;
  if (role === 'assistant' && rnd() < 0.02) m.compactSummary = true;
  if (rnd() < 0.02) m.handoffBrief = true;
  if (role === 'user' && rnd() < 0.03) m.histLean = { from: 40000, to: 9000, lean: int(1000, 9000) };
  if (rnd() < 0.05) m.thinking = words(30);
  if (rnd() < 0.05) m.things = [{ k: 'image', path: `/tmp/t${k}.png`, name: `t${k}.png` }];
  if (rnd() < 0.03) m.reaction = { emoji: '🔥', at: 1 };
  return m;
}
function heads(chat, n) {
  const kind = int(0, 5);
  if (rnd() < 0.7) chat.session = { id: `s${int(1, 9)}` };
  if (kind === 1 && n > 4) { const index = int(1, n - 1); chat.compact = { summary: words(int(5, 80)), index, ...(rnd() < 0.7 ? { tail: Math.max(0, index - int(0, 6)) } : {}), at: 1 }; }
  if (kind === 2 && n > 4) chat.handoff = { at: int(0, n - 1), brief: words(int(5, 60)), ...(rnd() < 0.3 ? { whole: words(200) } : {}), ...(rnd() < 0.4 ? { tokens: int(100, 4000) } : {}) };
  if (kind === 3 && n > 4) { chat.compact = { summary: words(20), index: int(1, n - 1), at: 1 }; chat.handoff = { at: int(0, n - 1), brief: words(20) }; }
  if (kind === 4 && n > 4) chat.lean = { at: int(0, n - 1), from: 40000, to: 9000, n: 1 };
  if (rnd() < 0.1) chat.leanOff = true;
  if (rnd() < 0.1) chat.leanNext = true;
  if (rnd() < 0.2) chat.engine = pick(['claude', 'codex']);
  return chat;
}
function chatOf(n) { return heads({ id: 'c', agentId: 'claude', title: 'A chat', createdAt: 1.7e12, updatedAt: 1.71e12, messages: Array.from({ length: n }, (_, k) => message(k)) }, n); }
const AGENTS = [{ id: 'claude', mode: 'native', engine: 'claude' }, { id: 'claude', mode: 'native', engine: 'claude', lighterAt: 20000 }, { id: 'codex', mode: 'native', engine: 'codex', lighterAt: 0 }, { id: 'claude', mode: 'native', engine: 'claude', lighterAt: 1000 }];
const ALL = ['lighter', 'preview', 'lean'];
// the records of a chat as the store thread makes them (from the file's bytes: what JSON keeps)
const stateOf = (chat) => { const saved = clone(chat); const { messages, ...head } = saved; return CC.make({ ...head, messages: [] }, new Array(messages.length * 2).fill(0), (k) => messages[k]); };
const readOf = (chat) => { const ms = clone(chat.messages); return (k) => ms[k]; };
// the two ways compared (JSON); returns '' or what differs
function compare(chat, s, o) {
  const now = 1.75e12;
  const want = CC.whole(clone(chat), { ...o, now });
  let got;
  try { got = CC.calc(s, { ...o, now, read: readOf(chat) }); } catch (err) { return `records threw ${err.code || ''} ${err.message}`; }
  for (const k of Object.keys(want)) { const a = JSON.stringify(want[k]); const b = JSON.stringify(got[k]); if (a !== b) return `${k} differs: ${a.slice(0, 300)} ≠ ${b.slice(0, 300)}`; }
  return Object.keys(got).length === Object.keys(want).length ? '' : 'keys differ';
}

async function bench() {
  const src = '/tmp/hearth-bigchat84/chats/claude-giant0.json';
  if (!fs.existsSync(src)) require('./bigchat84-fixture.js').make('/tmp/hearth-bigchat84');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-cc87b-')); const file = path.join(dir, 'giant.json'); fs.copyFileSync(src, file);
  const T = thread(); const agent = { id: 'claude', mode: 'native', engine: 'claude' };
  const calc = async (label) => { const t0 = performance.now(); const r = await T.op({ op: 'chatCalc', file, what: ALL, agent, tools: true }); console.log(`${label.padEnd(44)} ${Math.round(performance.now() - t0)} ms (thread ${r.ms} ms, ${r.how})`); return r; };
  try {
    await T.op({ op: 'chatWinOpen', file, ver: 'b0', cpl: 90, tail: 300 });
    await calc('chatCalc, first ask (records made)');
    await calc('chatCalc, again (same file)');
    const n0 = (await T.op({ op: 'chatRange', file, ver: 'b0', from: 0, to: 0 })).n;
    let ver = 'b0'; let n = n0;
    for (let i = 1; i <= 3; i++) {
      const msgs = [[n, { role: 'user', text: `reply ${i} ${words(30)}`, at: 2e12 + i }], [n + 1, { role: 'assistant', text: `${words(200)}${code('js', 'src/app.js', 40)}`, at: 2e12 + i + 1, usage: { input: 50000, output: 900, cached: 40000 } }]];
      const t0 = performance.now();
      const r = await T.op({ op: 'chatDelta', file, from: ver, to: `b${i}`, keys: ['id', 'agentId', 'title', 'createdAt', 'updatedAt', 'model', 'session', 'messages'], set: {}, n: n + 2, msgs });
      if (!r.ok) throw new Error(`delta: ${r.why}`);
      console.log(`${`save by change (one exchange) #${i}`.padEnd(44)} ${Math.round(performance.now() - t0)} ms`);
      ver = `b${i}`; n += 2;
      await calc(`chatCalc after reply ${i}`);
    }
    // the whole way, for comparison
    const t0 = performance.now(); CC.whole(JSON.parse(fs.readFileSync(file, 'utf8')), { what: ALL, agent, tools: true }); console.log(`${'the whole way on this thread (parse + calc)'.padEnd(44)} ${Math.round(performance.now() - t0)} ms`);
    const t1 = performance.now(); await T.op({ op: 'chatHeights', file, ver, cpl: 60 }); console.log(`${'chatHeights at another width'.padEnd(44)} ${Math.round(performance.now() - t1)} ms`);
  } finally { T.end(); fs.rmSync(dir, { recursive: true, force: true }); }
}
function thread() {
  const w = new Worker(path.join(ROOT, 'storework.js'));
  let seq = 0; const jobs = new Map();
  w.on('message', ({ id, res, err, ms }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res && typeof res === 'object' && !Array.isArray(res) ? Object.assign(res, { ms: Math.round(ms) }) : res); });
  return { op: (msg) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); }), end: () => w.terminate() };
}

async function main() {
  if (process.argv.includes('--bench')) { await bench(); return; }
  // ---------- the records = the whole chat, on random chats ----------
  {
    let same = 0; let tried = 0; const bad = [];
    for (let t = 0; t < 260; t++) {
      const n = pick([0, 1, 2, 3, 5, 9, 30, 120, 420, 700]);
      const chat = chatOf(n); const s = stateOf(chat);
      for (const agent of [pick(AGENTS), pick(AGENTS)]) {
        for (const upto of [undefined, n, Math.max(0, n - 1), int(0, n), n + 3]) {
          tried += 1;
          const why = compare(chat, s, { what: ALL, agent, tools: rnd() < 0.5, upto });
          if (why) { if (bad.length < 5) bad.push(`n=${n} upto=${upto}: ${why}`); } else same += 1;
        }
      }
    }
    for (const b of bad) console.log(`  ${b}`);
    ok(same === tried, `records = the whole chat: ${same} of ${tried} asks (260 random chats, every upto, 4 agents)`);
  }
  // ---------- … after random changes saved by change ----------
  {
    let same = 0; let tried = 0; const bad = [];
    for (let t = 0; t < 24; t++) {
      const chat = chatOf(pick([40, 380, 520])); const s = stateOf(chat);
      for (let i = 0; i < 25; i++) {
        const n0 = chat.messages.length; const kind = int(0, 7); const msgs = [];
        if (kind <= 2) { const a = message(n0); const b = message(n0 + 1); chat.messages.push(a, b); msgs.push([n0, a], [n0 + 1, b]); }
        else if (kind === 3 && n0 > 10) { const at = int(1, n0 - 1); chat.messages.length = at; const m = message(at); chat.messages.push(m); msgs.push([at, m]); }
        else if (kind === 4 && n0) { const at = int(0, n0 - 1); chat.messages[at] = { ...chat.messages[at], reaction: { emoji: '👍', at: i } }; msgs.push([at, chat.messages[at]]); }
        else if (kind === 5 && n0) { const at = int(0, n0 - 1); chat.messages[at] = { ...chat.messages[at], text: `${chat.messages[at].text} edited ${words(5)}${code('js', 'src/app.js', 20)}`, edited: true }; msgs.push([at, chat.messages[at]]); }
        else if (kind === 6) { delete chat.compact; delete chat.handoff; delete chat.lean; heads(chat, n0); }
        else { const m = message(n0); m.undef = undefined; chat.messages.push(m); msgs.push([n0, m]); }
        const { messages, ...head } = chat;
        CC.apply(s, { n: messages.length, msgs }, { ...head, messages: [] }, new Array(messages.length * 2).fill(0));
        for (const agent of [pick(AGENTS)]) for (const upto of [undefined, chat.messages.length - 1]) {
          tried += 1;
          const why = compare(chat, s, { what: ALL, agent, tools: true, upto });
          if (why) { if (bad.length < 5) bad.push(`walk ${t}.${i} (kind ${kind}): ${why}`); } else same += 1;
        }
      }
    }
    for (const b of bad) console.log(`  ${b}`);
    ok(same === tried, `records after changes saved by change = the whole chat: ${same} of ${tried} asks (24 random walks of 25 changes: appends, cuts, reactions, edits, its own fields)`);
  }
  // ---------- a record never guesses ----------
  {
    const chat = chatOf(30); const s = stateOf(chat);
    const at = chat.messages.findIndex((m) => m.role === 'assistant' && m.tools && m.text); const L = s.L[at];
    let threw = 0; for (const k of ['text', 'tools']) { try { void L[k]; } catch (e) { if (e.code === 'ECALCMISS') threw += 1; } }
    ok(at >= 0 && threw === 2 && L.role === 'assistant' && L.nope === undefined, 'records: a field they don\'t hold throws (text, tools…), one the message doesn\'t have is undefined');
    let threw2 = false; try { JSON.stringify(L); } catch (e) { threw2 = e.code === 'ECALCMISS'; }
    ok(threw2, 'records: a record can\'t pass for the message (JSON.stringify throws)');
    const odd = clone(chat); odd.messages[3] = null; const so = stateOf(odd);
    let miss = false; try { CC.calc(so, { what: ALL, read: readOf(odd) }); } catch (e) { miss = e.code === 'ECALCMISS'; }
    ok(so.bad === 1 && miss, 'records: a message that isn\'t an object → the whole way answers (never a guess)');
  }
  // ---------- heights at any width ----------
  {
    let same = true; let n = 0;
    for (let t = 0; t < 600; t++) {
      const m = message(t); if (rnd() < 0.2) m.text = `${'x'.repeat(int(0, 3000))}\n${code('js', 'a.js', int(1, 60))}${'\n'.repeat(int(0, 5))}${'y'.repeat(int(0, 200))}`;
      if (rnd() < 0.1) m.shows = [{ path: 'a.png' }]; if (rnd() < 0.02) m.compactReq = true;
      const p = CW.profOf(m);
      for (const cpl of [20, 30, 47.3, 90, 151.2, 258]) { n += 1; if (CW.pxAt(p, cpl) !== CW.msgPx(m, cpl)) same = false; }
    }
    ok(same, `heights: profOf / pxAt = msgPx at any width (${n} messages × widths)`);
    ok(CW.pxAt(CW.profOf(null), 90) === 0 && CW.pxAt(CW.profOf({ role: 'user', compactReq: true, text: 'x' }), 90) === 0, 'heights: nothing / a compact request: 0');
  }

  // ---------- the store thread ----------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-cc87-'));
  const T = thread();
  try {
    const chat = chatOf(1300); chat.session = { id: 's1' }; delete chat.compact; delete chat.handoff; delete chat.lean;
    const file = path.join(dir, 'giant.json'); fs.writeFileSync(file, JSON.stringify(chat, null, 2));
    const agent = AGENTS[1];
    const onFile = async (label, upto) => {
      const r = await T.op({ op: 'chatCalc', file, what: ALL, agent, tools: true, upto });
      const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
      const want = CC.whole(disk, { what: ALL, agent, tools: true, upto, now: r.lean.now });
      const same = ['n', 'lighter', 'preview', 'lean'].every((k) => JSON.stringify(r[k]) === JSON.stringify(want[k]));
      ok(same, `chatCalc ${label}: = the whole way on the file`);
      return r;
    };
    const r0 = await T.op({ op: 'chatWinOpen', file, ver: 'v0', cpl: 90, tail: 300 });
    ok(r0.n === 1300, 'chatWinOpen: opened windowed');
    const a = await onFile('(first ask)', 1299);
    ok(a.how === 'built', `chatCalc: the first ask makes the records (${a.how})`);
    const b = await onFile('(again)');
    ok(b.how === 'kept', `chatCalc: the next ask reads them (${b.how})`);
    // saves by change: the records follow, the file is never parsed whole again
    let ver = 'v0'; let n = 1300; let allKept = true;
    for (let i = 1; i <= 12; i++) {
      const kind = i % 4; let d;
      if (kind === 3) { const at = n - int(5, 40); d = { n: at + 1, msgs: [[at, message(at)]], trunc: true }; }
      else if (kind === 2) { const at = int(0, 900); const m = { ...JSON.parse(fs.readFileSync(file, 'utf8')).messages[at], reaction: { emoji: '🔥', at: i } }; d = { n, msgs: [[at, m]] }; }
      else d = { n: n + 2, msgs: [[n, message(n)], [n + 1, message(n + 1)]] };
      const res = await T.op({ op: 'chatDelta', file, from: ver, to: `v${i}`, keys: Object.keys(chat), set: i === 6 ? { compact: { summary: 'a summary', index: 1000, tail: 995, at: 1 } } : {}, ...d });
      if (!res.ok) { ok(false, `chatDelta #${i}: ${res.why}`); break; }
      ver = `v${i}`; n = d.n;
      const r = await onFile(`after change #${i} (kind ${kind})`, i % 2 ? undefined : n - 1);
      if (r.how !== 'kept') allKept = false;
    }
    ok(allKept, 'chatCalc after each save by change: read from the kept records (never the file parsed whole)');
    // a file changed another way (a whole save, sync): read again
    const disk = JSON.parse(fs.readFileSync(file, 'utf8')); disk.messages.push(message(9999)); disk.title = 'Changed elsewhere'; fs.writeFileSync(file, JSON.stringify(disk, null, 2));
    const c = await onFile('(the file changed another way)');
    ok(c.how === 'built', `chatCalc: a file changed another way is read again (${c.how})`);
    // heights at another width = metaOf's
    await T.op({ op: 'chatWinOpen', file, ver: 'h0', cpl: 90, tail: 300 });
    const ms = JSON.parse(fs.readFileSync(file, 'utf8')).messages;
    for (const cpl of [37.8, 90, 140.5]) {
      const h = await T.op({ op: 'chatHeights', file, ver: 'h0', cpl });
      ok(h.same && JSON.stringify(h.h) === JSON.stringify(ms.map((m) => CW.metaOf(m, cpl)[0])), `chatHeights at ${cpl} characters a line = metaOf's heights`);
    }
    const o2 = await T.op({ op: 'chatWinOpen', file, ver: 'h1', cpl: 60, tail: 300 });
    const p2 = JSON.parse(Buffer.from(o2.bytes).toString('utf8'));
    ok(JSON.stringify(p2.h) === JSON.stringify(ms.map((m) => CW.metaOf(m, 60)[0])) && JSON.stringify(p2.r) === JSON.stringify(ms.map((m) => CW.recOf(CW.metaOf(m, 60)))), 'chatWinOpen at another width: its records = metaOf\'s (heights made again from the kept profiles)');
    // chatScan: @file paths from the end = the window's walk on the whole chat
    {
      const RE = CW.FILE_PATHS;
      for (const [from, to] of [[0, ms.length], [200, 900], [0, 50]]) {
        const want = []; for (const m of ms.slice(from, to).reverse()) { for (const p of String(m.sent || m.text || '').match(RE) || []) if (!want.includes(p)) want.push(p); if (want.length >= 12) break; }
        const got = await T.op({ op: 'chatScan', file, ver: 'h1', kind: 'paths', from, to, seen: [], max: 12 });
        ok(got.same && JSON.stringify(got.seen) === JSON.stringify(want), `chatScan paths [${from}, ${to}): ${want.length} paths, as the walk from the end`);
      }
      const src = fs.readFileSync(path.join(ROOT, 'chat-refs.js'), 'utf8');
      ok(src.includes(String(RE).replace(/\/g$/, '/g')), 'chatScan: chat-refs.js finds paths with the very same expression');
    }
    // a damaged / missing file: an error, never an answer
    const bad = path.join(dir, 'bad.json'); fs.writeFileSync(bad, '{"id":"x","messages":[{"role":"user","te');
    for (const [what, f] of [['damaged', bad], ['gone', path.join(dir, 'gone.json')]]) {
      const k = await T.op({ op: 'chatCalc', file: f, what: ['lighter'], agent }).catch((e) => ({ error: e.message }));
      ok(k && k.error && !k.lighter, `chatCalc on a ${what} file: an error, no decision`);
      const h = await T.op({ op: 'chatHeights', file: f, ver: 'z', cpl: 90 }).catch((e) => ({ error: e.message }));
      ok(h && h.error && !h.h, `chatHeights on a ${what} file: an error, no heights`);
      const s = await T.op({ op: 'chatScan', file: f, ver: 'z', kind: 'paths', from: 0, to: 5, seen: [], max: 12 }).catch((e) => ({ error: e.message }));
      ok(s && s.error && !s.seen, `chatScan on a ${what} file: an error, not "no paths"`);
    }
  } finally { T.end(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(`chatcalc87-test: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
