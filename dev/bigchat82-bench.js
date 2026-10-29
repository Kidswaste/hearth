#!/usr/bin/env node
// (round 82, bigchat82) every path that touches a GIANT chat, measured (Node, the real modules, the store thread as a
// real worker): Find in this project's index slices, recall's index slices, the chats list / search after the giant
// chat changed, a new message saved (window → main → store thread), opening it (main), sync (hash, push, pull, merge),
// Earlier versions. Run on a copy made by `node dev/bigprofile.js <dir> --projects 6 --giant 1` (made here if missing).
//   node dev/bigchat82-bench.js [--dir <dir>] [--out file.json] [--only a,b]
// Reports, per path: the longest piece of work that held one thread (main / store thread / sync thread) and the total.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const v8 = require('v8');
const { Worker } = require('worker_threads');
const ROOT = path.join(__dirname, '..');
const a = process.argv.slice(2);
const arg = (n, d) => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : d; };
const DIR = arg('--dir', path.join(os.tmpdir(), 'hearth-bigchat82'));
const ONLY = arg('--only', '') ? new Set(arg('--only').split(',')) : null;
const want = (k) => !ONLY || ONLY.has(k);
const r1 = (x) => Math.round(x * 10) / 10;
const out = { at: new Date().toISOString(), load: os.loadavg()[0] };

if (!fs.existsSync(path.join(DIR, 'chats', 'claude-giant0.json'))) {
  fs.rmSync(DIR, { recursive: true, force: true });
  require('./bigprofile').bigprofile(DIR, { chats: 60, long: 6, projects: 6, giant: 1 });
}
const CHATS = path.join(DIR, 'chats'); const KV = path.join(DIR, 'kv');
const GIANT = path.join(CHATS, 'claude-giant0.json');
const SIZE = fs.statSync(GIANT).size;
out.giant = { mb: r1(SIZE / 1e6) };

// the store thread, as store.js starts it
function thread() {
  const w = new Worker(path.join(ROOT, 'storework.js'));
  let seq = 0; const jobs = new Map();
  w.on('message', ({ id, res, err, ms }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve({ res, ms }); });
  return { op: (msg) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); }), end: () => w.terminate() };
}
// the longest stretch the main thread was held (a 1 ms ticker's longest gap) while fn runs
async function held(fn) {
  let last = performance.now(); let gap = 0;
  const t = setInterval(() => { const n = performance.now(); gap = Math.max(gap, n - last); last = n; }, 1);
  const t0 = performance.now();
  const r = await fn();
  const total = performance.now() - t0;
  await new Promise((res) => setTimeout(res, 3));
  clearInterval(t);
  return { r, longest: r1(Math.max(gap, 0)), total: r1(total) };
}
const time = (fn) => { const t0 = performance.now(); const r = fn(); return { r, ms: r1(performance.now() - t0) }; };
const median = (xs) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const pct = (xs, q) => { const s = [...xs].sort((x, y) => x - y); return r1(s[Math.min(s.length - 1, Math.floor(s.length * q))]); };

(async () => {
  const giant = JSON.parse(fs.readFileSync(GIANT, 'utf8'));
  out.giant.messages = giant.messages.length;
  const pj = JSON.parse(fs.readFileSync(path.join(KV, 'projects.json'), 'utf8'));
  const p0 = pj.list[0];
  const spec = { pid: p0.id, chats: p0.items.filter((x) => x.type === 'chat').map((x) => x.ref), scenes: p0.items.filter((x) => x.type === 'scene').map((x) => x.ref), boards: p0.items.filter((x) => x.type === 'board').map((x) => x.ref), notes: p0.notes, description: '', items: [] };

  // ---------- Find in this project: the index built in slices ----------
  if (want('projfind')) {
    const T = thread(); const slices = [];
    let left = 1; let n = 0;
    while (left && n < 2000) { const { res, ms } = await T.op({ op: 'projfind', spec, dirs: { chats: CHATS, kv: KV }, budgetMs: 12 }); slices.push(ms); left = res.left; n += 1; }
    const q = await T.op({ op: 'projfind', spec, dirs: { chats: CHATS, kv: KV }, q: 'portal shader', budgetMs: 12 });
    out.projfind = { slices: slices.length, p95Slice: pct(slices, 0.95), longestSlice: r1(Math.max(...slices)), totalMs: r1(slices.reduce((x, y) => x + y, 0)), queryMs: r1(q.ms), hits: q.res.total };
    await T.end();
  }
  // ---------- recall (and app search's chat part): the index built in slices ----------
  if (want('recall')) {
    const T = thread(); const slices = [];
    await T.op({ op: 'list', dir: CHATS }); // (as in the app: the chats list is read at start, long before recall's first slice)
    let left = 1; let n = 0;
    while (left && n < 2000) { const { res, ms } = await T.op({ op: 'recall', dir: CHATS, budgetMs: 12 }); slices.push(ms); left = res.left; n += 1; }
    const q = await T.op({ op: 'recall', dir: CHATS, q: 'what did we decide about the portal shader?', budgetMs: 40, limit: 6 });
    out.recall = { slices: slices.length, p95Slice: pct(slices, 0.95), longestSlice: r1(Math.max(...slices)), totalMs: r1(slices.reduce((x, y) => x + y, 0)), queryMs: r1(q.ms) };
    await T.end();
  }
  // ---------- the chats list after the giant chat changed (sync brought a new version) ----------
  if (want('list')) {
    const T = thread();
    await T.op({ op: 'list', dir: CHATS });
    const now = new Date(); fs.utimesSync(GIANT, now, now);
    const { ms } = await T.op({ op: 'list', dir: CHATS });
    const s = await T.op({ op: 'search', dir: CHATS, query: 'portal shader' });
    const s2 = await T.op({ op: 'search', dir: CHATS, query: 'neon glass' });
    out.list = { listAfterChangeMs: r1(ms), searchMs: r1(s.ms), searchAgainMs: r1(s2.ms) };
    await T.end();
  }
  // ---------- a new message saved ----------
  if (want('save')) {
    const chat = JSON.parse(JSON.stringify(giant));
    chat.messages.push({ role: 'user', text: 'one more thing about the portal?', at: Date.now() });
    const ser = []; const de = [];
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); const b = v8.serialize(chat); const t1 = performance.now(); v8.deserialize(b); ser.push(t1 - t0); de.push(performance.now() - t1); }
    const T = thread();
    const w = await T.op({ op: 'write', file: path.join(os.tmpdir(), 'bigchat82-save.json'), value: chat, chatDir: true });
    out.save = { window_ipcSendMs: r1(median(ser)), main_ipcReceiveMs: r1(median(de)), main_toThreadMs: r1(median(ser)), main_totalMs: r1(median(de) + median(ser)), threadWriteMs: r1(w.ms) };
    if (fs.existsSync(path.join(ROOT, 'bigchat-core.js'))) out.save.note = 'whole save (the path a chat without a delta takes)';
    await T.end();
  }
  // ---------- opening it (main: read + parse, then the reply to the window) ----------
  if (want('open')) {
    const DS = require(path.join(ROOT, 'datasafe-core.js'));
    const rd = []; const sr = [];
    for (let i = 0; i < 3; i++) { const t0 = performance.now(); const v = DS.load(fs, GIANT, null).value; const t1 = performance.now(); v8.serialize(v); sr.push(performance.now() - t1); rd.push(t1 - t0); }
    out.open = { main_readParseMs: r1(median(rd)), main_ipcReplyMs: r1(median(sr)), main_totalMs: r1(median(rd) + median(sr)) };
  }
  // ---------- sync ----------
  if (want('sync')) {
    const S = require(path.join(ROOT, 'sync-merge.js'));
    const cloudRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bigchat82-cloud-'));
    const ctx = { dataDir: DIR, cloudRoot, home: os.homedir(), win: false };
    const base = giant;
    const ours = { ...giant, updatedAt: giant.updatedAt + 1, messages: [...giant.messages, { role: 'user', text: 'from this computer', at: giant.updatedAt + 1000 }] };
    const theirs = { ...giant, updatedAt: giant.updatedAt + 2, messages: [...giant.messages, { role: 'user', text: 'from the other computer', at: giant.updatedAt + 2000 }] };
    const baseFile = path.join(cloudRoot, 'base.json'); const localFile = path.join(cloudRoot, 'local.json'); const cloudFile = path.join(cloudRoot, 'cloud.json');
    const canon = (v) => JSON.stringify(S.toCloud(v, ctx));
    fs.writeFileSync(baseFile, canon(base)); fs.writeFileSync(localFile, JSON.stringify(ours, null, 2)); fs.writeFileSync(cloudFile, JSON.stringify(S.toCloud(theirs, ctx)));
    const sha = (t) => require('crypto').createHash('sha1').update(t).digest('hex');
    const T = thread();
    const h1 = await T.op({ op: 'syncHash', file: localFile, rel: 'chats/claude-giant0.json', cloud: false, ctx });
    const h2 = await T.op({ op: 'syncHash', file: cloudFile, rel: 'chats/claude-giant0.json', cloud: true, ctx: null });
    const lh = h1.res.h; const ch = h2.res.h;
    // push: the engine's localText (main) when the store thread's text was too big to hand back
    const push = time(() => canon(S.parseJson(fs.readFileSync(localFile, 'utf8'))));
    const m = await T.op({ op: 'syncMerge', rel: 'chats/claude-giant0.json', localFile, cloudFile, baseFile, ctx, lh, ch, counters: false, keepAll: false });
    const mainWrites = time(() => { Buffer.from(String(m.res.text)); if (m.res.localOut) Buffer.from(String(m.res.localOut)); });
    const p = await T.op({ op: 'syncPull', rel: 'chats/claude-giant0.json', cloudFile, h: ch, ctx, localFile, recovery: null, aside: null });
    out.sync = { hashLocalMs: r1(h1.ms), hashCloudMs: r1(h2.ms), push_mainMs: push.ms, mergeThreadMs: r1(m.ms), merge_mainWritesMs: mainWrites.ms, mergeOk: Boolean(m.res && !m.res.stale), merged: m.res?.text ? JSON.parse(String(m.res.text)).messages.length : null, pullThreadMs: r1(p.ms), pullOk: Boolean(p.res && !p.res.stale) };
    out.sync.mergeSame = m.res?.text ? sha(String(m.res.text)) === sha(JSON.stringify(S.merge3(S.toCloud(base, ctx), S.toCloud(ours, ctx), S.toCloud(theirs, ctx)).value)) : null;
    await T.end();
    fs.rmSync(cloudRoot, { recursive: true, force: true });
  }
  // ---------- Earlier versions (versionsmain.js: list) ----------
  if (want('versions')) {
    const V = require(path.join(ROOT, 'versionsmain.js'));
    const S = require(path.join(ROOT, 'sync-merge.js'));
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigchat82-state-'));
    const ctx = { dataDir: DIR, cloudRoot: stateDir, home: os.homedir(), win: false };
    const bdir = path.join(stateDir, 'base', 'chats'); fs.mkdirSync(bdir, { recursive: true });
    fs.writeFileSync(path.join(bdir, 'claude-giant0.json'), JSON.stringify(S.toCloud({ ...giant, messages: giant.messages.slice(0, -10) }, ctx)));
    fs.writeFileSync(path.join(bdir, 'claude-giant0.json.prev'), JSON.stringify(S.toCloud({ ...giant, messages: giant.messages.slice(0, -30) }, ctx)));
    const inst = V.create({ dataDir: DIR, stateDir, ctx: () => ctx, here: 'this computer' });
    const r = await held(() => inst.list({ kind: 'chat', id: 'claude-giant0' }));
    out.versions = { main_longestMs: r.longest, totalMs: r.total, versions: r.r.versions.length, summaries: r.r.versions.map((x) => x.summary) };
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
  const json = JSON.stringify(out, null, 2);
  console.log(json);
  const f = arg('--out'); if (f) fs.writeFileSync(f, json);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
