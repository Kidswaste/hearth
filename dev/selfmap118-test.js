#!/usr/bin/env node
// (round 118, selfmap118) The AIs' map of Hearth's own code stays true (docs/upgrades/selfmap118.md). Plain Node, part
// of `unit`, no engine started:
//   1. every file, folder and module that mcp/hearth-map.js and HANDOFF.md name exists (a `backticked` path or glob
//      in HANDOFF.md, a file name in hearth-map.js, a `Global` or `fn()` in HANDOFF.md is declared in the code)
//   2. no removed feature is named in them (round 116: dev/slim116-test.js's lists, read from its source) nor in
//      FEATURES.md / README.md
//   3. Claude and Astra get the same 'hearthCode' part (mcp/hearth-map.js CODE) for a chat on Hearth's folder, it
//      points to HANDOFF.md, and other folders get none
//   node dev/selfmap118-test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const problems = [];
let checks = 0;
const bad = (m) => problems.push(m);

// ---------- 1. what they name exists ----------
const SKIP_DIRS = new Set(['.git', 'node_modules', 'electron', 'electron-mac', 'data', '.claude']);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), out); } else out.push(path.relative(ROOT, path.join(dir, e.name)).split(path.sep).join('/'));
  }
  return out;
}
const ALL = walk(ROOT);
const globRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`);
// a name may be written from the root or as a bare file name of tools/, mcp/ or dev/
const exists = (p) => {
  const clean = p.replace(/\/$/, '');
  const cands = clean.includes('/') ? [clean] : [clean, `tools/${clean}`, `mcp/${clean}`, `dev/${clean}`];
  if (clean.includes('*')) return cands.some((c) => ALL.some((f) => globRe(c).test(f) || globRe(`${c}/*`).test(f)));
  return cands.some((c) => fs.existsSync(path.join(ROOT, c)));
};
const PLACEHOLDER = /^(name|name-core|namemain|xmain)\.(js|css)$|<[^>]*>|^data\/|^electron\/$|\.hearth-trash\/$/; // examples, the owner's data, the gitignored Electron
const FILEISH = /^[\w.*<>/-]+\.(js|html|css|json|md|sh|cmd|py)$|^[\w.*-]+(\/[\w.*-]+)*\/$/;

// HANDOFF.md: every `backticked` path, `Global`, `fn()`
const handoff = read('HANDOFF.md');
const codeSrc = ALL.filter((f) => /\.(js|html)$/.test(f) && !f.startsWith('dev/')).map((f) => read(f)).join('\n');
const declared = (name) => new RegExp(`(?:\\b(?:const|let|var|function|class)\\s+${name}\\b|\\b${name}\\s*[:=]\\s*(?:\\(|async|function|\\{)|\\bfunction\\s*\\*?\\s*${name}\\s*\\(|\\b${name}\\s*\\([^)]*\\)\\s*\\{)`).test(codeSrc);
for (const [, raw] of handoff.matchAll(/`([^`\n]+)`/g)) {
  const t = raw.trim();
  if (/\s/.test(t) && !/^Agent Hub\.cmd$/.test(t)) continue; // commands and phrases
  if (t === 'Agent Hub.cmd' || (FILEISH.test(t) && !PLACEHOLDER.test(t))) { checks++; if (!exists(t)) bad(`HANDOFF.md names ${t}, which doesn't exist`); continue; }
  const fn = /^(\w+)\(\)$/.exec(t); const glob = /^[A-Z]\w+$/.test(t) && !/^(CORE|CODE|UNIT|HUB_TOOLSETS)$/.test(t) ? t : null;
  if (fn) { checks++; if (!declared(fn[1])) bad(`HANDOFF.md names ${t}, which no file declares`); }
  if (glob) { checks++; if (!declared(glob)) bad(`HANDOFF.md names the module ${t}, which no file declares`); }
  if (/^(CODE|HUB_TOOLSETS|UNIT)$/.test(t)) { checks++; if (!/\b(const|let) (CODE|HUB_TOOLSETS|UNIT) = /.test(t === 'UNIT' ? read('dev/run-checks.js') : t === 'CODE' ? read('mcp/hearth-map.js') : read('engines.js'))) bad(`HANDOFF.md names ${t}, not found`); }
}
// the prompt parts HANDOFF.md names are real ones
for (const part of ['access', 'hearthCode', 'folder']) { checks++; if (!new RegExp(`add\\('${part}'`).test(read('engines.js'))) bad(`HANDOFF.md names the prompt part ${part}, which engines.js doesn't add`); }

// hearth-map.js: every file name in it (strings and comments)
const mapSrc = read('mcp/hearth-map.js');
const LIBRARY = new Set(['three.js', 'Three.js', '.html']); // the library, and "file.html" words
for (const [m] of mapSrc.matchAll(/[\w./*-]+\.(?:js|html|css|md|py)\b/g)) {
  if (LIBRARY.has(m) || PLACEHOLDER.test(m)) continue;
  checks++; if (!exists(m)) bad(`mcp/hearth-map.js names ${m}, which doesn't exist`);
}

// ---------- 2. no removed feature ----------
const slim = read('dev/slim116-test.js');
const listOf = (name) => { const m = new RegExp(`const ${name} = \`([^\`]+)\``).exec(slim); assert(m, `slim116-test.js: ${name} not found`); return m[1].split(/\s+/).filter(Boolean); };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const REMOVED = [
  [new RegExp(`(?<![\\w.-])(${listOf('REMOVED_FILES').map(esc).join('|')})(?![\\w-])`), 'a removed file'],
  [new RegExp(`\\b(${listOf('REMOVED_GLOBALS').join('|')})\\b`), 'a removed module'],
  [/\b(quests?|side ?quests?|life tab|sound desk|vst\d?|music studio|live ?sets?|park ?jam|paris|outings?|tickets?|sound ?bank|audio doctor|serum|vital|weekend plan|studio hours|leave reminders?|show listings)\b/i, 'a removed feature'],
];
for (const f of ['mcp/hearth-map.js', 'HANDOFF.md', 'FEATURES.md', 'README.md']) {
  read(f).split('\n').forEach((line, i) => {
    for (const [re, what] of REMOVED) { checks++; const m = line.match(re); if (m) bad(`${f}:${i + 1}: ${what} (${m[0]}): ${line.trim().slice(0, 120)}`); }
  });
}

if (problems.length) { console.log(problems.join('\n')); console.log(`selfmap118-test: ${problems.length} problem(s)`); process.exit(1); }
console.log(`✓ every file and module named in mcp/hearth-map.js and HANDOFF.md exists; no removed feature in them (${checks} checks)`);

// ---------- 3. the same hearthCode part for both engines ----------
const Map = require(path.join(ROOT, 'mcp', 'hearth-map.js'));
assert(Map.CODE && Map.CODE.length < 1200, 'CODE is short');
assert(/HANDOFF\.md/.test(Map.CODE), 'CODE points to HANDOFF.md for depth');
assert.strictEqual(Map.topic('hearthcode'), Map.TOPICS.hearthcode, 'help hearthcode answers it on demand');
assert(Map.topic('hearthcode').includes(Map.CODE), 'the topic carries the same map');
const dir = require('./tmp-own').mkdtemp('selfmap118-');
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'winpolish.js', 'codex-capabilities.js', 'codex-server.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
const plain = fs.mkdtempSync(path.join(require('os').tmpdir(), 'selfmap118-plain-'));
try {
  const E = require(path.join(dir, 'engines.js'));
  const T = E._test;
  const agent = (engine, folders) => ({ id: `s118${engine}`, name: 'Helper', mode: 'native', engine, access: { level: 'write', folders } });
  const part = (a) => Object.fromEntries(E.promptParts(a)).hearthCode;
  const pc = part(agent('claude', [dir])); const px = part(agent('codex', [dir]));
  assert.strictEqual(pc, Map.CODE, 'Claude gets the map');
  assert.strictEqual(px, pc, 'Astra gets the same map');
  assert.strictEqual(T.HEARTH_CODE_GUIDE, Map.CODE, 'engines.js has no copy of its own');
  for (const engine of ['claude', 'codex']) {
    assert.strictEqual(part(agent(engine, [plain])), undefined, `${engine}: another folder gets no map`);
    assert(T.buildPrompt(agent(engine, [dir])).includes(Map.CODE), `${engine}: the map is in the prompt it is sent`);
  }
  assert(T.ownCode(agent('claude', [ROOT])), 'this checkout is recognised as Hearth\'s source');
  console.log('✓ Claude and Astra get the same hearthCode part (mcp/hearth-map.js CODE), pointing to HANDOFF.md; other folders get none');
} finally {
  fs.rmSync(plain, { recursive: true, force: true });
}
console.log('selfmap118-test: passed');
