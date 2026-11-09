#!/usr/bin/env node
// (round 153, trim153) Writes each lazy group's size (its JS + CSS, KB) into trim-data.js (TrimData.KB), for Trim
// Hearth's "weight" column. Run it after a group's files change a lot; dev/checks/trim153.js and `--check` say when
// it is more than 10 % (or 5 KB) off.
//   node dev/trim-weights.js           # rewrite trim-data.js's sizes
//   node dev/trim-weights.js --check   # exit 1 when out of date
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'trim-data.js');
const LazyData = new Function(`${fs.readFileSync(path.join(ROOT, 'lazy-data.js'), 'utf8')}; return LazyData;`)(); // eslint-disable-line no-new-func
const size = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n').length; } catch { return 0; } };
const kb = {};
for (const g of LazyData.GROUPS) kb[g.name] = Math.max(1, Math.round([...g.files, ...(g.css || [])].reduce((a, f) => a + size(f), 0) / 1024));
const A = '  // ---- written by dev/trim-weights.js below this line ----\n';
const B = '  // ---- end of written part ----';
const src = fs.readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');
const a = src.indexOf(A), b = src.indexOf(B);
if (a < 0 || b < 0) { console.error('markers missing in trim-data.js'); process.exit(1); }
const next = `${src.slice(0, a)}${A}  const KB = ${JSON.stringify(kb)};\n${src.slice(b)}`;
const off = (old) => Object.keys(kb).filter((n) => !(n in old) || Math.abs(old[n] - kb[n]) > Math.max(5, kb[n] * 0.1));
if (process.argv.includes('--check')) {
  const old = new Function(`${src}; return TrimData;`)().KB; // eslint-disable-line no-new-func
  const bad = off(old);
  if (bad.length) { console.log(`✖ trim-data.js sizes out of date for ${bad.join(', ')}: node dev/trim-weights.js`); process.exit(1); }
  console.log(`✓ trim-data.js sizes up to date (${Object.keys(kb).length} groups)`);
} else if (next !== src) { fs.writeFileSync(FILE, next); console.log('wrote trim-data.js sizes'); } else console.log('trim-data.js sizes unchanged');
