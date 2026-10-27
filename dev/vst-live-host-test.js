// (round 61, vstlive61) Live mode of the Serum 2 / Vital host, end to end without a sound card or the real plugins:
// creative-vstmain.js's pool spawns the REAL creative-vst-host.py, with dev/fixtures/fake-vst-py on PYTHONPATH standing
// in for Pedalboard (a sine instrument), sounddevice (a UA interface on ASIO + WASAPI, a real-time pulling 'device')
// and python-rtmidi (a controller that plays a note). Also the renderer's pure helpers (tools/workbench-vst-live.js).
//   node dev/vst-live-host-test.js        (needs python3 + numpy; says "skipped" plainly when they're missing)
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { spawnSync } = require('child_process');
const L = require('../tools/workbench-vst-live.js');
const { pool, jobOf } = require('../creative-vstmain');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 3000, what = 'condition') => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw Error('timed out waiting for ' + what); await sleep(25); } };
const out = { skipped: [], timings: {} };

// ---- 1. the renderer's helpers: picker order, preselection, remembered devices, readout, phrases
const ua = { devices: [
  { id: 0, name: 'Microsoft Sound Mapper - Output', api: 'MME' }, { id: 2, name: 'Monitor 1-2 (Universal Audio Thunderbolt WDM)', api: 'Windows WASAPI' },
  { id: 3, name: 'Speakers (Realtek(R) Audio)', api: 'Windows WASAPI' }, { id: 4, name: 'Universal Audio Thunderbolt', api: 'ASIO' }, { id: 5, name: 'ASIO4ALL v2', api: 'ASIO' }], preferred: 3, asio: true };
let o = L.options(ua);
assert.equal(o.preferred, '4', 'UA on ASIO is preselected');
assert.deepEqual(o.options.slice(0, 2).map(x => x[0]), ['4', '5'], 'ASIO first, UA first among them');
assert.equal(o.options[2][0], '2x', 'then WASAPI exclusive, UA first'); assert.match(o.options[2][1], /exclusive/);
assert.equal(o.options.at(-1)[0], '', 'system output last');
o = L.options({ ...ua, devices: ua.devices.filter(d => d.api !== 'ASIO'), asio: false });
assert.equal(o.preferred, '2x', 'no ASIO: the UA WASAPI endpoint in exclusive mode is preselected');
o = L.options({ devices: [{ id: 3, name: 'Speakers (Realtek(R) Audio)', api: 'Windows WASAPI' }], preferred: 3 });
assert.equal(o.preferred, '3', 'no UA: the Windows default (shared) as before');
assert.equal(L.options({}).preferred, '', 'nothing listed: system output');
assert.ok(!L.UA.test('Dual Speakers') && L.UA.test('UA Volt') && L.UA.test('Volt 2 (Universal Audio Volt 2)'), 'UA names');
assert.deepEqual(L.parse('12x'), { device: 12, exclusive: true }); assert.deepEqual(L.parse(''), { device: null, exclusive: false });
const saved = L.remember('2x', ua); assert.deepEqual(saved, { name: ua.devices[1].name, api: 'Windows WASAPI', exclusive: true });
assert.equal(L.resolve(saved, { devices: [{ id: 7, name: ua.devices[1].name, api: 'Windows WASAPI' }] }), '7x', 'a remembered device found under its new id');
assert.equal(L.resolve(saved, { devices: [] }), null);
assert.match(L.statsText({ playing: true, deviceName: 'Universal Audio Thunderbolt', api: 'ASIO', sampleRate: 48000, buffer: 64, latencyMs: 4.1, load: 12, underruns: 0, midi: { open: ['KeyLab'], events: 3 } }), /LIVE · Universal Audio Thunderbolt · ASIO · 48 kHz · 64 samples · ≈4 ms out · DSP 12 % · 0 underruns · MIDI in: KeyLab \(3\)/);
assert.match(L.statsText({ error: 'device lost' }), /Audio stopped: device lost/);
assert.match(L.advice({ playing: true, load: 95 }), /bigger buffer/); assert.equal(L.advice({ playing: false, load: 99 }), '');
for (const k of Object.keys(L.PHRASES)) { const x = L.phrase(k, 4); assert.ok(x.notes.length && x.loop > 0 && x.notes.every(n => n.time < x.loop && n.note >= 0 && n.note <= 127), 'phrase ' + k); }
const hub = L.hub(); let got = 0; const off = hub.on('x', () => { got++; }); hub.on('x', () => { throw Error('a broken listener'); }); const warn = console.warn; console.warn = () => {}; hub.emit('x'); off(); hub.emit('x'); console.warn = warn; assert.equal(got, 1, 'event hub: on / off, a throwing listener is contained');
// the main process's field whitelist
assert.throws(() => jobOf({ action: 'values', keys: 'level' }), /512/); assert.throws(() => jobOf({ action: 'sequence', sequence: Array(300).fill({}) }), /256/);
const j = jobOf({ action: 'open', plugin: 'x', live: true, exclusive: 'yes', extra: 'dropped' }, 'Vital'); assert.equal(j.live, true); assert.equal(j.exclusive, undefined); assert.equal('extra' in j, false);
out.helpers = 'picker order / UA preselection / remembered device / readout / phrases / hub / whitelist passed';

// ---- 2. the real host with fake Pedalboard / sounddevice / rtmidi
const py = spawnSync('python3', ['-c', 'import numpy, sys; print(sys.executable)'], { encoding: 'utf8' }); const PY = (py.stdout || '').trim();
if (py.status !== 0) { out.skipped.push('host part: python3 with numpy not found here'); console.log(JSON.stringify(out, null, 1)); process.exit(0); }
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-vst-live-'));
  const root = path.join(temp, 'plugins'); fs.mkdirSync(path.join(root, 'Vital.vst3'), { recursive: true }); fs.mkdirSync(path.join(root, 'Serum2.vst3'));
  const pbLog = path.join(temp, 'midi.jsonl');
  Object.assign(process.env, { PYTHONPATH: path.join(__dirname, 'fixtures', 'fake-vst-py'), FAKE_PB_LOG: pbLog, FAKE_PB_PARAMS: '2000', FAKE_EDITOR_S: '1', PYTHONDONTWRITEBYTECODE: '1' });
  delete process.env.HEARTH_VST_ASIO;
  let host;
  try {
    host = pool({ dataDir: temp, python: PY, roots: [root] });
    let t0 = Date.now(); const status = await host.status(); assert.ok(status.ok, status.error); assert.match(status.version, /fake/); out.timings.hostStartMs = Date.now() - t0;
    const plugins = host.scan().plugins; assert.deepEqual(plugins.map(p => p.name), ['Serum 2', 'Vital']);
    const vital = plugins[1], serum = plugins[0];
    const V = (action, extra = {}) => host.request({ action, plugin: vital.path, name: 'Vital', ...extra });
    // device list: ASIO present because the host was spawned with SD_ENABLE_ASIO; the controller listed
    const devices = await V('devices'); assert.ok(devices.ok, devices.error);
    assert.equal(devices.asio, true, 'ASIO host API loaded'); assert.equal(devices.asioDll, true);
    assert.deepEqual(devices.midiInputs, ['Fake Keys']); assert.equal(devices.midiBackend, 'rtmidi');
    const picked = L.options(devices), asioId = devices.devices.find(d => d.api === 'ASIO').id;
    assert.equal(picked.preferred, String(asioId), 'the UA ASIO device is preselected from the real host answer');
    // open = load + live start in one step; the stats of the live stream come back at once
    t0 = Date.now(); const opened = await V('open', { live: true, ...L.parse(picked.preferred), buffer: 128, gain: .2, midiIn: 'all' }); out.timings.openToLiveMs = Date.now() - t0;
    assert.ok(opened.ok, opened.error); assert.equal(opened.playing, true); assert.equal(opened.api, 'ASIO'); assert.equal(opened.buffer, 128); assert.equal(opened.sampleRate, 48000);
    assert.equal(opened.depth, 2, '~5 ms ahead at 128 samples = 2 blocks'); assert.ok(opened.latencyMs < 12, 'latency ' + opened.latencyMs);
    assert.ok(out.timings.openToLiveMs < 3000, 'open → live in ' + out.timings.openToLiveMs + ' ms');
    // first note over the no-reply stream: sound within a few blocks
    t0 = Date.now(); assert.equal(host.send({ action: 'midi', plugin: vital.path, note: 60, on: true, velocity: 100 }).ok, true);
    await until(async () => (await V('live-status')).peak > 0.01, 2000, 'the note to sound'); out.timings.noteToSoundMs = Date.now() - t0;
    host.send({ action: 'midi', plugin: vital.path, note: 60, on: false });
    // the controller plays straight into the plugin, inside the host
    const midi = await until(async () => { const s = await V('live-status'); return s.midi.events >= 2 && s; }, 3000, 'controller events');
    assert.deepEqual(midi.midi.open, ['Fake Keys']); assert.ok(fs.readFileSync(pbLog, 'utf8').includes('[144, 64, 100]'), 'controller note reached the plugin');
    assert.ok(!fs.readFileSync(pbLog, 'utf8').includes('[248'), 'clock / realtime messages filtered');
    // streamed knob move, read back fresh; a bad streamed patch is counted, a bad requested patch answered
    host.send({ action: 'patch', plugin: vital.path, parameters: { level: .8 } });
    await until(async () => { const r = await V('values', { keys: ['level'] }); return r.ok && Math.abs(r.values.level.value - .8) < 1e-6; }, 1000, 'streamed patch');
    host.send({ action: 'patch', plugin: vital.path, parameters: { nope: 1 } }); await until(async () => (await V('live-status')).streamErrors === 1, 1000, 'stream error count');
    assert.equal((await V('patch', { parameters: { level: 7 } })).ok, false);
    // reading 2,000 controls keeps the stream playing (per-control lock)
    let before = await V('live-status'); t0 = Date.now(); const info = await V('inspect'); out.timings.inspect2000Ms = Date.now() - t0;
    assert.ok(info.ok, info.error); assert.ok(info.parameters.length > 2000); let after = await V('live-status');
    assert.equal(after.playing, true, 'still live after reading the controls'); assert.ok(after.blocks > before.blocks);
    out.underrunsDuringInspect = after.underruns - before.underruns;
    // a phrase played by the host, sample-accurate (notes 0.25 s apart = 12,000 samples at 48 kHz)
    fs.writeFileSync(pbLog, '');
    const arp = L.phrase('arp', 4); assert.ok((await V('sequence', { sequence: arp.notes, loop: arp.loop })).ok);
    await sleep(700); assert.ok((await V('sequence', { sequence: [] })).ok);
    const ons = fs.readFileSync(pbLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.msg[0] === 144);
    assert.ok(ons.length >= 2, 'phrase notes played'); const at = e => e.call * e.frames + e.offset;
    assert.equal(at(ons[1]) - at(ons[0]), 12000, 'sample-accurate phrase timing'); assert.ok(ons.some(e => e.offset > 0), 'notes land inside blocks, not on their edges');
    // the native editor holds the host's main thread; audio and notes carry on; its knob change is read back after
    before = await V('live-status'); assert.ok((await V('editor')).ok);
    await sleep(300); host.send({ action: 'midi', plugin: vital.path, note: 67, on: true }); await sleep(300);
    const during = await V('live-status'); assert.equal(during.editorOpen, true); assert.ok(during.blocks > before.blocks + 20, 'audio keeps running with the editor open');
    host.send({ action: 'midi', plugin: vital.path, note: 67, on: false });
    // (round 64, vstembed64) the editor now lives in the Sound desk: a snapshot runs off the main thread while it is open
    assert.equal((await V('snapshot')).ok, true, 'a patch snapshot works with the editor open (round 64; was refused before)');
    await until(async () => (await V('live-status')).editorCloses === 1, 3000, 'editor to close');
    assert.equal((await V('values', { keys: ['macro_0'] })).values.macro_0.value, .9, 'the editor\'s knob change is visible');
    // preset recall while live, then an offline bounce (pauses, then resumes on the same device)
    const snap = await V('snapshot'); assert.ok(snap.ok); assert.ok((await V('snapshot', { state: snap.state })).ok); assert.equal((await V('live-status')).playing, true, 'still live after a preset recall');
    const render = await V('render', { duration: .5, notes: [{ note: 60, time: 0, length: .2 }] }); assert.ok(render.ok, render.error);
    assert.equal(Buffer.from(render.audio, 'base64').subarray(0, 4).toString(), 'RIFF'); const resumed = await V('live-status'); assert.equal(resumed.playing, true); assert.equal(resumed.device, asioId); assert.equal(resumed.buffer, 128);
    // same settings again: nothing restarts; another buffer: the stream restarts with it; bad values refused
    const blocks = (await V('live-status')).blocks; const same = await V('live-start', { device: asioId, buffer: 128, gain: .1 }); assert.ok(same.blocks >= blocks, 'same settings: no restart'); assert.ok(Math.abs(same.gain - .1 * require('../volumemain').get()) < 1e-9, `monitor .1 × Hearth's playback volume (${require('../volumemain').get()}): ${same.gain}`); // (sweep69) the host plays at monitor × the master playback volume (75 % by default, volumemain.js), once
    const bigger = await V('live-start', { device: asioId, buffer: 256, gain: .1 }); assert.equal(bigger.buffer, 256); assert.equal(bigger.depth, 1);
    assert.match((await V('live-start', { buffer: 100 })).error, /64, 128, 256, 512 or 1024/);
    const wasapi = devices.devices.find(d => d.api === 'Windows WASAPI' && /Universal Audio/.test(d.name)).id, mme = devices.devices.find(d => d.api === 'MME').id;
    const excl = await V('live-start', { device: wasapi, exclusive: true, buffer: 64, gain: .1 }); assert.ok(excl.ok, excl.error); assert.equal(excl.exclusive, true); assert.equal(excl.api, 'Windows WASAPI'); assert.equal(excl.depth, 4);
    assert.match((await V('live-start', { device: mme, exclusive: true, buffer: 64 })).error, /Exclusive mode is a WASAPI option/);
    // a second instrument gets its own host; starting it stops Vital's stream (one device user at a time), not Vital
    const S = (action, extra = {}) => host.request({ action, plugin: serum.path, name: 'Serum 2', ...extra });
    assert.ok((await V('live-start', { device: asioId, buffer: 128, gain: .1 })).playing);
    const s2 = await S('open', { live: true, device: asioId, buffer: 128, gain: .1 }); assert.ok(s2.ok, s2.error); assert.equal(s2.playing, true); assert.equal(host.hosts, 2, 'one process per open instrument');
    assert.equal((await V('live-status')).playing, false, 'Vital paused when Serum 2 went live'); t0 = Date.now(); assert.ok((await V('open', { live: true, device: asioId, buffer: 128 })).playing); out.timings.switchBackMs = Date.now() - t0;
    assert.ok(out.timings.switchBackMs < 1000, 'switching back to a loaded instrument is quick: ' + out.timings.switchBackMs + ' ms');
    // the allowlist and scope still hold
    assert.equal((await host.request({ action: 'open', plugin: '/elsewhere/Vital.vst3', name: 'Vital' })).ok, false);
    assert.equal(host.send({ action: 'editor', plugin: vital.path }).ok, false, 'only notes / knobs / volume / panic / phrases travel on the stream');
    assert.equal((await V('live-status')).editorOpen, false);
    // clean stop
    const stopped = await V('live-stop'); assert.equal(stopped.playing, false); assert.deepEqual(stopped.midi.open, [], 'controller released on stop');
    host.stop(); await sleep(300);
    assert.equal(fs.readdirSync(path.join(temp, 'creative-vst')).filter(p => p.startsWith('session-')).length, 0, 'session folders removed');
    // HEARTH_VST_ASIO=0: no ASIO DLL, WASAPI still listed
    process.env.HEARTH_VST_ASIO = '0'; host = pool({ dataDir: temp, python: PY, roots: [root] }); host.scan();
    const plain = await host.request({ action: 'devices' }); assert.ok(plain.ok, plain.error); assert.equal(plain.asio, false); assert.equal(plain.asioDll, false); assert.equal(L.options(plain).preferred, String(wasapi) + 'x');
    host.stop(); await sleep(200);
    out.result = 'Live host: ASIO listed + UA preselected, open→live, streamed notes / knobs, controller in-host, live control reads, sample-accurate phrases, editor not blocking audio, preset recall + bounce resume, restarts, exclusive WASAPI, one host per instrument, clean stop passed.';
    console.log(JSON.stringify(out, null, 1));
  } finally { host?.stop(); delete process.env.HEARTH_VST_ASIO; await sleep(200); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
