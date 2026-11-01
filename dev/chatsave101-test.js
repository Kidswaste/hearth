#!/usr/bin/env node
// (round 101, chatsave101) A long chat under 8 MB that reaches native.js BIG_MSGS (800 messages) is saved by what
// changed (round 82's chatDelta). This round measured lowering that line (--line 100 reruns that experiment: the win was
// not measurable in the app, so the line stays). This test runs the window's real save code (native.js saveChat / saveWhole /
// takeShape / shapeOf / sameShape, read from its source) against the real store (store.js, its store thread
// storework.js), and the old way (every save whole: hub.saveChat) against a second copy of the store, through the same
// steps. After every step both files must be byte for byte the same.
//   · every edit kind: a new exchange, a reaction, an edit, edit-from-here (trunc), a delete, pins, the chat's own fields;
//   · a random walk (saves fired without waiting, as the window does);
//   · whatever makes the thread refuse a change (another writer, a file changed or gone, sync's guard wanting the
//     chat, sync writing it now (store.settle), a held version let go): the window saves whole, through the guards;
//   · a chat under the line is still saved whole; one over it goes by change after its first save.
// The stores are copies in a temp folder (store.js keeps its data in <its folder>/data): never the real data.
//   node dev/chatsave101-test.js [--seed N] [--walk N] [--line N (the window's line instead of BIG_MSGS)]
'use strict';
process.env.HEARTH_STORE_THREAD = '1'; // store.js saves through its thread in Node too (as in Electron)
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
let passes = 0; let failures = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
let seed = Number(opt('--seed', 101));
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const WORDS = ['orb', 'café', 'naïve', '日本語', '🔥', 'quote"inside', 'back\\slash', 'line\nbreak', 'tab\there', 'ctrl\u0001x', 'slash/ok', '\u2028sep', 'lone\ud800x', 'end', '{"json":[1]}', '</script>'];
const str = () => Array.from({ length: int(0, 10) }, () => pick(WORDS)).join(' ');
function value(depth = 0) {
  const r = rnd();
  if (depth > 3 || r < 0.35) return pick([() => str(), () => int(-5, 1e6), () => rnd() * 1000, () => 1e21, () => -0.5, () => true, () => false, () => null, () => '', () => undefined, () => NaN, () => '/Users/me/x.png', () => 'C:\\Users\\me\\x.png'])();
  if (r < 0.55) return Array.from({ length: int(0, 4) }, () => value(depth + 1));
  const o = {}; for (let i = 0; i < int(0, 5); i++) o[pick(['a', 'b', 'k é', 'path', 'n', 'list', 'x"y'])] = value(depth + 1);
  return o;
}
let at = 1700000000000;
function message(role) {
  const m = { role: role || pick(['user', 'assistant', 'assistant', 'error']), text: Array.from({ length: int(1, 12) }, () => str()).join('\n'), at: (at += 1000) };
  if (rnd() < 0.4) m.usage = { input: int(1, 9000), output: int(1, 3000) };
  if (rnd() < 0.2) m.tools = [{ name: 'Bash', input: { command: str() }, output: str() }];
  if (rnd() < 0.15) m.extra = value();
  if (rnd() < 0.1) m.attachments = [{ kind: 'image', name: 'a.png', path: '/Users/me/data/attachments/a.png' }];
  if (rnd() < 0.05) m.thinking = str();
  if (rnd() < 0.05) m.gone = undefined; // (a key JSON leaves out)
  return m;
}
const chatOf = (id, n) => ({ id, agentId: 'claude', title: `A "long" chat — été 🔥 ${id}`, createdAt: 1, updatedAt: 2, model: 'm1', messages: Array.from({ length: n }, () => message()), session: { id: 's1', at: 3 } });

// ---------- the window's real save code (native.js, read from its source) ----------
const NATIVE = fs.readFileSync(path.join(ROOT, 'native.js'), 'utf8');
const piece = (start) => { const i = NATIVE.indexOf(start); if (i < 0) throw new Error(`native.js: ${start}`); let d = 0; for (let j = NATIVE.indexOf('{', i); j < NATIVE.length; j++) { if (NATIVE[j] === '{') d++; else if (NATIVE[j] === '}' && --d === 0) return NATIVE.slice(i, j + 1); } throw new Error(start); };
const line = (start) => { const i = NATIVE.indexOf(start); if (i < 0) throw new Error(`native.js: ${start}`); return NATIVE.slice(i, NATIVE.indexOf('\n', i)); };
const LINE = Number(opt('--line', 0)) || Number(/const BIG_MSGS = (\d+);/.exec(NATIVE)?.[1]);
const LINE_SRC = `const BIG_MSGS = ${LINE};`;
if (!(LINE > 0)) throw new Error('native.js: no BIG_MSGS');
function windowOf(hub) {
  return vm.runInNewContext(`
${LINE_SRC}
${line('const W = { x: null };')}
${line('const shapes = new WeakMap();')}
${line('const shapeOf = (v) =>')}
${piece('function sameShape(sh, v)')}
${line('const newVer = () =>')}
${line('const preShapes = new WeakMap();')}
${piece('function takeShape(chat, ver)')}
${piece('function saveWhole(chat)')}
${piece('function saveChat(chat)')}
({ saveChat, shapes, BIG_MSGS });`, { window: { hub }, Promise, Error });
}

// ---------- two copies of the store: A (the window's code: by change), B (the old way: every save whole) ----------
const STORE_FILES = (() => {
  const seen = new Set(); const q = ['store.js', 'storework.js'];
  while (q.length) {
    const f = q.shift(); if (seen.has(f)) continue;
    let s; try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    seen.add(f);
    for (const m of s.matchAll(/require\('\.\/([\w.-]+?)(?:\.js)?'\)/g)) q.push(`${m[1]}.js`);
  }
  return [...seen];
})();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cs101-'));
function storeCopy(name) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(path.join(dir, 'data', 'chats'), { recursive: true });
  for (const f of STORE_FILES) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  const store = require(path.join(dir, 'store.js'));
  if (path.resolve(store.DATA_DIR) !== path.resolve(dir, 'data')) throw new Error('not the copy\'s data folder');
  return { dir, store, file: (id) => path.join(dir, 'data', 'chats', `${id}.json`) };
}
const A = storeCopy('A'); const B = storeCopy('B');
// IPC: a structured clone (keeps undefined values, as Electron's does)
const stats = { delta: 0, refused: 0, whole: 0, why: {} };
const hubA = {
  saveChat: (chat, o) => { stats.whole += 1; return A.store.saveChat(structuredClone(chat), o ? structuredClone(o) : undefined); },
  saveChatDelta: async (d) => { const r = await A.store.saveChatDelta(structuredClone(d)); if (r?.ok) stats.delta += 1; else { stats.refused += 1; stats.why[r?.why] = (stats.why[r?.why] || 0) + 1; } return r; },
};
const win = windowOf(hubA);
const old = (chat) => B.store.saveChat(structuredClone(chat));
const both = (chat) => Promise.all([win.saveChat(chat), old(chat)]);
const idle = () => Promise.all([A.store.idle(), B.store.idle()]);
async function same(id, what) {
  await idle(); await idle();
  let a = null; let b = null;
  try { a = fs.readFileSync(A.file(id)); } catch { /* missing */ }
  try { b = fs.readFileSync(B.file(id)); } catch { /* missing */ }
  const good = Boolean(a && b && a.equals(b));
  ok(good, `${what}: the file = the whole-save file`);
  if (!good && a && b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; console.log(`  differ at byte ${i}: …${a.slice(Math.max(0, i - 60), i + 60).toString()}… vs …${b.slice(Math.max(0, i - 60), i + 60).toString()}…`); }
  return good;
}
const snap = () => ({ ...stats, why: { ...stats.why } });

(async () => {
  try {
    ok(win.BIG_MSGS === LINE && (opt('--line') || LINE === 800), `the window's line: ${LINE} messages`);
    // ---------- a short chat: whole, every time ----------
    const short = chatOf('short', 20);
    let s0 = snap();
    await both(short); short.messages.push(message('user')); await both(short);
    await same('short', 'a short chat');
    ok(stats.delta === s0.delta && stats.refused === s0.refused && !win.shapes.get(short), 'a chat under the line is saved whole, no shape kept');

    // ---------- a long chat: every edit kind ----------
    const chat = chatOf('long', LINE + 160);
    await both(chat); await same('long', 'first save (whole, its shape taken)');
    ok(Boolean(win.shapes.get(chat)), 'a long chat keeps its shape after its first save');
    // a chat never read here yet is saved "blind" (datasafe: merged with the disk), so no version is kept for it: its
    // next change is refused and it is saved whole once more (in the app a chat is read when opened: not blind)
    s0 = snap(); chat.messages.push(message()); await both(chat); await same('long', 'the second save of a new chat');
    ok(stats.why.version === (s0.why.version || 0) + 1 && stats.whole === s0.whole + 1, 'a new chat\'s first save was blind (no version): its next change is refused, saved whole');
    const kinds = [
      ['new exchange', (c) => { c.messages.push(message('user')); c.updatedAt += 1; }, (c) => { c.messages.push(message('assistant')); c.updatedAt += 1; }],
      ['the reply streamed in, then finished', (c) => { c.messages.push({ role: 'assistant', text: '', at: (at += 1), pending: true }); }, (c) => { const m = c.messages[c.messages.length - 1]; m.text = 'done "now" 🔥\n'; delete m.pending; m.usage = { input: 5, output: 7 }; }],
      ['reaction on an old message', (c) => { c.messages[3].reaction = { emoji: '🔥', at: 5 }; }],
      ['reaction note', (c) => { c.messages[3].reaction.note = 'kept\nwith "it"'; }],
      ['reaction removed', (c) => { delete c.messages[3].reaction; }],
      ['edit (an old message\'s text)', (c) => { c.messages[10].text += ' (edited)'; c.messages[10].edited = true; }],
      ['edit-from-here (trunc + a new end)', (c) => { c.messages.length = 120; c.messages.push(message('user'), message('assistant')); }],
      ['retry (the last reply cut)', (c) => { c.messages.pop(); }],
      ['delete from the middle', (c) => { c.messages.splice(40, 2); }],
      ['delete the last two', (c) => { c.messages.splice(-2); }],
      ['pin a message', (c) => { c.messages[7].pinnedMsg = true; }],
      ['bookmark + unpin', (c) => { c.messages[7].bookmark = true; delete c.messages[7].pinnedMsg; }],
      ['the chat pinned', (c) => { c.pinned = !c.pinned; }],
      ['the chat renamed, its model and session changed', (c) => { c.title = 'Renamed "x" \u2028 été'; c.model = 'm2'; c.session = { id: 's2', at: 9 }; }],
      ['a field gone, one added at the end', (c) => { delete c.model; c.compact = { index: 3, summary: 'x\ny', tail: 5 }; }],
      ['a field set to undefined (JSON leaves it out)', (c) => { c.style = undefined; c.messages.push(message()); }],
      ['the field order changed', (c) => { const { title, ...rest } = c; for (const k of Object.keys(c)) delete c[k]; Object.assign(c, rest, { title }); }],
      ['same content, new objects', (c) => { c.messages = c.messages.map((m) => ({ ...m })); }],
      ['a message replaced in place', (c) => { c.messages[50] = message(); }],
      ['nothing changed', () => {}],
    ];
    for (const [label, ...steps] of kinds) {
      s0 = snap();
      for (const step of steps) { step(chat); await both(chat); }
      await same('long', label);
      if (!/nothing changed|same content/.test(label)) ok(stats.delta > s0.delta && stats.whole === s0.whole, `${label}: saved by change (${stats.delta - s0.delta}), not whole`);
      else ok(stats.delta === s0.delta && stats.whole === s0.whole, `${label}: nothing sent`);
    }
    // the reply streamed: several saves in flight at once (the window doesn't wait)
    s0 = snap();
    const ps = []; for (let i = 0; i < 6; i++) { chat.messages.push(message()); chat.updatedAt += 1; ps.push(win.saveChat(chat)); }
    await Promise.all(ps); await old(chat); await same('long', 'six saves in flight');
    ok(stats.delta - s0.delta === 6 && stats.whole === s0.whole, 'six saves in flight: all by change');
    // cut to almost nothing (trunc), then grown again
    chat.messages.length = 2; await both(chat); await same('long', 'cut to 2 messages (trunc)');
    for (let i = 0; i < 5; i++) chat.messages.push(message()); await both(chat); await same('long', 'grown again');
    chat.messages = []; await both(chat); await same('long', 'emptied');
    for (let i = 0; i < LINE + 30; i++) chat.messages.push(message()); await both(chat); await same('long', 'filled again');

    // ---------- the thread refuses: the window saves whole, through the guards ----------
    const refusal = async (label, before, why) => {
      s0 = snap();
      await before();
      chat.messages.push(message()); chat.updatedAt += 1; await both(chat);
      await same('long', label);
      ok(stats.refused > s0.refused && stats.whole > s0.whole && (!why || stats.why[why] > (s0.why[why] || 0)), `${label}: refused (${Object.keys(stats.why).filter((k) => stats.why[k] !== s0.why[k]).join(', ')}), saved whole`);
      s0 = snap(); chat.messages.push(message()); await both(chat); await same('long', `${label}: the next save`);
      ok(stats.delta > s0.delta && stats.whole === s0.whole, `${label}: the next save is by change again`);
    };
    // another writer saved it whole (astra-workspace's hub.saveChat): the version is gone
    await refusal('another writer saved it whole', async () => { const c = structuredClone(chat); await A.store.saveChat(c); await B.store.saveChat(structuredClone(chat)); }, 'version');
    // the file changed on disk by someone else (another program, a cloud client): the thread's sig doesn't match
    await refusal('the file changed by another program', async () => {
      await idle(); const other = { ...structuredClone(chat), title: 'from elsewhere' };
      for (const S of [A, B]) { fs.writeFileSync(S.file('long'), JSON.stringify(other, null, 2)); const t = new Date(Date.now() + 5000); fs.utimesSync(S.file('long'), t, t); }
    }, 'changed');
    // the file gone (a read failure is never "empty": nothing written from a missing file; the whole chat is saved)
    await refusal('the file gone', async () => { await idle(); fs.rmSync(A.file('long')); fs.rmSync(B.file('long')); }, 'changed');
    // a file not laid out as the app writes it (compact): refused, whole
    await refusal('a compact file', async () => {
      await idle(); for (const S of [A, B]) { fs.writeFileSync(S.file('long'), JSON.stringify(chat)); const t = new Date(Date.now() + 9000); fs.utimesSync(S.file('long'), t, t); }
    }, 'changed');
    // sync's guard wants it (a pull just arrived): whole, through the guard (the guard here marks what it saw)
    {
      const seen = { A: 0, B: 0 };
      A.store.setBeforeWrite((file, v) => { if (/long\.json$/.test(file)) seen.A += 1; return v; }, (file) => /long\.json$/.test(file));
      B.store.setBeforeWrite((file, v) => { if (/long\.json$/.test(file)) seen.B += 1; return v; }, (file) => /long\.json$/.test(file));
      s0 = snap();
      chat.messages.push(message()); await both(chat); await same('long', 'sync\'s guard wants the chat');
      ok(stats.why.whole > (s0.why.whole || 0) && seen.A === 1 && seen.B === 1, 'sync\'s guard wants the chat: refused, the whole save went through the guard');
      chat.messages.push(message()); await both(chat); await same('long', 'sync\'s guard still wants it');
      ok(seen.A === 2 && seen.B === 2, 'while the guard wants it, every save goes through it');
      A.store.setBeforeWrite(null); B.store.setBeforeWrite(null);
      s0 = snap(); chat.messages.push(message()); await both(chat); await same('long', 'the guard let it go (whole once: no version kept while it wanted it)');
      chat.messages.push(message()); await both(chat); await same('long', 'then by change');
      ok(stats.delta > s0.delta, 'after the guard: by change again');
    }
    // sync writing this chat now (store.settle, syncrace98): the change is refused and the whole save waits for the write
    {
      s0 = snap();
      const relA = await A.store.settle(A.file('long')); const relB = await B.store.settle(B.file('long'));
      chat.messages.push(message()); chat.updatedAt += 1;
      const pa = win.saveChat(chat); const pb = old(chat);
      await new Promise((r) => setTimeout(r, 30));
      const before = fs.readFileSync(A.file('long'), 'utf8');
      ok(!before.includes(`"updatedAt": ${chat.updatedAt},`), 'sync writing it: the save waits for its write (nothing landed yet)');
      relA(); relB(); await Promise.all([pa, pb]);
      await same('long', 'sync writing it (settle)');
      ok(stats.why.whole > (s0.why.whole || 0), 'sync writing it: the change refused, saved whole after the write');
    }
    // a settle while a change is on its way: it lands first (the thread is pinged)
    {
      chat.messages.push(message()); const pa = win.saveChat(chat); const pb = old(chat);
      const relA = await A.store.settle(A.file('long')); const relB = await B.store.settle(B.file('long'));
      const now = JSON.parse(fs.readFileSync(A.file('long'), 'utf8'));
      ok(now.messages.length === chat.messages.length, 'a change on its way when sync starts writing: it lands before (store.settle pings)');
      relA(); relB(); await Promise.all([pa, pb]); await same('long', 'a change on its way, then settle');
    }

    // ---------- the random walk ----------
    const WALK = Number(opt('--walk', 300));
    const walk = chatOf('walk', LINE + 40);
    await both(walk);
    let good = 0; const s1 = snap();
    const moves = [
      [8, (c) => { c.messages.push(message('user'), message('assistant')); c.updatedAt += 1; }],
      [3, (c) => { const m = pick(c.messages); if (m) m.reaction = { emoji: pick(['👍', '🔥', '🤔']), at: int(1, 9) }; }],
      [2, (c) => { const m = pick(c.messages); if (m) delete m.reaction; }],
      [3, (c) => { const m = pick(c.messages); if (m) m.text = `${m.text} ${str()}`; }],
      [2, (c) => { const k = int(0, c.messages.length); c.messages.length = Math.max(0, Math.min(c.messages.length, k)); c.messages.push(message('user')); }],
      [2, (c) => { if (c.messages.length) c.messages.splice(int(0, c.messages.length - 1), int(1, 3)); }],
      [2, (c) => { const m = pick(c.messages); if (m) m.pinnedMsg = !m.pinnedMsg; }],
      [2, (c) => { c[pick(['title', 'model', 'style', 'compact', 'pinned', 'continuedFrom'])] = pick([str(), undefined, null, { a: value() }, true]); }],
      [1, (c) => { delete c[pick(['title', 'model', 'style', 'compact', 'pinned', 'session'])]; }],
      [1, (c) => { c.messages.splice(int(0, c.messages.length), 0, message()); }],
      [1, (c) => { c.messages = c.messages.map((m) => ({ ...m })); }],
      [1, (c) => { const m = pick(c.messages); if (m) m.extra = value(); }],
    ];
    const total = moves.reduce((a, [w]) => a + w, 0);
    for (let i = 0; i < WALK; i++) {
      const burst = int(1, 3); const ps2 = [];
      for (let b = 0; b < burst; b++) {
        let r = rnd() * total; const mv = moves.find(([w]) => (r -= w) < 0)[1];
        mv(walk);
        if (walk.messages.length < LINE && rnd() < 0.8) for (let k = 0; k < 40; k++) walk.messages.push(message()); // (stays mostly long)
        ps2.push(win.saveChat(walk)); // (fired without waiting, as the window does)
      }
      // now and then someone else touches the file (another writer / program): the window's next save is whole
      if (rnd() < 0.04) { await Promise.all(ps2); await idle(); const v = structuredClone(walk); await A.store.saveChat(v); await B.store.saveChat(structuredClone(walk)); }
      await Promise.all(ps2); await old(walk);
      await idle();
      const a = fs.readFileSync(A.file('walk')); const b = fs.readFileSync(B.file('walk'));
      if (a.equals(b)) good += 1; else console.log(`  walk step ${i}: differs`);
    }
    ok(good === WALK, `random walk: ${good} / ${WALK} steps byte for byte the whole-save file`);
    ok(fs.readFileSync(A.file('walk'), 'utf8') === JSON.stringify(walk, null, 2), 'random walk: the file = the window\'s chat as JSON');
    ok(stats.delta - s1.delta > WALK, `random walk: ${stats.delta - s1.delta} changes saved by change, ${stats.whole - s1.whole} whole (refused: ${JSON.stringify(stats.why)})`);

    // ---------- the list and the search see a chat saved by change ----------
    const listA = await A.store.listChats(); const listB = await B.store.listChats();
    const rowOf = (l, id) => JSON.stringify((Array.isArray(l) ? l : l?.list || []).find((x) => x.id === id));
    ok(rowOf(listA, 'long') === rowOf(listB, 'long') && rowOf(listA, 'walk') === rowOf(listB, 'walk'), 'the chats list: the same rows');
    const q = 'naïve'; const hitA = await A.store.searchChats(q); const hitB = await B.store.searchChats(q);
    ok(JSON.stringify(hitA) === JSON.stringify(hitB), 'the chats search: the same hits');
    // a read right after a change on its way waits for it (chats:get)
    walk.messages.push(message()); const pw = win.saveChat(walk);
    const got = await A.store.getChatFresh('walk');
    ok(got?.messages?.length === walk.messages.length, 'chats:get right after a change on its way: it waits for it');
    await pw;
    console.log(`  saves: ${stats.delta} by change, ${stats.whole} whole, ${stats.refused} refused ${JSON.stringify(stats.why)}`);
  } catch (err) { failures += 1; console.log('FAIL', err.stack); }
  try { A.store.flushSync(); B.store.flushSync(); } catch { /* stopped */ }
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`chatsave101-test: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
