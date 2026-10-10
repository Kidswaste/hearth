// Node tests for the Commands page core (cmdpage-core.js + cmdpage-data.js): the questions every command asks, derived
// from its metadata (args string, examples, complete(), explicit questions), and the guided run they become (a Flows
// run: needed / optional / yes-no / how many / how many times / then… a chained command fed by the result before).
//   node dev/cmdpage-test.js
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CORE = require(path.join(ROOT, 'cmdpage-core.js'));
const DATA = require(path.join(ROOT, 'cmdpage-data.js'));
// a snapshot of the registry (name, area, args, complete?, examples) from a real start: dev/fixtures/commands-registry.json;
// dev/checks/commands-page.js checks the live registry the same way
const REG = require(path.join(ROOT, 'dev/fixtures/commands-registry.json'));
const byName = new Map(REG.map((d) => [d.name, d]));
const qOf = (name) => CORE.questionsFor(byName.get(name), DATA.Q[name] || null);
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);
const kinds = (r) => r.qs.map((q) => `${q.kind}${q.required ? '!' : '?'}`);

ok('every registered command yields a valid question list and a flow', () => {
  assert(REG.length > 900, `the snapshot has ${REG.length} commands`);
  const bad = [];
  for (const d of REG) {
    const r = CORE.questionsFor(d, DATA.Q[d.name] || null);
    const e = CORE.checkQuestions(r);
    if (e.length) bad.push(`${d.name}: ${e[0]}`);
    const f = CORE.buildFlow([{ name: d.name, ...r }]);
    if (!f.nodes.some((n) => n.id === 'summary') || !f.nodes.some((n) => n.kind === 'action' && n.cmd.includes(`/${d.name}`))) bad.push(`${d.name}: no summary / action`);
  }
  assert.deepStrictEqual(bad, []);
});
ok('required: <x> is needed, [x] optional', () => {
  assert.deepStrictEqual(kinds(qOf('calc')), ['text!']);
  assert.match(qOf('calc').qs[0].title, /^This needs: an expression/);
  assert.deepStrictEqual(kinds(qOf('board')), ['text?']);
  assert.match(qOf('rename').qs[0].title, /^Optional: a title/);
  assert.strictEqual(qOf('present').qs.length, 0);
});
ok('yes / no: on|off and flags like [copy]', () => {
  const t = CORE.questionsFor({ name: 'x', args: '[on|off]' });
  assert.strictEqual(t.qs[0].kind, 'yesno');
  assert.deepStrictEqual(t.qs[0].options.map((o) => o.value), ['on', 'off']);
  const f = CORE.questionsFor({ name: 'x', args: '[9:16|16:9] [copy]' });
  assert.deepStrictEqual(kinds(f), ['choice?', 'yesno?']);
  assert.deepStrictEqual(f.qs[1].options.map((o) => o.value), ['copy', '']);
});
ok('how many: [n], <seconds>, ranges, "seed N" (a word, then the number)', () => {
  assert.strictEqual(CORE.questionsFor({ name: 'x', args: '[n]' }).qs[0].kind, 'count');
  const r = CORE.questionsFor({ name: 'x', args: '<0.1–8>' }).qs[0];
  assert.strictEqual(r.kind, 'count'); assert.match(r.label, /from 0.1 to 8/);
  const s = CORE.questionsFor({ name: 'shuffle', args: '[group|colors|numbers|favs] [subtle|normal|bold|wild|0.5] [seed N]' });
  assert.deepStrictEqual(kinds(s), ['text?', 'choice?', 'count?']);
  assert.strictEqual(s.qs[2].prefix, 'seed');
  const f = CORE.buildFlow([{ name: 'shuffle', ...s }]);
  const run = f.nodes.find((n) => n.id === 's1run');
  assert.strictEqual(CORE.fillLine(run.cmd, { s1q1: 'colors', s1q2: '', s1q3: '7' }), '/shuffle colors seed 7');
  assert.strictEqual(CORE.fillLine(run.cmd, { s1q1: '', s1q2: 'wild', s1q3: '' }), '/shuffle wild');
});
ok('choices: literal values, a "…" lets you type one too, forms with their own follow-ups', () => {
  const size = CORE.questionsFor({ name: 'size', args: '<9:16|16:9|4:5|1:1|fit|…>' }).qs[0];
  assert.strictEqual(size.kind, 'choice'); assert(size.free && size.required);
  const live = CORE.questionsFor({ name: 'live', args: '[system|mic|off] | gain <auto|0.5–4> | latency <ms> | calibrate' }).qs[0];
  assert(live.form);
  assert.deepStrictEqual(live.options.map((o) => o.value), ['system', 'mic', 'off', 'gain', 'latency', 'calibrate']);
  assert.strictEqual(live.options.find((o) => o.value === 'gain').then[0].kind, 'count');
  const look = CORE.questionsFor({ name: 'look', args: '[reset | status | save <name> | load <name> | delete <name>]' }).qs[0];
  assert.deepStrictEqual(look.options.map((o) => o.value), ['reset', 'status', 'save', 'load', 'delete']);
  assert.strictEqual(look.options[2].then[0].kind, 'text');
  // the form's follow-up is its own step, written after the choice
  const f = CORE.buildFlow([{ name: 'look', qs: [look], repeat: false }]);
  const ch = f.nodes.find((n) => n.id === 's1q1');
  const save = ch.options.find((o) => o.value === 'save');
  assert(save.next && f.nodes.find((n) => n.id === save.next).kind === 'text');
  assert.strictEqual(CORE.fillLine(f.nodes.find((n) => n.id === 's1run').cmd, { s1q1: 'save', [save.next]: 'Drop' }), '/look save Drop');
});
ok('a command: </command> and the explicit /every questions', () => {
  assert.deepStrictEqual(kinds(CORE.questionsFor({ name: 'run', args: '</cmd one ; /cmd two …>' })), ['command!']);
  assert.deepStrictEqual(kinds(qOf('every')), ['count!', 'command!']);
});
ok('explicit questions where the args say too little (≈ 60 of them)', () => {
  assert(Object.keys(DATA.Q).length >= 60);
  for (const [name, q] of Object.entries(DATA.Q)) if (name !== 'commands') assert(byName.has(name), `/${name} exists`);
  assert.strictEqual(qOf('size').qs[0].title, 'Which frame size?');
  assert.strictEqual(qOf('still').repeat, 'every');
  assert.strictEqual(qOf('freeze').repeat, false);
  assert(Object.keys(DATA.DESC).length >= 150, `${Object.keys(DATA.DESC).length} clear one-liners`);
  for (const [n, d] of Object.entries(DATA.DESC)) assert(/^[A-Z].*\.$/.test(d) && d.length < 160, `/${n}: one sentence (${d})`);
  assert(Object.keys(DATA.ABOUT).length >= 38);
});
ok('every command gets a preview scene', () => {
  const seen = new Set();
  for (const d of REG) { const p = DATA.previewOf(d); assert(p.kind && p.color && p.icon); seen.add(p.kind); }
  assert(seen.size >= 20, `${seen.size} kinds of scene`);
  assert.strictEqual(DATA.sceneFor({ name: 'size' }), 'frame');
  assert.strictEqual(DATA.sceneFor({ name: 'rec' }), 'rec');
  assert.strictEqual(DATA.sceneFor({ name: 'board-layout' }), 'grid');
  assert.strictEqual(DATA.sceneFor({ name: 'astra' }), 'chat');
});

// ---- the guided run on the real flow engine ----
function engine() {
  delete require.cache[require.resolve(path.join(ROOT, 'flows.js'))];
  const F = require(path.join(ROOT, 'flows.js'));
  const log = [];
  const stage = (name) => ({ name, ...qOf(name) });
  F.configure({
    now: (() => { let t = 1000; return () => (t += 1); })(),
    load: async (k, d) => d, save: async () => {}, sleep: async () => {},
    cmdInfo: (name) => (byName.get(name) ? { name, args: byName.get(name).args } : null),
    runCommand: async (line) => { log.push(line); return /^\/calc/.test(line) ? '42' : `ran ${line}`; },
    ask: async () => 'ok',
    lineOf: (node, run) => (run.flow.guided && node.refill ? CORE.fillLine(node.cmd, run.vars) : undefined),
    grow: (run, node, value) => {
      if (!(node.q?.kind === 'command' && node.q.pick)) return false;
      const name = String(value).replace(/^\//, '').split(/\s+/)[0];
      if (!byName.has(name)) throw new Error(`No command /${name}`);
      const f = CORE.buildFlow([...run.flow.commands.slice(0, node.q.pick), name].map(stage));
      run.flow.nodes = f.nodes; run.flow.commands = f.commands;
      return true;
    },
  });
  return { F, log, stage };
}
ok('a run: skip the optional, yes / no, 2 times, then a chained command fed by the result, the summary, run', async () => {
  const { F, log, stage } = engine();
  const r = await F.start(CORE.buildFlow([stage('still')]), { chatId: 'c1' });
  const at = () => F.waiting(r)?.node.id;
  assert.strictEqual(at(), 's1q1');
  assert.deepStrictEqual(CORE.progress(r, F.nodeOf), { at: 1, total: 5, done: 0 });
  await F.answer(r.id, ''); // Skip
  assert.strictEqual(at(), 's1q2');
  await F.answer(r.id, ''); // No (don't copy)
  assert.strictEqual(F.waiting(r).title, 'How many times?');
  await F.answer(r.id, '/repeat 2');
  assert.strictEqual(F.waiting(r).title, 'Then…');
  await F.answer(r.id, 'more');
  await assert.rejects(() => F.answer(r.id, 'nope-not-a-command'), /No command/);
  await F.answer(r.id, 'calc');
  assert.deepStrictEqual(r.flow.commands, ['still', 'calc']);
  assert.match(F.waiting(r).title, /expression/);
  await assert.rejects(() => F.answer(r.id, '  '), /needs some text/); // needed
  await F.answer(r.id, '6*7');
  await F.answer(r.id, 'more');
  await F.answer(r.id, 'echo');
  await F.answer(r.id, '{last}'); // the result of the step before
  await F.answer(r.id, 'done');
  assert.strictEqual(F.waiting(r).node.id, 'summary');
  const plan = CORE.planLines(r.flow, r.vars);
  assert.deepStrictEqual(plan.map((p) => [p.line, p.times, p.feeds]), [['/still', '2 times', false], ['/calc 6*7', '', false], ['/echo ‹the result before›', '', true]]);
  await F.answer(r.id, 'run');
  assert.strictEqual(r.status, 'done');
  assert.deepStrictEqual(log, ['/repeat 2 /still', '/calc 6*7', '/echo 42']);
  // again: the same answers, the same lines
  const again = await F.rerun(r.id);
  assert.strictEqual(again.status, 'done');
  assert.deepStrictEqual(log.slice(3), ['/repeat 2 /still', '/calc 6*7', '/echo 42']);
  // a changed answer: the chained command can change too (the steps regrow)
  const pickIdx = again.steps.findIndex((e) => e.node === 's2pick');
  const b = await F.branch(again.id, pickIdx, 'present');
  assert.deepStrictEqual(b.flow.commands, ['still', 'present']);
  assert.strictEqual(F.waiting(b).title, 'Then…');
});
ok('not now: nothing runs', async () => {
  const { F, log, stage } = engine();
  const r = await F.start(CORE.buildFlow([stage('present')]), {});
  assert.strictEqual(F.waiting(r).node.id, 's1then');
  await F.answer(r.id, 'done');
  await F.answer(r.id, 'no');
  assert.strictEqual(r.status, 'done');
  assert.deepStrictEqual(log, []);
  assert.match(r.result, /Nothing ran/);
});
ok('a form with "type it": the words stand for the choice', async () => {
  const { F, log, stage } = engine();
  const r = await F.start(CORE.buildFlow([stage('size')]), {});
  await F.answer(r.id, '21:9');
  await F.answer(r.id, 'done'); await F.answer(r.id, 'run');
  assert.deepStrictEqual(log, ['/size 21:9']);
  const live = await F.start(CORE.buildFlow([{ name: 'x', ...CORE.questionsFor({ name: 'x', args: '<answer> | resume | refine <what>' }) }]), {});
  await F.answer(live.id, '__type'); await F.answer(live.id, 'zz top');
  await F.answer(live.id, 'done'); await F.answer(live.id, 'run');
  assert.deepStrictEqual(log.slice(1), ['/x zz top']);
  const rf = await F.start(CORE.buildFlow([{ name: 'x', ...CORE.questionsFor({ name: 'x', args: '<answer> | resume | refine <what>' }) }]), {});
  await F.answer(rf.id, 'refine'); await F.answer(rf.id, 'warmer');
  await F.answer(rf.id, 'done'); await F.answer(rf.id, 'run');
  assert.deepStrictEqual(log.slice(2), ['/x refine warmer']);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`✓ ${name}`); } catch (err) { failed += 1; console.log(`✖ ${name}\n  ${err.stack?.split('\n').slice(0, 4).join('\n  ')}`); }
  }
  console.log(`${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
