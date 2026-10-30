// (round 92, findmem92) Find in this project keeps a GIANT chat lean (its words, not its text: the messages a query
// shows are read back from the file's bytes), every source's words compact; and the hint queue waits on events.
// Proved against round 91's own code (dev/findmem92-r91-projfind.js, the old path, verbatim) on the same files:
//   1. a message's text read back from its bytes = what the index kept (cut at 6,000 characters on escapes, accents,
//      emoji, a Σ, control characters, "text" not first, other "text" keys further in)
//   2. a project with a giant chat: the same hits, the same order, the same snippets and scores for every query (one
//      word, several, phrases longer than the 24 folded characters a doc keeps, words inside words, nothing found),
//      at several limits; lean, compact-only and old side by side
//   3. memory: the lean index holds no message text (its heap after a GC against the old one's)
//   4. a giant chat that can't be read back (gone, cut short) is named in `unread`, the rest found as without it;
//      never "nothing found"; a giant chat saved since (its new words still being read): read back by place, then rebuilt
//   5. the real store thread (storework.js in a worker): lean there, the same results, its _mem's findChars small
//   6. hints.js on a stand-in page with a virtual clock: while a dialog / the sync panel / a card / typing / a reply holds
//      the way, a few looks instead of one every 0.7 s; a click, Esc or a dialog closing shows the tip at once
//   FINDMEM92_BIG=1: also the real fixtures (bigchat84's Clink with its 63 MB chat, bigprofile72's Clink if it is
//      there): identical results, heap, and query p50 / p95, old against new
//   node dev/findmem92-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const v8 = require('v8');
const { Worker } = require('worker_threads');
const PF = require('../projfind-core.js');
const OLD = require('./findmem92-r91-projfind.js');
const BC = require('../bigchat-core.js');

v8.setFlagsFromString('--expose_gc');
const gc = vm.runInNewContext('gc');
let fails = 0; let n = 0;
const ok = (name, cond, info) => { n += 1; if (!cond) { fails += 1; console.log(`✗ ${name}`, info === undefined ? '' : JSON.stringify(info).slice(0, 900)); } else console.log(`✓ ${name}`); };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fm92-'));
const dirs = { chats: path.join(root, 'chats'), kv: path.join(root, 'kv') };
fs.mkdirSync(dirs.chats, { recursive: true }); fs.mkdirSync(dirs.kv, { recursive: true });
const chatFile = (id) => path.join(dirs.chats, `${id}.json`);
const NOW = Date.now(); const DAY = 864e5;
const stat = (f) => { try { return fs.statSync(f); } catch { return null; } };
const envOf = (o = {}) => ({ stat, join: path.join, now: () => performance.now(), read: (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } },
  big: { min: o.min ?? 1, open: (file, onMessage, oo) => BC.reader(fs, file, { ...oo, onMessage, chunk: 256 * 1024 }), ...(o.lean != null ? { lean: o.lean, text: PF.leanReader(fs) } : {}) } });
const build = (M, ix, spec, env) => { let x; let calls = 0; do { x = M.run(ix, { spec, dirs, budgetMs: 1000 }, env); calls += 1; } while (x.left && calls < 500); return x; };
const strip = (r) => JSON.stringify({ unread: r.unread || null, groups: r.groups.map((g) => ({ id: g.id, total: g.total, hits: g.hits })) });

// ---------- made-up words (a fixed seed; never real data) ----------
let seed = 92; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const WORDS = 'orb particles bloom kick snare intro logo shader noise flow glitch neon chrome glass ember forge spark title beat drop bass synth camera orbit loop palette vinyl poster grain fog rain city night ocean tunnel portal crystal liquid smoke galaxy ribbon terrain ascii kinetic mask sequence render export reel Serum Vital Paris show quest café crème Ελλάδα ΣΟΦΟΣ naïve Zürich MeshStandardMaterial'.split(' ');
const pick = () => WORDS[Math.floor(rnd() * WORDS.length)];
const sentence = (k) => Array.from({ length: k }, pick).join(' ');
const EMOJI = ['🔥', '✨', '🎛️', '👍🏽'];
// a text that is long, and whose 6,000th character falls somewhere awkward
function longText(kind) {
  if (kind === 'ascii') return `${sentence(int(900, 1400))}`;
  if (kind === 'escapes') return Array.from({ length: 900 }, (_, j) => `"${pick()}" \\ line ${j}\n\t${pick()}`).join('');
  if (kind === 'accents') return Array.from({ length: 1500 }, () => `${pick()} é ü ß`).join(' ');
  if (kind === 'emoji') return `${'x'.repeat(5999)}${EMOJI[0]}${sentence(300)}`; // (a surrogate pair split by the cut)
  if (kind === 'emoji2') return Array.from({ length: 4000 }, () => EMOJI[int(0, 3)]).join('');
  if (kind === 'control') return Array.from({ length: 7000 }, (_, j) => (j % 7 ? String.fromCharCode(1 + (j % 30)) : pick()[0])).join(''); // (6 bytes a character as JSON writes them)
  if (kind === 'slash') return `${'\\'.repeat(5999)}${'\\u'}${sentence(400)}`;
  return sentence(50);
}
const KINDS = ['ascii', 'escapes', 'accents', 'emoji', 'emoji2', 'control', 'slash'];
const PHRASE_A = 'Σίσυφος and the long phrase portal ribbon galaxy'; // (more than 24 folded characters, a Σ / ς in it)
const PHRASE_B = 'the neon portal opens slowly over the city tonight';
function giantChat(id, count) {
  const msgs = [];
  for (let k = 0; k < count; k++) {
    const at = NOW - (count - k) * 6e4;
    if (k % 50 === 7) { msgs.push({ role: 'system', text: `system note ${sentence(4)}`, at }); continue; }
    if (k % 61 === 3) { msgs.push({ role: 'user', text: '   ', at }); continue; }
    if (k % 97 === 5) { msgs.push({ role: 'assistant', text: 42, at }); continue; }
    const role = k % 2 ? 'assistant' : 'user';
    let text = k % 9 === 4 ? longText(KINDS[(k / 9 | 0) % KINDS.length]) : `${sentence(int(4, 40))}${k % 5 ? '?' : '.'}`;
    if (k % 37 === 11) text = `${PHRASE_A} ${sentence(6)}`;
    if (k % 41 === 13) text = `${PHRASE_B}${k % 2 ? '!' : ` ${sentence(5)}`}`;
    if (k % 43 === 17) text = `ΣΟΦΟΣ ${PHRASE_A.slice(10)} ${sentence(3)}`;
    const m = k % 13 === 6 ? { at, usage: { input: int(1, 9e4), output: 300 }, role, text } : { role, text, at }; // (text not the first key)
    if (role === 'assistant' && k % 7 === 2) m.progress = [{ text: `step ${sentence(3)}`, status: 'done' }]; // (another "text" further in)
    if (role === 'assistant' && k % 11 === 1) m.thinking = sentence(int(20, 200));
    msgs.push(m);
  }
  return { id, agentId: 'claude', title: 'Clink build log (made up)', updatedAt: NOW - 3600e3, messages: msgs };
}
const W = (file, v, pretty = true) => fs.writeFileSync(file, JSON.stringify(v, null, pretty ? 2 : undefined));

// ---------- 1. a message's text read back from its bytes ----------
{
  const c = giantChat('claude-readback', 700);
  for (const [pretty, name] of [[true, 'pretty'], [false, 'compact']]) {
    const f = chatFile(`claude-readback-${name}`); W(f, c, pretty);
    const buf = fs.readFileSync(f); const cut = BC.scanBuf(buf); const st = fs.statSync(f);
    const docs = []; const want = new Map();
    for (let k = 0; k < cut.els.length / 2; k++) {
      const m = c.messages[k]; if (typeof m.text !== 'string' || !m.text.trim() || (m.role !== 'user' && m.role !== 'assistant')) continue;
      const d = { k, s: cut.els[k * 2], e: cut.els[k * 2 + 1] }; docs.push(d); want.set(d, m.text.length > 6000 ? m.text.slice(0, 6000) : m.text);
    }
    const got = PF.leanReader(fs)(f, `${st.size}:${st.mtimeMs}`, docs);
    const bad = docs.filter((d) => got?.get(d) !== want.get(d)).map((d) => d.k);
    ok(`read back (${name}): ${docs.length} messages, every text as the index kept it (long ones cut at 6,000 on escapes, accents, emoji, control characters)`, got && !bad.length, bad.slice(0, 8));
  }
}

// ---------- 2. a project with a giant chat: the same results as round 91 ----------
const GIANT = 'claude-giant92';
W(chatFile(GIANT), giantChat(GIANT, 2400));
for (let i = 0; i < 4; i++) W(chatFile(`claude-small${i}`), { id: `claude-small${i}`, agentId: 'claude', title: `Small ${i} ${pick()}`, updatedAt: NOW - i * DAY, messages: Array.from({ length: 60 + i * 30 }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', text: k % 17 === 3 ? `${PHRASE_B} ${sentence(3)}` : sentence(int(3, 30)), at: NOW - i * DAY - k * 9e4 })) }, i % 2 === 0);
W(path.join(dirs.kv, 'three-sketches.json'), [{ id: 'sk1', name: 'Clink tunnel', updatedAt: NOW - DAY, layers: [{ id: 'l1', name: 'neon portal', code: Array.from({ length: 80 }, (_, j) => `const v${j} = new MeshStandardMaterial(); // ${sentence(5)}`).join('\n') }] }]);
W(path.join(dirs.kv, 'board-bd1.json'), { id: 'bd1', name: 'Moodboard', updated: NOW - DAY, items: Array.from({ length: 40 }, (_, k) => ({ id: `i${k}`, type: 'text', text: sentence(int(2, 12)) })) });
const spec = { pid: 'pj92', chats: [GIANT, 'claude-small0', 'claude-small1', 'claude-small2', 'claude-small3'], scenes: ['sk1'], boards: ['bd1'], notes: `${PHRASE_B} notes ${sentence(40)}`, description: sentence(12), items: Array.from({ length: 60 }, (_, k) => ({ type: ['file', 'capture', 'render'][k % 3], ref: `/w/${k}`, name: `${pick()}-${k}.png` })) };
const giantSize = fs.statSync(chatFile(GIANT)).size;
const QUERIES = ['portal', 'neon portal', 'kick drum', 'shader', 'ri', 'the', 'ascii kinetic glitch', 'cafe', 'CRÈME', 'ελλαδα', 'σοφος', 'sofos', 'standard', 'meshstandardmaterial', 'zurich', 'step', 'system note', 'Σίσυφος and the long phrase portal', 'σίσυφος and the long phrase portal ribbon galaxy', 'ΣΟΦΟΣ and the long phrase portal ribbon', 'the neon portal opens slowly over the city', 'the neon portal opens slowly over the city tonight!', 'line 12', 'xylophone', 'x', '42', 'Clink build log', 'é ü', '🔥'];
let ixOld; let ixNew; let ixCompact; const envOld = envOf(); const envNew = envOf({ lean: giantSize }); const envCompact = envOf();
{
  ixOld = OLD.createIndex(); build(OLD, ixOld, spec, envOld);
  ixNew = PF.createIndex(); build(PF, ixNew, spec, envNew);
  ixCompact = PF.createIndex(); build(PF, ixCompact, spec, envCompact);
  const T = NOW + 5000;
  const diffs = [];
  for (const q of QUERIES) for (const limit of [4, 20, 300]) {
    const a = strip(ixOld.query(spec, dirs, q, { limit, now: T, join: path.join }));
    const b = strip(ixNew.query(spec, dirs, q, { limit, now: T, join: path.join, text: envNew.big.text }));
    const c = strip(ixCompact.query(spec, dirs, q, { limit, now: T, join: path.join }));
    if (a !== b || a !== c) diffs.push({ q, limit, lean: a === b, compact: a === c });
  }
  ok(`giant chat lean: the same hits, order, snippets and scores as round 91 (${QUERIES.length} queries × 3 limits; compact-only too)`, !diffs.length, diffs);
  const r = ixNew.query(spec, dirs, 'portal', { limit: 20, now: T, join: path.join, text: envNew.big.text });
  ok('… the giant chat is in those results (lean docs read back)', r.groups[0]?.hits.some((h) => h.ref === GIANT), r.groups[0]?.hits.map((h) => h.ref));
  ok('… the lean index holds its words, not its text (characters held)', ixNew.size().chars < ixOld.size().chars / 3, { lean: ixNew.size().chars, old: ixOld.size().chars });
}

// ---------- 3. memory: the heap each index holds after a GC ----------
{
  const heapOf = (M, env) => { gc(); gc(); const h0 = process.memoryUsage().heapUsed; const ix = M.createIndex(); build(M, ix, { ...spec, chats: [GIANT] }, env); gc(); gc(); const h = process.memoryUsage().heapUsed - h0; return { ix, h }; };
  const a = heapOf(OLD, envOf()); const b = heapOf(PF, envOf({ lean: giantSize }));
  ok(`memory: the giant chat's index ${Math.round(a.h / 1e5) / 10} MB → ${Math.round(b.h / 1e5) / 10} MB (at most 35 %)`, b.h < a.h * 0.35, { old: a.h, lean: b.h });
  a.ix.sweep(Date.now() + 1e9); b.ix.sweep(Date.now() + 1e9);
}

// ---------- 4. a giant chat that can't be read back; one saved since ----------
{
  const T = NOW + 5000;
  const without = OLD.createIndex(); build(OLD, without, { ...spec, chats: spec.chats.filter((c) => c !== GIANT) }, envOf());
  const keep = fs.readFileSync(chatFile(GIANT));
  const holes = [];
  // (a fresh index each time: what an index read back lately it keeps a little while, as the old one kept every text)
  const fresh = (sp = spec) => { const ix = PF.createIndex(); build(PF, ix, sp, envNew); return ix; };
  for (const how of ['gone', 'cut short']) {
    const ix = fresh();
    if (how === 'gone') fs.renameSync(chatFile(GIANT), `${chatFile(GIANT)}.away`); else fs.writeFileSync(chatFile(GIANT), keep.subarray(0, keep.length >> 1));
    for (const q of ['portal', 'neon portal', 'Σίσυφος and the long phrase portal ribbon']) {
      const r = ix.query(spec, dirs, q, { limit: 20, now: T, join: path.join, text: envNew.big.text });
      const w = without.query({ ...spec, chats: spec.chats.filter((c) => c !== GIANT) }, dirs, q, { limit: 20, now: T, join: path.join });
      if (!(r.unread?.length === 1 && r.unread[0].ref === GIANT && r.unread[0].title === 'Clink build log (made up)' && JSON.stringify(r.groups) === JSON.stringify(w.groups))) holes.push({ how, q, unread: r.unread, total: r.total, without: w.total });
    }
    if (how === 'gone') fs.renameSync(`${chatFile(GIANT)}.away`, chatFile(GIANT)); else fs.writeFileSync(chatFile(GIANT), keep);
  }
  ok('can’t read it back (gone, cut short): named in `unread`, every other result as without it — never "nothing found"', !holes.length, holes);
  const only = fresh({ pid: 'pjx', chats: [GIANT] });
  fs.writeFileSync(chatFile(GIANT), '{"id":'); // (unreadable: the only thing the project has)
  const r = only.query({ pid: 'pjx', chats: [GIANT] }, dirs, 'portal', { limit: 20, now: T, join: path.join, text: envNew.big.text });
  ok('… a project whose only match is in it: total 0 AND unread (the box says it couldn’t read it, not "no results")', r.total === 0 && r.unread?.[0]?.ref === GIANT, r);
  fs.writeFileSync(chatFile(GIANT), keep);
  // saved since: one message more, the words of the new file not read yet → the docs read back by their place k
  const c = JSON.parse(keep.toString('utf8')); c.messages.push({ role: 'user', text: 'a brand new portal message', at: NOW });
  const ixMid = fresh(); // (made from the file before the save)
  W(chatFile(GIANT), c);
  const t = new Date(Date.now() + 3000); fs.utimesSync(chatFile(GIANT), t, t);
  const before = ixOld.query(spec, dirs, 'neon portal', { limit: 20, now: T, join: path.join });
  const mid = ixMid.query(spec, dirs, 'neon portal', { limit: 20, now: T, join: path.join, text: envNew.big.text });
  ok('saved since (a message added, its words not read yet): read back by place, the same results as the old index held', strip(before) === strip(mid) && !mid.unread, { before: before.total, mid: mid.total, unread: mid.unread });
  build(OLD, ixOld, spec, envOld); build(PF, ixNew, spec, envNew);
  const a = ixOld.query(spec, dirs, 'portal message', { limit: 20, now: T, join: path.join });
  const b = ixNew.query(spec, dirs, 'portal message', { limit: 20, now: T, join: path.join, text: envNew.big.text });
  ok('… then rebuilt: the new message found, the same as round 91', strip(a) === strip(b) && b.groups[0]?.hits[0]?.snip === 'a brand new portal message', b.groups[0]?.hits[0]);
}

// ---------- 5. the real store thread ----------
async function thread() {
  const w = new Worker(path.join(__dirname, '..', 'storework.js'), { env: { ...process.env, HEARTH_BIGCHAT_MIN: String(1024 * 1024) } });
  let id = 0; const jobs = new Map();
  w.on('message', ({ id: i, res, err }) => { const j = jobs.get(i); jobs.delete(i); if (err) j.reject(new Error(err)); else j.resolve(res); });
  const ask = (m) => new Promise((resolve, reject) => { const i = ++id; jobs.set(i, { resolve, reject }); w.postMessage({ ...m, id: i }); });
  try {
    let x; let calls = 0;
    do { x = await ask({ op: 'projfind', spec, dirs, budgetMs: 1000 }); calls += 1; } while (x.left && calls < 200);
    ok('thread: the project read (the giant chat lean there)', !x.left && x.size.chars < ixOld.size().chars / 3, x.size);
    const ref = OLD.createIndex(); build(OLD, ref, spec, envOld);
    const bad = [];
    for (const q of ['portal', 'neon portal', 'Σίσυφος and the long phrase portal', 'standard', 'cafe']) {
      const r = await ask({ op: 'projfind', spec, dirs, q, limit: 20 });
      const o = ref.query(spec, dirs, q, { limit: 20, now: Date.now(), join: path.join });
      const noScore = (y) => JSON.stringify(y.groups.map((g) => [g.id, g.total, g.hits.map(({ score, ...h }) => h)])); // (its own clock: a few ms of "recent")
      if (noScore(r) !== noScore(o) || r.unread) bad.push(q);
    }
    ok('thread: the same hits, order and snippets as round 91', !bad.length, bad);
    const m = await ask({ op: '_mem' });
    ok(`thread: _mem's findChars ${m.caches.findChars} (the giant chat's words only)`, m.caches.find === 1 && m.caches.findChars > 0 && m.caches.findChars < ixOld.size().chars / 3, m.caches);
  } finally { await w.terminate(); }
}

// ---------- 6. hints.js: a few looks while the way is held, the tip at once when it clears ----------
function hints() {
  let clock = 1.7e12; let fires = 0; let tid = 0; const timers = new Map();
  const handlers = {}; const dom = { open: false, panel: false, foreign: null };
  let streaming = false;
  class Element { constructor() { this.isConnected = true; this.hidden = false; this.style = { translate: '' }; this.classList = { contains: () => false }; } remove() { this.isConnected = false; } getBoundingClientRect() { return { left: 900, top: 600, right: 1200, bottom: 680, width: 300, height: 80 }; } checkVisibility() { return this.isConnected; } querySelector() { return null; } }
  const mem = new Map();
  const ctx = vm.createContext({
    Date: { now: () => clock }, Element, console, Promise, Math, JSON, Object, Array, Number, String, Boolean, Error, Map, Set,
    setTimeout: (fn, ms) => { tid += 1; timers.set(tid, { at: clock + (ms || 0), fn }); return tid; }, clearTimeout: (i) => timers.delete(i),
    addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); }, dispatchEvent: () => true, requestAnimationFrame: (fn) => fn(),
    CustomEvent: class { constructor(type, o) { this.type = type; this.detail = o?.detail; } },
    store: { get: (k, d) => (mem.has(k) ? JSON.parse(mem.get(k)) : d), set: (k, v) => mem.set(k, JSON.stringify(v)) },
    document: { hidden: false, readyState: 'complete', addEventListener() {}, querySelector(sel) { if (dom.open && sel.includes('dialog[open]')) return {}; if (dom.panel && sel.includes('.sync-panel')) return {}; if (dom.foreign && sel.includes('.qs-card')) return dom.foreign; return null; }, querySelectorAll: () => [] },
    H: { activeId: 'claude', agent: () => ({ id: 'claude', mode: 'native' }), agents: () => [{ id: 'claude', mode: 'native' }] },
    Native: { isAgentBusy: () => streaming },
  });
  ctx.window = ctx;
  const H = vm.runInContext(`${fs.readFileSync(path.join(__dirname, '..', 'hints.js'), 'utf8')}; Hints`, ctx);
  const run = async (ms) => { // the virtual clock moves on, the timers due fire in order
    const end = clock + ms;
    for (;;) {
      let next = null; for (const [i, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [i, t];
      if (!next) break;
      timers.delete(next[0]); clock = Math.max(clock, next[1].at); fires += 1; next[1].fn();
      for (let i = 0; i < 5; i++) await Promise.resolve();
    }
    clock = end;
  };
  const ev = (type, e = {}) => (handlers[type] || []).forEach((fn) => fn(e));
  const offer = (id, kind = 'notice') => { const rec = { node: null }; H.offer({ id, kind, show: () => { rec.node = new Element(); return rec.node; } }); return rec; };
  return (async () => {
    H.config({ gap: 0, start: 0, startNotice: 0, quiet: 4000, tick: 700, idle: 5000, ttl: 10 * 60e3 });
    const out = {};
    for (const [what, set, clear, how] of [
      ['a dialog', () => { dom.open = true; }, () => { dom.open = false; }, () => ev('pointerup')],
      ['the sync panel (checkfix88)', () => { dom.panel = true; }, () => { dom.panel = false; }, () => ev('keyup', { key: 'Escape' })],
      ['a card on screen', () => { dom.foreign = new Element(); }, () => { dom.foreign = null; }, () => ev('close')],
    ]) {
      set(); const t = offer(`t-${what}`); await run(100); fires = 0;
      await run(60e3);
      const held = fires; const waited = !t.node;
      clear(); how(); await run(150);
      out[what] = { held, waited, shown: Boolean(t.node) };
      t.node?.remove(); await run(10e3);
    }
    for (const [what, r] of Object.entries(out)) ok(`hints: ${what} holds a tip with ${r.held} looks in a minute (was ≈ 86), and it shows at once when it closes`, r.waited && r.held <= 20 && r.shown, r);
    // typing: one look when the quiet after the last key ends, not every 0.7 s
    ev('keydown', { target: { tagName: 'TEXTAREA' } });
    const k = offer('t-typing'); fires = 0; await run(3900);
    const looks = fires; const early = Boolean(k.node);
    await run(300);
    ok(`hints: typing holds it with ${looks} look(s) in 4 s, shown when the quiet ends`, looks <= 2 && !early && Boolean(k.node), { looks, early, shown: Boolean(k.node) });
    k.node?.remove(); await run(10e3);
    // a reply streaming (no event when it ends): fewer looks, shown at most 2.8 s after it ends
    streaming = true; const s = offer('t-stream'); fires = 0; await run(60e3);
    const sLooks = fires; streaming = false; const t0 = clock;
    while (!s.node && clock - t0 < 10e3) await run(100);
    ok(`hints: a reply holds it with ${sLooks} looks in a minute; shown ${clock - t0} ms after it ends`, sLooks <= 30 && s.node && clock - t0 <= 2900, { sLooks, after: clock - t0 });
  })();
}

// ---------- the real fixtures (FINDMEM92_BIG=1) ----------
function specOfProject(dir, pid) {
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'kv/projects.json'), 'utf8'));
  const p = pj.list.find((x) => x.id === pid); const items = p.items || []; const w = p.workspace || {};
  const refs = (types, extra) => [...new Set([...items.filter((x) => types.includes(x.type)).map((x) => String(x.ref)), extra].filter(Boolean))];
  const FILEISH = new Set(['file', 'capture', 'render', 'download', 'deploy']);
  return { pid: p.id, chats: refs(['chat'], w.chatId), scenes: refs(['scene', 'seq'], w.sceneId), boards: refs(['board'], w.boardId), notes: p.notes || '', description: w.description || '', items: items.filter((x) => FILEISH.has(x.type)).map((x) => ({ type: x.type, ref: String(x.ref), name: x.name || '', at: x.at || 0 })) };
}
function fixture(dir, label) {
  const sp = specOfProject(dir, 'pjbp0'); const d = { chats: path.join(dir, 'chats'), kv: path.join(dir, 'kv') };
  const mk = (M, lean) => { const env = { ...envOf({ min: 128 * 1024, lean: lean ? BC.BIG : undefined }) }; gc(); gc(); const h0 = process.memoryUsage().heapUsed; const ix = M.createIndex(); let x; let calls = 0; const t0 = performance.now(); do { x = M.run(ix, { spec: sp, dirs: d, budgetMs: 12 }, env); calls += 1; } while (x.left && calls < 5000); const buildMs = performance.now() - t0; gc(); gc(); return { ix, env, heap: process.memoryUsage().heapUsed - h0, buildMs, calls }; };
  const Q = ['portal', 'neon portal', 'kick drum', 'shader', 'render', 'zanzibar84quokka', 'the', 'ri', 'glitch shader noise', 'frame ms draws', 'Here is', 'Users me Hearth data workspace clink', 'tunnel', 'bloom', 'ascii kinetic', 'xylophone', 'camera orbit loop', 'serum', 'vital', 'tris'];
  const res = {};
  for (const [name, M, lean] of [['old', OLD, false], ['new', PF, true]]) {
    const b = mk(M, lean); const T = Date.now(); const times = []; const firsts = []; const outs = [];
    for (let rep = 0; rep < 7; rep++) for (const q of Q) { const t0 = performance.now(); const r = b.ix.query(sp, d, q, { limit: 20, now: T, join: path.join, text: b.env.big.text }); const ms = performance.now() - t0; if (rep) times.push(ms); else { firsts.push(ms); outs.push(strip(r)); } }
    times.sort((x, y) => x - y); firsts.sort((x, y) => x - y);
    const pc = (a, f) => Math.round(a[Math.min(a.length - 1, Math.floor(f * a.length))] * 10) / 10;
    res[name] = { heapMB: Math.round(b.heap / 1e5) / 10, buildMs: Math.round(b.buildMs), slices: b.calls, p50: pc(times, 0.5), p95: pc(times, 0.95), firstP50: pc(firsts, 0.5), firstP95: pc(firsts, 0.95), outs, chars: b.ix.size().chars };
    b.ix.sweep(Date.now() + 1e9);
  }
  const same = res.old.outs.every((o, i) => o === res.new.outs[i]);
  delete res.old.outs; delete res.new.outs;
  ok(`${label}: the same results for ${Q.length} queries; ${JSON.stringify(res)}`, same, res);
  return res;
}

(async () => {
  try { await thread(); } catch (err) { ok('thread ran', false, err.message); }
  try { await hints(); } catch (err) { ok('hints ran', false, err.stack); }
  if (process.env.FINDMEM92_BIG) {
    const d84 = '/tmp/hearth-bigchat84';
    if (!fs.existsSync(path.join(d84, 'chats', 'claude-giant0.json'))) require('./bigchat84-fixture.js').make(d84);
    fixture(d84, 'bigchat84 Clink (63 MB chat)');
    for (const d of ['/tmp/hearth-bigprofile72', '/tmp/hearth-bigprofile70']) if (fs.existsSync(path.join(d, 'kv', 'projects.json'))) { fixture(d, `${path.basename(d)} Clink`); break; }
  }
  fs.rmSync(root, { recursive: true, force: true });
  console.log(`\n${n - fails}/${n} passed`);
  if (fails) { console.log(`FAIL findmem92-test: ${fails} failed`); process.exit(1); }
})();
