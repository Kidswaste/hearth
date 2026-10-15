#!/usr/bin/env node
// 🛟 datasafe lint (round 43): flags NEW code that reads a store with a fallback and saves it again without the guard —
// the pattern that lost the owner's Lab scenes on Windows (a read failed → the fallback → saved over everything).
//   renderer  a file that reads kv store X with a fallback (hub.kvGet(X, fallback)) and writes X (hub.kvSet(X, …)),
//             without DataSafe.load / DataSafe.save (datasafe.js) or a status read (kvGet(X, d, { status: true }))
//   main      a file that parses a file read in a try / catch with a fallback (JSON.parse(fs.readFileSync(…)) … catch)
//             and writes files (writeFileSync / renameSync), without datasafe-core / scenesafe-core (load, readRetry,
//             readStatus) or the store (store.getKV / setKV, which guard by themselves)
// Everything found when the guard went in (round 43) was audited: kv stores are protected by the store's own guard
// (store.js: a store read with a fallback is merged with the disk before a save; a held file is never written), the
// main-side ones were fixed or are listed with why in dev/datasafe-baseline.json. A finding not in that list fails.
//   node dev/datasafe-scan.js            → { pass, new: [...], audited, stale }
//   node dev/datasafe-scan.js --baseline → rewrites dev/datasafe-baseline.json with every finding now (after an audit)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = path.join(__dirname, 'datasafe-baseline.json');
const SKIP_DIRS = new Set(['dev', 'node_modules', 'electron', 'electron-mac', 'data', 'docs', 'mac', 'assets', '.git', '.claude']);

function files(dir = ROOT, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) out.push(...files(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name)); continue; }
    if (e.name.endsWith('.js')) out.push(rel ? `${rel}/${e.name}` : e.name);
  }
  return out;
}

// the store names a file reads with a fallback, and the ones it writes ('KV' constants resolved in the same file)
function storeFindings(src) {
  const consts = new Map();
  for (const m of src.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*['"`]([\w-]+)['"`]/g)) consts.set(m[1], m[2]);
  const nameOf = (tok) => { const t = tok.trim(); const q = /^['"`]([\w-]+)['"`]$/.exec(t); if (q) return q[1]; return consts.get(t) || null; };
  const reads = new Set(); const writes = new Set();
  for (const m of src.matchAll(/kvGet\(\s*([^,()]+?)\s*,\s*([^)]*?)\)/g)) {
    const n = nameOf(m[1]);
    if (!n) continue;
    if (/status\s*:\s*true/.test(m[2])) continue; // a read that says what happened
    reads.add(n);
  }
  for (const m of src.matchAll(/kvSet\(\s*([^,()]+?)\s*,/g)) { const n = nameOf(m[1]); if (n) writes.add(n); }
  return [...reads].filter((n) => writes.has(n));
}
const usesGuard = (src) => /\bDataSafe\.(load|save)\b|datasafe-core|scenesafe-core|\bDS\.load\b|\breadRetry\b|\breadStatus\b/.test(src);

function scan() {
  const found = [];
  for (const f of files()) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (f === 'datasafe.js' || f === 'datasafe-core.js' || f === 'scenesafe-core.js') continue;
    if (!usesGuard(src)) for (const n of storeFindings(src)) found.push({ file: f, kind: 'kv', store: n });
    // main-side: a parse of a file read with a fallback, and a file write, in the same module, no careful read
    const fallbackRead = /JSON\.parse\(\s*fs\.readFileSync\([^)]*\)\s*\)[^\n]*\}\s*catch\s*(\([^)]*\))?\s*\{\s*(return\s+[^;}]+|[\w.]+\s*=\s*[^;}]+)/.test(src) || /catch\s*(\([^)]*\))?\s*\{\s*return\s+(\{\}|\[\]|d|fallback|null)\s*;?\s*\}/.test(src) && /JSON\.parse\(\s*fs\.readFileSync/.test(src);
    if (fallbackRead && /writeFileSync\(|renameSync\(/.test(src) && !usesGuard(src)) found.push({ file: f, kind: 'main' });
  }
  return found;
}

const key = (x) => `${x.file}|${x.kind}|${x.store || ''}`;
module.exports = { storeFindings, usesGuard, scan };
if (require.main !== module) return;
const found = scan();
if (process.argv.includes('--baseline')) {
  const old = (() => { try { return JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch { return { audited: [] }; } })();
  const why = new Map((old.audited || []).map((x) => [key(x), x.why]));
  const audited = found.map((x) => ({ ...x, why: why.get(key(x)) || (x.kind === 'kv' ? 'renderer kv store: the store guard merges a save built on a failed read with the disk (store.js / datasafe-core.js)' : 'reviewed: see docs/upgrades/datasafe.md') }));
  fs.writeFileSync(BASE, `${JSON.stringify({ note: 'Audited in round 43 (datasafe). New code: use DataSafe.load / DataSafe.save (renderer) or datasafe-core load (main).', audited }, null, 1)}\n`);
  console.log(`baseline: ${audited.length} audited`);
  process.exit(0);
}
let base = { audited: [] };
try { base = JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch { /* none: everything is new */ }
const known = new Set((base.audited || []).map(key));
const fresh = found.filter((x) => !known.has(key(x)));
const now = new Set(found.map(key));
const stale = (base.audited || []).filter((x) => !now.has(key(x))).map(key);
for (const x of fresh) console.log(`✖ ${x.file}: ${x.kind === 'kv' ? `reads the store "${x.store}" with a fallback and saves it without DataSafe.load / DataSafe.save` : 'reads a file with a fallback and writes files without datasafe-core load / readRetry'}`);
console.log(JSON.stringify({ pass: !fresh.length, new: fresh, audited: known.size, found: found.length, stale }, null, 1));
process.exit(fresh.length ? 1 : 0);
