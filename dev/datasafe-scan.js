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
//   read      (round 104, emptyread104) any file: a read site whose failure (any error, not only ENOENT) gives an empty
//             default that the same function writes / acts on, or hands to a write where it is called (see below)
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

// ---------- (round 104, emptyread104) a read that fails taken as "empty", then written or acted on ----------
// Round 103 found sync-engine.js `localJsonText` reading config.json as `let cur = {}; try { cur = parse(await
// fsp.readFile(…)) } catch { }` and writing the shared settings over that {}: a settings file held a moment (EBUSY) lost
// this computer's own settings. The rule above missed it three ways: it only knew `JSON.parse(fs.readFileSync(…))`
// (not an async read, nor another parser), a catch that leaves the default set before the `try` (empty body) looked
// like nothing, and it judged whole files (sync-engine.js was audited once, so nothing new in it could fail). This rule
// looks at each read site on its own:
//   site   a read (readFileSync / readFile / readRetry …) in a `try` whose catch, on ANY error, gives an empty default
//          (`return {}` · `x = []` · an empty catch after `let x = {}` · `return fallback` …), or `read(…).catch(() =>
//          default)`. A catch that looks at the error (ENOENT), throws, or refuses (continue, `return`, false, stale,
//          held, ok: false…) is fine.
//   acted  the function holding the site writes, renames or removes something, or the function's result is handed to a
//          write on the line it is called (or the two lines after it: `lt = await localJsonText(…); casWrite(…, lt)`)
// Each finding is keyed by file, function and the read call (not by line), and audited in dev/datasafe-baseline.json
// with why it is safe; a new one fails, in any file.
function mask(src, keepStrings = false) {
  const out = src.split(''); const n = src.length; const stack = [];
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0; let prev = '';
  while (i < n) {
    const c = src[i]; const d = src[i + 1];
    if (c === '/' && d === '/') { const j = src.indexOf('\n', i); const e = j < 0 ? n : j; blank(i, e); i = e; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); const e = j < 0 ? n : j + 2; blank(i, e); i = e; continue; }
    if (c === '\'' || c === '"') { let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j += 1; j += 1; } if (!keepStrings) blank(i + 1, j); i = j + 1; prev = 'x'; continue; }
    if (c === '`' || (c === '}' && stack.length && stack[stack.length - 1] === 0)) {
      if (c === '}') stack.pop();
      let j = i + 1;
      while (j < n && src[j] !== '`') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '$' && src[j + 1] === '{') break; j += 1; }
      if (!keepStrings) blank(i + 1, j);
      if (j < n && src[j] === '$') { stack.push(0); i = j + 2; prev = '{'; continue; }
      i = j + 1; prev = 'x'; continue;
    }
    if (c === '/' && (prev === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev) || /\b(?:return|typeof|case|in|of|void|delete)$/.test(src.slice(Math.max(0, i - 8), i).trimEnd()))) {
      let j = i + 1; let cls = false;
      while (j < n && src[j] !== '\n') { const x = src[j]; if (x === '\\') { j += 2; continue; } if (x === '[') cls = true; else if (x === ']') cls = false; else if (x === '/' && !cls) break; j += 1; }
      if (src[j] === '/') { if (!keepStrings) blank(i + 1, j); i = j + 1; prev = 'x'; continue; }
    }
    if (stack.length) { if (c === '{') stack[stack.length - 1] += 1; else if (c === '}') stack[stack.length - 1] -= 1; }
    if (!/\s/.test(c)) prev = /[\w$)\].]/.test(c) ? 'x' : c;
    i += 1;
  }
  return out.join('');
}
const READ_CALL = /\b(?:readFileSync|readFile|readRetry|readJsonSync)\s*\(/;
const EMPTY_SRC = String.raw`(?:\{\s*\}|\[\s*\]|null|undefined|''|""|0|new\s+(?:Map|Set)\(\s*\)|\(?\{[^{}]*\}\)?|fallback|def|dflt|d)`;
const EMPTY = new RegExp(`^${EMPTY_SRC}$`);
const REFUSE = /\bthrow\b|ENOENT|\bcontinue\b|\bbreak\b|\bok\s*:\s*false|\bheld\b|\bHELD\b|\bstale\b|\bbad\s*:|\berror\s*:|\bunreadable\b|\bstate\s*:|\bwhy\s*:/;
const ACT = /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|atomicWrite|atomicText|writeAtomic|writeFlushed|writeJsonSync|writeJson|casWrite|choiceWrite|renameSync|renameRetry|rename|rmSync|rm|unlinkSync|unlink|copyFileSync|kvSet|setKV|trashItem)\s*\(/;
const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'function', 'return', 'else', 'try', 'do']);
function closeOf(m, open) { let depth = 0; for (let k = open; k < m.length; k++) { if (m[k] === '{') depth += 1; else if (m[k] === '}') { depth -= 1; if (!depth) return k; } } return m.length - 1; }
function openBefore(m, at) { let depth = 0; for (let k = at - 1; k >= 0; k--) { if (m[k] === '}') depth += 1; else if (m[k] === '{') { if (!depth) return k; depth -= 1; } } return -1; }
// the functions around index `at`, innermost first: [{ name (or ''), open, close }]
function functionsAround(m, at) {
  const out = [];
  for (let k = openBefore(m, at); k >= 0; k = openBefore(m, k)) {
    const head = m.slice(Math.max(0, k - 400), k).replace(/\s+$/, '');
    let name = null;
    let x = /function\s*\*?\s*([\w$]*)\s*\([^]*\)$/.exec(head.slice(-300));
    if (x && !/\)\s*\{/.test(head.slice(head.lastIndexOf('function')))) name = x[1] || '';
    else if (/=>$/.test(head)) { x = /([\w$]+)\s*(?:=|:)\s*(?:async\s*)?(?:\([^()]*\)|[\w$]+)\s*=>$/.exec(head); name = x ? x[1] : ''; } else {
      x = /(?:^|[\s,;{}])(?:async\s+|static\s+|get\s+|set\s+)?([\w$]+)\s*\(([^()]|\([^()]*\))*\)$/.exec(head);
      if (x && !KEYWORDS.has(x[1])) name = x[1];
    }
    if (name !== null) out.push({ name, open: k, close: closeOf(m, k) });
  }
  return out;
}
// the read sites in one file whose failure is taken as an empty default → [{ at, call }]
function emptySites(src, m, ms) {
  const sites = [];
  const callAt = (from, to) => { const s = m.slice(from, to); const r = READ_CALL.exec(s); if (!r) return null; const a = from + r.index; let depth = 0; let e = a + r[0].length - 1; for (; e < to; e++) { if (m[e] === '(') depth += 1; else if (m[e] === ')') { depth -= 1; if (!depth) break; } } return { at: a, call: src.slice(a, e + 1).replace(/\s+/g, ' ') }; };
  for (const c of m.matchAll(/\bcatch\s*(?:\(\s*([\w$]*)\s*\))?\s*\{/g)) {
    const open = c.index + c[0].length - 1; const close = closeOf(m, open);
    const body = ms.slice(open + 1, close).replace(/\/\*[^]*?\*\/|\/\/[^\n]*/g, '').trim();
    // the try block just before
    let e = c.index - 1; while (e >= 0 && /\s/.test(m[e])) e -= 1;
    if (m[e] !== '}') continue;
    const tOpen = openBefore(m, e); if (tOpen < 0 || !/\btry\s*$/.test(m.slice(Math.max(0, tOpen - 8), tOpen))) continue;
    const site = callAt(tOpen, e); if (!site) continue;
    if (REFUSE.test(body)) continue;
    const b = body.replace(/;$/, '').trim();
    let empty = false;
    const r = /^return\s+([^;]*)$/.exec(b); const a = /^([\w$.[\]]+)\s*=\s*([^;]*)$/.exec(b);
    if (r && EMPTY.test(r[1].trim())) empty = true;
    else if (a && EMPTY.test(a[2].trim())) empty = true;
    else if (!b) { // the default set before the try: `let x = {}; try { x = read(…) } catch {}`
      const v = new RegExp(String.raw`(?:^|[^\w$.])([\w$]+)\s*=[^=]`).exec(m.slice(tOpen + 1, e));
      if (v) { const before = m.slice(Math.max(0, m.lastIndexOf('try', tOpen) - 300), tOpen); empty = new RegExp(String.raw`\b${v[1].replace(/\$/g, '\\$')}\s*=\s*${EMPTY_SRC}\s*;?\s*$`).test(before.replace(/\btry\s*$/, '').trim()) || new RegExp(String.raw`\blet\s+${v[1].replace(/\$/g, '\\$')}\s*;?\s*$`).test(before.replace(/\btry\s*$/, '').trim()); }
    }
    if (empty) sites.push(site);
  }
  // read(…).catch(() => default)
  for (const c of m.matchAll(new RegExp(String.raw`\.catch\(\s*(?:\(\s*[\w$]*\s*\)|[\w$]+)\s*=>\s*(${EMPTY_SRC})\s*\)`, 'g'))) {
    const from = Math.max(0, m.lastIndexOf('\n', c.index - 1), m.lastIndexOf(';', c.index - 1));
    const site = callAt(from, c.index); if (site) sites.push(site);
  }
  return sites;
}
function emptyReads(src, file = '') {
  const m = mask(src); const ms = mask(src, true);
  const out = [];
  for (const s of emptySites(src, m, ms)) {
    const fns = functionsAround(m, s.at);
    const named = fns.find((x) => x.name) || null;
    const scope = named || fns[fns.length - 1] || { name: '', open: 0, close: m.length - 1 };
    let acted = ACT.test(m.slice(scope.open, scope.close + 1));
    if (!acted && named) { // its result handed to a write where it is called
      for (const u of m.matchAll(new RegExp(String.raw`\b${named.name.replace(/\$/g, '\\$')}\s*\(`, 'g'))) {
        if (u.index >= named.open - 300 && u.index <= named.open) continue; // its own name
        const ls = m.lastIndexOf('\n', u.index) + 1; let le = u.index; for (let k = 0; k < 3 && le >= 0; k++) le = m.indexOf('\n', le + 1);
        if (ACT.test(m.slice(ls, le < 0 ? m.length : le))) { acted = true; break; }
      }
    }
    if (acted) out.push({ file, kind: 'read', fn: named ? named.name : '(top)', call: s.call.slice(0, 120), line: src.slice(0, s.at).split('\n').length });
  }
  // one finding per function and read call
  const seen = new Set();
  return out.filter((x) => { const k = `${x.fn}|${x.call}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function scan() {
  const found = [];
  for (const f of files()) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const x of emptyReads(src, f)) found.push(x); // (round 104, emptyread104)
    if (f === 'datasafe.js' || f === 'datasafe-core.js' || f === 'scenesafe-core.js') continue;
    if (!usesGuard(src)) for (const n of storeFindings(src)) found.push({ file: f, kind: 'kv', store: n });
    // main-side: a parse of a file read with a fallback, and a file write, in the same module, no careful read
    const fallbackRead = /JSON\.parse\(\s*fs\.readFileSync\([^)]*\)\s*\)[^\n]*\}\s*catch\s*(\([^)]*\))?\s*\{\s*(return\s+[^;}]+|[\w.]+\s*=\s*[^;}]+)/.test(src) || /catch\s*(\([^)]*\))?\s*\{\s*return\s+(\{\}|\[\]|d|fallback|null)\s*;?\s*\}/.test(src) && /JSON\.parse\(\s*fs\.readFileSync/.test(src);
    if (fallbackRead && /writeFileSync\(|renameSync\(/.test(src) && !usesGuard(src)) found.push({ file: f, kind: 'main' });
  }
  return found;
}

const key = (x) => (x.kind === 'read' ? `${x.file}|read|${x.fn}|${x.call}` : `${x.file}|${x.kind}|${x.store || ''}`); // (round 104) a read site: by function and call
module.exports = { storeFindings, usesGuard, scan, emptyReads, mask };
if (require.main !== module) return;
const found = scan();
if (process.argv.includes('--baseline')) {
  const old = (() => { try { return JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch { return { audited: [] }; } })();
  const why = new Map((old.audited || []).map((x) => [key(x), x.why]));
  const audited = found.map(({ line, ...x }) => ({ ...x, why: why.get(key(x)) || (x.kind === 'read' ? 'TODO: audit (round 104, emptyread104)' : x.kind === 'kv' ? 'renderer kv store: the store guard merges a save built on a failed read with the disk (store.js / datasafe-core.js)' : 'reviewed: see docs/upgrades/datasafe.md') }));
  fs.writeFileSync(BASE, `${JSON.stringify({ note: 'Audited in round 43 (datasafe) and round 104 (emptyread104: kind "read", one per function and read call). New code: use DataSafe.load / DataSafe.save (renderer) or datasafe-core load (main); a read whose failure is not ENOENT throws or refuses, never "empty".', audited }, null, 1)}\n`);
  console.log(`baseline: ${audited.length} audited`);
  process.exit(0);
}
let base = { audited: [] };
try { base = JSON.parse(fs.readFileSync(BASE, 'utf8')); } catch { /* none: everything is new */ }
const known = new Set((base.audited || []).map(key));
const fresh = found.filter((x) => !known.has(key(x)));
const now = new Set(found.map(key));
const stale = (base.audited || []).filter((x) => !now.has(key(x))).map(key);
for (const x of fresh) console.log(`✖ ${x.file}${x.line ? `:${x.line}` : ''}: ${x.kind === 'read' ? `${x.fn}() takes a failed read of ${x.call} as empty and writes / acts on it: throw on anything but ENOENT (or refuse), or audit it in dev/datasafe-baseline.json` : x.kind === 'kv' ? `reads the store "${x.store}" with a fallback and saves it without DataSafe.load / DataSafe.save` : 'reads a file with a fallback and writes files without datasafe-core load / readRetry'}`);
console.log(JSON.stringify({ pass: !fresh.length, new: fresh, audited: known.size, found: found.length, stale }, null, 1));
process.exit(fresh.length ? 1 : 0);
