#!/usr/bin/env node
// (round 88, bigsave88) A giant chat kept as a PACK (chatpack-core.js: sealed segments, a live tail, a manifest per
// computer). Not wired into the app: these checks hold the core to every promise the plan (docs/upgrades/bigsave88.md)
// builds on:
//   1. byte for byte: the pack read back = JSON.stringify(chat, null, 2) (this computer's file) and = JSON.stringify of
//      the cloud form (compact), and = round 82's save by change (bigchat-core deltaWrite), through every kind of edit
//      and a random walk; a save changes only the tail (or the segment of an old message changed)
//   2. a read failure is never "empty": a missing / short / damaged / zero-filled piece, a cut / garbled / missing
//      manifest, a forged count: an error each time, never a shorter chat
//   3. crash points: a save (and a tidy) stopped at EVERY file operation leaves the old chat or the new one, exactly; the
//      next save works; leftovers go to the pack trash, never anything a manifest names
//   4. two computers through dev/sync-sim.js (sync72's simulated cloud provider: per-computer views, delays, uploads in
//      several ticks, downloads in pieces, placeholders, the provider's own conflict copies): the lane in the plan
//      merges correctly (both sides' messages, a reaction on an old one, a title changed two ways → Kept aside with
//      sync-aside.js), pieces arriving late or out of order wait, a chat never gets shorter; the gate keeps the whole
//      file for a computer that doesn't read packs; an older Hearth's stale whole file merged with keepAll loses nothing
//   node dev/bigsave88-test.js [--bench [--fixture dir] [--keep]] [--seeds N] [--verbose]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const P = require('../chatpack-core');
const BC = require('../bigchat-core');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const VERBOSE = argv.includes('--verbose');
const SEEDS = Number(arg('--seeds', 6));
let failures = 0; let passes = 0;
const ok = (cond, what, detail) => { if (cond) { passes += 1; if (VERBOSE) console.log(`ok ${what}`); } else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)}` : ''}`); } };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-bigsave88-'));
const SMALL = { min: 2048, max: 12 * 1024, every: 4 }; // (small segments: a few-hundred-message chat makes dozens)

// ---------- made-up chats (fixed seeds; never real data) ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const WORDS = ['portal', 'shader', 'naïve', 'café', 'émoji 🎛️', 'tab\there', 'quote"d', 'back\\slash', 'line\nbreak', 'Ķelvin K', 'İstanbul', '\u0007bell', 'lone \ud800 half', 'zero\u0000byte', '日本語', '**bold**', '`code`', '</script>', 'ok'];
function makeMsg(r, i, at) {
  const role = i % 2 ? 'assistant' : 'user';
  const n = 2 + Math.floor(r() * (r() < 0.1 ? 900 : 60));
  const text = Array.from({ length: n }, () => WORDS[Math.floor(r() * WORDS.length)]).join(' ');
  const m = { role, text, at };
  if (role === 'assistant' && r() < 0.6) m.usage = { input: Math.floor(r() * 9000), output: Math.floor(r() * 900) };
  if (role === 'assistant' && r() < 0.3) m.thinking = `thinking ${text.slice(0, 80)}`;
  if (r() < 0.1) m.things = [{ kind: 'file', path: `/Users/owner/Hearth/workspace/f${i}.js` }];
  if (r() < 0.05) m.pinned = true;
  return m;
}
function makeChat(seed, n) {
  const r = rng(seed); const at0 = 1.7e12 + seed * 1e6;
  return { id: `claude-pack${seed}`, agentId: 'claude', title: `Pack chat ${seed}`, createdAt: at0, updatedAt: at0 + n * 1000, model: 'opus', session: { id: `s${seed}` }, messages: Array.from({ length: n }, (_, i) => makeMsg(r, i, at0 + i * 1000)) };
}
const pretty = (c) => JSON.stringify(c, null, 2);
const compact = (c) => JSON.stringify(c);
const sha = (b) => crypto.createHash('sha1').update(b).digest('hex');

// a pack kept as a store would keep it: this computer's file (pretty) or the cloud form (compact), saved by change
function keeper(dir, layout, by = 'pc') {
  const k = { dir, layout, by, m: null, info: [], bytes: [], stats: [] };
  k.save = (chat, changed, took) => {
    const text = layout === 'pretty' ? pretty(chat) : compact(chat);
    const sp = P.split(Buffer.from(text, 'utf8'));
    if (!sp || sp.layout !== layout) throw new Error(`split: ${sp?.layout}`);
    // what changed: given (as the window knows it), else found by comparing bytes (a test's own bookkeeping)
    if (!changed) { changed = new Set(); for (let i = 0; i < sp.n; i++) if (!k.bytes[i] || !k.bytes[i].equals(sp.bytesOf(i))) changed.add(i); }
    const r = P.write(fs, dir, { id: chat.id, by, layout, pre: sp.pre, post: sp.post, n: sp.n, bytesOf: sp.bytesOf, info: k.info, prev: k.m, changed, cut: SMALL, fsync: false, took });
    k.m = r.m; k.info = r.info; k.bytes = Array.from({ length: sp.n }, (_, i) => Buffer.from(sp.bytesOf(i)));
    k.stats.push(r);
    return { r, text };
  };
  k.read = () => P.read(fs, dir, by).buf.toString('utf8');
  return k;
}

// ---------- 1. byte for byte, every kind of edit ----------
function edits() {
  const kinds = {
    'new message': (c, r) => { c.messages.push(makeMsg(r, c.messages.length, c.updatedAt + 1)); c.updatedAt += 1; },
    'a reply arrives': (c, r) => { const m = makeMsg(r, 1, c.updatedAt + 2); m.role = 'assistant'; c.messages.push(m); c.updatedAt += 2; },
    'a reaction on an old message': (c, r) => { const m = c.messages[Math.floor(r() * Math.max(1, c.messages.length / 3))]; if (m) m.reaction = '👍'; },
    'an old message edited longer': (c, r) => { const m = c.messages[Math.floor(r() * c.messages.length)]; if (m) m.text += ` ${'more words '.repeat(200)}`; },
    'an old message edited shorter': (c, r) => { const m = c.messages[Math.floor(r() * c.messages.length)]; if (m) m.text = m.text.slice(0, 5); },
    'pin / bookmark an old one': (c, r) => { const m = c.messages[Math.floor(r() * c.messages.length)]; if (m) { m.pinned = !m.pinned; m.bookmark = 'b'; } },
    'edit-from-here (cut, then a new message)': (c, r) => { const k = Math.max(1, Math.floor(c.messages.length * (0.3 + r() * 0.6))); c.messages.length = k; c.messages.push(makeMsg(r, k, c.updatedAt + 3)); c.updatedAt += 3; },
    'retry (last reply replaced)': (c, r) => { if (c.messages.length) c.messages.pop(); const m = makeMsg(r, 1, c.updatedAt + 4); m.role = 'assistant'; c.messages.push(m); },
    'the last message deleted': (c) => { c.messages.pop(); },
    'its own fields (title, session, a new key)': (c) => { c.title = `${c.title} ✎`; c.session = { id: 'new', at: 5 }; c.compact = { upto: 3 }; },
    'a field removed': (c) => { delete c.session; delete c.model; },
    'everything cut (empty)': (c) => { c.messages.length = 0; },
    'one message after empty': (c, r) => { c.messages.push(makeMsg(r, 0, 9)); },
  };
  return kinds;
}
function byteForByte() {
  const kinds = edits();
  for (const layout of ['pretty', 'compact']) {
    const chat = makeChat(1, 400);
    const k = keeper(path.join(ROOT, `eq-${layout}`), layout);
    const s0 = k.save(chat);
    ok(k.read() === s0.text, `${layout}: the first pack read back = the whole file`);
    ok(k.m.segs.length > 8 && k.m.sealed >= k.m.segs.length - 1, `${layout}: cut into sealed segments + a tail`, { segs: k.m.segs.length, sealed: k.m.sealed });
    const r = rng(7);
    for (const [name, fn] of Object.entries(kinds)) {
      fn(chat, r);
      const { r: w, text } = k.save(chat);
      ok(k.read() === text, `${layout}: ${name} → the pack = the whole file, byte for byte`);
      if (name === 'new message' || name === 'a reply arrives') {
        const tail = k.m.segs.at(-1);
        ok(w.pieces <= 2 && w.wrote <= SMALL.max * 2 + 70000, `${layout}: ${name} → only the tail written`, { pieces: w.pieces, wrote: w.wrote, reused: w.reused, tail: tail?.b });
      }
      if (name === 'a reaction on an old message') ok(w.pieces <= 3 && w.reused >= k.m.segs.length - 3, `${layout}: ${name} → its segment (and at most the next) written, the rest kept`, { pieces: w.pieces, reused: w.reused, segs: k.m.segs.length });
    }
  }
  // a random walk of 60 edits, both layouts, several seeds; the pack read back every time
  for (let seed = 1; seed <= SEEDS; seed++) {
    for (const layout of ['pretty', 'compact']) {
      const r = rng(seed * 31 + (layout === 'pretty' ? 1 : 2));
      const chat = makeChat(seed + 10, 50 + Math.floor(r() * 300));
      const k = keeper(path.join(ROOT, `walk-${seed}-${layout}`), layout);
      k.save(chat);
      const names = Object.keys(kinds).filter((n) => n !== 'everything cut (empty)');
      let bad = 0; let steps = 0;
      for (let i = 0; i < 60; i++) {
        const name = names[Math.floor(r() * names.length)];
        kinds[name](chat, r);
        const { text } = k.save(chat); steps += 1;
        if (k.read() !== text) { bad += 1; if (VERBOSE) console.log('walk differs after', name); }
      }
      ok(bad === 0, `random walk (seed ${seed}, ${layout}): ${steps} saves, every pack = the whole file`, { bad });
    }
  }
  // = round 82's save by change (deltaWrite: the store thread's chatDelta) through a reply and an old reaction
  {
    const chat = makeChat(3, 300);
    const file = path.join(ROOT, 'delta.json'); fs.writeFileSync(file, pretty(chat));
    const buf = fs.readFileSync(file); const cut = BC.scanBuf(buf); const st = fs.statSync(file);
    const e = { head: BC.headOf(buf, cut), els: cut.els, sig: `${st.size}:${st.mtimeMs}` };
    const k = keeper(path.join(ROOT, 'delta-pack'), 'pretty'); k.save(chat);
    chat.messages.push(makeMsg(rng(5), 300, 99)); chat.messages[10].reaction = '🎉'; chat.updatedAt = 42;
    const d = { keys: Object.keys(chat), set: { updatedAt: 42 }, n: chat.messages.length, msgs: [[10, chat.messages[10]], [300, chat.messages[300]]] };
    BC.deltaWrite(fs, file, `${file}.tmp`, e, d, { fsync: false });
    k.save(chat, new Set([10, 300]));
    ok(fs.readFileSync(`${file}.tmp`, 'utf8') === k.read(), 'the pack = round 82\'s save by change (deltaWrite), byte for byte');
  }
  // split() of the file the app wrote, both layouts; a file not laid out as the app writes: null (the whole-file way)
  {
    const chat = makeChat(4, 30);
    ok(P.split(Buffer.from(pretty(chat)))?.layout === 'pretty' && P.split(Buffer.from(compact(chat)))?.layout === 'compact', 'split: pretty and compact files recognised');
    ok(P.split(Buffer.from(JSON.stringify(chat, null, 4))) === null && P.split(Buffer.from('{"messages":[1, 2]}')) === null && P.split(Buffer.from('{"id":')) === null, 'split: another layout / a cut file → null (never a guess)');
    const empty = { ...chat, messages: [] };
    for (const t of [pretty(empty), compact(empty)]) {
      const sp = P.split(Buffer.from(t)); const dir = path.join(ROOT, `empty-${sp.layout}`);
      P.write(fs, dir, { id: 'e', by: 'pc', layout: sp.layout, pre: sp.pre, post: sp.post, n: 0, bytesOf: sp.bytesOf, fsync: false });
      ok(P.read(fs, dir, 'pc').buf.toString() === t, `an empty chat (${sp.layout}) read back exactly`);
    }
  }
  // the cut: the same messages make the same segments (two computers, two saves), whatever came before the change
  {
    const a = makeChat(5, 500); const b = JSON.parse(JSON.stringify(a));
    const ka = keeper(path.join(ROOT, 'same-a'), 'compact', 'pc'); const kb = keeper(path.join(ROOT, 'same-b'), 'compact', 'mac');
    ka.save(a); for (let i = 0; i < 5; i++) { b.messages.push(makeMsg(rng(i), 1, 5)); kb.save(b); b.messages.pop(); kb.save(b); }
    ok(JSON.stringify(ka.m.segs) === JSON.stringify(kb.m.segs), 'the same messages → the same segments on two computers, after any history of saves');
  }
}

// ---------- 2. a read failure is never "empty" ----------
function failures2() {
  const chat = makeChat(6, 200);
  const base = path.join(ROOT, 'fail');
  const fresh = () => { fs.rmSync(base, { recursive: true, force: true }); const k = keeper(base, 'pretty'); k.save(chat); return k; };
  const throwsCode = (fn) => { try { const r = fn(); return `returned ${r?.buf?.length}`; } catch (err) { return err instanceof P.PackError ? err.code : `other: ${err.message}`; } };
  let k = fresh(); const seg = (i) => path.join(base, `${k.m.segs[i].h}.seg`);
  fs.rmSync(seg(3)); ok(throwsCode(() => P.read(fs, base, 'pc')) === 'segment-missing', 'a segment missing → an error (never a shorter chat)');
  k = fresh(); fs.truncateSync(seg(2), 100); ok(throwsCode(() => P.read(fs, base, 'pc')) === 'segment-bad', 'a segment cut short (a download in pieces) → an error');
  k = fresh(); { const n = fs.statSync(seg(1)).size; fs.writeFileSync(seg(1), Buffer.alloc(n)); } ok(throwsCode(() => P.read(fs, base, 'pc')) === 'segment-bad', 'a segment of zeros, right size (a placeholder) → an error');
  k = fresh(); { const b = fs.readFileSync(seg(0)); b[b.length >> 1] ^= 1; fs.writeFileSync(seg(0), b); } ok(throwsCode(() => P.read(fs, base, 'pc')) === 'segment-bad', 'a damaged segment → an error');
  k = fresh(); { const f = path.join(base, P.manifestName('pc')); const t = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, t.slice(0, t.length - 40)); } ok(throwsCode(() => P.read(fs, base, 'pc')) === 'manifest-bad', 'a manifest cut short → an error');
  k = fresh(); { const f = path.join(base, P.manifestName('pc')); const m = JSON.parse(fs.readFileSync(f, 'utf8')); m.n -= 1; fs.writeFileSync(f, JSON.stringify(m)); } ok(throwsCode(() => P.read(fs, base, 'pc')) === 'manifest-bad', 'a manifest edited (its sum doesn\'t match) → an error');
  k = fresh(); { const f = path.join(base, P.manifestName('pc')); const m = JSON.parse(fs.readFileSync(f, 'utf8')); m.segs[0].n += 1; m.n += 1; fs.writeFileSync(f, P.manifestText(m)); } ok(throwsCode(() => P.read(fs, base, 'pc')) === 'count', 'a manifest whose count is wrong (sum made right) → an error from the bytes\' own count');
  k = fresh(); fs.rmSync(path.join(base, P.manifestName('pc'))); ok(throwsCode(() => P.read(fs, base, 'pc')) === 'manifest-missing', 'no manifest → "missing", an error (the caller never reads it as no chat)');
  k = fresh(); { const f = path.join(base, P.manifestName('pc')); const m = JSON.parse(fs.readFileSync(f, 'utf8')); m.hearthChatPack = 2; fs.writeFileSync(f, P.manifestText(m)); } ok(throwsCode(() => P.read(fs, base, 'pc')) === 'manifest-newer', 'a newer pack format → refused (never half-read)');
  k = fresh(); { const f = path.join(base, P.manifestName('pc')); const m = JSON.parse(fs.readFileSync(f, 'utf8')); m.segs.push({ h: m.segs[0].h, n: 1, b: m.segs[0].b }); m.n += 1; fs.writeFileSync(f, P.manifestText(m)); } ok(['manifest-bad', 'count'].includes(throwsCode(() => P.read(fs, base, 'pc'))), 'two open tails / a wrong shape → refused');
  // a folder that can't be listed is an error too; a manifest that can't be read holds tidy (nothing moved)
  k = fresh(); fs.writeFileSync(path.join(base, P.manifestName('mac')), '{"hearthChatPack":1,'); fs.writeFileSync(path.join(base, `${'0'.repeat(40)}.seg`), 'x');
  ok(P.tidy(fs, base, { grace: 0 }).held === 'manifest' && fs.existsSync(path.join(base, `${'0'.repeat(40)}.seg`)), 'tidy: a manifest that can\'t be read (another computer\'s, arriving) → nothing moved');
  ok(P.news(fs, base, 'pc').waiting.some((x) => x.by === 'mac' && x.why === 'manifest-bad'), 'news: a peer manifest that can\'t be read → waiting, not taken');
}

// ---------- 3. crash points ----------
const MUT = ['openSync', 'writeSync', 'fsyncSync', 'closeSync', 'renameSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'writeFileSync', 'truncateSync'];
function crashFs(at) {
  // (a crash is the end of the process: once it happened, every later file operation fails too, even one a caller
  // would shrug off, like a flush the disk can't do)
  let n = 0; let dead = false; const f = Object.create(fs);
  for (const k of MUT) f[k] = (...a) => { if (k === 'openSync' && !/w|a|\+/.test(String(a[1] || 'r'))) return fs[k](...a); n += 1; if (n === at || dead) { dead = true; const e = new Error(`crash at op ${at} (${k})`); e.crash = true; throw e; } return fs[k](...a); };
  f.count = () => n;
  return f;
}
function crashPoints() {
  for (const layout of ['pretty', 'compact']) {
    const chat = makeChat(8, 260);
    const steps = [
      (c, r) => { c.messages.push(makeMsg(r, 1, 7)); c.updatedAt += 1; },
      (c) => { c.messages[3].reaction = '🔥'; },
      (c, r) => { c.messages.length = 100; c.messages.push(makeMsg(r, 2, 8)); },
      (c) => { c.title = 'renamed'; },
      (c, r) => { for (let i = 0; i < 40; i++) c.messages.push(makeMsg(r, i, 9 + i)); }, // (seals several segments)
    ];
    let points = 0; let bad = 0; let after = 0;
    steps.forEach((step, si) => {
      // the count of file operations a clean save of this step takes
      const prep = () => { const dir = path.join(ROOT, `crash-${layout}`); fs.rmSync(dir, { recursive: true, force: true }); const k = keeper(dir, layout); const c = JSON.parse(JSON.stringify(chat)); k.save(c); const oldText = layout === 'pretty' ? pretty(c) : compact(c); step(c, rng(si + 1)); return { dir, k, c, oldText, newText: layout === 'pretty' ? pretty(c) : compact(c) }; };
      const probe = prep(); const cf = crashFs(0);
      const sp = P.split(Buffer.from(probe.newText));
      P.write(cf, probe.dir, { id: probe.c.id, by: 'pc', layout, pre: sp.pre, post: sp.post, n: sp.n, bytesOf: sp.bytesOf, info: probe.k.info, prev: probe.k.m, cut: SMALL, changed: changedOf(probe.k, sp) });
      const total = cf.count();
      for (let at = 1; at <= total; at++) {
        const t = prep(); const s2 = P.split(Buffer.from(t.newText));
        let threw = false;
        try { P.write(crashFs(at), t.dir, { id: t.c.id, by: 'pc', layout, pre: s2.pre, post: s2.post, n: s2.n, bytesOf: s2.bytesOf, info: t.k.info, prev: t.k.m, cut: SMALL, changed: changedOf(t.k, s2) }); } catch (err) { threw = Boolean(err.crash); }
        points += 1;
        // after the crash (a restart: nothing in memory), what's on disk reads as the old chat or the new one, exactly
        let got = null; try { got = P.read(fs, t.dir, 'pc').buf.toString('utf8'); } catch (err) { got = `error ${err.code}`; }
        if (!threw || (got !== t.oldText && got !== t.newText)) { bad += 1; if (VERBOSE) console.log('crash point', layout, si, at, threw, String(got).slice(0, 60)); }
        // the next save (from scratch: the restart's first) works, and a tidy right after moves only leftovers
        const k2 = keeper(t.dir, layout); k2.m = (() => { try { return P.readManifest(fs, path.join(t.dir, P.manifestName('pc'))); } catch { return null; } })();
        t.c.updatedAt += 5; k2.save(t.c);
        P.tidy(fs, t.dir, { grace: 0, trash: path.join(ROOT, 'crash-trash') });
        let again = null; try { again = P.read(fs, t.dir, 'pc').buf.toString('utf8'); } catch (err) { again = `error ${err.code}`; }
        if (again === (layout === 'pretty' ? pretty(t.c) : compact(t.c)) && !fs.readdirSync(t.dir).some((f) => /\.tmp/.test(f))) after += 1; else if (VERBOSE) console.log('after crash', layout, si, at, String(again).slice(0, 60));
      }
    });
    ok(bad === 0, `${layout}: a save stopped at every file operation (${points} crash points over ${steps.length} kinds of save) → the old chat or the new one, exactly`, { bad });
    ok(after === points, `${layout}: after each crash the next save works and tidy leaves no temp file`, { after, points });
  }
  // tidy stopped at every move: whatever it moved was unreferenced; the chat reads the same
  {
    const dir = path.join(ROOT, 'crash-tidy'); fs.rmSync(dir, { recursive: true, force: true });
    const k = keeper(dir, 'compact'); const c = makeChat(9, 300); k.save(c);
    for (let i = 0; i < 6; i++) { c.messages[i * 40].reaction = String(i); k.save(c); }
    const want = compact(c); let bad = 0; let moves = 0;
    for (let at = 1; at < 40; at++) {
      try { P.tidy(crashFs(at), dir, { grace: 0, trash: path.join(ROOT, 'crash-trash2') }); } catch { /* crashed */ }
      let got; try { got = P.read(fs, dir, 'pc').buf.toString('utf8'); } catch (err) { got = err.code; }
      if (got !== want) bad += 1;
    }
    moves = fs.readdirSync(path.join(ROOT, 'crash-trash2'), { recursive: true }).filter((f) => /\.seg$/.test(f)).length;
    ok(bad === 0 && moves > 0, 'tidy stopped at every move: only unreferenced pieces moved (to the pack trash), the chat reads the same', { bad, moves });
    const T = path.join(ROOT, 'crash-trash2'); const old = path.join(T, '2020-01-01'); fs.mkdirSync(old, { recursive: true });
    ok(P.purge(fs, T) === 1 && fs.readdirSync(T).length >= 1, 'the pack trash keeps 30 days (an older day let go, today\'s kept)');
  }
}
function changedOf(k, sp) { const s = new Set(); for (let i = 0; i < sp.n; i++) if (!k.bytes[i] || !k.bytes[i].equals(sp.bytesOf(i))) s.add(i); return s; }

// ---------- 4. two computers (sync72's simulated cloud provider) ----------
async function twoComputers() {
  const Sim = require('./sync-sim');
  Sim.install();
  const S = require('../sync-merge');
  const { createAside } = require('../sync-aside');
  const ID = 'claude-giant-sim';
  // a computer: its data folder (this computer's chat file, pretty), its view of the cloud drive, and the PACK LANE:
  // its cloud-form pack in Hearth/packs/chats/<id>/ (its own manifest), the peers' manifests taken when whole
  function computer(w, name, o = {}) {
    const base = path.join(w.dir, name);
    const m = { name, data: path.join(base, 'data'), cloud: path.join(base, 'cloud'), ctx: { dataDir: path.join(base, 'data'), cloudRoot: path.join(base, 'cloud'), home: path.join(base, 'home'), win: name === 'PC' } };
    fs.mkdirSync(path.join(m.data, 'chats'), { recursive: true });
    m.view = w.cloud.view(m.cloud, { name, style: o.style || (name === 'PC' ? 'onedrive' : 'icloud'), partialDown: o.partialDown, slowUp: o.slowUp, upTicks: o.upTicks, downTicks: o.downTicks, now: () => w.t });
    m.packDir = path.join(m.cloud, 'Hearth', 'packs', 'chats', ID);
    m.file = path.join(m.data, 'chats', `${ID}.json`);
    m.keep = keeper(m.packDir, 'compact', name);
    m.seen = {}; m.last = {}; m.mine = new Map(); m.ops = 0; m.published = null; m.counts = []; m.waits = 0;
    m.aside = createAside({ stateDir: path.join(m.data, 'sync'), now: () => w.t });
    m.chat = () => JSON.parse(fs.readFileSync(m.file, 'utf8'));
    m.write = (c) => { fs.writeFileSync(m.file, pretty(c)); };
    m.edit = (fn) => { const c = m.chat(); fn(c); m.write(c); };
    // one lane pass: take what peers published (only a manifest whose pieces are all here, read whole), merge each into
    // this computer's chat three-way, then publish this computer's chat if it changed. The base (the newest version
    // both sides are known to have had): each manifest says which of this computer's versions it took in (took); the
    // last version taken from that peer, or this computer's version it took, whichever came later; when that can't be
    // told, the merge keeps everything (keepAll: nothing removed). A field changed two ways: the newer chat wins
    // (updatedAt, then the computer's name: the same answer on both), the other side's whole version Kept aside.
    m.pass = () => {
      const { fresh, waiting } = P.news(fs, m.packDir, name, m.seen);
      if (waiting.length) m.waits += 1;
      if (process.env.BS88_DEBUG) console.log(name, 'news', fresh.map((x) => `${x.by}#${x.m.seq}:${x.m.n}`), waiting, m.chat().messages.length);
      let ours = S.toCloud(m.chat(), m.ctx);
      for (const { by, m: man } of fresh) {
        let theirs;
        try { theirs = JSON.parse(P.read(fs, m.packDir, man).buf.toString('utf8')); } catch { m.waits += 1; continue; } // (a piece still arriving: next pass, never a shorter chat)
        const b = man.took?.[P.safeBy(name)] || 0;
        const last = m.last[by]; const mine = m.mine.get(b);
        let base = null; let keepAll = Boolean(o.keepAll);
        if (last && last.took >= b) base = last.value;
        else if (mine && (!last || mine.at > last.at)) base = mine.value;
        else if (last || mine) { base = (last || mine).value; keepAll = true; }
        let r = S.merge3(base, ours, theirs, { keepAll });
        if (r.conflicts.length) {
          const theirsWin = (theirs.updatedAt || 0) > (ours.updatedAt || 0) || ((theirs.updatedAt || 0) === (ours.updatedAt || 0) && by > P.safeBy(name));
          const lost = theirsWin ? ours : theirs;
          if (theirsWin) r = S.merge3(base, theirs, ours, { keepAll });
          m.aside.keepText(`chats/${ID}.json`, JSON.stringify(lost), { why: 'conflict', from: theirsWin ? name : by, kind: 'chat' }); // (Kept aside: the losing side's version, whole)
        }
        ours = S.eq(r.value, theirs) ? theirs : r.value; // (the same chat: taken as they wrote it, keys in their order, so both settle on one text)
        m.seen[by] = man.seq; m.last[by] = { seq: man.seq, took: b, value: theirs, at: ++m.ops };
        m.write(S.fromCloud(ours, m.ctx));
      }
      m.counts.push(m.chat().messages.length);
      const text = compact(ours);
      if (text !== m.published) { m.keep.save(ours, null, { ...m.seen }); m.published = text; m.mine.set(m.keep.m.seq, { value: ours, at: ++m.ops }); }
    };
    return m;
  }
  function world(name, seed, o = {}) {
    const w = { dir: path.join(ROOT, `sim-${name}`), t: 1.75e12, cloud: Sim.cloud({}), seed };
    fs.mkdirSync(w.dir, { recursive: true });
    w.pc = computer(w, 'PC', o.pc || {}); w.mac = computer(w, 'Mac', o.mac || {});
    w.r = rng(seed);
    w.round = (order) => { w.t += 2000; for (const m of order || (w.r() < 0.5 ? [w.pc, w.mac] : [w.mac, w.pc])) { m.view.tick(); if (!m.offline) m.pass(); } };
    // settled: both chats the same and each computer has taken the other one's newest manifest (the simulated provider's own idle() keeps a
    // slow upload "in flight" when the same content-addressed piece came down from the other computer first: a quirk of
    // the simulator, not of the lane)
    w.settle = (max = 80) => { for (let i = 0; i < max; i++) { w.round(); const took = (a, b) => !b.keep.m || (a.seen[P.safeBy(b.name)] || 0) >= b.keep.m.seq; if (i > 2 && took(w.pc, w.mac) && took(w.mac, w.pc) && compact(S.toCloud(w.pc.chat(), w.pc.ctx)) === compact(S.toCloud(w.mac.chat(), w.mac.ctx))) return i; } return -1; };
    return w;
  }
  const texts = (m) => m.chat().messages.map((x) => x.text);
  const never = (m) => m.counts.every((n, i) => i === 0 || n >= m.counts[i - 1]);
  const start = (w, n = 600) => { const c = makeChat(20, n); c.id = ID; w.pc.write(c); w.mac.write(JSON.parse(JSON.stringify(c))); w.pc.pass(); w.mac.pass(); return c; };

  // a. turns: the PC sends, the Mac answers, a few exchanges; slow uploads (a segment takes 3 ticks, the manifest one)
  {
    const w = world('turns', 1, { pc: { slowUp: 4096, upTicks: 3 }, mac: { slowUp: 4096, upTicks: 3, partialDown: 4096, downTicks: 2 } });
    start(w);
    const said = [];
    for (let i = 0; i < 6; i++) {
      const who = i % 2 ? w.mac : w.pc; const t = `turn ${i} from ${who.name} ${'x'.repeat(i * 3000)}`; said.push(t);
      who.edit((c) => c.messages.push({ role: 'user', text: t, at: 1.76e12 + i }));
      for (let j = 0; j < 6; j++) w.round();
    }
    const n = w.settle();
    ok(n >= 0, 'packs, turns with slow uploads and downloads in pieces: both computers end the same', { n });
    ok(said.every((t) => texts(w.pc).includes(t) && texts(w.mac).includes(t)), 'every message from either computer is on both');
    ok(never(w.pc) && never(w.mac), 'a chat never got shorter on either computer while pieces were arriving', { pc: w.pc.counts.slice(-20), mac: w.mac.counts.slice(-20) });
    ok(w.pc.waits + w.mac.waits > 0, 'manifests did arrive before their segments (and waited)', { pc: w.pc.waits, mac: w.mac.waits });
    const up = w.pc.view.stats.up + w.mac.view.stats.up;
    ok(up > 0, 'the provider moved pieces', { up });
  }
  // b. both offline, both write (new messages, a reaction on an old one, the title two ways), then back online
  {
    const w = world('both', 2);
    start(w);
    w.pc.offline = true; w.mac.offline = true; w.pc.view.online = false; w.mac.view.online = false;
    w.pc.edit((c) => { c.messages.push({ role: 'user', text: 'PC offline 1', at: 1.77e12 + 1 }); c.messages[5].reaction = '👍'; c.title = 'PC title'; });
    w.mac.edit((c) => { c.messages.push({ role: 'user', text: 'Mac offline 1', at: 1.77e12 + 2 }); c.messages[400].pinned = true; c.title = 'Mac title'; });
    w.pc.pass(); w.mac.pass(); // (each publishes into its own view; the provider is offline)
    w.pc.edit((c) => c.messages.push({ role: 'assistant', text: 'PC offline 2', at: 1.77e12 + 3 }));
    w.mac.edit((c) => c.messages.push({ role: 'assistant', text: 'Mac offline 2', at: 1.77e12 + 4 }));
    w.pc.pass(); w.mac.pass();
    w.pc.offline = false; w.mac.offline = false; w.pc.view.online = true; w.mac.view.online = true;
    const n = w.settle();
    const c = w.pc.chat();
    ok(n >= 0, 'both wrote offline: merged, both computers the same', { n });
    ok(['PC offline 1', 'PC offline 2', 'Mac offline 1', 'Mac offline 2'].every((t) => texts(w.pc).includes(t)), 'both sides\' new messages kept, in time order', texts(w.pc).slice(-5));
    ok(c.messages[5].reaction === '👍' && c.messages[400].pinned === true, 'a reaction on an old message (PC) and a pin on another (Mac) both kept');
    const dup = texts(w.pc).filter((t, i, a) => a.indexOf(t) !== i && /offline/.test(t));
    ok(!dup.length, 'nothing doubled', dup);
    const notes = w.pc.aside.list().concat(w.mac.aside.list());
    ok(notes.some((x) => x.why === 'conflict') && notes.every((x) => fs.existsSync(path.join(notes.includes(x) && w.pc.aside.list().includes(x) ? w.pc.data : w.mac.data, 'sync', 'trash', x.trash.replace(/^here:/, '')))), 'the title changed two ways: one side wins, the other side\'s whole version Kept aside (sync-aside, in Deleted files)', notes.map((x) => x.trash));
    ok(never(w.pc) && never(w.mac), 'never shorter');
  }
  // c. randomized: both computers add, react, rename at random, with slow / partial transfers and provider copies
  for (let seed = 1; seed <= Math.max(2, Math.floor(SEEDS / 2)); seed++) {
    const w = world(`rand${seed}`, 100 + seed, { pc: { slowUp: 8192, upTicks: 2, partialDown: 8192 }, mac: { slowUp: 2048, upTicks: 4, partialDown: 2048, downTicks: 3, style: seed % 2 ? 'dropbox' : 'icloud' } });
    start(w, 300 + seed * 50);
    const said = []; let k = 0;
    for (let i = 0; i < 40; i++) {
      const who = w.r() < 0.5 ? w.pc : w.mac;
      const x = w.r();
      if (x < 0.6) { const t = `r${seed}-${k++} ${who.name}`; said.push(t); who.edit((c) => c.messages.push({ role: w.r() < 0.5 ? 'user' : 'assistant', text: t, at: 1.78e12 + k * 10 + (who === w.pc ? 1 : 2) })); } else if (x < 0.85) who.edit((c) => { c.messages[Math.floor(w.r() * 200)].reaction = who.name; }); else who.edit((c) => { c.title = `t${i} ${who.name}`; });
      if (w.r() < 0.6) w.round();
    }
    const n = w.settle(120);
    ok(n >= 0 && said.every((t) => texts(w.pc).includes(t) && texts(w.mac).includes(t)), `randomized ${seed}: converged, every message from either side on both`, { n, missing: said.filter((t) => !texts(w.pc).includes(t)).slice(0, 4) });
    ok(never(w.pc) && never(w.mac), `randomized ${seed}: never shorter on either computer`);
    // tidy on both (grace 0: the harshest) then more rounds: still readable, still converged
    for (const m of [w.pc, w.mac]) P.tidy(fs, m.packDir, { grace: 0 });
    w.pc.edit((c) => c.messages.push({ role: 'user', text: `after tidy ${seed}`, at: 1.79e12 }));
    ok(w.settle(120) >= 0 && texts(w.mac).includes(`after tidy ${seed}`), `randomized ${seed}: tidy on both computers, a new message still arrives`);
  }
  // d. a segment that never arrives (deleted on the server): the receiver waits, never takes a shorter chat
  {
    const w = world('lost', 3);
    start(w);
    w.pc.edit((c) => { for (let i = 0; i < 30; i++) c.messages.push({ role: 'user', text: `burst ${i} ${'y'.repeat(2000)}`, at: 1.8e12 + i }); });
    w.pc.pass();
    // the PC's newest segment is lost before it reaches the Mac (the provider drops it from the server)
    w.pc.view.tick();
    const tailH = w.pc.keep.m.segs.at(-1).h;
    for (const [key] of w.cloud.server) if (key.includes(tailH)) w.cloud.server.delete(key);
    for (let i = 0; i < 4; i++) { w.mac.view.tick(); w.mac.pass(); }
    ok(!texts(w.mac).includes('burst 29') && w.mac.waits > 0 && never(w.mac), 'a segment that never arrives: the other computer waits (its chat as it was), never a shorter one', { waits: w.mac.waits });
    ok(fs.existsSync(path.join(w.pc.packDir, `${tailH}.seg`)), 'the writer still has it (its own view)');
  }
  // e. the gate: a computer whose record doesn't say it reads packs keeps the whole file; an older Hearth's stale whole
  //    file merged with keepAll never removes the messages the packs brought
  {
    ok(!P.packsAllowed([{ name: 'Mac', format: 74 }]).ok && !P.packsAllowed([{ name: 'Mac', format: 88 }]).ok && !P.packsAllowed([null]).ok && P.packsAllowed([{ format: 88, packs: 1 }]).ok && P.packsAllowed([]).ok && !P.packsAllowed([], { packs: 0 }).ok, 'gate: packs only when every other computer\'s record says it reads them (format ≥ 88, packs ≥ 1)');
    const base = makeChat(30, 20); const ours = JSON.parse(JSON.stringify(base)); ours.messages.push({ role: 'user', text: 'via packs', at: 2e12 });
    const stale = JSON.parse(JSON.stringify(base)); stale.messages.length = 15; stale.messages.push({ role: 'user', text: 'from the older Hearth', at: 2e12 + 1 });
    const plain = S.merge3(ours, ours, stale).value; const kept = S.merge3(ours, ours, stale, { keepAll: true }).value;
    ok(plain.messages.length < ours.messages.length, 'without keepAll, a stale whole file written by an older Hearth would remove messages (why the plan needs it)');
    ok(kept.messages.length === ours.messages.length + 1 && kept.messages.some((x) => x.text === 'from the older Hearth') && kept.messages.some((x) => x.text === 'via packs'), 'with keepAll: nothing removed, the older Hearth\'s message added');
  }
  // f. the whole file still syncs as today when the gate says no: the real engine, two computers (sync72's way)
  {
    const { createEngine } = require('../sync-engine');
    const wdir = path.join(ROOT, 'sim-engine'); const cl = Sim.cloud({}); let t = 1.75e12;
    const mk = (name) => {
      const b = path.join(wdir, name); const data = path.join(b, 'data'); const home = path.join(b, 'home'); const cloudRoot = path.join(b, 'cloud');
      Sim.ciVolume(data); fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(path.join(b, 'app'), { recursive: true });
      fs.writeFileSync(path.join(b, 'app', 'config.json'), JSON.stringify({ agents: [], settings: { sync: { on: true } } }, null, 2)); fs.writeFileSync(path.join(b, 'app', 'theme.css'), '/* */\n');
      const view = cl.view(cloudRoot, { name, style: name === 'PC' ? 'onedrive' : 'icloud', now: () => t });
      const e = createEngine({ dataDir: data, configPath: path.join(b, 'app', 'config.json'), themePath: path.join(b, 'app', 'theme.css'), cloudRoot, machineName: name, home, platform: name === 'PC' ? 'win32' : 'darwin', now: () => t, chunk: 256 * 1024, cloudAttributes: view.attributes, requestDownload: (f) => view.request(f) });
      return { name, data, view, e, file: path.join(data, 'chats', `${ID}.json`) };
    };
    const pc = mk('PC'); const mac = mk('Mac');
    const c = makeChat(40, 200); c.id = ID; fs.mkdirSync(path.join(pc.data, 'chats'), { recursive: true }); fs.writeFileSync(pc.file, pretty(c));
    const machines = () => { try { return fs.readdirSync(path.join(pc.view.dir, 'Hearth', '.sync', 'machines')).map((f) => JSON.parse(fs.readFileSync(path.join(pc.view.dir, 'Hearth', '.sync', 'machines', f), 'utf8'))); } catch { return []; } };
    let same = false;
    for (let i = 0; i < 40 && !same; i++) {
      t += 2000; for (const m of [pc, mac]) { m.view.tick(); await m.e.pass(); }
      try { same = fs.readFileSync(mac.file, 'utf8') === fs.readFileSync(pc.file, 'utf8'); } catch { same = false; }
    }
    const peers = machines().filter((x) => x.name !== 'PC');
    ok(peers.length === 1 && !P.packsAllowed(peers).ok && same, 'today\'s computers (records without packs): the gate says no, the whole file syncs through the engine as before', { peers: peers.map((x) => ({ name: x.name, format: x.format })), same });
    for (const m of [pc, mac]) { try { m.e.stop?.(); } catch { /* fine */ } }
  }
}

// ---------- bench (--bench): the real costs per exchange in a giant chat, today and with packs ----------
async function bench() {
  const { Worker } = require('worker_threads');
  const v8 = require('v8');
  const S = require('../sync-merge');
  const dir = arg('--fixture', path.join(os.tmpdir(), 'hearth-bigsave88-fixture'));
  const GIANT = path.join(dir, 'chats', 'claude-giant0.json');
  const made = !fs.existsSync(GIANT);
  if (made) require('./bigprofile').bigprofile(dir, { chats: 5, long: 1, projects: 0, giant: 1 });
  const out = { at: new Date().toISOString(), load: os.loadavg()[0], cpus: os.cpus().length };
  const r1 = (x) => Math.round(x * 10) / 10; const MB = (b) => Math.round((b / 1e6) * 100) / 100;
  const w = new Worker(path.join(__dirname, '..', 'storework.js')); let seq = 0; const jobs = new Map();
  w.on('message', ({ id, res, err, ms }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve({ res, ms }); });
  const op = (msg) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); });
  const med = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-bigsave88-bench-'));
  try {
    const sf = path.join(work, 'chat.json'); fs.copyFileSync(GIANT, sf);
    const chat = JSON.parse(fs.readFileSync(sf, 'utf8'));
    out.giant = { mb: MB(fs.statSync(sf).size), messages: chat.messages.length };
    // ---- today: an exchange = 2 saves by change (your message; the reply), on the store thread ----
    await op({ op: 'chatOpen', file: sf, ver: 'v0', part: 64 * 1024 * 1024 });
    const saves = []; let ver = 0; const ipc = [];
    for (let x = 0; x < 3; x++) {
      for (const role of ['user', 'assistant']) {
        const m = { role, text: role === 'user' ? `question ${x} about the portal shader?` : `answer ${x} ${'with some detail. '.repeat(120)}`, at: Date.now() + x };
        chat.messages.push(m); chat.updatedAt = m.at;
        const d = { id: chat.id, from: `v${ver}`, to: `v${ver + 1}`, keys: Object.keys(chat), set: { updatedAt: chat.updatedAt }, n: chat.messages.length, msgs: [[chat.messages.length - 1, m]] };
        const t0 = performance.now(); const b = v8.serialize(d); v8.deserialize(b); ipc.push(performance.now() - t0);
        const r = await op({ op: 'chatDelta', file: sf, ...d }); ver += 1;
        if (!r.res?.ok) throw new Error(`chatDelta: ${JSON.stringify(r.res)}`);
        saves.push({ ms: r.ms, bytes: r.res.bytes });
      }
    }
    out.today = { saveMs: saves.map((s) => r1(s.ms)), saveMsMedian: r1(med(saves.map((s) => s.ms))), bytesPerSave: MB(saves[0].bytes), bytesPerExchange: MB(saves[0].bytes + saves[1].bytes), mainIpcMs: r1(med(ipc)) };
    // sync, per pass that finds the chat changed (the files thread): hash this computer's copy, make the cloud text,
    // write it to the cloud folder (+ the base copy); the other computer: pull (its file + a recovery copy + the base)
    const ctx = { dataDir: dir, cloudRoot: work, home: os.homedir(), win: false };
    const h = await op({ op: 'syncHash', file: sf, rel: 'chats/claude-giant0.json', cloud: false, ctx });
    const tx = await op({ op: 'syncText', file: sf, rel: 'chats/claude-giant0.json', ctx });
    const cloudBytes = tx.res.text.byteLength;
    const cf = path.join(work, 'cloud.json'); const t0 = performance.now(); fs.writeFileSync(cf, Buffer.from(tx.res.text.buffer, tx.res.text.byteOffset, tx.res.text.byteLength)); const writeMs = performance.now() - t0;
    const ch = (await op({ op: 'syncHash', file: cf, rel: 'chats/claude-giant0.json', cloud: true, ctx: null })).res.h;
    const lf = path.join(work, 'mac.json'); fs.copyFileSync(GIANT, lf);
    const p = await op({ op: 'syncPull', rel: 'chats/claude-giant0.json', cloudFile: cf, h: ch, ctx, localFile: lf, recovery: path.join(work, 'recovery.json'), aside: null });
    out.syncToday = { hashMs: r1(h.ms), textMs: r1(tx.ms), cloudCopyMB: MB(cloudBytes), cloudWriteMs: r1(writeMs), baseCopyMB: MB(cloudBytes), uploadMB: MB(cloudBytes), pullMs: r1(p.ms), pullWritesMB: MB(p.res.out.byteLength + fs.statSync(lf).size + cloudBytes), note: 'per pass that finds the chat changed: the sender writes the cloud copy + its base copy, the cloud client uploads the cloud copy; the receiver downloads it, then writes its file, a recovery copy of the old one and the base copy' };
    // ---- packs: this computer's file (pretty) and the cloud form (compact), saved by change ----
    for (const layout of ['pretty', 'compact']) {
      const pdir = path.join(work, `pack-${layout}`);
      const text = layout === 'pretty' ? fs.readFileSync(sf) : Buffer.from(tx.res.text.buffer, tx.res.text.byteOffset, tx.res.text.byteLength);
      const t1 = performance.now(); const sp = P.split(text);
      const first = P.write(fs, pdir, { id: chat.id, by: 'pc', layout, pre: sp.pre, post: sp.post, n: sp.n, bytesOf: sp.bytesOf });
      const buildMs = performance.now() - t1;
      let prev = first.m; let info = first.info; let n = sp.n; const per = [];
      const L = P.LAYOUT[layout]; const enc = (m) => Buffer.from(layout === 'pretty' ? BC.prettyMsg(m) : JSON.stringify(m), 'utf8');
      const tailBytes = [];
      let pre = sp.pre; let post = sp.post;
      const list = Array.from({ length: n }, (_, i) => Buffer.from(sp.bytesOf(i)));
      for (let x = 0; x < 3; x++) {
        for (const role of ['user', 'assistant']) {
          const m = { role, text: role === 'user' ? `question ${x}?` : `answer ${x} ${'with some detail. '.repeat(120)}`, at: 2e12 + x };
          list.push(enc(m)); n += 1;
          const t2 = performance.now();
          const r = P.write(fs, pdir, { id: chat.id, by: 'pc', layout, pre, post, n, bytesOf: (k) => list[k], info, prev, changed: new Set([n - 1]) });
          per.push({ ms: performance.now() - t2, bytes: r.wrote + r.manifestBytes, pieces: r.pieces });
          prev = r.m; info = r.info; tailBytes.push(r.m.segs.at(-1).b);
        }
      }
      // a reaction on an old message (#100)
      const old = JSON.parse(list[100].toString('utf8')); old.reaction = '👍'; list[100] = enc(old);
      const t3 = performance.now(); const rr = P.write(fs, pdir, { id: chat.id, by: 'pc', layout, pre, post, n, bytesOf: (k) => list[k], info, prev, changed: new Set([100]) }); const reactMs = performance.now() - t3;
      const t4 = performance.now(); const back = P.read(fs, pdir, 'pc'); const readMs = performance.now() - t4;
      const whole = Buffer.concat([Buffer.from(pre), Buffer.from(L.open), ...list.flatMap((b, i) => (i ? [Buffer.from(L.sep), b] : [b])), Buffer.from(L.close), Buffer.from(post)]);
      const files = fs.readdirSync(pdir).filter((f) => f.endsWith('.seg'));
      out[`pack_${layout}`] = { segments: rr.m.segs.length, firstBuildMs: r1(buildMs), saveMs: per.map((x) => r1(x.ms)), saveMsMedian: r1(med(per.map((x) => x.ms))), bytesPerSaveKB: per.map((x) => Math.round(x.bytes / 1024)), bytesPerExchangeKB: Math.round((per[0].bytes + per[1].bytes) / 1024), tailKB: tailBytes.map((b) => Math.round(b / 1024)), reactionOldMs: r1(reactMs), reactionOldKB: Math.round((rr.wrote + rr.manifestBytes) / 1024), manifestKB: Math.round(rr.manifestBytes / 1024), readWholeMs: r1(readMs), sameBytes: back.buf.equals(whole), segFilesOnDisk: files.length };
    }
  } finally {
    await w.terminate();
    fs.rmSync(work, { recursive: true, force: true });
    if (made && !argv.includes('--keep')) fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(JSON.stringify(out, null, 2));
  return out;
}

(async () => {
  try {
    if (argv.includes('--bench')) { await bench(); return; }
    byteForByte();
    failures2();
    crashPoints();
    await twoComputers();
  } catch (err) { failures += 1; console.log('FAIL threw', err.stack); } finally {
    if (!argv.includes('--keep')) fs.rmSync(ROOT, { recursive: true, force: true });
  }
  if (!argv.includes('--bench')) console.log(`bigsave88: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
