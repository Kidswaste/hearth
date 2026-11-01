#!/usr/bin/env node
// (round 101, chatsave101) What saving a NORMAL long chat costs, piece by piece (Node, the real modules): the whole way
// (the window's structured clone → the main process → the store thread → JSON.stringify + hash + write) against the way
// giant chats already save (native.js's shape compare → a small change → storework.js chatDelta). The chat is a copy of
// a long chat of the heavy profile (dev/bigprofile.js, made up with a fixed seed: /tmp/hearth-bigprofile72), or --file.
//   node --expose-gc dev/chatsave101-bench.js [--file <chat.json>] [--n 30]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const v8 = require('v8');
const crypto = require('crypto');
const { Worker } = require('worker_threads');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const N = Number(opt('--n', 30));
const PROFILE = '/tmp/hearth-bigprofile72/chats';
function pick() {
  const f = opt('--file');
  if (f) return f;
  if (!fs.existsSync(PROFILE)) { console.error(`no ${PROFILE}: node dev/bigprofile.js /tmp/hearth-bigprofile72 (as run-checks makes it), or --file`); process.exit(2); }
  // the long chat closest to perf100's (778 messages, ≈ 600 KB)
  let best = null;
  for (const n of fs.readdirSync(PROFILE)) {
    if (!/^claude-long\d+\.json$/.test(n)) continue;
    const s = fs.statSync(path.join(PROFILE, n)).size;
    if (s < 8e6 && (!best || Math.abs(s - 560e3) < Math.abs(best.s - 560e3))) best = { n, s };
  }
  return path.join(PROFILE, best.n);
}
const NATIVE = fs.readFileSync(path.join(ROOT, 'native.js'), 'utf8');
const piece = (start) => { const i = NATIVE.indexOf(start); if (i < 0) throw new Error(`native.js: ${start}`); let d = 0; for (let j = NATIVE.indexOf('{', i); j < NATIVE.length; j++) { if (NATIVE[j] === '{') d++; else if (NATIVE[j] === '}' && --d === 0) return NATIVE.slice(i, j + 1); } throw new Error(start); };
const line = (start) => { const i = NATIVE.indexOf(start); return NATIVE.slice(i, NATIVE.indexOf('\n', i)); };
// (in this realm: run in a vm context, every object crossing realms made the compare ≈ 25× slower than in the window)
// eslint-disable-next-line no-new-func
const W = new Function(`${line('const shapeOf = (v) =>')}\n${piece('function sameShape(sh, v)')}\nreturn { shapeOf, sameShape };`)();
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const time = (fn) => { const t = performance.now(); fn(); return performance.now() - t; };
const runs = (fn) => { const out = []; for (let i = 0; i < N; i++) out.push(time(fn)); return med(out); };

(async () => {
  const src = pick();
  const chat = JSON.parse(fs.readFileSync(src, 'utf8'));
  const text0 = JSON.stringify(chat, null, 2);
  console.log(`chat: ${path.basename(src)} · ${chat.messages.length} messages · ${(text0.length / 1024).toFixed(0)} KB`);
  // ---- the whole way (as Electron's IPC: the structured clone serializer = v8.serialize) ----
  let ser = null; let de = null;
  const r = {
    'window: structured clone out (IPC send)': runs(() => { ser = v8.serialize(chat); }),
    'main: structured clone in (IPC receive)': runs(() => { de = v8.deserialize(ser); }),
    'main: to the store thread (postMessage out)': runs(() => { v8.serialize(de); }),
    'thread: in (postMessage receive)': runs(() => { v8.deserialize(ser); }),
    'thread: JSON.stringify (pretty)': runs(() => { JSON.stringify(de, null, 2); }),
    'thread: sha1 of the text': runs(() => { crypto.createHash('sha1').update(text0).digest('hex'); }),
  };
  // ---- by change: the window's side ----
  let sh = null;
  r['window: shape made (once, after a whole save)'] = runs(() => { sh = chat.messages.map(W.shapeOf); });
  r['window: shape compare (each save)'] = runs(() => { for (let k = 0; k < chat.messages.length; k++) W.sameShape(sh[k], chat.messages[k]); });
  const msg = { role: 'assistant', text: 'x'.repeat(1200), at: Date.now(), usage: { input: 1000, output: 300 } };
  const d = { id: chat.id, from: 'a', to: 'b', keys: Object.keys(chat), set: { updatedAt: Date.now() }, n: chat.messages.length + 1, msgs: [[chat.messages.length, msg]], trunc: false };
  r['window → main → thread: the change (×2 clone)'] = runs(() => { v8.deserialize(v8.serialize(v8.deserialize(v8.serialize(d)))); });
  // memory the shapes hold
  sh = null; global.gc?.(); global.gc?.(); const h0 = process.memoryUsage().heapUsed; const keep = Array.from({ length: 20 }, () => chat.messages.map(W.shapeOf)); global.gc?.(); global.gc?.(); const h1 = process.memoryUsage().heapUsed;
  r['window: shapes held (KB, per chat; the strings are shared)'] = (h1 - h0) / 1024 / keep.length; keep.length = 0; sh = chat.messages.map(W.shapeOf);
  // ---- by change: the store thread's side (real storework.js) ----
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs101b-'));
  const file = path.join(dir, 'c.json');
  const w = new Worker(path.join(ROOT, 'storework.js'), { workerData: { deltaSab: new SharedArrayBuffer(4) } });
  let seq = 0; const jobs = new Map();
  w.on('message', ({ id, res, err }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  const opT = async (m) => { const t = performance.now(); const x = await new Promise((ok, no) => { const id = ++seq; jobs.set(id, { resolve: ok, reject: no }); w.postMessage({ ...m, id }); }); return [performance.now() - t, x]; };
  const whole = []; const firstD = []; const nextD = [];
  for (let i = 0; i < Math.min(N, 12); i++) {
    const c = JSON.parse(text0); c.updatedAt = Date.now() + i;
    const [tw] = await opT({ op: 'write', file, value: c, chatDir: true, chatVer: `v${i}a` }); whole.push(tw);
    c.messages.push({ ...msg, at: i }); c.updatedAt += 1;
    const [t1, a] = await opT({ op: 'chatDelta', file, from: `v${i}a`, to: `v${i}b`, keys: Object.keys(c), set: { updatedAt: c.updatedAt }, n: c.messages.length, msgs: [[c.messages.length - 1, c.messages[c.messages.length - 1]]] });
    if (!a.ok) throw new Error(`delta refused: ${a.why}`);
    c.messages.push({ ...msg, at: -i }); c.updatedAt += 1;
    const [t2, b] = await opT({ op: 'chatDelta', file, from: `v${i}b`, to: `v${i}c`, keys: Object.keys(c), set: { updatedAt: c.updatedAt }, n: c.messages.length, msgs: [[c.messages.length - 1, c.messages[c.messages.length - 1]]] });
    if (!b.ok) throw new Error(`delta refused: ${b.why}`);
    if (fs.readFileSync(file, 'utf8') !== JSON.stringify(c, null, 2)) throw new Error('not byte for byte');
    firstD.push(t1); nextD.push(t2);
  }
  r['thread: whole write op (round trip, incl. clone + fsync)'] = med(whole);
  r['thread: first change after a whole save (cut + write + fsync)'] = med(firstD);
  r['thread: next change (copy + write + fsync)'] = med(nextD);
  await w.terminate(); fs.rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of Object.entries(r)) console.log(`${k.padEnd(62)} ${v.toFixed(2)}`);
})().catch((err) => { console.error(err); process.exit(2); });
