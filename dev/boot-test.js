#!/usr/bin/env node
// Boot (round 16): the main-process modules main.js loads on their first IPC call (lazyIpc) must have every channel
// their register() adds readable from their source, else a call would find no handler. Also: every lazy group's files
// exist, none is still in index.html, and each lazy-at.js tag names known groups.
//   node dev/boot-test.js
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// 1. lazy main-process modules: channels from the source = channels register() adds
const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const lazyFiles = [...main.matchAll(/lazyIpc\('([^']+)'/g)].map((m) => m[1]).filter((f) => f !== 'file');
ok(lazyFiles.length >= 2, 'main.js loads some modules lazily');
for (const file of lazyFiles) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // (the same reading as main.js's ipcChannels: literal channels, and those through a `const h = (ch, fn) => ipcMain.handle(ch…` helper)
  const read = new Set([...src.matchAll(/ipcMain\.(handle|on)\(\s*'([^']+)'/g)].map((m) => m[2]));
  for (const [, name] of src.matchAll(/const (\w+) = \((\w+)[^)]*\) => ipcMain\.(handle|on)\(\2\b/g)) for (const m of src.matchAll(new RegExp(`\\b${name}\\(\\s*'([^']+)'`, 'g'))) read.add(m[1]);
  const added = new Set();
  const fake = { handle: (ch) => added.add(ch), on: (ch) => added.add(ch), removeHandler() {} };
  const m = require(path.join(ROOT, file));
  if (['creative-vstmain.js', 'soundbankmain.js'].includes(file)) m.register(fake, // (round 63, soundbank63: same signature)
    { dataDir: require('os').tmpdir(), getWin: () => null, app: { once() {} } });
  else m.register(fake, () => null, () => ({}));
  for (const ch of added) ok(read.has(ch), `${file}: ${ch} is added by register() but not readable from the source`);
  for (const ch of read) ok(added.has(ch), `${file}: ${ch} is in the source but register() doesn't add it`);
  console.log(`✓ ${file}: ${added.size} channels`);
}

// 2. lazy groups vs index.html
const LazyData = new Function(`${fs.readFileSync(path.join(ROOT, 'lazy-data.js'), 'utf8')}; return LazyData;`)(); // eslint-disable-line no-new-func
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const names = new Set(LazyData.GROUPS.map((g) => g.name));
for (const g of LazyData.GROUPS) {
  for (const f of g.files) {
    ok(fs.existsSync(path.join(ROOT, f)), `${g.name}: ${f} is missing`);
    ok(!html.includes(`src="${f}"`), `${g.name}: ${f} is still a <script> in index.html (it would load twice)`);
  }
  for (const c of g.css || []) { ok(fs.existsSync(path.join(ROOT, c)), `${g.name}: ${c} is missing`); ok(!html.includes(`href="${c}"`), `${g.name}: ${c} is still linked in index.html`); }
  for (const d of g.after || []) ok(names.has(d), `${g.name}: after "${d}" isn't a group`);
  ok(LazyData.META[g.name], `${g.name}: no manifest (node dev/lazy-manifest.js)`);
}
const at = [...html.matchAll(/lazy-at\.js#([\w,-]+)/g)].flatMap((m) => m[1].split(','));
for (const a of at) ok(names.has(a), `lazy-at.js#${a}: no such group`);
for (const g of names) ok(at.includes(g), `${g}: no lazy-at.js tag (its stand-ins would come last)`);
ok(html.indexOf('src="lazy.js"') > html.indexOf('src="commands.js"') && html.indexOf('src="lazy.js"') < html.indexOf('lazy-at.js'), 'lazy.js loads after commands.js, before the first lazy-at.js');
// (round 52, lazymeta) the stand-in commands' words are read after the first frame (lazy.js Lazy.text()), never in front of it
const LazyText = new Function(`${fs.readFileSync(path.join(ROOT, 'lazy-meta.js'), 'utf8')}; return LazyText;`)(); // eslint-disable-line no-new-func
ok(!html.includes('src="lazy-meta.js"'), 'lazy-meta.js is a <script> in index.html (it is read after the first frame)');
for (const [g, cmds] of Object.entries(LazyText)) {
  ok(names.has(g), `lazy-meta.js: ${g} isn't a group (node dev/lazy-manifest.js)`);
  const stubs = new Set((LazyData.META[g]?.commands || []).map((c) => c.name.toLowerCase()));
  for (const n of Object.keys(cmds)) if (n !== '#keys') ok(stubs.has(n), `lazy-meta.js: /${n} (${g}) isn't in the manifest (node dev/lazy-manifest.js)`);
}
console.log(`✓ ${LazyData.GROUPS.length} lazy groups, ${LazyData.GROUPS.reduce((a, g) => a + g.files.length, 0)} files`);
// (round 54, fixes54) the groups stay whole through merges: one loader per file, every listed global defined by the
// group's own files, every module a lazy file uses loaded somewhere (dev/lazy-groups-test.js; a merge in round 53
// dropped tools/gametex-core.js from 'gameready')
const whole = require('./lazy-groups-test.js').run();
for (const e of whole.errors) ok(false, `lazy groups: ${e}`);
ok(true, 'lazy groups whole');
console.log(`✓ lazy groups whole: ${whole.files} loaded files, every listed global defined in its group, every used module loaded`);

// 3. (round 40, firstscreen) what the first screen reads before its first frame stays within budget: a new feature goes
// in a lazy group (lazy-data.js) or merges into a file that is already there; raise a budget only with a reason in
// docs/upgrades/firstscreen.md
const BUDGET = { scripts: 71, jsKB: 1872, sheets: 28, cssKB: 424 }; // round 77, storeack77: scripts 70 → 71 for storeack-core.js (≈ 5 KB of code within the same 1872 KB: the stores loaded on the first screen — Notes, feature usage, chat ↔ scene links — register with it as they load, and it hears every arrival from the start) // (round 51: 2350 → 2352; round 52, lazymeta: 2352 → 2330 with the first screen at ≈ 2,267 KB; round 67, slowbutton67: 2330 → 2333, the hiccup recorder must run from the start: docs/upgrades/firstscreen.md; round 67 merge: 2333 → 2336, the five round-67 streams together add ≈ 1.5 KB of manifest and preload lines, all features themselves lazy; round 67 creative session: scripts 72 → 73 for collab-eyes.js, 2.6 KB, which astra.js uses on send; jsKB 2336 → 2345 for that round's Astra/Swarm/direction hooks in native.js, astra.js, director-cmds.js, manager.js, missions.js; cssKB 450 → 451 for its .msg-blocked note in app.css; round 72: jsKB 2345 → 2352 for chatwindow72's resting-block hooks in native.js / chat-ux.js, which keep long chats at ~2k elements instead of ~43k; round 72, sync72 merge: the budget now counts code without whole-line comments — 2,042 KB at the change, so 2352 (with notes) → 2050 (code); round 73, startfast73: the node view (nodes.js + nodes.css), the prompt presets and the directors' commands load after the first screen: scripts 73 → 70, jsKB 2050 → 1860 (1,857 KB at the change; the lazy commands' argument hints and keys-sheet words also moved to lazy-meta.js), sheets 29 → 28, cssKB 451 → 424) // round 73 merge: 1860 → 1866, chatsteady73's usage delta + media-size hooks (+2 KB) on top of startfast73's cut // round 75: 1866 → 1872, menu rows + lazy group lines for projbundle75 / versions75 (the features themselves are lazy)
const eager = [...html.matchAll(/<script defer src="([^"#]+)"/g)].map((m) => m[1]).filter((f) => f !== 'lazy-at.js');
const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
// Git's Windows CRLF checkout must measure the same source budget as Linux/macOS.
const kb = (files) => Math.round(files.reduce((a, f) => a + Buffer.byteLength(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n')), 0) / 1024);
// (round 72) code size: whole-line // comments are notes for people, not work for the first screen, so the budget counts the rest
const codeKB = (files) => Math.round(files.reduce((a, f) => a + Buffer.byteLength(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n').replace(/^[ \t]*\/\/[^\n]*\n/gm, '')), 0) / 1024);
const first = { scripts: eager.length, jsKB: codeKB(eager), sheets: sheets.length, cssKB: kb(sheets) };
for (const k of Object.keys(BUDGET)) ok(first[k] <= BUDGET[k], `first screen: ${k} ${first[k]} > budget ${BUDGET[k]} (move it to a lazy group: lazy-data.js)`);
console.log(`✓ first screen: ${first.scripts} scripts (${first.jsKB} KB of code, ${kb(eager)} KB with notes), ${first.sheets} stylesheets (${first.cssKB} KB) · budget ${BUDGET.scripts} / ${BUDGET.jsKB} KB / ${BUDGET.sheets} / ${BUDGET.cssKB} KB`);
console.log(`boot-test: ${n} checks passed`);
