#!/usr/bin/env node
// (round 35, concise) "How long its answers are" (⋯ AI setup): Short / Detailed add ONE fixed line at the very end of
// a Claude prompt, Normal adds nothing, Astra gets Codex's own model_verbosity (no line); the prompt stays byte-stable
// and only its end changes. Also: the plain bits of concise.js (words ↔ values, the rewrite note) and the on-demand
// "edits" help. Engines + mcp/ are copied to a temp folder (a sample memory there, no real data).
//   node dev/concise-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'concise-test-'));
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'datasafe-core.js', 'installs.js', 'access-rules.js', 'connectionsmain.js', 'recall-core.js', 'context-core.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
fs.writeFileSync(path.join(dir, 'data', 'memory.json'), JSON.stringify({ shared: '- I post 9:16 visuals on Shorts\n- Keep bloom subtle', agents: { claude: '- Call me Sam' } }));
const engines = require(path.join(dir, 'engines.js'));
require(path.join(dir, 'connectionsmain.js')).setReader(() => ({ connections: [] }));
const T = engines._test;
const C = require(path.join(ROOT, 'concise.js'));
const CW = require(path.join(ROOT, 'cachewise.js'));
const guide = require(path.join(ROOT, 'mcp', 'three-guide.js'));

const fails = [];
const check = (ok, what, info) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) { fails.push(what); if (info !== undefined) console.log('   ', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 600)); } };
const tok = (s) => Math.ceil(s.length / 4);

const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'concise-proj-'));
const CLAUDE = { id: 'claude', name: 'Claude', engine: 'claude', mode: 'native', instructions: [{ text: 'Answer in short paragraphs' }], systemPrompt: 'A calm art director.' };
const DIRECTOR = { id: 'threedirector', name: 'Three Director', engine: 'claude', mode: 'native', dock: 'three', threeTools: true, hubChatId: 'c1' };
const FILES = { ...CLAUDE, access: { level: 'write', folders: [proj] } };
const ASTRA = { id: 'astra', name: 'Astra', engine: 'codex', mode: 'native' };
const L = T.ANSWER_LINES;

// 1. the lines themselves: one short line each, nothing that changes by itself
for (const [k, line] of Object.entries(L)) {
  check(!line.includes('\n') && tok(line) <= 40, `the ${C.labelOf(k)} line is one short line (${tok(line)} tokens ≤ 40)`);
  check(!/\d/.test(line), `the ${C.labelOf(k)} line has no numbers, dates or counters`);
}
check(/no preamble/.test(L.low) && /recap/.test(L.low) && /code lines that change/.test(L.low), 'Short asks for: answer first, no preamble / recap / narration, only the code that changes');

// 2. Normal adds nothing; Short / Detailed add exactly their line at the very end (the tail only)
for (const [label, agent] of [['plain Claude', CLAUDE], ['Three Director', DIRECTOR], ['Claude with file access', FILES]]) {
  const normal = T.buildPrompt(agent, { id: 's' });
  check(!/Answer length/.test(normal) && T.buildPrompt({ ...agent, verbosity: 'medium' }, { id: 's' }) === normal, `${label}: Normal adds nothing (${tok(normal)} tokens, as before)`);
  for (const v of ['low', 'high']) {
    const p = T.buildPrompt({ ...agent, verbosity: v }, { id: 's' });
    check(p === `${normal}\n\n${L[v]}`, `${label}: ${C.labelOf(v)} = the same prompt + its line at the end (+${tok(p) - tok(normal)} tokens)`, p.slice(-300));
    check(p === T.buildPrompt({ ...agent, verbosity: v }, { id: 's' }), `${label}: ${C.labelOf(v)} builds the same bytes twice`);
  }
}
// the flags: the same bytes message after message, and only the prompt's end differs from Normal
const flags = (agent) => T.claudeArgs(agent, { id: 'sess-1' }, {}).filter((a) => !/\.json$/.test(a)).join('\u0000');
check(flags({ ...CLAUDE, verbosity: 'low' }) === flags({ ...CLAUDE, verbosity: 'low' }), 'Short: the same flags twice (byte-stable)');
const rev = Object.fromEntries(Object.entries({ ...DIRECTOR, verbosity: 'low' }).reverse());
check(T.buildPrompt(rev, { id: 's' }) === T.buildPrompt({ ...DIRECTOR, verbosity: 'low' }, { id: 's' }), 'the agent\'s key order never matters');
// memory frozen per session still works with the line (the line comes after it)
const sess = { id: 's2' };
const first = T.buildPrompt({ ...CLAUDE, verbosity: 'low' }, sess);
check(first.endsWith(L.low) && first.indexOf('What you remember') < first.indexOf(L.low), 'the line comes after the saved memory (the very end)');

// 3. Astra: no line; Codex's own verbosity setting instead
const ap = T.buildPrompt(ASTRA, { id: 's' });
check(T.buildPrompt({ ...ASTRA, verbosity: 'low' }, { id: 's' }) === ap && T.buildPrompt({ ...ASTRA, verbosity: 'high' }, { id: 's' }) === ap, 'Astra: Short / Detailed leave its prompt as it is (0 tokens)');
const cargs = (a) => T.codexArgs(a, { id: 'x' }, {}).join(' ');
check(/model_verbosity="low"/.test(cargs({ ...ASTRA, verbosity: 'low' })) && /model_verbosity="high"/.test(cargs({ ...ASTRA, verbosity: 'high' })) && !/model_verbosity/.test(cargs(ASTRA)), 'Astra: Short → model_verbosity low, Detailed → high, Normal → none');

// 4. a change mid-chat is a cache change (one calm line from cachewise), named as a habit
const s0 = CW.sig(CLAUDE, {});
check(CW.diff(s0, CW.sig({ ...CLAUDE, verbosity: 'low' }, {})).join() === 'h', 'switching the length mid-chat is a cache change (cachewise names it)');

// 5. concise.js: words ↔ values
check(C.valueOf('short') === 'low' && C.valueOf('normal') === '' && C.valueOf('detailed') === 'high' && C.valueOf('loud') === null, 'short / normal / detailed ↔ low / – / high');
check(C.labelOf('low') === 'short' && C.labelOf(undefined) === 'normal' && C.labelOf('medium') === 'normal' && C.labelOf('high') === 'detailed', 'labels');

// 6. edits as diffs: a small change sent as a whole layer gets the note; a real rewrite or a tiny layer doesn't
const scene = fs.readFileSync(path.join(__dirname, 'fixtures', 'concise-scene.js'), 'utf8');
const small = scene.replace("'#ff3cac'", "'#ff4fa8'").replace('speed: { value: 0.8,', 'speed: { value: 0.5,');
const note = C.rewriteNote(scene, small);
const m = /\((\d+) of (\d+) lines\).*≈ (\d+) tokens instead of ≈ (\d+)/.exec(note);
check(m && Number(m[1]) === Number(m[2]) - 2 && Number(m[3]) < 120 && Number(m[4]) > 1000, `a two-line change sent as a whole layer: “${note}”`);
check(C.rewriteNote(scene, scene.split('\n').map((l) => `${l} // new`).join('\n')) === '', 'a real rewrite: no note');
check(C.rewriteNote('a\nb\nc', 'a\nb\nd') === '', 'a tiny layer: no note');
check(C.rewriteNote(scene, scene) === '', 'nothing changed: no note');

// 7. the on-demand help says it (and the always-on guide didn't grow)
check(/Keep edits small/.test(guide.help('edits')) && guide.help('edits') === guide.help('bigcode') && guide.help('diff') === guide.help('bigcode'), 'three_do help "edits" (or diff, bigcode): keep edits small, a rewrite re-sends every line');
check(!/Keep edits small/.test(guide.CORE), 'the always-on director guide (CORE) is unchanged');

try { fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(proj, { recursive: true, force: true }); } catch { /* temp */ }
console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
process.exit(fails.length ? 1 : 0);
