#!/usr/bin/env node
// (round 35, streamrender) The streaming reply's renderer (md.js Md.live) against a full render, in Node:
// every document of dev/streamrender-corpus.json plus the fake engine's huge replies (dev/fake-huge.js) is streamed in
// random pieces (and one character at a time for the small ones); after EVERY piece, the frozen blocks plus the live
// ones must give exactly renderMarkdown(text so far). Also: frozen blocks are never parsed again (parsed characters
// stay a small multiple of the reply), and code is highlighted in pieces (hlCut never cuts inside a token).
//   node dev/streamrender-test.js [--seed N] [--runs N]
const path = require('path');
const assert = require('assert');
globalThis.window = globalThis; globalThis.addEventListener = () => {};
require(path.join(__dirname, '..', 'md.js'));
const DOCS = require('./streamrender-corpus.json').docs;
const { huge } = require('./fake-huge');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? Number(argv[i + 1]) : d; };
let seed = opt('--seed', 35);
const RUNS = opt('--runs', 12);
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const full = window.renderMarkdownLive; // the uncached full render
let fails = 0; let checks = 0;
const ok = (name, fn) => { try { fn(); console.log(`✓ ${name}`); } catch (e) { fails += 1; console.log(`✖ ${name}: ${e.message.split('\n').slice(0, 6).join('\n  ')}`); } };

// streams `text` in pieces of 1..max characters; returns { parsed, updates } and throws on the first difference
function stream(text, max) {
  const live = Md.live();
  let frozen = ''; let tail = [];
  const before = Md.liveStats().chars;
  let at = 0; let updates = 0;
  while (at < text.length) {
    at = Math.min(text.length, at + 1 + Math.floor(rnd() * max));
    const now = text.slice(0, at);
    const r = live.update(now);
    if (!r) continue;
    updates += 1;
    if (r.reset) frozen = '';
    for (const b of r.frozen) frozen += b.html;
    tail = r.tail;
    const got = frozen + tail.map((b) => b.html).join('');
    const want = full(now);
    checks += 1;
    if (got !== want) {
      let i = 0; while (i < got.length && got[i] === want[i]) i += 1;
      throw new Error(`differs after ${at} characters at HTML ${i}:\n  live: …${got.slice(Math.max(0, i - 60), i + 80)}\n  full: …${want.slice(Math.max(0, i - 60), i + 80)}\n  text: ${JSON.stringify(now.slice(-120))}`);
    }
  }
  return { parsed: Md.liveStats().chars - before, updates };
}

ok(`corpus: ${DOCS.length} documents × ${RUNS} random streams equal the full render after every piece`, () => {
  for (const [k, d] of DOCS.entries()) for (let r = 0; r < RUNS; r++) { try { stream(d, r % 3 === 0 ? 3 : 24); } catch (e) { e.message = `document ${k}, run ${r}: ${e.message}`; throw e; } }
});
ok('corpus: one character at a time', () => { for (const [k, d] of DOCS.entries()) { try { stream(d, 1); } catch (e) { e.message = `document ${k}: ${e.message}`; throw e; } } });
ok('corpus glued together (blocks of every kind after each other)', () => { for (let r = 0; r < 4; r++) stream(DOCS.join('\n'), 40); stream(DOCS.join('\n\n'), 40); });
ok('the text can change behind the frozen part (a hidden tag stripped): it starts again, still equal', () => {
  const live = Md.live();
  live.update('Hello\n\nworld and more\n\n');
  const r = live.update('Hello\n\nworld');
  assert(r);
  const r2 = live.update('Help\n\nme');
  assert(r2.reset, 'expected a reset');
  assert.strictEqual(r2.frozen.map((b) => b.html).join('') + r2.tail.map((b) => b.html).join(''), full('Help\n\nme'));
});
for (const kind of ['', '-code', '-table', '-list', '-images', '-text']) {
  ok(`huge${kind}: streamed in random pieces, equal at every step`, () => { stream(huge(`huge${kind}`).slice(0, 40000), 300); });
}
// The Markdown work of a whole streamed reply: the starting code (round 16: the text since its last blank line outside
// a code block, rendered again on every paint) against Md.live, same pieces (≈ what arrives between two paints)
function oldWork(text, sizes) {
  let src = ''; let at = 0; const FENCE = /^\s*```/gm;
  for (const n of sizes) {
    at = Math.min(text.length, at + n); const now = text.slice(0, at);
    let cut = now.lastIndexOf('\n\n');
    for (let tries = 0; tries < 2 && cut > src.length; tries += 1) {
      const seg = now.slice(src.length, cut); const fences = [...seg.matchAll(FENCE)];
      if (fences.length % 2 === 0 && (seg.split('$$').length - 1) % 2 === 0) { full(seg); src = now.slice(0, cut); break; }
      cut = fences.length % 2 ? now.lastIndexOf('\n\n', src.length + fences.at(-1).index) : -1;
    }
    const tail = now.slice(src.length); if (tail.trim()) full(tail);
  }
}
function newWork(text, sizes) { const live = Md.live(); let at = 0; for (const n of sizes) { at = Math.min(text.length, at + n); live.update(text.slice(0, at)); } }
const timeIt = (fn) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; };
for (const kind of ['', '-code', '-table', '-list', '-text']) {
  ok(`huge${kind}: Markdown work while streaming (pieces of ≈ 250 characters, one per paint)`, () => {
    const text = huge(`huge${kind}`);
    const sizes = []; for (let n = 0; n < text.length;) { const k = 150 + Math.floor(rnd() * 200); sizes.push(k); n += k; }
    oldWork(text.slice(0, 5000), sizes); newWork(text.slice(0, 5000), sizes); // warm up
    const a = Math.min(timeIt(() => oldWork(text, sizes)), timeIt(() => oldWork(text, sizes)));
    const b = Math.min(timeIt(() => newWork(text, sizes)), timeIt(() => newWork(text, sizes)));
    console.log(`    ${text.length.toLocaleString()} characters, ${sizes.length} paints: before ${a.toFixed(0)} ms (${(a / sizes.length).toFixed(2)} ms a paint) → after ${b.toFixed(0)} ms (${(b / sizes.length).toFixed(2)} ms a paint)`);
    // (the string work was already small before, except big tables; what the live renderer saves is DOM work, measured
    // in the app by dev/checks/streamrender.js: here it must stay far below a 240 Hz frame per paint)
    assert(b / sizes.length < 1.5, `${(b / sizes.length).toFixed(2)} ms of Markdown work per paint`);
  });
}
ok('hlCut: never inside a token, never past an open comment or template', () => {
  const code = 'const a = 1;\n/* open\nstill */\nlet b = `x\ny`;\nconst c = "s";\n';
  const cut = Md._hlCut(code, 'js');
  assert.strictEqual(code.slice(0, cut), code, 'all closed: the whole thing');
  assert.strictEqual(Md._hlCut('a = 1;\n/* open\nmore\n', 'js'), 'a = 1;\n'.length);
  assert.strictEqual(Md._hlCut('a = `x\ny\n', 'js'), 0);
  assert.strictEqual(Md._hlCut('x = 1 # `\ny\n', 'py'), 'x = 1 # `\ny\n'.length, 'a backtick in a Python comment is no opener');
  assert.strictEqual(Md._hlCut('echo `date`\nls\n', 'bash'), 'echo `date`\nls\n'.length, 'plain languages cut at any line');
  assert.strictEqual(Md._hlCut('no newline yet', 'js'), 0);
});
console.log(`${checks} live renders compared`);
if (fails) { console.log(`FAIL: ${fails} failed`); process.exit(1); }
console.log('all passed');
