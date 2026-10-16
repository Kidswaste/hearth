const assert = require('assert/strict');
const { EventEmitter } = require('events');
const { create, modelChecks, INTERVAL } = require('../engine-watch');
const I = require('../installs');
const W = require('../winpolish');
async function main() {
  assert.equal(I.semverOf('codex-cli 0.163.0-alpha.10.2'), '0.163.0-alpha.10.2');
  for (const [a, b] of [['0.163.0-alpha.10.2', '0.163.0-alpha.9.9'], ['0.163.0', '0.163.0-alpha.99'], ['0.164.0-alpha.1', '0.163.0'], ['1.0.0-beta', '1.0.0-alpha'], ['1.0.0-alpha.1', '1.0.0-alpha']]) {
    assert(I.cmp(a, b) > 0, `${a} > ${b}`); assert(I.cmp(b, a) < 0); assert.equal(I.cmp(a, a), 0);
  }
  const bin = 'C:\\Users\\Q\\AppData\\Local\\OpenAI\\Codex\\bin\\new\\codex.exe';
  const missing = W.codexRuntimeStatus(bin, { fs: { isFile: f => !f.endsWith('codex-code-mode-host.exe') } });
  assert.deepEqual(missing, { complete: false, missing: ['codex-code-mode-host.exe'] });
  assert.equal(W.codexRuntimeStatus('C:\\standalone\\codex.exe'), null);
  const cfg = { settings: { enginePaths: { codex: bin } }, agents: [{ id: 'astra', name: 'Astra', mode: 'native', engine: 'codex', model: 'gpt-6-astra', effort: 'max' }] };
  const data = [{ model: 'gpt-6-astra', hidden: true, supportedReasoningEfforts: [{ reasoningEffort: 'max' }], upgrade: 'future-model' }];
  const before = JSON.stringify(cfg); let clock = 1000, installs = 0, models = 0, offline = false, broken = false, emitted = 0;
  let gate;
  const monitor = create({ now: () => clock, getConfig: () => cfg, emit: () => emitted++, engines: {
    setEnginePaths: p => assert.deepEqual(p, cfg.settings.enginePaths),
    checkInstalls: async () => { installs++; if (gate) await gate; return { codex: { found: true, broken } }; },
    codexCapabilities: async args => { assert.deepEqual(args, { kind: 'models', refresh: true }); models++; if (offline) throw Error('offline'); return { data }; },
  } });
  let release; gate = new Promise(r => release = r);
  const first = monitor.check(), duplicate = monitor.check({ fresh: true });
  assert.equal(first, duplicate); release(); gate = null;
  let r = await first;
  assert.equal(installs, 1); assert.equal(models, 1); assert.equal(emitted, 1);
  assert.equal(r.watch.models.selections[0].status, 'listed');
  assert.equal(r.watch.models.selections[0].upgrade, 'future-model');
  await monitor.check(); assert.equal(installs, 1);
  clock += INTERVAL; await monitor.check(); assert.equal(installs, 2);
  cfg.agents[0].effort = 'ultra'; r = await monitor.check();
  assert.equal(r.watch.models.selections[0].status, 'unsupported-effort');
  cfg.agents[0].effort = 'max'; offline = true;
  r = await monitor.check(); assert.equal(r.watch.models.status, 'unavailable'); assert.equal(r.watch.models.selections.length, 0);
  offline = false; r = await monitor.check({ fresh: true }); assert.equal(r.watch.models.status, 'checked');
  broken = true; const count = models; r = await monitor.check({ fresh: true }); assert.equal(models, count); assert.equal(r.watch.models.status, 'runtime-unavailable');
  assert.equal(JSON.stringify(cfg), before, 'never change model, reasoning or program pins');
  assert.equal(modelChecks([], cfg.agents)[0].status, 'not-listed');
  assert.equal(modelChecks([{ model: 'gpt-6-astra' }], cfg.agents)[0].status, 'unknown');
  const events = new EventEmitter(), window = new EventEmitter(); let timerId = 0; const timers = new Map(); let schedule, stopped;
  const stop = monitor.start({ power: { every: (...args) => { schedule = args; }, stop: id => { stopped = id; } }, monitor: events, window,
    setTimer: (fn, ms) => { assert.equal(ms, 60000); timers.set(++timerId, fn); return timerId; }, clearTimer: id => timers.delete(id) });
  assert.equal(schedule[0], 'engine-health'); assert.equal(schedule[1], INTERVAL); assert.equal(schedule[3].first, 10000);
  const initial = installs; window.emit('focus'); await new Promise(setImmediate); assert.equal(installs, initial);
  events.emit('resume'); events.emit('resume'); assert.equal(timers.size, 1);
  [...timers.values()][0](); await new Promise(setImmediate); assert.equal(installs, initial + 1);
  stop(); assert.equal(stopped, 'engine-health'); assert.equal(events.listenerCount('resume'), 0); assert.equal(window.listenerCount('focus'), 0);
  const bad = create({ getConfig: () => { throw Error('unreadable config'); } }); await assert.rejects(bad.check(), /unreadable/);
  console.log('engine-watch: versions, helpers, model metadata, pins, offline recovery, deduplication, expiry, config changes and wake scheduling passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
