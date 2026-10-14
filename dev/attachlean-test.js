#!/usr/bin/env node
// (round 40, attachlean) The rules of lean attachments (attachlean-core.js): picture sizes, the outline and the parts
// picked for a message, logs (head / tail / errors with their stack traces, one per kind), the same file again, the
// diff, the chip's words; then the before → after table for typical attachments (--table prints only that).
//   node dev/attachlean-test.js [--table]
const fs = require('fs');
const path = require('path');
const C = require('../attachlean-core.js');

let pass = 0; let fail = 0;
const ok = (cond, what, info) => { if (cond) pass += 1; else { fail += 1; console.log(`✖ ${what}${info === undefined ? '' : `  ${typeof info === 'string' ? info : JSON.stringify(info).slice(0, 400)}`}`); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), what, { got: a, want: b });

// ---------- fixtures: a real 2,000-line code file, a 5 MB log, a long paste ----------
const CODE = fs.readFileSync(path.join(__dirname, '..', 'native.js'), 'utf8').split('\n').slice(0, 2000).join('\n');
function makeLog(bytes) {
  const out = []; let size = 0; let i = 0;
  const t0 = Date.UTC(2026, 9, 14, 9, 0, 0);
  while (size < bytes) {
    const ts = new Date(t0 + i * 250).toISOString().replace('T', ' ').slice(0, 23);
    let l;
    if (i % 997 === 500) l = `${ts} ERROR [renderer] Uncaught TypeError: Cannot read properties of undefined (reading 'session')\n    at send (native.js:1475:31)\n    at HTMLFormElement.<anonymous> (native.js:228:9)\n    at onSubmit (ui.js:88:3)`;
    else if (i % 3001 === 1700) l = `${ts} ERROR [main] spawn ENOENT: claude not found at /usr/local/bin/claude (attempt ${i})`;
    else if (i % 211 === 7) l = `${ts} WARN  [sync] slow pass: ${100 + (i % 900)} ms for ${i % 40} files`;
    else l = `${ts} INFO  [engine] chat ${(i * 7919 % 100000).toString(36)} reply done in ${200 + (i % 5000)} ms · ${i % 3000} tokens in · ${i % 400} out`;
    out.push(l); size += l.length + 1; i += 1;
  }
  return out.join('\n');
}
const LOG = makeLog(5 * 1024 * 1024);
const PASTE = Array.from({ length: 180 }, (_, i) => `Paragraph ${i + 1}. The intro video opens on the Hearth flame, then cuts to the Lab where the orb pulses with the kick drum; the director chat suggests a palette from the board and the timeline snaps to the drop at bar ${i % 32}. Notes about pacing, colour and type for shot ${i + 1}.`).join('\n\n');

(async () => {
  // ---------- pictures ----------
  eq(C.fit(3840, 2160), { w: 1568, h: 882, scaled: true }, '4K landscape → 1568 × 882');
  eq(C.fit(1080, 1920), { w: 882, h: 1568, scaled: true }, '9:16 → 882 × 1568');
  eq(C.fit(1200, 800), { w: 1200, h: 800, scaled: false }, 'small pictures stay as they are');
  eq(C.fit(1568, 1000).scaled, false, 'exactly 1568 stays');
  eq(C.fit(10000, 3).h >= 1, true, 'a thin strip keeps at least 1 px');
  const p4k = C.imagePlan({ name: 'Screen Shot.png', w: 3840, h: 2160 });
  ok(p4k.scale && p4k.type === 'image/png' && p4k.ext === 'png' && p4k.tokens === C.imageTokens(1568, 882) && p4k.wholeTokens === C.imageTokens(3840, 2160), 'a 4K PNG is sent as a PNG at 1568 px, its tokens and the whole', p4k);
  eq(C.imagePlan({ name: 'photo.JPG', w: 4032, h: 3024 }).type, 'image/jpeg', 'a JPEG stays a JPEG');
  eq(C.imagePlan({ name: 'loop.gif', w: 2000, h: 2000 }).scale, false, 'a GIF is never re-encoded (it may move)');
  eq(C.imageTokens(1568, 882), 1844, 'picture tokens ≈ w × h / 750');

  // ---------- text kinds and outline ----------
  eq(C.kindOf('native.js', CODE), 'code', 'a .js file is code');
  eq(C.kindOf('Pasted text', LOG.slice(0, 50000)), 'log', 'a pasted log is recognised by its timestamps');
  eq(C.kindOf('notes.md', '# A\ntext'), 'doc', 'markdown is a doc');
  eq(C.kindOf('Pasted text', PASTE), 'text', 'prose is text');
  const ol = C.outline(CODE.split('\n'), 'code');
  ok(ol.length > 10 && ol.length <= 60 && ol.every((o) => /^(async )?function /.test(o.text)), 'a long file\'s outline keeps its functions (≤ 60 lines)', ol.slice(0, 5));
  const lines = CODE.split('\n');
  ok(ol.every((o) => lines[o.n - 1].includes(o.text.slice(0, 20))), 'outline line numbers point at the right lines');
  eq(C.outline('# One\ntext\n## Two\n'.split('\n'), 'doc').map((o) => o.n), [1, 3], 'a doc\'s outline is its headings');

  // ---------- what the message is about ----------
  const q = C.terms('Why does renderChips not show the cost? See line 390 and the "attach-tok" span');
  ok(q.words.includes('renderchips') && q.words.includes('attach-tok') && !q.words.includes('does') && !q.words.includes('show'), 'terms: identifiers and quoted bits, not filler words', q);
  eq(q.lines, [[390, 390]], 'terms: a line number');
  eq(C.terms('lines 10-20 please').lines, [[10, 20]], 'terms: a line range');
  ok(C.terms('it crashed again').errors && !C.terms('make it pink').errors, 'terms: about errors or not');

  // ---------- a big code file: outline + the parts asked about ----------
  const msg = 'Why does renderChips not show the token cost on the chip?';
  const rc = C.leanText({ name: 'native.js', text: CODE, message: msg, canRead: true, path: '/att/lean-x-native.js' });
  ok(rc.mode === 'lean' && rc.tokens < 2600 && rc.wholeTokens > 30000, 'a 2,000-line file goes trimmed (≈ outline + parts)', { tokens: rc.tokens, whole: rc.wholeTokens });
  ok(/function renderChips\(agentId\)/.test(rc.text), 'the function the message names is in the parts');
  ok(/--- lines \d+–\d+ \(“renderchips”/.test(rc.text), 'each part says why it was picked');
  ok(rc.text.includes('/att/lean-x-native.js') && /Read tool/.test(rc.text), 'the whole file is one Read away (its path)');
  ok(/^<file name="native.js" lines="2000" sent="part">/.test(rc.text), 'the file tag says it is a part');
  const rl = C.leanText({ name: 'native.js', text: CODE, message: 'look at line 1500', canRead: true, path: '/x' });
  ok(/1500│/.test(rl.text) && /line 1500 you named/.test(rl.text), 'a named line number is sent with its context');
  const rn = C.leanText({ name: 'native.js', text: CODE, message: msg, canRead: false });
  ok(rn.mode === 'lean' && /say which lines/.test(rn.text) && !/Read tool/.test(rn.text), 'an AI that can\'t read files is told to ask for other lines');
  const mid = CODE.split('\n').slice(0, 400).join('\n'); // ≈ 6k tokens
  eq(C.leanText({ name: 'a.js', text: mid, canRead: false }).mode, 'whole', 'without file reading, a 6k-token file still goes whole (up to 12k: quality first)');
  eq(C.leanText({ name: 'a.js', text: mid, canRead: true, path: '/x' }).mode, 'lean', 'with file reading, over 4k tokens goes trimmed');
  eq(C.leanText({ name: 'a.js', text: CODE, whole: true }).mode, 'whole', 'send whole overrides');
  eq(C.leanText({ name: 's.txt', text: 'short' }).text, '<file name="s.txt">\nshort\n</file>', 'a small file is sent exactly as before');
  const minified = `${'x'.repeat(50000)}\n`.repeat(3);
  ok(C.leanText({ name: 'min.js', text: minified, canRead: true, path: '/x' }).tokens < 1200, 'minified lines are cut (400 chars)');

  // ---------- a 5 MB log ----------
  const t0 = Date.now();
  const rg = C.leanText({ name: 'hearth.log', text: LOG, message: 'why does it crash when I send?', canRead: true, path: '/att/hearth.log' });
  const ms = Date.now() - t0;
  ok(rg.mode === 'lean' && rg.tokens < 2400, 'a 5 MB log goes as ≈ 2k tokens', rg.tokens);
  ok(/^Log: [\d,]+ lines · 2026-10-14 09:00:00 → .* error lines \(2 kinds\) · [\d,]+ warnings/m.test(rg.text), 'the log summary: lines, first → last time, errors (kinds), warnings', rg.text.split('\n')[1]);
  ok(/Uncaught TypeError/.test(rg.text) && /at send \(native\.js:1475:31\)/.test(rg.text), 'the error comes with its stack trace');
  ok(/ENOENT/.test(rg.text), 'every kind of error is there');
  ok(/error ×[\d,]+ \(first\)/.test(rg.text) && /\(last\)/.test(rg.text), 'a repeated error: its first and last time, with the count');
  ok(/--- lines 1–\d+ \(start\)/.test(rg.text) && /\(end\) ---/.test(rg.text), 'the log\'s head and tail');
  ok(ms < 3000, `5 MB planned in ${ms} ms`);

  // ---------- a long paste ----------
  const rp = C.leanText({ name: 'Pasted text', text: PASTE, message: 'tighten the pacing notes for shot 42', canRead: true, path: '/att/p.txt' });
  ok(rp.mode === 'lean' && /shot 42/.test(rp.text) && rp.tokens < 2000, 'a long paste: the parts about the message', rp.tokens);
  ok(C.tok(PASTE) > C.PASTE_CHARS / 4, 'the paste is over the chip threshold');

  // ---------- the same file again ----------
  const h = C.hash(CODE);
  eq(C.hash(CODE), h, 'hash is stable'); ok(C.hash(`${CODE} `) !== h, 'hash changes with one char');
  const at = new Date(2026, 9, 14, 14, 2).getTime();
  const seen = { hash: h, at, lean: false, copy: '/att/lean-x-native.js', valid: true };
  const same = C.again({ name: 'native.js', text: CODE, seen });
  ok(same.mode === 'same' && /Unchanged since your message at 14:02/.test(same.text) && same.tokens < 60, 'same file: one line pointing at 14:02', same);
  eq(C.again({ name: 'n', text: CODE, seen: { ...seen, valid: false } }).mode, 'new', 'a session that no longer holds it: sent again');
  eq(C.again({ name: 'n', text: CODE, seen, whole: true }).mode, 'new', 'send whole: sent again');
  eq(C.again({ name: 'n', text: CODE, seen: { ...seen, lean: true, copy: null }, canRead: false }).mode, 'new', 'only parts were sent and it can\'t read the rest: parts again');
  const changed = CODE.replace('function renderChips(agentId) {', 'function renderChips(agentId, opts = {}) {');
  const dv = C.again({ name: 'native.js', text: changed, seen, prev: CODE });
  ok(dv.mode === 'diff' && dv.added === 1 && dv.removed === 1 && /\+  function renderChips\(agentId, opts = \{\}\) \{/.test(dv.text) && dv.tokens < 200, 'changed: only the diff', dv);
  ok(/@@ new lines \d+–\d+ @@/.test(dv.text), 'the diff has the new line numbers');
  eq(C.again({ name: 'n', text: 'totally different', seen, prev: CODE }).mode, 'new', 'a rewrite is sent as new');
  // validity
  ok(C.valid({ sid: 's1', n: 4 }, { sessionId: 's1', messages: 10 }), 'valid in the same session');
  ok(!C.valid({ sid: 's1', n: 4 }, { sessionId: 's2', messages: 10 }), 'not after a new session (compact, handover)');
  ok(!C.valid({ sid: 's1', n: 4 }, { sessionId: 's1', messages: 4 + C.REF_WITHIN + 1 }), 'not when too far back');
  ok(!C.valid({ sid: null, n: 4, pending: true }, { sessionId: null, messages: 5 }), 'not while its reply hasn\'t come');

  // ---------- diff ----------
  eq(C.diff('a\nb\nc', 'a\nb\nc').hunks.length, 0, 'no change, no hunk');
  const d1 = C.diff('1\n2\n3\n4\n5\n6\n7\n8\n9\n10', '1\n2\n3\nX\n5\n6\n7\n8\n9\n10\n11');
  eq([d1.added, d1.removed, d1.hunks.length], [2, 1, 2], 'two separate changes, two hunks');
  ok(/^-4$/m.test(d1.text) && /^\+X$/m.test(d1.text) && /^\+11$/m.test(d1.text), 'removed and added lines', d1.text);
  const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`);
  const big2 = big.slice(); big2[1500] = 'changed'; big2.splice(2500, 0, 'inserted');
  const d2 = C.diff(big.join('\n'), big2.join('\n'));
  eq([d2.added, d2.removed], [2, 1], 'a 3,000-line file: two edits found');

  // ---------- the chip's words ----------
  eq(C.chipText({ kind: 'image', scale: true, tokens: 1844, wholeTokens: 11059 }), 'sent at 1568 px · ≈ 1.8k tok', 'chip: a scaled picture');
  eq(C.chipText({ kind: 'image', scale: true, tokens: 1844, wholeTokens: 11059, whole: true }), 'whole · ≈ 11k tok', 'chip: a picture sent whole');
  eq(C.chipText({ kind: 'text', mode: 'lean', tokens: 1500, wholeTokens: 14000 }), '≈ 1.5k of 14k tok', 'chip: a trimmed text');
  eq(C.chipText({ kind: 'text', mode: 'whole', tokens: 800, wholeTokens: 800 }), '≈ 800 tok', 'chip: a small text');
  eq(C.chipText({ kind: 'text', same: '14:02', tokens: 40 }), 'same as 14:02 · ≈ 40 tok', 'chip: the same file again');
  eq(C.fmtTok(1310000), '1.3M', 'millions');

  // ---------- byte-stable: the same inputs give the same message ----------
  eq(C.leanText({ name: 'hearth.log', text: LOG, message: 'why does it crash when I send?', canRead: true, path: '/att/hearth.log' }).text, rg.text, 'the same attachment and message → the same bytes');

  // ---------- before → after ----------
  const before = {
    code: C.tok(`<file name="native.js">\n${CODE}\n</file>`), // inlined whole (it was under 200 KB)
    log: C.tok(LOG.slice(0, 200 * 1024)), // refused as a file; pasted: cut at 200 KB and inlined
    pic: C.imageTokens(3840, 2160),
    paste: C.tok(`<file name="pasted.txt">\n${PASTE}\n</file>`),
  };
  const twice = (x) => x * 2;
  const rows = [
    ['2,000-line code file (native.js, 150 KB)', before.code, rc.tokens],
    ['5 MB log (pasted; as a file it was refused over 200 KB)', before.log, rg.tokens],
    ['4K screenshot 3840×2160', before.pic, C.imageTokens(1568, 882)],
    [`long paste (${Math.round(PASTE.length / 1024)} KB of notes)`, before.paste, rp.tokens],
    ['the same code file again, next message', before.code, same.tokens],
    ['…changed by one line', before.code, dv.tokens],
    ['code file twice (both messages)', twice(before.code), rc.tokens + same.tokens],
  ];
  const table = ['| attachment | before | after |', '|---|---:|---:|', ...rows.map(([n, b, a]) => `| ${n} | ${b.toLocaleString('en-US')} | ${a.toLocaleString('en-US')} (−${Math.round((1 - a / b) * 100)} %) |`)].join('\n');
  if (process.argv.includes('--table')) { console.log(table); process.exit(0); }
  console.log(table);
  console.log(`attachlean-test: ${pass} passed${fail ? `, ${fail} FAILED` : ''}`);
  process.exit(fail ? 1 : 0);
})();
