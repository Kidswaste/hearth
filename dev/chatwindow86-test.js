#!/usr/bin/env node
// (round 86, chatwindow86) a giant chat held WINDOWED (chatwin-core.js / chatwin.js / storework.js), checked:
//   · "not loaded" is never "not there": the windowed messages keep the true count; an unloaded message reads as a stub
//     with its small fields only; every way of walking the whole chat for its content (map / filter / for…of over the
//     text, JSON.stringify, a copy, structuredClone) throws NotLoaded; a change to an unloaded message, or a write that
//     would move messages it can't see (splice / unshift / sort / reverse, a longer length, a stub written back), is
//     refused before it changes anything; lookups by role / time / usage give the same answers as the whole chat
//   · its records (chatwin-core metaOf) give the heights native.js guessH gives, at any width
//   · the store thread's ops on a file: chatWinOpen (its own fields, its end, its pinned messages, one record each),
//     chatRange (= the messages there), chatFind (= the window's own test on every message: case, Kelvin K, İ, quotes,
//     backslashes, accents, thinking, a compact request left out), chatCalc (= autocompact / sendpreview / historylean
//     on the whole chat); a file that's gone, damaged or changed → an error or "not the same version", never an empty
//     answer
//   · SAVES: every kind of change made on a windowed chat (a new exchange, a reaction / pin / bookmark on an old message
//     after its block was read, edit-from-here and retry (cut to n: trunc), a message deleted at the end, its own fields,
//     a random walk of 40 changes) saved by change gives the file the whole save gives (JSON.stringify(chat, null, 2)),
//     byte for byte, and the same file as native.js's saving by change on the whole chat (the way before); a shorter
//     chat without trunc is refused (nothing written)
//   · native.js withContext's tail rows (round 86: read from the end) = joining every row, as before
//   node dev/chatwindow86-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { Worker } = require('worker_threads');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'chatwin-core.js'));
const AC = require(path.join(ROOT, 'autocompact.js'));
const SPC = require(path.join(ROOT, 'sendpreview-core.js'));
const HLC = require(path.join(ROOT, 'historylean-core.js'));

let passes = 0; let failures = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
const throws = (fn, code) => { try { fn(); return false; } catch (e) { return code ? e?.code === code : true; } };
let seed = 86;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WORDS = ['orb', 'café', 'CAFÉ', '日本語', '🔥', 'quote"inside', 'back\\slash', 'line\nbreak', '**bold**', '`code`', '\n```js\nx()\n```\n', 'tab\there', 'ctrl\u0001x', 'KelvinKelvin', 'İstanbul', 'lone\ud800x', '<b>&amp;</b>', 'Zanzibar', 'long '.repeat(40)];
const str = () => Array.from({ length: int(0, 14) }, () => pick(WORDS)).join(' ');
function message(k) {
  const m = { role: pick(['user', 'assistant', 'assistant', 'opinion', 'error']), text: str(), at: 1.7e12 + k * 6e4 };
  if (m.role === 'opinion') m.from = pick(['Astra', 'Claude']);
  if (m.role === 'assistant') m.usage = { input: int(100, 90000), output: int(10, 3000), cached: int(0, 50000) };
  if (rnd() < 0.3) m.thinking = str();
  if (rnd() < 0.2) m.tools = [{ name: 'Read', input: { path: '/a/b.js' } }];
  if (rnd() < 0.1) m.attachments = [{ kind: 'image', name: 'a.png' }];
  if (rnd() < 0.05) m.pinnedMsg = true;
  if (rnd() < 0.03) m.compactReq = true;
  if (rnd() < 0.05) m.nested = { list: [1, [2, { x: null }], []], empty: {} };
  return m;
}
function chatOf(n) { return { id: 'giant', agentId: 'claude', title: 'A giant chat', createdAt: 1.7e12, updatedAt: 1.71e12, model: 'x', session: { id: 's1' }, messages: Array.from({ length: n }, (_, k) => message(k)) }; }
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------- native.js's own pieces (read from its source: the same code) ----------
const NATIVE = fs.readFileSync(path.join(ROOT, 'native.js'), 'utf8');
const piece = (start) => { const i = NATIVE.indexOf(start); if (i < 0) throw new Error(`native.js: ${start}`); let d = 0; for (let j = NATIVE.indexOf('{', i); j < NATIVE.length; j++) { if (NATIVE[j] === '{') d++; else if (NATIVE[j] === '}' && --d === 0) return NATIVE.slice(i, j + 1); } throw new Error(start); };
const line = (start) => { const i = NATIVE.indexOf(start); return NATIVE.slice(i, NATIVE.indexOf('\n', i)); };
const N = vm.runInNewContext(`const COLLAPSE_PX = 900; const CODE_FOLD_LINES = 28; let lastCpl = 90; const pxOf = new WeakMap(); const CONTEXT_CHARS = 24000;
${line('const shapeOf = (v) =>')}
${piece('function sameShape(sh, v)')}
${piece('function textPx(m, cpl)')}
${piece('function guessH(msgs, lo, hi, w)')}
${line('const rowOf = (m) =>')}
${line('function tailRows(ms, from, keep)')}
({ shapeOf, sameShape, textPx, guessH, rowOf, tailRows });`, {});
// native.js saveChat's way on a whole chat (the way before this round, kept here as the reference)
function wholeDelta(chat, s) {
  const keys = Object.keys(chat); const set = {}; let n = keys.length !== s.keys.length || keys.some((k, i) => k !== s.keys[i]) ? 1 : 0;
  for (const k of keys) if (k !== 'messages' && (!s.head.has(k) || !N.sameShape(s.head.get(k), chat[k]))) { set[k] = chat[k]; s.head.set(k, N.shapeOf(chat[k])); n += 1; }
  for (const k of s.head.keys()) if (!keys.includes(k)) { s.head.delete(k); n += 1; }
  const ms = chat.messages; const msgs = [];
  for (let k = 0; k < ms.length; k++) if (k >= s.msgs.length || !N.sameShape(s.msgs[k], ms[k])) { msgs.push([k, ms[k]]); s.msgs[k] = N.shapeOf(ms[k]); }
  if (!n && !msgs.length && ms.length === s.msgs.length) return null;
  const trunc = ms.length < s.msgs.length;
  s.msgs.length = ms.length; s.keys = keys;
  return { keys, set, n: ms.length, msgs, trunc };
}
const shapeRec = (chat, ver) => { const head = new Map(); for (const k of Object.keys(chat)) if (k !== 'messages') head.set(k, N.shapeOf(chat[k])); return { ver, keys: Object.keys(chat), head, msgs: chat.messages.map(N.shapeOf) }; };

// ---------- the store thread ----------
function thread() {
  const w = new Worker(path.join(ROOT, 'storework.js'));
  let seq = 0; const jobs = new Map();
  w.on('message', ({ id, res, err }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  return { op: (msg) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); }), end: () => w.terminate() };
}
const parseBytes = (b) => JSON.parse(Buffer.from(b).toString('utf8'));

// a windowed chat as chatwin.js open() makes it, from chatWinOpen's answer
function windowed(r, ver, misses) {
  const p = parseBytes(r.bytes); const head = JSON.parse(r.head);
  const st = { meta: p.meta, cpl: p.cpl, poison: null };
  const loaded = p.messages.map((m, i) => [r.from + i, m]); p.pk.forEach((k, i) => loaded.push([k, p.pins[i]]));
  st.a = C.makeArray({ n: r.n, loaded, meta: (k) => st.meta[k], miss: (k, key) => { misses?.push([k, key]); throw new C.NotLoaded(k, key); }, refuse: (k, why, hard) => { if (hard) st.poison = why; if (!hard) throw new C.NotLoaded(k, why); throw new Error(why); } });
  const chat = {}; for (const k of Object.keys(head)) chat[k] = k === 'messages' ? st.a.px : head[k];
  const sh = { ver, keys: Object.keys(chat), head: new Map(), msgs: [] };
  for (const k of sh.keys) if (k !== 'messages') sh.head.set(k, N.shapeOf(chat[k]));
  sh.msgs.length = r.n; for (const k of st.a.keys()) sh.msgs[k] = N.shapeOf(st.a.t[k]);
  return { chat, st, sh, p };
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-cw86-'));
  const T = thread();
  try {
    // ---------- the array and its stubs ----------
    {
      const full = chatOf(600); const n = full.messages.length;
      const meta = full.messages.map((m) => C.metaOf(m, 90));
      const misses = []; let hard = 0;
      const a = C.makeArray({ n, loaded: full.messages.slice(500).map((m, i) => [500 + i, m]), meta: (k) => meta[k], miss: (k, key) => { misses.push(k); throw new C.NotLoaded(k, key); }, refuse: (k, why, h) => { if (h) hard += 1; if (!h) throw new C.NotLoaded(k, why); throw new Error(why); } });
      const px = a.px;
      ok(px.length === n && Array.isArray(px), 'windowed: the true count, an array');
      ok(px[550] === full.messages[550], 'windowed: a loaded message is itself');
      ok(px[3].role === full.messages[3].role && px[3].at === full.messages[3].at && px[3] === px[3], 'windowed: a stub gives its small fields (the same stub each time)');
      ok(throws(() => px[3].text, 'ENOTLOADED') && throws(() => px[3].thinking ?? px[3].text, 'ENOTLOADED'), 'windowed: a stub\'s text throws NotLoaded (never "")');
      ok(JSON.stringify(px.filter((m) => m.role === 'user').length) === JSON.stringify(full.messages.filter((m) => m.role === 'user').length), 'windowed: a count by role = the whole chat\'s');
      ok(px.findLastIndex((m) => m.role === 'assistant') === full.messages.findLastIndex((m) => m.role === 'assistant'), 'windowed: findLastIndex by role');
      ok(px.reduce((s, m) => s + (m.usage ? m.usage.input : 0), 0) === full.messages.reduce((s, m) => s + (m.usage ? m.usage.input : 0), 0), 'windowed: the usage total');
      ok(JSON.stringify(px.map((m, i) => (m.pinnedMsg ? i : -1)).filter((i) => i >= 0)) === JSON.stringify(full.messages.map((m, i) => (m.pinnedMsg ? i : -1)).filter((i) => i >= 0)), 'windowed: pinned indexes');
      ok([...px].reverse().find((m) => m.usage)?.usage.input === [...full.messages].reverse().find((m) => m.usage)?.usage.input, 'windowed: the last usage');
      for (const [name, fn] of [
        ['map(text)', () => px.map((m) => m.text)], ['filter(text)', () => px.filter((m) => m.text.includes('x'))], ['for…of text', () => { let s = 0; for (const m of px) s += m.text.length; return s; }],
        ['reduce(text)', () => px.reduce((s, m) => s + m.text.length, 0)], ['JSON.stringify(messages)', () => JSON.stringify(px)], ['JSON.stringify(chat)', () => JSON.stringify({ id: 1, messages: px })],
        ['a copy of a stub', () => ({ ...px[3] })], ['Object.assign', () => Object.assign({}, px[3])], ['Object.entries', () => Object.entries(px[3])], ['slice(0).map(text)', () => px.slice(0, 10).map((m) => m.text)],
        ['some(text)', () => px.some((m) => m.text === 'nope')], ['every(thinking)', () => px.every((m) => m.thinking !== 'x')],
      ]) ok(throws(fn, 'ENOTLOADED'), `windowed: ${name} throws NotLoaded (never a part as the whole)`);
      ok(throws(() => structuredClone(px)) && throws(() => structuredClone(px[3])) && throws(() => structuredClone({ messages: px })), 'windowed: structuredClone (IPC) of it throws: it can\'t be saved or sent');
      ok(misses.length > 0 && hard === 0, 'windowed: misses counted, no refused write yet');
      // writes refused before they change anything
      const before = JSON.stringify(px.slice(500));
      ok(throws(() => { px[3].reaction = { emoji: '🔥' }; }, 'ENOTLOADED') && throws(() => { delete px[3].role; }, 'ENOTLOADED') && throws(() => { px[3].usage.input = 1; }, 'ENOTLOADED'), 'windowed: a change to an unloaded message (or its small object) is refused');
      ok(throws(() => { px[3] = { role: 'user', text: 'x' }; }) && hard === 1, 'windowed: a write at an unloaded index is refused (hard)');
      ok(throws(() => px.splice(5, 1)) && JSON.stringify(px.slice(500)) === before && px.length === n, 'windowed: splice over unloaded messages refused, nothing moved');
      ok(throws(() => px.sort()) && throws(() => px.reverse()) && JSON.stringify(px.slice(500)) === before, 'windowed: sort / reverse refused, nothing moved');
      ok(throws(() => { px.length = n + 5; }) && px.length === n, 'windowed: a longer length (holes) refused');
      ok(throws(() => { px[550] = px[3]; }) && px[550] === full.messages[550], 'windowed: a stub written into the chat refused');
      // allowed: the loaded end
      const m = { role: 'user', text: 'new', at: 2e12 }; px.push(m);
      ok(px.length === n + 1 && px[n] === m, 'windowed: push');
      ok(px.splice(n, 1)[0] === m && px.length === n, 'windowed: splice at the end');
      px[599] = { ...px[599], edited: true }; ok(px[599].edited, 'windowed: a loaded message replaced');
      px.length = 560; ok(px.length === 560 && a.keys().at(-1) === 559, 'windowed: cut shorter (truncate to n)');
      const b2 = C.makeArray({ n: 50, loaded: full.messages.slice(40, 50).map((x, i) => [40 + i, x]), meta: (k) => meta[k], miss: (k) => { throw new C.NotLoaded(k); }, refuse: (k, why, h) => { if (h) hard += 10; throw new Error(why); } });
      ok(throws(() => b2.px.unshift({ role: 'x' })) && hard >= 11, 'windowed: unshift over unloaded messages refused as a hard stop (the chat is read again)');
      // a message that isn't an object reads as itself
      const odd = C.makeArray({ n: 3, loaded: [[2, { role: 'user', text: 'a' }]], meta: (k) => C.metaOf([null, 7][k], 90), miss: () => { throw new C.NotLoaded(0); }, refuse: () => { throw new Error('no'); } });
      ok(odd.px[0] === null && odd.px[1] === 7, 'windowed: a null / number message reads as itself');
    }

    // ---------- records: the heights native.js guesses ----------
    {
      const full = chatOf(400);
      full.messages[3].text = `${'x'.repeat(5000)}\n\`\`\`js\n${'a\n'.repeat(60)}\`\`\`\n`; full.messages[3].role = 'assistant';
      full.messages[4].shows = [{ path: 'a.png' }, { path: 'b.png' }]; full.messages[5].things = [{ k: 'image' }];
      for (const w of [400, 760, 1300]) {
        const cpl = Math.max(30, (w - 90) / 7.4);
        const meta = full.messages.map((m) => C.metaOf(m, cpl));
        let same = true; for (let lo = 0; lo < 400; lo += 20) { const sum = meta.slice(lo, lo + 20).reduce((s, x) => s + x[0], 0); if (sum !== N.guessH(full.messages, lo, lo + 20, w)) same = false; }
        ok(same, `records: block heights = native.js guessH at ${w} px`);
      }
      const r = C.metaOf(full.messages[3], 90);
      ok(!('text' in r[2]) && r[1].includes('text') && r[2].role === 'assistant', 'records: a message\'s text is never in its record');
    }

    // ---------- the store thread on a file ----------
    const full = chatOf(1500);
    full.messages[1200].pinnedMsg = true; full.messages[30].text += ' zanzibar86quokka'; full.messages[31].thinking = 'Thinking about ZANZIBAR86quokka';
    full.messages[32].compactReq = true; full.messages[32].text = 'zanzibar86quokka (compact)';
    const file = path.join(dir, 'giant.json');
    fs.writeFileSync(file, JSON.stringify(full, null, 2));
    {
      const r = await T.op({ op: 'chatWinOpen', file, ver: 'v1', cpl: 90, tail: 300 });
      const p = parseBytes(r.bytes);
      const head = JSON.parse(r.head);
      ok(r.n === 1500 && r.from === 1200 && JSON.stringify(p.messages) === JSON.stringify(full.messages.slice(1200)), 'chatWinOpen: the end (300 messages) as they are');
      ok(JSON.stringify(Object.keys(head)) === JSON.stringify(Object.keys(full)) && Array.isArray(head.messages) && !head.messages.length && head.title === full.title, 'chatWinOpen: its own fields, messages in place, empty');
      ok(JSON.stringify(p.meta) === JSON.stringify(full.messages.map((m) => C.metaOf(m, 90))), 'chatWinOpen: one record per message (metaOf)');
      ok(JSON.stringify(p.pk) === JSON.stringify(full.messages.map((m, i) => (m.pinnedMsg && i < 1200 ? i : -1)).filter((i) => i >= 0)) && JSON.stringify(p.pins) === JSON.stringify(p.pk.map((k) => full.messages[k])), 'chatWinOpen: its pinned messages');
      const r2 = await T.op({ op: 'chatRange', file, ver: 'v1', from: 20, to: 45 });
      ok(r2.same && r2.n === 1500 && JSON.stringify(parseBytes(r2.bytes).messages) === JSON.stringify(full.messages.slice(20, 45)), 'chatRange: messages [20, 45) as they are, the same version');
      ok(!(await T.op({ op: 'chatRange', file, ver: 'other', from: 0, to: 2 })).same, 'chatRange: another version says so');
      const r3 = await T.op({ op: 'chatRange', file, ver: 'v1', from: 1490, to: 2000 });
      ok(r3.to === 1500 && parseBytes(r3.bytes).messages.length === 10, 'chatRange: clamped to the chat');
      // find: the same test on every message
      for (const q of ['zanzibar86quokka', 'ZANZIBAR86QUOKKA', 'café', 'kelvin', 'k', 'istanbul', 'i̇stanbul', 'quote"inside', 'back\\slash', 'line\nbreak', '日本語', 'nothing-like-this', 'long long']) {
        const needle = q.toLowerCase();
        const want = full.messages.map((m, i) => (C.findHit(m, needle) ? i : -1)).filter((i) => i >= 0);
        const got = await T.op({ op: 'chatFind', file, q });
        ok(JSON.stringify(got.hits) === JSON.stringify(want), `chatFind "${q.replace(/\n/g, '\\n')}": ${want.length} hits as the window's own test`);
      }
      ok(JSON.stringify((await T.op({ op: 'chatFind', file, q: 'zanzibar86quokka' })).hits) === '[30,31]', 'chatFind: text and thinking, a compact request left out');
      // calc: autocompact / sendpreview / historylean on the whole chat
      const agent = { id: 'claude', mode: 'native', engine: 'claude', lighterAt: 20000 };
      const c = await T.op({ op: 'chatCalc', file, what: ['lighter', 'preview', 'lean'], agent, tools: true, upto: 1499 });
      ok(JSON.stringify(c.lighter) === JSON.stringify(AC.decide(AC.inputOf(clone(full), agent))), 'chatCalc lighter = autocompact on the whole chat');
      const c2 = clone(full);
      ok(JSON.stringify(c.preview.st) === JSON.stringify(SPC.stats(c2)) && JSON.stringify(c.preview.history) === JSON.stringify(SPC.historyOf(c2)), 'chatCalc preview = sendpreview on the whole chat');
      const b = HLC.build(c2, { upto: 1499, chatTools: true });
      ok(c.lean.built.text === b.text && JSON.stringify({ ...c.lean.input, gap: 0 }) === JSON.stringify({ ...HLC.inputOf(c2, agent, { now: c.lean.now, upto: 1499, chatTools: true, built: b }), gap: 0 }), 'chatCalc lean = historylean on the whole chat');
      // a file that can't be read: an error, never an empty answer
      const bad = path.join(dir, 'bad.json'); fs.writeFileSync(bad, '{"id":"x","messages":[{"role":"user","te');
      const gone = path.join(dir, 'gone.json');
      for (const [what, f] of [['damaged', bad], ['gone', gone]]) {
        const o = await T.op({ op: 'chatWinOpen', file: f, ver: 'z', cpl: 90 }).catch((e) => ({ error: e.message }));
        ok(o && (o.error || o.whole) && !o.bytes, `chatWinOpen on a ${what} file: ${o.error || 'whole'}, no messages`);
        const g = await T.op({ op: 'chatRange', file: f, ver: 'z', from: 0, to: 5 }).catch((e) => ({ error: e.message }));
        ok(g && g.error && !g.bytes, `chatRange on a ${what} file: an error (${g.error}), not an empty range`);
        const h = await T.op({ op: 'chatFind', file: f, q: 'a' }).catch((e) => ({ error: e.message }));
        ok(h && h.error && !h.hits, `chatFind on a ${what} file: an error, not "no hits"`);
        const k = await T.op({ op: 'chatCalc', file: f, what: ['lighter'], agent }).catch((e) => ({ error: e.message }));
        ok(k && k.error && !k.lighter, `chatCalc on a ${what} file: an error, no decision`);
      }
    }

    // ---------- SAVES: every kind of change, byte for byte ----------
    // the windowed chat (as chatwin.js holds it) and the whole chat (as before) get the same changes; each is saved by
    // change on the store thread; the file must equal JSON.stringify(whole, null, 2), and the old way's file too
    const runSaves = async (label, steps) => {
      const base = chatOf(900);
      const slug = label.replace(/[^a-z0-9]+/gi, '-'); const fw = path.join(dir, `w-${slug}.json`); const fo = path.join(dir, `o-${slug}.json`);
      fs.writeFileSync(fw, JSON.stringify(base, null, 2)); fs.writeFileSync(fo, JSON.stringify(base, null, 2));
      const r = await T.op({ op: 'chatWinOpen', file: fw, ver: 'w0', cpl: 90, tail: 300 });
      const W = windowed(r, 'w0', []);
      await T.op({ op: 'chatOpen', file: fo, ver: 'o0' }); // (the way before: the whole chat, its shape)
      const whole = clone(base); const so = shapeRec(whole, 'o0');
      let wv = 'w0'; let ov = 'o0'; let i = 0; let allSame = true; let byChange = 0;
      const load = async (lo, hi) => { // a block read for an action on an old message (chatwin.js ensure)
        const g = await T.op({ op: 'chatRange', file: fw, ver: wv, from: lo, to: hi });
        parseBytes(g.bytes).messages.forEach((m, j) => { const k = lo + j; if (!W.st.a.loaded(k)) { W.st.a.put(k, m); W.sh.msgs[k] = N.shapeOf(m); } });
      };
      for (const step of steps) {
        await step({ w: W.chat, o: whole, load, st: W.st });
        i += 1;
        const d = C.delta(W.chat, W.sh, W.st.a.keys(), (k) => W.st.a.t[k], N);
        if (d) { const to = `w${i}`; const res = await T.op({ op: 'chatDelta', file: fw, from: wv, to, ...d }); if (res.ok) { wv = to; byChange += 1; } else ok(false, `${label} #${i}: the windowed change was refused (${res.why})`); }
        const od = wholeDelta(whole, so);
        if (od) { const to = `o${i}`; const res = await T.op({ op: 'chatDelta', file: fo, from: ov, to, ...od }); if (res.ok) ov = to; else ok(false, `${label} #${i}: the old way's change was refused (${res.why})`); }
        const want = JSON.stringify(whole, null, 2);
        if (fs.readFileSync(fw, 'utf8') !== want || fs.readFileSync(fo, 'utf8') !== want) { allSame = false; console.log(`  ${label}: step ${i} differs`); break; }
      }
      ok(allSame && !W.st.poison, `saves: ${label} — the file = a whole save, byte for byte, after each of ${steps.length} change(s) (${byChange} by change)`);
      return { W, whole };
    };
    const both = (fn) => async (x) => { fn(x.w, x); fn(x.o, x); };
    await runSaves('a new exchange', [both((c) => { c.messages.push({ role: 'user', text: 'hello', at: 2e12 }); c.updatedAt = 2e12; }), both((c) => { c.messages.push({ role: 'assistant', text: 'hi there', at: 2e12 + 1, usage: { input: 5, output: 2 } }); })]);
    await runSaves('a reaction on an old message', [async (x) => { await x.load(200, 220); for (const c of [x.w, x.o]) c.messages[210].reaction = { emoji: '🔥', at: 1 }; }]);
    await runSaves('pin / bookmark old and new', [async (x) => { await x.load(40, 60); for (const c of [x.w, x.o]) { c.messages[41].pinnedMsg = true; c.messages[899].bookmark = true; } }, async (x) => { for (const c of [x.w, x.o]) delete c.messages[41].pinnedMsg; }]);
    await runSaves('edit-from-here on an old message (cut to n)', [async (x) => {
      const at = 400; await x.load(at - 300, at + 1);
      const orig = x.o.messages[at];
      x.w.messages.length = at; x.o.messages = x.o.messages.slice(0, at);
      for (const c of [x.w, x.o]) { c.messages.push({ ...orig, text: 'edited', edited: true, edits: [orig.text] }); c.session = {}; }
    }, both((c) => { c.messages.push({ role: 'assistant', text: 'a new reply', at: 3e12 }); })]);
    await runSaves('retry (cut to the last message of yours)', [both((c) => { const u = c.messages.map((m) => m.role).lastIndexOf('user'); if (Array.isArray(c.messages) && c.messages.length > u + 1) c.messages.length = u + 1; c.session = {}; }), both((c) => { c.messages.push({ role: 'assistant', text: 'again', at: 4e12 }); })]);
    await runSaves('a message deleted at the end', [both((c) => { c.messages.splice(c.messages.length - 2, 1); })]);
    await runSaves('its own fields', [both((c) => { c.title = 'Renamed'; c.pinned = true; c.session = {}; c.compact = { summary: 's', index: 880, at: 1 }; }), both((c) => { delete c.pinned; c.lighterOffered = 40000; })]);
    // a random walk: appends, edits of loaded messages, old messages read then changed, cuts, own fields
    const walk = [];
    for (let k = 0; k < 40; k++) { // (every random value drawn here, once: both chats get the very same change)
      const kind = int(0, 5); const m1 = message(5000 + k); const m2 = message(7000 + k); const back = int(1, 20); const old = rnd(); const cutBy = int(5, 400); const emoji = pick(['👍', '🔥']);
      if (kind === 0) walk.push(both((c) => { c.messages.push(clone(m1)); }));
      else if (kind === 1) walk.push(async (x) => { const at = x.o.messages.length - back; for (const c of [x.w, x.o]) c.messages[at].text += ' (changed)'; });
      else if (kind === 2) walk.push(async (x) => { const at = Math.floor(old * Math.max(1, x.o.messages.length - 301)); await x.load(Math.floor(at / 20) * 20, Math.floor(at / 20) * 20 + 20); for (const c of [x.w, x.o]) c.messages[at].reaction = { emoji, at: k }; });
      else if (kind === 3 && k % 9 === 3) walk.push(async (x) => { const at = Math.max(1, x.o.messages.length - cutBy); await x.load(Math.max(0, at - 300), at); x.w.messages.length = at; x.o.messages = x.o.messages.slice(0, at); });
      else if (kind === 4) walk.push(both((c) => { c.updatedAt = 5e12 + k; }));
      else walk.push(both((c) => { c.messages.push(clone(m1), clone(m2)); }));
    }
    await runSaves('a random walk of 40 changes', walk);
    // a shorter chat without trunc: refused, nothing written
    {
      const base = chatOf(500); const f = path.join(dir, 'shrink.json'); fs.writeFileSync(f, JSON.stringify(base, null, 2));
      await T.op({ op: 'chatOpen', file: f, ver: 's0' });
      const before = fs.readFileSync(f, 'utf8');
      const s = shapeRec(base, 's0'); base.messages.length = 300; const d = wholeDelta(base, s); delete d.trunc;
      const res = await T.op({ op: 'chatDelta', file: f, from: 's0', to: 's1', ...d });
      ok(!res.ok && res.why === 'shrink' && fs.readFileSync(f, 'utf8') === before, 'chatDelta: a shorter chat without trunc is refused, nothing written');
      const res2 = await T.op({ op: 'chatDelta', file: f, from: 's0', to: 's1', ...d, trunc: true });
      ok(res2.ok && fs.readFileSync(f, 'utf8') === JSON.stringify(base, null, 2), 'chatDelta: with trunc, the cut chat = a whole save');
    }

    // ---------- withContext's rows from the end = every row joined ----------
    {
      const full2 = chatOf(800); let same = true;
      for (let t = 0; t < 30; t++) {
        const from = int(0, 820);
        const keep = t % 2 ? (m) => m.role !== 'error' && !m.handoffBrief && (m.ctx || m.text) : (m) => m.role !== 'error' && !m.compactSummary && !m.compactReq;
        const old = full2.messages.slice(from, -1).filter(keep).map(N.rowOf).join('\n\n');
        const got = N.tailRows(full2.messages, from, keep);
        const cut = (x) => (x.length > 24000 ? `…${x.slice(-24000)}` : x);
        if (cut(old) !== cut(got) || Boolean(old) !== Boolean(got)) same = false;
      }
      ok(same, 'withContext: the rows read from the end give the same text as joining them all');
    }
  } finally { T.end(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(`chatwindow86-test: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
