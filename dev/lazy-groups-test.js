#!/usr/bin/env node
// Lazy groups stay whole through merges (round 54, fixes54). A merge in round 53 silently dropped
// 'tools/gametex-core.js' / 'GameTexCore' from the 'gameready' group in lazy-data.js: the file was still there and
// tools/gameready.js still used GameTexCore, but nothing loaded it any more, so Optimize for play broke on first use.
// Plain Node, reads source text only (≈ 1 s), part of `unit` (and of `unit:boot-test` runs through boot-test.js):
//   1. every group's files exist, and each renderer file is loaded by exactly one place (one group, or index.html)
//   2. every global a group lists is defined at the top level of one of that group's own files
//   3. a top-level module global (`const X = (() => …`, `class X`, `const X = {`) defined by a renderer file and used by
//      a lazy group's file is defined by a file that is loaded: in a lazy group or in index.html
//   4. a group's own module globals are listed in its `globals` (else touching one before the group loads doesn't
//      load it) — reported as a warning list, not a failure, for older groups that never listed a helper
//   node dev/lazy-groups-test.js            (exits 1 with the problems listed)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function run() {
  const errors = [];
  const warnings = [];
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const LazyData = new Function(`${read('lazy-data.js')}; return LazyData;`)(); // eslint-disable-line no-new-func
  const html = read('index.html');
  const eager = [...new Set([...html.matchAll(/<script[^>]*\ssrc="([^"#?]+)/g)].map((m) => m[1]))]; // (lazy-at.js is one file tagged per group)

  // ---- 1. files exist, one loader each ----
  const loader = new Map(); // file → [where]
  const add = (f, where) => loader.set(f, [...(loader.get(f) || []), where]);
  for (const f of eager) add(f, 'index.html');
  for (const g of LazyData.GROUPS) for (const f of g.files) add(f, `group ${g.name}`);
  for (const g of LazyData.GROUPS) for (const f of g.files) if (!fs.existsSync(path.join(ROOT, f))) errors.push(`${g.name}: ${f} is listed but missing`);

  // top-level definitions of a source file (column 0 only, so nested names don't count)
  const defsOf = (src) => {
    const all = new Set();
    const modules = new Set();
    // (round 55, fixes55) a file whose code is one unindented `(() => { … })();` defines no globals by its column-0
    // consts (tools/three-frames-templates.js's OUT): only its window.X = … count
    let code = src; // (leading comments off, step by step: no backtracking regex)
    for (;;) { const t = code.trimStart(); if (t.startsWith('//')) code = t.slice(t.indexOf('\n') + 1 || t.length); else if (t.startsWith('/*')) code = t.slice((t.indexOf('*/') + 2) || t.length); else { code = t; break; } }
    const wrapped = /^[;!]?\((?:async\s*)?(?:\(\)\s*=>|function\b)/.test(code)
      &&(src.match(/^\}\)\(\);?[ \t]*$/gm) || []).length === 1 && /\n\}\)\(\);?\s*$/.test(src);
    if (!wrapped) for (const m of src.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(.)/gm)) {
      all.add(m[1]);
      if (/^[A-Z]/.test(m[1]) && /[({]/.test(m[2])) modules.add(m[1]);
    }
    if (!wrapped) for (const m of src.matchAll(/^(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) { all.add(m[1]); if (/^[A-Z]/.test(m[1])) modules.add(m[1]); }
    // window.X = … / UMD wrappers: `root.X = factory()` (the 'root' being window / self)
    for (const m of src.matchAll(/(?<![\w$.])(?:window|globalThis|self|root)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) { all.add(m[1]); if (/^[A-Z]/.test(m[1])) modules.add(m[1]); }
    return { all, modules };
  };
  // the renderer's own scripts (main-process modules, workers, the sandbox / remote / OBS pages and dev tools aside)
  const SKIP_DIRS = new Set(['dev', 'mcp', 'mac', 'node_modules', 'data', 'docs', 'electron', 'assets', '.git', '.claude']);
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(rel); continue; }
      if (e.name.endsWith('.js') && !/(-page|preload)\.js$/.test(e.name)) files.push(rel); // (game-window page scripts and preloads run in their own page)
    }
  };
  walk('');
  const src = new Map(files.map((f) => [f, read(f)]));
  const mainSide = (s) => /require\(\s*['"]electron['"]\s*\)/.test(s) || (/^(?:const|let|var)\s+\w+\s*=\s*require\(/m.test(s) && !/typeof\s+window/.test(s));
  const definedBy = new Map(); // module global → [renderer files]
  for (const [f, s] of src) {
    if (mainSide(s)) continue;
    for (const n of defsOf(s).modules) definedBy.set(n, [...(definedBy.get(n) || []), f]);
  }

  // scripts a renderer file adds itself on first use (appui.js: settings-find.js the first time Settings opens)
  const ADDED = /(?:\bsrc\s*[:=]\s*|\.src\s*=\s*)['"`]([\w./-]+\.js)['"`]/g;
  for (const [f, s] of src) if (loader.has(f)) for (const m of s.matchAll(ADDED)) if (!loader.has(m[1]) && src.has(m[1])) add(m[1], `added by ${f}`);
  for (const [f, where] of loader) if (where.length > 1) errors.push(`${f} is loaded ${where.length}×: ${where.join(', ')} (keep one)`);

  // ---- 2. every listed global is defined by the group's own files ----
  for (const g of LazyData.GROUPS) {
    const own = new Set();
    for (const f of g.files) if (src.has(f)) for (const n of defsOf(src.get(f)).all) own.add(n);
    for (const n of g.globals || []) {
      if (own.has(n)) continue;
      const elsewhere = (definedBy.get(n) || []).join(', ');
      errors.push(`${g.name}: lists ${n} but none of its files defines it${elsewhere ? ` (defined in ${elsewhere}: add that file to the group)` : ''}`);
    }
    // ---- 4. its module globals are listed ----
    const listed = new Set(g.globals || []);
    for (const f of g.files) if (src.has(f)) for (const n of defsOf(src.get(f)).modules) if (!listed.has(n)) warnings.push(`${g.name}: ${f} defines ${n}, not in its globals`);
  }

  // ---- 3. module globals used by lazy files are defined by a loaded file ----
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1').replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, '""');
  const names = [...definedBy.keys()];
  const nameRe = new RegExp(`(?<![\\w$.])(${names.map((n) => n.replace(/\$/g, '\\$')).join('|')})(?![\\w$])`, 'g');
  for (const g of LazyData.GROUPS) {
    for (const f of g.files) {
      if (!src.has(f)) continue;
      const own = defsOf(src.get(f)).all;
      const used = new Set([...strip(src.get(f)).matchAll(nameRe)].map((m) => m[1]).filter((n) => !own.has(n)));
      for (const n of used) {
        const defs = definedBy.get(n) || [];
        if (!defs.length || defs.some((d) => loader.has(d))) continue;
        errors.push(`${g.name}: ${f} uses ${n}, defined in ${defs.join(', ')}, which nothing loads (add it to a lazy group in lazy-data.js or to index.html)`);
      }
    }
  }
  return { errors, warnings, groups: LazyData.GROUPS.length, files: loader.size };
}

module.exports = { run };

if (require.main === module) {
  const r = run();
  if (process.argv.includes('--warnings')) for (const w of r.warnings) console.log(`  · ${w}`);
  for (const e of r.errors) console.log(`✗ ${e}`);
  console.log(r.errors.length ? `lazy-groups-test: ${r.errors.length} problem(s)` : `✓ lazy groups whole: ${r.groups} groups, ${r.files} loaded files, every listed global defined in its group, every used module loaded (${r.warnings.length} unlisted helper globals: --warnings)`);
  process.exit(r.errors.length ? 1 : 0);
}
