const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { normalize, AccountUsage } = require('../codex-usage');
const r = normalize({ rateLimits: { primary: { usedPercent: 90 } }, rateLimitsByLimitId: {
  codex: { primary: { usedPercent: 2, windowDurationMins: 10080, resetsAt: 1900000000 }, secondary: { usedPercent: 0 } },
  extra: { primary: { usedPercent: null } },
} }, 123);
assert.equal(r.checkedAt, 123); assert.equal(r.buckets[0].windows[0].remaining, 98);
assert.equal(r.buckets[0].windows[0].resetsAt, 1900000000000);
assert.equal(r.buckets[0].windows[1].remaining, 100);
assert.equal(r.buckets[0].windows[1].minutes, null);
assert.equal(r.buckets[1].windows.length, 0);
assert(!normalize({ rateLimits: { primary: { usedPercent: null } } }).available);
assert.equal(normalize({ rateLimits: { primary: { usedPercent: 123 } } }).buckets[0].windows[0].remaining, 0);
assert.equal(normalize({ rateLimitsByLimitId: {}, rateLimits: { primary: { usedPercent: 4 } } }).buckets[0].windows[0].remaining, 96);
assert.equal(normalize({ ordinaryUsageAllowed: false }).ordinaryUsageAllowed, false);
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-usage-test-'));
  const service = new AccountUsage({ spawn, kill: p => p.kill(), bin: process.execPath,
    args: [path.join(__dirname, 'fake-codex-server.js')], cwd: dir, env: { ...process.env, HEARTH_SERVER_TEST_DIR: dir } });
  try {
    const [a, b] = await Promise.all([service.read(), service.read()]);
    assert.equal(a.buckets[0].windows[0].remaining, 77); assert.deepStrictEqual(a, b);
    await service.read();
    const trace = fs.readFileSync(path.join(dir, 'trace.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(trace.filter(x => x.method === 'account/rateLimits/read').length, 1);
    assert(!trace.some(x => /^(thread|turn)\//.test(x.method || '')), 'Usage reads must never create a conversation or consume a model turn');
    service.close(); service.snapshot = null;
    service.options.bin = path.join(dir, 'not-installed');
    const failed = await service.read(); assert.equal(failed.available, false); assert.deepStrictEqual(failed.buckets, []);
    console.log('Account limits: buckets, missing vs zero, percentages, reset units, caching, concurrent reads, no model calls, and failure state passed.');
  } finally { service.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
