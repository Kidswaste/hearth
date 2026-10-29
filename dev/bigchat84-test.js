#!/usr/bin/env node
// (round 84, bigchat84) a giant chat's open, export and restore, each checked against the way before:
//   · open: chatparse-worker.js sends the chat in slices (its end first); put together as native.js does, it is the
//     chat JSON.parse gives (same values, same key order)
//   · export: chatexport-core.js's pieces joined = JSON.stringify({ ...chat, session: undefined, hearthExport: 1 }, null, 2),
//     Native.chatMarkdown, its plain text and chat-cmds' web page, byte for byte (awkward texts, empty / missing lists)
//   · restore (storework.js chatRestore, versionsmain.js restoreBig): the chat file and the copy kept before it as the
//     main-process way writes them (versions-core restoreValue), the Undo as undoOnto makes it, a chat that can't be
//     read → nothing written (never "no chat"), a version gone → nothing written
//   · Trash / Deleted things (storework.js chatHead): the same titles and counts as from the whole chats
//   node dev/bigchat84-test.js [--bench]      (--bench: times on /tmp/hearth-bigchat84's giant chat, made if missing)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { Worker } = require('worker_threads');
const ROOT = path.join(__dirname, '..');
process.env.HEARTH_BIGCHAT_MIN = '20000';
const CE = require(path.join(ROOT, 'chatexport-core.js'));
const VC = require(path.join(ROOT, 'versions-core.js'));
const SM = require(path.join(ROOT, 'sync-merge.js'));
const V = require(path.join(ROOT, 'versionsmain.js'));

let passes = 0; let failures = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
let seed = 84;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WORDS = ['orb', 'café', '日本語', '🔥', 'quote"inside', 'back\\slash', 'line\nbreak', '**bold**', '__u__', '`code`', '\n```js\nx()\n```\n', 'tab\there', 'ctrl\u0001x', ' sep', 'lone\ud800x', '<b>&amp;</b>', '* list', '# head'];
const str = () => Array.from({ length: int(0, 14) }, () => pick(WORDS)).join(' ');
function message(k) {
  const m = { role: pick(['user', 'assistant', 'assistant', 'opinion', 'error']), text: str(), at: 1.7e12 + k * 6e4 };
  if (m.role === 'opinion') m.from = pick(['Astra', 'Claude']);
  if (rnd() < 0.3) m.thinking = str();
  if (rnd() < 0.2) m.tools = [{ name: 'Read', input: { path: '/a/b.js' } }];
  if (rnd() < 0.1) m.attachments = [{ kind: 'image', name: 'a.png' }];
  if (rnd() < 0.05) m.nested = { list: [1, [2, { x: null }], []], empty: {} };
  return m;
}
function chatOf(n, extra = {}) { return { id: 'c1', agentId: 'claude', title: `A chat ${str().slice(0, 30)}`, createdAt: 1.7e12, updatedAt: 1.71e12, model: 'x', session: { id: 's1' }, ...extra, messages: Array.from({ length: n }, (_, k) => message(k)) }; }

// ---------- export ----------
function chatMarkdown(chat, agent) { // native.js chatMarkdown (agent: { name } | null), fmtDate as given
  return `# ${chat.title}\n\n_${agent?.name || chat.agentId} · ${chat.createdAt}_\n\n${chat.messages.filter((m) => m.role !== 'error')
    .map((m) => `**${m.role === 'user' ? 'You' : m.role === 'opinion' ? `${m.from} (second opinion)` : agent?.name || 'Assistant'}:**\n\n${m.text}`).join('\n\n---\n\n')}\n`;
}
const join = (g) => [...g].join('');
async function exportTests(chats) {
  for (const [k, chat] of chats.entries()) {
    const want = JSON.stringify({ ...chat, session: undefined, hearthExport: 1 }, null, 2);
    ok(join(CE.json(chat)) === want, `export json #${k} (${chat.messages?.length} messages)`);
    if (!Array.isArray(chat.messages) || chat.messages.some((m) => !m)) continue; // (a null message: the old ways throw too; JSON only)
    for (const agent of [{ name: 'Claude' }, null]) {
      const o = { name: agent?.name, agentName: agent?.name, date: chat.createdAt };
      const md = chatMarkdown(chat, agent);
      ok(join(CE.md(chat, o)) === md, `export md #${k}`);
      ok(join(CE.txt(chat, o)) === md.replace(/\*\*|__|`/g, ''), `export txt #${k}`);
    }
    const row = (m) => `<section>${m.role}:${m.text}</section>`;
    ok(join(CE.html(chat, { head: '<h1>t</h1>\n', row: (m) => row(m) })) === `<h1>t</h1>\n${chat.messages.filter((m) => m.role !== 'error').map(row).join('\n')}\n`, `export html #${k}`);
    const parts = []; const n = await CE.pump(CE.json(chat), (t) => { parts.push(t); }, { part: 3000, slice: 1 });
    ok(parts.join('') === want && n === want.length && (want.length < 6000 || parts.length > 1), `pump in parts #${k} (${parts.length})`);
  }
}

// ---------- open: the parse worker's slices ----------
function parseSlices(chat, { chunk = 4000, tail = 0 } = {}) {
  const src = fs.readFileSync(path.join(ROOT, 'chatparse-worker.js'), 'utf8');
  const posts = []; const self = { postMessage: (d) => posts.push(structuredClone(d)) };
  vm.runInNewContext(src, { self, TextDecoder, Uint8Array, JSON, Math, Object, Array, String });
  self.onmessage({ data: { id: 1, parts: [new TextEncoder().encode(JSON.stringify(chat, null, 2))], chunk, tail } });
  // as native.js parseOff puts them together
  let out = null; let got = null; let done = 0;
  for (const d of posts) {
    if (d.head) { out = d.head; got = []; } else if (d.msgs) got.push(d); else if ('chat' in d) out = d.chat;
    if (d.done) { done += 1; if (got) for (const g of got.sort((a, b) => a.from - b.from)) for (const m of g.msgs) out.messages.push(m); }
  }
  return { out, posts: posts.length, done, firstFrom: posts.find((p) => p.msgs)?.from };
}

// ---------- the store thread ----------
function thread() {
  const w = new Worker(path.join(ROOT, 'storework.js'));
  let seq = 0; const jobs = new Map();
  w.on('message', ({ id, res, err }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  return { op: (msg) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); }), end: () => w.terminate() };
}

async function storeTests() {
  const T = thread();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigchat84-'));
  try {
    const W = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
    const big = chatOf(300, { id: 'giant' }); const small = chatOf(3, { id: 'small' });
    const fb = path.join(dir, 'giant.json'); W(fb, JSON.stringify(big, null, 2));
    const fs1 = path.join(dir, 'small.json'); W(fs1, JSON.stringify(small, null, 2));
    // chatHead
    for (const [f, c] of [[fb, big], [fs1, small]]) {
      const h = await T.op({ op: 'chatHead', file: f });
      ok(h.head?.title === c.title && h.head.id === c.id && h.head.agentId === c.agentId && h.head.updatedAt === c.updatedAt && h.n === c.messages.length && h.messages, `chatHead ${c.id}`);
    }
    W(path.join(dir, 'bad.json'), '{"title": "x", "messages": [{"text": "a"},');
    ok((await T.op({ op: 'chatHead', file: path.join(dir, 'bad.json') })).error, 'chatHead: a damaged file says so');
    ok((await T.op({ op: 'chatHead', file: path.join(dir, 'none.json') })).error === 'ENOENT', 'chatHead: a missing file says so');
    W(path.join(dir, 'compact.json'), JSON.stringify(big));
    const hc = await T.op({ op: 'chatHead', file: path.join(dir, 'compact.json') });
    ok(hc.n === 300 && hc.head.title === big.title, 'chatHead: a compact file');

    // chatRestore vs the main-process way (versions-core restoreValue, JSON.stringify(…, null, 2))
    const version = { ...structuredClone(big), messages: big.messages.slice(0, 290), title: 'Older title', updatedAt: 5 };
    const vf = path.join(dir, 'v.json'); W(vf, JSON.stringify(version, null, 2));
    const cases = [
      ['plain', { file: vf }, null],
      ['wrapped', { file: path.join(dir, 'w.json'), wrapped: true }, () => W(path.join(dir, 'w.json'), JSON.stringify({ v: 1, kind: 'chat', id: 'giant', at: 1, machine: 'x', thing: version }))],
      ['same texts (session kept)', { file: path.join(dir, 's.json') }, () => W(path.join(dir, 's.json'), JSON.stringify({ ...structuredClone(big), title: 'T', session: { id: 'old' }, deletedAt: 3 }))],
    ];
    for (const [name, src, prep] of cases) {
      prep?.();
      const cf = path.join(dir, `cur-${cases.indexOf(cases.find((c) => c[0] === name))}.json`); W(cf, JSON.stringify(big, null, 2));
      const keep = path.join(dir, 'kept', `${name}.json`);
      const r = await T.op({ op: 'chatRestore', file: cf, src, keep: { file: keep, id: 'giant', machine: 'this PC' }, at: 777 });
      let ver = SM.parseJson(fs.readFileSync(src.file, 'utf8')); if (src.wrapped) ver = ver.thing;
      const want = JSON.stringify(VC.restoreValue('chat', ver, big, 777), null, 2);
      ok(r.ok && r.kept && fs.readFileSync(cf, 'utf8') === want, `chatRestore ${name}: the chat as the main-process way writes it`);
      const k = JSON.parse(fs.readFileSync(keep, 'utf8'));
      ok(JSON.stringify(k) === JSON.stringify({ v: 1, kind: 'chat', id: 'giant', at: 777, machine: 'this PC', thing: big }), `chatRestore ${name}: the copy kept before`);
    }
    // an Undo: undoOnto(over: as the restore left it, target: what it replaced, cur: now with a new message)
    {
      const cf = path.join(dir, 'u.json'); W(cf, JSON.stringify(big, null, 2));
      const keep = path.join(dir, 'kept', 'u.json');
      await T.op({ op: 'chatRestore', file: cf, src: { file: vf }, keep: { file: keep, id: 'giant', machine: 'x' }, at: 800 });
      const after = JSON.parse(fs.readFileSync(cf, 'utf8')); after.messages.push({ role: 'user', text: 'new after the restore', at: 9 });
      W(cf, JSON.stringify(after, null, 2));
      const over = VC.restoreValue('chat', version, big, 800);
      const keep2 = path.join(dir, 'kept', 'u2.json');
      const r = await T.op({ op: 'chatRestore', file: cf, src: { file: keep, wrapped: true }, keep: { file: keep2, id: 'giant', machine: 'x' }, at: 900, over: { src: { file: vf }, before: keep, at: 800 } });
      const target = SM.merge3(JSON.parse(JSON.stringify(over)), JSON.parse(JSON.stringify(big)), JSON.parse(JSON.stringify(after))).value;
      const want = JSON.stringify(VC.restoreValue('chat', target, after, 900), null, 2);
      const got = fs.readFileSync(cf, 'utf8');
      ok(r.ok && got === want, 'chatRestore Undo: = undoOnto then restoreValue');
      ok(JSON.parse(got).messages.some((m) => m.text === 'new after the restore') && JSON.parse(got).messages.length === 301, 'chatRestore Undo: what came after the restore stays');
    }
    // refusals: nothing written, nothing kept
    {
      const cf = path.join(dir, 'held.json'); W(cf, '{"id": "giant", "messages": [ {"te'); const before = fs.readFileSync(cf, 'utf8');
      const keep = path.join(dir, 'kept', 'held.json');
      const r = await T.op({ op: 'chatRestore', file: cf, src: { file: vf }, keep: { file: keep, id: 'giant', machine: 'x' }, at: 1 });
      ok(!r.ok && r.code === 'EHELD' && fs.readFileSync(cf, 'utf8') === before && !fs.existsSync(keep), 'chatRestore: a chat that can\'t be read → nothing done (never "no chat")');
      const cf2 = path.join(dir, 'gone.json'); W(cf2, JSON.stringify(big, null, 2));
      const r2 = await T.op({ op: 'chatRestore', file: cf2, src: { file: path.join(dir, 'nope.json') }, keep: { file: path.join(dir, 'kept', 'g.json'), id: 'giant', machine: 'x' }, at: 1 });
      ok(!r2.ok && fs.readFileSync(cf2, 'utf8') === JSON.stringify(big, null, 2) && !fs.existsSync(path.join(dir, 'kept', 'g.json')), 'chatRestore: a version gone → nothing done');
      const cf3 = path.join(dir, 'new.json');
      const r3 = await T.op({ op: 'chatRestore', file: cf3, src: { file: vf }, keep: { file: path.join(dir, 'kept', 'n.json'), id: 'giant', machine: 'x' }, at: 5 });
      ok(r3.ok && !r3.kept && fs.readFileSync(cf3, 'utf8') === JSON.stringify(VC.restoreValue('chat', version, null, 5), null, 2), 'chatRestore: no chat there → the version, nothing kept');
    }

    // versionsmain: the store-thread way vs the main-process way, on two copies of one data folder
    const mk = (name) => {
      const dataDir = path.join(dir, name);
      W(path.join(dataDir, 'chats', 'giant.json'), JSON.stringify(big, null, 2));
      W(path.join(dataDir, '.versions', 'chat-giant', '2026-10-01T12-00-00-n0-before.json'), JSON.stringify({ v: 1, kind: 'chat', id: 'giant', at: 1, machine: 'here', thing: version }));
      W(path.join(dataDir, 'trash', 'gone1.json'), JSON.stringify({ ...big, id: 'gone1', title: 'Deleted one' }, null, 2));
      W(path.join(dataDir, 'trash', 'gone2.json'), JSON.stringify({ ...small, id: 'gone2' }, null, 2));
      return { dataDir, stateDir: path.join(dataDir, 'sync'), here: 'this computer', now: () => 1e13 };
    };
    const writeChat = (dataDir) => async (c) => { fs.writeFileSync(path.join(dataDir, 'chats', `${c.id}.json`), JSON.stringify(c, null, 2)); };
    const ba = mk('a'); const bb = mk('b');
    const oldV = V.create({ ...ba, writeChat: writeChat(ba.dataDir) });
    const newV = V.create({ ...bb, writeChat: writeChat(bb.dataDir), digest: (a) => T.op({ op: 'chatDigest', ...a }), chatRestore: (a) => T.op({ op: 'chatRestore', file: path.join(bb.dataDir, 'chats', `${a.id}.json`), ...a }), chatHead: (f) => T.op({ op: 'chatHead', file: f }) });
    const S = { kind: 'chat', id: 'giant' };
    const la = await oldV.list(S); const lb = await newV.list(S);
    const ea = la.versions.find((e) => e.src === 'before'); const eb = lb.versions.find((e) => e.src === 'before');
    const ra = await oldV.restore(S, ea.token); const rb = await newV.restore(S, eb.token);
    const ca = fs.readFileSync(path.join(ba.dataDir, 'chats', 'giant.json'), 'utf8'); const cb = fs.readFileSync(path.join(bb.dataDir, 'chats', 'giant.json'), 'utf8');
    ok(ra.ok && rb.ok && rb.big && ca === cb, 'versions restore: the same chat file both ways');
    ok(rb.value?.__bigOver && !Array.isArray(rb.value?.messages) && rb.name === ra.name && Boolean(rb.before) === Boolean(ra.before), 'versions restore: no copy back to the window, the same name, a kept version');
    // a message added, then Undo both ways
    for (const [b, inst, r] of [[ba, oldV, ra], [bb, newV, rb]]) {
      const f = path.join(b.dataDir, 'chats', 'giant.json'); const c = JSON.parse(fs.readFileSync(f, 'utf8')); c.messages.push({ role: 'user', text: 'later', at: 1 }); fs.writeFileSync(f, JSON.stringify(c, null, 2));
      const u = await inst.restore(S, r.before, { over: r.value });
      ok(u.ok, `versions Undo ok (${b === ba ? 'main' : 'thread'})`);
    }
    ok(fs.readFileSync(path.join(ba.dataDir, 'chats', 'giant.json'), 'utf8') === fs.readFileSync(path.join(bb.dataDir, 'chats', 'giant.json'), 'utf8'), 'versions Undo: the same chat file both ways');
    const la2 = await oldV.list(S); const lb2 = await newV.list(S);
    ok(la2.versions.length === lb2.versions.length && la2.versions.length >= 2, `versions after: the same count listed (${la2.versions.length} / ${lb2.versions.length})`);
    // Deleted things: the same rows
    const da = await oldV.deleted(); const db = await newV.deleted();
    const rows = (d) => JSON.stringify(d.chats.map((x) => [x.id, x.name, x.n, x.agentId, x.where]).sort());
    ok(rows(da) === rows(db) && db.chats.length === 2, `Deleted things: the same rows (${rows(db)})`);
  } finally { await T.end(); fs.rmSync(dir, { recursive: true, force: true }); }
}

async function bench() {
  const fix = '/tmp/hearth-bigchat84';
  if (!fs.existsSync(path.join(fix, '.versions'))) require('./bigchat84-fixture').make(fix);
  const file = path.join(fix, 'chats', 'claude-giant0.json');
  const chat = JSON.parse(fs.readFileSync(file, 'utf8'));
  const t = (f) => { const t0 = performance.now(); const r = f(); return [Math.round(performance.now() - t0), r]; };
  const out = {};
  out.exportJsonWhole = t(() => JSON.stringify({ ...chat, session: undefined, hearthExport: 1 }, null, 2).length)[0];
  out.exportMdWhole = t(() => chatMarkdown(chat, { name: 'Claude' }).length)[0];
  let longest = 0; let last = performance.now();
  const t0 = performance.now();
  await CE.pump(CE.json(chat), () => { longest = Math.max(longest, performance.now() - last); return new Promise((r) => setImmediate(() => { last = performance.now(); r(); })); }, { pause: () => new Promise((r) => setImmediate(() => { longest = Math.max(longest, performance.now() - last); last = performance.now(); r(); })) });
  out.exportJsonParts = { total: Math.round(performance.now() - t0), longestSlice: Math.round(longest) };
  // open: the slices' size (each one structured-copied here, as the window reads it)
  const { performance: P } = require('perf_hooks');
  const sl = parseSlices(chat, { chunk: 1.5e6, tail: 100 });
  out.openSlices = sl.posts;
  let worst = 0; const src = fs.readFileSync(path.join(ROOT, 'chatparse-worker.js'), 'utf8'); const posts = []; const self = { postMessage: (d) => posts.push(d) };
  vm.runInNewContext(src, { self, TextDecoder, Uint8Array, JSON, Math, Object, Array, String });
  self.onmessage({ data: { id: 1, parts: [fs.readFileSync(file)], chunk: 1.5e6, tail: 100 } });
  for (const d of posts) { const a = P.now(); structuredClone(d); worst = Math.max(worst, P.now() - a); }
  out.openCopy = { whole: t(() => structuredClone(chat))[0], longestSlice: Math.round(worst) };
  // restore: the main-process way (what it held there) vs the thread's (the main process only waits)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigchat84-bench-'));
  const T = thread();
  try {
    for (const way of ['main', 'thread']) {
      const dataDir = path.join(dir, way);
      fs.mkdirSync(path.join(dataDir, 'chats'), { recursive: true }); fs.copyFileSync(file, path.join(dataDir, 'chats', 'claude-giant0.json'));
      fs.cpSync(path.join(fix, '.versions'), path.join(dataDir, '.versions'), { recursive: true });
      const base = { dataDir, stateDir: path.join(dataDir, 'sync'), here: 'x', now: () => 1e13, digest: (a) => T.op({ op: 'chatDigest', ...a }), writeChat: async (c) => { fs.writeFileSync(path.join(dataDir, 'chats', `${c.id}.json`), JSON.stringify(c, null, 2)); } };
      const inst = V.create(way === 'thread' ? { ...base, chatRestore: (a) => T.op({ op: 'chatRestore', file: path.join(dataDir, 'chats', `${a.id}.json`), ...a }) } : base);
      const S = { kind: 'chat', id: 'claude-giant0' };
      const e = (await inst.list(S)).versions.find((x) => x.src === 'before');
      const { monitorEventLoopDelay } = require('perf_hooks'); const h = monitorEventLoopDelay({ resolution: 5 }); h.enable();
      const a = performance.now(); const r = await inst.restore(S, e.token); const ms = Math.round(performance.now() - a);
      h.disable();
      out[`restore_${way}`] = { ok: r.ok, ms, mainMaxBlock: Math.round(h.max / 1e6) };
    }
  } finally { await T.end(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(JSON.stringify(out, null, 1));
}

(async () => {
  if (process.argv.includes('--bench')) { await bench(); return; }
  const chats = [chatOf(0), chatOf(1), chatOf(7), chatOf(400), { id: 'x', title: 't', messages: [] }, { id: 'y', title: 'no list' }, { id: 'z', title: 'z', hearthExport: 0, messages: [{ text: undefined }, null], session: 1 }];
  await exportTests(chats);
  for (const [k, c] of [chatOf(0), chatOf(1), chatOf(120), chatOf(500)].entries()) {
    for (const tail of [0, 5, 100, 1000]) {
      const r = parseSlices(c, { tail });
      ok(JSON.stringify(r.out) === JSON.stringify(JSON.parse(JSON.stringify(c, null, 2))) && Object.keys(r.out).join() === Object.keys(c).join() && r.done === 1, `open in slices #${k} tail ${tail} (${r.posts} posts)`);
      if (tail && c.messages.length > tail) ok(r.firstFrom === c.messages.length - tail, `open: its end first #${k}`);
    }
  }
  await storeTests();
  console.log(`${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
