// Unit tests for progress.js (the one progress model): node dev/progress-test.js
// Monotonic bars, learning per kind, no 99 % stall (almost there / waiting on the agent), measured vs estimated, ETA
// only when confident, parents as the mean of their children, hung after a silence, done / failed / drop.
const assert = require('assert');
const path = require('path');
const P = require(path.join(__dirname, '..', 'progress.js'));

let T = 1e6;
let saved = null;
P.configure({ now: () => T, load: () => null, save: (h) => { saved = JSON.parse(JSON.stringify(h)); } });
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const step = (ms) => { T += ms; P.tick(T); };
const reset = () => { for (const it of [...P._test.items.values()]) P.drop(it.key); P.forget(); };

test('an estimated bar rises, never goes backwards, stops at 95 % and says so', () => {
  reset();
  P.set('a', { title: 'reply', kind: 'reply:x', expect: { ms: 10000 } });
  let last = -1; const seen = [];
  for (let i = 0; i < 200; i++) { step(250); const it = P.get('a'); assert(it.shown >= last, `went back at ${i}: ${it.shown} < ${last}`); last = it.shown; seen.push(it.state); }
  const it = P.get('a');
  assert(it.estimated, 'marked as an estimate');
  assert(it.shown <= P.CAP_EST + 1e-9, `capped: ${it.shown}`);
  assert(seen.includes('almost'), 'almost there past the usual time');
  assert(seen.includes('late'), 'waiting on the agent well past it');
  assert(/waiting on the agent/.test(P.words({ ...it, key: 'chat:1' })), P.words(it));
  assert(/^about \d+ %/.test(P.words(it)), P.words(it));
});

test('it never shows 99 % for an estimate, even after an hour', () => {
  reset();
  P.set('b', { kind: 'render', signals: { tools: 0 } });
  for (let i = 0; i < 60; i++) { step(60000); P.set('b', { signals: { tools: 0 } }); }
  const it = P.get('b');
  assert(it.shown < 96, `${it.shown}`);
  assert(['late', 'almost'].includes(it.state), it.state);
});

test('measured bars show their number, are not marked estimated, and never go back', () => {
  reset();
  P.set('m', { pct: 10, label: 'frame 10 / 100' });
  step(1000); P.set('m', { pct: 30 });
  step(1000); P.set('m', { pct: 25 }); // a noisy source going back
  const it = P.get('m');
  assert(!it.estimated && it.measured, 'measured');
  assert.strictEqual(Math.round(it.shown), 30);
  assert(/^30 %/.test(P.words(it)), P.words(it));
});

test('a measured ETA comes from a steady rate; none before it is steady', () => {
  reset();
  P.set('e', { pct: 0 });
  assert.strictEqual(P.get('e').etaShown, null);
  for (let i = 1; i <= 5; i++) { T += 1000; P.set('e', { pct: i * 10 }); }
  const eta = P.get('e').etaShown;
  assert(eta > 4 && eta < 6, `about 5 s left: ${eta}`);
});

test('it learns per kind: a slow kind and a fast kind get their own expectations', () => {
  reset();
  for (let i = 0; i < 4; i++) { P.set(`f${i}`, { kind: 'reply:fast' }); step(2000); P.done(`f${i}`); }
  for (let i = 0; i < 4; i++) { P.set(`s${i}`, { kind: 'reply:slow' }); step(60000); P.done(`s${i}`); }
  const ef = P._test.expect('reply:fast'); const es = P._test.expect('reply:slow');
  assert(Math.abs(ef.ms - 2000) < 300, `fast ${ef.ms}`);
  assert(Math.abs(es.ms - 60000) < 6000, `slow ${es.ms}`);
  // the same elapsed time reads very differently
  P.set('qf', { kind: 'reply:fast' }); P.set('qs', { kind: 'reply:slow' });
  step(1500);
  assert(P.get('qf').shown > 50 && P.get('qs').shown < 10, `${P.get('qf').shown} vs ${P.get('qs').shown}`);
  // a never-seen specific kind falls back to its learned prefix
  assert(Math.abs(P._test.expect('reply:slow:new-agent').ms - 60000) < 6000);
  assert.strictEqual(P._test.hist()['reply:slow'].n, 4, 'kept for next time');
  // confident after 3 steady runs: an ETA shows
  P.set('qs2', { kind: 'reply:slow' }); step(10000);
  assert(P.get('qs2').etaShown > 30, `eta ${P.get('qs2').etaShown}`);
});

test('a kind with one run is blended with its default; failed runs teach nothing', () => {
  reset();
  P.set('x', { kind: 'snap' }); step(100000); P.done('x', { ok: false });
  assert.strictEqual(P._test.expect('snap').n, 0);
  P.set('y', { kind: 'snap' }); step(16000); P.done('y');
  const e = P._test.expect('snap');
  assert(e.ms > 8000 && e.ms < 16000, `${e.ms}`);
});

test('signals move an estimate: tool calls, text streamed, plan steps, the agent\'s own number', () => {
  reset();
  for (let i = 0; i < 3; i++) { P.set(`h${i}`, { kind: 'reply:k', signals: { tools: 4, chars: 1000, writeAtMs: 30000 } }); step(40000); P.done(`h${i}`); }
  P.set('r', { kind: 'reply:k', signals: { tools: 0 } }); step(2000);
  const a = P.get('r').shown;
  P.set('r', { signals: { tools: 4 } }); step(250);
  const b = P.get('r').shown;
  assert(b > a + 15, `tools: ${a} → ${b}`);
  P.set('r', { signals: { chars: 900 } }); step(250);
  const c = P.get('r').shown;
  assert(c > b + 10, `writing: ${b} → ${c}`);
  P.set('p', { kind: 'reply:k', signals: { steps: [3, 4] } }); step(250);
  assert(P.get('p').shown > 45, `steps ${P.get('p').shown}`);
  P.set('g', { kind: 'reply:k', signals: { agentPct: 60 } }); step(250);
  assert(P.get('g').shown > 40 && P.get('g').shown <= 95, `agent ${P.get('g').shown}`);
  assert(P.get('g').estimated, 'still an estimate');
});

test('a parent is the weighted mean of its children and finishes with them', () => {
  reset();
  P.set('c1', { pct: 50, parent: 'comp' });
  P.set('c2', { pct: 0, parent: 'comp' });
  step(250);
  assert.strictEqual(Math.round(P.get('comp').shown), 25);
  assert(!P.get('comp').estimated);
  P.set('c3', { parent: 'comp', kind: 'reply' }); step(250);
  assert(P.get('comp').estimated, 'estimated when a child is');
  assert(P.list().every((it) => !it.parent), 'children are listed under their parent');
  P.done('c1'); P.done('c2'); P.done('c3');
  assert.strictEqual(P.get('comp').state, 'done', 'the parent finished with its children');
});

test('done fills to 100 and fades out; failed lingers longer; drop removes at once', () => {
  reset();
  const seen = [];
  const off = P.on((it, what) => seen.push(`${it.key}:${what}`));
  P.set('d', { pct: 40 }); P.done('d');
  assert.strictEqual(P.get('d').shown, 100);
  step(P.LINGER.done + 100);
  assert.strictEqual(P.get('d'), null);
  P.set('f', { pct: 40 }); P.done('f', { ok: false }); step(P.LINGER.done + 100);
  assert(P.get('f') && P.get('f').state === 'failed');
  P.set('z', {}); P.drop('z');
  assert.strictEqual(P.get('z'), null);
  off();
  assert(seen.includes('d:done') && seen.includes('d:remove') && seen.includes('z:remove'));
});

test('hung after a long silence, back to running on news; waiting for you is never hung', () => {
  reset();
  P.set('h', { kind: 'reply', signals: { tools: 1 }, hungMs: 60000 });
  step(30000); assert.notStrictEqual(P.get('h').state, 'hung');
  step(40000); assert.strictEqual(P.get('h').state, 'hung');
  assert(/no news/.test(P.words(P.get('h'))));
  P.set('h', { signals: { tools: 2 } }); step(250);
  assert.notStrictEqual(P.get('h').state, 'hung');
  P.set('w', { kind: 'flow', state: 'wait', label: 'waiting for you', hungMs: 1000 });
  step(600000); assert.strictEqual(P.get('w').state, 'wait');
});

test('a state the caller knows (hung from its own watchdog, waiting for you) holds until it says run', () => {
  reset();
  P.set('fh', { pct: 40, state: 'hung' }); step(250);
  assert.strictEqual(P.get('fh').state, 'hung');
  P.set('fh', { pct: 45 }); step(250);
  assert.strictEqual(P.get('fh').state, 'hung', 'news alone does not clear a hung the caller set');
  P.set('fh', { pct: 50, state: 'run' }); step(250);
  assert.strictEqual(P.get('fh').state, 'run');
});

test('the same key starts fresh after it finished', () => {
  reset();
  P.set('k', { pct: 80 }); P.done('k');
  P.set('k', { pct: 5 });
  assert.strictEqual(Math.round(P.get('k').shown), 5);
});

test('the directors\' progress line is opt-in, directors only, and short (token frugality)', () => {
  const engines = require(path.join(__dirname, '..', 'engines.js'));
  const dir = { id: 'd', name: 'Three Director', engine: 'claude', mode: 'native', dock: 'three', threeTools: true };
  const chat = { id: 'c', name: 'Claude', engine: 'claude', mode: 'native' };
  const off = engines.buildPrompt(dir); const on = engines.buildPrompt({ ...dir, progressTag: true });
  assert(!/<progress/.test(off), 'off by default');
  assert(/<progress pct=/.test(on), 'on for a director that opted in');
  assert(!/<progress/.test(engines.buildPrompt({ ...chat, progressTag: true })), 'never for a plain chat');
  const tokens = Math.round((on.length - off.length) / 4);
  assert(tokens <= 35, `≈ ${tokens} tokens`);
  console.log(`     (the line costs ≈ ${tokens} tokens a message)`);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n     ${err.message}`); }
}
// the history is saved (debounced) for the next start
P._test.learn('reply:saved', { ms: 1200 });
setTimeout(() => {
  if (!(saved && saved['reply:saved'])) { failed += 1; console.log('FAIL the history is saved'); } else console.log('ok   the history is saved for the next start');
  console.log(`${tests.length + 1 - failed}/${tests.length + 1} passed`);
  process.exit(failed ? 1 : 0);
}, 600);
