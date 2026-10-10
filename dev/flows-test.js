// Node tests for the flow engine (flows.js) and the flows made from the commands (flows-data.js): running a flow
// (choices, text, actions, an AI step on a fake engine, checks), hung steps and "pick up here" after a reload,
// running again with the same answers, branching from a step, refining a result, flows written as JSON (what a chat
// makes for "make a flow for X") and every command landing in a flow.
//   node dev/flows-test.js
const assert = require('assert');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let n = 0; let failed = 0;
const tests = [];
const ok = (name, fn) => tests.push([name, fn]);

// a fresh engine (like a restart of Hearth) on a fake disk (pass the same one to "restart")
function engine(over = {}, disk = {}) {
  delete require.cache[require.resolve(path.join(ROOT, 'flows.js'))];
  const F = require(path.join(ROOT, 'flows.js'));
  let clock = 1000;
  const log = { cmds: [], asks: [] };
  F.configure({
    now: () => clock,
    load: async (k, d) => (disk[k] ? JSON.parse(disk[k]) : d),
    save: async (k, v) => { disk[k] = JSON.stringify(v); },
    sleep: async (ms) => { clock += ms; },
    cmdInfo: (name) => ({ doctor: { name: 'doctor', args: '[--run]' }, shuffle: { name: 'shuffle', args: '[group]' }, present: { name: 'present', args: '' }, theme: { name: 'theme', args: '<name>' }, say: { name: 'say', args: '<text>' } }[name] || null),
    runCommand: async (line) => { log.cmds.push(line); return `ran ${line}`; },
    ask: async ({ engine: e, prompt }) => { log.asks.push({ e, prompt }); return `${e} says #${log.asks.length}`; },
    ...over,
  });
  return { F, log, tick: (ms) => { clock += ms; }, setClock: (t) => { clock = t; } };
}
const FD = require(path.join(ROOT, 'flows-data.js'));

const SIMPLE = {
  id: 'simple', name: 'Simple', nodes: [
    { id: 'q', kind: 'choice', title: 'Go?', var: 'go', options: ['yes', 'no'], next: 'name' },
    { id: 'name', kind: 'text', title: 'Your name', var: 'who', next: 'act' },
    { id: 'act', kind: 'action', cmd: '/say hi {who} ({go})', var: 'said', next: 'ai' },
    { id: 'ai', kind: 'ai', engine: 'astra', prompt: 'Write a line for {who}', var: 'line', next: 'end' },
    { id: 'end', kind: 'result', text: '{line}' },
  ],
};

ok('a flow runs: a choice, words, a command, an AI step on a fake engine, a result', async () => {
  const { F, log } = engine();
  F.define(SIMPLE);
  const r = await F.start('simple', { chatId: 'c1' });
  assert.strictEqual(r.status, 'waiting-you');
  assert.strictEqual(F.waiting(r).title, 'Go?');
  assert.deepStrictEqual(F.waiting(r).options.map((o) => o.label), ['Yes', 'No']);
  await F.answer(r.id, 'Yes');
  assert.strictEqual(F.waiting(r).kind, 'text');
  await assert.rejects(() => F.answer(r.id, '   '), /needs some text/);
  await F.answer(r.id, 'Quentin');
  assert.strictEqual(r.status, 'done');
  assert.deepStrictEqual(log.cmds, ['/say hi Quentin (yes)']);
  assert.strictEqual(log.asks[0].e, 'astra');
  assert.strictEqual(log.asks[0].prompt, 'Write a line for Quentin');
  assert.strictEqual(r.result, 'astra says #1');
  assert.deepStrictEqual(r.steps.map((s) => `${s.node}:${s.status}`), ['q:done', 'name:done', 'act:done', 'ai:done', 'end:done']);
  assert(r.steps.every((s) => s.started && s.ended), 'every step has its times');
  assert.strictEqual(r.steps[0].choice, 'Yes');
  assert.strictEqual(r.steps[2].output, 'ran /say hi Quentin (yes)');
  assert(/Simple.*done.*result: astra says #1/.test(F.line(r)), F.line(r));
});

ok('choices by number or label; a wrong one is refused', async () => {
  const { F } = engine();
  F.define(SIMPLE);
  const r = await F.start('simple');
  await assert.rejects(() => F.answer(r.id, 'maybe'), /isn't one of/);
  await F.answer(r.id, '2');
  assert.strictEqual(r.vars.go, 'no');
});

ok('runs are saved and come back after a restart; a step running at the time is hung, "pick up here" continues', async () => {
  let release;
  const disk = {};
  const a = engine({ runCommand: () => new Promise((res) => { release = res; }) }, disk);
  a.F.define(SIMPLE);
  const r = await a.F.start('simple');
  await a.F.answer(r.id, 'yes');
  const p = a.F.answer(r.id, 'Ada'); // the command never answers: Hearth "closes" during it
  await new Promise((res) => setImmediate(res));
  assert.strictEqual(r.status, 'running');
  await a.F.persist();
  // restart
  const b = engine({}, disk);
  b.F.define(SIMPLE);
  assert.strictEqual(await b.F.restore(), 1);
  const back = b.F.run(r.id);
  assert.strictEqual(back.status, 'hung');
  assert(/closed/.test(back.why));
  assert.strictEqual(b.F.waiting(back), null);
  await b.F.resume(back.id);
  assert.strictEqual(back.status, 'done');
  assert.deepStrictEqual(back.steps.map((s) => s.status), ['done', 'done', 'retried', 'done', 'done', 'done']);
  assert.strictEqual(back.resumed, 1);
  release?.('late'); await p; // the old process's late answer changes nothing
});

ok('a step that runs too long is hung; its late answer is ignored; resume runs it again', async () => {
  let calls = 0; const pending = [];
  const { F, tick } = engine({ ask: () => { calls += 1; return calls === 1 ? new Promise((res) => pending.push(res)) : Promise.resolve('fresh answer'); } });
  F.define(SIMPLE);
  const r = await F.start('simple');
  await F.answer(r.id, 'yes');
  const p = F.answer(r.id, 'Bo');
  await new Promise((res) => setImmediate(res));
  assert.strictEqual(r.status, 'waiting-ai');
  tick(F.LIMIT.ai + 1000);
  assert.strictEqual(F.checkHung().length, 1);
  assert.strictEqual(r.status, 'hung');
  pending[0]('too late'); await p;
  assert.strictEqual(r.status, 'hung', 'a late answer does not move a hung run');
  await F.resume(r.id);
  assert.strictEqual(r.status, 'done');
  assert.strictEqual(r.result, 'fresh answer');
});

ok('an engine that fails: the run is hung with the reason, resume picks it up', async () => {
  let fail = true;
  const { F } = engine({ ask: async () => { if (fail) throw new Error('Claude stopped'); return 'ok now'; } });
  F.define(SIMPLE);
  const r = await F.start('simple');
  await F.answer(r.id, 'yes'); await F.answer(r.id, 'Cy');
  assert.strictEqual(r.status, 'hung');
  assert(/Claude stopped/.test(r.why));
  fail = false;
  await F.resume(r.id);
  assert.strictEqual(r.result, 'ok now');
});

ok('run it again: the same answers, a new result (the AI is asked the same prompt again)', async () => {
  const { F, log } = engine();
  F.define(SIMPLE);
  const r = await F.start('simple');
  await F.answer(r.id, 'yes'); await F.answer(r.id, 'Dee');
  const again = await F.rerun(r.id);
  assert.strictEqual(again.status, 'done');
  assert.notStrictEqual(again.id, r.id);
  assert.strictEqual(log.asks.length, 2);
  assert.strictEqual(log.asks[0].prompt, log.asks[1].prompt);
  assert.notStrictEqual(again.result, r.result);
  assert(again.steps.filter((s) => s.replayed).length === 2, 'the two answers were replayed');
  assert.deepStrictEqual(again.parent, { run: r.id, step: 0, kind: 'again' });
  assert(r.branches.includes(again.id));
});

ok('branch: change an answer at a step and continue; the old run keeps its history', async () => {
  const { F, log } = engine();
  F.define(SIMPLE);
  const r = await F.start('simple');
  await F.answer(r.id, 'yes'); await F.answer(r.id, 'Eve');
  const before = JSON.stringify(r.steps);
  const b = await F.branch(r.id, 1, 'Finn');
  assert.strictEqual(b.status, 'done');
  assert.strictEqual(JSON.stringify(r.steps), before);
  assert.strictEqual(b.steps[0].copied, true);
  assert.strictEqual(b.vars.who, 'Finn');
  assert.strictEqual(log.cmds.at(-1), '/say hi Finn (yes)');
  assert.deepStrictEqual(b.parent, { run: r.id, step: 1, kind: 'branch' });
  // branch at the first choice without a value: it waits there, the later answer shows as a hint
  const c = await F.branch(r.id, 0);
  assert.strictEqual(c.status, 'waiting-you');
  await F.answer(c.id, 'no');
  assert.strictEqual(F.waiting(c).last, 'Eve');
});

ok('refine: keep the output, say what to change, the AI redoes it (history kept)', async () => {
  const { F, log } = engine();
  F.define(SIMPLE);
  const r = await F.start('simple');
  await F.answer(r.id, 'yes'); await F.answer(r.id, 'Gus');
  await F.refine(r.id);
  assert.strictEqual(r.status, 'waiting-you');
  assert.strictEqual(F.waiting(r).title, 'What should change?');
  await F.answer(r.id, 'shorter');
  assert.strictEqual(r.status, 'done');
  assert(/astra says #1/.test(log.asks[1].prompt) && /shorter/.test(log.asks[1].prompt), log.asks[1].prompt);
  assert.strictEqual(log.asks[1].e, 'astra', 'the flow\'s own engine refines');
  assert.strictEqual(r.result, 'astra says #2');
  assert.strictEqual(r.steps.length, 8);
  await F.refine(r.id, 'warmer'); // with the words given: no question
  assert.strictEqual(r.status, 'done');
  assert(/warmer/.test(log.asks[2].prompt));
  assert.strictEqual(r.refines, 2);
});

ok('checks: polled until the output matches; a check that asks you; one that never comes is hung', async () => {
  let k = 0;
  const { F } = engine({ runCommand: async () => { k += 1; return k >= 3 ? 'render ✓' : 'working'; } });
  F.define({ id: 'c', name: 'C', nodes: [{ id: 'w', kind: 'check', cmd: '/status', match: 'render ✓', every: 1000, timeout: 60000, next: 'a' }, { id: 'a', kind: 'check', ask: 'Done?', next: 'e' }, { id: 'e', kind: 'result', text: 'ok' }] });
  const r = await F.start('c');
  assert.strictEqual(r.steps[0].tries, 3);
  assert.strictEqual(F.waiting(r).kind, 'check');
  await assert.rejects(() => F.answer(r.id, 'no'), /Waiting/);
  await F.answer(r.id, 'yes');
  assert.strictEqual(r.status, 'done');
  const { F: F2 } = engine({ runCommand: async () => 'nope' });
  F2.define({ id: 'c', name: 'C', nodes: [{ id: 'w', kind: 'check', cmd: '/status', match: 'yes', every: 1000, timeout: 5000, next: 'e' }, { id: 'e', kind: 'result', text: 'ok' }] });
  const r2 = await F2.start('c');
  assert.strictEqual(r2.status, 'hung');
  assert(/not there/.test(r2.why));
});

ok('skipIf, options from a command, a guessed answer, a text step skipped for a command without arguments', async () => {
  const { F } = engine({ cmdOptions: async (name) => (name === 'theme' ? [{ value: 'molten' }, { value: 'chrome' }] : []) });
  F.define({ id: 's', name: 'S', nodes: [
    { id: 'm', kind: 'choice', var: 'mode', options: [{ label: 'Duo', value: 'duo' }, { label: 'Opinion', value: 'opinion', set: { notopic: '1' } }], next: 't' },
    { id: 't', kind: 'text', var: 'topic', skipIf: 'notopic', next: 'th' },
    { id: 'th', kind: 'choice', var: 'theme', optionsFrom: '/theme', options: [{ label: 'Next', value: 'next' }], next: 'cmd' },
    { id: 'cmd', kind: 'choice', var: 'cmd', options: ['present', 'shuffle'], next: 'args' },
    { id: 'args', kind: 'text', var: 'args', argsOf: 'cmd', optional: true, next: 'go' },
    { id: 'go', kind: 'action', cmd: '/{cmd} {args}', var: 'report', next: 'ok' },
    { id: 'ok', kind: 'choice', var: 'ok', options: ['yes', 'no'], guess: { var: 'report', match: 'ran /present', value: 'yes', else: 'no' } }] });
  const r = await F.start('s');
  await F.answer(r.id, 'opinion');
  assert.strictEqual(r.steps[1].status, 'skipped');
  assert.deepStrictEqual(F.waiting(r).options.map((o) => o.value), ['next', 'molten', 'chrome']);
  await F.answer(r.id, 'molten');
  await F.answer(r.id, 'present');
  assert.strictEqual(r.steps.find((s) => s.node === 'args').status, 'skipped', '/present takes no arguments');
  assert.strictEqual(F.waiting(r).guess, 'yes');
  const r2 = await F.start('s');
  await F.answer(r2.id, 'duo'); await F.answer(r2.id, 'a topic'); await F.answer(r2.id, 'next'); await F.answer(r2.id, 'shuffle');
  assert.strictEqual(F.waiting(r2).hint, '/shuffle [group]');
  await F.answer(r2.id, 'colors');
  assert.strictEqual(F.waiting(r2).guess, 'no');
});

ok('stop, and resume after a stop', async () => {
  let release;
  const { F } = engine({ runCommand: () => new Promise((res) => { release = res; }) });
  F.define(SIMPLE);
  const r = await F.start('simple');
  await F.answer(r.id, 'yes');
  const p = F.answer(r.id, 'Hal');
  await new Promise((res) => setImmediate(res));
  F.stop(r.id);
  assert.strictEqual(r.status, 'stopped');
  release('x'); await p;
  assert.strictEqual(r.status, 'stopped');
  F.configure({ runCommand: async () => 'again' });
  await F.resume(r.id);
  assert.strictEqual(r.status, 'done');
});

ok('JSON authoring: a chat\'s reply with a ```json flow is read and checked', () => {
  const { F } = engine();
  const reply = 'Here is your flow:\n```json\n{"id":"shuffle-pick","name":"Shuffle until I like it","nodes":[{"id":"s","kind":"action","cmd":"/shuffle","next":"q"},{"id":"q","kind":"choice","title":"Keep?","options":[{"label":"Yes","value":"yes","next":"e"},{"label":"Again","value":"no","next":"s"}]},{"id":"e","kind":"result","text":"{last}"}]}\n```\nEnjoy.';
  const v = F.fromText(reply);
  assert(v.ok, v.errors.join('; '));
  assert.strictEqual(v.flow.start, 's');
  assert.deepStrictEqual(v.warnings, []);
  const bad = F.validate({ id: 'b', nodes: [{ id: 'a', kind: 'choice', next: 'zz' }, { id: 'a', kind: 'nope' }, { id: 'c', kind: 'action', cmd: 'shuffle' }, { id: 'd', kind: 'ai' }, { id: 'e', kind: 'action', cmd: '/no-such-cmd' }] });
  assert(!bad.ok);
  for (const re of [/needs options/, /leads to "zz"/, /Two steps/, /unknown kind/, /runs a \/command/, /needs a prompt/]) assert(bad.errors.some((e) => re.test(e)), `${re} in ${bad.errors}`);
  assert(bad.warnings.some((w) => /no-such-cmd/.test(w)));
  assert(!F.fromText('no json here').ok);
});

ok('the hand-written journeys are valid flows (Doctor, Make a video, Record, Lab scene, Sequence, Board, Export, Astra & Claude, Look, Memory)', () => {
  const { F } = engine({ cmdInfo: (name) => ({ name, args: '' }) });
  assert.deepStrictEqual(FD.JOURNEYS.map((j) => j.id), ['doctor', 'make-video', 'record', 'lab-scene', 'sequence', 'board', 'export', 'astra-claude', 'look', 'memory']);
  for (const j of FD.JOURNEYS) { const v = F.validate(j); assert(v.ok, `${j.id}: ${v.errors.join('; ')}`); assert.deepStrictEqual(v.warnings, [], `${j.id}: ${v.warnings}`); }
});

ok('Doctor like a user: the card is fine → the guess is Yes → test both → result', async () => {
  const { F, log } = engine({ cmdInfo: (name) => ({ name, args: '' }), runCommand: async (line) => { log2.push(line); return line === '/doctor' ? '**Doctor** · both engines can work' : 'Claude OK 1.2 s · Astra OK 2.0 s'; } });
  const log2 = [];
  F.define(FD.JOURNEYS[0]);
  const r = await F.start('doctor');
  assert.strictEqual(F.waiting(r).guess, 'yes');
  await F.answer(r.id, F.waiting(r).guess);
  await F.answer(r.id, 'yes');
  assert.strictEqual(r.status, 'done');
  assert.deepStrictEqual(log2, ['/doctor', '/doctor --run']);
  assert(/Claude OK/.test(r.result));
  assert.strictEqual(log.asks.length, 0);
});

ok('Doctor when Codex is signed out: sign in, confirm, check again, fixed', async () => {
  let n2 = 0; const cmds = [];
  const { F } = engine({ cmdInfo: (name) => ({ name, args: '' }), runCommand: async (line) => { cmds.push(line); if (line === '/doctor') { n2 += 1; return n2 === 1 ? 'Doctor · 1 thing to fix: Codex is signed out' : 'Doctor · both engines can work'; } return 'ok'; } });
  F.define(FD.JOURNEYS[0]);
  const r = await F.start('doctor');
  assert.strictEqual(F.waiting(r).guess, 'no');
  for (const a of ['no', 'codex', 'login', 'yes']) await F.answer(r.id, a);
  assert.strictEqual(F.waiting(r).guess, 'yes');
  await F.answer(r.id, 'yes'); await F.answer(r.id, 'no');
  assert.strictEqual(r.status, 'done');
  assert.deepStrictEqual(cmds, ['/doctor', '/astra-login', '/doctor']);
});

ok('every command lands in exactly one area flow; big areas are split by what the commands do', () => {
  const { F } = engine({ cmdInfo: (name) => ({ name, args: '' }) });
  const defs = [];
  const areas = { 'Three.js Lab': 159, Video: 162, Board: 95, Chat: 35, Meter: 52, Kit: 12, Mystery: 3, 'Shader nodes': 16, Nodes: 19 };
  const names = ['tap', 'bpm', 'shuffle', 'save-look', 'layer-add', 'footage', 'kinetic', 'sequence', 'clip-fade', 'video-flow-run', 'board-add', 'board-align', 'new', 'export-usage'];
  const VERB = ['add', 'set', 'align', 'export', 'list', 'undo', 'zap'];
  for (const [area, count] of Object.entries(areas)) for (let i = 0; i < count; i++) defs.push({ name: `${area.replace(/\W/g, '').toLowerCase()}-${VERB[i % VERB.length]}-${i}`, area, desc: '', args: i % 2 ? '<x>' : '' });
  names.forEach((nm, i) => defs.push({ name: nm, area: i < 8 ? 'Three.js Lab' : i < 10 ? 'Video' : i < 12 ? 'Board' : i < 13 ? 'Chat' : 'Meter', desc: '' }));
  const flows = FD.generate(defs);
  const seen = new Map();
  for (const f of flows) for (const c of f.commands) { assert(!seen.has(c), `${c} in two flows`); seen.set(c, f.id); }
  assert.strictEqual(seen.size, defs.length);
  assert.strictEqual(seen.get('tap'), 'all-lab-music');
  assert.strictEqual(seen.get('kinetic'), 'all-lab-motion');
  assert.strictEqual(seen.get('clip-fade'), 'all-video-editor');
  assert.strictEqual(seen.get('mystery-add-0'), 'all-other');
  assert.strictEqual(seen.get('shadernodes-set-1'), 'all-nodes');
  for (const f of flows) {
    const v = F.validate(f);
    assert(v.ok, `${f.id}: ${v.errors.join('; ')}`);
    for (const nd of f.nodes) if (nd.kind === 'choice') assert(nd.options.length <= 24, `${f.id} ${nd.id}: ${nd.options.length} options`);
  }
  const big = flows.find((f) => f.id === 'all-board');
  assert.strictEqual(big.nodes[0].title, 'What do you want to do?');
  assert(big.nodes[0].options.length >= 2 && big.nodes[0].options.length <= 12, big.nodes[0].options.length);
  // one kind only (every name starts the same): split in parts, never one huge choice
  const same = FD.commandFlow({ id: 'all-s', name: 'S', area: 'S' }, Array.from({ length: 60 }, (_, i) => ({ name: `board-${i}`, area: 'S', desc: '' })));
  assert(F.validate(same).ok && same.nodes.filter((x) => x.kind === 'choice').every((x) => x.options.length <= 24));
  assert.deepStrictEqual(FD.journeysWith('doctor'), ['doctor']);
  assert(FD.journeysWith('shuffle').includes('lab-scene'));
});

ok('a generated flow runs a command with its arguments, then offers another', async () => {
  const { F, log } = engine();
  const f = FD.commandFlow({ id: 'all-x', name: 'X', area: 'X' }, [{ name: 'shuffle', area: 'X', args: '[group]', desc: '' }, { name: 'present', area: 'X', args: '', desc: '' }]);
  F.define(f);
  const r = await F.start('all-x');
  await F.answer(r.id, 'shuffle');
  await F.answer(r.id, 'colors bold');
  assert.deepStrictEqual(log.cmds, ['/shuffle colors bold']);
  assert.strictEqual(F.waiting(r).title, 'Another one?');
  await F.answer(r.id, 'yes'); await F.answer(r.id, 'present');
  assert.deepStrictEqual(log.cmds, ['/shuffle colors bold', '/present']);
  await F.answer(r.id, 'no');
  assert.strictEqual(r.status, 'done');
  assert.strictEqual(r.result, 'ran /present');
});

ok('principal commands: 25–40, no repeats', () => {
  assert(FD.PRINCIPAL.length >= 25 && FD.PRINCIPAL.length <= 40, FD.PRINCIPAL.length);
  assert.strictEqual(new Set(FD.PRINCIPAL).size, FD.PRINCIPAL.length);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); n += 1; console.log(`✓ ${name}`); } catch (err) { failed += 1; console.log(`✖ ${name}: ${err.message.replace(/\s+/g, ' ').slice(0, 400)}`); }
  }
  console.log(`${n}/${tests.length} passed`);
  if (failed) process.exitCode = 1;
})();
