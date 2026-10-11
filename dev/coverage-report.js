#!/usr/bin/env node
// Reads a coverage file from `node dev/smoke.js --coverage <file> --script dev/checks/trim-drive.js` and lists what
// never ran: app files that never loaded, per JS file the functions never called (outermost only, with their size),
// per stylesheet the rules that never matched. A hint list, not a verdict: cross-check with grep before deleting
// (names built from strings, commands nobody typed in the drive, data read by other code, platform-only paths).
//   node dev/coverage-report.js /tmp/cov.json                 # summary per file (KB never run)
//   node dev/coverage-report.js /tmp/cov.json --file board.js # that file's uncalled functions / unused rules
//   node dev/coverage-report.js /tmp/cov.json --json out.json # everything, machine-readable
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const cov = JSON.parse(fs.readFileSync(args[0], 'utf8'));
const only = opt('--file');
const rel = (url) => {
  const p = decodeURIComponent(url.replace(/^file:\/\//, '').split(/[?#]/)[0]);
  const m = p.match(/hearth-smoke-[^/]+\/(.+)$/);
  return m ? m[1] : p;
};
const kb = (n) => Math.round(n / 102.4) / 10;
const report = { js: {}, css: {}, neverLoaded: [] };

// ---------- JS: functions with count 0 whose parent ran (the outermost dead ranges) ----------
for (const s of cov.js) {
  const file = rel(s.url);
  let src = '';
  try { src = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { continue; }
  const fns = s.functions.map((f) => ({ name: f.functionName, start: f.ranges[0].startOffset, end: f.ranges[0].endOffset, count: f.ranges[0].count }));
  const dead = fns.filter((f) => f.count === 0 && f.end - f.start > 0)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const outer = [];
  for (const f of dead) if (!outer.some((o) => o.start <= f.start && o.end >= f.end)) outer.push(f);
  const deadBytes = outer.reduce((a, f) => a + f.end - f.start, 0);
  const line = (off) => src.slice(0, off).split('\n').length;
  const r = report.js[file] ||= { size: src.length, deadBytes: 0, dead: [] };
  r.deadBytes = Math.max(r.deadBytes, deadBytes);
  if (!r.dead.length) r.dead = outer.map((f) => ({ name: f.name || '(anon)', line: line(f.start), bytes: f.end - f.start }));
}
// ---------- CSS: rules never matched ----------
// (CDP lists the rules that matched; every style rule of the sheet that isn't one of them never did)
function styleRules(text) { // [start, end] of each style rule (inside @media / @supports too)
  const out = []; const stack = []; let start = 0; let q = null;
  const top = () => !stack.length || stack[stack.length - 1].group;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? text.length : e + 1; if (top()) start = i + 1; continue; }
    if (c === '{') {
      const raw = text.slice(start, i); const pre = raw.trim();
      stack.push({ at: start + raw.length - raw.trimStart().length, group: /^@(media|supports|layer|container)/.test(pre), atRule: pre.startsWith('@') });
      start = i + 1;
    } else if (c === '}') {
      const r = stack.pop();
      if (r && !r.atRule && stack.every((x) => x.group)) out.push([r.at, i + 1]);
      start = i + 1;
    } else if (c === ';' && top()) start = i + 1;
  }
  return out;
}
for (const sh of cov.css) {
  const file = rel(sh.url);
  const all = styleRules(sh.text);
  const hit = new Set();
  for (const u of sh.rules.filter((r) => r[2])) { const r = all.find(([a, b]) => u[0] >= a && u[0] < b); if (r) hit.add(r[0]); }
  const unused = all.filter(([a]) => !hit.has(a));
  const prev = report.css[file];
  if (!all.length || (prev && prev.unusedRules <= unused.length)) continue; // the same sheet twice (one from before the reload, empty): keep the one that matched more
  report.css[file] = { size: sh.text.length, rules: all.length, unusedRules: unused.length, unusedBytes: unused.reduce((a, [x, y]) => a + y - x, 0),
    unused: unused.map(([a]) => sh.text.slice(a, sh.text.indexOf('{', a)).replace(/\s+/g, ' ').trim().slice(0, 160)) };
}
// ---------- app files never loaded ----------
const loaded = new Set([...Object.keys(report.js), ...Object.keys(report.css)]);
const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => {
  if (!d && ['.git', 'dev', 'docs', 'data', 'node_modules', 'mac', 'assets', 'electron'].includes(e.name)) return [];
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : /\.(js|css)$/.test(e.name) ? [p] : [];
});
report.neverLoaded = walk('').filter((f) => !loaded.has(f));

if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(report, null, 1));
if (only) {
  const j = report.js[only]; const c = report.css[only];
  if (j) for (const d of j.dead) console.log(`${only}:${d.line}  ${d.name}  ${d.bytes} B`);
  if (c) for (const s of c.unused) console.log(`${only}  ${s}`);
  process.exit(0);
}
const rows = Object.entries(report.js).sort((a, b) => b[1].deadBytes - a[1].deadBytes);
console.log('JS never run (KB of uncalled functions / file KB):');
for (const [f, r] of rows.slice(0, 60)) console.log(`  ${String(kb(r.deadBytes)).padStart(7)} / ${String(kb(r.size)).padStart(6)}  ${f}`);
console.log(`  total ${kb(rows.reduce((a, [, r]) => a + r.deadBytes, 0))} KB of ${kb(rows.reduce((a, [, r]) => a + r.size, 0))} KB`);
console.log('CSS never matched (rules, KB / file KB):');
for (const [f, r] of Object.entries(report.css).sort((a, b) => b[1].unusedBytes - a[1].unusedBytes)) console.log(`  ${String(r.unusedRules).padStart(5)} / ${String(r.rules).padStart(5)}  ${String(kb(r.unusedBytes)).padStart(6)} / ${String(kb(r.size)).padStart(6)}  ${f}`);
console.log(`Never loaded in the renderer (main-process, MCP, window and worker files are expected here):\n  ${report.neverLoaded.join('\n  ')}`);
