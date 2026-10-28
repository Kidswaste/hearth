#!/usr/bin/env node
// (round 77, storeack77) The rule of round 76's projects bug 7, checked in the code: a store this window (or the main
// process) holds in memory and reads again when the other computer's version arrives goes through StoreAck
// (storeack-core.js: its change written first, read again, then sync told — the ack). Without the ack, sync's write guard
// keeps merging every later save against the version from BEFORE the arrival: a thing taken out right after it arrived
// comes back. And the ack is only safe when every module writing that store is declared: one holding an older copy
// would then write it over what arrived.
// This scan reads every file Hearth ships and fails on:
//   A. a `hearth:synced` listener that reads a store again (kvGet / a refresh…FromDisk / reload… call) in a file that
//      declares nothing with StoreAck and calls no sync ack — unless the listener is marked `storeack: guard` (left to
//      sync's guard on purpose: never lost, a removal may come back) or listed in ALLOW with why
//   B. a store declared with StoreAck.hold('name') (so it gets acked) that another file writes (kvSet / setKV with that
//      name) without declaring it too — that file could hold an older copy (ALLOW with why when it reads fresh)
//   node dev/storeack-scan.js [--list]   (unit:storeack-scan) → "N files, M stores declared, 0 problem(s)" or FAIL lines
//   --list also prints the synced stores written somewhere that nobody declares (left to the guard: fine, never lost)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SKIP = new Set(['dev', 'docs', 'data', 'electron', 'electron-mac', 'node_modules', '.git', '.claude', 'mac', 'assets', 'tools/basisu', 'lib', 'integrations', 'plugins']);
// [file, a piece of the listener / the write, why it's fine]
const ALLOW = [
  ['tools/three-recipes.js', 'cache = null', 'recipes are files read fresh on each use: the listener only forgets a list of names (nothing written back)'],
  ['chat-reach.js', 'arrivals()', 'reads chats that arrived to open a waiting link: no store held or written'],
  ['credits.js', "hearth:synced", 'the creative-direction session\'s file (not touched here): its credit log merges on save (round 77 audit: left to sync\'s guard)'],
  ['projects.js', "forget('sketches'", 'Projects forgets its read-only caches of OTHER stores (scenes, boards, workspace): read again when shown, never written'],
  ['projbundle.js', 'kvSet(key, b.workbench)', 'an imported project\'s worktable, written only when none is there (was?.state === \'missing\')'],
];

function files(dir = ROOT, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = `${rel}${e.name}`;
    if (e.isDirectory()) { if (!SKIP.has(e.name) && !SKIP.has(r)) out.push(...files(path.join(dir, e.name), `${r}/`)); } else if (/\.(?:m?js|cjs)$/.test(e.name)) out.push(r);
  }
  return out;
}
const allowed = (file, text) => ALLOW.some(([f, piece]) => f === file && text.includes(piece));
// a name as the code writes it: 'x' / "x" / `x`, or a constant set to one in this file or its -core.js
function nameOf(arg, src, file) {
  const a = String(arg || '').trim();
  const lit = /^(['"`])([\w.-]+)\1$/.exec(a);
  if (lit) return lit[2];
  const id = /^(?:[\w$]+\.)?([A-Z][\w$]*)$/.exec(a);
  if (!id) return null;
  const re = new RegExp(`\\b${id[1]}\\s*[:=]\\s*(['"])([\\w.-]+)\\1`);
  const m = re.exec(src);
  if (m) return m[2];
  for (const core of [file.replace(/\.js$/, '-core.js'), file.replace(/main\.js$/, '-core.js')]) {
    try { const c = re.exec(fs.readFileSync(path.join(ROOT, core), 'utf8')); if (c) return c[2]; } catch { /* no core */ }
  }
  return null;
}
// the text of a listener: from its line until its parentheses close (a few lines at most)
function block(src, at) {
  let depth = 0; let i = src.indexOf('(', at); const start = i;
  for (; i < src.length && i < start + 4000; i++) { const c = src[i]; if (c === '(') depth += 1; else if (c === ')') { depth -= 1; if (!depth) break; } }
  return src.slice(start, i + 1);
}
const lineOf = (src, at) => src.slice(0, at).split('\n').length;

function scan(only = null) {
  const list = only || files();
  const problems = []; const declared = new Map(); const writes = []; // declared: name → Set(files) · writes: { name, file, line, text }
  const declares = new Map(); // file → { names: Set, any: bool }
  const texts = new Map();
  for (const file of list) {
    let src; try { src = only ? only.src?.[file] ?? fs.readFileSync(path.join(ROOT, file), 'utf8') : fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { continue; }
    texts.set(file, src);
    const d = { names: new Set(), any: /\bStoreAck\b[\s\S]{0,40}\.hold\(|storeack-core'\)\.main\.hold\(|\.sync\??\.ack\??\.?\(|ackPulled\(/.test(src) };
    for (const m of src.matchAll(/\.hold\(\s*([^,)]+)\s*,/g)) {
      if (!/StoreAck|SA\b|main$/.test(src.slice(Math.max(0, m.index - 40), m.index))) continue;
      const n = nameOf(m[1], src, file);
      if (n) { d.names.add(n); if (!declared.has(n)) declared.set(n, new Set()); declared.get(n).add(file); }
    }
    // names held through a helper (a loop, a small wrapper): written out in a comment "storeack: holds a, b"
    for (const m of src.matchAll(/storeack: holds ([\w., -]+)/g)) for (const n of m[1].split(/[,\s]+/).filter((x) => /^[\w.-]+$/.test(x))) { d.names.add(n); if (!declared.has(n)) declared.set(n, new Set()); declared.get(n).add(file); }
    declares.set(file, d);
    for (const m of src.matchAll(/\b(?:kvSet|setKV)\(\s*([^,)]+)\s*,/g)) {
      const n = nameOf(m[1], src, file);
      if (n) writes.push({ name: n, file, line: lineOf(src, m.index), text: src.slice(m.index, src.indexOf('\n', m.index)) });
    }
    // A. listeners that read again without StoreAck
    for (const m of src.matchAll(/addEventListener\(\s*['"]hearth:synced['"]/g)) {
      const b = block(src, m.index);
      const before = src.slice(Math.max(0, src.lastIndexOf('\n', m.index - 1) - 400), m.index);
      if (/storeack: guard/.test(before) || /storeack: guard/.test(b)) continue;
      const rereads = /\bkvGet\(|FromDisk\(|\breload\w*\(|\brefresh\w*\(/.test(b);
      if (!rereads) continue;
      if (d.any) continue;
      if (allowed(file, b) || allowed(file, 'hearth:synced')) continue;
      problems.push(`${file}:${lineOf(src, m.index)} reads a store again when sync brings it, without StoreAck (write first, read again, ack) — or mark it "storeack: guard" with why`);
    }
  }
  // B. a declared (acked) store written by a file that doesn't declare it
  for (const w of writes) {
    const by = declared.get(w.name);
    if (!by || by.has(w.file) || declares.get(w.file)?.names.has(w.name)) continue;
    if (allowed(w.file, w.text)) continue;
    problems.push(`${w.file}:${w.line} writes '${w.name}', which ${[...by].join(', ')} acks when it arrives, without declaring it (StoreAck.hold): an older copy here would be written over what arrived`);
  }
  const undeclared = [...new Set(writes.map((w) => w.name))].filter((n) => !declared.has(n)).sort();
  return { files: list.length, problems, declared, undeclared };
}

if (require.main === module) {
  const r = scan();
  // the scan itself catches each kind (a quick self-test on made-up files)
  const self = [];
  const probe = (src) => { const only = ['x.js']; only.src = { 'x.js': src }; return scan(only).problems.length; };
  const probe2 = (a, b) => { const only = ['a.js', 'b.js']; only.src = { 'a.js': a, 'b.js': b }; return scan(only).problems.length; };
  if (!probe("addEventListener('hearth:synced', (e) => { if (x) refreshFromDisk(); });")) self.push('self-test: a listener reading again without StoreAck was not caught');
  if (!probe("addEventListener('hearth:synced', () => { window.hub.kvGet('notes', []).then(f); });")) self.push('self-test: a kvGet in a listener was not caught');
  if (probe("// storeack: guard (pictures only)\naddEventListener('hearth:synced', () => { reloadThumbs(); });")) self.push('self-test: a listener marked storeack: guard was flagged');
  if (probe("window.StoreAck?.hold('notes', { read: () => 1 });\naddEventListener('hearth:synced', () => { refreshX(); });")) self.push('self-test: a file declaring StoreAck was flagged');
  if (probe("addEventListener('hearth:synced', () => { paint(); });")) self.push('self-test: a listener that only repaints was flagged');
  if (!probe2("const KEY = 'notes'; window.StoreAck?.hold(KEY, { read: () => 1 });", "hub.kvSet('notes', list);")) self.push('self-test: an undeclared writer of an acked store was not caught');
  if (probe2("window.StoreAck?.hold('notes', {});", "window.StoreAck?.hold('notes', {}); hub.kvSet('notes', list);")) self.push('self-test: a declared second writer was flagged');
  if (process.argv.includes('--list')) {
    console.log(`declared (acked on arrival): ${[...r.declared].map(([n, f]) => `${n} (${[...f].join(', ')})`).join(' · ')}`);
    console.log(`written, not declared (left to sync's guard: never lost, a removal may come back): ${r.undeclared.join(', ')}`);
  }
  const all = [...self, ...r.problems];
  for (const p of all) console.log(`FAIL ${p}`);
  console.log(`${r.files} files, ${r.declared.size} stores declared, ${all.length} problem(s)`);
  process.exit(all.length ? 1 : 0);
}
module.exports = { scan };
