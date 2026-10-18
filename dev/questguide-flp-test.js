const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('../questguide-flp');
const M = require('../questguidemain');
function fixture({ bpm = 132, name = 'Bass', count = 3, modern = false } = {}) {
  const chunks = [];
  function event(id, data) {
    let b;
    if (id < 64) b = Buffer.from([id, data]);
    else if (id < 128) { b = Buffer.alloc(3); b[0] = id; b.writeUInt16LE(data, 1); }
    else if (id < 192) { b = Buffer.alloc(5); b[0] = id; b.writeUInt32LE(data, 1); }
    else { const len = []; let n = data.length; do { len.push((n & 127) | (n > 127 ? 128 : 0)); n = Math.floor(n / 128); } while (n); b = Buffer.concat([Buffer.from([id, ...len]), data]); }
    chunks.push(b);
  }
  event(199, Buffer.from(modern ? '26.1.4.5589\0' : '24.1.0.0\0'));
  if (modern) { chunks.push(Buffer.from([172, 1, 1, 0])); event(192, Buffer.from('FL Studio 26.1.4.5589.5589\0', 'utf16le')); }
  event(156, bpm * 1000); event(64, 0); event(0, 1); event(203, Buffer.from(`${name}\0`, 'utf16le'));
  const notes = Buffer.alloc(count * 24);
  for (let i = 0; i < count; i++) { notes.writeUInt32LE(17 + i * 97, i * 24); notes.writeUInt16LE(0, i * 24 + 6); notes.writeUInt32LE(71, i * 24 + 8); notes.writeUInt16LE(35 + i, i * 24 + 12); notes[i * 24 + 21] = 100; }
  event(224, notes); event(236, Buffer.alloc(12)); event(203, Buffer.from('Master compressor\0', 'utf16le'));
  const body = Buffer.concat(chunks), header = Buffer.alloc(22); header.write('FLhd'); header.writeUInt32LE(6, 4); header.writeUInt16LE(1, 10); header.writeUInt16LE(96, 12); header.write('FLdt', 14); header.writeUInt32LE(body.length, 18);
  return Buffer.concat([header, body]);
}
(async () => {
  const parsed = F.parse(fixture());
  assert.equal(parsed.bpm, 132); assert.equal(parsed.channels[0].name, 'Bass'); assert.equal(parsed.channels[0].notes, 3);
  const modern = F.parse(fixture({ modern: true, bpm: 95 }));
  assert.equal(modern.bpm, 95, 'FL 2026 three-byte event keeps the tempo aligned');
  assert.equal(modern.channels[0].notes, 3); assert.equal(modern.channels[0].name, 'Bass');
  assert.throws(() => F.parse(fixture().subarray(0, 70)), /complete/);
  const actual = 'C:/Program Files/Image-Line/FL Studio 2026/Data/Demo projects/Demo songs/Asher Postman - Future House.flp';
  let factory = null;
  if (fs.existsSync(actual)) { const s = F.parse(fs.readFileSync(actual)); assert.equal(s.bpm, 126); assert.ok(s.channels.some(c => c.name === 'Bass Layer' && c.notes === 32)); factory = { name: path.basename(actual), bpm: s.bpm, bassNotes: s.channels.find(c => c.name === 'Bass Layer').notes }; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-flp-')); const file = path.join(dir, 'My idea.flp'); let now = Date.now();
  fs.writeFileSync(file, fixture({ count: 0, modern: true })); fs.utimesSync(file, new Date(now - 10000), new Date(now - 10000));
  let chosen = file;
  const api = M.create({ dataDir: dir, localDir: dir, now: () => now, pollRunning: async () => false, ui: { chooseProject: async () => chosen } });
  try {
    await api.call({ op: 'start', questId: 'saved-song', steps: [{ id: 'tempo', check: 'bpm', targetBpm: 132 }, { id: 'bass', check: 'bass' }] });
    await api.call({ op: 'choose-project' }); await api.poll();
    assert.equal(api.state().completed, 0, 'choosing an old project is not new progress');
    assert.equal(api.state().project.path, file); assert.equal(api.state().project.bpm, 132);
    const bad = path.join(dir, 'broken.flp'); fs.writeFileSync(bad, 'not a project'); chosen = bad;
    await assert.rejects(() => api.call({ op: 'choose-project' }), /complete supported/);
    assert.equal(api.state().project.path, file, 'failed replacement keeps the working connection');
    now += 3000; fs.utimesSync(file, new Date(now), new Date(now)); await api.poll();
    assert.equal(api.state().completed, 1, 'save verifies tempo without a MIDI device');
    now += 3000; fs.writeFileSync(file, fixture()); fs.utimesSync(file, new Date(now), new Date(now)); await api.poll();
    assert.equal(api.state().completed, 2, 'saved off-grid piano-roll notes verify bass');
    assert.equal(api.state().session.done[1].source, 'flp-save');
    assert.equal(fs.readFileSync(file).equals(fixture()), true, 'observer never modifies FL projects');
    await api.call({ op: 'pause' }); chosen = file;
    await api.call({ op: 'choose-project' });
    assert.equal(api.state().project.bpm, 132, 'paused guide still previews the selected project');
  } finally { api.dispose(); }
  console.log(JSON.stringify({ pass: true, factory, checks: 'saved tempo, off-grid piano-roll notes, channel ownership, stale saves, truncation, actual main-process auto-check' }));
})().catch(e => { console.error(e); process.exitCode = 1; });
