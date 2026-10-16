const assert = require('assert/strict');
const fs = require('fs'); const vm = require('vm');
const agent = { id: 'astra', name: 'Astra', mode: 'native', engine: 'codex' };
let report = { codex: { engine: 'codex', label: 'Codex', found: true, version: '0.163.0', semver: '0.163.0', copies: [] },
  watch: { checkedAt: Date.now(), models: { status: 'checked', selections: [{ name: 'Astra', model: 'gpt-6-astra', effort: 'max', status: 'listed' }], catalog: [{ model: 'gpt-6-astra' }] } } };
const context = { window: { hub: { engineInstalls: async () => report, onEngineInstalls: () => {}, ffmpegStatus: async () => null } },
  document: { readyState: 'loading', addEventListener: () => {} }, H: { agents: () => [agent] }, Native: { hooks: { message: [] } },
  store: { get: (_, fallback) => fallback, set: () => {} }, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../engine-health'), 'utf8') + '\nthis.health = EngineHealth;', context);
(async () => {
  let text = await context.health.runDoctor('');
  assert.match(text, /Automatic checks/); assert.match(text, /gpt-6-astra/); assert.match(text, /max/);
  assert.match(text, /not a check for the newest release on the internet/);
  assert.match(text, /listing is not an account access test/);
  assert.equal(context.health.problems(report).length, 0);
  report.watch.models = { status: 'unavailable', selections: [], catalog: [] };
  text = await context.health.runDoctor(''); assert.match(text, /could not verify now/); assert.doesNotMatch(text, /listed with this reasoning/);
  report.codex.broken = true; report.codex.runtime = { complete: false, missing: ['codex-code-mode-host.exe'] };
  assert.match(context.health.problems(report)[0].text, /missing codex-code-mode-host.exe/);
  report.watch.models = { status: 'checked', selections: [{ name: 'Astra', model: 'retired', effort: 'max', status: 'not-listed' }], catalog: [] };
  assert(context.health.problems(report).some(p => p.action === 'doctor' && p.text.includes('retired')));
  console.log('engine-health: diagnostics report timestamps, model choices, unknown state and missing helper fixes correctly');
})().catch(e => { console.error(e); process.exitCode = 1; });
