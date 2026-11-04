#!/usr/bin/env node
// (round 114, findaccents114) Find in a chat (Alt+F) ignores accents, capitals and ligatures, like the rest of search:
//   · findfold.js fold = recall-core.js's fold (the one every other search uses) + ’ → ' and ς → σ, on the French cases
//     (sohne → Söhne, cafe → café, l'eglise → L’Église, oeuvre → œuvre, creme brulee → Crème brûlée), typed with or
//     without accents and capitals
//   · the highlights land on the ORIGINAL characters (ranges): accents typed apart (e + U+0301) inside the mark, a
//     ligature (œ, ß) marked whole, emoji and flags next to a match never cut in two, Greek's last sigma, İ / Kelvin K
//   · the window's marks themselves (markAll, on a small stand-in DOM): the text around and inside each mark is the
//     message's text unchanged; the near-you cap and the stand-ins as in round 113
//   · the store thread's chatFind on a windowed giant chat's file: the same messages the window's own test finds
//     (findHit, folded), the file written plainly, with \u escapes (another writer's JSON) and with accents typed
//     apart; a compact request left out, thinking found; a file that's gone or damaged → an error, never "no hits"
//   node dev/findaccents114-test.js [--bench]   (--bench: chatFind on bigchat84's 63 MB chat, when it's there)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Worker } = require('worker_threads');
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'recall-core.js'));
const F = require(path.join(ROOT, 'findfold.js'));
const C = require(path.join(ROOT, 'chatwin-core.js'));

let passes = 0; let failures = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
const show = (s) => JSON.stringify(s);

// ---------- fold: the same as every other search ----------
for (const [typed, text] of [['sohne', 'Söhne'], ['cafe', 'café'], ['CAFE', 'Café'], ["l'eglise", 'L’Église'], ["l'eglise", "L'ÉGLISE"], ['oeuvre', 'œuvre'], ['creme brulee', 'Crème brûlée'], ['noel', 'Noël'], ['garcon', 'garçon'], ['ile', 'Île'], ['strasse', 'Straße'], ['eglise', 'église'], ['istanbul', 'İstanbul'], ['οδος', 'ΟΔΟΣ'], ['kelvin', 'Kelvin']]) {
  ok(F.fold(text).includes(F.fold(typed)), `fold: "${typed}" finds ${show(text)}`);
  ok(F.fold(typed).includes(F.fold(text)) || F.fold(text).length > F.fold(typed).length, `fold: ${show(text)} typed with its accents finds "${typed}"`);
}
ok(F.fold('Söhne') === R.fold('Söhne') && F.fold('L’Église') === R.fold('L’Église').replace('’', '\''), 'fold: recall-core\'s fold (+ the apostrophe)');
ok(!F.fold('cafe').includes(F.fold('café au lait')) && !F.has('cafard', 'cafe'), 'fold: no false finds (cafard is not café)');
ok(F.fold(F.fold('Œuvre ΣΟΦΟΣ İ')) === F.fold('Œuvre ΣΟΦΟΣ İ'), 'fold: folding twice changes nothing (the store thread folds a folded needle again)');
ok(F.foldMap('Ça va, l’Église? 👋🏽 Œ').f === F.fold('Ça va, l’Église? 👋🏽 Œ'), 'foldMap: its text = fold, character by character');

// ---------- highlights: the original characters ----------
const marks = (text, typed) => F.ranges(text, F.fold(typed)).map(([s, e]) => text.slice(s, e));
const cases = [
  ['Use Söhne Breit for the intro', 'sohne', ['Söhne']],
  ['Use Söhne Breit', 'sohne', ['Söhne']], // (accents typed apart: the mark keeps its ¨)
  ['café ☕ et café́!', 'cafe', ['café', 'café́']], // (two marks typed apart after the last letter)
  ['On se voit à L’Église Saint-Eustache', "l'eglise", ['L’Église']],
  ['On se voit à L’Église', 'église', ['Église']],
  ['La dernière œuvre de l’artiste', 'oeuvre', ['œuvre']],
  ['un cœur', 'oe', ['œ']], // (half a ligature: the whole ligature marked)
  ['un cœur', 'coeur', ['cœur']],
  ['Straße und STRASSE', 'strasse', ['Straße', 'STRASSE']],
  ['groß', 's', ['ß']], // (two finds in one ligature: one mark)
  ['🇫🇷Café🇫🇷 and 👩‍👩‍👧 Crème brûlée 🍮', 'cafe', ['Café']],
  ['🇫🇷Café🇫🇷 and 👩‍👩‍👧 Crème brûlée 🍮', 'creme brulee', ['Crème brûlée']],
  ['😀cafe😀CAFÉ', 'café', ['cafe', 'CAFÉ']],
  ['ΣΟΦΟΣ σοφος', 'σοφος', ['ΣΟΦΟΣ', 'σοφος']],
  ['İstanbul in İSTANBUL', 'istanbul', ['İstanbul', 'İSTANBUL']],
  ['plain ascii Cafe CAFE cafe', 'cafe', ['Cafe', 'CAFE', 'cafe']],
  ['nothing here', 'cafe', []],
];
for (const [text, typed, want] of cases) ok(show(marks(text, typed)) === show(want), `ranges: "${typed}" in ${show(text)} → ${show(want)} (got ${show(marks(text, typed))})`);
// every mark's ends sit on character boundaries (never inside an emoji / a surrogate pair) and in order
for (const [text, typed] of cases) {
  const rs = F.ranges(text, F.fold(typed)); let last = 0; let good = true;
  for (const [s, e] of rs) { if (s < last || e <= s || /[\udc00-\udfff]/.test(text[s] || '') || /[\udc00-\udfff]/.test(text[e] || '')) good = false; last = e; }
  ok(good, `ranges: on character boundaries, in order: ${show(text)}`);
}
// the places exactly (the offsets the marks are cut at)
ok(show(F.ranges('🇫🇷Café', 'cafe')) === '[[4,8]]', 'ranges: after a flag (4 UTF-16 units): [4, 8)');
ok(show(F.ranges('x œuvre', 'oeuvre')) === '[[2,7]]', 'ranges: œ (1 character → 2 folded): [2, 7)');
ok(show(F.ranges('église', 'eglise')) === '[[0,7]]', 'ranges: an accent typed apart (2 characters → 1 folded): [0, 7)');
ok(show(F.ranges('Söhne', 'sohne')) === '[[0,5]]', 'ranges: Söhne: [0, 5)');
// random texts: every mark, folded, is the needle (a mark never holds more or less than what was found)
let seed = 114; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const BITS = ['café', 'Café', 'café', 'CAFÉ', 'œuvre', 'Œ', 'ß', 'L’Église', "l'église", 'é', '👩‍👩‍👧', '🇫🇷', '☕', ' ', 'x', 'ΣΟΦΟΣ', 'İ', 'Söhne', 'Söhne', 'K'];
let randOk = true;
for (let i = 0; i < 400; i++) {
  const text = Array.from({ length: 2 + Math.floor(rnd() * 10) }, () => BITS[Math.floor(rnd() * BITS.length)]).join('');
  for (const typed of ['cafe', 'eglise', "l'eglise", 'oe', 'ss', 'sohne', 'σοφοσ', 'e', 'k']) {
    const fq = F.fold(typed); const rs = F.ranges(text, fq);
    for (const [s, e] of rs) if (!F.fold(text.slice(s, e)).includes(fq)) { randOk = false; console.log('  mark', show(text.slice(s, e)), 'for', typed, 'in', show(text)); }
    if (F.fold(text).includes(fq) !== rs.length > 0) { randOk = false; console.log('  found but not marked:', typed, show(text)); }
  }
}
ok(randOk, 'ranges: 400 random texts: each mark holds what was found, and what is found is marked');

// ---------- the window's marks (markAll) on a small stand-in DOM ----------
class Text { constructor(v) { this.nodeType = 3; this.nodeValue = v; this.parentNode = null; } get textContent() { return this.nodeValue; } get parentElement() { return this.parentNode; } replaceWith(x) { const p = this.parentNode; const i = p.childNodes.indexOf(this); const add = x instanceof Frag ? x.childNodes : [x]; for (const n of add) n.parentNode = p; p.childNodes.splice(i, 1, ...add); } }
class Frag { constructor() { this.childNodes = []; } append(...xs) { for (const x of xs) this.childNodes.push(typeof x === 'string' ? new Text(x) : x); } }
class Elem {
  constructor(tag, cls = '', kids = [], data = {}) { this.nodeType = 1; this.tag = tag; this.cls = new Set(cls.split(' ').filter(Boolean)); this.childNodes = []; this.dataset = data; this.parentNode = null; for (const k of kids) this.add(k); }
  add(k) { const n = typeof k === 'string' ? new Text(k) : k; n.parentNode = this; this.childNodes.push(n); return this; }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get lastElementChild() { const c = this.children; return c[c.length - 1] || null; }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  get parentElement() { return this.parentNode instanceof Elem ? this.parentNode : null; }
  closest(sel) { return sel.split(',').map((s) => s.trim().split(/\s+/).map((c) => c.slice(1))).some((chain) => { let e = this; if (!e.cls.has(chain[chain.length - 1])) return false; for (let i = chain.length - 2; i >= 0; i--) { e = e.parentElement; while (e && !e.cls.has(chain[i])) e = e.parentElement; if (!e) return false; } return true; }) ? this : null; }
}
// (closest above answers "this element or an ancestor matches": enough for markAll's two tests)
Elem.prototype.closest = function closest(sel) { for (let e = this; e; e = e.parentElement) if (sel.split(',').some((s) => { const chain = s.trim().split(/\s+/).map((c) => c.slice(1)); if (!e.cls.has(chain[chain.length - 1])) return false; let a = e; for (let i = chain.length - 2; i >= 0; i--) { a = a.parentElement; while (a && !a.cls.has(chain[i])) a = a.parentElement; if (!a) return false; } return true; })) return e; return null; };
const NodeFilter = { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 };
const document = {
  createDocumentFragment: () => new Frag(),
  createTreeWalker(root, _what, { acceptNode }) { const all = []; const walk = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3) { if (acceptNode(c) === 1) all.push(c); } else walk(c); } }; walk(root); let i = -1; return { nextNode() { i += 1; this.currentNode = all[i]; return Boolean(all[i]); }, currentNode: null }; },
};
const el = (tag, o) => new Elem(tag, o.class || '', [o.text || '']);
const ctx = { document, NodeFilter, el, RecallCore: R, module: undefined, console };
vm.createContext(ctx);
vm.runInContext(`${fs.readFileSync(path.join(ROOT, 'findfold.js'), 'utf8')}\nthis.FF = FindFold;`, ctx);
const msg = (i, ...kids) => new Elem('div', 'msg', [new Elem('div', 'body', kids)], { index: String(i) });
const list = new Elem('div', 'messages', [
  msg(0, 'Rendez-vous à L’Église, puis un café.'),
  msg(1, new Elem('p', '', ['La dernière ', new Elem('b', '', ['œuvre']), ' 🇫🇷 Söhne']), new Elem('div', 'code-acts', ['café (a button: never marked)'])),
  msg(2, 'café ☕ CAFÉ 😀café'),
]);
const before = list.children.map((m) => m.textContent);
const hits = ctx.FF.markAll(list, 'Cafe', null);
const marked = hits.filter((h) => h.nodeType).map((h) => h.textContent);
ok(show([...marked].sort()) === show(['café', 'cafe\u0301', 'CAFÉ', 'café'].sort()), `markAll: "Cafe" marks café / cafe+◌́ / CAFÉ / café, not the button (got ${show(marked)})`);
ok(show(list.children.map((m) => m.textContent)) === show(before), 'markAll: every message\'s text unchanged around and inside the marks');
ok(hits.filter((h) => h.nodeType).every((h) => h.cls.has('find-hit')), 'markAll: marks are mark.find-hit');
const h2 = ctx.FF.markAll(list, "l'eglise", null); ok(h2.length === 1 && h2[0].textContent === 'L’Église', 'markAll: "l\'eglise" marks L’Église');
const h3 = ctx.FF.markAll(list, 'OEUVRE', null); ok(h3.length === 1 && h3[0].textContent === 'œuvre', 'markAll: "OEUVRE" marks œuvre (in its <b>)');
const h4 = ctx.FF.markAll(list, 'sohne', null); ok(h4.length === 1 && h4[0].textContent === 'Söhne', 'markAll: "sohne" marks Söhne next to a flag');
ok(ctx.FF.markAll(list, '', null).length === 0 && ctx.FF.markAll(list, '́', null).length === 0, 'markAll: nothing typed (or only an accent): no marks');
// the near-you cap (round 113): 300 messages with the word, the ones nearest #150 marked (≈ 200), the others stand-ins
const big = new Elem('div', 'messages', Array.from({ length: 300 }, (_, i) => msg(i, `Söhne ${i}`)));
const hb = ctx.FF.markAll(big, 'sohne', 150);
const mk = hb.filter((h) => h.nodeType); const st = hb.filter((h) => !h.nodeType);
ok(mk.length === 200 && st.length === 100 && mk.length + st.length === 300, `markAll: 200 marks near you, 100 stand-ins (${mk.length} / ${st.length})`);
ok(st.every((h) => Math.abs(h.index - 150) >= 99), 'markAll: the stand-ins are the far ones');

// ---------- the window's test (chatwin-core findHit) = folded ----------
ok(C.findHit({ text: 'Rendez-vous à L’Église' }, "l'eglise") && C.findHit({ text: 'x', thinking: 'Söhne' }, 'sohne') && !C.findHit({ text: 'Söhne', compactReq: true }, 'sohne'), 'findHit: folded, thinking too, a compact request left out');

// ---------- the store thread's chatFind on a windowed giant chat's file ----------
function thread() {
  const w = new Worker(path.join(ROOT, 'storework.js'));
  let seq = 0; const jobs = new Map();
  w.on('message', ({ id, res, err }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  return { op: (msg) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); }), end: () => w.terminate() };
}
const FR = ['Söhne', 'café', 'CAFÉ', 'café', 'L’Église', "l'église", 'œuvre', 'Œuvre', 'Crème brûlée', 'Straße', 'garçon', '👩‍👩‍👧', '🇫🇷', 'ΣΟΦΟΣ', 'İstanbul', 'Kelvin', 'quote"inside', 'back\\slash', 'line\nbreak', 'tab\there', 'plain', 'words', 'here'];
const said = () => Array.from({ length: Math.floor(rnd() * 12) }, () => FR[Math.floor(rnd() * FR.length)]).join(' ');
const chat = { id: 'giant', agentId: 'claude', title: 'Un très long chat', createdAt: 1.7e12, updatedAt: 1.71e12, messages: Array.from({ length: 900 }, (_, k) => { const m = { role: k % 2 ? 'assistant' : 'user', text: said(), at: 1.7e12 + k * 6e4 }; if (rnd() < 0.3) m.thinking = said(); if (rnd() < 0.03) m.compactReq = true; return m; }) };
chat.messages[30].text += ' Rendez-vous à l’Église Saint-Zéphyrin'; delete chat.messages[30].compactReq; delete chat.messages[31].compactReq;
chat.messages[31].thinking = 'zéphyrin dans la pensée';
chat.messages[32] = { role: 'user', text: 'Zéphyrin mais demandé', compactReq: true, at: 1 };
const want = (q) => chat.messages.map((m, i) => (!m.compactReq && (F.fold(m.text || '').includes(F.fold(q)) || F.fold(m.thinking || '').includes(F.fold(q))) ? i : -1)).filter((i) => i >= 0);
(async () => {
  const dir = require('./tmp-own').mkdtemp('hearth-fa114-');
  const T = thread();
  try {
    const plain = path.join(dir, 'plain.json'); fs.writeFileSync(plain, JSON.stringify(chat, null, 2));
    const esc = path.join(dir, 'escaped.json'); fs.writeFileSync(esc, JSON.stringify(chat, null, 2).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()}`));
    const apart = path.join(dir, 'apart.json'); fs.writeFileSync(apart, JSON.stringify({ ...chat, messages: chat.messages.map((m) => ({ ...m, text: String(m.text).normalize('NFD') })) }, null, 2));
    ok(JSON.stringify(JSON.parse(fs.readFileSync(esc, 'utf8'))) === JSON.stringify(chat), 'the escaped file is the same chat');
    for (const [file, what] of [[plain, 'written plainly'], [esc, 'with \\u escapes'], [apart, 'accents typed apart (NFD)']]) {
      const ref = what.startsWith('accents') ? JSON.parse(fs.readFileSync(apart, 'utf8')) : chat;
      const wantOf = (q) => ref.messages.map((m, i) => (C.findHit(m, q) ? i : -1)).filter((i) => i >= 0);
      for (const q of ['sohne', 'Söhne', 'cafe', 'CAFÉ', "l'eglise", 'L’ÉGLISE', 'oeuvre', 'creme brulee', 'strasse', 'garcon', 'σοφος', 'istanbul', 'kelvin', 'zephyrin', '👩‍👩‍👧', 'quote"inside', 'back\\slash', 'line\nbreak', 'tab\there', 'nothing-like-this']) {
        const got = await T.op({ op: 'chatFind', file, q });
        const w = wantOf(q);
        ok(Array.isArray(got.hits) && show(got.hits) === show(w) && got.n === 900, `chatFind ${what} "${q.replace(/\n/g, '\\n').replace(/\t/g, '\\t')}": ${w.length} = the window's own test (got ${got.hits?.length ?? show(got)})`);
      }
    }
    ok(show(want('zephyrin')) === '[30,31]' && show((await T.op({ op: 'chatFind', file: plain, q: 'ZEPHYRIN' })).hits) === '[30,31]', 'chatFind: "ZEPHYRIN" → #30 (text) and #31 (thinking), the compact request left out');
    ok(show((await T.op({ op: 'chatFind', file: esc, q: "l'eglise saint-zephyrin" })).hits) === '[30]', 'chatFind: "l\'eglise saint-zephyrin" in a file of \\u escapes → #30');
    // a file that can't be read is never "no hits"
    const gone = await T.op({ op: 'chatFind', file: path.join(dir, 'gone.json'), q: 'cafe' }).catch((e) => ({ error: e.message }));
    ok(gone.error && !gone.hits, 'chatFind on a file that\'s gone: an error, not "no hits"');
    const bad = path.join(dir, 'bad.json'); fs.writeFileSync(bad, '{"id":"x","messages":[{"text":"café"},');
    const dam = await T.op({ op: 'chatFind', file: bad, q: 'cafe' }).catch((e) => ({ error: e.message }));
    ok(dam.error && !dam.hits, 'chatFind on a damaged file: an error, not "no hits"');
    ok(show(await T.op({ op: 'chatFind', file: plain, q: '' })) === show({ hits: [], n: 0 }), 'chatFind: nothing typed → nothing');
    if (process.argv.includes('--bench')) {
      const src = '/tmp/hearth-bigchat84/chats/claude-giant0.json';
      if (fs.existsSync(src)) {
        const f = path.join(dir, 'giant.json'); fs.copyFileSync(src, f);
        for (const q of ['zanzibar84quokka', 'sohne', 'cafe', 'portal grain']) { const t0 = performance.now(); const r = await T.op({ op: 'chatFind', file: f, q }); console.log(`chatFind "${q}" ${Math.round(performance.now() - t0)} ms, ${r.hits?.length} hits`); }
      } else console.log('(no bigchat84 fixture: bench skipped)');
    }
  } finally { T.end(); }
  console.log(`findaccents114-test: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log(`FAIL ${e.stack}`); process.exit(1); });
