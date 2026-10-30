#!/usr/bin/env node
// (round 89, desk89) The Desk's place set in the coming frame, and Export…'s prepare in slices, give the same answers as
// before (made-up data only):
//   · desk-paint-core placer: a place already shown writes nothing; another one is written once, in the coming frame
//     (or after the wait when no frame comes), S.top saying it at once; a newer place or a scroll meanwhile wins
//   · prepslice-core scrubber = ProjBundleCore.scrub (value, key order, count) on bodies full of secrets of every kind
//     ProjBundleCore knows, secret-named keys holding strings / objects / numbers / arrays / null, values past 60 levels,
//     holes in arrays, a "__proto__" key, and 400 random bodies; stopped and resumed after every node too
//   · PrepSlice.prepare = ProjBundleCore.prepare for every choice (chats / files in or out), on a project body and on a
//     Clink-sized one (a 1,600-message chat, ≈ 4 MB); its slices stay small (judged against the box's load:
//     dev/loadwait.js, a slice over budget only by the time the process waited for a CPU is "CAN'T TELL", not a failure)
//   node dev/desk89-test.js
'use strict';
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const D = require(path.join(ROOT, 'desk-paint-core.js'));
const C = require(path.join(ROOT, 'projbundle-core.js'));
const PS = require(path.join(ROOT, 'prepslice-core.js'));
const LW = require('./loadwait');

let passes = 0; let failures = 0; let cantTell = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
const same = (a, b, what) => { try { assert.deepStrictEqual(a, b); ok(JSON.stringify(a) === JSON.stringify(b), `${what} (key order)`); } catch (e) { ok(false, `${what}: ${e.message.slice(0, 400)}`); } };

// ---------- the Desk's place ----------
{
  let frames = []; let timers = [];
  const env = { frame: (fn) => { frames.push(fn); return frames.length; }, clearFrame: (id) => { frames[id - 1] = null; }, timer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: (id) => { timers[id - 1] = null; }, wait: 100 };
  const runFrames = () => { const fs = frames; frames = []; fs.forEach((f) => f && f()); };
  const runTimers = () => { const ts = timers; timers = []; ts.forEach((t) => t && t.fn()); };
  const writes = [];
  const root = { _top: 0, get scrollTop() { return this._top; }, set scrollTop(v) { writes.push(v); this._top = v; } };
  const P = D.placer(env);
  const S = { root, top: undefined };
  ok(P.place(S, 0) === 'kept' && writes.length === 0 && S.top === 0, 'a Desk at the top, asked for the top: nothing written');
  ok(P.place(S, 600) === 'deferred' && writes.length === 0 && S.top === 600, 'another place: S.top says it at once, nothing written yet');
  runFrames();
  ok(writes.join() === '600' && root.scrollTop === 600 && !P.pending(), 'written once, in the coming frame');
  runTimers(); ok(writes.length === 1, 'the fallback timer does not write it again');
  ok(P.place(S, 600) === 'kept' && writes.length === 1, 'the same place again: nothing written');
  P.place(S, 0); P.place(S, 300); runFrames();
  ok(writes.join() === '600,300' && S.top === 300, 'a newer place wins (the older write dropped)');
  P.place(S, 900); S.top = 120; /* a scroll event: the person scrolled */ runFrames();
  ok(writes.join() === '600,300' && S.top === 120, 'a scroll meanwhile wins over the waiting write');
  P.place(S, 50); runTimers(); runFrames();
  ok(writes.join() === '600,300,50' && P.stats.byTimer === 1, 'no frame (a hidden window): written after the wait, once');
  P.place(S, 400); ok(P.place(S, 410, { now: true }) === 'written' && writes.at(-1) === 410 && S.top === 410 && !P.pending(), 'now (a caret going back in a field): written at once, the waiting one dropped'); runFrames(); runTimers(); ok(writes.at(-1) === 410, 'nothing written after it');
  P.place(S, 70); ok(P.flush() && writes.at(-1) === 70 && !P.pending(), 'flush writes a waiting place at once');
  const S2 = { root: { scrollTop: 0 }, top: undefined };
  ok(D.placer(env).place(S2, undefined) === 'kept' && S2.top === 0, 'no place kept (undefined) is the top, as state.scroll || 0 was');
}

// ---------- the scrub, in steps = ProjBundleCore.scrub ----------
const SECRETS = ['sk-ant-api03-AbCdEfGhIjKlMnOpQrStUv', 'sk-proj-AbCdEfGhIjKlMnOpQrStUvWx', 'sk-AbCdEfGhIjKlMnOpQrStUvWxYz', `ghp_${'a'.repeat(36)}`, `gho_${'B'.repeat(36)}`, `github_pat_${'c'.repeat(40)}`, 'xoxb-1234567890-abcdef', `AIza${'d'.repeat(35)}`, 'AKIAABCDEFGHIJKLMNOP', `msy_${'e'.repeat(24)}`, `eyJ${'f'.repeat(24)}.${'g'.repeat(24)}.${'h'.repeat(12)}`];
const KEYS = ['apiKey', 'api_key', 'API-KEYS', 'apikey', 'access_token', 'refreshToken', 'id-token', 'auth_token', 'bearer', 'token', 'secret', 'client_secret', 'password', 'passwd', 'pass', 'Authorization', 'cookie', 'cookies', 'session_key', 'sessionToken', 'session-secret', 'private_key', 'privateKey'];
const scrubBoth = (obj, what, { budget = Infinity } = {}) => {
  const a = C.scrub(obj);
  const s = PS.scrubber(obj); let steps = 0; let t = 0;
  while (!s.step(budget, () => (t += 1))) { steps += 1; if (steps > 1e7) break; }
  const b = s.result();
  same(b.value, a.value, `${what}: the same value`); ok(b.count === a.count, `${what}: the same count (${b.count} vs ${a.count})`);
  return { a, b, steps };
};
{
  const body = {
    project: { name: 'Made up', notes: `keys: ${SECRETS.join(' and ')}`, items: [{ id: 'x', name: SECRETS[0] }] },
    chats: [{ chat: { messages: SECRETS.map((s, i) => ({ role: i % 2 ? 'user' : 'assistant', text: `here: ${s} (twice: ${s})` })) } }],
    scenes: [{ sketch: { code: `const key = '${SECRETS[3]}';` } }],
    settings: Object.fromEntries(KEYS.map((k, i) => [k, i % 3 === 0 ? 'value' : i % 3 === 1 ? { nested: 'x' } : 7])),
    lists: KEYS.map((k) => ({ [k]: ['an', 'array'] })), nulls: Object.fromEntries(KEYS.map((k) => [k, null])),
    notSecret: { keyboard: 'k', passage: 'p', tokens2: 'x', mytoken: 'y', 'sk-short': 'sk-abc' },
  };
  const { a } = scrubBoth(body, 'every secret kind');
  ok(a.count > SECRETS.length * 3, `the scrub found them (${a.count})`);
  const s = PS.scrubber(body); s.step(); const text = JSON.stringify(s.result().value);
  ok(!SECRETS.some((x) => text.includes(x)), 'no secret string is left in the stepped result');
  ok(!/"(apiKey|password|token|Authorization|cookie|private_key)":"/.test(text), 'no secret-named key holding a string is left');
  scrubBoth(body, 'every secret kind, one node per step', { budget: 0 });
}
{
  // deeper than 60 levels: the part past 60 stays as it is (secrets in it too, as ProjBundleCore.scrub does)
  let deep = { leaf: SECRETS[2], token: 'x' }; for (let i = 0; i < 70; i++) deep = i % 2 ? { down: deep, password: 'p' } : [deep, SECRETS[1]];
  scrubBoth(deep, 'past 60 levels'); scrubBoth(deep, 'past 60 levels, stepped', { budget: 0 });
  const holes = [1, , SECRETS[0], , { token: 's' }]; // eslint-disable-line no-sparse-arrays
  const r = scrubBoth({ holes }, 'holes in an array');
  ok(!(1 in r.b.value.holes) && r.b.value.holes.length === 5, 'holes stay holes');
  const proto = JSON.parse(`{"a":1,"__proto__":{"token":"t","x":"${SECRETS[4]}"},"z":[]}`);
  scrubBoth(proto, 'a "__proto__" key (assigned the same way)');
  for (const v of ['plain', SECRETS[5], 3, null, true, [], {}, [SECRETS[6]]]) scrubBoth(v, `the body itself is ${JSON.stringify(v).slice(0, 20)}`);
}
{
  let s = 8901; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const words = ['orb', 'kick', 'shader', 'token', 'note', 'pass', 'key', ...KEYS.slice(0, 6)];
  const val = (d) => { const r = rnd(); if (d > 6 || r < 0.35) return r < 0.1 ? pick(SECRETS) : r < 0.15 ? Math.round(rnd() * 99) : r < 0.18 ? null : r < 0.2 ? false : `${pick(words)} ${rnd() < 0.2 ? pick(SECRETS) : ''} ${pick(words)}`; if (r < 0.6) return Array.from({ length: Math.floor(rnd() * 5) }, () => val(d + 1)); return Object.fromEntries(Array.from({ length: Math.floor(rnd() * 6) }, () => [rnd() < 0.3 ? pick(KEYS) : `${pick(words)}${Math.floor(rnd() * 9)}`, val(d + 1)])); };
  let allSame = true; let found = 0;
  for (let i = 0; i < 400; i++) { const o = val(0); const a = C.scrub(o); const st = PS.scrubber(o); let t = 0; while (!st.step(i % 2 ? 0 : 5, () => (t += 1)));
    const b = st.result(); found += a.count; if (JSON.stringify(a.value) !== JSON.stringify(b.value) || a.count !== b.count) { allSame = false; console.log('differs on', JSON.stringify(o).slice(0, 300)); break; } }
  ok(allSame, '400 random bodies: the same value and count, stepped or not');
  ok(found > 100, `the random bodies held secrets (${found})`);
}

// ---------- the JSON copy, in steps = JSON.parse(JSON.stringify(v)) ----------
const copyBoth = (v, what, budget = Infinity) => {
  let want; let wantErr = null; try { want = JSON.parse(JSON.stringify(v)); } catch (e) { wantErr = e.constructor.name; }
  let got; let gotErr = null; try { const c = PS.copier(v); let t = 0; while (!c.step(budget, () => (t += 1))); got = c.result(); } catch (e) { gotErr = e.constructor.name; }
  if (wantErr || gotErr) { ok(wantErr === gotErr, `${what}: the same failure (${wantErr} / ${gotErr})`); return; }
  same(got, want, what);
  ok(Object.getOwnPropertyNames(got || {}).join() === Object.getOwnPropertyNames(want || {}).join(), `${what}: the same own keys`);
};
{
  class Thing { constructor() { this.a = 1; this.b = undefined; } get c() { return 3; } }
  const odd = { nan: NaN, inf: Infinity, ninf: -Infinity, nz: -0, u: undefined, f() {}, s: Symbol('x'), [Symbol('k')]: 1, d: new Date(1700000000000), bad: new Date(NaN), t: new Thing(), m: new Map([[1, 2]]), set: new Set([1]),
    boxed: [new String('s'), new Number(2), new Boolean(false)], arr: [undefined, () => 1, Symbol('y'), NaN, -0, , 'x'], // eslint-disable-line no-sparse-arrays
    keyed: { toJSON(k) { return `key:${k}`; } }, inArr: [0, 1, { toJSON(k) { return `at ${k}`; } }], gone: { toJSON() { return undefined; } }, nul: Object.create(null), ta: new Uint8Array([1, 2]), re: /x/g, err: new Error('e') };
  Object.defineProperty(odd, 'hidden', { value: 1, enumerable: false });
  Object.defineProperty(odd, 'getter', { get: () => ({ deep: [1, { two: 2 }] }), enumerable: true });
  odd.nul.x = { y: 1 };
  copyBoth(odd, 'odd values'); copyBoth(odd, 'odd values, one node per step', 0);
  copyBoth(JSON.parse('{"a":1,"__proto__":{"b":2},"c":{"__proto__":[1]}}'), '"__proto__" keys');
  let deep = { end: 'x' }; for (let i = 0; i < 20; i++) deep = i % 2 ? { down: deep, n: i } : [deep, i, { k: deep }]; copyBoth(deep, '20 levels (past the split depth)');
  copyBoth({ big: 10n }, 'a BigInt'); const loop = { a: { b: {} } }; loop.a.b.c = loop; copyBoth(loop, 'a loop');
  for (const v of ['s', 3, null, true, [], {}, [1, [2, [3]]], new Date(0)]) copyBoth(v, `the body itself is ${String(v).slice(0, 12)}`);
  let s = 77; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const gen = (d) => { const r = rnd(); if (d > 9 || r < 0.3) return [`w${Math.floor(r * 99)}`, r * 1e6, -0, NaN, null, true, undefined, 'é\ud800"\\'][Math.floor(rnd() * 8)]; if (r < 0.6) { const a = Array.from({ length: Math.floor(rnd() * 6) }, () => gen(d + 1)); if (rnd() < 0.2) delete a[0]; return a; } return Object.fromEntries(Array.from({ length: Math.floor(rnd() * 6) }, (_, i) => [rnd() < 0.05 ? '__proto__' : `k${i}${Math.floor(rnd() * 9)}`, gen(d + 1)])); };
  let all = true; for (let i = 0; i < 300; i++) { const v = { v: gen(0), w: [gen(1)] }; const want = JSON.stringify(JSON.parse(JSON.stringify(v))); const c = PS.copier(v); let t = 0; while (!c.step(i % 3 ? 3 : 0, () => (t += 1))); if (JSON.stringify(c.result()) !== want) { all = false; console.log('copy differs on', JSON.stringify(v).slice(0, 200)); break; } }
  ok(all, '300 random bodies: the same copy, stepped or not');
}

// ---------- prepare, in slices = ProjBundleCore.prepare ----------
const project = (nMsgs, extra = {}) => ({
  project: { id: 'pjx', name: 'Clink (made up)', make: 'mk1', mkName: 'n', trash: [1], notes: `notes ${SECRETS[0]}`, cover: 'file:/a.png', workspace: { chatId: 'c1', sceneId: 's1', apiKey: 'k' },
    items: [{ id: 'c1', type: 'chat', ref: 'c1' }, { id: 's1', type: 'scene', ref: 's1' }, { id: 'file:/a.png', type: 'file', ref: '/a.png' }, { id: 'r1', type: 'render', ref: '/r.mp4' }, { id: 'b1', type: 'board', ref: 'b1' }] },
  scenes: [{ sketch: { id: 's1', layers: [{ id: 'main', code: `const k = '${SECRETS[1]}';\n`.repeat(20) }] }, refs: [{ id: 'r', src: 'C:\\Users\\me\\x.png', path: '/x.png' }] }],
  sequences: [], boards: [{ id: 'b1', notes: [{ text: SECRETS[2] }] }], workbench: { pages: [{ text: 'hi', token: 'tt' }] },
  chats: [{ id: 'c1', chat: { id: 'c1', title: 'long', session: { id: 'sess', password: 'p' }, lastReply: 1, pending: 2,
    messages: Array.from({ length: nMsgs }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', at: 1700000000000 + k, text: k % 97 === 3 ? `use ${SECRETS[k % SECRETS.length]} here` : `${'message words and a code block '.repeat(k % 5 ? 60 : 200)}${k}` })) } }],
  files: [{ path: '/a.png' }, { path: '/r.mp4' }], away: undefined, ...extra,
});
const prepBoth = async (body, opts, what, sliceOpts = {}) => {
  const a = C.prepare(body, opts);
  const b = await PS.prepare(body, opts, sliceOpts);
  same(b.body, a.body, `${what}: the same body`); same(b.leftOut, a.leftOut, `${what}: the same left out`); ok(b.secrets === a.secrets, `${what}: the same secrets count (${b.secrets} vs ${a.secrets})`);
  return { a, b };
};
(async () => {
  for (const chats of [true, false]) for (const files of [true, false]) {
    const { a } = await prepBoth(project(40), { chats, files }, `chats ${chats ? 'in' : 'out'}, files ${files ? 'in' : 'out'}`);
    ok(a.secrets > 0 && !JSON.stringify(a.body).includes(SECRETS[0]), 'secrets counted and gone');
  }
  { let t = 0; let pauses = 0; await prepBoth(project(60), {}, 'one node per slice', { budgetMs: 0, now: () => (t += 1), pause: async () => { pauses += 1; } }); ok(pauses > 3, `many slices (${pauses})`); }
  { const body = project(10); const before = JSON.stringify(body); await PS.prepare(body, { chats: false, files: false }); ok(JSON.stringify(body) === before, 'the body given is not changed'); }
  await prepBoth(project(5, { project: undefined }), {}, 'no project: fails the same way').catch(() => ok(true, 'no project: both fail'));
  { let e1 = null; let e2 = null; try { C.prepare(undefined); } catch (e) { e1 = e.constructor.name; } try { await PS.prepare(undefined); } catch (e) { e2 = e.constructor.name; } ok(e1 && e1 === e2, `undefined: the same failure (${e1} / ${e2})`); }
  // Clink-sized: a 1,600-message chat (≈ 4 MB), in slices on this thread
  {
    const big = project(1600); const stats = {};
    const L0 = LW.snap(); const t0 = Date.now(); const ref = C.prepare(big, {}); const whole = Date.now() - t0;
    const r = await PS.prepare(big, {}, { stats });
    const w = LW.waited(L0, LW.snap());
    same(r.body, ref.body, 'Clink-sized: the same body'); ok(r.secrets === ref.secrets, 'Clink-sized: the same count');
    console.log(`Clink-sized body: ${(JSON.stringify(big).length / 1e6).toFixed(1)} MB · prepare at once ${whole} ms · in slices ${stats.ms} ms in ${stats.slices} slices, the longest ${stats.longestMs} ms`);
    ok(stats.slices >= 3, `in slices (${stats.slices})`);
    // each slice is ≤ 8 ms + one node (a message here)
    const v = LW.judge(stats.longestMs, 20, w);
    if (v === 'load') { cantTell += 1; console.log(`CAN'T TELL the longest slice: ${stats.longestMs} ms > 20 ms, but the process waited ${w.cpuWait} ms for a CPU meanwhile`); } else ok(v === 'ok', `the longest slice ${stats.longestMs} ms ≤ 20 ms`);
  }
  console.log(`${failures ? 'FAILED' : 'ok'}: ${passes} passed, ${failures} failed${cantTell ? `, ${cantTell} can't tell (load)` : ''}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL', e); process.exit(1); });
