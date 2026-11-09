#!/usr/bin/env node
// Dead CSS finder (round 159, css159). A style rule is reported dead only when BOTH:
//  1. static: no code can produce one of its required class / id / data-attribute names (every selector of its list):
//     the names are looked up in every app file that isn't CSS (JS, HTML, JSON; dev/ and docs/ left out), as whole
//     words, and against the prefixes / suffixes code builds names from (`ly-${x}`, 'is-' + s, s + '-on'), so a
//     family built in JS keeps all its members; names inside :not() / :is() / :where() / :has() aren't required;
//  2. the tour never matched it: rule usage from one or more `node dev/smoke.js --coverage <file>` runs (CDP
//     CSS.startRuleUsageTracking), a rule used in any run is alive. A sheet no run loaded counts as unmatched.
// Also lists @keyframes no animation names (CSS or JS) and selectors that are dead inside a list whose rule lives.
//   node dev/css159-dead.js [--cov a.json --cov b.json] [--file look.css] [--json out.json] [--apply]
// --apply deletes the dead rules (and the comment heading a run of rules that are all dead) from the files in scope:
// files of other streams (tools/three-*, Codex's, Swarm / missions, credits) are only reported.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opts = (n) => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []));
const opt = (n) => opts(n)[0] || null;
const APPLY = args.includes('--apply');

// ---------- files ----------
const tracked = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const cssFiles = tracked.filter((f) => f.endsWith('.css') && !/^(dev|docs)\//.test(f));
const codeFiles = tracked.filter((f) => /\.(js|html|json|mjs)$/.test(f) && !/^(dev|docs)\//.test(f) && !/package-lock/.test(f));
const OTHERS = /^(tools\/three-|three-direction|credits|collab-eyes|missions|manager|swarm|astra|codex-|projects|project-workspace|sync-engine|cloud-files|workbench-|tools\/workbench|engine-watch|visual-feedback)/;
const CODEX = /^(astra|codex-|projects|project-workspace|sync-engine|cloud-files|workbench-|tools\/workbench|engine-watch|visual-feedback)/;
const inScope = (f) => !OTHERS.test(f.replace(/^tools\/(?!three-|workbench)/, ''));

// ---------- the corpus: words, prefixes, suffixes ----------
const words = new Set(); const props = new Set(); const prefixes = new Set(); const suffixes = new Set(); let raw = '';
for (const f of codeFiles) {
  let t; try { t = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
  if (f.endsWith('.js')) t = t.replace(/^[ \t]*\/\/[^\n]*$/gm, '').replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, ''); // notes for people don't produce classes
  raw += `\n${t}`;
  // a class / id comes from a string (JS strings and templates, HTML, JSON) or an object key / property name (a
  // state map's keys, `el.dataset.x`); a bare identifier elsewhere (a variable, a function) can't name a class
  const stringy = t; // (the whole text: pairing quotes by pattern misreads templates with quotes inside; a hyphenated name only occurs in strings anyway, a plain word also as an identifier: kept, to be safe)
  // ('.name' / '#name' in a string is a selector: a querySelector or a style written by JS, which finds a name but
  // never puts one on an element, so it doesn't count; class="name", classList.add('name'), { cls: 'name' } do)
  for (const m of stringy.matchAll(/(^|[^.#\w-])([A-Za-z_][\w-]*)/g)) words.add(m[2]);
  if (f.endsWith('.js')) { for (const m of t.matchAll(/([A-Za-z_$][\w$]*)\s*:(?!:)/g)) words.add(m[1]); for (const m of t.matchAll(/\.([A-Za-z_$][\w$]*)/g)) props.add(m[1]); }
  // a name built from a fixed part and a value: `ly-${x}`, 'ly-' + x, x + '-on', `${x}-on`
  for (const m of t.matchAll(/([A-Za-z_][\w-]*)\$\{/g)) prefixes.add(m[1]);
  for (const m of t.matchAll(/['"`]([A-Za-z_][\w-]*)['"`]\s*\+/g)) prefixes.add(m[1]);
  for (const m of t.matchAll(/\}([\w-]*[A-Za-z][\w-]*)/g)) if (m[1].length >= 2) suffixes.add(m[1]);
  for (const m of t.matchAll(/\+\s*['"`]([\w-]*[A-Za-z][\w-]*)['"`]/g)) if (m[1].length >= 2) suffixes.add(m[1]);
}
const pre = [...prefixes].filter((p) => p.length >= 2); const suf = [...suffixes].filter((s) => /^[-_]/.test(s) && s.length >= 3);
const THIRD = /^(lil-|hljs|katex|cm-|xterm|monaco|mermaid|CodeMirror)/; // made by libraries loaded at run time
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const nameLives = (n) => words.has(n) || THIRD.test(n) || pre.some((p) => n.startsWith(p) && n.length > p.length) || suf.some((s) => n.endsWith(s) && n.length > s.length);
const attrLives = (a, v) => {
  if (!(words.has(a) || (a.startsWith('data-') && (words.has(camel(a.slice(5))) || props.has(camel(a.slice(5))))) || raw.includes(a))) return false;
  if (v == null) return true;
  if (a.startsWith('aria-') || /^(type|role|dir|lang|href|src|target|name|rel|open|disabled|hidden|contenteditable|draggable|tabindex)$/.test(a)) return true; // set by markup / the browser
  return raw.includes(v) || pre.some((p) => v.startsWith(p));
};
// the names a selector needs (outside :not / :is / :where / :has / ::part …): null when one of them can't be produced
function strip(sel) { // drop functional pseudo-classes' arguments (balanced)
  let out = ''; let i = 0;
  while (i < sel.length) {
    const m = /^:{1,2}(not|is|where|has|-webkit-any|matches|host|host-context|part|slotted|nth-child|nth-last-child)\(/.exec(sel.slice(i));
    if (m) { let d = 0; let j = i + m[0].length - 1; for (; j < sel.length; j++) { if (sel[j] === '(') d++; else if (sel[j] === ')' && --d === 0) break; } i = j + 1; continue; }
    out += sel[i++];
  }
  return out;
}
function selectorDead(sel) { // returns the missing name, or null when the selector could match
  const s = strip(sel.replace(/"[^"]*"|'[^']*'/g, (q) => q.replace(/[.#]/g, '_')));
  for (const m of s.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) if (!nameLives(m[1])) return `.${m[1]}`;
  for (const m of s.matchAll(/#(-?[A-Za-z_][\w-]*)/g)) if (!nameLives(m[1])) return `#${m[1]}`;
  for (const m of sel.replace(/:not\([^)]*\)/g, '').matchAll(/\[\s*([\w-]+)\s*(?:[~|^$*]?=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*(?:i\s*)?\]/g)) {
    const v = m[2] ?? m[3] ?? m[4];
    if (!attrLives(m[1], v == null || v === '' ? null : v)) return `[${m[1]}${v ? `=${v}` : ''}]`;
  }
  return null;
}
const splitList = (p) => { const out = []; let d = 0; let cur = ''; for (const c of p) { if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; if (c === ',' && !d) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map((x) => x.trim()).filter(Boolean); };

// ---------- parser: style rules, comments, at-rules (with their byte ranges) ----------
function parse(text) {
  const nodes = []; // { kind: 'rule'|'comment'|'at'|'group', start, end, prelude, parent, depth }
  const stack = [{ kind: 'root', children: [] }]; let start = null; let q = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2); const end = e < 0 ? text.length : e + 2;
      const top = stack[stack.length - 1];
      if (start == null && (top.kind === 'root' || top.kind === 'group')) { const n = { kind: 'comment', start: i, end }; nodes.push(n); top.children.push(n); }
      i = end - 1; continue;
    }
    if (c === '"' || c === "'") { q = c; if (start == null) start = i; continue; }
    if (start == null && !/\s/.test(c) && c !== '}' && c !== ';') start = i;
    if (c === '{') {
      const prelude = text.slice(start ?? i, i).trim();
      const kind = /^@(media|supports|layer|container|document)/.test(prelude) ? 'group' : prelude.startsWith('@') ? 'at' : 'rule';
      const n = { kind, start: start ?? i, prelude, children: [], parent: stack[stack.length - 1] };
      stack[stack.length - 1].children.push(n); nodes.push(n); stack.push(n); start = null;
      if (kind === 'at' || kind === 'rule') { // skip the body (declarations; nested braces in keyframes)
        let d = 1; let qq = null; let j = i + 1;
        for (; j < text.length; j++) { const ch = text[j]; if (qq) { if (ch === '\\') { j++; continue; } if (ch === qq) qq = null; continue; } if (ch === '"' || ch === "'") qq = ch; else if (ch === '/' && text[j + 1] === '*') { j = text.indexOf('*/', j + 2) + 1; } else if (ch === '{') d++; else if (ch === '}' && --d === 0) break; }
        n.end = j + 1; n.body = text.slice(i + 1, j); stack.pop(); i = j;
      }
    } else if (c === '}') { const n = stack.pop(); n.end = i + 1; start = null; } else if (c === ';' && start != null && stack[stack.length - 1].kind !== 'rule') {
      const n = { kind: 'stmt', start, end: i + 1, prelude: text.slice(start, i) }; stack[stack.length - 1].children.push(n); nodes.push(n); start = null;
    }
  }
  return { root: stack[0], nodes };
}

// ---------- coverage (any run) ----------
const used = new Map(); // file → Set of rule start offsets matched in some run; files any run loaded
const relUrl = (url) => { const p = decodeURIComponent(url.replace(/^file:\/\//, '').split(/[?#]/)[0]); const m = p.match(/hearth-smoke-[^/]+\/(.+)$/); return m ? m[1] : p; };
for (const c of opts('--cov')) {
  const cov = JSON.parse(fs.readFileSync(c, 'utf8'));
  for (const sh of cov.css) {
    const f = relUrl(sh.url); const set = used.get(f) || new Set(); used.set(f, set);
    const { nodes } = parse(sh.text); const rules = nodes.filter((n) => n.kind === 'rule');
    for (const [a, , u] of sh.rules) if (u) { const r = rules.find((n) => a >= n.start && a < n.end); if (r) set.add(sh.text.slice(r.start, r.end)); }
  }
}
const haveCov = opts('--cov').length > 0;

// ---------- keyframes in use ----------
const allCss = cssFiles.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const animWords = new Set();
for (const m of allCss.matchAll(/animation(?:-name)?\s*:([^;}]*)/g)) for (const w of m[1].matchAll(/[A-Za-z_][\w-]*/g)) animWords.add(w[0]);

// ---------- --movable: eager rules only one lazy group's code can make match ----------
// For each rule of the first screen's sheets: a name every selector needs that only files of one lazy group produce
// (as above: in a string, not as '.name'). Such a rule can't match before that group has run, so it can live in the
// group's own stylesheet (put where the eager sheet was: lazy-data.js cssBefore).
if (args.includes('--movable')) {
  const LazyData = new Function(`${fs.readFileSync(path.join(ROOT, 'lazy-data.js'), 'utf8')}; return LazyData;`)(); // eslint-disable-line no-new-func
  const groupOf = new Map(); for (const g of LazyData.GROUPS) for (const f of g.files) groupOf.set(f, g.name);
  const prod = new Map(); const filePre = new Map();
  for (const f of codeFiles) {
    let t; try { t = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { continue; }
    if (f.endsWith('.js')) t = t.replace(/^[ \t]*\/\/[^\n]*$/gm, '').replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '');
    const stringy = t;
    const add = (w) => { let s = prod.get(w); if (!s) prod.set(w, s = new Set()); s.add(f); };
    for (const m of stringy.matchAll(/(^|[^.#\w-])([A-Za-z_][\w-]*)/g)) add(m[2]);
    if (f.endsWith('.js')) for (const m of t.matchAll(/([A-Za-z_$][\w$]*)\s*:(?!:)/g)) add(m[1]);
    filePre.set(f, [...new Set([...t.matchAll(/([A-Za-z_][\w-]*)\$\{/g), ...t.matchAll(/['"`]([A-Za-z_][\w-]*)['"`]\s*\+/g)].map((m) => m[1]).filter((p) => p.length >= 2))]);
  }
  const producers = (n) => { const s = new Set(prod.get(n) || []); for (const [f, ps] of filePre) if (ps.some((p) => n.startsWith(p) && n.length > p.length)) s.add(f); return s; };
  const memo = new Map();
  const ownerOf = (n) => { if (memo.has(n)) return memo.get(n); const fs_ = [...producers(n)]; const gs = new Set(fs_.map((f) => groupOf.get(f) || '#eager')); const g = fs_.length && gs.size === 1 && !gs.has('#eager') ? [...gs][0] : null; memo.set(n, g); return g; };
  if (opt('--owner')) { for (const n of opt('--owner').split(',')) console.log(n, '→', ownerOf(n), [...producers(n)].join(' ')); process.exit(0); }
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  // specificity [ids, classes, types] (:is / :not / :has count their most specific argument, :where nothing)
  const spec = (sel) => {
    let a = 0; let b = 0; let c = 0; let s = sel.replace(/"[^"]*"|'[^']*'/g, '""');
    s = s.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
    s = s.replace(/:(is|not|has|-webkit-any|matches)\(((?:[^()]|\([^()]*\))*)\)/g, (_, k, inner) => { const best = splitList(inner).map(spec).sort((x, y) => y[0] - x[0] || y[1] - x[1] || y[2] - x[2])[0] || [0, 0, 0]; a += best[0]; b += best[1]; c += best[2]; return ''; });
    s = s.replace(/::?(before|after|first-line|first-letter|placeholder|selection|marker|backdrop|-webkit-[\w-]+|part\([^)]*\))/g, () => { c++; return ''; });
    a += (s.match(/#[\w-]+/g) || []).length;
    b += (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+(\([^)]*\))?/g) || []).length;
    c += (s.replace(/\[[^\]]*\]|[.#:][\w-]+(\([^)]*\))?/g, ' ').match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g) || []).length;
    return [a, b, c];
  };
  const props = (body) => new Set((body || '').replace(/\/\*[\s\S]*?\*\//g, '').split(';').map((d) => d.split(':')[0].trim().toLowerCase()).filter(Boolean));
  const FAM = (p) => (/^(top|left|right|bottom|inset)\b/.test(p) ? 'inset' : /^(row-gap|column-gap|gap)$/.test(p) ? 'gap' : /^(border|margin|padding|grid|flex|font|background|outline|transition|animation|overflow|text-decoration|list-style|columns|column-rule|place|mask|scroll-margin|scroll-padding|container|offset)(-|$)/.test(p) ? p.match(/^(border|margin|padding|grid|flex|font|background|outline|transition|animation|overflow|text-decoration|list-style|columns|column-rule|place|mask|scroll-margin|scroll-padding|container|offset)/)[1] : p);
  const overlap = (A, B) => { for (const x of A) for (const y of B) { if (x === y || x === 'all' || y === 'all' || (!x.startsWith('--') && FAM(x) === FAM(y))) return true; } return false; }; // (a shorthand and its longhands are one property here)
  const subjectNames = (sel) => { const parts = strip(sel.replace(/"[^"]*"|'[^']*'/g, '')).split(/[\s>+~]+/).filter(Boolean); return [...(parts[parts.length - 1] || '').matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]); };
  const MIN = Number(opt('--min-kb') || 1.5) * 1024;
  const SKIPG = new Set((opt('--skip-groups') || '').split(',').filter(Boolean));
  const tally = {}; const list = []; const kept = {};
  const cands = []; // { f, text, rules, i, n, g, P, S }
  const bySheet = {};
  for (const f of sheets) {
    if (!inScope(f)) continue;
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const rules = parse(text).nodes.filter((n) => n.kind === 'rule' && n.parent?.kind !== 'at');
    bySheet[f] = { text, rules };
    for (const [i, n] of rules.entries()) {
      const sels = splitList(n.prelude.replace(/\/\*[\s\S]*?\*\//g, ''));
      const gs = sels.map((sel) => new Set([...strip(sel.replace(/"[^"]*"|'[^']*'/g, '')).matchAll(/[.#](-?[A-Za-z_][\w-]*)/g)].map((m) => ownerOf(m[1])).filter(Boolean)));
      const common = gs.length ? [...gs[0]].filter((g) => gs.every((x) => x.has(g))) : [];
      if (common.length !== 1 || SKIPG.has(common[0])) continue;
      cands.push({ f, text, rules, i, n, g: common[0], P: props(n.body), S: sels.map(spec) });
    }
  }
  // moved, a rule comes after every later rule of its sheet that stays: one of those that could style the same element
  // with the same specificity and a property in common would lose where it used to win, so the rule stays too (until
  // nothing changes; rules moving together keep their order among themselves)
  const moving = new Map(cands.map((c) => [c.n, c]));
  const clashOf = (c) => c.rules.slice(c.i + 1).find((m) => {
    const o = moving.get(m); if (o && o.g === c.g) return false;
    if (!overlap(c.P, props(m.body))) return false;
    return splitList(m.prelude.replace(/\/\*[\s\S]*?\*\//g, '')).some((sel) => {
      // the same element: the moved rule's element is made by the group's code, so a class of the later rule's subject
      // that no file of the group ever writes can't be on it (a class another group owns, or one only other code adds)
      if (subjectNames(sel).some((x) => ![...producers(x)].some((f) => groupOf.get(f) === c.g))) return false;
      const sp = spec(sel); return c.S.some((q) => q[0] === sp[0] && q[1] === sp[1] && q[2] === sp[2]);
    });
  });
  for (let changed = true; changed;) {
    changed = false;
    for (const c of cands) { if (!moving.has(c.n)) continue; const m = clashOf(c); if (m) { moving.delete(c.n); changed = true; (kept[`${c.f} → ${c.g}`] ||= []).push(`${c.n.prelude.replace(/\s+/g, ' ').slice(0, 70)}  (after it: ${m.prelude.replace(/\s+/g, ' ').slice(0, 60)})`); } }
    const size = {}; for (const c of moving.values()) size[`${c.f} → ${c.g}`] = (size[`${c.f} → ${c.g}`] || 0) + c.n.end - c.n.start;
    for (const c of [...moving.values()]) if (size[`${c.f} → ${c.g}`] < MIN) { moving.delete(c.n); changed = true; }
  }
  for (const c of cands) if (moving.has(c.n)) { const k = `${c.f} → ${c.g}`; tally[k] = (tally[k] || 0) + c.n.end - c.n.start; list.push({ file: c.f, group: c.g, n: c.n, text: c.text }); }
  for (const [k, b] of Object.entries(tally).sort((x, y) => y[1] - x[1])) console.log(`${(b / 1024).toFixed(1).padStart(6)} KB  ${k}${b < MIN ? '  (under --min-kb: stays)' : ''}${kept[k] ? `  · ${kept[k].length} stay (a later rule could override)` : ''}`);
  if (args.includes('--why')) for (const [k, v] of Object.entries(kept)) for (const x of v) console.log(`   stays ${k}: ${x}`);
  const go = Object.entries(tally).filter(([, b]) => b >= MIN).map(([k]) => k);
  console.log(`movable: ${(go.reduce((a, k) => a + tally[k], 0) / 1024).toFixed(1)} KB in ${go.length} sheet → group pairs`);
  if (args.includes('--move')) {
    const NAMES = JSON.parse(opt('--names') || '{}'); // {"features.css → lab": "features-lab.css"}
    const plan = {};
    for (const k of go) {
      const [f, g] = k.split(' → ');
      plan[k] = { f, g, out: NAMES[k] || `${f.replace(/\.css$/, '')}-${g}.css`, items: list.filter((x) => x.file === f && x.group === g) };
    }
    const cutsBy = {};
    for (const { f, g, out, items } of Object.values(plan)) {
      const text = items[0].text;
      let css = `/* (round 159, css159) moved out of ${f}: its rules only the "${g}" group's code can make match. Loaded with that\n   group, right after ${f} (lazy-data.js CSS_AFTER), so they keep their place in the cascade. */\n`;
      let open = null;
      for (const { n } of items) {
        const wrap = []; for (let p = n.parent; p && p.kind === 'group'; p = p.parent) wrap.unshift(p.prelude);
        const key = wrap.join(' | ');
        if (open !== key) { if (open) css += '}\n'.repeat(open.split(' | ').length); if (key) css += wrap.map((w) => `${w} {\n`).join(''); open = key || null; }
        css += `${text.slice(n.start, n.end)}\n`;
        (cutsBy[f] ||= []).push(n.start);
      }
      if (open) css += '}\n'.repeat(open.split(' | ').length);
      fs.writeFileSync(path.join(ROOT, out), css);
      console.log(`wrote ${out}: ${items.length} rules, ${(css.length / 1024).toFixed(1)} KB`);
    }
    for (const [f, starts0] of Object.entries(cutsBy)) {
      const text = fs.readFileSync(path.join(ROOT, f), 'utf8'); const starts = new Set(starts0);
      const { root } = parse(text); const killNodes = new Set();
      const walk = (node) => {
        const kids = node.children || [];
        for (const k of kids) { if (k.kind === 'group') { walk(k); if (k.children.filter((c) => c.kind !== 'comment').every((c) => killNodes.has(c))) killNodes.add(k); } else if (k.kind === 'rule' && starts.has(k.start)) killNodes.add(k); }
      };
      walk(root);
      const ranges = [...killNodes].map((n) => { let a = n.start; let b = n.end; while (a > 0 && /[ \t]/.test(text[a - 1])) a--; if (text[b] === '\n') b++; return [a, b]; });
      const outer = ranges.filter((x) => !ranges.some((y) => y !== x && y[0] <= x[0] && y[1] >= x[1]));
      let t = text; for (const [a, b] of outer.sort((x, y) => y[0] - x[0])) t = t.slice(0, a) + t.slice(b);
      t = t.replace(/\n{3,}/g, '\n\n');
      fs.writeFileSync(path.join(ROOT, f), t); console.log(`${f}: ${((text.length - t.length) / 1024).toFixed(1)} KB out`);
    }
    console.log(JSON.stringify(Object.values(plan).map((p) => [p.g, p.out, p.f])));
  }
  process.exit(0);
}

// ---------- report ----------
const report = {}; const only = opt('--file');
for (const f of cssFiles) {
  if (only && f !== only) continue;
  const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const { root, nodes } = parse(text);
  const fileUsed = used.get(f);
  const dead = []; const partial = []; const keyframes = [];
  for (const n of nodes) {
    if (n.kind === 'rule') {
      if (/^(from|to|\d)/.test(n.prelude) || n.parent?.kind === 'at') continue; // keyframe steps
      const sels = splitList(n.prelude.replace(/\/\*[\s\S]*?\*\//g, ''));
      const why = sels.map(selectorDead);
      const matched = fileUsed?.has(text.slice(n.start, n.end));
      if (why.every(Boolean)) { if (!matched) dead.push({ n, why }); } else if (why.some(Boolean)) partial.push({ n, sels, why });
    } else if (n.kind === 'at' && /^@(-webkit-)?keyframes\s/.test(n.prelude)) {
      const name = n.prelude.split(/\s+/)[1];
      if (!animWords.has(name) && !words.has(name)) keyframes.push({ n, name });
    }
  }
  if (!dead.length && !partial.length && !keyframes.length) continue;
  report[f] = { text, root, dead, partial, keyframes, size: text.length, loaded: !!fileUsed };
}

const fmt = (n) => (n / 1024).toFixed(1);
let tot = 0;
const out = {};
for (const [f, r] of Object.entries(report).sort((a, b) => b[1].dead.reduce((s, d) => s + d.n.end - d.n.start, 0) - a[1].dead.reduce((s, d) => s + d.n.end - d.n.start, 0))) {
  const bytes = r.dead.reduce((s, d) => s + d.n.end - d.n.start, 0) + r.keyframes.reduce((s, k) => s + k.n.end - k.n.start, 0);
  tot += bytes;
  out[f] = { scope: CODEX.test(f) ? 'codex' : inScope(f) ? 'mine' : 'other', bytes, loadedInTour: r.loaded,
    dead: r.dead.map((d) => ({ sel: d.n.prelude.replace(/\s+/g, ' ').slice(0, 200), why: [...new Set(d.why)].join(' '), bytes: d.n.end - d.n.start, line: r.text.slice(0, d.n.start).split('\n').length })),
    partial: r.partial.map((p) => ({ sel: p.n.prelude.replace(/\s+/g, ' ').slice(0, 200), deadSels: p.sels.filter((_, i) => p.why[i]) })),
    keyframes: r.keyframes.map((k) => k.name) };
  if (!opt('--json')) console.log(`${fmt(bytes).padStart(6)} KB  ${String(r.dead.length).padStart(4)} rules ${String(r.partial.length).padStart(3)} partial ${String(r.keyframes.length).padStart(2)} kf  ${out[f].scope.padEnd(5)} ${r.loaded ? '' : '(not loaded in tour) '}${f}`);
  if (only) { for (const d of out[f].dead) console.log(`   L${d.line} ${d.bytes}B  ${d.sel}   ← ${d.why}`); for (const p of out[f].partial) console.log(`   partial: ${p.deadSels.join(' , ')}`); for (const k of out[f].keyframes) console.log(`   @keyframes ${k}`); }
}
if (!opt('--json')) console.log(`total ${fmt(tot)} KB dead${haveCov ? '' : ' (static only: pass --cov)'}`);
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(out, null, 1));

// ---------- apply ----------
if (APPLY) {
  if (!haveCov) { console.error('--apply needs at least one --cov run'); process.exit(2); }
  for (const [f, r] of Object.entries(report)) {
    if (!inScope(f)) continue;
    const kill = new Set([...r.dead.map((d) => d.n), ...r.keyframes.map((k) => k.n)]);
    const cuts = []; // [start, end]
    // a selector list whose rule lives loses its dead selectors
    const edits = [];
    for (const p of r.partial) {
      const keep = p.sels.filter((_, i) => !p.why[i]);
      const preEnd = r.text.indexOf('{', p.n.start);
      edits.push([p.n.start, preEnd, `${keep.join(',\n')} `]);
    }
    // groups (and a comment heading only dead rules) go with their rules
    const walk = (node) => {
      const kids = node.children || [];
      for (const k of kids) if (k.kind === 'group') { walk(k); if (k.children.filter((c) => c.kind !== 'comment').every((c) => kill.has(c))) kill.add(k); }
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].kind !== 'comment') continue;
        let j = i + 1; const run = [];
        while (j < kids.length && kids[j].kind !== 'comment') run.push(kids[j++]);
        if (run.length && run.every((c) => kill.has(c))) kill.add(kids[i]);
      }
    };
    walk(r.root);
    for (const n of kill) {
      let a = n.start; let b = n.end;
      while (a > 0 && /[ \t]/.test(r.text[a - 1])) a--;
      if (r.text[b] === '\n') b++;
      cuts.push([a, b]);
    }
    const ranges = [...cuts.map(([a, b]) => [a, b, '']), ...edits];
    const outer = ranges.filter((x) => !ranges.some((y) => y !== x && y[2] === '' && y[0] <= x[0] && y[1] >= x[1] && (y[0] < x[0] || y[1] > x[1])));
    const all = outer.sort((x, y) => y[0] - x[0]);
    let t = r.text;
    for (const [a, b, s] of all) t = t.slice(0, a) + s + t.slice(b);
    t = t.replace(/\n{3,}/g, '\n\n');
    if (t !== r.text) { fs.writeFileSync(path.join(ROOT, f), t); console.log(`applied: ${f} ${fmt(r.text.length - t.length)} KB`); }
  }
}
