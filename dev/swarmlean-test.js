#!/usr/bin/env node
// (round 33, swarmlean) Lean missions, the plain parts: the picker's estimates (swarmlean.js estimateOf), the short
// summary that goes back into a chat (brief), the helper pick (cheaper model + low effort on Smart, never over the
// owner's pick), and that a helper run's prompt has no memory / habits and stays byte-identical when memory changes
// (engines.js options.helper, checked on a real engine run with dev/fake-claude.js and its token log).
//   node dev/swarmlean-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SL = require(path.join(ROOT, 'swarmlean.js'));
const Router = require(path.join(ROOT, 'router.js'));
const fails = [];
const check = (ok, what, info) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) { fails.push(what); if (info !== undefined) console.log('   ', typeof info === 'string' ? info : JSON.stringify(info).slice(0, 600)); } };

// 1. estimates: one plain line, the right order of magnitude, nothing for a single reply
const sw = SL.estimateOf('swarm', { ctx: 2000, task: 30, seats: 3 });
check(sw && sw.helpers === 2 && /^≈ 2 helpers · about [\d.]+k? tokens$/.test(sw.line), 'Swarm: "≈ 2 helpers · about …k tokens"', sw);
check(sw.tokens > 2000 && sw.tokens < 8000, `Swarm: about the measured size (${sw.tokens})`);
const db = SL.estimateOf('debate', { task: 30, rounds: 2 });
check(db && db.tokens > sw.tokens, `Debate costs more than Swarm (${db?.tokens} > ${sw.tokens})`);
check(SL.estimateOf('debate', { rounds: 3 }).tokens > db.tokens, 'a third debate round costs more');
check(SL.estimateOf('duo', {}).line.startsWith('≈ 1 other AI'), 'Side by side: "≈ 1 other AI"', SL.estimateOf('duo', {}).line);
const lab = SL.estimateOf('lab-variations', { n: 4, code: 1200 });
check(lab.helpers === 4 && lab.tokens > 40000 && lab.tokens < 120000, `Lab variations: 4 helpers, tens of thousands (${lab.line})`);
check(SL.estimateOf('review', { ctx: 20000 }).tokens > SL.estimateOf('review', { ctx: 1000 }).tokens, 'Answer then review: grows with this chat\'s context');
check(SL.estimateOf('normal', {}) === null && SL.estimateOf('plan', {}) === null && SL.estimateOf('teach', {}) === null, 'single-reply missions show no estimate');
check(SL.estimateOf('everyone', { everyone: 3 }).helpers === 3, 'Ask everyone: one per AI');

// 2. the short summary for the chat's context
const long = `First point, the hook: open on the logo hit.\n\n${'A sentence about the hook and the music. '.repeat(60)}`;
const b = SL.brief(long, 900);
check(b.length <= 960 && b.length > 400 && /the rest is in the result card\]$/.test(b), `brief: ≤ ~900 characters, says where the rest is (${b.length})`);
check(b.startsWith('First point, the hook'), 'brief: keeps the opening');
const code = `Here it is:\n\n\`\`\`js\n${'const x = 1;\n'.repeat(80)}\`\`\`\n\nThat's it.`;
check(/\[js block, \d+ lines: in the result card\]/.test(SL.brief(code, 900)) && !/const x = 1;\nconst/.test(SL.brief(code, 900)), 'brief: a big code block is named, not pasted');
check(SL.brief('short answer', 900) === 'short answer', 'brief: a short answer stays as it is');
check(!/remember/.test(SL.brief('ok <remember>a fact</remember>', 900)), 'brief: drops <remember> tags');

// 3. the helper pick
const opus = { engine: 'claude', model: 'claude-opus-5-5' };
check(JSON.stringify(SL.helperPick(opus, { R: Router })) === JSON.stringify({ model: 'sonnet', effort: 'low' }), 'Claude helper on Smart: Sonnet, low effort', SL.helperPick(opus, { R: Router }));
check(SL.helperPick({ engine: 'codex', model: 'gpt-6-astra' }, { R: Router })?.model === 'gpt-6-sol', 'Astra helper on Smart: Sol');
check(JSON.stringify(SL.helperPick({ ...opus, effort: 'high' }, { R: Router })) === JSON.stringify({ model: 'sonnet', effort: 'medium' }), 'an AI set to Deep: its helpers think with medium effort');
check(SL.helperPick(opus, { seat: { model: 'claude-opus-5-5' }, R: Router }) === null && SL.helperPick(opus, { seat: { effort: 'high' }, R: Router }) === null, 'a seat with its own model / effort keeps it');
check(SL.helperPick(opus, { chat: { model: 'opus' }, R: Router }) === null, 'a chat with a pinned model keeps it');
check(JSON.stringify(SL.helperPick({ engine: 'claude', model: 'haiku' }, { R: Router })) === JSON.stringify({ effort: 'low' }), 'never a stronger model than the AI\'s own (Haiku stays Haiku)');

// 4. a helper run: no memory, no habits, byte-stable when memory changes (a real engines.js run on the fake CLI)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarmlean-test-'));
for (const f of ['engines.js', 'store.js', 'scenesafe-core.js', 'installs.js', 'winpolish.js', 'access-rules.js', 'connectionsmain.js', 'recall-core.js', 'context-core.js']) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
fs.cpSync(path.join(ROOT, 'mcp'), path.join(dir, 'mcp'), { recursive: true });
fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
const writeMemory = (m) => fs.writeFileSync(path.join(dir, 'data', 'memory.json'), JSON.stringify(m));
writeMemory({ shared: '- I post 9:16 visuals on Shorts\n- Keep bloom subtle', agents: {} });
const log = path.join(dir, 'runs.jsonl');
process.env.FAKE_TOKEN_LOG = log;
process.env.FAKE_DELAY = '0';
const engines = require(path.join(dir, 'engines.js'));
try { require(path.join(dir, 'connectionsmain.js')).setReader(() => ({ connections: [] })); } catch { /* optional */ }
const CLAUDE = { id: 'claude', name: 'Claude', engine: 'claude', mode: 'native', instructions: [{ text: 'Answer in short paragraphs' }] };
const run = (options) => new Promise((resolve) => {
  engines.send({ agent: CLAUDE, chatId: `t-${Math.random().toString(36).slice(2)}`, session: {}, text: 'Name three calm colors.', options: { _bin: path.join(__dirname, 'fake-claude.js'), lean: true, ...options } }, (ev) => { if (['done', 'error', 'stopped'].includes(ev.type)) resolve(ev); });
});
const runs = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
(async () => {
  const plain = await run({});
  const helper1 = await run({ helper: true, model: 'sonnet', effort: 'low' });
  writeMemory({ shared: '- I post 9:16 visuals on Shorts\n- Keep bloom subtle\n- A new fact saved meanwhile', agents: {} });
  const helper2 = await run({ helper: true, model: 'sonnet', effort: 'low' });
  check(plain.type === 'done' && helper1.type === 'done' && helper2.type === 'done', 'the runs answered', [plain.type, helper1.type, helper2.type]);
  const [p, h1, h2] = runs();
  check(p && /remember about the user/.test(p.system) && /<remember>/.test(p.system), 'a plain lean run still carries memory + the remember habit');
  check(h1 && !/remember about the user|<remember>|<suggest>/.test(h1.system), 'a helper run: no memory, no <remember> / <suggest> habits', h1?.system);
  check(h1 && /Answer in short paragraphs/.test(h1.system), 'a helper run keeps the owner\'s standing instructions');
  check(h1 && h2 && h1.system === h2.system, 'a helper prompt is byte-identical after memory changes (the cache keeps hitting)');
  check(h1 && h1.model === 'sonnet' && h1.effort === 'low', 'the helper pick reaches the engine (--model sonnet --effort low)', h1 && [h1.model, h1.effort]);
  check(h1 && p && h1.system.length < p.system.length, `the helper prompt is shorter (${h1?.system.length} < ${p?.system.length} characters)`);
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})();
