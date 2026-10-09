#!/usr/bin/env node
// One runner for the dev checks: prepares the throwaway fixtures a check needs (test song, test videos, editor
// clips with burned-in frame numbers, board pictures / clips / page, capture test videos), then runs each check
// through dev/smoke.js with the flags its own header asks for (--fake-engines, --check-timeout, --wait, --data,
// --eval …) plus the shared helpers it uses (journey-lib / smooth-lib / editor-frames are added by smoke.js
// itself when a check uses J, M or decodeFrameCode). Prints one line per check and keeps every log.
//   sh dev/run-checks.sh                      # the quick group (qa)
//   sh dev/run-checks.sh board editor         # groups, or check names (editor-more, journey-board…)
//   sh dev/run-checks.sh unit                 # the Node-only tests (no Electron)
//   sh dev/run-checks.sh --list               # groups and checks
//   options: --out <dir> (logs and pictures, default <tmp>/hearth-checks) · --shots (journeys keep a picture per step)
//   · --fixtures-only · --stop (first failure)
// Groups: qa, board, editor, capture, journeys, chat, lab, video, nodes, smooth, astra, unit, all.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const DEV = __dirname;
const ROOT = path.join(DEV, '..');
const CHECKS = path.join(DEV, 'checks');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const OUT = path.resolve(opt('--out', path.join(os.tmpdir(), 'hearth-checks')));
const names = argv.filter((a, i) => !a.startsWith('--') && !['--out'].includes(argv[i - 1]));

const LIBS = new Set(['journey-lib', 'smooth-lib', 'journey-olddata-make']); // helpers / made to run in the old app
const all = fs.readdirSync(CHECKS).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).filter((n) => !LIBS.has(n)).sort();
const UNIT = ['board-unit-test', 'board-mcp-test', 'capture-mcp-test', 'editor-mcp-test', 'director-mcp-test', 'cut-test', 'editor-test', 'capture-test', 'music-test', 'code-flow-test', 'importer-test', 'director-cost', 'astra-engine-test', 'test-aemain-mac'];
const by = (re) => all.filter((n) => re.test(n));
const GROUPS = {
  qa: ['qa-commands', 'qa-keys', 'qa-mac', 'polish'],
  board: by(/^board/),
  editor: ['editor', 'editor-more', 'editor-mcp', 'cut'],
  capture: by(/^capture/),
  journeys: by(/^journey-/),
  chat: by(/^chat-|^cmdbar$|^clutter$|^declutter/),
  lab: ['music', 'live', 'scenes', 'jam', 'assist', 'decide', 'brain', 'director-dock', 'director-tools', 'director-engine-preview', 'perf'],
  video: ['cut', 'nodes-video', 'editor'],
  nodes: by(/^nodes-/),
  smooth: by(/^smooth-/),
  astra: ['astra-collab', 'astra-ui', 'astra-manager'],
  unit: UNIT.map((u) => `unit:${u}`),
};
GROUPS.all = [...new Set([...all.filter((n) => !/^astra-/.test(n)), ...GROUPS.astra, ...GROUPS.unit])];

if (argv.includes('--list')) {
  for (const [g, list] of Object.entries(GROUPS)) if (g !== 'all') console.log(`${g}: ${list.join(' ')}`);
  console.log(`all: every check above (${GROUPS.all.length})`);
  process.exit(0);
}
const wanted = [...new Set((names.length ? names : ['qa']).flatMap((n) => GROUPS[n] || [UNIT.includes(n) ? `unit:${n}` : n]))];
for (const n of wanted) if (!n.startsWith('unit:') && !all.includes(n)) { console.error(`No check "${n}" (sh dev/run-checks.sh --list)`); process.exit(2); }

// ---------- fixtures (made once, reused; all in the temp folder, never in the app) ----------
const T = '/tmp'; // the checks name these paths themselves
const sh = (cmd, a) => execFileSync(cmd, a, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const FIX = [
  { re: /hearth-test-song|make-test-song|\.wav\b/, path: `${T}/hearth-test-song.wav`, make: () => sh('node', ['dev/make-test-song.js', `${T}/hearth-test-song.wav`]) },
  { re: /hearth-test-videos|VIDS\b/, path: `${T}/hearth-test-videos`, make: () => sh('sh', ['dev/make-test-videos.sh', `${T}/hearth-test-videos`]) },
  { re: /hearth-editor-videos|EDITOR_VIDS/, path: `${T}/hearth-editor-videos`, make: () => sh('node', ['dev/make-editor-videos.js', `${T}/hearth-editor-videos`]) },
  { re: /hearth-board-fixtures|BOARD_FIXTURES/, path: `${T}/hearth-board-fixtures`, make: () => sh('sh', ['dev/board-fixtures.sh', `${T}/hearth-board-fixtures`]) },
  { re: /labframes-media|make-lab-footage|\bLF\./, path: `${T}/labframes-media`, make: () => sh('node', ['dev/make-lab-footage.js', `${T}/labframes-media`]) },
  { re: /hearth-intro-song/, path: `${T}/hearth-intro-song.wav`, make: () => sh('node', ['dev/make-test-song.js', `${T}/hearth-intro-song.wav`, '120', '30']) },
  { re: /hearth-capture-test/, path: `${T}/hearth-capture-test`, make: () => sh('node', ['dev/capture-test.js', '--make', `${T}/hearth-capture-test`]) },
];
const srcOf = (n) => (n.startsWith('unit:') ? fs.readFileSync(path.join(DEV, `${n.slice(5)}.js`), 'utf8') : fs.readFileSync(path.join(CHECKS, `${n}.js`), 'utf8'));
const exists = (p) => { try { return fs.statSync(p).isFile() || fs.readdirSync(p).length > 0; } catch { return false; } };
const needed = FIX.filter((f) => wanted.some((n) => f.re.test(srcOf(n)) || /^journey-|^cut$|^editor/.test(n.replace('unit:', ''))));
for (const f of needed) {
  if (exists(f.path)) continue;
  process.stdout.write(`fixtures: ${f.path} … `);
  try { f.make(); console.log('made'); } catch (e) { console.log(`failed (${e.message.split('\n')[0]}): checks that need it will fail`); }
}
if (argv.includes('--fixtures-only')) process.exit(0);

// ---------- run ----------
fs.mkdirSync(OUT, { recursive: true });
// The flags a check's header asks for: the first "node dev/smoke.js …" line in its comments.
function flagsOf(src) {
  const line = (src.match(/node dev\/smoke\.js([^\n`]*)/) || [])[1] || '';
  const toks = line.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const keep = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (['--script', '--shot', '--lib'].includes(t)) { i++; continue; } // set here (libs: by smoke.js)
    if (['--check-timeout', '--wait', '--data', '--eval', '--open', '--save-dir'].includes(t)) { keep.push(t, toks[++i].replace(/^["']|["']$/g, '')); continue; }
    if (t.startsWith('--')) keep.push(t);
  }
  if (!keep.includes('--check-timeout')) keep.push('--check-timeout', '600000');
  return keep;
}
const results = [];
const t0 = Date.now();
for (const n of wanted) {
  const started = Date.now();
  const log = path.join(OUT, `${n.replace('unit:', 'unit-')}.log`);
  let r;
  if (n.startsWith('unit:')) {
    const u = n.slice(5);
    const extra = u === 'cut-test' ? [`${T}/hearth-test-videos`] : u === 'editor-test' ? [`${T}/hearth-editor-videos`] : [];
    r = spawnSync('node', [path.join(DEV, `${u}.js`), ...extra], { cwd: ROOT, encoding: 'utf8', timeout: 1800000, maxBuffer: 64 << 20 });
  } else if (n.startsWith('astra-')) {
    r = spawnSync('node', [path.join(DEV, 'astra-smoke.js'), n.slice(6), '--shot', path.join(OUT, `${n}.png`)], { cwd: ROOT, encoding: 'utf8', timeout: 1800000, maxBuffer: 64 << 20 });
  } else {
    const shots = path.join(OUT, n);
    // step pictures only when asked (--shots): a 1080×1080 screenshot mid-journey can starve a recording on a busy machine
    const a = [path.join(DEV, 'smoke.js'), ...flagsOf(srcOf(n)), ...(argv.includes('--shots') ? ['--eval', `window.JOURNEY_SHOTS=${JSON.stringify(shots)}`] : []), '--script', path.join(CHECKS, `${n}.js`), '--shot', path.join(OUT, `${n}.png`)];
    r = spawnSync('node', a, { cwd: ROOT, encoding: 'utf8', timeout: 1800000, maxBuffer: 64 << 20 });
  }
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  fs.writeFileSync(log, text);
  // failed: a non-zero exit, a result with a top-level "ok": false (not one nested in what a check reports), a ✖ step,
  // or a FAIL line from a Node test
  const bad = r.status !== 0 || /^(?:\{ ?| )"ok":\s*false/m.test(text) || /^\s*"?✖/m.test(text) || /^(FAIL|✖)/m.test(text);
  const why = bad ? (text.match(/\d+ problem\(s\):\n([^\n]*)/)?.[1] || text.match(/^\s*"?✖[^\n]*/m)?.[0] || text.match(/"problems":\s*\[[^\]]*\]/)?.[0] || (r.error ? r.error.message : `exit ${r.status}`)).trim().slice(0, 200) : '';
  results.push({ n, ok: !bad, s: Math.round((Date.now() - started) / 1000), why });
  console.log(`${bad ? '✖' : '✓'} ${n.padEnd(22)} ${String(results.at(-1).s).padStart(4)} s${bad ? `  ${why}` : ''}`);
  if (bad && argv.includes('--stop')) break;
}
const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed in ${Math.round((Date.now() - t0) / 60000)} min · logs: ${OUT}`);
process.exit(failed.length ? 1 : 0);
