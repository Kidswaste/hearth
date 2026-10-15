const assert = require('assert/strict'); const fs = require('fs'); const os = require('os'); const path = require('path'); const { spawn } = require('child_process');
const { Pool } = require('../codex-server'); const { manage, skillInputs, record } = require('../codex-workspace');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-workspace-test-'));
const pool = new Pool({ spawn, kill: c => c.kill(), requestMs: 1500, idleMs: 1000 });
const o = { chatId: 'a', bin: process.execPath, args: [path.join(__dirname, 'fake-codex-server.js')], cwd: dir, env: { ...process.env, HEARTH_SERVER_TEST_DIR: dir }, session: { id: 'saved' }, thread: { sandbox: 'read-only', approvalPolicy: 'never' }, servers: [] };
const trace = () => fs.readFileSync(path.join(dir, 'trace.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const delay = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  try {
    const skills = await manage(pool, o, 'skills'); assert.equal(skills.data.length, 2);
    const conn = pool.connections.get('a');
    assert.deepEqual(await skillInputs(conn, dir, [{ name: 'demo-skill', path: '/demo/SKILL.md' }]), [{ type: 'skill', name: 'demo-skill', path: '/demo/SKILL.md' }]);
    await assert.rejects(skillInputs(conn, dir, [{ name: 'demo-skill', path: '/private/secret' }]), /no longer available/);
    await assert.rejects(skillInputs(conn, dir, [{ name: 'disabled', path: '/disabled/SKILL.md' }]), /no longer available/);
    assert.equal((await manage(pool, o, 'resources')).data[0].resources[0].uri, 'demo://brief');
    await assert.rejects(manage(pool, o, 'readResource', { server: 'demo', uri: 'file:///private' }), /no longer listed/);
    assert((await manage(pool, o, 'readResource', { server: 'demo', uri: 'demo://brief' })).contents[0].text.includes('<script>'));
    assert(!trace().some(t => t.method === 'turn/start'));
    console.log('✓ catalogs do not start turns; skills and resource URIs validated against live inventory');
    const fork = await manage(pool, o, 'fork'); assert.notEqual(fork.session.id, 'saved'); assert.equal(o.session.id, 'saved');
    const req = trace().find(t => t.method === 'thread/fork'); assert.equal(req.params.approvalPolicy, 'never'); assert.equal(req.params.sandbox, 'read-only'); assert.equal(req.params.config['mcp_servers.unrelated.enabled'], false);
    const compact = manage(pool, o, 'compact'); await delay(30);
    await assert.rejects(manage(pool, o, 'fork'), /current operation/);
    const rejected = []; pool.run({ ...o, turn: {}, parser: () => [], text: 'no' }, e => rejected.push(e)); assert.equal(rejected[0].type, 'error');
    assert.equal((await compact).compacted, true); assert(!pool.maintenance.size);
    console.log('✓ native fork keeps source and permissions; compaction waits for completion and excludes concurrent turns');
    const events = [];
    pool.run({ ...o, session: {}, turn: { skillMentions: [{ name: 'demo-skill', path: '/demo/SKILL.md' }] }, parser: () => [], text: 'test' }, e => events.push(e));
    for (let i = 0; i < 100 && !events.some(e => e.type === 'done'); i++) await delay(20);
    assert(events.some(e => e.type === 'done')); const input = trace().find(t => t.method === 'turn/start').params.input;
    assert(input.some(i => i.type === 'skill')); assert(!trace().find(t => t.method === 'turn/start').params.skillMentions);
    const activity = await manage(pool, o, 'activity'); assert.equal(activity.items.length, 1); assert.equal(activity.items[0].status, 'completed'); assert(activity.diff.includes('+hello'));
    assert(!JSON.stringify(activity).includes('aggregatedOutput'));
    for (let i = 0; i < 200; i++) record(pool, 'a', 'item/started', { item: { type: 'mcpToolCall', id: String(i), server: 'demo', tool: 'read', arguments: { secret: 'do-not-record' } } });
    assert.equal(activity.items.length, 150); assert(!JSON.stringify(activity).includes('do-not-record'));
    console.log('✓ skills arrive as native inputs; activity is bounded, correlated, and excludes raw arguments/results');
  } finally { pool.stopAll(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
