#!/usr/bin/env node
// (round 83, idleburst83) How much the recall index costs to build, on the store thread itself (storework.js), over a
// chats folder (default: the heavy profile's, read only): slices of 12 ms as recall-hooks.js asks them, until it has
// caught up; then a SECOND thread (a new start) catching up again, with the index kept on disk (data/.cache) or not.
//   node dev/idleburst83-recall.js [--chats /tmp/hearth-bigprofile72/chats] [--cache <dir>] [--q "what did we decide about the font?"]
// Reports: slices, ms on the thread, wall ms, the index's size, and for the second start the same.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const CHATS = path.resolve(opt('--chats', '/tmp/hearth-bigprofile72/chats'));
const CACHE = path.resolve(opt('--cache', fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-ib83-recall-'))));
const Q = opt('--q', 'what did we decide about the nebula ribbon shader?');

function thread() {
  const w = new Worker(path.join(__dirname, '..', 'storework.js'), { env: { ...process.env, HEARTH_RECALL_CACHE: CACHE } });
  let id = 0; const pending = new Map();
  w.on('message', (m) => { const p = pending.get(m.id); if (p) { pending.delete(m.id); p(m); } });
  const ask = (msg) => new Promise((r) => { const i = ++id; pending.set(i, r); w.postMessage({ ...msg, id: i }); });
  return { ask, end: () => w.terminate() };
}

async function catchUp(label) {
  const t = thread();
  const t0 = performance.now(); let slices = 0; let ms = 0; let worst = 0; let r = null;
  for (;;) {
    const m = await t.ask({ op: 'recall', dir: CHATS, budgetMs: 12 });
    if (m.err) throw new Error(m.err);
    slices += 1; ms += m.ms; worst = Math.max(worst, m.ms); r = m.res;
    if (!r.left) break;
    if (slices % 500 === 0) console.log(`  … ${slices} slices, ${Math.round(ms)} ms, left ${r.left}, ${r.chats} chats in`);
  }
  const q = await t.ask({ op: 'recall', dir: CHATS, q: Q, budgetMs: 250 });
  console.log(`${label}: ${slices} slices · ${Math.round(ms)} ms on the thread (worst slice ${Math.round(worst)} ms) · ${Math.round(performance.now() - t0)} ms wall · ${r.chats} chats, ${r.messages} messages, ${r.terms} terms · a question: ${q.res?.decisions?.length ?? "?"} decisions / ${q.res?.mentions?.length ?? "?"} mentions in ${Math.round(q.ms)} ms · top: ${JSON.stringify((q.res?.decisions?.[0] || q.res?.mentions?.[0] || {}).snippet || "").slice(0, 80)}`);
  await new Promise((res) => setTimeout(res, 7000)); // (a snapshot is written ≈ 4 s after catching up)
  await t.end();
  return { slices, ms };
}

(async () => {
  console.log(`chats ${CHATS} · index cache ${CACHE}`);
  await catchUp('first start (nothing kept)');
  await catchUp('next start');
  if (!opt('--cache')) fs.rmSync(CACHE, { recursive: true, force: true });
})().catch((err) => { console.error(err); process.exit(1); });
