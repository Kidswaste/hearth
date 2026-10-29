#!/usr/bin/env node
// (round 83, firstscreen83) What each first-screen script (index.html's eager <script defer> files) contributes and
// when its code is first needed: per file, the bytes of functions that had not run when the first screen was up
// ('hearth:ready', before any input), and of those, the ones that still had not run seconds later (every feature
// group loaded, no input). The biggest such blocks are the candidates for a lazy group (lazy-data.js).
//   node dev/smoke.js --data <profile> --coverage-ready /tmp/r.json --coverage /tmp/a.json --wait 9000
//   node dev/firstscreen-coverage.js /tmp/r.json /tmp/a.json            # per file
//   node dev/firstscreen-coverage.js /tmp/r.json /tmp/a.json --blocks 40 # + the 40 biggest blocks not run at ready
//   node dev/firstscreen-coverage.js r1.json,r2.json a1.json,a2.json      # several runs: run in any counts as run
// A hint list, not a verdict: a function nobody called at start can still be needed the moment a click comes.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const eager = [...html.matchAll(/<script defer src="([^"#]+)"/g)].map((m) => m[1]).filter((f) => f !== 'lazy-at.js');
const rel = (url) => decodeURIComponent(url.replace(/^file:\/\//, '').split(/[?#]/)[0]).replace(/^.*hearth-smoke-[^/]+\//, '');
const kb = (n) => (n / 1024).toFixed(1);

// file → Map(startOffset → { end, count, name }), counts summed over the copies (a reload can leave the old one)
// (comma-separated files: several runs together, e.g. a chat first screen and Projects Home)
function read(files) {
  const out = new Map();
  if (!files) return out;
  for (const s of files.split(',').flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')).js)) {
    const f = rel(s.url);
    const m = out.get(f) || new Map();
    for (const fn of s.functions) {
      const r = fn.ranges[0];
      const e = m.get(r.startOffset);
      if (e) e.count += r.count; else m.set(r.startOffset, { end: r.endOffset, count: r.count, name: fn.functionName });
    }
    out.set(f, m);
  }
  return out;
}
const ready = read(args[0]);
const after = read(args[1] && !args[1].startsWith('--') ? args[1] : null);
const rows = []; const blocks = [];
for (const f of eager) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const r = ready.get(f);
  if (!r) { rows.push({ f, size: src.length, notRun: src.length, never: src.length, missing: true }); continue; }
  const a = after.get(f) || new Map();
  const dead = [...r.entries()].filter(([s, x]) => x.count === 0 && x.end > s).sort((x, y) => x[0] - y[0] || y[1].end - x[1].end);
  const outer = [];
  for (const [s, x] of dead) if (!outer.some((o) => o.s <= s && o.end >= x.end)) outer.push({ s, end: x.end, name: x.name });
  let notRun = 0; let never = 0;
  for (const o of outer) {
    const later = [...a.entries()].some(([s, x]) => s >= o.s && x.end <= o.end && x.count > 0);
    notRun += o.end - o.s; if (!later) never += o.end - o.s;
    blocks.push({ f, line: src.slice(0, o.s).split('\n').length, name: o.name || '(anon)', bytes: o.end - o.s, later });
  }
  rows.push({ f, size: src.length, notRun, never });
}
rows.sort((x, y) => y.notRun - x.notRun);
console.log('first-screen file: KB not run at ready (of which never run in the window) / file KB');
for (const r of rows) console.log(`  ${kb(r.notRun).padStart(6)} (${kb(r.never).padStart(6)}) / ${kb(r.size).padStart(6)}  ${r.f}${r.missing ? '  [no coverage]' : ''}`);
const sum = (k) => kb(rows.reduce((t, r) => t + r[k], 0));
console.log(`  total ${sum('notRun')} KB not run at ready (${sum('never')} never) of ${sum('size')} KB`);
const n = Number(opt('--blocks', 0));
if (n) {
  console.log(`\nbiggest blocks not run at ready (* = ran later, before any input):`);
  for (const b of blocks.sort((x, y) => y.bytes - x.bytes).slice(0, n)) console.log(`  ${kb(b.bytes).padStart(6)} KB ${b.later ? '*' : ' '} ${b.f}:${b.line} ${b.name}`);
}
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ rows, blocks }, null, 1));
