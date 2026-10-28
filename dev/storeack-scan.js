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
//   C. (round 78, guardloss78) a synced store written somewhere that nobody declares and GUARDED doesn't explain: each
//      store is declared, or its line in GUARDED says why the guard alone is fine (this computer's own stores never arrive)
//   node dev/storeack-scan.js [--list]   (unit:storeack-scan) → "N files, M stores declared, 0 problem(s)" or FAIL lines
//   --list also prints what's declared, the stores left to the guard (with why) and this computer's own
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
  ['tools/three-frames.js', "kvSet('video-cuts', all)", '(round 78) only when CutStore isn\'t loaded: read fresh right before, nothing held'],
];
// (round 78, guardloss78) synced stores written somewhere and declared by nobody, each with why sync's write guard alone is
// fine (it merges a save with what arrived: never lost; without an ack a removal right after an arrival may come back)
const FRESH = 'read fresh right before every change, nothing held: no older copy to write';
const GROWS = 'a log / history that only grows (trimmed by age or count): an old entry trimmed may come back once — harmless';
const PICS = 'pictures / versions (megabytes): re-reading them on every arrival would cost frames (storeack77 audit); never lost';
const GUARDED = {
  'access-log': GROWS, aiundo: GROWS, 'error-log': GROWS, 'tool-use': GROWS, makes: GROWS, 'deploy-history': GROWS, 'media-ids': GROWS, renders: `${GROWS} (renders.js; projects.js forgets its read-only copy on arrival)`,
  'astra-scoreboard': `${FRESH} (astra.js)`, 'board-palettes': `${FRESH} (board-links.js)`, 'board-templates': `${FRESH} (board-links.js)`, 'capture-marks': `${FRESH} (capture.js, capture-view.js)`,
  'forge-patch-sets': `${FRESH} (tools/forge-game.js)`, 'forge-snapshots': `${FRESH} (tools/forge-game.js)`, 'three-footage': `${FRESH} (tools/three-frames.js)`, 'present-bakes': `${FRESH} (tools/three-ready.js reads with status; diskcalmmain.js)`,
  'projects-frontpage': `${FRESH}: the front page's editor writes it whole, the page reads it when shown`,
  'chat-scene-thumbs': PICS, 'lab-gallery-thumbs': PICS, 'three-thumbs': PICS, 'three-history': PICS,
  'apps-habits': 'which apps were opened / dismissed (the Discover chip): a dismissal may come back once — harmless',
  discover: 'what Discover has shown / dismissed: a dismissal may come back once — harmless',
  'inspo-drop': 'a cache of fetched inspiration pictures (board-drop.js): rebuilt when needed',
  'send-preview': 'Send preview\'s learned sizes (a small cache, DataSafe-loaded)',
  'router-learn': 'Smart\'s learned numbers: merged field by field by the guard; a number is never "removed"',
  'cost-coach': 'the cost coach\'s small counters (read with status, merged by the guard)',
  'local-answers': 'misses of local answers (a short list, capped): harmless if one comes back',
  'usage-limits': 'usage readings (the newest wins by time in the guard\'s merge)',
  'director-tasks': 'the director\'s task records: a finished task taken out may come back once — rare, harmless',
  'memory-meta': 'small facts about memory lines (when added, from where): saved whole, rarely removed',
  'astra-personas': 'your custom Astra personas: read at start, saved whole when you add one; one deleted may come back — rare, never lost',
  'capture-tours': 'your capture tours: read once, saved whole; one deleted may come back — rare, never lost',
  'lab-grade-luts': 'imported LUT names (their data in lab-grade-lut-<name> stores): imported rarely; never lost',
  'meshy-library': 'Meshy generations: items are updated in place while a generation runs (re-reading mid-task would drop that); only grows',
  assets: 'the asset library index (assets.js, several main-side writers): a removal may come back; never lost',
  'forge-patches': 'Forge Debug patches (tools/forge-game.js): saved whole; one deleted may come back — rare',
  'quest-journal': 'Codex\'s journal (tools/quest-journal.js mutate(), questhud / showprep / showsync read with status): not changed here (For Codex)',
  'quest-journal-before-restore': 'Codex\'s journal backup: written once before a restore, never read back into memory',
  'sidequest-outings-v1': 'Codex\'s outing notebook (tools/outing-desk.js): not changed here (For Codex)',
  'creative-playground': 'Codex\'s creative playground notebook: not changed here (For Codex)',
  'credit-log': 'the creative-direction session\'s file (credits.js): it merges on save; not touched here',
};
const Sm = require('../sync-merge'); // (round 78) this computer's own stores (data/kv that never syncs)

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
    const d = { names: new Set(), any: /\bStoreAck\b[\s\S]{0,40}\.hold\(|storeackmain'\)\.hold\(|\.sync\??\.ack\??\.?\(|ackPulled\(/.test(src) };
    for (const m of src.matchAll(/\.hold\(\s*([^,)]+)\s*,/g)) {
      if (!/StoreAck|SA\b|storeackmain'\)$/.test(src.slice(Math.max(0, m.index - 40), m.index))) continue;
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
  const written = [...new Set(writes.map((w) => w.name))].filter((n) => !declared.has(n)).sort();
  // (round 78, guardloss78) C. each is declared, this computer's own (never arrives), or explained in GUARDED
  const own = written.filter((n) => Sm.localOnly(`kv/${n}.json`));
  const guarded = written.filter((n) => !own.includes(n) && GUARDED[n]);
  const undeclared = written.filter((n) => !own.includes(n) && !GUARDED[n]);
  if (!only || only.checkC) for (const n of undeclared) problems.push(`'${n}' is written (${writes.filter((w) => w.name === n).map((w) => `${w.file}:${w.line}`).slice(0, 3).join(', ')}) and synced, but nobody declares it with StoreAck.hold: declare it, or add its line to GUARDED with why the guard alone is fine`);
  return { files: list.length, problems, declared, undeclared, guarded, own };
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
  { const only = ['c.js']; only.src = { 'c.js': "hub.kvSet('brand-new-store', x); hub.kvSet('error-log', y); hub.kvSet('jank-log', z);" }; only.checkC = true; const c = scan(only); if (c.problems.length !== 1 || !/brand-new-store/.test(c.problems[0])) self.push('self-test: (round 78) a synced store nobody declares or explains was not caught (or a GUARDED / own one was)'); }
  if (process.argv.includes('--list')) {
    console.log(`declared (acked on arrival): ${[...r.declared].map(([n, f]) => `${n} (${[...f].join(', ')})`).join(' · ')}`);
    console.log(`left to sync's guard on purpose (never lost; why, per store, in GUARDED): ${r.guarded.join(', ')}`);
    console.log(`this computer's own (never synced, nothing arrives): ${r.own.join(', ')}`);
    console.log(`written, not declared, not explained: ${r.undeclared.length ? r.undeclared.join(', ') : '(none)'}`);
  }
  const all = [...self, ...r.problems];
  for (const p of all) console.log(`FAIL ${p}`);
  console.log(`${r.files} files, ${r.declared.size} stores declared, ${all.length} problem(s)`);
  process.exit(all.length ? 1 : 0);
}
module.exports = { scan };
