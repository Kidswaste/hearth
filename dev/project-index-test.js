const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Worker } = require('node:worker_threads');
const C = require('../projects-core'), S = require('../sync-merge');
const { compactRead } = require('../project-index-maintenance');
const ref = 'C:/PC/data/captures/still.png';
const item = { id: 'capture:' + ref, type: 'capture', ref, name: 'A saved still', at: 123 };
const seed = () => ({ v: 1, list: [{ ...C.create({ id: 'p1', name: 'Keep me', notes: 'Keep my note' }), items: [{ ...item }, { ...item }, { ...item, name: 'A different label' }] }], dismissed: ['keep'], extension: { untouched: true } });
const input = seed(), compact = C.compact(input);
assert.equal(input.list[0].items.length, 3);
assert.equal(compact.list[0].items.length, 2);
assert.equal(compact.list[0].items[1].name, 'A different label');
assert.deepEqual(compact.extension, input.extension);
assert.equal(C.compact(compact), compact);
assert.equal(C.compact({ v: 99, list: input.list }).v, 99);
const windows = { dataDir: 'C:/PC/data', cloudRoot: 'C:/Cloud', home: 'C:/PC', win: true };
const mac = { dataDir: '/Users/me/data', cloudRoot: '/Cloud', home: '/Users/me', win: false };
let cloud = S.toCloud({ ...input, list: [{ ...input.list[0], items: [item] }] }, windows);
assert.equal(cloud.list[0].items[0].id, 'capture:hearth-data:/captures/still.png');
for (let i = 0; i < 20; i++) {
  const a = S.fromCloud(cloud, windows), b = S.fromCloud(cloud, mac);
  // Normal renderer normalization used to rewrite only one side's embedded path ID.
  const left = S.toCloud(C.normalize(a), windows), right = S.toCloud(C.normalize(b), mac);
  cloud = S.merge3(cloud, left, right).value;
  assert.equal(cloud.list[0].items.length, 1);
}
const old = seed(); old.list[0].items[1].id = 'capture:/Users/me/data/captures/still.png';
assert.equal(S.toCloud(old, windows).list[0].items.length, 2); // identical entry collapses, differing label stays
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-project-index-'));
const file = path.join(dir, 'projects.json');
fs.writeFileSync(file, JSON.stringify(input));
const source = fs.readFileSync(file), before = fs.statSync(file);
const result = compactRead(fs, file, { state: 'ok', from: 'file', value: input }, before);
assert.equal(result.value.list[0].items.length, 2);
const backups = fs.readdirSync(path.join(dir, '.project-recovery'));
assert.equal(backups.length, 1);
assert.deepEqual(fs.readFileSync(path.join(dir, '.project-recovery', backups[0])), source);
assert.equal(JSON.parse(fs.readFileSync(file)).list[0].items.length, 2);
const recovered = { state: 'ok', from: 'prev', value: input };
assert.equal(compactRead(fs, file, recovered, fs.statSync(file)), recovered);
const raceStamp = fs.statSync(file); fs.appendFileSync(file, ' ');
assert.throws(() => compactRead(fs, file, { state: 'ok', from: 'file', value: input }, raceStamp), /changed/);
const raceBytes = fs.readFileSync(file);
const failingFs = new Proxy(fs, { get(t, k) { return k === 'copyFileSync' ? () => { throw Error('backup unavailable'); } : t[k]; } });
assert.throws(() => compactRead(failingFs, file, { state: 'ok', from: 'file', value: input }, fs.statSync(file)), /backup unavailable/);
assert.deepEqual(fs.readFileSync(file), raceBytes);
async function run() {
  const large = seed(); large.list[0].items = Array.from({ length: 409600 }, () => ({ ...item }));
  fs.writeFileSync(file, JSON.stringify(large));
  const worker = new Worker(path.join(__dirname, '../storework.js'));
  try {
    const r = await new Promise((resolve, reject) => { worker.once('error', reject); worker.once('message', resolve); worker.postMessage({ id: 1, op: 'read', file, ds: true }); });
    assert.ok(!r.err, r.err); assert.equal(r.res.value.list[0].items.length, 1);
    assert.ok(JSON.stringify(r.res).length < 2000, 'large index compacted before IPC');
    assert.equal(JSON.parse(fs.readFileSync(file)).list[0].items.length, 1);
    console.log(JSON.stringify({ pass: true, duplicateEntries: 409600, workerResultBytes: JSON.stringify(r.res).length, workerMs: Math.round(r.ms), syncRoundTrips: 20, backupPreserved: true, conflictsPreserved: true, concurrentEditProtected: true }));
  } finally { await worker.terminate(); }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
