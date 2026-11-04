// (round 113, search113) Finding things with thousands of chats: the query set (dev/search113-queries.js) against the
// real store thread (storework.js in a worker: op chatfind on recall's index) over a made-up profile of 2,000 filler
// chats + the set's chats (a long one read in slices, a giant one read by its bytes, a chat in the Trash, a version
// kept aside, a .prev copy, a damaged file, projects with one archived). Never real data.
//   1. every query of the set gives its expected result (the obvious chat first, partial words, accents / case /
//      ligatures / elisions, pinned and recent first, never the Trash / kept aside / a second .prev row, the project)
//   2. typing 1, 2 and 5 letters: one letter finds no message (titles only, in the window), two and five do
//   3. a chat that can't be read is named (unread), never silently missing; a projects store that can't be read
//      says so (projects: null), never "in no project"; a chat deleted since the folder was looked at is not a row;
//      a chat saved through the thread is found at once
//   4. the store thread's time: the catch-up in slices (each ask ≤ ~1.5× its budget), each find after it (p95)
//   5. recall's search (now typed arrays) = round 112's (dev/search113-r112-recall.js) on the same chats
//   6. the window's side (chatfind.js in a stand-in page): the title rows at once with the right chat first, the newest
//      words win (an older answer never paints over a newer one), a failed ask is said, unread / still-reading rows
//   node dev/search113-test.js            (--bench: also the heavy fixture /tmp/hearth-bigprofile72 when it's there)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Worker } = require('worker_threads');
const Q = require('./search113-queries.js');
const R = require('../recall-core.js');
const R112 = require('./search113-r112-recall.js');

let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info).slice(0, 900)); } else console.log(`✓ ${name}`); };
const root = require('./tmp-own').mkdtemp('s113-');
const data = path.join(root, 'data');
const DIR = path.join(data, 'chats'); const KV = path.join(data, 'kv');
fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync(KV, { recursive: true });
const NOW = Date.now(); const DAY = 864e5;
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

// ---------- the profile: 2,000 filler chats (a fixed seed) + the set's ----------
let seed = 113; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const SYL = 'ka lo mi ne ru sa to vi ze bra cle dri fo gu ha jo ki lu ma no pe qui ri su te vo wy xa yo zu tra pla stro gre'.split(' ');
const COMMON = 'the a and to of in for on with this that it is was we you our next then now render scene layer camera light color sound mix track export frame loop beat project file save open look fix try idea plan note list week day'.split(' ');
const VOCAB = Array.from({ length: 3000 }, () => Array.from({ length: int(2, 4) }, () => SYL[int(0, SYL.length - 1)]).join(''));
const word = () => (rnd() < 0.55 ? COMMON[int(0, COMMON.length - 1)] : VOCAB[int(0, VOCAB.length - 1)]);
const sentence = (k) => Array.from({ length: k }, word).join(' ');
const NOISE = ['kyoto', 'intro', 'font', 'budget', 'shader', 'portal', 'glass'];
for (let i = 0; i < 2000; i++) {
  const at = NOW - int(0, 700) * DAY;
  const msgs = Array.from({ length: int(4, 30) }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', text: `${sentence(int(8, 40))}${rnd() < 0.03 ? ` ${NOISE[int(0, NOISE.length - 1)]}` : ''}.`, at: at - (30 - k) * 60e3 }));
  const title = Array.from({ length: int(2, 4) }, () => { const w = word(); return w[0].toUpperCase() + w.slice(1); }).join(' ');
  fs.writeFileSync(path.join(DIR, `fill-${i}.json`), JSON.stringify({ id: `fill-${i}`, agentId: i % 4 ? 'claude' : 'astra', title, updatedAt: at, pinned: i % 97 === 0, messages: msgs }, null, 2));
}
Q.addTo(data, { now: NOW, giantN: 3000, giantPad: 8 });
const GIANT_MIN = 1024 * 1024;
ok(`the profile: ${fs.readdirSync(DIR).length} chat files (the giant one ${(fs.statSync(path.join(DIR, 's113-giant.json')).size / 1e6).toFixed(1)} MB ≥ ${GIANT_MIN / 1e6} MB, the long one ${(fs.statSync(path.join(DIR, 's113-long.json')).size / 1e3).toFixed(0)} KB)`,
  fs.statSync(path.join(DIR, 's113-giant.json')).size >= GIANT_MIN && fs.statSync(path.join(DIR, 's113-long.json')).size >= 128 * 1024);

// ---------- the store thread ----------
function thread(env = {}) {
  const w = new Worker(path.join(__dirname, '..', 'storework.js'), { env: { ...process.env, HEARTH_BIGCHAT_MIN: String(GIANT_MIN), HEARTH_RECALL_CACHE: path.join(root, 'cache'), ...env } });
  let id = 0; const jobs = new Map();
  w.on('message', ({ id: i, res, err, ms }) => { const j = jobs.get(i); jobs.delete(i); if (err) j.reject(new Error(err)); else j.resolve({ res, ms }); });
  const ask = (m) => new Promise((resolve, reject) => { const i = ++id; jobs.set(i, { resolve, reject }); w.postMessage({ ...m, id: i }); });
  return { ask, find: (q, o = {}) => ask({ op: 'chatfind', dir: DIR, kv: KV, q, budgetMs: 30, limit: 12, ...o }), stop: () => w.terminate() };
}
const top = (r) => r.hits[0]?.chatId;
async function storeSide() {
  const T = thread();
  try {
    await T.ask({ op: 'list', dir: DIR });
    // 4a. the catch-up: every ask within its budget (a long chat a slice at a time, the giant one by its bytes)
    let x; let calls = 0; const slices = [];
    do { x = await T.find('kyoto'); calls += 1; slices.push(x.ms); } while (x.res.left && calls < 3000);
    ok(`catch-up: ${calls} asks, the longest ${Math.round(Math.max(...slices))} ms of the thread (budget 30 ms), p95 ${Math.round(pct(slices, 0.95))} ms; ${x.res.chats} chats, ${x.res.messages} messages`, !x.res.left && pct(slices, 0.95) < 60 && Math.max(...slices) < 150, { max: Math.max(...slices) });
    // 1. the query set
    const times = [];
    for (const qq of Q.QUERIES) {
      const { res: r, ms } = await T.find(qq.q); times.push(ms);
      const ids = r.hits.map((h) => h.chatId);
      const why = `${JSON.stringify(qq.q)} — ${qq.why}`;
      if (qq.top) ok(`${why}: ${qq.top} first`, top(r) === qq.top, ids.slice(0, 5));
      if (qq.order) ok(`${why}: ${qq.order.join(' before ')}`, qq.order.every((id, i) => ids.indexOf(id) === i), ids.slice(0, 5));
      if (qq.none) ok(`${why}: no row`, !r.hits.length && !ids.includes(qq.none), ids.slice(0, 5));
      if (qq.once) ok(`${why}: one row for it`, ids.filter((id) => id === qq.top).length === 1, ids);
      if (qq.k != null) ok(`${why}: lands on #${qq.k}, its words in the snippet`, r.hits[0]?.k === qq.k && new RegExp(qq.q, 'i').test(r.hits[0]?.snippet || ''), r.hits[0]);
      if ('project' in qq) ok(`${why}: its project ${JSON.stringify(qq.project)}`, (r.hits[0]?.project?.name ?? null) === qq.project, r.hits[0]?.project);
    }
    ok(`each find after the catch-up: p50 ${Math.round(pct(times, 0.5))} ms, p95 ${Math.round(pct(times, 0.95))} ms of the store thread (≤ 50 ms)`, pct(times, 0.95) <= 50, times.map(Math.round));
    // 2. 1, 2 and 5 letters
    const [k1, k2, k5] = [await T.find('k'), await T.find('ky'), await T.find('kyoto')];
    ok(`1 letter: no message rows (the window shows titles); 2 letters: ${top(k2.res)} first; 5 letters: ${top(k5.res)} first`, !k1.res.hits.length && top(k2.res) === 's113-kyoto' && top(k5.res) === 's113-kyoto', { k1: k1.res.hits.length });
    // 3. what can't be read is named
    const any = (await T.find('kyoto')).res;
    ok('a chat that can\'t be read is named (unread: "Broken chat"), never silently missing', any.unread.some((u) => u.id === 's113-broken'), any.unread);
    const pf = path.join(KV, 'projects.json'); const keep = fs.readFileSync(pf);
    fs.writeFileSync(pf, '{"v":1,"list":[{"id":'); // (cut short)
    const np = (await T.find('intro font')).res;
    ok('a projects store that can\'t be read: said (projects: null), the messages still found, no row says "no project"', np.projects === null && top(np) === 's113-intro' && np.hits[0].project === null, { projects: np.projects, top: top(np) });
    fs.writeFileSync(pf, keep);
    const back = (await T.find('intro font')).res;
    ok('… read again once it can be: the project back', back.hits[0]?.project?.name === 'Clink', back.hits[0]?.project);
    fs.renameSync(path.join(DIR, 's113-serum.json'), path.join(data, 'trash', 's113-serum.json')); // (deleted: to the Trash)
    const gone = (await T.find('serum')).res;
    ok('a chat deleted since the folder was looked at (≤ 3 s): not a row', !gone.hits.some((h) => h.chatId === 's113-serum'), gone.hits.map((h) => h.chatId));
    const fresh = { id: 's113-new', agentId: 'claude', title: 'Fresh one', updatedAt: Date.now(), messages: [{ role: 'user', text: 'a brand new quokkaesque idea', at: Date.now() }] };
    await T.ask({ op: 'write', file: path.join(DIR, 's113-new.json'), value: fresh, chatDir: true });
    const nw = (await T.find('quokkaesque')).res;
    ok('a chat saved through the thread is found at once (the folder\'s look reused)', top(nw) === 's113-new', nw.hits.map((h) => h.chatId));
  } finally { await T.stop(); }
}

// ---------- 5. recall's search = round 112's on the same chats ----------
function recallSame() {
  const a = R112.createIndex(); const b = R.createIndex(); const byKey = new Map();
  for (const f of fs.readdirSync(DIR).filter((x) => x.startsWith('fill-')).slice(0, 1500)) { const c = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); byKey.set(f, c); a.add(f, c); b.add(f, c); }
  const textOf = (k, i) => byKey.get(k)?.messages?.[i]?.text || '';
  const bad = [];
  for (const q of ['render scene', 'what did we decide about the camera light', 'kyoto', 'intro font', 'portal glass shader', 'mix track export', 'next week plan', `${VOCAB[5]} ${VOCAB[9]}`, VOCAB[17], 'nothinglikethis']) {
    for (const limit of [6, 16]) if (JSON.stringify(a.search(q, { textOf, now: NOW, limit })) !== JSON.stringify(b.search(q, { textOf, now: NOW, limit }))) bad.push(`${q} @${limit}`);
  }
  ok('recall: the same results as round 112 (20 asks on 1,500 chats: quotes, groups, order, scores)', !bad.length, bad);
  const t0 = performance.now(); for (let i = 0; i < 5; i++) b.search('render scene camera', { textOf, now: NOW }); const tNew = (performance.now() - t0) / 5;
  const t1 = performance.now(); for (let i = 0; i < 5; i++) a.search('render scene camera', { textOf, now: NOW }); const tOld = (performance.now() - t1) / 5;
  console.log(`  recall search, common words on 1,500 chats: ${tNew.toFixed(1)} ms (round 112: ${tOld.toFixed(1)} ms)`);
}

// ---------- 6. the window's side ----------
async function windowSide() {
  const chats = Q.chats(NOW).map((c) => ({ id: c.id, agentId: c.agentId, title: c.title, updatedAt: c.updatedAt, pinned: Boolean(c.pinned) }));
  chats.push({ ...chats[0] }); // (a .prev copy has the same id)
  const asks = [];
  const ctx = vm.createContext({ console, Promise, Math, JSON, Object, Array, Number, String, Boolean, Error, Map, Set, RegExp, Date, performance,
    setTimeout, clearTimeout, toast: () => {}, calmError: (e) => String(e?.message || e), timeAgo: () => 'today',
    H: { chats, agent: (id) => ({ id, name: id === 'astra' ? 'Astra' : 'Claude', mode: 'native' }), activeChat: {} },
    window: { hub: { chatFind: (o) => new Promise((resolve, reject) => asks.push({ o, resolve, reject })) } } });
  ctx.window.window = ctx.window;
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, '..', 'recall-core.js'), 'utf8')}\n;globalThis.RecallCore = RecallCore;`, ctx);
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, '..', 'chatfind.js'), 'utf8')}\n;globalThis.ChatFind = ChatFind;`, ctx);
  const CF = ctx.ChatFind;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let painted = 0; const paint = () => { painted += 1; };
  const t0 = performance.now();
  let rows = CF.rows('kyo', paint);
  const firstMs = performance.now() - t0;
  ok(`title rows at once (${firstMs.toFixed(1)} ms): "Kyoto trip plan" first, one row per chat, then "Looking in your messages…"`, rows[0]?.label === 'Kyoto trip plan' && rows.filter((r) => r.chatId === 's113-kyoto').length === 1 && rows.at(-1).note && /Looking/.test(rows.at(-1).label), rows.map((r) => r.label));
  ok('accents in titles: "cafe" → Café Oberkampf menu; "sohne" isn\'t a title word → no title row', CF.titleRows('cafe')[0]?.label === 'Café Oberkampf menu' && !CF.titleRows('sohne').length);
  // the newest words win: "kyo" asked, then "kyoto" typed while it's in flight; the old answer arrives last
  await sleep(100);
  ok('one ask after a quiet moment', asks.length === 1 && asks[0].o.q === 'kyo', asks.map((a) => a.o.q));
  rows = CF.rows('kyoto', paint);
  await sleep(100);
  ok('typing while an ask is in flight: no second ask yet (one at a time)', asks.length === 1);
  asks[0].resolve({ hits: [{ chatId: 's113-kyoto-old', agentId: 'claude', title: 'OLD ANSWER', k: 0, snippet: 'old', project: null }], total: 1, left: 0, unread: [], projects: 1 });
  await sleep(20);
  ok('… the answer to the old words is dropped, the newest words asked right after', CF.state().res === null && asks.length === 2 && asks[1].o.q === 'kyoto', { res: CF.state().res, asks: asks.map((a) => a.o.q) });
  asks[1].resolve({ hits: [{ chatId: 's113-kyoto', agentId: 'claude', title: 'Kyoto trip plan', k: 3, role: 'assistant', snippet: 'the ryokan budget stays under ¥45,000. Kyoto in April', count: 3, project: { id: 'pj-s113-travel', name: 'Travel' } }],
    total: 1, left: 120, unread: [{ id: 's113-broken', title: null }, { id: 's113-held', title: 'Held chat' }], projects: 3 });
  await sleep(20);
  rows = CF.rows('kyoto', paint);
  const msg = rows.find((r) => r.hit);
  ok('the message row: its snippet, its project, what it is in; a project\'s title row says the project too', msg && /ryokan/.test(msg.label) && msg.kind === '◆ Travel' && /Kyoto trip plan/.test(msg.detail) && /3 messages match/.test(msg.detail) && rows[0].kind === '◆ Travel', rows.map((r) => [r.kind, r.label, r.detail]));
  ok('a chat that couldn\'t be read is a row ("Couldn\'t read “Broken chat” just now"); still reading → a row says so', rows.some((r) => /Couldn’t read a chat \(s113-broken\)/.test(r.label)) && rows.some((r) => /Couldn’t read “Held chat”/.test(r.label)) && rows.some((r) => /Still reading 120 chats/.test(r.label)), rows.map((r) => r.label));
  ok('the rows were painted again when the answer came', painted >= 1, painted);
  await sleep(150); // (still reading: asked again in a quiet moment)
  ok('still reading: asked again by itself', asks.length === 3 && asks[2].o.q === 'kyoto', asks.map((a) => a.o.q));
  asks[2].reject(new Error('the store thread stopped'));
  await sleep(20);
  rows = CF.rows('kyoto', paint);
  ok('a failed ask is said ("Couldn\'t search the messages just now"), never "no messages match"; the last good rows stay', rows.some((r) => /Couldn’t search the messages just now/.test(r.label)) && rows.some((r) => r.hit), rows.map((r) => r.label));
}

(async () => {
  try {
    await storeSide();
    recallSame();
    await windowSide();
    if (process.argv.includes('--bench') && fs.existsSync('/tmp/hearth-bigprofile72/chats')) {
      // (read only: the heavy fixture's chats; the index's kept copy goes to this test's own folder)
      const T = thread(); const D = '/tmp/hearth-bigprofile72/chats'; const K = '/tmp/hearth-bigprofile72/kv';
      try {
        await T.ask({ op: 'list', dir: D });
        let x; let calls = 0; const sl = []; const t0 = performance.now();
        do { x = await T.ask({ op: 'chatfind', dir: D, kv: K, q: 'portal', budgetMs: 30, limit: 12 }); calls += 1; sl.push(x.ms); } while (x.res.left && calls < 4000);
        console.log(`  heavy profile: catch-up ${calls} asks in ${Math.round(performance.now() - t0)} ms, longest ${Math.round(Math.max(...sl))} ms, p95 ${Math.round(pct(sl, 0.95))} ms`);
        for (const q of ['p', 'po', 'porta', 'portal', 'portal sh', 'portal shader', 'clink']) { const r = await T.ask({ op: 'chatfind', dir: D, kv: K, q, budgetMs: 30, limit: 12 }); console.log(`  heavy profile: ${JSON.stringify(q)} ${Math.round(r.ms)} ms, ${r.res.total} chats ${JSON.stringify(r.res.parts)}`); }
      } finally { await T.stop(); }
    }
  } catch (e) { fails += 1; console.log('✗ threw', e.stack); }
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* the temp root goes with the run */ }
  console.log(`\n${n - fails}/${n} passed`);
  if (fails) { console.log(`FAIL search113-test: ${fails}`); process.exit(1); }
  process.exit(0);
})();
